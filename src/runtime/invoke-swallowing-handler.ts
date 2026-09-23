// V15h / V15h-T — the `invoke` child top-level execution-Promise
// swallowing-handler per-site routing seam.
//
// This module owns the `invoke`-child entry in the four-site abandonable-Promise
// routing set the cancellation core (`V17a`) delegates to its owning leaves
// (`V14f`, `V13f`, `V15h`, `V9o`). The mechanism itself is the ONE generic
// substrate in `cancellation-core.ts` (`attachSwallowingHandler` /
// `routeAbandonableSettlement`); this module aliases it under this site's names
// so the site keeps its own entry in the routing set without a second copy of
// the rule (cancellation.md §"Race semantics — swallowing-handler attachment on
// every abandonable Promise", coverage-matrix row `cka-33`):
//
//   - `guardInvokeExecutionPromise` — the construction-site attachment. It
//     attaches the swallowing handler to the `invoke` child's top-level
//     execution Promise at the same site that constructs it, before the first
//     microtask boundary, so a late rejection arriving after the `invoke`
//     checkpoint has already surfaced `cause: "cancelled"` is silently absorbed
//     and never reaches Node's `unhandledRejection` process event.
//   - `routeInvokeExecutionLateSettlement` — the discard decision the attached
//     handler applies to each settlement. Once cancellation has surfaced for
//     this invocation, the late settlement is discarded across all three side
//     channels: no second `RuntimeEvent` on the always-log channel and no
//     diagnostic of any severity (no promotion to `theta/runtime/internal-error`).
//
// The `Checkpoint` seam (`V8a`) is the deterministic-test substrate for landing
// the late settlement at a chosen point without depending on JS microtask
// scheduling.
//
// Spec: cancellation.md (§"Race semantics — swallowing-handler attachment on
// every abandonable Promise"); host-interfaces-services.md (§"`Checkpoint`
// seam", PIC-10).

import type {
  AbandonableSettlement,
  SubstrateCancellationGuard,
  SubstrateDisposition,
  SubstrateSideChannels,
} from "./cancellation-core";

/**
 * The settlement outcome of the `invoke` child's top-level execution Promise —
 * the value it resolved with, or the reason it rejected with. Enumerated so the
 * discard decision is independent of the late-settle kind (cancellation.md: "the
 * discriminator is whether cancellation has already been surfaced at the
 * checkpoint, not the late-settle kind").
 */
export type InvokeExecutionSettlement = AbandonableSettlement;

/**
 * The live cancellation state for one invocation. Read at settlement time (not
 * snapshotted at Promise construction), because cancellation may surface at the
 * `invoke` checkpoint between the child execution Promise's construction and its
 * late settlement.
 */
export type InvokeCancellationGuard = SubstrateCancellationGuard;

/**
 * The three side channels a late settlement could reach. The swallowing handler
 * MUST keep all three silent once cancellation has surfaced: the
 * `unhandledRejection` channel (closed by attaching the handler at construction,
 * so it takes no member here), and these two — the always-log `RuntimeEvent`
 * channel and the diagnostics channel.
 */
export type InvokeExecutionSideChannels = SubstrateSideChannels;

/**
 * The disposition of one late settlement: `"discarded"` once cancellation has
 * surfaced (silently absorbed on all three side channels), or `"surfaced"` on
 * the pre-cancellation path where the child result flows to the normal `invoke`
 * Surfacing rules.
 */
export type InvokeLateSettlementDisposition = SubstrateDisposition;

/**
 * Attach the swallowing handler to the `invoke` child's top-level execution
 * Promise at its construction site, before the first microtask boundary, and
 * return the same Promise so callers keep the construction expression. Each
 * settlement is routed through `routeInvokeExecutionLateSettlement`, so a late
 * rejection arriving after cancellation surfaced is absorbed without a Node
 * `unhandledRejection` process event.
 */
export { attachSwallowingHandler as guardInvokeExecutionPromise } from "./cancellation-core";

/**
 * Decide the disposition of one late settlement of the `invoke` child's
 * execution Promise. Once `guard.cancellationSurfaced` is true the settlement is
 * discarded on all three side channels (this function emits nothing); otherwise
 * the child result flows to the normal `invoke` Surfacing path.
 */
export { routeAbandonableSettlement as routeInvokeExecutionLateSettlement } from "./cancellation-core";
