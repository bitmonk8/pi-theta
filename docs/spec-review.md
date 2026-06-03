# Triaged Spec Review - spec

_Generated: 2026-06-03T12:45:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T29) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 blocker, 8 high, 18 medium retained; 6 low discarded; 11 low findings merged into 7 medium findings (plus two medium+medium and one high+high consolidation merges); 4 nit dropped; 0 false dropped._

---

# T01 - Invocation page carries the `INV` prefix but coins zero `INV-N` anchors

**Kind:** traceability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/invocation.md` is registered under the `INV` prefix in `governance.md`'s REQ-ID prefix table but coins zero `INV-N` anchors, so every inbound cross-link targets a section-heading slug rather than a `#inv-n` fragment. This violates GOV-9's `#prefix-n` cross-link contract for the page's consumers, and no invocation obligation can be cited by a stable REQ-ID. Until the obligation sites are coined, any heading rename on the page silently breaks inbound cross-references with no normative trigger; GOV-9 and GOV-22 classify the absence as a standing defect that drains only as the sites are edited.

## Solution approach

Add `INV-N` anchors in GOV-1 dual-form layout at the invocation.md obligation sites whose section slugs already attract inbound cross-links — `#static-resolution`, `#argument-binding`, `#typed-return`, and `#final-value-propagation` — extending to the page's other independently-normative obligation sites (realpath / discovery-root containment re-check, cross-mode snapshot-restore LIFO discipline, parse-time cycle detection, invoke-depth bound). Number per GOV-3 from the next free integer under `INV`. Rewrite each inbound `invocation.md#<slug>` cross-link onto the matching `#inv-n` fragment in the same commit per GOV-1 *Edge cases*.

## Solution constraints

- Out of scope: coining `INV-N` at the three seam blockquote sites (`#v1-seam-symlink-resolution-hardening`, named-argument invocation, per-call timeout) — deferred to T16, T17, T18.

## Relationships

- T18 "Symlink-resolution seam MUST is unfalsifiable — restate as a behavioural invariant" — must-follow (if that MUST is demoted, no `INV-N` is coined at the seam blockquote; resolve the seam findings first).
- T16 "Named-argument seam MUST has no loom 1.0 observable" — must-follow (demotion removes the need to coin an `INV-N` at that seam site).
- T17 "Per-call timeout seam MUST is unobservable from any loom 1.0 surface" — must-follow (the cross-version invariant becomes a candidate for `INV-N` only after it lands; coin contingently).
- T02 "`cancellation.md` carries no `CNCL-N` REQ-ID anchors" — same-cluster (identical defect, different page/prefix; resolve under the same coinage discipline).
- T03 "errors-and-results.md ERR-N coinage" — same-cluster (parallel REQ-ID-absence defect).
- T04 "hard-ceilings.md CEIL-N coinage" — same-cluster (parallel REQ-ID-absence defect).
# T02 - `cancellation.md` carries no `CNCL-N` REQ-ID anchors

**Kind:** traceability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`cancellation.md` is registered as a non-narrative page under the `CNCL` prefix in the REQ-ID prefix table on `governance.md`, yet the file contains zero `**CNCL-N.**` markers and zero `<a id="cncl-n"></a>` HTML anchors. The page nevertheless carries more than a dozen independently-pass/fail normative obligations — among them Signal source, Abort-reason propagation, Forwarding-listener throw, the per-invocation `finally` listener cleanup, the `session_shutdown`-driven trigger, Propagation, the Granularity enumeration, the Race-semantics rules, and the five-row Surfacing table. With no REQ-ID anchor at any of these sites, every inbound cross-reference into the page can target only the page itself or a heading slug, so GOV-9's `#prefix-n` cross-link contract is unsatisfiable for every rule-specific consumer, and GOV-22 leaves the defect standing until a triggering commit lands.

## Solution approach

Coin `CNCL-N` REQ-IDs at each independently-verifiable obligation site on `cancellation.md`, in dual-form layout per GOV-1, using the next free integer under the already-registered `CNCL` prefix. In the same commit, repoint each inbound cross-reference whose link text cites a specific rule block to the corresponding `#cncl-n` fragment.

## Solution constraints

- Out of scope: REQ-ID coinage on any page other than `cancellation.md` — `INV-N` coinage is owned by T01, `ERR-N` by T03, and `CEIL-N` by T04; edits to those pages are limited to repointing their inbound citations of `cancellation.md`.

## Relationships

- T01 "Invocation page carries the `INV` prefix but coins zero `INV-N` anchors" — same-cluster (identical defect, independent execution).
- T03 "errors-and-results.md ERR-N coinage" — same-cluster (one of the cross-references this finding repoints originates from that page).
- T04 "hard-ceilings.md CEIL-N coinage" — same-cluster (identical defect, different prefix).
- T26 "Loop-iteration checkpoint does not yield the event loop" — decision-overlap (the Granularity-enumeration MUST that T26 amends is one of the obligations coined here; the new sentence T26 introduces should land under whatever `CNCL-N` anchor this finding coins for the Granularity rule).
# T03 - errors-and-results.md ERR-N coinage for mid-stream cancellation and panic-message-string MUSTs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`errors-and-results.md` owns the `ERR` prefix and mints `ERR-1` … `ERR-7` on the pre-evaluation failure list, but two obligation clusters carry independently-verifiable normative MUSTs under non-REQ-ID anchors. The mid-stream cancellation bundle at `id="mid-stream-cancellation-conversation-state"` packs five distinct normative paragraphs — non-mutation of committed surfaces, no compensating injection, cancellation/`?`-propagation symmetry, respond-repair scope window, and subagent-mode internal binding — under one section anchor, while inbound cross-references from `cancellation.md` and `slash-invocation.md` cite specific obligations rather than the whole bundle. The **Panic message string (normative)** paragraph carries two independently-satisfiable obligations (emit-registered-string and no-per-surface-reformat) reachable only through `#runtime-panics`. Both clusters violate GOV-9's `#prefix-n` cross-link contract and trip GOV-22's progressive-coinage trigger on the next normative-modal edit.

## Solution approach

