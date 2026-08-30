// V8e — in-memory `FakeFileWatcher` conforming `FileWatcher` seam test double
// (PIC-14). The conformance vehicle for the watcher delivery contract: `emit`
// synchronously invokes the attached change handler with one of the three change
// kinds, and `terminate` drives the terminal-signal channel — a stopped-delivering
// observation distinct from the three change kinds — synchronously invoking the
// attached `onTerminate` callback. `watch` returns an idempotent `Unsubscribe`.
//
// Spec: host-interfaces-services.md PIC-14.

import type {
  FileWatcher,
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
  WatchTermination,
} from "../../src/seams/file-watcher";

export class FakeFileWatcher implements FileWatcher {
  // The single attached change handler and optional terminal-signal callback.
  //
  // Bug 0313 (fixed 0.316.0), constraint 4: the fake previously cleared BOTH
  // callbacks synchronously on unsubscribe, which hid the burst double-note
  // the bug reports. So `#onTerminate` now stays attached across unsubscribe
  // (only `#handler` is nulled, closing the steady-state delivery contract),
  // keeping a same-tick post-unsubscribe terminal signal observable at the
  // recovery layer. This models a MINIMAL CONFORMING `FileWatcher` seam
  // (PIC-14) whose unsubscribe does not synchronously sever the terminal
  // channel — a severance PIC-14 does not mandate — NOT the shipped
  // `PiFileWatcher`, whose per-`watch()` active-guard swallows every
  // post-unsubscribe callback (adapter suite cell (D)). The goal is to keep
  // the recovery layer's once-latch (constraint 2) testable against a
  // same-tick burst independent of what the adapter itself guarantees.
  // `terminate` is deliberately not active-guarded for the same reason.
  #handler: ((event: FileWatchEvent) => void) | undefined;
  #onTerminate: OnWatchTerminate | undefined;

  watch(
    _roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.#handler = handler;
    this.#onTerminate = onTerminate;
    let active = true;
    return () => {
      // Idempotent teardown: calling twice is a no-op. `#onTerminate` is left
      // attached on purpose (see the field doc-comment, bug 0313 constraint 4):
      // a post-unsubscribe `terminate()` still reaches it. This models a
      // conforming seam whose unsubscribe does not synchronously sever the
      // terminal channel — NOT the shipped `PiFileWatcher`, whose per-`watch()`
      // active-guard swallows post-unsubscribe delivery even though its raw
      // chokidar `error` listener likewise survives the async close.
      if (!active) return;
      active = false;
      this.#handler = undefined;
    };
  }

  /** Injection point: synchronously deliver one change-kind event to the attached handler. */
  emit(event: FileWatchEvent): void {
    this.#handler?.(event);
  }

  /**
   * Injection point: drive the terminal-signal channel (a stopped-delivering
   * observation). It reaches the `onTerminate` callback, never the change
   * handler — a `terminate` with no `onTerminate` attached is a no-op.
   */
  terminate(termination: WatchTermination): void {
    this.#onTerminate?.(termination);
  }
}
