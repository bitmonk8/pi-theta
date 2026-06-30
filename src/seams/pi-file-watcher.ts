// V8e — `PiFileWatcher` production adapter for the `FileWatcher` seam (PIC-14).
//
// Production wiring uses a chokidar watcher: `watch(roots, handler, onTerminate?)`
// attaches one handler over the supplied roots, filters chokidar's events down to
// the three load-bearing change kinds (`add`/`change`/`unlink`), and conveys a
// post-`error`/post-throw stopped-delivering observation over the terminal-signal
// channel. The returned `Unsubscribe` tears down the underlying watcher and is
// idempotent.
//
// Spec: host-interfaces-services.md PIC-14.

import { watch as chokidarWatch } from "chokidar";
import type {
  FileWatcher,
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
} from "./file-watcher";

export class PiFileWatcher implements FileWatcher {
  watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    // chokidar with `ignoreInitial` so the steady-state delivery contract sees
    // only post-attach changes, not an `add` storm for the existing tree. Only
    // the three load-bearing change kinds reach the runtime handler; chokidar's
    // `addDir`/`unlinkDir`/`ready`/`raw` events are never wired, so they are
    // filtered out by construction.
    const watcher = chokidarWatch([...roots], { ignoreInitial: true });
    watcher.on("add", (path) => handler({ kind: "add", path }));
    watcher.on("change", (path) => handler({ kind: "change", path }));
    watcher.on("unlink", (path) => handler({ kind: "unlink", path }));
    // The terminal-signal channel: a chokidar `error` leaves the watched roots
    // no longer delivering events, so the adapter conveys that stopped-delivering
    // observation over `onTerminate` — distinct from the three change kinds. The
    // transient-toast-vs-terminal-note recovery posture is layered on top by the
    // PIC-55 watcher-lifecycle owner; the seam only conveys the raw terminal
    // observation.
    watcher.on("error", () => onTerminate?.({ roots }));

    let active = true;
    return () => {
      // Idempotent teardown: the first call closes the underlying watcher; a
      // second call is a no-op. `close()` resolves asynchronously and is not
      // awaited here because `Unsubscribe` is synchronous.
      if (!active) return;
      active = false;
      void watcher.close();
    };
  }
}
