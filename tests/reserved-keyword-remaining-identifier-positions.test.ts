import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { reservedKeywords } from "../src/lexer/lexer";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0153 — the SIX remaining identifier positions of the reserved-keyword
// rule (docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md).
//
// THE RULE, written with no position qualifier.
// docs/spec_topics/lexical.md:20 reserves 32 spellings — `let`, `mut`, `fn`,
// `if`, `else`, `for`, `in`, `while`, `break`, `continue`, `return`, `match`,
// `schema`, `enum`, `import`, `export`, `from`, `as`, `by`, `invoke`, `true`,
// `false`, `null`, `Ok`, `Err`, `Result`, `string`, `number`, `integer`,
// `boolean`, `array`, `void` — and states the consequence with no scope list:
// "Using one of these in identifier position is
// `theta/parse/reserved-keyword-as-identifier`". The registered row
// (docs/spec_topics/diagnostics/code-registry-parse.md:21, severity `E`)
// repeats that shape: *Trigger* "Reserved keyword used in an identifier
// position", naming no position. docs/reference/grammar.md:117 restates the
// list under the same code. lexical.md:3 applies every rule on that page to
// `.theta` and `.thetalib` alike.
//
// THE SIX POSITIONS THIS FILE WITNESSES, each an `Ident` terminal or a
// spec-named identifier:
//   1. the `for` iteration variable   — `ForStmt ::= "for" Ident "in" Expr
//      StmtBlock` (docs/reference/grammar.md:272);
//   2. the `par for` iteration variable — `ParForExpr ::= "par" "for" Ident
//      "in" Expr MaxClause? ParForBody` (docs/reference/grammar.md:273);
//   3. the schema field NAME — "the field identifier"
//      (docs/spec_topics/schemas.md:23);
//   4. the `params:` frontmatter field NAME — "exposed as typed variables in
//      the theta body"
//      (docs/spec_topics/frontmatter/frontmatter-fields-a.md:57);
//   5. the `enum` variant NAME — "Variant names are PascalCase identifiers"
//      (docs/spec_topics/schemas.md:78);
//   6. the `import` / `export` specifier's SOURCE and ALIAS name slots —
//      `ImportSpec ::= Ident ("as" Ident)?` (docs/reference/grammar.md:36).
//
// WHY EVERY ENFORCER REACHES SOMEWHERE ELSE. The lexer half is `checkName`'s
// keyword arm inside `contextualDiagnostics` (src/lexer/lexer.ts:810), reached
// by a keyword-adjacency dispatch with exactly three arms — the identifier
// after `let` (past the `mut` skip, `:876`), after `fn` (`:883`), and after
// `schema` / `enum` (`:885`). None of the six positions is `k+1` from one of
// those four keywords: a `for` variable follows `for`, a schema field name and
// an `enum` variant name follow `{` or `,`, an `import` specifier follows `{`,
// `,` or `as`, and a `params:` field name is not a token at all. The lexer's
// own scope note (`:806–808`) hands this class over in terms — "full
// identifier-position coverage (every reserved word in every identifier slot)
// is a parser-leaf obligation". Bug 0044's four `Type`-position emitters go
// through `reservedKeywordAsIdentifierDiagnostic`
// (src/parser/theta-document.ts:5971, called at `:7047`, `:7520`, `:7968` and
// beside `:4475`/`:4530`) and serve TYPE slots, not NAME slots. Bug 0148's
// emission serves the `fn` parameter NAME and is guarded on `atParamStart`, a
// `parseFn` loop-local. The six sites themselves each admit a keyword
// explicitly and test nothing: `parseFor` (`:2327`, the capture at `:2341`,
// `const variable = this.advance().text;`, no kind test), `parseParFor`
// (`:4707`, the same capture at `:4722`), `parseSchemaObjectBody` (`:2892`,
// `const nameTok = this.peek();` at `:2909` and `nameTok.kind === "ident" ||
// nameTok.kind === "keyword"` at `:2910`), `parseEnumVariants` (`:3047`, the
// same disjunction at `:3090`), `parseImportExport` (`:3187`, `isSymbolToken`
// at `:3221–3222` and the alias disjunction at `:3241–3242`), and
// `extractParsedParams` (src/parser/frontmatter.ts:749,
// `const name = String(item.key.value);`), where the name is a YAML scalar key
// with no token kind and no token range.
//
// THE SITE DECISION THIS FILE IS WRITTEN TO (bug 0153 §Fix (a) route 2 for the
// five token faces, §Fix (b) for the sixth). Six parser-leaf emissions, no
// lexer edit: five in `src/parser/theta-document.ts` reusing the EXISTING
// helper `reservedKeywordAsIdentifierDiagnostic` (`:5971`) unchanged at the
// six name slots named above, and the sixth in `src/parser/frontmatter.ts`'s
// `extractParsedParams` loop, which cannot import `theta-document.ts` and so
// constructs the same shape locally, keyed on that module's existing
// `RESERVED_KEYWORDS` set (`src/parser/frontmatter.ts:478`,
// `= reservedKeywords()`) and ranged on `rangeOf(item.key, …) ?? range` —
// exactly as bug 0149's `binding-case-mismatch` emission in the SAME loop
// already does. The `params:` face emits the REGISTERED code
// `theta/parse/reserved-keyword-as-identifier` verbatim and not a
// `theta/load/` twin: DIAG-2 closes the registry and the `load` namespace
// carries no reserved-keyword row, the code names the RULE and not the
// module, and bug 0149's
// emission from this same frontmatter loop is already a `theta/parse/*` code.
// `src/lexer/lexer.ts` is not edited (bug 0148's discipline: open bugs 0051 and
// 0135 hold live citations in it).
//
// THE MISFIRE DISPOSITION, AS IT NOW STANDS — bug 0242
// (docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md) is the
// authority for every row in this file that once pinned a second or third
// diagnostic beside the correct one. Bug 0153 §Fix (c) took route (i) —
// ACCEPT the lexer's pre-existing adjacency verdict and pin the resulting
// count and ORDER — because repairing the faces meant editing
// `src/lexer/lexer.ts`, which open bugs 0051 and 0135 hold citations in. Bug
// 0242 filed those three faces as their own defect and took §Fix ROUTE A:
// `contextualDiagnostics` (src/lexer/lexer.ts:810) now classifies the region a
// `{` opens and recognises a member NAME slot and a for-iteration-variable
// slot, and at a name slot BOTH the three declarator arms and the
// `controlHeads` scan (`:812`) are skipped. So each face now reports ONE
// diagnostic — the correct one, at the name the author chose:
//   - the `for` / `par for` face: `for let in xs { 1 }` reports the refusal
//     naming `let` at the variable's own range and nothing about the grammar's
//     own `in`, a `ForStmt` terminal (docs/reference/grammar.md:272) and not an
//     identifier position (rows m1, m6, m8, m9, x10);
//   - the `as` face: `schema S { let as "w": string }` and
//     `import { let as x } …` report the field-name / specifier-name refusal
//     alone; `as` is the wire-rename keyword (docs/spec_topics/schemas.md:23)
//     and an `ImportSpec` terminal (grammar.md:36–37) (rows w1–w3);
//   - the `single-line-if` face: `schema S { fn: string }`, `enum E { fn }`,
//     `import { fn } …` and `import { a as fn } …` draw no
//     `theta/parse/single-line-if` at all. That row's *Trigger* is a body that
//     is not a braced block (code-registry-parse.md:23) and a field name, a
//     variant name and an import specifier have no body (rows w4–w7).
// Route (iii) as 0153 framed it — requiring the `k+1` token to be `ident`-kind
// — is still refuted by row k1 below, which must keep firing; 0242's route
// discriminates on the SLOT, not on the token kind, which is what keeps rows
// k1–k5 green.
// ORDER is still not guessed where two diagnostics remain: every group funnels
// through `assembleDiagnostics` (src/diagnostics/diagnostic.ts:107–127), which
// stable-sorts by (file, line, column) over the groups collected at
// src/parser/theta-document.ts:1068 in the order
// [frontmatterDiags, lex.diagnostics, parser.diagnostics, …]. So a strictly
// left-of diagnostic comes first whatever its group — which is why row m9's
// `mut-on-immutable-context` @5:5-5:8 (parser) precedes the reserved refusal
// at the variable beside it.
//
// WHAT MUST NOT MOVE (bug 0153 §Fix (e) and §Non-goals), each pinned below:
// bug 0148's `fn` parameter emission (row k5) and the three enforced lexer
// adjacencies (rows k1–k4); bug 0141's `match` pattern binder (row n1 — that
// binder FIRES at this HEAD, delivered in 0.146.0, and this file records the
// delivery without claiming it); bug 0044's TYPE-slot emissions with their
// current ranges (rows n3 @4:1-4:20 and n4 @4:6-4:9); `for mut in xs { 1 }` and
// `par for mut in xs { 1 }` keeping `theta/parse/mut-on-immutable-context`
// ALONE (rows m11, m12 — a naive emission at the capture would fire on the
// recovery artefact, the failure mode bug 0148's `atParamStart` guard exists to
// prevent, while rows m13 / m14 pin the other side: a GENUINE variable spelled
// `in` behind a `mut` still fires, so the suppression reads the FOLLOWING token
// rather than the variable's spelling); the contextual keywords `par` /
// `with` / `subagent` staying silent at all six positions (rows ck1–ck3), which a predicate reading
// `kind === "keyword"` or `reservedKeywords()` gets for free and a predicate
// minting a second list reds on; and the conformant controls c1–c7 staying `[]`
// and still registering.
//
// ANTI-VACUITY. The seven 32-spelling sweeps assert 224 whole ordered
// diagnostic lists, of which 224 are non-empty after the fix and 196 are empty
// at this HEAD, so a harness that stopped reaching the lexer or the parser
// cannot turn any assertion here into a silent pass — the k-rows, n-rows and
// misfire rows all expect non-empty lists that are non-empty TODAY. Every list
// assertion is an ordered whole-list equality over the UNFILTERED
// `doc.diagnostics` rendered `severity code @l:c-l:c: message`, so neither an
// extra diagnostic, nor a diagnostic at the wrong range, nor one naming the
// wrong keyword can hide inside a containment check. The conformant control at
// each position (c1–c7) is what stops a fix satisfying the firing rows by
// refusing every `for` / `schema` / `params:` / `enum` / `import` construct.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74) — no asserted
// message string is written out here. Every one is READ from the registry's
// *Message* column through `parseRegistry` / `registryMessage`
// (tools/code-registry/index.js). The reserved row's template carries a
// `<keyword>` slot, which `reservedMsg` fills after asserting its presence.
// DIAG-2 (`:72`) is not engaged: every code asserted below is already
// registered and no *Trigger* is edited — the emission moves onto a *Trigger*
// that already covers the position, which is the GOV-15 addition disposition
// docs/spec_topics/governance/source-language-stability.md:25 records.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts:39) — there is no session, no host and no model on
// this path, so an integration tier would add a round-trip to a parse-time
// value and buy no reach, and a live tier would make a fully determined value
// stochastic. The one thing this tier cannot reach is the composition root's
// registration decision, which the `blocksRegistration` rows mirror by
// construction (`hasLoadParseError`,
// src/extension/production-composition.ts:2220, applied at `:2267`) and which
// the standalone live cell
// (tests/live/reserved-keyword-remaining-positions-live-cell.test.ts)
// exercises end to end.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. The registry lookups assert their row's presence and
// their template's placeholder before either is used, and the spelling list is
// read from the shipped `reservedKeywords()` with its size asserted, so a
// shrunken set reds rather than quietly sweeping less.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* and *Sev* columns.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

