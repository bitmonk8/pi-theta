import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0231 — `TypeParser.parseObject`'s field loop BREAKS at the first entry
// that does not spell `Ident ":"`, so every field behind it is absent from both
// `fieldNames` and `fieldTypes` and every check reached through them is
// silently withheld
// (docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md). This
// file is that report's §Fix (e) witness.
//
// THE MECHANISM. `TypeParser.parseObject` (src/parser/type-grammar.ts:645)
// reads a field-name token, requires a `:` behind it, and ends the whole field
// loop when that colon is absent:
//
//     if (!this.eatPunct(":")) {
//       // Malformed field; stop to stay tolerant.
//       break;
//     }
//
// (src/parser/type-grammar.ts:694–697 at the tree this file was written
// against — the absolute numbers are bug 0134's do-not-chase class; the text is
// the anchor.) `{a b: integer, Zs: string}` reaches that break on its first
// entry: `a` is an `ident`, the token behind it is `b`. `Zs: string` is never
// read, so it enters neither `fieldNames` (:703–705, bug 0154's
// lowercase-first pass's whole input, `walkType` :1001–1038) nor `fieldTypes`
// (:707–712, the array `walkType` :1169 recurses through for every field-TYPE
// check and for every nested interior's four raw-key rules). The four raw-key
// rules on the broken interior's OWN entries survive, because
// `inlineObjectFieldKeys` (:776) reads `TypeNode.interiorSource` (:738–741),
// which is sliced from token offsets and is complete however early the loop
// stopped — which is why `a b` is still named and the harm is a MISSING
// diagnostic on a NEIGHBOUR rather than a silent load, at ten of the eleven
// positions.
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES (settled by the parent run inside §Fix (a)'s
// constraints, and premeasured against an experimental application of it)
// =====================================================================
// §Fix (a) ROUTE 1 — RESYNCHRONISE THE FIELD LOOP. The `break` at the
// malformed-field site is replaced by a brace-and-angle-aware skip to this
// interior's next depth-0 `,` (consumed), stopping WITHOUT consuming a depth-0
// `}` or `>`, then `entryTainted = false; continue;`. Consequences this file
// pins rather than leaves to be discovered:
//   * the malformed entry itself stays OUT of `fieldNames` (bug 0227's
//     `entryTainted`, :670–681), so no residue verdict returns — group (C)'s
//     c5 and group (B)'s b10 are the controls;
//   * every entry BEHIND a malformed one reaches both arrays, so every check
//     in §Reproduction (b) fires from existing code with NO new registry row
//     (§Fix (b)) — group (B);
//   * the unclosed-interior class (`closingBraceSpelled`, group (J) of
//     tests/inline-object-field-name-case.test.ts) does not move — group (J)
//     here is that pin at this file's own fixtures.
//
// EVERY EXPECTATION BELOW IS THE SPECIFIED BEHAVIOUR, NOT THE CURRENT ONE. The
// AFTER values were measured against an experimental application of route 1
// (the tree was then restored byte-exact) or derived from a measured control by
// the report's own rule: a well-formed field behind a malformed entry gains
// exactly the diagnostics its own control draws, in emission order. For the
// eleven `Type` positions the derivation is mechanical and the derived value is
// the ORDER-REVERSED control's own measured list — `{a b: integer, Zs: string}`
// and `{Zs: string, a b: integer}` leave `parseObject` in the identical state
// under route 1 (`fieldNames = ["Zs"]`, `fieldTypes = [string]`, plus the
// raw-key refusal of `a b` off `interiorSource`), which is exactly
// §Expected behaviour's "a field's verdict does not depend on a neighbour's
// spelling, or on entry order".
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/lexical.md:13 — `Ident` is `[A-Za-z_][A-Za-z0-9_]*`;
//     :16 — a schema field name starts with a lowercase letter or `_`, stated
//     as a property of EACH name.
//   - docs/spec_topics/grammar.md:101 — `ObjectType ::= "{" Field ("," Field)*
//     ","? "}"`; :109 — an inline `Field` is the object-schema `Field`.
//   - docs/spec_topics/type-system.md:15 — ONE type grammar in every
//     type-annotation position, which is why group (A) asserts all eleven.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:19 —
//     `theta/parse/binding-case-mismatch`'s *Trigger* ("Identifier in a
//     binding / parameter / fn-name / field-name position does not start with a
//     lowercase letter or `_`"), false of `Zs` today; :101 — the
//     `inline-field-name-not-identifier` row whose count-consequence sentence
//     (bug 0129) is scoped to "that field" and licenses no withholding from a
//     DIFFERENT field.
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md) — the *Message*
//     column is normative and tests MUST source it from the registry. No
//     message prose is written out below; every expected string is read through
//     `parseRegistry` / `registryMessage`, so a reworded template reds by
//     naming the registry.
//
// THE LEDGER — what each group pins, and which cells are RED at HEAD:
//   - (A) THE SUBJECT AT ALL ELEVEN `Type` POSITIONS, `.thetalib` and the
//     verbatim `params:` one included, each with BOTH controls so entry order
//     is pinned in both directions: 33 cells, of which the 11 SUBJECT cells are
//     RED (each missing `binding-case-mismatch` on `Zs`) and the 22 control
//     cells are GREEN now and after.
//   - (B) WHAT ELSE THE BREAK WITHHOLDS, each row against its own single-field
//     control: b1–b8 RED (the three field-TYPE checks and the four raw-key
//     rules plus the case rule at NESTED depth), b9 and b10 the two BOUNDS that
//     do NOT move, and the nine controls GREEN.
//   - (C) WHICH MALFORMED SPELLINGS BREAK: c1–c4 RED (space-broken, quoted,
//     numeric and rename-shaped heads all break today), c5 and c6 the NO-MOVE
//     controls that keep bug 0227's `entryTainted` latch behaviour asserted —
//     c5 recovers its sibling TODAY and must still recover it after.
//   - (D) THE GENERIC-ARGUMENT POSITION, where nothing refuses: d1 and d3 RED
//     (both load with an EMPTY diagnostic list and REGISTER at HEAD), d2 and d4
//     the controls that already refuse.
//   - (F) THE LOWERED VIEW: f1 and f2, GREEN now and after — the lowerer keys on
//     the `splitTopLevel` entries and never read the loop's arrays, so route 1
//     moves neither document.
//   - (J) THE UNCLOSED INTERIOR, §Non-goals: j1 and j2, GREEN now and after.
//     Route 1 changes the loop's token consumption, so this class is pinned
//     here explicitly rather than left to group (J) of bug 0154's witness.
//   - (L) ANTI-VACUITY: the inventory arithmetic, recomputed from the cell
//     tables.
//
// ORDERING IS PART OF THE ASSERTION. Every assertion is an ordered whole-list
// `toEqual` over the UNFILTERED `doc.diagnostics`, so neither an extra
// diagnostic nor a right diagnostic in a wrong order can hide inside a
// containment check. Two orders are load-bearing and measured, not assumed: at
// the interior's OWN level the identifier pass over `fieldNames` emits BEFORE
// the raw-key pass over `interiorSource` (group (A): `binding-case-mismatch`
// then `inline-field-name-not-identifier`), while a diagnostic drawn from a
// NESTED interior is reached through the `fieldTypes` recursion and therefore
// emits AFTER the outer interior's raw-key line (group (B), rows b1–b8).
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
// a fully determined value stochastic.
//
// ANTI-VACUITY / NO SILENT SKIPPING: nothing here early-returns, branches on
// the environment or conditionally skips. The registry lookup asserts its row's
// presence before the template is used, so a missing row reds by naming the
// registry. 63 of the 64 diagnostic-list cells expect a NON-EMPTY ordered list,
// so a harness that stopped reaching the parser fails loudly here rather than
// turning empty expectations into silent passes.

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

