import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { isSingleEnclosingBraceGroup } from "../src/parser/params";
import { annotationSourceIsNotTypeExpression } from "../src/parser/type-layer-checks";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0256 — an inline object entry stranded behind `TypeParser.parseObject`'s
// exit on a missing entry separator is never visited, so a `params:` field
// declaring `p: 'array<{a: b c, d e}>'` reports `[]`, REGISTERS, and lowers `p`
// to the permissive `{}` that accepts every argument
// (docs/bugs/0256-generic-argument-stranded-entry-registers-permissive.md).
// This file is that report's §Fix "Witness".
//
// THE MECHANISM (cited BY SYMBOL — docs/STYLE.md §Citations; bug 0134
// (docs/bugs/0134-params-shift-induced-stale-citations.md) is the adjudicated
// do-not-chase class for absolute line numbers into the parser modules a fix
// here edits).
//   1. THE ENTRY IS NEVER VISITED. `TypeParser.parseObject`
//      (src/parser/type-grammar.ts) reads an interior entry by entry and reads
//      the entry separator with `if (!this.eatPunct(",")) { break; }`. For the
//      interior `{a: b c, d e}` the first entry's type capture ends at `b`, the
//      next token is `c`, the read fails, and the loop breaks with `d e` never
//      read. Bug 0244's two refusal arms (both behind
//      `TypeParser.entryQualifiesForRefusal`) fire only on entries the loop
//      VISITS, so the stranded entry draws nothing.
//   2. THE RAW-KEY RULES SEE THE TEXT AND ARE BLIND TO IT BY THEIR OWN RULE.
//      `interiorClosingBraceIndex` still finds the interior's depth-0 `}`, so
//      `TypeNode.interiorSource` carries `a: b c, d e` whole and the four
//      raw-key rows run over it; `inlineObjectFieldKeys`
//      (src/parser/type-grammar.ts) keys each entry on the text before that
//      entry's own top-level `:` and skips an entry spelling none.
//      `TypeNode.fieldNames` and `TypeNode.fieldTypes` are short by the
//      stranded entry.
//   3. THE GATE THAT BACKSTOPS THE UNWRAPPED INTERIOR DECLINES THE WRAPPED ONE.
//      `annotationSourceIsNotTypeExpression` (src/parser/type-layer-checks.ts)
//      refuses `{a: b c, d e}` through the shared refusable-text sink. For
//      `array<{a: b c, d e}>` the text carries a brace and an angle bracket and
//      is not a single enclosing brace group (`isSingleEnclosingBraceGroup`,
//      src/parser/params.ts), so the function returns `false` before the sink is
//      consulted — bug 0252's landed decline, narrowed at 0.225.0 to exactly the
//      single-enclosing case. Group (D) below measures that pair directly.
//
// EVERY EXPECTATION BELOW IS THE SPECIFIED BEHAVIOUR, NOT THE CURRENT ONE.
// Each POST-FIX value is the operator's measurement of the settled §Fix route
// (§Fix "Registry disposition": REUSE `theta/parse/malformed-schema-field`,
// emitted at `TypeParser.parseObject`'s entry-separator read, one line per
// stranded entry under bug 0129's count-consequence law). Ordering inside a
// list is part of the assertion: §(b) row b6 renders the stranded entry's
// refusal BEFORE the `let` position's own initialiser mismatch, exactly as its
// byte-neighbour control renders it today.
//
// THREE CELLS FLIP THEIR CODE RATHER THAN GAINING A LINE, and the authority is
// stated at each: §(a) a5 and §(e) e1–e3 draw
// `theta/load/params-type-not-expression` at HEAD and draw
// `theta/parse/malformed-schema-field` after, because that load row's OWN
// precedence rule 1 (docs/spec_topics/diagnostics/code-registry-load.md:19 —
// "a field already carrying an error-severity diagnostic from its own type-side
// parse or lowering … keeps that diagnostic and draws no text refusal")
// pre-empts the text stage once the field loop refuses the stranded entry. That
// is an ADDED diagnostic displacing a later stage, which is the shape §Fix
// "What must not move" permits ("Any cell the fix flips is flipped by an ADDED
// diagnostic and stated at the cell") — the rows still refuse and still
// withhold the frontmatter.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:109 §"Inline object types" — the inline
//     `Field` reuses the object-schema `Field` form in any `Type` position and
//     at any nesting depth.
//   - docs/spec_topics/schemas.md:17 — "Field names are identifiers; field
//     types are any expression from the Type System grammar".
//   - docs/reference/grammar.md:225 —
//     `ObjectType ::= "{" Field ("," Field)* ","? "}"`, which derives no entry
//     without a `Field`.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:99
//     (`theta/parse/malformed-schema-field`, whose Trigger the fix rewrites in
//     the same commit — DIAG-2 — to TWO exclusions, stating the
//     missing-separator resync that carries the entry walk onto the stranded
//     entry in place of this class's exclusion), :107
//     (`theta/parse/annotation-type-not-expression`, bug 0252's narrowed
//     decline, group (D)'s subject), :59 (`theta/parse/let-rhs-type-mismatch`,
//     row b6's second line).
//   - docs/spec_topics/diagnostics/code-registry-load.md:19
//     (`theta/load/params-type-not-expression`, the code the UNWRAPPED interior
//     draws at `params:` and the precedence rule the three flips cite).
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md) — the *Message*
//     column is normative and a test MUST source it from the registry. No
//     message prose is written out below; every expected string is read through
//     `parseRegistry` / `registryMessage`, so a reworded template reds by naming
//     the registry.
//
// THE LEDGER — 48 diagnostic-list cells, 21 lowering cells, 12 recogniser
// observables and 2 textual-lowerer observables, in seven groups plus the
// inventory. The RED/GREEN split at HEAD `53cd0d86` (0.240.0):
//   - (A) §Reproduction (a) rows a1–a6: RED at a1 (reports `[]` and lowers the
//     permissive fragment) and at a5 (reports the load row, not the parse row);
//     GREEN at a2, a3, a4, a6 — §Fix "What must not move".
//   - (B) §Reproduction (b), twelve `Type` positions × two columns: RED at all
//     12 subject cells; GREEN at all 12 control cells, which are the proof the
//     refusal reaches each position at all and which §Fix forbids moving.
//   - (C) §Reproduction (c)'s thirteen spellings: RED at all 13 diagnostic
//     cells and all 13 lowering cells.
//   - (D) §Reproduction (d)'s six direct recogniser calls: GREEN at all 12
//     observables — §Fix "What must not move" lists d5 and d6, and d1–d4 are
//     the mechanism the fix routes AROUND rather than through (the emission
//     site is the parser loop, not the recogniser).
//   - (E) §Reproduction (e) rows e1–e3: RED, all three (code flip).
//   - (F) §Reproduction (f) rows f1 and f2: GREEN, the two landed neighbour
//     classes (bug 0238's stray-close tolerance, bug 0251's generic-argument
//     non-projection) that bound the fix from the other side.
//   - The textual-lowerer fence: GREEN, both cells.
//   - (L) the inventory arithmetic, recomputed from the tables.
//
// §REPRODUCTION (g), THE CORPUS CENSUS, IS NOT RE-PROBED HERE. The claim is
// that no committed `.theta` / `.thetalib` carries a carrier of this class, so
// a fix newly refuses no shipped source. That claim is discharged corpus-wide
// by `tests/committed-fixture-parse-gate.test.ts`, which parses every committed
// fixture the repository ships (AGENTS.md §"No silent skipping"); re-walking
// `git ls-files` from this file would duplicate that gate with a weaker,
// scratch-probe version of it.
//
// ORDERING IS PART OF THE ASSERTION. Every diagnostic cell is an ordered
// whole-list `toEqual` over the UNFILTERED `doc.diagnostics`, and every group
// is asserted as ONE whole-map equality, so neither an extra diagnostic, nor a
// right diagnostic in a wrong order, nor a divergence in a later cell can hide
// behind an earlier cell's failure.
//
// TIER: unit, offline, deterministic, provider-free — the tier this repository
// puts a parse-time claim in. Every observable settles inside one
// `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts), one read of the settled document's own frontmatter
// object, or one direct call into a shipped pure function. An integration tier
// would add a session round-trip to a parse-time value and a live tier would
// make a determined value stochastic; neither buys reach for this claim. §Fix's
// live clause — owed because the route changes a REGISTRATION outcome at the
// `params:` position — is discharged separately by
// tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts.
//
// ANTI-VACUITY / NO SILENT SKIPPING: nothing here early-returns, branches on
// the environment or conditionally skips. The registry lookup THROWS naming the
// missing row, so a reworded or absent Message row reds by naming the registry
// rather than by comparing against `undefined`. Group (L) recomputes the
// declared inventory from the tables themselves and re-checks the property that
// makes each subject a subject, so a row dropped or edited flat reds there
// rather than shrinking a group unnoticed.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
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
 * A registry row's normative *Message* template (DIAG-4), read rather than
 * restated. THROWS, naming the missing row, so a missing row can never degrade
 * an assertion below into a comparison against `undefined` and can never be
 * silently replaced by a hard-coded string. Called only from inside a test
 * body: at module scope a throw would abort collection and take the green
 * fences down with it.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. Bug 0256's §Fix carries the ` +
        `theta/parse/malformed-schema-field Trigger rewrite in the same commit as the site it ` +
        `is raised from (docs/spec_topics/diagnostics/code-registry-parse.md:99)`,
    );
  }
  return template;
}

