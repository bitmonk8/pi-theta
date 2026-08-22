import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0233 — `walkType`'s `object` arm gates its whole raw-key loop on
// `!insideGenericArgument`, so every non-`Ident` inline-object field key
// reached through a generic type argument is unjudged as a class, while the
// two rules at the same arm that carry no such gate DO fire there
// (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md). This
// file is that report's §Fix (d) fresh witness.
//
// THE MECHANISM. `walkType` (src/parser/type-grammar.ts:1000) carries an
// `insideGenericArgument` parameter (:1001). The `generic` arm descends into
// every type argument with that flag hard-set to `true`:
//
//     walkType(arg, false, position, rules, site, true, out);
//
// (src/parser/type-grammar.ts:1051.) The `object` arm (:1055) then runs six
// rules, in two regimes:
//   * UNGATED by the flag — the empty-interior rule (:1062,
//     `emptySchemaBodyDiagnostic("{}", site)`) and bug 0154's identifier pass
//     over `TypeNode.fieldNames`, gated on `node.closingBraceSpelled` alone
//     (:1086); the pass's own comment states why it is deliberately not
//     withheld;
//   * GATED by the flag — the whole raw-key loop over
//     `inlineObjectFieldKeys(node.interiorSource)` (:1123), entered at
//
//         if (!insideGenericArgument && node.closingBraceSpelled) {
//
//     (src/parser/type-grammar.ts:1122), holding all four raw-key rows:
//     `theta/parse/duplicate-inline-field-name` (:1147),
//     `theta/parse/quoted-inline-field-name` (:1165),
//     `theta/parse/renamed-inline-field-name` (:1202) and
//     `theta/parse/inline-field-name-not-identifier` (:1225).
// The field and union descents propagate the INCOMING flag unchanged (:1234,
// :1240), which is why the carve-out reaches every depth beneath the argument
// and why an inner generic argument establishes it for an outer object that is
// itself outside one. (Absolute line numbers here are bug 0134's do-not-chase
// class; the quoted text is the anchor. They were re-derived against the tree
// this file was written against, and differ from the bug document's own
// citations, which were taken at 4c157bcc — e.g. the raw-key gate the document
// cites as `:1057` is `:1122` here.)
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES (settled by the parent run inside §Fix (a)'s
// constraints, and premeasured against an experimental application of it)
// =====================================================================
// §Fix (a) ROUTE 1 — WIDEN. `!insideGenericArgument` is dropped from the
// raw-key gate, leaving the closing-brace gate alone, so all six rules at the
// arm answer alike at every depth (the parameter then has no reader and is
// removed entirely). Consequences this file pins rather than leaves to be
// discovered:
//   * one disposition per SPELLING: group (a)'s two columns become identical
//     row for row, which is what §Expected behaviour's "the same disposition
//     their bare spellings have (§Reproduction (e))" says, and group (e) holds
//     the bare halves of that agreement at three positions;
//   * one disposition per POSITION and per DEPTH: groups (b) and (c), §Fix (c);
//   * one diagnostic per offending key, in source order: group (c)'s c8;
//   * the identifier pass and the raw-key rows COEXIST on two DIFFERENT fields
//     of one interior: group (c)'s c10, which §Fix (a) route 1's last sentence
//     requires be measured before it is claimed (bug 0129's count-consequence
//     law, code-registry-parse.md:101, is scoped to "that field");
//   * NO property name is minted inside a generic argument by this route:
//     group (d) is the lowering tripwire.
//
// EVERY EXPECTATION BELOW IS THE SPECIFIED BEHAVIOUR, NOT THE CURRENT ONE. The
// AFTER values were measured against an experimental application of route 1
// (the tree was then restored byte-exact, `git hash-object` against
// `git rev-parse HEAD:src/parser/type-grammar.ts`).
//
// THREE PLACES WHERE THE BUG DOCUMENT IS WRONG AT HEAD, encoded here in the
// MEASURED form and commented at the cell:
//   1. §Fix (d) says "every cell of §Reproduction (d) holds byte-for-byte after
//      the fix". True of d1–d6 and d9; FALSE of d7 and d8 — see group (d).
//   2. §Reproduction (f) row f2 records `theta/parse/generic-arity-mismatch` at
//      0.183.0; at this tree it measures `[]` — see group (f).
//   3. §Expected behaviour says row f3 "keeps its silence, which the
//      closing-brace gate owns"; measured, that attribution is wrong for this
//      fixture — see group (f).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:109 — §"Inline object types": `ObjectType`
//     admits an anonymous object type "in any `Type` position", its fields
//     reuse the object-schema `Field` form and carry the same field semantics,
//     and `array<{ ... }>` parses. The same paragraph states the generic
//     exception for the DUPLICATE rule alone, which route 1 falsifies.
//   - docs/spec_topics/grammar.md:105 — a bare `Type` appears in generic type
//     arguments and union arms; :99–:100 — the `array` / `Result` forms;
//     :101 — `ObjectType ::= "{" Field ("," Field)* ","? "}"`.
//   - docs/spec_topics/schemas.md:17 — field names are identifiers;
//     docs/spec_topics/lexical.md:13 — `Ident` is `[A-Za-z_][A-Za-z0-9_]*`;
//     :16 — the lowercase-first rule over schema field names (group (a)'s a9,
//     group (c)'s c9/c10 attribution controls).
//   - docs/spec_topics/type-system.md:15 — ONE type grammar in every
//     type-annotation position, which is why group (b) asserts eight of them.
//   - docs/spec_topics/schema-subset.md:9, :77 — `array<T>` lowers to
//     `{ "type": "array", "items": <T-lowered> }`; group (d) is where that
//     lowering is pinned unmoved.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:98, :99, :100, :101 —
//     the four raw-key rows. Each *Trigger* states its reach as "any `Type`
//     position and any nesting depth reachable through inline object fields and
//     union arms" AND the generic carve-out route 1 removes; :101 also fixes
//     the precedence this file relies on — repeat first, quote-led second,
//     rename third, non-identifier fourth. :19 is
//     `theta/parse/binding-case-mismatch` and :97 `theta/parse/empty-schema-body`,
//     the two rows that already fire inside a generic argument.
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md) — the *Message*
//     column is normative and tests MUST source it from the registry. No
//     message prose is written out below; every expected string is read through
//     `parseRegistry` / `registryMessage`, so a reworded template reds by
//     naming the registry.
//
// THE LEDGER — what each group pins, and which cells are RED at HEAD:
//   - (A) THE SIX RULES AT ONE ARM, BARE versus INSIDE `array<…>`, at the
//     `schema` body field position: 22 cells (11 interiors × 2 columns). The 8
//     GENERIC-column cells of rows a1–a8 are RED (each an expected refusal
//     against an actual `[]`); the 8 bare cells of those rows and all 6 cells of
//     rows a9/a10/a11 are GREEN now and after — a9 and a10 are the ATTRIBUTION
//     controls (two of six rules already answer inside the carve-out) and a11
//     is the NO-MOVE control.
//   - (B) THE CLASS AT EIGHT `Type` POSITIONS, `.thetalib` and `params:`
//     included: 8 cells, ALL RED — b1–b7 report `[]` at HEAD and b8 reports its
//     position's own RHS gate alone.
//   - (C) REACH AND MULTIPLICITY, every depth beneath a generic argument and
//     both directions of nesting: 10 cells, of which c1–c8 and c10 are RED
//     (c7 and c10 short by one line at HEAD, the rest `[]`) and c9 is GREEN now
//     and after.
//   - (D) THE LOWERING TRIPWIRES, §Reproduction (d): d1–d6 and d9 GREEN now and
//     after (no route here mints a property name inside a generic argument);
//     d7 and d8 RED, in their MEASURED after-form, not the document's.
//   - (E) THE BARE-SPELLING CONTROLS of §Reproduction (e) at the `fn`
//     parameter, `schema` body field and `params:` positions: 33 cells, ALL
//     GREEN now and after. They are the half of §Expected behaviour's
//     "one disposition per spelling" agreement that must not move, and the
//     `params:` lowering half is asserted beside them.
//   - (F) BOUNDS: f1 GREEN now and after; f2 and f3 RED, both in their MEASURED
//     after-form with the document's divergence named at the cell.
//   - (G) THE CORPUS: no cell. `git ls-files -- '*.theta' '*.thetalib'` is 34
//     files and `git grep -nE '(array|Result)<[^>]*\{'` over them returns zero
//     hits (§Reproduction (g)), so route 1 moves no committed source. That
//     claim's discharge in this repository is
//     `tests/committed-fixture-parse-gate.test.ts`, the corpus-wide gate over
//     every shipped `.theta` / `.thetalib` (AGENTS.md), NOT a shell-out from
//     here; this file adds none.
//
// ORDERING IS PART OF THE ASSERTION. Every diagnostic cell is an ordered
// whole-list `toEqual` over the UNFILTERED `doc.diagnostics`, so neither an
// extra diagnostic nor a right diagnostic in a wrong order can hide inside a
// containment check. Three orders are load-bearing and measured, not assumed:
// c7's `result-in-schema-position` precedes the key rule; c10's
// `binding-case-mismatch` (the identifier pass over `fieldNames`, emitted at
// :1086) precedes the raw-key line (the loop at :1123); and c8's two refusals
// are in SOURCE order.
//
// TIER: unit, offline, deterministic, provider-free — the tier this repository
// puts this kind of claim in, and the tier above buys no reach: every
// observable settles inside one `parseThetaDocument` call over a source string
// (`parseDoc`, tests/helpers/e2e-s1.ts, the shipped load path behind the
// standard inert `parseDeps` double), one read of the settled document's own
// frontmatter object, or one direct lowerer call (`lowerQueryResponseSchema`,
// src/runtime/query-schema-lowering.ts:153 — the call
// src/extension/production-theta-producer.ts:2672 makes). An integration tier
// would add a session round-trip to a parse-time value; a live tier would make
// a fully determined value stochastic. The live-axis cells this bug also earns
// (registration refusal through the shipped composition root, and through the
// real `pi -p` binary) live in
// `tests/live/generic-argument-inline-field-key-live-cell.test.ts` and
// `tests/live/acceptance/generic-argument-inline-field-key-load-refusal.test.ts`.
//
// ANTI-VACUITY / NO SILENT SKIPPING: nothing here early-returns, branches on
// the environment or conditionally skips. The registry lookup asserts its row's
// presence before the template is used, so a missing row reds by naming the
// registry. 70 of the 76 diagnostic-list cells expect a NON-EMPTY ordered list,
// so a harness that stopped reaching the parser fails loudly here rather than
// turning empty expectations into silent passes, and group (L) recomputes the
// declared inventory arithmetic from the cell tables themselves.

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
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row or a reworded template reds by naming the registry rather than
 * by a bare `undefined` comparison.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
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

