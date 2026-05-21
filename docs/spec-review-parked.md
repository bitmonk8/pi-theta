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

## T16e — PIC step 2 internal contradiction: literal `pi.setActiveTools([...snapshot, ...names])` call shape vs natural-language "exactly the loom's declared callable set"

> **PARKED** — 2026-05-20T17:21:16Z
> **Reason:** Category 1 (malformed finding — Solution approach binding surface; the approach is bimodal / two-site / multi-axis, licensing the fixer's surface-expansion as a symptom). The inner spec-diff-fix-loop's surface-expansion detector fired on two consecutive backtrack-and-exclude passes without converging, AND LoopNotes contains a Category-1 discriminator (two-site / bimodal / multi-site / multi-axis / no-canonical-home). FIXCOUNTS: 1,0,1,1. SCORESUMS: 100,0,5,25 against S=100. Loop notes: Surface-expansion two-strikes exit (sub-variant surface-expansion-irrecoverable-bimodal, CATEGORY 1). T16e's Solution approach is bimodal ("Either (a) snapshot-union or (b) snapshot-replaced"); the top-level fixer picked shape (b), and every loop iteration that added prose to justify the snapshot-replaced semantics attracted multi-axial lens critique. Trigger trajectory: pass-2 assumptions:01 (no-inheritance rationale) → pass-3 3-finding surface; pass-3 re-run traceability:01 → pass-4 contradiction with Restore-failure protocol; backtrack-and-exclude assumptions:02 + placement:01 → pass-5 re-cascade; backtrack consistency:01 → same surface again. Score-sum 100, 0, 5, 25 against k=1.5. Two consecutive backtrack passes poisoned placement:01 and consistency:01. Side-effect: pass-1 applied a cross-doc edit to docs/plan_topics/v14-tool-calls.md (out-of-loop-scope); reverted before parking. Human action: reshape T16e's Solution approach — pick one shape at authoring time and remove the bimodal "Either (a)... or (b)..." phrasing, OR split T16e per-shape, OR cap the prose-budget. OriginDir: /c/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T17-18-09_1d907a/_origin. A human must reshape this finding — declare a canonical home, split into per-site atoms, pick one branch of the bimodal approach, or enumerate the multi-axis dimensions — before re-introducing it.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-20T16-01-36_59fbed/t16e-pic-step-2-internal-contradiction-literal-pi-setactivetools-snapshot-name.md`

# T16e — PIC step 2 internal contradiction: literal `pi.setActiveTools([...snapshot, ...names])` call shape vs natural-language "exactly the loom's declared callable set"

**Kind:** consistency
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

Step 2 of the `Around each query` enumeration under **Tool-registration lifetime and visibility** in `docs/spec_topics/pi-integration-contract.md` reads: ``Call `pi.setActiveTools([...snapshot, ...loomCallableSetNames, respondToolName?])` — the set the model sees for this turn is exactly the loom's declared callable set, plus the respond tool when the turn is a typed-query response turn.`` The literal call argument `[...snapshot, ...loomCallableSetNames, respondToolName?]` produces the **union** of the user-session snapshot and the loom's declared callable set (plus optionally the respond tool); the natural-language gloss that immediately follows asserts that the set the model sees is **exactly** the loom's declared callable set (plus optionally the respond tool), which excludes the snapshot. The two sentences are mutually exclusive — either the snapshot is part of the model's visible set for the turn or it is not — and a reader cannot determine which shape is normative. T16b's reshape of the `docs/spec.md` Trust-boundary callable-set paragraph depends on PIC owning a single, coherent prompt-mode visibility rule to forward-link to; with both shapes live in the cited owner section, T16b cannot characterise prompt-mode visibility without inheriting the contradiction.

## Solution approach

Resolve the contradiction at the source by picking one shape for prompt-mode query visibility under **Tool-registration lifetime and visibility** in `docs/spec_topics/pi-integration-contract.md`. Either (a) rewrite the natural-language gloss in step 2 to match the literal `[...snapshot, ...loomCallableSetNames, respondToolName?]` call — the set the model sees is the user-session snapshot unioned with the loom's declared callable set (and the respond tool on a typed-query response turn), keeping the snapshot/restore protocol's existing behaviour explicit; or (b) rewrite the literal call to match the natural-language gloss — `pi.setActiveTools([...loomCallableSetNames, respondToolName?])` with no snapshot union — and adjust the surrounding paragraphs (the `If another extension calls pi.setActiveTools` consequence in the same section, and any downstream `spec.md`-side framing of the per-mode callable-set rule) accordingly. Pick whichever shape is intended by the V1 prompt-mode design; do not introduce a third shape and do not preserve both.

## Solution constraints

- Do not widen the V1 prompt-mode callable surface beyond what one of the two existing shapes already authorises; the resolution picks between (a) snapshot-union (current literal call) and (b) snapshot-replaced (current natural-language gloss).
- Do not introduce a new type, a new SDK call, or a new `details.kind` discriminator; the edit is a prose / call-literal reconciliation inside the existing step 2.
- Do not touch the subagent-mode `createAgentSession({ customTools, ... })` paragraph; subagent-mode visibility is a separate mechanism unaffected by this contradiction.
- The `docs/spec.md` Trust-boundary callable-set paragraph is owned by T16b — out of scope here.

## Relationships

- T16b "Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names" — must-precede (T16b's prompt-mode visibility characterisation cannot land until PIC step 2 owns a single coherent rule for it to forward-link to).

---

## T19a — Extend ActiveInvocationRegistry entry shape with invocationId

> **PARKED** — 2026-05-21T00:00:00Z
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 6,5. Loop notes: Cluster-mode run on 4-member MULTI: cluster (T19a/T19b/T19d/T19e). Exit via must-fix-blocked / sub-rationale score-budget-exhausted-trust-override-suppressed: Rec O pass-level shadow-budget gate fired on re-attempted pass 3 with Sigma_shadow=427 across 13 non-blocker raised findings against S=100 (k*S threshold=300; breach margin Sigma-S=327, breach multiplier 4.27x); 12 of 13 findings carried non-trivial Trust impact entries that would have suppressed the per-finding (c-bis) score-budget exit absent the gate; 0 blocker-tier findings, 13 score-budget-counted findings. Origin reshape required: raise the cluster's score, split into per-axis atoms, or narrow the Solution approach. Trajectory before exit: scoreSum=205,186 across passes 1-2; passes 3-4 rewound after C2 surface-expansion detector at pass 4 (scoreSum 162 > 1.5*106) poisoned all 4 pass-3 diagnostics.md fixes; re-pass-3 hit Rec O immediately. Narrowed chunk: docs/spec_topics/pi-integration-contract.md#real-time-sibling-emission-timing (T19e's appended paragraph). OriginDir: /c/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T20-44-14_96ab3b/_origin. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-20T16-01-36_59fbed/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b.md`

# T19a — Extend ActiveInvocationRegistry entry shape with invocationId

**Kind:** error-model
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** multiple
**State:** reduced

## Problem

The `ActiveInvocationRegistry` entry shape declared under `id="active-invocation-registry"` in `docs/spec_topics/pi-integration-contract.md` carries no per-invocation correlation key — its current `Set<{ loomAbort: AbortController; disposeBarrier: Promise<void>; shutdownReason: string | undefined; loom: string }>` shape lets two concurrent sibling invocations of the same loom be indistinguishable on every downstream operator surface that reads from the registry. Sibling T19b adds an `invocation_id` wire field to `RuntimeEvent`, T19c widens the always-log dedup tuple to include it, and T19d populates `details.event.invocation_id` on the per-invocation `cancelled-by-session-shutdown` emission — all three rely on a canonical registry-side source for the id that does not yet exist. Without a per-entry id minted at registry-insertion time, none of the sibling consumers can populate or dedup on a stable per-invocation discriminator, and same-tick sibling fan-out collapses on every operator surface regardless of how the wire shape evolves.

## Solution approach

Extend the `ActiveInvocationRegistry` entry-shape `Set<...>` declaration under `id="active-invocation-registry"` in `docs/spec_topics/pi-integration-contract.md` with a required `invocationId: string` member, and pin in the section's contract paragraph that each entry's `invocationId` is established at the registry-insertion site (slash-command handler entry, `tool.execute(...)` adapter entry, and `invoke` spawn-site entry) inside the existing **Dispatch-site setup wrap** `try`/`catch` before any awaitable work, and is set on entry creation and never mutated thereafter. The identifier follows the corpus's existing `<invocation-id>` / `<uuid>` convention (see [Diagnostics — Identifier-, descriptor-, and closed-enum placeholders](./diagnostics.md#7-identifier-descriptor-and-closed-enum-placeholders)); the name, type, and set-once semantics are load-bearing because the co-resolve siblings T19b/c/d depend on a single registry-sourced value.

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

---

## T19b — Add invocation_id field to RuntimeEvent payload declaration

> **PARKED** — 2026-05-21T00:00:00Z
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 6,5. Loop notes: Cluster-mode run on 4-member MULTI: cluster (T19a/T19b/T19d/T19e). Exit via must-fix-blocked / sub-rationale score-budget-exhausted-trust-override-suppressed: Rec O pass-level shadow-budget gate fired on re-attempted pass 3 with Sigma_shadow=427 across 13 non-blocker raised findings against S=100 (k*S threshold=300; breach margin Sigma-S=327, breach multiplier 4.27x); 12 of 13 findings carried non-trivial Trust impact entries that would have suppressed the per-finding (c-bis) score-budget exit absent the gate; 0 blocker-tier findings, 13 score-budget-counted findings. Origin reshape required: raise the cluster's score, split into per-axis atoms, or narrow the Solution approach. Trajectory before exit: scoreSum=205,186 across passes 1-2; passes 3-4 rewound after C2 surface-expansion detector at pass 4 (scoreSum 162 > 1.5*106) poisoned all 4 pass-3 diagnostics.md fixes; re-pass-3 hit Rec O immediately. Narrowed chunk: docs/spec_topics/pi-integration-contract.md#real-time-sibling-emission-timing (T19e's appended paragraph). OriginDir: /c/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T20-44-14_96ab3b/_origin. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-20T16-01-36_59fbed/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b.md`

# T19b — Add invocation_id field to RuntimeEvent payload declaration

**Kind:** error-model
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** multiple
**State:** reduced

## Problem

The `type RuntimeEvent = { ... }` declaration in the **Runtime event channel** section of `docs/spec_topics/pi-integration-contract.md`, introduced by the sentence pinning the shape as "normative and additive-only", carries no per-invocation correlation field. Sibling T19a sources an `invocationId` from the `ActiveInvocationRegistry` entry, but the wire payload has no destination for that value, so operator-side consumers of the always-log channel cannot distinguish concurrent-sibling emissions from the same loom. T19c's dedup-key widening and T19d's cancelled-by-session-shutdown details population both read this field and require it to be present on the wire shape.

## Solution approach

Add a required `invocation_id: string` field to the `type RuntimeEvent = { ... }` declaration in the **Runtime event channel** section of `docs/spec_topics/pi-integration-contract.md`. Rely on the existing "normative and additive-only" sentence above the declaration to characterise the addition; do not re-author that contract note here.

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

## T19d — Populate cancelled-by-session-shutdown details with invocation_id

> **PARKED** — 2026-05-21T00:00:00Z
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 6,5. Loop notes: Cluster-mode run on 4-member MULTI: cluster (T19a/T19b/T19d/T19e). Exit via must-fix-blocked / sub-rationale score-budget-exhausted-trust-override-suppressed: Rec O pass-level shadow-budget gate fired on re-attempted pass 3 with Sigma_shadow=427 across 13 non-blocker raised findings against S=100 (k*S threshold=300; breach margin Sigma-S=327, breach multiplier 4.27x); 12 of 13 findings carried non-trivial Trust impact entries that would have suppressed the per-finding (c-bis) score-budget exit absent the gate; 0 blocker-tier findings, 13 score-budget-counted findings. Origin reshape required: raise the cluster's score, split into per-axis atoms, or narrow the Solution approach. Trajectory before exit: scoreSum=205,186 across passes 1-2; passes 3-4 rewound after C2 surface-expansion detector at pass 4 (scoreSum 162 > 1.5*106) poisoned all 4 pass-3 diagnostics.md fixes; re-pass-3 hit Rec O immediately. Narrowed chunk: docs/spec_topics/pi-integration-contract.md#real-time-sibling-emission-timing (T19e's appended paragraph). OriginDir: /c/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T20-44-14_96ab3b/_origin. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-20T16-01-36_59fbed/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b.md`

