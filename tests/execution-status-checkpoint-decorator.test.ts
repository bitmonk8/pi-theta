import { describe, expect, it } from "vitest";
import type { Clock } from "../src/seams/clock";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import { ProductionCheckpoint } from "../src/seams/production-checkpoint";
import {
  TelemetryCheckpoint,
  decorateCheckpoint,
} from "../src/extension/execution-status/checkpoint-decorator";
import { createExecutionStatusBus } from "../src/extension/execution-status/bus";
import type { ExecutionStatusBus, StatusSink } from "../src/extension/execution-status/types";
import { FakeClock } from "./helpers/fake-clock";

// RFC 0010 (execution-status.md EXST-4) — `tests/execution-status-checkpoint-decorator.test.ts`
// (T-DEC). Behaviour-matrix rows B21-B25, B27 (B26 is the existing S6
// do-not-break pin, verified separately below by import rather than
// duplication; B27's binder-path threading is producer-wiring, out of scope
// for this decorator-only unit — see punted ambiguities).
//
// `checkpoint-decorator.ts` publishes to the bus and THEN delegates to the
// wrapped `Checkpoint` — every publish-observing assertion below asserts the
// recorded bus call, and the yield-semantics and bus-absent-identity tests
// pin the delegation is undisturbed regardless.

const SITE: CheckpointSite = { file: "quality-loop.theta", line: 214, column: 1 };
const ALL_KINDS: readonly CheckpointKind[] = [
  "loop-iter",
  "query",
  "tool-call",
  "invoke",
  "binder-call",
];

async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

/** A `Checkpoint` fake recording call order, for delegation-preservation tests. */
class RecordingCheckpoint implements Checkpoint {
  readonly calls: Array<{ kind: CheckpointKind; site: CheckpointSite }> = [];

  before(kind: CheckpointKind, site: CheckpointSite): Promise<void> {
    this.calls.push({ kind, site });
    return Promise.resolve();
  }
}

/** A bus recording every `checkpointBefore` publication, for EXST-4 order tests. */
class RecordingBus implements Pick<ExecutionStatusBus, "checkpointBefore"> {
  readonly publishes: Array<{ invocationId: string; kind: CheckpointKind; site: CheckpointSite }> = [];

  checkpointBefore(invocationId: string, kind: CheckpointKind, site: CheckpointSite): void {
    this.publishes.push({ invocationId, kind, site });
  }
}

function realBus(clock: Clock = new FakeClock(), sinks: StatusSink[] = []): ExecutionStatusBus {
  return createExecutionStatusBus({ clock, sinks });
}

// ---------------------------------------------------------------------------
// B21 — synchronous publish of (invocationId, kind, site) for all five kinds.
// ---------------------------------------------------------------------------

describe("T-DEC — B21: synchronous publish before delegation (EXST-4)", () => {
  for (const kind of ALL_KINDS) {
    it(`B21: before('${kind}') publishes (invocationId, kind, site) to the bus SYNCHRONOUSLY, before the returned promise settles`, () => {
      const recordingBus = new RecordingBus();
      const inner = new RecordingCheckpoint();
      const decorated = new TelemetryCheckpoint(
        inner,
        recordingBus as unknown as ExecutionStatusBus,
        "inv-1",
      );

      const pending = decorated.before(kind, SITE);
      // Asserted BEFORE awaiting the returned promise — the publish must be
      // synchronous, not deferred to a microtask/macrotask.
      expect(recordingBus.publishes).toEqual([{ invocationId: "inv-1", kind, site: SITE }]);

      return pending;
    });
  }
});

// ---------------------------------------------------------------------------
// B22/B23 — yield-semantics preservation.
// ---------------------------------------------------------------------------