const NOT_IDENT = "theta/parse/inline-field-name-not-identifier";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const EMPTY_BODY = "theta/parse/empty-schema-body";
const RESULT_IN_SCHEMA = "theta/parse/result-in-schema-position";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

/** Bug 0228's raw-key row (code-registry-parse.md:101), fourth in precedence. */
function NOTIDENT(field: string): Exp {
  return { severity: "error", code: NOT_IDENT, fills: [["<field>", field]] };
}
/** Bug 0176's row (:99), second in precedence. */
function QUOTED(field: string): Exp {
  return { severity: "error", code: QUOTED_INLINE, fills: [["<field>", field]] };
}
/** Bug 0052's row (:98), FIRST in precedence. */
function DUP(field: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", field]] };
}
/** Bug 0160's row (:100), third in precedence; renders the theta-side identifier. */
function RENAMED(field: string): Exp {
  return { severity: "error", code: RENAMED_INLINE, fills: [["<field>", field]] };
}
/** Bug 0154's identifier pass — one of the two rules that already fires inside. */
const CASE: Exp = { severity: "error", code: BINDING_CASE, fills: [] };
/** The empty-interior rule — the other rule that already fires inside. */
function EMPTY(subject: string): Exp {
  return { severity: "error", code: EMPTY_BODY, fills: [["<X>", subject]] };
}
/** The `Result`-in-schema-position row — c7's own position rule, §Non-goals. */
const RESULTPOS: Exp = { severity: "error", code: RESULT_IN_SCHEMA, fills: [] };
/** The `let` RHS gate — b8's own position rule, §Non-goals. */
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
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
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

