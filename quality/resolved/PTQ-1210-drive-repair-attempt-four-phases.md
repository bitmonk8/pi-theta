---
id: PTQ-1210
title: LivePromptQueryModel.driveRepairAttempt sequences four separable phases of the typed-query repair restart in one 120-LOC body
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:6339-6458
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#LivePromptQueryModel.driveRepairAttempt
d9_band: justify
wave: qw20260920223212
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# LivePromptQueryModel.driveRepairAttempt sequences four separable phases of the typed-query repair restart in one 120-LOC body

## Observation
`LivePromptQueryModel.driveRepairAttempt` (src/extension/production-theta-producer.ts:6339-6458, 120 LOC, band justify per the structural map) drives one respond-repair attempt as a two-phase restart (its doc comment cites QRY-14 ¶3). One body holds the entry totality guards, the per-attempt state resets, the whole `max_rounds > 0` restarted-phase branch (drive, throw check, probe, early-capture check, window dispatch), and the separate `max_rounds: 0` boundary branch.

## Evidence
Step inventory (line anchors from the current file; state each phase reads/writes):

| phase | lines | LOC | reads/writes |
|---|---|---|---|
| entry totality guards (respond undefined; gateError) | 6339-6365 | 27 | reads `#respond`, `#provider`; writes `respond` |
| per-attempt state resets | 6366-6375 | 10 | writes `#earlyRespond`, `#transportFromThrow` |
| restarted free phase + fresh dispatch (`max_rounds > 0`) | 6376-6440 | 65 | reads/writes `#transportFromThrow`, `#earlyRespond`, `#exhaustion`; writes `probe`, `followUpSlots` |
| `max_rounds: 0` boundary dispatch | 6441-6458 | 18 | reads `#thetaAbort`; calls `dispatchForcedRespondTurn` directly |

The two dispatch branches end in parallel calls to the same mapper (6429-6435 and 6450-6457):
```ts
      return mapForcedTurnToRepairOutcome(
        await this.#dispatchRespondOverWindow(respond),
        this.#thetaAbort.signal,
        followUpSlots,
      );
```
Cross-phase locals are two: `respond` and `prompt`; every other shared datum is an instance field (`#earlyRespond`, `#transportFromThrow`, `#exhaustion`, `#thetaAbort`, `#maxRounds`), already reachable from any private method of the class. Of the 120 lines, 62 are comment lines (`grep -c '^\s*//'` over 6339-6458).

## Why this is a problem
Justify band (120 LOC ≥ 100): presumption of breakdown unless a concrete reason is found. Reasons considered and defeated: (a) single algorithm with shared local state — only 2 locals (`respond`, `prompt`) cross phase boundaries; all other shared state is instance fields, so extracting the restarted-phase branch or the boundary branch into private methods threads at most 2 values and invents no state object (contrast the sibling `#driveUserVisibleTurn`, kept whole this cycle on a 7-shared-local try/finally critical section — no try/finally or arm/disarm pairing exists here); (b) closed-enumeration dispatch — no switch over a spec-named set, just two `max_rounds` regimes; (c) data-only — no; (d) grammar production — no; (e) generated — hand-authored. The QRY-14 ¶3 citation names the protocol, not one critical section: the phases are separated by awaited provider boundaries (`#driveUserVisibleTurn`, `#dispatchRespondOverWindow`, `dispatchForcedRespondTurn`) already.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the restarted-phase branch (6376-6440) -> `#driveRestartedRepairPhase(respond, prompt)` private method (hypothesis) — ~65 LOC, 0 exported symbols, 0 external importers, cross-refs back: instance fields only. Seam B: the entry totality guards (6339-6365) -> a shared `#repairEntryRefusal(respond)` guard (hypothesis) — ~27 LOC, mirrors the gateError refusal repeated at 6071 (`nextFreePhaseTurn`) and 6246 (`forcedRespondTurn`). None identified yet beyond these.

## False-positive check
Band: 120 LOC, justify — quoted from the structural map, not recounted. Reasons-considered list recorded above with the counted defeating evidence (2 cross-phase locals named; comment-line count stated so triage can weigh code density). Exemptions check: quality/exemptions.json has no D9 entry for this file or member. Generated-code check: hand-authored. Spec-mirror check: no closed enumeration. Duplicate check: prior-wave filings on this class target `#driveUserVisibleTurn` only (rejected keep-whole on a shared-locals critical section that this method does not have); no intake or issue file targets `driveRepairAttempt`.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces `LivePromptQueryModel.driveRepairAttempt — 6339-6458 — 120 LOC — band justify` with no D9 row in quality/exemptions.json (only a D8 row for `firstAdmittingArmProperties` on this file); the 4-row step inventory matches the code (guards 6342-6365, resets 6366-6375, `#maxRounds > 0` branch 6376-6440 ending in `mapForcedTurnToRepairOutcome(await this.#dispatchRespondOverWindow(respond), …)`, `max_rounds: 0` boundary 6441-6458 ending in the parallel `dispatchForcedRespondTurn` mapping); the only local declarations are `respond`, `probe`, `followUpSlots` (+ param `prompt`) and `probe`/`followUpSlots` never leave row 3, so exactly 2 locals cross rows — well below the ≥ 6 shared-locals reason, and there is no try/finally or arm/disarm pairing (grep over the range hits only a comment word), unlike the `#driveUserVisibleTurn` rejection; the 62/120 comment-line count reproduces (≈58 code LOC — a density point for the human to weigh); QRY-14 (query-tool-loop.md:11-16) is a protocol description, not an invariant pinning one method body; git log -S shows no prior split/revert; the gateError twin refusals at 6071/6246 exist as stated; sole external caller is `#resolvePromptQuery` at 3969; no intake/issue file targets this member (shard-05 notes list it as left unfiled on budget) (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: independent re-run of `size-scan.mjs map` reproduces `LivePromptQueryModel.driveRepairAttempt — 6339-6458 — 120 LOC — band justify` (FN justify ≥ 100) and quality/exemptions.json carries only the D8 `#firstAdmittingArmProperties` row for this file; the four inventory rows are real sequential steps at the cited lines (guards 6342-6365 / resets 6366-6375 / `#maxRounds > 0` branch 6376-6440 / `max_rounds: 0` boundary 6441-6458, the last two mutually exclusive and each ending in its own `mapForcedTurnToRepairOutcome` call as excerpted), with row 2 being 2 statements under 8 comment lines; the only `const` declarations in the range are `respond` (6342), `probe` (6399), `followUpSlots` (6410) plus the `prompt` param, and `probe`/`followUpSlots` never leave row 3, so exactly 2 locals cross rows (≪ 6) and `grep -E 'try|finally|arm'` over the range hits only comment prose (no critical section, unlike the rejected `#driveUserVisibleTurn` filing); `grep -c '^\s*//'` = 62/120 reproduces; QRY-14 lives at docs/spec_topics/query/query-tool-loop.md:11-16 and is the two-phase protocol description, not an invariant pinning one body; the gateError twins at 6071/6246 and the sole caller at 3969 reproduce; git log -S shows no prior split/revert — the one deletion (89faa7c5) removed the sibling `OffSessionQueryModel.driveRepairAttempt` copy, a D4 dedupe of another class; not a duplicate — 202922-d9-08 keys `#resolvePromptQuery` and only mentions this member in its triage prose, and no issue file targets it (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
