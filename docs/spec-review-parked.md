# pi-loom — Consolidated Spec Review (Parked)

_Parked findings: 4._

---

## T055 - Item (i) leaves the loom-side overflow-signature regex update unspecified, and the SHOULD-item fail disposition is asymmetric across items (f)–(ad)

> **PARKED** — 2026-06-06T15:58:14Z
> **Reason:** Category 1 (malformed finding — default attribution for top-level fixer refusals; the fixer's pre-flight typically catches stale preconditions, missing destination subsections, or do-not-touch conflicts — may also be category 2 if the refusal reason is capacity-shaped, see FixerNotes). Parked as part of MULTI cluster T055 - Item (i) leaves the loom-side overflow-signature regex update unspecified, and the SHOULD-item fail disposition is asymmetric across items (f)–(ad); T115 - Provider-error-mapping table: row-selection key, Bedrock `ValidationException` discriminator, and HTTP-200 envelope discriminator unpinned (rec F). The fast loop (/spec-fix-findings-loop) could not resolve the cluster. Refusal reason: picker-cluster-violation — dispatched MULTI cluster {T055, T115} omits T115's live co-resolve sibling T084; fixer refused to land partial cluster (co-resolve is a hard bundle). Cluster discarded this cycle; fresh re-review will re-cluster.
> **Forensic report:** none (fast loop — no forensic report)

# T055 - Item (i) leaves the loom-side overflow-signature regex update unspecified, and the SHOULD-item fail disposition is asymmetric across items (f)–(ad)

**Original heading:** Provider overflow-signature fixture red has no defined loom-side signature-update resolution; falsification disposition inconsistent across SHOULD items
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The step-2 editorial-review checklist in `version-bump-step2.md` carries two distinct defects in its SHOULD-level items (f) through (ad).

**(A) Item (i) — provider-overflow signature.** Item (i) requires the contributor to re-run the provider-error fixtures and, separately, to keep the test corpus current by "re-capturing each provider's error-body text when it publishes an error-format or API-version change." It is silent on the third edit a real provider rewording demands: updating the *loom-side overflow signature regex* in the Provider-error-mapping table on `provider-error-mapping.md` (the four regexes such as `/(prompt is too long|exceeds .* context window|maximum context length)/i`). When the corpus is refreshed to the new wording but the loom-side regex is left untouched, the fixture stays red — or worse, ships green against a stale corpus and production silently downgrades real `ContextOverflowError`s to `TransportError` with `tokens_used`/`tokens_limit` null, exactly the failure mode `provider-overflow-wording-presupposition` warns about. The cited presupposition paragraph names the symptom but routes resolution to item (i), which then does not author it.

**(B) Items (f)–(ad) — fail-disposition asymmetry.** Five of the twenty-five SHOULD items (g, j, q, v, ad) carry an explicit fail-disposition sentence of the form *"If falsified, surface the divergence on the bump commit so [the cited paragraph] can be amended in the same edit; PIC does not author the loom-side recovery here."* The other twenty items (f, h, i, k, l, m, n, o, p, r, s, t, u, w, x, y, z, aa, ab, ac) describe only the silent-failure consequence (*"would surface as a runtime `TypeError` at the subagent spawn site…"*, *"would silently invert the predicates…"*) and then jump straight to the SHOULD-to-build-time-pin escalation boilerplate, leaving unspecified what the auditor records on a fail, whether a same-edit spec amendment is required, and whether loom-side recovery is in scope for the bump. Two conforming contributors auditing the same SDK regression on, say, item (n) will reasonably disagree on whether to record `fail`, on whether to amend `agentsession-interface` in the same commit, and on whether they owe a runtime workaround.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — Editorial-review checklist, items (f)–(ad) and the introductory preamble (edited)
- `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — *Provider error mapping* table and the *Provider-owned-wording presupposition* paragraph (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project plan exists at `docs/plan.md` but its Horizontal, MVP, and Vertical sections all read *"No leaves yet — author per the template"*; there are no leaf pages under `docs/plan_topics/` other than the template and conventions files. Nothing to update.)

## Consequence

**Severity:** correctness

For (A), a contributor who follows item (i) literally — re-runs the fixtures, re-captures the corpus — and stops there will ship a bump in which the loom-side regex no longer matches the provider's reworded overflow body, silently misclassifying real `ContextOverflowError`s as `TransportError` with null token fields. For (B), the asymmetry causes per-item-divergent auditor behaviour on twenty of twenty-five SHOULD items: the recorded outcome shape, the same-edit spec-amendment obligation, and the scope of loom-side recovery are all reader-inferred rather than pinned.

## Solution Space

**Shape:** single
**State:** reduced

Two independent obligations. Land the bounded item-(i) edit first so the checklist already speaks a consistent post-fail vocabulary when the disposition sweep lands.

1. **Add the overflow-signature-update obligation to item (i).** In `docs/spec_topics/pi-integration-contract/version-bump-step2.md` item (i), after the "responsibility of the contributor performing the bump" sentence, append: *"A fixture red whose root cause is that the re-captured provider body no longer matches the loom-side overflow signature in the Provider-error-mapping table on `provider-error-mapping.md` is resolved by updating that row's overflow-signature regex in the same edit as the corpus re-capture; the regex MUST end the bump matching the re-captured body."* Optionally cross-link from the *Provider-owned-wording presupposition* paragraph in `provider-error-mapping.md` to this sentence (anchor on item (i)'s existing `bump-checklist-provider-overflow-wording` id). This closes the production silent-misclassification gap.

2. **Hoist one fail-disposition clause into the checklist preamble.** In the same file's step-2 preamble, after the existing "MUST record the per-item audit outcome … in the bump commit message" sentence, add: *"On a `fail` outcome for any of items (f) through (ad), the contributor MUST (1) record the divergence in the bump commit message under the failing item, (2) amend the cited presupposition paragraph in the same edit so the spec no longer asserts the falsified property, and (3) treat loom-side recovery as out of scope for this bump unless the failing item's body says otherwise — PIC does not author the loom-side recovery here. Item (e) is the sole exception: its fail outcome is resolved per the item-(e) recovery mutex prescribed in its body."* Then delete the per-item *"If falsified, surface the divergence on the bump commit so [X] can be amended in the same edit; PIC does not author the loom-side recovery here"* sentence from items (g), (j), (q), (v), and (ad). Leave item (i)'s prose untouched (edit 1 covers its item-specific recovery). This replaces twenty-five reader-inferences with one normative sentence and removes the per-item duplication.

### Edge cases

- For edit 1, the regex update lives in `provider-error-mapping.md` but the obligation lives in `version-bump-step2.md`; the same-edit constraint is what makes the pair safe, so do not split the regex update into a follow-up commit.
- For edit 2, the deletion sweep must touch exactly items (g), (j), (q), (v), (ad) and no others. Item (e)'s longer fail-recovery prose stays (it authors a real loom-side recovery — the per-extension-instance serialisation mutex — which is why the preamble names it as the sole exception). Items (i)/(u)/(aa)/(ab) carry re-run-fixture prose that is not a fail-disposition and must not be touched.
- After edit 1, item (i)'s signature-update edit is an in-bump action distinct from "loom-side recovery", so it needs no carve-out in the preamble; the *"unless the failing item's body says otherwise"* clause already accommodates any future SHOULD item that authors its own loom-side recovery.

## Relationships

- T114 "pi-ai provider-error surface (status, body, network-failure delivery) is undefined" - same-cluster (same `provider-error-mapping.md` page, independent defect)

---

## T115 - Provider-error-mapping table: row-selection key, Bedrock `ValidationException` discriminator, and HTTP-200 envelope discriminator unpinned

> **PARKED** — 2026-06-06T15:58:14Z
> **Reason:** Category 1 (malformed finding — default attribution for top-level fixer refusals; the fixer's pre-flight typically catches stale preconditions, missing destination subsections, or do-not-touch conflicts — may also be category 2 if the refusal reason is capacity-shaped, see FixerNotes). Parked as part of MULTI cluster T055 - Item (i) leaves the loom-side overflow-signature regex update unspecified, and the SHOULD-item fail disposition is asymmetric across items (f)–(ad); T115 - Provider-error-mapping table: row-selection key, Bedrock `ValidationException` discriminator, and HTTP-200 envelope discriminator unpinned (rec F). The fast loop (/spec-fix-findings-loop) could not resolve the cluster. Refusal reason: picker-cluster-violation — dispatched MULTI cluster {T055, T115} omits T115's live co-resolve sibling T084; fixer refused to land partial cluster (co-resolve is a hard bundle). Cluster discarded this cycle; fresh re-review will re-cluster.
> **Forensic report:** none (fast loop — no forensic report)

# T115 - Provider-error-mapping table: row-selection key, Bedrock `ValidationException` discriminator, and HTTP-200 envelope discriminator unpinned

**Original heading:** Error-table row-selection key, Bedrock `ValidationException` discriminator, and HTTP-200 error-envelope discriminator unpinned
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** implementability (shard-13)
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

The **Provider error mapping** table in `provider-error-mapping.md` is the runtime's classifier for turning provider responses into `ContextOverflowError` / `TransportError`. Three pieces of the classifier's matching machinery are missing, each independently sufficient to produce divergence between two conforming implementations.

1. **Row-selection key is absent.** The table has four rows (`anthropic-messages`, `openai-completions`, `mistral`, `amazon-bedrock`) but never says how the runtime chooses which row applies to a given response. The sibling **Provider seed-field mapping** in the same file (line 31) is explicit — it is "keyed on the resolved binder model's `api` field as reported by `@earendil-works/pi-ai`'s model registry." The error-mapping table inherits no such pin. An implementer could (a) gate matching by the resolved model's `api` field — the model-registry-driven approach the seed table uses — or (b) try every row's signature against every response and accept the first match. The two strategies diverge whenever a non-openai 4xx body happens to contain `context_length_exceeded`, when an anthropic-shaped error body arrives from a non-anthropic gateway, etc.

2. **Bedrock `ValidationException` discriminator is unpinned.** Every other row pins an HTTP status (`HTTP 400`) and either a typed field (`error.type`, `error.code`) or a body regex. The bedrock row says only "`ValidationException` with body matching …". `ValidationException` is an AWS exception *class name*, not a JSON body field; the row pins neither an HTTP status nor the field/mechanism by which loom recognises it (thrown SDK class? AWS `__type` JSON field? an `errorCode` header? something pi-ai surfaces?). Two implementers cannot agree on what to match.

3. **HTTP-200 body-envelope error discriminator is openai-only.** Both the catch-all paragraph (line 5) and `TransportError.retryable` (line 11) classify "an HTTP-200 response carrying a non-overflow body-envelope error" as `TransportError`. But the only definition of what makes a 200 body an "error envelope" is the openai-completions row's `error.code: "context_length_exceeded"`. For mistral / anthropic / bedrock 200 responses there is no rule for deciding that a 200 body is an error at all — so the catch-all has no domain on those providers, and the seemingly-symmetric rule reduces in practice to "openai only."

Detection of (1) and (3) is silent: a non-openai HTTP-200 body-envelope error falls through to "ok response" and is mis-classified as a successful provider turn; a Bedrock context-overflow misread under (2) falls through to `TransportError` with `tokens_used`/`tokens_limit` null, exactly the failure mode the *Provider-owned-wording presupposition* is meant to surface to editorial review.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — **Provider error mapping** table, catch-all paragraph, *Provider-owned-wording presupposition*, **`TransportError.retryable` population** (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — `#model-registry-pin` (read-only; supplies the `Model<Api>.api` anchor reused by the row-selection key)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — `provider` derivation paragraph that already pins `Model<Api>.api` as the `Api`-shaped key the error-mapping table is "keyed on" (read-only; the prose currently asserts a key the table does not name)
- `docs/spec_topics/binder/determinism-cancellation-failure.md` — *Failure-class taxonomy* (read-only; restates the catch-all and inherits any new HTTP-200 discriminator wording)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — checklist item (i), *Provider overflow-signature wording* (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(Project has a plan scaffold but no leaves authored.)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on at least one of three axes — which row applies to a given response, whether a bedrock context-overflow is recognised at all, and whether a non-openai 200-body error is classified as `TransportError` or silently treated as success. Each divergence produces a different `QueryError` variant for the same provider response, which in turn changes whether the binder consumes a transport-class retry budget, whether `tokens_used`/`tokens_limit` are populated, and whether the failure even surfaces to the operator.

## Solution Space

**Shape:** single
**State:** reduced

Resolve three independent obligations against `provider-error-mapping.md` as three separate edits (ideally separate fix-loop iterations), in order, so each lands on a settled foundation and the review pass critiques each obligation in isolation.

### Step 1 — Pin the row-selection key
Add a single sentence to the **Provider error mapping** paragraph (line 5) stating that the table is keyed on the resolved model's `api` field as reported by `@earendil-works/pi-ai`'s model registry, exactly as the **Provider seed-field mapping** paragraph already states for itself (line 31), with the same `Model<Api>.api` cross-link to `host-interfaces-core.md#model-registry-pin`. A response from a provider whose `api` value matches no row maps to `TransportError` via the catch-all unconditionally (no cross-provider signature matching). This is the foundational scoping rule — it determines the domain over which the next two steps operate.

Spec edit: one sentence in the line-5 paragraph; a cross-link to `host-interfaces-core.md#model-registry-pin`; an inline `Api`-shaped key note matching the wording at `queryerror-variants.md` line 108 for `provider` derivation.

### Step 2 — Pin the Bedrock `ValidationException` discriminator
Replace the bedrock row's "ValidationException with body matching …" shorthand with a fully-specified discriminator: name the AWS-side JSON field (`__type` containing `"ValidationException"`, or whichever field pi-ai's bedrock adapter surfaces) plus the HTTP status (AWS Bedrock returns `400`), parallel to the anthropic/openai/mistral rows, keeping the body regex unchanged. If pi-ai presents bedrock errors as a typed exception class rather than a body field, cite the pi-ai-side declaration site (path + member) for that class, per the convention the sibling "pi-ai provider-error surface" finding prescribes.

Spec edit: bedrock row at line 18 — replace `ValidationException` shorthand with `HTTP 400 with <field>: "ValidationException"` (or the pi-ai-typed-class equivalent). This depends only on the row-selection convention from Step 1 and closes the silent-downgrade path where a real bedrock context-overflow falls through to `TransportError` with null token counts.

### Step 3 — Scope the HTTP-200 envelope rule
Restate the catch-all to apply *only* where a per-row signature pins an HTTP-200 envelope shape. The HTTP-200 catch-all then has a defined domain (currently just the openai-completions row's "HTTP 200 with the same code in the body envelope"); any other provider's HTTP-200 response is treated as a successful turn, with mis-classification of true 200-body errors reaching editorial review under the *Provider-owned-wording presupposition*. This keeps the diff small and matches what loom can substantiate without inventing per-provider behaviour.

Spec edits: reword the catch-all paragraph at line 5 and the parallel sentence in `TransportError.retryable` at line 11 to bound the HTTP-200 arm to "providers whose row pins an HTTP-200 envelope shape." `binder/determinism-cancellation-failure.md` lines 31 and 33 inherit the rewording without further edits.

### Edge cases
- A provider response whose model's `api` value is unknown to the runtime (e.g. a future pi-ai `Api` literal not yet listed) must map to `TransportError` via the catch-all and MUST NOT silently fall through to "ok"; cross-reference the `Api`-coverage build-time assertion in the seed-table paragraph if the same assertion gates the error table.
- An AWS gateway response that returns `ValidationException` for a non-overflow reason (e.g. malformed request) must still classify as `TransportError`-not-overflow because the body regex fails; restate this explicitly so the new discriminator wording cannot be read as "any `ValidationException` is overflow."
- The *Provider-owned-wording presupposition* paragraph already routes silent-drift detection to editorial review; confirm the Step-3 rewording does not orphan that routing for the now-scoped HTTP-200 arm. A provider quietly switching from 4xx-on-overflow to 200-on-overflow downgrades to `TransportError`/null until the fixture sweep catches it.
- If first-hand evidence (provider docs or pi-ai surface) is later brought in for each non-openai row, Step 3 may be upgraded to a per-provider HTTP-200 sub-clause (with explicit "n/a" where a provider never returns 200-on-error); the scoped-rule form lands cleanly without it.

## Relationships

- T114 "pi-ai provider-error surface (status, body, network-failure delivery) is undefined" - decision-overlap (the discriminator wording depends on the pi-ai surface that finding pins)
- T083 "Stop-reason → `QueryError` variant mapping is undefined" - same-cluster (separate classifier arm, same `QueryError`-population machinery)
- T084 "`TransportError` catch-all in `query-failure-and-repair.md` is narrower than the PIC contract" - same-cluster (sibling catch-all-completeness gap; the catch-all rewording must not collide with that finding's restatement)
- T055 "Item (i) leaves the loom-side overflow-signature regex update unspecified, and the SHOULD-item fail disposition is asymmetric across items (f)–(ad)" - co-resolve (fixture-suite shape under `version-bump-step2.md` item (i) must be re-pointed at the new discriminator wording introduced by this finding)

---

## T045 - Audit-cluster testability/assumptions: four independent gaps bundled in one finding

> **PARKED** — 2026-06-06T16:43:52Z
> **Reason:** Category 1 (malformed finding — default attribution for top-level fixer refusals; the fixer's pre-flight typically catches stale preconditions, missing destination subsections, or do-not-touch conflicts — may also be category 2 if the refusal reason is capacity-shaped, see FixerNotes). Parked as part of MULTI cluster T045 - Audit-cluster testability/assumptions: four independent gaps bundled in one finding; T112 - Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates (rec F). The fast loop (/spec-fix-findings-loop) could not resolve the cluster. Refusal reason: state-mismatch — both co-resolve cluster members are in legacy triage layout (## Finding / ## Solution Space), not the reduced 3-field implementer form; fixer refused. Co-resolve forbids individual dispatch. Discarded this cycle; fresh re-review regenerates in reduced form.
> **Forensic report:** none (fast loop — no forensic report)

# T045 - Audit-cluster testability/assumptions: four independent gaps bundled in one finding

**Original heading:** Audit-cluster testability/assumptions: probe-seam contract undefined; infra-aborted-run carve-out over-broad; PIC-8 (d) body-succeeded path; complete()/IdSource/tab-free presuppositions
**Original section:** docs/spec_topics/pi-integration-contract/ (inventory/audit cluster, registry, binder-inference, capability probe)
**Kind:** testability (shard-11), assumptions (shard-11)
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The audit/registry cluster carries four independent testability and presupposition gaps that the original finding bundled into one entry. They share no edit surface and resolve independently; they are presented here as separate obligations.

1. **Probe-seam contract is undefined.** `active-invocation-registry.md` (Registry contract → "registry name is internal" bullet) instructs tests to assert on observable side effects "(entry counts via probe seams, ordered `loomAbort.abort()` calls, `disposeBarrier` settlement)" but no "probe seam" is defined anywhere in the cluster — neither as a DI seam in `host-interfaces-services.md` (which enumerates `Clock`, `FileSystem`, `FileWatcher`, `TokenEstimator`, `IdSource`, …) nor as an inspection method on the registry itself. Without a defined contract, "entry counts via probe seams" is unimplementable.

2. **Infra-aborted-run carve-out is keyed in a way that admits silent canary loss.** `audit-wire-and-canary.md` *Infra-aborted-run carve-out* identifies an "infra-aborted run" by **"the presence of one or more infrastructure-failure records"** in the stdout stream, and tells CI parsers to drop the once-per-invocation canary obligation for such runs. The keying is order-blind: a run that emitted its canary record *and then* hit an infrastructure failure produces exactly the same stdout shape (one canary + ≥1 infra record) as a run that failed before reaching the canary computation. CI parsers therefore stop asserting the canary contract on every post-canary infra failure — masking the very class of misconfiguration the canary exists to catch.

3. **PIC-8 (d) is vacuous on the body-succeeded path.** `tool-registration-lifetime.md` PIC-8 step (d) says, on double restore failure, to "propagate the original exception (or terminal `Err`) that the `finally` was protecting." When the protected body succeeded, there is no original exception to propagate. PIC-8 currently has no Then-clause for the (body-succeeded ∧ initial-restore-fails ∧ retry-restore-fails) path: steps (b) and (c) emit a diagnostic and a system note, but the query's nominal success/value disposition under this path is unstated.

4. **`audit-wire-and-canary.md`'s tab-free claim for the `path` field rests on an un-pinned premise.** The *Wire serialisation* paragraph states "the four field values … MUST NOT contain the ASCII tab character … bare identifiers, package-qualified imported names, the literal `<n/a>` sentinel, integer `line` values, and file paths are tab-free by their pinned shapes." File paths are **not** tab-free by any pinned shape in this corpus — POSIX permits ASCII tab in filenames, and no spec page restricts the audit's audited-path shape to exclude it. The tab-free claim therefore rests on an implicit and false premise about the host filesystem.

(The original framing also flagged `complete()` retry/cancellation and `IdSource` synchrony as "unpinned presuppositions." Those are in fact pinned — `complete()` retry/cancellation at `conversation-drive.md` §`complete-retry-and-cancellation-presupposition` and routed to bump-checklist items (aa)/(ab); `IdSource` at `host-interfaces-services.md` PIC-20. Those two sub-claims are not carried forward here.)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/active-invocation-registry.md` — "Registry contract" bullet list (edited, sub-issue 1)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — DI-seam section (edited, sub-issue 1)
- `docs/spec_topics/pi-integration-contract/audit-wire-and-canary.md` — *Infra-aborted-run carve-out* (edited, sub-issue 2)
- `docs/spec_topics/pi-integration-contract/audit-wire-and-canary.md` — *Wire serialisation* / *Per-family record-shape table* (edited, sub-issue 4)
- `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md` — PIC-8 (read-only structurally; edited body for new Then-clause, sub-issue 3)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project has no leaves authored under `plan_topics/` yet — `plan.md` lists Horizontal / MVP / Vertical-slice sections, all empty.)

## Consequence

**Severity:** correctness

Sub-issues 1, 2, and 3 each admit two reasonable implementers diverging: (1) tests for registry teardown have no defined inspection surface to bind to; (2) CI parsers built per spec will silently miss post-canary infra failures, defeating the canary's purpose on exactly the runs where the audit reached real work before crashing; (3) implementers will guess differently on whether to mark the query successful, throw a synthetic error, or rethrow the restore error on the body-succeeded double-failure path. Sub-issue 4 is advisory in isolation (the rule still bans tabs in the field) but undermines the spec's stated justification chain.

## Solution Space

**Shape:** single
**State:** reduced

Resolve four independent gaps in smallest-surface-first order so each lands on a stable predecessor baseline: first drop the false path-tab-free justification; then re-key the infra-aborted-run carve-out; then add the PIC-8 body-succeeded disposition; then define the registry probe seam (the largest surface change) last.

### Spec edits

1. **Drop the path-tab-free justification.** In `audit-wire-and-canary.md` *Wire serialisation*, keep the tab-in-field-values prohibition at MUST but strike the unsupported clause "and file paths are tab-free by their pinned shapes". Add a positive obligation: when an audited path contains an ASCII tab (legal on POSIX), the audit MUST escape or substitute it before emission in a reversible way (e.g. percent-encode the tab as `%09`), and pin the encoding (percent-encoding limited to tab and other prohibited bytes) so two implementations do not diverge and CI parsers can decode it.
2. **Re-key the infra-aborted-run carve-out on canary presence.** In `audit-wire-and-canary.md`, change the *Infra-aborted-run carve-out* predicate from "identifiable by the presence of one or more infrastructure-failure records" to "identifiable by the absence of a canary record on the run's stdout." Add a complementary sentence: a run that emitted a canary record before terminating with an infra failure MUST satisfy the once-per-invocation canary obligation; the CI parser asserts canary presence/uniqueness on every run that emitted at least one canary record, regardless of whether infra records also appear. Keying on canary-record presence is monotone in audit progress (the canary record is emitted exactly once, near the end, before any infra-failure summary), eliminating the silent-loss path.
3. **Add a body-succeeded Then-clause to PIC-8 (d).** In `tool-registration-lifetime.md` PIC-8, replace step (d) with a two-armed disposition splitting on whether the protected body produced an exception or a terminal `Err`. *Body threw / produced terminal `Err`*: propagate it unchanged (current behaviour). *Body succeeded*: the query is treated as having failed — the runtime synthesises a terminal error whose surface mirrors the active-set-restore-failed diagnostic (cause: `internal_error`, message references the double restore failure, propagates as the query's outcome) so the caller is never silently told the body succeeded while the runtime is in a known-corrupted active-set state. Add a cross-reference from the per-invocation `finally`'s disposition page (if any) to PIC-8.
4. **Define the probe-seam contract on the registry.** In `active-invocation-registry.md`, replace the "entry counts via probe seams" phrase with a concrete DI seam `RegistryInspector` (added to `host-interfaces-services.md`) whose method `snapshot(): readonly { invocationId: string; loom: string; shutdownReason: string | undefined }[]` returns the current entries in insertion order. Production wires it to the runtime's registry instance; tests construct a fake or pass the real instance directly. Add a PIC entry in `host-interfaces-services.md` mirroring the `IdSource` shape (interface + production adapter + fake + per-runtime construction rule), consistent with the rest of the DI-seam family.

### Edge cases

- The implementation must order canary emission before any subsequent infra-failure record on partial-evaluation runs so the parser's "canary present ⇒ assert obligation" rule has a single well-defined input. A run that terminates partway through canary-record construction (e.g. counters computed but a crash inside the line formatter) falls under the existing *Pre-emission termination carve-out* ("before any record can be emitted"), which remains the correct landing.
- The synthesised error on the body-succeeded double-restore-failure path MUST use the same surface shape (terminal `Err` per the existing PIC-8 frame) as the body-threw arm — do not introduce a third surface.
- The `RegistryInspector` seam is registry-internal, not a Pi surface; ensure the inventory audit's category partition keeps it out of category (1)/(2)/(3).

## Relationships

None

---

## T112 - Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates

> **PARKED** — 2026-06-06T16:43:52Z
> **Reason:** Category 1 (malformed finding — default attribution for top-level fixer refusals; the fixer's pre-flight typically catches stale preconditions, missing destination subsections, or do-not-touch conflicts — may also be category 2 if the refusal reason is capacity-shaped, see FixerNotes). Parked as part of MULTI cluster T045 - Audit-cluster testability/assumptions: four independent gaps bundled in one finding; T112 - Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates (rec F). The fast loop (/spec-fix-findings-loop) could not resolve the cluster. Refusal reason: state-mismatch — both co-resolve cluster members are in legacy triage layout (## Finding / ## Solution Space), not the reduced 3-field implementer form; fixer refused. Co-resolve forbids individual dispatch. Discarded this cycle; fresh re-review regenerates in reduced form.
> **Forensic report:** none (fast loop — no forensic report)

# T112 - Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates

**Original heading:** Binder `complete()` within-attempt retry/backoff delegated to `StreamOptions` fields the options list never sets
**Original section:** docs/spec_topics/pi-integration-contract/ (inventory/audit cluster, registry, binder-inference, capability probe)
**Kind:** error-model, assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`binder-inference.md` enumerates exactly what the runtime puts on each binder `complete(model, context, options)` call: `model`, `context.systemPrompt`, `context.messages`, `context.tools`, `options.temperature = 0`, `options.signal = loomAbort.signal`, and — for providers whose `Api` carries a seed field — the seed under that field name. `options.maxRetries` and `options.maxRetryDelayMs` are not in that list, so loom never assigns them.

`determinism-cancellation-failure.md` (`#per-invocation-retry-budget`) and `conversation-drive.md` (`#complete-retry-and-cancellation-presupposition`, checklist item (aa) in `version-bump-step2.md`) nevertheless build the binder's whole within-call retry / backoff / `Retry-After` story on those two fields: "Client-side retry of a *single* underlying attempt — including any backoff and any server-requested wait such as an HTTP `Retry-After` — is owned by `@earendil-works/pi-ai`'s `StreamOptions.maxRetries` and `StreamOptions.maxRetryDelayMs` … loom redefines neither field." Two implementers reading the population list and the presupposition together will diverge on what actually reaches the provider: one will pass nothing and inherit whatever pi-ai's defaults are at the pinned version; another will read "loom redefines neither field" as "explicitly forward pi-ai's documented defaults under their own names"; a third will set `maxRetries: 0` to silence within-call retries entirely so the loom-level per-invocation budget is the sole retry surface. Each is a defensible reading and each yields a different observable inter-attempt latency and a different ceiling on total provider calls per slash invocation.

Whichever disposition is correct, the spec must state it: either pin the values loom places on `options`, or state that loom deliberately omits these fields and name the pi-ai defaults the runtime is inheriting at the pinned version (so the version-bump procedure has a concrete value to diff against).

## Spec Documents

- `docs/spec_topics/pi-integration-contract/binder-inference.md` — `complete(...)` options-population list (edited)
- `docs/spec_topics/binder/determinism-cancellation-failure.md` — Per-invocation retry budget paragraph, `StreamOptions` delegation sentence (edited)
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — `complete-retry-and-cancellation-presupposition` (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — checklist item (aa) (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan currently contains no authored leaves; coverage matrix is empty.)

## Consequence

**Severity:** correctness

Two good-faith implementations diverge on observable behaviour: the number of provider calls per loom-level binder attempt, the per-attempt backoff, and `Retry-After` adherence all depend on values the spec leaves unspecified. The loom-level 3-call ceiling stays intact, but the *real* per-invocation upper bound on provider hits and the inter-attempt latency floor differ across implementations, and the version-bump checklist item (aa) has no concrete value to re-verify against.

## Solution Space

**Shape:** single
**State:** reduced

Keep the `complete()` options-population list as is, but pin explicitly that loom deliberately omits `maxRetries` / `maxRetryDelayMs` and inherits pi-ai's defaults at the pinned version, naming those defaults inline. This matches the existing "loom redefines neither field" posture and the conversation-drive presupposition (which already holds that pi-ai owns inter-attempt timing including `Retry-After`), and it avoids loom inventing concrete retry numerics outside its expertise. The single new obligation — re-reading two values from pi-ai's type declaration on each Pi bump — slots into the existing editorial-review checklist alongside item (aa).

### Spec edits
- `binder-inference.md`: insert a sentence after the enumerated population list stating the deliberate omission and the inherited defaults, e.g. "loom omits `options.maxRetries` and `options.maxRetryDelayMs`; the binder call inherits pi-ai's defaults at the pinned version (`maxRetries = <N>`, `maxRetryDelayMs = <M>` at `dist/types.d.ts`)." Read `<N>`/`<M>` from pi-ai's `dist/types.d.ts` at the pinned version.
- `determinism-cancellation-failure.md#per-invocation-retry-budget`: re-word the `StreamOptions` delegation sentence to point at the named inherited defaults rather than at the unnamed library behaviour.
- `version-bump-step2.md`: add a checklist item (or extend (aa)) requiring the contributor to re-read those two default values from pi-ai's `dist/types.d.ts` at each Pi minor bump and update the named values in the same edit if they changed.

### Edge cases
- If pi-ai's `.d.ts` documents the defaults only via prose comments rather than as `?:` defaults inferable from the type, name the implementation-site default instead and accept that drift detection is editorial.
- A silent pi-ai default change between minor bumps would shift loom's binder retry depth and backoff with no SDK surface-inventory signal until the editorial-review item is run.
- The typed-query forced respond turn — the other loom call routed through `complete()` — should inherit the same disposition for consistency.

## Relationships

- T111 "Binder `complete()` call execution phase contradicts its own cancellation/argument wiring" - same-cluster (also targets the binder-inference options-population list; co-edit window)
- T045 "Audit-cluster testability/assumptions: four independent gaps bundled in one finding" - co-resolve (its "unpinned `complete()` retry/cancellation behaviour" item is the same gap viewed from the audit cluster's perspective; pinning the options here discharges that sub-item)

---

## T096 - `loom-direct:` `toolCallId` shape, uniqueness, and minting source are unspecified

> **PARKED** — 2026-06-06T18:58:46Z
> **Reason:** Category 1 (malformed finding — default attribution for top-level fixer refusals; the fixer's pre-flight typically catches stale preconditions, missing destination subsections, or do-not-touch conflicts — may also be category 2 if the refusal reason is capacity-shaped, see FixerNotes). Parked as part of MULTI cluster T096 - `loom-direct:` `toolCallId` shape, uniqueness, and minting source are unspecified; T097 - `loom-direct:` toolCallId has no PIC-20-compliant minting path (rec F). The fast loop (/spec-fix-findings-loop) could not resolve the cluster. Refusal reason: spec-review-fixer refused the co-resolve cluster: member T097 lacks top-level **State:** reduced and retains the un-reduced triage shape (## Finding / ## Spec Documents / ## Plan Impact / ## Consequence / ## Solution Space). Co-resolve binding blocks landing T096 alone. state-mismatch: finding requires reduction before fix-loop can accept it.
> **Forensic report:** none (fast loop — no forensic report)

# T096 - `loom-direct:` `toolCallId` shape, uniqueness, and minting source are unspecified

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`host-interfaces-core.md`'s **Tool execution from loom code** bullet and `tool-calls.md`'s *loom 1.0 seam — per-call timeout* paragraph both describe the `toolCallId` passed to a Pi tool's `execute(...)` for code-side `<name>(args)` calls as "a synthesised UUID prefixed `loom-direct:`", but neither pins the separator and post-prefix form (literal `loom-direct:` plus which UUID form), the uniqueness guarantee and its scope, or the minting source. PIC-20 makes the `IdSource` seam the sole sanctioned UUID minter and forbids the runtime from calling `crypto.randomUUID()` outside the production adapter, yet `toolCallId` has no enumerated minting path — a literal reading leaves an implementer unable to mint one admissibly. Concurrent re-entrant `.loom`-callable adapter calls (parallel tool-call mode entering the same adapter) make the uniqueness question observable. Conformance fixtures asserting on the rendered id cannot be written, and two implementers diverge on the id surface and on whether `crypto.randomUUID()` is in scope at this site.

## Solution approach

Pin the full `toolCallId` contract at `host-interfaces-core.md`'s **Tool execution from loom code** bullet (the one introducing `toolCallId`) and reduce the `tool-calls.md` *loom 1.0 seam — per-call timeout* reference to a forward-link. State that the value is the string `loom-direct:` concatenated with a canonical lowercase 8-4-4-4-12 hex UUID, citing the §7 `<invocation-id>` placeholder convention in `placeholder-rendering-b.md` as the source of the UUID-form contract. State that a fresh id is minted per code-side `<name>(args)` call — including each re-entrant entry in a parallel `.loom`-callable batch — and name the uniqueness scope. Route the UUID minting through the PIC-20 `IdSource` seam (`#pic-20` in `host-interfaces-services.md`) so the ambient-UUID prohibition is satisfied.

## Solution constraints

- Do not weaken PIC-20's ambient-UUID prohibition: the runtime MUST NOT call `crypto.randomUUID()` (or any other ambient UUID source) outside the production adapter, and the minting path stays routed through the `IdSource` seam.
- The canonical 8-4-4-4-12 hex UUID form is owned by §7 of `placeholder-rendering-b.md`; reference it rather than authoring an independent form definition.

## Relationships

- T097 "`loom-direct:` toolCallId has no PIC-20-compliant minting path" - co-resolve (the two findings cite the same underlying gap from the form-side and the minting-side respectively).

---

## T097 - `loom-direct:` toolCallId has no PIC-20-compliant minting path

> **PARKED** — 2026-06-06T18:58:46Z
> **Reason:** Category 1 (malformed finding — default attribution for top-level fixer refusals; the fixer's pre-flight typically catches stale preconditions, missing destination subsections, or do-not-touch conflicts — may also be category 2 if the refusal reason is capacity-shaped, see FixerNotes). Parked as part of MULTI cluster T096 - `loom-direct:` `toolCallId` shape, uniqueness, and minting source are unspecified; T097 - `loom-direct:` toolCallId has no PIC-20-compliant minting path (rec F). The fast loop (/spec-fix-findings-loop) could not resolve the cluster. Refusal reason: spec-review-fixer refused the co-resolve cluster: member T097 lacks top-level **State:** reduced and retains the un-reduced triage shape (## Finding / ## Spec Documents / ## Plan Impact / ## Consequence / ## Solution Space). Co-resolve binding blocks landing T096 alone. state-mismatch: finding requires reduction before fix-loop can accept it.
> **Forensic report:** none (fast loop — no forensic report)

# T097 - `loom-direct:` toolCallId has no PIC-20-compliant minting path

**Original heading:** `loom-direct:` toolCallId minting path collides with the PIC-20 ambient-UUID ban
**Original section:** docs/spec_topics/ tool-calls, cancellation, hard-ceilings
**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

PIC-20 (`docs/spec_topics/pi-integration-contract/host-interfaces-services.md:152`) makes the `IdSource` seam the sole sanctioned source of UUID-shaped identifiers minted at runtime: the runtime "MUST mint each `invocationId` through this seam and MUST NOT call `crypto.randomUUID()` (or any other ambient UUID source) outside the production adapter." The seam's normative member surface — pinned to `newInvocationId(): string` — exposes exactly one minter, named for the `invocationId` use case.

`docs/spec_topics/pi-integration-contract/host-interfaces-core.md:82` and the open-struct seam at `docs/spec_topics/tool-calls.md:40` then mandate a second runtime-minted identifier: the `toolCallId` passed to `tool.execute(toolCallId, params, signal, onUpdate, ctx)` for every code-side `<name>(args)` call, "a synthesised UUID prefixed `loom-direct:`." A `toolCallId` is not an `invocationId` (different lifetime, different cardinality — one per tool call vs one per loom invocation), and the PIC-20 seam offers no member that returns one. An implementer reading the spec literally has three contradictory options: reuse `newInvocationId()` (semantically wrong — the `invocationId` is already in the `ActiveInvocationRegistry` entry, and tests fakes seeding the id sequence will collide with the registry's expected values), call `crypto.randomUUID()` directly (forbidden by PIC-20's MUST NOT), or invent an undocumented seam member. None of these is admissible without a spec edit.

The same gap leaves `FakeIdSource` (used to drive deterministic conformance tests for the `loom/runtime/reload-teardown-timeout` `<list>` and the `RuntimeEvent.invocation_id` wire field) unable to produce deterministic `toolCallId`s, breaking the test-injectability rationale PIC-20 explicitly invokes.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-20 `IdSource` seam (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — "Tool execution from loom code" (edited)
- `docs/spec_topics/implementation-notes.md` — `crypto.randomUUID()` carve-out wording (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project's `plan.md` has no leaves authored yet — Horizontal, MVP, and Vertical sections are all empty placeholders.)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one reuses `newInvocationId()` and silently corrupts the deterministic `invocationId` sequence the registry's `<list>` rendering and `RuntimeEvent.invocation_id` fixtures depend on; another calls `crypto.randomUUID()` and violates PIC-20's normative MUST NOT (also defeating test injectability). Either path produces a tool that ships but fails conformance against a test suite that probes either surface.

## Solution Space

**Shape:** single
**State:** reduced

Give the `loom-direct:` `toolCallId` a PIC-20-compliant minting path by widening the `IdSource` seam, preserving PIC-20's no-ambient-UUID stance and deterministic test injectability for both identifier populations.

### Spec edits

- `host-interfaces-services.md` PIC-20 — add a second member `newToolCallId(): string` to the inline `interface IdSource` block, returning the canonical lowercase 8-4-4-4-12 hex UUID (the same shape `newInvocationId` returns; the `loom-direct:` prefix is applied by the caller, not by the seam). Extend the `CryptoIdSource` and `FakeIdSource` adapter paragraphs to describe its production wiring (`crypto.randomUUID()`) and test wiring (next-from-configured-sequence). Extend the normative sentence *"MUST mint each `invocationId` through this seam and MUST NOT call `crypto.randomUUID()` ..."* to *"MUST mint each `invocationId` and each `toolCallId`'s UUID portion through this seam."*
- `host-interfaces-core.md` "Tool execution from loom code" — replace the bare "synthesised UUID prefixed `loom-direct:`" with "synthesised as the string `loom-direct:` concatenated with `IdSource.newToolCallId()`'s return value (canonical lowercase 8-4-4-4-12 hex UUID)."

The added member is internal DI covered by GOV-18 arm (a)'s non-normative-signature carve-out, so the seam-surface growth is negligible and additive; existing call sites are not perturbed.

### Edge cases

- The `loom-direct:` prefix is applied at the call site, not inside `newToolCallId()`, so the seam member's contract remains "returns a canonical lowercase 8-4-4-4-12 hex UUID," identical in shape to `newInvocationId()`.
- `FakeIdSource` must seed two independent sequences (or one sequence consulted by call order, documented explicitly) so a test asserting on `RuntimeEvent.invocation_id` is not perturbed by interleaved tool-call-id minting.
- The `crypto.randomUUID()` carve-out wording in `implementation-notes.md:30` continues to refer to "the production adapter" and needs no change.

## Relationships

- T096 "`loom-direct:` `toolCallId` shape, uniqueness, and minting source are unspecified" - co-resolve (the same `host-interfaces-core.md` "Tool execution from loom code" bullet edit naming the seam member also pins suffix shape, uniqueness, and canonical UUID form.)

---

## T058 - Step-2(b) family→branch correspondence inverts at the family-distinctive arms

> **PARKED** — 2026-06-07T10:10:13Z
> **Reason:** Category 1 (malformed finding — the finding's own Spec Documents scope marks `audit-target-categories.md` and `audit-recognised-shapes.md` read-only, but its Solution edits' fourth bullet instructs updating `step 2(b) branch (N)` references in those same two files: a Class II site-scope inversion the fast loop's picker flagged as CONTRADICTS). The fast loop (/spec-fix-findings-loop) could not resolve the finding. Refusal reason: Picker emitted CONTRADICTS — the reduced finding's Solution edits instruct updating branch references in audit-target-categories.md and audit-recognised-shapes.md, which the finding's own Spec Documents scope marks read-only (Class II site-scope inversion). Not directly fixable in the fast loop. A human must reconcile the finding's Spec Documents scope with its Solution edits — either widen the scope so `audit-target-categories.md` / `audit-recognised-shapes.md` are marked edited (confirming the read-only intent was wrong), or drop those two files from the Solution edits' fourth bullet — before re-introducing it.
> **Forensic report:** none (fast loop — no forensic report)

# T058 - Step-2(b) family→branch correspondence inverts at the family-distinctive arms

**Original heading:** Step-2b branch (4)/(5) route to each other's inverse family; family/branch monotone correspondence broken
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`audit-failures.md`'s normative *family→step-2(b) routing table* uses
the same `1..5` ordinal label-space for both the five failure
**families** and the five resolution **branches** in
`version-bump-step2b.md`. Families (1)–(3) (unauthorised `pi.<member>`
access, unauthorised peer-package / typebox surface, unauthorised
`ctx.<member>` access) all map to the shared subset of branches (1)
[delete] / (2) [promote] / (3) [exempt], so on those three rows the
ordinal happens to coincide with a permitted branch and the reader
forms the heuristic "family (N) → branch (N)". The heuristic then
breaks at the two rows where the family carries a *distinctive*
recovery arm:

- Family (4) (out-of-scope import/access shape) routes to branches (1)
  / (2) / **(5)** [rewrite-shape]. Branch (3) is structurally
  prohibited here per *Exemption mechanism*, so branch (5) is the
  family-(4)-distinctive arm.
- Family (5) (stale or malformed exemption marker) routes to branch
  **(4)** [stale-or-malformed-rewrite] as its sole primary arm.

A contributor or reviewer who has internalised the (1)→(1), (2)→(2),
(3)→(3) pattern from the first three rows and then encounters a
family-(4) red on a `bump-commit` diff naturally routes it to branch
(4) (the stale/malformed-marker remediation), and a family-(5) red
naturally to branch (5) (the source-line rewrite). Both are wrong
under PIC; both will be caught by the prose tables but only after the
reader re-reads. The inversion is stated once in `version-bump-step2b.md`'s
preamble (the parenthetical "family (4) — non-exemptible per
*Exemption mechanism*; routed through branch (5) [rewrite-shape]
rather than branch (3) [exempt]") and is not repeated at the branch
(4) or branch (5) anchor definitions themselves, so a reader landing
on those anchors via the per-row links in the routing table sees no
local reminder that the ordinal does not match.

The structural cause is the shared `1..5` ordinal label-space; any fix
must either remove the ordinal collision (by relabelling one side) or
restore monotone correspondence (by swapping branches (4) and (5)).

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2b.md` —
  branch enumeration (anchors `bump-step-2b-delete`, `-promote`,
  `-exempt`, `-stale-rewrite`, `-rewrite-shape`) and preamble (edited)
- `docs/spec_topics/pi-integration-contract/audit-failures.md` —
  *Failure-surface contract* family→step-2(b) routing table, *Note on
  family (5) routing*, *Per-family record-shape table*, *Stale
  sub-kinds* sub-case references (edited)
- `docs/spec_topics/pi-integration-contract/audit-resolution.md` —
  *Exemption mechanism* prose referencing `step 2(b) branch (4)` and
  `step 2(b) branch (5)` (edited)
- `docs/spec_topics/pi-integration-contract/inventory-audit-intro.md`
  — *Inventory-closure audit* paragraph referencing "step 2(b)'s five
  branches" (read-only; references are by count rather than by
  numbered branch)
- `docs/spec_topics/pi-integration-contract/audit-target-categories.md`
  — references to `step 2(b) branch (2)` (read-only under either
  option; only the (4)/(5) labels change)
- `docs/spec_topics/pi-integration-contract/audit-recognised-shapes.md`
  — references to `step 2(b) branch (2)` (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(`docs/plan.md` exists but currently contains no leaves; the
horizontal/MVP/vertical phase sections are all placeholders, so no
acceptance criteria are affected and nothing is blocked or unblocked
by the resolution.)

## Consequence

**Severity:** advisory

Contributor or reviewer routes a family-(4) or family-(5) red to the
wrong remediation arm on a `bump-commit` diff, producing either an
audit-still-red commit (e.g., attempting to "fix" a family-(4)
out-of-scope shape by deleting the marker per branch (4) when no
marker exists), or a wrong-shape repair that lands a second-order red
the next audit run catches. The routing table itself is correct and
mechanically authoritative, so the mistake surfaces at the next
`npm test` rather than at runtime; the cost is wasted contributor
cycles and reviewer churn, not a wrong-behaviour ship.

## Solution Space

**Shape:** single
**State:** reduced

Relabel the five step-2(b) branches into a label-space disjoint from the family ordinals so the inverted family→branch correspondence at the distinctive arms cannot mislead and cannot be re-introduced. Use lowercase letters `(a)`–`(e)` — the most readable disjoint space and aligned with the existing convention of labelling step 2(a)/2(b) themselves with letters. This co-resolves the related findings naming the same shared-label-space defect.

### Spec edits

- In `version-bump-step2b.md`, replace the `1.`–`5.` enumeration with `(a)`–`(e)` at the five branch headings and in the preamble's tie-break clauses (e.g. "if arms (b) and (c) both plausibly apply, pick arm (b) (promote)"). Leave the existing self-describing anchor IDs (`bump-step-2b-delete`, `-promote`, `-exempt`, `-stale-rewrite`, `-rewrite-shape`) in place to avoid inbound-link churn — the anchor URL is a stable identifier the displayed label evolves against.
- In `audit-failures.md`, rewrite both the family→step-2(b) routing table and the *Per-family record-shape table*'s `proposed-resolution` cells in the new label-space. Rewrite the *Note on family (5) routing* paragraph (its references to branch (4)'s sub-case (v) move to the new label for the stale-or-malformed-rewrite branch), the *Stale sub-kinds* paragraph's sub-case references, and the *Malformed-marker dual-emission co-commit obligation* prose (its "branch (2) above" and "branches (1), (2), or (3)" references become e.g. "arm (b)" and "arms (a), (b), or (c)").
- In `audit-resolution.md`, rewrite every `step 2(b) branch (N)` reference into the new label-space.
- In `inventory-audit-intro.md`, `audit-target-categories.md`, and `audit-recognised-shapes.md`, update any `step 2(b) branch (N)` references that appear in prose (a handful of `branch (2)` citations). Note `inventory-audit-intro.md` references "step 2(b)'s five branches" by count rather than by numbered branch and needs no change there.

The per-page edit cost is bounded by the small number of `branch (N)` citations across the audit cluster, verifiable by `grep -rn 'branch ([1-5])' docs/spec_topics/pi-integration-contract/`.

### Edge cases

- The displayed labels on the branch headings must match the labels used in every routing-table cell **and** in every prose citation that currently reads `branch (N)` or `step 2(b) branch (N)`. A single missed site leaves the reader holding two incompatible label-spaces side by side and is strictly worse than the status quo — run a corpus-wide grep for `branch (1)` … `branch (5)` as part of the edit.
- If the wider relabel scope is judged unacceptable (e.g. the cluster is about to be cited by a freshly-authored plan leaf whose `Spec` field would need updating), fall back to the smaller-surface local fix: swap the two distinctive branch ordinals so the family-distinctive arm equals the family ordinal (the rewrite-shape branch becomes branch (4) for family (4); the stale-or-malformed-rewrite branch becomes branch (5) for family (5)), updating the same routing-table cells and prose citations in `audit-failures.md` and `audit-resolution.md`. This fixes the inversion locally but leaves the shared-label-space concern to the related findings.

## Relationships

None

---

## T050 - Audit / drain-state / runtime-event / provider-error cluster — naming and clarity drift

> **PARKED** — 2026-06-07T11:49:02Z
> **Reason:** Category 1 (malformed finding — over-bundled; the finding packs seven naming/clarity sub-issues, one of which — sub-issue F, "arm" overload reservation — is a corpus-spanning rename that does not belong with the six local PIC-cluster tweaks). The fast loop (/spec-fix-findings-loop) resolved 6 of 7 sub-issues (Group casing, tie-break basis, numeric-run grammar, drainStateTag/tag rationale relocation, setter first/last-write-wins signalling, family↔category identity) but sub-issue F is infeasible-clean within the fast loop: "arm" is corpus-wide vocabulary bound to stable anchors (#gov-18-arm-a, #substep-1-shutting-down-arm) and normative acceptance-criteria usage in session-only-degraded-state.md, requiring a coordinated corpus-spanning anchor-retagging sweep. urgent-review returned FindingResolved: partial (FloorRegressionCount 0). A human must re-file the "arm"-reservation sub-issue as a standalone, fully-enumerated rename finding (enumerating every anchor and acceptance-criteria site) so the fresh Stage C re-review can route it; the other six sub-issues are already resolved and need not be re-filed.
> **Forensic report:** none (fast loop — no forensic report)

# T050 - Audit / drain-state / runtime-event / provider-error cluster — naming and clarity drift

**Original heading:** audit-resolution naming/clarity: family vs category ordinals; "arm" overloaded; drainStateTag vs tag; init vs mark setter prefixes; Group A capitalisation; numeric-run grammar; tie-break comparison basis
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** naming, clarity, assumptions, implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Four pages in the PIC subtree carry naming/clarity defects that survive a single read but accumulate into mis-implementations on the second:

- **audit-resolution.md.** The audit's *failure families* `(1)..(5)` and its *target surface categories* `(1)..(3)` are both labelled with bare parenthesised ordinals, and (1)/(2)/(3) refer to **the same surfaces in both numberings** (family (1) ↔ category (1) = `pi.<member>`, family (2) ↔ category (2) = peer-package named imports, family (3) ↔ category (3) = canonical-`ctx` member access). The page never states the identity, never reserves one numbering as canonical, and switches between "family (N)" and "category (N)" within adjacent paragraphs; a reader treating them as independent enumerations is consistent with the text.
- **audit-resolution.md.** The `readDrainState` snapshot's tie-break for legal multi-segment matches reports "the entry with the lexicographically-smallest `path`" without pinning the comparison basis (Unicode codepoint order vs locale-aware collation vs UTF-16 code-unit order). Two conforming implementations can disagree on the `proposed-resolution` field for entries whose `path` fields differ only above the ASCII range.
- **drain-state-contract.md.** The word "arm" denotes at least four distinct concepts on the page: (i) a member of the closed `drainStateTag` value set (`"shutting-down"` / `"degraded-needs-reload"` "arms"), (ii) a `readDrainState` dispatch branch (a/b/c), (iii) a `try`/`catch` "catch arm", and (iv) a "predicate arm" in the predicate-split clause. The terms are spatially adjacent and an implementer chasing "arm (c)" through cross-references repeatedly has to disambiguate by surrounding context rather than by name.
- **drain-state-contract.md.** The same field is named `drainStateTag` (internal write/read) and `tag` (snapshot key). The page explains the rename ("snapshot keys kept short for dispatch-site concision") but the burden is paid at every cross-reference — and the explanation references the longer name in three sibling sites (`initDrainStateTag`, `readDrainState`, the `loomRegistry.initDrainStateTag` `details.call` label) that would all have to move under any future unification.
- **drain-state-contract.md.** Two setters for the same field use mismatched prefixes: `initDrainStateTag` (idempotent write iff undefined → `"shutting-down"`) and `markRuntimeDegraded` (unconditional → `"degraded-needs-reload"`). The behavioural asymmetry is real, but the prefix choice ("init" vs "mark") encodes neither side of it consistently — an `initRuntimeDegraded` / `markDrainStateTag` swap would convey the opposite semantics with equal text. The names do not signal "first-write-wins vs last-write-wins" to a reader.
- **runtime-event-channel.md.** The always-log routing partition is introduced as "**group A**" / "**group B**" (lowercased, line 40) and then referenced as "Group A —" / "Group B —" section labels (lines 46, 55) and "group A only … group B" in the dedup-key sentence (line 57). Three capitalisations of two named partitions on one page.
- **provider-error-mapping.md.** The *numeric run* definition for overflow-token extraction reads "a maximal substring of decimal digits that may contain `,` or `_` digit-group separators (the separators are stripped before the run is parsed as a base-10 integer)". The grammar is under-specified at three edges: (a) whether a separator may lead or trail a run (`,123` / `123,`), (b) whether adjacent separators are admitted within a run (`1,,234`), and (c) whether two runs joined by a non-separator non-digit character (e.g. `1,000-2,000`) count as one or two. The rule is normative (it determines whether `tokens_used`/`tokens_limit` populate or fall back to `null`) and the "two conforming implementations produce identical values" guarantee in the same paragraph fails if any of the three edges diverges.

Each defect is small in isolation; together they constitute the naming/clarity surface every reader of this PIC cluster pays on entry.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/audit-resolution.md` — *Target surface categories* cross-reference, *Category-(1)/(3) inventory join key* tie-break (edited)
- `docs/spec_topics/pi-integration-contract/drain-state-contract.md` — *Handler control-flow ordering*, *`LoomRegistry` drain-state contract* Fields/Methods, *Read-failure fallback* (edited)
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — **Runtime event channel** partition intro, Group A / Group B section labels (edited)
- `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — *Overflow token-count extraction* (edited)
- `docs/spec_topics/pi-integration-contract/audit-failures.md` — Family ordinals consume `audit-resolution.md`'s family numbering; any renumbering sweeps here too (read-only)
- `docs/spec_topics/pi-integration-contract/audit-recognised-shapes.md` / `audit-target-categories.md` — Category numbering origin (read-only)
- `docs/spec_topics/pi-integration-contract/patch-skew-degradation.md` — *Per-step isolation* references `drainStateTag` / `tag` and uses "arm" (edited)
- `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md` — *Predicate split* references the same predicate "arms" and the `drainStateTag` field name (edited)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`docs/plan.md` carries no leaves yet — all three phase sections read "No leaves yet." Naming changes here will surface as plan-side citations once leaves are authored against these PIC pages; they do not currently block or modify any leaf.)

## Consequence

**Severity:** correctness

The numeric-run grammar (sub-issue F) and the lexicographic tie-break basis (sub-issue G) both control conformance-observable outputs: `tokens_used`/`tokens_limit` population and the `proposed-resolution` field respectively. Two conforming implementations diverge silently at the under-specified edges, despite the same paragraphs claiming determinism. The remaining sub-issues (A–E) are advisory in isolation — readers pay an extra disambiguation step at every cross-reference — but compound the implementer-error rate against the rest of the PIC cluster where these terms are load-bearing.

## Solution Space

**Shape:** single
**State:** reduced

Resolve the seven sub-issues as seven ordered edits, smallest scope-bounding first so the larger renames land on a stable baseline.

1. **Standardise Group capitalisation in `runtime-event-channel.md`.** The section labels at lines 46 and 55 already title-case ("Group A —", "Group B —"); standardise the prose at line 40 to "members in **Group A**" / "**Group B**" and the dedup-key sentence at line 57 to "apply to Group A only" / "no analogue for Group B". Three substitutions, no semantic change.

2. **Pin the lexicographic tie-break basis in `audit-resolution.md`.** Append one clause to the *Category-(2) inventory join key* tie-break sentence stating the comparison basis: "lexicographically-smallest by Unicode codepoint order (equivalently: `<` on the JavaScript string primitive, which compares UTF-16 code units; for inventory `path` fields restricted to the BMP this is identical to codepoint order)."

3. **Pin the numeric-run grammar in `provider-error-mapping.md`.** In the *Overflow token-count extraction* paragraph, replace the prose parenthetical with the regex `[0-9]+(?:[,_][0-9]+)*` (one-or-more digits, optionally followed by separator-bounded digit groups) plus an explicit boundary statement: "Two adjacent matches of the regex above are distinct numeric runs; the scan yields all non-overlapping leftmost-longest matches in source order." This closes the leading/trailing-separator, doubled-separator, and non-separator-joined edges. Add one or two worked examples, e.g. `"prompt is too long: 12,345 tokens (max 8,192)"` → two runs `12345` / `8192`; `"got 1,,234"` → two runs `1` / `234`.

4. **Move the `drainStateTag`/`tag` rationale to a footnote in `drain-state-contract.md`.** Keep the two names distinct (the spec already rationalises them on snapshot-key concision grounds), but relocate the ~150-word explanatory paragraph out of the normative Methods enumeration into a one-line footnote/aside near the first mention of `tag`, and add a glossary cross-reference. This removes the cognitive interrupt mid-enumeration without a rename sweep.

5. **Align the setter prefixes in `drain-state-contract.md`.** Keep `markRuntimeDegraded` and rename `initDrainStateTag` → `markRuntimeShuttingDown`, so the two methods symmetrically describe the runtime state they transition to. Apply the rename to the Methods bullets, the *Per-step isolation* `details.call` labels in `patch-skew-degradation.md`, the *Handler control-flow ordering* references at steps (III)/(V)/(VI), and the all-three-throw corner-case enumeration in the *idempotent* clause.

6. **Reserve "arm" for the `readDrainState` dispatch branches (a)/(b)/(c) in `drain-state-contract.md`.** Rename the other three usages: "two-arm tag set" → "two-value tag set" (individual values are "the `\"shutting-down\"` value" / "the `\"degraded-needs-reload\"` value"); "catch arm" → "catch branch"; "predicate arm" → "predicate case". Edit *Handler control-flow ordering*, *Read-failure fallback*, and the `LoomRegistry` drain-state contract Fields and Methods bullets, then sweep `patch-skew-degradation.md` (*Per-step isolation*, *unset tag fallback*) and `session-only-degraded-state.md` (*Predicate split*).

7. **State the family↔category identity in `audit-resolution.md`, keeping both numberings.** Add an identity statement to the *Target surface categories* preamble: "family (N) for N ∈ {1, 2, 3} names the violation discriminator for category (N) above; families (4) and (5) have no category analogue (out-of-shape / stale-marker)." Replace bare "family (N)" references at *Exemption mechanism* and *Stale-marker discriminator* with anchor references. Defer any renumber of families to letters unless the upstream "step-2b branch (4)/(5) route to each other's inverse family" finding adopts a compatible renumbering, in which case fold both renames into one sweep.

### Edge cases

- In step 6, the *unset tag fallback* clause in `patch-skew-degradation.md` uses "two-arm" to mean both "the closed value set sub-step 1 pins" and "the dispatch-branch enumeration". Preserve the first meaning under the new term ("two-value tag set") even as the second migrates to keep "arm".
- In step 5, the rendered system-note string `"loom /<name>: extension shutting down"` (the arm-(b) note) is operator-visible and is **not** changed by the method rename; verify no reviewer assumes the rename propagates to the note text.
- In step 3, apply the regex with leftmost-longest, non-overlapping matching so that "exactly two numeric runs" is deterministic; check the provider-message corpus against the chosen separator set (`,`/`_`) — any production message using a different thousands separator either needs the grammar widened or moves to the `null` fallback.

## Relationships

- T044 "Family-(5) malformed-marker per-clause `<symptom>` token requirement is asserted derivatively but never normatively pinned" - same-cluster (both touch family-(5) discriminator semantics; resolve independently)
- T058 "Step-2(b) family→branch correspondence inverts at the family-distinctive arms" - decision-overlap (any family-numbering change here cascades into the branch numbering in step-2b; resolve the family numbering first)
- T117 "Runtime-event channel: undefined "occurrence" vs "origin"; PIC-1 pure-read MUST has no observable projection; per-site mask-domain table split from CIO" - same-cluster (sibling `runtime-event-channel.md` clarity issue; resolve independently)
