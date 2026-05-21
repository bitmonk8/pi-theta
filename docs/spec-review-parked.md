# Findings parked from `spec-review.md` — pi-loom

_This file collects findings physically removed from the
consolidated spec-review document because they cannot be addressed
by the current `/fix-spec-shape-single-findings` pipeline. Each
entry records the reason for parking and the path to the per-finding
forensic report. Parked findings must be reshaped (typically by
splitting bimodal obligations, narrowing scope, demoting MUSTs,
or capping the prose the fix is allowed to add) before being
re-introduced into the live review document._

_Cascade-parked findings (parked solely because they depended on
another parked finding) typically un-park automatically once the
upstream finding's reshape is re-introduced and successfully fixed,
unless they have substantive shape problems of their own._


---

## T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`

> **PARKED** — 2026-05-21T22:01:05Z
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 7,3,6,2,0,0. Loop notes: Classifier exited on stage-3 entry (pass 7 attempt) with sub-rationale score-budget-exhausted-trust-override-suppressed (Rec O pass-level shadow-budget gate): S=100, Σ_shadow=339, breach margin Σ_shadow-k×S = 339-300 = 39 (breach multiplier 3.39×). 20 non-blocker raised findings counted; zero would have been classified as trust-override-fix (all 20 would have routed through b-bis approach-narrowed). Stage trajectory stage1=5 stage2=1 stage3=1; one surface-expansion backtrack occurred at original pass-5 (scoreSum 207>1.5×76) restoring to pass-4 snapshot and poisoning fixes spec-lens-assumptions:01/spec-lens-completeness:02. Narrowings narrowings=0+1+0+0 (one approach-narrowed chunk added mid-loop by pass-4 mode-(d) refusal on loom-package-implementation-dependencies; absorbed 31 lens findings across passes 4-rerun→7). Reshape candidates per classifier: (a) raise T03a's score (not available — high is the ceiling); (b) split into per-axis atoms; (c) narrow Solution approach further (demote (i)/(ii) cluster to non-normative); (d) accept as-shipped with 31 deferred findings persisting in debt-register. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-21T15-45-32_04fd18/t03a-add-loom-package-implementation-dependencies-v1-sub-paragraph-in-pic-host-p.md`

# T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`

**Kind:** assumptions, completeness
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** single
**State:** reduced
**Decision axes:** 3

## Problem

The `**Host prerequisites.**` paragraph in `docs/spec_topics/pi-integration-contract.md` enumerates four host-side prerequisites (Pi SDK pin, Binder model, Binder credentials, Pi-supplied `AbortSignal`) and does not name the loom package's own production dependencies needed to satisfy the Step 0 probe contracts. The runtime's `semver` dependency is mentioned only inside the parentheticals of the two `*Recommended recipe (non-normative).*` paragraphs immediately below the enumeration, both explicitly labelled non-normative. Consequently the H1 leaf's `dependencies["semver"]` manifest assertion (per `docs/plan_topics/h1-scaffold.md`) has no normative anchor in PIC to assert against.

## Solution approach

Add a new sub-paragraph whose lead bold token is `**Loom-package implementation dependencies (V1).**` immediately below the four-item enumeration in `**Host prerequisites.**` of `docs/spec_topics/pi-integration-contract.md`. The sub-paragraph names the V1 implementation choices the recipe contracts consume — for V1, `semver` declared in the loom package's `dependencies` block and `@types/semver` declared in `devDependencies` — frames the choices as implementation-side rather than normative contract, and states the chosen version range as a literal value.

## Solution constraints

- Do not introduce a new MUST about which SemVer implementation contributors must use; the comparator-swap escape hatch already promised by the two `*Recommended recipe (non-normative).*` paragraphs must remain genuine after this sub-paragraph lands.

## Relationships

- T03c "Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs" — must-precede (this finding installs the anchor that obviates the parentheticals T03c removes).
- T03f "`h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph ..." — must-precede (T03f's manifest assertion anchors at the sub-paragraph this finding installs).

---
