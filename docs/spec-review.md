# Triaged Spec Review — spec

_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T28) is addressed first; the first finding is addressed last._

_Triage tally: 5 findings — 5 high._

---

# T19c — Retarget the five `../spec.md#session-model` cross-references in future-considerations.md to specific `sm-N-...` anchors

**Kind:** traceability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/future-considerations.md` carries five `../spec.md#session-model` cross-references (at lines 108, 112, 113, 114, and 116 — in the V1 non-goals `Recorded at:` lines for no-concurrent-user-sessions, no-parallel-invoke, no-parallel-fan-out, and no-admission-cap, plus one inline citation inside the no-parallel-fan-out body). Each citation pins a different sub-obligation of the Session model paragraph, but all five currently resolve to the same umbrella anchor. After T19a installs the per-obligation `sm-N-...` sub-anchors on `docs/spec.md`, these citations remain link-resolved-but-meaning-ambiguous until they are retargeted: a future edit narrowing one SM-obligation will silently appear to narrow the others.

## Solution approach

Retarget each of the five `../spec.md#session-model` cross-references in `docs/spec_topics/future-considerations.md` to the specific `sm-N-...` sub-anchor whose sub-obligation the surrounding `Recorded at:` line (or in-body citation) actually pins, using T19a's authored SM-N inventory as the ground truth for anchor names.

## Solution constraints

- Out of scope: authoring or modifying any `sm-N-...` anchor on `docs/spec.md` (owned by T19a) and retargeting the three sibling cross-references in `pi-integration-contract.md` (owned by T19b).

## Relationships

- T19a "Replace session-model paragraph with eight SM-N sub-units" — must-follow (the `sm-N-...` anchor targets must exist before retargeting)
- T19b "Retarget the three `../spec.md#session-model` cross-references in pi-integration-contract.md" — co-resolve (commutative sibling retarget; bundle into the same fix pass after T19a lands)
- T22 "Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose" — same-cluster (if SM-7 collapses to a forward-link after T22, the SM-7 retargets in this edit collapse to `concurrency-model`)
# T19b — Retarget the three `../spec.md#session-model` cross-references in pi-integration-contract.md to specific `sm-N-...` anchors

**Kind:** traceability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/pi-integration-contract.md` carries three `../spec.md#session-model` cross-references — one in the `<a id="pi-slash-handler-promise-lifecycle-presupposition"></a>` *Pi-side slash-handler promise lifecycle* bullet, and two in the Pi-version-bump procedure (step 1's *Re-typecheck against the new package* item and step 5's *Update the capability-probe pinned constants* item). Each callsite pins a distinct sub-obligation of the Session model paragraph (cancellation-chain liveness; closed reason set; `SessionShutdownEvent` payload shape), but all three currently resolve to the same `#session-model` anchor. After T19a establishes `sm-N-...` sub-anchors on `docs/spec.md`, leaving the citations on the umbrella anchor leaves traceability ambiguous and lets a future edit narrowing one SM obligation silently appear to narrow the others.

## Solution approach

Retarget each of the three `../spec.md#session-model` cross-references in `docs/spec_topics/pi-integration-contract.md` (the Pi-side slash-handler promise lifecycle bullet and Pi-version-bump procedure steps 1 and 5) to the specific `sm-N-...` sub-anchor that names the sub-obligation that callsite is actually about, using T19a's SM-N inventory as the ground truth.

## Solution constraints

- Out of scope: authoring or naming the `sm-N-...` anchors themselves (owned by T19a) and retargeting the five `../spec.md#session-model` cross-references in `docs/spec_topics/future-considerations.md` (owned by T19c).

## Relationships

- T19a "Replace session-model paragraph with eight SM-N sub-units" — must-follow (the `sm-N-...` anchor targets must exist before retargeting)
- T19c "Retarget the five `../spec.md#session-model` cross-references in future-considerations.md" — co-resolve (commutative sibling retarget; bundle into the same fix pass after T19a lands)
- T22 "Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose" — same-cluster
# T19a — Replace session-model paragraph with eight SM-N sub-units, each anchored `<a id="sm-N-...">`

