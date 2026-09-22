// RFC 0015 (D5) — the PURE run-card line builder: given an already-assembled
// `CardLinesModel` (snapshot-derived scalars, styled source lines, heat ages,
// a pre-built background LUT, and plain-string style tokens) it composes the
// card's rows — header, author-message row, breadcrumb, the 24-line sticky
// viewport with gutter/markers/badges, and the children roster — as
// ready-to-emit strings. No Theme, TUI, Clock, bus, or filesystem dependency
// lives here: the impure shell (`run-card-renderer.ts`) acquires all of those
// and reduces them to this model, which is what makes the whole card geometry
// unit-testable with a fake style.
//
// Width discipline (spike Q4): the entry channel imposes ZERO chrome and a
// background SGR does not bleed into unpainted cells, so every heat-painted
// row is padded WITH SPACES to the render width BEFORE the closing `ESC[49m`.
// Visible length is accounted span-by-span while composing (the emitted rows
// carry fg SGRs, so `String.length` is not a width).

import type { LaneSetSnapshot, ProgressAuthorMessage } from "../types";
import {
  RUN_CARD_CHILD_ROSTER_MAX,
  RUN_CARD_FOLLOW_DWELL_MS,
} from "../types";
import { formatDuration, renderAuthorMessageSegment } from "./format";
import { lutIndexFor } from "./heat";
import type { StyledLine, SyntaxRole } from "./styled-lines";

// ---------------------------------------------------------------------------
// Style tokens — plain strings the shell derives from the Theme (or a test
// fakes). Every token is an OPENING sequence (or ""); the builder closes each
// row with one `ESC[0m` after the (optional) `ESC[49m` background close.
// ---------------------------------------------------------------------------

export interface CardStyle {
  /** Opening fg SGR for a syntax role ("" = unstyled). */
  syntaxFg(role: SyntaxRole): string;
  /** Opening fg SGR for the `⑂` marker / badges (theme accent). */
  readonly accentFg: string;
  /** Opening fg SGR for gutter line numbers / secondary text. */
  readonly mutedFg: string;
}

/** Bold on/off (SGR 1/22) — attribute codes, not theme colors. */
const BOLD_ON = "\x1b[1m";
const BOLD_OFF = "\x1b[22m";
/** Default-foreground reset, emitted between fg-styled runs. */
const FG_RESET = "\x1b[39m";
/** Background close for heat-painted rows (spike Q4). */
const BG_RESET = "\x1b[49m";
/** Full attribute reset ending every row (no state bleeds to the next line). */
const ROW_RESET = "\x1b[0m";

/** Gutter glyphs. */
export const CURRENT_LINE_GLYPH = "\u25B6"; // ▶
export const CHILD_MARKER_GLYPH = "⑂"; // ⑂ (OCR fork — the RFC's child marker)
export const RUN_CARD_HEADER_GLYPH = "\u27F3"; // ⟳
const CHILD_DONE_GLYPH = "\u2713"; // ✓

// ---------------------------------------------------------------------------
// Sticky viewport math (decision 3): recenter only when the current line
// leaves the middle third, so the view does not jitter.
// ---------------------------------------------------------------------------

/**
 * The 1-indexed top line of the viewport window. `prevTop` is the previous
 * render's top for the SAME file (undefined on the first render or after a
 * file switch). The window keeps `prevTop` while `currentLine` stays within
 * its middle third; when it leaves (or no previous window exists) the window
 * recenters on the current line, clamped to the document.
 */
export function computeViewportTop(
  currentLine: number | undefined,
  totalLines: number,
  height: number,
  prevTop: number | undefined,
): number {
  if (totalLines <= height) {
    return 1;
  }
  const maxTop = totalLines - height + 1;
  const clampTop = (top: number): number => Math.min(Math.max(top, 1), maxTop);
  if (currentLine === undefined) {
    return clampTop(prevTop ?? 1);
  }
  if (prevTop !== undefined) {
    // Middle third of the previous window: [top + h/3, top + 2h/3).
    const lower = prevTop + Math.floor(height / 3);
    const upper = prevTop + Math.floor((2 * height) / 3) - 1;
    const inWindow = currentLine >= prevTop && currentLine < prevTop + height;
    if (inWindow && currentLine >= lower && currentLine <= upper) {
      return clampTop(prevTop);
    }
  }
  return clampTop(currentLine - Math.floor(height / 2));
}

// ---------------------------------------------------------------------------
// Dwell-damped file following (decision 6): the viewport follows execution
// into a callee file only after the current site has RESIDED there for
// `RUN_CARD_FOLLOW_DWELL_MS`, and returns by the same rule on completion.
// ---------------------------------------------------------------------------

