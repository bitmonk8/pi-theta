---
id: PTQ-1730
title: OwnedTurnAttempt and thisTurnSettled duplicate the raw next-user boundary.
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/owned-turn.ts:78-80
  - src/extension/turn-settlement.ts:136-138
sites: 2
fix_scope: module
d4_class: clone
wave: qw20261028153325
reported_by: lens-d4-duplication (openai/gpt-6.1-sol)
date: 2026-10-28
---

# OwnedTurnAttempt and thisTurnSettled duplicate the raw next-user boundary.

## Observation
`OwnedTurnAttempt.read` and `thisTurnSettled` each find the first raw user entry after an anchor and slice the chronological path before that entry, with the same missing-anchor and missing-next-user fallbacks. Their anchor discovery differs: the former uses the retained raw entry ID, while the latter correlates a projected user by message-reference identity. The duplicated boundary suffix governs which raw entries can contribute to own-turn checks. The production attempt reader calls the settlement helper with its already bounded path, so this is duplicate clipping, not a claim that today's reads borrow a foreign turn.

## Evidence
The authoritative clone map identifies **G022**, **70 tokens**, **renamed-only (4)**, with exactly these **2 occurrences**. Both cited spans were re-read immediately before filing.

**Copy 1 — `src/extension/owned-turn.ts:78-80`, `OwnedTurnAttempt.read`:**

```ts
    const ownAt = path.findIndex((entry) => entry.id === this.#userId);
    const rawEnd = ownAt === -1 ? -1 : path.findIndex((entry, index) => index > ownAt && entry.type === "message" && entry.message.role === "user");
    const ownPath = ownAt === -1 ? path : path.slice(ownAt, rawEnd === -1 ? path.length : rawEnd);
```

**Copy 2 — `src/extension/turn-settlement.ts:136-138`, `thisTurnSettled`:**

```ts
  const rawStart = path.findIndex((entry) => entry.type === "message" && entry.message === user);
  const rawEnd = rawStart === -1 ? -1 : path.findIndex((entry, index) => index > rawStart && entry.type === "message" && entry.message.role === "user");
  const ownPath = rawStart === -1 ? path : path.slice(rawStart, rawEnd === -1 ? path.length : rawEnd);
```

**Diff verdict: renamed-only boundary suffix, not behavioral drift.** Extracting lines 79-80 and 137-138 into `mktemp` files, replacing `ownAt` with `rawStart`, and removing leading indentation produces an empty `diff -u` (exit 0). The first lines above provide anchor-discovery context; their ID-versus-reference predicates are intentionally different and are not alleged to be equivalent or defective.

The first copy's `ownPath` supplies raw-reference/edited-entry attribution (`owned-turn.ts:85-93`), the compaction veto and settlement call (`:105-106`), and omission evidence (`:112-113`). The second copy supplies the path to `trailingCompactionUnanswered` (`turn-settlement.ts:139`). The production chain is `LivePromptQueryModel.#driveUserVisibleTurn` constructing `OwnedTurnAttempt` at `live-prompt-query-driver.ts:1033`, then `OwnedTurnAttempt.read` calling `thisTurnSettled` at `owned-turn.ts:106`.

## Why this is a problem
This is load-bearing duplication of the PIC-70 raw-turn upper boundary, not two unrelated uses of `findIndex`. `docs/spec_topics/pi-integration-contract/conversation-drive.md:16` states: “The own span starts at that anchor and ends immediately before the next user message not issued as part of this attempt” and “The same upper boundary applies to the chronological leaf-path evidence used for this attempt's compaction check.” Both copies implement that specific boundary and its two fallback decisions. If they disagree, provenance/omission checks and the settlement compaction check can evaluate different raw spans; for example, widening one span across a foreign user lets that side inspect foreign assistant or compaction entries that the other side excludes.

The boundary's behavioral consequence is recorded in `docs/bugs/0503-foreign-turn-from-deferred-prompt-bound-as-query-result.md`, especially “Cause and actual fix” and the red/green evidence for `B0503_OWN_SETTLED` and `B0503_NO_BORROWED_SETTLE`. Commit `8b26ca9c` introduced the attempt reader and the settlement helper's next-user clipping together. That history establishes why this is one contract, not evidence of an existing disagreement between the current copies. The separate ID/reference anchor proofs remain outside this finding.

## Suggested direction (non-binding, optional)
The existing `src/extension/turn-settlement.ts` is a natural shared home for the raw next-user boundary rule (hypothesis); both copies already share its directory and the attempt reader already imports its settlement predicates. This observation does not prescribe how their distinct anchor proofs should be represented.

## False-positive check
- Re-verified G022 at both authoritative spans. The mechanical diff above confirms the shared suffix after identifier/indentation normalization; no token recount was substituted for the map.
- Liveness search: `rg -n 'new OwnedTurnAttempt\(|thisTurnSettled\(' src extensions tools` returns 3 lines: the helper declaration, the production call from the attempt reader, and the live driver's construction. Both copied blocks execute on the production non-relocated settlement path; neither is an abandoned implementation. The inner clipping receives an already bounded path, which is explicitly acknowledged rather than presented as an independent unbounded production entry point.
- These are hand-written implementations under `src/`, not tests, generated output, or repeated normative vector/enumeration tables. PIC-70 specifies one boundary rule, not a requirement to maintain two implementations of it.
- Intent/history check: `git show 8b26ca9c -- src/extension/owned-turn.ts src/extension/turn-settlement.ts` shows both suffixes added in the same bug-0503 fix. The settlement module's independent-implementation rationale at lines 61-69 concerns its built-message surface versus the live test harness's raw-entry surface, not these two raw `SessionEntry[]` suffixes. No rationale there requires this clipping suffix to remain duplicated; the distinct anchor predicates are preserved in the scope of this observation.
- Existing-topic check: `rg -n 'raw-turn-boundary|raw next-user boundary|G022.*owned-turn|owned-turn\.ts:7[89]|turn-settlement\.ts:13[6-8]' quality/issues quality/resolved quality/intake --glob '*.md'` returned 0 matching lines before this report was created. The broader ownership/settlement search found prior extraction and locator reports, not a filing against this boundary suffix.

## Triage
verdict: confirmed — Clone-scan reproduces G022 (70 tokens, two occurrences), and the normalized boundary suffixes diff identically; both execute in the production attempt-read chain and implement PIC-70's raw next-user boundary with identical fallbacks despite distinct anchor discovery. The independent-surface rationale does not cover this raw-path clone, and no existing filing tracks it. (triage: claude-opus-5-5)
