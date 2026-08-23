import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { Block, Expr, Stmt, ThetaDocument } from "../src/parser/theta-document";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import { checkCompatible, displayType, type TypeEnv } from "../src/parser/type-compat";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0081 — the array/ternary common-type rule is decided by "one written
// branch dominates the others", so the least-upper-bound's union clause is
// unreachable: both of expressions.md's own worked vectors are refused at load,
// and a heterogeneous array or ternary types as its FIRST branch
// (docs/bugs/0081-array-ternary-common-type-never-unions.md).
//
// THE SPEC SENTENCES.
//   - docs/spec_topics/expressions.md:222 scopes the rules: "*Common-type rules
//     for array literals:*", carving out rule 2's least-upper-bound
//     computation as the one clause that also governs ternary branches.
//   - :225 is rule 2, the clause under test: "Otherwise, the parser computes the
//     *least upper bound* of the element types under `⊑`: identical types
//     collapse (TYPE-1); `integer` widens to `number` when mixed with `number`
//     (TYPE-2); otherwise the element types are unioned via TYPE-5 and TYPE-6
//     (`["a", null]` → `array<string | null>`; `[1, "a"]` →
//     `array<number | string>`)."
//   - :226 is rule 3, the one sink-less refusal the spec prescribes: "Object
//     schemas do not unify implicitly — array literal only: an array literal
//     containing two different named schemas yields `array<A | B>` only if some
//     sink in scope expects a union; otherwise it is
//     `theta/parse/array-no-common-type`".
//   - docs/reference/type-system.md:124–127 (rule 2) and :128–131 (rule 3)
//     mirror both rules; rule 1, at :121–123, sits above them.
//
// THE ROUTE UNDER TEST — the interim route the bug doc's §Fix names, and not one
// step wider. ONE exported `commonType(branches, env, relate)` in
// `src/parser/type-compat.ts`, parameterised over the `⊑` relation so the
// inference pass keeps its injected-engine seam, called by BOTH `checkCommonType`
// (same module) and `StaticTypeInferencePass.#commonType`
// (`src/parser/static-type-inference.ts`). It computes rule 2's LUB: a branch
// every branch is `⊑` IS the LUB (TYPE-1 collapse, TYPE-2 widening; an
// unresolvable branch does not block a candidate), otherwise
// `{ kind: "union", arms: branches }` receiver-first with the arms verbatim —
// EXCEPT that rule 3 gates the union arm on branch KIND: where any branch is an
// object branch (an alias-unfolded `kind === "object"`, or a `named` resolving to
// an `object-schema` declaration) and no branch dominates, there is no common
// type and `theta/parse/array-no-common-type` still fires. One answer for both
// callers is what discharges the bug doc's §Fix constraint 3, by construction
// rather than by coincidence.
//
// ONE FACET OF THE REPORT REMAINS DEFERRED, pinned here at its PRESENT value as
// a tripwire rather than an expectation:
//   - facet (d), the `fn`-parameter sink supplied at a call site — bounded by
//     cell r6's comment.
// Facet (b), the ternary caller of `checkCommonType`, is SETTLED, not deferred:
// bug 0155 route (b) adjudicates rule 3 out of the ternary position — its code's
// registered *Trigger* (the `theta/parse/array-no-common-type` row of
// code-registry-parse.md) names an array literal only — so cell r8's `[]` is
// the rule, not a residual awaiting a *Trigger* widening.
//
// THE CELL-BY-CELL CONTRACT.
//
//   POST-FIX EXPECTATIONS (red at this HEAD):
//   r1        `let x = [1, "a"]` loads. expressions.md:225's own worked vector.
//   r2        `let x = ["a", null]` loads. The second worked vector.
//   r6        a `["a", null]` literal written as a `fn` argument loads, with no
//             parameter sink supplied — the measurement that bounds facet (d).
//   r9        `true ? 1 : "a"` then `.length` reports nothing: the ternary types
//             `integer | string`, and a union receiver is statically
//             unresolvable rather than a receiver missing a method.
//   u3        `let x = [1, "a", true]` loads — the LUB is n-ary.
//   uN        `let x = [[1], ["a"]]` loads, element `array<integer> |
//             array<string>` — rule 2 at the outer level over two `array`
//             branches, which are not object branches.
//   s1–s5     the RENDERED element / branch spellings the fix computes.
//   s1 in particular carries the union-spelling disposition (below).
//   r10       `true ? "a" : 1` then `x + 1` keeps
//             `theta/parse/mixed-plus-operands`, and the rendered operand moves
//             from half the type to the whole type.
//
//   CONTROLS (green at this HEAD and green after — the proof the fix is narrow):
//   r3        `let x = [1, 2.5]` — TYPE-2 widening, unmoved.
//   r4        the binding-annotation sink, unmoved.
//   r5        the constructor-field sink, unmoved.
//   r7        `[A{…}, B{…}]` still refuses, with the registry Message asserted —
//             rule 3 survives, which is §Fix constraint 2.
//   r7b       two ALIAS-spelled object schemas still refuse — the
//             `isObjectBranch` TYPE-11 unfold witness r7 alone does not cover.
//   r8        `true ? A{…} : B{…}` still loads — rule 3 is array-literal-only
//             (bug 0155 route (b)), so a ternary never reaches it, by rule.
//   cPlus     `1 + "a"` keeps its diagnostic and its rendering — r10's
//             non-ternary control.
//   cIdx      `let x = [1, 2.5]` then `x[0] + 1` stays silent.
//   s6        `[1, 2.5]` still renders `array<number>`.
//
// THE UNION-SPELLING DISPOSITION (cell s1), recorded here so a later
// "correction" is a decision rather than an accident. expressions.md:225 writes
// the worked vector as `[1, "a"]` → `array<number | string>`. The computed LUB
// carries the arms VERBATIM — the order and the shape `concatElementType`
// (src/runtime/stdlib-string.ts) already uses for the same LUB on
// `array<T>.concat`, which §Fix constraint 1 requires stay consistent — so it
// computes `array<integer | string>`. Three reasons that is the answer to pin:
//   1. `array<integer | string> ⊑ array<number | string>` (TYPE-2 inside the
//      arm, TYPE-6 across the arms), so the computed type is strictly TIGHTER
//      than the spec's worked spelling and satisfies any sink written to it.
//   2. Rule 2's TYPE-2 clause is conditioned — "`integer` widens to `number`
//      **when mixed with `number`**" — and `[1, "a"]` mixes `integer` with
//      `string`, not with `number`. Widening the arm here would apply a clause
//      whose stated precondition does not hold.
//   3. The vector's normative observable is the sentence it sits in: the source
//      has a common type and therefore loads. That is met either way, and cell
//      r1 measures it separately from this spelling.
// The observable used for the spelling is `displayType` over the
// `StaticTypeInferencePass` answer, not a diagnostic message: the pass answers
// on every fixture below whether or not the fixture draws a diagnostic, so the
// read is total and deterministic. r10 is the message-rendered companion, kept
// separate because it also pins a code list.
//
// RED / GREEN AT THIS HEAD (9e797da7, v0.82.0, offline, deterministic). RED: r1,
// r2, r6, r9, u3, uN, s1, s2, s3, s4, s5, and r10's MESSAGE half — each because
// `hasCommonType` finds no dominating branch and `checkCommonType` refuses, and
// because `#commonType` falls back to `candidates[0]` and answers the first
// branch. GREEN and required to stay green: r3, r4, r5, r7, r7b, r8, cPlus,
// cIdx, s6 and r10's CODE half.
//
// TIER — unit, offline, provider-free, deterministic. Every diagnostic cell
// settles inside one `parseThetaDocument` call through the house driver
// `parseDoc` (tests/helpers/e2e-s1.ts:39); every spelling cell settles inside one
// `StaticTypeInferencePass.typeOf` call over the shipped `checkCompatible`, the
// harness shape tests/division-result-type-number.test.ts establishes. Nothing on
// this path crosses a provider, a model, a child process or the network, so an
// integration tier would add a session round-trip to a parse-time observable and
// buy no reach, and a live tier would make a fully determined observable
// stochastic.
//
// NO SILENT SKIPPING (CLAUDE.md). Nothing here early-returns, branches on the
// environment or skips. A missing or reworded registry row throws naming the
// registry page. Every absence cell — every `toEqual([])` — first runs a loud
// precondition asserting the fixture actually parses to the array literals,
// ternaries, `+` nodes, member reads and calls whose silence it measures, so a
// fixture that stopped parsing fails naming the unmet precondition instead of
// satisfying the absence vacuously.
//
// SPEC ANCHORS (re-derived against the tree at this HEAD):
//   - docs/spec_topics/expressions.md:218 §"Array construction"; :220 the sink
//     list naming "parameter type"; :222 the array-literal scope sentence and
//     its rule-2 ternary carve-out; :224 rule 1; :225 rule 2; :226 rule 3; :228
//     §"`+` operator", the pairing rule r10 and cPlus rest on.
//   - docs/reference/type-system.md:111 §"Common-type rules (array literals &
//     ternary branches)"; :124–127 rule 2; :128–131 rule 3.
//   - docs/spec_topics/type-system.md:35 TYPE-1; :36 TYPE-2, whose "when mixed
//     with `number`" condition the s1 disposition turns on; :39 TYPE-5 and :40
//     TYPE-6, the union rules rule 2 names; :48 §"Unresolvable operands", the
//     posture that makes a union receiver defer at r9; :50 TYPE-9, which (post
//     bug 0155 route (b)) states that a ternary reports no code of its own —
//     its branches reduce under rule 2's LUB and the enclosing site reports
//     through its own registered code.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 DIAG-4 — the *Message*
//     column is normative and a test MUST source the string from it. Every
//     expected message below is read through `registryMessage`. :72 DIAG-2 —
//     the registry is closed; this fix adds, removes and edits no row, which is
//     also why facet (b) settles the way it does (r8): rule 3 stays
//     array-literal-only rather than its *Trigger* widening to name a ternary.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:41
//     `theta/parse/array-no-common-type`, whose *Trigger* reads "Array literal
//     whose elements have no common type and no sink to narrow against"; :36
//     `theta/parse/mixed-plus-operands`; :63 `theta/parse/unknown-method`; :47
//     `theta/parse/bare-object-literal`.

