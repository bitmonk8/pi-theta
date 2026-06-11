# Triaged Plan Review — plan

_Generated: 2026-06-11T03:55:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T44) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 6 medium retained; 39 low discarded; 0 low findings merged into 0 medium findings; 16 NIT dropped; 0 false dropped._

---

# T01 — "Release gate" is a fourth top-level section outside the three-category phase taxonomy

**Original heading:** §"Release gate" section heading
**Original section:** Consolidated Plan Review — plan
**Kind:** naming
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`conventions.md` opens by declaring exactly three kinds of phase — Horizontal, MVP, and Vertical slices — and `plan.md`'s own "How to use this plan" step 1 restates that "three phase categories (horizontal / MVP / vertical)" taxonomy. `plan.md` then lays out four top-level phase sections: `## Horizontal phases`, `## MVP phase`, `## Vertical slices`, and `## Release gate`. The fourth, `## Release gate`, is not one of the three declared categories.

Both leaves under `## Release gate` — `H5b` and `H6a` — carry the `H<n><letter>` ID form that `conventions.md` reserves for horizontal leaves, and both cite a **Convention.** field rather than a **Spec.** field, the defining marker of a horizontal leaf. They are therefore horizontal leaves housed under a heading that the phase taxonomy does not name, while the sibling horizontal leaves `H1a`–`H5a`/`H7a` sit under `## Horizontal phases`.

"How to use this plan" step 2 instructs a contributor authoring a new leaf to "link the new leaf into the appropriate section below." A contributor adding a terminal/release-time horizontal leaf has no rule telling them whether it belongs under `## Horizontal phases` or `## Release gate`, because the document never states that `## Release gate` is an editorial sub-grouping of horizontal leaves rather than a distinct fourth category.

## Plan Documents

- `docs/plan.md` — `## Release gate` / `## Horizontal phases` headings (edited)
- `docs/plan_topics/conventions.md` — "Three kinds of phase" intro (edited)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal phases

**Leaves (implementation order):**

- `H5b` — Warn-only live-corpus canary (pre-activation pre-flight) — (resequenced)
- `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate) — (resequenced)

## Consequence

**Severity:** advisory

A contributor adding a release-time horizontal leaf cannot mechanically decide whether to file it under `## Horizontal phases` or `## Release gate` (How-to-use step 2), so the plan's section structure drifts as different authors guess differently. Implementers can still produce a working leaf; the gap is navigational, not blocking.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 5353dd7 — pi-loom plan: resolve "Release-gate activation has no owning leaf" (2026-06-10, Thomas Andersen)
**History:** `conventions.md`'s three-category phase taxonomy predates the defect. Commit 5353dd7 created the new `## Release gate` top-level heading in `plan.md` (initially housing only `H6a`) while resolving the earlier "Release-gate activation has no owning leaf" finding; that fix introduced a fourth top-level section outside the declared taxonomy rather than placing the new horizontal leaf under `## Horizontal phases`. A later commit (ea6b1da, 2026-06-11) added `H5b` under the same heading, compounding but not introducing the mismatch.

## Solution Space

**Shape:** single

### Recommendation

Keep `## Release gate` where it is and mark it explicitly as an editorial sub-grouping of horizontal leaves so it reads as a presentation choice, not a fourth category. In `docs/plan.md`, change the heading to `## Release gate (horizontal)` (or add a one-line lead sentence under it stating that the release-gate leaves are horizontal leaves and this is an editorial sub-grouping of the Horizontal phases above). In `docs/plan_topics/conventions.md`, add a one-line note to the "Three kinds of phase" intro acknowledging that horizontal leaves may be presented under editorial sub-headings (such as a release-gate grouping) without forming a new category.

The `conventions.md` note must state that the sub-grouping does not create a new leaf-ID prefix or a new `Convention.`/`Spec.` rule — release-gate leaves remain horizontal leaves in every other respect. This preserves the `## Release gate` anchor that other findings' relocation fixes target.

## Relationships

None

---

# T02 — Transitive-completeness plan-maintenance obligation is invisible at the point of leaf authoring

