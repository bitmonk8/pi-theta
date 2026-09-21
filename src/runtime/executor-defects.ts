// Runtime defect errors for the statement executor and its evaluation engines.

import type { ThetaValue } from "./value";

/**
 * Bug 0314 (docs/bugs/0314-compound-assign-non-numeric-silent-zero.md)
 * belt-and-braces: a compound operator is defined by desugaring,
 * `x <op>= e ≡ x = x <op> e` (bindings.md §Reassignment), and the parse-time
 * type-layer routes `+=`'s implied `x + e` pair through the shared
 * `+`-operand classifier (`theta/parse/mixed-plus-operands`), which fires
 * only when both operands are statically resolvable; an unresolvable pair
 * defers exactly as the spelled binary `x = x + e` does and takes the same
 * runtime `+` arm. So a `+=` reaching here carries two strings, two
 * numbers, or an unresolvable pair that the shared `+` arm computes
 * identically to the spelled binary.
 * `-=`/`*=`/`/=`/`%=` have no parse-time operand gate: bug 0332 added one only
 * for the SPELLED `-`/`*`/`/`/`%` binaries in expression position
 * (`theta/parse/non-numeric-arithmetic-operands`, `type-layer-checks.ts`'s
 * `checkArithmeticOperands`), and its §Non-goals leaves the compound forms on
 * this runtime belt as their 0314 disposition — so a non-number operand can
 * still reach them; fabricating a `0` there silently overwrites the binding
 * with a value of a different type (the original defect), so this throws a
 * loud, specific defect instead — never a catch-all, never a fabricated number.
 */
export class CompoundNonNumericError extends Error {
  public constructor(op: "-=" | "*=" | "/=" | "%=", current: ThetaValue, delta: ThetaValue) {
    super(
      `internal defect: compound operator '${op}' requires two numbers, got ${typeof current} and ${typeof delta}; a non-number operand reached a numeric compound after the reassign type gate (bug 0314)`,
    );
    this.name = "CompoundNonNumericError";
  }
}

/**
 * Bug 0332 (docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md)
 * belt: the sibling of `CompoundNonNumericError` for the SPELLED `-`/`*`/`/`/`%`
 * binaries. The parse-time gate (`type-layer-checks.ts`'s
 * `checkArithmeticOperands`) refuses every statically-resolvable non-numeric
 * pair; a pair it deferred on (an unresolvable operand) can still reach
 * `applyBinaryScalar`, and casting it to `number` there would silently
 * JS-coerce (the original defect: `"a" - "b"` → `NaN`, `[1] - [2]` → `-1`).
 * A plain `Error`, NOT a `ThetaPanic` — it propagates uncaught out of
 * `executeBody` and is reframed one layer up through `surfaceUnexpectedThrow`
 * to `INTERNAL_ERROR_CODE`, exactly as `CompoundNonNumericError` is.
 */
export class BinaryNonNumericError extends Error {
  public constructor(op: "-" | "*" | "/" | "%", left: ThetaValue, right: ThetaValue) {
    super(
      `internal defect: arithmetic operator '${op}' requires two numbers, got ${typeof left} and ${typeof right}; a non-number operand reached a numeric binary after the spelled-binary type gate (bug 0332)`,
    );
    this.name = "BinaryNonNumericError";
  }
}

/**
 * Bug 0392 (docs/bugs/0392-unary-minus-no-operand-discipline.md) belt: the
 * sibling of `BinaryNonNumericError` for unary `-`'s single operand. The
 * parse-time gate (`type-layer-checks.ts`'s `checkUnaryArithmeticOperand`)
 * refuses a statically-resolvable non-numeric operand; an operand it DEFERRED
 * on (an unannotated fn param, WITHHELD) can still reach `evalBinary`'s unary
 * arm, and casting it to `number` there would silently JS-coerce (the
 * original defect: `-"5"` → `-5`, `-true` → `-1`, `-null` → `-0`). The
 * direct spelling is now gated at parse, so this belt fires only on a
 * laundered operand that was never judged — the message carries no false
 * "deferred" clause. A plain `Error`, NOT a `ThetaPanic` — it propagates
 * uncaught out of `executeBody` and is reframed one layer up through
 * `surfaceUnexpectedThrow` to `INTERNAL_ERROR_CODE`, exactly as
 * `BinaryNonNumericError` is.
 */
export class UnaryNonNumericError extends Error {
  public constructor(value: ThetaValue) {
    super(
      `internal defect: unary operator '-' requires a number, got ${typeof value}; a non-number operand reached the unary negation without a parse refusal (bug 0392)`,
    );
    this.name = "UnaryNonNumericError";
  }
}

