// RFC 0010 (execution-status.md, EXST-2/3/6/7/9) — `ExecutionStatusBus`.
//
// One bus per extension instance (EXST-2): every piece of state below is
// INSTANCE state reached by constructor injection — no module-level or
// process-global binding holds a bus, a sink, or a node (the H2a
// no-module-level-mutable scan enforces the shape).
//
// The bus holds no event queue. Every producer publication folds synchronously
// into node state, so EXST-7's "throttled or counter-collapsed … rather than
// queued unboundedly" is discharged structurally: a hot `loop-iter` or child
// stream overwrites `currentEffect` and bumps counters at constant cost, and
// the EXST-6 coalescing tick IS the throttle (EXST-4's MAY).
//
// Spec: docs/spec_topics/execution-status.md EXST-2, EXST-3, EXST-6, EXST-7,
// EXST-9.

import type {
  ChildActivity,
  ExecutionStatusBus,
  ExecutionStatusBusDeps,
  ExecutionStatusSnapshot,
  InvocationMode,
  InvocationNodeSnapshot,
  LaneSetSnapshot,
  ParForLaneSetHandle,
  ProgressVerbosity,
  RunningLane,
  StatusSink,
  ViewShape,
} from "./types";
import {
  DONE_LINGER_MS,
  MAX_LANE_SET_DEPTH,
  MAX_RUNNING_LANES_TRACKED,
  MAX_TRACKED_INVOCATIONS,
  NAME_CLAMP_CHARS,
  STATUS_TICK_MS,
} from "./types";
import type { Clock, TimerHandle } from "../../seams/clock";
import type { CheckpointKind, CheckpointSite } from "../../seams/checkpoint";
import type { ChildTapEvent } from "./child-tap";

/** A no-op handle: returned when the owning node is untracked (EXST-7). */
const NOOP_LANE_SET_HANDLE: ParForLaneSetHandle = Object.freeze({
  claim(): void {},
  settle(): void {},
  close(): void {},
});

/** Mutable per-lane-set state. `running` is claim-ordered by Map insertion. */
interface LaneSetState {
  readonly total: number;
  readonly width: number;
  queued: number;
  done: number;
  err: number;
  readonly running: Map<number, number>;
}

/** Mutable per-invocation node state (the snapshot is built from it on tick). */
interface NodeState {
  readonly invocationId: string;
  readonly theta: string;
  mode: InvocationMode | undefined;
  parentInvocationId: string | undefined;
  readonly startedAtMs: number;
  effectKind: CheckpointKind | undefined;
  effectSite: CheckpointSite | undefined;
  effectSinceMs: number;
  checkpoints: number;
  loopIters: number;
  /** Open lane sets, outermost first; the deepest one renders (F6). */
  readonly laneSets: LaneSetState[];
  childTurns: number;
  childToolExecs: number;
  childLastToolName: string | undefined;
  childLastEventAtMs: number;
  childSeen: boolean;
  endedAtMs: number | undefined;
}

/** Clamp a rendered identifier at ingest (EXST-7 memory bound). */
function clampName(name: string): string {
  return name.length <= NAME_CLAMP_CHARS ? name : name.slice(0, NAME_CLAMP_CHARS);
}

class ExecutionStatusBusImpl implements ExecutionStatusBus {
  readonly #clock: Clock;
  readonly #sinks: readonly StatusSink[];
  /** EXST-8/9: a sink that threw is permanently disabled for this instance. */
  readonly #disabledSinks = new Set<StatusSink>();
  /** Insertion-ordered live nodes (EXST-3(b)); `Map` preserves that order. */
  readonly #nodes = new Map<string, NodeState>();
  /** Ids refused by the node cap, kept so their `invocationEnded` decrements. */
  readonly #untrackedIds = new Set<string>();
  #untracked = 0;
  #verbosity: ProgressVerbosity = "names";
  #view: ViewShape = "tree";
  #dirty = false;
  #disposed = false;
  #pending: TimerHandle | undefined;
  /**
   * EXST-6: the coalescing deadline is anchored at the LAST COMPLETED RENDER,
   * so drop-and-reschedule recomputes the same absolute deadline and sustained
   * dirt renders once per interval instead of starving. Seeded at construction
   * time (not `-Infinity`) so the very first publication waits one full
   * interval rather than rendering inline on a zero-delay timer.
   */
  #lastRenderAtMs: number;