**Original heading:** REQ-ID discipline → *Transitive-completeness plan-maintenance* — misplaced plan-authoring obligation
**Original section:** Consolidated Plan Review — plan
**Kind:** placement
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`conventions.md` §REQ-ID discipline ends with a *Transitive-completeness plan-maintenance* clause: "Whenever a new leaf is added that can introduce an executable REQ-ID, a numbered-REQ-ID citing test, or an un-anchored normative MUST, that leaf MUST be added to `H5b`'s `Deps.`". This is a **plan-authoring** obligation — it governs what an author must do when creating a new leaf — yet it is buried at the tail of a long cross-cutting rule that otherwise describes runtime-code and closing-gate behaviour.

A contributor creating a new leaf follows `plan.md` §How to use (step 2: copy `leaf-template.md`, save, link into a section; step 3: pick the next leaf and read its Spec topics) and the `conventions.md` §Leaf format field definitions. None of those surfaces — the natural reading path at leaf-creation time — mentions the H5b-`Deps` obligation or cross-references it. The obligation is therefore not discoverable at the moment it must be honoured, so the maintenance step is easy to omit.

## Plan Documents

- `docs/plan.md` — §How to use (step 2) (edited)
- `docs/plan_topics/conventions.md` — §Leaf format (`Deps.` field) / §REQ-ID discipline (edited)

## Spec Documents

None

## Affected Leaves

**Phases:** None

**Leaves (implementation order):** None

The fix is confined to cross-cutting plan prose (`conventions.md` and `plan.md` §How to use). `H5b` and `H6a` are referenced read-only; no leaf's `Deps`, acceptance criteria, or sequencing changes.

## Consequence

**Severity:** advisory

A contributor authoring a new coverage-producing leaf reads the How-to-use steps and the Leaf-format field definitions, neither of which names the H5b-`Deps` obligation, so a new leaf can be added without appending it to `H5b`'s `Deps.`. By the rule's own text the warn-only canary then pre-flights — and the `H6a` release gate activates — against incomplete coverage.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 37733fd — pi-loom plan: resolve "H6a transitive-completeness rule parked in Deps, not conventions" (2026-06-11, Thomas Andersen)
**History:** Commit 37733fd relocated the transitive-completeness rule out of `H6a`'s `Deps.` and into `conventions.md` §REQ-ID discipline. The relocation placed the clause at the tail of the REQ-ID discipline cross-cutting rule rather than on the leaf-authoring path (`plan.md` §How to use / §Leaf format), introducing the discoverability gap; the clause did not exist in conventions.md before that commit.

## Solution Space

**Shape:** single

### Recommendation

Make the existing obligation discoverable at the leaf-authoring path by adding a cross-reference to it, while leaving its normative statement where it currently sits (so the rule is stated once and only pointed to).

- In `docs/plan.md` §How to use step 2 (the step that creates and links a new leaf), append a sentence naming the obligation concretely, e.g.: "If the new leaf can introduce an executable REQ-ID, a numbered-REQ-ID citing test, or an un-anchored normative MUST, add it to [`H5b`](./plan_topics/H5b-warn-only-canary.md)'s `Deps.` per [`conventions.md`](./plan_topics/conventions.md) §REQ-ID discipline (*Transitive-completeness plan-maintenance*)."
- Optionally also add a one-line pointer to the same obligation in `docs/plan_topics/conventions.md` §Leaf format under the `Deps.` field definition, since that field is the one the obligation modifies.

Keep the full normative clause in §REQ-ID discipline; the added text is a reference, not a second copy of the rule. The reference must name the H5b-`Deps` requirement explicitly rather than a bare "see the REQ-ID discipline rule", so an author who follows only the authoring path still learns the concrete action.

## Relationships

- T04 "Transitive-completeness rule's trigger is broader than H5b's coverage-producing dependency set" — decision-overlap (both edit the same *Transitive-completeness plan-maintenance* clause; reconcile in one edit).

---

# T03 — `H5b` `Deps` uses a non-contiguous range, violating the contiguous-range convention

