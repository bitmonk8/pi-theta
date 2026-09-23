// V19c / V19c-T — the statement executor's scalar operator family.
//
// This module carries the executor's pure operator dispositions — the
// compound-assignment application (`applyCompound`), the non-short-circuit
// binary scalar disposition (`applyBinaryScalar`), and the stdlib
// method-surface dispatch (`applyStdlibMethod`) — applied by
// `statement-executor.ts` to operands it has already resolved. Pure value →
// value functions: no effect dispatch and no back-references into the
// executor live here.
//
// Spec: expressions.md (§Equality, §Ordering, §"Other arithmetic"),
// bindings.md (§compound-assignment-desugar).

import {
  BinaryMixedOperandError,
  BinaryNonNumericError,
  CompoundNonNumericError,
} from "./executor-defects";
import { nonObjectReceiverRejection } from "./runtime-panics";
import { evaluateStringMember } from "./stdlib-string";
import { evaluateArrayMember } from "./stdlib-array";
import { evaluateObjectMember } from "./stdlib-object";
import { isObjectValue, valuesEqual, type ThetaValue } from "./value";

/**
 * Apply a compound-assignment operator. `+=` mirrors `applyBinaryScalar`'s
 * `+` arm exactly (string+string concatenates, two-number addition, else the
 * bug 0368 belt) — the shared runtime semantics for `+`, since bindings.md
 * defines `x += e` as `x = x + e` and the parse-time `+`-operand gate has
 * already refused every statically-resolvable mixed pair; an unresolvable
 * pair defers and takes the same shared `+` arm as the spelled binary, so a
 * mixed pair laundered past the reassign gate must abort loudly rather than
 * silently coerce (bug 0368). `-=`/`*=`/`/=`/`%=` are numeric-only: a
 * non-number operand throws `CompoundNonNumericError` rather than silently
 * computing over a fabricated `0` (bug 0314).
 */
export function applyCompound(
  op: "+=" | "-=" | "*=" | "/=" | "%=",
  current: ThetaValue,
  delta: ThetaValue,
): ThetaValue {
  if (op === "+=") {
    if (typeof current === "string" && typeof delta === "string") {
      return current + delta;
    }
    if (typeof current === "number" && typeof delta === "number") {
      return current + delta;
    }
    throw new BinaryMixedOperandError("+", current, delta);
  }
  if (typeof current !== "number" || typeof delta !== "number") {
    throw new CompoundNonNumericError(op, current, delta);
  }
  // `x <op>= e` is `x = x <op> e` (bindings.md §compound-assignment-desugar):
  // strip the trailing `=` and apply the one shared arithmetic switch.
  return applyNumericArithmetic(op.slice(0, 1) as "-" | "*" | "/" | "%", current, delta);
}

/**
 * Apply one of the four numeric-only arithmetic operators to two numbers —
 * native IEEE-754 semantics with non-panicking div/mod (`n / 0` → `Infinity`,
 * `n % 0` → `NaN`; expressions.md §"Other arithmetic"). The ONE arithmetic
 * switch shared by the compound-assignment application (`applyCompound`), the
 * binary scalar disposition (`applyBinaryScalar`), and the pure host
 * (`pure-expression-evaluator.ts`), so the two expression forms and the two
 * hosts cannot drift apart on arithmetic semantics. Each caller keeps its own
 * per-site non-numeric guard ahead of this (bug 0314 / bug 0332 / bug 0338
 * belts, with per-site error classes).
 */
export function applyNumericArithmetic(
  op: "-" | "*" | "/" | "%",
  left: number,
  right: number,
): number {
  switch (op) {
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    case "%":
      return left % right;
  }
}

/**
 * Apply a non-short-circuit binary operator to resolved operands — the exact
 * disposition of the pure host's `evaluateBinaryExpression` and the V3a
 * expression-evaluator (`expression-evaluator.ts`): structural `==` / `!=` via
 * the shared V2c `valuesEqual` relation (a cross-type pair is `false`, never a
 * panic), string `+` concatenation vs IEEE-754 addition, non-panicking div/mod,
 * and signed-IEEE-754 / UTF-16 ordering (expressions.md §Equality / §Ordering /
 * §"Other arithmetic"). Reuses the same `valuesEqual` primitive as the pure host
 * so the two paths cannot diverge.
 */
