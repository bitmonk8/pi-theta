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
  // `undefined` once no subscription is active (initial state, or after the
  // returned `Unsubscribe` runs) so a post-unsubscribe `emit`/`terminate` is a
  // no-op rather than reaching a stale handler.
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
      // Idempotent teardown: calling twice is a no-op.
      if (!active) return;
      active = false;
      this.#handler = undefined;
      this.#onTerminate = undefined;
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