**Kind:** traceability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The `<a id="session-model"></a>` *Session model.* paragraph in `docs/spec.md` (Orientation › Prerequisites, third loose paragraph) carries one anchor over at least eight independently testable normative obligations: single-active-session binding to a Pi extension instance, the closed `session_shutdown` reason set, the per-reason fixed teardown sequence, the post-teardown degraded state for the session-only reasons `{"new","resume","fork"}`, the broader tag-transition predicate scope for the `LoomRegistry` drain transition and the degraded-state slash note, the narrower diagnostic-emission predicate scope for `loom/host/session-shutdown-runtime-degraded`, the mode-qualified concurrency / isolation model, and the per-invocation budget non-sharing rule. Eight live cross-references currently land on this anchor — three in `docs/spec_topics/pi-integration-contract.md` and five in `docs/spec_topics/future-considerations.md` — each pinning a different sub-obligation but all resolving to the same paragraph. As a result no inbound link can disambiguate which obligation it cites, and a future edit narrowing one obligation will silently appear to narrow the others.

## Solution approach

Decompose the `<a id="session-model"></a>` paragraph in `docs/spec.md` into eight stably-anchored sub-units `sm-1-...` through `sm-8-...`, one per obligation enumerated in Problem (binding; closed reason set; teardown sequence; degraded state for the session-only reasons; tag-transition predicate; diagnostic-emission predicate; mode-qualified isolation; per-invocation budget non-sharing). Keep the `<a id="session-model"></a>` anchor on the wrapping surface so existing inbound `#session-model` links continue to resolve. The SM-N inventory authored here is the ground truth that T19b and T19c retarget downstream callsites against.

## Solution constraints

- Out of scope: retargeting the eight downstream `#session-model` callsites — the three in `docs/spec_topics/pi-integration-contract.md` are owned by T19b and the five in `docs/spec_topics/future-considerations.md` are owned by T19c.

## Relationships