// ===========================================================================
// DIAG-4 — every expected Message is read from the registry, never copied.
// ===========================================================================

const NO_COMMON_TYPE_CODE = "theta/parse/array-no-common-type";
const MIXED_PLUS_CODE = "theta/parse/mixed-plus-operands";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — the DIAG-4 oracle for this file. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * Interpolate a registered *Message* template's `<…>` placeholders from `subs`.
 *
 * The placeholder set is derived from the TEMPLATE, not assumed: a missing row,
 * an unsupplied placeholder and an unused substitution each throw naming the
 * registry page, so a registry drift fails loudly here instead of degrading an
 * assertion below into a comparison against a string no emission can equal.
 */
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
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

/** `array elements have no common type; …` — a placeholder-free registered Message. */
function noCommonTypeMessage(): string {
  return fill(NO_COMMON_TYPE_CODE, new Map());
}

/** `'+' has mixed operand types: <left> and <right>`. */
function mixedPlusMessage(left: string, right: string): string {
  return fill(
    MIXED_PLUS_CODE,
    new Map([
      ["<left>", left],
      ["<right>", right],
    ]),
  );
}

// ===========================================================================
// Parse harness — the shipped whole-file entry point, plus the AST anchors that
// double as every absence cell's loud precondition.
// ===========================================================================