  constructor(deps: ExecutionStatusBusDeps) {
    this.#clock = deps.clock;
    this.#sinks = deps.sinks;
    this.#lastRenderAtMs = deps.clock.now();
  }

  invocationStarted(invocationId: string, theta: string): void {
    try {
      if (this.#disposed || this.#nodes.has(invocationId)) {
        return;
      }
      if (this.#nodes.size >= MAX_TRACKED_INVOCATIONS) {
        // EXST-7: counted, untracked. The id is remembered (under the same
        // cap) only so its end can decrement the counter.
        this.#untracked += 1;
        if (this.#untrackedIds.size < MAX_TRACKED_INVOCATIONS) {
          this.#untrackedIds.add(invocationId);
        }
        this.#markDirty();
        return;
      }
      this.#nodes.set(invocationId, {
        invocationId,
        theta: clampName(theta),
        mode: undefined,
        parentInvocationId: undefined,
        startedAtMs: this.#clock.now(),
        effectKind: undefined,
        effectSite: undefined,
        effectSinceMs: 0,
        checkpoints: 0,
        loopIters: 0,
        laneSets: [],
        childTurns: 0,
        childToolExecs: 0,
        childLastToolName: undefined,
        childLastEventAtMs: 0,
        childSeen: false,
        endedAtMs: undefined,
      });
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
      // EXST-9: an internal fold error drops this publication only.
    }
  }

  invocationBound(
    invocationId: string,
    info: { readonly mode: InvocationMode; readonly parentInvocationId?: string },
  ): void {
    try {
      const node = this.#nodes.get(invocationId);
      if (this.#disposed || node === undefined) {
        return;
      }
      node.mode = info.mode;
      node.parentInvocationId = info.parentInvocationId;
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    }
  }

  invocationEnded(invocationId: string): void {
    try {
      if (this.#disposed) {
        return;
      }
      if (this.#untrackedIds.delete(invocationId)) {
        this.#untracked = Math.max(0, this.#untracked - 1);
        this.#markDirty();
        return;
      }
      const node = this.#nodes.get(invocationId);
      if (node === undefined || node.endedAtMs !== undefined) {
        return;
      }
      // EXST-7: the node lingers for the done-flash and is evicted by the tick.
      // Unsettled lanes are dropped with it (whole-theta cancel — CTRL-5).
      node.endedAtMs = this.#clock.now();
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    }
  }

  checkpointBefore(invocationId: string, kind: CheckpointKind, site: CheckpointSite): void {
    try {
      const node = this.#nodes.get(invocationId);
      if (this.#disposed || node === undefined || node.endedAtMs !== undefined) {
        return;
      }
      // Constant work: the effect is overwritten in place (EXST-7's
      // counter-collapse), never appended to a queue.
      node.effectKind = kind;
      node.effectSite = site;
      node.effectSinceMs = this.#clock.now();
      node.checkpoints += 1;
      if (kind === "loop-iter") {
        node.loopIters += 1;
      }
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    }
  }

  openLaneSet(invocationId: string, total: number, width: number): ParForLaneSetHandle {
    try {
      const node = this.#nodes.get(invocationId);
      if (this.#disposed || node === undefined || node.endedAtMs !== undefined) {
        return NOOP_LANE_SET_HANDLE;
      }
      if (node.laneSets.length >= MAX_LANE_SET_DEPTH) {
        // EXST-7 / F6: beyond the tracked nesting depth the set counter-collapses
        // into the deepest tracked set — its claims/settles still move counters,
        // but it never becomes its own visible set.
        const deepest = node.laneSets[node.laneSets.length - 1];
        return deepest === undefined
          ? NOOP_LANE_SET_HANDLE
          : this.#laneHandle(node, deepest, false);
      }
      const set: LaneSetState = {
        total,
        width,
        queued: total,
        done: 0,
        err: 0,
        running: new Map<number, number>(),
      };
      node.laneSets.push(set);
      this.#markDirty();
      return this.#laneHandle(node, set, true);
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
      return NOOP_LANE_SET_HANDLE;
    }
  }

  childEvent(invocationId: string, event: ChildTapEvent): void {
    try {
      const node = this.#nodes.get(invocationId);
      if (this.#disposed || node === undefined || node.endedAtMs !== undefined) {
        return;
      }
      // EXST-5 / EXST-12: only the bounded class-1 projection is folded — the
      // tap hands nothing else across the boundary.
      switch (event.type) {
        case "turn_start":
          node.childTurns += 1;
          break;
        case "tool_execution_start":
          node.childToolExecs += 1;
          node.childLastToolName = clampName(event.toolName);
          break;
        default:
          break;
      }
      node.childSeen = true;
      node.childLastEventAtMs = this.#clock.now();
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    }
  }

  setVerbosity(v: ProgressVerbosity): void {
    try {
      if (v === this.#verbosity) {
        return;
      }
      this.#verbosity = v;
      if (v === "off") {
        // EXST-10: under `off` no execution-status sink renders at all — drop
        // the pending tick, clear the surfaces once, stop scheduling. Producer
        // publications still fold state harmlessly.
        this.#cancelPending();
        this.#clearSinks();
        return;
      }
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    }
  }

  setViewShape(v: ViewShape): void {
    try {
      this.#view = v;
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    }
  }

  viewShape(): ViewShape {
    return this.#view;
  }

  snapshot(): ExecutionStatusSnapshot {
    return this.#snapshot();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#cancelPending();
    this.#clearSinks();
  }

  // -- internals ------------------------------------------------------------

  /** Build the lane handle bound to `set`; `owned` sets may close themselves. */
  #laneHandle(node: NodeState, set: LaneSetState, owned: boolean): ParForLaneSetHandle {
    return {
      claim: (index: number): void => {
        try {
          if (set.queued > 0) {
            set.queued -= 1;
          }
          // EXST-7: beyond the tracked-running cap the lane still moves the
          // counters, it just does not occupy a slot in the rendered array.
          if (set.running.size < MAX_RUNNING_LANES_TRACKED) {
            set.running.set(index, this.#clock.now());
          }
          this.#markDirty();
        } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
        }
      },
      settle: (index: number, outcome: "done" | "err"): void => {
        try {
          set.running.delete(index);
          if (outcome === "done") {
            set.done += 1;
          } else {
            set.err += 1;
          }
          this.#markDirty();
        } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
        }
      },
      close: (): void => {
        try {
          if (!owned) {
            return;
          }
          const at = node.laneSets.indexOf(set);
          if (at >= 0) {
            node.laneSets.splice(at, 1);
          }
          this.#markDirty();
        } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
        }
      },
    };
  }

  #markDirty(): void {
    this.#dirty = true;
    if (this.#disposed || this.#verbosity === "off") {
      return;
    }
    this.#schedule();
  }

  /**
   * EXST-6 drop-and-reschedule: clear the pending handle and re-arm against the
   * SAME absolute deadline (`lastRender + STATUS_TICK_MS`). Timers ride the
   * injected `Clock` seam (PIC-12) — never a bare global.
   */
  #schedule(): void {
    this.#cancelPending();
    const delay = Math.max(0, this.#lastRenderAtMs + STATUS_TICK_MS - this.#clock.now());
    this.#pending = this.#clock.setTimeout((): void => {
      this.#renderTick();
    }, delay);
  }

  #cancelPending(): void {
    if (this.#pending !== undefined) {
      this.#clock.clearTimeout(this.#pending);
      this.#pending = undefined;
    }
  }

  #renderTick(): void {
    this.#pending = undefined;
    if (this.#disposed) {
      return;
    }
    const now = this.#clock.now();
    // Eviction is dirt of its own: the done-flash linger expires without any
    // new publication, and the surfaces must still lose the ended node.
    if (this.#evictExpired(now)) {
      this.#dirty = true;
    }
    if (!this.#dirty) {
      return; // no-dirty-no-render (EXST-6)
    }
    this.#dirty = false;
    this.#lastRenderAtMs = now;
    const snapshot = this.#snapshot();
    const empty = snapshot.nodes.length === 0 && snapshot.untracked === 0;
    for (const sink of this.#sinks) {
      if (this.#disabledSinks.has(sink)) {
        continue;
      }
      try {
        if (empty) {
          sink.clear();
        } else {
          sink.render(snapshot, this.#view, this.#verbosity, now);
        }
      } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
        // EXST-8/9: first hard failure permanently degrades THAT sink for the
        // instance; no diagnostic, siblings keep rendering, the drive is
        // untouched. A fresh `/reload` instance starts un-degraded (EXST-2).
        this.#disabledSinks.add(sink);
      }
    }
    this.#scheduleLingerSweep(now);
  }

  /** Drop every node whose done-flash linger has expired (EXST-7). */
  #evictExpired(now: number): boolean {
    let evicted = false;
    for (const [id, node] of this.#nodes) {
      if (node.endedAtMs !== undefined && now - node.endedAtMs >= DONE_LINGER_MS) {
        this.#nodes.delete(id);
        evicted = true;
      }
    }
    return evicted;
  }

  /**
   * A lingering ended node needs ONE follow-up tick to be evicted even when no
   * further publication arrives (EXST-7's bounded linger).
   */
  #scheduleLingerSweep(now: number): void {
    if (this.#pending !== undefined || this.#disposed || this.#verbosity === "off") {
      return;
    }
    let earliest: number | undefined;
    for (const node of this.#nodes.values()) {
      if (node.endedAtMs === undefined) {
        continue;
      }
      const at = node.endedAtMs + DONE_LINGER_MS;
      if (earliest === undefined || at < earliest) {
        earliest = at;
      }
    }
    if (earliest === undefined) {
      return;
    }
    const delay = Math.max(STATUS_TICK_MS, earliest - now);
    this.#pending = this.#clock.setTimeout((): void => {
      this.#renderTick();
    }, delay);
  }

  #clearSinks(): void {
    for (const sink of this.#sinks) {
      if (this.#disabledSinks.has(sink)) {
        continue;
      }
      try {
        sink.clear();
      } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
        this.#disabledSinks.add(sink);
      }
    }
  }

  #snapshot(): ExecutionStatusSnapshot {
    const nodes: InvocationNodeSnapshot[] = [];
    for (const node of this.#nodes.values()) {
      nodes.push(snapshotOfNode(node));
    }
    return { nodes, untracked: this.#untracked };
  }
}

