# Triaged Spec Review - spec

_Generated: 2026-05-27T11:30:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T20) is addressed first; the first finding (T04) is addressed last._

---

# T15 - Plan CI gate's "non-dense per-page numbering" rule contradicts GOV-8

**Kind:** doc-alignment-broad
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`docs/plan_topics/conventions.md`'s "REQ-ID discipline" bullet lists "a non-dense per-page numbering" as one of three V1.0 closing-gate CI failures. Read literally, this forbids any gap in the per-page live REQ-ID sequence — but GOV-8 on `docs/spec_topics/governance.md` deliberately produces such gaps via *Split*, *Merge*, and *Deletion* retirements, and the *Retired REQ-IDs* sub-table on `governance.md` already records four holes in the `GOV` sequence (`GOV-2`, `GOV-10`, `GOV-11`, `GOV-13`). An implementer wiring the literal check would fail the gate on every correctly-retired page, and a contributor "fixing" the spec to satisfy the gate would have to collapse IDs in violation of GOV-8 *Deletion*'s no-reuse rule.

## Solution approach

Rewrite the third closing-gate failure clause in the "REQ-ID discipline" bullet of `docs/plan_topics/conventions.md` to pin the densenes check to the per-prefix live-plus-retired union: the failure mode is a positive integer `n ≤ max(live ∪ retired)` for a page's prefix whose `n` appears in neither the live REQ-ID table nor the *Retired REQ-IDs* sub-table.

## Solution constraints

- The rewording MUST cover GOV-16 inline-label prefixes (whose retirements live in a parallel `## Retired inline labels` section per GOV-16 *Retirement section*), not only GOV-8 REQ-IDs — `hard-ceilings.md` owns the inline-label prefixes `HC3` and `NOCEIL` in V1 and the gate runs against that page.

## Relationships

- T16 "Plan-corpus cites retired GOV-10 and GOV-11 as live normative anchors" — same-cluster (both edit `conventions.md`; resolve independently, but a single PR can carry both edits)
# T16 - Plan-corpus cites retired GOV-10 and GOV-11 as live normative anchors

**Kind:** doc-alignment-broad
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

`docs/plan_topics/conventions.md` (the "Leaf format → **Spec.**" bullet) and `docs/plan_topics/leaf-template.md` (the **Spec.** paragraph) carry MAY / MUST obligations cited as `per [`governance.md` GOV-10]` and `per [`governance.md` GOV-11]`. Both IDs are retired in `docs/spec_topics/governance.md`: GOV-10 and GOV-11 fail GOV-18's arm-(a)/arm-(b) binding-scope test (they bind downstream plan-corpus artefacts, not the spec corpus or the implementation target) and the retirement registry stubs them with HTML-comment markers at their original sites. A contributor following either link lands on a retirement stub asserting the rule no longer binds anyone — plan prose asserts the obligation, the cited anchor denies it. The underlying intents (restrict a leaf's reading scope to its listed pages; close the `**Spec**` field under normative cross-link) remain valid as plan-side conventions, which is precisely why GOV-18 ruled them out as spec rules.

## Solution approach

At both call sites, delete the `per [`governance.md` GOV-10]` and `per [`governance.md` GOV-11]` parenthetical citations and restate the MAY and MUST as self-contained plan-corpus conventions. Retain the live `[`governance.md` GOV-3]` citation that governs the narrative-vs-normative cross-link exclusion inside the closure rule.

## Solution constraints

- Do not add new GOV-NN anchors on the spec side for either retired rule — doing so would re-introduce the GOV-18 binding-scope violation that motivated the retirement.
- Out of scope: `docs/spec_topics/governance.md` (the GOV-10 / GOV-11 retirement registry rows and the GOV-18 worked examples are already correct).

## Relationships

- T15 "Plan CI gate's `non-dense per-page numbering` rule contradicts GOV-8" — same-cluster (same surface — `conventions.md`'s cross-references to `governance.md` — but resolves independently)