**Original heading:** `Deps: V1a–V18c` uses a non-contiguous range
**Original section:** Consolidated Plan Review — plan
**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`conventions.md` §*Leaf format* (the `Deps.` field rule) requires: "Cite specific leaf IDs (`V4b`, `V9a–V9e`); never a bare group token (`V4`) … Use ranges where contiguous and comma-separated lists where not." `H5b`'s `**Deps.**` field is `` `H5a`, `M`, `V1a`–`V18c` ``. The single range `V1a`–`V18c` spans 18 slice groups and is **not** a contiguous leaf-ID sequence: there is no `V1c`, no `V2e`, no `V3e`, no `V14b`, no `V16b`, no `V17b`, etc. The endpoints bracket a span riddled with non-existent intermediate IDs, which is exactly the bare-group ambiguity (`V4` ⇒ "every leaf" vs "some subset") the convention forbids — re-expressed as a range.

The intent ("every MVP and vertical implementation leaf") is recoverable from `H5b`'s own parenthetical note, so no implementer is blocked today. The hazard is forward-maintenance: `H5b`'s note states a standing transitive-completeness obligation requiring every newly-added coverage-producing leaf to be appended to this `Deps.` set. A future leaf added "between" `V1a` and `V18c` (e.g. a `V3e`) reads as already inside the range yet must still be appended explicitly, yielding a visually contradictory `…, V3e` tacked onto a range that appears to already contain it — the maintainer cannot tell whether the new leaf is covered.

## Plan Documents

