import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { EXPORT_IN_THETA_CODE } from "../src/parser/imports";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0446 — a from-bearing `export { X } from "…"` NESTED inside an `if`/`fn`
// body (or any block-expression) is wholly inert in BOTH hosts. Bug 0431 closed
// the `.theta` TOP-LEVEL form with a parse-time E, but `checkExportInTheta`
// (src/parser/theta-document.ts:1618–1633) iterates `block.statements` at the
// top level only — its path guard at :1621 never runs against a nested
// statement — while `parseImportExport("export")` is dispatched by
// `parseStatement` at :2704 for every block, so the statement parses at any
// depth and every semantic consumer (checkExportInTheta, checkThetaLibTopLevel,
// and `extractThetaLibForms` at src/extension/import-static-checks.ts:208) walks
// top-level forms only. So the nested statement escapes refusal AND resolution
// in a `.theta`, and escapes the top-level-form rule / re-export closure / IMP-1
// in a `.thetalib` `fn` body — while its SHAPE faults still fire at the same
// nested position.
//
// §Fix Option 1 (SETTLED by the parent, "refuse nested placement in both
// hosts", mirroring 0431's export-in-theta parse check):
//   - `.theta` host — a from-bearing `export … from` (non-empty path) at ANY
//     nesting depth draws the EXISTING code EXPORT_IN_THETA_CODE
//     (`theta/parse/export-in-theta`, imports.ts:91), reusing its message/range
//     shape. Today only the top-level form draws it.
//   - `.thetalib` host — a from-bearing `export … from` (non-empty path) at a
//     NESTED position draws a NEW minted code, string literal exactly
//     `theta/parse/export-not-top-level`. A `.thetalib` TOP-LEVEL export stays
//     legal (unchanged).
//
// TIER: unit — offline, deterministic, provider-free. The refusal the settled
// fix ships is a STRUCTURAL parse rule emitted by `parseThetaDocument` off the
// document's own extension and the statement's parse position; it needs neither
// a resolved lib nor a FileSystem double (the load pass and the runtime, where
// the statement is silently ignored today, are downstream and not the seam the
// fix acts on). An integration or live tier would add a provider to a decision
// no model participates in.
//
// Assertions key on `d.code` (presence/count/range), never on message text: the
// `.thetalib` code is not yet in the registry at the fork, so keying on the code
// keeps the red-at-fork a clean symptom red (wholly-inert nested statement)
// rather than a message-registry coupling. The `.thetalib` code is written as
// the literal string on purpose — importing a not-yet-existing constant would
// red as a COMPILE error, not the doc's inertness symptom.

/** The literal `.thetalib` nested-export code the settled fix mints. */
const EXPORT_NOT_TOP_LEVEL_CODE = "theta/parse/export-not-top-level";

/** The composing-document frontmatter every cell shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

/** Frontmatter for the `subagent fn` cell, whose host mode is `subagent`. */
const SUBAGENT_FRONTMATTER = ["---", 'model: "sonnet"', "mode: subagent", "---"].join("\n");

