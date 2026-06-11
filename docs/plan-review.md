# Triaged Plan Review — plan

_Generated: 2026-06-11T03:55:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T44) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 19 medium retained; 39 low discarded; 0 low findings merged into 0 medium findings; 16 NIT dropped; 0 false dropped._

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

# T06 — BNDR-5 number-renderer impl leaf cites only example vectors, not the `|value| < 1e-7` threshold

**Original heading:** BNDR-5 — impl leaf states only example vectors; paired -T leaf states the threshold
**Original section:** Consolidated Plan Review — plan
**Kind:** clarity, cruft
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `V2d` implementation leaf describes the BNDR-5 obligation only through concrete reference renderings. Its `Tests` bullet reads "number echo is shortest round-trip fixed-point — no scientific notation (the `1e21` → `1000000000000000000000` and `1e-8` → `0.00000001` fixed-point expansions reproduce exactly)", and its `Ships when` likewise names just the `±1e21` / `1e-8` expansions. The paired `V2d-T` tests-task leaf states the obligation in normative form: "no scientific notation (including the `±1e21` and `|value| < 1e-7` switches expanded to full fixed-point)".

The spec (`defaulting-system-note-echo.md`, BNDR-5) is unambiguous that the threshold is the load-bearing rule: scientific notation MUST NOT be used because "both ends of the JS `String(n)` switch are forbidden — the large-magnitude switch at ±1e21 and the small-magnitude switch at `|value| < 1e-7`". The `1e-8 → 0.00000001` rendering (BNDR-6s) is supplied only as an illustrative vector for that small-magnitude switch, not as the obligation itself.

So the impl leaf and its paired tests leaf state the same obligation two different ways: V2d names a single example magnitude, V2d-T names the threshold. V2d-T already matches the spec; V2d is the leaf out of step.

## Plan Documents

- `docs/plan_topics/V2d-number-rendering.md` — `V2d` leaf, BNDR-5 `Tests` bullet / `Ships when` (edited)
- `docs/plan_topics/V2d-T-number-rendering.md` — `V2d-T` leaf, BNDR-5 `Tests` bullet (read-only)
- `docs/plan_topics/coverage-matrix.md` — `BNDR-4, BNDR-5 → V2d` row (read-only)

## Spec Documents

- `docs/spec_topics/binder/defaulting-system-note-echo.md` — Echo policy, BNDR-5 (anchor `#bndr-5`) (read-only)

## Affected Leaves

**Phases:** V2 — Type system and values

**Leaves (implementation order):**

- `V2d` — Canonical integer/number renderer — (modified)

`V2d-T` is named directly by the finding but already states the threshold correctly; it is the reference and is not edited.

## Consequence

**Severity:** correctness

An implementer working from `V2d` alone sees only the `1e-8` / `1e21` example magnitudes and could implement a narrow special-case keyed on those exact values, satisfying the named test vectors while still emitting scientific notation for other small-magnitude values in `(1e-8, 1e-7)` such as `5e-8`. Two reasonable implementers — one reading the spec/V2d-T threshold, one reading V2d's example vectors — would produce diverging renderers, only one of which matches BNDR-5.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** Both `V2d-number-rendering.md` and `V2d-T-number-rendering.md` were created in the single plan-build commit c6a664e, and the asymmetry was present at birth — the impl leaf's BNDR-5 bullet already named only the `1e21`/`1e-8` example vectors while the paired `-T` leaf already named the `|value| < 1e-7` threshold. No later commit touched either file.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V2d-number-rendering.md`, revise the BNDR-5 `Tests` bullet so it states the obligation as the two forbidden `String(n)` switches — the large-magnitude `±1e21` switch and the small-magnitude `|value| < 1e-7` switch, both expanded to full fixed-point — matching the wording already in `V2d-T` and the spec's BNDR-5 pin. Retain the `1e21 → 1000000000000000000000` and `1e-8 → 0.00000001` renderings as the illustrative vectors. Apply the same threshold language to the `Ships when` line, which currently names only the `±1e21` / `1e-8` expansions; naming the `|value| < 1e-7` threshold there signals that the green assertion must cover the range, not just the single named magnitude.

`V2d-T` already states the threshold correctly and is the reference — do not edit it. The spec is read-only for this fix; the threshold text it already carries is the authority both plan leaves must match.

Implementer edge case to watch: a renderer that special-cases only the literal `1e-8` magnitude passes the named reference vector but is wrong for other values in `(1e-8, 1e-7)`. The closing test should exercise at least one in-range value (e.g. `5e-8`) so the threshold is enforced by the suite rather than only the single illustrative magnitude.

## Relationships

None

---

# T07 — V4a `Ships when` gate names "match exhaustiveness" while the leaf disclaims any static exhaustiveness check

**Original heading:** "match exhaustiveness" in `Ships when` contradicts the leaf's own no-static-check disclaimer
**Original section:** Consolidated Plan Review — plan
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V4a`'s `Ships when` field reads: "`npm test` proves `?` desugaring, `question-on-non-result`, and `match` exhaustiveness." The bare phrase "proves … `match` exhaustiveness" reads as a static exhaustiveness check — the gate asserts the type/parse phase rejects a non-exhaustive `match`.

The same leaf's `loom/runtime/match-error` Tests bullet states the opposite: "loom 1.0 does not statically check exhaustiveness," with non-coverage surfacing only as the runtime `loom/runtime/match-error` panic. The spec confirms the runtime semantics — `errors-and-results/error-model.md` §Exhaustiveness: "Not statically checked in loom 1.0 … A `match` whose arms collectively fail to cover the scrutinee at runtime raises a `MatchError`."

An implementer reading the `Ships when` gate in isolation sees a static-check obligation the spec disclaims as unsound and the leaf's own Tests bullet contradicts. The gate clause commits to neither the (disclaimed) static analysis nor the actual runtime `MatchError` behaviour, so the acceptance criterion is ambiguous at the exact point — the externally-observable gate — where it must be precise.

## Plan Documents

- `docs/plan_topics/V4a-match-result.md` — `Ships when` field (edited)

## Spec Documents

- `docs/spec_topics/errors-and-results/error-model.md` — §Exhaustiveness (read-only)

## Affected Leaves

**Phases:** Vertical slice V4 (Errors and results)

**Leaves (implementation order):**

- V4a — `match`, `?`, and `Result` — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on the gate: one attempts a static exhaustiveness check (which the spec calls unsound and declines to require), the other gates on the runtime `loom/runtime/match-error` panic. The first produces a leaf that does not match the spec; the second is correct. The contradiction between the gate clause and the leaf's own disclaiming bullet leaves the acceptance criterion underdetermined.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen); 22f762c — pi-loom plan: resolve "V4a third Tests bullet conflates three match behaviours" (2026-06-10, Thomas Andersen)
**History:** The `Ships when` clause "proves … `match` exhaustiveness" has been present unchanged since the plan's inception commit c6a664e, where the corresponding Tests bullet used "exhaustiveness" loosely with no explicit static-check disclaimer. Commit 22f762c later split that Tests bullet into the parse-phase and runtime-phase forms and added the explicit "loom 1.0 does not statically check exhaustiveness" disclaimer to the `loom/runtime/match-error` bullet, but left the inception-era `Ships when` line untouched — so the contradiction the finding flags arises from the interaction of the two commits rather than either alone.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V4a-match-result.md`, rewrite the `Ships when` field so its third clause names the observable runtime behaviour instead of the bare word "exhaustiveness", aligning it with the leaf's `loom/runtime/match-error` Tests bullet and `error-model.md` §Exhaustiveness. Replace:

> **Ships when.** `npm test` proves `?` desugaring, `question-on-non-result`, and `match` exhaustiveness.

with a clause that asserts the runtime panic and explicitly states no static check, e.g.:

