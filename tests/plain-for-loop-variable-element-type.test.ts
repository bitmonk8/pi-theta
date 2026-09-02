import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { Block, Expr, Stmt, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0126 — `TypeLayerWalk.walkStmt`'s `case "for"` records the plain `for`
// loop variable but not its TYPE, so nine registered `E`-severity type-layer
// codes cannot fire on the variable inside a plain `for` body even over a
// concrete `array<T>` iterand, while `walkExpr`'s `case "par-for"` binds the
// same variable to the same iterand's element and reports all nine on the
// identical body
// (docs/bugs/0126-plain-for-binds-no-loop-variable.md).
//
// ADDITIVE. This file is new. It modifies no existing test, and in particular
// it does not touch the five cells the fix must update — `n1`
// (tests/fn-param-alias-unfolded-at-gates.test.ts) and `u9` / `u12e` / `u13me`
// / `u13r` (tests/fn-arg-type-mismatch-wired.test.ts). Those are the
// implementer's, under the authorisations their own comments name. One of them
// hands coverage here: `u13r` is the tree's only pin of the WITHHELD sentinel's
// rendered spelling and its fixture is a plain `for`, so once the `for` binder
// stops being a withheld binder that cell must re-point onto a binder class
// this report does not touch. Row b4 below is where the `for`-fed composite
// render lands instead, byte-identical fixture text and range.
//
// ── WHAT MOVED SINCE THE BUG DOCUMENT WAS WRITTEN ───────────────────────────
// §Reproduction was measured at 0.72.0 and two later fixes moved it. Every
// expectation below is RE-DERIVED against this tree (0.106.0), not copied from
// the report:
//
//   * Bug 0050 (0.77.0) makes the plain `for` arm record the variable as a
//     WITHHELD sentinel twin (`recordWithheldBinders`), closing both of this
//     report's false-emission observables under 0050 alone: the doc's
//     `got x` / `got q` renders and its schema-namespace collision
//     (§Reproduction (b), (d)) become `[]`, because a withheld read defers at
//     every judgement sink. The core gap stays open under 0050 alone — nine
//     codes still cannot fire — because deferral is exactly what a withheld
//     read does.
//   * Bug 0136 (0.106.0) made a member read type as its receiver's declared
//     FIELD type, which is what makes row f2 (`for y in p.xs`) a live
//     composition rather than an unresolvable-iterand row.
//
// ── THE SETTLED ROUTE THIS FILE ENCODES ─────────────────────────────────────
// Route 1 of §Fix (a): bind in place at `walkStmt`'s `case "for"`. The iterand
// type the arm already computes for its admissibility gate is unfolded through
// `unfoldAlias` (TYPE-11, docs/spec_topics/type-system.md:54); when the
// unfolded iterand is an `array` the loop variable is bound to its `element`,
// with the `par for` arm's own `unprovableBindings` marking mirrored so an
// unprovable iterand's element is not treated as a proof; otherwise the arm
// falls back to `recordWithheldBinders` — bug 0050's twin, NOT the `par for`
// arm's `{ kind: "named", name: "unknown" }`. Group (g) is the witness for that
// choice: the literal `par for` mirror reintroduces this report's own defect
// (a FALSE `theta/parse/non-array-iterand … got unknown` at the binder classes
// 0126 does not own) and renders an internal sentinel into a `<type>`
// placeholder, which placeholder-rendering-a.md:13–21 does not admit.
//
// ── FIX-PRODUCED EMISSION vs REGRESSION PIN ─────────────────────────────────
// Each row below pins an emission that reds if the element binding in
// `walkStmt`'s `case "for"` is removed — the loop variable then carries no
// element type for the expected `theta/parse/*` diagnostic to judge:
//   (a) a1–a10, the nine-code inventory's `for` column.
//   (b) b1, b2 (the `non-array-iterand` render: `got string` at BOTH
//       spellings), b4 (the composite render: `array<integer>` with the
//       binding in place, the withheld sentinel's spelling without it).
//   (c) c8, the nested body that READS the inner variable.
//   (d) d1, d1n, d2, d2n — the collision rows that decide on the ELEMENT type.
//   (e) e1, the fn-arg composition; e4, the member-iterand proof, moved here
//       under bug 0190's authority (see the group-(e) banner).
//   (f) f1, f2 — the alias iterand and the member iterand.
// The rows below are regression pins: each holds in both directions, with or
// without that binding, and must stay green regardless:
//   every `par for` and `let` control of group (a); b3, b5, b6, b7; c1–c7;
//   d3, d3n, d4, d4n, d5 and every collision-pair identity; e2, e3;
//   g1–g6; h1–h3.
//
// Group (a)'s three cells share one `it`, and the two controls are asserted
// BEFORE the subject, so the failure names the cell that failed (`a1 [for]`)
// and a control that moved would surface as its own label instead — the
// attribution the whole inventory rests on.
//
// ANTI-VACUITY. Forty-six of the seventy-three fixture cells (53 `it` blocks;
// group (a) carries three cells each) expect a NON-EMPTY ordered
// list, so a harness that stopped reaching the type layer (a frontmatter
// refusal, an unfed static-type pass) fails loudly here rather than turning the
// `CLEAN` rows into silent passes. Every absence row additionally carries the
// binder-site precondition, and the paired-identity cells of group (d) compare
// two fixtures to each other rather than to a list, so they hold in both
// directions.
//
// b1 / b2 EMIT rather than staying silent, and row b3 is the whole evidence
// for that. b3 is the `par for` arm — the arm that already binds the loop
// variable — over the identical body, and it reports
// `theta/parse/non-array-iterand :: 'for' expects array<T> after 'in'; got
// string`: the outer element IS a `string`, so the inner `for y in x` is a
// genuine non-array iterand and the emission is a TRUE positive rather than a
// regression. b1 / b2 are byte-identical to b3 once the plain arm binds the
// same element, so carrying them as `[]` pins would demand of one arm a silence
// the other arm does not keep on the same text.
//
// ── TIER: unit, offline, provider-free, deterministic ───────────────────────
// Every row settles inside one `parseThetaDocument` call: the site under test
// is a type-layer scope write on the load path and its whole observable is the
// document's aggregated `diagnostics` list. An INTEGRATION tier would add a
// session round-trip that observes neither the recorded `CompatType` nor the
// diagnostic list. A LIVE tier would put a stochastic model between the fixture
// and a fully determined parse-time observable. Nothing in §Fix (a) route 1
// touches a live-exercised surface (the subagent child launch, the production
// drivers, the binder), so neither tier reaches a seam this one cannot. The
// newly-reachable codes ARE an H9a `permitted-codes.json` question (§Fix (g));
// that assessment belongs to the fix run's live pass, not to this witness.
//
// ── HARNESS ─────────────────────────────────────────────────────────────────
// The shared house driver `parseDoc` (tests/helpers/e2e-s1.ts:39), unmodified —
// the real `parseThetaDocument` behind inert offline seams, the entry point
// §Reproduction measured through and the one bug 0089's and bug 0136's
// witnesses use. Every fixture carries `---\nmode: prompt\n---` and a trailing
// final value.
//
// ── THE DIAGNOSTIC ORACLE: DIAG-4 ───────────────────────────────────────────
// docs/spec_topics/diagnostics/diagnostic-shape.md:74 makes the registry's
// *Message* column normative and requires an asserting test to source its
// expected strings from it. Every message below is read through `parseRegistry`
// + `registryMessage` (tools/code-registry/index.js) and interpolated in ONE
// pass, with an unsupplied or unused placeholder throwing — the mechanism
// tests/fn-arg-type-mismatch-wired.test.ts established. Registry rows are cited
// by CODE, never by line: the report's registry line citations have drifted.
//
// ── NO SILENT SKIPPING (CLAUDE.md) ──────────────────────────────────────────
// Nothing here early-returns, branches on the environment, or skips. A missing
// registry row throws NAMING the row; a fixture that stopped parsing, or whose
// layout drifted, fails its own `PRECONDITION` naming the binder sites it found
// instead of letting a `toEqual([])` row pass while measuring nothing. Every row
// asserts its WHOLE ordered code list AND its whole ordered message list, so an
// absent emission, an extra emission and a reordering all red.
//
// ── CITATION POSTURE ────────────────────────────────────────────────────────
// `src/` is cited by SYMBOL (`walkStmt`'s `case "for"`, `recordWithheldBinders`,
// `walkExpr`'s `case "par-for"`, `unfoldAlias`, `checkForIterand`): the
// report's implementation line spans are 0.72.0 coordinates and have drifted.
// Sibling test files are cited by CELL ID. Spec citations carry lines, each
// re-derived against this tree.

// ===========================================================================
// The DIAG-4 oracle.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — this file's only message oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template. Throws naming the registry
 * page when the row is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * Interpolate a registered template's `<…>` placeholders from `subs`, in one
 * pass so a substituted value is never re-scanned — `<element>` legitimately
 * expands to text containing angle brackets (`array<number>`, row a6).
 *
 * The placeholder set is derived from the TEMPLATE: an unsupplied placeholder
 * and an unused substitution both throw, so a registry row that changes shape
 * fails loudly here instead of quietly producing a string no emission equals.
 */
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registered(code);
  const used = new Set<string>();
  const message = template.replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness: this file substitutes ${token} into the ${code} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
  }
  return message;
}

