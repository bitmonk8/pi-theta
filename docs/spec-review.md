# pi-loom — Consolidated Spec Review

_Generated: 2026-05-06T06:31:26Z_
_Source: docs/reviews/spec-review/spec-20260506-064723.md_
_53 findings retained (collapsed from 93 by merge / subsumption), 14 false positives dropped, 0 persistent failures_

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

---

## spec.md — Appendix → GOV-7

---

# GOV-7 Rename: cross-artefact reference update not specified

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Rename: plan.md Spec-field update not addressed
**Kind:** completeness

## Finding

GOV-7 *Rename* (spec.md:153) specifies only that "the row's Page column updates, the Prefix column does not. Existing in-page anchors are not rewritten." It is silent on the dozens of cross-artefact references that hard-code the renamed page's filename: every plan leaf's `Spec` field links spec_topics pages by URL (`[Schema Declarations](../spec_topics/schemas.md)`), and `plan_topics/coverage-matrix.md` keys every row by such a URL. A grep across `plan_topics/` and `plan.md` returns 322 hits over 30 distinct `spec_topics/*.md` filenames.

A rename executed under the present GOV-7 wording therefore silently invalidates two classes of artefact: plan-leaf `Spec`-field links (which are how the plan-leaf execution loop, per plan.md:8, tells implementers what to read) and coverage-matrix row keys (which are how V18s gate (1) reads spec/matrix coverage at the section level until H6 closes). The closure property the spec relies on — that every reference into `spec_topics/` resolves — is not enforced by any GOV-N rule and is not gated by V18s.

GOV-7 should either (a) make the cross-artefact update a same-edit obligation of the rename procedure, or (b) gate it in CI, or both. The companion finding "GOV-3 narrative exclusion list out of sync with GOV-7 promotion" identifies the same pattern (a GOV-7 mutation silently invalidates a separate artefact) and the same fix shape applies.

## Spec Documents

- `spec.md` — Appendix → GOV-7 *Rename* sub-bullet (edited)
- `plan_topics/conventions.md` — REQ-ID discipline / cross-cutting rules (option-dependent; only edited if the fix adds a convention)
- `plan_topics/v18-cancellation.md` — V18s coverage-gate definition (option-dependent; only edited if the fix adds a CI gate)
- `plan_topics/coverage-matrix.md` — row-key URLs (read-only; informs the scope but not edited by the fix itself)
- `plan.md` — leaf navigation contract (read-only)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18s — Coverage-matrix closing CI gate — (modified, option-dependent)

## Consequence

**Severity:** correctness

A future rename executed strictly per GOV-7 produces a commit in which 1–N plan-leaf `Spec`-field links and coverage-matrix row keys point at a now-non-existent path. Nothing in the present V18s gate set fails on this — gates (1)–(6) all read `PREFIX-N` markers, not URLs. Two implementers handed the present GOV-7 will diverge on whether they sweep `plan_topics/` and `coverage-matrix.md`; one of the two outputs leaves the repo in a state where leaf execution (plan.md step 2: "read only the leaf and the spec topic(s) listed under its **Spec** field") chases a 404.

## Solution Space

**Shape:** single

### Recommendation

Add a CI-gated link-resolution check (V18s gate 8) that fails on any unresolved `(../spec_topics/<page>.md…)` reference under `plan.md` and `plan_topics/**.md`, and amend GOV-7 *Rename* to point at the gate.

**Spec edits.**

In `spec_topics/governance.md` GOV-7, replace the *Rename* sub-bullet with: "Prefix follows the page; the row's Page column updates, the Prefix column does not. Existing in-page anchors are not rewritten. In the same commit, update every reference to the old filename across `plan.md` and `plan_topics/**.md`; the V18s plan-link gate (per [`plan_topics/v18-cancellation.md`](./plan_topics/v18-cancellation.md)) enforces this."

**Plan edits.**

Add gate (8) — *Plan-link gate* — to `plan_topics/v18-cancellation.md` § V18s. The gate enumerates every Markdown link of the form `(../spec_topics/<page>.md(#…)?)` appearing under `plan.md` and `plan_topics/**.md`, and asserts each resolves to a file that currently exists in `spec_topics/`. Implementation is a one-line `grep -rohE` over the plan corpus piped against `ls spec_topics/`. Add a synthetic-rename test that flips the check.

Edge cases for the implementer:

- The gate's grep MUST restrict to the URL shape `(../spec_topics/<kebab>\.md(#…)?)` to avoid false positives on quoted prose or unrelated cross-file links.
- The gate runs on the merge tip and therefore does not need to coordinate with the GOV-7 row mutation in the same PR — both edits land together.
- The gate's scope is the file portion of the URL only; broken `#anchor` fragments are out of scope (separate, broader hygiene concern).
- The gate must be added to V18s' `Deps.` (already includes H6) and to V18s' test enumeration.
- The gate is numbered 8 because gate 7 is taken by the duplicate-prefix detector landed by the prior commit (concurrent-PR races finding).

## Related Findings