export function applyBinaryScalar(op: string, left: ThetaValue, right: ThetaValue): ThetaValue {
  switch (op) {
    case "==":
      return valuesEqual(left, right);
    case "!=":
      return !valuesEqual(left, right);
    case "+": {
      // Bug 0368 belt: the parse-time gate (`type-layer-checks.ts`'s
      // `checkPlusOperands`) refuses a statically-resolvable mixed pair
      // before this runs; a pair it DEFERRED on (an unannotated fn param,
      // WITHHELD) can still reach here, so anything other than two strings
      // or two numbers throws loudly rather than JS-coercing (the original
      // defect: `"x" + 1` → `"x1"`, `null + 5` → `5`). `NaN`/`Infinity` are
      // `typeof "number"` and stay admitted — `1 % 0` → `NaN` and `3 / 0` →
      // `Infinity` flow through `+` unbelted, per the spec's non-panicking
      // div/mod behaviour.
      if (typeof left === "string" && typeof right === "string") {
        return left + right;
      }
      if (typeof left === "number" && typeof right === "number") {
        return left + right;
      }
      throw new BinaryMixedOperandError("+", left, right);
    }
    case "-":
    case "*":
    case "/":
    case "%": {
      // Bug 0332 belt: the parse-time gate
      // (`type-layer-checks.ts`'s `checkArithmeticOperands`) refuses a
      // statically-resolvable non-numeric pair before this runs; a pair it
      // DEFERRED on (an unannotated fn param, WITHHELD) can still reach here,
      // so a non-number operand throws loudly rather than being cast and
      // JS-coerced (the original silent-`NaN`/small-integer defect). `NaN` is
      // `typeof "number"` and is NOT caught here — `1 % 0` → `NaN` and
      // `3 / 0` → `Infinity` stay the spec's non-panicking div/mod behaviour.
      if (typeof left !== "number" || typeof right !== "number") {
        throw new BinaryNonNumericError(op, left, right);
      }
      return applyNumericArithmetic(op, left, right);
    }
    case "<":
    case "<=":
    case ">":
    case ">=": {
      // Bug 0368 belt: the parse-time gate (`type-layer-checks.ts`'s
      // `checkOrderingOperands`) refuses a statically-resolvable
      // non-orderable pair before this runs; a pair it DEFERRED on (an
      // unannotated fn param, WITHHELD) can still reach here, so anything
      // other than two numbers or two strings throws loudly rather than
      // applying raw JS relational coercion (the original defect: `true < 2`
      // → `true`, `"5" < 3` → `false`). `NaN`/`Infinity` are `typeof
      // "number"` and stay admitted — ordering over a div/mod-by-zero product
      // is the spec's non-panicking behaviour.
      const bothNumbers = typeof left === "number" && typeof right === "number";
      const bothStrings = typeof left === "string" && typeof right === "string";
      if (!bothNumbers && !bothStrings) {
        throw new BinaryMixedOperandError(op, left, right);
      }
      switch (op) {
        case "<":
          return (left as number | string) < (right as number | string);
        case "<=":
          return (left as number | string) <= (right as number | string);
        case ">":
          return (left as number | string) > (right as number | string);
        case ">=":
          return (left as number | string) >= (right as number | string);
      }
    }
    default:
      return null;
  }
}

/**
 * Dispatch a stdlib method on resolved operands by the receiver's runtime type
 * (expressions.md §"Built-in methods and properties"), reusing the exported
 * member surfaces (`stdlib-string` / `stdlib-array` / `stdlib-object`); a
 * receiver kind with no built-in method surface — a `number`, a `boolean`, or
 * `null` — is rejected loudly with `theta/runtime/non-object-receiver` (bug
 * 0393 §Fix), the disposition the index arm (`evaluateIndexAccess`) already
 * gives a laundered primitive; a `null` receiver at the index or member read
 * instead raises its dedicated null-access panic ahead of that gate, so `null`
 * carries this code only at the method-call read. An enum value or a `Result`
 * value satisfies the object arm's `typeof` test but is gated ahead of
 * `evaluateObjectMember` (bug 0027 §Fix): neither is an object value in the
 * language's sense, so the call rejects with `theta/runtime/non-object-receiver`
 * rather than answering the carrier's own enumerable properties. The ONE
 * dispatch gate shared by the effectful executor (`statement-executor.ts`) and
 * the pure host (`pure-expression-evaluator.ts`), so the two hosts cannot
 * drift apart on receiver classification.
 */
export function applyStdlibMethod(receiver: ThetaValue, method: string, args: readonly ThetaValue[]): ThetaValue {
  if (typeof receiver === "string") {
    return evaluateStringMember(receiver, method, args);
  }
  if (Array.isArray(receiver)) {
    return evaluateArrayMember(receiver, method, args);
  }
  if (typeof receiver === "object" && receiver !== null) {
    if (!isObjectValue(receiver)) {
      throw nonObjectReceiverRejection(`.${method}()`, receiver);
    }
    return evaluateObjectMember(receiver as { readonly [k: string]: ThetaValue }, method, args);
  }
  throw nonObjectReceiverRejection(`.${method}()`, receiver);
}
