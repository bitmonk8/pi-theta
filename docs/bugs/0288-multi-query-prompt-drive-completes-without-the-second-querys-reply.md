# Bug 0288 — A `mode: prompt` drive with two on-session `@`-queries completes without the second query's reply ~40–60% of the time: the bounded start poll expires silently, the end poll and `waitForIdle()` then return at once, and the query binds an empty string or the previous turn's text with no diagnostic; on a slower interleaving the drive instead hangs past ten minutes

- **Status:** open.
- **Sev/Diff estimate:** S1/D3 — S1 because the production drive path binds a
  query result from a turn that never produced a reply, with no note, no `Err`
  and no panic (`extractTrailingTurnText` yields `""` or the previous turn's
  text), and the same hole can stall a drive for ~600 s on
  `TURN_END_POLL_BOUND` or unboundedly on `ctx.waitForIdle()`. D3 because the
  §Fix changes the turn-completion contract on a shared path used by every
  on-session query (untyped, typed free phase, degraded fused arm, repair
  restart), and its verification runs against a stochastic live cell.
- **Kind:** runtime defect — the on-session query turn's completion detection
  is a bounded idle-poll whose expiry is a silent success, and the send whose
  failure it cannot see is fire-and-forget with a swallowed rejection.
- **Affected** (every citation re-derived at HEAD `7087f130`, v0.284.0;
  `git diff --stat 945f1b02 HEAD -- src/` is empty, so `src/` is byte-identical
  to the version the evidence below was measured against):
  - `src/extension/production-theta-producer.ts:4791`–`:4878` —
    `LivePromptQueryModel.#driveUserVisibleTurn`, the single on-session turn
    drive:
    - `:4833` — `this.#pi.sendUserMessage(text)`, not awaited.
    - `:4834`–`:4837` — the only failure arm: a SYNCHRONOUS throw mapped to a
      `TransportError` (PIC-50). An asynchronous rejection has no arm.
    - `:4838` — `await this.#pollWhile(() => this.#ctx.isIdle(), TURN_START_POLL_BOUND)`.
    - `:4854` — `await this.#pollWhile(() => !this.#ctx.isIdle(), TURN_END_POLL_BOUND)`.
    - `:4855` — `await this.#ctx.waitForIdle()`.
    - `:4881`–`:4886` — `#pollWhile`: `for (let i = 0; i < bound && condition(); i += 1)`.
      Expiry and satisfaction are the same return; the caller cannot tell them
      apart.
    - `:4890` — `POLL_INTERVAL_MS = 10`; `:4893` — `TURN_START_POLL_BOUND = 1000`
      (1000 iterations × 10 ms ≈ 10 s); `:4896` — `TURN_END_POLL_BOUND = 60000`
      (≈ 600 s).
  - `src/extension/production-theta-producer.ts:4485`–`:4520` — the untyped /
    free-phase round 0: `:4488` drives the turn, `:4520` returns
    `extractTrailingTurnText(this.#readMessages())` as the query's value. No
    check that the drive observed a reply.
  - `src/extension/production-theta-producer.ts:4605` and `:6044`–`:6050` — the
    same pattern on the degraded fused arm and in `driveStreamedUserTurn`
    (a second copy of the send / start-poll / end-poll / `waitForIdle`
    sequence).
  - `src/runtime/conversation-drive.ts:202`–`:224` — `extractTrailingTurnText`
    anchors the trailing turn on the LAST `user` message. With the second
    query's user entry present and no assistant reply, the value is `""`; with
    that user entry not yet appended, the value is the FIRST query's answer.
  - `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1858`–`:1866`
    — the extension-API `sendUserMessage` the producer calls:
    `this.sendUserMessage(content, options).catch((err) => runner.emitError(...))`.
    Every asynchronous failure of the send is routed to the host's
    extension-error channel; the producer's call site can never observe it.
  - `agent-session.js:1109`–`:1138` — `AgentSession.sendUserMessage` forwards to
    `prompt()` with `streamingBehavior: options?.deliverAs`. The producer passes
    no options, so `deliverAs` is `undefined`.
  - `agent-session.js:834`–`:837` — `prompt()`: when `this.isStreaming` and no
    `streamingBehavior` is given, it THROWS
    `"Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message."`
    That throw becomes the swallowed rejection above; no user entry is appended
    and no run starts.
  - `agent-session.js:750`–`:751` — `_runAgentPrompt` sets
    `_isAgentRunActive = true`. Everything `prompt()` awaits before that point —
    the auth check (`:853`–`:854`), `_checkCompaction` (`:866`–`:869`),
    `emitBeforeAgentStart` (`:888`) — runs while `isIdle` is still `true`
    (`:598`). The 10 s start bound therefore races the host's pre-run work, not
    only provider latency.
  - `agent-session.js:310`–`:318` — `_emitAgentSettled` sets
    `_isAgentRunActive = false` BEFORE awaiting the `agent_settled` extension
    emit, and `waitForIdle` (`:1176`–`:1181`) returns as soon as that flag is
    false, so the producer resumes while the previous turn's settle path is
    still executing.
  - `node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core/dist/agent.js:219`–`:222`
    — `Agent.prompt` throws `"Agent is already processing a prompt."` when
    `activeRun` is set; `:334`–`:361` (`runWithLifecycle`'s `finally` →
    `finishRun`) clears `activeRun` before `agent.prompt` resolves.
  - `tests/live/live-production-acceptance.test.ts:14749`–`:14758` — cell 89's
    declared-`E` twin: TWO on-session `@`-queries in one `mode: prompt` body
    (`:14754` typed, `:14755` `let n = 306 + 218`, `:14756` the untyped
    discriminator over `${n}`); `:14846` the drive; `:14853`–`:14858` the
    assertions.
  - `tests/live/harness.ts:360`–`:432` — `driveSlashCaptureTurn` and
    `waitForLastTurnSettled` as landed by bug 0287 (v0.284.0): the turn-complete
    read off the settled `SessionManager`, `failLoudly` on expiry at `:421`.
    This is the instrument that named the defect and the model for the §Fix
    signal.
