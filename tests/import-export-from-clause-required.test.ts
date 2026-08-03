import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0058 — `parseImportExport` guards the `from` clause with
// `if (this.isKeyword("from"))` (src/parser/theta-document.ts:2856) and leaves
// `path` at `""` when no string token follows (:2859–:2876), so the from-less
// `export { … }` / `import { … }` shape parses with zero diagnostics. That shape
// is a production of no spec page, and it is not inert: in a `.thetalib` its
// specifier names enter the downstream-visible export set through
// `extractThetaLibForms` (src/extension/import-static-checks.ts:118, `fromPath:
// stmt.path`) and `computeThetaLibExports` (src/parser/imports.ts:614–619),
// taking a plain import's local out of `theta/parse/import-unknown-symbol`'s
// emission set; in a `.theta` its `symbols` reach `collectIdentRoots`
// (src/parser/theta-document.ts:4509–4542) and `checkLexicalCallSites` (:5174,
// export arm :5198–:5201), taking an undeclared name out of
// `theta/parse/unknown-identifier`'s emission set at expression position
// (docs/bugs/0058-fromless-export-form-parses-without-spec-production.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/imports.md:29 — §Re-exports introduces one form, "a
//     dedicated form that creates no local binding", spelled `from`-bearing in
//     both examples (:32, :33).
//   - :36 — the section's one negative rule: "A plain `import { Author } … `
//     does **not** re-export `Author` … only declarations and explicit
//     `export ... from` forms are visible to downstream importers". Group (c)
//     is that rule's measured pair.
//   - :38 — §Unknown imported symbol names the specifier four times, always as
//     `export { Foo } from`.
//   - :13 — the permitted `.thetalib` top-level forms name `export` as a
//     keyword and spell no form for it, which is why the `.thetalib` top-level
//     gate does not reach the degenerate spellings.
//   - :27 — §Visibility: every top-level declaration is auto-exported, so the
//     from-less form delivers nothing for a locally declared name.
//   - docs/spec_topics/grammar.md:3 — the appendix restates no surface a topic
//     page owns, so imports.md is the owner and the owner spells only the
//     from-bearing form; the page defines no `ImportDecl` / `ExportDecl`.
//   - docs/spec_topics/expressions.md:47 arm (3) — an identifier resolves to "A
//     symbol imported from a `.thetalib` file". An `export` specifier is not
//     that, which is the basis for §Fix constraint 2 (group (d)).
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix, settled — the route this file
// encodes; RED now, GREEN after):
//   1. A registered parse-phase diagnostic
//      `theta/parse/import-missing-from-clause` (severity E, phase parse) is
//      raised inside `parseImportExport` onto `this.diagnostics` when the
//      specifier list is followed by no `from` keyword, or by a `from` keyword
//      with no string token after it. Both statement kinds.
//   2. ONE diagnostic per STATEMENT, ranged over the statement — never one per
//      specifier (§Fix constraint 1). Group (a)'s multi-specifier fixture is
//      the fence.
//   3. `theta/parse/import-reserved-synthesised-name` keeps its per-specifier
//      emission and CO-EMITS with the new code on a from-less reserved-name
//      specifier (§Fix constraint 1, and the bug doc §Non-goals entry that
//      keeps bug 0040's emission set). Group (e).
//   4. `collectIdentRoots` and `checkLexicalCallSites` narrow their
//      `import` / `export` arms to `import` only (§Fix constraint 2), so a
//      `.theta` carrying a from-BEARING `export { Ghost } from "./lib.thetalib"`
//      plus `Ghost("x")` emits `theta/parse/unknown-identifier` exactly as the
//      bare call does. Group (d).
//
// MEASURED AT HEAD 3e190fbc / 0.59.0 (offline, deterministic; re-derived from
// the bug doc §Reproduction with zero drift). Every fixture below is one of
// these rows:
//   parse, /proj/lib.thetalib
//     "export { greet }"                     diags []  node {path:"",symbols:["greet"]}
//     "export {}"                            diags []  node {path:"",symbols:[]}
//     "export"                               diags []  node {path:"",symbols:[]}
//     "export { greet } from"                diags []  node {path:"",symbols:["greet"]}
//     "export { a, b, c }"                   diags []  node {path:"",symbols:["a","b","c"]}
//     "import { Ghost }"                     diags []  node {path:"",symbols:["Ghost"]}
//     "export { greet } from \"./mid.thetalib\""  diags []  node {path:"./mid.thetalib"}
//     "import { greet } from \"./mid.thetalib\""  diags []  node {path:"./mid.thetalib"}
//     "export { __inline_0123456789abcdef }" diags [error import-reserved-synthesised-name]
//   checkThetaImports, app `import { greet } from "./lib.thetalib"`
//     lib `import {greet} from "./mid.thetalib"`            import diags [import-unknown-symbol]
//     lib same + `export { greet }`                          import diags []
//     lib `export { Ghost }`, app imports Ghost              import diags []  materialised []
//   parse, /proj/app.theta (`model: "sonnet"`, `mode: prompt`)
//     `let r = Ghost("x")` + `r`                             [error unknown-identifier]
//     `export { Ghost } from "./lib.thetalib"` + same        []
//     `import { Ghost } from "./lib.thetalib"` + same        []
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` over a string, or inside one `checkThetaImports` over
// an in-memory `FileSystem` double exposing the `readdir` / `readBytes` members
// that pass reads (the shape tests/subagent-fn.test.ts:1581–1614 uses). The
// refusal's seam is the parser, so an integration tier would add a discovery
// round trip to a decision the parser has already made, and could not assert a
// diagnostic's ABSENCE any more sharply than groups (b) and (d) do; a live tier
// would add a provider to a decision no model participates in.
//
// NO SILENT SKIPPING: the registry row for the new code does not exist at HEAD
// (the implementer adds it in the same commit, per DIAG-2). Every expected
// message is read from the registry, and the read FAILS LOUDLY naming the
// missing row rather than skipping — an unmet precondition is an explicit
// failure, never a pass. Each emission assertion runs BEFORE its message
// assertion so the red names the absent diagnostic first.

// ===========================================================================
// The registered code and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

const CODE = "theta/parse/import-missing-from-clause";

/** Bug 0040's per-specifier code, which co-emits with `CODE` (group (e)). */
const RESERVED_CODE = "theta/parse/import-reserved-synthesised-name";

/** The rule imports.md :36 states negatively and group (c) measures. */
const UNKNOWN_SYMBOL_CODE = "theta/parse/import-unknown-symbol";

/** The expression-position refusal §Fix constraint 2 restores (group (d)). */
const UNKNOWN_IDENTIFIER_CODE = "theta/parse/unknown-identifier";

/**
 * The normative *Message* template the fix must land in the registry, written
 * literally HERE ONCE — group (a0) asserts the registry row equals it, and every
 * other expected string in this file comes from the REGISTRY READ. The message
 * carries no placeholder: the category-3 `<construct>` table is closed, and one
 * diagnostic per statement has no per-specifier name to render.
 */
const EXPECTED_TEMPLATE =
  "import / export specifier list requires a 'from' clause with a .thetalib path literal";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* string (DIAG-4).
 *
 * An absent row is an unmet precondition, so this fails loudly naming the
 * registry page and the code rather than returning a placeholder a later
 * comparison would red on obscurely.
 */
function normativeMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `no registry row for ${code} — DIAG-4 anchor: ` +
      `docs/spec_topics/diagnostics/code-registry-parse.md must carry its Message row ` +
      `(mirrored into docs/reference/diagnostics.md in the same commit, DIAG-2)`,
  ).toBeDefined();
  return template as string;
}

/** The new code's message, with the placeholder-free template rendered as-is. */
function missingFromMessage(): string {
  return normativeMessage(CODE);
}

// ===========================================================================
// Parse drivers and diagnostic readers.
// ===========================================================================

/** Parse a source string at `path` through the shipped whole-document pipeline. */
function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

/**
 * Parse a `.thetalib` body. The extension drives the top-level-form gate, and
 * `export` / `import` are permitted forms there (imports.md :13), so a
 * degenerate spelling draws no `theta/parse/thetalib-top-level-statement` noise.
 */
function parseLib(body: string): ThetaDocument {
  return parse(`${body}\n`, "/proj/lib.thetalib");
}

/** The importing `.theta` frontmatter every `.theta` fixture shares. */
const APP_FRONTMATTER = ['---', 'model: "sonnet"', "mode: prompt", '---'].join("\n");

/** Parse a `.theta` body under the shared frontmatter. */
function parseApp(body: string): ThetaDocument {
  return parse(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic's code, in emission order. */
function diagCodes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

/** The diagnostics carrying `code`, in emission order. */
function withCode(diagnostics: readonly Diagnostic[], code: string): Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

/**
 * Whether a diagnostic un-registers the theta that carries it: error severity in
 * the `theta/parse/` or `theta/load/` namespace. Mirrors the shipped predicate
 * `isRegistrationError` (src/extension/import-static-checks.ts:180), which is
 * module-private, so the drop disposition is asserted on the same two properties
 * the load pass reads rather than by re-driving discovery.
 */
function isRegistrationError(diagnostic: Diagnostic): boolean {
  return (
    diagnostic.severity === "error" &&
    (diagnostic.code.startsWith("theta/parse/") || diagnostic.code.startsWith("theta/load/"))
  );
}

// ===========================================================================
// The in-memory `.thetalib` filesystem double (the shape
// tests/subagent-fn.test.ts:1581–1614 uses). Only `readdir` / `readBytes` are
// exercised by `checkThetaImports`; every other member rejects, so an
// unexpected call reds instead of silently returning a stand-in value.
// ===========================================================================

function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const name = path.slice(slash + 1);
    const entries = dirs.get(parent) ?? [];
    entries.push(name);
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  };
}

/** The load-pass result for one importing `.theta` body over one lib set. */
async function loadImports(
  appBody: string,
  libs: Record<string, string>,
): Promise<{ readonly diagnostics: readonly Diagnostic[]; readonly materialised: string[] }> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse, or the load pass reads nothing. Diagnostics: ${JSON.stringify(diagLines(app.diagnostics))}`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const result = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return {
    diagnostics: result.diagnostics,
    materialised: result.imports.map((m) => `${m.kind} ${m.name}`),
  };
}

