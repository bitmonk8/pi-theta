import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReloadDebouncer,
  RELOAD_DEBOUNCE_WINDOW_MS,
  type RebuildOutcome,
} from "../src/extension/reload-debounce";
import { FakeClock } from "./helpers/fake-clock";

// V10d-T — reload debounce and cross-window rebuild serialization (tests).
// These tests are written against the seam the paired V10d implementation leaf
// fills in; they MUST fail red for the intended reason (the drop-and-reschedule
// debounce and the PIC-49 serialization guard are absent — `onWatcherEvent` is
// a no-op stub — so no reload ever fires and each assertion reds on its own
// primary expectation, not on a compile error or harness throw).
//
// Time is driven deterministically through the injected `Clock` seam via the
// `FakeClock` test double (V8d): `Clock.setTimeout` / `Clock.clearTimeout` back
// the debounce, and `FakeClock.advance(ms)` crosses the window boundary.

/** Flush the microtask queue so an in-flight rebuild's promise settles. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Reload-debounce code-keyed area (`cka-36`,
// package-and-settings.md §Caching and reload): drop-and-reschedule coalescing
// measured through the injected `Clock` / `FakeClock` seam.
// ---------------------------------------------------------------------------

describe("V10d-T — reload debounce (cka-36, package-and-settings.md §Caching and reload)", () => {
  it("cka-36: a burst of N watcher events within one 250 ms window produces exactly one reload (drop-and-reschedule coalescing, not per-event firing)", async () => {
    const clock = new FakeClock();
    const rebuild = vi.fn(async (): Promise<RebuildOutcome> => "published");
    const debouncer = new ReloadDebouncer({ clock, rebuild });

    // A burst of N events, each 50 ms after the previous — every gap is < the
    // 250 ms window, so each fresh event clears the pending handle and
    // reschedules; no pending timer ever reaches its deadline mid-burst.
    const N = 5;
    for (let i = 0; i < N; i++) {
      debouncer.onWatcherEvent();
      clock.advance(50);
    }

    // Mid-burst: the last event's timer (armed at t=200, deadline t=450) is
    // still pending at t=250, so no reload has fired yet.
    expect(rebuild).toHaveBeenCalledTimes(0);

    // Cross the window boundary following the LAST event.
    clock.advance(250);
    await flush();

    // Exactly one reload — the burst coalesced. Per-event firing (the
    // behaviour this test distinguishes against) would have produced N reloads.
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(rebuild).not.toHaveBeenCalledTimes(N);
  });

  it("cka-36: a further watcher event after virtual time crosses the window boundary produces a second reload", async () => {
    const clock = new FakeClock();
    const rebuild = vi.fn(async (): Promise<RebuildOutcome> => "published");
    const debouncer = new ReloadDebouncer({ clock, rebuild });

    // Window 1: one event, cross the boundary — one reload fires, then settles.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);

    // A fresh event after the window boundary is a new debounce cycle: crossing
    // the boundary again produces a second, distinct reload.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(2);
  });

  it("cka-36: the reload fires only once the window closes — not one tick short, exactly once on crossing", async () => {
    const clock = new FakeClock();
    const rebuild = vi.fn(async (): Promise<RebuildOutcome> => "published");
    const debouncer = new ReloadDebouncer({ clock, rebuild });

    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS - 1); // one tick short of the window
    await flush();
    // The window has not closed yet, so no reload has fired.
    expect(rebuild).toHaveBeenCalledTimes(0);

    // Advancing the final tick crosses the boundary and fires exactly one
    // reload. This assertion reds while the debounce is absent (the stub never
    // fires), so the test is red for the intended reason rather than a false
    // green off the pre-boundary check alone.
    clock.advance(1);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// PIC-49 — cross-window rebuild serialization (registration-steps.md#pic-49):
// a debounce timer firing while a prior window's rebuild is still in flight
// defers rather than starting a concurrent rebuild; the in-flight guard
// releases on the in-flight rebuild's synchronous publish or its
// `theta/runtime/registry-swap-failed` discard.
// ---------------------------------------------------------------------------

describe("V10d-T — cross-window rebuild serialization (PIC-49)", () => {
  // A `rebuild` whose completion is caller-controlled: each call parks a
  // resolver so the test can hold the rebuild "in flight" across a later
  // debounce window and then release it deterministically.
  function controllableRebuild(): {
    rebuild: ReturnType<typeof vi.fn>;
    settle: (outcome: RebuildOutcome) => void;
    inFlightCount: () => number;
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
      inFlightCount: () => rebuild.mock.calls.length - settled,
    };
  }

  it("PIC-49: a debounce timer firing while a prior rebuild is in flight defers rather than starting a concurrent rebuild; the guard releases on the in-flight rebuild's synchronous publish", async () => {
    const clock = new FakeClock();
    const { rebuild, settle } = controllableRebuild();
    const debouncer = new ReloadDebouncer({ clock, rebuild });

    // Window 1 closes → rebuild #1 starts and is now awaiting its async steps.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);

    // Window 2 closes WHILE rebuild #1 is still in flight (unsettled). PIC-49:
    // it MUST NOT start a concurrent rebuild — rebuild is still called once.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);

    // Release the in-flight guard on rebuild #1's single synchronous publish.
    settle("published");
    await flush();

    // The deferred rebuild now runs against the now-current live state.
    expect(rebuild).toHaveBeenCalledTimes(2);
  });

  it("PIC-49: the in-flight guard also releases on the in-flight rebuild's theta/runtime/registry-swap-failed discard, then runs the deferred rebuild", async () => {
    const clock = new FakeClock();
    const { rebuild, settle } = controllableRebuild();
    const debouncer = new ReloadDebouncer({ clock, rebuild });

    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);

    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1); // deferred, not concurrent

    // Release on the `theta/runtime/registry-swap-failed` discard outcome.
    settle("discarded");
    await flush();

    // The guard released on the discard just as it does on publish: the
    // deferred rebuild runs against the (unchanged) live state.
    expect(rebuild).toHaveBeenCalledTimes(2);
  });

  it("PIC-49: multiple debounce windows closing during one in-flight rebuild collapse to a single deferred rebuild (at most one rebuild runs at a time)", async () => {
    const clock = new FakeClock();
    const { rebuild, settle } = controllableRebuild();
    const debouncer = new ReloadDebouncer({ clock, rebuild });

    // Window 1 → rebuild #1 in flight.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);

    // Two further windows close while rebuild #1 is still in flight — both are
    // deferred against the single in-flight guard, not started concurrently.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(1);

    // Releasing rebuild #1 runs exactly one deferred rebuild for the collapsed
    // windows — not one per deferred window.
    settle("published");
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Bug 0018 review follow-up — a rebuild rejection is not a silent sink.
// ---------------------------------------------------------------------------

describe("rebuild-rejection sink — the dropped reason is logged (greppable)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a rebuild rejection logs one 'theta hot-reload rebuild rejected:' line carrying the reason and still releases the PIC-49 guard", async () => {
    // The designed reload outcomes (publish / ERR-7 discard / PIC-67 stale
    // quiesce) all RESOLVE; a rejection reaching the debouncer is an
    // unrecognised throw runReload deliberately rethrew (hot-reload.ts
    // inspect-and-rethrow arms). The rejection arm is that throw's only sink,
    // so it must surface the reason instead of discarding it.
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((): void => {});
    const clock = new FakeClock();
    const boom = new Error("unrecognised rebuild defect");
    let callCount = 0;
    const rebuild = vi.fn(async (): Promise<RebuildOutcome> => {
      callCount++;
      if (callCount === 1) {
        throw boom;
      }
      return "published";
    });
    const debouncer = new ReloadDebouncer({ clock, rebuild });

    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();

    // The reason is logged, not discarded.
    expect(errorSpy).toHaveBeenCalledWith(
      "theta hot-reload rebuild rejected:",
      boom,
    );

    // The PIC-49 guard released on the rejection: a later window runs.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(2);
  });

  it("the PIC-49 guard release survives a throwing console.error: whenIdle() resolves and a later window still runs (the last-resort sink is defended)", async () => {
    // The repo's defended-sink invariant family (PIC-24/PIC-27/PIC-54): the
    // last-resort console.error can itself throw (closed stdio, fd
    // exhaustion, a console-proxying host). The rejection arm must swallow
    // that throw and still release the PIC-49 guard — an unwrapped sink would
    // skip the release, leaving whenIdle() waiters hung and every later
    // debounce window deferred against a never-released guard.
    vi.spyOn(console, "error").mockImplementation((): void => {
      throw new Error("stderr closed");
    });
    const clock = new FakeClock();
    let callCount = 0;
    const rebuild = vi.fn(async (): Promise<RebuildOutcome> => {
      callCount++;
      if (callCount === 1) {
        throw new Error("unrecognised rebuild defect");
      }
      return "published";
    });
    const debouncer = new ReloadDebouncer({ clock, rebuild });

    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();

    // Guard released despite the throwing sink: whenIdle() resolves ahead of
    // a full microtask-queue drain (a stuck guard parks the waiter forever,
    // so the race deterministically yields "hung" rather than timing out).
    await expect(
      Promise.race([
        debouncer.whenIdle().then(() => "idle"),
        flush().then(() => "hung"),
      ]),
    ).resolves.toBe("idle");

    // ... and a later window starts a fresh rebuild rather than deferring
    // against a never-released guard.
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();
    expect(rebuild).toHaveBeenCalledTimes(2);
  });
});
