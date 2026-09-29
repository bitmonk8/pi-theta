# Bug 0503 — a foreign turn started while the driven turn settles is bound as this query's result: the settle read anchors on the LAST `user` entry, never on this attempt's OWN — on pi ≥ 0.87 an `agent_settled`-deferred `prompt()` starts the foreign run with microtask-only pre-run work, so the 10 ms end poll never sees the idle boundary and the driven query returns `Ok("<foreign reply>")`

- **Status:** open — filed 2026-09-29 (0501 fix release review, round 2;
  pre-existing on main 0.494.0 in the anchored layout (probe D0); the
  0501 fix (targets 0.495.0) additionally reaches it in the drifted
  layout through its un-gated relocated read (probe D1) — a worsening
  accepted by the operator there as this filed follow-up)
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S2/D2 — S2: silent wrong answer. The driven
  query binds ANOTHER prompt's reply as its own `Ok`, discarding the
  driven reply already committed in the same list — no note, no `Err`,
  no diagnostic; a typed query would carry the foreign text into
  extraction/repair. The trigger is any co-resident writer prompting the
  session in the settle window: an extension prompting on
  `agent_settled` (a pattern pi ≥ 0.87 explicitly supports by DEFERRING
  the call to right after the emit), an `agent_settled` handler
  prompting inline on ≤ 0.86, or a queued follow-up message extending
  the same run — no idle window is poll-visible in any of these. D2:
  bound the settle slice at the attempt-owned user entry's turn
  (machinery the 0501 fix already introduces on the raw path) and
  decide the foreign-turn disposition (bind the own reply / wait /
  loud `Err`).
- **Where (pi-theta, main a98e6881, 0.494.0):**
  - `src/extension/turn-settlement.ts:111–121` — `turnSliceSince` scans
    BACKWARD from the list's end for the LAST `user` at/after
    `fromIndex`: any foreign `user` message landing after this attempt's
    own send re-anchors "this turn" to the foreign turn; `:131–137` —
    `thisTurnSettled` then settles on the foreign reply. The `fromIndex`
    bound protects only the EARLIER side (bug 0288 P2); nothing bounds
    the later side.
  - `src/extension/live-prompt-query-driver.ts:1069–1075` — the end
    poll's 10 ms reads exit only on an OBSERVED idle read, so
    back-to-back runs with a microtask-only boundary read as ONE
    non-idle span; `:1154–1189` — the settle read binds the (foreign)
    trailing turn; the PIC-53 extraction (`extractTrailingTurnText`)
    likewise anchors at the trailing-turn last-user.
  - (0501 fix, branch b0501 @ feae240a, targets 0.495.0)
    `src/extension/live-prompt-query-driver.ts:1393–1423` —
    `#ownTrailingTurnSlice` requires the attempt-owned user entry to
    EXIST on the raw path (`ownUserAt`, the first `user` entry not in
    `pathIdsBeforeSend`) but then anchors the bound slice at
    `trailingTurnUserIndex(messages)` — the LAST user in the built list
    — identity-checked only against the STALE pre-send user
    (`userBeforeSend`): a fresh foreign user passes both checks, so the
    un-gated relocated read (0501 §Fix item 2) binds the foreign turn in
    drifted layouts where 0.494.0 at least expired loudly.