// ===========================================================================
// The shared refusal contract: ONE diagnostic per statement, ranged over the
// statement, at error severity, carrying the registry's message.
// ===========================================================================

/**
 * Assert the statement-level refusal on a `.thetalib` fixture whose statement is
 * the file's first token.
 *
 * The count assertion runs FIRST so the red at HEAD names the symptom the bug
 * reports — a shape no page defines parsing with zero diagnostics — rather than
 * a downstream message or range mismatch. The range is checked against the
 * hard-coded statement start rather than against the parsed node's own range, so
 * the oracle is independent of the node the parser built.
 */
function expectStatementRefusal(label: string, doc: ThetaDocument): void {
  const hits = withCode(doc.diagnostics, CODE);
  expect(
    hits.length,
    `${label}: expected the parse to emit exactly one ${CODE}. imports.md :29 defines one re-export form and spells it \`from\`-bearing (:32, :33), and grammar.md :3 leaves the surface to that page, so a specifier list with no \`from\` clause and no path literal is a shape the language does not define. Rendered diagnostics: ${JSON.stringify(diagLines(doc.diagnostics))}`,
  ).toBe(1);
  const diagnostic = hits[0] as Diagnostic;
  expect(
    diagnostic.severity,
    `${label}: severity E — the refusal un-registers the file, and only an error-severity \`theta/parse/\` code reaches the load pass' registration drop (src/extension/import-static-checks.ts:180)`,
  ).toBe("error");
  const range = diagnostic.range;
  expect(
    range,
    `${label}: a \`theta/parse/*\` row is a located site (diagnostics/diagnostic-shape.md), so the diagnostic carries a range; observed ${JSON.stringify(diagnostic)}`,
  ).toBeDefined();
  expect(
    (range as { start: { line: number; column: number } }).start,
    `${label}: §Fix constraint 1 — the refusal is the STATEMENT's, so the range starts at the \`import\` / \`export\` keyword, not at a specifier`,
  ).toEqual({ line: 1, column: 1 });
  expect(
    (range as { end: { column: number } }).end.column,
    `${label}: the range spans at least the statement keyword (six characters, end column exclusive)`,
  ).toBeGreaterThanOrEqual(7);
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's *Message* column verbatim`,
  ).toBe(missingFromMessage());
}

