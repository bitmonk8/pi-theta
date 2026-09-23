// The turn-settlement polling model: the driven turn's poll cadence and lifecycle bounds, and the settled-turn predicates over the producer's built Message[] read surface.

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { Message } from "@earendil-works/pi-ai";
import type { Clock } from "../seams/clock";

/** Poll cadence (ms) while waiting for a fire-and-forget user turn's stream lifecycle. */
const POLL_INTERVAL_MS = 10;

/**
 * Bound on the pre-send gate (§Fix item 1): waiting for the session to report
 * no run in flight before this query's own send is issued.
 */
const PRE_SEND_GATE_POLL_BOUND = 1000;

/** Bound on start-phase polls (≈ waiting for the run to begin streaming). */
const TURN_START_POLL_BOUND = 1000;

/**
 * Bound on end-phase polls (≈ waiting for the streamed run to go idle again).
 * Bug 0288 §Fix item 4 reduced this to 6000 polls (60 s) for diagnosability;
 * bug 0464 raised it back out: a legitimate on-session turn's tool loop — a
 * reviewer reading a file set, a fixer running a full offline test suite —
 * runs for many minutes, and a 60 s total bound failed every such turn by
 * construction (`transport` expiry while the run was still healthily
 * streaming). 180000 polls × 10 ms = 30 min. Test diagnosability is
 * unaffected: the witness harnesses drive `#pollWhile` on an injected fake
 * `Clock`, so wall time does not scale with the bound. The known follow-up
 * (recorded in bug 0464) is an inactivity-reset bound — budget renewed on
 * observed turn progress — instead of one fixed total.
 */
const TURN_END_POLL_BOUND = 180000;

/**
 * The settle-phase bound in milliseconds, exported for the bug-0464 witness:
 * a regression back to a test-scale total bound must red loudly, because it
 * kills every legitimately long tool-loop turn in production.
 */
export const TURN_END_SETTLE_BOUND_MS = TURN_END_POLL_BOUND * POLL_INTERVAL_MS;

/**
 * Bound (ms) on the `ctx.waitForIdle()` race (§Fix item 4 / D5): replaces the
 * unbounded await at HEAD (P5/P6) with a `Clock`-driven race so a settle path
 * that never resolves the flag presents as a loud named expiry.
 */
const WAIT_FOR_IDLE_BOUND_MS = 2000;

/**
 * Bound on the final settle-poll (§Fix item 4): waiting for THIS turn's own
 * message-list slice to read as settled once the idle-flag wait has cleared.
 */
const TURN_SETTLE_POLL_BOUND = 1000;

/** Release the event loop for one poll interval through the injected `Clock` seam. */
function macrotask(clock: Clock, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    clock.setTimeout(() => resolve(), ms);
  });
}

// --- Bug 0288 §Fix items 1/3/4 — the settled-turn predicate, producer-side ---
//
// D4 (adjudicated in-lane): implemented over the producer's OWN built
// `Message[]` read surface (`#readMessages()`), not factored into
// `src/runtime/` for sharing with `tests/live/harness.ts`. The harness reads
// raw `SessionManager` entries (`classifyLastTurn`/`captureSettledTurn`
// since bug 0289's fix, 0.286.0); this reads built `Message[]` — the two
// surfaces differ, so this is an independent implementation of the same
// idea, not a shared function.

