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
  ChildTapEvent,
  ExecutionStatusBus,
  HeatEntrySnapshot,
  HeatLineKind,
  HeatSnapshot,
  ExecutionStatusBusDeps,
  ExecutionStatusSnapshot,
  InvocationMode,
  InvocationNodeSnapshot,
  LaneSetSnapshot,
  ParForLaneSetHandle,
  ProgressAuthorMessage,
  ProgressVerbosity,
  RunningLane,
  StatusSink,
  ViewShape,
} from "./types";
import {
  DONE_LINGER_MS,
  HEAT_INFLIGHT_CAPACITY,
  HEAT_RING_CAPACITY,
  MAX_LANE_SET_DEPTH,
  MAX_RUNNING_LANES_TRACKED,
  MAX_TRACKED_INVOCATIONS,
  NAME_CLAMP_CHARS,
  STATUS_TICK_MS,
} from "./types";
import { clampAuthorMessage } from "./progress-tool";
import { HEAT_FADE_MS } from "./render/heat";
import type { Clock, TimerHandle } from "../../seams/clock";
import type { CheckpointKind, CheckpointSite } from "../../seams/checkpoint";
import { isSpanTraceKind, type TraceKind, type TraceSettle } from "../../seams/trace";

/** A no-op handle: returned when the owning node is untracked (EXST-7). */
const NOOP_LANE_SET_HANDLE: ParForLaneSetHandle = Object.freeze({
  claim(): void {},
  settle(): void {},
  close(): void {},
});

/** Mutable per-heat-entry state (RFC 0015 D2); snapshot copies are built per tick. */
interface HeatEntryState {
  readonly file: string;
  readonly line: number;
  lastHitMs: number;
  hits: number;
  dwellMs: number;
  kind: HeatLineKind;
}

/** The ring's composite `(file, line)` key. `\u0000` cannot occur in a path. */
function heatKey(file: string, line: number): string {
  return `${file}\u0000${line}`;
}

/** RFC 0015 (D7): one open effect span — dispatch recorded, settle pending. */
interface InflightSpan {
  readonly file: string;
  readonly line: number;
  readonly kind: HeatLineKind;
  readonly openedAtMs: number;
  /** Set by whichever close fires first (settle callback / capacity eviction /
   *  node end) so every later close is a no-op — the settle callback the
   *  executor holds may legitimately arrive after a forced close. */
  settled: boolean;
}

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
  /** RFC 0015 (D2): the heat ring — recency-ordered by Map insertion (a re-hit
   *  re-inserts its key), so the FIRST key is always the LRU eviction victim. */
  readonly heat: Map<string, HeatEntryState>;
  /** RFC 0015 (D7): the OPEN effect spans, insertion-ordered by dispatch time
   *  (Map order), keyed by a per-node monotonic span id — the clamp SET the
   *  operator ruling generalises to (every in-flight line renders full-heat
   *  until ITS settle) and the real-dwell accumulator's open half. Bounded at
   *  `HEAT_INFLIGHT_CAPACITY`: the oldest span force-settles on overflow. */
  readonly inflight: Map<number, InflightSpan>;
  /** Monotonic id source for `inflight` keys (per node — no global state). */
  nextSpanId: number;
  /** RFC 0015 (D2): the newest `"invoke"`-kind trace site on THIS node — the
   *  residence-keyed launch-site source for children bound to it. */
  lastInvokeSite: CheckpointSite | undefined;
  /** RFC 0015 (D2): stamped at `invocationBound` from the parent's state. */
  launchSite: CheckpointSite | undefined;
  /** RFC 0015 (D3): cumulative children bound under this node — the decision-7
   *  summary's "children spawned" source. A count of child NODES at drive end
   *  would undercount (ended children evict after `DONE_LINGER_MS`), so the
   *  parent accumulates at each child's `invocationBound` instead. */
  childrenSpawned: number;
  /** L3 (EXST-14): the NEWEST class-2 payload on this node; replaced, never queued. */
  authorMessage: ProgressAuthorMessage | undefined;
  /** RFC 0012 §7: the rendered `live in <backend> <handle>` reference, clamped at ingest. */
  placement: string | undefined;
  endedAtMs: number | undefined;
}

