# Bug 0502 — on pi ≥ 0.87 a driven send's PRE-PROMPT compaction reads non-idle before any run exists, then idle again before the run starts: the start poll takes the compaction for the run, the end poll exits in the gap, and the whole driven run is covered by the 10 s settle bound instead of the 30-min end bound — mid-run settle reads bind partial answers silently (0.494.0) or expire falsely (0.495.0), and a user ESC during that run is never observed as a cancellation

- **Status:** open — filed 2026-09-29 (0501 fix release review, round 2;
  pre-existing on main 0.494.0; interacts with the 0501 fix targeting
  0.495.0 — its idle guard trades this bug's silent binds for loud false
  expiries, recorded there as the accepted trade)
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S2/D2 — S2: on shipped 0.494.0 the mid-run
  settle read binds SILENTLY WRONG values on any ≥ 0.87 host: a driven
  turn with tool rounds binds the FIRST round's narration as the query's
  `Ok` while the run is still executing (probe B2 —
  `Ok("Reading the first file.")`; the real final answer never seen),
  and a direct reply is bound while the run still works (B3 — right value
  by luck; B2 is the wrong-value twin). The trigger is a driven send onto
  a session near the host's compaction threshold — ordinary long-session
  operation, selecting the heaviest sessions by construction. After the
  0501 fix (0.495.0) the idle guard converts those silent binds into loud
  FALSE 10 s expiries: every driven run longer than 10 s in this state
  fails as `Err(transport, retryable: false)` after burning its full
  token cost, with the committed reply discarded. In BOTH eras an
  operator ESC during such a run is unobservable — the query ends
  `Err(transport)`, never `Err(cancelled)` (probe C1) — so the
  cancellation contract (CNCL-4 reason forwarding) is silently lost
  exactly when a user tries to stop a runaway driven turn. D2:
  driver-side poll restructuring (settle reads re-entering the end-phase
  wait on a non-idle read; gap detection in the start/end polls) plus
  session-double witnesses; the 0501 fix's `ownUserAt` machinery is a
  usable building block; no new host machinery.
- **Where (pi-theta, main a98e6881, 0.494.0):**
  - `src/extension/live-prompt-query-driver.ts:1026–1031` — start poll:
    `ctx.isIdle() && !thisTurnSettled(…)` — clears on the FIRST non-idle
    read, inferring "the driven run started"; `:1050–1052` — the
    `DeferredHostAbort` recorder is created and follows `ctx.signal`
    once; `:1069–1075` — end poll: exits on the first idle read, and its
    non-idle reads are the ONLY sites that ever re-arm the recorder on
    `ctx.signal`; `:1080–1135` — bounded `waitForIdle` race; `:1137–1139`
    — settle bound selection: full `TURN_SETTLE_POLL_BOUND` with no
    recorded abort; `:1154–1159` — settle poll over `thisTurnSettled`
    with NO idle conjunct; `:1186–1189` — expiry →
    `mapPromptModeTurnLifecycleExpiry("settle", …)`
    (`src/runtime/prompt-transport-mapping.ts:118`, `retryable: false`).
  - `src/extension/turn-settlement.ts:8/:17/:32/:52` — `POLL_INTERVAL_MS`
    10 ms, `TURN_START_POLL_BOUND` 1000 (10 s), `TURN_END_POLL_BOUND`
    180000 (30 min), `TURN_SETTLE_POLL_BOUND` 1000 (10 s); `:93–101` —
    `isSettledTurnEnding` accepts ANY trailing assistant or a
    toolResult-only ending, with the documented premise "Settledness is
    only ever consulted once the run has been observed IDLE" — the
    premise this gap breaks.
  - (0501 fix, branch b0501 @ feae240a, targets 0.495.0)
    `src/extension/live-prompt-query-driver.ts:1204–1210` — the idle
    guard on BOTH settle reads (`anchoredSettled`,
    `trailingSettledSlice`) stops the mid-run binds but does not close
    the gap: the run is then covered only by the 10 s settle bound, which
    expires falsely on any longer run.
