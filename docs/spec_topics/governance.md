# Governance

*Audience.* This page is directed at spec maintainers and at the coverage-matrix closing CI gate (specified in the plan corpus), not at implementers of the loom runtime. It governs the spec corpus itself — how REQ-IDs are coined, anchored, retired, and gated — and sources no software requirement on the runtime, the binder, the type system, or the Pi integration. Implementers who restrict their reading per GOV-10 will reach this page only via the initial REQ-ID anchor pass and the coverage-matrix closing gate (both specified in the plan corpus).

This page owns the spec corpus's REQ-ID governance: the per-page prefix table, the per-prefix retirement registry, and the rules (GOV-1 through GOV-12, GOV-14, GOV-15; GOV-13 retired — see [Retired REQ-IDs](#retired-req-ids)) that govern how REQ-IDs are coined, anchored, retired, and gated. The rules apply to every non-narrative page under `spec_topics/`; tooling enforcement lives in the coverage-matrix closing CI gate (specified in the plan corpus).

## REQ-ID prefix table

**GOV-1 (anchor placement).** Each spec page that carries normative obligations is assigned a stable per-page REQ-ID prefix (table below). The initial REQ-ID anchor pass (specified in the plan corpus) inserts `PREFIX-N` anchors into each non-narrative page in the table.

- **Canonical form.** Each REQ-ID's defining anchor is the inline `**PREFIX-N.**` marker. The bold-with-period decoration is normative: it distinguishes anchor sites (`**BNDR-7.**`) from back-references (`per BNDR-7`) and is the witness pattern for the anchor-insertion gate, the Reused-ID gate, and the Dense-numbering gate (all specified in the plan corpus). Tooling that emits or consumes anchors MUST treat the bold-with-period bytes as part of the anchor form.
- **Required HTML-anchor contexts.** The `<a id="prefix-n"></a>` HTML form MUST accompany the inline marker at every REQ-ID anchor site, in each of the four enumerated contexts below. These are the cases where the inline marker is not by itself a sufficient anchor (Markdown bold-with-period either does not render, breaks the surrounding construct, or — being rendered as bold text — does not by itself produce a stable URL fragment in any common Markdown renderer):
    - inside a Markdown table cell;
    - inside an ATX heading (`#` … `######`);
    - on the line immediately preceding a fenced code block whose content is the rule's normative example;
    - in body-paragraph context, where the inline marker renders fine as bold text but does not by itself produce a stable URL fragment in any common Markdown renderer, so the HTML form is the canonical fragment source for body-paragraph REQ-IDs (the three rendering-driven contexts above each carry their own per-context placement mechanics in *Edge cases* below — heading-slug repointing for ATX headings, the table-cell leading-token rule, and the line-preceding-a-fenced-code-block placement). *Body-paragraph context* is defined operationally as the negation of the three rendering-driven contexts above: every source-line position that is neither inside a Markdown table cell, nor inside an ATX heading, nor on the line immediately preceding a fenced code block whose content is the rule's normative example. This explicitly includes prose paragraphs, top-level and nested unordered list items, ordered list items, blockquote bodies, definition-list bodies, footnote bodies, and the line *following* a fenced code block.

  The HTML form is permitted only as part of a dual-form pair (per *Dual-form layout* below — i.e. co-located on the same source line as an inline `**PREFIX-N.**` marker) in one of the four enumerated contexts above; no other source-line position permits the HTML form. A bare `<a id="prefix-n"></a>` anchor with no co-located inline marker on the same line is not a GOV-1 anchor; the anchor-insertion CI gate (specified in the plan corpus) MUST exit non-zero on any such bare HTML anchor, and the plan corpus is the normative source for the gate's failure surface (exit code, per-offence message format, accumulation semantics, and output stream), parallel to GOV-2's floor obligation. A REQ-ID inside a fenced code block, an inline code span, or an HTML comment is neither an anchor nor a back-reference and is invisible to GOV-3 extraction (per the exclusion list in GOV-3 below). *Multi-context overlap.* The dual-form anchor is required in every one of the four contexts above, so the applicability question never depends on which context a site is classified under; only the per-context *mechanics* in *Edge cases* below differ. When a REQ-ID anchor site syntactically matches more than one enumerated context (e.g. a table-cell marker whose row is followed by a fenced code block, or an ATX-heading marker whose line precedes a fenced code block), the more-specific (rendering-driven) context determines which *Edge cases* mechanics apply, in this fixed precedence order: (1) table-cell, (2) ATX-heading, (3) line-preceding-a-fenced-code-block, (4) body-paragraph (which by construction cannot overlap with any of the three rendering-driven contexts, per the operational definition above). The first context whose syntactic conditions the site satisfies wins; lower-ranked matches are suppressed for the purposes of selecting *Edge cases* mechanics.
