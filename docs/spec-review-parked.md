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

## T11d-1 — Reword CIO-4 to enumerate selection predicate, branch outcomes, and split into CIO-4a/b/c/d sub-IDs (typed-only loop-entry scoping for the `max_rounds: 0` boundary)

> **PARKED** — 2026-05-24
> **Reason:** Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: none. Loop notes: Classifier exited at step 3e-bis with `_blocked.md`; sub-rationale=must-fix-blocked-by-scope-guard; blocked findings=1 (F1 — middle "Worked consequences" bullet still cites the retired bare `CIO-4` three times in the *Depth-6 forced respond at `max_rounds`* worked-consequence at hard-ceilings.md:79, score=100, must-fix=true). All three remediation paths the classifier enumerated cross class-2 project-policy pins: R1 (substitute `CIO-4` → `CIO-4a`/`CIO-4d` per-sentence on the bullet) crosses the guard "Do not touch the *Depth-6 forced respond at `max_rounds`* worked consequence at `docs/spec_topics/hard-ceilings.md:75` — read-only per T11a's constraint." and the broader "Do not edit the seven prose sites T11a owns."; R2 (keep `CIO-4` live as a non-retired parent forwarding to children) crosses the guard "The GOV-9 retirement note for the parent CIO-4 is REQUIRED (GOV-3 immutability under split + GOV-8 anchor lifecycle); a parent ID cannot be silently replaced."; R3 (forwarding alias in the *Retired REQ-IDs* table without editing the bullet) is a partial mitigation that does not resolve F1's per-sentence CIO-4a-vs-CIO-4d disambiguation. The defect is a coordination/sequencing artefact between T11d-1 (retires CIO-4) and T11a (owns the seven prose sites that still cite it); the originating finding's scope cannot be widened without contradicting the T11a-ownership pin. Forensic-only: four further must-fix highs were raised on the same pass (F2 — CIO-4d bundles a pre-loop check whose order/surface/untyped reconciliation are undefined; F3 — CIO-4d contradicts frontmatter.md's "forced respond turn consumes one slot" rule; F6 — new IDs `CIO-4a` … `CIO-4d` violate the spec's own GOV-16 REQ-ID tail-form grammar; F8 — `query.md` keeps four stale `CIO-4` citations the diff invalidated) but did not contribute to the exit because F1's early exit pre-empted full classification. severity p1 raised{high:5,medium:4,low:1,NIT:2} fixed{} deferred{} blocked{high:1}; stage1=1; narrowings=0+0+0+0; stage1Touched=0 mode-e-refusals=0. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-22T12-50-44_dcff5f/t11d-1-reword-cio-4-to-enumerate-selection-predicate-branch-outcomes-and-split-i.md`

# T11d-1 — Reword CIO-4 to enumerate selection predicate, branch outcomes, and split into CIO-4a/b/c/d sub-IDs (typed-only loop-entry scoping for the `max_rounds: 0` boundary)

**Kind:** completeness, implementability
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

T11a's pending prose rewrite (the forced-respond-exemption rule across seven sites) coins the term *CIO-4's `max_rounds`-final branch* but CIO-4 at `docs/spec_topics/hard-ceilings.md:46` does not enumerate its branches or pin the selection predicate. Two predicates are equally consistent with the new prose — (a) `slot_count == max_rounds` after CIO-4's increment, or (b) "the next round would exceed `max_rounds`" — and they fire one round apart, producing different observable transcripts and different billed tokens for the same `max_rounds: 25` typed query. A grep for "`max_rounds`-final branch" against the pre-Option-A spec corpus returns zero hits, confirming the new prose coined the term. The CIO-4 parenthetical also conflates two distinct ceiling-evaluation contexts (free-phase continuation vs typed-query terminal dispatch) under one identifier, which T11a's rewrite makes structurally untenable. The prior bundled attempt at T11d authored CIO-4's new enumeration with an implicit-zero loop-entry predicate that fired the `max_rounds`-final branch on every untyped query with `max_rounds: 0`, returning `tool_loop_exhausted` before any provider call — directly contradicting V6k at `docs/plan_topics/v6-typed-queries.md:102` which states "the counter starts at 0 (an untyped query that emits text on its very first turn consumes zero slots)".

