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

## 2026-06-04 — T14 - Transport-class binder retry: no inter-attempt timing contract

- **Failure mode:** fast-loop-unresolved
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T14 - Transport-class binder retry: no inter-attempt timing contract`
- **Loop notes:** Shape: multiple; recommendation defers the A-vs-B choice to an unperformed audit of @earendil-works/pi-ai transport backoff and is gated on the T22 must-follow dependency, so no single option can be selected mechanically. Recommendation-applier returned requires-human; cannot collapse to Shape: single.
- **Fixer notes:** none

---

## 2026-06-04 — T06 - binder.md normative sections lack per-obligation BNDR-N anchors

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a (fast loop — no inner-loop trajectory)
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (fast loop — no staged dispatch)
- **Snapshot refs (retained for forensics):** n/a
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T06 - binder.md normative sections lack per-obligation BNDR-N anchors`
- **Loop notes:** finding not resolved by fast fix (urgent reviewer returned FindingResolved: partial — fixer narrowed to the three echo-policy obligations with a live GOV-9 citer; the full four-sub-section per-obligation sweep and coverage-matrix update were not done).
- **Fixer notes:** none

---

## 2026-06-05 — T14 - Un-anchored normative obligations across `cancellation.md`

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a (fast loop — no inner-loop trajectory)
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (fast loop — no staged dispatch)
- **Snapshot refs (retained for forensics):** n/a
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T14 - Un-anchored normative obligations across cancellation.md`
- **Loop notes:** finding not resolved by fast fix (partial — fast fix coined CNCL-4..8 over uppercase-MUST sites with zero floor regressions, but obligation sites "listener cleanup is mandatory", the "must not retroactively rewrite a completed Ok" race rule, and the Propagation/Granularity/no-top-level-synthesis/Surfacing sites remain un-anchored)
- **Fixer notes:** none

---

## 2026-06-05 — T13 - Binder *System-prompt structure (normative)* items 1–8 carry no REQ-ID anchors

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a (fast loop — no inner-loop trajectory)
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (fast loop — no staged dispatch)
- **Snapshot refs (retained for forensics):** n/a
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T13 - Binder *System-prompt structure (normative)* items 1–8 carry no REQ-ID anchors`
- **Loop notes:** finding not resolved by fast fix (partial — fast fix coined dual-form BNDR-7..14 anchors at items 1–8 with zero floor regressions, but the required umbrella anchor on the `#### System-prompt structure (normative)` heading line was not added; reviewer marked partial)
- **Fixer notes:** none

---

## 2026-06-05 — T09 - Diagnostic code-registry *Spec rule* cells bypass GOV-9 `#prefix-n` cross-link form

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a (fast loop — no inner-loop trajectory)
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (fast loop — no staged dispatch)
- **Snapshot refs (retained for forensics):** n/a
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T09 - Diagnostic code-registry *Spec rule* cells bypass GOV-9 #prefix-n cross-link form`
- **Loop notes:** finding not resolved by fast fix (partial — fast fix repointed 8 cells in code-registry-load.md / code-registry-runtime.md to live anchors (DISC-2/3/4, PIC-8/9) with zero floor regressions and no dangling targets, but the host and parse code-registry tables were left entirely untouched and many cells with available owner-page REQ-ID anchors remain un-repointed; reviewer marked partial)
- **Fixer notes:** none

---

## 2026-06-05 — T56 - Provider/library behaviour is asserted as fact without citation or version pin

- **Failure mode:** fast-loop-unresolved
- **Category:** 2 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a (fast loop — no inner-loop trajectory)
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (fast loop — no staged dispatch)
- **Snapshot refs (retained for forensics):** n/a
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T56 - Provider/library behaviour is asserted as fact without citation or version pin`
- **Loop notes:** finding not resolved by fast fix — schema-subset.md depth/intersection/Draft reframes landed, but the typed-query forced-respond complete() dependency forward-links (#complete-forced-tool-presupposition, #pi-sdk-pin) were not added (excluded by scope guard); reviewer marked partial.
- **Fixer notes:** none

---

## 2026-06-06T15:58:14Z — MULTI: T055 - Item (i) leaves the loom-side overflow-signature regex update unspecified, and the SHOULD-item fail disposition is asymmetric across items (f)–(ad); T115 - Provider-error-mapping table: row-selection key, Bedrock `ValidationException` discriminator, and HTTP-200 envelope discriminator unpinned

- **Cluster mode (rec F):** yes
- **Cluster members:** 2
- **Failure mode:** fast-loop-unresolved
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T055 - Item (i) leaves the loom-side overflow-signature regex update unspecified, and the SHOULD-item fail disposition is asymmetric across items (f)–(ad), T115 - Provider-error-mapping table: row-selection key, Bedrock `ValidationException` discriminator, and HTTP-200 envelope discriminator unpinned`
- **Loop notes:** picker-cluster-violation — dispatched MULTI cluster {T055, T115} omits T115's live co-resolve sibling T084; fixer refused to land partial cluster (co-resolve is a hard bundle). Cluster discarded this cycle; fresh re-review will re-cluster.
- **Fixer notes:** none

