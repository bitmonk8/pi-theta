import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { findCode, parseDoc } from "./helpers/e2e-s1";

// Bug 0125 — the index-element derivation, and the TYPE-11 reading its `kind`
// test must take rather than narrowing an alias-typed array to the sentinel
// `named "index"` (docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md).
//
// THE SITE is one line. `#typeExpr`'s `case "index"` arm
// (src/parser/static-type-inference.ts:245–250) binds the target's type at `:248`
// and answers `target.kind === "array" ? target.element : { kind: "named", name:
// "index" }` at `:249`. A type-alias schema `schema L = array<string>` records as
// `named L` on a `fn` parameter (`walkFn`, src/parser/type-layer-checks.ts:740),
// so a `kind` test on that record alone answers the sentinel — a name no
// `TypeEnv` resolves — where TYPE-11 makes the element type available.
//
// THE TWO-PART FINDING. Receiver admissibility and element narrowing are
// separate paths with opposite dispositions on the same input.
// `classifyIndexReceiver` (src/parser/type-compat.ts:366, the `named` arm
// `:380–390`, the alias recursion `:389`) DOES resolve through the `TypeEnv`, so
// an alias of `array<string>` is admitted as a receiver and an alias of `string`
// is rejected — group (b). The narrowing then loses the element type the
// admissibility check had already resolved — groups (a) and (c). Group (b) is
// held here so a fix that reaches for `classifyIndexReceiver`'s three-way answer
// instead of `unfoldAlias` reds rather than passing silently.
//
// THE CONSEQUENCE. The sentinel is an unresolvable `named`, and every downstream
// check treats an unresolvable operand as "skip" (type-system.md:48). Six
// registered error-severity codes therefore stop firing on the element of an
// alias-typed array, each against a concrete-parameter control that emits it —
// group (c). All six are `E`, so where a missing emission would ordinarily be a
// lost warning, here an illegal theta REGISTERS: `hasLoadParseError`
// (src/extension/production-composition.ts:3263) has nothing to act on. The
// runtime disposition of three of them is pinned separately, in
// tests/index-element-alias-runtime-disposition.test.ts.
//
// VEHICLE NOTE (bug 0262 coordination): groups (d) rows 3 and 7 and the
// restated (d cont.) rows 13–16 read a `fn` parameter type of `QueryError`,
// not the earlier `Nope`. Bug 0262 widens `unresolved-named-type` to the `fn`
// parameter capture, so a genuinely undeclared head is now REFUSED there
// rather than deferred, and `Nope` would draw a second code these rows do not
// want. `QueryError` is the builtin error-model name bug 0262 §Fix admits at
// that capture (so it draws no refusal) while staying absent from
// `collectTypeEnv` (so the parameter type is still statically unresolvable for
// `unfoldAlias` and every classifier this file probes) — subject preserved,
// per the 0165/0251 re-vehicle precedent.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/type-system.md:54 TYPE-11 — a `NamedType` declared by a
//     type-alias schema `schema X = R` "is **transparent** in `⊑`: on whichever
//     side of a `T₁ ⊑ T₂` check it appears, it is replaced by its right-hand
//     side `R` and the check re-evaluated, recursing through nested aliases
//     until a non-alias form is reached". `L` declared `array<string>` IS
//     `array<string>`, so its element type is `string` by the `array<T>`
//     constructor.
//   - docs/spec_topics/type-system.md:52 TYPE-10 — an object-schema `named`
//     stays nominal, and TYPE-11 "never reopens TYPE-10's nominal case". This
//     bounds the unfolding: an object schema and an alias of one keep their
//     present index disposition — group (d) rows 1, 2, 5, 6.
//   - docs/spec_topics/type-system.md:48 *Unresolvable operands* — a check whose
//     operand is past the parser's static view is skipped and the runtime AJV
//     check is the safety net. An undeclared type name and a cycle participant
//     keep deferring — group (d) rows 3, 4.
//   - docs/spec_topics/expressions.md:10 *Indexed access* — the receiver "must
//     be an `array<T>` or an object value", the object index must be `string`,
//     and "The static result type of `obj[k]` is the union of the receiver's
//     declared field types". The corpus states the result type for the OBJECT
//     receiver only; the array-index result type is a silence the bug report
//     records (§Expected behaviour). These rows rest on the three arguments that
//     do not depend on the missing sentence: each erased code sits inside its
//     own registered *Trigger*, the implementation already commits to the
//     reading at every other spelling (the controls below), and the written
//     object sentence derives the result type from the receiver's declared
//     shape.
//   - docs/spec_topics/expressions.md:122 — "Anything not on this list is
//     `theta/parse/unknown-method` rather than a runtime failure." This is the
//     disposition group (a) requires for `frobnicate` on a `string` element.
//   - docs/spec_topics/expressions.md:108 (`array<T>` stdlib table, `join` row)
//     — "Element type must be `string`; non-string element types are
//     `theta/parse/non-string-array-join` (no implicit type conversion in theta
//     1.0)". Row c3.
//   - docs/spec_topics/lexical.md:15 — PascalCase is required for schema names,
//     so the sentinel's rendered name `index` spells no declarable theta type.
//     docs/spec_topics/diagnostics/placeholder-rendering-a.md:19 requires
//     `<type>` to render a named schema, enum or alias "by their theta-side
//     identifier". Rows d7–d9 and d11 measure the render.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 DIAG-2 — the registry
//     is closed. This fix engages no registry change: every code asserted below
//     is already registered and its *Trigger* already covers the receiver it
//     fires from. One code becomes UNreachable for one input class —
//     `theta/parse/non-array-iterand` at d11, whose registered trigger is
//     "`for x in expr` where `expr` is not `array<T>`" and whose emission there
//     is outside that trigger without the unfold.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74) — no asserted
// message string is written out here. Every one is READ from the registry's
// *Message* column, through `parseRegistry` / `registryMessage`
// (tools/code-registry/index.js) and the `msg` helper below, so the registry is
// the single source of truth for the rendered prose and a reworded template
// reds by naming the registry rather than by a bare string mismatch.
//
// RED / GREEN LEDGER, stated against the settled §Fix — computing
// `unfoldAlias(target, env)` at static-type-inference.ts:248–249 and testing the
// unfolded value's `kind`. This is ONE `kind` test, so one neutralisation covers
// both directions: reverting the unfold reds a1, a4, a5; every alias row of (c)
// — c1, c3, c5, c7, c9, c11, c13; d9's message half; and d11's code list and
// message. Twelve rows. Every other row holds under that neutralisation, which
// is what makes each red attributable to this line:
//   - the concrete-parameter controls a2, a6, c2, c4, c6, c8, c10, c12, c14,
//     d10, d12 establish that each checker fires at all on this harness, so a
//     red in its alias twin is the alias, not an absent check;
//   - a3 and g1 are the `let` route, recorded in TYPE-11-transparent form
//     (type-layer-checks.ts:643), which already reaches the element type — the
//     two routes must agree;
//   - group (b) is the receiver path, which already unfolds and which this fix
//     does not touch; a neutralisation that reds (b) means the receiver path was
//     changed;
//   - d1–d8 and d13–d16 are the dispositions the unfolding must not move —
//     TYPE-10 nominal, unresolvable, cyclic, the object-index key check, and the
//     sentinel/schema-name collision;
//   - group (f) is the three sink-routing siblings (`walkStmt`'s `case "let"`
//     array dispatch, `sinkedArrayOf`, `checkObjectField`), CLOSED by bug
//     0157: each now unfolds its own sink before testing `kind`, a SEPARATE
//     `unfoldAlias` call from the one this line neutralises, so reverting
//     THIS line does not touch group (f) either way;
//   - g2 and g3 are identical, so the `fn`-return route is out of reach for a
//     different reason: `#typeExpr`'s `case "call"`
//     (static-type-inference.ts:251–252) types a call by its callee name and
//     never reads the declared return type.
//
// ANTI-VACUITY. Forty of the fifty-four rows expect a non-empty code list — bug
// 0081's union arm empties f1's list by closing its false `E` — so a harness
// that stopped reaching the type layer (a frontmatter refusal, an unfed
// static-type pass) fails loudly here rather than turning the `toEqual([])` rows
// into silent passes. Every code assertion is an ordered whole-list equality on
// the aggregated codes, so a spurious extra diagnostic cannot hide inside a
// containment check.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a source string. An integration tier would
// add a session round-trip to a parse-time observable and buy no reach; a live
// tier would make a static, fully determined observable stochastic.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. The registry lookup asserts its row's presence and
// each named placeholder before the template is filled, so a missing or
// reworded row reds by naming the registry rather than by a silently-wrong
// expectation.

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
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row or a reworded template reds by naming the registry rather than
 * by a bare `undefined` comparison.
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
 * The recurring index-read body: one `fn` whose single parameter is declared
 * `t`, binding the read `read` and calling an unexposed method on the binding.
 * The intervening `let` routes the element type through the recorded binding
 * type, which is the channel groups (a) and (c) read. The trailing `1` supplies
 * the theta's final value.
 */
