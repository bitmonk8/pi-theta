---
id: PTQ-0413
title: checkInvokeStaticResolution keeps the 153-LOC invoke-expression call-surface loop inline at 248 LOC while every sibling surface is already a delegated helper
lens: D9
status: open
verdict: confirmed
locations:
  - src/extension/invoke-static-checks.ts:1530-1777
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/invoke-static-checks.ts#checkInvokeStaticResolution
d9_band: strong
wave: qw20260917121953
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-17
---

# checkInvokeStaticResolution keeps the 153-LOC invoke-expression call-surface loop inline at 248 LOC while every sibling surface is already a delegated helper

## Observation
`checkInvokeStaticResolution` (src/extension/invoke-static-checks.ts:1530-1777) is 248 LOC in the strong band (map: 1 src / 6 test importers) inside a 1777-LOC justify-band file. The ratified seam lane on this host (resolved PTQ-0321 Seam A, PTQ-0351 Seams B/C) extracted the `.theta`-callable surface (`checkThetaCallableCallSurface`, :938-1115), the with-clause default-reject (`checkWithClauseDefaultReject`, :1242-1301) and Pi-tool disjointness (`checkPiToolArgDisjointness`, :1377-1459), each now a one-push delegation at :1726-1766. The one call surface still inline is the `invoke(...)` expression loop (:1572-1724), which alone is over the justify function threshold.

## Evidence
Step inventory (all ranges re-read this session; locals each phase reads/writes stated):

| phase | line ranges | LOC | locals read/written |
|---|---|---|---|
| shared setup | 1546-1570 | 25 | writes `diagnostics`, `callerPath`, `callSites`, `typeEnv`, `typePass` |
| invoke-expr call surface loop: INV-1 containment (`checkInvokePathAtLoad` + callee-has-errors warning), INV-8 clause gate (`withClausePromptModeRefusal`), INV-6 cwd (`checkClauseCwdType`), INV-3 arity + per-slot types (`buildInvokeArgSlot`, `checkInvokeCall`) | 1572-1724 | 153 | reads `callerPath`, `typeEnv`, `typePass`, `deps.fs`, `deps.activeRoots`, `deps.resolveCalleeArity`; writes `diagnostics` |
| delegated sibling surfaces (4 pushes) | 1726-1766 | 41 | reads `callSites.callExprs`, `callerPath`, `typeEnv`, `typePass`, `deps.callableSet` |
| INV-4 cycle walk + return | 1769-1777 | 9 | reads `input.slashName`, `deps.graph` |

Delegation shape already established for the sibling surface (:1726-1729):

```typescript
    diagnostics.push(
      ...(await checkThetaCallableCallSurface(
        callSites.callExprs,
```

versus the inline surface's head (:1572):

```typescript
    for (const invoke of callSites.invokeExprs) {
```

Importer counts from the map: `checkInvokeStaticResolution` 1 src / 6 tests; the extracted siblings are module-private with 0 external importers.

## Why this is a problem
Strong band (248 LOC ≥ 200): presumption of breakdown requiring a strong concrete reason. Reasons considered: (a) single algorithm with shared local state — the inline loop reads exactly the set the ratified `checkThetaCallableCallSurface` extraction already threads (`callerPath`, `typeEnv`, `typePass`, a deps record): 5 shared locals per PTQ-0321's own triage count, under the ≥6 bar, and the landed sibling proves the seam cost is one parameter list; (b) closed-enumeration dispatch — the loop is a per-site check sequence, not a spec-table switch; (c) data-only — no; (d) grammar production — no; (e) generated — no. Strong reasons: no `quality/exemptions.json` entry for this host; no measured cost; no reverted split (three extractions landed and stuck on this very function); no human ruling keeps the remainder whole — PTQ-0321/0351 ratified specific seams and are both closed, leaving the still-strong-band remainder undispositioned.

