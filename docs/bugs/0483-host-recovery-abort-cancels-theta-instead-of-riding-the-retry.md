# Bug 0483 — a host-recovery abort (pi-retry's stall watchdog `ctx.abort()` + retryable rewrite) cancels the whole theta invocation instead of riding through the host's retry of the driven turn

- **Status:** fixed (unreleased — version assigned at the release step;
  see `## Fix (unreleased)`). `## Fix` settled 2026-09-28 (measurements
  resolved, operator-approved next after 0493). Observed live
  twice: once at the most benign possible site (below), once at the most
  expensive (a review-fix child whose typed respond had ALREADY captured
  `ok: true` — see §Fix, *Second observation*).
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

## Fix (settled 2026-09-28; measurements resolved)

Defer the cancellation decision for a mid-turn host abort to TURN-SETTLE
time, classify the settled turn against the host's OWN retry classifier, and
ride a host-recovery settle — waiting out an in-run core retry on pi ≤ 0.86,
issuing theta's own bounded continuation re-drive on pi ≥ 0.87 — instead of
cancelling. A typed query whose respond tool already captured a valid payload
settles on that payload without riding at all. User ESC keeps today's
semantics, one settle-wait (ms) later. Everything lands in the prompt-mode
driver plus one extraction rule; `cancellation-core.ts`,
`forwarding-listener-trap.ts` and the reverse (bug 0319) bridge are
untouched.

### Second observation — the answer-in-hand shape (wave qw20260928060032)

Child session `~/.pi/agent/sessions/--C--UnitySrc-pi-theta--/2026-09-28T05-57-07-285Z_…/2026-09-28T06-45-47-550Z_theta-fix-cluster-tree#7140efbb/2026-09-28T07-53-30-221Z_theta-review-fix#a6918693.jsonl`
(pi 0.87.1, pre-0.493.0 child env), a gate-green review-passed lane:

- entry 45 (08:00:53): the model calls `__theta_respond_b58527061b046b2a`
  with `ok: true` + full payload; entry 46: tool result
  `final answer recorded` — the QRY-14 early-respond capture VALIDATED and
  fired.
- entry 47 (08:01:00): the NEXT provider request (post-tool-result
  continuation) stalls; pi-retry aborts; trailing assistant settles
  `stopReason: "error"`, `errorMessage: "Request aborted\n\n[stall-watchdog-retry]
  provider returned error; treating stalled provider stream as retryable.
  [halfhour-window-rescue] request started in the :00/:30 hang window; …"`.
- theta's forwarding read the abort as cancellation: the child drive ended
  `Err`, the parent's `review_fix()` got `Err(kind: "invoke_callee")`
  (wrapper `src/runtime/subagent-fn-call.ts:21`), and the lane initially
  counted it as a rejection and reverted a gate-green batch (mitigated
  theta-side by one blind review retry, `6af8650c` — a stopgap, not this
  fix).
- entries 48–49: pi-retry's re-kick prompt landed at +1 s and the model
  answered "The review was already finished and recorded before the stall…"
  at 08:01:11 — a completed recovery turn nothing was left alive to read.

Post-0493 children carry `PI_SUBAGENT_CHILD=1`, so pi-retry no longer
re-kicks them AT ALL: in a child, theta's own ride below is the only
recovery.

### Measured host facts (the §Candidate-contract open items, resolved)

Retry-vs-cancel is NOT distinguishable at signal time — a stall-watchdog
`ctx.abort()` and user ESC abort the same per-run `ctx.signal`
(`runner.getSignalFn()`, no marker, no reason difference). It IS
distinguishable, on both pins, from the settled trailing assistant message:

- **Cancel shape:** user/host cancel settles the trailing assistant
  `stopReason: "aborted"` (or no assistant at all when aborted pre-token);
  nothing rewrites it.
- **Recovery shape:** a retry extension that intends recovery REWRITES the
  settle to `stopReason: "error"` + an errorMessage the host's retry
  machinery classifies retryable — that rewrite IS the upstream pi-retry
  contract (fork `pi-config/extensions/pi-retry/index.ts:418–421` abort,
  `:545–553` rewrite), and pi's own classifier for it is
  `isRetryableAssistantError` (pi-ai `dist/utils/retry.d.ts:11`, exported
  from the package root at the pin — `dist/index.js:17`), the exact function
  `AgentSession._isRetryableError` delegates to on 0.80.10
  (`agent-session.js:2083`) and 0.87.1.
