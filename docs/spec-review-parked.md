# Findings parked from `spec-review.md` — pi-loom

_This file collects findings physically removed from the
consolidated spec-review document because they cannot be addressed
by the current `/fix-spec-shape-single-findings` pipeline. Each
entry records the reason for parking and the path to the per-finding
forensic report. Parked findings must be reshaped (typically by
splitting bimodal obligations, narrowing scope, demoting MUSTs,
or capping the prose the fix is allowed to add) before being
re-introduced into the live review document._

_Cascade-parked findings (parked solely because they depended on
another parked finding) typically un-park automatically once the
upstream finding's reshape is re-introduced and successfully fixed,
unless they have substantive shape problems of their own._

---

## T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

> **PARKED** — 2026-05-20T09:11:15Z
> **Reason:** Category 1 (malformed finding — Solution approach binding surface; the approach is bimodal / two-site / multi-axis, licensing the fixer's surface-expansion as a symptom). The inner spec-diff-fix-loop's surface-expansion detector fired on two consecutive backtrack-and-exclude passes without converging, AND LoopNotes contains a Category-1 discriminator (two-site / bimodal / multi-site / multi-axis / no-canonical-home). FIXCOUNTS: 6,2,3,4,3. SCORESUMS: 161,26,11,26,40 against S=25. Loop notes: Surface-expansion-irrecoverable-bimodal at two-strikes — the originating T05 Solution approach pinned a single-canonical-home design (back-reference-only glossary entry pointing at the *Naming convention* paragraph in frontmatter.md) but the pass-1 traceability fix (fix-06) extracted the binder-model rule into a new `<a id="binder-model-root-word-delta">` sub-paragraph, creating a no-canonical-home rule situation between two viable owners of the per-surface mapping; pass-2's consistency fix then committed to the new home by re-pointing the glossary, after which the bimodal approach left the spec with a back-reference target that lenses kept re-critiquing on every subsequent pass. Trust-override classifier on pass-3-rerun kept three pre-refused scope-guard-fenced findings as fix-class even after the poisoned fix was excluded, because the structural ambiguity itself — not the reframe — is the load-bearing defect. stage1=5. Snapshots retained under refs/loom/snapshots/2026-05-20T08-01-15_fb235c/* for forensics. OriginArtefactDir: c:/UnitySrc/pi-loom/.pi/tmp/spec-fix-loop/2026-05-20T07-57-26_a66fd9/_origin. Category: 1. A human must reshape this finding — declare a canonical home, split into per-site atoms, pick one branch of the bimodal approach, or enumerate the multi-axis dimensions — before re-introducing it.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-20T06-38-04_bf2b2b/t05-bind-frontmatter-vs-binder-binder-settings-diagnostics-prose-root-word-incon.md

# T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

**Kind:** naming
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced
**Decision axes:** 2

## Problem

The concept "the LLM the slash-command argument binder calls" appears across three surface conventions with two different root words: frontmatter uses `bind_` (`bind_model`, `bind_context`, `bind_echo`), while settings keys, diagnostic codes, anchors, and running prose use the longer root `binder` (`looms.binderModel`, `loom/load/binder-model-unresolved`, `## Binder model` in `docs/spec_topics/binder.md`, glossary entry `**binder**`). The per-surface case style (snake / camel / kebab) is already governed by documented conventions; the `binder` → `bind_` shortening inside the frontmatter family is not — the *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` documents the snake-case rule but is silent on this root-word delta, and the glossary has an entry for `**binder**` (the mechanism) but no entry for the binder-model concept, so the cross-surface mapping has no canonical anchor. Author-facing remediation hints that name both surfaces in one sentence (e.g. the `loom/load/binder-model-unresolved` row in `docs/spec_topics/diagnostics.md`: ``set 'bind_model:' in frontmatter or 'looms.binderModel' in settings``) read as a typo until the convention is internalised.

## Solution approach

Declare a single canonical home for the convention: extend the *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` with one sentence pinning the `bind_` (frontmatter) vs `binder` (settings, diagnostic, prose) root-word convention for the binder-related family. Add a `**binder model**` glossary entry to `docs/spec_topics/glossary.md`, alphabetised between the existing `**binder**` and `**callable set**` entries, whose body is a **back-reference** of the form `See the *Naming convention* paragraph in [frontmatter](./frontmatter.md#naming-convention) for the per-surface root-word mapping (`bind_*` frontmatter vs `binder*` / `binder-*` settings, diagnostic, prose).`, NOT a parallel statement of the convention. The convention itself is owned only by the frontmatter *Naming convention* paragraph; the glossary entry is a discoverable forward-link from a reader who lands on a `binder*` token first, not a second authoritative copy.

## Solution constraints

- Do not rename `bind_model`, `bind_context`, or `bind_echo` to `binder_model` / `binder_context` / `binder_echo`.
- Do NOT restate the per-surface mapping (the four spellings, the `bind_` vs `binder` root-word delta, the relationship to sibling `bind_` fields) inside the glossary entry — the glossary entry is a back-reference only. Any prose-level statement of the convention lives in the frontmatter *Naming convention* paragraph and only there. This is the two-site-authoring guard rec AA's mode (g) would otherwise refuse against on stage-3 passes.
- Scope the new convention sentence to the binder-model concept only: do NOT extend it to a universal claim about "every other binder-related frontmatter family surface". The `bind-context-*` and `bind-echo-*` diagnostic-code families use different patterns and are not in scope for this finding.
- Do not coin a new anchor scheme on the glossary entry; reuse the existing `<a id="..."></a>` convention sibling entries already use.

## Relationships

None

---
