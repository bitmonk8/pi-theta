// RFC-0012 §3 — shared result-channel frame protocol: constants, control-frame
// encoding, LF buffering, and inbound classification for parent and child.

import { classifyChildStdoutLine } from "./subagent-envelope";

/** Heartbeat period while the child's invocation is live. */
export const RESULT_CHANNEL_HEARTBEAT_MS = 10_000;
/**
 * Silence budget before a synthesised `HEARTBEAT_SILENCE` exit: 12 missed
 * 10 s heartbeats. Deliberately DECOUPLED from `SUBAGENT_DISPOSE_BUDGET_MS`
 * (bug 0484): that budget's job is a post-envelope graceful-exit wait, while
 * this one bounds a WORKING child's silence — and a fix-phase gate storm
 * (parallel worktree gates × vitest workers pegging the box) was observed
 * stalling healthy children's event loops past 30 s, so the old shared 30 s
 * made FALSE abandonment a load artifact. With the synthesised-exit kill
 * below, a longer budget costs only detection latency on a truly hung child.
 */
export const RESULT_CHANNEL_SILENCE_BUDGET_MS = 120_000;
/**
 * The most a connection may send BEFORE its hello is accepted. A hello frame
 * is ~120 bytes; an unauthenticated peer streaming more than this without a
 * newline is dropped unread. After the hello there is no cap — the envelope
 * has none on the stdout pipe either (PIC-59), and the channel keeps parity.
 */
export const RESULT_CHANNEL_PRE_HELLO_MAX_BYTES = 4096;
/** A mirrored stderr line is truncated child-side to this many characters (one crash-detail hint, not a log). */
export const RESULT_CHANNEL_STDERR_LINE_CAP = 4096;

/** The pseudo-signal a synthesised exit carries when the socket closed before an envelope. */
export const CHANNEL_CLOSED_SIGNAL = "CHANNEL_CLOSED";
/** The pseudo-signal a synthesised exit carries when heartbeats stopped past the budget. */
export const HEARTBEAT_SILENCE_SIGNAL = "HEARTBEAT_SILENCE";

// ---------------------------------------------------------------------------
// Frames.
// ---------------------------------------------------------------------------

/** The child → parent control frames (reserved-key lines pass through as-is). */
export type ResultChannelControlFrame =
  | { readonly type: "hello"; readonly token: string; readonly nonce: string }
  | { readonly type: "heartbeat" }
  | { readonly type: "stderr"; readonly line: string };

/** Encode one control frame as an NDJSON line. */
export function encodeControlFrame(frame: ResultChannelControlFrame): string {
  return `${JSON.stringify(frame)}\n`;
}

/**
 * LF-only line buffers per stream (strict-JSONL framing; a trailing CR is left
 * for the wire parser to trim). Append separately from draining so callers can
 * check the buffered length before reading any line. Lines are consumed lazily
 * so a caller can stop mid-chunk on drop or settlement.
 */
export function createLfLineBuffer(): {
  append(chunk: unknown): number;
  lines(): Generator<string>;
} {
  let buffer = "";
  return {
    append(chunk): number {
      buffer += String(chunk);
      return buffer.length;
    },
    *lines(): Generator<string> {
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.length === 0) {
          continue;
        }
        yield line;
      }
    },
  };
}

/** The parsed shape of one inbound line. */
export type InboundFrame =
  | { readonly kind: "hello"; readonly token: string; readonly nonce: string }
  | { readonly kind: "heartbeat" }
  | { readonly kind: "stderr"; readonly line: string }
  | { readonly kind: "reserved-line"; readonly line: string }
  | { readonly kind: "ignored" };

/**
 * Classify one inbound line. A `theta_result` / `theta_progress` line is
 * forwarded verbatim (the drive's own parser judges it, exactly as it judges
 * a stdout line); a control frame is decoded; anything else is ignored — the
 * channel inherits PIC-59's stray-line tolerance.
 */
export function classifyInboundFrame(line: string): InboundFrame {
  const classified = classifyChildStdoutLine(line);
  if (classified.kind === "envelope") {
    return { kind: "reserved-line", line };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (parseError: unknown) { // allow-broad-catch: RFC-0012 result channel — a non-JSON frame is a tolerated stray line, pi-integration-contract/subagent.md
    void parseError;
    return { kind: "ignored" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "ignored" };
  }
  const record = parsed as Record<string, unknown>;
  if (Object.hasOwn(record, "theta_progress")) {
    return { kind: "reserved-line", line };
  }
  switch (record["type"]) {
    case "hello":
      return typeof record["token"] === "string" && typeof record["nonce"] === "string"
        ? { kind: "hello", token: record["token"], nonce: record["nonce"] }
        : { kind: "ignored" };
    case "heartbeat":
      return { kind: "heartbeat" };
    case "stderr":
      return typeof record["line"] === "string" ? { kind: "stderr", line: record["line"] } : { kind: "ignored" };
    default:
      return { kind: "ignored" };
  }
}