> **Ships when.** `npm test` proves `?` desugaring, `question-on-non-result`, and that a `match` whose arms cover none of the six pattern forms raises the runtime `loom/runtime/match-error` panic (loom 1.0 performs no static exhaustiveness check).

The binding requirement is that the gate clause reference the runtime `loom/runtime/match-error` behaviour and not assert or imply a static exhaustiveness check. `V4a-T`'s `Ships when` (the standard fail-red gate) and `V4b` (which co-closes `loom/runtime/match-error`) need no change.

## Relationships

None

---

# T08 — `V6c` / `V6c-T` Tests bullets assert diagnostics without naming their codes

**Original heading:** Diagnostic assertions name no code
**Original section:** Consolidated Plan Review — plan
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `tools` leaf `V6c` and its paired test leaf `V6c-T` each carry three
`Tests.` bullets that assert observable diagnostic outcomes — "rejected at
load time", a name collision that "fires its code", and a "frozen"
resolution snapshot — but none of these bullets cites the diagnostic code
or REQ-ID being asserted. The cross-cutting *Diagnostic message anchors*
rule in `conventions.md` requires that any test asserting a diagnostic's
rendered message cite the diagnostic code and source the expected string
from the *Message* column of the diagnostics registry; the registry is the
single source of truth for every author-visible message string. Sibling
leaves in the same family (`V1b`, `V2a`, `V5a`, `V5b`) enumerate every
`loom/parse/*` code their Tests bullets fire, so `V6c`/`V6c-T` are out of
step with the established convention.

The two firing bullets map to concrete registry codes that already exist:
the prompt-mode `.loom` callee rejection is `loom/load/prompt-mode-callable`
and the `tools:` name collision is `loom/load/tool-name-collision` (both in
`code-registry-load.md`). Because neither bullet names its code, a reviewer
cannot tell which diagnostic gates each step, and the `V6c-T` test could go
red/green against the wrong code while still appearing to satisfy the
bullet.

## Plan Documents

- `docs/plan_topics/V6c-tools-set.md` — Tests (edited)
- `docs/plan_topics/V6c-T-tools-set.md` — Tests (edited)
- `docs/plan_topics/conventions.md` — *Diagnostic message anchors* rule (read-only)

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/prompt-mode-callable`, `loom/load/tool-name-collision` rows (read-only)

## Affected Leaves

**Phases:** V6 — Frontmatter

**Leaves (implementation order):**

- `V6c-T` — `tools` callable set and resolution snapshot (tests) — (modified)
- `V6c` — `tools` callable set and resolution snapshot — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers would diverge on which diagnostic each Tests
bullet gates, and the `V6c-T` red-phase test can pass against the wrong code
(or assert no code at all), so the resulting tests would not faithfully gate
the prompt-mode-callee rejection or the name-collision behaviour the leaf
ships. The leaf is still pickable, so this is not blocking, but it
contradicts the project's *Diagnostic message anchors* rule and the
code-citation discipline its sibling leaves follow.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `docs/plan_topics/V6c-tools-set.md` and its paired test leaf `docs/plan_topics/V6c-T-tools-set.md` were both added in the single commit c6a664e, which is the only commit touching either file. The three Tests bullets have cited no diagnostic code since that first revision; the defect was present at the leaf's inception and was never introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

In the `Tests.` bullets of both `docs/plan_topics/V6c-tools-set.md` and
`docs/plan_topics/V6c-T-tools-set.md`, cite the diagnostic code each firing
bullet asserts, sourcing the expected rendered message from the *Message*
column of `code-registry-load.md` as the *Diagnostic message anchors* rule
requires:

- The "prompt-mode `.loom` callee in `tools:` is rejected at load time"
  bullet cites `loom/load/prompt-mode-callable`.
- The "`tools:` name collision fires its code" bullet cites
  `loom/load/tool-name-collision`.

The third bullet ("resolved callable set is frozen … both YAML spellings
parse") asserts observable behaviour rather than a diagnostic firing, so it
needs no diagnostic-code citation; leave it as observable-behaviour prose
unless a registry code actually gates it. Keep the two added citations
identical between `V6c` and `V6c-T` so the test leaf and its implementation
leaf agree on which codes gate which step.

## Relationships

- T09 "Prompt-mode `system:` rejection bullet cites no diagnostic code" — same-cluster (the V6d leaf has the same Diagnostic-message-anchors omission on a different bullet; resolves independently with its own code).

---

# T09 — Prompt-mode `system:` rejection bullet cites no diagnostic code

**Original heading:** Prompt-mode rejection names no code
**Original section:** Consolidated Plan Review — plan
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `V6d` / `V6d-T` `Tests.` bullet "`system:` on a prompt-mode loom is rejected" asserts an observable rejection without naming the diagnostic code that gates it. The spec is unambiguous about the code: `system:` on a `mode: prompt` loom is `loom/parse/system-on-prompt-mode`, defined in the parse code registry (`docs/spec_topics/diagnostics/code-registry-parse.md`, with message `'system:' is not permitted on a mode: prompt loom`) and cross-referenced from the frontmatter spec (`frontmatter-fields-a.md`, `frontmatter-fields-b-and-templates.md`).

The `conventions.md` *Diagnostic message anchors* rule requires tests that assert a diagnostic's rendered message to cite the diagnostic code and source the expected string from the registry's *Message* column. The omission is isolated within the same leaf: the interpolation bullet correctly cites the `loom/parse/system-interp-*` family, so only the prompt-mode-rejection bullet is non-conformant. Sibling leaves (e.g. `V6c`, flagged separately) exhibit the same pattern.

Because the code is never named in the plan, the assertion target is ambiguous: `V6d-T` could red/green against an arbitrary parse error rather than `loom/parse/system-on-prompt-mode`. The closing-gate parity check that pairs every registry code with an asserting test (`conventions.md` *REQ-ID discipline*, registry-code↔asserting-test arm) relies on the citing test naming the code; an uncited assertion risks the code shipping without a witnessing test that the gate can find.

## Plan Documents

- `docs/plan_topics/V6d-system-interpolation.md` — `Tests.` field, `system:`-rejection bullet (edited)
- `docs/plan_topics/V6d-T-system-interpolation.md` — `Tests.` field, `system:`-rejection bullet (edited)
- `docs/plan_topics/conventions.md` — *Diagnostic message anchors* rule (read-only)

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-parse.md` — `loom/parse/system-on-prompt-mode` row (read-only)
- `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md` — `system` subagent-only rule (read-only)

## Affected Leaves

**Phases:** V6 — Frontmatter

**Leaves (implementation order):**

- `V6d` — `system` template interpolation — (modified)
- `V6d-T` — `system` template interpolation (tests) — (modified)

## Consequence

**Severity:** correctness

Without the code anchor, `V6d-T` may assert against the wrong parse error and pass vacuously, and a reviewer cannot tell which diagnostic gates the step; two reasonable implementers could witness different errors. The registry-code↔asserting-test closing gate also depends on the citing test naming `loom/parse/system-on-prompt-mode`, so an uncited assertion risks the code reaching release without a discoverable witness.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The `system:` rejection bullet entered both `V6d-system-interpolation.md` and `V6d-T-system-interpolation.md` in commit c6a664e, the plan-build commit that created these leaf files; pickaxe (`git log -S 'prompt-mode loom is rejected'`) localises the string to that single commit. The later edit 3625ee0 reworked the per-type stringification bullet and left the code-less rejection bullet untouched, so the defect has been present since the leaf's first commit.

## Solution Space

**Shape:** single

### Recommendation

