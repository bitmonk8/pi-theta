// RFC 0010 (execution-status.md EXST-8/EXST-11) — the widget `StatusSink`
// (L2): `ctx.ui.setWidget("theta", …, { placement: "belowEditor" })`.
//
// One surface gate (EXST-8): the first `setWidget` throw permanently disables
// the sink for the extension instance, silently (PIC-73 — no diagnostic). The
// sink renders only under view shape `tree` (EXST-11); `min` and `off` clear
// the widget while the footer stays live under `min`.
//
// The render grammar's node headers reuse the footer's (`footer-sink.ts` owns
// the L0 grammar), so a node reads identically on both surfaces.
//
// Spec: docs/spec_topics/execution-status.md EXST-8, EXST-11, EXST-12.

import type {
  ExecutionStatusSnapshot,
  InvocationNodeSnapshot,
  ProgressVerbosity,
  StatusSink,
  ViewShape,
} from "./types";
import type { ProgressAuthorMessage } from "./types";
import { WIDGET_HEIGHT_LINES } from "./types";
import { AUTHOR_MESSAGE_GLYPH, formatDuration, renderNodeHeader } from "./footer-sink";

/** The narrow `ctx.ui` surface the widget sink touches (EXST-8 per-surface gate). */
export interface WidgetUi {
  setWidget(
    key: string,
    content: string[] | undefined,
    options?: { placement?: "aboveEditor" | "belowEditor" },
  ): void;
}

/** The fixed widget key and placement this extension owns (EXST-8). */
const WIDGET_KEY = "theta";
const WIDGET_PLACEMENT = "belowEditor" as const;
/**
 * The width the sink renders its string-array content at. The string-array
 * `setWidget` overload carries no width contract back to the extension, so the
 * lines are pre-fitted to a conservative terminal width; narrower hosts elide
 * the tail themselves rather than being handed an over-wide line (PIC-56's
 * analogue obligation).
 */
const WIDGET_RENDER_WIDTH = 80;

/** Hard-clip one line to `width`, marking the clip with a trailing ellipsis. */
function clip(line: string, width: number): string {
  if (width <= 0 || line.length <= width) {
    return line;
  }
  return `${line.slice(0, Math.max(0, width - 1))}…`;
}

/**
 * The `par for` claim cursor: lanes are claimed in ascending index order by the
 * bounded worker pool (CTRL-2), so the highest RUNNING index bounds the number
 * dispatched from below, as does settled + running. The larger of the two is
 * the cursor; in a coherent snapshot both agree.
 */
function claimedLanes(lanes: NonNullable<InvocationNodeSnapshot["lanes"]>): number {
  let highest = -1;
  for (const lane of lanes.running) {
    if (lane.index > highest) {
      highest = lane.index;
    }
  }
  return Math.max(lanes.done + lanes.err + lanes.running.length, highest + 1);
}

/**
 * `  ✎ [<scope>: ]<message>[ <done>/<total>][ (+<n> dropped)]` — the widget's
 * class-2 line (par. 6 of the L3 seam sheet). Renders under `names` AND
 * `counts` alike: EXST-12 makes class-2 an off/on axis, not a ceiling step.
 */
function renderAuthorMessageLine(payload: ProgressAuthorMessage): string {
  let line = `  ${AUTHOR_MESSAGE_GLYPH} `;
  if (payload.scope !== undefined) {
    line += `${payload.scope}: `;
  }
  line += payload.message;
  if (payload.done !== undefined && payload.total !== undefined) {
    line += ` ${payload.done}/${payload.total}`;
  }
  const dropped = payload.dropped ?? 0;
  if (dropped > 0) {
    line += ` (+${dropped} dropped)`;
  }
  return line;
}

/**
 * Pure tree renderer (seam sheet par. 5.2). Line priority: (a) one header per
 * top-level node, oldest first; (b) the focused node's lane summary; (b2) the
 * focused node's (or its children's) newest class-2 line; (c) one
 * row per running lane in claim order; (d) nested non-lane child nodes. The
 * budget is `WIDGET_HEIGHT_LINES` with the overflow collapsed into a final
 * `… +<n> more`; every line is hard-clipped to `width`.
 */