const MALFORMED_FIELD = "theta/parse/malformed-schema-field";
const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

/** The refusal §Fix reuses for the stranded entry (code-registry-parse.md:99). */
const MALF: Exp = { severity: "error", code: MALFORMED_FIELD, fills: [] };

/** The `params:` load-stage refusal the UNWRAPPED interior draws today. */
function PARAMS_NOT_EXPR_OF(param: string): Exp {
  return { severity: "error", code: PARAMS_NOT_EXPR, fills: [["<param>", param]] };
}

/** TYPE-8's mismatch at the `let` position, row b6's second line. */
function LETRHS(name: string, expected: string, actual: string): Exp {
  return {
    severity: "error",
    code: LET_RHS_MISMATCH,
    fills: [
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ],
  };
}

/** One rendered diagnostic, in the shape `diagLines` produces. */
function render(exp: Exp): string {
  const template = registryMessageOf(exp.code);
  let out = template;
  for (const [slot, value] of exp.fills) {
    expect(
      template,
      `DIAG-4: the ${exp.code} row's Message must still carry the ${slot} slot this file ` +
        `renders; observed template ${JSON.stringify(template)}`,
    ).toContain(slot);
    out = out.replaceAll(slot, value);
  }
  return `${exp.severity} ${exp.code}: ${out}`;
}

