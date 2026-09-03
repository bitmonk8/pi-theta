import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { findCode, parseDoc } from "./helpers/e2e-s1";

// Bug 0241 — `docs/spec_topics/grammar.md:230`'s FOURTH sink bullet, "the
// element type of an array-typed sink that this literal is itself an element of
// (recursive descent)", is unwired at all three type-layer routes, so a nested
// array literal under a written, in-scope element sink reaches the sink-LESS
// check and is refused with `theta/parse/array-no-common-type` while its
// one-level-flat twin loads clean
// (docs/bugs/0241-nested-array-element-sink-descent-unwired.md).
//
// THE SITES, named by symbol alone (`src/parser/type-layer-checks.ts` moves on
// every fix that touches it, so no line citation into it is durable — bug
// 0134's adjudicated do-not-chase class; the sibling witness
// tests/alias-sink-array-element-check.test.ts states the same convention for
// this file):
//   • `TypeLayerWalk.checkArrayLiteral` — the ONE relation all three routes
//     share. It maps `typeOf` over `array.elements` and pushes
//     `checkCommonType`; it never inspects whether an element is itself an
//     array literal and never passes the sink's element type down. §Fix places
//     the descent here, so no fourth dispatch position can drift.
//   • Dispatch 1, the binding annotation — `walkStmt`'s `case "let"` sunk check
//     `this.checkArrayLiteral(sunkArray.node, sunkArray.element, bindings)`,
//     where `sunkArray` is `sinkedArrayOf`'s answer, plus the walk's skip of
//     that ONE node.
//   • Dispatch 2, the `fn` parameter type — `checkFnCallArgs`'
//     `this.checkArrayLiteral(arg, unfolded.element, bindings)`, bug 0156's
//     landed route (fixed 0.193.0), with the argument recorded in the returned
//     `ReadonlySet<Expr>`.
//   • Dispatch 3, the constructor field — `checkObjectField`'s
//     `this.checkArrayLiteral(value, unfoldedDeclared.element, bindings)`,
//     whose answer becomes `checkObjectFields`' skip.
//   • The route the INNER literal takes today — `walkExpr`'s `case "array"`:
//     `this.checkArrayLiteral(e, undefined, bindings)`, reached because
//     each dispatch marks exactly the OUTER node as skipped. That `undefined`
//     sink is `checkCommonType`'s sink-less arm
//     (src/parser/type-compat.ts:625), the ONLY place
//     `theta/parse/array-no-common-type` is minted — so its presence in a cell
//     that WRITES a sink is a direct observation of the routing, not an
//     inference. Rule 1's `theta/parse/array-element-type-mismatch` is minted
//     in the sunk arm of the same relation (src/parser/type-compat.ts:603).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:230 — fourth sink bullet, "The element type
//     of an array-typed sink that this literal is itself an element of
//     (recursive descent)", under `:216`'s "The sink set is exhaustive".
//     Prose mirror: docs/reference/grammar.md:461–471.
//   - docs/spec_topics/expressions.md:226, rule 1 — with a sink in scope
//     "every element must satisfy `T_element ⊑ T_sinkElement`; a mismatch is
//     `theta/parse/array-element-type-mismatch` naming the offending element".
//     Row A6 is that rule owed at the INNER level; row B4 is the same verdict
//     the same violation already draws flat.
//   - docs/spec_topics/expressions.md:228, rule 3 — two distinct named schemas
//     yield `array<A | B>` "only if some sink in scope expects a union".
//     Rows A1–A5 write exactly such a sink, one level down.
//   - docs/spec_topics/type-system.md TYPE-11 — an alias is transparent in `⊑`.
//     Row A5 spells the nested element sink through an alias, the law bug 0157
//     landed at 0.180.0 (§Fix constraint 1: the descent INHERITS that shape).
//   - Registry rows (DIAG-2, the closed authority on emissions):
//     docs/spec_topics/diagnostics/code-registry-parse.md:43
//     (`theta/parse/array-element-type-mismatch`), `:44`
//     (`theta/parse/array-no-common-type`, whose *Trigger* reads "and no sink
//     to narrow against" — so removing rows A1–A5's emission NARROWS an
//     emission set onto its own registered sentence and engages no DIAG-2
//     edit), `:49` (`theta/parse/object-field-type-mismatch`), `:59`
//     (`theta/parse/let-rhs-type-mismatch`), `:137`
//     (`theta/parse/fn-arg-type-mismatch`), `:19`
//     (`theta/parse/binding-case-mismatch`).
//
// THE CODE COUNT AT THE NESTED HOMOGENEOUS MISMATCH — §Fix constraint 3,
// settled here as ONE VERDICT PER LITERAL: the descent runs only where the
// enclosing level's own `checkCommonType` reported NOTHING for that literal.
// Rows C1–C3 and E1 therefore keep EXACTLY the two codes they draw today; no
// third code appears at the inner level. This is bug 0129's landed law
// (0.171.0) applied — a verdict DERIVED from re-reading text an enclosing
// verdict has already refused withholds — and it is why bug 0195's cell m2
// (tests/for-empty-array-iterand-adjudication.test.ts) does not move.
//
// WITHHOLDING IS *NO* VERDICT, NOT A SINK-LESS ONE — group (F). Where the
// enclosing level refuses, the sink is still in scope at every nested position
// down the element chain (grammar.md:221), so `array-no-common-type`'s
// registered *Trigger* ("and no sink to narrow against") is false there and the
// withheld literals must draw nothing at all rather than the sink-less row.
// Group (F) pins that at the three routes and at depth 2, and its last cell
// pins the other side of the boundary: the element chain is ARRAY elements
// only, so a literal inside a call argument keeps its own route and its own
// refusal.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a source string, so an integration tier
// would add a session round-trip to a parse-time observable and buy no reach.
// The one consequence that is NOT parse-local — whether the refused document
// becomes a slash command at all — is covered live in
// tests/live/nested-array-element-sink-descent-live-cell.test.ts.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md): no asserted
// message string is written out here. Every one is READ from the registry's
// *Message* column through `parseRegistry` / `registryMessage`
// (tools/code-registry/index.js) via the `msg` helper below, so a reworded
// template reds by naming the registry rather than by a bare string mismatch.
// No message assertion uses containment, and no code assertion reads a filtered
// subset: every cell compares the WHOLE unfiltered ordered code list.
//
// ANTI-VACUITY. Every absence cell goes through `expectSilent`, which asserts
// the frontmatter parsed AND that the whole body walked to its expected
// top-level statement count BEFORE reading the empty code list. Group (E)
// additionally shows the harness reports at all on this file's own fixture
// shape.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips.

