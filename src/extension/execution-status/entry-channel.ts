// RFC 0010 (execution-status.md EXST-8; runtime-event-channel.md PIC-71/72) —
// the entry channel: `pi.appendEntry` / `pi.registerEntryRenderer` for the
// three migrated operator note classes (batch / structural / recovery).
//
// The channel is best-effort under the optional-capability class (PIC-73):
// both members are `typeof`-probed, the factory-time renderer registration is
// per-call guarded, and the FIRST hard failure of either — an absent member, a
// throwing registration, a throwing `appendEntry` — marks the channel dead for
// the session so PIC-72's message-channel fallback owns all later delivery.
// Every degrade is silent (no diagnostic; the registries are closed, DIAG-2).
//
// Spec: docs/spec_topics/execution-status.md EXST-8;
// docs/spec_topics/pi-integration-contract/runtime-event-channel.md PIC-71/72.

import type { Component } from "@earendil-works/pi-tui";
import type { CustomEntry, EntryRenderOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent"; // allow-pi-surface: PIC#71 — CustomEntry/EntryRenderOptions are the theta-progress-entry renderer's own SDK carrier types, not yet SDK_SURFACE_INVENTORY-promoted (analyst's par. 1 sdk-inventory.ts edit)
import type { SystemNote } from "../system-note-channel";
import { renderSystemNoteBody } from "../system-note-renderer";
import type { ProgressMilestone, ThetaRunSeed, ThetaRunSummary } from "./types";

/** PIC-71: the fixed `theta-progress-entry` custom-entry type literal. */
export const THETA_PROGRESS_ENTRY_TYPE = "theta-progress-entry";

/** RFC 0015 (D3): the run-card custom-entry type — one per TOP-LEVEL drive. */
export const THETA_RUN_ENTRY_TYPE = "theta-run";

/** RFC 0015 (D3, decision 7): the gated terminal heat-summary entry type. */
export const THETA_RUN_SUMMARY_ENTRY_TYPE = "theta-run-summary";

/**
 * RFC 0015 (D3→D5 seam): the `theta-run` renderer's shape. D3 registers the
 * static compact form (`createThetaRunEntryRenderer`); D5 swaps in the live
 * card by INJECTING its own renderer through `createEntryChannel`'s second
 * parameter — the channel's registration, degrade discipline, and append
 * surface stay untouched by the swap.
 */
export type ThetaRunEntryRenderer = (
  entry: CustomEntry<ThetaRunSeed>,
  options: EntryRenderOptions,
  theme: unknown,
) => Component | undefined;

export interface EntryChannelHandle {
  /** `true` iff both surfaces are present AND the renderer registered without throwing. */
  live(): boolean;
  /** `true` = delivered as an entry; `false` = caller falls back to `sendMessage`. */
  append(note: SystemNote): boolean;
  /** L3 (EXST-14/PIC-71): one durable milestone entry. Same live()/degrade
   *  rules as `append` — `false` means "skipped silently", NEVER a
   *  `sendMessage` fallback (EXST-14: milestones never fall back). */
  appendMilestone(m: ProgressMilestone): boolean;
  /** RFC 0015 (D3): one `theta-run` card entry at top-level drive start. Same
   *  degrade rules as `appendMilestone` — `false` is a silent skip, never a
   *  message-channel fallback (a card is a rendering surface, not a note). */
  appendRun(seed: ThetaRunSeed): boolean;
  /** RFC 0015 (D3, decision 7): one gated `theta-run-summary` entry at drive
   *  end. Silent-skip degrade, exactly like `appendRun`. */
  appendRunSummary(summary: ThetaRunSummary): boolean;
}

/**
 * Construct the entry channel: presence-probe `pi.appendEntry` /
 * `pi.registerEntryRenderer` (PIC-73, `typeof`-only, never calls either
 * member at probe time), then attempt the factory-time renderer
 * registration. A throw there marks the channel permanently dead for the
 * session (PIC-71 / Erratum A) — silently, no diagnostic.
 */
export function createEntryChannel(
  pi: ExtensionAPI,
  // RFC 0015 (D3→D5 seam): the injectable `theta-run` renderer. Absent, the
  // static compact form registers; D5's factory injects the live card here.
  runRenderer?: ThetaRunEntryRenderer,
): EntryChannelHandle {
  const present =
    typeof pi.appendEntry === "function" && typeof pi.registerEntryRenderer === "function";
  let dead = !present;
  if (present) {
    try {
      pi.registerEntryRenderer(THETA_PROGRESS_ENTRY_TYPE, createProgressEntryRenderer());
      // RFC 0015 (D3): the run-card renderers register in the SAME guarded
      // factory-time block, so an appended run/summary entry is never
      // renderer-less — the shared dead flag keeps the Erratum-A invariant
      // (a channel that could not register every renderer appends nothing).
      pi.registerEntryRenderer(THETA_RUN_ENTRY_TYPE, runRenderer ?? createThetaRunEntryRenderer());
      pi.registerEntryRenderer(THETA_RUN_SUMMARY_ENTRY_TYPE, createThetaRunSummaryRenderer());
    } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      // PIC-71 / Erratum A: a throwing registration marks the channel ABSENT
      // for the session — an entry is never appended without its renderer.
      dead = true;
    }
  }

  return {
    live(): boolean {
      return !dead;
    },
    append(note: SystemNote): boolean {
      if (dead) {
        return false;
      }
      try {
        // PIC-72: no dedup on this channel — a re-scan re-appends.
        pi.appendEntry(THETA_PROGRESS_ENTRY_TYPE, note);
        return true;
      } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        // EXST-8 / PIC-72: the first append failure permanently degrades the
        // channel; this note and every later one fall back to `sendMessage`.
        dead = true;
        return false;
      }
    },
    appendMilestone(m: ProgressMilestone): boolean {
      if (dead) {
        return false;
      }
      try {
        // PIC-71: the milestone shares the SAME `theta-progress-entry` custom-
        // entry type as the migrated-note payload; the renderer discriminates
        // on the `milestone` key (PIC-71).
        pi.appendEntry(THETA_PROGRESS_ENTRY_TYPE, { milestone: m });
        return true;
      } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        // EXST-14: no `sendMessage` fallback for milestones — the channel
        // simply degrades dead, same as the note-append arm above.
        dead = true;
        return false;
      }
    },
    appendRun(seed: ThetaRunSeed): boolean {
      if (dead) {
        return false;
      }
      try {
        pi.appendEntry(THETA_RUN_ENTRY_TYPE, seed);
        return true;
      } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        // RFC 0015 (D3): first hard append failure permanently degrades the
        // channel — the milestone discipline; no message-channel fallback.
        dead = true;
        return false;
      }
    },
    appendRunSummary(summary: ThetaRunSummary): boolean {
      if (dead) {
        return false;
      }
      try {
        pi.appendEntry(THETA_RUN_SUMMARY_ENTRY_TYPE, summary);
        return true;
      } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        dead = true;
        return false;
      }
    },
  };
}

