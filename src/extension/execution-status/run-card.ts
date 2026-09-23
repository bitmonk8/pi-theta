// RFC 0015 (D3) — the run-card publisher: appends one `theta-run` entry at
// TOP-LEVEL drive start and one gated `theta-run-summary` entry at drive end
// (decision 7 as re-ruled 2026-09-23: the summary is OPT-IN via the
// `theta.runSummary` settings key — default off, nothing appended; when opted
// in, only a drive that ran at least `RUN_SUMMARY_GATE_MS` appends one).
//
// Composition contract: constructed ONLY in the TUI composition (the RFC's
// "Modes and degradation" — `ctx.mode === "tui"`); the print/json/child
// compositions carry no publisher, so their producers append nothing and stay
// byte-identical. The entries are non-LLM-context by the entry channel's own
// construction (the RFC's carrier rationale); the `theta-system-note` channel
// is untouched (D6 owns note hiding). Delivery inherits the entry channel's
// PIC-73 degrade discipline — a dead channel makes every append a silent no-op.

import type { Clock } from "../../seams/clock";
import type { EntryChannelHandle } from "./entry-channel";
import {
  MAX_TRACKED_INVOCATIONS,
  RUN_CARD_ARGS_CLAMP_CHARS,
  RUN_SUMMARY_GATE_MS,
  RUN_SUMMARY_PROFILE_MAX_LINES,
} from "./types";
import type {
  ExecutionStatusBus,
  HeatEntrySnapshot,
  ThetaRunHeatProfileLine,
  ThetaRunOutcome,
} from "./types";

export interface RunCardPublisherDeps {
  /** The factory's entry channel — the appends' only delivery surface. */
  readonly entryChannel: Pick<EntryChannelHandle, "appendRun" | "appendRunSummary">;
  /** The SHARED per-instance Clock (PIC-12): `wallNow` stamps the durable seed,
   *  `now` measures the gate's elapsed time (monotonic — no NTP step can fake
   *  a 30 s drive). */
  readonly clock: Clock;
  /** The instance bus the summary reads counters/children/heat from at drive
   *  end. Optional: absent, the summary carries zero counters and no profile
   *  rather than failing (the RFC's omit-not-fail rule). */
  readonly statusBus?: Pick<ExecutionStatusBus, "snapshot">;
  /**
   * RFC 0015 decision 7 as re-ruled 2026-09-23: the terminal heat summary is
   * OPT-IN (`theta.runSummary`, default `false` applied here at the read
   * site per the settings module's treated-absent convention). Not opted in,
   * `driveEnded` appends NO summary regardless of elapsed time; opted in, the
   * decision-7 `RUN_SUMMARY_GATE_MS` gate applies unchanged.
   */
  readonly runSummaryEnabled?: boolean;
}

/** What the dispatch entry knows at top-level drive start. */
export interface RunCardDriveStart {
  readonly invocationId: string;
  readonly theta: string;
  /** The RAW slash-argument text; summarised (whitespace-collapsed, clamped) here. */
  readonly args: string;
  readonly sourcePath?: string;
}

export interface RunCardPublisher {
  /** Append the `theta-run` card entry for one top-level drive. */
  driveStarted(info: RunCardDriveStart): void;
  /** End the drive: append the gated `theta-run-summary` (decision 7), reading
   *  the accumulated heat off the bus's lingering node. Call AFTER the bus's
   *  `invocationEnded` so the end-path dwell close has settled the ring. */
  driveEnded(invocationId: string, outcome: ThetaRunOutcome): void;
}

/** One in-flight top-level drive the publisher opened a card for. */
interface OpenRun {
  readonly theta: string;
  /** `clock.now()` (monotonic) at `driveStarted` — the gate's elapsed origin. */
  readonly startedMonotonicMs: number;
}

/** Collapse whitespace runs (a multi-line arg block is one display line) and clamp. */
function summarizeArgs(args: string): string {
  const collapsed = args.replace(/\s+/g, " ").trim();
  return collapsed.length <= RUN_CARD_ARGS_CLAMP_CHARS
    ? collapsed
    : collapsed.slice(0, RUN_CARD_ARGS_CLAMP_CHARS);
}

/**
 * Project the ring's accumulated entries onto the summary's static profile:
 * dwell-descending (hits break ties — a hot loop with negligible dwell still
 * ranks above never-re-hit lines), capped at `RUN_SUMMARY_PROFILE_MAX_LINES`.
 */
function heatProfileOf(
  entries: readonly HeatEntrySnapshot[],
): readonly ThetaRunHeatProfileLine[] {
  return [...entries]
    .sort((a, b) => (b.dwellMs - a.dwellMs !== 0 ? b.dwellMs - a.dwellMs : b.hits - a.hits))
    .slice(0, RUN_SUMMARY_PROFILE_MAX_LINES)
    .map((entry) => ({
      file: entry.file,
      line: entry.line,
      hits: entry.hits,
      dwellMs: entry.dwellMs,
      kind: entry.kind,
    }));
}

export function createRunCardPublisher(deps: RunCardPublisherDeps): RunCardPublisher {
  // Instance state (no module-level binding): keyed by invocationId, deleted at
  // `driveEnded`. The cap is a defensive bound only — a defect path that never
  // ends a drive must not grow this map unboundedly; `MAX_TRACKED_INVOCATIONS`
  // matches the bus's own concurrent-top-level-drive posture (EXST-7).
  const open = new Map<string, OpenRun>();

  return {
    driveStarted(info: RunCardDriveStart): void {
      while (open.size >= MAX_TRACKED_INVOCATIONS) {
        const oldest = open.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        open.delete(oldest);
      }
      open.set(info.invocationId, {
        theta: info.theta,
        startedMonotonicMs: deps.clock.now(),
      });
      deps.entryChannel.appendRun({
        invocationId: info.invocationId,
        theta: info.theta,
        argsSummary: summarizeArgs(info.args),
        startedAtMs: deps.clock.wallNow(),
        ...(info.sourcePath !== undefined ? { sourcePath: info.sourcePath } : {}),
      });
    },

    driveEnded(invocationId: string, outcome: ThetaRunOutcome): void {
      // The open-map cleanup runs on EVERY end, opted in or not — the map is
      // per-drive bookkeeping, not summary state, and must not grow when the
      // operator leaves the summary off (the default).
      const run = open.get(invocationId);
      open.delete(invocationId);
      if (run === undefined) {
        // No card was opened for this id (cap-evicted, or a start this
        // publisher never saw) — a summary without its card would dangle.
        return;
      }
      if (deps.runSummaryEnabled !== true) {
        return; // decision 7 re-ruling 2026-09-23: default OFF — no summary entry
      }
      const elapsedMs = deps.clock.now() - run.startedMonotonicMs;
      if (elapsedMs < RUN_SUMMARY_GATE_MS) {
        return; // decision 7: short utility drives append nothing
      }
      // The node lingers `DONE_LINGER_MS` after `invocationEnded`, so a
      // same-tick read finds it with the end-path dwell close already applied;
      // an evicted node (or an absent bus) omits the profile, never fails.
      const node = deps.statusBus
        ?.snapshot()
        .nodes.find((candidate) => candidate.invocationId === invocationId);
      deps.entryChannel.appendRunSummary({
        invocationId,
        theta: run.theta,
        outcome,
        elapsedMs,
        counters: node?.counters ?? { checkpoints: 0, loopIters: 0 },
        childrenSpawned: node?.childrenSpawned ?? 0,
        ...(node?.heat !== undefined && node.heat.entries.length > 0
          ? { heatProfile: heatProfileOf(node.heat.entries) }
          : {}),
      });
    },
  };
}
