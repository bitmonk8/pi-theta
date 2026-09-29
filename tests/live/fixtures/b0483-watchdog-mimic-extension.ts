// Bug 0483 live fixture — a third-party pi extension that mimics pi-retry's
// stall watchdog on exactly ONE driven turn, loaded beside the shipped theta
// entry through `bootShippedExtension`'s `extraExtensionPaths`
// (tests/live/harness.ts). Test-support only; pi loads it through jiti.
//
// The host mechanics it reproduces are the upstream pi-retry contract the bug
// 0483 §Fix measured (the pi-config fork's `armStallWatchdog` abort and its
// `message_end` rewrite):
//   1. on the first `message_update` of the session — the first streamed
//      delta of the theta's first driven `@`-query turn — call the
//      extension-context `ctx.abort()`, which aborts the same per-run
//      `ctx.signal` a user ESC aborts;
//   2. on that aborted turn's assistant `message_end`, return a replacement
//      message with `stopReason: "error"` and the errorMessage suffixed with
//      the `[stall-watchdog-retry]` tag and "provider returned error" — the
//      text pi-ai's `isRetryableAssistantError` (the host's own retry
//      classifier) accepts. pi 0.80.10 applies a `message_end` handler's
//      returned `message` in place (`ExtensionRunner.emitMessageEnd` →
//      `AgentSession._replaceMessageInPlace`) before persisting it.
// It fires once per extension load (closure state inside the factory), so
// the continuation / retried turn and every later turn complete normally.
//
// The mimic publishes nothing: a cell proves it fired from the settled
// transcript, where the rewritten assistant entry persists with the tagged
// errorMessage (exactly one such entry, ahead of any continuation turn).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** The pi-retry tag and retryable hint, byte-identical to the fork's rewrite. */
export const STALL_WATCHDOG_REWRITE_SUFFIX =
  "[stall-watchdog-retry] provider returned error; treating stalled provider stream as retryable.";

/** The errorMessage used when the aborted message carries none (the fork's fallback shape). */
export const STALL_WATCHDOG_FALLBACK_ERROR = "Request aborted";

export default function watchdogMimic(pi: ExtensionAPI): void {
  let fired = false;
  let waitingForAbortedMessage = false;

  pi.on("message_update", (_event, ctx) => {
    if (fired) {
      return;
    }
    fired = true;
    waitingForAbortedMessage = true;
    ctx.abort();
  });

  pi.on("message_end", (event) => {
    if (!waitingForAbortedMessage || event.message.role !== "assistant") {
      return undefined;
    }
    waitingForAbortedMessage = false;
    const message = event.message;
    const original =
      typeof message.errorMessage === "string" && message.errorMessage.length > 0
        ? message.errorMessage
        : STALL_WATCHDOG_FALLBACK_ERROR;
    const errorMessage = `${original}\n\n${STALL_WATCHDOG_REWRITE_SUFFIX}`;
    return { message: { ...message, stopReason: "error", errorMessage } };
  });
}