## Solution approach

Split CIO-4 at `docs/spec_topics/hard-ceilings.md:46` into four sub-IDs (CIO-4a / CIO-4b / CIO-4c / CIO-4d) — admissible under the project config's *MAY introduce a sub-ID split of an existing REQ-ID where the originating finding's Solution approach explicitly authorises it* rule, with GOV-3 immutability of the original CIO-4 anchor preserved via GOV-9 retirement of the parent if the split fully replaces it. The four sub-IDs partition CIO-4's behavior:

- **CIO-4a — Selection predicate.** "After the round's tool calls have completed and the slot count has been incremented, CIO-4 compares the post-increment slot count against `max_rounds`: a slot count `< max_rounds` selects free-phase continuation (CIO-4b); a slot count equal to `max_rounds` selects the `max_rounds`-final branch (CIO-4c on untyped queries / CIO-4d on typed queries)."
- **CIO-4b — Free-phase continuation outcome.** "On free-phase continuation, the next model turn is requested and the tool-call loop continues normally."
- **CIO-4c — `max_rounds`-final branch on untyped queries.** "On the `max_rounds`-final branch with an untyped query, the ceiling fires and the runtime surfaces `Err(QueryError { kind: \"tool_loop_exhausted\", ... })`."
- **CIO-4d — `max_rounds`-final branch on typed queries (including the `max_rounds: 0` boundary case via a typed-dispatch-only pre-loop check).** "On the `max_rounds`-final branch with a typed query, the runtime dispatches the forced respond turn as the typed-query terminating mechanism — exempt from the slot-accounting check (the forced respond turn does not itself consume a slot) and following CIO-4a's gating evaluation rather than being bundled under it. The `max_rounds: 0` typed-query boundary case (where no free-phase round runs and no post-increment slot count is computed) is the `max_rounds`-final branch entered via a typed-dispatch-only pre-loop check evaluating the initial slot count of 0 against `max_rounds: 0`; untyped queries with `max_rounds: 0` are NOT subject to this pre-loop check and follow CIO-4a's post-increment semantics from their first round (preserving V6k's counter rule: the counter starts at 0 and an untyped query that emits text on its very first turn consumes zero slots)."

Each sub-ID gets a stable HTML anchor (`<a id="cio-4a"></a> **CIO-4a.**`, `<a id="cio-4b"></a> **CIO-4b.**`, `<a id="cio-4c"></a> **CIO-4c.**`, `<a id="cio-4d"></a> **CIO-4d.**`) per GOV-1 *Required HTML-anchor contexts*. The existing CIO-4 anchor is retired per GOV-9 with a one-line *Retired CIO-4 → CIO-4a/b/c/d* note pointing readers to the sub-IDs; the retirement is logged in the REQ-ID prefix table on `governance.md` per GOV-3 / GOV-8.

## Solution constraints

- Do not touch the *Depth-6 forced respond at `max_rounds`* worked consequence at `docs/spec_topics/hard-ceilings.md:75` — read-only per T11a's constraint.
- Do not touch any other CIO-N rule in the same enumeration (CIO-1, CIO-2, CIO-3, CIO-5, …) — this finding is scoped to CIO-4 only.
- The CIO-4d typed-dispatch-only pre-loop check MUST be authored as a pre-loop check explicitly scoped to typed queries; do NOT add an unscoped loop-entry slot-count predicate that fires for both untyped and typed queries (that wording broke V6k in the prior bundled attempt). The scoping is load-bearing — preserving V6k's counter rule for untyped queries with `max_rounds: 0` is the entire point of CIO-4c being a separate sub-ID from CIO-4d.
- Do not author the step-(2) `max_rounds: 0` dispatch trigger elision at `docs/spec_topics/query.md:199` — that is T11d-2's territory.
- Do not author the forced-respond non-compliance failure-routing rule — that is T11d-3's territory.
- Do not edit the seven prose sites T11a owns.
- The GOV-9 retirement note for the parent CIO-4 is REQUIRED (GOV-3 immutability under split + GOV-8 anchor lifecycle); a parent ID cannot be silently replaced.
- Surface length: CIO-4a/b/c/d sub-IDs together are at most six sentences of new normative prose plus the four anchor lines plus the one-line CIO-4 retirement note; the CIO-4d sub-ID may carry one extra sentence for the typed-dispatch-only pre-loop check rationale.
- Plan leaves V6k and V6l in `docs/plan_topics/v6-typed-queries.md` are owned by T11b and T11c — out of scope here.

