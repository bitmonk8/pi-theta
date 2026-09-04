import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import {
  renderSystemPrompt,
  SYSTEM_INTERP_BAD_FIELD_CODE,
} from "../src/parser/system-interpolation";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0427
// (docs/bugs/0427-alias-schema-param-permissive-string-terminal.md).
//
// An alias-declared body schema (`schema B = Cat | Dog`, `schema A = Cat`,
// `schema L = array<string>`) used at the `params:` position was present in
// `bodyTypes.schemas` with `fields === undefined`, so `toSystemParamType`'s
// `fields === undefined` arm kept the fork-era permissive `{ kind: "string" }`
// terminal. Root cause: `collectBodyTypes` mapped `stmt.name -> stmt.fields`
// and dropped the captured alias right-hand side `SchemaDecl.arms` (declared at
// src/parser/theta-document.ts:792), so the classifier could not see what the
// alias named. That one wrong kind reproduced bug 0406's exact symptom pair on
// the alias spelling — a bare `${p}` rendered JavaScript's default coercions
// (`[object Object]` for object/union aliases, the comma-join for the array
// alias), and a `.Ident` step the path grammar admits was refused with a
// spurious `theta/parse/system-interp-bad-field`.
//
// The §Fix (landed) carries `stmt.arms` into `FrontmatterBodyTypes.aliasArms`
// (`collectBodyTypes`, src/parser/theta-document.ts:1632-1634) and dispatches
// on it in `toSystemParamType`'s `fields === undefined` arm
// (src/parser/frontmatter.ts:1043-1074): one arm -> `toSystemParamType(arm)`
// (alias-of-object -> 0406 object shell; alias-of-array -> array kind;
// alias-of-primitive -> scalar); two-or-more arms -> the 0408
// `{kind:"discriminated-union"}` value-driven terminal. A genuinely head-only
// decl keeps the permissive string terminal.
//
// Harness: `parseDoc` (real `parseThetaDocument` front-end) + a direct
// `renderSystemPrompt` — the exact spawn-site call pair. Arms are rename-FREE
// (Cat/Dog/array<string> carry no `as` renames) so the render is unambiguous;
// arm-rename translation for 2+-arm aliases is bug 0425 and is NOT this fix's
// concern. The Wn cells assert the specified POST-FIX behaviour and red at the
// tree; the Gn cells assert render behaviour the fix must PRESERVE (green now).

/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

