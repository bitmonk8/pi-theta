import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import { renderSystemPrompt } from "../src/parser/system-interpolation";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0442
// (docs/bugs/0442-alias-blind-outbound-sidecar-construction.md).
//
// WHY: outbound sidecar construction is alias-blind everywhere except the
// direct `params:` NamedType position (bug 0427). `namedSchemaOf` returns any
// name present in `schemas` — alias declarations included (`fields ===
// undefined`) — and `buildOutboundSidecars` then refuses it, so an alias used
// as an `array<...>` element (`xs: 'array<A>'`) or as a schema field type
// (`pet: A`) renders the aliased schema's `as` renames THETA-SIDE, against the
// unconditional recursive-translation clause of
// docs/spec_topics/query/query-escapes-stringification.md:26-27, :36 and
// docs/spec_topics/schemas.md:60 (the alias IS the type it names). The fix
// resolves single-arm alias chains at the classification seam
// (`namedSchemaOf`), so both blind positions descend into the real object
// schema and translate.
//
// Harness mirrors b0424/b0427: `parseDoc` + `renderSystemPrompt` (the
// spawn-site call pair), offline and deterministic. Render input carries the
// theta-side keys (`kind`/`name`); the expected output carries the wire names
// (`K`/`N`).

const RENAMED_CAT = `schema Cat { kind as "K": "cat", name as "N": string }`;

/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

describe("bug 0442 — outbound sidecar construction is alias-blind at the array-element and schema-field positions", () => {
  // W1 (doc §Reproduction row 1) — an `array<A>` element over `schema A = Cat`
  // must apply Cat's renames inside each element. Fork renders theta-side.
  it("W1: `array<A>` over `schema A = Cat` applies the aliased element's renames", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<A>'
---
${RENAMED_CAT}
schema A = Cat
let x = 1`);
    expect(errorCodes(doc), "the alias-array document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl, "the `array<A>` template registers").toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { xs: [{ kind: "cat", name: "Tom" }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: [{"K":"cat","N":"Tom"}]');
  });

  // W2 (doc §Reproduction row 2) — a body-schema field typed by an alias
  // (`pet: A`) must translate the aliased schema's renames while the enclosing
  // schema's own rename (`top`→`"T"`) also applies. Fork renders the alias-hop
  // field theta-side while the root rename is applied — one mixed prompt.
  it("W2: a schema field typed by an alias (`pet: A`) translates alongside the root rename", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: Outer
---
${RENAMED_CAT}
schema A = Cat
schema Outer { pet: A, top as "T": string }
let x = 1`);
    expect(errorCodes(doc), "the alias-field document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { pet: { kind: "cat", name: "Tom" }, top: "y" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"pet":{"K":"cat","N":"Tom"},"T":"y"}');
  });

  // W3 (doc §Reproduction, mixed-prompt face) — the SAME nested record spelled
  // through `${p}` (the enclosing sidecar walk) and `${p.pet}` (the per-field
  // recursion) must agree: both wire-side. Fork renders the first theta-side
  // and the second wire-side (bug 0424's per-path inconsistency shape).
  it("W3: `${p}` and `${p.pet}` render the alias-hop record identically (wire-side)", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'A \${p} B \${p.pet}'
params:
  p: Outer
---
${RENAMED_CAT}
schema A = Cat
schema Outer { pet: A, top as "T": string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { pet: { kind: "cat", name: "Tom" }, top: "y" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('A {"pet":{"K":"cat","N":"Tom"},"T":"y"} B {"K":"cat","N":"Tom"}');
  });

  // W4 (doc §Fix — alias-chase must chain) — an `array<A2>` over
  // `schema A2 = A`, `schema A = Cat` must chase both alias hops to Cat and
  // translate. Fork yields no sidecars (the chain never resolves).
  it("W4: a two-hop alias chain `array<A2>`/`A2 = A`/`A = Cat` chases to Cat and translates", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<A2>'
---
${RENAMED_CAT}
schema A = Cat
schema A2 = A
let x = 1`);
    expect(errorCodes(doc), "the alias-chain document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { xs: [{ kind: "cat", name: "Tom" }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: [{"K":"cat","N":"Tom"}]');
  });

  // --- Controls: render behaviour the fix must PRESERVE (green now and after) --

  // G1 (control) — the direct alias `p: A` already translates (bug 0427 W3
  // class, with renamed Cat); the fix must not perturb it.
  it("G1 (control): direct alias `p: A` translates", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: A
---
${RENAMED_CAT}
schema A = Cat
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

  // G2 (control) — the alias-of-array `p: L` over `schema L = array<Cat>`
  // already translates (bug 0427's 1-arm recursion reaches the array arm); the
  // fix must not perturb it.
  it("G2 (control): alias-of-array `p: L` over `schema L = array<Cat>` translates", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: L
---
${RENAMED_CAT}
schema L = array<Cat>
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: [{ kind: "cat", name: "Tom" }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: [{"K":"cat","N":"Tom"}]');
  });

  // G3 (control) — the non-alias `xs: 'array<Cat>'` already translates (bug
  // 0407 class); byte-identical before and after.
  it("G3 (control): non-alias `array<Cat>` translates", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<Cat>'
---
${RENAMED_CAT}
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { xs: [{ kind: "cat", name: "Tom" }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: [{"K":"cat","N":"Tom"}]');
  });

  // G4 (guard) — a rename-free alias element must render byte-identical: the
  // fix must not perturb sidecar-less rendering (no phantom sidecars).
  it("G4 (guard): a rename-free alias element renders byte-identical compact JSON", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<A>'
---
schema Plain { a: string }
schema A = Plain
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { xs: [{ a: "hi" }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: [{"a":"hi"}]');
  });
});
