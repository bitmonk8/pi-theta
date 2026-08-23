import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0244 — an inline object type entry that spells no top-level `:` is
// consumed by `TypeParser.parseObject`'s recovery arms and is invisible to
// every rule that judges an interior, so `fn f(p: {a: integer, void}): integer
// { 1 }` reports `[]` and registers, and a `params:` field declaring
// `p: '{void}'` lowers `p` to the permissive `{}` the same fragment
// `theta/parse/empty-schema-body` exists to refuse
// (docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md). This
// file is that report's §Fix "Witness".
//
// THE MECHANISM (cited BY SYMBOL — docs/STYLE.md §Citations, and bug 0134
// (docs/bugs/0134-params-shift-induced-stale-citations.md) is the adjudicated
// stale-citation class for absolute line numbers into the parser modules a fix
// here edits). `TypeParser.parseObject` (src/parser/type-grammar.ts) reads an
// interior entry by entry. An entry whose field-name position holds an `ident`
// with no `:` behind it reaches bug 0231's resync: `TypeParser.skipMalformedEntry`
// advances to the next depth-0 `,` and the loop continues. An entry whose
// field-name position holds a non-`ident` token takes the arm beside it, which
// taints the entry and calls `next()`. Both discard the entry; neither emits.
// Nothing downstream recovers it: `walkType`'s case pass and its field descent
// read `TypeNode.fieldNames` / `TypeNode.fieldTypes`, which the resync never
// wrote, and `inlineObjectFieldKeys` (src/parser/type-grammar.ts) keys each
// entry on the text before that entry's own top-level colon — its own doc
// comment states the exclusion, "An entry with no top-level `:` contributes no
// key". The two lowerers keyed on the same split, `hoistInlineObjectType`
// (src/parser/params.ts) and `lowerInlineObject`
// (src/parser/body-type-lowering.ts), write no property for the entry either.
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES, AND THE OPERATOR ADJUDICATION THAT SCOPES IT
// =====================================================================
// §Fix binds the emission to the loop — the two discard arms each refuse the
// entry with one error-severity diagnostic before the resync carries it away —
// and settles the registry disposition as a REUSE of the declaration
// position's `theta/parse/malformed-schema-field`
// (docs/spec_topics/diagnostics/code-registry-parse.md:99,
// docs/spec_topics/schemas.md:19), whose Trigger the fix widens to the inline
// interior in the same commit.
//
// Two amendments to §Expected behaviour, settled by the operator against the
// premeasure that found the unamended §Fix contradicting two landed sibling
// reports, are encoded here and are not re-argued at any cell:
//
//   1. SCOPED TO KEYLESS ENTRIES. The emission fires on an entry that
//      contributes no key — one that spells no top-level `:`. An entry that
//      DOES spell one keeps whatever verdict it draws today, which is what
//      holds §Reproduction (c)'s whole control column, bug 0231's four
//      colon-carrying spellings and the colon-present cells `{: x}` and
//      `{: x, : y}` unmoved.
//   2. THE STRAY-CLOSE CLASS IS OUT OF REACH. §Expected behaviour 2's
//      text-independence holds with one discriminator: a keyless entry
//      carrying a stray depth-0 close token is bug 0238's class
//      (docs/bugs/0238-stray-close-token-underflows-top-level-split.md), whose
//      landed §Fix promises `{a: integer, b > c, m: integer}` at `params:`
//      REGISTERS and lowers the fields beside the dropped keyless entry, and
//      whose spelling at a `let` annotation or an `fn` parameter is bug 0252's
//      (docs/bugs/0252-brace-and-angle-annotation-junk-exempt-from-refusal.md)
//      `theta/parse/annotation-type-not-expression` ALONE. That class keeps
//      0238's silent tolerant registration and 0252's single refusal; group
//      (G) below is the fence.
//
// EVERY EXPECTATION BELOW IS THE SPECIFIED BEHAVIOUR, NOT THE CURRENT ONE.
// The post-fix values are measured against the scoped candidate the operator
// premeasured, cell by cell, and the ordering within each list is part of the
// assertion: `{a: ,void, Zs: string}` renders the entry's refusal BEFORE the
// sibling `Zs`'s own case line.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:101 —
//     `ObjectType ::= "{" Field ("," Field)* ","? "}"`, which derives no entry
//     without a `Field`; :109 §"Inline object types" — the inline `Field`
//     reuses the object-schema `Field` form in any `Type` position at any
//     depth, and the four raw-key rules "hold in every `Type` position".
//   - docs/spec_topics/schemas.md:17 — "Field names are identifiers; field
//     types are any expression from the Type System grammar"; :19 — a body
//     that has derived a field and then reaches "a field name with no
//     following `:`" is `theta/parse/malformed-schema-field`, the declaration
//     position's disposition this fix reuses inline.
//   - docs/spec_topics/lexical.md:13 (`Ident`) and :16 (the lowercase-first
//     rule stated of each schema field name — group (C) row c6's control).
//   - docs/spec_topics/diagnostics/code-registry-parse.md:99
//     (`theta/parse/malformed-schema-field`, the refusal every subject cell
//     expects), :19 (`theta/parse/binding-case-mismatch`), :59
//     (`theta/parse/let-rhs-type-mismatch`), :65
//     (`theta/parse/generic-arity-mismatch`), :66
//     (`theta/parse/void-in-non-return-position`), :98
//     (`theta/parse/empty-schema-body`), :101–:104 (the four raw-key rows),
//     :107 (`theta/parse/annotation-type-not-expression`, group (G)'s fence).
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md) — the
//     *Message* column is normative and a test MUST source it from the
//     registry. No message prose is written out below; every expected string
//     is read through `parseRegistry` / `registryMessage`, so a reworded
//     template reds by naming the registry.
//
// THE LEDGER — 133 diagnostic-list cells, 21 lowering cells, 30 count
// observables and 3 termination observables, in eleven groups. The RED/GREEN
// split at HEAD:
//   - (A) §Reproduction (a) rows a1–a11: RED at a1–a5 and a7–a10 (nine cells
//     reporting `[]`, or the sibling's line alone, against the entry's
//     refusal); GREEN at a6 and a11, the two no-move rows §Fix names.
//   - (B) §Reproduction (b), twelve `Type` positions × three columns: RED at
//     all 24 subject cells; GREEN at all 12 control cells, which are the
//     proof the rules reach each position at all.
//   - (C) §Reproduction (c), ten subject/control pairs: RED at all ten
//     subjects; GREEN at all ten controls, byte-unmoved.
//   - (D) §Reproduction (d): RED at d3/d4 (the inline position must agree
//     with the declaration position); GREEN at d1, d2, d5.
//   - (E) §Reproduction (e): RED at the three `params:` lowerings, which must
//     no longer produce a fragment at all; GREEN at the six direct
//     `lowerQueryResponseSchema` cells, which record the raw bytes and are
//     unmoved — the refusal §Expected behaviour 5 asks for is delivered at the
//     DOCUMENT, before those bytes matter (§Non-goals, "a refusal added here
//     refuses the document before its bytes matter").
//   - (F) the fifteen adjudicated spellings at the `fn` parameter position and
//     at the verbatim `params:` position: RED, all 30.
//   - (G) THE ADJUDICATION FENCES: GREEN at HEAD and after, all 13 diagnostic
//     cells and 4 lowering cells.
//   - (J) the paren-carrying and CROSSED-bracket keyless entries, which
//     `topLevelColon` (src/parser/params.ts) reads as contributing no key
//     because its typed opener stack holds `(` beside `<` and `{` and pops
//     only on a matching top: RED at the eight subject cells and all four
//     lowering cells; GREEN at the two colon-present controls. The group also
//     pins the ENTRY BOUNDARY, which is the brace-and-angle split's
//     (`splitTopLevel(…, ",", "angle-and-brace")`) and in which parens are
//     transparent — `{(a, b)}` is two entries, `{({a, b})}` is one — so the
//     colon parity cannot be bought by merging the two scans onto one stack.
//   - (H) bug 0129's count-consequence law
//     (docs/bugs/0129-empty-object-field-type-draws-two-diagnostics.md,
//     code-registry-parse.md:104): RED, all 30 count observables.
//   - (I) the termination guard: GREEN at HEAD and after, all 3.
//   - (K) THE DELIVERED REACH: bug 0256 (the operator ruling, OPTION 1 —
//     resync-and-tolerate) closes the break-residue class this group used to
//     fence at its measured, unfixed values. k1, k3, k4, k7, k9, k10 flip from
//     silence/permissive to the refusal/`null`; k5, k6 flip a CODE (the
//     parser loop's structural refusal now pre-empts the recogniser's own
//     refusal at those two positions, one line either way); k2 and k8 are
//     unmoved, the discriminator that already reached its entry before this
//     ruling.
//
// ORDERING IS PART OF THE ASSERTION. Every diagnostic cell is an ordered
// whole-list `toEqual` over the UNFILTERED `doc.diagnostics`, so neither an
// extra diagnostic nor a right diagnostic in a wrong order can hide inside a
// containment check or a `.some()`.
//
// TIER: unit, offline, deterministic, provider-free — the tier this repository
// puts this kind of claim in. Every observable settles inside one
// `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts), one read of the settled document's own frontmatter
// object, or one direct `lowerQueryResponseSchema` call. An integration tier
// would add a session round-trip to a parse-time value and a live tier would
// make a fully determined value stochastic; neither buys reach for a
// parse-time refusal claim. §Fix's live clause — owed only because §(e) rows
// e7–e8 change what reaches a provider-facing schema — is a separate
// obligation this file does not discharge.
//
// ANTI-VACUITY / NO SILENT SKIPPING: nothing here early-returns, branches on
// the environment or conditionally skips. The registry lookup THROWS naming
// the missing row, so a reworded or absent Message row reds by naming the
// registry rather than by comparing against `undefined`. Group (L) recomputes
// the declared inventory from the tables themselves, so a row dropped from a
// table reds there rather than shrinking a group unnoticed.

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
        `hard-coded fallback. Bug 0244's §Fix carries the row's Trigger widening in the same ` +
        `commit as the sites it is raised from ` +
        `(docs/spec_topics/diagnostics/code-registry-parse.md:99)`,
    );
  }
  return template;
}

