import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import {
  renderSystemPrompt,
  SYSTEM_INTERP_BAD_FIELD_CODE,
} from "../src/parser/system-interpolation";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0406
// (docs/bugs/0406-object-typed-params-misclassified-string.md).
//
// `toSystemParamType` collapses three object-valued `params:` spellings — an
// inline object type, an imported `.thetalib` schema name, and a recursive
// schema's self-typed field — to `{ kind: "string" }`. That one wrong kind
// forks into two observables the spec forbids: a `.Ident` step off such a
// param draws a spurious `theta/parse/system-interp-bad-field` (the theta
// fails to register), and a bare `${param}` renders JavaScript's
// `[object Object]` into the child's system prompt instead of the QRY-18
// compact-JSON object row.
//
// Harness: `parseDoc` (real `parseThetaDocument` front-end) + a direct
// `renderSystemPrompt` — the exact call pair the spawn site runs. The render
// input object carries theta-side keys, matching the validated-params boundary.
// The Wn cases assert the specified POST-FIX behaviour and red at the fork; the
// Gn cases assert a refusal the fix must PRESERVE and are green at the fork.

/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

describe("bug 0406 — object-typed params misclassified as string", () => {
  // W1 — inline object type declares its own fields in `params:`; the `.name`
  // step names one, so the path grammar admits it (Reproduction row 1). Fork:
  // spurious bad-field, no template.
  it("W1: inline-object `${author.name}` is admitted and renders the field", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author.name}'
params:
  author: '{name: string, role: string}'
---
let x = 1`);
    expect(errorCodes(doc), "no spurious bad-field on an admitted inline-object path").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl, "the theta registers a `system:` template").toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe("Hi Ada");
  });

  // W2 — the same inline object type in the UNQUOTED YAML flow-map spelling
  // (Reproduction row 2). Same admitted path, same render.
  it("W2: inline-object flow-map (unquoted) `${author.name}` is admitted and renders the field", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author.name}'
params:
  author: {name: string, role: string}
---
let x = 1`);
    expect(errorCodes(doc), "the unquoted flow-map spelling is the same admitted type").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe("Hi Ada");
  });

  // W3 — a bare `${author}` off an inline-object param must render the QRY-18
  // object row (compact JSON), never `[object Object]` (Reproduction row 5).
  // The inline object carries no `as` wire renames, so JSON uses its declared
  // theta-side keys.
  it("W3: inline-object bare `${author}` renders compact JSON, not `[object Object]`", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author}'
params:
  author: '{name: string, role: string}'
---
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Hi {"name":"Ada","role":"dev"}');
  });

  // W4 — an imported `.thetalib` schema name resolves (no
  // `unresolved-named-type`); its `.name` step must be admitted, not refused
  // (Reproduction row 3). Fork: bad-field, no template.
  it("W4: imported-schema `${author.name}` is admitted and renders the walked field", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author.name}'
params:
  author: Author
---
import { Author } from "./types.thetalib"
let x = 1`);
    const codes = errorCodes(doc);
    expect(codes, "no spurious bad-field on an imported-schema path").toEqual([]);
    expect(
      codes.includes("theta/parse/unresolved-named-type"),
      "the imported name resolves — only its fields were invisible",
    ).toBe(false);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe("Hi Ada");
  });

  // W5 — a bare `${author}` off an imported-schema param must render the object
  // row, killing `[object Object]`. The rendered JSON keeps theta-side names:
  // imported-schema fields carry no wire-translation sidecars at this seam, so
  // the residual is by design here (parent Recommendation A) — this asserts
  // exactly that residual, not the wire-translated form.
  it("W5: imported-schema bare `${author}` renders compact JSON with theta-side names", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author}'
params:
  author: Author
---
import { Author } from "./types.thetalib"
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Hi {"name":"Ada","role":"dev"}');
  });

  // W6 — a recursive schema is legal and the path grammar has no depth bound,
  // so `${n.child.name}` must be admitted; the recursion-cut must become an
  // object kind that still descends, not `string` (Reproduction row 4).
  it("W6: recursive-schema `${n.child.name}` is admitted and renders the deep field", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Node \${n.child.name}'
params:
  n: Node
---
schema Node { name: string, child: Node }
let x = 1`);
    expect(errorCodes(doc), "the recursion cut admits the deep path").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: {
        n: { name: "root", child: { name: "leaf", child: null } } as unknown as ThetaValue,
      },
    });
    expect(r.ok && r.text).toBe("Node leaf");
  });

  // W7 — DOCUMENTED RESIDUAL for imported-schema field-invisibility (parent
  // Recommendation A). An imported schema is admitted opaquely, so a walked-off
  // field (`.typo`, absent from the runtime value) cannot be refused at parse
  // time; it resolves to JS `undefined` and the value-driven object row yields
  // the literal text `undefined`. Pinned as documented behaviour / filing
  // candidate for the next hunt — not a second bug this fix must close.
  it("W7: imported-schema walked-off `${author.typo}` renders the literal `undefined`", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author.typo}'
params:
  author: Author
---
import { Author } from "./types.thetalib"
let x = 1`);
    expect(errorCodes(doc), "an imported-schema field step is admitted opaquely").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { name: "Ada" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe("Hi undefined");
  });

  // --- Constraint guards: refusals the fix must PRESERVE (green at fork) -----

  // G1 — an inline object type carries its real fields, so a genuinely-absent
  // field is still a bad-field refusal (the fix must not admit it). §Fix: "the
  // `bad-field` still firing for genuinely absent fields".
  it("G1 (guard): inline-object genuinely-absent `${author.bogus}` is still refused", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author.bogus}'
params:
  author: '{name: string, role: string}'
---
let x = 1`);
    expect(
      errorCodes(doc).includes(SYSTEM_INTERP_BAD_FIELD_CODE),
      "a genuinely-absent inline-object field stays refused",
    ).toBe(true);
    expect(doc.frontmatter?.system, "a refused path yields no template").toBeUndefined();
  });

  // G2 — the recursive schema's real fields are `name`/`child`; `.child.bogus`
  // names no field of `Node`, so the refusal is preserved.
  it("G2 (guard): recursive genuinely-absent `${n.child.bogus}` is still refused", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Node \${n.child.bogus}'
params:
  n: Node
---
schema Node { name: string, child: Node }
let x = 1`);
    expect(errorCodes(doc).includes(SYSTEM_INTERP_BAD_FIELD_CODE)).toBe(true);
    expect(doc.frontmatter?.system).toBeUndefined();
  });
});