/**
 * One pre-fitted milestone line. A CLASS (not the note arm's closure-captured
 * object literal) so the rendered line is an own enumerable property: the
 * milestone template is then inspectable on the returned `Component` without
 * a render pass, which is how the L3 suite pins the template. `render`
 * hard-clips rather than wraps — a milestone is one line by contract
 * (PIC-71) — and never throws (PIC-21).
 */
class MilestoneLineComponent implements Component {
  readonly lines: readonly string[];

  constructor(line: string) {
    this.lines = [line];
  }

  render(width: number): string[] {
    return this.lines.map((line) =>
      width > 0 && line.length > width ? `${line.slice(0, Math.max(0, width - 1))}…` : line,
    );
  }

  invalidate(): void {}
}

/**
 * PIC-71's milestone template (exact):
 * `progress[ /<theta>][ <scope>]: <message>[ (<done>/<total>)][ (+<n> dropped)]`
 * — absent parts omitted. The fields are read defensively: the payload has
 * already been clamped at the emitter, but a renderer must not depend on it.
 */
function renderMilestoneLine(milestone: Record<string, unknown>): string {
  const theta = typeof milestone.theta === "string" ? ` /${milestone.theta}` : "";
  const scope = typeof milestone.scope === "string" ? ` ${milestone.scope}` : "";
  const message = typeof milestone.message === "string" ? milestone.message : "";
  const done = milestone.done;
  const total = milestone.total;
  const counts =
    typeof done === "number" && typeof total === "number" ? ` (${done}/${total})` : "";
  const dropped = milestone.dropped;
  const droppedSegment =
    typeof dropped === "number" && dropped > 0 ? ` (+${dropped} dropped)` : "";
  return `progress${theta}${scope}: ${message}${counts}${droppedSegment}`;
}

