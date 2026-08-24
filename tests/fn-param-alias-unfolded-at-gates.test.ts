import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { findCode, parseDoc } from "./helpers/e2e-s1";

// Bug 0089 — an alias-typed `fn` parameter and the two structural gates that
// must read it through TYPE-11 rather than as an opaque `named L`
// (docs/bugs/0089-fn-param-alias-not-unfolded-iterand-join.md).
//
// `walkFn` (src/parser/type-layer-checks.ts) records the declared parameter type
// raw, which is a correct record — it is what the author declared, and §Non-goals
// keeps it that way. The obligation these rows lock sits at the consumption
// sites: every classifier that decides a structural question about that record
// resolves the name through the `TypeEnv` and continues on the alias right-hand
// side, so an alias reaches the same disposition its right-hand side does. Two
// gates would answer in opposite directions if they read `type.kind` raw — the
// iterand gate would reject a program the spec admits, the `array.join` element
// gate would drop a rejection the spec requires — so each carries its own rows
// below.
//
// THE UNFOLDING SITES. Each is an independent `kind === "array"` test over a
// separately-derived value, so each carries its own rows: a tree that unfolds at
// one site and not the rest reds only the rows of the sites it left raw.
//   1. Gate 1 — `checkForIterand` (src/parser/control-flow.ts). It takes the
//      `TypeEnv` as a third parameter and unfolds `iterand.type` once, so the
//      unfolded value drives the `kind` test AND the `displayType` render — the
//      registry *Message* template renders the type the gate decided on.
//      `ForIterand` carries the type alone and the `TypeEnv` arrives as a
//      parameter, so both call sites (`walkStmt`'s `case "for"` and `walkExpr`'s
//      `case "par-for"`, which already hold `this.env`) are covered at once.
//      Rows: a1/a4/a5 (the unfold), a6/a7/e1/e3/e4/e5 (its bounds).
//   2. Gate 2 — the `array.join` element gate in `checkMethodCall`
//      (src/parser/type-layer-checks.ts). Two unfoldings, one per level, because
//      the guard and the predicate each test a `kind` of their own:
//        * the RECEIVER, so an alias of `array<T>` reaches the element test at
//          all instead of being taken for a non-array and deferred;
//        * the ELEMENT handed to `checkArrayJoin` (src/runtime/stdlib-array.ts),
//          which admits only a `prim` `string` or a `string`-typing literal and
//          holds no `TypeEnv` of its own — a pure predicate, so its caller owes
//          it a TYPE-11-transparent element.
//      `pushUnknownMethod` keeps the RAW receiver type, so the `unknown-method`
//      message still renders the declared name.
//      Rows: b1 (the receiver level), b2/b3/b4/e2 (its bounds), b5–b8 (the
//      element level), b9–b13 (its bounds), c1 (the raw-render invariant).
//   3. The loop-variable element derivation, in two files. `walkExpr`'s
//      `case "par-for"` binds the loop variable from the unfolded iterand's
//      element (src/parser/type-layer-checks.ts), which is what body checks
//      resolve; `StaticTypeInferencePass` derives the same element again
//      (src/parser/static-type-inference.ts), which is what types the `par for`
//      VALUE (`TypeLayerWalk.typeOf` delegates to that pass).
//      Rows: d1 (the body scope), s1 (the value type), with d2/d3/s2/s3 as
//      bounds. s1 is the only row that reaches the second file.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/type-system.md:54 TYPE-11 — a `NamedType` declared by a
//     type-alias schema `schema X = R` "is **transparent** in `⊑`: on whichever
//     side of a `T₁ ⊑ T₂` check it appears, it is replaced by its right-hand
//     side `R` and the check re-evaluated, recursing through nested aliases
//     until a non-alias form is reached". `L` declared `array<string>` IS
//     `array<string>`, in a parameter position as anywhere else.
//   - docs/spec_topics/type-system.md:52 TYPE-10 — an object-schema `named`
//     stays nominal, and TYPE-11 "never reopens TYPE-10's nominal case". This
//     bounds the unfolding: an object schema and an alias of one are not
//     iterable.
//   - docs/spec_topics/control-flow.md:13 §`for` / `in` — "The expression after
//     `in` must have type `array<T>` for some `T`; iterating strings, objects,
//     or numbers is `theta/parse/non-array-iterand`". An alias of
//     `array<string>` has type `array<string>` and is none of the three named
//     populations.
//   - docs/spec_topics/control-flow.md:70 — "`par for` reuses the `for` iterand
//     contract unchanged", and :76 CTRL-4 makes `par for` legal in a
//     prompt-mode theta, so every `par for` body below is source-reachable.
//   - docs/spec_topics/expressions.md:108 (`array<T>` stdlib table, `join` row)
//     — "Element type must be `string`; non-string element types are
//     `theta/parse/non-string-array-join` (no implicit type conversion in theta
//     1.0)". `L` declared `array<integer>` has a non-string element type.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:64 — the registered
//     *Trigger* for `theta/parse/non-array-iterand` is "`for x in expr` where
//     `expr` is not `array<T>`". Under TYPE-11 an alias-of-array `expr` IS
//     `array<T>`, so an emission there sits outside the registered trigger.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:43 — the registered
//     *Trigger* for `theta/parse/non-string-array-join` is "`arr.join(...)`
//     invoked on an array whose element type is not `string`". Under TYPE-11 an
//     alias element declared `string` IS `string`, so the element type of
//     `array<E>` with `schema E = string` is `string` and an emission there sits
//     outside the registered trigger too — the same obligation as :64, one level
//     down.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 DIAG-2 — the registry
//     is closed. Every code asserted below is already registered at the position
//     it fires from; the fix moves both codes onto their registered triggers —
//     `non-array-iterand` withdrawn from an alias-of-array iterand,
//     `non-string-array-join` restored at an alias receiver and withdrawn from an
//     alias element that is `string`.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74) — every asserted
// message string is sourced from the registry *Message* column, cited in a
// comment immediately above the literal, never copied from a rule's home page.
//
// RED / GREEN LEDGER, stated against a tree with the unfolding removed at one
// site at a time — each site is neutralised on its own, so a row's red is
// attributable to the site it names. Removing it at gate 1 reds a1, a4, a5 and
// the message halves of e3 and e4, plus d1 and s1 in full — sites 3a and 3b's
// own correctness is observable only once gate 1 has admitted the iterand, so
// removing gate 1's unfold prepends a spurious `non-array-iterand` ahead of
// the diagnostic each row already asserts; at gate 2's receiver level, b1
// and b9 in full — b9's receiver is itself the alias `L`, so losing the
// receiver unfold turns the whole `array.join` branch away rather than
// narrowing one element, dropping its code list to empty instead of only its
// rendered type; at gate 2's element level, b5, b6, b7, b8 and the message
// halves of b9 and b10; at the walk's element derivation, d1; at the typing
// pass's, the message half of s1. Every other row holds under all four
// neutralisations — a2/a3, b2/b3, d2/d3 and s2 are the controls proving each
// checker fires at all on this harness (a3, b3 and d3 through the `let`
// route, which records the declared annotation in TYPE-11-transparent form
// and so reaches both gates with an array); a6/a7/e1/e2/e5/s3 and
// b11/b12/b13 are the dispositions the unfolding must not move, which is
// what bounds it; c1–c4 are the classifiers that resolve the same parameter
// record through the `TypeEnv` anyway, which is what makes a red in group
// (a) or (b) attributable to the gate rather than to a parameter type that
// never resolved; and n1 pins the widening bug 0126 adjudicated — a plain
// `for` body reports what its `par for` sibling `d1` does.
//
// ANTI-VACUITY. Twenty-five of the thirty-six rows expect a non-empty code list,
// so a harness that stopped reaching the type layer (a frontmatter refusal, an
// unfed static-type pass) fails loudly here rather than turning the
// `toEqual([])` rows into silent passes. Every code assertion is an ordered
// whole-list equality on the aggregated codes, so a spurious extra diagnostic
// cannot hide inside a containment check.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a source string. An integration tier would
// add a session round-trip to a parse-time observable and buy no reach; a live
// tier would make a static, fully determined observable stochastic.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips.

