import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0237 — an inline object entry whose TYPE position is empty truncates the
// interior at that entry: `TypeParser.parsePrimary`'s tolerant punctuation skip
// eats the entry-separating `,` and returns the NEXT entry's name as the empty
// entry's type, so every entry behind the empty one is absent from
// `TypeNode.fieldNames` and `TypeNode.fieldTypes` and every check those arrays
// feed is withheld
// (docs/bugs/0237-empty-inline-field-type-truncates-interior.md). This file is
// that report's §Fix (e) witness.
//
// THE MECHANISM (cited by symbol — a line number into
// src/parser/type-grammar.ts is bug 0134's stale-citation class, and the quoted
// text is the anchor; docs/STYLE.md §Citations). `TypeParser.parseObject`'s
// field loop reads `a`, eats its `:`, retains the name, and calls `parseUnion` →
// `parsePrimary`. `parsePrimary`'s last punctuation arm is unconditional:
//
//     // Unexpected punctuation: skip it to stay tolerant.
//     this.next();
//     return this.parsePrimary();
//
// (`TypeParser.parsePrimary`, src/parser/type-grammar.ts.) For
// `{a: , Zs: string}` the token it skips is the interior's own entry separator,
// and the recursion returns `{kind:"named", name:"Zs"}` as field `a`'s TYPE.
// Control returns to the loop sitting on the `:` that belonged to `Zs`, where
// `this.eatPunct(",")` fails, and the loop takes its genuine-end `break` —
// mid-interior, the exception `TypeNode`'s own doc comment stated BEFORE this
// fix: it read that an entry whose TYPE position is empty was the shape where
// `parsePrimary`'s tolerant punctuation skip swallowed that `,` and the break
// then fired mid-interior instead. The fix deletes that sentence, because the
// skip no longer crosses a separator its owner is still going to read.
// `fieldNames` then holds one name and `fieldTypes` one
// type, so `walkType`'s case pass over `node.fieldNames` and its field descent
// `for (const fieldType of node.fieldTypes)` judge one field and never see the
// rest. `interiorClosingBraceIndex`, the `interiorSource` slice and
// `inlineObjectFieldKeys` are computed off token offsets instead and stay
// complete, which is why the four raw-key rules still fire behind the empty
// entry (group (D)) and the lowering still mints the dropped keys (group (F)).
//
// Bug 0231's resynchronisation (`TypeParser.skipMalformedEntry`) hangs off the
// FAILURE of `eatPunct(":")` and cannot reach this shape: the entry spells its
// colon, which is the well-formed path.
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES (settled by the parent run inside §Fix (a)'s
// constraints, premeasured by it, and independently re-measured here)
// =====================================================================
// §Fix (a) ROUTE `resync-aware-skip`, UNPAIRED and NARROWED TO THE `,`: no new
// diagnostic code, no new registry row, no `permitted-codes.json` change. In
// `TypeParser.parsePrimary`'s tolerant punctuation arm a `,` standing at that
// position while a `parseObject` field loop or a `parseGeneric` argument list is
// OPEN is the entry separator that construct owns, so the arm returns
// `undefined` instead of consuming it. Nothing else is declined: a `}` or a `>`
// at a type position keeps the skip-and-recurse recovery exactly as at HEAD,
// because that shape is the empty-type-at-the-LAST-entry class §Reproduction (a)
// row a4 and §(g) rows g2–g3 measure as already refused identically to its
// controls and §Fix (c) forbids moving, and because declining a genuinely stray
// closer costs HEAD's own recovery of it (group (R), r11–r14: the nested
// `array<{a: >void}>` and `array<{a: }void>` cells keep every line HEAD draws).
// `parseObject`'s field loop then finds its
// `,` where it expects one and reads the whole interior; the empty entry
// contributes its NAME to `fieldNames` (pushed when its `:` was eaten) and NO
// entry to `fieldTypes`, so the two arrays are not index-aligned; and every
// check `fieldNames` / `fieldTypes` feed reaches the entries behind the empty
// one. Bug 0231's colon-gate resync is untouched.
//
// EVERY EXPECTATION BELOW IS THE SPECIFIED BEHAVIOUR, NOT THE CURRENT ONE. The
// parent run premeasured every cell against an experimental application of the
// route; this run re-derived all of them independently the same way (apply the
// arm, dump every cell through `parseDoc`, restore the tree byte-exact —
// `git hash-object src/parser/type-grammar.ts` back to
// `git rev-parse HEAD:src/parser/type-grammar.ts`, a5b9aff3 at the writing
// tree). The two measurements agree cell for cell.
//
// FOUR PLACES WHERE THE MEASURED AFTER-VALUE DIVERGES FROM THE PROSE AROUND IT,
// encoded here in the MEASURED form and commented at the cell:
//   1. §Reproduction (b) row b5's subject does NOT gain
//      `theta/parse/let-rhs-type-mismatch` beside the case line, so the b5
//      SUBJECT cell is not byte-identical to its own CONTROL cell (which keeps
//      both lines) — the one position where the two columns differ (group (B)).
//   2. §Reproduction (e) row e4 is a `schema`-position row only: at the `fn`
//      parameter position the subject, the control AND the order-reversed
//      spelling all measure `[]`, before and after (group (E)).
//   3. §Non-goals says no row here claims `Result<{a: , Zs: string}, string>`.
//      The route MOVES that cell anyway — measured twice, at HEAD an
//      `array`-style arity refusal of `Result` applied to ONE argument, after
//      the route the interior's own case line — because the separator the empty
//      type position stops eating is the `Result` argument list's own (group
//      (R), r4). The parent's own hand-off listed r4 among the cells that do not
//      move; the measurement contradicts that listing, and this file encodes the
//      measurement.
//   4. Group (C)'s c5 pair: the subject's `let-rhs-type-mismatch` renders the
//      annotation VERBATIM (`array<{a: , Zs: string}>`) while its control
//      renders the normalised spelling (`array<{ a: integer, Zs: string }>`).
//      Both are that position's own row (§Non-goals) and neither moves.
//   5. Group (R)'s r16 pair: `{a: ,void}` — an empty type position whose next
//      entry is a BARE `void` spelling no `:` at all — LOSES the
//      `void-in-non-return-position` line HEAD draws. HEAD drew it only through
//      the defect: the skip ate the `,` and handed `void` back as field `a`'s
//      type. With the `,` left standing, that second entry is a colon-less one
//      and bug 0231's `skipMalformedEntry` drops it, which is exactly what the
//      byte-neighbour control `{a: integer,void}` measures at HEAD and after
//      (`[]` in both trees). The pair therefore ENFORCES §Expected behaviour
//      point 1 — a field's verdict does not depend on a neighbour's spelling —
//      at the price of a line HEAD drew by accident, and both cells are
//      asserted rather than left to be discovered.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:101 — `ObjectType ::= "{" Field ("," Field)*
//     ","? "}"`; :109 — §"Inline object types": the inline `Field` reuses the
//     object-schema `Field` form, in any `Type` position, at any depth.
//   - docs/spec_topics/schemas.md:17 — field names are identifiers and field
//     types are any expression from the Type System grammar, which admits no
//     empty type text.
//   - docs/spec_topics/lexical.md:13 — `Ident`; :16 — the lowercase-first rule,
//     stated of EACH name, which is what makes the order dependence of
//     `{a: , Zs: string}` versus `{Zs: string, a: }` a defect.
//   - docs/spec_topics/type-system.md:15 — ONE type grammar in every
//     type-annotation position, which is why group (B) asserts all ten.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:19 —
//     `theta/parse/binding-case-mismatch`; :59 `let-rhs-type-mismatch`;
//     :65 `generic-arity-mismatch`; :66 `void-in-non-return-position`;
//     :67 `result-in-schema-position`; :98 `empty-schema-body` — the five
//     registered rows this defect withholds, plus the one position row two
//     cells read. :99–:102 — the four raw-key rows that still fire (group (D)).
//     :103 `malformed-alias-rhs`, :104 `schema-type-not-expression`,
//     :105 `annotation-type-not-expression` — the rows groups (G) and (R) pin.
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md) — the *Message*
//     column is normative and tests MUST source it from the registry. No message
//     prose is written out below; every expected string is read through
//     `parseRegistry` / `registryMessage`, so a reworded template reds by naming
//     the registry.
//
// THE LEDGER — 120 diagnostic-list cells in seven groups, recomputed from the
// cell tables by group (L) and verified by a run. What each group pins, and
// which cells are RED at HEAD:
//   - (A) THE SUBJECT AND ITS CONTROLS AT ONE POSITION, §Reproduction (a): 5
//     cells. a1 and a5 are RED (a1 expects one `binding-case-mismatch` against
//     an actual `[]`; a5 expects TWO, since the truncation drops EVERY entry
//     behind the empty one, not one). a2, a3 and a4 are GREEN now and after —
//     a4 (`{Zs: string, a: }`) is §Fix (c)'s explicit no-move bound.
//   - (B) THE SUBJECT AT TEN `Type` POSITIONS, in three columns — the subject
//     `{a: , Zs: string}`, its byte-neighbour control `{a: integer, Zs: string}`
//     and the order-reversed spelling `{Zs: string, a: }`: 30 cells. All ten
//     SUBJECT cells are RED (each `[]` at HEAD); the twenty control and
//     order-reversed cells are GREEN now and after, and are what §Expected
//     behaviour point 1 measures the subject against in both entry orders.
//   - (C) INSIDE A GENERIC ARGUMENT, against bug 0233's landed widen,
//     §Reproduction (c): 9 cells — four positions, each with its own control,
//     plus the order-reversed spelling at the `fn` one. The four subject cells
//     are RED (three `[]` at HEAD, and c5 short by the case line, which emits
//     BEFORE that position's own RHS gate); the five others are GREEN now and
//     after — bug 0233's widen already refuses the control there.
//   - (D) WHAT STILL FIRES BEHIND THE EMPTY ENTRY, §Reproduction (d): 12 cells —
//     d1–d5 each beside their own byte-neighbour control, plus d6 and its
//     control. d1–d5 are GREEN in both columns now and after (§Fix (c)'s no-move
//     list: the four raw-key rules read `interiorSource` and are untouched). d6
//     is RED — it GAINS the leading case line and thereby equals its own control,
//     which IS §Expected behaviour point 1.
//   - (E) THE FIVE WITHHELD ROWS, at BOTH the `fn` parameter and the `schema`
//     body field position, each in three columns (subject, control,
//     order-reversed), §Reproduction (e): 30 cells. NINE subject cells are RED
//     (e1, e2, e3 and e5 at both positions, e4 at the `schema` one); e4's whole
//     `fn` triple is GREEN now and after (divergence 2 above); the twenty
//     control and order-reversed cells are GREEN now and after.
//   - (F) THE LOWERINGS, §Reproduction (f): f1–f5 and f7 BYTE-UNCHANGED (the
//     lowerer divides the raw interior and no route here touches it), f6 RED —
//     the refused `params:` field withholds the WHOLE frontmatter object, so
//     `doc.frontmatter.params.loweredSchema` is unreachable and no
//     provider-facing `$defs` mints the uppercase key `Zs`, which is §Expected
//     behaviour point 4. Its third column, a lowercase-only `params:` interior,
//     keeps its frontmatter AND its `$defs` in both trees, so the cell cannot be
//     satisfied by withholding every `params:` lowering.
//   - (G) BOUNDS AND NEIGHBOURS, §Reproduction (g): 6 cells, ALL GREEN now and
//     after. g2/g3/g4 (`{a: }`, `{a:}`, `{a: , }`) STAY `[]`: this route is
//     UNPAIRED, so it draws no diagnostic for the empty position itself, and an
//     empty type at the LAST entry is the bound §(a) row a4 states. They are
//     pinned as no-move cells so a later pairing with a refusal (§Expected
//     behaviour point 2 widened to them) is visible here as a red rather than
//     landing unnoticed.
//   - (R) THE OTHER CALLERS OF `parsePrimary`, whose shared recovery this route
//     changes — the §Fix (a) route's own measurement obligation: 28 cells.
//     r1/r2 (union arms), r3 (an empty first generic argument), r5 (an interior
//     the source never closes) and r6 (an empty type inside a nested union arm)
//     are GREEN now and after; r4 (`Result<{a: , Zs: string}, string>`) is RED
//     and MOVES — see divergence 3. r7–r10, each with its own byte-neighbour
//     control, are the OWNERSHIP cells: a `,` standing where NO enclosing
//     construct is mid-read is still a stray token and still gets the
//     skip-and-recurse recovery, and a `}` or `>` is never declined at all, so
//     each of them keeps exactly the list its control draws. They are GREEN at
//     HEAD, RED against an unconditional exclusion arm, and GREEN after.
//     r11–r14 are the NESTED ownership cells: a stray `>` or `}` inside a
//     generic argument's inline interior (`array<{a: >void}>`,
//     `array<{a: }void>`) at the `fn` parameter and the `let` annotation, each
//     pinned at HEAD's whole list, which an arm that declined a closer an
//     enclosing construct will read would shorten. r15 is `,void` as a whole
//     annotation with no construct around it (the `@<T>` root), GREEN at HEAD
//     and after — the `,` there is owned by nothing and keeps the recovery that
//     reaches `void`. r16 is the one cell of this group that moves against HEAD
//     in the losing direction, and it moves onto its own control — see
//     divergence 5. r17/r17c and r18/r18c are the empty-union-arm-AHEAD-of-an-
//     owned-`,` class, at the inline field position and the generic argument
//     position respectively: the union arm's own empty RHS sits directly before
//     a separator this route now declines, so each subject MOVES from
//     `annotation-type-not-expression` at HEAD onto the position's own row
//     (r17: the case line; r18: the arity line), while each control — the same
//     arm spelled `void` — is unaffected by the route and keeps its own line
//     beside the moved one.
//   - (L) ANTI-VACUITY: the inventory arithmetic, recomputed from the tables.
//
// ORDERING IS PART OF THE ASSERTION. Every diagnostic cell is an ordered
// whole-list `toEqual` over the UNFILTERED `doc.diagnostics`, so neither an
// extra diagnostic nor a right diagnostic in a wrong order can hide inside a
// containment check or a `.some()`. Three orders are load-bearing and measured,
// not assumed: c5's and b5's case line precedes that position's own
// `let-rhs-type-mismatch`, d6's case line precedes the `b c` raw-key line (the
// identifier pass over `fieldNames` emits before the raw-key loop over
// `interiorSource`), and g6's declaration refusal precedes its case line.
//
// TIER: unit, offline, deterministic, provider-free — the tier this repository
// puts this kind of claim in, and the tier above buys no reach for the 120 list
// cells and the seven lowerings: every observable settles inside one
// `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts, the shipped load path behind the standard inert
// `parseDeps` double), one read of the settled document's own frontmatter
// object, or one direct lowerer call (`lowerQueryResponseSchema`,
// src/runtime/query-schema-lowering.ts). An integration tier would add a session
// round-trip to a parse-time value; a live tier would make a fully determined
// value stochastic. What the live tier DOES buy — that the refused `params:`
// document stops registering through the real discovery/registration path and
// that its refusal reaches the author, since this route changes what reaches a
// provider-facing schema (§Fix (e)'s live clause, group (F) f6) — is covered by
// the two files this witness ships beside:
// tests/live/inline-object-empty-field-type-truncation-live-cell.test.ts (H8a)
// and
// tests/live/acceptance/inline-object-empty-field-type-truncation-load-refusal.test.ts
// (H9a).
//
// ANTI-VACUITY / NO SILENT SKIPPING: nothing here early-returns, branches on the
// environment or conditionally skips. The registry lookup asserts its row's
// presence before the template is used, so a missing row reds by naming the
// registry. 108 of the 120 diagnostic-list cells expect a NON-EMPTY ordered list,
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