function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}

// ===========================================================================
// Parse harness. `parseDoc` (tests/helpers/e2e-s1.ts) is the shipped whole-file
// entry point `parseThetaDocument` wrapped in the standard inert deps — an
// in-band no-op system-note channel and a resolving `model:` matcher. No
// behaviour is stubbed: the lexer, the parser, the frontmatter reader and the
// lowerers under assertion are the production ones.
// ===========================================================================

/** Frontmatter for every `.theta` body row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: subagent\n---\n";

/** A `mode: subagent` theta whose body is `stmt`. */
function theta(stmt: string): string {
  return `${FM}${stmt}\n`;
}

/**
 * §Reproduction's verbatim `params:` fixture: a whole theta whose one `params:`
 * field carries the type under test as a single-quoted YAML scalar, so the
 * scalar the frontmatter reader delivers is that text verbatim. No type
 * measured here spells a `'`, which group (L) recomputes.
 */
function paramsSrc(type: string): string {
  return `---\nmode: subagent\nparams:\n  p: '${type}'\n---\n1\n`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "test.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(type: string): string {
  return JSON.stringify(parseDoc(paramsSrc(type)).frontmatter?.params?.loweredSchema ?? null);
}

/** One diagnostic-list cell. */
interface Cell {
  readonly cell: string;
  readonly src: string;
  readonly path?: string | undefined;
  readonly expected: readonly Exp[];
}

/**
 * One group's cells asserted as a whole-map equality: separate assertions would
 * stop at the first divergence and hide the rest, and the subject-versus-control
 * agreement claims are only meaningful against whole lists compared together.
 */
function expectGroup(cells: readonly Cell[], why: string): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const c of cells) {
    const key = `${c.cell} :: ${c.src}`;
    actual[key] = lines(c.src, c.path ?? "test.theta");
    expected[key] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}

// ===========================================================================
// The fixtures, named once — §Reproduction (a) and (b) share them.
// ===========================================================================

/** THE SUBJECT interior: a colon-present junk tail stranding a keyless entry. */
const STRANDED = "{a: b c, d e}";
/** THE SUBJECT: the same interior wrapped in a generic argument. */
const SUBJECT = `array<${STRANDED}>`;
/**
 * THE BYTE-NEIGHBOUR CONTROL: the same interior one keystroke earlier, whose
 * first entry's type capture ends AT the separator, so the loop visits `d e`
 * and bug 0244's refusal reaches it. The pair differs by the junk tail alone.
 */
const CONTROL_INTERIOR = "{a: b, d e}";
const CONTROL = `array<${CONTROL_INTERIOR}>`;

/** The permissive fragment a stranded `params:` field hands the provider today. */
const PERMISSIVE_P =
  '{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}';

// ===========================================================================
// (A) THE SUBJECT, ITS CONTROL AND THE CLASS BOUNDARY AT `params:` —
// §Reproduction (a). Each row is a whole theta whose one `params:` field is
// `p: '<T>'`.
// ===========================================================================