function theta(stmt: string): string {
  return `${FM}${stmt}\n`;
}

/** A `mode: subagent` theta whose `params:` block is `block` (the key on line 4). */
function paramsSrc(block: string): string {
  return `---\nmode: subagent\nparams:\n${block}\n---\n1\n`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "test.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(src: string): string {
  return JSON.stringify(parseDoc(src).frontmatter?.params?.loweredSchema ?? null);
}

/** One diagnostic-list cell. */
interface Cell {
  readonly cell: string;
  readonly src: string;
  readonly path?: string;
  readonly expected: readonly Exp[];
}

/**
 * One group's cells asserted as a whole-map equality: separate assertions would
 * stop at the first divergence and hide the rest, and the per-position /
 * per-depth / bare-versus-generic agreement claims are only meaningful against
 * whole lists compared together.
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
// The eleven interiors of §Reproduction (a). The table keys are the bug
// document's own row ids (a1…a11) — doc anchors, not cell numbers.
// ===========================================================================

const INTERIORS: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
  // a1–a8: the withheld class, one per key-rule family.
  ["a1", "{a b: integer}", [NOTIDENT("a b")]],
  ["a2", '{ "a": integer }', [QUOTED('"a"')]],
  ["a3", "{ a: integer, a: string }", [DUP("a")]],
  ["a4", '{ a as "w": integer }', [RENAMED("a")]],
  ["a5", "{ 3: string }", [NOTIDENT("3")]],
  ["a6", "{ éLan: string }", [NOTIDENT("éLan")]],
  ["a7", "{ Élan: string }", [NOTIDENT("Élan")]],
  ["a8", "{ *Lan: string }", [NOTIDENT("*Lan")]],
  // a9/a10: THE ATTRIBUTION CONTROLS — the two rules at this arm that carry no
  // generic gate. They fire inside the carve-out TODAY, which is what proves
  // the walk reaches the arm at all, and route 1 does not touch them.
  ["a9", "{ Elan: string }", [CASE]],
  ["a10", "{}", [EMPTY("{}")]],
  // a11: THE NO-MOVE CONTROL — a conformant interior is silent in both columns.
  ["a11", "{ a: integer }", []],
];

/**
 * (A) The six rules at one arm, bare versus inside one generic argument, at the
 * same `schema` body field position.
 *
 * The specified list is IDENTICAL per row across the two columns: that identity
 * IS §Expected behaviour's first statement ("one disposition each, and it is the
 * same disposition their bare spellings have"). RED at HEAD in the GENERIC
 * column of a1–a8, each of which measures `[]`.
 */
