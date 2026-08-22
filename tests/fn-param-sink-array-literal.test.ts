import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { findCode, parseDoc } from "./helpers/e2e-s1";

// Bug 0156 — `docs/spec_topics/expressions.md` names the PARAMETER TYPE among an
// array literal's context sinks, and array-construction rule 3 admits two
// distinct named object schemas "only if some sink in scope expects a union",
// but no `fn`-parameter sink is ever supplied at a call site: `checkFnCallArgs`
// resolves the callee's declared parameter type and discards it, and the `call`
// arm of `walkExpr` walks each argument with `skipArray` at its `null` default,
// so an array argument reaches the sink-LESS `checkArrayLiteral(e, undefined,
// …)` whatever the callee declares
// (docs/bugs/0156-fn-parameter-sink-not-consulted-for-rule3-unions.md).
//
// THE ROUTE THIS FILE WITNESSES — §Fix **Route A**, selected: supply the
// callee's parameter type as the array-literal element sink at
// `checkFnCallArgs`, WHOLESALE, so rule 1 is in force at the argument position
// exactly as it is at the two wired sinks.
//
// THE SITES, named by symbol. `src/parser/type-layer-checks.ts` was 2531 lines
// when the report was filed and every fix since has moved its line count
// (including this one), so no by-line citation into it is durable and none is
// written here (bug 0134's adjudicated do-not-chase class):
//   • `checkFnCallArgs` — the resolution ladder over `e.callee`. It returns
//     early on a locally-shadowed callee, on an imported symbol (open bug
//     0138's half), and on a non-`fn` callee; the surviving path computes
//     `annotationToCompatType(p.type)` per matched index. THAT value is the
//     sink Route A must hand down, and it exists already: rows e1/e2 render it
//     verbatim in the `fn-arg-type-mismatch` *Message* (`expected
//     array<string>`), which is direct evidence it is a well-formed
//     `CompatType` of the shape `checkArrayLiteral`'s `sink` parameter takes.
//   • `walkExpr`'s `case "call"` — `checkFnCallArgs(e, bindings)` then one
//     `walkExpr(arg, bindings, flow)` per argument, the fourth parameter
//     omitted. One invocation per argument means each can carry its own
//     `skipArray` with no signature widening — the shape `checkObjectField`
//     already uses — which is §Fix constraint 2: without it a literal that
//     passes the sunk check is immediately re-judged sink-less and rows a1/a2
//     keep their diagnostic.
//   • `walkExpr`'s `case "array"` — `if (e !== skipArray) { checkArrayLiteral(e,
//     undefined, bindings) }`, the sink-less route every argument takes today.
//   • `checkCommonType` / `commonType` (`src/parser/type-compat.ts`) — the
//     `sink === undefined` arm is the ONLY place
//     `theta/parse/array-no-common-type` is minted, so its presence in a cell
//     that writes a parameter sink is a direct observation of the routing.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/expressions.md:222 — "`[]` is the empty array; its
//     element type is inferred from context (binding annotation, parameter
//     type, or surrounding constructor field)". The parameter type is one of
//     the three sinks by name, on the same footing as the two that are wired;
//     docs/spec_topics/grammar.md:216–221 calls the same set "exhaustive" and
//     lists "A function parameter type at a call site" as its second bullet.
//   - docs/spec_topics/expressions.md:226, rule 1 — once a sink IS in scope
//     "every element must satisfy `T_element ⊑ T_sinkElement`; a mismatch is
//     `theta/parse/array-element-type-mismatch` naming the offending element".
//     Route A puts this rule in force at the argument position; rows e3, e1 and
//     e2 are where that is measured.
//   - docs/spec_topics/expressions.md:228, rule 3 — two different named schemas
//     yield `array<A | B>` "only if some sink in scope expects a union;
//     otherwise it is `theta/parse/array-no-common-type`". Rows a1/a2/f2/f4/f5
//     write exactly such a sink. Mirror: docs/reference/type-system.md.
//   - docs/spec_topics/type-system.md:56, TYPE-11 — an alias schema is transparent
//     in `⊑`. Row a2 spells the same union through a discriminated alias, so it
//     proves the TYPE-11 unfold reaches the NEW dispatch, matching the law bug
//     0157 landed at 0.180.0 (its `## Fix (0.180.0)`: the three sink dispatches
//     classify the alias-unfolded value). Its residual 2 names this surface as
//     the one it left open — "the `fn`-parameter surface still supplies no
//     element sink on either spelling … Open bug 0156's subject".
//   - Registry rows (DIAG-2, the closed authority on emissions):
//     docs/spec_topics/diagnostics/code-registry-parse.md:43
//     (`theta/parse/array-element-type-mismatch`), `:44`
//     (`theta/parse/array-no-common-type`, whose *Trigger* reads "and no sink
//     to narrow against" — which is why removing rows a1/a2's emission NARROWS
//     an emission set onto its own registered sentence and engages no DIAG-2
//     edit), `:59` (`theta/parse/let-rhs-type-mismatch`), `:136`
//     (`theta/parse/fn-arg-type-mismatch`), `:19`
//     (`theta/parse/binding-case-mismatch`).
//
// THE COUNT, AND WHY NO GATE. Route A makes rows e1/e2 draw TWO `E` codes where
// the argument position draws one today — the two-line shape the BINDING
// position already draws at row e4. Bug 0129 landed that law first (0.171.0)
// and this file cites it rather than forking a new one, verbatim from its
// `## Fix (0.171.0)`:
//
//   > Where a construct's own position-rule walk has already drawn an
//   > `E`-severity diagnostic refusing that construct as ILL-FORMED, a row whose
//   > verdict is DERIVED from reading the same construct as a well-formed type
//   > withholds, and the refusal fires alone.
//
// That law gates only where an earlier row refused a construct as ILL-FORMED.
// In rows e1/e2/e3 both codes read a WELL-FORMED array literal against a
// well-formed sink — the outer code's subject is the argument, the element
// code's subject is the offending index — so no construct was refused, the
// law's discriminating absence test does not even apply, and no gate is owed.
// The same reading 0129's own record states for bug 0157's pairs, and which
// 0157's `## Fix (0.180.0)` applied unchanged. The count therefore stands at
// two for e1/e2.
//
// TIER: unit, offline, deterministic, provider-free. Every claim below settles
// inside one `parseThetaDocument` call over a source string, so an integration
// or live tier would add a session round-trip to a parse-time observable and
// buy no reach. The one consequence that is NOT parse-local — whether the
// refused document becomes a slash command at all — is covered live in
// tests/live/fn-param-sink-array-literal-live-cell.test.ts.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74): no asserted
// message string is written out here. Every one is READ from the registry's
// *Message* column through `parseRegistry` / `registryMessage`
// (tools/code-registry/index.js) and the `msg` helper below, so a reworded
// template reds by naming the registry rather than by a bare string mismatch.
// No message assertion uses containment.
//
// ANTI-VACUITY. Every absence cell goes through `expectSilent`, which asserts
// the document's frontmatter parsed AND that the whole body walked to its
// expected statement count BEFORE reading the empty code list — so a truncated
// parse, a harness that stopped measuring, or a source whose fixture text
// silently changed shape cannot masquerade as silence. Group (g) additionally
// shows the harness reports at all on this file's own frontmatter shape.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. The registry lookup asserts its row's presence and
// each named placeholder before the template is filled.