describe("T-DEC — B22: decorated 'loop-iter' resolves on the injected-clock macrotask, exact tick", () => {
  it("B22: before('loop-iter') stays pending across microtasks and resolves only after clock.advance(0)", async () => {
    const clock = new FakeClock();
    const inner = new ProductionCheckpoint(clock);
    const bus = realBus(clock);
    const decorated = decorateCheckpoint(inner, bus, "inv-1");

    let resolved = false;
    const awaited = decorated.before("loop-iter", SITE).then(() => {
      resolved = true;
    });

    await flushMicrotasks();
    expect(resolved).toBe(false);

    clock.advance(0);
    await flushMicrotasks();
    expect(resolved).toBe(true);
    await awaited;
  });
});

describe("T-DEC — B23: decorated non-loop-iter kinds preserve microtask resolution", () => {
  for (const kind of ALL_KINDS.filter((k) => k !== "loop-iter")) {
    it(`B23: before('${kind}') resolves on the microtask queue with no clock.advance`, async () => {
      const clock = new FakeClock();
      const inner = new ProductionCheckpoint(clock);
      const bus = realBus(clock);
      const decorated = decorateCheckpoint(inner, bus, "inv-1");

      let resolved = false;
      const awaited = decorated.before(kind, SITE).then(() => {
        resolved = true;
      });

      await flushMicrotasks();
      expect(resolved).toBe(true);
      await awaited;
    });
  }
});

// ---------------------------------------------------------------------------
// B24 — bus-absent identity passthrough.
// ---------------------------------------------------------------------------

describe("T-DEC — B24: decorateCheckpoint(inner, undefined, id) returns the inner instance identity", () => {
  it("B24: bus === undefined returns the SAME `Checkpoint` instance (===), not a wrapper", () => {
    const inner = new RecordingCheckpoint();
    const result = decorateCheckpoint(inner, undefined, "inv-1");
    expect(result).toBe(inner);
  });
});

// ---------------------------------------------------------------------------
// B25 — a bus whose internal fold throws never perturbs delegation (EXST-9).
// ---------------------------------------------------------------------------

describe("T-DEC — B25: a throwing bus never perturbs delegation (EXST-9)", () => {
  it("B25: publication drops silently on a throwing bus; delegation still runs and the promise still resolves", async () => {
    const throwingBus: Pick<ExecutionStatusBus, "checkpointBefore"> = {
      checkpointBefore(): void {
        throw new Error("bus fold boom");
      },
    };
    const inner = new RecordingCheckpoint();
    const decorated = new TelemetryCheckpoint(
      inner,
      throwingBus as unknown as ExecutionStatusBus,
      "inv-1",
    );

    // The decorator itself must not let the bus's throw escape `before(...)`.
    await expect(decorated.before("tool-call", SITE)).resolves.toBeUndefined();
    expect(inner.calls).toEqual([{ kind: "tool-call", site: SITE }]);
  });
});

// ---------------------------------------------------------------------------
// Delegation-order preservation with a fake checkpoint recording call order
// (S6 yield-semantics idiom): the decorator must not insert any awaited work
// between the publish and the delegate call.
// ---------------------------------------------------------------------------

describe("T-DEC — delegation preserves call order (no awaited work before delegation)", () => {
  it("the decorator calls the inner checkpoint exactly once per before(), synchronously reachable from the caller's microtask turn", async () => {
    const order: string[] = [];
    class OrderCheckpoint implements Checkpoint {
      before(kind: CheckpointKind): Promise<void> {
        order.push(`inner:${kind}`);
        return Promise.resolve();
      }
    }
    class OrderBus implements Pick<ExecutionStatusBus, "checkpointBefore"> {
      checkpointBefore(_id: string, kind: CheckpointKind): void {
        order.push(`bus:${kind}`);
      }
    }
    const decorated = new TelemetryCheckpoint(
      new OrderCheckpoint(),
      new OrderBus() as unknown as ExecutionStatusBus,
      "inv-1",
    );

    await decorated.before("query", SITE);
    // EXST-4: publish happens synchronously, THEN delegate.
    expect(order).toEqual(["bus:query", "inner:query"]);
  });
});
