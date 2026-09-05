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

// Bug 0100 — the shapes the closed `ImportDecl` / `ExportDecl` / `ImportSpec` /
// `ExportSpec` productions exclude are all structurally reachable inside
// `parseImportExport`: the specifier list is opened only when a `{` is present
// (src/parser/theta-document.ts:3008), the specifier `while` has no floor on its
// iteration count and a catch-all `this.advance()` for any token it does not
// classify (:3011, :3075–3077), and the alias branch consumes `as` and takes the
// alias only inside a guard whose other arm leaves `local = source`
// (:3023–3036, the guard at :3026–3035). Enforcing the productions is therefore
// a question asked of the two facts the parser records about those paths —
// `hasBraces` beside the specifier count (:3007, :3009) and
// `aliasConsumedWithNoAlias` (:3021, :3033–3034) — which is what
// `checkImportMalformedSpecifierList` (src/parser/imports.ts:430–450) and
// `checkImportDanglingAlias` (:462–476) read. Left unrefused, the dangling `as`
// is not inert: `local` is the key the identifier scope, the collision check,
// bug 0040's reserved-name check, materialisation and a `.thetalib`'s published
// export set all read, so the source name is substituted for the alias the
// author wrote at every one of them
// (docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/imports.md:37–38 — `ImportDecl` / `ExportDecl` make
//     `"{" ImportSpec ("," ImportSpec)* ","? "}"` mandatory: braces, and at
//     least one specifier before the repetition.
//   - :39–40 — `ImportSpec` / `ExportSpec` admit `Ident` or `Ident "as" Ident`
//     and nothing else, so a consumed `as` with no alias token after it is a
//     shape neither production spells.
//   - :43–46 — the refusal 0058 shipped, scoped to "A specifier list with no
//     `from` clause"; three of this bug's spellings carry `from` with a
//     `.thetalib` path literal, so that sentence's subject does not reach them.
//   - :48–62 — the from-bearing violations and their granularity: an absent or
//     zero-specifier list once per statement, a dangling `as` once per
//     specifier, and which codes co-emit with which — including the specifier
//     arm's unconditional co-emission with
//     `theta/parse/import-missing-from-clause` on a from-less list (group
//     (e2)). Mirrored for users at docs/reference/grammar.md:51–60.
//   - :13 — the permitted `.thetalib` top-level forms name `import` and
//     `export`, so a degenerate spelling in a `.thetalib` draws no
//     `theta/parse/thetalib-top-level-statement` noise.
//   - :19 — the path-literal rule, which fires independently of the specifier
//     list (group (c) keeps every fixture's path a conforming `.thetalib`).
//   - :29, :31–34 — §Re-exports' one form and its two fully specified examples.
//   - docs/spec_topics/grammar.md:3 — the appendix leaves an owned surface to
//     its topic page and carries no `ImportDecl` / `ExportDecl`, so imports.md
//     is the sole owner of the productions these spellings violate.
//   - docs/spec_topics/governance/source-language-stability.md:5 (GOV-15), :9
//     (the loads-cleanly predicate), :25 (the diagnostic-registry carve-out,
//     which covers "inputs that did not previously emit the added code" — the
//     whole refused set here, the corpus carrying zero occurrences).
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2, registry
//     addition mirrored into docs/reference/diagnostics.md in the same commit).
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix, settled — the route this file
// encodes; RED now, GREEN after):
//   1. ONE new registered parse-phase code at severity E,
//      `theta/parse/import-malformed-specifier-list`, covering all three shape
//      classes (§Fix constraint 3's second disposition). The rejected
//      disposition is widening `theta/parse/import-missing-from-clause`'s
//      *Trigger*: three of the spellings carry a `from` clause with a
//      `.thetalib` path literal, so that row's normative *Message* ("requires a
//      'from' clause with a .thetalib path literal", src/parser/imports.ts:372–373)
//      would misdescribe its own input, and DIAG-4 defers a *Message* reword to
//      theta 2.0.
//   2. STATEMENT-level arm (§Fix constraint 2): the specifier list is absent or
//      produced ZERO specifiers — ONE diagnostic per statement, ranged over the
//      whole statement (range starts at the `import` / `export` keyword),
//      exactly like `theta/parse/import-missing-from-clause`'s range — both
//      read the one shared statement range (src/parser/theta-document.ts:3107)
//      at their adjacent call sites (:3115, :3128–3134). This arm is GATED on a
//      well-formed trailing clause (`from` present AND a string token after
//      it): `theta/parse/import-missing-from-clause`'s registry *Trigger*
//      already explicitly claims the bare-keyword (`import`, `export`) and
//      empty-list (`import {}`, `export {}`) spellings
//      (docs/spec_topics/diagnostics/code-registry-parse.md:119), so those keep
//      emitting ONLY that code — no co-emission, and 0058's whole-list
//      witnesses plus the reserved-keyword matrix cells stay byte-identical.
//      Group (d) is that gate's fence.
//   3. SPECIFIER-level arm (§Fix constraint 2): an `as` was consumed with no
//      following ident-or-keyword alias — ONE diagnostic per malformed
//      specifier, ranged over THAT SPECIFIER, like bug 0040's per-specifier
//      reserved-name check (src/parser/theta-document.ts:3066–3069), whose
//      `specifierRange` (:3037) the call at :3049 shares. UNGATED:
//      it co-emits with `theta/parse/import-reserved-synthesised-name` (group
//      (e)), whose *Trigger* already states the co-emission rule
//      (code-registry-parse.md:118).
//   4. The NODE SHAPE IS UNCHANGED (§Fix constraint 7, §Non-goals "recovery
//      shape"): `symbols` for `import { a as }` stays `["a"]`, because
//      `checkThetaImports` reaches `extractThetaLibForms` over a
//      refused-but-parsed lib regardless (src/extension/import-static-checks.ts)
//      and an assert at a reader would crash on refused input. Groups (b) and
//      (f) assert the node and the downstream observable UNCHANGED alongside
//      the new refusal.
//
// MEASURED AT HEAD 1c8c0fa4 / 0.132.0 (offline, deterministic; re-derived from
// the bug doc §Reproduction with zero drift — no intervening fix, bug 0040's
// included, discharged any row). Every fixture below is one of these rows,
// parsed at /proj/lib.thetalib:
//   "import from \"./m.thetalib\""              diags []  symbols []       specs []
//   "export from \"./m.thetalib\""              diags []  symbols []       specs []
//   "import {} from \"./m.thetalib\""           diags []  symbols []       specs []
//   "export {} from \"./m.thetalib\""           diags []  symbols []       specs []
//   "import { , } from \"./m.thetalib\""        diags []  symbols []       specs []
//   "import { as } from \"./m.thetalib\""       diags []  symbols []       specs []
//   "import { a as } from \"./m.thetalib\""     diags []  symbols ["a"]    specs [a→a]
//   "export { a as } from \"./m.thetalib\""     diags []  symbols ["a"]    specs [a→a]
//   "import { a as , b } from \"./m.thetalib\""  diags []  symbols ["a","b"]
//   "import { a as as b } from \"./m.thetalib\"" diags []  symbols ["a","b"]
//   "import { a, } from \"./m.thetalib\""       diags []  symbols ["a"]
//   "import { a } from \"./m.thetalib\""        diags []  symbols ["a"]
//   "import { a as b } from \"./m.thetalib\""   diags []  symbols ["b"]    specs [a→b]
//   "import" / "import {}" / "import { a } from"  diags [error import-missing-from-clause]
//   "import { __inline_0123456789abcdef as } from \"./m.thetalib\""
//                                              diags [error import-reserved-synthesised-name]
//   "import { __inline_0123456789abcdef as x } from \"./m.thetalib\""  diags []
// and, through the real `checkThetaImports` over an in-memory `FileSystem`:
//   app `import {} from "./lib.thetalib"`         diags []  materialised []
//   app `import from "./lib.thetalib"`            diags []  materialised []
//   app `import { greet } from "./lib.thetalib"`  diags []  materialised ["fn greet"]
//   app `import {} from "./missing.thetalib"`     [error theta/load/unresolvable-thetalib-path]
//   app `import {} from "./lib.thetalib"`, lib carrying a top-level `let`
//                                                 [error theta/parse/thetalib-top-level-statement]
//   app `import {} from "./a.thetalib"`, a ⇄ b    [error theta/load/import-cycle]
//   app `import { a as } from "./lib.thetalib"` beside a local `fn a`
//                                                 [error theta/parse/import-name-collision]
//   lib `export { greet as } from "./mid.thetalib"`, app `import { hello }`
//                                                 [error theta/parse/import-unknown-symbol]
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` over a string, or inside one `checkThetaImports` over
// an in-memory `FileSystem` double exposing the `readdir` / `readBytes` members
// the load pass reads (the shape tests/subagent-fn.test.ts:1581–1614 uses, and
// tests/import-export-from-clause-required.test.ts reuses for 0058). The
// refusal's seam is the parser, so an integration tier would add a discovery
// round trip to a decision the parser has already made and could not assert a
// diagnostic's ABSENCE any more sharply than groups (c) and (d) do; a live tier
// would add a provider to a decision no model participates in. One live cell is
// nevertheless appended to tests/live/live-production-acceptance.test.ts,
// because no live fixture reaches the malformed-specifier surface at all and the
// registration consequence is the user-visible half.
//
// NO SILENT SKIPPING: the registry row for the new code does not exist at HEAD
// (the implementer adds it in the same commit, per DIAG-2). Every expected
// message is read from the registry, and the read FAILS LOUDLY naming the absent
// row rather than skipping — an unmet precondition is an explicit failure, never
// a pass. Each emission assertion runs BEFORE its message assertion, so a red
// names the absent diagnostic first.

// ===========================================================================
// The registered codes and the new one's normative message (DIAG-2 / DIAG-4).
// ===========================================================================

/** The one new code the fix registers, covering all three shape classes. */
const CODE = "theta/parse/import-malformed-specifier-list";

/** 0058's trailing-clause refusal, whose gate group (d) pins. */
const MISSING_FROM_CODE = "theta/parse/import-missing-from-clause";

/** Bug 0040's per-specifier code, which co-emits with `CODE` (group (e)). */
const RESERVED_CODE = "theta/parse/import-reserved-synthesised-name";

/** The published-export-set refusal the dropped alias relocates (group (f)). */
const UNKNOWN_SYMBOL_CODE = "theta/parse/import-unknown-symbol";

/** The collision the dropped alias reinstates (group (f)). */
const COLLISION_CODE = "theta/parse/import-name-collision";

/** The identifier-scope refusal the dropped alias moves to the alias (group (f)). */
const UNKNOWN_IDENTIFIER_CODE = "theta/parse/unknown-identifier";

/**
 * The normative *Message* template the fix must land in the registry, written
 * literally HERE ONCE — group (a0) asserts the registry row equals it, and every
 * other expected string in this file comes from the REGISTRY READ (DIAG-4). The
 * message carries no placeholder: one statement-level arm has no per-specifier
 * name to render, and the specifier-level arm's subject is the malformed
 * specifier's own range rather than a name the source text spells reliably (a
 * dangling `as` may be all the specifier text there is, as `import { as }`).
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

/** The new code's message; the template is placeholder-free, so it renders as-is. */
function malformedListMessage(): string {
  return normativeMessage(CODE);
}

// ===========================================================================
// Parse drivers and diagnostic readers (the helper set
// tests/import-export-from-clause-required.test.ts established for 0058).
// ===========================================================================

/** Parse a source string at `path` through the shipped whole-document pipeline. */
function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

/**
 * Parse a `.thetalib` body. `import` / `export` are permitted top-level forms
 * there (imports.md:13), so a degenerate spelling draws no
 * `theta/parse/thetalib-top-level-statement` noise and the whole-list assertions
 * below read only the codes under test.
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
 * Whether a diagnostic un-registers the theta that carries it: error severity in
 * the `theta/parse/` or `theta/load/` namespace. Mirrors the shipped predicate
 * `isRegistrationError` (src/extension/import-static-checks.ts:191), which is
 * module-private, so the drop disposition is asserted on the same two properties
 * the load pass reads rather than by re-driving discovery.
 */
function isRegistrationError(diagnostic: Diagnostic): boolean {
  return (
    diagnostic.severity === "error" &&
    (diagnostic.code.startsWith("theta/parse/") || diagnostic.code.startsWith("theta/load/"))
  );
}

/** The parsed statement list, for the node-shape assertions (§Fix constraint 7). */
interface ImportNodeShape {
  readonly kind: string;
  readonly path: string;
  readonly symbols: readonly string[];
  readonly specifiers: ReadonlyArray<{
    readonly source: string;
    readonly local: string;
    readonly range: { readonly start: { readonly line: number; readonly column: number } };
  }>;
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
// The two refusal shapes, asserted as oracles independent of the node the
// parser built: the STATEMENT arm's range is checked against the statement's
// known start position, the SPECIFIER arm's against the malformed specifier's.
// ===========================================================================

/**
 * Assert exactly one statement-ranged refusal, at error severity, carrying the
 * registry's message.
 *
 * The count assertion runs FIRST so the red at HEAD names the symptom the bug
 * reports — a shape the closed productions exclude parsing with zero
 * diagnostics — rather than a downstream message or range mismatch.
 */
function expectStatementRefusal(label: string, doc: ThetaDocument, line: number): void {
  const hits = withCode(doc.diagnostics, CODE);
  expect(
    hits.length,
    `${label}: expected exactly one ${CODE}. imports.md:37–38 make braces and at least one specifier mandatory on both declarations, and grammar.md:3 leaves the surface to that page, so a statement with no specifier list — or one that produced zero specifiers — is a shape the language does not define. Rendered diagnostics: ${JSON.stringify(diagLines(doc.diagnostics))}`,
  ).toBe(1);
  const diagnostic = hits[0] as Diagnostic;
  expect(
    diagnostic.severity,
    `${label}: severity E — the refusal un-registers the file, and only an error-severity \`theta/parse/\` code reaches the load pass' registration drop (src/extension/import-static-checks.ts:191)`,
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
    `${label}: §Fix constraint 2 — an absent or zero-specifier list is a STATEMENT-level fact, so the range starts at the \`import\` / \`export\` keyword, exactly like ${MISSING_FROM_CODE}'s — both read the one shared statement range (src/parser/theta-document.ts:3107)`,
  ).toEqual({ line, column: 1 });
  expect(
    (range as { end: { column: number } }).end.column,
    `${label}: the range spans at least the statement keyword (six characters, end column exclusive)`,
  ).toBeGreaterThanOrEqual(7);
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's *Message* column verbatim`,
  ).toBe(malformedListMessage());
}