const UNKNOWN_METHOD = "theta/parse/unknown-method";
const MIXED_PLUS = "theta/parse/mixed-plus-operands";
const NON_INDEXABLE = "theta/parse/non-indexable-receiver";
const INTEGER_NARROWING = "theta/parse/integer-narrowing";
const NON_STRING_JOIN = "theta/parse/non-string-array-join";
const NON_BOOLEAN = "theta/parse/non-boolean-condition";
const NON_ORDERABLE = "theta/parse/non-orderable-operands";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const OBJECT_FIELD = "theta/parse/object-field-type-mismatch";
const NON_ARRAY_ITERAND = "theta/parse/non-array-iterand";
const UNKNOWN_IDENTIFIER = "theta/parse/unknown-identifier";
const INCREMENT_DECREMENT = "theta/parse/increment-decrement";
const IMMUTABLE_REBINDING = "theta/parse/immutable-rebinding";
const FN_ARG = "theta/parse/fn-arg-type-mismatch";

/** `unknown method '<method>' on type <type>` */
function unknownMethod(method: string, type: string): string {
  return fill(
    UNKNOWN_METHOD,
    new Map([
      ["<method>", method],
      ["<type>", type],
    ]),
  );
}

/** `'+' has mixed operand types: <left> and <right>` */
function mixedPlus(left: string, right: string): string {
  return fill(
    MIXED_PLUS,
    new Map([
      ["<left>", left],
      ["<right>", right],
    ]),
  );
}

/** `indexed access requires an array<T> or object receiver; got <type>` */
function nonIndexable(type: string): string {
  return fill(NON_INDEXABLE, new Map([["<type>", type]]));
}

/** `cannot narrow number to integer` (no placeholders). */
function integerNarrowing(): string {
  return fill(INTEGER_NARROWING, new Map());
}

/** `array.join requires a string element type; got array<<element>>` */
function arrayJoin(element: string): string {
  return fill(NON_STRING_JOIN, new Map([["<element>", element]]));
}

/** `condition must be boolean; got <type>` */
function condition(type: string): string {
  return fill(NON_BOOLEAN, new Map([["<type>", type]]));
}

/** `'<op>' requires two numeric or two string operands; got <left> and <right>` */
function nonOrderable(op: string, left: string, right: string): string {
  return fill(
    NON_ORDERABLE,
    new Map([
      ["<op>", op],
      ["<left>", left],
      ["<right>", right],
    ]),
  );
}

/** `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>` */
function letRhs(name: string, expected: string, actual: string): string {
  return fill(
    LET_RHS,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>` */
function objectField(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return fill(
    OBJECT_FIELD,
    new Map([
      ["<field>", field],
      ["<schema>", schema],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `'for' expects array<T> after 'in'; got <type>` */
function iterand(type: string): string {
  return fill(NON_ARRAY_ITERAND, new Map([["<type>", type]]));
}

/** `unknown identifier '<name>'` */
function unknownIdentifier(name: string): string {
  return fill(UNKNOWN_IDENTIFIER, new Map([["<name>", name]]));
}

/** `'<op>' operator is not supported` */
function incrementDecrement(op: string): string {
  return fill(INCREMENT_DECREMENT, new Map([["<op>", op]]));
}

/** `cannot reassign immutable binding '<name>'` */
function immutableRebinding(name: string): string {
  return fill(IMMUTABLE_REBINDING, new Map([["<name>", name]]));
}

/** `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got <actual>` */
function fnArg(
  name: string,
  index: number,
  param: string,
  expected: string,
  actual: string,
): string {
  return fill(
    FN_ARG,
    new Map([
      ["<name>", name],
      ["<i>", String(index)],
      ["<param>", param],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

// ===========================================================================
// Parse harness.
// ===========================================================================

const FILE = "bug0126.theta";

/** Frontmatter occupies lines 1–3; every fixture body therefore starts at 4. */
const FM = "---\nmode: prompt\n---\n";

function parse(body: string, path = FILE): ThetaDocument {
  return parseDoc(FM + body, path);
}

function at(r: SourceRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** Every diagnostic rendered `severity code @range: message` — failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}: ${d.message}`;
    }),
  );
}

/**
 * Every LOOP-VARIABLE and `let` binder site of `doc` in source order, each
 * rendered `<kind> <name>@<range>`: a `for` / `par-for` site carries its
 * ITERAND's range (the span `checkForIterand` reports on), a `let` site carries
 * the statement's own range (the span the relation sinks report on).
 *
 * This is the loud precondition every row runs FIRST. The subject of this file
 * is a scope write that has no direct observable, so most rows assert an
 * absence or a single emission; without an anchor a fixture that stopped
 * parsing, lost its loop, or drifted a line would let those rows pass while
 * measuring nothing. A body the walk cannot reach throws naming the fixture
 * rather than returning an empty list.
 */
function binderSites(doc: ThetaDocument): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "par-for":
        out.push(`par-for ${e.variable}@${at(e.iterand.range)}`);
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        walkBlock(e.body);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
      case "call":
      case "invoke":
        for (const a of e.args) walkExpr(a);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "member":
        walkExpr(e.target);
        return;
      case "index":
        walkExpr(e.target);
        walkExpr(e.index);
        return;
      case "binary":
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      case "ternary":
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "array":
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "result-ctor":
        walkExpr(e.arg);
        return;
      default:
        return;
    }
  };
  const walkBlock = (b: Block): void => {
    for (const s of b.statements) walkStmt(s);
    if (b.tail !== null) walkExpr(b.tail);
  };
  const walkStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "let":
        out.push(`let ${s.name}@${at(s.range)}`);
        if (s.init !== null) walkExpr(s.init);
        return;
      case "for":
        out.push(`for ${s.variable}@${at(s.iterand.range)}`);
        walkExpr(s.iterand);
        walkBlock(s.body);
        return;
      case "fn":
        walkBlock(s.body);
        return;
      case "while":
        walkExpr(s.condition);
        walkBlock(s.body);
        return;
      case "if": {
        walkExpr(s.condition);
        walkBlock(s.then);
        // `otherwise` is a chained `IfStmt`, an `else` `Block`, or none; only
        // the statement form carries a `kind` discriminator.
        const otherwise = s.otherwise;
        if (otherwise !== null) {
          if ("kind" in otherwise) walkStmt(otherwise);
          else walkBlock(otherwise);
        }
        return;
      }
      case "expr":
        walkExpr(s.expr);
        return;
      case "reassign":
        walkExpr(s.value);
        return;
      case "return":
        if (s.operand !== null) walkExpr(s.operand);
        return;
      default:
        return;
    }
  };
  const body = doc.body;
  if (body === null) {
    throw new Error(
      `harness: the fixture produced no parsed body, so its diagnostic set is about a parse failure rather than the \`for\` body under test. Diagnostics: ${render(doc)}`,
    );
  }
  walkBlock(body);
  return out;
}

interface Expectation {
  readonly codes: readonly string[];
  readonly msgs: readonly string[];
}

/** The empty contract — no diagnostic at all. */
const CLEAN: Expectation = { codes: [], msgs: [] };

/** A one-diagnostic contract. */
function one(code: string, message: string): Expectation {
  return { codes: [code], msgs: [message] };
}

/**
 * Parse a fixture and run its binder-site precondition, asserting nothing about
 * the diagnostics. Used on its own by the paired-identity cells, which must be
 * green in BOTH directions and so cannot carry either direction's absolute list.
 */
function parseAnchored(
  label: string,
  src: string,
  sites: readonly string[],
): ThetaDocument {
  const doc = parse(src);
  expect(
    binderSites(doc),
    `${label} PRECONDITION: the fixture's loop-variable / \`let\` binder sites must be exactly these, so a drifted or unparsed fixture fails here instead of letting the assertions below measure nothing. Diagnostics: ${render(doc)}`,
  ).toEqual([...sites]);
  return doc;
}

/**
 * One row: the binder-site precondition, then the WHOLE ordered code list, then
 * the whole ordered message list. Whole-list ordered equality throughout — a
 * containment matcher would let a spurious extra diagnostic hide, and the
 * message list is what catches a fix that restores a code while rendering the
 * wrong type into its `<type>` placeholder
 * (placeholder-rendering-a.md:13–21).
 */