function columnCells(): Cell[] {
  const cells: Cell[] = [];
  for (const [id, interior, expected] of INTERIORS) {
    cells.push({
      cell: `${id} bare`,
      src: theta(`schema S { a: ${interior} }`),
      expected,
    });
    cells.push({
      cell: `${id} inside array<…>`,
      src: theta(`schema S { a: array<${interior}> }`),
      expected,
    });
  }
  return cells;
}

/**
 * (B) The class at the eight `Type` positions of §Reproduction (b), on the one
 * fixture `array<{a b: integer}>`.
 *
 * §Fix (c): the disposition holds at EVERY `Type` position, `params:` and the
 * `.thetalib` spelling included. RED at HEAD: b1–b7 measure `[]` and b8
 * measures its position's own RHS gate ALONE.
 *
 * b8 is the one row where a second line stands beside the key refusal, and its
 * order is measured, not assumed: the RHS gate answers the `= 1` initialiser
 * and renders the author's interior back verbatim inside its own message. That
 * gate is §Non-goals and does not move; what route 1 adds is the key line
 * BEFORE it.
 */
const GENERIC_FIXTURE = "array<{a b: integer}>";

function positionCells(): Cell[] {
  const key: readonly Exp[] = [NOTIDENT("a b")];
  return [
    { cell: "b1 fn parameter", src: theta(`fn f(p: ${GENERIC_FIXTURE}): integer { 1 }`), expected: key },
    { cell: "b2 fn return", src: theta(`fn f(): ${GENERIC_FIXTURE} { 1 }`), expected: key },
    { cell: "b3 schema body field", src: theta(`schema S { a: ${GENERIC_FIXTURE} }`), expected: key },
    { cell: "b4 alias RHS", src: theta(`schema T = ${GENERIC_FIXTURE}`), expected: key },
    { cell: "b5 @<T> annotation root", src: theta("let r = @<" + GENERIC_FIXTURE + ">`hi`"), expected: key },
    {
      // b6 is b3 written in a `.thetalib`, which carries no frontmatter — the
      // path is what selects the library grammar, so it is passed explicitly.
      cell: "b6 .thetalib schema body field",
      src: `schema S { a: ${GENERIC_FIXTURE} }\n`,
      path: "lib.thetalib",
      expected: key,
    },
    { cell: "b7 params: field", src: paramsSrc(`  p: '${GENERIC_FIXTURE}'`), expected: key },
    {
      cell: "b8 let annotation",
      src: theta(`let x: ${GENERIC_FIXTURE} = 1`),
      expected: [NOTIDENT("a b"), LETRHS("x", GENERIC_FIXTURE, "integer")],
    },
  ];
}