## Suggested direction (non-binding, optional)
Hypothesis, unproven, human ratifies: Seam A: the invoke-expression surface loop (:1572-1724) -> module-private `checkInvokeExprCallSurface` (hypothesis), ~153 LOC, taking `callSites.invokeExprs`, `callerPath`, `typeEnv`, `typePass` and a deps record (`fs`, `activeRoots`, `resolveCalleeArity`), returning `Diagnostic[]` — the exact shape of the ratified `checkThetaCallableCallSurface` seam; 0 exported symbols moved, 0 external importers, cross-references back into the host: `checkClauseCwdType`, `buildInvokeArgSlot`, `resolveCalleeAbsolute` (module-private, they stay). None identified yet beyond this.

## False-positive check
Band: strong (248 ≥ 200) from the authoritative map. Reasons-considered list above with defeating counts (5 shared locals; the landed sibling extraction as the seam-cost witness). Exemptions check: no `invoke-static-checks` key in `quality/exemptions.json` (read this session). Generated-code check: hand-written, bug-numbered comments. Spec-mirror check: INV-1/3/6/8 are five distinct invocation.md clauses enforced sequentially, not one closed enumeration's arms. Duplicate check: PTQ-0321 and PTQ-0351 are resolved/fixed, each closed by its own landed seam — this files the remainder they left; PTQ-0374 (rejected/skipped) is a D4 clone inside the two extracted surfaces, a different class and different spans, untouched here.

## Triage
verdict: questionable — accounting verified against current HEAD: size-scan map confirms invoke-static-checks.ts 1777 LOC/justify and checkInvokeStaticResolution 1530-1777/248 LOC/strong with 1 src/6 test importers; the `for (const invoke of callSites.invokeExprs)` loop opens at 1572 and closes at 1724 (153 LOC) and every quoted excerpt (delegation head 1726-1729, setup 1546-1570, four sibling pushes 1726-1766, INV-4 tail 1769-1777) matches verbatim; the sibling helpers checkThetaCallableCallSurface 938-1115 / checkRuntimeToolCallSurface 1126-1209 / checkWithClauseDefaultReject 1242-1301 / checkPiToolArgDisjointness 1377-1459 are all module-private (no `export`) at the cited ranges, as are the loop's back-references checkClauseCwdType:344, resolveCalleeAbsolute:420, buildInvokeArgSlot:858; the setup declares exactly five locals the loop can share (diagnostics, callerPath, callSites, typeEnv, typePass — runtimeToolSuccessTypes is consumed only into typePass and never read in the loop), under the ≥6 bar; the loop reads deps.fs/activeRoots/resolveCalleeArity and never deps.callableSet, so the inventory rows are real distinct concerns (one call surface vs the four delegated surfaces vs the INV-4 cycle walk), not one concern split by adjectives; INV-1/3/6/8/4 anchors verified at docs/spec_topics/invocation.md:14/44/59/63/95; `grep invoke-static-checks quality/exemptions.json` → no match; no generated-code marker; no reverted split (the three prior extractions stuck). Dedupe: the identical seam was filed as qw20260916045442-d9-02 and triaged questionable three times, but commit 53f815de purged it via the store reset-review op whose own message states "a reset is not a ruling" and it has no TRIAGE_LOG row, no PTQ id and no open/resolved issue — so no tracked root cause exists and this re-file is legitimate, not a duplicate; PTQ-0321/0351 ratified Seams A/B/C only and neither disposes of the invoke(...) loop. D9 breakdown target shape is a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-17): extract the invoke(...) expression call-surface loop (:1572-1724) into the sibling surface module the seam creates, one-push delegation like the three ratified siblings - AND relocate collectProvableArgTypes (:640-835) plus module-private renderCollectedTypes into that same new module (old host imports them back like any caller). The relocation is deliberate: it unblocks PTQ-0374's G008 dedupe, whose only compliant home this module becomes. Coordinated with PTQ-0374's ruling.
