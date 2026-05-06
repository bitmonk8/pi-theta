# pi-loom — Consolidated Spec Review

_Generated: 2026-05-06T06:31:26Z_
_Source: docs/reviews/spec-review/spec-20260506-064723.md_
_5 findings retained (collapsed from 93 by merge / subsumption), 14 false positives dropped, 0 persistent failures_

_Severity: 27 correctness · 17 advisory · 12 cosmetic · 0 blocking_
_Shape: 56 single · 0 multiple · 0 unresolved_

---

## spec.md — Introduction (paragraphs before "Orientation")

---

# Self-referential "informative orientation only" clause in spec.md introduction

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Self-referential "informative orientation only" clause
**Kind:** cruft

## Finding

The second paragraph of `spec.md` ends with the trailing clause: *"The full conceptual model is normative in [Overview](./spec_topics/overview.md) and the topic pages it links; this paragraph is informative orientation only."* The clause is self-referential — it annotates the very paragraph it appears in — and reads as authoring meta-commentary that escaped a style-guide note into reader-facing prose.

The functional content the clause carries is already conveyed by other means in the same paragraph: the inline cross-links to `errors-and-results.md`, `slash-invocation.md`, and `diagnostics.md` route the reader to the normative surfaces, and the [Overview] link in the clause itself is duplicated by the [Reading order] section a few lines below. The "informative orientation only" tag adds no information a reader can act on; it only signals authorial intent.

A secondary problem: the designation is contradicted in practice. The third introductory paragraph contains normative diagnostic codes (`loom/parse/invoke-non-loom-extension`, `loom/parse/import-non-warp-extension`) and a normative discovery-glob constraint (`*.loom` only), so the "informative" label cannot be trusted at the section granularity it's being applied at — see the related finding below.

## Spec Documents

