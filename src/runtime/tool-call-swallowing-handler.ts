// V14f / V14f-T — the code-side `execute()` abandonable-Promise
// swallowing-handler per-site routing seam.
//
// This module owns the code-side `execute()` entry in the four-site
// abandonable-Promise routing set the cancellation core (`V17a`) delegates to
// its owning leaves (`V14f`, `V13f`, `V15h`, `V9o`). Two seams make up the one
// swallowing-handler mechanism for this site (cancellation.md §"Race semantics —
// swallowing-handler attachment on every abandonable Promise", coverage-matrix
// row `cka-33`, this leaf's `V14f` facet):
//
//   - `guardToolExecutePromise` — the construction-site attachment. It attaches
//     the swallowing handler to the underlying `execute()` Promise at the same
//     site that constructs it, before the first microtask boundary, so a late
//     rejection arriving after the `tool-call` checkpoint has already surfaced
//     `cause: "cancelled"` is silently absorbed and never reaches Node's
//     `unhandledRejection` process event.
//   - `routeToolExecuteLateSettlement` — the discard decision the attached
//     handler applies to each settlement. Once cancellation has surfaced for
//     this invocation, the late settlement is discarded across all three side
//     channels: no second `RuntimeEvent` on the always-log channel and no
//     diagnostic of any severity (no promotion to `loom/runtime/internal-error`).
//     The code-side tool-call site is the one site whose `Err` clauses (a)/(b)
//     (CNCL-1 / CNCL-2) are owned by the *late-settlement discard at the
//     tool-call checkpoint* paragraph; those `Err`-channel obligations are NOT
//     re-derived here — this seam owns only the three-side-channel suppression
//     the swallowing-handler paragraph mandates (no `unhandledRejection`, no
//     second `RuntimeEvent`, no diagnostic).
//
// The `Checkpoint` seam (`V8a`) is the deterministic-test substrate for landing
// the late settlement at a chosen point without depending on JS microtask
// scheduling.
//
// `guardToolExecutePromise` attaches the construction-site handler and routes
// every settlement through `routeToolExecuteLateSettlement`, which discards a
// settlement once cancellation has surfaced for the invocation (emitting nothing
// on any of the three side channels) and reports it live otherwise.
//
// Spec: cancellation.md (§"Race semantics — swallowing-handler attachment on
// every abandonable Promise"); host-interfaces-services.md (§"`Checkpoint`
// seam", PIC-10).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { RuntimeEvent } from "./runtime-event-channel";

/**
 * The settlement outcome of the underlying code-side `execute()` Promise — the
 * value it resolved with, or the reason it rejected with. Enumerated so the
 * discard decision is independent of the late-settle kind (cancellation.md: "the
 * discriminator is whether cancellation has already been surfaced at the
 * checkpoint, not the late-settle kind").
 */
export type ToolExecuteSettlement =
  | { readonly kind: "resolved"; readonly value: unknown }
  | { readonly kind: "rejected"; readonly error: unknown };

/**
 * The live cancellation state for one code-side tool-call invocation. Read at
 * settlement time (not snapshotted at Promise construction), because
 * cancellation may surface at the `tool-call` checkpoint between the `execute()`
 * Promise's construction and its late settlement.
 */
export interface ToolExecuteCancellationGuard {
  /**
   * True once the `tool-call` checkpoint for this invocation has surfaced
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
export interface ToolExecuteSideChannels {
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
export type ToolExecuteLateSettlementDisposition = "discarded" | "surfaced";

/**
 * NON-COMPLIANT STUB (V14f-T). The compliant `V14f` implementation attaches the
 * swallowing handler to the underlying code-side `execute()` Promise at its
 * construction site, before the first microtask boundary, routing each
 * settlement through `routeToolExecuteLateSettlement`. This stub instead
 * returns the Promise WITHOUT attaching any handler, so a late rejection
 * reaches Node's `unhandledRejection` process event — reddening the
 * construction-site attachment test (cka-33 / V14f channel 1).
 */
export function guardToolExecutePromise<T>(
  executePromise: Promise<T>,
  _guard: ToolExecuteCancellationGuard,
  _channels: ToolExecuteSideChannels,
): Promise<T> {
  // No construction-site handler attached — non-compliant.
  return executePromise;
}

/**
 * NON-COMPLIANT STUB (V14f-T). The compliant `V14f` implementation discards a
 * late settlement once `guard.cancellationSurfaced` is true, emitting nothing
 * on any of the three side channels. This stub ignores the guard and
 * re-surfaces every settlement on both emit channels, returning `"surfaced"` —
 * reddening the three-channel suppression tests (cka-33 / V14f channels 2
 * and 3).
 */
export function routeToolExecuteLateSettlement(
  _settlement: ToolExecuteSettlement,
  _guard: ToolExecuteCancellationGuard,
  channels: ToolExecuteSideChannels,
): ToolExecuteLateSettlementDisposition {
  channels.emitRuntimeEvent({
    kind: "code_tool",
    loom: "/tool-call",
    invocation_id: "00000000-0000-0000-0000-000000000000",
    message: "non-compliant stub re-surfaced a late execute() settlement",
    occurred_at: 0,
  });
  channels.emitDiagnostic({
    severity: "error",
    code: "loom/runtime/internal-error",
    message: "non-compliant stub promoted a late execute() settlement",
  });
  return "surfaced";
}