/**
 * (C) Reach and multiplicity — §Reproduction (c) plus the c10 cell §Fix (a)
 * route 1 requires be measured.
 *
 * c1/c2 are the flag's inheritance DOWNWARD through the field descent
 * (type-grammar.ts:1234); c3/c4 are the converse — an outer object outside the
 * carve-out holding an inner one inside it; c5 is a generic inside a generic;
 * c6 is a union arm inside a generic argument (the union descent, :1240).
 *
 * c7 and c10 are the two ORDER cells. c7's `result-in-schema-position` is that
 * position's own row (§Non-goals) and precedes the key line. c10 is the cell
 * §Fix (a) route 1's last sentence names explicitly: bug 0129's
 * count-consequence law (code-registry-parse.md:101) suppresses a second
 * diagnostic on "that field", and `Elan` and `a b` are two DIFFERENT fields, so
 * BOTH lines stand — the identifier pass over `fieldNames` (:1086) first, the
 * raw-key loop (:1123) second. Measured, not assumed.
 *
 * c8 is §Fix (c)'s multiplicity witness: two offending keys in one interior,
 * two diagnostics, in SOURCE order.
 *
 * c9 is GREEN now and after — the depth-wise counterpart of a9.
 */
function reachCells(): Cell[] {
  const rows: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
    ["c1", "schema S { a: array<{ p: { x y: string } }> }", [NOTIDENT("x y")]],
    ["c2", 'schema S { a: array<{ p: { "q": string } }> }', [QUOTED('"q"')]],
    ["c3", "schema S { a: { p: array<{ x y: string }> } }", [NOTIDENT("x y")]],
    ["c4", "schema S { a: { p: array<{ q: string, q: integer }> } }", [DUP("q")]],
    ["c5", "schema S { a: array<array<{ x y: string }>> }", [NOTIDENT("x y")]],
    ["c6", 'schema S { a: array<{ "q": string } | integer> }', [QUOTED('"q"')]],
    ["c7", "schema S { a: Result<string, { x y: string }> }", [RESULTPOS, NOTIDENT("x y")]],
    [
      "c8 multiplicity",
      "schema S { a: array<{ x y: string, p q: integer }> }",
      [NOTIDENT("x y"), NOTIDENT("p q")],
    ],
    ["c9 NO-MOVE", "schema S { a: array<{ p: { Bad: string } }> }", [CASE]],
    [
      "c10 two fields, two regimes",
      "schema S { a: array<{ Elan: string, a b: integer }> }",
      [CASE, NOTIDENT("a b")],
    ],
  ];
  return rows.map(([cell, stmt, expected]) => ({ cell, src: theta(stmt), expected }));
}

/**
 * (E) The bare-spelling controls of §Reproduction (e), at the `fn` parameter,
 * the `schema` body field and the `params:` positions.
 *
 * GREEN now and after. These are the half of §Expected behaviour's "one
 * disposition per spelling" agreement that must NOT move: route 1 changes what
 * the GENERIC column answers, and if it also moved a bare column the agreement
 * would have been reached by breaking the other side.
 */
function bareControlCells(): Cell[] {
  const cells: Cell[] = [];
  for (const [id, interior, expected] of INTERIORS) {
    cells.push({
      cell: `e-${id} fn parameter`,
      src: theta(`fn f(p: ${interior}): integer { 1 }`),
      expected,
    });
    cells.push({
      cell: `e-${id} schema body field`,
      src: theta(`schema S { a: ${interior} }`),
      expected,
    });
    cells.push({
      cell: `e-${id} params: field`,
      src: paramsSrc(`  p: '${interior}'`),
      expected,
    });
  }
  return cells;
}

/**
 * (F) Bounds — §Reproduction (f), two of whose three rows the bug document
 * records wrongly for this tree. Both divergences are commented at the cell.
 */
