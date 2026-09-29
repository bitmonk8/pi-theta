# Bug 0500 — bug 0482's `trailingCompactionUnanswered` misreads a post-run threshold compaction appended AFTER this turn's final reply: the answered turn reads unsettled forever, the settle poll burns its 10 s bound, and a completed answer is discarded as `Err(transport)` "on-session turn did not settle"

- **Status:** open
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S3/D1 — S3: no silent corruption (the failure is
  loud), but it is FALSE — the turn completed and its reply is sitting in
  the session; the drive discards it, waits the full 10 s settle bound,
  and returns `Err(transport)` as if the provider never answered. The
  trigger is ordinary long-session operation: any driven turn whose final
  usage crosses the host's compaction threshold gets the post-run
  threshold compaction and hits this shape, on BOTH host pins. A theta
  loop that legitimately grows context (review lenses, long tool runs)
  fails exactly on its heaviest — most expensive — turn, and a retrying
  caller re-burns the whole turn. D1: one predicate arm in
  `trailingCompactionUnanswered` (or its `thisTurnSettled` call site) plus
  session-double witnesses; the raw-path plumbing it needs already exists.
- **Where (pi-theta, main a79c1c1e):**
  - `src/extension/turn-settlement.ts:149–163`
    (`trailingCompactionUnanswered`) — walks the raw leaf path backwards;
    the FIRST hit decides: a `compaction` entry → `true` (unanswered), an
    `assistant`/`toolResult` message entry → `false`. A compaction
    appended after this turn's reply is always the first hit from the
    end, so the answered turn reads unanswered, with no arm that asks
    whether the reply PRECEDES the compaction.
  - `src/extension/turn-settlement.ts:131–137` (`thisTurnSettled`) —
    `… && !trailingCompactionUnanswered(path)`: the projected-slice check
    passes (the reply is there) but the path check vetoes settlement.
  - `src/extension/live-prompt-query-driver.ts:932–939` — the settle poll
    spins `TURN_SETTLE_POLL_BOUND` 1000 × `POLL_INTERVAL_MS` 10 ms = 10 s,
    then `#recordLifecycleExpiry("settle", 10000)` →
    `Err(transport)` with `PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE`
    (`src/runtime/prompt-transport-mapping.ts:116`): "on-session turn did
    not settle: the run never completed and its reply never landed
    (waited 10000ms)" — both clauses false here.
  - `src/extension/production-theta-producer.ts:833–841` — the
    `readContextPath` comment documents why the raw path is consulted
    (the compaction hoist moves the `compaction` entry to the HEAD of the
    built `Message[]`), which is also why the projected messages look
    settled (`[compactionSummary, user, assistant]`) while the raw path
    ends `[…, user, assistant, compaction]`.
  - `tests/b0482-mid-turn-compaction-not-turn-settled.test.ts` — 0482's
    cell inventory: (1) `:386` wait-through (reply FOLLOWS the
    compaction), (2) `:432` reply absent → PIC-70 expiry, (3a) `:468` no
    compaction, (3b) `:487` compaction from a PRIOR turn before this
    turn's user+reply. No cell covers a compaction appended after THIS
    turn's reply — the post-run threshold shape below.