const BINDING_CASE = "theta/parse/binding-case-mismatch";
const NOT_IDENT = "theta/parse/inline-field-name-not-identifier";
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";
const EMPTY_BODY = "theta/parse/empty-schema-body";
const VOID_POSITION = "theta/parse/void-in-non-return-position";
const ARITY_MISMATCH = "theta/parse/generic-arity-mismatch";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const ARRAY_ELEMENT_MISMATCH = "theta/parse/array-element-type-mismatch";
const LET_NO_INIT = "theta/parse/let-without-initialiser";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

/** `binding-case-mismatch` — the row §Reproduction (a) measures silent on `Zs`. */
const CASE: Exp = { severity: "error", code: BINDING_CASE, fills: [] };

/** Bug 0228's raw-key row, which reads `interiorSource` and survives the break. */
function NOTIDENT(field: string): Exp {
  return { severity: "error", code: NOT_IDENT, fills: [["<field>", field]] };
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
function EMPTY(subject: string): Exp {
  return { severity: "error", code: EMPTY_BODY, fills: [["<X>", subject]] };
}
const VOIDPOS: Exp = { severity: "error", code: VOID_POSITION, fills: [] };
function ARITY(ctor: string, expected: string, actual: string): Exp {
  return {
    severity: "error",
    code: ARITY_MISMATCH,
    fills: [
      ["<ctor>", ctor],
      ["<expected>", expected],
      ["<actual>", actual],
    ],
  };
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
function ARRAYELEM(index: string, expected: string, actual: string): Exp {
  return {
    severity: "error",
    code: ARRAY_ELEMENT_MISMATCH,
    fills: [
      ["<i>", index],
      ["<expected>", expected],
      ["<actual>", actual],
    ],
  };
}
function NOINIT(name: string): Exp {
  return { severity: "error", code: LET_NO_INIT, fills: [["<name>", name]] };
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
// behaviour is stubbed: the lexer, the parser and the frontmatter reader under
// assertion are the production ones.
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

/**
 * `hasLoadParseError`'s predicate (src/extension/production-composition.ts),
 * restated over a parsed document: a theta registers unless some diagnostic is
 * an error-severity `theta/load/*` or `theta/parse/*`. Group (D)'s d1 is the
 * one row of this report where that predicate is TRUE at HEAD.
 *
 * This departs, deliberately, from the bug doc's §Observed-at reading of
 * "registers" as `frontmatter !== null`: post-fix, d1's frontmatter is
 * non-null with one body diagnostic, so the doc's reading would still call
 * d1 registered while this predicate does not. The production predicate is
 * the one that matters here — it is what decides whether the theta is kept
 * or dropped at load, which is what §Fix (f)'s "lose their loads-cleanly
 * status" is about.
 */
function registers(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some(
    (d: Diagnostic) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
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
 * stop at the first divergence and hide the rest, and the order-invariance /
 * per-position claims are only meaningful against whole lists.
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
// The three fixtures of §Reproduction (a). SUBJECT is the minimal witness; the
// two controls are the same two field names with the malformed entry removed
// (CONTROL_WELL) and with the entry order reversed (CONTROL_REVERSED).
// ===========================================================================

const SUBJECT = "{a b: integer, Zs: string}";
const CONTROL_WELL = "{a: integer, Zs: string}";
const CONTROL_REVERSED = "{Zs: string, a b: integer}";

/** The eleven `Type` positions of §Reproduction (a) rows a1–a11. */
function positions(type: string): ReadonlyArray<readonly [string, string, string]> {
  return [
    ["a1 let annotation", theta(`let x: ${type} = 1`), "test.theta"],
    ["a2 let mut annotation", theta(`let mut x: ${type} = 1`), "test.theta"],
    ["a3 fn parameter", theta(`fn h(p: ${type}): number { 1 }`), "test.theta"],
    ["a4 fn return", theta(`fn h(): ${type} { 1 }`), "test.theta"],
    ["a5 schema body field", theta(`schema S { p: ${type} }`), "test.theta"],
    ["a6 alias RHS", theta(`schema T = ${type}`), "test.theta"],
    ["a7 @<T> annotation root", theta("let r = @<" + type + ">`hi`"), "test.theta"],
    ["a8 invoke<T>", theta(`let r = invoke<${type}>("./x.theta")`), "test.theta"],
    ["a9 nested one level", theta(`let x: { q: ${type} } = 1`), "test.theta"],
    ["a10 .thetalib schema field", `schema S { p: ${type} }\n`, "lib.thetalib"],
    ["a11 params: field", paramsSrc(`  p: '${type}'`), "test.theta"],
  ];
}

/**
 * (A) The subject at all eleven positions, plus both controls.
 *
 * SUBJECT — the specified list at every position is `binding-case-mismatch`
 * (on `Zs`) followed by bug 0228's raw-key refusal (on `a b`). That is exactly
 * CONTROL_REVERSED's own measured list: under route 1 the two spellings leave
 * `parseObject` in the identical state, which IS §Expected behaviour's
 * order-invariance claim. RED at HEAD — the case line is missing at all eleven.
 *
 * CONTROL_WELL / CONTROL_REVERSED — measured at HEAD and unmoved: the three
 * initialiser-bearing positions carry their own `let-rhs-type-mismatch` beside
 * the case line for the well-formed control (the annotation type is an object,
 * the initialiser an `integer`), and the reversed control's malformed entry is
 * LAST, so nothing sits behind the break for it to lose.
 */
function positionCells(): Cell[] {
  const cells: Cell[] = [];
  const subjectExpected: readonly Exp[] = [CASE, NOTIDENT("a b")];
  const wellExpected: Record<string, readonly Exp[]> = {
    "a1 let annotation": [CASE, LETRHS("x", "{ a: integer, Zs: string }", "integer")],
    "a2 let mut annotation": [CASE, LETRHS("x", "{ a: integer, Zs: string }", "integer")],
    "a3 fn parameter": [CASE],
    "a4 fn return": [CASE],
    "a5 schema body field": [CASE],
    "a6 alias RHS": [CASE],
    "a7 @<T> annotation root": [CASE],
    "a8 invoke<T>": [CASE],
    "a9 nested one level": [
      CASE,
      LETRHS("x", "{ q: { a: integer, Zs: string } }", "integer"),
    ],
    "a10 .thetalib schema field": [CASE],
    "a11 params: field": [CASE],
  };
  for (const [label, src, path] of positions(SUBJECT)) {
    cells.push({ cell: `${label} SUBJECT`, src, path, expected: subjectExpected });
  }
  for (const [label, src, path] of positions(CONTROL_WELL)) {
    const want = wellExpected[label];
    expect(
      want,
      `the well-formed control's expectation table must cover ${label}`,
    ).toBeDefined();
    // `noUncheckedIndexedAccess` types the lookup `readonly Exp[] | undefined`;
    // the `toBeDefined()` above is the runtime guard, so this narrows the type
    // the same fact it just asserted.
    cells.push({
      cell: `${label} CONTROL {a: integer, Zs: string}`,
      src,
      path,
      expected: want as readonly Exp[],
    });
  }
  for (const [label, src, path] of positions(CONTROL_REVERSED)) {
    cells.push({
      cell: `${label} CONTROL {Zs: string, a b: integer}`,
      src,
      path,
      expected: [CASE, NOTIDENT("a b")],
    });
  }
  return cells;
}

/**
 * (B) What else the break withholds — §Reproduction (b), each row beside the
 * single-field control that fires today.
 *
 * Every row is at a `let` annotation. The gained diagnostic emits AFTER the
 * outer interior's own raw-key line, because it is reached through `walkType`'s
 * recursion into `node.fieldTypes` (:1169) and the outer interior's raw-key
 * pass has already run.
 *
 * b9 and b10 are the two BOUNDS §Expected behaviour names as not moving: b9's
 * control draws nothing at all, so there is no emission to recover, and b10's
 * two lines both come from `interiorSource` and are present today.
 */
function withholdingCells(): Cell[] {
  const rows: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
    // b1 — a field-TYPE check reached through `fieldTypes`.
    ["b1", "{a b: integer, zs: void}", [NOTIDENT("a b"), VOIDPOS]],
    ["b1c control", "{a: integer, zs: void}", [VOIDPOS]],
    // b2 — the generic-arity check, same recursion.
    [
      "b2",
      "{a b: integer, zs: array<string, integer>}",
      [NOTIDENT("a b"), ARITY("array", "1", "2")],
    ],
    ["b2c control", "{a: integer, zs: array<string, integer>}", [ARITY("array", "1", "2")]],
    // b3 — the empty nested interior.
    ["b3", "{a b: integer, zs: {}}", [NOTIDENT("a b"), EMPTY("{}")]],
    ["b3c control", "{a: integer, zs: {}}", [EMPTY("{}")]],
    // b4–b6 — the raw-key rules of a NESTED interior, which the break withholds
    // even though the OUTER interior's own raw-key rules survive it.
    ["b4", "{a b: integer, zs: {q: integer, q: integer}}", [NOTIDENT("a b"), DUP("q")]],
    ["b4c control", "{a: integer, zs: {q: integer, q: integer}}", [DUP("q")]],
    ["b5", '{a b: integer, zs: {"q": integer}}', [NOTIDENT("a b"), QUOTED('"q"')]],
    ["b5c control", '{a: integer, zs: {"q": integer}}', [QUOTED('"q"')]],
    ["b6", "{a b: integer, zs: {c d: integer}}", [NOTIDENT("a b"), NOTIDENT("c d")]],
    ["b6c control", "{a: integer, zs: {c d: integer}}", [NOTIDENT("c d")]],
    // b7 — the case rule one level deeper. The control's `let-rhs-type-mismatch`
    // is NOT gained: the subject's own raw-key refusal is what withholds it,
    // exactly as at group (A)'s a1.
    ["b7", "{a b: integer, zs: {Q: string}}", [NOTIDENT("a b"), CASE]],
    [
      "b7c control",
      "{a: integer, zs: {Q: string}}",
      [CASE, LETRHS("x", "{ a: integer, zs: { Q: string } }", "integer")],
    ],
    // b8 — the union-arm recursion beneath the `fieldTypes` recursion (:1175).
    ["b8", "{a b: integer, zs: {Q: string} | null}", [NOTIDENT("a b"), CASE]],
    ["b8c control", "{a: integer, zs: {Q: string} | null}", [CASE]],
    // b9 — BOUND: not every field-TYPE has an emission here, so nothing is
    // recovered and this row does not move.
    ["b9 BOUND", "{a b: integer, zs: result<string>}", [NOTIDENT("a b")]],
    ["b9c control", "{a: integer, zs: result<string>}", []],
    // b10 — BOUND: the interior's OWN entries are named from `interiorSource`,
    // not from the loop, so both malformed entries are already named today.
    ["b10 BOUND", "{a b: integer, c d: integer}", [NOTIDENT("a b"), NOTIDENT("c d")]],
  ];
  return rows.map(([cell, type, expected]) => ({
    cell,
    src: theta(`let x: ${type} = 1`),
    expected,
  }));
}

/**
 * (C) Which malformed spellings break, and which recover — §Reproduction (c).
 * The second field is `Zs: string` throughout, so the question every row asks
 * is whether `binding-case-mismatch` fires on `Zs`.
 *
 * c5 and c6 are the NO-MOVE controls. c5 is the direct measurement that bug
 * 0227's `entryTainted` latch (0.183.0) governs the branch that CONTINUES:
 * `Élan` takes the tolerant-skip branch, reaches the entry-separating `,`,
 * clears the latch, and `Zs` keeps every check — TODAY. Route 1 must leave that
 * behaviour byte-identical, including the absence of any verdict on the ASCII
 * residue `lan` (bug 0227 §Non-goals, the ASCII-alphabet law).
 */
function spellingCells(): Cell[] {
  const rows: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
    ["c1 space-broken head", SUBJECT, [CASE, NOTIDENT("a b")]],
    ["c2 quoted head", '{"q x": integer, Zs: string}', [CASE, QUOTED('"q x"')]],
    ["c3 numeric head", "{3: integer, Zs: string}", [CASE, NOTIDENT("3")]],
    ["c4 rename-shaped head", '{a as "W": integer, Zs: string}', [CASE, RENAMED("a")]],
    ["c5 NO-MOVE non-ASCII head", "{Élan: string, Zs: string}", [CASE, NOTIDENT("Élan")]],
    [
      "c6 NO-MOVE well-formed uppercase head",
      "{Zs: string, q: integer}",
      [CASE, LETRHS("x", "{ Zs: string, q: integer }", "integer")],
    ],
  ];
  return rows.map(([cell, type, expected]) => ({
    cell,
    src: theta(`let x: ${type} = 1`),
    expected,
  }));
}

/**
 * (D) The generic-argument position, where nothing refused before this
 * report's own fix — §Reproduction (d).
 *
 * Bug 0154's case pass carries no generic-argument gate
 * (type-grammar.ts:1001–1038, and group (A)'s g1 cell of
 * tests/inline-object-field-name-case.test.ts pins it), so at this position it
 * is the check bug 0231's own fix (the `parseObject` resync) restores: d1
 * gains its `binding-case-mismatch` line and d3 gains it at the `params:`
 * face, where the frontmatter gate then withholds the whole frontmatter
 * object exactly as it does for d4's control.
 *
 * d1/d3 are RE-PINNED for bug 0233
 * (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md), which
 * answers the carve-out question this comment used to leave open ("which code
 * names `a b` there"): bug 0228's raw-key row no longer carries the
 * generic-argument carve-out, so `a b` now draws
 * `theta/parse/inline-field-name-not-identifier` beside the case pass's own
 * line on `Zs` — two different fields, so bug 0129's count-consequence law
 * (code-registry-parse.md:101) suppresses neither.
 */
function genericArgumentCells(): Cell[] {
  return [
    { cell: "d1", src: theta(`let x: array<${SUBJECT}> = [1]`), expected: [CASE, NOTIDENT("a b")] },
    {
      cell: "d2 control",
      src: theta(`let x: array<${CONTROL_WELL}> = [1]`),
      expected: [
        CASE,
        LETRHS("x", "array<{ a: integer, Zs: string }>", "array<integer>"),
        ARRAYELEM("0", "{ a: integer, Zs: string }", "integer"),
      ],
    },
    {
      cell: "d3 params:",
      src: paramsSrc(`  p: 'array<${SUBJECT}>'`),
      expected: [CASE, NOTIDENT("a b")],
    },
    {
      cell: "d4 params: control",
      src: paramsSrc(`  p: 'array<${CONTROL_WELL}>'`),
      expected: [CASE],
    },
  ];
}

/**
 * (J) The unclosed-interior class — §Non-goals, "Every fixture here closes its
 * braces", and group (J) of tests/inline-object-field-name-case.test.ts.
 *
 * Route 1 changes the loop's token consumption, so a resynchronising loop could
 * consume a nested interior's `}` differently and move `braceClosed` /
 * `closingBraceSpelled` / the `namesStopped` latch. Both cells are silent at
 * this arm before and after: the only diagnostic either draws is the
 * statement-level `let-without-initialiser`, because the unclosed interior
 * swallows the `= 1`.
 */
function unclosedInteriorCells(): Cell[] {
  return [
    {
      cell: "j1 unclosed nested interior",
      src: theta("let x: {a b: integer, zs: {q: integer} = 1"),
      expected: [NOINIT("x")],
    },
    {
      cell: "j2 unclosed outer interior",
      src: theta("let x: {a b: integer = 1"),
      expected: [NOINIT("x")],
    },
  ];
}

/** The whole diagnostic-list inventory, in group order. */
function allCells(): Cell[] {
  return [
    ...positionCells(),
    ...withholdingCells(),
    ...spellingCells(),
    ...genericArgumentCells(),
    ...unclosedInteriorCells(),
  ];
}

/** Declared inventory size — group (L) recomputes it (anti-vacuity). */
const TOTAL_LIST_CELLS = 64;
/** Declared count of cells whose specified list carries the case row. */
const CASE_BEARING_LIST_CELLS = 47;
/** Declared count of cells whose specified list is EMPTY. */
const EMPTY_LIST_CELLS = 1;

// ===========================================================================
// (A) THE SUBJECT AT ALL ELEVEN `Type` POSITIONS, WITH BOTH CONTROLS.
// RED at HEAD: the eleven SUBJECT cells each report bug 0228's raw-key line
// ALONE, with `binding-case-mismatch` on `Zs` missing.
// ===========================================================================

describe("bug 0231 (A) — a field behind a malformed entry keeps its own verdict at every Type position", () => {
  it("RED: rows a1–a11 with both controls, entry order pinned in both directions", () => {
    expectGroup(
      positionCells(),
      "docs/spec_topics/type-system.md:15 states ONE type grammar in every type-annotation " +
        "position and lexical.md:16 states the lowercase-first rule as a property of EACH name, " +
        "so `Zs` draws `binding-case-mismatch` in `{a b: integer, Zs: string}` exactly as it does " +
        "in `{a: integer, Zs: string}` and in `{Zs: string, a b: integer}`. A red on a SUBJECT " +
        "cell missing the case line is bug 0231: `parseObject`'s field loop broke at `a b` and " +
        "`Zs` never entered `fieldNames`",
    );
  });
});

// ===========================================================================
// (B) WHAT ELSE THE BREAK WITHHOLDS, each row against its own control.
// RED at HEAD: b1–b8 each report the raw-key line ALONE.
// ===========================================================================

describe("bug 0231 (B) — the field-TYPE checks and the nested raw-key rules behind the break", () => {
  it("RED: rows b1–b8 with their controls, and the bounds b9/b10", () => {
    expectGroup(
      withholdingCells(),
      "`walkType`'s object arm recurses through `node.fieldTypes`, so a field discarded by the " +
        "loop carries its whole subtree out of reach: the three field-TYPE checks and all four " +
        "raw-key rules at nested depth. A red on b1–b8 missing the second line is bug 0231; b9 " +
        "and b10 are the bounds and must not move",
    );
  });
});

// ===========================================================================
// (C) WHICH MALFORMED SPELLINGS BREAK, AND WHICH RECOVER.
// RED at HEAD: c1–c4 each report their own entry's row ALONE. c5 and c6 are
// GREEN now and after — they are bug 0227's latch behaviour, kept asserted.
// ===========================================================================

describe("bug 0231 (C) — every non-`Ident \":\"` head accounts for itself and for nothing else", () => {
  it("RED: rows c1–c4, with c5/c6 as the no-move latch controls", () => {
    expectGroup(
      spellingCells(),
      "code-registry-parse.md:101's count-consequence sentence (bug 0129) scopes suppression to " +
        "'that field' and licenses no withholding from a DIFFERENT field, so each of the four " +
        "breaking spellings keeps `Zs`'s case verdict beside its own row. c5 already recovers " +
        "its sibling through bug 0227's tolerant-skip branch and must still recover it; c6 " +
        "carries the complete verdict set today",
    );
  });
});

// ===========================================================================
// (D) THE GENERIC-ARGUMENT POSITION — the one place where nothing refuses.
// RED at HEAD: d1 and d3 report `[]` and REGISTER.
// ===========================================================================

describe("bug 0231 (D) — an interior deriving from no ObjectType does not load clean at a generic argument", () => {
  it("rows d1–d4, d1/d3 re-pinned for bug 0233's answer to the carve-out question", () => {
    expectGroup(
      genericArgumentCells(),
      "bug 0154's case pass is deliberately NOT withheld inside a generic argument, which is why " +
        "d2 and d4 refuse today; `Zs`'s case line stands beside `a b`'s own row at d1 and d3, " +
        "since bug 0233 removed the generic-argument carve-out bug 0228's raw-key row used to " +
        "carry — the question this comment used to leave open (`docs/bugs/0233-generic-` " +
        "`argument-inline-field-key-rules-withheld.md`)",
    );
  });

  it("RED: d1 loses its loads-cleanly status, and d3's `params:` face lowers nothing", () => {
    const d1 = parseDoc(theta(`let x: array<${SUBJECT}> = [1]`));
    expect(
      registers(d1),
      "an error-severity theta/parse/* code denies registration; at HEAD this document loads " +
        "with an EMPTY diagnostic list and REGISTERS, carrying a field name the lowercase-first " +
        "rule refuses (§Reproduction (d) row d1, and §Fix (f)'s one GOV-15 class)",
    ).toBe(false);

    const d3 = parseDoc(paramsSrc(`  p: 'array<${SUBJECT}>'`));
    expect(
      d3.frontmatter === null,
      "the frontmatter gate withholds the WHOLE frontmatter object on any error-severity " +
        "frontmatter diagnostic (the same gate d4's control already trips), so the refused " +
        "document lowers nothing at all",
    ).toBe(true);
    expect(
      JSON.stringify(d3.frontmatter?.params?.loweredSchema ?? null),
      "at HEAD this interior lowers to `{\"p\":{}}` and registers; nothing lowers from a " +
        "withheld frontmatter object",
    ).toBe("null");
  });
});

// ===========================================================================
// (F) THE LOWERED VIEW — §Reproduction (f). GREEN now and after: the lowerers
// key `properties` / `required` on the `splitTopLevel` entries
// (body-type-lowering.ts:173, params.ts:1259) and never read the loop's arrays,
// so route 1 moves neither document. Stated as the mechanism, not as a leak:
// at the ten refusing positions the document is never built.
// ===========================================================================

describe("bug 0231 (F) — the lowerer holds the fields the loop discarded, and does not move", () => {
  it("f1/f2: `lowerQueryResponseSchema` mints both properties from both interiors", () => {
    const actual = {
      f1: JSON.stringify(lowerQueryResponseSchema(SUBJECT, [], [])),
      f2: JSON.stringify(lowerQueryResponseSchema(CONTROL_WELL, [], [])),
    };
    expect(
      actual,
      "one interior, two views: the lowerer mints two properties from text on which " +
        "`parseObject` retained no field at all. This call is the one " +
        "src/extension/production-theta-producer.ts:2672 makes",
    ).toEqual({
      f1:
        '{"type":"object","properties":{"a b":{"type":"integer"},"Zs":{"type":"string"}},' +
        '"required":["a b","Zs"],"additionalProperties":false}',
      f2:
        '{"type":"object","properties":{"a":{"type":"integer"},"Zs":{"type":"string"}},' +
        '"required":["a","Zs"],"additionalProperties":false}',
    });
  });
});

// ===========================================================================
// (J) THE UNCLOSED-INTERIOR CLASS — §Non-goals. GREEN now and after.
// ===========================================================================

describe("bug 0231 (J) — an interior the source never closes stays where §Non-goals leaves it", () => {
  it("j1/j2: a resynchronising loop must not move the unclosed-interior verdicts", () => {
    expectGroup(
      unclosedInteriorCells(),
      "both passes at this arm are gated on `TypeNode.closingBraceSpelled`; route 1 changes the " +
        "loop's token consumption, so this class is pinned explicitly rather than assumed",
    );
  });
});

// ===========================================================================
// (L) ANTI-VACUITY — the inventory arithmetic, recomputed from the tables.
// ===========================================================================

describe("bug 0231 (L) — the inventory this file asserts", () => {
  it("the cell tables carry the declared counts, and only one cell expects an empty list", () => {
    const cells = allCells();
    expect(
      cells.length,
      "the declared inventory must match the tables, so a cell added or dropped re-derives it",
    ).toBe(TOTAL_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.some((e) => e.code === BINDING_CASE)).length,
      "the case row is this report's principal missing verdict; its cell count is recomputed so " +
        "a weakened expectation cannot pass unnoticed",
    ).toBe(CASE_BEARING_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.length === 0).length,
      "only b9's control expects nothing; every other cell asserts a non-empty ordered list, so " +
        "a harness that stopped reaching the parser fails loudly rather than passing vacuously",
    ).toBe(EMPTY_LIST_CELLS);
    const keys = new Set(cells.map((c) => `${c.cell} :: ${c.src}`));
    expect(
      keys.size,
      "every cell key is distinct, so no cell is silently overwritten inside a group's map",
    ).toBe(cells.length);
  });
});