/** Frontmatter every fixture parses under. */
const FM = "---\nmode: prompt\n---\n";

function parse(src: string): ThetaDocument {
  return parseDoc(FM + src, "bug0081.theta");
}

/** Every diagnostic rendered `severity code: message` — the failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
  );
}

/** The aggregated diagnostic codes, in emission order. */
function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => d.code);
}

/** The aggregated `code: message` pairs, in emission order. */
function hitsOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.code}: ${d.message}`);
}

interface Anchors {
  /** Element count of each array literal, outer-first in walk order. */
  readonly arrayWidths: readonly number[];
  /** One entry per ternary expression. */
  readonly ternaries: number;
  /** One entry per binary `+` expression. */
  readonly pluses: number;
  /** The field name of each bare member (property) read. */
  readonly members: readonly string[];
  /** The callee name of each call expression. */
  readonly callees: readonly string[];
  /** The schema name of each object construction. */
  readonly ctors: readonly string[];
}

/**
 * Every construct this file's preconditions count, collected in one walk.
 *
 * The counts are what make an absence cell non-vacuous: a cell asserting "this
 * array literal draws nothing" first asserts the parse actually produced that
 * array literal, so a fixture that stopped parsing fails by name rather than
 * satisfying `toEqual([])` while measuring an empty body.
 */
function anchorsOf(doc: ThetaDocument): Anchors {
  const arrayWidths: number[] = [];
  const members: string[] = [];
  const callees: string[] = [];
  const ctors: string[] = [];
  let ternaries = 0;
  let pluses = 0;
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "array":
        arrayWidths.push(e.elements.length);
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        ctors.push(e.typeName ?? "<bare>");
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "ternary":
        ternaries += 1;
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "binary":
        if (e.op === "+") pluses += 1;
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      case "member":
        members.push(e.field);
        walkExpr(e.target);
        return;
      case "call":
        callees.push(e.callee);
        for (const a of e.args) walkExpr(a);
        return;
      case "invoke":
        for (const a of e.args) walkExpr(a);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "index":
        walkExpr(e.target);
        walkExpr(e.index);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
      case "result-ctor":
        walkExpr(e.arg);
        return;
      case "par-for":
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        walkBlock(e.body);
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
        if (s.init !== null) walkExpr(s.init);
        return;
      case "reassign":
        walkExpr(s.value);
        return;
      case "expr":
        walkExpr(s.expr);
        return;
      case "tool-call":
        walkExpr(s.call);
        return;
      case "invoke":
        walkExpr(s.invoke);
        return;
      case "return":
        if (s.operand !== null) walkExpr(s.operand);
        return;
      case "fn":
        walkBlock(s.body);
        return;
      case "for":
        walkExpr(s.iterand);
        walkBlock(s.body);
        return;
      case "while":
        walkExpr(s.condition);
        walkBlock(s.body);
        return;
      case "if":
        walkExpr(s.condition);
        walkBlock(s.then);
        return;
      default:
        return;
    }
  };
  walkBlock(doc.body);
  return { arrayWidths, ternaries, pluses, members, callees, ctors };
}

/** What the fixture must contain for the cell's assertion to measure anything. */
interface Precondition {
  readonly arrayWidths?: readonly number[];
  readonly ternaries?: number;
  readonly pluses?: number;
  readonly members?: readonly string[];
  readonly callees?: readonly string[];
  readonly ctors?: readonly string[];
}

/**
 * Assert, by name, that the parsed fixture holds the constructs `cell` measures.
 *
 * Every field supplied is compared as a whole-list (or exact-count) equality, so
 * an extra construct fails as loudly as a missing one. A failure here means the
 * fixture is not the source the cell believes it is, which is a harness failure,
 * not a verdict about the common-type rule.
 */
function precondition(doc: ThetaDocument, cell: string, want: Precondition): void {
  const got = anchorsOf(doc);
  if (want.arrayWidths !== undefined) {
    expect(
      got.arrayWidths,
      `PRECONDITION (${cell}): the fixture must parse to array literals of widths ${JSON.stringify(want.arrayWidths)}, outer-first, or the assertion below measures a source with no array literal in it. Diagnostics: ${render(doc)}`,
    ).toEqual(want.arrayWidths);
  }
  if (want.ternaries !== undefined) {
    expect(
      got.ternaries,
      `PRECONDITION (${cell}): the fixture must parse to exactly ${want.ternaries} ternary expression(s), or the assertion below measures a source with no ternary in it. Diagnostics: ${render(doc)}`,
    ).toBe(want.ternaries);
  }
  if (want.pluses !== undefined) {
    expect(
      got.pluses,
      `PRECONDITION (${cell}): the fixture must parse to exactly ${want.pluses} binary \`+\` expression(s), or the assertion below measures a source that does not add. Diagnostics: ${render(doc)}`,
    ).toBe(want.pluses);
  }
  if (want.members !== undefined) {
    expect(
      got.members,
      `PRECONDITION (${cell}): the fixture must parse to the member reads ${JSON.stringify(want.members)}, or the assertion below measures a source that reads no member. Diagnostics: ${render(doc)}`,
    ).toEqual(want.members);
  }
  if (want.callees !== undefined) {
    expect(
      got.callees,
      `PRECONDITION (${cell}): the fixture must parse to calls of ${JSON.stringify(want.callees)}, or the assertion below measures a source with no call in it. Diagnostics: ${render(doc)}`,
    ).toEqual(want.callees);
  }
  if (want.ctors !== undefined) {
    expect(
      got.ctors,
      `PRECONDITION (${cell}): the fixture must parse to the object constructions ${JSON.stringify(want.ctors)}, or the assertion below measures a source that constructs no schema value. Diagnostics: ${render(doc)}`,
    ).toEqual(want.ctors);
  }
}

