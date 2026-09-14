import { describe, expect, it } from "vitest";
import type { Clock, TimerHandle } from "../src/seams/clock";
import type { CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import { ProductionCheckpoint } from "../src/seams/production-checkpoint";
import { FakeClock } from "./helpers/fake-clock";

// V8a-T — failing tests for the paired `V8a` `ProductionCheckpoint` production
// wiring of the `Checkpoint` seam (PIC-10, host-interfaces-services.md). The
// single Tests bullet — "a checkpoint awaits at each defined cancel site with
// the correct yield kind and adds no extra sites" — decomposes into:
//   (1) `loop-iter` resolves only on a macrotask turn scheduled through the
//       injected `Clock` seam's `setTimeout(fn, 0)` (never a bare global timer);
//   (2) every other kind resolves on the microtask queue (already-resolved);
//   (3) the yield kind is correct for each of the five enumerated cancel sites,
//       and there are no extra sites (the `CheckpointKind` union is exactly the
//       five members — pinned structurally by the exhaustive `Record` below);
//   (4) the seam is per-invocation (one `Checkpoint` per `thetaAbort`).
//
// These tests red because the V8a `ProductionCheckpoint.before(...)` is a stub
// that throws — the implementation under test is absent. Each assertion names
// the PIC-10 behaviour it pins so the red is on the assertion path, not a
// fixture or harness throw.

const SITE: CheckpointSite = { file: "theta.theta", line: 1, column: 1 };

/**
 * Yield kind for every `CheckpointKind`. Declaring this as an exhaustive
 * `Record<CheckpointKind, ...>` pins PIC-10's "adds no extra sites": adding or
 * removing a `CheckpointKind` member makes this file fail to type-check, so the
 * five enumerated cancel sites are the only ones the seam recognises.
 */
const YIELD_KIND: Record<CheckpointKind, "macrotask" | "microtask"> = {
  "loop-iter": "macrotask",
  query: "microtask",
  "tool-call": "microtask",
  invoke: "microtask",
  "binder-call": "microtask",
};

const ALL_KINDS = Object.keys(YIELD_KIND) as CheckpointKind[];

/** Drain the microtask queue several rounds (no macrotask turn is taken). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

/**
 * A `Clock` that delegates to a `FakeClock` but records every `setTimeout`
 * scheduling so a test can assert the `loop-iter` yield routes through the
 * injected seam's `setTimeout(fn, 0)` rather than a bare global timer.
 */
class RecordingClock implements Clock {
  readonly setTimeoutCalls: number[] = [];
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
    this.setTimeoutCalls.push(ms);
    return this.#inner.setTimeout(fn, ms);
  }

  clearTimeout(handle: TimerHandle): void {
    this.#inner.clearTimeout(handle);
  }

  advance(ms: number): void {
    this.#inner.advance(ms);
  }
}

// ---------------------------------------------------------------------------
// PIC-10 — `loop-iter` macrotask yield through the injected Clock seam.
// ---------------------------------------------------------------------------

describe("V8a-T — ProductionCheckpoint loop-iter macrotask yield (PIC-10)", () => {
  it("PIC-10: before('loop-iter') stays pending across microtasks and resolves only after clock.advance(0)", async () => {
    const clock = new FakeClock();
    const checkpoint = new ProductionCheckpoint(clock);

    let resolved = false;
    const awaited = checkpoint.before("loop-iter", SITE).then(() => {
      resolved = true;
    });

    // A macrotask yield is not satisfied by draining microtasks alone.
    await flushMicrotasks();
    expect(resolved).toBe(false);

    // Firing the 0-ms timer the seam scheduled through the injected Clock
    // releases the awaiting interpreter.
    clock.advance(0);
    await flushMicrotasks();
    expect(resolved).toBe(true);

    await awaited;
  });

  it("PIC-10: before('loop-iter') schedules its yield through the injected Clock.setTimeout(fn, 0), not a bare global timer", async () => {
    const recording = new RecordingClock(new FakeClock());
    const checkpoint = new ProductionCheckpoint(recording);

    const awaited = checkpoint.before("loop-iter", SITE);
    expect(recording.setTimeoutCalls).toEqual([0]); // exactly one 0-ms schedule

    recording.advance(0);
    await awaited; // resolves once the injected timer fires
  });
});

// ---------------------------------------------------------------------------
// PIC-10 — non-loop-iter kinds resolve on the microtask queue.
// ---------------------------------------------------------------------------