- **Dual-form layout.** When the HTML form is used, it MUST appear on the same source line as the inline marker, in the order `<a id="prefix-n"></a> **PREFIX-N.**` — the HTML anchor first, a single ASCII space, then the inline marker. This ordering keeps the inline marker adjacent to the rule text it introduces and gives the coverage-matrix gate a single regex to anchor against (`<a id="prefix-n"></a> \*\*PREFIX-N\.\*\*`). The regex is matched line-by-line against each source line after stripping (a) any leading ASCII whitespace, and (b) a Markdown block-prefix sequence built from the closed grammar below; the dual-form pair MUST be the first non-prefix tokens on the line. Tabs anywhere in the line-prefix region (i.e. before the dual-form pair) are normalised to spaces per CommonMark before stripping. The permitted block-prefix sequence has three ordered slots, each independently optional, in this fixed order; each slot's prefix bytes MAY be preceded by ASCII whitespace per CommonMark indentation rules:

  1. **Blockquote slot.** Zero or more `> ` blockquote prefixes (so `> `, `> > `, `> > > `, etc. all match).
  2. **List-item slot.** Zero or one list-item marker, drawn from:
     - an unordered-list marker `- `, `* `, or `+ `; or
     - an ordered-list marker `<digits>.` or `<digits>)`, in either case followed by a single ASCII space.
  3. **Construct-marker slot.** Zero or one construct-marker prefix, drawn from:
     - a table-cell leading `|` with optional surrounding ASCII whitespace (per CommonMark/GFM table syntax — i.e. an optional leading-pipe at column 0 plus the inter-cell pipes that separate cell content);
     - an ATX-heading `#{1,6} ` (one to six `#` characters followed by a single ASCII space);
     - a definition-list body marker `: ` (colon followed by a single ASCII space); or
     - a footnote body marker `[^<identifier>]: ` (a footnote label `[^<identifier>]` followed by colon and a single ASCII space).

  Slots are stripped in the order 1 → 2 → 3; no other ordering is recognised. A prefix from a later slot appearing before a prefix from an earlier slot on the same line, or two prefixes drawn from the same slot 2 or slot 3 on the same line (the slot-1 `> ` is the only prefix that may repeat, per its zero-or-more cardinality), is not stripped, so the dual-form pair is not the first non-prefix tokens on the line and the witness regex fails. The legal compositions therefore include `> - `, `> > - `, `> > > 1. `, and a blockquoted ATX heading `> ## `, while `- > ` and `## - ` are not recognised.

  This strip-list MUST stay co-extensive with the union of (a) the table-cell and ATX-heading rendering-driven contexts enumerated in *Required HTML-anchor contexts* above and (b) every construct enumerated in the body-paragraph operational definition there (which is what brings definition-list bodies, footnote bodies, list items, and blockquote bodies into scope). Adding a new context to either side of *Required HTML-anchor contexts* without extending this strip-list (or vice versa) is a spec defect: the witness regex would either reject every legal anchor in the new context or silently extend by implementer guess. In the three rendering-driven contexts (table cells, ATX headings, and the line preceding a fenced-code-block normative example), the mechanics of placing the dual-form anchor are governed by *Edge cases* below. Enforcement lives in the anchor-insertion CI gate (specified in the plan corpus); the plan corpus is the normative source for the gate's failure surface (exit code, per-offence message format, accumulation semantics, and output stream). *Transitional rule (retires once the backfill commit lands).* The MUST clause in *Required HTML-anchor contexts* above binds from the commit that lands the initial REQ-ID anchor pass (specified in the plan corpus) forward — that pass owns the one-shot backfill of pre-existing REQ-IDs without the HTML form across the corpus, in any of the four enumerated contexts (every REQ-ID anchor site under every live prefix in the [REQ-ID prefix table](#req-id-prefix-table) — including GOV-1 itself, and whether in body-paragraph, table-cell, ATX-heading, or line-preceding-a-fenced-code-block context — that lacks the HTML form today). Until that commit lands, the anchor-insertion CI gate treats pre-existing REQ-IDs without the HTML form (in any of the four contexts), and pre-existing bare `<a id="prefix-n"></a>` anchors whose inline `**PREFIX-N.**` marker lives on a different source line (as for GOV-14 and GOV-15 on this page today), as review-only backlog and MUST NOT fail the build on them; only newly added or edited REQ-ID anchor sites are gated. The backfill commit owns rewriting those legacy bare anchors into proper dual-form pairs. The backfill itself is GOV-8 *Pure rewording* — adding the dual-form HTML anchor next to an existing `**PREFIX-N.**` marker leaves the rule's normative sentences unchanged and so existing REQ-IDs survive en-masse rather than retiring under GOV-8 *Split* / *Deletion*; the modal-force shift introduced by this commit applies to the page-level rule (GOV-1 itself), not to any individual rule's `**PREFIX-N.**` paragraph.
