# Spec-review fix-loop forensic analysis — pi-loom

_Each entry below summarises one failed `/fix-spec-shape-single-findings`
iteration, with a pointer to the detailed forensic report under
`.pi/tmp/spec-fix-failure-forensics/` (gitignored — read it on demand;
it does not persist across worktree wipes)._

---

## 2026-05-16T17:58:00Z — T19d — Populate cancelled-by-session-shutdown details with invocation_id

- **Failure mode:** must-fix-blocked
- **Trajectory:** n/a
- **Score trajectory:** n/a vs S=100
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-16T17-57-27_ac79d7`
- **Poisoned fixes:** n/a
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/t19d-populate-cancelled-by-session-shutdown-details-with-invocation-id.md` _(gitignored)_
- **Parked findings (this run):** `T19d — Populate cancelled-by-session-shutdown details with invocation_id`
- **Loop notes:** Classifier early-exited on must-fix-blocked-by-scope-guard with 1 blocked finding (spec-lens-consistency merge of assumptions+consistency+implementability Finding 1: `entry.invocationId` reads in the new prose are unsourceable from the `ActiveInvocationRegistry` contract, which pins only `{loomAbort, disposeBarrier, shutdownReason, loom}` — no `invocationId` member). The originating finding's score S=100 (high importance, must-fix); cumulative sum Σ not computed because the early exit fires before per-pass scoring (n/a / n/a / n/a). The blocking remediations are mutually exhaustive and each foreclosed: adding `invocationId` to the registry entry shape is T19a's owned surface (guard 3); re-deriving at the emission site or via a parallel channel is forbidden by guard 1. T19d is therefore ordering-blocked behind T19a — a human must land T19a (or merge T19a/T19d into a single finding) before T19d can converge. severity p1 raised{high:1} fixed{} deferred{} blocked{high:1} (only the blocking finding was classified; 4 other raised findings remained unclassified per the classifier's "do not classify after early-exit" rule). stage1=0
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-16T19:05:00Z — T19b — Add invocation_id field to RuntimeEvent payload declaration

- **Failure mode:** diverging
- **Trajectory:** 6,3,0,4,4,5
- **Score trajectory:** 362,450,46,366,190,135 vs S=100
- **Passes:** 6
- **Stage at exit:** 2 (3 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-16T18-34-43_38775d`
- **Poisoned fixes:** spec-lens-consistency:01, spec-lens-assumptions:02, spec-lens-assumptions:03, spec-lens-consistency:04
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/t19b-add-invocation-id-field-to-runtimeevent-payload-declaration.md` _(gitignored)_
- **Parked findings (this run):** `T19b — Add invocation_id field to RuntimeEvent payload declaration`
- **Loop notes:** Divergence fired at pass 6 (fixCounts[-1]=5 > fixCounts[-2]=4 with both pass 6 and pass 5 outside stageBoundaryPasses). Severity trajectory: p1 raised{blocker:1,high:2,medium:2,NIT:2} fixed{blocker:1,high:2,medium:1,NIT:1} deferred{medium:1,NIT:1}; p2 raised{blocker:1,medium:3,low:0,NIT:0} fixed{blocker:1,medium:3} deferred{low:1}; p3-rerun raised{blocker:1,high:2,medium:6} fixed{high:0,medium:3} deferred{blocker:1,high:2,medium:3}; p3-converge(stage-1) raised{medium:2,low:1,NIT:1} fixed{} deferred{medium:2} ignored{low:1,NIT:1}; p4(stage-2 first) raised{high:3,medium:2,low:3,NIT:1} fixed{high:3,medium:1} deferred{medium:1,low:3,NIT:1}; p5 raised{high:1,medium:3,low:1} fixed{high:1,medium:2,low:1} deferred{low:1}; p6 raised{medium:5,low:2} fixed{medium:5,low:2} (DISCARDED un-applied per termination ordering) deferred{medium:1,low:1}. Surface-expansion detector fired once at pass 3 of original trajectory (scoreSum 362→181→381, 381>1.5×181); backtracked to pass-2 entry state and poisoned all 4 pass-2 fixes (tied on file overlap). Re-execution converged stage 1 at pass 3 (fixCount=0; advanced stage 1→2 with stageBoundaryPasses={3}). Stage 2 expanded the active lens set with placement/scope/external-entities at pass 4; subsequent passes accumulated structural placement findings asking to relocate cascade-twin MUSTs and dedup-tuple non-membership rules into the **Deduplication and lifetime rules** section — every such fix was refused per ScopeGuard 4 ([default] edit-only-within-RuntimeEvent-block) and ScopeGuard 2 (T19c-owned dedup-and-lifetime surface), causing the same placement findings to re-surface across passes 4/5/6 and ultimately to ramp fixCount from 4→4→5. Diagnosis: T19b's edit surface (the single field comment) is structurally insufficient to absorb the cascade-twin and dedup-tuple obligations that grew on it during the loop; the placement lens correctly identifies that those obligations belong in T19c's dedup-and-lifetime surface but T19c is parked. A human should reshape the originating Recommendation — either by widening T19b's scope guards to permit pre-installing the dedup-section bullets that T19c will own, or by parking T19b until T19c lands first and provides the natural landing zones for the cascade-twin verbatim-copy MUST and the dedup-tuple non-membership rule. Stage trajectory: stage1=3 stage2=3. Snapshot refs under refs/loom/snapshots/2026-05-16T18-34-43_38775d/{baseline,pass-1..pass-6} retained for forensics.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-16T23:00:00Z — T19a — Extend ActiveInvocationRegistry entry shape with invocationId

- **Failure mode:** limit-cycle
- **Trajectory:** 2,3,3,4,3
- **Score trajectory:** 125,150,55,77,86 vs S=100
- **Passes:** 5
- **Stage at exit:** 1 (5 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-16T21-03-03_7ca072`
- **Poisoned fixes:** spec-lens-completeness:03, spec-lens-traceability:05
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/t19a-extend-activeinvocationregistry-entry-shape-with-invocationid.md` _(gitignored)_
- **Parked findings (this run):** `T19a — Extend ActiveInvocationRegistry entry shape with invocationId`
- **Loop notes:** Limit-cycle on fixCounts trajectory [2,3,3,4,3] with last-4 window [3,3,4,3] non-monotone and all >0; divergence did not fire. Surface-expansion fired once on the original pass 4, poisoned spec-lens-completeness:03 and spec-lens-traceability:05, backtracked successfully, but pass 4 re-introduced a near-equivalent runtime-validation finding under a different NN slot that the classifier did not mark poisoned; applying it on pass 4 fed the limit-cycle on pass 5 as adjacent lenses (assumptions, completeness, traceability) emitted multiple ~25-score findings about the new validation clause's mechanism/scope/atomicity. Per-pass severity (raised/fixed/deferred/blocked): p1{high:1,medium:1}/{high:1,medium:1}/{}/{}; p2{high:1,medium:2}/{high:1,medium:2}/{}/{}; p3{medium:2,low:1}/{medium:2,low:1}/{}/{}; p4{medium:3,NIT:2}/{medium:2,NIT:1}/{NIT:1}/{}; p5{medium:3,low:2,NIT:1}/{medium:2,low:1}(DISCARDED)/{medium:1,low:1,NIT:1}/{}. Stage trajectory: stage1=5. Recommended human reshaping: narrow the originating T19a edit to omit enforceable MUSTs on the generator's return value (keep only the syntactic `invocationId: string` declaration plus a non-normative-illustrative generator example), or split T19a into smaller pieces.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---