const ELEMENT = "theta/parse/array-element-type-mismatch";
const NO_COMMON = "theta/parse/array-no-common-type";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const FN_ARG = "theta/parse/fn-arg-type-mismatch";
const OBJ_FIELD = "theta/parse/object-field-type-mismatch";
const BINDING_CASE = "theta/parse/binding-case-mismatch";

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
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

// --- production parse harness ----------------------------------------------
//
// `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps. No behaviour under
// assertion is stubbed: the type layer is the production one.

/** The frontmatter every body below is parsed under (lines 1–3). */
const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];

/** The whole-document parse of `body`, source beginning on line 4. */
function docOf(body: readonly string[]): ThetaDocument {
  return parseDoc([...FRONTMATTER, ...body].join("\n"));
}

/** The diagnostics the production parse reports for `body`, in emission order. */
function diagsOf(body: readonly string[]): readonly Diagnostic[] {
  return docOf(body).diagnostics;
}

/** The whole unfiltered diagnostic code list, in emission order. */
function codesOf(body: readonly string[]): string[] {
  return diagsOf(body).map((d: Diagnostic) => d.code);
}

/**
 * The load gate, mirroring `hasLoadParseError`
 * (src/extension/production-composition.ts): a theta registers iff its
 * frontmatter parsed and no diagnostic is error-severity.
 */
function registers(doc: ThetaDocument): boolean {
  return doc.frontmatter !== null && !doc.diagnostics.some((d) => d.severity === "error");
}

/**
 * The message reported for `code`, or `undefined` when no diagnostic carries it.
 * Selecting by code rather than by position keeps a message failure attributable
 * to its own row even where the code list is also wrong; the whole ordered code
 * list is asserted separately in every cell.
 */
function messageFor(diags: readonly Diagnostic[], code: string): string | undefined {
  return findCode(diags, code)?.message;
}