const RESERVED = "theta/parse/reserved-keyword-as-identifier";
const MUT_IMMUTABLE = "theta/parse/mut-on-immutable-context";
const IMPORT_MALFORMED = "theta/parse/import-malformed-specifier-list";

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row or a reworded template reds by naming the registry rather than
 * by a bare `undefined` comparison.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

/** The registry *Message* for the reserved code with `<keyword>` filled. */
function reservedMsg(keyword: string): string {
  return msg(RESERVED, [["<keyword>", keyword]]);
}

// ===========================================================================
// Parse harness and the rendered-diagnostic vocabulary.
// ===========================================================================
//
// `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is
// stubbed: the lexer and parser under assertion are the production ones.

/** Frontmatter for every `.theta` row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` as a `.theta` under the standard frontmatter. */
function theta(body: string): ThetaDocument {
  return parseDoc(FM + body);
}

/**
 * Every diagnostic rendered `severity code @l:c-l:c: message`, in report order,
 * over the UNFILTERED list. This is the assertion vocabulary of the whole file:
 * an ordered whole-list `toEqual` over these strings pins the count, the order,
 * the code, the severity, the range AND the interpolated subject of every
 * diagnostic at once, which is what makes "the position reports the wrong
 * subject" and "the position reports nothing" distinguishable failures.
 */
function lines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at =
      r === undefined
        ? "-"
        : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    return `${d.severity} ${d.code} @${at}: ${d.message}`;
  });
}

/** One rendered `error`-severity diagnostic line, single-line range. */
function at(
  code: string,
  message: string,
  line: number,
  column: number,
  endColumn: number,
): string {
  return `error ${code} @${line}:${column}-${line}:${endColumn}: ${message}`;
}

/**
 * The reserved diagnostic this bug requires, ranged on the offending NAME
 * itself: one-token names are ASCII here, so the end column is
 * `column + keyword.length` (1-indexed, end-exclusive, per lexical.md
 * §"Diagnostic spans").
 */
function reservedAt(keyword: string, line: number, column: number): string {
  return at(RESERVED, reservedMsg(keyword), line, column, column + keyword.length);
}

/** `parseFor` / `parseParFor`'s own modifier verdict, ranged on `mut`. */
function mutAt(line: number, column: number): string {
  return at(MUT_IMMUTABLE, msg(MUT_IMMUTABLE, []), line, column, column + "mut".length);
}

