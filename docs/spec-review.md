# Triaged Spec Review — spec.md

_Generated: 2026-05-08T09:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding in the file is addressed first; the first finding is addressed last._

# T02 — Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph

**Kind:** placement
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The second paragraph of `docs/spec.md`'s `## Overview` section embeds an inline parenthetical enumerating the per-axis subagent state-isolation contract (what the spawned session inherits from the loom's frontmatter, what is forwarded from the caller's `ExtensionCommandContext`, and what is not inherited). The same sentence already forward-links to the **Subagent state-isolation matrix** at `docs/spec_topics/pi-integration-contract.md#subagent-state-isolation-matrix`, which is the canonical owner of that enumeration. Restating the axes in the Overview duplicates owner-page content in an aggregator (against the aggregator-vs-source convention in `docs/spec_topics/governance.md` GOV-12) and creates a stale-reference risk whenever the matrix's column membership changes.

## Solution approach

Delete the inline per-axis parenthetical (the em-dashed clause beginning "— what the spawned session inherits from the loom's frontmatter ...") from the second sentence of `## Overview` in `docs/spec.md`. The sentence's forward-link to `#subagent-state-isolation-matrix` and its forward-link to `./spec_topics/glossary.md` for the `callable set` definition are both retained; the `#subagent-state-isolation-matrix` anchor target is unchanged.

## Solution constraints

- Do not migrate the deleted axis names into `pi-integration-contract.md` — the matrix at `#subagent-state-isolation-matrix` is the canonical owner; restating them as PIC prose would re-create the duplication this finding fixes.
- Out of scope: the `<a id="terminal-outcomes-aggregator">` paragraph that immediately follows is owned by T26.

## Relationships

- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster (broader pattern of misplaced detail in the Overview/Orientation prose).
- T26 "Terminal-outcomes paragraph in Overview restates routing taxonomy owned by Errors and Results" — same-cluster (sibling Overview placement issue).

---

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

# T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`

**Kind:** assumptions, completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

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

# T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

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

# T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers

**Kind:** assumptions
**Importance:** medium
**Shape:** single
**State:** reduced

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

# T07 — `QueryError.message` content has no normativity rule

**Kind:** testability
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/errors-and-results.md`, every `QueryError` variant declared under `## QueryError variants` (`CancelledError`, `SchemaValidationError`, `TransportError`, `ModelToolError`, `ContextOverflowError`, `ToolLoopExhaustedError`, `CodeToolError`, `InvokeInfraError`, `InvokeCalleeError`) carries an unannotated `message: string` field. The single exception is the **Panic message string (normative)** rule, which pins `InvokeInfraError.message` to a registered `loom/runtime/*` template when `cause === "panic"`. The intended contract on the non-panic cases — `message` is human-readable debug prose for operators, on the JavaScript `Error.message` convention, and is not part of the conformance contract — is implicit in the silence and is not stated anywhere a test author or downstream reader can find it. Without that positive statement, a conformance test author has no anchor for what to assert against, and a future maintainer extending the variant set has no convention to follow.

## Solution approach

State in the `### Notes` subsection of `## QueryError variants` in `docs/spec_topics/errors-and-results.md` that (i) programmatic consumers and conformance tests assert against `kind` and each variant's structured fields, (ii) `message` carries human-readable debug prose on the JavaScript `Error.message` convention and is not part of the conformance contract, and (iii) the single exception is `InvokeInfraError.message` on the panic path, which the **Panic message string (normative)** rule immediately above pins to a registered `loom/runtime/*` template. Composition (paragraph count, sentence count, ordering of the three items) and framing posture are the implementer's choice.

## Solution constraints

- Preserve the existing **Panic message string (normative)** rule for `InvokeInfraError.message` when `cause === "panic"` byte-for-byte; the new paragraph is additive and must not weaken or restate the panic-template wording.
- Do not introduce per-variant `message` templates in any form (e.g. a `loom/error/*` code-registry section).

## Relationships