function boundsCells(): Cell[] {
  return [
    {
      // f1 — a conformant interior keeps its silence inside the carve-out.
      // §Expected behaviour states this row does not move; GREEN now and after.
      cell: "f1 NO-MOVE conformant interior",
      src: theta("schema S { a: array<{ a: integer }> }"),
      expected: [],
    },
    {
      // f2 — DIVERGENCE 1 FROM THE BUG DOCUMENT. §Reproduction (f) records
      // `theta/parse/generic-arity-mismatch` here, measured at 0.183.0. At this
      // tree the cell measures `[]`: the `Result` argument-list miscount the
      // document's §Non-goals records is NOT observable here, so nothing in
      // this file claims anything about it — it is bug 0236's separate filing
      // (the bracket-group carrier class). What route 1 adds at this cell is
      // the raw-key refusal ALONE, which is the only claim made: the
      // `let` RHS gate does not answer either, because the annotation's own
      // error-severity refusal withholds it.
      cell: "f2 Result argument, boundary named and not claimed",
      src: theta('let x: Result<{a b: integer}, string> = 1'),
      expected: [NOTIDENT("a b")],
    },
    {
      // f3 — DIVERGENCE 2 FROM THE BUG DOCUMENT. §Expected behaviour says
      // "Row f3 keeps its silence, which the closing-brace gate owns".
      // Measured, that attribution is WRONG for this fixture: the tolerant
      // recovery spends the `schema` declaration's own `}` as the interior's
      // closing brace, so `TypeNode.closingBraceSpelled` is TRUE here and the
      // silence at HEAD was the GENERIC gate's, not the brace gate's — which is
      // why route 1 moves this cell. The genuinely-unclosed class is untouched:
      // group (J) of tests/inline-object-field-name-case.test.ts and group (J)
      // of tests/inline-object-malformed-entry-resync.test.ts both stay green
      // under route 1 (verified against the experimental application), so
      // §Non-goals' unclosed-interior exclusion still holds — this fixture was
      // simply never a member of it.
      cell: "f3 apparently-unclosed interior, brace gate not the owner",
      src: theta("schema S { a: array<{ éLan: string }"),
      expected: [NOTIDENT("éLan")],
    },
  ];
}

/** The whole diagnostic-list inventory, in group order. */
function allCells(): Cell[] {
  return [...columnCells(), ...positionCells(), ...reachCells(), ...bareControlCells(), ...boundsCells()];
}

/** Declared inventory size — group (L) recomputes it (anti-vacuity). */
const TOTAL_LIST_CELLS = 76;
/** Declared count of cells whose specified list is EMPTY. */
const EMPTY_LIST_CELLS = 6;
/** Declared count of cells whose specified list carries bug 0228's raw-key row. */
const NOT_IDENT_BEARING_CELLS = 41;

// ===========================================================================
// (A) THE SIX RULES AT ONE ARM, BARE versus INSIDE ONE GENERIC ARGUMENT.
// RED at HEAD: the GENERIC column of rows a1–a8 measures `[]` at every one.
// ===========================================================================

describe("bug 0233 (A) — one interior, one disposition, inside a generic argument and outside it", () => {
  it("rows a1–a11 in both columns, with a9/a10 as the attribution controls and a11 as the no-move control", () => {
    expectGroup(
      columnCells(),
      "grammar.md:109 admits `ObjectType` in ANY `Type` position with the same `Field` form and " +
        "the same field semantics, and type-system.md:15 states one type grammar in every " +
        "type-annotation position, so `array<{ … }>` and `{ … }` draw the same verdict on the " +
        "same interior. A red on an `inside array<…>` cell reporting `[]` against an expected " +
        "refusal is bug 0233: `walkType`'s raw-key gate `!insideGenericArgument && " +
        "node.closingBraceSpelled` (src/parser/type-grammar.ts:1122) withheld all four raw-key " +
        "rows. The a9/a10 cells must stay GREEN in the same run — they are the proof the walk " +
        "reaches the arm at all",
    );
  });
});

// ===========================================================================
// (B) THE CLASS AT EIGHT `Type` POSITIONS. RED at HEAD: b1–b7 measure `[]`,
// b8 measures the RHS gate alone.
// ===========================================================================

describe("bug 0233 (B) — the disposition holds at every Type position, params: and .thetalib included", () => {
  it("rows b1–b8 on the fixture array<{a b: integer}>", () => {
    expectGroup(
      positionCells(),
      "code-registry-parse.md:101 states this row's reach as 'any `Type` position and at any " +
        "nesting depth', and §Fix (c) binds the disposition to every one of them. A red " +
        "reporting `[]` (b1–b7) or the `let-rhs-type-mismatch` line alone (b8) is bug 0233. b8's " +
        "RHS gate is that position's own row (§Non-goals) and must remain, in second place",
    );
  });
});

// ===========================================================================
// (C) REACH AND MULTIPLICITY. RED at HEAD: c1–c6 and c8 measure `[]`, c7 and
// c10 are short by one line. c9 is GREEN now and after.
// ===========================================================================

describe("bug 0233 (C) — every depth beneath a generic argument, both nesting directions, and one line per offending key", () => {
  it("rows c1–c10, with c8 the multiplicity witness and c10 the two-different-fields cell §Fix (a) route 1 requires", () => {
    expectGroup(
      reachCells(),
      "the field and union descents propagate the incoming flag unchanged " +
        "(src/parser/type-grammar.ts:1234, :1240), so the carve-out reaches every depth; §Fix (c) " +
        "binds the disposition to all of them and to one diagnostic per offending key in source " +
        "order. c10 is the measured coexistence: bug 0129's count-consequence law " +
        "(code-registry-parse.md:101) is scoped to 'that field', and `Elan` and `a b` are two " +
        "different fields, so both lines stand — the identifier pass first, the raw-key loop " +
        "second. c9 must stay GREEN",
    );
  });
});

