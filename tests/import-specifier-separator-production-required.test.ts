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

// Bug 0211 — the `ImportDecl` / `ExportDecl` productions spell the specifier
// list as `"{" ImportSpec ("," ImportSpec)* ","? "}"`: a `,` BETWEEN two
// specifiers, exactly one optional trailing `,`, and each element an
// `ImportSpec` (`Ident` or `Ident "as" Ident`). The specifier loop enforces
// neither the separator nor the specifier boundary. Its head re-enters on any
// ident-or-keyword with no separator state (src/parser/theta-document.ts:3049,
// inside `parseImportExport` at :3017), its comma arm consumes any `,`
// unconditionally and uncounted (:3126–3135), and its catch-all discards any
// token it does not classify (:3136–3141). So `{ a b }` delivers byte-for-byte
// what `{ a, b }` delivers, `{ , a }` delivers `{ a }`'s list, `{ a as b c }`
// adds a specifier the author never wrote, and `{ a, 42 }` drops the `42`.
// None of it is reported: bug 0100's statement arm returns `undefined` for
// `hasBraces && specifierCount > 0` (`checkImportMalformedSpecifierList`,
// src/parser/imports.ts:444) and its specifier arm reads a per-specifier
// boolean that a taken alias leaves false (`checkImportDanglingAlias`, :476),
// so a degeneracy recovered into a non-empty, alias-complete list has no
// subject in either arm.
//
// SPEC ANCHORS (the contract, not the current code — every line re-derived at
// this worktree's HEAD fdcb0835 / 0.144.0):
//   - docs/spec_topics/imports.md:62–63 — `ImportDecl` / `ExportDecl`. The
//     separator is part of the production: `("," ImportSpec)*` requires a `,`
//     before each subsequent specifier, and `","?` admits exactly ONE trailing
//     comma. `{ a, , }` carries two, so it is outside the production.
//   - :64–65 — `ImportSpec` / `ExportSpec` admit `Ident` or
//     `Ident "as" Ident` and nothing else, so `a as b c`, `a: b`, `42` and
//     `"x"` are elements neither production spells.
//   - :68–71 — 0058's from-clause refusal, whose subject is the trailing
//     clause; every spelling refused below carries `from "./m.thetalib"`, so
//     that sentence does not reach them.
//   - :73–87 — 0100's re-derived refusal prose and its two granularities: an
//     absent or zero-specifier list once per statement ranged over the
//     statement, a dangling `as` once per malformed specifier ranged over that
//     specifier. Mirrored for users at docs/reference/grammar.md:34–37 (the
//     productions) and :58–64 (the refusal sentence).
//   - :13 — the permitted `.thetalib` top-level forms name `import` and
//     `export`, so a degenerate spelling in a `.thetalib` draws no
//     `theta/parse/thetalib-top-level-statement` noise and the whole-list
//     assertions below read only the codes under test.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:122 — the
//     `theta/parse/import-malformed-specifier-list` row whose *Trigger* this
//     fix widens; :121 the `import-missing-from-clause` row whose *Trigger*
//     owns the no-`from` complement.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2) — a
//     *Trigger* change is a spec change, mirrored in the same commit.
//   - docs/spec_topics/governance/source-language-stability.md:5 (GOV-15), :7
//     (the loads-cleanly predicate), :23 (the diagnostic-registry carve-out,
//     which disposes a DIAG-2 *Trigger* change "as an addition for inputs newly
//     brought into the code's emission set" — every spelling refused below
//     loads cleanly today, and the corpus carries zero occurrences).
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix constraints 1–7, adjudicated and
// SETTLED at the bug document's §Fix and mirrored into
// docs/spec_topics/diagnostics/code-registry-parse.md:122 and
// docs/spec_topics/imports.md §Re-exports — this file encodes it and does not
// re-litigate it):
//   1. REGISTRY DISPOSITION: WIDEN `theta/parse/import-malformed-specifier-list`'s
//      *Trigger* to state the separator and discarded-token shapes. The landed
//      *Message* renders truthfully on every input in the class (`{ a b }`'s
//      body element is neither a `Name` nor a `Name as Alias`), so no DIAG-4
//      reword is engaged and the *Message* stays byte-identical; a new row
//      would put a second code on one production for no admission gain.
//      Group (a0) is that anchor.
//   2. GRANULARITY: STATEMENT-level, ranged over the whole statement (§Fix
//      constraint 2). The fact is a property of the LIST's token sequence, not
//      of any one specifier — `{ a b }` has no offending specifier, both are
//      well-formed `Ident`s; what fails is the sequence between them. A
//      per-offending-token arm would emit three diagnostics on `{ a b c d }`
//      and introduce a third range kind for one code. Every (a) cell asserts
//      the range, which is what pins this.
//   3. GATE: the same trailing-clause gate as 0100's statement arm —
//      `hasFromKeyword && hasPathLiteral`. §Fix constraint 1's refused set is
//      from-bearing throughout, a from-less degenerate list is already refused
//      at error severity by `theta/parse/import-missing-from-clause`, and
//      keeping the gate keeps that code's *Trigger* claim that the statement
//      arm never co-emits with it TRUE. Group (c)'s no-`from` rows are that
//      fence.
//   4. SUPPRESSION: the arm answers only for a list the other two arms leave
//      admitted — silent when the recovered list is EMPTY (0100's
//      zero-specifier subject) or when ANY specifier carried a dangling `as`
//      (0100's specifier subject). Consequence: at most ONE statement-ranged
//      `import-malformed-specifier-list` per statement, and the three arms
//      partition. Group (c)'s from-bearing rows are that fence, and the
//      exactly-one count in group (a) is exact because of it.
//   5. NODE SHAPE UNCHANGED (§Non-goals "the recovery shape after refusal"):
//      this fix adds diagnostics only, so `symbols` for `{ a as b c }` stays
//      `["b","c"]` and every downstream reader sees the value it sees today.
//      No invariant is asserted at the readers (§Fix constraint 7):
//      `checkThetaImports` reaches `extractThetaLibForms` over a
//      refused-but-parsed lib regardless, so an assert there would crash on
//      refused input. Groups (a) and (e) assert the node UNCHANGED beside the
//      new refusal.
//
// MEASURED AT THIS HEAD (fdcb0835 / 0.144.0), offline and deterministic, by
// scratch probes driving the same two seams this file drives; every expected
// node shape and every already-landed code list below is one of those measured
// rows, re-derived here rather than copied from the bug doc's `af221903`
// reproduction. Parse rows, at /proj/lib.thetalib, on BOTH keywords:
//   "{ a, , b }" "{ a,, b }" "{ a, , , b }" "{ a b }" "{ a "x" b }" "{ a: b }"
//                                       diags []  symbols ["a","b"]
//   "{ , a }" "{ ,, a }" "{ a, , }" "{ a, 42 }"  diags []  symbols ["a"]
//   "{ a b c }" "{ a b, c }"                diags []  symbols ["a","b","c"]
//   "{ a b c d }"                       diags []  symbols ["a","b","c","d"]
//   "{ a as b c }" "{ a as b as c }"  diags []  symbols ["b","c"]
//   "{ a as b c as d }"               diags []  symbols ["b","d"]
//   "{ a }" "{ a, b }" "{ a as b }" "{ a as b, c }" "{ a, }"    diags []
//   "{}" "{ , }" "{ as }"      [import-malformed-specifier-list @1:1]
//   "{ a as }" "{ a as , b }" "{ a as as b }"
//                              [import-malformed-specifier-list @1:10]
//   bare `import` / `export`, `import {}` / `export {}`, `import { a b }` /
//   `export { a b }` (all no-`from`)  [import-missing-from-clause @1:1]
//   `{ a b } from "./m.theta"`  [import-non-thetalib-extension @1:21–1:32]
//   `{ a __inline_0123456789abcdef } from "./m.thetalib"`
//                     [import-reserved-synthesised-name @1:12–1:37]
// Load rows, through the real `checkThetaImports` over an in-memory
// `FileSystem`, lib declaring `fn a` / `fn b`:
//   `import { a b } from "./lib.thetalib"`   parse [] load [] mat ["fn a","fn b"]
//   `import { a, b } from "./lib.thetalib"`  parse [] load [] mat ["fn a","fn b"]
//   `import { a as b c } from "./lib.thetalib"`
//        parse []  load [import-unknown-symbol on 'c']  mat ["fn b"]
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` over a string, or inside one `checkThetaImports`
// over an in-memory `FileSystem` double exposing the `readdir` / `readBytes`
// members the load pass reads — the same two seams bug 0100's witness uses
// (tests/import-specifier-list-production-required.test.ts). The refusal's seam
// is the parser, so an integration tier would add a discovery round trip to a
// decision the parser has already made, and could not assert a diagnostic's
// ABSENCE any more sharply than groups (b) and (c) do; a live tier would add a
// provider to a decision no model participates in.
//
// NO SILENT SKIPPING: every expected message comes from a REGISTRY READ, and an
// absent row FAILS LOUDLY naming the page and the code rather than returning a
// placeholder that a later comparison would red on obscurely. Each emission
// assertion runs BEFORE its message assertion, so a red names the absent
// diagnostic first.

// ===========================================================================
// The registered codes.
// ===========================================================================

/** The code whose *Trigger* the fix widens to cover this class. */
const CODE = "theta/parse/import-malformed-specifier-list";

/** 0058's trailing-clause refusal, which owns the no-`from` complement. */
const MISSING_FROM_CODE = "theta/parse/import-missing-from-clause";

/** The path-literal refusal the statement arm co-emits with (group (d)). */
const EXTENSION_CODE = "theta/parse/import-non-thetalib-extension";

/** Bug 0040's per-specifier code, reachable via a missing separator (group (d)). */
const RESERVED_CODE = "theta/parse/import-reserved-synthesised-name";

/** The refusal the phantom specifier draws at the load pass (group (e)). */
const UNKNOWN_SYMBOL_CODE = "theta/parse/import-unknown-symbol";

/**
 * The landed *Message* the widening leaves byte-identical (§Fix constraint 3's
 * widening disposition): read the way the production reads the list —
 * separator-delimited elements each of which must be an `ImportSpec` — it is
 * true of every enumerated spelling, so DIAG-4 is not engaged.
 */
const EXPECTED_TEMPLATE =
  "import / export specifier list must carry at least one specifier, each 'Name' or 'Name as Alias'";

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
 * registry page and the code rather than returning a placeholder.
 */
function normativeMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `no registry row for ${code} — DIAG-4 anchor: ` +
      "docs/spec_topics/diagnostics/code-registry-parse.md must carry its Message row",
  ).toBeDefined();
  return template as string;
}

/** The widened code's message; the template is placeholder-free, so it renders as-is. */
function malformedListMessage(): string {
  return normativeMessage(CODE);
}

// ===========================================================================
// Parse drivers and diagnostic readers (the helper set bug 0100's witness
// established, tests/import-specifier-list-production-required.test.ts).
// ===========================================================================

/** Parse a source string at `path` through the shipped whole-document pipeline. */
function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

/**
 * Parse a `.thetalib` body. `import` / `export` are both permitted top-level
 * forms there (imports.md:13), so a degenerate spelling on either keyword draws
 * no `theta/parse/thetalib-top-level-statement` noise.
 */
function parseLib(body: string): ThetaDocument {
  return parse(`${body}\n`, "/proj/lib.thetalib");
}

/** The importing `.theta` frontmatter every `.theta` fixture shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

/** The line the first body statement occupies under `APP_FRONTMATTER`. */
const APP_FIRST_BODY_LINE = 5;

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
 * Whether a diagnostic un-registers the theta that carries it: error severity
 * in the `theta/parse/` or `theta/load/` namespace. Mirrors the shipped
 * predicate `isRegistrationError` (src/extension/import-static-checks.ts:216),
 * which is module-private, so the disposition is asserted on the same two
 * properties the load pass reads rather than by re-driving discovery.
 */
function isRegistrationError(diagnostic: Diagnostic): boolean {
  return (
    diagnostic.severity === "error" &&
    (diagnostic.code.startsWith("theta/parse/") || diagnostic.code.startsWith("theta/load/"))
  );
}

/** The parsed statement, for the node-shape assertions (§Non-goals). */
interface ImportNodeShape {
  readonly symbols: readonly string[];
  readonly specifiers: ReadonlyArray<{ readonly source: string; readonly local: string }>;
}

/** The first top-level statement, read as an `ImportDecl` / `ExportDecl`. */
function firstStatement(doc: ThetaDocument): ImportNodeShape {
  const statements = (doc.body as { statements: readonly unknown[] }).statements;
  expect(
    statements.length,
    `the fixture must parse to at least one top-level statement, or there is no node to read. Diagnostics: ${JSON.stringify(diagLines(doc.diagnostics))}`,
  ).toBeGreaterThan(0);
  return statements[0] as ImportNodeShape;
}

/** `[source, local]` pairs, the shape the bug doc §Reproduction records. */
function specifierPairs(doc: ThetaDocument): Array<readonly [string, string]> {
  return firstStatement(doc).specifiers.map((s) => [s.source, s.local] as const);
}

// ===========================================================================
// The in-memory `.thetalib` filesystem double. Only `readdir` / `readBytes` are
// exercised by `checkThetaImports`; every other member rejects, so an
// unexpected call reds instead of silently returning a stand-in value.
// ===========================================================================

function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
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
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
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
// The refusal oracle: exactly one statement-ranged diagnostic of `CODE`,
// asserted independently of the node the parser built.
// ===========================================================================

/**
 * Assert exactly one statement-ranged refusal, at error severity, carrying the
 * registry's message.
 *
 * The count assertion runs FIRST so a red names the symptom the bug reports —
 * a separator-degenerate list parsing with zero diagnostics — rather than a
 * downstream message or range mismatch. The count is EXACTLY one, not at least
 * one, because the suppression rule (§Fix constraint 2's partition, carried
 * in `code-registry-parse.md:122`'s partition sentence) makes the three arms
 * of this code partition: this arm is silent whenever the recovered list is
 * empty or any specifier carried a dangling `as`.
 */
function expectStatementRefusal(label: string, doc: ThetaDocument, line = 1): void {
  const hits = withCode(doc.diagnostics, CODE);
  expect(
    hits.length,
    `${label}: expected exactly one ${CODE}. imports.md:62–63 put the separator inside the production — a \`,\` before each subsequent specifier and exactly one optional trailing \`,\` — and :64–65 admit only \`Ident\` or \`Ident "as" Ident\` as an element, so a list whose separators do not conform, or from which a token was discarded, is a shape the language does not define. Rendered diagnostics: ${JSON.stringify(diagLines(doc.diagnostics))}`,
  ).toBe(1);
  const diagnostic = hits[0] as Diagnostic;
  expect(
    diagnostic.severity,
    `${label}: severity E — the refusal un-registers the file, and only an error-severity \`theta/parse/\` code reaches the load pass' registration drop (src/extension/import-static-checks.ts:216)`,
  ).toBe("error");
  expect(
    isRegistrationError(diagnostic),
    `${label}: the disposition is a registration drop, on the same two properties the load pass reads`,
  ).toBe(true);
  const range = diagnostic.range as
    | { start: { line: number; column: number }; end: { line: number; column: number } }
    | undefined;
  expect(
    range,
    `${label}: a \`theta/parse/*\` row is a located site (diagnostics/diagnostic-shape.md), so the diagnostic carries a range; observed ${JSON.stringify(diagnostic)}`,
  ).toBeDefined();
  expect(
    (range as { start: { line: number; column: number } }).start,
    `${label}: §Fix constraint 2 — the fact is a property of the LIST's token sequence, not of any one specifier (\`{ a b }\` has no offending specifier; both are well-formed \`Ident\`s), so the granularity is STATEMENT-level and the range starts at the \`import\` / \`export\` keyword, exactly like the other list-level facts this code already carries. A per-offending-token arm reds here — and would emit three diagnostics on \`{ a b c d }\``,
  ).toEqual({ line, column: 1 });
  expect(
    (range as { end: { column: number } }).end.column,
    `${label}: the range spans at least the statement keyword (six characters, end column exclusive)`,
  ).toBeGreaterThanOrEqual(7);
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's *Message* column verbatim, unchanged by the widening (§Fix constraint 3's widening disposition)`,
  ).toBe(malformedListMessage());
}

// ===========================================================================
// (a0) THE DIAG-2 REGISTRY ANCHOR.
// RED at HEAD: the row exists with the right Message / severity / phase, but
// its *Trigger* enumerates three shapes none of which is this class, so the
// Trigger half reds.
// ===========================================================================

describe(`bug 0211 (a0) — ${CODE}'s registry row covers the separator shapes`, () => {
  it("RED (a0): the row keeps its Message / severity E / phase parse, and its Trigger names the separator and discarded-token shapes", () => {
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `no registry row for ${CODE} — the Imports cluster of ` +
        "docs/spec_topics/diagnostics/code-registry-parse.md carries it at :122 " +
        `(after the ${MISSING_FROM_CODE} row at :121)`,
    ).toBeDefined();
    const landed = row as RegistryRow;
    expect(
      landed.message,
      "DIAG-4 — the widening leaves the *Message* byte-identical, which is the bug doc §Fix " +
        "constraint 3's first ground for widening rather than adding a row: read the way the production reads the " +
        "list (separator-delimited elements, each an `ImportSpec`) the landed sentence is true " +
        "of every spelling in the class — `{ a b }`'s body element is neither a `Name` nor a " +
        "`Name as Alias`, `{ a, , b }`'s middle element is empty, `{ a: b }`'s is `a: b`",
    ).toBe(EXPECTED_TEMPLATE);
    expect(
      landed.message,
      "the *Message* carries no placeholder: a statement-level arm has no per-specifier name to render",
    ).not.toMatch(/<[a-z]+>/);
    expect(
      landed.severity,
      "severity E — the shape is refused, and only an error-severity code reaches the registration drop gate",
    ).toBe("E");
    expect(
      landed.phase,
      "phase parse — the arm is raised inside `parseImportExport` (src/parser/theta-document.ts:3017) beside the landed statement arm's emission (:3190–3201), so `parseThetaDocument` alone witnesses it with no `.thetalib` resolution",
    ).toBe("parse");
    // DIAG-2 (diagnostic-shape.md:72) makes a *Trigger* change a spec change,
    // and the GOV-15 diagnostic-registry carve-out
    // (governance/source-language-stability.md:23) disposes it "as an addition
    // for inputs newly brought into the code's emission set" — this edit's
    // direction exactly. The landed *Trigger* enumerates three shapes (list
    // absent, list producing zero specifiers, dangling `as`); a
    // separator-degenerate list has braces, produces one or more specifiers and
    // has no dangling `as`, so the row must say so in its own words. Two short
    // substrings are asserted rather than a sentence, so any faithful widening
    // passes while an unwidened row reds.
    expect(
      landed.trigger.toLowerCase(),
      `${CODE}'s *Trigger* must name the SEPARATOR shape — a missing \`,\` between two specifiers, a \`,\` where no specifier precedes it, a second \`,\` following a first, or a second trailing \`,\` — so the substring "separator" appears. Landed Trigger: ${JSON.stringify(landed.trigger)}`,
    ).toContain("separator");
    expect(
      landed.trigger.toLowerCase(),
      `${CODE}'s *Trigger* must name the DISCARDED-TOKEN shape — the specifier loop's catch-all drops \`42\`, \`"x"\` and \`:\` with no record — so the substring "discard" appears. Landed Trigger: ${JSON.stringify(landed.trigger)}`,
    ).toContain("discard");
    expect(
      landed.trigger.toLowerCase(),
      `${CODE}'s *Trigger* must state the granularity §Fix constraint 2 settles for the new shapes — once per statement, ranged over the whole statement — so the substring "per statement" appears. Landed Trigger: ${JSON.stringify(landed.trigger)}`,
    ).toContain("per statement");
  });
});

