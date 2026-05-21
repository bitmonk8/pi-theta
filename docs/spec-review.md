# Triaged Spec Review — spec.md

_Generated: 2026-05-08T09:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding in the file is addressed first; the first finding is addressed last._
_(Updated 2026-05-20 T19a — Extend ActiveInvocationRegistry entry shape with invocationId finding-shape Pattern F auto-reshape: Solution approach narrowed from directive to directional form. Net change to retained count: 0.)_
_(Updated 2026-05-20 T19b — Add invocation_id field to RuntimeEvent payload declaration finding-shape Pattern J auto-reshape: negative-space prescription sentence deleted from Solution approach. Net change to retained count: 0.)_
_(Updated 2026-05-20 T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept finding-shape Pattern L auto-reshape: deleted 2 gratuitous content span(s) from Solution approach. Net change to retained count: 0.)_
_(Updated 2026-05-20 T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept finding-shape Pattern K auto-reshape: deleted 1 decision-log sentence from Solution constraints. Net change to retained count: 0.)_
_(Updated 2026-05-20 T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept finding-shape Pattern G auto-reshape: deleted 1 non-binding constraint bullet. Net change to retained count: 0.)_
---

# T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule

**Kind:** testability
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Tool-call loop bound* section in `docs/spec_topics/query.md` (anchor `tool-call-loop-bound`) and the `tool_loop` field paragraph in `docs/spec_topics/frontmatter.md` each assert that the forced respond turn for a typed query consumes one `tool_loop` slot. That framing contradicts CIO-4 in `docs/spec_topics/hard-ceilings.md` and its *Depth-6 forced respond at `max_rounds`* worked consequence, which together treat the forced respond turn as the unconditional terminating mechanism CIO-4's `max_rounds`-final branch routes to (slot-accounting is evaluated only against free-phase rounds). At `max_rounds: 0` the contradiction is directly observable: under the "consumes one slot" reading the only available turn is already over budget; under CIO-4 it MUST still be dispatched. The sibling findings T11b and T11c cannot land their V6k changes against the spec until this prose is reconciled.

## Solution approach

Rewrite the relevant sentences in the *Tool-call loop bound* and *Typed queries are tool-loop-shaped* sections of `docs/spec_topics/query.md`, in the `tool_loop` field paragraph of `docs/spec_topics/frontmatter.md`, in the *tool-call round slot accounting* entry of `docs/spec_topics/glossary.md`, and in the *Issuing typed queries* bullet of `docs/spec_topics/pi-integration-contract.md` (the sentence beginning "The forced respond turn counts against the same `tool_loop.max_rounds` cap" — this sentence sits in the *Conversation drive* section and is distinct from PIC-1 (d), which remains read-only per the constraint below) to replace the "consumes one slot" framing with an explicit forced-respond-exemption rule: the forced respond turn is the typed-query terminating mechanism CIO-4's `max_rounds`-final branch routes to; the runtime MUST dispatch it on every typed query that reaches that branch (including the `max_rounds: 0` boundary case, where it is the only turn issued); and CIO-4's slot-accounting check is not evaluated against the forced respond turn itself. Confirm `docs/spec_topics/hard-ceilings.md` CIO-4 and the *Depth-6 forced respond at `max_rounds`* worked consequence remain aligned with the new rule and leave them unedited if they do.

## Solution constraints

- Treat `docs/spec_topics/hard-ceilings.md` (CIO-4 and the *Depth-6 forced respond at `max_rounds`* worked consequence) and PIC-1 (d) in `docs/spec_topics/pi-integration-contract.md` as read-only — they are already aligned with the new rule.
- Plan leaves V6k and V6l in `docs/plan_topics/v6-typed-queries.md` are owned by T11b and T11c — out of scope here.

## Relationships

