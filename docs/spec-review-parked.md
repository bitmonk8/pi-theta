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

## T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection

> **PARKED** — 2026-05-18
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Classifier early-exit on `_blocked.md` sub-rationale `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate). S=25 (default — top-level fixer already removed T15b from `docs/spec-review.md` so classifier could not recover the originating `**Score:**`; sibling T15a/T14 both medium=25, consistent), Σ=260, breach-margin=235 (Σ/S ≈ 10.4×, well above k=3 multiplier). 6 non-blocker non-cheap raised findings counted toward budget; all 6 would have qualified for trust-override absent the Rec O gate. Breakdown by lens/tier: AF-1 spec-lens-consistency high/100 (same-document duplication — explicitly covered by forwarded scope guard but per Rec O still counts toward Σ_shadow), AF-2 spec-lens-traceability high/100 (8+ obligations under single `#concurrency-model` anchor), AF-3 spec-lens-assumptions+traceability medium/25 (clause (i) mis-pinning + fragmentless link), AF-4 spec-lens-assumptions medium/25 (closed-world "only" claim unexhausted by corpus), AF-5 spec-lens-prescription low/5 (mechanism-anchored top sentence via `pi.setActiveTools`), AF-6 spec-lens-assumptions low/5 (unpinned event-loop assumption). Even excluding AF-1 under scope-guard guidance, residue Σ=160 > 3×S=75 still exceeds gate; reshape — not further inner-loop iteration — is the correct disposition. severity p1 raised{high:2,medium:2,low:2} fixed{} deferred{} blocked{high:2,medium:2,low:2}; stage1=1; narrowings=0+0+0+0; stage1Touched=0 mode-e-refusals=0. Snapshot refs under `refs/loom/snapshots/2026-05-18T16-54-56_4e64a6/*` retained for forensics (baseline, baseline-post-top-level, pass-1). Zero `spec-diff-fixer` dispatches occurred; working tree unchanged from loop entry; outer prompt MUST NOT commit and should route the heading to forensics + parker per the `must-fix-blocked` branch. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/t15b-move-concurrency-semantics-into-extension-architecture-implementation-notes.md

# T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection

**Kind:** placement
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The architectural half of the `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites — the mode-qualified isolation summary, prompt-mode strict sequentiality with its three supporting premises (i)/(ii)/(iii), the genuine-concurrency-only-between-subagent-invocations conclusion, the cancellation-propagates-downward-only restatement, and per-invocation budget scoping — sits inside an Orientation bullet labelled informative rather than in a normative-architectural home. T15a's reduction of that paragraph removes those clauses from Orientation; with no destination in `## Extension Architecture` or `## Implementation Notes` they are dropped on the floor and the architectural reader has no aggregator to land on. The spec presently has no `Concurrency model` subsection under either home.

## Solution approach

Add a new `Concurrency model` subsection in `docs/spec.md` under `## Extension Architecture` as a sibling entry to Pi Extension Integration. **Copy** the listed architectural clauses into the new subsection as an aggregator analogous to the Hard-ceilings bullet, preserving each clause's existing forward-links to `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/implementation-notes.md`, `docs/spec_topics/cancellation.md`, `docs/spec_topics/invocation.md`, and `docs/spec_topics/frontmatter.md` verbatim. The corresponding **removal** from the `<a id="session-model"></a>` paragraph is owned by T15a and is out of scope here — the addition (this finding) and the removal (T15a) land as two consecutive single-finding commits under bottom-up ordering, with a transient content duplication in HEAD between them by design.

## Solution constraints

