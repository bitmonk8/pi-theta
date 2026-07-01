// V13f / V13f-T — the `@`-query provider abandonable-Promise swallowing-handler
// per-site routing seam.
//
// This module owns the `@`-query entry in the four-site abandonable-Promise
// routing set the cancellation core (`V17a`) delegates to its owning leaves
// (`V14f`, `V13f`, `V15h`, `V9o`). Two seams make up the one swallowing-handler
// mechanism for this site (cancellation.md §"Race semantics — swallowing-handler
// attachment on every abandonable Promise", coverage-matrix row `cka-33`, this
// leaf's `V13f` facet):
//
//   - `guardQueryProviderPromise` — the construction-site attachment. It
//     attaches the swallowing handler to the underlying `@`-query provider
//     Promise at the same site that constructs it, before the first microtask
//     boundary, so a late rejection arriving after the query checkpoint has
//     already surfaced `cause: "cancelled"` is silently absorbed and never
//     reaches Node's `unhandledRejection` process event.
//   - `routeQueryProviderLateSettlement` — the discard decision the attached
//     handler applies to each settlement. Once cancellation has surfaced for
//     this invocation, the late settlement is discarded across all three side
//     channels: no second `RuntimeEvent` on the always-log channel and no
//     diagnostic of any severity (no promotion to `loom/runtime/internal-error`).
//     The `@`-query site has its own per-checkpoint `Err` surface governed by
//     the cancellation.md Surfacing rules, so the tool-call-only `Err` clauses
//     (a)/(b) are NOT extended to this site by this seam.
//
// The `Checkpoint` seam (`V8a`) is the deterministic-test substrate for landing
// the late settlement at a chosen point without depending on JS microtask
// scheduling.
//
// V13f-T (this tests-task) declares the seam shapes and stubs the two
// behaviour-bearing functions in a NON-COMPLIANT shape so the failing tests
// compile and red on their own primary assertions. The paired `V13f`
// implementation leaf makes them compliant.
//
// Spec: cancellation.md (§"Race semantics — swallowing-handler attachment on
// every abandonable Promise"); host-interfaces-services.md (§"`Checkpoint`
// seam", PIC-10).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { RuntimeEvent } from "./runtime-event-channel";

/**
 * The settlement outcome of the underlying `@`-query provider Promise — the
 * value it resolved with, or the reason it rejected with. Enumerated so the
 * discard decision is independent of the late-settle kind (cancellation.md: "the
 * discriminator is whether cancellation has already been surfaced at the
 * checkpoint, not the late-settle kind").
 */
export type QueryProviderSettlement =
  | { readonly kind: "resolved"; readonly value: unknown }
  | { readonly kind: "rejected"; readonly error: unknown };

/**
 * The live cancellation state for one `@`-query invocation. Read at settlement
 * time (not snapshotted at Promise construction), because cancellation may
 * surface at the query checkpoint between the provider Promise's construction
 * and its late settlement.
 */
export interface QueryProviderCancellationGuard {
  /**
   * True once the query checkpoint for this invocation has surfaced
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
export interface QueryProviderSideChannels {
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
export type QueryProviderLateSettlementDisposition = "discarded" | "surfaced";

/**
 * NON-COMPLIANT STUB (V13f-T). The compliant `V13f` implementation attaches the
 * swallowing handler to the underlying `@`-query provider Promise at its
 * construction site, before the first microtask boundary, routing each
 * settlement through `routeQueryProviderLateSettlement`. This stub instead
 * returns the Promise WITHOUT attaching any handler, so a late rejection
 * reaches Node's `unhandledRejection` process event — reddening the
 * construction-site attachment test (cka-33 / V13f channel 1).
 */
export function guardQueryProviderPromise<T>(
  providerPromise: Promise<T>,
  _guard: QueryProviderCancellationGuard,
  _channels: QueryProviderSideChannels,
): Promise<T> {
  // No construction-site handler attached — non-compliant.
  return providerPromise;
}

/**
 * NON-COMPLIANT STUB (V13f-T). The compliant `V13f` implementation discards a
 * late settlement once `guard.cancellationSurfaced` is true, emitting nothing
 * on any of the three side channels. This stub ignores the guard and
 * re-surfaces every settlement on both emit channels, returning `"surfaced"` —
 * reddening the three-channel suppression tests (cka-33 / V13f channels 2
 * and 3).
 */
export function routeQueryProviderLateSettlement(
  _settlement: QueryProviderSettlement,
  _guard: QueryProviderCancellationGuard,
  channels: QueryProviderSideChannels,
): QueryProviderLateSettlementDisposition {
  channels.emitRuntimeEvent({
    kind: "cancelled",
    loom: "/query",
    invocation_id: "00000000-0000-0000-0000-000000000000",
    message: "non-compliant stub re-surfaced a late @-query provider settlement",
    occurred_at: 0,
  });
  channels.emitDiagnostic({
    severity: "error",
    code: "loom/runtime/internal-error",
    message: "non-compliant stub promoted a late @-query provider settlement",
  });
  return "surfaced";
}
