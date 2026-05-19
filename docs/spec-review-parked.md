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

## T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test

> **PARKED** — 2026-05-19
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Classifier early-exit on pass 1 via Rec O pass-level shadow-budget gate; sub-rationale score-budget-exhausted-trust-override-suppressed; S=25 (T03e heading absent from spec-review.md, defaulted from cluster siblings T03b/T03c/T03d carrying Importance=medium → score 25), Σ_shadow=101, breach margin Σ_shadow−S=76 (multiplier ≈ 4.04× exceeds k=3 gate threshold of 75); 2 non-blocker raised findings counted toward shadow budget, 1 trust-overridden; 7 tier-1 lenses dispatched, 4 silent, 3 raised (assumptions/consistency/implementability merged per triage Step 1.5 into Finding A high:1 with trust-override impact entry on reader mental-model of cross-package Pi engines.node gating; traceability raised Finding B NIT:1 on bare-paraphrase cross-reference style). severity p1 raised{high:1,NIT:1} fixed{} deferred{} blocked{high:1,NIT:1}; stage1=1; narrowings=0+0+0+0; stage1Touched=0 mode-e-refusals=0. Originating T03e finding admits three reshape paths per classifier hints: raise T03e's score to ~100..125, narrow Solution approach to the revert option ("matching ... floor"), or split into verifier-naming + hyperlink-style axes. Snapshot refs retained for forensics under refs/loom/snapshots/2026-05-19T10-54-34_d30c6e. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t03e-update-spec-md-host-runtime-item-1-rephrase-to-delegate-the-engines-node-eq.md

# T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test

**Kind:** consistency, traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md` Orientation > Prerequisites > Host runtime item 1 (the **Node version floor** bullet) currently asserts that the loom runtime's Node floor matches `@mariozechner/pi-coding-agent`'s `engines.node` floor as a bare prose equivalence, with no named audit mechanism. T03b adds a `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `docs/plan_topics/h1-scaffold.md`, and T03f extends the H1 SDK surface-inventory literal-read test to assert cross-package equality between the two floors; the spec sentence needs to name that test as the auditor rather than reading like a manual coincidence between two unrelated literals.

## Solution approach

In `docs/spec.md` Orientation > Prerequisites > Host runtime item 1 (the **Node version floor** bullet), rewrite the phrase "matching `@mariozechner/pi-coding-agent`'s `engines.node` floor" to "verified equal to `@mariozechner/pi-coding-agent`'s `engines.node` floor by the H1 SDK surface-inventory test." The rest of item 1 — the literal `>=20.6.0`, the SemVer-comparison parenthetical, the `details.kind = "node-floor"` discriminator forward-link, the `loom/load/host-incompatible` emission contract forward-link, and the bump-procedure forward-link — stands unchanged.

## Solution constraints

- The `pi-engines-node` `SDK_SURFACE_INVENTORY` row, the cross-package equality assertion, and the PIC bump-procedure step 3 narrative are owned by T03b, T03f, and T03d respectively — out of scope here.

## Relationships