export interface FollowState {
  /** The file the viewport currently shows. */
  displayedFile: string;
  /** A different file the current site has recently moved to (dwell pending). */
  candidateFile?: string;
  /** `clock.now()` when `candidateFile` was first observed. */
  candidateSinceMs?: number;
}

/**
 * Fold one render's current-site file into the follow state (mutating).
 * A site back in the displayed file cancels any pending candidate; a site in
 * another file starts (or continues) that file's dwell and switches the
 * display once the dwell elapses. Symmetric on return: when the callee
 * completes, parent-file sites re-accumulate the same dwell before the
 * viewport switches back.
 */
export function followCurrentFile(
  state: FollowState,
  siteFile: string | undefined,
  nowMs: number,
): void {
  if (siteFile === undefined || siteFile === state.displayedFile) {
    delete state.candidateFile;
    delete state.candidateSinceMs;
    return;
  }
  if (state.candidateFile !== siteFile) {
    state.candidateFile = siteFile;
    state.candidateSinceMs = nowMs;
    return;
  }
  if (nowMs - (state.candidateSinceMs ?? nowMs) >= RUN_CARD_FOLLOW_DWELL_MS) {
    state.displayedFile = siteFile;
    delete state.candidateFile;
    delete state.candidateSinceMs;
  }
}

// ---------------------------------------------------------------------------
// The model.
// ---------------------------------------------------------------------------

/** One heat reading for a viewport line (already reduced to age + clamp). */
export interface LineHeat {
  readonly ageMs: number;
  /** Operator ruling: the in-flight effect's line renders at FULL heat. */
  readonly clamped: boolean;
}

/** One child row of the roster (snapshot order = insertion order). */
export interface CardChildRow {
  readonly name: string;
  /** The child's newest `theta_progress` scope, as the roster's scope tag. */
  readonly scope?: string;
  readonly startedAtMs: number;
  readonly endedAtMs?: number;
  readonly activity?: {
    readonly turns: number;
    readonly toolExecs: number;
    readonly lastToolName?: string;
  };
  /** RFC 0012 §7 `live in <placement>` (visible children publish no tap events). */
  readonly placement?: string;
  /** Launch line in the DISPLAYED file (absent when unattributed or elsewhere). */
  readonly launchLine?: number;
}

export interface CardViewportModel {
  /** Styled source lines of the displayed file (1-indexed by position + 1). */
  readonly lines: readonly StyledLine[];
  /** 1-indexed first rendered line. */
  readonly top: number;
  /** Rows to draw (the full document when expanded). */
  readonly height: number;
  readonly currentLine?: number;
  /** Heat per 1-indexed line of the displayed file. */
  readonly heatByLine: ReadonlyMap<number, LineHeat>;
  /** The D4 background LUT (entry 0 = "" = no background SGR). */
  readonly lut: readonly string[];
}

export interface CardLinesModel {
  readonly theta: string;
  readonly startedAtMs: number;
  readonly nowMs: number;
  readonly counters: { readonly checkpoints: number; readonly loopIters: number };
  /** Currently-running (not ended) children of the invocation. */
  readonly activeChildren: number;
  readonly authorMessage?: ProgressAuthorMessage;
  /** Present only when the viewport shows a nested callee's file (decision 6). */
  readonly breadcrumb?: { readonly parent: string; readonly callee: string };
  /** Absent when the displayed file's source is unavailable. */
  readonly viewport?: CardViewportModel;
  readonly children: readonly CardChildRow[];
  /** The deepest open par-for lane set (drives the lane-summary badge form). */
  readonly lanes?: LaneSetSnapshot;
}

// ---------------------------------------------------------------------------
// Row composition helpers with visible-length accounting.
// ---------------------------------------------------------------------------

/** A row under construction: emitted text plus its VISIBLE character count. */
interface Row {
  text: string;
  visible: number;
}

function push(row: Row, visibleText: string, opening = "", closing = ""): void {
  row.text += `${opening}${visibleText}${closing}`;
  row.visible += visibleText.length;
}

/** `1234` → `1.2k` — compact counter for the header (RFC anatomy `cp 1.2k`). */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return "0";
  }
  if (n < 1000) {
    return String(n);
  }
  const scaled = n / 1000;
  return `${scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10}k`;
}

/** Hard-clip a plain (SGR-free) line to `width`, marking the clip. */
function clipPlain(line: string, width: number): string {
  if (width <= 0 || line.length <= width) {
    return line;
  }
  return `${line.slice(0, Math.max(0, width - 1))}…`;
}

