# Bug 0499 — on pi ≥ 0.87 the host durably omits a turn's error-stop assistant from the projected context (`context_edit(id, null)`) before core-retry backoff and before overflow compaction; a turn that settles inside that omission window reads as a clean pre-error settle: PIC-51 passes on the last `toolUse` assistant and PIC-53 binds the pre-error narration as a silent partial `Ok`

- **Status:** open — `## Fix` settled 2026-09-29 (design; implementation
  pending; lands ON TOP of bug 0501's fix (0.495.0) and targets 0.496.0)
- **Owning repo:** pi-theta (defensive consumption of a documented host
  behaviour; the host-side omission is by design — "keep the failed
  attempt in raw history while durably omitting it from model projection")
- **Sev/Diff estimate:** S2/D2 — S2: silent result corruption on the
  affected hosts. A drive whose turn hit a retryable provider error and
  then settled without a post-omission assistant binds
  `Ok(<pre-error narration>)` — for a pure tool-use turn, `Ok("")` — with
  no note, no `Err`, no diagnostic; a caller (or a `pi -p` lane) scores
  the theta green on an answer the model never finished. Not reachable at
  the repo's pinned host (0.80.10, verified below), but the production
  extension runs under whatever pi hosts it — the operator's global
  install is 0.87.1, where every window below is live. Pre-existing;
  NOT a 0483 regression (the reviewer's scratch cell reproduces the bind
  identically before and after the 0483 fix, because the 0483 classifier
  reads the same projection the omission already scrubbed). D2: the
  driver already holds the raw leaf path (`readContextPath`); the fix is
  an omission-aware arm in the settle/classify path plus witnesses.
- **Where (host, pi 0.87.1 — the operator's global install at
  `C:\Users\thomasa\AppData\Roaming\npm\node_modules\@earendil-works\pi-coding-agent`):**
  - `dist/core/agent-session.js:2684` (`_prepareRetry`) — `:2704` calls
    `this._omitRecoveryAttempt(message)` ("Keep the failed attempt in raw
    history while durably omitting it from model projection") BEFORE the
    abortable exponential-backoff sleep at `:2706–2710`.
  - `dist/core/agent-session.js:2027` (`_checkCompaction`) — the overflow
    arm at `:2101–2103` calls
    `this._omitRecoveryAttempt(assistantMessage, toolResults)` (the tool
    results too) before `_runAutoCompaction("overflow", willRetry)`.
  - `dist/core/agent-session.js:667–683` (`_omitRecoveryAttempt`) — for
    each target it appends `sessionManager.appendContextEdit(targetId,
    null)` (a `context_edit` entry with `replacement: null`), emits
    `entry_appended`, and refreshes the finalized context. The raw
    `message` entry stays in the session file; only the projection drops
    it.
  - `dist/core/session-manager.js:235–241` (`projectContextEntry`) — an
    edit whose `replacement === null` projects its target to `[]`;
    `:256–279` (`buildSessionProjection`) applies the newest
    `context_edit` per target id; `:282–285` (`buildSessionContext`)
    returns those projected messages. Everything pi-theta reads through
    `buildSessionContext` is post-omission.
  - Abort interplay: `abort()` (`:1608–1619`) sets
    `_agentRunAbortRequested` and `abortRetry()` (kills the backoff
    sleep); `_handlePostAgentRun` (`:1106`) bails at `:1111–1114` on
    `_agentRunAbortRequested` — BEFORE the retryable check at `:1117` —
    so an abort landing in the backoff window settles the run idle with
    the error-stop already omitted and no further assistant ever coming.
    Exhaustion is safe by ordering: `_prepareRetry` increments and
    returns `false` at the cap BEFORE the omit call, so the FINAL failed
    attempt stays visible and PIC-51 maps it to `Err(transport)`.
- **Where (host, pi 0.80.10 — the repo devDependency):** no omission
  exists. `grep -c "_omitRecoveryAttempt\|context_edit\|appendContextEdit"
  dist/core/agent-session.js dist/core/session-manager.js` → 0 and 0; its
  `_prepareRetry` keeps the failed assistant in the session ("keep in
  session for history", `agent-session.js:2108–2112`; bug 0483 §Measured
  host facts item (b)). At the repo pin the error-stop is always visible
  and PIC-51 classifies it.
- **Where (pi-theta, main a79c1c1e):**
  - `src/extension/production-theta-producer.ts:828–832` —
    `readMessages()` is `buildSessionContext(entries, leafId).messages`:
    the settle probe, the failure probe, and the extraction below all
    read the post-omission projection. (`:841` `readContextPath()` is the
    RAW branch — it still contains the omitted `message` entry and the
    `context_edit` entries; nothing reads them today.)
  - `src/extension/turn-settlement.ts:93–101` (`isSettledTurnEnding`) —
    any `assistant` in the turn slice (or a trailing `toolResult`) reads
    as settled; `:131–137` (`thisTurnSettled`).
  - `src/extension/live-prompt-query-driver.ts:932–939` — the settle poll
    (`TURN_SETTLE_POLL_BOUND` 1000 × `POLL_INTERVAL_MS` 10 ms = 10 s,
    `turn-settlement.ts:52/:8`) and its expiry
    `#recordLifecycleExpiry("settle", 10000)`.
  - `src/runtime/prompt-transport-mapping.ts:283` (`probePostTurnFailure`
    → `extractPromptModeQueryResult`) — the PIC-51 error probe reads the
    trailing turn's FINAL assistant; `:79` —
    `PROMPT_MODE_NORMAL_STOP_REASONS` includes `"toolUse"`, so a
    pre-error tool-round assistant left trailing by the omission passes
    as a normal boundary; PIC-53 then binds
    `extractTrailingTurnText(messages)`
    (`src/runtime/conversation-drive.ts:171`) — the pre-error narration,
    `""` for a pure tool-use turn.

## Observed (2026-09-28, release review of the 0483 fix; scratch cell, not live)

Reviewer scratch cell over the projected shape a 0.87 omission produces —
turn slice `user → assistant(toolUse) → toolResult(s)` with the error-stop
assistant absent (projected away) and no abort forwarded into `thetaAbort`
— reported `outcome=success value=""` from the drive, byte-identically
BEFORE and AFTER the 0483 fix: the pre-fix path binds via PIC-51/PIC-53
directly, and the post-fix `classifyHostRecoverySettle` sees neither a
trailing error-stop ("recovering") nor in-slice error residue
("recovered") — both were omitted from the projection it reads — so it
classifies the settle as clean and falls through to the same bind. Not yet
reproduced against a live 0.87 host (requires a real retryable provider
error mid-turn); the host-side mechanism is verified by source walk above.

## Mechanism (the omission window)

1. A driven turn's attempt settles `stopReason: "error"` with a retryable
   `errorMessage`. On 0.87 the host immediately appends
   `context_edit(errorEntryId, null)` — from this instant every
   `buildSessionContext` read shows the turn WITHOUT its error evidence —
   and only then sleeps the backoff and re-runs the attempt in the same
   run (`_isAgentRunActive` stays true; the driver's idle gate holds).
2. If the run settles idle inside that window with no post-omission
   assistant — an abort lands during the backoff sleep (user Esc or a
   stall-watchdog `ctx.abort()`: `abortRetry` kills the sleep,
   `_handlePostAgentRun` bails pre-retry) or a retry cycle ends the run
   without a new assistant — the projected turn slice ends on the last
   PRE-ERROR assistant/toolResults.
3. `thisTurnSettled` reads the slice as settled (a `toolUse` assistant or
   trailing `toolResult` qualifies). Where the abort was forwarded into
   `thetaAbort`, cancellation wins today (that is bug 0483's cancel path,
   and post-fix the classifier's blind "cancel" arm); where it was not —
   host-internal settles, or any future ride that declines to cancel —
   PIC-51 probes the trailing assistant: `stopReason "toolUse"` is a
   normal boundary, so no `Err`, and PIC-53 binds the pre-error narration
   as `Ok`. Nothing anywhere records that an error was ever stopped on.
4. Degenerate sub-case: the omitted error-stop was the turn's ONLY
   assistant (round-0 failure, no tool rounds). The projected slice then
   has no assistant and no trailing `toolResult`, `thisTurnSettled` never
   turns true, and the drive burns the full 10 s settle bound to
   `Err(transport)` "on-session turn did not settle: the run never
   completed and its reply never landed (waited 10000ms)"
   (`prompt-transport-mapping.ts:116`) — loud, but misattributed, and it
   also masks the real (omitted) provider error message.
5. Overflow arm: the omission additionally precedes a `compaction` entry
   appended to the leaf; the raw-path walk in `thisTurnSettled` then trips
   bug 0500's `trailingCompactionUnanswered` shape — see 0500 for that
   half; the two fixes should share the raw-path this-turn-slice helper.

## Expected

A turn whose error-stop the host has omitted pending recovery is a turn
in RECOVERY, not a settled turn: the drive rides it (bounded, per the
0483 ride) or surfaces the recovery failure loudly. Narration produced
BEFORE an omitted error is never bound as the turn's answer.

## Actual

On pi ≥ 0.87 the settle/probe/extract chain reads only the post-omission
projection: a settle inside the omission window binds a silent partial
`Ok` (case 3), or burns the 10 s bound into a misattributed transport
`Err` (case 4). On pi 0.80.10 (repo pin) the error-stop stays visible and
the existing PIC-51/0483 paths classify it — the defect is dormant at the
pin and live on ≥ 0.87 hosts.

## Fix (settled 2026-09-29 — design; on top of bug 0501's fix, targets 0.496.0)

Make the omission visible to the drive via the raw branch it already
holds (`readContextPath` = `ctx.sessionManager.getBranch()`,
`production-theta-producer.ts:841` at 9e5094c6) and dispose of an
UNHEALED omission as a loud retryable transport failure carrying the
omitted attempt's own error — never a bind of pre-omission narration,
never the misattributed generic settle expiry, and never a ride or a
cancel that nothing observable justifies. One new raw-walk helper, one
new transport mapper, ONE guarded insertion point in the driver. All
recorded-abort (0483) and relocated-settle (0501) paths stay
byte-identical.

### Host mechanics re-verified (pi 0.87.1 source walk, 2026-09-29)

Every filed claim re-verified at the operator's 0.87.1 install; the
settled design additionally rests on these measured facts:

- **`_prepareRetry` gate ORDER protects exhaustion and disablement**
  (`agent-session.js:2684`): `retry.enabled` false → return false BEFORE
  the omit; `_retryAttempt` past `maxRetries` → decrement and return
  false BEFORE the omit (the FINAL failed attempt stays projected and
  PIC-51 maps it honestly); only then `auto_retry_start`,
  `_omitRecoveryAttempt(message)` (`:2704`), and the abortable backoff
  sleep (`:2705–2718`). An abort during the sleep →
  `_finishCancelledRetry()` (`:2668`) → return false → the `&&` at
  `:1117` fails → the `_agentRunAbortRequested` bail at `:1122–1125`
  ends the run — with the omission already durable.
- **Every no-compaction unhealed-omission settle is an aborted backoff.**
  Between the omit and the retried `agent.continue()` the only awaits
  are the sleep and the post-sleep abort checks; the sleep either
  completes (the run continues in-run — the session, whose
  `isIdle === !_isAgentRunActive && !isCompacting` (`:876`), stays
  non-idle throughout, so the driver's end-poll rides it) or is killed
  by `abort()` (`:1608–1619`: sets `_agentRunAbortRequested` while
  `_isAgentRunActive`, calls `abortRetry()`) or by a bare public
  `abortRetry()` (`:2723` — then NOTHING sets `_agentRunAbortRequested`:
  control falls past `:1122` to the `auto_retry_end` emit and
  `_checkCompaction`, which can even append a threshold compaction after
  the omission, and the run settles with NO abort anywhere).
- **Nothing observable marks a backoff abort.** `ctx.signal` is
  pi-agent-core `Agent.signal` = `activeRun?.abortController.signal`
  (`agent.js:212–214`), and `finishRun()` clears `activeRun` whenever
  `agent.prompt()/continue()` returns (`:382–383`) — so throughout
  `_handlePostAgentRun` (backoff included) `ctx.signal` reads
  `undefined`. The 0.494.0 `DeferredHostAbort` records nothing (0483
  residual 2, confirmed at source), and post-settle `ctx.signal` is
  `undefined` too. ESC-in-backoff, extension `ctx.abort()`, and bare
  `abortRetry()` are indistinguishable from one another at every surface
  pi-theta can read.
- **A RECORDED abort implies a post-omission assistant.** A recorded
  abort means a live run signal aborted; that run's settle commits an
  assistant (`handleRunFailure` appends the aborted/error failure
  message, `agent.js:361–377`, or the stream's own partial lands at
  `message_end`) AFTER the omission edits — so the 0483 classifier reads
  a post-omission trailing assistant in every case but ONE: an aborted
  run that dies before any `message_start` commits nothing. That
  pre-token residue case stays with 0483's existing arms — the settled
  pre-error slice classifies `"cancel"` (normal boundary, no visible
  residue) and the round-0 shape cancels through the
  expiry-with-recorder — both the ESC-correct disposition; the new arm's
  guard skips every recorded attempt, so those paths are byte-identical.
  "Recorded abort + unhealed omission" therefore never reaches the new
  arm, and where it exists at all it CANCELS, never binds.
- **Overflow arm one-shot** (`_checkCompaction:2027`): the omit at
  `:2102` runs only on the FIRST overflow-with-retry
  (`_overflowRecoveryAttempted` guards a second → returns false with the
  error-stop left projected — PIC-51 maps it). `willRetry = stopReason
  !== "stop"`, so the omitted target's raw `stopReason` is `"error"` or
  (recoverable-length, `:2073`) `"length"`; the toolResults are omitted
  alongside. The pre-prompt `_checkCompaction(lastAssistant, false)`
  (`:1278`) can omit only a PREVIOUS turn's assistant — its target id
  predates this attempt's send, which the detection below excludes by
  construction.
- **0.80.10 dormancy re-verified**: zero occurrences of
  `_omitRecoveryAttempt` / `context_edit` / `appendContextEdit` in the
  repo pin's `agent-session.js` + `session-manager.js`; its
  `_prepareRetry` keeps the failed assistant in the session
  (`agent-session.js:2108–2112` "keep in session for history") and the
  0.80.10 `SessionEntry` union has no `context_edit` member — the
  detection walk must read `entry.type` as an OPEN string (a structural
  cast), and at the pin it never matches: the arm is inert, zero
  behaviour change (witness 9 pins the control).

### Root cause

One drive-side blind spot: every read the settle/probe/extract chain
performs (`readMessages()` = `buildSessionContext(getEntries(), leafId)`,
`production-theta-producer.ts:827`) is the post-omission PROJECTION —
0.87.1 `projectContextEntry` maps a `replacement: null` edit's target to
`[]` (`session-manager.js:235–241`), `buildSessionProjection` applies the
newest edit per target (`:256–279`). The raw branch (`getBranch()`)
retains both the omitted `message` entry (its `stopReason` and
`errorMessage` intact — `_omitRecoveryAttempt` appends edits, never
touches the target) and the `context_edit` entries themselves, but
nothing reads them for this purpose today. So a turn that settles with
the omission UNHEALED (no post-omission assistant ever landed) either
looks CLEANLY settled on its pre-error tool rounds (PIC-51 sees a
`toolUse` boundary → PIC-53 binds the pre-error narration — the silent
partial `Ok`, `Ok("")` for a pure tool-use turn; a typed free phase
worse: it proceeds to the forced respond dispatch and can bind a
fabricated payload) or, when the omitted error-stop was the turn's only
assistant, never settles at all and burns the full settle bound into the
misattributed non-retryable "did not settle" expiry that also masks the
real provider error.

### Which cases arise (settle-time taxonomy)

Per attempt, keyed on the raw-branch omission state and what was
observed. "Omission" below always means: a `context_edit` entry with
`replacement: null` appended during THIS attempt whose `targetId` names
an `assistant` `message` entry also appended during this attempt.
"Healed" means an assistant `message` entry exists on the raw branch
AFTER the newest such edit. "No abort observed" means: recorder empty,
`ctx.signal` not observed aborted post-settle, `thetaAbort` not aborted.

- **Abort during retry backoff** (user ESC, extension `ctx.abort()`, or
  bare `abortRetry()` — indistinguishable; also the overflow arm's
  compaction failing or being aborted before any continuation): run
  settles idle, omission unhealed, nothing observed → rows O3/O4 below.
- **Retry exhausted / retry disabled**: `_prepareRetry` returns false
  BEFORE omitting, the final error-stop stays projected → not this bug's
  window; PIC-51 maps it (control, witness 9's family).
- **Cancelled retry with an observed abort**: the abort was recorded on a
  live run (or `thetaAbort` flipped) → 0483 owns the settle: the aborted
  run's own post-omission assistant classifies (cancel / recovering /
  recovered exactly as 0.494.0), and the pre-token no-assistant residue
  case cancels through 0483's existing arms (measured fact above).
- **Omission before overflow compaction, continuation lands** (healed):
  0501's fix binds the recovered reply — anchored, or through the
  un-gated relocated read (rows O2/O6).
- **Omission before overflow compaction, continuation never lands**
  (unhealed; trailing compaction unanswered — the 0500-sharpened walk
  reads the raw non-terminal stop, so the veto holds): row O5.
- **Omitted error-stop as the only assistant** (round-0) vs **after tool
  rounds**: O4 vs O3 — the two projected shapes (never settles vs
  settles on pre-error narration).
- **Typed vs untyped**: the same arm serves both — the omission `Err`
  lands in `#transportFromThrow`, which the untyped path surfaces as the
  query's `Err` and the typed free phase returns as its transport
  failure BEFORE any forced respond dispatch
  (`live-prompt-query-driver.ts:352–353` untyped/typed free phase,
  `:554–555` degraded fused arm, `:686–689` repair follow-up →
  `provider_failure`, no attempts debit per QRY-11 §non-validation); a
  captured
  early-respond payload does NOT pre-empt it (0483 cells 9/10 parity:
  capture-wins is scoped to the recorded-abort `"recovering"` exit).
- **With a 0483-recorded abort**: the new arm never runs (guard); the
  classifier reads the post-omission trailing assistant — aborted →
  cancel, rewritten-retryable → capture/ride/bound — and the pre-token
  no-assistant residue shape cancels; all byte-identical to 0.494.0.

### Per-component changes

**1. `src/extension/turn-settlement.ts` — the raw-walk detector.** New
exported helper beside `trailingCompactionUnanswered` (which 0501's
answered-compaction walk also lives in — the shared raw this-turn-slice
home both bug records called for):

`unhealedRecoveryOmission(path, pathIdsBeforeSend)` → `{ errorMessage:
string | undefined; stopReason: string | undefined } | undefined`.
Over the chronological leaf path: collect entries whose `id` is NOT in
`pathIdsBeforeSend` (this attempt's own appends — each attempt of the
0483 ride loop records its own set, so per-attempt scoping is free);
among them find `context_edit` entries (`entry.type` read as an open
string through a structural cast — the repo's 0.80.10 `SessionEntry`
union lacks the member) with `replacement === null` whose `targetId`
names an `assistant` `message` entry that is ALSO outside
`pathIdsBeforeSend` (excludes the pre-prompt compaction's omission of a
PREVIOUS turn's assistant and any edit of pre-attempt history — 0288 P2
discipline); take the NEWEST such edit; return `undefined` when none
exists or when any assistant `message` entry follows that edit on the
path (HEALED — the retried/continuation attempt landed, projected or
not); otherwise return the omitted target's raw `stopReason` and
`errorMessage`. toolResult-targeting edits (the overflow arm omits those
too) neither qualify as the anchor nor mask it.

**2. `src/runtime/prompt-transport-mapping.ts` — the mapper.** New fixed
stem `PROMPT_MODE_HOST_OMITTED_RECOVERY_MESSAGE` (register-mate of the
three lifecycle-expiry stems; exact wording final at implementation,
pinned by witness 12's stem-constant cell) and
`mapPromptModeHostOmittedRecovery(omitted, provider): TransportError` —
`kind: "transport"`, `http_status: null`, `retryable: TRUE` (the host
itself classified the omitted error retryable; the recovery, not the
query, is what failed — a retry-on-retryable caller re-runs), `message`
= the stem + the omitted entry's raw `errorMessage`, falling back to
naming its raw `stopReason` when `errorMessage` is absent (the
recoverable-`"length"` omission). DIAG-2: no new diagnostic code — the
same closed `TransportError` register every lifecycle expiry uses.

**3. `src/extension/live-prompt-query-driver.ts`
`#driveUserVisibleTurn` — ONE guarded insertion.** Immediately after the
settle poll (after `:1154–1159` at 9e5094c6) and BEFORE the
settled/unsettled branch (`:1161`):

```ts
const abortObserved =
  recorder.recorded ||
  this.#ctx.signal?.aborted === true ||
  this.#thetaAbort.signal.aborted;
if (!abortObserved) {
  const omission = unhealedRecoveryOmission(this.#readContextPath(), pathIdsBeforeSend);
  if (omission !== undefined) {
    this.#transportFromThrow = mapPromptModeHostOmittedRecovery(omission, this.#provider);
    return;
  }
}
```

Placement rationale — a deliberate REFINEMENT of the filing's and
0501's "interpose at the two expiry sites": the silent-bind case (O3)
never REACHES an expiry site — it exits through the settled branch's
no-abort normal-settle `return` — so interposing only at the expiry
sites cannot fix the S2 half of this bug. One arm upstream of the
branch covers every no-abort disposition at a single point; the expiry
sites themselves stay SINGLE and untouched (`#recordLifecycleExpiry`
unchanged, its recorded→cancel precedence unchanged), exactly the
property 0501's design preserved for this fix. The guard keeps every
path with an observed abort byte-identical to 0.494.0/0.495.0
(recorded → grace/classify/ride/cancel; `thetaAbort` aborted → the
PIC-51 cancelled short-circuit; post-settle `ctx.signal` abort →
classified). `#windowRelocated` is NOT set by this arm (the query ends
in a terminal transport `Err`; no dispatch follows). Comment refreshes
at `#transportFromThrow`'s doc (now also carries the omission `Err`),
the settle-poll block, and `production-theta-producer.ts:833–841`
(`readContextPath`'s comment gains the 0499 read).

**4. Unchanged, by design:** `host-recovery.ts` — the classifier stays
PROJECTION-based. Making its `"recovered"` arm raw-aware (seeing omitted
residue) would flip a genuine ≥ 0.87 ESC-raced-the-natural-end settle
(recorded abort + normal final; the only way that shape arises on
≥ 0.87, since a recorded abort bails `_handlePostAgentRun` at `:1111`
before any in-run retry) from `cancel` into a bind — wrong. The ≤ 0.86
in-run-retry residue the `"recovered"` arm exists for is visible at that
pin (bug 0483 §Measured host facts item (b)). Also unchanged: `trailingCompactionUnanswered`
/ 0501's `compactionAnswered` (already omission-proof — the walk reads
RAW entry stops, pinned by 0501 witness 10's omission-shape cell),
`#recordLifecycleExpiry`, the settle-poll bounds and exit predicate, the
grace bound, `#ownTrailingTurnSlice`, the PIC-53 extraction, and the
capture mechanics.

### Decision table (settle disposition per attempt)

Rows: raw-branch omission state for THIS attempt. Columns: what was
observed. Rows O1/O2/O6 are the existing tables; O3–O5 are this fix.

| # | Raw-branch state | No abort observed (● = new arm) | Abort recorded / post-settle observed (0483/0501, unchanged) |
|---|---|---|---|
| O1 | No this-attempt omission | 0501 settle table rows 1–7 verbatim (bind / wait / relocated settle / loud expiry) | 0483 classifier: cancel / recovering / recovered |
| O2 | Omission HEALED (assistant entry after the newest edit) | falls through — binds normally (anchored row 1; drifted/split rows 4–5 via 0501's relocated read); PIC-53 reads the projection, which the host already scrubbed of the failed attempt | classifier over the post-omission trailing assistant (aborted → cancel; tagged retryable → capture/ride/bound) |
| O3 | Omission UNHEALED; pre-error tool rounds trailing (turn reads settled at `turnStart`) | ● `Err(transport, retryable: true)` carrying the omitted raw `errorMessage` — never `Ok(<pre-error narration>)`, never `Ok("")`; typed: the free phase Errs, ZERO forced respond dispatches, a captured payload does NOT pre-empt (cells 9/10 parity) | arm skipped (guard); recorded ⇒ a post-omission assistant classifies (→ O2), or the pre-token residue shape classifies `"cancel"` over the clean pre-error slice — ESC-correct, 0483 cell 6 family |
| O4 | Omission UNHEALED; omitted error was the turn's only assistant (slice never settles) | ● same omission `Err` after the settle poll expires — replaces the misattributed `retryable: false` "did not settle" AND surfaces the real provider error (bound-burn latency accepted, residual 1) | arm skipped (guard); the slice never settles and the relocated read finds no assistant → expiry-with-recorder cancels with the recorded reason (0483 cells 12/13/31 family) |
| O5 | Omission UNHEALED + trailing compaction (overflow arm; continuation never landed; anchored-veto or drifted/split) | ● same omission `Err` — the 0500-sharpened answered-walk keeps the veto (raw non-terminal stop), the relocated read returns `undefined`, and the arm fires ahead of the single expiry site | grace → cancel with the recorded reason (0483/0501 rows unchanged) |
| O6 | Omission + compaction + continuation landed | = O2 (healed); 0501 rows 1/4/5 bind the recovered reply | classifier over the relocated slice (0483 cells 23–39) |

Cross-cutting precedence unchanged: `thetaAbort` already aborted →
`Err(cancelled)` (PIC-51 short-circuit; the arm is skipped).

### Composition with 0501's settle table and 0483's ride/ESC

- **0501:** the arm runs strictly BEFORE the settled/unsettled branch
  0501 reshapes, so its rows 1–7 are untouched for O1/O2/O6; rows 3 and
  6 (its standing expiry backstops) now end in the omission `Err`
  precisely when an unhealed this-attempt omission exists — the
  interposition 0501 §"0499 is not foreclosed" reserved, kept
  single-sited. The relocated read can never surface an unhealed
  omission as settled: an unanswered trailing compaction vetoes it
  (first gate), and without a compaction the no-`user`-anchor arm
  requires one — proven healed-only by construction; the arm is
  therefore belt-and-braces for relocated settles (healed by
  construction) and load-bearing for anchored settles and the expiry
  shapes. 0501's predicate cells (witness 10, the omission shape)
  already pin the answered-walk's raw-read omission-proofness this fix
  relies on.
- **0483 ride:** recorded-abort attempts never reach the arm (guard),
  and an unhealed omission cannot coexist with a recorded abort
  (measured fact). A ride continuation attempt records fresh
  `pathIdsBeforeSend` AFTER the prior attempt's omission edits, so those
  edits are invisible to the continuation's own detection — per-attempt
  scoping composes with the attempt loop for free.
- **ESC:** an observed ESC (recorded, or already forwarded into
  `thetaAbort`) cancels exactly as today. An UNOBSERVABLE ESC — the
  backoff window, where `ctx.signal` is `undefined` on ≥ 0.87 — now
  surfaces the omission `Err(transport, retryable: true)` instead of
  today's silent `Ok`: pin-parity with ≤ 0.86, where the identical ESC
  settles on the VISIBLE error-stop and PIC-51 maps `Err(transport)`
  (no ride — 0483 §Out of scope pinned "no re-kick for retryable
  error-stops with no observed abort", and riding here would send
  provider traffic against a plausible user cancel). Residual 5 records
  the accepted `cancelled`-vs-`transport` posture.
- **Captured respond:** unchanged precedence order — capture wins ONLY
  on the recorded-abort `"recovering"` exit (0483 decided sub-case); a
  no-abort failure settle (visible error-stop at ≤ 0.86, omitted one at
  ≥ 0.87) Errs past the capture (cells 9/10; witness 5 pins the ≥ 0.87
  twin).

### Spec amendments (conversation-drive.md unless noted)

1. **New anchor `<a id="pic-79"></a>` PIC-79. Prompt-mode host-omitted
   recovery (pi ≥ 0.87 `context_edit` omission), after PIC-78.** Content:
   the host behaviour (≥ 0.87 appends `context_edit(targetId,
   replacement: null)` for the failed attempt — and its tool results on
   the overflow arm — BEFORE the retry backoff and BEFORE overflow
   compaction; the raw `message` entry keeps its `stopReason` /
   `errorMessage`; `buildSessionContext` projects the target to nothing;
   exhaustion and disablement return before the omit, so a final failed
   attempt is always projected); the detection predicate (this-attempt
   null-replacement `context_edit` targeting a this-attempt assistant
   `message` entry, read from the chronological leaf path with
   `entry.type` as an open string; newest such edit; HEALED iff a later
   assistant `message` entry exists on the path); the dispositions:
   healed → not classified, normal PIC-51/51b/53 fall-through; unhealed
   with NO abort observed anywhere → the query MUST end
   `Err(transport, retryable: true)` carrying the omitted entry's raw
   `errorMessage` (or naming its raw `stopReason` when absent) via the
   fixed stem — it MUST NOT bind pre-omission narration, MUST NOT reach
   PIC-53, MUST NOT dispatch a typed query's forced respond turn, MUST
   NOT be pre-empted by a captured early-respond payload, and MUST NOT
   ride (PIC-78's no-abort posture: no continuation without an observed
   abort); unhealed with an observed abort → the arm is skipped and
   PIC-78 owns the settle (its aborted run's post-omission assistant
   classifies; the pre-token no-assistant residue shape cancels through
   PIC-78's existing arms). Inertness below 0.87 (no `context_edit` entry type
   → the arm never fires). Note the single insertion point upstream of
   PIC-70's settled/expiry branch and that PIC-70's expiry stems remain
   the backstop when no omission exists.
2. **PIC-70, *Expiry is loud* clause** — one sentence: when the
   chronological leaf path proves an unhealed host recovery omission of
   this turn's own attempt (PIC-79), the settle-phase expiry is replaced
   by PIC-79's omission `Err` (retryable, naming the omitted error)
   rather than the fixed settle stem; the three phase stems stay the
   backstop for every other expiry.
3. **PIC-53** — one sentence beside the error-stop join exclusion:
   narration preceding a host-omitted failed attempt is never bound as
   the turn's value while the omission is unhealed — PIC-79's arm
   precedes the extraction; once healed, the projection the host already
   scrubbed is extracted unchanged.
4. **PIC-78** — (a) *Recorded consumption postures* gains posture (5):
   pi ≥ 0.87 durably omits the failed attempt from the projection
   (`context_edit` with `null` replacement) before the backoff and
   before overflow compaction, while retaining the raw entry on the
   branch — the classifier stays projection-based BY DESIGN (a raw-aware
   `"recovered"` would flip ESC-raced-the-end cancels into binds);
   PIC-79 owns the raw read. (b) The classifier-scope sentence ("an
   attempt at which no abort was observed is not classified…") gains:
   …after PIC-79's omission arm has passed (an unclassified attempt
   falls through to PIC-51/51b/53 only when no unhealed this-attempt
   omission exists).
5. **cancellation.md, slash-command bullet** — rewrite the two
   uncovered-window CONSEQUENCE sentences ("On pi ≥ 0.87 the host drops
   the failed error-stop … Neither surfaces `cancelled`."): the windows
   still record nothing and forward nothing, but the settle no longer
   binds the pre-omission narration nor mints the misattributed
   settle-phase expiry — PIC-79 ends the query
   `Err(transport, retryable: true)` naming the omitted error; an abort
   in those windows therefore surfaces as that loud retryable transport
   failure, not as `cancelled` (accepted posture, pin-parity with
   ≤ 0.86's visible-error disposition).
6. **version-bump-step2.md item (av)** — extend with posture (5): the
   omission entry type (`context_edit`), its `replacement: null`
   omission semantics, raw retention on `getBranch()`, and the
   `_prepareRetry`/`_checkCompaction` gate ORDER (enabled/exhaustion
   before omit; overflow one-shot) that keeps final failed attempts
   projected; a rename/shape change makes PIC-79's arm inert —
   fail-safe back to the pre-fix loud-expiry/silent-bind behaviour, so
   the bump audit MUST re-check the shape. Add: when the dev pin
   crosses ≥ 0.87, add the live omission witness this fix cannot have
   (residual 4) and re-verify the harness's projection-divergence
   double against the real host projection.
7. **docs/plan_topics/coverage-matrix.md** — new PIC-79 row naming the
   witness file.

### Witnesses (numbered; red-before at 9e5094c6 → green-after)

Driver cells in a new `tests/b0499-host-omitted-recovery.test.ts` —
b0483/b0482 harness pattern (real producer → `bindPromptConversation` →
`executeBody`, injected Clock, scripted session double) with the ≥ 0.87
read-surface divergence modelled at the double: `getBranch()` returns
the RAW branch (omitted `message` entry + `context_edit` entries
included), `getEntries()` returns the post-omission view (null-edited
targets dropped, chain relinked) so the repo-pinned 0.80.10
`buildSessionContext` builds exactly what 0.87.1's edit-applying
projection builds. Predicate cells beside the helper. Cells 1–5 PROVEN
RED at 9e5094c6 in a scratch git-archive copy (§Red evidence); 8–9
proven green there.

1. **O3 untyped, narration** (`user → asst(toolUse, narration) →
   toolResult → asst(error, retryable) → omit → idle`, no abort):
   `Err(transport)`, `retryable: true`, message carries the omitted
   `errorMessage`, `thetaAbort` untouched. RED (proven):
   `outcome=success`, `value="reviewing shard-02: file 1 of 15 looks
   clean so far"` — the silent partial bind. Independent of 0501.
2. **O3 untyped, pure tool-use** (narration absent): same `Err`. RED
   (proven): `outcome=success, value=""`. Independent of 0501.
3. **O4 untyped, round-0** (omit the turn's only assistant): same `Err`
   (after the settle bound elapses on the fake clock). RED (proven):
   `Err(transport, "on-session turn did not settle: the run never
   completed and its reply never landed (waited 10000ms)",
   retryable: false)` — misattributed AND masking the real error.
   Independent of 0501.
4. **Typed O3, no capture** (schema query; free phase settles the O3
   shape; scripted `complete()` queue armed): free phase Errs with the
   omission `Err`; ZERO forced respond dispatches. RED (proven):
   `outcome=success, value={"score":7}, dispatches=1` — a fabricated
   payload bound `Ok` over a turn the provider never finished.
   Independent of 0501.
5. **Typed O3, captured payload in hand** (respond captures `{score: 5}`
   mid-free-phase, then error + omit): the capture does NOT pre-empt —
   same omission `Err`, zero dispatches (cells 9/10 parity pin). RED
   (proven): `outcome=success, value={"score":5}`. Independent of 0501.
6. **O5 overflow omission, unanswered trailing compaction, drifted
   anchor** (3 prior exchanges; rounds; error + omit(+toolResult edits);
   compaction keeping the driven user entry; NO continuation; idle; no
   abort): the omission `Err` (retryable, omitted message) instead of
   the generic expiry. RED by analysis at 9e5094c6 (same generic-expiry
   family as cell 3; the drifted variant additionally witnessed by
   0501's scratch R-cells) — to be proven red in-lane at implementation.
   Green-after needs only this fix's arm (the expiry path exists on both
   sides of 0501).
7. **O6 healed guard, drifted anchor** (error + omit; compaction;
   continuation `stop` reply; idle; no abort): binds the continuation
   reply; the helper returns `undefined` (healed) and the omission arm
   stays silent. GREEN only WITH 0501's un-gated relocated read (at
   9e5094c6 this is 0501's own red — its witness-1 family); in this
   suite it is the healed-guard pin. **Depends on 0501's code.**
8. **Healed backoff guard, anchored** (error + omit; retried `stop`
   assistant; idle): binds `"the retried full answer"`. PROVEN GREEN at
   9e5094c6; stays green (mutation probe: treating any omission as
   unhealed reds this cell and 7).
9. **0.80.10-shape control** (no `context_edit`; error-stop VISIBLE
   trailing): PIC-51 `Err(transport, <real errorMessage>,
   retryable: false)`. PROVEN GREEN at 9e5094c6; stays green — the
   dormancy pin (the arm changes nothing at the repo pin).
10. **Recorded-abort composition pin** (attempt 1 error + omit; ride
    context: watchdog abort recorded on the retried run whose rewritten
    tagged error-stop trails — post-omission assistant present): the
    0483 ride fires exactly as at 0.494.0 (one ride note, one
    continuation send, then the scripted recovery binds). GREEN before
    (0483 shipped) and after; reds under the mutation probe that drops
    the arm's `!abortObserved` guard.
11. **Predicate cells** (`unhealedRecoveryOmission` unit block): (a) no
    edits → `undefined`; (b) null-edit targeting a PRE-attempt entry →
    `undefined`; (c) content-replacement edit (`replacement` non-null) →
    `undefined`; (d) null-edit + this-attempt assistant target + no
    later assistant → found, carries `errorMessage`; (e) later assistant
    entry → `undefined` (healed); (f) null-edit targeting a this-attempt
    `user` entry → `undefined`; (g) two omissions → the NEWEST edit's
    target reported; (h) toolResult-targeting edits after the assistant
    edit neither anchor nor mask; (i) a `"length"`-stop omitted target
    reports `stopReason` with `errorMessage` absent. Green-at-birth
    pins (the driver cells carry the red).
12. **Stem-constant cell**: the omission `Err`'s message is built from
    `PROMPT_MODE_HOST_OMITTED_RECOVERY_MESSAGE` and includes the omitted
    `errorMessage` (mirrors the b0288 stem cells).
13. **Regression**: `tests/b0482-…` 4/4, `tests/b0483-…` 43/43, the
    b0501 suite (as landed in 0.495.0), full default suite, parse gate —
    all unchanged.

Mutation probes recorded for the implementation gate: (i) drop the
`!abortObserved` guard → cell 10 red; (ii) drop the healed check →
cells 7/8 red; (iii) read the projection instead of the raw branch in
the helper → cells 1–5 red (the arm never fires).

### Red evidence (scratch, 2026-09-29)

Git-archive copy of 9e5094c6 + node_modules junction;
`tests/b0499-scratch-red.test.ts` (cells R1–R5 ≙ witnesses 1–5, G1/G2 ≙
witnesses 8–9; the double's `getEntries()`/`getBranch()` divergence as
specified above), single vitest run: **5 failed / 2 passed** —
- R1: `outcome=success, value="reviewing shard-02: file 1 of 15 looks
  clean so far"` (silent partial bind of pre-error narration);
- R2: `outcome=success, value=""`;
- R3: `outcome=fail, error={"kind":"transport","message":"on-session
  turn did not settle: the run never completed and its reply never
  landed (waited 10000ms)","http_status":null,"provider":
  "anthropic-messages","retryable":false}` — misattributed, real error
  masked;
- R4: `outcome=success, value={"score":7}, dispatches=1` — the forced
  respond dispatched over the unhealed omission settle and bound a
  fabricated payload;
- R5: `outcome=success, value={"score":5}, dispatches=0` — the captured
  payload bound `Ok` on a mid-recovery-killed turn;
- G1 bound `"the retried full answer"` (healed); G2 mapped the visible
  error-stop `Err(transport, <real message>, retryable: false)`.
All five reds show `thetaAbort.aborted=false, sends=["Ping"]` — no
cancellation anywhere, exactly one provider turn.

### Residuals / non-goals

1. **Bound-burn latency on O4/O5.** The settle poll's exit predicate is
   deliberately untouched (single-purpose, 0501's design), so the
   unsettled omission shapes still wait out the full settle bound
   (10 s wall at production cadence) before the honest `Err` surfaces.
   Revisit only if it matters in practice (open question 2).
2. **An extension's own `appendContextEdit(id, null)`** on a
   this-attempt assistant is indistinguishable from the host's recovery
   omission — the arm Errs retryable naming that entry. Defensive-
   consumption posture; the host is the only known writer.
3. **Visible non-normal-stop attempt + trailing threshold compaction**
   (e.g. retry-exhausted error, then the estimate-based threshold arm
   compacts): no omission exists, so this arm stays silent and the
   0500-sharpened veto still expires the settle generically, masking
   the real error — 0501 residual 2's exact family, extended to the
   error-stop twin. Loud either way; recorded, not fixed here.
4. **No live witness.** The dev pin (0.80.10) lacks the omission
   mechanism entirely, and a ≥ 0.87 live cell needs a real retryable
   mid-turn provider failure. Routed to item (av): add the live cell
   when the pin crosses 0.87 (spec amendment 6).
5. **ESC-in-backoff surfaces `Err(transport, retryable: true)`, not
   `Err(cancelled)`.** Nothing observable marks the abort (measured
   fact: `ctx.signal` is `undefined` in the window). Accepted:
   pin-parity with ≤ 0.86's disposition of the identical window, loud
   either way, and `retryable: true` is honest about re-runnability.
6. **0483 residuals 5/6 extend**: a ≥ 0.87 `context_edit` on prior
   history composes with the identity guard as recorded there; mid-drive
   tree navigation onto a branch carrying foreign entries can make them
   read as this-attempt appends (same exposure as 0501's attempt-owned
   compaction definition).
7. **The classifier stays projection-based** (§Per-component 4) — a
   deliberate non-goal, not an oversight.

### Open questions

1. **Stem wording.** The exact `PROMPT_MODE_HOST_OMITTED_RECOVERY_MESSAGE`
   text is fixed at implementation (witness 12 pins the constant and the
   omitted-message inclusion; the design pins the semantics: names the
   host omission, carries the omitted error, `retryable: true`).
2. **Settle-poll short-circuit on unhealed omission** (save the O4/O5
   bound-burn): deferred — it would add a raw walk per poll tick and a
   second purpose to the poll predicate; nothing external heals an
   omission after idle on ≥ 0.87 (pi-retry re-kicks only after its OWN
   recorded abort), so the only cost is latency, not correctness.
3. **Harness divergence retirement.** When the dev pin crosses ≥ 0.87,
   the double's `getEntries()` filtering should be replaced by the real
   host projection (`buildSessionContext` applying edits natively) —
   decide at the (av) bump alongside residual 4's live cell.

### Version / CHANGELOG

One minor bump at landing — **0.496.0**, on top of 0501's 0.495.0 — with
a `### Fixed` entry naming bug 0499. The CHANGELOG entry, not the
version number, carries the bug id.

## Relation to prior bugs

- **0483 (fixed, 0.494.0)** — same event family (host recovery during a
  driven turn); 0483 fixed retry-abort misclassification and ships the
  recorder/classifier/ride this design composes with; this bug covers
  the ≥ 0.87 projection-scrubbing the 0483 classifier cannot see
  through. The 0483 record's §Measured host facts item (a) documents the
  0.87 post-abort bail this bug's window depends on.
- **0501 (fix settled; 0.495.0; folds 0500)** — the no-abort settle-read
  fix this design lands on top of: its answered-compaction walk reads
  RAW stops (omission-proof, its witness 10 pins the composition), its
  un-gated relocated read binds this bug's HEALED overflow continuations
  (witness 7 here), and its design reserved the single expiry sites this
  fix's arm sits upstream of.
- **0500 (folded into 0501)** — the overflow arm's omission is
  immediately followed by the compaction entry whose post-reply twin
  0500 covered; both fixes read the same raw this-turn slice
  (`turn-settlement.ts` hosts both walks).
- **0482 (fixed)** — introduced the raw-path read (`readContextPath`)
  this fix builds on.
- **0007 (fixed 0.18.0)** — the original "error-stop swallowed as
  `Ok`" class, off-session; this is the on-session ≥ 0.87 recurrence via
  host-side projection editing rather than pi-theta misreading.