function LET_METHOD(t: string, read = "xs[0]"): string[] {
  return [`fn f(xs: ${t}) {`, `  let y = ${read}`, "  y.frobnicate()", "}", "1"];
}

/** The same read with no intervening `let`: the method call is on the index. */
function DIRECT_METHOD(t: string): string[] {
  return [`fn f(xs: ${t}) {`, "  xs[0].frobnicate()", "}", "1"];
}

/** The receiver-admissibility form: an index read whose value is discarded. */
function INDEX_ONLY(param: string, t: string): string[] {
  return [`fn f(${param}: ${t}) {`, `  ${param}[0]`, "}", "1"];
}

/** The typed-binding sink: an index read copied into an `integer` slot. */
function INTEGER_SINK(param: string, t: string, read: string): string[] {
  return [`fn f(${param}: ${t}) {`, `  let m: integer = ${read}`, "  m", "}", "1"];
}

/** The `array.join` receiver form: an index read joined into a `string`. */
function JOIN_READ(param: string, t: string, read: string): string[] {
  return [`fn f(${param}: ${t}): string {`, `  ${read}.join(",")`, "}", "1"];
}

/** The iterand form: an index read placed after `in`, iterated with `kw`. */
function ITER_READ(t: string, kw: string, read: string, body: string): string[] {
  return [`fn f(xs: ${t}) {`, `  ${kw} y in ${read} {`, `    ${body}`, "  }", "}", "1"];
}

/** An object schema — the TYPE-10 nominal population the unfolding must not move. */
const OBJECT_SCHEMA: readonly string[] = ["schema P {", "  a: string", "}"];

// ===========================================================================
// (a) The defect, and the controls that establish the element type is derivable.
// ===========================================================================