/**
 * The `theta-progress-entry` renderer. Two arms discriminated on the
 * `milestone` key (both payload classes share the one custom-entry type,
 * PIC-71):
 *
 *   - a MIGRATED OPERATOR NOTE delegates to the SAME body formatter the
 *     `theta-system-note` message renderer uses, so it renders byte-identical
 *     lines on either channel and inherits that helper's PIC-56 width fitting
 *     and PIC-21 never-throw guard;
 *   - an L3 MILESTONE (EXST-14) draws the PIC-71 template line.
 */
export function createProgressEntryRenderer(): (
  entry: CustomEntry<SystemNote>,
  options: EntryRenderOptions,
  theme: unknown,
) => Component | undefined {
  return (entry, _options, _theme): Component | undefined => {
    // PIC-21 analogue: a malformed payload must not throw out of the renderer
    // invocation, so the fields are read defensively before formatting.
    const data = entry.data as Record<string, unknown> | undefined;
    const milestone = data?.milestone;
    if (milestone !== undefined) {
      if (typeof milestone !== "object" || milestone === null) {
        return undefined; // malformed milestone payload: render nothing, never throw
      }
      return new MilestoneLineComponent(
        renderMilestoneLine(milestone as Record<string, unknown>),
      );
    }
    const content = typeof data?.content === "string" ? data.content : "";
    const display = typeof data?.display === "boolean" ? data.display : undefined;
    return renderSystemNoteBody(content, display);
  };
}

// ---------------------------------------------------------------------------
// RFC 0015 (D3) — the two run-card renderers. Both are STATIC and plain-text:
// the live card (viewport, heat fade, color) is D5's; D4 owns color. What the
// D3 `theta-run` renderer draws is exactly the RFC's DEGRADATION form (name,
// args summary, started time) — the same lines the D5 card falls back to when
// the bus no longer tracks the invocation, which is why the swap is a renderer
// replacement and not a payload change.
// ---------------------------------------------------------------------------

/**
 * A static multi-line entry body. Mirrors `MilestoneLineComponent`'s contract:
 * the pre-fitted lines are an own enumerable property (template pinning without
 * a render pass), `render` hard-clips rather than wraps, and it never throws
 * (PIC-21 analogue).
 */
class StaticEntryLinesComponent implements Component {
  readonly lines: readonly string[];

  constructor(lines: readonly string[]) {
    this.lines = lines;
  }

  render(width: number): string[] {
    return this.lines.map((line) =>
      width > 0 && line.length > width ? `${line.slice(0, Math.max(0, width - 1))}…` : line,
    );
  }

  invalidate(): void {}
}

/**
 * Wall-clock epoch ms → `HH:MM:SS` in the HOST'S LOCAL timezone. The card row
 * is a durable operator-facing line carrying NO timezone marker, so the bare
 * form is only honest rendered in the operator's own wall clock — a UTC render
 * silently reads wrong on every non-UTC host. Tests pin the row by injecting a
 * deterministic formatter (see `createThetaRunEntryRenderer`), never by
 * asserting any real timezone.
 */
