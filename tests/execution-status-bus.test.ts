import { describe, expect, it } from "vitest";
import { createExecutionStatusBus } from "../src/extension/execution-status/bus";
import {
  DONE_LINGER_MS,
  MAX_LANE_SET_DEPTH,
  MAX_TRACKED_INVOCATIONS,
  STATUS_TICK_MS,
  type ExecutionStatusBus,
  type ExecutionStatusSnapshot,
  type ParForLaneHooks,
  type ProgressVerbosity,
  type StatusSink,
  type ViewShape,
} from "../src/extension/execution-status/types";
import type { Clock, TimerHandle } from "../src/seams/clock";
import { FakeClock } from "./helpers/fake-clock";
import { ReloadDebouncer, RELOAD_DEBOUNCE_WINDOW_MS, type RebuildOutcome } from "../src/extension/reload-debounce";

// RFC 0010 (execution-status.md EXST-2/3/6/7/9) — `tests/execution-status-bus.test.ts`
// (T-BUS). Behaviour-matrix rows B1-B20 (bus core, coalescing tick, memory
// bounds, lifecycle + lanes). Exercises `createExecutionStatusBus`: producer
// methods fold into the tracked snapshot, `snapshot()` reflects the current
// state, and render ticks are scheduled/cleared through the injected `Clock`.
// Assertions target real observables — a recorded sink call, a populated
// snapshot, a scheduled/cleared timer.

/** A `StatusSink` recording every `render`/`clear` call for assertions. */
function recordingSink(id: "footer" | "widget" = "footer"): StatusSink & {
  readonly renders: Array<{
    snapshot: ExecutionStatusSnapshot;
    view: ViewShape;
    verbosity: ProgressVerbosity;
    nowMs: number;
  }>;
  readonly clears: number[];
} {
  const renders: Array<{
    snapshot: ExecutionStatusSnapshot;
    view: ViewShape;
    verbosity: ProgressVerbosity;
    nowMs: number;
  }> = [];
  const clearTimes: number[] = [];
  return {
    id,
    renders,
    clears: clearTimes,
    render(snapshot, view, verbosity, nowMs): void {
      renders.push({ snapshot, view, verbosity, nowMs });
    },
    clear(): void {
      clearTimes.push(clearTimes.length);
    },
  };
}

/** A source site literal reused across tests (site content is not under test here). */
const SITE = { file: "quality-loop.theta", line: 214, column: 1 } as const;

/**
 * A `Clock` wrapping a `FakeClock` that records every `setTimeout`/
 * `clearTimeout` call — used to assert the EXST-6 drop-and-reschedule
 * mechanics (B4) directly against the injected seam, mirroring
 * `tests/checkpoint-seam.test.ts`'s `RecordingClock` idiom.
 */
class RecordingClock implements Clock {
  readonly setTimeoutCalls: Array<{ ms: number; deadline: number }> = [];
  readonly clearTimeoutCalls: TimerHandle[] = [];
  readonly #inner: FakeClock;

  constructor(inner: FakeClock) {
    this.#inner = inner;
  }

  now(): number {
    return this.#inner.now();
  }

