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

## T01 - Terminal-outcomes aggregator carries an inverted parenthetical and an unlinked disposition

> **PARKED** — 2026-06-03
> **Reason:** Category 1 (malformed finding — Solution Space shape binding surface; the finding's `## Solution Space` declares `Shape: multiple` and its `### Recommendation` directs applying all three options sequentially A→B→C rather than selecting one survivor). The `/fix-spec-shape-single-findings` fast loop's single-shape picker cannot route a `Shape: multiple` finding; the spec-review-recommendation-applier returned requires-human and the finding cannot be mechanically collapsed to `Shape: single`. Loop notes: Shape:multiple finding whose ### Recommendation directs applying all three options sequentially (A→B→C) rather than selecting one survivor; spec-review-recommendation-applier returned requires-human and the finding cannot be mechanically collapsed to Shape: single, so the fast loop's single-shape picker cannot route it. A human must reshape this finding — collapse the Recommendation to a single survivor option, or split the finding into three independent single-shape findings (one per defect/option) — before re-introducing it.
> **Forensic report:** none (fast loop — no forensic report)

# T01 - Terminal-outcomes aggregator carries an inverted parenthetical and an unlinked disposition

**Original heading:** Terminal-outcomes paragraph (`#terminal-outcomes-aggregator`)
**Original section:** Overview
**Kind:** clarity, placement
**Importance:** medium
**Score:** 35
**Must-fix:** false

## Finding

The single ~400-word sentence anchored at `#terminal-outcomes-aggregator` (docs/spec.md line 10) carries three independent defects that should be resolved as three separate edits:

1. **Unparseable nested contrast inside the Failure-exclusion list.** The "it fails" clause enumerates hard-ceiling cases that are *excluded* from the Failure-cause enumeration. Item (a) names binder argument-binding failure (slash-load `params` arm cross-routed through ceiling #3) — and then opens a parenthetical inside (a) which asserts the opposite of the enclosing list: *"the `invoke(...)` `params` arm of ceiling #4 IS an evaluation Failure that surfaces as `Err(InvokeInfraError { cause: "validation", ... })`"*. A reader cannot reliably decide whether the `invoke(...)` arm sits inside item (a)'s exclusion scope or contradicts it. Parenthetical depth on this sentence reaches three to four levels, and the contrast that most needs to be visible to an implementer is the most deeply nested fragment.

2. **"Governed separately" with no owner pointer.** The partial-append cross-reference closes with *"mid-stream user-visible streaming fragments are governed separately"*. Every other disposition in this paragraph cites its owning section by link; this one does not. The rule does have an owner — `errors-and-results.md#mid-stream-cancellation-conversation-state` and `slash-invocation.md` ("User-visible streaming") — but a reader scanning the aggregator cannot find that owner without paraphrase search.

3. **Wrong section for an aggregator of this density.** The full enumeration — per-cause routing rules, the binder-argument-binding exclusion logic with its ceiling-#3/#4 cross-routing, the partial-append forward-link, the success/fail/cancelled trichotomy boundary, the cancellation-source wiring — is implementation-grade specification material sitting inside the product Overview. The Language section begins at line 85; an implementer scanning Language or Errors-and-Results may not realise the authoritative aggregator lives in the Overview paragraph above.

The three defects are independent (different surfaces, different fix shapes) and should be resolved in three separate edits so each lands on a stable baseline.

## Spec Documents

- `docs/spec.md` — Overview, `#terminal-outcomes-aggregator` paragraph (edited)
- `docs/spec.md` — `## Language` section header / new section anchor (option-dependent)
- `docs/spec_topics/errors-and-results.md` — `#terminal-outcomes`, `#partial-append-contract`, `#mid-stream-cancellation-conversation-state` (read-only)
- `docs/spec_topics/hard-ceilings.md` — `#ceiling-4-table` (read-only)
- `docs/spec_topics/invocation.md` — Failures section (read-only)
- `docs/spec_topics/slash-invocation.md` — User-visible streaming (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`docs/plan.md` exists but defines no leaves yet — Horizontal, MVP, and Vertical sections all read "No leaves yet — author per the template.")

## Consequence

**Severity:** advisory

Authoritative content lives in `errors-and-results.md`, the ceiling-4 table, and `invocation.md`, all of which are correctly cross-linked; a careful implementer can reconstruct the right behaviour. The defect surface is reader friction: the inverted parenthetical invites mis-classification of the `invoke(...)` `params` arm, the unlinked "governed separately" forces a paraphrase hunt, and the Overview placement hides the aggregator from anyone scanning by section name.

## Solution Space

**Shape:** multiple
**State:** shaped

The three defects are independent and the per-finding fix loop will diverge if a single edit tries to resolve all three at once. Resolve them as three sequential sub-edits in the order below, smallest first, so each later edit lands on a stable baseline.

### Option A — Replace "governed separately" with an explicit owner link

**Approach.** In the partial-append parenthetical of the aggregator paragraph, replace `mid-stream user-visible streaming fragments are governed separately` with an inline cross-reference to the canonical owners.

**Spec edits.**
- `docs/spec.md` Overview paragraph, partial-append parenthetical: substitute the phrase with `mid-stream user-visible streaming fragments are governed by [Errors and Results — Mid-stream cancellation, conversation state](./spec_topics/errors-and-results.md#mid-stream-cancellation-conversation-state) and [Slash-Command Invocation — User-visible streaming](./spec_topics/slash-invocation.md)` (or equivalent phrasing).

**Pros.** Single-sentence edit; matches the citation discipline of every other disposition in the same paragraph; zero structural change.

**Cons.** Adds another link to an already link-dense sentence.

**Risks.** None beyond the standard aggregator-vs-source lock-step (GOV-12).

### Option B — Break the Failure-exclusion contrast out of the inverted parenthetical

**Approach.** Lift the exclusion enumeration ("(a) binder argument-binding failure …; (b) ceiling #4's in-loop tool-call args row …") out of the inline `it fails (…)` clause into its own paragraph (or a short bulleted list immediately after) so the *contrasting* `invoke(...)` `params` arm is no longer nested inside item (a). State the contrast as a peer item, not as a parenthetical inside the excluded item.

**Spec edits.**
- `docs/spec.md` Overview, `#terminal-outcomes-aggregator`: after the trichotomy sentence, emit a short paragraph or bulleted list. Suggested structure:
  - *Excluded from the Failure-cause enumeration:* (a) binder argument-binding failure (including ceiling #4's slash-load `params` arm cross-routed through ceiling #3); (b) ceiling #4's in-loop model-driven tool-call args row.
  - *NOT excluded (these ARE evaluation Failures):* the `invoke(...)` `params` arm of ceiling #4, which surfaces as `Err(InvokeInfraError { cause: "validation", ... })` per [Invocation — Failures](./spec_topics/invocation.md).
- Keep the existing forward-links to `hard-ceilings.md#ceiling-4-table` and `errors-and-results.md#terminal-outcomes` on the items that already carry them.

**Pros.** Removes the three-deep parenthetical nesting; surfaces the most-likely-to-be-misread contrast at top level; preserves all existing forward-links and the spec-owned routing partition.

**Cons.** Adds a paragraph (or list) to the Overview, marginally lengthening it.

**Risks.** Editor must preserve the exact case split — the inclusion side is `invoke(...)` `params` only; the slash-load `params` arm remains excluded. Mis-paraphrase here re-introduces the original ambiguity.

### Option C — Relocate the aggregator out of Overview

**Approach.** Move the entire terminal-outcomes paragraph (after Options A and B have landed) to its proper home. Two viable destinations:

- **C1 (preferred):** a new `### Terminal Outcomes` sub-section at the head of `## Language`, immediately before the existing Language sub-sections, mirroring the role Errors and Results plays for failure detail.
- **C2:** a new top-level `## Terminal Outcomes` section between `## Language` and `## Extension Architecture`.

In both variants, leave a one-sentence pointer in the Overview ("Evaluation produces one of three terminal outcomes — success, failure, or cancellation; the closed enumeration is in [Terminal Outcomes](#terminal-outcomes)") and preserve the `#terminal-outcomes-aggregator` anchor on the relocated paragraph (per GOV-23 anchor-stability) so all inbound links continue to resolve.

**Spec edits.**
- `docs/spec.md`: cut the paragraph from Overview; paste under the chosen destination header; keep the existing `<a id="terminal-outcomes-aggregator">` anchor on the relocated paragraph.
- `docs/spec.md`: insert a one-sentence orientation pointer in the Overview where the paragraph used to live.
- No edits to topic pages — all forward-links remain valid.

**Pros.** Aligns the abstraction level of Overview with the rest of the section; gives implementers scanning by section name a discoverable home; trims the Overview to product-level abstraction by keeping implementation-grade enumerations in their owning sections.

**Cons.** Larger diff than A or B; touches section structure.

**Risks.** Anchor stability: the `#terminal-outcomes-aggregator` id must travel with the paragraph or every inbound link breaks. Verify by grepping `terminal-outcomes-aggregator` across `docs/` before and after.

### Recommendation

Resolve in the order **A → B → C** so each fixer agent works against a stable baseline:

1. **A first** — smallest scope-bounding edit (one phrase swap), no structural change, removes a defect that is currently invisible to the placement decision.
2. **B second** — restructures the contrast inside the paragraph; reduces the paragraph's parenthetical depth, which in turn makes C's cut-and-paste mechanical rather than interpretive.
3. **C last** — relocate the now-cleaned paragraph. Prefer **C1** (sub-section of `## Language`); reserve C2 for the case where reviewers judge the aggregator co-equal to Language and Extension Architecture rather than subordinate to Language.

Edge cases the implementer must watch on C: (i) the `#terminal-outcomes-aggregator` anchor must move with the paragraph; (ii) the Overview pointer left behind must still name the trichotomy by its three outcomes so a reader who never clicks through still learns the shape.

## Relationships

None

---