describe("bug 0427 — alias-declared schema param keeps the permissive string terminal", () => {
  // W1 (RED) — a NAMED union alias `schema B = Cat | Dog` used at `params:`
  // must render its value through the 0408 discriminated-union value-driven row
  // (compact JSON), exactly as the INLINE spelling `p: 'Cat | Dog'` does since
  // 0408 (Reproduction row 1). RED at tree: the alias falls to the permissive
  // string terminal, so `${p}` coerces the object to `[object Object]`.
  it("W1: alias-of-union `${p}` renders compact JSON, not `[object Object]`", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: B
---
schema Cat { kind: "cat", name: string }
schema Dog { kind: "dog", breed: string }
schema B = Cat | Dog
let x = 1`);
    // Row 1's document is fully legal — literal discriminators, no
    // missing-discriminator warning; the classifier miss is the only defect.
    expect(errorCodes(doc), "the alias-union document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl, "the theta registers a `system:` template").toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat", name: "Tom" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"kind":"cat","name":"Tom"}');
  });

  // W2 (RED) — an alias-of-array `schema L = array<string>` must render the
  // QRY-18 array row (JSON array), never JavaScript's comma-join (Reproduction
  // row 2). RED at tree: the permissive string terminal coerces the array via
  // `text +=` to `a,b`.
  it("W2: alias-of-array `${p}` renders a JSON array, not the comma-join", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'L: \${p}'
params:
  p: L
---
schema L = array<string>
let x = 1`);
    expect(errorCodes(doc), "the alias-of-array document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: ["a", "b"] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('L: ["a","b"]');
  });

  // W3 (RED) — a single-arm alias-of-object `schema A = Cat` must render the
  // 0406 object row (compact JSON), never `[object Object]` (Reproduction
  // row 3). RED at tree: the permissive string terminal coerces the object.
  it("W3: alias-of-object `${p}` renders compact JSON, not `[object Object]`", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: A
---
schema Cat { kind: string }
schema A = Cat
let x = 1`);
    expect(errorCodes(doc), "the alias-of-object document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"kind":"cat"}');
  });

  // W4 (RED) — `schema A = Cat` resolves one step in to the object schema `Cat`,
  // so `${p.kind}` is a path the grammar ADMITS; the theta must register (no
  // bad-field) and render the walked field (Reproduction row 4). RED at tree:
  // the string terminal refuses the `.Ident` step with a spurious
  // `theta/parse/system-interp-bad-field` and the theta does NOT register.
  it("W4: alias-of-object `${p.kind}` is admitted and renders the field", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p.kind}'
params:
  p: A
---
schema Cat { kind: string }
schema A = Cat
let x = 1`);
    const codes = errorCodes(doc);
    expect(
      codes.includes(SYSTEM_INTERP_BAD_FIELD_CODE),
      "an alias-of-object path step names a reachable field — no spurious bad-field",
    ).toBe(false);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl, "the theta registers a `system:` template").toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe("P: cat");
  });

  // --- Controls: render behaviour the fix must PRESERVE (green now and after) --

  // G1 (CONTROL) — a DIRECT object schema `p: Cat` already renders the 0406
  // object row (compact JSON) since 0406; the fix must not regress it
  // (Reproduction control row 5).
  it("G1 (control): direct object `${p}` renders compact JSON", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: Cat
---
schema Cat { kind: string }
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"kind":"cat"}');
  });

  // G2 (CONTROL) — the INLINE union `p: 'Cat | Dog'` renders the 0408
  // value-driven row already; the alias fix routes the NAMED form to the same
  // terminal, so this control must remain green (Reproduction control row 6).
  it("G2 (control): inline union `${p}` renders the value-driven JSON row", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Pet: \${p}'
params:
  p: 'Cat | Dog'
---
schema Cat { kind: "cat", name: string }
schema Dog { kind: "dog", breed: string }
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat", name: "Tom" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Pet: {"kind":"cat","name":"Tom"}');
  });

  // --- R1: round-1 review residuals (object-hop-cycle parity + termination) ---

  // R1a (REGRESSION GUARD) — a LEGAL object-hop cycle `schema A = Node`,
  // `schema Node { next: A }` must classify `p: A` and `p: Node` IDENTICALLY:
  // the one-arm alias must NOT park a `string` sentinel in the shared
  // `resolving` shell map, because the object-schema arm's early
  // `resolving.get(s)` return reads it back and mis-classifies the cycle,
  // rendering `${p.next}` as `[object Object]` (the round-1 F1 blocker). Both
  // spellings must render `${p}` and `${p.next}` as the object JSON row.
  it("R1a: object-hop-cycle `p: A` and `p: Node` classify and render identically", () => {
    const value = { p: { next: { next: null } } as unknown as ThetaValue };
    const render = (paramType: string): string => {
      const doc = parseDoc(`---
mode: subagent
system: 'P: \${p} N: \${p.next}'
params:
  p: ${paramType}
---
schema A = Node
schema Node { next: A }
let x = 1`);
      expect(
        errorCodes(doc),
        `the object-hop-cycle document (p: ${paramType}) registers with zero diagnostics`,
      ).toEqual([]);
      const tmpl = doc.frontmatter?.system;
      expect(tmpl, `p: ${paramType} registers a \`system:\` template`).toBeDefined();
      const r = renderSystemPrompt({ template: tmpl!, params: value });
      expect(r.ok, `p: ${paramType} renders`).toBe(true);
      return r.ok ? r.text : "";
    };
    const viaAlias = render("A");
    const viaSchema = render("Node");
    // Parity: naming the object one alias-hop away must not change the render.
    expect(viaAlias, "`p: A` and `p: Node` render identically").toBe(viaSchema);
    // And both render the object JSON row at each step — never `[object Object]`.
    expect(viaAlias).toBe('P: {"next":{"next":null}} N: {"next":null}');
  });

  // R1b (REGRESSION GUARD) — a legal multi-hop alias CHAIN `schema A = B`,
  // `schema B = Cat` to an object schema resolves: the `aliasChain` guard must
  // NOT short-circuit a chain of distinct alias names, so `${p.kind}` is
  // admitted and renders the walked field.
  it("R1b: legal alias chain `schema A = B; schema B = Cat` resolves and admits `.kind`", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'K: \${p.kind}'
params:
  p: A
---
schema Cat { kind: string }
schema B = Cat
schema A = B
let x = 1`);
    expect(errorCodes(doc), "the alias-chain document registers with zero diagnostics").toEqual([]);
    expect(
      doc.diagnostics.some((d) => d.code === SYSTEM_INTERP_BAD_FIELD_CODE),
      "a two-hop alias chain to an object schema admits `.kind` — no spurious bad-field",
    ).toBe(false);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { kind: "cat" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe("K: cat");
  });

  // R1c (TERMINATION) — a pure self-cycle `schema S = S` is refused at
  // declaration with `theta/parse/type-alias-cycle`; the classifier's
  // `aliasChain` guard must make `p: S` terminate rather than recurse
  // unbounded (this test completing at all is the no-stack-overflow observable).
  it("R1c: pure self-cycle `schema S = S` is refused at declaration and does not hang", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: S
---
schema S = S
let x = 1`);
    expect(
      doc.diagnostics.some((d) => d.code === "theta/parse/type-alias-cycle"),
      "a pure self-cycle is refused at declaration with type-alias-cycle",
    ).toBe(true);
  });
});
