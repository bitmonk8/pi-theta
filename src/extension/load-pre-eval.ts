// V4e / V4e-T — load-time pre-evaluation failure routing (ERR-1…ERR-6, ERR-16).
//
// Owns the load-time pre-evaluation failure routing surface: each of the seven
// load-time pre-eval failure causes is routed onto the `theta-system-note`
// channel with `triggerTurn:false`, never becoming an evaluation outcome and
// producing no final value. This is the surface the watcher-time reload cause
// (ERR-7, `V4g`) reuses.
//
// The seven load-time causes (errors-and-results/error-model.md pre-evaluation
// failure list, items 1–6 and 8):
//   - ERR-1  host-incompatibility detected by the capability probe (`V9a`)
//   - ERR-2  lex / parse / type batches (`V1a`…, diagnostics.md)
//   - ERR-3  frontmatter rejection (`V6a`)
//   - ERR-4  binder-model resolution failure (`V11a`)
//   - ERR-5  binder argument-binding failure — ceiling #3 (`V11f`)
//   - ERR-6  `tools:` resolution failure (`V10a`/`V6a`)
//   - ERR-16 slash-load `params` arm of ceiling #4, cross-routed through
//            ceiling #3's no-retry classification per CIO-1 (`V5e`/`V16a`)
//
// The producing subsystems assemble the failure's `theta-system-note`; V4e only
// *routes* it pre-eval, over the V7d `theta-system-note` delivery channel, so
// that `sendSystemNote`'s fixed `triggerTurn:false` option is applied and the
// failure never fires a turn.
//
// The ERR-16 cross-route's own detection and rendering belong to the site that
// owns the boundary: ceiling #4's depth walk runs at the post-default-merge AJV
// validation hook over the merged `args` (`binder/defaulting.ts`) and the
// resulting AJV-on-`args` class renders through the binder's failure-mode row.
// This module owns only the pre-eval routing of the assembled note, so the
// cross-route has exactly one implementation.
//
// V4e-T (tests-task) declares this seam and stubs the routing so the failing
// ERR-1…ERR-6/ERR-16 tests compile and red on their own primary assertions
// (the routed note never reaches the channel's `pi.sendMessage`). The paired
// V4e implementation leaf wires the routing.
//
// Spec: errors-and-results/error-model.md (ERR-1…ERR-6, ERR-16),
// hard-ceilings/ceilings-3-and-4.md (CIO-1 ceiling-#4 slash-load `params`
// cross-route through ceiling #3), pi-integration-contract/
// runtime-event-channel.md §"System notes".

import {
  sendSystemNote,
  type SystemNote,
  type SystemNoteChannelDeps,
} from "./system-note-channel";

/**
 * The seven load-time pre-evaluation failure causes (errors-and-results/
 * error-model.md pre-evaluation failure list, items 1–6 and 8). The
 * watcher-time reload-integration cause (ERR-7) is split out to `V4g` and is
 * not a member here.
 */
export type PreEvalFailureCause =
  | "capability-probe" // ERR-1
  | "lex-parse-type" // ERR-2
  | "frontmatter" // ERR-3
  | "binder-model" // ERR-4
  | "binder-arg-binding" // ERR-5 (ceiling #3)
  | "tools-resolution" // ERR-6
  | "slash-load-params"; // ERR-16 (ceiling #4 → ceiling #3 cross-route)

/** Construction dependencies for the load-time pre-eval failure router. */
export interface LoadPreEvalDeps {
  /**
   * The `theta-system-note` delivery channel (V7d) each pre-eval failure routes
   * onto — its `pi.sendMessage` seam carries the fixed `triggerTurn:false`
   * option, so a routed failure never fires a turn.
   */
  readonly channel: SystemNoteChannelDeps;
}

/**
 * The load-time pre-evaluation failure router: route an assembled pre-eval
 * failure `theta-system-note` onto the `theta-system-note` channel with
 * `triggerTurn:false` (never an evaluation outcome).
 */
export interface LoadFailurePreEvalRouter {
  /**
   * Route one assembled pre-eval failure `theta-system-note` (from any of the
   * seven load-time causes) onto the `theta-system-note` channel. Delivery
   * applies the fixed `triggerTurn:false` option, so the failure never fires a
   * turn and never becomes an evaluation outcome.
   */
  routePreEvalFailure(cause: PreEvalFailureCause, note: SystemNote): void;
}

/**
 * Construct the load-time pre-eval failure router. Its `routePreEvalFailure`
 * delivers over the V7d `theta-system-note` channel so `sendSystemNote`'s fixed
 * `triggerTurn:false` option is applied to every routed failure.
 */
export function createLoadFailurePreEvalRouter(
  deps: LoadPreEvalDeps,
): LoadFailurePreEvalRouter {
  return {
    routePreEvalFailure(cause: PreEvalFailureCause, note: SystemNote): void {
      // Route the assembled pre-eval failure `theta-system-note` onto the V7d
      // `theta-system-note` delivery channel. `sendSystemNote` applies the fixed
      // `triggerTurn:false` option (SystemNoteSender), so the failure never
      // fires a turn and never becomes an evaluation outcome — this is the
      // single routing surface all seven load-time causes (ERR-1…ERR-6,
      // ERR-16) share, and the surface the watcher-time reload cause (ERR-7,
      // `V4g`) reuses. The `cause` discriminant is carried for callers /
      // reload-integration reuse; every cause routes through the one delivery
      // path, so no per-cause branching is required here.
      void cause;
      sendSystemNote(note, deps.channel);
    },
  };
}
