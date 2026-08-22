import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { splitTopLevel } from "../src/parser/params";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0236 — `TypeParser.parsePrimary` has no arm for `[`, so a bracket group
// written as a generic type argument falls to the tolerant punctuation skip,
// which consumes ONE token and recurses. Nothing puts the cursor past the
// group's `]`, so the group's own interior commas are read as ARGUMENT
// separators by `TypeParser.parseGeneric`'s loop and the application ends with
// ONE argument recorded for a source that wrote two or three:
// `Result<enum["a","b"], string>` draws `theta/parse/generic-arity-mismatch`
// "got 1", `array<enum["a","b"], string>` draws NOTHING and REGISTERS where
// `array<{a: integer}, string>` is refused, and
// `Result<enum["a","b"], void>` loses the
// `theta/parse/void-in-non-return-position` its byte-neighbour draws
// (docs/bugs/0236-bracket-group-generic-argument-truncates-list.md). This file
// is that report's §Fix (d) fresh witness.
//
// THE MECHANISM (cited BY SYMBOL — every line number into
// `src/parser/type-grammar.ts` is bug 0134's do-not-chase class and this fix
// moves those lines; docs/STYLE.md §Citations). `TypeParser.parsePrimary`'s
// `punct` arm branches on `-` (a negative numeric literal) and on `{`
// (`TypeParser.parseObject`), and everything else takes the fall-through
//
//     // Unexpected punctuation: skip it to stay tolerant.
//     this.next();
//     return this.parsePrimary();
//
// (`TypeParser.parsePrimary`, src/parser/type-grammar.ts.) For
// `enum["a","b"]` the head `enum` is an ident with no following `<`, so the
// ident arm returns a `named` node and the caller resumes with the cursor
// standing on `[`. That `[` is skipped, `"a"` is consumed by the recursive
// `parsePrimary` as a literal, and control returns to `parseGeneric`'s
// `while (this.eatPunct(","))` loop, which reads the GROUP's interior comma as
// an argument separator. `"b"` is consumed as the next argument, the loop stops
// at `]`, and the enclosing `>` closes an argument list holding one entry.
// `walkType`'s generic arm then prints `node.args.length` verbatim as
// `<actual>` and descends `node.args` alone, so both faces of the defect —
// the false count and the unwalked tail — follow from that one length
// (`GENERIC_ARITY`, `walkType`, src/parser/type-grammar.ts).
//
// Neither landed recovery for this shape reaches it.
// `TypeParser.skipMalformedEntry` (bug 0231) runs only from `parseObject`'s
// FIELD loop and its depth counter tracks `{`/`<` and `}`/`>` only, so a `[` is
// depth-neutral to it. `findCutBracketGroupText` (bug 0217,
// `src/parser/params.ts`) runs on the LOWERING side over the interior STRING
// and feeds one refusal sink; it computes no argument count and is reached only
// from the three schema-feeding positions — which is exactly the difference
// between the `schema` / alias / `params:` rows of group (B) and its `fn`,
// `let` and query rows.
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES (selected by the parent run inside §Fix (a)'s
// constraints, prototyped and premeasured by it at this HEAD; the prototype was
// then reverted and the tree verified byte-clean)
// =====================================================================
// §Fix (a) ROUTE 1 — CONSUME THE GROUP IN `parsePrimary`. Two additions to that
// one production:
//   1. a `[` arm that consumes a CLOSED balanced bracket group whole —
//      tracking `[`/`]` depth the way `interiorClosingBraceIndex` tracks
//      braces — and yields ONE leaf node;
//   2. a POSTFIX consumption of a closed `[…]` group standing behind any
//      primary, which is the `enum["a","b"]` case: the head `enum` is an
//      `Ident`, so the head arm has already returned before the `[` is reached.
// `parseGeneric` then counts the arguments the author wrote, `walkType` walks
// all of them, group (A) reports the true count, group (B)'s `fn`, `let` and
// query rows gain their arity refusal, and group (C)'s tail gains its `void`
// line.
//
// A bracket group the source never CLOSES is NOT consumed: the cursor keeps
// HEAD's tolerant skip-and-recurse and that whole class is unmoved — the
// authorised under-refusal `theta/parse/schema-type-not-expression`'s row
// records (docs/spec_topics/diagnostics/code-registry-parse.md:105, "A bracket
// group the source never CLOSES (`array<enum["a", "b">`) is outside that push
// and stays under-refused with its pieces") and this report's §Non-goals
// ("An UNCLOSED bracket group … Not measured here and not claimed"). Group (F)
// pins that class at every position, GREEN in both trees.
//
// EVERY EXPECTATION BELOW IS THE SPECIFIED BEHAVIOUR, NOT THE CURRENT ONE. The
// AFTER values are the parent run's measurements against a working prototype of
// route 1; every HEAD value quoted in a cell comment was independently
// re-derived against this tree while this file was written.
//
// §FIX (b) BINDING — WHAT REPLACES WHAT AT THE SCHEMA-FEEDING POSITIONS. At the
// `schema` field type, the alias arm (both extensions) and `params:`, the arity
// line does NOT join bug 0217's cut-group refusal: it REPLACES it. That is the
// precedence already registered on the refusal's own row
// (docs/spec_topics/diagnostics/code-registry-parse.md:105): "a field or
// declaration that already carries an error-severity diagnostic from its own
// walk — a position rule (`void`, generic arity, `Result`, an inline
// `enum[...]`), a reserved keyword, or an unresolved name — keeps that
// diagnostic alone and draws no refusal". It is the SAME precedence that
// already suppresses the push at HEAD for the `Result` carrier:
// `schema S { a: Result<enum["a","b"], string> }` measures
// `generic-arity-mismatch` + `result-in-schema-position` and NO refusal today.
// The subject therefore stays refused at every one of those positions in both
// trees; only the CODE changes, and it converges on the `{a: integer}`
// control's. `theta/load/params-type-not-expression`
// (docs/spec_topics/diagnostics/code-registry-load.md:19) carries the same
// precedence sentence for the `params:` position. Bug 0217's exactly-once
// property is untouched where it still fires — group (F)'s registry-example
// rows are its own published cells and are GREEN in both trees.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:107 — §"Generic-application constructors":
//     the closed set with its arities (`array` 1, `Result` 2), and "Applying a
//     constructor with a type-argument count other than its declared arity
//     (e.g. `array<T, U>` or `Result<T>`) is
//     `theta/parse/generic-arity-mismatch`". The same paragraph fixes
//     `theta/parse/result-in-schema-position`'s positions.
//   - docs/spec_topics/grammar.md:105 — a bare `Type` appears in generic type
//     arguments and union arms; the `void`-in-a-generic-argument sentence
//     (`Result<void, E>`) group (C) is taken against.
//   - docs/spec_topics/type-system.md:15 — the same type grammar in every
//     type-annotation position, which is why group (B) asserts all nine rows of
//     §Reproduction (b).
//   - docs/spec_topics/schemas.md:93 — "`enum` is **top-level only** — there is
//     no inline `enum["a", "b"]` form", stated with NO depth qualifier. This is
//     the sentence that makes the group non-derivable and therefore makes the
//     enclosing application's arity the author's own claim.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:65 — the arity row's
//     trigger and its `<actual>` placeholder (an integer type-argument count);
//     code-registry-parse.md:66 `void-in-non-return-position`;
//     code-registry-parse.md:67 `result-in-schema-position`;
//     code-registry-parse.md:105 `schema-type-not-expression` (bug 0217's last-resort push, the
//     unclosed-group under-refusal, and the position-rule precedence above);
//     code-registry-parse.md:114 `inline-enum`, anchored at the START of a schema field type or alias
//     arm and never one level down (bug 0162's territory, §Non-goals).
//   - docs/spec_topics/diagnostics/code-registry-load.md:19 —
//     `theta/load/params-type-not-expression`, the `params:` mirror of code-registry-parse.md:105.
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md) — the *Message*
//     column is normative and tests MUST source it from the registry. No
//     message prose is written out below; every expected string is read through
//     `parseRegistry` / `registryMessage`, so a reworded template reds by
//     naming the registry.
//
// THE LEDGER — what each group pins, and which cells are RED at HEAD:
//   - (A) THE REPORTED COUNT at the `let` annotation, §Reproduction (a) rows
//     a1–a14: 14 cells, 10 RED (a1, a3, a5–a11 against a HEAD `ARITY(1)`, and
//     a2 against a HEAD `ARITY(1)` where the source spells three) and 4 GREEN
//     now and after (a4 — the group in the LAST argument, where truncation
//     removes nothing; a12 — one argument written, the right count reported by
//     accident; a13 — the inline-object control; a14 — the bare group, bug
//     0162's row, §Non-goals).
//   - (B) THE LOST REFUSAL BY POSITION, §Reproduction (b): 25 cells in three
//     columns over the nine rows. The `<A>` column (`array<enum["a","b"],
//     string>`) is RED at all eight positions and b2 is RED; the `<R>` column
//     (`Result<enum["a","b"], string>`) is RED at seven and GREEN at the query
//     peel (§Non-goals, row b14); the `<C>` control column
//     (`array<{a: integer}, string>`) is GREEN at all eight and is the byte
//     the `<A>` column must converge on.
//   - (C) THE UNWALKED TAIL, §Reproduction (c): 5 cells, c1 and c4 RED, c2, c3
//     and c5 GREEN now and after (the controls that prove the rule fires at
//     all in the same constructor at the same position).
//   - (D) NEIGHBOURS AND BOUNDS, §Reproduction (d): 5 cells, ALL GREEN now and
//     after.
//   - (E) THE LOWERINGS AND THE THREE COUNTERS, §Reproduction (e) and (f): no
//     diagnostic-list cell. Byte-identical before and after — bug 0204
//     §Fix (b)(3) keeps the lowering-side split angle-only and this route
//     changes no lowered byte and no lowering-side counter.
//   - (R) REACH AT A SECOND POSITION, §Fix (c): the four shapes §Fix (c) names
//     — a group that is not an `enum` head, one nested in a brace interior, one
//     in a union arm and one in a nested application — carried to the
//     `fn`-parameter position, where group (A) holds them at the `let`
//     annotation: 4 cells, ALL RED at HEAD.
//   - (F) THE FENCE — the route's own hazard surface (§Fix (a) route 1's
//     "measure every other production reading the same cursor"): 42 cells,
//     ALL GREEN at HEAD and ALL required to stay green. The UNCLOSED group at
//     every position; bug 0217's four published registry examples; and the
//     bare group at every position.
//   - (L) ANTI-VACUITY — the inventory arithmetic, recomputed from the tables.
//
// ORDERING IS PART OF THE ASSERTION. Every diagnostic cell is an ordered
// whole-list `toEqual` over the UNFILTERED `doc.diagnostics`, so neither an
// extra diagnostic nor a right diagnostic in a wrong order can hide inside a
// containment check. Two orders are load-bearing and measured, not assumed: the
// `let`-annotation rows put the arity line BEFORE the position's own
// `theta/parse/let-rhs-type-mismatch` (the control's HEAD order, which the
// subject must reproduce), and the `<R>` schema-feeding rows put
// `result-in-schema-position` alone once the arity violation is gone.
//
// TIER: unit, offline, deterministic, provider-free — the tier this repository
// puts this kind of claim in, and the tier above buys no reach: every
// observable settles inside one `parseThetaDocument` call over a source string
// (`parseDoc`, tests/helpers/e2e-s1.ts, the shipped load path behind the
// standard inert `parseDeps` double), one read of the settled document's own
// frontmatter object, one direct lowerer call (`lowerQueryResponseSchema`,
// src/runtime/query-schema-lowering.ts) or one direct `splitTopLevel` call
// (`src/parser/params.ts`). An integration tier would add a session round-trip
// to a parse-time value; a live tier would make a fully determined value
// stochastic. The one live-axis cell this bug earns — registration DENIED for a
// theta whose `fn` parameter type over-applies `array` behind a bracket group,
// through the real discovery→registration path, with its legal sibling still
// registering and driving — is
// `tests/live/generic-argument-bracket-group-truncation-live-cell.test.ts`.
//
// ANTI-VACUITY / NO SILENT SKIPPING: nothing here early-returns, branches on
// the environment or conditionally skips. The registry lookup asserts its row's
// presence and its placeholders before the template is used, so a missing or
// reworded row reds by naming the registry. Group (L) recomputes the declared
// inventory arithmetic from the cell tables themselves, so a cell added,
// dropped or weakened re-derives the ledger rather than passing unnoticed.

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
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so a
 * missing row or a reworded template reds by naming the registry rather than by
 * a bare `undefined` comparison.
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