function expectRow(
  label: string,
  src: string,
  sites: readonly string[],
  expected: Expectation,
  why: string,
): ThetaDocument {
  const doc = parseAnchored(label, src, sites);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    `${label} — ${why}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...expected.codes]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.message),
    `${label} — DIAG-4 (diagnostic-shape.md:74): the rendered messages are the registry *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...expected.msgs]);
  return doc;
}

// ===========================================================================
// Fixture builders. The `for` and `par for` columns of group (a) share ONE body
// text, which is the asymmetry the report is about: the same statement over the
// same iterand, reported by one arm and not the other.
// ===========================================================================

/**
 * `fn f(xs: T) { <kw> x in xs { <stmt> } }` plus a trailing `1` for the theta's
 * final value. `prelude` (a schema declaration) shifts the body down.
 */
function ITER(t: string, kw: "for" | "par for", stmt: string, prelude = ""): string {
  return prelude + `fn f(xs: ${t}) {\n  ${kw} x in xs {\n    ${stmt}\n  }\n}\n1\n`;
}

/**
 * The `let` control: the same statement over a binding that carries the element
 * type DIRECTLY, which proves the checker is live for this operand type in this
 * position independently of either loop arm.
 */
function LET(decl: string, literal: string, stmt: string, prelude = ""): string {
  return prelude + `fn f() {\n  let x: ${decl} = ${literal}\n  ${stmt}\n}\n1\n`;
}

/** The group (d) collision shape: an UPPERCASE loop variable spelled `Q`. */
function ITER_Q(t: string, stmt: string, prelude = ""): string {
  return prelude + `fn f(xs: ${t}) {\n  for Q in xs {\n    ${stmt}\n  }\n}\n1\n`;
}

/**
 * The group (g) shape: an UNANNOTATED `fn` parameter as the iterand. `prelude`
 * (a schema declaration) shifts the body down, as it does in `ITER` — g6 needs
 * one because an object receiver cannot be built without a declared schema.
 */
function UNANNOTATED(variable: string, stmt: string, prelude = ""): string {
  return prelude + `fn h(p) {\n  for ${variable} in p {\n    ${stmt}\n  }\n}\n1\n`;
}

const SCHEMA_P_A = "schema P {\n  a: integer\n}\n";

/** The `for` column's binder site in an `ITER` / `ITER_Q` fixture with no prelude. */
const ITER_FOR_SITE = "for x@5:12-5:14";
/** The `par for` column's, whose keyword is four columns wider. */
const ITER_PAR_SITE = "par-for x@5:16-5:18";
/** The `let` control's own site is the annotated binding itself. */
const LET_SITE = (endColumn: number): string => `let x@5:3-5:${endColumn}`;

// ===========================================================================
// (a) The nine-code inventory. Ten `<stmt>` rows over ten fixtures, three
// columns each: the plain `for` row (the subject, RED), its `par for` control
// and its `let` control. Rows a1 and a2 are one registry row
// (`theta/parse/unknown-method`) reached through the method-call and
// member-access classifiers, so the distinct-code count is NINE.
//
// The two controls are what make a red attributable to the `for` arm: they
// carry the identical statement over the identical element type, so if either
// goes red the checker itself moved and the `for` column's red says nothing
// about this report. type-system.md:48 licences skipping a check only "when
// either side of a compatibility check is past the parser's static view"; an
// element type two arms derive from the same AST node is not, which is the
// whole claim these thirty cells settle.
// ===========================================================================

describe("bug 0126 (a) — nine registered codes fire on a plain `for` loop variable", () => {
  it("RED a1: unknown-method on a `string` element, through the METHOD-CALL classifier", () => {
    // expressions.md:122 — "Anything not on this list is
    // `theta/parse/unknown-method` rather than a runtime failure", over the
    // `string` stdlib surface expressions.md:71 enumerates.
    const expected = one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string"));
    expectRow(
      "a1p [par for control]",
      ITER("array<string>", "par for", "x.frobnicate()"),
      [ITER_PAR_SITE],
      expected,
      "`walkExpr`'s `case \"par-for\"` binds the loop variable to the unfolded iterand's element, so the method gate resolves `x` as `string` — green in both directions",
    );
    expectRow(
      "a1l [let control]",
      LET("string", '"a"', "x.frobnicate()"),
      [LET_SITE(22)],
      expected,
      "the `let` arm records the annotation directly, so the same statement over the same element type reaches the same gate — green in both directions",
    );
    expectRow(
      "a1 [for]",
      ITER("array<string>", "for", "x.frobnicate()"),
      [ITER_FOR_SITE],
      expected,
      "control-flow.md:13 gives the iterand type `array<T>`; the loop variable's static type is that `T`, so the plain `for` body reaches the gate its two controls reach",
    );
  });

  it("RED a2: unknown-method on a `string` element, through the MEMBER-ACCESS classifier", () => {
    // The same registry row reached by the other classifier, which is why the
    // inventory has ten rows and nine codes.
    const expected = one(UNKNOWN_METHOD, unknownMethod("field", "string"));
    expectRow(
      "a2p [par for control]",
      ITER("array<string>", "par for", "x.field"),
      [ITER_PAR_SITE],
      expected,
      "the member classifier answers off the bound element type — green in both directions",
    );
    expectRow(
      "a2l [let control]",
      LET("string", '"a"', "x.field"),
      [LET_SITE(22)],
      expected,
      "the annotated binding reaches the member classifier — green in both directions",
    );
    expectRow(
      "a2 [for]",
      ITER("array<string>", "for", "x.field"),
      [ITER_FOR_SITE],
      expected,
      "a member access on a plain `for` loop variable is judged against the element type, exactly as the method form is",
    );
  });

  it("RED a3: mixed-plus-operands on a `string` element", () => {
    const expected = one(MIXED_PLUS, mixedPlus("string", "integer"));
    expectRow(
      "a3p [par for control]",
      ITER("array<string>", "par for", "let _p = x + 1"),
      [ITER_PAR_SITE, "let _p@6:5-6:19"],
      expected,
      "the `+` operand classifier resolves both operands — green in both directions",
    );
    expectRow(
      "a3l [let control]",
      LET("string", '"a"', "let _p = x + 1"),
      [LET_SITE(22), "let _p@6:3-6:17"],
      expected,
      "the annotated binding reaches the `+` classifier — green in both directions",
    );
    expectRow(
      "a3 [for]",
      ITER("array<string>", "for", "let _p = x + 1"),
      [ITER_FOR_SITE, "let _p@6:5-6:19"],
      expected,
      "`+` over a plain `for` loop variable and an `integer` literal is a mixed pair once the variable carries the element type",
    );
  });

  it("RED a4: non-indexable-receiver on a `string` element", () => {
    const expected = one(NON_INDEXABLE, nonIndexable("string"));
    expectRow(
      "a4p [par for control]",
      ITER("array<string>", "par for", "let _i = x[0]"),
      [ITER_PAR_SITE, "let _i@6:5-6:18"],
      expected,
      "the index gate classifies the bound element as a non-indexable receiver — green in both directions",
    );
    expectRow(
      "a4l [let control]",
      LET("string", '"a"', "let _i = x[0]"),
      [LET_SITE(22), "let _i@6:3-6:16"],
      expected,
      "the annotated binding reaches the index gate — green in both directions",
    );
    expectRow(
      "a4 [for]",
      ITER("array<string>", "for", "let _i = x[0]"),
      [ITER_FOR_SITE, "let _i@6:5-6:18"],
      expected,
      "indexing a plain `for` loop variable is decided by the element type",
    );
  });

  it("RED a5: integer-narrowing on a `number` element", () => {
    const expected = one(INTEGER_NARROWING, integerNarrowing());
    expectRow(
      "a5p [par for control]",
      ITER("array<number>", "par for", "let n: integer = x"),
      [ITER_PAR_SITE, "let n@6:5-6:23"],
      expected,
      "the one-way `integer → number` widening is judged off the bound element — green in both directions",
    );
    expectRow(
      "a5l [let control]",
      LET("number", "1.5", "let n: integer = x"),
      [LET_SITE(22), "let n@6:3-6:21"],
      expected,
      "the annotated `number` binding reaches the narrowing check — green in both directions",
    );
    expectRow(
      "a5 [for]",
      ITER("array<number>", "for", "let n: integer = x"),
      [ITER_FOR_SITE, "let n@6:5-6:23"],
      expected,
      "an `array<number>` iterand's element is `number`, which no `integer` sink admits",
    );
  });

  it("RED a6: non-string-array-join on an `array<number>` element", () => {
    // The element type of the ELEMENT: the iterand is `array<array<number>>`,
    // so the loop variable is the inner array and `join`'s own element gate is
    // what answers.
    const expected = one(NON_STRING_JOIN, arrayJoin("number"));
    expectRow(
      "a6p [par for control]",
      ITER("array<array<number>>", "par for", 'let _j = x.join(",")'),
      [ITER_PAR_SITE, "let _j@6:5-6:25"],
      expected,
      "`checkArrayJoin` admits a `string` element and nothing else, over the bound element — green in both directions",
    );
    expectRow(
      "a6l [let control]",
      LET("array<number>", "[1]", 'let _j = x.join(",")'),
      [LET_SITE(29), "let _j@6:3-6:23"],
      expected,
      "the annotated `array<number>` binding reaches the join gate — green in both directions",
    );
    expectRow(
      "a6 [for]",
      ITER("array<array<number>>", "for", 'let _j = x.join(",")'),
      [ITER_FOR_SITE, "let _j@6:5-6:25"],
      expected,
      "a nested-array iterand's element is the inner array, so `join`'s element precondition is decidable inside the plain `for` body",
    );
  });

  it("RED a7: non-boolean-condition on a `string` element", () => {
    const expected = one(NON_BOOLEAN, condition("string"));
    expectRow(
      "a7p [par for control]",
      ITER("array<string>", "par for", "if x { }"),
      [ITER_PAR_SITE],
      expected,
      "the boolean-position gate reads the bound element — green in both directions",
    );
    expectRow(
      "a7l [let control]",
      LET("string", '"a"', "if x { }"),
      [LET_SITE(22)],
      expected,
      "the annotated binding reaches the boolean-position gate — green in both directions",
    );
    expectRow(
      "a7 [for]",
      ITER("array<string>", "for", "if x { }"),
      [ITER_FOR_SITE],
      expected,
      "an `if` inside a plain `for` body judges its condition against the element type",
    );
  });

  it("RED a8: non-orderable-operands on a `string` element", () => {
    const expected = one(NON_ORDERABLE, nonOrderable("<", "string", "integer"));
    expectRow(
      "a8p [par for control]",
      ITER("array<string>", "par for", "let _o = x < 1"),
      [ITER_PAR_SITE, "let _o@6:5-6:19"],
      expected,
      "the ordering-operand classifier reads the bound element — green in both directions",
    );
    expectRow(
      "a8l [let control]",
      LET("string", '"a"', "let _o = x < 1"),
      [LET_SITE(22), "let _o@6:3-6:17"],
      expected,
      "the annotated binding reaches the ordering classifier — green in both directions",
    );
    expectRow(
      "a8 [for]",
      ITER("array<string>", "for", "let _o = x < 1"),
      [ITER_FOR_SITE, "let _o@6:5-6:19"],
      expected,
      "a `string` element against an `integer` literal is a non-orderable pair",
    );
  });

  it("RED a9: let-rhs-type-mismatch on a `string` element", () => {
    // Same statement text as a5, different iterand: type-system.md:27 lists
    // "the RHS of a typed `let`" among the positions `⊑` governs, and which of
    // the two codes answers is decided by the element type alone.
    const expected = one(LET_RHS, letRhs("n", "integer", "string"));
    expectRow(
      "a9p [par for control]",
      ITER("array<string>", "par for", "let n: integer = x"),
      [ITER_PAR_SITE, "let n@6:5-6:23"],
      expected,
      "the typed-`let` sink judges the bound element — green in both directions",
    );
    expectRow(
      "a9l [let control]",
      LET("string", '"a"', "let n: integer = x"),
      [LET_SITE(22), "let n@6:3-6:21"],
      expected,
      "the annotated binding reaches the typed-`let` sink — green in both directions",
    );
    expectRow(
      "a9 [for]",
      ITER("array<string>", "for", "let n: integer = x"),
      [ITER_FOR_SITE, "let n@6:5-6:23"],
      expected,
      "a typed `let` inside a plain `for` body judges its initialiser against the element type",
    );
  });

  it("RED a10: object-field-type-mismatch on a `string` element", () => {
    // The schema prelude shifts every body line down by three.
    const expected = one(OBJECT_FIELD, objectField("a", "P", "integer", "string"));
    expectRow(
      "a10p [par for control]",
      ITER("array<string>", "par for", "let p = P { a: x }", SCHEMA_P_A),
      ["par-for x@8:16-8:18", "let p@9:5-9:23"],
      expected,
      "the constructor-field sink judges the bound element — green in both directions",
    );
    expectRow(
      "a10l [let control]",
      LET("string", '"a"', "let p = P { a: x }", SCHEMA_P_A),
      ["let x@8:3-8:22", "let p@9:3-9:21"],
      expected,
      "the annotated binding reaches the constructor-field sink — green in both directions",
    );
    expectRow(
      "a10 [for]",
      ITER("array<string>", "for", "let p = P { a: x }", SCHEMA_P_A),
      ["for x@8:12-8:14", "let p@9:5-9:23"],
      expected,
      "a schema constructor inside a plain `for` body judges its field value against the element type",
    );
  });
});

