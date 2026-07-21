// RED offline suite for the teardown-lifecycle fix (Option 1), written BEFORE
// the implementation exists. These tests MUST fail red on their own primary
// assertions against current code — the teardown-aware `ReloadDebouncer`
// (torn-down state + `whenIdle()`) and the `session_shutdown` sub-step-4
// quiesce await are ABSENT. Every red here is an assertion failure reflecting
// the missing feature, not a collection/compile error.
//
// Spec:
//   pi-integration-contract/session-shutdown-semantics.md
//     — PIC-57 ("No watcher-driven rebuild against an invalidated runtime"): a
//       teardown/cancel marks the hot-reload debouncer torn-down so no *new*
//       rebuild starts and any PIC-49-deferred re-arm is cleared, and any
//       already-in-flight rebuild is awaited (or no-ops) before the handler
//       returns and Pi invalidates the runtime;
//     — sub-step 4: after closing watchers + cancelling the pending debounce
//       timer, mark the debouncer torn-down AND `await debouncer.whenIdle(...)`,
//       BOUNDED BY the same absolute `deadline = Clock.now() +
//       SHUTDOWN_AWAIT_CAP_MS` sub-step 3 captured at handler entry (degrade-to-
//       skip if it already elapsed); a throw from the quiesce-await emits
//       exactly one `theta/host/session-shutdown-teardown-step-failed`
//       (severity warning, phase runtime) with `details.step: 4`,
//       `details.call: "debouncer.whenIdle(awaitCap)"`, and must not prevent
//       sub-step 5.
//
// Timing is deterministic through the injected `Clock` seam via the shared
// `FakeClock` test double (V8d) — never real timers/sleeps. The harness,
// fakes, and assertion conventions mirror `tests/reload-debounce.test.ts`
// (V10d-T) and `tests/session-shutdown.test.ts` (V9g-T).
//
// Because `ReloadDebouncer.whenIdle` / `.markTornDown` and the sub-step-4
// `debouncer` dep do not exist yet, the tests reach them through guarded /
// typed-optional accessors and a widened deps type so the FILE TYPE-CHECKS and
// COLLECTS; the reds land on the guarded-existence assertions or on the
// behavioural assertions, never on `tsc`.

import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "./helpers/fake-clock";
import {
  ReloadDebouncer,
  RELOAD_DEBOUNCE_WINDOW_MS,
  type RebuildOutcome,
} from "../src/extension/reload-debounce";
import {
  runSessionShutdown,
  SHUTDOWN_AWAIT_CAP_MS,
  TEARDOWN_STEP_FAILED_CODE,
  type ClosableWatcher,
  type EmissionSink,
  type ForwardingSignalSource,
  type SessionShutdownDeps,
  type SessionShutdownEventLike,
} from "../src/extension/session-shutdown";
import {
  ActiveInvocationRegistry,
  type ActiveInvocationEntry,
} from "../src/runtime/active-invocation-registry";
import { ThetaRegistry } from "../src/extension/reload-wiring";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// ---------------------------------------------------------------------------
// Shared helpers (mirrors reload-debounce.test.ts / session-shutdown.test.ts)
// ---------------------------------------------------------------------------

/** Flush the microtask queue so in-flight promises settle. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

/**
 * A `rebuild` whose completion is caller-controlled (the V10d-T pattern): each
 * call parks a resolver so a rebuild can be held "in flight" and released
 * deterministically.
 */
function controllableRebuild(): {
  rebuild: ReturnType<typeof vi.fn>;
  settle: (outcome: RebuildOutcome) => void;
} {
  const resolvers: Array<(o: RebuildOutcome) => void> = [];
  let settled = 0;
  const rebuild = vi.fn(
    () =>
      new Promise<RebuildOutcome>((resolve) => {
        resolvers.push((o) => {
          settled++;
          resolve(o);
        });
      }),
  );
  return {
    rebuild,
    settle: (outcome) => {
      const next = resolvers[settled];
      if (next === undefined) {
        throw new Error("no in-flight rebuild to settle");
      }
      next(outcome);
    },
  };
}