- `agent_end.willRetry` is NOT usable: extensions receive the raw event
  without it (0.80.10 `agent-session.js:349` / 0.87.1 `:581` enrich only the
  post-extension `_emit` copy), 0.87 forces it `false` after any extension
  abort (`:628–629`), and PIC-18 bars `pi.on` as a completion signal anyway.
- **(a) does pi retry re-run the turn in the same run?** pi ≤ 0.86: YES —
  `_handlePostAgentRun` (0.80.10 `:764`) has no abort bail; the rewritten
  message passes `_isRetryableError` → `_prepareRetry` (backoff) →
  `agent.continue()` inside the same `_runAgentPrompt` while-loop (`:751–757`),
  and `_isAgentRunActive` stays true until `_emitAgentSettled` (`:310–311`),
  so the session never reads idle mid-retry. pi ≥ 0.87: NO —
  `abort()` sets `_agentRunAbortRequested` (0.87.1 `:1608–1619`) and
  `_handlePostAgentRun` bails at `:1111` BEFORE the retryable check; the run
  settles idle with the tagged error and only a NEW user turn (pi-retry's
  re-kick at top level; nothing in a child) can continue it.
- **(b) where does the retried turn stream?** ≤ 0.86 in-run retry:
  `_prepareRetry` removes the failed assistant from AGENT state but keeps it
  in the SESSION ("keep in session for history", 0.80.10 `:2108–2112`), so
  the retried assistant appends to the SAME trailing turn after the error
  entry — PIC-51's final-assistant probe reads the retried one
  (`trailingTurnFinalAssistant`), but PIC-53's join would concatenate both
  texts (fixed below). ≥ 0.87 re-kick/continuation: a NEW user message
  re-anchors the trailing turn; no contamination.
- **(c) the subagent-child twin:** the child drives its root theta through
  the identical prompt-mode driver (PIC-58), so one driver fix covers both;
  post-0493 the child has NO external re-kicker.
- The only production sites that convert the stall abort into `thetaAbort`
  are driver-local: the per-turn forward
  (`live-prompt-query-driver.ts:861`) and the post-settle `agent_end`
  synthesis (`:945`). The dispatch/bind-time forwards
  (`theta-composition-producer.ts:219`,
  `production-theta-producer.ts:819`) attach at idle entry where
  `ctx.signal` is `undefined`; no persistent five-event forwarding handlers
  exist. The fix is therefore local to the driver.

### Per-component changes

**1. `src/extension/host-recovery.ts` (new) — the settle classifier.**
`classifyHostRecoverySettle(turnSlice, finalAssistant)` returns one of:

- `"recovering"` — final assistant `stopReason === "error"` AND
  `isRetryableAssistantError(finalAssistant)` (imported from
  `@earendil-works/pi-ai`, the extension layer already imports pi-ai values
  — `off-session-respond-dispatch.ts:5`). Matches the fork's rewrite, the
  halfhour-rescue variant, upstream pi-retry, and any compliant retry
  extension; deliberately NOT the literal `[stall-watchdog-retry]` tag.
