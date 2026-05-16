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

## T19d — Populate cancelled-by-session-shutdown details with invocation_id

> **PARKED** — 2026-05-16T17:58:00Z
> **Reason:** The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Classifier early-exited on must-fix-blocked-by-scope-guard with 1 blocked finding (spec-lens-consistency merge of assumptions+consistency+implementability Finding 1: `entry.invocationId` reads in the new prose are unsourceable from the `ActiveInvocationRegistry` contract, which pins only `{loomAbort, disposeBarrier, shutdownReason, loom}` — no `invocationId` member). The originating finding's score S=100 (high importance, must-fix); cumulative sum Σ not computed because the early exit fires before per-pass scoring (n/a / n/a / n/a). The blocking remediations are mutually exhaustive and each foreclosed: adding `invocationId` to the registry entry shape is T19a's owned surface (guard 3); re-deriving at the emission site or via a parallel channel is forbidden by guard 1. T19d is therefore ordering-blocked behind T19a — a human must land T19a (or merge T19a/T19d into a single finding) before T19d can converge. severity p1 raised{high:1} fixed{} deferred{} blocked{high:1} (only the blocking finding was classified; 4 other raised findings remained unclassified per the classifier's "do not classify after early-exit" rule). stage1=0. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/t19d-populate-cancelled-by-session-shutdown-details-with-invocation-id.md

# T19d — Populate cancelled-by-session-shutdown details with invocation_id

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `Per-invocation operator visibility (clean-cancel path)` rule under `id="session-shutdown-semantics"` in `docs/spec_topics/pi-integration-contract.md` pins the per-invocation `finally`'s `loom/runtime/cancelled-by-session-shutdown` emission as the teardown-time operator-visibility surface, currently populating `details.event.reason` (read from the registry entry's `shutdownReason`) and `details.event.loom` (read from the registry entry's `loom`). Sibling T19a extends `ActiveInvocationRegistry` entries with an `invocationId` field and sibling T19b adds `invocation_id` to `RuntimeEvent`, but the cleanly-cancelled per-invocation note has no spec rule pinning that `details.event.invocation_id` is populated. Without it, cleanly-cancelled concurrent siblings of the same loom collapse onto the same operator-stream row at teardown even after the registry source and wire field exist. The `loom/runtime/cancelled-by-session-shutdown` row in `docs/spec_topics/diagnostics.md` and the nesting convention under `id="session-shutdown-details-conventions"` in the same file inherit the same gap on the diagnostics-side surface.

## Solution approach

Extend the `Per-invocation operator visibility (clean-cancel path)` rule under `id="session-shutdown-semantics"` in `docs/spec_topics/pi-integration-contract.md` to pin that the per-invocation `finally`'s `cancelled-by-session-shutdown` emission populates `details.event.invocation_id` by reading the registry entry's `invocationId` field (the same channel by which `details.event.loom` is read), not by re-deriving an id at the emission site. Mirror the addition in the `loom/runtime/cancelled-by-session-shutdown` row of `docs/spec_topics/diagnostics.md` and in the nesting-convention paragraph under `id="session-shutdown-details-conventions"` in the same file if and only if those locations enumerate the `details.event` field set; otherwise carry no diagnostics-side enumeration drift.

## Solution constraints

- Source `details.event.invocation_id` from the `ActiveInvocationRegistry` entry's `invocationId` field on the per-invocation `finally` (the same channel by which `details.event.loom` is read); do not re-derive an id at the emission site and do not introduce a parallel id channel.
- Preserve the existing `details.event.reason` clauses (the `"quit" | "reload" | "new" | "resume" | "fork" | string` type pin, the four captured-value cases under the **Unknown-reason rule**, the `"<unreadable>"` sentinel rules including the post-deadline residual-gap arm) and the `details.event.loom` clause textually unchanged.
- The `ActiveInvocationRegistry` entry-shape change, the `RuntimeEvent` wire-field addition, the dedup-key widening, and the real-time timing paragraph are owned by T19a, T19b, T19c, and T19e respectively.
- Do not introduce a new diagnostic code or `details.kind` discriminator.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve (this child reads the registry entry T19a defines).
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.


---

## T19b — Add invocation_id field to RuntimeEvent payload declaration

> **PARKED** — 2026-05-16T19:05:00Z
> **Reason:** The inner spec-diff-fix-loop diverged: the most recent pass produced more fix-class findings than the previous one. FIXCOUNTS: 6,3,0,4,4,5. Loop notes: Divergence fired at pass 6 (fixCounts[-1]=5 > fixCounts[-2]=4 with both pass 6 and pass 5 outside stageBoundaryPasses). Severity trajectory: p1 raised{blocker:1,high:2,medium:2,NIT:2} fixed{blocker:1,high:2,medium:1,NIT:1} deferred{medium:1,NIT:1}; p2 raised{blocker:1,medium:3,low:0,NIT:0} fixed{blocker:1,medium:3} deferred{low:1}; p3-rerun raised{blocker:1,high:2,medium:6} fixed{high:0,medium:3} deferred{blocker:1,high:2,medium:3}; p3-converge(stage-1) raised{medium:2,low:1,NIT:1} fixed{} deferred{medium:2} ignored{low:1,NIT:1}; p4(stage-2 first) raised{high:3,medium:2,low:3,NIT:1} fixed{high:3,medium:1} deferred{medium:1,low:3,NIT:1}; p5 raised{high:1,medium:3,low:1} fixed{high:1,medium:2,low:1} deferred{low:1}; p6 raised{medium:5,low:2} fixed{medium:5,low:2} (DISCARDED un-applied per termination ordering) deferred{medium:1,low:1}. Surface-expansion detector fired once at pass 3 of original trajectory (scoreSum 362→181→381, 381>1.5×181); backtracked to pass-2 entry state and poisoned all 4 pass-2 fixes (tied on file overlap). Re-execution converged stage 1 at pass 3 (fixCount=0; advanced stage 1→2 with stageBoundaryPasses={3}). Stage 2 expanded the active lens set with placement/scope/external-entities at pass 4; subsequent passes accumulated structural placement findings asking to relocate cascade-twin MUSTs and dedup-tuple non-membership rules into the **Deduplication and lifetime rules** section — every such fix was refused per ScopeGuard 4 ([default] edit-only-within-RuntimeEvent-block) and ScopeGuard 2 (T19c-owned dedup-and-lifetime surface), causing the same placement findings to re-surface across passes 4/5/6 and ultimately to ramp fixCount from 4→4→5. Diagnosis: T19b's edit surface (the single field comment) is structurally insufficient to absorb the cascade-twin and dedup-tuple obligations that grew on it during the loop; the placement lens correctly identifies that those obligations belong in T19c's dedup-and-lifetime surface but T19c is parked. A human should reshape the originating Recommendation — either by widening T19b's scope guards to permit pre-installing the dedup-section bullets that T19c will own, or by parking T19b until T19c lands first and provides the natural landing zones for the cascade-twin verbatim-copy MUST and the dedup-tuple non-membership rule. Stage trajectory: stage1=3 stage2=3. Snapshot refs under refs/loom/snapshots/2026-05-16T18-34-43_38775d/{baseline,pass-1..pass-6} retained for forensics.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/t19b-add-invocation-id-field-to-runtimeevent-payload-declaration.md

# T19b — Add invocation_id field to RuntimeEvent payload declaration

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `type RuntimeEvent = { ... }` declaration in the **Runtime event channel** section of `docs/spec_topics/pi-integration-contract.md`, introduced by the sentence pinning the shape as "normative and additive-only", carries no per-invocation correlation field. Sibling T19a sources an `invocationId` from the `ActiveInvocationRegistry` entry, but the wire payload has no destination for that value, so operator-side consumers of the always-log channel cannot distinguish concurrent-sibling emissions from the same loom. T19c's dedup-key widening and T19d's cancelled-by-session-shutdown details population both read this field and require it to be present on the wire shape.

## Solution approach

Add a required `invocation_id: string` field to the `type RuntimeEvent = { ... }` declaration in the **Runtime event channel** section of `docs/spec_topics/pi-integration-contract.md`. Rely on the existing "normative and additive-only" sentence above the declaration to characterise the addition; do not re-author that contract note here. Do not edit the surrounding prose, the dedup-tuple statements, or any sibling-owned surface.

## Solution constraints

- Preserve every existing `RuntimeEvent` field (`kind`, `code`, `loom`, `query_site`, `message`, `attempts`, `tokens_used`, `masked`, `occurred_at`) verbatim — same name, type, optionality marker, inline comment, and order.
- The `ActiveInvocationRegistry` entry-shape change, the dedup-tuple widening, the cancelled-by-session-shutdown details addition, and the sibling timing paragraph are owned by T19a, T19c, T19d, and T19e respectively.
- Do not introduce a new diagnostic code, `details.kind` discriminator, aggregation surface, or storm-detection layer.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve (this child consumes the field T19a sources).
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.


---

## T19a — Extend ActiveInvocationRegistry entry shape with invocationId

> **PARKED** — 2026-05-16T23:00:00Z
> **Reason:** The inner spec-diff-fix-loop limit-cycled: non-monotone non-zero fix-class counts across the last four passes. FIXCOUNTS: 2,3,3,4,3. Loop notes: Limit-cycle on fixCounts trajectory [2,3,3,4,3] with last-4 window [3,3,4,3] non-monotone and all >0; divergence did not fire. Surface-expansion fired once on the original pass 4, poisoned spec-lens-completeness:03 and spec-lens-traceability:05, backtracked successfully, but pass 4 re-introduced a near-equivalent runtime-validation finding under a different NN slot that the classifier did not mark poisoned; applying it on pass 4 fed the limit-cycle on pass 5 as adjacent lenses (assumptions, completeness, traceability) emitted multiple ~25-score findings about the new validation clause's mechanism/scope/atomicity. Per-pass severity (raised/fixed/deferred/blocked): p1{high:1,medium:1}/{high:1,medium:1}/{}/{}; p2{high:1,medium:2}/{high:1,medium:2}/{}/{}; p3{medium:2,low:1}/{medium:2,low:1}/{}/{}; p4{medium:3,NIT:2}/{medium:2,NIT:1}/{NIT:1}/{}; p5{medium:3,low:2,NIT:1}/{medium:2,low:1}(DISCARDED)/{medium:1,low:1,NIT:1}/{}. Stage trajectory: stage1=5. Recommended human reshaping: narrow the originating T19a edit to omit enforceable MUSTs on the generator's return value (keep only the syntactic `invocationId: string` declaration plus a non-normative-illustrative generator example), or split T19a into smaller pieces.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/t19a-extend-activeinvocationregistry-entry-shape-with-invocationid.md

# T19a — Extend ActiveInvocationRegistry entry shape with invocationId

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `ActiveInvocationRegistry` entry shape declared under `id="active-invocation-registry"` in `docs/spec_topics/pi-integration-contract.md` carries no per-invocation correlation key — its current `Set<{ loomAbort: AbortController; disposeBarrier: Promise<void>; shutdownReason: string | undefined; loom: string }>` shape lets two concurrent sibling invocations of the same loom be indistinguishable on every downstream operator surface that reads from the registry. Sibling T19b adds an `invocation_id` wire field to `RuntimeEvent`, T19c widens the always-log dedup tuple to include it, and T19d populates `details.event.invocation_id` on the per-invocation `cancelled-by-session-shutdown` emission — all three rely on a canonical registry-side source for the id that does not yet exist. Without a per-entry id minted at registry-insertion time, none of the sibling consumers can populate or dedup on a stable per-invocation discriminator, and same-tick sibling fan-out collapses on every operator surface regardless of how the wire shape evolves.

## Solution approach

Extend the `ActiveInvocationRegistry` entry-shape `Set<...>` declaration under `id="active-invocation-registry"` in `docs/spec_topics/pi-integration-contract.md` with a required `invocationId: string` member, and pin in the section's contract paragraph that each entry's `invocationId` is sourced via `crypto.randomUUID()` at the registry-insertion site (slash-command handler entry, `tool.execute(...)` adapter entry, and `invoke` spawn-site entry) inside the existing **Dispatch-site setup wrap** `try`/`catch` before any awaitable work, and is set on entry creation and never mutated thereafter. The exact identifier name, type, derivation primitive, and insertion-site placement are the substance of the change and are pinned as part of the registry-shape extension.

## Solution constraints

- Preserve the existing entry-shape members (`loomAbort: AbortController`, `disposeBarrier: Promise<void>`, `shutdownReason: string | undefined`, `loom: string`) verbatim — same name, type, optionality marker, and order.
- Do not introduce a parallel id channel and do not re-derive an id at any downstream emission site; T19c's dedup-key widening and T19d's `details.event.invocation_id` population both depend on a single registry-sourced value.
- The `RuntimeEvent` `invocation_id` wire field, the always-log dedup-tuple widening, the `cancelled-by-session-shutdown` details addition, and the real-time sibling emission-timing paragraph are owned by T19b, T19c, T19d, and T19e respectively.
- Do not introduce a new diagnostic code, `details.kind` discriminator, aggregation surface, or storm-detection layer.

## Relationships

- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede (any decision to add operator-visibility for successful sibling outcomes will reuse the `invocation_id` field this child installs).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.
