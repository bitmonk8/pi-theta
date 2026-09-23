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

// ---------------------------------------------------------------------------
// Roots-recording FileWatcher fake (PTQ-0236).
//
// tests/b0310-watch-roots-root-union.test.ts and
// tests/b0339-package-source-watch-arming.test.ts each independently
// redeclared this exact quartet (a `FileWatcher` fake whose only job is to
// record each `watch()` call's `roots` argument, plus the helpers that
// normalise a path, poll a bounded condition, and read back the single
// recorded arming). `FakeFileWatcher` above deliberately discards `roots`
// (its job is event delivery, not roots-recording), so it does not already
// cover this shape.
// ---------------------------------------------------------------------------

/** FileWatcher seam fake whose only job is to record each `watch()` root list. */
export class RootsRecordingFileWatcher implements FileWatcher {
  readonly watchCalls: readonly string[][] = [];

  watch(
    roots: readonly string[],
    _handler: (event: FileWatchEvent) => void,
    _onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    (this.watchCalls as string[][]).push([...roots]);
    return () => {};
  }
}

/** Normalise a path for the cross-platform contain check (this repo runs on Windows). */
export function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/** Poll a real-timer-bounded condition; throw loudly on timeout naming the unmet
 *  precondition (b0310's idiom — never an early return or skip). */
export async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}

/** Poll until `fn` yields a defined value; throw LOUDLY on budget exhaustion
 *  naming the unmet precondition (the `waitFor` idiom, for a VALUE-yielding
 *  probe rather than a boolean condition). */
export async function waitForValue<T>(
  fn: () => T | undefined,
  label: string,
  budgetMs = 5000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() - start > budgetMs) {
      throw new Error(`precondition never met within ${budgetMs}ms: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Best-effort bounded poll of a condition, then RETURN (never throw) once the
 *  bound is exhausted, so the caller's own immediately-following `expect` is
 *  the witness rather than a thrown timeout — unlike `waitFor` above. */
export async function settle(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The single root list a `RootsRecordingFileWatcher` was armed over, or a loud
 *  failure naming the unmet precondition. */
export function armedRoots(watcher: RootsRecordingFileWatcher): readonly string[] {
  if (watcher.watchCalls.length === 0) {
    throw new Error(
      "precondition unmet: session_start armed no watcher (watch() was never called)",
    );
  }
  if (watcher.watchCalls.length > 1) {
    throw new Error(
      `precondition unmet: expected exactly one watch() arming, saw ${watcher.watchCalls.length}`,
    );
  }
  // Guarded above (length is exactly 1), but `noUncheckedIndexedAccess` widens
  // the element type, so the loud fallback keeps the return non-optional.
  const only = watcher.watchCalls[0];
  if (only === undefined) {
    throw new Error("precondition unmet: recorded watch() root list was undefined");
  }
  return only;
}

// ---------------------------------------------------------------------------
// Recursive-root-scoping FileWatcher fake (PTQ-0346).
//
// tests/b0312-out-of-root-thetalib-watch-closure.test.ts and
// tests/b0339-package-source-watch-arming.test.ts each independently
// redeclared this exact scoping mechanism (a `FileWatcher` fake that models
// real chokidar recursive-root scoping: `emit(event)` reaches the
// currently-armed handler ONLY IF `event.path` sits under one of the
// currently-armed roots, so an event under an unarmed root is a genuine
// no-op). `RootsRecordingFileWatcher` above records roots but returns a no-op
// unsubscribe and cannot emit, and `FakeFileWatcher` delivers regardless of
// path — neither already covers this shape. b0312's own class additionally
// carries bug-0312-specific members (`onTerminate` plumbing, a
// `liveSubscriptions` count, `terminate()`) outside this shared shape, so it
// keeps declaring its own, larger class locally.
// ---------------------------------------------------------------------------

/** FileWatcher seam fake that models real chokidar recursive-root scoping:
 *  `emit(event)` reaches the currently-armed handler only if `event.path` sits
 *  under one of the currently-armed roots (an out-of-root path is a genuine
 *  no-op). */
export class RecursiveRootFileWatcher implements FileWatcher {
  readonly watchCalls: string[][] = [];
  #handler: ((event: FileWatchEvent) => void) | undefined;
  #roots: readonly string[] = [];

  watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    _onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.watchCalls.push([...roots]);
    this.#handler = handler;
    this.#roots = [...roots];
    return () => {
      // Relinquish only this arming (guarded on handler identity) so a re-arm
      // that installs a fresh handler first is not cleared by a stale unsub.
      if (this.#handler === handler) {
        this.#handler = undefined;
        this.#roots = [];
      }
    };
  }

  /** The roots the watcher is armed over right now (the last `watch()` call's roots). */
  get currentRoots(): readonly string[] {
    return this.#roots;
  }

  /** Deliver an event, honouring recursive-root scoping (an out-of-root path is dropped). */
  emit(event: FileWatchEvent): void {
    if (this.#handler === undefined) {
      return;
    }
    if (this.#underArmedRoot(event.path)) {
      this.#handler(event);
    }
  }

  #underArmedRoot(path: string): boolean {
    const p = norm(path);
    return this.#roots.some((root) => {
      const r = norm(root);
      return p === r || p.startsWith(r.endsWith("/") ? r : `${r}/`);
    });
  }
}

/**
 * A per-compose counting watcher: `watchCalls`/`attached` make the step-5
 * arm/detach lifecycle of ONE compose generation observable (the defect is
 * precisely that the superseded generation's arm has no reachable detach).
 */
export class CountingFakeFileWatcher extends FakeFileWatcher {
  watchCalls = 0;
  attached = false;

  override watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.watchCalls += 1;
    this.attached = true;
    const unsubscribe = super.watch(roots, handler, onTerminate);
    return () => {
      // Idempotent detach observation (FakeFileWatcher's own unsubscribe
      // already tolerates repeats).
      this.attached = false;
      unsubscribe();
    };
  }
}