- `"recovered"` — final assistant settled on a normal boundary AND the turn
  slice (from this turn's `turnStart` anchor) contains an earlier
  retry-classified error-stop assistant (the ≤ 0.86 in-run-retry residue).
- `"cancel"` — everything else: trailing `"aborted"`, a non-retryable
  error-stop, a clean settle with NO retry residue (an ESC that raced the
  turn's natural end keeps today's cancellation), or no assistant.

Plus constants: `PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND = 3` (continuation
re-drives per driven turn — a count bound, not wall-clock; NOCEIL-1 intact)
and `PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT` (fixed continuation prompt:
previous response interrupted by a transient provider failure and retried;
continue from where you left off; if the final answer was already complete,
repeat it in full).

**2. `src/extension/live-prompt-query-driver.ts` — defer, classify, ride.**
Inside `#driveUserVisibleTurn`:

- The per-turn `forwardSlashCommandCancel(this.#thetaAbort, this.#ctx.signal)`
  (`:861`) becomes a DEFERRED recorder: on `ctx.signal` abort it records
  `{reason}` and does NOT abort `thetaAbort`. `#pollWhile`'s early-exit
  still keys on `thetaAbort` (other-source cancels — session shutdown,
  parent invoke — behave exactly as today, and the ride loop bails to the
  cancel path whenever `thetaAbort.signal.aborted`).
- The send + start/end/settle polls become a bounded ATTEMPT LOOP. After a
  settle with a recorded abort (or after a settle whose final assistant is
  an error-stop), classify:
  - `recovered` → discard the recorded abort; fall through to the normal
    probe/extraction (the ≤ 0.86 ride: core retry already re-ran the turn
    while the end-poll waited out the non-idle session).
  - `recovering` → if this is a typed query whose early-respond capture
    already fired (`capture.captured`), stop: the answer is in hand (see
    decided sub-case). Else if rides < bound: emit one informational
    system note (`theta /<name>: driven turn aborted by a host stall
    recovery and marked retryable; continuing the turn (ride N/3)`, no
    `details` key per bug 0401), record a fresh `turnStart`, send
    `PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT`, and loop — same open
    active-set/model/thinking windows (PIC-17 vector, respond tool
    included, stays installed), same armed governor budget (rounds
    accumulate across attempts; a recovery never mints fresh budget).
    Else (bound spent): discard the recorded abort and return — PIC-51
    maps the tagged error-stop to a loud `Err(transport)` carrying the
    tagged errorMessage, never `cancelled`.
  - `cancel` → forward the RECORDED reason into `thetaAbort` now (CNCL-4
    reason identity preserved; the one-shot guard and the bug-0319 reverse
    bridge compose unchanged) — `Err(cancelled)` exactly as today.
- With a recorded abort and an idle session whose slice never grows a
  trailing assistant, a short grace (existing poll cadence) then classifies
  `cancel` — the pre-first-token ESC does not sit out the full settle bound.
  A lifecycle-bound expiry with a recorded abort likewise resolves `cancel`
  (never a minted transport `Err` for a genuine ESC;
  `#recordLifecycleExpiry`'s aborted no-op extends to the recorded state).
- The `abortForAgentEnd` synthesis (`:945`) is gated by the same
  classification: skipped when the settled turn classifies
  `recovering`/`recovered`.

**3. `src/runtime/conversation-drive.ts` — PIC-53 residue exclusion.**
`extractTrailingTurnText` skips assistant entries with
`stopReason: "error"`: they are failure narration/retry residue pi
deliberately keeps in session history, not answer text. This also fixes the
pre-existing contamination when core retry succeeds mid-turn WITHOUT any
abort (reachable today on both pins whenever `retry.enabled` recovers a
retryable error-stop).

**4. Unchanged, by design:** `cancellation-core.ts` (idle-entry and generic
forwards keep their semantics), `forwarding-listener-trap.ts`,
`turn-settlement.ts` predicates, the off-session dispatches (forced respond
/ binder — never watchdog-observed: they fire no `before_provider_request`),
subagent-mode kill forwarding, and the bug-0482 compaction seam
(`trailingCompactionUnanswered` composes: an unanswered compaction still
holds settledness before classification runs).

### Decided sub-case — respond already succeeded

A typed query whose respond tool already captured a valid payload
(`#earlyRespond`/`capture.captured`, snapshotted in the turn's `finally`
even on abort paths) settles on the captured value when the free-phase turn
ends in a HOST-RECOVERY abort: no ride, no continuation send;
`forcedRespondTurn` returns the captured payload (QRY-14 early respond
already pins the skip). The wave shape above becomes
`Ok({ok: true, …})` with zero extra provider traffic. A GENUINE
cancellation (abort-shaped settle) still cancels and discards the capture —
cancellation.md §Surfacing is unchanged, and CNCL-5's no-retroactive-rewrite
rule is not in tension: the query operation never returned `Ok` (the capture
resolves the payload, not the checkpoint), and user ESC intent outranks an
unreturned value.

### Spec amendments

- `cancellation.md` §"Forwarding into `thetaAbort`", slash-command bullet:
  the prompt-mode mid-turn `ctx.signal` forward is settle-classified — an
  abort observed while a driven turn is in flight forwards into `thetaAbort`
  only after that turn settles and only when the settled turn is not a
  host-recovery settle (definition: final trailing assistant error-stop the
  host's own retry classifier — pi-ai `isRetryableAssistantError` — accepts,
  or a normal settle carrying such residue). CNCL-4 unchanged on the
  forwarded arm (the recorded source reason is what is forwarded); the
  one-shot guard and the bidirectional (bug 0319) clause unchanged.
- `conversation-drive.md`: new anchor <a id="pic-78"></a> **PIC-78.
  Prompt-mode host-recovery ride-through** — the attempt loop, the
  classifier, the ride bound + fixed continuation text, the shared governor
  budget, the loud transport `Err` on bound exhaustion, the typed-query
  captured-respond precedence, and the recorded consumption postures: an
  extension-aborted run settles promptly; pi's in-run retry keeps the failed
  assistant in session history (0.80.10 `_prepareRetry`); `_isRetryableError`
  ≙ pi-ai `isRetryableAssistantError` — routed to the version-bump
  editorial checklist as a new item.
- `conversation-drive.md` PIC-70: scope the "cancellation short-circuit
  takes precedence / each bounded wait MUST stop promptly on an observed
  abort" sentences to an observed THETA abort (`thetaAbort`); a deferred
  host abort instead accelerates through the aborted run's own prompt
  settle, and PIC-78 owns its disposition.
- `conversation-drive.md` PIC-53: the join excludes assistant entries with
  `stopReason: "error"` (retry residue kept in session by the host).
- `query/query-tool-loop.md` QRY-14 (`#qry-14`): one sentence — a valid
  early respond capture survives a host-recovery abort of the free phase;
  the query resolves on the captured payload (a genuine cancellation still
  surfaces `cancelled`).

### Witnesses (red before → green after)

Unit (`tests/b0483-host-recovery-ride.test.ts`, fake pi/ctx/clock driver
harness in the b0288/b0319 style):

1. **Idle-recovery ride (≥ 0.87 shape):** mid-turn abort + tagged retryable
   settle + idle → exactly ONE continuation send; clean settle → query
   `Ok(<continuation text only>)`; `thetaAbort` never aborted; no cancel
   note. Red before: `Err(cancelled)`.
2. **In-run ride (≤ 0.86 shape):** abort + session stays non-idle; slice
   gains tagged-error assistant then clean assistant; → `Ok(<retried text
   only>)`, ZERO continuation sends. Red before: `Err(cancelled)`.
3. **User ESC preserved:** abort + trailing `"aborted"` settle →
   `Err(cancelled)`, `thetaAbort.signal.reason` === the recorded source
   reason (CNCL-4); pre-first-token ESC (no assistant) cancels within the
   grace. Green before and after (regression pin; b0319 cells stay green).
4. **Ride bound:** tagged settle on every attempt → after 3 rides,
   `Err(transport)` carrying the tagged errorMessage; never `cancelled`.
   Red before: `Err(cancelled)`.
5. **Answer in hand:** typed query, capture fires `ok: true`, then abort +
   tagged settle → no continuation, `Ok(<captured payload>)` — the wave
   qw20260928060032 shape. Red before: `Err(cancelled)`.
6. **Clean-settle disambiguation:** recorded abort + clean settle with NO
   retry residue → `Err(cancelled)` (ESC-raced-the-end keeps today's
   semantics).
7. **PIC-53 exclusion:** settled turn `[user, error-stop asst("partial"),
   stop asst("full")]` → `Ok("full")`. Red before independently of the
   abort path (reachable today via core retry).
8. **`agent_end` gating:** post-settle `ctx.signal.aborted` + tagged settle
   → no synthesised agent_end cancel.

Live (H8a, `tests/live/b0483-host-recovery-live.test.ts`, per AGENTS.md live
conventions — child pins, real observables, no verbatim-echo): the harness's
`extraExtensionPaths` loads a watchdog-mimic extension that, on the driven
turn's first `message_update`, calls `ctx.abort()` and rewrites
`message_end` to the tagged retryable error — the full host mechanics (real
run abort, real rewrite, real settle) with one tiny fixture turn. With
`retry.enabled` off (injected `SettingsManager`) the idle-recovery arm runs:
assert the drive settles `Ok` with the fixture-pinned arithmetic sentinel
and the settled `SessionManager` carries NO `theta /<name> cancelled`
system note (absence of SLSH-3/SLSH-4 notes IS the success observable).
Red-before proven by running the cell at HEAD (cancelled note present), then
green after — both directions per AGENTS.md. Optional second cell with
`retry.enabled` on witnesses the in-run arm on the 0.80.10 dev host.

`tests/committed-fixture-parse-gate.test.ts` discharges the no-shipped-
source-moves claim; no `.theta` fixtures change shape.

### Version / CHANGELOG

One minor bump at landing with a `### Fixed` entry naming bug 0483. The
bug-number↔version correspondence is already past 0.483 (0.493.0 shipped
2026-09-28), so the next free minor is used (e.g. 0.494.0); the CHANGELOG
entry, not the version number, carries the bug id.

### Out of scope (owned elsewhere / follow-ups, not blocking)

- **pi host (upstream report):** distinguish "extension aborted this
  provider call" from "user aborted the run" so ≥ 0.87 core retry survives
  a watchdog abort (the a0e1419 regression). This fix makes theta
  self-sufficient either way.
- **pi-config (separate follow-ups there):** none required — the fork's
  re-kick is already deferential (stands down at its +1 s check when theta's
  continuation has the session non-idle/pending; the sub-second double-send
  race is an accepted residual). The finite-re-kick-budget and
  schedule-time-marker-read items stay on bug 0493's list.
- **Retryable error-stops with NO observed abort:** core retry owns them
  in-run on both pins when enabled; theta adds no re-kick for that shape
  (the PIC-53 exclusion improves it as a side effect).
- **`fix-cluster-tree.theta`'s one-retry mitigation (`6af8650c`):** retire
  after this ships (follow-up; harmless meanwhile).
- **Bug 0482** (auto-compaction seam) and **bug 0485** stay on their own
  records.

## Related

- Bug 0319 (the one-shot forwarding guard the deferral must compose with).
- Bug 0482 (the other host-mechanism-vs-drive seam: auto-compaction).
- `@narumitw/pi-retry` `src/retry.ts` (`armStallWatchdog`, the
  `message_end` rewrite, `DEFAULT_STALL_TIMEOUT_MS = 90_000`).

## Fix (unreleased)

The version bump and CHANGELOG entry land at the separate release step; the
`### Version / CHANGELOG` plan above still applies there.

- What shipped (keyed to §Fix *Per-component changes*):
  - `src/extension/host-recovery.ts` (new, item 1) —
    `classifyHostRecoverySettle` (`recovering` / `recovered` / `cancel`)
    over the host's own retry predicate, composed as `_isRetryableError`
    composes it: pi-ai `isContextOverflow` (with `ctx.model?.contextWindow
    ?? 0`) excluded first, then `isRetryableAssistantError` (whose
    unanchored patterns alone accept `prompt is too long: … tokens > …
    maximum`); `recovered` requires a
    normal-boundary final assistant (`PROMPT_MODE_NORMAL_STOP_REASONS`, now
    exported from `src/runtime/prompt-transport-mapping.ts`);
    `PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND = 3`,
    `PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT`.
  - `src/extension/live-prompt-query-driver.ts` (item 2) — the per-turn
    `ctx.signal` forward is a deferred recorder (`DeferredHostAbort`) that
    re-arms per agent run: each non-idle end-poll read follows the current
    `ctx.signal` object, detaching the previous run's listener, so an abort
    of a later run of the same turn (core retry, overflow compaction, a
    queued message) is recorded and the latest recorded reason is the one a
    `cancel` forwards; the send + polls run as a
    bounded attempt loop inside one active-set window and one governor
    budget; settle classification drives recovered (fall through) /
    recovering (captured respond wins, else ride with the informational
    note and the continuation send, else loud `Err(transport)` at the
    bound) / cancel (forward the recorded reason, CNCL-4). The end-poll and
    `waitForIdle`-race expiries with a recorded abort resolve `cancel`
    through `#recordLifecycleExpiry`. The settle-grace expiry with a
    recorded abort first classifies the session's trailing turn at PIC-51's
    last-user anchor (`trailingTurnUserIndex`, exported from
    `src/runtime/prompt-transport-mapping.ts`) instead of the attempt's
    `turnStart`, which an overflow compaction mid-turn leaves pointing past
    the rebuilt list (bug 0482 residual 1): `recovering` rides, `recovered`
    falls through, and the recorded reason is forwarded only on `cancel` or
    when no settled trailing turn of this attempt's own exists (the trailing
    `user` message is the one that trailed before the send, no `user`
    message anchors the turn and no compaction appended during this attempt
    explains its absence, the turn carries no assistant, or the leaf path
    ends in an unanswered compaction — `trailingCompactionUnanswered`,
    exported from `src/extension/turn-settlement.ts`). With no `user`
    message in the rebuilt list — pi's split-turn compaction, whose cut
    falls inside the turn and summarises the driven user message away
    (0.80.10 `compaction.js` `findCutPoint`/`isSplitTurn`; 0.87.1
    `findProjectedCutPoint`/`prepareCompaction`) — and a `compaction` entry
    on the leaf path whose id was absent from the path read before the send,
    the trailing turn is the list after the compaction summary. The settle
    poll under a recorded abort clears as soon as that relocated trailing
    turn reads settled rather than at the grace's end, so a retry
    extension's re-kick about a second after its abort cannot become the
    anchor first. The post-settle `agent_end` synthesis is gated
    by the same classification. The captured-respond precedence is a
    per-drive flag set only on the recovering-with-capture exit, read by
    both `nextFreePhaseTurn` and `#driveRestartedRepairPhase`.
  - `src/runtime/conversation-drive.ts` (item 3) — `extractTrailingTurnText`
    skips `stopReason: "error"` assistant entries.
  - `src/extension/sdk-inventory.ts` — `isRetryableAssistantError` and
    `isContextOverflow` peer-named-import rows (inventory-closure gate).
  - Comment-only: `src/extension/production-theta-producer.ts`,
    `src/extension/production-producer-deps.ts` (per-turn forward is now
    deferred and detached per run), `tests/b0288-…`, `tests/b0413-…`
    (citations by file and symbol),
    `tests/live/harness.ts` (second user of `extraExtensionPaths` /
    `settingsManager`).
  - Spec: `cancellation.md` slash-command forwarding bullet
    (settle-classified, recorded per agent run by the end-poll's re-arm,
    the two uncovered windows, retry classifier after excluding context
    overflow); `conversation-drive.md`
    new PIC-78 (recorder re-arms per agent run, overflow exclusion,
    continuation sends skip the PIC-70 pre-send gate and why that race is
    accepted, the settle-grace expiry classifies at the last-user anchor), PIC-70 scoped to an observed `thetaAbort`, PIC-53 join
    exclusion, typed-query bullet exception for the bounded ride
    continuation, the split-turn layout (no `user` anchor and a compaction
    from this attempt: the list after the summary) and the classification
    on the first settled read; cancellation.md's uncovered-window sentence
    corrected for pi ≥ 0.87's error-stop omission (residual 2); `version-bump-step2.md` item (av) + preamble ranges to
    (av) + the live cell B retirement note; `query/query-tool-loop.md` QRY-14
    sentence; `runtime-event-channel.md` informational-note list (ten notes,
    ride note added); `docs/plan_topics/coverage-matrix.md` PIC-78 row.
- Tests that lock it:
  - `tests/b0483-host-recovery-ride.test.ts` — 34 cells: the eight §Witness
    cells (3 and 7 split a/b) plus (9)/(10) captured respond does not pre-empt
    a non-abort error-stop / `length` probe, (11) respond-repair restarted
    phase keeps a captured payload across a recovery abort, (12)/(13)
    recorded-abort lifecycle expiries resolve `cancel`, (14) `length` retry
    is not `recovered`. At HEAD: 8 red (1, 2, 4, 5, 7a, 7b, 8, 11) with the
    bug symptom (`Err(cancelled)` / `"partial\nfull"`), 8 green regression
    pins. Cell (8) is pinned to the ride (two sends, the continuation value,
    exactly one ride note). Review round 1 added (15) pi ≥ 0.87 watchdog
    abort of a later agent run → exactly one ride, (16) pi ≤ 0.86 later-run
    abort recovered via core retry, (17) ESC on a later run → cancel with
    the ESC reason, (18) the latest recorded reason is forwarded, (19) a
    context-overflow error-stop is not a host recovery, (20) the PIC-17
    install persists across a ride, (21) governor rounds add up across
    attempts, (22) the continuation constant equals PIC-78's quoted text.
    At `a250d9a0`: 15, 17, 18, 19 red (`Err(transport, <tagged>)`,
    `Err(transport, "provider transport failure")`, the watchdog's reason,
    `"recovered"`); 16, 20, 21, 22 green pins (16 because an unrecorded
    abort falls through to the same extraction `recovered` does). Review
    round 2 added the drifted-anchor shape (three prior exchanges, an
    overflow error-stop, a compaction keeping only the driven user entry,
    the post-compaction run aborted): (23) watchdog abort + tagged settle →
    exactly one ride, (24) ESC + aborted settle → cancel with the ESC reason
    (control), (25) watchdog abort + in-run core retry → `recovered`; (26)
    core-retry backoff with `ctx.signal` reading `undefined` while the
    session is non-idle, then the next run's watchdog abort → one ride;
    (27) every run signal's `abort` listener is detached at the re-arm and
    at the drive's end (counted on instrumented run signals). At
    `53e8c200`: 23 and 25 red (`cancel` with the watchdog reason); 24, 26,
    27 green pins (27 reds when either `dispose` call is removed). Release
    review round 3 added (27b) across a ride, attempt 1's recorder — still
    watching an unaborted run signal — is detached before the continuation
    attempt's first host step, and the split-turn shape (the compaction
    cut inside the turn, no `user` message in the rebuilt list): (28)
    pi ≥ 0.87 layout (`["compactionSummary","assistant","toolResult",
    "assistant"]`), watchdog abort + tagged settle → exactly one ride,
    classified within 3 host steps of the idle; (29) 0.80.10 layout
    (overflow error-stop kept), watchdog abort + in-run core retry →
    `recovered`; (30) ESC + aborted settle → cancel with the ESC reason
    (pin); (31) no `user` anchor and only an earlier compaction (the send's
    entry never landed) → cancel with the watchdog reason, no ride (pin).
    Cell 23 gained the same latency assertion. At `a4d8865d`: 28 and 29 red
    (`cancel` with the watchdog reason), 23 red on latency (the
    continuation 51 host steps after the idle); 27b, 30, 31 green pins —
    27b reds with the per-attempt `liveRecorder?.dispose()` removed (run 2's
    listener stays live), 31 reds when any compaction on the path is
    accepted (the earlier turn's tagged error-stop rides). Fixed tree
    34/34.
  - `tests/live/b0483-host-recovery-live.test.ts` +
    `tests/live/fixtures/b0483-watchdog-mimic-extension.ts` — H8a, cell A
    (`retry.enabled` off, idle-recovery arm: one continuation, one `ride 1/3`
    note) and cell B (`retry.enabled` on, 0.80.10 in-run arm: zero
    continuations, zero ride notes; fails loudly on a ≥ 0.87 host — retire
    or convert it when the dev pin crosses 0.87, item (av)). At HEAD
    both red with `systemNotes=["theta /b0483rideidle cancelled"]` /
    `["theta /b0483rideinrun cancelled"]`; fixed tree 2/2 green.
- Gates (release review round 3 tree): parse gate `Tests 58 passed (58)`;
  `npm run typecheck` exit 0; `npm run lint` exit 0; targeted (b0483,
  b0288, b0319, b0413, b0414, b0464, b0482, closing-gate,
  inventory-closure audit + gate, sdk-inventory, session-control
  sdk-inventory, parse gate) `Test Files 13 passed (13)`,
  `Tests 220 passed (220)`; `npm test` `Test Files 713 passed (713)`,
  `Tests 12006 passed (12006)`; live b0483 2/2.
- Gates (release review round 2 tree): parse gate `Tests 58 passed (58)`;
  `npm run typecheck` exit 0; `npm run lint` exit 0; targeted families
  (b0483, b0288, b0319, b0413, b0482, drive/cancellation/typed/respond/
  governor, sdk-inventory, inventory-closure, closing-gate, parse gate)
  `Test Files 48 passed (48)`, `Tests 537 passed (537)`; `npm test`
  `Test Files 713 passed (713)`, `Tests 12001 passed (12001)` (two earlier
  full runs each failed real-child-process files with residual 4's
  `subagent model pre-flight mismatch` — 3 files, then 1 — every one green
  in isolation); live b0483 2/2.
- Gates (release review round 1 tree): parse gate `Tests 58 passed (58)`;
  `npm run typecheck` exit 0; `npm run lint` exit 0; targeted families
  (b0483, drive/cancellation/typed/respond/governor, sdk-inventory,
  inventory-closure, closing-gate) `Test Files 25 passed (25)`,
  `Tests 370 passed (370)`; `npm test` `Test Files 713 passed (713)`,
  `Tests 11996 passed (11996)`; live b0483 2/2. First-round gates (before
  the release review): `npm test` `Tests 11988 passed (11988)`; live b0483
  2/2, plus regression live runs green (`live-production-acceptance`
  prompt-mode turn / schema-typed @-query / subagent-mode theta / typed
  invoke; `typed-query-wire-shapes`, `live-session-control`,
  `b0480live-…`, `b0481live-…`, `off-session-overflow-classification`).
- Review: 2 rounds. Round 1 (deep): 13 findings — captured-respond
  precedence unscoped (fidelity), repair-phase capture discarded
  (correctness), recorded-abort lifecycle expiries minted transport `Err`
  (fidelity), `recovered` accepted non-normal stop reasons (fidelity), spec
  structure/accuracy (PIC-53 bullet split, informational-note list, (av)
  ranges, retry-predicate wording, PIC-78 vs code), comment and witness
  gaps, a `globalThis` record in the live fixture. All fixed. Round 2
  (fast): clean. Release review round 1: the recorder watched only the
  first agent run (a watchdog abort of a later run on pi ≥ 0.87 went
  unrecorded and surfaced `Err(transport)`); the classifier missed the
  host's context-overflow exclusion; witness gaps (cell 8 accepted either
  disposition, no active-set / governor-across-attempts / spec-literal
  cells); line-number citations; live cell B retirement; the pre-send-gate
  skip unstated in PIC-78. All fixed. Release review round 2: the per-run
  re-arm recorded a watchdog abort of a post-compaction run whose settle
  anchor had drifted, and the settle-grace expiry then forwarded it as a
  whole-theta cancel (the pre-fix disposition was `Err(transport)`); no
  witness for the between-runs `undefined` signal or for listener
  detachment; the cancellation.md bullet overstated the recorder's
  coverage; the five-handler spec wording (below). The first three fixed;
  the last left as a pinned note. Release review round 3: the settle-grace
  expiry still forwarded a whole-theta cancel when pi's split-turn
  compaction summarised the driven user message away (no `user` message in
  the rebuilt list, so no anchor), and the 50-poll grace let a retry
  extension's re-kick race the relocated classification; the
  uncovered-window text (cancellation.md, residual 2) misstated pi ≥ 0.87,
  which drops the failed error-stop before the backoff and before overflow
  compaction; no witness reddened on removing the per-attempt recorder
  dispose; the spec note scoped PIC-18 loosely. All fixed; the spec note
  now points at bug 0498.
