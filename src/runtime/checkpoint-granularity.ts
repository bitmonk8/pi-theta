// V17c / V17c-T — the cancellation-checkpoint granularity surface (cka-47).
//
// This module owns the two cycle-free per-site checkpoint wirings V17c is
// responsible for, both observable through the V8a `Checkpoint` seam (PIC-10)
// alone, independent of the V17a forwarding contract:
//
//   - `runCheckpointedForLoop` — the `for`/`while` loop-iteration site (the loop
//     construct V3c introduces). The interpreter awaits
//     `checkpoint.before("loop-iter", site)` immediately before each iteration
//     of the body, then reads `signal.aborted` and stops iterating once the
//     signal has fired. Because the `loop-iter` checkpoint yields one macrotask
//     turn (per PIC-10 production wiring), a Pi-dispatched abort (a macrotask)
//     flipped during a compute-bound body with no genuine `await` is observed
//     before the next iteration (cancellation.md §Granularity, `loop-iter`).
//   - `runCheckpointedBinderCall` — the slash-command argument binder's LLM-call
//     site (the binder-inference call V9j introduces). The interpreter awaits
//     `checkpoint.before("binder-call", site)` immediately before dispatching
//     the binder's LLM call, then reads `signal.aborted`; an abort observed at
//     that checkpoint skips the call.
//
// The checkpoint fires at these two sites and no other node kinds: no checkpoint
// inside a primitive operation (arithmetic, comparison, field/index access) and
// none at a straight-line statement boundary (cancellation.md §Granularity,
// §Edge cases). The `@`-query-dispatch, tool-call, and `invoke` per-site
// presence arms are witnessed on their feature leaves (V13c / V14g / V15m).
//
// V17c-T (tests-task) declares this surface and stubs the behaviour-bearing
// functions inertly: `runCheckpointedForLoop` fires no checkpoint and runs no
// iteration, and `runCheckpointedBinderCall` fires no checkpoint and never
// dispatches the call (returning a cancelled outcome). The granularity
// assertions therefore red on their own primary expectation — the expected
// `loop-iter` / `binder-call` checkpoints are absent and the body / call never
// runs — not on a compile error, a missing fixture, or a harness throw. The
// paired V17c implementation leaf fills these in.
//
// Spec: cancellation.md §Granularity; host-interfaces-services.md PIC-10.

import type { Checkpoint, CheckpointSite } from "../seams/checkpoint";
import type { LoomValue } from "./value";

/**
 * The host a checkpointed `for`/`while` loop iterates through.
 *
 *   - `snapshot` is the already-evaluated `array<T>` the loop iterates (the
 *     CTRL-1 once-only iterand snapshot V3c produces); V17c does not re-evaluate
 *     the iterand.
 *   - `runIteration` runs the loop body once with `element` at `index`. It may
 *     be synchronous (a compute-bound body with no genuine `await`) or async.
 */
export interface CheckpointedLoopHost {
  readonly snapshot: readonly LoomValue[];
  runIteration(element: LoomValue, index: number): void | Promise<void>;
}

/**
 * The outcome of a checkpointed binder-inference call: either the binder call
 * was dispatched and produced `value`, or the pre-call checkpoint observed the
 * abort and the call was skipped.
 */
export type CheckpointedBinderOutcome<T> =
  | { readonly cancelled: true }
  | { readonly cancelled: false; readonly value: T };

/**
 * Run a `for`/`while` loop under the cancellation-checkpoint granularity rule:
 * await `checkpoint.before("loop-iter", site)` immediately before each
 * iteration, then read `signal.aborted` and stop iterating once it has fired.
 *
 * V17c-T stubs this inert: it fires no checkpoint and runs no iteration. The
 * paired V17c leaf implements it.
 */
export async function runCheckpointedForLoop(
  checkpoint: Checkpoint,
  signal: AbortSignal,
  site: CheckpointSite,
  host: CheckpointedLoopHost,
): Promise<void> {
  const snapshot = host.snapshot;
  for (let index = 0; index < snapshot.length; index += 1) {
    const element = snapshot[index] as LoomValue;
    // The `loop-iter` checkpoint fires immediately before each iteration's
    // signal read; production wiring yields one macrotask turn here so a
    // Pi-dispatched abort flipped during a compute-bound body lands before the
    // next iteration (cancellation.md §Granularity, `loop-iter`).
    await checkpoint.before("loop-iter", site);
    if (signal.aborted) {
      return;
    }
    await host.runIteration(element, index);
  }
}

/**
 * Dispatch the slash-command argument binder's LLM call under the granularity
 * rule: await `checkpoint.before("binder-call", site)` immediately before the
 * call, then read `signal.aborted`; if the checkpoint observes the abort the
 * call is skipped and a cancelled outcome is returned, otherwise the call is
 * dispatched and its value returned.
 *
 * V17c-T stubs this inert: it fires no checkpoint and never dispatches the
 * call. The paired V17c leaf implements it.
 */
export async function runCheckpointedBinderCall<T>(
  checkpoint: Checkpoint,
  signal: AbortSignal,
  site: CheckpointSite,
  binderCall: () => Promise<T>,
): Promise<CheckpointedBinderOutcome<T>> {
  // The `binder-call` checkpoint fires immediately before the binder's LLM
  // call's signal read; an abort observed here skips the call and the loom
  // never starts (cancellation.md §Granularity, §Surfacing).
  await checkpoint.before("binder-call", site);
  if (signal.aborted) {
    return { cancelled: true };
  }
  const value = await binderCall();
  return { cancelled: false, value };
}