const GENERIC_ARITY = "theta/parse/generic-arity-mismatch";
const VOID_NON_RETURN = "theta/parse/void-in-non-return-position";
const RESULT_IN_SCHEMA = "theta/parse/result-in-schema-position";
const SCHEMA_NOT_EXPR = "theta/parse/schema-type-not-expression";
const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const LET_NO_INIT = "theta/parse/let-without-initialiser";
const NOT_IDENT = "theta/parse/inline-field-name-not-identifier";
const INLINE_ENUM = "theta/parse/inline-enum";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

/** The arity row (code-registry-parse.md:65) — the count face of this report. */
function ARITY(ctor: string, expected: string, actual: string): Exp {
  return {
    severity: "error",
    code: GENERIC_ARITY,
    fills: [
      ["<ctor>", ctor],
      ["<expected>", expected],
      ["<actual>", actual],
    ],
  };
}
/** `Result` applied to the two arguments the source spells. */
const ARITY_R1 = ARITY("Result", "2", "1");
const ARITY_R3 = ARITY("Result", "2", "3");
/** `array` over-applied: the refusal §Reproduction (b) loses. */
const ARITY_A2 = ARITY("array", "1", "2");
const ARITY_A3 = ARITY("array", "1", "3");
/** The unwalked tail's own row (code-registry-parse.md:66). */
const VOIDPOS: Exp = { severity: "error", code: VOID_NON_RETURN, fills: [] };
/** The schema-feeding position's own `Result` row (code-registry-parse.md:67), §Non-goals. */
const RESULTPOS: Exp = { severity: "error", code: RESULT_IN_SCHEMA, fills: [] };
/** Bug 0217's cut-group refusal at the two schema positions (code-registry-parse.md:105). */
function SCHEMANOTEXPR(subject: string): Exp {
  return { severity: "error", code: SCHEMA_NOT_EXPR, fills: [["<X>", subject]] };
}
/** Its `params:` mirror (code-registry-load.md:19). */
function PARAMSNOTEXPR(param: string): Exp {
  return { severity: "error", code: PARAMS_NOT_EXPR, fills: [["<param>", param]] };
}
/** The `let` RHS gate — that position's own row, §Non-goals. */
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
/** The unclosed-group fence's own row at the `let` position (code-registry-parse.md:58). */
function LETNOINIT(name: string): Exp {
  return { severity: "error", code: LET_NO_INIT, fills: [["<name>", name]] };
}
/** Bug 0233's widened raw-key row (code-registry-parse.md:103) — §Reproduction (d) row d5. */
function NOTIDENT(field: string): Exp {
  return { severity: "error", code: NOT_IDENT, fills: [["<field>", field]] };
}
/** Bug 0162's row (code-registry-parse.md:114), anchored at the START of a schema field type or arm. */
const INLINEENUM: Exp = { severity: "error", code: INLINE_ENUM, fills: [] };

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