- **Where (host — no poll-visible idle window between the runs):**
  - pi 0.87.1 (operator's global install)
    `dist/core/agent-session.js:1207–1211` — a `prompt()` issued while
    `_isEmittingAgentSettled` is true is DEFERRED into
    `_deferredSettledActions` and accepted; `:531–547` —
    `_emitAgentSettled` clears `_isAgentRunActive` (`:533`), emits
    `agent_settled`, then runs the deferred prompts immediately after
    the emit (`:542–547`): with microtask-only pre-run work (no
    pre-prompt compaction, no yielding `before_agent_start` handler) the
    foreign run's `_isAgentRunActive = true` (`:1080`) lands before any
    10 ms timer can fire, so the real idle window between the runs is
    invisible to the driver's macrotask polls.
  - Both pins — the queued-message route has NO idle window at all:
    `_handlePostAgentRun` returns `agent.hasQueuedMessages()` (0.87.1
    `:1140`, 0.80.10 `:787`), so a queued follow-up user message extends
    the SAME run (`agent.continue()`), placing a foreign turn inside the
    driven end phase.
  - pi 0.80.10 (repo devDependency)
    `dist/core/agent-session.js:310–319` — the deferral mechanism does
    not exist (`_isEmittingAgentSettled` / `_deferredSettledActions`
    absent — verified), but `_emitAgentSettled` clears
    `_isAgentRunActive` BEFORE awaiting handlers, so an `agent_settled`
    handler calling `prompt()` inline opens the same microtask-only
    window. The last-user anchoring itself is pure pi-theta logic,
    host-version-independent.
  - pi 0.87.1 `:1106/:1135/:2137–2138`, pi 0.80.10 `:782/:1585–1586` —
    the post-run threshold compaction (bug 0500's host arm) runs INSIDE
    the driven run, supplying probe D1's anchor drift.

## Observed (2026-09-29, 0501 fix release review, round 2 — scripted probes, not live)

Same reviewer probe harness as bug 0502 (0.87.1-timing session double,
built messages projected through pi 0.87.1's real `buildSessionContext`):
probe source
`C:/UnitySrc/pi-theta-b0501/.pi/tmp/review0501/zz-r2-probe.test.ts.txt`,
logs `r2-probe-base.log` (main 0.494.0) and `r2-probe-fix.log` (b0501 @
feae240a). The driven run ends and a foreign prompt's run starts in the
same macrotask:

| Cell | Shape | main 0.494.0 | 0501 fix (→ 0.495.0) |
|---|---|---|---|
| D0 | anchored: driven user → driven reply (`stop`) → foreign user → foreign reply, no poll-visible idle boundary | **`Ok("foreign reply")`** — the committed driven reply is discarded | **`Ok("foreign reply")`** (unchanged; pre-existing) |
| D1 | drifted: driven reply, then the driven run's own post-run threshold compaction (cut keeps from the driven user, prior exchanges summarised), then the foreign turn at the run boundary | `Err(transport)` settle expiry 10 s — loud, false | **`Ok("foreign reply")`** — the relocated read anchors on the last user (the foreign one), not `ownUserAt` — the worsening this filing records |

`hostRunFinishedWhenDriverReturned=true` on both cells (the driver rode
both runs to idle before reading). No live repro is on file; the
host-side ordering is verified by the source walks above.

## Mechanism

1. The driven run completes; its reply is committed. On pi ≥ 0.87 a
   `prompt()` issued during the `agent_settled` emit — the supported
   co-resident-extension pattern — is deferred and executed immediately
   after the emit (`agent-session.js:1207–1211`, `:542–547`). With
   microtask-only pre-run work the idle window between the driven run
   and the foreign run never coincides with a 10 ms poll tick; the
   queued-follow-up route (`_handlePostAgentRun` →
   `hasQueuedMessages()`) has no window at all. The driver's end poll
   reads one continuous non-idle span and exits only after the FOREIGN
   run ends.
2. The settle read then scans the built list: `turnSliceSince`
   (`turn-settlement.ts:111–121`) anchors at the LAST `user` at/after
   `turnStart` — the foreign user — and `thisTurnSettled` settles on the
   foreign reply; the PIC-53 extraction binds it. The driven query
   returns `Ok("foreign reply")` (D0) with its own committed reply
   discarded. Nothing in the anchored read pins the slice to THIS
   attempt's own user entry — `fromIndex` bounds only the earlier side.
3. Drifted variant (D1): the driven run's own post-run threshold
   compaction rebuilds the list below `turnStart`. On 0.494.0 the
   anchored slice never opens → the loud (false) 10 s settle expiry —
   bug 0501's shape. On the 0501 fix the un-gated relocated read
   requires the own user entry to EXIST (`ownUserAt`) but binds the
   slice after the LAST user in the built list; the identity guard
   rejects only the stale PRE-SEND user, so the fresh foreign user
   passes → `Ok("foreign reply")`. The fix converts the loud expiry into
   the silent foreign bind.

## Expected

A query's result is the reply to ITS OWN turn: the slice opened by this
attempt's own user entry and closed before the first subsequent turn not
produced by this drive. A foreign turn inside the observation window is
never bound as this query's result — the drive either settles on the own
turn's committed reply (present in both probe cells) or fails loudly
naming the interleaving.

## Actual

Both settle reads anchor on the LAST `user` entry at/after their lower
bound: the anchored read (`turnSliceSince`) on 0.494.0, and additionally
the relocated read (`#ownTrailingTurnSlice` → `trailingTurnUserIndex`)
once 0.495.0 un-gates it. A foreign turn landing before the settle read
re-anchors the slice, and the foreign reply is silently bound as this
query's `Ok` — in the drifted layout replacing what was at least a loud
expiry on 0.494.0.

## Fix direction

1. **Bound the settle slice at this attempt's own turn**: anchor on the
   attempt-owned user entry — the 0501 fix's `ownUserAt` already locates
   it on the raw path (first `user` entry not in `pathIdsBeforeSend`);
   carry that identity into the built-list read — and END the slice
   before the first subsequent `user`/custom entry not produced by this
   drive, so extraction can only ever see this turn. (If a
   drive-ownership token exists on driven sends — or one is added — use
   it to discriminate foreign entries directly; otherwise the pre-send
   path-id set plus the own-entry anchor suffices.)
2. **Decide the foreign-turn disposition**: when the own turn's reply is
   committed (both probe cells), bind it. When the own turn genuinely
   has no reply yet (a foreign prompt raced ahead of the driven run's
   completion), decide `Err` vs wait — a loud retryable
   `Err(transport)` naming the interleaving is the conservative floor;
   waiting must re-enter the end-phase wait, not spend the settle bound
   (bug 0502's direction).
3. **Compose with 0501's relocated read**: `#ownTrailingTurnSlice`
   should anchor at `ownUserAt`'s projected position (or at the newest
   compaction summary when the own user was summarised away) rather than
   at `trailingTurnUserIndex`, restoring D1 to a correct bind of the
   driven reply instead of either era's wrong outcome.

## Relation to prior bugs

- **0501 (open, fix in flight → 0.495.0)** — its un-gated relocated read
  gives this bug its second route (D1): main expired loudly, the fix
  binds the foreign turn; recorded in that fix's review as an accepted,
  filed follow-up (this bug). Its `ownUserAt` machinery is the natural
  anchor for the fix here.
- **0502 (filed together)** — the sibling settle-window bug: 0502 is the
  pre-run gap (the settle bound covering the run), this is the post-run
  boundary (a foreign turn inside the settle window). Both fixes reshape
  the same poll structure and should land coordinated.
- **0500 (open, folded into 0501)** — the post-run threshold compaction
  supplying D1's drift is 0500's host arm.
- **0288 (fixed)** — P2 pinned the EARLIER side of the slice ("never
  re-extract an earlier turn's `user` entry"); this bug is the mirror:
  nothing bounds the LATER side against foreign turns.
- **0482/0483 (fixed)** — own the wait-through and relocated-read
  machinery the fix must thread through without re-binding their
  compaction shapes.