// ===========================================================================
// (b) What the loop variable RENDERS as — the only direct observable of the
// type it carries, since a scope write has none of its own.
//
// The report's `got x` / `got q` pair was measured at 0.72.0, when the unbound
// variable read as `{ kind: "named", name: "<own spelling>" }` and
// `checkForIterand` rendered that identifier into a `<type>` placeholder.
// Bug 0050's WITHHELD twin closed the false emission: b1 / b2 are `[]` at this
// HEAD. They are still the render rows, because the loop variable's spelling is
// STILL what the pre-0050 tree rendered and the post-fix render is the ELEMENT
// TYPE at both spellings — the same string b3, the arm that already binds,
// reports. That is placeholder-rendering-a.md:13–21 satisfied by construction:
// a `<type>` slot holds a primitive type name, never a value binding's name.
//
// b4 carries the sentinel-render coverage that
// tests/fn-arg-type-mismatch-wired.test.ts cell u13r is losing. u13r is the
// tree's only pin of the WITHHELD sentinel's rendered spelling
// (`array<<withheld>>`) and its fixture's binder is a plain `for` variable, so
// once that variable carries the element type the cell no longer exercises its
// own subject and must re-point onto a binder class this report does not touch.
// The fixture text here is u13r's byte-for-byte, so the `for`-fed composite
// render — same code, same range, only the rendered type moving from the
// sentinel to `array<integer>` — is pinned here instead.
// ===========================================================================

const B1_NESTED_X = ITER("array<string>", "for", "for y in x { }");
const B2_NESTED_Q = "fn f(xs: array<string>) {\n  for q in xs {\n    for y in q { }\n  }\n}\n1\n";
const B3_PAR_OUTER = "fn f(xs: array<string>) {\n  par for x in xs {\n    for y in x { }\n    1\n  }\n}\n1\n";
const B4_COMPOSITE_RENDER = 'for x in [3] { if [x] { let r = 1 } }\n"t"\n';