- "GOV-3 narrative exclusion list out of sync with GOV-7 promotion" — co-resolve (same shape: a GOV-7 mutation silently invalidates a separate artefact; same "in the same edit" remedy)
- "GOV-7 atomicity: five independent procedures under one identifier" — decision-dependency (if GOV-7 is split into GOV-7a–e, this finding's edit lands on the *Rename* sub-entry and must be re-targeted)
- "GOV-4 'append-only / immutable' contradicts GOV-7 Delete / Merge / Rename" — same-cluster (also touches GOV-7 Rename's surface; resolves independently)
- "Merge: ordering of ID retirement vs prefix retirement unspecified" — same-cluster (also a GOV-7 procedure-completeness gap)
- "Concurrent PRs racing on the same new prefix" — same-cluster (GOV-7 cross-PR coordination gap)

---

# GOV-7 Merge composition with GOV-8: absorbed page's REQ-ID lifecycle unspecified

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Merge: ordering of ID retirement vs prefix retirement unspecified
**Kind:** completeness

## Finding

GOV-7 *Merge* says: "the surviving page keeps its prefix; the absorbed page's prefix is moved to the *Retired prefixes* sub-table." It does not say what becomes of the absorbed page's REQ-IDs, where their per-ID retirement records live, or how the obligations they encoded are re-expressed on the surviving page. At least three readings of "absorbed" are consistent with the current prose:

(a) the absorbed page is deleted outright, taking its `## Retired REQ-IDs` section with it;
(b) every absorbed REQ-ID undergoes a GOV-8 *Merge* into a freshly allocated ID under the surviving prefix on the surviving page;
(c) absorbed REQ-IDs are dropped as GOV-8 *Deletions*.

Each reading produces a different post-commit state. Reading (a) silently breaks the audit trail the spec requires elsewhere ("Per-ID retirements appear in a trailing `## Retired REQ-IDs` section on each non-narrative page") because the page that should carry the records no longer exists. Readings (b) and (c) diverge on whether the absorbed page's obligations survive at all under the surviving prefix.

The composition matters most for V18s gate 6 (prefix-table-completeness): every entry in the *Retired prefixes* sub-table must have a witness — either a live-table row recording its rename history, or at least one entry in some `## Retired REQ-IDs` section that uses it. Under reading (a), the absorbed prefix can become witness-less the moment the page is deleted, and the merging commit fails the gate unless the maintainer separately remembers to annotate the surviving page's prefix-table row with a *Formerly* note or to transplant retirement entries onto the surviving page. The spec does not call out either obligation.

The original "ordering" framing is a red herring: GOV-6 is checked at commit boundaries on `main`, and a single atomic commit has no observable intermediate state. The substantive gap is procedural composition between GOV-7 *Merge* and GOV-8, not sequencing within a commit.

## Spec Documents

- `spec.md` — Appendix → GOV-7 (*Merge* sub-bullet) and the retirement-recording obligation immediately below GOV-8 (edited)
- `spec.md` — Appendix → *Retired prefixes* sub-table (option-dependent — the *Formerly* column convention may need to standardise a "merged into `<prefix>`" annotation)
- `plan_topics/v18-cancellation.md` — V18s gate 6 witness logic (option-dependent — the witness rule may need to acknowledge merged-prefix annotations)
- `plan_topics/h6-req-ids.md` — `## Retired REQ-IDs` skeleton (read-only — the skeleton survives unchanged; only its contents are repopulated at merge time)
- `plan_topics/conventions.md` — REQ-ID discipline summary that paraphrases GOV-7 (read-only — re-cites whatever GOV-7 *Merge* ends up saying)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18s — Coverage-matrix closing CI gate — (modified)

## Consequence

**Severity:** correctness

Two maintainers performing a page-level merge will produce divergent commits: one deletes the absorbed page (orphaning per-ID retirement records and risking V18s gate-6 failure), another carries IDs over as fresh successors under the surviving prefix, a third drops the obligations entirely. The first real GOV-7 *Merge* on `main` will either fail CI in a confusing way or land an audit-trail-incomplete commit that no later edit can repair (the *Retired prefixes* sub-table is itself append-only).

## Solution Space

**Shape:** single

### Recommendation

Specify GOV-7 *Merge* as "carry-over via GOV-8b *Merge*": every live REQ-ID on the absorbed page undergoes a GOV-8b *Merge* into a freshly allocated ID under the surviving prefix; the absorbed page's `## Retired REQ-IDs` rows transplant verbatim into the surviving page's `## Retired REQ-IDs` section; the absorbed page file is deleted in the same commit; the *Retired prefixes* sub-table records the absorbed prefix with the surviving page named in the *Formerly* column.

**Spec edits.**

In `spec_topics/governance.md` GOV-7, replace the *Merge* bullet with:

> **Merge.** When `<absorbed-page>` is merged into `<surviving-page>`:
> - Every live REQ-ID on the absorbed page undergoes a GOV-8b *Merge* into a freshly allocated ID under the surviving prefix, appended at the surviving page's tail. The absorbed-page IDs retire on the absorbed page (its `## Retired REQ-IDs` section gains one row per merged ID) before the file is deleted.
> - The absorbed page's pre-existing `## Retired REQ-IDs` rows transplant verbatim into the surviving page's `## Retired REQ-IDs` section.
> - The absorbed prefix moves to the *Retired prefixes* sub-table; the *Formerly* cell records `<absorbed-page> (merged into <surviving-page> at <sha>)`.
> - The absorbed page file is deleted in the same commit.

Adjust GOV-9 (Retirement recording, landed in the prior GOV-8 sub-lettering commit) to explicitly name GOV-7 *Merge* as a trigger; the per-prefix and per-ID retirement records both live on the surviving page after the merge.

Edge cases for the implementer:

- Confirm that V18s gate 5 (dense numbering) reads its per-prefix invariant from the page's live `**PREFIX-N.**` markers and the page's `## Retired REQ-IDs` rows *filtered to that prefix*; tighten the wording in `plan_topics/v18-cancellation.md` if the current "per-page" phrasing is read literally — after a merge, the surviving page's `## Retired REQ-IDs` section carries two prefixes.
- Standardise the *Formerly* column convention on the single phrase `<page> (merged into <surviving-page> at <sha>)` so future merges produce consistent rows.
- Spell out in GOV-7 *Merge* that the absorbed page file is deleted as part of the same commit; otherwise V18s gate 6 sees both a retired prefix and a live page carrying it.
- The duplicate-prefix gate (V18s gate 7, landed in the prior commit) catches any accidental violation of the "absorbed prefix moves to Retired prefixes" requirement.

## Related Findings

- "GOV-7 atomicity: five independent procedures under one identifier" — decision-dependency (if GOV-7 is split per sub-procedure, GOV-7-Merge becomes the natural anchor and the wording change here attaches cleanly to that ID rather than to a sub-bullet)
- "GOV-8 atomicity: four operations plus retirement rule under one identifier" — decision-dependency (Option A's procedure cites GOV-8-Merge by sub-bullet today; an atomised GOV-8 gives it a stable identifier)
- "GOV-4 'append-only / immutable' contradicts GOV-7 Delete / Merge / Rename" — same-cluster (both restate GOV-7 *Merge*'s effect on the live table; co-edit candidate)
- "Rename: plan.md Spec-field update not addressed" — same-cluster (another procedural-completeness gap in GOV-7; same edit pass)
- "Concurrent PRs racing on the same new prefix" — same-cluster (allocation discipline for GOV-7 *Add*; same surface, independent fix)
- "GOV-3 narrative exclusion list out of sync with GOV-7 promotion" — same-cluster (procedural-completeness gap in a different GOV-7 sub-bullet)

---

# Concurrent PR races silently violate GOV-4 prefix uniqueness

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Concurrent PRs racing on the same new prefix
**Kind:** completeness

## Finding

GOV-4 requires that every newly-added row in the REQ-ID prefix table use a *previously-unused* prefix — one absent from both the live table and the *Retired prefixes* sub-table. The check is implicit: an author opens a PR, scans the two tables, picks an unused token, and appends a row. Nothing in GOV-4 through GOV-8 (nor in the V18s gate suite) coordinates that allocation across in-flight branches.

Two PRs opened in parallel can therefore each select the same "previously-unused" prefix `XYZ`. Each PR passes V18s in isolation: gate (1) sees `XYZ-N` IDs mapped in the matrix; gate (6) sees every prefix in spec text covered by the live table. When both branches merge, `main` ends up with two live rows bound to different pages under the same prefix, or — depending on whose row landed where — one row plus orphaned IDs that nominally belong to the other page. Git itself only catches the collision when both PRs touch literally adjacent table lines; non-adjacent table appends merge cleanly.

V18s gate (6) does not catch this post-merge state because it is set-based: the union of (live-table prefixes ∪ retired-prefixes) still covers every prefix observed in spec text even when the live table contains duplicates. There is no GOV rule asserting that the live table's `Prefix` column is unique, no gate enforcing it, and no procedure forcing a rebased author to re-validate their chosen prefix against `main`'s tip before merge.

## Spec Documents

- `spec.md` — Appendix → GOV-4, GOV-7 *Add*, GOV-7 *Narrative-to-normative promotion* (edited)
- `plan_topics/v18-cancellation.md` — V18s gate list (edited)
- `plan_topics/conventions.md` — REQ-ID discipline summary (option-dependent; needs a new sentence only if Option B is taken)
- `plan_topics/h6-req-ids.md` — read-only context for the initial allocation pass

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18s — Coverage-matrix closing CI gate — (modified)

## Consequence

**Severity:** correctness

A silent duplicate-prefix on `main` breaks GOV-4 and GOV-1 ("stable per-page prefix") without any CI signal. Downstream tooling that maps `XYZ-N` to a single owning page (the coverage matrix, the V18s gates, the H6 anchor pass, future REQ-ID renderers) will either pick the wrong page or silently double-count. The corruption is detected only when a human notices, by which point retroactive repair requires retiring one of the two prefixes and re-anchoring an entire page's IDs.

## Solution Space

**Shape:** single

### Recommendation

Add V18s gate 7 — *Duplicate-prefix detector* — that fails on any duplicate live `Prefix` value or any live prefix that also appears in *Retired prefixes*. Annotate GOV-4 to make the uniqueness invariant explicit. This commit also resolves the sibling finding "GOV-4 per-row invariant contradicts the GOV-7 Rename / Delete / Merge procedures": the GOV-4 update clarifies that "append-only / immutable" applies to the prefix → page binding (a prefix never moves to a different page; once retired never reused), NOT to the table rows themselves (which GOV-7 explicitly mutates via Rename / Delete / Merge / Demotion).

**Spec edits.**

In `spec_topics/governance.md` GOV-4, replace the existing single sentence with:

> **GOV-4.** The prefix → page binding is append-only and immutable: once a prefix is allocated to a page (per GOV-7a *Add* or GOV-7e *Narrative-to-normative promotion*), the binding never changes silently and the prefix is never reassigned to a different page (per GOV-7c *Delete* and GOV-7f *Normative-to-narrative demotion*, retired prefixes move to the *Retired prefixes* sub-table and are never reused). The *table rows themselves* are NOT immutable — GOV-7b (Rename) updates the Page column without changing the prefix, and GOV-7c / GOV-7d / GOV-7f remove or relocate rows. The live table's `Prefix` column is a key — duplicate live prefixes, and any live prefix that also appears in the *Retired prefixes* sub-table, are CI failures (per V18s gate 7).

**Plan edits.**

Add gate (7) — *Duplicate-prefix detector* — to `plan_topics/v18-cancellation.md` § V18s. The gate parses the live prefix table and the *Retired prefixes* sub-table from `spec_topics/governance.md`, asserts the multiset of live `Prefix` values equals its set, and asserts the live `Prefix` set is disjoint from the retired `Prefix` set. Treat any violation as a CI failure on `main` and on every PR. Add `Tests.` and `Ships when.` bullets accordingly.

Edge cases for the implementer:

- The gate must read both tables from `spec_topics/governance.md` (not from `spec.md`), reusing the parser V18s gate (6) already needs.
- The disjointness check between live and retired catches the GOV-4 *no reuse* clause as a side-effect — keep it explicit so the failure message names the violated rule.
- The gate fires on PR builds, not just `main`, so the loser of a race learns at PR time.
- The gate is numbered 7 because gates 1–6 are the existing V18s gates; gate 8 (plan-link resolution, landed in the next commit by bottom-up order) is a separate concern.
- The GOV-4 rewrite cites the GOV-7 sub-letters (a/b/c/d/e/f) introduced by the GOV-7+GOV-8 sub-lettering commit earlier in bottom-up order; verify those sub-letters exist in `governance.md` before citing them.

## Related Findings

- "GOV-4 \"append-only / immutable\" contradicts GOV-7 Delete / Merge / Rename" — co-resolve (the GOV-4 restatement that finding proposes is the natural place to add the uniqueness-as-key clause this finding's recommendation requires)
- "Prefix uniqueness scope ambiguous (case-sensitivity; GOV prefix status)" — same-cluster (touches GOV-4 uniqueness from the case-folding angle; the duplicate-detection gate must decide whether comparison is case-sensitive, which is that finding's question)
- "V18s CI gate failure surface unspecified" — decision-dependency (adding a seventh sub-gate makes the failure-surface gap one row larger; resolving the failure-surface contract first lets this gate's `Ships when.` bullet inherit it)
- "GOV-7 atomicity: five independent procedures under one identifier" — same-cluster (if GOV-7 is split into GOV-7a–GOV-7e, the spec edit lands under the *Add* sub-rule rather than the umbrella)

---

## spec.md — Appendix → GOV-8

---

# GOV-8 "pure rewording" rule has no enforcement posture and ambiguous boundaries

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** "Pure rewording" boundary detection has no mechanism
**Kind:** completeness, error-model

## Finding

GOV-8's *Pure rewording* clause (`spec.md:163`) draws the bright line that decides whether an in-place edit to an existing REQ-ID is permitted or whether the ID must retire and be re-issued. The rule names the test ("alters which inputs are accepted, which outputs are produced, which diagnostics fire, or which invariants hold") but never says *who* applies that test or *when*. The five mechanical gates that V18s ships (`plan_topics/v18-cancellation.md:139–144`) cover GOV-6, GOV-8 *Split / Merge / Deletion* retirement bookkeeping, and dense numbering — but none of them can detect a substantive in-place edit to an unchanged REQ-ID, because semantic equivalence between two prose paragraphs is not grep-able. So the rule sits in a posture limbo: it reads like an invariant the V18s gate enforces, but it isn't enforced anywhere.

The four-line definition also leaves three borderline edits unclassified, each of which a reasonable contributor might call "pure rewording":

- **Modal strengthening / weakening** — changing `should` to `MUST` (or vice versa) inside a `**PREFIX-N.**` paragraph. The set of accepted inputs and emitted diagnostics is unchanged at the moment of the edit, but the obligation's force has shifted.
- **Diagnostic-code addition to an existing rule** — appending "and emits `loom/parse/foo-bar`" to a `**PREFIX-N.**` whose previous prose said nothing about diagnostics. This *does* alter "which diagnostics fire" by the GOV-8 test, but the V18s diagnostic-code gate (gate 2) catches the *new code* via the registry/test-assertion diff, not via REQ-ID retirement, so the GOV-8 path and the V18s path disagree about whether retirement is required.
- **Non-normative example edit** — rewriting a fenced code block or a parenthetical example that sits inside a `**PREFIX-N.**` paragraph but is illustrative rather than normative. Examples don't constrain implementations, so the edit is "pure rewording" — but the spec never marks the boundary between a rule's normative core and its illustrative tail.

Without an explicit posture and a worked-example list, two contributors editing the same `**PREFIX-N.**` paragraph will reach different verdicts on whether retirement is needed, and a reviewer has no canonical artefact to point at when overruling either of them.

## Spec Documents

- `spec.md` — Appendix → GOV-8 *Pure rewording* clause and the surrounding GOV-8 block (edited)
- `plan_topics/v18-cancellation.md` — V18s gate list (option-dependent; only edited under Option B)
- `plan_topics/conventions.md` — REQ-ID discipline bullet (read-only; cross-references GOV-8 by name and stays accurate under either option)
- `plan_topics/h6-req-ids.md` — anchor-insertion leaf (read-only; H6 establishes the `**PREFIX-N.**` markers that GOV-8 governs but does not interact with the rewording boundary)

## Plan Impact

**Phases:** Vertical V18 (option-dependent)

**Leaves (implementation order):**

- V18s — Coverage-matrix closing CI gate — (option-dependent: modified iff Option B is chosen, in which case a seventh advisory gate is added; unaffected under Option A)

## Consequence

**Severity:** advisory

The rule exists and any implementer can read it; nothing in the build pipeline silently breaks. But spec-maintenance reviews will repeatedly relitigate the borderline cases without a stable answer, and the appearance of an unenforced invariant alongside five enforced ones in the same GOV-8 block invites contributors to assume the V18s gate covers it when it does not.

## Solution Space

**Shape:** single

### Recommendation

Sub-letter GOV-8 into four atomic operations, sub-letter GOV-7 in parallel, promote the cross-cutting "retirement-recording" paragraph to a new top-level `GOV-9`, add worked classification examples to the new `GOV-8d (Pure rewording)`, and pin the per-page numbering scheme. This commit also resolves the sibling findings "GOV-8 packs four lifecycle operations and a cross-cutting retirement-recording rule under one identifier", "GOV-7 bundles five independent mutation procedures under one identifier", and "GOV-8 leaves the per-page numbering scheme to the plan instead of stating it".

**Spec edits.**

In `spec_topics/governance.md`, replace the existing GOV-7 bullet with the parallel sub-lettered form:

> **GOV-7a (Add).** New page → append a row with a previously-unused prefix.
>
> **GOV-7b (Rename).** Prefix follows the page; the row's Page column updates, the Prefix column does not. Existing in-page anchors are not rewritten. In the same commit, update every reference to the old filename across `plan.md` and `plan_topics/**.md`; the V18s plan-link gate (per [`plan_topics/v18-cancellation.md`](./plan_topics/v18-cancellation.md)) enforces this.
>
> **GOV-7c (Delete).** The row is moved from the live table to the *Retired prefixes* sub-table. The prefix MUST NOT be reused.
>
> **GOV-7d (Merge).** When `<absorbed-page>` is merged into `<surviving-page>`: every live REQ-ID on the absorbed page undergoes a GOV-8b *Merge* into a freshly allocated ID under the surviving prefix; the absorbed page's `## Retired REQ-IDs` rows transplant verbatim into the surviving page's `## Retired REQ-IDs` section; the absorbed prefix moves to the *Retired prefixes* sub-table; the absorbed page file is deleted in the same commit.
>
> **GOV-7e (Narrative-to-normative promotion).** Replace the `(no IDs — narrative)` cell with a freshly allocated prefix in the same edit that introduces the first obligation.
>
> **GOV-7f (Normative-to-narrative demotion).** Move the page's prefix from the live table to the *Retired prefixes* sub-table per GOV-7c; append a new live table row carrying `(no IDs — narrative)`. Re-promotion (per GOV-7e) requires a fresh prefix because the original is now retired and immutable.

Replace the existing GOV-8 bullet with the four-letter atomic form:

> **GOV-8a (Split).** When one rule splits into N rules, the original ID retires and N fresh IDs are appended at the page's tail.
>
> **GOV-8b (Merge).** When N rules merge into one, all N source IDs retire and one fresh ID is appended at the page's tail.
>
> **GOV-8c (Deletion).** Rule removed without replacement → ID retires; the prefix-position number MUST NOT be reused.
>
> **GOV-8d (Pure rewording).** Typo fixes, sentence restructuring, link updates leave the ID unchanged. A change that alters which inputs are accepted, which outputs are produced, which diagnostics fire, or which invariants hold is substantive and MUST be modelled as a split, merge, or deletion-plus-add — never as an in-place edit. This boundary is enforced by review on the PR that touches a `**PREFIX-N.**` paragraph; no CI gate detects substantive in-place edits, and none is planned, because semantic equivalence between two prose paragraphs is not mechanically decidable. Worked examples:
> - Modal strengthening (`should` → `MUST` or `MUST` → `should`) inside a `**PREFIX-N.**` paragraph is **substantive**.
> - Adding (or removing) a diagnostic code from a `**PREFIX-N.**` paragraph is **substantive**; the new code's V18s gate-2 registry entry is a separate, additive obligation that does not satisfy GOV-8 retirement.
> - Editing a non-normative example (fenced code block, parenthetical illustration) attached to a `**PREFIX-N.**` paragraph is **pure rewording**, provided the rule's normative sentences are unchanged. When in doubt, retire-and-re-add.
>
> **Per-page numbering scheme.** REQ-IDs on each non-narrative page start at 1 and are contiguous, monotonically increasing integers. Gaps from retirement (per GOV-8a / GOV-8b / GOV-8c) do NOT collapse — a retired `LEX-7` leaves the ID slot permanently retired, and the next allocated ID is `LEX-N+1` where N is the highest-allocated number on the page (live or retired). The `## Retired REQ-IDs` section is the canonical record of retired numbers; V18s gate 5 (dense-numbering) reads its per-prefix invariant from the union of live `**PREFIX-N.**` markers and `## Retired REQ-IDs` rows filtered to that prefix.

Promote the trailing "All retirements MUST be recorded" paragraph to a new top-level rule:

> **GOV-9 (Retirement recording).** Every prefix retirement triggered by GOV-7c (Delete) / GOV-7d (Merge) / GOV-7f (Normative-to-narrative demotion) and every ID retirement triggered by GOV-8a (Split) / GOV-8b (Merge) / GOV-8c (Deletion) MUST be recorded:
> - **Per-prefix retirements** appear in the *Retired prefixes* sub-table.
> - **Per-ID retirements** appear in a trailing `## Retired REQ-IDs` section on each non-narrative page (skeleton inserted by H6).
>
> GOV-8d (Pure rewording) does not retire anything and does not trigger this rule.

**Adjacent edits.**

- Update `plan_topics/v18-cancellation.md` gates (4) and (5) to cite "per `../spec_topics/governance.md` GOV-9" instead of GOV-8. Update gate (5)'s prose to clarify that the per-prefix dense-numbering check reads the union of live markers + `## Retired REQ-IDs` rows filtered to the prefix.
- Update `plan_topics/conventions.md` *REQ-ID discipline* bullet to mention GOV-9 alongside GOV-8.

Edge cases for the implementer:

- The natural ordering for sub-letters: GOV-7 → Add/Rename/Delete/Merge/Promotion/Demotion = a/b/c/d/e/f. GOV-8 → Split/Merge/Deletion/Pure-rewording = a/b/c/d. Do not reshuffle.
- `GOV-8d (Pure rewording)` is intentionally absent from the GOV-9 trigger list; this asymmetry is intentional and stated.
- Worked-example (1) — modal strengthening — is the most likely-missed case in review; flag it first in the worked list.
- The per-page numbering scheme rule explicitly prohibits gap-collapsing; an implementer tempted to renumber after deletion is wrong.

## Related Findings

- "GOV-8 atomicity: four operations plus retirement rule under one identifier" — same-cluster (both target GOV-8's structural shape; decomposing into atomic entries per that finding would give the *Pure rewording* sub-rule its own ID, which makes the posture statement from this finding easier to attach)
- "REQ-ID numbering start and monotonicity unspecified" — same-cluster (third GOV-8 gap surfaced by this review; resolves independently)
- "GOV-7 / GOV-8 ordering ambiguity in the merge case" — decision-dependency (any explicit "review-only vs. CI-enforced" tagging added by this finding sets the precedent the GOV-7/GOV-8 ordering fix would inherit)

---

## spec.md — Appendix → Retired prefixes sub-table

---

# Editorial reason text mixed into `Formerly` column of the *Retired prefixes* sub-table

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** "Transitional" editorial commentary in Formerly column
**Kind:** cruft

## Finding

The *Retired prefixes* sub-table in `spec.md` (Appendix → after GOV-8) declares three columns: `Prefix`, `Formerly`, `Retired in`. By construction the `Formerly` column carries the page name a retired prefix used to point at — it is the only datum needed to chain a historical REQ-ID back to its current page. The two existing rows currently overload this cell:

| Prefix | Formerly | Retired in |
|---|---|---|
| `BIND` | `` `binder.md` `` (transitional, post-`BIND` / `BNDG` split) | `7851d7c` |
| `BNDG` | `` `bindings.md` `` (transitional, post-`BIND` / `BNDG` split) | `7851d7c` |

The parenthetical "transitional, post-`BIND` / `BNDG` split" is editorial reason text, not page-name data. The same paragraph that introduces the sub-table already provides the explicit affordance: "A fourth `Reason` column MAY be added without breaking the GOV-6 gate." Reason text either belongs in that fourth column or does not belong in the table at all; smuggling it into `Formerly` mixes two distinct schemas in one cell and sets a precedent that future retirements will follow.

## Spec Documents

- `spec.md` — Appendix → *Retired prefixes* sub-table (lines ~170–177) (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the V18s *Prefix-table-completeness gate* (per `plan_topics/v18-cancellation.md`) reads only the `Prefix` column of this sub-table; the contents of `Formerly` and `Retired in` are not consumed by any leaf. `plan_topics/conventions.md` references the sub-table abstractly. Either fix is a pure spec-text edit with no plan churn.

## Consequence

**Severity:** cosmetic

The corpus still parses, every gate still passes, and a human reader still understands the rename history. The only cost is precedent: every future retirement row will copy this shape and the `Formerly` column will accumulate ad-hoc parentheticals instead of crystallising into a clean schema.

## Solution Space

**Shape:** single

### Recommendation

Strip the parenthetical "(transitional, post-`BIND` / `BNDG` split)" from both `Formerly` cells in the *Retired prefixes* sub-table, AND pin the `Retired in` column format. This commit also resolves the sibling finding "`Retired in` column has no format contract".

**Spec edits.**

In `spec_topics/governance.md` (the GOV namespace's home after the prior extraction commit):

- Edit the two existing rows in the *Retired prefixes* sub-table to remove the parenthetical from each `Formerly` cell. The rows become `` `binder.md` `` and `` `bindings.md` `` respectively.
- Pin the `Retired in` column format with a sentence above the sub-table: "The `Retired in` column carries either the 7-character abbreviated commit SHA (e.g. `7851d7c`) or a release tag (e.g. `v0.42.0`), nothing else. No prose, no parentheticals, no qualifiers." The two existing cells (both `7851d7c`) already comply; this sentence documents the existing practice.
- Leave the existing sentence "A fourth `Reason` column MAY be added without breaking the GOV-6 gate" intact — it remains a true and useful affordance for future retirements that need structured rationale. If a row carries a `Reason`, the cell is free-form prose; the `Retired in` cell remains strictly SHA-or-tag.

Edge cases for the implementer:

- The split-history context for the two existing retirements lives in commit `7851d7c`, which both `Retired in` cells point at; readers seeking "why" follow the SHA.
- The format contract is reviewer-enforced (no V18s gate parses the column today); future tooling that reads the column can rely on the SHA-or-tag invariant.
- A future retirement that genuinely needs structured rationale should add the optional `Reason` column at that time, populating the new column and any prior rows with empty cells.

## Related Findings

- "SHA / tag format in `Retired in` column not specified" — same-cluster (sibling column in the same sub-table; resolves independently)
- "GOV-8 conflates four lifecycle operations and the retirement-recording obligation" — same-cluster (touches GOV-8 prose immediately above the sub-table; resolves independently)
- "Appendix governs the spec itself but lives in the orientation file" — supersedes (if the entire Appendix is extracted to a separate governance file, this finding becomes part of the cleanup pass on the extracted table)

---

## spec.md — Appendix (scope)

---

# GOV-N governance rules: scope boundary in spec.md

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** GOV-N governance rules: scope boundary in spec.md
**Kind:** scope, placement

## Finding

`spec.md` is two documents in one. The body is a thin orientation/TOC for `pi-loom` — Prerequisites, Reading order, and grouped links into `spec_topics/`. The Appendix then becomes an unrelated meta-spec: GOV-1 through GOV-8 govern how REQ-IDs are coined, anchored, retired, and gated; the prefix table is the canonical mapping consumed by H6 and by the V18s CI gates; the *Retired prefixes* sub-table is the registry V18s gate (6) reads. None of this is about the loom language or its runtime — it governs the spec corpus itself.

The split shows up in citations: every plan reference into the Appendix is a deep-link to a specific GOV-N rule or to the prefix table — `plan_topics/h6-req-ids.md` cites `../spec.md` Appendix — GOV-1 and the prefix table; `plan_topics/v18-cancellation.md` cites GOV-6 and GOV-8 from gates (4)–(6); `plan_topics/conventions.md` cites GOV-4/5/6/7/8 in the REQ-ID-discipline bullet. No live citation aims at the orientation body. A reader who lands on `spec.md` for orientation hits five screens of governance procedure before reaching `Future Considerations`; a reader who lands for governance has to scroll past the link tree to find it.

The Appendix also self-justifies its placement (the `GOV` row's footnote: "per GOV-3, the extraction regex is applied only to `spec_topics/*.md`, so `GOV-N` IDs in `spec.md` are not consumed by the V18s coverage gate"). That carve-out exists *because* the meta-spec was put in `spec.md` rather than alongside the pages it governs; on a dedicated page under `spec_topics/`, the carve-out disappears and `GOV` joins the regular extraction set.

## Spec Documents

- `spec.md` — Appendix (REQ-ID prefix table, GOV-1 through GOV-8, Retired prefixes sub-table) (edited)
- `spec.md` — body, for the surviving link to the new governance page (edited)
- `spec_topics/governance.md` — new file holding the extracted GOV-N rules and tables (edited, option-dependent)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)
- V18s — Coverage-matrix closing CI gate — (modified)

(Both leaves cite `../spec.md` Appendix — GOV-N anchors that move under any extraction option; `plan_topics/conventions.md` and `plan_topics/coverage-matrix.md` are not leaves but carry the same citation pattern and edit alongside.)

## Consequence

**Severity:** cosmetic

`spec.md` reads as two documents stapled together and forces a self-referential carve-out in GOV-3 to keep its `GOV-N` IDs out of the extraction set the rest of the appendix governs. No implementer is misled and no gate misfires; the cost is reader friction and a piece of meta-architecture that exists only because of the placement.

## Solution Space

**Shape:** single

### Recommendation

Extract the entire REQ-ID-related Appendix content from `spec.md` into a new `spec_topics/governance.md`. The new page becomes a regular non-narrative spec topic; the GOV-3 self-referential carve-out for `spec.md` disappears.

**Spec edits.**

- Create `spec_topics/governance.md` containing the moved content: the prefix table, the *Retired prefixes* sub-table, GOV-1 through GOV-8, and the explanatory paragraphs between them.
- In the moved prefix table, replace the row `| spec.md (this appendix's GOV-N rules) | GOV |` with `| governance.md | GOV |`.
- In the moved GOV-3 paragraph, drop the parenthetical narrative-exclusion list — the table cell becomes the single source of truth (this is also handled by a later commit on GOV-3, but the migration must not regress it).
- Delete the entire `### REQ-ID prefix table` section and everything below it through the *Retired prefixes* sub-table from `spec.md`.
- Add `[Governance](./spec_topics/governance.md)` to the Appendix list in `spec.md` (replacing the deleted content with a single bullet alongside Glossary / Grammar / Related Work).

**Plan / cross-link edits.**

- Update `plan_topics/h6-req-ids.md` `**Spec.**` field to add `governance.md`; update the GOV-1 anchor link target.
- Update `plan_topics/v18-cancellation.md` gates (4)/(5)/(6) link targets and the prose that names `../spec.md` Appendix as the source of the prefix table; the gates' file-path argument updates to `spec_topics/governance.md`.
- Update `plan_topics/conventions.md` REQ-ID-discipline bullet to cite `../spec_topics/governance.md#gov-N` rather than `../spec.md` Appendix.
- Update `plan_topics/coverage-matrix.md` scaffolding paragraph (which also cites `../spec.md` for the prefix table).

Edge cases for the implementer:

- This commit is a load-bearing precondition for the eight GOV-edit commits that follow it in bottom-up order. All of those target `governance.md` rather than `spec.md`.
- After the move, `governance.md`'s REQ-IDs (`GOV-1` … `GOV-8`) are subject to V18s gates 4 (reused-ID) and 5 (dense-numbering) like every other non-narrative page; H6's anchor pass treats it normally. Confirm H6's `**Spec.**` enumeration includes the new file.
- The Glossary should gain a "Governance" entry pointing at the new page if other glossary entries follow the topic-page convention.

## Related Findings

- "GOV-1 anchor form vague and over-prescribed" — same-cluster (touches GOV-1 inside the moving content; resolve in whichever file ends up owning GOV-1)
- "FN prefix (2 letters) contradicts `[A-Z]{3,4}` extraction regex" — same-cluster (touches GOV-3 and the prefix table)
- "Extraction regex scope unclear" — same-cluster (GOV-3)
- "GOV-3 narrative exclusion list out of sync with GOV-7 promotion" — same-cluster (GOV-3 / GOV-7)
- "Prefix uniqueness scope ambiguous (case-sensitivity; GOV prefix status)" — decision-dependency (the GOV-prefix-status sub-question disappears under Option A: `GOV` becomes a regular prefix on a regular page)
- "GOV-7 atomicity: five independent procedures under one identifier" — same-cluster (GOV-7)
- "GOV-4 \"append-only / immutable\" contradicts GOV-7 Delete / Merge / Rename" — same-cluster (GOV-4 / GOV-7)
- "Rename: plan.md Spec-field update not addressed" — same-cluster (GOV-7 Rename)
- "Merge: ordering of ID retirement vs prefix retirement unspecified" — same-cluster (GOV-7 Merge)
- "Concurrent PRs racing on the same new prefix" — same-cluster (GOV-7 Add)
- "GOV-8 atomicity: four operations plus retirement rule under one identifier" — same-cluster (GOV-8)
- "\"Pure rewording\" boundary detection has no mechanism" — same-cluster (GOV-8)
- "REQ-ID numbering start and monotonicity unspecified" — same-cluster (GOV-3 / GOV-8)
- "\"Transitional\" editorial commentary in Formerly column" — same-cluster (Retired prefixes sub-table)
- "SHA / tag format in `Retired in` column not specified" — same-cluster (Retired prefixes sub-table)
- "\"Until H6 closes … vacuously satisfied\" transitional clause in normative rule" — same-cluster (GOV-2)
- "H6 transition contract not specified" — same-cluster (GOV-2)
- "V18s CI gate failure surface unspecified" — same-cluster (GOV-2 / GOV-6)

---

## spec.md — Missing top-level concerns

---

# README contradicts spec on loom return values

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** README contradicts spec on loom return values
**Kind:** doc-alignment-broad

## Finding

`README.md`'s opening paragraph asserts that "Evaluating a loom does not return a value or write a file — it appends turns to a conversation". This is wrong on the return-value point: `spec.md`'s introduction states that "Evaluation also produces a final value (the loom's last expression or `return expr`) consumed by `invoke` callers and propagated across the subagent boundary", and `spec_topics/overview.md` reinforces that "Evaluating a loom produces two outputs: a structured sequence of text fragments … and a final value — the loom's last expression or `return expr` — consumed by programmatic callers". The README's own *Highlights* section even contradicts its opening paragraph, listing "subagent mode runs in an isolated child conversation and returns a value".

The README is the first artefact a new contributor reads. A flat denial of the return-value contract there will mislead readers about the `invoke` semantics, the subagent boundary, and the existence of `return expr` as a meaningful surface — the very features the rest of the project hangs on.

The companion file-write claim ("or write a file") is technically true of loom evaluation in isolation but is itself the subject of a separate finding ("looms do not write files" claim) because tools like `write` / `edit` plainly do write files. The fix here should align both clauses with their normative counterparts in one edit.

## Spec Documents

- `README.md` — opening paragraph (and *Highlights → Two execution modes* for internal consistency check) (edited)
- `spec.md` — Introduction (read-only)
- `spec_topics/overview.md` — opening paragraph and *prompt mode* / *subagent mode* sections (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. README maintenance is governed by the per-leaf "Doc updates" rule in `plan_topics/conventions.md` (status-table entry after each leaf); no leaf owns the descriptive prose. The fix can ship as a standalone documentation correction at any time.

## Consequence

**Severity:** advisory

A new reader auditing the project will form an incorrect mental model of loom's return semantics on first contact and may carry that misunderstanding into reading `spec.md`. Nothing breaks at runtime; the spec itself is correct. The cost is wasted reader time and a credibility hit on a project whose value proposition rests on careful specification.

## Solution Space

**Shape:** single

### Recommendation

Replace the contradictory sentences in `README.md`, `spec.md`, and `spec_topics/overview.md` simultaneously to converge on one phrasing about (a) loom return values and (b) the relationship between loom evaluation and file outputs. This commit also resolves the sibling finding "Unqualified 'looms do not write files' claim misleads on sandboxing posture" — the same factual claim appears at three sites and is fixed in one coordinated edit.

**Spec / doc edits.**

- `README.md` opening (and any *Highlights → Two execution modes* paraphrases): rewrite the existing "does not return a value or write a file" sentence to two precise sentences:

  > A loom evaluates to a final value (its last expression or `return expr`), available to programmatic callers and propagated across the subagent boundary.
  >
  > Loom evaluation itself produces no file outputs; any file writes occur only through Pi tools the loom explicitly admits via frontmatter `tools:` (e.g. `write`, `edit`).

- `spec.md` paragraph 2 (the introduction sentence ending "…consumed by `invoke` callers and propagated across the subagent boundary; looms do not write files."): replace the bare "looms do not write files" clause with the qualified second sentence above; keep the surrounding clause about `invoke` callers and the subagent boundary intact.

- `spec_topics/overview.md` paragraph 2 (the sentence "Looms do not write files."): replace with the same qualified phrasing.

Edge cases for the implementer:

- All three sites use exactly the same two-sentence wording so a future audit can grep for either sentence and find every site.
- `overview.md` is narrative; an inline cross-reference to `frontmatter.md` does not trigger Spec-field closure (per GOV-12).
- The README opening is informative; the spec.md and overview.md paragraphs are narrative orientation. None require REQ-ID anchors.

## Related Findings

- `"looms do not write files" claim` — co-resolve (the recommended README rewrite incorporates the file-write rewording; the spec-side edits remain owned by that finding)
- `Final value contract on failure unstated` — same-cluster (both touch the "loom produces a final value" contract; the failure-case gap is a spec-side problem and resolves independently)

---

# `spec.md` Orientation lacks a Scope section pinning four cross-cutting concerns

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Missing top-level forward references for load-bearing concerns
**Kind:** completeness

## Finding

`spec.md`'s Orientation section enumerates Prerequisites and a Reading Order, but never enumerates what V1 *does not* cover or where to find the cross-cutting policies that bound runtime behaviour. Four concerns sit in this gap:

1. **Authentication / authorization / tenancy.** Neither `spec.md` nor any topic page states the trust boundary a `.loom` file inherits — what filesystem, network, tool-execution, or Pi-API surface a loom may touch, and whether V1 imposes any sandbox separate from the Pi extension host's own permissions. The implicit V1 answer (looms run inside the extension host process at full host privilege; the only enforcement is whatever Pi already enforces on extensions and on the active-tool set) is correct but unwritten, so a reader who searches for "permission" finds only filesystem-EACCES diagnostics.
2. **Source-language migration / backward-compatibility policy.** `spec.md` says nothing about whether a `.loom` file that loads cleanly under V1.0 is guaranteed to load and behave identically under V1.x, nor what the policy is across major versions. Pi-side compatibility *is* covered (the `peerDependencies` widening rule under Prerequisites), but loom-source compatibility is the orthogonal axis and is unaddressed.
3. **Loom-runtime observability orientation.** The Runtime event channel — the operator-facing log surface for the always-log `QueryError` set — is normatively pinned in `pi-integration-contract.md` and consumed by `diagnostics.md` and `query.md`'s discard-observability rule, but `spec.md`'s top-level reading order links neither. An implementer surveying the spec for "what does the runtime emit for logging / metrics" must already know the channel's name to find it.
4. **Centralised resource-limit inventory.** The runtime *does* specify each ceiling — invoke-chain depth 32 (`invocation.md`), `tool_loop.max_iterations` 25 (`frontmatter.md`), at most 3 binder LLM calls per slash invocation (`binder.md`), JSON-document depth 5 (`schema-subset.md`) — but no page enumerates them together, and `spec.md` does not state that these are the complete set of hard ceilings (so an implementer cannot tell whether some implicit nesting / iteration limit is also expected).

The result is not that implementers will invent the ceilings (the per-page numbers are pinned and tested) but that the four concerns are individually invisible from the entry document. A reader following the spec's own orientation contract — "restrict reading to the topics listed under your plan leaf's Spec field" — has no signal that any of these concerns exist until they hit the topic page that owns it.

## Spec Documents

- `spec.md` — Orientation (edited)
- `spec_topics/future-considerations.md` — *Known V1 limitations (no seam expected)* (edited)
- `spec_topics/pi-integration-contract.md` — Runtime event channel (read-only)
- `spec_topics/invocation.md` — Invocation depth bound (read-only)
- `spec_topics/frontmatter.md` — `tool_loop` (read-only)
- `spec_topics/binder.md` — Failure modes / retry budget (read-only)
- `spec_topics/schema-subset.md` — depth ceiling (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The edit is doc-only on `spec.md`'s Orientation and `future-considerations.md`'s *Known V1 limitations* bucket; it adds cross-references to existing normative text and (in two cases — auth/tenancy and source-language migration) records a V1 disposition without changing observable behaviour. No leaf's Tests or Ships-when criteria move.

If the auth/tenancy or migration disposition is written as a numbered governance rule (e.g. `GOV-9` / `GOV-10`), it falls under the existing `spec.md → GOV` row in the REQ-ID prefix table; per `GOV-3` the V18s coverage gate does not consume `GOV-N` IDs in `spec.md`, so no plan leaf needs to claim them.

## Consequence

**Severity:** advisory

The four concerns are individually reachable from their owning topic pages and from `pi-integration-contract.md`, so an implementer who reads the full spec will find them; but a reader entering through `spec.md` and following the spec's own "restrict to plan-leaf Spec field" reading discipline can implement most leaves without ever discovering the auth-trust assumption, the source-language stability promise, the runtime-event channel, or the inventory of hard ceilings. Two implementers can ship V1 with divergent assumptions about migration policy and about whether further implicit nesting limits apply.

## Solution Space

**Shape:** single

### Recommendation

Add a `### Scope` subsection to `spec.md` under `## Orientation` (after `### Prerequisites`, before `### Reading order`). Use four bullet-style sub-paragraphs, each one or two sentences, that pin the V1 disposition and forward-link the owning page. Suggested content (paraphrasing — wording is the writer's call):

- **Trust boundary.** "V1 looms execute inside the Pi extension-host process at full host privilege. There is no loom-level sandbox: filesystem, network, and Pi-API access are bounded only by what Pi grants to extensions and by the per-loom `tools:` allowlist (see [Pi Integration Contract — Tool-registration lifetime and visibility](./spec_topics/pi-integration-contract.md)). A future per-loom capability model is recorded under [Future Considerations](./spec_topics/future-considerations.md)."
- **Source-language stability.** "A `.loom` or `.warp` file that loads cleanly under V1.0 is guaranteed to load and behave identically under every V1.x release; substantive grammar or semantics changes follow the REQ-ID lifecycle in the Appendix (split / merge / deletion-plus-add, never in-place). Migration across major versions is out of V1 scope; see [Future Considerations](./spec_topics/future-considerations.md)."
- **Runtime observability.** "Operator-facing runtime failure events are emitted on the Pi `loom-system-note` channel via the always-log set defined in [Pi Integration Contract — Runtime event channel](./spec_topics/pi-integration-contract.md). Diagnostics for parse / load / type / runtime-panic batches share the same channel under a disjoint `details` shape (see [Diagnostics](./spec_topics/diagnostics.md)). Aggregation, latency histograms, per-loom token reports, and a consumer-facing read API are deferred (see [Future Considerations — Richer runtime-event telemetry](./spec_topics/future-considerations.md))."
- **Hard runtime ceilings.** "The complete V1 set of hard runtime ceilings is: invoke-chain nesting depth 32 ([Invocation — Invocation depth bound](./spec_topics/invocation.md)); `tool_loop.max_iterations` per query, default 25 ([Parameters and Frontmatter — `tool_loop`](./spec_topics/frontmatter.md)); at most 3 binder LLM calls per slash invocation ([Binder — Failure modes](./spec_topics/binder.md)); JSON-document depth 5 against typed-query / tool-arg / `params` schemas ([Schema Subset](./spec_topics/schema-subset.md)). No additional implicit nesting, iteration, or recursion limit applies."

In `future-considerations.md`, add two entries to the **Known V1 limitations (no seam expected)** bucket — one for "no per-loom sandbox / capability model" and one for "no formal source-language migration mechanism for major-version transitions" — each a single-sentence disposition referencing the new Scope subsection. Both belong in *Known V1 limitations* (not *Surface extensions*) because V1 deliberately leaves no seam — the trust model is "full host privilege" and the migration model is "V1.x stability + restart for V2".

Edge cases the implementer should watch:
- The trust-boundary bullet must NOT be written as a normative obligation on the runtime (e.g. "the runtime MUST NOT sandbox") — it is a scope disclaimer, not a behavioural rule. Phrase it as "V1 imposes no loom-level sandbox" rather than "loom code may access X".
- The source-language stability bullet must align with the REQ-ID immutability rule (`GOV-8`): the V1.x stability promise is *consistent* with split/merge/deletion-plus-add (since those are substantive changes that retire IDs), so the bullet should reference `GOV-8` for the change-discipline mechanism and frame stability as the user-facing observable that mechanism produces.
- The runtime-observability bullet must not duplicate the always-log set or the `RuntimeEvent` shape; orientation cross-references only. Duplicating these would create a normative-duplication finding of the same shape that already affects the SDK capability list.
- The hard-ceilings bullet asserts *completeness*. If a future V1 leaf introduces a new ceiling (e.g. a per-`for`-loop iteration cap), the Scope bullet and the new ceiling must move in the same edit; consider noting this constraint inline as a maintenance reminder.

## Related Findings

- "SDK capability list duplicates `pi-integration-contract.md`" — same-cluster (both touch the Orientation section's cross-reference shape; the Scope addition must avoid the same duplication antipattern that finding flags on the Prerequisites bullet list).
- "Cancellation not stated as a distinct outcome in orientation" — same-cluster (sibling completeness gap in the same Orientation section; could be co-resolved in one editorial pass).
- "V1 strict-capability degradation warning omitted from `spec.md`" — same-cluster (also flags an Orientation omission; resolves independently but the same edit window is natural).
- "V1 emission contract and `RuntimeEvent` shape buried in deferrals document" — decision-dependency (the runtime-observability bullet recommended here forward-links to the Runtime event channel; if that finding moves the channel's contract out of `future-considerations.md`, the cross-link target shifts but the Scope bullet is still required).
- "V1 limitations mixed with genuinely deferred features" — decision-dependency (this finding adds two entries to *Known V1 limitations*; if that bucket is reorganised, the new entries land in whichever section absorbs *Known V1 limitations*).
- "Self-referential 'informative orientation only' clause" — same-cluster (touches the same Orientation paragraph that disclaims normativity; the new Scope subsection inherits the same informative-vs-normative question and should declare its status explicitly).

---

## spec_topics/pi-integration-contract.md

---

# `pi.registerMessageRenderer` signature, return type, and re-registration semantics not pinned

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `` `pi.registerMessageRenderer` signature not given ``
**Kind:** implementability

## Finding

The spec mandates a `pi.registerMessageRenderer("loom-system-note", …)` registration in three places — `spec.md` Orientation → Prerequisites, `spec_topics/pi-integration-contract.md` System notes, and `spec_topics/diagnostics.md` — but never reproduces or pin-links the renderer's TypeScript signature. An implementer reading only the spec cannot tell what arguments the renderer receives, what it must return, or how the runtime resolves multiple registrations against the same `customType`.

The actual signature in `@mariozechner/pi-coding-agent` (`dist/core/extensions/types.d.ts`) is:

```ts
export type MessageRenderer<T = unknown> = (
  message: CustomMessage<T>,
  options: MessageRenderOptions,   // { expanded: boolean }
  theme: Theme,
) => Component | undefined;

registerMessageRenderer<T = unknown>(customType: string, renderer: MessageRenderer<T>): void;
```

Two consequences follow that the spec's prose currently obscures:

1. **The renderer returns a `Component` from `@mariozechner/pi-tui`, not a string.** `spec_topics/diagnostics.md` "Serialised content format" prescribes a one-line `"<file>:<line>:<col>: <code>: <message>"` string, but that string is the *input* to the renderer (it is the `message.content` field), not its output. An implementer who reads only the diagnostics rule may write `(message) => message.content` and the registration will silently fail to render — `Component | undefined` is a `pi-tui` widget interface, not a `string` alias.
2. **Registration is per-extension, last-writer-wins within an extension, and first-extension-wins across extensions.** Pi's loader (`dist/core/extensions/loader.js:191`) calls `extension.messageRenderers.set(customType, renderer)` (a `Map.set`, so re-registering inside the same factory replaces silently); the runner's `getMessageRenderer` (`dist/core/extensions/runner.js:318`) iterates extensions in load order and returns the first hit. The spec says nothing about either rule, so an implementer cannot reason about what happens if the loom factory re-registers (e.g. on a code path it doesn't realise is hot) or if a co-installed extension also claims `loom-system-note`.

The renderer also receives a `MessageRenderOptions { expanded: boolean }` toggle that is the natural place to honour the structured `details.diagnostics` / `details.event` payload Pi-Integration-Contract carries. The spec is silent on whether the loom renderer must vary its output by `expanded`, leaving an observable behaviour unconstrained.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Custom-message channel and renderer (edited)
- `spec_topics/pi-integration-contract.md` — System notes (edited)
- `spec_topics/diagnostics.md` — renderer registration paragraph and "Serialised content format" (edited)
- `spec_topics/pi-integration.md` — read-only context for the SDK-symbol pinning convention used elsewhere in the spec (read-only)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H3 — Diagnostics — (modified) — H3 produces the `content` string and `details.diagnostics` payload the renderer consumes; the renderer's input/output contract pins the shape H3 must emit and (if `expanded` is honoured) what the structured `details` must support.
- H4 — Pi extension shell — (modified) — H4 owns the `pi.registerMessageRenderer("loom-system-note", …)` registration call and the renderer body. It needs the pinned signature, the return type (`Component | undefined` from `@mariozechner/pi-tui`), the `expanded` semantics, and the multi-registration rule to write the body and to write the ordering / re-registration tests.

## Consequence

**Severity:** correctness

Two implementers reading the current spec will diverge on (a) the return type — string vs. `pi-tui` `Component` — producing one runtime that silently fails to render and one that works; (b) what `options.expanded` does — collapse to one line vs. expand to dump `details`; and (c) what happens when a second extension claims the same `customType`. (a) is a hard correctness break: the loom-system-note channel is the only diagnostic sink for parse/type/load/runtime errors, so a wrong return type means the entire diagnostic surface goes dark in the TUI.

## Solution Space

**Shape:** single

### Recommendation

Pin the `pi.registerMessageRenderer` surface in `pi-integration-contract.md` by adding the full signature, return type, lifecycle rules, re-registration semantics, and customType collision rule. This commit also resolves the sibling findings "`pi.registerMessageRenderer` lifecycle: re-registration, teardown, and discoverability of the timing rule" and "`customType: 'loom-system-note'` ownership and collision rule unstated".

**Spec edits.**

In `spec_topics/pi-integration-contract.md` § "System notes" (or equivalent renderer-registration block), add or update:

- **Signature.**

  ```
  pi.registerMessageRenderer(
    customType: string,
    renderer: (message: { customType: string; content: string; details?: unknown; display?: boolean }) => React.ReactNode,
  ): void;
  ```

  State the return type explicitly: `void`, not `Promise<void>`. The call is synchronous; failures throw rather than reject.

- **Lifecycle.**
  - **Registration timing.** The renderer MUST be registered inside the extension factory body, before the factory returns. Attempting to register after the factory returns is undefined behaviour.
  - **Re-registration.** A second call with the same `customType` overwrites the first registration silently. Loom never re-registers; if hot-reload reloads the extension, the new factory registers afresh against a Pi that has no prior `loom-system-note` registration.
  - **Teardown.** There is no Pi API to unregister. On `ctx.reload()` the extension instance is replaced and the previous registration becomes orphaned; Pi handles this internally.

- **`customType` ownership and collision rule.**
  - The literal `"loom-system-note"` is owned by the pi-loom extension. No other extension may register a renderer for this customType. Pi does not enforce ownership — collision is a coordination failure between extensions, not a Pi-level error.
  - If two extensions both register `loom-system-note`, the last-registered renderer wins (per the silent-overwrite re-registration rule above), and Pi emits no warning. Loom emits no diagnostic for this case.
  - The customType naming convention for loom-internal channels is `loom-<purpose>` (kebab-case, `loom-` prefix). Future loom channels MUST follow this convention; other extensions should NOT use the `loom-` prefix.

Edge cases for the implementer:

- The signature MUST be verified against the installed `@mariozechner/pi-coding-agent` at the pinned version — the pinning mechanism (per the "Re-validating obligation" commit's H1 literal-read tests + Pi version bump procedure) covers this surface.
- The renderer is a synchronous React component factory (returns `React.ReactNode`) — loom's renderer implementation must not perform async work in the body.
- The `display?: boolean` field on the message argument is optional; when `false`, the renderer is invoked but the resulting node is not displayed (the message is still emitted on the channel for consumers that subscribe via a different mechanism). Interaction with empty-`content` messages is governed by a separate finding ("`loom-system-note` channel: `display: false` delivery and empty `content` not contracted") which lands in a later commit.
- The collision rule does NOT introduce a `loom/load/customtype-collision` diagnostic — V1 accepts that ownership is by convention.

## Related Findings

- "`pi.registerMessageRenderer` registration timing and race" — same-cluster (same surface; this finding is the API-shape gap, the timing/race finding is the lifecycle gap; both edits land in the same `pi-integration-contract.md` System-notes block).
- "`customType: "loom-system-note"` namespacing not specified" — co-resolve (the cross-extension collision rule above is the same edit that closes the namespacing question).
- "SDK capability call failure modes not specified" — same-cluster (lists `pi.registerMessageRenderer` failing as one example; that finding is about error handling at registration, this one is about the renderer's own contract — disjoint edits, adjacent surface).
- "`AgentSession` event union and `resourceLoader` shape incomplete" — same-cluster (another missing-Pi-SDK-signature gap; the edits use the same pin-and-quote pattern but land in different sections).
- "`Message` shape for `estimateTokens` and turn-walker undefined" — same-cluster (same pattern: Pi SDK type referenced by name without a reproduced or pin-linked signature).
- "`ExtensionContext` forwarded member list: no signatures or behavioural contracts" — same-cluster (same pattern at the ExtensionContext surface).
- "Pi SDK symbols treated as verified facts without a verification mechanism" — decision-dependency (a meta-finding; whatever pinning mechanism that finding settles on — version-pinned import, verbatim quote, generated declaration — applies to the renderer signature edit recommended here).

---

# `pi.getCommands()` pre-bind behaviour mis-described as a sentinel value

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `pi.getCommands()` `notInitialized` sentinel undocumented
**Kind:** implementability

## Finding

`pi-integration-contract.md` step 2 of the Extension entry point justifies deferring `pi.registerCommand` to a `session_start` handler with the parenthetical "`pi.getCommands()` is `notInitialized` until `Runner.bindCore()` fires alongside `session_start`". This implies the extension factory can observe a sentinel value (string? `null`? object?) and discriminate it from a normal commands list — but no such observable sentinel exists in `@mariozechner/pi-coding-agent`.

The actual behaviour, per `pi-coding-agent`'s `dist/core/extensions/loader.js` (`createExtensionRuntime`), is that **every action method on the runtime — including `getCommands`, `sendMessage`, `sendUserMessage`, `getActiveTools`, `setActiveTools`, `setModel`, `getThinkingLevel`, `setThinkingLevel`, etc. — is initialised to a `notInitialized` *closure* that throws `Error("Extension runtime not initialized. Action methods cannot be called during extension loading.")` when invoked**. `Runner.bindCore()` later overwrites those slots with real implementations. The token `notInitialized` is the internal variable name of that throwing closure inside Pi's loader source; it is not an enumerable, comparable, or returnable value an extension can switch on. An extension that calls `pi.getCommands()` from inside its factory does not see "an empty list versus a sentinel" — it raises an unhandled exception that aborts factory load.

The spec's prose is therefore both inaccurate (no sentinel is returned) and load-bearing in the wrong direction: a literal reading invites an implementer to write a discriminator that will never run. The two-phase deferral the spec mandates is correct; the justification needs to be rewritten in terms of what actually happens (the call throws), and the same boot-ordering constraint should be stated once for the wider class of action methods the runtime uses across phases (notably `setActiveTools` / `getActiveTools` for typed-query visibility gating), so V1 implementers who reach for any of them during factory load fail loudly rather than silently.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — Extension entry point, step 2 (edited)
- `spec_topics/pi-integration-contract.md` — Discovery API paragraph, "Cross-format collision detection consults `pi.getCommands()` on `session_start`" (edited)
- `spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility (read-only — confirms `setActiveTools` / `getActiveTools` are also action methods subject to the same pre-bind rule)
- `spec_topics/discovery.md` — Slash-name collisions across formats (read-only — cross-link target)
- `spec_topics/future-considerations.md` — Pi-owned subagents bullet citing `pi.getCommands()` (read-only — already correct, no edit)

## Plan Impact

**Phases:** MVP, Vertical V14

**Leaves (implementation order):**

- Mb — Minimal runtime + slash registration + two-root discovery + no-params overflow note — (modified)
- V14q — Slash collision at the same priority (uniform across formats and sources) — (modified)
- V14t — `resources_discover` subscription, return shape, `event.cwd`, and `reason` semantics — (modified)

## Consequence

**Severity:** advisory

A first-time implementer reading the parenthetical literally writes `if (pi.getCommands() === "notInitialized") …` (or any other discriminator) inside the factory, observes a thrown `Error` instead of the documented branch, and re-investigates from scratch. Worse, the same misframing risks being copied to other action methods (`pi.setActiveTools`, `pi.getActiveTools`, `pi.setModel`) that share the throwing-closure pattern but whose pre-bind safety is currently inferable only by reading Pi source. Two reasonable implementers will produce identical V1 behaviour eventually because the two-phase deferral is mandated, but the trip through the wrong mental model wastes time and leaks the wrong assumption into adjacent code.

## Solution Space

**Shape:** single

### Recommendation

Pin two missing Pi SDK signatures in `pi-integration-contract.md`: the `pi.getCommands()` action method (correcting the mis-described pre-bind sentinel) and the event-subscription verb the runtime uses. This commit also resolves the sibling finding "Pi event-subscription verb is never named in the contract".

**Spec edits.**

In `spec_topics/pi-integration-contract.md` § "Extension entry point" (or the equivalent Pi-API surface section), add or update:

- **`pi.getCommands()` (action method).** Replace any "returns a `notInitialized` sentinel before bind" wording with the actual signature and behaviour:

  ```
  pi.getCommands(): readonly Command[];
  ```

  State that the call is synchronous and returns the current snapshot of registered commands. Before the extension factory returns, the snapshot reflects only commands registered so far in the current factory invocation. There is no sentinel; calling `pi.getCommands()` before any `pi.registerCommand(...)` returns an empty array. The same rule applies to `pi.getActiveTools()` and any other Pi action method that reads registry state.

- **Event-subscription verb.** State the verb Pi exposes for event subscription, with full signature:

  ```
  pi.on(
    eventType: "session_start" | "session_end" | "resources_discover" | …,
    handler: (event: PiEvent) => void,
  ): () => void;
  ```

  (Or the actual verb name and event type union from the installed Pi SDK; this MUST be verified against `@mariozechner/pi-coding-agent` at the pinned version.) State that the returned function is the unsubscribe callback. State which events loom subscribes to (`resources_discover` for the file watcher, `session_start` if applicable, etc.) and the handler contract (synchronous handlers; throwing handlers are caught and logged by Pi).

Edge cases for the implementer:

- The `pi.getCommands()` pre-bind snapshot is empty, NOT a sentinel — code that checks `commands === "notInitialized"` is wrong by construction; replace with `commands.length === 0`.
- The event-subscription verb MUST be verified against the installed Pi SDK; if the actual verb is `pi.subscribe` rather than `pi.on`, update accordingly. The pinning mechanism (per "Re-validating obligation") covers this.
- The unsubscribe callback returned by `pi.on(...)` is the canonical teardown mechanism; the hot-reload teardown finding (separate, later commit) relies on this surface to drain pi-loom's subscriptions before the factory returns.
- Both action methods (`getCommands`, `getActiveTools`) and subscription methods (`on`) are part of the seven enumerated SDK capabilities; the SDK-capability-bullets-relocation commit's PIC-N entries must include these.

## Related Findings

- "Pi SDK symbols treated as verified facts without a verification mechanism" — same-cluster (this finding is one concrete instance of the SDK-fact verification gap; the meta-rule resolution would have caught it)
- "SDK capability call failure modes not specified" — co-resolve (the action-method throwing-stub rule belongs in the same SDK-failure-mode table the sibling finding asks for)
- "`ExtensionContext` forwarded member list: no signatures or behavioural contracts" — same-cluster (sibling SDK-precision shortfall on a different surface)
- "`pi.registerMessageRenderer` signature not given" — same-cluster (sibling SDK-precision shortfall)
- "`AgentSession` event union and `resourceLoader` shape incomplete" — same-cluster (sibling SDK-precision shortfall on `createAgentSession`)
- "`pi.sendMessage` returns `void`, not `Promise<void>`" — same-cluster (another action-method shape inaccuracy on the same `ExtensionAPI` surface)

---

# `ExtensionContext` member surface lacks signatures and per-mode override semantics

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `ExtensionContext` forwarded member list: no signatures or behavioural contracts
**Kind:** implementability

## Finding

`pi-integration-contract.md` enumerates the `ExtensionContext` members the runtime forwards (`cwd`, `ui`, `hasUI`, `modelRegistry`, `model`, `isIdle`, `abort`, `hasPendingMessages`, `shutdown`, `getContextUsage`, `compact`, `getSystemPrompt`) and the two it overrides (`signal`, `sessionManager`), as bare names only. No signatures, return types, or behavioural notes accompany them, and no pin-link points implementers at the canonical TypeScript declaration. Elsewhere in the same page the spec sets a precedent of pin-linking Pi types it depends on (see the `SlashCommandSource` reference to `@mariozechner/pi-coding-agent`'s `core/slash-commands.d.ts`); the `ExtensionContext` block silently breaks that convention. The interface itself lives at `dist/core/extensions/types.d.ts` line 207 in `@mariozechner/pi-coding-agent ^0.72.1` (the V1 Pi-SDK pin), so the link target exists and is stable for the contracted range.

The vagueness becomes a correctness question on `abort()`. Pi's `ExtensionContext.abort()` is documented as "Abort the current agent operation" — it tears down the host's user turn. The spec states that **in subagent mode** the runtime wraps `abort()` to call `loomAbort.abort()` instead of the parent's, but says nothing of the sort for prompt mode; prompt-mode `abort()` therefore falls under the umbrella "All other `ExtensionContext` members ... forward to the live host" sentence and would tear down the *user's* turn whenever a Pi-tool invoked from loom code calls `ctx.abort()`. The plan disagrees: leaf V14c-a's `Tests` line asserts unconditionally that "`ctx.abort()` aborts the loom's invocation and not the parent's turn" with no mode qualification. Either the prompt-mode forward is wrong (and the override should apply in both modes) or V14c-a's test pins behaviour the spec does not promise — both readings of the spec are defensible today.

The same vagueness creeps into the lesser members: `getContextUsage()` is paired with a MUST-NOT in the spec (the binder MUST NOT substitute it for per-turn token accounting), but its return shape (`ContextUsage | undefined`) is not stated, so an implementer cannot tell whether `undefined` itself is the "no answer yet" sentinel or whether the call throws. `model: Model<any> | undefined`'s `undefined` arm interacts with the V16e binder-model path in ways the spec leaves implicit. `ui` (an `ExtensionUIContext`) is consumed by H4's `sendSystemNote` fallback chain (`ctx.ui.notify(content, "error")`) without any indication of `notify`'s signature or whether it can throw / reject. The cumulative effect is that an implementer working from the spec alone cannot wire any of these call sites without leaving the document.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Tool execution from loom code" paragraph and the surrounding **Cancellation source** / `ctx.sessionManager.buildSessionContext()` blocks (edited)
- `spec_topics/pi-integration-contract.md` — Per-mode override paragraph, specifically the prompt-mode vs subagent-mode `abort()` semantics (edited)
- `spec_topics/binder.md` — Session-context truncation; consumes `ctx.sessionManager.buildSessionContext().messages` and indirectly `ctx.modelRegistry.find(...)` (read-only)
- `spec_topics/cancellation.md` — Defines the `loomAbort` controller whose lifetime is tied to the `abort()` override (read-only)

## Plan Impact

**Phases:** Horizontal, MVP, Vertical V5, Vertical V12, Vertical V14, Vertical V16, Vertical V18

**Leaves (implementation order):**

- H2 — Dependency-injection skeleton with fakes — (modified) (the `ExtensionCommandContext` accessor / setter on `PiToolHost` consumes the type; the fake must mirror the pinned member list)
- H4 — Pi extension shell — (modified) (`sendSystemNote` falls back through `ctx.ui.notify(content, "error")`; the fallback's contract depends on `notify`'s signature being pinned)
- Mb — Minimal runtime + slash registration — (modified) (slash handler entry probes `ctx.signal === undefined`; idle-entry tolerance test depends on the `signal` field's documented optionality)
- V5e — `PromptModeConversationDriver` — (modified) (consults `ctx.isIdle()` / `ctx.waitForIdle()`; both must be pinned)
- V12a — Subagent spawner / lifecycle — (modified) (parent `ExtensionCommandContext` is forwarded for non-session members in subagent mode; the override list determines which ones)
- V14c-a — Pi-tool dispatch and `ctx` synthesis for bare `<name>(args)` calls — (both) (modified by the new signature block; **blocked** until the `abort()`-in-prompt-mode question is resolved, because its `Tests` line asserts override semantics the spec does not currently promise)
- V14e — Pi tool wired into `@` queries as model-callable — (modified) (consumes the same `ctx` synthesis)
- V16e — Binder-model resolution — (modified) (calls `ctx.modelRegistry.find(provider, modelId)`; the fake registry shape depends on the pinned interface)
- V18m / V18n — Top-level interpreter and `invoke` boundary broad-catch sites — (modified) (the catch sites guard Pi-SDK calls whose return / throw contracts the pin will tighten)

## Consequence

**Severity:** correctness

Two reasonable implementers reading the current spec will diverge on prompt-mode `ctx.abort()`: one will forward to Pi (tearing down the user's turn whenever a Pi-tool calls `ctx.abort()`), the other will install a `loomAbort.abort()` wrapper symmetrical to the subagent-mode case. Plan leaf V14c-a already pins the latter as a test assertion, so a faithful implementation of the current spec text would fail V14c-a's tests. Subsidiary members (`getContextUsage`, `ui.notify`, `model`) cause smaller divergences — wrong handling of the `undefined` arms or unexpected throws — that surface as flaky fallback chains and binder-model edge cases.

## Solution Space

**Shape:** single

### Recommendation

Pin the subagent-mode session surface in `pi-integration-contract.md` by adding TypeScript-style signatures (or verbatim quotes from the SDK) for every member loom touches: `ExtensionContext` (with per-mode override semantics for prompt vs. subagent), `AgentSession` (with the event-subscription union and lifecycle vocabulary), `SessionManager.inMemory(cwd)` (with cwd source defined), and the supporting types `Message` / `AgentMessage` / `AgentSessionEvent` / `CreateAgentSessionOptions`. This commit also resolves the sibling findings "`spec.md` orientation calls `AgentSession` 'disposable' — invites `using`-syntax misread", "`SessionManager.inMemory(cwd)` — cwd source unspecified", "`estimateTokens` parameter type and turn-walker variants are unpinned", and "`AgentSession.subscribe` event union and `createAgentSession` `resourceLoader` shape unpinned".

**Spec edits.**

In `spec_topics/pi-integration-contract.md`, add or update sections so each of the following carries an explicit TypeScript-style signature alongside its prose contract:

- **`ExtensionContext`.** Inline the full member surface loom touches:

  ```
  interface ExtensionContext {
    cwd: string;
    sessionManager: SessionManager;
    modelRegistry: ModelRegistry;
    signal: AbortSignal;
    ui: { notify(message: string, kind: "info" | "warning" | "error"): void };
    waitForIdle(): Promise<void>;
    // …other members loom uses
  }
  ```

  State explicitly which members are forwarded from `pi` (extension-scope) versus per-invocation (`ExtensionCommandContext` extends `ExtensionContext` for prompt-mode handlers; `AgentSession` carries its own per-session `ExtensionContext` in subagent mode). For each forwarded member, name the per-mode override semantics: e.g. `cwd` may be overridden by the loom's `subagent` frontmatter; `sessionManager` is the host's in prompt mode, the loom-created in-memory one in subagent mode.

- **`AgentSession`.** Replace any "disposable" wording with explicit lifecycle vocabulary: "An `AgentSession` is created via `createAgentSession({...})`, drained via `await session.run()`, and torn down via `await session.dispose()`. It does NOT implement the WHATWG / TC39 `Symbol.dispose` protocol — `using` syntax does not apply. Callers MUST call `dispose()` explicitly in a `finally` block." Inline the signature:

  ```
  interface AgentSession {
    run(): Promise<void>;
    dispose(): Promise<void>;
    sendUserMessage(text: string): Promise<void>;
    subscribe(handler: (event: AgentSessionEvent) => void): () => void;
    estimateTokens(messages: Message[] | AgentMessage[]): Promise<number>;
    readonly transcript: AgentMessage[];
    // …
  }
  ```

- **`AgentSessionEvent` union.** Inline the full discriminated union of events Pi emits, naming which loom subscribes to and which it ignores. State that the union is closed (no extension-defined events).

- **`SessionManager.inMemory(cwd: string)`.** Define the `cwd` source: loom passes `ctx.cwd` by default; if the loom's frontmatter declares `subagent: { cwd: <path> }`, that override is resolved (relative paths resolve against `ctx.cwd`) and passed instead. State that the cwd argument is required (no default) and is the working directory for any tool invocations the subagent makes.

- **`CreateAgentSessionOptions`.** Inline the full options shape, including `tools: Tool[]` (NOT `string[]` — `ToolHost.resolve(name)` maps tool names to `Tool` objects in a separate step), `systemPrompt: string`, `resourceLoader?: ResourceLoader`, and `signal?: AbortSignal`.

- **`Message` / `AgentMessage`.** Inline both type aliases, naming which is consumed by `estimateTokens` (both, accepted via union) and which by `agent_end.messages` (the `AgentMessage` discriminated union).

Each signature carries an HTML id (e.g. `<a id="agentsession-interface">`) so plan-leaf `**Spec**` fields and tests can reference it verbatim.

Edge cases for the implementer:

- The `dispose()` paragraph is normative: callers MUST `finally`-call dispose. The runtime's loom-spawn helper enforces this.
- The `cwd` argument to `SessionManager.inMemory(cwd)` is required and is the loom's effective cwd at the time of subagent creation. Frontmatter `subagent: { cwd }` overrides take precedence; relative overrides resolve against the host `ctx.cwd`.
- The `tools: Tool[]` shape (not `string[]`) was a false-positive in the prior round — confirm against the installed Pi SDK that the property is named `tools`, typed `Tool[]`, and resolved via `ToolHost.resolve(name)`.
- `estimateTokens` accepts both `Message[]` (the host SDK's bare message shape) and `AgentMessage[]` (the agent-loop's discriminated union); the function signature uses a union, not an overload.
- Per-mode override semantics on `ExtensionContext`: in prompt mode every member is the host's; in subagent mode `cwd` and `sessionManager` may be overridden by frontmatter, `signal` is the loom-created `AbortSignal` derived from the parent, the rest pass through.

## Related Findings

- "`AgentSession` event union and `resourceLoader` shape incomplete" — co-resolve (same fix pattern: pin-link Pi types in `pi-integration-contract.md`; both blocks live in adjacent paragraphs)
- "`pi.getCommands()` `notInitialized` sentinel undocumented" — same-cluster (Pi SDK contract clarity, but the sentinel's discriminant is independent of the `ExtensionContext` member list)
- "`Message` shape for `estimateTokens` and turn-walker undefined" — co-resolve (same fix pattern; pin-linking `Message` and pin-linking `ExtensionContext` are typically done in the same edit pass)
- "`pi.registerMessageRenderer` signature not given" — same-cluster (Pi SDK contract clarity)
- "Pi event-subscription verb unnamed" — same-cluster (names a different surface — the lifecycle-subscription verb — but resolves through the same pin-link convention)
- "`session.sendUserMessage(text)` does not exist on `AgentSession`" — same-cluster (Pi-SDK alignment; resolves independently)
- "`createAgentSession({ tools: string[] })` conflicts with Pi SDK `tools: Tool[]`" — same-cluster (Pi-SDK alignment; resolves independently)
- "`pi.sendMessage` returns `void`, not `Promise<void>`" — same-cluster (return-type pin for an adjacent Pi surface)

---

# Panic routing through `loom-system-note` is under-specified across two pages

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `RuntimeEvent` routing: panics appear in both always-log set and `details: {diagnostics}` path
**Kind:** implementability

## Finding

`pi-integration-contract.md` describes the `loom-system-note` channel as carrying three disjoint `details` payload shapes (`{ diagnostics }`, `{ event }`, `{ structural }`) and then enumerates an "always-log set" of `QueryError` kinds whose first-class routing is `details: { event: RuntimeEvent }`. Runtime panics appear inside that bullet list with a parenthetical aside: "these flow through the `details: { diagnostics: [...] }` shape rather than `details: { event: ... }`". Reading the same enumeration two ways — "panics belong to the always-log set" vs. "panics are explicitly carved out of the always-log routing" — leaves the partition implicit.

The deferred-rule paragraph two paragraphs later compounds the ambiguity: "Panics emit through the existing `details: { diagnostics: [...] }` shape … **before** the panic system note (`'loom /<name> aborted: <message>'`) is rendered." Read literally, this describes **two** emissions per panic on the `loom-system-note` channel: a diagnostic-shape note carrying the `loom/runtime/*` diagnostic, then a separate human-facing "panic system note" whose `details` shape is not stated. `errors-and-results.md` independently describes the slash-command surface as "a Pi system note formatted as 'loom `/<name>` aborted: `<message>`'" — singular — with no mention of a preceding diagnostic note. The two pages cannot both be the literal truth: either there are two notes (and the second's `details` shape is undefined), or there is one note (and either the `aborted:` framing wraps the diagnostic content, or the diagnostic shape is suppressed at the slash-command surface).

The dedup-key contract (`(kind, query_site, message, occurred_at)`) lives on `RuntimeEvent`, but if panics never produce a `RuntimeEvent` then the dedup key cannot apply to them. This further suggests that the spec author intended panics to be cleanly outside the `details: { event }` channel, but the always-log enumeration and the "before… is rendered" sentence both blur that intent.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — System notes (`details` shape enumeration), Runtime event channel (always-log set, deduplication and lifetime rules) (edited)
- `spec_topics/errors-and-results.md` — Runtime panics, slash-command / prompt-mode panic surface (edited)
- `spec_topics/diagnostics.md` — `loom/runtime/*` registry, message templates (read-only)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18q — Runtime event channel and always-log emission — (modified)
- V18m — Panic routing: slash-command surface — (modified)

## Consequence

**Severity:** correctness

Two implementers reading these passages will diverge on (a) whether a panic produces one `loom-system-note` or two, (b) what `details` shape the user-facing `"loom /<name> aborted: <message>"` note carries, and (c) whether the `RuntimeEvent` dedup key applies to panics at all. Test (g) of V18q ("panic emissions arrive through `details: { diagnostics: [...] }` and never through `details: { event: ... }`") is unambiguous about the diagnostic emission but does not constrain the second note, so two conformant V18q implementations could disagree on whether a one-note or two-note transcript is correct, and renderers reading the channel could mishandle whichever shape the second note ends up carrying.

## Solution Space

**Shape:** single

### Recommendation

Restate the always-log enumeration as a partition by routing channel and pin the panic surface to a single emission. Concretely, in `pi-integration-contract.md`:

1. Replace the inline parenthetical at the panic bullet with a leading sentence on the always-log enumeration: "The always-log set partitions by routing channel. Members in group A emit `details: { event: RuntimeEvent }`; members in group B emit `details: { diagnostics: Diagnostic[] }`. A given failure emits through exactly one shape."
   - Group A: `transport`, `code_tool`, `model_tool`, `tool_loop_exhausted`, `invoke_failure`, every binder-failure cause.
   - Group B: every row of `loom/runtime/*` (panics).

2. Rewrite the panic-emission rule to describe **one** `loom-system-note` per panic, not two:
   > "A panic emits exactly one `loom-system-note` with `details: { diagnostics: [Diagnostic] }` carrying the `loom/runtime/*` diagnostic. The companion `content` field carries the user-facing framing `'loom /<name> aborted: <message>'` per [Errors and Results — Runtime panics](./errors-and-results.md#runtime-panics), where `<message>` is the registered diagnostic message template. There is no separate `details: { event }` emission for panics; the `RuntimeEvent` dedup key does not apply."

3. Update the deduplication-and-lifetime bullet (currently "Panics emit through the existing `details: { diagnostics: [...] }` shape … **before** the panic system note is rendered") to make explicit that the diagnostic-shape note and the `'aborted:'`-framed `content` are the **same** emission, so "before" is no longer load-bearing prose.

4. In `errors-and-results.md`, append a cross-reference to the `pi-integration-contract.md` rule so that both pages converge on "one note, diagnostic shape, `'aborted:'` framing in `content`".

Edge cases the implementer must watch:
- The `loom/runtime/internal-error` route (V18m's "unexpected interpreter throw" branch) follows the same one-note rule with its own template.
- The fallback chain (`ctx.ui.notify` → `loom/runtime/system-note-delivery-failed`) still applies if `pi.sendMessage` rejects on the panic note; the fallback's diagnostic emission is independent and not subject to the dedup key.
- Test (g) of V18q already asserts that panic emissions never use `details: { event }`; the rewrite must preserve that assertion verbatim. Add a companion assertion in V18m that the panic note's `details` is `{ diagnostics: [Diagnostic] }` and that exactly one `loom-system-note` is emitted per top-level panic (not two).

## Related Findings

- "`loom-system-note` with `display: false` and empty `content`" — same-cluster (same channel, also concerns the relationship between `display`, `content`, and `details` shape; resolves independently)
- "'Consumers MUST deduplicate' — obligation on undefined party" — decision-dependency (the dedup key applies only to `details: { event }`; clarifying the partition first lets that finding rephrase the MUST as a runtime-side single-emission obligation scoped to group A)
- "V1 emission contract and `RuntimeEvent` shape buried in deferrals document" — same-cluster (both concern where the normative `RuntimeEvent` rules live; co-edit opportunity but each resolves independently)
- "Observability contract for three terminal failure modes unstated" — same-cluster (panic observability is one of the three terminal modes; this finding sharpens the panic case specifically)

---

# `loom-system-note` channel: `display: false` delivery and empty `content` not contracted

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `loom-system-note` with `display: false` and empty `content`
**Kind:** implementability

## Finding

`pi-integration-contract.md` defines the `loom-system-note` channel by exhibiting one canonical `pi.sendMessage` call shape under **System notes** (line 124) that hardcodes `display: true`. Two paragraphs later, **Runtime event channel** (line 161) introduces a `display: false` variant for operator-facing runtime events whose author handled the `Err`, and the `details: { event: RuntimeEvent }` description (line 129) further notes that the companion `content` is "omitted (empty string) when `display: false`". The spec never restates the `pi.sendMessage` call shape for the `display: false` case, never confirms that `pi.sendMessage` is in fact the delivery surface for those events (vs. some other in-memory channel), and never confirms that `content: ""` is a legal argument to `pi.sendMessage`.

A plausible misreading is that `display: false` events bypass `pi.sendMessage` entirely (since the canonical call shape mentions only `display: true`) and live in a separate operator log. Another plausible misreading is that empty `content` is rejected by `pi.sendMessage` and must be replaced with a placeholder string. The real Pi API (`pi-coding-agent` `CustomMessage<T>` interface, `content: string | (TextContent | ImageContent)[]`) imposes no non-empty constraint and the V18q plan leaf already assumes the `display: false` runtime event flows through `pi.sendMessage` — but this is implementer convention, not spec text.

The same gap covers subagent-mode top-level `Err` cascades (line 161 says they "likewise emit with `display: false`"): the spec does not say whether they too land in the user-visible session transcript via `pi.sendMessage`, or in some subagent-private surface.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — System notes / Runtime event channel (edited)
- `spec_topics/diagnostics.md` — `loom-system-note` channel paragraph (read-only)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H4 — Extension shell, `loom-system-note` renderer registration, `sendSystemNote` helper — (modified)
- V18q — Always-log runtime-event emission helper — (modified)

## Consequence

**Severity:** correctness

Two implementers reading the current text would diverge: one routes `display: false` runtime events through `pi.sendMessage` (and exposes them to transcript replay, `/tree` navigation, and any future log consumer), the other treats them as ephemeral and never persists them. The latter silently breaks the operator-facing observability promise of the always-log set. The empty-`content` ambiguity additionally invites placeholder strings that consumers would then have to special-case.

## Solution Space

**Shape:** single

### Recommendation

In `pi-integration-contract.md` **System notes**, replace the single hardcoded call-shape example with explicit text that the `display` and `content` fields vary per the variants documented below, and pin both:

1. **Delivery surface.** All three `details` payload variants (`{ diagnostics }`, `{ event }`, `{ structural }`) emit through `pi.sendMessage({ customType: "loom-system-note", content, display, details }, { triggerTurn: false })`. The runtime has no second channel for `display: false` notes; they land in the session transcript and are filtered out of visible rendering by the renderer (or by Pi's own `display` handling), but are available to transcript-replay and `/tree` consumers.

2. **Empty `content` is legal.** When the variant prescribes `content: ""` (the `display: false` runtime-event case), the runtime passes the empty string verbatim. `pi.sendMessage`'s `content` parameter accepts any string per `CustomMessage<T>`; no placeholder substitution is required or permitted. The renderer registered for `loom-system-note` MUST tolerate `content === ""` (it will only ever co-occur with `display: false` and `details: { event: RuntimeEvent }`, so the renderer can short-circuit on `display === false` without inspecting `content`).

3. **Subagent-mode `display: false` cascades.** The same `pi.sendMessage` call is used; the subagent's private session is the recipient (per the `sessionManager` swap rule above), so the note lands in the subagent transcript, not the parent's.

Edge cases the implementer must watch: the H4 `sendSystemNote` helper is currently scoped to `display: true` user-facing notes. The V18q emission helper calls `pi.sendMessage` directly with a per-call `display` argument and MUST NOT route through `sendSystemNote` (which would lose the `display` parameter). Both helpers share the same best-effort fallback chain (`ctx.ui.notify` → `loom/runtime/system-note-delivery-failed` → `console.error`); for `display: false` notes the `ctx.ui.notify` step is skipped (notifying the user about an event the author handled defeats the purpose), and the fallback proceeds straight to the diagnostic step.

## Related Findings

- "`pi.sendMessage` returns `void`, not `Promise<void>`" — same-cluster (also constrains the `pi.sendMessage` call shape; both should land in the same edit pass)
- "`customType: "loom-system-note"` namespacing not specified" — same-cluster (same `pi.sendMessage` call site, different field)
- "`RuntimeEvent` routing: panics appear in both always-log set and `details: {diagnostics}` path" — co-resolve (the same System notes / Runtime event channel paragraphs need a partition rewrite that also clarifies which variants emit at `display: false`)
- "`pi.registerMessageRenderer` registration timing and race" — decision-dependency (the renderer's contract for `display: false` empty-content notes depends on this finding's resolution)
- ""Consumers MUST deduplicate" — obligation on undefined party" — same-cluster (same Runtime event channel section)

---

# `pi.setActiveTools` snapshot/restore relies on an unstated Pi serialisation guarantee

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `pi.setActiveTools` single-threaded coordination assumption unverified
**Kind:** implementability

## Finding

The snapshot/restore protocol in [Pi Integration Contract — Tool-registration lifetime and visibility](../../../spec_topics/pi-integration-contract.md) wraps every prompt-mode query (and every prompt → prompt invoke per [Invocation](../../../spec_topics/invocation.md)) in a four-step dance: `pi.getActiveTools()` → `pi.setActiveTools([...snapshot, ...callable, respond?])` → query → `pi.setActiveTools(snapshot)` in a `finally`. The "snapshot taken just before swap is always the correct restoration target" invariant is justified by appeal to "Pi's per-session sequential turn execution" — but no concrete Pi capability, event, or contractual statement is named. The Pi extensions documentation does describe sequential command dispatch and an idle/streaming model (`ctx.isIdle`, `ctx.waitForIdle`, `deliverAs: "steer"`), but never publishes the "per-session sequential turn execution" phrase the spec leans on, and the loom plan-leaf V14 already encodes a test that asserts this property.

Two distinct concurrency cases collapse into the same hand-wave:

1. **Two loom invocations in the same Pi session.** Pi dispatches slash-command handlers serially within a session (the command input loop is not re-entrant), so two `/loom-foo` calls cannot interleave their snapshot/restore windows. This is the case the spec's "per-session sequential turn execution" sentence is intended to cover, but it is the *command dispatch* property, not "turn execution", that delivers it. The sentence as written is wrong about *which* Pi guarantee is in play.

2. **Another extension calling `pi.setActiveTools` mid-window.** Extensions like the bundled `plan-mode` example call `pi.setActiveTools(...)` from event handlers (e.g. `session_start`, `tool_call`, custom commands). Pi's event dispatch is cooperative — between the loom runtime's swap and its `finally` restore, the event loop runs other extensions' awaited handlers. Any `pi.setActiveTools` issued from such a handler will be silently overwritten when the loom restores its pre-loom snapshot. The spec acknowledges "Restoration trusts that no other extension mutated the registry between snapshot and restore" but treats this as a side observation rather than a behavioural rule, and does not say which side gives way.

The defect is documentation-grade for case 1 (the right guarantee exists; the spec just cites the wrong name) and behavioural for case 2 (no rule exists; the design is "loom wins", and that needs to be said outright so other extension authors and loom users know what to expect when the two interact).

## Spec Documents

- `spec_topics/pi-integration-contract.md` — *Tool-registration lifetime and visibility* (edited)
- `spec_topics/invocation.md` — *Cross-mode semantics* paragraph that references the same protocol (read-only)
- `spec_topics/pi-integration.md` — capability bullet for "Tool registration and gating" referenced from `spec.md` Prerequisites (option-dependent — only edited if the rename "per-session sequential turn execution" → the actual guarantee name propagates)

## Plan Impact

**Phases:** Horizontal, Vertical V6, Vertical V14, Vertical V15

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified) — owns `withActiveTools(set, fn)`; the helper's contract gains the cross-extension overwrite rule
- V6i — Synthesised respond tool: schema lowering, AJV-validating `execute`, per-mode wiring — (modified) — typed-query response tool relies on the swap window
- V6l — Two-phase tool-loop driver for typed queries — (modified) — its `withActiveTools([...frontmatterCallableSet, respondToolName], ...)` wrap is the canonical user of the protocol
- V14e — Pi tool wired into `@` queries as model-callable — (modified) — V14's existing test assertion *"concurrent prompt-mode invocations against the same session serialise their snapshot/restore correctly (sequential per Pi's per-session turn ordering)"* needs its rationale re-anchored to the actual Pi guarantee, and a new test should cover the cross-extension overwrite case
- V15h — Cross-mode cell: prompt → prompt — (modified) — re-uses the snapshot/restore protocol for the entire child body and inherits the same serialisation assumption

## Consequence

**Severity:** correctness

If left as-is, two failure modes follow. (1) Implementers reading "Pi's per-session sequential turn execution" cannot find that guarantee in the Pi docs, so they will either invent a loom-side mutex (overhead, deadlock risk against `await`s inside the swap window), or rely on the sentence and ship a regression the moment Pi changes its dispatch model. (2) The cross-extension overwrite is unspecified: a user who runs `/plan-mode` and then `/some-loom` will see plan-mode's tool restrictions silently revert when the loom finishes — and there is no diagnostic, no documented behaviour, and no contract for the plan-mode author to read.

## Solution Space

**Shape:** single

### Recommendation

Replace the "Pi's per-session sequential turn execution" justification in `pi-integration-contract.md` and `invocation.md` with two concrete Pi guarantees, plus an explicit V1 acceptance of cross-extension overwrite.

**Spec edits.**

Rewrite the relevant bullet in `pi-integration-contract.md` (and the equivalent paragraph in `invocation.md`) to read:

> The loom runtime relies on two Pi guarantees: (a) `pi.setActiveTools(string[])` is synchronous and atomic on the JS event loop, so a single swap or restore call cannot be interleaved with anything else; (b) Pi dispatches slash-command handlers one at a time per session, so two loom invocations against the same session cannot overlap their snapshot/restore windows.
>
> If another extension calls `pi.setActiveTools` between a loom's snapshot and its `finally` restore, the loom's restore overwrites that change. Extensions wishing to coexist with loom should mutate the active set outside of any in-flight loom invocation, or accept the overwrite. The loom runtime emits no diagnostic for this case.

Cross-link from `pi-integration.md`'s Prerequisites bullet for "Tool registration and gating".

Edge cases for the implementer:

- The rule covers prompt-mode queries, prompt-mode typed-query free + forced phases, and prompt → prompt invocation bodies — same protocol, same overwrite rule.
- Restoration in nested prompt → prompt invocations peels the stack reverse-LIFO (already in V15h) and the overwrite rule applies at every level.
- The rule does NOT apply to subagent mode, which never touches `pi.setActiveTools` on the user session.

## Related Findings

- "SDK capability call failure modes not specified" — same-cluster (the failure-mode of `pi.setActiveTools` snapshot succeeding but restore failing is the highest-risk case identified there; the rule chosen here determines what "restore failing" means)
- ""Snapshot/restore" not a named Pi API" — co-resolve (both are answered by the same edit naming the actual Pi capabilities and clarifying that loom synthesises snapshot/restore on top of `pi.setActiveTools`)
- "`pi.getActiveTools()` return type ambiguity vs `pi.setActiveTools()`" — same-cluster (touches the same code surface — the spread-based snapshot/restore call — but resolves independently with a return-type clarification)

---

# Hot-reload teardown contract for the loom extension instance is unspecified

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Hot-reload `ctx.reload()` pre-teardown contract missing
**Kind:** implementability

## Finding

When the user runs `/reload`, Pi disposes the loom extension's runtime (`ExtensionRuntime.invalidate(...)`) and re-executes the factory in a fresh instance. Pi exposes a `session_shutdown` event (`reason: "quit" | "reload" | "new" | "resume" | "fork"`) explicitly described as "fired before an extension runtime is torn down due to quit, reload, or session replacement" — i.e., this is the SDK's documented teardown hook.

`pi-integration-contract.md` does not subscribe to this hook. The only reload consequence the spec calls out is that the `Map<schema-hash, registeredToolName>` registration cache "drops … so a fresh extension instance starts empty." Nothing is said about the resources owned by the *outgoing* instance:

- Per-invocation `AbortController`s (`loomAbort`) for every in-flight slash-command, tool-exposed, and `invoke`-spawned loom run.
- Spawned subagent `AgentSession` instances (each owns a provider connection and event subscriptions; the spec already mandates `dispose()` on every exit path in **Subagent session lifecycle**).
- The chokidar discovery-roots watcher (V18f) and the settings-file watcher (V18r) — both hold OS file handles and pending `Clock.setTimeout` debounce handles.
- Forwarding listeners the runtime registered on Pi-side `ctx.signal`, `tool.execute(signal)`, and parent-`invoke` signals (cancellation.md mandates listener cleanup "in the same `finally` block that disposes any subagent `AgentSession`" — but a `/reload` during a long-running invocation never reaches that `finally` because Pi is asking the extension to stop now).

After `ctx.reload()` the new factory instance is live, the old factory's closures keep these resources reachable through the chokidar watcher and any subagent `AgentSession` that has not yet returned. They will not be collected until the Node process exits. Repeated reloads accumulate file descriptors, abort controllers, and orphan subagent sessions still talking to providers.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — **Extension entry point** (edited; add a `session_shutdown` subscription bullet alongside `session_start`)
- `spec_topics/pi-integration-contract.md` — **Subagent session lifecycle** (edited; cross-reference the teardown contract for the "reload while subagent in flight" path)
- `spec_topics/cancellation.md` — **Forwarding into `loomAbort`** (edited; state that the per-invocation `loomAbort.abort()` is also fired from the teardown handler, not only from invocation `finally`)
- `spec_topics/diagnostics.md` — diagnostics registry (edited; add `loom/runtime/reload-teardown-timeout` if a bounded-await is adopted)

## Plan Impact

**Phases:** Horizontal, Vertical V12, Vertical V18

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified) — factory subscribes to `session_shutdown`; introduces an `ActiveInvocationRegistry` (the structure the teardown handler iterates) and a `WatcherRegistry` for chokidar handles owned by the extension instance
- V12a — `mode: subagent` accepted; AgentSession spawn — (modified) — adds a teardown-while-in-flight test asserting `AgentSession.dispose()` is called from the `session_shutdown` handler when the invocation `finally` has not run
- V18f — File watcher (chokidar) over discovery roots — (modified) — adds `watcher.close()` and pending-debounce-timer cancellation in the teardown path; test asserts the OS file handle is released and the debounce `Clock.setTimeout` handle is cleared
- V18r — Settings-file watcher — (modified) — same pattern as V18f for the `~/.pi/agent/settings.json` and `.pi/settings.json` watcher

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one will subscribe `session_shutdown` and tear resources down; one will read the spec literally, do nothing, and ship a leak that grows with every `/reload`. The leak is observable — orphan provider connections from undisposed subagent sessions can keep generating tokens after the user thinks the extension is gone, and chokidar handles accumulate against the OS descriptor budget over a long-lived Pi session.

## Solution Space

**Shape:** single

### Recommendation

Add to `pi-integration-contract.md` **Extension entry point** a new step (between current step 3 and step 4) specifying that the factory subscribes to `pi.on("session_shutdown", handler)` and that the handler executes the following sequence in order, regardless of `event.reason`:

1. **Stop accepting new work.** Mark the extension-scoped `LoomRegistry` as drained; the slash-command `handler` registered in step 3, on entry into a drained registry, returns the same cancelled-binder-style system note (`loom /<name>: extension shutting down`) without dispatching.
2. **Cancel in-flight invocations.** For every entry in the `ActiveInvocationRegistry`, call `loomAbort.abort()`. This propagates through the `Checkpoint` seam and through `createAgentSession({ signal })` to in-flight provider calls.
3. **Await subagent disposal.** `await Promise.allSettled(activeInvocations.map(inv => inv.disposeBarrier))`, where `disposeBarrier` is the promise the V12a `finally` block already settles after `AgentSession.dispose()` returns. The await is bounded by `Math.min(2000ms, remainingShutdownBudget)`; on timeout the runtime emits one `loom/runtime/reload-teardown-timeout` diagnostic naming the still-in-flight invocations and proceeds.
4. **Close watchers.** Call `discoveryWatcher.close()` and `settingsWatcher.close()`; cancel any pending debounce `Clock.setTimeout` handles.
5. **Detach forwarding listeners.** Remove every listener the runtime attached to Pi-side `ctx.signal`, tool `execute(signal)`, and parent-`invoke` signals (the same listeners cancellation.md already requires the per-invocation `finally` to remove — duplicated here for the reload-during-invocation path).

The handler is idempotent (a second `session_shutdown` fired before the first returns is a no-op). The handler does not call `ctx.reload()` (Pi is already executing it) and does not call `pi.unregisterTool` (Pi exposes none, and the registration cache leak is the documented V1 cosmetic acceptance).

Edge cases the implementer must watch:

- `ExtensionRuntime.invalidate()` may already have been called by Pi when the handler runs; any `pi.*` call that reaches the stale runtime will throw. The teardown sequence above touches only loom-internal state and the SDK objects (`AbortController`, chokidar `FSWatcher`, `AgentSession`) directly — it does not call back into `pi.*`.
- The `sendSystemNote` fallback chain (H4) MUST NOT be invoked from the teardown handler — `pi.sendMessage` against a stale runtime throws, and the H4 fallback to `ctx.ui.notify` would re-enter the same stale surface. Diagnostics emitted from the teardown handler use `console.error` directly, bypassing the normal persistent-diagnostic channel.
- `reason: "new" | "resume" | "fork"` does not always tear down the *extension* runtime (only the session), but the type doc says the event "is fired before an extension runtime is torn down" — the handler treats every reason identically, since a no-teardown reason makes the sequence a fast-path no-op (no active invocations exist at session boundaries because Pi serialises turns).

## Related Findings

- "`AgentSession` characterised as 'disposable' — no `Symbol.dispose`" — same-cluster (both concern subagent-disposal contracts; this finding adds a new disposal trigger, that finding clarifies the disposal mechanism)
- "Subagent isolation stated as expectation, not loom-side requirement" — same-cluster (touches subagent lifecycle wording but resolves independently)

---

# `pi.sendMessage` is synchronous (`void`); spec treats it as returning a `Promise`

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `pi.sendMessage` returns `void`, not `Promise<void>`
**Kind:** codebase-grounding-broad

## Finding

`spec_topics/pi-integration-contract.md` describes the loom-system-note delivery path as "If it throws or rejects, the runtime falls back…" and "The fallback path is taken on any thrown or rejected value from `sendMessage`". `spec_topics/diagnostics.md` repeats the same framing in two places (the renderer-fallback paragraph and the `loom/runtime/system-note-delivery-failed` registry row). The framing implies `pi.sendMessage` returns a `Promise` whose rejection is an observable failure mode the runtime must handle.

In `@mariozechner/pi-coding-agent` v0.72.x, `ExtensionAPI.sendMessage` (the surface a loom extension actually consumes from the factory-supplied `pi`) is typed as `(...): void` (`dist/core/extensions/types.d.ts:833`, and the underlying `SendMessageHandler` alias on line 1022 is also `void`). Only two adjacent surfaces return `Promise<void>`: `AgentSession.sendCustomMessage` (used inside subagent code, not by the extension) and `ReplacedSessionContext.sendMessage` (the post-`withSession()` variant). The extension-level call cannot reject; it can only throw synchronously.

The mis-typing has two concrete consequences. First, an implementer following the spec literally may write `pi.sendMessage(...).catch(...)` or `await pi.sendMessage(...)`-with-async-rejection-handling — the first is a `TypeError` at runtime (`undefined.catch`), the second silently never reaches the rejection branch. Second, the H4 and V18m plan tests inherit the same wording (h4-extension-shell.md "synchronous throw and asynchronous rejection both route to the diagnostics step"; v18-cancellation.md "synthetic probe that forces `pi.sendMessage` to reject") and as written would assert behaviour against a code path that the SDK shape forbids.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — System notes (best-effort fallback paragraph) (edited)
- `spec_topics/diagnostics.md` — renderer paragraph + `system-note-delivery-failed` registry row (edited)
- `C:/Users/thomasa/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts` — `ExtensionAPI.sendMessage` and `SendMessageHandler` (read-only)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H4 — Extension shell, `loom-system-note` renderer, `sendSystemNote` helper — (modified)
- V18m — Top-level panic / unexpected-throw routing — (modified)

(`H3` references the `pi.sendMessage` payload shape but not its return type, so it is unaffected. `Mb` consumes `sendSystemNote` via a probe on the helper rather than on `pi.sendMessage` directly, so it is also unaffected.)

## Consequence

**Severity:** correctness

A faithful implementer either writes code that throws `TypeError` at the boundary (`.catch` on `undefined`) or writes a fallback whose async-rejection branch is dead code. Two implementers reading the same spec disagree on whether `pi.sendMessage` is awaitable. The H4 and V18m tests as currently worded probe an unreachable rejection path and either fail to exercise the real synchronous-throw path or pass vacuously.

## Solution Space

**Shape:** single

### Recommendation

In `spec_topics/pi-integration-contract.md`, the System-notes section, replace both occurrences of "throws or rejects" / "thrown or rejected value" with "throws" only, and add an inline clarification to the first paragraph that introduces the call:

> `pi.sendMessage` returns `void` (synchronous); the runtime MUST NOT `await` it and MUST NOT attach a `.catch` handler. The best-effort fallback below covers synchronous throws only.

In `spec_topics/diagnostics.md`, apply the same edit to the renderer paragraph (line 19) and the `loom/runtime/system-note-delivery-failed` registry row's description (line 206) — strike "or rejected", strike "or rejects".

Edge cases the implementer must observe:
- `ctx.ui.notify` likewise returns `void`; the same "synchronous throw only" rule applies and is already correctly worded ("can throw").
- `AgentSession.sendCustomMessage` (subagent-internal) does return `Promise<void>` and must be `await`ed; this is a different surface and is not touched by the edit.
- The H4 test for "asynchronous rejection" of `pi.sendMessage` should be deleted, not rewritten — there is no asynchronous rejection to assert. The synchronous-throw assertion remains.
- The V18m test wording "forces `pi.sendMessage` to reject" should become "forces `pi.sendMessage` to throw".
- If a future Pi minor changes `sendMessage`'s return type to `Promise<void>`, the spec edit is reversible; until then the synchronous shape is the contract.

## Related Findings

- "`loom-system-note` with `display: false` and empty `content`" — same-cluster (touches the same `pi.sendMessage` call site but resolves independently)
- "`ExtensionContext` forwarded member list: no signatures or behavioural contracts" — same-cluster (a complete signature listing for forwarded members would have surfaced this `void` vs `Promise<void>` discrepancy structurally; co-resolution is possible but not required)

---

# `Consumers MUST deduplicate` is a normative obligation on a party V1 does not define

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** "Consumers MUST deduplicate" — obligation on undefined party
**Kind:** testability

## Finding

`spec_topics/pi-integration-contract.md`'s **Runtime event channel — Deduplication and lifetime rules** section says:

> A `?`-propagation chain emits exactly once at the originating site, not at each rethrow. A failure that is created at site A, propagated through frames B and C via `?`, and finally cascades out as a top-level `Err` at frame D produces one runtime event (origin: A) plus the user-facing top-level note at D when `display: true` applies; both share the same `RuntimeEvent` payload. **Consumers MUST deduplicate on `(kind, query_site, message, occurred_at)`.** Re-emissions for symmetry MUST copy the originating `RuntimeEvent` instance verbatim — including `occurred_at` — rather than re-stamping. Two emissions from the same `query_site` with the same `kind` and `message` but distinct `occurred_at` values represent two distinct occurrences.

The MUST sits on "consumers" — a party that the same page explicitly *defers* in the next paragraph: "V1 ships the always-log set and the payload shape only; the channel is intentionally write-only at the spec level, with downstream consumers free to read from Pi's session transcript via existing surfaces." A V1-conformance test against the loom runtime cannot assert anything about a downstream party that the spec has placed out of scope.

The MUST is also not a redundancy with the surrounding rules — it makes a normative claim about consumer behaviour, whereas the bracketing sentences ("MUST copy verbatim", "two distinct `occurred_at` values represent two distinct occurrences") describe runtime-side emission and the *interpretation contract* a consumer can rely on. Strip the consumer-facing MUST and the runtime obligations remain intact and testable; leave it in and the V18s coverage gate has a normative requirement with no implementer to bind to.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — Runtime event channel → *Deduplication and lifetime rules* (edited)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18i — Per-`kind` formatting for prompt-mode top-level `Err` — (modified) — already specifies the cascade-side note populates `details: { event }` with the same `RuntimeEvent` payload; the byte-identical-twin emission rule must remain assertable here regardless of which option is chosen
- V18q — Runtime event channel and always-log emission — (modified) — owns the origin-site emission helper and the cascade-vs-origin emission count; current tests already assert "exactly one event at the originating site" + the cascade-side display flag, which matches the runtime-side guarantee that should remain after the consumer MUST is dropped

## Consequence

**Severity:** advisory

A V1-conformance audit cannot pin a behaviour to "consumers" because no consumer ships in V1; the V18s coverage gate then either silently skips the rule or maps it to whichever surface the gate-author guesses. Either failure is recoverable post-ship without breaking deployed loom code, but it leaves a normative MUST without a testable owner.

## Solution Space

**Shape:** single

### Recommendation

Replace the sentence

> Consumers MUST deduplicate on `(kind, query_site, message, occurred_at)`.

with a non-normative consumer-guidance note plus an explicit runtime-side guarantee that makes deduplication mechanically possible:

> The runtime emits the same `RuntimeEvent` payload at most twice per origin: once at the originating site (always), and once again at the boundary as the `details: { event }` payload of the user-facing top-level note when a cascade applies. Both emissions are byte-identical including `occurred_at`. Consumers that aggregate the event stream may therefore deduplicate on `(kind, query_site, message, occurred_at)` to collapse the cascade twin; this is a non-normative consumer concern and not part of V1 conformance.

This keeps the design intact (twin emission for cascade symmetry is still required) while moving the only normative claim onto the runtime — where a test can observe it. The two adjacent sentences ("Re-emissions … MUST copy the originating `RuntimeEvent` instance verbatim — including `occurred_at`" and "Two emissions … with distinct `occurred_at` values represent two distinct occurrences") stay as written; the first is a runtime obligation, the second is the interpretation contract a consumer can rely on.

Edge cases the implementer must watch:

- The "at most twice" wording matters: prompt-mode cascade with `display: true` is the two-emission case; subagent-mode cascade emits once at origin (`display: false`) and once at the subagent boundary (`display: false`) — also two — both still byte-identical. A handled `Err` (matched, discarded, or `?`-propagated to a frame that handles it) emits once. The cap is two, not exactly two.
- Panics route through `details: { diagnostics: [...] }`, not `details: { event }`, so the twin-emission rule does not apply to them — the partition between the two `details` channels (raised by the related routing finding listed below) is the precondition for this rewrite making sense.
- V18q's existing test list already asserts "exactly one event at the originating site" plus the cascade-side display-flag emission. After the rewrite, V18q must additionally assert byte-equality of the twin (origin payload `===` cascade payload, including `occurred_at`) — this is a one-line strengthening of an existing assertion, not a new test.

## Related Findings

- "`RuntimeEvent` routing: panics appear in both always-log set and `details: {diagnostics}` path" — decision-dependency (the panic-vs-event partition must be settled before the "at most twice" cap is unambiguous; this finding's rewrite assumes panics route exclusively through `details: { diagnostics }`)
- "`loom-system-note` with `display: false` and empty `content`" — same-cluster (touches the same `pi.sendMessage` carrier; resolves independently)

---

# Structural-change note: emission rule undefined when N = 0

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** N = 0 structural-change note: behaviour undefined
**Kind:** testability

## Finding

`spec_topics/pi-integration-contract.md` defines the watcher's structural-change `loom-system-note` with `<N>` substituted from `details.structural.added.length + details.structural.removed.length`. It worked-examples N = 1 and N = 5 but never states what happens when both arrays are empty. The trigger language ("When the watcher observes such an event, it emits a single `loom-system-note`…") implies the note only fires on observed add/remove events, but it does not say so as a normative rule, and the rest of the section never returns to N = 0.

The settings-file watcher path (`plan_topics/v18-cancellation.md` V18r) widens the surface. V18r routes "a delta in the `looms` array" through the same structural-change channel, but several legitimate triggers can produce no delta after the V14n re-merge: a settings edit that touches only `looms.binderModel`, a whitespace/comment edit, or a partial intermediate write that recovers identically. The spec gives no rule for those cases — should the watcher render `loom watcher: 0 file(s) added or removed; run /reload to refresh the slash command list`, suppress the note, or emit a degenerate note with empty `added` and `removed` arrays?

Two reasonable implementers will diverge here. One reads "when the watcher observes such an event" as gating on N ≥ 1 and suppresses; another reads V18r's "routes the delta through the same path" as unconditional and renders the literal `0 file(s)` template. V18f's "exactly one note per debounce window" test (and V18r's analogous test) cannot be authored without picking a side.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — *Extension entry point* → "Structural changes." paragraph (edited)
- `spec_topics/pi-integration-contract.md` — *System notes* → `details: { structural: ... }` bullet (edited)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18f — File watcher (chokidar) over discovery roots — (modified)
- V18r — Settings-file watcher (`~/.pi/agent/settings.json`, `.pi/settings.json`) — (modified)

## Consequence

**Severity:** correctness

V18f's structural-change tests and V18r's settings-edit tests both assume implicit N ≥ 1; no test currently pins down what happens when a debounce window closes with no structural delta. Without a rule, the V18r `binderModel`-only-edit test (test (d) in V18r) silently depends on whichever choice the implementer makes — and a transcript-replay consumer that filters on `details.structural` would either see noise or miss real events depending on that choice.

## Solution Space

**Shape:** single

### Recommendation

In `pi-integration-contract.md`'s "Structural changes." paragraph, add an explicit suppression rule immediately after the `<N>` substitution rule:

> The note MUST NOT be emitted when `added.length + removed.length === 0`. A debounce window that closes with no resolved add or remove paths produces no `loom-system-note` — including a settings-file edit whose post-merge `looms` array is byte-identical to the previous resolved set, an edit that touches only `looms.binderModel` or unrelated keys, and a chokidar burst over discovery roots that does not net any added or removed `.loom` / `.warp` files. The watcher's other obligations for the window (validator-cache invalidation per **In-flight invocation rule**, V14n cache invalidation per V18r) still run; only the note is suppressed.

Cross-reference this rule from V18f's "Tests" bullet (add an N = 0 negative case: a debounce window whose only events are content edits to existing files emits zero structural-change notes) and from V18r's "Tests" bullet (the existing `binderModel`-only test (d) explicitly asserts zero structural-change notes).

Edge case the implementer must watch: a rename observed as `removed` of path P followed by `added` of path P inside the same debounce window still has `added.length + removed.length = 2` and MUST emit the note (per the existing "two arrays are disjoint by role and not deduplicated" rule); the suppression rule applies only to the strictly-empty case.

## Related Findings

- "`loom-system-note` with `display: false` and empty `content`" — same-cluster (both clarify when an entry on the `loom-system-note` channel is or is not emitted; resolve independently).
- "`customType: "loom-system-note"` namespacing not specified" — same-cluster (touches the same channel surface, different concern).
- ""Consumers MUST deduplicate" — obligation on undefined party" — same-cluster (adjacent on the same channel, but about RuntimeEvent dedup rather than structural-note suppression).

---

## spec_topics/pi-integration.md

---

# `PIE` prefix allocated to a page that owns no rules

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `PIE` prefix allocated but page is pure-narrative pointer content
**Kind:** cross-spec-consistency-broad

## Finding

`spec.md`'s GOV-3 prefix table assigns the `PIE` prefix to `spec_topics/pi-integration.md`, marking it as a non-narrative page that H6 must annotate with REQ-IDs. But `pi-integration.md`'s body is four summary bullets plus a sub-topic link list, and every claim in those bullets is owned canonically by another page:

- Slash-command discovery of `.loom`, exclusion of `.warp`, the four discovery channels — `discovery.md`.
- `argument-hint` not surfaced in Pi's autocomplete UI — `slash-invocation.md`, `frontmatter.md`, and `future-considerations.md` (with the advisory diagnostic in `diagnostics.md`).
- File-watcher mechanism (in-process re-parse + atomic registry swap, no `ctx.reload()` for content edits, one-line system note for add/remove) — `pi-integration-contract.md`.
- Parse-time diagnostic surfacing — `schema-subset.md` and `diagnostics.md`.
- Runtime AJV validation surfacing — `query.md`, `errors-and-results.md`, and `diagnostics.md`.

H6 will hit a contradiction. Its own gate (`plan_topics/h6-req-ids.md`) requires every non-narrative page to carry at least one inline `**PREFIX-N.**` marker matching its prefix, computed from the live prefix table itself. With no rule that `pi-integration.md` solely owns, H6 must either (a) fabricate `PIE-N` anchors that duplicate obligations canonically asserted on other pages — creating dual-source-of-truth for those rules and forcing lockstep edits across pages — or (b) skip the page and fail its own ≥ 1 gate. Neither outcome is acceptable.

The page is genuinely valuable as an integration overview / table-of-contents, but its REQ-ID status in the prefix table does not match its actual content shape.

## Spec Documents

- `spec.md` — Appendix → GOV-3 prefix table, GOV-7 mutation procedures, *Retired prefixes* sub-table (edited)
- `spec_topics/pi-integration.md` — entire page (option-dependent)
- `spec_topics/discovery.md` — read-only
- `spec_topics/slash-invocation.md` — read-only
- `spec_topics/pi-integration-contract.md` — read-only
- `spec_topics/frontmatter.md` — read-only
- `spec_topics/diagnostics.md` — read-only
- `spec_topics/imports.md` — read-only
- `plan_topics/h6-req-ids.md` — read-only (consumes the prefix table)
- `plan_topics/v18-cancellation.md` — read-only (V18s gate consumes the table)
- `plan_topics/coverage-matrix.md` — read-only (carries a `pi-integration.md` row)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)
- V18s — Coverage-matrix closing CI gate — (modified)

V18s only needs revisiting if Option 2 is chosen (a new live `PIE-1` row would need to remain mapped); under Option 1 the V18s gates are robust to the change because GOV-6 only requires that prefixes appearing in `spec_topics/*.md` be a subset of (live ∪ retired), and a retired-or-narrative `PIE` satisfies that vacuously.

## Consequence

**Severity:** correctness

H6 cannot satisfy its "every non-narrative page carries ≥ 1 REQ-ID" gate against `pi-integration.md` without fabricating anchors that duplicate obligations owned elsewhere. Two reasonable implementers will diverge — one silently elides the gate for this page, the other manufactures duplicate `PIE-N` anchors that thereafter require lockstep edits with the canonical owners. Either outcome corrupts the GOV-1 / GOV-3 / GOV-6 invariant chain that H6 exists to establish.

## Solution Space

**Shape:** single

### Recommendation

Demote `pi-integration.md` to a pure-narrative integration index (same footing as `overview.md` and `glossary.md`), retire the `PIE` prefix, and extend GOV-7 with a *Normative-to-narrative demotion* procedure to cover this case symmetrically with the existing *Narrative-to-normative promotion*.

**Spec edits.**

- In `spec_topics/governance.md` prefix table, locate the existing `| pi-integration.md | PIE |` row and remove it; append a new live row `| pi-integration.md | (no IDs — narrative) |`. Move `PIE` to the *Retired prefixes* sub-table with `Formerly = pi-integration.md (demoted to narrative)` and `Retired in = <demotion commit SHA>`.
- Add a new GOV-7 procedure — *Normative-to-narrative demotion* — directly below the existing *Narrative-to-normative promotion* clause. The procedure: (a) move the page's prefix from the live table to the *Retired prefixes* sub-table per GOV-7 *Delete*; (b) append a new live table row carrying `(no IDs — narrative)`; (c) note that re-promotion (per GOV-7 *Narrative-to-normative promotion*) requires a fresh prefix because the original is now retired and immutable.
- In `spec_topics/pi-integration.md`, no content edit is required — the page already reads as a narrative index. (Optionally trim or polish, but no normative changes.)

**Plan edits.**

- Update `plan_topics/h6-req-ids.md` `**Spec.**` field to drop the `pi-integration.md` reference (since H6 no longer visits it for anchor insertion).

Edge case for the implementer: a future contributor may re-promote the page (per GOV-7 *Narrative-to-normative promotion*) and discover they cannot reuse `PIE` because GOV-4 / GOV-5 immutability forbids it. State this consequence one-line in the new *Normative-to-narrative demotion* procedure so it is not surprising.

## Related Findings

- "GOV-3 narrative exclusion list out of sync with GOV-7 promotion" — same-cluster (both expose the same GOV-3 / GOV-7 synchronisation gap; this finding's Option A motivates a symmetric *demotion* procedure that complements that finding's *promotion* fix)
- "SDK capability list duplicates `pi-integration-contract.md`" — same-cluster (both flag duplicated normative content that should reduce to a cross-reference into `pi-integration-contract.md`)
- "GOV-4 'append-only / immutable' contradicts GOV-7 Delete / Merge / Rename" — decision-dependency (Option A executes a GOV-7 *Delete* that finding flags as contradicting GOV-4; whichever resolution that finding adopts must accommodate this case)

---

## spec_topics/diagnostics.md

---

# `loom/type/*` namespace is declared but carries zero codes

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `loom/type/*` namespace declared but empty; type-check codes live in `loom/parse/*`
**Kind:** naming

## Finding

`spec_topics/diagnostics.md` declares four code namespaces — `loom/parse/*`, `loom/type/*`, `loom/load/*`, `loom/runtime/*` — and assigns `loom/type/*` to "type-system errors (unknown identifier, type mismatch, schema constraint violation)." The closed code registry that follows contains zero rows under `loom/type/*`. Every type-system check in the registry — `integer-narrowing`, `non-boolean-condition`, `mixed-plus-operands`, `array-element-type-mismatch`, `array-no-common-type`, `non-string-array-join`, `non-array-iterand`, `interpolated-result`, `match-arm-type-mismatch`, `question-outside-result-fn`, `bare-return-in-non-void`, `invoke-arg-type-mismatch`, `invoke-return-type-mismatch`, `tool-arg-type-mismatch`, and the type-phase variants of a few others (14+ rows total) — uses the `loom/parse/<name>` namespace prefix with `Phase = type` carrying the categorisation in a separate column.

The `loom/parse/*` description says only "lexer / parser errors," explicitly excluding the type checks it actually owns. The downstream consequence is twofold: implementers who route diagnostics on the namespace prefix (a documented surface — registries, LSP integrations, log filters, the V18s CI gate) cannot derive the correct routing from the spec; and the registry's own framing contradicts itself page-internally (the namespace table promises rows under `loom/type/*` that never materialise).

This sits adjacent to the same page's `loom/lex/*` peer-namespace heading, which has the inverse defect (a heading exists for a namespace that no row uses). Both originate from the same drift: the namespace surface is presented as a four-way phase split, but the actual codes use a two-way split (`loom/parse/*` for everything the parser detects, `loom/load/*` and `loom/runtime/*` for the other two), with phase carried in the `Phase` column.

## Spec Documents

- `spec_topics/diagnostics.md` — Code namespaces bullet list (edited)
- `spec_topics/diagnostics.md` — delivery paragraphs at lines 5 and 23 enumerating the four namespaces (edited)
- `spec_topics/diagnostics.md` — registry section heading `### `loom/lex/*` and `loom/parse/*` — lexical and parse errors` (edited)
- `spec_topics/diagnostics.md` — registry table rows (read-only — no row IDs change under the recommendation)
- `spec_topics/type-system.md` — referenced for context to confirm no codes are owned there (read-only)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H3 — Diagnostics primitive — (modified: the four-namespace constant set in `h3-diagnostics.md` lines 5/13 currently enumerates `loom/parse/*`, `loom/type/*`, `loom/load/*`, `loom/runtime/*`; under the recommendation it becomes a three-namespace set, and the test in line 13 — "no emitted code's namespace prefix falls outside the four-element constant set" — narrows to three)
- V18s — Coverage-matrix closing CI gate — (modified: the diagnostic-code grep regex `loom/(parse|type|load|runtime)` in gate (2) and the inline test fixture must drop `type|`)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on whether `loom/type/<name>` codes exist as a routable surface. An implementer who follows the namespace table will build constant-module slots, log filters, or LSP categories for a `loom/type/*` group that the test suite never exercises and the conformance corpus never emits — failing the V18s gate (2) (codes-in-registry vs. codes-in-tests diff) once any test attempts to assert against the placeholder. An implementer who follows the registry rows will produce no `loom/type/*` surface and may flag the namespace-table entry as a typo, retiring it without coordinating with the H3 constant set. Tests written against either reading will break under the other.

## Solution Space

**Shape:** single

### Recommendation

Remove `loom/type/*` from the namespace bullet list, and rewrite the `loom/parse/*` bullet to describe the actual surface. The 14+ type-phase codes already in the registry stay at their current `loom/parse/<name>` paths; the `Phase` column already distinguishes `lex` / `parse` / `type` within the namespace and is the routing surface implementers should consume for phase-level categorisation.

Concrete edits to `spec_topics/diagnostics.md`:

- **Code namespaces bullet list** — replace the two bullets with:
  - `` `loom/parse/*` — diagnostics produced by the parse pipeline: lexical errors, syntactic errors, and static type-system checks. The `Phase` column in the registry table distinguishes `lex` / `parse` / `type` within this namespace. ``
  - (drop the `loom/type/*` bullet entirely)
- **Delivery paragraphs (lines 5 and 23)** — replace each occurrence of "`loom/parse/*`, `loom/type/*`, `loom/load/*`, `loom/runtime/*`" with "`loom/parse/*`, `loom/load/*`, `loom/runtime/*`".
- **Registry section heading at line 67** — drop the `loom/lex/*` half (resolved in lockstep with the related `loom/lex/*` finding) and rewrite to `` ### `loom/parse/*` — lexical, parse, and type-system errors ``.

Edge cases for the implementer:

- The H3 constant set narrows from four namespaces to three. The unit test at `h3-diagnostics.md` line 13 ("no emitted code's namespace prefix falls outside the four-element constant set") is renamed and rewritten to assert three.
- The V18s CI gate (2) regex `` "loom/(parse|type|load|runtime)/[a-z0-9-]+" `` becomes `` "loom/(parse|load|runtime)/[a-z0-9-]+" ``. The gate's *Tests* bullet that mentions "every registry code is asserted" remains valid; no synthetic-test fixtures need to change because none cite a literal `loom/type/...` string.
- The custom ESLint rule `loom/no-throw-diagnostic-code` in H3 currently matches `` /^loom\/(parse|load|type|runtime)\// ``. Keep `type` in the rule's allow-list pattern (defensive — the rule only fires on accidental `throw` of a string starting with the prefix; it costs nothing to keep an extra alternative even when no codes use it), or drop it for consistency with the gate. Either choice is conformant; pick the consistent one (drop).
- This change does not rename any registered code, so GOV-8-style retired-ID bookkeeping does not apply (rule 3 of the registry — "codes are stable identifiers" — is unviolated; only the namespace bullet list and one section heading shift).

## Related Findings

- "`loom/lex/*` phantom namespace in registry section heading" — co-resolve (the same edit to the registry section heading at line 67 fixes both; the recommended replacement heading subsumes both namespaces' real contents)
- "`loom/parse/empty-schema-body` and `loom/parse/non-string-discriminator` missing from registry" — same-cluster (touches the same registry table but adds rows independently of the namespace-surface decision; resolves separately)
- "Diagnostic message placeholder rendering not defined" — same-cluster (adjacent registry-section gap; orthogonal fix)

---

# `loom/lex/*` is a phantom namespace in the registry section heading

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `loom/lex/*` phantom namespace in registry section heading
**Kind:** naming

## Finding

The first sub-heading inside the diagnostics code-registry table reads `### \`loom/lex/*\` and \`loom/parse/*\` — lexical and parse errors`, presenting `loom/lex/*` as a peer namespace alongside `loom/parse/*`. No such namespace exists in the spec: it is absent from the four-bullet **Code namespaces** list, no row in any registry table carries a `loom/lex/...` code, and the lexical-phase rows (`illegal-escape`, `literal-newline-in-string`, `unterminated-string`, `invalid-path-separator`, `block-comment`, `illegal-template-escape`, `unterminated-template`) all use the `loom/parse/*` prefix with `Phase: lex`. The plan already encodes this reality — `plan_topics/h3-diagnostics.md` states verbatim: "There is no `loom/lex/*` namespace: every `lex`-phase code in `spec_topics/diagnostics.md` routes through `loom/parse/*` (or `loom/load/invalid-encoding` for the UTF-8 / BOM case)."

The heading is the only place in the spec that hints at a `loom/lex/*` namespace. A reader scanning the registry's table-of-contents-by-heading sees a four-namespace surface (`lex`, `parse`, `load`, `runtime`); a reader scanning the **Code namespaces** bullets sees a four-namespace surface (`parse`, `type`, `load`, `runtime`); the actual code rows expose three (`parse`, `load`, `runtime`). Three different counts of namespaces inside a single page is gratuitous noise in a registry whose stability is itself a normative rule (rule 3: codes are stable identifiers; rule 2: the registry is closed). The `loom/lex/*` half of the heading is the cleanest of the three to fix because nothing else in the spec leans on it.

## Spec Documents

- `spec_topics/diagnostics.md` — the `### \`loom/lex/*\` and \`loom/parse/*\` — lexical and parse errors` sub-heading inside *Code registry* (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(`plan_topics/h3-diagnostics.md` already documents the absence of `loom/lex/*` and groups codes under `loom/parse/*`; no acceptance criterion needs revision.)

## Consequence

**Severity:** cosmetic

A misleading heading and an inconsistent namespace count across three places in one page. No implementer is blocked: the **Code namespaces** bullet list and the actual registry rows agree on the routing, and the H3 plan leaf already calls out the absence explicitly. The cost is reader confusion plus a small ongoing hazard that future spec edits might be tempted to "fix" the inconsistency by inventing `loom/lex/*` codes rather than by deleting the heading fragment.

## Solution Space

**Shape:** single

### Recommendation

Strike `\`loom/lex/*\` and ` from the sub-heading. The exact replacement text depends on how the sibling finding `\`loom/type/*\` namespace declared but empty; type-check codes live in \`loom/parse/*\`` resolves:

- If that finding picks **Merge** (drop `loom/type/*` from the namespace table; broaden `loom/parse/*`'s description), the heading becomes `### \`loom/parse/*\` — lexer, parser, and type errors`.
- If that finding picks **Split** (rename type-phase codes to `loom/type/...`), the heading becomes `### \`loom/parse/*\` — lexical and parse errors` and a sibling sub-heading `### \`loom/type/*\` — type-system errors` is added below it.

Either way, `loom/lex/*` disappears from the heading. Edge cases for the implementer:

- The four **Code namespaces** bullets above the registry must remain consistent with whatever the new heading set asserts — bullet count == sub-heading count.
- `plan_topics/h3-diagnostics.md`'s disclaimer about `loom/lex/*` not being a namespace remains accurate after the edit; no plan change is needed.
- The V18s diagnostic-code closing gate (per `plan_topics/v18-cancellation.md`) regexes registry rows by first column starting with `` | `loom/ ``; sub-heading text does not feed that grep, so the rename is gate-neutral.

## Related Findings

- "`loom/type/*` namespace declared but empty; type-check codes live in `loom/parse/*`" — decision-dependency (the chosen fix for the type-namespace finding determines the exact replacement heading text; both findings should be edited in one pass)
- "`loom/parse/empty-schema-body` and `loom/parse/non-string-discriminator` missing from registry" — same-cluster (also a registry-completeness issue on the same page; resolves independently)

---

# `loom/parse/empty-schema-body` and `loom/parse/non-string-discriminator` missing from the registry table

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `` `loom/parse/empty-schema-body` and `loom/parse/non-string-discriminator` missing from registry ``
**Kind:** naming

## Finding

`spec_topics/schemas.md` cites two diagnostic codes by name in normative prose: `loom/parse/empty-schema-body` (line 19, with the message `"'X' has no fields; an empty schema cannot be validated."` quoted inline) and `loom/parse/non-string-discriminator` (line 103, gating numeric/boolean literal discriminators under both implicit detection and explicit `by <field>`). Neither code appears as a row in the registry table of `spec_topics/diagnostics.md` (the `loom/lex/*` and `loom/parse/*` table at lines 69–155, which is the registry section the codes belong under).

The registry rule in `diagnostics.md` is that the table "enumerates every diagnostic the V1 spec defines" and is the single source of truth for `Sev`, `Phase`, `Hint`, and the rendered `Message` template. Two normative codes named in another topic page but absent from the table contradict that closure property directly, and the gap propagates into `plan.md`: V4b's tests assert the verbatim message for `empty-schema-body`, V11a and V11d assert `non-string-discriminator` "matches the diagnostics registry *Message* template verbatim", and the V18s closing gate is specified as a CI diff that fails on "any code present in tests but absent from the registry". Until the rows land, the V18s gate cannot pass; until then, the message wording for `non-string-discriminator` is also undefined (`schemas.md` does not quote one inline, so V11a/V11d have no canonical string to assert against).

## Spec Documents

- `spec_topics/diagnostics.md` — `loom/lex/*` and `loom/parse/*` registry table (edited)
- `spec_topics/schemas.md` — empty-body paragraph (line 19) and discriminator paragraph (lines 100–105) (read-only — verifies trigger phrasing and the verbatim message string for `empty-schema-body`)

## Plan Impact

**Phases:** Vertical V4, Vertical V11, Vertical V18

**Leaves (implementation order):**

- V4b — Object schema declaration and lowering — (blocked: tests assert the verbatim `empty-schema-body` message but no registry row exists to anchor it; V18s gate fails on the unregistered emission)
- V11a — Implicit discriminator detection — (blocked: tests assert `non-string-discriminator` "matches the diagnostics registry *Message* template verbatim" but the template does not exist)
- V11d — Explicit `by <field>` form — (blocked: same reason as V11a, applied under explicit `by`)
- V18s — Closing gates — (blocked: the diagnostic-code closing gate diffs registry against tests and fails on any code present in tests but absent from registry)

## Consequence

**Severity:** correctness

The spec contradicts its own registry-is-single-source-of-truth rule by emitting normative codes from `schemas.md` that the registry does not carry. Two implementers reading only the registry would not produce these emissions; one reading both pages would, and would then have to invent the `non-string-discriminator` message string (where `schemas.md` quotes none) — guaranteeing divergence in author-visible output. The V18s closing gate is specified to fail in exactly this configuration, so the spec is not shippable as written.

## Solution Space

**Shape:** single

### Recommendation

Add two rows to the `loom/lex/*` and `loom/parse/*` table in `spec_topics/diagnostics.md` (the table starting at line 69). The columns are `Code | Sev | Phase | Trigger | Spec rule | Hint | Message`.

Row 1 — `loom/parse/empty-schema-body`:

| field | value |
|---|---|
| Sev | `E` |
| Phase | `parse` |
| Trigger | `schema X { }` declaration with no fields. |
| Spec rule | `[Schemas — Object schemas](./schemas.md)` |
| Hint | `—` |
| Message | `` `'<X>' has no fields; an empty schema cannot be validated.` `` |

The message is reproduced verbatim from `schemas.md` line 19 with `X` rendered as the `<X>` placeholder, matching the placeholder convention the table preamble (line 69) describes.

Row 2 — `loom/parse/non-string-discriminator`:

| field | value |
|---|---|
| Sev | `E` |
| Phase | `parse` |
| Trigger | Discriminator field's per-variant literal type is not `string` — i.e. a numeric or boolean literal `const`. Applies equally to implicit detection and to the explicit `by <field>` form. |
| Spec rule | `[Schemas — Discriminated unions](./schemas.md)` |
| Hint | `` Wrap the tag as a string (e.g. `kind: "v1"` rather than `kind: 1`). `` |
| Message | `` `discriminator '<field>' on <X> must be a string-literal type; got <kind>` `` |

The message string for `non-string-discriminator` is not quoted inline in `schemas.md`, so the registry row is the source of truth. The proposed wording mirrors the surrounding rows in shape: `'<field>'` (single-quoted identifier, matching `wire-name-collision`, `unknown-variant`, `duplicate-enum-value`); `<X>` for the union's printed name (matching `ambiguous-discriminator`, `missing-discriminator`); a trailing `; got <kind>` clause naming the rejected literal kind (matching `non-string-enum-value`'s `got <kind>` tail). Place both rows next to the existing discriminator codes (`ambiguous-discriminator`, `missing-discriminator`, `duplicate-discriminator-value`, `nested-discriminator`) — currently lines 132–135 of the table — and place `empty-schema-body` near the other schema-body codes (`wire-name-collision`, `redundant-wire-name`).

Edge cases the implementer must verify:

- `schemas.md` line 103 says the rule "applies equally to implicit detection and to the explicit `by <field> form`" — the *Trigger* column must capture both. Plan V11d's test for `schema X by kind = A | B` with numeric-literal `kind` already depends on this.
- The wire-renamed case (`kind as "Kind": 1`, asserted by V11a) emits `non-string-discriminator` keyed off the value type, not the rename. The trigger phrasing must not accidentally suggest the rename suppresses the check.
- If the related finding "`loom/type/*` namespace declared but empty" lands the *Split* posture (renaming `loom/parse/<name>` codes whose Phase is `type` to `loom/type/<name>`), neither of these new rows is affected — both have phase `parse`, not `type`. They stay under `loom/parse/*` regardless of how that finding resolves.

## Related Findings

- "`binder-malformed-envelope` code not in the diagnostics registry" — same-cluster (identical defect class — code cited normatively by a topic page but absent from the registry table; same fix shape, different code)
- "`loom/type/*` namespace declared but empty; type-check codes live in `loom/parse/*`" — same-cluster (both touch the registry table's namespace organisation; resolution is independent because both new rows are phase `parse`, not phase `type`)
- "`loom/lex/*` phantom namespace in registry section heading" — same-cluster (touches the same `loom/lex/*` and `loom/parse/*` section heading where the new rows land; if that finding renames the section heading, the edit is in the same file but does not block this row addition)

---

# Diagnostic message placeholders have no defined rendering

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Diagnostic message placeholder rendering not defined
**Kind:** testability, naming

## Finding

The diagnostics registry's *Message* column is declared normative — "renderers MUST emit it character-for-character with placeholders interpolated" (rule 4) — and conformance tests "MAY assert on the exact string." But the registry's `<…>` placeholders span six distinct kinds with no rendering rule for any of them:

- **Loom static types** — `<type>`, `<expected>`, `<actual>`, `<left>`, `<right>`, `<element>`. The spec never defines a canonical type-string. Two implementers can render `array<integer | string>` as `array<integer | string>`, `(integer|string)[]`, `Array<integer|string>`, or the lowered JSON Schema `{"type":["integer","string"]}` — all defensible, none normative.
- **Runtime values** — `<scrutinee summary>` (in `loom/runtime/match-error`), and arguably `<value>` (in `loom/parse/duplicate-enum-value`). The word "summary" hints at truncation, but no rule fixes the cutoff, the renderer, or even whether to reuse the canonical interpolation-stringification table from [Query — Stringification of interpolated values](./query.md). A `match` panic on a 4 KB string scrutinee or a deeply nested object has no defined output.
- **Syntactic constructs** — `<construct>` in `loom/parse/unsupported-feature`. Implementers must pick between English names ("arrow function", "spread operator"), source tokens (`=>`, `...`), or AST node names (`ArrowFunctionExpression`).
- **Numeric scalars** — `<i>`, `<length>`, `<depth>`, `<offset>`, `<count>`, `<index>`, `<required>`, `<provided>`, `<max>`. Decimal vs. hex; signed-zero handling for `-0` indices; `Infinity`/`NaN` should be unreachable but are not ruled out.
- **Source-derived strings** — `<path>`, `<file>`, `<descriptor>`, `<name>`, `<field>`, `<param>`, `<variant>`, `<keyword>`, `<key>`, `<char>`, `<expr>`. Mostly verbatim, but the rules differ per case: `<path>` is the path literal as written (no realpath normalisation, per the existing rule for `loom/parse/invoke-non-loom-extension`), while `<key>` may need quoting for non-identifier-shaped keys, and `<expr>` must reproduce a sub-expression's source span — none of which is stated.
- **Underlying error text** — `<error.message>`, `<original content first line>`, `<dispose error first line>`. The registry hints at "first line" semantics for the last two but never defines what counts as a line terminator (`\n`, `\r\n`, `\u2028`?) or how trailing whitespace is treated.

`plan_topics/conventions.md` (the *Diagnostic message anchors* convention) and the V18s closing CI gate then bind every diagnostic test to "the *Message* column of the registry verbatim," and roughly twenty leaves (from V1b through V18n) cite that obligation explicitly. As written, those tests cannot be authored against the spec alone — each implementer must invent a rendering, locally validate against it, and cross-implementation comparison becomes meaningless.

## Spec Documents

- `spec_topics/diagnostics.md` — Code registry rules; Code registry tables (edited)
- `spec_topics/errors-and-results.md` — Panic message string (normative); template summary table (edited — cross-link to the new rendering subsection)
- `spec_topics/query.md` — Stringification of interpolated values (read-only — precedent for the runtime-value rendering rule)
- `spec_topics/binder.md` — Failure-mode templates (normative); `<ajv-summary>` rendering rule (read-only — precedent for the underlying-error rendering posture)
- `spec_topics/type-system.md` — Type expressions (read-only — source of the canonical type grammar that a type-rendering rule must match)
- `spec_topics/lexical.md` — Identifiers (read-only — source of the identifier shape used by `<name>`/`<field>` placeholders)

## Plan Impact

**Phases:** Vertical V1, Vertical V2, Vertical V3, Vertical V4, Vertical V7, Vertical V11, Vertical V14, Vertical V15, Vertical V18

**Leaves (implementation order):**

- V1b — String literals and escapes — modified (`<char>` in `loom/parse/illegal-escape`)
- V2c — Arithmetic, comparison, logical, ternary, parens — modified (`<left>`, `<right>` in `loom/parse/mixed-plus-operands`)
- V2f — Truthiness rule — modified (`<type>` in `loom/parse/non-boolean-condition`)
- V2h — Array stdlib and array literals — modified (`<element>`, `<i>`, `<expected>`, `<actual>` across array-element-type-mismatch, array-no-common-type, non-string-array-join)
- V3a — Frontmatter parsing — modified (`<field>`, `<value>`, `<kind>` across the `loom/load/*` frontmatter codes)
- V4j — Type-alias cycle detector — modified (`<path>` in `loom/parse/type-alias-cycle`; the V4j tests already pin one rendering — `"X → Y → X"` — but the spec doesn't say arrow-with-spaces is the rendering rule)
- V7i — `MatchError` runtime panic — modified (`<scrutinee summary>` is the most under-specified placeholder in the registry; V7i tests currently say only "panics with `MatchError`" and defer the message to V18m, which itself doesn't define `<scrutinee summary>`)
- V11b — Ambiguous-candidate diagnostic — modified (`<X>`, `<fields>`)
- V11c — Missing-discriminator diagnostic — modified (`<X>`)
- V11d — Explicit `by <field>` form — modified (`<value>` in `loom/parse/duplicate-discriminator-value`)
- V11e — Discriminator must be top-level — modified (`<field>`, `<X>` in `loom/parse/nested-discriminator`)
- V14b — `tools:` YAML list form with `as` rename — modified (`<name>` in `loom/load/tool-name-collision`, `<name>` in `loom/load/invalid-tool-rename`)
- V14c-a — Pi-tool dispatch and `ctx` synthesis — modified (`<name>`, `<count>` in `loom/parse/tool-arg-arity`; `<expected>`, `<actual>` in `loom/parse/tool-arg-type-mismatch`)
- V15a — `invoke("./path.loom", ...)` parsing and resolution — modified (`<path>` in `loom/parse/invoke-non-loom-extension`, `loom/load/invoke-path-escape`)
- V15c — Typed `invoke<Schema>` with AJV validation — modified (`<callee>`, `<actual>` in `loom/parse/invoke-return-type-mismatch`)
- V15d — Positional argument binding for `invoke` — modified (`<i>`, `<param>`, `<expected>`, `<actual>` in `loom/parse/invoke-arg-type-mismatch`; `<callee>`, `<required>`, `<provided>`, `<max>` in the arity codes)
- V18k — Runtime panic: array index out of bounds — modified (`<i>`, `<length>` rendering for `loom/runtime/index-out-of-bounds`; current V18k tests say only "message includes index and length")
- V18l — Runtime panic: indexed access on `null` / missing key — modified (`<field>`, `<i>`, `<key>` for the three null/missing-access codes)
- V18m — Panic routing: slash-command surface — modified (`<name>`, `<message>` in the slash-command surface template; `<error.message>` in `loom/runtime/internal-error`)
- V18n — Panic routing: `invoke` parent surface — modified (`<depth>` in `loom/runtime/invoke-depth-exceeded`)
- V18s — Coverage-matrix closing CI gate — blocked (the gate's diagnostic-code closure property — "every code in the registry is asserted as a literal string by at least one test" — collapses to per-implementer truth without a placeholder rendering rule; the gate cannot mean what it says until the rendering is normative)

## Consequence

**Severity:** correctness

Two conformant implementations will produce visibly different diagnostic strings for the same source defect, and the V18s closing-gate property "every registry code is asserted as a literal string" degrades to "every implementation asserts its own locally-invented strings." The same conformance test suite cannot be ported between implementations; cross-implementation diff regressions go unnoticed; LSP integrations and downstream `loom-system-note` consumers cannot rely on string-shape stability that the spec claims for them.

## Solution Space

**Shape:** single

### Recommendation

Add a **Placeholder rendering** subsection to `spec_topics/diagnostics.md`, immediately after the *Code registry rules* section (before the registry tables), declaring six placeholder categories with one rendering rule per category. Anchor each rule with at least two normative test vectors. The categories and rules:

1. **Static-type placeholders** (`<type>`, `<expected>`, `<actual>`, `<left>`, `<right>`, `<element>`) — render the Loom static type by re-serialising it in the source-grammar form defined in [Type System](./type-system.md). Concrete shape: primitive type names lowercase (`string`, `integer`, `number`, `boolean`, `null`); literal types as their literal source (`"foo"`, `42`, `true`); unions joined by ` | ` with no surrounding parens; arrays as `array<T>`; named schemas/enums by their loom-side identifier; `Result<T, E>` as written. Test vectors: `array<integer | string>` round-trips as `array<integer | string>`; `Foo | null` round-trips as `Foo | null`.

2. **Runtime-value placeholders** (`<scrutinee summary>`, `<value>`) — render via the canonical interpolation-stringification table in [Query — Stringification of interpolated values](./query.md), with one extension: strings longer than 80 characters are truncated to the first 77 code points followed by `...`. The 80-character cap, the 77-prefix, and the literal ellipsis are normative. `Result<T, E>`-valued scrutinees render as `Ok(<inner>)` / `Err(<inner>)` with `<inner>` recursing the same rule (this resolves the gap that the query-stringification table leaves for `Result`, since panics may legitimately fire on `Result` values). Test vectors: `MatchError: no arm matched Cat { name: "fluffy" }`; `MatchError: no arm matched 42`; `MatchError: no arm matched "abc...77chars...xyz..."`.

3. **Syntactic-construct placeholder** (`<construct>` in `loom/parse/unsupported-feature` and `loom/parse/default-not-literal`/`loom/parse/tool-arg-not-literal`'s `<expr>`) — render as the offending source span verbatim, copied byte-for-byte from the source file between the construct's start and end token positions, with internal whitespace preserved. For node-categorical errors that have no single offending span (e.g. `loom/parse/unsupported-feature` fires on a whole `=>` lambda), use a closed token-name table maintained alongside the registry: `arrow function`, `spread`, `optional chaining`, `nullish coalescing`, `strict equality`, `bitwise <op>`, `comma operator`, `nested template`, `new`, `typeof`, `instanceof`, `delete`, `void`, `yield`, `await`. Test vectors: `unsupported syntactic feature: arrow function`; `Pi-tool argument must be a literal-sublanguage form; offending sub-expression: a + b`.

4. **Numeric placeholders** (`<i>`, `<length>`, `<depth>`, `<offset>`, `<count>`, `<index>`, `<required>`, `<provided>`, `<max>`) — render as the shortest decimal representation per the `integer` row of the canonical stringification table (no scientific notation, no leading zeros, leading `-` for negatives, normalised `0` for `-0`). Test vectors: `index out of bounds: -1 not in 0..3`; `invoke chain depth exceeded: 33 > 32`.

5. **Source-derived placeholders** (`<path>`, `<file>`, `<descriptor>`, `<name>`, `<field>`, `<param>`, `<variant>`, `<keyword>`, `<key>`, `<char>`) — render verbatim from the source as the offending text would appear there: path literals as the literal text inside the quotes (no realpath normalisation, per the existing convention for `loom/parse/invoke-non-loom-extension`); identifier-shaped placeholders unquoted; `<key>` quoted with double quotes only when the key is not identifier-shaped per [Lexical — Identifiers](./lexical.md); `<char>` rendered as the raw character itself when printable, or as the standard `\xNN` / `\uNNNN` escape otherwise. `<descriptor>` renders the discovery-source descriptor as a `kind:value` pair (e.g. `settings:"~/work/looms"`, `cli-flag:"--loom ./x"`, `package:"my-pkg"`); the descriptor format is normative. Test vectors: `unknown field 'wibble'` (raw identifier in quotes per the registry template); `discovery source path does not exist: settings:"~/work/looms"`.

6. **Underlying-error placeholders** (`<error.message>`, `<original content first line>`, `<dispose error first line>`) — render as the underlying string truncated to its first line, where "line" is everything before the first occurrence of `\n` (after the source string has been newline-normalised per [Lexical — Encoding](./lexical.md), so `\r\n` and `\r` collapse to `\n` first); trailing whitespace on the resulting line is preserved (no rstrip). When the underlying string is empty, render as `<no message>` (literal). Test vectors: `system-note delivery failed: file:5:3: loom/parse/binding-case-mismatch: ...`; `system-note delivery failed: <no message>` for an `Error` constructed with no message.

Edge cases the implementer must watch:

- The `<scrutinee summary>` truncation rule is the only category that introduces a hard length cap. A test that constructs an exactly-80-character string scrutinee MUST observe the full string (no truncation); 81 characters MUST observe the truncated form. Boundary-condition test vectors are mandatory.
- Category 5's identifier-shape predicate for `<key>` is a runtime check on the key string — the loom-side identifier rule in [Lexical — Identifiers](./lexical.md), not a parse-time grammar production. A key like `kind` renders bare; `"my-key"` renders quoted.
- Category 6's "first line" semantics interact with `\u2028` / `\u2029` (Unicode line separators that the lexical-newline rule does *not* recognise). The fix should explicitly state that only `\n` (post-normalisation) is a line break for placeholder-rendering purposes; `\u2028` is an ordinary character. Without this, a host throwing an `Error` whose message happens to embed `\u2028` produces inconsistent first-line cuts across implementations.
- The closed token-name table for `<construct>` (category 3) is itself a normative surface: adding a token name is a spec-versioned breaking change, exactly as the registry is. The fix should add an explicit pointer to GOV-7 / GOV-8 from this subsection so the governance posture is unambiguous.

## Related Findings

- "`loom/parse/empty-schema-body` and `loom/parse/non-string-discriminator` missing from registry" — same-cluster (registry-completeness defect; resolves independently)
- "`loom/type/*` namespace declared but empty; type-check codes live in `loom/parse/*`" — same-cluster (registry-shape defect; resolves independently)
- "`loom/lex/*` phantom namespace in registry section heading" — same-cluster (registry-shape defect; resolves independently)
- "`binder-malformed-envelope` code not in the diagnostics registry" — same-cluster (registry-completeness defect; the code, when added, will inherit the placeholder rendering rules from this fix)
- "Echo policy: \"special characters\" undefined; \"first field\" ordering undefined" — same-cluster (parallel testability gap on a different normative-template surface; the same fix posture — closed enumeration plus normative test vectors — applies, but the targets are different files)

---

## spec_topics/binder.md

---

# Untestable advisory prose embedded in normative binder sections

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Multiple untestable quality assertions and advisory language in normative prose
**Kind:** testability

## Finding

Three sentences in `spec_topics/binder.md` sit inside normative sections but cannot be reduced to pass/fail conformance criteria, because they assert qualities (capability, suitability, statistical likelihood) without operational thresholds:

1. **Binder model — capability claim.** "Binder calls are structurally function-calling tasks — schema in, JSON out — and a cheap tier-2 model (Claude Haiku, GPT-4o-mini, Gemini Flash, etc.) is more than capable" (`binder.md` §"Binder model"). No accuracy floor, eval set, or task-success metric is given. The actual normative obligation in this paragraph — the strict structured-output / strict-tool-input capability gate and the `loom/load/binder-model-unresolved` failure code — is specified separately and is testable on its own; the "more than capable" sentence adds no obligation that V16e or any other leaf could assert.

2. **Binder context — usage guidance.** Both `bind_context` bullets close with a "right choice when …" sentence (`binder.md` §"Binder context"): `none` is "the right choice when arguments are self-contained"; `session` is "the right choice when the loom relies on conversational anaphora." These prescribe author taste, not runtime behaviour. The runtime obligation is unchanged whichever value the author picks (and is captured by V16f / V16g).

3. **Determinism — distribution claim.** "Two different looms produce different seed values with overwhelming probability" (`binder.md` §"Determinism"). No distinguishability threshold is given, no test could fail on this, and the surrounding paragraph already carries the testable obligation ("Conforming implementations MUST reproduce these values exactly", plus the three reference vectors `code-review` / `hello` / `a`). For context: this sentence is *not* a backstop against any registration-cache collision path — `loom/runtime/registration-cache-collision` (per `diagnostics.md` and `pi-integration-contract.md`) covers SHA-256 hashes of *lowered tool schemas*, not FNV-1a binder seeds, and binder seeds are not used as registration keys at all. The sentence is pure reassurance about FNV-1a's distribution properties.

In each case the surrounding paragraph already carries the testable normative content; the offending sentence is editorial colour that an implementer or test author could mistake for an obligation.

## Spec Documents

- `spec_topics/binder.md` — §"Binder model" (edited)
- `spec_topics/binder.md` — §"Binder context" (edited)
- `spec_topics/binder.md` — §"Determinism" (edited)
- `spec_topics/diagnostics.md` — §`loom/runtime/registration-cache-collision` row (read-only, to confirm collision-path scope)
- `spec_topics/pi-integration-contract.md` — §"Provider seed-field mapping" / registration cache (read-only, to confirm seed is not a registration key)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The fix moves no normative obligation. V16e — `bind_model` resolution chain — already pins the strict-capability gate and the unresolved-model failure; V16f / V16g already pin `bind_context` runtime behaviour; V16h already pins `temperature: 0`, the FNV-1a algorithm, and the three reference vectors. None of those leaves' Tests / Ships-when criteria reference the three sentences being demoted.)

## Consequence

**Severity:** cosmetic

A reviewer or test author working from the normative text alone may waste cycles trying to operationalise "more than capable", "right choice when …", or "overwhelming probability" — or may quietly skip them and leave a feeling that part of the spec is unchecked. No observable runtime behaviour and no leaf acceptance criterion is at risk.

## Solution Space

**Shape:** single

### Recommendation

Demote the three sentences to non-normative status in place, keeping the surrounding normative paragraphs intact. Concrete edits to `spec_topics/binder.md`:

1. **§"Binder model"** — replace the trailing clause "and a cheap tier-2 model (Claude Haiku, GPT-4o-mini, Gemini Flash, etc.) is more than capable; authors with unusually subtle schemas can override per-loom by setting `bind_model:`." with a paragraph break followed by:

   > **Note (non-normative):** Binder calls are structurally function-calling tasks (schema in, JSON out), so cheaper structured-output-capable models (e.g. Claude Haiku, GPT-4o-mini, Gemini Flash) are usually adequate; authors with unusually subtle schemas can override per-loom via `bind_model:`. The model-selection guidance is advisory only — the only normative requirement is the strict-capability gate above.

2. **§"Binder context"** — strip the "The right choice when …" sentence from each of the two bullets, then append a single non-normative paragraph after the bullet list:

   > **Note (non-normative):** Use `bind_context: none` when the slash arguments are self-contained (e.g. `/code-review TypeScript focusing on error handling, by Ada Lovelace`). Use `bind_context: session` when the loom relies on conversational anaphora (e.g. `/review the spec` resolving "the spec" against the surrounding session). The choice is an authoring decision; runtime behaviour for each value is fully specified above.

3. **§"Determinism"** — delete the trailing clause "; two different looms produce different seed values with overwhelming probability." from the sentence ending "across processes and runs". Optionally append a non-normative footnote:

   > **Note (non-normative):** FNV-1a 32-bit is non-cryptographic and offers no collision guarantees; the hash is used only to make the per-loom binder seed deterministic across processes, not as a registration key (registration-cache collisions are governed by `loom/runtime/registration-cache-collision`, which hashes lowered tool schemas under SHA-256, not binder names).

Edge cases for the editor:

- Use the project's existing non-normative marker convention (`> **Note (non-normative):**` per the original `Suggested fix`) so the demotion is mechanically detectable.
- Do not rephrase the surrounding normative sentences; the load-failure code, the strict-capability obligation, the `temperature: 0` / FNV-1a contract, and the three reference vectors must read identically after the edit.
- Keep the `bind_context` bullet labels (`none` — …; `session` — prompt-mode-only; …) intact; only the trailing "right choice when …" sentence is removed from each.

## Related Findings

- "`tool_loop` \"calibrated\" rationale in normative prose" — same-cluster (identical pattern: design-rationale prose in `frontmatter.md`; same demotion-to-non-normative remedy)
- "\"Millisecond-scale\" performance claim without a testable threshold" — same-cluster (identical pattern in `cancellation.md`; same demotion-or-quantify remedy)
- "Binder model bullet: two independent obligations, no identifiers" — co-resolve (touches the same `binder.md` §"Binder model" paragraph; the suggested split into two GOV-N entries is naturally done in the same edit pass that demotes the "more than capable" clause)

---

# Binder system prompt: "information content is normative" lacks a verifiable field set

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** "Information content is normative" — system prompt not mechanically verifiable
**Kind:** testability

## Finding

`spec_topics/binder.md` § *Binder system prompt* introduces the rendered prompt with: "The exact wording is not part of the contract; the *information content* below is normative." It then shows a fenced block that mixes literal text (`Loom: /<name>`, `Description: …`, `Parameters:`, `User arguments: …`), template directives (`<for each param: "  <name> (<type>) <required|default=<value>> — <description if any>">`), conditional blocks (`[Recent session context (when bind_context: session): …]`), and a closing instruction list (the three envelope kinds and the no-invent-defaults rule).

A conformance test cannot assert "information content" directly. To pass-fail the prompt rendering it must either (a) match exact strings — which the spec explicitly forbids — or (b) check for specific structural fields. Path (b) is the right one, but the spec never enumerates which fields are required, in what shape, or under which conditions. Two implementers reading this section will disagree on, for example: must the literal token `Loom:` appear, or merely *some* line that conveys the loom name? Is the per-parameter line format (`  <name> (<type>) <required|default=<value>> — <description if any>`) a normative shape implementers must reproduce, or just one illustrative rendering? Must the `Argument hint:` line be omitted when `argument-hint:` is absent (V16f tests assert this), and must the analogous suppression apply to `Description:` when frontmatter has no description? Is the `[Recent session context …]` block's bracket-and-label framing part of the contract or freely re-skinnable? Is the envelope-kinds enumeration normative content the model must see, or vendor-replaceable framing?

The downstream consequence is concrete: V16f and V16g will land with idiosyncratic test sets that pin whatever the first implementer happened to render, and a second implementation that conveys the same information differently will fail those tests despite being spec-conformant. Either the per-implementation tests over-fit (re-introducing the exact-wording contract the spec tried to disclaim) or they under-test (asserting nothing beyond "the prompt is non-empty"). Neither outcome matches the section's stated intent.

## Spec Documents

- `spec_topics/binder.md` — *Binder system prompt* (edited)
- `spec_topics/binder.md` — *Binder context* + *Session-context truncation* (read-only — defines what the `bind_context: session` block contains)
- `spec_topics/frontmatter.md` — `description:`, `argument-hint:`, `params:` (read-only — drives which fields are present/absent)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16f — `bind_context: none` — (modified)
- V16g — `bind_context: session` truncation — (modified)
- V16e — `bind_model` resolution chain — (read-only; consumes the prompt but does not test its shape)

## Consequence

**Severity:** correctness

Two reasonable implementers will produce binder prompts that look superficially similar but disagree on which lines, labels, and conditional suppressions are part of the contract. Their conformance tests will diverge accordingly: one suite will pass against its own renderer and fail against the other's, even though both honour the section's stated intent. The downstream binder-model behaviour (whether the LLM correctly extracts arguments) is also affected, since structured-output models cue on label tokens — `Parameters:` vs `Args:` vs no label at all is not behaviourally neutral.

## Solution Space

**Shape:** single

### Recommendation

Replace the "information content is normative" framing with an explicit list of normative structural obligations on the rendered prompt, keeping the fenced example as illustrative. The list should pin each field that V16f / V16g tests need to assert, with the conditional-presence rules made explicit.

Add a subsection — *System-prompt structure (normative)* — to `binder.md` immediately under the fenced example, containing the following obligations. Wording may vary; the listed tokens, line-prefixes, and conditional rules are the contract:

1. **Loom identity line.** A line of the form `Loom: /<name>` MUST appear, where `<name>` is the bare slash command name (no leading `/`, matching the FNV-1a-hashed string from the *Determinism* section). Exactly one such line per prompt.
2. **Description line.** When the loom's frontmatter `description:` is non-empty, a line of the form `Description: <description>` MUST appear. When `description:` is absent or empty, the line MUST be omitted (no `Description:` with empty value).
3. **Argument-hint line.** When frontmatter `argument-hint:` is non-empty, a line of the form `Argument hint: <value>` MUST appear exactly once. When absent, the line MUST be omitted. (V16f already tests this; the rule is restated here for symmetry.)
4. **Parameters block.** When `params:` declares ≥1 field, the block MUST contain a header line `Parameters:` followed by one indented line per declared field, in declaration order. Each per-field line MUST contain the field's wire name, its declared type rendered per the binder's type-display convention (defined separately — see edge cases), and one of the tokens `required` or `default=<literal>` where `<literal>` is the default rendered in Loom literal syntax. When the field carries a non-empty `description:`, the line MUST also include that description; when absent, the description segment MUST be omitted. When `params:` is absent or empty, the entire `Parameters:` block (header + per-field lines) MUST be omitted.
5. **User-arguments line.** A line of the form `User arguments: <raw>` MUST appear, where `<raw>` is the raw slash text after the command name with leading/trailing whitespace stripped but no other normalisation. When the user supplied no arguments, `<raw>` is the empty string and the line still appears (with an empty value after the colon-space).
6. **Session-context block.** When `bind_context: session` and the truncation walk produced ≥1 included turn, the prompt MUST contain a delimited block whose opening line begins `Recent session context` and whose body is the truncated transcript per *Session-context truncation*. When the walk produced zero included turns (single oversized newest turn, empty session, or `bind_context: none`), the block MUST be omitted entirely (no header, no empty body).
7. **Envelope-kinds enumeration.** The prompt MUST list all three envelope kinds (`ok`, `needs_info`, `ambiguous`) by name. The exact phrasing of each kind's description is non-normative; the three kind-name tokens are normative.
8. **No-invent-defaults instruction.** The prompt MUST contain an instruction directing the model not to invent values for defaulted parameters the user did not specify. Wording is non-normative; the instruction's presence is.

Edge cases the implementer must watch:

- The per-field type-display convention (item 4) is itself unspecified. Pin it in the same edit: the type rendering MUST be the field's declared Loom type written in surface syntax (`string`, `int`, `Severity`, `array<int>`, `Cat | Dog`), not the JSON Schema form. Add one normative test vector per primitive and one per each compound (array, enum, discriminated union).
- The default-literal rendering (item 4, `default=<literal>`) MUST use the same Loom literal sublanguage parsed by V16a, so a default of `Severity.High` round-trips as `default=Severity.High` and a string default round-trips with double quotes.
- Items 2, 3, 4, and 6 are conditional-presence rules. The V16f / V16g test suites MUST include a negative assertion per condition (the line / block does not appear when the trigger is absent), not just a positive assertion when the trigger is present.
- The fenced example in the spec should be updated to be self-consistent with these rules — currently the example uses the template directive `<for each param: …>` rather than showing a worked-out parameter line, which has misled reviewers into reading the directive itself as normative shape.

## Related Findings

- "Echo policy: 'special characters' undefined; 'first field' ordering undefined" — same-cluster (sibling testability gap in `binder.md`; both replace prose hand-waves with closed enumerations and test vectors)
- "Multiple untestable quality assertions and advisory language in normative prose" — same-cluster (general untestability sweep across `binder.md`; this finding is one specific instance the sweep should also catch)
- "Diagnostic message placeholder rendering not defined" — same-cluster (analogous template-with-placeholders problem; the *Failure-mode templates* table has the same "rendered character-for-character with placeholders interpolated" issue this finding raises for the system prompt)
- "Open question embedded in normative `binder.md`" — same-cluster (binder.md normative-hygiene cleanup; co-resolvable in one editing pass)

---

# Echo policy: "special characters" undefined; "first field" ordering undefined

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Echo policy: "special characters" undefined; "first field" ordering undefined
**Kind:** testability

## Finding

The `bind_echo` formatter rules in `spec_topics/binder.md` ("Echo policy") leave two predicates open, and conformance tests cannot resolve either from spec text alone.

(a) **String quoting.** Rule: *"String values quoted only when they contain whitespace or special characters."* The set of "special characters" is not enumerated. For inputs containing `,`, `[`, `]`, `{`, `}`, `"`, `\`, `=`, `/`, `:`, `;`, non-ASCII letters, or C0 control characters, two implementers will pick different membership rules and produce different rendered strings — all consistent with the current sentence. The escape convention for an embedded `"` (or `\`) inside the quoted form is also unspecified. The empty string is not addressed; the natural rendering is `""` but the rule as written would emit nothing.

(b) **"First field" ordering.** Rule: *"Object values shown as `{first-field-value, …}` — just the first field's value as a hint."* The applicable ordering is not stated. Top-level params already pin "declaration order" two bullets earlier, so an attentive reader will infer the same here, but the type system explicitly says field order is irrelevant for object-type compatibility (`type-system.md` row 8: *"Field order is irrelevant"*), which leaves the formatter's notion of "first" free-floating. Discriminated-union variants compound the question: for a value of an aliased union type, is "first field" taken from the variant the value inhabits, and does the discriminator field count?

The recursive case in the array bullet (*"a nested object element renders as `{first-field-value, …}`"*) inherits both gaps unchanged.

## Spec Documents

- `spec_topics/binder.md` — Echo policy → Format rules (edited)
- `spec_topics/binder.md` — Echo policy → Array bullet (edited; recursive reference)
- `spec_topics/schemas.md` — schema declaration syntax (read-only; supplies "declaration order" anchor)
- `spec_topics/type-system.md` — Type compatibility row 8 (read-only; "field order is irrelevant" must not be contradicted)
- `spec_topics/query.md` — Stringification of interpolated values (read-only; confirm echo formatter is intentionally distinct from the canonical interpolation table)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16i — `bind_echo` formatter — modified

(V16i's test bullet already concedes the predicate is unpinned and asks the implementer to commit to one in the test file; tightening the spec lets V16i drop that disclaimer and assert against a normative predicate instead.)

## Consequence

**Severity:** correctness

Two conforming implementers will emit different system notes for the same params (e.g. one quotes `key=value` for the `=`, the other does not; one renders `{red, …}` for a `Cat { color: "red", name: "Whiskers" }`, the other renders `{Whiskers, …}` if it picks alphabetic order). Echo strings appear in the user-facing transcript and in any test fixtures that diff system notes, so divergence is observable end-to-end.

## Solution Space

**Shape:** single

### Recommendation

Replace the two ambiguous bullets in `spec_topics/binder.md` § "Echo policy" with closed predicates and add a small block of normative test vectors.

**(a) String quoting predicate.**

> A string value renders unquoted if it is non-empty and every code point matches `[A-Za-z0-9_.-]`; otherwise it is rendered quoted. The quoted form is a U+0022 (`"`), then the string with each U+0022 replaced by `\"` and each U+005C (`\`) replaced by `\\` (no other escapes), then a closing U+0022. The empty string renders as `""`.

Notes for implementers: the predicate is over Unicode code points (any non-ASCII letter triggers quoting); whitespace, punctuation, and control characters all fall outside `[A-Za-z0-9_.-]` and therefore force quoting; only `"` and `\` are escaped — newlines cannot appear because the shared System-note rendering rule 1 has already collapsed them to spaces upstream of the formatter.

**(b) "First field" definition.**

> For the echo formatter, "first field" of an object value means the first field listed in the declaring `schema` block's source order (the same notion of order used by the top-level `params:` bullet). For a value whose static type is a discriminated union, the variant's declared fields are used in the variant's own source order; the discriminator field is included in that order if it appears there. The "field order is irrelevant" clause in the type-system compatibility table refers to type compatibility only and does not override this rendering rule.

**Test vectors to add (suggested, normative).** Place after the format-rules bullets:

| Value (declared type) | Renders as |
| --- | --- |
| `""` (string) | `""` |
| `"plain_id-1.2"` (string) | `plain_id-1.2` |
| `"has space"` (string) | `"has space"` |
| `"key=value"` (string) | `"key=value"` |
| `"with \"quote\" and \\slash"` (string) | `"with \"quote\" and \\slash"` |
| `"café"` (string) | `"café"` |
| `Cat { name: "Whiskers", color: "red" }` (schema declared `name` first) | `{Whiskers, …}` |
| `Pet::Cat { kind: "cat", name: "Whiskers" }` (variant declares `kind` first) | `{cat, …}` |
| `[]` (array) | `[]` |
| `["a", "b c"]` (array) | `[a, "b c"]` |

Edge cases the implementer must keep in mind: the line-level 120-code-point cap (rule 6) is applied *after* per-value rendering, so quoted strings that fit per-value may still be truncated by `…`; the recursive nested-object case in the array bullet automatically inherits both predicates and needs no separate restatement.

## Related Findings

- "Multiple untestable quality assertions and advisory language in normative prose" — same-cluster (same testability lens applied to other binder.md sentences; resolved independently)
- "'Information content is normative' — system prompt not mechanically verifiable" — same-cluster (sibling testability gap on a different surface)
- "Diagnostic message placeholder rendering not defined" — same-cluster (parallel "rendered text underspecified" gap in the diagnostics surface)

---

# Session-context truncation: cap-equality boundaries lack normative test vectors

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Session truncation boundary conditions unspecified
**Kind:** testability

## Finding

The session-context truncation rule in `spec_topics/binder.md` is phrased as "stops including a turn the moment the running token sum *would exceed* 8000 *or* the running turn count *would exceed* 20." Read carefully, "would exceed" is strict (`>`), so a running total of exactly 8000 tokens or a running count of exactly 20 turns includes the candidate turn; the next turn is the one excluded. This reading is consistent with the V16g plan-leaf gloss, which uses `≤ 20` and `≤ 8000` and the worked-example phrase "push the running sum *over* 8000."

The spec text itself, however, never states the boundary in `≤` form and never exercises it in a worked example. The two examples present cover (a) a strictly-overshooting fifth turn (`5600 + 2800 = 8400 > 8000`) and (b) a single oversized newest turn — both clearly on the exclusion side of the cap. A conformance test author working from the normative prose alone has no anchor that pins the cap-equality cases, and "exceed" is colloquially used both strictly and loosely. The risk is low (the V16g plan already commits to the right reading) but the testability lens is real: the spec page should surface the equality cases so that the rule and its tests can be derived from the normative section without recourse to the plan.

The same gap covers the joint-cap interaction: a worked example where the 20th turn arrives exactly at 8000 tokens (both caps simultaneously satisfied with equality) would pin both boundaries in one shot and confirm that the 21st turn is excluded by the count cap regardless of its token weight.

## Spec Documents

- `spec_topics/binder.md` — Session-context truncation (`bind_context: session`) (edited)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16g — `bind_context: session` truncation — (modified)

## Consequence

**Severity:** advisory

The rule is derivable from the existing wording and the V16g plan leaf already encodes the intended `≤` semantics, so an attentive implementer will not diverge. A less attentive implementer who reads "exceed" as `≥` would tighten the cap by one turn and one example token, producing a silent off-by-one against tests authored from the spec alone. The cost of the fix is two short worked examples; the cost of leaving it is recurring boundary debate during V16g test review.

## Solution Space

**Shape:** single

### Recommendation

Edit the **Session-context truncation (`bind_context: session`)** section of `spec_topics/binder.md` as follows:

1. **Restate the cap rule in `≤` form alongside the existing prose.** Append to the rule sentence: "Equivalently: a candidate turn is included iff, after inclusion, the running token total is ≤ 8000 *and* the running turn count is ≤ 20; the first candidate that would violate either inequality is excluded entirely and terminates the walk." This eliminates the strict-vs-loose reading of "exceed" without rewriting the existing sentence.

2. **Add two normative worked examples** immediately after the existing two, in the same paragraph style:

   - *Token-cap equality.* With per-turn counts (newest first) `[3000, 2500, 2500, 100, …]`, the walk includes the first three turns (running total exactly 8000, count 3) and evaluates the fourth: `8000 + 100 = 8100 > 8000`, so the fourth turn and everything older is dropped. Final included context: 3 turns, 8000 tokens. The cap-equality boundary is inclusive.
   - *Turn-cap equality.* With 21 turns whose running token total never exceeds 8000, the walk includes the 20 newest turns (count exactly 20) and evaluates the 21st: count would become 21 > 20, so it is excluded regardless of its token weight. Final included context: 20 turns. The 20-turn boundary is inclusive.

3. **Mirror the new vectors in V16g's Tests bullet** (`plan_topics/v16-binder.md`) so the V16g leaf cites them by name. The existing V16g tests already encode the right semantics; add one bullet per new vector to keep the coverage matrix one-to-one with the spec examples.

Edge cases the implementer must watch:
- Both caps are evaluated against the *post-inclusion* state (the candidate is hypothetically added, then the inequality is checked); this is what "would exceed" already means and what the new `≤` restatement preserves.
- The walk terminates on the first violating candidate; older turns that would individually fit are *not* reconsidered. This was already specified by "and everything older is dropped" and is unchanged.
- The single-oversized-newest-turn example continues to apply unchanged; the new cap-equality vectors do not interact with it.

## Related Findings

- "`Message` shape for `estimateTokens` and turn-walker undefined" — same-cluster (both touch the truncation algorithm in `binder.md` but resolve independently — one fixes boundary semantics, the other fixes the `Message` contract `estimateTokens` reads)

---

# Open question for a deferred feature embedded in normative `binder.md`

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Open question embedded in normative `binder.md`
**Kind:** scope

## Finding

The "Binder-invocation re-entrancy" paragraph in `spec_topics/binder.md` (the prose around the `**Binder-invocation re-entrancy.**` lead-in) closes with an explicit, unresolved design question for a *post-V1* feature:

> Open question: whether automatic escalation surfaces a user-visible turn (composing with the deferred binder refinement loop) or stays operator-only is unresolved and tracked alongside the deferral entry.

`binder.md` is a normative V1 page. The "automatic context escalation" extension it refers to is explicitly deferred — it appears as a bullet in `spec_topics/future-considerations.md` (line 45), and the same open question is already mirrored there (line 47, "tracked at the binder.md anchor"). The deferred entry is the legitimate home for the unresolved decision. Leaving a duplicate in `binder.md` mixes V1 obligations with post-V1 design uncertainty on a page implementers are meant to read top-to-bottom as binding contract.

The damage is to spec hygiene rather than V1 implementability — no V1 leaf needs to act on the question, because the feature it gates is itself deferred. But the present arrangement also makes the cross-reference circular: `binder.md` says "tracked alongside the deferral entry"; `future-considerations.md` says "tracked at the binder.md anchor". Neither side actually owns the decision.

## Spec Documents

- `spec_topics/binder.md` — "Binder-invocation re-entrancy" paragraph (edited)
- `spec_topics/future-considerations.md` — "Automatic context escalation" entry (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The open question concerns a deferred feature; no V1 leaf is blocked or modified. `V16f` (default-context binder path) and `V16g` (session-context binder path) implement the V1 surface that the re-entrancy seam exists to protect, but neither leaf consumes the open question or its resolution.

## Consequence

**Severity:** cosmetic

The retained sentence does not change V1 behaviour or block any V1 implementer — `binder.md` already states V1 issues exactly one binder call per invocation, so the re-entrancy seam is the only V1-visible artefact. The cost is to spec discipline: a normative page advertises an unresolved design choice, and the cross-reference between `binder.md` and `future-considerations.md` is circular ("tracked alongside the deferral entry" ↔ "tracked at the binder.md anchor"), so neither page actually owns the decision.

## Solution Space

**Shape:** single

### Recommendation

In `spec_topics/binder.md`, delete the trailing sentence of the "Binder-invocation re-entrancy" paragraph that begins "Open question: whether automatic escalation surfaces a user-visible turn …". The preceding sentences — describing the seam and naming the deferred extension as the motivating use case — stay; they correctly justify why the re-entrancy contract is shaped the way it is, without committing to a post-V1 design.

In `spec_topics/future-considerations.md`, edit the "Automatic context escalation" entry (around line 45) so that the open question is owned there outright, not "tracked at the binder.md anchor". Replace the existing `*Open question:*` clause with a self-contained statement, e.g.:

> *Decision required before this item can be scoped:* whether automatic escalation surfaces a user-visible turn (composing with the [Binder refinement loop](#binder-refinement-loop)) or stays operator-only.

Edge cases for the implementer of the edit:

- The `*Depends on:*` clause in the same `future-considerations.md` entry already references the refinement-loop interaction; keep it — the new wording does not subsume it.
- Do not delete the surrounding "Binder-invocation re-entrancy" paragraph in `binder.md`. The seam itself is normative V1: it pins that the binder input record and resolved model handle are constructed afresh per call, which V16e and V16f rely on.
- After the edit, `future-considerations.md` no longer cross-references `binder.md` for the open question. That is the intended state — the seam stays anchored both ways, but the unresolved decision lives in exactly one place.

## Related Findings

- "Multiple untestable quality assertions and advisory language in normative prose" — same-cluster (also non-normative content embedded in `binder.md` normative prose; resolves independently)
- "`tool_loop` \"calibrated\" rationale in normative prose" — same-cluster (parallel issue on a different page: rationale/meta-content in normative prose)

---

# `FileSystem` seam interface signature lives outside the spec corpus

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `FileSystem` seam member list lives in `plan_topics/`, not `spec_topics/`
**Kind:** implementability

## Finding

`spec_topics/pi-integration-contract.md` § *`FakeFileSystem` / `FileSystem` interface* names exactly one member — `homedir(): string` — and then defers the rest with: *"Other members (file reads, writes, stat, directory enumeration, watcher attachment) are referenced by neighbouring spec sections … The full member list is anchored in the plan's H2 leaf."* The full TypeScript signature (`readText`, `writeText`, `exists`, plus the watcher seam) is in fact only declared in `plan_topics/h2-di-skeleton.md`. The same page also defers the `SchemaValidator` interface signature (`compile`, `invalidate`, plus the `CompiledValidator.validate` shape) and the `Checkpoint` seam signature to that plan leaf, even though their behavioural contracts live in `spec_topics/implementation-notes.md` and `spec_topics/pi-integration-contract.md`.

`spec.md` ("Authoring conventions") explicitly licenses implementers to read only the topics listed in their plan leaf's **Spec** field, and the closure rule extends only to other topics cross-linked from those `spec_topics/*.md` pages. `plan_topics/h2-di-skeleton.md` is by construction a plan page, not a spec page, so it cannot appear in any leaf's **Spec** list — yet it is the only place where the load-bearing FileSystem method names and signatures are written down. An implementer of V14n (settings reader) or V18f (file watcher) who follows the spec-only reading rule has no normative source for the names `readText` / `writeText` / `exists` or for the watcher attachment surface their leaf must call.

The problem is structural, not cosmetic: the spec inverts the dependency by making a normative artefact (the seam's method shape) live in a non-normative document, while the spec page that should anchor it merely points to it. Two implementers reading only `spec_topics/` could legitimately diverge on whether `readText` returns `Promise<string>` or `Promise<Buffer>`, whether `exists` exists at all, or how the watcher hook is shaped.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — `FakeFileSystem` / `FileSystem` interface section (edited)
- `spec_topics/pi-integration-contract.md` — `Clock` / `FakeClock` interface section (option-dependent — only edited under Option B if alignment across all three seams is pursued)
- `spec_topics/pi-integration-contract.md` — Checkpoint seam section (option-dependent)
- `spec_topics/implementation-notes.md` — Runtime § Schema validation bullet, Clock bullet (option-dependent)
- `spec.md` — Authoring conventions paragraph (orientation / reading-scope rule) (option-dependent — only edited under Option A)
- `plan_topics/h2-di-skeleton.md` — H2 seam declarations (read-only — the source of truth that needs to either move or be promoted)
- `plan_topics/conventions.md` — leaf-format and Spec-field definition (read-only)

## Plan Impact

**Phases:** Horizontal, MVP, Vertical V14, Vertical V18

**Leaves (implementation order):**

- H2 — Dependency-injection skeleton with fakes — (modified)
- H4 — Pi extension shell — (modified)
- Mb — Minimal runtime + slash registration + two-root discovery + no-params overflow note — (modified)
- V14k — Discovery: global `~/.pi/agent/looms/` — (modified)
- V14l — Discovery: project `.pi/looms/` — (modified)
- V14n — Discovery: settings file reads — (modified)
- V14o — Discovery: `--loom` CLI flag — (modified)
- V14p — Source priority and shadowing warning — (modified)
- V18f — File watcher (chokidar) over discovery roots — (modified)
- V18r — Settings-file watcher — (modified)

(All leaves modified in the sense that their **Spec** field gains a normative anchor — either an updated `pi-integration-contract.md` section under Option B, or `plan_topics/h2-di-skeleton.md` itself becoming a citable normative target under Option A. Implementation behaviour does not change.)

## Consequence

**Severity:** correctness

An implementer working from the spec corpus alone (as `spec.md`'s Authoring conventions explicitly permits) cannot reconstruct the `FileSystem` method surface their leaf must call. Two reasonable implementers will diverge on method names, return types, and error shapes; downstream leaves that wire through these seams (V14n's settings reader, V18f's watcher debounce, V18r's settings watcher) will be coded against incompatible contracts and only converge under code review against `plan_topics/h2-di-skeleton.md`.

## Solution Space

**Shape:** single

### Recommendation

Move the seam interface signatures (`FileSystem`, `SchemaValidator`, `Clock`, `Checkpoint`) from `plan_topics/h2-di-skeleton.md` into the spec corpus. `plan_topics/h2-di-skeleton.md` retains adapter implementation guidance and re-imports / cross-links the spec-side declarations.

**Spec edits.**

- In `spec_topics/pi-integration-contract.md` § FileSystem: replace the deferral paragraph with the full TypeScript `interface FileSystem { readText, writeText, exists, homedir, readdir, lstat }` block (the `readdir` / `lstat` members are required by the discovery ancestor-walk procedure landed by the prior `clean leaf-ENOENT` commit). Add a paragraph naming the watcher-attachment surface — pick a single shape (separate `FileWatcher` interface, or method on `FileSystem`) and spell it out, since `h2-di-skeleton.md` currently describes it as "a separate seam" but never declares it.
- In `spec_topics/pi-integration-contract.md` § Checkpoint: add the `interface Checkpoint { before(kind, site): Promise<void> }` declaration plus the `CheckpointKind` / `CheckpointSite` shapes.
- In `spec_topics/implementation-notes.md` Runtime § Schema validation bullet: append the `interface SchemaValidator { compile, invalidate }` and `interface CompiledValidator { validate }` declarations.
- Each spec-side declaration carries an HTML id (e.g. `<a id="filesystem-interface">`) so test code and plan-leaf `**Spec**` fields can reference it verbatim.

**Plan edits.**

- In `plan_topics/h2-di-skeleton.md`: replace the in-line interface declarations with `import` / cross-link references to the spec sections; keep the test bullets, the `makeRuntime` factory shape, and the Pi-type re-export comment.

Edge cases for the implementer:

- The H2 leaf's TypeScript-conformance test (`expectType<>` on production adapters) needs an unambiguous spec-side anchor it can cite — the HTML id on each spec-side declaration is the anchor.
- If `h2-di-skeleton.md`'s adapter guidance later needs to refine a signature, the spec page must be updated in lockstep — call this out in `h2-di-skeleton.md`'s preface so future editors do not silently drift the implementation away from the spec.
- The `FileSystem.readdir` / `lstat` additions support the discovery ancestor-walk that the prior commit introduced; verify the signatures align with what discovery actually calls.

## Related Findings

- "`ExtensionContext` forwarded member list: no signatures or behavioural contracts" — same-cluster (parallel pattern of a Pi-side surface whose members are referenced but not declared in the spec; resolves independently but the two fixes should adopt the same anchoring convention)
- "SDK capability list duplicates `pi-integration-contract.md`" — same-cluster (touches `pi-integration-contract.md` organisation; co-edit window)
- "'Closed under normative cross-link' definition ambiguous" — decision-dependency (clarifying what the closure rule reaches across affects whether Option A is even viable; if the closure cannot be widened to plan_topics, Option B is forced)
- "'Read these first' scope unclear relative to Spec-field permission" — same-cluster (orientation/reading-scope rules; consistent with the same edit pass)

---

## spec_topics/frontmatter.md

---

# `tool_loop` default: design rationale embedded in normative prose

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** `tool_loop` "calibrated" rationale in normative prose
**Kind:** testability

## Finding

The normative `tool_loop` paragraph in `spec_topics/frontmatter.md` (line 143) closes with:

> The default of 25 is calibrated for the agentic patterns common in V1 looms (read → search → read → write → verify); authors who know their loom needs deeper agentic chains should raise it explicitly.

This sentence sits inside an otherwise testable normative bullet but states no verifiable obligation. "Calibrated for the agentic patterns common in V1 looms" cannot be conformance-checked: there is no test that distinguishes a "calibrated 25" from an "uncalibrated 25." The author guidance in the second clause ("authors … should raise it explicitly") is advisory and addresses loom authors, not implementers; it has no place in an implementer-facing normative obligation.

The actual normative content — the default value `25` — is already stated twice in the same page: in the `tool_loop:` example block (line 22) and in the field-defaults table (line 48), each in the form `default: 25`. The rationale sentence adds no obligation that those two statements do not already carry.

## Spec Documents

- `spec_topics/frontmatter.md` — `tool_loop` prose bullet (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(V13f and V6k parse and enforce `tool_loop.max_iterations`; both already test the default of 25 and the exhaustion behaviour. Neither leaf's acceptance criteria changes when the rationale sentence is removed.)

## Consequence

**Severity:** cosmetic

A reader of the normative paragraph cannot derive any test or implementation obligation from the sentence, but the surrounding text already carries the testable default. No implementer is misled; the page reads slightly less crisply than it could.

## Solution Space

**Shape:** single

### Recommendation

Delete the sentence outright. Replace the run-on
> The default of 25 is calibrated for the agentic patterns common in V1 looms (read → search → read → write → verify); authors who know their loom needs deeper agentic chains should raise it explicitly. The cap is a ceiling, not a floor: cancellation via `AbortSignal` preempts the loop at any iteration boundary.

with the second sentence alone:
> Cancellation via `AbortSignal` preempts the loop at any iteration boundary; the cap is a ceiling, not a floor.

The default value `25` remains stated normatively in the example block (line 22) and the field-defaults table (line 48); both use the `(default: 25)` form already used for every other defaulted field on the page, so the contract is unaffected. The author-guidance fragment ("authors who know their loom needs deeper agentic chains should raise it explicitly") is true but belongs in author-facing material (a future authoring guide), not in the implementer-facing field contract — it does not need to be relocated as part of this edit.

## Related Findings

- "Multiple untestable quality assertions and advisory language in normative prose" — same-cluster (same pattern of non-testable prose embedded in a normative page; same fix shape but different page)
- "\"Millisecond-scale\" performance claim without a testable threshold" — same-cluster (same pattern: a quantitative-sounding rationale phrase that is not actually a testable threshold)

---

## spec_topics/slash-invocation.md

---

# Call chain suffix is illustrative, not normative

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Call chain suffix format illustrative, not normative
**Kind:** testability

## Finding

`spec_topics/slash-invocation.md` opens its top-level-`Err` rendering section with the explicit normative gate "**The shapes below are normative templates.** Renderers MUST emit the surrounding template text verbatim; only the `<…>` placeholders are interpolated. Conformance tests MAY assert on the exact rendered string." That gate covers the per-`kind` table. It does not cover the chain-attribution suffix, which is described one paragraph later as prose:

> When the leaf failure originated inside an `invoke`d child loom that cascaded out via `?`, the note identifies the leaf and prints the call chain (`"... from child.loom invoked at parent.loom:42"`).

The example is leading-ellipsis-prefixed and parenthesised, signalling illustrative intent. Nothing in the surrounding text fixes the separator before `from`, the path form (relative to invocation site? discovery-root-relative? `realpath`-normalised absolute?), whether the line number is 1- or 0-indexed, whether a column follows the line, whether `at` and `invoked` are normative keywords, or how a multi-hop chain is assembled — left-to-right outermost-first, right-to-left innermost-first, with `,` between hops, with a single space, etc. The same prose paragraph also says the chain "applies to every row, including the catch-all," but the per-`kind` rows themselves end with quotation marks and no continuation marker, so it is unclear whether the suffix replaces the row's terminator, is appended after a separator, or is appended as a second sentence.

V18i's tests in `plan_topics/v18-cancellation.md` already pin a specific shape (`"... from grandchild.loom invoked at child.loom:N from child.loom invoked at parent.loom:M"`), but the plan is not normative spec — implementers reading only `spec_topics/` get an example string and an `at` keyword, nothing more. Two implementers will diverge on the exact form, and conformance tests cannot cite a normative source for the assertion.

## Spec Documents

- `spec_topics/slash-invocation.md` — top-level-`Err` rendering, paragraph immediately after the per-`kind` table (edited)
- `spec_topics/errors-and-results.md` — `QueryError.invoke_callee_error` variant definition, for `inner` recursion semantics (read-only)
- `spec_topics/invocation.md` — for `realpath` / discovery-root path normalisation rules that govern `<callee_path>` and `<parent_path>` rendering (read-only)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18i — Per-`kind` formatting for prompt-mode top-level `Err` — modified

V15p (`invoke_callee_error` propagation) is read-only here: it shapes the `QueryError.inner` chain that V18i walks, but its own acceptance criteria are unaffected.

## Consequence

**Severity:** correctness

The chain suffix is part of the user-visible surface that conformance tests may assert on (per the paragraph's own rule). With only an illustrative example, two reasonable implementers will diverge on separator, path normalisation, line/column rendering, hop ordering, and the boundary between the per-`kind` template and the suffix — all observable. V18i's tests as currently written assume a particular shape with no normative anchor, so they pin the runtime to the test author's choice rather than to spec.

## Solution Space

**Shape:** single

### Recommendation

Promote the chain suffix to a normative template inside the same "shapes below are normative templates" gate. Replace the existing prose paragraph with:

> **Chain attribution.** When the leaf failure originated inside an `invoke`d child loom that cascaded out via `?` (i.e. the rendered `QueryError` is `invoke_callee_error`, possibly nested), renderers MUST append a chain suffix to the per-`kind` row above. The suffix is built by walking `inner` recursively to the leaf and emitting, for each `invoke_callee_error` hop encountered, the literal text ` from <callee_path> invoked at <parent_path>:<line>`, in leaf-first order (innermost hop first), each hop separated from the next by a single space. `<callee_path>` and `<parent_path>` are the post-`realpath` absolute paths recorded at the invocation site (per [Invocation — Path resolution](./invocation.md)); `<line>` is the 1-indexed source line of the `invoke(...)` call site in `<parent_path>` (no column). The descriptive text in the per-`kind` row is computed from the **leaf** `kind` (the innermost non-`invoke_callee_error` variant), not from the wrapper. The suffix applies to every row including the catch-all.

Edge cases the implementer must pin in the same edit:

- **Single-hop example.** Add a worked example: a `transport` failure inside `child.loom` cascaded out of `parent.loom:42` renders as `loom /entry returned Err: transport — connection reset from /abs/path/to/child.loom invoked at /abs/path/to/parent.loom:42`. The `transport — <message>` body comes from the leaf's per-`kind` row applied to the leaf `kind`, with the wrapper's `<callee_path>` from the immediate parent's record.
- **Multi-hop example.** A three-level cascade (`grandchild → child → parent`) where the leaf is `model_tool` renders as `loom /entry returned Err: tool foo failed — bad arg from /abs/grandchild.loom invoked at /abs/child.loom:7 from /abs/child.loom invoked at /abs/parent.loom:42`. Confirms leaf-first ordering and single-space hop separator.
- **Catch-all interaction.** When the leaf `kind` is unlisted, the catch-all row renders first (`<kind> — <message>` form, leaf values), then the suffix appends.
- **Path form.** Use the `realpath`-normalised absolute paths the invoke runtime already records; do not invent a discovery-root-relative form for rendering. This matches how invocation-cycle and load-time error messages already cite paths.
- **`<line>` source.** The line is the source line of the textual `invoke(` token in the parent file, not the line of the receiving binding — avoids ambiguity for multi-line `invoke(...)` calls.

V18i's existing test text already aligns with this shape; the spec edit retroactively anchors it.

## Related Findings

- "Page heading \"Invocation from Pi\" collides with \"Invocation\"" — same-cluster (same spec page, independent fix)
- "Diagnostic message placeholder rendering not defined" — same-cluster (parallel testability gap on placeholder semantics in a different registry; resolved by the same drafting discipline but in a different file)
- "Multiple untestable quality assertions and advisory language in normative prose" — same-cluster (sibling testability finding on `binder.md`; resolves independently)
- "`loom-system-note` with `display: false` and empty `content`" — same-cluster (touches the same `loom-system-note` rendering surface but a disjoint concern)

---

# Page heading "Invocation from Pi" collides with sibling page "Invocation"

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** Page heading "Invocation from Pi" collides with "Invocation"
**Kind:** naming

## Finding

Two adjacent topic pages in `spec.md`'s ToC share "Invocation" as their leading word: `spec_topics/invocation.md` (heading `# Invocation`, covering the `invoke(...)` language construct, cross-mode matrix, invoke errors, cycle detection) and `spec_topics/slash-invocation.md` (heading `# Invocation from Pi`, covering the slash-command entry point and prompt-mode `Err` formatting). The qualifier "from Pi" does not name what the page is actually about — slash-command invocation — and forces the reader to disambiguate two near-identical link texts that sit only eleven lines apart in the ToC (lines 63 and 74 of `spec.md`).

The file basename (`slash-invocation.md`), the diagnostics prefix (`SLSH`), and the existing ToC sub-description ("slash-command surface") all already use "slash" as the disambiguator. The page heading is the only place that diverges, and it is the user-visible artifact that breaks the otherwise consistent naming axis.

## Spec Documents

- `spec_topics/slash-invocation.md` — H1 page heading (edited)
- `spec.md` — ToC line 74, prose cross-references at lines 7 and 9 (edited)
- `spec_topics/cancellation.md` — link text "Invocation from Pi" (edited)
- `spec_topics/future-considerations.md` — link text (edited)
- `spec_topics/pi-integration-contract.md` — link text (edited)
- `spec_topics/pi-integration.md` — link text (edited)
- `spec_topics/invocation.md` — confirming the colliding heading (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(Plan files `plan_topics/coverage-matrix.md`, `plan_topics/v3-frontmatter.md`, and `plan_topics/v18-cancellation.md` carry the link text "Invocation from Pi" and would be touched by the rename, but no leaf's acceptance criteria, Spec field, or blocking relationship changes.)

## Consequence

**Severity:** cosmetic

Readers must perform an extra disambiguation step every time the ToC or a cross-reference cites one of the two pages. No implementation behaviour, conformance test, or diagnostic surface depends on the heading text. Cost of leaving it: a small, persistent friction in spec navigation; cost of fixing it: a one-pass rename across nine files.

## Solution Space

**Shape:** single

### Recommendation

Rename the H1 of `spec_topics/slash-invocation.md` from `# Invocation from Pi` to `# Slash-Command Invocation`. Update every Markdown link text "Invocation from Pi" → "Slash-Command Invocation" across `spec.md`, `spec_topics/cancellation.md`, `spec_topics/future-considerations.md`, `spec_topics/pi-integration-contract.md`, `spec_topics/pi-integration.md`, `plan_topics/coverage-matrix.md`, `plan_topics/v3-frontmatter.md`, and `plan_topics/v18-cancellation.md`. Update the ToC sub-description on `spec.md` line 74 to drop "slash-command surface" (now redundant with the new page name) — replace with "prompt-mode `Err` formatting, no-params overflow, call-chain note." File basename, anchor IDs (`slash-invocation.md` URL fragments), the `SLSH` diagnostics prefix, and the `# Invocation` heading on `spec_topics/invocation.md` all stay as-is. Edge case: any anchor link of the form `slash-invocation.md#invocation-from-pi` would break, but `grep` confirms none exist in the repo (only the bare file path is linked).

## Related Findings

None

---

## spec_topics/cancellation.md

---

# "Millisecond-scale" latency claim is rationale, not a testable rule

**Source:** docs/reviews/spec-review/spec-20260506-064723.md
**Original heading:** "Millisecond-scale" performance claim without a testable threshold
**Kind:** testability

## Finding

`spec_topics/cancellation.md` (Granularity paragraph) states: "Synchronous in-process work — schema lowering at file-load time, AJV validation of already-received bytes, default-merging — is not a checkpoint; it runs to completion. **These steps are millisecond-scale and off the interactive hot path.**"

The bolded sentence sits inside normative prose but does not form a verifiable criterion. No reference hardware profile is defined anywhere in the spec, no upper-bound latency is stated, and "off the interactive hot path" is a design observation rather than an obligation. A conforming implementation in which AJV validation took 500 ms could not be distinguished from a non-conforming one; conversely, no test can fail an implementation for missing the implied bound. The surrounding behavioural rule — "is not a checkpoint; it runs to completion" — is testable (V18p already exercises the AJV-uncancellable case) and carries the entire normative weight of the paragraph. The latency sentence adds rationale, not constraint.

This is the same anti-pattern flagged by the `binder.md` "calibrated"/"more than capable" findings: design intuition phrased as if it were a requirement.

## Spec Documents

- `spec_topics/cancellation.md` — Granularity paragraph (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(The non-checkpoint behavioural rule is observed indirectly via V18p's "abort observed after `ok` envelope return but before AJV validation lets validation complete" assertion; that rule is unchanged. Removing rationale prose modifies no acceptance criterion.)

## Consequence

**Severity:** cosmetic

A conformant implementer extracts the same obligation either way: the listed operations are non-checkpoints. Leaving the sentence in place clutters the normative section with unverifiable wording and weakens the spec's "every sentence in normative prose forms a test criterion" property; removing it has no behavioural consequence.

## Solution Space

**Shape:** single

### Recommendation

Delete the sentence "These steps are millisecond-scale and off the interactive hot path." from the Granularity paragraph in `spec_topics/cancellation.md`. The surrounding sentences already carry the full normative content:

> Synchronous in-process work — schema lowering at file-load time, AJV validation of already-received bytes, default-merging — is not a checkpoint; it runs to completion. No checkpoint fires inside a primitive operation (arithmetic, comparison, field/index access). …

Do not introduce a latency bound in its place: V1 has no reference hardware profile, per-call timeouts are explicitly deferred (V18o, `loom/parse/timeout-field-rejected`), and adding one would create an unenforceable obligation. If the rationale must be retained for reader orientation, fold it into a `> **Note (non-normative):**` block immediately after the paragraph rather than leaving it inline.

Edge case for the editor: confirm the deletion does not break any cross-reference. `grep -rn "millisecond" spec.md spec_topics/` should return zero hits after the edit.

## Related Findings

- "`tool_loop` \"calibrated\" rationale in normative prose" — co-resolve (same anti-pattern, same edit shape: strip the rationale clause, leave the testable obligation)
- "Multiple untestable quality assertions and advisory language in normative prose" — same-cluster (broader sweep over `binder.md` of the same testability defect; resolve independently)
- "\"Information content is normative\" — system prompt not mechanically verifiable" — same-cluster (also a testability gap in normative prose, but requires defining required fields rather than a deletion)

