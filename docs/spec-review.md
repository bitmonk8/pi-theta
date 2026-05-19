# Triaged Spec Review — spec.md

_Generated: 2026-05-08T09:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding in the file is addressed first; the first finding is addressed last._
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

Rewrite the relevant sentences in the *Tool-call loop bound* section of `docs/spec_topics/query.md` and in the `tool_loop` field paragraph of `docs/spec_topics/frontmatter.md` to replace the "consumes one slot" framing with an explicit forced-respond-exemption rule: the forced respond turn is the typed-query terminating mechanism CIO-4's `max_rounds`-final branch routes to; the runtime MUST dispatch it on every typed query that reaches that branch (including the `max_rounds: 0` boundary case, where it is the only turn issued); and CIO-4's slot-accounting check is not evaluated against the forced respond turn itself. Confirm `docs/spec_topics/hard-ceilings.md` CIO-4 and the *Depth-6 forced respond at `max_rounds`* worked consequence remain aligned with the new rule and leave them unedited if they do.

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

# T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection

**Kind:** placement
**Importance:** high
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

# T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers

**Kind:** assumptions
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced
**Decision axes:** 3

## Problem

The `operator` entry in `docs/spec_topics/glossary.md` binds *operator-facing* tightly to the active Pi TUI session via the `loom-system-note` channel, but the rest of the corpus admits non-TUI invocation paths — `invoke` from another loom, "programmatic consumers", a future loom harness, and the deferred `loom test` and non-loom programmatic harness items in `docs/spec_topics/future-considerations.md` — without reconciling them with that binding. The first use of *operator* in `docs/spec.md` (the terminal-outcomes aggregator paragraph at `<a id="terminal-outcomes-aggregator">`, "what the operator observes per channel") does not forward-link to the glossary, and the glossary `operator` entry has no anchor to link to. A reader auditing whether non-interactive callers see an operator-facing surface has no anchored answer, and a future contributor adding a non-slash entry point has no V1 binding to extend.

## Solution approach

Add an HTML anchor to the `operator` entry in `docs/spec_topics/glossary.md` matching the convention sibling glossary entries already use, and append one sentence to that entry pinning the V1 invariant: every loom invocation runs inside an active Pi TUI session (so an operator is always present) and non-interactive invocation paths — including the deferred `loom test` command and the deferred non-loom programmatic harness named in `docs/spec_topics/future-considerations.md` — are out of V1 scope, with the operator-facing channel's behaviour outside a TUI session undefined. Then add an inline forward-link of the form `the operator (per [Glossary](./spec_topics/glossary.md#operator))` on the first use of *operator* in the terminal-outcomes aggregator paragraph (`<a id="terminal-outcomes-aggregator">`) of `docs/spec.md`. The existing generic forward-link to the glossary in the Runtime observability bullet under `Scope` does not need a per-term anchor.

## Solution constraints

- Use the existing HTML-anchor convention (`<a id="..."></a>`) on the new glossary entry, matching siblings like `<a id="in-loop"></a>` and `<a id="query-terminating"></a>`; do not invent a new anchor scheme.
- The V1 carve-out lives in the glossary `operator` entry only; the consolidated V1 non-goals list (owned by T38) may cite it but is out of scope here.
- Do not extend the V1 disclaimer to Pi's `convertToLlm` LLM-context entry — that surface is a property of the channel, not the operator role.
- Reuse the deferred-feature names already in `docs/spec_topics/future-considerations.md` verbatim (`loom test`; non-loom programmatic harness); do not coin new names.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — same-cluster (overlapping scope: what the operator sees on success vs across non-interactive paths).
- T38 "Non-goals are not consolidated into a single section" — same-cluster (the V1 "no non-interactive delivery path" disclaimer is one of the items the consolidated Non-goals section would cite back to the glossary entry).

---

# T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file

**Kind:** testability
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `bind_context: session` bullet in the *bind_context* value list of `docs/spec_topics/binder.md` (the bullet immediately under "Configured via `bind_context:` …") describes the session-context cap as "the last ~20 turns or ~8000 tokens (whichever is smaller)". The tildes read as approximation and "whichever is smaller" reads as a min-of-two cap, while the *Session-context truncation (`bind_context: session`)* subsection later in the same file pins exact, jointly-applied, boundary-inclusive bounds (a turn is included iff running token total ≤ 8000 *and* running turn count ≤ 20). A reader who consumes only the bullet cannot tell that the limits are exact, joint, or boundary-inclusive, so an implementer or test author working from the bullet alone may round counts, undercount tokens, or apply min-of-two and still believe themselves conformant.