// --- guarded / typed-optional accessors for the not-yet-implemented surface --

/**
 * The teardown-aware surface PIC-57 requires `ReloadDebouncer` to grow. Both
 * members are typed-optional so this file TYPE-CHECKS while the implementation
 * is absent; the guarded accessors below assert their existence at runtime, so
 * the reds are assertion failures (feature-absent), not `tsc` errors.
 */
interface TeardownAwareSurface {
  markTornDown?: () => void;
  whenIdle?: () => Promise<void>;
}

function requireWhenIdle(d: ReloadDebouncer): () => Promise<void> {
  const surface = d as unknown as TeardownAwareSurface;
  expect(
    typeof surface.whenIdle,
    "PIC-57: ReloadDebouncer.whenIdle() must exist (feature absent → RED)",
  ).toBe("function");
  return (surface.whenIdle as () => Promise<void>).bind(d);
}

function requireMarkTornDown(d: ReloadDebouncer): () => void {
  const surface = d as unknown as TeardownAwareSurface;
  expect(
    typeof surface.markTornDown,
    "PIC-57: ReloadDebouncer.markTornDown() must exist (feature absent → RED)",
  ).toBe("function");
  return (surface.markTornDown as () => void).bind(d);
}

// ===========================================================================
// ReloadDebouncer (unit) — torn-down state + whenIdle (PIC-57)
// ===========================================================================

describe("PIC-57 — ReloadDebouncer torn-down state (unit)", () => {
  it("PIC-57: a torn-down debouncer does not start a rebuild on a subsequent watcher trigger (early-return in #startRebuild)", async () => {
    const clock = new FakeClock();
    const rebuild = vi.fn(async (): Promise<RebuildOutcome> => "published");
    const debouncer = new ReloadDebouncer({ clock, rebuild });
    const markTornDown = requireMarkTornDown(debouncer);

    markTornDown();

    // A fresh watcher event after teardown: the debounce window closes but the
    // torn-down flag must make `#startRebuild`/`runReload` early-return.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();

    expect(
      rebuild,
      "PIC-57: no new rebuild may start once torn-down",
    ).toHaveBeenCalledTimes(0);
  });

  it("PIC-57: markTornDown clears an already-pending debounce timer so it never fires a rebuild", async () => {
    const clock = new FakeClock();
    const rebuild = vi.fn(async (): Promise<RebuildOutcome> => "published");
    const debouncer = new ReloadDebouncer({ clock, rebuild });
    const markTornDown = requireMarkTornDown(debouncer);

    // Arm a pending debounce timer (deadline 250 ms out), then tear down BEFORE
    // it fires: the pending timer must be cleared (existing cancel behaviour).
    debouncer.onWatcherEvent();
    markTornDown();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 2);
    await flush();

    expect(
      rebuild,
      "PIC-57: torn-down clears the pending debounce timer",
    ).toHaveBeenCalledTimes(0);
  });

  it("PIC-57: markTornDown clears a #deferred re-arm so a deferred rebuild does not run after the in-flight one settles", async () => {
    const clock = new FakeClock();
    const { rebuild, settle } = controllableRebuild();
    const debouncer = new ReloadDebouncer({ clock, rebuild });
    const markTornDown = requireMarkTornDown(debouncer);

    // Window 1 → rebuild #1 in flight.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);

    // Window 2 closes WHILE rebuild #1 is in flight → a PIC-49 deferred re-arm
    // is queued (not started concurrently).
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);

    // Tear down: the torn-down flag must clear the deferred re-arm.
    markTornDown();

    // Settle the in-flight rebuild. Without torn-down `#onRebuildSettled` would
    // start the deferred rebuild (#2); with torn-down the re-arm is dropped.
    settle("published");
    await flush();

    expect(
      rebuild,
      "PIC-57: torn-down must clear the #deferred re-arm (no deferred rebuild after settle)",
    ).toHaveBeenCalledTimes(1);
  });
});