// --- production parse harness ----------------------------------------------
//
// `parseDoc` (tests/helpers/e2e-s1.ts) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is
// stubbed: the type layer under assertion is the production one.

/** The frontmatter every body below is parsed under. */
const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];

/** The diagnostics the production parse reports for `body`, in emission order. */
function diagsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics;
}

/** The aggregated diagnostic codes, in emission order. */
function codesOf(body: readonly string[]): string[] {
  return diagsOf(body).map((d: Diagnostic) => d.code);
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
 * The recurring iterand body: one `fn` whose single parameter is declared `t`,
 * iterated with `kw` (`for` or `par for`) over a body of one statement. The
 * trailing `1` supplies the theta's final value.
 */
function ITER(t: string, kw = "for", body = "x"): string[] {
  return [`fn f(xs: ${t}) {`, `  ${kw} x in xs {`, `    ${body}`, "  }", "}", "1"];
}

/** The recurring join body: one `fn` whose declared parameter is joined. */
function JOIN(t: string): string[] {
  return [`fn f(xs: ${t}): string {`, '  xs.join(",")', "}", "1"];
}

/**
 * The `par for` VALUE body: the loop's result is bound and then a method is
 * called on it, so the assertion reads the element type the whole-program typing
 * pass derived rather than the one the walk bound into the body scope.
 */
function PAR_VALUE(t: string): string[] {
  return [
    `fn f(xs: ${t}) {`,
    "  let r = par for x in xs {",
    "    x",
    "  }",
    "  r.frobnicate()",
    "}",
    "1",
  ];
}

/** An object schema — the TYPE-10 nominal population the unfolding must not move. */
const OBJECT_SCHEMA: readonly string[] = ["schema P {", "  a: string", "}"];

// ===========================================================================
// (a) The iterand gate rejects a spec-legal program.
// ===========================================================================

describe("0089 (a) — an alias-of-array `fn` parameter is a legal `for` iterand", () => {
  it("a1: `schema L = array<string>` with `fn f(xs: L) { for x in xs { … } }` loads", () => {
    // The reported direction. TYPE-11 makes `L` and `array<string>` the same
    // type, so control-flow.md:13's `array<T>` requirement is met and the
    // registered trigger (code-registry-parse.md:64, "`expr` is not
    // `array<T>`") does not describe this program. The code is `E` severity
    // (code-registry-parse.md:64, *Severity* column), and
    // `parseDiscoveredTheta` drops any theta carrying an error-severity
    // `theta/parse/*` diagnostic (its `hasLoadParseError` guard,
    // src/extension/production-composition.ts), so this row is a load failure
    // rather than a warning.
    expect(
      codesOf(["schema L = array<string>", ...ITER("L")]),
      "TYPE-11 + control-flow.md:13 — an alias of `array<string>` IS `array<T>`, so the registered `non-array-iterand` trigger does not cover it",
    ).toEqual([]);
  });

  it("a2: the same body over a concrete `array<string>` parameter loads (control)", () => {
    // a1 and a2 differ only in whether the parameter type is named. This row is
    // what makes a1's red attributable to the alias rather than to the `fn`
    // parameter boundary being blind.
    expect(
      codesOf(ITER("array<string>")),
      "control-flow.md:13 — a concrete `array<string>` iterand is the legal `for ... in` form",
    ).toEqual([]);
  });

  it("a3: the same alias through a `let` binding loads (control — the `let` route)", () => {
    // The `let` arm records the annotation in TYPE-11-transparent form
    // (src/parser/type-layer-checks.ts:641–644), so the gate already sees
    // `array<string>` on this route. The two routes must agree: an author's
    // choice between a parameter and a binding is not a typing question.
    expect(
      codesOf([
        "schema L = array<string>",
        'let e: L = ["a"]',
        "for x in e {",
        "  x",
        "}",
        "1",
      ]),
      "TYPE-11 — the `let` route reaches the same gate with the same alias and must reach the same disposition",
    ).toEqual([]);
  });

  it("a4: the same alias at the `par for` iterand loads (the second `checkForIterand` call site)", () => {
    // control-flow.md:70 — "`par for` reuses the `for` iterand contract
    // unchanged" — and `walkExpr`'s `case "par-for"`
    // (src/parser/type-layer-checks.ts) calls `checkForIterand` from its own
    // site, so it needs its own row rather than inheriting a1's. Unfolding
    // inside the function covers both sites.
    expect(
      codesOf(["schema L = array<string>", ...ITER("L", "par for")]),
      "control-flow.md:70 — `par for` reuses the `for` iterand contract, so TYPE-11 applies at that call site too",
    ).toEqual([]);
  });

  it("a5: a nested alias chain unfolds to the array (`schema M = array<string>` / `schema L = M`)", () => {
    // TYPE-11 recurses "through nested aliases until a non-alias form is
    // reached", so one hop is not enough to satisfy the rule. This row pins the
    // chain walk rather than a single dereference.
    expect(
      codesOf(["schema M = array<string>", "schema L = M", ...ITER("L")]),
      "TYPE-11 — unfolding recurses through nested aliases until a non-alias form is reached",
    ).toEqual([]);
  });

  it("a6: an object-schema parameter stays non-iterable and names itself (TYPE-10)", () => {
    // TYPE-10 keeps an object-schema `named` nominal, and TYPE-11 "never
    // reopens TYPE-10's nominal case". A nominal type is not `array<T>`, so the
    // gate must keep rejecting AND keep rendering the schema name — this row
    // pins the unfolding to the alias form instead of letting it dissolve every
    // declared name.
    const diags = diagsOf([...OBJECT_SCHEMA, ...ITER("P")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-10 — an object-schema `named` is nominal, so it is not `array<T>` and stays outside `for ... in`",
    ).toEqual(["theta/parse/non-array-iterand"]);
    // Message from code-registry-parse.md:64
    // (`'for' expects array<T> after 'in'; got <type>`).
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "TYPE-10 — an object schema does not unfold, so the rendered type is the schema name",
    ).toBe("'for' expects array<T> after 'in'; got P");
  });

  it("a7: a `string` parameter stays non-iterable (the registered trigger)", () => {
    // code-registry-parse.md:64 names strings, objects and numbers as the
    // trigger population, and control-flow.md:13 directs the author to
    // `s.split(...)`. The unfolding must not widen what the gate admits.
    const diags = diagsOf(ITER("string"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:64 trigger — a `string` iterand is not `array<T>`",
    ).toEqual(["theta/parse/non-array-iterand"]);
    // Message from code-registry-parse.md:64
    // (`'for' expects array<T> after 'in'; got <type>`).
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "code-registry-parse.md:64 — the *Message* column renders the offending iterand type",
    ).toBe("'for' expects array<T> after 'in'; got string");
  });
});

// ===========================================================================
// (b) The join element gate loses a spec-required rejection.
// ===========================================================================

describe("0089 (b) — an alias-of-array `fn` parameter reaches the `array.join` element gate", () => {
  it("b1: `schema L = array<integer>` with `fn f(xs: L): string { xs.join(\",\") }` reports the non-string element type", () => {
    // The second reported direction, opposite to (a) because the gate runs the
    // element check only for `kind === "array"`: an unrecognised shape DEFERS.
    // expressions.md:108 prescribes the rejection for a non-string element
    // type, and TYPE-11 makes `L`'s element the declared `integer`. The runtime
    // performs `Array.prototype.join` unconditionally on the stated parse-time
    // precondition (src/runtime/stdlib-array.ts:63–67), so a deferral here is
    // the implicit conversion expressions.md:108 says theta 1.0 does not do.
    const diags = diagsOf(["schema L = array<integer>", ...JOIN("L")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:108 `join` row — a non-string element type is `theta/parse/non-string-array-join`, and TYPE-11 makes `L`'s element `integer`",
    ).toEqual(["theta/parse/non-string-array-join"]);
    // Message from code-registry-parse.md:43
    // (`array.join requires a string element type; got array<<element>>`).
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "code-registry-parse.md:43 — the *Message* column renders the offending element type, which unfolding supplies as `integer`",
    ).toBe("array.join requires a string element type; got array<integer>");
  });

  it("b2: the same join over a concrete `array<integer>` parameter reports it (control)", () => {
    // b1 and b2 differ only in whether the parameter type is named, so this row
    // is what makes b1's red attributable to the alias rather than to an absent
    // element check.
    const diags = diagsOf(JOIN("array<integer>"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:108 `join` row — a concrete `array<integer>` receiver has a non-string element type",
    ).toEqual(["theta/parse/non-string-array-join"]);
    // Message from code-registry-parse.md:43
    // (`array.join requires a string element type; got array<<element>>`).
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "code-registry-parse.md:43 — the rendered element type is invariant across the two routes",
    ).toBe("array.join requires a string element type; got array<integer>");
  });

  it("b3: the same alias through a `let` binding reports it (control — the `let` route)", () => {
    // The `let` route already carries the transparent annotation into the gate,
    // so this row fixes the disposition the parameter route must match.
    const diags = diagsOf(["schema L = array<integer>", "let e: L = [1]", 'e.join(",")']);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 + expressions.md:108 — the `let` route reaches the same gate and rejects, so the parameter route must too",
    ).toEqual(["theta/parse/non-string-array-join"]);
    // Message from code-registry-parse.md:43
    // (`array.join requires a string element type; got array<<element>>`).
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "code-registry-parse.md:43 — the rendered element type is the declared `integer` on either route",
    ).toBe("array.join requires a string element type; got array<integer>");
  });

  it("b4: an alias of `array<string>` joins", () => {
    // The disposition is silence either way, but the reason is what this row
    // guards: unfolding must reach `checkArrayJoin`
    // (src/runtime/stdlib-array.ts:100) and PASS its `string` element test,
    // not skip the gate. b1 and b4 together pin that the gate DECIDES on an
    // alias receiver rather than defers on it.
    expect(
      codesOf(["schema L = array<string>", ...JOIN("L")]),
      "expressions.md:108 `join` row — a `string` element type is admissible, and TYPE-11 makes `L`'s element `string`",
    ).toEqual([]);
  });
});