- T08a "Rewrite slash-invocation.md context_overflow system-note row to 'context overflow'" — same-cluster (touches the same `QueryError variants` surface; co-resolve siblings T08b/c also relevant).
- T39 "Mid-stream cancellation paragraph bundles multiple obligations under one anchor" — same-cluster (cancellation pathway; independent obligation-splitting concern).

---

# T08a — Rewrite slash-invocation.md context_overflow system-note row to "context overflow"

**Kind:** naming
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The `context_overflow` row of the per-`kind` system-note table in `docs/spec_topics/slash-invocation.md` currently renders the user-facing template as `"loom /<name> returned Err: context window exceeded"`, which uses a different root word from the rest of the corpus. The schema name `ContextOverflowError`, the wire `kind` literal `"context_overflow"`, and the surrounding prose in `binder.md`, `pi-integration-contract.md`, `hard-ceilings.md`, and `glossary.md` all use the bare root word "context overflow". Because that table is normative and byte-pinned ("Renderers MUST emit the surrounding template text verbatim"; "Wording changes are spec-versioned breaking changes"), once leaf V18i pins the literal text in tests, harmonising the row later becomes a breaking spec-version bump.

## Solution approach

Rewrite the user-facing template in the `context_overflow` row of the per-`kind` system-note table in `docs/spec_topics/slash-invocation.md` so it ends with the bare root word `context overflow` in place of `context window exceeded`. Edit only the table cell's prose — the schema name, the wire `kind` literal `"context_overflow"` (the row's first column), and any field names are unchanged. Coordinate landing with siblings T08b and T08c so the corpus root word is harmonised in one commit.

## Solution constraints

- Do not rename the schema identifier `ContextOverflowError` or the wire `kind` literal `"context_overflow"`; the change is the user-facing template wording only.
- The `errors-and-results.md` prose sweep is owned by T08b and the `query.md` sweep by T08c.
- Land before leaf V18i pins the literal in conformance tests — once V18i ships, this rename becomes a spec-versioned breaking bump under the table's "Wording changes are spec-versioned breaking changes" clause.

## Relationships

- T08b "Sweep errors-and-results.md line 206 'context-window overflow' to 'context overflow'" — co-resolve.
- T08c "Sweep query.md line 285 'context window exceeded' to provider context-overflow phrasing" — co-resolve.
- T07 "`QueryError.message` content has no normativity rule" — same-cluster (touches the same `QueryError variants` surface).

---

# T08b — Sweep errors-and-results.md line 206 "context-window overflow" to "context overflow"