## Solution approach

Rewrite the `bind_context: session` bullet to defer entirely via a forward-link to the *Session-context truncation (`bind_context: session`)* subsection (anchor `#session-context-truncation-bind_context-session`) and let that subsection own the literals. Drop the tildes and the "whichever is smaller" framing. Do not restate the caps inline at the bullet — the forward-link IS the substitution, and any inline restatement re-opens the two-site duplication that drove the prior dispatch's stage-3 prose-token cycle (the alternate "restate verbatim" branch of the original bimodal approach is rejected as part of this reshape).

## Solution constraints

- Treat the *Session-context truncation* subsection and the rendered binder system-prompt example line (`Recent session context (most recent 20 turns / 8000 tokens):`) as read-only; the bullet defers via forward-link only and never paraphrases, re-derives, or restates the caps.
- Do not introduce a third independent statement of the caps in `binder.md` — the only acceptable copies remain the *Session-context truncation* subsection and the rendered system-prompt example line, both already present.
- Do not rename the forward-link's display text once chosen beyond the minimum required by markdown link syntax; per pi-loom meta-analysis §3.4, the link display text was the dominant prose-token cycle source on the prior dispatch (full vs abbreviated variants oscillated across 7 passes) and is the surface most likely to attract stage-3 naming-cycle refusals under rec AA's mode (g).

## Relationships

None

---

# T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

**Kind:** naming
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced
**Decision axes:** 2

## Problem

The concept "the LLM the slash-command argument binder calls" appears across three surface conventions with two different root words: frontmatter uses `bind_` (`bind_model`, `bind_context`, `bind_echo`), while settings keys, diagnostic codes, anchors, and running prose use the longer root `binder` (`looms.binderModel`, `loom/load/binder-model-unresolved`, `## Binder model` in `docs/spec_topics/binder.md`, glossary entry `**binder**`). The per-surface case style (snake / camel / kebab) is already governed by documented conventions; the `binder` → `bind_` shortening inside the frontmatter family is not — the *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` documents the snake-case rule but is silent on this root-word delta, and the glossary has an entry for `**binder**` (the mechanism) but no entry for the binder-model concept, so the cross-surface mapping has no canonical anchor. Author-facing remediation hints that name both surfaces in one sentence (e.g. the `loom/load/binder-model-unresolved` row in `docs/spec_topics/diagnostics.md`: ``set 'bind_model:' in frontmatter or 'looms.binderModel' in settings``) read as a typo until the convention is internalised.

## Solution approach

Declare a single canonical home for the convention: extend the *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` with one sentence pinning the `bind_` (frontmatter) vs `binder` (settings, diagnostic, prose) root-word convention for the binder-related family. Add a `**binder model**` glossary entry to `docs/spec_topics/glossary.md`, alphabetised between the existing `**binder**` and `**callable set**` entries, whose body is a **back-reference** of the form `See the *Naming convention* paragraph in [frontmatter](./frontmatter.md#naming-convention) for the per-surface root-word mapping (`bind_*` frontmatter vs `binder*` / `binder-*` settings, diagnostic, prose).`, NOT a parallel statement of the convention. The convention itself is owned only by the frontmatter *Naming convention* paragraph; the glossary entry is a discoverable forward-link from a reader who lands on a `binder*` token first, not a second authoritative copy.

## Solution constraints

- Do not rename `bind_model`, `bind_context`, or `bind_echo` to `binder_model` / `binder_context` / `binder_echo`.
- Do NOT restate the per-surface mapping (the four spellings, the `bind_` vs `binder` root-word delta, the relationship to sibling `bind_` fields) inside the glossary entry — the glossary entry is a back-reference only. Any prose-level statement of the convention lives in the frontmatter *Naming convention* paragraph and only there. This is the two-site-authoring guard rec AA's mode (g) would otherwise refuse against on stage-3 passes.
- Scope the new convention sentence to the binder-model concept only: do NOT extend it to a universal claim about "every other binder-related frontmatter family surface". The `bind-context-*` and `bind-echo-*` diagnostic-code families use different patterns and are not in scope for this finding.
- Do not coin a new anchor scheme on the glossary entry; reuse the existing `<a id="..."></a>` convention sibling entries already use.