- **Edge cases.** Inserting an anchor inside an ATX heading shifts the heading's auto-generated GitHub fragment ID; where every affected in-corpus cross-link can be repointed atomically with the anchor insertion, the anchor-insertion pass MUST repoint each such cross-link in the same edit. When repointing the heading-slug fragment is impractical in the same edit (e.g. the heading slug is referenced from outside the spec corpus or the cross-link cannot be repointed atomically with the anchor insertion), the entire dual-form pair (`<a id="prefix-n"></a> **PREFIX-N.**`) MUST instead be placed on the source line immediately preceding the heading, and the heading text MUST NOT carry the inline `**PREFIX-N.**` marker. In that case the anchor site classifies as body-paragraph context per the operational definition in *Required HTML-anchor contexts* above (the line preceding an ATX heading is body-paragraph by negation, since it is not itself inside the heading), so the *Dual-form layout* same-source-line MUST and witness regex apply normally with no ATX-heading-specific carve-out. Inside a table cell, the dual-form pair (`<a id="prefix-n"></a> **PREFIX-N.**`, in the order specified by *Dual-form layout* above) MUST be the cell's leading token sequence; where carrying the rule body in the cell would distort column widths, lift the entire rule out of the table — the cell then carries only a back-reference (e.g. `per PREFIX-N`) and the dual-form pair sits at the start of the rule's body-paragraph source line outside the table, per *Dual-form layout*. In the line-preceding-a-fenced-code-block context, the dual-form pair (`<a id="prefix-n"></a> **PREFIX-N.**`, in the order specified by *Dual-form layout* above) MUST appear on the source line immediately above the opening fence, with no intervening blank line, and that line MUST NOT carry any other content. The line-preceding-a-fenced-code-block *rendering-driven context* (and its per-context placement mechanics) is reserved for code blocks whose content is the rule's normative example; the line preceding a decorative or illustrative fence does not classify as that context and so does not invoke its per-context mechanics. Such a line is body-paragraph context per the operational definition in *Required HTML-anchor contexts* above, so a dual-form REQ-ID anchor on that line is still required if the line carries an inline `**PREFIX-N.**` marker — it is governed by the body-paragraph mechanics, not by the line-preceding-a-fenced-code-block context. Body-paragraph context carries no per-context edge case beyond the *Dual-form layout* same-source-line MUST: the dual-form pair (`<a id="prefix-n"></a> **PREFIX-N.**`) sits at the start of the body-paragraph source line that carries the inline marker, and any list-item / blockquote / nested-block indentation that precedes the pair is handled by the witness-regex anchoring rule rather than by a body-paragraph-specific carve-out here.