// ===========================================================================
// (D) THE LOWERING TRIPWIRES — §Reproduction (d). No route here mints a
// property name inside a generic argument, which is the invariant every cell
// below holds. d1–d6 and d9 are GREEN now and after; d7 and d8 are RED, and
// their after-form DIVERGES from the bug document (see the comment on the
// second test).
// ===========================================================================

describe("bug 0233 (D) — the lowering never divides a generic argument's interior into fields, before or after", () => {
  it("d1–d6: the annotation-root lowerings are byte-identical after the fix", () => {
    // `lowerQueryResponseSchema(<annotation>, [], [])` is exactly the call
    // src/extension/production-theta-producer.ts:2672 makes. Route 1 adds
    // refusals at the PARSE surface and touches no lowerer, so these bytes are
    // the tripwire: a route that started dividing the interior into properties
    // would move them, and §Non-goals scopes the permissive `{}` out (0204,
    // 0164). d5 is the conformant control — the same erasure for a legal
    // interior — and d6 is the `Result` shape.
    const actual = {
      d1: JSON.stringify(lowerQueryResponseSchema("array<{ éLan: string }>", [], [])),
      d2: JSON.stringify(lowerQueryResponseSchema("array<{a b: integer}>", [], [])),
      d3: JSON.stringify(lowerQueryResponseSchema('array<{ "a": integer }>', [], [])),
      d4: JSON.stringify(lowerQueryResponseSchema("array<{ 3: string }>", [], [])),
      d5: JSON.stringify(lowerQueryResponseSchema("array<{ a: integer }>", [], [])),
      d6: JSON.stringify(lowerQueryResponseSchema("Result<{ éLan: string }, string>", [], [])),
    };
    expect(
      actual,
      "schema-subset.md:9 and :77 give `array<T>`'s lowered form; the interior of a generic " +
        "argument is never divided into fields, so no key of any spelling reaches the provider " +
        "from that position. These cells must not move under route 1",
    ).toEqual({
      d1: '{"type":"array","items":{}}',
      d2: '{"type":"array","items":{}}',
      d3: '{"type":"array","items":{}}',
      d4: '{"type":"array","items":{}}',
      d5: '{"type":"array","items":{}}',
      d6: "{}",
    });
  });

  it("d7/d8 lose their whole frontmatter object to the refusal, and d9's bare control is untouched", () => {
    // DIVERGENCE FROM THE BUG DOCUMENT, encoded here in the MEASURED form.
    // §Fix (d) says "every cell of §Reproduction (d) holds byte-for-byte after
    // the fix". That is TRUE of d1–d6 and of d9. It is FALSE of d7 and d8:
    // those two are `params:` rows, and a refused `params:` field withholds the
    // WHOLE frontmatter object, so after the fix `doc.frontmatter === null` and
    // the lowering is ABSENT — which is exactly what §Reproduction (e) already
    // states for every refused row ("the `params:` lowering is absent
    // (`loweredSchema` null)"). The invariant the document actually asserts —
    // no property name is ever minted inside a generic argument — holds at
    // every cell either way, and holds a fortiori where nothing lowers at all.
    const d7 = paramsSrc("  p: 'array<{ éLan: string }>'");
    const d8 = paramsSrc("  p: 'array<{ a: integer, a: string }>'");
    const d9 = paramsSrc("  p: '{ a: integer }'");

    expectGroup(
      [
        { cell: "d7 params: non-ASCII key", src: d7, expected: [NOTIDENT("éLan")] },
        { cell: "d8 params: repeated key", src: d8, expected: [DUP("a")] },
        { cell: "d9 params: bare control", src: d9, expected: [] },
      ],
      "the refusal is the document's own diagnostic list; at HEAD both `params:` rows measure " +
        "`[]` and lower a permissive fragment instead",
    );

    expect(
      {
        d7: parseDoc(d7).frontmatter === null,
        d8: parseDoc(d8).frontmatter === null,
        d9: parseDoc(d9).frontmatter === null,
      },
      "the frontmatter gate withholds the WHOLE frontmatter object on any error-severity " +
        "frontmatter diagnostic, so a refused `params:` field lowers nothing — §Reproduction " +
        "(e)'s stated behaviour for every refused row. d9 is the bare control and keeps its " +
        "frontmatter",
    ).toEqual({ d7: true, d8: true, d9: false });

    expect(
      { d7: loweredParams(d7), d8: loweredParams(d8), d9: loweredParams(d9) },
      "d9 is the field division the bare `params:` root DOES perform (`hoistInlineObjectType`'s " +
        "`$defs` mint) and must be byte-identical after the fix; d7 and d8 lower nothing at all " +
        "once their field is refused",
    ).toEqual({
      d7: "null",
      d8: "null",
      d9:
        '{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_df817b794ef788ce"}},' +
        '"required":["p"],"additionalProperties":false,' +
        '"$defs":{"__inline_df817b794ef788ce":{"type":"object","properties":{"a":{"type":"integer"}},' +
        '"required":["a"],"additionalProperties":false}}}',
    });
  });
});