const ELEMENT = "theta/parse/array-element-type-mismatch";
const NO_COMMON = "theta/parse/array-no-common-type";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const FN_ARG = "theta/parse/fn-arg-type-mismatch";
const UNRESOLVED_NAMED = "theta/parse/unresolved-named-type";
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

/** The aggregated diagnostic codes, in emission order. */
function codesOf(body: readonly string[]): string[] {
  return diagsOf(body).map((d: Diagnostic) => d.code);
}

/**
 * The load gate, mirroring `src/extension/production-composition.ts`'s
 * `const registered = !diagnostics.some((d) => d.severity === "error")` (in
 * `resolveCallableSet`'s caller) together with a parsed frontmatter: a theta
 * registers iff its frontmatter parsed and no diagnostic is error-severity.
 */
function registers(doc: ThetaDocument): boolean {
  return doc.frontmatter !== null && !doc.diagnostics.some((d) => d.severity === "error");
}

/**
 * The message reported for `code`, or `undefined` when no diagnostic carries it.
 * Selecting by code rather than by position keeps a message failure attributable
 * to its own row even where the code list is also wrong.
 */
function messageFor(diags: readonly Diagnostic[], code: string): string | undefined {
  return findCode(diags, code)?.message;
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

/** The pin's callee: a parameter whose element type is the union rule 3 asks about. */
const FN_UNION = "fn f(xs: array<A | B>): integer { 1 }";

/** The pin's argument: one `A` and one `B`, which have no LUB. */
const A_AND_B = '[A { a: 1 }, B { b: "x" }]';

// ===========================================================================
// (a) The pin — a union-typed parameter, rule-3 elements, no other sink.
//     Both cells are RED at HEAD with `theta/parse/array-no-common-type`
//     present where `[]` is owed, and both must go green under Route A.
// ===========================================================================

describe("0156 (a) — the `fn`-parameter type supplies the array-literal element sink", () => {
  it("a union-typed parameter admits its rule-3 literal and the theta registers — row a1", () => {
    // rule 3's admitting half, written at the sink `expressions.md:222` names
    // second of three. `array-no-common-type`'s registered *Trigger* requires
    // "no sink to narrow against"; a sink is written here, so the row's own
    // sentence excludes this emission.
    const body = [...AB, FN_UNION, `let y = f(${A_AND_B})`];
    expectSilent(
      body,
      4,
      "the callee declares `array<A | B>`, so a sink in scope expects the union rule 3 asks about",
    );
    expect(
      registers(docOf(body)),
      "the theta did not register: an `E`-severity diagnostic denied the load gate for a source rule 3 admits",
    ).toBe(true);
  });

  it("the discriminated-alias spelling of the same union admits, so the TYPE-11 unfold reaches the new dispatch — row a2", () => {
    // The alias twin. Bug 0157 (fixed 0.180.0) made the three WIRED dispatches
    // classify the alias-unfolded value; this cell is the same law at the
    // fourth, and is what proves the parameter dispatch is not added below the
    // unfold.
    const body = [
      "schema A {",
      '  kind: "a",',
      "  a: integer",
      "}",
      "schema B {",
      '  kind: "b",',
      "  b: string",
      "}",
      "schema U by kind = A | B",
      "fn f(xs: array<U>): integer { 1 }",
      'let y = f([A { kind: "a", a: 1 }, B { kind: "b", b: "x" }])',
    ];
    expectSilent(
      body,
      5,
      "the parameter's element type is a discriminated-union alias, which TYPE-11 makes transparent in `⊑`",
    );
    expect(
      registers(docOf(body)),
      "the alias-spelled twin did not register: the parameter sink is either unsupplied or classified before the TYPE-11 unfold",
    ).toBe(true);
  });
});

// ===========================================================================
// (b) The two WIRED sinks. Green at HEAD; they are the footing rows a1/a2 must
//     be brought onto, and a red here is over-reach rather than under-reach.
// ===========================================================================

describe("0156 (b) — the two sinks that already narrow must not move", () => {
  it("the binding-annotation sink carries the identical union — row b1", () => {
    expectSilent(
      [...AB, `let xs: array<A | B> = ${A_AND_B}`],
      3,
      "the typed-`let` arm supplies the annotation's element type as the sink",
    );
  });

  it("the constructor-field sink carries the identical union — row b2", () => {
    expectSilent(
      [...AB, "schema S {", "  xs: array<A | B>", "}", `let s = S { xs: ${A_AND_B} }`],
      4,
      "`checkObjectField` supplies the declared field type's element as the sink",
    );
  });

  it("a constructor-field sink reached INSIDE an argument still narrows — row b4", () => {
    // This isolates the defect to the ARGUMENT POSITION rather than to argument
    // NESTING: one level inside an argument, the wired field sink works.
    expectSilent(
      [
        ...AB,
        "schema S {",
        "  xs: array<A | B>",
        "}",
        "fn f(s: S): integer { 1 }",
        `let y = f(S { xs: ${A_AND_B} })`,
      ],
      5,
      "the field sink one level inside an argument is a wired dispatch and is unaffected by the argument position",
    );
  });
});

// ===========================================================================
// (c) The narrowing — a literal with an LUB of its own needs no sink at all.
//     Bug 0081's fix (0.83.0) closed this half; these cells bound the claim to
//     rule 3's no-LUB case and must not be re-derived through the new sink.
// ===========================================================================

describe("0156 (c) — literals that compute their own LUB stay silent", () => {
  it("a heterogeneous primitive literal under a union parameter admits under rule 2 — row c1", () => {
    expectSilent(
      ["fn f(xs: array<string | null>): integer { 1 }", 'let y = f(["a", null])'],
      2,
      "`commonType` computes `string | null` with no sink consulted (bug 0081, fixed 0.83.0)",
    );
  });

  it("the number/string spelling of the same LUB admits — row c2", () => {
    expectSilent(
      ["fn f(xs: array<number | string>): integer { 1 }", 'let y = f([1, "a"])'],
      2,
      "the union LUB is computed by the literal, not supplied by the parameter",
    );
  });

  it("the same literal with NO parameter anywhere answers identically — row c3", () => {
    expectSilent(
      ['let x = ["a", null]'],
      1,
      "no sink exists at all here, so the silence is the LUB's and not any sink's",
    );
  });

  it("two elements of ONE schema admit one clause earlier — row c4", () => {
    expectSilent(
      [...AB, FN_UNION, "let y = f([A { a: 1 }, A { a: 2 }])"],
      4,
      "`commonType`'s dominating-branch clause answers before rule 3 is reached",
    );
  });

  it("a single-element literal admits for the same reason — row c5", () => {
    expectSilent(
      [...AB, FN_UNION, 'let y = f([B { b: "x" }])'],
      4,
      "one branch dominates trivially",
    );
  });

  it("the empty literal has no branches to reconcile — row c6", () => {
    expectSilent(
      [...AB, FN_UNION, "let y = f([])"],
      4,
      "`checkCommonType` returns before the LUB is computed on fewer than two branches",
    );
  });
});

// ===========================================================================
// (d) Rule 3's sink-less refusals — the two directions the fix must NOT move.
//     Both keep the registry *Message* verbatim and both keep denying the load.
// ===========================================================================

describe("0156 (d) — the sink-less refusals stay exactly where the spec puts them", () => {
  it("no sink anywhere keeps the refusal inside its own registered Trigger — row d1", () => {
    // `expressions.md:228` is the only sink-less rejection the array rules
    // prescribe. This is bug 0081's witness cell r7 and the tripwire proving
    // the union arm is gated on branch kinds rather than applied blanket.
    const body = [...AB, `let x = ${A_AND_B}`];
    const diags = diagsOf(body);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([NO_COMMON]);
    expect(messageFor(diags, NO_COMMON)).toBe(msg(NO_COMMON, []));
    expect(
      registers(docOf(body)),
      "the sink-less rule-3 refusal stopped denying the load gate — bug 0081's r7 disposition moved",
    ).toBe(false);
  });

  it("an UNANNOTATED parameter declares no type to be a sink — row d2", () => {
    // The boundary on the other side of the pin: `annotationToCompatType` has
    // nothing to convert at this index, so the refusal is correct here.
    const body = [...AB, "fn f(xs): integer { 1 }", `let y = f(${A_AND_B})`];
    const diags = diagsOf(body);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([NO_COMMON]);
    expect(messageFor(diags, NO_COMMON)).toBe(msg(NO_COMMON, []));
    expect(
      registers(docOf(body)),
      "an unannotated parameter began supplying a sink — the fix reached past the declared parameter types",
    ).toBe(false);
  });
});

// ===========================================================================
// (e) Rule 1 in force at the argument position — Route A's measured
//     consequence, and the row that makes the route a choice rather than a
//     mechanical wiring.
// ===========================================================================

describe("0156 (e) — with a sink in scope, rule 1 names the offending element", () => {
  it("a mismatched element under an `array<A>` parameter draws the ELEMENT code, not the sink-less one — row e3", () => {
    // Rule 1: "a mismatch is `theta/parse/array-element-type-mismatch` naming
    // the offending element". Today this reports the sink-LESS code, which
    // tells the author the elements have no common type — true, but not the
    // reason the call is wrong, and whose prescribed remedy (annotate a binding
    // with `array<A | B>`) would not make the call legal. ONE code: the outer
    // `fn-arg-type-mismatch` judgement is withheld here because the argument's
    // reduction is unprovable, exactly as at HEAD.
    const diags = diagsOf([...AB, "fn f(xs: array<A>): integer { 1 }", `let y = f(${A_AND_B})`]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "A"],
        ["<actual>", "B"],
      ]),
    );
  });

  it("a homogeneous mistyped literal draws the argument code THEN the element code — row e1", () => {
    // The count consequence, ordered: the argument position takes on the
    // BINDING position's two-line shape (row e4 below). Bug 0129's landed law
    // (`## Fix (0.171.0)`) gates only where an earlier row refused a construct
    // as ILL-FORMED; both codes here read a well-formed literal against a
    // well-formed sink, each earning its own verdict on its own subject, so no
    // gate applies and the count stands at two.
    const diags = diagsOf(["fn f(xs: array<string>): integer { 1 }", "let y = f([1, 2])"]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([FN_ARG, ELEMENT]);
    expect(messageFor(diags, FN_ARG)).toBe(
      msg(FN_ARG, [
        ["<name>", "f"],
        ["<i>", "0"],
        ["<param>", "xs"],
        ["<expected>", "array<string>"],
        ["<actual>", "array<integer>"],
      ]),
    );
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "0"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    );
  });

  it("a heterogeneous mistyped literal draws the same ordered pair, naming index 1 — row e2", () => {
    const diags = diagsOf(["fn f(xs: array<string>): integer { 1 }", 'let y = f(["a", 1])']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([FN_ARG, ELEMENT]);
    expect(messageFor(diags, FN_ARG)).toBe(
      msg(FN_ARG, [
        ["<name>", "f"],
        ["<i>", "0"],
        ["<param>", "xs"],
        ["<expected>", "array<string>"],
        ["<actual>", "array<string | integer>"],
      ]),
    );
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    );
  });

  it("the BINDING twin's two-code shape is unchanged — row e4", () => {
    // The shape rows e1/e2 are brought onto. Green at HEAD; a red here means
    // the fix moved the binding route while wiring the argument route.
    const diags = diagsOf(['let xs: array<string> = ["a", 1]']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([LET_RHS, ELEMENT]);
    expect(messageFor(diags, LET_RHS)).toBe(
      msg(LET_RHS, [
        ["<name>", "xs"],
        ["<expected>", "array<string>"],
        ["<actual>", "array<string | integer>"],
      ]),
    );
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    );
  });

  it("a ternary at the same argument position keeps drawing nothing — row e5", () => {
    // Open bug 0155's facet, not this one's: no ternary reaches
    // `checkCommonType` at all. No fix here may wire a ternary caller.
    expectSilent(
      [...AB, "fn f(x: A | B): integer { 1 }", 'let y = f(true ? A { a: 1 } : B { b: "x" })'],
      4,
      "the ternary arm of `walkExpr` is bug 0155's subject and is disjoint from the `call` arm",
    );
  });
});

