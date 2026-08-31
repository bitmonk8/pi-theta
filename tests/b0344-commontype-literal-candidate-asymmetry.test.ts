import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0344 — `commonType`'s dominating-candidate search (`commonType` in
// src/parser/type-compat.ts) relates each branch against each candidate
// as-is, so a `{ kind: "literal", typesAs: "number" }` candidate is never
// widened to the primitive it types as before the domination test. `decide`'s
// literal-target arm (`decide` in src/parser/type-compat.ts) refuses a `prim`
// source against a literal target, and the reverse candidate resolves
// `literal number ⊑ prim integer` to `integer-narrowing` through
// `decidePrimitive`; neither branch dominates, so the search falls through to
// the union arm and `[n, 1.5]` over an `integer`-typed `n` reduces to element
// type `integer | number` instead of the primitive `number`. The union
// element then refuses `xs[0] + 1` as `theta/parse/mixed-plus-operands` — a
// read a correctly-typed `array<number>` element accepts.
// (docs/bugs/0344-commontype-literal-candidate-asymmetry-yields-union-not-primitive.md)
//
// SETTLED FIX (bug doc §Fix): widen a literal candidate to the primitive it
// types as before the domination test — reuse `widenLiteralTypes`
// (src/parser/type-compat.ts, the function bug 0341 already ships) to derive
// each candidate's expression-position type. With the `1.5` candidate
// compared as `prim number`, `prim number` dominates `prim integer` under
// TYPE-2 and the LUB is `number`, so `[n, 1.5]` types `array<number>`. `⊑` is
// unchanged; the object-branch gate keeps its disposition; the
// `concatElementType` mirror is out of scope.
//
// WITNESS TABLE (Observed = current/RED, Expected = the settled contract):
//   A  WITNESS  `[n, 1.5]` element type, inferred == annotated   union -> number
//   B  WITNESS  `xs[0] + 1` over `[n, 1.5]` admits               refused -> []
//   C  WITNESS  `[1.5, n]` is commutative with `[n, 1.5]`        union -> number
//   D  CONTROL  pure-literal `[1.5, 2.5]` display unchanged      number = number
//   E  CONTROL  dominator-less `["a", null]` still unions        union = union
//   F  CONTROL  object-branch set still refuses to unify         refuse = refuse
//   G  CONTROL  integer-only `[n, 2]` stays integer              integer = integer
//
// RED-FOR-RIGHT-REASON: A and C fail because the sink message names the union
// `integer | number` (or `number | integer`) where the widened primitive
// yields `number`; B fails because the refusal `theta/parse/mixed-plus-operands`
// is present where the collapsed element admits `[]`. D/E/F/G are green in
// both directions and prove the widening collapses only the mixed
// prim-integer + literal-number pairing, leaving the union arm and the
// object-branch gate untouched.

const NO_COMMON = "theta/parse/array-no-common-type";

/** Parse a body under the minimal frontmatter every cell here shares. */
function diagnosticsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc(`---\ndescription: b0344\nmode: prompt\n---\n${body.join("\n")}\n`).diagnostics;
}

function codesOf(body: readonly string[]): string[] {
  return diagnosticsOf(body).map((d) => d.code);
}

function messagesOf(body: readonly string[]): string[] {
  return diagnosticsOf(body).map((d) => d.message);
}

/**
 * The `array<string>` sink message that prints the reduced element type. An
 * `array<T>` initialiser assigned to `let ys: array<string>` mismatches, and
 * the mismatch renders `got array<T>` — the only offline surface that exposes
 * `commonType`'s reduced element type verbatim.
 */
function sink(element: string): string {
  return `let binding 'ys' initialiser type mismatch: expected array<string>, got array<${element}>`;
}

describe("bug 0344 (a) — `[n, 1.5]` types `array<number>`, inferred and annotated agree", () => {
  it("A: the mixed prim-integer + literal-number element collapses to `number` for both spellings", () => {
    const annotated = messagesOf([
      "let n: integer = 1",
      "let xs = [n, 1.5]",
      "let ys: array<string> = xs",
      "ys",
    ]);
    const inferred = messagesOf([
      "let n = 1",
      "let xs = [n, 1.5]",
      "let ys: array<string> = xs",
      "ys",
    ]);
    // The twins agreeing is bug 0341's landed state and must survive this fix;
    // the LUB collapsing from the union to the primitive is this fix.
    expect(inferred).toEqual(annotated);
    expect(annotated).toEqual([sink("number")]);
  });
});