const BINDING_CASE = "theta/parse/binding-case-mismatch";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const VOID_NON_RETURN = "theta/parse/void-in-non-return-position";
const GENERIC_ARITY = "theta/parse/generic-arity-mismatch";
const EMPTY_BODY = "theta/parse/empty-schema-body";
const RESULT_IN_SCHEMA = "theta/parse/result-in-schema-position";
const NOT_IDENT = "theta/parse/inline-field-name-not-identifier";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";
const SCHEMA_NOT_EXPR = "theta/parse/schema-type-not-expression";
const ANNOTATION_NOT_EXPR = "theta/parse/annotation-type-not-expression";
const MALFORMED_ALIAS = "theta/parse/malformed-alias-rhs";
const FN_PARAM_NOT_IDENT = "theta/parse/fn-param-not-identifier";
const LET_NO_INIT = "theta/parse/let-without-initialiser";
const UNSUPPORTED = "theta/parse/unsupported-feature";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

/** Bug 0154's lowercase-first pass over `TypeNode.fieldNames` — the withheld row. */
const CASE: Exp = { severity: "error", code: BINDING_CASE, fills: [] };
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
const VOIDPOS: Exp = { severity: "error", code: VOID_NON_RETURN, fills: [] };
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
function EMPTY(subject: string): Exp {
  return { severity: "error", code: EMPTY_BODY, fills: [["<X>", subject]] };
}
const RESULTPOS: Exp = { severity: "error", code: RESULT_IN_SCHEMA, fills: [] };
function NOTIDENT(field: string): Exp {
  return { severity: "error", code: NOT_IDENT, fills: [["<field>", field]] };
}
function QUOTED(field: string): Exp {
  return { severity: "error", code: QUOTED_INLINE, fills: [["<field>", field]] };
}
function DUP(field: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", field]] };
}
function RENAMED(field: string): Exp {
  return { severity: "error", code: RENAMED_INLINE, fills: [["<field>", field]] };
}
function SCHEMANOTEXPR(subject: string): Exp {
  return { severity: "error", code: SCHEMA_NOT_EXPR, fills: [["<X>", subject]] };
}
function ANNOTNOTEXPR(name: string): Exp {
  return { severity: "error", code: ANNOTATION_NOT_EXPR, fills: [["<name>", name]] };
}
function ALIASRHS(subject: string): Exp {
  return { severity: "error", code: MALFORMED_ALIAS, fills: [["<X>", subject]] };
}
/** The `fn` parameter-name row — group (R)'s nested cells reach it */
const FNPARAM: Exp = { severity: "error", code: FN_PARAM_NOT_IDENT, fills: [] };
function LETNOINIT(name: string): Exp {
  return { severity: "error", code: LET_NO_INIT, fills: [["<name>", name]] };
}
function UNSUPP(construct: string): Exp {
  return { severity: "error", code: UNSUPPORTED, fills: [["<construct>", construct]] };
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

/** The subject interior — an entry whose TYPE position is empty */
const SUBJECT = "{a: , Zs: string}";
/** Its byte-neighbour control, the same two fields with a type spelled */
const CONTROL = "{a: integer, Zs: string}";
/** The order-reversed spelling of the subject: the empty entry LAST */
const REVERSED = "{Zs: string, a: }";

// ===========================================================================
// (A) THE SUBJECT AND ITS CONTROLS AT ONE POSITION — §Reproduction (a).
// RED at HEAD: a1 (`[]` against one case line) and a5 (`[]` against TWO).
// ===========================================================================

function subjectAndControlCells(): Cell[] {
  return [
    // a1 — the subject. §Expected behaviour point 1: `Zs` draws exactly what
    // `Zs` in the control draws, so this cell equals a2's list.
    { cell: "a1 subject ", src: theta(`fn f(p: ${SUBJECT}): integer { 1 }`), expected: [CASE] },
    { cell: "a2 control ", src: theta(`fn f(p: ${CONTROL}): integer { 1 }`), expected: [CASE] },
    // a3 — the order-reversed control. §Fix (b): the subject and its
    // order-reversed control agree per row.
    {
      cell: "a3 order-reversed control ",
      src: theta("fn f(p: {Zs: string, a: integer}): integer { 1 }"),
      expected: [CASE],
    },
    // a4 — §Fix (c)'s explicit no-move bound: an empty type position at the LAST
    // entry costs nothing, because the entries the loop already read are behind
    // it. GREEN now and after.
    {
      cell: "a4 NO-MOVE empty type at the last entry ",
      src: theta(`fn f(p: ${REVERSED}): integer { 1 }`),
      expected: [CASE],
    },
    // a5 — the loss is not one entry: EVERY entry behind the first empty type
    // position is dropped, so the specified list carries one case line per
    // uppercase name. Measured, not assumed.
    {
      cell: "a5 subject, two entries behind the empty one ",
      src: theta("fn f(p: {a: , Zs: string, Ys: integer}): integer { 1 }"),
      expected: [CASE, CASE],
    },
  ];
}

describe("bug 0237 (A) — the subject, its byte-neighbour control and its order-reversed control at one position", () => {
  it("rows a1–a5, with a4 the no-move bound and a5 the every-entry-behind claim ", () => {
    expectGroup(
      subjectAndControlCells(),
      "lexical.md:16 states the lowercase-first rule of EACH field name and grammar.md:109 says " +
        "the inline `Field` carries the same field semantics as the object-schema one, so `Zs` " +
        "draws the same verdict whatever its neighbour spells. A red at a1 or a5 reporting `[]` " +
        "is bug 0237: `TypeParser.parsePrimary`'s tolerant punctuation skip " +
        "(src/parser/type-grammar.ts) ate the entry separator and `TypeParser.parseObject`'s " +
        "field loop took its genuine-end break mid-interior, so `Zs` never reached " +
        "`TypeNode.fieldNames`. a2, a3 and a4 must stay GREEN in the same run — they are the " +
        "proof the case pass runs at all, and a4 is §Fix (c)'s no-move bound",
    );
  });
});

// ===========================================================================
// (B) THE SUBJECT AT TEN `Type` POSITIONS, in three columns.
// RED at HEAD: all ten subject cells measure `[]`.
// ===========================================================================

/**
 * The ten `Type` positions of §Reproduction (b), parameterised by interior. b7 is
 * b3 written in a `.thetalib`, which carries no frontmatter — the path is what
 * selects the library grammar, so it is passed explicitly. b8 is the verbatim
 * `params:` position. b9 is one nesting level down and b10 a union arm 
 */
function positionRows(
  interior: string,
): ReadonlyArray<readonly [string, string, string | undefined]> {
  return [
    ["b1 fn parameter", theta(`fn f(p: ${interior}): integer { 1 }`), undefined],
    ["b2 fn return", theta(`fn f(): ${interior} { 1 }`), undefined],
    ["b3 schema body field", theta(`schema S { a: ${interior} }`), undefined],
    ["b4 alias RHS", theta(`schema T = ${interior}`), undefined],
    ["b5 let annotation", theta(`let x: ${interior} = 1`), undefined],
    ["b6 @<T> annotation root", theta("let r = @<" + interior + ">`hi`"), undefined],
    ["b7 .thetalib schema body field", `schema S { a: ${interior} }\n`, "lib.thetalib"],
    ["b8 params: field", paramsSrc(`  p: '${interior}'`), undefined],
    ["b9 nested one level", theta(`schema S { a: { p: ${interior} } }`), undefined],
    ["b10 union arm", theta(`schema S { a: ${interior} | integer }`), undefined],
  ];
}

function positionCells(): Cell[] {
  const cells: Cell[] = [];
  for (const [id, src, path] of positionRows(SUBJECT)) {
    // MEASURED DIVERGENCE 1. §Reproduction (b) says row b5's subject loses "the
    // position's own RHS gate as well", which reads as a claim that the fix
    // restores it, and the hand-off generalised every §(b) subject cell to
    // "byte-identical to its own control cell". Measured twice against an
    // experimental application of route `resync-aware-skip`, b5 is the one
    // position where that is false: the subject annotation draws the case line
    // ALONE while its control keeps both lines. The withheld
    // `let-rhs-type-mismatch` at the subject is not this route's to restore and
    // no cell here claims it; what the route adds at b5 is the case line, which
    // is §Expected behaviour point 2 (the cell no longer loads clean).
    cells.push({ cell: `${id} subject `, src, path, expected: [CASE] });
  }
  for (const [id, src, path] of positionRows(CONTROL)) {
    cells.push({
      cell: `${id} control `,
      src,
      path,
      // The control's own measured list. b5 is the one position where a second
      // line stands beside the case line: the RHS gate answers `= 1` and renders
      // the annotation back to the author normalised
      // (`{ a: integer, Zs: string }`, spaced), which is that position's own row
      // (§Non-goals) and does not move.
      expected:
        id === "b5 let annotation"
          ? [CASE, LETRHS("x", "{ a: integer, Zs: string }", "integer")]
          : [CASE],
    });
  }
  for (const [id, src, path] of positionRows(REVERSED)) {
    // The ENTRY ORDER pinned in the other direction at every position (§Fix (e):
    // "the entry order pinned in both directions"). `{Zs: string, a: }` reaches
    // `parseObject`'s genuine end with both entries read at HEAD already, so
    // these twenty cells are GREEN in both trees and are what §Expected
    // behaviour point 1's order-independence claim is taken against.
    cells.push({ cell: `${id} order-reversed `, src, path, expected: [CASE] });
  }
  return cells;
}

describe("bug 0237 (B) — the subject at every Type position, params: and .thetalib included, beside its control and its order-reversed spelling", () => {
  it("rows b1–b10 in three columns ", () => {
    expectGroup(
      positionCells(),
      "type-system.md:15 states ONE type grammar in every type-annotation position and " +
        "grammar.md:109 admits the inline `Field` in any `Type` position at any depth, so the " +
        "disposition is the same at all ten. A red on a SUBJECT cell reporting `[]` is bug 0237 " +
        "(§Expected behaviour point 2: no input of this shape loads clean); the CONTROL and " +
        "ORDER-REVERSED cells are GREEN at HEAD and must stay GREEN, since the agreement " +
        "§Expected behaviour point 1 requires must be reached by adding the subject's refusal, " +
        "never by removing the control's",
    );
  });
});

// ===========================================================================
// (C) INSIDE A GENERIC ARGUMENT — §Reproduction (c), against bug 0233's landed
// widen. RED at HEAD: the four subject cells.
// ===========================================================================

function genericArgumentCells(): Cell[] {
  return [
    { cell: "c1 fn parameter, subject ", src: theta(`fn f(p: array<${SUBJECT}>): integer { 1 }`), expected: [CASE] },
    // c2 — the control bug 0233's widen (0.196.0) already refuses inside
    // `array<…>`. GREEN now and after: it is the proof the walk reaches the arm.
    {
      cell: "c2 NO-MOVE fn parameter, control inside array ",
      src: theta(`fn f(p: array<${CONTROL}>): integer { 1 }`),
      expected: [CASE],
    },
    {
      cell: "c2r NO-MOVE fn parameter, order-reversed inside array ",
      src: theta(`fn f(p: array<${REVERSED}>): integer { 1 }`),
      expected: [CASE],
    },
    { cell: "c3 schema body field, subject ", src: theta(`schema S { a: array<${SUBJECT}> }`), expected: [CASE] },
    {
      cell: "c3c NO-MOVE schema body field, control ",
      src: theta(`schema S { a: array<${CONTROL}> }`),
      expected: [CASE],
    },
    { cell: "c4 params: field, subject ", src: paramsSrc(`  p: 'array<${SUBJECT}>'`), expected: [CASE] },
    {
      cell: "c4c NO-MOVE params: field, control ",
      src: paramsSrc(`  p: 'array<${CONTROL}>'`),
      expected: [CASE],
    },
    {
      // c5 — ORDER CELL. That position's own RHS gate (§Non-goals) renders the
      // interior back to the author verbatim and already fires at HEAD; what the
      // route adds is the case line BEFORE it. The order is measured, not
      // assumed: the case pass emits during the type walk, the RHS gate after.
      cell: "c5 let annotation, subject, case line before that position's own RHS gate ",
      src: theta(`let x: array<${SUBJECT}> = 1`),
      expected: [CASE, LETRHS("x", `array<${SUBJECT}>`, "integer")],
    },
    {
      // MEASURED DIVERGENCE 4: the control's RHS gate renders the NORMALISED
      // annotation (interior spaces) while c5's subject renders the author's
      // bytes verbatim. Both are that position's own row and neither moves.
      cell: "c5c NO-MOVE let annotation, control, normalised annotation rendered ",
      src: theta(`let x: array<${CONTROL}> = 1`),
      expected: [CASE, LETRHS("x", "array<{ a: integer, Zs: string }>", "integer")],
    },
  ];
}

describe("bug 0237 (C) — inside a generic argument, where bug 0233's widen already reaches the control", () => {
  it("rows c1–c5 with their own controls and the reversed order at the fn position ", () => {
    expectGroup(
      genericArgumentCells(),
      "bug 0233 (0.196.0) widened `walkType`'s object arm to answer inside a generic argument, " +
        "so the control is refused at every position there; a red on a subject cell reporting " +
        "`[]` (c1, c3, c4) or missing the leading case line (c5) is bug 0237 defeating that " +
        "landed widen — the truncation empties the arrays the widened arm reads",
    );
  });
});

// ===========================================================================
// (D) WHAT STILL FIRES BEHIND THE EMPTY ENTRY — §Reproduction (d).
// GREEN now and after except d6, which GAINS the leading case line.
// ===========================================================================

function rawKeyCells(): Cell[] {
  const at = (interior: string): string => theta(`fn f(p: ${interior}): integer { 1 }`);
  // d1–d5 — §Fix (c)'s no-move list, each beside its own byte-neighbour control
  // (`a: integer` for `a: `). The four raw-key rules read
  // `TypeNode.interiorSource`, sliced from token offsets by
  // `interiorClosingBraceIndex`, which is complete however early the field loop
  // stopped; the route changes the loop, not the slice — so subject and control
  // agree in both trees 
  const rawRows: ReadonlyArray<readonly [string, string, string, Exp]> = [
    ["d1 quoted key", '{a: , "q": string}', '{a: integer, "q": string}', QUOTED('"q"')],
    [
      "d2 duplicate key",
      "{a: , q: string, q: integer}",
      "{a: integer, q: string, q: integer}",
      DUP("q"),
    ],
    ["d3 rename", '{a: , w as "x": integer}', '{a: integer, w as "x": integer}', RENAMED("w")],
    ["d4 space-broken key", "{a: , b c: integer}", "{a: integer, b c: integer}", NOTIDENT("b c")],
    ["d5 numeric key", "{a: , 3: string}", "{a: integer, 3: string}", NOTIDENT("3")],
  ];
  const cells: Cell[] = [];
  for (const [id, subject, control, expected] of rawRows) {
    cells.push({ cell: `${id} NO-MOVE subject `, src: at(subject), expected: [expected] });
    cells.push({ cell: `${id} NO-MOVE control `, src: at(control), expected: [expected] });
  }
  cells.push(
    {
      // d6 — §Expected behaviour point 1, asserted as an equality against the
      // byte-neighbour control on the cell below: the subject's list IS the
      // control's list. Bug 0231's fix report measured this cell as the `b c`
      // refusal alone; the route adds the case line for `Zs` in front of it, in
      // the measured order (the identifier pass over `fieldNames` before the
      // raw-key loop over `interiorSource`).
      cell: "d6 subject gains the case line and equals its control ",
      src: theta("let x: {a: , b c: integer, Zs: string} = 1"),
      expected: [CASE, NOTIDENT("b c")],
    },
    {
      cell: "d6 control ",
      src: theta("let x: {a: integer, b c: integer, Zs: string} = 1"),
      expected: [CASE, NOTIDENT("b c")],
    },
  );
  return cells;
}

describe("bug 0237 (D) — the raw-key rules keep their input, and d6's subject reaches its control's list", () => {
  it("rows d1–d6, each beside its byte-neighbour control ", () => {
    expectGroup(
      rawKeyCells(),
      "code-registry-parse.md:99–:102 are the four raw-key rows, fed by " +
        "`inlineObjectFieldKeys` over `TypeNode.interiorSource` rather than by the field loop's " +
        "arrays, so §Fix (c) pins d1–d5 unmoved in both columns. A red at d1–d5 means the route " +
        "damaged the interior slice. A red at d6 missing the leading `binding-case-mismatch` is " +
        "bug 0237: `Zs` behind the empty type position is unjudged while the same `Zs` in the " +
        "control beside it is refused, which is exactly the neighbour dependence §Expected " +
        "behaviour point 1 forbids",
    );
  });
});

// ===========================================================================
// (E) THE FIVE WITHHELD ROWS, at the `fn` parameter and `schema` body field
// positions, in three columns. RED at HEAD: nine subject cells; e4's `fn` triple
// does not move.
// ===========================================================================

/**
 * §Reproduction (e): the empty entry starves `walkType`'s field descent
 * `for (const fieldType of node.fieldTypes)`, so every rule reached only through
 * a field's own TYPE is withheld. Each row carries its byte-neighbour control
 * (`a: integer` for `a: `) and its order-reversed spelling (the empty entry
 * moved LAST), so the row is pinned in both entry orders 
 */
const WITHHELD_ROWS: ReadonlyArray<
  readonly [string, string, string, string, readonly Exp[], readonly Exp[]]
> = [
  // [id, subject, control, order-reversed, fn-position list, schema-position list]
  [
    "e1 void in a field type",
    "{a: , p: void}",
    "{a: integer, p: void}",
    "{p: void, a: }",
    [VOIDPOS],
    [VOIDPOS],
  ],
  [
    "e2 over-applied array",
    "{a: , p: array<integer, integer>}",
    "{a: integer, p: array<integer, integer>}",
    "{p: array<integer, integer>, a: }",
    [ARITY("array", "1", "2")],
    [ARITY("array", "1", "2")],
  ],
  [
    "e3 empty nested interior",
    "{a: , p: {}}",
    "{a: integer, p: {}}",
    "{p: {}, a: }",
    [EMPTY("{}")],
    [EMPTY("{}")],
  ],
  [
    // MEASURED DIVERGENCE 2. §Reproduction (e) records row e4 "at a `schema`
    // field" and says the two positions agree per row. They do not for this row,
    // before or after: `result-in-schema-position` is a SCHEMA-FEEDING-position
    // rule (code-registry-parse.md:67), and an `fn` parameter is not one, so all
    // THREE columns of the `fn` triple measure `[]` at HEAD and after. The triple
    // is kept as a no-move cell rather than dropped, so a route that started
    // refusing `Result` at an `fn` parameter is visible here.
    "e4 Result in a schema-feeding position",
    "{a: , p: Result<string, integer>}",
    "{a: integer, p: Result<string, integer>}",
    "{p: Result<string, integer>, a: }",
    [],
    [RESULTPOS],
  ],
  [
    "e5 nested uppercase field name",
    "{a: , p: { Zs: string }}",
    "{a: integer, p: { Zs: string }}",
    "{p: { Zs: string }, a: }",
    [CASE],
    [CASE],
  ],
];

function withheldCells(): Cell[] {
  const cells: Cell[] = [];
  for (const [id, subject, control, reversed, fnList, schemaList] of WITHHELD_ROWS) {
    for (const [column, interior] of [
      ["subject", subject],
      ["control", control],
      ["order-reversed", reversed],
    ] as ReadonlyArray<readonly [string, string]>) {
      cells.push({
        cell: `${id} — fn parameter, ${column} `,
        src: theta(`fn f(p: ${interior}): integer { 1 }`),
        expected: fnList,
      });
      cells.push({
        cell: `${id} — schema body field, ${column} `,
        src: theta(`schema S { a: ${interior} }`),
        expected: schemaList,
      });
    }
  }
  return cells;
}

describe("bug 0237 (E) — the five registered rows the field descent withholds, at two positions, in three columns", () => {
  it("rows e1–e5 at the fn parameter and the schema body field: subject, control and order-reversed ", () => {
    expectGroup(
      withheldCells(),
      "code-registry-parse.md:65, :66, :67, :98 and :19 are the five rows reached through " +
        "`walkType`'s field descent over `TypeNode.fieldTypes` and its case pass over " +
        "`TypeNode.fieldNames`; §Expected behaviour point 3 requires all five to fire from " +
        "existing code at the interior's own level and at nested depth (e5). A red on a SUBJECT " +
        "cell reporting `[]` against its control's list is bug 0237: the truncation dropped the " +
        "field the rule judges. The CONTROL and ORDER-REVERSED cells are GREEN at HEAD and must " +
        "stay GREEN",
    );
  });
});

// ===========================================================================
// (F) THE LOWERINGS — §Reproduction (f). f1–f5 and f7 byte-unchanged; f6 RED.
// ===========================================================================

describe("bug 0237 (F) — the annotation-root lowerings do not move, and the refused params: document lowers nothing", () => {
  it("f1–f5 and f7: `lowerQueryResponseSchema` is byte-identical after the fix ", () => {
    // `lowerQueryResponseSchema(<annotation>, [], [])` is the call the production
    // theta producer makes for a query's response schema. Route
    // `resync-aware-skip` changes `TypeParser`, and the lowerer divides the raw
    // interior with its own splitter, so these bytes are the tripwire: they
    // record the disagreement between the parser's field set and the lowering's
    // property set that §Reproduction (f) names, and no route here touches them.
    // §Non-goals scopes the lowering's field division out.
    const actual = {
      f1: JSON.stringify(lowerQueryResponseSchema(SUBJECT, [], [])),
      f2: JSON.stringify(lowerQueryResponseSchema("{a: , Zs: string, Ys: integer}", [], [])),
      f3: JSON.stringify(lowerQueryResponseSchema("{a: }", [], [])),
      f4: JSON.stringify(lowerQueryResponseSchema("{a: , p: void}", [], [])),
      f5: JSON.stringify(lowerQueryResponseSchema(`array<${SUBJECT}>`, [], [])),
      f7: JSON.stringify(lowerQueryResponseSchema(CONTROL, [], [])),
    };
    expect(
      actual,
      "these six lowerings are §Fix (c)'s no-move bytes, f7 (a well-formed interior) explicitly " +
        "among them; a red here means the route changed what a query's response schema lowers to",
    ).toEqual({
      f1: '{"type":"object","properties":{"Zs":{"type":"string"}},"required":["Zs"],"additionalProperties":false}',
      f2:
        '{"type":"object","properties":{"Zs":{"type":"string"},"Ys":{"type":"integer"}},' +
        '"required":["Zs","Ys"],"additionalProperties":false}',
      f3: '{"type":"object","properties":{},"required":[],"additionalProperties":false}',
      f4: '{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}',
      f5: "{}",
      f7:
        '{"type":"object","properties":{"a":{"type":"integer"},"Zs":{"type":"string"}},' +
        '"required":["a","Zs"],"additionalProperties":false}',
    });
  });

  it("f6: the refused params: field withholds the whole frontmatter object, so no $defs mints the uppercase key ", () => {
    // §Expected behaviour point 4 — the parser's field set and the lowering's
    // property set agree, so no key that reaches `$defs` escaped the case rule.
    // Under this route the agreement is reached by REFUSING the document: an
    // error-severity frontmatter diagnostic withholds the whole frontmatter
    // object, so `doc.frontmatter` is null and `params.loweredSchema` is
    // unreachable. At HEAD the document registers and mints
    // `"$defs":{"__inline_41292d1fcb4b229d":{…"properties":{"Zs":…}}}` — the
    // uppercase wire key bug 0154's pass exists to refuse.
    //
    // TWO CONTROLS, so the cell cannot be satisfied by withholding every
    // `params:` lowering. The byte-neighbour control (`{a: integer, Zs: string}`)
    // is ALREADY refused at HEAD — its own uppercase key draws the case line — so
    // its frontmatter is withheld in both trees. The lowercase-only third column
    // (`{a: integer, b: string}`) keeps its frontmatter AND mints its `$defs`
    // hoist in both trees, which is the proof this harness still reaches the
    // `params:` lowering at all.
    const subject = paramsSrc(`  p: '${SUBJECT}'`);
    const control = paramsSrc(`  p: '${CONTROL}'`);
    const clean = paramsSrc("  p: '{a: integer, b: string}'");
    expect(
      {
        subjectFrontmatterWithheld: parseDoc(subject).frontmatter === null,
        subjectLowered: loweredParams(subject),
        controlFrontmatterWithheld: parseDoc(control).frontmatter === null,
        controlLowered: loweredParams(control),
        cleanFrontmatterWithheld: parseDoc(clean).frontmatter === null,
        cleanLowered: loweredParams(clean),
      },
      "the frontmatter gate withholds the WHOLE frontmatter object on any error-severity " +
        "frontmatter diagnostic, so a refused `params:` field lowers nothing; a red reporting " +
        "`subjectFrontmatterWithheld: false` with a `$defs` document naming `Zs` is bug 0237 " +
        "reaching the provider (§Reproduction (f) row f6). A red on the CLEAN column instead " +
        "means the route withheld a lowering it was never entitled to withhold",
    ).toEqual({
      subjectFrontmatterWithheld: true,
      subjectLowered: "null",
      controlFrontmatterWithheld: true,
      controlLowered: "null",
      cleanFrontmatterWithheld: false,
      cleanLowered:
        '{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_9b890568745f5ea5"}},' +
        '"required":["p"],"additionalProperties":false,"$defs":{"__inline_9b890568745f5ea5":' +
        '{"type":"object","properties":{"a":{"type":"integer"},"b":{"type":"string"}},' +
        '"required":["a","b"],"additionalProperties":false}}}',
    });
  });
});

// ===========================================================================
// (G) BOUNDS AND NEIGHBOURS — §Reproduction (g). ALL GREEN now and after.
// ===========================================================================

function boundsCells(): Cell[] {
  return [
    {
      // g1 — the declaration-position precedent: the same empty type text at a
      // `schema` body field's own declaration is already refused.
      cell: "g1 NO-MOVE declaration position already refuses ",
      src: theta("schema S { a: }"),
      expected: [SCHEMANOTEXPR("S")],
    },
    // g2/g3/g4 — the SETTLED DISPOSITION of this run: route `resync-aware-skip`
    // is taken UNPAIRED, so it draws no diagnostic for the empty position itself,
    // and an empty type position at the LAST entry is out of this bug's subject —
    // the bound §Reproduction (a) row a4 states. They therefore STAY `[]`,
    // measured against an experimental application of the route. They are pinned
    // as no-move cells so a later pairing with a refusal is visible here as a red
    // rather than landing unnoticed.
    { cell: "g2 NO-MOVE single empty entry ", src: theta("fn f(p: {a: }): integer { 1 }"), expected: [] },
    { cell: "g3 NO-MOVE single empty entry, no space ", src: theta("fn f(p: {a:}): integer { 1 }"), expected: [] },
    {
      cell: "g4 NO-MOVE empty entry with a trailing comma ",
      src: theta("fn f(p: {a: , }): integer { 1 }"),
      expected: [],
    },
    // g5 — §Fix (c): the grammar's own optional trailing comma
    // (`grammar.md:101` `","?`) stays legal.
    { cell: "g5 NO-MOVE legal trailing comma ", src: theta("schema S { a: integer, }"), expected: [] },
    {
      // g6 — the empty type position at a DECLARATION field, with a well-formed
      // uppercase field behind it: both lines already fire, in this order.
      cell: "g6 NO-MOVE declaration field, both lines ",
      src: theta("schema S { Zs: , a: string }"),
      expected: [SCHEMANOTEXPR("S"), CASE],
    },
  ];
}

describe("bug 0237 (G) — the bounds: the declaration-position precedent, the legal trailing comma, and the last-entry class", () => {
  it("rows g1–g6, all no-move ", () => {
    expectGroup(
      boundsCells(),
      "grammar.md:101's optional trailing comma makes g5 legal and §Fix (c) pins it; g1 and g6 " +
        "are the declaration-position precedent (code-registry-parse.md:104) and must not move; " +
        "g2–g4 are the settled disposition of the UNPAIRED route `resync-aware-skip` — an empty " +
        "type position at the LAST entry is the bound §Reproduction (a) row a4 states and is not " +
        "refused by this route, so a red here is a widen that must be stated at the cell before " +
        "it lands",
    );
  });
});

// ===========================================================================
// (R) THE OTHER CALLERS OF `parsePrimary`. The route changes a recovery every
// `Type` position shares, so each caller is pinned. RED at HEAD: r4, r17 and
// r18.
// ===========================================================================

function otherCallerCells(): Cell[] {
  return [
    {
      // r1 — a union arm with no `Type` on its right, inside an inline object
      // field (`parseUnion`'s arm loop). The whole annotation is already refused
      // as non-derivable; the route must not move that.
      cell: "r1 NO-MOVE empty union arm in an inline field type ",
      src: theta("fn f(p: {a: integer | }): integer { 1 }"),
      expected: [ANNOTNOTEXPR("p")],
    },
    {
      // r2 — the same empty arm at an alias RHS, which has its own row.
      cell: "r2 NO-MOVE empty union arm at an alias RHS ",
      src: theta("schema T = integer | "),
      expected: [ALIASRHS("T")],
    },
    {
      // r3 — an empty FIRST generic argument: `parseGeneric` calls `parseUnion`
      // before the `,` loop, so the `,` this route stops eating is the argument
      // list's own. Measured `[]` before and after (the arity check counts one
      // argument either way).
      cell: "r3 NO-MOVE empty first generic argument ",
      src: theta("fn f(p: array<,integer>): integer { 1 }"),
      expected: [],
    },
    {
      // r4 — MEASURED DIVERGENCE 3. §Non-goals says the enclosing generic
      // argument count "belongs to bug 0235's frame … no row here claims it", and
      // the hand-off listed this cell among those that do not move. Measured
      // twice, it MOVES, and the move is asserted rather than left to be
      // discovered: at HEAD the empty type position eats the interior's `,` and
      // then the argument list's own, so `Result` is applied to ONE argument and
      // draws `generic-arity-mismatch` ("expects 2 type argument(s); got 1");
      // once the skip stops crossing a separator the enclosing construct owns,
      // the list has its two arguments and the interior's `Zs` draws the case
      // line instead. Both dispositions refuse the source; the code changes.
      cell: "r4 Result argument list, arity line replaced by the case line ",
      src: theta(`fn f(p: Result<${SUBJECT}, string>): integer { 1 }`),
      expected: [CASE],
    },
    {
      // r5 — an interior the source never closes. `interiorClosingBraceIndex`
      // finds no depth-0 `}`, so `closingBraceSpelled` is false and the whole arm
      // is withheld; §Non-goals keeps that class out, and the route must not move
      // it even though it changes the loop's token consumption.
      cell: "r5 NO-MOVE interior the source never closes ",
      src: theta(`fn f(p: {a: , Zs: string): integer { 1 }`),
      expected: [],
    },
    {
      // r6 — an empty type position inside a NESTED union arm, one level below
      // the interior whose separator is at stake. Measured `[]` before and after:
      // the nested interior's own last entry is the empty one, which is the
      // g2–g4 class at depth.
      cell: "r6 NO-MOVE empty type in a nested union arm ",
      src: theta("fn f(p: {a: {x: } | integer}): integer { 1 }"),
      expected: [],
    },
    // r7–r10 — OWNERSHIP AT THE TOP LEVEL. The route declines a `,` because an
    // enclosing construct is still going to read it, so the decline must ask
    // whether such a construct is OPEN and not merely what the text is. Each
    // cell spells a stray `>` where nothing owns it — a stray token, whose only
    // recovery is `parsePrimary`'s skip-and-recurse arm — beside the
    // byte-neighbour control with the stray token deleted. Subject and control
    // agree per cell, at HEAD and after; an exclusion arm that declined the
    // text unconditionally would swallow the rest of the type expression and
    // red all four subject cells against their controls (measured: all four
    // then draw `[]`).
    {
      cell: "r7 stray `>` in an inline field type, fn parameter ",
      src: theta("fn f(p: {a: >void, Zs: string}): integer { 1 }"),
      expected: [CASE, VOIDPOS],
    },
    {
      cell: "r7c control, the same interior without the stray `>` ",
      src: theta("fn f(p: {a: void, Zs: string}): integer { 1 }"),
      expected: [CASE, VOIDPOS],
    },
    {
      cell: "r8 stray `>` in an inline field type, let annotation ",
      src: theta("let x: {a: >void, Zs: string} = 1"),
      expected: [CASE, VOIDPOS],
    },
    {
      cell: "r8c control, the same let annotation without the stray `>` ",
      src: theta("let x: {a: void, Zs: string} = 1"),
      expected: [CASE, VOIDPOS],
    },
    {
      cell: "r9 stray `>` at a whole annotation, no interior at all ",
      src: theta("fn f(p: >void): integer { 1 }"),
      expected: [VOIDPOS],
    },
    {
      cell: "r9c control, the same annotation without the stray `>` ",
      src: theta("fn f(p: void): integer { 1 }"),
      expected: [VOIDPOS],
    },
    {
      cell: "r10 stray `>` at a union arm, no interior at all ",
      src: theta("fn f(p: string | >void): integer { 1 }"),
      expected: [VOIDPOS],
    },
    {
      cell: "r10c control, the same union without the stray `>` ",
      src: theta("fn f(p: string | void): integer { 1 }"),
      expected: [VOIDPOS],
    },
    // r11–r14 — OWNERSHIP AT NESTED DEPTH, which is where the decline's WIDTH
    // is decided. A stray `>` or `}` standing at a type position INSIDE a
    // generic argument's inline interior has two constructs open around it (the
    // `parseObject` field loop and the `parseGeneric` argument list), and the
    // NEARER of them is not the one whose closer the text resembles. Declining
    // a closer on the strength of "some enclosing construct will read one"
    // therefore yields no type where HEAD recovered past the stray token, and
    // the diagnostic the recursion goes on to draw is LOST — measured: with a
    // closer-declining arm, r11 keeps `fn-param-not-identifier` alone and r12
    // draws `[]`. The decline is narrowed to the `,` alone for that reason, and
    // these four cells pin HEAD's whole list at both positions so a later
    // widening reds here rather than silently shortening a list.
    {
      cell: "r11 stray `>` inside a generic argument's inline interior, fn parameter ",
      src: theta("fn f(p: array<{a: >void}>): integer { 1 }"),
      expected: [VOIDPOS, FNPARAM],
    },
    {
      cell: "r12 stray `}` inside a generic argument's inline interior, fn parameter ",
      src: theta("fn f(p: array<{a: }void>): integer { 1 }"),
      expected: [VOIDPOS],
    },
    {
      // The shared byte-neighbour control for r11 and r12: the same nested
      // interior with the stray closer deleted.
      cell: "r11c/r12c control, the nested interior without the stray closer, fn parameter ",
      src: theta("fn f(p: array<{a: void}>): integer { 1 }"),
      expected: [VOIDPOS],
    },
    {
      // r13 — the same stray `>` at the `let` annotation, where the capture's
      // own stop set severs the annotation and three tokens land in statement
      // position. The five-line list is HEAD's, pinned verbatim.
      cell: "r13 stray `>` inside a generic argument's inline interior, let annotation ",
      src: theta("let x: array<{a: >void}> = 1"),
      expected: [
        LETNOINIT("x"),
        VOIDPOS,
        UNSUPP("stray '}' in statement position"),
        UNSUPP("stray '>' in statement position"),
        UNSUPP("stray '=' in statement position"),
      ],
    },
    {
      cell: "r14 stray `}` inside a generic argument's inline interior, let annotation ",
      src: theta("let x: array<{a: }void> = 1"),
      expected: [VOIDPOS, LETRHS("x", "array<{a: }void>", "integer")],
    },
    {
      cell: "r13c/r14c control, the nested interior without the stray closer, let annotation ",
      src: theta("let x: array<{a: void}> = 1"),
      expected: [VOIDPOS, LETRHS("x", "array<{a: void}>", "integer")],
    },
    {
      // r15 — `,void` as a WHOLE annotation, at the `@<T>` root, where no field
      // loop and no argument list is open around the `,`. The decline asks the
      // parse state, so the `,` is a stray token here and keeps the
      // skip-and-recurse recovery that reaches `void`. GREEN at HEAD and after.
      cell: "r15 `,void` as a whole annotation, nothing owning the `,` ",
      src: theta("let r = @<,void>`hi`"),
      expected: [VOIDPOS],
    },
    {
      cell: "r15c control, the same annotation without the leading `,` ",
      src: theta("let r = @<void>`hi`"),
      expected: [VOIDPOS],
    },
    {
      // r16 — MEASURED DIVERGENCE 5. The empty type position's next entry is a
      // BARE `void` with no `:`, so once the `,` stands the entry is
      // colon-less and bug 0231's `skipMalformedEntry` drops it. HEAD drew
      // `void-in-non-return-position` here only because the eaten `,` handed
      // `void` back as field `a`'s type. Its control measures `[]` at HEAD and
      // after, so the pair is §Expected behaviour point 1 holding.
      cell: "r16 empty type position ahead of a bare `void` entry, HEAD's line lost ",
      src: theta("fn f(p: {a: ,void}): integer { 1 }"),
      expected: [],
    },
    {
      cell: "r16c control, a spelled type ahead of the same bare `void` entry ",
      src: theta("fn f(p: {a: integer,void}): integer { 1 }"),
      expected: [],
    },
    {
      // r17 — the empty-union-arm-AHEAD-of-an-owned-`,` class: the union arm's
      // own empty RHS sits directly before the `parseObject` field loop's `,`,
      // which this route's decline now leaves standing for that loop to read.
      // At HEAD the tolerant skip ate that `,` (returning `Zs` as the arm's own
      // RHS), so the whole annotation drew `annotation-type-not-expression`
      // (re-measured: HEAD's actual list is that one line). Once the skip
      // declines the owned separator, the field loop reads both its fields and
      // the second one's case violation is what the interior draws instead.
      cell: "r17 empty union arm directly ahead of an owned `,`, inline field ",
      src: theta("fn f(p: {a: integer | , Zs: string}): integer { 1 }"),
      expected: [CASE],
    },
    {
      // The byte-neighbour control: the same arm spelled `void` instead of
      // empty. Unaffected by the route — no empty type position, so no `,` is
      // ever a candidate for the decline — and measures the same list at HEAD
      // and after.
      cell: "r17c control, the same union arm spelled `void` ahead of the same owned `,` ",
      src: theta("fn f(p: {a: integer | void, Zs: string}): integer { 1 }"),
      expected: [CASE, VOIDPOS],
    },
    {
      // r18 — the same class one level up: the union arm's empty RHS sits
      // directly before the `parseGeneric` argument list's own `,`. At HEAD the
      // skip ate that separator too, so `array` read the union's RHS and the
      // next argument as ONE argument's worth of tokens and drew
      // `annotation-type-not-expression` (re-measured: HEAD's actual list is
      // that one line). Once the skip declines the owned separator, `array`
      // reads its two arguments and the arity line is what it draws instead.
      cell: "r18 empty union arm directly ahead of an owned `,`, generic argument list ",
      src: theta("fn f(p: array<integer | , string>): integer { 1 }"),
      expected: [ARITY("array", "1", "2")],
    },
    {
      // The byte-neighbour control: the same arm spelled `void` instead of
      // empty. Unaffected by the route for the same reason as r17c.
      cell: "r18c control, the same union arm spelled `void` ahead of the same owned `,` ",
      src: theta("fn f(p: array<integer | void, string>): integer { 1 }"),
      expected: [ARITY("array", "1", "2"), VOIDPOS],
    },
  ];
}

describe("bug 0237 (R) — the other callers of parsePrimary, whose shared recovery this route changes", () => {
  it("rows r1–r6: union arms, generic argument lists, an unclosed interior and a nested arm ", () => {
    expectGroup(
      otherCallerCells(),
      "§Fix (a) route `resync-aware-skip` requires the other callers of " +
        "`TypeParser.parsePrimary` (src/parser/type-grammar.ts) be measured, since the tolerant " +
        "punctuation skip is reached from `parseUnion`'s arm loop, `parseGeneric`'s argument list " +
        "and every nested interior. r1, r2, r3, r5 and r6 are GREEN at HEAD and must stay GREEN; " +
        "r4 is the one cell this route moves outside the bug's own tables, and it moves from one " +
        "refusal to another; r7\u2013r10 and r15 pin the OWNERSHIP boundary \u2014 a `,` standing where " +
        "no `parseObject` field loop and no `parseGeneric` argument list is open is a stray token " +
        "and keeps the skip-and-recurse recovery, so each subject draws exactly what its " +
        "byte-neighbour control draws; r11\u2013r14 pin the NESTED closers, which this route does not " +
        "decline at all, at HEAD's whole list; r16 is the one cell that loses a line HEAD drew, " +
        "onto its own control; and r17/r18, each with its own byte-neighbour control, are the " +
        "empty-union-arm-AHEAD-of-an-owned-`,` class — a union arm's own empty RHS sitting " +
        "directly before a separator this route now declines, so each subject MOVES from " +
        "`annotation-type-not-expression` at HEAD onto that position's own row while its control, " +
        "the same arm spelled `void`, is unaffected and keeps its own line beside the moved one",
    );
  });
});

// ===========================================================================
// (L) ANTI-VACUITY — the inventory arithmetic, recomputed from the tables.
// ===========================================================================

/** The whole diagnostic-list inventory, in group order. */
function allCells(): Cell[] {
  return [
    ...subjectAndControlCells(),
    ...positionCells(),
    ...genericArgumentCells(),
    ...rawKeyCells(),
    ...withheldCells(),
    ...boundsCells(),
    ...otherCallerCells(),
  ];
}

/** Declared inventory size — 5 + 30 + 9 + 12 + 30 + 6 + 28, recomputed below. */
const TOTAL_LIST_CELLS = 120;
/** Declared count of cells whose specified list is EMPTY. */
const EMPTY_LIST_CELLS = 12;
/** Declared count of cells whose specified list carries the withheld case row. */
const CASE_BEARING_CELLS = 60;

describe("bug 0237 (L) — the inventory this file asserts", () => {
  it("the cell tables carry the declared counts and no duplicate keys ", () => {
    const cells = allCells();
    expect(
      cells.length,
      "the declared inventory (120 diagnostic-list cells, the LEDGER's own number) must match " +
        "the tables, so a cell added or dropped re-derives it",
    ).toBe(TOTAL_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.length === 0).length,
      "only twelve cells expect nothing — the ten no-move silences (g2–g5, r3, r5, r6 and e4's " +
        "three `fn` columns) plus group (R)'s r16 pair, where the subject joins its control's " +
        "measured silence (divergence 5); " +
        "every other cell asserts a non-empty ordered list, so a harness that stopped reaching " +
        "the parser fails loudly rather than passing vacuously",
    ).toBe(EMPTY_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.some((e) => e.code === BINDING_CASE)).length,
      "`theta/parse/binding-case-mismatch` (code-registry-parse.md:19) is the row this defect " +
        "withholds at most cells; its count is recomputed so a weakened expectation cannot pass " +
        "unnoticed",
    ).toBe(CASE_BEARING_CELLS);
    const keys = new Set(cells.map((c) => `${c.cell} :: ${c.src}`));
    expect(
      keys.size,
      "every cell key is distinct, so no cell is silently overwritten inside a group's map",
    ).toBe(cells.length);
  });
});