function parse(body: string, path: string, frontmatter: string = APP_FRONTMATTER): ThetaDocument {
  const source = `${frontmatter}\n${body}`;
  const doc = parseThetaDocument(
    { path, bytes: new TextEncoder().encode(source) },
    parseDeps(),
  );
  // A frontmatter parse failure means the body is never reached — an unmet
  // precondition, not the symptom under test. Fail loudly naming it.
  expect(
    doc.frontmatter,
    `frontmatter must parse or the body is never reached; parse diagnostics: ${JSON.stringify(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  return doc;
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => d.code);
}

function withCode(doc: ThetaDocument, code: string): Diagnostic[] {
  return doc.diagnostics.filter((d) => d.code === code);
}

describe("bug 0446 — a from-bearing `export … from` nested in an if/fn body is refused, not wholly inert, in both hosts", () => {
  it("N1 (RED): a missing-path from-bearing export nested in a .theta `if` draws theta/parse/export-in-theta", () => {
    // The doc's N1 symptom: parse `[]`, load `[]`, value `1` — the nested
    // statement is wholly inert. §Fix Option 1 refuses the FORM at any depth in a
    // `.theta` with the existing 0431 code. RED now: no diagnostic carries it
    // because checkExportInTheta never descends into the `if` block.
    const doc = parse(
      'if true {\n  export { X } from "./missing.thetalib"\n}\n1\n',
      "/proj/app.theta",
    );
    expect(
      codesOf(doc),
      `N1: §Fix Option 1 — a from-bearing export at ANY depth in a .theta is a parse-time E ${EXPORT_IN_THETA_CODE}; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toContain(EXPORT_IN_THETA_CODE);
    const hit = withCode(doc, EXPORT_IN_THETA_CODE)[0];
    // The refusal is ranged over the export statement itself. Body starts at
    // document line 5 (4 frontmatter lines); the export is the 2nd body line
    // (document line 6) indented two spaces (column 3).
    expect(
      hit?.range?.start,
      "N1: the refusal is ranged over the nested export statement — document line 6, column 3",
    ).toEqual({ line: 6, column: 3 });
  });

  it("N2 (RED): a missing-path from-bearing export nested in a .theta `fn` body draws theta/parse/export-in-theta", () => {
    // The doc's N2 symptom: parse `[]`, load `[]`, value `1`. Same rule, a `fn`
    // body instead of an `if` block. RED now: wholly inert.
    const doc = parse(
      'fn f(): integer {\n  export { X } from "./missing.thetalib"\n  1\n}\nlet y = f()\ny\n',
      "/proj/app.theta",
    );
    expect(
      codesOf(doc),
      `N2: §Fix Option 1 — a from-bearing export in a .theta fn body is a parse-time E ${EXPORT_IN_THETA_CODE}; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toContain(EXPORT_IN_THETA_CODE);
  });

  it("N3 (RED): a missing-path from-bearing export nested in a .thetalib `fn` body draws theta/parse/export-not-top-level", () => {
    // The doc's N3 symptom, parsing the lib directly: parse `[]`, load `[]`, `fn
    // af` materialises and runs. §Fix Option 1 mints a NEW code for the nested
    // `.thetalib` position. RED now: the statement escapes checkThetaLibTopLevel
    // and extractThetaLibForms alike, so nothing carries the code. Keyed on the
    // literal string, not a constant — the constant does not exist at the fork.
    const doc = parse(
      'fn af(x: integer): integer {\n  export { X } from "./missing.thetalib"\n  x\n}\n',
      "/proj/lib.thetalib",
    );
    expect(
      codesOf(doc),
      `N3: §Fix Option 1 — a from-bearing export nested in a .thetalib fn body is a parse-time E ${EXPORT_NOT_TOP_LEVEL_CODE}; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toContain(EXPORT_NOT_TOP_LEVEL_CODE);
  });

  it("top-level .theta control (GREEN): a top-level from-bearing export draws EXACTLY ONE export-in-theta", () => {
    // Byte-identical to bug 0431's D1 body. Proves the fix's recursive walk does
    // not double-fire at the top level. GREEN at the fork (0431 shipped this) and
    // after.
    const doc = parse('export { X } from "./missing.thetalib"\n1\n', "/proj/app.theta");
    expect(
      withCode(doc, EXPORT_IN_THETA_CODE).length,
      `top-level .theta: exactly one export-in-theta at the top level; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
  });

  it("top-level .thetalib control (GREEN): a top-level from-bearing export draws neither nested-export code", () => {
    // A `.thetalib` top-level export is legal (imports.md:29 §Re-exports). The
    // fix touches only the NESTED position, so a top-level lib export draws
    // neither the `.theta` code nor the new `.thetalib` nested code. GREEN both
    // sides of the fix.
    const doc = parse('export { X } from "./missing.thetalib"\n', "/proj/lib.thetalib");
    expect(
      withCode(doc, EXPORT_IN_THETA_CODE),
      "top-level .thetalib: export-in-theta is .theta-keyed and top-level export is legal in a .thetalib",
    ).toEqual([]);
    expect(
      withCode(doc, EXPORT_NOT_TOP_LEVEL_CODE),
      "top-level .thetalib: the nested-export code fires only at a nested position — a top-level export stays legal",
    ).toEqual([]);
  });

  it("N4 shape co-fire control (GREEN): a malformed specifier list nested in a .theta still fires import-malformed-specifier-list", () => {
    // The doc's N4 partial-policing contrast: SHAPE rules live in
    // `parseImportExport` and fire wherever the statement parses, so a nested
    // malformed specifier list is refused today. The fix must leave this
    // depth-blind shape policing untouched. GREEN at the fork and after.
    const doc = parse(
      'if true { export { a as } from "./lib.thetalib" }\n1\n',
      "/proj/app.theta",
    );
    expect(
      codesOf(doc),
      `N4: shape policing is depth-blind — a nested malformed specifier list draws theta/parse/import-malformed-specifier-list; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toContain("theta/parse/import-malformed-specifier-list");
  });

  it("R1 while body (.theta): a from-bearing export nested in a `while` body draws EXACTLY ONE export-in-theta", () => {
    // Widens the walk-breadth lock past `if`/`fn` to a `while` body — another
    // non-top-level statement position the recursive walk reaches.
    const doc = parse(
      'while false {\n  export { X } from "./m.thetalib"\n}\n1\n',
      "/proj/app.theta",
    );
    expect(
      withCode(doc, EXPORT_IN_THETA_CODE).length,
      `R1 while: exactly one export-in-theta for the nested statement; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
  });

  it("R1 block-expression (.theta): a from-bearing export nested in a block-expression draws EXACTLY ONE export-in-theta", () => {
    // A block-expression (`{ … }` in expression position — here a `let` RHS) is
    // a non-top-level statement position; the export inside it is refused.
    const doc = parse(
      'let z = { export { X } from "./m.thetalib" 1 }\nz\n',
      "/proj/app.theta",
    );
    expect(
      withCode(doc, EXPORT_IN_THETA_CODE).length,
      `R1 block-expr: exactly one export-in-theta for the nested statement; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
  });

  it("R1 par-for body (.thetalib): a from-bearing export nested in a `par for` body inside a fn draws EXACTLY ONE export-not-top-level", () => {
    // A `par for` body is a non-top-level statement position; nested in a
    // `.thetalib` fn its export draws the nested-position code.
    const doc = parse(
      'fn af(x: integer): integer {\n  let r = par for i in [1] { export { X } from "./m.thetalib" i }\n  x\n}\n',
      "/proj/lib.thetalib",
    );
    expect(
      withCode(doc, EXPORT_NOT_TOP_LEVEL_CODE).length,
      `R1 par-for: exactly one export-not-top-level for the nested statement; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
  });

  it("R1 with-clause value (.thetalib): a from-bearing export nested in a `subagent fn` with-clause value draws EXACTLY ONE export-not-top-level", () => {
    // F1 regression lock: a `subagent fn`'s `with { … }` field value is a
    // nested expression position on the main document AST, so an export hidden
    // in one is inert unless the walk descends into with-clause values.
    const doc = parse(
      'subagent fn s(): integer with { system: par for i in [1] { export { X } from "./m.thetalib" i } } { 1 }\n',
      "/proj/lib.thetalib",
      SUBAGENT_FRONTMATTER,
    );
    expect(
      withCode(doc, EXPORT_NOT_TOP_LEVEL_CODE).length,
      `R1 with-clause: exactly one export-not-top-level for the nested statement; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
  });

  it("from-less nested control (GREEN): a from-LESS export nested in a .theta draws no export-in-theta", () => {
    // The empty-path form (`export { X }`, no `from`) is bug 0058's settled
    // ground and an explicit non-goal here; the fix targets the from-BEARING
    // (non-empty path) form only. So the nested from-less form draws no
    // export-in-theta at the fork or after.
    const doc = parse("if true { export { X } }\n1\n", "/proj/app.theta");
    expect(
      withCode(doc, EXPORT_IN_THETA_CODE),
      "from-less: §Fix targets the from-bearing form only — the empty-path nested form (bug 0058) draws no export-in-theta",
    ).toEqual([]);
  });
});
