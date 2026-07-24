// V15m / V15m-T — the invoke-site cancellation checkpoint (cka-47, V15m facet)
// and the completed-callee-finality live-carrier witness (ERR-13).
//
// This module owns the two cancellation facets that ride on the live `invoke`
// execution surface, split out of `V15a` (invocation-core) per conventions.md
// §smallest-shippable-leaf, mirroring the V15f/V15g/V15h and V14g carve-out
// pattern:
//
//   - cka-47 (`V15m` facet) — a cancellation checkpoint fires immediately before
//     each `invoke` call on the live execution surface. The interpreter awaits
//     `checkpoint.before("invoke", site)` immediately before dispatching the
//     child invoke, then reads `signal.aborted`; an abort observed at that
//     pre-dispatch checkpoint skips the spawn and surfaces a cancelled outcome.
//     This is the `invoke` per-site presence arm distributed off `V17c`'s
//     checkpoint-granularity surface (cancellation.md §Granularity; V8a
//     `Checkpoint` seam PIC-10, host-interfaces-services.md#checkpoint-seam).
//   - ERR-13 (delegated live-carrier witness for `V4f`'s completed-callee-
//     finality deferral) — an `invoke` child driven to completion on the live
//     execution surface keeps its committed side effect after a downstream
//     `?` / panic / cancel, with no compensating turn injected. The guarantee is
//     architectural: the runtime holds no compensating / rollback path (see
//     `handleNoRollbackTerminalEvent`), so a completed callee's side effect
//     survives by construction (errors-and-results/error-model.md#err-13).
//
// V15m (this implementation leaf) fills in `runInvokeChild`: it awaits
// `checkpoint.before("invoke", site)` immediately before the child spawn, reads
// `signal.aborted` and skips the spawn on an observed abort, otherwise drives
// the child to completion and surfaces its top-level `Result` together with the
// completed callee's `committed` side effects. Those side effects remain final
// under any downstream terminal event because the runtime holds no compensating
// path — the ERR-13 witness observes finality by construction.
//
// Spec: cancellation.md §Granularity; invocation.md; errors-and-results/
// error-model.md §"No rollback" (ERR-13); host-interfaces-services.md PIC-10.

import type { Checkpoint, CheckpointSite } from "../seams/checkpoint";
import type { ThetaValue, ResultValue } from "./value";
import { makeErr } from "./value";
import type { CommittedSideEffect } from "./no-rollback";
import { HostFatal, isThetaPanic } from "./runtime-panics";
import type { InvokeInfraError } from "./query-error";
import { InvokeInfraCauseError } from "./query-error";

/**
 * One `invoke` child driven on the live execution surface.
 *
 *   - `calleePath` is the resolved callee path the child was spawned from.
 *   - `drive()` runs the child to completion and returns its top-level
 *     `Result<T, QueryError>` (an `Ok` payload on success, an `Err` envelope on
 *     the callee's own failure or an infra failure around the callee body).
 *   - `committed` exposes the side effects the completed callee produced before
 *     any downstream terminal event, so the ERR-13 witness can assert they
 *     remain final.
 */
export interface InvokeChild {
  readonly calleePath: string;
  drive(): Promise<ResultValue>;
  readonly committed: readonly CommittedSideEffect[];
}

/**
 * The outcome of driving one `invoke` child on the live surface:
 *   - `value` — the child ran to completion; `result` is its top-level `Result`
 *     and `committed` are the side effects it produced (each final under any
 *     downstream terminal event, ERR-13);
 *   - `cancelled` — the pre-dispatch checkpoint observed the abort; the child
 *     was never spawned and no side effect was committed.
 */
export type InvokeChildOutcome =
  | {
      readonly kind: "value";
      readonly result: ResultValue;
      readonly committed: readonly CommittedSideEffect[];
    }
  | { readonly kind: "cancelled"; readonly committed: readonly CommittedSideEffect[] };

/**
 * Drive one `invoke(...)` child on the live surface under the cancellation
 * granularity rule: await `checkpoint.before("invoke", site)` immediately before
 * spawning the child (cka-47, V15m facet; cancellation.md §Granularity), read
 * `signal.aborted`, and skip the spawn when it has fired. Otherwise drive the
 * child to completion via `child.drive()` and surface its top-level `Result`
 * together with the completed callee's `committed` side effects, which remain
 * final under any downstream terminal event (ERR-13; the runtime holds no
 * compensating path — see `handleNoRollbackTerminalEvent`).
 *
 * V15m-T stubs this inert: it fires no checkpoint, never drives the child, and
 * returns a cancelled outcome carrying no committed side effect. The paired V15m
 * leaf implements it.
 */
export async function runInvokeChild(
  checkpoint: Checkpoint,
  signal: AbortSignal,
  site: CheckpointSite,
  child: InvokeChild,
): Promise<InvokeChildOutcome> {
  // The `invoke` checkpoint fires immediately before the child spawn's signal
  // read (cka-47, V15m facet; cancellation.md §Granularity, the `invoke`
  // per-site presence arm distributed off V17c). An abort observed here skips
  // the spawn — the child never runs and no side effect is committed.
  await checkpoint.before("invoke", site);
  if (signal.aborted) {
    return { kind: "cancelled", committed: [] };
  }

  // Drive the child to completion and surface its top-level `Result` together
  // with the completed callee's committed side effects. Those side effects stay
  // final under any downstream `?` / panic / cancel (ERR-13) because the runtime
  // holds no compensating / rollback path — see `handleNoRollbackTerminalEvent`.
  //
  // INVCEIL-2 (errors-and-results.md §Runtime panics; hard-ceilings.md
  // ceiling-#1): a panic thrown inside the callee subtree is NOT a value at the
  // callee's own surface — it bypasses the callee's `?`/`match` and unwinds as a
  // thrown `ThetaPanic`. At the invoke boundary it becomes a VALUE to the parent:
  // the parent observes `Err(InvokeInfraError{ cause: "panic", ... })`, which its
  // own `?` / `match Err(_)` can then catch. This narrow boundary catch exists
  // only to re-wrap the callee's panic (and the runtime-defect surface) into that
  // documented `Err` envelope; if the thrown value is not a theta panic it is an
  // unexpected interpreter throw, which the same spec routes to the parent as
  // `Err(InvokeInfraError{ cause: "internal_error", ... })`. An uncatchable host
  // fatal (NOCEIL-3) must terminate the process and is rethrown unwrapped.
  try {
    const result = await child.drive();
    return { kind: "value", result, committed: child.committed };
  } catch (thrown) { // allow-broad-catch: invoke-boundary-panic-wrap — errors-and-results.md#runtime-panics
    if (thrown instanceof HostFatal) {
      throw thrown;
    }
    // RFC-0005 / PIC-40: a thrown `InvokeInfraCauseError` pins the precise
    // `invoke_infra` cause the boundary surfaces (e.g. the child-side model
    // pre-flight mismatch), rather than the default `internal_error`.
    const pinnedCause =
      thrown instanceof InvokeInfraCauseError ? thrown.invokeInfraCause : undefined;
    const error: InvokeInfraError = {
      kind: "invoke_infra",
      message: panicMessage(thrown),
      callee_path: child.calleePath,
      cause: pinnedCause ?? (isThetaPanic(thrown) ? "panic" : "internal_error"),
    };
    return {
      kind: "value",
      result: makeErr(error as unknown as ThetaValue),
      committed: child.committed,
    };
  }
}

/** The message string carried by a thrown panic / interpreter throw at the invoke boundary. */
function panicMessage(thrown: unknown): string {
  if (thrown instanceof Error) {
    return thrown.message;
  }
  return String(thrown);
}