// ===========================================================================
// (b cont.) The element the join gate hands `checkArrayJoin` is itself subject
//           to TYPE-11.
// ===========================================================================

describe("0089 (b cont.) — the `array.join` element predicate decides on the unfolded ELEMENT type", () => {
  it("b5: an alias of `array<alias-of-string>` joins (`schema E = string` / `schema L = array<E>`)", () => {
    // Unfolding the receiver is what brings the element test into reach, and
    // `checkArrayJoin` (src/runtime/stdlib-array.ts) admits only a `prim`
    // `string` or a `string`-typing literal — it tests the element's `kind`
    // raw, one level down from the receiver. Under TYPE-11 `E` declared
    // `string` IS `string`, so `array<E>`'s element type IS `string` and the
    // code-registry-parse.md:43 *Trigger* — "an array whose element type is not
    // `string`" — does not describe this receiver. The code is `E` severity, so
    // an emission here is a load failure rather than a warning.
    expect(
      codesOf(["schema E = string", "schema L = array<E>", ...JOIN("L")]),
      "TYPE-11 + code-registry-parse.md:43 trigger — `E` declared `string` IS `string`, so `array<E>`'s element type is `string` and the registered trigger does not cover it",
    ).toEqual([]);
  });

  it("b6: a concrete `array<alias-of-string>` parameter joins (the same element with a concrete receiver)", () => {
    // b5 and b6 differ only in whether the RECEIVER is named; the element is the
    // alias in both. The element test is one line with one caller and cannot
    // hold for one spelling of its input and not the other, so this row must
    // reach b5's disposition.
    expect(
      codesOf(["schema E = string", ...JOIN("array<E>")]),
      "TYPE-11 + expressions.md:108 `join` row — the element obligation is a question about the element type, not about how the receiver was spelled",
    ).toEqual([]);
  });

  it("b7: the same alias element through a `let` binding joins (the `let` route)", () => {
    // The `let` arm records the annotation in TYPE-11-transparent form, which
    // makes the RECEIVER an `array` on this route — and leaves the element the
    // alias `E`. So this route reaches the element test too, and must reach b5's
    // disposition: an author's choice between a parameter and a binding is not a
    // typing question.
    expect(
      codesOf([
        "schema E = string",
        "schema L = array<E>",
        'let e: L = ["a"]',
        'e.join(",")',
      ]),
      "TYPE-11 — the `let` route reaches the same element test with the same alias element and must reach the same disposition",
    ).toEqual([]);
  });

  it("b8: a nested element alias chain unfolds to `string` (`schema E = string` / `schema F = E`)", () => {
    // TYPE-11 recurses "through nested aliases until a non-alias form is
    // reached", at the element position as at the receiver position. One hop is
    // not enough to satisfy the rule.
    expect(
      codesOf(["schema E = string", "schema F = E", ...JOIN("array<F>")]),
      "TYPE-11 — unfolding the element recurses through nested aliases until a non-alias form is reached",
    ).toEqual([]);
  });

  it("b9: an alias of `array<alias-of-integer>` reports the non-string element type", () => {
    // The counterpart of b5: unfolding narrows the emission to the registered
    // trigger, it does not remove it. `E` declared `integer` is `integer`, which
    // is the expressions.md:108 non-string population, so the rejection stands —
    // and the rendered element is the value the predicate decided on.
    const diags = diagsOf(["schema E = integer", "schema L = array<E>", ...JOIN("L")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:108 `join` row — TYPE-11 makes `E` `integer`, which is a non-string element type",
    ).toEqual(["theta/parse/non-string-array-join"]);
    // Message from code-registry-parse.md:43
    // (`array.join requires a string element type; got array<<element>>`).
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "code-registry-parse.md:43 — the *Message* column renders the offending element type, which under TYPE-11 is `integer`",
    ).toBe("array.join requires a string element type; got array<integer>");
  });

  it("b10: a concrete `array<alias-of-integer>` parameter reports it with the unfolded element", () => {
    // b9 and b10 differ only in whether the receiver is named, so this row is
    // what makes b9's rendered element attributable to the element unfolding
    // rather than to the receiver unfolding.
    const diags = diagsOf(["schema E = integer", ...JOIN("array<E>")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:108 `join` row — an alias element declared `integer` is a non-string element type on either receiver spelling",
    ).toEqual(["theta/parse/non-string-array-join"]);
    // Message from code-registry-parse.md:43
    // (`array.join requires a string element type; got array<<element>>`).
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "code-registry-parse.md:43 — the rendered element type is invariant across the two receiver spellings",
    ).toBe("array.join requires a string element type; got array<integer>");
  });

  it("b11: an object-schema element stays non-string and names itself (TYPE-10)", () => {
    // TYPE-10 bounds the element unfolding exactly as it bounds gate 1's: an
    // object-schema `named` comes back from `unfoldAlias` unchanged, is neither
    // a `prim` `string` nor a `string`-typing literal, and is what the message
    // names. This row pins the unfolding to the alias form instead of letting it
    // dissolve every declared element name.
    const diags = diagsOf([...OBJECT_SCHEMA, ...JOIN("array<P>")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-10 — an object-schema `named` element does not unfold and is not `string`, so the `join` precondition keeps rejecting",
    ).toEqual(["theta/parse/non-string-array-join"]);
    // Message from code-registry-parse.md:43
    // (`array.join requires a string element type; got array<<element>>`).
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "TYPE-10 — an object schema does not unfold, so the rendered element is the schema name",
    ).toBe("array.join requires a string element type; got array<P>");
  });

  it("b12: an undeclared element type name stays non-string and renders as written, behind an upstream refusal", () => {
    // The asymmetry with e2 is the receiver, not the element: there the whole
    // receiver is an unresolvable `named`, so the gate never runs; here the
    // receiver IS an `array`, the gate runs, and the unresolvable element fails
    // the `string` test. `unfoldAlias` leaves an unresolvable `named` intact, so
    // this disposition is the one the gate already reached and must keep.
    //
    // FLIPPED under the sixteenth-set OPERATOR RULING for bug 0262, clause (i),
    // which names this cell in the FLIP class. OLD codes:
    // `["theta/parse/non-string-array-join"]` alone. NEW: the widening runs a
    // name-resolution pass at the `fn` PARAMETER capture, which reaches the
    // generic argument `Nope` nested inside `array<Nope>` and refuses it at the
    // position it is written.
    //
    // THE OUTCOME IS `[Y, X]`, NOT `X` REPLACED BY `Y`. The new refusal
    // PRECEDES the join refusal in source order (the parameter capture is
    // walked before the body), and both lines stand: this row's own subject —
    // that the `join` element predicate DECIDES on an unresolvable element
    // rather than deferring — is unmoved, and is still measured by the second
    // code and by the rendered message below.
    const diags = diagsOf(JOIN("array<Nope>"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:108 `join` row — an unresolvable element has nothing to unfold to and is not `string`, so this gate rejects rather than defers; bug 0262's widening adds the upstream refusal of the written head ahead of it",
    ).toEqual(["theta/parse/unresolved-named-type", "theta/parse/non-string-array-join"]);
    // Message from code-registry-parse.md:43
    // (`array.join requires a string element type; got array<<element>>`).
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "code-registry-parse.md:43 — an unresolvable element name renders as written, having nothing to unfold to",
    ).toBe("array.join requires a string element type; got array<Nope>");
  });

  it("b13: a cycle-participating element behaves as an unresolvable name", () => {
    // `collectTypeEnv` omits a cycle-participating declaration from the
    // `TypeEnv`, which is what bounds `unfoldAlias`'s walk. An absent name is
    // not an alias, so `A` stays `named A` at the element position and fails the
    // `string` test exactly as b12's undeclared name does — alongside the cycle
    // rejection TYPE-11 requires.
    //
    // NOT EXPOSED to bug 0262's widening, unlike b12. The ruling's clause (i)
    // names "0089's b12/b13" together, which overstates b13: the head `A` HAS a
    // visible top-level declaration (`schema A = B`), so
    // `collectUnresolvedNamedTypes` resolves it at the parameter capture and no
    // refusal is added. What the cycle removes is the `TypeEnv` ENTRY that
    // `unfoldAlias` walks, which is a later, different question from whether
    // the written name resolves to a declaration. This cell's codes are
    // therefore byte-identical before and after the widening.
    const diags = diagsOf(["schema A = B", "schema B = A", ...JOIN("array<A>")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 — alias cycles are rejected before any compatibility question arises, and the cycle participant does not unfold at the element position either",
    ).toEqual(["theta/parse/type-alias-cycle", "theta/parse/non-string-array-join"]);
    // Message from code-registry-parse.md:43
    // (`array.join requires a string element type; got array<<element>>`).
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "code-registry-parse.md:43 — a cycle participant is absent from the `TypeEnv`, so the rendered element is the name as written",
    ).toBe("array.join requires a string element type; got array<A>");
  });
});