describe("bug 0126 (b) — the loop variable's rendered type", () => {
  it("RED b1: a nested `for` over a `string` element renders the ELEMENT TYPE, not the variable's name", () => {
    // The report's `got x` row. At 0.72.0 this emitted `got x`; bug 0050 made it
    // `[]`; once the variable carries `string` it emits the same string its
    // `par for` control (b3) already does. The row that would red a fix
    // rendering an identifier into `<type>` again.
    expectRow(
      "b1",
      B1_NESTED_X,
      [ITER_FOR_SITE, "for y@6:14-6:15"],
      one(NON_ARRAY_ITERAND, iterand("string")),
      "the inner iterand IS the outer element, so `checkForIterand` decides on `string` and renders `string` — a primitive type name, which is what placeholder-rendering-a.md:13–21 admits in a `<type>` slot",
    );
  });

  it("RED b2: the render does not track the loop variable's SPELLING", () => {
    // The report's `got q` row, the pair that fixed the pre-0050 value as
    // `named "<own spelling>"`. Post-fix b1 and b2 render the SAME type, which
    // is the proof the identifier channel is gone rather than renamed.
    expectRow(
      "b2",
      B2_NESTED_Q,
      ["for q@5:12-5:14", "for y@6:14-6:15"],
      one(NON_ARRAY_ITERAND, iterand("string")),
      "renaming the loop variable must not change the rendered type: both spellings render the iterand's element type",
    );
  });

  it("CONTROL b3: the `par for` outer arm already renders the element type", () => {
    // The arm that binds, on the identical inner loop. Green in both
    // directions, and the string b1 / b2 must match post-fix.
    expectRow(
      "b3",
      B3_PAR_OUTER,
      [ITER_PAR_SITE, "for y@6:14-6:15"],
      one(NON_ARRAY_ITERAND, iterand("string")),
      "control-flow.md:70 — `par for` reuses the `for` iterand contract unchanged, and this is the render that contract produces",
    );
  });

  it("RED b4: a COMPOSITE built from the loop variable renders `array<integer>`, not the withheld sentinel", () => {
    // u13r's fixture text, byte-for-byte. `if [x]` is not boolean whatever `x`
    // holds, so the verdict rests on the array kind and not on the element:
    // the code and the range are unchanged in both directions and the RENDER
    // is the whole observable. With the element binding in place the
    // composite renders `array<integer>` — the source-grammar form
    // placeholder-rendering-a.md:13–21 requires; without it the sentinel
    // shows through instead (`array<<withheld>>`).
    const expected = one(NON_BOOLEAN, condition("array<integer>"));
    const doc = expectRow(
      "b4",
      B4_COMPOSITE_RENDER,
      ["for x@4:10-4:13", "let r@4:25-4:34"],
      expected,
      "the loop variable of `for x in [3]` is an `integer`, so a composite built from it renders `array<integer>`",
    );
    // The located form, so the row also pins that the verdict and its span are
    // NOT what moves — only the rendered type.
    expect(
      doc.diagnostics.map((d: Diagnostic) => {
        const r = d.range;
        return `${d.severity} ${d.message} @${r === undefined ? "-" : at(r)}`;
      }),
      `b4 — the code and range are byte-identical before and after; the render is the observable. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${expected.msgs[0]!} @4:19-4:22`]);
  });

  it("PIN b5: a bare read of the loop variable stays clean", () => {
    expectRow(
      "b5",
      ITER("array<string>", "for", "x"),
      [ITER_FOR_SITE],
      CLEAN,
      "control-flow.md:13 binds the iteration variable as a local and bindings.md:30 makes it immutable per iteration; reading it draws nothing in either direction",
    );
  });

  it("PIN b6: `theta/parse/unknown-identifier` is unmoved — silent on the loop variable, live on a free name", () => {
    // `walkIdentStmt`'s `case "for"` binds the variable in the NAME-RESOLUTION
    // scope already, which is why this code never fired on `x`. Unmoved by a
    // type-layer scope write in either direction.
    expectRow(
      "b6",
      ITER("array<string>", "for", "z"),
      [ITER_FOR_SITE],
      one(UNKNOWN_IDENTIFIER, unknownIdentifier("z")),
      "the name-resolution scope already binds the loop variable, so this row answers about `z` and nothing else",
    );
  });

  it("PIN b7: `theta/parse/increment-decrement` is unmoved — its wiring is lexical and needs no type", () => {
    expectRow(
      "b7",
      ITER("array<string>", "for", "x++"),
      [ITER_FOR_SITE],
      one(INCREMENT_DECREMENT, incrementDecrement("++")),
      "bug 0084's wiring is lexical, so binding a type to the loop variable neither adds nor removes this emission",
    );
  });
});

// ===========================================================================
// (c) Nested plain `for`. The report's group (c) was a FALSE-REJECTION group at
// 0.72.0 — a spec-legal nested loop over `array<array<T>>` drew an
// `E`-severity `theta/parse/non-array-iterand` and `hasLoadParseError` denied
// registration. Bug 0050's withheld twin closed all of it: c1–c7 are `[]` at
// this HEAD and must stay `[]`, so they are REGRESSION PINS, not red rows. They
// are the rows that red if a fix binds a type the inner iterand gate then
// refuses.
//
// c8 is the red row at this depth, and the one the report did not have: a
// nested body that READS the inner variable. It proves the binding CHAINS —
// the outer element becomes the inner iterand, whose element is what the body
// sink judges.
// ===========================================================================

describe("bug 0126 (c) — nested plain `for` loops", () => {
  it("PIN c1: depth 2 over an `array<array<string>>` parameter loads clean", () => {
    expectRow(
      "c1",
      "fn f(xs: array<array<string>>) {\n  for x in xs {\n    for y in x { }\n  }\n}\n1\n",
      [ITER_FOR_SITE, "for y@6:14-6:15"],
      CLEAN,
      "control-flow.md:13 admits the inner iterand: the outer element IS `array<string>`, so nothing is owed here in either direction",
    );
  });

  it("PIN c2: depth 2 over a typed `let` loads clean", () => {
    expectRow(
      "c2",
      'fn f() {\n  let xss: array<array<string>> = [["a"]]\n  for x in xss {\n    for y in x { }\n  }\n}\n1\n',
      ["let xss@5:3-5:42", "for x@6:12-6:15", "for y@7:14-7:15"],
      CLEAN,
      "the iterand's route to its type does not change the disposition",
    );
  });

  it("PIN c3: depth 2 at the TOP LEVEL, with no enclosing `fn`, loads clean", () => {
    expectRow(
      "c3",
      'for x in [["a"]] {\n  for y in x { }\n}\n1\n',
      ["for x@4:10-4:17", "for y@5:12-5:13"],
      CLEAN,
      "an array-literal iterand at the top level reaches the same disposition as a parameter",
    );
  });

  it("PIN c4: depth 3 loads clean", () => {
    expectRow(
      "c4",
      "fn f(xs: array<array<array<string>>>) {\n  for a in xs {\n    for b in a {\n      for c in b { }\n    }\n  }\n}\n1\n",
      ["for a@5:12-5:14", "for b@6:14-6:15", "for c@7:16-7:17"],
      CLEAN,
      "at 0.72.0 depth `n` produced `n − 1` false rejections; the count is zero in both directions",
    );
  });

  it("PIN c5: a `par for` INSIDE a plain `for` body loads clean", () => {
    expectRow(
      "c5",
      "fn f(xs: array<array<string>>) {\n  for x in xs {\n    let r = par for y in x {\n      y\n    }\n  }\n}\n1\n",
      [ITER_FOR_SITE, "let r@6:5-8:6", "par-for y@6:26-6:27"],
      CLEAN,
      "the `par for` iterand gate reads the outer loop variable, so this is the cross-arm composition of the same scope entry",
    );
  });

  it("CONTROL c6: a plain `for` inside a `par for` body loads clean", () => {
    expectRow(
      "c6",
      "fn f(xs: array<array<string>>) {\n  let r = par for x in xs {\n    for y in x { }\n    1\n  }\n}\n1\n",
      ["let r@5:3-8:4", "par-for x@5:24-5:26", "for y@6:14-6:15"],
      CLEAN,
      "the arm that already binds, over an `array<array<string>>` iterand: the inner iterand is an array and nothing is owed — green in both directions",
    );
  });

  it("CONTROL c7: a plain `for` whose body never reads the variable loads clean", () => {
    expectRow(
      "c7",
      "fn f(xs: array<array<string>>) {\n  for x in xs {\n    1\n  }\n}\n1\n",
      [ITER_FOR_SITE],
      CLEAN,
      "no site reads the variable's type, so no route to a diagnostic exists — green in both directions",
    );
  });

  it("RED c8: a nested body that READS the inner variable judges it against the inner element type", () => {
    // The binding chains: `xs: array<array<string>>` gives `x: array<string>`
    // gives `y: string`, and the typed `let` sink refuses it. Two scope writes
    // deep, which is what makes this row a statement about the arm rather than
    // about one fixture.
    expectRow(
      "c8",
      "fn f(xs: array<array<string>>) {\n  for x in xs {\n    for y in x {\n      let n: integer = y\n    }\n  }\n}\n1\n",
      [ITER_FOR_SITE, "for y@6:14-6:15", "let n@7:7-7:25"],
      one(LET_RHS, letRhs("n", "integer", "string")),
      "the element type propagates through nesting: the inner loop variable is `string`, which no `integer` sink admits",
    );
  });
});

// ===========================================================================
// (d) The schema-namespace collision, re-derived post-0050. At 0.72.0 an
// UPPERCASE loop variable spelled like a declared schema adopted that schema's
// type through `unfoldAlias`'s `resolveNamed` lookup, in both the false-accept
// and the false-reject direction. Bug 0050's withheld twin closes that naming
// collision at its source: `<withheld>` is a name
// `theta/parse/schema-case-mismatch` keeps out of any loading theta's
// `TypeEnv`, so a real declaration can never share the sentinel's spelling.
//
// These rows discharge §Fix (e) POSTURE 1 — the `named "<identifier>"` fallback
// in `StaticTypeInferencePass`'s `ident` arm stays, and is out of scope —
// because post-fix the loop variable's type comes from the ITERAND: d1 / d2
// emit on the element type and d3 / d4 / d5 stay silent, and each row's
// no-schema twin reaches the byte-identical verdict. No declaration elsewhere
// in the file changes the loop variable's type in either direction. The paired
// identity assertions are green in both directions and are the actual posture-1
// proof; the absolute lists pin each row's own specific verdict instead.
// ===========================================================================

/**
 * The no-schema twins' prelude: a one-line comment where the declaration sits
 * in the paired fixture, so the two bodies occupy the SAME lines and the paired
 * identity below compares the emission's range as well as its code and message.
 */
const NO_SCHEMA_PRELUDE = "// no declaration named Q — the collision control\n";

