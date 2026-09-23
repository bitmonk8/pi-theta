// V13f / V13f-T — the `@`-query provider abandonable-Promise swallowing-handler
// per-site routing seam.
//
// This module owns the `@`-query entry in the four-site abandonable-Promise
// routing set the cancellation core (`V17a`) delegates to its owning leaves
// (`V14f`, `V13f`, `V15h`, `V9o`). The mechanism itself is the ONE generic
// substrate in `cancellation-core.ts` (`attachSwallowingHandler` /
// `routeAbandonableSettlement`); this module aliases it under this site's names
// so the site keeps its own entry in the routing set without a second copy of
// the rule (cancellation.md §"Race semantics — swallowing-handler attachment on
// every abandonable Promise", coverage-matrix row `cka-33`, this leaf's `V13f`
// facet):
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
//     diagnostic of any severity (no promotion to `theta/runtime/internal-error`).
//     The `@`-query site has its own per-checkpoint `Err` surface governed by
//     the cancellation.md Surfacing rules, so the tool-call-only `Err` clauses
//     (a)/(b) are NOT extended to this site by this seam.
//
// The `Checkpoint` seam (`V8a`) is the deterministic-test substrate for landing
// the late settlement at a chosen point without depending on JS microtask
// scheduling.
//
// Spec: cancellation.md (§"Race semantics — swallowing-handler attachment on
// every abandonable Promise"); host-interfaces-services.md (§"`Checkpoint`
// seam", PIC-10).

import type {
  SubstrateCancellationGuard,
  SubstrateSideChannels,
} from "./cancellation-core";

/**
 * The live cancellation state for one `@`-query invocation. Read at settlement
 * time (not snapshotted at Promise construction), because cancellation may
 * surface at the query checkpoint between the provider Promise's construction
 * and its late settlement.
 */
export type QueryProviderCancellationGuard = SubstrateCancellationGuard;

/**
 * The three side channels a late settlement could reach. The swallowing handler
 * MUST keep all three silent once cancellation has surfaced: the
 * `unhandledRejection` channel (closed by attaching the handler at construction,
 * so it takes no member here), and these two — the always-log `RuntimeEvent`
 * channel and the diagnostics channel.
 */
export type QueryProviderSideChannels = SubstrateSideChannels;

/**
 * Attach the swallowing handler to the underlying `@`-query provider Promise at
 * its construction site, before the first microtask boundary, and return the
 * same Promise so callers keep the construction expression. Each settlement is
 * routed through `routeQueryProviderLateSettlement`, so a late rejection
 * arriving after cancellation surfaced is absorbed without a Node
 * `unhandledRejection` process event.
 */
export { attachSwallowingHandler as guardQueryProviderPromise } from "./cancellation-core";

/**
 * Decide the disposition of one late settlement of the underlying `@`-query
 * provider Promise. Once `guard.cancellationSurfaced` is true the settlement is
 * discarded on all three side channels (this function emits nothing); otherwise
 * the query result flows to the normal `@`-query Surfacing path.
 */
export { routeAbandonableSettlement as routeQueryProviderLateSettlement } from "./cancellation-core";