/**
 * Assert exactly one specifier-ranged refusal per malformed specifier, at error
 * severity, ranged over the malformed SPECIFIER rather than the statement.
 *
 * `startColumn` is the column of the malformed specifier's source token, which
 * is what distinguishes this arm from the statement arm above (whose range
 * always starts at column 1) — the same distinction 0058's witness draws at
 * tests/import-export-from-clause-required.test.ts:342.
 */
function expectSpecifierRefusal(
  label: string,
  doc: ThetaDocument,
  startColumn: number,
  line = 1,
): void {
  const hits = withCode(doc.diagnostics, CODE);
  expect(
    hits.length,
    `${label}: expected exactly one ${CODE}, ranged over the malformed specifier. imports.md:39–40 admit \`Ident\` or \`Ident "as" Ident\` and nothing else, so a consumed \`as\` with no alias token after it is a specifier neither production spells. Rendered diagnostics: ${JSON.stringify(diagLines(doc.diagnostics))}`,
  ).toBe(1);
  const diagnostic = hits[0] as Diagnostic;
  expect(
    diagnostic.severity,
    `${label}: severity E — a specifier whose intended binding the node cannot represent is refused, not reinterpreted`,
  ).toBe("error");
  expect(
    isRegistrationError(diagnostic),
    `${label}: the disposition is a registration drop, on the same two properties the load pass reads`,
  ).toBe(true);
  const range = diagnostic.range as
    | { start: { line: number; column: number } }
    | undefined;
  expect(
    range,
    `${label}: a \`theta/parse/*\` row is a located site, so the diagnostic carries a range; observed ${JSON.stringify(diagnostic)}`,
  ).toBeDefined();
  expect(
    (range as { start: { line: number; column: number } }).start,
    `${label}: §Fix constraint 2 — a dangling \`as\` is a SPECIFIER-level fact, so the range starts at that specifier's source token, like bug 0040's per-specifier check (src/parser/theta-document.ts:3066–3069), which shares the same \`specifierRange\` (:3037), NOT at column 1 where the statement arm ranges`,
  ).toEqual({ line, column: startColumn });
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's *Message* column verbatim`,
  ).toBe(malformedListMessage());
}

