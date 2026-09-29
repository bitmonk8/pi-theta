# Bug 0499 — on pi ≥ 0.87 the host durably omits a turn's error-stop assistant from the projected context (`context_edit(id, null)`) before core-retry backoff and before overflow compaction; a turn that settles inside that omission window reads as a clean pre-error settle: PIC-51 passes on the last `toolUse` assistant and PIC-53 binds the pre-error narration as a silent partial `Ok`

- **Status:** open
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

## Fix direction

Make the omission visible to the drive via the raw path the driver
already holds (`readContextPath`, `sessionManager.getBranch()`):

1. **Detect:** in the settle/classify path, walk THIS turn's slice of the
   raw branch (from the turn's own `user` entry); a `context_edit` entry
   whose `targetId` names a `message` entry inside the slice marks the
   turn as omission-in-recovery. (At the 0.80.10 pin no `context_edit`
   entry type exists, so the arm is inert — no behaviour change at the
   repo pin; type the walk defensively over `entry.type === "context_edit"`
   as an open string.)
2. **Ride, don't bind:** treat omission-in-recovery as
   `classifyHostRecoverySettle`'s "recovering" (bug 0483): keep waiting /
   re-drive within the existing ride bound instead of binding. On final
   settle, never extract text from messages that precede the newest
   omitted error entry: if no post-omission assistant ever lands, the
   ending is `Err(transport, retryable: true)` carrying the omitted
   entry's raw `errorMessage` (readable from the raw branch even though
   the projection dropped it) — never `Ok(<pre-error narration>)` and
   never the bare 10 s "did not settle" misattribution.
3. **Witnesses:** session-double cells for (a) the toolUse-trailing bind
   window (today's silent `Ok("")` → post-fix ride/`Err`), (b) the
   only-assistant-omitted 10 s expiry (post-fix: recovery-aware `Err`
   naming the omitted error), (c) 0.80.10-shape control (no
   `context_edit` → unchanged), (d) a post-omission recovered reply binds
   normally. Coordinate with the 0483 fixer: the classifier is the
   natural host for the raw-path read, and 0483's live stall-watchdog
   harness is the closest live witness surface.

## Relation to prior bugs

- **0483 (open, fix in flight)** — same event family (host recovery
  during a driven turn); 0483 fixes retry-abort misclassification at the
  0.80.10 pin, this bug covers the ≥ 0.87 projection-scrubbing the 0483
  classifier cannot see through. The 0483 record's §Measured host facts
  item (a) documents the 0.87 post-abort bail this bug's window depends
  on.
- **0500 (filed together)** — the overflow arm's omission is immediately
  followed by the compaction entry whose post-reply twin 0500 covers;
  both fixes read the same raw this-turn slice.
- **0482 (fixed)** — introduced the raw-path read (`readContextPath`)
  this fix builds on.
- **0007 (fixed 0.18.0)** — the original "error-stop swallowed as
  `Ok`" class, off-session; this is the on-session ≥ 0.87 recurrence via
  host-side projection editing rather than pi-theta misreading.