In both `docs/plan_topics/V6d-system-interpolation.md` and `docs/plan_topics/V6d-T-system-interpolation.md`, revise the `Tests.` bullet currently reading "`system:` on a prompt-mode loom is rejected." so it cites the diagnostic code `loom/parse/system-on-prompt-mode` and asserts the rendered message against the diagnostics registry's *Message* column, per the *Diagnostic message anchors* convention. Concretely, the bullet should name the code (e.g. "`system:` on a `mode: prompt` loom fires `loom/parse/system-on-prompt-mode`") so the assertion target is unambiguous and the registry-code↔asserting-test closing gate finds a citing test. The code, severity (`E`), phase (`parse`), and expected message (`'system:' is not permitted on a mode: prompt loom`) are already fixed in `docs/spec_topics/diagnostics/code-registry-parse.md`; this is a plan-text edit only — no spec change.

## Relationships

- T08 "`V6c` / `V6c-T` Tests bullets assert diagnostics without naming their codes" — same-cluster (same *Diagnostic message anchors* convention gap; resolves independently with its own codes).

---

# T10 — V9i binds the V3d function-result seam without declaring V3d as a dependency

**Original heading:** Binds the V3d function-result seam but omits V3d from Deps
**Original section:** Consolidated Plan Review — plan
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V9i`'s final-value Tests bullet asserts subagent-result propagation "against the function-result seam `V3d` defines" — the callee's produced final value propagates to the subagent caller on success and is absent on fail/cancel. The paired tests leaf `V9i-T` carries the identical bullet. Neither leaf lists `V3d` in its `Deps`: `V9i` declares `V9i-T, V9a, V17a, V11a, V8a` and `V9i-T` declares `V9a, V17a, V11a, V8a`. `V3d` is also not transitively reachable through any of those dependencies (the transitive closure of `V9i`'s deps — `V9a`, `V17a`, `V11a`, `V8a`, `V9b`, `V10c`, `H4a`, `V7a`, `H3a`, `V8b`, `V10a`, `V1a`, `H2a` — never reaches `V3d`).

The sibling leaf `V15a` binds the same seam with verbatim wording (the final-value contract "against the function-result seam `V3d` defines") and correctly lists `V3d` in its `Deps`; its tests partner `V15a-T` does likewise. The `V9i`/`V9i-T` pair is the outlier: it consumes the `V3d`-owned seam shape without declaring the dependency that makes that shape available.

An implementer sequencing by the dependency DAG can pick up `V9i-T`/`V9i` before `V3d` exists, then reach the final-value test with no defined function-result seam to bind against and invent an ad-hoc "final value of a subagent run" shape that need not match what `V3d` actually produces.

## Plan Documents

- `docs/plan_topics/V9i-subagent-isolation.md` — Deps field (edited)
- `docs/plan_topics/V9i-T-subagent-isolation.md` — Deps field (edited)
- `docs/plan_topics/V3d-functions-and-return.md` — function-result seam owner (read-only)
- `docs/plan_topics/V15a-invocation-core.md` — sibling that binds the same seam with V3d declared (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice V9 — Extension host integration

**Leaves (implementation order):**

- `V9i-T` — Subagent-mode session isolation and lifecycle (tests) — (modified)
- `V9i` — Subagent-mode session isolation and lifecycle — (modified)

## Consequence

**Severity:** correctness

The final-value test binds a seam (`V3d`) that is neither a declared nor a transitive dependency, so an implementer can land `V9i-T`/`V9i` before `V3d` and will invent an ad-hoc subagent-result shape. Two reasonable implementers diverge on the final-value contract, and the subagent leaf can ship a shape that does not match what `V3d` produces.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 7a8565a — pi-loom plan: resolve "V3d-T over-asserts final-value propagation" (2026-06-11, Thomas Andersen)
**History:** `V9i` and `V9i-T` were created in c6a664e (2026-06-10) with no reference to `V3d` at all; at that point `V9i`'s Deps were `V9i-T, V9a, V17a, V11a`. Commit 7a8565a (2026-06-11) added the final-value Tests bullet binding "the function-result seam `V3d` defines" to both leaves but did not add `V3d` to either leaf's Deps, introducing the seam-binding-without-dependency mismatch.

## Solution Space

**Shape:** single

### Recommendation

Add `V3d` to the `Deps` field of both `V9i` and `V9i-T`, mirroring the sibling `V15a`/`V15a-T` pair that binds the same seam.

- In `docs/plan_topics/V9i-subagent-isolation.md`, change the `Deps` line to `V9i-T`, `V9a`, `V17a`, `V11a`, `V8a`, `V3d`.
- In `docs/plan_topics/V9i-T-subagent-isolation.md`, change the `Deps` line to `V9a`, `V17a`, `V11a`, `V8a`, `V3d`.

No spec edit is required: the `V3d` function-result seam already exists (owned by `V3d` per `return.md`); this fix only declares the dependency that the existing Tests bullet relies on.

## Relationships

- T12 "V4c/V4c-T name the H4a harness and session double but omit H4a from Deps" — same-cluster (same defect class: a leaf binds a seam it does not declare in Deps; resolves independently).

---

# T11 — V9c-T omits V17a though its PIC-18 cancel-forwarding test targets the V17a-owned `loomAbort`

**Original heading:** V9c-T omits V17a while its cancel-forwarding test targets the V17a-owned `loomAbort`
**Original section:** Consolidated Plan Review — plan
**Kind:** ordering
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The implementation leaf `V9c` declares the prompt-mode `pi.on` subscription as "cancel-forward only, forwarding Pi's `ctx.signal` into the `loomAbort` controller owned by V17a," and its `PIC-18` Tests bullet asserts that the subscription "is used only for cancel-forwarding — forwarding into the `loomAbort` controller owned by V17a — never for completion." `V9c` correctly lists `V17a` in its `Deps` (`V9c-T, V9a, V9j, V8a, V17a`).

The paired tests leaf `V9c-T` carries the same `PIC-18` cancel-forwarding obligation but its `Deps` are only `V9a, V9j, V8a` — `V17a` is absent and not reachable transitively. `loomAbort` is the cross-leaf cancellation controller (a Class-2 seam) owned exclusively by `V17a`; no other leaf declares it. Writing the `PIC-18` cancel-forwarding test therefore requires the `loomAbort` symbol that only `V17a` provides.

This makes `V9c-T` the lone exception among every cancellation-touching tests leaf: `V4c-T`, `V9g-T`, `V9i-T`, and `V11f-T` each reference `loomAbort`/`V17a` and each list `V17a` in their `Deps`. An executor picking `V9c-T` once its declared deps (`V9a, V9j, V8a`) are satisfied — but before `V17a` lands — either references `loomAbort` as an undeclared symbol (a compile-time red, which the `-T` "compile and fail red for the intended reason" gate disqualifies) or stubs an ad-hoc `loomAbort` that is not guaranteed to match the contract `V17a` and the impl leaf `V9c` later build against.

## Plan Documents

- `docs/plan_topics/V9c-T-conversation-drive.md` — Deps field (edited)
- `docs/plan_topics/V9c-conversation-drive.md` — Adds / PIC-18 / Deps (read-only; the correctly-wired impl partner)
- `docs/plan_topics/V17a-cancellation-core.md` — `loomAbort` seam owner (read-only)
- `docs/plan_topics/conventions.md` — Per-phase TDD ritual ("compile and fail red"), Leaf format Deps rules (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices — V9

**Leaves (implementation order):**

- V9c-T — Prompt-mode conversation drive and active-set gating (tests) — (modified)

## Consequence

**Severity:** correctness

`V9c-T`'s `PIC-18` test references the `V17a`-owned `loomAbort` controller, but with `V17a` absent from its `Deps` an executor sequencing strictly by the DAG can pick `V9c-T` before `V17a` exists. Two reasonable implementers then diverge: one blocks on the compile-time red that the `-T` gate rejects; the other stubs an ad-hoc `loomAbort` that may not match the real controller contract `V9c` and `V17a` build against, seeding a fixture/seam mismatch that the impl pass must later reconcile.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** ecedd5f — pi-loom plan: resolve "Cancel-forwarding couples V9c to loomAbort (V17a) without a declared dependency" (2026-06-10, Thomas Andersen)
**History:** Both `V9c` and its paired `V9c-T` were created without `V17a` in `Deps` at the plan's first commit (c6a664e, 2026-06-10), when the `loomAbort`/`V17a` coupling was undeclared on both sides. Commit ecedd5f resolved a sibling review finding by adding `V17a` to the impl leaf `V9c`'s `Deps` and naming `loomAbort`/`V17a` in its `Adds` and `PIC-18` bullet, but did not propagate the same `Deps` edit to the paired `V9c-T` tests leaf — creating the impl-vs-test asymmetry this finding names. (`git log -S 'loomAbort'` and `git log -G 'V17a'` over `V9c-T` show the token never entered that file.)

## Solution Space

**Shape:** single

### Recommendation

Add `V17a` to the `Deps` field of `docs/plan_topics/V9c-T-conversation-drive.md`, so it reads `**Deps.** `V9a`, `V9j`, `V8a`, `V17a``, mirroring the impl leaf `V9c` and matching every other cancellation-touching tests leaf (`V4c-T`, `V9g-T`, `V9i-T`, `V11f-T`). `V17a`'s own deps are only `V17a-T, V8a` (and `V8a` is already a `V9c-T` dep), so `V17a` is freely orderable ahead of `V9c-T` and no reordering of `V17a` is needed.

Edge case for the implementer: the TDD ritual permits a tests task to stub "the minimum production code needed for the tests to compile," but `loomAbort` is the `V17a`-owned cross-leaf seam — declaring the `V17a` dep lets `V9c-T`'s `PIC-18` test compile against the real controller rather than a divergent ad-hoc stub.

## Relationships

- T10 "V9i binds the V3d function-result seam without declaring V3d as a dependency" — same-cluster (sibling leaf omitting a seam-owning dep; resolves independently).
- T40 "V4d `QueryError` family consumed by V13a / V14a / V17a without a declared or transitive dependency" — same-cluster (touches V17a Deps; separate edit).
- T12 "V4c/V4c-T name the H4a harness and session double but omit H4a from Deps" — same-cluster (seam-dep omission; independent edit).
- T16 "V5e per-boundary routing test asserts destination error surfaces its `Deps` cannot reach" — same-cluster (destination-surface dep omission).

---

# T12 — V4c/V4c-T name the H4a harness and session double but omit H4a from Deps

**Original heading:** Uses the H4a harness / session double but omits H4a from Deps
**Original section:** Consolidated Plan Review — plan
**Kind:** assumptions, implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

Three of `V4c`'s Tests bullets are written to run against the `H4a` test harness. `ERR-12` holds "exercised via the `H4a` harness modelling a subagent-mode callee — not the live `V9i` surface"; the first `ERR-13` bullet models completed tool-call / query / invoke-child outcomes "through the `H4a` session double and the `V17a` side-effect seam … not the live `V14a`/`V13c`/`V15a` surfaces"; the `ERR-13` (completed-callee finality) bullet drives a callee to completion "via the `H4a` session double … scoped against the `V17a` cancellation seam / `H4a` invocation harness." The paired `V4c-T` leaf carries the same harness-dependent assertions.

`V4c`'s declared `Deps` are `V4c-T, V4a, V17a` and `V4c-T`'s are `V4a, V17a`; `H4a` appears in neither. It is also not reachable transitively: `V4a` depends on `V4a-T, V2b, V3a`, and `V17a` depends on `V17a-T, V8a` (`V8a → H3a`) — no path reaches `H4a`. The relationship is also unrecorded in the reverse direction: `H4a`'s Adds enumerates its harness consumers as `M`, `M-T`, `H7a`, `V9c`, `V11f`, `V12a`, `V13c`, `V13d`, and `V17a`, and does not list `V4c`.

Following the plan's "pick the next leaf whose `Deps` are satisfied" rule, an implementer can begin `V4c` before `H4a` exists. The `ERR-12`/`ERR-13` tests cannot be written faithfully without the `H4a` session double / subagent-mode-callee harness they explicitly name, so the implementer would hand-roll a one-off session stub with no guarantee it matches the `H4a` fidelity contract — which is precisely the divergence the harness was introduced to prevent.

## Plan Documents

- `docs/plan_topics/V4c-terminal-outcomes.md` — Deps field (edited)
- `docs/plan_topics/V4c-T-terminal-outcomes.md` — Deps field (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Adds consumer enumeration (edited)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal, Vertical slice V4

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)
- `V4c` — Terminal outcomes, partial-append, and no-rollback — (modified)
- `V4c-T` — Terminal outcomes (tests-task) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one stalls until `H4a` lands; the other picks `V4c` (whose `Deps` are satisfiable) and hand-rolls a session stub that need not match the `H4a` fidelity contract, so the `ERR-12`/`ERR-13` assertions are exercised against a surface the plan never specified. The harness-vs-stub split silently undermines the no-rollback / terminal-outcome coverage `V4c` is meant to establish.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** e8f0236 — pi-loom plan: resolve "V4c-T/V4c assert no-rollback over later-slice surfaces" (2026-06-11, Thomas Andersen); db918a2 — pi-loom plan: resolve "ERR-13 no-rollback / completed-callee finality over-claimed in V4c" (2026-06-11, Thomas Andersen)
**History:** `V4c` was created in c6a664e with `Deps. V4c-T, V4a, V17a` and `ERR-12`/`ERR-13` bullets that named no harness, so the Deps were correct as authored. A later review-remediation, e8f0236, rewrote those bullets to route through the `H4a` harness and `H4a` session double (to avoid asserting over the live `V9i`/`V14a`/`V13c`/`V15a` surfaces) but did not add `H4a` to the Deps of `V4c` or `V4c-T`, introducing the gap. db918a2 deepened the `H4a` session-double usage with the completed-callee-finality bullet, again leaving the Deps line untouched; the Deps line has not changed since inception.

## Solution Space

**Shape:** single

### Recommendation

Add `H4a` to the `Deps.` field of both `docs/plan_topics/V4c-terminal-outcomes.md` and `docs/plan_topics/V4c-T-terminal-outcomes.md`, so each reads `... V4a, V17a, H4a` (V4c additionally retains its `V4c-T` entry). This is the durable fix: the e8f0236 remediation deliberately re-pointed `ERR-12`/`ERR-13` at the `H4a` harness precisely to keep these assertions off the later-slice `V9i`/`V14a`/`V13c`/`V15a` surfaces, so dropping the `H4a` references instead would re-open the defect that remediation closed.

Edge cases for the implementer:

- For symmetry, add `V4c` to the harness-consumer enumeration in `H4a`'s `Adds.` (currently `M`, `M-T`, `H7a`, `V9c`, `V11f`, `V12a`, `V13c`, `V13d`, `V17a`), so the producer/consumer record is bidirectional. This is a consistency follow-on, not a separate obligation.
- If `H4a` is later split, the new `H4a` Deps entry must target whichever resulting sub-leaf carries the session-double / subagent-mode-callee modelling, not necessarily the renamed `H4a`.

## Relationships

- T35 "Response-programming surface: determinism is gated at H4a, functional effect is not" — same-cluster (both concern correct wiring/verification of the H4a harness contract; independent).
- T11 "V9c-T omits V17a though its PIC-18 cancel-forwarding test targets the V17a-owned `loomAbort`" — same-cluster (same Deps-omission defect class).
- T40 "V4d `QueryError` family consumed by V13a / V14a / V17a without a declared or transitive dependency" — same-cluster (same Deps-omission defect class).

---

# T13 — V8a's `Checkpoint` `loop-iter` macrotask yield has no substrate seam in its Deps

**Original heading:** `Checkpoint` `loop-iter` macrotask yield assumes a macrotask primitive with no declared owner
**Original section:** Consolidated Plan Review — plan
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

V8a's `Adds.` requires the `Checkpoint` seam to produce a "macrotask yield for `loop-iter`, microtask otherwise." This is a production behaviour, not a test-only one: PIC-10 (`docs/spec_topics/pi-integration-contract/host-interfaces-services.md`) states that for the `loop-iter` checkpoint kind, `before(...)` "releases the event loop for one macrotask turn before resolving," so a Pi-dispatched abort can land before a compute-bound loop's next signal-check.

The only sanctioned way to schedule deferred work in the runtime is the `Clock` seam. PIC-12 declares the runtime "reads wall-clock time and **schedules deferred work exclusively** through a `Clock` seam," whose `setTimeout`/`clearTimeout` members are "the only timer surface the runtime uses." Reinforcing this, `conventions.md` §Cross-cutting rules → *No globals, statics, singletons* bans any direct `setTimeout` reference outside the `WallClock` adapter, and the H3a identifier-keyed ambient-access scan reds a `src/**` `setTimeout` that is not at an allow-listed adapter site.

The `Clock` seam is owned by V8b, but V8a's `Deps.` are only `V8a-T, H3a`. V8b is not named and is not transitively reachable — V8a and V8b are V8-slice siblings whose sole deps are their paired `-T` task and H3a. An implementer picking up V8a therefore has no declared substrate for the mandated macrotask yield: they would either hand-roll an undeclared scheduling primitive (violating PIC-12's exclusive-Clock rule) or emit a direct `setTimeout` (failing the H3a ambient scan), or independently rediscover the missing dependency edge. The macrotask-yield substrate must be sourced through the `Clock` seam, and V8a's dependency declaration does not reflect that.

## Plan Documents

- `docs/plan_topics/V8a-checkpoint-validator-seams.md` — `Deps.` field (edited)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — `Clock` seam owner (read-only)
- `docs/plan_topics/conventions.md` — Cross-cutting rules → *No globals, statics, singletons* ambient-`setTimeout` ban (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices (V8)

**Leaves (implementation order):**

- V8a — `Checkpoint` and `SchemaValidator` seams — (modified)

## Consequence

**Severity:** correctness

An implementer building V8a's production `loop-iter` macrotask yield has no seam in scope that can schedule a macrotask: the `Clock` seam (PIC-12) lives in the unreferenced V8b. Two reasonable implementers diverge — one adds the missing dependency edge, another hand-rolls an undeclared primitive or a direct `setTimeout` that the H3a ambient scan then reds — and the latter cannot satisfy the spec's exclusive-`Clock` deferred-work rule.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (`pi-loom plan: build/update plan for spec.md + review`, 2026-06-10)
**History:** `docs/plan_topics/V8a-checkpoint-validator-seams.md` has exactly one commit in its history (`git log --follow`): c6a664e, the initial plan build. That commit's diff introduced both the macrotask-yield `Adds.` requirement (`+**Adds.** The \`Checkpoint\` seam (… macrotask yield for \`loop-iter\` …)`) and the `Deps.` line (`+**Deps.** \`V8a-T\`, \`H3a\`) in the same change. The leaf has never been edited since, so the macrotask-yield obligation has coexisted with a Deps set that omits the substrate-owning V8b since the leaf's inception; the defect is original to the leaf, not introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

Add `V8b` to V8a's `Deps.` field in `docs/plan_topics/V8a-checkpoint-validator-seams.md`, changing the line from:

```
**Deps.** `V8a-T`, `H3a`
```

to:

```
**Deps.** `V8a-T`, `H3a`, `V8b`
```

This binds the `Clock` seam (PIC-12) as the macrotask-yield substrate for the `loop-iter` checkpoint, so the production `Checkpoint` schedules its one-macrotask-turn yield through `Clock.setTimeout` rather than an undeclared or ambient primitive. V8b's own deps (`V8b-T`, `H3a`) introduce no cycle.

Edge cases for the implementer:
- The `Checkpoint`'s `loop-iter` yield must be realised through the `Clock` seam's `setTimeout`/`clearTimeout`, not a bespoke scheduler — PIC-12 fixes `Clock` as the exclusive deferred-work surface and `conventions.md` bans direct `setTimeout` outside the `WallClock` adapter (enforced by the H3a scan).
- If V8a or V8b is later split, the new edge must name the specific sub-leaf that owns the `Clock` seam rather than bare `V8b`.

## Relationships

None

---

# T14 — ERR-7 test bullet states different normative content in the paired V4e leaves

**Original heading:** ERR-7 described two ways across the paired leaves
**Original section:** Consolidated Plan Review — plan
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `ERR-7` Tests bullet diverges between the paired pre-evaluation-failure leaves. The implementation leaf `V4e` reads: "a synthetic *watcher-rebuild* failure injected at the `ERR-7` channel seam — exercising **both arms**, the re-parse/re-merge diagnostic arm and the `loom/runtime/registry-swap-failed` registry-swap arm — routes pre-eval …". The paired tests-task leaf `V4e-T` reads only: "*watcher-reload* failure routes pre-eval." Two normative properties differ:

1. **Terminology.** The same watcher event is called "watcher-rebuild" in `V4e` and "watcher-reload" in `V4e-T`. The spec's canonical name is "watcher-time reload failures" (`errors-and-results/error-model.md` §ERR-7, anchor `err-7`; `discovery/package-and-settings.md` §"Watcher-time reload failures"); neither leaf uses it verbatim and the two leaves disagree with each other.

2. **Two-arm scope.** `V4e`'s bullet mandates that the test exercise *both* ERR-7 failure outcomes the spec enumerates — the re-parse/re-merge diagnostic arm and the `loom/runtime/registry-swap-failed` registry-swap arm. `V4e-T`'s one-line bullet names neither arm, so it does not state that two arms must be covered.

Because the tests task lands first under the per-phase TDD ritual, an implementer authoring `V4e-T` from its own bullet would write a single watcher-event test covering one arm. The impl leaf's stronger "both arms" requirement then has no matching red test, and the paired bullets describe the same REQ-ID with different obligations.

## Plan Documents

- `docs/plan_topics/V4e-pre-evaluation-failures.md` — ERR-7 Tests bullet (edited)
- `docs/plan_topics/V4e-T-pre-evaluation-failures.md` — ERR-7 Tests bullet (edited)

## Spec Documents

- `docs/spec_topics/errors-and-results/error-model.md` — §ERR-7 (read-only)
- `docs/spec_topics/discovery/package-and-settings.md` — §"Watcher-time reload failures" (read-only)

## Affected Leaves

**Phases:** V4 (vertical slice)

**Leaves (implementation order):**

- `V4e-T` — Pre-evaluation failures (tests) — (modified)
- `V4e` — Pre-evaluation failures — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one writing `V4e-T` from its bullet covers a single watcher arm, while `V4e` requires both arms, so the tests-first artefact under-tests the obligation the implementation claims to satisfy. The mismatched term ("rebuild" vs "reload") for one event also obscures that the two bullets address the same ERR-7 surface.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 49e3837 — pi-loom plan: resolve "ERR-7 watcher-reload assertion has no in-leaf test" (2026-06-11, Thomas Andersen)
**History:** Both leaves agreed at inception (c6a664e, 2026-06-10): each `ERR-7` bullet read "watcher-reload failure routes pre-eval." Commit 49e3837 rewrote only `V4e-pre-evaluation-failures.md`'s bullet — changing the term to "watcher-rebuild" and adding the explicit two-arm requirement — without touching the paired `V4e-T` bullet, so the divergence in both term and scope entered with that single one-file edit.

## Solution Space

**Shape:** single

### Recommendation

Rewrite `V4e-T`'s `ERR-7` Tests bullet so it states the same normative content as `V4e`'s bullet: use one shared term for the watcher event and name both arms — the re-parse/re-merge diagnostic arm and the `loom/runtime/registry-swap-failed` registry-swap arm. Converge both leaves on the spec's canonical term "watcher-time reload" (`error-model.md` §ERR-7), adjusting `V4e`'s "watcher-rebuild" wording to match, so plan and spec use one name for the event.

Watch: the term chosen here should agree with the resolution of the sibling ERR-7 finding about the injection seam (it touches the same bullet); pick the term once and apply it to both leaves' bullets in the same pass.

## Relationships

- T15 "ERR-7 test injects at an undefined "channel seam" and omits the two-arm owners from `Deps`" — decision-dependency (touches the same V4e `ERR-7` Tests bullet; the canonical term and two-arm naming chosen there should match this fix).

---

# T15 — ERR-7 test injects at an undefined "channel seam" and omits the two-arm owners from `Deps`

**Original heading:** ERR-7 injection at an undefined "channel seam"; two-arm owners not in Deps
**Original section:** Consolidated Plan Review — plan
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

V4e's `ERR-7` Tests bullet reads: "a synthetic watcher-rebuild failure injected at the `ERR-7` channel seam — exercising both arms, the re-parse/re-merge diagnostic arm and the `loom/runtime/registry-swap-failed` registry-swap arm — routes pre-eval to `loom-system-note` with `triggerTurn:false`, without standing up a live `V10c`/`V9b` watcher." The phrase "`ERR-7` channel seam" occurs only in this bullet — no leaf or convention declares it as a named injection seam, and no spec page defines a seam by that name. An implementer therefore has no contract telling them what interface to inject against or which leaf owns it.

The two failure outcomes the bullet requires the test to exercise are both produced by other leaves. The registry-swap arm (`loom/runtime/registry-swap-failed`) is owned by `V9b` (registration step 5 build-aside-then-publish swap and the drain-state contract). The re-parse / re-merge diagnostic arm is produced by the watcher-rebuild path: re-parsing changed `.loom` / `.warp` files is the discovery-root watcher registered in `V9b`'s registration step 5, and re-merging changed settings is `V10c`'s reload-debounce path (V10c's own `Adds` states "the `ERR-7` watcher-reload failure surface this debounce feeds is asserted by `V4e`"). V4e's `Deps` are `V4e-T, V9a, V6a, V11f, V10a, V16a` — neither `V9b` nor `V10c` appears, and neither is reachable transitively. The bullet's "without standing up a live `V10c`/`V9b` watcher" qualifier acknowledges the synthetic intent but does not supply the seam interface against which the synthetic producer is built, nor the `loom/runtime/registry-swap-failed` code's owning leaf.

Two reasonable implementers will diverge: one hand-rolls a bespoke synthetic producer and an ad-hoc injection point; another waits for or re-derives the real watcher-rebuild contract. The synthetic seam an implementer invents is not guaranteed to match the real watcher path V9b/V10c build, so the ERR-7 test may green against a fabricated interface that never exercises the genuine surfacing contract.

## Plan Documents

- `docs/plan_topics/V4e-pre-evaluation-failures.md` — Tests (`ERR-7` bullet) and `Deps` (edited)
- `docs/plan_topics/V4e-T-pre-evaluation-failures.md` — Tests (`ERR-7` bullet) and `Deps` (edited)
- `docs/plan_topics/V9b-registration-drain-state.md` — registry-swap-failed arm owner; `.loom`/`.warp` re-parse watcher owner (edited)
- `docs/plan_topics/V10c-settings-merge.md` — settings re-merge arm owner (edited)

## Spec Documents

None. The spec fully defines `ERR-7` and its two arms (`docs/spec_topics/errors-and-results/error-model.md` §ERR-7 and `docs/spec_topics/discovery/package-and-settings.md` §"Watcher-time reload failures"); the gap is internal to the plan leaves.

## Affected Leaves

**Phases:** Vertical slices (V4, V9, V10)

**Leaves (implementation order):**

- `V4e-T` — Pre-evaluation failures (tests) — (modified)
- `V4e` — Pre-evaluation failures — (modified)
- `V9b` — Registration steps and drain-state contract — (modified)
- `V10c` — Settings reads and merge — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on what the "`ERR-7` channel seam" is and how each arm is synthesised, and the omission of `V9b`/`V10c` from `Deps` means V4e can be picked up before the leaves that own the `loom/runtime/registry-swap-failed` code and the re-parse/re-merge diagnostic path. The resulting ERR-7 test can green against an invented synthetic interface that does not match the real watcher-rebuild surfacing contract.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 49e3837 — pi-loom plan: resolve "ERR-7 watcher-reload assertion has no in-leaf test" (2026-06-11, Thomas Andersen)
**History:** Before 49e3837 the bullet read simply "`ERR-7`: watcher-reload failure routes pre-eval." That commit (resolving an earlier "ERR-7 watcher-reload assertion has no in-leaf test" finding) expanded the bullet to inject "at the `ERR-7` channel seam" and to require exercising both arms, but it neither defined that seam in any leaf nor added the two arms' owning leaves (`V9b`/`V10c`) to V4e's `Deps`, which were left unchanged. `git log -S` over the `ERR-7 channel seam` token confirms 49e3837 as the sole introducing commit.

## Solution Space

**Shape:** single

### Recommendation

Declare the synthetic injection seam in the leaf that owns the watcher-rebuild path (registry-swap and `.loom`/`.warp` re-parse in `V9b`; settings re-merge in `V10c`) and add the owning leaf(s) to V4e's `Deps`, mirroring how V4e already binds the `V16a` arbitration seam via its `Deps` annotation.

In `V9b` (and `V10c` for the settings-re-merge sub-arm), state the named test-injection seam through which a synthetic watcher-rebuild failure is fed to the `loom-system-note` surfacing path. In `V4e.Deps`, add `V9b` (and `V10c` if the settings-re-merge sub-arm is exercised), with an inline annotation naming the seam, and update V4e's `ERR-7` Tests bullet to cite that named seam instead of the undefined "`ERR-7` channel seam". Mirror the bullet change in `V4e-T`.

This keeps the seam contract co-located with the code that produces both arms and guarantees the `registry-swap-failed` and re-parse/re-merge diagnostic codes exist before V4e's ERR-7 test runs, removing the divergence risk. Resolve the smaller scope-bounding edit first: pin the named seam in `V9b`/`V10c`, then update V4e's bullet and `Deps` (and mirror the bullet in `V4e-T`) against that stable name. Watch the edge case that the re-parse/re-merge arm spans both leaves (`.loom`/`.warp` re-parse in V9b, settings re-merge in V10c) — if the test exercises the settings sub-arm, `V10c` must be in `Deps`, not only `V9b`.

## Relationships

- T14 "ERR-7 test bullet states different normative content in the paired V4e leaves" — decision-dependency (the canonical-term and two-arm decision made here for V4e's `ERR-7` bullet constrains how V4e-T's mirrored bullet must be aligned).

---

# T16 — V5e per-boundary routing test asserts destination error surfaces its `Deps` cannot reach

**Original heading:** Per-boundary routing assertions presuppose destination error-variant surfaces not in Deps
**Original section:** Consolidated Plan Review — plan
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V5e` owns the JSON-document depth-5 walk (ceiling #4) and, in its second Tests bullet, asserts the spec's per-boundary destination/surface table: a depth-6 breach at each of the five enforcement sites wraps into a specific surface — typed-query response → `ValidationError`, code-driven tool args → `CodeToolError`, `params` (invoke arm) and `invoke<T>` return → `InvokeInfraError`, model-driven tool args → model feedback, and slash-load `params` → ceiling-#3 cross-route (per `spec_topics/hard-ceilings/ceilings-3-and-4.md` §Per-boundary destination/surface table).

The `ValidationError`, `CodeToolError`, and `InvokeInfraError` carrier schemas are defined elsewhere: the nine-variant `QueryError` union (including `ValidationError` and `InvokeInfraError`) is owned by `V4d`, and the closed `CodeToolError` enum plus its code-driven firing path are owned by `V14a`. `V5e`'s `Deps` are only `V5e-T, V5d, V16a`; neither `V4d` nor `V14a` is named, and neither is reachable transitively (`V5d → V5a, V5b, V2d`; `V16a → V16a-T, V9d`). The mirror tests-task leaf `V5e-T` carries the identical bullet with the identical `Deps` gap.

`V5e` therefore asserts routing of a breach into surface types it does not declare a dependency on. An implementer picking `V5e` once its declared `Deps` are satisfied (the plan's "pick the next leaf whose `Deps` are satisfied" rule) can reach it before `V4d`/`V14a` exist, at which point the routing assertion cannot reference the destination variant schemas — the implementer either cannot compile the test or hand-rolls ad-hoc surfaces that need not match the canonical variant shapes those leaves own.

## Plan Documents

- `docs/plan_topics/V5e-depth-enforcement.md` — Tests bullet 2 / Deps (edited)
- `docs/plan_topics/V5e-T-depth-enforcement.md` — Tests bullet 2 / Deps (edited)
- `docs/plan_topics/V4d-queryerror-variants.md` — `ValidationError` / `InvokeInfraError` / `CodeToolError` variant-schema owner (read-only)
- `docs/plan_topics/V14a-tool-calls.md` — closed `CodeToolError` enum + code-driven firing owner (read-only)
- `docs/plan_topics/V13c-query-tool-loop.md` — typed-query response / model-driven tool-args site owner (read-only)
- `docs/plan_topics/V15a-invocation-core.md` — invoke `params` / `invoke<T>` return site owner (read-only)
- `docs/plan_topics/V16a-ceiling-order-masked.md` — distributed-enforcement / in-isolation precedent (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices (V4, V5, V13, V14, V15, V16)

**Leaves (implementation order):**

- V5e — JSON document depth enforcement (hard ceiling #4) — (modified)
- V5e-T — JSON document depth enforcement (tests) — (modified)
- V13c — Query tool loop and typed two-phase — (read-only context)
- V14a — Tool calls (code-side) and `CodeToolError` — (read-only context)
- V15a — Invocation core — (read-only context)
- V16a — Hard-ceiling interaction order and `masked` co-fire — (read-only)

## Consequence

**Severity:** correctness

Two implementers diverge: one adds the missing surface-owning leaves to `V5e`'s `Deps`; the other, finding the destination types absent when `V5e`'s declared `Deps` are met, hand-rolls one-off `ValidationError`/`CodeToolError`/`InvokeInfraError` stubs that need not match the canonical variant schemas owned by `V4d`/`V14a`. `V5e`'s `Ships when` ("correct routing at all five sites") is unobservable until the destination surfaces exist, so the leaf can ship asserting routing into surfaces that drift from their owners' definitions.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e ("pi-loom plan: build/update plan for spec.md + review")
**History:** `V5e-depth-enforcement.md` was created in c6a664e with both the per-boundary routing Tests bullet (asserting `ValidationError` / `CodeToolError` / `InvokeInfraError` wrapping) and the `Deps. V5e-T, V5d, V16a` line already in their current form — the gap is original to the leaf. The only later edit, e2b7e81 ("resolve isolated cross-ceiling unit interface/authority undefined"), added the V16a `masked`-consult sentence to `Adds.` and did not touch the `Deps` line or the routing bullet, so it neither introduced nor closed the gap. The paired `V5e-T` carries the same originally-introduced bullet and `Deps`.

## Solution Space

**Shape:** single

The spec topic `spec_topics/hard-ceilings/ceilings-3-and-4.md` §Per-boundary destination/surface table is the normative source for the five-row routing and is read-only for this fix; the fix is internal to the plan leaves.

### Recommendation

Narrow `V5e` to the behaviour it owns and defer surface-wrapping to the site owners. `V5e` asserts the depth walk, the `maxDepth` `ValidationIssue` (`schema_keyword`/`message`/`cause`), and the routing *decision* (which site maps to which surface class) — exercised in isolation against the harness, mirroring `V16a`'s pattern (the arbitration decision is driven through the seam in isolation; the live AJV/round/invoke sites are built downstream). The actual wrapping of a depth-6 breach into `ValidationError` / `CodeToolError` / `InvokeInfraError` is asserted at each site's owning leaf.

Restate `V5e`/`V5e-T` Tests bullet 2 as the routing decision `V5e` owns; locate the per-site surface-wrapping assertions at `V13c` (typed-query `ValidationError`, model-driven feedback), `V14a` (code-driven `CodeToolError`), `V15a` (invoke `params` `InvokeInfraError`, `invoke<T>` return), and `V4e` (slash-load cross-route to ceiling #3). No `Deps` additions to `V5e` are required. This matches the distributed-enforcement model the plan already uses for ceiling #4 and keeps `V5e` pickupable once `V5d`/`V16a` land.

Edge cases the implementer must watch: confirm each of the five per-boundary rows is asserted at its site owner so no row silently goes unverified; the model-driven row produces no loom-code `Err` (tool-result fed back to the model) and the slash-load `params` row is load-time (no `Result`), so those two are decision-only at `V5e` by nature and have no `Err`-wrapping assertion to relocate.

## Relationships

- T15 "ERR-7 test injects at an undefined "channel seam" and omits the two-arm owners from `Deps`" — same-cluster (same defect class — Tests reference a surface/owner absent from `Deps`; resolves independently).
- T12 "V4c/V4c-T name the H4a harness and session double but omit H4a from Deps" — same-cluster (same defect class; resolves independently).
- T13 "V8a's `Checkpoint` `loop-iter` macrotask yield has no substrate seam in its Deps" — same-cluster (same defect class — leaf assumes an owner not in `Deps`).

---

# T17 — DISC-4 tests bullet: "the superseded entry is dispatched" contradicts "loom loses" (V10a-T mirror)

**Original heading:** DISC-4 — same contradiction (V10a-T mirror)
**Original section:** Consolidated Plan Review — plan
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `DISC-4` Tests bullet in the `V10a-T` tests leaf reads, verbatim, "a slash-name collision (loom-vs-loom same priority, loom-vs-Pi) fires `cross-format-collision` on the final derived name; loom loses; the superseded entry is dispatched." The clause "loom loses" establishes the loom as the losing (dropped) entry; the immediately following "the superseded entry is dispatched" then reads as "the loser runs," directly contradicting it. The bullet does not say what "dispatched" produces, so a reader cannot tell whether "superseded entry" means the dropped loom (which must *not* run) or the surviving non-loom registration.

The spec resolves this unambiguously. Per `discovery-sources.md` §DISC-4, the loom's `LoomRegistry` entry is dropped, but because Pi exposes no symmetric `pi.unregisterCommand`, the loom's earlier `pi.registerCommand(name, …)` registration survives in the command router; a dispatch of that orphaned `/<name>` route therefore "returns a fixed superseded system note instead of running the dropped loom, via the superseded-entry dispatch sub-case." So both halves are true in spec terms — loom loses *and* the orphaned route is still dispatchable — but the plan bullet compresses them so tightly that it instead reads as a contradiction.

This is the paired-leaf mirror of the same defect in the `V10a` implementation leaf, whose `DISC-4` bullet carries identical wording. Because `V10a-T` is the tests partner, an executor writing the failing test from the ambiguous bullet could assert the dropped loom runs (wrong) rather than asserting that the orphaned route returns the fixed superseded system note. The disambiguation chosen for `V10a` must be applied identically here so the tests and the implementation agree.

## Plan Documents

- `docs/plan_topics/V10a-T-discovery-walk.md` — DISC-4 Tests bullet (edited)
- `docs/plan_topics/V10a-discovery-walk.md` — DISC-4 Tests bullet (read-only; edited under the paired V10a finding — the two disambiguations must be identical)
- `docs/plan_topics/V9b-registration-drain-state.md` — Adds / drain-state contract (read-only; owns the spec's "superseded-entry dispatch" sub-case the disambiguation must align with)

## Spec Documents

- `docs/spec_topics/discovery/discovery-sources.md` — §DISC-4 and the cross-format-collision paragraph (read-only; authoritative source for the disambiguation)

## Affected Leaves

**Phases:** Vertical slices (V10)

**Leaves (implementation order):**

- V10a-T — Discovery walk, sources, and collisions (tests) — (modified)
- V10a — Discovery walk, sources, and collisions — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers reading the ambiguous bullet diverge: one writes a DISC-4 test asserting the dropped loom is dispatched/runs, the other asserts the orphaned `/<name>` returns a fixed superseded system note (the spec behaviour). Because this is the tests leaf, a wrong reading locks an incorrect acceptance assertion into `V10a-T` that the `V10a` implementation must then satisfy, shipping discovery-collision behaviour that contradicts `discovery-sources.md` §DISC-4.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V10a-T-discovery-walk.md` was added in its first and only commit (c6a664e); the ambiguous DISC-4 phrasing ("loom loses; the superseded entry is dispatched") was present verbatim from that initial authoring, mirroring the identical wording introduced for `V10a` in the same commit.

## Solution Space

**Shape:** single

### Recommendation

In `V10a-T`'s `DISC-4` Tests bullet, replace "loom loses; the superseded entry is dispatched" with text that names the observable behaviour from `discovery-sources.md` §DISC-4: the loom's `LoomRegistry` entry is dropped (loom loses asymmetrically — it never preempts the non-loom registration), and a later dispatch of the orphaned `/<name>` route returns the fixed superseded system note rather than running the dropped loom (the spec's "superseded-entry dispatch" sub-case). For example, render the tail as: "loom loses (its `LoomRegistry` entry is dropped); a dispatch of the orphaned `/<name>` returns the fixed superseded system note rather than running the dropped loom."

Apply the identical disambiguation chosen for the paired `V10a` `DISC-4` bullet so the tests leaf and implementation leaf agree word-for-word. The spec is read-only for this fix — do not alter `discovery-sources.md`; align the bullet to it. If the editor distinguishes the loom-vs-loom same-priority arm from the loom-vs-Pi cross-format arm, keep the per-arm dispatch outcome consistent with the spec paragraph.

## Relationships

- T18 "DISC-4 acceptance bullet mis-states what happens to a superseded loom" — decision-dependency (the disambiguation chosen for the V10a impl-leaf bullet constrains this V10a-T mirror; both edits must land identical wording).

---

# T18 — DISC-4 acceptance bullet mis-states what happens to a superseded loom

**Original heading:** DISC-4 — "loom loses" contradicts "the superseded entry is dispatched"
**Original section:** Consolidated Plan Review — plan
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `DISC-4` acceptance bullet in the discovery-walk leaf ends with `loom loses; the superseded entry is dispatched`. Read against the rest of the same clause, this is self-contradictory: `loom loses` establishes the loom as the losing / superseded entry, and `the superseded entry is dispatched` then reads as "the loser is dispatched (runs)". A test author has two equally-defensible readings — that the superseded loom runs, or that `superseded` is a slip for `superseding` and the *winner* runs — and would write opposite assertions.

The spec admits neither reading. Per [Discovery — DISC-4](../spec_topics/discovery/discovery-sources.md#disc-4), when a same-name collision is detected at `session_start`, **none of the colliding entries register** and a loom loses asymmetrically against a Pi-owned `.md` prompt / skill / sibling-extension command (the loom never preempts the non-loom registration). Separately, the [superseded-entry dispatch](../spec_topics/pi-integration-contract/drain-state-contract.md#superseded-entry-dispatch) sub-case governs a loom that *was* registered and is then dropped from `LoomRegistry` by a later-appearing Pi template: because Pi exposes no `pi.unregisterCommand`, the loom's earlier `pi.registerCommand` survives, so `/<name>` still reaches the slash handler, the entry-table lookup misses, and the handler returns the fixed system note `"loom /<name>: superseded; /reload to refresh"` **instead of running the dropped loom**. In other words the superseded loom is precisely the thing that is *not* dispatched — the orphaned command name dispatches to a handler that emits a note. The leaf's terse phrasing inverts this.

## Plan Documents

- `docs/plan_topics/V10a-discovery-walk.md` — `Tests.` `DISC-4` bullet (edited)
- `docs/plan_topics/V10a-T-discovery-walk.md` — `Tests.` `DISC-4` bullet (edited; co-resolved via the mirror finding)

## Spec Documents

- `docs/spec_topics/discovery/discovery-sources.md` — DISC-4 slash-name collision rules (read-only)
- `docs/spec_topics/pi-integration-contract/drain-state-contract.md` — superseded-entry dispatch (read-only)

(The spec already states the correct behaviour; the fix is internal to the plan leaves.)

## Affected Leaves

**Phases:** Vertical — V10 (Discovery and settings)

**Leaves (implementation order):**

- `V10a-T` — Discovery walk, sources, and collisions (tests) — (modified)
- `V10a` — Discovery walk, sources, and collisions — (modified)

## Consequence

**Severity:** correctness

The `DISC-4` bullet is the acceptance criterion the `V10a-T` test author works from. Taken literally it directs a test that asserts the superseded loom runs on dispatch, which contradicts the spec (a superseded `/<name>` returns the `superseded; /reload to refresh` system note and the loom does not run). Two implementers would write divergent tests, and one of them would pin behaviour the spec forbids.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The `V10a-discovery-walk.md` leaf and its `V10a-T-discovery-walk.md` tests mirror entered the corpus in their single, first commit c6a664e — the plan-build pass for spec.md. The `DISC-4` bullet's `loom loses; the superseded entry is dispatched` phrasing was present verbatim in that initial commit; `git log -S` over the defect token in `docs/plan_topics/` returns only that one commit, so the ambiguity has been present since the leaves were created and was never introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

In both `docs/plan_topics/V10a-discovery-walk.md` and `docs/plan_topics/V10a-T-discovery-walk.md`, rewrite the trailing portion of the `DISC-4` `Tests.` bullet so it stops asserting that the superseded loom is dispatched. Replace the clause `; loom loses; the superseded entry is dispatched.` with text that states the two spec outcomes explicitly:

- On the immediate same-name collision, none of the colliding entries register; against a Pi-owned `.md` prompt / skill / sibling-extension command the loom loses asymmetrically (the Pi-owned entry survives, the loom does not register).
- For the supersession sub-case, a dispatch of the orphaned `/<name>` (whose `LoomRegistry` entry was dropped but whose `pi.registerCommand` registration survives) returns the fixed superseded system note `"loom /<name>: superseded; /reload to refresh"` rather than running the dropped loom.

Suggested replacement clause text (adjust prose to match the leaf's bullet style): ``; the loom loses asymmetrically — it does not register, the Pi-owned entry survives; and a later dispatch of the orphaned `/<name>` returns the fixed `"loom /<name>: superseded; /reload to refresh"` system note rather than running the dropped loom (per spec superseded-entry dispatch).`` Keep both leaves' `DISC-4` bullets textually identical so the implementation and tests tasks agree.

## Relationships

- T17 "DISC-4 tests bullet: "the superseded entry is dispatched" contradicts "loom loses" (V10a-T mirror)" — co-resolve (the identical bullet in the `V10a-T` tests leaf; the same disambiguation must land in both).

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