/** `<A>` — the over-applied `array` behind a bracket group (§Reproduction (b)). */
const SUBJECT_A = 'array<enum["a","b"], string>';
/** `<C>` — its byte-neighbour control, the same over-application, brace carrier. */
const CONTROL_C = "array<{a: integer}, string>";
/** `<R>` — the same truncation under the arity-2 constructor. */
const SUBJECT_R = 'Result<enum["a","b"], string>';

// ===========================================================================
// (A) THE REPORTED COUNT AT THE `let` ANNOTATION — §Reproduction (a).
// RED at HEAD: a1, a3, a5, a6, a7, a8, a9, a10, a11 (each measures `ARITY(1)`
// where the specified list is `[]` or a different row) and a2 (measures
// `ARITY(1)` where the source spells THREE arguments).
// ===========================================================================

function countCells(): Cell[] {
  const rows: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
    // a1 — the headline row. Two arguments written, both derivable-or-not is
    // beside the point: `Result`'s arity is 2, so a correctly counted list
    // draws NOTHING. At HEAD: `ARITY(1)`.
    ["a1", 'Result<enum["a","b"], string>', []],
    // a2 — three written. The count in the message is the author's
    // (§Expected behaviour, element 1), so the row fires with `got 3`.
    // At HEAD: `ARITY(1)` — the number the author cannot act on.
    ["a2", 'Result<enum["a","b"], string, integer>', [ARITY_R3]],
    // a3 — the count is right once the group is one argument, and the SECOND
    // argument is then walked: `void` in a non-return position. At HEAD:
    // `ARITY(1)` and no `void` line (group (C) is the same claim with its
    // controls beside it).
    ["a3", 'Result<enum["a","b"], void>', [VOIDPOS]],
    // a4 — NO-MOVE. The group is the LAST argument, so the truncation removes
    // nothing and the count is already 2. GREEN now and after.
    ["a4", 'Result<string, enum["a","b"]>', []],
    // a5 — THE CARRIER DISCRIMINATOR. No `enum` head at all: a bare `[…]`
    // group, which route 1's `[` arm consumes (the postfix arm is not even
    // reached). At HEAD: `ARITY(1)`.
    ["a5", "Result<[integer], string>", []],
    // a6 — the group nested inside a BRACE interior (§Fix (c) Reach).
    ["a6", 'Result<{a: enum["x"]}, string>', []],
    // a7 — the second carrier discriminator: a COMMA-FREE group still
    // truncates at HEAD, so the defect is the unconsumed group and not the
    // interior comma. At HEAD: `ARITY(1)`.
    ["a7", 'Result<enum["a"], string>', []],
    // a8 — the group inside a UNION ARM (§Fix (c) Reach).
    ["a8", 'Result<enum["a","b"] | integer, string>', []],
    // a9 — the grammar's optional trailing comma behind the group: still two
    // arguments. At HEAD: `ARITY(1)`.
    ["a9", 'Result<enum["a","b"], string,>', []],
    // a10 — the group inside a NESTED application (§Fix (c) Reach): the inner
    // `array<enum["a","b"]>` is one well-formed argument.
    ["a10", 'Result<array<enum["a","b"]>, string>', []],
    // a11 — a group in BOTH arguments.
    ["a11", 'Result<enum["a","b"], enum["c"]>', []],
    // a12 — NO-MOVE, and the one row where HEAD reports the right number by
    // accident: one argument IS written, so `ARITY(1)` is true before and
    // after. GREEN in both trees, and the proof the row still fires at all.
    ["a12", 'Result<enum["a","b"]>', [ARITY_R1]],
    // a13 — the inline-object control (bug 0235 discharged, bug 0231 landed):
    // two arguments, correctly counted, silent. GREEN now and after.
    ["a13", "Result<{a: integer}, string>", []],
    // a14 — the BARE group at this position draws nothing today; bug 0162 owns
    // `theta/parse/inline-enum`'s trigger set and §Non-goals excludes it. No
    // route here raises that row anywhere new. GREEN now and after.
    ["a14", 'enum["a","b"]', []],
  ];
  return rows.map(([id, annotation, expected]) => ({
    cell: `${id} let annotation ${annotation}`,
    src: theta(`let x: ${annotation} = 1`),
    expected,
  }));
}

