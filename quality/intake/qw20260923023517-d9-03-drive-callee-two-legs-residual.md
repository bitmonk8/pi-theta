---
id: pending
title: ProductionThetaProducer.#driveCallee remains 184 LOC after the PTQ-1183 fix, with both mode-fork dispatch legs still inline
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:5026-5209
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#driveCallee
d9_band: justify
wave: qw20260923023517
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# ProductionThetaProducer.#driveCallee remains 184 LOC after the PTQ-1183 fix, with both mode-fork dispatch legs still inline

## Observation
`#driveCallee` (src/extension/production-theta-producer.ts:5026-5209) is 184 LOC — justify band (function threshold 100; map-quoted). PTQ-1183 (confirmed, fixed) filed it at 316 LOC; the fix extracted its three ratified seams, all now separate members in the structural map: `#guardInvokeBoundary` (5212-5264), `#bindCalleeParams` (5300-5333), `#projectValidatedReturn` (5336-5357). What remains is a 10-LOC prologue followed by the two full dispatch legs of the caller-mode fork — the prompt→prompt attach leg and the subagent spawn leg — each a self-contained bind → drive → validate-return → finalize sequence.

## Evidence
Fresh step inventory (line anchors grep-verified):

| phase | lines | LOC | locals written (read later by) |
|---|---|---|---|
| boundary guard call + destructure (PTQ-1183 seam A landed) | 5048-5050 | 3 | callee, resolvedCwd (spawn leg) |
| return-site resolve + param bind (seams landed) | 5051-5058 | 8 | returnSite, paramBindings (both legs) |
| prompt→prompt attach leg: `bindPromptConversation` + `runPromptSuspendInvoke` literal + `#projectValidatedReturn` + `finishInvocation` finally | 5072-5141 | 70 | childBinding, outcome, bodySource (leg-local) |
| subagent spawn leg: `spawnSubagentConversation` + drive/surface fork + `#projectValidatedReturn` + teardown finally | 5143-5208 | 66 | binding, result, bodySource (leg-local) |

Fork head and leg entries (5048, 5072, 5145; excerpt):
```ts
    const boundary = await this.#guardInvokeBoundary(theta, calleePath, argValues, ctx, rawCwd);
    if ("result" in boundary) return boundary;
    const { callee, resolvedCwd } = boundary;
    ...
    if (callerMode === "prompt" && callee.frontmatter.mode === "prompt") {
      const childBinding = this.bindPromptConversation({
    ...
    const binding = await this.spawnSubagentConversation({
```
No local written inside one leg is read by the other; each leg ends in its own `#projectValidatedReturn(...)` call and its own `finally`.

## Why this is a problem
Justify band (184 LOC ≥ 100): presumption of breakdown; not filed only on a concrete recorded reason. Reasons considered and defeated: (a) single algorithm with shared local state — the legs read callee, paramBindings, returnSite, calleePath, ctx, chain, parentSignal, parentInvocationId, trace (9 locals), but each leg consumes them READ-ONLY and already packages most into its bind-input object literal (5073-5086, 5145-5159), so the parameter object exists in shape and no state threads BETWEEN the legs — the fork arms are disjoint (the same defeat PTQ-1188 recorded for its deps literals); (b) closed-enumeration dispatch — a two-arm mode fork, not a spec-named closed set (PTQ-1183's recorded defeat, unchanged); (c) spec-cited invariant as one critical section — invocation.md §Cross-mode semantics selects WHICH leg runs; no ordered step sequence spans both legs, and each leg's own ordering (drive before validate before teardown) moves intact with the leg; (d) generated / data-only — no; (e) human ruling — quality/exemptions.json holds only the D8 `#firstAdmittingArmProperties` row for this file. PTQ-1183 is status fixed, so this is the post-fix residual with a fresh inventory (the PTQ-1290 pattern).

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the attach leg (5072-5141) -> `#driveAttachedPromptCallee(callee, calleePath, returnSite, paramBindings, ctx, chain, parentSignal, parentInvocationId, trace)` (hypothesis) — ~70 LOC, no exported symbols, 0 external importers, cross-refs back into the host: `bindPromptConversation`, `#systemNoteChannel`, `#projectValidatedReturn`. Seam B: the spawn leg (5143-5208) -> `#driveSpawnedSubagentCallee(...)` (hypothesis) — ~66 LOC, no exports, cross-refs back: `spawnSubagentConversation`, `#projectValidatedReturn`.

## False-positive check
Band: map-quoted 184 LOC / justify, not recounted. Reasons-considered list above with the defeating evidence per reason. Exemptions check: no D9 row for this host in quality/exemptions.json. Generated-code check: hand-authored. Spec-mirror check: the fork mirrors invocation.md cross-mode cells (two arms), which is below any closed-set length that could account for 184 LOC. Duplicate check: PTQ-1183 (same member key) is resolved/fixed — this filing is the post-fix residual; PTQ-1285 (open, confirmed) keys the FILE host; no pending intake filing names this member.

## Triage
verdict: questionable — accounting verified: size-scan map (one-line manifest) reproduces `#driveCallee 5026-5209 / 184 LOC / band justify` (FN justify ≥ 100) and the PTQ-1183 seams are separate members at the cited lines (#guardInvokeBoundary 5212-5264 / 53, #bindCalleeParams 5300-5333 / 34, #projectValidatedReturn 5336-5357 / 22); all four inventory rows re-read at zero drift and the two legs are distinct concerns — prompt-attach leg 5072-5141 (childBinding/outcome, own try/finally → finishInvocation) and spawn leg 5143-5208 (binding/result, own try/finally → teardown+finishInvocation) share no leg-written local, and the only locals written before the fork and read inside a leg are callee/resolvedCwd/returnSite/paramBindings (4 < 6; the other 5 the filing lists are method parameters), so the ≥6-shared-locals reason is correctly defeated; no overlooked reason — two-arm fork is not a spec closed set, ~0 % data/type LOC, hand-authored, quality/exemptions.json holds only the D8 #firstAdmittingArmProperties row for this file, and git log -S shows the PTQ-1183 split landed in 475e62db with no revert; not a duplicate — PTQ-1183 (same member key) is status fixed in quality/resolved so this is the post-fix residual with a fresh ≥2-row inventory, PTQ-1285 keys the FILE host, and no other intake names #driveCallee; whether to lift the legs into two private members is a design decision for a human ruling (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