/**
 * Bug 0368 (docs/bugs/0368-plus-and-ordering-laundered-operands-silent-js-coercion.md)
 * belt: the sibling of `BinaryNonNumericError` for `+` and the four ordering
 * operators. Their parse-time gates (`type-layer-checks.ts`'s
 * `checkPlusOperands` / `checkOrderingOperands`) refuse every
 * statically-resolvable mixed or non-orderable pair; a pair either gate
 * DEFERRED on (an unannotated fn param, WITHHELD) can still reach this belt,
 * and applying `+` or a relational operator to it would silently JS-coerce
 * (the original defect: `"x" + 1` → `"x1"`, `true < 2` → `true`). A plain
 * `Error`, NOT a `ThetaPanic` — it propagates uncaught out of `executeBody`
 * and is reframed one layer up through `surfaceUnexpectedThrow` to
 * `INTERNAL_ERROR_CODE`, exactly as `BinaryNonNumericError` is.
 */
export class BinaryMixedOperandError extends Error {
  public constructor(op: "+" | "<" | "<=" | ">" | ">=", left: ThetaValue, right: ThetaValue) {
    super(
      `internal defect: operator '${op}' requires two numbers or two strings, got ${typeof left} and ${typeof right}; a mixed or non-orderable operand pairing reached the runtime after the plus/ordering type gate deferred (bug 0368)`,
    );
    this.name = "BinaryMixedOperandError";
  }
}

/**
 * Bug 0369 (docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md)
 * belt: the sibling of `BinaryMixedOperandError` for the `for`/`par for`
 * iterand. The static layer's iterand check (control-flow.md CTRL-1) refuses
 * every statically-resolvable non-array iterand at parse; a value it DEFERRED
 * on (an unannotated fn param, WITHHELD) can still reach a loop entry, and
 * substituting the empty array there would silently run the body zero times
 * (the original defect: `for i in "abc"` completing with no iterations and no
 * diagnostic). A plain `Error`, NOT a `ThetaPanic` — it propagates uncaught
 * out of `executeBody` and is reframed one layer up through
 * `surfaceUnexpectedThrow` to `INTERNAL_ERROR_CODE`, exactly as
 * `BinaryMixedOperandError` is.
 */
export class ForIterandKindDefectError extends Error {
  public constructor(value: ThetaValue) {
    super(
      `internal defect: 'for'/'par for' requires an array<T> iterand, got ${typeof value}; a non-array value reached the loop entry after the iterand type gate deferred (bug 0369)`,
    );
    this.name = "ForIterandKindDefectError";
  }
}

/**
 * Bug 0369 belt: the sibling of `BinaryMixedOperandError` for every
 * boolean-position consumer — an `if`/`while`/ternary condition, and an
 * operand of `&&`/`||`/`!`. The static layer's boolean-position check
 * (expressions.md §Truthiness) refuses every statically-resolvable
 * non-boolean at parse; a value can still reach one of these sites without a
 * parse refusal — either because the parse layer DEFERRED on it (an
 * unannotated fn param, statically unresolvable), or, for `!` in
 * interpolation position, because `checkInterpolationOperands` never judges
 * boolean position at all (bug 0395) — and the prior fallbacks (a strict
 * `=== true` comparison for the conditions/`&&`/`||`, raw JS `!` for the
 * negation) would silently fabricate a boolean verdict instead of
 * interpreting the actual value (the original defect: `if 1` steering false,
 * `!0` fabricating `true`). A plain `Error`, NOT a `ThetaPanic` — it
 * propagates uncaught out of `executeBody` and is reframed one layer up
 * through `surfaceUnexpectedThrow` to `INTERNAL_ERROR_CODE`, exactly as
 * `BinaryMixedOperandError` is.
 */
export class BooleanPositionKindDefectError extends Error {
  public constructor(value: ThetaValue) {
    super(
      `internal defect: a boolean-position operand (condition, '&&', '||', or '!') requires a boolean, got ${typeof value}; a non-boolean value reached the runtime without a parse refusal (bug 0369)`,
    );
    this.name = "BooleanPositionKindDefectError";
  }
}

/**
 * Bug 0325 (docs/bugs/0325-nan-max-zero-workers-fabricated-ok-null-array.md)
 * belt: the CTRL-3 join's per-index write is the sibling of `BinaryNonNumericError`
 * for the `par for` worker pool. Index claiming is synchronous and the pool
 * drains to `n` (`evalParFor`), so on every healthy path `results[index]` is
 * always written before the join reads it — the `?? makeOk(null)` filler the
 * join used to fall back to was dead code on every healthy path, reachable
 * only when the scheduling invariant was already broken (e.g. a non-finite
 * width evading the ≥1 floor). Fabricating `Ok(null)` there converted a
 * broken invariant into a shape-perfect fake success instead of surfacing it,
 * so this throws a loud, specific defect naming the unwritten index. A plain
 * `Error`, NOT a `ThetaPanic` — it propagates uncaught out of `executeBody`
 * and is reframed one layer up through `surfaceUnexpectedThrow` to
 * `INTERNAL_ERROR_CODE`, exactly as `BinaryNonNumericError` is.
 */
export class ParForUnwrittenSlotError extends Error {
  public constructor(index: number) {
    super(
      `internal defect: par for join found an unwritten result slot at index ${index}; every claimed index must be written by its worker before the CTRL-3 join (bug 0325)`,
    );
    this.name = "ParForUnwrittenSlotError";
  }
}

