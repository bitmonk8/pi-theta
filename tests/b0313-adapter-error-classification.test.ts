import { describe, expect, it, vi } from "vitest";
import {
  PiFileWatcher,
  type ChokidarWatchFn,
  type FSWatcherLike,
  type WatchErrorNotifier,
} from "../src/seams/pi-file-watcher";
import type { FileWatchEvent, WatchTermination } from "../src/seams/file-watcher";

// Witness suite for bug 0313 (fixed 0.316.0): `PiFileWatcher` conveys EVERY
// chokidar `error` as the PIC-55 terminal signal, so the continues-delivering
// arm (transient toast via an injected notifier, watcher keeps delivering) is
// unreachable, and post-unsubscribe callbacks are not swallowed.
//
// Spec: pi-integration-contract/registration-steps.md (PIC-55) — the
// operational criterion splitting continues-delivering (toast, survive) from
// stopped-delivering (terminal note); host-interfaces-services.md (PIC-14 the
// `FileWatcher` seam).
//
// These are unit tests: `npm test`, offline, provider-free, deterministic. A
// real chokidar `error` cannot be provoked offline (bug 0313 §Observed at: the
// EPERM/EACCES trigger needs a genuinely locked file), so error-classification
// behaviour is only reachable through the adapter's injectable chokidar entry
// point (`ChokidarWatchFn`), driving a stub `FSWatcherLike` whose `error` event
// the test fires synchronously. Every assertion is on the SUT effect (notifier
// vs. `onTerminate` routing, post-unsub swallow), not on a harness throw. All
// injection points are synchronous, so no timers, sleeps, or awaited waits are
// used.

/**
 * A minimal `FSWatcherLike` stub recording every `on` listener and replaying it
 * through `fire`. `close()` resolves without detaching listeners — modelling
 * production, where `PiFileWatcher`'s unsubscribe fire-and-forgets the async
 * `watcher.close()` and chokidar's error listener stays attached for the
 * synchronous remainder of a burst (bug 0313 §Affected, `unsubscribe`).
 */
interface StubFSWatcher extends FSWatcherLike {
  fire(event: string, arg?: unknown): void;
  closed: boolean;
}

function stubWatcher(): StubFSWatcher {
  const listeners = new Map<string, Array<(arg?: unknown) => void>>();
  const stub: StubFSWatcher = {
    closed: false,
    on(event, listener) {
      const forEvent = listeners.get(event) ?? [];
      forEvent.push(listener);
      listeners.set(event, forEvent);
      return stub;
    },
    close() {
      // Deliberately does not clear `listeners`: production's async close leaves
      // the error listener live across the burst window this suite exercises.
      stub.closed = true;
      return Promise.resolve();
    },
    fire(event, arg) {
      for (const listener of listeners.get(event) ?? []) {
        listener(arg);
      }
    },
  };
  return stub;
}

// ---------------------------------------------------------------------------
// (A) continues-delivering EPERM/EACCES → transient toast, never onTerminate.
// ---------------------------------------------------------------------------

