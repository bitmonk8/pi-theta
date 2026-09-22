// RFC 0015 (docs/rfcs/0015-theta-run-card.md §"Heat model", D2) —
// `tests/execution-status-heat.test.ts` (T-HEAT). Behaviour rows H1-H18
// (plus H6b/H10b/H16b) for
// the bus's D2 state: the per-invocation `(file, line)` heat ring (LRU,
// `HEAT_RING_CAPACITY`-bounded), the operator-ruled full-heat clamp on the
// in-flight effect's line, launch-site attribution on child nodes, and the
// snapshot-shape extension. The trace seam is deliberately NOT wired to any
// composition here (that is D5): the rows drive `bus.trace(...)` directly,
// which is the D2 ingest surface itself.

import { describe, expect, it } from "vitest";
import { createExecutionStatusBus } from "../src/extension/execution-status/bus";
import {
  HEAT_RING_CAPACITY,
  STATUS_TICK_MS,
  type ExecutionStatusBus,
  type ExecutionStatusSnapshot,
  type ProgressVerbosity,
  type StatusSink,
  type ViewShape,
} from "../src/extension/execution-status/types";
import { FakeClock } from "./helpers/fake-clock";

/** Residence-keyed trace sites (the file is the residence-rule file — trace.ts). */
const SITE_A = { file: "quality-loop.theta", line: 10, column: 1 } as const;
const SITE_B = { file: "quality-loop.theta", line: 42, column: 3 } as const;
/** Same LINE as `SITE_A`, different FILE — the D0 per-file key discriminator. */
const SITE_A_OTHER_FILE = { file: "helpers.thetalib", line: 10, column: 1 } as const;

function makeBus(clock: FakeClock, sinks: StatusSink[] = []): ExecutionStatusBus {
  return createExecutionStatusBus({ clock, sinks });
}

function startNode(bus: ExecutionStatusBus, id = "inv-1"): void {
  bus.invocationStarted(id, "quality-loop");
}

function nodeOf(bus: ExecutionStatusBus, id = "inv-1") {
  const node = bus.snapshot().nodes.find((n) => n.invocationId === id);
  expect(node).toBeDefined();
  return node!;
}

