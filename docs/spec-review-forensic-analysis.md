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
