import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { EXPORT_IN_THETA_CODE } from "../src/parser/imports";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0431 — a from-bearing `export { X } from "./lib.thetalib"` at a `.theta`
// top level is wholly inert: its path is never resolved and its specifier is
// never checked, where the identical statement in a `.thetalib` draws a loud
// refusal one file-extension away.
//
// §Fix Option 1 (recommended, SETTLED by the operator): refuse the form at a
// `.theta` top level with a newly minted parse code
// `theta/parse/export-in-theta` — the inverse of
// `theta/parse/thetalib-top-level-statement` (src/parser/imports.ts:34), which
// keys off the file's `.thetalib` extension and by construction never fires for
// a `.theta` (src/parser/theta-document.ts:1349). The refusal targets the
// from-BEARING form only (a non-empty ExportDecl path); the ExportDecl node is
// preserved so the shape / reserved-keyword rules keep firing, the from-LESS
// form (bug 0058) is untouched, the exported name still seeds no local binding
// (bug 0058's `unknown-identifier` on a body use holds), and the `.thetalib`
// side (imports.md:29 §Re-exports, imports.md:67 ExportDecl production) is
// untouched.
//
// TIER: unit — offline, deterministic, provider-free. The export-in-theta
// refusal is a STRUCTURAL parse rule emitted by `parseThetaDocument` off the
// document's own `.theta` extension and its top-level `export` statement; it
// needs neither a resolved lib nor a FileSystem double (the load pass, where
// the statement is silently ignored today, is downstream and not the seam the
// settled fix acts on). An integration or live tier would add a provider to a
// decision no model participates in.

/** The composing-document frontmatter every cell shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parse(body: string, path: string): ThetaDocument {
  const source = `${APP_FRONTMATTER}\n${body}`;
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

describe("bug 0431 — a from-bearing `export … from` at a .theta top level is refused, not wholly inert", () => {
  it("D1 (RED): a missing-path from-bearing export in a .theta draws theta/parse/export-in-theta", () => {
    // The doc's exact symptom: the same statement in a `.thetalib` resolves its
    // path (a missing file draws IMP-1), but in a `.theta` it draws nothing.
    // §Fix Option 1 refuses the FORM regardless of the fault class. RED now: the
    // statement is wholly inert, so no diagnostic carries the code.
    const doc = parse('export { X } from "./missing.thetalib"\n1\n', "/proj/app.theta");
    expect(
      codesOf(doc),
      `D1: §Fix Option 1 — a from-bearing export at a .theta top level is a parse-time E ${EXPORT_IN_THETA_CODE}; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toContain(EXPORT_IN_THETA_CODE);
    const hit = withCode(doc, EXPORT_IN_THETA_CODE)[0];
    expect(
      hit?.range?.start,
      "D1: the refusal is ranged over the whole export statement, whose first line is body-line 1 (document line 5 after 4 frontmatter lines), column 1",
    ).toEqual({ line: 5, column: 1 });
  });

  it("D3 (RED): an unknown-name from-bearing export in a .theta draws the same one refusal", () => {
    // A resolvable lib that does not provide `nosuch` would draw
    // `import-unknown-symbol` in a `.thetalib`; in a `.theta` it draws nothing.
    // Option 1 refuses the FORM, not the specific fault class — one refusal, not
    // two — so this cell asserts the identical code. RED now: wholly inert.
    const doc = parse('export { nosuch } from "./lib.thetalib"\n1\n', "/proj/app.theta");
    expect(
      codesOf(doc),
      `D3: Option 1 refuses the form regardless of fault class — one ${EXPORT_IN_THETA_CODE}; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toContain(EXPORT_IN_THETA_CODE);
    expect(
      withCode(doc, EXPORT_IN_THETA_CODE).length,
      "D3: exactly one export-in-theta — the form is refused once, not per fault class",
    ).toBe(1);
  });

  it("D2 (GREEN control): the exported name still creates no local binding", () => {
    // The from-bearing export is itself refused after the fix (this is a
    // from-bearing `.theta` export), but the exported name must STILL seed no
    // identifier root, so a body use of `af` remains theta/parse/unknown-identifier
    // (bug 0058's fix). This asserts only the presence of that binding diagnostic
    // — deliberately NOT the absence of export-in-theta — so it stays GREEN at the
    // fork and after the fix folds export-in-theta in beside it.
    const doc = parse(
      'export { af } from "./lib.thetalib"\nlet y = af(1)\ny\n',
      "/proj/app.theta",
    );
    expect(
      diagLines(doc),
      "D2: the exported name creates no local binding — a body use of `af` is theta/parse/unknown-identifier (bug 0058)",
    ).toContain("error theta/parse/unknown-identifier: unknown identifier 'af'");
  });

  it(".thetalib control (GREEN): the from-bearing statement in a .thetalib draws no export-in-theta", () => {
    // A `.thetalib` top level admits `export` (imports.md:29 §Re-exports,
    // imports.md:67 ExportDecl). The refusal is `.theta`-keyed only, the inverse
    // of the `.thetalib`-keyed top-level check (theta-document.ts:1349), so the
    // `.thetalib` side is untouched. GREEN at the fork and after.
    const doc = parse('export { X } from "./missing.thetalib"\n', "/proj/lib.thetalib");
    expect(
      withCode(doc, EXPORT_IN_THETA_CODE),
      ".thetalib: the export-in-theta rule is .theta-keyed only — the .thetalib side is untouched",
    ).toEqual([]);
  });

  it("from-less control (GREEN): a from-LESS export in a .theta draws no export-in-theta", () => {
    // The empty-path form (`export { X }`, no `from`) is bug 0058's settled
    // ground; §Fix targets the from-BEARING (non-empty path) form only. So the
    // from-less form draws no export-in-theta at the fork or after.
    const doc = parse("export { X }\n1\n", "/proj/app.theta");
    expect(
      withCode(doc, EXPORT_IN_THETA_CODE),
      "from-less: §Fix targets the from-bearing form only — the empty-path form (bug 0058) is untouched",
    ).toEqual([]);
  });
});