describe("execution-status heat ring (RFC 0015 D2)", () => {
  it("H1: a trace publication upserts a heat entry; the snapshot exposes file/line/lastHitMs/hits/dwellMs/kind", () => {
    const clock = new FakeClock({ now: 1_000 });
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "stmt");
    const heat = nodeOf(bus).heat;
    expect(heat).toBeDefined();
    expect(heat!.entries).toEqual([
      { file: "quality-loop.theta", line: 10, lastHitMs: 1_000, hits: 1, dwellMs: 0, kind: "stmt" },
    ]);
    expect(heat!.clampedLine).toBeUndefined();
  });

  it("H2: a re-hit bumps hits, refreshes lastHitMs, and moves the key to the MRU end of the entries order", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "stmt");
    clock.advance(50);
    bus.trace("inv-1", SITE_B, "stmt");
    clock.advance(50);
    bus.trace("inv-1", SITE_A, "stmt");
    const entries = nodeOf(bus).heat!.entries;
    // Recency order: B (older hit) first, A (re-hit) last.
    expect(entries.map((e) => e.line)).toEqual([42, 10]);
    const a = entries[1]!;
    expect(a.hits).toBe(2);
    expect(a.lastHitMs).toBe(100);
  });

  it("H3: \"stmt\" never downgrades a recorded effect kind; effect kinds overwrite each other", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    // Dispatch order on an effect line per D1: "stmt" first, then the effect kind.
    bus.trace("inv-1", SITE_A, "stmt");
    bus.trace("inv-1", SITE_A, "invoke");
    expect(nodeOf(bus).heat!.entries[0]!.kind).toBe("invoke");
    // A later iteration's "stmt" re-hit keeps the effect identity.
    bus.trace("inv-1", SITE_A, "stmt");
    expect(nodeOf(bus).heat!.entries[0]!.kind).toBe("invoke");
    // An effect kind overwrites an effect kind (multi-statement line).
    bus.trace("inv-1", SITE_A, "tool-call");
    expect(nodeOf(bus).heat!.entries[0]!.kind).toBe("tool-call");
  });

  it("H4 (hard ceiling): HEAT_RING_CAPACITY is 256; the insert beyond capacity evicts exactly the LRU key, and a re-hit protects a key from eviction", () => {
    expect(HEAT_RING_CAPACITY).toBe(256);
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    for (let line = 1; line <= HEAT_RING_CAPACITY; line++) {
      bus.trace("inv-1", { file: "f.theta", line, column: 1 }, "stmt");
      clock.advance(1);
    }
    // Re-hit line 1 so it is no longer the LRU victim.
    bus.trace("inv-1", { file: "f.theta", line: 1, column: 1 }, "stmt");
    clock.advance(1);
    bus.trace("inv-1", { file: "f.theta", line: HEAT_RING_CAPACITY + 1, column: 1 }, "stmt");
    const entries = nodeOf(bus).heat!.entries;
    expect(entries).toHaveLength(HEAT_RING_CAPACITY);
    const lines = new Set(entries.map((e) => e.line));
    expect(lines.has(1)).toBe(true); // protected by the re-hit
    expect(lines.has(2)).toBe(false); // the LRU victim
    expect(lines.has(HEAT_RING_CAPACITY + 1)).toBe(true);
  });

  it("H5: dwellMs attributes each inter-publication interval to the previously-current key — a long effect lands its duration on the effect's own line", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "stmt");
    clock.advance(100);
    bus.trace("inv-1", SITE_A, "invoke"); // same key re-hit: 100ms dwell on A
    clock.advance(2_000); // the in-flight effect
    bus.trace("inv-1", SITE_B, "stmt"); // next statement closes A's interval
    clock.advance(30);
    bus.trace("inv-1", SITE_B, "stmt"); // same-key re-hit closes B's 30ms
    const entries = nodeOf(bus).heat!.entries;
    const a = entries.find((e) => e.line === 10)!;
    const b = entries.find((e) => e.line === 42)!;
    expect(a.dwellMs).toBe(2_100);
    expect(b.dwellMs).toBe(30);
  });

  it("H6: an effect-kind publication clamps its (file, line); the next \"stmt\" publication clears the clamp", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "stmt");
    bus.trace("inv-1", SITE_A, "query");
    expect(nodeOf(bus).heat!.clampedLine).toEqual({ file: "quality-loop.theta", line: 10 });
    // Operator ruling: the clamp holds across arbitrary wall time with no
    // further publication (the long-effect window) — the card never looks idle.
    clock.advance(60_000);
    expect(nodeOf(bus).heat!.clampedLine).toEqual({ file: "quality-loop.theta", line: 10 });
    bus.trace("inv-1", SITE_B, "stmt"); // effect settled: executor dispatched again
    expect(nodeOf(bus).heat!.clampedLine).toBeUndefined();
  });

  it("H6b: clearing the clamp refreshes the settled effect line's lastHitMs — the fade starts at settle, not at dispatch", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "query"); // effect dispatch at t=0 clamps A
    clock.advance(60_000); // long in-flight effect held at full heat
    bus.trace("inv-1", SITE_B, "stmt"); // settle witness clears the clamp
    const heat = nodeOf(bus).heat!;
    expect(heat.clampedLine).toBeUndefined();
    // Without the settle refresh, lastHitMs would still be 0 (dispatch time)
    // and the line would snap from full heat to α≈0 ("then fades normally").
    expect(heat.entries.find((e) => e.line === 10)!.lastHitMs).toBe(60_000);
  });

  it("H7: the clamp always names the NEWEST effect publication across ring churn — a clamped key is the MRU and is never evicted while clamped", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "invoke");
    // >capacity distinct "stmt" keys churn the whole ring. The FIRST "stmt"
    // already cleared SITE_A's clamp (it is the settle witness), so eviction
    // reclaims SITE_A's entry like any LRU victim — an evicted-while-clamped
    // key is unreachable under shipped semantics.
    for (let line = 1_000; line < 1_000 + HEAT_RING_CAPACITY; line++) {
      bus.trace("inv-1", { file: "other.theta", line, column: 1 }, "stmt");
    }
    expect(nodeOf(bus).heat!.entries.some((e) => e.line === 10)).toBe(false);
    expect(nodeOf(bus).heat!.clampedLine).toBeUndefined();
    // Effect-kind churn: every publication moves the clamp with it, so the
    // clamp names the newest effect key — which is the ring's MRU entry.
    bus.trace("inv-1", SITE_A, "invoke");
    for (let line = 2_000; line < 2_000 + HEAT_RING_CAPACITY; line++) {
      bus.trace("inv-1", { file: "other.theta", line, column: 1 }, "invoke");
    }
    const heat = nodeOf(bus).heat!;
    expect(heat.entries).toHaveLength(HEAT_RING_CAPACITY);
    expect(heat.clampedLine).toEqual({ file: "other.theta", line: 2_000 + HEAT_RING_CAPACITY - 1 });
    // The clamped key IS the MRU ring entry — in-ring, never orphaned.
    expect(heat.entries[heat.entries.length - 1]!.line).toBe(2_000 + HEAT_RING_CAPACITY - 1);
  });

  it("H8: invocationEnded clears the clamp — a lingering node keeps its heat but renders no full-heat line", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "invoke");
    expect(nodeOf(bus).heat!.clampedLine).toBeDefined();
    bus.invocationEnded("inv-1");
    const heat = nodeOf(bus).heat!;
    expect(heat.entries).toHaveLength(1);
    expect(heat.clampedLine).toBeUndefined();
  });

  it("H17: invocationEnded closes the current key's open dwell interval — a drive whose FINAL statement is a long effect lands that tail duration on the effect's line", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "stmt");
    clock.advance(100);
    bus.trace("inv-1", SITE_A, "invoke"); // same-key re-hit: 100ms dwell on A
    clock.advance(2_000); // the long final effect — no further publication ever
    bus.invocationEnded("inv-1");
    const a = nodeOf(bus).heat!.entries.find((e) => e.line === 10)!;
    // Without the end-path close the 2 000ms tail is dropped (trace() ignores
    // ended nodes, so nothing later can attribute it).
    expect(a.dwellMs).toBe(2_100);
  });

  it("H18: the end-path clamp clear refreshes the clamped entry's lastHitMs — the done-flash fade starts at end (= settle), not at the effect's dispatch", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "query"); // effect dispatch at t=0 clamps A
    clock.advance(60_000); // long-clamped in-flight effect
    bus.invocationEnded("inv-1");
    const heat = nodeOf(bus).heat!;
    expect(heat.clampedLine).toBeUndefined();
    // Without the settle refresh, lastHitMs would still be 0 (dispatch time)
    // and the line would snap full-heat→α≈0 on the lingering card.
    expect(heat.entries.find((e) => e.line === 10)!.lastHitMs).toBe(60_000);
  });

  it("H11: undefined / unknown / ended-node ids drop the publication with no heat and no throw", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace(undefined, SITE_A, "stmt");
    bus.trace("inv-unknown", SITE_A, "stmt");
    bus.invocationEnded("inv-1");
    bus.trace("inv-1", SITE_A, "stmt");
    expect(nodeOf(bus).heat).toBeUndefined();
  });

  it("H12: the same line in two files is two distinct keys (D0 per-file semantics)", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "stmt");
    bus.trace("inv-1", SITE_A_OTHER_FILE, "stmt");
    const entries = nodeOf(bus).heat!.entries;
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.file)).toEqual(["quality-loop.theta", "helpers.thetalib"]);
  });

  it("H13: heat snapshots are fresh immutable-shaped copies — mutating one never leaks into the live ring or a later snapshot", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "stmt");
    const first = nodeOf(bus).heat!;
    (first.entries[0] as { hits: number }).hits = 999;
    const second = nodeOf(bus).heat!;
    expect(second.entries).not.toBe(first.entries);
    expect(second.entries[0]!.hits).toBe(1);
  });

  it("H14: a trace publication is dirt — the coalesced tick renders a snapshot carrying the heat ring to the sinks", () => {
    const clock = new FakeClock();
    const renders: ExecutionStatusSnapshot[] = [];
    const sink: StatusSink = {
      id: "run-card",
      render(snapshot: ExecutionStatusSnapshot, _v: ViewShape, _p: ProgressVerbosity): void {
        renders.push(snapshot);
      },
      clear(): void {},
    };
    const bus = makeBus(clock, [sink]);
    startNode(bus);
    bus.trace("inv-1", SITE_A, "tool-call");
    clock.advance(STATUS_TICK_MS);
    expect(renders.length).toBeGreaterThan(0);
    const rendered = renders[renders.length - 1]!.nodes[0]!;
    expect(rendered.heat!.entries[0]).toMatchObject({ line: 10, kind: "tool-call" });
    expect(rendered.heat!.clampedLine).toEqual({ file: "quality-loop.theta", line: 10 });
    bus.dispose();
  });
});

