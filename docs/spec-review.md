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
