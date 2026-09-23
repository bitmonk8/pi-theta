// V14f / V14f-T — the code-side `execute()` abandonable-Promise
// swallowing-handler per-site routing seam.
//
// This module owns the code-side `execute()` entry in the four-site
// abandonable-Promise routing set the cancellation core (`V17a`) delegates to
// its owning leaves (`V14f`, `V13f`, `V15h`, `V9o`). The mechanism itself is
// the ONE generic substrate in `cancellation-core.ts`
// (`attachSwallowingHandler` / `routeAbandonableSettlement`); this module
// aliases it under this site's names so the site keeps its own entry in the
// routing set without a second copy of the rule (cancellation.md §"Race
// semantics — swallowing-handler attachment on every abandonable Promise",
// coverage-matrix row `cka-33`, this leaf's `V14f` facet):
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
//     diagnostic of any severity (no promotion to `theta/runtime/internal-error`).
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
// Spec: cancellation.md (§"Race semantics — swallowing-handler attachment on
// every abandonable Promise"); host-interfaces-services.md (§"`Checkpoint`
// seam", PIC-10).

import type {
  SubstrateCancellationGuard,
  SubstrateSideChannels,
} from "./cancellation-core";

/**
 * The live cancellation state for one code-side tool-call invocation. Read at
 * settlement time (not snapshotted at Promise construction), because
 * cancellation may surface at the `tool-call` checkpoint between the `execute()`
 * Promise's construction and its late settlement.
 */
export type ToolExecuteCancellationGuard = SubstrateCancellationGuard;

/**
 * The three side channels a late settlement could reach. The swallowing handler
 * MUST keep all three silent once cancellation has surfaced: the
 * `unhandledRejection` channel (closed by attaching the handler at construction,
 * so it takes no member here), and these two — the always-log `RuntimeEvent`
 * channel and the diagnostics channel.
 */
export type ToolExecuteSideChannels = SubstrateSideChannels;

/**
 * Attach the swallowing handler to the underlying code-side `execute()` Promise
 * at its construction site, before the first microtask boundary, and return the
 * same Promise so callers keep the construction expression. Each settlement is
 * routed through `routeToolExecuteLateSettlement`, so a late rejection arriving
 * after cancellation surfaced is absorbed without a Node `unhandledRejection`
 * process event.
 */
export { attachSwallowingHandler as guardToolExecutePromise } from "./cancellation-core";

/**
 * Decide the disposition of one late settlement of the underlying code-side
 * `execute()` Promise. Once `guard.cancellationSurfaced` is true the settlement
 * is discarded on all three side channels (this function emits nothing);
 * otherwise the tool result flows to the normal tool-call surfacing path.
 *
 * The tool-call-only `Err` clauses (a)/(b) (CNCL-1 / CNCL-2) are owned by the
 * *late-settlement discard at the tool-call checkpoint* paragraph and are NOT
 * re-derived here; this seam owns only the three-side-channel suppression.
 */
export { routeAbandonableSettlement as routeToolExecuteLateSettlement } from "./cancellation-core";