// ===========================================================================
// (a) THE REFUSED SET — §Fix constraint 1's enumeration, on BOTH keywords,
// from-bearing throughout (the gate's input set, §Fix constraint 3's gate).
// RED at HEAD: every cell parses with zero diagnostics.
// Each cell also asserts the NODE UNCHANGED (§Non-goals "the recovery shape
// after refusal"), so a fix that repairs the node instead of refusing the
// statement reds too.
// ===========================================================================

interface RefusedRow {
  /** The brace body, spelled as the author wrote it. */
  readonly list: string;
  /** `symbols` the parser delivers today — measured at this HEAD, unchanged by the fix. */
  readonly symbols: readonly string[];
  /** `[source, local]` pairs the parser delivers today — measured at this HEAD. */
  readonly specifiers: ReadonlyArray<readonly [string, string]>;
  /** WHY the production excludes it. */
  readonly why: string;
}

const REFUSED: readonly RefusedRow[] = [
  {
    list: "{ a, , b }",
    symbols: ["a", "b"],
    specifiers: [
      ["a", "a"],
      ["b", "b"],
    ],
    why: "a stray separator: the comma arm consumes the second `,` uncounted, so the delivered list is byte-for-byte `{ a, b }`'s",
  },
  {
    list: "{ , a }",
    symbols: ["a"],
    specifiers: [["a", "a"]],
    why: "a leading separator: `(\",\" ImportSpec)*` puts the `,` BEFORE a specifier, never before the first",
  },
  {
    list: "{ ,, a }",
    symbols: ["a"],
    specifiers: [["a", "a"]],
    why: "two leading separators, both consumed by the same unconditional arm",
  },
  {
    list: "{ a,, b }",
    symbols: ["a", "b"],
    specifiers: [
      ["a", "a"],
      ["b", "b"],
    ],
    why: "a doubled separator with no specifier between the two commas",
  },
  {
    list: "{ a, , , b }",
    symbols: ["a", "b"],
    specifiers: [
      ["a", "a"],
      ["b", "b"],
    ],
    why: "three separators for two specifiers",
  },
  {
    list: "{ a, , }",
    symbols: ["a"],
    specifiers: [["a", "a"]],
    why: "TWO trailing commas: `\",\"?` (imports.md:62) admits exactly one, so the second is a stray separator — the boundary cell against the admitted `{ a, }`",
  },
  {
    list: "{ a b }",
    symbols: ["a", "b"],
    specifiers: [
      ["a", "a"],
      ["b", "b"],
    ],
    why: "a missing separator: the loop head re-enters on the next ident with no separator state, so this delivers exactly what `{ a, b }` delivers",
  },
  {
    list: "{ a b c }",
    symbols: ["a", "b", "c"],
    specifiers: [
      ["a", "a"],
      ["b", "b"],
      ["c", "c"],
    ],
    why: "two missing separators — still ONE diagnostic, per the statement granularity",
  },
  {
    list: "{ a b c d }",
    symbols: ["a", "b", "c", "d"],
    specifiers: [
      ["a", "a"],
      ["b", "b"],
      ["c", "c"],
      ["d", "d"],
    ],
    why: "three missing separators — the cell that rules out a per-offending-token arm, which would emit three diagnostics here",
  },
  {
    list: "{ a b, c }",
    symbols: ["a", "b", "c"],
    specifiers: [
      ["a", "a"],
      ["b", "b"],
      ["c", "c"],
    ],
    why: "one missing separator beside one written one — a written `,` and its absence must not bind the same thing",
  },
  {
    list: "{ a as b c }",
    symbols: ["b", "c"],
    specifiers: [
      ["a", "b"],
      ["c", "c"],
    ],
    why: "a name run after an `as`: the alias branch closes at `b` and the loop opens a phantom specifier `(c → c)` the author never wrote",
  },
  {
    list: "{ a as b c as d }",
    symbols: ["b", "d"],
    specifiers: [
      ["a", "b"],
      ["c", "d"],
    ],
    why: "two aliased specifiers with no separator between them",
  },
  {
    list: "{ a as b as c }",
    symbols: ["b", "c"],
    specifiers: [
      ["a", "b"],
      ["c", "c"],
    ],
    why: "an `as` chain: the second `as` is discarded by the catch-all and `c` becomes an unseparated specifier",
  },
  {
    list: "{ a, 42 }",
    symbols: ["a"],
    specifiers: [["a", "a"]],
    why: "a discarded non-name token: `ImportSpec` admits `Ident` only, and the catch-all erases the `42` rather than reporting it",
  },
  {
    list: '{ a "x" b }',
    symbols: ["a", "b"],
    specifiers: [
      ["a", "a"],
      ["b", "b"],
    ],
    why: "a discarded string token, which also leaves the two names unseparated",
  },
  {
    list: "{ a: b }",
    symbols: ["a", "b"],
    specifiers: [
      ["a", "a"],
      ["b", "b"],
    ],
    why: "a discarded `:` — the object-literal spelling, which the productions do not admit at all",
  },
];