**GOV-2.** The plan's coverage matrix is keyed per REQ-ID, mapping each ID to its closing leaf. The coverage-matrix closing CI gate treats any unmapped REQ-ID as a CI failure. The plan corpus is the normative source for the gate's failure surface (exit code, per-offence message format, accumulation semantics, and output stream). The floor obligation carried by GOV-2 itself is that the gate exits non-zero on any violation; the rest of the surface is fixed by the plan leaf.

**GOV-3.** REQ-ID prefixes are byte-exact uppercase ASCII tokens of length 2–4 (`[A-Z]{2,4}`). Prefix matching is case-sensitive; `lex-1` does not match `LEX-1`. REQ-ID extraction operates on raw Markdown source bytes, not on rendered HTML. Before regex application, the following are stripped, in order: (i) fenced code blocks (` ```…``` ` and `~~~…~~~`, inclusive of fence lines), (ii) HTML comments (`<!--…-->`), (iii) inline code spans (`` `…` `` and the multi-backtick variants). Markdown link text is in scope; link targets are out of scope. The exclusion-stripped corpus is the input that the coverage-matrix closing CI gate consumes.

Two regexes apply:

1. **Primary extractor** (used by the anchor pass and by the appropriate coverage-matrix gates per the plan corpus): `\b(<live-prefix-alternation>)-[1-9][0-9]*\b`, where `<live-prefix-alternation>` is built from the prefix table below at gate time (never hard-coded). Leading zeros in the numeric tail are forbidden.
2. **Unknown-prefix detector** (used by the unknown-prefix gate only): `\b[A-Z]{2,4}-[1-9][0-9]*\b`, applied to the same exclusion-stripped corpus. Any token that matches but whose prefix is not in the live + retired union fails the gate.

Pages whose row in the prefix table below carries the literal cell `(no IDs — narrative)` are excluded from extraction; all other rows in `spec_topics/*.md` are in scope. The exclusion cell's canonical byte sequence is `(no IDs — narrative)` — open paren, `no IDs`, ASCII space, U+2014 EM DASH, ASCII space, `narrative`, close paren — and cosmetic variants (smart quotes, trailing whitespace, en-dash, ASCII double-hyphen) are not recognised and silently change the page's exclusion status; the prefix-table parser used by the coverage-matrix gate MUST compare bytes.

IDs are immutable: when a rule is split, the original ID retires and two new IDs appear; numbering never collapses to fill holes.

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
| `hard-ceilings.md` | `CEIL` |
| `pi-integration.md` | (no IDs — narrative) |
| `grammar.md` | `GRAM` |
| `governance.md` | `GOV` |
| `glossary.md` | (no IDs — narrative) |
| `overview.md` | (no IDs — narrative) |
| `influences.md` | (no IDs — narrative) |
| `comparison.md` | (no IDs — narrative) |
| `related-work.md` | (no IDs — narrative) |
| `future-considerations.md` | (no IDs — narrative) |

**GOV-4 (per-row invariant).** The prefix → page binding is append-only and immutable: once a prefix is allocated to a page (per GOV-7 *Add* or GOV-7 *Narrative-to-normative promotion*), the binding never changes silently and the prefix is never reassigned to a different page (per GOV-7 *Delete* and GOV-7 *Normative-to-narrative demotion*, retired prefixes move to the *Retired prefixes* sub-table below and are never reused). The *table rows themselves* are NOT immutable — GOV-7 *Rename* updates the Page column without changing the prefix, and GOV-7 *Delete* / *Merge* / *Normative-to-narrative demotion* remove or relocate rows. Introducing a new non-narrative page requires appending a new row whose prefix is *previously-unused* — meaning absent from both this table and the *Retired prefixes* sub-table below. The live table's `Prefix` column is a key — duplicate live `Prefix` values, and any live prefix that also appears in the *Retired prefixes* sub-table, are CI failures (enforced by the prefix-uniqueness gate specified in the plan corpus).

**GOV-5 (disjoint-prefix rule).** Each row's `Prefix` value is a complete identifier token, not a search prefix. Tooling that consumes REQ-IDs MUST anchor matches at a word boundary on both ends (`\b<PREFIX>-[0-9]+\b`); two prefixes that share a common substring (e.g. `BNDS` / `BNDR`) MUST NOT be treated as aliases or as one prefix-matching the other.

