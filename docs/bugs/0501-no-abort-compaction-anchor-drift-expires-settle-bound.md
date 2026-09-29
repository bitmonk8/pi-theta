# Bug 0501 — a mid-turn overflow or split-turn compaction with NO recorded abort drifts the `turnStart` anchor out of the rebuilt message list: `thisTurnSettled` never opens, the settle poll burns its full 10 s bound, and the reply already sitting in the rebuilt list is discarded as a false, non-retryable `Err(transport)` "on-session turn did not settle" — the 0483 fix's compaction-relocated read exists but runs only when an abort was recorded

- **Status:** open — `## Fix` settled 2026-09-29 (design; folds bug
  0500 in — see §Fix decision; implementation pending, targets
  0.495.0)
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

## Fix (settled 2026-09-29 — design; on top of 0.494.0, main 08a8ba39; targets 0.495.0)

**Decision — bug 0500 is FOLDED into this fix** (0500's doc points here):

1. *Same defective read.* 0501 and 0500 are the two conjuncts of
   `thisTurnSettled` (`src/extension/turn-settlement.ts:131–137`) — the
   `turnStart` anchor conjunct (0501) and the
   `!trailingCompactionUnanswered(path)` veto conjunct (0500) — each
   discarding the same landed reply as the same false
   `Err(transport, retryable: false)` settle-phase expiry, witnessed by
   the same harness and observable.
2. *The composition is load-bearing.* `#ownTrailingTurnSlice`'s FIRST
   gate is `trailingCompactionUnanswered`
   (`live-prompt-query-driver.ts:1316`), so the un-gated relocated read
   (0501's cure) stays blind in every topology whose trailing raw entry
   is a post-reply compaction: the combined shape — mid-turn overflow
   drift, continuation reply, then a post-run threshold compaction of
   the SAME heavy turn — needs BOTH arms (scratch cell R4 below; fixing
   0501 alone leaves R4 red, fixing 0500 alone leaves R1/R2/R5 red).
3. *Identical risk profile.* Both changes are read-side only (no new
   sends, no new provider traffic, no cancellation-path change), land in
   the same ~30-line region, and separate releases would re-verify the
   same cross-interactions twice. 0500 is D1 folded into a D2.
4. *Witness overlap.* One session-double suite covers both plus the
   combined cell; 0500's own cells are two predicate arms away.

**0499 stays separate** (recommended version plan: this fix ships alone
as 0.495.0; 0499 follows on its own): 0499 is the ≥ 0.87-only
projection-omission consumption with its own raw-branch `context_edit`
detection arm and ride integration — mechanically disjoint from these
two settle-read conjuncts. This design keeps 0499's insertion point
single-sited and is verified below not to foreclose it.

### Root cause per pin

One drive-side defect, two host-verified trigger families, on BOTH pins:

- **Anchor drift with no abort (0501).** Mid-turn overflow recovery —
  pi 0.80.10 `_checkCompaction` overflow arm (`agent-session.js:1531+`,
  `willRetry = stopReason !== "stop"`, error-stop removed from agent
  state but "IS saved to session for history") →
  `_runAutoCompaction("overflow", willRetry)` (`appendCompaction`, then
  `agent.state.messages = sessionContext.messages`, `:1678–1681`; return
  `true` → `agent.continue()` in `_runAgentPrompt`'s while-loop
  `:751–757`); pi 0.87.1 the same shape (`:2048–2104`) plus
  `_omitRecoveryAttempt(assistantMessage, toolResults)` (`:2102`, bug
  0499's `context_edit` omission) ahead of `_runAutoCompaction` and an
  additional `isRecoverableLength` trigger (`:2071` — a truncated
  `"length"` stop below the model's `maxTokens` is ALSO
  compact-and-retried on ≥ 0.87). Neither pin aborts `ctx.signal`
  anywhere on this path and `_isAgentRunActive` stays true throughout,
  so 0.494.0's `DeferredHostAbort` records nothing and the session stays
  non-idle until the continuation settles. A second no-abort drift
  trigger needs no overflow at all: the PRE-PROMPT compaction check
  (0.80.10 `:866–869`, 0.87.1 `:1278` — `_checkCompaction(lastAssistant,
  false)`, threshold or overflow-shaped) runs between the driver's
  pre-send `turnStart` snapshot and the send's own `user` entry, so any
  driven send onto a near-threshold session rebuilds the list under the
  recorded index. The rebuild then moves or erases the anchor exactly as
  §Mechanism items 2–3 describe (cut logic: `findCutPoint`/`isSplitTurn`
  0.80.10 `compaction.js:285–328`, `prepareCompaction` `:456–523`,
  `historyEnd = isSplitTurn ? turnStartIndex : firstKeptEntryIndex`;
  0.87.1 `findProjectedCutPoint` `:573+` / `prepareCompaction` `:627+`
  over PROJECTED entries; `keepRecentTokens` 20000 on both). The
  relocated read that cures it ships in 0.494.0 but
  `trailingSettledSlice()` gates it on `recorder.recorded`
  (`live-prompt-query-driver.ts:1150–1159`), so the no-abort attempt
  expires the full settle bound into
  `mapPromptModeTurnLifecycleExpiry("settle", 10000)` —
  `retryable: false`, both message clauses false.
- **Post-reply compaction misread as unanswered (0500).** A post-run
  compaction is appended after the turn's FINAL normally-stopped
  assistant and before the run settles idle, on both pins and on TWO
  arms each: threshold (0.80.10 `:1585–1586`, 0.87.1 `:2137–2138` —
  `_runAutoCompaction("threshold", false)` inside `_handlePostAgentRun`,
  which returns `hasQueuedMessages()`, normally false → the run settles
  with the compaction as the leaf's trailing raw entry) AND overflow
  with `willRetry: false` (BOTH pins: a `stopReason: "stop"` reply whose
  usage crossed the window compacts without retry — so compaction
  REASON, even if it were recorded, would not discriminate; the
  `compaction` entry carries NO reason field on either pin —
  `appendCompaction` 0.80.10 `session-manager.js:742`, 0.87.1 `:880`).
  `trailingCompactionUnanswered` (`turn-settlement.ts:149–163`) keys
  only on "is a `compaction` the first hit from the path's end", so the
  answered turn reads unsettled forever and the same false expiry fires.
- **Pin divergence recorded (for bump item (av)).** An older compaction
  inside the newest's kept range projects a SECOND summary after the
  newest on 0.80.10 (`buildContextEntries` hoists the newest to the
  head; `sessionEntryToContextMessages` maps the older entry to a
  `compactionSummary` message), but projects to NOTHING on 0.87.1
  (`buildSessionProjection`: "Only the newest compaction at index zero
  contributes", `session-manager.js:265–276`). Both satisfy the only
  property the code relies on — the newest summary is the FIRST
  `compactionSummary` in the built list (`newestCompactionSummaryIndex`
  scans forward). Message identity is projection-stable on both pins
  (`sessionEntryToContextMessages` returns `entry.message` by reference;
  0.87.1 fabricates fresh objects only for `context_edit`-replaced
  entries — 0483 residual 5), so the `userBeforeSend` identity guard
  holds for unedited entries.

### Per-component changes

**1. `src/extension/turn-settlement.ts` — the answered-compaction arm
(0500).** `trailingCompactionUnanswered`'s compaction hit no longer
returns `true` unconditionally: it returns `!compactionAnswered(path,
i)`, where the new module-local helper walks BACKWARD from the trailing
`compaction` entry and answers it iff the nearest preceding `message`
entry — skipping non-message entries (`context_edit`, custom), stopping
unanswered at any intervening `compaction` — is an `assistant` whose
`stopReason` is a TERMINAL normal boundary: the new
`PROMPT_MODE_TERMINAL_STOP_REASONS` set `{"stop", "end_turn"}` (exported
from `src/runtime/prompt-transport-mapping.ts` beside
`PROMPT_MODE_NORMAL_STOP_REASONS`, whose tool-use members are
deliberately EXCLUDED). Soundness on both pins: every post-run
compaction follows such a final assistant by construction (`willRetry:
false` arms above; a run cannot end threshold-compacting on a `toolUse`
stop — the loop is still running then), and every mid-turn recovery
compaction directly follows the committed non-normal-stop attempt
(`"error"`, or `"length"` on ≥ 0.87's recoverable-length arm), which
stays on the RAW path on both pins — 0.80.10 keeps it in session,
0.87.1 omits it from the PROJECTION via `context_edit` while the raw
`message` entry keeps its stop (the walk reads raw entries, so 0499's
omission is invisible to it — deliberate). Including `toolUse` would
re-bind 0482's wait-through partials (guard cell G1); a reason-based
rule is unavailable (no field) and unsound (overflow willRetry:false is
post-reply bookkeeping too). `thisTurnSettled` and `#ownTrailingTurnSlice`
consume the sharpened predicate unchanged — the 0500 anchored shape now
settles at `turnStart`, and the relocated read stops refusing the
combined shape.

**2. `src/extension/live-prompt-query-driver.ts`
`#driveUserVisibleTurn` — un-gate the relocated read (0501).**

- `trailingSettledSlice()` drops the `recorder.recorded` conjunct and
  keeps the `!this.#thetaAbort.signal.aborted` guard:
  `#ownTrailingTurnSlice(userBeforeSend, pathIdsBeforeSend)` is now
  consulted by the settle poll and its post-poll read whenever this
  attempt's slice has not settled at `turnStart`, abort or no abort. Its
  existing guards carry unchanged: `trailingCompactionUnanswered` first
  (item 1's sharpened form — 0482's wait-through veto intact), the
  `userBeforeSend` identity check (a stale trailing user never re-binds;
  0288 P2), the no-user arm's `compaction`-absent-from-
  `pathIdsBeforeSend` requirement, and the trailing slice must carry an
  `assistant`.
- The settle-poll BOUND stays keyed on `recorder.recorded`
  (`HOST_RECOVERY_ABORT_SETTLE_GRACE_POLL_BOUND` 50 with a recorded
  abort, full `TURN_SETTLE_POLL_BOUND` 1000 without): un-gating must not
  shorten the no-abort wait; the poll now also CLEARS the moment the
  relocated turn reads settled, which is what rescues it (with the run
  already idle at every settle-poll read — both pins commit the
  continuation before `_emitAgentSettled` — the relocated read resolves
  on its first read in practice).
- Post-poll, the `thisTurnSettled === false` branch mirrors the anchored
  branch's abort discrimination instead of classifying unconditionally:
  after `trailingSlice === undefined → #recordLifecycleExpiry("settle",
  …, recorder)` (unchanged — recorded → cancel, else the loud transport
  expiry) and `#windowRelocated = true` (unchanged position, now set for
  no-abort relocated settles too), compute `postSettleAbortObserved`
  exactly as the anchored branch does; when NO abort was observed
  anywhere (`!recorder.recorded && !postSettleAbortObserved`) RETURN —
  a normal settle located through the relocated read, falling through to
  the ordinary PIC-51 probe / PIC-53 extraction with NO classification
  (PIC-78's "an attempt at which no abort was observed is not
  classified" now holds for relocated settles too). Otherwise
  `turnSlice = trailingSlice` and classify exactly as 0.494.0 does.
- **No probe/extraction plumbing is needed** — an equivalence, argued
  and witness-pinned rather than plumbed: `trailingTurnFinalAssistant`
  (PIC-51) and `extractTrailingTurnText` (PIC-53) anchor at the
  trailing-turn last-`user` message, else fall back to the whole list.
  In the drifted-anchor layout the last `user` IS the relocated anchor;
  in the split-turn layout (no `user`) the whole-list read equals the
  after-newest-summary span on the only dimension they consume —
  `assistant`-role messages — because everything before that span is the
  summary itself (role `compactionSummary`, invisible to both readers;
  on 0.80.10 a projected older summary is likewise `compactionSummary`).
  PIC-53's error-stop exclusion (0483 item 3) already drops the kept
  overflow attempt's narration from the join on 0.80.10; on 0.87.1 the
  omission already scrubbed it.
- Typed queries: unchanged mechanics do the right thing once
  `#windowRelocated` is set on the no-abort relocated settle —
  `forcedRespondTurn` resolves a mid-turn early-respond capture FIRST
  (QRY-14 precedence, `#earlyRespond.captured` precedes the window
  dispatch), else `#dispatchRespondOverWindow` returns 0483's fixed loud
  `Err(transport, retryable: true)` naming the compaction relocation
  instead of replaying the stale `slice(#queryWindowStart)` window; the
  repair restart's fresh dispatch is covered by the same sticky flag
  (0483 cell 40's line). The anchored 0500 shape does NOT set the flag:
  `thisTurnSettled` now opens at `turnStart`, which bounds the window
  skew to the kept-prior-suffix case (the driven user's rebuilt index ≥
  `turnStart` forces the cut to have kept nearly everything), the
  exposure 0482 §Fix accepted when it declined the divergent typed
  contract 2.
- Comment refreshes at the gate const, `trailingSettledSlice`,
  `#ownTrailingTurnSlice`, and `#windowRelocated` (now read-keyed, not
  classification-keyed).

**3. Unchanged, by design:** `host-recovery.ts` (the classifier runs
only under an observed abort, as shipped), the recorded-abort grace /
ride / cancel / captured-respond mechanics (byte-identical paths),
`#recordLifecycleExpiry`, `cancellation-core.ts`, the PIC-53 extraction,
the off-session dispatch seam, and the b0482 wait-through conjunct
structure.

### Settle-path decision table

Disposition at the settle read, per attempt (rows: what the rebuilt
list/path shows; "expiry" = `#recordLifecycleExpiry("settle", …)`).
Cross-cutting precedence unchanged: `thetaAbort` already aborted →
`Err(cancelled)` (PIC-51), and `trailingSettledSlice()` is `undefined`
under an aborted `thetaAbort`.

| # | Layout at the settle read | Reply | No abort observed (NEW arms marked ●) | Abort recorded / post-settle observed (0483, unchanged) |
|---|---|---|---|---|
| 1 | Anchored (slice opens at `turnStart`); no trailing compaction, or trailing compaction ANSWERED (● item 1: nearest preceding message entry is an assistant stopped `stop`/`end_turn`) | present | settle → PIC-51/51b/53; typed: capture, else forced respond over the intact window (● the 0500 shape now lands here) | classify: `recovering` → capture/ride/bound; `recovered` → fall through; `cancel` → forward reason |
| 2 | Anchored; trailing compaction UNANSWERED (nearest preceding message entry: the non-normal-stop attempt, a `toolResult`, a `user`, or another `compaction`) | pending | keep polling — 0482 wait-through; on the reply landing → row 1 | same, inside the 50-poll grace, then row 6/7 semantics |
| 3 | Anchored; unanswered trailing compaction; reply never lands | absent | full-bound expiry → `Err(transport, retryable: false)` — backstop unchanged (0499's insertion point) | expiry-with-recorder → cancel with the recorded reason |
| 4 | Drifted anchor (driven `user` rebuilt below `turnStart`; `trailingTurnUserIndex` finds it; ≠ `userBeforeSend` by identity) | present | ● relocated settle: `#windowRelocated` set; NO classification; untyped → PIC-53 binds at the last-user anchor; typed → capture wins, else relocation `Err(transport, retryable: true)` on the forced/repair dispatch | classify over the relocated slice (0483 cells 23–27, 32, 34) |
| 5 | Split-turn (no `user` in the rebuilt list; a `compaction` on the path absent from `pathIdsBeforeSend`) | present (after-summary span carries an assistant) | ● relocated settle via the after-newest-summary span; dispositions as row 4 (whole-list probe/extract ≡ span) | classify over the span (0483 cells 28–31, 33, 35, 36, 39) |
| 6 | Drifted/split-turn; reply absent (unanswered trailing compaction, or the span carries no assistant) | absent | poll to the full bound → expiry `Err(transport, retryable: false)` — backstop (0499's other insertion point) | grace → cancel with the recorded reason |
| 7 | No attempt-owned relocation explains the missing anchor: trailing `user` IS `userBeforeSend` by identity (own send never landed), or no `user` and no compaction absent from `pathIdsBeforeSend` | n/a | full-bound expiry — never a re-bind (0288 P2) | grace → cancel with the recorded reason (0483 cell 31) |

### Interaction with 0483's ride, ESC, and 0499 (pi ≥ 0.87 omitted error-stop)

- **Recorded-abort paths are byte-identical.** The only shared line is
  `trailingSettledSlice()`'s gate; grace bound, classifier, ride
  bound/note/continuation text, captured-respond precedence, cancel
  forwarding (CNCL-4 latest-reason identity), and the `agent_end`
  synthesis gating persist unchanged — the b0483 suite (43 cells) must
  stay green untouched.
- **ESC.** Pre-first-token ESC still cancels within the grace (recorded
  → relocated read finds nothing of this attempt's own → expiry-with-
  recorder → cancel). An ESC racing a no-abort relocated settle keeps
  cancellation precedence: `#pollWhile` exits on `thetaAbort`,
  `trailingSettledSlice()` returns `undefined` under the aborted
  `thetaAbort`, `#recordLifecycleExpiry` no-ops, and the PIC-51 probe
  answers `Err(cancelled)`.
- **Post-settle abort over a relocated turn** now classifies exactly as
  an anchored one (the `postSettleAbortObserved` mirror) — on 0.494.0 it
  could only expire.
- **0499 is not foreclosed.** (a) Both expiry arms this fix leaves
  standing (rows 3 and 6) are the single sites 0499's recovery-aware arm
  will interpose at — detect a `context_edit` targeting a message inside
  this turn's raw-branch slice, then ride / surface the retryable `Err`
  carrying the omitted entry's raw `errorMessage` instead of the generic
  expiry; nothing new reads those sites. (b) The answered-compaction
  walk reads RAW entry stop reasons, which `_omitRecoveryAttempt` never
  edits (it appends `context_edit` entries; the raw `message` entry is
  untouched), so the discriminator is omission-proof and 0499's
  detection can share the same raw-slice walk. (c) Pre-omission
  narration is never bound as the whole answer by the new arms: with no
  post-omission assistant the relocated read returns `undefined` (row 6
  expiry); with a post-compaction continuation present, the bind is the
  recovered answer and PIC-53's error-stop exclusion (plus 0.87's own
  projection scrub) keeps the failed attempt's text out of the join.

### Spec amendments (conversation-drive.md unless noted)

1. **PIC-70, *Settled* clause — the answered-compaction rule (0500).**
   Amend the unanswered-compaction sentence: a trailing `compaction`
   entry does not settle the turn UNLESS it is ANSWERED — walking the
   chronological path backward from that entry, the nearest preceding
   `message` entry (skipping non-message entries, stopping at any other
   `compaction`) is an `assistant` whose `stopReason` is a terminal
   normal boundary (`stop`/`end_turn`; the tool-use members of the
   normal set do NOT answer a compaction). State the host rationale: a
   post-run compaction (threshold, or overflow without retry) is
   appended only after such a final assistant, so an answered trailing
   compaction is next-turn bookkeeping; every recovery compaction
   directly follows the committed non-normal-stop attempt, which the raw
   path retains on both pins (≥ 0.87's `context_edit` omission edits the
   projection, not the raw entry). The settle-phase expiry stays the
   backstop for genuinely unanswered compactions only.
2. **PIC-70, *Settled* / *Scope (bug 0483)*.** Note that the *Started*
   anchor's completion is also reachable through PIC-78's relocated
   trailing-turn read when a compaction moved or summarised the anchor —
   on the no-abort settle path as well (bug 0501) — and extend the scope
   sentence: PIC-78's relocated read serves the no-abort settle as a
   NORMAL settle (not only the recorded-abort `"recovered"`
   fall-through).
3. **PIC-78, *The classifier* first sentence.** "An attempt at which no
   abort was observed is not classified: it falls through to PIC-51 /
   PIC-51b / PIC-53 as any settled turn does" — extend: located at its
   `turnStart` anchor, or, when a mid-turn compaction leaves that slice
   unopenable, through the same relocated trailing-turn read (bug 0501);
   a no-abort relocated settle is a normal settle, sets the typed-query
   relocated-window state, and is never a cancellation surface. Record
   the probe/extraction equivalence (last-user anchor; whole-list ≡
   after-newest-summary span on `assistant` messages, `compactionSummary`
   being invisible to both readers).
4. **PIC-78, relocated-read paragraph.** Re-scope from "a recorded abort
   whose slice never reads settled…" to: the relocated read is consulted
   whenever this attempt's slice has not settled at `turnStart`, abort
   recorded or not; with NO recorded abort the settle poll keeps
   PIC-70's full settle bound (the 50-poll grace remains the
   recorded-abort concern) and clears as soon as the relocated turn
   reads settled; with no settled relocated turn the no-abort expiry
   remains PIC-70's loud non-retryable transport `Err`.
5. **PIC-78, *Typed-query window after a relocated classification*.**
   Re-key from "classified through that relocated read" to "settled or
   classified through that relocated read" (title: *…after a relocated
   read*); the MUST NOT dispatch rule and the captured-payload
   precedence stand verbatim.
6. **PIC-78, recorded postures item (4) + version-bump-step2.md item
   (av).** Correct the older-summary sentence per pin: ≤ 0.86 projects
   an older compaction inside the newest's kept range as a second
   summary after the newest; ≥ 0.87 projects it to nothing
   (`buildSessionProjection`'s index-zero rule) — both keep the newest
   summary first, the only property the relocated read consumes.
7. **query/query-tool-loop.md QRY-14.** Re-key the relocated sentence:
   "a free phase settled or classified through its compaction-relocated
   trailing-turn read that reaches the forced respond dispatch ends the
   query `Err(transport)` (retryable)…" — otherwise verbatim.
8. **cancellation.md, slash-command bullet.** One clause at the
   uncovered-windows sentence: a turn that settles unclassified (nothing
   recorded) now falls through to the normal probe — via the relocated
   read when the compaction moved the anchor (bug 0501) — rather than
   expiring; forwarding semantics unchanged.
9. **docs/plan_topics/coverage-matrix.md** — extend the PIC-70/PIC-78
   rows with the new witness file.

### Witnesses (numbered; red-before at 08a8ba39 → green-after)

Driver cells in a new `tests/b0501-no-abort-compaction-relocated-settle.test.ts`
(b0483 harness pattern: real producer, scripted host, real
`buildSessionContext`); predicate cells extend
`tests/b0482-mid-turn-compaction-not-turn-settled.test.ts`. Cells 1–5
were PROVEN RED at 08a8ba39 in a scratch git-archive copy (§Red evidence
below); guards 7–8 proven green there.

1. **Drifted anchor, untyped, no abort** (3 prior exchanges; overflow
   error-stop → compaction keeping the driven user → continuation
   `stop` reply → idle): binds `Ok("continuation reply")`,
   `thetaAbort` untouched. RED: `Err(transport)` settle-expiry 10000 ms,
   `retryable: false`.
2. **Split-turn, untyped, no abort** (cut at the turn's last `toolUse`
   assistant; rebuilt roles `[compactionSummary, assistant, toolResult,
   assistant, assistant]`, NO `user`): binds via the after-summary span.
   RED: same expiry.
3. **0500 post-reply threshold compaction, anchor intact** (user →
   `stop` reply → compaction → idle, no prior exchanges): settles
   immediately, binds `Ok("the full answer")`. RED: same expiry.
4. **Combined fold witness** (overflow drift + continuation + post-run
   threshold compaction): binds the continuation; needs BOTH item 1 and
   item 2 — reds under either alone. RED: same expiry.
5. **Typed drifted, no abort, no capture**: free phase settles through
   the relocated read; forced respond dispatch REFUSED —
   `Err(transport, retryable: true)` naming the compaction relocation,
   ZERO `complete()` dispatches. RED: `Err(transport, retryable: false)`
   settle-expiry (also zero dispatches — the discriminator is
   retryable + message).
6. **Typed split-turn with a pre-overflow early-respond capture**:
   `Ok(<captured payload>)`, zero dispatches (QRY-14 precedence over the
   relocation `Err`). RED: the free-phase expiry surfaces transport
   before `forcedRespondTurn` ever consults the capture.
7. **Guard (green pin)** — 0482 wait-through with tool rounds: anchored
   turn, `toolUse` rounds, overflow error-stop, compaction, continuation
   → binds only the following reply (the `toolUse` exclusion from the
   TERMINAL set is what holds this). Green before and after.
8. **Guard (green pin)** — reply-absent unanswered compaction (nearest
   pre-compaction message entry is the error-stop): the loud settle
   expiry, unchanged backstop. Green before and after; the
   recorded-abort twin still cancels (b0483 cells 12/13 pin that side).
9. **Guard** — own send never landed over a pre-existing compaction
   (trailing `user` === `userBeforeSend` by identity): expiry, never a
   re-bind (0288 P2), no-abort variant of 0483 cell 31.
10. **Predicate cells (b0482 suite)** — answered: assistant(`stop`) /
    assistant(`end_turn`) before the trailing compaction; unanswered:
    error-stop / `"length"`-stop / `toolUse`-stop assistant, `toolResult`,
    `user`, or another `compaction` as the nearest preceding message
    entry; the ≥ 0.87 omission shape (raw error-stop entry +
    `context_edit` entries between it and the compaction → still
    unanswered — the 0499-composition pin); plus the projected-shape
    cell `[compactionSummary, user, assistant]` binding the assistant
    text. RED today on the answered cells (veto), green on the rest.
11. **Regression** — `tests/b0482-…` 4/4 and `tests/b0483-…` 43/43
    unchanged green; full default suite; parse gate.
12. **Pre-prompt-compaction drift (t3)** — threshold compaction landing
    between the pre-send snapshot and the send's own user entry (no
    overflow anywhere) → binds the reply. RED by analysis (same expiry);
    needs a small harness extension (a pre-user compaction step on the
    send, e.g. `userEntry: "afterCompaction"`), to be added with the fix.

### Red evidence (scratch, 2026-09-29)

Git-archive copy of 08a8ba39 + node_modules junction;
`tests/b0501-scratch-red.test.ts` (cells R1–R5 ≙ witnesses 1–5, G1/G2 ≙
guards 7–8), single vitest run: **5 failed / 2 passed** — R1–R5 each
`outcome=fail, value=undefined, error={"kind":"transport","message":"on-session
turn did not settle: the run never completed and its reply never landed
(waited 10000ms)","http_status":null,"provider":"anthropic-messages","retryable":false},
thetaAbort.aborted=false, sends=["Ping"]` (R5 additionally: zero
`complete()` dispatches, `retryable` expected `true` got `false`); G1
bound only the post-compaction reply; G2 expired with "did not settle".
The drift premise (`expectAnchorDrifted`) and the split-turn layout
premise (`…, "assistant", "assistant"]` — the 0.80.10 shape keeps the
kept-range error-stop, unlike 0483 cell 28's ≥ 0.87 shape) held.

### Residuals / non-goals

1. **0499 untouched (non-goal here).** The ≥ 0.87 omission window with
   no post-omission assistant still expires with the generic,
   misattributed settle message (rows 3/6) — 0499 owns replacing that
   with the recovery-aware disposition; this fix only keeps the
   insertion sites single and the raw-walk discriminator omission-proof.
2. **`"length"`-stop + threshold-crossing same turn.** A threshold
   compaction trailing a `"length"`-stopped reply reads unanswered →
   the expiry masks PIC-51b's honest `context_overflow` mapping. Loud
   either way; folding `"length"` into the TERMINAL set would un-veto
   ≥ 0.87's recoverable-length mid-turn recovery, which NEEDS the wait.
   Accepted edge, recorded.
3. **0483 residuals 5 and 6 extend unchanged** to the no-abort relocated
   read: a ≥ 0.87 `context_edit` on the prior user message can break the
   `userBeforeSend` identity guard when this attempt's own send is
   dropped; mid-drive tree navigation onto a branch with an older
   compaction matches the attempt-owned definition.
4. **No live overflow witness** (0482 residual 2 stands: a real
   `"overflow"` needs a genuine window overflow, outside the
   token-bounded live suite). Optional follow-up: one live threshold
   cell via a tiny `compaction.reserveTokens` in an injected
   `SettingsManager` (the post-reply threshold shape IS live-reachable).
5. **The relocated typed window is not rebuilt** (PIC-78's rule stands);
   a retry-on-retryable caller re-runs the query. The anchored 0500
   shape's bounded window skew (kept-prior-suffix) remains the 0482
   accepted exposure.

### Version / CHANGELOG

One minor bump at landing — **0.495.0** — with a `### Fixed` entry
naming bug 0501 AND bug 0500 (folded); 0499 ships separately on its own
number. CHANGELOG carries the bug ids, not the version correspondence.

## Relation to prior bugs

- **0482 (fixed)** — this IS its residual 1, promoted to a filed bug;
  the wait-through contract and `trailingCompactionUnanswered` are
  untouched, made reachable in the drifted topologies.
- **0483 (fixed, 0.494.0)** — supplies the machinery
  (`#ownTrailingTurnSlice`, `newestCompactionSummaryIndex`,
  `#windowRelocated`) and confines it to the recorded-abort path; this
  bug extends its reach to no-abort settles. Fix lands on top of
  0.494.0.
- **0499 (open, filed from the same review)** — on pi ≥ 0.87 the
  overflow arm first omits the error-stop (`context_edit`) that this
  bug's compaction follows; the fixes read the same raw this-turn slice
  and must compose (0499's recovery-aware arm decides ride/`Err`, this
  bug's relocated read decides where the settled turn IS).
- **0500 (open, FOLDED into this fix — §Fix decision)** — sibling
  false-expiry: 0500 is the path-side veto after an answered POST-RUN
  threshold compaction; this bug is the anchor-side drift after a
  MID-TURN overflow/split-turn compaction. Both discard a landed reply
  as the same false settle-phase `Err(transport)`, and the relocated
  read's first gate is the 0500 predicate, so the fixes compose in one
  release (0.495.0).
- **0288 (fixed)** — defined the `turnStart` anchor semantics (P2:
  never re-extract an earlier turn); the identity guards in (1) preserve
  that guarantee through the relocation.
