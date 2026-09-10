import { describe, expect, it } from "vitest";
import {
  checkBooleanPosition,
  evaluateSource,
  type EvalHost,
} from "../src/runtime/expression-evaluator";
import type { CompatType } from "../src/parser/type-compat";
import type { ThetaValue } from "../src/runtime/value";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";

// V3a-T — failing tests for the paired `V3a` "expression evaluator".
//
// Spec: expressions.md (the EXPR code-keyed obligation area — no numbered
// REQ-IDs) and the `theta/parse/non-boolean-condition` diagnostic of
// expressions.md §Truthiness. Four obligations:
//
//   - Operator precedence / associativity match expressions.md §"Operator
//     precedence" (observed through evaluation results).
//   - Evaluation order / short-circuiting: a short-circuited (`&&` / `||`) or
//     not-taken (ternary) right operand's observable effect — its call — does
//     not run (expressions.md §"Evaluation order and short-circuiting").
//   - Equality / Ordering / Other arithmetic: cross-type `==` is `false`;
//     `integer ⊑ number` widening; `/` always `number`; div/mod-by-zero yields
//     `±Infinity` / `NaN` without panic; ordering against `NaN` is `false`
//     (expressions.md §Equality / §"Ordering comparisons" / §"Other arithmetic").
//   - `theta/parse/non-boolean-condition`: a non-`boolean` in an `if` / `while` /
//     ternary condition or `&&` / `||` operand fires the diagnostic at the
//     `type` phase (expressions.md §Truthiness).
//
// These tests red because the V3a interpreter and boolean-position check are
// absent: `evaluateSource` returns the inert `null` sentinel without evaluating
// or calling the host (so every value assertion reds on its own expectation and
// the short-circuit must-run assertion reds because the call is never recorded),
// and `checkBooleanPosition` returns no diagnostic (so the
// `theta/parse/non-boolean-condition` assertion reds on its absent diagnostic).
// No test reds on a compile error, a missing fixture, or a harness throw.

// --- Test host -------------------------------------------------------------

/**
 * A recording `EvalHost`: `vars` supplies identifier reads, and every
 * `callFunction` is appended to `calls` (the observable effect short-circuiting
 * must skip). A called function returns `onCall(name)` or `true` by default
 * (`&&` / `||` operands are `boolean`-typed).
 */
function makeHost(opts?: {
  vars?: Record<string, ThetaValue>;
  onCall?: (name: string) => ThetaValue;
}): { host: EvalHost; calls: string[] } {
  const calls: string[] = [];
  const vars = opts?.vars ?? {};
  const host: EvalHost = {
    resolveIdentifier(name: string): ThetaValue {
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        return vars[name] as ThetaValue;
      }
      // No silent skip: an unbound identifier in a test is a fixture defect.
      throw new Error(`test host: unbound identifier '${name}'`);
    },
    callFunction(name: string, _args: readonly ThetaValue[]): ThetaValue {
      calls.push(name);
      return opts?.onCall ? opts.onCall(name) : true;
    },
  };
  return { host, calls };
}

function evalExpr(source: string, host?: EvalHost): ThetaValue {
  return evaluateSource(source, host ?? makeHost().host);
}

// --- CompatType / site builders for the type-phase check -------------------

function prim(
  name: "string" | "number" | "integer" | "boolean" | "null",
): CompatType {
  return { kind: "prim", name };
}
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
function site(): { file: string; range: SourceRange } {
  return { file: "test.theta", range: span() };
}
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

// --- expressions.md §"Operator precedence" --------------------------------