/** The 1-based start column of the first diagnostic carrying `code`. */
function startColumnOf(diags: readonly Diagnostic[], code: string): number | undefined {
  return findCode(diags, code)?.range?.start.column;
}

/**
 * An ABSENCE cell with its loud anti-vacuity precondition. `statements` is the
 * source's own top-level statement count: asserting it before reading the code
 * list means a truncated parse, a fixture whose text drifted, or a harness that
 * stopped walking cannot present itself as a clean load. The frontmatter check
 * is the second half — an unparsed frontmatter is the other way a document can
 * carry zero type diagnostics while measuring nothing.
 */
function expectSilent(body: readonly string[], statements: number, why: string): void {
  const doc = docOf(body);
  expect(
    doc.frontmatter,
    `anti-vacuity (${why}): the frontmatter did not parse, so a clean diagnostic list measures nothing`,
  ).not.toBeNull();
  expect(
    doc.body.statements.length,
    `anti-vacuity (${why}): the whole body must walk to ${statements} top-level statements before its silence is a measurement`,
  ).toBe(statements);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    why,
  ).toEqual([]);
  expect(
    registers(doc),
    `${why}: the theta did not register — an error-severity diagnostic denied the load gate for a source the spec admits`,
  ).toBe(true);
}

/** The two object schemas rule 3's population is written over. */
const AB: readonly string[] = [
  "schema A {",
  "  a: integer",
  "}",
  "schema B {",
  "  b: string",
  "}",
];

/** The third schema, present only in the rows that name `C`. */
const C_SCHEMA: readonly string[] = ["schema C {", "  c: boolean", "}"];

/** The rule-3 pair: one `A` and one `B`, which have no LUB (TYPE-10 nominality). */
const A_AND_B = '[A { a: 1 }, B { b: "x" }]';

/** The rule-1 violation: a `C` where the declared element type is `A | B`. */
const A_AND_C = "[A { a: 1 }, C { c: true }]";

// ===========================================================================
// (A) The class — a written, in-scope element sink must reach the NESTED
//     literal, at all three routes, at depth, and through an alias. RED at
//     HEAD: each cell draws the inner literal's `array-no-common-type` where
//     `[]` (A1–A5) or rule 1's element code (A6) is owed.
// ===========================================================================