---

## 2026-06-06T16:43:52Z — MULTI: T045 - Audit-cluster testability/assumptions: four independent gaps bundled in one finding; T112 - Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates

- **Cluster mode (rec F):** yes
- **Cluster members:** 2
- **Failure mode:** fast-loop-unresolved
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T045 - Audit-cluster testability/assumptions: four independent gaps bundled in one finding, T112 - Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates`
- **Loop notes:** state-mismatch — both co-resolve cluster members are in legacy triage layout (## Finding / ## Solution Space), not the reduced 3-field implementer form; fixer refused. Co-resolve forbids individual dispatch. Discarded this cycle; fresh re-review regenerates in reduced form.
- **Fixer notes:** none

---

## 2026-06-06T18:58:46Z — MULTI: T096 - `loom-direct:` `toolCallId` shape, uniqueness, and minting source are unspecified; T097 - `loom-direct:` toolCallId has no PIC-20-compliant minting path

- **Cluster mode (rec F):** yes
- **Cluster members:** 2
- **Failure mode:** fast-loop-unresolved
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T096 - `loom-direct:` `toolCallId` shape, uniqueness, and minting source are unspecified, T097 - `loom-direct:` toolCallId has no PIC-20-compliant minting path`
- **Loop notes:** spec-review-fixer refused the co-resolve cluster: member T097 lacks top-level **State:** reduced and retains the un-reduced triage shape (## Finding / ## Spec Documents / ## Plan Impact / ## Consequence / ## Solution Space). Co-resolve binding blocks landing T096 alone. state-mismatch: finding requires reduction before fix-loop can accept it.
- **Fixer notes:** none

---

## 2026-06-07T10:10:13Z — T058 - Step-2(b) family→branch correspondence inverts at the family-distinctive arms

- **Failure mode:** fast-loop-unresolved
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T058 - Step-2(b) family→branch correspondence inverts at the family-distinctive arms`
- **Loop notes:** Picker emitted CONTRADICTS — the reduced finding's Solution edits instruct updating branch references in audit-target-categories.md and audit-recognised-shapes.md, which the finding's own Spec Documents scope marks read-only (Class II site-scope inversion). Not directly fixable in the fast loop.
- **Fixer notes:** none

---

## 2026-06-07 — T050 - Audit / drain-state / runtime-event / provider-error cluster — naming and clarity drift

- **Failure mode:** fast-loop-unresolved
- **Category:** 1 _(Rec W: 1 = malformed finding — reshape `spec-review.md`; 2 = fixer too-hard — file pi-config issue)_
- **Trajectory:** n/a
- **Score trajectory:** n/a
- **Passes:** n/a
- **Stage at exit:** n/a (n/a pass(es) in stage)
- **Snapshot refs (retained for forensics):** n/a (loop did not run)
- **Poisoned fixes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T050 - Audit / drain-state / runtime-event / provider-error cluster — naming and clarity drift`
- **Loop notes:** finding not resolved by fast fix — fast pass resolved 6 of 7 sub-issues (Group casing, tie-break basis, numeric-run grammar already present, drainStateTag/tag rationale relocation, setter first/last-write-wins signalling, family↔category identity) but sub-issue F ("arm" overload reservation) is infeasible-clean within the fast loop: "arm" is corpus-wide vocabulary bound to stable anchors (#gov-18-arm-a, #substep-1-shutting-down-arm) and normative acceptance-criteria usage in session-only-degraded-state.md, requiring a coordinated corpus-spanning anchor-retagging sweep. urgent-review returned FindingResolved: partial (FloorRegressionCount 0). Recommend the fresh Stage C re-review re-file the "arm"-reservation sub-issue as a standalone, fully-enumerated rename finding.
- **Fixer notes:** none

---