/**
 * Whether `diagnostics` blocks registration. This replicates `hasLoadParseError`
 * (src/extension/production-composition.ts:2220) by construction: that function
 * is module-private — `rg -n 'export.*hasLoadParseError' src/` matches nothing —
 * so it cannot be imported, and the predicate is mirrored here instead, the same
 * way and for the same reason tests/fn-param-name-reserved-keyword.test.ts and
 * tests/index-element-alias-runtime-disposition.test.ts mirror it. Its clauses
 * are the whole of the original: error severity, and a code in the
 * `theta/load/` or `theta/parse/` namespace. `parseDiscoveredTheta` applies it
 * at `:2267` and drops the theta.
 */
function blocksRegistration(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.code.startsWith("theta/load/") ||
        diagnostic.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// The spelling list and the two lexer sub-sets the sweeps partition on.
// ===========================================================================

/**
 * lexical.md:20's 32 spellings, read from the shipped set
 * (`reservedKeywords()`, src/lexer/lexer.ts:159–166) rather than copied, so the
 * sweeps below cannot drift from the set the fix's own predicate reads and a
 * fix that mints a second list has nowhere to hide.
 */
const SPELLINGS: readonly string[] = [...reservedKeywords()];

// The two lexer sub-sets earlier revisions of this file partitioned on —
// `controlHeads` (src/lexer/lexer.ts:812) and the three declarator arms' heads
// — no longer divide any sweep: bug 0242's §Fix ROUTE A removed every misfire
// they used to predict, so each sweep below is stated as one rule over all 32
// spellings, with only the pre-existing `mut` and `as` recoveries carved out.

/** Run one position's whole 32-spelling sweep into `spelling -> rendered list`. */
function sweep(
  source: (keyword: string) => string,
  path?: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const keyword of SPELLINGS) {
    const text = source(keyword);
    out[keyword] = lines(path === undefined ? parseDoc(text) : parseDoc(text, path));
  }
  return out;
}

/** Build the expected sweep from a per-spelling rule. */
function expectedSweep(rule: (keyword: string) => string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const keyword of SPELLINGS) {
    out[keyword] = rule(keyword);
  }
  return out;
}

// The seven source shapes the sweeps drive, one per position (the import face
// has two name slots and therefore two shapes). Body line numbers: the `.theta`
// frontmatter occupies lines 1–3, so a one-line body sits on line 4 and a body
// preceded by `let xs = [1]` sits on line 5.
const forSource = (kw: string): string =>
  `${FM}let xs = [1]\nfor ${kw} in xs { 1 }\n1\n`;
const parForSource = (kw: string): string =>
  `${FM}let xs = [1]\npar for ${kw} in xs { 1 }\n1\n`;
const schemaFieldSource = (kw: string): string => `${FM}schema S { ${kw}: string }\n1\n`;
const paramsSource = (kw: string): string =>
  `---\nmode: prompt\nparams:\n  ${kw}: string\n---\n1\n`;
const enumVariantSource = (kw: string): string => `${FM}enum E { ${kw} }\n1\n`;
const importBareLine = (kw: string): string => `import { ${kw} } from "./lib.thetalib"`;
const importBareSource = (kw: string): string => `${FM}${importBareLine(kw)}\n1\n`;
const importAliasSource = (kw: string): string =>
  `${FM}import { a as ${kw} } from "./lib.thetalib"\n1\n`;

// The 1-indexed column each position's name starts at, derived from the fixed
// prefix of the line above: `for ` is 4 characters, `par for ` is 8,
// `schema S { ` is 11, `  ` (the YAML indent) is 2, `enum E { ` is 9,
// `import { ` is 9, `import { a as ` is 14.
const FOR_COL = 5;
const PAR_FOR_COL = 9;
const SCHEMA_FIELD_COL = 12;
const PARAMS_KEY_COL = 3;
const ENUM_VARIANT_COL = 10;
const IMPORT_BARE_COL = 10;
const IMPORT_ALIAS_COL = 15;

// ===========================================================================
// (r) The registered row — the oracle every message and every d-row depends on.
// ===========================================================================

describe("0153 (r) — the registered row this file asserts against", () => {
  it("r1: the code is registered `E`, which is what makes its emission block registration", () => {
    // DIAG-2: the registry is closed, so the row's existence is the licence for
    // every firing row here. The *Sev* column is what ties the emission to the
    // registration refusal `blocksRegistration` mirrors — an `E` row is what
    // `hasLoadParseError` acts on.
    const row = REGISTRY.find((r) => r.code === RESERVED);
    expect(
      row,
      `DIAG-2: docs/spec_topics/diagnostics/code-registry-parse.md:21 must carry the row for ${RESERVED}`,
    ).toBeDefined();
    expect(
      (row as RegistryRow).severity,
      `${RESERVED} is no longer an E-severity row, so the registration refusal the d-rows assert no longer follows from the emission`,
    ).toBe("E");
    expect(
      (row as RegistryRow).message,
      "DIAG-4: the Message template carries the `<keyword>` slot the emission interpolates",
    ).toContain("<keyword>");
  });

  it("r2: the shipped reserved set is lexical.md:20's 32 spellings", () => {
    // The sweeps below are only a whole-list sweep if the list is whole. A
    // shrunken `reservedKeywords()` would silently sweep less, so its size and
    // three representative members are asserted here rather than assumed.
    expect(
      SPELLINGS.length,
      "src/lexer/lexer.ts:159–166 must carry lexical.md:20's 32 spellings",
    ).toBe(32);
    for (const spelling of ["let", "string", "Result"]) {
      expect(SPELLINGS, `lexical.md:20 lists \`${spelling}\``).toContain(spelling);
    }
    for (const contextual of ["par", "with", "subagent"]) {
      expect(
        SPELLINGS,
        `\`${contextual}\` is CONTEXTUAL and must stay outside the reserved set`,
      ).not.toContain(contextual);
    }
  });
});

// ===========================================================================
// (a) The defect — one firing row and its exact range at each of the six
//     positions.
// ===========================================================================