  wallNow(): number {
    return this.#inner.wallNow();
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    this.setTimeoutCalls.push({ ms, deadline: this.#inner.now() + ms });
    return this.#inner.setTimeout(fn, ms);
  }

  clearTimeout(handle: TimerHandle): void {
    this.clearTimeoutCalls.push(handle);
    this.#inner.clearTimeout(handle);
  }

  advance(ms: number): void {
    this.#inner.advance(ms);
  }
}

function makeBus(sinks: StatusSink[], clock: Clock = new FakeClock()): ExecutionStatusBus {
  return createExecutionStatusBus({ clock, sinks });
}

// ---------------------------------------------------------------------------
// A. Bus core — coalescing tick (B1-B11).
// ---------------------------------------------------------------------------

describe("T-BUS — coalescing tick (EXST-6)", () => {
  it("B1: 5 publishes inside one 200 ms window render exactly ONCE, at the window close", () => {
    const clock = new FakeClock();
    const sink = recordingSink();
    const bus = makeBus([sink], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    for (let i = 0; i < 5; i++) {
      bus.checkpointBefore("inv-1", "tool-call", SITE);
      clock.advance(10);
    }
    clock.advance(STATUS_TICK_MS);

    expect(sink.renders).toHaveLength(1);
  });

  it("B2: sustained dirt every 50 ms for 1 s renders at 200 ms cadence — 5 renders, each >= STATUS_TICK_MS apart (no starvation)", () => {
    const clock = new FakeClock();
    const sink = recordingSink();
    const bus = makeBus([sink], clock);
    bus.invocationStarted("inv-1", "quality-loop");

    for (let elapsed = 0; elapsed < 1000; elapsed += 50) {
      bus.checkpointBefore("inv-1", "tool-call", SITE);
      clock.advance(50);
    }

    expect(sink.renders.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < sink.renders.length; i++) {
      const gap = sink.renders[i]!.nowMs - sink.renders[i - 1]!.nowMs;
      expect(gap).toBeGreaterThanOrEqual(STATUS_TICK_MS);
    }
  });

  it("B3: after a render, no further publishes for 10 s produces zero further renders (no-dirty-no-render)", () => {
    const clock = new FakeClock();
    const sink = recordingSink();
    const bus = makeBus([sink], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    clock.advance(STATUS_TICK_MS);
    const countAfterFirstTick = sink.renders.length;
    expect(countAfterFirstTick).toBeGreaterThanOrEqual(1);

    clock.advance(10_000);
    expect(sink.renders).toHaveLength(countAfterFirstTick);
  });

  it("B4: a new publish inside a pending window clears the pending timer and reschedules the SAME absolute deadline (drop-and-reschedule, not extend)", () => {
    const recording = new RecordingClock(new FakeClock());
    const sink = recordingSink();
    const bus = makeBus([sink], recording);

    bus.invocationStarted("inv-1", "quality-loop"); // arms a pending tick at deadline T0+200
    expect(recording.setTimeoutCalls.length).toBeGreaterThanOrEqual(1);
    const firstDeadline = recording.setTimeoutCalls[0]!.deadline;

    recording.advance(50); // still inside the window
    bus.checkpointBefore("inv-1", "tool-call", SITE); // new dirt: clear + reschedule

    expect(recording.clearTimeoutCalls.length).toBeGreaterThanOrEqual(1);
    const lastDeadline = recording.setTimeoutCalls.at(-1)!.deadline;
    // Anchored at the LAST RENDER (none yet), so the deadline is unchanged —
    // not pushed further out by the new publish.
    expect(lastDeadline).toBe(firstDeadline);
  });

  it("B11: a bus and a ReloadDebouncer sharing ONE FakeClock do not perturb the debouncer's own tick-boundary assertions (S6 composition risk)", async () => {
    const clock = new FakeClock();
    const sink = recordingSink();
    const bus = makeBus([sink], clock);
    const rebuild = vi_fn();
    const debouncer = new ReloadDebouncer({ clock, rebuild: rebuild.fn });

    bus.invocationStarted("inv-1", "quality-loop");
    debouncer.onWatcherEvent();
    clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await Promise.resolve();
    await Promise.resolve();

    expect(rebuild.calls).toBe(1);
  });
});

/** A tiny hand-rolled fn spy (avoids pulling `vi` into this module's imports twice). */
function vi_fn(): { fn: () => Promise<RebuildOutcome>; calls: number } {
  const state = { calls: 0 };
  return {
    fn: async (): Promise<RebuildOutcome> => {
      state.calls++;
      return "published";
    },
    get calls() {
      return state.calls;
    },
  };
}

// ---------------------------------------------------------------------------
// A. Bus core — verbosity / dispose (B8-B10).
// ---------------------------------------------------------------------------

describe("T-BUS — verbosity gating + dispose", () => {
  it("B8: verbosity 'off' schedules no tick and clears every sink exactly once, even though publishes still occur", () => {
    const recording = new RecordingClock(new FakeClock());
    const sink = recordingSink();
    const bus = makeBus([sink], recording);

    bus.setVerbosity("off");
    bus.invocationStarted("inv-1", "quality-loop");
    bus.checkpointBefore("inv-1", "tool-call", SITE);
    recording.advance(10_000);

    expect(recording.setTimeoutCalls).toHaveLength(0);
    expect(sink.clears).toHaveLength(1);
    expect(sink.renders).toHaveLength(0);
  });

  it("B9: setVerbosity('counts') mid-instance is observed by the NEXT render", () => {
    const clock = new FakeClock();
    const sink = recordingSink();
    const bus = makeBus([sink], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    clock.advance(STATUS_TICK_MS);
    bus.setVerbosity("counts");
    bus.checkpointBefore("inv-1", "tool-call", SITE);
    clock.advance(STATUS_TICK_MS);

    const last = sink.renders.at(-1);
    expect(last?.verbosity).toBe("counts");
  });

  it("B10: dispose() clears the pending tick and every sink once; further publishes + clock advances never render; a second dispose is a no-op", () => {
    const recording = new RecordingClock(new FakeClock());
    const sink = recordingSink();
    const bus = makeBus([sink], recording);

    bus.invocationStarted("inv-1", "quality-loop");
    bus.dispose();
    expect(recording.clearTimeoutCalls.length).toBeGreaterThanOrEqual(1);
    expect(sink.clears).toHaveLength(1);

    bus.invocationStarted("inv-2", "fix-cluster");
    recording.advance(10_000);
    expect(sink.renders).toHaveLength(0);

    expect(() => bus.dispose()).not.toThrow();
    expect(sink.clears).toHaveLength(1); // second dispose: no extra clear
  });
});

// ---------------------------------------------------------------------------
// A. Bus core — memory bounds + snapshot shape (B5-B7).
// ---------------------------------------------------------------------------

describe("T-BUS — memory bounds + snapshot shape (EXST-7)", () => {
  it("B5: an ended node still appears in the snapshot with endedAtMs (done-flash) until DONE_LINGER_MS elapses, then is evicted by a follow-up tick", () => {
    const clock = new FakeClock();
    const sink = recordingSink();
    const bus = makeBus([sink], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    clock.advance(STATUS_TICK_MS);
    bus.invocationEnded("inv-1");
    clock.advance(STATUS_TICK_MS);

    const beforeLinger = bus.snapshot();
    const node = beforeLinger.nodes.find((n) => n.invocationId === "inv-1");
    expect(node?.endedAtMs).toBeDefined();

    clock.advance(DONE_LINGER_MS);
    const afterLinger = bus.snapshot();
    expect(afterLinger.nodes.some((n) => n.invocationId === "inv-1")).toBe(false);
  });

  it("B6: the 33rd tracked invocation beyond MAX_TRACKED_INVOCATIONS is counted, not tracked; its invocationEnded decrements untracked", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);

    for (let i = 0; i < MAX_TRACKED_INVOCATIONS; i++) {
      bus.invocationStarted(`inv-${i}`, "quality-loop");
    }
    bus.invocationStarted("inv-overflow", "quality-loop");
    clock.advance(STATUS_TICK_MS);

    const snap = bus.snapshot();
    expect(snap.untracked).toBe(1);
    expect(snap.nodes).toHaveLength(MAX_TRACKED_INVOCATIONS);

    // A later publish for the untracked id is a no-op — no throw, no node.
    expect(() => bus.checkpointBefore("inv-overflow", "tool-call", SITE)).not.toThrow();

    bus.invocationEnded("inv-overflow");
    clock.advance(STATUS_TICK_MS);
    expect(bus.snapshot().untracked).toBe(0);
  });

  it("B7: snapshot() preserves insertion order across several nodes", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);

    bus.invocationStarted("inv-a", "a");
    bus.invocationStarted("inv-b", "b");
    bus.invocationStarted("inv-c", "c");
    clock.advance(STATUS_TICK_MS);

    const ids = bus.snapshot().nodes.map((n) => n.invocationId);
    expect(ids).toEqual(["inv-a", "inv-b", "inv-c"]);
  });
});

// ---------------------------------------------------------------------------
// B. Lifecycle + lanes (B12-B17, B19). B18 is producer-wiring (evalParFor's
// `statusLanes` DI thread) and B20 is an existing-suite pin — both out of
// scope for this bus-only unit; see the punted-ambiguities note.
// ---------------------------------------------------------------------------

describe("T-BUS — invocation lifecycle (EXST-3(b))", () => {
  it("B12: invocationStarted(id, theta) leaves mode undefined and stamps startedAtMs", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);

    clock.advance(1234);
    bus.invocationStarted("inv-1", "quality-loop");
    clock.advance(STATUS_TICK_MS);

    const node = bus.snapshot().nodes.find((n) => n.invocationId === "inv-1");
    expect(node).toBeDefined();
    expect(node?.mode).toBeUndefined();
    expect(node?.startedAtMs).toBe(1234);
  });

  it("B13: invocationBound(mode, parent) after started sets mode + parentInvocationId", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    bus.invocationBound("inv-1", { mode: "subagent", parentInvocationId: "inv-parent" });
    clock.advance(STATUS_TICK_MS);

    const node = bus.snapshot().nodes.find((n) => n.invocationId === "inv-1");
    expect(node?.mode).toBe("subagent");
    expect(node?.parentInvocationId).toBe("inv-parent");
  });
});