/** §Reproduction (a) rows a1–a6, with the post-fix list each row carries. */
const A_ROWS: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
  // a1 — THE SUBJECT. RED at HEAD: `[]`, registers, lowers PERMISSIVE.
  // §Expected behaviour 1 and 4.
  ["a1 the subject", SUBJECT, [MALF]],
  // a2 — the sharp pair's other half, GREEN at HEAD: the two interiors differ
  // by the junk tail alone and only the one that strands the entry registers.
  ["a2 control, no junk tail", CONTROL, [MALF]],
  // a3 — GREEN at HEAD. No keyless entry stands behind the junk tail, so there
  // is nothing stranded and nothing to refuse; the colon-present entry `a: b c`
  // keeps its own verdict (bug 0252's class, §Non-goals).
  ["a3 no keyless entry", "array<{a: b c}>", []],
  // a4 — GREEN at HEAD. Bug 0244's DELIVERED reach: with no junk tail ahead of
  // it, the loop visits `d e` and refuses it.
  ["a4 no junk tail, keyless alone", "array<{d e}>", [MALF]],
  // a5 — THE WRAPPER PAIR's other half, and a CODE FLIP. At HEAD the unwrapped
  // interior draws `theta/load/params-type-not-expression`, because
  // `annotationSourceIsNotTypeExpression` reaches its refusable-text sink for a
  // single enclosing brace group (group (D) d1). After the fix the field loop
  // has already refused the stranded entry, and the load row's own precedence
  // rule 1 (code-registry-load.md:19) keeps that error-severity type-side
  // diagnostic and draws no text refusal — so the cell reads the parse row
  // instead. The row still refuses and still withholds the frontmatter.
  ["a5 unwrapped subject", STRANDED, [MALF]],
  // a6 — GREEN at HEAD, and the discriminator for a5's flip: with no stranded
  // entry the loop refuses nothing, so the load row's text stage still runs and
  // the cell keeps its own code.
  ["a6 unwrapped, no keyless entry", "{a: b c}", [PARAMS_NOT_EXPR_OF("p")]],
];

describe("bug 0256 (A) — the subject, its byte-neighbour control and the class boundary at params:", () => {
  it("rows a1–a6, with a2, a3, a4 and a6 the no-move rows ", () => {
    expectGroup(
      A_ROWS.map(([id, type, expected]) => ({
        cell: `${id} ${type} `,
        src: paramsSrc(type),
        expected,
      })),
      "reference/grammar.md:225 derives no entry without a `Field` and schemas.md:17 admits no " +
        "field without a type, so an entry stranded behind the field loop's exit is refused " +
        "rather than dropped (§Expected behaviour 1, 2). A red at a1 reporting `[]` is bug " +
        "0256: `TypeParser.parseObject` (src/parser/type-grammar.ts) broke at the junk tail " +
        "`b c` and never visited `d e`, `inlineObjectFieldKeys` contributed no key for it, and " +
        "the document registered. A red at a5 reporting theta/load/params-type-not-expression " +
        "is the same silence one wrapper out — the fix must reach the interior through the " +
        "parser loop, so the load row's precedence rule 1 (code-registry-load.md:19) yields to " +
        "it. A red at a2, a3, a4 or a6 is a route moving a row §Fix \"What must not move\" pins",
    );
  });

  it("rows a1–a6: the wire half — no stranded carrier lowers a params: fragment ", () => {
    // §Expected behaviour 4: "No `params:` field lowers to the permissive `{}`
    // from this shape; an argument-accepting schema is not reachable from a
    // document with no diagnostic." At HEAD a1 lowers PERMISSIVE_P — the exact
    // bytes `theta/parse/empty-schema-body` exists to refuse when an author
    // writes `{}` directly. a3 keeps its fragment because it is not refused.
    expect(
      {
        a1: loweredParams(SUBJECT),
        a2: loweredParams(CONTROL),
        a3: loweredParams("array<{a: b c}>"),
        a4: loweredParams("array<{d e}>"),
        a5: loweredParams(STRANDED),
        a6: loweredParams("{a: b c}"),
      },
      "a red at a1 reporting the permissive fragment is the wire harm itself: a declared " +
        "`params:` contract reaching the provider as the accept-anything schema. A red at a3 " +
        "reporting `null` is the fix over-refusing an interior that strands nothing, which §Fix " +
        "\"What must not move\" forbids",
    ).toEqual({
      a1: "null",
      a2: "null",
      a3: '{"type":"object","properties":{"p":{"type":"array","items":{}}},"required":["p"],"additionalProperties":false}',
      a4: "null",
      a5: "null",
      a6: "null",
    });
  });
});

// ===========================================================================
// (B) THE SUBJECT AT TWELVE `Type` POSITIONS — §Reproduction (b), two columns.
// grammar.md:109 admits the inline `Field` in any `Type` position at any depth,
// so the disposition is the same at all twelve.
// ===========================================================================

/** §Reproduction (b)'s twelve `Type` positions, parameterised by the type text. */
function positionRows(type: string): ReadonlyArray<readonly [string, string, string | undefined]> {
  return [
    ["b1 fn parameter", theta(`fn f(p: ${type}): integer { 1 }`), undefined],
    ["b2 fn return", theta(`fn f(): ${type} { 1 }`), undefined],
    ["b3 schema body field", theta(`schema S { a: ${type} }`), undefined],
    ["b4 alias RHS", theta(`schema T = ${type}`), undefined],
    ["b5 let annotation union arm", theta(`let x: ${type} | null = null`), undefined],
    ["b6 let annotation", theta(`let x: ${type} = 1`), undefined],
    ["b7 @<T> annotation root", theta("let r = @<" + type + ">`hi`"), undefined],
    // b8 is b3 written in a `.thetalib`, which carries no frontmatter — the
    // path is what selects the library grammar, so it is passed explicitly.
    ["b8 .thetalib schema body field", `schema S { a: ${type} }\n`, "lib.thetalib"],
    ["b9 params: field", paramsSrc(type), undefined],
    ["b10 nested one level", theta(`schema S { a: { p: ${type} } }`), undefined],
    ["b11 generic argument", theta(`fn f(p: array<${type}>): integer { 1 }`), undefined],
    ["b12 union arm", theta(`schema S { a: ${type} | integer }`), undefined],
  ];
}