describe("0241 (A) — the fourth sink bullet reaches the nested literal at all three routes", () => {
  it("the binding-annotation route admits the nested rule-3 literal — row A1", () => {
    // grammar.md:221's fourth bullet at the FIRST wired dispatch: the outer
    // sink is `array<array<A | B>>`, so the inner literal's sink is
    // `array<A | B>` and expressions.md:228's "some sink in scope expects a
    // union" is satisfied one level down exactly as it is flat (row B1).
    // This is also bug 0195's row m3, which §Fix constraint 6 requires to flip.
    expectSilent(
      [...AB, `let xs: array<array<A | B>> = [${A_AND_B}]`, "xs"],
      3,
      "the annotation's element type `array<A | B>` is the nested literal's sink (grammar.md:221)",
    );
  });

  it("the `fn`-parameter route admits the same nested literal — row A2", () => {
    // The SECOND bullet's dispatch, bug 0156's landed route (0.193.0), one
    // level down. Its flat twin is row B2.
    expectSilent(
      [
        ...AB,
        "fn f(xs: array<array<A | B>>): integer { 1 }",
        `let y = f([${A_AND_B}])`,
        "y",
      ],
      4,
      "the callee's parameter element type `array<A | B>` is the nested literal's sink (grammar.md:221)",
    );
  });

  it("the constructor-field route admits the same nested literal — row A3", () => {
    // The THIRD bullet's dispatch, `checkObjectField`, one level down. Its flat
    // twin is row B3. A1/A2/A3 agreeing is what makes the defect ONE mechanism.
    expectSilent(
      [
        ...AB,
        "schema S {",
        "  items: array<array<A | B>>",
        "}",
        `let s = S { items: [${A_AND_B}] }`,
        "s",
      ],
      4,
      "the declared field's element type `array<A | B>` is the nested literal's sink (grammar.md:221)",
    );
  });

  it("the descent is not depth-1-specific — row A4", () => {
    // "recursive descent" (grammar.md:221) is recursive: two levels of wrapping
    // must narrow the innermost literal the way one level narrows its own.
    expectSilent(
      [...AB, `let xs: array<array<array<A | B>>> = [[${A_AND_B}]]`, "xs"],
      3,
      "the sink descends through TWO array levels to the innermost literal (grammar.md:221, recursive)",
    );
  });

  it("an ALIAS-spelled element sink descends on the same footing — row A5", () => {
    // §Fix constraint 1: the descent INHERITS bug 0157's landed shape (0.180.0)
    // — unfold (TYPE-11) before classifying — rather than re-deciding it. The
    // outer sink `array<L>` unfolds to `array<array<A | B>>`, so the inner
    // literal's sink is `array<A | B>`.
    expectSilent(
      [...AB, "schema L = array<A | B>", `let xs: array<L> = [${A_AND_B}]`, "xs"],
      4,
      "TYPE-11 makes the alias `L` transparent, so the nested literal's sink is `array<A | B>`",
    );
  });

  it("a genuine element violation one level down is named by rule 1, not misattributed to the sink-less row — row A6", () => {
    // expressions.md:226, rule 1, at the INNER level: `C` violates the declared
    // `A | B` element type and must be NAMED by index and by type — the exact
    // verdict its flat twin B4 already gives. Today the whole inner literal
    // draws `array-no-common-type` instead, whose prescribed remedy ("annotate
    // the binding with array<A | B>") directs the author to annotate a binding
    // that is already annotated. Exactly ONE code: §Fix constraint 3's settled
    // one-verdict-per-literal disposition puts the verdict at the inner level,
    // and the outer level's `⊑` withholds because the inner literal's own type
    // is unresolvable under a union element sink.
    const body = [...AB, ...C_SCHEMA, `let xs: array<array<A | B>> = [${A_AND_C}]`, "xs"];
    const diags = diagsOf(body);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "the inner element violation must be reported by rule 1 at the inner level and by nothing else",
    ).toEqual([ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "A | B"],
        ["<actual>", "C"],
      ]),
    );
    // The subject is the INNER literal, not the outer one: `[[A { a: 1 }, C {
    // c: true }]]` starts at column 31 and the inner literal at column 32.
    expect(
      startColumnOf(diags, ELEMENT),
      "the element verdict is not at the INNER literal's own range",
    ).toBe(32);
    expect(
      registers(docOf(body)),
      "a source with a genuine element violation must keep denying the load gate",
    ).toBe(false);
  });
});

// ===========================================================================
// (B) The flat twins — the same three sinks one level up. GREEN at HEAD; they
//     are the footing rows A1–A3/A6 must be brought onto, and a red here is
//     over-reach rather than under-reach.
// ===========================================================================

describe("0241 (B) — the one-level-flat twins already admit and must not move", () => {
  it("the binding-annotation sink admits the rule-3 pair — row B1", () => {
    expectSilent(
      [...AB, `let xs: array<A | B> = ${A_AND_B}`, "xs"],
      3,
      "rule 3 (expressions.md:228) in force at the wired binding sink",
    );
  });

  it("the `fn`-parameter sink admits the rule-3 pair — row B2", () => {
    expectSilent(
      [...AB, "fn f(xs: array<A | B>): integer { 1 }", `let y = f(${A_AND_B})`, "y"],
      4,
      "rule 3 in force at the parameter sink bug 0156 wired (0.193.0)",
    );
  });

  it("the constructor-field sink admits the rule-3 pair — row B3", () => {
    expectSilent(
      [
        ...AB,
        "schema S {",
        "  items: array<A | B>",
        "}",
        `let s = S { items: ${A_AND_B} }`,
        "s",
      ],
      4,
      "rule 3 in force at the wired constructor-field sink",
    );
  });

  it("A6's violation, flat, is named by index and by type — row B4", () => {
    // expressions.md:226, rule 1, at the level that is already wired. This is
    // the verdict row A6 is owed one level down, byte for byte apart from the
    // range.
    const diags = diagsOf([...AB, ...C_SCHEMA, `let xs: array<A | B> = ${A_AND_C}`, "xs"]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "A | B"],
        ["<actual>", "C"],
      ]),
    );
    expect(
      startColumnOf(diags, ELEMENT),
      "the flat twin's verdict is not at its literal's own range",
    ).toBe(24);
  });
});