// ===========================================================================
// (a0) THE DIAG-4 REGISTRY ANCHOR.
// RED at HEAD: the row does not exist, so the red names the registry page.
// ===========================================================================

describe("bug 0058 (a0) — the refusal code has a registry row", () => {
  it(`RED (a0): code-registry-parse.md carries ${CODE} with the normative Message, severity E, phase parse`, () => {
    // A registry addition is a DIAG-2 operation, covered within a theta 1.x
    // minor by the GOV-15 diagnostic-registry carve-out
    // (governance/source-language-stability.md:25) "for inputs that did not
    // previously emit the added code" — which is every input in this file, the
    // corpus carrying zero `export` statements of either form.
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `no registry row for ${CODE} — the Imports cluster of ` +
        `docs/spec_topics/diagnostics/code-registry-parse.md must carry it (after the ` +
        `${RESERVED_CODE} row), mirrored into docs/reference/diagnostics.md`,
    ).toBeDefined();
    expect(
      (row as RegistryRow).message,
      "DIAG-4 — the Message column is normative character-for-character, and carries no placeholder: one diagnostic per statement has no per-specifier name to render, and the category-3 `<construct>` table is closed",
    ).toBe(EXPECTED_TEMPLATE);
    expect(
      (row as RegistryRow).severity,
      "severity E — the shape is refused, and only an error-severity code reaches the registration drop gate",
    ).toBe("E");
    expect(
      (row as RegistryRow).phase,
      "phase parse — the check is raised inside `parseImportExport` beside `validatePathLiteral` (src/parser/theta-document.ts:2868–2874), so `parseThetaDocument` alone witnesses it with no `.thetalib` resolution",
    ).toBe("parse");
  });
});

