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

## 2026-05-18T03:38:23Z — T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

- **Failure mode:** top-level-refused
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** `n/a` _(loop did not run)_
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t15a-reduce-session-model-orientation-paragraph-to-a-four-sentence-forward-linki.md` _(gitignored)_
- **Parked findings (this run):** `T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet`
- **Loop notes:** none
- **Fixer notes:** defer: precondition not met. T15a's Solution constraint requires T15b to land first (so the `Concurrency model` subsection exists as the relocation destination). T15c has landed but T15b is still pending in docs/spec-review.md and no `Concurrency model` subsection exists. Deferred without editing per the finding's explicit defer instruction.

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-18T03:45:00Z — T14 — Prompt-mode sequentiality argument has an unstated fourth premise

- **Failure mode:** must-fix-blocked
- **Trajectory:** 2,2
- **Score trajectory:** 50,150 vs S=n/a
- **Passes:** 2
- **Stage at exit:** 1 (2 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-18T03-42-25_ed094f`
- **Poisoned fixes:** n/a
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t14-prompt-mode-sequentiality-argument-has-an-unstated-fourth-premise.md` _(gitignored)_
- **Parked findings (this run):** `T14 — Prompt-mode sequentiality argument has an unstated fourth premise, T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection`
- **Loop notes:** must-fix-blocked-by-scope-guard. Pass-3 classifier merged six lens findings into one must-fix:true high (clause iv cites a "further rule" that doesn't exist in invocation.md Cross-mode semantics). Three remediation paths blocked by ScopeGuards 1 or 2 or matrix-coverage break. T14 likely needs reshape — either retire (subagent→prompt already discharged elsewhere) or land T15a/b/c paragraph restructure first.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-18 — T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls

- **Failure mode:** must-fix-blocked
- **Trajectory:** 0,0
- **Score trajectory:** none vs S=n/a
- **Passes:** 2
- **Stage at exit:** 3 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-18T07-18-35_8a7c91`
- **Poisoned fixes:** n/a
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t13-invocation-depth-bound-introductory-sentence-omits-the-cross-file-qualifier-.md` _(gitignored)_
- **Parked findings (this run):** `T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls`
- **Loop notes:** must-fix-blocked-by-scope-guard. Pass-3 classifier blocked one blocker (clarity/testability T1) — every remediation crosses the single [default] scope guard forbidding edits to the *countable-frame* paragraph. Reshape: relax the scope guard to permit a minimal `cross-file` definition, or split T13 to first install the definition then realign the three phrasing sites.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-18T00:00:00Z — T12 — Dual-cap simultaneous breach: `<cap>` value in `loom/load/discovery-slow` diagnostic is indeterminate

- **Failure mode:** diverging
- **Trajectory:** 3,3,2,1,0,1,2
- **Score trajectory:** 55,36,30,1,0,30,15 vs S=25
- **Passes:** 7
- **Stage at exit:** 2 (2 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-18T07-47-10_29ee83`
- **Poisoned fixes:** n/a
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t12-dual-cap-simultaneous-breach-cap-value-in-loom-load-discovery-slow-diagnosti.md` _(gitignored)_
- **Parked findings (this run):** `T12 — Dual-cap simultaneous breach: `<cap>` value in `loom/load/discovery-slow` diagnostic is indeterminate`
- **Loop notes:** Divergence at pass 7 (fixCounts 1→2 between p6 and p7). Pass-6 anchor-split introduced fresh critique surface; pass-7 fixes discarded. Originating T12 was addressed by top-level fixer; divergence is in the loop's own refinement. Reshape: move tie-break sub-rule into a sibling subsection under `## Package discovery`.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-18T16:54:56Z — T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a vs S=25
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-18T16-54-56_4e64a6`
- **Poisoned fixes:** n/a
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/t15b-move-concurrency-semantics-into-extension-architecture-implementation-notes.md` _(gitignored)_
- **Parked findings (this run):** `T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection`
- **Loop notes:** Classifier early-exit on `_blocked.md` sub-rationale `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate). S=25 (default — top-level fixer already removed T15b from `docs/spec-review.md` so classifier could not recover the originating `**Score:**`; sibling T15a/T14 both medium=25, consistent), Σ=260, breach-margin=235 (Σ/S ≈ 10.4×, well above k=3 multiplier). 6 non-blocker non-cheap raised findings counted toward budget; all 6 would have qualified for trust-override absent the Rec O gate. Breakdown by lens/tier: AF-1 spec-lens-consistency high/100 (same-document duplication — explicitly covered by forwarded scope guard but per Rec O still counts toward Σ_shadow), AF-2 spec-lens-traceability high/100 (8+ obligations under single `#concurrency-model` anchor), AF-3 spec-lens-assumptions+traceability medium/25 (clause (i) mis-pinning + fragmentless link), AF-4 spec-lens-assumptions medium/25 (closed-world "only" claim unexhausted by corpus), AF-5 spec-lens-prescription low/5 (mechanism-anchored top sentence via `pi.setActiveTools`), AF-6 spec-lens-assumptions low/5 (unpinned event-loop assumption). Even excluding AF-1 under scope-guard guidance, residue Σ=160 > 3×S=75 still exceeds gate; reshape — not further inner-loop iteration — is the correct disposition. severity p1 raised{high:2,medium:2,low:2} fixed{} deferred{} blocked{high:2,medium:2,low:2}; stage1=1; narrowings=0+0+0+0; stage1Touched=0 mode-e-refusals=0. Snapshot refs under `refs/loom/snapshots/2026-05-18T16-54-56_4e64a6/*` retained for forensics (baseline, baseline-post-top-level, pass-1). Zero `spec-diff-fixer` dispatches occurred; working tree unchanged from loop entry; outer prompt MUST NOT commit and should route the heading to forensics + parker per the `must-fix-blocked` branch.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-18T17:17:38Z — T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

