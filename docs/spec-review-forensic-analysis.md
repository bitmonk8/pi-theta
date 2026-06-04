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

## 2026-06-03 — T22 - invocation.md carries no INV-N REQ-IDs

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T22 - invocation.md carries no INV-N REQ-IDs`
- **Loop notes:** finding not resolved by fast fix — B3 returned FindingResolved=partial; INV-1..INV-11 anchors coined and most inbound links repointed, but the errors-and-results.md ("Invocation — Failures", "Invocation depth bound") and hard-ceilings.md ("Invocation — Failures") inbound links named in the finding were left without #inv-9/#inv-11 fragments.
- **Fixer notes:** none

---

## 2026-06-03 — T21 - cancellation.md carries no CNCL-N REQ-IDs

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T21 - cancellation.md carries no CNCL-N REQ-IDs`
- **Loop notes:** finding not resolved by fast fix — B3 returned FindingResolved=partial; CNCL-1..16 anchors coined and spec.md SM-7a/SM-7e repointed, but the finding's "repoint every inbound cross-reference from depending pages" (binder.md, errors-and-results.md, pi-integration-contract.md, slash-invocation.md, hard-ceilings.md, diagnostics.md) was unmet.
- **Fixer notes:** none

---

## 2026-06-04 — T16 - query.md missing QRY-N REQ-IDs

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T16 - query.md missing QRY-N REQ-IDs`
- **Loop notes:** finding not resolved by fast fix — B3 returned FindingResolved=partial; 15 QRY-N anchors coined and 41 inbound links across 11 pages repointed, but glossary.md (3 links) and spec.md SM-8 aggregator (1 link) named in the Solution approach were left at section-heading granularity.
- **Fixer notes:** none

---

## 2026-06-04 — T14 - frontmatter.md carries no FRNT-N REQ-IDs

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T14 - frontmatter.md carries no FRNT-N REQ-IDs`
- **Loop notes:** finding not resolved by fast fix — B3 returned FindingResolved=partial; 12 FRNT-N anchors coined (GOV-22 half resolved) but the Solution approach's same-commit inbound cross-reference repointing on sibling pages (GOV-9 half) was deferred.
- **Fixer notes:** none

---

## 2026-06-03 — T12 - binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a (fast loop — no inner-loop trajectory)
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (fast loop — no staged dispatch)
- **Snapshot refs (retained for forensics):** n/a
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T12 - binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs`
- **Loop notes:** finding not resolved by fast fix — B3 returned FindingResolved=partial; BNDR-4..7 block-level anchors coined cleanly, but the Solution approach's per-independently-testable-obligation granularity was narrowed to one block-level ID per section, and the reference-rendering byte-pinning lead-ins / per-invocation-retry-budget BNDR-N pair were deferred.
- **Fixer notes:** none

---

## 2026-06-04 — T03 - Determinism section over-pins FNV-1a as the binder-seed algorithm

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a (fast loop — no inner-loop trajectory)
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (fast loop — no staged dispatch)
- **Snapshot refs (retained for forensics):** n/a
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T03 - Determinism section over-pins FNV-1a as the binder-seed algorithm`
- **Loop notes:** finding not resolved by fast fix — B3 returned FindingResolved=partial; the non-normative rationale clause + #provider-seed-field-mapping cross-reference were added (core gap closed), but the Solution approach's required #gov-15-fixture-suite cross-reference was dropped on a false premise (the fixer believed the anchor did not exist; it does exist at governance.md:173).
- **Fixer notes:** none

---
