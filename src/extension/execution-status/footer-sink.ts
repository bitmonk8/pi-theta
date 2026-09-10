// RFC 0010 (execution-status.md EXST-8/EXST-10) — the footer `StatusSink`
// (L0): `ctx.ui.setStatus("theta", …)` + `ctx.ui.setWorkingMessage(…)`.
//
// The sink holds TWO independent surface gates (EXST-8's per-surface degrade):
// a `setStatus` throw disables only the status arm, a `setWorkingMessage`
// throw only the working arm, and both disabled leaves the sink inert. No
// diagnostic is minted for either degrade (PIC-73).
//
// The rendered material is class-1 only (EXST-12): theta names, source sites
// `file:line`, checkpoint kinds, lane counts, timing, and — under `names` —
// tool names sourced from the child tap. A parent-side effect renders
// `kind base(file):line`: the checkpoint payload carries no tool name, so tool
// names appear only on child-sourced material (seam sheet F10).
//
// Spec: docs/spec_topics/execution-status.md EXST-8, EXST-10, EXST-12.

import type {
  ExecutionStatusSnapshot,
  InvocationNodeSnapshot,
  ProgressAuthorMessage,
  ProgressVerbosity,
  StatusSink,
  ViewShape,
} from "./types";
import { FOOTER_CLAMP_CHARS } from "./types";

/** The class-2 author-message marker (L3 render grammar, par. 6). */
export const AUTHOR_MESSAGE_GLYPH = "\u270E";

/** The narrow `ctx.ui` surface the footer sink touches (EXST-8 per-surface gate). */
export interface FooterUi {
  setStatus(key: string, text: string | undefined): void;
  setWorkingMessage(message?: string): void;
}

/** The fixed `ctx.ui.setStatus` key this extension owns (EXST-8). */
const FOOTER_STATUS_KEY = "theta";

/**
 * `base(file)` — the source site's theta STEM: directory prefix dropped, the
 * `.theta` / `.thetalib` extension dropped. Chosen so the footer's site token
 * reads like the slash name the operator dispatched (`quality-loop:214`) at a
 * fixed small width, rather than a path that would eat the whole clamp.
 */
export function baseFileName(file: string): string {
  const lastSlash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
  const base = lastSlash >= 0 ? file.slice(lastSlash + 1) : file;
  if (base.endsWith(".thetalib")) {
    return base.slice(0, -".thetalib".length);
  }
  if (base.endsWith(".theta")) {
    return base.slice(0, -".theta".length);
  }
  return base;
}

/**
 * The shared elapsed/age grammar (seam sheet par. 5.1): `<n>s` under a minute,
 * `<m>m[<s>s]` under an hour (the seconds token omitted when it is zero), and
 * `<h>h<mm>m` above, with zero-padded minutes.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m${seconds}s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}m`;
}

/** Clamp a rendered line, marking the clip with a trailing ellipsis. */
function clampLine(line: string, max: number): string {
  return line.length <= max ? line : `${line.slice(0, Math.max(0, max - 1))}…`;
}

/** Top-level (parentless) nodes, in insertion order — oldest first. */
function topLevelNodes(
  s: ExecutionStatusSnapshot,
): readonly InvocationNodeSnapshot[] {
  return s.nodes.filter((n) => n.parentInvocationId === undefined);
}

/**
 * The node header shared by the footer line and the widget's per-node header
 * rows: `θ /<theta> <elapsed>[ · <kind> <base(file)>:<line> (<age>)]`, or the
 * done-flash `θ /<theta> done` for a lingering ended node.
 */
export function renderNodeHeader(node: InvocationNodeSnapshot, nowMs: number): string {
  if (node.endedAtMs !== undefined) {
    return `θ /${node.theta} done`;
  }
  const head = `θ /${node.theta} ${formatDuration(nowMs - node.startedAtMs)}`;
  const effect = node.currentEffect;
  if (effect === undefined) {
    return head;
  }
  const site = `${baseFileName(effect.site.file)}:${effect.site.line}`;
  return `${head} · ${effect.kind} ${site} (${formatDuration(nowMs - effect.sinceMs)})`;
}

/** The lane / children segment of the footer grammar (`kids`). */
function renderKidsSegment(
  s: ExecutionStatusSnapshot,
  node: InvocationNodeSnapshot,
): string | undefined {
  const lanes = node.lanes;
  if (lanes !== undefined) {
    let segment = `lanes ${lanes.running.length}▶`;
    if (lanes.done > 0) segment += ` ${lanes.done}✓`;
    if (lanes.queued > 0) segment += ` ${lanes.queued}…`;
    if (lanes.err > 0) segment += ` ${lanes.err}✗`;
    return segment;
  }
  const children = s.nodes.filter(
    (n) => n.parentInvocationId === node.invocationId && n.endedAtMs === undefined,
  ).length;
  return children > 0 ? `children ${children}▶` : undefined;
}

/**
 * The newest class-2 payload across the rendered node and its descendants — a
 * child's wire-ingested self-report lives on the CHILD node, so a parent's
 * footer line must reach down one level to show it (par. 6). Descendant
 * payloads win over the node's own only when the node carries none: the
 * snapshot holds no per-payload timestamp, and node insertion order puts the
 * more recently started (deeper) node last.
 */
function newestAuthorMessage(
  s: ExecutionStatusSnapshot,
  node: InvocationNodeSnapshot,
): ProgressAuthorMessage | undefined {
  let descendant: ProgressAuthorMessage | undefined;
  const ids = new Set<string>([node.invocationId]);
  for (const candidate of s.nodes) {
    if (candidate.parentInvocationId === undefined || !ids.has(candidate.parentInvocationId)) {
      continue;
    }
    ids.add(candidate.invocationId);
    if (candidate.authorMessage !== undefined) {
      descendant = candidate.authorMessage;
    }
  }
  return descendant ?? node.authorMessage;
}

