---
id: PTQ-1185
title: runTypedQueryLoop spans 305 LOC across nine phases, three of which repeat the same repair-outcome dispatch and terminal-error assembly
lens: D9
status: open
verdict: confirmed
locations:
  - src/runtime/query-tool-loop.ts:467-771
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/runtime/query-tool-loop.ts#runTypedQueryLoop
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# runTypedQueryLoop spans 305 LOC across nine phases, three of which repeat the same repair-outcome dispatch and terminal-error assembly

## Observation
`runTypedQueryLoop` (src/runtime/query-tool-loop.ts:467-771, 305 LOC — strong
band) drives the QRY-14 typed two-phase loop: free phase, boundary cancel
re-check, schema lower/convey, forced respond dispatch, then three
failure-classification arms (ERR-17 noncompliance, CIO-3 depth walk, AJV
non-conformance), each with its own repair-vs-direct-terminal split, before the
value return.

## Evidence
Step inventory (anchors verified in the current file):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| checkpoint + entry abort guard | 481-486 | 6 | checkpoint, signal, config |
| free phase loop (CIO-4 slot accounting) | 488-539 | 52 | rounds, committed, slotCount, round |
| boundary abort re-check (bug 0010 F1) | 541-553 | 13 | signal, committed |
| schema lower/convey (QRY-22) | 555-563 | 9 | schemaValidation; lowered |
| forced respond dispatch + transport arm | 565-597 | 33 | forced, forcedRespond, slotCountAtDispatch, signal, rounds, committed |
| noncompliance arm (repair switch or direct ERR-17 terminal) | 598-643 | 46 | forced, schemaValidation, config, slotCountAtDispatch, rounds, forcedRespond, committed |
| depth-walk arm (repair switch or direct terminal + masked event) | 645-726 | 82 | walk, forced.payload, schemaValidation, config, slotCountAtDispatch, rounds, forcedRespond, committed |
| AJV validate arm (repair switch) | 728-760 | 33 | lowered, forced.payload, schemaValidation, config, slotCountAtDispatch, rounds, forcedRespond, committed |
| value return | 762-770 | 9 | forced.payload, rounds, forcedRespond, committed |

Each of the three failure arms embeds the same three-case `repair.kind` switch
(608-628, 671-688, 738-758) — that clone group is already filed as
quality/intake/qw20260920183643-d4-01-respond-repair-switch-cloned.md; the D9
evidence here is the phase count, independent of the clones.

## Why this is a problem
Strong band (305 LOC >= 200) carries a presumption of breakdown. Reasons
considered: single algorithm with shared local state — genuinely concrete
here: each failure arm reads 7 shared values (schemaValidation, config,
slotCountAtDispatch, rounds, forcedRespond, committed, forced), so extraction
threads 6+ locals or invents an outcome-context object. But that reason class
is sufficient only in the justify band; the strong band requires a strong
concrete reason, and none applies: the CIO-3 depth-before-AJV ordering is a
caller-sequence property preserved across helper calls (no observable step
interleaves); no measured cost is cited anywhere in the file; git log shows no
reverted split of this function; quality/exemptions.json has no key for this
host. Closed-enumeration dispatch also fails: the arms are failure phases with
82/46/33 LOC, not short spec-table arms.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: the shared repair-outcome dispatch + terminal
assembly -> `settleRespondFailure(failure, ctx)` helper taking one
outcome-context object ({config, slotCountAtDispatch, rounds, forcedRespond,
committed, schemaValidation}) (hypothesis) — ~120 LOC across the three arms
collapse to ~40, 0 exported symbols move, 0 external importers, back-references
to `buildValidationEvent`/`computeMasked` only (this is also the fix surface
the D4 respond-repair-switch clone finding points at). Seam B: free phase loop
(488-539) -> `runFreePhase(model, config, signal)` (hypothesis) — 52 LOC, 0
exports, returns {rounds, committed, slotCount} — note the untyped loop
(352-452) shares this shape.

## False-positive check
Band check: 305 LOC per the map. Reasons-considered list above: the
shared-local reason is acknowledged concrete and defeated only by the
strong-band requirement (no strong criterion held: spec ordering preserved
across seams, no measurement, no reverted split, no exemption). Exemptions
check: no `src/runtime/query-tool-loop.ts#runTypedQueryLoop` key.
Generated-code check: hand-written, bug-annotated (0010/0353/0355).
Spec-mirror check: QRY-14/CIO-3/CIO-4 name phases and orderings, not an
enumeration whose row count this length mirrors. Duplicate-filing check: the
d4 respond-repair-switch-cloned finding covers the clone group only, not this
host's size/phase structure.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives runTypedQueryLoop 467-771, 305 LOC, band strong; all nine step rows and the three repair switches match the code at the cited lines; no exemption key, no reverted split in git -L history, no measured cost; the shared-7-locals reason is real but justify-band only, and whether the CIO-3 depth-before-AJV ordering is a strong keep-whole invariant plus the target seam shape need a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run gives runTypedQueryLoop 467-771, 305 LOC, band strong (FN strong = 200); all nine step rows anchor within ±3 lines (checkpoint 483, locals 488 / for(;;) 498, re-check 539, lowered 557, dispatch 566, noncompliance 598, depthWalk 649, AJV 732, return 763-771) and the three repair switches sit at 611/667/741; rows 6-8 share the same 7 locals but even collapsed to one failure-settlement concern the inventory keeps ≥ 2 concerns (free phase 52 LOC vs settlement ~160 vs dispatch 33); no overlooked strong reason — no `#runTypedQueryLoop` key in quality/exemptions.json (4 keys, none runtime), git -L history shows no reverted split (859a2a33 only dropped the resolve step), no measured cost, and unlike the d9-03 rejection there is no try/finally critical section: the arms are independent early returns so the CIO-3 depth-before-AJV ordering (schema-subset.md:49) is preserved by caller sequence; not a duplicate of PTQ-1117 (D4 clone of the switch, different root cause); the seam shape is a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified with a correction: PTQ-1117 (quality/resolved/) landed in 1332eb76 after filing, so size-scan map now gives runTypedQueryLoop 468-722, 255 LOC (not 305), still band strong (FN strong = 200) with no `#runTypedQueryLoop` key in quality/exemptions.json, no reverted split in git -L 468,722 history, no measured cost; the title's "three of which repeat the same repair-outcome dispatch" is stale — the three `repair.kind` switches are now three one-line calls to `respondRepairToQueryOutcome` (612/652/710), i.e. Seam A is half-landed — but the filing's stated D9 evidence is the phase count independent of the clones and all nine phases still anchor (checkpoint 484, free loop 489-529, re-check 540, lowered 558, dispatch 567, noncompliance 599, depthWalk 634, AJV 701, return 716-722), the direct-terminal assembly still repeats in two arms (617-627 via buildValidationEvent vs 657-692 hand-built RuntimeEvent + computeMasked), and the residual ≥ 2-concern inventory (free phase ~41 LOC vs forced-respond settlement ~165 LOC) plus the untouched Seam B remain — unlike the d9-05 rejection the dedupe did not drop the host out of strong, so the residual D9 content survives; the shared-7-locals reason is real but justify-band only; the target seam shape is a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