// ===========================================================================
// Spelling harness — the inference pass in isolation, over the shipped `⊑`
// engine. Deliberately NOT gated on the fixture's diagnostics: the pass answers
// on a refused source as readily as on an admitted one, and the whole point of
// the inference facet is that its answer is wrong where no checker runs.
// ===========================================================================

/** An empty `TypeEnv`: no spelling fixture declares a named type. */
const EMPTY_ENV = {} as TypeEnv;

/**
 * `displayType` of `StaticTypeInferencePass.typeOf` on the fixture's body tail.
 *
 * The tail's node kind is asserted first, so a fixture whose trailing expression
 * stopped parsing as the construct under measurement fails naming the cell
 * rather than reporting the spelling of some other node.
 */
function tailSpelling(src: string, kind: Expr["kind"], cell: string): string {
  const doc = parse(src);
  const tail = doc.body.tail;
  expect(
    tail,
    `PRECONDITION (${cell}): the fixture must end in a trailing expression, which is the node the spelling is read on. Diagnostics: ${render(doc)}`,
  ).not.toBeNull();
  expect(
    (tail as Expr).kind,
    `PRECONDITION (${cell}): the trailing expression must parse as a \`${kind}\` node. Diagnostics: ${render(doc)}`,
  ).toBe(kind);
  return displayType(
    new StaticTypeInferencePass({ checkCompatible, enumNames: new Set() }).typeOf(
      tail as Expr,
      EMPTY_ENV,
    ),
  );
}

// ===========================================================================
// Fixtures — the bug doc's §Reproduction rows, verbatim where it states them.
// ===========================================================================

/** The two distinct named object schemas rules 3's refusal is written about. */
const A_B_SCHEMAS = 'schema A {\n  a: integer\n}\nschema B {\n  b: string\n}\n';

// ===========================================================================
// (r1, r2) — expressions.md:225's own worked vectors.
// ===========================================================================