describe("bug 0236 (A) — the arity message reports the number of type arguments the source spells", () => {
  it("rows a1–a14 at the `let` annotation, with a4/a12/a13/a14 the no-move controls", () => {
    expectGroup(
      countCells(),
      "grammar.md:107 fixes the closed constructor set and its arities and states that applying " +
        "a constructor with a type-argument count other than its declared arity is " +
        "`theta/parse/generic-arity-mismatch`; code-registry-parse.md:65 gives `<actual>` as an " +
        "integer type-argument COUNT. §Expected behaviour element 1: `<actual>` is the count of " +
        "type arguments the SOURCE spells. A red reporting `generic type 'Result' expects 2 type " +
        "argument(s); got 1` against an empty list (a1, a3, a5–a11) or against `got 3` (a2) is " +
        "bug 0236: `TypeParser.parsePrimary` skipped the `[` and `TypeParser.parseGeneric` read " +
        "the group's own interior comma as an argument separator " +
        "(src/parser/type-grammar.ts). A red in the OTHER direction at a4, a12, a13 or a14 means " +
        "the route bought the count by moving a row §Reproduction (a) pins as unmoved",
    );
  });
});

// ===========================================================================
// (B) THE LOST REFUSAL, BY POSITION — §Reproduction (b), nine rows, three
// columns. RED at HEAD: all eight `<A>` cells, b2, and seven of the eight
// `<R>` cells. GREEN at HEAD and after: the whole `<C>` control column and the
// `<R>` query row.
// ===========================================================================

/**
 * The eight `Type` positions of §Reproduction (b), parameterised by the type
 * text. The `.thetalib` row carries no frontmatter — the path is what selects
 * the library grammar, so it is passed explicitly. The `params:` row passes the
 * whole document verbatim.
 */
function positionRows(t: string): ReadonlyArray<readonly [string, string, string | undefined]> {
  return [
    ["b1 fn parameter", theta(`fn f(p: ${t}): integer { 1 }`), undefined],
    ["b3 fn return", theta(`fn f(): ${t} { 1 }`), undefined],
    ["b4 schema body field", theta(`schema S { a: ${t} }`), undefined],
    ["b6 alias RHS", theta(`schema T = ${t}`), undefined],
    ["b9 .thetalib alias RHS", `schema T = ${t}\n`, "lib.thetalib"],
    ["b7 query annotation root", theta("let r = @<" + t + ">`hi`"), undefined],
    ["b8 params: field", paramsSrc(`  p: '${t}'`), undefined],
    ["b5 let annotation", theta(`let x: ${t} = 1`), undefined],
  ];
}

function positionCells(): Cell[] {
  const cells: Cell[] = [];

  // THE SUBJECT COLUMN. §Fix (b): the count equals what the source spells at
  // every position, and an arity violation is refused whether or not an
  // argument derives from `Type` — so `<A>` draws `ARITY-array(2)` at all
  // eight, BYTE-IDENTICAL to the `<C>` control below except in the one message
  // that renders the annotation back to the author.
  //
  // At the three schema-feeding positions (b4, b6, b9) and at `params:` (b8)
  // the arity line REPLACES bug 0217's cut-group refusal rather than joining
  // it: code-registry-parse.md:105's precedence sentence ("a field or
  // declaration that already carries an error-severity diagnostic from its own
  // walk — a position rule (`void`, generic arity, `Result`, …) — keeps that
  // diagnostic alone and draws no refusal") is the registered rule, and it is
  // the same precedence that already suppresses the push at HEAD for the `<R>`
  // column below. The subject stays REFUSED at each of those positions in both
  // trees; only the code changes.
  //
  // HEAD for this column: `[]` at b1/b3/b7; `schema-type-not-expression` at
  // b4/b6/b9; `params-type-not-expression` at b8; the `let` RHS gate ALONE at
  // b5.
  for (const [id, src, path] of positionRows(SUBJECT_A)) {
    cells.push({
      cell: `${id} <A> subject`,
      src,
      path,
      expected:
        id === "b5 let annotation"
          ? [ARITY_A2, LETRHS("x", 'array<enum["a","b"],string>', "integer")]
          : [ARITY_A2],
    });
  }

  // THE CONTROL COLUMN — GREEN at HEAD and required to stay green. This is the
  // byte the subject column converges on: the agreement §Expected behaviour
  // element 2 requires must be reached by ADDING the subject's refusal, never
  // by removing the control's. The `let` row's second line is that position's
  // own RHS gate (§Non-goals), and its order — arity FIRST — is the order the
  // subject must reproduce.
  for (const [id, src, path] of positionRows(CONTROL_C)) {
    cells.push({
      cell: `${id} <C> control`,
      src,
      path,
      expected:
        id === "b5 let annotation"
          ? [ARITY_A2, LETRHS("x", "array<{a: integer},string>", "integer")]
          : [ARITY_A2],
    });
  }

  // THE SECOND CONSTRUCTOR. `Result` is arity 2, so the truncated count is a
  // VIOLATION rather than a match and HEAD reports a false number instead of
  // nothing. Once the list holds the two arguments the source wrote, no arity
  // line fires anywhere; at the four schema-feeding positions the position's
  // own `result-in-schema-position` (grammar.md:107,
  // code-registry-parse.md:67) stands ALONE, which is §Non-goals' row kept
  // untouched. The query row is the peel path (§Non-goals, row b14): `[]` in
  // both trees.
  for (const [id, src, path] of positionRows(SUBJECT_R)) {
    const schemaFeeding =
      id === "b4 schema body field" ||
      id === "b6 alias RHS" ||
      id === "b9 .thetalib alias RHS" ||
      id === "b8 params: field";
    cells.push({
      cell: `${id} <R> subject`,
      src,
      path,
      expected: schemaFeeding ? [RESULTPOS] : [],
    });
  }

  // b2 — three written arguments under the arity-1 constructor, at the `fn`
  // parameter. §Reproduction (b) row b2: `[]` at HEAD, so the theta REGISTERS.
  cells.push({
    cell: "b2 fn parameter, three arguments written",
    src: theta('fn f(p: array<enum["a","b"], string, integer>): integer { 1 }'),
    expected: [ARITY_A3],
  });

  return cells;
}