- T03b "Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`" — must-follow (this finding's sentence references the test row T03b adds).
- T03f "`h1-scaffold.md` manifest assertion ..." — same-cluster (the test extension T03f installs is what the new sentence delegates to).

---

## T03b — Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t03e-update-spec-md-host-runtime-item-1-rephrase-to-delegate-the-engines-node-eq.md

# T03b — Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`

**Kind:** completeness, traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `SDK_SURFACE_INVENTORY` constant described in `docs/plan_topics/h1-scaffold.md` (under the SDK surface-inventory literal-read test bullet of the H1 leaf's test framework) enumerates the probe-relevant pinned surfaces (`node-floor`, `abortsignal-member`, `namespace-function`, `type-union-snapshot`, `load-time-resolution`, `strict-capability-probe`, `api-coverage`, `peer-dep-range`) but has no row representing Pi's `engines.node` floor as a cross-package surface. T03f extends the test infrastructure to assert cross-package equality between the loom package's `engines.node` literal and Pi's `engines.node` field, and T03d / T03e reference that assertion from the PIC bump procedure and the `spec.md` Host runtime item; without an inventory row holding Pi's floor as its own surface, that cross-package assertion has no shared source of truth with the rest of the inventory and degrades into a one-off test.

## Solution approach

Add one new row to the `SDK_SURFACE_INVENTORY` enumeration in `docs/plan_topics/h1-scaffold.md`, of the form `{ kind: "pi-engines-node", literal: ">=20.6.0" }`, alongside the existing `node-floor`, `abortsignal-member`, `namespace-function`, `type-union-snapshot`, `load-time-resolution`, `strict-capability-probe`, `api-coverage`, and `peer-dep-range` rows. The kind tag `pi-engines-node` is the surface name the cross-package equality assertion in T03f reads, and the literal records Pi's current `engines.node` floor so a future Pi bump that changes the floor lights up the assertion red. Frame the row as a sibling of the existing `node-floor` row (which holds the loom package's own floor) so the two together are the source of truth the cross-package equality test asserts on.

## Solution constraints

- The new row's `kind` discriminator must be the literal string `pi-engines-node` — T03d, T03e, and T03f all consume this surface name as their dedup key; a different tag silently breaks the chain.
- Do not introduce a parallel constant, a new test bullet, or a new H1 sub-leaf for it.
- The cross-package equality test, the PIC bump-procedure narrative, and the `spec.md` Host runtime sentence are owned by T03f, T03d, and T03e respectively — out of scope here.

## Relationships

- T03d "Update PIC Pi version-bump procedure step 3 ..." — must-precede (T03d's narrative names this row).
- T03e "Update `spec.md` Host runtime item 1 ..." — must-precede (T03e's sentence names the test that consumes this row).
- T03f "`h1-scaffold.md` manifest assertion ..." — must-precede (T03f's test extension uses this row as its source of truth).

---

## T03d — Update PIC Pi version-bump procedure step 3: replace manual-compare instruction with H1-test-fails-red narrative

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t03e-update-spec-md-host-runtime-item-1-rephrase-to-delegate-the-engines-node-eq.md

# T03d — Update PIC Pi version-bump procedure step 3: replace manual-compare instruction with H1-test-fails-red narrative

**Kind:** consistency, prescription
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

Step 3 ("Re-confirm the `engines.node` floor") of the `## Pi version bump procedure` (anchor `pi-version-bump-procedure`) in `docs/spec_topics/pi-integration-contract.md` currently instructs the contributor to manually compare `@mariozechner/pi-coding-agent`'s `engines.node` floor at the candidate version against the loom `package.json#engines.node` literal. Once T03b adds the `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `docs/plan_topics/h1-scaffold.md` and T03f extends the H1 manifest assertion to a cross-package equality check anchored on that row, the manual compare is obviated — the H1 test fails red automatically when the upstream floor moves, and the surviving manual-compare prescription contradicts the automatic detection on which side is authoritative.

## Solution approach

Rewrite step 3 of `## Pi version bump procedure` so the body reframes the step around the cross-package `engines.node` equality test (the H1 assertion T03f extends, sourced from the `pi-engines-node` `SDK_SURFACE_INVENTORY` row T03b adds) as the mechanical detector for upstream-floor movement, rather than a manual compare the contributor performs at bump time. Preserve the step's enumeration of co-edit sites that must move in the same commit when the test fails red — the loom `package.json#engines.node` literal, the [Step 0 (a)](#entry-capability-probe) comparator-and-floor reference, the [`spec.md` — Host runtime obligation 1](../spec.md#orientation) sentence, and the H1 assertion itself — so contributors retain the closure list the manual-compare narrative previously carried.

## Solution constraints

- Preserve the `id="pi-version-bump-procedure"` heading anchor and the integer step number `3` (inbound links and the procedure's existing step ordering depend on both).
- Co-resolve with T03f in the same commit; the bump procedure and the test must not disagree on which side is authoritative for the upstream-floor.

## Relationships

- T03b "Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`" — must-follow (the test row this finding's narrative names is added by T03b).
- T03f "`h1-scaffold.md` manifest assertion ..." — same-cluster (the test extension T03f installs is what this narrative delegates to).

---

## T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy

> **PARKED** — 2026-05-19
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 4. Loop notes: Sub-rationale score-budget-exhausted-trust-override-suppressed (Rec O pass-level shadow-budget gate). S=25, Σ_shadow=76, breach margin Σ-S=51 (multiplier ≈ 3.04× exceeds k=3 threshold of 75 by 1 point); 3 would-be trust-override admissions on pass 2 counted toward shadow budget. T18c heading absent from spec-review.md (top-level fixer already removed it); classifier defaulted to severity=medium / S=25 / mustFix=false per heading-absent lookup rule. Severity tally: p1 raised{high:1,medium:1,low:2} fixed{high:1,medium:1,low:2} deferred{} blocked{}; p2 raised{high:1,medium:3,NIT:1} fixed{} deferred{} blocked{high:1,medium:3,NIT:1} (the blocker is a cross-page contract contradiction Pass-1 fixes introduced: the prompt-mode Ok(v) "audience" parenthetical at docs/spec.md L52 inverts slash-invocation.md L19's normative contract that the Ok return value is NOT surfaced to the user). Stage trajectory: stage1=1. Narrowings tally: narrowings=0+0+0+0. Stage-transition tally: stage1Touched=1 mode-e-refusals=0. Snapshot namespace refs/loom/snapshots/2026-05-19T12-13-42_29db80 retained (baseline, baseline-post-top-level, pass-1, pass-2) for forensics. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md

# T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy

**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Runtime observability** bullet under `### Scope` in `docs/spec.md` (Orientation > Scope) describes only failure-side events on the `loom-system-note` channel and neither names nor forward-links the success-side null-policy — that a loom terminating with `Ok(v)` emits no `loom-system-note` event. Reviewers auditing the operator-visibility contract from this aggregator bullet must triangulate against the PIC **Runtime event channel** section and `docs/spec_topics/slash-invocation.md` to confirm the absence of a success-side emission is deliberate. Sibling T18a installs the central success-side null-policy paragraph in the PIC **Runtime event channel** section and T18b installs the per-mode operator-side null sentences in `slash-invocation.md`, but the spec.md aggregator bullet still gives no forward link to either, so the rule cannot be reached from the canonical entry surface.

## Solution approach

Widen the **Runtime observability** bullet under `### Scope` in `docs/spec.md` by adding a clarifying sentence that names the success-side null-policy on the `loom-system-note` channel and forward-links both the PIC **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` (the central success-side null-policy owner) and the **Once a loom is invoked** section in `docs/spec_topics/slash-invocation.md` (the per-mode operator-surface owner). Do not author the rule itself in `spec.md` — characterise the policy in one short sentence and rely on the link targets that siblings T18a and T18b install for the normative content. Preserve the bullet's existing failure-side framing and existing forward-links unchanged.

## Solution constraints

- Preserve every existing forward-link in the bullet (Glossary; PIC Runtime event channel; Diagnostics; Future Considerations — Richer runtime-event telemetry) — link text and targets unchanged.
- Preserve the bullet's existing failure-side framing (the *always-log set* Operator-facing runtime-failure framing, the disjoint `details`-shape sentence, the deferred-aggregation sentence) unchanged in normative content.
- The widening must name both forward-link targets (PIC **Runtime event channel** as the central owner, AND `slash-invocation.md` as the per-mode operator-surface owner); do not collapse to one link.
- The central success-side null-policy paragraph (T18a), the per-mode operator-side null sentences (T18b), and the V18q test clause (T18d) are owned elsewhere.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow.
- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — co-resolve.
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — co-resolve.

---

## T18a — Append success-side null-policy paragraph to PIC Runtime event channel

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md

# T18a — Append success-side null-policy paragraph to PIC Runtime event channel

**Kind:** completeness
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` enumerates the **always-log set** of failure outcomes that emit on the `loom-system-note` channel — including the explicit four-excluded-kinds paragraph (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) — but never makes the symmetric statement on the success side: that a loom terminating with `Ok(v)`, including a child loom whose `Ok` flows to its `invoke` parent, emits no event on that channel. Reviewers must triangulate against `docs/spec_topics/invocation.md` and the per-mode bullets in `docs/spec_topics/slash-invocation.md` to confirm the success-visible surfaces are programmatic-only, and the sibling per-surface restatements (T18b in `slash-invocation.md`, T18c in `spec.md`) and the V18q test clause (T18d) have no central spec sentence to anchor against.

## Solution approach

Add a success-side null-policy statement to the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` asserting that a loom terminating with `Ok(v)` — including the case where a child loom's `Ok` flows to its `invoke` parent — emits no event on the `loom-system-note` channel. Name the success-visible surfaces (the driven conversation in prompt mode and the programmatic return value in every mode).

## Solution constraints

- Scope the null-policy to the *terminal* outcome surface only; do not extend it to pre-evaluation surfaces (the binder echo on `bind_echo: true` and the no-params overflow note remain operator-visible regardless of terminal outcome).
- Do not add a "completed" parity note for subagent slash invocations — that re-opens the deferred aggregation / latency surface intentionally scoped out of V1.
- The per-mode operator-side null sentences in `slash-invocation.md`, the `spec.md` **Runtime observability** aggregator forward-link, and the V18q test clause are owned by T18b, T18c, and T18d respectively.
- Do not introduce a new diagnostic code, a new always-log `kind`, or a new `customType` value; the edit is one additive paragrap
## T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy

> **PARKED** — 2026-05-19
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 4. Loop notes: Sub-rationale score-budget-exhausted-trust-override-suppressed (Rec O pass-level shadow-budget gate). S=25, Σ_shadow=76, breach margin Σ-S=51 (multiplier ≈ 3.04× exceeds k=3 threshold of 75 by 1 point); 3 would-be trust-override admissions on pass 2 counted toward shadow budget. T18c heading absent from spec-review.md (top-level fixer already removed it); classifier defaulted to severity=medium / S=25 / mustFix=false per heading-absent lookup rule. Severity tally: p1 raised{high:1,medium:1,low:2} fixed{high:1,medium:1,low:2} deferred{} blocked{}; p2 raised{high:1,medium:3,NIT:1} fixed{} deferred{} blocked{high:1,medium:3,NIT:1} (the blocker is a cross-page contract contradiction Pass-1 fixes introduced: the prompt-mode Ok(v) "audience" parenthetical at docs/spec.md L52 inverts slash-invocation.md L19's normative contract that the Ok return value is NOT surfaced to the user). Stage trajectory: stage1=1. Narrowings tally: narrowings=0+0+0+0. Stage-transition tally: stage1Touched=1 mode-e-refusals=0. Snapshot namespace refs/loom/snapshots/2026-05-19T12-13-42_29db80 retained (baseline, baseline-post-top-level, pass-1, pass-2) for forensics. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md

# T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy

**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Runtime observability** bullet under `### Scope` in `docs/spec.md` (Orientation > Scope) describes only failure-side events on the `loom-system-note` channel and neither names nor forward-links the success-side null-policy — that a loom terminating with `Ok(v)` emits no `loom-system-note` event. Reviewers auditing the operator-visibility contract from this aggregator bullet must triangulate against the PIC **Runtime event channel** section and `docs/spec_topics/slash-invocation.md` to confirm the absence of a success-side emission is deliberate. Sibling T18a installs the central success-side null-policy paragraph in the PIC **Runtime event channel** section and T18b installs the per-mode operator-side null sentences in `slash-invocation.md`, but the spec.md aggregator bullet still gives no forward link to either, so the rule cannot be reached from the canonical entry surface.

## Solution approach

Widen the **Runtime observability** bullet under `### Scope` in `docs/spec.md` by adding a clarifying sentence that names the success-side null-policy on the `loom-system-note` channel and forward-links both the PIC **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` (the central success-side null-policy owner) and the **Once a loom is invoked** section in `docs/spec_topics/slash-invocation.md` (the per-mode operator-surface owner). Do not author the rule itself in `spec.md` — characterise the policy in one short sentence and rely on the link targets that siblings T18a and T18b install for the normative content. Preserve the bullet's existing failure-side framing and existing forward-links unchanged.

## Solution constraints

- Preserve every existing forward-link in the bullet (Glossary; PIC Runtime event channel; Diagnostics; Future Considerations — Richer runtime-event telemetry) — link text and targets unchanged.
- Preserve the bullet's existing failure-side framing (the *always-log set* Operator-facing runtime-failure framing, the disjoint `details`-shape sentence, the deferred-aggregation sentence) unchanged in normative content.
- The widening must name both forward-link targets (PIC **Runtime event channel** as the central owner, AND `slash-invocation.md` as the per-mode operator-surface owner); do not collapse to one link.
- The central success-side null-policy paragraph (T18a), the per-mode operator-side null sentences (T18b), and the V18q test clause (T18d) are owned elsewhere.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow.
- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — co-resolve.
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — co-resolve.

---

## T18a — Append success-side null-policy paragraph to PIC Runtime event channel

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md

# T18a — Append success-side null-policy paragraph to PIC Runtime event channel

**Kind:** completeness
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` enumerates the **always-log set** of failure outcomes that emit on the `loom-system-note` channel — including the explicit four-excluded-kinds paragraph (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) — but never makes the symmetric statement on the success side: that a loom terminating with `Ok(v)`, including a child loom whose `Ok` flows to its `invoke` parent, emits no event on that channel. Reviewers must triangulate against `docs/spec_topics/invocation.md` and the per-mode bullets in `docs/spec_topics/slash-invocation.md` to confirm the success-visible surfaces are programmatic-only, and the sibling per-surface restatements (T18b in `slash-invocation.md`, T18c in `spec.md`) and the V18q test clause (T18d) have no central spec sentence to anchor against.

## Solution approach

Add a success-side null-policy statement to the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` asserting that a loom terminating with `Ok(v)` — including the case where a child loom's `Ok` flows to its `invoke` parent — emits no event on the `loom-system-note` channel. Name the success-visible surfaces (the driven conversation in prompt mode and the programmatic return value in every mode).

## Solution constraints

- Scope the null-policy to the *terminal* outcome surface only; do not extend it to pre-evaluation surfaces (the binder echo on `bind_echo: true` and the no-params overflow note remain operator-visible regardless of terminal outcome).
- Do not add a "completed" parity note for subagent slash invocations — that re-opens the deferred aggregation / latency surface intentionally scoped out of V1.
- The per-mode operator-side null sentences in `slash-invocation.md`, the `spec.md` **Runtime observability** aggregator forward-link, and the V18q test clause are owned by T18b, T18c, and T18d respectively.
- Do not introduce a new diagnostic code, a new always-log `kind`, or a new `customType` value; the edit is one additive paragraph inside the existing section.

## Relationships

- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — must-precede (the central PIC paragraph must land before the slash-invocation restatement points at it).
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — must-precede (the bullet's forward-link target must exist).
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — must-precede (the test asserts against the spec sentence installed here).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (operator-surface gap on the failure side; symmetric to this child's success-side gap; co-resolve siblings T19b/c/d/e also relevant).
- T06 "Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers" — same-cluster.

---

## T19a — Extend ActiveInvocationRegistry entry shape with invocationId

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md

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

---

## T19b — Add invocation_id field to RuntimeEvent payload declaration

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md

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

## T19d — Populate cancelled-by-session-shutdown details with invocation_id

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md

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

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md

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

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md

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

---


## T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

> **PARKED** — 2026-05-19
> **Reason:** Category 1 (malformed finding — default attribution for top-level fixer refusals; the fixer's pre-flight typically catches stale preconditions, missing destination subsections, or do-not-touch conflicts — may also be category 2 if the refusal reason is capacity-shaped, see FixerNotes). The top-level spec-review-fixer refused to apply the recommended resolution. Refusal reason: must-fix-blocked-by-deferred-precondition: Solution constraint #3 explicitly directs deferral when the Concurrency model subsection (owned by T15b) is absent from `## Extension Architecture` in `docs/spec.md`. Current state: T15b is unresolved (still present in `docs/spec-review.md` at line 126) and the Concurrency model subsection does not exist (grep for `Concurrency model` returns only the existing Session-model paragraph text itself). The defer-trigger is firing as designed. Narrowing-refused rationale: constraint #3 cannot be narrowed under the three-mode authoring guard. f-stop-2 (co-resolve peer territory): T15b's named edit surface is the relocation of the architectural clauses (mode-qualified isolation, prompt-mode sequentiality premises i/ii/iii, genuine-concurrency conclusion, cancellation-propagates-downward, per-invocation budget scoping, no-admission-cap) into the new Concurrency model subsection. Deleting those clauses from the Session-model paragraph now would consume T15b's source material before T15b authors the destination, crossing T15b's territory. No other remediation site exists for the Problem's residue. Staleness bypass does not apply: the constraint's structural-ordering prediction ("Concurrency model subsection has landed") is unfulfilled, not falsified by re-shaping. The orchestrator should re-dispatch T15a only after T15b resolves.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/t15a-reduce-session-model-orientation-paragraph-to-a-four-sentence-forward-linki.md

# T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

**Kind:** placement
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites compresses five distinct content categories — Pi-session binding, `session_shutdown` payload contract, prompt-mode sequentiality argument with its three supporting premises, mode-qualified transcript/tool-table isolation, and admission-cap / per-invocation-budget posture — into one Orientation bullet. The architectural clauses belong in the new `Concurrency model` subsection owned by T15b, and the V1 scope deferrals (parallel-`invoke`, concurrent user sessions) belong at the V1 non-goals surfaces owned by T15c; until this reduction lands, those siblings have no room to relocate content into. The paragraph reads as a single mixed block rather than as Orientation-level forward-linking prose.

## Solution approach

Reduce the `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites to orientation-level forward-link prose. The retained content categories are: the one-session-at-a-time Pi-session binding (forward-link to the Session-binding contract in `docs/spec_topics/pi-integration-contract.md`), the `session_shutdown` payload contract (forward-link to the Extension entry point in `docs/spec_topics/pi-integration-contract.md` and to the closed `event.reason` set in the SDK type at `@mariozechner/pi-coding-agent`'s `dist/core/extensions/types.d.ts`), and a pointer to the architectural `Concurrency model` subsection installed by T15b. Delete the clauses T15b relocated (mode-qualified isolation summary, prompt-mode sequentiality with premises (i)/(ii)/(iii), genuine-concurrency-only-between-subagent-invocations conclusion, cancellation-propagates-downward restatement, per-invocation budget scoping, no-admission-cap statement) and the deferrals T15c lifted (parallel-`invoke`, concurrent user sessions). Composition — sentence count, ordering of forward-links, whether closely-related pointers fold into one sentence — is the implementer's choice.

## Solution constraints

- The reduced paragraph must retain the `<a id="session-model"></a>` anchor — inbound links (the Overview's terminal-outcomes paragraph, the `[Session model](#session-model)` reference inside the V1 non-goals subsection) depend on it.
- The destination `Concurrency model` subsection is owned by T15b — do not author it under this finding.
- If the `Concurrency model` subsection (owned by T15b) is absent from `## Extension Architecture` in `docs/spec.md` at edit time, defer.

## Relationships

- T15b "Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection" — co-resolve (the reduction makes room for the relocated content).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — co-resolve (the reduction makes room for the lifted deferrals).
- T02 "Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph" — same-cluster (identical placement pattern).
- T16a "Trust boundary bullet: keep scope claim and drop SDK-pin literal" — same-cluster (sibling Scope bullet exhibiting the same mixing of categories).
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — same-cluster (third instance of the pattern, in the Runtime-observability bullet).
- T24 "Fork-reason watcher closure leaves the extension in an unspecified, silently degraded state" — same-cluster (touches the same Session-model paragraph but addresses content correctness).

