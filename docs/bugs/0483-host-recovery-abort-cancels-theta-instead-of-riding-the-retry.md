# Bug 0483 — a host-recovery abort (pi-retry's stall watchdog `ctx.abort()` + retryable rewrite) cancels the whole theta invocation instead of riding through the host's retry of the driven turn

- **Status:** open — design + measurement pending. Observed live once, at the
  most benign possible site (below); the exposure is structural.
- **Sev/Diff estimate:** S2/D3 — S2: a stall-watchdog abort during ANY driven
  turn of a long-running theta cancels the entire invocation (a 43-minute
  quality-loop wave would lose its in-flight phase; this occurrence cost
  nothing only because it landed on the final report turn AFTER the store
  commit). Children load the same user-level extensions, so a child-side
  stall-abort Errs its lane identically. D3: the fix needs a cancellation.md
  contract amendment plus measurement of pi's retry-after-abort behaviour.
- **Observed (wave qw20260917121953, 2026-09-17, pi 0.85.1 + pi-theta
  0.481.0 + @narumitw/pi-retry):** the loop ran 43m17s to completion — 34
  candidates triaged (14 confirmed, 6 rejected, 14 questionable, 0 triage
  failures), 4 clusters fixed and integrated, store committed
  (head 9bb0bc1d) — then the FINAL statement (the untyped report `@`-query)
  streamed its full reply and the stream went silent ≥90 s. pi-retry's stall
  watchdog fired: `ctx.abort()`, then on the aborted turn's `message_end` it
  rewrote the message to `stopReason: "error"` + errorMessage tagged
  `[stall-watchdog-retry] provider returned error; treating stalled provider
  stream as retryable.` so pi's own `retry.enabled` machinery re-runs the
  turn. Theta's prompt-mode cancellation forwarding
  (cancellation.md §"Forwarding into `thetaAbort`"; bug 0319 one-shot) read
  the abort as the invocation's cancellation first:
  `theta /quality-loop cancelled`. The user did not press ESC.

## Why this is theta's defect

The watchdog's abort-then-retry is a HOST RECOVERY of the driven turn, not
an intent to stop the theta — the host marks that intent explicitly (the
`[stall-watchdog-retry]` tag on the settled turn, the retry that follows).
Theta's abort forwarding fires at signal time, before the distinguishing
observable exists, and is one-shot by design, so the invocation is dead by
the time the turn settles as "retryable". At the extension surface a
`ctx.abort()` from another extension is indistinguishable from user ESC
UNTIL the turn settles.

## Candidate contract (to be measured, then specified)

On observing the driven-turn abort, DEFER the cancellation decision until
the aborted turn settles (pi settles it promptly — the abort itself ends the
run): if the settled trailing turn is an error-stop whose errorMessage
matches the host's own retryable classification (pi's retry machinery will
re-run it — observably: a fresh `before_provider_request` for the same
logical turn), the drive re-arms and waits for the retried turn's result
instead of cancelling; any other aborted settle (plain `stopReason:
"aborted"`, no retry) cancels exactly as today. User-ESC latency cost: one
settle wait (milliseconds). Open measurements: (a) does pi's retry re-run
the turn in the SAME run or a new one (PIC-53 window accounting must
tolerate whichever); (b) does the retried turn re-stream into the same
trailing-assistant position the PIC-51/PIC-53 probes read; (c) the
subagent-child twin (the child's own drive has the same forwarding).

## Operational stopgaps (until fixed)

- The loop is wave-resumable and commits incrementally, so a mid-loop
  cancellation loses only the in-flight phase; re-running `/quality-loop`
  continues from the store.
- `--retry-stall-timeout-ms <ms>` / `PI_RETRY_STALL_TIMEOUT_MS` can raise
  the 90 s default (fewer tail-stall aborts, slower recovery of real
  stalls), or `0`/`off` disables the watchdog (a true stall then hangs the
  drive until ESC — theta itself has no wall-clock ceiling by design,
  NOCEIL-1).

## Related

- Bug 0319 (the one-shot forwarding guard the deferral must compose with).
- Bug 0482 (the other host-mechanism-vs-drive seam: auto-compaction).
- `@narumitw/pi-retry` `src/retry.ts` (`armStallWatchdog`, the
  `message_end` rewrite, `DEFAULT_STALL_TIMEOUT_MS = 90_000`).