Coin `ERR-N` REQ-IDs dual-form per GOV-1 at each defining obligation site, extending the live `ERR` series past `ERR-7`. Add one `ERR-N` per obligation paragraph in the mid-stream cancellation bundle under the existing `id="mid-stream-cancellation-conversation-state"` site, and two `ERR-N` for the panic bundle (emit-registered-string, no-per-surface-reformat); rewrite the no-per-surface-reformat clause so the anchor sits on an RFC-2119-bearing line. Retain the `id="mid-stream-cancellation-conversation-state"` and `id="runtime-panics"` umbrella anchors. Repoint the rule-specific inbound cross-references in `cancellation.md`, `slash-invocation.md`, and the `diagnostics.md` per-panic-source registry rows to the matching `#err-n` fragments.

## Solution constraints

- The pre-evaluation failure-list "seven list items … carries a separate `ERR-N`" clause scopes only those seven items; the "seven" literal must not change.

## Relationships

- T01 "Invocation page carries the `INV` prefix but coins zero `INV-N` anchors" — same-cluster (identical pattern, different prefix).
- T02 "`cancellation.md` carries no `CNCL-N` REQ-ID anchors" — same-cluster (one repointed cross-reference originates from that page).
- T04 "hard-ceilings.md CEIL-N coinage" — same-cluster (identical pattern, different prefix).
# T04 - hard-ceilings.md CEIL-N coinage for the ceiling-#4 per-boundary table and ceiling-set invariants

**Kind:** traceability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`hard-ceilings.md` owns the `CEIL` REQ-ID prefix (registered in `governance.md`) but defines zero `CEIL-N` anchors, leaving two defining obligation sites un-coined. The ceiling-#4 per-boundary destination/surface table at `id="ceiling-4-table"` is the page's most heavily cross-referenced normative artefact (cited by roughly twelve `#ceiling-4-table` fragments across seven pages), and the `id="ceiling-set-invariants"` section carries two independently-verifiable MUSTs — the audience-coverage invariant and the ceiling-#1 panic-uniqueness invariant — that cannot be cited apart. Both sites violate GOV-9 (a cross-page dependency on a normative rule MUST resolve as `#prefix-n`) and leave the page in standing violation of GOV-22's progressive-coinage MUST.

## Solution approach

Coin `CEIL-N` REQ-IDs in dual-form per GOV-1 at three sites: the per-boundary table definition (at `id="ceiling-4-table"`), the audience-coverage invariant's defining MUST, and the ceiling-#1 panic-uniqueness invariant's defining MUST. Explicitly decide whether the reconciliation paragraph at `id="ceiling-4-table-reconciliation"` folds into the table's REQ-ID or takes its own `CEIL-N`, rather than leaving it as a bare section anchor. In the same commit, repoint the inbound `#ceiling-4-table` and `#ceiling-set-invariants` cites to the new fragments, splitting a cite across both invariant IDs where the citing prose names both invariants.

## Solution constraints

- Allocate the new IDs under the page's `CEIL` prefix (currently zero live IDs) per GOV-3 next-free-integer; do not allocate them under the co-resident `CIO` prefix and do not introduce a new prefix.

## Relationships

- T01 "Invocation page carries the `INV` prefix but coins zero `INV-N` anchors" — same-cluster (parallel GOV-9 / GOV-22 gap).
- T02 "`cancellation.md` carries no `CNCL-N` REQ-ID anchors" — same-cluster (parallel gap).
- T03 "errors-and-results.md ERR-N coinage" — same-cluster (parallel shared-anchor / un-coined-MUST gaps).
# T05 - `V1` → `loom 1.0` heading rename across `spec.md` and `future-considerations.md`

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The `V1` version token survives in section headings on two spec pages while the bodies and inbound cross-links use the canonical `loom 1.0` spelling. `docs/spec.md`'s `### V1 non-goals` heading is stale relative to its body and cross-links, although its dual anchors `<a id="loom-1-0-non-goals-aggregator">` / `<a id="v1-non-goals">` are already in place. All four `##`-level headings on `docs/spec_topics/future-considerations.md` still spell `V1` (`## Tooling deferrals (no V1 impact)`, `## Surface extensions (V1 leaves a seam)`, `## Model-level changes (no V1 seam expected)`, `## V1 non-goals`), and `spec.md` cross-references three of them with canonical `loom 1.0` link text, so readers following such a link land on contradicting heading text. Three of the four future-considerations headings carry no authored `<a id>` and rely on the GitHub-rendered auto-id, so a naked rename re-derives those auto-ids and silently breaks inbound fragments.

## Solution approach

Rename all five headings to their canonical `loom 1.0` form (e.g. `### V1 non-goals` → `### loom 1.0 non-goals`). For the three future-considerations headings that currently rely on a GitHub auto-id, add authored anchors above the renamed heading carrying both the new canonical slug and the legacy alias slug, verifying each alias slug byte-for-byte against the actual inbound fragments (`grep -rnE '#(tooling-deferrals|surface-extensions|model-level-changes|v1-non-goals)' docs/`). Keep `spec.md`'s existing `<a id="loom-1-0-non-goals-aggregator">` / `<a id="v1-non-goals">` pair and `future-considerations.md`'s existing `## V1 non-goals` anchor pair unchanged. Repoint the canonical `v1`-segment cross-references — including the GOV-12 single-source-page citation into `future-considerations.md` — to the new `loom-1-0` canonical arm, leaving the `v1-*` alias arms in place per GOV-21 *Alias permanence*.

## Solution constraints

- Per GOV-21 *Incidental auto-id prohibition*, do not cite the renamed headings' GitHub-rendered auto-ids and do not add them as a third `<a id>`.

## Relationships