- **Where (host):**
  - pi 0.87.1 (operator's global install)
    `dist/core/agent-session.js:876` — `isIdle` =
    `!this._isAgentRunActive && !this.isCompacting`; `:928–933` —
    `isCompacting` keys on the auto-compaction abort controller; `:1278`
    — `prompt()`'s pre-prompt `_checkCompaction(lastAssistant, false)`
    runs BEFORE `_runAgentPrompt` sets `_isAgentRunActive = true`
    (`:1080`): during the compaction the session reads NON-IDLE with no
    run active; the compaction's `finally` (`:2276–2281`) clears the
    controller and resolves idle waiters, after which the session reads
    IDLE while `prompt()` still awaits `emitBeforeAgentStart` (`:1283`;
    `dist/core/extensions/runner.js:1037` awaits each
    `before_agent_start` handler) and message building — any macrotask
    yield in that span (a handler doing real async work) exposes the gap
    to a 10 ms poll tick.
  - pi 0.87.1
    `node_modules/@earendil-works/pi-agent-core/dist/agent.js:212–214` —
    `get signal()` = `activeRun?.abortController.signal`: `undefined`
    during the pre-prompt compaction (no agent run exists) and again once
    a run ends (`finishRun`, `:378–384`, clears `activeRun`) — the
    recorder can only observe a run's signal WHILE it reads that run
    non-idle, which in the gap it never does.
  - pi 0.80.10 (repo devDependency)
    `dist/core/agent-session.js:598–600` — `isIdle` =
    `!this._isAgentRunActive` ONLY: the same pre-prompt
    `_checkCompaction` (`:866–869`) leaves the session reading IDLE, so
    the start poll waits THROUGH the compaction and clears only when the
    real run sets `_isAgentRunActive` — no gap; the end poll covers the
    run (verified). Residual exposure there: the pre-prompt compaction
    consumes the start poll's own 10 s bound, so a longer compaction
    expires the start phase loudly — bounded and loud, not this bug's
    silent shape.

## Observed (2026-09-29, 0501 fix release review, round 2 — scripted probes, not live)

Reviewer probe harness — a 0.87.1-timing session double (`isIdle` =
`!runActive && !compacting`; `ctx.signal` undefined outside a run) with
built messages projected through pi 0.87.1's REAL `buildSessionContext`
(`vi.mock`): probe source
`C:/UnitySrc/pi-theta-b0501/.pi/tmp/review0501/zz-r2-probe.test.ts.txt`,
logs `r2-probe-base.log` (main 0.494.0) and `r2-probe-fix.log` (b0501 @
feae240a). Every cell drives one untyped query (``let v = @`Ping`?``) whose
send triggers a pre-prompt compaction followed by a 3-poll idle gap
before the real run:

| Cell | Shape | main 0.494.0 | 0501 fix (→ 0.495.0) |
|---|---|---|---|
| B1 | drifted anchor (3 prior exchanges summarised below `turnStart`), reply lands after 1500 busy polls (run ≈ 15 s > settle bound) | `Err(transport)` settle expiry 10 s, `retryable: false`, minted while the host run still ran | same expiry |
| B2 | anchored (1 prior exchange), tool round → 1500 busy polls → final reply | **silent `Ok("Reading the first file.")`** — the first tool round's narration bound mid-run; the final answer never seen | loud settle expiry (idle guard) |
| B3 | anchored, direct reply → 1500 busy polls of further non-idle work | **`Ok("the real reply")` bound mid-run** (value happens to be right; B2 is the wrong-value twin) | loud settle expiry (the idle guard's trade) |
| C1 | drifted, user ESC 0.5 s into the real run | `Err(transport)` settle expiry — NOT cancelled | `Err(transport "provider transport failure")` — the relocated read binds the aborted partial; NOT cancelled |
| C0 | control: same ESC with NO pre-prompt compaction | `outcome=cancel` (correct) | `outcome=cancel` (correct) |

`hostRunFinishedWhenDriverReturned=false` on B1/B2/B3 on both sides: the
driver returned while the host run was still executing. No live repro is
on file (forcing a pre-prompt compaction needs a session at the host's
compaction threshold); the host-side ordering is verified by the source
walks above.

## Mechanism

1. The driver sends; host `prompt()` (pi ≥ 0.87) runs the pre-prompt
   `_checkCompaction` (`agent-session.js:1278`) BEFORE `_runAgentPrompt`
   sets `_isAgentRunActive` (`:1080`). During the compaction `isIdle`
   (`:876`) reads FALSE — non-idle with NO run active and
   `ctx.signal === undefined` (pi-agent-core `agent.js:212–214`; no
   `activeRun` exists).
2. The driver's start poll clears on that first non-idle read
   (`live-prompt-query-driver.ts:1026–1031`), mistaking the compaction
   for the driven run. The recorder follows `ctx.signal` = `undefined`
   (`:1052`); every end-poll non-idle read during the compaction re-arms
   it with `undefined` (`:1069–1075`).
3. The compaction's `finally` (`:2276–2281`) clears `isCompacting` and
   resolves idle waiters; `_isAgentRunActive` is still false, so
   `isIdle()` reads TRUE while `prompt()` awaits the `before_agent_start`
   handlers (`:1283`; `runner.js:1037`) and message building. A yielding
   handler lets the driver's 10 ms end poll fire inside the window: the
   end poll exits on the idle read, and the `waitForIdle` race resolves
   immediately.
4. The settle poll then runs with the FULL settle bound
   (`recorder.recorded` false → `TURN_SETTLE_POLL_BOUND` 1000 × 10 ms =
   10 s, `:1137–1139`) while the REAL run — own user entry, streaming,
   tool rounds — proceeds concurrently. From here the run is covered by
   10 s, not the end phase's `TURN_END_POLL_BOUND` 180000 × 10 ms =
   30 min.
5. 0.494.0's settle read has no idle conjunct: the first mid-run read
   whose slice shows an assistant (or a toolResult-only ending,
   `turn-settlement.ts:93–101`) binds. B2 binds the first tool round's
   narration as the query's `Ok`; B3 binds the first reply while the run
   continues. A drifted anchor (the pre-prompt compaction rebuilt the
   list below `turnStart` — B1) never opens, so the 10 s bound expires
   mid-run into the false non-retryable transport `Err`. On the 0501
   fix the idle guard suppresses the mid-run binds, so B1/B2/B3 all
   expire falsely at 10 s.
6. ESC: the recorder observes `ctx.signal` only at its initial follow
   and during end-poll non-idle reads — in this topology all of them
   fall inside the compaction, where the signal is `undefined`. Once the
   end poll exits, nothing ever follows the real run's signal (and after
   that run ends, `ctx.signal` is `undefined` again — `finishRun`,
   `agent.js:378–384`). A user ESC during the real run is therefore
   never recorded: C1 ends `Err(transport)` on main (settle expiry) and
   `Err(transport "provider transport failure")` on the 0501 fix (the
   relocated read binds the aborted partial) — neither `Err(cancelled)`.
   Control C0 (no pre-prompt compaction) cancels correctly on both.

## Expected

PIC-70's phase structure holds regardless of a pre-prompt compaction:
the end phase — `TURN_END_POLL_BOUND` (30 min) plus the bounded
`waitForIdle` race — covers the driven run's whole execution; the settle
bound (10 s) covers only the post-idle read of an already-committed
transcript; the recorder observes the run's `ctx.signal` throughout the
run, so a user ESC forwards as `Err(cancelled)` carrying the host's
reason (CNCL-4).

## Actual

On pi ≥ 0.87 the pre-prompt compaction makes the session read non-idle
before any run exists and idle again before the run starts: the start
poll clears on the compaction, the end poll exits in the gap, and the
settle poll is what actually covers the run. Mid-run reads bind partial
transcripts silently (B2/B3, 0.494.0); any run over 10 s — drifted or
idle-guarded (0.495.0) — expires falsely; and the run's signal is never
followed, so ESC is unobservable (C1). On pi 0.80.10 the gap does not
exist (`isIdle` ignores compaction), verified.

## Fix direction

1. **A settle read against a non-idle session re-enters the end-phase
   wait** instead of spending the settle bound: when the settle poll
   observes `!ctx.isIdle()`, return to the end poll — whose non-idle
   reads re-arm the recorder on `ctx.signal`, restoring both the 30-min
   coverage and ESC observability — and re-enter the settle phase on the
   next idle read. The settle bound then only ever burns against an idle
   session, which is `isSettledTurnEnding`'s documented premise.
2. **Detect the pre-prompt gap in the start/end polls**: a non-idle read
   with no run signal (`ctx.signal === undefined`) is pre-run activity,
   not the driven run — do not let it clear the start poll; and/or
   require this attempt's own user entry on the path (the 0501 fix's
   `ownUserAt` machinery) before treating the end phase as entered.
