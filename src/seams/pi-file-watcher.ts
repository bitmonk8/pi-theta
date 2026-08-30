// V8e — `PiFileWatcher` production adapter for the `FileWatcher` seam (PIC-14).
//
// Production wiring uses a chokidar watcher: `watch(roots, handler, onTerminate?)`
// attaches one handler over the supplied roots, filters chokidar's events down to
// the three load-bearing change kinds (`add`/`change`/`unlink`), and classifies a
// chokidar `error` per PIC-55's two-case posture rather than treating every error
// as terminal (bug 0313, fixed 0.316.0). A per-path `EPERM`/`EACCES` error is
// *continues-delivering*: the watcher keeps emitting on the other watched roots,
// so the adapter itself fires the transient informational toast (via the injected
// `WatchErrorNotifier`, diagnostic-shape.md#transient-toasts) and takes no further
// action — the toast is NOT conveyed over the `FileWatcher` seam (PIC-14's
// terminal-signal channel stays reserved for the stopped-delivering case), so
// this adapter is the only call site that can fire it. Every other error is
// *stopped-delivering — terminal* and still reaches `onTerminate` exactly as
// before. The returned `Unsubscribe` tears down the underlying watcher and is
// idempotent; a per-`watch()` active-guard also swallows any adapter callback
// (add/change/unlink/error) that chokidar fires after unsubscribe, since
// `close()` resolves asynchronously and the listeners stay attached for the
// synchronous remainder of an in-flight burst.
//
// Spec: host-interfaces-services.md PIC-14, registration-steps.md PIC-55,
// diagnostics/diagnostic-shape.md#transient-toasts.

import { watch as chokidarWatch } from "chokidar";
import type {
  FileWatcher,
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
} from "./file-watcher";

// Bug 0313 (fixed 0.316.0): the minimal structural shape the adapter needs from
// chokidar's `FSWatcher`, extracted so a test can inject a stub. chokidar
// emits no `error` deterministically offline (the EPERM/EACCES/locked-file
// trigger needs a genuinely locked file, which no offline probe can arrange),
// so error-classification behaviour is only reachable in a unit test through an
// injected watcher whose `error` event a test can `fire`. The real
// `FSWatcher` is assignable to this because it carries both members.
export interface FSWatcherLike {
  on(event: string, listener: (arg?: unknown) => void): unknown;
  close(): Promise<void>;
}

/** Bug 0313 (fixed 0.316.0): the chokidar `watch` entry point, injectable for the offline error path above. */
export type ChokidarWatchFn = (
  paths: string[],
  options: { ignoreInitial?: boolean },
) => FSWatcherLike;

/**
 * Bug 0313 (fixed 0.316.0): the injected sink for the PIC-55 continues-delivering
 * (transient-toast) error class. The adapter routes an EPERM/EACCES per-path
 * error here instead of `onTerminate`; production wires `ctx.ui.notify` here
 * (production-composition.ts), tests inject a spy.
 */
export interface WatchErrorNotifier {
  notify(message: string): void;
}

/**
 * Bug 0313 (fixed 0.316.0): the per-path error codes chokidar's own emission
 * sites (`_handleError`, per-path `errHandler`, readdirp scan streams, stat
 * failures) can raise for a locked/permission-denied file WITHOUT the
 * underlying watcher tearing down — routine on Windows (editor swap files, AV
 * scanners) and on any host where one file in a watched root becomes
 * unreadable mid-session. This is a conservative proxy for PIC-55's
 * continues-delivering criterion (chokidar exposes no per-root liveness
 * signal to check the criterion directly): only these two named codes divert
 * to the toast, so every error outside this set — including an unrecognised
 * or code-less error — still takes the terminal path exactly as before the
 * fix. No genuinely-fatal or unknown error is newly silenced.
 */
const CONTINUES_DELIVERING_ERROR_CODES = new Set(["EPERM", "EACCES"]);

/**
 * Bug 0313 (fixed 0.316.0): whether a chokidar `error` payload names a
 * continues-delivering per-path error code. The payload may be a Node `Error`
 * (with a `.code`) or a plain object shaped like one — chokidar's own error
 * sites construct both — so `.code` is read from `unknown` via a structural
 * narrow (`typeof`/`in`) rather than an `instanceof Error` check or a catch.
 */
