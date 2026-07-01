// V9o / V9o-T — the subagent-mode `AgentSession.abort()` abandonable-Promise
// swallowing-handler per-site routing seam.
//
// This module owns the subagent-mode entry in the four-site abandonable-Promise
// routing set the cancellation core (`V17a`) delegates to its owning leaves
// (`V14f`, `V13f`, `V15h`, `V9o`). Two seams make up the one swallowing-handler
// mechanism for this site (cancellation.md §"Race semantics — swallowing-handler
// attachment on every abandonable Promise", coverage-matrix row `cka-33`, this
// leaf's `V9o` facet):
//
//   - `guardSubagentAbortPromise` — the construction-site attachment. It
//     attaches the swallowing handler to the subagent-mode `AgentSession.abort()`
//     Promise at the same site that constructs it, before the first microtask
//     boundary, so a late rejection arriving after the subagent checkpoint has
//     already surfaced `cause: "cancelled"` is silently absorbed and never
//     reaches Node's `unhandledRejection` process event.
//   - `routeSubagentAbortLateSettlement` — the discard decision the attached
//     handler applies to each settlement. Once cancellation has surfaced for
//     this invocation, the late settlement is discarded across all three side
//     channels: no second `RuntimeEvent` on the always-log channel and no
//     diagnostic of any severity (no promotion to `loom/runtime/internal-error`).
//     The `AgentSession.abort()` Promise has no loom-language call site to
//     rebind and no per-invocation `Err` channel, so the tool-call-only `Err`
//     clauses (a)/(b) are out of scope for this site.
//
// The `Checkpoint` seam (`V8a`) is the deterministic-test substrate for landing
// the late settlement at a chosen point without depending on JS microtask
// scheduling.
//
//
// Spec: cancellation.md (§"Race semantics — swallowing-handler attachment on
// every abandonable Promise"); host-interfaces-services.md (§"`Checkpoint`
// seam", PIC-10).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { RuntimeEvent } from "./runtime-event-channel";

/**
 * The settlement outcome of the subagent-mode `AgentSession.abort()` Promise —
 * the value it resolved with, or the reason it rejected with. Enumerated so the
 * discard decision is independent of the late-settle kind (cancellation.md: "the
 * discriminator is whether cancellation has already been surfaced at the
 * checkpoint, not the late-settle kind").
 */
export type SubagentAbortSettlement =
  | { readonly kind: "resolved"; readonly value: unknown }
  | { readonly kind: "rejected"; readonly error: unknown };

/**
 * The live cancellation state for one subagent invocation. Read at settlement
 * time (not snapshotted at Promise construction), because cancellation may
 * surface at the subagent checkpoint between the `AgentSession.abort()` Promise's
 * construction and its late settlement.
 */
export interface SubagentAbortCancellationGuard {
  /**
   * True once the subagent checkpoint for this invocation has surfaced
   * `cause: "cancelled"`; a late settlement observed while this is true is the
   * abandoned case the swallowing handler discards.
   */
  cancellationSurfaced: boolean;
}

/**
 * The three side channels a late settlement could reach. The swallowing handler
 * MUST keep all three silent once cancellation has surfaced: the
 * `unhandledRejection` channel (closed by attaching the handler at construction,
 * so it takes no member here), and these two — the always-log `RuntimeEvent`
 * channel and the diagnostics channel.
 */
export interface SubagentAbortSideChannels {
  /** Emit a second `RuntimeEvent` for this invocation (must not fire post-cancel). */
  readonly emitRuntimeEvent: (event: RuntimeEvent) => void;
  /** Emit a diagnostic for this invocation (must not fire post-cancel). */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/**
 * The disposition of one late settlement: `"discarded"` once cancellation has
 * surfaced (silently absorbed on all three side channels), or `"surfaced"` on
 * the pre-cancellation path.
 */
export type SubagentAbortLateSettlementDisposition = "discarded" | "surfaced";

/**
 * Attach the swallowing handler to the subagent-mode `AgentSession.abort()`
 * Promise at its construction site, before the first microtask boundary
 * (cancellation.md §"Race semantics — swallowing-handler attachment on every
 * abandonable Promise"). Attaching the handler synchronously here — rather than
 * lazily after cancellation fires — is required because a `.catch` registered
 * late cannot catch a rejection already queued for `unhandledRejection`. The
 * handler routes each settlement through `routeSubagentAbortLateSettlement`, so
 * a late settlement arriving after the subagent checkpoint has surfaced
 * `cause: "cancelled"` is silently absorbed on all three side channels: the
 * `unhandledRejection` channel is closed by the very act of attaching a
 * rejection handler here (cka-33 / V9o channel 1), and the `RuntimeEvent` /
 * diagnostic channels by the discard decision (channels 2 and 3).
 *
 * The original Promise is returned so a caller on the (non-abandoned)
 * pre-cancellation path may still await its value; the attached handler keeps
 * the Promise handled for its lifetime regardless of whether the return value
 * is awaited.
 */
export function guardSubagentAbortPromise<T>(
  abortPromise: Promise<T>,
  guard: SubagentAbortCancellationGuard,
  channels: SubagentAbortSideChannels,
): Promise<T> {
  // Construction-site attachment, before the first microtask boundary: this
  // handler makes `abortPromise` a handled Promise, so a late rejection never
  // reaches Node's `unhandledRejection` process event.
  abortPromise.then(
    (value) =>
      routeSubagentAbortLateSettlement({ kind: "resolved", value }, guard, channels),
    (error: unknown) =>
      routeSubagentAbortLateSettlement({ kind: "rejected", error }, guard, channels),
  );
  return abortPromise;
}

/**
 * The discard decision the construction-site handler applies to each settlement
 * of the subagent-mode `AgentSession.abort()` Promise. The discriminator is
 * whether cancellation has already surfaced for this invocation, not the
 * late-settle kind (cancellation.md: "the discriminator is whether cancellation
 * has already been surfaced at the checkpoint, not the late-settle kind").
 *
 * Once `guard.cancellationSurfaced` is true the settlement is the abandoned
 * case: it is discarded totally, emitting nothing on either emit channel — no
 * second `RuntimeEvent` on the always-log channel and no diagnostic of any
 * severity. A late rejection whose `.message` would otherwise be
 * diagnostic-worthy (e.g. an OOM-style host failure) is still discarded;
 * promotion to `loom/runtime/internal-error` would re-introduce the
 * second-event surface the rule forbids. The `AgentSession.abort()` Promise has
 * no loom-language call site to rebind and no per-invocation `Err` channel, so
 * the tool-call-only `Err` clauses (a)/(b) do not apply here.
 */
export function routeSubagentAbortLateSettlement(
  _settlement: SubagentAbortSettlement,
  guard: SubagentAbortCancellationGuard,
  _channels: SubagentAbortSideChannels,
): SubagentAbortLateSettlementDisposition {
  if (guard.cancellationSurfaced) {
    // Abandoned case: silently absorb on all three side channels.
    return "discarded";
  }
  // Pre-cancellation path: the Promise settled before the subagent checkpoint
  // surfaced `cause: "cancelled"`, so this is not the abandoned case and the
  // handler emits nothing of its own (this site owns no per-invocation `Err`
  // channel).
  return "surfaced";
}