- **Observed at:** the live measurements were taken in bug 0287's fix lane
  (`C:/UnitySrc/pi-theta-lane-p`, branch `lane/p-0287`, forked at `945f1b02`)
  with that lane's harness edit applied — the edit now merged as `7087f130`,
  v0.284.0. `src/` was untouched by that lane and by the merge. Pre-0287 shape
  captured by the main session at v0.283.0.
- **Blocks on:** nothing. Bug 0287 is fixed (0.284.0) and its turn-complete read
  is the precondition for attributing this defect at all
  (`./0287-driveslash-whole-drive-text-accumulator-drops-a-later-turns-stream.md`).
- **Blocked:** cell 89's drive half stays red-prone until this bug lands; bug
  0287's §Fix records that this document's closure, not 0287's, owns that
  cell's stable green.

## Summary

`#driveUserVisibleTurn` issues one on-session query turn and decides the turn is
finished by polling `ctx.isIdle()`: first up to 1000 × 10 ms ≈ 10 s for the run
to become non-idle, then up to 60000 × 10 ms ≈ 600 s for it to go idle again,
then `ctx.waitForIdle()`. `#pollWhile` returns identically whether its condition
was satisfied or its bound expired
(`src/extension/production-theta-producer.ts:4881`–`:4886`). When the start poll
expires — the run has not been observed non-idle within 10 s — the session is
still idle, so the end poll's condition `!isIdle()` is false on entry and
`waitForIdle()` returns at once. The drive continues as if the turn had run and
completed.

The query's value is then `extractTrailingTurnText` over the transcript
(`:4520`), which anchors on the last `user` message
(`src/runtime/conversation-drive.ts:202`–`:224`): `""` when the second query's
user entry is present without a reply, or the FIRST query's answer when it is
not. Nothing emits a note, an `Err` or a panic.

Two hosts' properties make the window reachable and the failure invisible: the
producer's send is the extension-API `sendUserMessage`, whose asynchronous
rejection is swallowed into the host's extension-error channel
(`agent-session.js:1858`–`:1866`), and `isIdle` stays `true` through everything
`prompt()` awaits before `_runAgentPrompt` (`:751`) — the auth check, the
compaction check, `before_agent_start`.

Measured with observation turn-complete by construction (post-0287): cell 89 —
a two-query prompt drive — reds in ~40–60% of runs with the harness's named
precondition, and twice `session.prompt()` did not resolve inside 180 s.