- Do not place it under `## Implementation Notes`.
- Do not restate owner-page text beyond what the forward-links require.
- Preserve every forward-link from the listed clauses verbatim — same targets, same count — across the copy. This is a copy, not a rewrite.
- Preserve the three sequentiality premises (i)/(ii)/(iii) verbatim from the source paragraph; the fourth premise is owned by T14 and added in T14's edit pass, not here.
- Do NOT edit the `<a id="session-model"></a>` paragraph under this finding — removal of the now-duplicated clauses from the source paragraph is owned by T15a and lands in the immediately-following commit under bottom-up ordering. A transient content duplication between the new `Concurrency model` subsection and the still-untouched `<a id="session-model"></a>` paragraph is the **expected intermediate state** between this commit and T15a's commit.
- **Inner-loop guidance for the spec-diff fix loop on this commit:** the diff for this finding intentionally introduces content that duplicates the unchanged `<a id="session-model"></a>` paragraph in `docs/spec.md`. Findings of the form *"the new Concurrency model subsection duplicates the session-model paragraph"*, *"the same forward-link appears in two places"*, or *"premises (i)/(ii)/(iii) are stated twice"* are out of scope for the inner loop on this commit and MUST NOT be acted on by `spec-diff-fixer` — fixing them would either re-add removed content (defeating the finding's purpose) or remove content from the still-canonical session-model paragraph (crossing the scope guard above and pre-empting T15a's commit). Treat any such finding as `ignore — out-of-scope`.

## Relationships

- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — co-resolve (the reduction at Orientation must land alongside this relocation).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — co-resolve (sibling restructure of the same paragraph).
- T14 "Prompt-mode sequentiality argument has an unstated fourth premise" — must-follow (the three premises being relocated are the ones T14 needs to extend with the fourth premise; the relocation is the natural moment to add it).
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — must-follow (the admission-cap disposition being relocated is the surface T20 needs the resource-exhaustion answer on).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (lives in the same architectural area being created here; co-resolve siblings T19b/c/d/e also relevant).

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

## T19a — Extend ActiveInvocationRegistry entry shape with invocationId

