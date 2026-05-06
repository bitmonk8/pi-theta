# Governance

This page owns the spec corpus's REQ-ID governance: the per-page prefix table, the per-prefix retirement registry, and the rules (GOV-1 through GOV-8) that govern how REQ-IDs are coined, anchored, retired, and gated. The rules apply to every non-narrative page under `spec_topics/`; tooling enforcement lives in the [V18s coverage-matrix closing CI gate](../plan_topics/v18-cancellation.md#v18s-coverage-matrix-closing-ci-gate).

## REQ-ID prefix table

**GOV-1.** Each spec page that carries normative obligations is assigned a stable per-page REQ-ID prefix (table below). [H6](../plan_topics/h6-req-ids.md) owns the initial pass that inserts `PREFIX-N` anchors into each page. The canonical anchor form is the inline `**PREFIX-N.**` marker (used by H6's grep, by V18s, and by all downstream tooling); the alternate `<a id="prefix-n"></a>` HTML form is permitted only where rendering constraints make the inline marker impractical, in which case both forms appear together on the same line.

**GOV-2.** Once H6 lands, the plan's coverage matrix in [`plan_topics/coverage-matrix.md`](../plan_topics/coverage-matrix.md) is keyed per REQ-ID, mapping each ID to its closing leaf, and the [V18s coverage-matrix closing gate](../plan_topics/v18-cancellation.md#v18s-coverage-matrix-closing-ci-gate) treats any unmapped REQ-ID as a CI failure. Until H6 closes, the spec-side REQ-ID set is empty, the matrix is section-keyed scaffolding, and the V18s diff is vacuously satisfied.

**GOV-3.** The REQ-ID extraction regex is `\b[A-Z]{3,4}-[0-9]+\b`, applied to non-narrative `spec_topics/*.md` files. The Prefix column of the table below is the single source of truth for which pages are non-narrative: a row whose Prefix cell carries `(no IDs — narrative)` is excluded from extraction. IDs are immutable: when a rule is split, the original ID retires and two new IDs appear; numbering never collapses to fill holes.

| Page | Prefix |
|---|---|
| `lexical.md` | `LEX` |
| `type-system.md` | `TYPE` |
| `schemas.md` | `SCHM` |
| `descriptions.md` | `DESC` |
| `schema-subset.md` | `SUBS` |
| `frontmatter.md` | `FRNT` |
| `query.md` | `QRY` |
| `expressions.md` | `EXPR` |
| `bindings.md` | `BNDS` |
| `control-flow.md` | `CTRL` |
| `errors-and-results.md` | `ERR` |
| `return.md` | `RET` |
| `functions.md` | `FN` |
| `tool-calls.md` | `TOOL` |
| `invocation.md` | `INV` |
| `imports.md` | `IMP` |
| `discovery.md` | `DISC` |
| `slash-invocation.md` | `SLSH` |
| `binder.md` | `BNDR` |
| `cancellation.md` | `CNCL` |
| `diagnostics.md` | `DIAG` |
| `runtime-value-model.md` | `RVM` |
| `pi-integration-contract.md` | `PIC` |
| `implementation-notes.md` | `IMPL` |
| `pi-integration.md` | (no IDs — narrative) |
| `grammar.md` | `GRAM` |
| `governance.md` | `GOV` |
| `glossary.md` | (no IDs — narrative) |
| `overview.md` | (no IDs — narrative) |
| `influences.md` | (no IDs — narrative) |
| `comparison.md` | (no IDs — narrative) |
| `related-work.md` | (no IDs — narrative) |
| `future-considerations.md` | (no IDs — narrative) |

**GOV-4 (per-row invariant).** The prefix → page binding is append-only and immutable: once a prefix is allocated to a page (per GOV-7 *Add* or GOV-7 *Narrative-to-normative promotion*), the binding never changes silently and the prefix is never reassigned to a different page (per GOV-7 *Delete* and GOV-7 *Normative-to-narrative demotion*, retired prefixes move to the *Retired prefixes* sub-table below and are never reused). The *table rows themselves* are NOT immutable — GOV-7 *Rename* updates the Page column without changing the prefix, and GOV-7 *Delete* / *Merge* / *Normative-to-narrative demotion* remove or relocate rows. Introducing a new non-narrative page requires appending a new row whose prefix is *previously-unused* — meaning absent from both this table and the *Retired prefixes* sub-table below. The live table's `Prefix` column is a key — duplicate live `Prefix` values, and any live prefix that also appears in the *Retired prefixes* sub-table, are CI failures (per V18s gate 7 in [`plan_topics/v18-cancellation.md`](../plan_topics/v18-cancellation.md)).

**GOV-5 (disjoint-prefix rule).** Each row's `Prefix` value is a complete identifier token, not a search prefix. Tooling that consumes REQ-IDs MUST anchor matches at a word boundary on both ends (`\b<PREFIX>-[0-9]+\b`); two prefixes that share a common substring (e.g. `BNDS` / `BNDR`) MUST NOT be treated as aliases or as one prefix-matching the other.

**GOV-6 (table-completeness invariant).** At every commit on `main`, the set of prefixes appearing in REQ-IDs across `spec_topics/*.md` is a subset of the union of (live prefix table, Retired prefixes sub-table). The V18s gate (per [`plan_topics/v18-cancellation.md`](../plan_topics/v18-cancellation.md)) enforces this.

**GOV-7 (mutation procedures).**

- **Add.** New page → append a row with a previously-unused prefix.
- **Rename.** Prefix follows the page; the row's Page column updates, the Prefix column does not. Existing in-page anchors are not rewritten. In the same commit, update every reference to the old filename across `plan.md` and `plan_topics/**.md`; the V18s plan-link gate (per [`plan_topics/v18-cancellation.md`](../plan_topics/v18-cancellation.md#v18s-coverage-matrix-closing-ci-gate)) enforces this.
- **Delete.** The row is moved from the live table to the Retired prefixes sub-table. The prefix MUST NOT be reused.
- **Merge.** When `<absorbed-page>` is merged into `<surviving-page>`:
    - Every live REQ-ID on the absorbed page undergoes a GOV-8 *Merge* into a freshly allocated ID under the surviving prefix, appended at the surviving page's tail. The absorbed-page IDs retire on the absorbed page (its `## Retired REQ-IDs` section gains one row per merged ID) before the file is deleted.
    - The absorbed page's pre-existing `## Retired REQ-IDs` rows transplant verbatim into the surviving page's `## Retired REQ-IDs` section.
    - The absorbed prefix moves to the *Retired prefixes* sub-table; the *Formerly* cell records `<absorbed-page> (merged into <surviving-page> at <sha>)`.
    - The absorbed page file is deleted in the same commit (otherwise V18s gate 6 sees both a retired prefix and a live page carrying it).
- **Narrative-to-normative promotion.** Replace the `(no IDs — narrative)` cell with a freshly allocated prefix in the same edit that introduces the first obligation.
- **Normative-to-narrative demotion.** When a page that previously owned a prefix becomes pure narrative (every claim it carried is canonically owned elsewhere): (a) move its prefix from the live table to the *Retired prefixes* sub-table per GOV-7 *Delete*; (b) append a new live table row for the page carrying `(no IDs — narrative)`. Re-promotion later (per *Narrative-to-normative promotion* above) requires a *fresh* prefix — the original is retired and immutable per GOV-4 / GOV-5, and the *Retired prefixes* sub-table is itself append-only.

**GOV-8 (REQ-ID lifecycle).**

- **Split.** When one rule splits into N rules, the original ID retires and N fresh IDs are appended at the page's tail.
- **Merge.** When N rules merge into one, all N source IDs retire and one fresh ID is appended at the page's tail.
- **Deletion.** Rule removed without replacement → ID retires; the prefix-position number MUST NOT be reused.
- **Pure rewording.** Typo fixes, sentence restructuring, link updates leave the ID unchanged. A change that alters which inputs are accepted, which outputs are produced, which diagnostics fire, or which invariants hold is substantive and MUST be modelled as a split, merge, or deletion-plus-add — never as an in-place edit. This boundary is enforced by review on the PR that touches a `**PREFIX-N.**` paragraph; no V18s gate detects substantive in-place edits, and none is planned, because semantic equivalence between two prose paragraphs is not mechanically decidable. Worked examples:
  - Modal strengthening or weakening (`should` → `MUST`, `MUST` → `should`, `MAY` → `MUST`, etc.) inside a `**PREFIX-N.**` paragraph is **substantive** — the obligation's force has shifted even when the inputs and outputs at the moment of the edit appear unchanged. Treat as a split-or-deletion-plus-add. (This is the most commonly missed case in review; flag it first.)
  - Adding or removing a diagnostic code on a `**PREFIX-N.**` paragraph is **substantive** — it alters which diagnostics fire, per the test above. Treat as a split-or-deletion-plus-add. The new code's V18s diagnostic-registry entry is a separate, additive obligation and does NOT discharge the GOV-8 retirement requirement.
  - Editing a non-normative example (a fenced code block, parenthetical illustration, or worked sample) attached to a `**PREFIX-N.**` paragraph is **pure rewording**, provided the rule's normative sentences are unchanged. Examples do not constrain implementations. When in doubt about whether a sentence is normative or illustrative, retire-and-re-add.

All retirements (per GOV-7 *Delete* / *Merge* and per GOV-8 *Split* / *Merge* / *Deletion*) MUST be recorded:

- **Per-prefix retirements** appear in the *Retired prefixes* sub-table immediately below.
- **Per-ID retirements** appear in a trailing `## Retired REQ-IDs` section on each non-narrative page (skeleton inserted by [H6](../plan_topics/h6-req-ids.md)). After a GOV-7 *Merge*, the surviving page's `## Retired REQ-IDs` section accumulates rows under both the surviving and the absorbed prefixes (per the *Merge* sub-bullet above); the absorbed page's section is deleted with its file.

### Retired prefixes

| Prefix | Formerly | Retired in |
|---|---|---|
| `BIND` | `binder.md` | `7851d7c` |
| `BNDG` | `bindings.md` | `7851d7c` |
| `PIE` | `pi-integration.md` | `<demotion commit>` |

The Retired prefixes sub-table is itself append-only — a retired prefix cannot be un-retired or reassigned. The `Retired in` column carries either the 7-character abbreviated commit SHA (e.g. `7851d7c`) or a release tag (e.g. `v0.42.0`), nothing else — no prose, no parentheticals, no qualifiers (the `<demotion commit>` placeholder above is replaced with a concrete SHA at the moment of the demoting commit). The `Formerly` column names the page that historically carried the prefix; for rows recording a GOV-7 *Merge*, the cell takes the standard form `<absorbed-page> (merged into <surviving-page> at <sha>)` so future merges produce consistent rows. A fourth `Reason` column MAY be added without breaking the GOV-6 gate; if added, it carries free-form prose, while the `Retired in` cell remains strictly SHA-or-tag.