describe("0153 (a) — a reserved keyword at each of the six identifier positions is a parse error", () => {
  it("a1: `for string in xs { 1 }` reports one reserved-keyword-as-identifier ranged on the variable", () => {
    // Position 1. `ForStmt ::= "for" Ident "in" Expr StmtBlock`
    // (docs/reference/grammar.md:272). `parseFor` takes the variable with
    // `this.advance().text` and no kind test (src/parser/theta-document.ts:2341).
    // `string` is chosen because it is silent at this HEAD for the whole
    // adjacency reason and not a declarator head, so this row isolates the new
    // emission from the misfire the m-rows cover.
    //
    // Derivation: frontmatter lines 1–3, `let xs = [1]` line 4, the loop line 5.
    // `for ` is 4 characters, so `string` occupies columns 5–10 and spans 5→11
    // end-exclusive.
    const doc = theta("let xs = [1]\nfor string in xs { 1 }\n1\n");
    expect(
      lines(doc),
      "lexical.md:20 bars all 32 spellings from identifier position and code-registry-parse.md:21's Trigger names no position, so the `for` variable is inside it",
    ).toEqual([reservedAt("string", 5, FOR_COL)]);
  });

  it("a2: `par for string in xs { 1 }` reports it, ranged on the variable", () => {
    // Position 2. `ParForExpr ::= "par" "for" Ident "in" Expr MaxClause?
    // ParForBody` (docs/reference/grammar.md:273); `parseParFor` repeats
    // `parseFor`'s untested capture (src/parser/theta-document.ts:4722).
    // `par for ` is 8 characters, so `string` spans 9→15.
    const doc = theta("let xs = [1]\npar for string in xs { 1 }\n1\n");
    expect(
      lines(doc),
      "the `par for` variable is the same `Ident` terminal at a second parse site",
    ).toEqual([reservedAt("string", 5, PAR_FOR_COL)]);
  });

  it("a3: `schema S { let: string }` reports it, ranged on the field-name token", () => {
    // Position 3. "the field identifier" (docs/spec_topics/schemas.md:23).
    // `parseSchemaObjectBody` has the token, its `kind` and its `range` in hand
    // at src/parser/theta-document.ts:2909–2910 and admits `keyword` there. The
    // NAME slot has a token range, unlike the TYPE slot bug 0044 serves — which
    // is why row n3's whole-declaration range is not the range to copy here.
    // `schema S { ` is 11 characters, so `let` spans 12→15.
    const doc = theta("schema S { let: string }\n1\n");
    expect(
      lines(doc),
      "the schema field NAME is an identifier position; the TYPE slot beside it is bug 0044's and already fires",
    ).toEqual([reservedAt("let", 4, SCHEMA_FIELD_COL)]);
  });

  it("a4: a `params:` field named `let` reports it, ranged on the YAML key", () => {
    // Position 4 — the widest consequence and the only face that reaches the
    // wire (row L1). The name is a YAML scalar key
    // (src/parser/frontmatter.ts:749), so the predicate is string membership in
    // that module's `RESERVED_KEYWORDS` (`:478`, `= reservedKeywords()`) and the
    // range is `rangeOf(item.key, …)`, the shape bug 0149's
    // `binding-case-mismatch` emission in the SAME loop already uses. The code
    // is the registered `theta/parse/*` one: DIAG-2 closes the registry and
    // the `load` namespace carries no reserved-keyword row at all.
    //
    // Derivation: `---` line 1, `mode: prompt` line 2, `params:` line 3, the
    // field line 4. The two-space YAML indent puts `let` at columns 3–5,
    // spanning 3→6.
    const doc = parseDoc("---\nmode: prompt\nparams:\n  let: string\n---\n1\n");
    expect(
      lines(doc),
      "the `params:` key is an identifier position twice over (schemas.md, frontmatter-fields-a.md:57) and is the face that reaches the binder and the provider",
    ).toEqual([reservedAt("let", 4, PARAMS_KEY_COL)]);
  });

  it("a5: `enum E { let }` reports it, ranged on the variant token", () => {
    // Position 5. "Variant names are PascalCase identifiers"
    // (docs/spec_topics/schemas.md:78); `parseEnumVariants` admits a `keyword`
    // token at src/parser/theta-document.ts:3090. `enum E { ` is 9 characters,
    // so `let` spans 10→13.
    const doc = theta("enum E { let }\n1\n");
    expect(
      lines(doc),
      "the enum variant NAME is an identifier position",
    ).toEqual([reservedAt("let", 4, ENUM_VARIANT_COL)]);
  });

  it("a6: `import { let } from \"./lib.thetalib\"` reports it, ranged on the SOURCE name", () => {
    // Position 6, source slot. `ImportSpec ::= Ident ("as" Ident)?`
    // (docs/reference/grammar.md:36); `isSymbolToken`
    // (src/parser/theta-document.ts:3221–3222) admits `keyword`. This half is
    // semantically dead — no `.thetalib` can EXPORT a keyword-spelled symbol
    // (rows k2–k4 refuse the declarations) — but it is grammatically reachable
    // and binds. `import { ` is 9 characters, so `let` spans 10→13.
    const doc = theta('import { let } from "./lib.thetalib"\n1\n');
    expect(
      lines(doc),
      "the import specifier's SOURCE slot is an `Ident` terminal",
    ).toEqual([reservedAt("let", 4, IMPORT_BARE_COL)]);
  });

  it("a7: `import { a as let } from \"./lib.thetalib\"` reports it, ranged on the ALIAS", () => {
    // Position 6, alias slot — fully live: `a` is a legitimate export and the
    // local binding becomes `let` (row L8). The alias disjunction is
    // src/parser/theta-document.ts:3241–3242. `import { a as ` is 14
    // characters, so `let` spans 15→18.
    const doc = theta('import { a as let } from "./lib.thetalib"\n1\n');
    expect(
      lines(doc),
      "the import specifier's ALIAS slot is the second `Ident` of `ImportSpec`",
    ).toEqual([reservedAt("let", 4, IMPORT_ALIAS_COL)]);
  });

  it("a8: `export { a as let } from \"./lib.thetalib\"` reports it — one function, both statement kinds", () => {
    // `parseImportExport` (src/parser/theta-document.ts:3187) serves both
    // statement kinds through one specifier loop, so one emission covers both
    // and this row is what proves the `export` spelling is not a second site.
    const doc = theta('export { a as let } from "./lib.thetalib"\n1\n');
    expect(
      lines(doc),
      "`import` and `export … from` share one specifier loop and one emission",
    ).toEqual([reservedAt("let", 4, IMPORT_ALIAS_COL)]);
  });

  it("a9: `export { let } from \"./lib.thetalib\"` reports it at the SOURCE slot", () => {
    const doc = theta('export { let } from "./lib.thetalib"\n1\n');
    expect(
      lines(doc),
      "the `export` spelling's SOURCE slot is the same slot as a6's",
    ).toEqual([reservedAt("let", 4, IMPORT_BARE_COL)]);
  });
});

// ===========================================================================
// (c) The conformant control at each position — the anti-vacuity floor.
// ===========================================================================

describe("0153 (c) — the conformant spelling at each of the six positions stays silent", () => {
  // Without these rows every firing row above could be satisfied by a fix that
  // refuses the CONSTRUCT rather than the SPELLING.

  it("c1: `for s in xs { 1 }` reports nothing", () => {
    expect(lines(theta("let xs = [1]\nfor s in xs { 1 }\n1\n"))).toEqual([]);
  });

  it("c2: `par for s in xs { 1 }` reports nothing", () => {
    expect(lines(theta("let xs = [1]\npar for s in xs { 1 }\n1\n"))).toEqual([]);
  });

  it("c3: `schema S { f: string }` reports nothing", () => {
    expect(lines(theta("schema S { f: string }\n1\n"))).toEqual([]);
  });

  it("c4: a `params:` field named `f` reports nothing", () => {
    expect(
      lines(parseDoc("---\nmode: prompt\nparams:\n  f: string\n---\n1\n")),
    ).toEqual([]);
  });

  it("c5: `enum E { A }` reports nothing", () => {
    expect(lines(theta("enum E { A }\n1\n"))).toEqual([]);
  });

  it("c6: `import { a } from \"./lib.thetalib\"` reports nothing", () => {
    expect(lines(theta('import { a } from "./lib.thetalib"\n1\n'))).toEqual([]);
  });

  it("c7: `import { a as b } from \"./lib.thetalib\"` reports nothing", () => {
    expect(lines(theta('import { a as b } from "./lib.thetalib"\n1\n'))).toEqual([]);
  });
});