// ===========================================================================
// (C) The two-code boundary at the nested HOMOGENEOUS mismatch — §Fix
//     constraint 3, settled as ONE VERDICT PER LITERAL. GREEN at HEAD and it
//     must stay green: the descent runs only where the enclosing level's own
//     `checkCommonType` reported NOTHING for that literal, so no third code
//     appears. Bug 0129's law: a verdict DERIVED from re-reading text an
//     enclosing verdict already refused withholds.
// ===========================================================================

describe("0241 (C) — the nested homogeneous mismatch keeps exactly its two codes", () => {
  it("the binding route keeps `let-rhs` + the OUTER element code — row C1", () => {
    // Also bug 0195's cell m2 (tests/for-empty-array-iterand-adjudication.test.ts),
    // a LOCK under §Fix constraint 3: it must not move.
    const diags = diagsOf([...AB, 'let xs: array<array<A>> = [[B { b: "x" }]]', "xs"]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "a third, inner-level element code appeared — one verdict per literal (§Fix constraint 3) is violated",
    ).toEqual([LET_RHS, ELEMENT]);
    expect(messageFor(diags, LET_RHS)).toBe(
      msg(LET_RHS, [
        ["<name>", "xs"],
        ["<expected>", "array<array<A>>"],
        ["<actual>", "array<array<B>>"],
      ]),
    );
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "0"],
        ["<expected>", "array<A>"],
        ["<actual>", "array<B>"],
      ]),
    );
    // The element verdict stays at the OUTER literal's range, index 0.
    expect(startColumnOf(diags, ELEMENT)).toBe(27);
  });

  it("the `fn`-parameter route keeps `fn-arg` + the OUTER element code — row C2", () => {
    const diags = diagsOf([
      ...AB,
      "fn f(xs: array<array<A>>): integer { 1 }",
      'let y = f([[B { b: "x" }]])',
      "y",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "a third, inner-level element code appeared at the parameter route — §Fix constraint 3 is violated",
    ).toEqual([FN_ARG, ELEMENT]);
    expect(messageFor(diags, FN_ARG)).toBe(
      msg(FN_ARG, [
        ["<name>", "f"],
        ["<i>", "0"],
        ["<param>", "xs"],
        ["<expected>", "array<array<A>>"],
        ["<actual>", "array<array<B>>"],
      ]),
    );
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "0"],
        ["<expected>", "array<A>"],
        ["<actual>", "array<B>"],
      ]),
    );
    expect(startColumnOf(diags, ELEMENT)).toBe(11);
  });

  it("the constructor-field route keeps `object-field` + the OUTER element code — row C3", () => {
    const diags = diagsOf([
      ...AB,
      "schema S {",
      "  items: array<array<A>>",
      "}",
      'let s = S { items: [[B { b: "x" }]] }',
      "s",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "a third, inner-level element code appeared at the field route — §Fix constraint 3 is violated",
    ).toEqual([OBJ_FIELD, ELEMENT]);
    expect(messageFor(diags, OBJ_FIELD)).toBe(
      msg(OBJ_FIELD, [
        ["<field>", "items"],
        ["<schema>", "S"],
        ["<expected>", "array<array<A>>"],
        ["<actual>", "array<array<B>>"],
      ]),
    );
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "0"],
        ["<expected>", "array<A>"],
        ["<actual>", "array<B>"],
      ]),
    );
    expect(startColumnOf(diags, ELEMENT)).toBe(20);
  });

  it("a union element sink whose OUTER level already refuses withholds the descent — row E1", () => {
    // The one-verdict-per-literal rule stated at the position that most tempts
    // a third code: the outer literal's index 1 is `array<C>` against the
    // declared `array<A | B>`, so the outer level HAS reported for the inner
    // literal's slot and the descent into `[C { c: true }]` withholds. Two
    // codes, unchanged from HEAD.
    const diags = diagsOf([
      ...AB,
      ...C_SCHEMA,
      "let xs: array<array<A | B>> = [[A { a: 1 }], [C { c: true }]]",
      "xs",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "the descent re-judged a literal the enclosing level already refused — bug 0129's law (§Fix constraint 3)",
    ).toEqual([LET_RHS, ELEMENT]);
    expect(messageFor(diags, LET_RHS)).toBe(
      msg(LET_RHS, [
        ["<name>", "xs"],
        ["<expected>", "array<array<A | B>>"],
        ["<actual>", "array<array<A> | array<C>>"],
      ]),
    );
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "array<A | B>"],
        ["<actual>", "array<C>"],
      ]),
    );
    expect(startColumnOf(diags, ELEMENT)).toBe(31);
  });
});