/** `✎ <message>[ (+<n> dropped)]` — the class-2 footer segment (par. 6). */
export function renderAuthorMessageSegment(payload: ProgressAuthorMessage): string {
  const dropped = payload.dropped ?? 0;
  return `${AUTHOR_MESSAGE_GLYPH} ${payload.message}${dropped > 0 ? ` (+${dropped} dropped)` : ""}`;
}

/** The most recent tool name across the node's tapped children (names only). */
function lastToolNameOf(
  s: ExecutionStatusSnapshot,
  node: InvocationNodeSnapshot,
): string | undefined {
  let bestAt = -1;
  let best: string | undefined;
  for (const child of s.nodes) {
    if (child.parentInvocationId !== node.invocationId) continue;
    const activity = child.childActivity;
    if (activity?.lastToolName === undefined) continue;
    if (activity.lastEventAtMs >= bestAt) {
      bestAt = activity.lastEventAtMs;
      best = activity.lastToolName;
    }
  }
  const own = node.childActivity;
  if (own?.lastToolName !== undefined && own.lastEventAtMs >= bestAt) {
    best = own.lastToolName;
  }
  return best;
}

/**
 * Pure footer-line renderer (seam sheet par. 5.1). Segments joined by `" · "`;
 * a zero-content segment is omitted; the result is clamped to
 * `FOOTER_CLAMP_CHARS` with a trailing `…` when clipped.
 */
export function renderFooterLine(
  s: ExecutionStatusSnapshot,
  verbosity: Exclude<ProgressVerbosity, "off">,
  nowMs: number,
): string | undefined {
  const tops = topLevelNodes(s);
  const node = tops[0];
  if (node === undefined) {
    return undefined;
  }
  let line = renderNodeHeader(node, nowMs);
  const kids = renderKidsSegment(s, node);
  if (kids !== undefined) {
    line += ` · ${kids}`;
    if (verbosity === "names") {
      // EXST-10: `counts` withholds tool names; kinds and sites render in both.
      const toolName = lastToolNameOf(s, node);
      if (toolName !== undefined) {
        line += ` · ${toolName}`;
      }
    }
  }
  // EXST-12: class-2 is an off/on axis, not a class-1 ceiling step — it
  // renders under `names` AND `counts` (only `theta.progress: off` withholds
  // it, and that never reaches a sink at all).
  const authorMessage = newestAuthorMessage(s, node);
  if (authorMessage !== undefined) {
    line += ` · ${renderAuthorMessageSegment(authorMessage)}`;
  }
  const more = tops.length - 1 + s.untracked;
  if (more > 0) {
    line += ` (+${more} more)`;
  }
  return clampLine(line, FOOTER_CLAMP_CHARS);
}

/**
 * Pure working-message renderer (seam sheet par. 5.1 / F7): `θ /<theta>
 * <elapsed>` while a PROMPT-mode node's `currentEffect.kind === "query"` — the
 * observable approximation of EXST-8's "only while a driven prompt-mode turn
 * is streaming". The next non-query checkpoint (or the node's end) clears it,
 * so the working indicator can never span a silent tool call. Subagent /
 * subagent-fn nodes never set it: their queries are private (SLSH-2).
 */
export function renderWorkingMessage(
  s: ExecutionStatusSnapshot,
  nowMs: number,
): string | undefined {
  for (const node of s.nodes) {
    if (
      node.mode === "prompt" &&
      node.endedAtMs === undefined &&
      node.currentEffect?.kind === "query"
    ) {
      return clampLine(
        `θ /${node.theta} ${formatDuration(nowMs - node.startedAtMs)}`,
        FOOTER_CLAMP_CHARS,
      );
    }
  }
  return undefined;
}

/**
 * Construct the footer `StatusSink`. Two independent surface gates: a
 * `setStatus` throw disables only the status arm; a `setWorkingMessage` throw
 * disables only the working arm (EXST-8). Every call is individually guarded
 * and no diagnostic is minted for a degrade (PIC-73).
 */
export function createFooterSink(ui: FooterUi): StatusSink {
  let statusLive = true;
  let workingLive = true;

  const setStatus = (text: string | undefined): void => {
    if (!statusLive) {
      return;
    }
    try {
      ui.setStatus(FOOTER_STATUS_KEY, text);
    } catch { // allow-broad-catch: EXST-8 — execution-status.md#exst-8
      statusLive = false;
    }
  };
  const setWorking = (message: string | undefined): void => {
    if (!workingLive) {
      return;
    }
    try {
      if (message === undefined) {
        ui.setWorkingMessage();
      } else {
        ui.setWorkingMessage(message);
      }
    } catch { // allow-broad-catch: EXST-8 — execution-status.md#exst-8
      workingLive = false;
    }
  };

  return {
    id: "footer",
    render(
      snapshot: ExecutionStatusSnapshot,
      view: ViewShape,
      verbosity: ProgressVerbosity,
      nowMs: number,
    ): void {
      // EXST-11: view `off` clears both transient sinks; `min` keeps the
      // footer live (only the widget goes). EXST-10's `off` verbosity never
      // reaches a sink at all (the bus stops ticking), but a defensive read
      // keeps the ceiling honest at this boundary too.
      if (view === "off" || verbosity === "off") {
        setStatus(undefined);
        setWorking(undefined);
        return;
      }
      setStatus(renderFooterLine(snapshot, verbosity, nowMs));
      setWorking(renderWorkingMessage(snapshot, nowMs));
    },
    clear(): void {
      setStatus(undefined);
      setWorking(undefined);
    },
  };
}