// ===========================================================================
// (k) The enforced positions — the code is live and must not move.
// ===========================================================================

describe("0153 (k) — the three lexer adjacencies and bug 0148's parameter position keep their behaviour", () => {
  // These four rows are green at this HEAD and stay green. They are what make a
  // red in group (a) attributable to the POSITION rather than to a dead code, a
  // broken registry read or a broken harness. Row k1 additionally REFUTES bug
  // 0153 §Fix (c) route (iii): narrowing the lexer's arms to require an
  // `ident`-kind `k+1` token would silence this row too.

  it("k1: `let let = 1` still reports it @4:5-4:8", () => {
    expect(lines(theta("let let = 1\n1\n"))).toEqual([reservedAt("let", 4, 5)]);
  });

  it("k2: `fn let(): number { 1 }` still reports it @4:4-4:7", () => {
    expect(lines(theta("fn let(): number { 1 }\n"))).toEqual([reservedAt("let", 4, 4)]);
  });

  it("k3: `schema let { a: string }` still reports it @4:8-4:11", () => {
    expect(lines(theta("schema let { a: string }\n1\n"))).toEqual([
      reservedAt("let", 4, 8),
    ]);
  });

  it("k4: `enum let { A }` still reports it @4:6-4:9", () => {
    expect(lines(theta("enum let { A }\n1\n"))).toEqual([reservedAt("let", 4, 6)]);
  });

  it("k5: bug 0148's `fn h(let: string)` still reports it @4:6-4:9, unmoved", () => {
    // bug 0153 §Non-goals: bug 0148's twelve a-rows and its `atParamStart`
    // guard keep their behaviour exactly; this is that fix's control row.
    expect(lines(theta("fn h(let: string): number { 1 }\n"))).toEqual([
      reservedAt("let", 4, 6),
    ]);
  });
});

// ===========================================================================
// (s) The whole 32-spelling sweep at each of the six positions.
// ===========================================================================

describe("0153 (s) — the whole reserved list at each position, partitioned explicitly", () => {
  // Each sweep is a whole-list ordered equality PER SPELLING over the unfiltered
  // diagnostics, asserted as one 32-key record so a partition that is right for
  // 31 spellings and wrong for one names the spelling in the diff. The
  // partitions are stated, not contained: which spellings draw the reserved
  // code ALONE, which draw it beside the pre-existing lexer diagnostic, and
  // which draw a different code entirely.

  it("s1: the `for` variable — 31 draw the code alone, `mut` draws its own code", () => {
    // RETAKEN by bug 0242 §Expected behaviour 1: the four declarator heads
    // (`let`, `fn`, `schema`, `enum`) no longer drag the grammar's own `in`
    // into the list, so the two-way partition is all that is left. `mut` is
    // consumed by `parseFor`'s modifier check BEFORE the name is read, so what
    // reaches the capture is a recovery artefact and the position keeps
    // `mut-on-immutable-context` alone (bug 0153 §Fix (e), untouched here; the
    // failure mode bug 0148's `atParamStart` guard prevents).
    expect(sweep(forSource)).toEqual(
      expectedSweep((kw) =>
        kw === "mut" ? [mutAt(5, FOR_COL)] : [reservedAt(kw, 5, FOR_COL)],
      ),
    );
  });

  it("s2: the `par for` variable — the same two-way partition, shifted four columns", () => {
    expect(sweep(parForSource)).toEqual(
      expectedSweep((kw) =>
        kw === "mut" ? [mutAt(5, PAR_FOR_COL)] : [reservedAt(kw, 5, PAR_FOR_COL)],
      ),
    );
  });

  it("s3: the schema field NAME — all 32 draw the code alone", () => {
    // RETAKEN by bug 0242 §Expected behaviour 3. The `controlHeads` scan used
    // to find no `{` after `fn` / `if` / `for` / `while` before the next
    // stmt-sep and push `theta/parse/single-line-if` on the SAME token range;
    // a field name has no body, so that row's *Trigger*
    // (docs/spec_topics/diagnostics/code-registry-parse.md:23) never held of
    // it. With the scan skipped at member name slots the position is uniform.
    expect(sweep(schemaFieldSource)).toEqual(
      expectedSweep((kw) => [reservedAt(kw, 4, SCHEMA_FIELD_COL)]),
    );
  });

  it("s4: the `params:` field NAME — all 32 draw the code alone", () => {
    // The position that was uniform from the start, because the name never
    // becomes a token: neither lexer scan can reach it, so nothing else can
    // fire. Bug 0149's case emission in the same loop excludes reserved
    // spellings explicitly (src/parser/frontmatter.ts:775,
    // `isIdentifierShaped(name) && !RESERVED_KEYWORDS.has(name)`), which is why
    // `Ok` / `Err` / `Result` draw THIS code here and not
    // `binding-case-mismatch`.
    expect(sweep(paramsSource)).toEqual(
      expectedSweep((kw) => [reservedAt(kw, 4, PARAMS_KEY_COL)]),
    );
  });

  it("s5: the `enum` variant NAME — all 32 draw the code alone", () => {
    // RETAKEN by bug 0242 §Expected behaviour 3, on the same ground as s3: a
    // variant name has no body either.
    expect(sweep(enumVariantSource)).toEqual(
      expectedSweep((kw) => [reservedAt(kw, 4, ENUM_VARIANT_COL)]),
    );
  });

  it("s6: the bare `import` specifier — 31 alone, `as` outside the position entirely", () => {
    // DRIFT from bug 0153's document, recorded rather than papered over: at
    // both import faces the spelling `as` now draws
    // `theta/parse/import-malformed-specifier-list` (bugs 0100 / 0211, fixed
    // since 0153 was filed), so this position's partition is 27 / 4 / 1 and not
    // the document's 28 / 4. `as` is excluded from `isSymbolToken`
    // (src/parser/theta-document.ts:3334, `t.text !== "as"`), so it never
    // occupies a NAME slot and neither fix may reach it — the malformed-list
    // verdict stays alone, ranged over the whole statement.
    expect(sweep(importBareSource)).toEqual(
      expectedSweep((kw) => {
        if (kw === "as") {
          return [
            at(
              IMPORT_MALFORMED,
              msg(IMPORT_MALFORMED, []),
              4,
              1,
              importBareLine("as").length + 1,
            ),
          ];
        }
        // RETAKEN by bug 0242 §Expected behaviour 3: an import specifier has no
        // body, so the four `controlHeads` spellings no longer draw
        // `theta/parse/single-line-if` ahead of the refusal.
        return [reservedAt(kw, 4, IMPORT_BARE_COL)];
      }),
    );
  });

  it("s7: the aliased `import` specifier — the same 31 / 1 partition at the alias slot", () => {
    expect(sweep(importAliasSource)).toEqual(
      expectedSweep((kw) => {
        if (kw === "as") {
          // `import { a as as }`: the `as` keyword is consumed with no
          // following `Ident` alias — shape (3) of the malformed row, ranged
          // over the specifier (`a` @4:10-4:11). No NAME slot is occupied.
          return [at(IMPORT_MALFORMED, msg(IMPORT_MALFORMED, []), 4, 10, 11)];
        }
        return [reservedAt(kw, 4, IMPORT_ALIAS_COL)];
      }),
    );
  });
});

