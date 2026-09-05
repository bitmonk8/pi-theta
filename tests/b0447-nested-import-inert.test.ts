import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0447 — an `import { … } from "…"` statement NESTED inside an `if`/`fn`
// body (or any block-expression / par-for body) is semantically inert in BOTH
// hosts. `parseForm`'s `import` dispatch (src/parser/theta-document.ts) admits
// `import` at any statement depth, but every semantic consumer is keyed to top-level
// statements: `collectImports` (src/extension/import-static-checks.ts:157–165)
// and `extractThetaLibForms` (:208) walk `body.statements` top-level only, so a
// nested import's path is never resolved (a missing lib draws nothing) and
// nothing materialises. The parse-side scope builders read the same top-level
// list, so a USE of a nested-imported name draws
// `theta/parse/unknown-identifier` — a true statement about the walk's scope
// sets but a false pointer for the author, whose import statement is one line
// up and whose actual fault (placement) is named by nothing. The statement's
// SHAPE (extension, specifier list) is still policed at any depth — the same
// partial-policing split bug 0431/0446 documented for the export form.
//
// §Fix Option 1 (SETTLED by the parent, "refuse nested placement in both
// hosts", the import sibling of bug 0446): an `import … from` at ANY nested
// position in EITHER host (.theta OR .thetalib) draws a NEW minted parse code,
// string literal exactly `theta/parse/import-not-top-level`, fired by a
// recursive statement walk. A TOP-LEVEL import stays LEGAL in both hosts
// (unchanged — it is how thetas/libs consume libs).
//
// TIER: unit — offline, deterministic, provider-free. The refusal the settled
// fix ships is a STRUCTURAL parse rule emitted by `parseThetaDocument` off the
// statement's parse position; it needs neither a resolved lib nor a FileSystem
// double (the load pass and the runtime, where the statement is silently
// ignored today, are downstream and not the seam the fix acts on). An
// integration or live tier would add a provider to a decision no model
// participates in.
//
// Assertions key on `d.code` (presence/count), never on message text: the code
// is not yet in the registry at the fork, so keying on the code keeps the
// red-at-fork a clean symptom red (inert nested statement) rather than a
// message-registry coupling. The code is written as the literal string on
// purpose — importing a not-yet-existing constant would red as a COMPILE error,
// not the doc's inertness symptom.

/** The literal nested-import code the settled fix mints, for both hosts. */
const IMPORT_NOT_TOP_LEVEL_CODE = "theta/parse/import-not-top-level";

