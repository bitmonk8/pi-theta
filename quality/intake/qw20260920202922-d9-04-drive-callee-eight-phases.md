---
id: pending
title: ProductionThetaProducer.#driveCallee chains eight guard-and-dispatch phases in one 316-LOC method
lens: D9
status: intake
verdict: pending
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