describe("bug 0344 (b) — an element read over `[n, 1.5]` is admitted to `+`", () => {
  it("B: `xs[0] + 1` over an inferred `[n, 1.5]` binding admits", () => {
    // `xs[0]` reads `number`, so `xs[0] + 1` is `number + integer`, which the
    // `+` rule widens to `number`. The union element instead reports
    // `'+' has mixed operand types: integer | number and integer`
    // (`theta/parse/mixed-plus-operands`); the collapse to `number` removes
    // the spurious refusal.
    expect(codesOf(["let n = 1", "let xs = [n, 1.5]", "xs[0] + 1"])).toEqual([]);
  });

  it("B2: the same read carries no diagnostic message", () => {
    // Pinned as the admitting outcome so the cell flips to green with the fix
    // rather than inverting. The current refusal message on this surface is
    // `'+' has mixed operand types: integer | number and integer`.
    expect(messagesOf(["let n = 1", "let xs = [n, 1.5]", "xs[0] + 1"])).toEqual([]);
  });
});

describe("bug 0344 (c) — the LUB is order-independent", () => {
  it("C: `[1.5, n]` reduces to the same `array<number>` as `[n, 1.5]`", () => {
    const forward = messagesOf([
      "let n = 1",
      "let xs = [n, 1.5]",
      "let ys: array<string> = xs",
      "ys",
    ]);
    const reversed = messagesOf([
      "let n = 1",
      "let xs = [1.5, n]",
      "let ys: array<string> = xs",
      "ys",
    ]);
    // Branch order must not decide the LUB; the current search unions the
    // reversed set as `number | integer`, mirroring the forward `integer |
    // number`, so ordering leaks into the element type.
    expect(reversed).toEqual(forward);
    expect(reversed).toEqual([sink("number")]);
  });
});

describe("bug 0344 (d) — a pure-literal numeric set is unchanged", () => {
  it("D: `[1.5, 2.5]` displays `array<number>`", () => {
    // Two `literal` candidates already collapse through `decidePrimitive`; the
    // displayed element is unmoved even though the widened candidate the fix
    // returns is a `prim` rather than a `literal`.
    expect(messagesOf(["let xs = [1.5, 2.5]", "let ys: array<string> = xs", "ys"])).toEqual([
      sink("number"),
    ]);
  });
});

describe("bug 0344 (e) — a dominator-less set still unions", () => {
  it("E: `[\"a\", null]` reduces to `array<string | null>`", () => {
    // `string` and `null` have no dominator under `⊑`, so the union arm
    // governs; widening literals to primitives never manufactures a dominator
    // here, and the element stays the byte-identical union.
    expect(messagesOf(['let xs = ["a", null]', "let ys: array<string> = xs", "ys"])).toEqual([
      sink("string | null"),
    ]);
  });
});

describe("bug 0344 (f) — an object-branch set still refuses to unify", () => {
  it("F: a two-arm literal of two distinct object schemas refuses `array-no-common-type`", () => {
    // The object-branch gate (`isObjectBranch` in src/parser/type-compat.ts)
    // tests branch KIND; widening literals to primitives cannot turn a branch
    // into or out of an object branch, so a set holding a non-dominating
    // object branch still refuses implicit unification. Mirrors the r7 fixture
    // in tests/array-ternary-common-type-union.test.ts.
    const body = [
      "schema A {\n  a: integer\n}",
      "schema B {\n  b: string\n}",
      'let x = [A { a: 1 }, B { b: "x" }]',
      "x",
    ];
    expect(codesOf(body)).toContain(NO_COMMON);
  });
});

describe("bug 0344 (g) — an integer-only set stays `array<integer>`", () => {
  it("G: `[n, 2]` over an `integer`-typed `n` displays `array<integer>`", () => {
    // Both candidates type as `integer`; no `number` is present to widen
    // toward, so the element stays `integer` and the diagnostic is unmoved.
    expect(
      messagesOf(["let n: integer = 1", "let xs = [n, 2]", "let ys: array<string> = xs", "ys"]),
    ).toEqual([sink("integer")]);
  });
});