- **Where (host — both pins append a threshold compaction after the
  turn's final reply, before the run settles):**
  - pi 0.80.10 (repo devDependency) `dist/core/agent-session.js:782` —
    `_handlePostAgentRun` → `if (await this._checkCompaction(msg))` runs
    AFTER the turn's final assistant; the threshold arm at `:1585–1586`
    (`shouldCompact(...)` → `_runAutoCompaction("threshold", false)`)
    appends the `compaction` entry (`appendCompaction`, `:1678`) and, with
    `willRetry === false`, returns `this.agent.hasQueuedMessages()`
    (`:1712`) — normally `false`, so `_handlePostAgentRun` returns false
    and the run settles idle with the compaction entry as the leaf's last
    entry. No assistant will ever follow it.
  - pi 0.87.1 (operator's global install) — identical shape:
    `_handlePostAgentRun` → `_checkCompaction(message, true, toolResults)`
    at `:1135`; threshold arm `:2137–2138`; `appendCompaction` +
    `return this.agent.hasQueuedMessages()` inside `_runAutoCompaction`.
    (`:1278`'s pre-prompt compaction check appends BEFORE the next turn's
    `user` entry — that is guard cell (3b)'s already-handled shape.)

## Observed (2026-09-28, release review of the 0483 fix; scratch cell, not live)

Reviewer scratch cell over a BUILT entry list — leaf path
`[…, message(user), message(assistant, stop)]` plus a trailing
`compaction` entry, projected messages
`[compactionSummary, user, assistant]` — drove the settle path and got
`Err(transport)` "on-session turn did not settle: the run never completed
and its reply never landed (waited 10000ms)", identically before and after
the 0483 fix (no fix-induced drift; the 0483 classifier never runs because
`thisTurnSettled` never turns true). Not reproduced against a live host
yet — a live witness must drive a real session across the compaction
threshold (`compaction.reserveTokens` in host settings) so the post-run
threshold compaction fires; the host-side ordering is verified by the
source walk above.

## Expected

An ANSWERED compaction settles. The distinguishing fact is order and
stop-shape within this turn: a compaction entry appended after this
turn's final normally-stopped assistant is post-run bookkeeping for the
NEXT turn — the driven turn is over and its reply is bound. The
unanswered arm exists for 0482's real cases: a compaction that interrupts
the turn (mid-turn overflow — any assistant before it is a partial with a
non-normal stop) or one that no reply ever follows.

## Actual

`trailingCompactionUnanswered` keys only on "is a `compaction` the first
thing from the end of the path" — order within the turn and the stop-shape
of what precedes it are never consulted — so the post-run threshold
compaction vetoes settlement forever, the drive expires the 10 s settle
bound, and the completed answer is thrown away as a transport error.

## Fix direction

Teach the predicate what "answered" means, using the anchors both callers
already hold:

1. **Predicate:** a trailing compaction is ANSWERED when a settled
   assistant of THIS turn precedes it within the turn — concretely, when
   walking back and hitting the `compaction` entry, continue the walk to
   this turn's own `user` anchor: an `assistant` message entry between the
   anchor and the compaction whose `stopReason` is a NORMAL terminator
   (the `PROMPT_MODE_NORMAL_STOP_REASONS` set — reuse it or mirror it) →
   `false` (settled). Equivalent formulation: compare the compaction
   entry's path position against this turn's final normally-stopped
   assistant entry; compaction later → answered. `thisTurnSettled` must
   pass its `turnStart`-derived anchor down (today the predicate sees the
   whole path with no turn boundary).
2. **Preserved 0482 behaviour:** mid-turn overflow (cell 1) keeps waiting
   — the assistant before that compaction is the partial attempt with
   `stopReason` error/aborted (non-normal), so the compaction stays
   unanswered and the wait-through + reply-follows path is untouched; on
   pi ≥ 0.87 the overflow arm's `context_edit` omission (bug 0499) leaves
   the RAW entry's non-normal stop visible to this walk, so the arm still
   holds. Reply-absent (cell 2) still expires loudly: no normally-stopped
   assistant precedes the compaction. Prior-turn compaction (cell 3b) is
   unchanged — an assistant/toolResult after it already answers it on the
   existing first-hit arm.
3. **Witnesses:** extend the b0482 suite with the missing cell family —
   (4) compaction appended after this turn's normally-stopped reply →
   settles immediately and binds the reply (RED today: 10 s expiry);
   (4b) same but the pre-compaction assistant is an error/aborted partial
   → still waits (guards the discriminator); plus a projected-shape cell
   asserting `[compactionSummary, user, assistant]` binds the assistant
   text. Optionally one live cell driving a tiny-threshold session across
   compaction. Coordinate with 0499's fix — both walk the raw this-turn
   slice; a shared helper (turn-anchored raw-path slice) serves both.
4. **Spec:** amend PIC-70's unanswered-compaction sentence
   (`conversation-drive.md`) to define "answered" by the rule in (1), so
   the settle-phase expiry stays the backstop for genuinely unanswered
   compactions only.

## Relation to prior bugs

- **0482 (fixed)** — introduced `trailingCompactionUnanswered` and the
  raw-path read for the mid-turn compaction bug; this bug is its inverse
  shape (compaction after the reply instead of before it), missed by all
  four of its guard cells.
- **0499 (filed together)** — the ≥ 0.87 overflow omission immediately
  precedes an overflow compaction; the two fixes share the turn-anchored
  raw-path walk and must not fight (an omitted error entry keeps its
  non-normal stop for this bug's discriminator).
- **0483 (open, fix in flight)** — same review; its ride loop re-enters
  the settle wait, so a false unanswered-compaction veto would also stall
  the ride — the fix here keeps the 0483 ride's settle reads truthful.