/**
 * b6's second line, at both columns. TYPE-8 compares the deferring nominal
 * against the initialiser `1` and renders the annotation text back to the
 * author normalised; that rendering is bug 0247's class and is NOT claimed by
 * bug 0256 (§Non-goals), so the cell pins the text as measured. The stranded
 * entry's refusal is rendered FIRST — the loop emits it as the entry is
 * stranded, ahead of the statement-level mismatch — which is the order the
 * control column already shows at HEAD.
 */
function letRowFor(type: string): readonly Exp[] {
  return [MALF, LETRHS("x", type, "integer")];
}

function positionCells(): Cell[] {
  const cells: Cell[] = [];
  for (const [id, src, path] of positionRows(SUBJECT)) {
    cells.push({
      cell: `${id} subject ${SUBJECT} `,
      src,
      path,
      expected: id === "b6 let annotation" ? letRowFor(SUBJECT) : [MALF],
    });
  }
  for (const [id, src, path] of positionRows(CONTROL)) {
    cells.push({
      cell: `${id} control ${CONTROL} `,
      src,
      path,
      expected: id === "b6 let annotation" ? letRowFor(CONTROL) : [MALF],
    });
  }
  return cells;
}

describe("bug 0256 (B) — the subject at twelve Type positions, params: and .thetalib included", () => {
  it("rows b1–b12 in two columns ", () => {
    expectGroup(
      positionCells(),
      "grammar.md:109 admits the inline `Field` in any `Type` position at any depth, so the " +
        "twelve positions agree (§Expected behaviour 1). A red on a SUBJECT cell reporting " +
        "`[]` is bug 0256 at that position: the generic wrapper removed the recogniser gate " +
        "there (`annotationSourceIsNotTypeExpression` declines brace-and-angle text that is " +
        "not a single enclosing brace group — group (D) d2), and the parser loop never visited " +
        "the entry. A red at the b6 SUBJECT cell reporting the mismatch ALONE is the same " +
        "silence surviving beside a diagnostic another rule drew. The twelve CONTROL cells are " +
        "GREEN at HEAD and must stay GREEN: the agreement is reached by ADDING the subject's " +
        "refusal, never by removing the control's",
    );
  });
});

// ===========================================================================
// (C) THE CLASS'S SPELLINGS, AND THE WELL-FORMED SIBLING LOST WITH THE JUNK —
// §Reproduction (c). All thirteen are `params:` rows.
// ===========================================================================

/**
 * §Reproduction (c)'s thirteen spellings. Each strands exactly ONE keyless
 * entry behind the loop's exit, so each draws exactly one refusal (bug 0129's
 * count-consequence law, code-registry-parse.md:104) and withholds the
 * frontmatter. Every one of them reports `[]` at HEAD.
 */
const C_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["c1", SUBJECT],
  // c2–c5 are the keyless spellings bug 0244 refuses when the loop REACHES
  // them (a reserved keyword, a capitalised name, a repeat, a quoted key);
  // stranded, each draws nothing at HEAD.
  ["c2", "array<{a: b c, void}>"],
  ["c3", "array<{a: b c, Zs}>"],
  ["c4", "array<{a: b c, a}>"],
  ["c5", 'array<{a: b c, "q"}>'],
  ["c6", "array<{a: b c, {}}>"],
  // c7 — the stranding junk tail need not be a bare name: a primitive with a
  // trailing token strands the same way.
  ["c7", "array<{a: integer x, d e}>"],
  // c8, c9 — THE STARVATION FACE (§Why it matters): the declared field `m`
  // reaches neither the lowering nor any rule, in either source order.
  ["c8", "array<{a: b c, d e, m: integer}>"],
  ["c9", "array<{m: integer, a: b c, d e}>"],
  // c10 depth 2, c11 a doubled generic, c12 a two-argument generic, c13 a union
  // arm over the wrapped type — the four shapes §Fix "Reach" names explicitly.
  ["c10", "array<{n: {a: b c, d e}}>"],
  ["c11", "array<array<{a: b c, d e}>>"],
  ["c12", "map<string, {a: b c, d e}>"],
  ["c13", "array<{a: b c, d e}> | null"],
];

