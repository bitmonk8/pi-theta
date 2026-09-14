// V3d / V3d-T — the function-result final-value seam (FN-4 void discard, FN-5).
//
// This module owns the runtime function-result seam at which a function or
// top-level theta's *final value* is observed by a programmatic caller
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
// V3d-T (tests-task) declared the seam shapes; V3d (this leaf) supplies the
// behaviour: `functionResult` reports the value present on success only, and
// `discardForVoid` produces `null`.

import { type ThetaValue } from "./value";

/**
 * A terminal outcome of running a function or top-level theta body
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
  readonly value?: ThetaValue;
}

/**
 * Project a terminal `outcome` and the body's `producedValue` onto the
 * final-value the caller observes (FN-5): on `"success"` the produced value is
 * present; on `"fail"` / `"cancel"` no final value flows (the caller observes
 * only the corresponding `Err` envelope), so the value is absent.
 */
export function functionResult(
  outcome: TerminalOutcome,
  producedValue: ThetaValue,
): FunctionResult {
  if (outcome === "success") {
    return { present: true, value: producedValue };
  }
  return { present: false };
}

/**
 * Apply a `void` function's tail discard (FN-4): a `void`-annotated function
 * discards its tail value silently and produces `null`, regardless of the tail
 * expression's value.
 */
export function discardForVoid(tailValue: ThetaValue): ThetaValue {
  // FN-4 — a `void`-annotated function discards its tail value silently and
  // produces `null`, regardless of the tail expression's value.
  void tailValue;
  return null;
}
