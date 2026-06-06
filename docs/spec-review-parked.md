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