## Relationships

None
---

# T13a — Define the `cross-file` qualifier in the *countable-frame* paragraph of `invocation.md`

**Kind:** completeness
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The normative *countable-frame* paragraph of the "Invocation depth bound" subsection in `docs/spec_topics/invocation.md` uses the qualifier `cross-file` on `.warp` `fn` calls without defining what counts as cross-file dispatch. The token is load-bearing — it is the discriminator that decides whether an intra-`.warp`-file `fn` call consumes a depth slot — but no defining occurrence of `cross-file` exists in `docs/spec_topics/` reachable from the subsection. Sibling T13b realigns the introductory paragraph of the same subsection and the V18n leaf's *Adds.* bullet in `docs/plan_topics/v18-cancellation.md` to use the same qualifier; without a defining occurrence in the *countable-frame* paragraph, the two propagation sites have nothing canonical to anchor against.

## Solution approach

Extend the normative *countable-frame* paragraph of the "Invocation depth bound" subsection of `docs/spec_topics/invocation.md` with a short clarifying clause defining `cross-file`: a `.warp` `fn` call is *cross-file* when the caller and callee reside in different `.warp` source files, and an intra-file `fn` call (caller and callee in the same `.warp` source file) is not a countable frame. Frame the clause as an in-paragraph definition rather than as a new subsection or glossary entry; the qualifier already lives in this paragraph and a separate definition site would re-introduce the same two-site drift the propagation cleanup (T13b) closes.

## Solution constraints

- Do not coin a new term in place of `cross-file`; the qualifier is already in use across the subsection and the propagation sites T13b realigns.
- Do not relocate the *countable-frame* paragraph or change its position within the subsection.
- Do not add a new glossary entry or a separate definition section — the definition lives inline in the *countable-frame* paragraph.

## Relationships

- T13b "Invocation depth bound: propagate the `cross-file` qualifier to the introductory paragraph and the V18n leaf" — must-precede (the defining clause must land before the propagation sites realign to it).

---

# T13b — Invocation depth bound: propagate the `cross-file` qualifier to the introductory paragraph and the V18n leaf

**Kind:** naming
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The introductory paragraph of the "Invocation depth bound" subsection in `docs/spec_topics/invocation.md` enumerates the countable dispatches as direct `invoke(...)`, `.loom` callable calls through `tools:`, and `.warp` `fn` invokes — omitting the `cross-file` qualifier that the normative *countable-frame* paragraph immediately below applies to `.warp` `fn` calls. The qualifier is load-bearing: without it, intra-`.warp`-file `fn` dispatch is wrongly read as consuming a depth slot, so two implementers reading the subsection in order arrive at incompatible 32-slot budgets. The same loose phrasing has already propagated to the V18n leaf's *Adds.* bullet in `docs/plan_topics/v18-cancellation.md`.

## Solution approach

Rewrite the third item of the introductory paragraph of the "Invocation depth bound" subsection in `docs/spec_topics/invocation.md` so it reads "cross-file `.warp` `fn` calls" — adding the `cross-file` qualifier and matching the noun (`calls`) used by the normative *countable-frame* paragraph that follows. Apply the same wording change to the *Adds.* bullet of V18n in `docs/plan_topics/v18-cancellation.md`. Leave the normative *countable-frame* paragraph (whose definition of `cross-file` is owned by T13a) and the rest of the subsection unchanged.

## Solution constraints

- The definition of `cross-file` is owned by T13a in the *countable-frame* paragraph; do not restate the definition at either propagation site.

## Relationships

- T13a "Define the `cross-file` qualifier in the *countable-frame* paragraph of `invocation.md`" — must-follow.

---

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
- T16e "PIC step 2 internal contradiction: literal `pi.setActiveTools([...snapshot, ...names])` call shape vs natural-language 'exactly the loom's declared callable set'" — must-follow (the prompt-mode visibility characterisation in this paragraph forward-links to a PIC step whose internal contradiction T16e resolves first).

---