const MALFORMED_FIELD = "theta/parse/malformed-schema-field";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const EMPTY_BODY = "theta/parse/empty-schema-body";
const VOID_POSITION = "theta/parse/void-in-non-return-position";
const ARITY = "theta/parse/generic-arity-mismatch";
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";
const NOT_IDENT = "theta/parse/inline-field-name-not-identifier";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
/** Bug 0252's row, which owns the stray-close class at an annotation (group G). */
const ANNOTATION_NOT_EXPR = "theta/parse/annotation-type-not-expression";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

/** Bug 0244's refusal: the discarded keyless entry's one line. */
const MALF: Exp = { severity: "error", code: MALFORMED_FIELD, fills: [] };
/** Bug 0154's lowercase-first pass over `TypeNode.fieldNames`. */
const CASE: Exp = { severity: "error", code: BINDING_CASE, fills: [] };
const VOID: Exp = { severity: "error", code: VOID_POSITION, fills: [] };
function EMPTY(subject: string): Exp {
  return { severity: "error", code: EMPTY_BODY, fills: [["<X>", subject]] };
}
function ARITY_OF(ctor: string, expected: string, actual: string): Exp {
  return {
    severity: "error",
    code: ARITY,
    fills: [
      ["<ctor>", ctor],
      ["<expected>", expected],
      ["<actual>", actual],
    ],
  };
}
function DUP(field: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", field]] };
}
function QUOTED(field: string): Exp {
  return { severity: "error", code: QUOTED_INLINE, fills: [["<field>", field]] };
}
function RENAMED(field: string): Exp {
  return { severity: "error", code: RENAMED_INLINE, fills: [["<field>", field]] };
}
function NOTIDENT(field: string): Exp {
  return { severity: "error", code: NOT_IDENT, fills: [["<field>", field]] };
}
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
/** Bug 0252's refusal, naming the binder or parameter whose annotation is junk. */
function ANNOT(name: string): Exp {
  return { severity: "error", code: ANNOTATION_NOT_EXPR, fills: [["<name>", name]] };
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
 * field carries the interior under test as a single-quoted YAML scalar, so the
 * scalar the frontmatter reader delivers is the interior verbatim. No interior
 * measured here spells a `'`, which group (L) recomputes.
 */
function paramsSrc(interior: string): string {
  return `---\nmode: subagent\nparams:\n  p: '${interior}'\n---\n1\n`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "test.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(interior: string): string {
  return JSON.stringify(parseDoc(paramsSrc(interior)).frontmatter?.params?.loweredSchema ?? null);
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
// (A) THE SUBJECT, ITS SEED CONTROL AND THE BOUNDS — §Reproduction (a).
// Each row `fn f(p: <I>): integer { 1 }`.
// ===========================================================================

/** §Reproduction (a) rows a1–a11, with the post-fix list each row carries. */
const A_ROWS: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
  // a1 vs a2 is bug 0237's seed row
  // (docs/bugs/0237-empty-inline-field-type-truncates-interior.md §Fix
  // residual 4): the empty type position makes no difference to the discarded
  // entry behind it, so both rows carry the same single refusal. The empty type
  // position itself stays 0237's subject and draws nothing (§Non-goals).
  ["a1", "{a: ,void}", [MALF]],
  ["a2", "{a: integer,void}", [MALF]],
  ["a3", "{a: integer, void}", [MALF]],
  // a4 and a5 are the bound: a sibling that spells `Ident ":"` keeps its own
  // verdict, so this is a MISSING diagnostic on the discarded entry alone and
  // never a truncation. The entry's refusal is rendered FIRST — the loop emits
  // it as the entry is discarded, ahead of `walkType`'s case pass over the
  // retained field names.
  ["a4", "{a: ,void, Zs: string}", [MALF, CASE]],
  ["a5", "{a: integer,void, Zs: string}", [MALF, CASE]],
  // a6 — §Fix "What must not move". Every entry spells its colon, so nothing
  // is discarded and the row keeps the case line ALONE. GREEN at HEAD.
  ["a6", "{a: integer, Zs: string}", [CASE]],
  ["a7", "{void}", [MALF]],
  ["a8", "{zs}", [MALF]],
  ["a9", "{Zs}", [MALF]],
  // a10 — one line per discarded entry, not one per interior (bug 0129's
  // count-consequence law, group (H)).
  ["a10", "{zs, ys}", [MALF, MALF]],
  // a11 — §Fix "What must not move". `{}` derives an admitted, empty
  // `ObjectType` with no entry to discard, so it keeps `empty-schema-body`
  // alone. a7 vs a11 is the report's sharpest pair: both lower the same bytes
  // (group (E) rows e1 and e3) and only one is refused at HEAD.
  ["a11", "{}", [EMPTY("{}")]],
];

describe("bug 0244 (A) — the subject, its seed control and the bounds at one position", () => {
  it("rows a1–a11, with a6 and a11 the no-move bounds ", () => {
    expectGroup(
      A_ROWS.map(([id, interior, expected]) => ({
        cell: `${id} ${interior} `,
        src: theta(`fn f(p: ${interior}): integer { 1 }`),
        expected,
      })),
      "grammar.md:101 derives no entry without a `Field` and schemas.md:17 admits no field " +
        "without a type, so an entry spelling no `Ident \":\"` is refused. A red reporting `[]` " +
        "(or the sibling's line alone at a4/a5) is bug 0244: `TypeParser.parseObject`'s colon " +
        "gate handed the entry to `TypeParser.skipMalformedEntry` " +
        "(src/parser/type-grammar.ts) with no emission, and neither `TypeNode.fieldNames` nor " +
        "`inlineObjectFieldKeys` holds it. a6 and a11 must stay GREEN in the same run — they " +
        "are §Fix's own no-move rows and the proof the interior's other rules still fire",
    );
  });
});

// ===========================================================================
// (B) THE SUBJECT AT TWELVE `Type` POSITIONS — §Reproduction (b), three
// columns: the two subject spellings and the byte-neighbour control.
// ===========================================================================

/** §Reproduction (b)'s twelve `Type` positions, parameterised by interior. */
function positionRows(
  interior: string,
): ReadonlyArray<readonly [string, string, string | undefined]> {
  return [
    ["b1 fn parameter", theta(`fn f(p: ${interior}): integer { 1 }`), undefined],
    ["b2 fn return", theta(`fn f(): ${interior} { 1 }`), undefined],
    ["b3 schema body field", theta(`schema S { a: ${interior} }`), undefined],
    ["b4 alias RHS", theta(`schema T = ${interior}`), undefined],
    ["b5 let annotation union arm", theta(`let x: ${interior} | null = null`), undefined],
    ["b6 let annotation", theta(`let x: ${interior} = 1`), undefined],
    ["b7 @<T> annotation root", theta("let r = @<" + interior + ">`hi`"), undefined],
    // b8 is b3 written in a `.thetalib`, which carries no frontmatter — the
    // path is what selects the library grammar, so it is passed explicitly.
    ["b8 .thetalib schema body field", `schema S { a: ${interior} }\n`, "lib.thetalib"],
    ["b9 params: field", paramsSrc(interior), undefined],
    ["b10 nested one level", theta(`schema S { a: { p: ${interior} } }`), undefined],
    // b11 is measured against bug 0233's landed widen
    // (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md):
    // the control is refused inside `array<…>` at HEAD and the subject is not,
    // because that widen changed where the key split is consulted and not
    // which entries yield a key.
    ["b11 generic argument", theta(`fn f(p: array<${interior}>): integer { 1 }`), undefined],
    ["b12 union arm", theta(`schema S { a: ${interior} | integer }`), undefined],
  ];
}

/** §Reproduction (b)'s first subject column — bug 0237's seed spelling. */
const B_SUBJECT_EMPTY_TYPE = "{a: ,void}";
/** Its second subject column — the same interior with the type position filled. */
const B_SUBJECT_FILLED_TYPE = "{a: integer,void}";
/** The byte-neighbour control: every entry spells `Ident ":"`. */
const B_CONTROL = "{a: integer, Zs: string}";

function positionCells(): Cell[] {
  const cells: Cell[] = [];
  for (const [id, src, path] of positionRows(B_SUBJECT_EMPTY_TYPE)) {
    cells.push({ cell: `${id} subject ${B_SUBJECT_EMPTY_TYPE} `, src, path, expected: [MALF] });
  }
  for (const [id, src, path] of positionRows(B_SUBJECT_FILLED_TYPE)) {
    cells.push({ cell: `${id} subject ${B_SUBJECT_FILLED_TYPE} `, src, path, expected: [MALF] });
  }
  for (const [id, src, path] of positionRows(B_CONTROL)) {
    cells.push({
      cell: `${id} control ${B_CONTROL} `,
      src,
      path,
      // b6 is the one position where a second line stands beside the case
      // line: the RHS gate answers `= 1` and renders the annotation back to
      // the author normalised. That is the position's own row and it does not
      // move.
      expected:
        id === "b6 let annotation"
          ? [CASE, LETRHS("x", "{ a: integer, Zs: string }", "integer")]
          : [CASE],
    });
  }
  return cells;
}

describe("bug 0244 (B) — the subject at twelve Type positions, params: and .thetalib included", () => {
  it("rows b1–b12 in three columns ", () => {
    expectGroup(
      positionCells(),
      "grammar.md:109 admits the inline `Field` in any `Type` position at any depth and " +
        "type-system.md:15 states one type grammar in every annotation position, so the " +
        "disposition is the same at all twelve (§Expected behaviour 3). A red on a SUBJECT cell " +
        "reporting `[]` is bug 0244 at that position; the twelve CONTROL cells are GREEN at " +
        "HEAD and must stay GREEN, since the agreement is reached by ADDING the subject's " +
        "refusal and never by removing the control's",
    );
  });
});

// ===========================================================================
// (C) ONE COLON, EIGHT RULES — §Reproduction (c). Subject and control differ by
// the colon (and, where a type is required, its type text).
// ===========================================================================

/** §Reproduction (c)'s ten subject/control pairs, at `fn f(p: <I>): integer { 1 }`. */
const C_PAIRS: ReadonlyArray<{
  readonly id: string;
  readonly subject: string;
  readonly control: string;
  readonly controlExpected: readonly Exp[];
}> = [
  { id: "c1", subject: "{a: integer, void}", control: "{a: integer, p: void}", controlExpected: [VOID] },
  {
    id: "c2",
    subject: "{a: integer, b c}",
    control: "{a: integer, b c: integer}",
    controlExpected: [NOTIDENT("b c")],
  },
  {
    id: "c3",
    subject: '{a: integer, "q"}',
    control: '{a: integer, "q": string}',
    controlExpected: [QUOTED('"q"')],
  },
  {
    id: "c4",
    subject: "{a: integer, 3}",
    control: "{a: integer, 3: string}",
    controlExpected: [NOTIDENT("3")],
  },
  {
    id: "c5",
    subject: "{a: integer, a}",
    control: "{a: integer, a: integer}",
    controlExpected: [DUP("a")],
  },
  {
    id: "c6",
    subject: "{a: integer, Zs}",
    control: "{a: integer, Zs: string}",
    controlExpected: [CASE],
  },
  {
    id: "c7",
    subject: "{a: integer, array<integer, integer>}",
    control: "{a: integer, p: array<integer, integer>}",
    controlExpected: [ARITY_OF("array", "1", "2")],
  },
  {
    id: "c8",
    subject: "{a: integer, {}}",
    control: "{a: integer, p: {}}",
    controlExpected: [EMPTY("{}")],
  },
  {
    id: "c9",
    subject: '{a: integer, w as "x"}',
    control: '{a: integer, w as "x": integer}',
    controlExpected: [RENAMED("w")],
  },
  {
    id: "c10",
    subject: "{a: integer, Élan}",
    control: "{a: integer, Élan: string}",
    controlExpected: [NOTIDENT("Élan")],
  },
];

describe("bug 0244 (C) — one colon, eight rules: the subject column refuses and the control column is unmoved", () => {
  it("rows c1–c10, subject and control ", () => {
    expectGroup(
      C_PAIRS.flatMap((p) => [
        {
          cell: `${p.id} subject `,
          src: theta(`fn f(p: ${p.subject}): integer { 1 }`),
          expected: [MALF],
        },
        {
          cell: `${p.id} control `,
          src: theta(`fn f(p: ${p.control}): integer { 1 }`),
          expected: p.controlExpected,
        },
      ]),
      "§Expected behaviour 2 as the operator scoped it: the refusal is one line per discarded " +
        "KEYLESS entry and does not depend on that entry's own text, so all ten subjects draw " +
        "the same line while their colon-carrying controls keep the eight distinct registered " +
        "rows they draw today. A red on a SUBJECT reporting `[]` is bug 0244 — the entry is in " +
        "neither `TypeNode.fieldNames` nor the `inlineObjectFieldKeys` split " +
        "(src/parser/type-grammar.ts), so the rule that would judge it never sees it. A red on " +
        "a CONTROL is a route that widened past the keyless scoping and moved a colon-present " +
        "entry, which the adjudication forbids",
    );
  });
});

// ===========================================================================
// (D) THE DECLARATION POSITION AND THE INLINE POSITION AGREE — §Reproduction
// (d). schemas.md:19 refuses "a field name with no following `:`" at the
// declaration; grammar.md:109 says the inline `Field` is the same form.
// ===========================================================================

describe("bug 0244 (D) — the position asymmetry closes", () => {
  it("rows d1–d5: d3 draws what d1 draws, d4 what d2 draws, and d1/d2/d5 are unmoved ", () => {
    expectGroup(
      [
        // d1, d2 — the declaration-position precedent this fix reuses inline.
        // GREEN at HEAD and after.
        { cell: "d1 declaration, keyword-shaped entry ", src: theta("schema S { a: integer, void }"), expected: [MALF] },
        { cell: "d2 declaration, two-word entry ", src: theta("schema S { a: integer, b c }"), expected: [MALF] },
        // d3, d4 — the same two spellings at the inline position.
        {
          cell: "d3 inline, keyword-shaped entry ",
          src: theta("fn f(p: {a: integer, void}): integer { 1 }"),
          expected: [MALF],
        },
        {
          cell: "d4 inline, two-word entry ",
          src: theta("fn f(p: {a: integer, b c}): integer { 1 }"),
          expected: [MALF],
        },
        // d5 — the partition code-registry-parse.md:99 states: an EMPTY
        // captured prefix keeps `theta/parse/empty-schema-body`'s
        // declaration-subject disposition, because no `Field` derived before
        // the offending token. GREEN at HEAD and after, and the fence against
        // a route that reroutes the declaration position's own partition.
        { cell: "d5 declaration, no field derived first ", src: theta("schema S { void }"), expected: [EMPTY("S")] },
      ],
      "§Expected behaviour 4: the inline position and the declaration position agree on one " +
        "`Field` form. A red at d3 or d4 reporting `[]` is bug 0244's position asymmetry — " +
        "`parseSchemaObjectBody` refuses the spelling and `TypeParser.parseObject` " +
        "(src/parser/type-grammar.ts) discards it. A red at d1, d2 or d5 is a route that moved " +
        "the declaration position, which §Fix \"What must not move\" forbids",
    );
  });
});

// ===========================================================================
// (E) WHAT LOWERS, AND WHAT REACHES THE PROVIDER — §Reproduction (e).
// ===========================================================================

/** The empty-object fragment `theta/parse/empty-schema-body` exists to refuse. */
const FRAG_EMPTY = '{"type":"object","properties":{},"required":[],"additionalProperties":false}';
const FRAG_A =
  '{"type":"object","properties":{"a":{"type":"integer"}},"required":["a"],' +
  '"additionalProperties":false}';
const FRAG_A_ZS =
  '{"type":"object","properties":{"a":{"type":"integer"},"Zs":{"type":"string"}},' +
  '"required":["a","Zs"],"additionalProperties":false}';

describe("bug 0244 (E) — the lowerings, and the params: fields that must stop lowering", () => {
  it("e1–e6 FENCE: the direct lowerer's bytes are unmoved ", () => {
    // GREEN at HEAD and after. `lowerQueryResponseSchema` is called with an
    // annotation string and no document around it, so no parse-time refusal
    // gates it: these six cells record the raw bytes §Reproduction (e) tables
    // and are the proof this harness reaches the lowerer at all. §Expected
    // behaviour 5's claim — that an interior whose every entry is discarded
    // never reaches a provider with the fragment `{}` is refused for — is
    // delivered at the DOCUMENT, by groups (A), (B) and (F), and by the three
    // `params:` cells below; §Non-goals states it in those terms ("a refusal
    // added here refuses the document before its bytes matter"). e5 and e6 are
    // §Fix "What must not move"'s well-formed lowerings.
    expect(
      {
        e1: JSON.stringify(lowerQueryResponseSchema("{void}", [], []) ?? null),
        e2: JSON.stringify(lowerQueryResponseSchema("{zs}", [], []) ?? null),
        e3: JSON.stringify(lowerQueryResponseSchema("{}", [], []) ?? null),
        e4: JSON.stringify(lowerQueryResponseSchema("{a: ,void}", [], []) ?? null),
        e5: JSON.stringify(lowerQueryResponseSchema("{a: integer,void}", [], []) ?? null),
        e6: JSON.stringify(lowerQueryResponseSchema("{a: integer,void, Zs: string}", [], []) ?? null),
      },
      "a red at e5 or e6 is a route that moved a well-formed interior's lowered bytes, which " +
        "§Fix \"What must not move\" forbids; a red at e1–e4 is a route that changed the " +
        "lowerer's field division instead of refusing the document, which §Non-goals excludes",
    ).toEqual({
      e1: FRAG_EMPTY,
      e2: FRAG_EMPTY,
      e3: FRAG_EMPTY,
      e4: FRAG_EMPTY,
      e5: FRAG_A,
      e6: FRAG_A_ZS,
    });
  });

  it("e7, e8, e9: a params: field carrying a keyless entry lowers nothing at all ", () => {
    // §Expected behaviour 5's wire half. At HEAD e7 and e8 lower `p` to the
    // permissive `{}` — every value accepted, no diagnostic — and e9 lowers a
    // `$defs` envelope for a document whose interior holds an unjudged entry.
    // Under the refusal the whole document carries an error-severity
    // diagnostic, the frontmatter gate withholds the frontmatter object, and
    // nothing reaches a provider.
    //
    // e9 DIVERGES from §Fix "What must not move", which lists it among the
    // well-formed lowerings: its interior `{a: integer,void}` carries a
    // keyless entry, so under the adjudicated scoping the document is refused
    // and no envelope survives. The bytes §Fix means are e5's, which the fence
    // above pins at the direct lowerer. Stated here rather than resolved
    // silently.
    expect(
      {
        e7: loweredParams("{void}"),
        e8: loweredParams("{a: ,void}"),
        e9: loweredParams("{a: integer,void}"),
      },
      "a red reporting `{\"p\":{}}` at e7 or e8 is bug 0244 at the wire: the `params:` field " +
        "declares an object type whose every entry was discarded, `hoistInlineObjectType` " +
        "(src/parser/params.ts) wrote no property for any of them, and the author's parameter " +
        "reaches the provider unconstrained. A red at e9 reporting a `$defs` envelope is the " +
        "same document registering with an unjudged entry standing at a `Type` position",
    ).toEqual({ e7: "null", e8: "null", e9: "null" });
  });
});

// ===========================================================================
// (F) THE FIFTEEN ADJUDICATED SPELLINGS, AT BOTH POSITIONS.
// ===========================================================================

/**
 * The fifteen keyless-entry interiors the operator adjudication settles as
 * refused, each with the number of KEYLESS entries it spells — which is the
 * number of refusal lines it draws (bug 0129's count-consequence law, group
 * (H)). Every one of them reports `[]` at HEAD at both positions.
 */
const FIFTEEN: ReadonlyArray<readonly [string, number]> = [
  ["{void}", 1],
  ["{zs}", 1],
  ["{Zs}", 1],
  ["{zs, ys}", 2],
  ["{a: ,void}", 1],
  ["{a: integer,void}", 1],
  ["{a: integer, b c}", 1],
  ['{a: integer, "q"}', 1],
  ["{a: integer, 3}", 1],
  ["{a: integer, a}", 1],
  ["{a: integer, Zs}", 1],
  ["{a: integer, array<integer, integer>}", 1],
  ["{a: integer, {}}", 1],
  ['{a: integer, w as "x"}', 1],
  ["{a: integer, Élan}", 1],
];

describe("bug 0244 (F) — the fifteen adjudicated spellings at the fn parameter and the verbatim params: position", () => {
  it("all fifteen refuse at both positions, one line per keyless entry ", () => {
    expectGroup(
      FIFTEEN.flatMap(([interior, keyless]) => {
        const expected = Array.from({ length: keyless }, () => MALF);
        return [
          {
            cell: `F fn parameter ${interior} `,
            src: theta(`fn f(p: ${interior}): integer { 1 }`),
            expected,
          },
          { cell: `F params: ${interior} `, src: paramsSrc(interior), expected },
        ];
      }),
      "these fifteen interiors are the adjudicated reach of bug 0244: each spells at least one " +
        "entry with no top-level `:`, so each is refused with " +
        "`theta/parse/malformed-schema-field` (code-registry-parse.md:99, schemas.md:19) at " +
        "every `Type` position. A red reporting `[]` is the defect; a red reporting a DIFFERENT " +
        "code on one spelling is a text-dependent emission, which §Expected behaviour 2 forbids " +
        "outside the one stray-close discriminator group (G) fences",
    );
  });
});

// ===========================================================================
// (G) THE ADJUDICATION FENCES — BUGS 0238 AND 0252.
//
// The operator adjudication carves the STRAY-CLOSE-TOKEN class out of bug
// 0244's reach: a keyless entry carrying a depth-0 close token is bug 0238's
// typed-opener-stack class, and its spelling at an annotation is bug 0252's.
// Every cell in this group is GREEN at HEAD and must stay GREEN — a red here
// is a route that widened past the adjudication and inverted a sibling
// report's landed §Fix promise. Beside them stand the colon-present controls:
// an entry that DOES spell a top-level `:` is out of bug 0244's scope whatever
// junk stands behind the colon.
// ===========================================================================

/** Bug 0238's §Reproduction row W2 — a keyless entry carrying a stray `>`. */
const STRAY = "{a: integer, b > c, m: integer}";
/** Bug 0238's row W4 — the stray-carrying keyless entry FIRST. */
const STRAY_FIRST = "{b > c, m: integer}";
/** Bug 0238's row W15 — the same class one nesting level down. */
const STRAY_NESTED = "{a: integer, n: {q > r, m: integer}}";
/** Bug 0238's row W13 — a judged key behind the stray token. */
const STRAY_JUDGED_SIBLING = "{a: integer, b > c, Zs: string}";

function envelope(slug: string, defs: string): string {
  return (
    `{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_${slug}"}},` +
    `"required":["p"],"additionalProperties":false,"$defs":{${defs}}}`
  );
}

const FRAG_A_M =
  '{"type":"object","properties":{"a":{"type":"integer"},"m":{"type":"integer"}},' +
  '"required":["a","m"],"additionalProperties":false}';
const FRAG_M =
  '{"type":"object","properties":{"m":{"type":"integer"}},"required":["m"],' +
  '"additionalProperties":false}';
const FRAG_A_N_TO_M =
  '{"type":"object","properties":{"a":{"type":"integer"},' +
  '"n":{"$ref":"#/$defs/__inline_0b0411e1b6314e7d"}},"required":["a","n"],' +
  '"additionalProperties":false}';

describe("bug 0244 (G) — the adjudication fences: bug 0238's tolerance and bug 0252's refusal", () => {
  it("g1–g4: at params: the stray-close class stays silent and keeps registering ", () => {
    expectGroup(
      [
        { cell: "g1 stray close token mid-interior ", src: paramsSrc(STRAY), expected: [] },
        { cell: "g2 stray close token nested ", src: paramsSrc(STRAY_NESTED), expected: [] },
        { cell: "g3 stray close token in the FIRST entry ", src: paramsSrc(STRAY_FIRST), expected: [] },
        // g4 — bug 0238's W13: the raw-key and case rules still fire on the
        // judged sibling behind the stray token, so the class is tolerated and
        // not exempted.
        { cell: "g4 judged sibling behind the stray token ", src: paramsSrc(STRAY_JUDGED_SIBLING), expected: [CASE] },
      ],
      "bug 0238's §Fix promises this class REGISTERS at `params:` and that the keyless entry " +
        "\"drops as a keyless entry\"; the operator adjudication keeps bug 0244 out of it " +
        "(§Non-goal). A red here reporting `theta/parse/malformed-schema-field` is a route that " +
        "widened past the stray-close discriminator and withdrew bug 0238's registration",
    );
  });

  it("g5, g6, g7: at an annotation the same interior draws bug 0252's refusal ALONE ", () => {
    expectGroup(
      [
        { cell: "g5 let annotation ", src: theta(`let y: ${STRAY} = 1`), expected: [ANNOT("y")] },
        {
          cell: "g6 fn parameter annotation ",
          src: theta(`fn f(p: ${STRAY}): integer { 1 }`),
          expected: [ANNOT("p")],
        },
        { cell: "g7 let annotation, nested ", src: theta(`let y: ${STRAY_NESTED} = 1`), expected: [ANNOT("y")] },
      ],
      "bug 0252's §Fix settles this row's code one version ago: the annotation carries a brace " +
        "group whose stray close token closes nothing, so the recogniser refuses the annotation " +
        "and the row draws `theta/parse/annotation-type-not-expression` " +
        "(code-registry-parse.md:107) ALONE. A red reporting " +
        "`theta/parse/malformed-schema-field` in its place is bug 0244 DISPLACING a sibling's " +
        "settled code, which the adjudication forbids",
    );
  });

  it("g8–g11: a colon-PRESENT entry is out of reach at both positions ", () => {
    // The scoping's other edge. `{: x}` spells a top-level `:`, so the entry
    // contributes a key — the empty one — and is not the shape bug 0244
    // refuses. Whatever these interiors draw is settled elsewhere (the
    // tolerant skip, or bug 0252 at an annotation); bug 0244 must not move
    // them.
    expectGroup(
      [
        { cell: "g8 colon-present entry, fn parameter ", src: theta("fn f(p: {: x}): integer { 1 }"), expected: [] },
        {
          cell: "g9 two colon-present entries, fn parameter ",
          src: theta("fn f(p: {: x, : y}): integer { 1 }"),
          expected: [],
        },
        { cell: "g10 colon-present entry, params: ", src: paramsSrc("{: x}"), expected: [] },
        { cell: "g11 two colon-present entries, params: ", src: paramsSrc("{: x, : y}"), expected: [] },
      ],
      "the operator adjudication scopes the emission to KEYLESS entries — those spelling no " +
        "top-level `:`. A red here is a route keyed on something other than the colon, which " +
        "would reach colon-present entries the adjudication leaves to their own reports",
    );
  });

  it("g12, g13: a stray-close interior at an fn parameter keeps bug 0252's single line ", () => {
    expectGroup(
      [
        {
          cell: "g12 stray close token, no sibling behind it ",
          src: theta("fn f(p: {a: integer, b > c}): integer { 1 }"),
          expected: [ANNOT("p")],
        },
        {
          cell: "g13 whole interior is one stray-close entry ",
          src: theta("fn f(p: {a > b}): integer { 1 }"),
          expected: [ANNOT("p")],
        },
      ],
      "the same fence as g5–g7 at the `fn` parameter position, for the two interiors group (I) " +
        "guards termination on: whatever the loop does with a depth-0 close token, the row's " +
        "code stays bug 0252's",
    );
  });

  it("g14–g17 FENCE: the stray-close class keeps lowering the fields beside the dropped entry ", () => {
    // Bug 0238's §Fix in its own words: W4 "lowers to `{m}` ALONE — not to the
    // permissive `p: {}`", and W15's inner `q > r` "drops as a keyless entry"
    // with `m` kept INSIDE `n`. g17 is the other direction: the row whose
    // judged sibling IS refused withholds its frontmatter, so a green here
    // cannot be reached by withholding every lowering.
    expect(
      {
        g14: loweredParams(STRAY),
        g15: loweredParams(STRAY_NESTED),
        g16: loweredParams(STRAY_FIRST),
        g17: loweredParams(STRAY_JUDGED_SIBLING),
      },
      "a red reporting `null` at g14, g15 or g16 is bug 0244 withdrawing the registration bug " +
        "0238's §Fix promises; a red reporting a fragment at g17 is a refused document lowering " +
        "anyway",
    ).toEqual({
      g14: envelope("6ab13cdeb4b48b5a", `"__inline_6ab13cdeb4b48b5a":${FRAG_A_M}`),
      g15: envelope(
        "244e819b04c2fa49",
        `"__inline_0b0411e1b6314e7d":${FRAG_M},"__inline_244e819b04c2fa49":${FRAG_A_N_TO_M}`,
      ),
      g16: envelope("0b0411e1b6314e7d", `"__inline_0b0411e1b6314e7d":${FRAG_M}`),
      g17: "null",
    });
  });
});

// ===========================================================================
// (J) THE PAREN-CARRYING KEYLESS ENTRIES.
//
// `topLevelColon` (src/parser/params.ts) tracks `(`/`)` in the same typed
// opener stack it tracks `<`/`{` in, so a `:` inside a paren group is not
// top-level and `(b: c)` contributes no key to `inlineObjectFieldKeys` and no
// property to `hoistInlineObjectType`. The entry is therefore KEYLESS under
// the adjudication's own definition — "an entry that contributes no key" — and
// draws the refusal, which is what stops an interior of nothing but such
// entries lowering the permissive `{}` (§Reproduction (e) rows e7–e8's harm).
// The controls beside them spell a top-level `:` outside any paren group and
// keep whatever their own report settled.
// ===========================================================================

/** A paren group swallowing the only `:` the interior spells. */
const PAREN_ONLY = "{(b: c)}";
/** The same entry beside a well-formed sibling. */
const PAREN_BESIDE_FIELD = "{a: integer, (b: c)}";
/** The colon-present control: the `:` is top-level, the parens stand in the TYPE. */
const PAREN_IN_TYPE = "{a: integer, b: (x)}";
/**
 * CROSSED brackets — the paren and the angle group interleave rather than
 * nest. `topLevelColon` (src/parser/params.ts) leaves `['(', '<']` open after
 * `( <`, treats the mismatched `)` as inert, pops `<` on the `>` and so reads
 * the `:` under a non-empty stack: the entry contributes no key. A paren DEPTH
 * counter cannot reach that verdict, because it cannot see the `<` stacked
 * above the `(` and zeroes itself on the inert `)`.
 */
const CROSSED_ONLY = "{( < ) > : x}";
/** The same crossed entry beside a well-formed sibling. */
const CROSSED_BESIDE_FIELD = "{( < ) > : x, a: integer}";
/**
 * The ENTRY BOUNDARY parity, which disagrees with the colon rule about parens
 * on purpose: `splitTopLevel(…, ",", "angle-and-brace")` (src/parser/params.ts)
 * tracks braces and angles only, so a paren does NOT protect a comma and this
 * interior is TWO keyless entries — two refusals, one per entry (bug 0129's
 * count law).
 */
const BOUNDARY_PAREN = "{(a, b)}";
/** The brace DOES protect the comma: one entry for both scans, one refusal. */
const BOUNDARY_BRACE = "{({a, b})}";

describe("bug 0244 (J) — a paren group that swallows the entry's only colon leaves the entry keyless", () => {
  it("j1–j6: the paren-carrying keyless entries refuse and the colon-present controls do not move ", () => {
    expectGroup(
      [
        { cell: "j1 paren-swallowed colon, fn parameter ", src: theta(`fn f(p: ${PAREN_ONLY}): integer { 1 }`), expected: [MALF] },
        { cell: "j2 paren-swallowed colon, params: ", src: paramsSrc(PAREN_ONLY), expected: [MALF] },
        {
          cell: "j3 paren-swallowed colon beside a field, fn parameter ",
          src: theta(`fn f(p: ${PAREN_BESIDE_FIELD}): integer { 1 }`),
          expected: [MALF],
        },
        { cell: "j4 paren-swallowed colon beside a field, params: ", src: paramsSrc(PAREN_BESIDE_FIELD), expected: [MALF] },
        // j5, j6 — GREEN at HEAD and after. The colon is top-level here, so the
        // entry contributes the key `b` and the row keeps bug 0252's code.
        {
          cell: "j5 colon-present control, fn parameter ",
          src: theta(`fn f(p: ${PAREN_IN_TYPE}): integer { 1 }`),
          expected: [ANNOT("p")],
        },
        {
          cell: "j6 colon-present control, let annotation ",
          src: theta(`let y: ${PAREN_IN_TYPE} = 1`),
          expected: [ANNOT("y")],
        },
        // j9–j12 — the CROSSED class. The colon rule this scan mirrors is a
        // single typed opener stack carrying `(` beside `<` and `{`, not a
        // paren counter beside a brace/angle stack; only the stack reaches
        // `topLevelColon`'s verdict when the two bracket kinds interleave.
        {
          cell: "j9 crossed brackets swallow the colon, fn parameter ",
          src: theta(`fn f(p: ${CROSSED_ONLY}): integer { 1 }`),
          expected: [MALF],
        },
        { cell: "j10 crossed brackets swallow the colon, params: ", src: paramsSrc(CROSSED_ONLY), expected: [MALF] },
        {
          cell: "j11 crossed brackets beside a field, fn parameter ",
          src: theta(`fn f(p: ${CROSSED_BESIDE_FIELD}): integer { 1 }`),
          expected: [MALF],
        },
        {
          cell: "j12 crossed brackets beside a field, params: ",
          src: paramsSrc(CROSSED_BESIDE_FIELD),
          expected: [MALF],
        },
        // j13, j14 — the ENTRY BOUNDARY parity. The boundary is the
        // brace-and-angle split's, in which parens are transparent, so j13 is
        // two entries and j14 is one. A remedy that merged the colon rule's
        // paren tracking into the boundary stack would report one refusal at
        // j13 and put this loop's inventory of an interior out of step with
        // the raw-key split's.
        {
          cell: "j13 a paren does not protect the comma: two entries, two refusals ",
          src: theta(`fn f(p: ${BOUNDARY_PAREN}): integer { 1 }`),
          expected: [MALF, MALF],
        },
        {
          cell: "j14 a brace does protect the comma: one entry, one refusal ",
          src: theta(`fn f(p: ${BOUNDARY_BRACE}): integer { 1 }`),
          expected: [MALF],
        },
      ],
      "the refusal's scope is the entry that contributes NO KEY, and `topLevelColon` " +
        "(src/parser/params.ts) is the function that decides that for every keyed consumer: its " +
        "typed opener stack holds `(`, so `(b: c)` yields no key and no property. A red at " +
        "j1–j4 reporting `[]` is `TypeParser.classifyEntry` (src/parser/type-grammar.ts) reading " +
        "a paren-swallowed `:` as top-level where every keyed consumer reads it as absent — the " +
        "entry is discarded, unjudged, and j7 below shows the permissive `{}` it hands the " +
        "provider. A red at j5 or j6 is that parity overshooting onto a colon-PRESENT entry, " +
        "which the adjudication leaves to its own report",
    );
  });

  it("j7, j8, j15, j16: no paren-carrying or crossed interior lowers a params: fragment ", () => {
    // At HEAD j7 lowers `p` to the permissive `{}` — the exact wire harm
    // §Reproduction (e) rows e7–e8 record — and j8 lowers a `$defs` envelope
    // for a document holding an unjudged entry.
    expect(
      {
        j7: loweredParams(PAREN_ONLY),
        j8: loweredParams(PAREN_BESIDE_FIELD),
        j15: loweredParams(CROSSED_ONLY),
        j16: loweredParams(CROSSED_BESIDE_FIELD),
      },
      "a red reporting `{\"p\":{}}` at j7 is an unconstrained parameter reaching the provider " +
        "from an interior whose only entry contributes no property; a red at j16 reporting a " +
        "fragment carrying `a` alone is the crossed entry silently discarded beside a lowered " +
        "sibling, which is the permissive-lowering harm §Reproduction (e) closes",
    ).toEqual({ j7: "null", j8: "null", j15: "null", j16: "null" });
  });
});

// ===========================================================================
// (H) BUG 0129'S COUNT-CONSEQUENCE LAW — one error-severity line per refused
// keyless entry and no second
// (docs/bugs/0129-empty-object-field-type-draws-two-diagnostics.md,
// code-registry-parse.md:104).
// ===========================================================================

/** The number of error-severity diagnostics a source draws, by code. */
function errorCodeCounts(src: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of parseDoc(src).diagnostics) {
    if (d.severity !== "error") continue;
    counts[d.code] = (counts[d.code] ?? 0) + 1;
  }
  return counts;
}