/**
 * Whether the slice AFTER a turn's own `user`-role message is a SETTLED
 * ending. Two disjoint arms:
 *
 *   1. A trailing `assistant` message exists — whatever its `stopReason`, with
 *      or without text. PIC-51b pins the whole trailing-`assistant` set as
 *      DEFINITE outcomes: `"error"` and the non-normal terminators classify
 *      as `transport`, `"length"` as `context_overflow`, and an EMPTY-TEXT
 *      assistant on a normal boundary reaches PIC-53's `Ok("")` (the pure
 *      tool-use turn). Narrowing this arm to "non-empty text, or `stopReason`
 *      `"error"`/`"aborted"`" would read those definite outcomes as an
 *      in-flight turn, mint a lifecycle `TransportError` where PIC-51b
 *      mandates a different classification, and never let the turn settle.
 *      Settledness is only ever consulted once the run has been observed
 *      IDLE, so no message can still be accruing when this arm fires.
 *      Classification itself stays with `extractPromptModeQueryResult`, the
 *      single implementation of the PIC-51 / PIC-51b / PIC-53 ordering — this
 *      predicate decides only "the turn is over", never "what it means".
 *   2. A tool-result-only ending: the slice's last message is a
 *      `ToolResultMessage` with nothing generated after it — a tool round the
 *      host committed with no assistant entry of its own yet.
 */
function isSettledTurnEnding(afterUser: readonly Message[]): boolean {
  for (let i = afterUser.length - 1; i >= 0; i -= 1) {
    if (afterUser[i]?.role === "assistant") {
      return true;
    }
  }
  const last = afterUser[afterUser.length - 1];
  return last !== undefined && last.role === "toolResult";
}

/**
 * Locate the slice after the LAST `user`-role message at or after
 * `fromIndex` in `messages` (bug 0288 §Fix item 1/3/4). `fromIndex` bounds the
 * search to a particular turn's own send: a `user` entry recorded BEFORE it
 * belongs to an earlier, already-settled turn and must never be mistaken for
 * this turn's own anchor — the exact silent failure P2 describes
 * (`extractTrailingTurnText` anchoring on the wrong turn's `user` entry).
 */
function turnSliceSince(
  messages: readonly Message[],
  fromIndex: number,
): { readonly opened: boolean; readonly after: readonly Message[] } {
  for (let i = messages.length - 1; i >= fromIndex; i -= 1) {
    if (messages[i]?.role === "user") {
      return { opened: true, after: messages.slice(i + 1) };
    }
  }
  return { opened: false, after: [] };
}

/**
 * Whether THIS turn — the one whose own `pi.sendUserMessage` was issued when
 * `#readMessages().length` was `turnStart` — has settled. Requires the turn's
 * OWN `user` entry to exist at or after `turnStart`: an inert/swallowed send
 * (bug doc P3: the `isStreaming`-without-`streamingBehavior` throw appends NO
 * user entry) can never read as settled no matter what the rest of the
 * transcript looks like.
 */
function thisTurnSettled(
  messages: readonly Message[],
  turnStart: number,
  path: readonly SessionEntry[],
): boolean {
  const slice = turnSliceSince(messages, turnStart);
  return slice.opened && isSettledTurnEnding(slice.after) && !trailingCompactionUnanswered(path);
}

/**
 * Bug 0482 (conversation-drive.md PIC-70): whether the chronological leaf
 * path ends in a `compaction` entry with NO assistant reply (or settling
 * `toolResult`) after it. Auto-compaction is transparent to the conversation
 * (`docs/compaction.md` in the pi package) — a trailing, unanswered
 * compaction means the turn is still in flight, so the drive must wait
 * through it; PIC-70's settle-phase expiry is the loud backstop when no
 * reply ever follows.
 */
function trailingCompactionUnanswered(path: readonly SessionEntry[]): boolean {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const entry = path[i];
    if (entry === undefined) {
      continue;
    }
    if (entry.type === "compaction") {
      return true;
    }
    if (entry.type === "message" && (entry.message.role === "assistant" || entry.message.role === "toolResult")) {
      return false;
    }
  }
  return false;
}

export { POLL_INTERVAL_MS, PRE_SEND_GATE_POLL_BOUND, TURN_START_POLL_BOUND, TURN_END_POLL_BOUND, WAIT_FOR_IDLE_BOUND_MS, TURN_SETTLE_POLL_BOUND, macrotask, thisTurnSettled };