/** The composing-document frontmatter every cell shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

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

describe("bug 0447 — an `import … from` nested in an if/fn body is refused, not inert, in both hosts", () => {
  it("M1 (RED): a missing-path import nested in a .theta `if` draws exactly one theta/parse/import-not-top-level", () => {
    // The doc's M1 symptom: parse `[]`, load `[]`, value `1` — the nested import
    // is inert; the same statement at top level draws
    // `theta/load/unresolvable-thetalib-path`. §Fix Option 1 refuses the FORM at
    // any depth. RED now: no diagnostic carries the code because collectImports
    // never descends into the `if` block.
    const doc = parse(
      'if true {\n  import { zf } from "./missing.thetalib"\n}\n1\n',
      "/proj/app.theta",
    );
    expect(
      codesOf(doc),
      `M1: §Fix Option 1 — an import at ANY depth is a parse-time E ${IMPORT_NOT_TOP_LEVEL_CODE}; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toContain(IMPORT_NOT_TOP_LEVEL_CODE);
    expect(
      withCode(doc, IMPORT_NOT_TOP_LEVEL_CODE).length,
      `M1: exactly one import-not-top-level for the single nested statement; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
  });

  it("M2 (RED): a USED import nested in a .theta `if` (resolvable lib) draws theta/parse/import-not-top-level", () => {
    // The doc's M2 symptom: parse `["error theta/parse/unknown-identifier:
    // unknown identifier 'af'"]`, load `[]`, nothing materialises. The diagnostic
    // names an unknown identifier; the author's fault is import placement, which
    // nothing names. §Fix Option 1 replaces the misattribution with a
    // fault-naming refusal. RED now: import-not-top-level is absent (the fork
    // draws unknown-identifier for `af` instead). Assert ONLY import-not-top-level
    // presence — `af`'s binding behaviour is unchanged by the fix, so asserting
    // unknown-identifier's presence/absence would over-constrain.
    const doc = parse(
      'if true {\n  import { af } from "./lib.thetalib"\n  let y = af(1)\n}\n1\n',
      "/proj/app.theta",
    );
    expect(
      codesOf(doc),
      `M2: §Fix Option 1 — a used nested import is refused for placement, not misattributed as unknown-identifier; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toContain(IMPORT_NOT_TOP_LEVEL_CODE);
  });

  it("M3 (RED): a missing-path import nested in a .thetalib `fn` body draws exactly one theta/parse/import-not-top-level", () => {
    // The doc's M3 symptom, parsing the lib directly: parse `[]`, load `[]`, `fn
    // af` materialises and runs. §Fix Option 1 refuses the nested position in the
    // `.thetalib` host too. RED now: the statement escapes extractThetaLibForms
    // and collectImports alike, so nothing carries the code.
    const doc = parse(
      'fn af(x: integer): integer {\n  import { zf } from "./missing.thetalib"\n  x\n}\n',
      "/proj/lib.thetalib",
    );
    expect(
      codesOf(doc),
      `M3: §Fix Option 1 — an import nested in a .thetalib fn body is a parse-time E ${IMPORT_NOT_TOP_LEVEL_CODE}; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toContain(IMPORT_NOT_TOP_LEVEL_CODE);
    expect(
      withCode(doc, IMPORT_NOT_TOP_LEVEL_CODE).length,
      `M3: exactly one import-not-top-level for the single nested statement; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
  });

  it("top-level .theta control (GREEN): a top-level import draws no import-not-top-level", () => {
    // A top-level import is how a `.theta` consumes a lib (unchanged). This proves
    // the fix's recursive walk does not fire at the top level. GREEN at the fork
    // and after.
    const doc = parse(
      'import { af } from "./lib.thetalib"\nlet y = af(1)\ny\n',
      "/proj/app.theta",
    );
    expect(
      withCode(doc, IMPORT_NOT_TOP_LEVEL_CODE),
      "top-level .theta: a top-level import is legal — the nested-import rule must not fire at the top level",
    ).toEqual([]);
  });

  it("top-level .thetalib control (GREEN): a top-level import draws no import-not-top-level", () => {
    // A `.thetalib` top level admits `import` (it is how libs consume libs). The
    // fix touches only the NESTED position, so a top-level lib import stays legal.
    // GREEN both sides of the fix.
    const doc = parse(
      'import { af } from "./lib.thetalib"\nfn g(x: integer): integer { x }\n',
      "/proj/lib.thetalib",
    );
    expect(
      withCode(doc, IMPORT_NOT_TOP_LEVEL_CODE),
      "top-level .thetalib: the nested-import rule fires only at a nested position — a top-level import stays legal",
    ).toEqual([]);
  });

  it("M4 shape co-fire control (GREEN): a non-.thetalib extension nested in a .theta still fires import-non-thetalib-extension", () => {
    // The doc's M4 partial-policing contrast: the lexer's path-literal extension
    // check is depth-blind and fires wherever the statement parses, so a nested
    // import whose path does not end in `.thetalib` is refused today. The fix
    // must leave this depth-blind shape policing untouched. GREEN at the fork and
    // after.
    const doc = parse(
      'if true { import { af } from "./lib.theta" }\n1\n',
      "/proj/app.theta",
    );
    expect(
      codesOf(doc),
      `M4: shape policing is depth-blind — a nested non-.thetalib import draws theta/parse/import-non-thetalib-extension; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toContain("theta/parse/import-non-thetalib-extension");
  });

  it("breadth — while body (.theta): an import nested in a `while` body draws exactly one import-not-top-level", () => {
    // Widens the walk-breadth lock past `if`/`fn` to a `while` body — another
    // non-top-level statement position the recursive walk reaches. RED at fork.
    const doc = parse(
      'while false {\n  import { zf } from "./missing.thetalib"\n}\n1\n',
      "/proj/app.theta",
    );
    expect(
      withCode(doc, IMPORT_NOT_TOP_LEVEL_CODE).length,
      `breadth while: exactly one import-not-top-level for the nested statement; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
  });

  it("breadth — par-for body (.thetalib): an import nested in a `par for` body inside a fn draws exactly one import-not-top-level", () => {
    // A `par for` body is a non-top-level statement position; nested in a
    // `.thetalib` fn its import draws the nested-position code. RED at fork.
    const doc = parse(
      'fn af(x: integer): integer {\n  let r = par for i in [1] { import { zf } from "./missing.thetalib" i }\n  x\n}\n',
      "/proj/lib.thetalib",
    );
    expect(
      withCode(doc, IMPORT_NOT_TOP_LEVEL_CODE).length,
      `breadth par-for: exactly one import-not-top-level for the nested statement; observed: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
  });
});
