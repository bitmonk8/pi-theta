---
id: PTQ-1183
title: ProductionThetaProducer.#driveCallee chains eight guard-and-dispatch phases in one 316-LOC method
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:4935-5250
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.#driveCallee
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# ProductionThetaProducer.#driveCallee chains eight guard-and-dispatch phases in one 316-LOC method

## Observation
`ProductionThetaProducer.#driveCallee` (src/extension/production-theta-producer.ts:4935-5250) is 316 LOC — strong band (threshold 200). It resolves and drives one `invoke(...)` hop: four boundary guards (arg depth, cwd validation, containment recheck, callee parse), param-binding assembly with default recovery, then two full dispatch legs — prompt→prompt attach and subagent spawn — each with its own return-validation and provenance tagging.

## Evidence
Step inventory:

| phase | lines | LOC | locals written (read later by) |
|---|---|---|---|
| per-arg ceiling-#4 depth walk | 4969-4977 | 9 | — (early return) |
| with-clause cwd validate/resolve (INV-6) | 4979-5008 | 30 | resolvedCwd (prompt refusal, spawn bind) |
| containment recheck (INV-1) | 5010-5015 | 6 | — (early return) |
| callee parse + load/parse-failure mint (bug 0293) | 5016-5040 | 25 | callee (everything below) |
| prompt-mode-under-cwd refusal (INV-8) | 5041-5060 | 20 | — |
| return site + param bindings + default recovery | 5061-5098 | 38 | returnSite, paramNames, omittedDefaulted, recovered, recoveredByName, paramBindings |
| prompt→prompt attach leg (runPromptSuspendInvoke + #validateInvokeReturn) | 5099-5177 | 79 | childBinding, outcome, bodySource, validated |
| subagent spawn leg (spawn bind, drive/surface, validate, teardown finally) | 5179-5250 | 72 | binding, result, bodySource, validated |

Excerpt (5099-5101, the two-leg fork):
```ts
    if (callerMode === "prompt" && callee.frontmatter.mode === "prompt") {
      const childBinding = this.bindPromptConversation({
        theta: callee,
```
The two legs repeat the same validate-and-provenance epilogue (5155-5171 vs 5227-5243: `#validateInvokeReturn` then the `!validated.ok && result.ok → boundary-minted` remap).

## Why this is a problem
Strong band (316 LOC ≥ 200): presumption of breakdown; a strong concrete reason is required. Reasons considered and defeated: (a) single algorithm with shared local state — concrete but the phases share only `callee`, `resolvedCwd`, `paramBindings`, `returnSite` across the fork (4 locals, under the 6-local bar); (b) spec-cited ordered critical section — the guards' order is commented (depth before containment before parse) but each is an independent early-return; a helper per guard preserves the order without interleaving anything observable; (c) closed enumeration — the body is a two-arm mode fork, not a spec-named set; (d) measured cost / prior revert / human ruling — none found; no exemptions.json entry for this host.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the pre-dispatch guard block (4969-5060) -> `#guardInvokeBoundary(calleePath, argValues, rawCwd, ...)` returning `{ resolvedCwd } | DrivenInvokeResult` — ~90 LOC, no exports. Seam B: param-binding assembly with default recovery (5061-5098) -> `#bindCalleeParams(callee, argValues)` — ~38 LOC. Seam C: the shared validate-and-provenance epilogue -> `#projectValidatedReturn(calleePath, returnSite, result, bodySource, ...)` — ~20 LOC, removes the duplicated remap in both legs.

## False-positive check
Band check: 316 LOC strong (map-quoted). Reasons-considered list above. Exemptions check: no entry. Generated-code check: hand-authored. Spec-mirror check: not an enumeration host. Cited ranges re-read this session (offset 4935, 316 lines).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces #driveCallee 4935-5250 / 316 LOC / band strong with no exemptions.json entry; the eight phases are real independent early-return guards, a binding-assembly block, and two symmetric dispatch legs sharing only callee/resolvedCwd/paramBindings/returnSite across the fork (4 < 6); excerpts match at small drift (fork at 5105, epilogues 5160-5171 / 5228-5243); git log -S shows no prior split or revert (the 2026-09-16 REVIEW_LOG KEEP is a D8 right-sizing note, not a D9 ruling) — target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map gives #driveCallee 4934-5249 / 316 LOC / band strong (one-line drift; FN strong threshold 200), quality/exemptions.json carries only the D8 #firstAdmittingArmProperties row for this file; all eight inventory rows are real and distinct (rows 1/3/5 early-return guards writing nothing, row 2 writes resolvedCwd, row 4 writes callee, row 6 assembles paramBindings with paramNames/defaultedFields/omittedDefaulted/recovered/recoveredByName confined to that row, rows 7/8 each a self-contained try/finally leg), and locals written in one row and read in another are exactly callee/resolvedCwd/returnSite/paramBindings = 4 < 6 — unlike d9-03 no seam cuts a try/finally critical section; the ceiling-#4-before-containment and INV-8-before-attach ordering comments survive sequential helper calls; excerpts match (fork 5104, epilogues 5160-5171 / 5228-5243); git log -S shows no prior split or revert and REVIEW_LOG:79 is a D8 KEEP; not a duplicate — same-wave d9-01 is the file-level host, 223212-d9-01 is #driveSubagentFnEntry, PTQ-1125 is a D4 preamble clone; seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time from scratch: size-scan map (one-line manifest) reports #driveCallee 4934-5249 / 316 LOC / band strong (FN strong ≥ 200) and quality/exemptions.json holds only the D8 #firstAdmittingArmProperties key for this file; all eight inventory rows re-read at ≤1-line drift and are distinct early-return guards (ceiling-#4 walk, INV-6 cwd, INV-1 containment, bug-0293 parse, INV-8 refusal), one binding-assembly block whose paramNames/defaultedFields/omittedDefaulted/recovered/recoveredByName never escape it, and two self-contained try/finally legs — cross-row locals are exactly callee/resolvedCwd/returnSite/paramBindings (4 < 6), the cited ordering comments are sequential-call-preserving, no spec clause pins the method as one body, and git log -S / --grep shows only feature/fix commits (INV-9, ceiling #4, B1, PIC-9, 0110, 0293, 0409) with no split ever reverted; not a duplicate — PTQ-1125 (resolved) is production-composition.ts:2444-2524, same-wave d9-01 keys the file-level host, 223212-d9-01 keys #driveSubagentFnEntry; target shape needs a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