- T06 "`future-considerations.md` body hosts non-deferral content" — co-resolve (that finding's bucket-heading rewrite touches `## Tooling deferrals`; land the `V1` → `loom 1.0` sweep in the same heading edit to avoid rewriting the heading twice).
# T06 - `future-considerations.md` body hosts non-deferral content

**Kind:** scope
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`future-considerations.md` defines a four-category taxonomy for deferred *features*, but its body hosts two items that are not deferred features. The `### Surface extensions gated on an open design decision` sub-section (anchor `surface-extensions-open-design`) hosts a single *Automatic context escalation* bullet whose *Decision required* line parks an unresolved design question — no owner, no resolution criterion — in the spec body, even though nothing in loom 1.0 depends on it: the runtime invariant is pinned defensively at `binder.md`'s `v1-seam-automatic-context-escalation` blockquote and the `spec.md` Forward-compatibility seams tally already excludes the item. Separately, the *Automated cadence for re-importing Pi patches* bullet under `## Tooling deferrals (no V1 impact)` describes absent contributor-workflow automation — a project-maintenance discipline, not a deferred tool or command — yet category 1 is defined as "Items that ship as new tools or commands."

## Solution approach

Delete the `### Surface extensions gated on an open design decision` sub-heading, its `surface-extensions-open-design` anchor, its introductory paragraph, and the *Automatic context escalation* bullet from `future-considerations.md`, and rewrite the dangling forward-link in `binder.md`'s `v1-seam-automatic-context-escalation` blockquote so it no longer points at the deleted anchor. For the cadence bullet, broaden the category-1 *Tooling deferrals* definition and its `## Tooling deferrals (no V1 impact)` heading to admit contributor-workflow automation, keeping the bullet in place.

## Solution constraints

- Preserve the `tooling-deferrals-no-v1-impact` HTML anchor (alongside any new anchor) when renaming the heading — `pi-integration-contract.md`'s `patch-skew-degradation-contract` paragraph cross-links it.
- Do not delete `binder.md`'s `v1-seam-automatic-context-escalation` blockquote — it pins an active loom 1.0 runtime invariant; only its dangling forward-link is in scope.

## Relationships

- T05 "`V1` → `loom 1.0` heading rename across `spec.md` and `future-considerations.md`" — co-resolve (the broadened bucket heading is also a `V1` → `loom 1.0` target; land both in the same heading edit).
# T07 - Governance retirement tables carry unreplaced commit-SHA placeholders

**Kind:** cruft
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Two bookkeeping sub-tables on `docs/spec_topics/governance.md` carry literal `<…>` placeholders in `Retired in` cells whose own governing prose forbids them. In the `## Retired REQ-IDs` sub-table, the GOV-2, GOV-10, and GOV-11 rows each carry the literal `` `<retirement commit>` `` (the GOV-13 row, by contrast, holds a concrete SHA). In the `### Retired prefixes` sub-table, the `PIE` / `pi-integration.md` row carries the literal `` `<demotion commit>` ``. Each column's prose lists exactly two permitted forms (7-character SHA or release tag) and states the placeholder MUST already have been replaced at the retiring commit, so both rows self-contradict their own value-space contract.

## Solution approach

Rewrite the `Retired in` cells of the GOV-2, GOV-10, and GOV-11 rows in the `## Retired REQ-IDs` sub-table, replacing the literal `` `<retirement commit>` `` with the 7-character SHA of the retiring commit (`64cdc60`). Rewrite the `PIE` row's `Retired in` cell in the `### Retired prefixes` sub-table, replacing `` `<demotion commit>` `` with the demoting commit's SHA (`877d57b`). Verify both SHAs are the canonical `main` landing commits before committing.

## Solution constraints

- Out of scope: the explanatory prose paragraphs immediately below each sub-table that use `<retirement commit>` / `<demotion commit>` as placeholder exemplars — leave them unchanged.

## Relationships

None
# T08 - Glossary entries re-enumerate closed sets owned elsewhere and have drifted

**Kind:** cross-spec-consistency-broad
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The glossary's **`.warp` file (library module)** entry and **GOV-N (governance rule)** entry both hard-code closed sets owned by canonical pages and have drifted from them. The `.warp` entry restricts the top level to three forms (`schema`, `enum`, `fn`), but the canonical owner `imports.md` (`#permitted-top-level-forms`) enumerates five — adding `import` and `export` — and the entry contradicts its own later clause describing the file as importable and re-exportable. The `GOV-N` entry describes the rule set as "`GOV-1` through `GOV-8`", but `governance.md`'s live set is GOV-1, GOV-3..GOV-9, GOV-12, GOV-14..GOV-23 (with GOV-2/10/11/13 retired) — stale in both directions. Both entries already route the canonical lookup via a `See:` link, so the inline enumeration is a redundant second site that is structurally guaranteed to re-stale.

## Solution approach

Rewrite the `.warp` entry's top-level-forms clause to defer to `imports.md` `#permitted-top-level-forms` rather than naming the forms inline. Rewrite the `GOV-N` entry's "(`GOV-1` through `GOV-8`)" parenthetical to describe membership by deferral to `governance.md` without enumerating individual IDs. Both entries retain their existing `See:` links.

## Solution constraints

- Out of scope: `governance.md` (T07 territory), `imports.md`, and `spec.md` — confine edits to `glossary.md`.

## Relationships

- T09 "Load-bearing coined terms lack glossary entries — `PIC` and `free phase` / `forced respond turn`" — same-cluster (same glossary page; additions rather than corrections; resolve independently).
- T07 "Governance retirement tables carry unreplaced commit-SHA placeholders" — same-cluster (both touch GOV-prefix bookkeeping; resolve independently — that one edits `governance.md`, this one edits `glossary.md`).
# T09 - Load-bearing coined terms lack glossary entries — `PIC` and `free phase` / `forced respond turn`

**Kind:** clarity, naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

Two load-bearing coinages used across the corpus have no glossary entry, in violation of the glossary's convention of explicit single-point definitions for coined vocabulary. `PIC` (the abbreviation for "Pi Integration Contract") is used throughout `spec.md` and many topic pages without ever being expanded at first use and without a `glossary.md` entry. The two-phase tool-loop vocabulary `free phase` / `free-phase` and its partner `forced respond turn` are used normatively on conformance surfaces but are likewise undefined; the existing **tool-call round slot accounting** entry leans on "free-phase tool-call round" without defining it, and `pi-integration-contract.md`'s PIC-1 V1-reachable predicate is unparseable without holding both meanings. The pair is the unit of meaning — the entire point is the asymmetric exemption whereby `max_rounds` counts free-phase rounds but not the forced respond turn.

## Solution approach

Add a glossary entry for `PIC` (alphabetised under `p`) that expands the abbreviation and forward-links to `pi-integration-contract.md`. Add an inline expansion of `PIC` at its first use in `spec.md`'s **Pi SDK and capabilities** paragraph. Add a paired glossary entry under `f` defining `free phase` (and its hyphenated adjectival form) together with `forced respond turn`, forward-linking to query.md's "Typed queries are tool-loop-shaped" section, hard-ceilings.md's `#ceiling-interaction-order` (CIO-4), and `pi-integration-contract.md`.

## Solution constraints

- Out of scope: the slot-accounting bookkeeping owned by the existing **tool-call round slot accounting** glossary entry — the new pair entry cross-references it rather than restating it.

## Relationships

- T08 "Glossary entries re-enumerate closed sets owned elsewhere and have drifted" — same-cluster (same glossary page; corrections rather than additions; resolve independently).
# T10 - `SchemaValidator` and `Clock` normative interfaces are mis-housed on `implementation-notes.md`

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`implementation-notes.md` carries two normative DI-seam interface contracts as inline Runtime bullets. The `**Schema validation.**` bullet holds the full normative `SchemaValidator` interface — the behavioural MUSTs, the per-runtime DI-seam constraint, and the TypeScript interface block flagged "interface shape is normative", anchored `#schemavalidator-interface` and cited from `errors-and-results.md`. The `**Clock.**` bullet restates the `Clock` contract (the `now()`/`setTimeout`/`clearTimeout` surface, the `WallClock`/`FakeClock` split, the per-runtime DI rule, the `Date.now`/`performance.now`/global-timer ban, and the build-time grep-test) even though `pi-integration-contract.md` already owns the canonical `Clock`/`FakeClock` interface at `#clock--fakeclock-interface`. Both are peers of PIC's housed DI-seam interfaces (`FileSystem`, `FileWatcher`, `Clock`) — PIC's Checkpoint-seam paragraph already names `SchemaValidator` in that peer set — so housing the normative interface on a page framed "Implementation Notes" invites a non-normative reading, and the duplicated `Clock` contract risks silent drift between the two copies.

## Solution approach

Move the `**Schema validation.**` bullet's normative `SchemaValidator` interface body from `implementation-notes.md` into `pi-integration-contract.md`'s DI-seam interface cluster (alongside `#clock--fakeclock-interface`, `#fakefilesystem--filesystem-interface`, and `#filewatcher-interface`), carrying the `#schemavalidator-interface` anchor so the inbound link from `errors-and-results.md` keeps resolving. Rewrite the `**Clock.**` bullet on `implementation-notes.md` down to a forward-link to `#clock--fakeclock-interface`, deleting the duplicated contract restatement. Rewrite `spec.md`'s Implementation Notes orientation entry so the schema-validation-contract attribution points at PIC. Leave the `**Implementation hint (non-normative).**` AJV bullet on `implementation-notes.md`.

## Solution constraints

- Out of scope: the AJV → validator-neutral renaming inside the `SchemaValidator` interface prose is owned by T11; preserve the existing AJV naming when relocating it.

## Relationships

- T11 "`AJV` named in normative prose despite the `SchemaValidator` abstraction" — same-cluster (both touch the `SchemaValidator` abstraction; resolvable independently, but a reader of the moved interface section will expect the surrounding prose to honour the abstraction).
# T11 - `AJV` named in normative prose despite the `SchemaValidator` abstraction

**Kind:** prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 4
**Shape:** single
**State:** reduced

## Problem

The injected `SchemaValidator` abstraction (implementation-notes.md `#schemavalidator-interface`) and the rationale sentence in errors-and-results.md promise that swapping the validator is not a breaking change, and confine the AJV reference-implementation choice to one non-normative **Implementation hint** bullet. Despite that, normative prose across the corpus names AJV directly when describing what the runtime does — including the named hook **post-default-merge AJV validation** (anchor `#post-default-merge-ajv-validation`), the `AJV-on-args` failure-class label, BNDR-2's "AJV accepts `null`", the `<ajv-summary>` template placeholder token, the per-boundary "AJV boundary" table rows, and `type-system.md`'s `⊑` definition. A future validator swap would therefore falsify a large fraction of normative prose, a REQ-ID requirement, a named-hook anchor, a failure-class label, and a machine-readable placeholder token — the churn the abstraction exists to prevent.

## Solution approach

Rewrite the AJV mentions in normative prose across the affected topic pages to validator-neutral phrasing (the `SchemaValidator` service, or "schema validation"). Rename the binder.md named-hook anchor `#post-default-merge-ajv-validation` to a validator-neutral id and repoint its inbound links (the old id may be kept as an `<a id>` alias). Rename the `<ajv-summary>` template placeholder token and the `AJV-on-args` failure-class label to validator-neutral forms across their cross-referencing sites.

## Solution constraints

- The literal name `AJV` MUST be retained at the non-normative **Implementation hint** bullet (implementation-notes.md), the rationale sentence in errors-and-results.md, and the `SchemaValidator` interface's shape-mirroring note — these reference the AJV API as the named thing being abstracted away, and neutralising them destroys the rationale.

## Relationships

- T10 "`SchemaValidator` and `Clock` normative interfaces are mis-housed on `implementation-notes.md`" — same-cluster (both touch the `SchemaValidator` abstraction; either order works).
# T12 - Pi version bump procedure binds contributor workflow, in violation of GOV-18

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The `## Pi version bump procedure` section (anchor `#pi-version-bump-procedure`) at the end of `pi-integration-contract.md` is written as a seven-step contributor checklist whose steps bind a human workflow in imperative voice ("the contributor MUST run `npm run typecheck`", "MUST record the per-item audit outcome … in the bump commit message", "Move all four `peerDependencies` entries together … do not split"). GOV-18 (`#gov-18-internals-prohibition`) pins the spec corpus to bind only arm (a) the implementation target and arm (b) the spec corpus itself, and forbids specifying a third party's workflow, configuration, or failure surface. Most of the section's substance is genuinely arm-(a) content (build-time assertion shapes, the pinned-constants block, the literal `7` count, the `loom/typecheck/session-shutdown-reason-snapshot` brand string, per-sub-trigger routability) interleaved with the contributor-binding framing; the violation is concentrated in the imperative-voice step framing and the "in the same commit" co-edit obligations. Two pieces have no arm-(a) gate behind them: the editorial-review checklist items (a)–(g) and the bump-commit-message recording obligation.

## Solution approach

Rewrite the section in place so each contributor-binding MUST is expressed as the behaviour of the build-time gate that enforces it — the `npm run typecheck` gate, the bidirectional `SessionShutdownEvent['reason']` type-equality assertion, and the SDK surface-inventory assertions go red against `main` until the bump is consistent — and restate each "in the same commit" co-edit obligation as a consequence of a gate's red-on-partial-bump behaviour. Demote the editorial-review checklist items (a)–(g) to a non-normative note or move it to a contributor doc, and drop or demote the bump-commit-message recording obligation. Reframe in place rather than relocating to `governance.md`.

## Solution constraints

- The bump-procedure anchors that inbound cross-references target (from `binder.md`, `spec.md` Prerequisites, and elsewhere in `pi-integration-contract.md`) MUST keep their existing `id` values, or every inbound cross-reference MUST be repointed in the same edit (GOV-8 / GOV-9).

## Relationships

None
# T13 - Bare-name SDK types lack `.d.ts` pins at their PIC carrier sites — `ResourcesDiscoverResult` and `RegisteredCommand`

**Kind:** external-entities
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

Two load-bearing SDK types are cited by bare name at their PIC carrier sites without the page-standard `dist/<path>.d.ts` + symbol pin that every sibling SDK type carries. `ResourcesDiscoverResult` — the basis for the "loom returns `{}` / no `loomPaths`" claim in PIC's **Discovery API** paragraph (L730) and the **No Pi-owned discovery path enumerates `.loom` or `.warp`** paragraph (L734) — is named but never anchored to `dist/core/extensions/types.d.ts`. `RegisteredCommand` — which carries the "no `argumentHint` slot" non-display claim across `frontmatter.md`, `slash-invocation.md`, `pi-integration.md`, and `future-considerations.md` — is never pinned; PIC's `sdk-cap-slash-command-registration` entry pins the `pi.registerCommand` call shape but not the underlying interface. Both are negative-existence claims gating a normative diagnostic or seam, leaving the Pi-version-bump procedure with no symbol-and-file pair to diff against on a Pi minor bump.

## Solution approach

Add the page-standard `.d.ts` pin for `ResourcesDiscoverResult` at its first mention in PIC's **Discovery API** paragraph, naming `dist/core/extensions/types.d.ts` and the type's `skillPaths`/`promptPaths`/`themePaths` shape against the [loom 1.0 Pi-SDK pin](#pi-sdk-pin). Add the equivalent pin for `RegisteredCommand` at PIC's `sdk-cap-slash-command-registration` entry alongside the existing `pi.registerCommand` call-shape pin, and add forward-links from the four topic-page mentions (`frontmatter.md`, `slash-invocation.md`, `pi-integration.md`, `future-considerations.md`) to that entry. Register both types in `SDK_SURFACE_INVENTORY`, or accept a markdown-only path pin parallel to `SlashCommandSource`.

## Solution constraints

- The `future-considerations.md` forward-link must validate the `RegisteredCommand` negative-existence claim against the loom 1.0 Pi-SDK pin (`#pi-sdk-pin`), not against the item's own future `argumentHint` extension state.

## Relationships

- T14 "PIC narrates brittle non-public Pi internals as authoritative" — same-cluster (same page; SDK-reference hygiene; opposite polarity — under-anchored here vs over-narrated there).
- T27 "`Model<Api>` and `ModelRegistry` referenced by bare name" — same-cluster (identical defect class, different types; same pin-then-forward-link recipe).
# T14 - PIC narrates brittle non-public Pi internals as authoritative

**Kind:** external-entities
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

Two paragraphs on `docs/spec_topics/pi-integration-contract.md` route load-bearing behavioural claims through brittle, non-public Pi artifacts. Step 2 of *Extension entry point* names the internal loader symbols `notInitialized` (a local variable in `createExtensionRuntime()`) and `Runner.bindCore()` (a private method), neither of which appears on `ExtensionAPI`, `ExtensionRuntime`, `ExtensionActions`, or any type loom imports. The **Cancellation source** paragraph (anchor `#cancellation-source`) reproduces Pi's `ExtensionContext.signal` JSDoc as a "verbatim" quotation and leans on it ("Per the JSDoc above…"), but the quote is already inaccurate and a patch-level Pi update can re-word the comment without re-validation, while the load-bearing fact rides on the `AbortSignal | undefined` type rather than the comment text. Both opt into the brittle-anchor failure mode the page's other `.d.ts`-pinned SDK references are designed to avoid.

## Solution approach

In *Extension entry point* step 2, rewrite the prose to name the affected action methods directly from `ExtensionRuntime` / `ExtensionActions` in `dist/core/extensions/types.d.ts` instead of the `notInitialized`-tagged loader slots, restate the throwing-stub-to-bind transition without naming `Runner.bindCore()`, and delete the `notInitialized` disclaimer sentence once its antecedent is gone. In the **Cancellation source** paragraph (anchor `#cancellation-source`), replace the "verbatim" JSDoc quotation with a restatement against the `ExtensionContext.signal: AbortSignal | undefined` type itself, and rewrite the downstream "Per the JSDoc above" clause so no reference to the deleted quotation survives.

## Solution constraints

- The fix MUST NOT reintroduce a normative dependency on the `ExtensionContext.signal` JSDoc comment wording anywhere on the page; behavioural facts must ride on the `AbortSignal | undefined` type, not the comment text.

## Relationships

- T13 "Bare-name SDK types lack `.d.ts` pins at their PIC carrier sites" — same-cluster (same page; SDK-reference hygiene; opposite polarity).
# T15 - `system:` seam MUST is unfalsifiable structural prescription

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `system:` seam blockquote in `frontmatter.md` (anchors `loom-1-0-seam-system-expression-sublanguage` / `v1-seam-system-expression-sublanguage`) and the preceding *Parser entry point.* paragraph issue normative MUSTs that constrain internal code organisation: the `${…}` parser MUST reuse the [Expression Sublanguage] entry point, the dotted-path restriction MUST be a parser-level filter rather than a hand-rolled `${param}` regex or a separate parser, and an inlined regex implementation is branded "a non-conformant simplification." These clauses pin parser plumbing, not observable behaviour. Two implementations — one reusing the shared entry point with a post-parse filter, one hand-rolling a `Path`-only parser — produce indistinguishable outputs across the full input space (same four `loom/parse/system-interp-*` diagnostics, same valid-path stringification, same rejection of `${arr[0]}` / `${a + b}` / `${f(x)}` / `${a?.b}` / `${"x"}`), so no black-box conformance test can falsify the MUST. It is a category error: structural prescription dressed as a behavioural MUST.

## Solution approach

Demote the seam blockquote's structural clauses — the "same expression entry point" MUST, the "parser-level filter rather than a hand-rolled regex or separate parser" mandate, and the "inlined regex implementation is a non-conformant simplification" sentence — to a non-normative forward-compatibility note. Rewrite the blockquote and the preceding *Parser entry point.* paragraph in `frontmatter.md` so the only normative content is the already-pinned observable surface: the accepted `Path` grammar, the stringification rule, and the four `loom/parse/system-interp-*` diagnostics with their firing inputs.

## Solution constraints

- The four `loom/parse/system-interp-*` diagnostics remain normative MUSTs with unchanged firing conditions; their definitions in `diagnostics.md` are out of scope.
- Preserve both `id="loom-1-0-seam-system-expression-sublanguage"` and `id="v1-seam-system-expression-sublanguage"` anchors so the `future-considerations.md` forward-link continues to resolve.

## Relationships

- T18 "Symlink-resolution seam MUST is unfalsifiable — restate as a behavioural invariant" — must-follow (resolve the template-setting symlink seam first; adopt its demote-to-non-normative shape here).
- T16 "Named-argument seam MUST has no loom 1.0 observable" — same-cluster (identical anti-pattern; demote independently).
- T17 "Per-call timeout seam MUST is unobservable from any loom 1.0 surface" — same-cluster (identical anti-pattern on a runtime-internal record).
# T16 - Named-argument seam MUST has no loom 1.0 observable

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `loom 1.0 seam — named-argument invocation` blockquote in `invocation.md` raises a MUST that every AST consumer (argument-binding, arity checks, the runtime trampoline, the lowered-tool-spec emitter) switch exhaustively on the `style: "positional" | "named"` discriminator. But loom 1.0 emits only `"positional"` and reserves `"named"` for a deferred future-considerations extension with no defined loom 1.0 behaviour. No loom 1.0 source program or synthetic conformance-harness AST can produce a `"named"` argument list, so no input distinguishes an exhaustive switch from a non-exhaustive one that defaults to the positional path. The obligation is an unfalsifiable code-organisation rule disguised as a normative MUST, eroding the page convention that MUST implies a pass/fail conformance test.

## Solution approach

Demote the exhaustive-switch MUST in the `loom 1.0 seam — named-argument invocation` blockquote of `invocation.md` to non-normative forward-compatibility guidance. Keep the structural facts — the AST node's `style: "positional" | "named"` discriminator, loom 1.0 emitting only `"positional"`, and the deferred extension activating the `"named"` arm — as observable background rather than normative runtime claims, preserving the cross-link to the `future-considerations.md` named-argument bullet.

## Solution constraints

- Out of scope: the per-call-timeout seam blockquote (owned by T17) and the symlink-resolution seam blockquote (owned by T18) on the same page.

## Relationships

- T18 "Symlink-resolution seam MUST is unfalsifiable — restate as a behavioural invariant" — must-follow (resolve the template-setting symlink seam first; this finding adopts the demotion shape).
- T17 "Per-call timeout seam MUST is unobservable from any loom 1.0 surface" — same-cluster (same page, same shape; that finding's preferred restatement is not available here).
- T15 "`system:` seam MUST is unfalsifiable structural prescription" — same-cluster (same anti-pattern on a different page).
- T01 "Invocation page carries the `INV` prefix but coins zero `INV-N` anchors" — must-precede (demoting this MUST removes the need to coin an `INV-N` at this seam site; resolve this before T01's seam-anchor decision).
# T17 - Per-call timeout seam MUST is unobservable from any loom 1.0 surface

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `loom 1.0 seam — per-call timeout` blockquote in `invocation.md` raises a MUST that consumers "tolerate unknown fields" on the runtime-internal options record passed into the invoke primitive. That record is constructed and consumed entirely inside the runtime — it is not surfaced to loom authors, not part of any callable's argument schema, and not visible from any diagnostic. Within loom 1.0 the only field set that exists is the closed set the blockquote enumerates, so no loom 1.0 input or fixture can construct an options record carrying an unknown field. The MUST therefore prescribes an internal code-organisation property that no behavioural conformance test can falsify.

## Solution approach

Rewrite the per-call timeout seam blockquote in `invocation.md` so the normative MUST attaches to a cross-version observable invariant rather than to the internal record's open-struct shape: a future loom 1.x revision that adds a field to the options record MUST NOT alter the observable behaviour of `invoke(…)` — diagnostics, return values, side-effects — for any loom 1.0-defined parameter combination. Keep the structural open-struct description as background. This treatment is a restatement, not the demotion T16 applies to the named-argument seam.

## Solution constraints

- Out of scope: the named-argument seam blockquote (T16) and the symlink-resolution seam blockquote (T18) on the same page — edit only the per-call timeout blockquote.

## Relationships

- T18 "Symlink-resolution seam MUST is unfalsifiable — restate as a behavioural invariant" — must-follow (resolve the template-setting symlink seam first; this finding adopts the behavioural-restatement shape rather than demotion).
- T16 "Named-argument seam MUST has no loom 1.0 observable" — same-cluster (same page; that finding demotes because no loom 1.0 input exercises the deferred arm — not symmetric with this restatement).
- T15 "`system:` seam MUST is unfalsifiable structural prescription" — same-cluster (same anti-pattern on a different page).
- T01 "Invocation page carries the `INV` prefix but coins zero `INV-N` anchors" — must-precede (if the cross-version invariant lands it becomes a candidate for `INV-N`; resolve this before T01's seam-anchor decision).
# T18 - Symlink-resolution seam MUST is unfalsifiable — restate as a behavioural invariant

**Kind:** prescription, testability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `loom 1.0 seam — symlink-resolution hardening` blockquote in `invocation.md` raises a MUST that the `realpath`-then-discovery-root-containment check be exposed as a single named function reused by both the load-time check and the invocation-time re-check, and labels inline open-coding a "breaking simplification". This prescribes internal code organisation with no loom-1.0-observable consequence: an open-coded runtime and a factored runtime emit identical `loom/load/invoke-path-escape` diagnostics and identical error envelopes on every input, so no conformance test can distinguish them. The MUST's only rationale is forward-engineering for the deferred symlink-hardening extension — a property of the loom-1.0→1.x transition, not of loom 1.0 itself. The two loom-1.0-observable obligations (load-time check and invocation-time re-check applying identical resolution-and-containment semantics through the documented diagnostic surface) are already specified by the surrounding paragraph.

## Solution approach

In `invocation.md`, rewrite the seam blockquote (`id="v1-seam-symlink-resolution-hardening"`) so its normative core is a behavioural invariant: the load-time check and the invocation-time re-check MUST apply identical `realpath`-and-discovery-root-containment semantics, agreeing on the resolved path, the active discovery-root set, and the pass/fail outcome and its diagnostic surface for every input. Demote the single-function discipline to a SHOULD that preserves the forward-engineering hook for the deferred hardening extension. In `future-considerations.md`, rewrite the `Anchored at:` parenthetical for the `id="symlink-resolution-hardening"` entry to point at the behavioural invariant rather than the single-named-function MUST.

## Solution constraints

- Out of scope: coining `INV-N` REQ-ID anchors at the seam — owned by T01.

## Relationships

- T15 "`system:` seam MUST is unfalsifiable structural prescription" — must-precede (this finding sets the demote/restate template; resolve it first so the system: seam can adopt the same shape).
- T16 "Named-argument seam MUST has no loom 1.0 observable" — must-precede (template-setter; that finding adopts the demotion shape).
- T17 "Per-call timeout seam MUST is unobservable from any loom 1.0 surface" — must-precede (template-setter; that finding adopts the behavioural-restatement shape).
- T01 "Invocation page carries the `INV` prefix but coins zero `INV-N` anchors" — must-precede (if this MUST is restated/demoted, T01 coins `INV-N` only for whatever normative obligation survives at the seam site).
# T19 - `estimateTokens` signature names the wrong message type

**Kind:** codebase-grounding-broad
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The PIC `estimateTokens` (named export) entry declares the signature as
`estimateTokens(message: Message): number` and attributes the parameter
shape to Pi via "the `Message` shape is owned by Pi", but the actual
export takes `AgentMessage`, not `Message`. `Message` is the narrower
LLM-side wire type; `AgentMessage` is the agent-state superset that
additionally carries `thinking` blocks, `toolCall` blocks, and
host-defined custom messages. The spec's own formula sums over
`thinking`-block content, `toolCall.name`,
`JSON.stringify(toolCall.arguments)`, and tool-result text — fields
present only on `AgentMessage`. The documented callsite in binder.md's
Session-context truncation already sources `AgentMessage[]` from
`buildSessionContext(...).messages`, so an implementer typing strictly
against the declared `Message` parameter imports the wrong symbol and
loses the fields the formula requires.

## Solution approach

In `docs/spec_topics/pi-integration-contract.md`'s `estimateTokens`
(named export) paragraph, rename the signature parameter type from
`Message` to `AgentMessage` and update the "the `Message` shape is
owned by Pi" attribution to name `AgentMessage`. Add a `.d.ts` pin for
the export consistent with the page's external-entity pinning
discipline, recording the declaring `dist/...` path and that
`AgentMessage` re-exports from `@earendil-works/pi-agent-core`.

## Solution constraints

- None.

## Relationships

- T27 "`Model<Api>` and `ModelRegistry` referenced by bare name" — same-cluster (same external-entity pinning-gap pattern on the same page).
- T13 "Bare-name SDK types lack `.d.ts` pins at their PIC carrier sites" — same-cluster (same `.d.ts`-pin discipline applied to a Pi-supplied symbol).
# T20 - `respond_repair.methodology` — behaviour for unrecognised value undefined

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`respond_repair.methodology` is a closed enum with three recognised values (`validator_error`, `schema_repeat`, `none`) in `frontmatter.md`'s `respond_repair` prose, but the spec does not define what the runtime does when `methodology:` carries any other string or a non-string scalar. No diagnostic in `diagnostics.md` covers this case: `loom/load/frontmatter-value-out-of-range` is scoped to the non-negative-integer fields, `loom/load/unknown-mode-value` is scoped to `mode:`, and `loom/load/unknown-frontmatter-field` does not fire because `methodology` is a recognised key whose value is merely out of set. Implementers would diverge — silent fallback to `validator_error`, fallback to `none`, load-time rejection, or first-query runtime failure — each changing whether and how many respond-repair follow-ups are issued. The `mode:` field already models the correct recognised-key / unrecognised-value shape with a dedicated load-time error.

## Solution approach

Add a load-time error diagnostic to `diagnostics.md`'s catalogue modelled on the `loom/load/unknown-mode-value` row, firing when `respond_repair.methodology:` is present with a value outside the recognised set (non-string scalars included, with no truth-coercion or separate type-mismatch code) and leaving the loom unregistered. Clarify `frontmatter.md`'s `respond_repair` methodology prose to name that diagnostic as the present-but-unrecognised case and to state that an absent `methodology:` is the `validator_error` default.

## Solution constraints

- Out of scope: the `bind_context` and loom `model:` unknown-value gaps owned by T21.

## Relationships

- T21 "`bind_context` and loom `model:` — out-of-set / unresolvable values are undefined" — co-resolve (identical missing-enum-value shape; the `mode:`/`unknown-mode-value` template applies; both land as parallel catalogue rows + field-contract row edits in the same pass).
# T21 - `bind_context` and loom `model:` — out-of-set / unresolvable values are undefined

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** true
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

Two recognised frontmatter fields lack a defined behaviour for malformed values. `bind_context:` accepts `none | session` but no diagnostic covers an out-of-set value (`full`, `true`, a bare `~`, a non-string scalar); implementers diverge between rejecting at load, coercing to `none` (silently dropping intended grounding), and coercing to `session` (leaking caller-session content into a binder call the author never sanctioned). Loom `model:` is specified only for absent (inherit Pi's session model, pinned for the loom's lifetime); nothing defines a present-but-unresolvable identifier or a non-string value, so one implementer rejects at load while another defers to a first-query runtime failure that surfaces only after tool side-effects and partial transcript appends. The `mode:` field already models the correct shape — missing → `loom/load/missing-mode`, present-but-invalid → `loom/load/unknown-mode-value`, both load-time errors that prevent registration.

## Solution approach

Add a `loom/load/unknown-bind-context-value` (E, load) row to `diagnostics.md` following the `loom/load/unknown-mode-value` template, and extend the `bind_context` field-contract row in `frontmatter.md` with a present-but-invalid case mirroring the `mode:` row, so any value other than `none` or `session` — including non-string scalars — fires a load-time error and the loom is not registered. Close loom `model:` at load time for the non-string, malformed-identifier, and unresolved-registry cases by analogy to `loom/load/binder-model-unresolved`, reusing the `(provider, modelId)` parse rule defined by T28, and extend the `model` field-contract row in `frontmatter.md` with the present-but-invalid case.

## Solution constraints

- Out of scope: the absent-case contracts — omitted `bind_context` defaults to `none`, and omitted `model:` inherits Pi's session model at invocation time with no load-time registry call.
- Preserve the existing triggers of `loom/parse/bind-context-session-on-subagent` and `loom/load/typed-query-unsupported-provider` unchanged.

## Relationships

- T20 "`respond_repair.methodology` — behaviour for unrecognised value undefined" — co-resolve (identical missing-enum-value shape on `bind_context`; both fixes land as parallel catalogue rows + field-contract row edits in the same pass).
- T28 "Binder model — configured-string-to-`(provider, modelId)` parse rule" — must-follow (the loom `model:` identifier parse reuses the `(provider, modelId)` parse rule defined there; resolve that finding first so this one forward-links rather than re-states).
# T22 - Loop-iteration checkpoint does not yield the event loop, so a CPU-bound body is uncancellable

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`cancellation.md`'s **Granularity** rule lists the boundary before each `for`/`while` iteration as a cancellation checkpoint, and PIC's `Checkpoint` seam (`id="checkpoint-seam"`) wires production checkpoints as `await` of an already-resolved promise — a microtask. For a loom body with no genuine `await` between iterations (e.g. `while true { count += 1 }`), the microtask queue drains without ever returning a turn to the event loop, so the Pi event dispatch that flips `ctx.signal.aborted` (a macrotask) never runs and the signal-check at the loop checkpoint reads a value that cannot change. The spec therefore presents the loop boundary as a cancellation point that operationally is not one: Esc (or any path firing `loomAbort.abort(...)`) during a pure compute-bound loom loop cannot land at the checkpoint and the host appears to hang. The other Granularity checkpoints incidentally yield because they precede real async I/O; the defect is specific to the loop-iteration checkpoint.

## Solution approach

Rewrite the production-wiring bullet of PIC's `Checkpoint` seam (`id="checkpoint-seam"`) so the `loop-iter` checkpoint kind yields to a macrotask turn before the signal-check is read, while the other checkpoint kinds may keep their microtask resolution. Add a sentence to `cancellation.md`'s **Granularity** rule guaranteeing that the loop-iteration checkpoint releases the event loop so a Pi-dispatched abort can land before the next iteration's signal-check, with a forward-link to the seam.

## Solution constraints

- Out of scope: adding or removing checkpoints from the Granularity enumeration or the `CheckpointKind` union — the fix changes only how the existing `loop-iter` checkpoint resolves; the Granularity enumeration's REQ-ID anchoring is owned by T02.

## Relationships

- T02 "`cancellation.md` carries no `CNCL-N` REQ-ID anchors" — decision-overlap (the Granularity-enumeration MUST this finding amends is one of the obligations T02 coins a `CNCL-N` for; the new sentence introduced here should land under that `CNCL-N` anchor).
# T23 - Worked example: depth-6 forced respond — missing `mode:` and stray `name:` field

**Kind:** consistency
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The normative depth-6 worked-example loom source under the `worked-example-depth-6-forced-respond` anchor in `query.md` contradicts the `frontmatter.md` contract it exercises in two ways. First, it carries no `mode:` field, yet `frontmatter.md`'s required-fields table marks `mode` as the only `yes`-required field whose absence fires `loom/load/missing-mode` with the loom not registered — so a harness loading the source verbatim never reaches the documented depth-6 forced-respond outcome. Second, it declares `name: depth-6-co-fire`, contradicting `frontmatter.md`'s Naming-convention rule ("No `name` field — the filename is canonical"); the key surfaces as a `loom/load/unknown-frontmatter-field` warning and implies a name-resolution model the spec forbids. The example is cited by the `RuntimeEvent`-shape conformance test and the typed-query test suite, so both defects propagate into the test corpus.

## Solution approach

In the `~~~loom` source block under `query.md`'s `worked-example-depth-6-forced-respond` anchor, add the required `mode:` field. Delete the `name: depth-6-co-fire` line and surface the source filename `depth-6-co-fire.loom` near the block so the `/depth-6-co-fire` slash name in the `RuntimeEvent` payload has a visible origin via the filename stem.

## Solution constraints

- Do not rename the section heading or its `worked-example-depth-6-forced-respond` anchor — consumed by cross-references in `pi-integration-contract.md` and `hard-ceilings.md`.
- Do not alter `tool_loop.max_rounds: 2`, `respond_repair.attempts: 0`, the round-by-round trace, or the `RuntimeEvent` payload — the documented outcome depends on these values exactly as written.

## Relationships

None