// ===========================================================================
// (D) Silence controls — §Fix constraint 7. Each is silent at HEAD and must be
//     silent after the descent lands: a descent that supplies a sink where the
//     source already conforms must add nothing.
// ===========================================================================

describe("0241 (D) — the conformant nested shapes stay silent", () => {
  it("a conformant nested literal at the binding route — row D1", () => {
    expectSilent(
      [...AB, "let xs: array<array<A>> = [[A { a: 1 }]]", "xs"],
      3,
      "the inner literal already satisfies `A ⊑ A` under the descended sink (rule 1)",
    );
  });

  it("a conformant nested literal at the `fn`-parameter route — row D2", () => {
    expectSilent(
      [
        ...AB,
        "fn f(xs: array<array<A>>): integer { 1 }",
        "let y = f([[A { a: 1 }]])",
        "y",
      ],
      4,
      "the descended parameter sink adds no verdict to a conforming literal",
    );
  });

  it("a conformant nested literal at the constructor-field route — row D3", () => {
    expectSilent(
      [
        ...AB,
        "schema S {",
        "  items: array<array<A>>",
        "}",
        "let s = S { items: [[A { a: 1 }]] }",
        "s",
      ],
      4,
      "the descended field sink adds no verdict to a conforming literal",
    );
  });

  it("a conformant nested literal of primitives — row D4", () => {
    expectSilent(
      [...AB, 'let xs: array<array<string>> = [["a", "b"]]', "xs"],
      3,
      "the descent must be type-agnostic: a primitive element sink behaves as a schema one does",
    );
  });

  it("an EMPTY inner literal draws nothing before and after — row D5", () => {
    // Bug 0195's row m1 re-measured (§Fix constraint 6: it must not move). The
    // descent supplies a sink, and a sunk empty literal has no branch to fail —
    // `checkCommonType` returns before the LUB on fewer than two branches.
    expectSilent(
      [...AB, "let xs: array<array<A>> = [[]]", "xs"],
      3,
      "an empty inner literal has no element to judge under the descended sink",
    );
  });
});

// ===========================================================================
// (E) Anti-vacuity — the harness reaches the checkers and reports.
// ===========================================================================

