# Bug 0319 — the prompt-mode bidirectional cancellation propagation (`thetaAbort.abort()` → the unwrapped Pi-supplied `ctx.abort()`) is implemented nowhere: no production code path ever calls the captured `ExtensionCommandContext`'s `abort()`, so a `thetaAbort` fired mid-driven-turn (the `session_shutdown` sub-step-2 co-abort is the reachable trigger) leaves the live user run streaming after the theta has already settled cancelled

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3 because the theta itself still settles
  `Err(cancelled)` promptly (every `#pollWhile` gates on
  `thetaAbort.signal.aborted`), so nothing binds a wrong value and nothing
  hangs unboundedly; the wrongness is a lifecycle leak with user-visible
  residue: the driven model turn the theta issued keeps streaming into the
  user session after the runtime reported the invocation cancelled, tokens
  keep burning, and the `session_shutdown` drain the clause exists to serve
  ("in-flight queries … drain before Pi's `ExtensionRuntime.invalidate(...)`
  runs") completes with a run the runtime never tore down. Secondary
  consequence: the settle-phase `ctx.waitForIdle()` race
  (production-theta-producer.ts:4939 at ee681f7b) carries no abort leg, so an
  abort landing inside that window sits out up to `WAIT_FOR_IDLE_BOUND_MS`
  (2000 ms, :5049) — PIC-70 pins "each bounded wait MUST stop promptly on an
  observed abort rather than sitting out its full bound", and with the
  mandated propagation in place `waitForIdle()` would resolve instead. D2
  because the captured `ctx` is already held for the invocation lifetime and
  the wiring is one listener plus the spec'd one-shot flag: on
  `thetaAbort.signal` abort during an in-flight driven turn, call the
  unwrapped `ctx.abort()`; the subtlety is scoping it to "a prompt-mode user
  turn is in flight" so an idle-time abort does not abort an unrelated user
  run.
- **Kind:** defect — a spec'd mechanism with no implementation. Elements at
  `ee681f7b` (v0.287.0):
  1. *The rule, stated twice.* `cancellation.md:9` (§Forwarding into
     `thetaAbort`, slash-command entry): "Forwarding is also bidirectional in
     prompt mode: when `thetaAbort.abort()` fires while a prompt-mode user
     turn is in flight, the runtime calls the unwrapped, Pi-supplied `abort()`
     on the captured `ExtensionCommandContext` … to tear down the user run and
     unblock `await ctx.waitForIdle()` … The propagation is guarded by a
     one-shot flag so a re-entrant `thetaAbort.abort()` does not
     double-cancel." Restated normatively in
     `pi-integration-contract/conversation-drive.md:16` (*Hang handling*):
     "`thetaAbort.abort()` invokes the unwrapped, Pi-supplied `abort()` on the
     raw `ExtensionCommandContext` Pi passes to the slash-command handler and
     the runtime captures for the theta's lifetime … which cancels the active
     user run and lets `waitForIdle()` resolve; the runtime guards the
     propagation with a one-shot flag …".
  2. *No call site.* `rg '\.abort\('` over `src/` finds three abort calls
     outside the runtime's own controllers: the setup-wrap cleanup
     `thetaAbort?.abort()` (theta-composition-producer.ts:429), the
     `session_shutdown` sub-step-2 `entry.thetaAbort.abort(abortReason)`
     (session-shutdown.ts:560), and the PIC-18 forward
     (conversation-drive.ts:178). None is the Pi-supplied
     `ExtensionCommandContext.abort()`; no listener is ever registered on
     `thetaAbort.signal` in the prompt-mode drive, and the one-shot flag the
     clause pins does not exist as code.
  3. *Every implemented reaction to `thetaAbort` is a poll gate, not a
     teardown.* The drive's waits exit early on an observed abort
     (`#pollWhile`, production-theta-producer.ts:4997) and the post-turn
     mapping synthesises `Err(cancelled)` — but the settle-phase
     `Promise.race([ctx.waitForIdle().then(…), idleBound.then(…)])`
     (:4939–4946) has no abort leg, and nothing anywhere calls into Pi to stop
     the run the theta started.
- **Related:** 0073 / 0074 / 0208 (fixed) — the same `session_shutdown`
  co-abort window, per-invocation note and registry-entry halves; this report
  is the run-teardown half of that window. 0288 (fixed) — introduced the
  bounded polls whose `thetaAbort` gates are what keep this defect from being
  a hang; its fix made the drive exit promptly *around* the still-running
  turn instead of tearing the turn down. 0295 (open) — child-side
  cancellation classification; independent mechanism.
- **Affected:** `src/extension/production-theta-producer.ts:4904` (the only
  ctx→thetaAbort forward inside the driven turn — one direction),
  `:4939–4946` (abort-blind `waitForIdle` race), `:4997` (`#pollWhile` abort
  gate — the compensating exit), `:5049` (`WAIT_FOR_IDLE_BOUND_MS`);
  `src/extension/theta-composition-producer.ts:423` and
  `src/extension/production-theta-producer.ts:1800` (the two invocation-scoped
  forwards, both one-directional); `src/runtime/conversation-drive.ts:160–180`
  (PIC-18 five-event forward, one direction); `src/extension/session-shutdown.ts:560`
  (the reachable production trigger). All verified at `ee681f7b`.
- **Observed at:** v0.287.0 (`ee681f7b`), offline. Witnessed by a scratch
  vitest probe over the real producer (`createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`) against the bug-0288
  scripted-session harness pattern; probe deleted after the run.

## Summary

Cancellation forwarding into `thetaAbort` is implemented at all its entries
(slash `ctx.signal`, PIC-18 event handlers, `agent_end` synthesis,
invoke-parent derivation, subagent kill listener), but the reverse direction
the spec pins for prompt mode — `thetaAbort.abort()` while a driven user turn
is in flight → the unwrapped Pi `ctx.abort()` — has no implementation. The
runtime never tells Pi to stop the run it started. The theta's own drive
still exits promptly because every poll gates on `thetaAbort.signal.aborted`,
so the divergence is invisible on the `Result` surface: the query answers
`Err(cancelled)` exactly as specified. What diverges is everything the clause
names as its purpose: the user run is not torn down (the model keeps
streaming the rest of its turn into the user session after the invocation
settled cancelled), and `await ctx.waitForIdle()` is not unblocked (the drive
instead relies on its bounded race expiring, up to 2000 ms).

The reachable production trigger for a mid-turn `thetaAbort` that does not
originate from Pi's own turn cancel is the `session_shutdown` sub-step-2
co-abort (`/reload`, `/new`, fork, quit with a prompt-mode theta mid-query):
Esc-during-turn flips `ctx.signal` first, so on that path Pi has already torn
its own run down and the missing bridge is masked.

## Reproduction

Offline, against the real producer (the bug-0288 harness pattern:
`createProductionProducerDeps` with a scripted in-memory session double whose
injected `Clock.setTimeout` is the drive's only wait primitive):

1. Theta: `---\nmode: prompt\n---\nlet v = @`Ping`?\nv\n`.
2. Session script: the driven turn starts streaming after one poll and never
   settles (`isIdle()` stays `false`).
3. `ctx` double carries an `abort()` spy; `bindPromptConversation` is given an
   externally held `thetaAbort`.
4. On the fifth `Clock.setTimeout` tick — the drive is inside its end-poll,
   the run observably streaming — abort the controller with
   `new Error("theta cancelled by session shutdown")` (the sub-step-2 shape).

Observed (probe run at `ee681f7b`):

```
OUTCOME: cancel
ctxAbortCalls: 0
user run still active after theta settled: true
ticks consumed: 5
```

The drive settles the cancel outcome on the next poll after the abort
(compensating gate at :4997), the Pi-supplied `abort()` is never invoked, and
the session double still reports the run active after `executeBody` returned.
A compliant runtime flips all three: `ctxAbortCalls ≥ 1`, run torn down,
`waitForIdle()` resolved by the teardown rather than bypassed.

## Expected behaviour

`cancellation.md:9`: when `thetaAbort.abort()` fires while a prompt-mode user
turn is in flight, the runtime calls the unwrapped, Pi-supplied `abort()` on
the captured `ExtensionCommandContext` — explicitly not the synthesised
tool-execution wrapper — "to tear down the user run and unblock
`await ctx.waitForIdle()`", guarded by a one-shot flag against re-entrant
double-cancel. `conversation-drive.md:16` (*Hang handling*) restates it as
the mechanism that "cancels the active user run and lets `waitForIdle()`
resolve", and (PIC-70) requires every bounded wait to "stop promptly on an
observed abort rather than sitting out its full bound". The
`session_shutdown` paragraph of `cancellation.md` gives the trigger its
purpose: in-flight queries drain before `ExtensionRuntime.invalidate(...)`.

## Actual behaviour / root cause

No production module registers a `thetaAbort.signal` listener that reaches
Pi, and no code path calls `ExtensionCommandContext.abort()` (grep evidence
under **Kind** element 2). The drive's only reactions to `thetaAbort` are
read-side: `#pollWhile` exits early (:4997), `#recordLifecycleExpiry`
suppresses the transport `Err` when aborted, and
`extractPromptModeQueryResult` synthesises `Err(cancelled)`. The settle-phase
`waitForIdle` race (:4939–4946) races only the host idle flag against a
2000 ms clock bound — no abort leg — so an abort landing there waits out the
bound. The run itself is never cancelled: `pi.sendUserMessage` has no cancel
surface, and the one Pi-supplied cancel handle the spec names is the captured
`ctx.abort()` the runtime never touches.

## Why it matters

- After a `/new`/`/reload`/fork/quit delivered mid-`@`-query, the runtime
  reports the invocation cancelled while the model turn it issued keeps
  streaming into the (old) user session — committed conversation state and
  token spend continue after the reported cancellation, and the
  `session_shutdown` drain finishes with the run still live. Whether the host
  happens to kill the run afterwards is Pi's choice; the spec assigns the
  teardown to the runtime.
- The *Hang handling* escape hatch is half-missing: for a turn whose host
  idle flag never clears, the spec offers cancellation as "the other way out"
  via run teardown; the implementation instead exits around the stuck run and
  leaves it stuck.
- PIC-70's stop-promptly-on-abort obligation is violated in the
  `waitForIdle`-race window (up to 2000 ms of dead wait per cancelled query
  that lands there).

## Non-goals

- The `Err(cancelled)` surfacing, the SLSH-4 note, reason propagation
  (CNCL-4), and the poll-gate early exits are all correct and in scope of
  existing green tests — this report does not touch them.
- The subagent-mode counterpart (PIC-66 kill listener) is implemented
  (`attachSubagentCancellation`, subagent-json-driver.ts:235) and is not at
  issue.
- Esc-during-turn end-to-end behaviour is unaffected in practice (Pi tears
  down its own run on that path before the forward fires).

## Fix

Register the bidirectional bridge where the driven-turn window is known —
`LivePromptQueryModel` owns both the captured raw `ctx` and the turn
lifecycle. Options:

1. **Per-turn listener (recommended).** Around each driven turn
   (`#driveUserVisibleTurn`), attach a `{ once: true }` listener on
   `thetaAbort.signal` that calls the unwrapped `ctx.abort()` inside a
   `try`/`catch` (a throw routes per the forwarding-listener-throw clause),
   detach it in the turn's `finally`, and guard with the spec'd one-shot flag
   held per invocation. In-flight-only scoping is structural: the listener
   exists only while a turn is being driven. Also add the abort leg to the
   `waitForIdle` race (or rely on the teardown resolving `waitForIdle`).
   Tradeoff: per-turn attach/detach churn; correct by construction on the
   "while a user turn is in flight" condition.
2. **Invocation-scoped listener with an in-flight flag.** One listener at
   bind time consulting a `turnInFlight` boolean the drive maintains.
   Tradeoff: less churn, but the flag must be maintained across every drive
   path (untyped, free phase, repair follow-ups) and a stale flag aborts an
   unrelated user run — the exact hazard option 1 avoids.

Any fix must keep the double-Esc no-op property (one-shot flag + the
`AbortController` no-op on re-abort) and must not call the synthesised
tool-execution wrapper (re-entrancy: its body calls `thetaAbort.abort()`).

## Provenance

Bug-hunt campaign wave 2, area `cancellation-races`, hunted at `ee681f7b`
(v0.287.0). Mechanical witness: scratch vitest probe (deleted) over the real
producer + scripted session double; grep sweeps for `.abort(` /
`ExtensionCommandContext.abort` / `thetaAbort.signal.addEventListener` over
`src/`. Existing suites `tests/cancellation-core.test.ts`,
`tests/production-cancellation-wiring.test.ts`,
`tests/checkpoint-granularity.test.ts`, `tests/binder-call-cancellation.test.ts`
all green at this HEAD (47/47) — none asserts the bidirectional direction.
