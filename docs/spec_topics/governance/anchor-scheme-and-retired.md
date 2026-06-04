# Anchor scheme and retired

## Orientation-anchor scheme stability

<a id="gov-23"></a> **GOV-23 (`spec.md` Session Model anchor-scheme stability and citation guidance).** The [`spec.md`](../../spec.md) Session Model section publishes page-local `sm-N-…` anchors — the umbrella `session-model` anchor, the SM-3 / SM-7 sub-umbrella anchors (`sm-3-session-shutdown-handler`, `sm-7-mode-qualified-concurrency`), and the per-sub-obligation sub-letter anchors (`sm-3a`/`sm-3b`, `sm-7a` … `sm-7e`) — so that an inbound citation can pin a single SM-N sub-obligation without the others. These are page-local fragment identifiers for in-page navigation, not REQ-IDs and not [inline labels](./stable-inline-labels.md#gov-16). *Anchor-scheme stability.* A published `sm-N-…` anchor MUST NOT be reused for a different obligation: a future split of an SM-N appends new sub-letters rather than renumbering existing siblings, and a retired SM-N's anchor MUST NOT be recycled. *Citation guidance.* An orientation-level inbound link that cites the session model — or an SM-3 / SM-7 group — as a unit (index entries, reading-order pointers, aggregator references) SHOULD target the corresponding umbrella anchor; an inbound citation that pins a single sub-obligation SHOULD target the specific `sm-N-…` (or sub-letter) anchor. A later sub-letter addition (e.g. an `SM-7f`) is therefore not implicitly aggregated into a pre-existing citation's scope. This rule binds the spec corpus itself (arm (b) per [GOV-18 arm (b)](./corpus-direction-and-scope.md#gov-18-arm-b)).

<a id="retired-req-ids"></a>

## Retired REQ-IDs

| REQ-ID | Retired in | Replaced by | Reason |
|---|---|---|---|
| GOV-2 | `<retirement commit>` | — | Bound a downstream coverage-matrix tracker to map every REQ-ID to a closing leaf and exit non-zero on unmapped IDs; per [GOV-18](./corpus-direction-and-scope.md#gov-18), the tracker is neither the implementation target (arm a) nor the spec corpus itself (arm b). |
| GOV-10 | `<retirement commit>` | — | Bound an implementer's reading-scope to a downstream document's per-leaf `**Spec**` field; per [GOV-18](./corpus-direction-and-scope.md#gov-18), the implementer's reading process is neither the implementation target (arm a) nor the spec corpus itself (arm b). |
| GOV-11 | `<retirement commit>` | — | Bound a downstream document's `**Spec**` field to a closure-under-cross-link obligation; per [GOV-18](./corpus-direction-and-scope.md#gov-18), the downstream document's data-structure shape is neither the implementation target (arm a) nor the spec corpus itself (arm b). |
| GOV-13 | `c253233` | GOV-15 | Modal weakening (RFC-2119 SHOULD → non-binding "is expected to") per GOV-8 *Pure rewording* limit; original wording promised a property the spec deliberately leaves un-gated. |

The Retired REQ-IDs sub-table is append-only per GOV-8. The `Retired in` column carries either the 7-character abbreviated commit SHA or a release tag (the `<retirement commit>` placeholder is replaced with a concrete SHA at the moment of the retiring commit). A retired ID's prefix-position number MUST NOT be reused per GOV-8 *Deletion*.

<a id="retired-anchor-aliases"></a>

## Retired anchor aliases

Records the retirement of `<a id="v1-…">` back-compat aliases under [GOV-21 *Retirement discharge*](./release-version-naming.md#gov-21-retirement-discharge). Retirement is per-alias: each row retires one `v1-*` alias from one owner heading or paragraph, leaving the heading's surviving `loom-1-0-*` (or `loom-1-0-0-*`) arm intact. The sub-table is append-only on the same terms as the *Retired prefixes* sub-table earlier on this page and the *Retired REQ-IDs* sub-table above; retired alias slugs MUST NOT be re-coined.

| Retired alias slug | Owner heading or paragraph | Retired in | Reason |
|---|---|---|---|

- **Retired alias slug** — the kebab-case slug (e.g. `v1-seam-binder-refinement-loop`), without the leading `#`.
- **Owner heading or paragraph** — the heading text or paragraph reference the alias was attached to, with a markdown cross-link to the heading's surviving `loom-1-0-*` (or `loom-1-0-0-*`) arm.
- **Retired in** — the 7-character abbreviated commit SHA of the retirement commit, or the release tag of the loom 1.x release that performed the retirement, on the same value-space as the *Retired in* column of the *Retired prefixes* sub-table.
- **Reason** — one short prose line.

Applicability: alias-only retirements on `docs/spec.md` and `docs/spec_topics/*.md` only. Plan-corpus aliases (none currently exist) and out-of-corpus pages (`README.md`, `CHANGELOG.md` — [GOV-17](./corpus-direction-and-scope.md#gov-17) dependents) are out of scope of this sub-table.
