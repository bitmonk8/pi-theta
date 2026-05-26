# Triaged Spec Review — spec

_Generated: 2026-05-25T22:55:00Z_
_Updated: 2026-05-26T00:00:00Z — reshape pass split 6 oversized composite-3+ singles into 27 children (T09→4, T10→3, T13→3, T19→3, T23→5, T24→9); existing T-IDs preserved._
_Updated: 2026-05-26T12:00:00Z — rediagnosis pass on spec→plan cross-references. Findings T03 and T24a re-diagnosed under the corpus rule that the spec MUST NOT reference the plan (the plan may reference the spec, not the inverse — a plan deletion-and-rebuild from a given spec must not break any spec link). The original T24 diagnoses (split across T24a–T24h, T24j) treated the missing `docs/plan_topics/h1-scaffold.md` leaf as the defect and proposed authoring it; the actual defect is the 21 cross-links from `docs/spec_topics/pi-integration-contract.md` plus 2 from `docs/spec.md` to that plan-leaf path, and the PIC/`spec.md` paragraphs that defer normative ownership (test-harness wiring, file paths, constant names, comment grammars, fixture-row shapes, discriminator literals) to a plan leaf in the first place. T24a now carries the corrected diagnosis; T24b–T24h and T24j were children of the rejected framing and have been deleted (corpus count: 45 → 37). T23a–T23e (stale `~0.72.1` literals) are independent atomic edits; their `must-follow T24a` relationships were a consequence of the bad diagnosis and have been dropped._
_Updated: 2026-05-26T15:00:00Z — corpus-direction audit follow-up: T25, T26, T27 added (corpus count: 37 → 40). T25 sweeps ~117 bare plan-leaf-ID tokens (`H1`, `V18s`, `V14a`, `V16h`, `V3a`, `V5h`, `V6i`, `V6k`, `V12a`, `V14q`, `V15c`, `V18q`, `MVP`) across `docs/spec_topics/*.md` (T03's complement: T03 covered only the 3 `H1` tokens in `spec.md`). T26 sweeps a `v18-cancellation.md` cross-link in `diagnostics.md` plus seven "plan corpus" / "plan leaves" / "plan-side" narrative deferrals in `pi-integration-contract.md` (T24a's complement: T24a covered only the `h1-scaffold.md` link path). T27 addresses the structurally hardest case: `governance.md`'s ~15 "specified in the plan corpus" deferrals plus GOV-2 / GOV-7 / GOV-10 / GOV-11 — rules whose role is partly to constrain the plan corpus's shape, authored in the spec; T24a had explicitly carved these out as a "permitted abstraction barrier" and T27 revisits that carve-out under the strict reading and concludes structural rework is required (option A: reframe as informative consumption schema; option B: delete and let `plan_topics/conventions.md` own its own shape)._
_Updated: 2026-05-26T16:00:00Z — context correction across T24a, T25, T26, T27. The spec→plan references the corpus-direction audit surfaces are an artefact of commit 657ee76 ("pi-loom plan: reset to scaffold + template"), which deleted 25 plan leaves (h1-h6, m-mvp, v1-v18) on the working assumption that the spec did not reference the plan. The audit reveals that assumption was false in two distinct ways: (a) the spec contained pure-implementation deferrals to the plan that should be deleted on the spec side (the original T24a / T25 / T26 framing); (b) the spec contained references to material in the plan that was genuinely normative content the spec relied on (`SDK_SURFACE_INVENTORY` kind-discriminator inventory; the bidirectional type-equality probe pattern; the `loom/typecheck/session-shutdown-reason-snapshot` brand-string requirement; the four-entry peer-dep lock-step group; the cross-package `engines.node` equality property; and similar contract surfaces). For (b), the deferral cannot be deleted without orphaning a spec obligation; the content MUST be recovered from `git show 657ee76^:docs/plan_topics/<leaf>.md` and restored into the spec corpus (either inline in the citing topic page or as a new spec_topic). The classification step in each of T24a / T25 / T26 / T27 now carries an explicit fourth option for category-(b) occurrences, with the git provenance noted so the recovery is reproducible. T25 / T26 retitled / re-scoped accordingly. T27's structural-decision framing is unchanged (governance.md's plan-corpus rules are a different kind of defect from a delegation-of-normative-content)._
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T27) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 2 blocker, 5 high, 3 medium-high, 9 medium, 8 medium-low retained (24 originals → 45 findings after splitting 6 oversized parents into 27 children; → 37 after T24 re-diagnosis collapsed 9 children to 1; → 40 after T25/T26/T27 corpus-direction audit follow-up); 10 low discarded; 2 merges (4 lows → 2 mediums); 0 nit dropped; 0 false dropped._

---

# T01 — Appendix governance bullet omits GOV-16 and inlines GOV-13 retirement note

**Kind:** cruft, doc-alignment-broad
**Importance:** medium-low
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The Appendix Governance bullet in `docs/spec.md` enumerates `GOV-1` through `GOV-12`, `GOV-14`, and `GOV-15` but omits `GOV-16`, which is a live rule on `docs/spec_topics/governance.md` (anchor `gov-16`) that introduces a second governed identifier class — *stable inline labels* — with its own per-page registry, anchor form, lifecycle, retirement table, and tightened unknown-prefix detector. The same bullet inlines a `(GOV-13 retired)` parenthetical that duplicates bookkeeping already owned by `governance.md`'s Retired REQ-IDs sub-table. A reader using the Appendix as a rule inventory therefore under-counts the governance surface and never learns that any cross-page-citable identifier other than REQ-IDs is governed.

## Solution approach

Rewrite the Governance Appendix bullet in `docs/spec.md` to add `GOV-16` to the enumeration and extend the trailing clause to name the second governed identifier class (stable inline labels). Drop the inlined `(GOV-13 retired)` parenthetical — the numbering gap is the only retirement signal an orientation bullet needs to carry, and the retirement record is already owned by `governance.md`'s Retired REQ-IDs sub-table.

## Solution constraints

- None.

## Relationships

None
# T02 — `V1` collides between plan-phase IDs and the loom-release name

**Kind:** cross-spec-consistency-broad
**Importance:** medium-high
**Shape:** single
**State:** reduced

## Problem

`docs/plan_topics/conventions.md`'s phase-ID reservation paragraph reserves `V1`–`Vn` as plan-phase IDs ("vertical-slice phase N"), while `docs/spec.md` and ~27 files under `docs/spec_topics/` use `V1`/`V1.0`/`V1.x` extensively for the loom-language release (including the `v1-non-goals` anchor). The collision is already concrete in the plan corpus itself: `conventions.md` lines 37 and 43, `coverage-matrix.md` line 3, and `plan.md` line 11 all use `V1.0` in the loom-release sense, violating the same paragraph's "never reuse a plan ID for that meaning" sub-clause. Once leaves start landing, a `Deps.` field or `Ships when` clause naming `V1` is ambiguous between "vertical-slice phase 1 ships" and "loom 1.0 ships".

## Solution approach

Rename the plan-corpus vertical-slice ID space from `V1`–`Vn` to a non-colliding group prefix in `docs/plan_topics/conventions.md`'s phase-ID reservation paragraph and in `docs/plan_topics/leaf-template.md`'s leaf-ID-convention paragraph, updating the leaf-ID and `Deps.` examples in both files to the new prefix. Delete the "never reuse a plan ID for that meaning" sub-clause from `conventions.md`'s phase-ID reservation paragraph — after the rename `V1` is no longer a plan-phase ID and the carve-out becomes inert.

## Solution constraints

- Out of scope: `docs/spec.md` and `docs/spec_topics/*.md` — the spec-corpus `V1`/`V1.0`/`V1.x` usages and the `v1-non-goals` anchor are retained in the loom-release sense.

## Relationships

- T03 "`H1` is used as a bare abbreviation in `spec.md` with no glossary entry or first-use expansion" — same-cluster (both findings turn on plan-phase tokens leaking into spec-corpus prose; resolve independently — the H1 fix adds a glossary entry, this one renames the colliding plan IDs)
- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — same-cluster (touches the V1 Scope subsection prose; resolves independently; T09 was split — point at the scope-bounding first child)
- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links from `spec.md` and `pi-integration-contract.md` (corpus-direction violation)" — same-cluster (re-diagnosed 2026-05-26; both findings concern plan-phase-naming surface bleeding into spec prose, but along different axes — this finding renames the `V1` plan-ID space to avoid colliding with the loom-release `V1`, while T24a removes the `H1`-leaf cross-links that pull plan-corpus content into spec prose; resolve independently)
# T03 — `H1` is a plan-corpus identifier leaking into `spec.md` prose

**Kind:** cross-corpus-boundary, naming
**Importance:** medium-low
**Atomicity:** atomic
**Shape:** single
**State:** reduced (re-diagnosed 2026-05-26 — the original framing proposed a glossary entry forward-linking into the plan corpus; that approach inverts the corpus dependency direction and is rejected)

## Problem

`docs/spec.md` uses the token `H1` three times — in the Pi SDK and capabilities paragraph and in Host runtime bullets 1 and 2 — but `H1` is a plan-corpus phase identifier reserved by `docs/plan_topics/conventions.md` ("`H1`–`Hn`, `M`, and `V1`–`Vn` … are reserved for plan phases"). The spec corpus MUST NOT reference plan-corpus identifiers: a reader must be able to delete the plan and rebuild a different one from the same spec without touching the spec, and a glossary entry forward-linking to `plan_topics/conventions.md` (the original solution approach) would entrench the inversion rather than fix it. The three `H1` occurrences in `spec.md` are concretely the contract surface that pulls plan-corpus knowledge into spec-corpus prose.

## Solution approach

Rewrite the three `H1` call-sites in `docs/spec.md` (Pi SDK and capabilities paragraph; Host runtime bullets 1 and 2) so the prose names what the spec actually requires of the host / runtime in spec-corpus terms, with no token from the `H1…Hn` / `M` / `V1…Vn` reservation. Where a sentence currently relies on "the H1 tests" to discharge a normative assertion, either (a) state the assertion directly in `spec.md` (e.g. "the runtime MUST refuse to load when the peer-dep range excludes the installed Pi minor"), or (b) delete the deferral entirely if the surrounding paragraph is implementation guidance rather than a spec obligation. Do not add a glossary entry; the corpus-bridging move is the wrong remedy here.

## Solution constraints