## Reproduction

All live evidence is quoted verbatim from measurements taken by bug 0287's fix
lane and the main session; this writer ran no live test. Source citations are
this writer's own, offline at HEAD `7087f130`.

The drive (`tests/live/live-production-acceptance.test.ts:14749`–`:14758`):

```
---
mode: prompt
---
schema Nope { a: number }
let a: Result<integer, Nope> = @`What is 471 plus 133? Answer with the number only.`
let n = 306 + 218
@`A computation produced the value ${n}. What is that value plus 341? Answer with the number only.`
```

Command (under the shared live lock
`.pi/tmp/fix-open-bugs/live.lock`):

```
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts -t "cell 89"
```

(a) **The witness, post-0287** — `.pi/tmp/fixes/0287-report.md` §"Mechanism
adjudication" item 3, the loud named precondition from
`tests/live/harness.ts:421`:

```
2 user turn(s), 2 assistant text part(s) and no theta-system-note entry,
and the LAST user turn's reply never settled ... within 15000ms
```

Both queries are on the session and neither ended with a note, yet the last
user turn has no non-empty assistant text part after it. The same report
records that widening the harness bound 4× to 60 000 ms "still left 3/5 red",
so this is not a slow reply the read missed.

(b) **Rate** — same report, §Tests: post-fix cell 89 across two batches,
`.pi/tmp/b0287-post-1..5.log` = `✓✓✓✗✗` and `.pi/tmp/b0287-final-1..5.log` =
`✓✗✗✗✓`; the investigation-only 60 000 ms bound run
(`.pi/tmp/b0287-b60-1..5.log`) = `✗✗✗✓✓`. Every red carries the precondition
text of (a), not a content mis-attribution.

(c) **The hang** — same report, §Residuals item 1: "twice `session.prompt()`
never resolved inside 180 s" (`.pi/tmp/b0287-b60-2.log`,
`.pi/tmp/b0287-final-4.log`), "with no harness assertion ever reached". Both
bounds the drive can be sitting on exceed vitest's 180 s: the end poll is
≈ 600 s (`:4854`, `:4896`) and `ctx.waitForIdle()` (`:4855`) is unbounded.

(d) **Pre-0287 shape** — `.pi/tmp/fix-open-bugs/live-v0283-cell89-tip.log`,
captured by the main session at v0.283.0, when the same cell's failure was
read through the event-window accumulator:

```
the declared-`E` twin's drive did not answer the task question over the value
rendered into the discriminator's prompt body (524 + 341 = 865) -- streamed
text: "604"; userTexts: ["What is 471 plus 133? Answer with the number
only.","A computation produced the value 524. What is that value plus 341?
Answer with the number only."] (cell 89): expected false to be true
 ❯ tests/live/live-production-acceptance.test.ts:14858:9
```

`"604"` is the first query's answer. Pre-0287 that string was produced both by
a dropped observation and by an unsettled second turn, which is why the
production half was not separable before 0287 landed.

Offline reproduction of the mechanism (no provider): a `Clock`-driven
`LivePromptQueryModel` with a `ctx` whose `isIdle()` stays `true` for more than
1000 polls after a send. The drive returns a value with no note. §Fix owns the
witness.

## Expected behaviour

A `mode: prompt` drive that issues N on-session `@`-queries either binds each
query's own reply or fails loudly. Specifically:

