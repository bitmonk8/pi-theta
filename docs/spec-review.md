# pi-loom — Consolidated Spec Review

_Generated: 2026-05-06T06:31:26Z_
_Source: docs/reviews/spec-review/spec-20260506-064723.md_
_20 findings retained (collapsed from 93 by merge / subsumption), 14 false positives dropped, 0 persistent failures_

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

---

## spec.md — Orientation → Prerequisites → Pi SDK and capabilities

---

# SDK capability bullets in spec.md Orientation are unreachable to REQ-ID tooling

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** SDK capability bullets carry no traceable identifiers
**Kind:** traceability

## Finding

`spec.md` Orientation → Prerequisites carries normative content with no path to a stable identifier under the existing governance rules. The seven SDK capability bullets (lines 23–29: `pi.registerCommand`, `pi.sendUserMessage` + `ctx.waitForIdle`, `createAgentSession`, `pi.registerTool` + `pi.setActiveTools`, Pi-supplied `AbortSignal`, `pi.sendMessage` + `pi.registerMessageRenderer`, binder LLM model resolution) each state a distinct load-bearing obligation. Two further standalone normative sentences sit alongside: "Widening `peerDependencies` requires re-validating the surface inventory above…" (line 31) and "A Pi minor bump that widens or narrows that range requires re-validating the loom range in the same edit" (line 33). One of these refers to "the surface inventory above" by paraphrase rather than ID.

GOV-3 restricts the REQ-ID extraction regex to `spec_topics/*.md`. The `GOV` prefix in the appendix table is scoped to "this appendix's GOV-N rules" — it does not cover the Orientation section. There is no other prefix assigned to `spec.md`. H6's anchor pass (per `plan_topics/h6-req-ids.md`) only visits non-narrative pages listed in the prefix table, so it will not anchor any of these bullets or sentences. Plan leaves and test authors must therefore cite them by paraphrase, the V18s coverage-matrix gate cannot police whether any leaf actually closes them, and a reviewer cannot grep for which leaf owns "the binder LLM model fail-load rule" or "the peer-dep re-validation obligation."

The duplication of the same surface in `pi-integration-contract.md` (which *will* carry `PIC-N` IDs after H6) compounds the problem: when one location drifts, there is no mechanical link from the spec.md bullet to the corresponding PIC-N rule.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Pi SDK and capabilities (edited)
- `spec.md` — Appendix → REQ-ID prefix table / GOV-3 (option-dependent; edited only under Option B)
- `spec_topics/pi-integration-contract.md` — Host prerequisites, Extension entry point, Conversation drive (prompt + subagent), Tool-registration lifetime and visibility, Cancellation source, System notes (option-dependent; edited under Option A as the relocation target)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)
- V18s — coverage-matrix closing CI gate — (modified)

## Consequence

**Severity:** correctness

Plan leaves cannot pin the SDK-capability obligations or the re-validation rules to stable identifiers, and the V18s coverage-matrix gate has no row to police them. Two reasonable implementers will write divergent tests for "Pi SDK capability X is required at load" because each will paraphrase the bullet differently, and silent drift between the spec.md bullets and `pi-integration-contract.md`'s soon-to-be PIC-N rules has no mechanical detector.

## Solution Space

**Shape:** single

### Recommendation

Relocate the seven SDK-capability bullets from `spec.md` Orientation into `pi-integration-contract.md` as `PIC-N`-anchored normative rules, and replace the bullets in `spec.md` with a name-only bulleted cross-reference list (each capability name links to its new PIC-N anchor). This commit also resolves the sibling "SDK capability list duplicates `pi-integration-contract.md`" finding.

**Spec edits.**

- Add a `## SDK capability inventory` section to `pi-integration-contract.md` containing seven numbered obligations (one per former `spec.md` bullet) plus the two re-validation sentences. H6 will assign each a `PIC-N` ID under its existing scope.
- In `spec.md` Orientation → Prerequisites → "Pi SDK and capabilities", replace the bullets and their connector with a name-only cross-reference list of the form:
  - `**Slash-command registration** — see [PIC-N](./spec_topics/pi-integration-contract.md#pic-n).`
  - (and so on for each of the seven capabilities)
- Keep the introductory sentence about the peer-dep pin and the standalone trailing sentence about widening `peerDependencies` requiring re-validation; both are independent of this finding.

Edge cases for the implementer:

- Bullet 7's `loom/load/binder-model-unresolved` registry code is also referenced in `binder.md` (which owns the `BNDR` prefix). Keep `binder.md` as the canonical home and have the new PIC-N rule cross-reference it rather than restating the code.
- The bullet on Pi-supplied `AbortSignal` overlaps with `pi-integration-contract.md`'s existing "Cancellation source" prose — fold rather than duplicate.
- After relocation, sweep `plan.md` and `plan_topics/` for any `Spec.` line that links to `spec.md#…-prerequisites` and re-target it to the new PIC-N anchors.
- The two re-validation sentences on `peerDependencies` widening become PIC-N rules in their own right; they no longer live in `spec.md`.

## Related Findings

- "SDK capability list duplicates `pi-integration-contract.md`" — co-resolve (Option A here is the same edit that resolves the duplication; both findings collapse to one PR).
- "\"Re-validating\" obligation undefined; no enforcement gate named" — same-cluster (touches the same two re-validation sentences; resolves independently — that finding is about *what* re-validating means, this one is about *anchoring* the rule).
- "`peerDependencies` over-prescribed as the enforcement mechanism" — same-cluster (sits in the same paragraph; independent fix).
- "Introduction cross-references by section link, not REQ-ID anchor" — same-cluster (spec.md cross-link traceability; the sweep this recommends would also re-target the cross-references that finding flags).
- "Pi SDK symbols treated as verified facts without a verification mechanism" — decision-dependency (whichever location ends up owning the inventory is also where the verification record belongs).

---

# Bare "minor" used as a noun in the Prerequisites paragraph

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** "Minor" used as a noun without antecedent
**Kind:** clarity

## Finding

`spec.md` § Orientation → Prerequisites contains the sentence: "The matching `pi-agent-core` / `pi-ai` / `pi-tui` minor is also required; `package.json` `peerDependencies` is the enforcement point." The word *minor* is used as a bare noun with no nearby `minor-version line` antecedent. Worse, *matching* is anchored only by adjacency to the previous sentence ("the version pinned by [Pi Integration Contract]"), and that pin is a caret range (`^0.72.1`), not a single minor — so the reader cannot tell whether *matching* means "same minor as the resolved pi-coding-agent install" or "same minor as `0.72`" or "any minor inside the pinned caret range".

