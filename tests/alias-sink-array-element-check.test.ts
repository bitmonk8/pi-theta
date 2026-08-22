import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { findCode, parseDoc } from "./helpers/e2e-s1";

// Bug 0157 — the three array-literal sink dispatches classify the sink by a raw
// `CompatType.kind` with no `unfoldAlias`, so an alias-spelled `array<T>`
// annotation or field type routes the literal down the sink-LESS
// `checkCommonType` arm and one written mistake draws a different code set on
// each spelling of the same sink
// (docs/bugs/0157-alias-vs-concrete-sink-spelling-code-divergence.md).
//
// THE THREE SITES, named by symbol (src/parser/type-layer-checks.ts moved five
// times since the report was filed, so no line citation into it is durable):
//   1. `walkStmt`'s `case "let"` array dispatch — the
//      `stmt.init.kind === "array" && annotation.kind === "array"` test, where
//      `annotation` is `annotationToCompatType(stmt.annotation)`.
//   2. `sinkedArrayOf` — its `annotation.kind === "array"` conjunct. A `null`
//      return is `walkExpr`'s absent `skipArray`, which is what lets the
//      sink-less `case "array"` arm run on the same node.
//   3. `checkObjectField` — the `value.kind === "array" && declared.kind ===
//      "array"` test, where `declared` is the schema's raw declared field type.
// An alias-spelled sink has kind `named`, so all three tests are false and
// `checkCommonType` (src/parser/type-compat.ts) reaches its `sink === undefined`
// arm: `theta/parse/array-no-common-type` is minted only there, which makes its
// presence in a cell that writes a sink a direct observation of the routing.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/expressions.md:226, array-construction rule 1 — "If a
//     type sink is in scope (binding annotation, parameter type, etc.), every
//     element must satisfy `T_element ⊑ T_sinkElement`; a mismatch is
//     `theta/parse/array-element-type-mismatch` naming the offending element".
//     The rule is written over the PRESENCE of a sink and over the sink's
//     element type; it says nothing about how the sink's type is spelled.
//   - docs/spec_topics/expressions.md:228, rule 3 — an array literal of two
//     different named schemas "yields `array<A | B>` only if some sink in scope
//     expects a union; otherwise it is `theta/parse/array-no-common-type`". The
//     alias-union cells below write exactly such a sink.
//   - docs/spec_topics/type-system.md:54, TYPE-11 — an alias schema
//     `schema X = R` "is **transparent** in `⊑`: on whichever side of a
//     `T₁ ⊑ T₂` check it appears, it is replaced by its right-hand side `R` and
//     the check re-evaluated, recursing through nested aliases until a non-alias
//     form is reached". Rule 1's obligation IS such a check, so computing
//     `T_sinkElement` for a sink declared `U` requires the replacement first.
//   - docs/spec_topics/type-system.md:52, TYPE-10 — object-schema named types
//     stay nominal and TYPE-11 "never reopens TYPE-10's nominal case". This
//     bounds the unfolding: group (e) holds an alias of an object schema and two
//     unresolvable spellings, none of which may become an array sink.
//   - Registry rows (DIAG-2, the closed authority on emissions):
//     docs/spec_topics/diagnostics/code-registry-parse.md:43
//     (`theta/parse/array-element-type-mismatch`), `:44`
//     (`theta/parse/array-no-common-type`, whose *Trigger* reads "no sink to
//     narrow against"), `:59` (`theta/parse/let-rhs-type-mismatch`), `:49`
//     (`theta/parse/object-field-type-mismatch`), `:135`
//     (`theta/parse/fn-arg-type-mismatch`), `:50`
//     (`theta/parse/bare-object-literal`), `:19`
//     (`theta/parse/binding-case-mismatch`).
//
// THE COUNT, AND WHY NO GATE. Routing the alias spelling down the element check
// makes each defect cell draw TWO `E` codes, as its concrete twin already does.
// Bug 0129 landed first (0.171.0) and stated the law this file cites rather than
// restates, verbatim from its ## Fix:
//
//   > Where a construct's own position-rule walk has already drawn an
//   > `E`-severity diagnostic refusing that construct as ILL-FORMED, a row whose
//   > verdict is DERIVED from reading the same construct as a well-formed type
//   > withholds, and the refusal fires alone.
//
// The same record rules these cells outside that law — "in 0157's cells both
// codes read a WELL-FORMED array literal against a well-formed sink and each
// earns its own verdict on its own subject … **the element check needs no
// gate**" — so every defect cell below expects both codes, ordered, with the
// outer code first.
//
// THE ALIAS NAME IS PRESERVED in the outer message (bug 0157 §Fix (b)): the
// defect cells expect `expected U`, not `expected array<string>`. Only the
// element diagnostic and its index are owed; the outer check already unfolds
// through `checkCompatible` and its rendered `<expected>` is not this report's
// subject.
//
// PER-SITE RED (bug 0157 §Fix (f)). The groups below are cut so a red is
// attributable to one production site:
//   - group (a) depends on the `let` arm's dispatch AND on `sinkedArrayOf`
//     (they must reach the same verdict for the same `stmt`, or the literal is
//     checked twice or not at all);
//   - group (b) depends on `checkObjectField` alone;
//   - group (c) is the concrete twins, which establish each checker fires at all
//     on this harness, so a red in an alias twin is the spelling and not an
//     absent check;
//   - groups (d) and (e) are the bounds §Fix (a) forbids moving.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a source string, so an integration or live
// tier would add a session round-trip to a parse-time observable and buy no
// reach. The registration consequence — an alias-union theta refused by an `E`
// code — is covered live in
// tests/live/alias-sink-array-element-check-live-cell.test.ts.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md): no asserted message
// string is written out here. Every one is READ from the registry's *Message*
// column through `parseRegistry` / `registryMessage`
// (tools/code-registry/index.js) and the `msg` helper below, so a reworded
// template reds by naming the registry rather than by a bare string mismatch.
// No message assertion uses containment.
//
// ANTI-VACUITY. Group (f) shows the harness reaches the checkers and reports,
// and reports nothing on the conformant twin, so no `toEqual([])` cell above is
// a harness that stopped measuring.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. The registry lookup asserts its row's presence and
// each named placeholder before the template is filled.

