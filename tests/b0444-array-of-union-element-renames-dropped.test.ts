import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import { renderSystemPrompt } from "../src/parser/system-interpolation";
import { brandSchemaValue } from "../src/runtime/value";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0444
// (docs/bugs/0444-array-of-union-element-renames-dropped.md).
//
// An `array<T>`-typed `system:` param whose ELEMENT is a union of renamed
// schemas — `xs: 'array<Cat | Dog>'`, and the alias spelling `xs: 'array<UU>'`
// where `schema UU = Cat | Dog` — renders every element THETA-SIDE. The array
// element classifier (`namedSchemaOf`, frontmatter.ts) recognises neither a
// union source nor a union alias, so the array param carries no translation
// data and the render's array row serialises the value unchanged. This
// violates the unconditional recursive-translation clause for the `array<T>`
// row and the no-theta-side-names rule:
//   docs/spec_topics/query/query-escapes-stringification.md:26
//     (the `array<T>` row: compact JSON.stringify "with wire-name translation
//      applied recursively" — no clause conditions on element shape), and
//   docs/spec_topics/query/query-escapes-stringification.md:36
//     ("the theta-side names an author writes never appear in the rendered
//      prompt").
// The value-driven note (:35) does NOT govern this param: its untranslated
// classes are union ARMS and opaque VALUES; `array<Cat | Dog>`'s static type
// is `array<T>`, which has its own table row. See bug doc §Kind.
//
// Expected disposition per element mirrors bug 0425's per-arm machinery
// (`unionArmObjectType` / `buildSystemUnionArms`), applied PER ELEMENT: pick
// the arm by schema brand, else by exact field set + literal discriminator;
// an element matching no arm keeps untranslated bytes (never guess). A single
// unmatched element must not un-translate its siblings (§Fix constraint).
//
// Harness: `parseDoc` + `renderSystemPrompt` — unit/offline/provider-free,
// deterministic (no wire, no child spawn, no model), mirroring
// tests/b0425-union-of-schemas-arm-renames-dropped.test.ts. This is the
// registering-document spawn-site call pair; the seam is reachable with no
// higher tier. W1–W4 are RED-for-the-symptom (theta-side names rendered);
// G1/G2 are byte-identity controls, green before AND after the fix.