// ===========================================================================
// (c) The classifiers that already unfold the same parameter record, plus the
//     raw-render invariant at `pushUnknownMethod`.
// ===========================================================================

describe("0089 (c) — the four TYPE-11-applying classifiers over the same `fn` parameter record", () => {
  it("c1: `classifyReceiver` resolves the alias and the message keeps the DECLARED type", () => {
    // Two obligations in one row. `classifyReceiver`
    // (src/parser/type-layer-checks.ts:167, recursing :187) resolves `L` to an
    // array and the stdlib allow-list rejects the call, which establishes that
    // the parameter type resolves and so isolates a group (a) or (b) red to the
    // gate itself. `pushUnknownMethod` renders the receiver type its caller
    // hands it, and `checkMethodCall` hands it the RAW one, so the join gate's
    // unfolded copy must not reach it: the author wrote `L`, and the message
    // names `L`.
    const diags = diagsOf([
      "schema L = array<string>",
      "fn f(xs: L) {",
      "  xs.frobnicate()",
      "}",
      "1",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:63 trigger — a method the theta 1.0 stdlib does not expose on an array receiver, reached by resolving the alias",
    ).toEqual(["theta/parse/unknown-method"]);
    // Message from code-registry-parse.md:63
    // (`unknown method '<method>' on type <type>`).
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered `<type>` is the receiver's declared type, unmoved by unfolding the join gate's copy",
    ).toBe("unknown method 'frobnicate' on type L");
  });

  it("c2: `classifyOperand` resolves the alias at the `+` operand check", () => {
    // `classifyOperand` (src/parser/type-layer-checks.ts:120, recursing :145)
    // resolves `L` to an array, which pairs with `integer` as a mixed operand.
    const diags = diagsOf([
      "schema L = array<string>",
      "fn f(xs: L): string {",
      "  xs + 1",
      "}",
      "1",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:36 trigger — `+` over a mixed-type pair, reached by resolving the alias operand",
    ).toEqual(["theta/parse/mixed-plus-operands"]);
    // Message from code-registry-parse.md:36
    // (`'+' has mixed operand types: <left> and <right>`).
    expect(
      messageFor(diags, "theta/parse/mixed-plus-operands"),
      "code-registry-parse.md:36 — the *Message* column renders each operand as declared",
    ).toBe("'+' has mixed operand types: L and integer");
  });

  it("c3: `classifyIndexReceiver` resolves the alias at the indexed-access check", () => {
    // `classifyIndexReceiver` (src/parser/type-compat.ts:366, recursing :389)
    // resolves `S` to `string`, which is neither `array<T>` nor an object.
    const diags = diagsOf(["schema S = string", "fn f(s: S) {", "  s[0]", "}", "1"]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:38 trigger — indexed access whose receiver is neither `array<T>` nor an object, reached by resolving the alias",
    ).toEqual(["theta/parse/non-indexable-receiver"]);
    // Message from code-registry-parse.md:38
    // (`indexed access requires an array<T> or object receiver; got <type>`).
    expect(
      messageFor(diags, "theta/parse/non-indexable-receiver"),
      "code-registry-parse.md:38 — the *Message* column renders the receiver as declared",
    ).toBe("indexed access requires an array<T> or object receiver; got S");
  });

  it("c4: `checkCompatible` unfolds the alias through `unfoldAlias` at a typed-binding initialiser", () => {
    // `checkCompatible` (src/parser/type-compat.ts:139) unfolds both operands
    // at :144 through the very `unfoldAlias` (:155) the two gates must reuse, so
    // `N` reads as `number` and the copy into an `integer` slot narrows.
    expect(
      codesOf([
        "schema N = number",
        "fn f(n: N) {",
        "  let m: integer = n",
        "  m",
        "}",
        "1",
      ]),
      "code-registry-parse.md:24 trigger — a `number` value where `integer` is expected, reached through `unfoldAlias` on the declared parameter type",
    ).toEqual(["theta/parse/integer-narrowing"]);
  });
});

// ===========================================================================
// (d) The `par for` body scope loses the loop variable's type alongside gate 1.
// ===========================================================================

describe("0089 (d) — a legal alias iterand binds the `par for` loop variable to the element type", () => {
  it("d1: the body of `par for x in xs` over an alias-of-array parameter checks `x` as a `string`", () => {
    // Unfolding site 3a. The element derivation in `walkExpr`'s
    // `case "par-for"` (src/parser/type-layer-checks.ts) is a `kind === "array"`
    // test of its own, so unfolding only inside `checkForIterand` would clear
    // the iterand diagnostic and still bind `x` to `named "unknown"`, at which
    // point every body check on `x` defers. control-flow.md:13 binds the
    // iteration variable
    // "as a fresh immutable local per iteration", and under TYPE-11 the element
    // is `string`, so the stdlib allow-list must reject `frobnicate` on it.
    const diags = diagsOf([
      "schema L = array<string>",
      ...ITER("L", "par for", "x.frobnicate()"),
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 + control-flow.md:13 — the iterand is legal, so the sole diagnostic is the body's unknown method on the `string` element",
    ).toEqual(["theta/parse/unknown-method"]);
    // Message from code-registry-parse.md:63
    // (`unknown method '<method>' on type <type>`).
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered `<type>` is the unfolded element type, `string`, not `unknown`",
    ).toBe("unknown method 'frobnicate' on type string");
  });

  it("d2: the same body over a concrete `array<string>` parameter reports the unknown method (control)", () => {
    // d1 and d2 differ only in whether the parameter type is named, so this row
    // is what makes d1's red attributable to the alias rather than to a body
    // scope that never binds the variable.
    const diags = diagsOf(ITER("array<string>", "par for", "x.frobnicate()"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "control-flow.md:70 — the `par for` body scope binds the loop variable to the concrete element type",
    ).toEqual(["theta/parse/unknown-method"]);
    // Message from code-registry-parse.md:63
    // (`unknown method '<method>' on type <type>`).
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered element type on the concrete route is `string`",
    ).toBe("unknown method 'frobnicate' on type string");
  });

  it("d3: the same alias through a `let` binding reports the unknown method (control — the `let` route)", () => {
    // The `let` route hands the gate and the element derivation a transparent
    // `array<string>`, so it already binds `x` as a `string`. The parameter
    // route must reach the same body typing.
    const diags = diagsOf([
      "schema L = array<string>",
      'let e: L = ["a"]',
      "par for x in e {",
      "  x.frobnicate()",
      "}",
      "1",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 — the `let` route binds the loop variable to the unfolded element type, so the parameter route must too",
    ).toEqual(["theta/parse/unknown-method"]);
    // Message from code-registry-parse.md:63
    // (`unknown method '<method>' on type <type>`).
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered element type on the `let` route is `string`",
    ).toBe("unknown method 'frobnicate' on type string");
  });
});

// ===========================================================================
// (e) Boundary dispositions at the two gates.
// ===========================================================================

describe("0089 (e) — the unresolvable, nominal and cyclic boundaries of the unfolding", () => {
  it("e1: a parameter type past the parser's static view rejects at gate 1", () => {
    // `unfoldAlias` (src/parser/type-compat.ts:155) leaves an unresolvable
    // `named` intact, so the gate keeps its current disposition. Gate 1 admits
    // only `kind === "array"`, so an unrecognised shape rejects.
    //
    // VEHICLE NOTE (bug 0262 coordination): the parameter type is `QueryError`,
    // not the earlier `Nope`. Bug 0262 widens `unresolved-named-type` to the
    // `fn` parameter capture itself, so a genuinely undeclared WHOLE parameter
    // type is now REFUSED there, which is a different (and correct) hazard
    // than the gate-1/gate-2 asymmetry this pair measures. `QueryError` is the
    // builtin error-model name bug 0262 §Fix admits at that capture (so it
    // draws no refusal) while staying absent from `collectTypeEnv` (so the
    // parameter is still statically unresolvable at both gates) — subject
    // preserved, per the 0165/0251 re-vehicle precedent.
    const diags = diagsOf(ITER("QueryError"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:64 trigger — an unresolvable `named` is not statically `array<T>`, and gate 1 rejects what it does not recognise",
    ).toEqual(["theta/parse/non-array-iterand"]);
    // Message from code-registry-parse.md:64
    // (`'for' expects array<T> after 'in'; got <type>`).
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "code-registry-parse.md:64 — an unresolvable name renders as written, having nothing to unfold to",
    ).toBe("'for' expects array<T> after 'in'; got QueryError");
  });

  it("e2: the same parameter type past the parser's static view defers at gate 2", () => {
    // The asymmetry with e1 is required, not incidental: gate 2 runs the
    // element check only for `kind === "array"`, so an unrecognised shape
    // defers to the runtime AJV safety net. Unfolding changes neither side.
    // `QueryError` is e1's re-vehicle, kept identical here so the pair still
    // measures the same receiver under both gates.
    expect(
      codesOf(JOIN("QueryError")),
      "expressions.md:108 `join` row — the element type of an unresolvable receiver is not statically known, so the gate defers",
    ).toEqual([]);
  });

  it("e3: an alias of `string` rejects, and the message renders the unfolded `string`", () => {
    // The deliberate observable change. The code is invariant — an alias of
    // `string` is a `string` under TYPE-11 and a `string` is the
    // code-registry-parse.md:64 trigger population — but the rendered type
    // moves to the unfolded form, because gate 1 renders the same value it
    // tested. That matches the registry template `got <type>`: under TYPE-11
    // the iterand's type IS `string`.
    const diags = diagsOf(["schema S = string", ...ITER("S")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 + code-registry-parse.md:64 trigger — an alias of `string` unfolds to `string`, which is not `array<T>`",
    ).toEqual(["theta/parse/non-array-iterand"]);
    // Message from code-registry-parse.md:64
    // (`'for' expects array<T> after 'in'; got <type>`).
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "code-registry-parse.md:64 — the *Message* column renders the iterand's type, which TYPE-11 makes `string`",
    ).toBe("'for' expects array<T> after 'in'; got string");
  });

  it("e4: an alias of an object schema rejects, and the message renders the nominal it unfolds to", () => {
    // TYPE-11 states the alias "is identified solely by the `schema X = R` `=`
    // form — not by what `R` resolves to: aliasing an object schema unfolds to
    // that object schema, which then participates under the nominal rules of
    // TYPE-10". So `Q` unfolds one hop to `P` and stops: `P` is nominal, is not
    // `array<T>`, and is what the message names.
    const diags = diagsOf([...OBJECT_SCHEMA, "schema Q = P", ...ITER("Q")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-10 via TYPE-11 — an alias of an object schema unfolds to a nominal, which stays outside `for ... in`",
    ).toEqual(["theta/parse/non-array-iterand"]);
    // Message from code-registry-parse.md:64
    // (`'for' expects array<T> after 'in'; got <type>`).
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "TYPE-11 — unfolding stops at the object schema, so the rendered type is `P`",
    ).toBe("'for' expects array<T> after 'in'; got P");
  });

  it("e5: a cycle participant behaves as an unresolvable name at gate 1", () => {
    // `collectTypeEnv` (src/parser/type-layer-checks.ts:303) omits a
    // cycle-participating declaration from the `TypeEnv`, which is what bounds
    // `unfoldAlias`'s walk
    // (src/parser/type-compat.ts:155–172, the loop's stated guarantee). An
    // absent name is not an alias, so `A` stays `named A` and gate 1 rejects it
    // exactly as it rejects e1's undeclared name — alongside the cycle
    // rejection TYPE-11 requires.
    const diags = diagsOf(["schema A = B", "schema B = A", ...ITER("A")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 — alias cycles are rejected before any compatibility question arises, and the cycle participant does not unfold",
    ).toEqual(["theta/parse/type-alias-cycle", "theta/parse/non-array-iterand"]);
    // Message from code-registry-parse.md:100 (`type-alias cycle: <path>`).
    expect(
      messageFor(diags, "theta/parse/type-alias-cycle"),
      "code-registry-parse.md:100 — the *Message* column renders the cycle path",
    ).toBe("type-alias cycle: A → B → A");
    // Message from code-registry-parse.md:64
    // (`'for' expects array<T> after 'in'; got <type>`).
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "code-registry-parse.md:64 — a cycle participant is absent from the `TypeEnv`, so the rendered type is the name as written",
    ).toBe("'for' expects array<T> after 'in'; got A");
  });
});

// ===========================================================================
// (s) The `par for` VALUE type, derived in the whole-program typing pass.
// ===========================================================================

describe("0089 (s) — a legal alias iterand types the `par for` value's element payload", () => {
  it("s1: `let r = par for x in xs` over an alias-of-array parameter types `r` as `array<Result<string, QueryError>>`", () => {
    // Unfolding site 3b, and the only row that reaches
    // `StaticTypeInferencePass` (src/parser/static-type-inference.ts).
    // CTRL-3 (control-flow.md:74) makes the value `array<Result<T, QueryError>>`
    // with `T` the body tail, and that pass computes the tail against its OWN
    // element derivation — a `kind === "array"` test independent of gate 1 and
    // of the walk's body binding. Without unfolding there, `T` collapses to
    // `unknown` even once the iterand is admitted, so the receiver type reported
    // for `r` names a payload the author never wrote.
    const diags = diagsOf(["schema L = array<string>", ...PAR_VALUE("L")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 + control-flow.md:70 — the iterand is legal, so the sole diagnostic is the unknown method on the `par for` value",
    ).toEqual(["theta/parse/unknown-method"]);
    // Message from code-registry-parse.md:63
    // (`unknown method '<method>' on type <type>`).
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "control-flow.md:74 CTRL-3 + code-registry-parse.md:63 — the rendered `<type>` carries the `par for` value's payload, which TYPE-11 makes `string`",
    ).toBe("unknown method 'frobnicate' on type array<Result<string, QueryError>>");
  });

  it("s2: the same body over a concrete `array<string>` parameter types the payload as `string` (control)", () => {
    // s1 and s2 differ only in whether the parameter type is named, so this row
    // is what makes s1's red attributable to the alias rather than to the
    // CTRL-3 value shape (control-flow.md:74).
    const diags = diagsOf(PAR_VALUE("array<string>"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "control-flow.md:70 — a concrete array iterand types the `par for` value's payload from its element type",
    ).toEqual(["theta/parse/unknown-method"]);
    // Message from code-registry-parse.md:63
    // (`unknown method '<method>' on type <type>`).
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered payload on the concrete route is `string`",
    ).toBe("unknown method 'frobnicate' on type array<Result<string, QueryError>>");
  });

  it("s3: an object-schema parameter keeps both the iterand rejection and the `unknown` payload (TYPE-10)", () => {
    // TYPE-10 bounds fix site 3b the same way it bounds gate 1: an
    // object-schema `named` does not unfold, so it is not `array<T>`, the
    // iterand stays rejected, and the element derivation has no element to
    // supply. The `unknown` payload is the correct consequence of a rejected
    // iterand, not a second defect.
    const diags = diagsOf([...OBJECT_SCHEMA, ...PAR_VALUE("P")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-10 — a nominal iterand stays rejected, and the body still checks against an unresolved element",
    ).toEqual(["theta/parse/non-array-iterand", "theta/parse/unknown-method"]);
    // Message from code-registry-parse.md:64
    // (`'for' expects array<T> after 'in'; got <type>`).
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "TYPE-10 — an object schema does not unfold, so the rendered iterand type is the schema name",
    ).toBe("'for' expects array<T> after 'in'; got P");
    // Message from code-registry-parse.md:63
    // (`unknown method '<method>' on type <type>`).
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "control-flow.md:74 CTRL-3 + code-registry-parse.md:63 — a nominal iterand supplies no element, so the payload stays `unknown`",
    ).toBe("unknown method 'frobnicate' on type array<Result<unknown, QueryError>>");
  });
});

