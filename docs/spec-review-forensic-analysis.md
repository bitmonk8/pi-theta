# Spec-review fix-loop forensic analysis — pi-loom

_Each entry below summarises one failed `/fix-spec-shape-single-findings`
iteration, with a pointer to the detailed forensic report under
`.pi/tmp/spec-fix-failure-forensics/` (gitignored — read it on demand;
it does not persist across worktree wipes)._

---

## 2026-06-03 — T01 - Terminal-outcomes aggregator carries an inverted parenthetical and an unlinked disposition

- **Failure mode:** fast-loop-unresolved
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T01 - Terminal-outcomes aggregator carries an inverted parenthetical and an unlinked disposition`
- **Loop notes:** Shape:multiple finding whose ### Recommendation directs applying all three options sequentially (A→B→C) rather than selecting one survivor; spec-review-recommendation-applier returned requires-human and the finding cannot be mechanically collapsed to Shape: single, so the fast loop's single-shape picker cannot route it.
- **Fixer notes:** none

---