describe("bug 0244 (H) — the count-consequence law over the fifteen adjudicated spellings", () => {
  it("each refused keyless entry draws exactly one error line, and the entry draws no second ", () => {
    const actual: Record<string, Record<string, number>> = {};
    const expected: Record<string, Record<string, number>> = {};
    for (const [interior, keyless] of FIFTEEN) {
      const fnKey = `H fn parameter ${interior}`;
      const paramsKey = `H params: ${interior}`;
      actual[fnKey] = errorCodeCounts(theta(`fn f(p: ${interior}): integer { 1 }`));
      actual[paramsKey] = errorCodeCounts(paramsSrc(interior));
      expected[fnKey] = { [MALFORMED_FIELD]: keyless };
      expected[paramsKey] = { [MALFORMED_FIELD]: keyless };
    }
    expect(
      actual,
      "bug 0129's law: a refused entry draws one error-severity diagnostic and no second, and " +
        "the count is per ENTRY, not per interior — `{zs, ys}` draws two. A red reporting a " +
        "count of 0 is bug 0244; a red reporting 2 where 1 is expected is the emission firing " +
        "at both discard arms for one entry; a red carrying a SECOND code beside the refusal is " +
        "the law broken in the other direction",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (I) THE TERMINATION GUARD.
//
// The premeasure recorded a real hang in a candidate whose non-`ident` discard
// arm made no progress on a depth-0 `>` or `}`: `TypeParser.skipMalformedEntry`
// (src/parser/type-grammar.ts) declines to consume such a token — bug 0238's
// clamp — so an arm that neither emits `next()` nor advances spins. These three
// interiors are the shapes that reach that arm. The bound is real: the `it`
// carries an explicit timeout, so a spin fails the run instead of stalling it.
// ===========================================================================

describe("bug 0244 (I) — parsing an interior with a depth-0 stray close token terminates", () => {
  it(
    "three depth-0 close-token interiors each complete and return a diagnostics array ",
    () => {
      const sources: ReadonlyArray<readonly [string, string]> = [
        ["i1 stray close token, sibling ahead", theta("fn f(p: {a: integer, b > c}): integer { 1 }")],
        ["i2 whole interior is one stray-close entry", theta("fn f(p: {a > b}): integer { 1 }")],
        // i3 reaches the arm inside a generic argument, where the interior's
        // own closer is a `>` the argument list also spells.
        ["i3 keyless entry inside a generic argument", theta("fn f(p: array<{a}>): integer { 1 }")],
      ];
      const completed: Record<string, boolean> = {};
      for (const [id, src] of sources) {
        completed[id] = Array.isArray(parseDoc(src).diagnostics);
      }
      expect(
        completed,
        "a route whose discard arm makes no progress on a depth-0 `>` / `}` spins inside " +
          "`TypeParser.parseObject`'s field loop (src/parser/type-grammar.ts) and this test " +
          "fails on its own timeout rather than returning a wrong value",
      ).toEqual({
        "i1 stray close token, sibling ahead": true,
        "i2 whole interior is one stray-close entry": true,
        "i3 keyless entry inside a generic argument": true,
      });
    },
    10_000,
  );
});

// ===========================================================================
// (K) THE DELIVERED REACH — bug 0256 closes the break-residue class the
// header above once recorded as bug 0244's unfixed residual.
//
// THESE CELLS NOW RECORD THE FIX'S DELIVERED REACH, ATTRIBUTED TO BUG 0256 AND
// TO THE OPERATOR RULING (OPTION 1 — resync-and-tolerate,
// docs/bugs/0256-generic-argument-stranded-entry-registers-permissive.md). The
// refusal above used to fire only on entries `TypeParser.parseObject`'s field
// loop VISITED. Where an entry's type text is followed by a token that is
// neither an entry separator nor the interior's closer — a junk tail, `a: b
// c` — the loop used to exit, stranding every source entry standing behind
// it. Under the ruling the loop RESYNCS depth-aware at that failure (reusing
// `skipMalformedEntry`'s bug-0238 machinery) instead of breaking, so the
// stranded entry is now reached and bug 0244's own refusal fires on it when it
// is keyless — the starvation face heals by parsing, not by refusal.
//
// The STRANDING entry itself (the colon-present junk tail, `a: b c`) keeps its
// own disposition and draws no line of its own: that is bug 0252's landed
// class and bug 0244's adjudication clauses 2 and 4, unmoved by this ruling
// (a3 parity, §Non-goals of both reports).
//
// k5 AND k6 FLIP A CODE, NOT A LINE COUNT. At HEAD the unwrapped interior
// reached its own recogniser gate first (`theta/parse/annotation-type-not-expression`
// at an annotation, `theta/parse/schema-type-not-expression` at a schema
// field) because the parser loop had nothing to say about the stranded entry.
// Under the ruling the parser loop now refuses the stranded entry itself,
// before the recogniser is even consulted, and the one-diagnostic-per-position
// discipline the load/parse precedence rules already keep
// (code-registry-load.md:19's own precedence rule 1, mirrored at the parse
// stage) lets that earlier, structural refusal pre-empt the later recogniser
// refusal rather than stack beside it — so k5 and k6 report
// `theta/parse/malformed-schema-field` where they used to report the
// recogniser's own code, with no second line added.
//
// k2 remains the discriminator: the byte-neighbour interior whose first entry
// carries no junk tail, at the SAME position, was already refused before this
// ruling and stays refused after it — the ruling does not touch a route that
// already reached the entry.
// ===========================================================================

/** The stranding interior: a junk tail ahead of a keyless entry. */
const STRANDED = "{a: b c, d e}";
/** Its byte neighbour, whose first entry ends at the separator the loop reads. */
const STRANDED_CONTROL = "{a: b, d e}";
/** The same stranding with a reserved keyword as the stranded entry. */
const STRANDED_VOID = "{a: b c, void}";
/** The same stranding with a two-token junk tail behind a primitive type. */
const STRANDED_TYPED_TAIL = "{a: integer x, d e}";

describe("bug 0256 (K) — the ruling's delivered reach: the stranded entry is visited and judged", () => {
  it("k1–k6: the generic-argument position refuses, and k5/k6 flip the code that refuses ", () => {
    expectGroup(
      [
        { cell: `k1 stranded entry, generic argument, params: ${STRANDED} `, src: paramsSrc(`array<${STRANDED}>`), expected: [MALF] },
        // k2 — the discriminator, unmoved: the loop already reached `d e` here
        // before this ruling and refuses it exactly as it did before.
        {
          cell: `k2 CONTROL no junk tail, generic argument, params: ${STRANDED_CONTROL} `,
          src: paramsSrc(`array<${STRANDED_CONTROL}>`),
          expected: [MALF],
        },
        { cell: `k3 stranded reserved keyword ${STRANDED_VOID} `, src: paramsSrc(`array<${STRANDED_VOID}>`), expected: [MALF] },
        {
          cell: `k4 stranded behind a typed junk tail ${STRANDED_TYPED_TAIL} `,
          src: paramsSrc(`array<${STRANDED_TYPED_TAIL}>`),
          expected: [MALF],
        },
        // k5, k6 — a CODE flip, not a line gain: the parser loop's own
        // structural refusal of the stranded entry now pre-empts the
        // recogniser's refusal of the whole unwrapped interior at these two
        // positions (the one-diagnostic-per-position discipline), so the row
        // reads `theta/parse/malformed-schema-field` in place of the
        // recogniser's code, still exactly one line.
        {
          cell: `k5 fn parameter type, code flip ${STRANDED} `,
          src: theta(`fn f(p: ${STRANDED}): integer { 1 }`),
          expected: [MALF],
        },
        {
          cell: `k6 schema field type, code flip ${STRANDED} `,
          src: theta(`schema S { a: ${STRANDED} }`),
          expected: [MALF],
        },
      ],
      "bug 0256's operator ruling (OPTION 1, resync-and-tolerate) closes the break-residue class " +
        "this group used to fence: the field loop now resyncs past the missing entry separator " +
        "instead of breaking, reaches the stranded entry, and bug 0244's own refusal fires on it. " +
        "A red at k1, k3 or k4 reporting `[]` is the ruling not landed. A red at k2 reporting `[]` " +
        "is the reach the fix already delivered being lost. A red at k5 or k6 reporting the " +
        "recogniser's own code (rather than the parse-time refusal that now pre-empts it) is the " +
        "parser loop not yet reaching the stranded entry at that position",
    );
  });

  it("k7–k10: no stranded carrier lowers the permissive fragment any longer ", () => {
    expect(
      {
        k7: loweredParams(`array<${STRANDED}>`),
        k8: loweredParams(`array<${STRANDED_CONTROL}>`),
        k9: loweredParams(`array<${STRANDED_VOID}>`),
        k10: loweredParams(`array<${STRANDED_TYPED_TAIL}>`),
      },
      "the wire consequence of bug 0256's ruling: a `params:` field whose interior used to strand " +
        "a keyless entry now refuses and withholds the frontmatter, exactly as its junk-tail-free " +
        "byte neighbour k8 already did. A red at k7, k9 or k10 reporting the permissive fragment " +
        "is the ruling not landed; a red at k8 reporting a fragment is the delivered refusal being " +
        "withdrawn",
    ).toEqual({ k7: "null", k8: "null", k9: "null", k10: "null" });
  });
});

// ===========================================================================
// (L) ANTI-VACUITY — the inventory arithmetic, recomputed from the tables.
// ===========================================================================

/** The LEDGER's own numbers, recomputed below from the tables that produce them. */
const TOTAL_LIST_CELLS = 133;
const TOTAL_LOWERING_CELLS = 21;
const TOTAL_COUNT_OBSERVABLES = 30;
const TOTAL_TERMINATION_OBSERVABLES = 3;

describe("bug 0244 (L) — the inventory this file asserts", () => {
  it("the tables carry the declared counts, and no fixture lost the property that makes it a subject ", () => {
    const groupA = A_ROWS.length;
    const groupB = positionCells().length;
    const groupC = C_PAIRS.length * 2;
    const groupD = 5;
    const groupF = FIFTEEN.length * 2;
    const groupG = 13;
    const groupJ = 12;
    const groupK = 6;
    expect(
      {
        listCells: groupA + groupB + groupC + groupD + groupF + groupG + groupJ + groupK,
        loweringCells: 6 + 3 + 4 + 4 + 4,
        countObservables: FIFTEEN.length * 2,
        terminationObservables: 3,
      },
      "the declared LEDGER must match the tables; a red here is a row dropped from a table, " +
        "which would shrink a group unnoticed",
    ).toEqual({
      listCells: TOTAL_LIST_CELLS,
      loweringCells: TOTAL_LOWERING_CELLS,
      countObservables: TOTAL_COUNT_OBSERVABLES,
      terminationObservables: TOTAL_TERMINATION_OBSERVABLES,
    });

    // Every fixture in the fifteen and in group (C)'s subject column spells at
    // least one entry with no top-level `:` and no depth-0 close token — the
    // two properties that put it inside the adjudicated scope. A fixture
    // edited to lose either would pass for the wrong reason.
    const subjects = [...FIFTEEN.map(([i]) => i), ...C_PAIRS.map((p) => p.subject)];
    expect(
      subjects.filter((s) => s.includes(">") && !s.includes("<")).length,
      "no adjudicated subject may carry a depth-0 stray close token: that is bug 0238's class " +
        "and group (G)'s fence, not this file's subject",
    ).toBe(0);
    // Group (J)'s subjects must keep the two properties that make them
    // subjects: a paren group, and no depth-0 stray close token that would
    // hand them to bug 0238's class instead.
    expect(
      [PAREN_ONLY, PAREN_BESIDE_FIELD].filter((s) => s.includes("(") && !s.includes(">")).length,
      "group (J)'s subjects must each spell a paren group and no stray close token, or the " +
        "parity they lock is not the one under test",
    ).toBe(2);
    // The crossed subjects must keep the interleaving that makes them crossed:
    // a paren group and an angle pair whose close token the paren's own close
    // token sits inside. A fixture flattened into properly-nested brackets
    // would pass under a paren counter and lock nothing.
    expect(
      [CROSSED_ONLY, CROSSED_BESIDE_FIELD].filter((s) => /\(\s*<\s*\)\s*>/.test(s)).length,
      "group (J)'s crossed subjects must each interleave a paren group with an angle pair, or " +
        "the divergence between a paren counter and `topLevelColon`'s single typed stack is not " +
        "under test",
    ).toBe(2);
    expect(
      new Set(FIFTEEN.map(([i]) => i)).size,
      "the fifteen adjudicated spellings must all be distinct, or a cell is silently " +
        "overwritten inside a group's map",
    ).toBe(15);
    expect(
      [...subjects, ...C_PAIRS.map((p) => p.control), B_SUBJECT_EMPTY_TYPE, B_SUBJECT_FILLED_TYPE, B_CONTROL].filter(
        (s) => s.includes("'"),
      ).length,
      "no fixture may spell a `'`, or the single-quoted YAML scalar in `paramsSrc` would stop " +
        "delivering the interior verbatim",
    ).toBe(0);
  });
});
