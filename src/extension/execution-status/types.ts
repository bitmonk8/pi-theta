// RFC 0010 (execution-status.md, EXST-1..12) — the shared, closed type surface
// for the execution-status bus, its producer payloads, sink contract, and the
// frozen caps/tuning constants. No behaviour lives here; `bus.ts`,
// `checkpoint-decorator.ts`, and `child-tap.ts` are the behavioural leaves.
//
// Spec: docs/spec_topics/execution-status.md (EXST-1..12).

import type { CheckpointKind, CheckpointSite } from "../../seams/checkpoint";
import type { Clock } from "../../seams/clock";
import type { ChildTapEvent } from "./child-tap";

// ---------------------------------------------------------------------------
// Caps constants (frozen; EXST-7).
// ---------------------------------------------------------------------------

/** Minimum inter-render interval (EXST-6). Tuning value, not observable contract. */
export const STATUS_TICK_MS = 200;
/** Global tracked-node cap incl. nested callees (EXST-7). Rationale: INV-4 pins
 *  invoke depth at 32, so one full-depth chain always fits; concurrent top-level
 *  dispatches are humanly few. Overflow: counted, untracked. */
export const MAX_TRACKED_INVOCATIONS = 32;
/** Per-lane-set tracked RUNNING lanes. Rationale: PAR_FOR_THROTTLE = 64
 *  (statement-executor.ts:1731) hard-bounds concurrency, so this is structural;
 *  the constant is a defensive clamp against a defective claim storm. */
export const MAX_RUNNING_LANES_TRACKED = 64;
/** Open-lane-set stack depth per invocation (nested par-for). Deeper sets
 *  counter-collapse into the deepest tracked set. */
export const MAX_LANE_SET_DEPTH = 4;
/** Done-flash linger before node eviction (EXST-7 "short linger"). 10 ticks. */
export const DONE_LINGER_MS = 2000;
/** Clamp applied to every rendered identifier (tool names, theta names). */
export const NAME_CLAMP_CHARS = 64;
/** Hard clamp on the setStatus / setWorkingMessage strings. */
export const FOOTER_CLAMP_CHARS = 200;
/** Widget height budget (EXST-8 — normative 6, not tuning). */
export const WIDGET_HEIGHT_LINES = 6;
/** Tap per-line size gate (EXST-5). */
export const TAP_LINE_MAX_BYTES = 32768;

// ---------------------------------------------------------------------------
// L3 `theta_progress` constants (execution-status.md EXST-13/14/15;
// pi-integration-contract/subagent.md PIC-74). Frozen; the VALUES are
// normative per EXST-14/PIC-74, not implementer tuning.
// ---------------------------------------------------------------------------

/** EXST-13: the tool name, the wire key, and the grep token (RFC 0010 decision 3). */
export const THETA_PROGRESS_TOOL_NAME = "theta_progress";
/** PIC-74 reserved wire key — deliberately == the tool name. */
export const PROGRESS_WIRE_KEY = "theta_progress";
/** PIC-74 `v` literal. */
export const PROGRESS_WIRE_VERSION = 1;
/** EXST-14 length clamps (mirror FOOTER_CLAMP_CHARS / NAME_CLAMP_CHARS magnitudes). */
export const PROGRESS_MESSAGE_CLAMP_CHARS = 200;
export const PROGRESS_SCOPE_CLAMP_CHARS = 64;
/** EXST-14 acceptance interval (== STATUS_TICK_MS). Counted-but-dropped. */
export const PROGRESS_MIN_INTERVAL_MS = 200;
/** PIC-74 wire line byte cap (UTF-8). Defensive only — post-clamp lines fit well under it. */
export const PROGRESS_WIRE_MAX_LINE_BYTES = 4096;

// ---------------------------------------------------------------------------
// Model snapshots (immutable, handed to sinks; class-3-free by construction).
// ---------------------------------------------------------------------------

export type ProgressVerbosity = "off" | "counts" | "names"; // EXST-10
export type ViewShape = "off" | "min" | "tree"; // EXST-11
export type InvocationMode = "prompt" | "subagent" | "subagent-fn";
export type LaneState = "queued" | "running" | "done" | "err"; // EXST-3(c) closed set

export interface EffectRef {
  readonly kind: CheckpointKind; // src/seams/checkpoint.ts:8-14 (five kinds)
  readonly site: CheckpointSite; // {file,line,column} — class-1 source site
  readonly sinceMs: number; // clock.now() at publish
}

export interface ChildActivity {
  // RFC bounded fields — exactly these four.
  readonly turns: number;
  readonly toolExecs: number;
  readonly lastToolName?: string; // clamped NAME_CLAMP_CHARS at bus ingest
  readonly lastEventAtMs: number;
}

/**
 * L3 (EXST-13/14/15, PIC-74) — the post-clamp class-2 payload: the bus's
 * `authorMessage` currency, the milestone entry payload, and the tap-publish
 * currency all share this shape.
 */