**GOV-6 (table-completeness invariant).** At every commit on `main`, the set of prefixes appearing in REQ-IDs across `spec_topics/*.md` is a subset of the union of (live prefix table, Retired prefixes sub-table). The coverage-matrix closing CI gate enforces this; the plan corpus is the normative source for the gate's failure surface, as for GOV-2.

**GOV-7 (mutation procedures).**

- **Add.** New page → append a row with a previously-unused prefix.
- **Rename.** Prefix follows the page; the row's Page column updates, the Prefix column does not. Existing in-page anchors are not rewritten. In the same commit, update every reference to the old filename across `plan.md` and `plan_topics/**.md`; the plan-link CI gate (specified in the plan corpus) enforces this.
- **Delete.** The row is moved from the live table to the Retired prefixes sub-table. The prefix MUST NOT be reused.
- **Merge.** When `<absorbed-page>` is merged into `<surviving-page>`:
    - Every live REQ-ID on the absorbed page undergoes a GOV-8 *Merge* into a freshly allocated ID under the surviving prefix, appended at the surviving page's tail. The absorbed-page IDs retire on the absorbed page (its `## Retired REQ-IDs` section gains one row per merged ID) before the file is deleted.
    - The absorbed page's pre-existing `## Retired REQ-IDs` rows transplant verbatim into the surviving page's `## Retired REQ-IDs` section.
    - The absorbed prefix moves to the *Retired prefixes* sub-table; the *Formerly* cell records `<absorbed-page> (merged into <surviving-page> at <sha>)`.
    - The absorbed page file is deleted in the same commit (otherwise the prefix-table-completeness gate sees both a retired prefix and a live page carrying it).
- **Narrative-to-normative promotion.** Replace the `(no IDs — narrative)` cell with a freshly allocated prefix in the same edit that introduces the first obligation.
- **Normative-to-narrative demotion.** When a page that previously owned a prefix becomes pure narrative (every claim it carried is canonically owned elsewhere): (a) move its prefix from the live table to the *Retired prefixes* sub-table per GOV-7 *Delete*; (b) append a new live table row for the page carrying `(no IDs — narrative)`. Re-promotion later (per *Narrative-to-normative promotion* above) requires a *fresh* prefix — the original is retired and immutable per GOV-4 / GOV-5, and the *Retired prefixes* sub-table is itself append-only.

**GOV-8 (REQ-ID lifecycle).**

*Scope note (non-normative).* GOV-8 is a *bookkeeping* discipline: it pins how a substantive edit is recorded, not whether two V1.x releases produce the same output for the same `.loom` / `.warp` source file. The behavioural V1.x stability statement (per **GOV-15** at the page tail) is intentionally *not* derived from this rule.

<a id="gov-14"></a>