describe("0125 (a) — an index read on an alias-typed array narrows to the alias's element type", () => {
  it("a1: `schema L = array<string>` with `fn f(xs: L) { let y = xs[0]  y.frobnicate() }` reports the unknown method", () => {
    // The reported direction. TYPE-11 makes `L` and `array<string>` the same
    // type, so the element read is a `string` and expressions.md:122 states the
    // disposition without qualification: anything off the stdlib list is
    // `theta/parse/unknown-method` "rather than a runtime failure". The code is
    // `E` (code-registry-parse.md:63, *Severity* column), and
    // `parseDiscoveredTheta` drops any theta carrying an error-severity
    // `theta/parse/*` diagnostic (`hasLoadParseError`,
    // src/extension/production-composition.ts:3263), so silencing this code
    // registers a theta the spec refuses.
    const diags = diagsOf(["schema L = array<string>", ...LET_METHOD("L")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 + expressions.md:122 — an alias of `array<string>` has element type `string`, so `frobnicate` is off the stdlib list and is a parse rejection, not a runtime failure",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered `<type>` is the unfolded element type, `string`",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });

  it("a2: the same body over a concrete `array<string>` parameter reports it (control)", () => {
    // a1 and a2 differ only in whether the parameter type is named. This row is
    // what makes a1's red attributable to the alias rather than to a `fn`
    // parameter boundary that never types its element.
    const diags = diagsOf(LET_METHOD("array<string>"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:122 — a concrete `array<string>` element is a `string`, and `frobnicate` is off the stdlib list",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered element type on the concrete route is `string`",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });

  it("a3: the same alias through a `let` binding reports it (control — the `let` route)", () => {
    // `walkStmt`'s `case "let"` records the annotation in TYPE-11-transparent
    // form (src/parser/type-layer-checks.ts:643), so the index read already sees
    // `array<string>` on this route. The two routes must agree: an author's
    // choice between a parameter and a binding is not a typing question.
    const diags = diagsOf([
      "schema L = array<string>",
      'let e: L = ["a"]',
      "let y = e[0]",
      "y.frobnicate()",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 — the `let` route reaches the same index arm with the same alias and must reach the same disposition",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered element type on the `let` route is `string`",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });

  it("a4: a nested alias chain unfolds to the array (`schema M = array<string>` / `schema L = M`)", () => {
    // TYPE-11 recurses "through nested aliases until a non-alias form is
    // reached", so one hop is not enough to satisfy the rule. `unfoldAlias`
    // (src/parser/type-compat.ts:155–172) walks the chain at `:164`, stepping at
    // `:169`; this row pins the walk rather than a single dereference.
    const diags = diagsOf(["schema M = array<string>", "schema L = M", ...LET_METHOD("L")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 — unfolding recurses through nested aliases until a non-alias form is reached",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the chain resolves to `array<string>`, whose element renders as `string`",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });

  it("a5: the method call directly on the index read reports it (no intervening `let`)", () => {
    // a1 reads the element through a recorded binding type; a5 reads it straight
    // out of `#typeExpr`. Both reach the same seam
    // (`typeOf`, src/parser/static-type-inference.ts:182–188, which
    // src/parser/type-layer-checks.ts:574–576 delegates to), so both must move
    // together — a fix that repaired only the binding record would leave this
    // row red.
    const diags = diagsOf(["schema L = array<string>", ...DIRECT_METHOD("L")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 + expressions.md:122 — the element type does not depend on whether the read was bound first",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered `<type>` is the unfolded element type, `string`",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });

  it("a6: the same direct read over a concrete `array<string>` parameter reports it (control)", () => {
    // a5 and a6 differ only in whether the parameter type is named, so this row
    // is what makes a5's red attributable to the alias.
    const diags = diagsOf(DIRECT_METHOD("array<string>"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:122 — the concrete route narrows the direct index read to `string`",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered element type on the concrete route is `string`",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });
});

// ===========================================================================
// (b) The receiver check DOES unfold — the other half of the finding, and the
//     tripwire on a fix that moves the receiver path.
// ===========================================================================

describe("0125 (b) — the index RECEIVER check already resolves the alias and must not move", () => {
  it("b1: `schema S = string` with `fn f(s: S) { s[0] }` rejects the receiver", () => {
    // `classifyIndexReceiver` (src/parser/type-compat.ts:366) resolves `S`
    // through the `TypeEnv` in its `named` arm (`:380–390`) and recurses on the
    // alias right-hand side (`:389`), so it sees a `string` — which
    // expressions.md:101 states is not indexable. This row is bug 0089's group
    // (c) row 3 re-measured from this report's side; a fix here that reached for
    // this classifier's three-way answer instead of `unfoldAlias` would move it.
    const diags = diagsOf(["schema S = string", ...INDEX_ONLY("s", "S")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:101 — `string` is not indexable, and the receiver check resolves the alias to reach that answer",
    ).toEqual(["theta/parse/non-indexable-receiver"]);
    expect(
      messageFor(diags, "theta/parse/non-indexable-receiver"),
      "code-registry-parse.md:38 — the render is the DECLARED receiver (`displayCompatType` on the un-unfolded value, src/runtime/expression-evaluator.ts:630–632), which this fix does not change",
    ).toBe(msg("theta/parse/non-indexable-receiver", [["<type>", "S"]]));
  });

  it("b2: the same receiver spelled `string` rejects (control)", () => {
    const diags = diagsOf(INDEX_ONLY("s", "string"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:101 — a concrete `string` receiver is the registered trigger population",
    ).toEqual(["theta/parse/non-indexable-receiver"]);
    expect(
      messageFor(diags, "theta/parse/non-indexable-receiver"),
      "code-registry-parse.md:38 — the *Message* column renders the receiver as declared",
    ).toBe(msg("theta/parse/non-indexable-receiver", [["<type>", "string"]]));
  });

  it("b3: `schema L = array<string>` with `fn f(xs: L) { xs[0] }` is ADMITTED", () => {
    // The pivot. The machinery that resolves b1's `named S` to a `string`
    // resolves this `named L` to `array<string>` and admits the read — and then
    // a1 and a5 show the element type is lost anyway. The two halves disagree on
    // the same input, which is what makes this a two-part finding rather than a
    // single missing unfold.
    expect(
      codesOf(["schema L = array<string>", ...INDEX_ONLY("xs", "L")]),
      "TYPE-11 + expressions.md:10 — an alias of `array<string>` IS an `array<T>` receiver, so the admissibility check passes",
    ).toEqual([]);
  });

  it("b4: a nested alias chain of `string` rejects (`schema T = string` / `schema S = T`)", () => {
    // The receiver path recurses through the chain as TYPE-11 requires. Held so
    // a fix that replaced the recursion with a single dereference reds.
    const diags = diagsOf(["schema T = string", "schema S = T", ...INDEX_ONLY("s", "S")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 — the receiver check recurses through nested aliases until a non-alias form is reached",
    ).toEqual(["theta/parse/non-indexable-receiver"]);
    expect(
      messageFor(diags, "theta/parse/non-indexable-receiver"),
      "code-registry-parse.md:38 — the render stays the declared receiver through the chain",
    ).toBe(msg("theta/parse/non-indexable-receiver", [["<type>", "S"]]));
  });
});

// ===========================================================================
// (c) Six registered error-severity codes, each against its concrete control.
// ===========================================================================

describe("0125 (c) — the six error-severity codes that must fire on an alias-typed array's element", () => {
  it("c1: `schema L = array<number>` narrows into an `integer` binding", () => {
    // `checkCompatible` (src/parser/type-compat.ts:139) delegates to `decide`
    // over alias-unfolded operands (`:144`), and `decide` answers `"unknown"`
    // "when an operand is an unresolvable `named` reference past the parser's
    // static view" (`:177–178`), so the sentinel defers both the TYPE-9 route
    // and its narrowing arm. Under TYPE-11 the element is `number`, and the
    // `integer → number` widening is one-way.
    const diags = diagsOf(["schema L = array<number>", ...INTEGER_SINK("xs", "L", "xs[0]")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:24 trigger — a `number` value where `integer` is expected, which TYPE-11 makes the element type of `L`",
    ).toEqual(["theta/parse/integer-narrowing"]);
    expect(
      messageFor(diags, "theta/parse/integer-narrowing"),
      "code-registry-parse.md:24 — the *Message* column carries no placeholder",
    ).toBe(msg("theta/parse/integer-narrowing", []));
  });

  it("c2: the same sink over a concrete `array<number>` parameter reports it (control)", () => {
    const diags = diagsOf(INTEGER_SINK("xs", "array<number>", "xs[0]"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:24 trigger — the concrete route narrows the element to `number` and rejects the copy",
    ).toEqual(["theta/parse/integer-narrowing"]);
    expect(
      messageFor(diags, "theta/parse/integer-narrowing"),
      "code-registry-parse.md:24 — the message is invariant across the two routes",
    ).toBe(msg("theta/parse/integer-narrowing", []));
  });

  it("c3: `schema L = array<array<integer>>` joins its element and reports the non-string element type", () => {
    // Bug 0089 unfolded the `join` guard's input
    // (src/parser/type-layer-checks.ts:1474–1475), which cannot help when the
    // input is a fabricated name rather than an alias: `unfoldAlias` returns the
    // sentinel unchanged, so `checkArrayJoin` is never reached. Under TYPE-11
    // the element is `array<integer>`, which expressions.md:108 rejects.
    const diags = diagsOf([
      "schema L = array<array<integer>>",
      ...JOIN_READ("xs", "L", "xs[0]"),
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:108 `join` row — a non-string element type is `theta/parse/non-string-array-join`, and TYPE-11 makes the index read an `array<integer>`",
    ).toEqual(["theta/parse/non-string-array-join"]);
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "code-registry-parse.md:43 — the *Message* column renders the offending element type",
    ).toBe(msg("theta/parse/non-string-array-join", [["<element>", "integer"]]));
  });

  it("c4: the same join over a concrete `array<array<integer>>` parameter reports it (control)", () => {
    const diags = diagsOf(JOIN_READ("xs", "array<array<integer>>", "xs[0]"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:108 `join` row — the concrete route narrows the index read to `array<integer>` and reaches the element test",
    ).toEqual(["theta/parse/non-string-array-join"]);
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "code-registry-parse.md:43 — the rendered element type is invariant across the two routes",
    ).toBe(msg("theta/parse/non-string-array-join", [["<element>", "integer"]]));
  });

  it("c5: `schema L = array<string>` mixes its element with an integer under `+`", () => {
    // `checkPlusOperands` classifies an unresolvable operand `"unknown"` and
    // defers. Under TYPE-11 the element is `string`, which pairs with `integer`
    // as the registered mixed pair.
    const diags = diagsOf([
      "schema L = array<string>",
      "fn f(xs: L): string {",
      "  xs[0] + 1",
      "}",
      "1",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:36 trigger — `+` applied to a mixed-type pair, which TYPE-11 makes `string` and `integer`",
    ).toEqual(["theta/parse/mixed-plus-operands"]);
    expect(
      messageFor(diags, "theta/parse/mixed-plus-operands"),
      "code-registry-parse.md:36 — the *Message* column renders each operand type",
    ).toBe(
      msg("theta/parse/mixed-plus-operands", [
        ["<left>", "string"],
        ["<right>", "integer"],
      ]),
    );
  });

  it("c6: the same `+` over a concrete `array<string>` parameter reports it (control)", () => {
    const diags = diagsOf([
      "fn f(xs: array<string>): string {",
      "  xs[0] + 1",
      "}",
      "1",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:36 trigger — the concrete route narrows the left operand to `string`",
    ).toEqual(["theta/parse/mixed-plus-operands"]);
    expect(
      messageFor(diags, "theta/parse/mixed-plus-operands"),
      "code-registry-parse.md:36 — the rendered operand pair is invariant across the two routes",
    ).toBe(
      msg("theta/parse/mixed-plus-operands", [
        ["<left>", "string"],
        ["<right>", "integer"],
      ]),
    );
  });

  it("c7: `schema L = array<string>` copies its element into an `integer` binding", () => {
    // The TYPE-9 route of the same check c1 exercises through its narrowing arm:
    // here the element and the annotation are unrelated types, so the mismatch
    // is reported rather than the narrowing.
    const diags = diagsOf(["schema L = array<string>", ...INTEGER_SINK("xs", "L", "xs[0]")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:54 trigger — a typed binding whose statically resolvable RHS is incompatible with its annotation, which TYPE-11 makes `string` against `integer`",
    ).toEqual(["theta/parse/let-rhs-type-mismatch"]);
    expect(
      messageFor(diags, "theta/parse/let-rhs-type-mismatch"),
      "code-registry-parse.md:54 — the *Message* column renders the binding name, the annotation and the RHS type",
    ).toBe(
      msg("theta/parse/let-rhs-type-mismatch", [
        ["<name>", "m"],
        ["<expected>", "integer"],
        ["<actual>", "string"],
      ]),
    );
  });

  it("c8: the same copy over a concrete `array<string>` parameter reports it (control)", () => {
    const diags = diagsOf(INTEGER_SINK("xs", "array<string>", "xs[0]"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:54 trigger — the concrete route narrows the RHS to `string` and the annotation refuses it",
    ).toEqual(["theta/parse/let-rhs-type-mismatch"]);
    expect(
      messageFor(diags, "theta/parse/let-rhs-type-mismatch"),
      "code-registry-parse.md:54 — the rendered pair is invariant across the two routes",
    ).toBe(
      msg("theta/parse/let-rhs-type-mismatch", [
        ["<name>", "m"],
        ["<expected>", "integer"],
        ["<actual>", "string"],
      ]),
    );
  });

  it("c9: `schema L = array<string>` uses its element as an `if` condition", () => {
    const diags = diagsOf([
      "schema L = array<string>",
      "fn f(xs: L): integer {",
      "  if xs[0] {",
      "    1",
      "  } else {",
      "    2",
      "  }",
      "}",
      "1",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:34 trigger — a non-`boolean` value in an `if` condition, which TYPE-11 makes `string`",
    ).toEqual(["theta/parse/non-boolean-condition"]);
    expect(
      messageFor(diags, "theta/parse/non-boolean-condition"),
      "code-registry-parse.md:34 — the *Message* column renders the offending condition type",
    ).toBe(msg("theta/parse/non-boolean-condition", [["<type>", "string"]]));
  });

  it("c10: the same condition over a concrete `array<string>` parameter reports it (control)", () => {
    const diags = diagsOf([
      "fn f(xs: array<string>): integer {",
      "  if xs[0] {",
      "    1",
      "  } else {",
      "    2",
      "  }",
      "}",
      "1",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:34 trigger — the concrete route narrows the condition to `string`",
    ).toEqual(["theta/parse/non-boolean-condition"]);
    expect(
      messageFor(diags, "theta/parse/non-boolean-condition"),
      "code-registry-parse.md:34 — the rendered condition type is invariant across the two routes",
    ).toBe(msg("theta/parse/non-boolean-condition", [["<type>", "string"]]));
  });

  it("c11: a second index read on `schema L = array<array<string>>` narrows twice", () => {
    // The loss is not recovered by a second index: once the first read types as
    // the sentinel, the second falls into the same fallback. This row pins that
    // the unfolded value's `element` feeds the next `#typeExpr` recursion, so a
    // chain of reads narrows at every level.
    const diags = diagsOf([
      "schema L = array<array<string>>",
      ...LET_METHOD("L", "xs[0][0]"),
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 — the outer read narrows to `array<string>`, whose own element read narrows to `string`",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — two narrowing steps reach the `string` element",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });

  it("c12: the same double read over a concrete `array<array<string>>` parameter reports it (control)", () => {
    const diags = diagsOf(LET_METHOD("array<array<string>>", "xs[0][0]"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "the concrete route narrows both levels, so the chain is not what group (c) is measuring",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered element type on the concrete route is `string`",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });

  it("c13: an alias ELEMENT under an alias array reports and names the DECLARED element", () => {
    // This fix unfolds the TARGET, not the element. The element handed on is
    // `named E`, and `classifyReceiver` (src/parser/type-layer-checks.ts:167,
    // recursing on the alias right-hand side at `:186`) unfolds it internally
    // while `pushUnknownMethod` (`:1485`, called at `:1457`) renders the raw
    // type — so the message names `E`, as the c14 control already measures.
    // Unfolding the element at this line would change c14's message and is not
    // this fix (0125 §Fix, "The element is not unfolded here").
    const diags = diagsOf(["schema E = string", "schema L = array<E>", ...LET_METHOD("L")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 — unfolding the target yields `array<E>`, whose element reaches the stdlib allow-list through `classifyReceiver`'s own resolution",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered `<type>` is the declared element name, which is the raw render `pushUnknownMethod` performs and c14 pins",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "E"],
      ]),
    );
  });

  it("c14: the same alias element under a CONCRETE array reports it (control — the fix's depth bound)", () => {
    // c13 and c14 differ only in whether the ARRAY is named; the element is the
    // alias in both. c14 holds with and without the unfold, so it bounds how
    // deep the fix goes: the target unfolds, the element does not.
    const diags = diagsOf(["schema E = string", ...LET_METHOD("array<E>")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "expressions.md:122 — an alias element under a concrete array already reaches the stdlib allow-list",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the declared element name is what the raw render produces, and this fix must not move it",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "E"],
      ]),
    );
  });
});

// ===========================================================================
// (d) Bounds that must not move, and the sentinel's user-visible render.
// ===========================================================================

describe("0125 (d) — the TYPE-10, unresolvable and cyclic bounds on the unfolding", () => {
  it("d1: an object-schema receiver keeps its present index disposition (TYPE-10)", () => {
    // `unfoldAlias` returns an object-schema `named` unchanged (TYPE-10, the
    // bounds comment at src/parser/type-compat.ts:147–154), so the read still
    // fails the `kind === "array"` test and still falls to the else arm.
    // expressions.md:10 does specify the object result type ("the union of the
    // receiver's declared field types"), and it is unimplemented — a disjoint
    // input class with its own report (0125 §Non-goals). This row holds it still
    // so a fix here does not land it by accident.
    expect(
      codesOf([...OBJECT_SCHEMA, "fn f(p: P) {", '  let y = p["a"]', "  y.frobnicate()", "}", "1"]),
      "TYPE-10 — an object-schema `named` does not unfold, so the object-receiver index result type is untouched by this fix",
    ).toEqual([]);
  });

  it("d2: an alias OF an object schema keeps the same disposition (TYPE-10 via TYPE-11)", () => {
    // TYPE-11 states the alias "is identified solely by the `schema X = R` `=`
    // form — not by what `R` resolves to: aliasing an object schema unfolds to
    // that object schema, which then participates under the nominal rules of
    // TYPE-10". So `Q` unfolds one hop to `P` and stops, and `P` is not an
    // `array`.
    expect(
      codesOf([
        ...OBJECT_SCHEMA,
        "schema Q = P",
        "fn f(p: Q) {",
        '  let y = p["a"]',
        "  y.frobnicate()",
        "}",
        "1",
      ]),
      "TYPE-11 into TYPE-10 — unfolding stops at the object schema, which is not `array<T>`",
    ).toEqual([]);
  });

  it("d3: a parameter type past the parser's static view keeps deferring", () => {
    // `unfoldAlias` returns an unresolvable `named` unchanged
    // (src/parser/type-compat.ts:166–167), so the read keeps the disposition
    // type-system.md:48 requires: the parse-time check is skipped and the
    // runtime AJV check is the safety net. `QueryError` is the file's vehicle
    // note re-vehicle: admitted at the widened `fn` parameter capture, absent
    // from `collectTypeEnv`.
    expect(
      codesOf(LET_METHOD("QueryError")),
      "type-system.md:48 *Unresolvable operands* — a name past the parser's static view defers rather than narrowing",
    ).toEqual([]);
  });

  it("d4: a type-alias-cycle participant keeps deferring alongside the cycle rejection", () => {
    // `collectTypeEnv` omits a cycle-participating declaration from the
    // `TypeEnv`, which is what bounds `unfoldAlias`'s walk (its termination
    // comment, src/parser/type-compat.ts:157–163). An absent name is not an
    // alias, so `A` stays `named A` and the read defers as d3's does.
    const diags = diagsOf(["schema A = B", "schema B = A", ...LET_METHOD("A")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 — alias cycles are rejected before any compatibility question arises, and the cycle participant does not unfold",
    ).toEqual(["theta/parse/type-alias-cycle"]);
    expect(
      messageFor(diags, "theta/parse/type-alias-cycle"),
      "code-registry-parse.md:100 — the *Message* column renders the cycle path",
    ).toBe(msg("theta/parse/type-alias-cycle", [["<path>", "A → B → A"]]));
  });

  it("d5: the object-index KEY check is unaffected through an alias", () => {
    // expressions.md:10 — for an object receiver "the index expression must be
    // of type `string`". The key check runs on the receiver classification, not
    // on the element narrowing, so it is invariant under this fix.
    const diags = diagsOf([...OBJECT_SCHEMA, "schema Q = P", ...INDEX_ONLY("p", "Q")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:39 trigger — an object-value receiver indexed by a non-`string` key",
    ).toEqual(["theta/parse/non-string-object-index"]);
    expect(
      messageFor(diags, "theta/parse/non-string-object-index"),
      "code-registry-parse.md:39 — the *Message* column renders the offending key type",
    ).toBe(msg("theta/parse/non-string-object-index", [["<type>", "integer"]]));
  });

  it("d6: the same key check on the object schema directly (control)", () => {
    const diags = diagsOf([...OBJECT_SCHEMA, ...INDEX_ONLY("p", "P")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:39 trigger — the disposition is the same with and without the alias hop",
    ).toEqual(["theta/parse/non-string-object-index"]);
    expect(
      messageFor(diags, "theta/parse/non-string-object-index"),
      "code-registry-parse.md:39 — the rendered key type is invariant across the two spellings",
    ).toBe(msg("theta/parse/non-string-object-index", [["<type>", "integer"]]));
  });

  it("d7: the sentinel's render stays reachable through an UNRESOLVABLE receiver", () => {
    // The else arm survives this fix, and the fix's §Fix (b) requires a witness
    // to say so where it leaves `got index` reachable. No alias is involved
    // here: an unresolvable receiver falls to the sentinel and `displayType`'s
    // `case "named"` (src/parser/type-compat.ts:324–325) returns the name
    // verbatim. The rendered `index` satisfies neither
    // placeholder-rendering-a.md:19 nor lexical.md:15, and closing the alias
    // half leaves this half open — a residual this fix does not claim.
    const diags = diagsOf([
      "fn f(p: QueryError) {",
      "  for y in p[0] {",
      "    y",
      "  }",
      "}",
      "1",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "type-system.md:48 — an unresolvable receiver keeps its deferral, and the iterand gate admits only `array<T>`",
    ).toEqual(["theta/parse/non-array-iterand"]);
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "0125 §Fix (b) — the sentinel keeps its name unless the fix replaces it, so `got index` stays reachable with no alias present",
    ).toBe(msg("theta/parse/non-array-iterand", [["<type>", "index"]]));
  });

  it("d8: the sentinel's render stays reachable through an OBJECT receiver", () => {
    // The second non-alias reach of the render. An object-schema receiver is
    // admitted by `classifyIndexReceiver`'s TYPE-10 arm and then falls to the
    // else arm, so the sentinel names the iterand here too — again with no alias
    // present, and again outside this fix's claim.
    const diags = diagsOf([
      "schema P {",
      "  xs: array<string>",
      "}",
      "fn f(p: P) {",
      '  for y in p["xs"] {',
      "    y",
      "  }",
      "}",
      "1",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-10 — an object-schema receiver is not an `array`, so the read falls to the else arm and the iterand gate refuses the sentinel",
    ).toEqual(["theta/parse/non-array-iterand"]);
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "0125 §Fix (b) — the object-receiver reach of `got index` survives this fix and belongs with the object-result-type report",
    ).toBe(msg("theta/parse/non-array-iterand", [["<type>", "index"]]));
  });

  it("d9: an alias-typed array's element renders as `string` at the iterand gate, not `index`", () => {
    // The deliberate message move. The code is invariant — a `string` is not
    // `array<T>` and is the code-registry-parse.md:64 trigger population — but
    // the rendered type moves off the sentinel, because bug 0089's gate 1
    // renders the same value it tested (src/parser/control-flow.ts:69–70) and
    // that value is the unfolded element. No fixture outside this file pins
    // the sentinel's render as literal text. Inside it, d7 and d8 do — d7 in
    // its comment and assertion label, d8 in its assertion label — pinning
    // the non-alias reach the fix leaves untouched, so the move reds nothing
    // else. d15 renders the same value too, but through an `msg(...)` fill
    // for a separate diagnostic, never as a literal here.
    const diags = diagsOf(["schema L = array<string>", ...ITER_READ("L", "for", "xs[0]", "y")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:64 trigger — a `string` iterand is not `array<T>`, so the code is unchanged",
    ).toEqual(["theta/parse/non-array-iterand"]);
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "code-registry-parse.md:64 — the `got <type>` template renders the iterand's type, which TYPE-11 makes `string`",
    ).toBe(msg("theta/parse/non-array-iterand", [["<type>", "string"]]));
  });

  it("d10: the same iterand over a concrete `array<string>` parameter renders `string` (control)", () => {
    const diags = diagsOf(ITER_READ("array<string>", "for", "xs[0]", "y"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:64 trigger — the concrete route narrows the index read to `string`, which is not `array<T>`",
    ).toEqual(["theta/parse/non-array-iterand"]);
    expect(
      messageFor(diags, "theta/parse/non-array-iterand"),
      "code-registry-parse.md:64 — the render d9 must reach is the one the concrete route already produces",
    ).toBe(msg("theta/parse/non-array-iterand", [["<type>", "string"]]));
  });

  it("d11: a legal `par for` over an alias-typed array's element is ADMITTED", () => {
    // The one row where the code itself flips, and the one direction of this
    // defect that is a false rejection rather than a missing one: the iterand
    // gate admits only `kind === "array"`, so a spec-legal `par for` is refused
    // because the index read supplying it lost its type. Under TYPE-11 the read
    // is an `array<string>`, the iterand is legal, and the sole remaining
    // diagnostic is the body's unknown method on the `string` loop variable —
    // which is what the d12 control already reports.
    const diags = diagsOf([
      "schema L = array<array<string>>",
      ...ITER_READ("L", "par for", "xs[0]", "y.frobnicate()"),
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:64 trigger — an `array<string>` iterand IS `array<T>`, so the registered `non-array-iterand` trigger does not cover it",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the loop variable binds the `string` element, so the body's rejection renders `string`",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });

  it("d12: the same `par for` over a concrete `array<array<string>>` parameter is admitted (control)", () => {
    const diags = diagsOf(ITER_READ("array<array<string>>", "par for", "xs[0]", "y.frobnicate()"));
    expect(
      diags.map((d: Diagnostic) => d.code),
      "control-flow.md:70 — the concrete route admits the iterand and binds the loop variable to the `string` element",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the disposition d11 must reach is the one the concrete route already produces",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });
});

// ===========================================================================
// (d cont.) The sentinel meets a declaration that spells it. RESTATED for bug
//           0135 §Fix (Reading A, the `resolveNamed` fence): a declaration the
//           case rule refuses resolves nothing, so the sentinel's name no
//           longer reaches these two gates. The rows stay, with their new
//           expectations and the reason.
// ===========================================================================

describe("0125 (d cont.) — a `schema index = …` declaration is refused and therefore decides no check (restated for bug 0135)", () => {
  it("d13: `schema index = array<integer>` supplies NO element type to an unresolvable receiver's read (restated: bug 0135 §Fix, Reading A)", () => {
    // lexical.md:15 requires an uppercase first letter, so `schema index = …` is
    // refused at `E` severity and the document declares no type of that name.
    // Bug 0135 §Fix (Reading A) fences the READ seam — `resolveNamed`
    // (src/parser/type-compat.ts:124–130) answers nothing for a name whose first
    // character is not `A`–`Z` — so `unfoldAlias` (`:179–196`) no longer returns
    // the refused declaration's right-hand side and the `join` guard
    // (src/runtime/stdlib-array.ts:100–124) has nothing to refuse. The row now
    // reports what its d14 control always reported, plus the casing refusal:
    // type-system.md:48's deferral, restored to this input.
    const diags = diagsOf([
      "schema index = array<integer>",
      ...JOIN_READ("p", "QueryError", "p[0]"),
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "bug 0135 §Fix, Reading A at `resolveNamed` — the declaration is refused for its casing and therefore resolves nothing, so code-registry-parse.md:46's trigger no longer covers this input",
    ).toEqual(["theta/parse/schema-case-mismatch"]);
    expect(
      messageFor(diags, "theta/parse/schema-case-mismatch"),
      "code-registry-parse.md:20 — the *Message* column carries no placeholder",
    ).toBe(msg("theta/parse/schema-case-mismatch", []));
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "bug 0135 §Fix, Reading A — the element type this row used to render came from a refused declaration, so no element type reaches the `join` guard and the code is absent",
    ).toBeUndefined();
  });

  it("d14: the same join with no `index` declaration reports nothing (control)", () => {
    expect(
      codesOf(JOIN_READ("p", "QueryError", "p[0]")),
      "type-system.md:48 — with no declaration for the sentinel's name the read is unresolvable and the `join` guard defers",
    ).toEqual([]);
  });

  it("d15: `schema index = string` supplies NO RHS type to a typed binding (restated: bug 0135 §Fix, Reading A)", () => {
    // The second gate the refused declaration used to decide.
    // code-registry-parse.md:59 scopes `let-rhs-type-mismatch` to inputs "where
    // the RHS type is statically resolvable", and after the `resolveNamed`
    // fence a name the case rule refuses resolves nothing — so this input leaves
    // the trigger and joins its d16 control. The `<actual>` this row used to
    // render was the sentinel's own name, which placeholder-rendering-a.md:25
    // read with lexical.md:15 does not admit at a type position; that rendering
    // is now unreachable through a declaration.
    const diags = diagsOf(["schema index = string", ...INTEGER_SINK("p", "QueryError", "p[0]")]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "bug 0135 §Fix, Reading A at `resolveNamed` — a declaration refused for its casing makes no RHS type statically resolvable, so code-registry-parse.md:59's trigger no longer covers this input",
    ).toEqual(["theta/parse/schema-case-mismatch"]);
    expect(
      messageFor(diags, "theta/parse/let-rhs-type-mismatch"),
      "bug 0135 §Fix, Reading A — the `<actual>` this row used to render was supplied by the refused declaration, so the mismatch is absent rather than reworded",
    ).toBeUndefined();
  });

  it("d16: the same binding with no `index` declaration reports nothing (control)", () => {
    expect(
      codesOf(INTEGER_SINK("p", "QueryError", "p[0]")),
      "type-system.md:48 — with no declaration for the sentinel's name the RHS is unresolvable and the check defers",
    ).toEqual([]);
  });
});

// ===========================================================================
// (f) The three sink-routing siblings — CLOSED by bug 0157: `walkStmt`'s
//     `case "let"` array dispatch, `sinkedArrayOf` and `checkObjectField` now
//     unfold the sink (TYPE-11) before classifying its `kind`, so an
//     alias-spelled sink supplies the SAME element sink its concrete twin
//     always did. f3 and f5 are re-pinned here to the two-code lists their
//     concrete twins f4/f6 already drew: bug 0129 landed first (0.171.0) and
//     ruled its ILL-FORMEDNESS-precedence law does not reach this pair —
//     both codes here read a WELL-FORMED array literal against a well-formed
//     sink and each earns its own verdict on its own subject, so "the element
//     check needs no gate" (0129 fix report, §"The boundary, and what 0157
//     inherits"). f4/f6 stay byte-unchanged: the bug 0081 fix's own sentence
//     on them ("0129's adjudication rules the class and may re-pin this cell
//     with its own authority") is now DISCHARGED by that same ruling — 0129
//     read the class and left them exactly as they stood. o1/o3/x1 are new:
//     rule 3's population, where the alias-spelled sink is not merely
//     relabelled: absent this fix it is REFUSED outright, `theta/parse/array-no-common-type`
//     firing outside its own registered Trigger ("no sink to narrow
//     against") because a sink was in fact written.
// ===========================================================================

describe("0125 (f) — the array-literal sink-routing siblings, closed by bug 0157's unfold-before-classify fix", () => {
  it("f1: an alias annotation of `array<string | integer>` admits a legal binding", () => {
    // Unaffected by the unfold-before-classify fix: the sink is now supplied
    // (`U`'s unfolded element type is `string | integer`), and rule 1 admits
    // both elements against it exactly as bug 0081's sink-less LUB already
    // did by coincidence — the sunk arm and the sink-less arm agree on this
    // input, so unfolding the sink changes nothing observable here.
    expect(
      codesOf(["schema U = array<string | integer>", 'let xs: U = ["a", 1]']),
      "the sunk arm now runs and admits both elements against U's unfolded union element type, agreeing with the sink-less LUB it superseded",
    ).toEqual([]);
  });

  it("f2: the same binding with a concrete annotation is admitted (control)", () => {
    expect(
      codesOf(['let xs: array<string | integer> = ["a", 1]']),
      "the concrete annotation reaches the element sink, so the union admits both elements",
    ).toEqual([]);
  });

  it("f3: an alias annotation of `array<string>` now draws both the outer and the element code", () => {
    // Bug 0157 §Fix (a): `sinkedArrayOf` unfolds `U` to `array<string>` and
    // supplies its element type as the sink, so the element check runs and
    // names the offending index — the diagnostic that stays unreachable
    // without the unfold. `checkLetRhsCompat` still reads the RAW `annotation` (§Fix (b)),
    // so the outer message keeps `expected U`, the alias name the author wrote.
    const diags = diagsOf(["schema U = array<string>", 'let xs: U = ["a", 1]']);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "the sunk arm now runs on the alias spelling exactly as it always did on the concrete one (f4), so the same two codes fire",
    ).toEqual(["theta/parse/let-rhs-type-mismatch", "theta/parse/array-element-type-mismatch"]);
    expect(
      messageFor(diags, "theta/parse/let-rhs-type-mismatch"),
      "code-registry-parse.md:59 — the outer code renders `expected U`, not `expected array<string>`: the alias name is preserved (§Fix (b))",
    ).toBe(
      msg("theta/parse/let-rhs-type-mismatch", [
        ["<name>", "xs"],
        ["<expected>", "U"],
        ["<actual>", "array<string | integer>"],
      ]),
    );
    expect(
      messageFor(diags, "theta/parse/array-element-type-mismatch"),
      "code-registry-parse.md:43 — the element diagnostic and its index, owed on both spellings once the sink is unfolded",
    ).toBe(
      msg("theta/parse/array-element-type-mismatch", [
        ["<i>", "1"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    );
  });

  it("f4: the same binding with a concrete annotation now ALSO reports the outer let-rhs mismatch", () => {
    // Bug 0081's union arm makes `["a", 1]`'s own type EXACT
    // (`array<string | integer>`), so `checkLetRhsCompat` now disagrees with
    // the concrete `array<string>` annotation too — where the pre-fix
    // `candidates[0]` erasure happened to read `array<string>` and agree with
    // it by accident. The element-sink check below is unmoved (it never went
    // through the sink-less LUB), so both codes now fire for the one written
    // mistake. The second code is open bug 0129's class: no sentence in the
    // corpus governs whether a second `E` may fire for a field type an
    // earlier code already refused, and 0129's adjudication rules the class
    // and may re-pin this cell with its own authority. Operator-authorized
    // beyond the bug 0081 doc's own flip list (fix report §Residuals item 1,
    // bucket iii).
    const diags = diagsOf(['let xs: array<string> = ["a", 1]']);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:40 trigger — an array-literal element that does not type-check against the surrounding sink's element type, now alongside the outer let-rhs mismatch the exact union also draws",
    ).toEqual(["theta/parse/let-rhs-type-mismatch", "theta/parse/array-element-type-mismatch"]);
    expect(
      messageFor(diags, "theta/parse/let-rhs-type-mismatch"),
      "code-registry-parse.md:54 — the new outer code's own registered Message, over the exact union `checkLetRhsCompat` now sees",
    ).toBe(
      msg("theta/parse/let-rhs-type-mismatch", [
        ["<name>", "xs"],
        ["<expected>", "array<string>"],
        ["<actual>", "array<string | integer>"],
      ]),
    );
    expect(
      messageFor(diags, "theta/parse/array-element-type-mismatch"),
      "code-registry-parse.md:40 — the *Message* column renders the index and the expected / actual pair",
    ).toBe(
      msg("theta/parse/array-element-type-mismatch", [
        ["<i>", "1"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    );
  });

  it("f5: an alias-typed schema FIELD now draws both the outer and the element code", () => {
    // The constructor-field twin of f3: `checkObjectField` unfolds the field's
    // raw `named(U)` declared type (§Fix (a)) and supplies its element type as
    // the sink, so the element check names the offending index here too.
    // `checkObjectFieldCompat` still reads the RAW `declared` (§Fix (b)), so
    // the outer message keeps `expected U`.
    const diags = diagsOf([
      "schema U = array<string>",
      "schema P {",
      "  xs: U",
      "}",
      'let p = P { xs: ["a", 1] }',
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "the constructor-field sink now draws the same two codes the let-rhs sink does in f3, mirroring f6's concrete twin",
    ).toEqual(["theta/parse/object-field-type-mismatch", "theta/parse/array-element-type-mismatch"]);
    expect(
      messageFor(diags, "theta/parse/object-field-type-mismatch"),
      "code-registry-parse.md:49 — the outer code renders `expected U`, the alias name the author wrote (§Fix (b))",
    ).toBe(
      msg("theta/parse/object-field-type-mismatch", [
        ["<field>", "xs"],
        ["<schema>", "P"],
        ["<expected>", "U"],
        ["<actual>", "array<string | integer>"],
      ]),
    );
    expect(
      messageFor(diags, "theta/parse/array-element-type-mismatch"),
      "code-registry-parse.md:43 — the element diagnostic and its index, owed on both spellings once the sink is unfolded",
    ).toBe(
      msg("theta/parse/array-element-type-mismatch", [
        ["<i>", "1"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    );
  });

  it("f6: the same field declared concretely now ALSO reports the outer object-field mismatch", () => {
    // The constructor-field twin of f4, and the operator-authorized second
    // cell: bug 0081's union arm makes `["a", 1]`'s type EXACT, so
    // `checkObjectFieldCompat` now disagrees with the concrete
    // `array<string>` field declaration too, alongside the unmoved
    // element-sink check below. The second code is open bug 0129's class (the
    // same disposition f4 records): no sentence in the corpus governs the
    // count, and 0129's adjudication rules the class and may re-pin this cell
    // with its own authority.
    const diags = diagsOf([
      "schema P {",
      "  xs: array<string>",
      "}",
      'let p = P { xs: ["a", 1] }',
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:40 trigger — the concrete field type reaches the element sink, now alongside the outer object-field mismatch the exact union also draws",
    ).toEqual(["theta/parse/object-field-type-mismatch", "theta/parse/array-element-type-mismatch"]);
    expect(
      messageFor(diags, "theta/parse/object-field-type-mismatch"),
      "code-registry-parse.md:46 — the new outer code's own registered Message, over the exact union `checkObjectFieldCompat` now sees",
    ).toBe(
      msg("theta/parse/object-field-type-mismatch", [
        ["<field>", "xs"],
        ["<schema>", "P"],
        ["<expected>", "array<string>"],
        ["<actual>", "array<string | integer>"],
      ]),
    );
    expect(
      messageFor(diags, "theta/parse/array-element-type-mismatch"),
      "code-registry-parse.md:40 — the rendered pair is what the alias spelling loses",
    ).toBe(
      msg("theta/parse/array-element-type-mismatch", [
        ["<i>", "1"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    );
  });

  it("f7: an empty literal under an alias annotation is admitted", () => {
    // The sink-routing divergence needs an element to disagree about, so the
    // empty literal agrees on both spellings. Held as the bound: a fix that
    // widened into the siblings must not move this pair either.
    expect(
      codesOf(["schema U = array<string>", "let xs: U = []"]),
      "an empty array literal has no element to route, so the two spellings agree",
    ).toEqual([]);
  });

  it("f8: the same empty literal under a concrete annotation is admitted (control)", () => {
    expect(
      codesOf(["let xs: array<string> = []"]),
      "the concrete spelling of f7's binding, which must stay identical to it",
    ).toEqual([]);
  });

  it("o1: an alias sink of `array<A | B>` admits two different named schemas (rule 3)", () => {
    // `A ⊑ A | B` and `B ⊑ A | B` by TYPE-4/TYPE-5, so rule 1 admits both
    // elements against `U`'s unfolded element type. Absent this fix this is
    // refused under `theta/parse/array-no-common-type` — an emission outside
    // that code's own registered Trigger ("no sink to narrow against"), since
    // a sink was in fact written.
    expect(
      codesOf([
        "schema A {",
        "  a: string",
        "}",
        "schema B {",
        "  b: string",
        "}",
        "schema U = array<A | B>",
        'let xs: U = [A { a: "x" }, B { b: "y" }]',
      ]),
      "a spec-legal binding under rule 1, no longer refused for the spelling of the sink it was written with",
    ).toEqual([]);
  });

  it("o3: an alias-union schema FIELD admits two different named schemas (rule 3)", () => {
    // The constructor-field twin of o1: `checkObjectField`'s unfolded
    // `declared` element type is the same union, so rule 1 admits here too.
    expect(
      codesOf([
        "schema A {",
        "  a: string",
        "}",
        "schema B {",
        "  b: string",
        "}",
        "schema U = array<A | B>",
        "schema P {",
        "  xs: U",
        "}",
        'let p = P { xs: [A { a: "x" }, B { b: "y" }] }',
      ]),
      "a spec-legal field value under rule 1, no longer refused for the field's alias spelling",
    ).toEqual([]);
  });

  it("x1: `schema U = array<A>` over two different named schemas draws the element mismatch, not the refusal", () => {
    // Rule 3's refusal face on a real error: with the sink unfolded, rule 1's
    // own `theta/parse/array-element-type-mismatch` is what is owed, naming
    // the offending element and its index — `array-no-common-type`'s Trigger
    // does not apply once a sink is supplied.
    const diags = diagsOf([
      "schema A {",
      "  a: string",
      "}",
      "schema B {",
      "  b: string",
      "}",
      "schema U = array<A>",
      'let xs: U = [A { a: "x" }, B { b: "y" }]',
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:43 trigger — the alias's unfolded element type A is the sink, and B fails against it",
    ).toEqual(["theta/parse/array-element-type-mismatch"]);
    expect(
      messageFor(diags, "theta/parse/array-element-type-mismatch"),
      "code-registry-parse.md:43 — the Message column renders the index and the expected / actual named schemas",
    ).toBe(
      msg("theta/parse/array-element-type-mismatch", [
        ["<i>", "1"],
        ["<expected>", "A"],
        ["<actual>", "B"],
      ]),
    );
  });
});

// ===========================================================================
// (g) Routes that are NOT this defect.
// ===========================================================================

describe("0125 (g) — the `let` route is closed and the `fn`-return route is out of reach", () => {
  it("g1: the `let` route already narrows an alias-typed array's element", () => {
    // Bug 0083 closed this route by recording the annotation in
    // TYPE-11-transparent form (src/parser/type-layer-checks.ts:643). This row
    // re-asserts it from this report's side, so the parameter route and the
    // binding route reach the same answer by different means — as they do for
    // the iterand and `join` gates after bug 0089.
    const diags = diagsOf([
      "schema L = array<string>",
      'let xs: L = ["a"]',
      "let y = xs[0]",
      "y.frobnicate()",
    ]);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "TYPE-11 — the `let` record is already transparent, so the index read narrows on this route independently of the parameter route's unfold",
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      messageFor(diags, "theta/parse/unknown-method"),
      "code-registry-parse.md:63 — the rendered element type on the closed route is `string`",
    ).toBe(
      msg("theta/parse/unknown-method", [
        ["<method>", "frobnicate"],
        ["<type>", "string"],
      ]),
    );
  });

  it("g2: an index read on a `fn` return typed by an alias reports nothing", () => {
    // Out of reach of this defect for a different reason, and g3 proves it:
    // `#typeExpr`'s `case "call"` (src/parser/static-type-inference.ts:251–252)
    // types a call as `{ kind: "named", name: callee }` and never consults the
    // declared return type, so the alias is not what is lost here. A separate
    // gap (0125 §Non-goals), untouched in either direction.
    expect(
      codesOf([
        "schema L = array<string>",
        "fn g(): L {",
        '  ["a"]',
        "}",
        "let y = g()[0]",
        "y.frobnicate()",
      ]),
      "0125 §Non-goals — the `fn`-return route loses the type at the `call` arm, not at the `index` arm",
    ).toEqual([]);
  });

  it("g3: the same read on a CONCRETE `fn` return type reports nothing (control)", () => {
    // Identical to g2, which is what makes g2 attributable to the `call` arm
    // rather than to the alias.
    expect(
      codesOf([
        "fn g(): array<string> {",
        '  ["a"]',
        "}",
        "let y = g()[0]",
        "y.frobnicate()",
      ]),
      "0125 §Non-goals — the concrete return type is lost at the same `call` arm, so the two spellings agree",
    ).toEqual([]);
  });
});
