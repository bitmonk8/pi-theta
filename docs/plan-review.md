# Triaged Plan Review — plan

_Generated: 2026-06-11T03:55:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T44) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 31 medium retained; 39 low discarded; 0 low findings merged into 0 medium findings; 16 NIT dropped; 0 false dropped._

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

# T19 — V13c-T exhaustion test bullet omits the surfaced ceiling for the depth-6 co-fire vector

**Original heading:** Exhaustion bullet — same under-specification (V13c-T mirror)
**Original section:** Consolidated Plan Review — plan
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

V13c-T's exhaustion Tests bullet reads: "an untyped exhaustion produces `ToolLoopExhaustedError`; the depth-6 co-fire vector sets `masked:["ceiling#2"]` (ceiling #2, `CIO-4`) on the typed-query response." It is a verbatim mirror of the same bullet in the paired implementation leaf V13c. The bullet conflates two distinct scenarios and, for the depth-6 co-fire vector, states only the `masked` content while never naming the `surfaced` ceiling.

Per the spec these are two separate events. An untyped exhaustion surfaces ceiling #2 — `ToolLoopExhaustedError` — at the tool-call-round boundary (CIO-4), and that surface omits `masked` (its reachable mask domain is empty, `ceilings-3-and-4.md#pic-1` row "Tool-call-round boundary"). The depth-6 co-fire vector is a different event: per PIC-1 the only non-empty reachable mask `["ceiling#2"]` is reachable solely on the `validation` event at the typed-query response sub-row of the CIO-3 AJV boundary, where the `surfaced` ceiling is **ceiling #4** (`cause: "schema_validation"`, `schema_keyword: "maxDepth"`). The arbitration seam's contract is `arbitrate(candidate) → { surfaced, masked? }`, so a co-fire vector is only fully specified once both fields are pinned.

