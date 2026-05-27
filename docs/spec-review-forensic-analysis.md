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