- Verification: VERIFIED — witnesses red on a HEAD scratch copy and green
  on the fixed tree (unit and live); full suite green; live end-to-end and
  regression live runs green; lint, typecheck, parse gate green.
- Residuals:
  1. The recorder re-arms per agent run by polling: it follows a new run's
     `ctx.signal` at the end-poll's non-idle reads (10 ms cadence), so an
     agent run that starts, is aborted, and ends entirely between two reads
     is not recorded. A later ESC after a recorded watchdog abort now
     forwards the ESC's reason (cell 18).
  2. pi ≤ 0.86: an ESC during the retry backoff after a watchdog abort
     settles on the tagged error-stop and rides — a direct consequence of
     classifying by settle shape. pi ≥ 0.87: an abort landing between two
     runs of the turn — core-retry backoff (the active run handle is
     cleared, so `ctx.signal` reads `undefined` while the session is
     non-idle) or overflow compaction — aborts no watched signal, so
     nothing is recorded and the turn settles unclassified. Before either
     window the host drops the failed error-stop from the built list: it
     appends `context_edit(<id>, null)` (0.87.1 `agent-session.js`
     `_omitRecoveryAttempt`, :667–682) before the retry backoff
     (`_prepareRetry`, :2703–2708) and before overflow compaction
     (`_checkCompaction`, :2101–2103), and `buildSessionContext` projects
     that entry to nothing (`session-manager.js` :235–241, :256–285). With
     earlier tool rounds the turn reads settled on its last `toolUse`
     assistant and PIC-53 binds `Ok(<pre-error narration>)` — a silent
     partial bind, pre-existing, bug 0499. When the dropped error-stop was
     the turn's only assistant, the 10 s settle-phase bound expires and the
     query surfaces `Err(transport)` with the settle-phase message
     (cancellation.md slash-command bullet).
  3. Continuation sends do not pass the bug-0288 pre-send idle gate (the
     §Fix-accepted sub-second double-send race with an external re-kicker;
     PIC-78 states the skip and why the race is accepted). A
     compaction-relocated trailing turn is classified on its first settled
     read, so it enters that race at the same point an anchored turn does.
  4. Real-child-process default-suite tests intermittently fail with
     `subagent model pre-flight mismatch … (unresolved: no matching model)`
     under full-suite load (reviewer and verifier runs; each file green in
     isolation); unrelated to this change — filed as bug 0497.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the §Fix *Out of scope* list stands
  (upstream pi abort distinction, `fix-cluster-tree.theta` one-retry
  mitigation retirement, bugs 0482/0485).
- Spec note (release review round 2, R4): of the turn-lifecycle events
  conversation-drive.md PIC-18 names, the production path registers only
  the governor's `before_provider_request` and `tool_call` handlers
  (`src/extension/prompt-tool-loop-governor.ts`), not the five
  cancellation-forwarding handlers the spec describes; the forwarding is
  the driver-local per-turn recorder and the post-settle `agent_end` site.
  The other `pi.on` registrations in `src/` (`resources_discover`,
  `session_start`, `session_shutdown` in `factory.ts`; `agent_settled` in
  `production-host-loop-dispatch.ts`) are outside PIC-18. The spec
  correction predates bug 0483 and is tracked as bug 0498.