describe("bug 0236 (B) — an arity violation is refused whether or not an argument derives from Type, at every position of §Reproduction (b)", () => {
  it("rows b1–b9 in three columns, the `<A>` subject converging byte-for-byte on the `<C>` control", () => {
    expectGroup(
      positionCells(),
      "type-system.md:15 states the same type grammar in every type-annotation position and " +
        "grammar.md:107 fixes `array`'s arity at 1, so `array<X, Y>` is refused at all of them " +
        "whatever `X` spells. §Expected behaviour element 2: one non-derivable argument does not " +
        "withdraw the constructor's own row. A red on an `<A>` cell reporting `[]` (b1, b3, b7, " +
        "b2) is bug 0236 at its S1 face — the theta REGISTERS; a red reporting " +
        "`schema-type-not-expression` / `params-type-not-expression` (b4, b6, b8, b9) or the " +
        "`let` RHS gate alone (b5) is the same truncation refused by a different row than the " +
        "one its arity violates. A red on an `<R>` cell reporting `generic type 'Result' expects " +
        "2 type argument(s); got 1` is the count face. The `<C>` column and the `<R>` query row " +
        "are GREEN at HEAD and must stay GREEN: the agreement has to be reached by adding the " +
        "subject's refusal, never by removing the control's",
    );
  });

  it("the params: lowering is withheld for the subject and the control alike, before and after", () => {
    // §Reproduction (b) row b8 and (e) row e4: a refused `params:` field
    // withholds the WHOLE frontmatter object, so nothing lowers. Both columns
    // are refused in both trees — only the CODE changes — so this pair is
    // GREEN at HEAD and pins that the route does not start lowering a fragment
    // for the subject on its way to fixing the count. The third column is the
    // proof this harness still reaches the `params:` lowering at all.
    const lowered = (src: string): string =>
      JSON.stringify(parseDoc(src).frontmatter?.params?.loweredSchema ?? null);
    expect(
      {
        subjectA: lowered(paramsSrc(`  p: '${SUBJECT_A}'`)),
        controlC: lowered(paramsSrc(`  p: '${CONTROL_C}'`)),
        subjectR: lowered(paramsSrc(`  p: '${SUBJECT_R}'`)),
        clean: lowered(paramsSrc("  p: 'array<string>'")),
      },
      "an error-severity frontmatter diagnostic withholds the whole frontmatter object, so a " +
        "refused `params:` field lowers nothing — §Reproduction (e) row e4. A red reporting a " +
        "fragment for `subjectA` means the route admitted the over-application it was supposed " +
        "to refuse; a red on `clean` means it withheld a lowering it was never entitled to " +
        "withhold",
    ).toEqual({
      subjectA: "null",
      controlC: "null",
      subjectR: "null",
      clean: '{"type":"object","properties":{"p":{"type":"array","items":{"type":"string"}}},' +
        '"required":["p"],"additionalProperties":false}',
    });
  });
});

// ===========================================================================
// (C) THE UNWALKED TAIL — §Reproduction (c). RED at HEAD: c1 and c4, each
// measuring `ARITY(1)` where the specified list is the `void` refusal its
// byte-neighbour already draws.
// ===========================================================================

function tailCells(): Cell[] {
  return [
    // c1 — the second argument is `void` in a non-return position. It is
    // IDENTICAL to c2's and c3's second argument; the only difference is that
    // an earlier argument is a bracket group, which at HEAD keeps it out of
    // `node.args` and therefore out of `walkType`'s descent.
    {
      cell: "c1 let annotation, bracket carrier",
      src: theta('let x: Result<enum["a","b"], void> = 1'),
      expected: [VOIDPOS],
    },
    // c2 / c3 — the controls. GREEN now and after: they prove the rule fires
    // in the same constructor at the same position, so c1's silence is the
    // recovery leaking across an ARGUMENT boundary and nothing else.
    {
      cell: "c2 CONTROL let annotation, brace carrier",
      src: theta("let x: Result<{a: integer}, void> = 1"),
      expected: [VOIDPOS],
    },
    {
      cell: "c3 CONTROL let annotation, primitive carrier",
      src: theta("let x: Result<string, void> = 1"),
      expected: [VOIDPOS],
    },
    // c4 / c5 — the same pair at the `fn` parameter position (§Fix (c) Reach),
    // with the comma-free group as the carrier so the row is not explicable by
    // the interior comma.
    {
      cell: "c4 fn parameter, bracket carrier",
      src: theta('fn f(p: Result<enum["a"], void>): integer { 1 }'),
      expected: [VOIDPOS],
    },
    {
      cell: "c5 CONTROL fn parameter, brace carrier",
      src: theta("fn f(p: Result<{a: integer}, void>): integer { 1 }"),
      expected: [VOIDPOS],
    },
  ];
}