export function renderStatusTree(
  s: ExecutionStatusSnapshot,
  verbosity: Exclude<ProgressVerbosity, "off">,
  width: number,
  nowMs: number,
): string[] {
  if (s.nodes.length === 0) {
    return [];
  }
  const tops = s.nodes.filter((n) => n.parentInvocationId === undefined);
  const candidates: string[] = [];
  for (const node of tops) {
    candidates.push(renderNodeHeader(node, nowMs));
  }

  // The focused node: the oldest top-level with an open lane set, else the
  // oldest with child nodes, else (L3) the oldest carrying a class-2 payload
  // — a lane-less, child-less theta reporting its own progress is the
  // commonest parent-regime shape and must still draw its `✎` line.
  const focused =
    tops.find((n) => n.lanes !== undefined) ??
    tops.find((n) => s.nodes.some((c) => c.parentInvocationId === n.invocationId)) ??
    tops.find((n) => n.authorMessage !== undefined);

  /** Child nodes already accounted for by a lane row (never re-rendered as `↳`). */
  const laneRendered = new Set<string>();

  if (focused !== undefined) {
    const lanes = focused.lanes;
    const children = s.nodes.filter((c) => c.parentInvocationId === focused.invocationId);
    // (b2): the focused node's own self-report, else the newest one a child
    // reported over the wire (a child's payload folds onto the CHILD node).
    const authorMessage =
      focused.authorMessage ??
      children.reduce<ProgressAuthorMessage | undefined>(
        (best, child) => child.authorMessage ?? best,
        undefined,
      );
    if (lanes !== undefined) {
      let counters = `${lanes.running.length}▶`;
      if (lanes.done > 0) counters += ` ${lanes.done}✓`;
      if (lanes.err > 0) counters += ` ${lanes.err}✗`;
      candidates.push(
        `  par for ${claimedLanes(lanes)}/${lanes.total} · ${counters} · w${lanes.width}`,
      );
    }
    // Line priority (par. 6): the class-2 line sits between the lane summary
    // and the per-lane rows, so a self-report survives lane-row elision.
    if (authorMessage !== undefined) {
      candidates.push(renderAuthorMessageLine(authorMessage));
    }
    if (lanes !== undefined) {
      // Lane rows in claim order; the callee node is matched by
      // `parentInvocationId` + start order against the running lane order.
      lanes.running.forEach((lane, position) => {
        const callee = children[position];
        let row = `    #${lane.index} ▶`;
        if (callee !== undefined) {
          laneRendered.add(callee.invocationId);
          row += ` ${callee.theta}`;
          const activity = callee.childActivity;
          if (activity !== undefined) {
            row += ` t${activity.turns}`;
            // EXST-10: `counts` withholds tool names.
            if (verbosity === "names" && activity.lastToolName !== undefined) {
              row += ` ${activity.lastToolName}`;
            }
          }
        }
        row += ` ${formatDuration(nowMs - lane.startedAtMs)}`;
        candidates.push(row);
      });
    }
    for (const child of children) {
      if (laneRendered.has(child.invocationId)) {
        continue;
      }
      candidates.push(`  ↳ ${renderNodeHeader(child, nowMs).replace(/^θ /, "")}`);
    }
  }

  const budget = WIDGET_HEIGHT_LINES;
  const needsOverflow = candidates.length + (s.untracked > 0 ? 1 : 0) > budget;
  let lines: string[];
  if (needsOverflow) {
    const kept = candidates.slice(0, budget - 1);
    lines = [...kept, `… +${candidates.length - kept.length + s.untracked} more`];
  } else if (s.untracked > 0) {
    lines = [...candidates, `… +${s.untracked} more`];
  } else {
    lines = candidates;
  }
  return lines.map((line) => clip(line, width));
}

/**
 * Construct the widget `StatusSink`. A `setWidget` throw disables the sink
 * permanently for this extension instance (EXST-8), silently.
 */
export function createWidgetSink(ui: WidgetUi): StatusSink {
  let live = true;

  const set = (content: string[] | undefined): void => {
    if (!live) {
      return;
    }
    try {
      ui.setWidget(WIDGET_KEY, content, { placement: WIDGET_PLACEMENT });
    } catch { // allow-broad-catch: EXST-8 — execution-status.md#exst-8
      live = false;
    }
  };

  return {
    id: "widget",
    render(
      snapshot: ExecutionStatusSnapshot,
      view: ViewShape,
      verbosity: ProgressVerbosity,
      nowMs: number,
    ): void {
      // EXST-11: only the `tree` view shape draws the widget.
      if (view !== "tree" || verbosity === "off") {
        set(undefined);
        return;
      }
      const lines = renderStatusTree(snapshot, verbosity, WIDGET_RENDER_WIDTH, nowMs);
      set(lines.length === 0 ? undefined : lines);
    },
    clear(): void {
      set(undefined);
    },
  };
}