- **Failure mode:** stale-precondition
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a
- **Poisoned fixes:** n/a
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/t15a-reduce-session-model-orientation-paragraph-to-a-four-sentence-forward-linki.md` _(gitignored)_
- **Parked findings (this run):** `T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet`
- **Loop notes:** Rec M: detected 2 stale ordering prediction(s) in ## Solution constraints. "T15b and T15c MUST have already landed before this finding is addressed": predicted T15b had already landed, actual T15b was parked in docs/spec-review-parked.md in the immediately-preceding orchestrator iteration (FailureMode: must-fix-blocked, Category 1) and the `Concurrency model` subsection it was supposed to install in docs/spec.md is absent — `grep -n 'concurrency-model\|Concurrency model' docs/spec.md` returns no matches. "bottom-up ordering guarantees this: T15c at the highest line number is addressed first, T15b second, this finding T15a last": predicted T15c existed at a higher line in docs/spec-review.md and would be addressed before T15a, actual T15c does not appear in docs/spec-review.md or docs/spec-review-parked.md (no `^# T15c` match in either file — either already resolved in a prior run or never authored). The constraint itself says "If either the Concurrency model subsection installed by T15b or the V1 non-goals entries verified by T15c is absent at edit time, defer" — its own escape clause fires. Orchestrator parked T15a pre-dispatch without invoking spec-review-fixer or spec-diff-fix-loop.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-18 — MULTI: T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph

