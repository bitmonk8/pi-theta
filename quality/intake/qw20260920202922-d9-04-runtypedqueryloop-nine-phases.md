---
id: pending
title: runTypedQueryLoop spans 305 LOC across nine phases, three of which repeat the same repair-outcome dispatch and terminal-error assembly
lens: D9
status: intake
verdict: pending
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
