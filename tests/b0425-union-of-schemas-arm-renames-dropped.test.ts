import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import { renderSystemPrompt } from "../src/parser/system-interpolation";
import { brandSchemaValue } from "../src/runtime/value";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0425
// (docs/bugs/0425-union-of-schemas-arm-renames-dropped.md).
//
// A discriminated-union `system:` param (`pet: 'Cat | Dog'`) whose arms
// declare `as` renames renders the JSON object row with NO wire-name
// translation: `toSystemParamType` discards the arms, the union terminal is
// value-driven, and `interpolationTypeOfValue` mints a bare `{ kind: "object" }`
// row that carries no sidecars — so every field renders theta-side. This
// violates the unconditional recursive-translation clause for Schema-typed
// object / array rows and the no-second-map rule:
//   docs/spec_topics/query/query-escapes-stringification.md:26-27
//     ("with wire-name translation applied recursively"), and
//   docs/spec_topics/query/query-escapes-stringification.md:34
//     ("the theta-side names an author writes never appear in the rendered
//      prompt").
//
// Parent adjudication (route (a)): pick the arm by the value's SCHEMA BRAND
// when present, ELSE by discriminator/field match against the arm schemas; a
// value matching NO arm keeps today's untranslated bytes (never guess).
//
// Harness: `parseDoc` + `renderSystemPrompt` (the spawn-site call pair),
// mirroring tests/b0408-scalar-union-params-render-json-row.test.ts.

describe("bug 0425 — union-of-schemas arm renames dropped in system render", () => {
  // W1 — arms distinguished by FIELD SET ({kind,name} vs {kind,breed}); the
  // Cat arm's renames (name→N, kind→K) must apply. Fork renders theta-side
  // `{"kind":"cat","name":"Tom"}` — RED.
  it("W1: field-set-distinguished Cat arm applies its wire renames", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Pet: \${pet}'
params:
  pet: 'Cat | Dog'
---
schema Cat { kind as "K": string, name as "N": string }
schema Dog { kind as "K": string, breed as "B": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { pet: { kind: "cat", name: "Tom" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Pet: {"K":"cat","N":"Tom"}');
  });

  // W2 — same body, Dog arm (field set {kind,breed}); breed→B, kind→K must
  // apply. Fork renders `{"kind":"dog","breed":"pug"}` — RED.
  it("W2: field-set-distinguished Dog arm applies its wire renames", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Pet: \${pet}'
params:
  pet: 'Cat | Dog'
---
schema Cat { kind as "K": string, name as "N": string }
schema Dog { kind as "K": string, breed as "B": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { pet: { kind: "dog", breed: "pug" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Pet: {"K":"dog","B":"pug"}');
  });

  // W3 — arms share the field set {kind,label} and are distinguished ONLY by
  // the LITERAL discriminator `kind` ("cat" vs "dog"). The literal field keeps
  // its spelling (no `as`); only label→L applies for the Cat arm. Fork renders
  // `{"kind":"cat","label":"hi"}` (label theta-side) — RED.
  it("W3: literal-discriminated Cat arm applies its wire rename", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Pet: \${pet}'
params:
  pet: 'Cat | Dog'
---
schema Cat { kind: "cat", label as "L": string }
schema Dog { kind: "dog", label as "M": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { pet: { kind: "cat", label: "hi" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Pet: {"kind":"cat","L":"hi"}');
  });

  // W4 — arms share the field set {x} with no literal discriminator; only the
  // SCHEMA BRAND can disambiguate. A `Cat`-branded value must take the Cat
  // arm (x→P). Fork renders `{"x":"v"}` (no sidecar on the value-driven row)
  // — RED.
  it("W4: brand-picked Cat arm applies its wire rename", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Pet: \${pet}'
params:
  pet: 'Cat | Dog'
---
schema Cat { x as "P": string }
schema Dog { x as "Q": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: {
        pet: brandSchemaValue({ x: "v" as ThetaValue }, "Cat") as unknown as ThetaValue,
      },
    });
    expect(r.ok && r.text).toBe('Pet: {"P":"v"}');
  });

  // G1 (guard) — a value matching NO unique arm (a key present in neither
  // arm) must keep today's UNTRANSLATED bytes rather than guess an arm
  // (§Fix constraint: "never guess"). Green at the fork and must stay green.
  it("G1 (guard): a value matching no arm keeps untranslated bytes", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Pet: \${pet}'
params:
  pet: 'Cat | Dog'
---
schema Cat { kind as "K": string, name as "N": string }
schema Dog { kind as "K": string, breed as "B": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { pet: { kind: "cat", mystery: "z" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Pet: {"kind":"cat","mystery":"z"}');
  });

  // W5 (F1) — a literal-UNION field type (`sev: "low" | "high"`, the
  // inline-enumeration idiom, schemas.md:93) starts and ends with a quote.
  // If `stringLiteralOf` tested only the endpoint quotes it would mint the
  // bogus literal `low" | "high` for arm A's `sev`, arm A would then reject
  // its own value, arm B become the unique admit, and the value render with
  // B's `XB` rename — a WRONG wire name. After the F1 top-level-`|` pre-test
  // A's literal table is empty, so BOTH arms admit `{sev,x}`, the pick is
  // ambiguous, and the value stays untranslated (never guess).
  it("W5 (F1): literal-union field yields no bogus literal, ambiguity untranslated", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'V: \${p}'
params:
  p: 'A | B'
---
schema A { sev: "low" | "high", x as "XA": string }
schema B { sev: string, x as "XB": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { sev: "low", x: "v" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('V: {"sev":"low","x":"v"}');
  });

  // W6 (F2) — `Cat | array<Cat>`: an `array<Cat>` arm source must NOT unwrap
  // to a phantom `Cat` object arm (which would make every Cat object
  // ambiguous → untranslated). After the F2 direct-name-only resolution the
  // arms are `[Cat]`, so a Cat OBJECT value takes the unique Cat arm and
  // translates through its renames (kind→K, name→N).
  it("W6 (F2): Cat | array<Cat> object value translates via the unique Cat arm", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'V: \${p}'
params:
  p: 'Cat | array<Cat>'
---
schema Cat { kind as "K": string, name as "N": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat", name: "Tom" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('V: {"K":"cat","N":"Tom"}');
  });

  // W7 (F2) — `Dog | array<Cat>`: the `array<Cat>` phantom arm must not block
  // the real Dog arm. After F2 the arms are `[Dog]`, so a Dog value takes the
  // unique Dog arm and translates (label→M).
  it("W7 (F2): Dog | array<Cat> does not let a phantom Cat arm block the Dog arm", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'V: \${p}'
params:
  p: 'Dog | array<Cat>'
---
schema Cat { label as "L": string }
schema Dog { label as "M": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { label: "x" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('V: {"M":"x"}');
  });

  // R1 (guard) — two renamed arms sharing the SAME field set `{x}` with no
  // literal discriminator and an UNBRANDED value: the structural pick admits
  // both arms, so the pick is ambiguous and the value stays untranslated
  // rather than guessing Cat's `P` or Dog's `Q` (§Fix constraint: never
  // guess). Contrast W4, where a schema brand breaks the tie.
  it("R1 (guard): renamed same-field-set unbranded value stays untranslated", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'V: \${p}'
params:
  p: 'Cat | Dog'
---
schema Cat { x as "P": string }
schema Dog { x as "Q": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { x: "v" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('V: {"x":"v"}');
  });
});
