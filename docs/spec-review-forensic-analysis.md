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

## 2026-05-17T00:00:00Z — T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link

- **Failure mode:** surface-expansion-irrecoverable
- **Trajectory:** 2,1,2
- **Score trajectory:** none vs S=n/a
- **Passes:** 3
- **Stage at exit:** 1 (3 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-16T23-05-10_ed2037`
- **Poisoned fixes:** spec-lens-consistency:01
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/t22a1-session-binding-contract-sub-section-in-pic-anchor-paraphrase-pi-source-ci.md` _(gitignored)_
- **Parked findings (this run):** `T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link, T22b — Multi-session contingency response is unspecified in Future Considerations, T22c — Pi version-bump procedure has no step for the session-binding contract, T15c — Lift Session-model scope deferrals into Non-goals (V1) section`
- **Loop notes:** Two-strikes surface-expansion exit. Trajectory: pass1 fixCount=2; pass2 fixCount=1 (T22c-owned checklist extension refused on ScopeGuard 2); pass3 fixCount=1 (line-804 self-trip rewording); original-pass4 fixCount=3 score-sum jump 1→3 triggered detector; backtrack-and-exclude with poison spec-lens-consistency:01; replayed pass3 fixCount=2 again triggered detector (2 > 1.5×1) → two-strikes. Severity p1{medium:2}/{medium:2}/{}/{}; p2{high:1,medium:1}/{high:1}/{medium:1}/{}; p3{medium:1,NIT:1}/{medium:1,NIT:1}/{}/{}. Stage trajectory: stage1=3. Root cause: T22a1 routes detection of the named cardinality-regression class through editorial review, which trips the PIC bump-procedure catch-all MUST at line 804 requiring a same-edit checklist extension. ScopeGuard 2 reserves that extension for T22c. Both available remediations are infeasible in scope; recommended reshaping: drop the "editorial review on the same footing" routing clause, merge T22a1 with T22c, or split T22a1 so the cardinality-routing claim is removed from this fix.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-17T00:46:41Z — T21 — Pi-side slash-handler promise lifecycle taken as given

- **Failure mode:** must-fix-blocked
- **Trajectory:** n/a
- **Score trajectory:** none vs S=25
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-17T00-26-01_25ea54`
- **Poisoned fixes:** n/a
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/t21-pi-side-slash-handler-promise-lifecycle-taken-as-given.md` _(gitignored)_
- **Parked findings (this run):** `T21 — Pi-side slash-handler promise lifecycle taken as given`
- **Loop notes:** Classifier exited on score-budget-exhausted (Change D); S=25, Σ=35, breach-margin=10, 3 non-blocker raised findings counted toward the budget (consistency medium=25, completeness low=5, implementability low=5). Per-pass severity p1 raised{medium:3,low:3} fixed{medium:2,low:1} deferred{} blocked{medium:1,low:2}; sub-rationale score-budget-exhausted; stage1=0. The score budget detector classifies T21's fix as introducing more critique surface than the originating finding admits — the originating finding's score (25) is small relative to the cumulative score (35) of raised side-findings on the first pass. Recommended human reshaping: either narrow T21 further (drop one of Path A vs Path B and inline that choice into the recommendation), or split T21 so each child finding's score budget exceeds its raised surface.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-17T03:19:02Z — T19e — Add real-time sibling emission timing paragraph

- **Failure mode:** diverging
- **Trajectory:** 8,4,3,2,2,3
- **Score trajectory:** 336,210,56,52,61,85 vs S=25
- **Passes:** 6
- **Stage at exit:** 1 (6 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-17T00-52-02_aa265e`
- **Poisoned fixes:** spec-lens-assumptions:01,spec-lens-assumptions:02,spec-lens-completeness:03,spec-lens-completeness:04,spec-lens-traceability:05
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/t19e-add-real-time-sibling-emission-timing-paragraph.md` _(gitignored)_
- **Parked findings (this run):** `T19e — Add real-time sibling emission timing paragraph`
- **Loop notes:** Diverged at pass 6 (fixCount 2→3) while still in stage 1; pass-6 fixes were classified but not applied. T19e licenses unbounded normative prose about emission timing — each clarification opens new edge-cases lenses flag (classic SP-1 paragraph-spending). stage1=6.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-17 — MULTI: T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph

- **Cluster mode (rec F):** yes
- **Cluster members:** 4
- **Failure mode:** must-fix-blocked
- **Trajectory:** n/a
- **Score trajectory:** n/a vs S=25
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-17T21-29-55_b555b7`
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md` _(gitignored)_
- **Parked findings (this run):** `T19a — Extend ActiveInvocationRegistry entry shape with invocationId, T19b — Add invocation_id field to RuntimeEvent payload declaration, T19d — Populate cancelled-by-session-shutdown details with invocation_id, T19e — Add real-time sibling emission timing paragraph`
- **Loop notes:** Cluster-mode (MULTI: T19a/T19b/T19d/T19e). Classifier exited on score-budget-exhausted (Change D clause 3): origin score S=25 (default-medium; heading absent from spec-review.md), cumulative non-blocker/non-cheap Σ=60 at exhaustion, breach margin = 35 — Σ landed at AF6 (medium, score=35) after AF4 (medium, score=25) had already saturated S. A blocker (AF1, high, score=100, must-fix:true — `RuntimeEvent.invocation_id` declared required with no contract for emission arms lacking a live registry entry) was classifiable as fix but suppressed by the budget-exhausted exit (precedence rule). Three SP-2 auto-deferred findings (AF2, AF3, AF5 — all targeting one of the three NarrowedChunks) did not enter the budget. AF7 (low, score=5) was not summed (exit fired at AF6). severity p1 raised{high:1,medium:5,low:1} fixed{} deferred{medium:3} blocked{high:1,medium:2}. stage1=0 (no pass completed; exit at classifier in step 3e-bis). narrowings=3+0 (3 seeded from task body's NarrowedChunks block; 0 added in-loop because no inner-fixer dispatch occurred). Snapshot refs retained for forensics.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-17T22:39:30Z — T18a — Append success-side null-policy paragraph to PIC Runtime event channel

- **Failure mode:** must-fix-blocked
- **Trajectory:** none
- **Score trajectory:** 30 vs S=25
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-17T21-58-00_d76119`
- **Poisoned fixes:** assumptions-implementability:01, traceability:02
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t18a-append-success-side-null-policy-paragraph-to-pic-runtime-event-channel.md` _(gitignored)_
- **Parked findings (this run):** `T18a — Append success-side null-policy paragraph to PIC Runtime event channel, T18d — Add V18q test asserting zero \`loom-system-note\` emissions on successful termination, T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy, T18b — Add per-mode operator-side null sentences to slash-invocation.md`
- **Loop notes:** Classifier exited score-budget-exhausted on the rewound pass-1 re-run; S=25, Σ=30, breach margin=5. Pre-rewind original pass-1 produced 2 fixes → pass-2 fan-out raised 10 fix-class findings tripping C2 surface-expansion detector. Backtracked, poisoned both pass-1 fixes; re-run pass-1 surfaced a high/must-fix=true consistency blocker (F3 — handler-frame contradiction between PIC and slash-invocation.md L18) plus two trust-override consistency fixes (F3, F4), two poisoned defers (F1, F2), one cheap-fix (F7), and two budget-breaching completeness findings (F5, F6). The originating T18a S=25 is too tight to absorb the persistence-domain ambiguity and the pre-evaluation-no-terminal-outcome carve-out gap; reshape (split, raise S, or pre-decide the persistence-domain quantifier and pre-start-teardown rule) before re-running. The surfaced consistency blocker (PIC vs. slash-invocation.md) is the higher-priority shape concern; if T18b/c/d are reshaped together, fold that contradiction in.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-18 — T16b — Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names

- **Failure mode:** diverging
- **Trajectory:** 4,1,0,1,0,4,1,1,4
- **Score trajectory:** 76,5,0,1,0,56,25,132,185 vs S=25
- **Passes:** 9
- **Stage at exit:** 3 (4 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-18T00-51-59_fcb4d7`
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t16b-rewrite-callable-set-paragraph-drop-inline-customtools-createagentsession-p.md` _(gitignored)_
- **Parked findings (this run):** `T16b — Rewrite callable-set paragraph: drop inline \`customTools\` / \`createAgentSession\` / \`pi.setActiveTools\` names`
- **Loop notes:** Diverged at pass 9 (fixCount jumped 1→4 outside stage-boundary). Pass 8 SP-2 mode (d) reverted docs/spec.md#scope to baseline-post-top-level; that revert plus PIC subagent visibility-pin sentence re-exposed latent concerns, raising 4 fix-class on pass 9 that were discarded. Bimodal recommendation (mechanism-vs-effect framing); a human should split it.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-18T02:35:33Z — T16a — Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal

- **Failure mode:** diverging
- **Trajectory:** 2,2,2,2,3
- **Score trajectory:** 125,30,30,10,55 vs S=25
- **Passes:** 5
- **Stage at exit:** 1 (5 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-18T02-35-33_baf647`
- **Poisoned fixes:** none
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t16a-reduce-trust-boundary-sdk-surface-clause-drop-the-0-72-1-literal.md` _(gitignored)_
- **Parked findings (this run):** `T16a — Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal`
- **Loop notes:** Loop diverged at pass 5 after four flat passes (2→3 fix-count). Trust-boundary bullet cycled through whack-a-mole shapes; scope guard forbids re-inlining SDK pin literal; PIC Host prerequisites doesn't own privilege claim. Reshape: split T16a from surviving-prose backing concern, or move privilege-absence claim to a PIC subsection that owns it before deleting inline backing.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---
