import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { reservedKeywords } from "../src/lexer/lexer";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0242 — three lexer-side faces of `contextualDiagnostics` range a
// diagnostic on a token the author wrote correctly
// (docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md).
//
// THE DEFECT, one cause and three faces. `contextualDiagnostics`
// (`src/lexer/lexer.ts`, symbol form per docs/STYLE.md §Citations and bug
// 0134's do-not-chase adjudication for line drift)
// judges identifier positions by token adjacency over a FLAT token list with
// one piece of context — a backtick toggle suppressing query-template bodies.
// Its four scans live in one walk:
//   - the three declarator arms, each calling the local `checkName` on the
//     token at `k+1`: after `let` past the `mut` skip, after `fn`, and after
//     `schema` / `enum` (the keyword arm);
//   - the `controlHeads` scan (the set `if` / `for` / `while` / `fn`),
//     which walks forward for a `{` before the next `stmt-sep` and otherwise
//     pushes `theta/parse/single-line-if` ranged on the HEAD token itself.
// Each of those eight words is also one of the 32 spellings
// docs/spec_topics/lexical.md:20 reserves, so a source that puts one of them
// in a NAME slot — a `for` / `par for` iteration variable, a schema field
// name, an enum variant name, an import/export specifier — puts a scan head
// where a name belongs. Three misfires follow:
//   (A) the `in` FACE: `for let in xs { 1 }` has `k` = `let` and `k+1` = the
//       grammar's own `in` (`ForStmt ::= "for" Ident "in" Expr StmtBlock`,
//       docs/reference/grammar.md:272), so the arm reports `in` "cannot be
//       used as an identifier";
//   (B) the `as` FACE: `schema S { let as "w": string }` and
//       `import { let as x }` put `k+1` on the wire-rename / alias keyword
//       `as` (docs/spec_topics/schemas.md:23, grammar.md:36–37);
//   (C) the `single-line-if` FACE: a field name, a variant name or an import
//       specifier spelled `fn` / `if` / `for` / `while` has no `{` after it on
//       its logical line, so the `controlHeads` scan pushes
//       `theta/parse/single-line-if` — "single-line body not permitted; wrap
//       in { ... }", with the registered *Hint* "Wrap the body in `{ ... }`"
//       (docs/spec_topics/diagnostics/code-registry-parse.md:23) — at a
//       position that has no body at all.
//
// WHAT THIS FILE ASSERTS — the bug's §Expected behaviour, not HEAD's output.
// Every row below states the post-fix list. At HEAD each (A) / (B) row carries
// one extra `theta/parse/reserved-keyword-as-identifier` naming `in` or `as`,
// and each (C) row carries a leading `theta/parse/single-line-if`; those are
// the entries this file requires to be GONE. The correct refusal each misfire
// accompanies — bug 0153's six parser-leaf emissions, landed in 0.194.0 — is
// asserted unchanged, at the same code, subject and range it carries today, so
// a "fix" that suppresses the correct diagnostic too reds here.
//
// THE ROUTE THE ROWS ARE WRITTEN AGAINST — §Fix ROUTE A, contextual
// discrimination inside `contextualDiagnostics`. Two discriminators: a
// brace-region classifier (a `{` opens a MEMBER region when it completes a
// NAME-bearing production head — a statement-opening keyword `import` /
// `export` immediately before it, or keyword `schema` / `enum` two back with
// the declared `ident` NAME between; every other `{` opens a block region,
// including one whose neighbourhood merely contains one of those words in
// another position — see groups (S) and (N)) and a name-slot predicate (inside a
// MEMBER region a keyword whose previous token is `{`, `,`, a stmt-sep or
// keyword `as` is at a member NAME slot; inside a BLOCK region a keyword whose
// previous token is keyword `for`, or keyword `mut` behind keyword `for`, is
// at the for-iteration-variable slot). At a name slot BOTH the declarator arms
// and the `controlHeads` scan are skipped. A member's TYPE position is NOT a
// name slot, which is what keeps bug 0044's TYPE-slot witness
// (tests/reserved-keyword-type-position.test.ts) green.
//
// WHAT MUST NOT MOVE, pinned here as explicit cells because they are the
// anti-over-reach tripwires (§Fix constraint 4). A suppression wide enough to
// swallow any of these is wrong, and must fail loudly rather than read as a
// cleaner diagnostic list:
//   - group (G): the GENUINE subjects of `theta/parse/single-line-if` —
//     `if (x) 1`, `for x in xs 1`, `while (x) 1`, `fn f(): number 1` — each
//     keeping that code (with the type layer's `non-boolean-condition` beside
//     it where it already fires today);
//   - group (R): reserved spellings at GENUINE declarator-name positions,
//     which are exactly the positions the three arms exist for —
//     `let in = 1`, `let as = 1`, `let mut in = 1`, `fn in(): number {…}`,
//     `schema in {…}`, `enum as {…}`, and the inline-block form
//     `fn g(): number { let in = 1 }` (a BLOCK region opened after a `:`-typed
//     `fn` header, not a member region); the case rules bugs 0051 / 0135 share
//     this function with (`let Foo = 1`, `schema s {…}`); and `let fn = 1`,
//     which draws BOTH its reserved refusal and a pre-existing
//     `single-line-if` at the same range — a shape this report does NOT claim
//     and which must not move either.
//
// WITNESS FORM (§Fix constraint 5). Every assertion is an ORDERED WHOLE-LIST
// `toEqual` over the UNFILTERED `doc.diagnostics`, rendered
// `severity code @l:c-l:c: message`, so neither an extra diagnostic, nor one
// at the wrong range, nor one naming the wrong keyword can hide inside a
// containment check — which is the whole point here, since every face's defect
// IS an extra diagnostic. DIAG-4
// (docs/spec_topics/diagnostics/diagnostic-shape.md:74): no asserted message
// string is written out; each is READ from the registry's *Message* column
// through `parseRegistry` / `registryMessage` (tools/code-registry/index.js),
// with the `<keyword>` / `<type>` / `<X>` slot filled after its presence is
// asserted. DIAG-2 (`:72`) is NOT engaged: no code is added, removed,
// re-namespaced or re-triggered (§Fix constraint 3) — the fix makes two
// existing emissions match the two *Trigger* columns that already exist.
//
// ANTI-VACUITY. The nine 32-spelling sweeps of group (E) assert 288 whole
// ordered lists, of which 285 are non-empty and none is empty-by-default, so a
// harness that stopped reaching the lexer or the parser cannot turn any
// assertion here into a silent pass. The ten legal controls of group (D) are
// the other floor: they are `[]` at HEAD and must stay `[]`, so a fix that
// "removed the misfire" by refusing fewer constructs, or by refusing more,
// reds. Groups (G) and (R) are green at HEAD and must stay green.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts:39) — the misfiring diagnostics are pushed by the
// lexer before any session, host or model exists, so an integration tier would
// add a round-trip to a parse-time value and buy no reach, and a live tier
// would make a fully determined value stochastic. The one thing this tier
// cannot reach is the composition root's registration decision; the standalone
// live cell
// (tests/live/reserved-keyword-misfire-faces-live-cell.test.ts) drives that
// end to end.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. The registry lookups assert their row's presence and
// their template's placeholders before either is used, and the spelling list
// is read from the shipped `reservedKeywords()` (src/lexer/lexer.ts:159) with
// its size asserted, so a shrunken set reds rather than quietly sweeping less.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* and *Sev* columns (DIAG-4).
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
const SINGLE_LINE_IF = "theta/parse/single-line-if";
const MUT_IMMUTABLE = "theta/parse/mut-on-immutable-context";
const IMPORT_MALFORMED = "theta/parse/import-malformed-specifier-list";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const SCHEMA_CASE = "theta/parse/schema-case-mismatch";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const EMPTY_SCHEMA = "theta/parse/empty-schema-body";
const NON_BOOLEAN = "theta/parse/non-boolean-condition";
const MATCH_ARM_MISMATCH = "theta/parse/match-arm-type-mismatch";
const LET_NO_INITIALISER = "theta/parse/let-without-initialiser";
const IMPORT_NO_FROM = "theta/parse/import-missing-from-clause";
const UNSUPPORTED = "theta/parse/unsupported-feature";
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";
const UNRESOLVED_TYPE = "theta/parse/unresolved-named-type";
const BARE_OBJECT = "theta/parse/bare-object-literal";
const MALFORMED_FIELD = "theta/parse/malformed-schema-field";
const EXTRA_FIELD = "theta/parse/extra-object-field";

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled. Definedness and placeholder presence are asserted first, so a missing
 * row or a reworded template reds by naming the registry rather than by a bare
 * `undefined` comparison.
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
 * over the UNFILTERED list — the assertion vocabulary of the whole file.
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
 * One rendered `error`-severity diagnostic line whose range spans more than one
 * line — the declaration-ranged refusal bug 0249's identifier pass emits
 * (`site.range`) when the enclosing declaration itself is multiline (N3).
 */
function atRange(
  code: string,
  message: string,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): string {
  return `error ${code} @${startLine}:${startColumn}-${endLine}:${endColumn}: ${message}`;
}

