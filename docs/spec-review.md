# pi-loom — Consolidated Spec Review

_Generated: 2026-05-06T06:31:26Z_
_Source: docs/reviews/spec-review/spec-20260506-064723.md_
_12 findings retained (collapsed from 93 by merge / subsumption), 14 false positives dropped, 0 persistent failures_

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