function snapshotOfNode(node: NodeState): InvocationNodeSnapshot {
  const lanes = node.laneSets[node.laneSets.length - 1];
  const childActivity: ChildActivity | undefined = node.childSeen
    ? {
        turns: node.childTurns,
        toolExecs: node.childToolExecs,
        ...(node.childLastToolName !== undefined
          ? { lastToolName: node.childLastToolName }
          : {}),
        lastEventAtMs: node.childLastEventAtMs,
      }
    : undefined;
  return {
    invocationId: node.invocationId,
    theta: node.theta,
    ...(node.mode !== undefined ? { mode: node.mode } : {}),
    ...(node.parentInvocationId !== undefined
      ? { parentInvocationId: node.parentInvocationId }
      : {}),
    startedAtMs: node.startedAtMs,
    ...(node.effectKind !== undefined && node.effectSite !== undefined
      ? {
          currentEffect: {
            kind: node.effectKind,
            site: node.effectSite,
            sinceMs: node.effectSinceMs,
          },
        }
      : {}),
    counters: { checkpoints: node.checkpoints, loopIters: node.loopIters },
    ...(lanes !== undefined ? { lanes: snapshotOfLaneSet(lanes) } : {}),
    ...(childActivity !== undefined ? { childActivity } : {}),
    ...(node.endedAtMs !== undefined ? { endedAtMs: node.endedAtMs } : {}),
  };
}

function snapshotOfLaneSet(set: LaneSetState): LaneSetSnapshot {
  const running: RunningLane[] = [];
  for (const [index, startedAtMs] of set.running) {
    running.push({ index, startedAtMs });
  }
  return {
    total: set.total,
    width: set.width,
    queued: set.queued,
    done: set.done,
    err: set.err,
    running,
  };
}

export function createExecutionStatusBus(deps: ExecutionStatusBusDeps): ExecutionStatusBus {
  return new ExecutionStatusBusImpl(deps);
}