# T19d — Populate cancelled-by-session-shutdown details with invocation_id

**Kind:** error-model
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** multiple
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

## T19e — Add real-time sibling emission timing paragraph

> **PARKED** — 2026-05-21T00:00:00Z
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 6,5. Loop notes: Cluster-mode run on 4-member MULTI: cluster (T19a/T19b/T19d/T19e). Exit via must-fix-blocked / sub-rationale score-budget-exhausted-trust-override-suppressed: Rec O pass-level shadow-budget gate fired on re-attempted pass 3 with Sigma_shadow=427 across 13 non-blocker raised findings against S=100 (k*S threshold=300; breach margin Sigma-S=327, breach multiplier 4.27x); 12 of 13 findings carried non-trivial Trust impact entries that would have suppressed the per-finding (c-bis) score-budget exit absent the gate; 0 blocker-tier findings, 13 score-budget-counted findings. Origin reshape required: raise the cluster's score, split into per-axis atoms, or narrow the Solution approach. Trajectory before exit: scoreSum=205,186 across passes 1-2; passes 3-4 rewound after C2 surface-expansion detector at pass 4 (scoreSum 162 > 1.5*106) poisoned all 4 pass-3 diagnostics.md fixes; re-pass-3 hit Rec O immediately. Narrowed chunk: docs/spec_topics/pi-integration-contract.md#real-time-sibling-emission-timing (T19e's appended paragraph). OriginDir: /c/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T20-44-14_96ab3b/_origin. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-20T16-01-36_59fbed/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b.md`

# T19e — Add real-time sibling emission timing paragraph

**Kind:** error-model
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** multiple
**State:** reduced

## Problem

The **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` pins exactly-once-per-origin emission semantics for `loom-system-note` always-log notes and lists Deduplication and lifetime rules, but does not pin emission timing across concurrent sibling invocations. An implementer reading the section could legally batch sibling always-log emissions until the parent's tool-loop round closes — deferring operator-visible failure timing — without violating any existing rule on the page. The omission also leaves V18q's concurrent-sibling emission tests without a normative anchor for whether sibling failures must surface in real time at the originating site.

