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

## T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls

> **PARKED** — 2026-05-18
> **Reason:** The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 0,0. Loop notes: must-fix-blocked-by-scope-guard. Pass-3 classifier blocked one blocker (clarity/testability T1) — every remediation crosses the single [default] scope guard forbidding edits to the *countable-frame* paragraph. Reshape: relax the scope guard to permit a minimal `cross-file` definition, or split T13 to first install the definition then realign the three phrasing sites.. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/t13-invocation-depth-bound-introductory-sentence-omits-the-cross-file-qualifier-.md

# T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls

**Kind:** naming
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The "Invocation depth bound" subsection of `docs/spec_topics/invocation.md` defines the same rule twice with different breadth. Its introductory paragraph enumerates the countable dispatches as direct `invoke(...)`, `.loom` callable calls through `tools:`, and `.warp` `fn` invokes — omitting the `cross-file` qualifier that the normative *countable-frame* paragraph immediately below applies to `.warp` `fn` calls. The qualifier is load-bearing: without it, intra-`.warp`-file `fn` dispatch is wrongly read as consuming a depth slot, so two implementers reading the subsection in order arrive at incompatible 32-slot budgets. The same loose phrasing has already propagated to the V18n leaf's *Adds.* bullet in `docs/plan_topics/v18-cancellation.md`.

## Solution approach

Rewrite the enumeration in the introductory paragraph of the "Invocation depth bound" subsection of `docs/spec_topics/invocation.md` so its third item reads "cross-file `.warp` `fn` calls" — adding the `cross-file` qualifier and matching the noun (`calls`) used by the normative *countable-frame* paragraph that follows. Apply the same wording change to the *Adds.* bullet of V18n in `docs/plan_topics/v18-cancellation.md`. Leave the normative *countable-frame* paragraph and the rest of the subsection unchanged.

## Solution constraints

- None.

## Relationships

None


---

## T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

> **PARKED** — 2026-05-18T17:17:38Z
> **Reason:** Category 1 (malformed finding — constraints binding surface; an ordering-prediction phrase in Solution constraints is stale against current spec-review.md state). The orchestrator detected pre-dispatch that this finding's ## Solution constraints contained an ordering-prediction phrase that no longer holds (Rec M). No inner loop ran. Loop notes: Rec M: detected 2 stale ordering prediction(s) in ## Solution constraints. "T15b and T15c MUST have already landed before this finding is addressed": predicted T15b had already landed, actual T15b was parked in docs/spec-review-parked.md in the immediately-preceding orchestrator iteration (FailureMode: must-fix-blocked, Category 1) and the `Concurrency model` subsection it was supposed to install in docs/spec.md is absent — `grep -n 'concurrency-model\|Concurrency model' docs/spec.md` returns no matches. "bottom-up ordering guarantees this: T15c at the highest line number is addressed first, T15b second, this finding T15a last": predicted T15c existed at a higher line in docs/spec-review.md and would be addressed before T15a, actual T15c does not appear in docs/spec-review.md or docs/spec-review-parked.md (no `^# T15c` match in either file — either already resolved in a prior run or never authored). The constraint itself says "If either the Concurrency model subsection installed by T15b or the V1 non-goals entries verified by T15c is absent at edit time, defer" — its own escape clause fires. Orchestrator parked T15a pre-dispatch without invoking spec-review-fixer or spec-diff-fix-loop. A human must rewrite the offending constraint as a content-level check (e.g. 'if <subsection> is absent in <file>, defer') rather than a structural-ordering prediction, OR drop the constraint entirely if the prediction is purely informational, before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/t15a-reduce-session-model-orientation-paragraph-to-a-four-sentence-forward-linki.md

# T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