describe("PIC-57 — ReloadDebouncer.whenIdle (unit)", () => {
  it("PIC-57: whenIdle() resolves immediately when no rebuild is in flight", async () => {
    const clock = new FakeClock();
    const rebuild = vi.fn(async (): Promise<RebuildOutcome> => "published");
    const debouncer = new ReloadDebouncer({ clock, rebuild });
    const whenIdle = requireWhenIdle(debouncer);

    let resolved = false;
    void whenIdle().then(() => {
      resolved = true;
    });
    await flush();

    expect(
      resolved,
      "PIC-57: whenIdle resolves immediately when idle",
    ).toBe(true);
  });

  it("PIC-57: whenIdle() resolves only AFTER an in-flight rebuild settles", async () => {
    const clock = new FakeClock();
    const { rebuild, settle } = controllableRebuild();
    const debouncer = new ReloadDebouncer({ clock, rebuild });
    const whenIdle = requireWhenIdle(debouncer);

    // Drive one rebuild in flight.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);

    let resolved = false;
    void whenIdle().then(() => {
      resolved = true;
    });
    await flush();

    // Still pending: a rebuild is in flight.
    expect(
      resolved,
      "PIC-57: whenIdle must not resolve while a rebuild is in flight",
    ).toBe(false);

    // Settle the in-flight rebuild → whenIdle resolves.
    settle("published");
    await flush();
    expect(
      resolved,
      "PIC-57: whenIdle resolves once the in-flight rebuild settles",
    ).toBe(true);
  });
});

// ===========================================================================
// session_shutdown sub-step 4 — mark torn-down + bounded whenIdle quiesce
// ===========================================================================

/**
 * The teardown-aware debouncer dependency sub-step 4 requires. Declared here as
 * the interface the implementation must satisfy so this file type-checks while
 * `SessionShutdownDeps` does not yet carry a `debouncer` field. `whenIdle`
 * accepts the shared-deadline bound (spec `details.call: "debouncer.whenIdle(awaitCap)"`).
 */
interface TeardownAwareDebouncerDep {
  markTornDown(): void;
  whenIdle(awaitCapMs?: number): Promise<void>;
}

/** Widened deps carrying the not-yet-declared `debouncer` sub-step 4 reads. */
interface DebouncerQuiesceDeps extends SessionShutdownDeps {
  readonly debouncer?: TeardownAwareDebouncerDep;
}

interface ControllableEntry {
  readonly entry: ActiveInvocationEntry;
  settle(): void;
}

function makeEntry(
  theta: string,
  invocationId: string,
  options: { settleable?: boolean } = {},
): ControllableEntry {
  let settle: () => void = (): void => {};
  const disposeBarrier =
    options.settleable === true
      ? new Promise<void>((resolve) => {
          settle = resolve;
        })
      : new Promise<void>(() => {}); // never settles → sub-step 3 bounded await
  const entry: ActiveInvocationEntry = {
    thetaAbort: new AbortController(),
    disposeBarrier,
    shutdownReason: undefined,
    theta,
    invocationId,
  };
  return { entry, settle };
}

function watcherSpy(): ClosableWatcher & { close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn() };
}

function signalSpy(
  label: ForwardingSignalSource["label"],
): ForwardingSignalSource & { removeEventListener: ReturnType<typeof vi.fn> } {
  return { label, removeEventListener: vi.fn() };
}

function sinkSpy(): EmissionSink & {
  emit: ReturnType<typeof vi.fn>;
  serialise: ReturnType<typeof vi.fn>;
} {
  return {
    emit: vi.fn((line: unknown) => {
      void line;
    }),
    serialise: vi.fn((diagnostic: Diagnostic) => JSON.stringify(diagnostic)),
  };
}

interface Harness {
  readonly deps: SessionShutdownDeps;
  readonly clock: FakeClock;
  readonly forwardingSignals: readonly ReturnType<typeof signalSpy>[];
  readonly sink: ReturnType<typeof sinkSpy>;
}