## Solution approach

Extend the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` to pin the emission timing of sibling always-log notes on `loom-system-note`. The section must establish that each sibling emission surfaces in real time at its originating site (batching across the parent's tool-loop round is not permitted), with V18q's concurrent-sibling tests as the binding behavioural anchor. The relative interleaving order across concurrent sibling origins follows the host JavaScript runtime's event-loop scheduling and is operator-observable; no test asserts a specific cross-sibling interleaving sequence.

## Solution constraints

- Do not relocate or reword the existing paragraphs in the section.
- The `ActiveInvocationRegistry` entry-shape change, the `RuntimeEvent` `invocation_id` wire field, the dedup-key widening, and the cancelled-by-session-shutdown details change are owned by T19a, T19b, T19c, and T19d respectively.
- Do not introduce a new diagnostic code, `details.kind` discriminator, aggregation surface, or storm-detection layer.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve.
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.


---

## T18b — Add per-mode operator-side null sentences to slash-invocation.md

> **PARKED** — 2026-05-21T01:16:36Z
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Classifier early-exit on stage-1 pass-1 with sub-rationale `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate). 5 findings counted; S=25 (medium origin), Sigma_shadow=76, k*S=75, breach margin 51. 1 blocker on must-fix:true error-model defect: the new "operator-visible failure surface" tail clause names a `Top-level Err in prompt mode` template that does not fire when a `mode: subagent` loom is the top-level slash-dispatch entry. 5 findings raised{high:1,medium:3,NIT:1}, all blocked. Reshape: split T18b per-axis (per-mode null sentence vs operator-surface enumeration vs cross-reference-anchor strategy), raise the score, or narrow the Solution approach to author only the null sentence and defer enumeration to the PIC. OriginDir: /c/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-21T01-14-08_7f7723/_origin. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-20T16-01-36_59fbed/t18b-add-per-mode-operator-side-null-sentences-to-slash-invocation-md.md`

# T18b — Add per-mode operator-side null sentences to slash-invocation.md

**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **prompt mode** and **subagent mode** bullets under *Once a loom is invoked* in `docs/spec_topics/slash-invocation.md` describe the per-mode invocation and conversation-driving surfaces but neither bullet states the operator-side success-outcome null — that a successfully terminating loom emits no `loom-system-note` and that the operator-visible surfaces on success are the per-mode conversation / programmatic-return-value pair only. Sibling T18a installs the central success-side null-policy paragraph in the PIC **Runtime event channel** section, but a reader of `slash-invocation.md` must triangulate against PIC and `docs/spec_topics/invocation.md` to confirm the absence of a terminal operator-side note is deliberate rather than an under-specified surface.

## Solution approach

Add one per-surface null sentence to each of the **prompt mode** and **subagent mode** bullets under *Once a loom is invoked* in `docs/spec_topics/slash-invocation.md`. Each sentence restates, at the per-mode operator-surface level, the success-side null-policy that T18a installs centrally in the PIC **Runtime event channel** section: the prompt-mode sentence names `loom-system-note` and asserts no such note is emitted on successful termination, identifying the driven conversation as the operator-visible surface; the subagent-mode sentence asserts that the operator sees no terminal note on success (the subagent transcript is private and the return value reaches only the programmatic caller) and identifies the pre-start binder echo and the failure-side top-level `Err` note as the operator-visible surfaces. Do not author the central rule — restate the per-mode consequence and rely on T18a's PIC paragraph for the normative source.

## Solution constraints

- Do not modify the pre-existing per-mode framing in either bullet (the prompt-mode current-conversation-driving description and `Ok`-return-value-not-surfaced-to-user clause; the subagent-mode fresh-isolated-conversation description and return-value-only-reaches-caller clause).
- The central success-side null-policy paragraph (T18a), the `spec.md` aggregator forward-link (T18c), and the V18q test clause (T18d) are owned elsewhere — out of scope here.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow (the central rule must land first).
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — co-resolve.