- `docs/plan_topics/H5b-warn-only-canary.md` — `Deps.` field (edited)
- `docs/plan_topics/conventions.md` — §*Leaf format*, `Deps.` field rule (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H5b` — Warn-only live-corpus canary (pre-activation pre-flight) — (modified)

## Consequence

**Severity:** advisory

The Deps notation violates the convention and creates a maintenance hazard: under the standing transitive-completeness obligation, a future coverage-producing leaf added within the `V1a`–`V18c` span must be explicitly appended even though it "falls inside" the range, producing a confusing `V1a–V18c, <new>` form and risking a silently-assumed-covered leaf whose REQ-IDs the canary/closing gate then fails to reconcile.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** ea6b1da — pi-loom plan: resolve "Live-corpus gate activation has no documented rollback" (2026-06-11, Thomas Andersen)
**History:** The `H5b` leaf file was created in ea6b1da with its `**Deps.**` field already carrying the non-contiguous `V1a`–`V18c` range; the canary concept had previously existed only as a recommendation in `docs/plan-review.md` (ffa2d9a). The one later commit touching the file (37733fd) left the Deps notation unchanged, so the defect has been present since the leaf's inception.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H5b-warn-only-canary.md`, replace the `**Deps.**` field value `` `H5a`, `M`, `V1a`–`V18c` `` with comma-separated entries where each range covers only a contiguous run of existing leaf IDs. The concrete value, matching the leaves that exist under `docs/plan_topics/`:

```
**Deps.** `H5a`, `M`, `V1a`–`V1b`, `V2a`–`V2d`, `V3a`–`V3d`, `V4a`–`V4e`, `V5a`–`V5e`, `V6a`–`V6e`, `V7a`–`V7c`, `V8a`–`V8b`, `V9a`–`V9j`, `V10a`–`V10c`, `V11a`–`V11f`, `V12a`–`V12b`, `V13a`–`V13d`, `V14a`, `V15a`–`V15c`, `V16a`, `V17a`, `V18a`–`V18c`
```

Each sub-range above is contiguous (no gaps); singleton groups (`V14a`, `V16a`, `V17a`) are listed bare. The only binding requirement is that every emitted range be a gapless run of real leaf IDs — re-verify against the current `docs/plan_topics/` listing at fix time, since the leaf set may have changed.

Edge case: the leaf's parenthetical note also reads "(`V1a`–`V18c`)" as descriptive prose. Aligning that prose shorthand is optional and outside the binding `Deps.` rule; if touched, keep it consistent with the field rather than re-introducing the non-contiguous range.

## Relationships

- T04 "Transitive-completeness rule's trigger is broader than H5b's coverage-producing dependency set" — same-cluster (touches `H5b`'s `Deps`/coverage-producing set; resolves independently of the notation fix).
- T39 "H6a consumes H7a's golden artifacts but no dependency edge orders H7a before H6a" — same-cluster (cites `H5b`'s `Deps` list).

---

# T04 — Transitive-completeness rule's trigger is broader than H5b's coverage-producing dependency set

**Original heading:** Transitive-completeness rule vs H5b's declared/scoped set disagree on H7a
**Original section:** Consolidated Plan Review — plan
**Kind:** consistency
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The *Transitive-completeness plan-maintenance* rule in `conventions.md` (under *REQ-ID discipline*) names three triggers for forcing a new leaf into `H5b`'s `Deps.`: a leaf that can introduce "an executable REQ-ID, a numbered-REQ-ID citing test, or an un-anchored normative MUST." The second trigger is phrased without qualification — any leaf carrying a test that cites a numbered `PREFIX-N` REQ-ID literally satisfies it.

`H7a`'s third **Tests** bullet drives a co-occurring ceiling breach and asserts arbitration "in `CIO-5` order," citing the numbered REQ-ID `CIO-5` inline. By the rule's literal text, `H7a` therefore MUST appear in `H5b`'s `Deps.` — yet it does not, and `H5b`'s own note scopes the dependency set to "every MVP and vertical implementation leaf (`V1a`–`V18c`)," which excludes horizontal `H7a` by construction. The rule (literal trigger) and the declared/scoped set (the `V1a`–`V18c` note) disagree about whether a leaf that merely *re-cites* an already-mapped REQ-ID belongs in the canary's coverage-producing set.

The note's exclusion is the substantively correct one: `H7a` "closes no new spec REQ-ID" (its own `Adds.`), and `CIO-1 … CIO-6` close in `V16a` per `coverage-matrix.md`. `V16a` is already inside the `V1a`–`V18c` range, so the warn-only canary — sequenced after `V16a` — already reconciles `CIO-5`'s closing citing test. `H7a`'s re-citation contributes nothing the canary depends on. The defect is the rule's trigger phrasing being broader than the canary's actual purpose (coverage-*producing* leaves), so the normative rule text and the scoped set contradict each other on a leaf the plan currently handles correctly.

## Plan Documents

- `docs/plan_topics/conventions.md` — *REQ-ID discipline* → *Transitive-completeness plan-maintenance* (edited)
- `docs/plan_topics/H5b-warn-only-canary.md` — `Deps.` and the coverage-producing-set note (read-only)
- `docs/plan_topics/H7a-integration-acceptance.md` — third **Tests** bullet (the `CIO-5` citing test) (read-only)
- `docs/plan_topics/V16a-ceiling-order-masked.md` — closing leaf for `CIO-1 … CIO-6` (read-only)
- `docs/plan_topics/coverage-matrix.md` — `CIO-1 … CIO-6 → V16a` mapping (read-only)
- `docs/plan.md` — Release gate section prose (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal, Release gate

**Leaves (implementation order):**

- `H7a` — Terminal integration-acceptance run (cross-slice end-to-end gate) — read-only context under the narrow-rule fix
- `H5b` — Warn-only live-corpus canary (pre-activation pre-flight) — (modified)

## Consequence

**Severity:** correctness

The *Transitive-completeness plan-maintenance* rule is the standing maintenance contract that keeps the warn-only canary and the `H6a` release gate sequenced after every coverage-producing leaf. With the rule's second trigger broader than the `V1a`–`V18c` note, two reasonable maintainers diverge: one follows the literal trigger and adds re-citing horizontal leaves like `H7a` to `H5b`'s `Deps.`; one follows the coverage-producing scoping and omits them. The plan's current `Deps.` is correct, but the contract that governs future edits is self-contradictory, so the canary's "transitive completeness" guarantee rests on a membership criterion that is read two different ways.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** ea6b1da — pi-loom plan: resolve "Live-corpus gate activation has no documented rollback" (2026-06-11, Thomas Andersen); 37733fd — pi-loom plan: resolve "H6a transitive-completeness rule parked in Deps, not conventions" (2026-06-11, Thomas Andersen)
**History:** Commit ea6b1da created `H5b` with the coverage-producing-set note scoping the dependency set to MVP/vertical implementation leaves (`V1a`–`V18c`). Commit 37733fd later moved the *Transitive-completeness plan-maintenance* rule into `conventions.md`, phrasing its second trigger as the unqualified "a numbered-REQ-ID citing test" rather than the coverage-producing/closing citing test. The two land in disagreement: the rule's literal trigger admits `H7a`'s pre-existing `CIO-5` re-citing test (added 2026-06-10 in b73a11a), which the `H5b` note's coverage-producing scoping excludes.

## Solution Space

**Shape:** single

### Recommendation

Narrow the rule's second trigger to the coverage-producing/closing citing test. In `conventions.md` *Transitive-completeness plan-maintenance*, qualify the second trigger so it fires only for the citing test that *closes* a `coverage-matrix.md`-mapped REQ-ID — i.e. the leaf the coverage matrix lists as that REQ-ID's closing leaf — rather than any test that cites a numbered REQ-ID. A re-citing test like `H7a`'s `CIO-5` assertion (closed by `V16a`) then does not trigger inclusion.

Edit the `conventions.md` *Transitive-completeness plan-maintenance* sentence's second trigger. The `H5b` note already reads "complete coverage-producing set," so it stays consistent and needs no change. This preserves the plan's current (correct) `Deps.`, aligns the rule with the canary's actual purpose, and adds no redundant dependency.

Keep the three triggers parallel, and ensure the closing-leaf qualifier is grounded in the coverage-matrix mapping so a leaf introducing the *first* citing test for a newly-mapped REQ-ID still triggers inclusion: the qualifier turns on whether the leaf is the REQ-ID's coverage-matrix closing leaf, not on whether the citation is its first occurrence textually.

## Relationships

- T02 "Transitive-completeness plan-maintenance obligation is invisible at the point of leaf authoring" — decision-overlap (both edit the same rule sentence; a wording-narrowing fix here and the discoverability cross-reference there must be reconciled in one edit).
- T03 "`H5b` `Deps` uses a non-contiguous range" — same-cluster (touches `H5b`'s `Deps.` line; resolves independently).

---

# T05 — `frontmatter/` (FRNT) code-keyed obligations have no prefix-area row in the coverage matrix

**Original heading:** `frontmatter/` (FRNT) absent from the code-keyed obligation-area table
**Original section:** Consolidated Plan Review — plan
**Kind:** spec-coverage
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`coverage-matrix.md` §*Code-keyed obligation areas (no numbered REQ-IDs)* gives every comparable non-narrative spec page a prefix-area row mapping the page's `loom/{parse,load,runtime}/*`-keyed obligations to the leaf(s) that close them — `lexical.md` (LEX) / `grammar.md` (GRAM) → `V1a`/`V1b`/`V2a`, `runtime-value-model.md` (RVM) → `V2c`, `expressions.md` (EXPR) → `V3a`, `query/` (QRY) → `V13a–V13d`, `tool-calls.md` (TOOL) → `V14a`/`V13c`, and so on. The `frontmatter/` page family (registered prefix `FRNT` in `governance/req-id-prefix-table-active-a.md`) is the conspicuous omission: it carries exactly one numbered REQ-ID, `FRNT-1` → `V6e` (in the *Numbered REQ-IDs* section), and a single narrow code-keyed row `frontmatter-fields-a.md §model → V6a`. There is no `frontmatter/ (FRNT)` prefix-area row.

`frontmatter-fields-a.md` and `frontmatter-fields-b-and-templates.md` own roughly thirty diagnostic-code obligations across `V6a`–`V6e` (`loom/load/missing-mode`, `unknown-mode-value`, `unknown-frontmatter-field`, `deferred-frontmatter-field`, `unknown-bind-context-value`, `binder-model-not-strict-capable`, `binder-model-strict-capability-unknown`, `params-null`, `bind-echo-without-params`, `argument-hint-not-displayed`, `tool-name-collision`, `invalid-tool-rename`, `frontmatter-value-out-of-range`; `loom/parse/system-on-prompt-mode`, `unresolved-named-type`, `non-trailing-default`, `default-not-literal`, `integer-narrowing`, `invoke-non-loom-extension`, the four `system-interp-*` codes, …) plus the field-contract table's non-code behavioural defaults (`model:` absent → inherit session model; empty/absent `tools:` → empty callable set, no ambient inheritance; `params:` absent → binder does not run). Aside from the single `model-unresolved` row, none of this surface has an explicit closing-leaf trace in the matrix.

The closing gate does not hard-fail on the gap: the code-bearing obligations are reconciled by the separate registry-code↔asserting-test parity arm (`conventions.md` *REQ-ID discipline*), and the behavioural defaults carry no `MUST`/`MUST NOT` token (verified against both pages), so the un-anchored-MUST token scan does not require GOV-22 residue rows for them — they fall to the GOV-15 release-time editorial review. The defect is therefore in the coverage *trace*, not in the leaves (`V6a`–`V6e` already exist and assert the codes): the matrix, which `plan.md` presents as the authoritative spec→plan navigational reference, is inconsistent — every sibling page has a prefix-area row and `frontmatter/` does not, so an auditor cannot confirm from the matrix that the frontmatter code-keyed surface and its table-cell defaults have owning leaves.

## Plan Documents

- `docs/plan_topics/coverage-matrix.md` — §Code-keyed obligation areas (no numbered REQ-IDs) (edited)
- `docs/plan_topics/conventions.md` — *REQ-ID discipline* (code-keyed obligation-area contract) (read-only)
- `docs/plan_topics/V6a-frontmatter-contract.md` — mapping target (read-only)
- `docs/plan_topics/V6b-params-defaults.md` — mapping target (read-only)
- `docs/plan_topics/V6c-tools-set.md` — mapping target (read-only)
- `docs/plan_topics/V6d-system-interpolation.md` — mapping target (read-only)
- `docs/plan_topics/V6e-respond-repair-tool-loop.md` — mapping target (read-only)

## Spec Documents

None — the fix is internal to `coverage-matrix.md`. (`docs/spec_topics/frontmatter/frontmatter-fields-a.md` and `frontmatter-fields-b-and-templates.md` are read-only context: they are the obligation source, not edited.)

## Affected Leaves

**Phases:** None

**Leaves (implementation order):**

None — the fix edits only `coverage-matrix.md`; no leaf's `Adds`/`Tests`/`Deps`/`Ships when` changes. `V6a`–`V6e` appear above as read-only mapping targets, not as modified/blocked leaves.

## Consequence

**Severity:** advisory

An auditor relying on the coverage matrix as the spec→plan traceability reference cannot confirm that the `frontmatter/` code-keyed obligations and the field-contract behavioural defaults have owning leaves, because — alone among comparable non-narrative pages — `frontmatter/` has no prefix-area row. Closure is still real (registry↔test parity closes the codes; editorial review backstops the token-less defaults), so nothing ships unimplemented, but the navigational guarantee the matrix advertises is silently incomplete for one page family.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** `c6a664e` ("pi-loom plan: build/update plan for spec.md + review", 2026-06-10)
**History:** The *Code-keyed obligation areas* table was authored in `c6a664e` with a prefix-area row for every comparable non-narrative page (`lexical.md`/`grammar.md`, `runtime-value-model.md`, `expressions.md`, `query/`, `tool-calls.md`, …) but with no `frontmatter/` (FRNT) row; `FRNT-1` was placed in the *Numbered REQ-IDs* section only (`git show c6a664e:docs/plan_topics/coverage-matrix.md`). A later commit `4088e2e` ("pi-loom plan: resolve \"model/bind_* resolution hooks named in V6a Adds with no closing assertion\"", 2026-06-10) added a single narrow code-keyed row (`frontmatter-fields-a.md §model → V6a`) but did not add the prefix-area row covering the remaining ~30 frontmatter code-keyed obligations or `V6b`–`V6e`. `git log -S "frontmatter/"` / `-S "model-unresolved"` over `coverage-matrix.md` report only `4088e2e`, and the table header traces to `c6a664e`; the prefix-area-row gap has thus existed since the table's inception.

## Solution Space

**Shape:** single

### Recommendation

Add one prefix-area row to the *Code-keyed obligation areas (no numbered REQ-IDs)* table of `docs/plan_topics/coverage-matrix.md`, parallel to the existing sibling rows (e.g. `lexical.md (LEX)`), mapping the `frontmatter/` page family to its closing leaves:

`| `frontmatter/frontmatter-fields-a.md`, `frontmatter-fields-b-and-templates.md` (FRNT) | `V6a`, `V6b`, `V6c`, `V6d`, `V6e` |`

The existing narrow `frontmatter-fields-a.md §model → V6a` (code-keyed; no numbered REQ-ID) row may stay as a per-code precision entry or be subsumed by the new prefix-area row; either keeps the `model-unresolved` trace intact.

Edge cases for the implementer:

- The three non-code behavioural defaults — `model:` absent → session-model inheritance (`V6a`), empty/absent `tools:` → no ambient inheritance (`V6c`), `params:` absent → binder does not run (`V6b`) — carry no `MUST`/`MUST NOT` token and no diagnostic code, so they are **not** GOV-22 un-anchored-MUST residue and the closing gate's token scan does not act on them. If they are traced at all, add them as plain navigational rows naming their owning leaf; do not label them "GOV-22 residue", which would mischaracterise them as gate-enforced. Tracing them is optional (consistent with the matrix's stated residue posture); the prefix-area row above is the load-bearing fix.
- The prefix-area row does not change which obligations the H5a/H6a gate enforces (the code arm is registry↔test parity, independent of the matrix); it restores the matrix's navigational completeness only.

## Relationships

- T42 "Binder system-prompt structure obligations have no coverage-matrix closing-leaf row" — same-cluster (sibling missing-row finding on the same table; resolves independently).
- T41 "V9b / V9c / V9e PIC-area MUSTs are missing from the code-keyed obligation-area table" — same-cluster (sibling missing-row finding on the same table; resolves independently).

---

# T28 — Real-host divergence detectable only by a manual, post-merge smoke — undetected-by-CI window is unbounded

**Original heading:** Real-host divergence detected only manually, post-merge
**Original section:** Consolidated Plan Review — plan
**Kind:** risk
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The Pi-SDK pin is the single shared dependency every runtime leaf binds against, and `V18c` owns the version-bump procedure that moves it. `V18c`'s runtime-evidence acceptance gate runs `H4a`'s end-to-end harness against the bumped pin, but that harness drives the in-process session double — `V18c` itself states "a green double-backed run is not real-host coverage." The only mechanism that can witness a double-vs-real-host divergence is `H4a`'s **manual real-host smoke run**, which `H4a` explicitly frames as the "post-merge detection mechanism."

Because the smoke is manual and post-merge while every automated gate is double-backed, a Pi bump whose new SDK diverges from the double can pass green CI and merge with the divergence undetected. `V18c`'s revert framing compounds the gap: its `Ships when` says the prior pin "is restored before merge" on a confirmed-divergence finding, yet the only finding source is a post-merge smoke — so the restore precondition references a signal that does not exist before merge. The plan acknowledges there is no mechanical real-host gate, but it neither bounds the detection window (no named owner, schedule, or merge-gating posture for the smoke) nor annotates that the blast radius of an undetected divergence is every runtime leaf. A revert path exists, so the condition is recoverable; the gap is the unbounded, owner-less window between a divergent merge and a human running the smoke.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — Adds / Ships when (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Tests (acceptance-trigger prose) (option-dependent)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — mirrored revert-path statement (option-dependent)
- `docs/plan_topics/H6a-live-corpus-activation.md` — release-gate manual-smoke checklist item (option-dependent)
- `docs/plan.md` — §Release gate (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — version-bump trigger / revert policy (option-dependent)

## Affected Leaves

**Phases:** Horizontal; Vertical slice V18; Release gate

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)
- `V18c` — Pi version-bump procedure and gates — (modified)
- `V18c-T` — Pi version-bump procedure and gates (tests) — (modified)
- `H6a` — Live-corpus closing-gate activation — (modified)

## Consequence

**Severity:** advisory

A Pi-SDK bump whose new SDK diverges from the in-process session double can merge on green CI; the divergence is invisible to every automated gate and surfaces only when a human eventually runs the manual real-host smoke, with no named owner or scheduled trigger bounding that window. The "restored before merge" revert precondition cannot fire on a post-merge-only signal, so the recovery path is mis-timed against its own trigger.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 81ab342 — pi-loom plan: resolve "version-bump runtime-evidence acceptance gate and revert path" (2026-06-10, Thomas Andersen); 328ba4d — pi-loom plan: resolve "real-host verification gap" (2026-06-10, Thomas Andersen)
**History:** 81ab342 added `V18c`'s revert path with the "restored before merge" timing, on the footing that the runtime-evidence acceptance gate was the divergence signal. 328ba4d then layered the manual real-host smoke onto `H4a` as the "post-merge detection mechanism" and named it in `V18c`'s revert trigger, creating the post-merge-signal / pre-merge-restore tension and the undetected-by-CI window; e7f14dd (2026-06-11) later refined the smoke's acceptance-trigger set in `H4a` but left the merge-gating posture and the window unbounded.

## Solution Space

**Shape:** multiple

This finding carries two independent obligations — a localized blast-radius annotation and a substantive bounding of the detection window — that land on different surfaces and cannot be resolved by one edit.

### Option A — Annotate the divergence blast radius on V18c

**Approach:** Add a blast-radius statement to `V18c` making explicit that an undetected Pi-SDK divergence affects every runtime leaf and is invisible to the double-backed acceptance gate.

**Plan edits:** In `docs/plan_topics/V18c-version-bump-checklist.md`, add to `Adds.` (or the runtime-evidence acceptance-gate `Tests.` bullet) a clause to the effect of "blast radius: all runtime leaves, real-host only — a divergent pin is not witnessed by the double-backed acceptance gate."

**Spec edits:** None.

**Pros:** Localized, low-risk; communicates the scope of an undetected divergence at the leaf that owns the pin.

**Cons:** Documentation-only; does not by itself shorten or bound the detection window.

**Risks:** Minimal.

### Option B — Bound the detection window and reconcile the revert timing

**Approach:** Pin the merge-gating posture of the manual real-host smoke and name a concrete trigger/owner, so the window between a divergent merge and detection is bounded, and reconcile `V18c`'s "restored before merge" with whichever posture is chosen. The fixer picks one posture: (i) make the smoke a **pre-merge** gate on a Pi-version-bump change — then it is not "post-merge" and `V18c`'s "restored before merge" is consistent; or (ii) keep it **post-merge** but name a concrete trigger and owner (who runs it, on which event) and restate `V18c`'s revert as a post-merge revert commit.

**Plan edits:** `docs/plan_topics/H4a-factory-shell-and-harness.md` acceptance-trigger prose (states who runs the smoke and when, and the merge-gating posture); `docs/plan_topics/V18c-version-bump-checklist.md` `Ships when` (revert timing reconciled to the chosen posture); `docs/plan_topics/V18c-T-version-bump-checklist.md` mirrored revert-path statement; `docs/plan_topics/H6a-live-corpus-activation.md` release-gate manual-smoke item if the owner/record-keeping lands at the release gate.

**Spec edits:** `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` if the trigger/revert policy is spec-owned (option-dependent).

**Pros:** Actually bounds or eliminates the undetected window and removes the post-merge/pre-merge timing tension.

**Cons:** Requires a process decision (pre- vs post-merge gating, named owner); larger, multi-leaf diff.

**Risks:** The posture chosen here determines the resolution of the timing-contradiction finding (T27).

### Recommendation

Resolve Option A first: the blast-radius annotation is the scope-bounding, single-leaf edit and lands on a stable baseline. Then resolve Option B against that baseline. For Option B, pin a single merge-gating posture and reconcile `V18c`'s revert timing to it in the same pass that resolves the timing-contradiction finding, since the two share the same decision.

## Relationships

- T27 "V18c Ships-when conflates a pre-merge gate and a post-merge smoke..." — decision-dependency (Option B's merge-gating choice fixes that finding's timing contradiction).
- T31 "Manual real-host fidelity gate leaves no falsifiable record" — same-cluster (record-keeping/owner trace at H6a; shares the named-owner aspect of Option B).