// ===========================================================================
// (m) The former misfire faces — bug 0242 §Fix ROUTE A: the correct
//     diagnostic, alone.
// ===========================================================================

describe("0153 (m) — the wrong-subject faces report the name the author chose and nothing beside it", () => {
  it("m1: `for let in xs { 1 }` reports `let` at its own range, alone", () => {
    // The row bug 0148 pinned as `e14`, bug 0153 retook to a two-element list,
    // and bug 0242
    // (docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md)
    // retakes here. The parser-leaf diagnostic names the identifier the author
    // actually got wrong (`let` @5:5-5:8). The lexer's adjacency diagnostic
    // naming `in` @5:9-5:11 is gone: `in` is a `ForStmt` terminal
    // (docs/reference/grammar.md:272), not an identifier position, so
    // code-registry-parse.md:21's *Trigger* never held of it — and 0242 §Fix
    // ROUTE A teaches `contextualDiagnostics` (src/lexer/lexer.ts:810) to see
    // the for-iteration-variable slot and skip its arms there.
    expect(lines(theta("let xs = [1]\nfor let in xs { 1 }\n1\n"))).toEqual([
      reservedAt("let", 5, FOR_COL),
    ]);
  });

  it("m6: `par for let in xs { 1 }` reports the same single diagnostic, shifted", () => {
    expect(lines(theta("let xs = [1]\npar for let in xs { 1 }\n1\n"))).toEqual([
      reservedAt("let", 5, PAR_FOR_COL),
    ]);
  });

  it("m8: the braced-over-lines form reports the same single diagnostic", () => {
    // The face was the adjacency, not the single-line body scan: moving the
    // body onto its own lines changes nothing, before or after bug 0242.
    expect(lines(theta("let xs = [1]\nfor let in xs {\n1\n}\n1\n"))).toEqual([
      reservedAt("let", 5, FOR_COL),
    ]);
  });

  it("m9: `for mut let in xs { 1 }` reports mut, then `let` — exactly two", () => {
    // Two diagnostics ordered strictly by column, and the row that supplies
    // the ordering evidence for this whole group: a PARSER diagnostic (`mut`
    // @5:5-5:8) ahead of the refusal at the variable @5:9-5:12, which is
    // `assembleDiagnostics`'s positional sort
    // (src/diagnostics/diagnostic.ts:116–126) and not group order. Bug 0242
    // retakes it by dropping the lexer's `in` @5:13-5:15 alone; the `mut`
    // recovery is that report's §Non-goals and is unmoved. This is also the
    // row 0242's name-slot predicate needs its `mut` clause for — the variable
    // sits two tokens behind `for`, not one.
    expect(lines(theta("let xs = [1]\nfor mut let in xs { 1 }\n1\n"))).toEqual([
      mutAt(5, FOR_COL),
      reservedAt("let", 5, 9),
    ]);
  });

  it("m11: `for mut in xs { 1 }` keeps mut-on-immutable-context ALONE", () => {
    // §Fix (e), the binding constraint. `parseFor`'s modifier check consumes
    // `mut` before the name is read, so the token reaching the capture is the
    // recovery artefact `in` — a position no author wrote an identifier at. A
    // naive emission at src/parser/theta-document.ts:2341 fires on it and reds
    // here; that is exactly the failure mode bug 0148's `atParamStart` guard
    // exists to prevent, transposed to this site.
    expect(lines(theta("let xs = [1]\nfor mut in xs { 1 }\n1\n"))).toEqual([
      mutAt(5, FOR_COL),
    ]);
  });

  it("m12: `par for mut in xs { 1 }` keeps mut-on-immutable-context ALONE", () => {
    expect(lines(theta("let xs = [1]\npar for mut in xs { 1 }\n1\n"))).toEqual([
      mutAt(5, PAR_FOR_COL),
    ]);
  });

  it("m13: `for mut in in xs { 1 }` — a GENUINE variable spelled `in` behind `mut` still fires", () => {
    // m11's discriminating twin. Here the author DID write an iteration
    // variable and spelled it `in` (@5:9-5:11), with the grammar's own `in`
    // following at column 12. The artefact suppression keys on the FOLLOWING
    // token, not on the variable's spelling alone, so the reserved refusal
    // survives beside `mut-on-immutable-context` — a spelling-only guard
    // swallows it and reds here.
    expect(lines(theta("let xs = [1]\nfor mut in in xs { 1 }\n1\n"))).toEqual([
      mutAt(5, FOR_COL),
      reservedAt("in", 5, 9),
    ]);
  });

  it("m14: `par for mut in in xs { 1 }` — the same discriminating twin at the `par for` variable", () => {
    expect(lines(theta("let xs = [1]\npar for mut in in xs { 1 }\n1\n"))).toEqual([
      mutAt(5, PAR_FOR_COL),
      reservedAt("in", 5, 13),
    ]);
  });

  it("w1: `schema S { let as \"w\": string }` reports the field name alone", () => {
    // The second face, retaken by bug 0242 §Expected behaviour 2: the lexer's
    // `let` arm used to land on the `as` of a wire-rename
    // (docs/spec_topics/schemas.md:23), a keyword of the schema grammar rather
    // than a name anyone chose. The field-name refusal @4:12-4:15 stays.
    expect(lines(theta('schema S { let as "w": string }\n1\n'))).toEqual([
      reservedAt("let", 4, SCHEMA_FIELD_COL),
    ]);
  });

  it("w2: `import { let as x } from …` reports the SOURCE name alone", () => {
    // `as` is an `ImportSpec` terminal (docs/reference/grammar.md:36).
    expect(lines(theta('import { let as x } from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("let", 4, IMPORT_BARE_COL),
    ]);
  });

  it("w3: `export { let as x } from …` reports the same single diagnostic", () => {
    expect(lines(theta('export { let as x } from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("let", 4, IMPORT_BARE_COL),
    ]);
  });

  it("w4: `schema S { fn: string }` reports the field-name diagnostic alone", () => {
    // The third face, retaken by bug 0242 §Expected behaviour 3.
    // `theta/parse/single-line-if` came from a different scan (`controlHeads`,
    // src/lexer/lexer.ts:812) asking whether a `{` followed the head before the
    // next stmt-sep. A field name is not a header and has no body, so that
    // row's *Trigger* (code-registry-parse.md:23) did not hold of it and its
    // *Hint* — "Wrap the body in `{ ... }`" — named an edit the author could
    // not make. The scan is skipped at member name slots now.
    expect(lines(theta("schema S { fn: string }\n1\n"))).toEqual([
      reservedAt("fn", 4, SCHEMA_FIELD_COL),
    ]);
  });

  it("w5: `enum E { fn }` reports the variant-name diagnostic alone", () => {
    expect(lines(theta("enum E { fn }\n1\n"))).toEqual([
      reservedAt("fn", 4, ENUM_VARIANT_COL),
    ]);
  });

  it("w6: `import { fn } from …` reports the SOURCE-name diagnostic alone", () => {
    expect(lines(theta('import { fn } from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("fn", 4, IMPORT_BARE_COL),
    ]);
  });

  it("w7: `import { a as fn } from …` reports the ALIAS diagnostic alone", () => {
    expect(lines(theta('import { a as fn } from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("fn", 4, IMPORT_ALIAS_COL),
    ]);
  });
});

// ===========================================================================
// (x) The `.thetalib` route — lexical.md:3 applies every rule to both
//     extensions.
// ===========================================================================

describe("0153 (x) — a `.thetalib` is held to the same rule at the same positions", () => {
  // A `.thetalib` carries no frontmatter, so bodies start at line 1. Both
  // extensions reach the same `parseThetaDocument`, the same
  // `contextualDiagnostics` call and the same six parse sites, so the rule is
  // enforced at one set of sites and not two.

  it("x5: `schema S { let: string }` in a `.thetalib` reports it @1:12-1:15", () => {
    expect(lines(parseDoc("schema S { let: string }\n", "lib.thetalib"))).toEqual([
      reservedAt("let", 1, SCHEMA_FIELD_COL),
    ]);
  });

  it("x6: `enum E { let }` in a `.thetalib` reports it @1:10-1:13", () => {
    expect(lines(parseDoc("enum E { let }\n", "lib.thetalib"))).toEqual([
      reservedAt("let", 1, ENUM_VARIANT_COL),
    ]);
  });

  it("x7: a `.thetalib` bare import specifier named `let` reports it @1:10-1:13", () => {
    expect(
      lines(
        parseDoc(
          'import { let } from "./o.thetalib"\nfn a(): number { 1 }\n',
          "lib.thetalib",
        ),
      ),
    ).toEqual([reservedAt("let", 1, IMPORT_BARE_COL)]);
  });

  it("x8: a `.thetalib` aliased import binding named `let` reports it @1:15-1:18", () => {
    expect(
      lines(
        parseDoc(
          'import { a as let } from "./o.thetalib"\nfn b(): number { 1 }\n',
          "lib.thetalib",
        ),
      ),
    ).toEqual([reservedAt("let", 1, IMPORT_ALIAS_COL)]);
  });

  it("x9: a `for` variable named `string` inside a `.thetalib` fn reports it @3:5-3:11", () => {
    // A `.thetalib` top level admits declarations only, so the loop lives
    // inside a `fn`: line 1 `fn a(): number {`, line 2 `let xs = [1]`, line 3
    // the loop.
    expect(
      lines(
        parseDoc(
          "fn a(): number {\nlet xs = [1]\nfor string in xs { 1 }\n1\n}\n",
          "lib.thetalib",
        ),
      ),
    ).toEqual([reservedAt("string", 3, FOR_COL)]);
  });

  it("x10: the `.thetalib` `for let` face reports the variable alone", () => {
    // Retaken by bug 0242 on the same ground as row m1: lexical.md:3 applies
    // the rule to both extensions through one `contextualDiagnostics` call, so
    // one discrimination serves both. The `fn` header opens a BLOCK region and
    // the variable is still recognised at the for-iteration slot one region
    // down — the `.thetalib` route is the row that proves the region tracking
    // survives nesting.
    expect(
      lines(
        parseDoc(
          "fn a(): number {\nlet xs = [1]\nfor let in xs { 1 }\n1\n}\n",
          "lib.thetalib",
        ),
      ),
    ).toEqual([reservedAt("let", 3, FOR_COL)]);
  });

  it("x4: the conformant `.thetalib` control reports nothing", () => {
    expect(lines(parseDoc("fn a(): number { 1 }\n", "lib.thetalib"))).toEqual([]);
  });
});

// ===========================================================================
// (L) What the accepted keyword binds — measured at HEAD and UNCHANGED by the
//     fix.
// ===========================================================================

describe("0153 (L) — the AST and the lowered schema still carry the keyword verbatim", () => {
  // These rows are GREEN at this HEAD and stay green: the fix adds a
  // diagnostic, it does not change the AST or the lowering. They are recorded
  // because they are the harm the diagnostic exists to gate — the `params:`
  // face's property key reaches the binder and the provider — and because a fix
  // that "solved" the bug by dropping the field, renaming it, or bailing out of
  // the parse would red here rather than pass silently.

  it("L1: a `params:` field named `let` no longer reaches `doc.frontmatter` at all, once the fix lands", () => {
    // `ParsedFrontmatter` is documented as "present iff `registered` is true"
    // (src/parser/frontmatter.ts), and `registered` is unset by ANY
    // error-severity diagnostic `parseFrontmatter` collects while building it
    // — proven by the sibling `binding-case-mismatch` emission already living
    // in this SAME `extractParsedParams` loop (bug 0149), which nulls
    // `doc.frontmatter` today for e.g. a `params:` key `Topic`. The reserved-
    // keyword emission this fix adds sits in the identical loop under the
    // identical architecture, so `doc.frontmatter` (and therefore `.params`)
    // is `null` here too — not because the lowering broke, but because a
    // `theta/parse/*` error at ANY frontmatter position withholds the whole
    // defaulted frontmatter object, the same gate `theta/load/missing-mode`
    // uses. `hasLoadParseError` (production-composition.ts) still refuses
    // registration off `doc.diagnostics` directly (row d4), independently of
    // whether `doc.frontmatter` is populated — which is what keeps this row's
    // loss of the AST-shape assertion harmless to the registration guarantee
    // the bug exists to gate.
    const doc = parseDoc("---\nmode: prompt\nparams:\n  let: string\n---\n1\n");
    expect(
      doc.frontmatter,
      "an error-severity `theta/parse/*` diagnostic anywhere in `parseFrontmatter` withholds the whole defaulted frontmatter, matching bug 0149's sibling emission in the same loop",
    ).toBeNull();
  });

  it("L3: `for string in xs` still binds `variable: \"string\"` in the AST", () => {
    const doc = theta("let xs = [1]\nfor string in xs { 1 }\n1\n");
    const forStmt = doc.body.statements.find((s) => s.kind === "for");
    expect(forStmt, "the `for` statement must still be parsed").toBeDefined();
    expect((forStmt as { variable: string }).variable).toBe("string");
  });

  it("L5: `schema S { let: string }` still binds `fields[0].name === \"let\"`", () => {
    const doc = theta("schema S { let: string }\n1\n");
    const decl = doc.body.statements.find((s) => s.kind === "schema");
    expect(decl, "the `schema` declaration must still be parsed").toBeDefined();
    expect((decl as { fields: readonly { readonly name: string }[] }).fields.map((f) => f.name)).toEqual([
      "let",
    ]);
  });

  it("L6: `enum E { let }` still binds `variants: [\"let\"]`", () => {
    const doc = theta("enum E { let }\n1\n");
    const decl = doc.body.statements.find((s) => s.kind === "enum");
    expect(decl, "the `enum` declaration must still be parsed").toBeDefined();
    expect((decl as { variants: readonly string[] }).variants).toEqual(["let"]);
  });

  it("L7: `import { let }` still binds `symbols: [\"let\"]` and `specifiers[0].local === \"let\"`", () => {
    const doc = theta('import { let } from "./lib.thetalib"\n1\n');
    const decl = doc.body.statements.find((s) => s.kind === "import");
    expect(decl, "the `import` declaration must still be parsed").toBeDefined();
    expect((decl as { symbols: readonly string[] }).symbols).toEqual(["let"]);
    expect(
      (decl as { specifiers: readonly { readonly source: string; readonly local: string }[] }).specifiers.map(
        (s) => `${s.source}->${s.local}`,
      ),
    ).toEqual(["let->let"]);
  });

  it("L8: `import { a as let }` still binds the alias as the local", () => {
    const doc = theta('import { a as let } from "./lib.thetalib"\n1\n');
    const decl = doc.body.statements.find((s) => s.kind === "import");
    expect(decl, "the `import` declaration must still be parsed").toBeDefined();
    expect(
      (decl as { specifiers: readonly { readonly source: string; readonly local: string }[] }).specifiers.map(
        (s) => `${s.source}->${s.local}`,
      ),
    ).toEqual(["a->let"]);
  });
});

// ===========================================================================
// (d) The registration consequence.
// ===========================================================================

describe("0153 (d) — each of the six positions stops registering, and the conformant controls do not", () => {
  // The S1 cell: `hasLoadParseError`
  // (src/extension/production-composition.ts:2220, applied at `:2267`) drops a
  // theta carrying any error-severity `theta/load/*` or `theta/parse/*`
  // diagnostic, so the emission the a-rows require is exactly what stops the
  // spellings lexical.md:20 refuses from loading, registering and running.

  const broken: ReadonlyArray<readonly [string, ThetaDocument]> = [
    ["d1 the `for` variable", theta("let xs = [1]\nfor string in xs { 1 }\n1\n")],
    ["d2 the `par for` variable", theta("let xs = [1]\npar for string in xs { 1 }\n1\n")],
    ["d3 the schema field name", theta("schema S { let: string }\n1\n")],
    [
      "d4 the `params:` field name",
      parseDoc("---\nmode: prompt\nparams:\n  let: string\n---\n1\n"),
    ],
    ["d5 the enum variant name", theta("enum E { let }\n1\n")],
    ["d6 the bare import specifier", theta('import { let } from "./lib.thetalib"\n1\n')],
    [
      "d7 the aliased import specifier",
      theta('import { a as let } from "./lib.thetalib"\n1\n'),
    ],
  ];

  for (const [label, doc] of broken) {
    it(`${label} blocks registration`, () => {
      expect(
        blocksRegistration(doc.diagnostics),
        `a spelling the spec refuses must not register; diagnostics=${JSON.stringify(lines(doc))}`,
      ).toBe(true);
    });
  }

  const conformant: ReadonlyArray<readonly [string, ThetaDocument]> = [
    ["d8 the `for` control", theta("let xs = [1]\nfor s in xs { 1 }\n1\n")],
    ["d9 the schema control", theta("schema S { f: string }\n1\n")],
    [
      "d10 the `params:` control",
      parseDoc("---\nmode: prompt\nparams:\n  f: string\n---\n1\n"),
    ],
    ["d11 the enum control", theta("enum E { A }\n1\n")],
    ["d12 the import control", theta('import { a as b } from "./lib.thetalib"\n1\n')],
  ];

  for (const [label, doc] of conformant) {
    it(`${label} still registers`, () => {
      expect(
        blocksRegistration(doc.diagnostics),
        `a conformant declaration must keep registering; diagnostics=${JSON.stringify(lines(doc))}`,
      ).toBe(false);
    });
  }
});

// ===========================================================================
// (n) / (ck) The must-not-move rows — other reports' claims and the
//     contextual-keyword tripwire.
// ===========================================================================

describe("0153 (n) — the neighbouring claims stay exactly where they are", () => {
  it("n1: the `match` pattern binder keeps bug 0141's single emission", () => {
    // bug 0153 §Non-goals. DRIFT from the bug document, recorded: 0141's binder
    // FIRES at this HEAD (delivered in 0.146.0), where the document measured it
    // silent. Bug 0148's row `e7` already records that delivery. This row keeps
    // it at exactly ONE diagnostic — a second one, or a different range, would
    // mean a fix here reached `parsePattern`.
    const doc = theta("let v = 1\nlet r = match v { match => 1 }\nr\n");
    expect(
      lines(doc),
      "the pattern binder's refusal is bug 0141's, from `parsePattern`'s tail arm",
    ).toEqual([reservedAt("match", 5, 19)]);
  });

  it("n3: bug 0044's schema field TYPE emission stays at @4:1-4:20", () => {
    // §Fix (e): bug 0044's four emitters stay byte-unchanged. This range is the
    // WHOLE declaration because `SchemaFieldSource` carries no range of its
    // own — which is also why the NAME-slot emission row a3 requires the token
    // range and cannot be satisfied by widening this one.
    const doc = theta("schema X { f: let }\n1\n");
    expect(lines(doc), "bug 0044's type-position emission must not move").toEqual([
      at(RESERVED, reservedMsg("let"), 4, 1, 20),
    ]);
  });

  it("n4: bug 0044's `params:` TYPE emission stays at @4:6-4:9", () => {
    const doc = parseDoc("---\nmode: prompt\nparams:\n  x: let\n---\n1\n");
    expect(lines(doc), "bug 0044's `params:` type emission must not move").toEqual([
      reservedAt("let", 4, 6),
    ]);
  });
});

describe("0153 (ck) — the contextual keywords stay silent at all six positions", () => {
  // `par`, `with` and `subagent` are CONTEXTUAL: absent from
  // `reservedKeywords()` (src/lexer/lexer.ts:159–166), they lex as `ident` and
  // sit outside lexical.md:20's list by construction (row r2 asserts their
  // absence from the shipped set). A predicate reading `kind === "keyword"` or
  // that set keeps them silent for free; one minting a second list reds here.

  for (const contextual of ["par", "with", "subagent"]) {
    it(`ck: \`${contextual}\` reports nothing at any of the six positions`, () => {
      expect(lines(theta(`let xs = [1]\nfor ${contextual} in xs { 1 }\n1\n`))).toEqual([]);
      expect(
        lines(theta(`let xs = [1]\npar for ${contextual} in xs { 1 }\n1\n`)),
      ).toEqual([]);
      expect(lines(theta(`schema S { ${contextual}: string }\n1\n`))).toEqual([]);
      expect(
        lines(parseDoc(`---\nmode: prompt\nparams:\n  ${contextual}: string\n---\n1\n`)),
      ).toEqual([]);
      expect(lines(theta(`enum E { ${contextual} }\n1\n`))).toEqual([]);
      expect(lines(theta(`import { ${contextual} } from "./lib.thetalib"\n1\n`))).toEqual(
        [],
      );
      expect(
        lines(theta(`import { a as ${contextual} } from "./lib.thetalib"\n1\n`)),
      ).toEqual([]);
    });
  }
});
