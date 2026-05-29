# Triaged Spec Review - spec

_Generated: 2026-05-28T17:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - addressed from last finding to first._

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
3. The `loom-1-0-*` slug is derived from the `v1-*` slug by mechanical substitution as the **default**: replace the leading `v1-` with `loom-1-0-`; the tail is unchanged (for a non-leading `v1` token the substitution is `-v1` → `-loom-1-0`). Examples: `v1-seam-binder-refinement-loop` → `loom-1-0-seam-binder-refinement-loop`; `loom-package-implementation-dependencies-v1` → `loom-package-implementation-dependencies-loom-1-0`.

   **Canonical-arm uniqueness and the collision case.** The mechanical substitution is only the default derivation; the binding property is that every `loom-1-0-*` canonical arm this finding authors MUST resolve to exactly one target across `docs/spec.md` + `docs/spec_topics/*.md`. Where two distinct sites carry the same `v1-*` slug, the bare substitution derives the same `loom-1-0-*` slug at both, an unavoidable corpus-wide collision the dual-anchor pass MUST disambiguate rather than emit unchanged. The known instance is `v1-non-goals`, present on both `docs/spec.md:98` (the orientation aggregator) and `docs/spec_topics/future-considerations.md:97` (the authoritative normative list). At such a collision the GOV-12 lock-step **normative-owner site retains the bare mechanically-derived arm** (`docs/spec_topics/future-considerations.md` keeps `<a id="loom-1-0-non-goals">`), and the **aggregator / secondary site takes a site-distinguishing canonical arm** (`docs/spec.md` carries a `loom-1-0-non-goals-…` arm with a tail marking it as the aggregator copy). The disambiguating tail is at the fixer's discretion subject to lens acceptance; it SHOULD read as an aggregator alias of the owner rather than as an independent target. Both sites' `v1-non-goals` alias arms are left unchanged per step 4. This keeps the owner's arm mechanically derivable while satisfying corpus-wide uniqueness; the bare `loom-1-0-non-goals` MUST NOT be authored at the aggregator site, because that arm is owned by the normative list page.

4. Do NOT remove the `<a id="v1-…">` arm. Per GOV-21 *Alias permanence* it is a permanent back-compat alias.

Witness: after the rewrite, `grep -rnE '<a id="v1-' docs/spec.md docs/spec_topics/ | wc -l` returns the same count as before (the `v1-*` arms are retained); `grep -rnE '<a id="loom-1-0-' docs/spec.md docs/spec_topics/ | wc -l` is non-zero (the new canonical arms exist); and no `loom-1-0-*` slug appears at more than one site (each canonical arm resolves uniquely).

## Solution constraints

- Every existing `<a id="v1-…">` anchor MUST gain a sibling `<a id="loom-1-0-…">` (or `<a id="loom-1-0-0-…">` if the surrounding paragraph is a closure-callsite per the GOV-20 closure heuristic). Silently dropping a `v1-*` arm is forbidden.
- The dual-anchor pair MUST conform to one of the placement classes admitted by GOV-21 *Intensional definition*: at-heading explicit pair, inline-blockquote pair, at-heading explicit-pair-replacing-auto-id, or inline-paragraph pair.
- The four heading-rename sites whose GitHub auto-id slug shifts under T17a's prose rewrite are out of scope of this finding (T17d covers them).
- No prose tokens are modified by this finding (T17a/T17b cover prose rewrites).

## Relationships

(none — depends only on commit 4a7afbf, which is landed)