describe("bug 0236 (C) — every argument the source spells is walked", () => {
  it("rows c1–c5, the bracket carrier reaching its brace- and primitive-carrier controls", () => {
    expectGroup(
      tailCells(),
      "grammar.md:105 and code-registry-parse.md:66 put `void` in a generic argument " +
        "(`Result<void, E>`) squarely inside `theta/parse/void-in-non-return-position`, and " +
        "§Expected behaviour element 3 states that losing a rule because an EARLIER argument was " +
        "a bracket group is the recovery leaking across argument boundaries. A red at c1 or c4 " +
        "reporting `generic type 'Result' expects 2 type argument(s); got 1` instead of the " +
        "`void` line is bug 0236's third consequence: `walkType` descends `node.args` alone " +
        "(src/parser/type-grammar.ts) and the truncated argument is not in that list. c2, c3 and " +
        "c5 must stay GREEN in the same run — they are the proof the rule fires at all",
    );
  });
});

// ===========================================================================
// (D) NEIGHBOURS AND BOUNDS — §Reproduction (d). ALL GREEN now and after.
// ===========================================================================

function boundsCells(): Cell[] {
  return [
    {
      // d1 — a BARE bracket group at a `fn` parameter draws nothing today.
      // bug 0162 owns `theta/parse/inline-enum`'s trigger set and §Non-goals
      // excludes it: no route here raises that row anywhere new.
      cell: "d1 NO-MOVE bare group at a fn parameter",
      src: theta('fn f(p: enum["a","b"]): integer { 1 }'),
      expected: [],
    },
    {
      // d2 — ONE argument written, so there is no arity violation to lose. The
      // route must not manufacture one by counting the group's interior.
      cell: "d2 NO-MOVE one argument written",
      src: theta('fn f(p: array<enum["a"]>): integer { 1 }'),
      expected: [],
    },
    {
      // d3 — bug 0217's landed cell, unmoved: one argument is written, so no
      // arity line fires and the last-resort push stays the WHOLE output. This
      // is the cell that shows §Fix (b)'s replacement is a replacement and not
      // a repeal — where no position rule fires, 0217's refusal still stands
      // alone (code-registry-parse.md:105).
      cell: "d3 NO-MOVE bug 0217's cut-group refusal, one argument written",
      src: theta('schema S { a: array<enum["a","b"]> }'),
      expected: [SCHEMANOTEXPR("S")],
    },
    {
      // d4 — the inline-object carrier already refuses in a `.thetalib` where
      // the bracket carrier does not. GREEN in both trees; after the fix it is
      // the byte group (B)'s b9 `<A>` cell has converged on.
      cell: "d4 NO-MOVE .thetalib alias, brace carrier already refused",
      src: "schema T = array<{a: integer}, string>\n",
      path: "lib.thetalib",
      expected: [ARITY_A2],
    },
    {
      // d5 — bug 0233's widened key rule (0.196.0). The inline-object carrier's
      // own false `ARITY(1)` is gone (bug 0235, discharged); a bracket group
      // carries no inline object key, so this row moves neither way here.
      cell: "d5 NO-MOVE bug 0233's raw-key row at the brace carrier",
      src: theta("let x: Result<{a b: integer}, string> = 1"),
      expected: [NOTIDENT("a b")],
    },
  ];
}

describe("bug 0236 (D) — the neighbours and bounds §Reproduction (d) pins as unmoved", () => {
  it("rows d1–d5, all no-move", () => {
    expectGroup(
      boundsCells(),
      "§Non-goals scopes out whether an inline `enum[…]` is admitted at all (d1, d2 — bug 0162's " +
        "row, code-registry-parse.md:114), bug 0217's landed disposition where no position rule " +
        "fires (d3, code-registry-parse.md:105) and the inline-object carrier (d4, d5). All five " +
        "are GREEN at HEAD; a red here is the route reaching past this report's class",
    );
  });
});

// ===========================================================================
// (E) THE LOWERINGS AND THE THREE COUNTERS — §Reproduction (e) and (f). No
// diagnostic-list cell; byte-identical before and after.
// ===========================================================================

describe("bug 0236 (E) — no lowered byte and no lowering-side counter moves", () => {
  it("§Reproduction (e): the annotation-root lowerings are byte-identical after the fix", () => {
    // `lowerQueryResponseSchema(<annotation>, [], [])` is the call the
    // production theta producer makes for a query's response schema. Bug 0204
    // §Fix (b)(3) keeps `lowerTypeExpr`'s generic-argument split angle-only on
    // stated grounds, and §Fix's first settled fact binds this route to leave
    // every one of these bytes alone: route 1 changes `TypeParser` only. The
    // permissive `{}` is §Non-goals and is measured GROUND, not a claim.
    expect(
      {
        e1: JSON.stringify(lowerQueryResponseSchema(SUBJECT_A, [], [])),
        e2: JSON.stringify(lowerQueryResponseSchema('array<enum["a","b"]>', [], [])),
        e3: JSON.stringify(lowerQueryResponseSchema(SUBJECT_R, [], [])),
      },
      "§Reproduction (e) is measured ground kept byte-for-byte by §Fix's first settled fact " +
        "(bug 0204 §Fix (b)(3)); a red here means the route changed what a query's response " +
        "schema lowers to, which no row of this report claims",
    ).toEqual({ e1: "{}", e2: "{}", e3: "{}" });
  });

  it("§Reproduction (f): the two lowering-side argument counters are untouched", () => {
    // `splitTopLevel` (src/parser/params.ts) is the second and third counters'
    // shared splitter: `"angle-and-brace"` is the query peel's mode and
    // `"angle"` is `lowerTypeExpr`'s. Neither tracks `[…]`, and route 1 changes
    // neither — the count the fix repairs is `parseGeneric`'s, which is the
    // one the arity message reads. These six numbers are therefore the
    // route's containment fence on the counter multiplicity §Reproduction (f)
    // records as a hazard.
    const counts = (interior: string): Record<string, number> => ({
      angleAndBrace: splitTopLevel(interior, ",", "angle-and-brace").length,
      angle: splitTopLevel(interior, ",", "angle").length,
    });
    expect(
      {
        f1: counts('enum["a","b"], string'),
        f2: counts('enum["a","b"], string, integer'),
        f3: counts("[integer], string"),
      },
      "the lowering-side counters are bug 0204 §Fix (b)(3)'s and this route touches neither; a " +
        "red here means a fourth segmentation was added or an existing one re-cut, which §Fix " +
        "(a) route 2 — not route 1 — is the frame for",
    ).toEqual({
      f1: { angleAndBrace: 3, angle: 3 },
      f2: { angleAndBrace: 4, angle: 4 },
      f3: { angleAndBrace: 2, angle: 2 },
    });
  });
});