**GOV-14 (review posture on the V1.x-equivalence release-process goal).** Reviews of `spec.md` and `spec_topics/*.md` SHOULD NOT cite GOV-8 as a substitute for the V1.x source-language equivalence release-process goal recorded at [GOV-15](#gov-15) and SHOULD NOT re-raise the absence of an automated equivalence gate as a V1.0 correctness finding. The V1.0 release decision treats the absence of an automated equivalence gate as a recorded scope choice, not a defect.

- **Split.** When one rule splits into N rules, the original ID retires and N fresh IDs are appended at the page's tail.
- **Merge.** When N rules merge into one, all N source IDs retire and one fresh ID is appended at the page's tail.
- **Deletion.** Rule removed without replacement → ID retires; the prefix-position number MUST NOT be reused.
- **Pure rewording.** Typo fixes, sentence restructuring, link updates leave the ID unchanged. A change that alters which inputs are accepted, which outputs are produced, which diagnostics fire, or which invariants hold is substantive and MUST be modelled as a split, merge, or deletion-plus-add — never as an in-place edit. This boundary is enforced by review on the PR that touches a `**PREFIX-N.**` paragraph; no CI gate detects substantive in-place edits, and none is planned, because semantic equivalence between two prose paragraphs is not mechanically decidable. Worked examples:
  - Modal strengthening or weakening (`should` → `MUST`, `MUST` → `should`, `MAY` → `MUST`, etc.) inside a `**PREFIX-N.**` paragraph is **substantive** — the obligation's force has shifted even when the inputs and outputs at the moment of the edit appear unchanged. Treat as a split-or-deletion-plus-add. (This is the most commonly missed case in review; flag it first.)
  - Adding or removing a diagnostic code on a `**PREFIX-N.**` paragraph is **substantive** — it alters which diagnostics fire, per the test above. Treat as a split-or-deletion-plus-add. The new code's diagnostic-registry entry (asserted by the diagnostic-code closing CI gate per the plan corpus) is a separate, additive obligation and does NOT discharge the GOV-8 retirement requirement.
  - Editing a non-normative example (a fenced code block, parenthetical illustration, or worked sample) attached to a `**PREFIX-N.**` paragraph is **pure rewording**, provided the rule's normative sentences are unchanged. Examples do not constrain implementations. When in doubt about whether a sentence is normative or illustrative, retire-and-re-add.

All retirements (per GOV-7 *Delete* / *Merge* and per GOV-8 *Split* / *Merge* / *Deletion*) MUST be recorded:

- **Per-prefix retirements** appear in the *Retired prefixes* sub-table immediately below.
- **Per-ID retirements** appear in a trailing `## Retired REQ-IDs` section on each non-narrative page (skeleton inserted by the initial REQ-ID anchor pass specified in the plan corpus). After a GOV-7 *Merge*, the surviving page's `## Retired REQ-IDs` section accumulates rows under both the surviving and the absorbed prefixes (per the *Merge* sub-bullet above); the absorbed page's section is deleted with its file.

**GOV-9 (cross-link form).** Each spec page that depends on a normative rule from another topic page MUST either state the rule locally or reference it by a markdown link whose target is the specific REQ-ID anchor (`#prefix-n`) of the depended-upon rule. Where the depended-upon page is pure-narrative (its row in the [REQ-ID prefix table](#req-id-prefix-table) carries the `(no IDs — narrative)` cell per GOV-3), a section-level link to the relevant heading on that page suffices. From the commit that lands the initial REQ-ID anchor pass (specified in the plan corpus) forward, and independently of whether any such cross-link currently exists, every REQ-ID anchor on a non-narrative spec page MUST resolve as a `#prefix-n` URL fragment, so that any cross-page link of the form `…#prefix-n` formed per the preceding sentence resolves to the depended-upon rule's anchor site; this universal-resolvability obligation is the contract that GOV-1 *Required HTML-anchor contexts* and *Dual-form layout* deliver against, and is gated by the same anchor-insertion CI gate under the same transitional rule (per GOV-1 *Dual-form layout*).

**GOV-10 (plan-leaf reading scope).** An implementer MAY restrict their reading to the topic pages listed under their plan leaf's `**Spec**` field, where a *plan leaf* is a terminal task in [`plan.md`](../plan.md) (leaf format defined in [`plan_topics/conventions.md`](../plan_topics/conventions.md#leaf-format)) and its `**Spec**` field is the list of `spec_topics/*.md` filenames the leaf implements.

**GOV-11 (Spec-field closure).** The plan leaf's `**Spec**` field MUST be closed under normative cross-link. Closure runs from each listed topic outbound: if a listed topic `T` cross-links a normative rule in topic `T'`, then `T'` MUST also appear in the field. Closure applies transitively to a fixed point — iterate adding pages until the field stops growing. Narrative cross-links — those whose row in the [REQ-ID prefix table](#req-id-prefix-table) carries the `(no IDs — narrative)` cell, which per GOV-3 is the single source of truth for narrative-page status — do not trigger the closure obligation.

**GOV-12 (`spec.md` aggregator paragraphs are informative).** [`spec.md`](../spec.md) carries no per-page REQ-ID prefix and is treated as informative orientation: every normative obligation it appears to state is owned by a topic page that `spec.md` forward-links to. Several `spec.md` paragraphs are *aggregators* — they enumerate a closed set of items each owned by a different topic page (currently: the four Scope bullets, the Pi SDK and capabilities bullet list, the three Host runtime obligations, the four-item hard-runtime-ceilings list — whose cross-ceiling content (HC3-a…HC3-e, ceiling #4's per-boundary destination/surface table, CIO-1…CIO-6, the `masked` field's per-site reachable domain and wire-location split, NOCEIL-1…NOCEIL-4, worked consequences) is owned by [`hard-ceilings.md`](./hard-ceilings.md) — and the `.warp` permitted-top-level-forms list). Aggregator paragraphs are maintained in lock-step with their source pages by editorial convention: a PR that adds, removes, or renames an item on a source page (e.g. introduces a fifth hard ceiling on a topic page, retires an SDK capability, splits a Host runtime obligation, adds a sixth `.warp` permitted form) MUST update the corresponding `spec.md` aggregator in the same commit. Drift between an aggregator and its sources is a documentation defect, not a correctness defect; reviewers SHOULD flag it on the PR that introduced the drift, but no CI gate detects it (semantic equivalence between an aggregator paragraph and a set of topic-page paragraphs is not mechanically decidable, mirroring the GOV-8 *Pure rewording* limit). This rule is the single canonical home for the lock-step convention; previous load-bearing MUSTs scattered across `spec.md` aggregator paragraphs (most notably the hard-runtime-ceilings migration MUST) are removed in favour of citing GOV-12.

### Retired prefixes

| Prefix | Formerly | Retired in |
|---|---|---|
| `BIND` | `binder.md` | `7851d7c` |
| `BNDG` | `bindings.md` | `7851d7c` |
| `PIE` | `pi-integration.md` | `<demotion commit>` |

The Retired prefixes sub-table is itself append-only — a retired prefix cannot be un-retired or reassigned. The `Retired in` column carries either the 7-character abbreviated commit SHA (e.g. `7851d7c`) or a release tag (e.g. `v0.42.0`), nothing else — no prose, no parentheticals, no qualifiers (the `<demotion commit>` placeholder above is replaced with a concrete SHA at the moment of the demoting commit). The `Formerly` column names the page that historically carried the prefix; for rows recording a GOV-7 *Merge*, the cell takes the standard form `<absorbed-page> (merged into <surviving-page> at <sha>)` so future merges produce consistent rows. A fourth `Reason` column MAY be added without breaking the GOV-6 gate; if added, it carries free-form prose, while the `Retired in` cell remains strictly SHA-or-tag.

<a id="gov-15"></a>

**GOV-15 (V1.x source-language equivalence — release-process goal).** A `.loom` or `.warp` file that loads cleanly under V1.0 is expected to load under every V1.x release and to produce, for any given input, identical (a) return values, (b) ordered diagnostic-code sequences, and (c) `loom-system-note` content strings. Wall-clock timing, token counts, and log-line volume are explicitly excluded from this expectation. This rule states a release-process goal, not a verifiable obligation: V1.0 ships without an automated equivalence gate; equivalence between two V1.x releases is a release-process responsibility verified by reviewer inspection of the diff against the prior V1.x release. A conformance fixture suite that mechanically diffs the three observables above against a frozen V1.0 baseline is a recognised post-V1.0 follow-up; see [Future Considerations](./future-considerations.md). The companion review-posture rule that bars reviewers from re-raising the missing gate as a V1.0 correctness finding is [GOV-14](#gov-14).

<a id="retired-req-ids"></a>

## Retired REQ-IDs

| REQ-ID | Retired in | Replaced by | Reason |
|---|---|---|---|
| GOV-13 | `c253233` | GOV-15 | Modal weakening (RFC-2119 SHOULD → non-binding "is expected to") per GOV-8 *Pure rewording* limit; original wording promised a property the spec deliberately leaves un-gated. |

The Retired REQ-IDs sub-table is append-only per GOV-8. The `Retired in` column carries either the 7-character abbreviated commit SHA or a release tag (the `<retirement commit>` placeholder is replaced with a concrete SHA at the moment of the retiring commit). A retired ID's prefix-position number MUST NOT be reused per GOV-8 *Deletion*.