// ===========================================================================
// (f) Where the refusal reaches — the population Route A closes, and the
//     positions whose sinks belong to other rows.
// ===========================================================================

describe("0156 (f) — the reach of the refusal, and its bounds", () => {
  it("the workaround the Message prescribes keeps loading — row f1", () => {
    // The cost the report measures: the author must introduce a binding the
    // program did not need, purely to carry an annotation the callee already
    // declares. It must keep working after the fix removes the need for it.
    expectSilent(
      [...AB, FN_UNION, `let xs: array<A | B> = ${A_AND_B}`, "let y = f(xs)"],
      5,
      "the binding-annotation workaround is the wired sink and is unaffected",
    );
  });

  it("a union parameter at index 1 of two supplies its sink — row f2", () => {
    expectSilent(
      [...AB, "fn f(n: integer, xs: array<A | B>): integer { 1 }", `let y = f(1, ${A_AND_B})`],
      4,
      "the sink is taken per MATCHED index, so a non-first parameter supplies it too",
    );
  });

  it("a call inside an `fn` body supplies its sink — row f4", () => {
    expectSilent(
      [...AB, FN_UNION, `fn g(): integer { f(${A_AND_B}) }`],
      4,
      "the `call` arm of `walkExpr` is the same arm inside a function body",
    );
  });

  it("two calls each supply their own sink — row f5", () => {
    // The per-argument `skipArray` (§Fix constraint 2) must not be a single
    // shared slot: two calls in one document must both narrow.
    expectSilent(
      [...AB, FN_UNION, `let y = f(${A_AND_B})`, 'let z = f([A { a: 2 }, B { b: "y" }])'],
      5,
      "each `walkExpr` invocation carries its own argument's skip, so neither call leaks the other's",
    );
  });

  it("a stdlib method-call argument keeps its refusal — row f6", () => {
    // §Non-goals: `checkMethodCall`'s sink belongs to another row, and
    // `checkFnCallArgs`'s resolution ladder returns before reaching it.
    const diags = diagsOf([...AB, 'let s = "ab"', `let y = s.split(${A_AND_B})`]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([NO_COMMON]);
    expect(messageFor(diags, NO_COMMON)).toBe(msg(NO_COMMON, []));
  });

  it("an `invoke` argument keeps its refusal — row f7", () => {
    // §Non-goals: `theta/parse/invoke-arg-type-mismatch` is open bug 0137's row.
    const diags = diagsOf([...AB, `let y = @sub(${A_AND_B})`]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([UNRESOLVED_NAMED, NO_COMMON]);
    expect(messageFor(diags, UNRESOLVED_NAMED)).toBe(msg(UNRESOLVED_NAMED, [["<name>", "sub"]]));
    expect(messageFor(diags, NO_COMMON)).toBe(msg(NO_COMMON, []));
  });
});

// ===========================================================================
// (g) The boundaries. Each is a place the sink must NOT appear, and the
//     nested pair is a class this fix visibly does not own.
// ===========================================================================

describe("0156 (g) — the boundaries of the new dispatch", () => {
  it("a locally-shadowed callee supplies no sink — the shadowing boundary", () => {
    // `checkFnCallArgs`'s resolution ladder returns on a locally-shadowed
    // callee BEFORE any parameter type is resolved, so no sink exists to hand
    // down and rule 3's sink-less refusal is correct here.
    const diags = diagsOf([...AB, FN_UNION, "let f = 1", `let y = f(${A_AND_B})`]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([NO_COMMON]);
    expect(messageFor(diags, NO_COMMON)).toBe(msg(NO_COMMON, []));
  });

  it("an argument past the parameter list supplies no sink — the arity boundary", () => {
    // Bug 0131's fix changed this cell's own reading. `FN_UNION` declares ONE
    // parameter, and the call below supplies two arguments, so
    // `checkFnCallArgs` now runs `checkFnCallArity` BEFORE
    // `Math.min(e.args.length, fn.params.length)`'s per-argument loop
    // (invocation.md §Argument arity) and returns on the too-many verdict —
    // neither argument ever reaches the sink dispatch this fix wires, so BOTH
    // array literals read sink-less, not just the excess one. The list is
    // therefore the arity row followed by one `array-no-common-type` per
    // literal, in source order; arity itself is still a different row from
    // this fix's own subject and this cell records its boundary, not its
    // ownership (§Non-goals).
    const diags = diagsOf([
      ...AB,
      FN_UNION,
      `let y = f(${A_AND_B}, [A { a: 2 }, B { b: "y" }])`,
    ]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([
      "theta/parse/fn-arity-too-many",
      NO_COMMON,
      NO_COMMON,
    ]);
    expect(messageFor(diags, "theta/parse/fn-arity-too-many")).toBe(
      msg("theta/parse/fn-arity-too-many", [
        ["<name>", "f"],
        ["<required>", "1"],
        ["<provided>", "2"],
      ]),
    );
    // Both refusals are pinned by message and by column, not merely by code:
    // the columns are what distinguish "each literal was refused at its own
    // range" from "one literal was refused twice".
    const sinkLess = diags.filter((d: Diagnostic) => d.code === NO_COMMON);
    expect(sinkLess.map((d: Diagnostic) => d.message)).toEqual([
      msg(NO_COMMON, []),
      msg(NO_COMMON, []),
    ]);
    expect(
      sinkLess.map((d: Diagnostic) => d.range?.start.column),
      "the two refusals do not sit at the two argument literals' own ranges",
    ).toEqual([11, 39]);
  });

  it("a nested array sink narrows neither at the argument route nor at the binding route — the nested boundary", () => {
    // PAIRED, and deliberately not "fixed" here. `docs/spec_topics/grammar.md:221`'s
    // fourth sink bullet — recursive descent into an array-typed sink's element
    // — is unwired at EVERY route, which is why the BINDING control below is
    // refused identically at HEAD. The class is symmetric and therefore not
    // this fix's; a route that closed only the argument half would make the two
    // routes disagree.
    //
    // The 0156 doc's §Expected sentence "Rows f2–f5 should report `[]`" is
    // FALSIFIED for its row f3 by the binding control in this same cell: f3's
    // inner literal has no sink at either spelling, so `[]` is not what f3 is
    // owed and f3 is not a must-flip row.
    const argumentRoute = diagsOf([
      ...AB,
      "fn f(xs: array<array<A | B>>): integer { 1 }",
      `let y = f([${A_AND_B}])`,
    ]);
    expect(argumentRoute.map((d: Diagnostic) => d.code)).toEqual([NO_COMMON]);
    expect(messageFor(argumentRoute, NO_COMMON)).toBe(msg(NO_COMMON, []));

    const bindingRoute = diagsOf([...AB, `let xs: array<array<A | B>> = [${A_AND_B}]`]);
    expect(
      bindingRoute.map((d: Diagnostic) => d.code),
      "the binding route stopped refusing the nested literal — the symmetry that puts this class outside bug 0156 is broken",
    ).toEqual([NO_COMMON]);
    expect(messageFor(bindingRoute, NO_COMMON)).toBe(msg(NO_COMMON, []));
  });
});

// ===========================================================================
// (h) Anti-vacuity — the harness reaches the checkers and reports.
// ===========================================================================

describe("0156 (h) — the harness reaches the checkers", () => {
  it("reports on a non-conformant binding name and stays silent on the conformant twin", () => {
    const diags = diagsOf(["let Xs = 1"]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([BINDING_CASE]);
    expect(messageFor(diags, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
    expect(codesOf(["let xs = 1"])).toEqual([]);
  });
});
