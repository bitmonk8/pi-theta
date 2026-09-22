// RFC 0015 (D6, decision 4) — the shared execution-status formatting helpers.
//
// These four helpers were born as the RFC 0010 footer sink's pure grammar
// (`footer-sink.ts`). Decision 4 retired the footer and widget `StatusSink`s
// (the run card supersedes both in TUI — see
// docs/spec_topics/pi-integration-contract/theta-run-entries.md), but the
// card's own grammar reuses exactly these pieces: the elapsed/age duration
// grammar, the `base(file)` theta-stem site token, and the class-2
// `✎ <message>` author segment. They moved here VERBATIM so the retirement
// deleted the dead sinks without re-deriving (or silently drifting) the
// rendered grammar the card inherited from them.
//
// Spec: docs/spec_topics/execution-status.md EXST-8 (sink set);
// docs/spec_topics/pi-integration-contract/theta-run-entries.md (PIC-77).

import { win32 } from "node:path";

import type { ProgressAuthorMessage } from "../types";

/** The class-2 author-message marker (EXST-14). */
export const AUTHOR_MESSAGE_GLYPH = "\u270E";

/**
 * `base(file)` — the source site's theta STEM: directory prefix dropped, the
 * `.theta` / `.thetalib` extension dropped. Chosen so a rendered site token
 * reads like the slash name the operator dispatched (`quality-loop:214`) at a
 * fixed small width, rather than a path that would eat the whole row.
 */
export function baseFileName(file: string): string {
  const base = win32.basename(file);
  if (base.endsWith(".thetalib")) {
    return base.slice(0, -".thetalib".length);
  }
  if (base.endsWith(".theta")) {
    return base.slice(0, -".theta".length);
  }
  return base;
}

/**
 * The shared elapsed/age grammar (EXST-8): `<n>s` under a minute,
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

/** `✎ <message>[ (+<n> dropped)]` — the class-2 author segment (EXST-14). */
export function renderAuthorMessageSegment(payload: ProgressAuthorMessage): string {
  const dropped = payload.dropped ?? 0;
  return `${AUTHOR_MESSAGE_GLYPH} ${payload.message}${dropped > 0 ? ` (+${dropped} dropped)` : ""}`;
}
