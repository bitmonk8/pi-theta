// V4e / V4e-T — load-time pre-evaluation failure routing (ERR-1…ERR-6, ERR-16).
//
// Owns the load-time pre-evaluation failure routing surface: each of the seven
// load-time pre-eval failure causes is routed onto the operator-facing note
// channels without firing a turn, never becoming an evaluation outcome and
// producing no final value. The watcher-time reload cause (ERR-7) does not
// route through this module: hot-reload.ts emits it with `emitDiagnosticBatch`
// directly on the same channel deps.
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
// *routes* it pre-eval, through `deliverOperatorNotePreferringEntry`: the
// `theta-progress-entry` entry channel when it is live (PIC-72; an entry never
// enters LLM context and fires no turn), else the V7d `theta-system-note`
// message channel, whose fixed `triggerTurn:false` option likewise never fires
// a turn.
//
// The ERR-16 cross-route's own detection and rendering belong to the site that
// owns the boundary: ceiling #4's depth walk runs at the post-default-merge AJV
// validation hook over the merged `args` (`binder/defaulting.ts`) and the
// resulting AJV-on-`args` class renders through the binder's failure-mode row.
// This module owns only the pre-eval routing of the assembled note, so the
// cross-route has exactly one implementation.
//
// Spec: errors-and-results/error-model.md (ERR-1…ERR-6, ERR-16),
// hard-ceilings/ceilings-3-and-4.md (CIO-1 ceiling-#4 slash-load `params`
// cross-route through ceiling #3), pi-integration-contract/
// runtime-event-channel.md §"System notes".

import {
  deliverOperatorNotePreferringEntry,
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
   * The operator-facing note channel deps (V7d) each pre-eval failure routes
   * onto — the `theta-progress-entry` entry channel when live, else the
   * `theta-system-note` message channel with its fixed `triggerTurn:false`
   * option. Neither realization fires a turn.
   */
  readonly channel: SystemNoteChannelDeps;
}

/**
 * The load-time pre-evaluation failure router: route an assembled pre-eval
 * failure `theta-system-note` onto the operator-facing note channels without
 * firing a turn (never an evaluation outcome).
 */
export interface LoadFailurePreEvalRouter {
  /**
   * Route one assembled pre-eval failure `theta-system-note` (from any of the
   * seven load-time causes). Delivery never fires a turn, so the failure never
   * becomes an evaluation outcome. Every cause takes the one delivery path, so
   * the router carries no per-cause discriminant.
   */
  routePreEvalFailure(note: SystemNote): void;
}

/**
 * Construct the load-time pre-eval failure router. Its `routePreEvalFailure`
 * delivers through `deliverOperatorNotePreferringEntry` — entry channel first,
 * `theta-system-note` message channel (`triggerTurn:false`) as the fallback —
 * so no routed failure fires a turn.
 */
export function createLoadFailurePreEvalRouter(
  deps: LoadPreEvalDeps,
): LoadFailurePreEvalRouter {
  return {
    routePreEvalFailure(note: SystemNote): void {
      // The single routing surface all seven load-time causes (ERR-1…ERR-6,
      // ERR-16) share. PIC-72: error-severity parse/load failures are
      // single-element members of the diagnostic-BATCH class, so they ride the
      // entry channel first and fall back to the unchanged `sendMessage`
      // realization; neither fires a turn.
      deliverOperatorNotePreferringEntry(note, deps.channel);
    },
  };
}
