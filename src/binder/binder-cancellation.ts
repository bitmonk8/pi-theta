// V11j / V11j-T — in-flight binder-call cancellation forwarding (cka-43).
//
// This module owns the cancellation-aware binder-call driver
// (cancellation.md §Granularity binder-call clause, §Surfacing cancelled-binder
// arm; binder/determinism-cancellation-failure.md §Cancellation, §Failure
// modes cancelled-binder row):
//
//   - `thetaAbort.signal` is forwarded into the binder's provider invocation as
//     the inference call's `options.signal` on the initial attempt AND on every
//     retry permitted by the V11f per-class budget.
//   - An abort observed *before or during* the binder call — whether on the
//     initial attempt or during a budgeted retry — suppresses that attempt/retry
//     and surfaces the cancelled-binder system note
//     (`theta /<name>: argument binding cancelled`) immediately, irrespective of
//     which class's retry budget remains. The theta does not run: no `Result`
//     ever reaches theta code, because a cancelled binder means the theta never
//     started.
//
// This is distinct from the *pre-call* `binder-call` `CheckpointKind` V17c owns
// (the checkpoint firing immediately before the binder's LLM call is issued):
// V11j covers the abort landing *during* the in-flight provider call, surfacing
// through the forwarded `options.signal`, and its suppression of any remaining
// budgeted retry.
//
// The V11j implementation leaf drives the V11f per-class retry budget with the
// theta's abort signal forwarded into every attempt and a cancellation check
// before and after each attempt, so an abort observed before or during any
// attempt suppresses the remaining budget and surfaces the cancelled-binder
// note immediately.
//
// Spec: cancellation.md (§Granularity binder-call clause, §Surfacing
// cancelled-binder arm); binder/determinism-cancellation-failure.md
// (§Cancellation, §Failure modes cancelled-binder row).

import type { BinderAttemptOutcome } from "./retry-taxonomy";
import { renderBinderSystemNote } from "./retry-taxonomy";

/**
 * The outcome of a cancellation-aware binder run.
 *
 *   - `cancelled` — an abort landed before or during a binder call (the initial
 *     attempt or a budgeted retry). The cancelled-binder system `note` is
 *     surfaced and the theta does not run; no `Result` reaches theta code.
 *   - `completed` — the binder chain settled without an abort. `outcome` is the
 *     V11f most-recent-attempt outcome that flows to the normal binder surfacing
 *     / theta-start path.
 */
export type BinderCallResult =
  | { readonly kind: "cancelled"; readonly note: string }
  | { readonly kind: "completed"; readonly outcome: BinderAttemptOutcome };

/** Inputs to {@link runBinderCallWithCancellation}. */
export interface BinderCallInput {
  /** The theta's bare command name (shown as `theta /<name>:`). */
  readonly thetaName: string;
  /**
   * `thetaAbort.signal` — the single source of truth (never `ctx.signal`
   * directly). Forwarded into every attempt below as its `options.signal`, and
   * read after each attempt settles to detect an abort observed during the call.
   */
  readonly signal: AbortSignal;
  /**
   * Issue one binder LLM call with the theta's abort `signal` forwarded as the
   * provider invocation's `options.signal`. `attemptIndex` is 0 for the initial
   * attempt and increments per budgeted retry. The driver forwards the same
   * `input.signal` on every call.
   */
  readonly attempt: (
    attemptIndex: number,
    signal: AbortSignal,
  ) => Promise<BinderAttemptOutcome>;
}

/**
 * Drive the binder call under cancellation (cka-43): forward `input.signal` into
 * every attempt as its `options.signal`, run the V11f per-class retry budget,
 * and — when an abort is observed before or during any attempt (initial or
 * budgeted retry) — suppress that attempt/retry and surface the cancelled-binder
 * system note immediately, so the theta does not run.
 */
export async function runBinderCallWithCancellation(
  input: BinderCallInput,
): Promise<BinderCallResult> {
  const { thetaName, signal, attempt } = input;

  // The cancelled-binder surface, sourced from the diagnostics-registry-anchored
  // V11f renderer (the `cancelled` failure-mode row
  // `theta /<name>: argument binding cancelled`).
  const cancelled = (): BinderCallResult => ({
    kind: "cancelled",
    note: renderBinderSystemNote(thetaName, { kind: "cancelled" }),
  });

  // The V11f per-class retry budget (HC3-a / HC3-b), re-driven here so the
  // cancellation checks can suppress any remaining retry between attempts.
  let transportBudget = 1;
  let malformedBudget = 1;
  let callCount = 0;

  // Bounded by the V11f budget: each retry consumes one of the two single
  // budgets, so the loop issues at most 1 initial + 1 transport + 1 malformed
  // attempt (MAX_BINDER_LLM_CALLS) before terminating.
  for (;;) {
    // Abort observed *before* issuing this (initial or retry) call: surface the
    // cancelled-binder note and do not issue the call. The theta does not run.
    if (signal.aborted) {
      return cancelled();
    }

    // Forward `thetaAbort.signal` (input.signal) into the provider invocation as
    // its `options.signal`, on the initial attempt and on every budgeted retry.
    const outcome = await attempt(callCount, signal);
    callCount += 1;

    // Abort observed *during* the in-flight call — surfaced through the
    // forwarded `options.signal`. Suppress any remaining budgeted retry and
    // surface the cancelled-binder note immediately, irrespective of which
    // class's budget remains. The theta does not run: no `Result` reaches theta
    // code.
    if (signal.aborted) {
      return cancelled();
    }

    if (outcome.kind === "transport" && transportBudget > 0) {
      transportBudget -= 1;
      continue;
    }
    if (outcome.kind === "malformed" && malformedBudget > 0) {
      malformedBudget -= 1;
      continue;
    }
    // Terminal outcome (or a retry-eligible class whose budget is exhausted):
    // the chain settled without an abort, so the most-recent outcome flows to
    // the normal V11f binder surfacing / theta-start path.
    return { kind: "completed", outcome };
  }
}
