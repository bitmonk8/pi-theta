// V3d / V3d-T — the function-result final-value seam (FN-4 void discard, FN-5).
//
// This module owns the runtime function-result seam at which a function or
// top-level loom's *final value* is observed by a programmatic caller
// (functions.md FN-4 §Empty-tail body and FN-5 §Final value):
//
//   - FN-5 (Final value) — on the success path the body's produced value flows
//     as the result; on failure (`?` propagation, panic, exhausted ceiling) and
//     on cancellation NO final value flows (the caller observes only the
//     corresponding `Err` envelope), so the seam reports the value as absent.
//   - FN-4 (void discard) — a `void`-annotated function discards its tail
//     value silently; its produced final value is `null` regardless of the tail
//     expression's value.
//
// V3d-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// functions inertly (`functionResult` returns an unimplemented sentinel for
// every outcome; `discardForVoid` returns the tail value unchanged instead of
// discarding it). Each obligation test reds on its own primary assertion (the
// sentinel value, the wrong present-flag, or the un-discarded value), not on a
// compile error, a missing fixture, or a harness throw. The paired V3d
// implementation leaf fills these in.

import { type LoomValue } from "./value";

/**
 * A terminal outcome of running a function or top-level loom body
 * (errors-and-results/error-model.md §Terminal outcomes), as seen by the
 * final-value seam:
 *
 *   - `"success"` — the body completed on its success path.
 *   - `"fail"`    — `?` propagation, a panic, or an exhausted runtime ceiling.
 *   - `"cancel"`  — the run was cancelled.
 */
export type TerminalOutcome = "success" | "fail" | "cancel";

/**
 * The final value the function-result seam exposes to a programmatic caller.
 * `present` is `true` only on the success path, where `value` carries the
 * body's produced value; on failure and cancellation `present` is `false` and
 * no `value` flows (FN-5).
 */
export interface FunctionResult {
  readonly present: boolean;
  readonly value?: LoomValue;
}

/**
 * The V3d-T stub sentinel value. The paired V3d seam never produces it; it
 * exists only so the FN-5 success test reds on its own primary assertion (no
 * expected produced value equals this sentinel).
 */
const UNIMPLEMENTED_SENTINEL: LoomValue = "V3d-T:functionResult unimplemented";

/**
 * Project a terminal `outcome` and the body's `producedValue` onto the
 * final-value the caller observes (FN-5): on `"success"` the produced value is
 * present; on `"fail"` / `"cancel"` no final value flows (absent).
 *
 * V3d-T stubs this as an inert sentinel: it reports the value present for every
 * outcome and carries the unimplemented sentinel, so the success test reds (the
 * sentinel is not the produced value) and the fail / cancel tests red (the
 * value should be absent). The paired V3d leaf computes the projection.
 */
export function functionResult(
  outcome: TerminalOutcome,
  producedValue: LoomValue,
): FunctionResult {
  void outcome;
  void producedValue;
  return { present: true, value: UNIMPLEMENTED_SENTINEL };
}

/**
 * Apply a `void` function's tail discard (FN-4): a `void`-annotated function
 * discards its tail value silently and produces `null`, regardless of the tail
 * expression's value.
 *
 * V3d-T stubs this so it returns the tail value unchanged (no discard), so the
 * FN-4 void-discard test reds on its own primary assertion. The paired V3d leaf
 * returns `null`.
 */
export function discardForVoid(tailValue: LoomValue): LoomValue {
  // V3d-T stub: does not discard; V3d returns null (the void discard).
  return tailValue;
}