function makeHarness(
  overrides: { entries?: readonly ControllableEntry[]; clock?: FakeClock } = {},
): Harness {
  const registry = new ThetaRegistry();
  const activeInvocations = new ActiveInvocationRegistry();
  for (const { entry } of overrides.entries ?? []) {
    activeInvocations.add(entry);
  }
  const clock = overrides.clock ?? new FakeClock();
  const forwardingSignals = [
    signalSpy("ctx.signal.removeEventListener"),
    signalSpy("toolSignal.removeEventListener"),
    signalSpy("parentInvokeSignal.removeEventListener"),
  ];
  const sink = sinkSpy();
  const deps: SessionShutdownDeps = {
    registry,
    activeInvocations,
    clock,
    discoveryWatcher: watcherSpy(),
    settingsWatcher: watcherSpy(),
    debounceHandle: clock.setTimeout(() => {}, 250),
    forwardingSignals,
    inventory: undefined,
    sink,
  };
  return { deps, clock, forwardingSignals, sink };
}

const eventWith = (reason: unknown): SessionShutdownEventLike => ({ reason });

function fakeDebouncerDep(
  whenIdleImpl: () => Promise<void>,
): TeardownAwareDebouncerDep & {
  markTornDown: ReturnType<typeof vi.fn>;
  whenIdle: ReturnType<typeof vi.fn>;
} {
  return {
    markTornDown: vi.fn(),
    whenIdle: vi.fn(whenIdleImpl),
  };
}