/**
 * The reserved refusal ranged on the offending NAME itself: one-token names are
 * ASCII here, so the end column is `column + keyword.length` (1-indexed,
 * end-exclusive, per lexical.md §"Diagnostic spans").
 */
function reservedAt(keyword: string, line: number, column: number): string {
  return at(RESERVED, reservedMsg(keyword), line, column, column + keyword.length);
}

/** The `controlHeads` scan's verdict, ranged on the head token. */
function singleLineIfAt(head: string, line: number, column: number): string {
  return at(SINGLE_LINE_IF, msg(SINGLE_LINE_IF, []), line, column, column + head.length);
}

/** `parseFor` / `parseParFor`'s own modifier verdict, ranged on `mut`. */
function mutAt(line: number, column: number): string {
  return at(MUT_IMMUTABLE, msg(MUT_IMMUTABLE, []), line, column, column + "mut".length);
}

/**
 * Whether `diagnostics` blocks registration. This replicates, by construction,
 * `hasLoadParseError` (src/extension/production-composition.ts) as applied
 * inside `parseDiscoveredTheta` in that file: it is module-private — `rg -n
 * 'export.*hasLoadParseError' src/` matches nothing — so it cannot be imported,
 * and the predicate is mirrored here the same way and for the same reason
 * tests/reserved-keyword-remaining-identifier-positions.test.ts and
 * tests/fn-param-name-reserved-keyword.test.ts mirror it.
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
// The spelling list and the two lexer sub-sets the partition is stated over.
// ===========================================================================

/**
 * lexical.md:20's 32 spellings, read from the shipped set (`reservedKeywords()`,
 * src/lexer/lexer.ts:159) rather than copied, so the sweeps cannot drift from
 * the set the fix's own predicates read.
 */
const SPELLINGS: readonly string[] = [...reservedKeywords()];

/** The 1-indexed column each shape's name starts at, from its fixed prefix. */
const FOR_COL = 5; // `for `
const PAR_FOR_COL = 9; // `par for `
const SCHEMA_FIELD_COL = 12; // `schema S { `
const PARAMS_KEY_COL = 3; // the two-space YAML indent
const ENUM_VARIANT_COL = 10; // `enum E { `
const IMPORT_BARE_COL = 10; // `import { `
const IMPORT_ALIAS_COL = 15; // `import { a as `

// The nine source shapes of §Reproduction (E). Body line numbers: the `.theta`
// frontmatter occupies lines 1–3, so a one-line body sits on line 4 and a body
// preceded by `let xs = [1]` sits on line 5.
const forSource = (kw: string): string =>
  `${FM}let xs = [1]\nfor ${kw} in xs { 1 }\n1\n`;
const parForSource = (kw: string): string =>
  `${FM}let xs = [1]\npar for ${kw} in xs { 1 }\n1\n`;
const schemaFieldSource = (kw: string): string => `${FM}schema S { ${kw}: string }\n1\n`;
const enumVariantSource = (kw: string): string => `${FM}enum E { ${kw} }\n1\n`;
const importBareLine = (kw: string): string => `import { ${kw} } from "./lib.thetalib"`;
const importBareSource = (kw: string): string => `${FM}${importBareLine(kw)}\n1\n`;
const importAliasSource = (kw: string): string =>
  `${FM}import { a as ${kw} } from "./lib.thetalib"\n1\n`;
const wireRenameSource = (kw: string): string =>
  `${FM}schema S { ${kw} as "w": string }\n1\n`;
const importNameAliasLine = (kw: string): string =>
  `import { ${kw} as x } from "./lib.thetalib"`;
const importNameAliasSource = (kw: string): string =>
  `${FM}${importNameAliasLine(kw)}\n1\n`;
const paramsSource = (kw: string): string =>
  `---\nmode: prompt\nparams:\n  ${kw}: string\n---\n1\n`;

/** Run one shape's whole 32-spelling sweep into `spelling -> rendered list`. */
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

// ===========================================================================
// (r) The registered rows the whole file reads its oracle from.
// ===========================================================================

describe("0242 (r) — the two registered rows whose emissions must match them", () => {
  it("r1: both codes are registered `E` and carry the templates this file fills", () => {
    // DIAG-2: the registry is closed and this fix adds nothing to it (§Fix
    // constraint 3). Both rows exist today; the defect is that two emissions
    // fire outside the *Trigger* columns those rows already state.
    for (const code of [RESERVED, SINGLE_LINE_IF]) {
      const row = REGISTRY.find((r) => r.code === code);
      expect(
        row,
        `DIAG-2: docs/spec_topics/diagnostics/code-registry-parse.md must carry the row for ${code}`,
      ).toBeDefined();
      expect(
        (row as RegistryRow).severity,
        `${code} is no longer an E-severity row, so the registration consequence group (d) asserts no longer follows`,
      ).toBe("E");
    }
    expect(
      (REGISTRY.find((r) => r.code === RESERVED) as RegistryRow).message,
      "DIAG-4: the reserved row's Message template carries the `<keyword>` slot the emission interpolates",
    ).toContain("<keyword>");
  });

  it("r2: the shipped reserved set is lexical.md:20's 32 spellings", () => {
    expect(
      SPELLINGS.length,
      "src/lexer/lexer.ts:159 must carry lexical.md:20's 32 spellings, or the (E) sweeps below silently sweep less",
    ).toBe(32);
    for (const spelling of ["let", "fn", "schema", "enum", "in", "as"]) {
      expect(
        SPELLINGS,
        `lexical.md:20 lists \`${spelling}\`, one of the words this bug's faces turn on`,
      ).toContain(spelling);
    }
  });
});

// ===========================================================================
// (A) The `in` face — the `for` and `par for` iteration variable.
// ===========================================================================

describe("0242 (A) — a `for` variable spelled with a declarator head reports the variable alone", () => {
  // §Expected behaviour 1. `in` is a `ForStmt` terminal
  // (docs/reference/grammar.md:272), not an identifier position, so
  // code-registry-parse.md:21's *Trigger* — "Reserved keyword used in an
  // identifier position" — does not hold of it. The correct refusal against the
  // VARIABLE is bug 0153's `parseFor` emission
  // (src/parser/theta-document.ts:2380, emission `:2422`) and stays exactly
  // where it is.

  it("A1: `for let in xs { 1 }` reports `let` @5:5-5:8 and nothing else", () => {
    expect(
      lines(theta("let xs = [1]\nfor let in xs { 1 }\n1\n")),
      "the grammar's own `in` is not an identifier position; only the variable the author misspelled is",
    ).toEqual([reservedAt("let", 5, FOR_COL)]);
  });

  it("A2: `for fn in xs { 1 }` reports `fn` @5:5-5:7 and nothing else", () => {
    expect(lines(theta("let xs = [1]\nfor fn in xs { 1 }\n1\n"))).toEqual([
      reservedAt("fn", 5, FOR_COL),
    ]);
  });

  it("A3: `for schema in xs { 1 }` reports `schema` @5:5-5:11 and nothing else", () => {
    expect(lines(theta("let xs = [1]\nfor schema in xs { 1 }\n1\n"))).toEqual([
      reservedAt("schema", 5, FOR_COL),
    ]);
  });

  it("A4: `for enum in xs { 1 }` reports `enum` @5:5-5:9 and nothing else", () => {
    expect(lines(theta("let xs = [1]\nfor enum in xs { 1 }\n1\n"))).toEqual([
      reservedAt("enum", 5, FOR_COL),
    ]);
  });

  it("A5: `par for let in xs { 1 }` reports `let` @5:9-5:12 and nothing else", () => {
    // The second iteration-variable site, `parseParFor`
    // (src/parser/theta-document.ts:4902, emission `:4932`). One lexer walk
    // serves both spellings, so one discrimination must serve both.
    expect(lines(theta("let xs = [1]\npar for let in xs { 1 }\n1\n"))).toEqual([
      reservedAt("let", 5, PAR_FOR_COL),
    ]);
  });

  it("A6: the braced-over-lines form reports `let` @5:5-5:8 and nothing else", () => {
    // The misfire is the ADJACENCY, not the single-line-body scan: moving the
    // body onto its own lines must change neither diagnostic.
    expect(lines(theta("let xs = [1]\nfor let in xs {\n1\n}\n1\n"))).toEqual([
      reservedAt("let", 5, FOR_COL),
    ]);
  });

  it("A7: `for mut let in xs { 1 }` reports `mut`, then `let` — exactly two", () => {
    // The `mut` recovery is bug 0153's discriminator and this report's
    // §Non-goals: `mut-on-immutable-context` @5:5-5:8 stays, and the reserved
    // refusal names the variable @5:9-5:12. Only the lexer's `in` leaves. This
    // is also the row the name-slot predicate's `mut` clause exists for — the
    // variable sits at `k-2` from `for`, not `k-1`.
    expect(lines(theta("let xs = [1]\nfor mut let in xs { 1 }\n1\n"))).toEqual([
      mutAt(5, FOR_COL),
      reservedAt("let", 5, 9),
    ]);
  });

  it("A8: the `.thetalib` route reports `let` @3:5-3:8 and nothing else", () => {
    // lexical.md:3 applies every rule on that page to `.theta` and `.thetalib`
    // alike, and both extensions reach the same `contextualDiagnostics` call. A
    // `.thetalib` carries no frontmatter and admits declarations only, so the
    // loop lives inside a `fn`: line 1 the header, line 2 `let xs = [1]`,
    // line 3 the loop. The `fn` header opens a BLOCK region, so the variable is
    // still recognised at the for-iteration slot one region down.
    expect(
      lines(
        parseDoc(
          "fn a(): number {\nlet xs = [1]\nfor let in xs { 1 }\n1\n}\n",
          "lib.thetalib",
        ),
      ),
    ).toEqual([reservedAt("let", 3, FOR_COL)]);
  });

  it("A9: `for match in xs { 1 }` is unchanged — one diagnostic", () => {
    // The mechanism isolators. `match` is reserved but is NOT a declarator
    // head, so no arm ever read past it and this row is one diagnostic at HEAD
    // and one after. It is what makes a red in A1–A8 attributable to the
    // suppression rather than to a dead emission.
    expect(lines(theta("let xs = [1]\nfor match in xs { 1 }\n1\n"))).toEqual([
      reservedAt("match", 5, FOR_COL),
    ]);
  });

  it("A10: `for return in xs { 1 }` is unchanged — one diagnostic", () => {
    expect(lines(theta("let xs = [1]\nfor return in xs { 1 }\n1\n"))).toEqual([
      reservedAt("return", 5, FOR_COL),
    ]);
  });

  it("A11: `for let xs { 1 }` (no `in`) is unchanged — one diagnostic", () => {
    // The other half of the isolation: a declarator head in the variable slot
    // with no `in` at `k+1` never misfired, and must keep its single refusal.
    expect(lines(theta("let xs = [1]\nfor let xs { 1 }\n1\n"))).toEqual([
      reservedAt("let", 5, FOR_COL),
    ]);
  });
});