/** Clamp a rendered identifier at ingest (EXST-7 memory bound). */
function clampName(name: string): string {
  return name.length <= NAME_CLAMP_CHARS ? name : name.slice(0, NAME_CLAMP_CHARS);
}

/**
 * L3 defence in depth (EXST-7): the emitter clamps and the tap re-clamps, and
 * the bus clamps ONCE MORE at fold because a stored payload is instance
 * state — the EXST-7 memory bound must not depend on an upstream having done
 * its job.
 */
function clampFoldedAuthorMessage(p: ProgressAuthorMessage): ProgressAuthorMessage {
  return clampAuthorMessage(p);
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
  /** L3 (EXST-14): the newest class-2 payload attributed to no live node. */
  #unattributedAuthorMessage: ProgressAuthorMessage | undefined;
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
        heat: new Map<string, HeatEntryState>(),
        inflight: new Map<number, InflightSpan>(),
        nextSpanId: 0,
        lastInvokeSite: undefined,
        launchSite: undefined,
        childrenSpawned: 0,
        authorMessage: undefined,
        placement: undefined,
        endedAtMs: undefined,
      });
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
      // EXST-9: an internal fold error drops this publication only.
    }
  }

  invocationBound(
    invocationId: string,
    info: {
      readonly mode: InvocationMode;
      readonly parentInvocationId?: string;
      readonly launchSite?: CheckpointSite;
    },
  ): void {
    try {
      const node = this.#nodes.get(invocationId);
      if (this.#disposed || node === undefined) {
        return;
      }
      node.mode = info.mode;
      node.parentInvocationId = info.parentInvocationId;
      // RFC 0015 (D2→D7) launch-site attribution — two sources, in priority
      // order: (1) a site carried on the bind through the SPAWN PATH itself
      // always wins (race-free under par-for, residence-keyed by the
      // executor's own stamp); (2) derived fallback for non-fn modes: read
      // (never join) the parent's bus-resident state AT BIND TIME — its
      // newest `"invoke"`-kind trace site, else its currentEffect site when
      // that effect is an `invoke` (covers compositions where the trace seam
      // is unwired). The fallback is best-effort under par-for: a sibling
      // lane's invoke between this child's launch and its bind can overwrite
      // either source, so it can name a concurrent sibling's launch line —
      // accepted and bounded to same-parent concurrent invoke launches.
      // `subagent-fn` spawns publish no invoke kind at all, so a derived site
      // would be a STALE earlier launch, not a race — an fn bind without a
      // carried site gets no attribution (absent, never wrong).
      if (info.parentInvocationId !== undefined) {
        const parent = this.#nodes.get(info.parentInvocationId);
        if (parent !== undefined) {
          // RFC 0015 (D3): EVERY bound child counts toward the parent's
          // cumulative spawn total, `subagent-fn` included — the mode gate
          // below scopes only launch-SITE attribution, not existence.
          parent.childrenSpawned += 1;
          // RFC 0015 (D7): the spawn-path site wins when the bind carries one
          // — it travelled with the spawn request itself, so it is race-free
          // under par-for and residence-keyed by the executor's own stamp.
          // It is also the ONLY source for `subagent-fn` binds (fn spawns
          // publish no invoke-kind trace — the D2 mode gate below stands for
          // the derived fallback, which would be a stale earlier invoke).
          if (info.launchSite !== undefined) {
            node.launchSite = info.launchSite;
          } else if (info.mode !== "subagent-fn") {
            node.launchSite =
              parent.lastInvokeSite ??
              (parent.effectKind === "invoke" ? parent.effectSite : undefined);
          }
        }
      }
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    }
  }

  invocationPlaced(
    invocationId: string,
    placement: { readonly backend: string; readonly handle: string },
  ): void {
    try {
      const node = this.#nodes.get(invocationId);
      if (this.#disposed || node === undefined || node.endedAtMs !== undefined) {
        return;
      }
      // Both halves are backend-supplied display strings (a pane id, a window
      // title): clamped like every other ingested identifier (EXST-7).
      node.placement = `live in ${clampName(placement.backend)} ${clampName(placement.handle)}`;
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
      const now = this.#clock.now();
      node.endedAtMs = now;
      // RFC 0015 (D7): node end force-closes every still-open effect span —
      // whatever was in flight settled (or died) with the drive, and trace()
      // drops publications on ended nodes so no later settle can land. Each
      // close records the span's real dwell (a drive whose FINAL statement is
      // its dominant long effect keeps that tail) and refreshes the entry's
      // lastHitMs so the fade starts at end (= settle, per the operator
      // ruling's "then fades normally"), and the clamp set empties — a
      // lingering node's card renders no full-heat line.
      for (const span of node.inflight.values()) {
        this.#closeSpan(node, span, now);
      }
      node.inflight.clear();
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

  trace(
    invocationId: string | undefined,
    site: CheckpointSite,
    kind: TraceKind,
  ): TraceSettle | undefined {
    try {
      if (this.#disposed || invocationId === undefined) {
        return undefined;
      }
      const node = this.#nodes.get(invocationId);
      if (node === undefined || node.endedAtMs !== undefined) {
        return undefined;
      }
      const now = this.#clock.now();
      this.#upsertHeatEntry(node, site.file, site.line, kind, now);
      if (!isSpanTraceKind(kind)) {
        this.#markDirty();
        return undefined;
      }
      if (kind === "invoke") {
        node.lastInvokeSite = site;
      }
      // RFC 0015 (D7): open the effect span — its site joins the clamp set
      // (`clampedLines`) and its dispatch→settle length is the line's REAL
      // dwell. Bounded: at capacity the OLDEST open span force-settles now
      // (dwell closed, clamp released, fade starts) — a defective seam that
      // never settles cannot grow this map (EXST-7 posture).
      if (node.inflight.size >= HEAT_INFLIGHT_CAPACITY) {
        const eldestKey = node.inflight.keys().next().value;
        if (eldestKey !== undefined) {
          this.#closeSpan(node, node.inflight.get(eldestKey)!, now);
          node.inflight.delete(eldestKey);
        }
      }
      const spanId = node.nextSpanId;
      node.nextSpanId += 1;
      const span: InflightSpan = { file: site.file, line: site.line, kind, openedAtMs: now, settled: false };
      node.inflight.set(spanId, span);
      this.#markDirty();
      // The settle callback the executor holds across the awaited effect.
      // Idempotent (the `settled` latch): a forced close (capacity eviction,
      // node end) may have landed first, and dispose() makes it inert.
      return (): void => {
        try {
          if (this.#disposed || span.settled) {
            return;
          }
          this.#closeSpan(node, span, this.#clock.now());
          node.inflight.delete(spanId);
          this.#markDirty();
        } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
        }
      };
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
      return undefined;
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
        const deepest = node.laneSets[node.laneSets.length - 1]!;
        return this.#laneHandle(node, deepest, false);
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
        case "theta_progress":
          // EXST-15: a wire-ingested self-report folds onto the TAPPED
          // child's node and renders on the transient sinks only — no
          // milestone entry is ever appended for it (Erratum D: untrusted
          // wire data stays off the durable transcript).
          node.authorMessage = clampFoldedAuthorMessage(event.payload);
          break;
        case "tool_execution_end":
        case "agent_end":
        case "heartbeat":
          // Liveness only; the common block below records the event.
          break;
        default: {
          const exhaustive: never = event;
          void exhaustive;
          break;
        }
      }
      node.childSeen = true;
      node.childLastEventAtMs = this.#clock.now();
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    }
  }

  authorMessage(invocationId: string | undefined, payload: ProgressAuthorMessage): void {
    try {
      if (this.#disposed) {
        return;
      }
      const clamped = clampFoldedAuthorMessage(payload);
      const node = invocationId === undefined ? undefined : this.#nodes.get(invocationId);
      if (node === undefined || node.endedAtMs !== undefined) {
        // EXST-14 "never invented": an id the bus does not track (or a node
        // already lingering) lands in the unattributed slot rather than being
        // stamped onto some other node.
        this.#unattributedAuthorMessage = clamped;
      } else {
        node.authorMessage = clamped;
      }
      this.#markDirty();
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    }
  }

  verbosity(): ProgressVerbosity {
    return this.#verbosity;
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

  tracks(invocationId: string): boolean {
    // RFC 0015 (D7, PTQ-1256): the renderer's presence gate — a Map probe, so
    // the entry path stops building (and discarding) a full deep-copy snapshot.
    return !this.#disposed && this.#nodes.has(invocationId);
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

  /** RFC 0015 (D2/D7): the ring upsert every trace publication folds — LRU
   *  re-insert on a re-hit, capacity eviction on a fresh key. No dwell is
   *  recorded here: dwell is span-settle material (`#closeSpan`). */
  #upsertHeatEntry(
    node: NodeState,
    file: string,
    line: number,
    kind: HeatLineKind,
    now: number,
  ): HeatEntryState {
    const key = heatKey(file, line);
    const existing = node.heat.get(key);
    if (existing !== undefined) {
      // Re-insert so Map iteration order stays LRU→MRU (constant-cost upkeep).
      node.heat.delete(key);
      existing.lastHitMs = now;
      existing.hits += 1;
      // `"stmt"` never downgrades a recorded effect kind: an effect line's
      // per-dispatch `"stmt"` publication precedes its effect-kind twin, and
      // the line's gutter identity is the effect, not the dispatch.
      if (kind !== "stmt" || existing.kind === "stmt") {
        existing.kind = kind;
      }
      node.heat.set(key, existing);
      return existing;
    }
    if (node.heat.size >= HEAT_RING_CAPACITY) {
      const oldest = node.heat.keys().next().value;
      if (oldest !== undefined) {
        node.heat.delete(oldest);
      }
    }
    const fresh: HeatEntryState = { file, line, lastHitMs: now, hits: 1, dwellMs: 0, kind };
    node.heat.set(key, fresh);
    return fresh;
  }

  /**
   * RFC 0015 (D7): close one effect span — land its dispatch→settle length as
   * the line's REAL dwell and refresh the entry's lastHitMs so the fade starts
   * at settle (the operator ruling's "then fades normally"; without the
   * refresh a 60 s effect snaps full-heat→α≈0). A settle is NOT a publication:
   * a surviving entry keeps its kind (an older span settling after a newer
   * effect-kind publication on the same line must not revert the gutter —
   * pinned by T-HEAT H19) and its hits (the dispatch already counted). Only
   * when a tight loop smeared the ring past capacity and LRU-evicted the entry
   * mid-span is it restored — hits 1, the span's own kind — so its dwell (the
   * summary's whole point) is never dropped. Marks the span settled; callers
   * own its removal from `inflight`.
   */
  #closeSpan(node: NodeState, span: InflightSpan, now: number): void {
    span.settled = true;
    const key = heatKey(span.file, span.line);
    const existing = node.heat.get(key);
    let entry: HeatEntryState;
    if (existing !== undefined) {
      // Re-insert so Map iteration order stays LRU→MRU; kind and hits untouched.
      node.heat.delete(key);
      existing.lastHitMs = now;
      node.heat.set(key, existing);
      entry = existing;
    } else {
      if (node.heat.size >= HEAT_RING_CAPACITY) {
        const oldest = node.heat.keys().next().value;
        if (oldest !== undefined) {
          node.heat.delete(oldest);
        }
      }
      entry = { file: span.file, line: span.line, lastHitMs: now, hits: 1, dwellMs: 0, kind: span.kind };
      node.heat.set(key, entry);
    }
    entry.dwellMs += now - span.openedAtMs;
  }

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
    // EXST-6 (RFC 0010 Erratum F): while anything is RUNNING, the passage of a
    // render interval is dirt of its own — a running row's age is a function of
    // the current time, so it advances with no publication at all. Without this,
    // a code-only child (the quality loop's `fix-cluster-tree` wrapper drives
    // workers and a gate, taking no turn of its own) publishes nothing for
    // minutes and every rendered age freezes at its first value.
    if (this.#hasRunningWork() || this.#hasFadingHeat(now)) {
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
    this.#scheduleFollowUp(now);
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
   * Whether the surface currently draws anything whose rendering is a function
   * of the CLOCK rather than of the last publication (EXST-6, Erratum F): a
   * node that has not ended — its own age, its lanes' ages, and its tapped
   * child's last-event age all advance on their own. An ended node inside its
   * done-flash linger is NOT running (its row is static and the linger sweep
   * below owns its one remaining tick), and the untracked-invocation counter
   * renders a bare count with no age, so neither keeps the bus awake.
   */
  #hasRunningWork(): boolean {
    for (const node of this.#nodes.values()) {
      if (node.endedAtMs === undefined) {
        return true;
      }
    }
    return false;
  }

  /**
   * RFC 0015 (D5, §Animation): whether any node — lingering ended nodes
   * included — still holds heat younger than the fade window. The run-card
   * sink animates the fade on this same coalesced tick ("while (a) any heat
   * entry is younger than FADE_MS …"), and an ended node's clamp-clear
   * refreshed its entry's `lastHitMs` to the end instant, so the done-flash
   * linger is exactly when this predicate extends ticking beyond
   * `#hasRunningWork` (D2 recorded residual 5: no intermediate linger ticks
   * fired before D5). Running nodes are already covered by `#hasRunningWork`;
   * eviction bounds the extension to `DONE_LINGER_MS` per ended node.
   */
  #hasFadingHeat(now: number): boolean {
    for (const node of this.#nodes.values()) {
      if (node.inflight.size > 0) {
        return true;
      }
      for (const entry of node.heat.values()) {
        if (now - entry.lastHitMs < HEAT_FADE_MS) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Arm the next tick for the work the SURFACE still owes with no publication
   * to trigger it: a running node owes a re-render at the coalescing cadence
   * (EXST-6's age-liveness, Erratum F — re-armed through `#schedule` so the
   * last-render anchoring and the drop-extra-schedule discipline are the same
   * one), and a lingering ended node owes ONE follow-up tick to be evicted
   * (EXST-7's bounded linger). With neither outstanding nothing is scheduled —
   * an idle bus stays render-free rather than paying a perpetual heartbeat.
   */
  #scheduleFollowUp(now: number): void {
    if (this.#pending !== undefined || this.#disposed || this.#verbosity === "off") {
      return;
    }
    if (this.#hasRunningWork() || this.#hasFadingHeat(now)) {
      this.#schedule();
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
    return {
      nodes,
      untracked: this.#untracked,
      ...(this.#unattributedAuthorMessage !== undefined
        ? { unattributedAuthorMessage: this.#unattributedAuthorMessage }
        : {}),
    };
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
    ...(node.authorMessage !== undefined ? { authorMessage: node.authorMessage } : {}),
    ...(node.placement !== undefined ? { placement: node.placement } : {}),
    ...(node.launchSite !== undefined ? { launchSite: node.launchSite } : {}),
    ...(node.childrenSpawned > 0 ? { childrenSpawned: node.childrenSpawned } : {}),
    ...(node.heat.size > 0 ? { heat: snapshotOfHeat(node) } : {}),
    ...(node.endedAtMs !== undefined ? { endedAtMs: node.endedAtMs } : {}),
  };
}

function snapshotOfHeat(node: NodeState): HeatSnapshot {
  const entries: HeatEntrySnapshot[] = [];
  for (const entry of node.heat.values()) {
    entries.push({
      file: entry.file,
      line: entry.line,
      lastHitMs: entry.lastHitMs,
      hits: entry.hits,
      dwellMs: entry.dwellMs,
      kind: entry.kind,
    });
  }
  // RFC 0015 (D7): the clamp SET — distinct in-flight sites, deduplicated
  // (concurrent lanes on one line clamp it once, released when the LAST span
  // settles). Each site sits at its NEWEST open span's position — the
  // delete-then-set keeps Map order per-site-newest, so a re-dispatch on an
  // already-clamped line moves the site to the end and the final element is
  // always the most recent dispatch (the renderer's current-line anchor;
  // pinned by T-HEAT H7d's A-B-A interleaving).
  let clampedLines: { readonly file: string; readonly line: number }[] | undefined;
  if (node.inflight.size > 0) {
    const bySite = new Map<string, { readonly file: string; readonly line: number }>();
    for (const span of node.inflight.values()) {
      const key = heatKey(span.file, span.line);
      bySite.delete(key);
      bySite.set(key, { file: span.file, line: span.line });
    }
    clampedLines = [...bySite.values()];
  }
  return {
    entries,
    ...(clampedLines !== undefined ? { clampedLines } : {}),
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