describe("bug 0444 — array-of-union element renames dropped in system render", () => {
  // W1 (RED) — `array<Cat | Dog>` with one Cat element: the element's renames
  // (kind→K, name→N) must apply per element. Fork renders theta-side
  // `[{"kind":"cat","name":"Tom"}]` — RED.
  it("W1: array<Cat | Dog> translates a Cat element per its arm renames", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<Cat | Dog>'
---
schema Cat { kind as "K": string, name as "N": string }
schema Dog { kind as "K": string, breed as "B": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { xs: [{ kind: "cat", name: "Tom" }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: [{"K":"cat","N":"Tom"}]');
  });

  // W2 (RED) — the alias spelling: `array<UU>` where `schema UU = Cat | Dog`.
  // Resolving the alias terminates in a union needing the arm pick, not a
  // sidecar map; the classifier funnels into the fields-undefined refusal, so
  // the element renders theta-side `[{"kind":"cat","name":"Tom"}]` — RED.
  it("W2: array<UU> (union alias element) translates the element per its arm", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<UU>'
---
schema Cat { kind as "K": string, name as "N": string }
schema Dog { kind as "K": string, breed as "B": string }
schema UU = Cat | Dog
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { xs: [{ kind: "cat", name: "Tom" }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: [{"K":"cat","N":"Tom"}]');
  });

  // W3 (RED, heterogeneous) — a mixed element list: a Cat element and a Dog
  // element must each translate by ITS OWN arm (Cat: kind→K,name→N; Dog:
  // kind→K,breed→B). Witnesses the §Fix "heterogeneous element list translates
  // each element independently" constraint. Fork renders both theta-side —
  // RED.
  it("W3: heterogeneous Cat+Dog list translates each element independently", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<Cat | Dog>'
---
schema Cat { kind as "K": string, name as "N": string }
schema Dog { kind as "K": string, breed as "B": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: {
        xs: [
          { kind: "cat", name: "Tom" },
          { kind: "dog", breed: "pug" },
        ] as unknown as ThetaValue,
      },
    });
    expect(r.ok && r.text).toBe('P: [{"K":"cat","N":"Tom"},{"K":"dog","B":"pug"}]');
  });

  // W4 (RED, one-unmatched-must-not-untranslate-siblings) — §Fix constraint,
  // decided and witnessed explicitly: the 2nd element (`{mystery:"z"}`)
  // matches NO arm and keeps untranslated bytes (never guess), but the 1st
  // (Cat) MUST still translate. Fork renders BOTH theta-side — RED. After the
  // fix the Cat element translates while the unmatched sibling stays byte-for-
  // byte.
  it("W4: one unmatched element stays untranslated but does not un-translate its sibling", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<Cat | Dog>'
---
schema Cat { kind as "K": string, name as "N": string }
schema Dog { kind as "K": string, breed as "B": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: {
        xs: [
          { kind: "cat", name: "Tom" },
          { mystery: "z" },
        ] as unknown as ThetaValue,
      },
    });
    expect(r.ok && r.text).toBe('P: [{"K":"cat","N":"Tom"},{"mystery":"z"}]');
  });

  // W5 (RED→GREEN) — a mixed `array<Cat | string>`: a Cat OBJECT element
  // translates per its arm (kind→K, name→N), while a bare STRING element
  // matches no arm and must stay VALID quoted JSON `"foo"` inside the array.
  // Routing the scalar element through its scalar interpolation row would emit
  // an unquoted `foo`, producing invalid JSON `[{...},foo]`; the unmatched
  // element must keep its untranslated JSON bytes (byte-identical to the
  // whole-array JSON.stringify path). Locks F1.
  it("W5: array<Cat | string> translates the Cat element and keeps the string valid JSON", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<Cat | string>'
---
schema Cat { kind as "K": string, name as "N": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: {
        xs: [{ kind: "cat", name: "Tom" }, "foo"] as unknown as ThetaValue,
      },
    });
    expect(r.ok && r.text).toBe('P: [{"K":"cat","N":"Tom"},"foo"]');
  });

  // W6 (brand pick per element) — both arms share the field set {x} with no
  // literal discriminator, so only the SCHEMA BRAND disambiguates. The first
  // element is `Cat`-branded and translates via `P`; the second element carries
  // the same field set unbranded, so both arms admit it — ambiguous, so it
  // stays untranslated (never guess). Witnesses brand-first per-element pick
  // and the never-guess disposition for the unbranded ambiguous sibling.
  it("W6: branded Cat element picks its arm; unbranded ambiguous sibling stays untranslated", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<Cat | Dog>'
---
schema Cat { x as "P": string }
schema Dog { x as "Q": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: {
        xs: [
          brandSchemaValue({ x: "v" as ThetaValue }, "Cat") as unknown as ThetaValue,
          { x: "w" },
        ] as unknown as ThetaValue,
      },
    });
    expect(r.ok && r.text).toBe('P: [{"P":"v"},{"x":"w"}]');
  });

  // G1 (CONTROL, green both) — a single-schema `array<Cat>` element stays on
  // the existing one-sidecar path byte-identically (§Fix "b0407 stays green").
  // Already green at the fork; guards byte-identity of the single-schema path.
  it("G1 (control): array<Cat> single-schema element stays byte-identical", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<Cat>'
---
schema Cat { kind as "K": string, name as "N": string }
schema Dog { kind as "K": string, breed as "B": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { xs: [{ kind: "cat", name: "Tom" }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: [{"K":"cat","N":"Tom"}]');
  });

  // G2 (CONTROL, green both) — an empty `array<Cat | Dog>` renders `[]` with
  // no elements to translate; must stay `[]` before and after the fix.
  it("G2 (control): empty array<Cat | Dog> renders []", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<Cat | Dog>'
---
schema Cat { kind as "K": string, name as "N": string }
schema Dog { kind as "K": string, breed as "B": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { xs: [] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: []');
  });
});
