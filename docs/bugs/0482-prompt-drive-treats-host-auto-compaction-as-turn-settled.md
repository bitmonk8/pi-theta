# Bug 0482 — a host auto-compaction landing mid-turn is read by the prompt-mode drive as the turn settling: the query binds an empty/partial reply instead of waiting for (or loudly failing on) the post-compaction continuation

- **Status:** open — observed live once; offline witness not yet written.
  Mitigated operationally by the context-aware shard cap
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