3. Keep 0.80.10's no-gap behaviour intact; consider whether the start
   phase should wait through a > 10 s pre-prompt compaction instead of
   expiring its bound (the residual exposure noted above).

## Relation to prior bugs

- **0501 (open, fix in flight → 0.495.0)** — filed from the same review.
  Its idle guard on the anchored+relocated settle reads is what turns
  this bug's silent binds into loud false expiries (the trade its review
  accepted with this follow-up filed); its attempt-owned `ownUserAt`
  machinery is a building block for direction (2). This bug owns the
  remaining gap: the run covered by the wrong bound, and the unobserved
  ESC.
- **0483 (fixed, 0.494.0)** — introduced the `DeferredHostAbort`
  recorder and the end-poll re-arming that this bug's ESC loss routes
  around: the recorder's design assumes the end poll rides the run; in
  the gap the end poll exits before the run starts.
- **0288 (fixed)** — built the start/end/settle poll structure and the
  P1/P4 caveat "`isIdle` is not a proxy for the send taking effect";
  this bug is the ≥ 0.87 host evolution (`isCompacting` joining
  `isIdle`) breaking the start poll's converse inference — non-idle is
  not a proxy for "the driven run started".
- **0500 (open, folded into 0501) / 0482 (fixed)** — the pre-prompt
  compaction here is the same host arm 0501 §Root cause names as its
  second no-abort drift trigger; probe B1's expiry is 0501's drifted
  shape reached through the gap.