// cka-3 / V3a: the EXPR code-keyed obligation area (expressions.md) closes across
// V3a (this evaluator core), V3f, V3g, V3h; the assertions below witness the V3a
// facet — operator precedence/associativity, evaluation order, and arithmetic —
// against the shipped interpreter.
describe("V3a-T — operator precedence and associativity (expressions.md §Operator precedence, EXPR code-keyed area / cka-3)", () => {
  it("EXPR precedence: `*` (level 3) binds tighter than `+` (level 4)", () => {
    // 2 + (3 * 4) = 14, not (2 + 3) * 4 = 20.
    expect(evalExpr("2 + 3 * 4")).toBe(14);
  });

  it("EXPR precedence: parentheses override the default precedence", () => {
    expect(evalExpr("(2 + 3) * 4")).toBe(20);
  });

  it("EXPR associativity: `+` / `-` (level 4) are left-associative", () => {
    // (2 - 3) - 4 = -5, not 2 - (3 - 4) = 3.
    expect(evalExpr("2 - 3 - 4")).toBe(-5);
  });

  it("EXPR precedence: unary `!` (level 2) binds tighter than `==` (level 6)", () => {
    // (!true) == false = false == false = true, not !(true == false) = true …
    // distinguished by the false-vs-true operand: !(true == true) == ((!true)==true)?
    // Use a discriminating form: !true == false → (!true)==false → true.
    expect(evalExpr("!true == false")).toBe(true);
  });

  it("EXPR precedence: ordering (level 5) binds tighter than equality (level 6)", () => {
    // (2 < 3) == true → true == true → true (not 2 < (3 == true), a type error).
    expect(evalExpr("2 < 3 == true")).toBe(true);
  });

  it("EXPR precedence: `&&` (level 7) binds tighter than `||` (level 8)", () => {
    // true || (false && false) → true. With `||` tighter it would be
    // (true || false) && false → false, so the result discriminates precedence.
    expect(evalExpr("true || false && false")).toBe(true);
  });

  it("EXPR associativity: ternary `?:` (level 9) is right-associative", () => {
    // false ? 1 : (true ? 2 : 3) = 2. Left-association would parse the inner
    // ternary as the then-branch and yield a different shape.
    expect(evalExpr("false ? 1 : true ? 2 : 3")).toBe(2);
  });

  it("EXPR precedence: unary `-` (level 2) binds tighter than `*` (level 3)", () => {
    // (-2) * 3 = -6.
    expect(evalExpr("-2 * 3")).toBe(-6);
  });

  it("EXPR: an identifier read resolves through the host in precedence context", () => {
    const { host } = makeHost({ vars: { x: 2 } });
    // x + 3 * 4 → 2 + (3*4) = 14.
    expect(evalExpr("x + 3 * 4", host)).toBe(14);
  });
});

// --- expressions.md §"Evaluation order and short-circuiting" --------------

describe("V3a-T — short-circuit observability (expressions.md §Evaluation order and short-circuiting, EXPR code-keyed area)", () => {
  it("EXPR short-circuit: `&&` evaluates the right call iff the left is `true`", () => {
    // Must-run case (reds the stub, which never calls the host): `true && rhs()`
    // evaluates the right operand's call.
    const run = makeHost({ onCall: () => true });
    evalExpr("true && rhs()", run.host);
    expect(run.calls, "the non-short-circuited right operand's call must run").toEqual([
      "rhs",
    ]);
    // Short-circuit case: `false && rhs()` does not evaluate the right call.
    const skip = makeHost({ onCall: () => true });
    evalExpr("false && rhs()", skip.host);
    expect(skip.calls, "the short-circuited right operand's call must not run").toEqual([]);
  });

  it("EXPR short-circuit: `||` evaluates the right call iff the left is `false`", () => {
    // Must-run case (reds the stub): `false || rhs()` evaluates the right call.
    const run = makeHost({ onCall: () => false });
    evalExpr("false || rhs()", run.host);
    expect(run.calls, "the non-short-circuited right operand's call must run").toEqual([
      "rhs",
    ]);
    // Short-circuit case: `true || rhs()` does not evaluate the right call.
    const skip = makeHost({ onCall: () => true });
    evalExpr("true || rhs()", skip.host);
    expect(skip.calls, "the short-circuited right operand's call must not run").toEqual([]);
  });

  it("EXPR evaluation order: a ternary evaluates only the taken branch's call", () => {
    const { host, calls } = makeHost({ onCall: () => true });
    // true ? taken() : skipped() → only taken() runs.
    evalExpr("true ? taken() : skipped()", host);
    expect(calls, "only the taken ternary branch's call runs").toEqual(["taken"]);
  });
});

// --- expressions.md §Equality / §Ordering / §Other arithmetic -------------