// ===========================================================================
// (B) The `as` face — a wire-rename and an import/export alias clause.
// ===========================================================================

describe("0242 (B) — a member name spelled with a declarator head reports the name alone", () => {
  // §Expected behaviour 2. `as` is an `ImportSpec` / `ExportSpec` terminal
  // (docs/reference/grammar.md:36–37) and the wire-rename keyword
  // (docs/spec_topics/schemas.md:23). The correct refusals are bug 0153's
  // `parseSchemaObjectBody` (src/parser/theta-document.ts:2975, emission
  // `:3061`) and `parseImportExport` (`:3299`, SOURCE emission `:3352`).

  it("B1: `schema S { let as \"w\": string }` reports `let` @4:12-4:15 alone", () => {
    expect(
      lines(theta('schema S { let as "w": string }\n1\n')),
      "the wire-rename `as` is the schema grammar's own keyword, not a name the author chose",
    ).toEqual([reservedAt("let", 4, SCHEMA_FIELD_COL)]);
  });

  it("B2: `import { let as x } from …` reports `let` @4:10-4:13 alone", () => {
    expect(lines(theta('import { let as x } from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("let", 4, IMPORT_BARE_COL),
    ]);
  });

  it("B3: `export { let as x } from …` reports `let` @4:10-4:13 alone", () => {
    // One specifier loop serves both statement kinds, so one region rule must
    // classify both `import {` and `export {` as member regions.
    expect(lines(theta('export { let as x } from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("let", 4, IMPORT_BARE_COL),
    ]);
  });

  it("B4: `schema S { schema as \"w\": string }` reports `schema` @4:12-4:18 alone", () => {
    // The `schema` / `enum` arm's own face: the head is the field name itself.
    expect(lines(theta('schema S { schema as "w": string }\n1\n'))).toEqual([
      reservedAt("schema", 4, SCHEMA_FIELD_COL),
    ]);
  });

  it("B5: `import { fn as x } from …` — both faces at once — reports `fn` @4:10-4:12 alone", () => {
    // The compound row: at HEAD this is THREE diagnostics — the `controlHeads`
    // scan's `single-line-if`, the correct refusal, and the `as` misfire. One
    // name-slot verdict removes both misfires, because the arms and the scan
    // are skipped by the same predicate.
    expect(lines(theta('import { fn as x } from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("fn", 4, IMPORT_BARE_COL),
    ]);
  });

  it("B6: `import { a, let as x } from …` reports `let` @4:13-4:16 alone", () => {
    // Beyond the bug document's rows, and the one that exercises the `,`
    // clause of the name-slot predicate rather than the opening `{`: the
    // second specifier's name sits behind a comma. At HEAD it draws the `as`
    // misfire too.
    expect(lines(theta('import { a, let as x } from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("let", 4, 13),
    ]);
  });
});

// ===========================================================================
// (C) The `single-line-if` face — a name that happens to be in `controlHeads`.
// ===========================================================================

describe("0242 (C) — a member name in `controlHeads` draws no single-line-body verdict", () => {
  // §Expected behaviour 3, the S2 face. `theta/parse/single-line-if`'s *Trigger*
  // is "`if` / `for` / `while` / `fn` body is not a braced block"
  // (docs/spec_topics/diagnostics/code-registry-parse.md:23) and its *Hint* is
  // "Wrap the body in `{ ... }`". A field name, a variant name and an import
  // specifier have no body, so the row does not hold of them and the hint names
  // an edit the author cannot make. Both diagnostics carry the IDENTICAL range
  // at HEAD, so the author cannot even tell them apart by location.

  it("C1: `schema S { fn: string }` reports `fn` @4:12-4:14 and no single-line-if", () => {
    expect(
      lines(theta("schema S { fn: string }\n1\n")),
      "a schema field name has no body; the single-line-body row's Trigger cannot hold of it",
    ).toEqual([reservedAt("fn", 4, SCHEMA_FIELD_COL)]);
  });

  it("C2: `schema S { if: string }` reports `if` @4:12-4:14 and no single-line-if", () => {
    expect(lines(theta("schema S { if: string }\n1\n"))).toEqual([
      reservedAt("if", 4, SCHEMA_FIELD_COL),
    ]);
  });

  it("C3: `schema S { for: string }` reports `for` @4:12-4:15 and no single-line-if", () => {
    expect(lines(theta("schema S { for: string }\n1\n"))).toEqual([
      reservedAt("for", 4, SCHEMA_FIELD_COL),
    ]);
  });

  it("C4: `schema S { while: string }` reports `while` @4:12-4:17 and no single-line-if", () => {
    expect(lines(theta("schema S { while: string }\n1\n"))).toEqual([
      reservedAt("while", 4, SCHEMA_FIELD_COL),
    ]);
  });

  it("C5: `enum E { fn }` reports `fn` @4:10-4:12 and no single-line-if", () => {
    // `parseEnumVariants` (src/parser/theta-document.ts:3149, emission `:3200`).
    expect(lines(theta("enum E { fn }\n1\n"))).toEqual([
      reservedAt("fn", 4, ENUM_VARIANT_COL),
    ]);
  });

  it("C6: `import { fn } from …` reports `fn` @4:10-4:12 and no single-line-if", () => {
    expect(lines(theta('import { fn } from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("fn", 4, IMPORT_BARE_COL),
    ]);
  });

  it("C7: `import { a as fn } from …` reports `fn` @4:15-4:17 and no single-line-if", () => {
    // The ALIAS slot (src/parser/theta-document.ts:3377): the name-slot
    // predicate's `as` clause is what reaches it.
    expect(lines(theta('import { a as fn } from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("fn", 4, IMPORT_ALIAS_COL),
    ]);
  });

  it("C8: `schema S { let: string }` is unchanged — one diagnostic", () => {
    // The contrast row: `let` is not in `controlHeads`, so this shape never
    // drew the third face and must keep its single refusal.
    expect(lines(theta("schema S { let: string }\n1\n"))).toEqual([
      reservedAt("let", 4, SCHEMA_FIELD_COL),
    ]);
  });
});

// ===========================================================================
// (D) The legal-input controls — no conformant source draws any of the three.
// ===========================================================================

describe("0242 (D) — every legal shape keeps the empty diagnostic list it has today", () => {
  // §Expected behaviour 4 and the anti-over-reach floor in the other direction:
  // a discrimination that mis-classified a region would start refusing, or stop
  // refusing, something here.

  const empty: ReadonlyArray<readonly [string, string]> = [
    ["D1 the `for` loop", "let xs = [1]\nfor x in xs { 1 }\n1\n"],
    ["D2 the `par for` expression", "let ys = [1]\nlet r = par for y in ys max 2 { 1 }\n1\n"],
    ["D3 the wire rename", 'schema S { a as "w": string }\n1\n'],
    // A reserved spelling as a WIRE name is legal: it is a string, not an
    // identifier, so no rule reaches it.
    ["D4 the reserved WIRE name", 'schema S { a as "let": string }\n1\n'],
    ["D5 the schema field", "schema S { a: string }\n1\n"],
    ["D6 the bare import", 'import { a } from "./lib.thetalib"\n1\n'],
    ["D7 the two aliased imports", 'import { a as b, c as d } from "./lib.thetalib"\n1\n'],
    ["D8 the braced `fn` body", "fn g(): number { 1 }\n1\n"],
    ["D9 the enum body", "enum E { A, B }\n1\n"],
    ["D10 the generic type", "let x: array<string> = []\n1\n"],
  ];

  for (const [label, body] of empty) {
    it(`${label} reports nothing`, () => {
      expect(
        lines(theta(body)),
        "a legal input must draw none of the three faces, before or after the fix",
      ).toEqual([]);
    });
  }

  it("D11: `schema S { \"fn\": string }` keeps `empty-schema-body` alone", () => {
    // The quoted key is not a field, so no name slot exists and no misfire
    // attaches — at HEAD or after. The range is the whole declaration.
    expect(lines(theta('schema S { "fn": string }\n1\n'))).toEqual([
      at(EMPTY_SCHEMA, msg(EMPTY_SCHEMA, [["<X>", "S"]]), 4, 1, 26),
    ]);
  });
});

// ===========================================================================
// (N) The nested inline object type — an unchanged, deliberately off-Trigger
//     emission the region classifier must not reach.
// ===========================================================================

describe("0242 (N) — a field key inside a nested inline object type now draws the parser-leaf refusal (bug 0249)", () => {
  // RETAKEN under bug 0249 §Fix constraint 1's amended enumeration: N1-N5 were
  // pinned to the off-Trigger `single-line-if` emission because no parser leaf
  // refused a reserved key of an inline object type. Edit 1
  // (src/parser/type-grammar.ts, the bug-0154 identifier pass) now pushes
  // `theta/parse/reserved-keyword-as-identifier` there instead of a bare
  // `continue`, ranged on the pass's `site.range` — the enclosing declaration's
  // span, since a `TypeNode` carries no range of its own (the same divergence
  // `theta/parse/schema-type-not-expression` states). Edit 3
  // (src/lexer/lexer.ts `isNameSlot`) makes the field-key position a name slot
  // when the next token is `:`, which is what withdraws `single-line-if`: the
  // parser leaf is now the whole refusal, so the lexer no longer needs to draw
  // a second, wrongly-Triggered one beside it.
  //
  // Mechanically: an inline object type opens after a `:`, so its `{` is
  // classified from its own antecedent as a BLOCK region even when the
  // enclosing region is a member region; edit 3's name-slot predicate now
  // reaches a colon-followed key there at every depth.

  it("N1: `schema S { p: { fn: string } }` now reports the declaration-ranged refusal alone", () => {
    expect(
      lines(theta("schema S { p: { fn: string } }\n1\n")),
      "the bug-0154 identifier pass now refuses the reserved key itself, so single-line-if no longer needs to stand in for it",
    ).toEqual([at(RESERVED, reservedMsg("fn"), 4, 1, 31)]);
  });

  it("N2: `schema S { p: { if: string } }` now reports the declaration-ranged refusal alone", () => {
    expect(lines(theta("schema S { p: { if: string } }\n1\n"))).toEqual([
      at(RESERVED, reservedMsg("if"), 4, 1, 31),
    ]);
  });

  it("N3: the multiline nested form now reports the declaration-ranged refusal alone", () => {
    // The nested `{` and the key sit on different logical lines; the refusal's
    // range is the whole enclosing declaration (`site.range`), which spans every
    // line of the source, not the key token's own line.
    expect(lines(theta("schema S { p: {\nfn: string\n} }\n1\n"))).toEqual([
      atRange(RESERVED, reservedMsg("fn"), 4, 1, 6, 4),
    ]);
  });

  it("N4: the depth-2 form `schema S { p: { q: { while: string } } }` now reports the declaration-ranged refusal alone", () => {
    // Depth ≥ 2: the pass walks `node.fieldNames` at every depth, so the second
    // nesting is refused for the same reason the first one is.
    expect(lines(theta("schema S { p: { q: { while: string } } }\n1\n"))).toEqual([
      at(RESERVED, reservedMsg("while"), 4, 1, 41),
    ]);
  });

  it("N5: the annotation-position sibling `let x: { fn: string } = 1` now gains the refusal beside its type-mismatch verdict", () => {
    // The control on the other side: an inline object type in a `let`
    // annotation is a nested brace with NO member region anywhere above it, so
    // it proves the identifier pass's reach does not depend on region at all.
    // The identifier pass runs during type parsing, ahead of the checker's RHS
    // type-mismatch verdict, so the refusal emits first.
    expect(lines(theta("let x: { fn: string } = 1\n1\n"))).toEqual([
      at(RESERVED, reservedMsg("fn"), 4, 1, 26),
      at(
        LET_RHS_MISMATCH,
        msg(LET_RHS_MISMATCH, [
          ["<name>", "x"],
          ["<expected>", "{ fn: string }"],
          ["<actual>", "integer"],
        ]),
        4,
        1,
        26,
      ),
    ]);
  });

  it("N6: a legal depth-2 nested inline object type reports nothing", () => {
    expect(
      lines(theta("schema S { p: { q: { a: string } } }\n1\n")),
      "nesting a legal inline object type must stay admitted at every depth",
    ).toEqual([]);
  });
});

// ===========================================================================
// (S) The anti-spoof rows — a member region needs a declaration HEAD.
// ===========================================================================

describe("0242 (S) — a `{` whose neighbourhood merely contains `schema` / `enum` / `import` / `export` keeps its block-region verdict", () => {
  // WHY THESE ROWS EXIST. `classifyBrace` decides a member region from the
  // tokens before the brace, and each of the four words it keys on is also a
  // reserved spelling an author can write in an illegal position — inside a
  // condition, as an expression operand. If either arm tested a keyword's mere
  // PROXIMITY to the brace rather than a whole grammar production head
  // (`SchemaDecl` / `EnumDecl` spell `"schema" Ident "{"` / `"enum" Ident "{"`;
  // `ImportDecl` / `ExportDecl` are declarations and open a statement,
  // docs/reference/grammar.md), these sources would open a member region, the
  // keyword after the `{` would read as a member NAME, and the scans there
  // would be skipped. Every source below is independently illegal and is
  // REFUSED today; each row is the byte-exact list it draws at HEAD, so a
  // spoofable antecedent test reds here rather than silently ADMITTING source
  // the spec refuses (§Fix constraint 6, §Expected 4/5).

  it("S1: `if (schema) { fn: 1 }` keeps its condition verdict and refusal, dropping single-line-if (bug 0249)", () => {
    // RETAKEN under bug 0249's amended enumeration. `fn: 1` inside this block
    // region is now a name slot (edit 3: the token after `{` here is followed
    // by `:`), so the `controlHeads` scan is skipped; edit 2
    // (`parseObjectLiteral`) admits the `keyword`-kind head as the bare
    // literal's field name and draws the refusal itself. The condition
    // verdict and the refusal are unmoved — nothing here is admitted.
    expect(
      lines(theta("if (schema) { fn: 1 }\n1\n")),
      "`schema` inside a condition heads no SchemaDecl, so this brace opens a block region",
    ).toEqual([
      at(NON_BOOLEAN, msg(NON_BOOLEAN, [["<type>", "null"]]), 4, 1, 3),
      reservedAt("fn", 4, 15),
    ]);
  });

  it("S2: `if (enum) { for: 1 }` keeps its condition verdict and refusal, dropping single-line-if (bug 0249)", () => {
    expect(lines(theta("if (enum) { for: 1 }\n1\n"))).toEqual([
      at(NON_BOOLEAN, msg(NON_BOOLEAN, [["<type>", "null"]]), 4, 1, 3),
      reservedAt("for", 4, 13),
    ]);
  });

  it("S3: `match (schema) { fn }` keeps its three verdicts", () => {
    expect(lines(theta("match (schema) { fn }\n1\n"))).toEqual([
      at(MATCH_ARM_MISMATCH, msg(MATCH_ARM_MISMATCH, []), 4, 1, 8),
      at(EMPTY_SCHEMA, msg(EMPTY_SCHEMA, [["<X>", ")"]]), 4, 8, 22),
      singleLineIfAt("fn", 4, 18),
    ]);
  });

  it("S4: `schema in { fn: string }` keeps both refusals, dropping single-line-if (bug 0249)", () => {
    // The consequence the ident requirement accepts and this row pins: a schema
    // whose NAME is itself a reserved spelling spells no `"schema" Ident "{"`
    // head, so `{ fn: string }` here is not an inline object TYPE and edit 1
    // (the type-grammar identifier pass) never runs over it — it is a bare
    // object-literal EXPRESSION instead, and edit 2 (`parseObjectLiteral`)
    // admits `fn` as its field name and draws the refusal ranged on the token
    // itself. Edit 3's name-slot predicate reaches `fn: string}`'s
    // colon-followed head regardless, so the `controlHeads` scan is skipped.
    // The declaration is refused either way — the status quo is preserved and
    // nothing is admitted.
    expect(lines(theta("schema in { fn: string }\n1\n"))).toEqual([
      reservedAt("in", 4, 8),
      reservedAt("fn", 4, 13),
    ]);
  });

  it("S5: `let x = import { fn: 1 }` keeps its two parse verdicts and the refusal, dropping single-line-if (bug 0249)", () => {
    // The mirror arm. `import` in an expression operand position heads no
    // `ImportDecl`, so its brace is no specifier list; edit 3's name-slot
    // predicate reaches `fn: 1`'s colon-followed head regardless, and edit 2
    // admits it as the bare literal's field name.
    expect(lines(theta("let x = import { fn: 1 }\n1\n"))).toEqual([
      at(LET_NO_INITIALISER, msg(LET_NO_INITIALISER, [["<name>", "x"]]), 4, 1, 8),
      at(IMPORT_NO_FROM, msg(IMPORT_NO_FROM, []), 4, 9, 25),
      reservedAt("fn", 4, 18),
    ]);
  });

  it("S6: `let x = export { fn: 1 }` keeps the same three verdicts, dropping single-line-if (bug 0249)", () => {
    expect(lines(theta("let x = export { fn: 1 }\n1\n"))).toEqual([
      at(LET_NO_INITIALISER, msg(LET_NO_INITIALISER, [["<name>", "x"]]), 4, 1, 8),
      at(IMPORT_NO_FROM, msg(IMPORT_NO_FROM, []), 4, 9, 25),
      reservedAt("fn", 4, 18),
    ]);
  });

  it("S7: `let x = import { fn }` keeps single-line-if beside its two parse verdicts", () => {
    expect(lines(theta("let x = import { fn }\n1\n"))).toEqual([
      at(LET_NO_INITIALISER, msg(LET_NO_INITIALISER, [["<name>", "x"]]), 4, 1, 8),
      at(IMPORT_NO_FROM, msg(IMPORT_NO_FROM, []), 4, 9, 22),
      singleLineIfAt("fn", 4, 18),
      reservedAt("fn", 4, 18),
    ]);
  });

  it("S8: `if (import) { fn: 1 }` keeps the same four parse verdicts and the refusal, dropping single-line-if (bug 0249)", () => {
    // The brace here follows `)`, so neither declarator arm is even consulted;
    // edit 3's name-slot predicate reaches `fn: 1`'s colon-followed head
    // regardless, so the `controlHeads` scan is skipped, and edit 2 admits the
    // token as the bare object literal's field name and draws the refusal.
    expect(lines(theta("if (import) { fn: 1 }\n1\n"))).toEqual([
      at(NON_BOOLEAN, msg(NON_BOOLEAN, [["<type>", "null"]]), 4, 1, 3),
      at(IMPORT_NO_FROM, msg(IMPORT_NO_FROM, []), 4, 5, 11),
      at(
        UNSUPPORTED,
        msg(UNSUPPORTED, [["<construct>", "stray ')' in statement position"]]),
        4,
        11,
        12,
      ),
      at(BARE_OBJECT, msg(BARE_OBJECT, []), 4, 13, 22),
      reservedAt("fn", 4, 15),
    ]);
  });

  it("S9: every shape above still blocks registration", () => {
    const spoofs = [
      "if (schema) { fn: 1 }\n1\n",
      "if (enum) { for: 1 }\n1\n",
      "match (schema) { fn }\n1\n",
      "schema in { fn: string }\n1\n",
      "let x = import { fn: 1 }\n1\n",
      "let x = export { fn: 1 }\n1\n",
      "let x = import { fn }\n1\n",
      "if (import) { fn: 1 }\n1\n",
    ];
    for (const body of spoofs) {
      const doc = theta(body);
      expect(
        blocksRegistration(doc.diagnostics),
        `an illegal-position keyword must not become admitted; diagnostics=${JSON.stringify(lines(doc))}`,
      ).toBe(true);
    }
  });
});

// ===========================================================================
// (O) The typed object-literal EXPRESSION — a `schema` head that declares
//     nothing, and the declaration position that tells the two apart.
// ===========================================================================

describe("0242 (O) — `schema T { … }` in expression position keeps its block-region verdict", () => {
  // WHY THE SCHEMA / ENUM ARM NEEDS A DECLARATION POSITION AND NOT A
  // PRODUCTION SHAPE ALONE. `SchemaDecl` and the typed object-literal expression
  // spell the SAME three tokens — `schema` `Ident` `{`
  // (docs/reference/expressions.md §"Object construction": `Schema { field:
  // expr }`). Only the declaration's body is a member region: its field names
  // are refused by bug 0153's `parseSchemaObjectBody` leaf, which is what makes
  // the lexer's verdict there a duplicate. A CONSTRUCTOR's keys have no such
  // leaf behind them, exactly as a nested inline object type's do not (group
  // (N)), so the lexer's emission there is the whole refusal and the scans must
  // keep their reach. The two are told apart by position: a declaration's
  // keyword opens a statement (or stands behind a statement-opening `export`);
  // a constructor's sits inside an expression. Every row below is the
  // byte-exact list the shape draws at HEAD.

  /** A declaration of `T` on line 4, so each constructor row's body is line 5. */
  const WITH_T = "schema T { a: string }\n";

  it("O1: `let x = [schema T { a: \"s\", fn: 1 }]` now reports extra-field and the refusal, dropping single-line-if (bug 0249)", () => {
    // RETAKEN under bug 0249's amended enumeration. Edit 2 (`parseObjectLiteral`)
    // admits the `keyword`-kind head as the constructor's field NAME — it
    // reaches `fields`, so `checkObjectExpr`'s `present` list now names it and
    // `extra-object-field` fires (§Expected 3), beside the refusal edit 2 draws
    // itself. Edit 3's name-slot predicate withdraws `single-line-if` for the
    // same colon-followed head.
    expect(
      lines(theta(WITH_T + 'let x = [schema T { a: "s", fn: 1 }]\n1\n')),
      "the constructor key now reaches the field set, so it is an extra field as well as a refused identifier",
    ).toEqual([
      at(EXTRA_FIELD, msg(EXTRA_FIELD, [["<field>", "fn"], ["<schema>", "T"]]), 5, 17, 36),
      reservedAt("fn", 5, 29),
    ]);
  });

  it("O2: the same key FIRST now reports extra-field and the refusal, dropping single-line-if (bug 0249)", () => {
    // Behind the opening `{` rather than behind a `,`: both are member-name
    // slots inside a member region, so both are reached by edit 3's name-slot
    // predicate the same way; the extra-field verdict is unmoved by the key's
    // position, since `checkObjectExpr` judges the field SET, not its order.
    expect(lines(theta(WITH_T + 'let x = [schema T { fn: 1, a: "s" }]\n1\n'))).toEqual([
      at(EXTRA_FIELD, msg(EXTRA_FIELD, [["<field>", "fn"], ["<schema>", "T"]]), 5, 17, 36),
      reservedAt("fn", 5, 21),
    ]);
  });

  it("O3: an `if`-spelled constructor key now reports extra-field and the refusal, dropping single-line-if (bug 0249)", () => {
    expect(lines(theta(WITH_T + 'let x = [schema T { a: "s", if: 1 }]\n1\n'))).toEqual([
      at(EXTRA_FIELD, msg(EXTRA_FIELD, [["<field>", "if"], ["<schema>", "T"]]), 5, 17, 36),
      reservedAt("if", 5, 29),
    ]);
  });

  it("O4: the legal constructor `let x = [schema T { a: \"s\" }]` reports nothing", () => {
    // The anti-vacuity floor for O1–O3: this shape is `[]` whatever the region
    // verdict is, so it is what proves those three rows measure a diagnostic
    // the key's spelling draws and not a shape the parser refuses outright.
    expect(lines(theta(WITH_T + 'let x = [schema T { a: "s" }]\n1\n'))).toEqual([]);
  });

  it("O5: the unbracketed constructor keeps its two parse verdicts, dropping single-line-if (bug 0249)", () => {
    // Outside an array literal the shape still draws its own parse verdicts and
    // a reserved refusal from the constructor leaf; edit 3's name-slot
    // predicate withdraws single-line-if for the colon-followed `fn: 1` head
    // regardless of the enclosing shape.
    expect(lines(theta(WITH_T + "let x = schema T { fn: 1 }\n1\n"))).toEqual([
      at(LET_NO_INITIALISER, msg(LET_NO_INITIALISER, [["<name>", "x"]]), 5, 1, 8),
      reservedAt("fn", 5, 20),
    ]);
  });

  it("O6: `let x = [enum U { fn }]` keeps single-line-if AND gains the refusal (bug 0249)", () => {
    // The enum half of the same arm, and the one row of the seventeen that is
    // an ADDITION rather than a swap: `fn` here spells no top-level `:` (an
    // enum variant, not a field), so edit 3's colon-width predicate does not
    // reach it and `single-line-if` stays. Edit 2's admission in
    // `parseObjectLiteral` carries no such colon requirement — it pushes the
    // refusal whenever the head is `keyword`-kind, colon or not — so `fn` is
    // admitted as this bare literal's sole field and the refusal fires beside
    // the unmoved single-line-if. Widening edit 3 to also withdraw
    // single-line-if from colon-less keyword heads would additionally move S3
    // and S7 (both LOCKS), which is why the width stops here.
    expect(lines(theta("enum U { A }\nlet x = [enum U { fn }]\n1\n"))).toEqual([
      at(UNRESOLVED_TYPE, msg(UNRESOLVED_TYPE, [["<name>", "U"]]), 5, 15, 23),
      singleLineIfAt("fn", 5, 19),
      reservedAt("fn", 5, 19),
    ]);
  });

  it("O7: the brace-wrapped declaration `{ schema S { fn: 1 } }` re-parses as a bare literal whose field is `schema` (bug 0249, recovery-shape change)", () => {
    // THE ACCEPTED CONSEQUENCE of §Fix edit 2 carrying no `typeName !== null`
    // qualifier (ratified by the parent adjudication, §Fix constraint 1).
    // `parseObjectLiteral` serves both the named-constructor call site and the
    // BARE-literal call site, and this source's outer `{` opens a bare object
    // literal whose head token is now `schema` — a `keyword`-kind token edit 2
    // admits as the bare literal's field NAME (rather than the whole inner
    // `schema S { fn: 1 }` being read as the field's key-less VALUE, as it was
    // at HEAD). The refusal against `schema` fires there; its value expression
    // is then the named literal `S { fn: 1 }`, whose type name `S` is
    // unresolved (no same-file declaration), and whose OWN key `fn` draws the
    // refusal a second time — replacing the duplicate outer `bare-object-literal`
    // and the off-Trigger `single-line-if` HEAD drew. The shape is refused
    // either way and nothing here is admitted: this is a diagnostic-identity
    // and recovery-shape correction on a misfire row, not a weakening.
    expect(lines(theta("{ schema S { fn: 1 } }\n1\n"))).toEqual([
      at(BARE_OBJECT, msg(BARE_OBJECT, []), 4, 1, 23),
      reservedAt("schema", 4, 3),
      at(UNRESOLVED_TYPE, msg(UNRESOLVED_TYPE, [["<name>", "S"]]), 4, 10, 21),
      reservedAt("fn", 4, 14),
    ]);
  });

  it("O8: `export schema S { fn: string }` reports the field alone", () => {
    // The other side of the position rule: an `export` that itself opens a
    // statement carries the declaration head, so the body stays a member
    // region and §Expected 3's repair holds for the exported spelling too. The
    // from-clause verdict beside it is the export statement's own and is
    // unrelated to any face here.
    expect(lines(theta("export schema S { fn: string }\n1\n"))).toEqual([
      at(IMPORT_NO_FROM, msg(IMPORT_NO_FROM, []), 4, 1, 7),
      reservedAt("fn", 4, 19),
    ]);
  });

  it("O9: `export enum E { fn }` reports the variant alone", () => {
    expect(lines(theta("export enum E { fn }\n1\n"))).toEqual([
      at(IMPORT_NO_FROM, msg(IMPORT_NO_FROM, []), 4, 1, 7),
      reservedAt("fn", 4, 17),
    ]);
  });

  it("O10: `export schema S { let as \"w\": string }` reports the field alone", () => {
    expect(lines(theta('export schema S { let as "w": string }\n1\n'))).toEqual([
      at(IMPORT_NO_FROM, msg(IMPORT_NO_FROM, []), 4, 1, 7),
      reservedAt("let", 4, 19),
    ]);
  });

  it("O11: `export fn f(): number { 1 }` keeps its from-clause verdict alone", () => {
    // The control on the `export` clause's reach: it admits a `schema` / `enum`
    // declaration head only, so a `fn` header behind `export` is untouched.
    expect(lines(theta("export fn f(): number { 1 }\n1\n"))).toEqual([
      at(IMPORT_NO_FROM, msg(IMPORT_NO_FROM, []), 4, 1, 7),
    ]);
  });

  it("O12: every constructor shape above still blocks registration", () => {
    for (const body of [
      WITH_T + 'let x = [schema T { a: "s", fn: 1 }]\n1\n',
      WITH_T + 'let x = [schema T { fn: 1, a: "s" }]\n1\n',
      WITH_T + 'let x = [schema T { a: "s", if: 1 }]\n1\n',
      WITH_T + "let x = schema T { fn: 1 }\n1\n",
      "enum U { A }\nlet x = [enum U { fn }]\n1\n",
      "{ schema S { fn: 1 } }\n1\n",
    ]) {
      const doc = theta(body);
      expect(
        blocksRegistration(doc.diagnostics),
        `a constructor key with no parser-leaf backstop must stay refused; diagnostics=${JSON.stringify(lines(doc))}`,
      ).toBe(true);
    }
  });
});

// ===========================================================================
// (P) The name-slot rule's reach past the `ForStmt` header — pinned, not
//     narrowed.
// ===========================================================================

describe("0242 (P) — a keyword directly behind keyword `for` is a name slot wherever it stands", () => {
  // THE REACH OF THE RULE THESE ROWS PIN. Inside a block region the name-slot
  // predicate keys on the previous token being keyword `for`, which holds at
  // the `ForStmt` iteration variable (`ForStmt ::= "for" Ident "in" Expr
  // StmtBlock`, docs/reference/grammar.md §"Blocks") and at two further shapes
  // that put a keyword in that adjacency without spelling a loop header: a
  // member access whose member name is `for`, and a `for` written where a
  // member name belongs. §Fix Route A authorises suppressing the scans at a
  // name slot, and the predicate applies that authority by adjacency rather
  // than by whether the surrounding tokens complete a loop, so both shapes are
  // inside the rule.
  //
  // WHAT THAT COSTS, measured: at each shape one diagnostic HEAD emits is gone
  // — the `binding-case-mismatch` @4:19-4:20 at P1, the second single-line-if
  // @4:21-4:23 at P2. Both sources stay REFUSED by the diagnostics that remain,
  // so no registration outcome changes and nothing is admitted (§Fix constraint
  // 6). These rows exist to make the reach visible and to fail loudly if it
  // ever widens to a shape that IS admitted.

  it("P1: `let y = a.for let X = 1` reports the unknown identifier and single-line-if", () => {
    expect(
      lines(theta("let y = a.for let X = 1\n1\n")),
      "the token behind keyword `for` is treated as a name slot here, so the `let` arm is skipped",
    ).toEqual([
      at(UNKNOWN_IDENT, msg(UNKNOWN_IDENT, [["<name>", "a"]]), 4, 9, 10),
      singleLineIfAt("for", 4, 11),
    ]);
  });

  it("P2: `schema S { p: { for fn } }` reports malformed-schema-field then single-line-if", () => {
    // Bug 0244 (operator adjudication) flip: `tokeniseType`
    // (src/parser/type-grammar.ts) has no keyword token kind — its kind union
    // is `"ident" | "str" | "num" | "punct"` — so `for` reaches the inner
    // interior's field-name position as an `ident` and is accepted there. The
    // COLON GATE behind it is what fails: the next token is `fn`, not `:`. The
    // entry `for fn` spells no top-level `:` and carries no stray close token,
    // so `TypeParser.parseObject`'s colon-gate arm now refuses it — an ADDED
    // line ahead of the name-slot rule's own
    // `single-line-if` verdict on `for`, which is unmoved. The refusal's range
    // is the enclosing declaration's site (`TypeCheckSite`, `schema S { ... }`
    // spans column 1 to the end of the closing `}`), not the entry's own token:
    // a `TypeNode` carries no range of its own, the same divergence
    // `theta/parse/schema-type-not-expression` already states.
    expect(lines(theta("schema S { p: { for fn } }\n1\n"))).toEqual([
      at(MALFORMED_FIELD, msg(MALFORMED_FIELD, []), 4, 1, 27),
      singleLineIfAt("for", 4, 17),
    ]);
  });

  it("P3: both shapes still block registration", () => {
    for (const body of ["let y = a.for let X = 1\n1\n", "schema S { p: { for fn } }\n1\n"]) {
      const doc = theta(body);
      expect(
        blocksRegistration(doc.diagnostics),
        `the name-slot reach must not admit a refused source; diagnostics=${JSON.stringify(lines(doc))}`,
      ).toBe(true);
    }
  });

  // THE MEMBER-BRANCH TWIN OF THE RULE ABOVE. Skipping a declarator arm at a
  // member NAME slot skips `checkName`'s CASE sub-arm with it whenever the
  // token at `k+1` is an `ident` — the `let` / `schema` arms and their
  // case-mismatch check are one predicate, not two, so a name slot suppresses
  // both together. The case rules govern the NEXT token (a binding or a schema
  // name); the token the arm itself sits on is a field name, a variant name or
  // an import specifier, none of which the case rules are about, so the
  // dropped sub-arm was never checking the right subject. Every shape below
  // stays REFUSED by an E-severity `theta/parse/*` diagnostic that is not the
  // dropped one, so nothing is admitted — the rows exist to fix the reach in
  // place and to fail loudly if it ever widens to a shape that IS admitted.
  // These are the shapes bugs 0051's and 0135's next run over this function
  // must re-derive: any change to the declarator arms or `checkName` has to
  // reproduce this same drop, not a different one.

  it("P4: `schema S { let Foo: string }` keeps empty-schema-body alone, dropping HEAD's binding-case-mismatch @4:16-4:19", () => {
    expect(
      lines(theta("schema S { let Foo: string }\n1\n")),
      "`Foo` sits at the member NAME slot the `let` arm is skipped at, not at a binding name the case rule governs",
    ).toEqual([at(EMPTY_SCHEMA, msg(EMPTY_SCHEMA, [["<X>", "S"]]), 4, 1, 29)]);
  });

  it("P5: `enum E { let B }` keeps the reserved refusal alone, dropping HEAD's binding-case-mismatch @4:14-4:15", () => {
    expect(lines(theta("enum E { let B }\n1\n"))).toEqual([reservedAt("let", 4, ENUM_VARIANT_COL)]);
  });

  it("P6: `schema S { schema t: string }` keeps empty-schema-body alone, dropping HEAD's schema-case-mismatch @4:19-4:20", () => {
    expect(
      lines(theta("schema S { schema t: string }\n1\n")),
      "`t` sits at the member NAME slot the `schema` arm is skipped at, not at a schema name the case rule governs",
    ).toEqual([at(EMPTY_SCHEMA, msg(EMPTY_SCHEMA, [["<X>", "S"]]), 4, 1, 30)]);
  });

  it("P7: `import { let X } from …` keeps the malformed-list and reserved refusals, dropping HEAD's binding-case-mismatch", () => {
    expect(lines(theta('import { let X } from "./lib.thetalib"\n1\n'))).toEqual([
      at(
        IMPORT_MALFORMED,
        msg(IMPORT_MALFORMED, []),
        4,
        1,
        39,
      ),
      reservedAt("let", 4, IMPORT_BARE_COL),
    ]);
  });

  it("P8: all four member-branch shapes still block registration", () => {
    for (const body of [
      "schema S { let Foo: string }\n1\n",
      "enum E { let B }\n1\n",
      "schema S { schema t: string }\n1\n",
      'import { let X } from "./lib.thetalib"\n1\n',
    ]) {
      const doc = theta(body);
      expect(
        blocksRegistration(doc.diagnostics),
        `the member-branch reach must not admit a refused source; diagnostics=${JSON.stringify(lines(doc))}`,
      ).toBe(true);
    }
  });
});

// ===========================================================================
// (M) The multiline member body — where the repair reaches and where it stops.
// ===========================================================================

describe("0242 (M) — a multiline schema body repairs only where the body separates its fields", () => {
  // THE BOUNDARY THESE ROWS FIX. The `controlHeads` scan walks forward for a
  // `{` and stops at the next `stmt-sep`, and the lexer emits no `stmt-sep`
  // for a newline at brace depth > 0 (a newline inside braces continues the
  // logical line, docs/reference/grammar.md §"Newline continuation"). A
  // comma-less multiline body therefore leaves the scan walking past the field
  // name into the rest of the body, where it finds no `{` before the closing
  // brace and fires — at a position the name-slot verdict does reach, but on a
  // token the scan reached from a HEAD outside the body. The row is
  // byte-identical to HEAD, and the source is refused for its missing comma
  // regardless.

  it("M1: the comma-less multiline body keeps single-line-if @6:1-6:3 beside both verdicts", () => {
    expect(
      lines(theta("schema S {\na: string\nfn: string\n}\n1\n")),
      "a body whose fields are not comma-separated is refused for that, and the scan's reach there is unchanged",
    ).toEqual([
      singleLineIfAt("fn", 6, 1),
      at(
        UNSUPPORTED,
        msg(UNSUPPORTED, [["<construct>", "schema fields must be comma-separated"]]),
        6,
        1,
        3,
      ),
      reservedAt("fn", 6, 1),
    ]);
  });

  it("M2: the comma-separated multiline sibling reports the field alone", () => {
    // The repair, one comma away from M1: with the separator present the field
    // name is a member NAME slot the scan is skipped at, and §Expected 3 holds
    // over the multiline spelling exactly as it does over the single-line one.
    expect(lines(theta("schema S {\na: string,\nfn: string\n}\n1\n"))).toEqual([
      reservedAt("fn", 6, 1),
    ]);
  });

  it("M3: the legal comma-separated multiline body reports nothing", () => {
    expect(lines(theta("schema S {\na: string,\nb: string\n}\n1\n"))).toEqual([]);
  });

  it("M4: the single-field multiline body reports the field alone", () => {
    expect(lines(theta("schema S {\nfn: string\n}\n1\n"))).toEqual([
      reservedAt("fn", 5, 1),
    ]);
  });

  it("M5: the multiline enum body reports the variant alone", () => {
    expect(lines(theta("enum E {\nfn\n}\n1\n"))).toEqual([reservedAt("fn", 5, 1)]);
  });

  it("M6: the multiline import specifier list reports the specifier alone", () => {
    expect(lines(theta('import {\nfn\n} from "./lib.thetalib"\n1\n'))).toEqual([
      reservedAt("fn", 5, 1),
    ]);
  });

  it("M7: the comma-less multiline body still blocks registration", () => {
    const doc = theta("schema S {\na: string\nfn: string\n}\n1\n");
    expect(
      blocksRegistration(doc.diagnostics),
      `diagnostics=${JSON.stringify(lines(doc))}`,
    ).toBe(true);
  });
});

// ===========================================================================
// (G) The genuine subjects of `theta/parse/single-line-if` — must not move.
// ===========================================================================

describe("0242 (G) — a real single-line body keeps its single-line-if verdict", () => {
  // §Fix constraint 4. These are the rows a suppression that reached the
  // `controlHeads` scan too widely would silence, and silencing them would
  // admit source the spec refuses. Each is measured at HEAD and must be
  // byte-identical after.

  it("G1: `if (x) 1` keeps single-line-if @5:1-5:3", () => {
    expect(
      lines(theta("let x = 1\nif (x) 1\n1\n")),
      "a genuine unbraced `if` body is exactly this row's Trigger and must keep firing",
    ).toEqual([
      singleLineIfAt("if", 5, 1),
      at(NON_BOOLEAN, msg(NON_BOOLEAN, [["<type>", "integer"]]), 5, 5, 6),
    ]);
  });

  it("G2: `for x in xs 1` keeps single-line-if @5:1-5:4", () => {
    expect(lines(theta("let xs = [1]\nfor x in xs 1\n1\n"))).toEqual([
      singleLineIfAt("for", 5, 1),
    ]);
  });

  it("G3: `while (x) 1` keeps single-line-if @5:1-5:6", () => {
    expect(lines(theta("let x = 1\nwhile (x) 1\n1\n"))).toEqual([
      singleLineIfAt("while", 5, 1),
      at(NON_BOOLEAN, msg(NON_BOOLEAN, [["<type>", "integer"]]), 5, 8, 9),
    ]);
  });

  it("G4: `fn f(): number 1` keeps single-line-if @4:1-4:3", () => {
    expect(lines(theta("fn f(): number 1\n1\n"))).toEqual([singleLineIfAt("fn", 4, 1)]);
  });
});

// ===========================================================================
// (R) The risk controls — the declarator arms keep their genuine reach.
// ===========================================================================

describe("0242 (R) — a reserved spelling at a genuine declarator name still draws the refusal", () => {
  // §Fix constraint 4's other half, and the S1 tripwires: the three arms exist
  // to refuse exactly these, and a fix that silently ADMITS any of them turns a
  // cosmetic S2 into an S1. Each row is measured at HEAD and must be
  // byte-identical after.

  it("R1: `let in = 1` still draws the refusal @4:5-4:7", () => {
    // The `let` arm at a genuine binding name. Its `k+1` token is the name the
    // author chose, and no name-slot verdict may reach it: at the top level the
    // previous token is a stmt-sep in a BLOCK region, not a member region.
    expect(lines(theta("let in = 1\n1\n"))).toEqual([reservedAt("in", 4, 5)]);
  });

  it("R2: `let as = 1` still draws the refusal @4:5-4:7", () => {
    expect(lines(theta("let as = 1\n1\n"))).toEqual([reservedAt("as", 4, 5)]);
  });

  it("R3: `let mut in = 1` still draws the refusal @4:9-4:11", () => {
    // The `mut` SKIP inside the `let` arm, not the `mut` clause of the name-slot
    // predicate: here `mut` sits behind `let`, not behind `for`.
    expect(lines(theta("let mut in = 1\n1\n"))).toEqual([reservedAt("in", 4, 9)]);
  });

  it("R4: `fn in(): number { … }` still draws the refusal @4:4-4:6", () => {
    expect(lines(theta("fn in(): number {\n1\n}\n1\n"))).toEqual([
      reservedAt("in", 4, 4),
    ]);
  });

  it("R5: `schema in { … }` still draws the refusal @4:8-4:10", () => {
    expect(lines(theta("schema in {\na: string\n}\n1\n"))).toEqual([
      reservedAt("in", 4, 8),
    ]);
  });

  it("R6: `enum as { … }` still draws the refusal @4:6-4:8", () => {
    expect(lines(theta("enum as {\nA\n}\n1\n"))).toEqual([reservedAt("as", 4, 6)]);
  });

  it("R7: `fn g(): number { let in = 1 }` still draws the refusal @4:22-4:24", () => {
    // The region test with teeth: the `{` here follows the return type of a
    // `fn` header, so it opens a BLOCK region and the `let` arm keeps its full
    // reach one level down. A classifier that called every brace a member
    // region would admit this line silently.
    expect(lines(theta("fn g(): number { let in = 1 }\n1\n"))).toEqual([
      reservedAt("in", 4, 22),
    ]);
  });

  it("R8: `let Foo = 1` still draws binding-case-mismatch @4:5-4:8", () => {
    // `checkName`'s case arm — bug 0135's citation neighbourhood. The arms are
    // narrowed by position, not disabled, so the case rules keep their reach.
    expect(lines(theta("let Foo = 1\n1\n"))).toEqual([
      at(BINDING_CASE, msg(BINDING_CASE, []), 4, 5, 8),
    ]);
  });

  it("R9: `schema s { … }` still draws schema-case-mismatch @4:8-4:9", () => {
    expect(lines(theta("schema s {\na: string\n}\n1\n"))).toEqual([
      at(SCHEMA_CASE, msg(SCHEMA_CASE, []), 4, 8, 9),
    ]);
  });

  it("R10: `let fn = 1` still draws BOTH its refusal and its single-line-if, in that order", () => {
    // OUT OF SCOPE for this report and pinned so it cannot drift as a
    // side-effect. `fn` here is a genuine binding NAME, so the `let` arm
    // refuses it — and the same token is a `controlHeads` member with no `{`
    // on its line, so the fourth scan fires too. That second emission is a
    // face this report does not claim: the name is not in a member region and
    // not at a for-iteration slot, so no name-slot verdict reaches it. Both
    // diagnostics stay, at the same range, in this order.
    expect(lines(theta("let fn = 1\n1\n"))).toEqual([
      reservedAt("fn", 4, 5),
      singleLineIfAt("fn", 4, 5),
    ]);
  });
});

// ===========================================================================
// (E) The nine partition rows — the whole 32-spelling picture at each shape.
// ===========================================================================

describe("0242 (E) — the partition of §Reproduction (E), as ordered whole lists", () => {
  // Each sweep is a whole-list ordered equality PER SPELLING over the unfiltered
  // diagnostics, asserted as one 32-key record so a partition that is right for
  // 31 spellings and wrong for one names the spelling in the diff. After the
  // fix every column that drew the correct refusal ALONE keeps it, and every
  // misfiring column joins them: the "misfiring spellings" column of the bug
  // document's table becomes empty at all eight token shapes.

  it("E1: `for <kw> in xs { 1 }` — 31 draw the refusal alone, `mut` draws its own code", () => {
    // The four declarator heads (`let`, `fn`, `schema`, `enum`) lose the `in`
    // misfire and join the other 27. `mut` is consumed by `parseFor`'s modifier
    // check before the name is read, so the position keeps
    // `mut-on-immutable-context` alone — bug 0153's discriminator, untouched.
    expect(sweep(forSource)).toEqual(
      expectedSweep((kw) =>
        kw === "mut" ? [mutAt(5, FOR_COL)] : [reservedAt(kw, 5, FOR_COL)],
      ),
    );
  });

  it("E2: `par for <kw> in xs { 1 }` — the same partition, shifted four columns", () => {
    expect(sweep(parForSource)).toEqual(
      expectedSweep((kw) =>
        kw === "mut" ? [mutAt(5, PAR_FOR_COL)] : [reservedAt(kw, 5, PAR_FOR_COL)],
      ),
    );
  });

  it("E3: `schema S { <kw>: string }` — all 32 draw the refusal alone", () => {
    // The four `controlHeads` spellings lose `single-line-if` and the shape
    // becomes uniform.
    expect(sweep(schemaFieldSource)).toEqual(
      expectedSweep((kw) => [reservedAt(kw, 4, SCHEMA_FIELD_COL)]),
    );
  });

  it("E4: `enum E { <kw> }` — all 32 draw the refusal alone", () => {
    expect(sweep(enumVariantSource)).toEqual(
      expectedSweep((kw) => [reservedAt(kw, 4, ENUM_VARIANT_COL)]),
    );
  });

  it("E5: `import { <kw> } from …` — 31 draw the refusal alone, `as` keeps the malformed-list verdict", () => {
    // `as` is excluded from `isSymbolToken` (src/parser/theta-document.ts:3334,
    // `t.text !== "as"`), so it never occupies a NAME slot at all: bugs
    // 0100 / 0211's `import-malformed-specifier-list` owns that column, ranged
    // over the whole statement, and this fix must not reach it.
    expect(sweep(importBareSource)).toEqual(
      expectedSweep((kw) =>
        kw === "as"
          ? [
              at(
                IMPORT_MALFORMED,
                msg(IMPORT_MALFORMED, []),
                4,
                1,
                importBareLine("as").length + 1,
              ),
            ]
          : [reservedAt(kw, 4, IMPORT_BARE_COL)],
      ),
    );
  });

  it("E6: `import { a as <kw> } from …` — 31 alone at the alias slot, `as` outside the position", () => {
    expect(sweep(importAliasSource)).toEqual(
      expectedSweep((kw) =>
        kw === "as"
          ? // `import { a as as }`: the `as` keyword is consumed with no
            // following `Ident` alias, so the malformed row is ranged over the
            // specifier `a` @4:10-4:11 and no NAME slot is occupied.
            [at(IMPORT_MALFORMED, msg(IMPORT_MALFORMED, []), 4, 10, 11)]
          : [reservedAt(kw, 4, IMPORT_ALIAS_COL)],
      ),
    );
  });

  it("E7: `schema S { <kw> as \"w\": string }` — all 32 draw the refusal alone", () => {
    // The shape that carried BOTH misfires at once: seven spellings drew a
    // second or third diagnostic at HEAD (`let`, `schema`, `enum` the `as`
    // misfire; `if`, `for`, `while` the `single-line-if`; `fn` both). One
    // name-slot verdict clears all seven.
    expect(sweep(wireRenameSource)).toEqual(
      expectedSweep((kw) => [reservedAt(kw, 4, SCHEMA_FIELD_COL)]),
    );
  });

  it("E8: `import { <kw> as x } from …` — 31 draw the refusal alone, `as` keeps the malformed-list verdict", () => {
    expect(sweep(importNameAliasSource)).toEqual(
      expectedSweep((kw) =>
        kw === "as"
          ? [
              at(
                IMPORT_MALFORMED,
                msg(IMPORT_MALFORMED, []),
                4,
                1,
                importNameAliasLine("as").length + 1,
              ),
            ]
          : [reservedAt(kw, 4, IMPORT_BARE_COL)],
      ),
    );
  });

  it("E9: the `params:` key — all 32 draw the refusal alone, unchanged", () => {
    // The control on the CAUSE. This face reads a YAML scalar key
    // (`extractParsedParams`, src/parser/frontmatter.ts:726) with no token
    // stream, so no adjacency scan ever reached it and no misfire ever existed
    // here. It is uniform at HEAD and must stay uniform: a fix reaching it
    // would be reaching a face that has no defect.
    expect(sweep(paramsSource)).toEqual(
      expectedSweep((kw) => [reservedAt(kw, 4, PARAMS_KEY_COL)]),
    );
  });
});

// ===========================================================================
// (d) The registration consequence — unchanged at every face.
// ===========================================================================

describe("0242 (d) — every refused shape still refuses to register, and every legal one still registers", () => {
  // §Fix constraint 6: no registration outcome changes. Each misfiring input is
  // refused at severity `E` today and stays refused after, because the CORRECT
  // diagnostic — the one this fix keeps — is itself an error-severity
  // `theta/parse/*` code. These rows are what prove the fix removes a duplicate
  // and not a refusal.

  const refused: ReadonlyArray<readonly [string, ThetaDocument]> = [
    ["d1 the `for` variable face", theta("let xs = [1]\nfor let in xs { 1 }\n1\n")],
    ["d2 the wire-rename face", theta('schema S { let as "w": string }\n1\n')],
    ["d3 the schema-field `controlHeads` face", theta("schema S { fn: string }\n1\n")],
    ["d4 the enum-variant `controlHeads` face", theta("enum E { fn }\n1\n")],
    [
      "d5 the import-specifier `controlHeads` face",
      theta('import { fn } from "./lib.thetalib"\n1\n'),
    ],
  ];

  for (const [label, doc] of refused) {
    it(`${label} blocks registration`, () => {
      expect(
        blocksRegistration(doc.diagnostics),
        `a spelling the spec refuses must not register; diagnostics=${JSON.stringify(lines(doc))}`,
      ).toBe(true);
    });
  }

  const admitted: ReadonlyArray<readonly [string, ThetaDocument]> = [
    ["d6 the `for` control", theta("let xs = [1]\nfor x in xs { 1 }\n1\n")],
    ["d7 the wire-rename control", theta('schema S { a as "w": string }\n1\n')],
    ["d8 the schema-field control", theta("schema S { a: string }\n1\n")],
    ["d9 the import control", theta('import { a as b } from "./lib.thetalib"\n1\n')],
  ];

  for (const [label, doc] of admitted) {
    it(`${label} still registers`, () => {
      expect(
        blocksRegistration(doc.diagnostics),
        `a conformant declaration must keep registering; diagnostics=${JSON.stringify(lines(doc))}`,
      ).toBe(false);
    });
  }
});