/** `1 turn` / `14 turns` — singular/plural per the RFC anatomy examples. */
function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** The child badge: `⑂ 2m11s · 14 turns · bash`, or `live in <placement>`. */
function childBadgeBody(child: CardChildRow, nowMs: number): string {
  if (child.placement !== undefined) {
    return child.placement;
  }
  const elapsed = formatDuration(nowMs - child.startedAtMs);
  const activity = child.activity;
  if (activity === undefined) {
    return elapsed;
  }
  const tool = activity.lastToolName !== undefined ? ` · ${activity.lastToolName}` : "";
  return `${elapsed} · ${pluralize(activity.turns, "turn")}${tool}`;
}

/** The par-for lane-summary badge: `⑂ 4/6 lanes · 2 done · 0 err`. */
function laneSummaryBadge(lanes: LaneSetSnapshot): string {
  return `${CHILD_MARKER_GLYPH} ${lanes.running.length}/${lanes.total} lanes · ${lanes.done} done · ${lanes.err} err`;
}

/**
 * The badge for one launch line: the lane summary when a par-for lane set is
 * open over ≥ 2 running children on the line (par-for over subagents), the
 * single-child live badge otherwise, and a bare running count for a lane-less
 * multi-child line (concurrent invokes sharing a launch site).
 */
function launchLineBadge(
  running: readonly CardChildRow[],
  lanes: LaneSetSnapshot | undefined,
  nowMs: number,
): string {
  if (running.length >= 2) {
    return lanes !== undefined
      ? laneSummaryBadge(lanes)
      : `${CHILD_MARKER_GLYPH} ${running.length} running`;
  }
  return `${CHILD_MARKER_GLYPH} ${childBadgeBody(running[0]!, nowMs)}`;
}

// ---------------------------------------------------------------------------
// The builder.
// ---------------------------------------------------------------------------

/**
 * Compose the card's rows at `width`. Never throws on a coherent model; the
 * shell guards the model ASSEMBLY (PIC-21 analogue) so malformed bus payloads
 * never reach here.
 */
export function buildCardLines(
  model: CardLinesModel,
  width: number,
  style: CardStyle,
): string[] {
  const rows: string[] = [];

  // Header: `⟳ /<name> · <elapsed> · cp <n> · iters <n> · <k> children`.
  const header =
    `${RUN_CARD_HEADER_GLYPH} /${model.theta}` +
    ` · ${formatDuration(model.nowMs - model.startedAtMs)}` +
    ` · cp ${formatCount(model.counters.checkpoints)}` +
    ` · iters ${formatCount(model.counters.loopIters)}` +
    ` · ${model.activeChildren} children`;
  rows.push(clipPlain(header, width) + ROW_RESET);

  // Author-message row: the newest `theta_progress` payload for the node.
  if (model.authorMessage !== undefined) {
    rows.push(
      `${style.mutedFg}  ${clipPlain(renderAuthorMessageSegment(model.authorMessage), Math.max(0, width - 2))}${ROW_RESET}`,
    );
  }

  // Breadcrumb (nested invoke only): `/parent ▸ /callee`.
  if (model.breadcrumb !== undefined) {
    rows.push(
      clipPlain(`/${model.breadcrumb.parent} \u25B8 /${model.breadcrumb.callee}`, width) +
        ROW_RESET,
    );
  }

  if (model.viewport !== undefined) {
    rows.push(...buildViewportRows(model, model.viewport, width, style));
  }

  rows.push(...buildRosterRows(model, width, style));
  return rows;
}

