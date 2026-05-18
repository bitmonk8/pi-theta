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

## T19a — Extend ActiveInvocationRegistry entry shape with invocationId

> **PARKED** — 2026-05-17
> **Reason:** Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Cluster-mode (MULTI: T19a/T19b/T19d/T19e). Classifier exited on score-budget-exhausted (Change D clause 3): origin score S=25 (default-medium; heading absent from spec-review.md), cumulative non-blocker/non-cheap Σ=60 at exhaustion, breach margin = 35 — Σ landed at AF6 (medium, score=35) after AF4 (medium, score=25) had already saturated S. A blocker (AF1, high, score=100, must-fix:true — `RuntimeEvent.invocation_id` declared required with no contract for emission arms lacking a live registry entry) was classifiable as fix but suppressed by the budget-exhausted exit (precedence rule). Three SP-2 auto-deferred findings (AF2, AF3, AF5 — all targeting one of the three NarrowedChunks) did not enter the budget. AF7 (low, score=5) was not summed (exit fired at AF6). severity p1 raised{high:1,medium:5,low:1} fixed{} deferred{medium:3} blocked{high:1,medium:2}. stage1=0 (no pass completed; exit at classifier in step 3e-bis). narrowings=3+0 (3 seeded from task body's NarrowedChunks block; 0 added in-loop because no inner-fixer dispatch occurred). Snapshot refs retained for forensics. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md

# T19a — Extend ActiveInvocationRegistry entry shape with invocationId

**Kind:** error-model
**Importance:** high
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

> **PARKED** — 2026-05-17
> **Reason:** Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Cluster-mode (MULTI: T19a/T19b/T19d/T19e). Classifier exited on score-budget-exhausted (Change D clause 3): origin score S=25 (default-medium; heading absent from spec-review.md), cumulative non-blocker/non-cheap Σ=60 at exhaustion, breach margin = 35 — Σ landed at AF6 (medium, score=35) after AF4 (medium, score=25) had already saturated S. A blocker (AF1, high, score=100, must-fix:true — `RuntimeEvent.invocation_id` declared required with no contract for emission arms lacking a live registry entry) was classifiable as fix but suppressed by the budget-exhausted exit (precedence rule). Three SP-2 auto-deferred findings (AF2, AF3, AF5 — all targeting one of the three NarrowedChunks) did not enter the budget. AF7 (low, score=5) was not summed (exit fired at AF6). severity p1 raised{high:1,medium:5,low:1} fixed{} deferred{medium:3} blocked{high:1,medium:2}. stage1=0 (no pass completed; exit at classifier in step 3e-bis). narrowings=3+0 (3 seeded from task body's NarrowedChunks block; 0 added in-loop because no inner-fixer dispatch occurred). Snapshot refs retained for forensics. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md

# T19b — Add invocation_id field to RuntimeEvent payload declaration

**Kind:** error-model
**Importance:** high
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

> **PARKED** — 2026-05-17
> **Reason:** Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Cluster-mode (MULTI: T19a/T19b/T19d/T19e). Classifier exited on score-budget-exhausted (Change D clause 3): origin score S=25 (default-medium; heading absent from spec-review.md), cumulative non-blocker/non-cheap Σ=60 at exhaustion, breach margin = 35 — Σ landed at AF6 (medium, score=35) after AF4 (medium, score=25) had already saturated S. A blocker (AF1, high, score=100, must-fix:true — `RuntimeEvent.invocation_id` declared required with no contract for emission arms lacking a live registry entry) was classifiable as fix but suppressed by the budget-exhausted exit (precedence rule). Three SP-2 auto-deferred findings (AF2, AF3, AF5 — all targeting one of the three NarrowedChunks) did not enter the budget. AF7 (low, score=5) was not summed (exit fired at AF6). severity p1 raised{high:1,medium:5,low:1} fixed{} deferred{medium:3} blocked{high:1,medium:2}. stage1=0 (no pass completed; exit at classifier in step 3e-bis). narrowings=3+0 (3 seeded from task body's NarrowedChunks block; 0 added in-loop because no inner-fixer dispatch occurred). Snapshot refs retained for forensics. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md

# T19d — Populate cancelled-by-session-shutdown details with invocation_id

**Kind:** error-model
**Importance:** high
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

> **PARKED** — 2026-05-17
> **Reason:** Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Cluster-mode (MULTI: T19a/T19b/T19d/T19e). Classifier exited on score-budget-exhausted (Change D clause 3): origin score S=25 (default-medium; heading absent from spec-review.md), cumulative non-blocker/non-cheap Σ=60 at exhaustion, breach margin = 35 — Σ landed at AF6 (medium, score=35) after AF4 (medium, score=25) had already saturated S. A blocker (AF1, high, score=100, must-fix:true — `RuntimeEvent.invocation_id` declared required with no contract for emission arms lacking a live registry entry) was classifiable as fix but suppressed by the budget-exhausted exit (precedence rule). Three SP-2 auto-deferred findings (AF2, AF3, AF5 — all targeting one of the three NarrowedChunks) did not enter the budget. AF7 (low, score=5) was not summed (exit fired at AF6). severity p1 raised{high:1,medium:5,low:1} fixed{} deferred{medium:3} blocked{high:1,medium:2}. stage1=0 (no pass completed; exit at classifier in step 3e-bis). narrowings=3+0 (3 seeded from task body's NarrowedChunks block; 0 added in-loop because no inner-fixer dispatch occurred). Snapshot refs retained for forensics. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md

# T19e — Add real-time sibling emission timing paragraph

**Kind:** error-model
**Importance:** high
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

## T18a — Append success-side null-policy paragraph to PIC Runtime event channel

> **PARKED** — 2026-05-17
> **Reason:** The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Classifier exited score-budget-exhausted on the rewound pass-1 re-run; S=25, Σ=30, breach margin=5. Pre-rewind original pass-1 produced 2 fixes → pass-2 fan-out raised 10 fix-class findings tripping C2 surface-expansion detector. Backtracked, poisoned both pass-1 fixes; re-run pass-1 surfaced a high/must-fix=true consistency blocker (F3 — handler-frame contradiction between PIC and slash-invocation.md L18) plus two trust-override consistency fixes (F3, F4), two poisoned defers (F1, F2), one cheap-fix (F7), and two budget-breaching completeness findings (F5, F6). The originating T18a S=25 is too tight to absorb the persistence-domain ambiguity and the pre-evaluation-no-terminal-outcome carve-out gap; reshape (split, raise S, or pre-decide the persistence-domain quantifier and pre-start-teardown rule) before re-running. The surfaced consistency blocker (PIC vs. slash-invocation.md) is the higher-priority shape concern; if T18b/c/d are reshaped together, fold that contradiction in. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t18a-append-success-side-null-policy-paragraph-to-pic-runtime-event-channel.md

# T18a — Append success-side null-policy paragraph to PIC Runtime event channel

**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
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

## T18d — Add V18q test asserting zero `loom-system-note` emissions on successful termination

> **PARKED** — 2026-05-17
> **Reason:** Cascaded from parking of T18a — Append success-side null-policy paragraph to PIC Runtime event channel: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t18a-append-success-side-null-policy-paragraph-to-pic-runtime-event-channel.md

# T18d — Add V18q test asserting zero `loom-system-note` emissions on successful termination

**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The V18q **Tests.** bullet under `## V18q — Runtime event channel and always-log emission` in `docs/plan_topics/v18-cancellation.md` asserts via clause (b) that the four excluded `kind`s (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) emit zero `loom-system-note` events on the always-log channel, but contains no symmetric clause asserting the success-side null: that a loom terminating with `Ok(v)` emits zero `loom-system-note` events on that channel. Sibling T18a installs the central success-side null-policy paragraph in PIC Runtime event channel; without a paired test clause in V18q, the leaf's **Ships when.** condition cannot catch a regression of that rule, and two compliant implementations could ship divergent success-side emission behaviour.

## Solution approach

Add one new lettered clause to the V18q **Tests.** bullet in `docs/plan_topics/v18-cancellation.md` asserting that a successful prompt-mode loom and a successful slash-invoked subagent-mode loom each emit zero `loom-system-note` events on the always-log channel. Mirror clause (b)'s structural shape (one clause covering both scenarios inline). The clause asserts against the success-side null-policy that sibling T18a installs centrally in PIC Runtime event channel; do not author the spec-side rule here.

## Solution constraints

- Append to V18q's **Tests.** bullet using the next free letter; do not renumber, drop, reword, or reorder existing clauses (a) through (l). In particular, do not weaken clause (b)'s four-excluded-kinds enumeration — the success-side null is additive to those guarantees, not a substitute.
- Do not edit V18q's **Spec.**, **Adds.**, **Deps.**, or **Ships when.** lines, and do not introduce a new diagnostic code, always-log `kind`, `customType`, or cross-leaf dependency change.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow.
- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — co-resolve.
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — co-resolve.


---

## T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy

> **PARKED** — 2026-05-17
> **Reason:** Cascaded from parking of T18a — Append success-side null-policy paragraph to PIC Runtime event channel: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t18a-append-success-side-null-policy-paragraph-to-pic-runtime-event-channel.md

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

## T18b — Add per-mode operator-side null sentences to slash-invocation.md

> **PARKED** — 2026-05-17
> **Reason:** Cascaded from parking of T18a — Append success-side null-policy paragraph to PIC Runtime event channel: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t18a-append-success-side-null-policy-paragraph-to-pic-runtime-event-channel.md

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
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — co-resolve (sibling per-surface restatement; same edit pass).
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — co-resolve.

---

## T16b — Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names

> **PARKED** — 2026-05-18
> **Reason:** The inner spec-diff-fix-loop diverged: the most recent pass produced more fix-class findings than the previous one. FIXCOUNTS: 4,1,0,1,0,4,1,1,4. Loop notes: Diverged at pass 9 (fixCount jumped 1→4 outside stage-boundary). Pass 8 SP-2 mode (d) reverted docs/spec.md#scope to baseline-post-top-level; that revert plus PIC subagent visibility-pin sentence re-exposed latent concerns, raising 4 fix-class on pass 9 that were discarded. Bimodal recommendation (mechanism-vs-effect framing); a human should split it.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t16b-rewrite-callable-set-paragraph-drop-inline-customtools-createagentsession-p.md

# T16b — Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names

**Kind:** placement
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The callable-set paragraph in the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` names packaging-level Pi-API identifiers — the `customTools` array on `createAgentSession` for subagent mode and the `pi.setActiveTools` snapshot/restore pair for prompt mode — to characterise how the per-mode callable-set wiring is enforced. Those identifiers are owned verbatim by the **Tool-registration lifetime and visibility** and **Conversation drive — subagent mode** sections of `docs/spec_topics/pi-integration-contract.md`; the aggregator restatement drifts the moment either Pi API surface is renamed, replaced, or restructured. The behavioural property the trust-boundary scope decision actually rests on is the per-mode wiring isolation, not the specific Pi APIs that implement it.

## Solution approach

Rewrite the callable-set paragraph in the Trust-boundary bullet so it states only the behavioural isolation rule — subagent-mode invocations see only the loom's declared callable set; prompt-mode invocations see the loom's declared callable set unioned with the user session's snapshot for the swap window — and forward-links the **Tool-registration lifetime and visibility** section in `docs/spec_topics/pi-integration-contract.md` for the SDK-call mechanism. Drop the inline `customTools`, `createAgentSession`, and `pi.setActiveTools` identifiers from the paragraph. The SDK-call mechanism remains owned by the linked PIC section.

## Solution constraints

- Do not inline the Pi-API identifiers `customTools`, `createAgentSession`, or `pi.setActiveTools` (or any other Pi-API symbol that names how callables are wired for either mode); those are owned by **Tool-registration lifetime and visibility** in `docs/spec_topics/pi-integration-contract.md`.
- Preserve the *callable set* clarification — that the loom's declared callable set is a configuration knob over the *model's* reachable callable set, NOT a host-process sandbox — and its forward-link to [Parameters and Frontmatter — `tools`](./spec_topics/frontmatter.md#tools).
- The host-side-denial paragraph and the closing capability-model sentence are owned by T16c and T16d respectively — leave them untouched here.

## Relationships

- T16a "Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal" — co-resolve.
- T16c "Reduce host-side-denial paragraph to one sentence with forward-links" — co-resolve.
- T16d "Replace closing capability-model paragraph with single forward-link sentence" — co-resolve.


---

## T16a — Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal

> **PARKED** — 2026-05-18
> **Reason:** The inner spec-diff-fix-loop diverged: the most recent pass produced more fix-class findings than the previous one. FIXCOUNTS: 2,2,2,2,3. Loop notes: Loop diverged at pass 5 after four flat passes (2→3 fix-count). Trust-boundary bullet cycled through whack-a-mole shapes; scope guard forbids re-inlining SDK pin literal; PIC Host prerequisites doesn't own privilege claim. Reshape: split T16a from surviving-prose backing concern, or move privilege-absence claim to a PIC subsection that owns it before deleting inline backing.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t16a-reduce-trust-boundary-sdk-surface-clause-drop-the-0-72-1-literal.md

# T16a — Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal

**Kind:** placement
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The SDK-surface clause of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` inlines the literal Pi-SDK pin `@mariozechner/pi-coding-agent ~0.72.1` while restating that Pi's `ExtensionAPI` and `ExtensionContext` surfaces expose no per-extension privilege facet. That literal pin is owned verbatim by **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md`; restating it inside the Trust-boundary bullet creates a second site that the **Pi version bump procedure** in `docs/spec_topics/pi-integration-contract.md` (anchor `id="pi-version-bump-procedure"`) expects to drift on the next bump. The behavioural property the scope decision actually rests on is the no-per-extension-privilege-facet property at the V1 Pi-SDK pin, not the literal version range.

## Solution approach

Rewrite the SDK-surface clause of the Trust-boundary bullet so it states only the behavioural property — that the peer packages expose no per-extension privilege facet at the V1 Pi-SDK pin — and forward-links **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md` in lieu of restating the pin. Drop the inline `~0.72.1` parenthetical entirely. Retain the build-time SDK surface-inventory assertion as a single sentence carrying its forward-link to the anchor `id="pi-version-bump-procedure"` in `docs/spec_topics/pi-integration-contract.md`.

## Solution constraints

- Do not inline the literal `~0.72.1` (or any structural variant restating the Pi SDK pin); that pin remains owned solely by **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md`.
- The callable-set paragraph, the host-side-denial paragraph, and the closing capability-model sentence are owned by T16b, T16c, and T16d respectively — leave them present and untouched here.

## Relationships

- T16b "Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names" — co-resolve (same Trust-boundary bullet; must land in one commit).
- T16c "Reduce host-side-denial paragraph to one sentence with forward-links" — co-resolve.
- T16d "Replace closing capability-model paragraph with single forward-link sentence" — co-resolve.
- T34 "Trust-boundary 'no privilege facet' claim is asserted but not gated by any audit the spec cites" — same-cluster (same bullet; orthogonal fix — adds an audit citation rather than restructures placement).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster (the Session-model paragraph exhibits the same aggregator-overreach pattern).