- T11b "V6k counting-formula tighten: forced respond outside the budget" — must-precede (the prose rule must land before V6k's formula can be rewritten against it).
- T11c "V6k normative test vector for `max_rounds: 0` typed query" — must-precede (the prose rule must land before V6k's test can assert against it).

---

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

# T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified

**Kind:** testability
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** single
**State:** reduced
**Decision axes:** 2

## Problem

The *Single-string bypass* clause (item 2 of *Binder bypass*, anchor `bypass-cases`) in `docs/spec_topics/binder.md` is silent on the case where the user supplies no slash argument or supplies only whitespace. After the documented leading/trailing-whitespace trim, the bound value is `""`, and AJV with the default `string` schema accepts it, but the bypass path has no binder fallback, no `needs_info` channel, and no reserved diagnostic for this case — so two reasonable implementers diverge on whether the loom starts with `""` bound or whether the runtime emits a system note and suppresses the loom. The choice is load-bearing for the user-visible surface and for V3c's test matrix in `docs/plan_topics/v3-frontmatter.md`, which currently has no row pinning the empty-trim outcome.

## Solution approach

Clarify item 2 of *Binder bypass* in `docs/spec_topics/binder.md` to pin the chosen behaviour: when the slash argument is absent or trims to the empty string, the param is bound to `""` and the loom starts; AJV validates `""` against the `string` schema (it passes by definition). Add a paired test row to V3c's *Tests* line in `docs/plan_topics/v3-frontmatter.md` asserting that the no-argument and whitespace-only-argument cases both bind the param to `""` and start the loom.

## Solution constraints

- Do not introduce a new diagnostic code, a new failure-mode-template row, or a new system-note template — the resolution is to clarify the bound value and start condition only.
- Do not alter the existing trim semantics: leading/trailing whitespace stripped, internal whitespace preserved (e.g. `/foo  hello  ` still binds `"hello"`).
- Do not change echo policy on the bypass path — echo auto-suppression on bypass per V16k must continue to hold for the absent / whitespace-only cases.
- The *No-params overflow* note in `docs/spec_topics/slash-invocation.md` must remain gated on `params: {}` / absent; do not extend it to fire on the single-string bypass path.

## Relationships

None

---

# T07 — `QueryError.message` content has no normativity rule

**Kind:** testability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/errors-and-results.md`, every `QueryError` variant declared under `## QueryError variants` (`CancelledError`, `SchemaValidationError`, `TransportError`, `ModelToolError`, `ContextOverflowError`, `ToolLoopExhaustedError`, `CodeToolError`, `InvokeInfraError`, `InvokeCalleeError`) carries an unannotated `message: string` field. The single exception is the **Panic message string (normative)** rule, which pins `InvokeInfraError.message` to a registered `loom/runtime/*` template when `cause === "panic"`. The intended contract on the non-panic cases — `message` is human-readable debug prose for operators, on the JavaScript `Error.message` convention, and is not part of the conformance contract — is implicit in the silence and is not stated anywhere a test author or downstream reader can find it. Without that positive statement, a conformance test author has no anchor for what to assert against, and a future maintainer extending the variant set has no convention to follow.

## Solution approach

State in the `### Notes` subsection of `## QueryError variants` in `docs/spec_topics/errors-and-results.md` that (i) programmatic consumers and conformance tests assert against `kind` and each variant's structured fields, (ii) `message` carries human-readable debug prose on the JavaScript `Error.message` convention and is not part of the conformance contract, and (iii) the single exception is `InvokeInfraError.message` on the panic path, which the **Panic message string (normative)** rule immediately above pins to a registered `loom/runtime/*` template. Composition (paragraph count, sentence count, ordering of the three items) and framing posture are the implementer's choice.

## Solution constraints

- Preserve the existing **Panic message string (normative)** rule for `InvokeInfraError.message` when `cause === "panic"` byte-for-byte; the new paragraph is additive and must not weaken or restate the panic-template wording.
- Do not introduce per-variant `message` templates in any form (e.g. a `loom/error/*` code-registry section).
- Three pre-existing cross-file `.message` pins exist outside the `## QueryError variants` block: `ValidationError.message = "rendered query template is empty"` at `docs/spec_topics/query.md:98`; the pin at `docs/spec_topics/pi-integration-contract.md:262`; and the pin at `docs/spec_topics/implementation-notes.md:23`. The new audience-claim paragraph MUST NOT author a closure-shaped predicate over the cross-file `.message` pinning surface (no "the only cross-file `.message` pin is …" framing, no "V1 pinning surface exhausted by single entry" framing); the (ii) clause's audience statement about non-panic `message` content is scoped to the `QueryError variants` block and stands beside these three pre-existing pins without subsuming or contradicting them.

## Relationships

- T08a "Rewrite slash-invocation.md context_overflow system-note row to 'context overflow'" — same-cluster (touches the same `QueryError variants` surface; co-resolve siblings T08b/c also relevant).
- T39 "Mid-stream cancellation paragraph bundles multiple obligations under one anchor" — same-cluster (cancellation pathway; independent obligation-splitting concern).

---

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