// ===========================================================================
// (a0) THE DIAG-4 REGISTRY ANCHOR.
// RED at HEAD: the row does not exist, so the red names the registry page.
// ===========================================================================

describe("bug 0100 (a0) — the malformed-specifier-list code has a registry row", () => {
  it(`RED (a0): code-registry-parse.md carries ${CODE} with the normative Message, severity E, phase parse`, () => {
    // A registry addition is a DIAG-2 operation, covered within a theta 1.x
    // minor by the GOV-15 diagnostic-registry carve-out
    // (governance/source-language-stability.md:25) "for inputs that did not
    // previously emit the added code" — which is every input in this file, the
    // corpus carrying zero occurrences of any refused spelling.
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `no registry row for ${CODE} — the Imports cluster of ` +
        `docs/spec_topics/diagnostics/code-registry-parse.md must carry it at :120 (after the ` +
        `${MISSING_FROM_CODE} row at :119), mirrored into docs/reference/diagnostics.md`,
    ).toBeDefined();
    expect(
      (row as RegistryRow).message,
      "DIAG-4 — the Message column is normative character-for-character. Widening " +
        `${MISSING_FROM_CODE}'s Trigger instead was rejected: three refused spellings ` +
        "carry a `from` clause with a `.thetalib` path literal, so that row's Message " +
        "would misdescribe its own input, and DIAG-4 defers a Message reword to theta 2.0",
    ).toBe(EXPECTED_TEMPLATE);
    expect(
      (row as RegistryRow).message,
      "the Message carries no placeholder: the statement arm has no per-specifier name " +
        "to render, and a malformed specifier need not spell a name at all (`import { as }`)",
    ).not.toMatch(/<[a-z]+>/);
    expect(
      (row as RegistryRow).severity,
      "severity E — the shape is refused, and only an error-severity code reaches the registration drop gate",
    ).toBe("E");
    expect(
      (row as RegistryRow).phase,
      "phase parse — both arms are raised inside `parseImportExport` beside `validatePathLiteral` (src/parser/theta-document.ts:3099) and the 0058 refusal (:3115): the specifier arm at :3049, the statement arm at :3128–3134, so `parseThetaDocument` alone witnesses them with no `.thetalib` resolution",
    ).toBe("parse");
  });
});