const D1_SCHEMA = ITER_Q("array<string>", "Q.frobnicate()", "schema Q = array<number>\n");
const D1_NO_SCHEMA = ITER_Q("array<string>", "Q.frobnicate()", NO_SCHEMA_PRELUDE);
const D2_SCHEMA = ITER_Q("array<string>", 'let _j = Q.join(",")', "schema Q = array<string>\n");
const D2_NO_SCHEMA = ITER_Q("array<string>", 'let _j = Q.join(",")', NO_SCHEMA_PRELUDE);
const D3_SCHEMA = ITER_Q("array<integer>", "let n: integer = Q", "schema Q = number\n");
const D3_NO_SCHEMA = ITER_Q("array<integer>", "let n: integer = Q", NO_SCHEMA_PRELUDE);
const D4_SCHEMA = ITER_Q("array<array<string>>", "for y in Q { }", "schema Q = array<string>\n");
const D5_SCHEMA = ITER_Q("array<array<string>>", "for y in Q { }", "schema Q = string\n");
const D45_NO_SCHEMA = ITER_Q("array<array<string>>", "for y in Q { }", NO_SCHEMA_PRELUDE);

/** Two fixtures reach the same verdict — code, message, severity and range. */
function expectSameVerdict(a: ThetaDocument, b: ThetaDocument, why: string): void {
  const shape = (doc: ThetaDocument): string[] =>
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}: ${d.message}`;
    });
  expect(shape(a), `${why}\n  a: ${render(a)}\n  b: ${render(b)}`).toEqual(shape(b));
}

/** The nine collision cells, one row each so every cell's colour is its own. */
const D_ROWS = {
  d1: {
    src: D1_SCHEMA,
    sites: ["for Q@6:12-6:14"],
    expected: one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
    why: "the loop variable's type is the iterand's element, so the unrelated `schema Q = array<number>` declaration is not consulted",
  },
  d1n: {
    src: D1_NO_SCHEMA,
    sites: ["for Q@6:12-6:14"],
    expected: one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
    why: "the same body with no declaration named `Q` reaches the same verdict",
  },
  d2: {
    src: D2_SCHEMA,
    sites: ["for Q@6:12-6:14", "let _j@7:5-7:25"],
    expected: one(UNKNOWN_METHOD, unknownMethod("join", "string")),
    why: "`join` is off the `string` stdlib surface (expressions.md:71), and the element type is what decides",
  },
  d2n: {
    src: D2_NO_SCHEMA,
    sites: ["for Q@6:12-6:14", "let _j@7:5-7:25"],
    expected: one(UNKNOWN_METHOD, unknownMethod("join", "string")),
    why: "the same body with no declaration named `Q` reaches the same verdict",
  },
  d3: {
    src: D3_SCHEMA,
    sites: ["for Q@6:12-6:14", "let n@7:5-7:23"],
    expected: CLEAN,
    why: "the element is `integer`, which the `integer` sink admits; the `schema Q = number` declaration is not consulted",
  },
  d3n: {
    src: D3_NO_SCHEMA,
    sites: ["for Q@6:12-6:14", "let n@7:5-7:23"],
    expected: CLEAN,
    why: "the same body with no declaration named `Q`",
  },
  d4: {
    src: D4_SCHEMA,
    sites: ["for Q@6:12-6:14", "for y@7:14-7:15"],
    expected: CLEAN,
    why: "the outer element is `array<string>`, so the inner iterand is an array whatever `Q` is declared as",
  },
  d5: {
    src: D5_SCHEMA,
    sites: ["for Q@6:12-6:14", "for y@7:14-7:15"],
    expected: CLEAN,
    why: "the `schema Q = string` declaration that made this fail to load at 0.72.0 is not consulted",
  },
  d4n: {
    src: D45_NO_SCHEMA,
    sites: ["for Q@6:12-6:14", "for y@7:14-7:15"],
    expected: CLEAN,
    why: "the same body with no declaration named `Q`",
  },
} as const;

/** One collision cell, asserting its absolute post-fix contract. */
function dRow(id: keyof typeof D_ROWS): void {
  const row = D_ROWS[id];
  expectRow(id, row.src, row.sites, row.expected, row.why);
}

/** One collision cell, anchored only — for the paired-identity cells. */
function dAnchored(id: keyof typeof D_ROWS): ThetaDocument {
  const row = D_ROWS[id];
  return parseAnchored(id, row.src, row.sites);
}

describe("bug 0126 (d) — a declaration sharing the loop variable's spelling changes nothing", () => {
  it("RED d1: `schema Q = array<number>` does not admit `Q.frobnicate()`; the ELEMENT type refuses it", () => {
    // The report's first collision row. At 0.72.0 this emitted
    // `unknown method 'frobnicate' on type Q` — a schema's name in a `<type>`
    // slot for a value binding.
    dRow("d1");
  });

  it("RED d1n: the same body with NO declaration named `Q` reports the same thing", () => {
    dRow("d1n");
  });

  it("PIN d1 ≡ d1n: the declaration does not enter the verdict (§Fix (e) posture 1)", () => {
    // Anchored, not absolute: this cell is the posture-1 proof and must hold in
    // BOTH directions, so it compares the two fixtures to each other and never
    // to a list of its own.
    expectSameVerdict(
      dAnchored("d1"),
      dAnchored("d1n"),
      "d1 vs d1n — the collision channel is closed for this binder class because the type comes from the iterand. Green in both directions",
    );
  });

  it('RED d2: the FALSE-ACCEPT direction closes — `Q.join(",")` on a `string` element is refused', () => {
    // The sharpest of the five at 0.72.0: `schema Q = array<string>` ADMITTED a
    // call the element type forbids, so the loss was not conservative.
    dRow("d2");
  });

  it("RED d2n: the same body with NO declaration named `Q` reports the same thing", () => {
    dRow("d2n");
  });

  it("PIN d2 ≡ d2n: an unrelated declaration can no longer ADMIT a refused call", () => {
    expectSameVerdict(
      dAnchored("d2"),
      dAnchored("d2n"),
      "d2 vs d2n — green in both directions",
    );
  });

  it("PIN d3: the FALSE-REJECT direction stays closed — no narrowing on an `integer` element", () => {
    // At 0.72.0 `schema Q = number` made `let n: integer = Q` draw a false
    // narrowing rejection over an `array<integer>` iterand. This row is `[]`
    // with or without the element binding, since the element genuinely is
    // `integer`.
    dRow("d3");
  });

  it("PIN d3n: its no-schema twin stays clean too", () => {
    dRow("d3n");
  });

  it("PIN d3 ≡ d3n: the false-reject direction stays closed in both spellings", () => {
    expectSameVerdict(
      dAnchored("d3"),
      dAnchored("d3n"),
      "d3 vs d3n — green in both directions",
    );
  });

  it("PIN d4: an alias-of-array declaration leaves a nested `for` clean", () => {
    dRow("d4");
  });

  it("PIN d5: an alias-of-STRING declaration leaves the identical body clean", () => {
    // The report's sharpest row: at 0.72.0 this one declaration, touching
    // neither loop, made the theta fail to load.
    dRow("d5");
  });

  it("PIN d4n: so does no declaration at all", () => {
    dRow("d4n");
  });

  it("PIN d4 ≡ d5 ≡ d4n: one declaration elsewhere no longer flips a nested `for`", () => {
    // All three fixtures share one body text, and the identity is the claim:
    // no declaration elsewhere in the file can change the loop variable's type
    // in either direction.
    const noSchema = dAnchored("d4n");
    expectSameVerdict(
      dAnchored("d4"),
      noSchema,
      "d4 vs d4n — an alias-of-array declaration changes nothing. Green in both directions",
    );
    expectSameVerdict(
      dAnchored("d5"),
      noSchema,
      "d5 vs d4n — nor does an alias-of-string one. Green in both directions",
    );
  });
});

// ===========================================================================
// (e) Attribution — the silences inside a plain `for` body that are NOT this
// report's, and the one that MOVES.
//
// e1 is a NEW COMPOSITION, not a restored emission:
// `theta/parse/fn-arg-type-mismatch`'s sole emitter (`checkFnArgCompat`) had no
// `src/` caller at 0.72.0 (bug 0050), so the report's §Non-goals correctly
// declined it. Bug 0050 wired that caller in 0.77.0, inside `walkExpr`'s `call`
// arm and behind `provableArgType`; the argument position inside a `for` body
// is reachable only because the loop variable carries the iterand's
// element type —
// which is why cells u12e and u13me in tests/fn-arg-type-mismatch-wired.test.ts
// name THIS report as their flip condition. This row is that flip, measured
// from the other side.
//
// e4 was written as the `unprovableBindings` mirror's witness, on the premise
// that a MEMBER iterand is not a proof — and it named its own external flip
// condition: "the row is unprovable because `provableArgType`'s shared
// `member` / `method-call` arm returns `undefined` for every member read …
// Whichever change lands second re-derives this row." That change has landed.
// Bug 0190 (docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md)
// splits the shared arm, and a member read of a declared field on a resolved
// object schema becomes a PROOF, so `p.xs` declared `array<integer>` supplies a
// proven element and the argument slot is judged. The emission is the exact one
// this banner predicted — `expected string, got integer` — and it is a TRUE
// positive: every iteration hands `g` an `integer`.
//
// The MIRROR ITSELF IS UNTOUCHED by that re-derivation. The `for` arm still
// copies the `par for` arm's marking, which is what bug 0126 establishes and
// bug 0190 does not disturb; what moved is the iterand's verdict, not the rule
// that reads it. The marking's own witnesses are the UNPROVEN iterand classes
// of group (g), where the loop variable is a withheld binder and every sink
// there stays silent.
//
// e4 is therefore a FIX-PRODUCED EMISSION for this report as well, and no
// longer the both-directions regression pin the file header lists it as: remove
// the element binding in `walkStmt`'s `case "for"` and the loop variable is a
// withheld binder again, the argument sink withholds, and this row's list goes
// empty. The file header's ledger is bug 0126's own bookkeeping and is left for
// that report to move. The other side of the same flip is row x11 of
// tests/member-access-declared-field-type.test.ts, re-pinned under the same
// authority. Nothing here may be weakened to accommodate either.
// ===========================================================================

const E1_FN_ARG =
  "fn g(p: integer) {\n  1\n}\nfn f(xs: array<string>) {\n  for x in xs {\n    let _r = g(x)\n  }\n}\n1\n";
const E4_UNPROVABLE_ITERAND =
  "schema P {\n  xs: array<integer>\n}\nfn g(s: string) {\n  1\n}\nfn f(p: P) {\n  for x in p.xs {\n    let _r = g(x)\n  }\n}\n1\n";

describe("bug 0126 (e) — attribution", () => {
  it("RED e1: a mistyped argument read out of the loop variable draws fn-arg-type-mismatch", () => {
    expectRow(
      "e1",
      E1_FN_ARG,
      ["for x@8:12-8:14", "let _r@9:5-9:18"],
      one(FN_ARG, fnArg("g", 0, "p", "integer", "string")),
      "type-system.md:27 lists a function-argument slot among the positions `⊑` governs; every iteration hands `g` a `string`, and the element type is the proof of that",
    );
  });

  it("PIN e2: a reassignment of the loop variable draws immutable-rebinding (0370) — the type check still does not fire", () => {
    // bindings.md:30 makes a `for` iteration variable immutable, and `x = "b"`
    // now draws `theta/parse/immutable-rebinding` exactly as the `let` control
    // (e3) does. At this report's HEAD the mutability refusal was NOT wired for
    // a `for`-variable write (that silence was this cell's original pin, bug
    // 0115 §Residuals 3); bug 0370 (§Fix layer 1) wires it. This cell's own
    // subject is PRESERVED: it is a mutability question, not a typing one, so
    // NO element-type diagnostic fires (`x = "b"` is `string` into a `string`
    // element, compatible) — binding the element type still neither adds nor
    // removes an element-type verdict here. The reassignment check runs over
    // the real binding, not the type-layer `CompatType` map, so it is bug
    // 0370's surface, orthogonal to this report's element-typing subject.
    expectRow(
      "e2",
      ITER("array<string>", "for", 'x = "b"'),
      [ITER_FOR_SITE],
      one(IMMUTABLE_REBINDING, immutableRebinding("x")),
      "the loop variable is immutable (0370) and the `string` write is element-type compatible, so only the mutability row fires; binding the element type adds no element-type verdict",
    );
  });

  it("CONTROL e3: the reassignment check IS live on this harness", () => {
    expectRow(
      "e3",
      "fn f() {\n  let y = 1\n  y = 2\n}\n1\n",
      ["let y@5:3-5:12"],
      one(IMMUTABLE_REBINDING, immutableRebinding("y")),
      "the `let` route proves e2's silence is a missing check and not a dead harness — green in both directions",
    );
  });

  it("RED e4: a PROVEN member iterand's element is judged at the fn-arg slot", () => {
    // The retitle is the re-derivation: this fixture's iterand IS a proof under
    // bug 0190, so the cell no longer describes an unprovable one. The `for`
    // arm's element marking inherits the iterand's verdict, and here that
    // verdict is `array<integer>` off a declared field on a resolved schema.
    const doc = expectRow(
      "e4",
      E4_UNPROVABLE_ITERAND,
      ["for x@11:12-11:16", "let _r@12:5-12:18"],
      one(FN_ARG, fnArg("g", 0, "s", "string", "integer")),
      "a member read of a declared field on a resolved object schema is a proof (bug 0190), so the element it supplies is a proof too and every iteration genuinely hands `g` an `integer`",
    );
    // The located form, so the row pins WHICH node carries the verdict: the
    // argument inside the loop body, not the iterand and not the statement. A
    // fix that hangs the emission on the loop reds here with a green list above.
    expect(
      doc.diagnostics.map((d: Diagnostic) => {
        const r = d.range;
        return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}`;
      }),
      `e4 — the emission belongs to the argument node inside the body. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${FN_ARG} @12:16-12:17`]);
  });
});