The same elliptical construction recurs in `spec_topics/pi-integration-contract.md` line 3 ("the matching `pi-agent-core`/`pi-ai`/`pi-tui` minor") and line 7 ("the matching `pi-agent-core` / `pi-ai` / `pi-tui` minor"), so a wording fix in `spec.md` alone leaves the contract page still ambiguous.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Pi SDK and capabilities (edited)
- `spec_topics/pi-integration-contract.md` — opening paragraph and Host prerequisites item 1 (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The fix is pure prose disambiguation; it does not alter any acceptance test, any pinned version literal, or any seam contract. The H1 `engines.node` literal-read test (`plan_topics/h1-scaffold.md`) reads the version field, not this prose, and is unaffected.

## Consequence

**Severity:** cosmetic

A careful reader can recover the intended meaning from the surrounding paragraph and from `pi-integration-contract.md`, so no observable behaviour or implementation choice changes. The cost is reader-time: future spec readers will pause to disambiguate and may import the same elliptical construction into derived prose.

## Solution Space

**Shape:** single

### Recommendation

Replace the bare-noun usage in both files with an explicit phrase that names *what* must match and *what dimension* of "match" is meant. Suggested wording:

- In `spec.md` § Orientation → Prerequisites, replace "The matching `pi-agent-core` / `pi-ai` / `pi-tui` minor is also required" with: "The `pi-agent-core`, `pi-ai`, and `pi-tui` packages MUST be present at the same minor-version line as the resolved `@mariozechner/pi-coding-agent` install."
- In `spec_topics/pi-integration-contract.md` line 3, replace "(and the matching `pi-agent-core`/`pi-ai`/`pi-tui` minor)" with: "(with `pi-agent-core`, `pi-ai`, and `pi-tui` resolved to the same minor-version line as the installed `@mariozechner/pi-coding-agent`)".
- In `spec_topics/pi-integration-contract.md` line 7, apply the same expansion.

Edge cases the implementer must watch:

- The fix anchors *matching* to the **resolved install**, not to the pinned caret range. If the project later decides *matching* should mean "same minor as the lower bound of the caret" (i.e. `0.72` regardless of which `0.72.x` actually resolved), the wording above is wrong and should be revised in the same edit.
- The companion finding "`pi-agent-core` / `pi-ai` / `pi-tui` lock-step version assumption" asks whether a skew window is permitted at all; if that finding lands first and admits a skew, this clarification's "same minor-version line" phrasing must be revisited to allow the skew window it defines.

## Related Findings

- "`pi-agent-core` / `pi-ai` / `pi-tui` lock-step version assumption" — decision-dependency (touches the exact same clause; the lock-step decision dictates whether "same minor-version line" is the correct expansion or whether a skew window must be encoded)
- "SDK capability list duplicates `pi-integration-contract.md`" — same-cluster (same Prerequisites paragraph, independent resolution)
- "SDK capability bullets carry no traceable identifiers" — same-cluster (same paragraph, independent resolution)
- "`peerDependencies` over-prescribed as the enforcement mechanism" — same-cluster (same sentence's second clause, independent resolution)
- "\"Re-validating\" obligation undefined; no enforcement gate named" — same-cluster (adjacent normative sentences in the same paragraph)
- "Pi SDK symbols treated as verified facts without a verification mechanism" — same-cluster (same Prerequisites block, independent resolution)

---

# "Re-validating" obligation has no defined output and no enforcement gate

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** "Re-validating" obligation undefined; no enforcement gate named
**Kind:** clarity, assumptions, prescription

## Finding

Three normative sentences in the spec impose a "re-validate before bumping" obligation on future maintainers without defining what re-validation produces or which gate enforces it:

- `spec.md` — Pi SDK and capabilities: *"Widening `peerDependencies` requires re-validating the surface inventory above against the new Pi minor before the range moves."*
- `spec.md` — Host runtime: *"A Pi minor bump that widens or narrows that range requires re-validating the loom range in the same edit."*
- `spec_topics/pi-integration-contract.md` opening: *"a Pi minor bump requires re-validating this contract before the loom `peerDependencies` range is widened."*
- `spec_topics/binder.md` (strict-capability paragraph): *"A pi-coding-agent minor bump that adds the indicator must be re-validated against this contract before the loom `peerDependencies` range is widened."*

None of these specify the artefact re-validation produces (a regenerated symbol-inventory file? a passing test? an updated checklist entry?) or the gate that enforces it (CI job, PR template, codeowner rule). The plan provides exactly one mechanical anchor — H1's `package.json` `engines.node` literal-read test — and that test only catches silent edits to one field; it does not force the SDK surface inventory or the `pi-coding-agent` peer range itself to be re-checked. An implementer reading the obligation prose has nothing observable to point at, so the sentences read as informational rather than load-bearing and the work they require can quietly skip.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Pi SDK and capabilities (edited)
- `spec.md` — Orientation → Prerequisites → Host runtime (edited)
- `spec_topics/pi-integration-contract.md` — opening paragraph (edited)
- `spec_topics/binder.md` — strict-capability paragraph (option-dependent)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

## Consequence

**Severity:** advisory

A Pi minor bump can land that widens `peerDependencies` and updates `engines.node` (forced by the existing literal-read test) without anyone re-confirming that the seven SDK capabilities in the surface inventory still exist with the assumed shapes. The first observable failure is then a runtime crash from a missing or renamed symbol on user machines rather than a CI red light at the bump commit.

## Solution Space

**Shape:** single

### Recommendation

Adopt a combined fix: extend H1 with literal-read assertions that pin the SDK surface, and add a "Pi version bump procedure" subsection to `pi-integration-contract.md` that the four "requires re-validating" sentences cite. This commit also resolves the sibling finding "Pi SDK surface inventory has no named verification gate" — the H1 literal-read assertions ARE the named verification gate that finding asks for, and the "Pi version bump procedure" subsection IS the documented enforcement contract.

**Spec edits.**

- Replace each "requires re-validating" sentence in `spec.md` (Prerequisites and Host runtime paragraphs) and in `pi-integration-contract.md` with a sentence that names both the test file and the procedure anchor: "…requires updating the H1 literal-read assertions in `test/extension/pinned-surface.test.ts` and following the procedure in [Pi version bump procedure](#pi-version-bump-procedure)."
- Add a new `## Pi version bump procedure` subsection to `pi-integration-contract.md` enumerating the contributor checklist (re-typecheck against the new package, re-run the SDK surface inventory test, re-confirm the `engines.node` floor, update the version pin in `peerDependencies` and the equivalent literal in this contract, update the capability-probe pinned constants).

**Plan edits.**

- Extend H1 with two `package.json`-literal-read tests:
  1. `peerDependencies["@mariozechner/pi-coding-agent"] === "<pinned-range>"` (and analogous assertions for `pi-agent-core`, `pi-ai`, `pi-tui` once those names/versions are pinned).
  2. A static `SDK_SURFACE_INVENTORY` constant in `src/extension/` enumerating the seven capability symbols plus their PIC-N IDs, asserted by a test that imports `@mariozechner/pi-coding-agent` and confirms each name is present on the imported namespace at the pinned version.

Edge cases for the implementer:

- The literal-read assertion should pin all four package names (`pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`) jointly so a single drift fails one test, not four.
- The pinned range, the H1 literal-read constant, and the capability-probe's pinned constants (introduced by the Runtime version/capability mismatch commit that precedes this one in bottom-up order) MUST be derived from one source of truth — a single literal constant or a build-time codegen step.
- The SDK surface-inventory test must import the runtime package (not a fake) so it observes the real shape; this is one of the few production-package imports H1 should permit.

## Related Findings

- "`peerDependencies` over-prescribed as the enforcement mechanism" — same-cluster (touches the same prose; the contract-vs-mechanism rephrase and the gate-naming fix can land in the same edit but resolve independently)
- "Pi SDK symbols treated as verified facts without a verification mechanism" — co-resolve (the SDK surface-inventory test from Option A is exactly the verification mechanism that finding asks for)
- "SDK capability list duplicates `pi-integration-contract.md`" — decision-dependency (if that finding's fix collapses the seven-bullet list into a single cross-reference, the surface-inventory test should anchor against the contract page only, not against `spec.md`)
- "SDK capability bullets carry no traceable identifiers" — decision-dependency (Option A's surface-inventory constant should key on the GOV-N anchors that finding adds)
- "Peer-dep mismatch failure mode unspecified" — same-cluster (both sit on the `peerDependencies` enforcement story; one covers the contributor-side gate, the other the runtime-side failure surface)
- "`pi-agent-core` / `pi-ai` / `pi-tui` lock-step version assumption" — co-resolve (the literal-read assertion in Option A pins all four version literals together)

---

# Lock-step minor invariant for `pi-agent-core` / `pi-ai` / `pi-tui` is asserted without provenance

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `pi-agent-core` / `pi-ai` / `pi-tui` lock-step version assumption
**Kind:** assumptions

## Finding

The orientation block in `spec.md` and the opening paragraph of `pi-integration-contract.md` both treat the proposition "the matching `pi-agent-core` / `pi-ai` / `pi-tui` minor is also required" as a stand-alone fact. Neither page cites the upstream artefact that makes the proposition true, names the release-coordination boundary that keeps it true, or states what loom does if a future Pi minor breaks the invariant (e.g. a patch ships against a stale sub-package version).

The invariant is in fact load-bearing for loom semantics — `pi-ai`'s named-tool `toolChoice` mapping (cited later in the same contract page under *Provider compatibility for typed queries*), `pi-ai`'s provider error mapping (under *Provider error mapping*), and `pi-ai`'s seed-field table (under *Provider seed-field mapping*) are all version-coupled to a specific `pi-ai` minor, not just to `pi-coding-agent`'s minor. The orientation paragraph therefore makes a claim the rest of the spec depends on but does not anchor.

The provenance the spec is missing already exists in the upstream package graph: `@mariozechner/pi-coding-agent`'s own `dependencies` block pins `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, and `@mariozechner/pi-tui` at the same `^X.Y.Z` minor, and all four packages live in the `pi-mono` monorepo and are released together. That is the source of truth the spec should cite, rather than asserting the lock-step as if loom itself enforces it.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Pi SDK and capabilities (edited)
- `spec_topics/pi-integration-contract.md` — preamble and *Host prerequisites — Pi SDK pin* (edited)
- `package.json` (loom-side) — `peerDependencies` block (edited; not a spec page but co-changed under the recommendation)
- `C:/Users/thomasa/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent/package.json` — upstream `dependencies` block (read-only; cited as provenance)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

H1 already carries a literal-read test for `package.json`'s `engines.node` field anchored to two spec sites (`pi-integration-contract.md` *Host prerequisites* and `spec.md` *Host runtime*). The fix here adds a sibling literal-read assertion over `peerDependencies` against the same two sites, so a future minor bump cannot drift one site without updating the others. No vertical-slice leaf currently exercises peer-dependency content, so the impact is confined to H1.

## Consequence

**Severity:** advisory

A reader who tries to verify the lock-step claim has nowhere to look — the spec presents it as ambient fact rather than as an inherited consequence of `pi-coding-agent`'s own `dependencies`. Two implementers can therefore draw different conclusions about whether loom must independently re-validate the sub-package versions on every Pi bump (the spec implies yes via the *re-validate before widening* clause) versus inheriting the guarantee transitively (which is what actually happens). The empirical lock-step holds at the pinned `^0.72.1` snapshot, so nothing breaks today; the gap is in maintainer guidance, not runtime behaviour.

## Solution Space

**Shape:** single

### Recommendation

In `spec_topics/pi-integration-contract.md`, replace the bare "matching `pi-agent-core` / `pi-ai` / `pi-tui` minor" clause with an explicit provenance sentence:

> The lock-step minor is inherited from `@mariozechner/pi-coding-agent`'s own `dependencies` block, which pins `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, and `@mariozechner/pi-tui` at the same `^X.Y.Z` minor. All four packages are released together from the `pi-mono` monorepo; no skew across the four is supported, and loom does not attempt to detect or accommodate skew. A Pi minor bump moves all four together and requires re-validating this contract before the loom `peerDependencies` range is widened.

In `spec.md`'s orientation paragraph, shorten the corresponding sentence to a single back-reference: "the matching `pi-agent-core` / `pi-ai` / `pi-tui` minor is required (see *Host prerequisites — Pi SDK pin* for provenance)" so the literal version policy lives in exactly one place.

Keep the three sub-package entries in loom's `peerDependencies` as belt-and-braces — the redundancy is harmless and surfaces a clear install-time error under pnpm/yarn resolution algorithms that do not auto-deduplicate transitive peer-dep ranges. Add a one-sentence note in the contract page stating that the redundancy is intentional.

Edge cases the implementer must watch:

- The H1 literal-read test must assert all four `peerDependencies` entries share the same minor (`^X.Y.Z` shape) and that the major/minor matches the value cited in `pi-integration-contract.md`'s preamble. Asserting the literal `^0.72.1` is sufficient for V1; the test fails loudly on bump and forces the maintainer to update both spec sites.
- The provenance sentence must NOT introduce a runtime probe — loom does not at runtime read `pi-coding-agent`'s `package.json` to verify the upstream pin, because that would re-introduce the very skew-tolerance the spec disclaims.
- The `re-validating ... before the range moves` obligation already exists in the contract page; the new sentence should reuse it verbatim rather than restate it, so the *Re-validating obligation undefined* finding (related, below) can address the gate question once for all three obligations.

## Related Findings

- "Minor" used as a noun without antecedent" — co-resolve (same sentence in `spec.md`; the rewrite above subsumes the antecedent fix)
- "`peerDependencies` over-prescribed as the enforcement mechanism" — co-resolve (same paragraph; the rewrite naturally demotes `peerDependencies` to a cited mechanism rather than the prescribed one)
- "\"Re-validating\" obligation undefined; no enforcement gate named" — same-cluster (same paragraph, separate gap; the new provenance sentence reuses the re-validate clause but does not define the gate)
- "Pi SDK symbols treated as verified facts without a verification mechanism" — same-cluster (adjacent paragraph; same flavour of unanchored-fact gap, resolved separately)
- "Peer-dep mismatch failure mode unspecified" — decision-dependency (the failure-mode finding's answer depends on whether the three sub-package peerDeps are kept; the recommendation above commits to keeping them)

---

# `waitForIdle` resolution, error, and hang semantics not contracted

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `waitForIdle` semantics not contracted
**Kind:** assumptions, codebase-grounding-broad

## Finding

`spec.md` lists `pi.sendUserMessage` + `ExtensionCommandContext.waitForIdle` as the prompt-mode drive primitive, and `pi-integration-contract.md` calls `waitForIdle` "the prompt-mode driver's authoritative completion signal." Neither page states when `waitForIdle` resolves, what it resolves with, whether it can reject, or what loom does if it never resolves. The Pi implementation is precise about each — `waitForIdle()` returns `Promise<void>`, resolves after `agent_end` is emitted *and* every awaited `agent_end` listener has settled, and never rejects (the underlying `activeRun.promise` is constructed with a single `resolve`; provider/transport errors land on session state, not on the promise). The spec leaves implementers to discover this.

The downstream consequences are concrete. (1) The runtime cannot detect a transport- or provider-level failure of the user turn from `waitForIdle()` alone; it must inspect post-resolution state on the user `AgentSession` (e.g. `errorMessage`, an `agent_error` event captured during the run, or the absence of accumulated assistant text). The spec mandates `Err({kind:"transport"})` on transport failure (`v5-untyped-queries.md` Tests), but never names the surface from which the runtime reads that failure. (2) `waitForIdle()` has no internal deadline; a hung user turn keeps loom blocked indefinitely unless `loomAbort` propagates into the user session. The spec wires `loomAbort.signal` into `createAgentSession({ signal })` for subagent mode but is silent on the prompt-mode path — there is no statement that `loomAbort.abort()` invokes `ctx.abort()` (or otherwise drives the user agent's `AbortController`) to unblock `waitForIdle()`.

A secondary point: `waitForIdle` is a member of `ExtensionCommandContext`, not the base `ExtensionContext`. The synthesised `ExtensionContext` the runtime hands to tool `execute(...)` callsites (per `pi-integration-contract.md`'s **Tool execution from loom code** block) intentionally lacks it. This is currently safe — every `ctx.waitForIdle()` reference in the spec corpus is on the slash-command handler context the runtime captured for the loom's lifetime, not on the synthesised tool-execution context — but the surface is never named explicitly, so a future spec edit or implementer confusion could route a `waitForIdle` call through the wrong ctx and silently fail.

## Spec Documents

- `spec.md` — "Pi SDK capabilities" capability bullet for prompt-mode drive (edited)
- `spec_topics/pi-integration-contract.md` — "Conversation drive — prompt mode" and the synthesised-`ExtensionContext` member list under "Tool execution from loom code" (edited)
- `spec_topics/cancellation.md` — "Forwarding into loomAbort" (edited; new sub-rule for the prompt-mode user-session abort path)
- `spec_topics/slash-invocation.md` — "User-visible streaming" paragraph that already references `ctx.waitForIdle()` (read-only)

## Plan Impact

**Phases:** MVP, Vertical V5

**Leaves (implementation order):**

- Mb — Minimal runtime + slash registration + two-root discovery + no-params overflow note — (modified)
- V5e — Prompt-mode conversation driver — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on how the prompt-mode driver detects a turn that errored: one wraps `await ctx.waitForIdle()` in a `try/catch` expecting rejection (and silently classes every turn `Ok` because the promise never rejects), the other inspects post-resolution session state but picks a different signal (`errorMessage` vs. an `agent_error` event vs. empty assistant text). The hang case is worse — without a stated bridge from `loomAbort` to the user-session abort, `Ctrl-C` during a stalled prompt-mode turn will not unblock loom.

## Solution Space

**Shape:** single

### Recommendation

In `pi-integration-contract.md` **Conversation drive — prompt mode**, append three sentences to the `waitForIdle` clause:

1. *Resolution.* "`waitForIdle()` returns `Promise<void>` and resolves once Pi emits `agent_end` for the user session and every awaited `agent_end` listener settles; it never rejects."
2. *Error detection.* State the post-resolution probe the runtime uses to classify the turn: read the user `AgentSession`'s error state (`session.errorMessage`, or the equivalent named field per the pinned Pi version) immediately after `waitForIdle()` resolves; a non-empty value maps to `Err(QueryError { kind: "transport", message, retryable: false, http_status: null, provider })` per `query.md`'s error union. The runtime MUST NOT install a global `pi.on("agent_error", …)` listener for this purpose (same per-session-cross-fire reasoning as the existing `agent_end` ban).
3. *Hang handling.* State that `loomAbort.abort()` propagates into the user session via `ctx.abort()` (the `ExtensionCommandContext.abort` member already in the forwarded set), which cancels the active user run and lets `waitForIdle()` resolve. Update `cancellation.md` **Forwarding into loomAbort** with the symmetric statement: aborting `loomAbort` calls `ctx.abort()` on the captured slash-command handler context in prompt mode, and `createAgentSession({ signal: loomAbort.signal })` already covers subagent mode.

In the same page's **Tool execution from loom code** block, append one sentence to the synthesised-`ExtensionContext` paragraph: "`waitForIdle` is intentionally absent from the synthesised context (it is a member of `ExtensionCommandContext`, not `ExtensionContext`); the runtime continues to drive prompt-mode completion through the captured slash-command handler context, not through the synthesised one."

In `spec.md`'s capability bullet, no edit is required — the bullet already names `ExtensionCommandContext.waitForIdle` explicitly, and the surface disambiguation lives correctly in the contract page.

Edge cases the implementer must watch:

- `ctx.abort()` is idempotent in Pi but the runtime should still wrap it in a one-shot guard so a re-entrant `loomAbort.abort()` (e.g. from an `agent_end` listener that itself observes the abort) does not double-cancel.
- After `loomAbort` fires, `waitForIdle()` may still resolve normally (Pi observed the abort and tore down cleanly) — the post-resolution error-state probe must run regardless, and if `loomAbort.signal.aborted` is true the runtime synthesises `Err({kind:"cancelled"})` per `cancellation.md` rather than reading session error state.
- The "listeners settle" clause means a slow `agent_end` listener attached by an unrelated extension can delay loom resumption. This is Pi-side behaviour the spec only needs to acknowledge, not bound.

## Related Findings

- "SDK capability call failure modes not specified" — co-resolve (the per-capability "Failure" sub-bullet that finding mandates is exactly the surface the recommendation populates for `waitForIdle`)
- "`ExtensionContext` forwarded member list: no signatures or behavioural contracts" — same-cluster (both want behavioural contracts on Pi-borrowed members; `waitForIdle` belongs in the same forthcoming behavioural-contract pass)
- "`session.sendUserMessage(text)` does not exist on `AgentSession`" — same-cluster (parallel SDK-surface accuracy concern on the subagent-mode side; resolves independently)
- "Pi SDK symbols treated as verified facts without a verification mechanism" — decision-dependency (the pinned Pi version named there is what fixes the field name `session.errorMessage` vs. any future rename in this finding's recommendation)

---

# Pi SDK capability calls have no failure contract

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** SDK capability call failure modes not specified
**Kind:** error-model

## Finding

`pi-integration-contract.md` enumerates the seven Pi SDK capabilities loom consumes (`pi.registerCommand`, `pi.registerMessageRenderer`, `pi.registerTool`, `pi.setActiveTools`, `pi.sendUserMessage`, `pi.sendMessage`, `createAgentSession`), but only three of them have a documented failure protocol: `pi.sendMessage` (best-effort fallback chain → `loom/runtime/system-note-delivery-failed`), `pi.registerTool` (collision → `loom/runtime/registration-cache-collision`), and `AgentSession.dispose()` (→ `loom/runtime/subagent-dispose-failure`). The remaining four are described entirely on the happy path. `loom/runtime/internal-error` is registered as a catch-all for "an unanticipated SDK reject", but its routing channels (slash-command system note, `Err(InvokeInfraError)` to an `invoke` parent) only make sense inside a loom invocation; it is silent on extension-load-time failures, and it does not address the security-adjacent restore case below.

The four uncovered capabilities split cleanly by surface:

1. **Extension-load-time SDK throws** — `pi.registerCommand` (called from the `session_start` handler per the **Extension entry point** rule), `pi.registerMessageRenderer` (called synchronously inside the factory, *before* any discovery side effect, per H4's ordering probe), and the factory-time / handler-registration calls themselves. There is no loom invocation in scope, so the runtime-event channel does not apply; the spec does not say whether a throw at these sites disables the affected loom, disables the whole extension, or escapes uncaught into Pi.
2. **Runtime SDK throws / rejections** — `pi.sendUserMessage` rejecting in the prompt-mode driver, `createAgentSession` throwing or returning a handle that is not disposable, the `tool.execute` / model-driven query path raising outside the documented `QueryError` table. The contract does not say whether these route through `loom/runtime/internal-error`, through `kind: "transport"` (which is the natural shape for `sendUserMessage` since it is a transport call), or through some new code.
3. **`pi.setActiveTools` restore failure inside the prompt-mode `finally`** — the highest-risk case. The spec asserts that the snapshot/restore "preserve[s] the invariant" through cancellation, panic, and provider exceptions, but says nothing about the restore call itself rejecting. Tool gating is a security-adjacent invariant: if `pi.setActiveTools(snapshot)` throws inside the `finally` block, the user's bare Pi session is left with the loom's callable set live for the remainder of the session, including any synthesised respond tool. Silent leak is unacceptable; `loom/runtime/internal-error` does not name a remediation.

The gap is concentrated in `pi-integration-contract.md`'s **Extension entry point**, **Tool-registration lifetime and visibility** (active-set restore), **Conversation drive — prompt mode** (`sendUserMessage`), and **Conversation drive — subagent mode** (`createAgentSession`); the diagnostic-code consequences land in `diagnostics.md`.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — Extension entry point (edited)
- `spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility (edited)
- `spec_topics/pi-integration-contract.md` — Conversation drive — prompt mode (edited)
- `spec_topics/pi-integration-contract.md` — Conversation drive — subagent mode (edited)
- `spec_topics/pi-integration-contract.md` — System notes (read-only — sets the existing fallback-chain template the new rules mirror)
- `spec_topics/diagnostics.md` — `loom/load/*` table (edited — adds extension-load-time SDK-failure code)
- `spec_topics/diagnostics.md` — `loom/runtime/*` table (edited — adds active-set restore-failure code; clarifies `internal-error` coverage of runtime SDK rejects)
- `spec_topics/errors-and-results.md` — Runtime panics (read-only — `internal-error` routing already lives here)

## Plan Impact

**Phases:** Horizontal, Vertical V5, Vertical V6, Vertical V12, Vertical V14, Vertical V15, Vertical V18

**Leaves (implementation order):**

- H4 — Pi extension shell — both (the factory-time `pi.registerMessageRenderer` call, the `session_start`-time `pi.registerCommand` call, and the `withActiveTools` helper all live here; restore-failure handling is added to `withActiveTools`)
- V5e — Prompt-mode driver `pi.sendUserMessage` — modified (adds rejection-routing rule)
- V6l — Two-phase typed-query driver — modified (uses `withActiveTools` around the typed-query exchange; inherits restore-failure handling from H4)
- V12a — `mode: subagent` accepted; `AgentSession` spawn — modified (`createAgentSession` throw / non-disposable-handle routing)
- V14e — Pi tool wired into `@` queries as model-callable — modified (uses `withActiveTools` snapshot/restore; inherits restore-failure handling from H4)
- V15j — Prompt → prompt cross-mode invoke — modified (the cross-mode `setActiveTools` snapshot/restore pattern in `v15-invoke.md` consumes the same restore-failure rule)
- V18m — Panic routing: slash-command surface — modified (the new `loom/runtime/active-set-restore-failed` and `loom/load/extension-bootstrap-failed` codes need their own routing assertions parallel to the existing `internal-error` and `system-note-delivery-failed` cases)

## Consequence

**Severity:** correctness

Implementers without an explicit contract will pick different defaults: one will let `pi.registerCommand` throw out of `session_start` (crashing every other extension's command registration), another will swallow it. Most damaging, the unspecified `pi.setActiveTools` restore-failure path is a silent privilege leak — a loom that exposes `bash` or `edit` to its model leaves those tools live in the user's bare session if restore rejects. The leak is invisible to the user and to the runtime's diagnostic channel.

## Solution Space

**Shape:** single

### Recommendation

Add three rules to `pi-integration-contract.md` and two diagnostic codes to `diagnostics.md`:

1. **Extension-bootstrap SDK failures.** Add to **Extension entry point**: any throw or rejection from `pi.registerMessageRenderer`, `pi.registerCommand` (factory-time *or* `session_start`-time), or `pi.registerFlag` is fatal at the granularity of the failing surface. A `pi.registerMessageRenderer` failure disables the renderer registration but the extension factory still completes (system notes degrade to `ctx.ui.notify` permanently for that extension instance via the existing fallback chain — which is already specified). A `pi.registerCommand` failure for one loom drops only that loom and emits `loom/load/extension-bootstrap-failed` (E, load) naming the failing capability, the loom slash name (where applicable), and the underlying error message; surviving looms still register. A `pi.registerFlag` failure is fatal to the whole extension because subsequent discovery depends on `pi.getFlag`. The new code is registered in `diagnostics.md`'s `loom/load/*` table with cross-reference to **Extension entry point**.

2. **Runtime SDK call failures (non-restore).** Add to **Conversation drive — prompt mode**: a thrown or rejected `pi.sendUserMessage` is mapped to `Err(QueryError { kind: "transport", message: <error.message>, http_status: null, provider: <resolved-model-provider>, retryable: false })` — the `transport` kind is the natural shape because `sendUserMessage` *is* the transport call, and this routes through the existing always-log channel without inventing a new variant. Add to **Conversation drive — subagent mode**: a thrown or rejected `createAgentSession`, or a returned handle whose `dispose` member is not a function, is treated as an unanticipated SDK reject and routed through the existing `loom/runtime/internal-error` code with the trigger condition broadened from "an unanticipated SDK reject" to explicitly enumerate `createAgentSession`. The rule is "spec it twice rather than open-coding it later": the `internal-error` description in `diagnostics.md` gains an explicit example listing `createAgentSession`, and **Conversation drive — subagent mode** gains a one-line cross-reference.

3. **`pi.setActiveTools` restore failure.** Add a new normative paragraph to **Tool-registration lifetime and visibility** immediately after the four-step `try`/`finally` snapshot-restore protocol:

   > If the restoring `pi.setActiveTools(snapshot)` call inside the `finally` block throws or rejects, the runtime MUST (a) re-attempt the restore exactly once with the same snapshot (covering transient failures); (b) on a second failure, emit `loom/runtime/active-set-restore-failed` (E, runtime) with `message` carrying the underlying error and `hint` listing the snapshot tool names so an operator can manually restore via Pi's `/tools` interface; (c) emit a `display: true` `loom-system-note` with the verbatim template `loom: failed to restore tool active-set after /<name>; the user session may have unexpected tools active. Run /reload to reset.`; and (d) propagate the original exception (or terminal `Err`) that the `finally` was protecting — restore failure does not mask the inner error. The new code MUST NOT chain back into `pi.setActiveTools`. Subagent-mode invocations are unaffected (the subagent's tools are scoped to the spawned `AgentSession` and released by `dispose`); the rule applies only to the prompt-mode and cross-mode `invoke` snapshot/restore paths.

   The new code is registered in `diagnostics.md`'s `loom/runtime/*` table with cross-reference to **Tool-registration lifetime and visibility**.

Implementer edge cases:

- The `withActiveTools` helper in H4 is the one place restore-failure handling lives; V6l, V14e, and V15j all reach the rule by calling that helper. Do not duplicate the protocol per call site.
- For `pi.sendUserMessage`-as-transport mapping, ensure `provider` is populated from the loom's resolved `model:` rather than left `null`; the `RuntimeEvent` always-log emission depends on it.
- The `loom/load/extension-bootstrap-failed` code's severity is `E` and is NOT routed through `loom-system-note` (the renderer may itself have failed); it routes through the existing diagnostic channel that `loom/parse/*` and `loom/load/*` use, which falls back to `console.error` if the renderer is dead.
- `loom/runtime/active-set-restore-failed` MUST be added to the always-log set in **Runtime event channel** if and only if the spec wants operators paged on it — recommended, since it is security-adjacent. Add the row alongside `transport`, `model_tool`, etc.

## Related Findings

- "Peer-dep mismatch failure mode unspecified" — same-cluster (different lifecycle stage — install vs. SDK call — but both are SDK-boundary error-model gaps; resolve under the same authoring pass).
- "Runtime version / capability mismatch: no failure contract" — same-cluster (parallel gap for runtime/capability surfaces).
- "`pi.setActiveTools` single-threaded coordination assumption unverified" — co-resolve (touches the exact same snapshot/restore protocol; the restore-failure paragraph and the coordination-assumption clarification belong in one edit).
- "`pi.registerMessageRenderer` registration timing and race" — co-resolve (renderer-registration timing and renderer-registration failure are adjacent paragraphs in **Extension entry point**).
- "`pi.registerMessageRenderer` signature not given" — same-cluster (signature gap and failure-mode gap on the same capability).
- "`pi.sendMessage` returns `void`, not `Promise<void>`" — decision-dependency (if `pi.sendMessage` cannot reject — only throw — the **System notes** fallback chain wording must be reconciled before the `pi.sendUserMessage` rejection rule above is finalised, because `sendUserMessage` may have the same return-type nuance).
- "Hot-reload `ctx.reload()` pre-teardown contract missing" — same-cluster (another lifecycle SDK-boundary gap).
- "Observability contract for three terminal failure modes unstated" — same-cluster (the always-log-set membership for the new `active-set-restore-failed` code lives at the same surface).

---

# `.warp` slash-invocation prevention rests on an unverified negative claim about Pi

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** "Looms do not write files" — Pi discovery path assumption
**Kind:** assumptions

## Finding

`spec.md` Introduction asserts that "`.warp` files are never directly invoked: slash invocation is prevented by construction (discovery scans `*.loom` only — see [Discovery](./spec_topics/discovery.md))". This construction-based guarantee depends on a *negative* fact about Pi: that no Pi-owned subsystem has a parallel discovery path that would walk a directory for `*.warp` (or any non-`*.loom`) files and turn the result into a slash command behind the loom extension's back. That fact is true today — `resources_discover` carries only `skillPaths` / `promptPaths` / `themePaths` (per `discovery.md`'s framing paragraph), the `pi` package-manifest namespace recognises only `extensions` / `skills` / `prompts` / `themes` / `video` / `image`, and Pi has no central file-extension registry. But it is asserted only in passing inside `discovery.md`, scattered across two paragraphs whose primary subject is something else, and `pi-integration-contract.md` — the page where pinned, version-gated Pi facts live — never states the negative claim explicitly.

The omission matters because the claim is load-bearing for the `.loom` / `.warp` security-relevant separation (a `.warp` library can declare callables that the file's author intends to be reachable only from in-scope `import` sites, not from a slash-command surface). On a future Pi minor that introduces a generic resource-walker (or a sibling extension that also walks `*.warp`), the construction silently weakens, and there is no version-pinned assertion in `pi-integration-contract.md` that the H4 / V14 work can re-validate against.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — Discovery API (edited)
- `spec_topics/discovery.md` — framing paragraph and File-extension namespace (read-only; supports the assertion)
- `spec.md` — Introduction (read-only; cites the construction)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The fix is a purely additive spec assertion in `pi-integration-contract.md`. No leaf's `Adds.` / `Tests.` / `Ships when.` changes — the loom-side discovery walk already scans `*.loom` only (V14k tests `.warp` not registered as a command), and the negative Pi fact is not testable from inside the extension. Leaves whose `Spec.` field already cites `pi-integration-contract.md` (H4, Mb, V14k–V14t) pick up the new paragraph automatically.

## Consequence

**Severity:** advisory

The current spec is operationally correct against the pinned Pi version, but the negative fact is asserted by inference across two paragraphs in `discovery.md` rather than as a single version-pinned statement in `pi-integration-contract.md` (where every other "this is true under `^0.72.1`" fact lives). A future Pi-minor re-validation pass — the same pass the GOV-N rules and H6 REQ-IDs are built to support — has no single anchor to re-check against.

## Solution Space

**Shape:** single

### Recommendation

Add a new sub-paragraph to `pi-integration-contract.md`'s **Discovery API** section asserting the negative fact explicitly, gated on the pinned Pi version. Suggested text:

> **No Pi-owned discovery path enumerates `.loom` or `.warp`.** Under the pinned `^0.72.1` peer-dep range, Pi exposes exactly three slash-command sources (`source: "prompt" | "extension" | "skill"`, per `core/slash-commands.d.ts`); `prompt` and `skill` enumerate `*.md` files only, and `extension` requires programmatic `pi.registerCommand` calls. The `resources_discover` event carries `skillPaths` / `promptPaths` / `themePaths` only — there is no `loomPaths` slot — and the `pi` package-manifest namespace recognises only `extensions` / `skills` / `prompts` / `themes` / `video` / `image`. Therefore the only path by which a `.warp` file could become a slash command is through this extension's own discovery walk; that walk matches `*.loom` only (per [Directory Convention](./discovery.md)), so the `.warp`-cannot-be-slash-invoked guarantee in [`spec.md`](../spec.md) Introduction holds by construction. A Pi minor that adds a fourth `SlashCommandSource` arm, a `loomPaths` field on `ResourcesDiscoverResult`, or a generic file-extension registry MUST trigger a re-validation of this paragraph in the same edit that widens `peerDependencies`.

Implementer notes:

- Place this immediately after the existing **Discovery API** paragraph so the positive claim ("the extension owns enumeration") and the negative claim ("no other path enumerates `.warp`") sit together.
- The re-validation obligation in the last sentence is the same shape as the existing peer-dep widening obligation in **Host prerequisites**, and should be cited from H6's REQ-ID minting pass once that lands (no new REQ-ID is required for V1 — the assertion is a pinned-Pi-fact, not a loom-side rule).
- Do not duplicate this assertion into `spec.md` — the Introduction already cross-references `discovery.md`; cross-referencing `pi-integration-contract.md` from there is sufficient and avoids the cross-spec drift the SDK-capability-list finding flags.

## Related Findings

- "`.loom`/`.warp` namespace clearance treated as a given" — co-resolve (the broader sibling finding; its (b) sub-claim "Pi's only slash-discovery path is the one loom registers" is exactly what this finding's recommended paragraph asserts — a single edit to `pi-integration-contract.md` discharges both)
- "SDK capability list duplicates `pi-integration-contract.md`" — same-cluster (touches the same pinned-Pi-version-gated section but resolves independently)
- "Pi SDK symbols treated as verified facts without a verification mechanism" — same-cluster (both are about pinning negative or positive Pi facts to a verifiable version anchor)

---

## spec.md — Orientation → Prerequisites → Binder LLM model

---

# Binder LLM model orientation bullet: predicate, failure codes, and bypass-decision timing all hidden

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** "Structured-output-capable" predicate undefined
**Kind:** assumptions, prescription, completeness

## Finding

The Orientation → Prerequisites → **Binder LLM model** bullet in `spec.md` reads:

> A structured-output-capable model resolved via `ctx.modelRegistry`; non-bypass looms fail to load with `loom/load/binder-model-unresolved` if absent. Bypass cases (no-params, single-string with no default) skip the binder call.

Three load-time questions a reader gets to via this bullet are answered nowhere on the bullet itself, and the bullet provides no cross-links to the pages where they *are* answered:

1. **What "structured-output-capable" means as a runtime check.** `binder.md` states that the runtime calls `ctx.modelRegistry.find(provider, modelId)` and inspects the returned `Model<Api>` for a strict-capability indicator; `pi-coding-agent ^0.72.1`'s `Model<Api>` exposes no such field, so under the V1 anchor the check is universally degraded to best-effort and emits `loom/load/binder-model-strict-capability-unknown` (W). The orientation bullet leaves a reader to guess between capability flag, probe call, and static metadata.
2. **What fires when a model resolves but is incapable.** `diagnostics.md` reserves `loom/load/binder-model-not-strict-capable` (E) for exactly that case (it cannot fire under `^0.72.1`, but it is the contract for any future minor that exposes the indicator). The orientation bullet only names `loom/load/binder-model-unresolved` and so reads as if the resolved-but-incapable case shares that code.
3. **When bypass-eligibility is decided.** `binder.md` is explicit ("The bypass decision is made at loom-load time from the static schema"). The orientation bullet says nothing.

Every other prerequisite bullet in the same Orientation list uses an explicit `(per [<topic>](./spec_topics/...))` cross-link. This one does not, so a reader who restricts themselves to `spec.md` (which the spec permits for plan-leaf-scoped reading) ends up with a binder-loading mental model that is wrong on all three points despite the topic pages being correct.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Binder LLM model bullet (edited)
- `spec_topics/binder.md` — "Binder model" section (read-only)
- `spec_topics/pi-integration-contract.md` — Host prerequisites #2 (read-only)
- `spec_topics/diagnostics.md` — `loom/load/binder-model-*` rows (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The fix is editorial cross-linking in `spec.md` orientation; it changes no acceptance criteria. The leaves that *implement* the underlying contract (`V3c` for bypass detection, `V16e` for resolution + capability check, `V18p` for binder cancellation) already pin the predicate, the diagnostic codes, and the load-time decision point against `binder.md` and `diagnostics.md`, and remain unaffected.

## Consequence

**Severity:** advisory

A reader doing a `spec.md`-only pass forms a wrong model on three points (what the predicate checks, which code distinguishes resolved-but-incapable, when bypass is decided). The misreading would be caught the moment the reader opens `binder.md` or `diagnostics.md` — which V16e's plan leaf makes mandatory before implementation — so divergent implementations are unlikely. The cost is reader friction and a missed orientation cross-link convention, not a correctness gap in the normative pages.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the Binder LLM model orientation bullet in `spec.md` Orientation → Prerequisites to expose the three currently-hidden obligations: the bypass-decision predicate, the failure codes, and the strict-capability degradation behaviour. This commit also resolves the sibling findings "Bypass criterion ambiguous in `spec.md` orientation bullet" and "V1 strict-capability degradation warning omitted from `spec.md`".

**Spec edits.**

In `spec.md` Orientation → Prerequisites → "Binder LLM model" bullet, replace the existing single sentence with the following three-clause form:

> **Binder LLM model** — A structured-output-capable model resolved via `ctx.modelRegistry`. The runtime applies a **bypass criterion** at load time: a loom is *bypassable* iff (a) it declares no `params:` block, or (b) it declares a single string-typed parameter with no default value (per [Binder — Bypass cases](./spec_topics/binder.md#bypass-cases)). Bypassable looms skip the binder call entirely; non-bypass looms fail to load with `loom/load/binder-model-unresolved` if no structured-output-capable model is available. **V1 strict-capability degradation:** if a model resolves but lacks structured-output capability, the loom load also fails with the same `loom/load/binder-model-unresolved` code; V1 does not silently degrade to free-text output (per [Binder — Strict-capability requirement](./spec_topics/binder.md#strict-capability-requirement)).

**Cross-cutting edits.**

- `spec_topics/binder.md`: ensure two stable section anchors exist — `#bypass-cases` (covering both bypass conditions exhaustively) and `#strict-capability-requirement` (covering the V1-no-degradation rule). Both are already normative content on the page; this commit adds the anchors and ensures the wording matches the orientation bullet's claims.

Edge cases for the implementer:

- The bypass criterion is now stated by exhaustive enumeration ((a) and (b)) — no other condition counts as "bypass".
- Two distinct failure scenarios both emit the same `loom/load/binder-model-unresolved` code; the `details.kind` discriminator distinguishes "no model resolved" from "model resolved but lacks structured-output capability". This is consistent with the capability-probe commit's pattern of one diagnostic code per failure surface, multiple `details.kind` discriminators.
- The bullet is a forward-reference structure: the orientation bullet names what the rule does and where the canonical source is; the canonical source on `binder.md` carries the full predicate text and edge cases.

## Related Findings

- "V1 strict-capability degradation warning omitted from `spec.md`" — co-resolve (the recommended rewrite names `loom/load/binder-model-strict-capability-unknown` (W) inline, which is exactly what that finding asks for)
- "Binder model bullet: two independent obligations, no identifiers" — same-cluster (touches the same bullet but addresses REQ-ID anchoring, which is independent of cross-link discoverability)
- "Bypass criterion ambiguous" — same-cluster (touches the same bullet's bypass parenthetical; resolved by a separate clarification of the parenthetical, not by adding cross-links)

---

## spec.md — Orientation → Prerequisites → Host runtime

---

# Runtime version / capability mismatch: no failure contract

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Runtime version / capability mismatch: no failure contract
**Kind:** completeness, error-model

## Finding

`spec.md`'s **Host runtime** paragraph asserts three host preconditions — `>=20.6.0` Node, the WHATWG `AbortSignal`/`AbortController` shape, and a JS engine value model with IEEE-754 numbers / native `Map`/`Set` / `JSON.stringify` / `Object.is` semantics — and labels the SDK-shape one as "load-bearing." It then stops. Nothing in `spec.md`, `spec_topics/pi-integration-contract.md` (**Extension entry point**), or the `loom/load/*` registry in `spec_topics/diagnostics.md` defines what the runtime *does* when one of these preconditions is observably violated at extension load.

The gaps are concrete and independent: (1) Node version. `package.json#engines.node` is enforced only at install time, and `npm install --engine-strict` is opt-in; an end user can launch Pi under a Node binary below `20.6.0` and reach the loom factory. (2) Bundled WHATWG shape. Even on Node ≥ 20.6.0, individual `AbortSignal` members the runtime relies on (`AbortSignal.any`, `AbortSignal.timeout`, `signal.reason`, `throwIfAborted`) landed in different minors above the floor; a host that is in-range can still be missing them (this overlap with the AbortSignal-surface finding is intentional). (3) Value model. The IEEE-754 / `Map` / `Set` / `Object.is` clause is editorial; nothing checks or names a violation surface.

For each precondition the runtime currently has three implicit options — hard-fail load, refuse to register the slash command but emit a diagnostic, or proceed and crash later from a downstream `TypeError` — and the spec picks none. The H1 leaf already pins `engines.node === ">=20.6.0"` as a literal-read test, but that gate fires in CI, not on the user's host; it does not close the runtime contract.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Host runtime (edited)
- `spec_topics/pi-integration-contract.md` — Extension entry point; Pi-supplied `AbortSignal` (edited)
- `spec_topics/diagnostics.md` — `loom/load/*` registry table (option-dependent; edited only if a new code is added)
- `spec_topics/runtime-value-model.md` — referenced by Host runtime (read-only)
- `spec_topics/cancellation.md` — AbortSignal usage sites (read-only)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified; the existing `engines.node` literal-read test must be cross-referenced from the runtime probe and may need to assert that the in-process probe constant matches the manifest floor)
- H4 — Pi extension shell — (modified; the extension factory in `extensions/index.ts` is where the probe runs and where the `pi.registerCommand` decision is made)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one will add a defensive probe and refuse to register the slash command on a sub-floor Node, the other will assume Node's manifest-time check is sufficient and ship a runtime that throws `TypeError: AbortSignal.any is not a function` from inside an unrelated `coercion`-loop turn. Users on the wrong host see either a clean refusal-with-diagnostic or an uncorrelated mid-turn crash, depending on which implementer they got.

## Solution Space

**Shape:** single

### Recommendation

Add a synchronous capability probe as the first action of the extension factory, and emit a single tagged diagnostic on any failure. This single commit also resolves the sibling findings "`peerDependencies` named as enforcement, but enforces nothing" and "Peer-dep mismatch failure mode unspecified" — one probe, one diagnostic code, four discriminated causes.

**Probe behaviour.** Before any `pi.registerCommand`, `pi.registerTool`, `pi.registerMessageRenderer`, `pi.registerFlag`, or `pi.on` call, the factory:

1. Compares `process.versions.node` against the floor `>=20.6.0` (the same literal H1 asserts in `package.json`).
2. Probes `typeof AbortController === "function"`, `typeof AbortSignal === "function"`, and the specific `AbortSignal` static methods the runtime depends on (the union enumerated by the sibling AbortSignal-surface finding).
3. Probes each named SDK capability by `typeof <member> === "function"` (the seven capabilities: `pi.registerCommand`, `pi.sendUserMessage`, `createAgentSession`, `pi.registerTool`, `pi.setActiveTools` / `pi.getActiveTools`, `pi.registerMessageRenderer`, `pi.sendMessage`).
4. Reads the installed `@mariozechner/pi-coding-agent` version from its `package.json` via Node's package-resolution APIs and compares against the pinned range.

On any failure: skip every Pi mutator, emit `loom/load/host-incompatible` with `details: { kind, observed, required }` where `kind ∈ {"node-floor", "abortsignal-shape", "sdk-capability-missing", "peer-dep-out-of-range"}`, and route the message through `sendSystemNote` → `ctx.ui.notify` → `console.error` fallback chain (the renderer may itself be the missing capability). The factory MUST return normally (no throw).

**Spec edits.**

- `spec.md` Orientation → Prerequisites → "Pi SDK and capabilities": replace "`package.json` `peerDependencies` is the enforcement point" with: "The extension MUST verify the seven enumerated SDK capabilities, the Node version floor, the `AbortSignal`/`AbortController` shape, and the installed `@mariozechner/pi-coding-agent` version at extension-factory entry; on any mismatch it MUST refuse to register slash commands, tools, renderers, or flags, and MUST emit `loom/load/host-incompatible`. `peerDependencies` declares the supported range; install-time enforcement is package-manager-dependent and non-load-bearing."
- `spec.md` Orientation → Prerequisites → Host runtime: state explicitly that load fails with `loom/load/host-incompatible` on Node-floor or `AbortSignal`-shape violation; the value-model bullets remain non-checked invariants ("undefined behaviour on violation").
- `pi-integration-contract.md` Extension entry point: insert step 0 "Capability probe" before the existing step 1.
- `diagnostics.md` `loom/load/*` table: add `loom/load/host-incompatible` (severity `error`) with the message template and the four `details.kind` discriminators.

Edge cases for the implementer:

- Probe MUST be limited to `typeof <member> === "function"` checks — not arity, not return-shape sniffing — so it does not drift into a fragile shape contract.
- The probe MUST avoid using anything it is checking (e.g. cannot use `AbortSignal.any` to detect `AbortSignal.any`).
- The four pinned constants (Node floor, AbortSignal members, capability list, peer-dep range) MUST live in one source of truth that the H1 literal-read tests (introduced by the "Re-validating obligation" commit later in bottom-up order) also consume.
- Idempotency: a second invocation of the factory under `/reload` runs the probe again with no state.
- Subagent mode is not affected by this probe; it runs at extension load, before any session is created.

## Related Findings

- "`AbortSignal`/`AbortController` surface across Node versions" — co-resolve (supplies the member list the probe checks)
- "Peer-dep mismatch failure mode unspecified" — co-resolve (same `loom/load/host-incompatible` diagnostic shape; same refuse-vs-stub registration question)
- "\"Load-bearing SDK contract\" jargon undefined" — decision-dependency (Option A vs. B determines whether the phrase becomes "non-checked invariant" or "probed at factory entry")
- "Host runtime paragraph: four obligations fused, no identifiers" — same-cluster (the edits here will need GOV-N anchors when that finding is resolved)
- "\">=20.6.0\" described as a \"range\"; should be \"floor\"" — same-cluster (same paragraph; adjacent wording fix)
- "JS engine value-model assumptions: placement, prescription, and completeness" — same-cluster (the value-model bullets are explicitly carved out as non-checked invariants by either option)

---

# Host runtime paragraph: four obligations fused into one undivided block

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Host runtime paragraph: four obligations fused, no identifiers
**Kind:** traceability

## Finding

The single paragraph at `spec.md` Orientation → Prerequisites → **Host runtime** carries four independently verifiable obligations:

1. The Node.js version floor is `>=20.6.0`, matching `@mariozechner/pi-coding-agent`'s pinned `engines.node`.
2. A Pi minor bump that moves that floor requires re-validating the loom range in the same edit.
3. The host's `AbortSignal` / `AbortController` types are the Node-bundled WHATWG implementation, which the loom runtime treats as a contractually fixed shape.
4. The runtime value model assumes a JS engine providing IEEE-754 numbers, native `Map` / `Set`, native `JSON.stringify`, and `Object.is` primitive equality.

These are written as one continuous prose block with no per-obligation anchor. spec.md already uses `**GOV-N.**` markers in its appendix (currently GOV-1..GOV-8) and the appendix's prefix-table entry for `spec.md` reserves the `GOV` prefix exactly for citations of this kind. Because the four obligations are fused, no plan leaf, test, or future review can cite a single one of them: `H1` already cross-references this paragraph by section heading ("**Orientation — Prerequisites — Host runtime**") to anchor the `engines.node` literal-read test, and that citation cannot be tightened to "the floor obligation" vs. "the value-model obligation" without per-obligation anchors. Partial-pass reporting (e.g. "obligation #1 verified, #4 deferred") is not expressible.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Host runtime (edited)
- `spec.md` — Appendix → REQ-ID prefix table (read-only; confirms `GOV` prefix is the citation namespace for spec.md normative obligations and that GOV-9..GOV-N are the next available numbers per the per-page dense-numbering rule)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified) — the `engines.node` literal-read test cross-references "Orientation — Prerequisites — Host runtime" by section heading; once per-obligation GOV-N anchors exist, the citation should be tightened to the floor-obligation ID.
- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified) — H6 owns the canonical anchor pass over every page in the prefix table; spec.md is a row in that table (`GOV` prefix). The Host runtime paragraph is in scope for H6's pass and is the trigger for adding GOV-9..GOV-12 if those anchors have not landed beforehand.

## Consequence

**Severity:** advisory

Implementers can build a working system without per-obligation anchors, but the spec's own traceability discipline (GOV-1, GOV-2, the V18s coverage gate, the leaf-format convention "one bullet per REQ-ID") cannot be applied to these four normative claims. Cross-references from `H1` and from any future leaf must paraphrase by section heading, which is brittle under section renames and prevents partial-pass reporting in reviews.

## Solution Space

**Shape:** single

### Recommendation

Restructure the Host runtime paragraph in `spec.md` Orientation → Prerequisites into four addressable sub-bullets, one per obligation, with each obligation phrased to be testable and cite-able. This commit also resolves the sibling findings "`>=20.6.0` mis-labelled as a 'range'", "JS engine value-model assumptions: placement, prescription, and completeness", "`AbortSignal`/`AbortController` surface dependence is not enumerated", and "'Load-bearing SDK contract' is undefined spec vocabulary".

**Spec edits.**

In `spec.md` Orientation → Prerequisites, replace the existing Host runtime paragraph with:

> **Host runtime.** The loom runtime executes inside the Pi extension host process under four host preconditions:
>
> 1. **Node version floor.** Node `>=20.6.0` (matching `@mariozechner/pi-coding-agent`'s `engines.node` floor at the pinned peer-dep version). The literal `>=20.6.0` is a *floor*, not a range — there is no upper bound. A Pi minor bump that widens or narrows that floor requires re-validating the loom range in the same edit per the [Pi version bump procedure](./spec_topics/pi-integration-contract.md#pi-version-bump-procedure).
>
> 2. **Pi-supplied `AbortSignal` / `AbortController` shape.** The runtime requires the WHATWG `AbortSignal` and `AbortController` constructors plus the following named members: `signal.aborted`, `signal.reason`, `signal.throwIfAborted()`, `signal.addEventListener("abort", …)`, `AbortSignal.any([…])`, `AbortSignal.timeout(ms)`, `AbortController.prototype.abort(reason?)`. Each member is exercised by a runtime call site enumerated in [Pi Integration Contract — Cancellation source](./spec_topics/pi-integration-contract.md#cancellation-source) and [Cancellation](./spec_topics/cancellation.md).
>
> 3. **Pi SDK named-capability surface.** The seven SDK capabilities enumerated in [Pi Integration Contract — SDK capability inventory](./spec_topics/pi-integration-contract.md#sdk-capability-inventory) MUST be present at extension-factory entry. The capability probe, refusal protocol, and `loom/load/host-incompatible` diagnostic that enforce this precondition are specified in [Pi Integration Contract — Extension entry point](./spec_topics/pi-integration-contract.md#extension-entry-point).
>
> 4. **JavaScript engine value model.** The runtime value model assumes a JavaScript engine with IEEE-754 numbers, native `Map`/`Set`, native `JSON.stringify`, and `Object.is` semantics for primitive equality (see [Runtime Value Model](./spec_topics/runtime-value-model.md)). Behaviour is undefined if the host violates any of these assumptions; the runtime does not feature-detect, does not polyfill, and emits no diagnostic on violation. This is a non-checked invariant, in contrast to obligations 1–3 which the capability probe enforces.

Drop the "load-bearing SDK contract" wording entirely — replace each occurrence in `spec.md` and `spec_topics/pi-integration-contract.md` with either "non-checked invariant" (for the value-model bullets) or "probed at extension-factory entry per [PIC-N]" (for the SDK capability and AbortSignal members). The phrase has no defined meaning in the spec vocabulary and is not used elsewhere.

**Cross-cutting edits.**

- `spec_topics/pi-integration-contract.md`: the AbortSignal member list above appears verbatim in the Cancellation source section as the canonical enumeration the runtime depends on. Cross-link from `cancellation.md`.
- `spec_topics/runtime-value-model.md`: the IEEE-754 / `Map` / `Set` / `JSON.stringify` / `Object.is` assumptions are stated as the canonical source; the spec.md sub-bullet 4 cross-references it.
- `spec_topics/cancellation.md`: cross-reference the AbortSignal member list rather than restating it.

Edge cases for the implementer:

- Sub-bullet 1 names "floor" not "range" — the prior "supported version range is `>=20.6.0`" wording was a category error (`>=N` is a floor; a range has both bounds).
- Sub-bullet 2's AbortSignal member enumeration is the single source of truth that the capability probe (per the Runtime version / capability mismatch commit) consumes. The probe's pinned-constants file MUST derive its member list from this enumeration.
- Sub-bullet 3 forward-references the SDK capability inventory which the SDK-capability-bullets-relocation commit creates as PIC-N rules. By bottom-up processing order, that commit has already landed when this one runs.
- Sub-bullet 4 is the only obligation explicitly marked non-checked; the asymmetry with 1–3 is intentional and stated.
- The four sub-bullets are still inside `spec.md` Introduction (not REQ-ID anchored), but they are addressable by ordinal — plan leaves and review tooling can cite "Host runtime obligation 2" stably.

## Related Findings

- "SDK capability bullets carry no traceable identifiers" — same-cluster (identical traceability gap on a different paragraph in the same Prerequisites section; both should adopt GOV-N anchors in coordinated edits).
- "Binder model bullet: two independent obligations, no identifiers" — same-cluster (same pattern of fused obligations without identifiers, also under Prerequisites).
- "\">=20.6.0\" described as a \"range\"; should be \"floor\"" — co-resolve (rewords obligation #1; anchor and reword in one edit).
- "JS engine value-model assumptions: placement, prescription, and completeness" — decision-dependency (one option moves obligation #4 out of this paragraph entirely into `runtime-value-model.md`; if accepted, GOV-N for #4 is not allocated here).
- "`AbortSignal`/`AbortController` surface across Node versions" — co-resolve (rewords/expands obligation #3).
- "\"Load-bearing SDK contract\" jargon undefined" — co-resolve (rewords obligation #3).
- "Runtime version / capability mismatch: no failure contract" — decision-dependency (may add a fifth obligation about a load-time capability probe; if accepted, allocate one additional GOV-N here).
- "GOV-N governance rules: scope boundary in spec.md" — decision-dependency (proposes extracting GOV-N machinery into a separate governance page; if accepted, the prefix family used to anchor the Host runtime obligations changes accordingly).

---

## spec.md — Orientation → Prerequisites → Cancellation propagation

---

# Orientation conflates cancellation with a separate failure mode

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Cancellation not stated as a distinct outcome in orientation
**Kind:** error-model

## Finding

The orientation paragraph in `spec.md` reads: *"Evaluation either succeeds … or fails — by returning `Err`, by panicking, or by being cancelled."* This three-way framing is misleading and is not consistent with the surfacing rules pinned downstream.

The downstream pages establish the actual structure unambiguously:

- `errors-and-results.md` declares `CancelledError { kind: "cancelled", message }` as a member of the `QueryError` discriminated union — the same union as `TransportError`, `CodeToolError`, etc. A cancelled query, tool call, or invoke surfaces as `Err(CancelledError)`, not as a fourth thing.
- `cancellation.md` repeats this surfacing rule per call site (`Err(QueryError { kind: "cancelled" })` for queries; `Err(QueryError { kind: "code_tool", cause: "cancelled" })` for code tools; `Err(QueryError { kind: "invoke_callee_error", inner: { kind: "cancelled" } })` for invokes whose abort originated in the child).
- `slash-invocation.md` adds the top-level row `cancelled` → "loom `/<name>` cancelled" to the per-`kind` system-note table — the same table that handles every other `Err`-shaped top-level outcome. Top-level cancellation is just the propagation of an `Err(CancelledError)` to the slash boundary, with a per-`kind` formatter chosen for it.
- `cancellation.md` also states that the runtime performs no rollback of side effects already committed before the abort was observed, and `slash-invocation.md` confirms that partial assistant text already streamed remains visible. The "no implicit rollback" sentence already in the orientation paragraph therefore applies to cancellation just as it applies to `Err` and panic — but the current wording attaches it to "the failure" without confirming that "cancelled" counts.

The orientation paragraph thus presents `Err` and `cancelled` as siblings when the rest of the spec treats `cancelled` as one wire-`kind` value within the `Err` arm. Panic is the only outcome genuinely outside the `Result` channel. A reader who stops at the orientation may model cancellation as a fourth `Result` arm, a panic-shaped value, or an out-of-band exception, none of which match the implementation contract that downstream leaves are tested against.

## Spec Documents

- `spec.md` — Orientation paragraph (the second prose paragraph, beginning "Evaluation either succeeds…") (edited)
- `spec_topics/errors-and-results.md` — `QueryError` union and `CancelledError` schema (read-only)
- `spec_topics/cancellation.md` — Surfacing section (read-only)
- `spec_topics/slash-invocation.md` — Per-`kind` top-level note table (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the surfacing rules the corrected orientation will summarise are already owned by V5d (`CancelledError` variant), V14h (`code_tool` cause `cancelled`), V18a–V18e (cancellation propagation), V18i (per-`kind` top-level formatter including the `cancelled` row), and V18p (binder cancellation). None of those leaves' acceptance criteria change; the edit is a clarifying summary in narrative prose. No leaf is blocked or unblocked.

## Consequence

**Severity:** advisory

An implementer who only reads the orientation may build a mental model in which cancellation is a fourth `Result` arm or a thrown exception, then discover the actual `Err(CancelledError)` shape only when reading `errors-and-results.md` or a downstream V18 leaf. The downstream pages are correct and tested, so the runtime will not actually diverge; the cost is wasted reading and a higher chance that early scaffolding (e.g. tool-host glue, panic-vs-error routing) is built against the wrong shape and reworked.

## Solution Space

**Shape:** single

### Recommendation

Rewrite paragraph 3 of `spec.md` Introduction (the "Evaluation either succeeds or fails…" paragraph) to (a) treat cancellation as a distinct third terminal outcome alongside success and failure, (b) state the partial-append / no-rollback rule for both prompt and subagent modes, and (c) name the normative cancellation cross-link explicitly. This commit also resolves the sibling findings "Intro narrows the no-rollback rule to prompt mode" and "Orientation cancellation bullet does not say which cross-link is normative".

**Spec edits.**

In `spec.md` Introduction, replace paragraph 3 with:

> Loom evaluation produces one of three terminal outcomes: it succeeds (turns appended; final value available to programmatic callers), it fails (by returning `Err`, by panicking, or by exhausting a runtime limit), or it is cancelled (per the `AbortSignal` plumbed through `ctx.signal`). In every case turns appended *before* the terminal event remain in the conversation the loom was driving — the caller's conversation in `prompt` mode, or the disposable subagent conversation in `subagent` mode — and the runtime performs no implicit rollback. See [Errors and Results](./spec_topics/errors-and-results.md) and [Diagnostics](./spec_topics/diagnostics.md) for the per-stage error surfaces and the partial-append contract; [Cancellation](./spec_topics/cancellation.md) is the normative source for cancellation semantics, with [Invocation from Pi](./spec_topics/slash-invocation.md) and [Pi Integration Contract — Cancellation source](./spec_topics/pi-integration-contract.md) covering the prompt-mode delivery path.

Edge cases for the implementer:

- The "no implicit rollback" rule now applies uniformly to prompt and subagent modes — the prior wording's prompt-mode-only framing was the defect.
- Cancellation is named as a third outcome on equal footing with success and failure — agents enumerating the terminal-state space (`RuntimeEvent` consumers, the `loom-system-note` channel) MUST carry exactly three discriminators.
- The cancellation cross-link points at `[Cancellation](./spec_topics/cancellation.md)` as the single normative source. The other two cross-links are explicitly delivery-path elaborations; they do not create competing normative contracts.

## Related Findings

- "Pronoun antecedent ambiguous in cancellation bullet" — co-resolve (same orientation→prerequisites→cancellation passage; both edits land in the same paragraph cluster and should ship together so the prerequisites bullet's links and the orientation paragraph's framing are revised in one pass)

---

## spec.md — Orientation → Reading order

---

# `influences.md` listed alongside normative pages in the Reading order

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `influences.md` (pure-narrative) listed in required reading
**Kind:** cruft

## Finding

`spec.md` §"Reading order" (line 35) introduces three bullets with the directive *"Read these first to understand the design"* and lists `overview.md`, `influences.md`, and `comparison.md` as a single undifferentiated set. `influences.md` is, however, formally classified as pure-narrative by `spec.md` §GOV-3 (line 104) — it is excluded from REQ-ID extraction and carries no obligations — and the REQ-ID prefix table (line 136) records it as `(no IDs — narrative)`. `overview.md` and `comparison.md` are likewise pure-narrative under GOV-3, but they describe the conceptual model and the loom-vs.-Pi delta respectively; `influences.md` is a one-page rationale ("Loom borrows from Rust for semantics, TypeScript for surface…") that explains design *provenance*, not the design itself.

Co-listing the three under the same imperative blurs the difference between orientation an implementer needs to read in order to interpret normative pages downstream, and historical/justificatory commentary an implementer may safely skip. The Reading order section is the project's first signal about what is load-bearing and what is not; it should not undermine GOV-3's own narrative/normative split on its first appearance.

## Spec Documents

- `spec.md` — §"Reading order" (edited)
- `spec.md` — §"Appendix → GOV-3", §"REQ-ID prefix table" (read-only — establishes the narrative/normative split this finding leans on)
- `spec_topics/influences.md` — entire file (read-only — confirms content is pure rationale)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(The Reading order section is project-orientation prose. No plan leaf cites it as **Spec**, and no acceptance criterion changes under either fix.)

## Consequence

**Severity:** cosmetic

A first-time reader spends a few minutes on rationale they were told was prerequisite and may infer that influences carry interpretive weight. Nothing breaks at implementation time; the cost is wasted reader attention and a small credibility dent on the spec's own normative/narrative discipline.

## Solution Space

**Shape:** single

### Recommendation

Restructure the **Reading order** subsection into two sub-blocks: a normative prerequisites list and a non-normative background list. This commit also resolves the sibling finding "'Read these first' scope unclear relative to Spec-field permission" — the explicit non-normative label on the background block, combined with the prerequisites block standing alone, makes the relationship to the `**Spec**`-field permission self-evident without an additional disclaimer.

**Spec edits.**

In `spec.md` § Orientation, replace the current single "Reading order" list with:

> ### Reading order
>
> Read these two topics first to understand the design:
>
> - [Overview and Conceptual Model](./spec_topics/overview.md) — what a loom is, query-and-await, prompt vs. subagent mode.
> - [Comparison with Existing Pi Features](./spec_topics/comparison.md) — loom vs. Pi `prompt` / `subagent`.
>
> **Background (non-normative).** Skippable; explains design provenance, not requirements.
>
> - [Influences](./spec_topics/influences.md) — what loom borrows from Rust, TypeScript, and what it doesn't.

Edge cases for the implementer:

- The `**Background (non-normative).**` label uses the same vocabulary GOV-3 uses for "pure-narrative" pages, so a future reader linking the Reading order back to GOV-3 sees the same term on both ends.
- The prerequisites list does NOT override the `**Spec**`-field permission (per GOV-11): a leaf author whose `**Spec**` field does not list `overview.md` is not obliged to read it. The Reading order is orientation for first-time readers; per-leaf reading is governed by the `**Spec**` field.
- Future rationale pages (`related-work.md`, `future-considerations.md`) can be appended to the Background block without restructure.

## Related Findings

- "'Read these first' scope unclear relative to Spec-field permission" — co-resolve (same five-line block in `spec.md`; both fixes touch the Reading order section and should land in one edit)

---

## spec.md — Appendix → GOV-1

---

# GOV-1 leaves anchor placement ambiguous in two ways H6 cannot mechanically resolve

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** GOV-1 anchor form vague and over-prescribed
**Kind:** clarity, completeness, prescription

## Finding

GOV-1 (`spec.md` line 100) names two anchor forms — the canonical inline `**PREFIX-N.**` marker and the alternate `<a id="prefix-n"></a>` HTML form — and says the HTML form is permitted "only where rendering constraints make the inline marker impractical, in which case both forms appear together on the same line." Two governance gaps remain that H6's anchor-insertion pass cannot resolve mechanically:

1. **"Rendering constraints make the inline marker impractical" is undefined.** Bold-with-period inside a table cell, inside a fenced code block, inside an ATX heading, inside a list-item lead, inside a blockquote — each is a candidate context, and reasonable H6 implementers will disagree on which qualify. The decision cannot be deferred to H6 review because H6's acceptance criterion #9 (`plan_topics/h6-req-ids.md`) already hard-fails the gate when the HTML form appears without a co-located inline marker; an implementer who reads "table cell" as a rendering constraint and uses the HTML form alone will trip the V18s Reused-ID gate (`plan_topics/v18-cancellation.md` step 4), which keys off `**PREFIX-N.**` exclusively.

2. **"Both forms appear together on the same line" specifies co-location but not ordering or separator.** Inline-then-HTML, HTML-then-inline, space-separated, no-space, or with intervening punctuation are all consistent with the current text. This matters because future tooling (and the V18s grepers) will pattern-match against whatever H6 emits; an inconsistent emission shape forces every downstream regex to tolerate both orderings or risk silent skip.

The third sub-issue raised by the original reviewer — that bold/period is presentation masquerading as a normative anchor format — does not stand. The bold/period decoration is the only mechanism that distinguishes a *defining anchor* (`**BNDR-7.**`) from a *back-reference* (`per BNDR-7`); without it, H6's grep cannot tell anchor sites from citation sites and V18s's dense-numbering and reused-ID gates lose their witness. The decoration is doing parsing work, not styling work. The fix below leaves it intact.

## Spec Documents

- `spec.md` — Appendix → REQ-ID prefix table → GOV-1 (edited)
- `plan_topics/h6-req-ids.md` — Adds, acceptance criterion #9 (edited)
- `plan_topics/v18-cancellation.md` — V18s coverage-matrix closing CI gate, step 4 (read-only)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)
- V18s — coverage-matrix closing CI gate — (modified)

## Consequence

**Severity:** correctness

Two H6 implementers reading GOV-1 as written will produce divergent anchor placements: one will emit HTML-only anchors inside table cells (citing "rendering constraints"), the other will force the inline form everywhere. The first will fail H6's own acceptance gate; the second will produce un-renderable bold-period sequences inside code fences. Both will then disagree on the order and separator when the dual form is required. Downstream V18s gates that grep for the canonical inline form will silently miss the HTML-only anchors, defeating the closure check.

## Solution Space

**Shape:** single

### Recommendation

Replace GOV-1 with three precise clauses:

1. **Canonical anchor form.** Each REQ-ID's defining anchor is the inline `**PREFIX-N.**` marker. The bold-with-period decoration is normative: it distinguishes anchor sites from back-references and is the witness pattern for H6's gate, the V18s Reused-ID gate, and the V18s Dense-numbering gate.

2. **Permitted alternate contexts (closed list).** The `<a id="prefix-n"></a>` HTML form MAY accompany the inline marker only in these enumerated contexts, where Markdown bold-with-period either does not render or breaks the surrounding construct:
   - inside a Markdown table cell;
   - inside an ATX heading (`#` … `######`);
   - on the line immediately preceding a fenced code block whose content is the rule's normative example.

   No other context permits the HTML form. A REQ-ID inside a fenced code block, an inline code span, or an HTML comment is neither an anchor nor a back-reference and is invisible to GOV-3 extraction (cross-referenced from the "Extraction regex scope" finding).

3. **Dual-form layout.** When the HTML form is used, it MUST appear on the same source line as the inline marker, in the order `<a id="prefix-n"></a> **PREFIX-N.**` (HTML first, single ASCII space, inline marker second). This ordering keeps the inline marker adjacent to the rule text it introduces and gives V18s a single regex to anchor against (`<a id="prefix-n"></a>\s\*\*PREFIX-N\.\*\*`).

H6's acceptance criterion #9 must be tightened to assert the dual-form layout literally when the HTML form is present, and a new criterion must assert that no HTML-form anchor appears outside the three enumerated contexts (a cheap structural grep over the spec page is sufficient).

Edge cases the implementer must watch:

- Headings: inserting an anchor inside an ATX heading shifts the heading's auto-generated GitHub fragment ID. If any topic page already cross-links to such a heading by fragment, the cross-link will break unless the explicit `<a id="...">` is added at the same edit. H6 should enumerate affected headings and either repoint cross-links or place the anchor on the line preceding the heading instead.
- Tables: the inline marker inside a table cell still requires the cell to start with `**PREFIX-N.**`; long rule text following the marker will cause table column-width drift. Where this is intolerable, the rule belongs outside the table (the table cell carries only the anchor, the rule body carries the marker on its first line).
- Code-block adjacency: the "line immediately preceding a fenced code block" form is reserved for the case where the rule's normative content is the example itself. Decorative code blocks (illustrations, not normative content) do not earn an anchor.

## Related Findings

- "Extraction regex scope unclear" — co-resolve (the closed list of permitted contexts in clause 2 implicitly answers the code-block / inline-code-span / comment exclusion question; both findings should land in one edit to keep GOV-1 and GOV-3 consistent)
- "`FN` prefix (2 letters) contradicts `[A-Z]{3,4}` extraction regex" — same-cluster (touches the parsing contract for REQ-IDs but resolves independently — that finding is about prefix-table consistency, this one is about anchor placement)
- "Prefix uniqueness scope ambiguous (case-sensitivity; GOV prefix status)" — same-cluster (also a GOV-section governance gap; resolves independently)
- "GOV-7 atomicity: five independent procedures under one identifier" — same-cluster (structural critique of GOV-* organisation; the splitting recipe there does not affect GOV-1's content)

---

## spec.md — Appendix → GOV-2

---

# V18s CI gate failure surface unspecified

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** V18s CI gate failure surface unspecified
**Kind:** error-model, prescription

## Finding

`spec.md` GOV-2 says the V18s coverage-matrix closing gate "treats any unmapped REQ-ID as a CI failure," and GOV-6 says the same gate "enforces" the prefix-table-completeness invariant. Both rules link to `plan_topics/v18-cancellation.md` for the gate contract, so the spec defers the observable surface to the plan. The plan, however, does not pin that surface either: the V18s leaf describes each of its six checks as "fails the gate" or "flips the check to non-zero" and tags everything as "all observable in `npm run check:coverage` (or equivalent)" — with the explicit disclaimer that "the exact script form is non-normative; the property is."

That leaves four developer-visible behaviours unspecified across all six gates: (a) the process exit code on failure (only "non-zero" is implied — no value, no convention for distinguishing the six gate kinds); (b) the per-failure message format (no `<file>:<line>` location prescription, no template, no machine-parseable shape); (c) fast-fail vs. accumulate semantics within and across the six gates (a contributor with three bad anchors does not know whether they will see one error or three, nor whether gate (1) failing short-circuits gates (2)–(6)); (d) where the report is written (stdout, stderr, a file artifact, or a CI annotations format).

Two reasonable implementers will produce two different gate scripts and two different contributor experiences. Both will satisfy the literal "fails the gate" obligation; neither contract is testable beyond "exit code is non-zero." The "exact script form is non-normative; the property is" hedge papers over a genuine API surface — the property under-specifies what a contributor sees when the property is violated.

## Spec Documents

- `spec.md` — Appendix → GOV-2, GOV-6 (option-dependent; edited only under Option A)
- `plan_topics/v18-cancellation.md` — V18s — Coverage-matrix closing CI gate (edited)
- `plan_topics/coverage-matrix.md` — opening paragraph + closing paragraph (read-only)
- `plan_topics/conventions.md` — REQ-ID discipline, Sequential by default (read-only — both reference the gate)
- `plan_topics/h6-req-ids.md` — Ships when (read-only — references the V18s diff)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18s — Coverage-matrix closing CI gate — (modified)

## Consequence

**Severity:** advisory

The gate's correctness property (no unmapped REQ-ID, no unregistered diagnostic code, etc.) is enforceable as written, so V18s can technically ship. But contributors hitting a failure encounter an arbitrary, implementer-chosen surface — message format, ordering, locality, and exit code all vary by author. The contract becomes effectively un-portable: a second implementation of the gate (e.g. a faster Rust port, a pre-commit hook) cannot match the original's developer ergonomics because there is nothing to match against, and CI-log scrapers cannot rely on a stable shape.

## Solution Space

**Shape:** single

### Recommendation

Designate `plan_topics/v18-cancellation.md` as the normative source of the V18s gate failure surface. `governance.md` (the GOV namespace's home after the prior extraction commit) carries only the floor obligation ("non-zero exit on violation") plus a pointer to the plan leaf. This commit also resolves the sibling findings "GOV-2 transitional clause is a status report, not a normative rule" and "H6 transition contract not specified in GOV-2": the GOV-2 rewrite drops the "Until H6 closes…vacuously satisfied" status-report wording and replaces it with a normative rule that holds at every commit on `main`; the H6 transition contract becomes the single observable property of GOV-2's gate.

**Spec edits.**

- In `spec_topics/governance.md` GOV-2, replace the existing paragraph (including the "Until H6 closes" transitional clause) with a normative rule that holds at every commit on `main`: "The plan's coverage matrix in [`plan_topics/coverage-matrix.md`](./plan_topics/coverage-matrix.md) is keyed per REQ-ID, mapping each ID to its closing leaf. The V18s coverage-matrix closing gate (per [`plan_topics/v18-cancellation.md`](./plan_topics/v18-cancellation.md)) treats any unmapped REQ-ID as a CI failure. `plan_topics/v18-cancellation.md` is the normative source for the gate's failure surface."
- Mirror the same disclaimer in GOV-6.
- Drop the "Until H6 closes, the spec-side REQ-ID set is empty…" sentence entirely. The H6 transition contract is now: H6 inserts `**PREFIX-N.**` anchors and emits the per-page `## Retired REQ-IDs` skeleton; the day H6 lands, the matrix is repopulated per-REQ-ID and the gate begins firing on real unmapped IDs. Until then, the gate is vacuously satisfied as a *property of the input* (the REQ-ID set is empty), not as a transitional rule embedded in GOV-2.

**Plan edits.**

- Add a "Failure surface" sub-section to `plan_topics/v18-cancellation.md` § V18s enumerating: exit code, per-gate message templates, accumulation semantics, and output stream. Concretely: on any check failing, the script exits 1; each offence is written as one line to stderr in `<source-path>:<context>: <gate-id>: <symbol> <reason>` form (e.g. `spec_topics/binder.md: gov-2: BIND-7 unmapped`, `eslint.config.mjs:114: gov-3: BIND-9 not in matrix`); all gates run to completion within a single invocation; gate (3)'s warning lines (transitional pre-H6 spec-anchor citations) are written to stdout to keep them out of CI failure scrapers.
- Update V18s `Tests.` to assert the contract: a fixture with two unmapped IDs produces exactly two stderr lines and exit 1; gate (1) failing does not skip gate (2).

Edge cases for the implementer:

- Gate (3)'s pre-H6 transitional warnings must go to stdout (not stderr), so that contributors reading CI logs see them but failure-line scrapers do not count them.
- The gates must run to completion in one invocation (no fast-fail between gates).
- The `Tests.` bullet must assert the accumulation property with a fixture that violates two distinct gate kinds at once.
- The V18s leaf gains gates 7 and 8 (introduced by the "concurrent PR races" and "GOV-7 Rename cross-artefact updates" commits earlier in bottom-up order); the failure-surface contract applies to all eight gates uniformly.
- Removing the "Until H6 closes" transitional clause does NOT affect H6's own behaviour; H6 still inserts anchors atomically per `plan_topics/h6-req-ids.md`.

## Related Findings

- "H6 transition contract not specified" — co-resolve (Option B's V18s `Adds.` revision is the natural place to record what `comm -23` returns at the H6-closing commit; both findings touch the same V18s `Adds.` block)
- "GOV-1 anchor form vague and over-prescribed" — same-cluster (anchor form determines what the gate's grep matches; resolution of GOV-1 affects gate (1)'s extractor but not its failure surface)
- "`FN` prefix (2 letters) contradicts `[A-Z]{3,4}` extraction regex" — same-cluster (the gate's extractor regex is a separate question from its failure surface; both feed contributor experience but resolve independently)
- "Extraction regex scope unclear" — same-cluster (defines what the gate sees; this finding defines what the gate emits)
- "GOV-N governance rules: scope boundary in spec.md" — decision-dependency (its outcome — whether `spec.md` may carry CI-observable obligations at all — bears directly on the choice between Option A and Option B here)

---

## spec.md — Appendix → GOV-3

---

# GOV-3 narrative exclusion list duplicates the prefix table cells, allowing GOV-7 promotion to silently desynchronise extraction

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** GOV-3 narrative exclusion list out of sync with GOV-7 promotion
**Kind:** completeness

## Finding

GOV-3 records the set of pure-narrative pages in two independent places. The first is a prose enumeration inside the GOV-3 paragraph itself: "Pure-narrative pages (`overview.md`, `glossary.md`, `influences.md`, `comparison.md`, `related-work.md`, `future-considerations.md`) are excluded from extraction." The second is the per-row marker `(no IDs — narrative)` in the *Page → Prefix* table immediately below GOV-3. The two enumerations carry the same membership but are stored as separate text.

GOV-7's *Narrative-to-normative promotion* procedure mutates only the table: "Replace the `(no IDs — narrative)` cell with a freshly allocated prefix in the same edit that introduces the first obligation." It says nothing about the prose list inside GOV-3. A faithful application of GOV-7 alone therefore leaves the page on the GOV-3 exclusion list while assigning it a real prefix in the table. Per the GOV-3 sentence as written, the extraction regex would still skip that page; any new `PREFIX-N` markers it carries would be invisible to GOV-6's table-completeness gate and to V18s' coverage-matrix closing gate, which are the only mechanisms that turn REQ-IDs into a CI obligation.

The defect is the duplication, not the GOV-7 wording per se. Two enumerations that must always agree, with no rule binding them, is a desynchronisation invariant waiting to fire on the first promotion.

## Spec Documents

- `spec.md` — Appendix → GOV-3 (edited)
- `spec.md` — Appendix → GOV-7 *Narrative-to-normative promotion* (option-dependent)
- `spec.md` — Appendix → REQ-ID prefix table (read-only)
- `plan_topics/h6-req-ids.md` — non-narrative-page enumeration in Tests bullets (read-only)
- `plan_topics/v18-cancellation.md` — V18s gate definitions (read-only)
- `plan_topics/conventions.md` — narrative-cross-link list in **Spec** field closure rule (read-only)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H6 — REQ-ID anchoring + coverage-matrix re-pivot — (modified)
- V18s — Coverage-matrix closing CI gate (and sibling V18 gates) — (modified)

## Consequence

**Severity:** correctness

The first time GOV-7 *Narrative-to-normative promotion* fires after H6 closes, the promoted page's `PREFIX-N` markers will be silently skipped by extraction. GOV-6 will report no missing matrix rows for that prefix (because the prefix produces no extracted IDs), V18s will pass, and the page will ship with normative obligations that no leaf has claimed. The failure is silent: the gates that exist precisely to prevent this case are themselves bypassed.

## Solution Space

**Shape:** single

### Recommendation

Rewrite GOV-3 in one pass: replace the `[A-Z]{3,4}` open extractor with a two-regex scheme, adopt strict syntactic exclusions, and make the prefix table the single source of truth for "pure-narrative page" status. This commit also resolves "GOV-3 extraction regex: scope, source form, and number-grammar undefined" and (by construction, since `FN` is in the live alternation) "`FN` prefix violates GOV-3's `[A-Z]{3,4}` extraction regex". This commit further resolves the sibling finding "Prefix shape and case-sensitivity not stated as a constraint" — the two-regex scheme pins prefix shape (`[A-Z]{2,4}`, byte-exact uppercase ASCII) and the syntactic-exclusion rules pin case-sensitivity by construction; the GOV-3 paragraph carries the constraint explicitly.

**Spec edits.**

In `spec_topics/governance.md` GOV-3, replace the existing paragraph with:

> **GOV-3.** REQ-ID prefixes are byte-exact uppercase ASCII tokens of length 2–4 (`[A-Z]{2,4}`). Prefix matching is case-sensitive; `lex-1` does not match `LEX-1`. REQ-ID extraction operates on raw Markdown source bytes, not on rendered HTML. Before regex application, the following are stripped, in order: (i) fenced code blocks (` ```…``` ` and `~~~…~~~`, inclusive of fence lines), (ii) HTML comments (`<!--…-->`), (iii) inline code spans (`` `…` `` and the multi-backtick variants). Markdown link text is in scope; link targets are out of scope.
>
> Two regexes apply:
>
> 1. **Primary extractor** (used by H6's anchor pass and by V18s gates 1, 4, 5): `\b(<live-prefix-alternation>)-[1-9][0-9]*\b`, where `<live-prefix-alternation>` is built from the prefix table below at gate time. Leading zeros in the numeric tail are forbidden.
> 2. **Unknown-prefix detector** (used by V18s gate 6 only): `\b[A-Z]{2,4}-[1-9][0-9]*\b`, applied to the same exclusion-stripped corpus. Any token that matches but whose prefix is not in the live + retired union fails the gate.
>
> Pages whose row in the prefix table below carries the literal cell `(no IDs — narrative)` are excluded from extraction; all other rows in `spec_topics/*.md` are in scope.

Plus: remove the existing parenthetical exclusion list (`overview.md`, `glossary.md`, `influences.md`, `comparison.md`, `related-work.md`, `future-considerations.md`) from the GOV-3 paragraph — the table cell is now the only authoritative signal.

**Adjacent edits.**

- Reframe the narrative-page enumerations in `plan_topics/h6-req-ids.md` and `plan_topics/conventions.md` as derived-from-the-table reminders, not independent normative lists.

Edge cases for the implementer:

- The cell text `(no IDs — narrative)` is now load-bearing — any cosmetic edit (smart quotes, trailing whitespace, em-dash variant) silently changes membership. State the cell's canonical form explicitly when making the edit.
- The prefix alternation must be built from the table at gate time, not hardcoded; H6's self-test already does this — restate the property in GOV-3 so V18s implementers do not duplicate the literal.
- The leading-zero policy applies to **both** regexes; otherwise `LEX-01` slips past gate 1 but fails gate 5 for non-obvious reasons.
- The exclusion order matters: strip fenced blocks before HTML comments before inline spans, because a comment can sit inside a fenced block and an inline span can sit inside a comment.
- Link targets are out of scope for the gate-6 detector.
- The prefix-shape constraint (`[A-Z]{2,4}`) and case-sensitivity rule are stated as the FIRST sentence of GOV-3 so that no future ALL-CAPS-with-digit token (e.g. `ok-1`, `os-2`) is silently extractable.

## Related Findings

- "Rename: plan.md Spec-field update not addressed" — co-resolve (same class of bug: a GOV-7 sub-procedure mutates one location but a duplicated enumeration elsewhere is not bound to follow; both yield to a single-source-of-truth fix or to symmetric same-edit clauses)
- "GOV-7 atomicity: five independent procedures under one identifier" — decision-dependency (if GOV-7 is split into GOV-7a–e, the edit lands on the *Narrative-to-normative promotion* sub-rule under whichever new identifier it receives)
- "GOV-4 \"append-only / immutable\" contradicts GOV-7 Delete / Merge / Rename" — same-cluster (both touch GOV-4/GOV-7 wording in the same appendix paragraph block; resolve in one editing pass)
- "`PIE` prefix allocated but page is pure-narrative pointer content" — decision-dependency (whichever fix defines "pure-narrative" must classify `pi-integration.md` consistently — either it carries the `PIE` prefix and is non-narrative, or its row should read `(no IDs — narrative)` and the prefix retires per GOV-7 *Delete*)
- "`FN` prefix (2 letters) contradicts `[A-Z]{3,4}` extraction regex" — same-cluster (sibling GOV-3 defect; both should land in the same GOV-3 edit)
- "Extraction regex scope unclear" — same-cluster (also a GOV-3 extraction-scope gap; co-locate the fix)