1. A query whose turn was never observed to start does not bind a value. It
   surfaces a named diagnostic on the `theta-system-note` channel (or the
   query's `Err`), and never the previous turn's text or `""`.
2. A subsequent query is issued only after the prior turn has fully settled, so
   the send cannot land while the session is streaming and cannot be rejected
   into the host's extension-error channel unseen.
3. Every bound the drive waits on is short enough that expiry is diagnosable
   rather than indistinguishable from a hang.

## Actual behaviour / root cause

Proven statically at HEAD:

- **P1. Bound expiry is a silent success.** `#pollWhile`
  (`production-theta-producer.ts:4881`–`:4886`) returns `void` on both exits.
  On start-poll expiry the session is by construction still idle, so the end
  poll (`:4854`) returns without a single iteration and `ctx.waitForIdle()`
  (`:4855`, `agent-session.js:1176`–`:1181`) returns immediately. There is no
  post-condition on the turn.
- **P2. The value is taken anyway.** `:4520` extracts the trailing turn's text
  unconditionally; `extractTrailingTurnText`
  (`conversation-drive.ts:202`–`:224`) anchors on the last `user` message, so
  the two failure shapes are `Ok("")` and `Ok(<previous turn's text>)`.
- **P3. Only a synchronous send failure is representable.** The producer maps a
  synchronous throw from `sendUserMessage` to a `TransportError`
  (`:4834`–`:4837`); the extension-API wrapper attaches
  `.catch(err => runner.emitError(...))` to the promise
  (`agent-session.js:1858`–`:1866`), so an asynchronous rejection — including
  the `isStreaming`-without-`streamingBehavior` throw at `:834`–`:837`, which
  appends no user entry and starts no run — is unobservable to the drive.
- **P4. `isIdle` is not a proxy for "the send has taken effect".**
  `_isAgentRunActive` is set inside `_runAgentPrompt` (`:751`), after
  `prompt()` awaits the auth check (`:853`–`:854`), `_checkCompaction`
  (`:866`–`:869`) and `emitBeforeAgentStart` (`:888`). The 10 s start bound
  races host work, not only the provider.
- **P5. The prior turn's settle path outlives the drive's wait.**
  `_emitAgentSettled` clears `_isAgentRunActive` before awaiting the
  `agent_settled` extension emit (`:310`–`:318`), and `waitForIdle` keys on
  that flag, so query N+1's send is issued while query N's settle path is still
  running.
- **P6. The two hangs need no SDK queueing defect.** `TURN_END_POLL_BOUND` is
  60000 iterations at 10 ms ≈ 600 s (`:4854`, `:4890`, `:4896`) and
  `ctx.waitForIdle()` (`:4855`) is unbounded, both above vitest's 180 s, so a
  second turn that starts and does not end presents exactly as
  "`session.prompt()` never resolved".
- **P7. The path is production-shared, not harness-only.** The producer's
  `#pi` / `#ctx` are the host's `ExtensionAPI` / `ExtensionCommandContext`
  (`agent-session.js:1858`, `:1898`), and a slash command reaches the theta
  through `prompt()` → `_tryExecuteExtensionCommand` (`:806`, `:927`–`:949`) in
  the interactive host and in print mode
  (`dist/modes/interactive/interactive-mode.js:646`,
  `dist/modes/print-mode.js`) exactly as in the H8a harness
  (`tests/live/harness.ts:239`, `createAgentSession`). No branch in
  `#driveUserVisibleTurn` distinguishes the two.

Not proven statically — which trigger fires in a given red. The candidates the
static facts admit, all silent by P1–P3:

1. The second query's `prompt()` spends more than 10 s in its pre-run awaits
   (P4), so the start poll expires and the drive walks on.
2. The second send lands while the session still reports streaming and is
   rejected into the extension-error channel (P3, P5), so no run and no user
   entry exist at all.
3. The second run starts and does not end, and the drive sits on the ≈ 600 s
   end poll or the unbounded `waitForIdle` (P6) — the two 180 s cases.

Candidate 2 is the one consistent with a red that reports two user turns only
if the user entry belongs to the drive's own render rather than to the rejected
send; this writer cannot discriminate 1 from 2 without a run and does not claim
to. All three are removed by the same §Fix, which replaces the idle-poll
completion contract instead of tuning its bounds.

The bug 0287 lane also named `AgentSession.prompt`'s queue-while-streaming
branch as a candidate for the hangs. At HEAD that branch cannot hang: with
`deliverAs` undefined it throws rather than queues (`:834`–`:837`), and
`Agent.prompt` clears `activeRun` before resolving
(`pi-agent-core/dist/agent.js:219`–`:222`, `:334`–`:361`). P6 explains the
hangs without it.

## Why it matters

A theta that asks the model two questions can bind the first answer, or the
empty string, as the second answer, and complete `Ok`. That is a wrong value on
a production path with no diagnostic: an interpreter that then computes on the
value, writes a file, or returns it to a caller has no signal that a turn was
skipped. Multi-query prompt-mode drives are an ordinary shape — cell 89's twin
is a three-line body.

The same hole is the reason a protected live cell is stochastically red. Bug
0287's fix made the observation turn-complete and locked it offline, which is
what turned "cell 89 flakes" into a named production failure; until this bug
lands, cell 89's reds must not be attributed to whatever fix is in flight
(`AGENTS.md` §"Expect documented correct-reason reds").

## Non-goals

- **Bug 0287's landed harness read.** `collectAssistantTexts`,
  `waitForLastTurnSettled` and their offline lock
  (`tests/b0287-live-harness-assistant-text-reader.test.ts`) stay as merged
  (`./0287-driveslash-whole-drive-text-accumulator-drops-a-later-turns-stream.md`,
  fixed 0.284.0). They are this report's instrument. No revert, no weakening,
  no widening of the harness bound as a substitute for the production fix.
- **The SDK files.** `agent-session.js`, `agent.js` and everything else under
  `node_modules/@earendil-works/**` are vendored dependencies. The producer's
  drive loop is the fix surface; the host contracts cited above are read as
  given. An upstream note may be written, and is not part of this fix.
- **Single-query drives.** A `mode: prompt` theta with one on-session query
  keeps its current observable behaviour byte-for-byte, including the PIC-50
  synchronous-throw mapping, PIC-51's trailing-`stopReason` probe, the STAGE-B
  governor arming and the CANCEL-2 per-turn signal forwarding.
- **Cell 89's subject.** The registration half — the offender refused with
  `theta/parse/unresolved-named-type`, the twin registered
  (`./0273-propagated-result-error-side-unresolved-name-silent.md`, fixed
  0.267.0) — and bug 0286's de-collided fixture and `userTexts` diagnostic
  (`./0286-live-cell-89-drive-discriminator-answers-intermediate-value.md`,
  fixed 0.283.0) are untouched.
- **Provider-side variance.** A model that answers the wrong number must still
  red. No retries are added to any cell, and the drive-sentinel refusal class
  (`./0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md`) is a
  separate subject.

## Fix

Replace the idle-poll completion contract in
`src/extension/production-theta-producer.ts` with a settled-turn contract, and
make every remaining bound expiry loud.

1. **Settlement gate before the next send.** `#driveUserVisibleTurn` does not
   return until the turn it issued is SETTLED in the sense the landed harness
   read uses (`tests/live/harness.ts:460`–`:471`): a non-empty assistant text
   part, a tool-result-only turn, or a fail-closed ending, appended after the
   turn's own user entry in the `SessionManager` slice the drive opened. The
   query-window start already recorded at `:4479` (`#queryWindowStart`) gives
   the slice boundary, and `#readMessages()` the read surface. Consequence: the
   producer never issues query N+1 while query N's run or settle path
   (`agent-session.js:310`–`:318`) is live, which removes candidate 2 by
   construction.
2. **Start-poll expiry fails loudly.** `#pollWhile` returns whether the
   condition was met or the bound expired, and start-poll expiry becomes a
   named diagnostic on the query rather than a fall-through — the query yields
   an `Err` carrying a registered code and the drive stops there. No path binds
   a value from a turn that was never observed to run. This is the one
   behaviour hole the §Reproduction evidence proves silent today (P1, P2).
3. **The value is never taken from an unattributed turn.** `:4520` /
   `:4605` extract text only from the settled slice of THIS query's window, so
   an empty or previous-turn extraction is unrepresentable rather than merely
   unlikely.
4. **Bounds become diagnosable.** `TURN_END_POLL_BOUND`'s ≈ 600 s and the
   unbounded `ctx.waitForIdle()` are replaced by one bound with a loud named
   expiry. The value must be below the live suite's per-test timeout so a stuck
   turn presents as a named failure, not as a harness timeout (P6).
5. **`driveStreamedUserTurn` (`:6017`–`:6051`) is brought onto the same
   contract** or deleted in favour of the method, so the degraded arm cannot
   retain the old hole.

Sub-choices adjudicable in-lane:

- The registered diagnostic code(s) for start-poll expiry and for end-bound
  expiry: one shared code with a phase field, or two codes. Either way the
  registry row and its spec edits land in the same commit.
- Whether a bounded RETRY of the send precedes the loud failure. Default: no
  retry (a retry re-sends a user-visible turn and can duplicate provider work);
  if adopted, it is at most one re-send and the loud failure remains reachable.
- Whether the settlement gate lives in `#driveUserVisibleTurn` (per turn) or in
  the enclosing query loop (per query). Per-turn is preferred: the repair
  restart at `:4693` and the degraded arm at `:4591` then inherit it.
- Whether the settled-turn predicate is factored into `src/runtime/` and shared
  with the harness, or implemented independently on the producer side. Sharing
  is preferred only if it does not make `tests/live/harness.ts` depend on
  production internals it currently reads off the transcript.

### Verification

- **Offline witness (the gate).** A `Clock`-driven `LivePromptQueryModel` over a
  fake `pi`/`ctx` in which (i) `isIdle()` never goes false after a send,
  (ii) it goes false and never returns true, and (iii) the second send's promise
  rejects. Each case must produce the named diagnostic and no bound value; each
  must be RED before the fix (today: case (i) returns `Ok("")` or the previous
  text, case (iii) returns silently). Plus a two-query case proving query 2's
  send is issued only after query 1's settled slice exists.
- **No behaviour hole.** Default suite green, including the single-query prompt
  cells, the typed two-phase cells
  (`tests/typed-two-phase-live.test.ts`, `tests/off-session-two-phase.test.ts`),
  the PIC-50/51 transport cells and the CANCEL-2 cells.
- **Bug 0287's lock stays green.** `tests/b0287-live-harness-assistant-text-reader.test.ts`
  and `tests/live/harness.ts` are untouched by this fix.
- **Live decision rule.** Cell 89 green in 8 consecutive runs under the live
  lock, each run recorded with its log path. The rule is reachable only if this
  document's premise is right, so it carries its own falsifier: **if any of the
  8 runs reds with a message other than the drive assertion — in particular
  with the new named expiry diagnostic, or with `session.prompt()` again not
  resolving — the single-cause premise is falsified and the residual is re-filed
  rather than absorbed.** A red on the drive assertion with a wrong-numbered
  answer is provider variance (bug 0243's class) and is recorded, not fixed
  here. Fewer than 8 runs, or runs at other cells substituted for cell 89, do
  not discharge the rule.
- **Exposure sweep.** The other multi-query live cells (the sibling set bug
  0287's lane ran green: `inline-object-field-name-case-live-cell.test.ts`,
  `b0251live-tolerated-junk-carrier-live-cell.test.ts`,
  `inline-object-stray-close-token-live-cell.test.ts`) run once post-fix to show
  the settlement gate adds no stall.

## Related

- `./0287-driveslash-whole-drive-text-accumulator-drops-a-later-turns-stream.md`
  — fixed (0.284.0). Its turn-complete read is what made this defect
  attributable; its §Fix records the re-owning of cell 89's stable green to this
  document, and corrected the `TURN_START_POLL_BOUND` prose to 1000 iterations
  × 10 ms ≈ 10 s at merge.
- `./0286-live-cell-89-drive-discriminator-answers-intermediate-value.md` —
  fixed (0.283.0). De-collided the cell's numbers and printed `userTexts`, the
  first step that separated "wrong answer" from "missing turn".
- `./0273-propagated-result-error-side-unresolved-name-silent.md` — fixed
  (0.267.0). Cell 89's subject; its registration half is unaffected by this
  defect.
- `./0283-live-binder-declines-bare-free-text-argument-h8a-0165-cell.md` —
  fixed (0.279.0). The other recent live-drive subject (binder argument
  inference at the bug-0165 cell), listed to keep the sweep honest: it shares no
  code with the turn-completion contract.
- `./0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md` — the
  drive-discriminator shape rule this cell already follows.

## Provenance

Twentieth session continuation. Filed from bug 0287's §Fix residual 1 and its
fix lane's §"Mechanism adjudication" item 3 — the residual the lane measured
after its harness fix made observation turn-complete, and which the merge gate
fenced out of 0287 as production-side. Live evidence quoted from
`.pi/tmp/fixes/0287-report.md` and
`.pi/tmp/fix-open-bugs/live-v0283-cell89-tip.log`; no live test was run by this
writer. All source citations re-derived at HEAD `7087f130` (v0.284.0), where
`src/` is byte-identical to `945f1b02`.