- Out of scope: `docs/plan_topics/conventions.md`'s `H1…Hn` reservation — the plan corpus is permitted to coin and own these identifiers; the defect is solely the spec-side reference.
- Out of scope: the 21 cross-links from `docs/spec_topics/pi-integration-contract.md` to `../plan_topics/h1-scaffold.md` (owned by T24a's re-diagnosed scope below).

## Relationships

- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links from `spec.md` and `pi-integration-contract.md`" — same-cluster (same corpus-direction defect on the same `H1`-namespace surface; this finding removes the `H1` token, T24a removes the cross-links to the `H1` plan leaf; resolve in the same pass)
- T02 "`V1` collides between plan-phase IDs and the loom-release name" — same-cluster (parallel plan-corpus identifier leaking into spec prose; T02's resolution renames the plan-side `V1`–`Vn` reservation rather than touching the spec, because the spec's `V1` usage is the loom-release sense; this finding is the inverse direction — the spec-side reference is the defect)
# T04 — Three different names for the same enforcement-limit set

**Kind:** naming
**Importance:** medium-low
**Atomicity:** composite-2
**Shape:** single
**State:** reduced

## Problem

The four-item enforcement-limit set owned by `spec_topics/hard-ceilings.md` is cited in `docs/spec.md` under three different names — "runtime-class hard ceilings" (Overview link text on line 10), "Hard ceilings" (the Scope bullet heading at `id="hard-runtime-ceilings"` on line 56 and the inline link text on lines 10, 42, 118, 129), and "Hard Runtime Ceilings" (the topic-page H1 and the Implementation Notes index entry on line 129). The anchor ID `hard-runtime-ceilings` matches only the third form, so a reader searching the Scope section under the canonical name finds no occurrence and must reverse-map via the anchor ID to confirm the three labels denote the same set. With no in-spec canonical form, future authors are likely to perpetuate or extend the drift.

## Solution approach

Standardise on **Hard Runtime Ceilings** as the single canonical name throughout `docs/spec.md`, matching the topic-page H1 at `spec_topics/hard-ceilings.md` and the existing anchor `id="hard-runtime-ceilings"`. Rename each citation of the four-item set — the `**Hard ceilings.**` bullet heading at the anchor site, every `[Hard ceilings](#hard-runtime-ceilings)` inline link text, and the Overview's `runtime-class [hard ceilings]` link (dropping the now-redundant `runtime-class` qualifier, since the canonical name already contains "Runtime") — to the canonical form. Leave the anchor ID and the topic-page title unchanged.

## Solution constraints

- Out of scope: the Scope › Hard ceilings bullet's anchor-collocation / orientation-paragraph reshape owned by T11.

## Relationships

- T11 "Hard-ceilings orientation paragraph collocates two anchors, making CIO and NOCEIL obligations uncitable" — same-cluster (both touch the Scope › Hard ceilings bullet; resolve independently — anchor split vs. rename are orthogonal)
- T02 "`V1` collides between plan-phase IDs and the loom-release name" — same-cluster (broader naming-canonicalisation pressure across the corpus)
# T05 — Host-runtime aggregator bullet 2 misrepresents PIC enumeration and carries a vague size adjective

**Kind:** consistency, clarity
**Importance:** medium
**Atomicity:** composite-2
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

Bullet 2 of the Host runtime aggregator on `docs/spec.md` carries two co-located defects. (i) The bullet's trailing forward-link reads `[Pi Integration Contract — Host prerequisites #4 and Cancellation source](./spec_topics/pi-integration-contract.md)` — the `#4` ordinal points at PIC's separate top-level four-item `**Host prerequisites.**` enumeration, not at the three-precondition Step 0 capability probe the aggregator's preamble ("three host preconditions") enumerates, producing an in-prose "three" vs "#4" contradiction inside one paragraph; the link also carries no `#anchor` fragment and the cite-by-ordinal form is itself unstable against future PIC re-ordering. (ii) The same bullet describes the runtime as requiring the WHATWG constructors "and a small set of named members", a subjective size adjective whose canonical enumeration (currently nine members) already lives one clause later at `pi-integration-contract.md#entry-capability-probe` Step 0 (b).

## Solution approach

In `docs/spec.md` Host runtime bullet 2, delete the size adjective from the "a small set of named members" clause, leaving the existing forward-link to `#entry-capability-probe` as the sole source for the member list. In the same bullet, rewrite the trailing PIC link text to drop the `#4` ordinal and identify the target by description (PIC's Pi-supplied `AbortSignal` prerequisite and Cancellation source).

## Solution constraints

- Out of scope: `docs/spec_topics/pi-integration-contract.md` (its `**Host prerequisites.**` paragraph, `**Cancellation source.**` paragraph, and Step 0 enumeration), and bullets 1 and 3 of the Host runtime aggregator.
- The preamble cardinality "three host preconditions" MUST NOT widen to "four" — it is GOV-12 lock-step parity with PIC Step 0's three-precondition capability probe.

## Relationships

- T21 "Session model paragraph lives under 'Prerequisites' but is not a prerequisite" — same-cluster (different paragraph in the same `Orientation › Prerequisites` subsection; resolves independently)
# T06 — Trust boundary bullet emits a MUST-equivalent prohibition in informative-orientation prose

**Kind:** placement
**Importance:** medium-low
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The Scope subsection of `docs/spec.md` opens with an intro paragraph that labels its bullets as *informative orientation* whose role is to forward-link each disposition's canonical owner. The Trust boundary bullet violates that labelling by inlining the clause "and silent success on denial is forbidden" — a MUST-equivalent prohibition. The same prohibition is already normatively owned at `docs/spec_topics/pi-integration-contract.md` `<a id="no-extra-mediation">`, whose closing sentence carries the rule verbatim, so the orientation bullet is a duplicate normative emission rather than a unique source. The duplication invites GOV-12 lock-step drift: a future editor of the bullet may mistake the in-place prohibition for the source of truth and edit it without touching the canonical owner.

## Solution approach

Delete the clause "and silent success on denial is forbidden" from the Trust boundary bullet in `docs/spec.md`'s Scope subsection. The bullet's trailing forward-link to `Tool Calls — Failures` and `Pi Integration Contract — Tool execution from loom code` is the orientation pointer the intro paragraph promises and stays intact.

## Solution constraints

- None.

## Relationships

None
# T07 — "Identical return values" leaves the equality relation unspecified

**Kind:** clarity
**Importance:** medium
**Atomicity:** composite-2
**Shape:** single
**State:** reduced

## Problem

GOV-15 at `docs/spec_topics/governance.md` `<a id="gov-15">` — and the verbatim restatement in the Scope bullet at `docs/spec.md` `<a id="source-language-stability">` (kept in lock-step under GOV-12) — promises that V1.x releases produce, for any given input, "identical (a) return values, (b) ordered diagnostic-code sequences, (c) `loom-system-note` content strings", but fixes no equality relation for observable (a). Loom return values span IEEE-754 floats (`NaN`, `+0`/`-0`), records and arrays (reference vs structural equality), enum variants with interpreter-private declaring-enum tags, and host-bridged objects — where JavaScript `===`, `Object.is`, and structural equality all diverge. `docs/spec_topics/runtime-value-model.md` already defines a structural deep-equality relation for the value-model `==` operator (the `**Equality (==).**` paragraph: `Object.is` for primitives, key-set + per-key equality on objects, declaring-enum-tag inclusion), but GOV-15 does not cite it, so two reviewers can reach opposite verdicts on whether a given V1.x → V1.x diff honours observable (a).

## Solution approach

At GOV-15 in `docs/spec_topics/governance.md` and the mirrored Scope bullet at `docs/spec.md` `<a id="source-language-stability">`, qualify "identical (a) return values" with a cross-reference to the structural deep-equality relation defined in the `**Equality (==).**` paragraph of `docs/spec_topics/runtime-value-model.md`. Land both edits in one commit per the GOV-12 aggregator lock-step that already binds the two sites.

## Solution constraints

- Out of scope: editing the "loads cleanly under V1.0" predicate in the same GOV-15 paragraph — that predicate is owned by T08.

## Relationships

- T08 "'Loads cleanly' — undefined trigger predicate" — co-resolve (sibling defect on the same GOV-15 paragraph — both add a one-sentence definition pinning a load-bearing term in GOV-15 to an observable in another topic page; resolve in the same edit pass)
# T08 — "Loads cleanly" — undefined trigger predicate

**Kind:** testability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

GOV-15 at `docs/spec_topics/governance.md` `<a id="gov-15">` (and the Scope bullet at `docs/spec.md` `<a id="source-language-stability">` that restates GOV-15 and forward-links to it) gates the V1.x source-language equivalence promise on the predicate "a `.loom` or `.warp` file that loads cleanly under V1.0." The phrase "loads cleanly" is defined nowhere in the corpus — no glossary entry, no cross-reference to an observable, no enumeration of which diagnostic outcomes admit a file. Two reasonable reviewers performing the GOV-15 inter-release inspection can therefore scope the in-scope input set differently (e.g. one admitting `W`-severity-warning-emitting files, one excluding them) and reach divergent V1.x equivalence verdicts; the same ambiguity blocks any future GOV-15-fixture-suite from mechanically selecting its baseline corpus.

## Solution approach

Extend GOV-15 on `docs/spec_topics/governance.md` with a definition that binds "loads cleanly under V1.0" to the closed `phase` and `severity` vocabularies of the Diagnostics [Code registry](./diagnostics.md#code-registry). The definition lives inline under the existing `gov-15` anchor; do not coin a separate glossary entry. The Scope bullet at `docs/spec.md` `<a id="source-language-stability">` is not edited — it already forward-links to GOV-15 and inherits the definition transitively.

## Solution constraints

- The definition MUST read `loom/load/callee-has-errors` (and any other `E/W`-severity row) severity as resolved per the [Discovery — Failure modes](./discovery.md) table, not as the literal `E/W` cell value, so a file whose callee fails with surface-resolved `W` is still admitted.
- Out of scope: editing `docs/spec.md`'s `source-language-stability` Scope bullet (it forward-links to GOV-15 and inherits the definition; authoring the definition in two places creates a GOV-12 lock-step liability).

## Relationships

- T07 "'Identical return values' leaves the equality relation unspecified" — co-resolve (sibling defect on the same GOV-15 paragraph — both add a one-sentence definition pinning a load-bearing term in GOV-15 to an observable in another topic page; resolve in the same edit pass)
# T09d — Add `<a id="scope-forward-compat-seams-count"></a>` sub-anchor on the 13-seam count claim

**Kind:** traceability
**Importance:** medium-low
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Forward-compatibility seams* Scope bullet in `docs/spec.md` carries a load-bearing integer-count claim — "V1 reserves 13 typed/structural seams" — that GOV-12 in `docs/spec_topics/governance.md` registers as a single-bullet integer-count aggregator with a coverage-matrix CI gate. Once T09c installs the bullet-level anchor `scope-forward-compat-seams`, a cross-page citation that wants to pin the count itself still has no URL fragment to target — only the enclosing bullet is citable.

## Solution approach

Add a sub-anchor `<a id="scope-forward-compat-seams-count"></a>` inside the *Forward-compatibility seams* Scope bullet, immediately before the "13 typed/structural seams" substring, so the integer-count claim is citable independently of the bullet.

## Solution constraints

- Out of scope: the bullet-level anchor `scope-forward-compat-seams` owned by T09c — do not move, rename, or duplicate it.

## Relationships

- T09c "Add `<a id="scope-forward-compat-seams"></a>` to *Forward-compatibility seams* Scope bullet" — must-follow (this finding layers the inner count-claim anchor on top of the bullet-level anchor T09c adds; sequence T09c first so the two-anchor pattern lands deliberately)
- T11 "Hard-ceilings orientation paragraph collocates two anchors, making CIO and NOCEIL obligations uncitable" — same-cluster (same Scope subsection; same two-anchor shape, but T11's two anchors resolve to the same prose target whereas this finding's two anchors pin two independently-citable obligations)
- T10a "Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md" — same-cluster (same per-item-anchor pattern applied to the adjacent V1 non-goals subsection)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (anchor-atomicity concern applied to the Session model paragraph)
# T09c — Add `<a id="scope-forward-compat-seams"></a>` to *Forward-compatibility seams* Scope bullet

**Kind:** traceability
**Importance:** medium-low
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Forward-compatibility seams* bullet under Orientation › Scope in `docs/spec.md` carries no HTML anchor, so cross-references from topic pages or plan leaves must paraphrase the bullet text or fall back to the section-level `#scope` fragment, either of which silently breaks when the bullet wording shifts. It is one of three of the five Scope bullets lacking anchors (alongside *Trust boundary* and *Runtime observability*); the missing anchor is a parity gap against the "five Scope bullets" aggregator enumerated under GOV-12 in `docs/spec_topics/governance.md`.

## Solution approach

Add anchor `<a id="scope-forward-compat-seams"></a>` to the *Forward-compatibility seams* bullet in Orientation › Scope of `docs/spec.md`, following the `scope-<topic>` naming pattern already established by the sibling reductions T09a / T09b.

## Solution constraints

- Out of scope: the inner 13-seam count-claim sub-anchor owned by T09d (this finding installs only the bullet-level anchor).
- MUST NOT rename the existing `source-language-stability` or `hard-runtime-ceilings` anchors on neighbouring Scope bullets — both are already cross-referenced from topic pages.

## Relationships

- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — co-resolve (sibling anchor-add in the same uniform Scope-bullet anchoring pass)
- T09b "Add `<a id="scope-runtime-observability"></a>` to *Runtime observability* Scope bullet" — co-resolve (sibling anchor-add in the same uniform Scope-bullet anchoring pass)
- T09d "Add `<a id="scope-forward-compat-seams-count"></a>` sub-anchor on the 13-seam count claim" — must-precede (this finding's bullet-level anchor is the surface on which T09d layers the inner count-claim sub-anchor)
- T11 "Hard-ceilings orientation paragraph collocates two anchors, making CIO and NOCEIL obligations uncitable" — same-cluster (same Scope subsection)
- T10a "Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md" — same-cluster (same per-item-anchor pattern applied to the adjacent V1 non-goals subsection)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (anchor-atomicity concern applied to the Session model paragraph)
# T09b — Add `<a id="scope-runtime-observability"></a>` to *Runtime observability* Scope bullet

**Kind:** traceability
**Importance:** medium-low
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Runtime observability* bullet in `docs/spec.md`'s `### Scope` subsection (under `<a id="scope">`) carries no per-bullet anchor, so cross-page citations into it must use paraphrase or the coarse section-level `#scope` fragment and silently drift the moment the bullet wording shifts. *Runtime observability* is one of three Scope bullets currently lacking per-bullet anchors (alongside *Trust boundary* and *Forward-compatibility seams*); the sibling *Source-language stability* bullet already carries `<a id="source-language-stability">`. Governance enumerates the five Scope bullets as a lock-step aggregator (GOV-12), so per-bullet citability is the established expectation across the subsection.

## Solution approach

Prepend an empty `<a id="scope-runtime-observability"></a>` anchor to the *Runtime observability* Scope bullet in `docs/spec.md`'s `### Scope` subsection, following the `scope-<topic>` naming convention already used by `scope-source-language-stability`'s sibling.

## Solution constraints

- Out of scope: the *Trust boundary* Scope bullet is owned by T09a; the *Forward-compatibility seams* Scope bullet is owned by T09c.

## Relationships

- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — co-resolve (sibling anchor-add in the same uniform Scope-bullet anchoring pass)
- T09c "Add `<a id="scope-forward-compat-seams"></a>` to *Forward-compatibility seams* Scope bullet" — co-resolve (sibling anchor-add in the same uniform Scope-bullet anchoring pass)
- T11 "Hard-ceilings orientation paragraph collocates two anchors, making CIO and NOCEIL obligations uncitable" — same-cluster (same Scope subsection)
- T10a "Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md" — same-cluster (same per-item-anchor pattern applied to the adjacent V1 non-goals subsection)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (anchor-atomicity concern applied to the Session model paragraph)
# T09a — Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet

**Kind:** traceability
**Importance:** medium-low
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Trust boundary* bullet in `docs/spec.md`'s `### Scope` subsection carries no HTML anchor, so cross-references must resolve to the coarse `#scope` fragment or rely on bullet-name paraphrase that breaks silently when the wording shifts. The sibling *Source-language stability* bullet already carries `<a id="source-language-stability"></a>`; *Trust boundary*, *Runtime observability*, and *Forward-compatibility seams* do not. GOV-12 enumerates the five Scope bullets as a unit that downstream pages cite into, so each bullet needs a citable anchor.

## Solution approach

Prepend `<a id="scope-trust-boundary"></a>` to the *Trust boundary* bullet in `docs/spec.md`'s `### Scope` subsection, matching the `scope-<topic>` scheme used by sibling adds T09b and T09c.

## Solution constraints

- Out of scope: the MUST-equivalent prohibition deletion on the same *Trust boundary* bullet owned by T06.

## Relationships

- T09b "Add `<a id="scope-runtime-observability"></a>` to *Runtime observability* Scope bullet" — co-resolve (sibling anchor-add in the same uniform Scope-bullet anchoring pass)
- T09c "Add `<a id="scope-forward-compat-seams"></a>` to *Forward-compatibility seams* Scope bullet" — co-resolve (sibling anchor-add in the same uniform Scope-bullet anchoring pass)
- T06 "Trust boundary bullet emits a MUST-equivalent prohibition in informative-orientation prose" — same-cluster (same Trust boundary bullet; this edit adds a bullet-level anchor that commutes with T06's prohibition deletion)
- T11 "Hard-ceilings orientation paragraph collocates two anchors, making CIO and NOCEIL obligations uncitable" — same-cluster (same Scope subsection)
- T10a "Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md" — same-cluster (same per-item-anchor pattern applied to the adjacent V1 non-goals subsection)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (anchor-atomicity concern applied to the Session model paragraph)
# T10c — Repoint pi-integration-contract.md cross-reference from `#v1-non-goals` to `#ng-4`

**Kind:** traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/pi-integration-contract.md`'s `**Host prerequisites for the degraded-state branch.**` paragraph (under `<a id="degraded-state-host-prerequisites"></a>`) cites the "No concurrent user sessions in the same host process" V1 non-goal as framing precedent, but the link target is the section-level `./future-considerations.md#v1-non-goals` rather than a per-item anchor. Because the link text paraphrases one specific bullet while the URL resolves to the whole aggregator, a future rename or reorder of that bullet on `future-considerations.md` silently breaks the paraphrase-to-target correspondence without touching the link. T10a establishes the per-bullet `#ng-4` anchor that allows this paraphrase-drift cross-reference to be repointed to a stable target.

## Solution approach

Repoint the existing cross-reference in `docs/spec_topics/pi-integration-contract.md`'s `**Host prerequisites for the degraded-state branch.**` paragraph from `./future-considerations.md#v1-non-goals` to `./future-considerations.md#ng-4`. Confirm against `future-considerations.md`'s `## V1 non-goals` bullet order at edit time that `#ng-4` is the anchor T10a attached to the "No concurrent user sessions in the same host process" bullet.

## Solution constraints

- Out of scope: `docs/spec_topics/future-considerations.md` (the `#ng-4` anchor is owned by T10a).

## Relationships

- T10a "Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md" — must-follow (the `#ng-4` anchor target must exist before this link can resolve)
- T10b "Restructure spec.md V1 non-goals aggregator into a numbered list with `<a id="ng-1">`…`<a id="ng-7">`" — same-cluster (sibling edit on the same anchor scheme; not a dependency since this finding targets a third file)
- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — same-cluster (sibling `### Scope` Orientation aggregator on `spec.md`, same anchor-additions-for-citability remedy)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (different surface — `### Session model` — same anchor-decomposition pattern)
- T13a "Restructure terminal-outcomes-aggregator into success/failure/cancelled list items" — same-cluster (terminal-outcomes aggregator, same per-item-anchor decomposition pattern)
# T10b — Restructure spec.md V1 non-goals aggregator into a numbered list with `<a id="ng-1">`…`<a id="ng-7">`

**Kind:** traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `### V1 non-goals` aggregator paragraph in `docs/spec.md` at `<a id="v1-non-goals"></a>` (the paragraph beginning *"Orientation aggregator (per [Governance — GOV-12]…)"*) renders the seven V1 non-goals as a single semicolon-separated run-on sentence rather than as a citable list. A reviewer, test author, or sibling spec page wanting to cite an individual non-goal (e.g. the no-concurrent-sessions item, or the no-admission-cap item) has no finer-grained target than `#v1-non-goals`, which resolves to the entire aggregator. GOV-12's lock-step convention explicitly permits `bullet-vs-inline rendering` as an aggregator-side stylistic rewording, so this restructure is in-scope for the `spec.md` side without requiring topic-page coordination.

## Solution approach

Restructure the aggregator paragraph at `docs/spec.md`'s `<a id="v1-non-goals"></a>` from the semicolon-separated run-on into a short lead sentence followed by a numbered list whose seven items mirror the canonical bullet order on `docs/spec_topics/future-considerations.md#v1-non-goals`, with each list item carrying `<a id="ng-1"></a>`…`<a id="ng-7"></a>` and forward-linking the matching `future-considerations.md#ng-N` anchor.

## Solution constraints

- GOV-12's integer-count gate: the `seven` integer literal MUST survive in parseable form in the restructured aggregator's text.
- Out of scope: `docs/spec_topics/future-considerations.md` — the `ng-N` anchors on the canonical source page are owned by T10a.

## Relationships

- T10a "Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md" — must-follow (this edit's forward-links target the `ng-N` anchors T10a establishes on the source page)
- T10c "Repoint pi-integration-contract.md cross-reference from `#v1-non-goals` to `#ng-4`" — must-precede (this edit can land independently of T10c; the only ordering coupling is via T10a)
- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — same-cluster (sibling Orientation aggregator on `spec.md`)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (same anchor-decomposition pattern)
- T13a "Restructure terminal-outcomes-aggregator into success/failure/cancelled list items" — same-cluster (same per-item-anchor decomposition pattern)
# T10a — Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md

**Kind:** traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `## V1 non-goals` bullet list on `docs/spec_topics/future-considerations.md` (under `<a id="v1-non-goals"></a>`) carries no per-item anchors; only the fifth bullet has a one-off anchor `<a id="pi-stdio-capture-facet"></a>` attached for a specific cross-reference from `pi-integration-contract.md`. Sibling spec pages and the `spec.md` aggregator cannot cite individual V1 non-goals at a stable fragment, and the sibling restructures T10b (spec.md aggregator) and T10c (pi-integration-contract.md repoint) have no targets to link to. Establishing the `ng-1`…`ng-7` anchor scheme on the canonical source page is the scope-bounding edit that unblocks the rest.

## Solution approach

Add `<a id="ng-1"></a>` through `<a id="ng-7"></a>` to the seven bullets of `## V1 non-goals` on `docs/spec_topics/future-considerations.md`, in the order the bullets currently appear.

## Solution constraints

- The existing `<a id="pi-stdio-capture-facet"></a>` on the fifth bullet MUST be retained as a co-located alias alongside the new `ng-5` anchor; `pi-integration-contract.md` deep-links `./future-considerations.md#pi-stdio-capture-facet`.
- Out of scope: `docs/spec.md`'s V1 non-goals aggregator (owned by T10b) and `docs/spec_topics/pi-integration-contract.md`'s `#v1-non-goals` cross-reference (owned by T10c).

## Relationships

- T10b "Restructure spec.md V1 non-goals aggregator into a numbered list with `<a id="ng-1">`…`<a id="ng-7">`" — must-precede (T10b's forward-links target the `ng-N` anchors this edit establishes)
- T10c "Repoint pi-integration-contract.md cross-reference from `#v1-non-goals` to `#ng-4`" — must-precede (T10c's retargeted link points at `ng-4`, established here)
- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — same-cluster (sibling Orientation aggregator on `spec.md`)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (same anchor-decomposition pattern)
- T13a "Restructure terminal-outcomes-aggregator into success/failure/cancelled list items" — same-cluster (same per-item-anchor decomposition pattern)
# T11 — Hard-ceilings orientation paragraph collocates two anchors, making CIO and NOCEIL obligations uncitable

**Kind:** traceability
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

In `docs/spec.md`'s Hard ceilings bullet (under `<a id="hard-runtime-ceilings"></a>`), the cross-ceiling content paragraph opens with two adjacent HTML anchors — `<a id="ceiling-interaction-order"></a><a id="no-additional-ceilings"></a>` — on the same physical block. A cross-reference to `#ceiling-interaction-order` (intended to cite the CIO-1…CIO-6 ordering rules) and one to `#no-additional-ceilings` (intended to cite the NOCEIL-1…NOCEIL-4 non-existence claims) resolve to the identical target, so the two obligation groups cannot be cited independently even though they can pass or fail independently. The paragraph also mixes in unrelated cross-ceiling items (ceiling-set invariants, HC3-a…HC3-e, ceiling #4's per-boundary table, the `masked` field split) that belong to neither anchor.

## Solution approach

Split the cross-ceiling content paragraph in `docs/spec.md`'s Hard ceilings bullet so `#ceiling-interaction-order` and `#no-additional-ceilings` each sit on their own paragraph (or sub-item), with each anchor's paragraph naming only its own concept group — the CIO-1…CIO-6 ordering content (with worked consequences) for the former and the NOCEIL-1…NOCEIL-4 non-existence claims (with the four-axis Audit methodology) for the latter. Relocate the cross-ceiling items belonging to neither anchor into an unanchored lead orientation sentence on the same bullet.

## Solution constraints

- Every outbound link from the original paragraph (`hard-ceilings.md` deep-links `#ceiling-set-invariants`, `#ceiling-interaction-order`, `#no-additional-ceilings`, `#audit-methodology`, and the GOV-15 carve-out link to `governance.md#ceiling-set-carve-out`) MUST survive the restructure.
- Out of scope: `docs/spec_topics/hard-ceilings.md` — the normative CIO / NOCEIL / HC3 content lives there and is unaffected by this edit.

## Relationships

- T04 "Three different names for the same enforcement-limit set" — same-cluster (same Scope > Hard ceilings bullet, touches the surrounding anchor/heading hygiene; resolves independently)
- T13a "Restructure terminal-outcomes-aggregator into success/failure/cancelled list items" — same-cluster (same pattern of an orientation aggregator carrying multiple independently testable obligations under one anchor; different section; T13 was split — point at the scope-bounding first child)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (same anchor-atomicity pattern in the `session-model` paragraph; T19 was split — point at the scope-bounding first child)
- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — same-cluster (sibling Scope-bullet anchor-hygiene defect; T09 was split — point at the scope-bounding first child)
- T14 "Terminal-outcomes aggregator is one 347-word sentence with ambiguously-nested parentheses" — same-cluster (orientation-aggregator density in the Overview, same authoring antipattern)
# T12 — Failure-cause exclusions `(a)` and `(b)` are uncitable inline prose labels

**Kind:** traceability
**Importance:** medium-low
**Atomicity:** composite-2
**Shape:** single
**State:** reduced

## Problem

The `Failure.` bullet under `<a id="terminal-outcomes"></a>` on `docs/spec_topics/errors-and-results.md` carves two hard-ceiling cases out of the Failure-cause enumeration as inline `(a)` and `(b)` prose labels — exclusion (a) is the binder argument-binding failure (including ceiling #4's slash-load `params` arm cross-routed through ceiling #3), and exclusion (b) is ceiling #4's in-loop model-driven tool-call args row. Each exclusion is a distinct normative obligation, but neither carries an anchor, so a sibling page (today, `hard-ceilings.md`'s per-boundary table and Ceiling-#1 invariant, and the `in-loop` / `query-terminating` glossary entries) cannot cite one exclusion without dragging in the whole `Failure.` bullet. The page already carries the `ERR` REQ-ID prefix per `governance.md`'s REQ-ID prefix table, and the parallel inline-letter pattern is already anchored via the `HC3-*` and `NOCEIL-*` families on `hard-ceilings.md`.

## Solution approach

Promote exclusion (a) and exclusion (b) inside the `Failure.` bullet to individually-anchored sub-items, each carrying a fresh dual-form `ERR-N` REQ-ID anchor per GOV-1, allocating the two next-free integers under the `ERR` prefix on `errors-and-results.md` at edit time. Preserve every existing cross-link from each exclusion's prose unchanged.

## Solution constraints

- Out of scope: the `<a id="terminal-outcomes-aggregator"></a>` aggregator paragraph on `docs/spec.md` — it is informative under GOV-12, and its restructure is owned by T13a–T13c and T14.

## Relationships

- T14 "Terminal-outcomes aggregator is one 347-word sentence with ambiguously-nested parentheses" — same-cluster (same `spec.md` aggregator paragraph; a separate-bullet-list restructure on the `spec.md` side would also surface the exclusions as readable items, but the citability fix lives on the owner page regardless)
- T13a "Restructure terminal-outcomes-aggregator into success/failure/cancelled list items" — same-cluster (the parent paragraph's anchoring problem; this finding is the narrower per-exclusion case of that broader atomicity violation; T13 was split — point at the scope-bounding first child)
- T15 "Undefined coined term: `slash-load`" — co-resolve (the term appears inside exclusion (a)'s prose, so the exclusion's restructure is the natural site to rename or define it)
- T11 "Hard-ceilings orientation paragraph collocates two anchors, making CIO and NOCEIL obligations uncitable" — same-cluster (parallel anchoring-discipline issue on a different paragraph)
- T10a "Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md" — same-cluster (parallel per-item-anchor issue on a different aggregator; T10 was split — point at the scope-bounding first child)
- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — same-cluster (parallel anchoring-discipline issue; T09 was split — point at the scope-bounding first child)
# T13c — Extract pre-evaluation-failure exclusion into a sub-paragraph anchored `<a id="outcome-pre-eval">`

**Kind:** traceability
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The two trailing sentences of the `<a id="terminal-outcomes-aggregator">` paragraph in `docs/spec.md` ("Failures that occur before evaluation begins are owned … The success / fail / cancelled trichotomy applies only once evaluation has begun.") carry an orthogonal sub-obligation — the pre-evaluation-failure carve-out that bounds the trichotomy's scope — but live as unanchored prose. Once T13a has decomposed the aggregator into list items and T13b has anchored the success / failure / cancelled arms, this exclusion remains the only sub-obligation in the paragraph without its own citable fragment, leaving sibling pages unable to cross-reference it.

## Solution approach

Split the pre-evaluation-failure exclusion sentences out of the `terminal-outcomes-aggregator` paragraph in `docs/spec.md` into their own structural unit (sub-paragraph or final list item) carrying anchor `<a id="outcome-pre-eval"></a>`, keeping the existing forward-link to `errors-and-results.md#terminal-outcomes`.

## Solution constraints

- The forward-link to `errors-and-results.md#terminal-outcomes` in the extracted sentences MUST be preserved.
- Out of scope: the success / failure / cancelled list structure and arm anchors owned by T13a and T13b.

## Relationships

- T13b "Add `<a id="outcome-success">`, `<a id="outcome-failure">`, `<a id="outcome-cancelled">` anchors" — must-follow (this edit lands cleanly on already-decomposed prose with sibling anchors in place)
- T14 "Terminal-outcomes aggregator is one 347-word sentence with ambiguously-nested parentheses" — same-cluster (same paragraph)
- T12 "Failure-cause exclusions `(a)` and `(b)` are uncitable inline prose labels" — same-cluster (parallel sub-obligation anchoring defect inside the same paragraph's failure-routing prose)
- T15 "Undefined coined term: `slash-load`" — same-cluster (same paragraph)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (parallel defect on the Session model paragraph)
- T11 "Hard-ceilings orientation paragraph collocates two anchors, making CIO and NOCEIL obligations uncitable" — same-cluster (parallel defect on the Hard ceilings bullet)
- T10a "Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md" — same-cluster (parallel defect on V1 non-goals)
- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — same-cluster (parallel anchor-gap defect)
# T13b — Add `<a id="outcome-success">`, `<a id="outcome-failure">`, `<a id="outcome-cancelled">` anchors

**Kind:** traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The three terminal-outcome list items (success / failure / cancelled) produced by T13a's restructure of the `terminal-outcomes-aggregator` paragraph in `docs/spec.md` carry no per-item HTML anchors, so each arm of the trichotomy is uncitable at fragment granularity from sibling pages and plan leaves. `docs/spec.md` carries no per-page REQ-ID prefix per GOV-12, so the per-item anchors are page-local `outcome-*` fragment identifiers rather than `PREFIX-N` REQ-IDs.

## Solution approach

Add `<a id="outcome-success">`, `<a id="outcome-failure">`, and `<a id="outcome-cancelled">` to the three list items established by T13a inside the `terminal-outcomes-aggregator` paragraph in `docs/spec.md`. Keep the existing umbrella `<a id="terminal-outcomes-aggregator">` on the introductory clause.

## Solution constraints

- The umbrella `terminal-outcomes-aggregator` anchor MUST remain on the introductory clause of the paragraph (external bookmark surface).
- Out of scope: the pre-evaluation-failure extraction and its `outcome-pre-eval` anchor (owned by T13c).
- Out of scope: stable IDs for the failure-cause exclusions `(a)` and `(b)` (owned by T12).

## Relationships

- T13a "Restructure terminal-outcomes-aggregator into success/failure/cancelled list items" — must-follow (the three list items this edit anchors are established by T13a)
- T13c "Extract pre-evaluation-failure exclusion into a sub-paragraph anchored `<a id="outcome-pre-eval">`" — must-precede (T13c's split lands cleanly once sibling anchors are in place)
- T14 "Terminal-outcomes aggregator is one 347-word sentence with ambiguously-nested parentheses" — same-cluster (same paragraph)
- T12 "Failure-cause exclusions `(a)` and `(b)` are uncitable inline prose labels" — co-resolve (the `(a)`/`(b)` exclusions live inside the failure-routing prose; promoting them to numbered items with IDs should be sequenced after this edit so the failure bullet has its own anchor)
- T15 "Undefined coined term: `slash-load`" — same-cluster (same paragraph)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (parallel defect)
- T11 "Hard-ceilings orientation paragraph collocates two anchors, making CIO and NOCEIL obligations uncitable" — same-cluster (parallel defect)
- T10a "Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md" — same-cluster (parallel defect)
- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — same-cluster (parallel anchor-gap defect)
# T13a — Restructure terminal-outcomes-aggregator into success/failure/cancelled list items

**Kind:** traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The Overview aggregator paragraph at `<a id="terminal-outcomes-aggregator">` in `docs/spec.md` carries one HTML anchor over a single run-on sentence that bundles four independently-citable sub-obligations: success-outcome semantics, failure routing, cancellation as the third arm of the trichotomy, and the pre-evaluation-failure class explicitly excluded from the trichotomy. The canonical topic page `docs/spec_topics/errors-and-results.md#terminal-outcomes` already decomposes these per-item, so the `spec.md` aggregator is the only surface in the chain that cannot be cited at sub-obligation granularity. This structural shape blocks downstream per-item anchoring (T13b) and the pre-evaluation extraction (T13c).

## Solution approach

Restructure the `terminal-outcomes-aggregator` paragraph in `docs/spec.md` into a three-item list — success, failure, cancelled — keeping the existing `<a id="terminal-outcomes-aggregator">` on the introductory clause as the umbrella. Preserve the existing prose and forward-link targets in each item; perform only the minimal connective edits needed for each item to stand as its own grammatical unit.

## Solution constraints

- The `<a id="terminal-outcomes-aggregator">` anchor MUST remain on the introductory clause and MUST NOT migrate to one of the list items; external bookmarks target it as the umbrella.
- Out of scope: per-item sub-anchors `outcome-success` / `outcome-failure` / `outcome-cancelled` (owned by T13b), the pre-evaluation-failure extraction (owned by T13c), the `(a)`/`(b)` exclusion labelling (owned by T12), and the `slash-load` rename (owned by T15).
- Out of scope: the paragraph-level clarity rewrite (owned by T14); do not reword the prose beyond the minimal connective glue the list conversion requires.

## Relationships

- T13b "Add `<a id="outcome-success">`, `<a id="outcome-failure">`, `<a id="outcome-cancelled">` anchors" — must-precede (T13b's anchors attach to the list items this edit creates)
- T13c "Extract pre-evaluation-failure exclusion into a sub-paragraph anchored `<a id="outcome-pre-eval">`" — must-precede (T13c's split lands cleanly on top of this restructure)
- T14 "Terminal-outcomes aggregator is one 347-word sentence with ambiguously-nested parentheses" — co-resolve (same paragraph; this edit produces the structural baseline that also resolves T14's clarity issue)
- T12 "Failure-cause exclusions `(a)` and `(b)` are uncitable inline prose labels" — co-resolve (the `(a)`/`(b)` exclusions live inside the failure-routing prose; the restructure here is the prerequisite for T12's anchoring)
- T15 "Undefined coined term: `slash-load`" — same-cluster (same paragraph; resolves independently)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (parallel defect)
- T11 "Hard-ceilings orientation paragraph collocates two anchors, making CIO and NOCEIL obligations uncitable" — same-cluster (parallel defect)
- T10a "Add `<a id="ng-1">`…`<a id="ng-7">` to V1 non-goals bullets in future-considerations.md" — same-cluster (parallel defect)
- T09a "Add `<a id="scope-trust-boundary"></a>` to *Trust boundary* Scope bullet" — same-cluster (parallel anchor-gap defect)
# T14 — Terminal-outcomes aggregator is one 347-word sentence with ambiguously-nested parentheses

**Kind:** clarity
**Importance:** medium
**Atomicity:** composite-2
**Shape:** single
**State:** reduced

## Problem

The `terminal-outcomes-aggregator` paragraph at `<a id="terminal-outcomes-aggregator">` in `docs/spec.md` is a single 347-word sentence carrying the success/failure/cancellation trichotomy, the failure-routing classes, the two failure-cause exclusions `(a)` and `(b)`, the slash-load vs `invoke(...)` `params` carve-out, the partial-append pointer, and the pre-evaluation-failure carve-out. The carve-outs are nested four parentheses deep inside the `it fails (…)` parenthetical, so the scope of several inner clauses is ambiguous on a single reading — a reader cannot tell from paren counting alone whether the slash-load qualifier attaches to the immediately-preceding cross-route or to the whole `(a)` exclusion, nor whether the tool-error-feedback clause modifies `(b)` alone or both exclusions. The defect is legibility, not normative content — every obligation in the sentence is preserved verbatim in the downstream sub-spec pages it links to.

## Solution approach

Rewrite the `terminal-outcomes-aggregator` paragraph in `docs/spec.md` as a sequence of short sentences plus a bulleted list, leaving the existing anchor on the lead sentence. Split the trichotomy across a one-sentence lead and one sentence per arm (success, failure, cancellation), and promote the `(a)` and `(b)` failure-cause exclusions to a top-level bulleted list whose qualifying clauses sit inside each bullet rather than nested in parentheses.

## Solution constraints

- The `terminal-outcomes-aggregator` anchor MUST remain on the lead sentence of the rewritten paragraph; downstream pages cite the ID.
- Every existing hyperlink target in the paragraph MUST be preserved verbatim.
- Out of scope: introducing new sub-anchors or exclusion IDs in this edit (owned by T13a–T13c and T12).
- Out of scope: renaming `slash-load` (owned by T15).

## Relationships

- T13a "Restructure terminal-outcomes-aggregator into success/failure/cancelled list items" — co-resolve (same paragraph; this edit produces the structural baseline on which sub-anchors can land cleanly; apply this finding first; T13 was split — point at the scope-bounding first child)
- T12 "Failure-cause exclusions `(a)` and `(b)` are uncitable inline prose labels" — co-resolve (same paragraph; promoting (a)/(b) to bullets here is the structural prerequisite for attaching stable IDs there; apply this finding first)
- T15 "Undefined coined term: `slash-load`" — same-cluster (same paragraph; resolves independently — a rename does not depend on the paragraph's shape)
# T15 — Undefined coined term: `slash-load`

**Kind:** naming
**Importance:** medium-high
**Atomicity:** composite-2
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The term `slash-load` is used as a spec-coined technical label across roughly six files — `docs/spec.md` (terminal-outcomes aggregator paragraph), `docs/spec_topics/hard-ceilings.md` (ceiling #4 per-boundary table, reconciliation paragraph, and CIO-1), `docs/spec_topics/errors-and-results.md` (failure-cause exclusions, pre-evaluation failure list), `docs/spec_topics/schema-subset.md` (per-boundary mirror table row #4), `docs/spec_topics/glossary.md` (cited from the *in-loop* and *query-terminating* entries as "the slash-load `params` cross-routing arm"), and `docs/spec_topics/pi-integration-contract.md` (`Slash-load` row of the `masked`-omission table) — but it has no glossary entry, no defining anchor, and no italicised first-use marker flagging it as coined. The operative meaning — the slash-command-load-time arm of `params` AJV validation that cross-routes from ceiling #4 (depth-walk) into ceiling #3's binder failure-mode templates — is implicit in the cell at `hard-ceilings.md#ceiling-4-table` and is reachable only by following the `params` validation row. Readers of the `spec.md` aggregator paragraph or the *in-loop* / *query-terminating* glossary entries (both of which invoke `slash-load` as one of three arms partitioning ceiling #4's enforcement points) hit the term cold and cannot distinguish it from adjacent labels such as *Slash-Command Invocation*, *slash invocation*, *Slash-Command Argument Binding*, or *slash-invocation load time*.

## Solution approach

Add a `**slash-load**` entry to `docs/spec_topics/glossary.md` carrying anchor `id="slash-load"` and pinning the term to the slash-command-load-time arm of `params` AJV validation that cross-routes from ceiling #4 into ceiling #3's binder failure-mode templates, with a forward-link to `hard-ceilings.md#ceiling-4-table` and a contrast against the runtime `invoke(...)` `params` arm (which surfaces `Err(InvokeInfraError { cause: "validation", … })`). Rewrite the `slash-load` mentions inside the existing `in-loop` and `query-terminating` glossary entries as forward-links to the new anchor. Italicise and forward-link `slash-load` on its first occurrence in `spec.md`'s terminal-outcomes aggregator paragraph, matching the existing first-use treatment of `in-loop` and `query-terminating` in that same paragraph.

## Solution constraints

- Out of scope: first-use linking in `hard-ceilings.md`, `errors-and-results.md`, `schema-subset.md`, and `pi-integration-contract.md` — those files pick up the new anchor on their next routine edit and are not part of this finding's edit surface.
- Out of scope: the aggregator-paragraph clarity rewrite owned by T14 and the failure-cause exclusion labelling owned by T12; do not restructure the surrounding sentence beyond italicising and linking the first `slash-load` occurrence.

## Relationships

- T04 "Three different names for the same enforcement-limit set" — same-cluster (both about coined-term hygiene in the hard-ceilings region; resolve independently)
- T14 "Terminal-outcomes aggregator is one 347-word sentence with ambiguously-nested parentheses" — same-cluster (touches the same `spec.md` aggregator paragraph; the clarity rewrite must preserve the first-use link this finding adds)
- T12 "Failure-cause exclusions `(a)` and `(b)` are uncitable inline prose labels" — same-cluster (touches the same aggregator-paragraph carve-out where `slash-load` is the qualifying term)
# T16 — Pi SDK identifiers `AgentSession` and `pi.setActiveTools` lack first-use definitional pointers in `spec.md`

**Kind:** external-entities
**Importance:** medium
**Atomicity:** composite-2
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

In `docs/spec.md` the `<a id="session-model">` paragraph and the Extension Architecture `<a id="concurrency-model">` bullet introduce `AgentSession` and `pi.setActiveTools` as bare backticked tokens with no owner-package or definitional pointer at first use. The same paragraph already qualifies `SessionShutdownEvent` inline (`@mariozechner/pi-coding-agent`'s `dist/core/extensions/types.d.ts`), so the two SDK identifiers are indistinguishable from runtime-internal tokens like `loomAbort`. Their definitional sites exist on PIC — `AgentSession` at `#sdk-capability-inventory` item 3 (with the class itself probed at `#entry-capability-probe` step `(c)`) and `pi.setActiveTools` at `#sdk-cap-tool-registration-gating` (item 4) — but the existing forward-links frame those targets as consumption / serialisation citations rather than definitions, so a reader who does not already know the tokens are SDK members has no in-paragraph signal that the linked sections are definitional.

## Solution approach

At the first occurrence of `` `AgentSession` `` in spec.md's `<a id="session-model">` paragraph and `<a id="concurrency-model">` bullet, add an inline forward-link to PIC's `#sdk-capability-inventory` and name the owning Pi package `@mariozechner/pi-coding-agent`, matching the in-paragraph convention used for `SessionShutdownEvent`. At the first occurrence of `` `pi.setActiveTools` `` in the same two surfaces, add an inline forward-link to PIC's `#sdk-cap-tool-registration-gating`. Subsequent in-section mentions inherit the qualification.

## Solution constraints

- Out of scope: the Concurrency model bullet body (owned by T22); if T22's body collapse lands first, the concurrency-model edit collapses to a no-op — see Relationships.

## Relationships

- T22 "Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose" — must-follow (if T22's body collapse lands first, edit 2 of this finding collapses to a no-op; without that, both surfaces need the qualification)
- T20 "Session-model paragraph fuses lifecycle and concurrency content under one anchor" — same-cluster (touches the same Session model paragraph but resolves independently)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (also targets the Session model paragraph's anchor, independent fix; T19 was split — point at the scope-bounding first child)
# T17 — Ambiguous post-teardown editor-edit behaviour in the Session model paragraph

**Kind:** clarity
**Importance:** medium-low
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The Session model paragraph in `docs/spec.md` (`<a id="session-model">`) describes the post-teardown degraded state as showing the `loom /<name>: extension degraded; /reload to recover` system note "with editor-driven `.loom` and settings edits silently no-opping until recovery". "Silently no-opping" reads as an active runtime behaviour — the watcher fires, the runtime inspects each event, and the runtime decides to drop the mutation and suppress diagnostics. The actual machinery is the opposite: PIC sub-step 4 (`<a id="session-only-reason-degraded-state">`, `Close watchers`) closes `discoveryWatcher` and `settingsWatcher` during teardown, so no editor edit reaches the runtime and there is no callback in which a no-op could be observed or suppressed. An implementer reading spec.md alone may infer and implement an unreachable drained-state guard and diagnostic-suppression branch inside the watcher callback.

## Solution approach

Rewrite the `(with editor-driven .loom and settings edits silently no-opping until recovery)` parenthetical in the `<a id="session-model">` paragraph of `docs/spec.md` so it names the watcher-closure mechanism owned by PIC sub-step 4 (`Close watchers`) and drops the active-runtime "silently no-opping" framing. Cite PIC sub-step 4 by name as the owner of the closure.

## Solution constraints

- The rewritten parenthetical MUST stay scoped to the session-only-reasons branch (`event.reason ∈ {"new", "resume", "fork"}`) and MUST NOT assert anything about the `reason: "reload"` branch, which also closes watchers in sub-step 4 but does not enter the degraded state.

## Relationships

- T19a "Replace session-model paragraph with eight SM-N sub-units" — co-resolve (an `SM-N` sub-section split of the session-model paragraph would naturally isolate the degraded-state clause and absorb this clarity edit; T19 was split — point at the scope-bounding first child)
- T20 "Session-model paragraph fuses lifecycle and concurrency content under one anchor" — same-cluster (same paragraph, lifecycle half)
- T21 "Session model paragraph lives under 'Prerequisites' but is not a prerequisite" — same-cluster (same paragraph; promotion to its own `### Session Model` subsection is orthogonal to the wording fix)
# T18 — `event.reason` enumeration mixes a normative closed-set claim with deferral to an externally-owned SDK type

**Kind:** testability
**Importance:** medium-high
**Shape:** single
**State:** reduced

## Problem

The `session-model` paragraph in `docs/spec.md` introduces `event.reason: "quit" | "reload" | "new" | "resume" | "fork"` with a parenthetical that simultaneously labels the five-element literal list "the closed normative set" and names `SessionShutdownEvent` in `@mariozechner/pi-coding-agent` as the source of truth for the same set. The two claims are mutually authoritative, so a future SDK pin bump that widens the union leaves the spec's text both normative-and-wrong and deferred-and-right with no rule for which side loses. The contradiction is incompatible with machinery the same paragraph already ships — the "outside that closed set" branch routes unknown reasons through full teardown and emits `loom/host/session-shutdown-reason-unknown`, and PIC's `session_shutdown` handler types `details.event.reason` as a deliberately open `... | string` union.

## Solution approach

Rewrite the parenthetical at `<a id="session-model">` in `docs/spec.md` so the five-element literal list is illustrative of the V1 SDK pin and `SessionShutdownEvent` is named as the sole authority for the reason set, preserving the existing forward-link to PIC's `#pi-version-bump-procedure`. In the same edit, rewrite the later "An `event.reason` outside that closed set" sentence in the same paragraph so it no longer asserts a normative closure the parenthetical has just removed.

## Solution constraints

- Out of scope: edits to `docs/spec_topics/pi-integration-contract.md`; PIC's `session_shutdown` handler and Unknown-reason rule already treat the union as open and need no change for this finding.

## Relationships

- T19a "Replace session-model paragraph with eight SM-N sub-units" — must-follow (decomposing the `session-model` anchor into `SM-1…SM-8` would create a sub-anchor for the reason-set obligation that this edit then targets; sequence the decomposition first if both land; T19 was split — point at the scope-bounding first child)
- T23a "Replace ~0.72.1 with ~0.74.1 across pi-integration-contract.md" — same-cluster (also concerns SDK-pinned surfaces, but its fix is in the PIC `Host prerequisites` block, not the `session-model` paragraph; T23 was split — point at the first child which carries the canonical pin)
# T19c — Retarget the five `../spec.md#session-model` cross-references in future-considerations.md to specific `sm-N-...` anchors

**Kind:** traceability
**Importance:** high
**Atomicity:** atomic
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
- T20 "Session-model paragraph fuses lifecycle and concurrency content under one anchor" — same-cluster
- T21 "Session model paragraph lives under 'Prerequisites' but is not a prerequisite" — same-cluster
- T18 "`event.reason` enumeration mixes a normative closed-set claim with deferral to an externally-owned SDK type" — same-cluster
- T17 "Ambiguous post-teardown editor-edit behaviour in the Session model paragraph" — same-cluster
# T19b — Retarget the three `../spec.md#session-model` cross-references in pi-integration-contract.md to specific `sm-N-...` anchors

**Kind:** traceability
**Importance:** high
**Atomicity:** atomic
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
- T20 "Session-model paragraph fuses lifecycle and concurrency content under one anchor" — same-cluster
- T21 "Session model paragraph lives under 'Prerequisites' but is not a prerequisite" — same-cluster
- T18 "`event.reason` enumeration mixes a normative closed-set claim with deferral to an externally-owned SDK type" — same-cluster
- T17 "Ambiguous post-teardown editor-edit behaviour in the Session model paragraph" — same-cluster
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
- T20 "Session-model paragraph fuses lifecycle and concurrency content under one anchor" — co-resolve (the split at "Concurrent loom invocations within a session carry mode-qualified isolation" is the same edit T20 recommends)
- T21 "Session model paragraph lives under 'Prerequisites' but is not a prerequisite" — must-follow (if the section is promoted out of Prerequisites, the SM-N anchors should be authored at the new location, not at the current one)
- T18 "`event.reason` enumeration mixes a normative closed-set claim with deferral to an externally-owned SDK type" — same-cluster (SM-2 is the obligation to demote per the T18 rewrite)
- T17 "Ambiguous post-teardown editor-edit behaviour in the Session model paragraph" — same-cluster (SM-5's prose is the natural home for the disambiguation)
# T20 — Session-model paragraph fuses lifecycle and concurrency content under one anchor

**Kind:** scope
**Importance:** medium
**Atomicity:** composite-2
**Shape:** single
**State:** reduced

## Problem

The paragraph anchored by `<a id="session-model">` in `docs/spec.md` (Orientation › Prerequisites) bundles two topically distinct contracts under one anchor and one continuous prose body: a session-lifecycle half (single-active-session binding, `session_shutdown` reason set, fixed teardown sequence, degraded-state behaviour, unknown-reason routing, session-swap semantics — owned by `spec_topics/pi-integration-contract.md`) and a concurrency-model half (mode-qualified isolation, prompt-mode sequential execution and its four supporting rules, in-session overlap analysis, per-invocation budget scoping, downward-only cancellation propagation — owned by `spec_topics/implementation-notes.md`, `spec_topics/cancellation.md`, `spec_topics/invocation.md`, and `spec_topics/frontmatter.md`). The transition happens mid-paragraph at the sentence beginning *"Concurrent loom invocations within a session carry **mode-qualified** isolation."* with no sub-heading, anchor, or ownership marker signalling the shift. An inbound link to `#session-model` cannot disambiguate which contract it cites, and an editor working on one half must read the whole paragraph to avoid bleeding into the other.

## Solution approach

Split the paragraph anchored by `id="session-model"` in `docs/spec.md` into two sibling paragraphs at the existing sentence boundary beginning *"Concurrent loom invocations within a session…"*, keeping both under the existing Session model surface in Orientation. Add a stable HTML anchor on the new concurrency-half paragraph (the anchor name is determined by T22's resolution of the `#concurrency-model` naming). Preserve `id="session-model"` on the lifecycle (first) half so existing inbound cross-page references continue to resolve.

## Solution constraints

- Out of scope: the SM-1..SM-8 anchor decomposition owned by T19a–T19c and the selection of the canonical concurrency surface / anchor name owned by T22.
- Concurrency content remains co-located with lifecycle content in `docs/spec.md`; do not relocate the concurrency half out of the orientation file.

## Relationships

- T21 "Session model paragraph lives under 'Prerequisites' but is not a prerequisite" — same-cluster (same paragraph; placement is independent of the lifecycle/concurrency split and can be applied to either output of this fix)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — must-follow (a 2-way split here is the first cut of T19's 8-way decomposition; doing this first gives that decomposition a stable boundary; T19 was split — point at the scope-bounding first child)
- T22 "Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose" — must-follow (selects which surface is the canonical concurrency aggregator; resolving it before this finding determines the anchor naming)
- T17 "Ambiguous post-teardown editor-edit behaviour in the Session model paragraph" — same-cluster (lifecycle half)
# T21 — Session model paragraph lives under "Prerequisites" but is not a prerequisite

**Kind:** placement
**Importance:** medium-low
**Atomicity:** composite-2
**Shape:** single
**State:** reduced

## Problem

In `docs/spec.md`'s `## Orientation`, the `<a id="session-model"></a>` *Session model.* paragraph sits inside `### Prerequisites` as a third loose paragraph after the Host runtime bullet group and the engine-level-assumptions paragraph. Prerequisites enumerates what the host must supply before the runtime can load (Pi SDK pins, Node floor, `AbortSignal`/`AbortController` shape, named SDK capabilities); the Session model paragraph describes architectural behaviour (session-binding cardinality, the closed `session_shutdown` reason set, teardown sequence, degraded-state semantics, mode-qualified isolation, in-session concurrency, per-invocation budgets, cancellation propagation), none of which are checked at extension-factory entry. The `### V1 non-goals` trailing paragraph already links back to `[Session model](#session-model)` as "the paragraph above", which only works for a reader who has already scrolled past it, and the Host runtime aggregator's "three host preconditions" framing reads as a complete enumeration so the trailing Session model paragraph appears tacked on.

## Solution approach

Promote the `<a id="session-model"></a>` paragraph out of `### Prerequisites` into a new `### Session model` H3 subsection of `## Orientation`, placed between `### Prerequisites` and `### Scope` so the orientation flow runs Prerequisites → Session model → Scope → V1 non-goals → Reading order. Move the `session-model` anchor onto the new heading so existing in-page and cross-page links to `#session-model` continue to resolve. Update the `### V1 non-goals` trailing paragraph's phrase "the [Session model](#session-model) paragraph above" to read "subsection" in place of "paragraph".

## Solution constraints

- Preserve the `session-model` anchor slug verbatim; do not rename it (e.g. to `session-model-subsection`) — topic pages `pi-integration-contract.md`, `cancellation.md`, and `implementation-notes.md` link to `#session-model` and a rename fan-outs across them.
- Out of scope: the internal density / decomposition of the Session model paragraph's body, which is owned by T17, T19a–T19c, T20, and T22 — do not split, decompose, or rewrite paragraph content as part of this move.

## Relationships

- T20 "Session-model paragraph fuses lifecycle and concurrency content under one anchor" — same-cluster (touches the same paragraph but resolves independently — splitting concerns is orthogonal to where the paragraph lives)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — same-cluster (anchor-decomposition on the same paragraph; lands cleanly on top of the promoted subsection; T19 was split — point at the scope-bounding first child)
- T17 "Ambiguous post-teardown editor-edit behaviour in the Session model paragraph" — same-cluster (clarification inside the same paragraph)
- T22 "Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose" — same-cluster (duplication between Session model paragraph and Extension Architecture › Concurrency model bullet; independent of placement)
# T22 — Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose

**Kind:** cruft, naming, placement, scope, traceability
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md`'s Extension Architecture section is a navigational index whose bullets follow `[Page Name](path) — short description`. The `<a id="concurrency-model"></a>` bullet breaks the pattern by embedding a ~500-word concurrency contract inline, near-verbatim duplicated from the Orientation › Session model paragraph (`<a id="session-model"></a>`): identical opening sentence, `(i)`–`(iv)` prompt-mode serialisation list, three-sources-of-overlap analysis, cancellation-propagation sentence, and per-invocation-budget paragraph. Neither copy is marked authoritative and the two anchors do not cross-reference each other, so future edits to one surface will drift independently of the other.

## Solution approach

Rewrite the body of the Extension Architecture › Concurrency model bullet in `docs/spec.md` to match the navigational `[Page Name](path) — short description` shape used by its siblings, with a forward-link to `#session-model` designated as the sole owner of the concurrency contract. Preserve the `<a id="concurrency-model"></a>` anchor in place so existing inbound `#concurrency-model` references continue to resolve.

## Solution constraints

- Out of scope: the `<a id="session-model"></a>` paragraph — owned by T19a–T19c, T20, and T21.
- The rewritten bullet MUST NOT forward-link to `cancellation.md`, `implementation-notes.md`, `invocation.md`, or `pi-integration-contract.md`; every such link already lives inside the Session model paragraph and replicating any of them re-opens the drift surface this fix closes.

## Relationships

- T20 "Session-model paragraph fuses lifecycle and concurrency content under one anchor" — must-precede (that finding proposes splitting the Session model paragraph at exactly the sentence this fix designates as authoritative; resolving the present finding first establishes the Session model paragraph as the sole owner, after which the split is a local edit inside one section)
- T21 "Session model paragraph lives under 'Prerequisites' but is not a prerequisite" — co-resolve (moving the Session model paragraph out of Prerequisites is cleaner once it is the sole owner of the concurrency contract; deferred until after consolidation)
- T19a "Replace session-model paragraph with eight SM-N sub-units" — must-precede (decomposing `#session-model` into `SM-1`…`SM-8` is easier with one canonical body to decompose, not two; T19 was split — point at the scope-bounding first child)
- T16 "Pi SDK identifiers `AgentSession` and `pi.setActiveTools` lack first-use definitional pointers in `spec.md`" — co-resolve (the merged finding flags the bare references appearing in *both* sections; consolidation reduces the fix surface from two sites to one)
# T23a — Replace ~0.72.1 with ~0.74.1 across pi-integration-contract.md (canonical pin + ~27 echoes)

**Kind:** codebase-grounding-broad
**Importance:** blocker
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The single-source-of-truth Pi SDK pin at `docs/spec_topics/pi-integration-contract.md` anchor `#pi-sdk-pin` reads `~0.72.1`, with the literal echoed throughout the same file (~27 occurrences across §*Session-binding contract*, §*Entry capability probe*, §*Patch-skew degradation contract*, §*Pi version bump procedure*, §*Conversation drive — subagent mode*, and others). The installed Pi is `0.74.1`; the `~0.72.1` tilde range does not admit it, so PIC describes a SDK version that contradicts reality and every page-internal echo reinforces the stale literal.

## Solution approach

In `docs/spec_topics/pi-integration-contract.md`, rewrite every `~0.72.1` literal to `~0.74.1` — the canonical pin at anchor `#pi-sdk-pin` and every echo on the same page. A missed echo leaves PIC self-inconsistent and re-opens this finding on the next pass.

## Solution constraints

- Out of scope: the `~0.72.1` literals owned by T23b (`binder.md`), T23c (`diagnostics.md`), T23d (`future-considerations.md`), and T23e (`package.json` peerDependencies).

## Relationships

- T23b "Replace ~0.72.1 with ~0.74.1 in binder.md" — co-resolve (joint bump — land all five literals in the same commit so the canonical pin and every echo move atomically)
- T23c "Replace ~0.72.1 with ~0.74.1 in diagnostics.md (three rows)" — co-resolve (joint bump)
- T23d "Replace ~0.72.1 with ~0.74.1 in future-considerations.md concurrent-sessions bullet" — co-resolve (joint bump)
- T23e "Bump four `@mariozechner/*` peerDependencies in package.json from ~0.72.1 to ~0.74.1" — co-resolve (joint bump)
- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — independent (re-diagnosed 2026-05-26; the prior `must-follow T24a` relationship reflected the rejected framing that this stale-pin sweep depended on a plan leaf existing. The version-string sweep is a mechanical literal edit with no plan-corpus dependency.)
- T03 "`H1` is a plan-corpus identifier leaking into `spec.md` prose" — independent (re-diagnosed 2026-05-26; the prior `same-cluster` framing claimed H1 tests were the enforcement surface for this bump, which entangled the version-string update with the bare-token sweep. They are independent.)
# T23b — Replace ~0.72.1 with ~0.74.1 in binder.md strict-capability paragraph

**Kind:** codebase-grounding-broad
**Importance:** blocker
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/binder.md`'s `<a id="strict-capability-requirement"></a>` paragraph echoes the V1 Pi-SDK pin as `pi-coding-agent ~0.72.1` when describing why the `strictCapable` probe lands on the universal-W branch. The installed Pi is `0.74.1` (the canonical pin on `pi-integration-contract.md` §*Pi SDK pin*), so this binder.md echo is stale against the canonical pin and against the joint bump T23a, T23c, T23d, T23e perform on the other echo sites and on `package.json`.

## Solution approach

Rewrite the `pi-coding-agent ~0.72.1` reference in binder.md's `#strict-capability-requirement` paragraph to `pi-coding-agent ~0.74.1`.

## Solution constraints

- Out of scope: the canonical pin on `pi-integration-contract.md` (T23a), the three `diagnostics.md` rows (T23c), the `future-considerations.md` concurrent-sessions bullet (T23d), and the four `package.json` peerDependencies entries (T23e).
- MUST land in the same commit as T23a, T23c, T23d, T23e (joint atomic version-string update — a single literal echoed across multiple pages must move atomically to avoid corpus self-inconsistency). The prior citation to PIC §*Pi version bump procedure* step 4 is dropped: that procedure is itself in scope of T24a's re-diagnosis, and the joint-commit obligation here stands on its own ground without needing the procedure as authority.

## Relationships

- T23a "Replace ~0.72.1 with ~0.74.1 across pi-integration-contract.md" — co-resolve (joint bump)
- T23c "Replace ~0.72.1 with ~0.74.1 in diagnostics.md (three rows)" — co-resolve (joint bump)
- T23d "Replace ~0.72.1 with ~0.74.1 in future-considerations.md concurrent-sessions bullet" — co-resolve (joint bump)
- T23e "Bump four `@mariozechner/*` peerDependencies in package.json from ~0.72.1 to ~0.74.1" — co-resolve (joint bump)
# T23c — Replace ~0.72.1 with ~0.74.1 in three diagnostics.md rows

**Kind:** codebase-grounding-broad
**Importance:** blocker
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/diagnostics.md` carries the stale tilde range `~0.72.1` in three diagnostic-code rows — `loom/load/host-incompatible` (the `peer-dep-out-of-range` `kind` description), `loom/load/binder-model-not-strict-capable`, and `loom/load/binder-model-strict-capability-unknown` — while the installed Pi is `0.74.1`. These echoes drift from the canonical pin and must move jointly with the sibling bump findings as a single atomic literal update across the corpus.

## Solution approach

In `docs/spec_topics/diagnostics.md`, replace each `~0.72.1` literal in the `loom/load/host-incompatible`, `loom/load/binder-model-not-strict-capable`, and `loom/load/binder-model-strict-capability-unknown` rows with `~0.74.1`.

## Solution constraints

- None.

## Relationships

- T23a "Replace ~0.72.1 with ~0.74.1 across pi-integration-contract.md" — co-resolve (joint bump)
- T23b "Replace ~0.72.1 with ~0.74.1 in binder.md" — co-resolve (joint bump)
- T23d "Replace ~0.72.1 with ~0.74.1 in future-considerations.md concurrent-sessions bullet" — co-resolve (joint bump)
- T23e "Bump four `@mariozechner/*` peerDependencies in package.json from ~0.72.1 to ~0.74.1" — co-resolve (joint bump)
# T23d — Replace ~0.72.1 with ~0.74.1 in future-considerations.md concurrent-sessions bullet

**Kind:** codebase-grounding-broad
**Importance:** blocker
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/future-considerations.md`'s "No concurrent user sessions in the same host process." bullet still cites the V1 Pi-SDK pin as `~0.72.1`, but the installed Pi minor on `main` is `0.74.1`. The stale literal leaves the V1-seam framing for the concurrent-sessions presupposition inconsistent with the canonical pin once the joint bump lands.

## Solution approach

In `docs/spec_topics/future-considerations.md`, in the "No concurrent user sessions in the same host process." bullet, rewrite the `~0.72.1` substring to `~0.74.1`.

## Solution constraints

- None.

## Relationships

- T23a "Replace ~0.72.1 with ~0.74.1 across pi-integration-contract.md" — co-resolve (joint bump)
- T23b "Replace ~0.72.1 with ~0.74.1 in binder.md" — co-resolve (joint bump)
- T23c "Replace ~0.72.1 with ~0.74.1 in diagnostics.md (three rows)" — co-resolve (joint bump)
- T23e "Bump four `@mariozechner/*` peerDependencies in package.json from ~0.72.1 to ~0.74.1" — co-resolve (joint bump)
# T23e — Bump four `@mariozechner/*` peerDependencies in package.json from ~0.72.1 to ~0.74.1

**Kind:** codebase-grounding-broad
**Importance:** blocker
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

`package.json`'s `peerDependencies` block pins the four `@mariozechner/*` packages (`pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`) at `~0.72.1`, but the installed Pi is `0.74.1`, which the tilde range does not admit. Until the manifest is bumped jointly with the spec literals owned by T23a–T23d, `npm install` against `main` cannot satisfy the pin, and the runtime's peer-dep capability check refuses to load every loom with `loom/host/host-incompatible`. All four entries MUST move together in the same commit as the spec-literal updates.

## Solution approach

Bump the four `@mariozechner/*` `peerDependencies` entries (`pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`) in `package.json` from `~0.72.1` to `~0.74.1`.

## Solution constraints

- Out of scope: the `typebox` peer-dep entry, which remains `"*"` per PIC §*`typebox` (the fifth Pi-bundled package)*.

## Relationships

- T23a "Replace ~0.72.1 with ~0.74.1 across pi-integration-contract.md" — co-resolve (joint bump)
- T23b "Replace ~0.72.1 with ~0.74.1 in binder.md" — co-resolve (joint bump)
- T23c "Replace ~0.72.1 with ~0.74.1 in diagnostics.md (three rows)" — co-resolve (joint bump)
- T23d "Replace ~0.72.1 with ~0.74.1 in future-considerations.md concurrent-sessions bullet" — co-resolve (joint bump)
# T24a — Remove `docs/plan_topics/h1-scaffold.md` cross-links from `spec.md` and `pi-integration-contract.md` (corpus-direction violation)

**Kind:** cross-corpus-boundary, cruft, doc-alignment-broad
**Importance:** high
**Shape:** composite — per-paragraph audit, 23 link sites across 2 spec files
**State:** re-diagnosed 2026-05-26 (original framing — "author the missing plan leaf" — rejected; see *Re-diagnosis rationale* below)

## Problem

`docs/spec.md` (2 link sites) and `docs/spec_topics/pi-integration-contract.md` (21 link sites) cross-link `./plan_topics/h1-scaffold.md` / `../plan_topics/h1-scaffold.md` as the normative owner of test-harness wiring, file paths, in-code constant locations, comment grammars, fixture-row shapes, and discriminator literals that the surrounding paragraphs treat as mechanical gates. This inverts the corpus dependency direction: the spec corpus MUST stand on its own so that the plan can be deleted and rebuilt from a given spec without breaking spec content (the same invariant that lets the implementation be deleted and rebuilt from a given spec). The pattern is concrete in PIC's `#sdk-cap-inventory-closure-audit`, `#audit-non-empty-scan-canary`, `#pi-version-bump-procedure` steps 2(a)/2(b)/3/5, `#audit-exemption-mechanism`, the *H1 leaf adoption precondition* paragraph in `#patch-skew-degradation-contract`, and the `#sdk-cap-tool-registration-gating` / `#sdk-capability-inventory` deferrals that name `CAPABILITY_OBLIGATIONS`, `SDK_SURFACE_INVENTORY`, and the `// allow-broad-catch:` / `// allow:` grammars. Each deferral treats a plan leaf as the source of truth for content the spec relies on; together they make the spec corpus uncompilable without a specific plan leaf existing.

Second-order observation: the volume of delegated material (test runner, script names, constant identifiers, fixture file shapes, discriminator string literals) suggests PIC has absorbed a substantial slice of implementation guidance under the label of normative obligation. A clean separation will likely also shrink PIC.

## Solution approach

Audit every occurrence of `plan_topics/h1-scaffold.md` (and bare `H1` / `H1a` token references) in `docs/spec.md` and `docs/spec_topics/pi-integration-contract.md`. For each occurrence, classify the surrounding obligation into one of **four** categories:

1. **Spec-owned semantic obligation already complete in the spec** (e.g. "the runtime MUST refuse to load when the peer-dep range excludes the installed Pi minor", "the seven capability obligations enumerated above MUST all be present on the imported namespace"): keep the obligation, delete the deferral clause and the cross-link. The spec states what; the plan/implementation decides how (which runner, which file, which constant name, which discriminator string) without further spec input.
2. **Pure implementation guidance** (test-runner choice, `package.json` `scripts.test` script name, in-code constant identifiers, fixture file placements, comment-grammar token shape, audit-walker exit-code structure, per-record stdout wire format): delete the paragraph or sentence outright. The spec should not pin these.
3. **Bump-procedure mechanics** (the contributor checklist at `#pi-version-bump-procedure`): the checklist's framing as a contributor procedure that names specific tests, scripts, and constants is itself the defect. Rewrite it as a list of spec-side obligations the contributor must preserve through any bump (peer-dep range update + downstream-prose lock-step under GOV-12; `engines.node` floor equality with the installed Pi minor; capability-presence on the imported namespace; `SessionShutdownEvent['reason']` snapshot consistency), with no naming of the mechanical gates that enforce them.
4. **Genuinely normative content the spec relied on, previously held in the plan** — recover from git and restore into the spec corpus. Where PIC's deferral assumes that a specific contract surface exists (e.g. "the bidirectional `SessionShutdownEvent['reason']` type-equality assertion MUST surface the literal brand string `loom/typecheck/session-shutdown-reason-snapshot` verbatim in the failing `tsc` diagnostic"), the brand string, the bidirectionality requirement, and the typecheck-time surfacing are spec content even though the source-file location of the assertion is not. Where PIC names `SDK_SURFACE_INVENTORY` as the join key for capability/inventory bookkeeping, the *kind-discriminator inventory* (`abortsignal-member`, `namespace-function`, `type-union-snapshot`, `strict-capability-probe`, `api-coverage`, `peer-dep-range`, `load-time-resolution`, `pi-engines-node`, `node-floor`) is a classification of what kinds of contract the runtime makes against the SDK — that classification is spec content; the literal constant name and the source-file path are not. The pre-deletion h1-scaffold.md (recoverable at `git show 657ee76^:docs/plan_topics/h1-scaffold.md`) is the authoritative source for the content shape and obligation wording; classify each candidate fragment by reading the deleted leaf against the surrounding PIC paragraph and asking "would deleting this fragment leave a PIC obligation underspecified?" — if yes, lift the fragment (rewritten to spec-corpus voice) into PIC or into a new spec_topic in the same edit that removes the cross-link.

Apply each classification edit in the same commit as the corresponding link removal; do not leave dangling cross-links pointing at a not-yet-existent plan path. After the audit, both `spec.md` and `pi-integration-contract.md` MUST carry zero references to `plan_topics/h1-scaffold.md` and zero bare `H1` / `H1a` tokens. T03 (the `H1` token in `spec.md`) is the parallel surface for the bare-token sweep.

## Pre-deletion plan-leaf inventory (git-recoverable)

The plan was reset in commit 657ee76 ("pi-loom plan: reset to scaffold + template; clear spec-debt register; remove forensic spec-review docs"). The 25 deleted plan leaves at `657ee76^` are the authoritative source for category-(4) recovery. Per the commit's `--stat` output, the deleted files and line counts:

| Plan leaf | Pre-deletion size | Recovery command |
|---|---|---|
| `h1-scaffold.md` | 56 lines | `git show 657ee76^:docs/plan_topics/h1-scaffold.md` |
| `h2-di-skeleton.md` | 110 lines | `git show 657ee76^:docs/plan_topics/h2-di-skeleton.md` |
| `h3-diagnostics.md` | 23 lines | `git show 657ee76^:docs/plan_topics/h3-diagnostics.md` |
| `h4-extension-shell.md` | 24 lines | `git show 657ee76^:docs/plan_topics/h4-extension-shell.md` |
| `h5-pi-e2e-harness.md` | 16 lines | `git show 657ee76^:docs/plan_topics/h5-pi-e2e-harness.md` |
| `h6-req-ids.md` | 20 lines | `git show 657ee76^:docs/plan_topics/h6-req-ids.md` |
| `m-mvp.md` | 37 lines | `git show 657ee76^:docs/plan_topics/m-mvp.md` |
| `v1-lexer.md` … `v18-cancellation.md` | 27–166 lines each | analogous |

The contributor SHOULD spot-check each git-recovered leaf against the PIC paragraph(s) that cite it before deciding the classification (1) / (2) / (3) / (4) per occurrence.

## Solution constraints

- The corpus rule is asymmetric: the plan corpus is permitted to reference spec topics by anchor (per GOV-10 / GOV-11), and a future plan leaf MAY independently scaffold the H1 horizontal-phase work with a `**Spec**` field citing PIC. This finding does not preclude such a leaf existing; it only requires that the spec corpus does not name it.
- GOV-12 lock-step survives the audit unchanged: where the spec currently asserts "the count is N" against a topic-page enumeration, the integer-count gate's deferral to "the plan corpus" as the normative source of the gate's failure surface (per `governance.md`) is the established pattern and is NOT in scope of this finding — that wording defers to the plan corpus generically rather than naming a specific plan file or leaf, and is treated as a permitted abstraction barrier.
- Out of scope: `docs/plan_topics/conventions.md`'s `H1`-`Hn` / `M` / `V1`-`Vn` reservation — the plan corpus is permitted to coin and own these identifiers.
- Out of scope: T03's three bare-`H1` token rewrites in `spec.md` (co-resolve in the same pass).
- Out of scope: T23a–T23e's stale-`~0.72.1`-literal sweep — those are mechanical version-string updates that commute with this finding and need not wait for it.

## Re-diagnosis rationale

The original framing of T24 (split across T24a–T24h and T24j) treated the missing `docs/plan_topics/h1-scaffold.md` leaf as the defect and proposed authoring it. That framing accepts the spec→plan cross-references as legitimate and accommodates them. It is rejected because:

- The corpus rule requires that the spec stand independent of any particular plan. A reader must be able to delete `docs/plan_topics/**` entirely and find no broken references in the spec corpus; the original solution would make plan-leaf existence a precondition of spec correctness.
- The leaf-side content the original T24a–T24h proposed pinning (npm test wiring, `SDK_SURFACE_INVENTORY` shape, `engines.node` literal-read test, `CAPABILITY_OBLIGATIONS` constant location, comment grammars, fixture file shapes, audit harness wiring) is uniformly implementation detail. The plan can be rebuilt with a different runner, different file paths, different constant names, and different discriminator strings without invalidating any spec obligation; pinning these in the plan because the spec demands them locks the implementation into a specific shape the spec has no business mandating.
- T24j (the plan-index entry pointing at the new leaf) and T24b–T24h (the sub-section pins) were downstream consequences of the inversion and have been deleted from this triage; the IDs are not reused.

## Relationships

- T03 "`H1` is a plan-corpus identifier leaking into `spec.md` prose" — co-resolve (same corpus-direction defect; T03 sweeps the bare `H1` tokens, this finding sweeps the link-form `plan_topics/h1-scaffold.md` references)
- T23a–T23e "Replace ~0.72.1 with ~0.74.1 …" — independent (the stale-pin sweep is a mechanical version-string update unrelated to corpus boundaries; the original `must-follow T24a` relationship lines on T23a–T23e were a consequence of the bad diagnosis and have been dropped)
- T16 "Pi SDK identifiers `AgentSession` and `pi.setActiveTools` lack first-use definitional pointers in `spec.md`" — same-cluster (both concern PIC's Pi-surface obligations; T16's resolution stays within the spec corpus, but the bump-procedure rewrite in step (3) above SHOULD double-check that any T16 cross-link landing in the same pass also stays within `spec_topics/`)
# T25 — Bare plan-leaf-ID tokens scatter across `spec_topics/` (`H1`, `V18s`, `V14a`, `V16h`, `V3a`, `V5h`, `V6i`, `V6k`, `V12a`, `V14q`, `V15c`, `V18q`, `MVP`)

**Kind:** cross-corpus-boundary, naming
**Importance:** high
**Shape:** composite — per-token sweep, ~117 occurrences across ≥5 spec_topics files
**State:** new 2026-05-26 (corpus-direction audit follow-up to T03 / T24a)

## Problem

`docs/plan_topics/conventions.md` reserves `H1`–`Hn`, `M`, and `V1`–`Vn` (with their leaf forms) as plan-corpus phase / leaf identifiers. The same identifiers leak into the spec corpus as bare tokens in `docs/spec_topics/*.md` prose, naming the plan leaves the spec is "implemented by" or "verified by". Concretely:

- `H1` — 102 occurrences in `spec_topics/` (chiefly `pi-integration-contract.md`), plus 3 in `spec.md` already covered by T03; the T25 sweep is the `spec_topics/` complement.
- `V18s` — 5 occurrences (`diagnostics.md`'s Closure / Category-2 boundary / Category-8 prefix-suffix anchoring paragraphs, plus the `pinned-constant-unreadable` carve-out, plus the `v18-cancellation.md` deep link addressed by T26).
- `V14a` — 2 occurrences (`diagnostics.md`'s `<uuid>` / `<invocation-id>` rendering convention; the `reload-teardown-timeout` row's `<invocation-id>` recipe).
- `V16h` — 2 occurrences (`pi-integration-contract.md`'s bump-procedure step 6 *Re-validate the provider seed-field table* — the fixture-name `V16h provider seed-field fixtures` appears twice in that paragraph).
- `V3a`, `V12a` — single occurrences each (`frontmatter.md`'s `mode:` paragraph: "every load-phase enforcement point (the MVP slash-handler, V3a frontmatter parsing, V12a subagent spawn)").
- `V5h` — single occurrence (`pi-integration-contract.md` provider-error mapping: "V5h provider-error fixtures").
- `V6i` — single occurrence (`query.md` typed-query example: "V6i's typed-query test suite").
- `V6k` — single occurrence (`pi-integration-contract.md` `masked` predicate: "per V6k").
- `V14q` — single occurrence (`future-considerations.md`: "the V14q test matrix gains a parallel `.md` subagent fixture").
- `V15c` — single occurrence (`type-system.md` variant-to-union row: "the V15c 'narrower callee under wider annotation' case").
- `V18q` — single occurrence (`query.md`: "V18q's `RuntimeEvent`-shape conformance test").
- `MVP` — single occurrence (`frontmatter.md`'s `mode:` paragraph alongside V3a / V12a).

Each occurrence names a specific plan leaf as the verifier or implementer of the surrounding spec content. The spec MUST stand independent of any particular plan: a reader who deletes `docs/plan_topics/**` and rebuilds the plan from scratch must find no broken references in `spec_topics/`, and a plan author who renames or splits a leaf MUST NOT thereby invalidate the spec corpus. T03 addresses the `H1`-in-`spec.md` slice; T25 sweeps the remaining ~114 occurrences across `spec_topics/`.

## Solution approach

Audit every bare plan-leaf-ID token in `docs/spec_topics/*.md` (`H1`, `H1a`-`H1n`, `M`, `Ma`-`Mn`, and any `V` followed by digits and a lowercase letter — including `MVP`). For each occurrence, classify the surrounding obligation per T24a's *four-way* classification (see T24a *Solution approach* and *Pre-deletion plan-leaf inventory* for the recovery procedure) and rewrite accordingly:

1. **Spec-owned semantic obligation** with the plan-leaf ID as the "verified by" naming — drop the leaf-ID naming, state the obligation in spec terms. For example, `diagnostics.md`'s "Boundary-condition test vectors are mandatory for the V18s closing CI gate" becomes "Boundary-condition test vectors are required at the 80/81 code-point boundary"; the existence and identity of the verifying gate is an implementation concern.
2. **Pure implementation guidance** dressed as a spec obligation (e.g. `frontmatter.md`'s "every load-phase enforcement point (the MVP slash-handler, V3a frontmatter parsing, V12a subagent spawn) converge on the same diagnostic" — naming three specific plan leaves as the enforcement points): rewrite to name the enforcement *surfaces* in spec terms (slash-command entry, frontmatter parsing, subagent spawn), not the plan leaves that implement them.
3. **Fixture / test-suite citations** (`V5h provider-error fixtures`, `V6i typed-query test suite`, `V16h provider seed-field fixtures`, `V18q RuntimeEvent-shape conformance test`, `V14q test matrix`, `V15c "narrower callee under wider annotation" case`): drop the leaf-ID prefix; the fixture / test concept can be named without claiming a plan-side owner. Where the citation's only purpose is to claim "tests exist", delete it.
4. **Genuinely normative content the spec relied on, previously held in the plan** — recover from git per T24a's *Pre-deletion plan-leaf inventory*. The clearest candidate in this finding's scope is the `V14a` *naming convention* reference in `diagnostics.md` (`<uuid>` / `<invocation-id>` rendered "in canonical lowercase 8-4-4-4-12 hex form per the convention pinned in V14a"; the same row also stamps the `<invocation-id>` recipe in `reload-teardown-timeout`'s rendering rule, which inherits the convention by transitivity). The hex-form convention is spec content; deleting "per V14a" without restoring the convention orphans the rendering rule. Recover the convention from `git show 657ee76^:docs/plan_topics/v14-tool-calls.md` and lift it into `diagnostics.md` inline (or, if it has cross-topic relevance, into `spec_topics/lexical.md` next to the existing identifier-form rules). The `V18s closing CI gate` references in `diagnostics.md` (placeholder-closure property, Category-2 boundary-condition test vectors, Category-8 prefix/suffix anchoring) similarly need a category-(1) / category-(4) split: the closure obligations themselves are spec content (already pinned in `diagnostics.md`); the *gate's existence as a closure-enforcement mechanism* may carry obligations the spec relied on (e.g. the prohibition on strict-equality assertions against §8-placeholder rows) — spot-check `git show 657ee76^:docs/plan_topics/v18-cancellation.md` for whether the closing-gate definition carries normative content beyond "the gate exists".

After the sweep, `docs/spec_topics/*.md` MUST carry zero matches for the regex `\b(H[1-9][0-9]*[a-z]?|M[a-z]?|V[1-9][0-9]*[a-z])\b` (with the `V1` / `V1.0` / `V1.x` loom-release usages on `Vn.m` form excluded by the trailing-letter requirement, mirroring T02's separation). Where a category-(4) recovery lands, the recovered content carries no leaf-ID token — the convention or contract surface is spec content authored at the spec-corpus voice level, not a back-pointer to the recovery-source plan leaf.

## Solution constraints

- Out of scope: `docs/spec.md` `H1` tokens (owned by T03) and the link-form `plan_topics/h1-scaffold.md` references (owned by T24a).
- Out of scope: `docs/plan_topics/conventions.md`'s reservation of these ID spaces — the plan corpus is permitted to coin and own them.
- Out of scope: spec-corpus `V1` / `V1.0` / `V1.x` usages in the loom-release sense (per T02's separation).
- The `V14a` convention reference is *not* satisfied by simply deleting "per V14a": the surrounding sentence relies on the convention being defined somewhere. The fix MUST either inline the canonical-lowercase 8-4-4-4-12 hex-form definition into `diagnostics.md` or relocate it to an appropriate spec_topic — leaving the convention undefined is a regression.

## Relationships

- T03 "`H1` is a plan-corpus identifier leaking into `spec.md` prose" — co-resolve (same defect class on the `spec.md` slice; this finding sweeps the `spec_topics/` complement)
- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — co-resolve (the `H1` token sweep on `pi-integration-contract.md` and the link-form sweep on the same file are most cheaply done together; classification of each `H1` occurrence may also subsume the adjacent link-form classification under T24a)
- T02 "`V1` collides between plan-phase IDs and the loom-release name" — same-cluster (T02 renames the plan-side `V1`-`Vn` reservation to free up the namespace; this finding removes spec-side references to the plan-side `V` namespace regardless of what T02 renames it to)
- T26 "Narrative spec→plan deferrals and the `v18-cancellation.md` cross-link in `spec_topics/`" — co-resolve (some `V18s` token sites adjoin the `v18-cancellation.md` link site T26 owns; sweep them together)
- T27 "`governance.md` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / 'specified in the plan corpus' deferrals)" — same-cluster (parallel corpus-direction defect at higher structural level)
# T26 — Narrative spec→plan deferrals and `v18-cancellation.md` cross-link in `spec_topics/`

**Kind:** cross-corpus-boundary, doc-alignment-broad
**Importance:** high
**Shape:** composite — 1 explicit link site + 7 narrative deferrals across 2 files
**State:** new 2026-05-26 (corpus-direction audit follow-up to T24a)

## Problem

T24a sweeps `plan_topics/h1-scaffold.md` cross-links from `docs/spec.md` and `docs/spec_topics/pi-integration-contract.md`. A parallel sweep on the same corpus-direction rule turns up further spec→plan references not in T24a's scope:

**Explicit cross-link to a different plan file (`v18-cancellation.md`):**

- `docs/spec_topics/diagnostics.md:77` — the *Closure* paragraph carries `[V18s — Coverage-matrix closing CI gate](../plan_topics/v18-cancellation.md#v18s-coverage-matrix-closing-ci-gate)` as the gate enforcing the placeholder-closure property. The link makes the spec depend on a specific plan file existing at a specific path with a specific anchor.

**Narrative "plan corpus" / "plan leaves" / "plan-side" deferrals in `pi-integration-contract.md`:**

- Line 120 (*Unknown-reason rule* sub-anchor paragraph): the parenthetical "(plus the plan corpus where it cites the same anchor)" inside the inbound-reference-sweep definition.
- Line 125 (*H1 leaf adoption precondition* — partially in T24a's scope): the trailing sentence "if `h1-scaffold.md` has not yet enumerated the four obligations at any given point, that gap is a known-open plan-side delta tracked outside this spec-level contract (and outside this inner review loop)" frames a plan-side process as a spec concern.
- Line 204 (`parameters` row): "loom's respond-repair flow (specified in the plan corpus)".
- Line 242 (Typed queries — two-phase tool-loop): "verified by the tool-call plan leaves in the plan corpus".
- Line 248 (V1 seam — typed-query supported provider set): "and the typed-query-validation and subagent-typed-query plan leaves".
- Line 358 (Conversation drive — subagent mode): "by the subagent-mode plan leaves (specified in the plan corpus) — each row is mechanically asserted by one or more of those leaves".
- Line 795 (Step 0 capability-probe item-5/item-7 verification): "`spec.md` — Orientation — Prerequisites name-links each item back to the obligation here so that plan leaves and tests cite a single anchored source".
- Line 817 (subsection preamble of the bump procedure): "*This subsection is a contributor checklist; the `plan_topics/` links below identify the plan leaves that own the cited build-time assertions.*"

Each of these makes the spec presume a particular plan corpus exists, owns specific responsibilities, and is structured a particular way. None can survive a plan deletion-and-rebuild.

## Solution approach

Treat each occurrence per T24a's *four-way* classification (see T24a *Solution approach* and *Pre-deletion plan-leaf inventory* for the recovery procedure):

1. **Spec-owned semantic obligation** with a plan-corpus deferral that adds nothing to the obligation: delete the deferral. Examples: line 204's "(specified in the plan corpus)" is a back-pointer to *some* plan content with no normative force in PIC; delete the parenthetical. Line 242's "verified by the tool-call plan leaves in the plan corpus" is an assertion that *some* tests exist; delete the clause. Line 358's "by the subagent-mode plan leaves (specified in the plan corpus) — each row is mechanically asserted by one or more of those leaves" frames a plan property; delete the clause and let the spec's own assertion stand.
2. **Cross-link to a specific plan file** (`diagnostics.md:77`): delete the cross-link, retain the closure obligation. The Closure paragraph already states the closure property normatively; the V18s link only names the gate that enforces it, which is implementation. Rewrite "the V18s closing CI gate enforces this closure (see [V18s — …](../plan_topics/v18-cancellation.md#…))" to "this closure is enforced at build time" with no link.
3. **Plan-side process narration** (line 125's "known-open plan-side delta tracked outside this spec-level contract", line 817's subsection-preamble narration): delete the narration. The spec does not need to comment on the state of the plan corpus.
4. **Genuinely normative content the spec relied on, previously held in the plan** — recover from git per T24a's *Pre-deletion plan-leaf inventory*. The candidates most likely to fall into this category from this finding's surface are line 242's "verified by the tool-call plan leaves" (if the tool-call leaves at `git show 657ee76^:docs/plan_topics/v14-tool-calls.md` carried contract surfaces PIC relied on — e.g. specific routing rules between `ModelToolError` and the surrounding query infrastructure), line 248's "typed-query-validation and subagent-typed-query plan leaves" (similarly, `git show 657ee76^:docs/plan_topics/v6-typed-queries.md` and `git show 657ee76^:docs/plan_topics/v12-subagent.md`), and the V18s reference at `diagnostics.md:77` (per the recovery note in T25 item 4). Spot-check each git-recovered leaf against the surrounding PIC paragraph and apply the lift-and-rewrite procedure from T24a item 4. The line-125 "H1 leaf adoption precondition" overlap with T24a is the canonical example: the four fixture-obligation categories named there (`unknown-reason runtime`, `snapshot-only widening`, `narrowing no-regression`, `per-sub-trigger negative-test fixtures`) are spec content that should land in PIC's `#patch-skew-degradation-contract` directly, with their pre-deletion shapes recovered from `git show 657ee76^:docs/plan_topics/h1-scaffold.md`.

After the sweep, both `docs/spec_topics/diagnostics.md` and `docs/spec_topics/pi-integration-contract.md` MUST carry zero matches for `plan_topics/` and zero body-prose matches for the phrases `plan corpus`, `plan leaf`, `plan leaves`, or `plan-side` (the same constraint is the structural twin of T27's `governance.md` sweep, but `governance.md` is governed by T27 not this finding).

## Solution constraints

- Out of scope: `governance.md`'s pervasive "specified in the plan corpus" deferrals (owned by T27 — they raise a different structural question because `governance.md` rules are *about* the plan/spec boundary, not implementation guidance).
- Out of scope: `plan_topics/h1-scaffold.md` cross-links (owned by T24a).
- Out of scope: bare plan-leaf-ID tokens (owned by T25); some `V18s` token references at the `diagnostics.md` link site will be swept by T25 in the same pass.
- The `diagnostics.md` Closure paragraph's normative closure claim ("The eight categories below form the closed V1.0 placeholder-rendering surface") MUST survive intact; only the V18s-naming clause and its cross-link are removed.

## Relationships

- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — co-resolve (parallel sweep; the `pi-integration-contract.md` deferrals listed in line 125 sit inside the *H1 leaf adoption precondition* paragraph T24a is already restructuring, so the two findings touch overlapping prose)
- T25 "Bare plan-leaf-ID tokens scatter across `spec_topics/`" — co-resolve (`diagnostics.md:77` carries both a `V18s` bare token and the `v18-cancellation.md` link; sweep them together)
- T27 "`governance.md` pervasive plan-corpus dependency" — same-cluster (parallel corpus-direction defect; the structural distinction is that `governance.md` rules govern the plan/spec interface itself whereas this finding's surfaces are implementation deferrals)
# T27 — `governance.md` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / "specified in the plan corpus")

**Kind:** cross-corpus-boundary, scope, structural
**Importance:** high
**Shape:** structural — affects ~15 GOV-rule sub-paragraphs across one file
**State:** new 2026-05-26 (corpus-direction audit follow-up; deepest of the three sister findings T25 / T26 / T27)

## Problem

`docs/spec_topics/governance.md` defers normative content to "the plan corpus" pervasively and embeds explicit cross-links into plan files. The phrase "(specified in the plan corpus)" appears ~15 times across GOV-1, GOV-2, GOV-4, GOV-6, GOV-9, GOV-12, and GOV-16 as the deferral pattern for CI-gate failure surfaces (exit codes, per-offence message formats, accumulation semantics, output streams). Two further patterns are sharper:

- **Explicit plan-file cross-links.** GOV-7 *Rename* (line 97) instructs editors to "update every reference to the old filename across `plan.md` and `plan_topics/**.md`; the plan-link CI gate (specified in the plan corpus) enforces this". GOV-10 (line 128) defines a *plan leaf* as "a terminal task in [`plan.md`](../plan.md) (leaf format defined in [`plan_topics/conventions.md`](../plan_topics/conventions.md#leaf-format))" with three explicit links into the plan corpus.
- **Rules *about* plan-leaf shape.** GOV-10 declares that implementers MAY restrict their reading per a plan leaf's `**Spec**` field. GOV-11 declares that "The plan leaf's `**Spec**` field MUST be closed under normative cross-link." Both rules are authored in the spec corpus but describe required properties of the plan corpus. GOV-2 ("The plan's coverage matrix is keyed per REQ-ID, mapping each ID to its closing leaf") similarly asserts a structural property of the plan from inside the spec.

Each pattern violates the corpus-direction rule under different angles. The explicit links are the cleanest case — they straightforwardly break under a plan deletion-and-rebuild. The "specified in the plan corpus" deferrals presume a plan exists and has a particular shape; they are softer but still violate the spec-independence invariant. GOV-10 / GOV-11 / GOV-2 are the deepest case: they are rules that exist primarily to constrain the plan, authored as spec rules.

The deepest case is *not* obviously a defect under one possible reading: an argument exists that the spec is entitled to publish its own consumption interface ("here is what any plan that wants to consume me must offer"), analogous to a library publishing its API. Under that reading GOV-10 and GOV-11 are legitimate. The current wording, however, frames them as governance rules over an assumed-existing plan corpus rather than as a schema the plan must satisfy if it wishes to bind, and the explicit `plan.md` / `plan_topics/conventions.md` links cross the corpus boundary regardless of how the rule's role is framed. The correct disposition needs a structural decision (see *Solution approach* below).

## Solution approach

The fix is not a mechanical sweep — `governance.md` is structurally entangled with the plan corpus in ways the other two findings (T25, T26) are not. Three sub-questions need contributor-side decisions before any edits land:

1. **Per-deferral classification of the ~15 "specified in the plan corpus" occurrences.** For each occurrence, classify per the T24a three-way scheme:
   - **Spec-owned floor obligation that can drop the deferral entirely.** Example: GOV-2's "The coverage-matrix closing CI gate treats any unmapped REQ-ID as a CI failure" is the spec-side obligation; the trailing "The plan corpus is the normative source for the gate's failure surface (exit code, per-offence message format, accumulation semantics, and output stream)" is implementation detail the spec does not need to claim authority over. Delete the trailing sentence.
   - **Spec-owned obligation that benefits from naming the responsible party.** Example: GOV-7 *Rename*'s "update every reference to the old filename across `plan.md` and `plan_topics/**.md`" — the spec needs to say that *something* tracks references to its filenames, but does not need to name the plan-link CI gate or even the plan corpus. Rewrite to "the build SHOULD enforce reference integrity" or similar implementation-neutral wording.
   - **Pure plan-process narration.** Delete outright.

2. **GOV-10 / GOV-11 disposition decision.** Choose between two structural rewrites:
   - **(A) Reframe as schema.** Rewrite GOV-10 / GOV-11 as "*Plan-corpus consumption interface (informative).* If a plan wishes to map REQ-IDs to implementation tasks, it MAY adopt the leaf-format / `Spec` / `Tests` / `Deps` shape sketched below; nothing in `spec_topics/` depends on this shape, and a plan adopting a different shape is permitted." Move the specific field names, closure rules, and reading-scope guidance to a non-normative appendix or to a separate `plan_topics/`-side document the plan-corpus author maintains, with no link from the spec to the plan side. The spec then publishes a *capability* (REQ-IDs are stable and citable) without requiring any particular consumer.
   - **(B) Delete GOV-10 and GOV-11 outright.** The implementer-reading-scope optimisation GOV-10 enables is a plan-corpus convenience, not a spec-corpus obligation; if the plan corpus wants to define a `Spec` field with closure properties, the plan corpus can do so in `plan_topics/conventions.md` without the spec mediating. GOV-11's closure obligation belongs in `plan_topics/conventions.md` under the same logic. Both rules are unnecessary in the spec corpus once the deferrals in (1) are cleaned up.

   Option (B) is cleaner; option (A) preserves the existing optimisation but adds a layer of indirection. The choice is a contributor judgement on whether the implementer-reading-scope optimisation is worth retaining a published schema for.

3. **GOV-2 coverage-matrix-existence claim.** GOV-2's first sentence ("The plan's coverage matrix is keyed per REQ-ID, mapping each ID to its closing leaf") asserts that a coverage matrix exists in the plan. Rewrite as a spec-side capability statement: "REQ-IDs are stable, citable identifiers; a downstream consumer MAY build a coverage map keyed by REQ-ID." The "closing CI gate" obligation downstream of this sentence is then either reframed as "any such map SHOULD treat unmapped REQ-IDs as failures" or deleted under disposition (1).

4. **`Audience` paragraph (governance.md:3).** The opening *Audience* paragraph names "the coverage-matrix closing CI gate (specified in the plan corpus)" twice as a primary audience. Rewrite to name the consumer in spec-corpus-neutral terms ("automated tooling that maps REQ-IDs to implementation work") so the audience claim does not depend on the plan corpus existing.

5. **Category-(4) recovery on the deferral cluster.** Most of `governance.md`'s "specified in the plan corpus" deferrals point at CI-gate *failure surface* definitions (exit code, per-offence message format, accumulation semantics, output stream) that the deleted `h6-req-ids.md` plan leaf (recoverable at `git show 657ee76^:docs/plan_topics/h6-req-ids.md`) almost certainly held in full. Spot-check the recovered leaf against each GOV-N deferral: where the recovered content is a uniform CI-output schema that several gates share, lift it into a single `## Failure-surface conventions` sub-section of `governance.md` (with each gate referencing the shared schema rather than deferring outward to the plan corpus); where the recovered content is gate-specific, inline it into the GOV-N paragraph that owns the gate. The recovered convention itself is spec content under category (4); the *concrete file path of any future implementation* of the gate remains implementation detail under category (2).

After these edits, `docs/spec_topics/governance.md` MUST carry zero occurrences of the phrases "specified in the plan corpus", "plan corpus", "plan leaf", "plan-side", and zero links to `../plan.md` or `../plan_topics/**`.

## Solution constraints

- Out of scope: the plan corpus itself — `plan.md` and `plan_topics/conventions.md` may need parallel edits if option (A) is chosen for GOV-10 / GOV-11 (moving the leaf-format definition there) or under option (B) (taking ownership of the closure rule). Those plan-side edits are downstream of this finding's resolution and are not in scope.
- Cross-corpus REQ-ID stability is a spec-corpus obligation and survives unchanged. GOV-1 / GOV-3 / GOV-4 / GOV-5 / GOV-6 / GOV-7 / GOV-8 / GOV-9 / GOV-12 / GOV-14 / GOV-15 / GOV-16 retain their normative force; only the deferral / cross-link sub-clauses inside each rule are edited.
- The structural decision on GOV-10 / GOV-11 (option A vs option B) MUST be recorded explicitly in the resolution commit so future readers can trace why the rules look the way they do.
- This finding is harder to mechanise than T25 / T26: the audit of which deferrals are pure-narration vs which are spec-owned-with-bad-wording requires per-rule judgement. Expect the resolution to land in multiple commits, one per rule cluster (GOV-1 anchor pass, GOV-2 / GOV-6 / GOV-12 floor obligations, GOV-7 rename mechanics, GOV-9 cross-link form, GOV-10 / GOV-11 disposition, GOV-16 inline-label backfill).

## Relationships

- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — same-cluster (T24a carved out `governance.md`'s "specified in the plan corpus" deferrals as a "permitted abstraction barrier"; this finding revisits that carve-out under the stricter reading and concludes the carve-out cannot be sustained without structural rework)
- T25 "Bare plan-leaf-ID tokens scatter across `spec_topics/`" — same-cluster (parallel corpus-direction defect; T25's resolution is mechanical, this one requires structural decisions)
- T26 "Narrative spec→plan deferrals and `v18-cancellation.md` cross-link" — same-cluster (parallel surface-level case of the same defect class T27 addresses at the structural level)
- T02 "`V1` collides between plan-phase IDs and the loom-release name" — same-cluster (T02's resolution renames a plan-corpus identifier; this finding asks whether the spec corpus should be authoring rules about the plan corpus at all, which would moot T02's coordination question for any future identifier collision)
