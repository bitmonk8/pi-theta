// Bug 0018 — detection of the host's stale-ctx invalidation error.
//
// Pi invalidates an extension runtime on session replacement/reload AND on a
// bare `AgentSession.dispose()` (a public SDK API — `dist/core/agent-session.js`
// calls `_extensionRunner.invalidate(...)` WITHOUT emitting `session_shutdown`
// first, unlike every replacement path). After invalidation every guarded
// `pi.*` member and `ctx.*` getter throws `Error(staleMessage)`. The host
// exposes NO non-throwing staleness probe (`staleMessage` is private; there is
// no `isStale`/`isActive` member and no event on the bare-dispose path), so the
// ONLY way theta can learn of a shutdown-less invalidation is to touch a
// guarded surface and recognise the thrown error. This module is the single
// definition of that recognition (spec:
// pi-integration-contract/session-shutdown-semantics.md PIC-67).

/**
 * The stable prefix of the host's stale-ctx invalidation message. Every
 * `invalidate(...)` call site in the pinned host (`dist/core/agent-session.js`
 * bare dispose, `dist/core/extensions/loader.js` / `runner.js` defaults) uses
 * the same text, beginning with this sentence; only the prefix is matched so a
 * host wording tweak to the guidance tail does not break detection.
 */
export const STALE_CTX_MESSAGE_PREFIX =
  "This extension ctx is stale after session replacement or reload";

/**
 * Whether a caught throw is the host's stale-ctx invalidation error (the
 * `assertActive()` throw from a guarded `pi.*` / `ctx.*` touch on an
 * invalidated runtime). Callers MUST inspect-and-rethrow anything this returns
 * `false` for — the helper exists so no catch that keys on staleness swallows
 * an unrecognised error (conventions: specific exception types only).
 */
export function isStaleCtxError(error: unknown): error is Error {
  return (
    error instanceof Error && error.message.startsWith(STALE_CTX_MESSAGE_PREFIX)
  );
}

/**
 * The greppable prefix of the single fail-loud stderr line a stale-quiesced
 * watcher emits (PIC-67 clause (b)). Distinct from the PIC-54 terminal
 * `system-note delivery failed:` prefix: quiescence is a designed outcome, not
 * a delivery-fallback cascade.
 */
export const STALE_QUIESCE_STDERR_PREFIX = "theta hot-reload quiesced:";

/**
 * The PIC-67 fail-loud-once stderr latch: `log` emits one
 * `theta hot-reload quiesced:` line for the FIRST evidence of a shutdown-less
 * runtime invalidation and suppresses every later call. One instance per
 * extension instance, shared across the evidence sites — the reload-pass
 * quiesce (hot-reload.ts) and the PIC-55 terminal arm (watcher-recovery.ts) —
 * so the whole instance emits at most one line no matter which site observes
 * the stale runtime first. Constructed per install and injected (no
 * module-level state).
 */
export class StaleQuiesceLog {
  #logged = false;

  /** Emit `<prefix> <detail>` on the first call; no-op thereafter. */
  log(detail: string): void {
    if (this.#logged) {
      return;
    }
    this.#logged = true;
    try {
      console.error(`${STALE_QUIESCE_STDERR_PREFIX} ${detail}`);
    } catch (consoleError: unknown) { // allow-broad-catch: PIC-67 — session-shutdown-semantics.md#pic-67
      // Last-resort stderr sink, defended on the same footing as the PIC-54
      // terminal line: a `console.error` throw (closed stdio, fd exhaustion,
      // a console-proxying host) is swallowed so it cannot unwind the
      // evidence site that observed the stale runtime — e.g. escape the
      // PIC-55 terminal arm into the FileWatcher seam's terminate dispatch.
      // The latch is set before the write, so a swallowed throw is never
      // retried (at-most-once stays intact).
      void consoleError;
    }
  }
}