describe("bug 0256 (C) — the class's thirteen spellings refuse, and none lowers a params: fragment", () => {
  it("rows c1–c13: one refusal each ", () => {
    expectGroup(
      C_ROWS.map(([id, type]) => ({ cell: `${id} ${type} `, src: paramsSrc(type), expected: [MALF] })),
      "§Expected behaviour 1 and 3: every carrier of the class carries at least one " +
        "error-severity diagnostic, and one line per stranded entry (bug 0129's " +
        "count-consequence law, code-registry-parse.md:104) with no second on an entry another " +
        "row already refused. A red reporting `[]` is bug 0256; a red reporting TWO refusals on " +
        "a one-stranded-entry row is the count law broken in the other direction, which would " +
        "also mean the fix refused the colon-present entry `a: b c` that did the stranding — " +
        "bug 0252's locked class (§Non-goals)",
    );
  });

  it("rows c1–c13: none lowers, and c8/c9's declared field m is never dropped in silence ", () => {
    // §Expected behaviour 2 and 4. At HEAD every one of these lowers a fragment
    // and eleven of them lower PERMISSIVE_P outright — the accept-anything
    // schema. c8 and c9 are the sharpest: a well-formed `m: integer` declared
    // beside the junk reaches the provider as nothing at all, in either order.
    const actual: Record<string, string> = {};
    const expected: Record<string, string> = {};
    for (const [id, type] of C_ROWS) {
      actual[`${id} ${type}`] = loweredParams(type);
      expected[`${id} ${type}`] = "null";
    }
    expect(
      actual,
      `a red reporting the permissive fragment ${PERMISSIVE_P} is the wire harm: ` +
        "the field lowers to the schema that accepts every argument, from a document with no " +
        "diagnostic (§Expected behaviour 4). A red at c8 or c9 reporting a fragment carrying " +
        "`m` alone would be the other failure the report forbids — the junk silently dropped " +
        "and the declared sibling kept, with no line saying so",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (D) WHY THE WRAPPER REMOVES THE GATE — §Reproduction (d). Direct calls into
// the two shipped predicates, no document around them.
//
// GREEN at HEAD and after. §Fix "What must not move" pins d5 and d6, and the
// settled route's emission site is `TypeParser.parseObject`'s entry-separator
// read rather than the recogniser — so a red HERE is a route that widened bug
// 0252's deliberately narrowed decline (code-registry-parse.md:107) instead,
// which §Fix constraint 1 forbids without a fresh operator adjudication and
// without showing bug 0028's `RESULT-LET-BRACE` cell
// (tests/unresolved-annotation-lowering.test.ts) still green.
// ===========================================================================

/** §Reproduction (d)'s six texts, each measured through both predicates. */
const D_ROWS: ReadonlyArray<readonly [string, string, boolean, boolean]> = [
  // d1/d2 is THE MECHANISM: the wrapped text carries a brace and an angle
  // bracket and is not a single enclosing brace group, so the recogniser
  // returns `false` before the refusable-text sink runs.
  ["d1", STRANDED, true, true],
  ["d2", SUBJECT, false, false],
  ["d3", "{a: b c}", true, true],
  ["d4", "array<{a: b c}>", false, false],
  // d5/d6 are `false` for a DIFFERENT reason: the parser's own visited-entry
  // refusal already refuses those two rows (§(a) a2), so no gate is needed.
  ["d5", CONTROL_INTERIOR, false, true],
  ["d6", CONTROL, false, false],
];

describe("bug 0256 (D) — the recogniser declines the wrapped text before it judges it", () => {
  it("rows d1–d6: annotationSourceIsNotTypeExpression and isSingleEnclosingBraceGroup ", () => {
    const actual: Record<string, string> = {};
    const expected: Record<string, string> = {};
    for (const [id, text, notExpr, single] of D_ROWS) {
      actual[`${id} ${text}`] =
        `notTypeExpression=${String(annotationSourceIsNotTypeExpression(text))} ` +
        `singleEnclosingBraceGroup=${String(isSingleEnclosingBraceGroup(text))}`;
      expected[`${id} ${text}`] =
        `notTypeExpression=${String(notExpr)} singleEnclosingBraceGroup=${String(single)}`;
    }
    expect(
      actual,
      "these six cells are the mechanism, not the remedy: the wrapped carrier is admitted " +
        "because `isSingleEnclosingBraceGroup` (src/parser/params.ts) says `false` and " +
        "`annotationSourceIsNotTypeExpression` (src/parser/type-layer-checks.ts) returns before " +
        "consulting the refusable-text sink. A red here is a route through the RECOGNISER " +
        "rather than through the parser loop, which reopens the boundary bug 0252 settled at " +
        "0.225.0 (code-registry-parse.md:107) and which §Fix's emission-site constraint rules " +
        "out",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (E) UNION ARMS ARE NOT CARRIERS — §Reproduction (e).
//
// The shapes bug 0252's decline still covers: a brace group beside a top-level
// `|`, and an interior whose own field type supplies the angle bracket. Each
// reaches the refusable-text sink and is refused at HEAD as
// `theta/load/params-type-not-expression`.
//
// ALL THREE FLIP THEIR CODE, on the same authority as §(a) a5: each interior
// strands a keyless entry, so after the fix the field loop's refusal is an
// error-severity type-side diagnostic and the load row's own precedence rule 1
// (code-registry-load.md:19) keeps it and draws no text refusal. The rows still
// refuse and still withhold the frontmatter — §Fix "What must not move"'s
// requirement for §(e) is the DISPOSITION, and the flip is an ADDED diagnostic
// displacing a later stage, stated at the cell as §Fix requires.
// ===========================================================================

const E_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["e1", "{a: b c, d e} | integer"],
  ["e2", "{a: b c, d e} | null"],
  ["e3", "{q: array<integer>, a: b c, d e}"],
];

describe("bug 0256 (E) — the union-arm and angle-carrying shapes stay refused", () => {
  it("rows e1–e3 ", () => {
    expectGroup(
      E_ROWS.map(([id, type]) => ({ cell: `${id} ${type} `, src: paramsSrc(type), expected: [MALF] })),
      "the carrier class is the interior nested in a GENERIC ARGUMENT; these three are not " +
        "carriers and must stay refused whatever the fix does (§Fix \"What must not move\"). A " +
        "red reporting `[]` here is the fix having widened bug 0252's decline in the wrong " +
        "direction and lost a refusal the boundary already delivers; a red reporting " +
        "theta/load/params-type-not-expression is the parser loop NOT having refused the " +
        "stranded entry these three also spell, which is bug 0256 surviving one wrapper out",
    );
  });
});

// ===========================================================================
// (F) THE NEIGHBOURING LANDED CLASSES, RE-MEASURED — §Reproduction (f).
//
// GREEN at HEAD and after; §Fix "What must not move" lists both. f1 is bug
// 0238's shipped outcome (a keyless entry carrying a stray `>` keeps its silent
// tolerant registration and the fields beside it still lower) and bug 0251's
// surviving prompt carrier. f2 is bug 0251 *Residuals* item 2's measured row:
// the generic wrapper lowers permissively there too, by the same generic-arm
// non-hoist, WITHOUT this report's stranding — every entry of that interior is
// visited. These two are the fence proving the boundary did not move.
// ===========================================================================

/** Bug 0238's offender interior — the stray `>` closes nothing. */
const STRAY = "{a: integer, b > c, m: integer}";

const FRAG_A_M =
  '{"type":"object","properties":{"a":{"type":"integer"},"m":{"type":"integer"}},' +
  '"required":["a","m"],"additionalProperties":false}';
const F1_LOWERED =
  '{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_6ab13cdeb4b48b5a"}},' +
  '"required":["p"],"additionalProperties":false,' +
  `"$defs":{"__inline_6ab13cdeb4b48b5a":${FRAG_A_M}}}`;

describe("bug 0256 (F) — bug 0238's and bug 0251's landed classes are unmoved", () => {
  it("rows f1 and f2: diagnostics ", () => {
    expectGroup(
      [
        { cell: `f1 stray close token ${STRAY} `, src: paramsSrc(STRAY), expected: [] },
        {
          cell: `f2 the same interior wrapped array<${STRAY}> `,
          src: paramsSrc(`array<${STRAY}>`),
          expected: [],
        },
      ],
      "bug 0238's §Fix promises this interior REGISTERS at `params:` with the keyless entry " +
        "dropped, and bug 0251 *Residuals* item 2 measures the wrapped spelling lowering " +
        "permissively without any stranding. Neither is bug 0256's class: every entry here is " +
        "VISITED by the field loop. A red reporting theta/parse/malformed-schema-field is the " +
        "fix having widened past the stranded entry into bug 0238's stray-close class, which " +
        "§Fix \"What must not move\" and §Non-goals both forbid",
    );
  });

  it("rows f1 and f2: lowerings ", () => {
    expect(
      { f1: loweredParams(STRAY), f2: loweredParams(`array<${STRAY}>`) },
      "a red at f1 reporting `null` withdraws the registration bug 0238's §Fix promises; a red " +
        "at f2 reporting anything but the permissive fragment moves bug 0251 *Residuals* item " +
        "2's measured row, which is that report's business and not this one's",
    ).toEqual({ f1: F1_LOWERED, f2: PERMISSIVE_P });
  });
});

// ===========================================================================
// THE TEXTUAL LOWERER — the other fence §Fix's "Witness" clause names.
//
// `lowerQueryResponseSchema` (src/runtime/query-schema-lowering.ts) is handed an
// annotation string with no document around it, so no parse-time refusal gates
// it: these two cells record the raw bytes and are the proof this harness
// reaches the lowerer at all. The refusal §Expected behaviour 4 asks for is
// delivered at the DOCUMENT — by groups (A), (B), (C) and (E) — before those
// bytes matter, so both cells stay `{}` and a red here is a route that changed
// the lowerer's field division instead of refusing the document.
// ===========================================================================

describe("bug 0256 — the textual lowerer's bytes are unmoved by the document-level refusal", () => {
  it("the subject and its control both still lower `{}` through lowerQueryResponseSchema ", () => {
    expect(
      {
        subject: JSON.stringify(lowerQueryResponseSchema(SUBJECT, [], []) ?? null),
        control: JSON.stringify(lowerQueryResponseSchema(CONTROL, [], []) ?? null),
      },
      "`lowerTypeExpr`'s generic arm hoists no argument (bug 0251 *Residuals* item 2), so the " +
        "whole type lowers to `{}` at both columns and has done since before this class was " +
        "filed. The fix refuses the DOCUMENT rather than changing this lowering; a red here is " +
        "a route that moved the lowerer's field division, which §Fix's emission-site constraint " +
        "rules out",
    ).toEqual({ subject: "{}", control: "{}" });
  });
});

// ===========================================================================
// (L) ANTI-VACUITY — the inventory arithmetic, recomputed from the tables, and
// the property that makes each subject a subject.
// ===========================================================================

/** The LEDGER's own numbers, recomputed below from the tables that produce them. */
const TOTAL_LIST_CELLS = 48;
const TOTAL_LOWERING_CELLS = 21;
const TOTAL_RECOGNISER_OBSERVABLES = 12;
const TOTAL_TEXTUAL_LOWERER_OBSERVABLES = 2;

describe("bug 0256 (L) — the inventory this file asserts", () => {
  it("the tables carry the declared counts, and no fixture lost the property that makes it a subject ", () => {
    expect(
      {
        listCells: A_ROWS.length + positionCells().length + C_ROWS.length + E_ROWS.length + 2,
        loweringCells: A_ROWS.length + C_ROWS.length + 2,
        recogniserObservables: D_ROWS.length * 2,
        textualLowererObservables: 2,
      },
      "the declared LEDGER must match the tables; a red here is a row dropped from a table, " +
        "which would shrink a group unnoticed",
    ).toEqual({
      listCells: TOTAL_LIST_CELLS,
      loweringCells: TOTAL_LOWERING_CELLS,
      recogniserObservables: TOTAL_RECOGNISER_OBSERVABLES,
      textualLowererObservables: TOTAL_TEXTUAL_LOWERER_OBSERVABLES,
    });

    // Every §(c) subject must still SPELL the stranding shape: a colon-present
    // entry whose type text is followed by a junk tail, with at least one
    // further entry behind it. The mechanical proxy is that the interior
    // carries the junk tail `b c` (or c7's typed `integer x`) AND a following
    // comma inside the braces. A fixture edited flat would pass for the wrong
    // reason — it would be bug 0244's already-delivered reach, not this class.
    const stranding = C_ROWS.filter(([, type]) => /(: b c|: integer x),/.test(type));
    expect(
      stranding.length,
      "every §Reproduction (c) row must strand an entry behind a junk tail; a row that lost " +
        "the tail is bug 0244's delivered reach (§(a) a4) and locks nothing here",
    ).toBe(C_ROWS.length);

    // Every §(c) subject must also stand inside a GENERIC ARGUMENT — the one
    // enclosure that removes the recogniser gate (§(d), §(e)). A subject
    // flattened to the bare interior would be refused by
    // `annotationSourceIsNotTypeExpression` at HEAD and would be green for the
    // wrong reason.
    expect(
      C_ROWS.filter(([, type]) => type.includes("<") && type.includes(">")).length,
      "every §Reproduction (c) row must wrap its interior in a generic argument, or the " +
        "recogniser gate bug 0252 narrowed still backstops it and the row measures §(e)'s " +
        "class instead of this one",
    ).toBe(C_ROWS.length);

    // No subject may carry a depth-0 stray close token: that is bug 0238's
    // class and group (F)'s fence, not this file's subject.
    expect(
      [...C_ROWS.map(([, t]) => t), SUBJECT, CONTROL].filter((t) => / > /.test(t)).length,
      "no subject may spell a stray close token; bug 0238 owns that class and §Non-goals " +
        "excludes it from this report",
    ).toBe(0);

    expect(
      new Set(C_ROWS.map(([, t]) => t)).size,
      "the thirteen spellings must all be distinct, or a cell is silently overwritten inside " +
        "the group's map",
    ).toBe(C_ROWS.length);

    expect(
      [
        ...A_ROWS.map(([, t]) => t),
        ...C_ROWS.map(([, t]) => t),
        ...E_ROWS.map(([, t]) => t),
        SUBJECT,
        CONTROL,
        STRAY,
      ].filter((t) => t.includes("'")).length,
      "no fixture may spell a `'`, or the single-quoted YAML scalar in `paramsSrc` would stop " +
        "delivering the type text verbatim",
    ).toBe(0);
  });
});