describe("T-BUS — par-for lane lifecycle (EXST-3(c))", () => {
  it("B14: openLaneSet(12, 4) is reflected in the node snapshot as {total:12, width:4, queued:12}", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    bus.openLaneSet("inv-1", 12, 4);
    clock.advance(STATUS_TICK_MS);

    const lanes = bus.snapshot().nodes.find((n) => n.invocationId === "inv-1")?.lanes;
    expect(lanes).toEqual(expect.objectContaining({ total: 12, width: 4, queued: 12 }));
  });

  it("B15: claim(3) moves lane 3 from queued to running — queued 11, running [{index:3}]", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    const handle = bus.openLaneSet("inv-1", 12, 4);
    handle.claim(3);
    clock.advance(STATUS_TICK_MS);

    const lanes = bus.snapshot().nodes.find((n) => n.invocationId === "inv-1")?.lanes;
    expect(lanes?.queued).toBe(11);
    expect(lanes?.running.map((r) => r.index)).toEqual([3]);
  });

  it("B16: settle(3,'done') and settle(5,'err') both drop from running into their terminal counters (both directions asserted deliberately)", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    const handle = bus.openLaneSet("inv-1", 12, 4);
    handle.claim(3);
    handle.claim(5);
    handle.settle(3, "done");
    handle.settle(5, "err");
    clock.advance(STATUS_TICK_MS);

    const lanes = bus.snapshot().nodes.find((n) => n.invocationId === "inv-1")?.lanes;
    expect(lanes?.done).toBe(1);
    expect(lanes?.err).toBe(1);
    expect(lanes?.running).toHaveLength(0);
  });

  it("B17: a 5th nested openLaneSet beyond MAX_LANE_SET_DEPTH counter-collapses into the deepest tracked set", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    const totals = [10, 20, 30, 40, 50];
    expect(totals).toHaveLength(MAX_LANE_SET_DEPTH + 1);
    for (const total of totals) {
      bus.openLaneSet("inv-1", total, 1);
    }
    clock.advance(STATUS_TICK_MS);

    const lanes = bus.snapshot().nodes.find((n) => n.invocationId === "inv-1")?.lanes;
    // The 5th set collapses into the 4th (deepest tracked) rather than
    // becoming its own visible set.
    expect(lanes?.total).toBe(totals[MAX_LANE_SET_DEPTH - 1]);
  });

  it("B19: a whole-theta cancel mid-fan-out (invocationEnded with unsettled lanes) never throws and the node ends without settling the remainder", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    const handle = bus.openLaneSet("inv-1", 4, 4);
    handle.claim(0);
    handle.claim(1);
    // Cancel mid-fan-out: lanes 2 and 3 are never claimed nor settled.
    expect(() => bus.invocationEnded("inv-1")).not.toThrow();
    clock.advance(STATUS_TICK_MS + DONE_LINGER_MS);
    expect(() => bus.snapshot()).not.toThrow();
  });

  it("B14-scoped adapter shape: a ParForLaneHooks adapter over bus.openLaneSet forwards (invocationId, total, width) unchanged (EXST-3(c) producer-adapter shape)", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);
    bus.invocationStarted("inv-1", "quality-loop");

    const adapter: ParForLaneHooks = {
      open: (total, width) => bus.openLaneSet("inv-1", total, width),
    };
    adapter.open(7, 3);
    clock.advance(STATUS_TICK_MS);

    const lanes = bus.snapshot().nodes.find((n) => n.invocationId === "inv-1")?.lanes;
    expect(lanes).toEqual(expect.objectContaining({ total: 7, width: 3 }));
  });
});

