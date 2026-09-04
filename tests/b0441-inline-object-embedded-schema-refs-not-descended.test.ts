import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import { renderSystemPrompt } from "../src/parser/system-interpolation";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0441
// (docs/bugs/0441-inline-object-embedded-schema-refs-not-descended.md).
//
// WHY: bug 0424's outbound-sidecar BFS classifies a field's type with
// `namedSchemaOf`, which recognises only a bare body-schema name or
// `array<Schema>`. A body schema referenced one hop deeper — inside an
// inline-object type (`{y: Inner}`), in any of the three container positions
// that carry sidecars — is invisible to the walk: no `refTarget`, no runtime
// hop, and `Inner`'s `as` renames render THETA-SIDE on a bare container render.
// This violates the unconditional recursive-translation clause of
// docs/spec_topics/query/query-escapes-stringification.md:26-27, :36. The fix
// mints a collision-free intermediate `$defs` for the inline layer at the
// construction seam so the runtime walk descends past it.
//
// Harness mirrors b0424: `parseDoc` + `renderSystemPrompt` (the spawn-site
// call pair), offline and deterministic. Render input carries theta-side keys
// (`deep`); the expected output carries the wire name (`D`).

const INNER = `schema Inner { deep as "D": string }`;

/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

describe("bug 0441 — inline-object-embedded schema refs not descended by the outbound-sidecar BFS", () => {
  // W1 (doc §Reproduction row 1) — a body schema field typed by an inline
  // object embedding a schema ref (`x: {y: Inner}`) must translate `Inner`'s
  // nested rename. Fork renders `deep` theta-side.
  it("W1: `schema Outer { x: {y: Inner} }` descends the inline layer to translate `Inner`", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: Outer
---
${INNER}
schema Outer { x: {y: Inner} }
let x = 1`);
    expect(errorCodes(doc), "the inline-embedded document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl, "the schema-typed template registers").toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { x: { y: { deep: "v" } } } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"x":{"y":{"D":"v"}}}');
  });

  // W2 (doc §Reproduction row 2) — an inline-object PARAM whose nested inline
  // field embeds a schema ref (`p: '{x: {y: Inner}}'`) must descend both
  // inline layers. Fork renders `deep` theta-side.
  it("W2: `p: '{x: {y: Inner}}'` descends both inline layers to translate `Inner`", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: '{x: {y: Inner}}'
---
${INNER}
let x = 1`);
    expect(errorCodes(doc), "the inline-param document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { x: { y: { deep: "v" } } } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"x":{"y":{"D":"v"}}}');
  });

  // W3 (doc §Reproduction row 3) — an `array<{y: Inner}>` param (inline-object
  // element embedding a schema ref) must descend the element's inline layer.
  // Fork renders `deep` theta-side.
  it("W3: `array<{y: Inner}>` descends the inline element to translate `Inner`", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${xs}'
params:
  xs: 'array<{y: Inner}>'
---
${INNER}
let x = 1`);
    expect(errorCodes(doc), "the inline-element document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { xs: [{ y: { deep: "v" } }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: [{"y":{"D":"v"}}]');
  });

  // --- Controls: render behaviour the fix must PRESERVE (green now and after) --

  // G1 (control) — the one-hop-shallower spelling `schema Outer { y: Inner }`
  // already translates (bug 0424 W1 class); the fix must not perturb it.
  it("G1 (control): the one-hop-shallower `schema Outer { y: Inner }` still translates", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: Outer
---
${INNER}
schema Outer { y: Inner }
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { y: { deep: "v" } } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"y":{"D":"v"}}');
  });

  // G2 (guard) — a rename-free inline-embedded schema must render
  // byte-identical: no phantom sidecars, no minted-def leakage into the bytes.
  it("G2 (guard): a rename-free inline-embedded schema renders byte-identical compact JSON", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: Outer
---
schema Leaf { a: string }
schema Outer { x: {y: Leaf} }
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { x: { y: { a: "hi" } } } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('P: {"x":{"y":{"a":"hi"}}}');
  });

  // F1 (collision) — two SIBLING inline-object fields each embedding a
  // DIFFERENT renamed schema must each mint a DISTINCT intermediate `$defs`
  // name: if the reservation loop reused one name, the second minted sidecar
  // would clobber the first in the per-`$defs` map and one arm's rename would
  // drop. Both `Inner.deep`→`"D"` and `Inner2.far`→`"F"` must translate.
  it("F1: sibling inline layers mint distinct defs so neither rename is clobbered", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: Outer
---
${INNER}
schema Inner2 { far as "F": string }
schema Outer { x: {y: Inner}, z: {w: Inner2} }
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: {
        p: { x: { y: { deep: "v" } }, z: { w: { far: "q" } } } as unknown as ThetaValue,
      },
    });
    expect(r.ok && r.text).toBe('P: {"x":{"y":{"D":"v"}},"z":{"w":{"F":"q"}}}');
  });

  // R1 (termination) — a schema that references ITSELF through an inline layer
  // (`schema Node { next: {n: Node} }`) must not recurse unbounded at
  // construction: the inline descent re-enters the sidecar BFS, so without a
  // construction-stack guard it stack-overflows on this legal, zero-diagnostic
  // document. The `label`→`"L"` rename must still translate at every Node depth.
  it("R1 (termination): a self-ref-through-inline schema terminates and translates at depth", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: Node
---
schema Node { label as "L": string, next: {n: Node} }
let x = 1`);
    expect(errorCodes(doc), "the self-ref-through-inline document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: {
        p: { label: "a", next: { n: { label: "b", next: { n: null } } } } as unknown as ThetaValue,
      },
    });
    expect(r.ok && r.text).toBe('P: {"L":"a","next":{"n":{"L":"b","next":{"n":null}}}}');
  });

  // R2 (termination) — a MUTUAL reference through inline layers
  // (`schema A { x: {y: B} }`, `schema B { z: {w: A} }`) must likewise
  // terminate; each schema's own rename translates through the other's inline
  // wrapper.
  it("R2 (termination): a mutual-ref-through-inline pair terminates and translates", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'P: \${p}'
params:
  p: A
---
schema A { a as "AA": string, x: {y: B} }
schema B { b as "BB": string, z: {w: A} }
let x = 1`);
    expect(errorCodes(doc), "the mutual-ref-through-inline document registers with zero diagnostics").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: {
        p: { a: "1", x: { y: { b: "2", z: { w: null } } } } as unknown as ThetaValue,
      },
    });
    expect(r.ok && r.text).toBe('P: {"AA":"1","x":{"y":{"BB":"2","z":{"w":null}}}}');
  });
});
