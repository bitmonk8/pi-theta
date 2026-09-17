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

## Open contract decision (spec-before-code)

Two candidate contracts for a compaction observed inside a driven turn:

1. **Wait through it** — the turn is not settled until an assistant reply
   FOLLOWS the compaction entry; the drive's bounded waits keep running
   (PIC-70's expiry stays the loud backstop). Matches pi's own intent
   (compaction is transparent to the conversation).
2. **Loud Err** — classify mid-turn compaction as a transport-shaped failure
   naming the compaction, on the theory that a compacted driven window has
   lost prompt-critical context and any subsequent reply is untrustworthy
   for BINDING (the reply the query binds may reference discarded content).

Leaning (1) for user-visible prompt turns and untyped queries, with (2)
reserved for the typed-query forced-respond window if measurement shows
compaction corrupts the PIC-53 query window the off-session dispatch
replays. Decide on the offline witness's evidence.

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