function buildViewportRows(
  model: CardLinesModel,
  viewport: CardViewportModel,
  width: number,
  style: CardStyle,
): string[] {
  const rows: string[] = [];
  const last = Math.min(viewport.top + viewport.height - 1, viewport.lines.length);
  const numberWidth = String(viewport.lines.length).length;
  // Launch-line index: running children grouped by their launch line.
  const runningByLine = new Map<number, CardChildRow[]>();
  for (const child of model.children) {
    if (child.endedAtMs !== undefined || child.launchLine === undefined) {
      continue;
    }
    const group = runningByLine.get(child.launchLine);
    if (group === undefined) {
      runningByLine.set(child.launchLine, [child]);
    } else {
      group.push(child);
    }
  }

  for (let lineNo = viewport.top; lineNo <= last; lineNo++) {
    const styled = viewport.lines[lineNo - 1];
    const heat = viewport.heatByLine.get(lineNo);
    const lutIndex = heat === undefined ? 0 : lutIndexFor(heat.ageMs, heat.clamped);
    const bg = viewport.lut[lutIndex] ?? "";
    const isCurrent = lineNo === viewport.currentLine;
    const running = runningByLine.get(lineNo);

    const row: Row = { text: bg, visible: 0 };
    // Gutter: right-aligned number (bold on the current line) + marker column.
    const num = String(lineNo).padStart(numberWidth, " ");
    push(row, "  ");
    if (isCurrent) {
      push(row, num, BOLD_ON, BOLD_OFF);
      push(row, ` ${CURRENT_LINE_GLYPH} `);
    } else {
      push(row, num, style.mutedFg, FG_RESET);
      if (running !== undefined) {
        push(row, " ");
        push(row, CHILD_MARKER_GLYPH, style.accentFg, FG_RESET);
        push(row, " ");
      } else {
        push(row, "   ");
      }
    }

    // Code text: styled spans, budgeted against the badge's right-aligned space.
    const badge = running !== undefined ? launchLineBadge(running, model.lanes, model.nowMs) : "";
    const badgeSpace = badge.length > 0 ? badge.length + 2 : 0; // "  " separator
    const codeBudget = Math.max(0, width - row.visible - badgeSpace);
    let used = 0;
    const spans = styled?.spans ?? [];
    for (const span of spans) {
      if (used >= codeBudget) {
        break;
      }
      const remaining = codeBudget - used;
      const text = span.text.length <= remaining ? span.text : `${span.text.slice(0, Math.max(0, remaining - 1))}…`;
      // A running child's callee name reads bold: bold the whole ident span
      // set on a launch line (the callee name is the line's leading ident;
      // per-token callee identification is not recoverable from spans alone).
      const bold = running !== undefined && span.role === "ident";
      push(
        row,
        text,
        `${style.syntaxFg(span.role)}${bold ? BOLD_ON : ""}`,
        `${bold ? BOLD_OFF : ""}${FG_RESET}`,
      );
      used += text.length;
    }

    // Right-aligned badge, padded into place.
    if (badge.length > 0 && row.visible + badge.length < width) {
      push(row, " ".repeat(width - row.visible - badge.length));
      push(row, badge, style.accentFg, FG_RESET);
    }

    // Spike Q4: pad heat rows to the full width, THEN close the background.
    if (bg !== "") {
      if (row.visible < width) {
        push(row, " ".repeat(width - row.visible));
      }
      row.text += BG_RESET;
    }
    rows.push(row.text + ROW_RESET);
  }
  return rows;
}

function buildRosterRows(
  model: CardLinesModel,
  width: number,
  style: CardStyle,
): string[] {
  if (model.children.length === 0) {
    return [];
  }
  const rows: string[] = [`${style.mutedFg}  children:${ROW_RESET}`];
  const shown = model.children.slice(0, RUN_CARD_CHILD_ROSTER_MAX);
  for (const child of shown) {
    // RECORDED LIMITATION: an ended child renders `✓ done` uniformly — the
    // bus's `invocationEnded` ingest carries no outcome, so ✓ vs ✗ is not
    // recoverable from the snapshot (D5 residual; an outcome stamp on the
    // end publication would be a bus-ingest extension).
    const glyph = child.endedAtMs !== undefined ? CHILD_DONE_GLYPH : CHILD_MARKER_GLYPH;
    const scope = child.scope !== undefined ? ` (${child.scope})` : "";
    const status =
      child.endedAtMs !== undefined
        ? "done"
        : child.placement ?? activitySegment(child);
    const crossRef = child.launchLine !== undefined ? `   [line ${child.launchLine}]` : "";
    const elapsedEnd = child.endedAtMs ?? model.nowMs;
    const line = `    ${glyph} ${child.name}${scope}   ${formatDuration(elapsedEnd - child.startedAtMs)}  ${status}${crossRef}`;
    rows.push(`${style.accentFg}${clipPlain(line, width)}${ROW_RESET}`);
  }
  const more = model.children.length - shown.length;
  if (more > 0) {
    rows.push(`${style.mutedFg}    +${more} more${ROW_RESET}`);
  }
  return rows;
}

/** `14 turns · 41 tools · bash` — the roster's `ChildActivity` segment. */
function activitySegment(child: CardChildRow): string {
  const activity = child.activity;
  if (activity === undefined) {
    return "running";
  }
  const tool = activity.lastToolName !== undefined ? ` · ${activity.lastToolName}` : "";
  return `${pluralize(activity.turns, "turn")} · ${pluralize(activity.toolExecs, "tool")}${tool}`;
}