describe("PIC-57 sub-step 4 — mark torn-down + bounded whenIdle quiesce", () => {
  it("PIC-57 sub-step 4: marks the debouncer torn-down and awaits whenIdle before the handler resolves (ordering)", async () => {
    let releaseWhenIdle: () => void = (): void => {};
    const whenIdleGate = new Promise<void>((resolve) => {
      releaseWhenIdle = resolve;
    });
    const order: string[] = [];
    const debouncer = {
      markTornDown: vi.fn(() => {
        order.push("markTornDown");
      }),
      whenIdle: vi.fn(() => {
        order.push("whenIdle");
        return whenIdleGate;
      }),
    };
    const harness = makeHarness();
    const deps: DebouncerQuiesceDeps = { ...harness.deps, debouncer };

    let resolved = false;
    const done = runSessionShutdown(eventWith("reload"), deps).then(() => {
      resolved = true;
    });
    await flush();

    // The quiesce await ran: torn-down marked, then whenIdle awaited.
    expect(
      debouncer.whenIdle,
      "PIC-57 sub-step 4: must await debouncer.whenIdle(...)",
    ).toHaveBeenCalledTimes(1);
    expect(order).toStrictEqual(["markTornDown", "whenIdle"]);

    // The handler is still pending on the un-resolved whenIdle — i.e. whenIdle
    // is awaited WITHIN the handler, before it resolves and Pi invalidates.
    expect(
      resolved,
      "PIC-57 sub-step 4: handler must not resolve until whenIdle settles",
    ).toBe(false);

    releaseWhenIdle();
    await flush();
    await done;
    expect(resolved).toBe(true);
  });

  it("PIC-57 sub-step 4: SKIPS the quiesce await when sub-step 3 already consumed the shared SHUTDOWN_AWAIT_CAP_MS deadline (degrade-to-skip, no unbounded wait)", async () => {
    // Two never-settling in-flight invocations force sub-step 3 to burn the
    // whole shared absolute deadline; by the time sub-step 4 is reached the
    // deadline has elapsed, so the quiesce await must be skipped — NOT given a
    // fresh budget. `whenIdle` returns a never-resolving promise so an
    // erroneous post-deadline await would hang (caught as a failure).
    const a = makeEntry("plan", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const b = makeEntry("review", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    const neverIdle = new Promise<void>(() => {});
    const debouncer = fakeDebouncerDep(() => neverIdle);
    const harness = makeHarness({ entries: [a, b] });
    const deps: DebouncerQuiesceDeps = { ...harness.deps, debouncer };

    const done = runSessionShutdown(eventWith("reload"), deps);
    // Fire sub-step 3's cap so the shared absolute deadline is exhausted.
    harness.clock.advance(SHUTDOWN_AWAIT_CAP_MS + 3);

    await expect(
      done,
      "PIC-57 degrade-to-skip: no unbounded wait past the shared deadline",
    ).resolves.toBeUndefined();

    // Torn-down still marked (cheap sync act), but the quiesce await was skipped.
    expect(
      debouncer.markTornDown,
      "PIC-57 degrade-to-skip: torn-down still marked",
    ).toHaveBeenCalledTimes(1);
    expect(
      debouncer.whenIdle,
      "PIC-57 degrade-to-skip: quiesce await skipped once the shared deadline elapsed",
    ).not.toHaveBeenCalled();
  });

  it("PIC-57 sub-step 4: an in-flight rebuild started before teardown never runs post-invalidate — the handler does not return while a rebuild is in flight (REGRESSION)", async () => {
    // Regression for the bug: a debounced rebuild resuming after runtime
    // invalidation would drive re-registration/emit through a stale `pi.*`
    // surface. Model "Pi invalidates the runtime" as the handler returning; the
    // fix must await the in-flight rebuild so it completes (or no-ops) BEFORE
    // the handler resolves. If the handler returns while a rebuild is still in
    // flight, that rebuild could run post-invalidate — the defect this catches.
    const clock = new FakeClock();
    const { rebuild, settle } = controllableRebuild();
    const debouncer = new ReloadDebouncer({ clock, rebuild });

    // Put a rebuild in flight BEFORE teardown (window 1 closes).
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);

    // No entries → sub-step 3 resolves without a clock advance, so the shared
    // deadline is NOT exhausted and sub-step 4 performs the real quiesce await.
    const harness = makeHarness({ clock });
    const deps: DebouncerQuiesceDeps = {
      ...harness.deps,
      debouncer: debouncer as unknown as TeardownAwareDebouncerDep,
    };

    let handlerResolved = false;
    const done = runSessionShutdown(eventWith("reload"), deps).then(() => {
      handlerResolved = true;
    });
    await flush();

    // The rebuild is still in flight (not yet settled). The handler MUST NOT
    // have returned — the fix awaits the in-flight rebuild's quiesce.
    expect(
      handlerResolved,
      "PIC-57 regression: handler must not return while a watcher rebuild is in flight",
    ).toBe(false);

    // Now the in-flight rebuild completes its single publish — during the
    // handler's quiesce await, while the ctx is still active.
    settle("published");
    await flush();
    await done;
    expect(handlerResolved).toBe(true);
  });

  it("PIC-57 sub-step 4: a throw from the quiesce-await emits exactly one teardown-step-failed (step 4, call debouncer.whenIdle(awaitCap)) and sub-step 5 still runs (Per-step isolation)", async () => {
    const debouncer = fakeDebouncerDep(async () => {
      throw new Error("whenIdle boom");
    });
    const harness = makeHarness();
    const deps: DebouncerQuiesceDeps = { ...harness.deps, debouncer };

    const done = runSessionShutdown(eventWith("reload"), deps);
    harness.clock.advance(SHUTDOWN_AWAIT_CAP_MS + 3);
    await done;

    const failedEmits = harness.sink.emit.mock.calls.filter(
      (call) =>
        String(call[0]).includes(TEARDOWN_STEP_FAILED_CODE) &&
        String(call[0]).includes("debouncer.whenIdle(awaitCap)"),
    );
    expect(
      failedEmits.length,
      "PIC-57 sub-step 4: exactly one teardown-step-failed for the quiesce-await throw",
    ).toBe(1);
    // The emitted diagnostic carries details.step: 4.
    expect(String(failedEmits[0]?.[0])).toContain('"step":4');

    // Sub-step 5 still ran after the caught quiesce-await throw.
    for (const signal of harness.forwardingSignals) {
      expect(
        signal.removeEventListener,
        "PIC-57 sub-step 4: a quiesce-await throw must not prevent sub-step 5",
      ).toHaveBeenCalledTimes(1);
    }
  });
});