// ===========================================================================
// (F) THE FENCE — the route's own hazard surface. ALL 42 CELLS GREEN AT HEAD
// and all required to stay green. §Fix (a) route 1 changes a recovery every
// `Type` position shares, so every neighbouring production reading the same
// cursor is pinned here.
// ===========================================================================

/**
 * (F1) THE UNCLOSED GROUP, at every position. `array<enum["a","b">` never
 * closes its bracket group, so route 1's consumption does not apply and the
 * cursor keeps HEAD's tolerant skip-and-recurse. That is the authorised
 * under-refusal `theta/parse/schema-type-not-expression`'s row records
 * (code-registry-parse.md:105: "A bracket group the source never CLOSES … is
 * outside that push and stays under-refused with its pieces") and this
 * report's §Non-goals ("An UNCLOSED bracket group … Not measured here and not
 * claimed"). The `let` row's `let-without-initialiser` is that position's own
 * row: the annotation capture swallows the `= 1`.
 */
function unclosedCells(): Cell[] {
  return positionRows('array<enum["a","b">').map(([id, src, path]) => ({
    cell: `f1 UNCLOSED ${id}`,
    src,
    path,
    expected: id === "b5 let annotation" ? [LETNOINIT("x")] : [],
  }));
}

/**
 * (F2) BUG 0217's FOUR PUBLISHED REGISTRY EXAMPLES, verbatim from
 * `theta/parse/schema-type-not-expression`'s row (code-registry-parse.md:105)
 * and its `params:` mirror (code-registry-load.md:19). Each is a cell that row
 * asserts by name, so a red here is a spec-text falsification and not merely a
 * test failure.
 *
 *   * `array<enum["a","b"], ???>` — the last resort measured against the
 *     REFUSAL: the whole argument `???` is refusable, so the group adds none.
 *     `???` yields NO parsed argument, so `parseGeneric`'s count stays 1 under
 *     route 1 too, no arity line fires, and 0217's push still lands.
 *   * `pair<{a: string}, enum["x","y"]>` — `pair` is outside the closed
 *     `GenericType` set, so no arity row exists for it at any count.
 *   * `array<{a: string, b: integer, c: boolean}>` and
 *     `array<{a: Cat +, b: integer, c: boolean}>` — the brace-carrier
 *     under-refusals bug 0204 §Fix (b)(3) states. They carry no bracket group
 *     at all and are therefore parser-change-inert; they are pinned at all
 *     eight positions as the widest containment fence in this file.
 */
function registryExampleCells(): Cell[] {
  const cells: Cell[] = [];
  const schemaFeedingOnly: ReadonlyArray<readonly [string, string, readonly Exp[], readonly Exp[]]> =
    [
      [
        "f2a cut group beside a refusable argument",
        'array<enum["a","b"], ???>',
        [SCHEMANOTEXPR("S")],
        [LETRHS("x", 'array<enum["a","b"],???>', "integer")],
      ],
      [
        "f2b non-constructor head beside a cut group",
        'pair<{a: string}, enum["x","y"]>',
        [SCHEMANOTEXPR("S")],
        [],
      ],
    ];
  for (const [id, t, , letExpected] of schemaFeedingOnly) {
    for (const [pid, src, path] of positionRows(t)) {
      if (
        pid !== "b4 schema body field" &&
        pid !== "b6 alias RHS" &&
        pid !== "b9 .thetalib alias RHS" &&
        pid !== "b8 params: field" &&
        pid !== "b5 let annotation"
      ) {
        continue;
      }
      const expected: readonly Exp[] =
        pid === "b4 schema body field"
          ? [SCHEMANOTEXPR("S")]
          : pid === "b6 alias RHS" || pid === "b9 .thetalib alias RHS"
            ? [SCHEMANOTEXPR("T")]
            : pid === "b8 params: field"
              ? [PARAMSNOTEXPR("p")]
              : letExpected;
      cells.push({ cell: `${id} ${pid}`, src, path, expected });
    }
  }

  // The two brace-carrier under-refusals, at all eight positions. Their `let`
  // rows render the annotation back to the author — the first normalised with
  // spaces, the second verbatim — which is that position's own row and is
  // pinned as written.
  const braceCarriers: ReadonlyArray<readonly [string, string, Exp]> = [
    [
      "f2c brace-carrier under-refusal",
      "array<{a: string, b: integer, c: boolean}>",
      LETRHS("x", "array<{ a: string, b: integer, c: boolean }>", "integer"),
    ],
    [
      "f2d brace-carrier under-refusal carrying junk",
      "array<{a: Cat +, b: integer, c: boolean}>",
      LETRHS("x", "array<{a: Cat +, b: integer, c: boolean}>", "integer"),
    ],
  ];
  for (const [id, t, letExp] of braceCarriers) {
    for (const [pid, src, path] of positionRows(t)) {
      cells.push({
        cell: `${id} ${pid}`,
        src,
        path,
        expected: pid === "b5 let annotation" ? [letExp] : [],
      });
    }
  }
  return cells;
}

/**
 * (R) THE REACH ROWS AT THE `fn`-PARAMETER POSITION — §Fix (c) Reach requires
 * the disposition at all nine positions "for a bracket group that is not an
 * `enum` head (row a5), nested inside a brace interior (row a6), inside a union
 * arm (row a8) and inside a nested application (row a10)". Group (A) holds
 * those four at the `let` annotation; these are the same four one position
 * over, so the claim is not a single-position accident.
 *
 * RED at HEAD: all four measure `ARITY(1)`. Their specified list is empty
 * because `Result` applied to the two arguments the source spells is
 * well-formed at a `fn` parameter (grammar.md:107 admits `Result` there).
 */