export interface ProgressAuthorMessage {
  readonly message: string; // stripped + clamped to PROGRESS_MESSAGE_CLAMP_CHARS
  readonly scope?: string; // stripped + clamped to PROGRESS_SCOPE_CLAMP_CHARS
  readonly done?: number; // integer, author-supplied, rendered verbatim
  readonly total?: number;
  readonly dropped?: number; // counted-but-dropped carry; omitted/absent when 0
}

/** PIC-71 milestone entry payload: `{ milestone: ProgressMilestone }`. */
export interface ProgressMilestone extends ProgressAuthorMessage {
  readonly theta?: string; // best-effort attribution (registry entry fields)
  readonly invocation_id?: string; // both present or both absent — never invented
}

export interface RunningLane {
  readonly index: number;
  readonly startedAtMs: number;
}

export interface LaneSetSnapshot {
  readonly total: number; // n (iterand snapshot length)
  readonly width: number; // min(resolved width, n) — post-CTRL-2 clamp
  readonly queued: number;
  readonly done: number;
  readonly err: number;
  readonly running: readonly RunningLane[]; // <= MAX_RUNNING_LANES_TRACKED, claim order
}

export interface InvocationNodeSnapshot {
  readonly invocationId: string; // EXST-3: node identity = the registry entry's invocationId
  readonly theta: string; // bare slash name (registry entry field)
  readonly mode?: InvocationMode; // undefined between started and bound
  readonly parentInvocationId?: string;
  readonly startedAtMs: number;
  readonly currentEffect?: EffectRef;
  readonly counters: { readonly checkpoints: number; readonly loopIters: number };
  readonly lanes?: LaneSetSnapshot; // deepest open tracked lane set
  readonly childActivity?: ChildActivity; // present on subagent nodes with a tapped child
  readonly authorMessage?: ProgressAuthorMessage; // L3: newest class-2 payload on this node
  readonly endedAtMs?: number; // set => lingering until eviction
}

export interface ExecutionStatusSnapshot {
  readonly nodes: readonly InvocationNodeSnapshot[]; // insertion order
  readonly untracked: number; // nodes refused by MAX_TRACKED_INVOCATIONS
  readonly unattributedAuthorMessage?: ProgressAuthorMessage; // L3: unattributed class-2 payload
}

// ---------------------------------------------------------------------------
// The bus interface (par. 2.3).
// ---------------------------------------------------------------------------

export interface ParForLaneSetHandle {
  // returned even when untracked (no-op handle)
  claim(index: number): void; // queued -> running
  settle(index: number, outcome: "done" | "err"): void; // running -> done|err
  close(): void; // loop exit; an unclosed set drops with the node
}

export interface ParForLaneHooks {
  open(total: number, width: number): ParForLaneSetHandle;
}

export interface StatusSink {
  readonly id: "footer" | "widget";
  render(
    snapshot: ExecutionStatusSnapshot,
    view: ViewShape,
    verbosity: ProgressVerbosity,
    nowMs: number,
  ): void; // MAY throw -> bus disables it permanently
  clear(): void; // MUST NOT throw (internally guarded)
}

export interface ExecutionStatusBusDeps {
  readonly clock: Clock; // the SHARED per-instance Clock (PIC-12) — root.clock
  readonly sinks: readonly StatusSink[]; // presence-probed sinks only (par. 5.4)
}

export interface ExecutionStatusBus {
  // -- producers (ALL synchronous, ALL never-throw: every body is wrapped; an
  //    internal error drops that publication — EXST-9) --
  invocationStarted(invocationId: string, theta: string): void;
  invocationBound(
    invocationId: string,
    info: { readonly mode: InvocationMode; readonly parentInvocationId?: string },
  ): void;
  invocationEnded(invocationId: string): void;
  checkpointBefore(invocationId: string, kind: CheckpointKind, site: CheckpointSite): void;
  openLaneSet(invocationId: string, total: number, width: number): ParForLaneSetHandle;
  childEvent(invocationId: string, event: ChildTapEvent): void;
  /** L3 (EXST-14): one class-2 author-message publication. `invocationId`
   *  undefined => the unattributed slot (best-effort attribution, never invented). */
  authorMessage(invocationId: string | undefined, payload: ProgressAuthorMessage): void;
  // -- configuration / view (EXST-10 / EXST-11) --
  setVerbosity(v: ProgressVerbosity): void; // called per compose pass
  /** L3 (EXST-10/14): pure read of the current ceiling — the tool's off-gate. */
  verbosity(): ProgressVerbosity;
  setViewShape(v: ViewShape): void; // called by /theta-status; marks dirty
  viewShape(): ViewShape;
  // -- render machinery --
  snapshot(): ExecutionStatusSnapshot; // pure read; sinks and tests
  dispose(): void; // idempotent; clears pending tick + sinks
}
