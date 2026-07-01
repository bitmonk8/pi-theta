// V9q / V9q-T — watcher post-`error`/post-throw terminal recovery posture
// (PIC-55). When the chokidar `error` route fires or the watcher throws such
// that one or more watched roots stop delivering events (the
// *stopped-delivering — terminal* case), the runtime learns of the condition
// through the V8e `FileWatcher` seam's enumerated terminal-signal channel
// (`onTerminate`), leaves the watcher torn down rather than re-armed, and emits
// a single persistent `loom/runtime/watcher-terminated` `loom-system-note`
// prompting `/reload` through the V7d `loom-system-note` channel as its primary
// sink (NOT `ctx.ui.notify`). The `LoomRegistry` stays live and dispatchable
// (subsequent slash dispatches route through arm (a) of `readDrainState`
// against the last-published snapshot) and NO `LoomRegistry` drain-state tag is
// written from this path — a tag write here would trip the `session_shutdown`
// handler-entry short-circuit.
//
// Spec: pi-integration-contract/registration-steps.md (PIC-55),
// pi-integration-contract/host-interfaces-services.md (PIC-14 FileWatcher seam),
// diagnostics.md, diagnostics/code-registry-runtime.md
// (`loom/runtime/watcher-terminated`).
//
// V9q-T (tests-task) declares this seam and stubs the behaviour-bearing
// `armWatcherWithTerminalRecovery` function so the failing tests compile and
// red on their own primary assertions; the paired V9q implementation fills in
// the terminal-recovery body (tear-down + persistent-note emission).

import type {
  FileWatcher,
  FileWatchEvent,
  Unsubscribe,
} from "../seams/file-watcher";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { LoomRegistry } from "./reload-wiring";
import { emitDiagnosticBatch, type SystemNoteChannelDeps } from "./system-note-channel";

/**
 * The diagnostics-registry code the terminal recovery posture emits, per the
 * `loom/runtime/watcher-terminated` row in
 * diagnostics/code-registry-runtime.md.
 */
export const WATCHER_TERMINATED_CODE = "loom/runtime/watcher-terminated";

/**
 * The stable, location-less message the `loom/runtime/watcher-terminated`
 * diagnostic carries, sourced verbatim from the *Message* column of the runtime
 * diagnostics registry (diagnostics/code-registry-runtime.md). Tests source the
 * expected string from the registry rather than this constant, per the
 * *Diagnostic message anchors* rule.
 */
export const WATCHER_TERMINATED_MESSAGE =
  "loom watcher terminated; hot-reload halted until /reload";

/**
 * Construct the single `loom/runtime/watcher-terminated` diagnostic emitted on
 * the terminal-signal path. Location-less (a watcher-lifecycle event, not a
 * source-position defect).
 */
export function watcherTerminatedDiagnostic(): Diagnostic {
  return {
    severity: "error",
    code: WATCHER_TERMINATED_CODE,
    message: WATCHER_TERMINATED_MESSAGE,
  };
}

/** Construction dependencies for the terminal recovery wiring. */
export interface WatcherTerminalRecoveryDeps {
  /** The V8e `FileWatcher` seam to arm and, on termination, tear down. */
  readonly watcher: FileWatcher;
  /** The discovered roots to watch. */
  readonly roots: readonly string[];
  /** The steady-state change handler (add/change/unlink delivery contract). */
  readonly onChange: (event: FileWatchEvent) => void;
  /**
   * The live `LoomRegistry` — kept live and dispatchable across the terminal
   * signal; the recovery path writes no drain-state tag against it.
   */
  readonly registry: LoomRegistry;
  /** The V7d `loom-system-note` delivery channel dependencies. */
  readonly channel: SystemNoteChannelDeps;
}

/**
 * Arm the `FileWatcher` over `roots` with the terminal-signal recovery posture
 * wired onto its `onTerminate` channel (PIC-55). Returns the watcher's
 * `Unsubscribe`.
 *
 * V9q-T stub: arms the change-delivery contract but wires an INERT `onTerminate`
 * callback — the terminal recovery posture (tear-down + persistent-note
 * emission) is absent, so the paired-V9q tests red on their primary assertions
 * (no note emitted, watcher not torn down). The paired V9q implementation fills
 * in the `onTerminate` body.
 */
export function armWatcherWithTerminalRecovery(
  deps: WatcherTerminalRecoveryDeps,
): Unsubscribe {
  // V9q-T stub: the terminal-signal channel is wired but the recovery body is
  // absent. The paired V9q implementation replaces this no-op with: (1) tear
  // the watcher down via `unsub()` (leave it torn down, never re-armed); (2)
  // emit exactly one persistent `loom/runtime/watcher-terminated`
  // `loom-system-note` through the V7d channel as its primary sink; (3) leave
  // the `LoomRegistry` untouched (no drain-state tag written).
  const unsub = deps.watcher.watch(deps.roots, deps.onChange, () => {
    // Intentionally inert in the tests-task stub. Referencing the recovery
    // collaborators keeps them wired for the paired V9q implementation without
    // performing the recovery.
    void unsub;
    void deps.registry;
    void emitDiagnosticBatch;
  });
  return unsub;
}
