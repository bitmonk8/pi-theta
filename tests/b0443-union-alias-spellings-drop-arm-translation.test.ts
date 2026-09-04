import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import { renderSystemPrompt } from "../src/parser/system-interpolation";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0443
// (docs/bugs/0443-union-alias-spellings-drop-arm-translation.md).
//
// WHY: bug 0425 threads per-arm rename data for a `system:` union ONLY from
// the inline top-level `|` split; bug 0427 routes a 2+-arm alias to the bare
// `discriminated-union` terminal with no arms. Composed, the alias spellings
// of a union of renamed schemas drop the arm translation: `p: UU` over
// `schema UU = Cat | Dog` and `p: 'A | B'` over per-arm aliases both render
// conforming values THETA-SIDE, while the inline `p: 'Cat | Dog'` translates —
// three spellings of one construct, two behaviours, against
// docs/spec_topics/query/query-escapes-stringification.md:28, :35 and
// docs/spec_topics/schemas.md:60 (the alias is the type it names). The fix
// threads `buildSystemUnionArms` through both alias spellings.
//
// Harness mirrors b0425: `parseDoc` + `renderSystemPrompt` (the spawn-site
// call pair). Render input carries theta-side keys; the expected output
// carries the wire names (`K`/`N`). Value `{kind:"cat",name:"Tom"}` is
// field-set-unique for `Cat` and matches its literal discriminator.

const RENAMED_ARMS = `schema Cat { kind as "K": "cat", name as "N": string }
schema Dog { kind as "K": "dog", breed: string }`;

/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

describe("bug 0443 — union alias spellings drop the bug-0425 arm translation", () => {
  // W1 (doc §Reproduction row 1) — an alias-of-union `schema UU = Cat | Dog`
  // used at `params:` must pick the arm and translate exactly as the inline
  // spelling does. Fork renders theta-side (the 2+-arm alias route mints the
  // arm-less terminal).
  it("W1: alias-of-union `p: UU` picks the Cat arm and translates", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: UU
---
${RENAMED_ARMS}
schema UU = Cat | Dog
let x = 1`);
    expect(errorCodes(doc), "the alias-of-union document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl, "the alias-of-union template registers").toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat", name: "Tom" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"K":"cat","N":"Tom"}');
  });

  // W2 (doc §Reproduction row 2) — a union of per-arm aliases `'A | B'` over
  // `schema A = Cat`, `schema B = Dog` must alias-chase each arm source to the
  // terminal object schema and translate. Fork skips both alias arms in
  // `buildSystemUnionArms`, yielding zero arms.
  it("W2: union-of-aliases `p: 'A | B'` alias-chases each arm and translates", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: 'A | B'
---
${RENAMED_ARMS}
schema A = Cat
schema B = Dog
let x = 1`);
    expect(errorCodes(doc), "the union-of-aliases document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat", name: "Tom" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"K":"cat","N":"Tom"}');
  });

  // W3 (doc §Reproduction row 1, Dog face) — the alias-of-union must pick the
  // Dog arm too (field-set {kind,breed}, literal kind "dog"); breed carries no
  // rename, so only kind→K applies.
  it("W3: alias-of-union `p: UU` picks the Dog arm and translates", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: UU
---
${RENAMED_ARMS}
schema UU = Cat | Dog
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "dog", breed: "pug" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"K":"dog","breed":"pug"}');
  });

  // --- Controls: render behaviour the fix must PRESERVE (green now and after) --

  // G1 (control) — the inline spelling `p: 'Cat | Dog'` already translates
  // (bug 0425 W-class); byte-identical before and after.
  it("G1 (control): inline union `p: 'Cat | Dog'` translates", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: 'Cat | Dog'
---
${RENAMED_ARMS}
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat", name: "Tom" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"K":"cat","N":"Tom"}');
  });

  // G2 (guard) — a rename-free alias-of-union must render byte-identical (bug
  // 0427 still classifies it `discriminated-union`; arms carry no renames).
  it("G2 (guard): a rename-free alias-of-union renders byte-identical compact JSON", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: UU
---
schema Cat { kind: "cat", name: string }
schema Dog { kind: "dog", breed: string }
schema UU = Cat | Dog
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat", name: "Tom" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"kind":"cat","name":"Tom"}');
  });

  // G3 (guard) — a value matching NO arm keeps today's untranslated bytes (the
  // §Fix reuses `unionArmObjectType` unchanged; never guess). Applies to the
  // alias spelling exactly as bug 0425 G1 pins it for the inline spelling.
  it("G3 (guard): an alias-union value matching no arm stays untranslated", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: UU
---
${RENAMED_ARMS}
schema UU = Cat | Dog
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat", mystery: "z" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"kind":"cat","mystery":"z"}');
  });
});
