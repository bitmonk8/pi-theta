// V4g / V4g-T — pre-evaluation reload-failure integration (ERR-7).
//
// Owns the watcher-time reload-failure → `loom-system-note` pre-eval routing.
// A synthetic watcher-time reload failure injected through V9b's
// `ReloadFailureInjector.injectReloadFailure` seam — the registry-swap and
// `.loom`/`.warp` re-parse arms V9b wires, plus V10d's settings-re-merge arm,
// all against that one injection interface — is routed pre-eval onto the
// `loom-system-note` channel with `triggerTurn:false`, without becoming an
// evaluation outcome and without standing up a live V10d/V9b watcher. It reuses
// the load-time pre-eval routing surface V4e establishes over the V7d
// `loom-system-note` delivery channel.
//
// V4g-T (tests-task) declares this seam and stubs the routing so the failing
// ERR-7 tests compile and red on their own primary assertions. The paired V4g
// implementation leaf wires the routing.
//
// Spec: errors-and-results/error-model.md (ERR-7),
// discovery/package-and-settings.md §"Watcher-time reload failures".

import {
  createReloadFailureInjector,
  type LoomRegistry,
  type ReloadFailureInjector,
} from "./reload-wiring";
import {
  emitDiagnosticBatch,
  type SystemNoteChannelDeps,
} from "./system-note-channel";
import type { Diagnostic } from "../diagnostics/diagnostic";

/** Construction dependencies for the ERR-7 pre-eval reload-failure router. */
export interface ReloadPreEvalDeps {
  /** The live registry the failure-injection arms surface against. */
  readonly registry: LoomRegistry;
  /**
   * The `loom-system-note` delivery channel (V7d) the watcher-time reload
   * failure routes onto — its `pi.sendMessage` seam carries the fixed
   * `triggerTurn:false` option, so a routed failure never fires a turn.
   */
  readonly channel: SystemNoteChannelDeps;
}

/**
 * Construct a `ReloadFailureInjector` (the single V9b interface, imported here)
 * whose injected watcher-time reload failures route pre-eval onto the
 * `loom-system-note` channel with `triggerTurn:false` — never becoming an
 * evaluation outcome (ERR-7). Reuses V9b's arm wiring (the registry-swap and
 * `.loom`/`.warp` re-parse arms, both surfacing `loom/runtime/registry-swap-
 * failed`) and V10d's settings-re-merge arm (surfacing the `loom/load/settings-*`
 * re-merge diagnostic) through that one injection interface.
 */
export function createReloadFailurePreEvalRouter(
  deps: ReloadPreEvalDeps,
): ReloadFailureInjector {
  // Reuse V9b's `ReloadFailureInjector` arm switch (registry-swap /
  // `.loom`/`.warp` re-parse → `loom/runtime/registry-swap-failed`; V10d's
  // settings-re-merge → `loom/load/settings-*`), but instead of dropping the
  // constructed diagnostic, route it pre-eval onto the V7d `loom-system-note`
  // delivery channel (ERR-7). `emitDiagnosticBatch` renders one
  // `loom-system-note` carrying the arm's `Diagnostic[]` in `details.diagnostics`
  // and delivers it through `sendSystemNote`, whose fixed `triggerTurn:false`
  // option means the routed failure never fires a turn and never becomes an
  // evaluation outcome — the same delivery surface the load-time causes reuse,
  // with no live V10d/V9b watcher stood up.
  return createReloadFailureInjector({
    registry: deps.registry,
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      emitDiagnosticBatch([diagnostic], deps.channel);
    },
  });
}
