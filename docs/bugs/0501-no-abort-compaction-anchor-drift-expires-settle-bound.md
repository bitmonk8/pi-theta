# Bug 0501 — a mid-turn overflow or split-turn compaction with NO recorded abort drifts the `turnStart` anchor out of the rebuilt message list: `thisTurnSettled` never opens, the settle poll burns its full 10 s bound, and the reply already sitting in the rebuilt list is discarded as a false, non-retryable `Err(transport)` "on-session turn did not settle" — the 0483 fix's compaction-relocated read exists but runs only when an abort was recorded

- **Status:** open
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S3/D2 — S3: no silent corruption (the failure is
  loud), but it is FALSE — the host's own overflow recovery completed the
  turn and the reply is in the rebuilt list; the drive burns the full 10 s
  settle bound, discards it, and mints `Err(transport)` with
  `retryable: false` (`mapPromptModeTurnLifecycleExpiry`), so a
  retry-on-retryable caller does not even re-run it. The trigger selects
  the heaviest turns by construction: a driven tool loop whose context
  grows past the model window mid-turn — exactly bug 0482's evidence shape
  (a 4985-LOC review shard on a 128k-window model) — fails after burning
  its full token cost, on BOTH host pins, in untyped queries and the
  typed-query free phase alike. Bug 0482's wait-through contract is
  delivered only when the anchor survives the rebuild; in the drifted
  topologies its promised destination (settle on the reply that follows
  the compaction) is unreachable. D2: the 0483 fix (branch b0483,
  releasing as 0.494.0) already ships the needed machinery
  (`#ownTrailingTurnSlice`, `newestCompactionSummaryIndex`,
  `#windowRelocated`); the fix is un-gating that read for the no-abort
  settle path plus witnesses. Lands on top of 0.494.0.
- **Where (pi-theta, main e37e1582):**
  - `src/extension/live-prompt-query-driver.ts:706` — `turnStart` is the
    built-`Message[]` LENGTH before this attempt's send; `:932–938` — the
    settle poll spins `TURN_SETTLE_POLL_BOUND` 1000 × `POLL_INTERVAL_MS`
    10 ms = 10 s on `thisTurnSettled(readMessages(), turnStart, path)`,
    then `#recordLifecycleExpiry("settle", 10000)`.
  - `src/extension/turn-settlement.ts:111–124` (`turnSliceSince`) — scans
    only indexes ≥ `fromIndex` for a `user` message; a rebuilt list
    shorter than `turnStart`, or one whose driven `user` message shifted
    below it (or was summarised away), yields `opened: false` forever;
    `:131–137` (`thisTurnSettled`) — the anchor conjunct is the only one
    that fails: once the continuation reply lands, the raw leaf path ends
    on an `assistant` message entry, so `trailingCompactionUnanswered`
    (`:149–163`) no longer vetoes.
  - `src/runtime/prompt-transport-mapping.ts:116–117` —
    `PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE` "on-session turn did not
    settle: the run never completed and its reply never landed" — both
    clauses false here; `:139+` maps it with `retryable: false`.
- **Where (pi-theta, 0483 fix — branch b0483 @ 23fe8af2, releasing as
  0.494.0):**
  - `src/extension/live-prompt-query-driver.ts:1150–1159` — the settle
    poll's second disjunct, `trailingSettledSlice()`, is gated
    `recorder.recorded && !this.#thetaAbort.signal.aborted`: the
    compaction-relocated read runs only when a `ctx.signal` abort was
    recorded mid-turn. A pure host-side overflow recovery aborts nothing,
    so a no-abort attempt never consults it; `:1183–1189` — with
    `thisTurnSettled` false and `trailingSlice === undefined` the attempt
    ends in `#recordLifecycleExpiry("settle", …)`, and with no recorded
    abort that mints the transport expiry (`:1372–1385`).
  - `:1311–1340` (`#ownTrailingTurnSlice`) — the relocated read this bug
    wants on the no-abort path: PIC-51's last-user anchor
    (identity-checked against `userBeforeSend`, so a stale trailing user
    never re-binds), else — when a `compaction` entry absent from
    `pathIdsBeforeSend` proves the rebuild happened during this attempt —
    the list after the newest compaction summary
    (`newestCompactionSummaryIndex`, `:60–68`); an unanswered trailing
    compaction still returns `undefined`.
  - `:764–777` (`#dispatchRespondOverWindow`) — the `#windowRelocated`
    rule (round 4): after a relocated classification a typed query's
    forced respond / repair dispatch returns a loud retryable
    `Err(transport)` naming the compaction relocation instead of
    replaying `slice(#queryWindowStart)` over the rebuilt list.
