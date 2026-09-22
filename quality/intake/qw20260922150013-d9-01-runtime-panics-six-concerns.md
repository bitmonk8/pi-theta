---
id: pending
title: runtime-panics.ts bundles panic-frame machinery, the closed panic class set, receiver gating, access/`?` evaluators, gate-gap defect classes, and the runtime-defect surface in one 880-LOC module
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/runtime-panics.ts:1-880
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/runtime/runtime-panics.ts
d9_band: zone
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# runtime-panics.ts bundles panic-frame machinery, the closed panic class set, receiver gating, access/`?` evaluators, gate-gap defect classes, and the runtime-defect surface in one 880-LOC module

## Observation
src/runtime/runtime-panics.ts is 880 LOC (zone band). Its header (lines 1-34) names itself "the runtime-panic surface seam": the closed `theta/runtime/*` panic set, the `?`-propagation seam, and the runtime-defect surface. In practice the module also hosts the runtime access evaluators (`evaluateIndexAccess`, `evaluateMemberAccess`, `enterInvokeFrame`, `evaluateQuestion`) — evaluation logic imported by statement-executor and the pure host — plus the receiver-kind gate cluster and three gate-gap defect Error classes whose throwers live in other modules.

## Evidence
Distinct-concern inventory (declaration LOC from the wave's structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| panic site/frame carrier + suffix rendering | PanicSite, PanicFrame, ThetaPanic, attachPanicSite, attachPanicRange, completePanicSite, pushPanicFrame, renderPanicSuffixLines, retargetInterpolationPanic | 69-295 | 112 |
| closed panic class set + codes | INDEX_OUT_OF_BOUNDS_CODE…INVOKE_DEPTH_EXCEEDED_CODE, IndexOutOfBoundsPanic, MissingObjectKeyPanic, NullIndexAccessPanic, NullMemberAccessPanic, InvokeDepthExceededPanic, InterpolatedResultPanic | 42-46, 298-360 | 47 |
| receiver-kind gate | NON_OBJECT_RECEIVER_CODE, GatedReceiverKind, NonObjectReceiverError, gatedReceiverKind, nonObjectReceiverRejection | 57, 372-464 | 46 |
| access / depth / `?` evaluators | INVOKE_DEPTH_CAP, assertKeyPresent, renderIndexOperand, evaluateIndexAccess, evaluateMemberAccess, enterInvokeFrame, QuestionResult, evaluateQuestion | 60, 481-668 | 95 |
| gate-gap defect classes (throwers elsewhere) | QuestionOperandDefectError, StdlibMethodArgumentDefectError, StdlibMethodArgumentKindDefectError, summariseNonResultOperand | 692-794 | 48 |
| runtime-defect surface | INTERNAL_ERROR_CODE, HostFatal, surfaceUnexpectedThrow, isThetaPanic | 49, 804-880 | 55 |

Sample of the evaluator concern (line 520-527, re-read before filing):

```ts
export function evaluateIndexAccess(
  target: ThetaValue,
  index: number | string,
): ThetaValue {
  if (target === null) {
    // `[i]` access on `null` (`theta/runtime/null-index-access`). `<i>`.
    const rendered = typeof index === "number" ? renderInteger(index) : index;
    throw new NullIndexAccessPanic(`null index access: [${rendered}]`);
```

Importer counts from the map: evaluateIndexAccess 2 src / 7 tests, evaluateMemberAccess 2/2, evaluateQuestion 2/2, surfaceUnexpectedThrow 3/22, isThetaPanic 7/27 — the evaluator and defect-surface consumers are largely disjoint sets.

## Why this is a problem
Zone band: a breakdown filing requires a distinct-concern inventory with ≥ 2 concerns; six are present above. Reasons considered and defeated: (a) closed-enumeration/spec-mirror — the six-source panic set (error-model.md §"Runtime panics") covers only the 47-LOC class-set row, not the 95-LOC evaluators, the 112-LOC frame machinery, or the 55-LOC defect surface; (b) data-only module — 47 of 880 LOC are the literal class/const family, far under 80%; (c) single algorithm with shared local state — no local state is shared across the rows (ThetaPanic is a type dependency, not a threaded local); (d) generated code — hand-written (header narrates bug-fix history); (e) exemptions — no runtime-panics entry in quality/exemptions.json.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): access/depth/`?` evaluators (evaluateIndexAccess, evaluateMemberAccess, enterInvokeFrame, evaluateQuestion, QuestionResult + private assertKeyPresent/renderIndexOperand) -> runtime-access-evaluators.ts — ~95 LOC, 5 exported symbols moved, external importers 2/7 + 2/2 + 1/1 + 2/2 (src/tests), cross-references back into the host for the panic classes and nonObjectReceiverRejection. Seam B (hypothesis): StdlibMethodArgumentDefectError + StdlibMethodArgumentKindDefectError -> stdlib-signature.ts (their sole thrower) — ~17 LOC, 2 exported symbols, importers 1/0 each, one back-reference (summariseNonResultOperand). Seam C (hypothesis): the receiver-kind gate cluster -> its own module — ~46 LOC, 2 exported symbols (NonObjectReceiverError, nonObjectReceiverRejection), importers 0/0 + 2/0, back-reference from surfaceUnexpectedThrow's NonObjectReceiverError arm.