function formatLocalTime(ms: number): string {
  const date = new Date(ms);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/** Elapsed ms → compact duration (`842ms`, `41s`, `4m32s`). */
function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "?";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

/**
 * The D3 static `theta-run` renderer: one line —
 * `theta /<name>[ <argsSummary>] · started <HH:MM:SS>` — the RFC degradation
 * form. Fields are read defensively (a renderer must not throw on a malformed
 * payload, PIC-21 analogue).
 */
export function createThetaRunEntryRenderer(
  // DI mirroring the D5 renderer seam (`createEntryChannel`'s injectable
  // renderer): the started-time rendering is the static card's one
  // host-timezone-dependent piece, so tests inject a deterministic formatter
  // here while production keeps the local-wall-clock default.
  formatTime: (ms: number) => string = formatLocalTime,
): ThetaRunEntryRenderer {
  return (entry, _options, _theme): Component | undefined => {
    const data = entry.data as Record<string, unknown> | undefined;
    const theta = typeof data?.theta === "string" ? data.theta : "?";
    const argsSummary =
      typeof data?.argsSummary === "string" && data.argsSummary.length > 0
        ? ` ${data.argsSummary}`
        : "";
    const started =
      typeof data?.startedAtMs === "number" && Number.isFinite(data.startedAtMs)
        ? ` · started ${formatTime(data.startedAtMs)}`
        : "";
    return new StaticEntryLinesComponent([`theta /${theta}${argsSummary}${started}`]);
  };
}

/** Width of the summary's per-line intensity ramp (plain-text `#` bar). */
const RUN_SUMMARY_RAMP_WIDTH = 10;

/**
 * The static `theta-run-summary` renderer (decision 7): a header line —
 * `theta /<name> <outcome> · <elapsed> · cp <n> · iters <n> · <n> children` —
 * followed by one indented line per heat-profile row, each with a plain-text
 * intensity ramp proportional to the row's dwell share of the profile's
 * maximum. Plain text throughout; D4/D5 own color.
 */
export function createThetaRunSummaryRenderer(): (
  entry: CustomEntry<ThetaRunSummary>,
  options: EntryRenderOptions,
  theme: unknown,
) => Component | undefined {
  return (entry, _options, _theme): Component | undefined => {
    const data = entry.data as Record<string, unknown> | undefined;
    const theta = typeof data?.theta === "string" ? data.theta : "?";
    const outcome = typeof data?.outcome === "string" ? data.outcome : "?";
    const elapsed =
      typeof data?.elapsedMs === "number" ? formatDurationMs(data.elapsedMs) : "?";
    const counters = data?.counters as Record<string, unknown> | undefined;
    const checkpoints = typeof counters?.checkpoints === "number" ? counters.checkpoints : 0;
    const loopIters = typeof counters?.loopIters === "number" ? counters.loopIters : 0;
    const children = typeof data?.childrenSpawned === "number" ? data.childrenSpawned : 0;
    const lines: string[] = [
      `theta /${theta} ${outcome} · ${elapsed} · cp ${checkpoints} · iters ${loopIters} · ${children} children`,
    ];
    const profile = Array.isArray(data?.heatProfile) ? data.heatProfile : [];
    const maxDwell = profile.reduce((max: number, row: unknown) => {
      const dwell = (row as Record<string, unknown> | null)?.dwellMs;
      return typeof dwell === "number" && dwell > max ? dwell : max;
    }, 0);
    for (const rawRow of profile) {
      const row = rawRow as Record<string, unknown> | null;
      const file = typeof row?.file === "string" ? row.file : "?";
      const line = typeof row?.line === "number" ? row.line : 0;
      const dwellMs = typeof row?.dwellMs === "number" ? row.dwellMs : 0;
      const hits = typeof row?.hits === "number" ? row.hits : 0;
      const kind = typeof row?.kind === "string" ? row.kind : "?";
      // Ramp share: at least one cell for any row that made the profile, so a
      // short-dwell hot-loop line still registers visually.
      const cells =
        maxDwell > 0
          ? Math.max(1, Math.round((dwellMs / maxDwell) * RUN_SUMMARY_RAMP_WIDTH))
          : 1;
      const ramp = "#".repeat(Math.min(cells, RUN_SUMMARY_RAMP_WIDTH)).padEnd(RUN_SUMMARY_RAMP_WIDTH, ".");
      lines.push(
        `  ${ramp} ${file}:${line} · ${formatDurationMs(dwellMs)} · ${hits} hits · ${kind}`,
      );
    }
    return new StaticEntryLinesComponent(lines);
  };
}
