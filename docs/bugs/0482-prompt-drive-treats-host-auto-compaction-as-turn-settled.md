# Bug 0482 — a host auto-compaction landing mid-turn is read by the prompt-mode drive as the turn settling: the query binds an empty/partial reply instead of waiting for (or loudly failing on) the post-compaction continuation

- **Status:** fixed (0.487.0).
  Was mitigated operationally by the context-aware shard cap
  (`store.mjs shard` `context_tokens`, quality/README.md): the one measured
  trigger (a 4985-LOC D4 shard on a 128k-window model) can no longer be
  provisioned by the quality loop. The drive-side hole remains for any child
  whose long tool loop grows past its model's window.
- **Sev/Diff estimate:** S3/D3 — S3: the affected shard failed loudly at the
  ORCHESTRATOR level (files stayed due; no wrong review was recorded), but
  the child burned its full token cost first, and a theta whose binding
  tolerates an empty string could propagate a wrong value. D3: the settle
  detection is a load-bearing seam (bugs 0288/0289/PIC-70) and the correct
  contract needs deciding before code.
- **Evidence (wave qw20260917095931, 2026-09-17):** D4 shard-02 — 15 files /
  4985 LOC (`quality/tmp/qw20260917095931/D4/shard-02.txt`) on
  `unity-completions/kimi-k2.7-code` (contextWindow 128000, maxTokens 16384).
  The lens worker's tools are read/grep/bash/write — no `compact` runtime
  tool exists — so the observed "/compact" was pi's own auto-compaction in
  the child session. Operator observation: the child "basically finished the
  turn after compact"; the orchestrator logged
  `review shard failed (files stay due): D4 quality/tmp/…/shard-02.txt`.
- **Suspected seam:** the prompt-mode drive's settle detection
  (`production-theta-producer.ts` `#driveUserVisibleTurn` → `thisTurnSettled`
  / `#pollWhile` / the `waitForIdle` race; spec
  pi-integration-contract/conversation-drive.md §Hang handling, PIC-70
  settle-phase wait). Hypothesis: a `compaction` entry appended mid-turn
  (see tests/b0478-* for the entry shape) changes the session-entry topology
  the settle probe reads, so the probe judges "this turn's slice settled"
  while the model's real continuation is still pending (or never comes),
  and the trailing-turn extraction binds whatever text precedes the
  compaction — possibly empty.

## Fix

**SETTLED (operator, 2026-09-20): contract (1) — wait through it.** A
compaction entry appended mid-turn does NOT settle the driven turn: the turn
is settled only when an assistant reply FOLLOWS the compaction entry. The
prompt-mode drive's settle detection
(`production-theta-producer.ts` `#driveUserVisibleTurn` → `thisTurnSettled` /
`#pollWhile` / the `waitForIdle` race) must treat a trailing `compaction`
entry as "not yet settled" and keep its bounded waits running rather than
extracting the text that precedes the compaction. PIC-70's expiry stays the
loud backstop: a compaction with no following reply eventually times out and
fails loudly (never binds an empty/partial reply). This matches pi's own
intent that auto-compaction is transparent to the conversation
(`docs/compaction.md` in the pi package).

Binding sub-decisions:
- **Scope:** contract (1) applies to user-visible prompt turns, untyped
  queries, AND the typed-query window — wait-through is the single rule; the
  loud-Err alternative (contract 2) is DECLINED for 1.x (no measurement
  showed compaction corrupting the PIC-53 replayed window badly enough to
  justify a second, divergent contract, and one rule is simpler to reason
  about). If a future measurement witnesses binding-corruption across a
  compacted typed-query window, that is a NEW bug against this fix, not a
  reason to hold this one.
- **Child-regime twin:** the same seam governs a `--no-session` visible
  child; the fix and its witness must confirm this (or document precisely why
  the child regime differs).
- **Witness-before-fix:** the offline witness below is written and seen RED
  before the drive change lands (a session double that appends a `compaction`
  entry between the driven user turn and the assistant reply, and a variant
  with the reply absent — the first must go GREEN by waiting through to the
  following reply; the second must time out loudly via PIC-70, never bind an
  empty string).

## Required witnesses (write before the fix)

- Offline: a session double that appends a `compaction` entry between the
  driven user turn and the assistant reply (and a variant with the reply
  absent entirely) — pin what `thisTurnSettled` / the extraction currently
  do (the defect), then the chosen contract.
- The child-regime twin (`--no-session` visible child): confirm the same
  seam governs, or document why not.

## Related