// ===========================================================================
// (E) THE BARE-SPELLING CONTROLS — §Reproduction (e). GREEN now and after.
// ===========================================================================

describe("bug 0233 (E) — the bare spelling of every row keeps its verdict at all three positions", () => {
  it("rows a1–a11 written bare at the fn parameter, the schema body field and params:", () => {
    expectGroup(
      bareControlCells(),
      "these are the agreement's other half: route 1 must reach one disposition per spelling by " +
        "adding the refusal inside the generic argument, never by removing it outside. Every " +
        "cell here is GREEN at HEAD and must stay GREEN",
    );
  });

  it("a refused params: field lowers nothing, and the conformant one still mints its $defs", () => {
    // §Reproduction (e)'s last sentence, asserted as an observable rather than
    // left as prose: registration is denied for every refused row and the
    // `params:` lowering is absent. a11 is the one row that lowers.
    const actual: Record<string, string> = {};
    const expected: Record<string, string> = {};
    for (const [id, interior] of INTERIORS.map((r) => [r[0], r[1]] as const)) {
      const src = paramsSrc(`  p: '${interior}'`);
      actual[id] = loweredParams(src);
      expected[id] = id === "a11" ? loweredParams(paramsSrc("  p: '{ a: integer }'")) : "null";
    }
    expect(
      actual,
      "a refused `params:` field withholds the whole frontmatter object, so nothing lowers; the " +
        "conformant interior is the only row with a lowering, and it is the `$defs` document " +
        "group (D)'s d9 pins byte-for-byte",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (F) BOUNDS. RED at HEAD: f2 and f3 measure `[]`. f1 is GREEN now and after.
// ===========================================================================

describe("bug 0233 (F) — the bounds, two of which the report records differently from this tree", () => {
  it("f1 does not move, f2's Result argument draws the key refusal alone, f3's brace gate is not the owner of its silence", () => {
    expectGroup(
      boundsCells(),
      "f1 is §Expected behaviour's explicit no-move row. f2 and f3 are encoded in their MEASURED " +
        "after-form: the bug document's `generic-arity-mismatch` at f2 is not observable at this " +
        "tree (bug 0236's separate filing, unclaimed here), and its attribution of f3's silence " +
        "to the closing-brace gate is wrong for this fixture — the recovery spends the schema " +
        "declaration's own `}`, so `closingBraceSpelled` is true and the silence was the generic " +
        "gate's",
    );
  });
});

// ===========================================================================
// (L) ANTI-VACUITY — the inventory arithmetic, recomputed from the tables.
// ===========================================================================

describe("bug 0233 (L) — the inventory this file asserts", () => {
  it("the cell tables carry the declared counts and no duplicate keys", () => {
    const cells = allCells();
    expect(
      cells.length,
      "the declared inventory must match the tables, so a cell added or dropped re-derives it",
    ).toBe(TOTAL_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.length === 0).length,
      "only the six conformant-interior controls (a11 in both columns, e-a11 at three positions, " +
        "and f1) expect nothing; every other cell asserts a non-empty ordered list, so a harness " +
        "that stopped reaching the parser fails loudly rather than passing vacuously",
    ).toBe(EMPTY_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.some((e) => e.code === NOT_IDENT)).length,
      "bug 0228's raw-key row is the largest single family in this report's silent class; its " +
        "cell count is recomputed so a weakened expectation cannot pass unnoticed",
    ).toBe(NOT_IDENT_BEARING_CELLS);
    const keys = new Set(cells.map((c) => `${c.cell} :: ${c.src}`));
    expect(
      keys.size,
      "every cell key is distinct, so no cell is silently overwritten inside a group's map",
    ).toBe(cells.length);
  });
});