/**
 * Bug 0365 (docs/bugs/0365-array-index-nonintegral-silent-undefined.md)
 * belt: the sibling of the b0332/b0338/b0368/b0369 belts for an index
 * expression's key. The static layer's object-index check (expressions.md
 * §Indexing) refuses a statically-resolvable non-string index on an object
 * receiver at parse; a value it DEFERRED on (an unannotated fn param,
 * WITHHELD) can still reach this arm, and the removed `String()` coercion
 * would silently manufacture a key from it (the original defect: a laundered
 * boolean index reading the key `"true"`). A plain `Error`, NOT a
 * `ThetaPanic` — it propagates uncaught out of `executeBody` and is
 * reframed one layer up through `surfaceUnexpectedThrow` to
 * `INTERNAL_ERROR_CODE`, exactly as `BinaryMixedOperandError` is.
 */
export class IndexKindDefectError extends Error {
  public constructor(value: ThetaValue) {
    super(
      `internal defect: an index expression requires an integer (array) or string (object) key, got ${typeof value}; a non-number/non-string index reached the runtime after the object-index type gate deferred (bug 0365)`,
    );
    this.name = "IndexKindDefectError";
  }
}

/**
 * Bug 0370 (docs/bugs/0370-reassign-target-scope-unchecked-cross-boundary-writes.md)
 * belt: the sibling of `IndexKindDefectError` for the reassign arm's
 * `WriteResult`. The static layer's target-scope walk (§Fix layer 1) refuses
 * every statically-resolvable out-of-scope, undeclared, or immutable-context
 * write target at parse; a rejected `WriteResult` reaching this arm after
 * those gates hold is a broken invariant, not a no-op — discarding it (the
 * original defect) silently drops the author's mutation. A plain `Error`,
 * NOT a `ThetaPanic` — it propagates uncaught out of `executeBody` and is
 * reframed one layer up through `surfaceUnexpectedThrow` to
 * `INTERNAL_ERROR_CODE`, exactly as `IndexKindDefectError` is.
 */
export class RejectedWriteDefectError extends Error {
  public constructor(target: string) {
    super(
      `internal defect: reassignment target '${target}' was rejected by the runtime scope layer after the parse gates held; a rejected write must not be silently discarded (bug 0370)`,
    );
    this.name = "RejectedWriteDefectError";
  }
}

/**
 * Bug 0449 (docs/bugs/0449-reexport-chain-enum-unknown-variant-null-panic.md)
 * belt: the async member arm's enum short-circuit falls through to a value
 * read whenever `resolveEnumVariant` answers `undefined` — collapsing "not an
 * enum" and "registered enum, unknown variant" into one signal (0185's
 * information loss, still present by design: `resolveEnumVariant`'s contract
 * is unchanged). A re-export chain's static walk withholds a variant verdict
 * on a chain-reached specifier (code-registry-parse.md:114), so an unknown
 * variant on a chain-imported enum reaches this arm laundered past every
 * static gate; falling through would evaluate the enum NAME as a value, read
 * `null` off the pure host's non-`local` safety net, and panic
 * `NullMemberAccessPanic` — a message asserting a null target that does not
 * exist and never naming the actual fault. `isRegisteredEnum` splits the two
 * conditions so this class fails loudly instead.
 *
 * Carrier adjudication (DIAG-2): NOT a new `ThetaPanic` subclass and NOT
 * `NullMemberAccessPanic` (the lying carrier this belt exists to avoid) — the
 * V1 runtime-panic list is closed (error-model.md §"Runtime panics": six
 * sources, closed for spec-defined panic sources; runtime-panics.ts's
 * `ThetaPanic` set mirrors it exactly) and this class is not one of the six.
 * A plain `Error`, NOT a `ThetaPanic` — it propagates uncaught out of
 * `executeBody` and is reframed one layer up through `surfaceUnexpectedThrow`
 * to `INTERNAL_ERROR_CODE`, exactly as `IndexKindDefectError` /
 * `RejectedWriteDefectError` are (the standing belt law, 0332/0338/0365/0370
 * family: a laundered wrong-kind value reaching a gated-at-parse site is a
 * loud, undecorated defect, with no new registry row). The message TEXT reuses `theta/parse/unknown-variant`'s
 * registered template verbatim (0185's no-new-code adjudication: the natural
 * carrier for "registered enum, unknown variant" is that code's Message
 * column, not a fresh mint) — naming the ACCESS-SITE enum spelling
 * (`enumName`, the `as`-alias where one is written) and the variant, so a
 * renamed chain (`export { Sev as Level }`) names `Level`, never the
 * library's own declared `Sev`.
 */
export class UnknownVariantDefectError extends Error {
  public constructor(enumName: string, variant: string) {
    super(`unknown variant '${variant}' on enum '${enumName}'`);
    this.name = "UnknownVariantDefectError";
  }
}