// ===========================================================================
// (a) THE DEGENERATE SPELLINGS — one diagnostic per statement, both keywords.
// RED at HEAD: every fixture parses with zero diagnostics and yields a node with
// `path: ""` and a fully populated `symbols` list.
// ===========================================================================

describe("bug 0058 (a) — a specifier list with no `from` path literal is refused once per statement", () => {
  const DEGENERATE: ReadonlyArray<readonly [string, string]> = [
    ["export { greet }", "the from-less re-export the bug reports"],
    ["export {}", "an empty specifier list, which the same optionality admits"],
    ["export", "the bare keyword, which parses to the same empty-path node"],
    ["export { greet } from", "a `from` keyword with no path literal after it"],
    ["import { Ghost }", "the `import` analogue — one function parses both keywords"],
    ["import { greet } from", "the `import` analogue of the path-less `from`"],
  ];

  for (const [spelling, why] of DEGENERATE) {
    it(`RED (a, ${JSON.stringify(spelling)}): exactly one ${CODE} — ${why}`, () => {
      const doc = parseLib(spelling);
      expectStatementRefusal(`spelling ${JSON.stringify(spelling)}`, doc);
      expect(
        diagCodes(doc.diagnostics).filter((code) => code !== CODE),
        `spelling ${JSON.stringify(spelling)}: the refusal is the only disposition change — no other code appears. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
      ).toEqual([]);
    });
  }

  it("RED (a-per-statement): a three-specifier from-less list still raises exactly ONE diagnostic", () => {
    // §Fix constraint 1: "One diagnostic per `export` / `import` statement
    // missing its `from` clause, ranged over the statement, not one per
    // specifier." A per-specifier emission would report the same missing clause
    // three times for one statement, and would diverge from bug 0040's
    // per-specifier check, which this input also reaches on its own terms.
    const doc = parseLib("export { a, b, c }");
    expectStatementRefusal("three-specifier from-less list", doc);
  });
});

// ===========================================================================
// (b) THE FROM-BEARING CONTROLS — the fence against widening the refusal.
// GREEN at HEAD and required to stay green in both directions: these are the two
// spellings imports.md :29–:33 and :38 define, and the refusal must not reach
// them.
// ===========================================================================

describe("bug 0058 (b) — a `from` clause with a `.thetalib` path literal stays silent", () => {
  const LEGAL: ReadonlyArray<readonly [string, string]> = [
    ['export { greet } from "./m.thetalib"', "imports.md :32 — the re-export the page defines"],
    ['import { greet } from "./m.thetalib"', "imports.md :5 — the plain import"],
    [
      'export { greet as hello } from "./m.thetalib"',
      "imports.md :33 — the aliased re-export",
    ],
  ];

  for (const [spelling, why] of LEGAL) {
    it(`GREEN (b, ${JSON.stringify(spelling)}): no ${CODE} — ${why}`, () => {
      const doc = parseLib(spelling);
      expect(
        withCode(doc.diagnostics, CODE),
        `${spelling}: the refused inputs are exactly a missing \`from\` keyword or a \`from\` with no string token after it (bug doc §Fix, GOV-15 post-hoc in-scope set); a spelling the page defines must keep loading cleanly`,
      ).toEqual([]);
      expect(
        diagLines(doc.diagnostics),
        `${spelling}: this fixture is legal input at every position and carries no diagnostic of any code`,
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// (c) THE imports.md :36 PAIR, through the REAL load pass.
// The control is GREEN at HEAD and must stay green; the from-less case is RED —
// today the export line removes the control's refusal, which is the reversal of
// the section's one negative rule.
// ===========================================================================

describe("bug 0058 (c) — a from-less export cannot make a plain import's local downstream-visible", () => {
  const APP_BODY = 'import { greet } from "./lib.thetalib"\nlet x = 1\n';
  const MID = "fn greet(x: string) { x }\n";
  const LIB_PLAIN_IMPORT = 'import { greet } from "./mid.thetalib"\n';

  it(`GREEN (c-control): a plain import alone does NOT re-export, so the downstream specifier draws ${UNKNOWN_SYMBOL_CODE}`, () => {
    // imports.md :36 is implemented once, by omission: `computeThetaLibExports`
    // (src/parser/imports.ts:614–619) unions declarations with re-exports and
    // excludes `forms.plainImports`. This is the enforced half of the rule and
    // the pin the from-less case must not remove.
    return loadImports(APP_BODY, {
      "/proj/lib.thetalib": LIB_PLAIN_IMPORT,
      "/proj/mid.thetalib": MID,
    }).then((result) => {
      expect(
        diagLines(result.diagnostics),
        `imports.md :36 — "A plain \`import { Author } … \` does **not** re-export \`Author\`"; the downstream specifier must draw ${UNKNOWN_SYMBOL_CODE}`,
      ).toEqual([
        `error ${UNKNOWN_SYMBOL_CODE}: ${normativeMessage(UNKNOWN_SYMBOL_CODE)
          .replace("<name>", "greet")
          .replace("<path>", "./lib.thetalib")}`,
      ]);
      expect(
        result.materialised,
        "the rule's other half: nothing binds downstream either",
      ).toEqual([]);
    });
  });

  it(`RED (c-refusal): adding a from-less \`export { greet }\` beside the plain import is refused AT THE LIB`, () => {
    // The two libs are byte-identical apart from the export line, and at HEAD
    // that line silently removes the control's refusal while materialising
    // nothing. The refusal at the lib is what closes the reversal: the lib's own
    // parse error propagates to the importer through IMP-4
    // (src/extension/import-static-checks.ts:370–381).
    return loadImports(APP_BODY, {
      "/proj/lib.thetalib": `${LIB_PLAIN_IMPORT}export { greet }\n`,
      "/proj/mid.thetalib": MID,
    }).then((result) => {
      expect(
        withCode(result.diagnostics, CODE).length,
        `the lib's from-less export must be refused at parse and surface through the importing theta's load pass, so the shape can no longer take the downstream specifier out of ${UNKNOWN_SYMBOL_CODE}'s emission set. Rendered: ${JSON.stringify(diagLines(result.diagnostics))}`,
      ).toBe(1);
      expect(
        (withCode(result.diagnostics, CODE)[0] as Diagnostic).message,
        "DIAG-4 — the propagated message is the registry row's",
      ).toBe(missingFromMessage());
      expect(
        result.diagnostics.some(isRegistrationError),
        "the importing theta does not register: IMP-4 collects the resolved `.thetalib`'s error-severity parse diagnostics",
      ).toBe(true);
      expect(
        result.materialised,
        "the from-less export binds nothing, before the fix and after",
      ).toEqual([]);
    });
  });
});

// ===========================================================================
// (d) EXPRESSION POSITION IN A `.theta`, pinned in BOTH directions.
// §Fix constraint 2 narrows `collectIdentRoots` / `checkLexicalCallSites` to the
// `import` arm, on expressions.md :47 arm (3) — an identifier resolves to "A
// symbol imported from a `.thetalib` file", which an `export` specifier is not.
// ===========================================================================

describe("bug 0058 (d) — an `export` statement does not widen a `.theta`'s identifier scope", () => {
  const CALL = 'let r = Ghost("x")\nr\n';

  function unknownIdentifierLine(name: string): string {
    return `error ${UNKNOWN_IDENTIFIER_CODE}: ${normativeMessage(UNKNOWN_IDENTIFIER_CODE).replace("<name>", name)}`;
  }

  it(`GREEN (d-control): a bare call to an undeclared name is ${UNKNOWN_IDENTIFIER_CODE}`, () => {
    // The pin §Fix constraint 2 names. A `.theta` with no binding for `Ghost`
    // keeps this refusal, which is the check that catches a typo in a callee.
    expect(
      diagLines(parseApp(CALL).diagnostics),
      "expressions.md :47 — an identifier in expression position resolves against declarations, params, imported `.thetalib` symbols and builtins; `Ghost` is none of them",
    ).toEqual([unknownIdentifierLine("Ghost")]);
  });

  it(`RED (d-export): a from-BEARING \`export { Ghost } from\` leaves the call unresolved too`, () => {
    // imports.md's opening paragraph makes `.theta` files non-importable, so no
    // `export` in one is ever read, and imports.md :29 says the re-export form
    // creates no local binding in a `.thetalib` either. Both walks fold `export`
    // symbols into the root scope today
    // (src/parser/theta-document.ts:4521–4526, :5198–:5201), which is the seam
    // that silences the control above.
    const doc = parseApp(`export { Ghost } from "./lib.thetalib"\n${CALL}`);
    expect(
      withCode(doc.diagnostics, UNKNOWN_IDENTIFIER_CODE).length,
      `§Fix constraint 2 — the \`export\` arm of \`collectIdentRoots\` / \`checkLexicalCallSites\` narrows to \`import\`, so this document's diagnostics match the bare control's. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
    ).toBe(1);
    expect(
      diagLines(doc.diagnostics),
      "the from-bearing form in a `.theta` keeps parsing cleanly on its own terms (bug doc §Non-goals), so the only diagnostic is the unresolved call",
    ).toEqual([unknownIdentifierLine("Ghost")]);
  });

  it(`GREEN (d-import): a from-bearing \`import { Ghost } from\` still binds the name`, () => {
    // The fence on constraint 2's reach: the `import` arm is arm (3) of
    // expressions.md :47 and survives. Narrowing both arms would red here.
    const doc = parseApp(`import { Ghost } from "./lib.thetalib"\n${CALL}`);
    expect(
      withCode(doc.diagnostics, UNKNOWN_IDENTIFIER_CODE),
      "an import specifier binds its local name, so the call resolves at parse; the `.thetalib` is resolved by the load pass, not here",
    ).toEqual([]);
    expect(
      diagLines(doc.diagnostics),
      "the plain import is legal input and carries no diagnostic of any code",
    ).toEqual([]);
  });
});

// ===========================================================================
// (e) CO-EMISSION WITH BUG 0040's PER-SPECIFIER CHECK.
// §Fix constraint 1 keeps `theta/parse/import-reserved-synthesised-name`'s
// current emission set, and the bug doc §Non-goals repeats it. The two codes
// answer different questions about the same statement, so both appear.
// ===========================================================================

describe("bug 0058 (e) — the reserved-name check keeps firing and co-emits with the refusal", () => {
  const RESERVED_BINDING = "__inline_0123456789abcdef";

  it(`RED (e): a from-less \`export { ${RESERVED_BINDING} }\` emits BOTH codes`, () => {
    const doc = parseLib(`export { ${RESERVED_BINDING} }`);
    expect(
      withCode(doc.diagnostics, CODE).length,
      `the statement has no \`from\` clause, so the statement-level refusal applies. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
    ).toBe(1);
    expect(
      withCode(doc.diagnostics, RESERVED_CODE).length,
      `§Fix constraint 1 — bug 0040's per-specifier check keeps its emission on this input; narrowing it to from-bearing statements would reopen the seam its round-3 adjudication closed (a lib must not offer a name no client may bind). Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
    ).toBe(1);
    expect(
      diagLines(doc.diagnostics).sort(),
      "the two codes answer different questions — the statement's missing clause and the specifier's reserved local binding — so both render, each provable red-able on its own",
    ).toEqual(
      [
        `error ${CODE}: ${missingFromMessage()}`,
        `error ${RESERVED_CODE}: ${normativeMessage(RESERVED_CODE).replace("<name>", RESERVED_BINDING)}`,
      ].sort(),
    );
  });

  it(`GREEN (e-control): the from-BEARING reserved-name spelling keeps its single diagnostic`, () => {
    // The fence that the statement-level refusal reads the `from` clause and
    // nothing else: the same specifier with a path literal draws bug 0040's code
    // alone.
    const doc = parseLib(`export { ${RESERVED_BINDING} } from "./m.thetalib"`);
    expect(
      diagLines(doc.diagnostics),
      `the \`from\` clause is present with a \`.thetalib\` path literal, so only the per-specifier check fires`,
    ).toEqual([
      `error ${RESERVED_CODE}: ${normativeMessage(RESERVED_CODE).replace("<name>", RESERVED_BINDING)}`,
    ]);
  });
});

// ===========================================================================
// (f) THE DOWNSTREAM EXPORT SET.
// A from-less `export { Ghost }` is the input class with no source file at all:
// `computeThetaLibExports` admits the name and `materializeSymbol` finds no
// declaration, so IMP-3 passes and the environment holds nothing.
// RED at HEAD: the whole path is silent — app parse, load pass, and export set.
// ===========================================================================

describe("bug 0058 (f) — a from-less export does not offer a downstream-visible name", () => {
  const APP_BODY = 'import { Ghost } from "./lib.thetalib"\nlet x = 1\n';

  it("RED (f): importing a name a from-less export invents is refused, and still binds nothing", () => {
    return loadImports(APP_BODY, { "/proj/lib.thetalib": "export { Ghost }\n" }).then((result) => {
      expect(
        withCode(result.diagnostics, CODE).length,
        `bug doc §Expected — "The export set is a function of what the file re-exports": a specifier that names no file is neither of the two sources src/parser/imports.ts:609–612 admits, so the lib must not load cleanly and offer \`Ghost\`. Rendered: ${JSON.stringify(diagLines(result.diagnostics))}`,
      ).toBe(1);
      expect(
        result.diagnostics.some(isRegistrationError),
        "bug doc §Why it matters — the consuming theta reaches the runtime with the name unbound today; an error-severity refusal at the lib un-registers it instead",
      ).toBe(true);
      expect(
        result.materialised,
        "`materializeSymbol` searches the resolved lib's own top-level declarations by source name, and a from-less export names none — before the fix and after",
      ).toEqual([]);
    });
  });

  it("GREEN (f-control): a declaration in the lib is auto-exported and materialises", () => {
    // imports.md :27 — the fence that the refusal reaches the from-less shape
    // only, and leaves the ordinary import/declaration path intact.
    return loadImports('import { greet } from "./lib.thetalib"\nlet x = 1\n', {
      "/proj/lib.thetalib": "fn greet(x: string) { x }\n",
    }).then((result) => {
      expect(
        diagLines(result.diagnostics),
        "a resolvable import of an auto-exported declaration is the passing control the load pass preserves",
      ).toEqual([]);
      expect(result.materialised, "the imported `fn` materialises into the runtime environment").toEqual([
        "fn greet",
      ]);
    });
  });
});