describe("bug 0081 — the union clause of rule 2 admits the spec's worked vectors", () => {
  it("r1: `let x = [1, \"a\"]` loads", () => {
    // §Reproduction row 1. The LUB of `integer` and `string` is their union, and
    // neither branch is an object branch, so rule 3 does not reach this source.
    // `hasCommonType` (src/parser/type-compat.ts) searches for a branch every
    // other branch is `⊑`, which is rule 2's first two clauses and cannot
    // express the third, whose result is not one of its inputs.
    const doc = parse('let x = [1, "a"]\n');
    precondition(doc, "r1", { arrayWidths: [2] });
    expect(
      codesOf(doc),
      `r1 — expressions.md:225 prints this source as a worked vector of the union clause, so a load refusal here refuses documented-legal source. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it('r2: `let x = ["a", null]` loads', () => {
    // §Reproduction row 2, the other worked vector. `null` is a primitive branch
    // (docs/spec_topics/type-system.md:35 TYPE-1 lists it among the identical
    // primitives), so rule 3's object-branch gate does not reach it either.
    const doc = parse('let x = ["a", null]\n');
    precondition(doc, "r2", { arrayWidths: [2] });
    expect(
      codesOf(doc),
      `r2 — expressions.md:225 states the answer for this source outright: \`["a", null]\` → \`array<string | null>\`. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u3: `let x = [1, \"a\", true]` loads — the LUB is n-ary", () => {
    // Rule 2 is written over "the element types", not over a pair, so a
    // three-branch literal reduces to a three-arm union by the same clause. The
    // cell separates "the union arm handles two branches" from "the union arm
    // handles the branch set", which a pairwise reduction written with a
    // two-branch assumption would fail.
    const doc = parse('let x = [1, "a", true]\n');
    precondition(doc, "u3", { arrayWidths: [3] });
    expect(
      codesOf(doc),
      `u3 — docs/reference/type-system.md:124–127 computes "the least upper bound under \`⊑\`" of the element types with no arity bound. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it('uN: `let x = [[1], ["a"]]` loads — rule 2 at the outer level', () => {
    // The outer branches are `array<integer>` and `array<string>`. An `array` is
    // not an object branch, so rule 3's gate does not fire and rule 2's union
    // clause applies at the outer level exactly as it does over primitives. Cell
    // s4 pins the element spelling this produces.
    const doc = parse('let x = [[1], ["a"]]\n');
    precondition(doc, "uN", { arrayWidths: [2, 1, 1] });
    expect(
      codesOf(doc),
      `uN — expressions.md:226 confines the no-common-type refusal to "two different named schemas"; two \`array<T>\` branches are neither. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (r6) — the `fn`-argument position, and the bound it puts on facet (d).
// ===========================================================================

describe("bug 0081 — a literal written as a `fn` argument stops being sink-less-refused", () => {
  it('r6: `fn f(xs: array<string | null>)` accepts `f(["a", null])`', () => {
    // §Reproduction row 6, and the measurement that narrows the report's
    // residual facet (d). The doc frames this row as "rule 1 lists 'parameter
    // type' as a sink" (expressions.md:220), i.e. as needing the `fn`-parameter
    // sink at the call site. It does not: the literal stops being refused
    // because it acquires a common type of its OWN under rule 2, before any sink
    // is consulted. No parameter sink is supplied by the route under test.
    //
    // What this leaves of facet (d) is the strictly smaller class "elements with
    // no LUB under a union-typed parameter" — `fn f(xs: array<A | B>)` with
    // `f([A{…}, B{…}])`, where rule 3 refuses and only a supplied sink could
    // admit. The 0081 doc's §Why-it-matters item 2 overstates the remaining gap;
    // this cell is where that is measured.
    const doc = parse(
      'fn f(xs: array<string | null>): integer {\n  1\n}\nlet r = f(["a", null])\n',
    );
    precondition(doc, "r6", { arrayWidths: [2], callees: ["f"] });
    expect(
      codesOf(doc),
      `r6 — the argument literal is the same source as r2, so admitting r2 and refusing this one would make the same elements legal in a binding and illegal in an argument. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (r9, r10) — the inference facet: the diagnostics a first-branch answer
// misreports. These are the rows where no checker runs, so the inferrer's
// answer is the only thing deciding the output.
// ===========================================================================

describe("bug 0081 — a heterogeneous ternary reports on its whole type", () => {
  it('r9: `true ? 1 : "a"` then `.length` reports nothing', () => {
    // §Reproduction row 9. Post-fix the ternary types `integer | string`;
    // `classifyReceiver` (src/parser/type-layer-checks.ts) answers `"unknown"`
    // for a union and `checkMemberAccess` defers, which is the posture
    // docs/spec_topics/type-system.md:48 §"Unresolvable operands" prescribes.
    // A union receiver is statically unresolvable, not a receiver missing a
    // method, so `theta/parse/unknown-method` — whose *Trigger*
    // (code-registry-parse.md:63) is "Method or property accessed on a built-in
    // type that the theta 1.0 stdlib does not expose" — is the wrong code for
    // this source in the strong sense: `string` DOES expose `length`.
    const doc = parse('let x = true ? 1 : "a"\nlet n = x.length\n');
    precondition(doc, "r9", { ternaries: 1, members: ["length"] });
    expect(
      codesOf(doc),
      `r9 — a diagnostic that names a member the receiver's real type has, and that flips with the branch order, is worse than none. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it('r10: `true ? "a" : 1` then `x + 1` keeps its code and renders the whole operand', () => {
    // §Reproduction row 10, and the one cell whose CODE must not move while its
    // MESSAGE must. The diagnostic's identity is unchanged and correct: a
    // `string | integer` operand against `integer` is neither a both-numeric nor
    // a both-string pairing, which is what expressions.md:228 §"`+` operator"
    // requires — `classifyOperand` (src/parser/type-layer-checks.ts) categorises
    // a union as `"other"`, so the pairing is mixed and `checkPlusOperands`
    // fires. What the fix changes is that the operand is derived from the WHOLE
    // type rather than from half of it, which is exactly what the 0081 doc's
    // §Expected for this row asks: "the operand check should not resolve it to
    // `string`".
    //
    // The arms are receiver-first, so the consequent `"a"` precedes the
    // alternate `1` and the left operand renders `string | integer`.
    const doc = parse('let x = true ? "a" : 1\nlet n = x + 1\n');
    precondition(doc, "r10", { ternaries: 1, pluses: 1 });
    expect(
      codesOf(doc),
      `r10 (code half) — the mixed pairing is genuine under expressions.md:228 either way, so this code must keep firing; a fix that silenced it would have removed a true report. Diagnostics: ${render(doc)}`,
    ).toEqual([MIXED_PLUS_CODE]);
    expect(
      hitsOf(doc),
      `r10 (message half) — code-registry-parse.md:36's *Message* renders both operands, and DIAG-4 (diagnostic-shape.md:74) makes that rendering normative; naming \`string\` alone tells the author to fix an operand that is not only a \`string\`. Diagnostics: ${render(doc)}`,
    ).toEqual([`${MIXED_PLUS_CODE}: ${mixedPlusMessage("string | integer", "integer")}`]);
  });
});

// ===========================================================================
// (s) — the rendered spellings, including the union-spelling disposition.
// ===========================================================================

describe("bug 0081 — the computed LUB's rendered spelling", () => {
  it('s1: `[1, "a"]` renders `array<integer | string>`, tighter than the spec\'s worked spelling', () => {
    // THE UNION-SPELLING DISPOSITION CELL. The file header states it in full:
    // expressions.md:225 writes the worked vector as `array<number | string>`,
    // and the computed LUB carries the arms VERBATIM (as `concatElementType`,
    // src/runtime/stdlib-string.ts, already does for `array<T>.concat`), so it
    // computes `array<integer | string>`. That is deliberate and it is what this
    // cell pins: `array<integer | string> ⊑ array<number | string>` by TYPE-2
    // inside the arm and TYPE-6 across the arms
    // (docs/spec_topics/type-system.md:36, :40), so the computed type is
    // strictly tighter and satisfies any sink written to the spec's spelling;
    // and rule 2's TYPE-2 clause is conditioned on "`integer` widens to `number`
    // when mixed with `number`", which this literal is not. Cell r1 measures the
    // vector's normative observable — the source loads — separately, so widening
    // the arm to match the spec's prose would change this cell alone, as a
    // decision, with the reasoning above to answer.
    expect(
      tailSpelling('[1, "a"]\n', "array", "s1"),
      "s1 — expressions.md:225 rule 2, arms verbatim per §Fix constraint 1's consistency requirement with `concatElementType`",
    ).toBe("array<integer | string>");
  });

  it('s2: `["a", null]` renders `array<string | null>` — the spelling the spec prints', () => {
    // The vector where the spec's printed spelling and the verbatim-arm
    // computation coincide, because neither arm is subject to a widening clause.
    // Held beside s1 so the disposition is visibly about the TYPE-2 clause's
    // precondition and not about union rendering in general.
    expect(
      tailSpelling('["a", null]\n', "array", "s2"),
      "s2 — expressions.md:225 prints `[\"a\", null]` → `array<string | null>` character for character",
    ).toBe("array<string | null>");
  });

  it('s3: `[1, "a", true]` renders a flat three-arm union', () => {
    // The n-ary companion to u3, on the spelling channel: the arms are the
    // branches, in source order, with no pairwise nesting visible in the render.
    expect(
      tailSpelling('[1, "a", true]\n', "array", "s3"),
      "s3 — rule 2 reduces the element type SET, so three branches yield three arms in source order",
    ).toBe("array<integer | string | boolean>");
  });

  it('s4: `[[1], ["a"]]` renders `array<array<integer> | array<string>>`', () => {
    // uN's spelling half, and the cell that shows rule 3's gate is on branch
    // KIND rather than on "the branches disagree": two `array` branches that
    // disagree still union.
    expect(
      tailSpelling('[[1], ["a"]]\n', "array", "s4"),
      "s4 — expressions.md:226 confines the refusal to named object schemas, so `array<T>` branches take rule 2's union clause",
    ).toBe("array<array<integer> | array<string>>");
  });

  it('s5: `true ? 1 : "a"` renders `integer | string`', () => {
    // The ternary half of §Fix constraint 3: the inferrer must produce the same
    // union the checker admits, or the `unknown-method` and
    // `mixed-plus-operands` misreports move to new inputs instead of closing.
    // This is the type r9 and r10 read through their respective checkers.
    expect(
      tailSpelling('true ? 1 : "a"\n', "ternary", "s5"),
      "s5 — expressions.md:222 scopes rule 2's LUB (and rule 2 alone) to ternary branches; docs/spec_topics/type-system.md:50 TYPE-9 states that this reduction is the whole of what a ternary contributes",
    ).toBe("integer | string");
  });

  it("s6: `[1, 2.5]` still renders `array<number>` — TYPE-2, unmoved", () => {
    // The control on the spelling channel. TYPE-2's widening clause has its
    // stated precondition satisfied here — `integer` IS mixed with `number` —
    // so this literal collapses onto the dominating branch and must not become a
    // union. Paired with r3, which measures the same source's silence.
    expect(
      tailSpelling("[1, 2.5]\n", "array", "s6"),
      "s6 — docs/spec_topics/type-system.md:36 TYPE-2; a union arm that reached this input would have replaced the widening clause rather than followed it",
    ).toBe("array<number>");
  });
});

// ===========================================================================
// (r3, r4, r5, cPlus, cIdx) — the controls that must not move. Each is green at
// this HEAD; each staying green is what bounds the fix to rule 2's union clause.
// ===========================================================================

describe("bug 0081 — the paths the union clause must not disturb", () => {
  it("r3: `let x = [1, 2.5]` loads — TYPE-2 widening, unmoved", () => {
    // §Reproduction row 3, the one heterogeneous case that already works: a
    // dominating branch exists (`number`), so rule 2's second clause answers and
    // the union clause is never reached.
    const doc = parse("let x = [1, 2.5]\n");
    precondition(doc, "r3", { arrayWidths: [2] });
    expect(
      codesOf(doc),
      `r3 — expressions.md:225's TYPE-2 clause, whose "when mixed with \`number\`" precondition this literal satisfies. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it('r4: the binding-annotation sink still admits `["a", null]`', () => {
    // §Reproduction row 4. Rule 1 (expressions.md:224) decides this source, not
    // rule 2: the annotation supplies the element sink and `checkCommonType`
    // takes its sunk arm, which the route under test does not touch.
    const doc = parse('let x: array<string | null> = ["a", null]\n');
    precondition(doc, "r4", { arrayWidths: [2] });
    expect(
      codesOf(doc),
      `r4 — the sunk arm reports \`theta/parse/array-element-type-mismatch\` (code-registry-parse.md:40) and is a §Non-goal of this report; it must answer identically before and after. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it('r5: the constructor-field sink still admits `["a", null]`', () => {
    // §Reproduction row 5 — the second sink spelling rule 1 names, reached
    // through the object-construction path rather than the binding path.
    const doc = parse(
      'schema S {\n  xs: array<string | null>\n}\nlet s = S { xs: ["a", null] }\n',
    );
    precondition(doc, "r5", { arrayWidths: [2], ctors: ["S"] });
    expect(
      codesOf(doc),
      `r5 — expressions.md:220 names "surrounding constructor field" as a sink; this route must keep answering through rule 1. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it('cPlus: `1 + "a"` keeps its diagnostic and its rendering', () => {
    // r10's non-ternary control. Both operands are concrete primitives, so no
    // common-type reduction stands between the source and the operand check;
    // this cell moving would mean the fix reached `checkPlusOperands` itself
    // rather than the type feeding it.
    const doc = parse('let n = 1 + "a"\n');
    precondition(doc, "cPlus", { pluses: 1, ternaries: 0 });
    expect(
      hitsOf(doc),
      `cPlus — expressions.md:228 makes a numeric-against-string pairing mixed, and code-registry-parse.md:36's *Message* renders both operands. Diagnostics: ${render(doc)}`,
    ).toEqual([`${MIXED_PLUS_CODE}: ${mixedPlusMessage("integer", "string")}`]);
  });

  it("cIdx: `let x = [1, 2.5]` then `x[0] + 1` stays silent", () => {
    // The widened element type reaching a downstream operand check. The element
    // is `number` by TYPE-2 and the addend is `integer`, so the pairing is
    // both-numeric and `checkPlusOperands` is correct to say nothing. Held
    // beside r3 and s6 so the widening is measured at a consumer, not only at
    // the literal.
    const doc = parse("let x = [1, 2.5]\nlet n = x[0] + 1\n");
    precondition(doc, "cIdx", { arrayWidths: [2], pluses: 1 });
    expect(
      codesOf(doc),
      `cIdx — expressions.md:228 admits two numeric operands; a union arm reaching this literal would make the element a union and turn this silence into a mixed-pairing report. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (r7, r8) — rule 3's refusal, which must survive at an array literal, and its
// deliberate absence at a ternary, which is the settled rule (bug 0155 route
// (b)), not a residual.
// ===========================================================================

describe("bug 0081 — rule 3's refusal survives, and does not reach a ternary", () => {
  it("r7: `[A{…}, B{…}]` still refuses, with the registered Message", () => {
    // §Reproduction row 7, and §Fix constraint 2. Rule 3 (expressions.md:226) is
    // the ONLY sink-less rejection the spec prescribes, so the union arm has to
    // be gated on branch KIND — an object branch with no dominating branch has
    // no common type — rather than applied blanket. A union arm that reached
    // this source would delete the one refusal the corpus asks for.
    //
    // THE INLINE-OBJECT TWIN IS ABSENT BY MEASUREMENT, not by omission. Written
    // at this position, `let x = [{ a: 1 }, { b: "x" }]` draws two
    // `theta/parse/bare-object-literal` (code-registry-parse.md:47) and no
    // common-type diagnostic at all: expressions.md §"Object construction"
    // admits a bare object literal in exactly two positions, an array element
    // being neither.
    //
    // A NAMED SCHEMA CONSTRUCTION IS ONE ROUTE TO AN OBJECT BRANCH, NOT THE ONLY
    // ONE. An identifier annotated with a schema (`let a: A = A{…}`,
    // `let b: B = B{…}`, then `[a, b]`) reaches this same refusal through
    // `isObjectBranch`'s second disjunct with `unfoldAlias` doing no work —
    // `unfoldAlias(named A, env)` returns `named A` unchanged, because `A` is
    // not itself an alias declaration. An identifier annotated with an ALIAS of
    // a schema reaches the SAME disjunct through an ACTUAL unfold: TYPE-11
    // (alias transparency) walks the alias to the object schema before TYPE-10's
    // nominal test runs. Cell r7b, immediately below, is the witness for that
    // unfold step; this cell alone measures neither route.
    const doc = parse(`${A_B_SCHEMAS}let x = [A { a: 1 }, B { b: "x" }]\n`);
    precondition(doc, "r7", { arrayWidths: [2], ctors: ["A", "B"] });
    expect(
      hitsOf(doc),
      `r7 — code-registry-parse.md:41's *Trigger* is "Array literal whose elements have no common type and no sink to narrow against", which is precisely this source; DIAG-4 (diagnostic-shape.md:74) makes the rendered Message normative. Diagnostics: ${render(doc)}`,
    ).toEqual([`${NO_COMMON_TYPE_CODE}: ${noCommonTypeMessage()}`]);
  });

  it("r7b: two ALIAS-spelled object schemas still refuse — the `isObjectBranch` unfold witness", () => {
    // THE WITNESS FOR `isObjectBranch`'s TYPE-11→TYPE-10 UNFOLD STEP
    // (src/parser/type-compat.ts). r7 above measures `isObjectBranch`'s second
    // disjunct (`named` resolving to an object-schema declaration) with
    // `unfoldAlias` doing no work, because its branches (`named A` / `named B`,
    // from a named schema construction) are not aliases to begin with. This
    // cell reaches the SAME disjunct through an ACTUAL alias unfold instead.
    //
    // `fn` PARAMETERS are the route, not a `let` binding: a `let`'s own
    // recorded type is `unfoldAlias(annotation, this.env)` already (the `let`
    // arm, src/parser/type-layer-checks.ts), so `let x: X = …` would reach
    // `isObjectBranch` pre-unfolded and measure r7's route again, not this
    // one. `annotationToCompatType` (same file) records a `fn` parameter's
    // annotation VERBATIM — `{ kind: "named", name: "X" }`, no env lookup — so
    // `x` and `y` below reach `isObjectBranch` still spelled `named X` /
    // `named Y`, and `unfoldAlias` is what walks `X → A` and `Y → B` before the
    // object-schema test runs.
    //
    // Deleting the `unfoldAlias` call from `isObjectBranch` (testing `branch`
    // directly instead of `unfolded`) reds this cell and no other in the
    // suite: `resolveNamed(env, "X")?.kind` is `"alias"`, never
    // `"object-schema"`, so the gate stops firing for this fixture alone and
    // `[x, y]` unions instead of refusing.
    const doc = parse(
      `${A_B_SCHEMAS}schema X = A\nschema Y = B\nfn f(x: X, y: Y): integer {\n  let z = [x, y]\n  1\n}\n`,
    );
    precondition(doc, "r7b", { arrayWidths: [2] });
    expect(
      hitsOf(doc),
      `r7b — the same code-registry-parse.md:41 *Trigger* as r7, reached through an alias spelling instead of a direct one; DIAG-4 (diagnostic-shape.md:74) makes the rendered Message normative. Diagnostics: ${render(doc)}`,
    ).toEqual([`${NO_COMMON_TYPE_CODE}: ${noCommonTypeMessage()}`]);
  });

  it("r8: `true ? A{…} : B{…}` still loads — rule 3 is array-literal-only", () => {
    // §Reproduction row 8, RE-PINNED to the settled disposition (bug 0155 route
    // (b)). Rule 3 is adjudicated out of the ternary position: its code,
    // `theta/parse/array-no-common-type`, is registered against an "**Array
    // literal**" (its row on code-registry-parse.md), and DIAG-2
    // (diagnostic-shape.md:72, the registry is closed) makes that *Trigger* the
    // normative statement of the code's emission set. `checkCommonType`'s only
    // caller in `src/` is `checkArrayLiteral`
    // (src/parser/type-layer-checks.ts), and no ternary node reaches the
    // refusal — by rule, not by omission.
    //
    // `[]` here is the RULE: docs/spec_topics/type-system.md:50 TYPE-9 states
    // that a ternary reports no code of its own, so its branches reduce under
    // rule 2's LUB and the resulting branch-order dependence between the two
    // schemas is accepted, not diagnosed.
    //
    // This cell is green before and after. It stays a tripwire: a later change
    // that enforces rule 3 for a ternary without a DIAG-2 *Trigger* widening
    // reds here instead of landing unnoticed.
    const doc = parse(`${A_B_SCHEMAS}let x = true ? A { a: 1 } : B { b: "x" }\n`);
    precondition(doc, "r8", { ternaries: 1, ctors: ["A", "B"] });
    expect(
      codesOf(doc),
      `r8 — rule 3 is array-literal-only (bug 0155 route (b)); this row's silence is the adjudicated rule, not a deferral. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });
});