describe("V8a-T — ProductionCheckpoint microtask yield for non-loop-iter kinds (PIC-10)", () => {
  for (const kind of ALL_KINDS.filter((k) => YIELD_KIND[k] === "microtask")) {
    it(`PIC-10: before('${kind}') resolves on the microtask queue (no clock.advance needed)`, async () => {
      const clock = new FakeClock();
      const checkpoint = new ProductionCheckpoint(clock);

      let resolved = false;
      const awaited = checkpoint.before(kind, SITE).then(() => {
        resolved = true;
      });

      // No clock.advance: a microtask-resolving checkpoint is settled by a
      // microtask drain alone.
      await flushMicrotasks();
      expect(resolved).toBe(true);

      await awaited;
    });

    it(`PIC-10: before('${kind}') schedules no timer on the injected Clock`, async () => {
      const recording = new RecordingClock(new FakeClock());
      const checkpoint = new ProductionCheckpoint(recording);

      await checkpoint.before(kind, SITE);
      expect(recording.setTimeoutCalls).toEqual([]); // no macrotask scheduling
    });
  }
});

// ---------------------------------------------------------------------------
// PIC-10 — correct yield kind across every enumerated cancel site; no extras.
// ---------------------------------------------------------------------------

describe("V8a-T — ProductionCheckpoint correct yield kind at every cancel site (PIC-10)", () => {
  it("PIC-10: loop-iter is the unique macrotask kind and the other four are microtask kinds (no extra sites)", () => {
    const macrotaskKinds = ALL_KINDS.filter((k) => YIELD_KIND[k] === "macrotask");
    const microtaskKinds = ALL_KINDS.filter((k) => YIELD_KIND[k] === "microtask");
    expect(macrotaskKinds).toEqual(["loop-iter"]);
    expect(microtaskKinds.sort()).toEqual(["binder-call", "invoke", "query", "tool-call"]);
    // All five enumerated sites are covered, and no sixth exists.
    expect(ALL_KINDS).toHaveLength(5);
  });

  it("PIC-10: every kind's resolution matches its declared yield kind (macrotask needs advance; microtask does not)", async () => {
    for (const kind of ALL_KINDS) {
      const clock = new FakeClock();
      const checkpoint = new ProductionCheckpoint(clock);

      let resolved = false;
      const awaited = checkpoint.before(kind, SITE).then(() => {
        resolved = true;
      });
      await flushMicrotasks();

      if (YIELD_KIND[kind] === "macrotask") {
        expect(resolved, `${kind} must await a macrotask turn`).toBe(false);
        clock.advance(0);
        await flushMicrotasks();
      }
      expect(resolved, `${kind} resolution`).toBe(true);
      await awaited;
    }
  });
});

// ---------------------------------------------------------------------------
// PIC-10 — per-invocation: one Checkpoint per thetaAbort.
// ---------------------------------------------------------------------------

describe("V8a-T — ProductionCheckpoint is per-invocation (PIC-10)", () => {
  it("PIC-10: two checkpoints from the same factory clock are independent instances, each functional", async () => {
    // `loop-iter` is the one CheckpointKind whose `before()` actually reads
    // the injected Clock (the other four resolve via a bare `Promise.resolve()`
    // and would pass this test unchanged even if the clock were never shared),
    // so it is the kind that can observe "the same factory clock".
    const recording = new RecordingClock(new FakeClock());
    const parent = new ProductionCheckpoint(recording);
    const child = new ProductionCheckpoint(recording);
    expect(parent).not.toBe(child);

    let childResolved = false;
    let parentResolved = false;
    const childAwaited = child.before("loop-iter", SITE).then(() => {
      childResolved = true;
    });
    const parentAwaited = parent.before("loop-iter", SITE).then(() => {
      parentResolved = true;
    });
    // Both instances schedule their yield on the ONE shared clock.
    expect(
      recording.setTimeoutCalls,
      "each instance schedules its own 0-ms timer on the shared factory clock",
    ).toEqual([0, 0]);

    // Neither settles from a microtask drain alone: both are genuinely
    // macrotask-scheduled through the shared clock, not pre-resolved.
    await flushMicrotasks();
    expect(childResolved, "the child's checkpoint awaits the shared clock").toBe(false);
    expect(parentResolved, "the parent's checkpoint awaits the shared clock").toBe(false);

    // Advancing the ONE shared clock releases both pending checkpoints — a
    // child's checkpoint resolving neither depends on nor disturbs the
    // parent's, even though both route through the same Clock instance.
    recording.advance(0);
    await childAwaited;
    await parentAwaited;
    expect(childResolved).toBe(true);
    expect(parentResolved).toBe(true);
  });
});
