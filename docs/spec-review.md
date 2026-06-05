# Triaged Spec Review - spec

_Generated: 2026-06-05T00:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blockers, 0 high, 3 medium retained, 3 medium parked; 10 low discarded; 5 low findings merged into 2 medium findings; 12 nit dropped; 0 false dropped._

---

# T01 - Pre-evaluation failure list — stale count-pointer and non-contiguous REQ-ID numbering

**Kind:** clarity, consistency, naming, traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The eight-item pre-evaluation failure list under **Terminal outcomes** in `error-model.md` carries two surface defects in the same paragraph block. First, the closing lock-step co-edit sentence names a backtick literal `the seven below` as the count phrase to keep in sync, but the actual count phrase in the preceding paragraph is "the eight below" — a stale self-reference left over from before `err-16` was added, so the closed-count invariant is no longer mechanically grep-verifiable by a future editor. Second, the list enumerates eight items but assigns non-contiguous anchors `err-1`–`err-7` then `err-16`; `err-8`–`err-15` are live elsewhere (on this page and in `queryerror-variants.md`), and neither the intro ("the eight below") nor the recap ("the eight list items above") explains the discontinuity, so an auditor reading `err-*` anchors as a contiguous range silently misidentifies the pre-evaluation set.

## Solution approach

Rewrite the lock-step co-edit sentence's backtick literal `the seven below` to `the eight below` so it names the count phrase that actually exists in the preceding paragraph. Clarify the intro sentence ("…is the eight below…") and the recap ("Each of the eight list items above…") so the non-contiguous anchor set — `err-1`–`err-7` plus `err-16`, with `err-8`–`err-15` allocated to sibling obligations elsewhere — is auditable from the prose alone.

## Solution constraints

- Do not renumber the existing `err-1`–`err-16` anchors to a contiguous range; they are cited from sibling pages and renumbering would break those cross-references.

## Relationships

- T14 "Un-anchored normative obligations across `cancellation.md`" - same-cluster (REQ-ID anchor coherence; resolves independently).
# T02 - `.pi/project-config.md` live/retired GOV snapshot is stale post-GOV-21 split

**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The *Spec rules* opening paragraph of `.pi/project-config.md` carries a
non-normative snapshot of the governed REQ-ID set reading "currently
GOV-1, GOV-3, GOV-5–GOV-9, GOV-12, GOV-14–GOV-24, with GOV-2/4/10/11/13
retired". That snapshot is stale: the *Retired REQ-IDs* sub-table in
`docs/spec_topics/governance/anchor-scheme-and-retired.md` records GOV-21
retired (split per GOV-8 into GOV-25 … GOV-29), and GOV-25 … GOV-29 are
now live and normative in `docs/spec_topics/governance/release-version-naming.md`.
The snapshot's `GOV-14–GOV-24` range still lists GOV-21 as live and omits
the five replacement IDs entirely. A contributor or fixer agent using
`project-config.md` as the entry point can cite a retired GOV-21 anchor,
miss that GOV-25 … GOV-29 are the dual-anchor-convention citation targets,
or under-allocate the next free GOV number.

## Solution approach

Rewrite the stale parenthetical in the `Spec rules` opening paragraph of
`.pi/project-config.md` so the live set reads GOV-1, GOV-3, GOV-5–GOV-9,
GOV-12, GOV-14–GOV-20, GOV-22–GOV-29 and the retired set reads
GOV-2/4/10/11/13/21, matching the *Retired REQ-IDs* sub-table in
`docs/spec_topics/governance/anchor-scheme-and-retired.md`.

## Solution constraints

- Out of scope: the parallel GOV summary in
  `docs/spec_topics/governance.md` — it is the authoritative side the
  snapshot defers to, and this finding does not touch it.
- Do not edit the *REQ-ID prefix table* enumeration (`CEIL`, `CIO`, `GOV`,
  `PIC`, …) later in the same paragraph — it is prefix-table membership,
  not REQ-ID number-set membership, and is governed separately.

## Relationships

None
# T03 - `InvokeInfraError.cause: "model_unresolved"` collides with the `loom/load/model-unresolved` namespace

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `InvokeInfraError.cause` enum arm `"model_unresolved"` collides at the name level with the unrelated load-time diagnostic `loom/load/model-unresolved` (the `model:`-resolution failure that fires in any mode at load time). The arm is produced only by the subagent pre-spawn model guard, whose diagnostic code carries the disambiguated form `loom/runtime/subagent-model-unresolved`, but the bare cause literal drops the `subagent` qualifier. An author reading a `match` arm on `InvokeInfraError.cause` has no name-level signal distinguishing this from the load-time concept, and the corpus convention (`loom/load/binder-model-unresolved` vs `loom/runtime/subagent-model-unresolved`) is to keep the two namespaces distinct via a qualifier.

## Solution approach

Rename the `cause` enum literal from `"model_unresolved"` to `"subagent_model_unresolved"` on all three surfaces that carry it: the `InvokeInfraError` `cause` enum in `errors-and-results/queryerror-variants.md`, the `Err(InvokeInfraError { ... cause: "model_unresolved", ... })` sentence under `subagent.md`'s `id="subagent-pre-spawn-model-guard"` paragraph, and the `loom/runtime/subagent-model-unresolved` row in `diagnostics/code-registry-runtime.md`. The new literal mirrors the diagnostic code's `subagent-model-unresolved` form folded to snake_case, matching the existing discriminator convention.

## Solution constraints

- Out of scope: the `loom/runtime/subagent-model-unresolved` diagnostic code string itself and its anchor — only the `cause` enum literal value changes, not the registry code.

## Relationships

None