- T19b "Retarget the three `../spec.md#session-model` cross-references in pi-integration-contract.md" — must-precede (T19b's anchors-targets are established here)
- T19c "Retarget the five `../spec.md#session-model` cross-references in future-considerations.md" — must-precede (T19c's anchor-targets are established here)
- T22 "Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose" — must-follow (deduplication should land before this edit; if the concurrency content moves wholesale to `concurrency-model`, SM-7 collapses to a forward-link)

---

# T27 — `governance.md` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / "specified in the plan corpus")

**Kind:** cross-corpus-boundary, scope, structural
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/governance.md` defers normative content to "the plan corpus" pervasively and embeds explicit cross-links into plan files. The phrase "(specified in the plan corpus)" appears ~15 times across GOV-1, GOV-2, GOV-4, GOV-6, GOV-9, GOV-12, and GOV-16 as the deferral pattern for CI-gate failure surfaces (exit codes, per-offence message formats, accumulation semantics, output streams). Three further patterns are sharper:

- **Explicit plan-file cross-links.** GOV-7 *Rename* instructs editors to "update every reference to the old filename across `plan.md` and `plan_topics/**.md`; the plan-link CI gate (specified in the plan corpus) enforces this". GOV-10 defines a *plan leaf* as "a terminal task in [`plan.md`](../plan.md) (leaf format defined in [`plan_topics/conventions.md`](../plan_topics/conventions.md#leaf-format))" with three explicit links into the plan corpus.
- **Rules *about* plan-leaf shape.** GOV-10 declares that implementers MAY restrict their reading per a plan leaf's `**Spec**` field. GOV-11 declares that "The plan leaf's `**Spec**` field MUST be closed under normative cross-link." Both rules are authored in the spec corpus but describe required properties of the plan corpus. GOV-2 ("The plan's coverage matrix is keyed per REQ-ID, mapping each ID to its closing leaf") similarly asserts a structural property of the plan from inside the spec.
- **Anchor-pass milestone references.** Four sites reference "the initial REQ-ID anchor pass (specified in the plan corpus)" as the trigger for activating REQ-ID anchor-form MUSTs: GOV-1 *anchor placement*, GOV-1 *Dual-form layout* transitional rule, GOV-9 cross-link form, and GOV-16 *GOV-1 dual-form layout applies* bullet. The deferral pattern matches the other ~15 but the structural commitment is heavier — the references describe a future commit with no spec-internal identity test, so stripping "(specified in the plan corpus)" without further rework leaves a dangling milestone reference rather than a clean rule.

Each pattern violates the corpus-direction rule under different angles. The explicit links straightforwardly break under a plan deletion-and-rebuild. The "specified in the plan corpus" deferrals presume a plan exists and has a particular shape; they are softer but still violate the spec-independence invariant. The anchor-pass milestone references combine both problems: they delegate to the plan AND assume a single identifiable commit exists. GOV-10 / GOV-11 / GOV-2 are the deepest case: rules that exist primarily to constrain the plan, authored as spec rules.

T28 settles the structural questions by authoring GOV-17 (corpus direction, with a dependee/dependency predicate) and GOV-18 (binding scope, with the arm (a) implementation target + arm (b) spec self-binding framing). Under those rules, every spec→plan deferral / link is forbidden by GOV-17 (the plan corpus is a dependee of the spec); GOV-2 / GOV-10 / GOV-11 bind neither arm of GOV-18 and retire; the anchor-pass milestone references have no surviving home (the plan is forbidden as the referent, and no spec-internal milestone can be authored without re-introducing a methodology shape) — they are deleted outright per T28 item 6, with the GOV-1 anchor-form MUSTs binding per-page on every PR that touches REQ-ID anchors instead of via a corpus-wide flip-day.

## Solution approach

The fix is not a mechanical sweep — `governance.md` is structurally entangled with the plan corpus in ways the other findings (T25, T26) are not. Seven edit clusters land in the same fix pass:

1. **Per-deferral classification of the ~15 "specified in the plan corpus" occurrences.** For each occurrence, classify per the T24a three-way scheme:
   - **Spec-owned floor obligation that can drop the deferral entirely.** Delete the trailing "specified in the plan corpus" clause; the spec-side invariant remains.
   - **Spec-owned obligation that benefits from naming the responsible party.** Rewrite to name the consumer in implementation-neutral terms.
   - **Pure plan-process narration.** Delete outright.

2. **GOV-10 / GOV-11 deletion.** Per T28's GOV-18 (arm (a) + arm (b) only), both rules are out-of-arms: GOV-10 binds an implementer's reading process, GOV-11 binds a plan-side data-structure field. Delete both from `governance.md` and append rows to the *Retired REQ-IDs* sub-table citing GOV-18 by anchor (`[GOV-18](#gov-18)`). Per T28's item 3, each row's reason is per-rule specific.

3. **GOV-2 coverage-matrix deletion.** GOV-2 binds a downstream tracker to build a coverage matrix and exit non-zero on violations; both bind a third party (CI tooling / tracker), neither arm. Delete the entire rule and add a retirement row citing GOV-18.

4. **`Audience` paragraph rewrite.** The opening *Audience* paragraph names "the coverage-matrix closing CI gate (specified in the plan corpus)" twice as a primary audience. Rewrite to name the consumer in spec-corpus-neutral terms ("automated tooling that maps REQ-IDs to implementation work") so the audience claim does not depend on the plan corpus existing.

5. **Anchor-pass milestone references — explicit permission to delete.** Delete every reference to "the initial REQ-ID anchor pass" / "the one-shot backfill commit" / "the backfill commit". Concretely:
   - **GOV-1 anchor placement.** Delete the sentence *"A one-shot backfill commit inserts `PREFIX-N` anchors into each non-narrative page in the table."* (previously "The initial REQ-ID anchor pass (specified in the plan corpus) inserts…"). The remaining rule prose stands on its own.
   - **GOV-1 *Dual-form layout*.** Delete the entire *Transitional rule (retires once the backfill commit lands)* paragraph. The MUST in *Required HTML-anchor contexts* then binds per-page on every PR that touches REQ-ID anchors on a non-narrative page (per T28 item 6); pre-existing non-conformant anchor sites (currently GOV-14 / GOV-15 on this page) become standing spec defects, fixed in normal-course maintenance.
   - **GOV-9.** Delete the clause *"From the commit that lands the one-shot backfill forward, and independently of whether any such cross-link currently exists,"* — the surrounding MUST stays, now binding unconditionally on every REQ-ID anchor. Delete the trailing sub-clause *"and is gated by the same anchor-insertion CI gate under the same transitional rule (per GOV-1 *Dual-form layout*)."*
   - **GOV-16 *GOV-1 dual-form layout applies*.** Delete the trailing sentence *"The transitional rule of GOV-1 *Dual-form layout* applies to existing inline-label anchors on the same terms — the one-shot backfill commit owns rewriting the dual-form HTML anchor at every existing inline-label anchor site."* The opening sentence of the bullet (the parallel-to-GOV-1 framing) stands on its own.
   - **GOV-8 *Per-ID retirements* bullet.** Delete the parenthetical "(skeleton inserted by the initial REQ-ID anchor pass specified in the plan corpus)". The retirement-section invariant remains; the question of when each page first acquired the section is methodology.
   - **GOV-16 *Retirement section* bullet.** Delete the parallel parenthetical for inline-label retirements for the same reason.

6. **GOV-5 reshape and GOV-16 *Tightened unknown-prefix detector* clause removal — explicit permission.** Per T28 item 5:
   - **GOV-5.** Replace the current consumer-side MUST ("Tooling that consumes REQ-IDs MUST anchor matches at a word boundary…") with the spec-side invariant: *"Each row's `Prefix` value is a complete identifier token, not a search prefix. REQ-ID prefixes are word-boundary-distinct: every REQ-ID anchor and back-reference in the spec corpus matches the token regex `\b<PREFIX>-[0-9]+\b`, and two prefixes that share a common substring (e.g. `BNDS` / `BNDR`) are distinct tokens — neither is a sub-prefix of the other and the corpus contains no substring-match relationships between them."* The consumer-side MUST is deleted.
   - **GOV-16 *Tightened unknown-prefix detector*.** Delete the entire clause (the widened regex, the two-arm membership check, the "jointly exhaustive over four combinations" framing, the "Any unknown-prefix-detector implementer MUST evaluate the tail-form check on both arms" sentence, and the supersession clause). Optionally retain a single summary sentence publishing the inline-label grammar: *"Inline labels match `\b[A-Z][A-Z0-9]{1,5}-(?:[1-9][0-9]*|[a-z])\b` AND have a registered prefix in the per-page inline-label table whose pinned tail form matches the tail."* Beyond that summary, all detection methodology lives outside the spec.

7. **Failure-surface deletions.** The remaining "specified in the plan corpus" deferrals — almost all pointing at CI-gate failure-surface definitions (exit code, per-offence message format, accumulation semantics, output stream) — describe how CI tooling reports failures, not what the system being specified must do. Under GOV-18 they are out-of-arms. Delete outright; no plan-side cross-link is authored to compensate (per T28 item 7 and GOV-17). If the plan corpus wants to host the equivalent schema, the plan corpus owns its definition without spec-side mediation.

After these edits, `docs/spec_topics/governance.md` MUST carry zero occurrences of the phrases "specified in the plan corpus", "plan corpus", "plan leaf", "plan-side", "the backfill commit", "the one-shot backfill commit", "the initial REQ-ID anchor pass", and zero links to `../plan.md` or `../plan_topics/**`.

## Solution constraints

- **Out of scope — the plan corpus itself.** `plan.md` and `plan_topics/conventions.md` are not edited by T27. A plan-corpus author may independently take ownership of any methodology this finding evicts; that is downstream work.
- **Cross-corpus REQ-ID stability is a spec-corpus obligation and survives unchanged.** GOV-1 / GOV-3 / GOV-4 / GOV-6 / GOV-7 / GOV-8 / GOV-9 / GOV-12 / GOV-14 / GOV-15 retain their normative force; the deferral / cross-link sub-clauses inside each rule are edited, and GOV-1 / GOV-9 lose their transitional-rule trappings per item 5. GOV-5 and GOV-16 are reshaped per item 6 — their spec-side invariant content survives, their consumer-prescriptive MUSTs do not.
- **The disposition of GOV-2 / GOV-10 / GOV-11 is determined by T28's GOV-18**, not by per-rule judgement. The resolution commit MUST cite GOV-18 (by anchor `#gov-18` in `governance.md`) as the basis for each deletion, with a per-rule reason per T28 item 3.
- **T27 MUST NOT land before T28's GOV-17 and GOV-18 articulation.** T27 cites both rules as the basis for its deletions and reshapes. In the cluster's single fix pass, T28's items 1–4 land first; T27's items 1–7 follow in the same file; T28's items 5 and 7 may co-land.
- **Pre-existing non-conformant anchor sites become standing spec defects.** Currently GOV-14 / GOV-15 on `governance.md` carry bare `<a id="prefix-n">` anchors on a different source line from their inline `**PREFIX-N.**` marker. Under item 5 these are not gated by any transitional rule; they are spec defects to fix in normal-course maintenance the next time their page is edited. T27 does NOT fix them in this pass (the dual-form rewrite for GOV-14 / GOV-15 is a separate edit that does not depend on T27's scope).
- **No verifier replacement.** Spec rules whose pre-diff wording cited a verification venue ("the coverage-matrix gate enforces this", "the anchor-insertion CI gate") lose that citation under GOV-18 without a replacement. The bare invariant survives as arm (b) content per T28; the audit of arm (b) invariants is third-party tooling's responsibility and is out of scope here.

## Relationships

- T28 "Articulate the 'no methodology prescription' rule and audit `spec_topics/` against it" — co-resolve (T27 and T28 both rewrite `governance.md` substantially and cannot be cleanly separated; bundle into a single fix pass on `governance.md`. Within the pass, T28's GOV-17 + GOV-18 articulation (items 1–4) lands first because T27 cites both rules as basis. T27's items 1–7 then land in the same file while preserving the corpus-direction section T28 owns. T28's items 5 and 7 may co-land.)
- T03 "`H1` is a plan-corpus identifier leaking into `spec.md` prose" — same-cluster (parallel corpus-direction defect; T03 sweeps `spec.md`, T27 sweeps `governance.md`; no resolution dependency)
- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — same-cluster (T24a carved out `governance.md`'s "specified in the plan corpus" deferrals as a "permitted abstraction barrier"; this finding revisits that carve-out under GOV-17 / GOV-18 and concludes the carve-out cannot be sustained)
- T25 "Bare plan-leaf-ID tokens scatter across `spec_topics/`" — same-cluster (parallel corpus-direction defect; T25's resolution is mechanical, this one requires per-rule judgement)
- T26 "Narrative spec→plan deferrals and `v18-cancellation.md` cross-link" — same-cluster (parallel surface-level case of the same defect class T27 addresses at the structural level)

---

# T28 — Articulate the "no methodology prescription" rule and audit `spec_topics/` against it

**Kind:** structural, cross-corpus-boundary
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The corpus-direction rule established by T24a / T25 / T26 ("spec must stand independent of any particular plan") leaves two structural questions unresolved:

1. **Which cross-link targets count as "outside the corpus"?** The pre-T28 rule has no checkable predicate for which targets are forbidden; reviewers can reach opposite conclusions in good faith for targets like `../README.md`, `../CHANGELOG.md`, sibling repo directories, third-party docs, or external URLs.
2. **When may the spec publish content *about* a downstream consumer, and when does that publication slide into prescribing how the consumer must work?** T27 surfaced this in concrete form: GOV-2 ("the plan's coverage matrix is keyed per REQ-ID"), GOV-10 (defines a "plan leaf" + reading-scope optimisation), and GOV-11 (closure rule on a `**Spec**` field) all read as spec rules but only have meaning if a plan exists and follows a particular methodology.

T28 settles both by authoring two rules in `governance.md`'s corpus-direction section. **GOV-17** turns "outside the corpus" into a checkable predicate using directional cross-reference relationships (the spec MAY reference its dependencies, MUST NOT reference its dependees — equivalent to "no circular dependencies"). **GOV-18** settles the publish-vs-prescribe question by listing the two parties the spec corpus may bind normatively (the implementation target, and the spec corpus itself) and forbidding everything else.

Under these rules: GOV-1 (REQ-ID stability) is arm (b) spec-self-binding content; GOV-5 (disjoint-prefix invariant) is arm (b) content **provided** its consumer-side MUST is rewritten as a spec-side invariant; GOV-16's inline-label grammar is arm (b) content **provided** its *Tightened unknown-prefix detector* methodology clause is removed; GOV-2 / GOV-10 / GOV-11 are arm-(a)-and-(b)-both-fail (they bind the plan corpus and various downstream tracker shapes — none of those is the implementation target or the spec itself); GOV-6 / GOV-12 lose their "the coverage-matrix gate enforces this" verifier-citation sentences (those were methodology) but their bare invariants survive as arm (b) content, with no replacement verifier required (auditing is third-party tooling's responsibility).

The defects: (i) GOV-17 and GOV-18 are missing from the corpus; (ii) `spec_topics/*.md` has not been audited against GOV-18; (iii) two surviving same-page rules (GOV-5 main MUST, GOV-16 *Tightened unknown-prefix detector*) contradict GOV-18 and need reshaping in the same fix pass that introduces GOV-18; (iv) the GOV-1 / GOV-9 / GOV-16 anchor-pass milestone references have no spec-internal home under GOV-17 / GOV-18 and need deleting (per T27 item 5).

## Solution approach

1. **Author GOV-17 (corpus direction) as a directional-cross-reference rule with a checkable predicate.** The rule states: the spec corpus (`docs/spec.md` and `docs/spec_topics/*.md`) MAY cross-reference its dependencies (documents and resources that do not themselves cross-reference into the spec corpus) and MUST NOT cross-reference its dependees (documents and resources that do). Currently-known dependees, all forbidden as cross-reference targets: the plan corpus (`docs/plan.md` and `docs/plan_topics/*.md`), the repo-level `README.md`, and `CHANGELOG.md`. External resources (third-party documentation, package documentation under `node_modules/`, websites) are permitted dependencies provided they contain no spec cross-reference. The check is mechanical: `grep -l 'docs/spec\(\.md\|_topics/\)' <target>` on the proposed cross-reference target; any hit forbids the link.

2. **Author GOV-18 (binding scope) as the two-arm rule.** The spec corpus's normative obligations may bind exactly two parties:
   - **Arm (a) — the implementation target.** The loom runtime, the binder, the type system, the Pi integration, and any other software whose behaviour the spec exists to constrain. Normative MUSTs whose subject is one of these are spec content.
   - **Arm (b) — the spec corpus itself.** Invariants about the form, structure, and content of `docs/spec.md` and `docs/spec_topics/*.md`, including REQ-ID grammars, anchor placement, prefix-table closure, retirement procedures, and cross-link form. Normative MUSTs whose subject is the spec corpus are self-binding and are spec content.

   The spec corpus MUST NOT bind any third party — including but not limited to documentation tooling, CI gates, coverage matrices, REQ-ID extractors, doc generators, plan-side scanners, the project README, the CHANGELOG, or any other document or program outside arms (a) and (b). Where third-party tooling needs to consume a published spec invariant, the spec publishes the invariant as a property of its own content (arm (b)); the third party's MUST is the third party's own and lives in its own corpus.

3. **GOV-18 worked examples — one per retiring rule.** The worked-example paragraph names each retiring GOV-N explicitly with the specific arm-(a)-and-(b)-both-fail shape that justifies its retirement:
   - **GOV-1** (REQ-ID anchor placement) — arm (b) — pinned as worked example of spec content the rule permits.
   - **GOV-5** (disjoint-prefix invariant) — arm (b) — pinned as worked example of spec content the rule permits, after the reshape in item 5 below.
   - **Retired GOV-2** — bound a downstream tracker to build a coverage matrix and exit non-zero on violations (CI-gate workflow shape; neither arm (a) nor arm (b)).
   - **Retired GOV-10** — bound an implementer's reading scope to a plan-leaf field (reading-process shape; neither arm (a) nor arm (b)).
   - **Retired GOV-11** — bound the plan corpus's `**Spec**` field to a closure obligation (plan-side data-structure shape; neither arm (a) nor arm (b)).

   Each retiring rule's row in the *Retired REQ-IDs* sub-table cites GOV-18 by anchor and carries a one-sentence per-rule reason that maps the rule onto its specific failure mode (different for each rule — not a joint generic claim).

4. **Host GOV-17 and GOV-18 in the slimmed-down post-T27 `governance.md`.** Both rules land in a new `## Corpus direction` section. T27's rewrite leaves a structural home for this section (a deliberate gap before the REQ-ID prefix table); T28's edits fill the gap.

5. **Reshape GOV-5 and GOV-16 to land cleanly under GOV-18.** Both rules currently carry consumer-side MUSTs that GOV-18 forbids:
   - **GOV-5.** Replace the current first sentence + first MUST with a spec-side invariant: *"Each row's `Prefix` value is a complete identifier token, not a search prefix. REQ-ID prefixes are word-boundary-distinct: every REQ-ID anchor and back-reference in the spec corpus matches the token regex `\b<PREFIX>-[0-9]+\b`, and two prefixes that share a common substring (e.g. `BNDS` / `BNDR`) are distinct tokens — neither is a sub-prefix of the other and the corpus contains no substring-match relationships between them."* The consumer-side MUST ("Tooling that consumes REQ-IDs MUST anchor matches…") is deleted; consumers implementing extraction read the invariant and infer the anchoring requirement themselves.
   - **GOV-16's *Tightened unknown-prefix detector* clause.** Delete the entire clause (the two-arm membership check, the "jointly exhaustive over four combinations" framing, the "Any unknown-prefix-detector implementer MUST evaluate the tail-form check on both arms" sentence, and the supersession clause). The spec already publishes the inline-label grammar via the per-page table and the *Canonical form* bullet; consumers wanting to detect unknown prefixes implement against the published grammar. Optionally, retain a single arm-(b) summary sentence stating the grammar: *"Inline labels match `\b[A-Z][A-Z0-9]{1,5}-(?:[1-9][0-9]*|[a-z])\b` AND have a registered prefix in the per-page inline-label table whose pinned tail form matches the tail."* Beyond that summary, all detection methodology lives outside the spec.

6. **Per-page progressive normalisation for GOV-1 / GOV-9 / GOV-16 anchor-form MUSTs.** The pre-diff spec deferred anchor-form MUST activation to "the initial REQ-ID anchor pass (specified in the plan corpus)". Under GOV-17 / GOV-18 the deferral is forbidden, and the post-rename "the one-shot backfill commit" milestone is undefined inside the spec. The cleanest resolution is to drop the corpus-wide flip-day entirely: every PR that adds, edits, or moves a REQ-ID anchor site on a non-narrative spec page MUST leave every REQ-ID anchor site on that page in dual-form, whether the site is newly added or pre-existing. Pre-existing non-conformant anchor sites on pages not touched by a given PR are pre-existing spec defects — they violate the MUST, but the violation is not actionable until a future PR touches the same page. The defect set drains progressively as pages are edited; no single corpus-wide normalisation commit is required, and no spec-side milestone is reserved for one. (T27 owns the concrete deletions per its item 5; T28 sets the policy.)

7. **Audit `spec_topics/*.md` against GOV-18.** A full sweep classifying every normative rule per:
   - **Arm (a) — implementation target** — leave unchanged.
   - **Arm (b) — spec self-binding invariant** — leave unchanged. A rule whose surface wording sounds consumer-prescriptive but whose actual subject is the spec's own content (e.g. table-completeness invariants, integer-literal preservation requirements, retirement-row append obligations) is arm (b) and passes.
   - **Neither arm** — delete from spec; the third party may take ownership independently. The spec corpus MUST NOT cross-link to any plan-corpus or other-third-party home for the evicted content (that would re-introduce the GOV-17 defect).

   If the sweep turns up no out-of-arms rules outside `governance.md`, T28's resolution collapses to steps 1–6 plus a one-line "no other surfaces found" note recorded in the resolution commit.

After the work, `docs/spec_topics/*.md` MUST carry zero normative rules whose subject is anything other than arm (a) or arm (b). The spec MAY name a consumer ("automated tooling that maps REQ-IDs to implementation work") to anchor an obligation's purpose; it MUST NOT specify the consumer's internals.

## Solution constraints

- **Sequencing with T27.** T28's principle-articulation portion (Solution approach items 1–4) MUST land before T27's `governance.md` rewrite, because T27 cites GOV-18 as the basis for the GOV-2 / GOV-10 / GOV-11 retirements and the policy in item 6 as the basis for the milestone-reference deletions. Items 5 and 7 MAY run in parallel with T27 since they touch disjoint surfaces (item 5: GOV-5 / GOV-16 specifically; item 7: other `spec_topics/` files).
- **Articulation host file.** GOV-17 and GOV-18 MUST be authored in the slimmed-down post-T27 version of `governance.md`; T27's rewrite leaves a structural home for the corpus-direction section.
- **Out of scope — the plan corpus itself.** Moving methodology out of `spec_topics/` is in scope; further restructuring or authoring within `plan_topics/` is not. A plan-corpus author may independently take ownership of any methodology this finding evicts; that is downstream work.
- **The implied-consumer edge case is permitted.** Rules like GOV-1 (REQ-ID stability) presuppose a consumer that tracks requirements, but they constrain the spec's identifiers (arm (b)), not the tracker. The audit MUST NOT flag rules merely because they imply a consumer exists.
- **Audit completeness.** If step 7's sweep turns up out-of-arms rules in other `spec_topics/` files whose cleanup scope exceeds a single rewrite within T28, those are spawned as downstream `Shape: single` findings, one per affected file, tracked separately from T28's closure.
- **No verifier-replacement obligation.** Spec rules whose pre-diff wording cited a verification venue ("the coverage-matrix gate enforces this", "the anchor-insertion CI gate") lose that citation under GOV-18 without a replacement. The bare invariant survives as arm (b) content; auditing it is third-party tooling's responsibility, lives in the third party's corpus, and is explicitly out of scope here.

## Relationships

- T27 "`governance.md` pervasive plan-corpus dependency" — co-resolve (both rewrite `governance.md` substantially and cannot be cleanly separated; bundle into a single fix pass. Within the pass, T28's GOV-17 + GOV-18 articulation (items 1–4) lands first because T27 cites both rules as basis. T27's per-rule cleanup then lands in the same file while preserving the corpus-direction section. T28's item 5 (GOV-5 / GOV-16 reshape) co-edits the same file. T28's item 7 (cross-spec audit) is disjoint and MAY run separately.)
- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — extends (T28's GOV-17 and GOV-18 sharpen the corpus-direction rule T24a established; T24a's four-way classification scheme is reused by T28 item 7 unchanged.)