> **PARKED** — 2026-05-18
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Classifier exited pre-dispatch on Rec O pass-level shadow-budget gate; sub-rationale=score-budget-exhausted-trust-override-suppressed (S=25 from MULTI cluster T19a/T19b/T19d/T19e under rec K heading-absent default — all four members absent from spec-review.md and spec-review-parked.md and not recoverable via available tools, so medium / S=25 / must-fix=false applied; Σ_shadow=150, breach-multiplier=6.0× over S and 2.0× over k×S=75, k=3; 6 raised findings would have classified fix-via-trust-override absent the gate). severity p1 raised{medium:6} fixed{} deferred{} blocked{medium:6}; no spec-diff-fixer dispatched, working tree unchanged from loop entry. stage1=0 (classifier exit predates any pass-completion accounting). narrowings=2+0+0+0 (seeded NarrowedChunks: PIC#diagnostic-emission-isolation + diagnostics.md#session-shutdown-details-conventions; no in-loop additions because no fixer dispatch). stage1Touched=0 mode-e-refusals=0. Snapshot namespace retained for forensics. Reshape options per _blocked.md: split T19e (real-time sibling emission timing paragraph) out as its own top-level fix (AF2+AF4+AF5+AF6 = 100/150 score concentrate there), raise the cluster's authored score/importance (current S=25 is the heading-absent default — recovering original member metadata from git is the prerequisite), or narrow the T19e Solution approach (drop arrival-order claim, defer anchor/split structural fix, restate timing in terms of sendSystemNote chain rather than pi.sendMessage directly). A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md

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

> **PARKED** — 2026-05-18
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Classifier exited pre-dispatch on Rec O pass-level shadow-budget gate; sub-rationale=score-budget-exhausted-trust-override-suppressed (S=25 from MULTI cluster T19a/T19b/T19d/T19e under rec K heading-absent default — all four members absent from spec-review.md and spec-review-parked.md and not recoverable via available tools, so medium / S=25 / must-fix=false applied; Σ_shadow=150, breach-multiplier=6.0× over S and 2.0× over k×S=75, k=3; 6 raised findings would have classified fix-via-trust-override absent the gate). severity p1 raised{medium:6} fixed{} deferred{} blocked{medium:6}; no spec-diff-fixer dispatched, working tree unchanged from loop entry. stage1=0 (classifier exit predates any pass-completion accounting). narrowings=2+0+0+0 (seeded NarrowedChunks: PIC#diagnostic-emission-isolation + diagnostics.md#session-shutdown-details-conventions; no in-loop additions because no fixer dispatch). stage1Touched=0 mode-e-refusals=0. Snapshot namespace retained for forensics. Reshape options per _blocked.md: split T19e (real-time sibling emission timing paragraph) out as its own top-level fix (AF2+AF4+AF5+AF6 = 100/150 score concentrate there), raise the cluster's authored score/importance (current S=25 is the heading-absent default — recovering original member metadata from git is the prerequisite), or narrow the T19e Solution approach (drop arrival-order claim, defer anchor/split structural fix, restate timing in terms of sendSystemNote chain rather than pi.sendMessage directly). A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md

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

> **PARKED** — 2026-05-18
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Classifier exited pre-dispatch on Rec O pass-level shadow-budget gate; sub-rationale=score-budget-exhausted-trust-override-suppressed (S=25 from MULTI cluster T19a/T19b/T19d/T19e under rec K heading-absent default — all four members absent from spec-review.md and spec-review-parked.md and not recoverable via available tools, so medium / S=25 / must-fix=false applied; Σ_shadow=150, breach-multiplier=6.0× over S and 2.0× over k×S=75, k=3; 6 raised findings would have classified fix-via-trust-override absent the gate). severity p1 raised{medium:6} fixed{} deferred{} blocked{medium:6}; no spec-diff-fixer dispatched, working tree unchanged from loop entry. stage1=0 (classifier exit predates any pass-completion accounting). narrowings=2+0+0+0 (seeded NarrowedChunks: PIC#diagnostic-emission-isolation + diagnostics.md#session-shutdown-details-conventions; no in-loop additions because no fixer dispatch). stage1Touched=0 mode-e-refusals=0. Snapshot namespace retained for forensics. Reshape options per _blocked.md: split T19e (real-time sibling emission timing paragraph) out as its own top-level fix (AF2+AF4+AF5+AF6 = 100/150 score concentrate there), raise the cluster's authored score/importance (current S=25 is the heading-absent default — recovering original member metadata from git is the prerequisite), or narrow the T19e Solution approach (drop arrival-order claim, defer anchor/split structural fix, restate timing in terms of sendSystemNote chain rather than pi.sendMessage directly). A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md

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

> **PARKED** — 2026-05-18
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). Parked as part of MULTI cluster T19a — Extend ActiveInvocationRegistry entry shape with invocationId; T19b — Add invocation_id field to RuntimeEvent payload declaration; T19d — Populate cancelled-by-session-shutdown details with invocation_id; T19e — Add real-time sibling emission timing paragraph (rec F). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Classifier exited pre-dispatch on Rec O pass-level shadow-budget gate; sub-rationale=score-budget-exhausted-trust-override-suppressed (S=25 from MULTI cluster T19a/T19b/T19d/T19e under rec K heading-absent default — all four members absent from spec-review.md and spec-review-parked.md and not recoverable via available tools, so medium / S=25 / must-fix=false applied; Σ_shadow=150, breach-multiplier=6.0× over S and 2.0× over k×S=75, k=3; 6 raised findings would have classified fix-via-trust-override absent the gate). severity p1 raised{medium:6} fixed{} deferred{} blocked{medium:6}; no spec-diff-fixer dispatched, working tree unchanged from loop entry. stage1=0 (classifier exit predates any pass-completion accounting). narrowings=2+0+0+0 (seeded NarrowedChunks: PIC#diagnostic-emission-isolation + diagnostics.md#session-shutdown-details-conventions; no in-loop additions because no fixer dispatch). stage1Touched=0 mode-e-refusals=0. Snapshot namespace retained for forensics. Reshape options per _blocked.md: split T19e (real-time sibling emission timing paragraph) out as its own top-level fix (AF2+AF4+AF5+AF6 = 100/150 score concentrate there), raise the cluster's authored score/importance (current S=25 is the heading-absent default — recovering original member metadata from git is the prerequisite), or narrow the T19e Solution approach (drop arrival-order claim, defer anchor/split structural fix, restate timing in terms of sendSystemNote chain rather than pi.sendMessage directly). A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md

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

## T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule

> **PARKED** — 2026-05-18T21:48:22Z
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 6,8. Loop notes: Classifier exited on `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate). S=25, Σ_shadow=211, breach margin=186, multiplier=8.44 (k=3 gate). 9 non-blocker raised findings counted toward shadow budget (all 9 would have been trust-overridden to fix under per-finding rules); 4 additional blocker `must-fix:true` raised findings listed in `_blocked.md` for forensic context but pre-empted by gate. The classifier's `_blocked.md` flags that the origin defaulted to S=25 (medium) because T11a's heading was already removed from `docs/spec-review.md` by the top-level fixer and no git-recovery tool is available in the classifier context; T11a's cluster siblings T11b/T11c are both `Importance: high` / `score:100`, and under a recovered S=100 the shadow-multiplier would be 2.11 (below k=3) and per-finding classification would have proceeded normally — surfacing this as a likely category-1 reshape false-positive that the outer prompt may want to re-dispatch with the recovered score. Pass 3 contributed no fixCount (classifier exited pre-dispatch). severity p1 raised{high:4,medium:3} fixed{high:4,medium:2} deferred{medium:1} blocked{}; p2 raised{blocker:1,high:3,medium:1,low:1,NIT:2} fixed{blocker:1,high:3,medium:1,low:1,NIT:2} deferred{} blocked{}; p3 raised{high:4,medium:7,low:1,NIT:1} fixed{} deferred{} blocked{high:4,medium:7,low:1,NIT:1}. stage1=2 (cumulative all passes ran in stage 1; stage 2/3 never reached). narrowings=0+0+0+0. stage1Touched=9 mode-e-refusals=0. Snapshot refs under `refs/loom/snapshots/2026-05-18T20-40-42_a4d5c3/*` (baseline, baseline-post-top-level, pass-1, pass-2, pass-3) retained for forensics. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/t11a-replace-consumes-one-slot-prose-with-explicit-forced-respond-exemption-rule.md

# T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule

**Kind:** testability
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Tool-call loop bound* section in `docs/spec_topics/query.md` (anchor `tool-call-loop-bound`) and the `tool_loop` field paragraph in `docs/spec_topics/frontmatter.md` each assert that the forced respond turn for a typed query consumes one `tool_loop` slot. That framing contradicts CIO-4 in `docs/spec_topics/hard-ceilings.md` and its *Depth-6 forced respond at `max_rounds`* worked consequence, which together treat the forced respond turn as the unconditional terminating mechanism CIO-4's `max_rounds`-final branch routes to (slot-accounting is evaluated only against free-phase rounds). At `max_rounds: 0` the contradiction is directly observable: under the "consumes one slot" reading the only available turn is already over budget; under CIO-4 it MUST still be dispatched. The sibling findings T11b and T11c cannot land their V6k changes against the spec until this prose is reconciled.

## Solution approach

Rewrite the relevant sentences in the *Tool-call loop bound* section of `docs/spec_topics/query.md` and in the `tool_loop` field paragraph of `docs/spec_topics/frontmatter.md` to replace the "consumes one slot" framing with an explicit forced-respond-exemption rule: the forced respond turn is the typed-query terminating mechanism CIO-4's `max_rounds`-final branch routes to; the runtime MUST dispatch it on every typed query that reaches that branch (including the `max_rounds: 0` boundary case, where it is the only turn issued); and CIO-4's slot-accounting check is not evaluated against the forced respond turn itself. Confirm `docs/spec_topics/hard-ceilings.md` CIO-4 and the *Depth-6 forced respond at `max_rounds`* worked consequence remain aligned with the new rule and leave them unedited if they do.

## Solution constraints

- Treat `docs/spec_topics/hard-ceilings.md` (CIO-4 and the *Depth-6 forced respond at `max_rounds`* worked consequence) and PIC-1 (d) in `docs/spec_topics/pi-integration-contract.md` as read-only — they are already aligned with the new rule.
- Plan leaves V6k and V6l in `docs/plan_topics/v6-typed-queries.md` are owned by T11b and T11c — out of scope here.

## Relationships

- T11b "V6k counting-formula tighten: forced respond outside the budget" — must-precede (the prose rule must land before V6k's formula can be rewritten against it).
- T11c "V6k normative test vector for `max_rounds: 0` typed query" — must-precede (the prose rule must land before V6k's test can assert against it).

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