const ELEMENT = "theta/parse/array-element-type-mismatch";
const NO_COMMON = "theta/parse/array-no-common-type";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const OBJECT_FIELD = "theta/parse/object-field-type-mismatch";
const FN_ARG = "theta/parse/fn-arg-type-mismatch";
const BARE_OBJECT = "theta/parse/bare-object-literal";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const UNRESOLVED_NAMED = "theta/parse/unresolved-named-type";

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

/** The two object schemas rule 3's population is written over. */
const AB: readonly string[] = ["schema A {", "  a: string", "}", "schema B {", "  b: string", "}"];

// ===========================================================================
// (a) The `let` dispatch and `sinkedArrayOf` — the two sites that must agree
//     on the same `stmt`. Every cell here reds if either is left classifying
//     the raw annotation.
// ===========================================================================

describe("0157 (a) — an alias-spelled binding annotation supplies the element sink", () => {
  it("f3': `schema U = array<string>` + `let xs: U = [\"a\", 1]` names the offending element and its index", () => {
    // Rule 1's obligation against `U`'s unfolded element type `string`. The
    // outer code keeps the alias name the author wrote (§Fix (b)); the element
    // code carries the index, which is the only output naming WHICH element is
    // wrong.
    const diags = diagsOf(["schema U = array<string>", 'let xs: U = ["a", 1]']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([LET_RHS, ELEMENT]);
    expect(messageFor(diags, LET_RHS)).toBe(
      msg(LET_RHS, [
        ["<name>", "xs"],
        ["<expected>", "U"],
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

  it("m1': the index is the offending element's, not a constant", () => {
    // The repeated `string` arm in the outer `<actual>` is bug 0081's pinned
    // arms-verbatim disposition, identical on both spellings.
    const diags = diagsOf(["schema U = array<string>", 'let xs: U = ["a", "b", 1]']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([LET_RHS, ELEMENT]);
    expect(messageFor(diags, LET_RHS)).toBe(
      msg(LET_RHS, [
        ["<name>", "xs"],
        ["<expected>", "U"],
        ["<actual>", "array<string | string | integer>"],
      ]),
    );
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "2"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    );
  });

  it("s1': a nested array element type is named in the element diagnostic", () => {
    // The loss is not confined to primitive element types: `expected
    // array<string>, got array<integer>` is carried by no part of the outer
    // message.
    const diags = diagsOf(["schema U = array<array<string>>", 'let xs: U = [["a"], [1]]']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([LET_RHS, ELEMENT]);
    expect(messageFor(diags, LET_RHS)).toBe(
      msg(LET_RHS, [
        ["<name>", "xs"],
        ["<expected>", "U"],
        ["<actual>", "array<array<string> | array<integer>>"],
      ]),
    );
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "array<string>"],
        ["<actual>", "array<integer>"],
      ]),
    );
  });

  it("n1': a two-hop alias behaves as the one-hop spelling", () => {
    // TYPE-11 recurses "through nested aliases until a non-alias form is
    // reached", so depth must not defeat the dispatch.
    const diags = diagsOf(["schema V = array<string>", "schema U = V", 'let xs: U = ["a", 1]']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([LET_RHS, ELEMENT]);
    expect(messageFor(diags, LET_RHS)).toBe(
      msg(LET_RHS, [
        ["<name>", "xs"],
        ["<expected>", "U"],
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

  it("o1: an alias of `array<A | B>` admits two different named schemas", () => {
    // `A ⊑ A | B` and `B ⊑ A | B` by TYPE-4/TYPE-5, so rule 1 admits both
    // elements against `U`'s unfolded element type. A conformant source: the
    // sink rule 3 asks for is in scope and expects the union.
    expect(
      codesOf([...AB, "schema U = array<A | B>", 'let xs: U = [A { a: "x" }, B { b: "y" }]']),
    ).toEqual([]);
  });

  it("x1: an alias of `array<A>` reports the element mismatch, not the no-common-type refusal", () => {
    // The same routing on a real error. `array-no-common-type`'s registered
    // *Trigger* requires "no sink to narrow against"; a sink is written here,
    // so rule 1's own diagnostic is what is owed.
    const diags = diagsOf([...AB, "schema U = array<A>", 'let xs: U = [A { a: "x" }, B { b: "y" }]']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "A"],
        ["<actual>", "B"],
      ]),
    );
  });
});

// ===========================================================================
// (b) `checkObjectField` — the constructor-field route, reached through the
//     schema's raw declared field type. Both cells here red on that site
//     alone; neither depends on the `let` arm or on `sinkedArrayOf`.
// ===========================================================================

describe("0157 (b) — an alias-spelled schema field type supplies the element sink", () => {
  it("f5': `schema P { xs: U }` names the offending element and its index", () => {
    // TYPE-11 makes a field declared `U` a field declared `array<string>`.
    const diags = diagsOf([
      "schema U = array<string>",
      "schema P {",
      "  xs: U",
      "}",
      'let p = P { xs: ["a", 1] }',
    ]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([OBJECT_FIELD, ELEMENT]);
    expect(messageFor(diags, OBJECT_FIELD)).toBe(
      msg(OBJECT_FIELD, [
        ["<field>", "xs"],
        ["<schema>", "P"],
        ["<expected>", "U"],
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

  it("o3: an alias-union field type admits two different named schemas", () => {
    expect(
      codesOf([
        ...AB,
        "schema U = array<A | B>",
        "schema P {",
        "  xs: U",
        "}",
        'let p = P { xs: [A { a: "x" }, B { b: "y" }] }',
      ]),
    ).toEqual([]);
  });
});

// ===========================================================================
// (c) The concrete twins. Each establishes that the checker its alias twin
//     above expects fires at all on this harness, so a red in group (a) or (b)
//     is the spelling and not an absent check. All are green at HEAD and must
//     stay byte-identical in disposition.
// ===========================================================================

describe("0157 (c) — the concrete-spelling controls", () => {
  it("f4: `let xs: array<string> = [\"a\", 1]` draws the outer code and the element code", () => {
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

  it("f6: the concrete field twin draws both codes", () => {
    const diags = diagsOf(["schema P {", "  xs: array<string>", "}", 'let p = P { xs: ["a", 1] }']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([OBJECT_FIELD, ELEMENT]);
    expect(messageFor(diags, OBJECT_FIELD)).toBe(
      msg(OBJECT_FIELD, [
        ["<field>", "xs"],
        ["<schema>", "P"],
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

  it("m2: the concrete twin's element index is 2", () => {
    const diags = diagsOf(['let xs: array<string> = ["a", "b", 1]']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([LET_RHS, ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "2"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    );
  });

  it("s2: the concrete nested twin names the nested element types", () => {
    const diags = diagsOf(['let xs: array<array<string>> = [["a"], [1]]']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([LET_RHS, ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "array<string>"],
        ["<actual>", "array<integer>"],
      ]),
    );
  });

  it("x2: the concrete single-schema element sink names the offending element", () => {
    const diags = diagsOf([...AB, 'let xs: array<A> = [A { a: "x" }, B { b: "y" }]']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([ELEMENT]);
    expect(messageFor(diags, ELEMENT)).toBe(
      msg(ELEMENT, [
        ["<i>", "1"],
        ["<expected>", "A"],
        ["<actual>", "B"],
      ]),
    );
  });

  it("o2 / o4: the concrete union sink admits, on both the binding and the field route", () => {
    expect(codesOf([...AB, 'let xs: array<A | B> = [A { a: "x" }, B { b: "y" }]'])).toEqual([]);
    expect(
      codesOf([
        ...AB,
        "schema P {",
        "  xs: array<A | B>",
        "}",
        'let p = P { xs: [A { a: "x" }, B { b: "y" }] }',
      ]),
    ).toEqual([]);
  });

  it("w2 / w4 / z2: the concrete twins of the silent bounds are silent", () => {
    expect(codesOf(["let xs: array<number> = [1, 2.5]"])).toEqual([]);
    expect(codesOf(['let xs: array<string> = ["a", "b"]'])).toEqual([]);
    expect(
      codesOf(["fn f(p: Nope) {", '  let xs: array<string> = ["a", p]', "  xs", "}", "1"]),
    ).toEqual([]);
  });

  it("p2: the concrete `fn`-parameter twin draws the argument code THEN the element code, closed by bug 0156's fix", () => {
    // Bug 0156 (fixed, §Fix Route A) supplies the callee's declared parameter
    // type as the array literal's element sink at the argument position, so
    // this cell gains the two-code shape its LET twin (m1) already carries.
    // Bug 0129's landed count-consequence law (`## Fix (0.171.0)`) withholds a
    // derived verdict only where an earlier row refused the SAME construct as
    // ill-formed; here both codes read a well-formed literal against a
    // well-formed sink on their own subjects, so the law does not gate either
    // away and the count stands at two.
    const diags = diagsOf(["fn f(xs: array<string>) {", "  1", "}", 'f(["a", 1])']);
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

  it("o6: the concrete `fn`-parameter union twin now admits, closed by bug 0156's fix", () => {
    // The callee's `array<A | B>` parameter is now supplied as the sink, so
    // both elements satisfy rule 1 against the union and nothing fires — the
    // same admission o2/o4 already measure at the two wired sinks. This cell
    // was `theta/parse/array-no-common-type` while bug 0156 was open.
    expect(
      codesOf([...AB, "fn f(xs: array<A | B>) {", "  1", "}", 'f([A { a: "x" }, B { b: "y" }])']),
    ).toEqual([]);
  });
});

// ===========================================================================
// (d) The bounds §Fix (a) forbids moving. Every cell agrees across the two
//     spellings already; unfolding before classifying must leave each where it
//     is. A red here is over-reach, not under-reach.
// ===========================================================================

describe("0157 (d) — the bounds the unfolding must not move", () => {
  it("f1 / f2: a union alias whose unfolded element type admits stays silent on both spellings", () => {
    // Bug 0081's union arm gives `["a", 1]` the type `array<string | integer>`,
    // and `string | integer` admits both elements under rule 1, so supplying
    // the sink changes nothing here.
    expect(codesOf(["schema U = array<string | integer>", 'let xs: U = ["a", 1]'])).toEqual([]);
    expect(codesOf(['let xs: array<string | integer> = ["a", 1]'])).toEqual([]);
  });

  it("f7 / f8: an empty literal has no element to route", () => {
    expect(codesOf(["schema U = array<string>", "let xs: U = []"])).toEqual([]);
    expect(codesOf(["let xs: array<string> = []"])).toEqual([]);
  });

  it("w1 / w3: `integer ⊑ number` widening and a homogeneous legal literal stay silent under an alias sink", () => {
    expect(codesOf(["schema U = array<number>", "let xs: U = [1, 2.5]"])).toEqual([]);
    expect(codesOf(["schema U = array<string>", 'let xs: U = ["a", "b"]'])).toEqual([]);
  });

  it("z1: an element whose type is past the static view keeps deferring under an alias sink", () => {
    // type-system.md:48 — an unresolvable operand is skipped and the runtime
    // AJV check is the safety net. The sunk arm must skip the `unknown` branch,
    // which is what keeps this cell silent once the sink is supplied.
    expect(
      codesOf(["schema U = array<string>", "fn f(p: Nope) {", '  let xs: U = ["a", p]', "  xs", "}", "1"]),
    ).toEqual([]);
  });

  it("p1: the alias-spelled `fn`-parameter sink now also draws the argument code THEN the element code, closed by bug 0156's fix reaching the alias-unfolded sink", () => {
    // Bug 0156's fix unfolds the parameter type (TYPE-11) before classifying
    // it — the law bug 0157 landed for the two wired dispatches, now reached at
    // the third — so the alias spelling gains the same element code p2's
    // concrete spelling draws. The outer message still names the alias `U`,
    // unchanged: that check reads the RAW declared type and is not this fix's
    // subject. Bug 0129's count-consequence law does not gate either code away
    // for the same reason p2's comment states.
    const diags = diagsOf(["schema U = array<string>", "fn f(xs: U) {", "  1", "}", 'f(["a", 1])']);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([FN_ARG, ELEMENT]);
    expect(messageFor(diags, FN_ARG)).toBe(
      msg(FN_ARG, [
        ["<name>", "f"],
        ["<i>", "0"],
        ["<param>", "xs"],
        ["<expected>", "U"],
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

  it("o5: an alias-union `fn` parameter now admits too, closed by bug 0156's fix reaching the alias-unfolded sink", () => {
    // TYPE-11 unfolds `U` to `array<A | B>` before classifying, so the alias
    // spelling of the union sink admits on the same footing as o6's concrete
    // spelling. Was `theta/parse/array-no-common-type` while bug 0156 was
    // open.
    expect(
      codesOf([
        ...AB,
        "schema U = array<A | B>",
        "fn f(xs: U) {",
        "  1",
        "}",
        'f([A { a: "x" }, B { b: "y" }])',
      ]),
    ).toEqual([]);
  });

  it("i1 / i2 / i3: an inline-object sink never reaches these dispatches", () => {
    // A bare `{ … }` in value position is refused before any field value is
    // routed, whether the annotation is written inline or through an alias; the
    // annotation itself is legal and silent.
    const i1 = diagsOf(['let p: { xs: array<string> } = { xs: ["a", 1] }']);
    expect(i1.map((d: Diagnostic) => d.code)).toEqual([BARE_OBJECT]);
    expect(messageFor(i1, BARE_OBJECT)).toBe(msg(BARE_OBJECT, []));
    const i2 = diagsOf(["schema U = { xs: array<string> }", 'let p: U = { xs: ["a", 1] }']);
    expect(i2.map((d: Diagnostic) => d.code)).toEqual([BARE_OBJECT]);
    expect(messageFor(i2, BARE_OBJECT)).toBe(msg(BARE_OBJECT, []));
    expect(codesOf(["fn h(p: { xs: array<string> }) {", "  1", "}", "1"])).toEqual([]);
  });
});

// ===========================================================================
// (e) TYPE-10's bound. `unfoldAlias` leaves an object-schema `named` and an
//     unresolvable `named` intact, so neither may become an array sink. These
//     three cells are measured at HEAD and must read identically after the
//     unfolding is hoisted — they are the over-reach tripwire on it.
// ===========================================================================

describe("0157 (e) — TYPE-10: an alias that unfolds to a non-array keeps its disposition", () => {
  it("an alias of an object schema does not become an array sink", () => {
    // TYPE-11: aliasing an object schema "unfolds to that object schema, which
    // then participates under the nominal rules of TYPE-10". The unfolded value
    // is a `named`, so the array dispatch stays false and a conformant
    // construction loads clean.
    expect(
      codesOf(["schema A {", "  a: string", "}", "schema U = A", 'let x: U = A { a: "x" }']),
    ).toEqual([]);
  });

  it("an unresolvable annotation over an array literal keeps deferring", () => {
    expect(codesOf(['let y: Ghost = ["a", 1]'])).toEqual([]);
  });

  it("an alias of an unresolvable name draws the alias's own refusal and nothing element-shaped", () => {
    // The declaration itself is refused; no array-position code joins it,
    // because the unfolded annotation is still a `named` no `TypeEnv` resolves.
    expect(codesOf(["schema U = Ghost", 'let y: U = ["a", 1]'])).toEqual([UNRESOLVED_NAMED]);
  });
});

// ===========================================================================
// (f) Anti-vacuity.
// ===========================================================================

describe("0157 (f) — the harness reaches the checkers", () => {
  it("reports on a non-conformant binding name and stays silent on the conformant twin", () => {
    const diags = diagsOf(["let Xs = 1"]);
    expect(diags.map((d: Diagnostic) => d.code)).toEqual([BINDING_CASE]);
    expect(messageFor(diags, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
    expect(codesOf(["let xs = 1"])).toEqual([]);
  });
});