describe("b0313 (A) — continues-delivering per-path errors surface as a toast, not the terminal signal", () => {
  it.each(["EPERM", "EACCES"])(
    "PIC-55: a chokidar error with code %s notifies the injected sink exactly once, never fires onTerminate, and the watcher keeps delivering (bug 0313, fixed 0.316.0)",
    (code) => {
      const stub = stubWatcher();
      const notify = vi.fn<WatchErrorNotifier["notify"]>();
      const watch: ChokidarWatchFn = () => stub;
      const fw = new PiFileWatcher({ watch, notifier: { notify } });

      const changes: FileWatchEvent[] = [];
      const terminations: WatchTermination[] = [];
      fw.watch(
        ["/root"],
        (event) => changes.push(event),
        (termination) => terminations.push(termination),
      );

      // Deterministic offline injection of a per-path permission error.
      stub.fire("error", { code, message: `${code}: locked file` });

      // Continues-delivering → the injected notifier is the sink, exactly once,
      // and the terminal-signal channel is NOT taken.
      expect(notify).toHaveBeenCalledTimes(1);
      expect(terminations).toEqual([]);

      // Constraint 5 (fixed 0.316.0): the toast text must carry no
      // `theta/parse|load|runtime/*` diagnostic code — that vocabulary is
      // reserved for the persistent channel (diagnostic-shape.md#transient-toasts).
      expect(notify.mock.calls[0]?.[0]).not.toMatch(/theta\/(parse|load|runtime)\//);

      // The criterion that MAKES this the continues-delivering case: the watcher
      // keeps delivering change events after the error.
      stub.fire("add", "/root/added.theta");
      expect(changes).toEqual([{ kind: "add", path: "/root/added.theta" }]);
    },
  );
});

// ---------------------------------------------------------------------------
// (B) watcher-fatal error → terminal signal exactly as today (regression lock).
// ---------------------------------------------------------------------------

describe("b0313 (B) — a watcher-fatal error still takes the terminal signal", () => {
  it.each<[string, unknown]>([
    ["a code-less Error", new Error("fatal watcher error")],
    ["ENOSPC", { code: "ENOSPC" }],
  ])(
    "a fatal error (%s) fires onTerminate exactly as today and never the toast sink (bug 0313, fixed 0.316.0)",
    (_label, payload) => {
      const stub = stubWatcher();
      const notify = vi.fn<WatchErrorNotifier["notify"]>();
      const fw = new PiFileWatcher({ watch: () => stub, notifier: { notify } });

      const terminations: WatchTermination[] = [];
      fw.watch(["/root"], () => {}, (termination) => terminations.push(termination));

      stub.fire("error", payload);

      // Locks the PRESERVED terminal path: the pre-fix wire already routed a
      // genuinely stopped-delivering error to `onTerminate` for these inputs,
      // and the fix (fixed 0.316.0) leaves that terminal behaviour unchanged.
      expect(terminations).toEqual([{ roots: ["/root"] }]);
      expect(notify).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// (D) post-unsubscribe callbacks are swallowed by a per-watch active-guard.
// ---------------------------------------------------------------------------

describe("b0313 (D) — post-unsubscribe adapter callbacks are swallowed", () => {
  it("an error fired after unsubscribe reaches neither onTerminate nor the notifier (bug 0313, fixed 0.316.0)", () => {
    const stub = stubWatcher();
    const notify = vi.fn<WatchErrorNotifier["notify"]>();
    const fw = new PiFileWatcher({ watch: () => stub, notifier: { notify } });

    const terminations: WatchTermination[] = [];
    const unsub = fw.watch(["/root"], () => {}, (t) => terminations.push(t));

    unsub();
    // The stub keeps its error listener across close() (production's async
    // teardown leaves it attached). The per-watch active-guard must swallow this
    // callback rather than re-enter after teardown.
    stub.fire("error", { code: "ENOSPC" });

    expect(terminations).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("each watch() owns its own active flag: unsubscribing the first arming leaves a concurrent second arming untouched — the mechanism hot-reload.ts's bug 0312 re-arm relies on (bug 0313, fixed 0.316.0)", () => {
    // hot-reload.ts's `installHotReload` re-arms the ONE watcher by unsubbing the
    // first arming and calling `watch()` again on the same seam; that is safe
    // only if each `watch()` owns an independent active flag, so a post-unsub
    // callback on the retired arming cannot leak into the live one.
    const stub1 = stubWatcher();
    const stub2 = stubWatcher();
    let call = 0;
    const watch: ChokidarWatchFn = () => (call++ === 0 ? stub1 : stub2);
    const fw = new PiFileWatcher({ watch });

    const terms1: WatchTermination[] = [];
    const terms2: WatchTermination[] = [];
    const changes2: FileWatchEvent[] = [];
    const unsub1 = fw.watch(["/root1"], () => {}, (t) => terms1.push(t));
    fw.watch(["/root2"], (event) => changes2.push(event), (t) => terms2.push(t));

    unsub1();
    // The retired first arming must swallow its post-unsub error...
    stub1.fire("error", { code: "EPERM" });
    expect(terms1).toEqual([]);

    // ...while the second, independent arming keeps delivering, unaffected.
    stub2.fire("add", "/root2/added.theta");
    expect(changes2).toEqual([{ kind: "add", path: "/root2/added.theta" }]);
    expect(terms2).toEqual([]);
  });
});