describe("execution-status launch-site attribution (RFC 0015 D2)", () => {
  it("H9: a child bound with a parentInvocationId is stamped with the parent's newest \"invoke\"-kind trace site", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus, "parent");
    bus.trace("parent", SITE_B, "invoke");
    startNode(bus, "child");
    bus.invocationBound("child", { mode: "prompt", parentInvocationId: "parent" });
    expect(nodeOf(bus, "child").launchSite).toEqual(SITE_B);
    // The parent's own node carries no launchSite (it was bound with no parent).
    bus.invocationBound("parent", { mode: "prompt" });
    expect(nodeOf(bus, "parent").launchSite).toBeUndefined();
  });

  it("H10: with no trace publications the fallback is the parent's currentEffect site iff that effect is an invoke; otherwise launchSite is absent", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus, "parent");
    bus.checkpointBefore("parent", "invoke", SITE_B);
    startNode(bus, "child-1");
    bus.invocationBound("child-1", { mode: "subagent", parentInvocationId: "parent" });
    expect(nodeOf(bus, "child-1").launchSite).toEqual(SITE_B);
    // A non-invoke current effect attributes nothing — better absent than wrong.
    bus.checkpointBefore("parent", "tool-call", SITE_A);
    startNode(bus, "child-2");
    bus.invocationBound("child-2", { mode: "subagent", parentInvocationId: "parent" });
    expect(nodeOf(bus, "child-2").launchSite).toBeUndefined();
  });

  it("H10b: the residence-keyed trace source wins over the checkpoint-site fallback", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus, "parent");
    // Both fire at an invoke dispatch (trace first, checkpoint after); the
    // trace site carries the residence file, the checkpoint site the slash name.
    bus.trace("parent", { file: "helpers.thetalib", line: 7, column: 1 }, "invoke");
    bus.checkpointBefore("parent", "invoke", { file: "quality-loop", line: 7, column: 1 });
    startNode(bus, "child");
    bus.invocationBound("child", { mode: "prompt", parentInvocationId: "parent" });
    expect(nodeOf(bus, "child").launchSite).toEqual({ file: "helpers.thetalib", line: 7, column: 1 });
  });

  it("H15: two \"invoke\" traces before the bind — the child is stamped with the SECOND (newest-invoke-wins, the documented accepted race)", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus, "parent");
    bus.trace("parent", SITE_A, "invoke");
    bus.trace("parent", SITE_B, "invoke");
    startNode(bus, "child");
    bus.invocationBound("child", { mode: "prompt", parentInvocationId: "parent" });
    expect(nodeOf(bus, "child").launchSite).toEqual(SITE_B);
  });

  it("H16: a subagent-fn bind after an earlier plain invoke gets NO launchSite — fn spawns publish no invoke kind, so the stale site must not be stamped", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus, "parent");
    bus.trace("parent", SITE_A, "invoke");
    startNode(bus, "child");
    bus.invocationBound("child", { mode: "subagent-fn", parentInvocationId: "parent" });
    expect(nodeOf(bus, "child").launchSite).toBeUndefined();
  });

  it("H16c: a subagent-fn bind still increments the parent's cumulative childrenSpawned — the mode gate scopes launch-SITE attribution only, not existence", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus, "parent");
    startNode(bus, "child");
    bus.invocationBound("child", { mode: "subagent-fn", parentInvocationId: "parent" });
    expect(nodeOf(bus, "parent").childrenSpawned).toBe(1);
  });

  it("H16b: the subagent-fn gate is mode-scoped — a non-fn bind after the same sequence still gets the site", () => {
    const clock = new FakeClock();
    const bus = makeBus(clock);
    startNode(bus, "parent");
    bus.trace("parent", SITE_A, "invoke");
    startNode(bus, "child");
    bus.invocationBound("child", { mode: "subagent", parentInvocationId: "parent" });
    expect(nodeOf(bus, "child").launchSite).toEqual(SITE_A);
  });
});
