---
projectTitle: pi-loom
commitPrefix: pi-loom

specPath: docs/spec.md
specReviewPath: docs/spec-review.md
specTopicsDir: docs/spec_topics

planPath: docs/plan.md
planReviewPath: docs/plan-review.md
planTopicsDir: docs/plan_topics
planConventionsPath: docs/plan_topics/conventions.md
planCoverageMatrixPath: docs/plan_topics/coverage-matrix.md

topicsLayout: flat
idAllocationPolicy: governed-by-spec

commitAddPaths:
  - docs/
---
# Project config — pi-loom

## Spec rules

pi-loom's spec carries **two governed identifier classes**, both defined and
gated on `docs/spec_topics/governance.md`:

- **REQ-IDs** (currently GOV-1, GOV-3, GOV-5–GOV-9, GOV-12, GOV-14–GOV-20,
  GOV-22–GOV-29, with GOV-2/4/10/11/13/21 retired; this snapshot is not
  authoritative —
  `docs/spec_topics/governance.md` owns the live GOV set). Prefix grammar
  `[A-Z]{2,4}`, numeric tail
  `[1-9][0-9]*`, canonical anchor `**PREFIX-N.**`. Live prefixes are
  registered in the *REQ-ID prefix table* on `governance.md` (`CEIL`,
  `CIO`, `GOV`, `PIC`, plus every topic-page prefix: `LEX`, `TYPE`, `SCHM`,
  `DESC`, `SUBS`, `FRNT`, `QRY`, `EXPR`, `BNDS`, `CTRL`, `ERR`, `RET`,
  `FN`, `TOOL`, `INV`, `IMP`, `DISC`, `SLSH`, `BNDR`, `CNCL`, `DIAG`,
  `RVM`, `IMPL`, `GRAM`). The table is append-only; retired prefixes move
  to the *Retired prefixes* sub-table and never recur.
- **Stable inline labels** (GOV-16). Prefix grammar `[A-Z][A-Z0-9]{1,5}`,
  tail is either numeric (`NOCEIL-3`) or a single lowercase letter
  (`HC3-a`), canonical anchor `**PREFIX-<tail>.**`. Live inline-label
  prefixes: `HC3`, `NOCEIL` (both bound to `hard-ceilings.md`).

**Allocation rules — what fixers MAY and MAY NOT do.**

- **MAY** allocate the next free numeric ID under an already-registered
  REQ-ID prefix (e.g. minting `BNDR-9` on `binder.md` when `BNDR-1..8`
  are live and there is no retirement collision per GOV-3). Numbering
  never collapses to fill holes; the next ID is `max(live ∪ retired) + 1`
  under that prefix.
- **MAY** allocate sub-letter children under an already-registered
  inline-label prefix when the tail form is `alphabetic` for that prefix
  (e.g. minting `HC3-f` on `hard-ceilings.md` when `HC3-a..e` are live).
- **MAY NOT** silently introduce a new prefix. Allocating a new REQ-ID
  prefix requires a GOV-7 *Add* row in the REQ-ID prefix table on
  `governance.md`; allocating a new inline-label prefix requires the
  corresponding GOV-16 row in the inline-label prefix table. A
  recommendation whose smallest natural fit requires a new prefix MUST
  surface the prefix-add in "Notes" so a human can review the GOV-7 /
  GOV-16 entry before authoring.
- **MAY NOT** reuse a retired prefix or a retired ID; both lookups
  consult the live + retired union.
- **MAY** introduce a sub-ID split of an existing REQ-ID where the
  originating finding's Solution approach explicitly authorises it
  (e.g. splitting `CIO-4` into `CIO-4a/4b/4c` to restore REQ-ID
  atomicity), provided GOV-3 / GOV-8 / GOV-9 obligations are met
  (immutability of the original ID under split, anchor lifecycle,
  retirement of the parent if the split fully replaces it). This is
  normal-course REQ-ID governance, not "inventing" a new ID.
- **MUST** coin a `PREFIX-N` REQ-ID anchor in the same commit when the
  edit adds a *defining obligation site* — or strengthens the
  normative-modal content of an existing one — on a non-narrative spec
  page and that site carries no co-located REQ-ID anchor in the
  post-edit text. Allocate the numeric tail per GOV-3 under the page's
  already-registered prefix; this is GOV-22's progressive-coinage
  obligation, without which GOV-9's `#prefix-n` cross-link contract is
  unsatisfiable for the freshly added or strengthened site. See
  `docs/spec_topics/governance/req-id-prefix-table-active-b.md#gov-22`.

**Anchor governance.** GOV-1's *Required HTML-anchor contexts* and
*Dual-form layout* obligations apply to all anchor sites — both classes
share the witness regex `<a id="prefix-n"></a> **PREFIX-N.**` (lowercased
in the `id` attribute) and the four enumerated rendering contexts. The
transitional rule (pre-backfill) still applies; the initial REQ-ID anchor
pass owns the one-shot backfill.

**Document-internal HTML anchors** (`<a id="…-i">`, `<a id="…-ii">`, and
similar non-PREFIX-N anchors used purely for in-page hash navigation) are
NOT REQ-IDs and are NOT inline labels under GOV-16. They are page-local
fragment identifiers and do not interact with `idAllocationPolicy`.

## Plan rules

Plan-leaf IDs follow `H1`–`H4` (horizontal phases), `M` (MVP), and
`V<N><letter>` (vertical-slice leaves, e.g. `V4b`, `V18o`). When picking a
new leaf ID, use the next free letter in the target phase; never reuse a
retired ID.

The plan has cross-cutting files at `docs/plan_topics/conventions.md` (leaf
format / authoring conventions) and `docs/plan_topics/coverage-matrix.md`
(spec-rule → leaf coverage). When creating, splitting, merging, or
removing a leaf, keep both consistent — the conventions file gates leaf
shape, the coverage matrix tracks closure of spec content.