describe("V3a-T — equality, ordering, and arithmetic widening (expressions.md §Equality / §Ordering comparisons / §Other arithmetic, EXPR code-keyed area)", () => {
  it("EXPR equality: a cross-type `==` evaluates to `false` (no panic, no diagnostic)", () => {
    // 42 == true: neither static type ⊑ the other, so `==` is `false`.
    expect(evalExpr("42 == true")).toBe(false);
    // 1 == "1": cross-type → false.
    expect(evalExpr('1 == "1"')).toBe(false);
    // !=  is the negation: a cross-type `!=` is `true`.
    expect(evalExpr("42 != true")).toBe(true);
  });

  it("EXPR equality: `42 == 42.0` is `true` (integer ⊑ number routes to value comparison)", () => {
    expect(evalExpr("42 == 42.0")).toBe(true);
  });

  it("EXPR arithmetic: `integer ⊑ number` widening — a mixed `+` yields the numeric value", () => {
    // 1 (integer) + 2.5 (number) widens to number; the value is 3.5.
    expect(evalExpr("1 + 2.5")).toBe(3.5);
    // 2 * 3 stays integer-valued 6.
    expect(evalExpr("2 * 3")).toBe(6);
  });

  it("EXPR arithmetic: `/` always produces number and `n / 0` is `±Infinity` without panic", () => {
    expect(evalExpr("5 / 2")).toBe(2.5);
    expect(evalExpr("1 / 0")).toBe(Infinity);
    expect(evalExpr("-1 / 0")).toBe(-Infinity);
  });

  it("EXPR arithmetic: `0 / 0` and `n % 0` are `NaN` without panic", () => {
    expect(Number.isNaN(evalExpr("0 / 0") as number)).toBe(true);
    expect(Number.isNaN(evalExpr("5 % 0") as number)).toBe(true);
  });

  it("EXPR ordering: signed IEEE-754 order, and any ordering against `NaN` is `false`", () => {
    expect(evalExpr("-5 < 3")).toBe(true);
    // (0 / 0) is NaN; every ordering operator against NaN is false.
    expect(evalExpr("0 / 0 < 1")).toBe(false);
    expect(evalExpr("1 < 0 / 0")).toBe(false);
    expect(evalExpr("0 / 0 <= 0 / 0")).toBe(false);
  });
});

// --- expressions.md §Truthiness — theta/parse/non-boolean-condition ---------

describe("V3a-T — non-boolean condition (expressions.md §Truthiness)", () => {
  it("theta/parse/non-boolean-condition: a non-boolean ternary condition fires", () => {
    const diags = checkBooleanPosition({
      operandType: prim("string"),
      site: site(),
    });
    const d = withCode(diags, "theta/parse/non-boolean-condition");
    expect(d, "theta/parse/non-boolean-condition for a string ternary condition").toBeDefined();
    // Message from diagnostics/code-registry-parse.md.
    expect(d?.message).toBe("condition must be boolean; got string");
  });

  it("theta/parse/non-boolean-condition: a non-boolean `&&` operand fires; a boolean operand does not", () => {
    const diags = checkBooleanPosition({
      operandType: prim("number"),
      site: site(),
    });
    const d = withCode(diags, "theta/parse/non-boolean-condition");
    expect(d, "theta/parse/non-boolean-condition for a number && operand").toBeDefined();
    expect(d?.message).toBe("condition must be boolean; got number");

    // A `boolean` operand is admissible — the rule is not over-applied (theta
    // performs no truthiness coercion, but it also raises nothing on `boolean`).
    const ok = checkBooleanPosition({
      operandType: prim("boolean"),
      site: site(),
    });
    expect(
      withCode(ok, "theta/parse/non-boolean-condition"),
      "a boolean operand is admissible in boolean position",
    ).toBeUndefined();
  });

  it("theta/parse/non-boolean-condition: a non-boolean `if` / `while` condition fires", () => {
    const ifDiags = checkBooleanPosition({
      operandType: prim("integer"),
      site: site(),
    });
    expect(
      withCode(ifDiags, "theta/parse/non-boolean-condition"),
      "theta/parse/non-boolean-condition for an integer if condition",
    ).toBeDefined();

    const whileDiags = checkBooleanPosition({
      operandType: prim("null"),
      site: site(),
    });
    expect(
      withCode(whileDiags, "theta/parse/non-boolean-condition"),
      "theta/parse/non-boolean-condition for a null while condition",
    ).toBeDefined();
  });
});
