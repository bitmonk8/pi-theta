// V17c / V17c-T — the cancellation-checkpoint granularity surface (cka-47).
//
// This module holds the two cycle-free per-site checkpoint wirings V17c is
// responsible for, both observable through the V8a `Checkpoint` seam (PIC-10)
// alone, independent of the V17a forwarding contract:
//
//   - `runCheckpointedForLoop` — the `for`/`while` loop-iteration site (the loop
//     construct V3c introduces): await `checkpoint.before("loop-iter", site)`
//     immediately before each iteration of the body, then read `signal.aborted`
//     and stop iterating once the signal has fired. Because the `loop-iter`
//     checkpoint yields one macrotask turn (per PIC-10 production wiring), a
//     Pi-dispatched abort (a macrotask) flipped during a compute-bound body with
//     no genuine `await` is observed before the next iteration (cancellation.md
//     §Granularity, `loop-iter`). This is the seam's test-witnessed form; the
//     production interpreter fires the same `loop-iter` checkpoint through its
//     own private `loopIterCheckpoint` helper (`statement-executor.ts`) and does
//     not route through this function.
//   - `runCheckpointedBinderCall` — the slash-command argument binder's LLM-call
//     site (the binder-inference call V9j introduces). The producer awaits
//     `checkpoint.before("binder-call", site)` immediately before dispatching
//     the binder's LLM call, then reads `signal.aborted`; an abort observed at
//     that checkpoint skips the call (production-wired from
//     `production-theta-producer.ts`).
//
// The checkpoint fires at these two sites and no other node kinds: no checkpoint
// inside a primitive operation (arithmetic, comparison, field/index access) and
// none at a straight-line statement boundary (cancellation.md §Granularity,
// §Edge cases). The `@`-query-dispatch, tool-call, and `invoke` per-site
// presence arms are witnessed on their feature leaves (V13c / V14g / V15m).
//
// V17c-T (tests-task) declared this surface and stubbed both behaviour-bearing
// functions; V17c (this leaf) implements them: `runCheckpointedForLoop` fires
// the `loop-iter` checkpoint and runs each iteration, and
// `runCheckpointedBinderCall` fires the `binder-call` checkpoint and dispatches
// the call.
//
// Spec: cancellation.md §Granularity; host-interfaces-services.md PIC-10.

import type { Checkpoint, CheckpointSite } from "../seams/checkpoint";
import type { ThetaValue } from "./value";

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
  readonly snapshot: readonly ThetaValue[];
  runIteration(element: ThetaValue, index: number): void | Promise<void>;
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
 */
export async function runCheckpointedForLoop(
  checkpoint: Checkpoint,
  signal: AbortSignal,
  site: CheckpointSite,
  host: CheckpointedLoopHost,
): Promise<void> {
  const snapshot = host.snapshot;
  for (let index = 0; index < snapshot.length; index += 1) {
    const element = snapshot[index] as ThetaValue;
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
 */
export async function runCheckpointedBinderCall<T>(
  checkpoint: Checkpoint,
  signal: AbortSignal,
  site: CheckpointSite,
  binderCall: () => Promise<T>,
): Promise<CheckpointedBinderOutcome<T>> {
  // The `binder-call` checkpoint fires immediately before the binder's LLM
  // call's signal read; an abort observed here skips the call and the theta
  // never starts (cancellation.md §Granularity, §Surfacing).
  await checkpoint.before("binder-call", site);
  if (signal.aborted) {
    return { cancelled: true };
  }
  const value = await binderCall();
  return { cancelled: false, value };
}