As written, the bullet pairs "produces `ToolLoopExhaustedError`" (a ceiling #2 surface) with `masked:["ceiling#2"]` (ceiling #2 enumerated as masked), leaving a test author unable to tell whether ceiling #2 surfaced or was masked for the depth-6 vector, and with no stated `surfaced` ceiling to assert against.

## Plan Documents

- `docs/plan_topics/V13c-T-query-tool-loop.md` — Tests, exhaustion bullet (edited)
- `docs/plan_topics/V13c-query-tool-loop.md` — Tests, exhaustion bullet (edited)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — PIC-1, per-site reachable mask domain + V1 reachable predicate (read-only)
- `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` — CIO-3 / CIO-4 / `masked` field (read-only)

## Affected Leaves

**Phases:** V13 — Query (vertical slice)

**Leaves (implementation order):**

- V13c-T — Query tool loop and typed two-phase (tests) — (modified)
- V13c — Query tool loop and typed two-phase — (modified)

## Consequence

**Severity:** correctness

The exhaustion bullet defines what V13c-T's failing tests must assert. With the `surfaced` ceiling unstated and two scenarios merged into one clause, two reasonable test authors diverge: one asserts the ceiling #2 `ToolLoopExhaustedError` surface, the other the ceiling #4 `validation` surface that actually carries `masked:["ceiling#2"]`. A test that asserts the wrong surface would let a non-conforming implementation pass the co-fire gate while still going red, defeating the leaf's purpose.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The exhaustion bullet entered V13c-T — and its V13c implementation twin — in the plan's first commit and has carried the same under-specification verbatim ever since: `masked:["ceiling#2"]` paired with `ToolLoopExhaustedError` on the typed-query response, with no `surfaced` identifier and the untyped-exhaustion and depth-6 co-fire scenarios merged into one clause. A pickaxe walk (`git log -S 'masked:["ceiling#2"]'` and `git log -S 'depth-6 co-fire'`) localises the phrasing to that single commit in both files; no later edit touched it.

## Solution Space

**Shape:** single

### Recommendation

In both `docs/plan_topics/V13c-T-query-tool-loop.md` and `docs/plan_topics/V13c-query-tool-loop.md`, rewrite the exhaustion Tests bullet so the two events are stated separately and the depth-6 co-fire vector names its `surfaced` ceiling:

- The untyped exhaustion event surfaces ceiling #2 — `ToolLoopExhaustedError` — at the tool-call-round boundary (CIO-4), with `masked` omitted.
- The depth-6 co-fire vector on the typed-query response surfaces ceiling #4 — a `validation` event with `cause: "schema_validation"` / `schema_keyword: "maxDepth"` (CIO-3) — and carries `masked:["ceiling#2"]`.

Express the depth-6 vector as `surfaced:"ceiling#4", masked:["ceiling#2"]` so both fields of the arbitration output are pinned. The `surfaced` value is read directly off PIC-1's per-site reachable mask-domain table (typed-query response row) — confirm it against `runtime-event-channel.md#pic-1` rather than inferring it. Apply the identical disambiguation to both leaves so the implementation leaf and its tests stay in lockstep.

## Relationships

- T20 "V13c/V13c-T exhaustion bullet leaves the depth-6 co-fire vector's surfaced ceiling unstated" — co-resolve (the V13c twin of this exact bullet; the same disambiguation fixes both).
- T21 "V13c `Spec` field omits `tool-calls.md`..." — same-cluster (same V13c/V13c-T leaf pair; resolves independently).

---

# T20 — V13c/V13c-T exhaustion bullet leaves the depth-6 co-fire vector's surfaced ceiling unstated

**Original heading:** Exhaustion bullet — surfaced ceiling unstated in the depth-6 co-fire vector
**Original section:** Consolidated Plan Review — plan
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

V13c's third Tests bullet reads: "an untyped exhaustion produces `ToolLoopExhaustedError`; the depth-6 co-fire vector sets `masked:["ceiling#2"]` (ceiling #2, `CIO-4`) on the typed-query response." The single bullet stacks two distinct scenarios separated by a semicolon, and in doing so makes ceiling #2 appear in two opposite roles without saying so: first as the *surfaced* outcome of an untyped exhaustion (`ToolLoopExhaustedError` is the ceiling-#2 surface), then as the *masked* entry of the typed depth-6 vector. The bullet never names what ceiling the depth-6 vector actually surfaces.

Per the normative worked example ([`query-tool-loop.md` — Worked example: depth-6 forced respond at `max_rounds`](../../../docs/spec_topics/query/query-tool-loop.md)), the depth-6 co-fire vector surfaces **ceiling #4** — the typed-query response returns `Err(QueryError { kind: "validation", cause: "schema_validation", … schema_keyword: "maxDepth" … })` and the corresponding `RuntimeEvent` carries `kind: "validation"` with `masked: ["ceiling#2"]`. Ceiling #2 is the *co-satisfied-but-masked* sibling, not the surface. (Note the spec wire shape has no `surfaced` field; the surfaced ceiling is conveyed by the event `kind` / `Err` variant, so the surfaced ceiling must be named as the `validation`/`maxDepth` outcome, not as a literal `surfaced:` key.)

Because this worked-example vector is explicitly cited by the `RuntimeEvent`-shape conformance test and the typed-query test suite, a test author drafting the depth-6 case from V13c's bullet alone could mis-target the assertion — asserting a `ToolLoopExhaustedError`/ceiling-#2 surface (the wrong outcome, named in the same breath) rather than the `validation`/`maxDepth` `Err` that the vector actually produces. The paired V13c-T leaf carries the identical bullet and the identical ambiguity.

## Plan Documents

- `docs/plan_topics/V13c-query-tool-loop.md` — Tests (exhaustion bullet) (edited)
- `docs/plan_topics/V13c-T-query-tool-loop.md` — Tests (exhaustion bullet, paired mirror) (edited)
- `docs/plan_topics/V9d-runtime-event-channel.md` — Tests / `PIC-1` `masked` field (read-only)
- `docs/plan_topics/V16a-ceiling-order-masked.md` — cross-ceiling arbitration seam `{ surfaced, masked }` (read-only)
- `docs/plan_topics/V5e-depth-enforcement.md` — ceiling-#4 (`maxDepth`) surface owner (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice V13

**Leaves (implementation order):**

- V13c-T — Query tool loop and typed two-phase (tests) — modified
- V13c — Query tool loop and typed two-phase — modified

## Consequence

**Severity:** correctness

Two reasonable test authors drafting the depth-6 co-fire case from V13c's bullet alone can diverge: one asserts the `validation`/`maxDepth` `Err(QueryError)` surface with `masked:["ceiling#2"]` (correct, matching the normative worked example), the other asserts a `ToolLoopExhaustedError`/ceiling-#2 surface (wrong) because the bullet names that surface immediately before the `masked` clause. Since the worked-example vector is the cited basis for the conformance and typed-query suites, the ambiguity can produce a test that gates the wrong outcome.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The exhaustion bullet entered `docs/plan_topics/V13c-query-tool-loop.md` in that file's first commit (c6a664e), verbatim as it reads today; the paired `V13c-T` leaf carries the identical bullet from the same commit. A pickaxe (`git log -S 'depth-6 co-fire vector sets'`) over both leaves returns only c6a664e, and no later commit touched the clause — the under-specification is present since the leaves' inception.

## Solution Space

**Shape:** single

### Recommendation

In the third Tests bullet of `docs/plan_topics/V13c-query-tool-loop.md` (the `query-tool-loop.md — exhaustion` bullet), split the two scenarios so each names its surfaced ceiling:

- **Untyped exhaustion:** ceiling #2 surfaces as `Err(QueryError { kind: "tool_loop_exhausted" })` (`ToolLoopExhaustedError`); no `masked` (the field is omitted, never `[]`).
- **Typed depth-6 co-fire vector:** ceiling #4 surfaces on the typed-query response as `Err(QueryError { kind: "validation", cause: "schema_validation" })` (`schema_keyword: "maxDepth"`), and the surface's `masked` enumerates the co-satisfied ceiling #2 — i.e. `masked:["ceiling#2"]` (`CIO-4`/`CIO-6`).

State the surfaced ceiling for the depth-6 vector by its observable outcome (the `validation`/`maxDepth` `Err`), not as a literal `surfaced:` wire key — the spec's `RuntimeEvent`/diagnostic shape carries only `kind` plus the optional `masked` field, with no `surfaced` field. The authoritative vector is [`query-tool-loop.md` — Worked example: depth-6 forced respond at `max_rounds`](../../../docs/spec_topics/query/query-tool-loop.md); keep the bullet consistent with `V9d`'s `PIC-1` phrasing. Apply the same disambiguation verbatim to the mirrored bullet in `docs/plan_topics/V13c-T-query-tool-loop.md`.

## Relationships

- T19 "V13c-T exhaustion test bullet omits the surfaced ceiling for the depth-6 co-fire vector" — co-resolve (the identical bullet in the paired tests leaf takes the same disambiguation).

---

# T21 — V13c `Spec` field omits `tool-calls.md`, leaving its `Promise.allSettled` use unauthorised by *Sequential by default*

**Original heading:** `Spec` field omits `tool-calls.md`, blocking the `Promise.allSettled` exemption
**Original section:** Consolidated Plan Review — plan
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V13c` (Query tool loop and typed two-phase) implements the model-driven parallel tool-call batch with `Promise.allSettled`: its `Adds.` field states the batch "awaits every sibling call to settle via `Promise.allSettled` ([tool-calls.md — Concurrency](../spec_topics/tool-calls.md#concurrency), TOOL code-keyed area)," and its `Tests.` carry a matching bullet citing the same TOOL code-keyed area. Because `Adds.` names the construct alongside a code-keyed obligation area, this is a Class-1 binding mechanism, not illustrative prose.

The *Sequential by default* cross-cutting rule in `conventions.md` forbids `Promise.allSettled` in `src/**` "unless the calling leaf's `Spec.` field cites an obligation whose normative text mandates concurrency at this site … and the leaf's `Adds.` field names the construct together with that REQ-ID or code-keyed obligation area." V13c's `Spec.` field lists `query/query-tool-loop.md`, `hard-ceilings/ceilings-3-and-4.md`, and `cancellation.md` — but **not** `tool-calls.md`, the page carrying the concurrency-mandating "Concurrency" obligation. The `Adds.` half of the precondition is satisfied; the `Spec.`-field half is not.

The field is also non-conformant to the `Spec`-field closure rule (`conventions.md`, leaf-format §`Spec.`): the field "MUST be closed under normative cross-link." V13c lists `query-tool-loop.md`, whose "Tool-call loop bound" section normatively cross-links `tool-calls.md#concurrency` ("each lowered independently per [Tool Calls — Concurrency](../tool-calls.md#concurrency)"). A correctly-closed field would therefore include `tool-calls.md`. An implementer reading the convention literally — and restricting reading to the listed `Spec.` pages, as the convention explicitly permits — sees neither the obligation page nor a satisfied exemption precondition, and cannot legitimately write the `Promise.allSettled` the leaf's `Adds.`/`Tests.` require. The sibling leaf `V14a`, which owns the same TOOL code-keyed area, lists `tool-calls.md` in its `Spec.` field correctly, so V13c's omission reads as accidental.

## Plan Documents

- `docs/plan_topics/V13c-query-tool-loop.md` — `Spec.` field (edited)
- `docs/plan_topics/V13c-T-query-tool-loop.md` — `Spec.` field (edited)
- `docs/plan_topics/conventions.md` — *Sequential by default* rule and leaf-format `Spec.`-field closure rule (read-only)
- `docs/plan_topics/coverage-matrix.md` — *Code-keyed obligation areas* (TOOL → `V14a`, `V13c`) (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice V13 — Query

**Leaves (implementation order):**

- `V13c` — Query tool loop and typed two-phase — (modified)
- `V13c-T` — Query tool loop and typed two-phase (tests) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one treats `query-tool-loop.md`'s normative cross-link as transitively pulling `tool-calls.md` into closure and proceeds with `Promise.allSettled`; the other reads the `Spec.` field literally, finds the *Sequential by default* exemption precondition unmet, and stops per the *Spec drift* rule. The leaf is internally inconsistent — its `Adds.`/`Tests.` mandate a concurrency construct its `Spec.` field does not authorise.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** db4ef95 — pi-loom plan: resolve "Parallel-batch settle-and-independent-lowering rule has no asserting leaf" (2026-06-10, Thomas Andersen); 75b6a9b — pi-loom plan: resolve "Sequential by default carve-out admits only a numbered REQ-ID" (2026-06-10, Thomas Andersen)
**History:** V13c's first commit (c6a664e, 2026-06-10) carried a `Spec.` field of `query-tool-loop.md` + `ceilings-3-and-4.md` and no concurrency construct. db4ef95 added the `Tests.` bullet citing `tool-calls.md#concurrency` (TOOL code-keyed area) without adding `tool-calls.md` to the `Spec.` field. 75b6a9b then added `Promise.allSettled` to the `Adds.` field — invoking the *Sequential by default* exemption that requires the `Spec.` field to cite the concurrency obligation — again without adding `tool-calls.md` to the `Spec.` field. The defect arises from the interaction: the construct and its obligation citation landed in `Adds.`/`Tests.`, but neither commit closed the `Spec.` field over the `tool-calls.md` cross-link.

## Solution Space

**Shape:** single

### Recommendation

Add `tool-calls.md` to the `Spec.` field of both `V13c` and `V13c-T`. In each file's `**Spec.**` line, insert the entry `[`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md)` alongside the existing `query-tool-loop.md`, `ceilings-3-and-4.md`, and `cancellation.md` entries. This both closes the field under the normative cross-link from `query-tool-loop.md`'s "Tool-call loop bound" section and satisfies the *Sequential by default* exemption precondition; the `Adds.` field already names `Promise.allSettled` together with the TOOL code-keyed area, so once the `Spec.` field cites `tool-calls.md`, both halves of the precondition hold.

Edge case: `tool-calls.md` (TOOL) is already enumerated under `coverage-matrix.md`'s *Code-keyed obligation areas* (closed by `V14a`, `V13c`), so the eventual ESLint allow-list token resolves at the closing gate with no `coverage-matrix.md` edit. Keep `V13c-T`'s `Spec.` field byte-identical to `V13c`'s, as the paired tests task already mirrors it.

## Relationships

- T44 "V11d / V11d-T `Spec` field omits the normatively cross-linked `binder-bypass-and-envelope.md`" — same-cluster (same closure-rule defect class, different leaf and page; resolves independently).
- T23 "`M` Spec-field "happy-path subset only" qualifier conflicts with the closure-under-cross-link rule" — same-cluster (same `Spec`-field closure rule; resolves independently).

---

# T22 — M-T `Spec` field — "happy-path subset only" qualifier contradicts the closure rule

**Original heading:** M-T `Spec` field — identical "happy-path subset only" ambiguity (mirror)
**Original section:** Consolidated Plan Review — plan
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`M-T`'s `Spec.` field lists four spec-topic pages and closes with the trailing qualifier `— the happy-path subset only.` `conventions.md` §Leaf format defines the `Spec.` field as the set of pages the leaf implements and states that it **MUST be closed under normative cross-link**: closure runs outbound from each listed topic, applies transitively to a fixed point, and excludes only narrative cross-links per `governance.md` GOV-3. The field therefore governs *reading / closure*, not implementation scope.

Attaching "the happy-path subset only" to that field admits two incompatible readings: (a) the implementer reads only the happy-path *portions* of the listed pages — which contradicts closure-under-cross-link and silently shrinks the mandated reading set; or (b) the implementer reads the pages normally (closed under cross-link) but *implements* only the happy path. The leaf's intent is (b) — the narrowing is a scope-of-implementation statement that belongs in `Adds.`, not a reading restriction on `Spec.`

This is the paired tests-task mirror of the `M` leaf defect; the qualifier is byte-identical in both files. It is filed and fixed separately because the edit lands in a different file, but the chosen wording must match `M` so the paired leaves stay identical.

## Plan Documents

- `docs/plan_topics/M-T-minimal-slash-command.md` — `Spec.` field (edited)
- `docs/plan_topics/M-minimal-slash-command.md` — `Spec.` field (read-only; the mirror leaf whose chosen wording this fix must match)
- `docs/plan_topics/conventions.md` — §Leaf format, `Spec.` field definition (read-only; defines the closure rule the qualifier contradicts)

## Spec Documents

None

## Affected Leaves

**Phases:** MVP

**Leaves (implementation order):**

- M — Minimal end-to-end `.loom` slash command — (modified)
- M-T — Minimal end-to-end `.loom` slash command (tests) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one restricts spec reading to "happy-path portions" and may miss a cross-linked normative obligation that closure would have pulled in, while another reads the full closed set. Because the qualifier sits on the field that defines mandatory reading closure, the under-reading interpretation is defensible, so the MVP leaf can ship having consulted an incomplete spec set.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `M-T-minimal-slash-command.md` was created in c6a664e, the commit that built the plan corpus, and the `Spec.` field has carried the `— the happy-path subset only.` qualifier since that first commit (`git log -S` for the phrase and `git log --follow` for the file both bottom out at c6a664e). The same commit introduced the identical qualifier on the paired `M` leaf. No later commit altered it.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/M-T-minimal-slash-command.md`, strike the trailing `— the happy-path subset only.` from the `Spec.` field, leaving the four cited spec-topic pages as the closure-complete reading set. Carry the happy-path scope restriction in `Adds.` instead: `M-T`'s `Adds.` describes the narrowest pipeline but does not currently state the implementation-scope boundary the way `M`'s `Adds.` does ("this leaf implements only the happy path"), so add the equivalent scope sentence to `M-T`'s `Adds.` if `M`'s resolution relocates it there.

Apply the same wording chosen for the `M` finding so the paired leaves remain identical; resolve `M` first and mirror its exact phrasing here.

## Relationships

- T23 "`M` Spec-field "happy-path subset only" qualifier conflicts with the closure-under-cross-link rule" — decision-dependency (same defect on the paired implementation leaf; the wording chosen there must be applied verbatim here).

---

# T23 — `M` Spec-field "happy-path subset only" qualifier conflicts with the closure-under-cross-link rule

**Original heading:** M `Spec` field — "the happy-path subset only" contradicts the closure rule
**Original section:** Consolidated Plan Review — plan
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`conventions.md` §Leaf format defines the **Spec.** field as the pages a leaf implements, and states the field "MUST be closed under normative cross-link: closure runs from each listed topic outbound, applies transitively to a fixed point, and excludes narrative cross-links." The field governs **which spec text the implementer must read** — its scope is reading/closure, not implementation extent.

`M`'s Spec field ends with the trailing qualifier "— the happy-path subset only" appended to its four-page list. Placed on the Spec field, that qualifier reads two incompatible ways: (a) read only the happy-path *portions* of the four listed pages — which directly contradicts the closure-under-cross-link mandate, since closure is over whole topics and their transitive normative links, not a hand-picked subset; or (b) read the pages in full but *implement* only the happy path. `M`'s `Adds.` already carries the implementation-scope statement ("this leaf implements only the happy path"), which supports reading (b) — but the qualifier sits on the Spec field, where it appears to narrow reading/closure rather than implementation.

Two reasonable implementers diverge: one restricts their spec reading to the happy-path slices of each page (and may miss normative obligations the closure rule requires them to read), the other reads the full closed set. The scope-narrowing intent belongs on the implementation-extent surface (`Adds.`), not on the reading/closure surface (`Spec.`).

## Plan Documents

- `docs/plan_topics/M-minimal-slash-command.md` — Spec field / Adds field (edited)
- `docs/plan_topics/conventions.md` — §Leaf format, Spec-field closure definition (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** MVP

**Leaves (implementation order):**

- `M-T` — Minimal end-to-end `.loom` slash command (tests) — (modified)
- `M` — Minimal end-to-end `.loom` slash command — (modified)

## Consequence

**Severity:** correctness

A spec-field qualifier that reads as a reading-scope restriction overrides the closure-under-cross-link mandate for two reasonable implementers in opposite directions; one under-reads the closed normative set for the listed pages and can omit obligations the closure rule requires, while the other reads the full set. The minimal end-to-end vertical is the pipeline's correctness baseline, so a divergent reading here propagates ambiguity into the first concrete implementation.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e ("pi-loom plan: build/update plan for spec.md + review", 2026-06-10)
**History:** `docs/plan_topics/M-minimal-slash-command.md` was added in c6a664e, the initial plan-build commit. The "— the happy-path subset only" qualifier on the Spec field was present in that first revision (`git show c6a664e:docs/plan_topics/M-minimal-slash-command.md`) and `git log -S "the happy-path subset only"` shows no later commit altering it. The defect is original to the leaf, not introduced by a subsequent edit.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/M-minimal-slash-command.md`, strike the trailing "— the happy-path subset only" from the **Spec.** field so the field lists only the four cross-link-closed pages (`overview.md`, `slash-invocation.md`, `discovery/discovery-sources.md`, `frontmatter/frontmatter-fields-a.md`). The implementation-extent statement already lives in `Adds.` ("this leaf implements only the happy path"), so no scope information is lost; the Spec field then carries only its reading/closure obligation as `conventions.md` requires.

If the author prefers to keep an explicit scope note adjacent to the Spec list rather than rely on `Adds.` alone, reword the qualifier to make the reading-vs-implementation boundary explicit — e.g. "implementation restricted to the happy-path rules; reading remains closed under normative cross-link" — so it no longer reads as a closure-narrowing instruction.

The paired `M-T` leaf carries the identical qualifier; its correction is tracked as its own per-file finding.

## Relationships

- T22 "M-T `Spec` field — "happy-path subset only" qualifier contradicts the closure rule" — co-resolve (same edit pattern applied to the paired tests-task file `M-T-minimal-slash-command.md`).

---

# T24 — Lint-toolchain package identities unspecified

**Original heading:** Lint-toolchain package identities unspecified
**Original section:** Consolidated Plan Review — plan
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H1a` mandates declaring the lint toolchain — "the ESLint engine, a TypeScript-aware ESLint parser, and a local custom-rule plugin mechanism" — in loom's own `devDependencies`, and adds an architectural Tests bullet that "reads `package.json#devDependencies` and asserts the lint toolchain is declared." Every component is described by role; no concrete package name (manifest key) is given for any of the three.

The architectural test cannot be written deterministically against role descriptions: a manifest read needs concrete keys to assert (`eslint`, a parser package, a local plugin entry), and "asserts the ESLint engine is declared" supplies none. This is in direct contrast to the sibling `vitest` Tests bullet on the same leaf, which names the concrete package and so resolves to "one concrete runner + assertion library." Two reasonable implementers would assert different manifest keys, or invent divergent role-presence heuristics.

`H2a` (`Deps: H1a`) "consumes exactly this toolchain" to build the `no-broad-catch` rule and the `no-restricted-syntax` allow-list and wire them into `npm test`. The downstream rule-loading and the upstream manifest assertion must agree on the same package identities; with neither leaf naming them, that agreement is left to coincidence.

## Plan Documents

- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Adds (lint-toolchain clause) and the lint-toolchain Tests bullet (edited)
- `docs/plan_topics/H2a-cross-cutting-gates.md` — downstream consumer of the toolchain (read-only)

## Spec Documents

None — the lint toolchain is horizontal infrastructure operationalising `conventions.md`; it traces to no spec REQ-ID, so the fix is internal to the plan files.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H1a — Project scaffold and toolchain — (modified)

(H2a consumes the toolchain but its acceptance criteria do not change and it is not blocked; listed under Plan Documents as a read-only consumer rather than an affected leaf.)

## Consequence

**Severity:** correctness

The H1a architectural test that "asserts the lint toolchain is declared" has no defined predicate without concrete manifest keys, so two implementers would assert different `devDependencies` entries — and H2a, which consumes "exactly this toolchain," may load rules from a package set that the H1a assertion never gated. The leaf can still be picked up (an implementer invents names) and `Ships when` stays observable, so this degrades correctness/consistency rather than blocking the leaf.

## Issue introduction

**Verdict:** single-commit
**Introducing commit:** 8df334c — "pi-loom plan: resolve \"Lint engine and custom-rule mechanism are consumed but never provisioned\"" (2026-06-11)
**History:** Before 8df334c the lint toolchain was absent from H1a's Adds — the then-open finding was that the lint engine and custom-rule mechanism were consumed by H2a but never provisioned. The 8df334c fix added the provisioning clause to Adds and a matching architectural Tests bullet, but described all three components by role ("the ESLint engine, a TypeScript-aware ESLint parser, and a local custom-rule plugin mechanism") and never named concrete packages. The package-identity gap entered the corpus with that corrective edit. The only later touch (c06749d) re-labelled the Tests bullet's `Convention:` tag and left the role-only wording intact.

## Solution Space

**Shape:** single

### Recommendation

Name the concrete packages: state the concrete `devDependencies` manifest keys in H1a's Adds and have the Tests bullet assert those exact keys — `eslint` (engine), `@typescript-eslint/parser` (TS-aware parser), and a named local custom-rule plugin entry for the bespoke `no-broad-catch` rule. The test predicate is then fully determined; H1a and H2a agree on identical keys; this mirrors the concrete `vitest` assertion already on the leaf, and the lint toolchain has no spec anchor to defer to, so the plan is the natural home for the choice.

In H1a's Adds, name the three packages — `eslint`, `@typescript-eslint/parser`, and a named local custom-rule plugin entry for `no-broad-catch` — and rewrite the lint-toolchain Tests bullet to assert those exact `package.json#devDependencies` keys (replacing "asserts the lint toolchain is declared"). H2a optionally references the same names where it builds the rules. Edge case: the local custom-rule plugin may be a workspace-local module rather than a published registry package, so the assertion should accept a relative/workspace specifier and not demand a registry name.

## Relationships

None

---

# T25 — Golden transcript and diagnostics list have no initial-correctness establishment step

**Original heading:** Golden transcript / diagnostics list correctness not established (regression-only gate)
**Original section:** Consolidated Plan Review — plan
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H7a`'s first two Tests bullets, and its `Ships when`, assert equality of the integrated run's output against a *committed golden transcript* and a *committed golden diagnostics list* checked in alongside the fixture `.loom`. Nothing in `H7a` — or in any leaf it cites — states how those goldens are established as correct when first committed. An implementer faced with "the run's appended turns match … the committed golden transcript" will most naturally capture whatever the assembled pipeline emits on its first green run and commit that capture as the golden.

Under that reading the gate only ever proves that future runs match the first run; it cannot detect a defect that was already present when the golden was captured. The leaf's `Adds.` already self-describes the gate as a "cross-slice integration-regression gate," so the regression posture is intentional — but the boundary between *establishing* the goldens (initial correctness) and *defending* them (regression) is left implicit. A golden that encodes a wrong-but-stable first output will pass `H7a` indefinitely.

The fix is a single clarifying obligation in `H7a`: state how the golden transcript and golden diagnostics list are derived/validated at first commit — human-reviewed against the spec, or assembled from the per-leaf (`Deps`) gates' already-established expected outputs — rather than snapshotted from an unreviewed pipeline run.

## Plan Documents

- `docs/plan_topics/H7a-integration-acceptance.md` — Tests bullets 1–2 / `Ships when` (edited)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H7a — Terminal integration-acceptance run (cross-slice end-to-end gate) — (modified)

## Consequence

**Severity:** advisory

If `H7a` ships unfixed, an implementer can satisfy the gate by committing an auto-captured snapshot of the first pipeline run as the "golden," so the gate silently degrades to regression-only and never establishes that the integrated composition is correct to begin with — a buggy-but-stable first output passes the terminal acceptance gate forever. The per-leaf gates still verify each behaviour in isolation, so a working leaf is still producible; the gap is that `H7a`'s authority is weaker than its phrasing implies.

## Issue introduction

**Verdict:** single-commit-introduction
**Introducing commit:** `39593c3` — "pi-loom plan: resolve \"H7a Tests bullets 1-2 lack a defined referent\"" (2026-06-11)
**History:** `H7a` was created at `e7e51cc` ("Plan has no terminal end-to-end integration-acceptance leaf", 2026-06-10) with Tests bullets phrased as "the run produces the expected appended turns" / "emits the expected `loom-system-note` diagnostics" — vague referents, but not a committed-snapshot regression gate. `git log -S "golden transcript"` / `-S "golden diagnostics"` over the leaf shows the committed-golden framing was introduced solely at `39593c3`, which rewrote both bullets to assert equality against a "committed golden transcript / golden diagnostics list checked in alongside the fixture." That commit closed the "no defined referent" finding by naming committed goldens as the referent, but in doing so introduced the present gap: it pinned the goldens as the comparison target without adding any step that establishes their initial correctness. The defect is the direct, isolated product of that one edit; it does not predate the golden framing.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H7a-integration-acceptance.md`, add a clarifying statement (a short bullet under `Tests.`, or a sentence in `Adds.`) that fixes how the committed golden transcript and golden diagnostics list are established when first committed, so the gate is not satisfiable by an unreviewed snapshot. The statement must accomplish two things in content:

- Assert that the goldens are *derived / validated*, not snapshotted — either (a) human-reviewed against `docs/spec.md` and the cited spec topics at first commit, or (b) assembled from the expected outputs the per-leaf `Deps` gates (`V5d`, `V8a`, `V11f`, `V13c`, `V14a`, `V16a`, `V17a`) already establish in isolation. Naming option (b) is preferable where the golden turns/codes map cleanly onto already-gated per-leaf behaviours, because it ties each golden element to an existing correctness gate; fall back to (a) for the composed turn ordering that no single leaf gate covers.
- Make the regression-vs-initial-correctness boundary explicit: state that once established, the goldens act as a regression gate, consistent with the existing `Adds.` "integration-regression gate" framing.

Edge case the implementer must watch: the ceiling-arbitration bullet (Tests bullet 3) already asserts an observable invariant against `CIO-5` order rather than against an opaque golden, so it needs no establishment note; the new obligation applies only to the transcript and diagnostics-list goldens.

## Relationships

- T38 "Live-host smoke pass criterion assumes a non-deterministic LLM reproduces a transcript recorded against the in-process double" — decision-dependency (how the H7a goldens are derived constrains what the H6a live-host smoke can validly compare against).
- T39 "H6a consumes H7a's golden artifacts but no dependency edge orders H7a before H6a" — same-cluster (H7a golden artifacts/ordering; resolves independently).

---

# T26 — Revert path restores the prior pin but never re-asserts the gates return green

**Original heading:** Revert/rollback path — no verification it restores green
**Original section:** Consolidated Plan Review — plan
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18c`'s revert path (in **Ships when**, with a mirror in `V18c-T`) directs the contributor to "restore the prior pin before merge — reverting step 4's edit in one commit: the single-source-of-truth Pi-SDK pin literal at `host-prerequisites.md#pi-sdk-pin` and the four `@earendil-works/*` `peerDependencies` entries." It names the action but never names a closing check: no step asserts that the restored state is green — that after the revert the build-time gates (step 2(a)/2(b) surface-inventory, the `engines.node` three-way equality, the `peerDependencies` literal-read, and the `loom/typecheck/session-shutdown-reason-snapshot` brand-string gate) actually pass again.

The gap matters because a bump commit edits more than step 4. Per `version-bump-triggers.md` and `version-bump-step2b.md`, a bump co-edits the capability-probe constants, the `SessionShutdownEvent['reason']` snapshot, the `engines.node` literal (operands (i)/(ii)), the typebox allow-lists, the provider seed-field table, and the strict-capability probe — all shaped to the *candidate* pin. Reverting "step 4's edit" alone restores the prior pin range while leaving those co-edited constants at candidate values. The `engines.node` three-way equality gate, for example, then compares candidate-shaped operands (i)/(ii) against the prior-pin floor read live from `node_modules` (iii) and fails red. A post-revert green re-run is exactly the observable that would surface this incomplete-revert state; without it the procedure's recovery path has no defined success criterion and can land `main` in a red state.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — `Ships when` / `Adds` (edited)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — `Ships when` (option-dependent)
- `docs/plan.md` — `### V18 — Build-time SDK gates` (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — outputs (a)–(c) / acceptance gate (option-dependent)
- `docs/spec_topics/pi-integration-contract/version-bump-step2b.md` — step 4 (the pin revert) (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-intro.md` — Non-goal (a) (read-only)

## Affected Leaves

**Phases:** Vertical V18 — Build-time SDK gates

**Leaves (implementation order):**

- `V18c-T` — Pi version-bump procedure and gates (tests) — (modified)
- `V18c` — Pi version-bump procedure and gates — (modified)

## Consequence

**Severity:** correctness

A "revert step 4's edit" reading restores the prior pin while leaving the co-edited capability constants, `engines.node` literal, and snapshot at candidate values, so the build-time gates are red against the reverted state; nothing in the procedure asserts the post-revert gates return green, so the recovery path can land `main` red and two contributors diverge on whether the revert is complete.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 81ab342 — pi-loom plan: resolve "version-bump runtime-evidence acceptance gate and revert path" (2026-06-10, Thomas Andersen)
**History:** The revert/rollback path was added to `V18c` in 81ab342, in the same commit that introduced the runtime-evidence acceptance gate; the `Ships when` and `Adds` text named the pin-restore action but paired it with no post-revert green re-run, so the verification gap has been present since the revert path's first appearance. No earlier commit carried the revert path.

## Solution Space

**Shape:** single

### Recommendation

Add a post-revert verification obligation to the revert path: after the prior pin is restored, the contributor MUST re-run the build-time gates — the step-2(a)/2(b) surface-inventory tests, the `engines.node` three-way equality gate, the `peerDependencies` literal-read, and the `loom/typecheck/session-shutdown-reason-snapshot` brand-string gate — and confirm they pass green against the restored prior pin before the revert is merged. State that this re-run is what establishes the revert is complete: if any gate is red, the revert did not restore consistency (e.g. a co-edited constant, the `engines.node` literal, or the snapshot entry was left at its candidate value) and the revert MUST be widened to restore those operands in the same commit.

Place this obligation alongside the revert procedure wherever that procedure resolves to live. If the procedure stays on `V18c`, add the re-run sentence to `V18c`'s `Ships when` revert clause; if it relocates to `version-bump-triggers.md`, add the re-run obligation there and have `V18c` cite it. Do not duplicate the obligation into both `V18c` and `V18c-T` — the green re-run exercises the same gates `V18c-T` already authors as tests, so it is a procedure step, not a new `-T` test assertion.

## Relationships

- T27 "V18c Ships-when conflates a pre-merge gate and a post-merge smoke under one "restored before merge" consequent" — decision-dependency (the revert timing fixes whether the green re-run gates a pre-merge restore or a post-merge revert commit).
- T28 "Real-host divergence detectable only by a manual, post-merge smoke" — same-cluster (same revert path; bounds the detection window rather than the post-revert verification).

---

# T27 — V18c Ships-when conflates a pre-merge gate and a post-merge smoke under one "restored before merge" consequent

**Original heading:** "post-merge detection mechanism" vs "restored before merge" timing contradiction
**Original section:** Consolidated Plan Review — plan
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18c`'s **Ships when** field makes the contingent pin-revert fire on either of two triggers, then states a single consequent for both:

> If the bump's acceptance evidence is red — or if the bump's **manual real-host smoke** (the post-merge detection mechanism named in [`H4a`], driving a representative `.loom` against a live Pi host) surfaces a confirmed behavioural-divergence finding — the prior pin is restored **before merge** …

The two triggers have incompatible timing. The first — acceptance-evidence-red — is a build-time `npm test` / `H4a`-harness gate; `version-bump-triggers.md` makes it explicitly pre-merge ("a bump whose runtime-evidence run is red MUST NOT be merged at the candidate pin"), so "restored before merge" is correct for it. The second trigger is the manual real-host smoke, which the leaf's own parenthetical labels "the post-merge detection mechanism," and which `H4a` defines as "the concrete **post-merge** detection mechanism for a double-vs-real divergence." A divergence that is only discovered *after* merge cannot gate a restore that happens *before* merge; the shared "before merge" consequent is unsatisfiable for the smoke trigger.

`H4a` already pins the correct post-merge handling: "a Pi-bump-triggered finding forces restoration of the prior Pi-SDK pin (see `V18c`'s revert path, which owns the pin-revert)." Because the smoke runs post-merge, that restoration is necessarily a post-merge revert commit, not a pre-merge gate. `V18c`'s Ships-when contradicts `H4a`'s own timing by folding the post-merge smoke under the pre-merge consequent, leaving a contributor with no reliable answer to "when, relative to merge, does each trigger revert the pin?"

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — Ships when (and the matching revert clause in Adds) (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — session-double fidelity contract / manual-real-host-smoke acceptance- and revert-trigger semantics (read-only)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — mirrored revert-path clause in Ships when (read-only; its mirror covers only the pre-merge acceptance-evidence-red branch and is internally consistent)

## Spec Documents

None — the fix is internal to plan files. (`version-bump-triggers.md` already states the acceptance-gate pre-merge semantics the fix should match; it is read to confirm timing, not edited.)

## Affected Leaves

**Phases:** Vertical slices — V18 (Build-time SDK gates)

**Leaves (implementation order):**

- V18c — Pi version-bump procedure and gates — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on revert timing for a post-merge smoke divergence: one reads the literal "before merge" and concludes the smoke must somehow gate pre-merge (impossible, since the smoke runs post-merge), the other ignores it and never wires a revert for that branch. The leaf also contradicts `H4a`, which correctly routes a Pi-bump-triggered smoke divergence to `V18c`'s revert path as a post-merge action — so the plan disagrees with itself about the recovery procedure for the one shared dependency every runtime leaf binds against.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 328ba4d — pi-loom plan: resolve "real-host verification gap" (2026-06-10, Thomas Andersen)
**History:** Commit 81ab342 (2026-06-10) introduced the revert clause with a single, internally-consistent pre-merge trigger ("If the bump's acceptance evidence is red, the prior pin is restored before merge"). Commit 328ba4d then grafted the post-merge manual-real-host-smoke disjunct ("the post-merge detection mechanism named in H4a … surfaces a confirmed behavioural-divergence finding") onto that same "restored before merge" consequent without adjusting the shared timing, creating the contradiction. The same commit added the "post-merge detection mechanism" phrasing to `H4a`. The defect did not exist before 328ba4d.

## Solution Space

**Shape:** single

### Recommendation

In `V18c`'s **Ships when**, give each trigger its own revert timing instead of sharing the single "restored before merge" consequent across both:

- Acceptance-evidence-red branch (the build-time runtime-evidence / `H4a`-harness gate) keeps a pre-merge consequent — the prior pin is restored before merge, and the bump MUST NOT merge at the candidate pin. This matches `version-bump-triggers.md`'s "a bump whose runtime-evidence run is red MUST NOT be merged at the candidate pin."
- Manual-real-host-smoke branch carries a post-merge consequent — because the smoke is the post-merge detection mechanism (per `H4a`), a confirmed behavioural-divergence finding forces a post-merge revert commit that restores the prior pin (step 4's edit reverted in one commit: the Pi-SDK pin literal at `host-prerequisites.md#pi-sdk-pin` and the four `@earendil-works/*` `peerDependencies` entries). Align the wording with `H4a`'s revert-trigger semantics, which already delegate the pin-revert for a Pi-bump-triggered smoke finding to `V18c`.

Mirror the same split in `V18c`'s **Adds** sentence so Adds and Ships-when describe the same two-timing revert path.

Edge case for the implementer: `H4a` also names a *second* smoke trigger — a merge whose diff touches the four fidelity-contract axes — whose finding "blocks the merge until the divergence is resolved" (i.e. pre-merge). That trigger is not a Pi-version-bump event and is out of `V18c`'s scope (V18c's smoke disjunct is scoped to "the bump's manual real-host smoke"), so do not fold it into V18c's revert clause; keep V18c's smoke disjunct to the Pi-bump-triggered, post-merge case.

## Relationships

- T26 "Revert path restores the prior pin but never re-asserts the gates return green" — same-cluster (same revert path, distinct gap: post-revert green verification).
- T28 "Real-host divergence detectable only by a manual, post-merge smoke" — same-cluster (the post-merge timing of the smoke is the shared subject).

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

---

# T29 — V9h over-sequenced behind V18c's full runtime-evidence subtree for a constants-only consumption

**Original heading:** Depends on all of V18c, dragging the full runtime subtree in for only a constants snapshot
**Original section:** Consolidated Plan Review — plan
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V9h` consumes only two static artefacts from the `V18` slice: the `SessionShutdownEvent['reason']` closed-set snapshot and the pinned-constants block (read by its `loom/host/session-shutdown-pinned-constant-unreadable` snapshot-read-failure path). Both live in `V18c`'s `Adds.` ("the capability-probe constants + `SessionShutdownEvent['reason']` snapshot"), and the matching `loom/typecheck/session-shutdown-reason-snapshot` brand-string gate is owned by `V18c`/`V18c-T`. To obtain them, `V9h` lists `V18c` wholesale in its `Deps. V9h-T, V9b, V18c` (and `V9h-T` likewise lists `V18c`).

`V18c` is the contributor version-bump checklist. Its `Deps. V18c-T, V18a, V18b, H4a, V5d, V11f, V13c, V14a, V15a, V17a` bundle the `H4a`-backed runtime-evidence acceptance gate, which drives a representative integrated `.loom` (typed query + tool loop + invoke + schema validation + binder + cancellation) through the end-to-end harness. A host-registration/lifecycle leaf is thereby forced to wait on essentially the entire runtime plus the end-to-end harness before it can be picked up.

An implementer sequencing by the DAG (How-to-use step 3) cannot land `V9h` until that late-stage audit leaf and its whole subtree exist. The dependency is structural, not behavioural: `V9h` neither runs nor needs the runtime-evidence gate — it reads two constant blocks. `V9g`, whose `Deps.` name `V9h`, transitively inherits the same over-sequencing, which `plan.md`'s V9 interleave note already acknowledges ("`V9h` (and therefore `V9g`) depend on `V18c` … cannot be picked up until that cluster lands").

## Plan Documents

- `docs/plan_topics/V9h-degraded-unknown-reason.md` — `Deps.` field (edited)
- `docs/plan_topics/V9h-T-degraded-unknown-reason.md` — `Deps.` field (edited)
- `docs/plan_topics/V18c-version-bump-checklist.md` — `Adds.` / `Deps.` (edited)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — `Adds.` / `Tests.` (edited)
- `docs/plan.md` — V9 slice interleave note (edited)
- `docs/plan_topics/H5b-warn-only-canary.md` — `Deps. V1a–V18c` (option-dependent — a new coverage-producing leaf must be appended per the transitive-completeness rule)
- `docs/plan_topics/conventions.md` — §Leaf format, REQ-ID discipline transitive-completeness rule (read-only)

## Spec Documents

None — the `reason`-set / pinned-constant obligations already exist in the spec (`pi-integration-contract/session-only-degraded-state.md`, `unknown-reason-rule.md`, `version-bump-step2b.md`); the fix is internal to plan-file `Deps`/ownership.

## Affected Leaves

**Phases:** Vertical V9, Vertical V18

**Leaves (implementation order):**

- `V9g` — Session-shutdown teardown and emission isolation — (blocked)
- `V9h` — Session-only degraded state and unknown-reason rule — (modified)
- `V9h-T` — Session-only degraded state and unknown-reason rule (tests) — (modified)
- `V18c` — Pi version-bump procedure and gates — (modified; split)
- `V18c-T` — Pi version-bump procedure and gates (tests) — (modified; split)
- `<new>` — extracted constants/reason-snapshot leaf — (added)

## Consequence

**Severity:** correctness

An implementer building by the dependency DAG cannot pick up `V9h` (and therefore `V9g`) until `V18c` and its entire runtime-evidence subtree have landed, even though `V9h` consumes only two constant blocks. Faced with that ordering, an implementer would likely hand-extract a partial `reason`-set/constants block early, producing a copy that can silently skew from the `V18c`-owned snapshot the brand-string gate guards. The phase ordering the plan presents as dep-driven is misleading for these two leaves.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commit:** c6a664e (2026-06-10, Thomas Andersen — "pi-loom plan: build/update plan for spec.md + review")
**History:** `V9h` has carried `Deps. V9h-T, V9b, V18c` since the initial plan build (c6a664e); the `V9h→V18c` edge has never changed (`git log -G "V18c"` on the leaf returns only c6a664e). At inception `V18c` already bundled the `H4a`-backed runtime-evidence gate (its `Deps.` were `V18c-T, V18a, V18b, H4a`), so `V9h` was over-sequenced behind the end-to-end harness from the start. Two later commits widened the subtree without introducing the defect: c42f13d (2026-06-10, "V18c version-bump gate under-declares feature deps") appended `V5d, V11f, V13c, V14a`, and ce32225 (2026-06-11, "V18c-T runtime-evidence test exercises integrated features its Deps do not satisfy") added `V15a`. Those edits aggravated the magnitude of the dragged-in subtree but the structural over-sequencing dates to inception.

## Solution Space

**Shape:** single

### Recommendation

Split `V18c` into a constants leaf and an acceptance leaf, then retarget `V9h`/`V9h-T` onto the constants leaf (lightening `V9g` transitively). Separate the static constant artefacts from the `H4a`-backed runtime-evidence gate: carve `V18c` into `V18c-constants` (the SDK surface-inventory tests, `engines.node` floor read, `peerDependencies` pin assertion, capability-probe constants + `SessionShutdownEvent['reason']` snapshot, provider seed-field table, strict-capability probe, revert-path doc) and `V18c-acceptance` (the runtime-evidence acceptance gate and its runtime deps). Retarget `V9h` / `V9h-T` `Deps.` from `V18c` to `V18c-constants`.

This is the same edit the related `V18c` step-atomicity finding (T30) requires, so resolving both together avoids a second pass over the `V18` cluster. Resolve the `V18c` split first so `V9h`/`V9h-T`'s `Deps.` retargeting lands on a stable constants-leaf ID. Edge cases the implementer must watch: keep the `SessionShutdownEvent['reason']` snapshot and its `loom/typecheck/session-shutdown-reason-snapshot` brand-string gate in the *same* (constants) leaf so the guarded value and its guard do not separate; and append any newly-created coverage-producing leaf to `H5b`'s `Deps.` per the transitive-completeness rule.

## Relationships

- T30 "`V18c` bundles low-dependency static gates with the high-dependency H4a-backed runtime-evidence acceptance gate" — co-resolve (its proposed split of `V18c` into `V18c-constants` / `V18c-acceptance` directly yields the lightweight constants leaf `V9h` can depend on).
- T11 "V9c-T omits V17a..." — same-cluster (another `-T` leaf whose `Deps.` under-declare relative to the consumed seam; resolves independently).

---

# T30 — `V18c` bundles low-dependency static gates with the high-dependency H4a-backed runtime-evidence acceptance gate

**Original heading:** Slightly too large — static constant gates + H4a-backed acceptance gate
**Original section:** Consolidated Plan Review — plan
**Kind:** step-atomicity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18c` bundles two obligations with qualitatively different shapes and, more consequentially, radically different dependency footprints. The first is a set of static constant / inventory gates: the step-2(a)/2(b) `SDK_SURFACE_INVENTORY` surface-inventory tests, the `engines.node` floor literal-read, the `peerDependencies` tilde-pin assertion, and the `loom/typecheck/session-shutdown-reason-snapshot` brand-string gate. Those gates need only `V18a`/`V18b`. The second is the `H4a`-backed runtime-evidence acceptance gate, which drives a representative integrated `.loom` (typed query + tool loop + invoke + schema validation + binder + cancellation) and therefore declares `H4a`, `V5d`, `V11f`, `V13c`, `V14a`, `V15a`, and `V17a` as `Deps` — effectively the whole vertical runtime surface. A revert-path procedure (neither a test nor a constant) is grafted onto the same `Ships when`.

Because both obligations share one leaf, `V18c`'s declared `Deps` is the union of both footprints. That union over-states the prerequisites for the static half. The downstream cost is concrete: `V9h` lists `V18c` in its `Deps` solely to consume the `session-shutdown-reason-snapshot` brand-string constant (it validates `event.reason` against that pinned reason set), and `V9g` depends on `V9h`. Under "sequence by **Deps**", both `V9h` and `V9g` are therefore transitively blocked on the entire vertical runtime surface even though the only `V18c` output they actually need is a static constant produced with a two-leaf footprint.

A reviewer also cannot audit the static-gate wiring without tracing the full `H4a` runtime-evidence dependency graph, and vice versa — the two review surfaces are forced together.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — whole leaf (edited)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — whole leaf (edited)
- `docs/plan_topics/V9h-degraded-unknown-reason.md` — Deps (option-dependent)
- `docs/plan_topics/V9h-T-degraded-unknown-reason.md` — Deps (option-dependent)
- `docs/plan_topics/V9g-session-shutdown.md` — Deps (read-only)
- `docs/plan_topics/coverage-matrix.md` — runtime-evidence acceptance-gate MUST row (option-dependent)
- `docs/plan_topics/H5b-warn-only-canary.md` — Deps (`V1a`–`V18c` range) (option-dependent)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — version-bump cross-references (read-only)
- `docs/plan.md` — V18 section links + V9 interleave note (option-dependent)
- `docs/plan_topics/conventions.md` — leaf format / ID scheme (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical V9, Vertical V18

**Leaves (implementation order):**

- `V9g` — Session-shutdown teardown and emission isolation — (blocked)
- `V9h` — Session-only degraded state and unknown-reason rule — (both)
- `V18c` — Pi version-bump procedure and gates — (modified)
- `H5b` — Warn-only live-corpus canary — (modified)
- `<new>` — extracted runtime-evidence-acceptance leaf (and its `-T` partner) — (added)

(`V9h-T` and `V18c-T` mirror their implementation leaves' edits; the `-T` partner of any new leaf is added with it.)

## Consequence

**Severity:** correctness

`V18c`'s declared `Deps` over-state the prerequisites for its static gates, so `V9h` — and transitively `V9g` — cannot be picked up until the entire vertical runtime surface (`V5d`/`V11f`/`V13c`/`V14a`/`V15a`/`V17a`) lands, even though both leaves need only the static reason-snapshot constant. Two implementers sequencing by `Deps` are both forced into that distorted build order, and any reviewer must trace the full `H4a` dependency graph to audit gates that do not depend on it.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 81ab342 — pi-loom plan: resolve "version-bump runtime-evidence acceptance gate and revert path" (2026-06-10, Thomas Andersen); c42f13d — pi-loom plan: resolve "V18c version-bump gate under-declares feature deps" (2026-06-10, Thomas Andersen)
**History:** At its creation commit (c6a664e, 2026-06-10) `V18c` carried only the static constant gates with `Deps: V18c-T, V18a, V18b`. Commit 81ab342 grafted the qualitatively different `H4a`-backed runtime-evidence acceptance gate and the revert path onto the same leaf, introducing the bundling and adding the `H4a` dep. Commit c42f13d then widened the leaf's `Deps` to the full runtime surface (`V5d`/`V11f`/`V13c`/`V14a`/`V17a`), which is what makes the bundling consequential — it is that union footprint that now transitively blocks `V9h`/`V9g`.

## Solution Space

**Shape:** single

### Recommendation

Split `V18c` into a static-gates leaf and a runtime-evidence-acceptance leaf. Decompose `V18c` (and its `V18c-T` partner) into two paired leaves: one owning the static constant / inventory gates (step-2(a)/2(b) surface-inventory, `engines.node` literal-read, `peerDependencies` pin, `session-shutdown-reason-snapshot` brand-string) with `Deps` limited to `V18a`/`V18b`; one owning the `H4a`-backed runtime-evidence acceptance gate with `Deps` `H4a`, `V5d`, `V11f`, `V13c`, `V14a`, `V15a`, `V17a`. The revert-path procedure travels with the acceptance leaf (coordinate with the revert-path placement findings).

Add the new leaf files (use `<new>` IDs for both halves and their `-T` partners, allocated per the `conventions.md` ID scheme; do not invent final IDs here); update the V18 section links and the V9 interleave note in `docs/plan.md`; re-point `V9h` and `V9h-T` `Deps` from `V18c` to the static-gates leaf; re-point the `coverage-matrix.md` runtime-evidence-acceptance-gate MUST row to the acceptance leaf; extend `H5b`'s `V1a`–`V18c` `Deps` range to cover the new IDs.

Resolve in order — first establish the static-gates leaf (the scope-bounding half with the `V18a`/`V18b` footprint) and re-point `V9h`/`V9h-T` to it; then move the `H4a`-backed acceptance gate and its runtime-surface `Deps` onto the acceptance leaf. Edge cases the implementer must watch: keep the revert-path procedure with the acceptance gate; re-verify `H5b`'s `V1a`–`V18c` `Deps` range covers the new IDs; preserve the `coverage-matrix.md` runtime-evidence-acceptance-gate MUST mapping by re-pointing it to the acceptance leaf.

## Relationships

- T29 "V9h over-sequenced behind V18c's full runtime-evidence subtree..." — co-resolve (the split decides which leaf owns the acceptance gate and yields the lightweight constants leaf V9h depends on).
- T27 "V18c Ships-when conflates a pre-merge gate and a post-merge smoke..." — same-cluster (also edits `V18c` Ships-when; resolves independently of the split).
- T26 "Revert path restores the prior pin but never re-asserts the gates return green" — same-cluster (revert-path verification; lands on whichever leaf owns the acceptance gate).
- T28 "Real-host divergence detectable only by a manual, post-merge smoke" — same-cluster (acceptance-gate detection window; resolves independently).

---

# T31 — Manual real-host fidelity gate leaves no falsifiable record

**Original heading:** Manual real-host fidelity rests on a mechanically-unenforced checklist item
**Original section:** Consolidated Plan Review — plan
**Kind:** risk
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

loom 1.0's only evidence that the in-process session double matches real Pi behaviour is the H6a "Release-gate acceptance (manual real-host smoke)" item — a manual checklist entry confirming that H4a's manual real-host smoke run (driving H7a's committed multi-feature fixture `.loom` against a live Pi host) was executed and passed against the shipping Pi-SDK pin. By design there is no mechanical real-host fidelity gate; `npm test` exercises only the in-process double, and H4a explicitly frames the double's fidelity as a host-behaviour presupposition audited by editorial review.

H6a states the manual item is "recorded as executed-and-passed" and that "the release does not pass until this item is checked," but the plan does not require the check to leave any committed, falsifiable artifact. "Recorded" currently means only that a contributor asserts the run happened and passed. If a contributor skips the run, mis-records it, or checks the box against a stale Pi-SDK pin, loom 1.0 ships with no real-host verification and a possibly-divergent double, and nothing in the corpus would later contradict the (false) record. The risk is acknowledged by the plan (it states plainly that there is no mechanical gate), but the gate's output is unfalsifiable, which is the gap.

## Plan Documents

- `docs/plan_topics/H6a-live-corpus-activation.md` — Adds / "Release-gate acceptance (manual real-host smoke)" Tests bullet / Ships when (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — manual real-host smoke pass/fail criterion and trigger policy (read-only)
- `docs/plan.md` — §Release gate (option-dependent)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H4a — Extension factory shell and end-to-end harness — (read-only)
- H6a — Live-corpus closing-gate activation (loom 1.0 release gate) — (modified)

## Consequence

**Severity:** advisory

If the manual smoke is skipped or mis-recorded, loom 1.0 ships with zero real-host fidelity evidence despite the release gate reporting "passed," and the failure is silent because the checklist tick is not backed by any committed, inspectable trace. The leaf still builds and the automated gates still fire; what degrades is the trustworthiness of the single release-time real-host assurance.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 07403da — pi-loom plan: resolve T20 (Branch A) — H4a double fidelity is an editorial-review presupposition, not a real-host backstop; unpark (2026-06-10, Thomas Andersen); 328ba4d — pi-loom plan: resolve "real-host verification gap" (2026-06-10, Thomas Andersen); e7f14dd — pi-loom plan: resolve "Real-host fidelity of the session double has no reproducible detection point" (2026-06-11, Thomas Andersen)
**History:** 07403da established H4a's stance that the double's fidelity is an editorial-review presupposition with no mechanical real-host fidelity gate. 328ba4d then added the "manual real-host smoke run" as the concrete post-merge detection mechanism in H4a (a revert trigger), still with no release-gate record-keeping. e7f14dd promoted that smoke into the H6a "Release-gate acceptance (manual real-host smoke)" checklist item and made it "the recorded real-host fidelity evidence loom 1.0 ships on" — recorded "as executed-and-passed" but with no committed, falsifiable trace, which is the interaction that leaves the release-time assurance resting on an unenforced check-off.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H6a-live-corpus-activation.md`, strengthen what "recorded as executed-and-passed" obligates in the "Release-gate acceptance (manual real-host smoke)" Tests bullet (and the matching clause in `Ships when`): require that passing the manual smoke produce a committed artifact capturing the falsifiable evidence — at minimum the Pi-SDK pin literal the run was executed against (the single-source-of-truth pin at `host-prerequisites.md#pi-sdk-pin`), the date of the run, and the observed result against H7a's goldens (appended-turn order/count match and the emitted `loom-system-note` code set). The release gate then passes only when that committed evidence record exists, not merely when a box is ticked, so a skipped or stale run is detectable after the fact.

Leave the existing manual-gate framing (no mechanical real-host gate; editorial-review presupposition) intact — the fix adds a durable trace to the manual gate, it does not convert the gate to a mechanical one. The smoke procedure and pass/fail criterion in H4a stay read-only; only the H6a record-keeping obligation changes.

## Relationships

- T38 "Live-host smoke pass criterion assumes a non-deterministic LLM reproduces a transcript recorded against the in-process double" — same-cluster (same manual-smoke item; concerns the achievability of the pass criterion rather than its record).