// ---------------------------------------------------------------------------
// H. Containment at the bus boundary + publish-path discipline (part of B25/
// EXST-9's bus-side half; the sink-permanent-disable half is T-CON's, out of
// this core-only scope — see punted ambiguities).
// ---------------------------------------------------------------------------

describe("T-BUS — containment (EXST-9) + publish-path discipline (EXST-6)", () => {
  it("a throwing subscriber (sink.render) is caught at the bus boundary, disabled for the session, and later publishes render into the SURVIVING sink unharmed", () => {
    const clock = new FakeClock();
    const throwingSink: StatusSink = {
      id: "footer",
      render(): void {
        throw new Error("sink boom");
      },
      clear(): void {
        // no-op
      },
    };
    const survivor = recordingSink("widget");
    const bus = makeBus([throwingSink, survivor], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    expect(() => clock.advance(STATUS_TICK_MS)).not.toThrow();

    bus.checkpointBefore("inv-1", "tool-call", SITE);
    expect(() => clock.advance(STATUS_TICK_MS)).not.toThrow();

    // The surviving sink keeps receiving renders across both ticks.
    expect(survivor.renders.length).toBeGreaterThanOrEqual(2);
  });

  it("producer publish does no rendering work inline: a sink is never called synchronously on publish, only later on the tick", () => {
    const clock = new FakeClock();
    const sink = recordingSink();
    const bus = makeBus([sink], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    // Synchronously after the publish, no render has happened yet.
    expect(sink.renders).toHaveLength(0);

    clock.advance(STATUS_TICK_MS);
    // Only the tick renders.
    expect(sink.renders.length).toBeGreaterThanOrEqual(1);
  });
});