// ===========================================================================
// (a) THE STATEMENT ARM — an absent or zero-specifier list, both keywords.
// RED at HEAD: every fixture parses with zero diagnostics.
// ===========================================================================

describe("bug 0100 (a) — an absent or zero-specifier list is refused once per statement", () => {
  const STATEMENT_LEVEL: ReadonlyArray<readonly [string, string]> = [
    [
      'import from "./m.thetalib"',
      "no braces at all — imports.md:37 makes the list mandatory, and `if (this.isPunct(\"{\"))` has no else",
    ],
    ['export from "./m.thetalib"', "the `export` analogue — one function parses both keywords"],
    [
      'import {} from "./m.thetalib"',
      "braces, zero specifiers — imports.md:37 requires one `ImportSpec` before the repetition",
    ],
    ['export {} from "./m.thetalib"', "the `export` analogue of the empty list"],
    [
      'import { , } from "./m.thetalib"',
      "a lone separator: the comma arm consumes it and the list produces zero specifiers",
    ],
    [
      'import { as } from "./m.thetalib"',
      "a lone `as`: the catch-all `advance()` consumes it and the list produces zero specifiers",
    ],
  ];

  for (const [spelling, why] of STATEMENT_LEVEL) {
    it(`RED (a, ${JSON.stringify(spelling)}): exactly one ${CODE} ranged over the statement — ${why}`, () => {
      const doc = parseLib(spelling);
      expectStatementRefusal(`spelling ${JSON.stringify(spelling)}`, doc, 1);
      expect(
        diagCodes(doc.diagnostics).filter((code) => code !== CODE),
        `spelling ${JSON.stringify(spelling)}: the refusal is the only disposition change — the trailing clause is well-formed, so ${MISSING_FROM_CODE} does not co-emit, and the path literal conforms. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
      ).toEqual([]);
      expect(
        firstStatement(doc).symbols,
        "§Fix constraint 7 / §Non-goals — the fix adds a diagnostic and does not change the node a malformed statement produces",
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// (b) THE SPECIFIER ARM — a dangling `as`, ranged over that specifier.
// RED at HEAD for the refusal; the node-shape half is GREEN and must stay so.
// ===========================================================================

describe("bug 0100 (b) — a dangling `as` is refused once per malformed specifier", () => {
  // Column of the malformed specifier's source token in each fixture: both
  // keywords are six characters, so `{` sits at column 8 and the first
  // specifier's source token at column 10.
  const SPECIFIER_LEVEL: ReadonlyArray<readonly [string, number, readonly string[], string]> = [
    [
      'import { a as } from "./m.thetalib"',
      10,
      ["a"],
      "the `as` is consumed and `local` stays `source`, so the author's alias is absent",
    ],
    [
      'export { a as } from "./m.thetalib"',
      10,
      ["a"],
      "the `export` analogue — the same drop decides the module's published export set",
    ],
    [
      'import { a as , b } from "./m.thetalib"',
      10,
      ["a", "b"],
      "the comma arm resumes the list after the dropped alias, so ONE specifier is malformed",
    ],
    [
      'import { a as as b } from "./m.thetalib"',
      10,
      ["a", "b"],
      "the catch-all consumes the second `as` and `b` becomes its own specifier, so ONE specifier is malformed",
    ],
  ];

  for (const [spelling, column, symbols, why] of SPECIFIER_LEVEL) {
    it(`RED (b, ${JSON.stringify(spelling)}): exactly one ${CODE} ranged over the specifier — ${why}`, () => {
      const doc = parseLib(spelling);
      expectSpecifierRefusal(`spelling ${JSON.stringify(spelling)}`, doc, column);
      expect(
        diagCodes(doc.diagnostics).filter((code) => code !== CODE),
        `spelling ${JSON.stringify(spelling)}: no other code — the specifier arm answers the specifier's shape and nothing else. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
      ).toEqual([]);
      const node = firstStatement(doc);
      expect(
        node.symbols,
        "§Fix constraint 7 / §Non-goals \"recovery shape\" — the node is UNCHANGED: `checkThetaImports` reaches `extractThetaLibForms` over a refused-but-parsed lib regardless, so an assert at a reader would crash on refused input",
      ).toEqual(symbols);
      expect(
        node.specifiers[0]?.local,
        "the dropped alias still leaves `local === source`; the refusal is the observable, not a repaired node",
      ).toBe(node.specifiers[0]?.source);
      expect(
        node.specifiers[0]?.range.start,
        "the specifier range the refusal must carry is the node's own specifier range",
      ).toEqual({ line: 1, column });
    });
  }
});

// ===========================================================================
// (c) THE PRODUCTION-ADMITTED CONTROLS — the fence against widening either arm.
// GREEN at HEAD and required to stay green: these are the spellings
// imports.md:37–40 admit, including the `","?` trailing-comma form the bug doc
// §Non-goals keeps out of the refused set.
// ===========================================================================

describe("bug 0100 (c) — a conforming specifier list stays silent", () => {
  const LEGAL: ReadonlyArray<readonly [string, string]> = [
    ['import { a } from "./m.thetalib"', "imports.md:39 — the plain `Ident` specifier"],
    ['import { a as b } from "./m.thetalib"', "imports.md:39 — the `Ident \"as\" Ident` specifier"],
    [
      'import { a, } from "./m.thetalib"',
      "imports.md:37 `\",\"?` — the trailing-comma form, explicitly outside the refused set (§Non-goals)",
    ],
    // 0058's three from-bearing controls
    // (tests/import-export-from-clause-required.test.ts:432–439), re-asserted
    // here because both new arms run on the same statements.
    ['export { greet } from "./m.thetalib"', "imports.md:32 — the re-export the page defines"],
    ['import { greet } from "./m.thetalib"', "imports.md:61 — the plain import"],
    ['export { greet as hello } from "./m.thetalib"', "imports.md:33 — the aliased re-export"],
  ];

  for (const [spelling, why] of LEGAL) {
    it(`GREEN (c, ${JSON.stringify(spelling)}): no diagnostic of any code — ${why}`, () => {
      const doc = parseLib(spelling);
      expect(
        withCode(doc.diagnostics, CODE),
        `${spelling}: the refused set is enumerated (§Fix constraint 1) and every spelling the productions admit stays silent`,
      ).toEqual([]);
      expect(
        diagLines(doc.diagnostics),
        `${spelling}: this fixture is legal input at every position and carries no diagnostic of any code`,
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// (d) THE STATEMENT ARM'S GATE — the no-`from` spellings keep exactly their
// current code list. `theta/parse/import-missing-from-clause`'s registry
// *Trigger* (code-registry-parse.md:119) already claims the bare-keyword and
// empty-list spellings, so the statement arm must NOT co-emit there. GREEN at
// HEAD, and a later un-gating reds here.
// ===========================================================================

describe("bug 0100 (d) — the statement arm is gated on a well-formed trailing clause", () => {
  const ALREADY_REFUSED: ReadonlyArray<readonly [string, string]> = [
    ["import", "the bare keyword the 0058 Trigger names explicitly"],
    ["import {}", "the empty-list spelling the same Trigger names explicitly"],
    ["import { a } from", "a `from` keyword with no string token after it"],
  ];

  for (const [spelling, why] of ALREADY_REFUSED) {
    it(`GREEN (d, ${JSON.stringify(spelling)}): the whole code list stays [${MISSING_FROM_CODE}] — ${why}`, () => {
      const doc = parseLib(spelling);
      expect(
        diagCodes(doc.diagnostics),
        `${spelling}: this spelling is inside ${MISSING_FROM_CODE}'s Trigger, so it keeps emitting ONLY that code — co-emitting ${CODE} would change 0058's whole-list witnesses and the reserved-keyword matrix cells (tests/reserved-keyword-type-position.test.ts). Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
      ).toEqual([MISSING_FROM_CODE]);
      expect(
        diagLines(doc.diagnostics),
        `${spelling}: the rendered line is 0058's registry message unchanged`,
      ).toEqual([`error ${MISSING_FROM_CODE}: ${normativeMessage(MISSING_FROM_CODE)}`]);
    });
  }
});

// ===========================================================================
// (e) CO-EMISSION WITH BUG 0040's PER-SPECIFIER CHECK.
// §Fix constraint 2 keeps `theta/parse/import-reserved-synthesised-name`'s
// emission set unnarrowed, and the specifier arm is UNGATED, so both appear.
// ===========================================================================

describe("bug 0100 (e) — the specifier arm co-emits with bug 0040's reserved-name check", () => {
  const RESERVED_BINDING = "__inline_0123456789abcdef";

  it(`RED (e): a dangling-\`as\` \`import { ${RESERVED_BINDING} as }\` emits BOTH codes`, () => {
    const doc = parseLib(`import { ${RESERVED_BINDING} as } from "./m.thetalib"`);
    expect(
      withCode(doc.diagnostics, CODE).length,
      `the specifier's \`as\` is consumed with no alias after it, so the specifier arm applies. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
    ).toBe(1);
    expect(
      withCode(doc.diagnostics, RESERVED_CODE).length,
      `§Fix constraint 2 — bug 0040's per-specifier check keeps its emission on this input (its Trigger states the co-emission rule, code-registry-parse.md:118). Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
    ).toBe(1);
    expect(
      diagLines(doc.diagnostics).sort(),
      "the two codes answer different questions about the same specifier — its malformed shape and its reserved local binding — so both render, each provable red-able on its own",
    ).toEqual(
      [
        `error ${CODE}: ${malformedListMessage()}`,
        `error ${RESERVED_CODE}: ${normativeMessage(RESERVED_CODE).replace("<name>", RESERVED_BINDING)}`,
      ].sort(),
    );
  });

  it(`GREEN (e-control): the aliased spelling keeps its silence`, () => {
    // The measured asymmetry the bug reports: with the alias written, `local`
    // is `x` and bug 0040's check has no subject; the dangling `as` makes the
    // reserved source name the local and draws a refusal the author's spelling
    // does not. This control is the fence that the specifier arm reads the
    // specifier's SHAPE, not its names.
    const doc = parseLib(`import { ${RESERVED_BINDING} as x } from "./m.thetalib"`);
    expect(
      diagLines(doc.diagnostics),
      "a well-formed `Ident \"as\" Ident` specifier binding a non-reserved alias is legal input at every position",
    ).toEqual([]);
  });
});

// ===========================================================================
// (e2) CO-EMISSION WITH 0058's TRAILING-CLAUSE REFUSAL.
// The specifier arm is UNGATED, so a dangling `as` on a from-less list draws
// BOTH codes on one statement (imports.md:57–60, mirrored at
// docs/reference/grammar.md:56–60, and stated in `checkImportDanglingAlias`'s
// contract, src/parser/imports.ts:452–476). Group (d) fences the STATEMENT
// arm's gate; nothing there carries a dangling `as`, so without this group a
// later gating of the specifier arm on `hasFromKeyword` would leave every
// shipped test green while that normative sentence turned false.
// ===========================================================================

describe("bug 0100 (e2) — the specifier arm co-emits with 0058's trailing-clause refusal", () => {
  const FROM_LESS_DANGLING: ReadonlyArray<readonly [string, string]> = [
    ["import { a as }", "a dangling `as` with no `from` clause at all"],
    ["export { a as }", "the `export` analogue — one function parses both keywords"],
  ];

  for (const [spelling, why] of FROM_LESS_DANGLING) {
    it(`RED (e2, ${JSON.stringify(spelling)}): the whole code list is [${MISSING_FROM_CODE}, ${CODE}] at two different ranges — ${why}`, () => {
      const doc = parseLib(spelling);
      // The specifier arm's own range and message, asserted first so a red
      // names the absent per-specifier refusal before the list comparison.
      expectSpecifierRefusal(`spelling ${JSON.stringify(spelling)}`, doc, 10);
      expect(
        diagCodes(doc.diagnostics),
        `${spelling}: the whole list — the statement has no \`from\` clause AND a malformed specifier, and the specifier arm is unconditional, so both codes render. Emission order is the assembled document order (by range start), so 0058's statement-ranged diagnostic precedes the specifier-ranged one. Rendered: ${JSON.stringify(diagLines(doc.diagnostics))}`,
      ).toEqual([MISSING_FROM_CODE, CODE]);
      expect(
        diagLines(doc.diagnostics),
        `${spelling}: DIAG-4 — both rendered lines are their registry rows' *Message* columns verbatim`,
      ).toEqual([
        `error ${MISSING_FROM_CODE}: ${normativeMessage(MISSING_FROM_CODE)}`,
        `error ${CODE}: ${malformedListMessage()}`,
      ]);
      const missingFrom = withCode(doc.diagnostics, MISSING_FROM_CODE)[0] as Diagnostic;
      const malformed = withCode(doc.diagnostics, CODE)[0] as Diagnostic;
      expect(
        missingFrom.range?.start,
        `${spelling}: §Fix constraint 2 — 0058's refusal is statement-ranged, so it starts at the keyword`,
      ).toEqual({ line: 1, column: 1 });
      expect(
        malformed.range,
        `${spelling}: the two codes report facts at two granularities — a statement-level missing clause and a specifier-level malformed shape — so their ranges must DIFFER. A specifier arm ranged over the statement, or gated on the \`from\` clause, reds here`,
      ).not.toEqual(missingFrom.range);
      expect(
        firstStatement(doc).symbols,
        "§Fix constraint 7 — the node is unchanged: the dropped alias still leaves the source name bound",
      ).toEqual(["a"]);
    });
  }
});

// ===========================================================================
// (f) THE BINDING CONSEQUENCES THE REFUSAL MAKES UNREACHABLE.
// Each row pins the REASON it becomes unreachable: the refusal fires at parse,
// AND the downstream observable is asserted UNCHANGED (§Fix constraint 7 — the
// node shape does not move, so a later narrowing of the refusal reds here).
// ===========================================================================

describe("bug 0100 (f) — the dangling `as`'s downstream consequences, pinned with the refusal", () => {
  const LIB_FN_A = "fn a(x: string) { x }\n";

  it("RED (f-collision): the collapsed local name still collides, and the specifier is now refused", async () => {
    // The measured pair: `import { a as b }` beside a local `fn a` loads clean,
    // and the dangling spelling reinstates the collision the alias existed to
    // avoid (`checkImportNameCollisions`, src/parser/imports.ts:597, compares
    // locals). The refusal is what takes the input out of that comparison.
    const appBody = 'import { a as } from "./lib.thetalib"\nfn a(x: string) { x }\nlet x = 1\n';
    const parsed = parseApp(appBody);
    expectSpecifierRefusal("f-collision app parse", parsed, 10, APP_FIRST_BODY_LINE);
    const result = await loadImports(appBody, { "/proj/lib.thetalib": LIB_FN_A });
    expect(
      diagLines(result.diagnostics),
      "§Fix constraint 7 — the load pass is UNCHANGED: `local` is still the source name, so the collision still fires on the same input",
    ).toEqual([
      `error ${COLLISION_CODE}: ${normativeMessage(COLLISION_CODE).replace("<name>", "a")}`,
    ]);
    expect(
      result.materialised,
      "materialisation binds under `local`, which the fix does not move",
    ).toEqual(["fn a"]);
  });

  it("GREEN (f-collision-control): the author's aliased spelling loads clean", async () => {
    const appBody = 'import { a as b } from "./lib.thetalib"\nfn a(x: string) { x }\nlet x = 1\n';
    expect(
      withCode(parseApp(appBody).diagnostics, CODE),
      "a conforming specifier is not refused — this is the spelling the author wrote",
    ).toEqual([]);
    const result = await loadImports(appBody, { "/proj/lib.thetalib": LIB_FN_A });
    expect(diagLines(result.diagnostics), "no collision: the alias keeps the names apart").toEqual(
      [],
    );
    expect(result.materialised, "the alias is the local binding").toEqual(["fn b"]);
  });

  it("RED (f-scope): the intended alias is still unknown at a call site, and the specifier is now refused", () => {
    // `collectIdentRoots` / `checkLexicalCallSites`
    // (src/parser/theta-document.ts:4844, :5701) fold `s.symbols`, so the
    // dangling `as` seeds the SOURCE name and a call to the intended alias is
    // refused. The specifier refusal is what stops the program reaching that
    // state; the unknown-identifier line is asserted UNCHANGED beside it.
    const doc = parseApp('import { a as } from "./lib.thetalib"\nlet r = b("x")\nr\n');
    expectSpecifierRefusal("f-scope", doc, 10, APP_FIRST_BODY_LINE);
    expect(
      diagLines(withCode(doc.diagnostics, UNKNOWN_IDENTIFIER_CODE)),
      "§Fix constraint 7 — the identifier scope is UNCHANGED: the source name is still what binds, so the alias at the call site is still unknown",
    ).toEqual([
      `error ${UNKNOWN_IDENTIFIER_CODE}: ${normativeMessage(UNKNOWN_IDENTIFIER_CODE).replace("<name>", "b")}`,
    ]);
  });

  it("GREEN (f-scope-control): the aliased spelling binds the alias at the call site", () => {
    const doc = parseApp('import { a as b } from "./lib.thetalib"\nlet r = b("x")\nr\n');
    expect(
      diagLines(doc.diagnostics),
      "the conforming specifier binds `b`, so the call resolves at parse and nothing is refused",
    ).toEqual([]);
  });

  it("RED (f-export-set): the module still publishes the source name, and the lib specifier is now refused", async () => {
    // `extractThetaLibForms` records `exported: specifier.local`
    // (src/extension/import-static-checks.ts:128) and
    // `computeThetaLibExports` publishes it (src/parser/imports.ts:814–819), so
    // a lib whose author wrote `export { greet as hello } from` publishes
    // `greet` and the downstream `import { hello }` is refused as unknown. The
    // refusal at the LIB is what stops the module's public API differing from
    // its source text.
    const libBody = 'export { greet as } from "./mid.thetalib"';
    expectSpecifierRefusal("f-export-set lib parse", parseLib(libBody), 10);
    const result = await loadImports('import { hello } from "./lib.thetalib"\nlet x = 1\n', {
      "/proj/lib.thetalib": `${libBody}\n`,
      "/proj/mid.thetalib": "fn greet(x: string) { x }\n",
    });
    expect(
      diagLines(result.diagnostics),
      "the importer sees BOTH halves of §Fix constraint 7, in IMP-4-then-IMP-3 emission order. " +
        "(1) The refused lib is still PARSED and still read: `checkThetaImports` pushes every " +
        "`isRegistrationError` diagnostic from the resolved lib's own parse " +
        "(src/extension/import-static-checks.ts:388–392) and then calls `extractThetaLibForms` " +
        "over that same body regardless (:399), which is exactly why no invariant may be asserted " +
        "at those readers — the lib's specifier refusal therefore propagates to the importer, on " +
        "the same channel bug 0040's reserved-name refusal already propagates on. " +
        "(2) The PUBLISHED EXPORT SET is unchanged (§Non-goals \"recovery shape\"): the dropped " +
        "alias still publishes `greet`, so the name the lib's source text documents — `hello` — is " +
        "still refused downstream by the untouched IMP-3 arm. A narrowing of either half reds here",
    ).toEqual([
      `error ${CODE}: ${malformedListMessage()}`,
      `error ${UNKNOWN_SYMBOL_CODE}: ${normativeMessage(UNKNOWN_SYMBOL_CODE)
        .replace("<name>", "hello")
        .replace("<path>", "./lib.thetalib")}`,
    ]);
  });

  it("GREEN (f-export-set-control): the aliased re-export publishes the alias", async () => {
    // The from-bearing re-export's materialisation gap (empty `materialised`
    // even here) is 0058 §Non-goals and residual (ii), not this bug's.
    const libBody = 'export { greet as hello } from "./mid.thetalib"';
    expect(
      withCode(parseLib(libBody).diagnostics, CODE),
      "the conforming aliased re-export is not refused",
    ).toEqual([]);
    const result = await loadImports('import { hello } from "./lib.thetalib"\nlet x = 1\n', {
      "/proj/lib.thetalib": `${libBody}\n`,
      "/proj/mid.thetalib": "fn greet(x: string) { x }\n",
    });
    expect(
      diagLines(result.diagnostics),
      "the alias is published, so the downstream specifier matches",
    ).toEqual([]);
  });
});

// ===========================================================================
// (g) THE ZERO-SPECIFIER STATEMENT AT THE LOAD PASS.
// `checkThetaImports`' early return counts DECLS, not specifiers
// (src/extension/import-static-checks.ts:291), so a binding-free statement
// drives IMP-1, IMP-4 and IMP-5 in full. The fix adds the PARSE refusal and
// changes none of that (§Fix constraint 7): each row asserts the load pass
// UNCHANGED beside the new statement-level refusal on the app's own parse.
// ===========================================================================

describe("bug 0100 (g) — a zero-specifier statement's load-pass reach, pinned with the refusal", () => {
  const LIB_GREET = "fn greet(x: string) { x }\n";

  const ZERO_SPECIFIER: ReadonlyArray<readonly [string, string]> = [
    ['import {} from "./lib.thetalib"', "braces, zero specifiers"],
    ['import from "./lib.thetalib"', "no braces at all"],
  ];

  for (const [statement, why] of ZERO_SPECIFIER) {
    it(`RED (g, ${JSON.stringify(statement)}): refused at parse while the load pass still materialises nothing — ${why}`, async () => {
      const appBody = `${statement}\nlet x = 1\n`;
      expectStatementRefusal(
        `g app parse ${JSON.stringify(statement)}`,
        parseApp(appBody),
        APP_FIRST_BODY_LINE,
      );
      const result = await loadImports(appBody, { "/proj/lib.thetalib": LIB_GREET });
      expect(
        diagLines(result.diagnostics),
        "§Fix constraint 7 — the load pass is UNCHANGED: the two per-specifier passes iterate zero times and the three whole-file passes do their full work silently",
      ).toEqual([]);
      expect(result.materialised, "a zero-specifier statement binds nothing").toEqual([]);
    });
  }

  it("RED (g-IMP-1): a zero-specifier statement still fails resolution, and is refused at parse", async () => {
    const appBody = 'import {} from "./missing.thetalib"\nlet x = 1\n';
    expectStatementRefusal("g-IMP-1 app parse", parseApp(appBody), APP_FIRST_BODY_LINE);
    const result = await loadImports(appBody, { "/proj/lib.thetalib": LIB_GREET });
    expect(
      diagCodes(result.diagnostics),
      "IMP-1 is driven by the decl, not by its specifier count, and the fix does not change that",
    ).toEqual(["theta/load/unresolvable-thetalib-path"]);
  });

  it("RED (g-IMP-4): a zero-specifier statement still propagates the lib's registration error, and is refused at parse", async () => {
    const appBody = 'import {} from "./lib.thetalib"\nlet x = 1\n';
    expectStatementRefusal("g-IMP-4 app parse", parseApp(appBody), APP_FIRST_BODY_LINE);
    const result = await loadImports(appBody, {
      // A top-level `let` is not a permitted `.thetalib` form (imports.md:13),
      // so the resolved lib carries its own error-severity parse diagnostic.
      "/proj/lib.thetalib": `let y = 1\n${LIB_GREET}`,
    });
    expect(
      diagCodes(result.diagnostics),
      "IMP-4 propagates the resolved lib's error-severity parse diagnostics regardless of the importing specifier count",
    ).toEqual(["theta/parse/thetalib-top-level-statement"]);
    expect(
      result.diagnostics.some(isRegistrationError),
      "a statement that binds nothing can still un-register the importing theta — which is why the statement itself is refused",
    ).toBe(true);
  });

  it("RED (g-IMP-5): a zero-specifier statement still seeds the cycle graph, and is refused at parse", async () => {
    const appBody = 'import {} from "./a.thetalib"\nlet x = 1\n';
    expectStatementRefusal("g-IMP-5 app parse", parseApp(appBody), APP_FIRST_BODY_LINE);
    const result = await loadImports(appBody, {
      "/proj/a.thetalib": 'import { z } from "./b.thetalib"\nfn z(x: string) { x }\n',
      "/proj/b.thetalib": 'import { z } from "./a.thetalib"\nfn z(x: string) { x }\n',
    });
    expect(
      diagCodes(result.diagnostics),
      "IMP-5's walk starts from the decl, so a binding-free statement reports a cycle it participates in",
      // Bug 0335 widening (subject preserved): a.thetalib and b.thetalib each
      // import { z } from the other AND declare their own `fn z` — a genuine
      // imports.md:124 collision on both libraries, incidental to this cell's
      // zero-specifier-statement / import-cycle subject. The cycle code stays
      // asserted; this only adds the two collision codes the reused arm now
      // also emits (one per library), in the exact order the load pass renders.
    ).toEqual([
      "theta/parse/import-name-collision",
      "theta/parse/import-name-collision",
      "theta/load/import-cycle",
    ]);
  });

  it("GREEN (g-control): the conforming import materialises its symbol", async () => {
    const appBody = 'import { greet } from "./lib.thetalib"\nlet x = 1\n';
    expect(
      withCode(parseApp(appBody).diagnostics, CODE),
      "a conforming import is not refused by either arm",
    ).toEqual([]);
    const result = await loadImports(appBody, { "/proj/lib.thetalib": LIB_GREET });
    expect(diagLines(result.diagnostics), "the conforming load path is untouched").toEqual([]);
    expect(result.materialised, "the imported `fn` materialises").toEqual(["fn greet"]);
  });
});