// ===========================================================================
// (f) The two iterand shapes that are not a direct `array<T>` annotation.
//
// f1 is the TYPE-11 row: `unfoldAlias` is what makes an alias of `array<T>`
// supply the same element `array<T>` does (type-system.md:54), and it is NOT
// optional — measured, dropping it leaves f1 silent while every concrete-array
// row above still emits, so f1 is the only row in this file that isolates it.
// Bug 0089 established that transparency at the iterand gate and at the
// `par for` element derivation; the plain `for` arm is the site that never had
// it because it derived no element at all.
//
// f2 composes with bug 0136: a member read now types as its receiver's
// DECLARED field type, so `p.xs` is a concrete `array<string>` at the iterand
// position. It needs no unfold of its own (measured: it emits with or without
// one) and is carried because the member iterand is the shape 0136's own
// witness leaves at a bare read.
// ===========================================================================

describe("bug 0126 (f) — alias and member iterands", () => {
  it("RED f1: an ALIAS-typed iterand supplies the same element its right-hand side does (TYPE-11)", () => {
    expectRow(
      "f1",
      "schema L = array<string>\nfn f(xs: L) {\n  for x in xs {\n    x.frobnicate()\n  }\n}\n1\n",
      ["for x@6:12-6:14"],
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
      "type-system.md:54 TYPE-11 — `L` declared `array<string>` IS `array<string>`, so its element is `string`; this row reds if the fix binds the element without unfolding the iterand",
    );
  });

  it("RED f2: a MEMBER iterand's declared field type supplies the element (composed with bug 0136)", () => {
    expectRow(
      "f2",
      "schema P {\n  xs: array<string>\n}\nfn f(p: P) {\n  for y in p.xs {\n    y.frobnicate()\n  }\n}\n1\n",
      ["for y@8:12-8:16"],
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
      "bug 0136 made the member read type as the declared field type, so the iterand is a concrete `array<string>` and its element is `string`",
    );
  });
});

// ===========================================================================
// (g) The WITHHELD machinery the fix must preserve for every binder class this
// report does not own. `recordWithheldBinders` is the fallback the arm keeps
// when the unfolded iterand is not an `array`; the `par for` arm's own
// `{ kind: "named", name: "unknown" }` fallback is NOT, and these rows are why.
//
// Measured against both candidate fallbacks: g1, g5 and g6 DISCRIMINATE them.
// With the `named "unknown"` mirror, g1 draws a FALSE
// `theta/parse/non-array-iterand :: … got unknown` — this report's own defect
// reintroduced at the unannotated-parameter binder class, with an internal
// sentinel rendered into a `<type>` placeholder
// (placeholder-rendering-a.md:13–21) — g5 draws a SECOND rejection beside its
// true one, and g6 draws a FALSE `theta/parse/non-string-object-index :: object
// index must be string; got unknown` at the sibling stdlib precondition that
// refuses an unresolvable type. g2, g3 and g4 bound the other direction — they
// stay `[]` under both fallbacks — but measured (neutering each sink's own
// withhold check and re-running the whole suite), the explicit withhold
// silences NONE of them: each sink's own generic unresolvable-`named` handling
// defers on its own, whether or not the operand is withheld. g2 never reaches
// a structural rule at all: `annotationToCompatType` (type-layer-checks.ts)
// parses the inline object annotation into an opaque `named` reference rather
// than an `object` `CompatType`, so `decide`'s `sup.kind === "object"` arm
// (TYPE-8) never runs and its `sup.kind === "named"` arm (TYPE-10) answers
// `"unknown"` off the annotation's own unresolvability instead
// (type-compat.ts). g4 reaches a structural rule but defers inside it:
// `decide`'s `sup.kind === "array"` arm (TYPE-7) is live, but the sub is an
// unresolvable `named`, and TYPE-7's own escape answers before the
// element-wise recursion runs (type-compat.ts). g3 defers one level up,
// outside `decide` altogether: its receiver's unfolded type is `named`, not
// `array`, so `checkMethodCall`'s `join`-specific branch — the one carrying
// the explicit withhold check — is never entered, and `classifyReceiver`'s
// generic unresolvable-`named` case answers instead (type-layer-checks.ts).
// ===========================================================================