describe("0241 (E) — the harness reaches the checkers", () => {
  it("reports on a non-conformant binding name and stays silent on the conformant twin", () => {
    const diags = diagsOf(["let Xs = 1"]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([BINDING_CASE]);
    expect(messageFor(diags, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
    expect(codesOf(["let xs = 1"])).toEqual([]);
  });

  it("reports the sink-LESS rule-3 refusal, so an absent `array-no-common-type` in group (A) is a measurement", () => {
    // expressions.md:228's own sink-less rejection, written with NO sink
    // anywhere — inside `theta/parse/array-no-common-type`'s registered
    // *Trigger* ("and no sink to narrow against",
    // code-registry-parse.md:44) and untouched by this fix. Without this cell,
    // a harness that had stopped minting the code at all would satisfy every
    // (A) row vacuously.
    const body = [...AB, `let x = ${A_AND_B}`, "x"];
    const diags = diagsOf(body);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([NO_COMMON]);
    expect(messageFor(diags, NO_COMMON)).toBe(msg(NO_COMMON, []));
    expect(
      registers(docOf(body)),
      "the sink-less rule-3 refusal stopped denying the load gate",
    ).toBe(false);
  });
});

// ===========================================================================
// (F) The withheld outer verdict withholds ENTIRELY — it does not hand the
//     nested literals to the sink-LESS route. Each cell writes an outer
//     element violation beside a conformant nested rule-3 literal: the outer
//     level reports, the descent into the nested literal withholds (bug 0129's
//     law, group (C)), and the nested literal must therefore draw NOTHING —
//     grammar.md:221 keeps the sink in scope at that position, so
//     `array-no-common-type`'s registered *Trigger* ("and no sink to narrow
//     against", code-registry-parse.md:44) is false there.
// ===========================================================================

/** The outer element violation every (F) cell writes beside its nested literal. */
const OUTER_C = "C { c: true }";

describe("0241 (F) — a refused outer level withholds a verdict, not a sink", () => {
  it("the binding route reports the OUTER violation only — row F1", () => {
    const body = [
      ...AB,
      ...C_SCHEMA,
      `let xs: array<array<A | B>> = [${A_AND_B}, ${OUTER_C}]`,
      "xs",
    ];
    const diags = diagsOf(body);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "the withheld nested literal leaked to the sink-less route (`array-no-common-type` at a position where a sink IS in scope)",
    ).toEqual([ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "array<A | B>"],
        ["<actual>", "C"],
      ]),
    );
    // The subject is the OUTER literal, which starts at column 31.
    expect(startColumnOf(diags, ELEMENT)).toBe(31);
    expect(
      registers(docOf(body)),
      "an outer element violation must keep denying the load gate",
    ).toBe(false);
  });

  it("the `fn`-parameter route reports the OUTER violation only — row F2", () => {
    const diags = diagsOf([
      ...AB,
      ...C_SCHEMA,
      "fn f(xs: array<array<A | B>>): integer { 1 }",
      `let y = f([${A_AND_B}, ${OUTER_C}])`,
      "y",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "the withheld nested literal leaked at the parameter route",
    ).toEqual([ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "array<A | B>"],
        ["<actual>", "C"],
      ]),
    );
    expect(startColumnOf(diags, ELEMENT)).toBe(11);
  });

  it("the constructor-field route reports the OUTER violation only — row F3", () => {
    const diags = diagsOf([
      ...AB,
      ...C_SCHEMA,
      "schema S {",
      "  items: array<array<A | B>>",
      "}",
      `let s = S { items: [${A_AND_B}, ${OUTER_C}] }`,
      "s",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "the withheld nested literal leaked at the constructor-field route",
    ).toEqual([ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "array<A | B>"],
        ["<actual>", "C"],
      ]),
    );
    expect(startColumnOf(diags, ELEMENT)).toBe(20);
  });

  it("a violation at the MID level withholds the INNERMOST literal too — row F4", () => {
    // Depth 2: the outer literal admits, the MID literal reports its own
    // element violation, and the withholding must reach the innermost literal —
    // the position furthest from the reporting level and the one a single-level
    // withhold would leak.
    const diags = diagsOf([
      ...AB,
      ...C_SCHEMA,
      `let xs: array<array<array<A | B>>> = [[${A_AND_B}, ${OUTER_C}]]`,
      "xs",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "the innermost literal leaked to the sink-less route under a MID-level refusal",
    ).toEqual([ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "array<A | B>"],
        ["<actual>", "C"],
      ]),
    );
    // The subject is the MID literal (column 39), not the outer one (38).
    expect(startColumnOf(diags, ELEMENT)).toBe(39);
  });

  it("the withhold follows the ARRAY-element chain only, so a call argument keeps its own refusal — row F5", () => {
    // The other side of the boundary. `[A { a: 1 }, B { b: "x" }]` here is an
    // argument to `f`, not an element of an array literal: no sink reaches it
    // (`f`'s parameter is `integer`), so `array-no-common-type` sits inside its
    // registered *Trigger* and must still be reported even though the enclosing
    // literal that CONTAINS the call was withheld.
    const diags = diagsOf([
      ...AB,
      ...C_SCHEMA,
      "fn f(n: integer): integer { 1 }",
      `let xs: array<array<integer>> = [[f(${A_AND_B})], ${OUTER_C}]`,
      "xs",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "the withhold silenced a literal at a position with no sink — the element chain is ARRAY elements only",
    ).toEqual([ELEMENT, NO_COMMON]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "array<integer>"],
        ["<actual>", "C"],
      ]),
    );
    expect(messageFor(diags, NO_COMMON)).toBe(msg(NO_COMMON, []));
    // The outer verdict is at column 33; the surviving refusal is at the call
    // argument's own range, column 37.
    expect(startColumnOf(diags, ELEMENT)).toBe(33);
    expect(startColumnOf(diags, NO_COMMON)).toBe(37);
  });
});