**Kind:** placement
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites compresses five distinct content categories — Pi-session binding, `session_shutdown` payload contract, prompt-mode sequentiality argument with its three supporting premises, mode-qualified transcript/tool-table isolation, and admission-cap / per-invocation-budget posture — into one Orientation bullet. The architectural clauses belong in the new `Concurrency model` subsection owned by T15b, and the V1 scope deferrals (parallel-`invoke`, concurrent user sessions) belong at the V1 non-goals surfaces owned by T15c; until this reduction lands, those siblings have no room to relocate content into. The paragraph reads as a single mixed block rather than as Orientation-level forward-linking prose.

## Solution approach

Reduce the `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites to orientation-level forward-link prose. The retained content categories are: the one-session-at-a-time Pi-session binding (forward-link to the Session-binding contract in `docs/spec_topics/pi-integration-contract.md`), the `session_shutdown` payload contract (forward-link to the Extension entry point in `docs/spec_topics/pi-integration-contract.md` and to the closed `event.reason` set in the SDK type at `@mariozechner/pi-coding-agent`'s `dist/core/extensions/types.d.ts`), and a pointer to the architectural `Concurrency model` subsection installed by T15b. Delete the clauses T15b relocated (mode-qualified isolation summary, prompt-mode sequentiality with premises (i)/(ii)/(iii), genuine-concurrency-only-between-subagent-invocations conclusion, cancellation-propagates-downward restatement, per-invocation budget scoping, no-admission-cap statement) and the deferrals T15c lifted (parallel-`invoke`, concurrent user sessions). Composition — sentence count, ordering of forward-links, whether closely-related pointers fold into one sentence — is the implementer's choice.

## Solution constraints

- The reduced paragraph must retain the `<a id="session-model"></a>` anchor — inbound links (the Overview's terminal-outcomes paragraph, the `[Session model](#session-model)` reference inside the V1 non-goals subsection) depend on it.
- The destination `Concurrency model` subsection is owned by T15b — do not author it under this finding.
- T15b and T15c MUST have already landed before this finding is addressed (bottom-up ordering guarantees this: T15c at the highest line number is addressed first, T15b second, this finding T15a last). If either the `Concurrency model` subsection installed by T15b or the V1 non-goals entries verified by T15c is absent at edit time, defer.

## Relationships

- T15b "Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection" — co-resolve (the reduction makes room for the relocated content).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — co-resolve (the reduction makes room for the lifted deferrals).
- T02 "Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph" — same-cluster (identical placement pattern).
- T16a "Trust boundary bullet: keep scope claim and drop SDK-pin literal" — same-cluster (sibling Scope bullet exhibiting the same mixing of categories).
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — same-cluster (third instance of the pattern, in the Runtime-observability bullet).
- T24 "Fork-reason watcher closure leaves the extension in an unspecified, silently degraded state" — same-cluster (touches the same Session-model paragraph but addresses content correctness).

---

## T11c — V6k normative test vector for `max_rounds: 0` typed query

> **PARKED** — 2026-05-18T21:48:22Z
> **Reason:** Cascaded from parking of T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t11a-replace-consumes-one-slot-prose-with-explicit-forced-respond-exemption-rule.md

# T11c — V6k normative test vector for `max_rounds: 0` typed query

**Kind:** testability
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The V6k *Tests* line in `docs/plan_topics/v6-typed-queries.md` (leaf "V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError`") currently exercises `max_rounds: 0` only as far as asserting that the model receives an empty `tools` set during the free phase; it does not pin the boundary outcome of a `max_rounds: 0` typed query. Two compliant readings of the spec rule established by T11a and the V6k counting-formula re-stated by T11b — one in which the forced respond turn fires (returning `Ok(validated_value)`) and one in which the loop is treated as already exhausted (returning `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })`) — would each pass V6k's existing *Tests* row and *Ships when* gate, so the leaf cannot catch the divergence.

## Solution approach

Add a paired normative test vector to V6k's *Tests* line covering the `max_rounds: 0` typed-query boundary: one row in which the model — invoked once against an empty tool set with forced choice on the respond tool — emits a valid respond-tool call and the query MUST return `Ok(validated_value)`, paired with one row in which the model emits a non-respond `tool_use` block (or text under non-strict providers) and the query MUST return `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })`. The error-payload field values are load-bearing because they are what distinguishes the two compliant readings the finding identifies. Land after T11a (spec rule) and T11b (V6k *Adds* formula) per Relationships.

## Solution constraints

- The new vector applies to the original typed query only; do not conflate `max_rounds: 0` on the original query with `max_rounds: 0` on a respond-repair follow-up (V13g follow-ups receive a fresh `tool_loop` budget).
- Do not edit spec topic files; the *Tool-call loop bound* section in `docs/spec_topics/query.md` is owned by T11a.

## Relationships

- T11a "Replace 'consumes one slot' prose with explicit forced-respond exemption rule" — must-follow.
- T11b "V6k counting-formula tighten: forced respond outside the budget" — must-follow.

---

## T11b — V6k counting-formula tighten: forced respond outside the budget

> **PARKED** — 2026-05-18T21:48:22Z
> **Reason:** Cascaded from parking of T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t11a-replace-consumes-one-slot-prose-with-explicit-forced-respond-exemption-rule.md

# T11b — V6k counting-formula tighten: forced respond outside the budget

**Kind:** testability
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Adds* paragraph of leaf "V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError`" in `docs/plan_topics/v6-typed-queries.md` defines the per-query slot count as *(free-phase rounds) + (1 if a forced respond turn is issued, else 0)* and pins exhaustion at *total slots would exceed `max_rounds`*. That formula counts the forced respond turn against the budget, which contradicts the *Tool-call loop bound* rule that T11a establishes in `docs/spec_topics/query.md` (the forced respond turn is exempt from CIO-4 slot-accounting). With T11a landed, V6k's *Adds* prose is internally inconsistent with the spec it implements, and the boundary outcome of a `max_rounds: 0` typed query is undefined from the leaf's perspective.

## Solution approach

Rewrite the counting-formula and exhaustion sentences in V6k's *Adds* paragraph in `docs/plan_topics/v6-typed-queries.md` so the slot count equals the free-phase round count (the forced respond turn sits outside the budget) and exhaustion fires under either of two disjoint conditions: (a) the slot count would exceed `max_rounds` and the next required turn is a free-phase turn, or (b) the forced respond turn was dispatched and the model failed to invoke the respond tool. Preserve the existing statements that the counter starts at 0, that respond-repair follow-ups (V13g) reset the counter, and that `max_rounds: 0` disables model-driven tool calls.

## Solution constraints

- The *Tool-call loop bound* section in `docs/spec_topics/query.md` is owned by T11a — do not edit spec topic files here.
- Do not collapse the two firing conditions into a single arithmetic predicate that re-counts the forced respond turn against `max_rounds`; that re-introduces the contradiction T11a fixes.
- The `max_rounds: 0` boundary test vector is owned by T11c, and leaf V6l (the two-phase driver) is independent — both out of scope here.

## Relationships

- T11a "Replace 'consumes one slot' prose with explicit forced-respond exemption rule" — must-follow (the spec rule must land first so V6k's formula has something to anchor against).
- T11c "V6k normative test vector for `max_rounds: 0` typed query" — must-precede (the formula change must land before the test can assert against it).

---

## T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file

> **PARKED** — 2026-05-19
> **Reason:** Category 2 (fixer too-hard — capability gap in the fixer's narrowing mechanism; fix attempts systematically grow the raised-finding score). The inner spec-diff-fix-loop's surface-expansion detector (plan §Change C2) fired on two consecutive backtrack-and-exclude passes without converging: every fix the loop poisoned was followed by another fix whose application also triggered expansion. FIXCOUNTS: 1,1,0,0,3,1,5. SCORESUMS: 25,1,0,0,11,1,37 against S=25. Poisoned fixes: naming:01. Snapshot refs retained at refs/loom/snapshots/2026-05-18T22-27-20_00a21e/* for forensic diffing. Loop notes: severity p1 raised{medium:1} fixed{medium:1}; p2 raised{NIT:1} fixed{NIT:1}; p3 raised{} fixed{}; p4 raised{} fixed{}; p5 raised{low:2,NIT:1} fixed{low:2,NIT:1}; p6 raised{NIT:1} fixed{NIT:1}; p7(re) raised{medium:1,low:2,NIT:2} fixed{} (discarded un-applied at exit); stage1=3 stage2=1 stage3=3; narrowings=0+0+0+0; stage1Touched=1 mode-e-refusals=0. Surface-expansion detector fired on pass 8 (scoreSum 30 vs pass-7 score 1; ratio 30×); backtracked to pass-7 snapshot, poisoned `naming:01`. Pass 7 re-executed with naming:01 excluded; lenses surfaced 5 new findings, scoreSum jumped to 37. Second consecutive backtrack-and-exclude trigger → exit `surface-expansion-irrecoverable`. The originating T09 finding's Solution approach (replace inline tilde-approximate caps with a forward-link deferral, plus rewrite the trailing non-normative clause to drop "fully specified above") creates a structural fanout: every stage-3 phrasing variant of the rewritten bullet+note pair attracts a new combination of clarity/naming/traceability/consistency lens findings. Snapshot refs under `refs/loom/snapshots/2026-05-18T22-27-20_00a21e/` retained for forensics. A human must reshape this finding (split it into narrower pieces, demote MUSTs, or cap the prose the fix is allowed to add) before re-introducing it.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t09-bind-context-session-overview-bullet-uses-tilde-approximate-caps-that-contra.md

# T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file

**Kind:** testability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The `bind_context: session` bullet in the *bind_context* value list of `docs/spec_topics/binder.md` (the bullet immediately under "Configured via `bind_context:` …") describes the session-context cap as "the last ~20 turns or ~8000 tokens (whichever is smaller)". The tildes read as approximation and "whichever is smaller" reads as a min-of-two cap, while the *Session-context truncation (`bind_context: session`)* subsection later in the same file pins exact, jointly-applied, boundary-inclusive bounds (a turn is included iff running token total ≤ 8000 *and* running turn count ≤ 20). A reader who consumes only the bullet cannot tell that the limits are exact, joint, or boundary-inclusive, so an implementer or test author working from the bullet alone may round counts, undercount tokens, or apply min-of-two and still believe themselves conformant.

## Solution approach

Rewrite the `bind_context: session` bullet so it stops asserting approximate, min-of-two caps. Either restate the caps verbatim as the exact joint inclusive bounds owned by the algorithm subsection, or — preferably — defer entirely with a forward-link to the *Session-context truncation (`bind_context: session`)* subsection (anchor `#session-context-truncation-bind_context-session`) and let that subsection own the literals. Drop the tildes and the "whichever is smaller" framing.

## Solution constraints

- Treat the *Session-context truncation* subsection and the rendered binder system-prompt example line (`Recent session context (most recent 20 turns / 8000 tokens):`) as read-only; the bullet either restates the caps verbatim from that subsection or defers via forward-link, and never paraphrases or re-derives.
- Do not introduce a third independent statement of the caps in `binder.md` — the only acceptable copies remain the *Session-context truncation* subsection and the rendered system-prompt example line, both already present.

## Relationships

None


---

## T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

> **PARKED** — 2026-05-19
> **Reason:** Category 2 (fixer too-hard — capability gap in the fixer's narrowing mechanism; fix attempts systematically grow the raised-finding score). The inner spec-diff-fix-loop's surface-expansion detector (plan §Change C2) fired on two consecutive backtrack-and-exclude passes without converging: every fix the loop poisoned was followed by another fix whose application also triggered expansion. FIXCOUNTS: 1,1,2,3. SCORESUMS: 1,1,26,51 against S=25. Poisoned fixes: spec-lens-assumptions:03, spec-lens-traceability:01. Snapshot refs retained at refs/loom/snapshots/2026-05-19T02-54-58_ae06a2/* for forensic diffing. Loop notes: Surface-expansion-irrecoverable two-strikes exit. The originating Recommendation's two-site authoring (glossary + Naming-convention sentence) creates a recurring critique surface: each rewrite attracts canonical-home / rationale-promise / family-scope / anchor-precision findings the scope guard prevents resolving cleanly. Reshape required: split so canonical-home declaration and per-surface mapping are authored as one unit (no two-site duplication) and explicitly scope to binder-model concept alone (not "binder-related frontmatter family" — bind-context-* / bind-echo-* diagnostic-code surfaces use different patterns). A human must reshape this finding (split it into narrower pieces, demote MUSTs, or cap the prose the fix is allowed to add) before re-introducing it.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t05-bind-frontmatter-vs-binder-binder-settings-diagnostics-prose-root-word-incon.md

**Kind:** naming
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The concept "the LLM the slash-command argument binder calls" appears across three surface conventions with two different root words: frontmatter uses `bind_` (`bind_model`, `bind_context`, `bind_echo`), while settings keys, diagnostic codes, anchors, and running prose use the longer root `binder` (`looms.binderModel`, `loom/load/binder-model-unresolved`, `## Binder model` in `docs/spec_topics/binder.md`, glossary entry `**binder**`). The per-surface case style (snake / camel / kebab) is already governed by documented conventions; the `binder` → `bind_` shortening inside the frontmatter family is not — the *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` documents the snake-case rule but is silent on this root-word delta, and the glossary has an entry for `**binder**` (the mechanism) but no entry for the binder-model concept, so the cross-surface mapping has no canonical anchor. Author-facing remediation hints that name both surfaces in one sentence (e.g. the `loom/load/binder-model-unresolved` row in `docs/spec_topics/diagnostics.md`: ``set 'bind_model:' in frontmatter or 'looms.binderModel' in settings``) read as a typo until the convention is internalised.

## Solution approach

Document the per-surface mapping rather than rename the frontmatter family. Add a new `**binder model**` glossary entry to `docs/spec_topics/glossary.md`, alphabetised between the existing `**binder**` and `**callable set**` entries; the entry covers the concept, the per-surface spellings (`bind_model:` frontmatter, `looms.binderModel` settings, `binder-model` / "binder model" diagnostic and prose), the relationship to sibling `bind_` frontmatter fields (`bind_context`, `bind_echo`), and forward-links to `./binder.md` and `./discovery.md#settings-file-reads`. Extend the *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` to document the `bind_` (frontmatter) vs `binder` (settings, diagnostic, prose) root-word convention for the binder-related family.

## Solution constraints

- Do not rename `bind_model`, `bind_context`, or `bind_echo` to `binder_model` / `binder_context` / `binder_echo`.

## Relationships

None

---

## T03f — `h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph; extend `engines.node` literal-read test to cross-package equality

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t03a-add-loom-package-implementation-dependencies-v1-sub-paragraph-in-pic-host-p.md

# T03f — `h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph; extend `engines.node` literal-read test to cross-package equality

**Kind:** assumptions, traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

In `docs/plan_topics/h1-scaffold.md`, the H1 manifest test bullet that asserts the `semver` / `@types/semver` `package.json` entries currently anchors at the dependency-pinning parenthetical in PIC's two `*Recommended recipe (non-normative).*` paragraphs — a parenthetical that T03c deletes once T03a installs the dedicated `**Loom-package implementation dependencies (V1).**` sub-paragraph in `**Host prerequisites.**`. Separately, the `package.json` `engines.node` literal-read test currently asserts only that the loom literal matches its own pinned string; it does not read `@mariozechner/pi-coding-agent`'s `engines.node` field, so a Pi minor bump that moves the upstream Node floor cannot fail this gate at the bump commit. T03b adds a `pi-engines-node` row to `SDK_SURFACE_INVENTORY` so the cross-package floor and the four already-pinned constants share one source of truth, but no assertion in `test/extension/pinned-surface.test.ts` (or its `engines.node` sibling) yet consumes that row.

## Solution approach

In `docs/plan_topics/h1-scaffold.md`, retarget the `semver` / `@types/semver` manifest-assertion bullet so its spec anchor cites PIC's `**Loom-package implementation dependencies (V1).**` sub-paragraph (the sub-paragraph T03a installs) instead of the Step 0 (a) / Step 0 (d) recipe parentheticals. Separately, extend the `engines.node` literal-read test bullet (or the sibling SDK surface-inventory bullet that owns the `pi-engines-node` row T03b adds) so the asserted surface is cross-package equality between `@mariozechner/pi-coding-agent`'s `engines.node` field and the loom `package.json#engines.node` literal, sourced from the `pi-engines-node` `SDK_SURFACE_INVENTORY` row. The path-resolution mechanism, the comparison verb, and the assertion framing are the implementer's choice within H1's existing test-framework idioms.

## Solution constraints

- Consume the `pi-engines-node` `SDK_SURFACE_INVENTORY` row (added by T03b) as the single source of truth for the cross-package assertion; do not introduce a parallel literal in the H1 test description (would silently break the cross-package floor when one side moves).

## Relationships

- T03a "Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`" — must-follow (this finding anchors at the sub-paragraph T03a installs).
- T03b "Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`" — must-follow (this finding consumes the row T03b adds).

---

## T03c — Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t03a-add-loom-package-implementation-dependencies-v1-sub-paragraph-in-pic-host-p.md

# T03c — Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs

**Kind:** cruft, consistency
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The two `*Recommended recipe (non-normative).*` paragraphs under Step 0 of `docs/spec_topics/pi-integration-contract.md` (the Step 0 (a) Node-floor recipe and the Step 0 (d) peer-dep range recipe) carry a parenthetical pinning `semver` as a direct H1 production dependency of the loom package. Once T03a installs the dedicated `**Loom-package implementation dependencies (V1).**` sub-paragraph in `**Host prerequisites.**`, that dependency obligation has its own normative home and the parentheticals become redundant — and contradictory, because the same recipes simultaneously promise that "a future swap to a different SemVer implementation (or a hand-rolled comparator) is permitted". A non-normative recipe that pins a specific implementation as a direct H1 production dependency cannot coexist with a sibling sentence inviting a swap.

## Solution approach

Delete the dependency-pinning parenthetical "pinned by H1 as a direct production dependency of the loom package" wherever it appears in the two `*Recommended recipe (non-normative).*` paragraphs of `docs/spec_topics/pi-integration-contract.md` (Step 0 (a) and Step 0 (d)). Leave the comparator-contract framing, the worked `semver.satisfies` / `semver.valid` example, and the future-swap escape-hatch sentence intact in both paragraphs — those clauses remain load-bearing for the recipe's stated purpose now that T03a's sub-paragraph carries the V1 dependency choice.

## Solution constraints

- The dependency-pinning normativity is owned by T03a's `**Loom-package implementation dependencies (V1).**` sub-paragraph; do not re-introduce normative pins in the recipe paragraphs as part of this trim, and do not promote either paragraph out of `*Recommended recipe (non-normative).*` status.

## Relationships

- T03a "Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`" — must-follow (the sub-paragraph T03a adds is what these parentheticals become redundant with).

---

## T03b — Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t03a-add-loom-package-implementation-dependencies-v1-sub-paragraph-in-pic-host-p.md

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

## T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t03a-add-loom-package-implementation-dependencies-v1-sub-paragraph-in-pic-host-p.md

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

## T03d — Update PIC Pi version-bump procedure step 3: replace manual-compare instruction with H1-test-fails-red narrative

> **PARKED** — 2026-05-19
> **Reason:** Cascaded from parking of T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t03a-add-loom-package-implementation-dependencies-v1-sub-paragraph-in-pic-host-p.md

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