function reachCells(): Cell[] {
  const rows: ReadonlyArray<readonly [string, string]> = [
    ["r-a5 no enum head", "Result<[integer], string>"],
    ["r-a6 inside a brace interior", 'Result<{a: enum["x"]}, string>'],
    ["r-a8 inside a union arm", 'Result<enum["a","b"] | integer, string>'],
    ["r-a10 inside a nested application", 'Result<array<enum["a","b"]>, string>'],
  ];
  return rows.map(([id, t]) => ({
    cell: `${id} at the fn parameter`,
    src: theta(`fn f(p: ${t}): integer { 1 }`),
    expected: [],
  }));
}

describe("bug 0236 (R) — §Fix (c) Reach: the same four shapes one position over", () => {
  it("the a5, a6, a8 and a10 shapes at the fn parameter, where group (A) holds them at the let annotation", () => {
    expectGroup(
      reachCells(),
      "§Fix (c) binds the disposition at all nine positions of §Reproduction (b), for both " +
        "constructors, and for a bracket group that is not an `enum` head, nested inside a brace " +
        "interior, inside a union arm and inside a nested application. These four are group (A)'s " +
        "a5, a6, a8 and a10 carried one position over, so the count claim is not a " +
        "single-position accident. `Result` applied to the two arguments the source spells is " +
        "well-formed at a `fn` parameter (grammar.md:107 admits `Result` in every non-schema " +
        "position), so the specified list is empty. A red reporting `generic type 'Result' " +
        "expects 2 type argument(s); got 1` is bug 0236 at this position",
    );
  });
});

/**
 * (F4) THE BARE GROUP AT EVERY POSITION keeps HEAD's disposition exactly.
 * `theta/parse/inline-enum` is anchored at the START of a schema field type or
 * an alias arm and fires nowhere else (code-registry-parse.md:114); `params:`
 * refuses the same text through its own row; the `fn`, query and `let`
 * positions draw nothing. Bug 0162 owns that trigger set and §Non-goals
 * excludes it — no route here raises the row anywhere new, and no route here
 * silences it where it already fires.
 */
function bareGroupCells(): Cell[] {
  return positionRows('enum["a","b"]').map(([id, src, path]) => {
    // b8 joined the INLINEENUM set when bug 0162 (0.209.0) landed mid-lane:
    // the params: top level now draws the position-specific inline-enum row
    // instead of the generic params-type-not-expression — a structurally
    // entailed composition flip ratified at this bug's merge under 0162's
    // authority; the truncation subject is unmoved.
    const expected: readonly Exp[] =
      id === "b4 schema body field" ||
      id === "b6 alias RHS" ||
      id === "b9 .thetalib alias RHS" ||
      id === "b8 params: field"
        ? [INLINEENUM]
        : [];
    return { cell: `f4 BARE ${id}`, src, path, expected };
  });
}

function fenceCells(): Cell[] {
  return [...unclosedCells(), ...registryExampleCells(), ...bareGroupCells()];
}

describe("bug 0236 (F) — the fence: every neighbouring production reading the same cursor, and every published cell of the rows this route touches", () => {
  it("f1 the unclosed group at eight positions, f2 bug 0217's four registry examples, f4 the bare group at eight positions", () => {
    expectGroup(
      fenceCells(),
      "§Fix (a) route 1 changes `TypeParser.parsePrimary`, a recovery every `Type` position and " +
        "four productions share, so it 'must measure every other production reading the same " +
        "cursor'. f1 is §Non-goals' UNCLOSED class and code-registry-parse.md:105's authorised " +
        "under-refusal: a group the source never closes is NOT consumed and that whole class is " +
        "unmoved. f2 are the four examples code-registry-parse.md:105 and " +
        "code-registry-load.md:19 assert by name — a red there falsifies published spec text. " +
        "f4 is bug 0162's trigger set, §Non-goals. EVERY cell in this group is GREEN at HEAD and " +
        "a red on any of them is the route reaching past this report's class",
    );
  });
});

// ===========================================================================
// (L) ANTI-VACUITY — the inventory arithmetic, recomputed from the tables.
// ===========================================================================

/** The whole diagnostic-list inventory, in group order. */
function allCells(): Cell[] {
  return [
    ...countCells(),
    ...positionCells(),
    ...tailCells(),
    ...boundsCells(),
    ...reachCells(),
    ...fenceCells(),
  ];
}

/** Declared inventory size — 14 + 25 + 5 + 5 + 4 + 42, recomputed below. */
const TOTAL_LIST_CELLS = 95;
/** Declared count of cells whose specified list is EMPTY. */
const EMPTY_LIST_CELLS = 47;
/** Declared count of cells whose specified list carries the arity row. */
const ARITY_BEARING_CELLS = 20;
/** Declared count of cells whose specified list carries the `void` row. */
const VOID_BEARING_CELLS = 6;

describe("bug 0236 (L) — the inventory this file asserts", () => {
  it("the cell tables carry the declared counts and no duplicate keys", () => {
    const cells = allCells();
    expect(
      cells.length,
      "the declared inventory (95 diagnostic-list cells, the LEDGER's own number) must match the " +
        "tables, so a cell added or dropped re-derives it",
    ).toBe(TOTAL_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.length === 0).length,
      "the empty-list cells are the correctly-counted applications (group (A)'s a1, a4–a11, " +
        "a13, a14), the `<R>` column's four non-schema-feeding positions, the two bare-group " +
        "bounds of group (D), and the fence's own silences; every other cell asserts a " +
        "non-empty ordered list, so a harness that stopped reaching the parser fails loudly " +
        "rather than turning empty expectations into silent passes",
    ).toBe(EMPTY_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.some((e) => e.code === GENERIC_ARITY)).length,
      "`theta/parse/generic-arity-mismatch` (code-registry-parse.md:65) is the row both faces of " +
        "this report move; its cell count is recomputed so a weakened expectation cannot pass " +
        "unnoticed",
    ).toBe(ARITY_BEARING_CELLS);
    expect(
      cells.filter((c) => c.expected.some((e) => e.code === VOID_NON_RETURN)).length,
      "`theta/parse/void-in-non-return-position` (code-registry-parse.md:66) is the unwalked " +
        "tail's witness row — group (C) plus group (A)'s a3",
    ).toBe(VOID_BEARING_CELLS);
    const keys = new Set(cells.map((c) => `${c.cell} :: ${c.src}`));
    expect(
      keys.size,
      "every cell key is distinct, so no cell is silently overwritten inside a group's map",
    ).toBe(cells.length);
  });
});
