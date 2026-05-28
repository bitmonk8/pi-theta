# Spec-review fix-loop forensic analysis — pi-loom

_Each entry below summarises one failed `/fix-spec-shape-single-findings`
iteration, with a pointer to the detailed forensic report under
`.pi/tmp/spec-fix-failure-forensics/` (gitignored — read it on demand;
it does not persist across worktree wipes)._

---

## 2026-05-26 — MULTI: T27 — `governance.md` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / "specified in the plan corpus"); T28 — Articulate the "no methodology prescription" rule and audit `spec_topics/` against it

- **Cluster mode (rec F):** yes
- **Cluster members:** 2
- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 8
- **Score trajectory:** 460 vs S=200
- **Passes:** 2
- **Stage at exit:** 1 (2 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-26T09-19-27_1bb130`
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-26T09-04-21_2247a3/t27-t28-cluster-corpus-direction-and-no-methodology-prescription.md` _(gitignored)_
- **Parked findings (this run):** `T27 — \`governance.md\` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / "specified in the plan corpus"), T28 — Articulate the "no methodology prescription" rule and audit \`spec_topics/\` against it`
- **Loop notes:** Cluster-mode MULTI invocation (T27 + T28). Pass-1 cleared all 8 fix-class findings (4 high + 2 medium + 2 low; 6 trust-override fixes + 2 score-budget-cheap-fix), forward-aligned every applied edit, and touched 4 chunks in `docs/spec_topics/governance.md`. Pass-2 classifier exited early on `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate): S=200, Σ_shadow=625, k×S=600, breach margin 25, breach multiplier 3.125×; 10 non-blocker raised findings counted toward the shadow budget of which 9 were trust-overridden. 0 blocker findings on the blocked pass. Per-pass severity tally: p1 raised{high:4,medium:2,low:2} fixed{high:4,medium:2,low:2}; p2 raised{high:5,medium:5} fixed{} blocked{high:5,medium:5}. Stage trajectory: stage1=2. Several p2 findings read as residue from pass-1 fix-06's ~21-LOC enumerated-test expansion of the *Implied-consumer carve-out*. Snapshot refs retained for forensics. Suggested reshape directions: raise cluster S (one member to blocker:200), split one of the high-scored consumer-behaviour-MUST axes off T27/T28 into its own Shape: single finding, narrow T28's Solution approach to defer operational-test partition pinning, or accept the residue as out-of-cluster work per T28's Audit completeness constraint.
- **Fixer notes:** none

---

## 2026-05-26 — MULTI: T27 — `governance.md` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / "specified in the plan corpus"); T28 — Articulate the "no methodology prescription" rule and audit `spec_topics/` against it

- **Cluster mode (rec F):** yes
- **Cluster members:** 2
- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-26T15-18-10_f1d4da`
- **Poisoned fixes:** n/a
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-26T14-59-44_af3f5a/multi-t27-governance-md-plan-corpus-t28-no-methodology-prescription.md` _(gitignored)_
- **Parked findings (this run):** `T27 — \`governance.md\` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / "specified in the plan corpus"), T28 — Articulate the "no methodology prescription" rule and audit \`spec_topics/\` against it`
- **Loop notes:** Cluster-mode MULTI run (T27 + T28). Classifier exited in stage 1 with sub-rationale `score-budget-exhausted`: cluster combined S=200 (Rec OO aggregation T27=100 + T28=100), Σ=275 at exhaustion, breach margin=75. 5 non-blocker non-cheap raised findings counted toward budget (all from spec-lens-consistency: A high/100, D medium/25, E high/100, G medium/25, H medium/25; first crossing of S at finding E cumulative 225). 4 additional cheap-fix findings (B/C/F/I — placeholder-rename, drop-the-tail, replace-self-citation, cross-reference-in-corpus) did not consume budget. 0 blockers. Severity p1 raised{high:2,medium:6,NIT:1} fixed{} deferred{} blocked{high:2,medium:3} (cheap-fix high:0/medium:3/NIT:1 counted in raised but not blocked). stage1=0 (incomplete — exit during classification before any pass completed). No mode-e/f/g refusals; no narrowing tally. Recommended reshape (from classifier _blocked.md): split T27 into per-rule-cluster atoms, OR extend T27 Solution approach to enumerate replacement acceptance criteria for stripped plan-corpus verifiers (GOV-4/6/9/12), OR extend T28 Solution approach to require GOV-5/GOV-16 reconciliation pass against the new GOV-18, OR raise T27 to blocker (S→300). The breach is structural: post-strip GOV-17/18 prose carries MUSTs whose verification surface was deleted without replacement, leaving findings A and E (both high/100) plus G and H exposing GOV-5/GOV-6/GOV-12/GOV-16 contradictions the Solution approach did not enumerate. Snapshots retained at refs/loom/snapshots/2026-05-26T15-18-10_f1d4da/* for forensics.
- **Fixer notes:** none

---

## 2026-05-27 — MULTI: T04 - V1 non-goals heading + anchor rename in lock-step with T17; T17 - Rename `V1` -> `loom 1.0` across the spec corpus

- **Cluster mode (rec F):** yes
- **Cluster members:** 2
- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 2,1,4,0,2,1,0,4,10,0
- **Score trajectory:** 125,25,145,1,125,145,35,160,393,360 vs S=125
- **Passes:** 10
- **Stage at exit:** 3 (4 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-27T12-59-16_8b4647`
- **Poisoned fixes:** spec-lens-consistency:01, spec-lens-traceability:01, spec-lens-assumptions:01, spec-lens-assumptions:02, spec-lens-testability:01
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-27T11-51-12_03914b/multi-t04-v1-non-goals-heading-anchor-rename-plus-t17-v1-rename.md` _(gitignored)_
- **Parked findings (this run):** `T04 - V1 non-goals heading + anchor rename in lock-step with T17, T17 - Rename \`V1\` -> \`loom 1.0\` across the spec corpus`
- **Loop notes:** Cluster-mode dispatch (MULTI: T04+T17, S=125 via Rec OO sum). Classifier exited on `score-budget-exhausted` at pass 10: Σ=360, S=125, breach margin=235; 1 blocker raised (testability — undecidable MUST in token-sense convention) plus 9 non-cheap non-trust raised findings against two new GOV-15 sub-conventions the rename diff authored. Stage trajectory: stage1=4 stage2=3 stage3=3. Per the classifier's reshape diagnosis (Rec O): the originating cluster authorised a mechanical rename pass (S=125), but the working tree's actual diff authored two net-new normative GOV-15 sub-conventions (token-sense + dual-anchor) plus a `Tooling deferrals` heading anchor — 360 score-units of legitimate critique surface that S=125 cannot absorb. Reshape paths: (1) split "author two new GOV-15 sub-conventions" axis out of T17 into a fresh top-level finding scored high/blocker; (2) narrow T17's Solution approach to forbid net-new normative convention authoring, restricting to the mechanical rename + GOV-8 anchor enumeration only; (3) raise T17 to blocker (insufficient alone).
- **Fixer notes:** none

---

## 2026-05-27 — Unpark: MULTI cluster {T04, T17}

- **Action:** unparked (re-introduced into `docs/spec-review.md`)
- **Source park entry:** the 2026-05-27 `must-fix-blocked` entry immediately above (cluster T04+T17, FIXCOUNTS 2,1,4,0,2,1,0,4,10,0).
- **Reshape applied:** critique-anticipation strategy. T17's `## Solution constraints` block was rewritten to pre-state the substance of the lens findings the parked run raised reactively on passes 3–10, so the next dispatch's fixer authors against the constraints on pass 1 rather than reacting to lens findings against partial work. Source: the 10 accumulated-constraints entries (C1–C10) harvested by the parked run's inner-loop classifier, translated from `MUST`-on-post-fix-spec obligations into authoring obligations on the fixer.
- **Concrete edits to the finding bodies:**
  - T04 — unchanged (already minimal; co-resolves with T17).
  - T17 — `## Problem` extended with one paragraph naming the two dangling normative invariants (token-sense overload and dual-anchor lifecycle) the parked run surfaced. `## Solution approach` extended with a new *Sites — companion mechanical sweep folded in (carry-over)* sub-section folding C1 (`V2` → `loom 2.0`) and C2 (`Tooling deferrals` anchor alias) into the rename's site list. `## Solution constraints` block restructured into four sub-sections: *Cluster-coordination*, *Mechanical-rename and anchor-stability*, *Critique-anticipation constraints* (new — folds in C3–C10 as six authoring constraints), and *Cluster-internal out-of-scope*.
  - Score, importance, must-fix, shape, state: **unchanged** (T04 medium/25, T17 high/100; cluster S stays at 125 under Rec OO sum). The reshape strategy is to reduce critique surface authored by pass 1, not to grow the budget.
  - `Sites — companion mechanical sweep folded in` adds `V2` → `loom 2.0` callsites under `docs/spec_topics/` and the `<a id="tooling-deferrals-no-v1-impact"></a>` alias on the renamed *Tooling deferrals* heading.
- **What this reshape is NOT:** not a split (no T17b created), not a budget raise (T17 stays high/100), not an edit-surface narrowing (the fixer is explicitly NOT forbidden from authoring a dual-anchor convention paragraph; the constraints just bind its shape if authored).
- **Carry-over mapping (parked-run accumulated → reshape destination):**
  - C1 (`V2` → `loom 2.0` uniformity) → `## Solution approach` *Sites — companion mechanical sweep folded in*.
  - C2 (`Tooling deferrals` anchor alias) → same sub-section.
  - C3 (glossary `loom <version>` sense) → `## Solution constraints` *Glossary registration*.
  - C4 + C6 (token-sense disambiguation) → `## Solution constraints` *Sense disambiguation*. Strategy chosen: lexical (`loom 1.0.0` for baseline sense), per the user's preference for closing the dangling invariant rather than deferring it.
  - C5 + C7 + C10 (dual-anchor convention) → `## Solution constraints` *Dual-anchor convention placement and shape*. Authoring is OPTIONAL; if authored, placement is GOV-8 (not GOV-15), definition is intensional, and per-sub-obligation anchors are required.
  - C8 (retirement-audit witness) → `## Solution constraints` *Retirement-audit witness for dual-anchor `v1-*` retirement*.
  - C9 (mechanically-checkable MUSTs only) → `## Solution constraints` *Mechanically-checkable MUSTs only*. Closes the parked run's testability blocker.
- **Forensic report retained:** `.pi/tmp/spec-fix-failure-forensics/2026-05-27T11-51-12_03914b/multi-t04-v1-non-goals-heading-anchor-rename-plus-t17-v1-rename.md` (read-only reference for the next run if the reshape itself fails).
- **Re-dispatch expectation:** the next `/fix-spec-shape-single-findings` run will re-pick the {T04, T17} cluster (co-resolve closure unchanged). Expected trajectory: pass 1 ships a wider mechanical edit (rename + sense-disambiguation + companion sweeps), pass 1 critique surface is small because the constraints pre-empted it, convergence within the original S=125 budget.

---

## 2026-05-27 — MULTI: T04 - V1 non-goals heading + anchor rename in lock-step with T17; T17 - Rename `V1` -> `loom 1.0` across the spec corpus

- **Cluster mode (rec F):** yes
- **Cluster members:** 2
- **Failure mode:** surface-expansion-irrecoverable-bimodal
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** 3,1,5
- **Score trajectory:** 11,1,185 vs S=125
- **Passes:** 3
- **Stage at exit:** 1 (2 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-27T19-46-25_62a5cc`
- **Poisoned fixes:** spec-lens-completeness:01, spec-lens-traceability:03, spec-lens-traceability:02
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-27T19-25-17_c38459/multi-t04-v1-non-goals-heading-anchor-rename-in-lock-step-with-t17-t17-rename-v1.md` _(gitignored)_
- **Parked findings (this run):** `T04 - V1 non-goals heading + anchor rename in lock-step with T17, T17 - Rename \`V1\` -> \`loom 1.0\` across the spec corpus`
- **Loop notes:** Cluster-mode (MULTI: T04+T17) rename loop diverged via surface-expansion two-strikes on the new `loom <version>` glossary bullet authored by the top-level fixer. severity p1 raised{low:2,NIT:1} fixed{low:2,NIT:1} deferred{} blocked{}; p2 raised{medium:4,low:1,NIT:1} fixed{medium:4,NIT:1} deferred{low:1} blocked{} (surface-expansion fired: Σ=96 > 1.5·11; backtracked to baseline, poisoned spec-lens-completeness:01 and spec-lens-traceability:03 — both target the glossary bullet); p1-rewind raised{low:2,NIT:1} fixed{NIT:1} deferred{low:2 poisoned-surface-expansion} blocked{}; p2-rewind raised{high:1,medium:3,low:2} fixed{high:1,medium:3,low:1} deferred{low:1 poisoned} blocked{} (surface-expansion fired again: Σ=185 > 1.5·1; no file overlap between p1-rewind fix and p2-rewind findings so fall-back poisoned the only fix spec-lens-traceability:02 — anchor alias at future-considerations.md, which cannot plausibly have caused the glossary-targeted findings; the surface expansion is a phantom signal driven by lens non-determinism re-surfacing dormant baseline defects on later passes). Stage trajectory: stage1=3. stage1Touched=2 mode-e-refusals=0. accumulatedConstraints=11 malformedBullets=0. Originating cluster's licensed glossary bullet is bimodal in its sense scheme (`loom 1.0` major-line design-scope sense AND `loom 1.0.0` frozen-baseline release sense — two-site authoring of a single bullet) and multi-axis on the defect surface (missing anchor + unmapped enumerated literals + lexical-MUST contradicting flat rename + unfalsifiable SHOULD predicate + no warrant for design-scope retro-pinning + no dual-anchor retirement policy). Either-or resolution paths C7 ("MUST either (a) pin warrant OR (b) narrow") and C5 ("MUST either delete the SHOULD OR narrow to a closed enumeration OR pin a mechanically-checkable decider") confirm bimodal Solution-approach shape. Reshape recommendation: split T17 into separate findings for (i) glossary-bullet authoring with split anchors per sub-sense, (ii) frozen-baseline callsite sweep to `loom 1.0.0`, (iii) dual-anchor retirement policy under GOV-8; alternatively widen T17's Solution approach to explicitly license the two-sense bullet shape AND enumerate the closure callsites that must use baseline spelling. Snapshot refs retained at refs/loom/snapshots/2026-05-27T19-46-25_62a5cc/* for forensics.
- **Fixer notes:** none

---

## 2026-05-27 — Unpark: MULTI cluster {T04, T17} (second reshape)

- **Action:** unparked (re-introduced into `docs/spec-review.md`)
- **Source park entry:** the 2026-05-27 `surface-expansion-irrecoverable-bimodal` entry immediately above (cluster T04+T17, FIXCOUNTS 3,1,5; SCORESUMS 11,1,185 vs S=125).
- **Reshape applied:** critique-anticipation strategy with explicit arm-choices on every bimodal accumulated constraint. T17's `## Problem` was extended with a third dangling-invariant paragraph (frozen-baseline-vs-design-scope contradiction at closure callsites). `## Solution approach` was extended with three new `## Sites — …` sub-sections (*glossary entry*, *frozen-baseline closure callsites*, *dual-anchor convention paragraph (GOV-8)*, *diagnostics.md Closure paragraph release-scope inline pin*) that pre-author the shape, anchors, and authoring order of the three new normative-prose surfaces the parked run's fixer collapsed into one unbounded glossary bullet. `## Solution constraints` was restructured into five sub-sections (*Mechanical-rename and anchor-stability*, *Glossary entry shape* operationalising C1/C4/C5/C7/C10/C11, *Dual-anchor convention* operationalising C6, *Diagnostics-closure inline-scope* operationalising C8, *Authoring shape and mechanical-witness*) with arm-choices made explicitly: C5 → "delete the SHOULD"; C7 → arm (b) (narrow + per-callsite frozen-baseline sweep); C9 → enumerate frozen-baseline closure callsites as a separate `## Sites — …` block and require the lexical-MUST consistency precondition before glossary authoring. T04's `## Solution approach` was minimally edited to point at T17's new dual-anchor convention site instead of repeating it.
- **Concrete edits to the finding bodies:**
  - T04 — `## Solution approach` rewritten to reference T17's dual-anchor convention site and to add the back-compat alias retention obligation (was previously only a rename, now also pins the alias).
  - T17 — `## Problem` extended (3rd dangling invariant). `## Solution approach` extended (new sites: *glossary entry* — two-bullet, two-anchor; *frozen-baseline closure callsites* — explicit enumeration of `diagnostics.md:385/:404`, `binder.md:329`, GOV-15 baseline callsite, `Ceiling-set carve-out`, PIC `Re-validation gate`, `hard-ceilings.md` closure callsites; *dual-anchor convention paragraph (GOV-8)* — section heading `### GOV-8a`, section anchor, four numbered sub-clauses with per-sub-clause anchors; *diagnostics.md Closure paragraph release-scope inline pin*). `## Solution constraints` restructured into five sub-sections operationalising the eleven accumulated constraints from the prior run.
  - Score, importance, must-fix, shape, state: **unchanged** (T04 medium/25, T17 high/100; cluster S stays at 125 under Rec OO sum). The reshape strategy is critique-anticipation, not budget growth.
- **What this reshape is NOT:** not a split (no T17b created — the user explicitly requested the finding be kept whole and solved fully); not a budget raise; not a narrowing of edit-surface (the fixer is REQUIRED, not forbidden, to author the dual-anchor convention paragraph and the two-bullet glossary entry — the OPTIONAL framing on the dual-anchor convention is withdrawn).
- **Carry-over mapping (parked-run accumulated → reshape destination):**
  - C1 (closure enumeration over literals) → `## Solution constraints` *Glossary entry shape* → *Closure enumeration*.
  - C2 (Tooling deferrals dual-anchor) → `## Solution approach` *Sites — companion mechanical sweep* (heading rename + dual anchor).
  - C3 (load-bearing-callsite inline qualifier SHOULD) → arm-chosen "delete the SHOULD" per C5; no SHOULD authored. Discharged by the per-callsite frozen-baseline sweep instead.
  - C4 (anchor on new glossary entry) → `## Solution constraints` *Glossary entry shape* → *Anchor on each bullet*.
  - C5 (three-arm bimodal resolution) → arm-chosen "delete the SHOULD" (Glossary entry shape → *Disambiguation is lexical, no SHOULD clause*).
  - C6 (GOV-8 dual-anchor convention paragraph) → `## Solution approach` *Sites — dual-anchor convention paragraph (GOV-8)* + `## Solution constraints` *Dual-anchor convention constraints*. Authoring promoted from OPTIONAL to MANDATORY.
  - C7 (warrant vs narrow bimodal) → arm-chosen (b) (narrow). Discharged by *Sites — frozen-baseline closure callsites*.
  - C8 (diagnostics.md Closure paragraph release-scope pin) → `## Solution approach` *Sites — diagnostics.md Closure paragraph release-scope inline pin* + `## Solution constraints` *Diagnostics-closure inline-scope constraint*.
  - C9 (frozen-baseline closure callsites must use `loom 1.0.0`) → `## Solution approach` *Sites — frozen-baseline closure callsites* (explicit enumeration with grep-witness audit obligation) + `## Solution constraints` *Lexical-MUST consistency with frozen-baseline rewrite*.
  - C10 (anchor on new normative prose) → `## Solution constraints` *Anchor on each bullet* + *Anchor and per-sub-clause anchors*.
  - C11 (split the glossary bullet into two sub-entries with distinct anchors) → `## Solution approach` *Sites — glossary entry (split per sense …)* + `## Solution constraints` *Two-bullet shape*.
- **Forensic report retained:** `.pi/tmp/spec-fix-failure-forensics/2026-05-27T19-25-17_c38459/multi-t04-v1-non-goals-heading-anchor-rename-in-lock-step-with-t17-t17-rename-v1.md` (read-only reference for the next run if the reshape itself fails).
- **Re-dispatch expectation:** the next `/fix-spec-shape-single-findings` run will re-pick the {T04, T17} cluster (co-resolve closure unchanged). Expected trajectory: pass 1 ships the full mechanical rename plus the three new normative-prose surfaces (glossary 2-bullet entry, GOV-8a section, diagnostics.md Closure inline pin) authored against the constraints rather than against subsequent lens findings, so the per-pass critique surface should remain inside S=125 across stage 1.
- **Pipeline-side observations carried forward (not blocking re-dispatch):** the prior run's surface-expansion exit at pass 4 of 17 fired on phantom causality — pass-1-rewind authored a one-line dual-anchor alias edit at `future-considerations.md:18` and pass-2-rewind raised six findings whose Σ overshot the 1.5× threshold, but five of the six cited `glossary.md` (a file the fix did not touch). Forensic report Pipeline recommendations RP-1 (file-overlap pre-check before C2 poisoning) and RP-2 (subtract excluded-domain scores from Σ before applying the 1.5× threshold) remain pending; this reshape addresses the finding-level cause but does not patch the detector. If the next run also surface-expansion-exits without crossing a stage boundary, the detector patches become the binding next step.

---

## 2026-05-28 — MULTI: T04 - V1 non-goals heading + anchor rename in lock-step with T17; T17 - Rename `V1` -> `loom 1.0` across the spec corpus

- **Cluster mode (rec F):** yes
- **Cluster members:** 2
- **Failure mode:** must-fix-blocked
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** none
- **Score trajectory:** none vs S=125
- **Passes:** 0
- **Stage at exit:** 1 (0 pass(es) in stage)
- **Snapshot refs (retained for forensics):** `refs/loom/snapshots/2026-05-28T03-44-50_a58435`
- **Poisoned fixes:** none
- **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-27T22-09-09_cc3824/multi-t04-t17-v1-loom-1-0-rename.md` _(gitignored)_
- **Parked findings (this run):** T04 - V1 non-goals heading + anchor rename in lock-step with T17; T17 - Rename `V1` -> `loom 1.0` across the spec corpus
- **Loop notes:** Phase 2 re-dispatch attempt 2 (snapshotted prior accumulated-constraints to _accumulated-constraints-attempt-1.md and wiped per Phase 3 wipe contract). Cluster-mode dispatch (T04+T17). Classifier early-exit on pass 1 of stage 1 via `score-budget-exhausted` sub-rationale: S=125 (T04@25 + T17@100 per Rec K/OO aggregation), Σ=190 over 6 non-blocker non-cheap raised findings, breach margin=65; cheap-fix branch admitted 2 findings (D: future-considerations.md back-compat anchor @5; E: spec.md Source-language-stability `loom 1.0`→`loom 1.0.0` @25) out of budget per D-mode clause 2. Pass-level Rec O shadow gate did NOT fire (Σ_shadow=220 ≤ k·S=375). Rec TT within-cluster filter excluded 1/3 scope guards (T04 sibling-ownership); 2 surviving external guards (plan-phase `V1`–`Vn` reservation; README load-bearing rewrite) did not participate in this exit. Six budget-counted findings attach to the GOV-8a/glossary residue authored by T17's widened approach: GOV-8a-3 intensional-definition under-specification along 3 independent axes (Finding A @35), GOV-8a-2/4 alias-permanence vs corpus-local discharge reconciliation gap (B @35), `## Retired anchor aliases` sub-table placement/creation/owner-page gap (C @25), `loom 1.0` vs `loom 1.0.0` discriminator self-violation across ~10 surviving closure callsites including direct contradiction errors-and-results.md:109 vs diagnostics.md:385 (F @35 — Σ crossed S here), glossary entry citing volatile line numbers instead of anchors (G @25), GOV-8a tail-form `8a` and three-part hierarchical sub-IDs unexpressible under GOV-3/GOV-16 grammar (H @35). severity p1 raised{medium:8} fixed{} deferred{} blocked{medium:6,cheap-fix-out-of-budget:2}; stage1=0. accumulatedConstraints=0 malformedBullets=0 (Phase 3 wiped on entry; no fix pass ran to harvest from). Snapshot refs under refs/loom/snapshots/2026-05-28T03-44-50_a58435/* RETAINED for forensics per failure-exit retention rule. Phase 2 generalization: outcome=re-dispatch-changed-status; attempts=1; axes=structural-shape-pin; peak-scoresums-trajectory=296; log=C:/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-27T22-10-38_822843/_origin/_generalization-log.md. Attempt 1 widened T17's GOV-8a `### Sites — dual-anchor convention paragraph (GOV-8)` block into four behavioural obligation axes with shape discretion; re-dispatched inner loop exited via must-fix-blocked classifier early-exit on pass 1 of stage 1 (no fix pass ran), so the widening shifted the failure mode from limit-cycle to must-fix-blocked. The widened approach licensed the surface but the cluster's S=125 budget is insufficient against the ~6 medium-severity findings the GOV-8a / glossary residue surfaces.
- **Fixer notes:** none

---