## Relationships

- T11d-2 "Extend step (2) of the typed-query numbered list with the `max_rounds: 0` elision sentence and stable TQ-0 boundary anchor (role-neutral composition)" — must-precede (T11d-2's elision sentence references CIO-4d's typed-dispatch-only pre-loop check by name).
- T11a "Replace `consumes one slot` prose with explicit forced-respond exemption rule" — must-precede (T11a's rewritten prose references CIO-4a and CIO-4d by name).


---

## T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule

> **PARKED** — 2026-05-24
> **Reason:** Cascaded from parking of T11d-1 — Reword CIO-4 to enumerate selection predicate, branch outcomes, and split into CIO-4a/b/c/d sub-IDs (typed-only loop-entry scoping for the `max_rounds: 0` boundary): this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-22T12-50-44_dcff5f/t11d-1-reword-cio-4-to-enumerate-selection-predicate-branch-outcomes-and-split-i.md`

# T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule

**Kind:** testability, consistency
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Tool-call loop bound* section in `docs/spec_topics/query.md` (anchor `tool-call-loop-bound`) and the `tool_loop` field paragraph in `docs/spec_topics/frontmatter.md` each assert that the forced respond turn for a typed query consumes one `tool_loop` slot. That framing contradicts the *Depth-6 forced respond at `max_rounds`* worked consequence in `docs/spec_topics/hard-ceilings.md:75`, which treats the forced respond turn as "precisely the typed-query terminating mechanism CIO-4's `max_rounds`-final branch routes to" (slot-accounting is evaluated only against free-phase rounds). At `max_rounds: 0` the contradiction is directly observable: under the "consumes one slot" reading the only available turn is already over budget; under the worked consequence it MUST still be dispatched. Two further sites carry the same pre-exemption framing: the *Tool-call loop bound* paragraph's adjacency clause `(a plain text turn for untyped queries, a respond-tool call for typed queries)` on the `tool_loop_exhausted` cap-trigger sentence is contradicted by the new MUST in the same paragraph after the rewrite (left intact, it produces an adjacency contradiction inside one normative paragraph); and the V1-reference-implementation `tool_loop.max_rounds` directive at `docs/spec_topics/implementation-notes.md:23` still tells the reference implementation to count tool-call rounds in the free phase **plus the one forced respond turn**, which a V1 reference faithful to this bullet would use to return `tool_loop_exhausted` on every `max_rounds: 0` typed query — the precise boundary the new MUST requires to succeed. The sibling findings T11b and T11c cannot land their V6k changes against the spec until this prose is reconciled across all seven sites. The three latent defined-term surfaces the rewrite's new prose introduces are out of scope here and owned by T11d-1 (CIO-4 branch predicate / CIO-4a-d sub-IDs), T11d-2 (`max_rounds: 0` step-(2) dispatch trigger and TQ-0 boundary anchor), and T11d-3 (forced-respond non-compliance routing FRC-1/FRC-2).

## Solution approach

Rewrite the relevant sentences in the *Tool-call loop bound* and *Typed queries are tool-loop-shaped* sections of `docs/spec_topics/query.md`, in the `tool_loop` field paragraph of `docs/spec_topics/frontmatter.md`, in the *tool-call round slot accounting* entry of `docs/spec_topics/glossary.md`, in the *Issuing typed queries* bullet of `docs/spec_topics/pi-integration-contract.md` (the sentence beginning "The forced respond turn counts against the same `tool_loop.max_rounds` cap" — this sentence sits in the *Conversation drive* section and is distinct from PIC-1 (d), which remains read-only per the constraint below), AND in the V1-reference-implementation `tool_loop.max_rounds` directive at `docs/spec_topics/implementation-notes.md:23` (rewrite the bullet's enforcement clause to count *free-phase tool-call rounds only* and to state explicitly that the forced respond turn is the exempt-routed terminator that follows the cap check), to replace the "consumes one slot" framing with an explicit forced-respond-exemption rule: the forced respond turn is the typed-query terminating mechanism CIO-4d routes to; the runtime MUST dispatch it on every typed query that reaches that branch (including the TQ-0 `max_rounds: 0` boundary case, where it is the only turn issued); and CIO-4a's slot-accounting check is not evaluated against the forced respond turn itself. Additionally, in the *Tool-call loop bound* paragraph of `docs/spec_topics/query.md`, strike the `(a plain text turn for untyped queries, a respond-tool call for typed queries)` parenthetical from the `tool_loop_exhausted` cap-trigger sentence so the rewritten paragraph does not adjacent-contradict itself: with the exemption rule in force, the runtime always supplies the typed-query terminating respond-tool call (forced respond), so the parenthetical's typed-query branch is unreachable and must not be restated as if it were a cap-reachable terminating turn. Do not edit CIO-4 at `docs/spec_topics/hard-ceilings.md:46`; that rewording (CIO-4a/b/c/d sub-ID split) is owned by T11d-1 and must land before this finding. Do not edit step (2) of the typed-query numbered list at `docs/spec_topics/query.md:199`; the `max_rounds: 0` elision and TQ-0 boundary anchor are owned by T11d-2 and must land before this finding. The *Depth-6 forced respond at `max_rounds`* worked consequence at `docs/spec_topics/hard-ceilings.md:75` is already aligned with the new rule and is left unedited.

## Solution constraints

- Treat the *Depth-6 forced respond at `max_rounds`* worked consequence in `docs/spec_topics/hard-ceilings.md:75` as read-only — it already names the forced respond turn as the typed-query terminating mechanism the new rule asserts.
- Treat PIC-1 (d) in `docs/spec_topics/pi-integration-contract.md` as read-only — already aligned with the new rule.
- Treat the CIO-4 parenthetical at `docs/spec_topics/hard-ceilings.md:46` as read-only here — T11d-1 owns the CIO-4a/b/c/d sub-ID split (which subsumes the parenthetical edit) and must-precedes this finding. If T11d-1 has not landed at dispatch time, defer this finding.
- Do not extend step (2) of the typed-query numbered list at `docs/spec_topics/query.md:199` to specify a `max_rounds: 0` dispatch trigger or boundary anchor — that elision is owned by T11d-2 and must land before this finding. If T11d-2 has not landed at dispatch time, defer this finding.
- Do not author a forced-respond non-compliance failure-routing rule (provider non-compliance with `options.toolChoice` on the forced turn) — that surface is owned by T11d-3 and must land before this finding. If T11d-3 has not landed at dispatch time, defer this finding.
- Do not extend CIO-4 with a written enumeration of its branches or a `slot_count`-vs-`max_rounds` selection predicate — that surface is owned by T11d-1 and is out of scope here.
- Plan leaves V6k and V6l in `docs/plan_topics/v6-typed-queries.md` are owned by T11b and T11c — out of scope here.

## Relationships

- T11d-1 "Reword CIO-4 to enumerate selection predicate, branch outcomes, and split into CIO-4a/b/c/d sub-IDs (typed-only loop-entry scoping for the `max_rounds: 0` boundary)" — must-follow.
- T11d-2 "Extend step (2) of the typed-query numbered list with the `max_rounds: 0` elision sentence and stable TQ-0 boundary anchor (role-neutral composition)" — must-follow.
- T11d-3 "Author the forced-respond non-compliance failure mode in `query.md` with per-shape sub-items (FRC-1 plain-text, FRC-2 non-respond `tool_use`) and PIC forward-link" — must-follow.
- T11b "V6k counting-formula tighten: forced respond outside the budget" — must-precede (the prose rule must land before V6k's formula can be rewritten against it).
- T11c "V6k normative test vector for `max_rounds: 0` typed query" — must-precede (the prose rule must land before V6k's test can assert against it).


---

## T11d-3 — Author the forced-respond non-compliance failure mode in `query.md` with per-shape sub-items (FRC-1 plain-text, FRC-2 non-respond `tool_use`) and PIC forward-link

> **PARKED** — 2026-05-24
> **Reason:** Cascaded from parking of T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-22T12-50-44_dcff5f/t11d-1-reword-cio-4-to-enumerate-selection-predicate-branch-outcomes-and-split-i.md`

# T11d-3 — Author the forced-respond non-compliance failure mode in `query.md` with per-shape sub-items (FRC-1 plain-text, FRC-2 non-respond `tool_use`) and PIC forward-link

**Kind:** completeness, implementability, assumptions
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

Pre-Option-A, any provider-side non-compliance with `options.toolChoice` on the forced turn (model emits free-phase text or a non-respond `tool_use` despite forcing) deterministically reached `tool_loop_exhausted` on the next round boundary via slot accounting. Post-Option-A (T11a's exemption rule landed) the slot count is already `= max_rounds` and the spec gives no rule for the non-compliance case. The existing "stop reasons other than `end_turn` / `stop` / `tool_use`" sentence in `docs/spec_topics/query.md` covers `length` / content-filter but does NOT cover a non-respond `tool_use` block on the forced turn (a `tool_use` block whose name is not `__loom_respond_<slug>`). The carve-out at *Provider compatibility for typed queries* in `docs/spec_topics/pi-integration-contract.md` explicitly contemplates non-compliance and so removes any implicit assumption that the model always complies. Two observably distinct non-compliance shapes exist — plain-text emission and wrong-named-tool emission — and they require distinct provider-response-block routing, but a single bullet under one anchor cannot be hyperlinked per-shape from V6 plan tests or downstream PIC narrowings.

## Solution approach

Author a new `### Forced-respond non-compliance` sub-section inside `docs/spec_topics/query.md`'s *Failure modes* section (HTML anchor `<a id="forced-respond-non-compliance"></a>`). The sub-section contains a one-sentence introduction (defining *forced-respond non-compliance* as the model violating `options.toolChoice` on the forced respond turn) followed by two stable-anchored sub-items:

- **FRC-1 plain-text non-compliance** (`<a id="frc-1"></a> **FRC-1.**`): The model emits a free-phase text turn on the forced respond turn (stop reason `end_turn` / `stop` with no `tool_use` block). The runtime returns `Err(QueryError { kind: "validation", cause: "schema_validation", provider_response: <verbatim block>, ... })` via a synthesised `ValidationIssue` describing the missing forced respond, consistent with `pi-integration-contract.md`'s existing *V1 diagnostic limitation* paragraph (which already establishes `validation` / `schema_validation` routing for the plain-text sub-case).
- **FRC-2 wrong-named-tool non-compliance** (`<a id="frc-2"></a> **FRC-2.**`): The model emits a `tool_use` block whose name is not `__loom_respond_<slug>` (the model invoked a different tool or used a non-respond identifier despite forcing). The runtime returns the same `Err(QueryError { kind: "validation", cause: "schema_validation", provider_response: <verbatim block>, ... })` shape via a synthesised `ValidationIssue` describing the wrong tool name. Distinct from `tool_loop_exhausted` (which T11a's exemption rule renders unreachable on the forced turn).

Both sub-items reuse the existing `QueryError.kind: "validation"` and `cause: "schema_validation"` taxonomy — no new `QueryError.kind` variant is introduced, no parallel edits to `errors-and-results.md` are required. Forward-link from `docs/spec_topics/pi-integration-contract.md`'s existing *V1 diagnostic limitation* paragraph with one sentence pointing to `query.md#forced-respond-non-compliance` (covering both FRC-1 and FRC-2 as the spec-defined routing for the parallel non-compliance shapes).

## Solution constraints

- Do not author or extend the CIO-4 enumeration at `docs/spec_topics/hard-ceilings.md:46` — that is T11d-1's territory.
- Do not author the step-(2) `max_rounds: 0` elision at `docs/spec_topics/query.md:199` — that is T11d-2's territory.
- Do not edit the seven prose sites T11a owns (the *Tool-call loop bound* and *Typed queries are tool-loop-shaped* sections of `query.md`, the `tool_loop` paragraph of `frontmatter.md`, the *tool-call round slot accounting* entry of `glossary.md`, the *Issuing typed queries* bullet of `pi-integration-contract.md`, and the V1-reference-implementation directive at `implementation-notes.md:23`).
- Do not introduce a new `QueryError.kind` variant — reuse `kind: "validation"` / `cause: "schema_validation"` to avoid surface expansion into `errors-and-results.md`, the slash-invocation rendering table, and `QueryError.kind` exhaustiveness assertions.
- Do not touch PIC-1 (d) in `docs/spec_topics/pi-integration-contract.md` — read-only per T11a's constraint. The PIC forward-link goes in the existing *V1 diagnostic limitation* paragraph, which is in scope here for the one-sentence forward-link only.
- Do not introduce a new MUST about which providers MUST support `options.toolChoice` — *Provider compatibility for typed queries* already governs that, and this finding's non-compliance routing is a failure-surface contract, not a provider-capability requirement.
- Do not invent a new ID prefix for the FRC labels without authoring the GOV-16 prefix-table-add row in `governance.md`; the FRC prefix follows the existing inline-label-prefix pattern. Surface the GOV-16 prefix-add in this finding's Notes for human review at authoring time.
- Surface length: the *Forced-respond non-compliance* sub-section is at most one introductory sentence plus two bullets (FRC-1 and FRC-2, one to two sentences each) plus the PIC forward-link sentence; the anchor lines do not count against the surface budget.
- Plan leaves V6k and V6l in `docs/plan_topics/v6-typed-queries.md` are owned by T11b and T11c — out of scope here.

## Relationships

- T11a "Replace `consumes one slot` prose with explicit forced-respond exemption rule" — must-precede (T11a's Solution constraints explicitly defer the forced-respond non-compliance failure-routing rule to this finding).


---

## T11d-2 — Extend step (2) of the typed-query numbered list with the `max_rounds: 0` elision sentence and stable TQ-0 boundary anchor (role-neutral composition)

> **PARKED** — 2026-05-24
> **Reason:** Cascaded from parking of T11d-1 — Reword CIO-4 to enumerate selection predicate, branch outcomes, and split into CIO-4a/b/c/d sub-IDs (typed-only loop-entry scoping for the `max_rounds: 0` boundary): this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-22T12-50-44_dcff5f/t11d-1-reword-cio-4-to-enumerate-selection-predicate-branch-outcomes-and-split-i.md`

# T11d-2 — Extend step (2) of the typed-query numbered list with the `max_rounds: 0` elision sentence and stable TQ-0 boundary anchor (role-neutral composition)

**Kind:** completeness, implementability
**Importance:** high
**Score:** 100
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

Step (2) of the typed-query numbered list at `docs/spec_topics/query.md:199` states the forced respond turn is dispatched "Once the model emits a plain text turn (provider stop reason `end_turn` / `stop`)" — a model-emitted plain-text turn is the *only* stated trigger. T11a's pending prose rewrite asserts dispatch is unconditional at `max_rounds: 0`, but the `max_rounds: 0` configuration structurally precludes any model turn ever firing (no free phase = no plain-text turn = no trigger). Three observably distinct implementations remain consistent with the diff (skip phase 1 entirely and post the forced-respond user turn first; issue one empty-tool free-phase turn then dispatch; synthesise without calling the provider), producing different transcripts and different provider-side traces for the same configuration. The boundary case also has no stable anchor distinct from step (2)'s normal-path text, so downstream references (V6k normative test vector, PIC adapter contracts, implementation notes) cannot hyperlink it without anchor pollution. The prior bundled attempt at T11d authored the elision with a wire-shape pin ("two consecutive user turns ... with no intervening model turn") that contradicts the `anthropic-messages` strict `user`/`assistant` alternation contract — `anthropic-messages` is in the V1 supported provider set per `docs/spec_topics/pi-integration-contract.md` *Provider compatibility for typed queries*.

## Solution approach

Extend step (2) of the typed-query numbered list at `docs/spec_topics/query.md:199` with one trailing sentence naming the `max_rounds: 0` configuration as the boundary case of the same dispatch mechanism. The composition is authored role-neutrally: the inlined-schema follow-up is composed with the rendered query body into the typed query's opening provider call, *without* pinning the wire-shape of that composition (whether it appears as one merged user turn, two segmented user turns concatenated by an adapter-level merge, or any other adapter-level encoding) — wire-shape is an adapter-level concern owned by *Provider compatibility for typed queries*, not the step-(2) dispatch contract. Author a stable inline label and HTML anchor for the boundary case as `<a id="typed-query-max-rounds-zero"></a> **TQ-0.**` (new inline-label prefix `TQ` requires a GOV-16 prefix-table-add row in `governance.md` — surface this in Notes for human review at authoring time; alternatively reuse an existing prefix if a natural fit exists at the *Issuing typed queries* section). The added sentence reads approximately: "At `max_rounds: 0` (TQ-0; the free phase is structurally empty and no plain-text turn can ever fire) the runtime dispatches the forced respond turn as the first and only turn of the typed query — the inlined-schema follow-up is composed with the rendered query body into the typed query's opening provider call (composition is an adapter-level encoding concern) — naming this elision as the boundary case of the same dispatch mechanism step (2)'s body describes."

## Solution constraints

- Do not author or extend the CIO-4 enumeration at `docs/spec_topics/hard-ceilings.md:46` — that is T11d-1's territory; this finding references CIO-4d (typed-dispatch-only pre-loop check) by name only.
- Do not author the forced-respond non-compliance failure-routing rule — that is T11d-3's territory.
- Do not edit the seven prose sites T11a owns (the *Tool-call loop bound* and *Typed queries are tool-loop-shaped* sections of `query.md`, the `tool_loop` paragraph of `frontmatter.md`, the *tool-call round slot accounting* entry of `glossary.md`, the *Issuing typed queries* bullet of `pi-integration-contract.md`, and the V1-reference-implementation directive at `implementation-notes.md:23`).
- Do not pin a wire-shape for the composition (consecutive user turns, message-array shape, role-tagged structure, segmented vs merged turns) — composition is adapter-level encoding; wire-shape decisions belong in *Provider compatibility for typed queries* (`docs/spec_topics/pi-integration-contract.md`), not in step (2)'s dispatch contract. The role-neutral framing is load-bearing — the prior bundled attempt's wire-shape pin contradicted the `anthropic-messages` strict role-alternation rule.
- Do not introduce a new MUST about which providers MUST support `options.toolChoice` — *Provider compatibility for typed queries* already governs that.
- If introducing the new inline-label prefix `TQ`, surface the GOV-16 prefix-table-add in this finding's Notes for human review before authoring the anchor; do NOT silently allocate the prefix.
- Surface length: step-(2)'s added boundary-case sentence is at most two sentences; the anchor allocation is one line plus the **TQ-0.** label.
- Plan leaves V6k and V6l in `docs/plan_topics/v6-typed-queries.md` are owned by T11b and T11c — out of scope here.

## Relationships

- T11d-1 "Reword CIO-4 to enumerate selection predicate, branch outcomes, and split into CIO-4a/b/c/d sub-IDs (typed-only loop-entry scoping for the `max_rounds: 0` boundary)" — must-follow (T11d-1's CIO-4d sub-ID is referenced by name in this finding's elision sentence).
- T11a "Replace `consumes one slot` prose with explicit forced-respond exemption rule" — must-precede (T11a's rewritten prose references the **TQ-0** boundary case by name).

---

