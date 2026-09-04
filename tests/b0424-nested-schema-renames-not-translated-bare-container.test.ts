import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import { renderSystemPrompt } from "../src/parser/system-interpolation";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0424
// (docs/bugs/0424-nested-schema-renames-not-translated-bare-container.md).
//
// WHY: `buildOutboundSidecars` carries only the ROOT schema's own flat
// renames, so a rename one level down — a schema-typed field's own `as`
// clause — renders theta-side on a bare-container `system:` interpolation.
// This violates the recursive-translation contract of
// docs/spec_topics/query/query-escapes-stringification.md:26–27 ("with
// wire-name translation applied **recursively**", for BOTH the `array<T>` and
// Schema-typed object rows) and :34 ("the theta-side names an author writes
// never appear in the rendered prompt"). The author-written theta-side name
// `deep` must NOT reach the rendered prompt; its wire name is `D`.
//
// Harness mirrors b0407: `parseDoc` + `renderSystemPrompt` (the spawn-site
// call pair), offline and deterministic. The render input carries theta-side
// keys (`deep`); the expected output carries the wire name (`D`).
//
// Bodies below declare a nested schema so the rename lives at depth 1:
//   schema Inner { deep as "D": string }
//   schema Outer { inner: Inner, top as "T": string }
// The root rename `top`→`"T"` IS applied by the fork; the nested `deep`→`"D"`
// is not — that is the defect these cells lock.

const NESTED_BODY = `schema Inner { deep as "D": string }
schema Outer { inner: Inner, top as "T": string }
let x = 1`;

describe("bug 0424 — nested schema renames not translated on a bare `system:` container render", () => {
  // W1 (doc §Reproduction row 1) — one prompt renders the SAME nested object
  // two ways: `${p}` must apply the nested `deep`→`"D"` recursively (fork
  // leaves it theta-side), while `${p.inner}` already renders `{"D":"x"}`.
  it("W1: `${p}` applies the nested `deep`→`\"D\"` rename recursively (two faces, one prompt)", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'A \${p} B \${p.inner}'
params:
  p: Outer
---
${NESTED_BODY}`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl, "the schema-typed `system:` template registers").toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { inner: { deep: "x" }, top: "y" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('A {"inner":{"D":"x"},"T":"y"} B {"D":"x"}');
  });

  // W2 (doc §Reproduction row 2) — an `array<Outer>` element must apply the
  // nested `deep`→`"D"` recursively inside the array. Fork renders `deep`.
  it("W2: `array<Outer>` applies the nested rename inside each element", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'T \${team}'
params:
  team: 'array<Outer>'
---
${NESTED_BODY}`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { team: [{ inner: { deep: "x" }, top: "y" }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('T [{"inner":{"D":"x"},"T":"y"}]');
  });

  // W3 (doc §Reproduction row 3) — an inline-object param with a schema-typed
  // field must translate that field's nested rename. `inlineObjectType`
  // produces no sidecars, so the fork renders `deep`.
  it("W3: inline-object param with a schema-typed field applies the nested rename", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'I \${p}'
params:
  p: '{inner: Inner}'
---
schema Inner { deep as "D": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { inner: { deep: "x" } } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('I {"inner":{"D":"x"}}');
  });

  // G1 (guard) — a rename-free nested schema must render byte-identical: the
  // fix must not perturb sidecar-less/rename-less rendering. Green at the fork
  // and must stay green.
  it("G1 (guard): a rename-free nested schema renders byte-identical compact JSON", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'G \${p}'
params:
  p: Wrap
---
schema Leaf { a: string }
schema Wrap { leaf: Leaf }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { leaf: { a: "hi" } } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('G {"leaf":{"a":"hi"}}');
  });

  // F3 (collision non-recurrence) — the load-bearing §Fix constraint: lookup is
  // per-`$defs`, NEVER one flat wire-key namespace. Two schemas rename fields
  // to the SAME wire spelling `"K"` at different depths under DIFFERENT
  // schemas. `${p}` must translate each depth under its OWN schema's map
  // (`B.y`→`"K"` at the root, `A.x`→`"K"` one level down), never cross-apply
  // one schema's rename to the other's position. A flat-namespace regression
  // would collide the two `"K"` entries and render the wrong schema's name.
  it("F3: same wire spelling at different depths under different schemas each translate under their own map", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'C \${p}'
params:
  p: B
---
schema A { x as "K": string }
schema B { y as "K": string, a: A }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { y: "top", a: { x: "deep" } } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('C {"K":"top","a":{"K":"deep"}}');
  });

  // F4 (F1 encoding) — a wire rename is an arbitrary JSON property name
  // (schemas.md:30/:39), so a rename containing `/` on a SCHEMA-TYPED field
  // (`inner as "a/b/c": Inner`) records a construction-site refTarget pointer
  // whose segment must be RFC-6901-encoded to match the runtime lookup keying
  // (`~1` for `/`). Without the encoding the pointer is `/properties/a/b/c`
  // while the runtime looks it up as `/properties/a~1b~1c` — the refTarget
  // misses and Inner's own `deep`→`"D"` rename silently renders theta-side.
  // This cell pins that the `/`-bearing renamed field descends into Inner: the
  // nested `deep`→`"D"` translation only survives with the encoding applied.
  it("F4: a `/`-bearing rename on a schema-typed field still descends into its target", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'S \${p}'
params:
  p: Outer
---
schema Inner { deep as "D": string }
schema Outer { inner as "a/b/c": Inner }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { inner: { deep: "x" } } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('S {"a/b/c":{"D":"x"}}');
  });
});