- **Cluster mode (rec F):** yes
- **Cluster members:** 4
- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a vs S=25
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-18T19-24-02_4c2521`
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md` _(gitignored)_
- **Parked findings (this run):** `T19a — Extend ActiveInvocationRegistry entry shape with invocationId, T19b — Add invocation_id field to RuntimeEvent payload declaration, T19d — Populate cancelled-by-session-shutdown details with invocation_id, T19e — Add real-time sibling emission timing paragraph`
- **Loop notes:** Classifier exited pre-dispatch on Rec O pass-level shadow-budget gate; sub-rationale=score-budget-exhausted-trust-override-suppressed (S=25 from MULTI cluster T19a/T19b/T19d/T19e under rec K heading-absent default — all four members absent from spec-review.md and spec-review-parked.md and not recoverable via available tools, so medium / S=25 / must-fix=false applied; Σ_shadow=150, breach-multiplier=6.0× over S and 2.0× over k×S=75, k=3; 6 raised findings would have classified fix-via-trust-override absent the gate). severity p1 raised{medium:6} fixed{} deferred{} blocked{medium:6}; no spec-diff-fixer dispatched, working tree unchanged from loop entry. stage1=0 (classifier exit predates any pass-completion accounting). narrowings=2+0+0+0 (seeded NarrowedChunks: PIC#diagnostic-emission-isolation + diagnostics.md#session-shutdown-details-conventions; no in-loop additions because no fixer dispatch). stage1Touched=0 mode-e-refusals=0. Snapshot namespace retained for forensics. Reshape options per _blocked.md: split T19e (real-time sibling emission timing paragraph) out as its own top-level fix (AF2+AF4+AF5+AF6 = 100/150 score concentrate there), raise the cluster's authored score/importance (current S=25 is the heading-absent default — recovering original member metadata from git is the prerequisite), or narrow the T19e Solution approach (drop arrival-order claim, defer anchor/split structural fix, restate timing in terms of sendSystemNote chain rather than pi.sendMessage directly).
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-18T21:48:22Z — T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 6,8
- **Score trajectory:** none vs S=25
- **Passes:** 2
- **Stage at exit:** 1 (2 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-18T20-40-42_a4d5c3`
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t11a-replace-consumes-one-slot-prose-with-explicit-forced-respond-exemption-rule.md` _(gitignored)_
- **Parked findings (this run):** `T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule, T11c — V6k normative test vector for ``max_rounds: 0`` typed query, T11b — V6k counting-formula tighten: forced respond outside the budget`
- **Loop notes:** Classifier exited on `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate). S=25, Σ_shadow=211, breach margin=186, multiplier=8.44 (k=3 gate). 9 non-blocker raised findings counted toward shadow budget (all 9 would have been trust-overridden to fix under per-finding rules); 4 additional blocker `must-fix:true` raised findings listed in `_blocked.md` for forensic context but pre-empted by gate. The classifier's `_blocked.md` flags that the origin defaulted to S=25 (medium) because T11a's heading was already removed from `docs/spec-review.md` by the top-level fixer and no git-recovery tool is available in the classifier context; T11a's cluster siblings T11b/T11c are both `Importance: high` / `score:100`, and under a recovered S=100 the shadow-multiplier would be 2.11 (below k=3) and per-finding classification would have proceeded normally — surfacing this as a likely category-1 reshape false-positive that the outer prompt may want to re-dispatch with the recovered score. Pass 3 contributed no fixCount (classifier exited pre-dispatch). severity p1 raised{high:4,medium:3} fixed{high:4,medium:2} deferred{medium:1} blocked{}; p2 raised{blocker:1,high:3,medium:1,low:1,NIT:2} fixed{blocker:1,high:3,medium:1,low:1,NIT:2} deferred{} blocked{}; p3 raised{high:4,medium:7,low:1,NIT:1} fixed{} deferred{} blocked{high:4,medium:7,low:1,NIT:1}. stage1=2 (cumulative all passes ran in stage 1; stage 2/3 never reached). narrowings=0+0+0+0. stage1Touched=9 mode-e-refusals=0. Snapshot refs under `refs/loom/snapshots/2026-05-18T20-40-42_a4d5c3/*` (baseline, baseline-post-top-level, pass-1, pass-2, pass-3) retained for forensics.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-19T00:00:00Z — T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 3
- **Score trajectory:** 36 vs S=25
- **Passes:** 1
- **Stage at exit:** 1 (1 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-18T21-54-04_ebb668`
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t10-single-string-bypass-behaviour-on-whitespace-only-absent-slash-argument-is-u.md` _(gitignored)_
- **Parked findings (this run):** `T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified`
- **Loop notes:** Classifier exit on pass 2 via Rec O pass-level shadow-budget gate; sub-rationale=score-budget-exhausted-trust-override-suppressed, 5 blocked findings. Budget triple: S=25 (defaulted — T10 heading already removed from spec-review, default medium→25), Σ_shadow=81, k=3, k×S threshold=75, breach margin over gate = 6 (Σ_shadow−k×S), breach margin over S = 56. 4 of 5 findings carried non-trivial Trust impact entries that would have classified as fix-via-trust-override absent the gate (suppression count=4). Pass 1 applied 3 fixes (whitespace-alphabet pin in slash-invocation.md, enum/const carve-out of single-string bypass in binder.md+glossary.md+diagnostics.md, link-text rewrite in binder.md) and deferred 1 atomicity finding to debt register. Pass 2's lens fan-out then surfaced 5 net-new findings concentrated on the surfaces pass 1 widened: the new `String.prototype.trim()` parenthetical (prescription/API-name nudge), the one-sided "shared with single-string bypass equivalence" cross-document claim (consistency/assumptions/completeness all flagging the same dangling pin), two PIC sites (`pi-integration-contract.md` L12/L787) now drifting from binder.md's 4-element bypass criterion (cross-spec consistency), the "field's schema" source-vs-lowered ambiguity (implementability), and bullet 2's now-three-obligation bundling under one tag (traceability). severity p1 raised{low:2,NIT:1,medium:1} fixed{low:2,NIT:1} deferred{medium:1} blocked{}; p2 raised{medium:3,low:1,NIT:1} fixed{} deferred{} blocked{medium:3,low:1,NIT:1}; stage1=1; narrowings=0+0+0+0; stage1Touched=4 mode-e-refusals=0. Reshape guidance from `_blocked.md`: T10 was defaulted to S=25 because the heading was already removed from spec-review.md by the top-level fixer (no in-flight metadata available); if T10's actual score was higher than 25 the budget is artificially tight and recovering its real score is the cheapest fix.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-19T00:00:00Z — T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file

- **Failure mode:** surface-expansion-irrecoverable
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 1,1,0,0,3,1,5
- **Score trajectory:** 25,1,0,0,11,1,37 vs S=25
- **Passes:** 7
- **Stage at exit:** 3 (3 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-18T22-27-20_00a21e`
- **Poisoned fixes:** naming:01
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t09-bind-context-session-overview-bullet-uses-tilde-approximate-caps-that-contra.md` _(gitignored)_
- **Parked findings (this run):** `T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file`
- **Loop notes:** severity p1 raised{medium:1} fixed{medium:1}; p2 raised{NIT:1} fixed{NIT:1}; p3 raised{} fixed{}; p4 raised{} fixed{}; p5 raised{low:2,NIT:1} fixed{low:2,NIT:1}; p6 raised{NIT:1} fixed{NIT:1}; p7(re) raised{medium:1,low:2,NIT:2} fixed{} (discarded un-applied at exit); stage1=3 stage2=1 stage3=3; narrowings=0+0+0+0; stage1Touched=1 mode-e-refusals=0. Surface-expansion detector fired on pass 8 (scoreSum 30 vs pass-7 score 1; ratio 30×); backtracked to pass-7 snapshot, poisoned `naming:01`. Pass 7 re-executed with naming:01 excluded; lenses surfaced 5 new findings, scoreSum jumped to 37. Second consecutive backtrack-and-exclude trigger → exit `surface-expansion-irrecoverable`. The originating T09 finding's Solution approach (replace inline tilde-approximate caps with a forward-link deferral, plus rewrite the trailing non-normative clause to drop "fully specified above") creates a structural fanout: every stage-3 phrasing variant of the rewritten bullet+note pair attracts a new combination of clarity/naming/traceability/consistency lens findings. Snapshot refs under `refs/loom/snapshots/2026-05-18T22-27-20_00a21e/` retained for forensics.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-19T00:00:00Z — T07 — `QueryError.message` content has no normativity rule

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 2,4
- **Score trajectory:** 126,40,110 vs S=25
- **Passes:** 2
- **Stage at exit:** 1 (2 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-19T01-26-08_864cd3`
- **Poisoned fixes:** none
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t07-queryerror-message-content-has-no-normativity-rule.md` _(gitignored)_
- **Parked findings (this run):** `T07 — `QueryError.message` content has no normativity rule`
- **Loop notes:** Sub-rationale=score-budget-exhausted-trust-override-suppressed (Rec O pass-level shadow-budget gate); S=25, Σ_shadow=110, breach-margin=85, k×S=75, 4 findings would have been classified as fix-via-trust-override absent the gate. Pass-3 classifier exit, 7 raised findings on pass 3 all blocked; blocker A names a real consistency contradiction (closed "V1 pinning surface exhausted by single entry" framing introduced in pass-2 contradicts pre-existing `ValidationError.message = "rendered query template is empty"` pin at `docs/spec_topics/query.md:98`). Pass-2's enumeration-closure fix solved pass-1's prescription/assumptions/completeness lens cluster but generated a higher-residue surface than T07's default score=25 budget can absorb. Reshape required: either raise T07's authored score (high→100), split T07 into per-axis atoms, or narrow the Solution approach to install only the audience claim. severity p1 raised{high:1,medium:1,NIT:1} fixed{high:1,NIT:1} deferred{medium:1}; p2 raised{medium:1,low:3} fixed{medium:1,low:3}; p3 raised{high:1,medium:4,low:2} fixed{} blocked{high:1,medium:4,low:2}; stage1=3.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-19T02:06:34Z — T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 3,3
- **Score trajectory:** 80,31 vs S=25
- **Passes:** 2
- **Stage at exit:** 1 (2 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-19T02-06-34_6b644e`
- **Poisoned fixes:** n/a
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t06-operator-role-tui-binding-asserted-in-glossary-but-never-reconciled-with-non.md` _(gitignored)_
- **Parked findings (this run):** `T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers`
- **Loop notes:** Classifier exited on must-fix-blocked / score-budget-exhausted-trust-override-suppressed (Rec O pass-level shadow-budget gate) at pass 3 with 6 blocked findings. S=25, Σ_shadow=106, k×S=75. Originating finding's defaulted S=25 is structurally insufficient for the residue the Solution approach generates. Reshape options: raise origin score, split T06 into per-axis atoms (glossary-side definition narrowing; overview-side enumeration sync; FC-side anchor coverage), or narrow the Solution approach to drop the cross-page consumer-enumeration sync.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-19T02:54:58Z — T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

- **Failure mode:** surface-expansion-irrecoverable
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 1,1,2,3
- **Score trajectory:** 1,1,26,51 vs S=25
- **Passes:** 4
- **Stage at exit:** 1 (4 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-19T02-54-58_ae06a2`
- **Poisoned fixes:** spec-lens-assumptions:03, spec-lens-traceability:01
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t05-bind-frontmatter-vs-binder-binder-settings-diagnostics-prose-root-word-incon.md` _(gitignored)_
- **Parked findings (this run):** `T05 — bind_* (frontmatter) vs binder* / binder-* (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept`
- **Loop notes:** Surface-expansion-irrecoverable two-strikes exit. The originating Recommendation's two-site authoring (glossary + Naming-convention sentence) creates a recurring critique surface: each rewrite attracts canonical-home / rationale-promise / family-scope / anchor-precision findings the scope guard prevents resolving cleanly. Reshape required: split so canonical-home declaration and per-surface mapping are authored as one unit (no two-site duplication) and explicitly scope to binder-model concept alone (not "binder-related frontmatter family" — bind-context-* / bind-echo-* diagnostic-code surfaces use different patterns).
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-19T00:00:00Z — T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 2
- **Score trajectory:** 130,132 vs S=25
- **Passes:** 1
- **Stage at exit:** 1 (1 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-19T04-07-35_dac2e6`
- **Poisoned fixes:** none
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t03a-add-loom-package-implementation-dependencies-v1-sub-paragraph-in-pic-host-p.md` _(gitignored)_
- **Parked findings (this run):** `T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`, T03f — `h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph; extend `engines.node` literal-read test to cross-package equality, T03c — Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs, T03b — Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`, T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test, T03d — Update PIC Pi version-bump procedure step 3: replace manual-compare instruction with H1-test-fails-red narrative`
- **Loop notes:** must-fix-blocked sub-rationale score-budget-exhausted-trust-override-suppressed at pass 2 classifier; S=25 (default — heading absent at classification time), Σ_shadow=132, breach-multiplier 5.28×; 7 of 8 raised findings target the new sub-paragraph at line 17. Reshape paths: split by axis (literal-vs-behavioural surface; anchor-stability; cross-reference target) and/or narrow the approach to forbid embedding implementation literals in a behavioural host-contract document.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-19T00:00:00Z — T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a vs S=25
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-19T10-54-34_d30c6e`
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t03e-update-spec-md-host-runtime-item-1-rephrase-to-delegate-the-engines-node-eq.md` _(gitignored)_
- **Parked findings (this run):** `T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test, T03b — Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`, T03d — Update PIC Pi version-bump procedure step 3: replace manual-compare instruction with H1-test-fails-red narrative`
- **Loop notes:** Classifier early-exit on pass 1 via Rec O pass-level shadow-budget gate; sub-rationale score-budget-exhausted-trust-override-suppressed; S=25 (T03e heading absent from spec-review.md, defaulted from cluster siblings T03b/T03c/T03d carrying Importance=medium → score 25), Σ_shadow=101, breach margin Σ_shadow−S=76 (multiplier ≈ 4.04× exceeds k=3 gate threshold of 75); 2 non-blocker raised findings counted toward shadow budget, 1 trust-overridden; 7 tier-1 lenses dispatched, 4 silent, 3 raised (assumptions/consistency/implementability merged per triage Step 1.5 into Finding A high:1 with trust-override impact entry on reader mental-model of cross-package Pi engines.node gating; traceability raised Finding B NIT:1 on bare-paraphrase cross-reference style). severity p1 raised{high:1,NIT:1} fixed{} deferred{} blocked{high:1,NIT:1}; stage1=1; narrowings=0+0+0+0; stage1Touched=0 mode-e-refusals=0. Originating T03e finding admits three reshape paths per classifier hints: raise T03e's score to ~100..125, narrow Solution approach to the revert option ("matching ... floor"), or split into verifier-naming + hyperlink-style axes. Snapshot refs retained for forensics under refs/loom/snapshots/2026-05-19T10-54-34_d30c6e.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---
## 2026-05-19 — T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 4
- **Score trajectory:** 145 vs S=25
- **Passes:** 1
- **Stage at exit:** 1 (1 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-19T12-13-42_29db80`
- **Poisoned fixes:** none
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md` _(gitignored)_
- **Parked findings (this run):** `T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy, T18a — Append success-side null-policy paragraph to PIC Runtime event channel, T19a — Extend ActiveInvocationRegistry entry shape with invocationId, T19b — Add invocation_id field to RuntimeEvent payload declaration, T19d — Populate cancelled-by-session-shutdown details with invocation_id, T19e — Add real-time sibling emission timing paragraph, T18b — Add per-mode operator-side null sentences to slash-invocation.md`
- **Loop notes:** Sub-rationale score-budget-exhausted-trust-override-suppressed (Rec O pass-level shadow-budget gate). S=25, Σ_shadow=76, breach margin Σ-S=51 (multiplier ≈ 3.04× exceeds k=3 threshold of 75 by 1 point); 3 would-be trust-override admissions on pass 2 counted toward shadow budget. T18c heading absent from spec-review.md (top-level fixer already removed it); classifier defaulted to severity=medium / S=25 / mustFix=false per heading-absent lookup rule. Severity tally: p1 raised{high:1,medium:1,low:2} fixed{high:1,medium:1,low:2} deferred{} blocked{}; p2 raised{high:1,medium:3,NIT:1} fixed{} deferred{} blocked{high:1,medium:3,NIT:1} (the blocker is a cross-page contract contradiction Pass-1 fixes introduced: the prompt-mode Ok(v) "audience" parenthetical at docs/spec.md L52 inverts slash-invocation.md L19's normative contract that the Ok return value is NOT surfaced to the user). Stage trajectory: stage1=1. Narrowings tally: narrowings=0+0+0+0. Stage-transition tally: stage1Touched=1 mode-e-refusals=0. Snapshot namespace refs/loom/snapshots/2026-05-19T12-13-42_29db80 retained (baseline, baseline-post-top-level, pass-1, pass-2) for forensics.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---


## 2026-05-19 — T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

- **Failure mode:** top-level-refused
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a vs S=n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t15a-reduce-session-model-orientation-paragraph-to-a-four-sentence-forward-linki.md` _(gitignored)_
- **Parked findings (this run):** `T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet`
- **Loop notes:** none
- **Fixer notes:** must-fix-blocked-by-deferred-precondition: Solution constraint #3 explicitly directs deferral when the Concurrency model subsection (owned by T15b) is absent from `## Extension Architecture` in `docs/spec.md`. Current state: T15b is unresolved (still present in `docs/spec-review.md` at line 126) and the Concurrency model subsection does not exist (grep for `Concurrency model` returns only the existing Session-model paragraph text itself). The defer-trigger is firing as designed. Narrowing-refused rationale: constraint #3 cannot be narrowed under the three-mode authoring guard. f-stop-2 (co-resolve peer territory): T15b's named edit surface is the relocation of the architectural clauses (mode-qualified isolation, prompt-mode sequentiality premises i/ii/iii, genuine-concurrency conclusion, cancellation-propagates-downward, per-invocation budget scoping, no-admission-cap) into the new Concurrency model subsection. Deleting those clauses from the Session-model paragraph now would consume T15b's source material before T15b authors the destination, crossing T15b's territory. No other remediation site exists for the Problem's residue. Staleness bypass does not apply: the constraint's structural-ordering prediction ("Concurrency model subsection has landed") is unfulfilled, not falsified by re-shaping. The orchestrator should re-dispatch T15a only after T15b resolves.

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-19 — T16b — Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 2,0,0,5
- **Score trajectory:** 105,5,25,21,115 vs S=25
- **Passes:** 4
- **Stage at exit:** 3 (1 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-19T13-06-44_a5fe87`
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t16b-rewrite-callable-set-paragraph-drop-inline-customtools-createagentsession-p.md` _(gitignored)_
- **Parked findings (this run):** `T16b — Rewrite callable-set paragraph: drop inline customTools / createAgentSession / pi.setActiveTools names, T16e — PIC step 2 internal contradiction: literal pi.setActiveTools([...snapshot, ...names]) call shape vs natural-language "exactly the loom's declared callable set"`
- **Loop notes:** must-fix-blocked sub-rationale=score-budget-exhausted-trust-override-suppressed (Rec O pass-level shadow-budget gate); S=25, Σ_shadow=115, breach margin Σ−k·S=40 (multiplier 4.6× vs k=3 threshold 75). 5 raised findings counted toward the exhausted shadow budget on pass 5 (all targeting docs/spec.md#scope, the chunk already in NARROWED_CHUNKS — every finding would have been deferred under b-bis approach-narrowed absent the Rec O gate, so 0 trust-override-counted findings; gate fired on bare-residue grounds). severity p1 raised{high:1,low:1} fixed{high:1,low:1} deferred{} blocked{}; p2 raised{low:1} fixed{} deferred{low:1} blocked{}; p3 raised{medium:1} fixed{} deferred{medium:1} blocked{}; p4 raised{low:4,NIT:1} fixed{low:4,NIT:1} deferred{} blocked{}; p5 raised{medium:4,low:1} fixed{} deferred{} blocked{medium:4,low:1}. stage1=2 stage2=1 stage3=2 (pass 5 lens fan-out + classifier ran but exited before fixCount increment; counted in stage-3 attempt total). narrowings=0+1+0+0 (one in-loop approach-narrowing on docs/spec.md#scope via inner-fixer (d) refusal during pass 4 fix-05; the revert to baseline-post-top-level undid pass-1's high-severity union-with-snapshot fix and pass-1's swap-window rename, restoring exactly the residue the lens fleet then re-discovered as 5 raised findings on pass 5). stage1Touched=1 mode-e-refusals=0.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---


## 2026-05-19 — T13b — Invocation depth bound: propagate the `cross-file` qualifier to the introductory paragraph and the V18n leaf

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** none
- **Score trajectory:** none vs S=25
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-19T14-26-52_102877`
- **Poisoned fixes:** none
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t13b-invocation-depth-bound-propagate-the-cross-file-qualifier-to-the-introducto.md` _(gitignored)_
- **Parked findings (this run):** `T13b — Invocation depth bound: propagate the cross-file qualifier to the introductory paragraph and the V18n leaf, T13a — Define the cross-file qualifier in the *countable-frame* paragraph of invocation.md`
- **Loop notes:** Sub-rationale: must-fix-blocked-by-scope-guard; 1 blocked finding (spec-lens-assumptions, raised=high, score=100, must-fix=true) whose only viable remediation — adding a one-sentence in-paragraph `cross-file` clarifier to the `invocation.md` L79 *countable-frame* paragraph — would (i) author a normative convention about `cross-file` `.warp` `fn` dispatch in direct violation of guard 2 and (ii) encroach on T13a's reserved definition site per guard 1. The inverse rewrite (removing the qualifier from L77 and L394) is a same-issue restatement of the very edit the outer loop just made. Origin T13b heading absent from current docs/spec-review.md (top-level fixer already deleted it post-resolution); classifier defaulted origin importance to medium / S=25 per heading-absent lookup rule; sibling T13a carries importance=high / score=100 in live spec-review.md. Severity p1 raised{high:1,medium:2} fixed{} deferred{} blocked{high:1}. stage1=0. narrowings=0+0+0+0. stage1Touched=0 mode-e-refusals=0. Snapshot refs retained under refs/loom/snapshots/2026-05-19T14-26-52_102877/{baseline,baseline-post-top-level,pass-1} for forensics; reshape menu per _blocked.md: (a) raise T13b score in spec-review.md to admit the clarifier within budget, (b) re-scope T13b to own the definition site (merge with T13a or split T13a's obligation back in), or (c) relax guard 2 to admit the one-sentence L79 clarifier while keeping the propagation-site restating prohibition (guard 1) intact.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-19 — T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 2,2
- **Score trajectory:** 50,51 vs S=25
- **Passes:** 2
- **Stage at exit:** 1 (2 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-19T17-27-20_cbd159`
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-19T17-23-50_9cbe86/t05-bind-frontmatter-vs-binder-binder-settings-diagnostics-prose-root-word-incon.md` _(gitignored)_
- **Parked findings (this run):** `T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept`
- **Loop notes:** severity p1 raised{medium:2} fixed{medium:2}; p2 raised{medium:2,NIT:1} fixed{medium:2} deferred{NIT:1}; p3 raised{medium:3,low:1,NIT:1} blocked{medium:3,low:1,NIT:1}. Classifier exited on pass 3 with sub-rationale `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate): S=25, Σ=Σ_shadow=81 across 5 non-blocker raised findings (multiplier 3.24× vs k=3 threshold of 75), breach margin Σ-S=56; 4 of the 5 findings would have been admitted via per-finding trust override absent the gate. Heading T05 was absent from live `docs/spec-review.md` (top-level fixer removed it post-resolution) — classifier defaulted to medium / S=25 / mustFix=false per heading-absent-default rule. No mode (d) / (e) / (f) / (g) refusals fired. stage1=3 narrowings=0+0+0+0 stage1Touched=2 mode-e-refusals=0.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-19T22:41:00Z — T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a vs S=25
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-19T20-27-38_67ad0d`
- **Poisoned fixes:** n/a
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-19T17-23-50_9cbe86/t06-operator-role-tui-binding-asserted-in-glossary-but-never-reconciled-with-non.md` _(gitignored)_
- **Parked findings (this run):** `T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers`
- **Loop notes:** Sub-rationale: score-budget-exhausted-trust-override-suppressed (Rec O pass-level shadow-budget gate). Origin S=25 (medium, default per heading-absent fallback — T06 already removed from spec-review.md by outer-loop fixer; classifier could not reach prior HEAD); Σ_shadow=107; k=3; k×S=75; breach-margin=Σ_shadow−k×S=32; breach-multiplier Σ_shadow/S=4.28×; 7 non-blocker/non-cheap raised findings counted toward shadow budget, of which 5 would have been classified fix-via-trust-override absent the gate. severity p1 raised{medium:4,low:1,NIT:2} fixed{} deferred{} blocked{medium:4,low:1,NIT:2}. Stage trajectory stage1=0 (classifier exited pre-fix-application; pass 1 never completed). narrowings=0+0+0+0. stage1Touched=0 mode-e-refusals=0. No blocker / must-fix findings; gate fires entirely on shadow-budget arithmetic. Reshape paths per _blocked.md: raise T06 score to ≥107 (or set must-fix:true), split T06 into per-axis atoms (TUI binding / non-interactive carve-out / always-present implication), or narrow T06 Solution approach to drop the closed-enumeration framing and always-present parenthetical that drive the assumptions/consistency residue.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-20T09:11:15Z — T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

- **Failure mode:** surface-expansion-irrecoverable-bimodal
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 6,2,3,4,3
- **Score trajectory:** 161,26,11,26,40 vs S=25
- **Passes:** 5
- **Stage at exit:** 1 (5 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-20T08-01-15_fb235c`
- **Poisoned fixes:** spec-lens-completeness:02, spec-lens-consistency:01
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-20T06-38-04_bf2b2b/t05-bind-frontmatter-vs-binder-binder-settings-diagnostics-prose-root-word-incon.md` _(gitignored)_
- **Parked findings (this run):** `T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept`
- **Loop notes:** Surface-expansion-irrecoverable-bimodal at two-strikes — the originating T05 Solution approach pinned a single-canonical-home design (back-reference-only glossary entry pointing at the *Naming convention* paragraph in frontmatter.md) but the pass-1 traceability fix (fix-06) extracted the binder-model rule into a new `<a id="binder-model-root-word-delta">` sub-paragraph, creating a no-canonical-home rule situation between two viable owners of the per-surface mapping; pass-2's consistency fix then committed to the new home by re-pointing the glossary, after which the bimodal approach left the spec with a back-reference target that lenses kept re-critiquing on every subsequent pass. Trust-override classifier on pass-3-rerun kept three pre-refused scope-guard-fenced findings as fix-class even after the poisoned fix was excluded, because the structural ambiguity itself — not the reframe — is the load-bearing defect. stage1=5. Snapshots retained under refs/loom/snapshots/2026-05-20T08-01-15_fb235c/* for forensics. OriginArtefactDir: c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T07-57-26_a66fd9/_origin. Category: 1.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-20T10:38:06Z — T16e — PIC step 2 internal contradiction: literal `pi.setActiveTools([...snapshot, ...names])` call shape vs natural-language "exactly the loom's declared callable set"

- **Failure mode:** diverging
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 1,3,1,1,2
- **Score trajectory:** 100,37,126,76,7 vs S=100
- **Passes:** 5
- **Stage at exit:** 1 (5 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-20T10-38-06_88f1f7`
- **Poisoned fixes:** none
- **Forensic report:** `c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-20T06-38-04_bf2b2b/t16e-pic-step-2-internal-contradiction.md` _(gitignored)_
- **Parked findings (this run):** `T16e — PIC step 2 internal contradiction: literal pi.setActiveTools([...snapshot, ...names]) call shape vs natural-language "exactly the loom's declared callable set", T16b — Rewrite callable-set paragraph: drop inline customTools / createAgentSession / pi.setActiveTools names`
- **Loop notes:** T16e originating contradiction resolved on pass 1 (chose branch (b) snapshot-replaced). Pass 5 raised 2 net-new tier-1 traceability fixes on just-added in-page anchors (over-coverage / no structural terminus) — divergence detector fired (fixCount 1→2 at pass 5). Originating PIC step-2 reconciliation is stable and correct, but the frontmatter-side anchor-quality tail (added in passes 3+4) generates more critique surface than each fix closes — needs human reshaping (cap on per-fix anchor-restructuring obligations, or pre-author the obligation-per-anchor structure at top-level so the tail does not re-enter the loop). stage1=5; narrowings=0+1+0+0; stage1Touched=1 mode-e-refusals=0. OriginArtefactDir: c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T10-34-06_198940/_origin. Category: 2.
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-20T12:04:03Z — T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

- **Failure mode:** top-level-refused
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** `n/a` _(or `n/a` if loop did not run)_
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-20T06-38-04_bf2b2b/t15a-reduce-session-model-orientation-paragraph.md` _(gitignored)_
- **Parked findings (this run):** `T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet`
- **Loop notes:** none
- **Fixer notes:** Deferred per Solution constraint #3. The destination `Concurrency model` subsection (owned by T15b) is absent from `## Extension Architecture` in `docs/spec.md`, and T15b is still pending in `docs/spec-review.md`. T15a/T15b/T15c form a co-resolve cluster; T15b is the binding prerequisite (T15c already resolved). OriginArtefactDir: c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T11-59-29_13ffa4/_origin. Category: 1.

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-20T16:01:36Z — T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

- **Failure mode:** stale-precondition
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a vs S=n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** `n/a` _(loop did not run)_
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-20T16-01-36_59fbed/t15a-reduce-session-model-orientation-paragraph-to-a-four-sentence-forward-linki.md` _(gitignored)_
- **Parked findings (this run):** `T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet`
- **Loop notes:** Rec M: detected 1 stale ordering prediction(s) in ## Solution constraints. "If the `Concurrency model` subsection (owned by T15b) is absent from `## Extension Architecture` in `docs/spec.md` at edit time, defer": predicted T15b's Concurrency model subsection authored, actual T15b still live in spec-review.md at line 131 (its Concurrency model subsection has not yet been installed).
- **Fixer notes:** none

---

## 2026-05-20T17:21:16Z — T16e — PIC step 2 internal contradiction: literal `pi.setActiveTools([...snapshot, ...names])` call shape vs natural-language "exactly the loom's declared callable set"

- **Failure mode:** surface-expansion-irrecoverable-bimodal
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 1,0,1,1
- **Score trajectory:** 100,0,5,25 vs S=100
- **Passes:** 4
- **Stage at exit:** 2 (2 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-20T17-21-16_a2759f`
- **Poisoned fixes:** assumptions:01, traceability:01, placement:01, consistency:01
- **Forensic report:** `/c/UnitySrc/pi-loom/.pi/tmp/spec-fix-failure-forensics/2026-05-20T16-01-36_59fbed/t16e-pic-step-2-internal-contradiction-literal-pi-setactivetools-snapshot-name.md` _(gitignored)_
- **Parked findings (this run):** `T16e — PIC step 2 internal contradiction: literal pi.setActiveTools([...snapshot, ...names]) call shape vs natural-language "exactly the loom's declared callable set"`
- **Loop notes:** Surface-expansion two-strikes exit (sub-variant surface-expansion-irrecoverable-bimodal, CATEGORY 1). T16e's Solution approach is bimodal ("Either (a) snapshot-union or (b) snapshot-replaced"); the top-level fixer picked shape (b), and every loop iteration that added prose to justify the snapshot-replaced semantics attracted multi-axial lens critique. Trigger trajectory: pass-2 assumptions:01 (no-inheritance rationale) → pass-3 3-finding surface; pass-3 re-run traceability:01 → pass-4 contradiction with Restore-failure protocol; backtrack-and-exclude assumptions:02 + placement:01 → pass-5 re-cascade; backtrack consistency:01 → same surface again. Score-sum 100, 0, 5, 25 against k=1.5. Two consecutive backtrack passes poisoned placement:01 and consistency:01. Side-effect: pass-1 applied a cross-doc edit to docs/plan_topics/v14-tool-calls.md (out-of-loop-scope); reverted before parking. Human action: reshape T16e's Solution approach — pick one shape at authoring time and remove the bimodal "Either (a)... or (b)..." phrasing, OR split T16e per-shape, OR cap the prose-budget. OriginDir: /c/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T17-18-09_1d907a/_origin
- **Fixer notes:** none

The detailed root-cause analysis, audit-vs-actual comparison, and
ranked Immediate / Pipeline recommendations live in the gitignored
forensic report cited above. This file records only the durable
TL;DR pointer so future `/spec-review` regeneration runs (or future
human triage) can trace why the listed findings ended up in
`spec-review-parked.md`.

---

## 2026-05-21T00:00:00Z — MULTI: T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph

- **Cluster mode (rec F):** yes
- **Cluster members:** 4
- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 6,5
- **Score trajectory:** 205,186 vs S=100
- **Passes:** 2
- **Stage at exit:** 1 (2 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-20T20-52-22_ec4ce0`
- **Poisoned fixes:** spec-lens-completeness:01,spec-lens-traceability:02,spec-lens-assumptions:03,spec-lens-traceability:04
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-20T16-01-36_59fbed/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b.md` _(gitignored)_
- **Parked findings (this run):** `T19a — Extend ActiveInvocationRegistry entry shape with invocationId, T19b — Add invocation_id field to RuntimeEvent payload declaration, T19d — Populate cancelled-by-session-shutdown details with invocation_id, T19e — Add real-time sibling emission timing paragraph`
- **Loop notes:** Cluster-mode run on 4-member MULTI: cluster (T19a/T19b/T19d/T19e). Exit via must-fix-blocked / sub-rationale score-budget-exhausted-trust-override-suppressed: Rec O pass-level shadow-budget gate fired on re-attempted pass 3 with Sigma_shadow=427 across 13 non-blocker raised findings against S=100 (k*S threshold=300; breach margin Sigma-S=327, breach multiplier 4.27x); 12 of 13 findings carried non-trivial Trust impact entries that would have suppressed the per-finding (c-bis) score-budget exit absent the gate; 0 blocker-tier findings, 13 score-budget-counted findings. Origin reshape required: raise the cluster's score, split into per-axis atoms, or narrow the Solution approach. Trajectory before exit: scoreSum=205,186 across passes 1-2; passes 3-4 rewound after C2 surface-expansion detector at pass 4 (scoreSum 162 > 1.5*106) poisoned all 4 pass-3 diagnostics.md fixes; re-pass-3 hit Rec O immediately. Narrowed chunk: docs/spec_topics/pi-integration-contract.md#real-time-sibling-emission-timing (T19e's appended paragraph). OriginDir: /c/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T20-44-14_96ab3b/_origin
- **Fixer notes:** none

---

## 2026-05-21T01:16:36Z — T18b — Add per-mode operator-side null sentences to slash-invocation.md

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** none
- **Score trajectory:** none vs S=25
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-21T01-16-36_396b72`
- **Poisoned fixes:** none
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-20T16-01-36_59fbed/t18b-add-per-mode-operator-side-null-sentences-to-slash-invocation-md.md` _(gitignored)_
- **Parked findings (this run):** `T18b — Add per-mode operator-side null sentences to slash-invocation.md`
- **Loop notes:** Classifier early-exit on stage-1 pass-1 with sub-rationale `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate). 5 findings counted; S=25 (medium origin), Sigma_shadow=76, k*S=75, breach margin 51. 1 blocker on must-fix:true error-model defect: the new "operator-visible failure surface" tail clause names a `Top-level Err in prompt mode` template that does not fire when a `mode: subagent` loom is the top-level slash-dispatch entry. 5 findings raised{high:1,medium:3,NIT:1}, all blocked. Reshape: split T18b per-axis (per-mode null sentence vs operator-surface enumeration vs cross-reference-anchor strategy), raise the score, or narrow the Solution approach to author only the null sentence and defer enumeration to the PIC. OriginDir: /c/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-21T01-14-08_7f7723/_origin
- **Fixer notes:** none

---

## 2026-05-21T10:01:02Z — T19e — Add sendSystemNote synchronous-emission clause

- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 4,4,6,0,0
- **Score trajectory:** 116,162,186,85,106 vs S=100
- **Passes:** 5
- **Stage at exit:** 3 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-21T10-01-02_7d4cfb`
- **Poisoned fixes:** spec-lens-consistency:01, spec-lens-completeness:02, spec-lens-assumptions:01, spec-lens-completeness:01, spec-lens-implementability:01, spec-lens-traceability:01, spec-lens-assumptions:02, spec-lens-traceability:02, spec-lens-traceability:03, spec-lens-traceability:04
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-21T09-09-12_uvpcp9/t19e-add-sendsystemnote-synchronous-emission-clause.md` _(gitignored)_
- **Parked findings (this run):** `T19e — Add sendSystemNote synchronous-emission clause`
- **Loop notes:** Exit sub-rationale `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate) on stage-3 pass 6 entry: S=100, Σ_shadow=364, k×S=300, breach margin Σ_shadow−k×S=64, breach multiplier 3.64×; 9 of 14 raised findings carried Trust-override-eligible impact entries (would-be-fixed absent the gate), all 14 also map to chunk `docs/spec_topics/pi-integration-contract.md#runtime-event-channel` which was in the DriftFromOriginRefusedChunks set from pass 3's mode-(i) refusal. Two C2 backtrack-and-exclude protocols fired during stage 1 (after pass-2-original ratio 1.98× and after pass-3-original ratio 3.32×); both restored cleanly and the loop converged stage 1 at pass 4 and stage 2 at pass 5 before stage 3 tripped Rec O. Stage trajectory: stage1=4 stage2=1 stage3=0. narrowings=0+0+0+0. stage1Touched=1 mode-e-refusals=0.
- **Fixer notes:** none

---

## 2026-05-21T11:15:00Z — T19e — DELETED (over-restrictive mechanism prohibition)

- **Failure mode:** n/a (post-park human review)
- **Decision:** Delete finding entirely (not reshape, not re-introduce).
- **Rationale:** The finding's `MUST NOT interpose buffering, coalescing, or per-round queueing` clause prohibits implementation mechanisms rather than constraining observable outcomes (e.g. a latency bound). Two of the three forbidden mechanisms admit correct implementations (microtask/event-loop-tick dispatch is buffering; coalescing of dedup-key duplicates is already implicitly licensed by the existing dedup rules; per-bounded-flush queueing satisfies operator-visibility intent). The third concern (unbounded queueing) is obvious-on-review and not motivated by any current performance pressure on this low-volume channel. The protected failure mode (an implementer adds an unbounded queue with no flush guarantee) is preventative scaffolding against unmotivated drift, not a defence against any observed or likely defect. Spec hardening at this cost-to-benefit ratio is not justified.
- **Cleanup performed:** removed T19e body from `docs/spec-review-parked.md`; pruned three non-load-bearing `same-cluster` references from T19a/T19b/T19d `## Relationships` blocks in `docs/spec-review.md`; removed eight stale T19e-prior-shape entries from `.pi/spec-debt-register.md` (all targeting PIC L487-L494 content that no longer exists post-2026-05-21 reshape).
- **Follow-up signal (pipeline-side, out of scope for this commit):** the T19e failure surfaced a generic spec-authoring trap the pipeline did not catch — a finding's `MUST NOT` may forbid mechanisms that the same chunk has elsewhere blessed (here: the watcher-note 250 ms debounce explicitly licenses `coalescing` on a sibling channel). A `spec-lens-consistency` rule that checks new `MUST NOT` clauses against the chunk's existing positive licenses would catch this class at audit time. Noted for the next meta-analysis pass.

---

## 2026-05-21T11:30:00Z — T10 — DELETED (niche edge-case implementer divergence, no live dependencies)

- **Failure mode:** n/a (post-park human review)
- **Decision:** Delete finding entirely.
- **Rationale:** Single-string bypass behaviour on whitespace-only / absent slash argument. Both candidate behaviours (bind `""` and start; or system-note and suppress) are individually sensible. The finding documents a niche edge case on the bypass-only path with no runtime correctness risk — the cost of divergence is "different products do different things on this edge case", not data loss or crash. Standalone (`Relationships: None`, no inbound references). Resolution can re-enter the spec via a low-cost direct edit if a product decision is taken.

---

## 2026-05-21T11:31:00Z — T07 — DELETED (implicit convention adequate; no live dependencies)

- **Failure mode:** n/a (post-park human review)
- **Decision:** Delete finding entirely.
- **Rationale:** `QueryError.message` normativity — proposed to state explicitly that `message` is human-readable debug prose on the JavaScript `Error.message` convention. The implicit signal (single annotated panic-template exception, every other variant unannotated) is already strong enough for conformance test authors to read; no runtime behaviour depends on the explicit statement. Same-cluster siblings (T08a, T39) shipped without it. Standalone in dependency terms.

---

## 2026-05-21T11:32:00Z — T15a — DELETED (cleanup-after-relocation; no live blocker)

- **Failure mode:** n/a (post-park human review)
- **Decision:** Delete finding entirely.
- **Rationale:** Reduction of the `<a id="session-model"></a>` Orientation paragraph in `docs/spec.md` to forward-link prose. Both co-resolve siblings (T15b ed57815, T15c 2ac7092) shipped their relocation destinations; the same-cluster peers (T02, T16a, T18a, T24) all shipped. T15a's reduction work was never performed, so the Session-model paragraph in spec.md retains the full 5-category content while the new homes (Concurrency model subsection, V1 Non-goals section) also carry it. The duplication is a readability/maintainability defect but not a behavioural or coherence defect. Three `same-cluster` (informational) inbound edges from T19a/T19b/T19d pruned. No `must-precede`/`must-follow`/`co-resolve` blocker. Deletion accepts the duplication; if it becomes intolerable a fresh finding can author the reduction directly.
- **Spec-debt register note:** `.pi/spec-debt-register.md` contains ~15 entries deferred under rule b-ter against chunk-id `docs/spec.md#concurrency-model` with rationale "revisit after T15a lands". With T15a deleted these deferrals are now permanently parked — the deferred concerns (sub-anchor splits, owner-page placements, GOV-12 markers, etc.) cannot be revisited via this route. If any of them matter, they need to be re-authored as fresh top-level findings.

---