- **Where (host — both pins ride a mid-turn overflow compaction in the
  SAME run, with no abort anywhere):**
  - pi 0.80.10 (repo devDependency) `dist/core/agent-session.js:751–757` —
    `_runAgentPrompt`'s `while (await this._handlePostAgentRun())` →
    `agent.continue()`; `:782` → `_checkCompaction` (`:1510`), overflow
    arm `:1531–1558`: `willRetry = stopReason !== "stop"`, the failed
    error-stop is removed from agent state, then
    `_runAutoCompaction("overflow", willRetry)` appends the `compaction`
    entry and rebuilds `agent.state.messages` from the new projection
    (`:1678–1681`), returning `true` for `willRetry` (`:1702–1710`).
    `_isAgentRunActive` stays true throughout; `ctx.signal` never aborts;
    0.494.0's `DeferredHostAbort` recorder records nothing.
  - pi 0.80.10 `dist/core/compaction/compaction.js:285–328`
    (`findCutPoint`) — `isSplitTurn` when the cut lands mid-turn, i.e.
    when the turn's own content after its `user` message exceeds
    `keepRecentTokens` (default 20000, `:54`); `prepareCompaction`
    `:456–523` — `historyEnd = isSplitTurn ? turnStartIndex :
    firstKeptEntryIndex` (`:484`) puts everything before the driven turn
    into the history summary, and the split-turn prefix
    `[turnStartIndex, firstKeptEntryIndex)` — the driven `user` message
    included — is summarised into the merged "Turn Context (split
    turn)" block (`:494–513`, `compact` `:548–560`): the driven user
    message is GONE from the projection.
  - pi 0.87.1 (operator's global install) — same ride:
    `_handlePostAgentRun` (`:1106`; the abort bails at `:1111–1114` are
    not taken — no abort) → `_checkCompaction` (`:1135`), overflow arm
    `:2048–2104` — additionally `_omitRecoveryAttempt(assistantMessage,
    toolResults)` (`:2102`, bug 0499's omission) before
    `_runAutoCompaction("overflow", willRetry)` (`:2103`, `willRetry` →
    `true` at `:2243–2244`) → `agent.continue()` (`:1084`). Cut logic:
    `findProjectedCutPoint` `:573–626` / `prepareCompaction` `:627–676`
    in `dist/core/compaction/compaction.js` (`keepRecentTokens` 20000,
    `:77`) — same `isSplitTurn` semantics over projected entries.

## Observed (2026-09-29, release review of the 0483 fix, round 5)

Flagged as the review's class (b) pre-existing finding: the no-abort
anchor drift was recorded only as bug 0482 residual 1 ("Started-anchor
drift") and never filed. Bug 0482's own verification had already
witnessed it empirically (prior-history probe: `outcome=fail`,
`value=undefined`, `error.kind=transport`, identical at HEAD) and
accepted it as safe-because-loud; the 0483 fix then built the relocated
trailing-turn read (rounds 3–4) but wired it only into the
recorded-abort settle path, leaving the no-abort twin exactly as 0482
left it — on main AND on the 0.494.0 branch. No live repro is on file
(forcing a real `"overflow"` compaction needs a genuine context-window
overflow, outside the token-bounded live suite — bug 0482 residual 2);
the host-side ordering is verified by the source walks above.

## Mechanism

1. A driven turn's context crosses the model window mid-turn: the
   provider returns a context-overflow error-stop. On both pins the host
   recovers INSIDE the same agent run — compact (`"overflow"`,
   `willRetry: true`), rebuild the projection, `agent.continue()` — with
   no `ctx.abort()` anywhere. The 0.494.0 recorder therefore records
   nothing, and the session never reads idle until the retried
   continuation settles (the driver's 30-min end-poll rides it out).
2. The rebuild moves or erases the anchor. `buildSessionContext` now
   yields `[compactionSummary, kept entries…]`. Long-prior-history cut
   (non-split): the driven `user` message survives but everything before
   it collapses into one summary message, so its rebuilt index sinks
   below `turnStart` (the pre-send LENGTH of the long list). Split-turn
   cut (`isSplitTurn` — the turn's own post-user content exceeded
   `keepRecentTokens` = 20000): the driven `user` message sits in the
   summarised turn prefix, so NO `user` message anchors the turn at all.
3. The continuation reply lands in the rebuilt list; the raw leaf path
   ends `[…, message(user), …, compaction, message(assistant reply)]`,
   so `trailingCompactionUnanswered` is false (0482's wait-through is
   satisfied). The ONLY failing conjunct is the anchor:
   `turnSliceSince(messages, turnStart)` scans indexes ≥ `turnStart` and
   finds no `user` (list shorter than `turnStart`, or no `user` at or
   after it) → `opened: false` → `thisTurnSettled` false forever.
4. The settle poll expires its full bound (1000 × 10 ms = 10 s);
   `#recordLifecycleExpiry("settle", 10000)` with no recorded abort mints
   `Err(transport)` "on-session turn did not settle: the run never
   completed and its reply never landed (waited 10000ms)",
   `retryable: false` — both clauses false, the real (settled) answer
   discarded. A typed query's free phase fails the same way before any
   respond dispatch.
5. On 0.494.0 the cure already exists: `#ownTrailingTurnSlice` locates
   exactly this settled turn — last-user anchor, else the span after the
   newest compaction summary appended during this attempt — but
   `trailingSettledSlice()` requires `recorder.recorded`, so the
   no-abort attempt never reaches it.

## Expected

Bug 0482 §Fix contract 1 promises the turn settles when an assistant
reply FOLLOWS the compaction entry. When that reply arrives in the
rebuilt list, the drive binds it (untyped queries) or fails loudly with
the honest retryable relocation `Err` (typed queries, 0483's
`#windowRelocated` rule) — never a false non-retryable "never completed
and its reply never landed".

## Actual

The no-abort settle path knows only the `turnStart` index anchor. A
mid-turn overflow or split-turn compaction drifts it out of the rebuilt
list, the settle poll expires the full 10 s bound, and the settled reply
is discarded as a false transport `Err`. On 0.494.0 the
compaction-relocated read is reachable only when a mid-turn `ctx.signal`
abort was recorded (the stall-watchdog/ESC family) — which the pure
host-side overflow recovery never produces.

## Fix direction (on top of 0.494.0)

1. **Un-gate the relocated read:** consult
   `#ownTrailingTurnSlice(userBeforeSend, pathIdsBeforeSend)` in the
   settle poll and its post-poll classification whenever
   `thisTurnSettled` has not opened — not only under `recorder.recorded`.
   Its existing guards keep the read honest with no abort in play: the
   identity check against `userBeforeSend` (a stale trailing user never
   re-binds — bug 0288 P2 preserved), the no-user arm requires a
   `compaction` entry absent from `pathIdsBeforeSend` (only a compaction
   appended during this attempt explains a missing anchor), and
   `trailingCompactionUnanswered` still vetoes an unanswered compaction
   (0482 contract intact). The no-abort path keeps the full
   `TURN_SETTLE_POLL_BOUND` (the 50-poll grace is an abort-path concern).
2. **Settle, then bind or relocate-Err:** a no-abort settle located
   through the relocated read is a NORMAL settle — fall through to the
   ordinary PIC-51 probe / PIC-53 extraction, feeding them the relocated
   span (in the split-turn no-user layout, PIC-53's whole-list fallback
   would otherwise join the turn's kept pre-cut assistant narration with
   the continuation; the span after the newest summary is the correct
   window, exactly as the 0483 classify path already slices it). Set
   `#windowRelocated`, so a typed query's forced respond / repair
   dispatch takes 0483's loud retryable relocation `Err` rather than
   dispatching over a stale `slice(#queryWindowStart)` window; an
   early-respond capture already held still wins (QRY-14).
3. **Backstop unchanged:** a compaction whose continuation reply never
   lands keeps expiring loudly via the settle-phase bound (the relocated
   read returns `undefined` while the trailing compaction is unanswered).
4. **Witnesses:** session-double cells over the real
   `buildSessionContext` rebuild — (a) long-prior-history shift (driven
   user below `turnStart`, reply follows the compaction) → binds the
   continuation text (RED today: 10 s expiry); (b) split-turn layout (no
   `user` in the rebuilt list, compaction id absent from the pre-send
   path) → binds via the after-summary span; (c) reply-absent → still
   the loud expiry; (d) typed query settling through the relocated read
   → relocation `Err(transport, retryable)` on the respond dispatch, no
   fabricated payload; (e) guard: a rebuilt list whose trailing user is
   `userBeforeSend` by identity (own send never landed) → expiry, never
   a re-bind. The b0482 suite's four cells all keep the anchor openable;
   none covers the drifted anchor.
5. **Spec:** conversation-drive.md — extend PIC-78's relocated-read
   paragraph (today written only for the recorded-abort settle-grace) to
   the no-abort settle path, and note in PIC-70's settle clause that the
   wait-through destination is reached via the relocated read when the
   compaction moved or summarised the anchor.

## Relation to prior bugs

- **0482 (fixed)** — this IS its residual 1, promoted to a filed bug;
  the wait-through contract and `trailingCompactionUnanswered` are
  untouched, made reachable in the drifted topologies.
- **0483 (open, fix releasing as 0.494.0)** — supplies the machinery
  (`#ownTrailingTurnSlice`, `newestCompactionSummaryIndex`,
  `#windowRelocated`) and confines it to the recorded-abort path; this
  bug extends its reach to no-abort settles. Fix lands on top of
  0.494.0.
- **0499 (open, filed from the same review)** — on pi ≥ 0.87 the
  overflow arm first omits the error-stop (`context_edit`) that this
  bug's compaction follows; the fixes read the same raw this-turn slice
  and must compose (0499's recovery-aware arm decides ride/`Err`, this
  bug's relocated read decides where the settled turn IS).
- **0500 (open, filed from the same review)** — sibling false-expiry:
  0500 is the path-side veto after an answered POST-RUN threshold
  compaction; this bug is the anchor-side drift after a MID-TURN
  overflow/split-turn compaction. Both discard a landed reply as the
  same false settle-phase `Err(transport)`.
- **0288 (fixed)** — defined the `turnStart` anchor semantics (P2:
  never re-extract an earlier turn); the identity guards in (1) preserve
  that guarantee through the relocation.