## False-positive check
Band check: 880 LOC ≥ 600, zone — filing gated on the ≥ 2-concern inventory above (six rows). Reasons-considered list recorded with defeating evidence per reason. Exemptions check: `grep runtime-panics quality/exemptions.json` — no hit. Generated-code check: hand-authored (bug 0476/0027/0393 narrative comments). Spec-mirror check: the spec-named closed set (error-model.md §"Runtime panics") accounts only for the panic-class row, and the header itself assigns the sixth source (MatchError) to ./match-result.ts — the enumeration does not explain the other five rows. Prior filings checked: PTQ-1218 (InterpolatedResultPanic in render) is resolved by the move INTO this file; no existing PTQ names runtime-panics breakdown.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces 880 LOC / zone band with every declaration line-range and importer count as cited (evaluateIndexAccess 2/7, evaluateMemberAccess 2/2, evaluateQuestion 2/2, surfaceUnexpectedThrow 3/22, isThetaPanic 7/27, Stdlib*DefectError 1/0 each); the six inventory rows re-sum to 112/47/46/95/48/55 declaration LOC from the map and are real member groups sharing no locals or fields (ThetaPanic is only a type dependency; the gate cluster's GatedReceiverKind/gatedReceiverKind are private and reached solely via nonObjectReceiverRejection; the defect classes' throwers are confirmed external — stdlib-signature.ts:60/63/66/94, statement-executor.ts:1435, pure-expression-evaluator.ts:228); reasons-considered hold: the spec-named six-source panic set covers only the class row (47 LOC, far under 80 % data), no ≥ 6-shared-local algorithm, hand-authored, no runtime-panics key in quality/exemptions.json and no human keep-whole ruling in TRIAGE_LOG (the 2026-09-20 D9 REVIEW_LOG 'kept whole: raisers co-located with raised classes' note is a reviewer's design preference, not a listed concrete/strong reason); the sibling intake qw20260922150013-d9-02 (misplacement of the two Stdlib*DefectError classes) overlaps seam B only and has a distinct root cause, so not a duplicate; whether raisers stay beside the panic classes is the design decision a human must ratify (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: re-ran size-scan map on src/runtime/runtime-panics.ts → 880 LOC, band zone, every declaration range (42-46/49/57/60, 69-295, 298-360, 372-464, 481-668, 692-794, 804-880) and importer count (evaluateIndexAccess 2/7, evaluateMemberAccess 2/2, evaluateQuestion 2/2, surfaceUnexpectedThrow 3/22, isThetaPanic 7/27, Stdlib*DefectError 1/0) matches; evaluateIndexAccess excerpt verbatim at 520-527; the six rows are separate top-level member groups with no shared locals/fields (ThetaPanic only a type/instanceof dependency; gate cluster's private GatedReceiverKind/gatedReceiverKind reached only via nonObjectReceiverRejection; defect-class throwers live in stdlib-signature.ts / statement-executor.ts / pure-expression-evaluator.ts); the header itself (1-34) names the file as bundling panic set + `?` seam + defect surface + accessor seams, so no single spec-mirror, ≥6-shared-local algorithm, ≥80 % data, or generated-code reason applies; `grep runtime-panics quality/exemptions.json` → 0; TRIAGE_LOG has no human keep-whole ruling (the 2026-09-20 REVIEW_LOG 'raisers co-located with raised classes' note is a reviewer's keep-whole preference, not a ratified ruling); sibling qw20260922150013-d9-02 is a misplacement of two classes (seam B only), distinct root cause, not a duplicate; no existing PTQ names a runtime-panics breakdown (triage: claude-fable-5-1)