function isContinuesDeliveringError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return false;
  }
  const { code } = err as { code: unknown };
  return typeof code === "string" && CONTINUES_DELIVERING_ERROR_CODES.has(code);
}

export class PiFileWatcher implements FileWatcher {
  // Bug 0313 (fixed 0.316.0): the chokidar entry point defaults to the real
  // import; a test overrides it to inject a stub watcher whose `error` event it
  // can fire deterministically offline.
  readonly #watch: ChokidarWatchFn;
  // Bug 0313 (fixed 0.316.0): the transient-toast sink for continues-delivering
  // errors, consulted by the classification in `watch()` below.
  readonly #notifier: WatchErrorNotifier | undefined;

  constructor(deps?: { watch?: ChokidarWatchFn; notifier?: WatchErrorNotifier }) {
    this.#watch = deps?.watch ?? chokidarWatch;
    this.#notifier = deps?.notifier;
  }

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
    const watcher = this.#watch([...roots], { ignoreInitial: true });

    // Bug 0313 (fixed 0.316.0): per-`watch()` active-guard. `close()` resolves
    // asynchronously and the listeners below stay attached for the synchronous
    // remainder of an in-flight burst, so every callback checks this flag
    // before doing anything — a post-unsubscribe callback is swallowed rather
    // than re-entering `handler`/`onTerminate`/the notifier. `let`-scoped per
    // call so each `watch()` (e.g. hot-reload.ts's bug 0312 re-arm, which calls
    // `watch()` again on the same seam after unsubscribing the prior arming)
    // owns an independent flag: retiring one arming cannot leak into another.
    let active = true;

    // chokidar delivers the affected path as a string for these three change
    // kinds; the injectable `FSWatcherLike.on` widens the listener arg to
    // `unknown` (bug 0313, fixed 0.316.0) so the seam can also carry the `error`
    // event's non-string payload, so narrow the path back here.
    watcher.on("add", (path) => {
      if (!active) return;
      handler({ kind: "add", path: path as string });
    });
    watcher.on("change", (path) => {
      if (!active) return;
      handler({ kind: "change", path: path as string });
    });
    watcher.on("unlink", (path) => {
      if (!active) return;
      handler({ kind: "unlink", path: path as string });
    });
    // PIC-55 classification (bug 0313, fixed 0.316.0): a continues-delivering
    // per-path error (EPERM/EACCES) fires the injected toast and returns —
    // `onTerminate` is NOT taken, and the watcher keeps delivering on the
    // other roots exactly as chokidar's own emission sites guarantee. Every
    // other error is stopped-delivering — terminal — and still conveys the
    // observation over `onTerminate` exactly as before this fix. The listener
    // itself is NEVER detached (no `removeListener`): chokidar's `error` is a
    // Node reserved event, and removing the sole listener mid-burst would let
    // a same-tick second `error` emit throw instead of reaching this guard.
    watcher.on("error", (err) => {
      if (!active) return;
      if (isContinuesDeliveringError(err)) {
        const code = (err as { code: string }).code;
        try {
          // Plain informational text, deliberately NOT a `theta/parse|load|
          // runtime/*`-coded diagnostic — diagnostic-shape.md#transient-toasts
          // reserves coded diagnostics for the persistent channel, not this
          // toast.
          this.#notifier?.notify(
            `theta: file-watcher permission error (${code}); hot-reload continues`,
          );
        } catch (notifyError: unknown) { // allow-broad-catch: diagnostic-shape.md#transient-toasts
          // The toast surface is the bottom of the stack for this failure
          // class: a synchronous `ctx.ui.notify` throw must not unwind the
          // chokidar `error` callback that invoked it, and no further
          // diagnostic is emitted on the inner throw.
          void notifyError;
        }
        return;
      }
      onTerminate?.({ roots });
    });

    return () => {
      // Idempotent teardown: the first call closes the underlying watcher; a
      // second call is a no-op. `close()` resolves asynchronously and is not
      // awaited here because `Unsubscribe` is synchronous — the active-guard
      // above, not this flag alone, is what swallows the post-close delivery
      // window.
      if (!active) return;
      active = false;
      void watcher.close();
    };
  }
}