describe("bug 0126 (g) — the withheld fallback for the binder classes this report does not own", () => {
  it("PIN g1: a nested `for` over an UNANNOTATED parameter draws nothing", () => {
    expectRow(
      "g1",
      UNANNOTATED("x", "for y in x { }"),
      ["for x@5:12-5:13", "for y@6:14-6:15"],
      CLEAN,
      "`walkFn` records an unannotated parameter WITHHELD, so the loop over it withholds too; the `par for` arm's `named \"unknown\"` fallback would reject this program outright",
    );
  });

  it("PIN g2: a STRUCTURAL sink over a withheld element draws nothing", () => {
    // `annotationToCompatType` parses `{ a: integer }` into an opaque `named`
    // reference, not an `object` `CompatType` (type-layer-checks.ts) — inline
    // object-type annotations are unsupported there. `decide` never reaches
    // TYPE-8's structural rule because `sup.kind` is `"named"`; TYPE-10's
    // unresolvable-`named`-sup rule answers `"unknown"` instead
    // (type-compat.ts), off the annotation's own unresolvability, whether or
    // not `x` is withheld.
    expectRow(
      "g2",
      UNANNOTATED("x", "let s: { a: integer } = x"),
      ["for x@5:12-5:13", "let s@6:5-6:30"],
      CLEAN,
      "an inline-object sink over a withheld element stays a deferral",
    );
  });

  it("PIN g3: a stdlib precondition over a withheld element draws nothing", () => {
    expectRow(
      "g3",
      UNANNOTATED("x", 'let j = x.join(",")'),
      ["for x@5:12-5:13", "let j@6:5-6:24"],
      CLEAN,
      "x's unfolded type is `named`, not `array`, so `checkMethodCall`'s `join`-specific branch — the one holding the explicit withhold check — never runs; `classifyReceiver`'s generic unresolvable-`named` case answers before `checkArrayJoin` is ever reached",
    );
  });

  it("PIN g4: an ARRAY sink over a withheld element draws nothing", () => {
    expectRow(
      "g4",
      UNANNOTATED("y", "let s: array<integer> = y"),
      ["for y@5:12-5:13", "let s@6:5-6:30"],
      CLEAN,
      "the sub is an unresolvable `named` at TYPE-7's own array-sup arm (type-compat.ts), which defers before any element-wise recursion runs — whether or not `y` is withheld",
    );
  });

  it("PIN g5: a non-`array` iterand draws EXACTLY ONE rejection, at the iterand's own span", () => {
    // control-flow.md:13 keeps `theta/parse/non-array-iterand` for a
    // non-`array` iterand, and the fallback decides whether the BODY's own loop
    // adds a second. Exactly one in both directions: the `named "unknown"`
    // mirror appends `… got unknown` here.
    expectRow(
      "g5",
      "fn f() {\n  for x in 5 {\n    for y in x { }\n  }\n}\n1\n",
      ["for x@5:12-5:13", "for y@6:14-6:15"],
      one(NON_ARRAY_ITERAND, iterand("integer")),
      "the outer iterand is refused on its own type; the inner loop over a withheld variable adds nothing",
    );
  });

  it("PIN g6: the object-index KEY precondition over a withheld key draws nothing", () => {
    // `checkObjectIndex` (src/runtime/stdlib-object.ts:63) admits a `string` key
    // and refuses every other one, an unresolvable `named` included — the
    // refuse-an-unresolvable shape it shares with `checkForIterand`, and the
    // reason a key read cannot defer by itself. The receiver is a CONSTRUCTED
    // schema value because the key check is reached for an object receiver only
    // (`classifyIndexReceiver`, src/parser/type-compat.ts:375–401), which is
    // what the prelude is for; the emitting direction of the same sink inside a
    // `for` body is pinned by cell u13ph of
    // tests/fn-arg-type-mismatch-wired.test.ts, so the silence here is a
    // withhold and not an unreached check.
    expectRow(
      "g6",
      UNANNOTATED("x", 'let q = P { a: 3 }\n    let v = q[x]', SCHEMA_P_A),
      ["for x@8:12-8:13", "let q@9:5-9:23", "let v@10:5-10:17"],
      CLEAN,
      "the object-index key check refuses an unresolvable key rather than deferring on it, so the explicit withhold is what keeps it silent",
    );
  });
});

// ===========================================================================
// (h) The committed corpus. `docs/examples/fan-out-reviews.theta` is the only
// committed `.theta` / `.thetalib` containing a plain `for`, so it is the whole
// GOV-15 addition-direction exposure in the shipped corpus
// (source-language-stability.md:5, the loads-cleanly predicate at :9, the
// diagnostic-registry carve-out at :25).
//
// The CORPUS-WIDE claim is discharged by
// tests/committed-fixture-parse-gate.test.ts, which enumerates the corpus from
// the git index against hard expected counts — per AGENTS.md that gate, not a
// row here, is what a fix cites. h1 exists because this file should red on the
// one file whose `for` body the fix reaches, at the same run that reds the
// inventory.
// ===========================================================================

const FAN_OUT = "docs/examples/fan-out-reviews.theta";

/**
 * The corpus file's own `for` body, minimised: the `par for` result is rebuilt
 * from a same-file schema so the shape is parseable without the committed
 * file's `.theta` tool import, and the outer mutation is dropped because
 * control-flow.md:76 CTRL-4 forbids it inside the `par for` arm the sibling row
 * runs. Both arms are `[]` in both directions: CTRL-3's element renders as the
 * nominal `Result<Review, QueryError>`, which resolves to no declaration, so
 * the `match` arms defer whatever the loop variable carries.
 */
const CORPUS_MIN = (kw: "for" | "par for"): string =>
  "schema Review {\n  file: string,\n  summary: string\n}\n" +
  'let reviews = par for path in ["a", "b"] max 2 {\n  Review { file: path, summary: path }\n}\n' +
  `${kw} r in reviews {\n` +
  "  let line = match r {\n" +
  '    Ok(review) => review.file + ": " + review.summary,\n' +
  '    Err(QueryError { kind: "cancelled" }) => "a review was cancelled",\n' +
  '    Err(other) => "a review failed: " + other.kind,\n' +
  "  }\n" +
  "  let _u = line\n" +
  "}\n1\n";

describe("bug 0126 (h) — the committed corpus keeps loading clean", () => {
  it("PIN h1: `docs/examples/fan-out-reviews.theta`, read off disk, parses with zero diagnostics", () => {
    const source = readFileSync(
      fileURLToPath(new URL(`../${FAN_OUT}`, import.meta.url)),
      "utf8",
    );
    const doc = parseDoc(source, FAN_OUT);
    expect(
      binderSites(doc),
      `h1 PRECONDITION: the committed file must still carry the plain \`for\` this row exists for; a corpus edit that removes it must fail here rather than green a vacuous row. Diagnostics: ${render(doc)}`,
    ).toEqual([
      "let targets@9:1-13:2",
      "let reviews@19:1-21:2",
      "par-for path@19:31-19:38",
      "let report@27:1-27:20",
      "for r@28:10-28:17",
      "let line@29:3-33:4",
    ]);
    expect(
      doc.diagnostics,
      `h1 — GOV-15 (source-language-stability.md:5): the one committed theta with a plain \`for\` loads cleanly today and must keep loading cleanly. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("PIN h2: the corpus file's `for` body, minimised, parses clean", () => {
    expectRow(
      "h2",
      CORPUS_MIN("for"),
      [
        "let reviews@8:1-10:2",
        "par-for path@8:31-8:41",
        "for r@11:10-11:17",
        "let line@12:3-16:4",
        "let _u@17:3-17:16",
      ],
      CLEAN,
      "the loop variable is a `Result<Review, QueryError>`, whose nominal resolves to no declaration, so every `match` arm defers",
    );
  });

  it("CONTROL h3: the same body under `par for`, the arm that already binds, parses clean", () => {
    expectRow(
      "h3",
      CORPUS_MIN("par for"),
      [
        "let reviews@8:1-10:2",
        "par-for path@8:31-8:41",
        "par-for r@11:14-11:21",
        "let line@12:3-16:4",
        "let _u@17:3-17:16",
      ],
      CLEAN,
      "the arm that binds the element reaches the same verdict on the same body, which is what makes h2's silence a property of the body and not of the missing binding — green in both directions",
    );
  });
});