- Bug 0481 (the same wave's triage failures — independent defect, fixed).
- Mitigation: `context_tokens` shard cap (commit f83ac5dc); D4 now provisions
  ≤3555-LOC shards.
- pi surfaces: `docs/compaction.md` in the pi package (auto-compaction
  triggers and the `compaction` session entry).

## Fix (0.487.0)

- What shipped:
  - `src/extension/production-theta-producer.ts` — the prompt-mode drive's
    settle detection now reads the CHRONOLOGICAL leaf path alongside the built
    `Message[]`. New module helpers `leafPathEntries` (mirrors pi's
    `buildSessionPath`: root-to-leaf `parentId` walk, un-reordered by
    `buildContextEntries`'s compaction-to-head hoist) and
    `trailingCompactionUnanswered` (walks the path from the leaf; true iff a
    `compaction` entry is reached before any following `assistant` / settling
    `toolResult`). `thisTurnSettled` gains a `path` argument and ANDs
    `!trailingCompactionUnanswered(path)`; a `readContextPath` closure is
    threaded from the factory through `#resolvePromptQuery` into
    `LivePromptQueryModel`, consumed at both settle-check sites of
    `#driveUserVisibleTurn` (start-poll and settle-poll). Realises §Fix
    CONTRACT 1: a trailing unanswered `compaction` does not settle the turn
    (wait through to the following reply); PIC-70's existing settle-phase
    expiry is the loud backstop — no new code path, no new diagnostic
    (DIAG-2 registry untouched).
  - `docs/spec_topics/pi-integration-contract/conversation-drive.md` — PIC-70
    "Settled:" clause amended with the compaction wait-through rule (single
    rule across untyped queries, typed-query free phase, degraded fused arm,
    repair follow-ups, and the PIC-58 subagent-root child; the divergent
    loud-`Err` typed-query contract 2 is NOT adopted).
  - `src/extension/sdk-inventory.ts` — one `peer-named-import` row for the new
    `SessionEntry` type import (the inventory-closure audit gate's prescribed
    remedy for a promoted SDK surface).
- Gates:
  - Witness `tests/b0482-mid-turn-compaction-not-turn-settled.test.ts` — 4/4
    green post-fix; RED at HEAD on cells (1) WAIT-THROUGH and (2) REPLY-ABSENT
    (both bound the premature partial `"The review of shard-02 begins…"`);
    proven red-on-revert / green-on-restore in verification.
  - Full default suite: `npm test` — 694 files / 11603 tests passed, exit 0.
  - Typecheck: `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) — clean.
  - Lint: `npm run lint` (eslint `src/**/*.ts`) — clean.
- Review: 1 round (`bug-fix-reviewer`) + 1 polish round (`bug-fix-fixer-light`,
  spec-lead-in wording + witness comment/citation refresh; polish verified by
  gate-diff, confirmation round skipped). Round 1 raised F1 (turn-anchor
  drift — see Residuals), F2 (PIC-70 lead-in narrower than the code predicate
  — fixed), R1/R2 (stale witness citations / `builtRoles` comment — fixed).
- Verification (`bug-fix-verifier`, verdict SOLID): (1) witness reds when the
  `!trailingCompactionUnanswered` conjunct is neutralised, greens when
  restored; (2) full suite 694/694; (3) live H8a prompt-mode drive test
  (`tests/live/b0387live-block-tail-query-consumption-live-cell.test.ts`)
  passes for real — the new leaf-path walk runs on every settle poll in it —
  and a genuine mid-turn auto-compaction live trigger is documented as
  infeasible (see Residuals); (4) lint + typecheck clean.
- Residuals:
  1. **Started-anchor drift (pre-existing, safe, not a regression).**
     `thisTurnSettled`'s Started anchor is a built-`Message[]` INDEX
     (`turnStart`). When a compaction hoists/collapses entries so the driven
     `user` message rebuilds below `turnStart` — a long prior-history session,
     or pi's split-turn cut (`isSplitTurn`) that summarises the driven user
     away — `turnSliceSince` finds no anchor and the turn fails LOUDLY via the
     PIC-70 settle-phase expiry EVEN when a reply followed the compaction, i.e.
     wait-through is delivered only when the Started anchor survives the hoist.
     Verified empirically (prior-history probe: `outcome=fail`,
     `value=undefined`, `error.kind=transport`) and confirmed IDENTICAL at HEAD
     (no regression). Crucially this is SAFE — a loud transport `Err`, never a
     silent empty/partial bind — so §Fix's hard guarantee ("never bind an
     empty/partial reply") holds in every topology; only the wait-through
     convenience is unavailable in the drifted ones. Anchoring by raw-path
     entry identity would deliver wait-through there too, but changes the
     load-bearing bug-0288 Started-anchor semantics — out of scope for this
     settled fix; a candidate follow-up bug.
  2. **No live auto-compaction trigger.** The defect topology needs pi's
     `"overflow"` compaction reason (a real provider context-window error
     mid-stream); the `"threshold"` path only appends a compaction AFTER a
     reply committed (reproducing the answered-compaction GUARD topology, not
     the defect). Forcing `"overflow"` needs a ~200k-token real overflow,
     outside the token-bounded live suite, and no setting shrinks the model's
     real `contextWindow`. Live seam coverage rests on the H8a prompt-drive
     live test (the new code runs unconditionally in it) plus the deterministic
     offline witness, which drives the REAL `buildSessionContext` compaction
     reorder.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the divergent loud-`Err` typed-query
  contract (contract 2) is DECLINED for 1.x (§Fix); anchor-by-entry-identity
  (review F1 option a) is NOT adopted (would widen the settled fix's scope and
  touch the bug-0288 anchor contract).
