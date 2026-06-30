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
// V3c-T (tests-task) declares the seam — the `ForLoopHost` collaborator and the
// `evaluateForLoop` entry point — and stubs `evaluateForLoop` inertly: it
// neither evaluates the iterand nor runs the body, so the CTRL-1 assertions red
// on their own primary expectations (the iterand-evaluation count is `0` rather
// than `1`, and no body iteration is recorded), not on a compile error, a
// missing fixture, or a harness throw. The paired V3c implementation leaf fills
// it in.

import { type LoomValue } from "./value";

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
  evaluateIterand(): readonly LoomValue[];
  runIteration(element: LoomValue, index: number): void;
}

/**
 * Evaluate a `for x in <iterand>` loop per CTRL-1: call `host.evaluateIterand`
 * exactly once at loop entry to obtain the `array<T>` snapshot, then call
 * `host.runIteration` once per snapshot element in order. The iterand effect
 * commits once even when the snapshot is empty (the body never runs), and the
 * snapshot is fixed before iteration so a body-side `let mut` reassignment does
 * not change the iterated sequence.
 *
 * V3c-T stubs this inert: it neither evaluates the iterand nor runs the body.
 * The paired V3c leaf implements it.
 */
export function evaluateForLoop(host: ForLoopHost): void {
  void host;
}
