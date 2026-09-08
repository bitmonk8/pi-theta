// V3c / V3c-T — the `for ... in` loop-evaluation seam (CTRL-1).
//
// This module owns the runtime evaluation of a `for x in <iterand>` loop, whose
// one normative obligation is control-flow.md CTRL-1: the iterand expression is
// evaluated **exactly once**, at loop entry, before the first iteration; the
// loop then iterates the resulting `array<T>` *snapshot*. Where the iterand
// carries effects (a function-call, an `@`-query, or an `invoke` child
// iterand), that effect commits exactly once at loop entry — including when the
// resulting array is empty and the body never runs — and reassigning a
// `let mut` from inside the body does not change the already-snapshotted
// sequence.
//
// The iterand evaluation and the per-iteration body are injected through
// `ForLoopHost` so the one observable effect (iterand evaluation) and the body
// runs are recordable, not ambient.
//
// V3c-T (tests-task) declared the seam — the `ForLoopHost` collaborator and the
// `evaluateForLoop` entry point — and stubbed `evaluateForLoop`; V3c (this
// leaf) implements the CTRL-1 once-only iterand snapshot and the per-element
// body run.

import { type ThetaValue } from "./value";

/**
 * The host a `for ... in` loop evaluates the iterand and body through.
 *
 *   - `evaluateIterand` evaluates the expression after `in`, committing its
 *     effect, and returns the resulting `array<T>` snapshot. CTRL-1 requires it
 *     be called exactly once, at loop entry, before any iteration.
 *   - `runIteration` runs the loop body once with the snapshotted `element` (a
 *     fresh immutable local) at position `index`.
 */
export interface ForLoopHost {
  evaluateIterand(): readonly ThetaValue[];
  runIteration(element: ThetaValue, index: number): void;
}

/**
 * Evaluate a `for x in <iterand>` loop per CTRL-1: call `host.evaluateIterand`
 * exactly once at loop entry to obtain the `array<T>` snapshot, then call
 * `host.runIteration` once per snapshot element in order. The iterand effect
 * commits once even when the snapshot is empty (the body never runs), and the
 * snapshot is fixed before iteration so a body-side `let mut` reassignment does
 * not change the iterated sequence.
 */
export function evaluateForLoop(host: ForLoopHost): void {
  // CTRL-1: evaluate the iterand exactly once at loop entry, committing its
  // effect, and capture the resulting `array<T>` snapshot before iterating. A
  // body-side `let mut` reassignment of the iterand source cannot reach this
  // captured reference, so the iterated sequence stays fixed.
  const snapshot = host.evaluateIterand();
  for (let index = 0; index < snapshot.length; index += 1) {
    host.runIteration(snapshot[index] as ThetaValue, index);
  }
}
