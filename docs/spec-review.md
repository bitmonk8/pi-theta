# Triaged Spec Review - spec

_Generated: 2026-05-28T17:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - addressed from last finding to first._

---

# T17e - Inbound fragment-link `#v1-…` rewrite to canonical arm

**Original heading:** Cross-spec — `V1` terminology collision with the plan corpus
**Original section:** `docs/spec.md`
**Kind:** cross-spec-consistency
**Importance:** medium
**Score:** 15
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

After T17c and T17d land, every `<a id="v1-…">` anchor in the spec corpus carries a sibling `<a id="loom-1-0-…">` (or `<a id="loom-1-0-0-…">`) canonical arm per [GOV-21 *Canonical arm*](./spec_topics/governance.md#gov-21-canonical-arm). Inbound cross-references in the spec corpus that cite the `v1-*` arm (e.g. `[label](path#v1-seam-binder-refinement-loop)`) still resolve correctly under [GOV-21 *Alias permanence*](./spec_topics/governance.md#gov-21-alias-permanence), but GOV-21's canonical-arm obligation says new cross-references MUST cite the `loom-1-0-*` arm. Existing inbound cross-references in the spec corpus that cite the `v1-*` arm should therefore be repointed to the canonical arm; the `v1-*` arm remains in place as a permanent back-compat alias.

## Solution approach

1. Enumerate inbound spec-corpus cross-references citing the `v1-*` arm:

   ```
   grep -rnE '#(v1-|tooling-deferrals-no-v1-impact|surface-extensions-v1-leaves-a-seam|model-level-changes-no-v1-seam-expected)' docs/spec.md docs/spec_topics/
   ```

2. For each hit, rewrite the fragment to its canonical-arm form: `#v1-foo` → `#loom-1-0-foo` (or `#loom-1-0-0-foo` for frozen-baseline anchors). The hyphen-conversion rule is mechanical (`v1-` prefix replaced with `loom-1-0-` prefix; the slug tail is unchanged).
3. Do NOT touch the target sites (the `<a id="v1-…">` anchors stay in place per GOV-21 alias permanence; T17c and T17d authored the `loom-1-0-*` sibling).

Witness: after the rewrite, `grep -rnE '#(v1-|tooling-deferrals-no-v1-impact|surface-extensions-v1-leaves-a-seam|model-level-changes-no-v1-seam-expected)' docs/spec.md docs/spec_topics/` returns no hits. Inbound cross-references from outside the spec corpus (e.g. `README.md`, `CHANGELOG.md`) are not in scope per [GOV-17](./spec_topics/governance.md#gov-17); GOV-21's *Cross-corpus scope* paragraph narrows to the spec corpus.

## Solution constraints

- Only cross-references in `docs/spec.md` and `docs/spec_topics/*.md` are in scope. Cross-corpus pages (`README.md`, `CHANGELOG.md`, plan corpus) are GOV-17 dependents and out of scope.
- The rewrite is mechanical token substitution at the fragment portion of the link only. The link text and target-file portion of the markdown link are unchanged.
- The `v1-*` target anchors MUST NOT be removed by this finding; per GOV-21 *Alias permanence* they are permanent back-compat aliases. Removal is governed by GOV-21 *Retirement discharge* and is out of scope here.

## Relationships

- T17c "HTML anchor dual-anchor authoring for `<a id="v1-…">` sites" — must-follow
- T17d "Heading-derived auto-id case: rename and explicit dual-anchor authoring" — must-follow

---

# T17a - Prose `V1` / `V1.0` / `V1.x` rename to canonical spelling at non-closure callsites

**Original heading:** Cross-spec — `V1` terminology collision with the plan corpus
**Original section:** `docs/spec.md`
**Kind:** cross-spec-consistency
**Importance:** medium
**Score:** 30
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The spec corpus carries ~290 prose callsites of the legacy version tokens `V1`, `V1.0`, and `V1.x`. Commit `4a7afbf` landed [GOV-20](./spec_topics/governance.md#gov-20) governing these as aliases mapping to the new release-version naming scheme defined at [GOV-19](./spec_topics/governance.md#gov-19): at non-closure callsites, `V1` and `V1.0` alias to `loom 1.0` (design-scope) and `V1.x` aliases to `loom 1.x`. The spec is consistent under the alias today; converting the prose to the canonical spelling brings the corpus to its target steady state and lets GOV-7 / GOV-8 lifecycle eventually retire the `V1` / `V1.0` / `V1.x` rows from GOV-20's alias table.

This finding's scope is the **non-closure prose callsites** only — sites whose surrounding sentence does NOT carry any closure phrase enumerated in GOV-19's *closed enumeration* definition. The closure callsites are handled by T17b separately. HTML `<a id="v1-…">` anchors are handled by T17c. The four heading sites whose auto-id slug shifts under the rename are handled by T17d. Inbound `#v1-…` fragment-link rewrites are handled by T17e.

## Solution approach

For each file under `docs/spec.md` + `docs/spec_topics/*.md`:

1. Identify candidate callsites: `grep -nE '\bV1(\.[0-9x]+)?\b' docs/spec.md docs/spec_topics/ | grep -v -E 'peerDependenc|>= 20\.|>= 22\.|loom/'`.
2. For each candidate, evaluate the surrounding sentence against GOV-19's *closed enumeration* phrase set (`exactly N`, `the closed set`, `the N-element set`, count-bearing list, `loads cleanly under`, `closed at`, `frozen at`, `frozen-baseline`, closed `details.kind`/`Err`-variant/discriminator inventory). If the surrounding sentence carries any such phrase, the callsite is out of scope of this finding (T17b handles it). Default on ambiguity: out of scope (frozen-baseline is the stronger commitment; T17b's caution applies).
3. For each non-closure callsite, rewrite the legacy token to its alias-mapped spelling per the GOV-20 table: `V1` → `loom 1.0`, `V1.0` → `loom 1.0`, `V1.x` → `loom 1.x`.
4. Do NOT touch the four heading sites whose auto-id slug shifts (T17d's surface): `### V1 non-goals` on `spec.md` and `future-considerations.md`; `## Tooling deferrals (no V1 impact)`, `## Surface extensions (V1 leaves a seam)`, `## Model-level changes (no V1 seam expected)` on `future-considerations.md`. T17d covers both the heading-text rename and the companion dual-anchor pair.
5. Do NOT touch HTML `<a id="v1-…">` anchor tokens (T17c's surface).
6. Do NOT touch the out-of-scope tokens enumerated under GOV-20: Pi SDK literals, Node literals, diagnostic codes, inline labels, `V8`, plan-phase IDs at `docs/plan_topics/conventions.md:9`.

Witness: after the rewrite, every remaining `\bV1(\.[0-9x]+)?\b` hit in the corpus (excluding out-of-scope tokens) is either (a) a closure-callsite T17b will reclassify, (b) an HTML anchor token (`<a id="v1-…">`) under T17c's scope, or (c) one of the four heading sites under T17d's scope.

## Solution constraints

- The rewrite is mechanical token substitution under the GOV-20 alias mapping. No new normative prose is authored.
- Per-callsite sense MUST be determined by the closure heuristic at GOV-20. Closure callsites are out of scope of this finding.
- No new anchors are authored. GOV-21 governs anchor authoring at sites that become dual-anchored (T17c and T17d's surfaces).
- Cross-corpus scope: spec corpus only. Plan-side slip fixes are T17g; the README parking-pointer is T17h.

## Relationships

(none — depends only on commit 4a7afbf, which is landed)

---

# T17b - Frozen-baseline reclassification at closure callsites

**Original heading:** Cross-spec — `V1` terminology collision with the plan corpus
**Original section:** `docs/spec.md`
**Kind:** cross-spec-consistency
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The spec corpus carries ~25 callsites where the legacy token `V1` or `V1.0` appears within a sentence carrying a closure phrase (per GOV-19's *closed enumeration* definition). At these callsites, GOV-20's sense-overload resolver selects the frozen-baseline sense `loom 1.0.0`, not the design-scope sense `loom 1.0`. Examples include the six-panic-source closure on `diagnostics.md:385`, the `BinderError`-union absence statement on `binder.md:329`, the GOV-15 *loads cleanly under* phrase, the *Ceiling-set carve-out* *closed at* phrase, the nine variant-tag closure on `errors-and-results.md:158`, and the *Re-validation gate* baseline-pinning carve-out on `pi-integration-contract.md`.

The spec is consistent under the alias today (GOV-20's closure heuristic governs the sense at each callsite), but converting these closure callsites to the canonical `loom 1.0.0` spelling brings the closure-shape claims to their canonical form and avoids the per-reader closure-heuristic re-evaluation on every visit.

## Solution approach

1. Run the candidate enumeration: `grep -nE '\bV1(\.0)?\b' docs/spec.md docs/spec_topics/ | grep -v -E 'peerDependenc|>= 20\.|>= 22\.|loom/'`.
2. For each candidate, evaluate the surrounding sentence against GOV-19's *closed enumeration* phrase set. A callsite is in scope of this finding iff the sentence carries `exactly N`, `the closed set`, `the N-element set`, a count-bearing list, `loads cleanly under`, `closed at`, `frozen at`, `frozen-baseline`, or references a closed `details.kind` / `Err`-variant / discriminator inventory.
3. For each in-scope callsite, rewrite `V1` → `loom 1.0.0` and `V1.0` → `loom 1.0.0` (the frozen-baseline canonical spelling per GOV-20). `V1.x` is design-scope-only per the GOV-20 table and is not in scope of this finding.
4. Default on ambiguity: in scope (frozen-baseline is the stronger commitment; design-scope claims subsume frozen-baseline claims per GOV-20).
5. Where two callsites reference the same closure (e.g. the panic-source citation on `errors-and-results.md:109` and the panic-source declaration on `diagnostics.md:385`), both MUST land at the same spelling.

Witness: after the rewrite, `grep -nE '\bV1(\.0)?\b' docs/spec.md docs/spec_topics/ | grep -v -E 'peerDependenc|>= 20\.|>= 22\.|loom/' | grep -iE 'closed|closure|exhaust|exact(ly)? [a-z0-9]+|loads cleanly|frozen'` returns no hits.

## Solution constraints

- The rewrite is mechanical substitution `V1` / `V1.0` → `loom 1.0.0` at closure-heuristic-matching callsites only. Non-closure callsites are out of scope (T17a handles them).
- Paired callsites referencing the same closure MUST agree on the spelling (`loom 1.0.0` at both).
- The resolution commit message MUST include a `Frozen-baseline-sweep:` trailer naming the count of rewritten callsites and the count of files touched, on the same shape as the original T17's audit-witness convention.
- No HTML anchors are authored or modified (T17c and T17d cover those surfaces).

## Relationships

(none — depends only on commit 4a7afbf, which is landed)

---

# T17c - HTML anchor dual-anchor authoring for `<a id="v1-…">` sites

**Original heading:** Cross-spec — `V1` terminology collision with the plan corpus
**Original section:** `docs/spec.md`
**Kind:** cross-spec-consistency
**Importance:** medium
**Score:** 15
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The spec corpus carries 11 explicit `<a id="v1-…">` HTML anchors on `> **V1 seam — …**` blockquote labels and one heading-attached anchor (the `loom-package-implementation-dependencies-v1` anchor on `pi-integration-contract.md:18`). Per [GOV-21](./spec_topics/governance.md#gov-21), inbound `#v1-…` cross-references resolve only to literal `<a id="v1-…">` tokens at the target; preserving inbound back-compat under the rename requires authoring a sibling `<a id="loom-1-0-…">` canonical arm at each site, leaving the `v1-*` arm in place per GOV-21 *Alias permanence*.

This finding's scope is the existing 11 explicit `<a id="v1-…">` anchor sites plus the one heading-attached anchor on `pi-integration-contract.md:18`. The four heading-derived auto-id cases (where the prose rename causes the heading's GitHub auto-id slug to shift) are handled by T17d. Inbound fragment-link repointing is handled by T17e.

## Solution approach

For each existing `<a id="v1-…">` anchor site in `docs/spec.md` + `docs/spec_topics/*.md`:

1. Identify candidates: `grep -rnE '<a id="v1-' docs/spec.md docs/spec_topics/`.
2. For each site, author a sibling `<a id="loom-1-0-…">` immediately before the existing `<a id="v1-…">` (or, for inline-blockquote sites, inline within the same blockquote label), producing the dual-anchor pair per GOV-21 *Intensional definition*: `<a id="loom-1-0-seam-foo"></a><a id="v1-seam-foo"></a>`.
3. The `loom-1-0-*` slug is derived from the `v1-*` slug by mechanical substitution: replace the leading `v1-` with `loom-1-0-`; the tail is unchanged. Examples: `v1-non-goals` → `loom-1-0-non-goals`; `v1-seam-binder-refinement-loop` → `loom-1-0-seam-binder-refinement-loop`; `loom-package-implementation-dependencies-v1` → `loom-package-implementation-dependencies-loom-1-0` (the `v1` segment may appear in non-leading position; the substitution is `-v1` → `-loom-1-0` in that case).
4. Do NOT remove the `<a id="v1-…">` arm. Per GOV-21 *Alias permanence* it is a permanent back-compat alias.

Witness: after the rewrite, `grep -rnE '<a id="v1-' docs/spec.md docs/spec_topics/ | wc -l` returns the same count as before (the `v1-*` arms are retained); `grep -rnE '<a id="loom-1-0-' docs/spec.md docs/spec_topics/ | wc -l` is non-zero (the new canonical arms exist).

## Solution constraints

- Every existing `<a id="v1-…">` anchor MUST gain a sibling `<a id="loom-1-0-…">` (or `<a id="loom-1-0-0-…">` if the surrounding paragraph is a closure-callsite per the GOV-20 closure heuristic). Silently dropping a `v1-*` arm is forbidden.
- The dual-anchor pair MUST conform to one of the placement classes admitted by GOV-21 *Intensional definition*: at-heading explicit pair, inline-blockquote pair, at-heading explicit-pair-replacing-auto-id, or inline-paragraph pair.
- The four heading-rename sites whose GitHub auto-id slug shifts under T17a's prose rewrite are out of scope of this finding (T17d covers them).
- No prose tokens are modified by this finding (T17a/T17b cover prose rewrites).

## Relationships

(none — depends only on commit 4a7afbf, which is landed)

---

# T17d - Heading-derived auto-id case: rename and explicit dual-anchor authoring

**Original heading:** Cross-spec — `V1` terminology collision with the plan corpus
**Original section:** `docs/spec.md`
**Kind:** cross-spec-consistency
**Importance:** medium
**Score:** 15
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Four spec-corpus heading sites carry a `V1` token in the heading text. Under T17a's prose-rewrite scope, renaming these headings would shift their GitHub-rendered auto-id slugs from `v1-*` to `loom-1-0-*`, breaking any inbound `#v1-*` cross-reference whose target relies on the auto-id slug rather than an explicit `<a id>`. This finding combines the heading-text rename with explicit dual-anchor pair authoring so the rename and the back-compat preservation land atomically.

The four sites are:

- `docs/spec.md` — `### V1 non-goals`
- `docs/spec_topics/future-considerations.md` — `### V1 non-goals`
- `docs/spec_topics/future-considerations.md` — `## Tooling deferrals (no V1 impact)`
- `docs/spec_topics/future-considerations.md` — `## Surface extensions (V1 leaves a seam)`
- `docs/spec_topics/future-considerations.md` — `## Model-level changes (no V1 seam expected)`

(Five entries total; two of them are sibling `### V1 non-goals` headings on different pages.)

## Solution approach

For each of the five heading sites:

1. Rename the heading text in place: `V1` → `loom 1.0` (these are non-closure callsites per the GOV-20 closure heuristic — none of the surrounding heading bodies pin a closed enumeration).
2. Author an explicit `<a id="loom-1-0-…"></a><a id="v1-…"></a>` sibling pair on the source line immediately preceding the renamed heading, per [GOV-21 *Intensional definition*](./spec_topics/governance.md#gov-21-intensional-definition) class *at-heading explicit-pair-replacing-auto-id*. The slug derivation follows the GitHub auto-id rule: lowercase, hyphenate spaces, strip parens. Examples:

   - `### loom 1.0 non-goals` → `<a id="loom-1-0-non-goals"></a><a id="v1-non-goals"></a>`
   - `## Tooling deferrals (no loom 1.0 impact)` → `<a id="tooling-deferrals-no-loom-1-0-impact"></a><a id="tooling-deferrals-no-v1-impact"></a>`
   - `## Surface extensions (loom 1.0 leaves a seam)` → `<a id="surface-extensions-loom-1-0-leaves-a-seam"></a><a id="surface-extensions-v1-leaves-a-seam"></a>`
   - `## Model-level changes (no loom 1.0 seam expected)` → `<a id="model-level-changes-no-loom-1-0-seam-expected"></a><a id="model-level-changes-no-v1-seam-expected"></a>`

3. The pre-rename auto-id slug (`v1-non-goals` etc.) is preserved by the explicit `<a id="v1-…">` arm.

Witness: after the rewrite, the five heading sites all carry an explicit `<a id="loom-1-0-…">` + `<a id="v1-…">` sibling pair, and the heading text uses the canonical `loom 1.0` spelling.

## Solution constraints

- Each of the five heading sites MUST gain an explicit dual-anchor pair immediately before the renamed heading; the implicit GitHub auto-id is no longer relied on.
- The `v1-*` arm MUST be retained per GOV-21 *Alias permanence*.
- The five sites enumerated above are the complete set under this finding. Any newly-discovered heading site whose auto-id shifts under the V1 → loom 1.0 rename is treated as an extension of this finding's surface and addressed in the same commit.
- The pair authoring uses GOV-21 *Intensional definition*'s *at-heading explicit-pair-replacing-auto-id* placement class.

## Relationships

(none — depends only on commit 4a7afbf, which is landed)

---

# T17f - Companion `V2` → `loom 2.0` sweep

**Original heading:** Cross-spec — `V1` terminology collision with the plan corpus
**Original section:** `docs/spec.md`
**Kind:** cross-spec-consistency
**Importance:** low
**Score:** 5
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The spec corpus carries a small number of `V2` prose callsites (currently 3 known: `docs/spec_topics/governance.md` §*Ceiling-set carve-out* and §*Operational definitions*; `docs/spec_topics/future-considerations.md` no-formal-migration-mechanism bullet). Per [GOV-20](./spec_topics/governance.md#gov-20), `V2` aliases `loom 2.0` (design-scope only). The corpus is consistent under the alias today; this finding completes the rename so no bare `V<N>` token remains as a loom release name anywhere under `docs/spec.md` + `docs/spec_topics/`.

## Solution approach

1. Enumerate candidates: `grep -nE '\bV2\b' docs/spec.md docs/spec_topics/ | grep -v -E 'V8|peerDependenc'`.
2. For each candidate, verify the surrounding context is loom-release naming (not the JavaScript engine `V8`, not a Pi SDK or Node version literal, not a diagnostic code). Sites whose context is anything other than loom-release naming are out of scope per GOV-20's out-of-scope token list.
3. Rewrite each in-scope `V2` → `loom 2.0`.

Witness: `grep -nE '\bV2\b' docs/spec.md docs/spec_topics/ | grep -v -E 'V8|peerDependenc'` returns zero hits after the rewrite.

## Solution constraints

- Out-of-scope tokens per GOV-20 MUST NOT be touched: `V8` (JavaScript engine), Pi SDK literals, Node literals, diagnostic codes, plan-phase IDs.
- No new normative prose is authored. The rewrite is mechanical substitution.

## Relationships

(none — depends only on commit 4a7afbf, which is landed)
