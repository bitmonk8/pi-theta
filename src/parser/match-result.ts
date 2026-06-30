// V4a / V4a-T — the parse/type seam for `match`, `?`, and `Result`.
//
// This module owns the type-phase well-formedness checks for the two
// `Result`-destructuring constructs of expressions.md — the postfix `?`
// operator and the `match` expression — that are decidable statically:
//
//   - `?` operand-type precondition (ERR-18, expressions.md §`?` operator) —
//     the operand `?` unwraps MUST itself have static type
//     `Result<T, QueryError>` for some `T`; any other operand type is
//     `loom/parse/question-on-non-result` (a `type`-phase, hence lex/parse/type
//     batch pre-evaluation, failure).
//   - `?` enclosing-scope precondition (expressions.md §`?` operator) — the
//     scope `?` early-returns from must be compatible with
//     `Result<U, QueryError>` for some `U`: either it carries no explicit return
//     annotation (`?` then implicitly returns `Result<T, QueryError>`) or its
//     explicit annotation `R` satisfies `Result<U, QueryError> ⊑ R`. Otherwise
//     the use of `?` is `loom/parse/question-outside-result-fn`. This is the
//     scope precondition, distinct from the operand precondition above.
//   - `match` arm common-type (expressions.md §`match` expression, Arm syntax) —
//     all arms must produce values of one type, or values whose types share a
//     common upper bound under type-system.md §"Type compatibility" (every arm
//     `⊑` the chosen common type, narrowed by any sink in scope). A `match`
//     whose arms share no common upper bound is `loom/parse/match-arm-type-mismatch`;
//     a well-typed `match` resolves to the least upper bound of its arms.
//
// V4a-T (tests-task) declares these seam shapes and stubs the behaviour-bearing
// functions inertly (each parse/type checker returns no diagnostic, and the
// `match` arm checker computes no LUB), so the failing tests compile and red on
// their own primary assertions (an absent expected diagnostic, or an absent
// computed LUB), not on a compile error, a missing fixture, or a harness throw.
// The paired V4a implementation leaf fills every check in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { type CompatType, type TypeEnv } from "./type-compat";

/** A located site at which a `match` / `?` form is type-checked. */
export interface MatchResultSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * The static type of a `?` operator's operand, projected for the ERR-18
 * operand-type check:
 *
 *   - `result`     — the operand is `Result<T, E>`; `errIsQueryError` records
 *                    whether `E` is `QueryError` (the only error type loom 1.0
 *                    admits for `?`). ERR-18 requires `Result<T, QueryError>`.
 *   - `non-result` — the operand is any non-`Result` type; `display` is its
 *                    rendered type name for the `<type>` placeholder of the
 *                    `loom/parse/question-on-non-result` message.
 */
export type QuestionOperandType =
  | { readonly kind: "result"; readonly errIsQueryError: boolean }
  | { readonly kind: "non-result"; readonly display: string };

/**
 * ERR-18 — the `?` operand-type precondition. Returns
 * `loom/parse/question-on-non-result` (a `type`-phase diagnostic) when the
 * operand `?` is applied to does not statically type as `Result<T, QueryError>`
 * for some `T` (e.g. `let x = 5?`, where `5` is `integer`). Returns `undefined`
 * for a `Result<T, QueryError>` operand (expressions.md ERR-18).
 *
 * V4a-T stubs this inert (always `undefined`); the paired V4a leaf fills it in.
 */
export function checkQuestionOperand(
  _operand: QuestionOperandType,
  _site: MatchResultSite,
): Diagnostic | undefined {
  // V4a-T stub: inert. The paired V4a leaf reports
  // `loom/parse/question-on-non-result` for a non-`Result<_, QueryError>`
  // operand, sourcing its message from diagnostics/code-registry-parse.md.
  return undefined;
}

/**
 * The enclosing scope a `?` early-returns from, projected for the scope
 * precondition check:
 *
 *   - `inferred`  — no explicit return annotation; `?` then makes the scope
 *                   implicitly return `Result<T, QueryError>`, so the scope is
 *                   compatible by construction.
 *   - `annotated` — an explicit return annotation `R`; `resultCompatible`
 *                   records whether `Result<U, QueryError> ⊑ R` for some `U`.
 */
export type EnclosingReturnScope =
  | { readonly kind: "inferred" }
  | { readonly kind: "annotated"; readonly resultCompatible: boolean };

/**
 * The `?` enclosing-scope precondition. Returns
 * `loom/parse/question-outside-result-fn` (a `type`-phase diagnostic) when `?`
 * is used in a function or top-level loom whose explicit return annotation is
 * not compatible with `Result<U, QueryError>` for some `U` and cannot be
 * inferred to one. Returns `undefined` for an inferred scope, or an annotated
 * scope whose return type admits `Result<U, QueryError>` (expressions.md
 * §`?` operator).
 *
 * V4a-T stubs this inert (always `undefined`); the paired V4a leaf fills it in.
 */
export function checkQuestionScope(
  _scope: EnclosingReturnScope,
  _site: MatchResultSite,
): Diagnostic | undefined {
  // V4a-T stub: inert. The paired V4a leaf reports
  // `loom/parse/question-outside-result-fn` for a `?` in a non-`Result`-
  // compatible scope, sourcing its message from
  // diagnostics/code-registry-parse.md.
  return undefined;
}

/**
 * The outcome of the `match` arm common-type check:
 *
 *   - `diagnostics` — `loom/parse/match-arm-type-mismatch` when the arm bodies
 *     share no common upper bound (or fail against an in-scope sink); empty
 *     when the arms are well-typed.
 *   - `lub`         — the resolved least upper bound the well-typed `match`
 *     expression evaluates to (the common type the arms widen to). `undefined`
 *     when the arms have no common upper bound (mismatch) or when none is
 *     computed.
 */
export interface MatchArmCheck {
  readonly diagnostics: readonly Diagnostic[];
  readonly lub: CompatType | undefined;
}

/**
 * The `match` arm common-type check (expressions.md §`match` expression,
 * Arm syntax). Given the static types of the arm bodies and an optional
 * in-scope type `sink` on the `match` expression:
 *
 *   - reports `loom/parse/match-arm-type-mismatch` when the arms share no
 *     common upper bound under type-system.md §"Type compatibility" (no `sink`),
 *     or when an arm is not `⊑` the `sink` (with a `sink`);
 *   - otherwise resolves the `match` to the least upper bound of its arms,
 *     returned as `lub`.
 *
 * V4a-T stubs this inert (no diagnostics, no computed LUB); the paired V4a leaf
 * fills it in.
 */
export function checkMatchArmTypes(_opts: {
  readonly armTypes: readonly CompatType[];
  readonly sink: CompatType | undefined;
  readonly env: TypeEnv;
  readonly site: MatchResultSite;
}): MatchArmCheck {
  // V4a-T stub: inert. The paired V4a leaf computes the arm LUB and reports
  // `loom/parse/match-arm-type-mismatch` (message from
  // diagnostics/code-registry-parse.md) when the arms share no common upper
  // bound.
  return { diagnostics: [], lub: undefined };
}