// ===========================================================================
// (n) Bug 0126's widening: the plain `for` statement's body scope binds the
//     loop variable to the iterand's element type, the same element `par for`
//     (group (d)) already binds.
// ===========================================================================

describe("0089 (n) / bug 0126 — the plain `for` statement binds the loop variable to the iterand's element type", () => {
  it("n1: a `for` body over a CONCRETE `array<string>` parameter reports unknown-method for `x.frobnicate()`", () => {
    // `walkStmt`'s `case "for"` (src/parser/type-layer-checks.ts) binds
    // `stmt.variable` to the (TYPE-11-unfolded) iterand's element type, so a
    // body check on `x` resolves against `string` here — with or without an
    // alias in the signature, since the concrete and alias routes already agree
    // everywhere else in this file. Bug 0126
    // (docs/bugs/0126-plain-for-binds-no-loop-variable.md) is the adjudication
    // that requested this widening: the loop variable's static type is the
    // iterand's element type, exactly as group (d)'s `par for` arm already
    // records it, so this row pins the same `unknown-method` verdict `par for`
    // sibling row `d1` pins.
    const diags = diagsOf(ITER("array<string>", "for", "x.frobnicate()"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "bug 0126 — the plain `for` body scope binds the loop variable to the iterand's element type, so this reaches the same `unknown-method` gate `d1` reaches",
    ).toEqual(["theta/parse/unknown-method"]);
    // Message from the `theta/parse/unknown-method` row of
    // docs/spec_topics/diagnostics/code-registry-parse.md
    // (`unknown method '<method>' on type <type>`). The row is cited by CODE
    // rather than by line: that page's line numbers drift under every registry
    // insertion, while a row's code is what DIAG-4 makes normative.
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "the `theta/parse/unknown-method` registry row's *Message* column — the rendered `<type>` is the unfolded element type, `string`, sourced the same way row d1 sources it",
    ).toBe("unknown method 'frobnicate' on type string");
  });
});