describe("bug 0211 (a) — a separator-degenerate specifier list is refused once per statement", () => {
  for (const keyword of ["import", "export"] as const) {
    for (const row of REFUSED) {
      const spelling = `${keyword} ${row.list} from "./m.thetalib"`;
      it(`RED (a, ${JSON.stringify(spelling)}): exactly one ${CODE} ranged over the statement — ${row.why}`, () => {
        const doc = parseLib(spelling);
        expectStatementRefusal(`spelling ${JSON.stringify(spelling)}`, doc);
        expect(
          diagCodes(doc.diagnostics).filter((code) => code !== CODE),
          `spelling ${JSON.stringify(spelling)}: the refusal is the only disposition change — the trailing clause is well-formed so ${MISSING_FROM_CODE} does not co-emit (§Fix constraint 3's gate keeps that code's Trigger claim true), and the path literal conforms. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
        ).toEqual([]);
        expect(
          firstStatement(doc).symbols,
          "§Non-goals \"the recovery shape after refusal\" — this fix adds a diagnostic and does not change the node a malformed statement produces, so the value measured at this HEAD stands",
        ).toEqual(row.symbols);
        expect(
          specifierPairs(doc),
          "the `[source, local]` pairs are unchanged too: refusing the statement is the observable, not a repaired node — an assert at a reader would crash on refused input (§Fix constraint 7)",
        ).toEqual(row.specifiers.map((pair) => [...pair]));
      });
    }
  }
});

// ===========================================================================
// (b) THE PRODUCTION-ADMITTED SPELLINGS — the fence against widening the arm.
// GREEN at HEAD and required to stay green. The whole diagnostic list is
// asserted empty, not merely the absence of `CODE`, so a fix that trades this
// class's silence for some other code's noise reds.
// ===========================================================================

describe("bug 0211 (b) — a conforming specifier list stays silent", () => {
  const ADMITTED: ReadonlyArray<readonly [string, string]> = [
    ["{ a }", "imports.md:64 — the plain `Ident` specifier"],
    ["{ a, b }", "imports.md:62 — one `,` between two specifiers, the conforming separator"],
    ['{ a as b }', 'imports.md:64 — the `Ident "as" Ident` specifier'],
    ["{ a as b, c }", "an aliased specifier and a plain one, properly separated"],
    [
      "{ a, }",
      "imports.md:62 `\",\"?` — the trailing-comma form the production licenses; the refused `{ a, , }` is the second comma, so this is the boundary cell in the admitted direction",
    ],
  ];

  for (const keyword of ["import", "export"] as const) {
    for (const [list, why] of ADMITTED) {
      const spelling = `${keyword} ${list} from "./m.thetalib"`;
      it(`GREEN (b, ${JSON.stringify(spelling)}): no diagnostic of any code — ${why}`, () => {
        const doc = parseLib(spelling);
        expect(
          withCode(doc.diagnostics, CODE),
          `${spelling}: §Fix constraint 1 — the refused set is enumerated, and every spelling the productions admit stays silent`,
        ).toEqual([]);
        expect(
          diagLines(doc.diagnostics),
          `${spelling}: this fixture is legal input at every position and carries no diagnostic of ANY code, so a refusal bought with unrelated noise reds here. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
        ).toEqual([]);
      });
    }
  }
});

// ===========================================================================
// (c) THE §Fix CONSTRAINT 1 FENCE — every spelling bug 0100 already refuses
// keeps EXACTLY its current code list. GREEN at HEAD.
//
// The from-bearing rows fence §Fix constraint 2's partition: this arm must be
// silent when the recovered list is EMPTY (`{}`, `{ , }`, `{ as }`) or when
// any specifier carried a dangling `as` (`{ a as }`, `{ a as , b }`,
// `{ a as as b }`). Without suppression each would gain a SECOND
// statement-ranged diagnostic — `{ , }` is a leading comma, `{ as }` a
// discarded token, and `{ a as as b }` both a discarded token and an
// unseparated `b`.
//
// The no-`from` rows fence §Fix constraint 3's gate: `hasFromKeyword && hasPathLiteral`.
// `import { a b }` with no `from` clause must draw ONLY
// `theta/parse/import-missing-from-clause`, whose registry *Trigger* (:121)
// explicitly claims the bare-keyword and empty-list spellings and states that
// this code's statement arm never co-emits with it. Un-gating is what would
// move bug 0058's witnesses.
// ===========================================================================

describe("bug 0211 (c) — the shapes bug 0100 already refuses keep exactly their code list", () => {
  const ZERO_SPECIFIER: ReadonlyArray<readonly [string, string]> = [
    ["{}", "braces, zero specifiers — 0100's statement arm's subject"],
    ["{ , }", "a lone separator consumed into an empty list: the zero-specifier arm answers, not this one"],
    ["{ as }", "a lone `as` discarded into an empty list: likewise the zero-specifier arm's"],
  ];
  const DANGLING_ALIAS: ReadonlyArray<readonly [string, string]> = [
    ["{ a as }", "a dangling `as` — 0100's specifier arm's subject, ranged over the specifier"],
    ["{ a as , b }", "the comma arm resumes the list after the dropped alias; the specifier arm answers"],
    [
      "{ a as as b }",
      "the catch-all discards the second `as` and `b` is unseparated, yet the dangling `as` is the fact reported — suppression is what keeps this ONE diagnostic",
    ],
  ];

  for (const keyword of ["import", "export"] as const) {
    for (const [list, why] of ZERO_SPECIFIER) {
      const spelling = `${keyword} ${list} from "./m.thetalib"`;
      it(`GREEN (c, ${JSON.stringify(spelling)}): the whole code list stays [${CODE}] at the statement range — ${why}`, () => {
        const doc = parseLib(spelling);
        expect(
          diagCodes(doc.diagnostics),
          `${spelling}: exactly one code, and exactly one diagnostic of it — §Fix constraint 2's partition makes the three arms partition, so a second statement-ranged diagnostic reds here. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
        ).toEqual([CODE]);
        expect(
          withCode(doc.diagnostics, CODE)[0]?.range?.start,
          `${spelling}: 0100's zero-specifier arm's range, unmoved`,
        ).toEqual({ line: 1, column: 1 });
      });
    }
    for (const [list, why] of DANGLING_ALIAS) {
      const spelling = `${keyword} ${list} from "./m.thetalib"`;
      it(`GREEN (c, ${JSON.stringify(spelling)}): the whole code list stays [${CODE}] at the SPECIFIER range — ${why}`, () => {
        const doc = parseLib(spelling);
        expect(
          diagCodes(doc.diagnostics),
          `${spelling}: exactly one diagnostic — the dangling-\`as\` specifier arm's. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
        ).toEqual([CODE]);
        expect(
          withCode(doc.diagnostics, CODE)[0]?.range?.start,
          `${spelling}: the SPECIFIER range (both keywords are six characters, so \`{\` sits at column 8 and the first specifier's source token at column 10). A statement-ranged diagnostic here would mean this arm fired instead of 0100's`,
        ).toEqual({ line: 1, column: 10 });
      });
    }
  }
});

describe("bug 0211 (c-gate) — the statement arm is gated on a well-formed trailing clause", () => {
  const NO_FROM: ReadonlyArray<readonly [string, string]> = [
    ["import", "the bare keyword the 0058 Trigger names explicitly"],
    ["export", "the `export` analogue"],
    ["import {}", "the empty-list spelling the same Trigger names explicitly"],
    ["export {}", "the `export` analogue of the empty list"],
    [
      "import { a b }",
      "THE GATE FENCE for this class: a separator-degenerate list with no `from` clause. Already refused at error severity by the missing-from-clause code, so no admission is lost by gating — and un-gating would co-emit a second statement-ranged diagnostic here, contradicting that row's Trigger and moving 0058's whole-list witnesses",
    ],
    ["export { a b }", "the `export` analogue of the gate fence"],
  ];

  for (const [spelling, why] of NO_FROM) {
    it(`GREEN (c-gate, ${JSON.stringify(spelling)}): the whole code list stays [${MISSING_FROM_CODE}] — ${why}`, () => {
      const doc = parseLib(spelling);
      expect(
        diagCodes(doc.diagnostics),
        `${spelling}: this spelling is inside ${MISSING_FROM_CODE}'s Trigger (code-registry-parse.md:121), so it keeps emitting ONLY that code. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
      ).toEqual([MISSING_FROM_CODE]);
      expect(
        diagLines(doc.diagnostics),
        `${spelling}: the rendered line is 0058's registry message unchanged`,
      ).toEqual([`error ${MISSING_FROM_CODE}: ${normativeMessage(MISSING_FROM_CODE)}`]);
    });
  }
});

// ===========================================================================
// (d) THE CO-EMISSIONS THE WIDENED *Trigger* MUST STATE — measured, not
// assumed. Each cell asserts BOTH codes and their RANGES, so the statement /
// specifier granularity distinction is visible in the same statement.
// RED at HEAD for the `CODE` half; the other half is measured at this HEAD and
// asserted unchanged.
// ===========================================================================

describe("bug 0211 (d) — the statement arm's co-emissions", () => {
  for (const keyword of ["import", "export"] as const) {
    const spelling = `${keyword} { a b } from "./m.theta"`;
    it(`RED (d-extension, ${JSON.stringify(spelling)}): co-emits with ${EXTENSION_CODE} at a different range`, () => {
      // The gate is `hasFromKeyword && hasPathLiteral`, and the path literal
      // need not name a `.thetalib` — measured at this HEAD, the extension
      // refusal ranges over the path literal (1:21–1:32) while the statement
      // arm ranges over the statement, so the two are distinguishable.
      const doc = parseLib(spelling);
      expectStatementRefusal(`spelling ${JSON.stringify(spelling)}`, doc);
      expect(
        diagCodes(doc.diagnostics).sort(),
        `${spelling}: both codes — the missing separator and the non-\`.thetalib\` path are independent facts about one statement. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
      ).toEqual([CODE, EXTENSION_CODE].sort());
      const extension = withCode(doc.diagnostics, EXTENSION_CODE)[0] as Diagnostic;
      expect(
        extension.range?.start,
        `${spelling}: imports.md:19 — the path-literal rule's range is the PATH literal, measured at this HEAD as column 21, and the widening does not move it`,
      ).toEqual({ line: 1, column: 21 });
      expect(
        withCode(doc.diagnostics, CODE)[0]?.range,
        `${spelling}: the two ranges must DIFFER — one is the whole statement, one is the path literal`,
      ).not.toEqual(extension.range);
    });
  }

  const RESERVED_BINDING = "__inline_0123456789abcdef";
  for (const keyword of ["import", "export"] as const) {
    const spelling = `${keyword} { a ${RESERVED_BINDING} } from "./m.thetalib"`;
    it(`RED (d-reserved, ${JSON.stringify(spelling)}): co-emits with ${RESERVED_CODE}, which the missing separator conjured`, () => {
      // The missing separator invents the second specifier, whose local binding
      // is a reserved synthesised name — so bug 0040's per-specifier check
      // (src/parser/imports.ts:367) refuses a name the author wrote as a token
      // and never as a specifier. §Fix constraint 5 keeps that emission: the
      // input is already outside GOV-15's loads-cleanly set.
      const doc = parseLib(spelling);
      expectStatementRefusal(`spelling ${JSON.stringify(spelling)}`, doc);
      const reserved = withCode(doc.diagnostics, RESERVED_CODE);
      expect(
        diagLines(reserved),
        `${spelling}: bug 0040's per-specifier refusal is UNCHANGED — the node still carries the phantom specifier, so its reserved local binding is still refused. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
      ).toEqual([
        `error ${RESERVED_CODE}: ${normativeMessage(RESERVED_CODE).replace("<name>", RESERVED_BINDING)}`,
      ]);
      expect(
        reserved[0]?.range?.start,
        `${spelling}: the reserved-name refusal is SPECIFIER-ranged — measured at this HEAD as column 12 (\`import \` / \`export \` is seven characters, \`{\` at 8, \`a\` at 10, the reserved token at 12)`,
      ).toEqual({ line: 1, column: 12 });
      expect(
        withCode(doc.diagnostics, CODE)[0]?.range,
        `${spelling}: the statement-ranged refusal and the specifier-ranged one report facts at two granularities, so their ranges must DIFFER`,
      ).not.toEqual(reserved[0]?.range);
      expect(
        diagCodes(doc.diagnostics).sort(),
        `${spelling}: exactly these two codes. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
      ).toEqual([CODE, RESERVED_CODE].sort());
    });
  }
});

// ===========================================================================
// (e) THE LOAD-PASS CONSEQUENCES, pinned as the reason they become unreachable
// (§Fix constraint 6). Refusing the statement removes an input that today
// drives materialisation and IMP-3, so each row asserts the parse refusal
// BESIDE the load-pass observable measured at this HEAD and asserted UNCHANGED
// (§Non-goals). A later narrowing of the refusal reds here.
// ===========================================================================

describe("bug 0211 (e) — the recovered list's load-pass reach, pinned with the refusal", () => {
  const LIB_A_B = "fn a(x: string) { x }\nfn b(x: string) { x }\n";

  it("RED (e-missing-comma): a missing separator materialises what the conforming spelling materialises, and is now refused at parse", async () => {
    // The load-bearing row: `{ a b }` and `{ a, b }` are two textually distinct
    // inputs — one the production admits, one it excludes — that deliver one
    // program. The refusal at parse is the only thing that can tell them apart.
    const appBody = 'import { a b } from "./lib.thetalib"\nlet z = 1\nz\n';
    expectStatementRefusal("e-missing-comma app parse", parseApp(appBody), APP_FIRST_BODY_LINE);
    const result = await loadImports(appBody, { "/proj/lib.thetalib": LIB_A_B });
    expect(
      diagLines(result.diagnostics),
      "§Fix constraint 7 / §Non-goals — the load pass is UNCHANGED: the recovered specifiers resolve against the lib exactly as the conforming spelling's do (measured at this HEAD: no diagnostic at either phase)",
    ).toEqual([]);
    expect(
      result.materialised,
      "measured at this HEAD — the missing separator binds both names, identical to `{ a, b }`'s materialisation below",
    ).toEqual(["fn a", "fn b"]);
  });

  it("GREEN (e-control): the conforming `{ a, b }` materialises `fn a` and `fn b` with no diagnostic", async () => {
    // The control that makes the refusal falsifiable in the other direction: if
    // a fix narrowed the admitted set instead of the refused one, this reds.
    const appBody = 'import { a, b } from "./lib.thetalib"\nlet z = 1\nz\n';
    expect(
      withCode(parseApp(appBody).diagnostics, CODE),
      "the conforming separator is what the production spells; it is never refused",
    ).toEqual([]);
    const result = await loadImports(appBody, { "/proj/lib.thetalib": LIB_A_B });
    expect(diagLines(result.diagnostics), "the conforming load path is untouched").toEqual([]);
    expect(result.materialised, "both imported `fn`s materialise").toEqual(["fn a", "fn b"]);
  });

  it("RED (e-phantom): the `as`-run's phantom specifier still draws the unknown-symbol refusal on a name the author never wrote as a specifier, and the statement is now refused at parse", async () => {
    // Measured at this HEAD: the phantom `(c → c)` reaches
    // `checkImportUnknownSymbols` (src/parser/imports.ts:578), which refuses
    // `c` — a token the author wrote, never a specifier. The node shape stays
    // put (§Non-goals), so this refusal is pinned as the consequence the parse
    // refusal makes unreachable rather than as a behaviour that changes.
    const appBody = 'import { a as b c } from "./lib.thetalib"\nlet z = 1\nz\n';
    const parsed = parseApp(appBody);
    expectStatementRefusal("e-phantom app parse", parsed, APP_FIRST_BODY_LINE);
    expect(
      firstStatement(parsed).symbols,
      "§Non-goals — `symbols` for `{ a as b c }` stays `[\"b\",\"c\"]`: the alias branch closes at `b` and the loop opens the phantom specifier, and this fix does not change the node",
    ).toEqual(["b", "c"]);
    expect(
      specifierPairs(parsed),
      "the `[source, local]` pairs stay byte-for-byte what the bug doc §Reproduction records and this HEAD delivers",
    ).toEqual([
      ["a", "b"],
      ["c", "c"],
    ]);
    const result = await loadImports(appBody, { "/proj/lib.thetalib": LIB_A_B });
    expect(
      diagLines(result.diagnostics),
      "§Fix constraint 7 — the load pass is UNCHANGED: the phantom specifier still participates, so the refusal naming `c` still fires on the same input",
    ).toEqual([
      `error ${UNKNOWN_SYMBOL_CODE}: ${normativeMessage(UNKNOWN_SYMBOL_CODE)
        .replace("<name>", "c")
        .replace("<path>", "./lib.thetalib")}`,
    ]);
    expect(
      result.materialised,
      "measured at this HEAD — only the aliased binding materialises; the phantom resolves to nothing",
    ).toEqual(["fn b"]);
  });
});