**Kind:** naming
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `ContextOverflowError` variant intro paragraph in the *Query-time variants* section of `docs/spec_topics/errors-and-results.md` — the prose sentence immediately preceding the ```` ```loom schema ContextOverflowError { ... } ```` block — describes the trigger as a "context-window overflow". The rest of the corpus (schema name `ContextOverflowError`, wire `kind` literal `"context_overflow"`, and the sibling sweeps in `slash-invocation.md` (T08a) and `query.md` (T08c)) uses the bare root word "context overflow". The hyphenated variant in this one prose site is observable at every cross-page navigation as a phrasing inconsistency.

## Solution approach

Rewrite the `ContextOverflowError` variant intro paragraph in the *Query-time variants* section of `docs/spec_topics/errors-and-results.md` to use the bare root word "context overflow" in place of "context-window overflow". Coordinate landing with siblings T08a and T08c so the corpus root word is harmonised in one commit.

## Solution constraints

- Do not rename the schema identifier `ContextOverflowError` or the wire `kind` literal `"context_overflow"`; the change is the prose root word only.
- The slash-invocation system-note row is owned by T08a; the `query.md` sweep by T08c.

## Relationships

- T08a "Rewrite slash-invocation.md context_overflow system-note row to 'context overflow'" — co-resolve.
- T08c "Sweep query.md line 285 'context window exceeded' to provider context-overflow phrasing" — co-resolve.
- T07 "`QueryError.message` content has no normativity rule" — same-cluster.

---

# T08c — Sweep query.md line 285 "context window exceeded" to provider context-overflow phrasing

**Kind:** naming
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Detection of `ContextOverflowError`* section in `docs/spec_topics/query.md` describes the runtime as mapping recognised provider `"context window exceeded"` error responses to this variant — quoting an exact provider error string. The quoted phrase both diverges from the corpus root word "context overflow" used by the schema name `ContextOverflowError`, the wire `kind` literal `"context_overflow"`, and the sibling sweeps in `slash-invocation.md` (T08a) and `errors-and-results.md` (T08b), and over-commits the spec to a literal provider string when the per-provider signatures actually live in *Pi Integration Contract — Provider error mapping*. A reader can't tell whether "context window exceeded" is a normative substring providers must emit or just one historical example.

## Solution approach

Rewrite the affected sentence in the *Detection of `ContextOverflowError`* section of `docs/spec_topics/query.md` to use the bare "context-overflow" phrasing — name the provider behaviour without quoting any specific provider error string. Keep the existing cross-reference to *Pi Integration Contract — Provider error mapping*, which retains ownership of the per-provider signatures. Coordinate landing with siblings T08a and T08b so the corpus root word is harmonised in one commit.

## Solution constraints

- Do not rename the schema identifier `ContextOverflowError` or the wire `kind` literal `"context_overflow"`.
- The slash-invocation system-note row is owned by T08a; the `errors-and-results.md` sweep by T08b.
- Do not introduce a new normative rule about what providers may or must emit — the per-provider signatures remain owned by *Pi Integration Contract — Provider error mapping*.

## Relationships

- T08a "Rewrite slash-invocation.md context_overflow system-note row to 'context overflow'" — co-resolve.
- T08b "Sweep errors-and-results.md line 206 'context-window overflow' to 'context overflow'" — co-resolve.
- T07 "`QueryError.message` content has no normativity rule" — same-cluster.

---

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

# T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified

**Kind:** testability
**Importance:** high
**Shape:** single
**State:** reduced

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

# T14 — Prompt-mode sequentiality argument has an unstated fourth premise

**Kind:** assumptions
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The Session-model paragraph in `docs/spec.md` (anchored at `id="session-model"`) concludes that prompt-mode bodies execute strictly sequentially within a user session and supports that conclusion with three premises (i)/(ii)/(iii) that only close the user-session axis. Those three premises do not on their own rule out the sibling-subagent fan-out path that the next paragraph explicitly admits: a subagent-mode body may itself `invoke(...)` a prompt-mode child, and whether such a child can re-enter the user session and contend for `pi.setActiveTools` is the load-bearing question. The closing rule lives in the Cross-mode semantics section of `docs/spec_topics/invocation.md` (a `subagent → prompt` callee attaches to the subagent's own private `AgentSession`, not the user session), but a reader auditing the argument from `spec.md` alone cannot derive that — the fourth premise is unstated.

## Solution approach

Add a fourth premise to the parenthesised support list in the Session-model paragraph that names the Cross-mode rule closing the subagent-spawned-prompt-mode-child escape, and forward-link to the owning section in `docs/spec_topics/invocation.md`. Cite the Cross-mode rule rather than inlining or paraphrasing it. Leave the existing three premises and the follow-up "three potential sources of in-session overlap" sentence unchanged.

## Solution constraints

- The new premise must forward-link the Cross-mode semantics section and must not inline, restate, or paraphrase its content beyond a one-clause framing of which fan-out path is closed — that is the whole point of the finding (avoid aggregator overreach).
- Do not modify the existing premises (i)/(ii)/(iii) or the follow-up "three potential sources of in-session overlap" sentence.
- Restructuring of the Session-model paragraph is owned by T15a / T15b / T15c; the fourth premise is carried across whichever sibling lands first per T15b's coordination with this finding.
- Plan-leaf edits to V15g / V15h / V15j are out of scope here.

## Relationships

- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — same-cluster (different premise of the same argument).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster (touches the same Session-model paragraph; co-edit pass).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (also concerns the sibling-subagent fan-out path, on the diagnostics axis; co-resolve siblings T19b/c/d/e also relevant).
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster (same fan-out path, resource-exhaustion axis).