- `spec.md` — Introduction (paragraphs before "Orientation"), specifically the trailing clause of paragraph 2 (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — no leaf has the spec.md introduction in its **Spec** field, and no leaf's acceptance criteria depend on the wording. H6 visits non-narrative spec pages to inject REQ-ID anchors but does not retouch the `spec.md` introduction's prose.

## Consequence

**Severity:** cosmetic

A reader briefly notices the awkward self-reference and moves on. No implementer behaviour diverges; no test or diagnostic is at stake. The cost is purely the editorial signal that the intro section's invariants are not yet stable, which weakens reader trust in adjacent prose.

## Solution Space

**Shape:** single

### Recommendation

Strike the trailing sentence of `spec.md` paragraph 2: "The full conceptual model is normative in [Overview](./spec_topics/overview.md) and the topic pages it links; this paragraph is informative orientation only." Leave the rest of the paragraph untouched. The [Overview] link is already reachable from the **Reading order** subsection that follows, so no information is lost.

Edge case for the implementer: do not also delete the inline `[Overview]` link target — the route to the normative model must remain, just without the meta-annotation. After the edit, paragraph 2 ends at "...the per-stage error surfaces and the partial-append contract."

## Related Findings

- "Normative error-code rules embedded in informative introduction" — decision-dependency (that finding is premised on the intro being labelled "informative orientation only"; deleting the label per Option A removes its framing but not its substance — the diagnostic codes still belong in `imports.md` / `discovery.md` regardless. The two should be resolved together so the intro's normative posture is decided once.)

---

# Extension matching has no defined case-folding policy

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Case-folding on case-insensitive filesystems not addressed
**Kind:** completeness

## Finding

Every place the spec mentions the `.loom` / `.warp` extensions — the discovery glob (`discovery.md` "matches only `*.loom`"), the `invoke` literal check (`invocation.md` "must end in `.loom`"), the `import` literal check (`imports.md` "must end in `.warp`"), the `tools:` `.loom` entry rule (`frontmatter.md` "must end in `.loom`"), and the settings/CLI `--loom` `loom/load/invalid-extension` check (`discovery.md`) — describes the comparison in lowercase prose without saying whether the comparison itself is case-sensitive. The spec is otherwise meticulous about case for *stems* (`discovery.md` line 70 mandates per-source case-insensitive collision detection on case-insensitive filesystems; line 72 forbids case-folding on the slash-name) but says nothing about the *extension*.

Two concrete divergences result. (1) On Windows or APFS-default macOS, a file saved as `Plan.LOOM` may or may not be picked up by the discovery walker depending on whether its glob library treats `*.loom` as case-sensitive (Node's `fast-glob`/`micromatch` defaults to case-sensitive; `globby` is the same; OS-native APIs differ). Two reasonable implementations diverge silently. (2) For the literal-extension parse-time checks, an author writing `invoke("./mod.LOOM", ...)` or `import { X } from "./mod.WARP"` either (a) gets `loom/parse/invoke-non-loom-extension` / `loom/parse/import-non-warp-extension`, (b) silently resolves on case-insensitive filesystems and parse-errors on Linux, or (c) silently resolves everywhere. The spec admits all three readings.

The decision interacts with the existing `loom/load/case-collision` rule for stems: a uniform policy on extension casing is required so the two rules compose without contradiction (e.g. is `Plan.LOOM` and `plan.loom` a case-collision pair? a single file? two distinct files? an invalid-extension rejection?).

## Spec Documents

- `spec_topics/discovery.md` — "Discovery is non-recursive and matches only `*.loom`" + "Case-insensitive filesystem collisions" + settings/CLI `loom/load/invalid-extension` rule (edited)
- `spec_topics/imports.md` — "Path resolution" paragraph defining `loom/parse/import-non-warp-extension` (edited)
- `spec_topics/invocation.md` — "Resolution" paragraph defining `loom/parse/invoke-non-loom-extension` (edited)
- `spec_topics/frontmatter.md` — `tools:` `.loom`-path rule defining `loom/load/unresolvable-loom-path` (edited)
- `spec_topics/lexical.md` — Path-literal definition (option-dependent — only edited if the policy is anchored in the path-literal rule)
- `spec.md` — Introduction paragraph naming the `.loom`/`.warp` extensions (read-only)

## Plan Impact

**Phases:** Vertical V14, Vertical V15, Vertical V17

**Leaves (implementation order):**

- V14k — Discovery: global `~/.pi/agent/looms/` — (modified)
- V14l — Discovery: project `.pi/looms/` — (modified)
- V14m — Discovery: package `looms/` and `pi.looms` — (modified)
- V14n — Discovery: settings file reads — (modified)
- V14o — Discovery: `--loom` CLI flag — (modified)
- V15a — `invoke("./path.loom", ...)` parsing and resolution — (modified)
- V15e — `.loom` paths in `tools:` (default basename naming) — (modified)
- V15f — `.loom` path with `as` rename — (modified)
- V17c — `import { X } from "./y.warp"` — (modified)

## Consequence

**Severity:** correctness

Two competent implementations choosing different glob libraries — or different parse-time string comparisons — would behave differently on the same project on Windows. A loom file saved with an uppercase extension, an `invoke("./x.LOOM", ...)` literal, or a `tools: [./x.LOOM]` entry could be valid on one host and a load-time error on another. The cross-platform reproducibility the rest of the spec works hard to preserve (the `homedir()` seam, the `path.delimiter` rule for `--loom`, the per-source case-collision rule) is undermined at the very first byte the loader inspects.

## Solution Space

**Shape:** single

### Recommendation

Adopt strict lowercase ASCII extension matching across every site, with one new diagnostic to surface the silent-invisibility case on case-insensitive filesystems.

**Spec edits.**

- `lexical.md`: add a one-paragraph normative rule — "The `.loom` and `.warp` file extensions are matched byte-exact in lowercase ASCII wherever they appear — in discovery globs, in path literals consumed by `import`, `invoke`, and `tools:`, and in settings/CLI extension checks. No case-folding is performed."
- `discovery.md`: cross-reference the rule above; add `loom/load/non-canonical-extension` (warning) to the failure-modes section and to the diagnostic-code registry section. The warning fires when discovery reads a directory and finds a file whose stem matches the slash-name regex but whose extension is a non-canonical case-variant of `.loom` or `.warp`.
- `imports.md`, `invocation.md`, `frontmatter.md`: replace each "must end in `.loom` / `.warp`" prose phrase with a cross-link to the lexical rule.

Edge cases for the implementer:

- The `loom/load/non-canonical-extension` warning fires only for files whose **stem** would otherwise be a valid slash name; files with junk stems (`.config.LOOM`, `notes.txt.LOOM`) stay silent to avoid noise.
- On case-insensitive filesystems, the warning must not fire twice if both `Plan.loom` and `Plan.LOOM` resolve to the same inode — dedupe by `realpath` first, then case-check.
- The warning is per-source (like `loom/load/case-collision`), not global.
- The literal-extension parse checks (`loom/parse/invoke-non-loom-extension`, `loom/parse/import-non-warp-extension`, `loom/load/unresolvable-loom-path`) need no new code — they already fire on `.LOOM` once the comparison is specified as byte-exact.

## Related Findings

- "Non-`.loom`/`.warp` and edge-case path failure modes not enumerated" — same-cluster (both push for a complete, named taxonomy of extension/path failure modes; the case-folding rule is one row in that taxonomy)
- "`.loom`/`.warp` namespace clearance treated as a given" — same-cluster (both concern the precise definition of the `.loom` / `.warp` extension surface)
- "Prefix uniqueness scope ambiguous (case-sensitivity; GOV prefix status)" — same-cluster (the same "is this comparison case-sensitive?" question, applied to REQ-ID prefixes; resolving both with the same policy stance — strict or folded — keeps the spec internally consistent)

---

# Authoring conventions paragraph misplaced in informative introduction

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Authoring-conventions paragraph placement
**Kind:** placement

## Finding

`spec.md`'s introduction closes with a paragraph that imposes three authoring obligations on the spec/plan corpus: (1) every topic page must be self-contained and any cross-spec dependency must be carried by a markdown link to the depended-upon REQ-ID anchor (or to a section heading on a pure-narrative page); (2) plan leaves are defined and may restrict their reading scope to the topic pages listed under the leaf's `**Spec**` field; (3) the `**Spec**` field is required to be closed under normative cross-link. These are governance/authoring rules that constrain how editors maintain spec and plan, on the same conceptual axis as GOV-1 through GOV-8 in the Appendix (REQ-ID lifecycle, prefix-table maintenance, mutation procedures).

They sit in a section that the prior paragraph explicitly labels "informative orientation only," and they carry no `GOV-N` (or other) identifier — so plan leaves and the V18s tooling cannot cite them, even though the third obligation (`**Spec**`-field closure) is already restated nearly verbatim in `plan_topics/conventions.md` without an anchor either. The result is a normative governance rule that is (a) hidden inside informative narrative, (b) duplicated across spec and plan with no shared identifier, and (c) untraceable.

## Spec Documents

- `spec.md` — Introduction (final paragraph, before `## Orientation`) (edited)
- `spec.md` — Appendix (REQ-ID prefix table, GOV-1…GOV-8 block) (edited)
- `plan_topics/conventions.md` — Leaf format / `**Spec**`-field bullet (option-dependent)
- `plan.md` — read-only (verifies no leaf currently cites the introduction paragraph by anchor)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. No existing leaf's acceptance criteria depend on the location of these obligations; `plan_topics/conventions.md` already restates the closure rule independently. Editors of `plan_topics/conventions.md` will benefit from a stable `GOV-N` anchor to cite, but no leaf becomes blocked or modified by the move.

## Consequence

**Severity:** advisory

The current placement does not break any implementation, but it weakens governance hygiene: the `**Spec**`-field closure rule is normative authoring contract, yet it lives in a section explicitly marked informative and has no ID for plan leaves, review tooling, or the V18s gate to reference. The duplication between `spec.md` intro and `plan_topics/conventions.md` will drift the moment one side is edited without the other.

## Solution Space

**Shape:** single

### Recommendation

Promote the three obligations in the introduction's authoring-conventions paragraph to `GOV-10`, `GOV-11`, `GOV-12` in `spec_topics/governance.md` (the page that owns the GOV namespace after the prior extraction commit), and delete the introduction paragraph from `spec.md`. This commit also resolves the sibling finding "`Spec` field closure rule under-specifies link direction and transitivity" — GOV-12 explicitly carries the closure direction (outbound from listed-topic) and transitivity (fixed-point) wording, and the original under-specified paragraph in `spec.md` is deleted in this same edit.

**Spec edits.**

- Append three new bulleted rules to `spec_topics/governance.md` immediately after `GOV-9 (Retirement recording)`:
  - **GOV-10 (cross-link form).** Each spec page that depends on a rule from another topic must either state the rule locally or reference it by a markdown link to the specific REQ-ID anchor (`#prefix-n`). Where the depended-upon page is pure-narrative, a section-level link suffices.
  - **GOV-11 (plan-leaf reading scope).** An implementer MAY restrict their reading to the topics listed under their plan leaf's `**Spec**` field (where a *plan leaf* is a terminal task in `plan.md` and its `**Spec**` field is the list of `spec_topics/*.md` filenames the leaf implements).
  - **GOV-12 (Spec-field closure).** The `**Spec**` field is closed under normative cross-link: closure runs from listed-topic outbound, applies transitively to a fixed point. Pure-narrative pages (the same set GOV-3 carves out) do not trigger closure.
- Delete the corresponding paragraph from `spec.md` (the paragraph beginning "Each topic page is authored to be self-contained..." and ending "...listed.").
- Rewrite `plan_topics/conventions.md`'s leaf-format `**Spec**` bullet to cite `GOV-11` and `GOV-12` instead of restating the rules.

Edge cases for the implementer:

- The GOV-12 wording must make closure direction and transitivity explicit (closure runs from listed-topic outbound; applies to a fixed point) — the original prose was ambiguous on both axes.
- Word the narrative-page carve-out in GOV-12 identically to the equivalent list in `plan_topics/conventions.md` so a future audit can grep them as a pair.
- The new GOV IDs are extracted from `governance.md` per GOV-3 (the page is non-narrative); H6's anchor pass and V18s gates apply normally.

## Related Findings

- "Self-referential 'informative orientation only' clause" — co-resolve (the paragraph immediately above this one is the source of the "informative" label that makes the placement a defect; deleting that clause and removing the authoring-conventions paragraph are part of the same intro cleanup).
- "Normative error-code rules embedded in informative introduction" — same-cluster (parallel placement defect: another body of normative content is hiding in the same informative section; both findings argue for evicting normative content from the introduction).
- "'Closed under normative cross-link' definition ambiguous" — co-resolve (the GOV-11 rewording prescribed in the recommendation must adopt the disambiguated wording from that finding).
- "Introduction cross-references by section link, not REQ-ID anchor" — same-cluster (touches the same paragraph cluster but resolves independently — that finding fixes link form, this one fixes paragraph location).
- "GOV-N governance rules: scope boundary in spec.md" — decision-dependency (if GOV-N is extracted to a separate governance page, the new GOV-9/10/11 should be minted on that page rather than in `spec.md` Appendix; resolve that finding first or in the same edit).

---

# Introduction cross-references use section anchors where REQ-ID anchors will exist

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Introduction cross-references by section link, not REQ-ID anchor
**Kind:** traceability

## Finding

`spec.md`'s introduction contains at least one cross-reference whose link target is a section heading on a non-narrative page rather than a REQ-ID anchor: `[Discovery — File-extension namespace](./spec_topics/discovery.md#file-extension-namespace)` resolves to the inline `<a id="file-extension-namespace">` block before `### File-extension namespace` in `discovery.md`. That heading is the canonical home of the namespace-clearance rule the introduction relies on to assert "slash invocation is prevented by construction" and to introduce `loom/parse/invoke-non-loom-extension` / `loom/parse/import-non-warp-extension`. Once H6 places `DISC-N` markers on the rules in that section, the link as it stands will skip past the anchor it should be aimed at.

The spec's own cross-link rule (third paragraph from the bottom of the introduction) requires that any cross-topic dependency on a normative rule resolve to a `#prefix-n` anchor; section-level links are reserved for pure-narrative pages, which `discovery.md` is not. The rule is phrased to govern "Each topic page" — `spec.md` is the index, not a topic page, so the rule does not literally bind the introduction. But the introduction is the document where the rule itself is stated, and at least one of the introduction's own normative-flavoured citations (the namespace-clearance pointer above) sits on the wrong side of that rule. After H6 lands, this becomes a live inconsistency rather than a pre-anchor scaffolding artefact.

The "bundled" pattern the original finding also flagged ("for the per-stage error surfaces and the partial-append contract" → three separate `[link]`s to `errors-and-results.md`, `slash-invocation.md`, `diagnostics.md`) sits inside the paragraph that explicitly self-tags as "informative orientation only", and each page already carries its own link, so the bundling is not a violation. The narrow, real defect is the single section-anchor link to `discovery.md` plus the absence of any plan step that revisits `spec.md`'s introduction once anchors exist.

## Spec Documents

- `spec.md` — Introduction (paragraphs 4 and 5, before "Orientation") (edited)
- `spec_topics/discovery.md` — `### File-extension namespace` section, target of the affected link (read-only; H6 will place `DISC-N` markers here)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)

H6's current **Adds** field enumerates "every non-narrative spec page listed in the [REQ-ID prefix table]" and explicitly excludes `spec.md` (which carries `GOV` only and is not in the per-page-prefix loop). Resolving this finding either grows H6's scope to also rewrite `spec.md`'s introduction cross-references against the freshly inserted `DISC-N` (and any sibling) anchors, or adds a one-line bookkeeping step to the same leaf. No other leaf touches `spec.md` cross-link form.

## Consequence

**Severity:** advisory

The single mis-targeted link is harmless today (no anchors exist yet) and remains harmless after H6 in the sense that the section heading still resolves. The cost is traceability: a reviewer or coverage tool that walks `spec.md`'s outbound links to confirm every normative dependency reaches a REQ-ID will report this link as a miss, and the introduction's own cross-link rule will read as aspirational rather than enforced from the page that introduces it.

## Solution Space

**Shape:** single

### Recommendation

Extend H6's **Adds** field with an explicit step: "After per-page anchor insertion, rewrite each cross-reference in `spec.md`'s introduction whose target is a non-narrative spec page so that the link resolves to the most specific `#prefix-n` anchor for the rule being cited; section-level link targets remain only for pure-narrative pages per the introduction's cross-link rule." Concretely, the affected link in the introduction is the one to `discovery.md#file-extension-namespace`; it should be re-aimed at whichever `DISC-N` H6 assigns to the namespace-clearance rule (the rule that pins the "discovery scans `*.loom` only" invariant and the two cross-extension diagnostic codes). Add a corresponding bullet to H6's **Tests**: "`spec.md`'s introduction contains zero links of the form `./spec_topics/<non-narrative-page>.md#<non-prefix-anchor>`; the test computes the non-narrative-page set from the prefix table and the prefix set from the same source, and `grep`s the introduction for residual section-anchor targets." 

Edge cases the implementer must watch:
- The introduction's third paragraph self-tags as "informative orientation only" and bundles three normative pages under one prose phrase ("for the per-stage error surfaces and the partial-append contract"). Each of those pages already has its own discrete `[link]`, so the bundling is not in scope; the test should not flag those.
- `spec.md` itself is not a topic page and is excluded from the H6 per-page anchor loop. The new step rewrites *outbound* links from `spec.md` to anchors that other pages will own; it does not insert any `GOV-N` markers into `spec.md`'s introduction.
- If the namespace-clearance rule on `discovery.md` ends up split across multiple `DISC-N` IDs (e.g. one for the glob, one for each cross-extension diagnostic), the introduction link should aim at whichever ID the introduction's prose actually depends on (the namespace-clearance assertion), not the whole section.

## Related Findings

- "Authoring-conventions paragraph placement" — same-cluster (the cross-link rule the introduction cites lives in the same paragraph; if it moves to the Appendix, the rewritten introduction links in this finding's recommendation must continue to honour it from its new home)
- "\"Closed under normative cross-link\" definition ambiguous" — same-cluster (also targets the cross-link rule; resolving its direction/transitivity ambiguity should land before any test that walks the introduction's outbound links)
- "Normative error-code rules embedded in informative introduction" — decision-dependency (if `loom/parse/invoke-non-loom-extension` and `loom/parse/import-non-warp-extension` are moved out of the introduction into `imports.md` / `discovery.md` per that finding's fix, the `discovery.md#file-extension-namespace` link from `spec.md` may no longer be needed at all, or may need to point at a different `DISC-N`)

---

# `.warp` orientation hedges the declaration-form list with "small"

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** "Small set of declaration forms" vague qualifier
**Kind:** clarity

## Finding

The orientation paragraph in `spec.md` (line 9) describes `.warp` files as "library modules whose top level is restricted to a small set of declaration forms — see [Imports](./spec_topics/imports.md) for the normative list". The qualifier "small" carries no information: the reader still has to follow the link to learn what is permitted, and "small" is not a defined size class anywhere in the spec. The normative source (`spec_topics/imports.md` line 11) enumerates exactly five forms — `import`, `export`, `schema`, `enum`, `fn` — so a concrete count or a bare reference to the enumeration would orient the reader without injecting an unmeasured adjective.

This sits in informative orientation prose, so nothing observable breaks, but the hedge is the kind of editorial filler the spec elsewhere takes pains to avoid, and the parenthetical that follows ("including `enum` per [Schema Declarations]…") already hints that the set is small enough to almost list inline — making "small" doubly redundant.

## Spec Documents

- `spec.md` — Introduction (orientation paragraph, line 9) (edited)
- `spec_topics/imports.md` — IMP-1 top-level form list (read-only; ground truth for the count/enumeration)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(Editorial-only change to informative orientation prose. The normative form list lives in `imports.md` and is consumed by V17a/V17g, which are unaffected.)

## Consequence

**Severity:** cosmetic

The orientation paragraph remains correctly understood once the reader follows the link, so no implementer or test author is misled. The cost is a small drag on the spec's overall editorial discipline against vague qualifiers.

## Solution Space

**Shape:** single

### Recommendation

Rewrite paragraph 4 of `spec.md` Introduction (the `.warp` / discovery paragraph) to remove four overlapping defects: vague "small set of declaration forms" hedging, duplicated normative error-code rules, implied exhaustive enumeration of diagnostic codes, and un-anchored namespace-clearance note. This commit also resolves the sibling findings "Normative error-code rules duplicated in spec.md introduction", "Introduction's path-extension paragraph cites two diagnostic codes but implies an exhaustive enumeration", and "`.loom` / `.warp` namespace-clearance note lacks a reproducible audit anchor".

**Spec edits.**

In `spec.md` Introduction, replace paragraph 4 with a paragraph that:

- States the canonical content of the `.warp` declaration-form list by cross-reference, naming the count and pointing at the enumeration in `imports.md`. Example phrasing: "`.warp` files are library modules whose top level is restricted to the declaration forms enumerated in [Imports — Permitted top-level forms](./spec_topics/imports.md#permitted-top-level-forms) (currently five: `import`, `export`, `fn`, `schema`, `enum`)." Replace the hedging "small set" with this concrete count + cross-reference.
- Replaces the three normative error-code statements (`loom/parse/invoke-non-loom-extension`, `loom/parse/import-non-warp-extension`, and the implied "discovery scans `*.loom` only" rule) with a single non-normative summary sentence: "Path literals and discovery enforce these extensions per the rules in [Imports](./spec_topics/imports.md), [Invocation](./spec_topics/invocation.md), and [Discovery](./spec_topics/discovery.md); see those pages for the diagnostic codes that fire on each violation."
- Drops the inline two-code enumeration entirely; readers follow the topic-page link to `diagnostics.md` for the canonical code list.
- Replaces the parenthetical "discovery scans `*.loom` only — see [Discovery — File-extension namespace](./spec_topics/discovery.md#file-extension-namespace)" with a cross-reference to a stable section anchor in `discovery.md`. The cross-reference target MUST be the section anchor `#file-extension-namespace`; the introduction does not restate the namespace-clearance content.

**Cross-cutting edits.**

- `spec_topics/imports.md`: ensure the "Permitted top-level forms" enumeration is normative and stable; add the `#permitted-top-level-forms` section anchor if absent.
- `spec_topics/discovery.md`: ensure the `#file-extension-namespace` section anchor exists and is stable; the clearance audit content lives there as the single normative source.
- `spec_topics/diagnostics.md`: no edit; the introduction no longer duplicates codes from the registry.

Edge cases for the implementer:

- The introduction paragraph 4 drops to a pointer paragraph — every normative claim it carried now lives on its topic page. This matches the pattern the GOV-N extraction commit applied to the appendix.
- The five-form count for `.warp` is informative; if a future edit changes the permitted set (per `imports.md`), the introduction's count must update in the same commit. Cross-link discipline (per GOV-10) makes this a one-site edit.
- The introduction paragraph ends without restating any normative obligation. Readers seeking the rules follow the cross-references.

## Related Findings

- "Self-referential \"informative orientation only\" clause" — same-cluster (same orientation paragraph block; both are editorial-clarity nits)
- "Introduction cross-references by section link, not REQ-ID anchor" — same-cluster (touches the same orientation paragraph's links; resolves independently)
- "Authoring-conventions paragraph placement" — same-cluster (adjacent orientation prose; independent fix)

