// Bug 0483 §Fix item 1 — the host-recovery settle classifier.
//
// A mid-turn `ctx.signal` abort is indistinguishable, AT SIGNAL TIME, from a
// user ESC: a stall-watchdog `ctx.abort()` (`@narumitw/pi-retry`'s
// `armStallWatchdog`) and a genuine cancel both abort the SAME per-run signal,
// no marker, no reason difference (docs/bugs/0483-…md §"Measured host
// facts"). The two ARE distinguishable once the aborted turn settles: a host
// recovery rewrites the trailing assistant to `stopReason: "error"` with an
// errorMessage the host's OWN retry classifier accepts — `AgentSession`'s
// `_isRetryableError`: pi-ai's `isContextOverflow` exclusion, then pi-ai's
// `isRetryableAssistantError`; a genuine cancel settles
// `stopReason: "aborted"` (or with no assistant at all). This module owns
// exactly that settle-time classification; the deferral / ride / cancel
// mechanics live in `live-prompt-query-driver.ts`.
//
// Spec: pi-integration-contract/conversation-drive.md PIC-78.

import { isContextOverflow, isRetryableAssistantError, type AssistantMessage, type Message } from "@earendil-works/pi-ai";
import { PROMPT_MODE_NORMAL_STOP_REASONS } from "../runtime/prompt-transport-mapping";

/**
 * The three dispositions a settled, host-abort-observed driven turn can
 * classify to (bug 0483 §Fix item 1):
 *
 *   - `"recovering"` — the final assistant is a host-retryable error-stop; the
 *     driver rides the recovery (a fresh continuation send, bounded).
 *   - `"recovered"` — the final assistant settled on a normal boundary (the
 *     PIC-51b normal-terminator set, `PROMPT_MODE_NORMAL_STOP_REASONS`) AND an
 *     earlier retry-classified error-stop is present in the turn slice (pi
 *     ≤ 0.86's in-run core retry already re-ran the turn while the abort was
 *     in flight — `_prepareRetry` keeps the failed assistant in session
 *     history).
 *   - `"cancel"` — everything else: a trailing `"aborted"` settle, a
 *     non-retryable error-stop, a non-normal terminator (`"length"`, a
 *     content filter, anything unrecognised), a clean settle with no retry
 *     residue, or no assistant at all.
 */
export type HostRecoverySettleClassification = "recovering" | "recovered" | "cancel";

/**
 * The bounded count of continuation re-drives the driver issues per driven
 * turn on the `"recovering"` arm — a COUNT bound, not a wall-clock one
 * (NOCEIL-1 stays intact: a settle that keeps recovering rides up to this
 * many times, then the tagged error-stop surfaces as a loud
 * `Err(transport)`).
 */
export const PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND = 3;

/**
 * The fixed continuation prompt the driver sends on each recovery ride: the
 * model's previous reply was interrupted mid-stream by the host's own
 * transient-failure retry machinery, not by anything the query asked for.
 */
export const PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT =
  "Your previous response was interrupted by a transient provider failure and retried. " +
  "Continue from where you left off; if the final answer was already complete, repeat it in full.";

/**
 * The host's own retry predicate over one assistant message, composed exactly
 * as `AgentSession._isRetryableError` composes it: a context overflow is never
 * retried (the host routes it to compaction), even though
 * `isRetryableAssistantError`'s unanchored patterns accept overflow texts such
 * as `prompt is too long: 205000 tokens > 200000 maximum`. `contextWindow` is
 * the session model's window, `0` when no model is selected — the host's own
 * fallback. The `stopReason` check runs first so `isContextOverflow` never
 * reaches its usage-based arms, which read `usage` and apply only to non-error
 * stops.
 */
function isHostRetryableErrorStop(message: AssistantMessage, contextWindow: number): boolean {
  return (
    message.stopReason === "error" &&
    !isContextOverflow(message, contextWindow) &&
    isRetryableAssistantError(message)
  );
}

/**
 * Classify a settled, host-abort-observed driven turn (bug 0483 §Fix item 1).
 *
 * `turnSlice` is this turn's own message slice (from the turn's `turnStart`
 * anchor through the end of the session's message list — the same span
 * `extractTrailingTurnText`/PIC-53 reads). `finalAssistant` is the slice's
 * LAST `assistant`-role message, or `undefined` when the slice carries none.
 * `contextWindow` is the session model's context window (`ctx.model`), `0`
 * when no model is selected.
 */
export function classifyHostRecoverySettle(
  turnSlice: readonly Message[],
  finalAssistant: AssistantMessage | undefined,
  contextWindow: number,
): HostRecoverySettleClassification {
  if (finalAssistant !== undefined && isHostRetryableErrorStop(finalAssistant, contextWindow)) {
    return "recovering";
  }
  if (finalAssistant !== undefined && PROMPT_MODE_NORMAL_STOP_REASONS.has(finalAssistant.stopReason)) {
    // A normal-boundary settle: recovered iff the turn slice carries EARLIER
    // retry residue — the ≤ 0.86 in-run core retry keeps the failed
    // assistant in session history alongside the retried one. A non-normal
    // terminator is not a settled recovery even with residue present: PIC-51b
    // owns its failure mapping, and a recorded abort over it cancels.
    const hasRetryResidue = turnSlice.some(
      (message): boolean =>
        message.role === "assistant" &&
        message !== finalAssistant &&
        isHostRetryableErrorStop(message, contextWindow),
    );
    if (hasRetryResidue) {
      return "recovered";
    }
  }
  return "cancel";
}
