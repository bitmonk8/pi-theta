# Triaged Spec Review - spec.md

_Generated: 2026-06-06T13:23:32Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T120) is addressed first; the first finding (T001) is addressed last._

_Triage tally: 1 blocker, 52 high, 67 medium retained; 91 low discarded; 0 low findings merged into 0 medium findings; 17 nit dropped; 0 false dropped._

---

# T001 - `tag-transition predicate` and `diagnostic-emission predicate` are coined, multi-page terms missing from the glossary

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/glossary.md` carries no entry for either *tag-transition predicate* or *diagnostic-emission predicate*, two coined PIC terms whose canonical definitions live in `session-only-degraded-state.md`'s *Predicate split* section and that are reused load-bearingly across SM-5, SM-6, and `drain-state-contract.md`. Both terms meet the glossary's own intake rule ("Add new entries here when the spec coins a new term that is reused on more than one page"). The two predicates differ only by the snapshot-success conjunct (`pinnedConstantReadOk`) that gates the diagnostic-emission predicate but not the broader tag-transition predicate, so a reader who meets either name on a page that defines neither has no alphabetised lookup path and risks conflating them.

## Solution approach

Add a glossary entry for each predicate at its alphabetical position in `docs/spec_topics/glossary.md` (*diagnostic-emission predicate* under d, *tag-transition predicate* under t), each a descriptive reminder that names the `pinnedConstantReadOk` snapshot-success conjunct as the sole factor distinguishing the narrower diagnostic-emission predicate from the broader tag-transition predicate. Carry a `See:` link in each entry to the canonical owner `session-only-degraded-state.md#session-only-reason-degraded-state`, matching the link form SM-5/SM-6 already use.

## Solution constraints

- The two new entries MUST be descriptive-only — no `MUST`/`SHOULD` term-usage prescription — consistent with the glossary page's descriptive-only header (the concern T002 addresses).

## Relationships

- T002 "Glossary entries carry normative MUST term-usage rules contradicting the page's own descriptive disclaimer" - decision-overlap (constrains the wording of the two new entries: they MUST be descriptive-only, with no `MUST`/`SHOULD` term-usage prescription, consistent with the resolution of that finding)
# T002 - Glossary entries carry normative MUST term-usage rules contradicting the page's own descriptive disclaimer

**Original heading:** Glossary entries carry normative MUST term-usage prescriptions inconsistent with the descriptive glossary header
**Original section:** docs/spec/overview-and-orientation.md, docs/spec/language-and-architecture.md, docs/spec/session-model-and-appendix.md, docs/spec_topics/overview.md, glossary.md (orientation / aggregators)
**Kind:** placement (shard-01)
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`docs/spec_topics/glossary.md` opens with a header that declares the page descriptive only: *"Each entry is descriptive — a one-paragraph reminder of what a term means and where it is used. The canonical, normative definition lives on the feature page named in the entry's `See:` reference; if a glossary entry and its canonical page disagree, the canonical page wins."* Three entries on the same page then carry capitalised MUST prescriptions that bind authors and implementers to a specific term and forbid named synonyms:

- `callable set` — *"Authors and implementers MUST use the term `callable set` (or, with an explicit scoping modifier, `frontmatter callable set` / `loom's declared callable set`) … the bare phrases `tools: set`, `tool set`, `loom's tools`, and `available tools` are spec-prose synonyms to be avoided …"*
- `schema slug` — *"Authors and implementers MUST use `schema slug` (or the bare form `slug` when context is unambiguous). The synonyms `schema hash`, `schema-hash`, `sha12`, `lowered-schema hash`, and `lowered-schema content hash` are spec-prose drift to be avoided; a future grep gate uses this entry as its source of truth."*
- `Pi tool` vs. `.loom callable` — *"Authors and implementers MUST use the canonical term `.loom callable` … the synonyms `registered loom`, `registered subagent loom`, `registered-loom call`, and `loom callee` are spec-prose drift to be avoided."*

These are not "reminders of what a term means" — they are normative authoring/grep-gate rules, and at least one of them explicitly names *this glossary entry* as the source of truth for an automated check ("a future grep gate uses this entry as its source of truth"). The contradiction is two-way: on the *callable set* and `.loom callable` rows, the canonical feature pages named under `See:` (`frontmatter/frontmatter-fields-a.md`, `tool-calls.md`) carry no corresponding MUST and no avoid-list — so the glossary's "canonical page wins" disclaimer would silently nullify the prescription. On the *schema slug* row, `schema-subset.md` (the canonical page) does carry an avoid-list — *"the synonyms … are drift to be avoided"* — but defers normative pinning back to the glossary: *"the [Glossary](./glossary.md) entry pins the avoid-list."* That circular delegation means there is currently no page on which an implementer can find a normatively-owned term-usage rule that satisfies the page's own self-declared layering.

## Spec Documents

- `docs/spec_topics/glossary.md` — entries `callable set`, `schema slug`, `Pi tool` vs `.loom callable`, plus the page header (edited)
- `docs/spec_topics/frontmatter.md` / `docs/spec_topics/frontmatter/frontmatter-fields-a.md` — `tools` section (option-dependent — Option A)
- `docs/spec_topics/schema-subset.md` — Canonical schema hash section (option-dependent — Option A; already carries the avoid-list, would gain a MUST and lose the back-delegation to glossary)
- `docs/spec_topics/tool-calls.md` — opening prose (option-dependent — Option A)
- `docs/spec_topics/governance.md` and a new `docs/spec_topics/governance/terminology.md` — (option-dependent — Option B)
- `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md` — uses `callable set` and `schemaSlug` (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project's `plan.md` has no leaves authored yet — every phase section reads "No leaves yet — author per the template." No coverage matrix entries reference the affected pages.)

## Consequence

**Severity:** advisory

A contributor following the glossary header literally would treat all three MUSTs as non-binding ("canonical page wins") and write `tool set`, `schema hash`, or `loom callee` in new prose; a contributor reading the entries literally would treat them as the binding source of the avoid-list. The future grep gate the *schema slug* entry promises ("a future grep gate uses this entry as its source of truth") would also be implemented against a page the spec itself declares non-normative, undermining its authority on the first push-back.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Push each MUST onto its canonical feature page; keep the glossary descriptive

**Approach.** For each of the three terms, the canonical feature page named in the glossary entry's `See:` reference grows a "Terminology" sub-paragraph that carries the MUST plus the avoid-list verbatim. The glossary entry is rewritten as a descriptive reminder ("called *callable set* in spec prose; see *canonical page* for the term-usage rule and the avoid-list of disallowed synonyms") with no MUST and no avoid-list.

**Spec edits.**
- `frontmatter/frontmatter-fields-a.md` `tools` section: add a "Terminology — *callable set*" sub-paragraph with the MUST + avoid-list `{ tools: set, tool set, loom's tools, available tools }`.
- `schema-subset.md` Canonical schema hash section: replace *"the [Glossary](./glossary.md) entry pins the avoid-list"* with the MUST + avoid-list inline; this becomes the grep gate's source of truth.
- `tool-calls.md` opening prose (or a new sub-section): add the MUST for `.loom callable` + avoid-list `{ registered loom, registered subagent loom, registered-loom call, loom callee }`.
- `glossary.md`: strip the three MUST clauses and avoid-lists from the three entries; leave a one-sentence pointer to the canonical page.

**Pros.** Honours the existing layering rule the glossary itself states ("canonical page wins"). No new governance page. Removes the circular delegation on the `schema slug` row. Co-locates each rule with the concept that motivates it, so the avoid-list is encountered in context.

**Cons.** Term-usage rules are now scattered across three feature pages with no single index; a future fourth term-usage MUST repeats the pattern. The grep gate the *schema slug* entry promises would need to read from a feature page, not a single terminology registry.

**Risks.** Slight risk of drift between the three MUSTs once they live on three pages — the avoid-list shape is currently uniform and would silently diverge under independent edits.

### Option B — Add a single governance terminology rule that owns all term-usage MUSTs; demote glossary entries

**Approach.** Add a new governance rule (next free `GOV-N`) on a new page `docs/spec_topics/governance/terminology.md` that owns the corpus-wide convention "named terms in the *Governed terms register* below have a canonical spelling and a closed set of disallowed synonyms; spec authors MUST use the canonical spelling." The page carries a single table whose rows are the three governed terms today (and is the natural home for the *operator*, *respond-repair*, and other term-usage findings on the same cluster). Each glossary entry then carries no MUST and points at the governance row by anchor.

**Spec edits.**
- New `docs/spec_topics/governance/terminology.md` with a new `GOV-N` header, the prose contract, and a three-row table `{ term, canonical spelling, disallowed synonyms, owner-page anchor }`.
- `governance.md` Contents list: add the new page.
- `glossary.md`: strip MUST clauses; add a `Term governed by: [GOV-N](./governance/terminology.md#gov-n)` line to each affected entry.
- `schema-subset.md`: remove the *"the [Glossary](./glossary.md) entry pins the avoid-list"* sentence; replace with a pointer to the governance row.

**Pros.** Single source of truth for the grep gate the *schema slug* entry already promises. New term-usage MUSTs land in one known place. Resolves the cluster of related glossary-overreach findings (operator-invariant, respond-repair-sole-sourcing, schema-slug over-prescription) by giving them a shared destination instead of three ad-hoc moves. The governance taxonomy already houses every other corpus-level authoring rule.

**Cons.** Adds a new governance rule and page, which is a heavier change than Option A. Term-usage rules become slightly distant from the feature prose that motivates them — readers of `frontmatter.md` need a cross-link to find the avoid-list.

**Risks.** GOV-N numbering: the live range currently runs through GOV-31 per `req-id-prefix-table-active-b.md`; the new rule must use the next free ID and be added to the per-page prefix table per the existing GOV process.

### Recommendation

**Option A.** The glossary's own "canonical page wins" rule already names the resolution: each term's canonical page is the right owner for its term-usage MUST. Option B's central registry is appealing for its grep-gate story but is overkill for three terms whose canonical homes already exist; pursue it only if Findings *Glossary `operator` invariant and scope-exclusion belong in Scope/NFR*, *`respond-repair` "only repair mechanism" scope-bounding claim is sole-sourced in the glossary*, and *Glossary `schema slug` / `canonical schema hash` over-prescribe internal cache structure* are co-resolved into a single governance terminology rule.

Edge cases the implementer must watch:
- The `schema-subset.md` Canonical schema hash section already says *"the [Glossary](./glossary.md) entry pins the avoid-list"* — that sentence must be removed in the same edit that adds the inline MUST, otherwise the circular delegation survives.
- The *schema slug* entry promises a future grep gate uses the glossary entry as its source of truth. The grep gate (if it ships) must be re-pointed at `schema-subset.md` under Option A.
- Keep the avoid-list wording byte-identical when moving it, so any out-of-tree grep or `pi-loom` lint over the existing glossary text continues to match.

## Relationships

None

---

# T003 - `respond-repair` sole-repair-mechanism scope claim has no normative home

**Kind:** scope
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `respond-repair` glossary entry asserts that the response-repair loop "is the only 'repair' mechanism the spec defines" — a language-wide exclusivity boundary that forbids ad-hoc repair behaviour (implicit coercion on validation failure, automatic retry on tool errors, rollback after a malformed turn) at any other failure boundary. The glossary header declares its entries descriptive and stipulates the canonical page wins on disagreement, so this exclusivity claim has no normative carrier. No other page restates it as an exclusivity rule: the PIC, error-model, and query pages each describe respond-repair's behaviour without claiming it is the sole repair primitive. Two implementers can therefore ship compliant loom 1.0 runtimes while disagreeing on whether other "small" repair behaviours are permitted.

## Solution approach

Add a normative paragraph under `## Schema-validation respond-repair` in `query/query-failure-and-repair.md`, carrying a stable anchor, stating that respond-repair is the only repair mechanism loom 1.0 defines and that the runtime performs no other implicit repair, coercion, retry, or rollback at any other failure boundary; enumerate the failure boundaries the rule spans (validation failures outside the typed-query response, tool-call errors, transport failures, panic recovery, history rollback) so the rule is mechanically checkable. Rewrite the `respond-repair` glossary entry's exclusivity sentence as a forward-link to that anchor.

## Solution constraints

- Out of scope: the `array<T>.join` "no implicit type conversion" entries at `expressions.md` and `diagnostics/code-registry-parse.md` remain as specific diagnostic-table entries — do not deduplicate them against the new general rule.

## Relationships

- T002 "Glossary entries carry normative MUST term-usage rules contradicting the page's own descriptive disclaimer" - same-cluster (same pattern across `callable set` / `schema slug` / `Pi tool` entries; different destinations)
# T004 - Hard-ceilings aggregator lists no inline bound for ceiling #3 while siblings state theirs

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The orientation Hard-ceilings aggregator in `docs/spec/overview-and-orientation.md` enumerates four ceilings. Siblings #1, #2, and #4 carry their numeric bound directly in the one-liner; ceiling #3 (anchor `hard-ceiling-3`) is the lone exception, carrying only a routing-class note and a forward-link to HC3-a … HC3-e with no number. A reader skimming the aggregator for the four ceiling magnitudes cannot tell that ceiling #3 is a per-class budget yielding three binder LLM calls in the worst case, and may substitute "one retry." The bound is fixed and stated at HC3-d (with the AJV-on-`args` zero-retry exception at HC3-c); only formatting omits it from the aggregator.

## Solution approach

Rewrite ceiling #3's one-liner in `docs/spec/overview-and-orientation.md`'s Hard-ceilings list to state its inline bound before the existing forward-link, matching the sibling one-liner style — worst-case three binder LLM calls per slash invocation (one initial attempt plus one transport-class retry plus one malformed-envelope-class retry, AJV-on-`args` not retried). Source the bound from HC3-d and the AJV exception from HC3-c on `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md`.

## Solution constraints

- GOV-30 aggregator lock-step applies: the restated bound MUST byte-match the bound as stated at HC3-d (and the AJV-on-`args` exception at HC3-c) on `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md`.

## Relationships

- T065 "`HC3-a` / `HC3-c` cross-links target the orientation aggregator anchor instead of the inline-label anchor site, violating GOV-16 *Cross-link form*" - same-cluster (both touch ceiling #3's orientation entry, but the anchor-governance fix is independent of restating the bound)
# T005 - Orientation NFR refers to `loom-system-note` as a pre-existing Pi channel without flagging the registration step

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The *Runtime observability* NFR bullet in `docs/spec/overview-and-orientation.md` introduces `loom-system-note` as if it were a pre-existing Pi channel, on a par with the Pi tool-host or the Pi extension registry, and its only forward-link points at the emission contract (`runtime-event-channel.md`). It offers no pointer to the registration/ownership surface where the mandatory `pi.registerMessageRenderer("loom-system-note", renderer)` call and the "literal `loom-system-note` is owned by the pi-loom extension" rule live (`extension-bootstrap-and-per-loom.md#renderer-registration`). A top-down reader can follow the bullet to the emission contract and write `pi.sendMessage` calls without learning that the pi-loom extension must register the renderer first — i.e. that pi-loom *creates* the channel rather than consuming a pre-existing one.

## Solution approach

Rewrite the *Runtime observability* bullet's first-use clause in `docs/spec/overview-and-orientation.md` to frame `loom-system-note` as a custom-message channel the pi-loom extension registers (via `pi.registerMessageRenderer`) and solely owns. Add a forward-link to `extension-bootstrap-and-per-loom.md#renderer-registration` alongside the existing forward-link to the emission contract.

## Solution constraints

- The orientation bullet must remain a forward-reference; do not restate the registration / ownership rules there — `extension-bootstrap-and-per-loom.md` retains sole ownership of them.
- Out of scope: the Source-language-stability bullet's bare use of `loom-system-note` in observable (c) stays bare — re-qualifying registration mechanics into a stability-equivalence rule does not belong there.

## Relationships

- T036 "`registerMessageRenderer` is unordered in the registration sequence; `registerFlag` options parameter is unpinned" - same-cluster (governs the registration-step anchor this finding wants to forward-link to; if that anchor moves into a numbered step, update this finding's link target in lockstep)
# T006 - Orientation pages live outside GOV-17's corpus and are cited under two incompatible paths

**Original heading:** `spec.md` resolves to two different filesystem targets; GOV-17 corpus glob omits the `docs/spec/` subtree
**Original section:** docs/spec_topics/governance/ (governance subtree)
**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The orientation content the governance rules pin (Scope bullets, Prerequisites, Hard ceilings list, Session Model section) physically lives in `docs/spec/overview-and-orientation.md`, `docs/spec/language-and-architecture.md`, and `docs/spec/session-model-and-appendix.md`. The file `docs/spec.md` is a 9-line table of contents that forward-links into that `docs/spec/` subtree. Governance rules treat the orientation as if it were `spec.md` itself, but spell that target two different ways:

- GOV-23 (`anchor-scheme-and-retired.md`) and GOV-30 (`req-id-prefix-table-active-b.md`) write `[spec.md](../../spec.md)` — resolving to the 9-line TOC file, which carries none of the aggregator paragraphs they govern.
- GOV-31 (same page) and GOV-15 (`source-language-stability.md`) write `[spec.md — Scope](../../spec/overview-and-orientation.md#scope)`, `[spec.md — Prerequisites](../../spec/overview-and-orientation.md#prerequisites)`, and `[spec.md — Hard ceilings](../../spec/overview-and-orientation.md#hard-runtime-ceilings)` — resolving correctly into the subtree, but with link text that asserts the file is `spec.md` rather than `spec/overview-and-orientation.md`.

GOV-17 then defines the spec corpus as exactly `docs/spec.md` ∪ `docs/spec_topics/**/*.md`. The `docs/spec/` subtree matches neither arm, so under GOV-17's own operational dependent check a Markdown link inside one of the orientation pages does not count as "into the spec corpus." Two consequences follow: (a) any external file that cross-links into `docs/spec/overview-and-orientation.md` is vacuously not classified as a dependent and so cannot trip the no-cycles MUST GOV-17 enforces, and (b) arm-(b) self-binding rules (GOV-18 arm (b), GOV-1, GOV-3, GOV-6, GOV-29) that scope their invariants to "the spec corpus" do not bind the orientation pages at all, even though those pages are where the aggregator paragraphs governed by GOV-30/GOV-31 live.

## Spec Documents

- `docs/spec.md` — whole file (option-dependent: edited under Option A, read-only under Option B)
- `docs/spec/overview-and-orientation.md` — whole file (option-dependent: merged away under Option A, read-only under Option B)
- `docs/spec/language-and-architecture.md` — whole file (option-dependent)
- `docs/spec/session-model-and-appendix.md` — whole file (option-dependent)
- `docs/spec_topics/governance/corpus-direction-and-scope.md` — GOV-17 corpus definition and dependent-check recipe (edited)
- `docs/spec_topics/governance/anchor-scheme-and-retired.md` — GOV-23 link text and target (edited)
- `docs/spec_topics/governance/req-id-prefix-table-active-b.md` — GOV-30 and GOV-31 link text and targets (edited)
- `docs/spec_topics/governance/source-language-stability.md` — GOV-15 ceiling-aggregator cross-links (edited)
- `docs/spec_topics/governance/release-version-naming.md` — GOV-29 grep recipe (`docs/spec.md docs/spec_topics/`), edited if the corpus widens (edited under Option B)
- `README.md` — repository-layout table (read-only; cross-listed with the README-layout finding)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan has no authored leaves yet; the Horizontal, MVP, and Vertical-slice sections of `docs/plan.md` are all placeholders.)

## Consequence

**Severity:** correctness

Two independent governance invariants are silently inoperative against the orientation pages: GOV-17's no-cycles dependent check (a dependent that cross-links only into `docs/spec/*.md` is misclassified as non-dependent and admitted as a cross-reference target), and the arm-(b) self-binding scope of GOV-1/3/6/18/29 (REQ-ID grammar, extraction, table closure, cross-page uniqueness do not apply to the pages most readers treat as the spec entry point). Independently, the divergent link spelling means the same logical citation resolves to two different files: an editor moving content between `spec.md` and `spec/overview-and-orientation.md` cannot tell from the link text which arm a given citation tracks, so cross-link rot is invisible to grep.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Collapse the orientation back into a single `docs/spec.md`

**Approach.** Inline the contents of `docs/spec/overview-and-orientation.md`, `docs/spec/language-and-architecture.md`, and `docs/spec/session-model-and-appendix.md` back into `docs/spec.md`; delete the `docs/spec/` directory; repoint every governance cross-link to `[…](../../spec.md#anchor)`.

**Spec edits.**
- Merge the three `docs/spec/*.md` files into `docs/spec.md`, preserving every `<a id>` anchor cited from elsewhere (`#scope`, `#prerequisites`, `#hard-runtime-ceilings`, `#session-model`, `#sm-3a`…, `#sm-7e`, etc.).
- Delete the `docs/spec/` directory.
- In `anchor-scheme-and-retired.md` (GOV-23), `req-id-prefix-table-active-b.md` (GOV-30, GOV-31), and `source-language-stability.md` (GOV-15 ceiling cross-links), rewrite every `../../spec/overview-and-orientation.md#X` to `../../spec.md#X`. Link text already says `spec.md`, so no text changes are needed.
- README repository-layout table needs no change (the `docs/spec/` row drops out naturally; co-resolves the related README finding).

**Pros.** Matches GOV-17 as-written without amending corpus rules. Eliminates the dual-spelling failure mode at the root. Removes the divergence between the file `spec.md` (TOC) and the aggregator paragraphs governance rules quote from it.

**Cons.** Produces a single very large file. Loses whatever editorial reason drove the original split. Higher one-time diff cost.

**Risks.** Anchor collisions if the three split files independently coined the same `<a id>` slug; must `grep` all `<a id="...">` in the three files before merging.

### Option B — Widen GOV-17's corpus to include `docs/spec/**/*.md` and reconcile the link spelling

**Approach.** Keep the file split. Extend GOV-17's corpus definition and dependent-check recipe to recognise `docs/spec/**/*.md` as a third corpus arm; update the link spelling in GOV-23 and GOV-30 to point at the actual files; align every governance grep recipe that names corpus paths.

**Spec edits.**
- In `corpus-direction-and-scope.md` (GOV-17): change the corpus definition to `docs/spec.md` ∪ `docs/spec/**/*.md` ∪ `docs/spec_topics/**/*.md`; update the dependent-check sentence ("…is `docs/spec.md` or matches `docs/spec_topics/**/*.md`…") to add the third arm; update the non-normative grep aid accordingly; extend GOV-18 arm (b)'s "form, structure, and content of `docs/spec.md` and `docs/spec_topics/*.md`" enumeration to include `docs/spec/*.md`.
- In `anchor-scheme-and-retired.md` (GOV-23): change `[spec.md](../../spec.md)` to point at the actual Session Model file (likely `[Session model](../../spec/session-model-and-appendix.md#session-model)`), and update prose mentions of "`spec.md` Session Model section" to name the correct file.
- In `req-id-prefix-table-active-b.md` (GOV-30): the "[`spec.md`](../../spec.md) carries no per-page REQ-ID prefix" clause is correct as-written for the TOC file, but every prose reference to "`spec.md` aggregator paragraphs" must clarify that the aggregator paragraphs the rule governs physically live on `docs/spec/overview-and-orientation.md` and `docs/spec/language-and-architecture.md`; either add a one-sentence definitional gloss at the top of GOV-30 binding the term "`spec.md` aggregator" to the orientation subtree, or rewrite each affected mention.
- In `release-version-naming.md` (GOV-29's non-normative grep recipe `grep -rnE … docs/spec.md docs/spec_topics/`): add `docs/spec/` to the recipe.
- README repository-layout table: add a `docs/spec/` row (co-resolves the related README finding).

**Pros.** Preserves the file split. Smaller, more surgical diff than Option A. Brings GOV-17 in line with the actual repository layout.

**Cons.** Forces a definitional gloss on GOV-30 distinguishing "`spec.md` aggregator" (a class of paragraphs) from "`spec.md`" (the TOC file), since the term-of-art "`spec.md` aggregator" now refers to paragraphs that are not on `spec.md`. Three GOV-17 dependent paths to keep aligned instead of two.

**Risks.** Subsequent rules that grep-discover the corpus must each be audited for the new third arm; missing one re-introduces the same class of bug (the sibling finding "GOV-29 / GOV-28(a) / GOV-18 arm (b) use non-recursive `*.md` globs that miss the subdirectory anchor sites" is the same family of defect on a different axis and should be resolved in the same pass).

### Recommendation

**Option A — Collapse.** The split's benefit is editorial (file size) and its cost is structural (a term-of-art "`spec.md` aggregator" that no longer denotes content on `spec.md`, plus a third corpus arm to keep aligned across every present and future governance rule that scopes to the corpus). Collapsing eliminates the dual-spelling failure mode at the root and leaves every governance rule readable as written. Implementer must verify no `<a id>` anchors collide across the three merged files before deleting them, and the README layout table's `docs/spec/` row drops out as a side effect (co-resolving the related README finding).

## Relationships

- T007 "Three governance scoping clauses cite a non-recursive `docs/spec_topics/*.md` glob that excludes the subdirectory anchor sites" - same-cluster ((independent glob-scope defect on the governance rules; resolve in the same pass once corpus shape is settled).)
- T065 "`HC3-a` / `HC3-c` cross-links target the orientation aggregator anchor instead of the inline-label anchor site, violating GOV-16 *Cross-link form*" - same-cluster ((both touch cross-links into the orientation pages; resolving the file location first stabilises the anchor target).)

---

# T007 - Three governance scoping clauses cite a non-recursive `docs/spec_topics/*.md` glob that excludes the subdirectory anchor sites

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Three governance scoping clauses bound their scope as `docs/spec.md` + `docs/spec_topics/*.md`, a single-level glob that matches only first-level topic files and excludes the subdirectory files carrying the live anchor sites: GOV-29's cross-page canonical-arm uniqueness sentence and GOV-28(a)'s spec-corpus discharge predicate (both on `release-version-naming.md`), and GOV-18 arm (b)'s self-binding scope clause (`corpus-direction-and-scope.md`). GOV-17 defines the corpus with the recursive `docs/spec_topics/**/*.md` form, and sibling rules GOV-3 and GOV-6 match it; these three are the scoping sites that drop the second star. A literal reader can therefore retire a `v1-*` alias despite a live inbound `#v1-…` link in a subdirectory file, admit canonical-arm slug collisions across depth levels, and treat arm (b)'s self-binding scope as narrower than the corpus GOV-17 defines.

## Solution approach

Widen the glob in each of the three clauses from `docs/spec_topics/*.md` to the recursive `docs/spec_topics/**/*.md`, matching GOV-17. For the two `release-version-naming.md` sites (the GOV-29 cross-page-uniqueness sentence and the GOV-28(a) discharge-predicate sentence), a forward-reference to `#gov-17` in place of the inline glob is an acceptable alternative. Keep GOV-18 arm (b) (`#gov-18-arm-b`) enumerating the corpus literally rather than forward-referencing GOV-17.

## Solution constraints

- None.

## Relationships

- T006 "Orientation pages live outside GOV-17's corpus and are cited under two incompatible paths" - same-cluster (both are governance-scope-glob mismatches against the actual on-disk corpus; resolved independently — that finding extends the corpus, this one widens existing globs to match GOV-17)
# T008 - Indexed-access runtime disposition not cross-referenced from `expressions.md`

**Kind:** error-model, implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The indexed-access bullet under `## Supported forms` in `expressions.md` names only the static `loom/parse/non-indexable-receiver` diagnostic and says nothing about what happens at runtime when the receiver is correctly typed but the index is dynamically absent — an array index outside `0..arr.length`, or an object indexed access on a missing key. The disposition is in fact specified on `errors-and-results/error-model.md` (`#runtime-panics`: `loom/runtime/index-out-of-bounds` and `loom/runtime/missing-object-key`), but `expressions.md` neither names those codes nor links to that list. Because Loom has no `undefined`, the silence invites divergent implementations (JS-style `undefined`, an opaque exception, or the correct panic) that fail conformance silently from the operator-page reader's vantage.

## Solution approach

Add a runtime-disposition statement to the indexed-access bullet under `## Supported forms` in `expressions.md`, after the existing static-error clause, naming the out-of-bounds array panic and the missing-object-key panic and forward-linking to `errors-and-results/error-model.md#runtime-panics` as the canonical closed list.

## Solution constraints

- Out of scope: the panic-message templates, owned by the diagnostics registry that `error-model.md` already cites as authoritative.
- Out of scope: the `null`-receiver panic variants (`loom/runtime/null-member-access`, `loom/runtime/null-index-access`), which remain owned by `error-model.md`.

## Relationships

- T069 "Object indexed-access static semantics are undefined" - same-cluster (touches the same indexed-access bullet; resolves independently — T069 covers static result type and key-type constraints, this finding covers runtime disposition).
# T009 - Integer-overflow arithmetic has no normative reference vector

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`expressions.md` § "Other arithmetic" specifies a normative disposition for over-safe-integer results of binary `-`, `*`, `%`, and unary `-`: the result is computed in IEEE-754 double precision, silently loses precision, does not panic, and retains the static `integer` type rather than widening to `number`. Two implementer-visible commitments are made — the IEEE-754 double-precision value and the retained `integer` static type — with no concrete reference vector pinning either. The same file pairs the `replace(from, to)` entry with a normative reference-vectors table, so a conformance tester has byte-exact fixtures for `replace` but nothing for the more surprising integer-overflow rule.

## Solution approach

Add a normative reference-vectors table to § "Other arithmetic", following the `replace(from, to)` reference-vectors table format already in the file, covering over-safe-integer inputs that exercise both the IEEE-754 double-precision value and the retained `integer` static type. Pick inputs whose IEEE-754 result has a finite decimal representation so the expected column is byte-exact, and avoid inputs whose result is an integer-valued double inside the safe range, since such a vector cannot distinguish the no-widening commitment from a silent widen-and-back at the value level.

## Solution constraints

- None.

## Relationships

- T075 "Bare-source backslash: no diagnostic code is named" — same-cluster (both are testability findings on the same review cluster, but the diagnostics issue resolves independently of the overflow vectors)
# T010 - `==` semantics are authoritative on `runtime-value-model.md` but `expressions.md` Equality neither restates nor links them

**Original heading:** `==` full semantics defined only in runtime-value-model.md with no back-reference from expressions.md Equality
**Original section:** docs/spec_topics/ language core (lexical, grammar, type-system, expressions, runtime-value-model, descriptions, schemas, schema-subset)
**Kind:** placement (shard-03), scope (shard-03)
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`runtime-value-model.md` carries the full normative definition of `==`: structural deep equality, with `NaN == NaN` true, `+0 == -0` true, element-wise array comparison at equal length, key-set + per-key object comparison (loom-side names), enum compares by `(declaring-enum tag, wire value)`, and `Result` compares by `Ok`/`Err` discriminator and recurses on the payload. The anchor is `#equality`.

`expressions.md` § Equality is the operator page a reader arrives at from the precedence table and the `==`/`!=` row, but its entire body is one sentence: *"`==` is structural: deep value equality for objects and arrays, value equality for primitives. There is no `===`."* No link to `runtime-value-model.md#equality`, no mention of the NaN or `±0` refinements, no mention of enum-tag or `Result` recursion. A reader who consults the operator page in isolation will not discover that `NaN == NaN` is `true`, that `Severity.High == OtherEnum.High` is `false`, or that key declaration order does not affect object equality.

The split is also asymmetric for NaN. NaN ordering (`NaN < 1`, `NaN <= NaN`, etc., all `false`) lives in `expressions.md` § Comparison, and that section *does* forward-reference `runtime-value-model.md#equality` to contrast against `NaN == NaN`. The reverse link does not exist: `runtime-value-model.md`'s `**Equality (==).**` block names neither `expressions.md` § Comparison nor the ordering rule, so a reader on the value-model page sees NaN equality but is not told that NaN ordering exists on another page or that the two rules are deliberately asymmetric.

## Spec Documents

- `docs/spec_topics/expressions.md` — § Equality (edited); § Comparison (option-dependent — depends on whether NaN ordering moves)
- `docs/spec_topics/runtime-value-model.md` — `**Equality (==).**` block at `#equality` (edited)

## Plan Impact

**Phases:** N/A

**Leaves:** N/A

(The plan currently has no leaves; `docs/plan.md` lists "_(No leaves yet — author per the template.)_" under each phase.)

## Consequence

**Severity:** correctness

A reader reaching the operator page from the precedence table sees only "structural" and could plausibly implement (or write a test asserting) `NaN == NaN` is `false`, mismatching the runtime-value-model rule. The current text is not internally contradictory, but it is structurally incomplete: the only path to the full rule is to know in advance that runtime-value-model.md owns it. The same applies to readers building intuition about enum or `Result` equality from the operator page.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Keep `runtime-value-model.md` authoritative; upgrade `expressions.md` to a stub-with-link

Approach: leave the full `==` definition where it is and where the existing `expressions.md` § Comparison cross-reference already points. Replace `expressions.md` § Equality's single sentence with a short paragraph that (i) names `==` as structural, (ii) calls out that `NaN == NaN` is `true` and `±0` compare equal (as a teaser, so the contrast with NaN ordering on the same page is visible without a click), and (iii) forward-links to `runtime-value-model.md#equality` for the full rule (arrays, objects, enums, `Result`). Add a back-reference inside the `**Equality (==).**` block in `runtime-value-model.md` pointing to `expressions.md` § Comparison for NaN ordering, so the asymmetric NaN treatment is discoverable from either page.

Spec edits:
- `expressions.md` § Equality: replace the one-sentence body with the stub described above.
- `runtime-value-model.md` `**Equality (==).**` block: append a sentence noting that ordering on `NaN` produces `false` on all four ordering operators and is defined in `expressions.md` § Comparison.

Pros:
- Smallest diff. Preserves the existing `runtime-value-model.md#equality` anchor and every page that already targets it (e.g. the `expressions.md` § Comparison forward-link, the `**Engine value model**` block's "primitive-equality relation defined under **Equality (`==`)** above").
- Keeps equality and the wire-name-translation/enum-tag-reattachment machinery — which together produce the values being compared — on the same page where they already live.
- The NaN asymmetry remains a single-page contrast on `expressions.md` (ordering vs the equality teaser), which is where a reader weighing the two operator families will look.

Cons:
- The operator page still does not carry the full rule; readers wanting enum or `Result` equality details must click through.
- Two pages must stay in sync on the NaN/`±0` mention (the teaser on `expressions.md` and the authoritative rule on `runtime-value-model.md`).

Risks:
- A future edit could let the teaser drift from the authoritative rule. Mitigated by keeping the teaser narrow (NaN/`±0` only) and pointing explicitly at the anchor.

### Option B — Move the full `==` definition to `expressions.md`; demote `runtime-value-model.md` to a back-reference

Approach: relocate the entire `**Equality (==).**` bullet list (primitives + NaN/`±0`, arrays, objects, enums, `Result`) into `expressions.md` § Equality. Leave `runtime-value-model.md` with a one-sentence pointer at `#equality` so the existing anchor and inbound links survive. Co-locate NaN equality and NaN ordering on the operator page.

Spec edits:
- `expressions.md` § Equality: replace the one-sentence body with the relocated bullet list.
- `runtime-value-model.md` `#equality`: keep the anchor; replace the bullet list with a one-line pointer to `expressions.md` § Equality.
- `runtime-value-model.md` `**Engine value model**` block: re-target its "primitive-equality relation defined under **Equality (`==`)** above" phrasing at the new home.
- `expressions.md` § Comparison: drop the cross-reference to `runtime-value-model.md#equality` and refer to the now-local Equality section.

Pros:
- Operator-page readers see the full rule without a click. NaN equality and NaN ordering sit on the same page, making the deliberate asymmetry self-evident.
- Matches the cluster's general placement convention that operator semantics live with the operator.

Cons:
- The equality bullets currently depend on adjacent context — the enum-row of the representation table and the wire-name-translation rules (inbound enum-tag reattachment) — both of which stay on `runtime-value-model.md`. After the move, the equality rules and the values they operate over live on different pages.
- More inbound links need re-pointing (every site that references "the primitive-equality relation" on `runtime-value-model.md`).
- Wider diff; higher chance of an anchor or reference being missed.

Risks:
- Stale inbound link from any page not surveyed during the move.

### Recommendation

Option A. The split is a cross-reference defect, not a placement defect: `runtime-value-model.md` is the correct owner because the equality rule references the enum-tag and `Result` representations defined on the same page, and the inbound `**Engine value model**` self-reference would otherwise reach across pages. Option A fixes the actual reader-stranding case (operator page → no link) and the missing reverse NaN cross-reference with a two-edit diff. Edge case for the implementer: the `expressions.md` § Equality stub must mention `NaN == NaN` explicitly, not just link out, because § Comparison on the same page already names NaN ordering — readers comparing the two operator families on one page need to see the asymmetry without leaving the page.

## Relationships

- T073 "Cross-type `==` / `!=` disposition is unspecified" - same-cluster (also concerns `expressions.md` § Equality; the disposition rule belongs in whichever page becomes authoritative under this finding, so resolution order matters but the edits are independent)

---

# T011 - Three independent over-prescriptions across `type-system.md` and `schema-subset.md`

**Original heading:** Type-compatibility relation bound to AJV; depth-walk "recursive descent" mechanism; nullability/union lowering offered as a free choice
**Original section:** docs/spec_topics/ language core (lexical, grammar, type-system, expressions, runtime-value-model, descriptions, schemas, schema-subset)
**Kind:** prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Three logically independent over-prescriptions sit on adjacent surfaces. They share the lens (each ties an observable contract to a non-observable implementation detail) but the fixes are independent and each touches a different paragraph.

1. **`⊑` is defined against AJV, not against JSON Schema.** `type-system.md` (Operational definition) reads: *"`T₁ ⊑ T₂` holds iff every value statically typed as `T₁` AJV-validates against the lowering of `T₂`."* The relation is a normative semantic of the language and governs every typed slot in the corpus (typed `let`, function args, `invoke<T>`, `array<T>` element, `match`/ternary common type, `+` mixed-numeric, frontmatter `params:` defaults). Tying it to one named validator means a conformant runtime that swaps in any other JSON Schema 2020-12 validator could violate `⊑` even when its observable behaviour against the lowered subset is identical to AJV's, and conversely an AJV configuration deviation (e.g. `coerceTypes: true`) could silently redefine the language semantic. This is also out of step with the rest of the spec's posture, where validation is contracted through the `SchemaValidator` seam (`pi-integration-contract/host-interfaces-services.md` PIC-11) and AJV is named only as the reference implementation in `implementation-notes.md`.

2. **Depth Enforcement prescribes a traversal mechanism for an observable-only cap.** `schema-subset.md` Depth Enforcement is correctly observable in its rules (the cap, the per-site destinations table, the canonical `schema_keyword: "maxDepth"` error shape). One sentence then over-reaches: *"Implementation is a recursive descent over the parsed JSON value with a depth counter; the first node whose depth would exceed `5` short-circuits and produces the failure."* No conformance witness distinguishes a recursive-descent implementation from an iterative-stack one, a streaming counter on a SAX parser, or a folded `JSON.parse` reviver. The cap, the failure-emission order across enforcement points, and the error shape are the contract; the traversal mechanism is implementer freedom.

3. **Nullability/union lowering offers a non-normative choice that the canonical hash cannot tolerate.** The Nullability bullet says *"`string | null` Loom type lowers to `{"type": ["string", "null"]}` **or** an `anyOf` with `{"type": "null"}`,"* and the Lowering Algorithm step 3 says the multi-type-array form is *"preferred for readability; falls back to `anyOf` if any arm is non-primitive."* But the lowered bytes are the input to the canonical-schema-hash recipe (`schema-subset.md` Canonical schema hash), and the resulting schema slug appears in `__inline_<slug>` `$defs` keys, the `__loom_respond_<slug>` synthesised tool name, the `__loom_callee_<slug>__…` and `__loom_bind_<slug>` PIC-owned tool names, and the per-query AJV compiled-validator cache key. Two implementers picking different lowerings for the same Loom union would produce different `$defs` keys, different tool names visible in `/tools` listings and `ERR-17` error messages, and different cache hits — none of these are "readability" concerns. The "preferred"/"or" wording leaves the wire-byte shape unfixed in a section that, two screens later, requires it to be byte-exact.

## Spec Documents

- `docs/spec_topics/type-system.md` — "Operational definition" paragraph of the `T₁ ⊑ T₂` section (edited)
- `docs/spec_topics/schema-subset.md` — Depth Enforcement, last sentence of the paragraph preceding *Error shape* (edited)
- `docs/spec_topics/schema-subset.md` — Subset enumeration *Nullability* bullet (edited)
- `docs/spec_topics/schema-subset.md` — Lowering Algorithm step 3, *Union of primitives only* sub-bullet (edited)
- `docs/spec_topics/schema-subset.md` — Canonical schema hash section (read-only; the reason obligation 3 matters)
- `docs/spec_topics/implementation-notes.md` — Runtime section, AJV reference-implementation note (read-only; the home for the AJV name after obligation 1)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-11 `SchemaValidator` interface (read-only; the contract `⊑` should defer to)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`docs/plan.md` enumerates no leaves yet; `docs/plan_topics/` contains only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md`.)

## Consequence

**Severity:** correctness

Obligation 3 is the load-bearing one: two reasonable implementers will choose different nullability lowerings, producing different canonical hashes, different `__inline_*` / `__loom_respond_*` / `__loom_callee_*` / `__loom_bind_*` names, and different validator-cache keys for the same Loom source — a hard divergence visible in `/tools` listings, in `ERR-17` error messages that embed the slug byte-exact, and in any inter-runtime cache exchange. Obligation 1 makes the language definition non-portable across `SchemaValidator` implementations, contradicting the rest of the corpus's seam-based posture. Obligation 2 is the least consequential — it merely admits non-witnessable implementation-shape critique into future reviews — but is a one-sentence deletion.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles three independent obligations on three different paragraphs. Each is a small, self-contained edit; they are presented as separate options so the fix loop can resolve them sequentially rather than land one large multi-paragraph diff.

### Option A — Delete the depth-walk implementation-mechanism sentence

**Approach.** In `schema-subset.md` Depth Enforcement, strike the sentence *"Implementation is a recursive descent over the parsed JSON value with a depth counter; the first node whose depth would exceed `5` short-circuits and produces the failure."* Retain the surrounding sentence (*"The walk runs before AJV at each site: it is a cheap fast-fail …"*) which is observable contract.

**Spec edits.**
- `schema-subset.md`, paragraph preceding the *Error shape* heading: remove the second sentence.

**Pros.** Smallest possible edit; pure deletion; no downstream cross-references depend on the deleted prose.
**Cons.** None — the implementation freedom is already implicit in every other validator-internal rule.
**Risks.** None.

### Option B — Pin the nullability/union lowering form normatively

**Approach.** Replace the *"or an `anyOf` with `{"type": "null"}`"* alternative in the *Nullability* bullet and the *"preferred for readability; falls back to `anyOf` if any arm is non-primitive"* phrasing in Lowering Algorithm step 3 with a single normative rule: a primitive-only union (including any `T | null` over primitives) MUST lower to the multi-type-array form `{"type": [...]}`; a union with one or more non-primitive arms MUST lower to `anyOf`. Within the multi-type-array form, type-name order MUST match the source-order of the Loom arms, with `null` placed last when present.

**Spec edits.**
- `schema-subset.md` Subset enumeration, *Nullability* bullet: rewrite as "Nullability is the special case of union: `string | null` lowers to `{"type": ["string", "null"]}`. See *Lowering Algorithm* step 3 for the full normative rule. The non-standard `nullable: true` modifier is not emitted."
- `schema-subset.md` Lowering Algorithm step 3, *Union of primitives only* sub-bullet: rewrite as "Union whose every arm is a primitive (`string`, `number`, `integer`, `boolean`, `null`): MUST emit `{"type": [<a>, <b>, …]}` with type names in Loom source-arm order, `null` last when present. Mixed unions (one or more non-primitive arms) MUST emit `anyOf` per the *Mixed `anyOf`* sub-bullet."

**Pros.** Closes the canonical-hash hole that two-implementer divergence in this bullet would silently widen into divergent `__inline_*` / `__loom_respond_*` slugs. Adds no new schema constructs (both forms already exist in the subset). Pins type-name order so the canonical-form key-sort post-processing is the only normalisation acting on the emitted fragment.
**Cons.** Removes implementer flexibility on a stylistic choice. None observable.
**Risks.** The corpus elsewhere shows `{"type": ["string", "null"]}` and `{"anyOf": [{"type": "string"}, {"type": "null"}]}` examples in non-schema-subset pages; a follow-up sweep should confirm those examples already use the multi-type-array form for primitive-only unions (a separate clarity nit if any do not).

### Option C — Rebind `⊑` to JSON Schema 2020-12 semantics with AJV as reference implementation

**Approach.** In `type-system.md`'s *Operational definition* paragraph, replace *"AJV-validates against the lowering of `T₂`"* with *"validates against the lowering of `T₂` under JSON Schema 2020-12 semantics, as realised by the injected `SchemaValidator` service (see [PIC-11](../spec_topics/pi-integration-contract/host-interfaces-services.md#schemavalidator-interface))."* Retain the surrounding paragraph framing (*"The AJV reading is the safety net at runtime …"* becomes *"The runtime validation is the safety net …"*). The remainder of `type-system.md` (TYPE-1..9, *Structural cases the parser must recognise*, *Unresolvable operands*) already names AJV in supporting prose; update those mentions in the same edit, since the relation now defers to the seam.

**Spec edits.**
- `type-system.md` *Operational definition* paragraph: rebind as above.
- `type-system.md` *Structural cases the parser must recognise* intro sentence: change "without invoking AJV" → "without invoking the `SchemaValidator`."
- `type-system.md` *Unresolvable operands* paragraph: change "the runtime AJV check is the safety net" → "the runtime `SchemaValidator` check is the safety net."

**Pros.** Aligns the language semantic with the rest of the corpus's seam-based validation posture (PIC-11, the `SchemaValidator` references throughout `implementation-notes.md` and the binder pages). A conformant runtime that swaps validators no longer violates `⊑` for free. AJV's role is preserved exactly where the corpus already locates it: as the reference implementation in `implementation-notes.md`.
**Cons.** Larger surface than A or B (three sentences vs one). Edge cases: the operational definition presupposes the assumed validator configuration (no type coercion, Draft 2020-12) — that assumption now lives in PIC-11 rather than in the `⊑` definition site, which is correct but means PIC-11 must state it.
**Risks.** Other corpus sites name AJV in normative prose for the same reason (called out by the separate finding "AJV named in normative prose across the corpus instead of the abstracted `SchemaValidator` seam / behaviour"). This option does not attempt the corpus-wide sweep; it confines the rebinding to the `type-system.md` `⊑` definition. The broader sweep is owned by the related finding and should land after Option C so it picks up `⊑`'s new wording.

### Recommendation

Resolve in the order **A → B → C**.

- **A first** because it is a pure single-sentence deletion with no downstream coupling; landing it shrinks the Depth Enforcement section before the next pass's lenses see it.
- **B second** because it is the smallest *additive* normative edit (two sub-bullets) and it closes a real divergence in the canonical-hash inputs. It depends on no prior obligation.
- **C last** because it has the widest surface within `type-system.md` and is most likely to attract follow-up critique from the corpus-wide AJV→`SchemaValidator` sweep (related finding). Landing it on a baseline where A and B are already settled keeps the diff legible.

Each option is independently shippable; do not bundle them.

Edge cases the implementer must watch:
- (Option B) Confirm the corpus uses `{"type":[…]}` form for primitive-only unions in every example outside the schema-subset page; if any page shows the `anyOf` alternative for a primitive-only union, fix in the same PR.
- (Option B) Pin type-name order — without it, `string | null` and `null | string` would lower to byte-distinct fragments and produce different schema slugs.
- (Option C) Do not delete the AJV-as-reference-implementation note in `implementation-notes.md` — that is the home AJV moves *to*, not *from*.

## Relationships

- T070 "Schema-slug collision posture is pinned only for the `pi.registerTool` cache, leaving the `$defs` hoist and the validator cache silent" - same-cluster (both bear on canonical-hash inputs / collision posture; resolved independently)
- T071 "Canonical hash recipe cites keywords the lowered subset never emits (`default`, `minLength`, `maxItems`)" - same-cluster (touches the same Canonical schema hash section; independent fix)

---

# T012 - `while`-loop termination disposition not cross-referenced from `control-flow.md`

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`control-flow.md`'s `while` paragraph is the owning page for the only loom 1.0 construct capable of unbounded iteration, yet it pins only parse-time obligations (`boolean` condition, `break`/`continue` scoping) and says nothing about what bounds a runaway loop, what variant a caller observes on cancellation, or how cancellation reaches a loop body. The authoritative answers live on other pages — `NOCEIL-1` (no wall-clock bound), `cancellation.md` Granularity (per-iteration checkpoint), `CancelledError`, and `NOCEIL-3`'s catchable-`RangeError` arm — but the `while` section forward-links none of them. A reader who stops at the owning page cannot tell whether a no-query loop is bounded at all, and a reader who consults `functions.md` for an "exhausted runtime ceiling" lands on `tool_loop_exhausted`, which does not bound a `while`.

## Solution approach

Add a termination forward-link from `control-flow.md`'s `while` section to the existing authoritative rules: `NOCEIL-1` at `hard-ceilings/ceiling-invariants-and-audit.md#no-additional-ceilings` (no wall-clock bound), the per-iteration checkpoint in `cancellation.md` Granularity, the `cancelled` surface at `errors-and-results/queryerror-variants.md#queryerror-variants`, and `NOCEIL-3`'s catchable-`RangeError` arm for host allocation / stack failures inside a loop body.

## Solution constraints

- Forward-link only: no normative content is moved or restated from the linked pages into `control-flow.md`, preserving GOV-15 source-language equivalence.

## Relationships

- T022 "Macrotask-yield primitive at the loop-iteration checkpoint is unspecified" — same-cluster (both touch the `cancellation.md` per-iteration checkpoint that this finding's cross-reference forward-links; the two resolve independently — pinning the yield primitive is orthogonal to cross-referencing the checkpoint from `control-flow.md`).
# T013 - `mut-on-immutable-context` umbrella claim contradicts the carve-out for `let _`

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Immutable contexts." umbrella sentence in `bindings.md` states that `mut` on any listed binding is `loom/parse/mut-on-immutable-context`, but the discard-form bullet then reassigns `let mut _ = ...` to a different code, `loom/parse/mut-on-discard`. The diagnostics registry in `code-registry-parse.md` scopes `mut-on-immutable-context` to function parameters, `for`-iteration variables, and `match` pattern bindings only — it does not cover the discard form. The umbrella claim therefore contradicts its own bullet and the registry, leaving two diagnostic codes attached to `let mut _`. An implementer reading the umbrella sentence in isolation emits the wrong code.

## Solution approach

Narrow the "Immutable contexts." umbrella sentence so its `mut-on-immutable-context` claim covers only the contexts the registry assigns to that code. Lift the discard form out of the umbrella bullet list and present it separately, so `let _ = ...` is named immutable while `let mut _ = ...` resolves to `mut-on-discard`. Keep both code names aligned with the `code-registry-parse.md` rows.

## Solution constraints

- Out of scope: `code-registry-parse.md` — its `mut-on-immutable-context` and `mut-on-discard` rows are the authoritative code scoping and are read-only; do not rename either code or edit the registry.

## Relationships

None
# T014 - SLSH-3 slash-boundary scoping is asserted only through an indirect parenthetical

**Kind:** scope
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

SLSH-3 on `slash-invocation.md` opens *"When a prompt-mode loom returns `Err(QueryError)` to its caller (the user's session)"* — its slash-boundary scope rides entirely on the parenthetical plus the glossary `caller` entry's two-senses partition. On a standalone read, the sentence fits every prompt-mode invoke parent in a prompt → prompt chain (per `invocation.md`'s cross-mode matrix, a prompt-mode child also drives the user's session), not just the slash entrypoint. SLSH-4's templates ("the shapes below") and SLSH-5's chain suffix ("the per-`kind` row above") inherit the ambiguity without restating the emission site. The authoritative `display: true` ⇒ slash-boundary mapping is owned by `pi-integration-contract/runtime-event-channel.md`, but the SLSH-3 prose does not stand on its own, so a literal reading emits duplicate system notes at every nested prompt → prompt invoke parent whose `?`-propagated `Err` traverses it.

## Solution approach

Rewrite SLSH-3's opening sentence on `slash-invocation.md` to name the slash-command boundary directly rather than relying on the `caller` parenthetical, using the slash-boundary framing `runtime-event-channel.md` already carries (the top-level `Err` cascading out of the slash-command boundary to the user's session). Clarify at SLSH-3 that SLSH-4's templates and SLSH-5's chain suffix apply at this same slash-boundary emission site, and that intermediate prompt-mode invoke parents whose `?`-propagated `Err` traverses them do not emit a SLSH-3/4/5-shaped note. Add a forward-link from SLSH-3 to `runtime-event-channel.md`'s `id="system-note-details-shapes"` per-variant `display` / `content` table.

## Solution constraints

- Out of scope: SLSH-5's `<parent_path>:<line>` definition (owned by T078) and SLSH-4's template-cell / inline-backtick rendering (owned by T079) — touch only the SLSH-3..SLSH-5 framing and scope sentences, not the template content.
- The tightened scope MUST NOT re-scope SLSH-3..SLSH-5 to subagent-mode `display: false` cascades or to the panic-rendering `details: { diagnostics }` emission path.

## Relationships

- T078 "SLSH-5 `<parent_path>:<line>` is defined only for `invoke(...)` call sites, not for `.loom`-callable bare-identifier calls" - same-cluster (independent defect on the same SLSH-5 rule)
- T079 "SLSH-4 template cells and SLSH-5 worked examples disagree on whether inline backticks are emitted" - same-cluster (independent defect on the same SLSH-4/SLSH-5 templates)
# T015 - Clock-ban prohibition and cross-boundary depth-counter rule lack observable acceptance criteria

**Original heading:** Clock-ban MUST NOT and invoke-depth cross-boundary rule lack observable acceptance criteria
**Original section:** docs/spec_topics/ functions, control-flow, return, bindings, imports, invocation, slash-invocation, implementation-notes
**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Two normative rules in the runtime spec are written without any externally
observable acceptance criterion, so a conformance suite that exercises only
the surfaces the spec names cannot distinguish a compliant implementation
from a non-compliant one. They are independent rules on independent pages
and are addressed below as two separate obligations.

**(1) Clock ban.** `implementation-notes.md` (Clock bullet) states *"The
runtime MUST NOT call `Date.now`, `performance.now`,
`Date.prototype.getTime`, or the global `setTimeout` / `clearTimeout`
outside the `WallClock` adapter (the reference implementation enforces
this ban with a build-time grep-test; the grep-test mechanism is
non-normative)."* The MUST NOT is phrased entirely against
implementation-internal call sites in the runtime's own source, and the
only verification mechanism cited is explicitly non-normative. A second
implementer reading the normative behavioural contract cannot derive a
black-box conformance test: an implementation that calls `Date.now()` in
ten places — but whose observable behaviour (`RuntimeEvent.occurred_at`
stamping, watcher debounce, settings-watcher debounce,
`looms.scanPackagesTimeoutMs` cap, retry/backoff timing) is fully
substitutable by a `FakeClock` — would pass every behavioural test
written from the cited call-site list. The rule that actually matters
behaviourally is *"every time-dependent observable in the runtime is
substitutable via the injected `Clock` seam,"* which is testable; the
call-site prohibition is a non-testable implementation convention.

**(2) Cross-boundary depth-counter rule.** `invocation.md` (paragraph
beginning *"The counter is per-chain and crosses subagent-mode boundaries
unchanged"*) states that `subagent → subagent` and `prompt → subagent`
invocations do not reset the per-chain depth counter, that the cap is
breached when pushing a frame would bring the count to 33, and that
`loom/runtime/invoke-depth-exceeded` renders `invoke chain depth
exceeded: 33 > 32`. The rule is stated declaratively but no acceptance
scenario pins the cross-boundary witness. A test suite that exercises
only same-mode chains — e.g. a 32-frame all-prompt-mode chain, plus a
single subagent spawn — would pass an implementation that silently
resets the counter at each subagent boundary, because the only chains
long enough to trip the cap never cross a boundary. The cross-boundary
clause is the entire reason the paragraph exists and is the property
most likely to be lost in a reasonable implementation (a fresh
`AgentSession` is an obvious place to start a fresh counter), yet
nothing in the spec compels a fixture that would catch the regression.

## Spec Documents

- `docs/spec_topics/implementation-notes.md` — Clock bullet (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-12 `Clock` / `FakeClock` interface (read-only; receives the behavioural-substitutability obligation if Option A is taken)
- `docs/spec_topics/invocation.md` — Invocation depth bound, cross-boundary paragraph (edited)
- `docs/spec_topics/diagnostics/code-registry-parse.md` — `loom/runtime/invoke-depth-exceeded` render-string pin (read-only; the acceptance scenario cites the existing pinned render)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(The plan currently has no authored leaves under any phase; the coverage matrix is empty. When leaves are authored for the `Clock` seam and for the invocation depth bound, they should adopt the acceptance criteria added by this fix.)

## Consequence

**Severity:** correctness

Two independent implementers writing to the current spec can ship
runtimes that pass every behavioural test the spec admits, yet diverge
on whether `Date.now()` may appear outside `WallClock` and on whether
the depth counter resets across a subagent boundary. The depth-counter
divergence is operator-visible: a recursive divide-and-conquer that
should panic at frame 33 instead runs to whatever cap the host
ultimately imposes (stack overflow, memory exhaustion, or no bound at
all) when the counter silently resets at every spawned `AgentSession`.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles two unrelated obligations on two different pages.
They are resolved independently and the fix order matters only insofar
as resolving the smaller, purely-additive one first keeps the second
diff focused.

### Option A — Cross-boundary depth-counter acceptance scenario (resolve first)

**Approach.** Purely additive. Append one normative acceptance
scenario to the cross-boundary paragraph in `invocation.md` and
nothing else.

**Spec edits.** In `invocation.md`, immediately after the existing
*"The counter is per-chain and crosses subagent-mode boundaries
unchanged"* paragraph, insert a labelled acceptance scenario of the
form:

> *Acceptance scenario.* A chain composed of 32 `invoke` frames whose
> mode sequence interleaves at least one `prompt → subagent` and at
> least one `subagent → subagent` transition (and where no two
> adjacent frames share a mode in at least two positions) MUST raise
> `loom/runtime/invoke-depth-exceeded` rendering `invoke chain depth
> exceeded: 33 > 32` when the 33rd frame is about to be pushed,
> regardless of where the boundaries fall in the chain.

State the scenario in mode-mix terms (not "exactly N boundaries") so a
conforming implementation cannot satisfy it by special-casing a
specific boundary count. Cross-link from the existing `subagent.md`
concurrent-invocation-isolation block so the depth-counter passthrough
across the `customTools` / `AgentSession` boundary is testable from
the subagent page too.

**Pros.** Additive; no other text changes; gives the conformance
suite one mechanical witness that fails on a reset-at-boundary
regression.

**Cons.** Adds one fixture obligation; does not by itself force
implementers to test every other boundary permutation (but the rule
text already covers them and the scenario establishes the testing
discipline).

**Risks.** The exact mode-mix predicate must be tight enough that a
"reset at every subagent boundary" implementation cannot pass it.
Stating "at least two of the boundary transitions are `prompt →
subagent` or `subagent → subagent`" achieves that: any reset reduces
the visible chain length to ≤ 31 frames, so the panic never fires
and the assertion fails.

### Option B — Demote the Clock ban to a convention; add a behavioural substitutability obligation (resolve second)

**Approach.** Replace the call-site MUST NOT with a behavioural
contract on PIC-12 (the `Clock` / `FakeClock` interface) and demote
the call-site prohibition to a non-normative implementer convention.

**Spec edits.**
- In `implementation-notes.md` Clock bullet, replace the sentence
  *"The runtime MUST NOT call `Date.now`, `performance.now`,
  `Date.prototype.getTime`, or the global `setTimeout` /
  `clearTimeout` outside the `WallClock` adapter (the reference
  implementation enforces this ban with a build-time grep-test; the
  grep-test mechanism is non-normative)."* with a non-normative
  editorial note: *"Non-normative implementer convention. The
  reference implementation avoids calling `Date.now`,
  `performance.now`, `Date.prototype.getTime`, or the global
  `setTimeout` / `clearTimeout` outside the `WallClock` adapter, and
  enforces this via a build-time grep-test; the convention exists
  only to make the PIC-12 behavioural substitutability obligation
  below easier to uphold in practice."*
- In `host-interfaces-services.md` PIC-12, add one normative
  behavioural obligation: *"Every time-dependent observable the
  runtime produces — `RuntimeEvent.occurred_at` stamping, the
  watcher debounce window, the settings-watcher debounce, the
  `looms.scanPackagesTimeoutMs` cap on the package-discovery walk,
  and any retry/backoff timing — MUST be fully substitutable via the
  injected `Clock` seam. Concretely: with a `FakeClock` whose
  `advance(ms)` is the sole source of forward time progress, a test
  fixture MUST be able to drive every such observable to its expected
  value/effect without any wall-clock passage, and no observable
  shall depend on a time source the seam does not mediate."*
  Enumerate the call sites (already listed in the existing PIC-12
  prose) as the closed set of observables the obligation governs.

**Pros.** Replaces an untestable implementation-internal prohibition
with a black-box behavioural contract a conformance suite can
mechanise as `FakeClock`-substitution tests against each enumerated
observable. The convention survives as guidance for implementers who
want a mechanical check.

**Cons.** Adds prose to PIC-12; requires the implementer to enumerate
every time-dependent observable (the spec already does this in the
existing Clock bullet, so the surface is already known).

**Risks.** The "closed set of observables" list must stay in
lockstep with the runtime's actual time-touching surface; a future
addition (e.g. a new retry timer) that is not added to PIC-12's list
escapes the obligation. Mitigated by the existing convention catching
direct API calls during code review.

### Recommendation

Adopt both Option A and Option B, in that order. Option A is purely
additive on `invocation.md` and lands a stable baseline before Option
B touches `implementation-notes.md` and PIC-12. Edge cases for the
fixer to watch:

- Option A's acceptance scenario must be stated in mode-mix /
  transition-count terms, not as a specific 33-frame test case, so it
  cannot be satisfied by an implementation that special-cases the
  fixture.
- Option B's PIC-12 obligation must enumerate the observables as a
  closed set already named in the existing Clock bullet (event
  stamping, watcher debounce, settings-watcher debounce, scan-packages
  timeout, retry/backoff). Do not leave it open-ended; an open list
  makes the obligation as untestable as the prohibition it replaces.
- The demoted convention in `implementation-notes.md` must stay
  non-normative; if it is re-elevated to a MUST NOT in any future
  edit, the testability defect returns.

## Relationships

- T048 "Always-log event construction and `ctx.ui.notify` fallback are unpinned at the runtime-event-channel fallback site" - same-cluster (touches `Clock.wallNow()` at a different call site; the PIC-12 substitutability obligation in Option B subsumes the substitutability concern but not the throw-handling concern)

---

# T016 - Snippets reference undeclared `ReviewScore`/unbound `code`; foot-gun mentions a linter the spec never scopes

**Original heading:** functions.md conceptual-model example uses undeclared `ReviewScore`/unbound `code`; linting non-goal not declared
**Original section:** docs/spec_topics/ functions, control-flow, return, bindings, imports, invocation, slash-invocation, implementation-notes
**Kind:** implementability, scope
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Two independent issues, each small but each at a reader's first exposure to the language:

1. **Snippets reference names with no in-corpus declaration.** The Query-and-Await snippet in `overview.md` § Conceptual Model — Query-and-Await uses `${code}` (never bound) and annotates `let score: ReviewScore = …` (type never declared anywhere in the corpus). `functions.md`'s opening `rate_strictness` snippet has the same problem: it takes `p: Author` and returns `Result<ReviewScore, QueryError>`. `Author` is declared in `schemas.md` (a later page); `ReviewScore` is never declared anywhere. Neighbouring topic pages (`type-system.md`, `query/query-forms.md`, `errors-and-results/error-model.md`) carry the same `ReviewScore` symbol with no shared definition — the corpus has settled on it as a recurring example name without ever introducing it. Other example-heavy pages in the corpus (e.g. `binder/binder-bypass-and-envelope.md`, `pi-integration-contract/host-interfaces-services.md`, `binder/defaulting-system-note-echo.md`) explicitly tag illustrative fragments as non-normative; these two snippets do not.

2. **The `let x = expr?` foot-gun recommends linting, but linting is not in or out of scope.** `functions.md`'s foot-gun note says the pattern "is best caught by linting, not by the language rule." The loom 1.0 non-goals list in `future-considerations/model-changes-and-non-goals.md` enumerates eight cross-cutting scope decisions (no sandbox, no migration mechanism, no non-Node host, no concurrent sessions, no stdio-capture reliance, no parallel-invoke, no parallel fan-out, no admission cap) and the upstream "Model-level changes" list covers another eleven; neither mentions a loom lint / static-analysis tool. A reader cannot tell whether the foot-gun text presupposes a tool loom 1.0 ships, defers to a future tool, or names a tool out of scope.

The two halves are independent: fixing the example snippets does not address the linter-scope question, and declaring (or disclaiming) a lint surface does not fix the undeclared identifiers.

## Spec Documents

- `docs/spec_topics/overview.md` — Conceptual Model § Query-and-Await (edited)
- `docs/spec_topics/functions.md` — opening `rate_strictness` snippet; *Foot-gun — `let x = expr?`* paragraph (edited)
- `docs/spec_topics/future-considerations/model-changes-and-non-goals.md` — `loom 1.0 non-goals` list (option-dependent)
- `docs/spec/language-and-architecture.md` — `### V1 non-goals` aggregator (option-dependent — kept in lock-step under GOV-30)
- `docs/spec_topics/schemas.md` — read-only (confirms `Author` is declared here, `ReviewScore` nowhere)
- `docs/spec_topics/type-system.md`, `docs/spec_topics/query/query-forms.md`, `docs/spec_topics/errors-and-results/error-model.md` — read-only (confirm `ReviewScore` is a recurring undeclared example name)
- `docs/spec_topics/governance/req-id-prefix-table-active-b.md` — read-only (GOV-30 aggregator lock-step rule)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The plan file exists but currently has no leaves; nothing references these surfaces yet.)

## Consequence

**Severity:** advisory

A reader hitting either snippet at first contact has to guess whether `ReviewScore` / `code` are declared elsewhere and whether the linter exists. Neither guess affects what an implementer would build — both are reader-comprehension defects — but they sit at the corpus's two most-trafficked entry points (overview's Conceptual Model and the opening of `functions.md`) and undermine the corpus's general discipline of tagging non-normative illustration explicitly.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles two independent obligations; address them in the order below so each lands on a stable baseline.

### Option A — Tag the two snippets as illustrative non-normative fragments

**Approach.** At each snippet site (`overview.md` Query-and-Await; `functions.md` opening `rate_strictness`), prepend a one-line non-normative marker, e.g. *"Illustrative snippet — `Author` / `ReviewScore` are example schemas (not declared here); `code` is an example identifier bound earlier in the loom."* Match the framing used by `binder/binder-bypass-and-envelope.md` ("included for illustration") and `pi-integration-contract/host-interfaces-services.md` ("non-normative reference illustrating one conforming decomposition").

**Spec edits.**
- `docs/spec_topics/overview.md` — add a one-line "Illustrative; …" preface immediately before the Query-and-Await fenced block, naming `code` as an example identifier and `ReviewScore` as an example schema.
- `docs/spec_topics/functions.md` — same one-line preface before the `rate_strictness` fenced block, naming `Author` and `ReviewScore` as example schemas.

**Pros.**
- Tiny diff (two prefaces); no new prose load on either page.
- Aligns these two entry-point snippets with the corpus's existing illustrative-tag convention.
- No new normative surface introduced.

**Cons.**
- Readers still don't see a worked schema for either `Author` or `ReviewScore` inline.

**Risks.** None of note.

### Option B — Inline the missing declarations into the snippets

**Approach.** Add a `schema ReviewScore { value: integer, reason: string }` declaration above each snippet that uses it (mirroring the shape `errors-and-results/error-model.md` uses), and bind `code` (e.g. `let code = …` or pull `code` from the function signature) in the overview snippet.

**Spec edits.**
- `docs/spec_topics/overview.md` — extend the Query-and-Await fenced block to include `schema ReviewScore { … }` and a `code` binding (or shift the snippet so `code` is a function parameter).
- `docs/spec_topics/functions.md` — extend the `rate_strictness` block to include `schema Author { … }` and `schema ReviewScore { … }`.

**Pros.**
- Snippet is self-contained and copy-pastable.

**Cons.**
- Larger fenced blocks at two prominent entry points dilute the rhetorical focus (Query-and-Await is meant to show the `@` form, not schema declarations).
- Introduces a new style obligation (snippets MUST resolve every identifier inline) that the corpus otherwise does not hold.

**Risks.** Cross-page drift: the inline `ReviewScore` shape would now coexist with the recurring `ReviewScore` references on `type-system.md`, `query/query-forms.md`, and `errors-and-results/error-model.md`, none of which declare it either; an implementer might read inconsistent inline shapes if they diverge over time.

### Option C — Declare lint / static-analysis tooling explicitly out of scope

**Approach.** Add a ninth bullet to the `loom 1.0 non-goals` list in `future-considerations/model-changes-and-non-goals.md` covering loom lint / static-analysis tooling: loom 1.0 ships no lint surface; the `let x = expr?` style guidance in `functions.md` is informative authoring advice, not a hook for a tool the runtime provides. Update the GOV-30 lock-step aggregator on `docs/spec/language-and-architecture.md` to reflect the new count.

**Spec edits.**
- `docs/spec_topics/future-considerations/model-changes-and-non-goals.md` — append a new non-goal bullet (e.g. *"No loom lint / static-analysis tooling. loom 1.0 ships no separate lint surface; informative authoring-pattern advice in topic pages (e.g. the `let x = expr?` foot-gun in `functions.md`) is reader-facing guidance, not a contract on a downstream tool. A future lint tool would require revisiting the diagnostic surface ownership and is not anticipated by loom 1.0."*) with the standard `*Recorded at:*` cross-reference to the `functions.md` foot-gun.
- `docs/spec/language-and-architecture.md` — update the GOV-30 aggregator's "eight items" integer (GOV-31 literal-preservation) and forward-link to the new bullet.
- `docs/spec_topics/functions.md` — keep the foot-gun text but forward-link the lint sentence to the new non-goal anchor, so a reader who hits "best caught by linting" sees that the spec has declared the surface out of scope.

**Pros.**
- Closes a genuine scope-disposition gap.
- Removes the only place in the corpus that gestures at a tooling layer the spec otherwise does not acknowledge.

**Cons.**
- Cost of an integer-literal lock-step edit (GOV-30/GOV-31) for what is effectively a one-sentence scope clarification.

**Risks.** Forgetting the GOV-30 aggregator update on `spec/language-and-architecture.md` (and the integer-literal preservation under GOV-31) would leave the lock-step out of sync; this is mechanically caught by reviewers per GOV-30 but is the kind of edit it specifically guards against.

### Option D — Soften the foot-gun sentence instead of adding a non-goal

**Approach.** Reword the foot-gun's final sentence to drop the "linting" reference, e.g. *"… this pattern is a known authoring hazard; authors should add an explicit tail expression."* No non-goals change needed.

**Spec edits.**
- `docs/spec_topics/functions.md` — replace "is best caught by linting, not by the language rule" with a wording that does not gesture at an external tool.

**Pros.**
- Minimal diff; no GOV-30/GOV-31 ripple.

**Cons.**
- Does not close the underlying scope question (a reader still cannot tell whether the spec presupposes external tooling elsewhere); just removes one instance of the prompt.

**Risks.** None.

### Recommendation

Resolve in two passes:

1. **First:** Option A (tag the snippets illustrative). This is the smaller-scope half, lands without touching the non-goals list, and is the lower-risk fix for the higher-impact half of the finding. Prefer it over Option B — these snippets are introductory exposition of the `@` form, not schema-declaration tutorials, and the corpus already has an established "illustrative; non-normative" tagging convention these two sites should adopt.

2. **Second, on the baseline from step 1:** Option C (declare lint tooling out of scope). The foot-gun gestures at a tool the spec otherwise nowhere acknowledges; the cleanest resolution is to add it as the ninth non-goal and forward-link from the foot-gun, rather than softening the foot-gun's wording (Option D), because the underlying scope question — "does loom 1.0 ship lint surface?" — is real and worth answering once on a page readers can find. Under Option C, the implementer must remember the GOV-30 aggregator lock-step (`docs/spec/language-and-architecture.md`) and the GOV-31 integer-literal update; both are explicit obligations of those rules and will be caught at review if missed.

Edge cases for the implementer:
- The corpus uses `ReviewScore` recurrently (≥4 sites) with no shared declaration. Option A only tags the two sites named in this finding; the other sites are out of scope for this fix but reviewers will notice the asymmetry. If the broader pattern is to be normalised, raise a separate finding rather than expanding this one.
- The new non-goal bullet under Option C must use the same `*Recorded at:*` template as the existing eight bullets, and must forward-link the `functions.md` foot-gun specifically (not a generic "see also").

## Relationships

None

---

# T017 - Panic message templates duplicated between error-model.md and code-registry-runtime.md, with a self-undermining normative claim

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`errors-and-results/error-model.md`'s `**Panic message string (normative).**` paragraph (anchor `#runtime-panics`) reproduces the six `loom/runtime/*` message templates in a Code/Message-template table that duplicates the identical six rows in `diagnostics/code-registry-runtime.md`'s `loom/runtime/*` table. The paragraph asserts its own table is normative ("a conformant runtime MUST emit the registered string … conformance tests MAY assert on the exact string") while simultaneously conceding "the registry is authoritative if the two ever drift" — two normative carriers for the same byte-exact strings with a self-undermining tiebreaker. A conformance tester reading the error-model table can assert a false-positive failure against a registry-conformant runtime once the two copies diverge, and every future template edit must land in two places under a co-edit obligation that is nowhere stated. The registry rows already back-link to *Errors and Results — Runtime panics* in their *Spec rule* column, so the registry is the established sole authority.

## Solution approach

Delete the six-row Code/Message-template table from error-model.md's `**Panic message string (normative).**` paragraph (anchor `#runtime-panics`) and rewrite the paragraph to forward-reference `diagnostics/code-registry-runtime.md#loomruntime-runtime-panics-runtime-defect-surface-and-delivery-failures` as the sole authoritative carrier of the templates, removing the "registry is authoritative if the two ever drift" clause. Preserve the separate forward-reference to the placeholder-rendering rules at `placeholder-rendering-a.md#placeholder-rendering-normative`. Move the conformance-assertion entitlement ("conformance tests MAY assert on the exact string") onto the registry page so deleting it from error-model.md does not drop the contract.

## Solution constraints

- Out of scope: the existing per-source and `loom/runtime/internal-error` cross-references in the narrative **Runtime panics** paragraph (anchor `#runtime-panics`) above the deleted table — they are independent of the template duplication and must remain.

## Relationships

None
# T018 - DISC-4 does not cross-reference the `pi.getCommands()` enumeration API or its `session_start` ordering presupposition

**Kind:** implementability, assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

DISC-4 in `discovery/discovery-sources.md` is the canonical cross-format slash-name collision rule: it requires the `session_start` handler to drop any candidate `.loom` whose slash name collides with an already-registered Pi prompt template, skill, or other extension command. A reader sitting on DISC-4 cannot tell which Pi SDK accessor enumerates the registered command/prompt/skill namespace, nor under what event-ordering guarantee that snapshot is authoritative. Both facts are pinned elsewhere — `pi.getCommands()` and its first-`session_start`-completeness presupposition in `pi-integration-contract/registration-steps.md`, and the collision-candidate `SlashCommandSource` set in `pi-integration-contract/host-interfaces-services.md` — but DISC-4 links only through a loose parenthetical to the PIC page hub, not to either anchor.

## Solution approach

In DISC-4's `session_start` collision paragraph (`discovery/discovery-sources.md`), add a cross-reference naming `pi.getCommands()` and forward-linking to `registration-steps.md` step 3 and its `getcommands-completeness-presupposition` anchor. In the same paragraph, forward-link the collision-candidate `SlashCommandSource` set to `host-interfaces-services.md#v1-seam-pi-owned-subagents-collision-source-set`. Replace the existing loose parenthetical pointing at the PIC hub page with these anchored links.

## Solution constraints

- Out of scope: the DISC-4 de-registration mechanism owned by T091.
- Out of scope: the `pi.getCommands()` throw / failure semantics owned by T109.

## Relationships

- T091 "DISC-4 "de-registers a previously-registered loom" has no Pi-side mechanism" - same-cluster (sibling DISC-4 sub-rule needing its own host-API pin; resolve independently)
- T109 "`session_start` collision pass has no failure contract when `pi.getCommands()` throws" - same-cluster (concerns the same accessor's failure semantics; the fix here should not also try to define throw semantics)
# T019 - ERR-17 references `__loom_respond_<slug>` byte-exact without telling the reader where `<slug>` comes from

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

ERR-17 in `errors-and-results/queryerror-variants.md` (anchor `#err-17`) pins the wrong-tool synthesised `ValidationIssue` `message` literal byte-exactly, embedding the token `__loom_respond_<slug>`, yet the page never says where `<slug>` is derived from. Every sibling site that emits `__loom_respond_<slug>` forward-links the slug's source of truth in `schema-subset.md`, but ERR-17 carries no such hook. A conformance-test author landing on ERR-17 cannot derive the expected literal without prior knowledge of the canonical schema hash / synthesised-name recipe.

## Solution approach

Add a forward-cross-reference on the first mention of `__loom_respond_<slug>` in ERR-17, pointing at `schema-subset.md`'s `#canonical-schema-hash` and `#synthesised-names` anchors as the source of truth for the slug. The sibling `__loom_respond_<slug>` callsite in `query/query-failure-and-repair.md` is the existing precedent for the forward-link.

## Solution constraints

- None.

## Relationships

- T070 "Schema-slug collision posture is pinned only for the `pi.registerTool` cache, leaving the `$defs` hoist and the validator cache silent" - same-cluster (touches the same slug recipe but is about collision-handling, not about cross-referencing the recipe)
# T020 - DISC-6 over-prescribes implementation mechanism; `--loom` registration omits a pinned description

**Original heading:** DISC-6 over-prescribes `.catch(() => {})`, GC/file-handle mechanics, and the exact per-read deadline formula; `--loom` description elided
**Original section:** docs/spec_topics/ errors-and-results + discovery
**Kind:** prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

DISC-6 in `docs/spec_topics/discovery/package-and-settings.md` (the `<a id="disc-6">` bullet) mixes a small number of genuine behavioural obligations with three pieces of implementation prescription that the spec has no reason to lock in. The settled rejection of an abandoned read MUST be silenced "with `.catch(() => {})`"; the in-flight read on per-read timeout is described as "the file handle is dropped and GC'd"; and the per-read deadline is pinned to the exact algebra `deadline = max(200, floor(looms.scanPackagesTimeoutMs / 10))`. The three obligations DISC-6 actually needs are observable: a settled rejection from an abandoned read MUST NOT be surfaced or re-routed back into the discovery pass; a per-scan unreadable diagnostic is emitted at most once per timed-out candidate; and the per-read deadline is at least the documented floor (`200 ms`) and scales proportionally with `looms.scanPackagesTimeoutMs`. As written, an implementer who satisfies the observable contract via (say) an `AbortController`-only path, a `try { … } finally { … }` without the `.catch` swallow, or a deadline of `Math.max(200, scanPackagesTimeoutMs >> 3)` would non-conform to the spec without producing a behavioural difference any test could see.

Separately, the canonical line in `docs/spec_topics/pi-integration-contract/registration-steps.md` step 1 — `pi.registerFlag('loom', { type: 'string', description: … })` — leaves the `description` slot as a literal `…` placeholder. Surrounding prose declares the exact string non-normative and gives an illustrative example (`'Loom file or directory paths, joined with the OS path-list separator'`), but the signature itself still carries the ellipsis, which inverts the normal spec convention that signature lines are byte-readable.

These are two independent obligations against two different files, bundled into one finding because both surfaced in the same prescription sweep. They are resolved by independent edits and should be fixed sequentially, not as one combined patch.

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — DISC-6 bullet (edited)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/package-read-timeout` row (read-only — cross-checked for any restatement of the prescribed mechanism; carries only the `details.kind` payload and points back to DISC-6)
- `docs/spec_topics/pi-integration-contract/registration-steps.md` — step 1 `pi.registerFlag('loom', …)` signature line (edited)
- `docs/spec_topics/discovery/discovery-sources.md` — `<a id="loom-flag-namespace">` paragraph (read-only — already states the flag-name namespace-clearance and first-load-wins behaviour; no edit needed)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The plan currently contains no leaves; `docs/plan_topics/` holds only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md`.)

## Consequence

**Severity:** advisory

A conforming implementation that satisfies the observable contract (no surfaced settled-rejection, per-scan unreadable, deadline floor + proportionality) but uses a different swallowing primitive or a different deadline formula would technically violate DISC-6 as written, even though no diagnostic, log entry, or behaviour visible at any seam differs. The `…` description placeholder is purely editorial and would not block implementation, but reads as an unresolved spec drafting gap at a numbered, normative registration step.

## Solution Space

**Shape:** multiple
**State:** shaped

This finding is bimodal — it bundles a prescription-demotion obligation (DISC-6 mechanism) with an editorial pin (`--loom` description string). The two obligations land in different files, are independently testable, and have no shared edit. Resolve them sequentially.

### Option A — Demote DISC-6 implementation mechanism to non-normative

**Approach.** Rewrite the per-read-timeout sentence in DISC-6 so the normative requirements are stated behaviourally, and move the `.catch(() => {})` / file-handle-GC / exact-deadline-formula text into a parenthetical non-normative implementer note (or a footnote).

**Spec edits.** In `docs/spec_topics/discovery/package-and-settings.md`, DISC-6:

- Replace "the read's eventual settlement MUST be silenced with `.catch(() => {})` and its result MUST NOT be re-routed back into the discovery pass" with "the read's eventual settlement MUST NOT be surfaced as a discovery diagnostic and MUST NOT be re-routed back into the discovery pass; the runtime is responsible for attaching a same-tick rejection handler so the settled promise does not surface as an unhandled rejection. *(One conforming idiom is `.catch(() => {})` attached at the same site that initiates the read; the requirement is observable, not the idiom.)*"
- Replace "the in-flight read is abandoned (the file handle is dropped and GC'd; …)" with "the in-flight read is abandoned (no further bytes from that read contribute to the registry, and any underlying file handle is released as the runtime sees fit); …"
- Replace "each candidate `package.json` read is bounded by a deadline race scheduled through `Clock.setTimeout`, where `deadline = max(200, floor(looms.scanPackagesTimeoutMs / 10))` milliseconds" with "each candidate `package.json` read is bounded by a deadline derived from `looms.scanPackagesTimeoutMs`: the per-read deadline MUST be at least `200 ms` (the floor) and MUST be a monotonically non-decreasing function of `looms.scanPackagesTimeoutMs` so that raising the global cap raises the per-read budget. The default-cap derivation `max(200, floor(looms.scanPackagesTimeoutMs / 10))` (so `2000 ms` global yields a `200 ms` per-read budget) is one conforming choice; it is non-normative."
- Keep normative: the `Clock.setTimeout` seam obligation (testability), the `FakeClock`-driven ordering tie-break, the once-per-candidate diagnostic, and the "unreadable for this scan only" caching rule.

**Pros.** Lifts the over-prescription without weakening any observable behaviour. The `Clock`-seam testability hook remains pinned, so `FakeClock`-driven tests still constrain the implementation. The deadline floor + monotonicity is what test fixtures can actually assert against.

**Cons.** Two passes (this fix, then a downstream sweep) may discover that the related finding *"Concurrency cache-immutability, loop-iteration 'one macrotask,' and `.catch(() => {})` over-prescribe mechanism"* needs an identical edit motif at three further sites; the two findings should share a vocabulary ("settled rejection MUST NOT be surfaced") so the corpus reads consistently.

**Risks.** None observable. The "MUST be at least 200 ms" floor must not be dropped — that floor is a real reliability obligation on slow filesystems and the related diagnostic tests rely on it.

### Option B — Pin the `--loom` `registerFlag` description

**Approach.** Replace the literal `…` placeholder in the `pi.registerFlag('loom', …)` signature in `registration-steps.md` step 1 with the example string the surrounding prose already provides, and rephrase the "exact `description` string is non-normative" clause so the pinned-on-the-page string is identified as the pinned-but-non-normative recommendation rather than as one illustrative example among unspecified others.

**Spec edits.** In `docs/spec_topics/pi-integration-contract/registration-steps.md`, step 1:

- Replace `pi.registerFlag('loom', { type: 'string', description: … })` (both occurrences in the opening sentence) with `pi.registerFlag('loom', { type: 'string', description: 'Loom file or directory paths, joined with the OS path-list separator' })`.
- Rephrase the trailing clause to: "The flag name `'loom'`, `type: 'string'`, the presence of a `description`, and the registration ordering relative to `resources_discover` are the observable pins; the exact `description` string is non-normative (Pi renders it only in `--help`, where it keys no loom surface) and the value above is the recommended default."

**Pros.** Removes the placeholder, leaves the page byte-readable, preserves the existing non-normative status of the string verbatim.

**Cons.** Negligible — the example string is already in the page; this edit only promotes it from an inline illustration to the signature itself.

**Risks.** None.

### Recommendation

Adopt both options, in this order:

1. **First**, Option B (the editorial pin). It is the smaller, scope-bounded edit and lands at a different file, so it cannot interact with the prescription rewrite. Settling it first removes the editorial nit from the corpus and lets the next pass's lenses focus on the prescription edit without re-flagging the placeholder.
2. **Second**, Option A (DISC-6 demotion). This is the substantive edit. Implementer edge cases to watch: the per-read floor (`200 ms`) MUST remain a hard lower bound regardless of how small `looms.scanPackagesTimeoutMs` is configured; the `Clock.setTimeout` seam MUST remain the only timer source so `FakeClock` tests stay deterministic; and the cap-check / per-read tie-break wording elsewhere in the same paragraph references the exact formula and must be checked for collateral wording drift when the formula is demoted.

Both edits should preserve every cross-reference into DISC-6 from `code-registry-load.md` (the `loom/load/package-read-timeout` row's anchor link `#package-discovery`) and from `discovery-sources.md` (`<a id="loom-flag-namespace">`); no anchor IDs change under either option.

## Relationships

None

---

# T021 - Three clarity defects in collision and error-variant prose: `cross-source-shadow` ≥3-source cardinality, "is now self-referential", "rarely have one"

**Original heading:** `cross-source-shadow` ">2 colliding sources" cardinality undefined; "is now self-referential"; "rarely have one"
**Original section:** docs/spec_topics/ errors-and-results + discovery
**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Three independent clarity defects landed under one heading because they share the "shard-06" lens; they should be resolved as separate edits.

**(a) `cross-source-shadow` cardinality for ≥3 sources.** `discovery-sources.md` Source-priority says: *"When the same slash name resolves from multiple sources, the higher-priority source wins and `loom/load/cross-source-shadow` is emitted naming both paths."* The opening phrase "multiple sources" admits three-or-more, but the closing phrase "naming both paths" implicitly assumes exactly two. The diagnostic-template row in `diagnostics/code-registry-load.md` reinforces the two-way shape (`'<higher>' wins over '<lower>'`), and the test vector in `diagnostics/placeholder-rendering-b.md` only exercises a two-source case. By contrast, the sibling rule DISC-4 (`cross-format-collision`) is explicit that three same-priority colliders produce a single diagnostic listing every path. Two reasonable implementers will diverge on whether a three-source shadow (e.g. CLI > settings > project) emits one diagnostic listing the winner plus every shadowed path, one diagnostic per shadowed loser pairing the winner against each loser, or only the single highest-priority loser (matching the literal "both paths" wording).

**(b) "is now self-referential".** `queryerror-variants.md` says of `InvokeError.inner`: *"The recursive `inner: QueryError` field is now self-referential within this section."* The temporal "now" is unanchored — there is no preceding statement that it was previously not self-referential — and reads as residual draft-history prose rather than a normative statement.

**(c) "rarely have one".** The same file states: *"`raw_response` only appears on variants where the model produced (or attempted to produce) a final text response. `cancelled` and `context_overflow` rarely have one; `transport` failures by definition have no assistant response."* The schemas defined immediately above for `CancelledError` and `ContextOverflowError` do not declare a `raw_response` field at all, so "rarely have one" is not merely imprecise — it contradicts the schemas, which never carry the field. "Rarely" also leaves open whether implementations are permitted to add it, which they are not.

## Spec Documents

- `docs/spec_topics/discovery/discovery-sources.md` — Source priority paragraph (edited)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/cross-source-shadow` row, *Format* column (edited under option A; read-only under option B)
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — `cross-source-shadow` test vector (option-dependent)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — `InvokeError` section and the `raw_response` recap paragraph (edited)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project has a `plan.md` but no leaves are yet authored under any phase.)

## Consequence

**Severity:** correctness

For obligation (a), the `cross-source-shadow` cardinality ambiguity will cause two reasonable implementers to produce different wire-observable behaviour — one diagnostic vs N — for the same three-source input, breaking conformance. Obligations (b) and (c) are cosmetic and prose-correctness respectively; (c) additionally risks an implementer adding a `raw_response` field to `CancelledError` / `ContextOverflowError` schemas on the strength of the "rarely have one" hint, contradicting the schema declarations.

## Solution Space

**Shape:** multiple
**State:** shaped

The three obligations are independent and should be resolved sequentially in the order below so each lands on a stable baseline. Each `Option` block here is one obligation, not one alternative; the per-obligation choice (where there is one) is noted inside the block.

### Option A — Define `cross-source-shadow` cardinality for ≥3 sources

**Approach.** Replace the Source-priority sentence in `discovery-sources.md` with a cardinality-explicit form, then align the diagnostic template and any test vectors.

**Spec edits.**
- In `discovery-sources.md`, rewrite the Source-priority sentence to: *"When the same slash name resolves from two or more sources, the highest-priority source wins, every lower-priority candidate is shadowed, and a single `loom/load/cross-source-shadow` diagnostic is emitted naming the winning path and every shadowed path."* (Aligns with DISC-4's "one diagnostic listing all colliders" pattern — recommended.) Alternative wording: *"…and one `loom/load/cross-source-shadow` diagnostic is emitted per shadowed candidate, each naming the winner and that loser."* (Per-shadow shape — viable but louder.)
- In `diagnostics/code-registry-load.md`, update the *Format* cell of the `cross-source-shadow` row to match — under the recommended single-diagnostic shape, change `'<higher>' wins over '<lower>'` to a form that admits a list of losers (e.g. `'<higher>' wins over <lower-list>` with `<lower-list>` defined as a comma-separated list of `'<path>'` entries, and add a placeholder definition to `placeholder-rendering-b.md`).
- In `placeholder-rendering-b.md`, add a second test vector covering a three-source shadow so the rendering of the multi-loser case is pinned.

**Pros.** Removes the divergence; aligns the shadow rule with DISC-4's already-pinned multi-collider shape; one diagnostic per shadow event is easier for downstream consumers to count.
**Cons.** Requires touching the placeholder grammar in `placeholder-rendering-b.md` to admit a list-valued slot.
**Risks.** The recommended sub-option introduces a new placeholder shape (`<lower-list>`); make sure the freeform-tail placeholder taxonomy in `placeholder-rendering-b.md` already covers list-valued tails before adopting, or extend it explicitly.

### Option B — Fix "is now self-referential"

**Approach.** Drop the temporal qualifier.

**Spec edits.** In `queryerror-variants.md`, replace *"The recursive `inner: QueryError` field is now self-referential within this section."* with *"The `inner: QueryError` field is self-referential: `InvokeError` may itself appear as `inner`, allowing nested invoke chains to surface the full chain."* (Or strike the sentence entirely if the schema block below it already makes self-reference obvious — the recursion is visible in the schema syntax.)

**Pros.** One-sentence edit; removes draft-history wording.
**Cons.** None.
**Risks.** None.

### Option C — Reconcile "rarely have one" with the `CancelledError` / `ContextOverflowError` schemas

**Approach.** State that the two variants do not carry `raw_response`, matching their schemas.

**Spec edits.** In `queryerror-variants.md`, replace *"`cancelled` and `context_overflow` rarely have one; `transport` failures by definition have no assistant response."* with *"`CancelledError` and `ContextOverflowError` do not declare a `raw_response` field (their schemas above carry only the listed fields); `TransportError` likewise carries no assistant response."* This makes the recap match the schemas verbatim and forecloses an implementer adding the field.

**Pros.** Brings the prose into agreement with the schema declarations directly above it; eliminates a latent schema-drift hazard.
**Cons.** None.
**Risks.** None — but cross-check that no other section of the spec references a `raw_response` field on either variant before committing.

### Recommendation

Resolve in the order **B → C → A**: (B) and (C) are localised single-paragraph edits in one file that bring the spec to a clean baseline; (A) is the larger multi-file edit and should land last so it diffs cleanly against the stabilised `queryerror-variants.md`. For (A), prefer the single-diagnostic-listing-all-shadowed-paths shape to match DISC-4's already-pinned convention; the per-shadow alternative is viable but introduces an asymmetry between the two sibling collision diagnostics that buys nothing. Implementers must watch the placeholder taxonomy in `placeholder-rendering-b.md` when extending the diagnostic template — add the list-valued placeholder definition in the same edit as the template change.

## Relationships

- T095 "ERR-7 lacks a defining anchor on the discovery pages, and the payload field carrying shadow/collision paths is unstated" - same-cluster (also touches the `cross-source-shadow` payload contract; resolving the cardinality here narrows but does not subsume the payload-field question there)

---

# T022 - Macrotask-yield primitive at the loop-iteration checkpoint is unspecified

**Kind:** implementability, prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

PIC-10's `loop-iter` production-wiring rule in `host-interfaces-services.md` and the **Granularity** paragraph in `cancellation.md` both require `before(...)` to "release the event loop for one macrotask turn" before the signal-check, but neither names the concrete primitive that effects the release. The candidate Node primitives are not interchangeable: `queueMicrotask` and `Promise.resolve().then` schedule microtasks that never drain a pending macrotask and defeat the rule, while `setTimeout(fn, 0)` and `MessageChannel.postMessage` land in different (and version-dependent) loop phases. The rule's correctness depends on a check-phase release that pairs with the Pi-dispatched abort macrotask flipping `loomAbort.signal.aborted` (the lifecycle pinned at `#pi-slash-handler-promise-lifecycle-presupposition` in `host-interfaces-core.md`). Two implementers choosing different primitives produce observably divergent Esc-during-compute-bound-loop behaviour against the same Pi version.

## Solution approach

Amend PIC-10's `loop-iter` production-wiring bullet in `host-interfaces-services.md` (`#pic-10`) to require that `before(...)` releases the event loop via `setImmediate` (resolution on the check phase), and state in one clause why a check-phase release is the condition the macrotask-yield rule depends on. Update the **Granularity** paragraph in `cancellation.md` only as a cross-reference to the pinned primitive if needed for consistency.

## Solution constraints

- The `setImmediate` requirement applies to `loop-iter` only; the other checkpoint kinds (`query`, `tool-call`, `invoke`, `binder-call`) keep their existing resolution under PIC-10.
- The requirement is on production wiring only; test wiring under the `Checkpoint` seam retains PIC-10's existing test/production split and may substitute a synchronous resolution.

## Relationships

None
# T023 - "CIO-N rules above" and the five-site co-edit "(in this page)" point to anchors on the sibling page

**Kind:** implementability, placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`ceiling-invariants-and-audit.md` carries textual back-references to the CIO-1…CIO-6 interaction-order rules that claim those rules live "above" or "in this page", but the rules are defined on the sibling page `ceilings-3-and-4.md` under `#ceiling-interaction-order` (anchors `#cio-1`…`#cio-6`). The affected sites are the *Worked consequences* lede ("each illustrates one or more `CIO-N` rules above"), the unhyperlinked bullet tags such as `(CIO-3, CIO-4)`, and the *Five-site list co-edit obligation* ("MUST update the five-site enumeration in CIO-3 above (in this page)"). The "(in this page)" parenthetical is false, and the bare `CIO-N` tokens give an editor performing the five-site lock-step co-edit no working pointer to the rule they must satisfy.

## Solution approach

Replace each broken in-page CIO-N reference on `ceiling-invariants-and-audit.md` with an explicit cross-link to `ceilings-3-and-4.md`: point the *Worked consequences* lede at `#ceiling-interaction-order` and drop "above", link each worked-consequence bullet tag (`CIO-2`, `CIO-3`, `CIO-4`) to its `#cio-N` anchor, and rewrite the *Five-site list co-edit obligation* to link `CIO-3` to `#cio-3` while deleting "above (in this page)". Match the relative-link spelling already used by the two correct in-file CIO references so a path grep stays clean.

## Solution constraints

- Edit only `ceiling-invariants-and-audit.md`; the CIO-N rule definitions and their `#cio-1`…`#cio-6` anchors stay single-sourced on `ceilings-3-and-4.md` — do not move or duplicate them.

## Relationships

None
# T024 - Tool-calls / cancellation: four normative-prose escape hatches

**Original heading:** Tool-calls/cancellation clarity: "any internal failure that should cascade"; "etc." in a normative shape-violation set; "appropriate sub-variant"; child-invoke arm discriminator not exhaustive
**Original section:** docs/spec_topics/ tool-calls, cancellation, hard-ceilings
**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Four independent escape-hatch phrases sit on normative surfaces in `cancellation.md` and `tool-calls.md`. Each makes one rule indeterminate for a conforming implementer or a conformance-fixture author:

1. **Vague cascade authorisation (`cancellation.md`, *Forwarding into `loomAbort`*, tool-exposed-entry bullet).** "The runtime may also call `loomAbort.abort()` itself on any internal failure that should cascade." The MAY is keyed off an undefined predicate ("should cascade"), with no enumeration of which failure classes are eligible. Two implementers will draw the line differently — one cascades on every `internal-error`, another only on adapter-setup throws — and no fixture can adjudicate.

2. **Open-ended normative shape-violation set (`tool-calls.md`, *Non-conforming return shape*).** The list of envelope violations ends in "etc.": "the resolved value is not an object, `content` is not iterable, an entry is missing `type` / `text`, etc." This sits inside a rule that routes the violation to `loom/runtime/internal-error` with `details.kind = "tool-return-shape"` — i.e. the discriminator is normative, but its membership is open. A test author cannot enumerate the test matrix.

3. **Forward reference with no target (`cancellation.md`, *Propagation*).** "a child loom cancelling internally surfaces as `Err(QueryError { kind: "cancelled" })` (or the appropriate sub-variant) to the parent" — "appropriate sub-variant" is a dangling reference. The Surfacing rule below defines the actual sub-variants (`invoke_callee` vs bare `cancelled`), but Propagation never names it; a reader who stops at Propagation has no rule.

4. **Child-invoke surfacing arms are not jointly exhaustive (`cancellation.md`, *Surfacing*, third bullet).** "A child invoke whose signal aborts surfaces … as `Err(QueryError { kind: "invoke_callee", inner: { kind: "cancelled", ... } })` when the abort originated inside the child, or directly as `kind: "cancelled"` when the parent's own signal fired first." Two cases are unaddressed: (a) ordinary downward propagation — the parent's signal aborts and the child's derived signal aborts in consequence; the abort "originated" at the parent but the child observes it through its own signal, so neither arm clearly governs; and (b) a same-window race where both signals fire before either checkpoint observes one. There is no tie-break.

Each defect is small in isolation; together they are the same hazard repeated four times on tightly-coupled surfaces (cancellation propagation and tool-call lowering), so they share a polish pass.

## Spec Documents

- `docs/spec_topics/cancellation.md` — *Forwarding into `loomAbort`* (tool-exposed-entry bullet) (edited)
- `docs/spec_topics/cancellation.md` — *Propagation* (edited)
- `docs/spec_topics/cancellation.md` — *Surfacing* (edited)
- `docs/spec_topics/tool-calls.md` — *Outcome enumeration (normative)* → *Non-conforming return shape* (edited)
- `docs/spec_topics/errors-and-results/error-model.md` — *Runtime panics* (read-only, for cross-checking the cascade-eligible class set)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — *QueryError variants* (read-only, sub-variant names for Propagation forward-link)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan currently carries no authored leaves; `docs/plan.md` declares all phase sections empty.)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on (1) which adapter/runtime failures cascade through `loomAbort.abort()`, (2) the closed membership of the `tool-return-shape` violation set used to compose conformance tests, and (4) what `Err` variant a downward-propagated child cancellation surfaces with. Defect (3) is structural rather than divergence-producing on its own, but it leaves the Propagation rule incomplete on its own page.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles four independent obligations. Splitting into one option per obligation lets each edit land as a small, separately-verifiable change against a stable baseline, rather than as one wide-surface clarity pass.

### Option A — Close the cascade-eligible failure set

**Approach.** In `cancellation.md`'s tool-exposed-entry bullet, replace "any internal failure that should cascade" with a closed enumeration of failure classes that MUST or MAY trigger `loomAbort.abort()` from the runtime side, tagging each. Anchor the list to the runtime-defect surface in `errors-and-results/error-model.md` *Runtime panics* so the set is co-located with the only other place these classes are named.

**Spec edits.** One bullet rewrite in `cancellation.md`; cross-link to `error-model.md#runtime-panics` and (if the prose lands the binding) a small forwarding note from Runtime panics back to the cascade rule.

**Pros.** Closes the only MAY in this section keyed off an undefined predicate; matches the closed-list treatment the rest of the cancellation page uses (CNCL-1/2/3, the four-step `agent_end` chain).

**Cons.** Forces an up-front decision on whether `tool-return-shape` violations cascade, which has independent design weight.

**Risks.** The enumeration may need extension as new runtime-defect classes are added; the rule should state the open-set policy ("classes added to *Runtime panics* are cascade-eligible by default unless tagged otherwise") to avoid recurring edits.

### Option B — Convert "etc." into a closed envelope-violation set or an explicit "illustrative" tag

**Approach.** In `tool-calls.md` *Non-conforming return shape*, either (i) replace "etc." with the closed enumeration of envelope conditions the runtime detects (resolved value is not an object; `content` is missing or not an iterable; any `content` entry is not an object; any entry's `type` is not `"text"`; any entry's `text` is missing or non-string), or (ii) reframe the parenthetical as explicitly non-normative examples and pin the normative criterion to a single observable predicate ("any condition under which the adapter's envelope-conformance check throws").

**Spec edits.** One sentence in `tool-calls.md`. Sub-option (i) additionally requires a stable list to match against in conformance fixtures.

**Pros.** Lets test authors enumerate the test matrix; eliminates the only "etc." inside a normative routing rule on the page.

**Cons.** Sub-option (i) couples the spec to a specific check decomposition; sub-option (ii) shifts authority to an implementation predicate (the throw) that the spec does not currently define.

**Risks.** Both sub-options need to be reconciled with whatever decomposition the lowering wrapper in `host-interfaces-core.md` *Tool execution from loom code* actually performs; pick the one that matches the lowering rule, not the one that reads cleanest in isolation.

### Option C — Replace "appropriate sub-variant" with a concrete forward link

**Approach.** In `cancellation.md` *Propagation*, replace "(or the appropriate sub-variant)" with a parenthetical that names the actual sub-variants and forward-links to the Surfacing rule that owns them — e.g. "(or the `invoke_callee`-wrapped form when the abort originated inside the child; see Surfacing below)".

**Spec edits.** One parenthetical in *Propagation*.

**Pros.** Trivially mechanical; eliminates the dangling reference; makes Propagation self-contained against Surfacing.

**Cons.** None substantive; the only design choice is whether to inline the sub-variant name or just name-and-link.

**Risks.** Must be resolved *after* Option D, because the Surfacing-arm decomposition is what determines which sub-variant names this parenthetical should cite.

### Option D — Make the child-invoke surfacing arms jointly exhaustive

**Approach.** Restate the third Surfacing bullet as a single decision with an exhaustive partition. The natural pivot is *which signal the child's own cancellation checkpoint observed first*:

- If the child observed its own derived signal aborting because the parent's signal fired (the downward-propagation case, including the same-window race), the surface is `kind: "cancelled"` (no `invoke_callee` wrapping) — the parent's own checkpoint will also surface `cancelled` on its next checkpoint, so the parent's `?`/`match` arms see a uniform `kind`.
- Otherwise — the child cancelled internally without the parent's signal having aborted — the surface is `kind: "invoke_callee", inner: { kind: "cancelled", ... }`.
- Tie-break for the same-window race: if both signals are observed aborted at the child's surfacing point, the parent-originated arm wins (i.e. bare `kind: "cancelled"`).

**Spec edits.** Rewrite of the third Surfacing bullet to express the partition as a single decision with the tie-break stated explicitly.

**Pros.** Closes the partition, makes the discriminator mechanical, gives a conformance fixture a single oracle.

**Cons.** Fixes a real semantic choice (parent-arm-wins) that the spec has so far left implicit; one direction must be picked.

**Risks.** Must be cross-checked against the `invoke` parent's `?`/`match` arms in the worked examples elsewhere in the corpus; the tie-break determines the variant `match` arms have to cover.

### Recommendation

Resolve in order **B → A → D → C**.

- **B first.** The "etc." edit is the smallest scope-bounding fix and is purely additive (closes a set); it does not depend on any other obligation here.
- **A second.** Closing the cascade-eligible set narrows the surface that Option B's `tool-return-shape` routing has to interact with; resolving B first means A's enumeration knows the membership.
- **D third.** The child-invoke arm partition is the semantically heaviest edit; landing it on a clean baseline (with B and A already closed) keeps its diff scoped to the Surfacing bullet.
- **C last.** The Propagation forward-link should cite whatever sub-variant names D leaves behind; doing C before D would lock in a name that D might revise.

Edge cases the implementer must watch:

- For Option A: confirm whether the runtime is *required* to cascade on `tool-return-shape` (treat-as-internal-error) or *permitted* to; the choice changes whether the cascade list is MUST or MAY for that class.
- For Option B sub-option (i): the enumeration MUST be a superset of every condition the lowering wrapper actually catches, or a conforming runtime can fail a fixture by detecting a violation the spec did not list.
- For Option D: the tie-break direction (parent-arm-wins) interacts with `invoke` worked examples in `invocation.md`; greppable check needed before landing.

## Relationships

- T025 "Shard-07 hidden-host assumptions and stale residue" - same-cluster (parallel multi-issue finding on the same files; independent edit)

---

# T025 - Shard-07 hidden-host assumptions and stale residue

**Original heading:** Tool-calls/cancellation/hard-ceilings hidden assumptions and cruft: Pi-tool schema retrievable/AJV-consumable; no output schema; slash handler idle-context `ctx.signal===undefined`; unhandledRejection timing; NOCEIL-3 V8 host; stale link/decision-log
**Original section:** docs/spec_topics/ tool-calls, cancellation, hard-ceilings
**Kind:** assumptions (shard-07), cruft (shard-07), error-model (shard-07)
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Two unrelated problems are stacked under one bundled review heading.

*Host-platform presuppositions that the spec leans on but never pins.* Shard-07 makes five load-bearing assumptions about Pi and about the host JavaScript runtime that none of the existing PIC presupposition lists name, so a future Pi or Node change in any of them would silently degrade observable behaviour without surfacing against a named, re-auditable obligation:

1. `tool-calls.md` (the **Argument shape** paragraph and the `unknown_tool` arm of **Failures**) presupposes Pi retains the registered `ToolDefinition`'s input schema after registration *and* exposes it in a shape the loom-side AJV can consume at every code-side call to mount its "safety-net" validation; the schema-retention/AJV-consumability presupposition is unpinned.
2. The same paragraph asserts as flat fact that "Pi tool definitions ship an input schema but no output schema" — a Pi-side claim that no PIC inventory item or presupposition records, so a future Pi tool surface that adds an `outputSchema` (or that loom hosts in a non-Pi context tomorrow) finds the spec silently mis-modelled.
3. `cancellation.md`'s **Forwarding into `loomAbort`** rule that "the runtime MUST tolerate `ctx.signal` being `undefined` at slash-command entry" attributes this to a documented Pi behaviour ("Pi documents `ctx.signal` as `undefined` in idle, non-turn contexts") but never records it as a presupposition alongside the six on the [Pi-side slash-handler promise lifecycle (consumption posture)](../../docs/spec_topics/pi-integration-contract/host-interfaces-core.md#pi-slash-handler-promise-lifecycle-presupposition) list. A future Pi that flipped the idle-context value (e.g. minted a synthetic always-non-aborted signal) would re-enter the "depend on its truthiness" path the rule was designed to forbid, but the version-bump checklist would not catch it.
4. `cancellation.md`'s **Race semantics — swallowing-handler attachment on every abandonable Promise** rule pins a Node-specific microtask-vs-`unhandledRejection`-timing model: "a `.catch(() => {})` registered lazily after cancellation fires will not catch a rejection that has already been queued for `unhandledRejection`." The same body of words appears in the *Post-cancel resolution* bullet in `tool-calls.md`. This is a presupposition about *Node*'s `unhandledRejection` semantics, not about Pi; the spec does not name a host-runtime presupposition list against which a future Node policy change (e.g. the `--unhandled-rejections=warn-with-error-code` posture, or worker-thread isolates) would re-validate.
5. `ceiling-invariants-and-audit.md`'s NOCEIL-3 closure cites V8-specific failure modes in normative prose — `"FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory"`, the `OOMErrorCallback` / `abort()` path, `--max-old-space-size`, `--heapsnapshot-near-heap-limit`. The four-axis closure that backs the `NOCEIL-1`…`NOCEIL-4` set is therefore complete *only* against a V8/Node host; on a non-V8 JavaScript host (a future loom port to QuickJS, Hermes, JavaScriptCore, etc.) the uncatchable-fatal arm's enumeration is incomplete and the closure is not actually closed. The V8/Node host is presupposed without being declared a precondition of the closure.

*Three small pieces of stale residue.* Independent of the assumption pins above:

6. `tool-calls.md` line 31 (the *Non-conforming return shape* bullet) and the following sentence end with `[Errors and Results — Runtime panics](./errors-and-results.md)` and `[Errors and Results](./errors-and-results.md)`, linking the hub rather than the `runtime-panics` anchor on `errors-and-results/error-model.md`. The peer link in the *Pre-evaluation setup throw* bullet on line 30 already uses the correct `./errors-and-results/error-model.md#runtime-panics` form. `ceiling-invariants-and-audit.md` has the same mistake at the `*invoke* panic mid-loop` bullet and at NOCEIL-3 (`../errors-and-results.md`). The unanchored links land readers on the hub, defeating the "Runtime panics" reference each citation site asks them to follow.
7. The *Outcome enumeration (normative)* paragraph in `tool-calls.md` introduces "Three further tool-side outcomes" and then lists four bullets (*Non-settling Promise*, *Pre-evaluation setup throw inside the `.loom`-callable adapter*, *Non-conforming return shape*, *Post-cancel resolution*). The count is wrong by one.
8. `ceiling-invariants-and-audit.md`'s ***loom 1.0.0 rejected-candidate record (closed).*** paragraph is a historical decision log: it enumerates three candidate ceilings considered and rejected during 1.0.0 (regex backtracking on built-ins, JSON-Schema width pathologies, pattern-match recursion depth) and explicitly tells future editors *not* to append to it. It conveys no obligation an implementer or future editor can act on — the four-axis check above already governs future ceiling edits — and is a closed decision-log surface of the kind GOV-22 retires elsewhere.

The hidden-assumptions cluster (1)–(5) is governance-grade load-bearing material; the cruft cluster (6)–(8) is cosmetic-to-advisory editorial cleanup. The two clusters share no edit surface and should be resolved separately.

## Spec Documents

- `docs/spec_topics/tool-calls.md` — *Argument shape*, *Return type*, *Failures*, *Outcome enumeration (normative)* paragraphs (edited)
- `docs/spec_topics/cancellation.md` — *Forwarding into `loomAbort`* (slash-command entry bullet) and *Race semantics — swallowing-handler attachment on every abandonable Promise* paragraphs (edited)
- `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md` — NOCEIL-3 bullet, *Worked consequences* (`invoke` panic mid-loop), and *loom 1.0.0 rejected-candidate record (closed)* paragraph (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — *Pi-side slash-handler promise lifecycle (consumption posture)* paragraph (option-dependent: natural landing site for new presuppositions (vii)+ covering the Pi-tool schema-retention/no-output-schema/idle-context claims)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — *Editorial-review checklist for unpinned host presuppositions* (option-dependent: receives new checklist items mirroring whatever presuppositions land)
- `docs/spec_topics/errors-and-results/error-model.md` — `runtime-panics` anchor (read-only; destination of the corrected links)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`docs/plan.md` lists no leaves yet.)

## Consequence

**Severity:** correctness

The five unpinned presuppositions are the real cost: each one is load-bearing for a normative MUST that would silently degrade — silent Pi-tool validation-mismatch handling, a silently mis-modelled Pi tool-output surface, the slash-handler forwarding path degrading to a no-op against a future Pi `ctx.signal` change, the swallowing-handler obligation becoming unsound against a future Node `unhandledRejection` policy, and the four-axis closure becoming incomplete on a non-V8 host. The version-bump checklist explicitly exists to catch silent host drift; these obligations bypass it. The stale-link / off-by-one-count / closed-decision-log items are cosmetic-to-advisory editorial residue that do not affect correctness but do degrade the spec's navigability and signal-to-noise.

## Solution Space

**Shape:** multiple
**State:** shaped

The bundled review heading combines two independently-resolvable obligations with no shared edit surface. Option A pins the host-platform presuppositions; Option B clears the editorial residue. Both must land, but they are best taken in sequence so the larger Option A edit lands on a clean baseline.

### Option A — Pin the five host-platform presuppositions on an audited list

**Approach.** Treat presuppositions (1)–(5) above on the same footing as the six presuppositions already enumerated on the [Pi-side slash-handler promise lifecycle (consumption posture)](../../docs/spec_topics/pi-integration-contract/host-interfaces-core.md#pi-slash-handler-promise-lifecycle-presupposition) list. Add an anchored block on `host-interfaces-core.md` (or a parallel sibling page if (4) and (5) are scoped to host-runtime rather than Pi-SDK) and forward-link every consumption site to it.

**Spec edits.**

- On `host-interfaces-core.md`, extend the existing Pi-side presupposition list (or open a sibling *Pi-tool-surface consumption posture* block) with two new entries: (vii) Pi-tool input-schema retention and AJV-consumable shape at code-side call time; (viii) Pi-tool definitions ship no `outputSchema`. Add a third entry (ix) covering the idle-context `ctx.signal === undefined` Pi posture cited from `cancellation.md`. Each entry gets an `<a id>` anchor.
- Open a parallel *Host-runtime consumption posture* block (likely on `host-interfaces-core.md` or `host-prerequisites.md`) for entries that are about Node/V8 rather than Pi: (x) Node `unhandledRejection` is unsuppressed by a `.catch` handler not attached before the first microtask boundary; (xi) NOCEIL-3's uncatchable-fatal closure is scoped to V8-class hosts (engine-fatal enumeration is taken against V8; a future port to another JS engine requires re-validating the closure).
- On `version-bump-step2.md`, add corresponding *Editorial-review checklist* items keyed to each new anchor; items (vii)–(ix) are Pi-bump items, items (x)–(xi) escalate on a Node major or a host-engine change.
- Rewrite the consumption sites — *Argument shape* and the `unknown_tool` arm in `tool-calls.md`, the *Forwarding into `loomAbort`* slash-command-entry bullet in `cancellation.md`, the *Race semantics — swallowing-handler attachment* paragraph in both `cancellation.md` and the *Post-cancel resolution* bullet in `tool-calls.md`, and NOCEIL-3 in `ceiling-invariants-and-audit.md` — to forward-link the new anchors instead of asserting the posture inline.

**Pros.** Brings the five claims under the audit umbrella that already exists for the six lifecycle presuppositions; gives a future Pi or Node bump a single named place to break against; preserves the prose at consumption sites by demoting it from flat assertion to "presupposed per (vii)".

**Cons.** Extends an already-long presupposition list; introduces a new *Host-runtime consumption posture* surface if (x)–(xi) do not fit the Pi-side list cleanly.

**Risks.** Misclassifying a host-runtime presupposition as Pi-side (or vice versa) would put it on the wrong checklist; the (x)/(xi) split must be drawn carefully so the SDK-surface inventory test is not asked to assert non-SDK properties.

### Option B — Editorial cleanup of the stale residue

**Approach.** Three independent micro-edits, no normative content change.

**Spec edits.**

- In `tool-calls.md`, fix the two anchorless `errors-and-results.md` links on lines 31 and 33 to the same `./errors-and-results/error-model.md#runtime-panics` form already used on line 30. Apply the same fix to `ceiling-invariants-and-audit.md`'s `*invoke* panic mid-loop` bullet and NOCEIL-3 (`../errors-and-results.md` → `../errors-and-results/error-model.md#runtime-panics`).
- In `tool-calls.md`'s *Outcome enumeration (normative)* paragraph, change "Three further tool-side outcomes" to "Four further tool-side outcomes" to match the four bullets below it.
- In `ceiling-invariants-and-audit.md`, delete the ***loom 1.0.0 rejected-candidate record (closed).*** paragraph. The four-axis check above already governs future ceiling edits; the closed sub-list provides no actionable obligation. If the worked examples have residual didactic value, move the three sentences to a non-normative footnote at the bottom of the page or to `docs/spec_topics/future-considerations.md`; do not retain them inline in a normative governance paragraph.

**Pros.** Small, mechanical, no cross-page coordination; restores navigability of every "Runtime panics" citation; fixes a visibly-wrong count; removes a closed decision log that future editors are explicitly told not to extend.

**Cons.** The rejected-candidate-record deletion has weak overlap with another finding ("Ceiling-set maintenance/governance content … rejected-candidate record …", line 702) that prefers moving the maintenance content wholesale to a governance page; if that finding lands first, this one's third sub-edit is subsumed.

**Risks.** None for the link fix and count fix. For the rejected-candidate-record deletion, ensure the four-axis routing-obligation prose above remains self-contained without the worked-examples sub-list — the *Routing obligation* paragraph references the closed record only in the "future spec-editors performing the four-axis check supply their own per-edit rationale rather than appending to this loom 1.0.0 worked-examples sub-list" clause, which must be rewritten to drop the back-reference.

### Recommendation

Land **Option B first, then Option A**.

Option B is three independent micro-edits with no normative content change, no presupposition-classification judgement, and no risk of bloating the Pi consumption-posture list. Doing it first removes the visible noise (broken links, off-by-one count, closed decision log) so that Option A's editing pass lands on a clean baseline and the diff readers see is the substantive presupposition pinning, not a mixed bag of cosmetic and load-bearing changes.

Implementer notes for Option B: defer the rejected-candidate-record deletion if the finding at source line 702 (which proposes moving all ceiling-set maintenance content to a governance page) is being addressed in the same loop iteration — that finding subsumes this sub-edit. Implementer notes for Option A: decide the Pi-side vs host-runtime split for (x)/(xi) before writing the anchor block; the existing six-presupposition list is Pi-side only, and conflating host-runtime presuppositions onto it risks misrouting their version-bump audit.

## Relationships

None

---

# T026 - `loom/parse/type-alias-cycle` cycle-chain rendering is unspecified

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `loom/parse/type-alias-cycle` row in `code-registry-parse.md` carries the *Message* template `type-alias cycle: <path>`, which renders via the §5 source-derived rule in `placeholder-rendering-b.md` as a single path-literal. The diagnostic, however, reports a cycle through one or more schema names (e.g. `X → Y → X`), so the `<path>` rule cannot produce the intended rendering. The two sibling cycle rows (`loom/load/import-cycle`, `loom/load/invocation-cycle`) spell the chain form — separator, head-repetition, per-element shape — explicitly in their *Message* templates, but this row does not, leaving the separator, head-repetition, and length->2 layout undefined. Under DIAG-4's byte-exact *Message* contract, two conforming implementations diverge and any test sourcing the expected string from the column is unwriteable.

## Solution approach

Rewrite the `loom/parse/type-alias-cycle` row's *Message* template in `code-registry-parse.md` from `type-alias cycle: <path>` to `type-alias cycle: <name1> → <name2> → <name1>`, reusing the category-7 identifier-shaped placeholders `<name1>`/`<name2>` already registered in `placeholder-rendering-b.md`. Pin the chain-layout convention in the row's *Trigger* prose — elements in declaration order along the detected cycle, ` → ` (space, U+2192, space) as the separator, head element re-emitted at the tail — mirroring the sibling `import-cycle` and `invocation-cycle` rows. Add a forward-link from the illustrative cycle example in `schemas.md` to the registry row as the authoritative source.

## Solution constraints

- None.

## Relationships

- T027 "`<key>` rendering for `loom/load/settings-value-out-of-range` is undetermined" - same-cluster (another DIAG-4 byte-exactness gap on a parse/load registry row).
- T075 "Bare-source backslash: no diagnostic code is named" - same-cluster (touches `type-alias-cycle` but covers a different concern — the missing diagnostic code for a bare-source backslash; the `type-alias-cycle` mention there is only preamble).
# T027 - `<key>` rendering for `loom/load/settings-value-out-of-range` is undetermined

**Original heading:** `` `settings-value-out-of-range` `<key>` form (dotted `looms.` vs bare) is unspecified ``
**Original section:** docs/spec_topics/diagnostics/
**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The `loom/load/settings-value-out-of-range` row in `diagnostics/code-registry-load.md` declares the Message template `settings key <key> value is out of range; got <observed>` and lists the four recognised scalar keys bare in its *Trigger* prose (`binderModel`, `scanPackages`, `scanPackagesMaxFiles`, `scanPackagesTimeoutMs`), while every other surface — `discovery/package-and-settings.md`'s settings inventory, `binder/binder-model-and-context.md`, `frontmatter/frontmatter-fields-a.md`, the glossary, and the hot-reload `loom-system-note` template — names the keys dotted as `looms.binderModel`, `looms.scanPackages`, etc.

`<key>` is the category-5 source-derived placeholder, whose §5 rule in `diagnostics/placeholder-rendering-b.md` quotes the rendered value with double quotes when it is *not* identifier-shaped per `[A-Za-z_][A-Za-z0-9_]*`. The dotted form (`looms.binderModel`) fails that predicate (the `.` is rejected) and would render double-quoted; the bare form (`binderModel`) is identifier-shaped and would render bare. With the row never pinning which form the renderer feeds into the placeholder, the emitted Message is one of two byte-distinct strings, and DIAG-4's byte-exact-renderer requirement turns that ambiguity into a conformance defect.

This is the only settings-keyed parsed-scalar row in the registry; the analogous frontmatter peer `loom/load/frontmatter-value-out-of-range` avoids the problem entirely by routing through the closed-enum `<dotted-key>` placeholder (§7), whose value table fixes the rendered text to `tool_loop.max_rounds` / `respond_repair.attempts` unquoted. The settings-keyed row has no equivalent fix-up.

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/settings-value-out-of-range` row (edited)
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — §5 `<key>` rule, §7 closed-enum table, *Test vectors* (option-dependent)
- `docs/spec_topics/discovery/package-and-settings.md` — *Settings file reads* / *Scalar-key validation* (read-only)
- `docs/spec_topics/diagnostics/placeholder-rendering-a.md` — §8 strict-equality build-time prohibition exemption list (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

## Consequence

**Severity:** correctness

Two conformant renderers, both following the spec literally, can emit byte-distinct Messages (`settings key "looms.binderModel" value is out of range; got null` vs `settings key binderModel value is out of range; got null`) for the same fault. The §8 parsed-scalar carve-out explicitly allows tests to assert byte-identical equality against this row's full Message, so the divergence is directly observable as a cross-implementation test failure.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Add a closed-enum `<settings-key>` placeholder

**Approach.** Mint a new §7 closed-enum placeholder `<settings-key>` whose closed value table is the four recognised keys in their canonical dotted form (`looms.binderModel`, `looms.scanPackages`, `looms.scanPackagesMaxFiles`, `looms.scanPackagesTimeoutMs`), rendered verbatim and unquoted. Retarget the `loom/load/settings-value-out-of-range` Message template from `<key>` to `<settings-key>`.

**Spec edits.**
- `diagnostics/code-registry-load.md`: change the Message template to `settings key <settings-key> value is out of range; got <observed>`; rewrite the *Trigger* prose to list the keys dotted (`looms.binderModel`, `looms.scanPackages`, `looms.scanPackagesMaxFiles`, `looms.scanPackagesTimeoutMs`) so the row's surfaces stop disagreeing with the rest of the corpus.
- `diagnostics/placeholder-rendering-b.md` §7 *Placeholders* list: add `<settings-key>`; add a *Closed-enum* sub-bullet pinning the four-member table; add a test vector showing a `loom/load/settings-value-out-of-range` for `looms.binderModel: null` rendering `settings key looms.binderModel value is out of range; got null`.
- `diagnostics/placeholder-rendering-b.md` §8 *Edge cases — Category 7 closed-enum closure*: extend the spec-versioned list to include `<settings-key>`.

**Pros.** Mirrors the precedent already established for `<dotted-key>` on the frontmatter peer row; pins the rendered string by construction; the closed set is GOV-7/GOV-8-versioned so additions are visible. Matches every other surface's dotted naming for settings keys.

**Cons.** Adds a new placeholder for one row; widens the closed-enum table set the corpus is responsible for keeping coordinated with the discovery key inventory.

**Risks.** Authors adding a fifth `looms.*` scalar must remember to extend the table in the same edit; the GOV-7 review gate covers this, but the two-site coupling (discovery inventory ↔ `<settings-key>` table) is a real maintenance edge.

### Option B — Pin the dotted form and rely on §5 quoting

**Approach.** Keep using `<key>`; pin the *Trigger* prose and a normative test vector requiring the renderer to feed the dotted source-text key (`looms.binderModel`, etc.) into the placeholder. The §5 rule then double-quotes the value because `.` defeats the identifier-shape predicate, yielding `settings key "looms.binderModel" value is out of range; got <observed>`.

**Spec edits.**
- `diagnostics/code-registry-load.md`: rewrite the *Trigger* prose to list keys dotted; add a normative sentence stating the `<key>` token receives the dotted name as it appears in the settings JSON path (`looms.binderModel`, not the bare leaf).
- `diagnostics/placeholder-rendering-b.md` §5 *Test vectors*: add a settings-value-out-of-range test vector showing the double-quoted dotted form.

**Pros.** No new placeholder; the existing §5 quoting rule already handles dotted strings deterministically.

**Cons.** Emits double-quoted settings keys, which reads oddly next to the surrounding `settings key …` framing and is inconsistent with how the frontmatter peer renders its `<dotted-key>` (unquoted). Adds a behavioural asymmetry between the two parsed-scalar registry rows for no semantic reason.

**Risks.** The dotted name is treated as the *key string* by the §5 runtime predicate, so a future renaming of the keys to identifier-shaped names (purely hypothetical, but possible under GOV-7) would silently flip the rendering to bare, breaking byte-exactness.

### Recommendation

Take **Option A**. The frontmatter peer already uses a closed-enum dotted-key placeholder; introducing `<settings-key>` extends the same pattern and lets the two parsed-scalar rows share a uniform rendering shape (`got <observed>` preceded by an unquoted dotted key). Resolve Option A's two-site coupling by stating in `diagnostics/code-registry-load.md` that adding a `looms.*` scalar key to the discovery inventory MUST also extend the `<settings-key>` closed-enum table in the same edit (the GOV-7 review-gate convention already used for `<dotted-key>` and `<cap>`).

Edge cases the implementer must watch:
- `looms.scanPackages` is the only boolean-typed key; the test-vector set should cover both a numeric-out-of-range case (`looms.scanPackagesMaxFiles: 0`) and a kind-mismatch case (`looms.scanPackages: "true"`) to demonstrate the unquoted key rendering survives different `<observed>` kinds.
- §8's strict-equality build-time prohibition exemption already names `loom/load/settings-value-out-of-range` as a parsed-scalar carve-out — that exemption is unchanged by the new placeholder (Message remains fully byte-identical) and needs no edit.
- Confirm `<settings-key>` does not collide with any existing placeholder token across the four registry tables before minting it.

## Relationships

- T026 "`loom/parse/type-alias-cycle` cycle-chain rendering is unspecified" - same-cluster (sibling DIAG-4 byte-exactness gap caused by an underspecified placeholder rendering, resolved independently)
- T028 "Diagnostics surface: column-header, sub-rule-category, and file-name labels drift across the seven-page cluster" - same-cluster (placeholder-categorisation hygiene in the same files; resolves independently)

---

# T028 - Diagnostics surface: column-header, sub-rule-category, and file-name labels drift across the seven-page cluster

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 5
**Shape:** single
**State:** reduced

## Problem

The seven-page diagnostics cluster drifts on the labels readers and tests must key on, eroding DIAG-4's contract that tests source the rendered string from the canonical *Message* column. `code-registry-runtime.md`'s table header reads `Message template` and `code-registry-host.md`'s reads `Severity` / `Anchor`, where the parse and load tables (and DIAG-4) canonicalise `Message`, `Sev`, and `Spec rule` — so tooling keyed on the canonical names silently skips those two tables. `code-registry-host.md`'s `loom/host/*` H3 (`host-observed anomalies`) names only one arm of the two-arm namespace its own intro paragraph defines. In `placeholder-rendering-b.md`, §7 files `<reason>` under `Closed-enum` despite its open `String(event.reason)` / `<unreadable>` fallback arm, §8 titles `<observed>` `Host-derived freeform-tail` despite its parsed-scalar and `host-incompatible` closed-literal arms, and the `placeholder-rendering-{a,b}.md` file stems convey no scope to a reader following an inbound link.

## Solution approach

Rename `code-registry-runtime.md`'s `Message template` column header to `Message`, and `code-registry-host.md`'s `Severity` / `Anchor` headers to `Sev` / `Spec rule`, matching the canonical names the parse and load tables and DIAG-4 use. Rewrite `code-registry-host.md`'s `loom/host/*` H3 to name both namespace arms consistent with its intro paragraph. In `placeholder-rendering-b.md`, move `<reason>` out of the `Closed-enum` sub-rule into one that names both its closed-arm and open-fallback paths, and re-title §8 so `<observed>`'s host-derived, closed-literal, and parsed-scalar arms are all admitted. Rename the `placeholder-rendering-{a,b}.md` files to stems that name their covered placeholder categories and repoint every inbound link across `docs/spec_topics/diagnostics/**` in the same commit.

## Solution constraints

- Out of scope: §8's `<failure>` carve-out, which is correctly framed as not a §8 placeholder — leave its prose unchanged when re-titling §8.

## Relationships

None
# T029 - Diagnostics shard: residual cruft and three unfalsifiable normative obligations

**Original heading:** Diagnostics cruft / testability: migration HTML comments, "previously rode this row" / naming-history notes, deferred-fallback hint; unfalsifiable multi-violation ordering, unreachable-path MUST, mutual-exclusion guarantee
**Original section:** docs/spec_topics/diagnostics/
**Kind:** cruft, testability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The diagnostics shard carries two distinct classes of defect that share a surface but resolve independently.

**Class A — residual editorial cruft in normative cells.** Five sites carry text that conveys no requirement to an implementer:

1. `code-registry-load.md`, end-of-file HTML comment: `<!-- loom/runtime/* registry now lives on code-registry-runtime.md; the former empty #loom-runtime-namespace stub anchor here was removed (no inbound links). -->` — a migration log of a past refactor.
2. `code-registry-load.md`, `loom/load/unreadable-source` *Trigger*: "The per-read-timeout sub-trigger that **previously rode this row** now has its own code, `loom/load/package-read-timeout` (see the row below)." — naming history embedded in a normative trigger cell.
3. `code-registry-load.md`, `loom/load/cross-format-collision` *Trigger*: "The code name retains the historical `cross-format` token as a stable diagnostics-contract identifier per [Diagnostic shape — DIAG-3](diagnostic-shape.md#diag-3)" — rationale for why the code was not renamed, governed already by DIAG-3.
4. `code-registry-load.md`, `loom/load/typed-query-unsupported-provider` *Hint*: "Switch to a supported provider, drop the typed-query expressions, **or wait for the deferred JSON-mode fallback in [Future Considerations](../future-considerations.md)**." — a stretch-goal forward-reference inside author-facing remediation guidance.
5. `code-registry-host.md`, `loom/host/session-shutdown-runtime-degraded` *Trigger*: two inline anchors `<a id="runtime-degraded-emission-condition">` and `<a id="runtime-degraded-co-emission">`. A full-corpus grep across `docs/` finds zero inbound links to either anchor; the sibling `<a id="cancelled-by-session-shutdown-mutual-exclusion">` on the same page is referenced from `session-shutdown-semantics.md` and `session-only-degraded-state.md`, so absence-of-references here is not a discovery artefact.

**Class B — three normative obligations with no falsifying acceptance criterion.**

1. `code-registry-runtime.md`, `loom/runtime/internal-error` *Trigger* (the tool-return-envelope `shape_check` priority rule): *"When a single envelope violates more than one check, the runtime emits the first-failing token in that listed order…"* The five tokens (`resolved-not-object`, `content-not-iterable`, `entry-missing-type`, `entry-missing-text`, `other`) form a strict priority order, but every documented test exercises only single-violation paths. An implementation that ignores the ordering rule entirely passes every test — the MUST is unfalsifiable.
2. `placeholder-rendering-a.md` §4 (Numeric placeholders): the rule asserts that `Infinity`/`NaN` are *"unreachable by construction"* and then attaches a MUST that a renderer encountering one route it through `loom/runtime/internal-error`. Because the path is spec-guaranteed unreachable, no valid test input can exercise the obligation; an implementation that omits the guard is indistinguishable from one that includes it.
3. `code-registry-host.md`, `loom/host/session-shutdown-pinned-constant-unreadable` *Trigger*: *"This code and `loom/host/session-shutdown-reason-unknown` are **mutually exclusive**…"* The guarantee is normative (it prevents a misleading `event.reason outside closed set: quit` rendering on snapshot-corruption + valid-reason coincidence), but no acceptance scenario for the simultaneous-trigger case is documented. An implementation that emits both diagnostics on that simultaneous path violates the guarantee silently.

The two classes share the same files but are mechanically independent: Class A is pure deletion, Class B requires new acceptance criteria plus one MUST→SHOULD demotion.

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-load.md` — end-of-file HTML comment; `loom/load/unreadable-source` *Trigger*; `loom/load/cross-format-collision` *Trigger*; `loom/load/typed-query-unsupported-provider` *Hint* (edited)
- `docs/spec_topics/diagnostics/code-registry-host.md` — `loom/host/session-shutdown-runtime-degraded` *Trigger* (orphaned anchors); `loom/host/session-shutdown-pinned-constant-unreadable` *Trigger* (mutual-exclusion criterion) (edited)
- `docs/spec_topics/diagnostics/code-registry-runtime.md` — `loom/runtime/internal-error` *Trigger* (multi-violation `shape_check` ordering criterion) (edited)
- `docs/spec_topics/diagnostics/placeholder-rendering-a.md` — §4 Numeric placeholders, unreachable-path MUST (edited)
- `docs/spec_topics/diagnostics/diagnostic-shape.md` — DIAG-3 (read-only; referenced from the deleted cross-format rationale)
- `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md` — confirms `#cancelled-by-session-shutdown-mutual-exclusion` is referenced (so its sibling anchors' orphan status is not a search artefact) (read-only)
- `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md` — same (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The plan currently contains no leaves; no acceptance criteria are blocked or modified.)

## Consequence

**Severity:** advisory

The cruft items add reader friction and the risk of stale forward-references but block no implementer. The three testability gaps are more substantive: two reasonable implementers can produce divergent wire output (a wrong-priority `details.shape_check` token, a co-emitted `reason-unknown` + `pinned-constant-unreadable` pair on a corrupted snapshot) while both pass every documented test, undermining the diagnostic shape contract that downstream operator-tooling depends on.

## Solution Space

**Shape:** multiple
**State:** shaped

This finding bundles two independent obligations that touch the same shard but resolve mechanically distinctly. They are split into separate options below so they can be loop-fixed sequentially.

### Option A — Delete the editorial cruft

**Approach.** Pure deletions and one targeted rewrite. No new normative content.

**Spec edits.**
- `code-registry-load.md`: delete the end-of-file HTML comment in full.
- `code-registry-load.md`, `unreadable-source` *Trigger*: delete the sentence beginning "The per-read-timeout sub-trigger that previously rode this row…". The separately-tabled `loom/load/package-read-timeout` row already conveys the actionable fact; no forward-pointer is needed.
- `code-registry-load.md`, `cross-format-collision` *Trigger*: delete the clause "The code name retains the historical `cross-format` token as a stable diagnostics-contract identifier per [Diagnostic shape — DIAG-3](diagnostic-shape.md#diag-3);" leaving only "Its scope is the full same-priority slash-name collision rule, not only the cross-format arm."
- `code-registry-load.md`, `typed-query-unsupported-provider` *Hint*: delete the third option, leaving "Switch to a supported provider, or drop the typed-query expressions."
- `code-registry-host.md`, `session-shutdown-runtime-degraded` *Trigger*: delete `<a id="runtime-degraded-emission-condition"></a>` and `<a id="runtime-degraded-co-emission"></a>`. (Confirm no inbound links exist via a final corpus grep before deletion; the sibling `#cancelled-by-session-shutdown-mutual-exclusion` anchor stays — it is referenced.)

**Pros.** Pure deletions; no new normative surface; no governance review required; reduces reader friction and removes one risk vector (a future contributor linking to a dead anchor on the assumption it is a stable contract point).

**Cons.** None.

**Risks.** The orphan-anchor deletion depends on the corpus-grep evidence being complete. Confirm by re-running `grep -rn '#runtime-degraded-emission-condition\|#runtime-degraded-co-emission' docs/` immediately before the edit; only proceed if zero hits are returned.

### Option B — Anchor the three unfalsifiable normative obligations

**Approach.** Add two acceptance criteria and demote one MUST.

**Spec edits.**
- `code-registry-runtime.md`, `loom/runtime/internal-error` *Trigger*: append an acceptance criterion for the multi-violation case. Concrete form: *"When a tool envelope's resolved value is `null`, `details.shape_check` MUST be `"resolved-not-object"` and MUST NOT be `"other"` even though `null` also satisfies the `other` catch-all. When the envelope is `{ content: 7 }` (a non-iterable `content` on an object), `details.shape_check` MUST be `"content-not-iterable"`."* Two vectors suffice to discriminate any wrong-priority implementation.
- `placeholder-rendering-a.md` §4: change "a renderer that nonetheless encounters one MUST surface it through `loom/runtime/internal-error`" to "…SHOULD surface…" (or, equivalently, demote the whole guard sentence to a non-normative parenthetical: *"(Implementations MAY route a stray `Infinity`/`NaN` through `loom/runtime/internal-error` as a defence-in-depth; the path is unreachable by construction in conformant emitters.)"*). The stronger form (full demotion) is preferred since the antecedent guarantees unreachability.
- `code-registry-host.md`, `session-shutdown-pinned-constant-unreadable` *Trigger*: append an acceptance criterion for the simultaneous-trigger case. Concrete form: *"When the handler-entry pinned-constant lookup fails AND `event.reason` is a member of the closed set (e.g. `"quit"`), the handler MUST emit exactly one diagnostic with code `loom/host/session-shutdown-pinned-constant-unreadable` and MUST NOT emit any diagnostic with code `loom/host/session-shutdown-reason-unknown` for the same event."*

**Pros.** Each obligation becomes mechanically testable; the wire-contract divergence risk is closed.

**Cons.** Adds three short blocks of normative prose to already-dense trigger cells.

**Risks.** The placeholder-rendering-a §4 demotion is the only judgement call: a future editor may want the MUST back if the unreachability premise is ever weakened (e.g. a new emitting site is added whose bound is not statically obvious). The replacement language should make the unreachability premise the explicit precondition so the relationship survives a future audit.

### Recommendation

Apply **Option A first**, then **Option B**.

Option A is pure deletion across five small cells and lands a stable baseline (no normative additions, no anchor renames). Option B then adds three normative additions/demotions to a quieter surface, so the next pass's lenses critique the new acceptance criteria rather than re-flagging deleted cruft. Bundling both into one edit empirically produces a diff large enough to destabilise the per-finding fix loop on this shard.

Implementer must watch: the Option A orphan-anchor deletion is only safe under fresh corpus-grep evidence (anchors can acquire inbound links between review passes). For Option B, the multi-violation acceptance criterion must pick vectors that actually discriminate priority (a `null` value falsifies any implementation that defaults to `"other"`; `{ content: 7 }` falsifies any that short-circuits on `entry-missing-type` ahead of `content-not-iterable`).

## Relationships

- T028 "Diagnostics surface: column-header, sub-rule-category, and file-name labels drift across the seven-page cluster" - same-cluster (same shard, independent naming concerns)
- T030 "Three unsourced Pi-SDK behavioural assertions in the diagnostics cluster" - same-cluster (same shard, independent assumption concerns)

---

# T030 - Three unsourced Pi-SDK behavioural assertions in the diagnostics cluster

**Original heading:** Diagnostics hidden assumptions: `LoadExtensionsResult.errors` population window; universal `strictCapable` absence over the tilde range; byte-offset-reporting UTF-8 validator
**Original section:** docs/spec_topics/diagnostics/
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The diagnostics cluster carries three independent claims about Pi-SDK or runtime behaviour that the spec asserts as load-bearing but does not anchor or justify on the page where the assertion is made. None of the three depends on the others; each is a separate edit on a separate page.

1. **`LoadExtensionsResult.errors` population window.** `docs/spec_topics/diagnostics.md` opens by asserting that Pi's `LoadExtensionsResult.errors` field is "only populated while Pi is `import()`-ing the loom extension's entry point," and uses that fact as the *sole* rationale for why loom does not consume `LoadExtensionsResult.errors`. Reading Pi's `dist/core/extensions/loader.js#loadExtension` at the loom 1.0 Pi-SDK pin shows the function wraps both `loadExtensionModule(...)` (the dynamic-`import` call) and the subsequent `await factory(api)` invocation in a single `try/catch` and pushes any caught error into `errors`. The "only during `import()`" framing is therefore slightly inaccurate: a factory-time throw lands in `errors` too. The diagnostics cluster's own [`loom/load/extension-bootstrap-failed`](./diagnostics/code-registry-load.md) row describes exactly the post-probe factory-time class of failures that would land there, so the "orthogonal / not used" rationale is fragile on its current wording and has no Pi-side citation backing the windowing claim.

2. **Universal `strictCapable` absence at the pinned range.** `docs/spec_topics/diagnostics/code-registry-load.md`'s `loom/load/binder-model-strict-capability-unknown` row asserts the warning is "Universal under the [loom 1.0 Pi-SDK pin]", and `docs/spec_topics/binder/binder-model-and-context.md`'s strict-capability paragraph repeats the same claim ("production behaviour is the universal-W branch"). The claim is empirically true — a grep across the bundled `@earendil-works/*` packages at the current `~0.75.5` pin finds no `strictCapable` member anywhere — but neither page cites where that absence is verified, nor does the corresponding pin-side prerequisite at [PIC — Host prerequisites — Binder model](../pi-integration-contract/host-prerequisites.md#pi-sdk-pin) restate the absence as a pinned presupposition. The bump checklist's [strict-capability probe step](../pi-integration-contract/version-bump-triggers.md) reads the indicator by name but does not document the universal-W invariant either. The whole-tilde-range universality is therefore a strong claim with no spec anchor.

3. **Byte-offset obligation locality for `invalid-encoding`.** `docs/spec_topics/diagnostics/code-registry-load.md`'s `loom/load/invalid-encoding` row mandates the message `invalid UTF-8 encoding at byte offset <offset>` and cross-references [Lexical — Encoding](../lexical.md), which does pin the loom-side obligation ("reporting the file path and the byte offset of the first invalid byte"). The obligation therefore *exists* on the lexical page, but the diagnostics page — the page that names the placeholder `<offset>` — never restates it, and the lexical-page obligation does not enumerate which UTF-8 decoder semantics are required (e.g. zero-based vs one-based; offset of the first invalid *byte* vs the *codepoint start*; behaviour for non-UTF-8 BOMs where the "first invalid byte" is the BOM's leading byte vs the byte after). This is a much smaller gap than (1) or (2): the obligation is anchored, just not at the consumption site, and the byte-offset semantics are underspecified.

## Spec Documents

- `docs/spec_topics/diagnostics.md` — opening paragraph (edited)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/binder-model-strict-capability-unknown` row, `loom/load/invalid-encoding` row (edited)
- `docs/spec_topics/binder/binder-model-and-context.md` — `#strict-capability-requirement` paragraph (edited)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — `#pi-sdk-pin` and *Binder model* item (option-dependent; edited under Option B if the universal-W invariant is promoted to a pinned presupposition)
- `docs/spec_topics/lexical.md` — Encoding bullet (read-only for Options A/B; edited under Option C)
- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — step 7 (read-only; the bump-time recheck site)

## Plan Impact

**Phases:** N/A

**Leaves:** N/A

(The repository has no `plan.md` or `plan_topics/` directory.)

## Consequence

**Severity:** advisory

Each of the three sub-claims is currently true at the pinned Pi-SDK range, so the spec ships shippable behaviour and implementers will not diverge. The risk is forward: (1) and (2) are unbacked assertions about Pi internals that become silently wrong on the next Pi minor (or, for (1), are already slightly imprecise), and the bump-procedure checklist names neither as a re-verification gate, so a future bump can land without re-validating them. (3) is a placement nit and an under-specification of decoder semantics, with no observer impact at the pin.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles three independent obligations on three different pages. Per the bimodal-obligation rule each is emitted as a separate option so the fix loop can land them sequentially against a stable baseline rather than as one wide-surface edit. The recommended resolution order is A → B → C: A is the smallest and most localised (one sentence on the diagnostics intro), B is the medium-surface load-bearing pin (one cross-reference plus one bump-checklist item), and C is the smallest of the three but lands cleanest once the other two have settled the surrounding wording.

### Option A — Soften the `LoadExtensionsResult.errors` rationale to match Pi's actual `loadExtension` window

**Approach.** Reword the `docs/spec_topics/diagnostics.md` opening so the rationale for not consuming `LoadExtensionsResult.errors` does not rest on the inaccurate "only during `import()`" windowing claim. Either (i) drop the windowing rationale and state plainly that loom emits its own `loom/load/extension-bootstrap-failed` for the same class of failures Pi would push into `LoadExtensionsResult.errors`, with a cross-reference to that row; or (ii) keep the windowing framing but correct it to "populated for any throw inside Pi's `loadExtension` wrapper — both the dynamic-`import` call and the awaited factory invocation" and cite `dist/core/extensions/loader.js#loadExtension` at the loom 1.0 Pi-SDK pin.

**Spec edits.** Replace the second sentence of `diagnostics.md`'s opening paragraph. No edits to the registry pages or PIC.

**Pros.** Smallest possible edit; removes the only inaccurate Pi-SDK behavioural claim in the diagnostics intro; the cross-reference to `loom/load/extension-bootstrap-failed` already exists in the cluster and makes the "not used" rationale self-supporting without needing to characterise Pi's loader internals.

**Cons.** Variant (ii) couples the spec to an internal Pi function name (`loadExtension`) and a path inside `dist/`, which the diagnostics cluster otherwise avoids.

**Risks.** None at the pin. A future Pi refactor that changes `loadExtension`'s try/catch shape would invalidate variant (ii)'s citation but not variant (i)'s prose.

### Option B — Pin universal `strictCapable` absence as a PIC presupposition and add a bump-checklist re-verification step

**Approach.** Promote the "universal-W branch under the current pin" invariant to a one-paragraph presupposition under [PIC — Host prerequisites — Binder model](../pi-integration-contract/host-prerequisites.md#pi-sdk-pin), citing the absence of `strictCapable` from the `Model<Api>` surface in `@earendil-works/pi-ai` at the pinned range. Then have the two consumer sites — `code-registry-load.md`'s `binder-model-strict-capability-unknown` row and `binder-model-and-context.md`'s `#strict-capability-requirement` paragraph — replace the bare "Universal" / "universal-W branch" claim with an anchor-cite back to that presupposition. Extend the [bump-procedure step 7](../pi-integration-contract/version-bump-triggers.md) so that a Pi minor that introduces a `strictCapable` member is recorded as a spec-edit trigger (the presupposition would have to be demoted to "may now fire" and the diagnostics rows updated).

**Spec edits.** New `<a id="binder-strict-capability-universal-w-presupposition"></a>` paragraph in `host-prerequisites.md`'s *Binder model* item; one-sentence cross-reference rewrite in `code-registry-load.md`'s `binder-model-strict-capability-unknown` row; equivalent one-sentence rewrite of the "universal-W branch" parenthetical in `binder-model-and-context.md`'s `#strict-capability-requirement` paragraph; one-bullet addition to `version-bump-triggers.md` step 7.

**Pros.** Brings the universal-W claim into the same governance regime as the other Pi-SDK pinned shapes; mechanical re-verification on every bump rather than relying on incidental review; co-resolves the same sub-claim raised by the related "Frontmatter/query hidden assumptions" finding.

**Cons.** Adds a fourth presupposition to `host-prerequisites.md`'s binder-model item, which is already dense; the bump-checklist gains one more sub-step.

**Risks.** None at the pin. The presupposition is verifiable by `grep strictCapable` across the bundled packages, which the bump-checklist step can prescribe directly.

### Option C — Restate the byte-offset obligation at the diagnostics row and pin the decoder semantics

**Approach.** In `code-registry-load.md`'s `loom/load/invalid-encoding` row, append a one-clause restatement of the lexical-page obligation: that `<offset>` is the zero-based byte offset of the first invalid byte in the original (pre-normalisation) file content, populated by the loom-side UTF-8 decode step per [Lexical — Encoding](../lexical.md). Mirror the zero-based and "first invalid byte" semantics back into `lexical.md`'s Encoding bullet so the two sites agree byte-exactly. State the BOM edge case explicitly: when a non-UTF-8 BOM triggers the diagnostic, `<offset>` is `0` (the BOM's leading byte).

**Spec edits.** One-clause append to the `invalid-encoding` row's `Message` cell or its trigger description in `code-registry-load.md`; one-clause tightening of the Encoding bullet in `lexical.md` to pin zero-based and the BOM edge case.

**Pros.** Smallest of the three options; resolves both the placement nit and the under-specified decoder semantics without inventing a new seam or presupposition. No PIC edits.

**Cons.** Mild duplication between `lexical.md` and `code-registry-load.md`; the existing cross-reference is technically sufficient, so this option is closer to clarity polish than to fixing a real hidden assumption.

**Risks.** None.

### Recommendation

Apply A, B, and C in that order as three separately-loopable fixes. A is one sentence in one file and unblocks nothing else. B is the only one of the three that introduces a new governance anchor and a bump-checklist obligation — the next pass's lenses will have the largest critique surface here, so landing it on a baseline already free of A's inaccurate-windowing distraction is what makes the loop converge. C lands last because its edits touch wording near A's edit site and trivially conflict if interleaved.

Implementer-relevant edge case for B: the universal-W presupposition must be phrased as "universally absent at the current pin" (a present-tense behavioural assertion about the `~0.75.5` range), not as "always absent across the tilde range" (which is a forward claim the bump checklist alone cannot enforce — a same-range patch release could in principle ship the indicator).

Implementer-relevant edge case for C: the lexical-page rule says "the byte offset of the first invalid *byte*"; the BOM case where the spec wants to fail on a non-UTF-8 BOM (e.g. UTF-16 LE `FF FE`) needs the BOM's *leading* byte at offset `0`, not the first byte that fails the UTF-8 state machine (which under some decoder implementations would be byte 1 of the BOM).

## Relationships

- T090 "Frontmatter / query hidden assumptions: unbacked AJV NaN/±Infinity rejection and unbacked universal `strictCapable` absence" - co-resolve (the universal-absence sub-claim is the same assertion as this finding's sub-claim 2; Option B above resolves both at the PIC presupposition site)
- T029 "Diagnostics shard: residual cruft and three unfalsifiable normative obligations" - same-cluster (both findings edit `code-registry-load.md` rows; the edits are independent but a fixer landing both in the same pass should sequence this finding's Option B and C edits after the cruft cleanup so the row's surrounding text is settled)

---

# T031 - Echo destination for subagent-mode slash invocations is not pinned

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`defaulting-system-note-echo.md` §"Echo policy" says the runtime appends the success-echo system note to "the user's session", but for a subagent-mode slash invocation the caller's Pi session and the loom's spawned `AgentSession` are distinct surfaces — a distinction the binder hub (`binder.md`) draws explicitly while the echo-policy sentence inherits none of it. The same gap applies to the failure-arm echoes (`needs_info`, `ambiguous`, cancelled-binder, transport- and malformed-envelope failures) routed through `determinism-cancellation-failure.md` §"Failure modes", which also say "the user's session" without naming a mode. An implementer must reconstruct which surface receives the echo rather than reading it off the page, leaving the destination — observable to conformance tests and renderer integrations — implicit.

## Solution approach

In `defaulting-system-note-echo.md` §"Echo policy", clarify that the echo destination is the caller's Pi session for both prompt-mode and subagent-mode looms, and never the spawned subagent conversation. Carry the same destination disambiguation to `determinism-cancellation-failure.md` §"Failure modes", where the failure-arm echoes also say "the user's session" without naming a mode.

## Solution constraints

- None.

## Relationships

- T086 "`bind_echo` no-params diagnostic: trigger condition unpinned and overlaps the single-string-bypass code" - same-cluster (both touch the Echo policy section; resolve independently)
# T032 - Single-string-bypass disposition of `bind_model:` and `bind_context:` is unspecified

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The single-string-bypass bullet (#2 under `## Binder bypass` in `binder-bypass-and-envelope.md`) does not state the disposition of the three `bind_*` frontmatter fields, whereas the parallel no-params bullet (#1) pins all three. An implementer has no rule for whether `bind_context:` or `bind_model:` declared on a single-string-bypass loom is silently ignored, warned, or load-failed — the bypass skips the binder call that would otherwise give those values meaning. `frontmatter-fields-a.md` makes `loom/load/binder-model-unresolved` conditional on the loom "not being bypass-eligible," implying `bind_model:` is permitted-but-unenforced on a bypass-eligible loom, but the disposition of an explicit value is never pinned. Two implementations will diverge on the load/no-load decision and on observable diagnostics.

## Solution approach

Rewrite the single-string-bypass bullet in `binder-bypass-and-envelope.md`'s `## Binder bypass` to state the disposition of all three `bind_*` fields, matching the no-params bullet where the semantics already coincide. For `bind_echo`, forward-link the existing `loom/parse/bind-echo-on-bypass` rule on `defaulting-system-note-echo.md` rather than restating it. Pin `bind_model:` and recognised `bind_context:` values (`none`, `session`) as silently ignored under the bypass, consistent with the `frontmatter-fields-a.md` bypass-eligibility carve-out.

## Solution constraints

- The `bind_context:` value-shape validation (`loom/load/unknown-bind-context-value` for values outside `none`/`session`) runs before bypass-eligibility is decided and MUST remain in force; the silently-ignored disposition applies only to recognised values.
- Out of scope: minting a new bypass-specific "no-effect" diagnostic for `bind_context: session`; the mode-scoped `loom/parse/bind-context-session-on-subagent` warning is not repurposed for the bypass case.

## Relationships

- T086 "`bind_echo` no-params diagnostic: trigger condition unpinned and overlaps the single-string-bypass code" - decision-overlap (this finding pulls the `bind_echo` rule out to the echo-policy page; that finding refines the `bind_echo` codes' boundaries)
- T102 "`bind_context` project-wide-inheritance parenthetical references a settings carrier that does not exist" - decision-overlap (constrains what "silently ignored (may be inherited from project-wide settings)" can claim for `bind_context:` on single-string bypass)
# T033 - Binder clarity nits: placeholder mismatches, undefined block delimiter, ambiguous dash-clause, missing "or" in no-params bullet

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 5
**Shape:** single
**State:** reduced

## Problem

Five wording defects sit across the two binder pages:

1. The failure-mode-templates intro on `determinism-cancellation-failure.md` (`#failure-mode-templates-normative`) flags `<message>` and `<candidates>` as the model-supplied non-deterministic placeholders and references a trailing `candidates:` clause, but the table beneath it uses `<model's message>` in the `needs_info`/`ambiguous` rows, uses `<message>` only for the deterministic transport-failure provider text, renders no `<candidates>` token, and renders no `candidates:` clause (loom 1.0 does not render `candidates`, per BNDR-2).
2. BNDR-2 and BNDR-3 on `binder-bypass-and-envelope.md` cite `<message>` against that same table, which actually uses `<model's message>`.
3. System-prompt structure item 6 in `binder-bypass-and-envelope.md` mandates a "delimited block" opening with `Recent session context` but defines no closing delimiter; because BNDR-7 separates turn blocks with a single blank line, two implementations satisfying item 6 and BNDR-7 can disagree on the block boundary — a divergence observable in the binder input bytes BNDR-7 exists to pin.
4. The determinism-opening dash-clause ("…not among its variable inputs — the loom-dependent seed below and the rendered system prompt.") parses ambiguously between enumerating the variable inputs and narrowing the fixed footprint.
5. The no-params bypass bullet joins two trigger forms ("`params:` is absent, `params: {}`") with a bare comma and no coordinating conjunction.

## Solution approach

In `determinism-cancellation-failure.md`, rewrite the failure-mode-templates intro placeholder caveat to name the tokens the table actually carries (`<model's message>` as the model-supplied non-deterministic token; the transport-failure-row `<message>` and `<provider>` as deterministic provider/classifier text) and drop the `candidates:`-clause reference. Replace `<message>` with `<model's message>` in BNDR-2 and BNDR-3 on `binder-bypass-and-envelope.md` to match the table they cite. Clarify item 6's `Recent session context` block in `binder-bypass-and-envelope.md` to define what terminates the block, keeping the illustrative fenced rendering and the BNDR-7 reference renderings on `binder-model-and-context.md` consistent with whatever boundary rule is chosen. Rewrite the determinism-opening dash-clause to separate the fixed-footprint statement from the variable-inputs enumeration, and insert `or` between the two no-params trigger forms in the bypass bullet.

## Solution constraints

- None.

## Relationships

- T104 "BNDR-7's "next blank line of the surrounding system prompt" presupposes framing the eight system-prompt blocks neither pin" - co-resolve (same item-6 / BNDR-7 boundary surface; both findings can be closed by the same explicit-delimiter edit)
- T106 "Compact-transcript assistant interleaving and `<args-json>` key order not pinned for byte-exact reproduction" - same-cluster (BNDR-7 byte-exact reproducibility; resolved independently)
# T034 - Compact-transcript: BNDR-7 reference set omits oracles for several normative Rule-4 cases

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

BNDR-7's reference renderings (BNDR-7a–BNDR-7d) on `binder-model-and-context.md` (`#bndr-7`) pin the Compact-transcript bytes as MUST-reproduce-exactly, but they cover only a subset of the variants Rule 4 of *Compact-transcript format (normative)* (`#compact-transcript-format-normative`) distinguishes. Four Rule-4 branches that introduce new byte-level decisions have no oracle: an assistant message with `ToolCall` blocks but no `TextContent` (the empty `[assistant]: ` prefix line and its trailing U+0020), a `toolResult` with mixed text/non-text content blocks (concatenation order and `JSON.stringify` form), a `custom` message with a `(TextContent | ImageContent)[]` array body (the silent `ImageContent` skip), and a void truncation result (zero included turns). Because Rule 4's branches are the only thing that makes these scenarios testable input-reproducibility claims, the gap leaves conforming implementations unable to mechanically demonstrate the MUST-reproduce obligation for the missing variants.

## Solution approach

Add reference renderings to the BNDR-7 block on `binder-model-and-context.md` for each uncovered Rule-4 branch: assistant-with-`ToolCall`-no-`TextContent`, `toolResult` with mixed text/non-text content blocks, `custom` with a `(TextContent | ImageContent)[]` body, and the void truncation result. Take the next free sub-letters in block order per the existing `#bndr-7` anchor-scheme note without renumbering BNDR-7a–d. The void-truncation rendering is the absence of the entire Session-context block per `binder-bypass-and-envelope.md` item 6 rather than a transcript fragment; amend the BNDR-7 preamble so this empty oracle is not read as a vacuous cell.

## Solution constraints

- Out of scope: the assistant-interleaving and `<args-json>` key-order pins owned by T106.

## Relationships

- T106 "Compact-transcript assistant interleaving and `<args-json>` key order not pinned for byte-exact reproduction" - same-cluster (the interleaving/key-order pins land in the same Rule 4 + BNDR-7 surface; the fixes should be authored together so BNDR-7e's `[tool-call …]` line uses a multi-key `arguments` object to exercise both pins at once)
- T104 "BNDR-7's "next blank line of the surrounding system prompt" presupposes framing the eight system-prompt blocks neither pin" - decision-overlap (BNDR-7h's "absent block" oracle relies on the surrounding-prompt framing; resolving the blank-line/block-order obligation first gives BNDR-7h a stable boundary to describe)
- T103 "Turn-grouping undefined when `SessionContext.messages` begins with non-`user` messages" - same-cluster (a separate Rule-4 coverage gap on the turn-boundary side; resolving it may add yet another BNDR-7 sub-letter, but the two findings address disjoint omissions and resolve independently)
# T035 - `pi.getFlag` is touched pre-bind but is absent from both the safe-before-bind list and the `notInitialized`-throwing list

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`registration-steps.md` step 1 directs the factory to read `pi.getFlag('loom')` pre-bind — in the factory-time discovery walk and inside the `resources_discover` re-walk subscribed before any `session_start` — and `extension-bootstrap-and-per-loom.md` makes the extension fail fatally on `pi.registerFlag` failure precisely because step 1's discovery walk consumes the flag value via `pi.getFlag('loom')`. Step 2 then enumerates the pre-bind runtime in two lists: a safe-before-bind list (`registerCommand` / `registerTool` / `registerFlag` / `registerMessageRenderer` plus `refreshTools`) and a `notInitialized`-throwing list (`getCommands`, `getActiveTools`, the session-state action methods). `pi.getFlag` appears in neither. An implementer auditing the pre-bind runtime against step 2 cannot confirm the load-bearing step-1 read is contractually pre-bind-safe rather than coincidentally non-throwing at the current Pi-SDK pin, and `version-bump-step2.md` item (q)'s pre-bind re-audit has no `getFlag` entry to re-check on each Pi minor.

## Solution approach

In `registration-steps.md` step 2, add `pi.getFlag` to the safe-before-bind enumeration as a read sink and state the pre-bind callability contractually rather than descriptively — that `pi.getFlag` MUST be callable on the pre-bind runtime returned by `createExtensionRuntime()`, mirroring the register-sink phrasing. Add a bullet to `version-bump-step2.md` item (q) (anchor `#bump-checklist-pre-bind-and-renderer-resolution`) re-auditing that `pi.getFlag` still resolves on the pre-bind runtime on each Pi minor.

## Solution constraints

- Out of scope: `inventory-audit-intro.md`'s `#non-capability-pi-members` paragraph (owned by T036) — `pi.getFlag`'s surface existence is already pinned there; this finding adds only the behavioural pre-bind-safety claim, not a new inventory entry.

## Relationships

- T109 "`session_start` collision pass has no failure contract when `pi.getCommands()` throws" - same-cluster (the same step-2/step-3 boundary; both findings expose holes in the pre-bind / post-bind enumeration but resolve through independent edits)
- T036 "`registerMessageRenderer` is unordered in the registration sequence; `registerFlag` options parameter is unpinned" - same-cluster (also concerns step-1/2 completeness of the registration-sink surface; resolves with its own edit to the numbered list)
- T041 "Shard-10 hidden assumptions and editorial cruft on the host-prerequisites / host-interfaces-core / host-interfaces-services / registration-steps page set" - same-cluster (umbrella finding noting unpinned behavioural presuppositions in registration-steps; this finding is one specific instance, but resolving it does not discharge the umbrella)
# T036 - `registerMessageRenderer` is unordered in the registration sequence; `registerFlag` options parameter is unpinned

**Original heading:** `registerMessageRenderer` not placed in the numbered registration sequence; `registerFlag` options shape unpinned
**Original section:** docs/spec_topics/pi-integration-contract/ (host-prerequisites, host-interfaces-core, host-interfaces-services, extension-bootstrap-and-per-loom, registration-steps)
**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Two independent gaps appear in the same neighbourhood of the PIC bootstrap pages.

**(1) `registerMessageRenderer` has no ordinal position relative to step 1.** `registration-steps.md` numbers steps 1–5 as (1) `pi.registerFlag` + `resources_discover` subscription, (2) parse looms / build pending list, (3) `session_start` collision + `pi.registerCommand`, (4) `session_shutdown` subscription, (5) chokidar watcher + `LoomRegistry`. `pi.registerMessageRenderer` is named only inside step 2's safe-before-bind enumeration and inside `extension-bootstrap-and-per-loom.md`'s **Renderer registration** block, which requires it "synchronously inside the factory body, before the factory returns" without saying *when* relative to the numbered steps. Yet `extension-bootstrap-and-per-loom.md`'s **Extension-bootstrap SDK failures** list treats it as one of "the registration calls in steps 1–5," and its `pi.registerFlag` failure rule states that on a step-1 throw "the factory skips every subsequent `pi.register*` and `pi.on` call (steps 2–5 do not execute)." Whether `registerMessageRenderer` is among those skipped calls is load-bearing: if it runs **before** step 1, a step-1 fatal failure still emits its `loom/load/extension-bootstrap-failed` diagnostic via the persistent-transcript arm of the fallback chain (`sendSystemNote`); if it runs **after** step 1, the renderer is never registered, the persistent-transcript surface is unavailable, and the diagnostic must degrade to `ctx.ui.notify`. Two reasonable implementers will choose opposite orderings and produce observably different operator UX on the most-likely bootstrap failure path.

**(2) `pi.registerFlag`'s options parameter has no pinned declaration.** Step 1 calls `pi.registerFlag('loom', { type: 'string', description: … })` and `inventory-audit-intro.md`'s *Non-capability `pi.<member>` surfaces* paragraph pins that `pi.registerFlag` "is declared on the `ExtensionAPI` interface at `dist/core/extensions/types.d.ts`." Neither pin names the options-parameter interface (e.g. `RegisterFlagOptions`), enumerates its required/optional fields, or commits the loom-load-bearing subset (`type`, `description`) to a build-time surface check. Compare to the sibling treatment of `pi.getFlag`, which is pinned verbatim (`getFlag(name): boolean | string | undefined`). A Pi minor that renames the interface, narrows `type` to a closed string union excluding `'string'`, or makes `description` mandatory/forbidden will not be caught by the inventory-closure audit or by `SDK_SURFACE_INVENTORY` literal-read assertions — the failure surfaces as a runtime throw at step 1 against an unpinned host shape.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/registration-steps.md` — step 1 (`pi.registerFlag` call site, `pi.getFlag` signature pin), step 2 (safe-before-bind enumeration, `SlashCommandInfo` build-time inventory MUST) (edited)
- `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md` — **Extension-bootstrap SDK failures** ("registration calls in steps 1–5", `pi.registerFlag` failure rule); **Renderer registration** → *Lifecycle* → *Registration timing* (edited)
- `docs/spec_topics/pi-integration-contract/inventory-audit-intro.md` — **Non-capability `pi.<member>` surfaces** paragraph; **Inventory-closure audit** paragraph (edited)
- `docs/spec_topics/pi-integration-contract/capability-probe.md` — Step 0 factory-time host-binding call enumeration (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — item (q) editorial-review checklist for renderer-resolution behaviour (option-dependent: bumped if option B adds a checklist item for `RegisterFlagOptions`)
- `docs/spec_topics/discovery/discovery-sources.md` — `loom-flag-namespace` anchor (`pi.registerFlag('loom', …)` reference) (read-only)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/extension-bootstrap-failed` row's `<capability>` enumeration (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project's plan currently has no leaves — `docs/plan.md` lists empty Horizontal / MVP / Vertical sections. When PIC leaves are authored, they will inherit these edits via the **Spec** field.)

## Consequence

**Severity:** correctness

Implementers will diverge on (1) whether `pi.registerMessageRenderer` runs before or after `pi.registerFlag`, producing different observable fallback-chain arms for the most-likely bootstrap failure; and on (2) the exact options-parameter shape passed to `pi.registerFlag`, since neither a TypeScript interface name nor a field-set pin exists, leaving the build-time surface-set-closure guarantee with a hole at this call site.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles two independent obligations on distinct surfaces. Resolve them sequentially — Option A first (the smaller, ordering-only edit that establishes where in the numbered sequence the renderer call lands), then Option B (which extends the SDK surface inventory and the `registerFlag` call-site prose). Stacking Option B on a stable Option-A baseline keeps each fix's diff small enough that downstream lens passes do not see a compound surface.

### Option A — Add `registerMessageRenderer` as numbered step "1a" (or renumber)

- **Approach.** Insert a numbered step in `registration-steps.md` for `pi.registerMessageRenderer("loom-system-note", renderer)`, ordered **before** step 1 so the persistent-transcript surface is available when step 1's fatal failure path emits its `loom/load/extension-bootstrap-failed` diagnostic. Use either "step 1a" (preserves existing step numbers) or renumber 1–5 → 2–6. Cross-reference the **Renderer registration** block in `extension-bootstrap-and-per-loom.md` as the owner of the signature, lifecycle, and ownership rules.
- **Spec edits.**
  - `registration-steps.md`: add the new numbered step with body equal to a one-paragraph summary referring to `extension-bootstrap-and-per-loom.md` for normative detail; explicitly state "registered **before** step 1's `pi.registerFlag` call, so that a step-1 fatal failure still has the persistent-transcript arm of the **System notes** fallback chain available."
  - `extension-bootstrap-and-per-loom.md`: in the **Extension-bootstrap SDK failures** list, retitle the `pi.registerMessageRenderer` failure bullet from "(factory-time, step 0 having succeeded so the capability is present but the call itself rejects)" to "(factory-time, step 1a — registered before step 1)"; in the `pi.registerFlag` bullet, change "steps 2–5 do not execute" to "steps 2–5 do not execute (step 1a's renderer registration, having already run, leaves the persistent-transcript surface available for this diagnostic)"; same clause for the `pi.on` bullet.
  - `extension-bootstrap-and-per-loom.md` → **Renderer registration** → *Registration timing*: change "synchronously inside the factory body, before the factory returns" to "synchronously inside the factory body, **before step 1's `pi.registerFlag` call** (per [Registration steps — step 1a](./registration-steps.md#…))."
- **Pros.** Removes ambiguity about which fallback arm a step-1 failure uses. Makes the bootstrap diagnostic delivery deterministic. Small surface area.
- **Cons.** Renumbering existing steps churns every back-reference; "1a" preserves numbers but introduces a non-sequential identifier. Either choice ripples through `version-bump-step2.md` and `diagnostics/code-registry-load.md` cross-references.
- **Risks.** Missing a back-reference site (PIC pages cross-reference step numbers heavily). Mitigated by `grep -rn 'step 1\|step 2\|step 3\|step 4\|step 5' docs/spec_topics/pi-integration-contract/`.

### Option B — Pin `RegisterFlagOptions` declaration and extend the SDK surface inventory

- **Approach.** In `inventory-audit-intro.md`'s **Non-capability `pi.<member>` surfaces** paragraph, name the options-parameter interface, point it at its declaration file path, and pin the loom-load-bearing field subset (`type`, `description`). Add the interface to the build-time SDK surface inventory alongside `SlashCommandInfo` and `SlashCommandSource` (per step 2's existing MUST). Echo the verbatim signature at the step-1 call site in `registration-steps.md`, matching the treatment of `pi.getFlag`.
- **Spec edits.**
  - `inventory-audit-intro.md`: append to the **Non-capability `pi.<member>` surfaces** paragraph: "`pi.registerFlag`'s options-parameter interface is `RegisterFlagOptions` (verify the exact name against `dist/core/extensions/types.d.ts` on each Pi minor bump), declared at the same Pi-SDK pin path. The loom-load-bearing field subset is `{ type: 'string' \| …; description?: string }`; loom 1.0 passes `type` and `description`. The build-time SDK surface inventory MUST list `RegisterFlagOptions` (and the closed-union shape of its `type` field) explicitly so a Pi minor that renames the interface or narrows `type` to exclude `'string'` fails the build."
  - `registration-steps.md` step 1: insert after the existing `pi.getFlag` declaration sentence: "`pi.registerFlag` is correspondingly declared as `registerFlag(name: string, options: RegisterFlagOptions): void` at the same path; the loom-load-bearing subset of `RegisterFlagOptions` is pinned at [Non-capability `pi.<member>` surfaces](./inventory-audit-intro.md#non-capability-pi-members)."
  - `version-bump-step2.md`: add a new editorial-review checklist item (e.g. `(aa)`) for `RegisterFlagOptions` shape re-validation, mirroring item (q)'s structure.
- **Pros.** Closes the surface-set-closure hole at this call site. Brings `pi.registerFlag` to parity with `pi.getFlag`'s pinning. Makes Pi-minor renames a build-time failure instead of a runtime throw.
- **Cons.** Requires confirming the actual interface name in the Pi SDK source; if Pi declares the options inline rather than as a named interface, the pin has to name a structural type instead of a nominal one.
- **Risks.** The exact name `RegisterFlagOptions` is presumed; the spec language must hedge ("verify on next bump") until confirmed against `dist/core/extensions/types.d.ts`.

### Recommendation

Resolve **Option A first**, then **Option B** on top of A's baseline. Option A is purely structural (a numbered-step insertion plus retargeted cross-references) and lands on a small, well-bounded surface; Option B extends the surface inventory and touches a separate set of pages (`inventory-audit-intro.md`, `version-bump-step2.md`), and benefits from landing after the step-numbering is stable so its cross-references don't have to be rewritten. Edge cases the implementer must watch:

- Option A: every existing reference to "step N" in PIC pages and in `diagnostics/code-registry-load.md` must be checked when renumbering; "1a" avoids this but make sure the diagnostic table's `<capability>` enumeration still reads correctly.
- Option B: if `dist/core/extensions/types.d.ts` declares the options parameter as an anonymous inline type rather than a named interface, the pin must name the structural shape and the surface inventory's literal-read assertion must target the field set rather than an interface symbol.

## Relationships

- T035 "`pi.getFlag` is touched pre-bind but is absent from both the safe-before-bind list and the `notInitialized`-throwing list" - same-cluster (sibling gap in step 1's pre-bind enumeration; resolved independently but on the same page)
- T109 "`session_start` collision pass has no failure contract when `pi.getCommands()` throws" - same-cluster (sibling step-3 read-failure gap)

---

# T037 - Loom-side `/reload` rules buried inside Pi-host presuppositions

**Kind:** placement (shard-10), scope (shard-10)
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`host-prerequisites.md`'s *Host prerequisites for the degraded-state branch* paragraph (c) (anchor `#degraded-state-host-prerequisites`) is scoped to Pi SDK behaviours no `dist/...d.ts` surface pins as a typed contract — a presupposition register the editorial-review bump checklist consumes. Embedded in it are two loom-side normative corollaries that belong elsewhere: corollary (c-i) is a carve-out on the loom-side drain-state-gated dispatch (the `LoomRegistry.readDrainState()` three-arm short-circuit), and corollary (c-ii) is a loom-side registration MUST NOT reserving the derived slash name `reload`. The canonical owners — `registration-steps.md` step 3's collision check and `drain-state-contract.md`'s *Methods* paragraph — never restate either rule, so an implementer working those pages has no in-page signal of them, and two reasonable implementers can each diverge into a runtime that disables the operator's `/reload` recovery path.

## Solution approach

Split paragraph (c) along the prose-vs-normative seam. Move the (c-ii) reserved-name drop to `registration-steps.md` step 3's existing cross-format collision-check site (`#slash-handler-registration`). Move the (c-i) short-circuit carve-out into `drain-state-contract.md`'s *Methods* paragraph alongside the `LoomRegistry.readDrainState()` arm enumeration, adding an anchor so `host-prerequisites.md` (c) can cite it. Trim host-prerequisites (c) to the Pi behavioural premise and add forward-links from it to both moved clauses so the editorial-review bump checklist (which keys on (c)) still reaches both.

## Solution constraints

- The reserved-name drop MUST execute in the same `session_start` pass as the cross-format collision check, sharing its `loom/load/cross-format-collision` diagnostic and de-registration symmetry, not as a separate parse-time rejection.
- The reserved-name drop MUST cover the DISC-4 basename-hyphen-normalised form (`re-load.loom` resolving to `reload`), not only the literal `reload` name.

## Relationships

- T067 "Pi behavioural presuppositions lack authoritative behavioural pointers" - same-cluster (touches the surviving Pi-behavioural premise in host-prerequisites (c) that this finding leaves in place; the pointer-addition fix composes cleanly with the rule-extraction here)
# T038 - `loomAbort` construction, forwarding, and teardown rules duplicated in `host-interfaces-core.md`'s "Cancellation source" paragraph

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Cancellation source" paragraph in `host-interfaces-core.md` (anchor `#cancellation-source`) restates loom-runtime cancellation mechanism rules — `loomAbort` per-invocation `AbortController` construction, the three forwarding paths, the "MUST NOT use `ctx.signal` as the authoritative signal" reasoning, per-invocation `finally`-block listener teardown, and abort-reason propagation — that `cancellation.md` already owns normatively in its **Signal source**, **Forwarding into `loomAbort`**, and **Abort-reason propagation** paragraphs. The parallel normative MUSTs can drift silently when either page is edited, and the duplication only multiplies maintenance surface. The single piece unique to the PIC view is the Pi-side SDK presupposition the paragraph consumes: that Pi delivers an `AbortSignal` at `ctx.signal` and `tool.execute`'s `signal` parameter (with `ctx.signal` `undefined` in idle contexts) and that `CreateAgentSessionOptions` carries no `signal` field.

## Solution approach

In `host-interfaces-core.md`, trim the `#cancellation-source` paragraph to retain only the Pi-side SDK presupposition it uniquely owns — the two `dist/core/extensions/types.d.ts` entry-point declarations at the [loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin) and the `CreateAgentSessionOptions` no-`signal` observation — deleting the runtime-mechanism rules and adding a forward-link to `cancellation.md`. Repoint the back-reference inside the adjacent "Pi-side slash-handler promise lifecycle (consumption posture)" paragraph's presupposition (v) from "the forwarding paragraph under **Cancellation source** above" to `cancellation.md`'s **Forwarding into `loomAbort`** section.

## Solution constraints

- None.

## Relationships

None
# T039 - Three implementation-structure MUSTs (re-entrant adapter, collision-source set, Checkpoint call sites) carry no observable acceptance criteria

**Original heading:** Code-side `MUST NOT serialise` re-entrancy, collision-source-set "single named set," and Checkpoint "MUST NOT add before() calls" lack observable acceptance criteria
**Original section:** docs/spec_topics/pi-integration-contract/ (host-prerequisites, host-interfaces-core, host-interfaces-services, extension-bootstrap-and-per-loom, registration-steps)
**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Three normative clauses across the PIC seam pages constrain the *shape* of the implementation rather than its observable behaviour, and none of them is paired with an oracle a conformance test could fail:

1. **Adapter re-entrancy** (`extension-bootstrap-and-per-loom.md`, *Per-loom registration*, last paragraph): *"Adapter implementations MUST NOT serialise calls on shared closure state."* The text frames the requirement as a code-structure prohibition (don't take a lock on closure state) and gives no liveness witness — e.g. two parallel `execute` calls against the same `.loom` callable must both make progress within a bounded number of checkpoint turns. A conforming-by-mistake implementation that serialises through an `async` queue but completes promptly when the queue is short would satisfy any single-call test suite.
2. **Collision-source set "single named set"** (`host-interfaces-services.md`, *loom 1.0 seam — Pi-owned subagents collision source set*, PIC-20 callout): *"… MUST be defined as a single named set inside the runtime, consulted by the collision check via membership test rather than open-coded as three separate string comparisons or a hard-coded `switch`."* This prescribes the data structure (one `Set<string>`) and the access pattern (membership test, not comparison chain). It cannot be observed externally; an implementation using `if (s === "prompt" || s === "extension" || s === "skill")` produces identical collision diagnostics, so a future Pi minor that adds a fourth `SlashCommandSource` arm — the only motivating risk — would surface the regression at extension time, not in conformance.
3. **Checkpoint call-site closure** (`host-interfaces-services.md`, PIC-10 *`Checkpoint` seam*, second rule): *"Implementations MUST NOT add `before(...)` calls at any site not enumerated above."* This bans `before(...)` at unenumerated call sites in the implementation source, but the rule's observable companion — exactly one `before()` per enumerated checkpoint — is not stated as a counting requirement. The existing test-wiring narrative talks about *what a test can do with the seam* (fire `abort()` from inside `before(...)`), not about a check that asserts call multiplicity per checkpoint kind.

All three problems share the same root: the spec uses GOV-18 arm (a) to make seam *shapes* non-binding, but then uses MUST-level prose to constrain the *use* of those shapes in ways that no double or counting fake can witness. The Clock-ban sibling (PIC-12, last sentence) already shows the corpus's accepted pattern: a structural MUST plus an explicit *Non-normative implementation note* that the build-time grep-test is "an implementation choice, not an observable conformance point." The three clauses above need the equivalent demotion plus a behavioural Then-clause.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md` — *Per-loom registration*, adapter re-entrancy paragraph (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-10 *Checkpoint seam* rules block (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-20 *loom 1.0 seam — Pi-owned subagents collision source set* callout (edited)
- `docs/spec_topics/cancellation.md` — Granularity rule + Race semantics (read-only; defines the checkpoint enumeration the PIC-10 oracle must mirror)
- `docs/spec_topics/tool-calls.md` — Concurrency (read-only; defines parallel-tool-mode semantics the adapter re-entrancy oracle observes)
- `docs/spec_topics/governance/corpus-direction-and-scope.md` — GOV-18 arm (a) (read-only; the demotion these three clauses lean on)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan currently has no leaves authored; `plan.md` lists Horizontal, MVP, and Vertical sections all marked *No leaves yet*.)

## Consequence

**Severity:** correctness

Two reasonable implementers reading any of these three clauses can diverge: one writes a `Set<string>` / re-entrant adapter / single-call-site `before()`, the other writes a `switch` / queue-serialised adapter / scattered `before()`s, and both pass any conformance suite the spec authorises today. The first two divergences only bite at the next Pi minor bump (collision-source widening; tool-call parallelism regressions); the Checkpoint divergence directly threatens the two cancellation race rules PIC-10 exists to make testable, because an implementation that adds `before()` at extra sites can defeat the *no retroactive rewrite* and *no tail synthesis* guarantees the seam is meant to expose.

## Solution Space

**Shape:** multiple
**State:** shaped

The three clauses sit on two different files and demand three independently-designed behavioural oracles. They share a fix template (demote the structural MUST to a non-normative implementation note in the GOV-18-arm-(a) style already used at PIC-12's Clock ban; add one behavioural acceptance criterion) but each oracle is materially different, and bundling them risks a single sprawling edit that the next review pass critiques as a whole. Resolve sequentially.

### Option A — PIC-10 Checkpoint: counting double-double oracle

**Approach.** Demote *"Implementations MUST NOT add `before(...)` calls at any site not enumerated above"* to a Non-normative implementation note (mirroring PIC-12's Clock-ban grep-test note). Add an observable acceptance criterion on the rule list: a conforming runtime, when driven through a fixture loom that exercises each `CheckpointKind` exactly once, MUST invoke `Checkpoint.before(kind, site)` exactly once per enumerated checkpoint (five kinds: `loop-iter`, `query`, `tool-call`, `invoke`, `binder-call`) — no more, no less, regardless of how the runtime is internally decomposed. State this as a counting `FakeCheckpoint` double's bookkeeping requirement so test wiring can observe it.

**Spec edits.** In `host-interfaces-services.md` PIC-10's rules block: replace the second bullet's prohibition sentence with the counting acceptance criterion; add a *Non-normative implementation note* at the end of PIC-10 saying that one mechanical witness is a build-time grep-test of `checkpoint.before(` call sites against the enumeration, parallel to the Clock-ban grep-test.

**Pros.** Directly defends the two race rules PIC-10 exists to make testable; the counting fake is already implicit in the test-wiring paragraph ("Test fakes MUST treat the seam as call-once-per-checkpoint"); uses an accepted in-corpus pattern.

**Cons.** Per-kind counting requires the fixture loom to traverse each kind exactly once, which adds a small new conformance fixture obligation.

**Risks.** A future spec edit that adds a sixth `CheckpointKind` must update both the enumeration and the fixture; manageable because both edits live on the same page.

### Option B — Collision-source set: membership-test outcome oracle

**Approach.** Demote *"MUST be defined as a single named set inside the runtime, consulted by the collision check via membership test rather than open-coded as three separate string comparisons or a hard-coded `switch`"* to a Non-normative implementation note. Replace it with a behavioural acceptance criterion: given a stubbed `pi.getCommands()` that returns commands of each `SlashCommandSource` arm under the loom 1.0 Pi-SDK pin (`"prompt"`, `"extension"`, `"skill"`) plus one synthetic arm outside the set, the collision check MUST treat all three in-set arms as collision candidates and MUST silently ignore the out-of-set arm (no diagnostic, no throw). Keep the existing future-extension paragraph; rewrite it to say that widening the set under a future Pi minor turns the synthetic-arm test into a real in-set check, which is what makes the future extension's loom 1.0 forward-compatibility free of further edits.

**Spec edits.** In `host-interfaces-services.md` PIC-20 callout: rewrite the MUST sentence as the membership-outcome acceptance criterion; move the "single named set" prescription into a parenthetical *Non-normative implementation note* immediately after.

**Pros.** Makes the actual forward-compatibility goal observable; lets the future-extension widening land with a one-line set edit *and* a one-line test edit, both demonstrable.

**Cons.** The "synthetic out-of-set arm" is slightly artificial under the loom 1.0 pin (there is no fourth arm to inject), so the test relies on a contrived `SlashCommandSource`-typed value.

**Risks.** If Pi's `SlashCommandSource` becomes more strongly typed than its current string-union form, the synthetic arm injection may require a TypeScript-level cast that the test must justify.

### Option C — Adapter re-entrancy: concurrent-execute liveness oracle

**Approach.** Demote *"Adapter implementations MUST NOT serialise calls on shared closure state"* to a Non-normative implementation note. Replace it with a liveness acceptance criterion grounded in the parallel-tool-mode semantics from `tool-calls.md`: when the model emits two parallel tool calls targeting the same `.loom`-callable, the adapter's two concurrent `execute` invocations MUST each reach their first cancellation checkpoint within a bounded number of event-loop turns of being awaited (i.e. the second call's progress is not gated on the first call's completion). A conforming `FakeCheckpoint` observing both invocations MUST see both `before(...)` events before either underlying subagent completes.

**Spec edits.** In `extension-bootstrap-and-per-loom.md`'s *Per-loom registration* last paragraph: replace the prohibition sentence with the liveness acceptance criterion; add a brief cross-reference to PIC-10's `Checkpoint` seam as the observation point.

**Pros.** Couples the re-entrancy contract to the cancellation seam (PIC-10) the spec already mandates for tests; the oracle catches the actual regression of interest (an `async` queue that serialises calls would fail the bounded-turn requirement).

**Cons.** "Bounded number of event-loop turns" needs to be pinned to a concrete number; an arbitrary cap is fragile, but a per-checkpoint cap is implementation-dependent. The closest precedent in the corpus is the single-macrotask presupposition on the `loop-iter` kind, which suggests *"both adapter invocations reach their first `before()` within the same macrotask turn"* as the testable phrasing.

**Risks.** Single-macrotask phrasing makes the test sensitive to test-runner event-loop scheduling; a `FakeClock`-based fixture sidesteps this by driving the loop deterministically.

### Recommendation

Resolve in the order **A → B → C**:

- **A first** because it sits inside PIC-10 itself, whose seam Options B and C both lean on for their oracle wiring; landing PIC-10's counting fake first stabilises the substrate.
- **B second** because it touches a sibling callout on the same file as A and uses an oracle pattern independent of Option C's choices.
- **C last** because its liveness criterion phrases progress in terms of `before()` observation events, which presupposes PIC-10's counting fake from Option A is in place.

Each option lands as an independent edit and an independent loop pass. Implementer-relevant edge cases:

- Option A's counting requirement applies *per loom invocation*, not per runtime lifetime — re-entrant invocations have independent `Checkpoint` instances per the existing PIC-10 production-wiring rule.
- Option B's synthetic-arm injection must be done at the `pi.getCommands()` stub boundary, not inside the runtime's collision check, so the test does not need an internal seam.
- Option C's macrotask phrasing requires the fixture's two `execute` calls to be `await`ed in parallel via `Promise.all`, not sequentially, or the test passes trivially against a serialising implementation.

## Relationships

- T015 "Clock-ban prohibition and cross-boundary depth-counter rule lack observable acceptance criteria" - same-cluster (sibling testability finding on shard-04; established the demote-to-non-normative pattern this finding inherits)
- T022 "Macrotask-yield primitive at the loop-iteration checkpoint is unspecified" - decision-overlap (PIC-10 is the seam under both; Option A's counting oracle and this finding's primitive-name resolution should align on which yield mechanism the fixture observes)

---

# T040 - Host-prerequisites Pi-SDK-pin paragraph: skew-claim contradiction, review-gate verb drift, "one-character edit" misnomer, and unexpanded AJV

**Original heading:** Host-prerequisites clarity: "does not detect skew" vs "buys install-time skew detection"; MUST/SHOULD review-gate inconsistency; "one-character edit"; AJV unexpanded
**Original section:** docs/spec_topics/pi-integration-contract/ (host-prerequisites, host-interfaces-core, host-interfaces-services, extension-bootstrap-and-per-loom, registration-steps)
**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`docs/spec_topics/pi-integration-contract/host-prerequisites.md` carries four distinct editorial defects in the same neighbourhood of normative prose. They are independent — each has its own owning sentence(s) and its own fix — but they all land within the file's first sub-section and adjacent presupposition blocks, and a reader hitting any one of them is likely to hit the others. They are listed together here for triage; each is resolved separately.

**(1) Skew-claim contradiction.** Item 1 (Pi SDK pin) declares "no skew across the four is supported, and loom does not attempt to detect or accommodate skew." The *Deliberate deviation from Pi's bundled-package convention.* paragraph two paragraphs later then states that the tilde-pin "buys install-time skew detection on the package managers most production hosts use … causes the install to fail loudly when the host has resolved any of the four `@earendil-works/*` packages outside the pinned minor line." The two claims sit in the same item and are literally contradictory. The author's intent is clearly that the *runtime* does not detect skew but the *install* does; the bare "does not attempt to detect or accommodate skew" sentence overshoots that intent.

**(2) Review-gate verb drift across "on the same footing" presuppositions.** The *Host prerequisites for the degraded-state branch* preface declares that detection of a Pi minor violating any of presuppositions (a)–(d) "is by editorial review under [Pi version bump procedure]" and that "contributor-side editorial review against this enumerated list is the gate." Yet the verb attached to that gate diverges by presupposition: (c) uses **MUST** ("MUST be caught by editorial review under the bump procedure"); (d) uses **SHOULD** ("the contributor SHOULD confirm it by editorial review"); the **Host prerequisite for binder-model / `model:` load-time resolution** block uses **SHOULD** ("the contributor SHOULD re-confirm it"); the **Settings write-back key preservation** block uses **SHOULD** ("the contributor SHOULD re-confirm it"). Presuppositions (a) and (b) carry no explicit gate verb at all. A spec that calls these "on the same footing" and then attaches a different gate strength to each leaves a contributor genuinely unable to predict whether catching a (d)-class violation at bump time is mandatory or merely recommended.

**(3) "One-character edit" is wrong.** Item 1's framing for the single-source-of-truth pin reads: "each Pi minor bump is a one-character edit at this site rather than an N-site sweep." This is false for the pin's actual literal range `~0.75.5`: a minor bump to `~0.76.0` changes three characters; any bump crossing a digit boundary (e.g. `~0.99.0` → `~0.100.0`) extends the literal and changes more. The "one-site edit" property is what the surrounding lock-step machinery actually buys; the "one-character" claim mis-states it.

**(4) AJV unexpanded on first use.** The acronym AJV is used in normative PIC prose without ever being spelled out or glossed. First-use sites in the PIC shard include `host-interfaces-services.md` ("non-checkpoint synchronous work (AJV validation, schema lowering, default-merging)" and the `ValidationError` block mirroring "AJV's `ErrorObject` shape"), `extension-bootstrap-and-per-loom.md` ("the adapter MUST AJV-validate `params`"), `conversation-drive.md` ("the synthesised tool's `execute` AJV-validates"), and `runtime-event-channel.md`'s reachable-mask table. The glossary names AJV in several entries (`respond-repair`, `wire name`, `schema slug`) without ever defining it; no canonical page expands the acronym. Readers unfamiliar with the JSON-Schema validator ecosystem have nowhere to anchor the name.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — item 1 *Pi SDK pin* paragraph (skew-claim scoping) — (edited)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — item 1 *Pi SDK pin* paragraph ("one-character edit" framing) — (edited)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — degraded-state presuppositions (a)–(d), binder-model presupposition block, settings write-back presupposition block (review-gate verb alignment) — (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — first AJV use site (option-dependent, first-use-gloss target if that option wins) — (option-dependent)
- `docs/spec_topics/glossary.md` — candidate gloss site if AJV is added as a glossary entry — (option-dependent)
- `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md` — read-only, second AJV reference site
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — read-only, AJV reference site
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — read-only, AJV reference site

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None — `docs/plan.md` exists but currently declares no leaves under any phase ("_(No leaves yet — author per the template.)_" under horizontal / MVP / vertical sections).

## Consequence

**Severity:** advisory

The skew-claim contradiction can mislead a future contributor (or a documentation-driven reviewer) into either weakening the install-time gate or adding a runtime skew probe the spec elsewhere explicitly disclaims. The review-gate verb drift leaves the bump checklist's strength genuinely ambiguous for three of the four presuppositions. The "one-character edit" misnomer and the unglossed AJV are cosmetic; neither blocks implementation. The bundle as a whole is editorial — none of it makes the contract inconsistent in a way that would cause divergent implementations on the load path itself.

## Solution Space

**Shape:** multiple
**State:** shaped

The four obligations are independent and touch different anchors; resolving them sequentially keeps each diff small and lets each pass through the per-finding fix loop on a stable baseline. Order is smallest scope first.

### Option A — Gloss AJV at first use

**Approach.** Identify the corpus-wide first use of `AJV` (currently inside `docs/spec_topics/pi-integration-contract/host-interfaces-services.md`, but the closer single-paragraph candidate is wherever the schema-validator concept is first introduced in document-read order — check `schema-subset.md` and `pi-integration.md` as well). Add a parenthetical expansion at that site: "AJV (the JSON-Schema validator the reference implementation uses; the abstract contract is the `SchemaValidator` seam, see Implementation Notes — Runtime)" or similar. Subsequent uses then reference the acronym without re-gloss.

**Spec edits.** A single sentence-level insertion at the first-use site; every other `AJV` mention is left intact. Optionally add a one-line glossary entry under `docs/spec_topics/glossary.md` keyed `AJV` that points at the gloss site.

**Pros.** Smallest possible diff. Independent of every other obligation in this finding. Survives later edits because the gloss attaches to a stable concept, not a moving paragraph.

**Cons.** Does not address the corpus-wide "AJV vs `SchemaValidator` seam" prescription issue tracked in the related finding below (that one is a separate scope question).

**Risks.** Picking the wrong first-use site means a later reader still hits an unglossed mention before the gloss. Mitigated by grepping `AJV` in document-read order before placing the gloss.

### Option B — Replace "one-character edit" with "one-site edit"

**Approach.** Edit the single phrase in item 1 of `host-prerequisites.md`. Replace "each Pi minor bump is a one-character edit at this site" with "each Pi minor bump is a single-site edit at this anchor" (or "edit at one anchor"). The surrounding "rather than an N-site sweep" clause stays — that is the actual property the lock-step buys.

**Spec edits.** One phrase, one line, in the *Pi SDK pin* item.

**Pros.** Trivial. Removes a quantitatively wrong claim and leaves the genuine property (single-site edit) stated correctly.

**Cons.** None.

**Risks.** None.

### Option C — Scope the no-detection claim to runtime

**Approach.** Edit item 1's "loom does not attempt to detect or accommodate skew" to "loom does not attempt to detect or accommodate skew **at runtime**" (or equivalent). Leave the *Deliberate deviation* paragraph's install-time-skew-detection language intact; the two paragraphs then read consistently — install-time gates the skew; the runtime does not. Also re-check the sentence two lines later ("Loom does not at runtime read `pi-coding-agent`'s `package.json` to verify the upstream pin — doing so would re-introduce the very skew-tolerance disclaimed above") — if Option C scopes the disclaimer to runtime, that downstream sentence still reads correctly because it is itself runtime-scoped.

**Spec edits.** Two words inserted in one sentence of `host-prerequisites.md` item 1.

**Pros.** Removes a literal in-paragraph contradiction. Matches the actual architecture (install-time skew detection is intentional; runtime skew detection is not).

**Cons.** None.

**Risks.** None.

### Option D — Align the review-gate verb across presuppositions

**Approach.** Pick one verb for the editorial-review gate on host-behaviour presuppositions and apply it uniformly. Two viable choices:

- **D1 — uniform MUST.** Replace the SHOULDs in (d), the binder-model presupposition block, and the settings write-back presupposition block with MUST, matching (c). Justification: every one of these presuppositions, if violated by a Pi minor, silently breaks a load-bearing loom contract (degraded-branch recovery semantics, binder/`model:` load-time resolution, settings round-trip preservation); none is a "best-effort" check.
- **D2 — uniform SHOULD with one explicit carve-out for (c).** Demote (c) to SHOULD on the grounds that all four presupposition gates rely on contributor-side editorial judgement and none can be mechanically enforced; or, if (c)'s "MUST" is load-bearing, lift it into the section preface and explain why (c) alone earns the stronger verb.

**Spec edits.** Either three SHOULD→MUST changes in the named blocks (D1), or one MUST→SHOULD change in (c) (D2). Add an explicit gate verb to (a) and (b) under the same uniformity rule.

**Pros.** Removes a normative-strength inconsistency the section preface explicitly disclaims. Makes the bump-checklist obligations predictable per presupposition.

**Cons.** D1 raises the bar on three checklist items; if the spec author had a deliberate reason to weaken (d)/binder-model/settings to SHOULD (e.g. they are externally re-confirmable from Pi docs rather than only by source-diff), that reason is currently undocumented and would need stating. D2 weakens (c), which carries the highest blast-radius failure mode (silent breakage of `/reload`-driven recovery).

**Risks.** Choosing the wrong direction silently changes the procedural strength of contributor obligations. Mitigated by adopting D1 and explicitly footnoting any presupposition the author wants to keep at SHOULD.

### Recommendation

Resolve in the order A → B → C → D, each as a separate fix-loop pass. A and B are no-risk single-edit cosmetic fixes that should land first to clear the surface area. C is a two-word scope fix that removes the only outright contradiction in the bundle. D is the largest and most consequential edit and should land last so it can be reviewed against a clean baseline; within D, prefer D1 (uniform MUST), since the section preface's "on the same footing" framing reads most naturally when every member of the set carries the same strength and the strongest of the existing verbs is the only one consistent with the failure modes the presuppositions guard against. If D1 cannot be defended for a specific presupposition, footnote the carve-out at that presupposition rather than weakening the whole set.

## Relationships

- T037 "Loom-side `/reload` rules buried inside Pi-host presuppositions" - same-cluster (touches presupposition (c) in the same file; option D's edits to (c) should be sequenced after that finding's relocation, since moving (c-i)/(c-ii) out first reduces (c)'s edit surface)

---

# T041 - Shard-10 hidden assumptions and editorial cruft on the host-prerequisites / host-interfaces-core / host-interfaces-services / registration-steps page set

**Original heading:** Shard-10 hidden assumptions and cruft: `AgentSession.abort()`/`dispose()` behaviour unpinned; `resources_discover` reason literals; 250ms debounce burst-timing; deviation rationale, non-normative estimator note, fragile-evidence/argumentHint asides
**Original section:** docs/spec_topics/pi-integration-contract/ (host-prerequisites, host-interfaces-core, host-interfaces-services, extension-bootstrap-and-per-loom, registration-steps)
**Kind:** assumptions, cruft
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The four shard-10 PIC pages (`host-prerequisites.md`, `host-interfaces-core.md`, `host-interfaces-services.md`, `registration-steps.md`) carry two unrelated problems that the source review bundled into one entry because they happened to sit on the same page set. They are separately resolvable and should not move together.

**Unpinned Pi behavioural presuppositions.** Three load-bearing Pi behaviours are consumed by normative spec text but have no entry in the *Editorial-review checklist for unpinned host presuppositions* under `version-bump-step2.md` (items (a)–(z)), so a Pi minor that changed them would not surface against any named checklist item:

1. *`AgentSession.abort()` / `dispose()` cancellation and teardown behaviour.* `host-interfaces-core.md`'s `AgentSession` paragraph and the **Cancellation source** paragraph rely on `abort()` actually tearing down the in-flight provider call and resolving once the agent is idle, and on `dispose()` actually removing listeners and disconnecting from the underlying agent. Item (n) explicitly audits the member *shape* only; the factory probe checks `typeof AgentSession.prototype.abort === "function"`; item (y) covers only the narrow `dispose()`-mid-unsettled-`abort()` overlap. Neither item audits that `abort()` and `dispose()` actually do what their names say — a Pi minor that retained both members as no-ops would pass every existing gate and silently leak subagent provider connections and break Esc-during-`@`-query forwarding.
2. *`resources_discover` event `reason` literal set.* `registration-steps.md` step 1 normatively distinguishes initial scan (`reason: "startup"`) from reload (`reason: "reload"`) and routes the project-root precedence rule (`event.cwd` preferred over the `FileSystem.cwd()` seam) off the event payload. The two literals and the payload shape (`{ cwd, reason }`) have no checklist item and are not enumerated by the SDK surface-inventory assertion (which covers only the seven named capabilities). A Pi minor that added a third reason (e.g. `"package-change"`) or removed `reason` would silently degrade either the startup-vs-reload discrimination or the per-event `cwd` precedence rule.
3. *250 ms debounce burst window vs editor write patterns.* `registration-steps.md` step 5 and `host-interfaces-services.md` PIC-14 fix the watcher debounce at 250 ms "to coalesce editor `change` + `rename` bursts". The numeric bound presupposes that the editors and platforms loom 1.0 supports do in fact complete their save bursts within 250 ms; the assumption is unstated and not audited. A platform whose editor save sequence routinely exceeds 250 ms would split one logical save across two registry rebuilds and emit a structural-change note that the operator did not cause.

**Editorial cruft on the same page set.** Six paragraphs across the four pages are non-normative asides or stale artefacts that the GOV-18 internals-prohibition discipline would strip:

- *Deliberate-deviation rationale* — `host-prerequisites.md`'s "Deliberate deviation from Pi's bundled-package convention" sub-paragraph justifies the tilde-pin choice against `pi-coding-agent`'s `packages.md`. The pin itself is normative; the justification is decision-log content.
- *Non-normative Pi-estimator algorithm note* — `host-interfaces-core.md`'s `estimateTokens` paragraph carries a labelled **Non-normative** orientation block describing how Pi's estimator counts UTF-16 code units, with a `"😀😀😀"`→2-token example. The block self-documents as orientation only and explicitly disclaims authority.
- *Orphaned anchor-move comment* — `host-interfaces-core.md` ends with the HTML comment `<!-- \`#checkpoint-seam\` anchor moved to host-interfaces-services.md, co-located with the PIC-10 \`Checkpoint\` seam content it names. -->`, a migration breadcrumb that no longer informs any reader.
- *Deferred subagents-collision-set expansion* — `host-interfaces-services.md`'s seam blockquote tails into "The deferred *Pi-owned subagents exposed as enumerable slash commands* extension in [Future Considerations](../future-considerations.md) lands by widening that set to four arms…", a forward-looking sentence about a future-considerations item.
- *Fragile-evidence epistemology paragraph* — `registration-steps.md` step 2 carries a `pre-bind-throw-closure-evidence`-anchored paragraph distinguishing "known-fragile evidence" (the `_`-prefixed loader internals, the `notInitialized` token, the throw-string text) from "observable rules" and explaining the audit-trail framing. The observable rules — that pre-bind action-method calls abort factory load, registration sinks and `refreshTools` are safe — are stated immediately above; the meta-paragraph adds editorial framing rather than spec content.
- *`argumentHint` deferral parenthetical* — `registration-steps.md` step 3 carries the parenthetical "(a deferred `argumentHint`-style upstream is tracked in [Future Considerations](../future-considerations/surface-extensions.md#surface-extensions-without-a-dedicated-topic-page-seam))", a forward-pointer to a deferred future-considerations seam.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — `AgentSession` paragraph, `estimateTokens` paragraph, file tail (edited)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — *Deliberate deviation* sub-paragraph (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — *Pi-owned subagents collision source set* seam blockquote, PIC-14 debounce reference (edited)
- `docs/spec_topics/pi-integration-contract/registration-steps.md` — step 1 (`resources_discover` payload), step 2 (`pre-bind-throw-closure-evidence` paragraph), step 3 (`argumentHint` parenthetical), step 5 (250 ms debounce) (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — checklist items (a)–(z) (edited under options A/B/C)
- `docs/spec_topics/pi-integration-contract/capability-probe.md` — Step 0 (c) factory-probe contract for `AgentSession.prototype.abort` (read-only)
- `docs/spec_topics/discovery/package-and-settings.md` — *Caching and reload* 250 ms debounce reference (read-only; same window applies)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan currently has no leaves; `docs/plan_topics/` contains only `conventions.md`, `leaf-template.md`, and `coverage-matrix.md`.)

## Consequence

**Severity:** advisory

The three unpinned presuppositions create silent-drift channels: a Pi minor that altered `abort()`/`dispose()` behaviour, reshaped `resources_discover.reason`, or shipped a save sequence that exceeded 250 ms would not trip the surface-inventory assertion or any named checklist item, and the divergence would surface only as a runtime hang, a misrouted reload, or an extra structural-change note. The cruft items do not affect implementer behaviour but inflate the corpus reviewers must scan and weaken the discipline that keeps non-normative material out of normative pages.

## Solution Space

**Shape:** multiple
**State:** shaped

The original entry bundles two independent obligation classes (record unpinned presuppositions; delete editorial asides) and nine independent edits across four files. Each option is separately resolvable. The orchestrator should apply the six deletions first — they are atomic per-paragraph edits with no inter-option ordering — then apply the three presupposition pins, which add new lettered items to the `version-bump-step2.md` checklist and cross-link from the originating site.

### Option A — Pin `AgentSession.abort()` / `dispose()` cancellation and teardown behaviour

**Approach.** Add a new editorial-review checklist item (next free letter after (z)) in `version-bump-step2.md` covering the *behaviour* of `AgentSession.abort()` (tears down the in-flight provider call; resolves once idle) and `AgentSession.dispose()` (removes all listeners; disconnects from the underlying agent). Cross-link it from the `AgentSession` paragraph in `host-interfaces-core.md`, distinguishing it from item (n) (shape) and item (y) (dispose-mid-unsettled-abort overlap).

**Spec edits.** New item in `version-bump-step2.md`; one inline back-reference in the `AgentSession` paragraph of `host-interfaces-core.md`.

**Pros.** Closes the silent-drift channel for the primary subagent cancellation primitives; consistent with the existing presupposition framing for the other unpinned host behaviours.

**Cons.** Lengthens the bump checklist; the behavioural property is harder to fixture than the shape probe, so the item is necessarily SHOULD-level editorial review.

**Risks.** None material — additive to the checklist.

### Option B — Pin `resources_discover` event `reason` literal set and payload shape

**Approach.** Add a new editorial-review checklist item covering the `resources_discover` event payload shape (`{ cwd, reason }`) and the closed `reason` literal set (`"startup"`, `"reload"`) that `registration-steps.md` step 1 normatively branches on. Cross-link it from step 1.

**Spec edits.** New item in `version-bump-step2.md`; one inline back-reference in step 1 of `registration-steps.md`.

**Pros.** Closes the silent-drift channel for the startup-vs-reload discrimination and the per-event `cwd` precedence rule.

**Cons.** Lengthens the checklist by one further item.

**Risks.** None material — additive.

### Option C — Record the 250 ms debounce burst-window presupposition

**Approach.** State explicitly at the `registration-steps.md` step 5 debounce site (and mirror at the `discovery/package-and-settings.md` settings-watcher debounce site) that the 250 ms window presupposes editor save bursts complete within that window on the supported platforms, and add a checklist item that re-confirms the assumption against the platform matrix on each Pi minor bump.

**Spec edits.** One sentence appended at each debounce-window definition site; new item in `version-bump-step2.md` cross-linking both sites.

**Pros.** Makes the bound's empirical basis auditable rather than implicit.

**Cons.** The platform matrix the audit would re-confirm against is not pinned anywhere in the corpus, so the checklist item is the weakest of the three.

**Risks.** If no platform matrix is pinned, the audit item becomes vacuous; the option is contingent on the implementer naming a concrete platform set.

### Option D — Delete the *Deliberate deviation from Pi's bundled-package convention* sub-paragraph

**Approach.** Strike the entire sub-paragraph in `host-prerequisites.md`. The normative pin and the lock-step rule above it stand on their own; the deviation rationale is decision-log content.

**Spec edits.** One sub-paragraph deletion.

**Pros.** Removes ~250 words of editorial justification from a normative prerequisites page.

**Cons.** Loses the explicit articulation of *why* the tilde-pin diverges from `packages.md`'s `"*"` convention, which a future contributor revisiting the manifest might find useful.

**Risks.** A subsequent reviewer could re-introduce the rationale without recognising it as decision-log content; mitigate by parking the deleted text in a decision-log file if one exists.

### Option E — Delete the non-normative Pi-estimator algorithm orientation block

**Approach.** Strike the **Non-normative** orientation paragraph at the tail of the `estimateTokens` paragraph in `host-interfaces-core.md` (the `Math.ceil(chars/4)` description and the `"😀😀😀"`→2-token example). The block self-discloses as orientation only.

**Spec edits.** One block deletion inside the `estimateTokens` paragraph.

**Pros.** Removes Pi-owned algorithm description from a loom contract page.

**Cons.** Removes a concrete worked example a reader might use to sanity-check the per-message token budget.

**Risks.** None material.

### Option F — Delete the orphaned `#checkpoint-seam` anchor-move HTML comment

**Approach.** Strike the trailing HTML comment in `host-interfaces-core.md`.

**Spec edits.** One-line deletion.

**Pros.** Removes a migration breadcrumb that no longer informs any reader; the move it documents is years-stale relative to the current corpus.

**Cons.** None.

**Risks.** None.

### Option G — Delete the deferred-subagents-collision-set expansion sentence

**Approach.** Strike the sentence "The deferred *Pi-owned subagents exposed as enumerable slash commands* extension … widens the set to four arms …" from the seam blockquote in `host-interfaces-services.md`. The seam MUST is the normative content; the future-extension forecast is editorial.

**Spec edits.** One-sentence deletion inside the seam blockquote.

**Pros.** Tightens the seam definition to its normative core.

**Cons.** Loses the inline forward-pointer to the future-considerations expansion.

**Risks.** None — the future-considerations page still owns the deferred extension.

### Option H — Delete the fragile-evidence epistemology paragraph

**Approach.** Strike the `pre-bind-throw-closure-evidence`-anchored paragraph in `registration-steps.md` step 2 that distinguishes known-fragile evidence from observable rules. The observable rules are already stated immediately above; the meta-paragraph adds framing rather than spec content. Preserve the `pre-bind-throw-closure-evidence` anchor inline on whichever sentence checklist item (q) currently back-links to.

**Spec edits.** One paragraph deletion; anchor relocated to the appropriate retained sentence.

**Pros.** Removes editorial framing from a registration-step body.

**Cons.** Loses the explicit "fragile vs observable" carve-out that gives item (q)'s audit instruction its scope.

**Risks.** Item (q)'s audit instruction may become harder to interpret without the carve-out; mitigate by inlining the necessary scoping into item (q) itself in the same edit.

### Option I — Delete the `argumentHint` deferral parenthetical

**Approach.** Strike the parenthetical "(a deferred `argumentHint`-style upstream is tracked in [Future Considerations]…)" in `registration-steps.md` step 3.

**Spec edits.** One parenthetical deletion.

**Pros.** Tightens the step-3 description of what loom 1.0 passes to `pi.registerCommand`.

**Cons.** Loses the inline forward-pointer to the deferred completion-surface seam.

**Risks.** None — the future-considerations page still owns the deferred item.

### Recommendation

Resolve the nine options sequentially in this order to keep each fix's diff small and independently reviewable:

1. **F** (orphaned HTML comment) — zero-risk one-line deletion.
2. **I** (`argumentHint` parenthetical) — zero-risk in-paragraph deletion.
3. **G** (deferred-subagents expansion sentence) — single-sentence deletion inside a blockquote.
4. **E** (Pi-estimator orientation block) — single-block deletion at a paragraph tail.
5. **D** (deliberate-deviation sub-paragraph) — sub-paragraph deletion.
6. **H** (fragile-evidence paragraph) — paragraph deletion plus anchor relocation; do last among the deletions because of the anchor-preservation requirement.
7. **B** (`resources_discover` reason set) — add checklist item; the cleanest of the three pins.
8. **A** (`AgentSession.abort()`/`dispose()` behaviour) — add checklist item; the highest-value pin.
9. **C** (250 ms debounce burst window) — add checklist item only if the implementer is willing to pin a concrete platform matrix; otherwise rework as an inline non-normative caveat rather than a checklist obligation.

The deletion phase first removes editorial surface from the four pages so the additive checklist edits land against a cleaner baseline. Each option's diff is bounded to one site (D, E, F, G, H, I) or to one new checklist item plus one back-reference (A, B, C).

## Relationships

- T035 "`pi.getFlag` is touched pre-bind but is absent from both the safe-before-bind list and the `notInitialized`-throwing list" - same-cluster (touches the same step-2 pre-bind discussion Option H reworks)
- T109 "`session_start` collision pass has no failure contract when `pi.getCommands()` throws" - same-cluster (touches step 3, same page as Option I)
- T036 "`registerMessageRenderer` is unordered in the registration sequence; `registerFlag` options parameter is unpinned" - same-cluster (touches the same registration-steps numbered sequence as Options H and I)

---

# T042 - `audit-recognised-shapes.md` and `audit-target-categories.md` filenames are swapped relative to their content

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/pi-integration-contract/`, the sibling files `audit-recognised-shapes.md` and `audit-target-categories.md` have basenames that contradict their content: `audit-recognised-shapes.md` opens `# Audit target categories` and carries the *Target surface categories* paragraph (anchor `audit-target-surface-categories`), while `audit-target-categories.md` opens `# Audit recognised shapes` and carries the *Recognised import/access shapes* paragraph (anchor `audit-recognised-shapes`). Nine inbound cross-links across the corpus reference these files by basename; links to `audit-recognised-shapes.md#audit-recognised-shapes` already resolve to a missing anchor because that anchor lives in the other file, and any link written from the filename misleads readers. `docs/_tools/split_spec.py` is the upstream source: its split-map assigns the *Target surface categories* content to basename `audit-recognised-shapes` and the *Recognised import/access shapes* content to basename `audit-target-categories`.

## Solution approach

Rename the two sibling files in `docs/spec_topics/pi-integration-contract/` so each basename matches its existing H1 and interior anchor: the file containing *Target surface categories* (H1 `# Audit target categories`, anchor `audit-target-surface-categories`) becomes `audit-target-categories.md`, and the file containing *Recognised import/access shapes* (anchor `audit-recognised-shapes`) becomes `audit-recognised-shapes.md`. Update the matching filename strings in `docs/_tools/split_spec.py`'s split-map (the entries mapping source-spec lines 826 and 827) so a re-run reproduces the corrected names. Sweep the corpus for inbound links naming either filename and repoint them, and fix the renamed files' internal self-references that link `./audit-recognised-shapes.md#audit-target-surface-categories`.

## Solution constraints

- None.

## Relationships

None
# T043 - Binder extraction narrative covers only the missing-ToolCall malformed-envelope sub-case

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The structured-output extraction paragraph in `binder-inference.md` enumerates only two malformed-envelope sub-cases — an `AssistantMessage` with no matching `ToolCall` (plain text or a `ToolCall` with a different `name`) — and presents the matched-name path as the happy path. The canonical `failure-class-taxonomy` on `binder/determinism-cancellation-failure.md` classifies a broader set into the malformed-envelope class, including a matched-name `ToolCall` whose `arguments` fails JSON parsing, fails the envelope `anyOf` discriminator, carries a `kind` outside `ok | needs_info | ambiguous`, or otherwise violates the envelope schema. A reader treating the extraction paragraph as authoritative would not see how matched-name-but-bad-`arguments` is routed and could emit an unmapped runtime path.

## Solution approach

Rewrite `binder-inference.md`'s extraction paragraph so the matched-name `ToolCall`'s `arguments` is routed through the [Failure-class taxonomy](../binder/determinism-cancellation-failure.md#failure-class-taxonomy) rather than presented as a happy path, making the cross-reference cover every post-extraction failure shape instead of only the missing-`ToolCall` shape. Leave the enumeration of malformed-envelope shapes to the taxonomy, which already owns it.

## Solution constraints

- The broadened cross-reference MUST NOT collapse the AJV-on-`args` class (structurally valid envelope whose `args` fail AJV, non-retried) into the malformed-envelope class — the taxonomy keeps them distinct with different retry budgets.

## Relationships

- T111 "Binder `complete()` call execution phase contradicts its own cancellation/argument wiring" - same-cluster (same page, distinct prose defect)
- T112 "Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates" - same-cluster (same page, distinct prose defect)
- T116 "Binder-failure RuntimeEvents have no pinned source for the required `invocation_id` / `loom` fields" - same-cluster (same binder-failure surface, independent resolution)
# T044 - Family-(5) malformed-marker per-clause `<symptom>` token requirement is asserted derivatively but never normatively pinned

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/pi-integration-contract/audit-failures.md`, the *Failure-surface contract* paragraph (anchor `audit-failure-surface-contract`) justifies its per-`<symptom>` negative-test fixture floor by counting family (5) at "nine tokens total" — the two stale sub-kinds (s1)/(s2) plus the seven malformed-marker clauses (a)–(g). That nine-token count is load-bearing but is never pinned as a normative obligation: no rule requires the implementation to emit seven distinct stable `<symptom>` tokens for clauses (a)–(g). The *Stale sub-kinds* paragraph explicitly states its two `<symptom>` tokens MUST be distinct, but the *Malformed-marker discriminator* paragraph describes a single discriminator and never partitions it into seven per-clause tokens. A conforming implementation can therefore surface all seven clauses under one shared `<symptom>` token and still satisfy every upstream MUST, tripping the fixture floor only as an arithmetic side-effect, so two implementers diverge on whether (a)–(g) are seven tokens or one.

## Solution approach

Clarify the *Malformed-marker discriminator* paragraph to normatively require a distinct stable `<symptom>` token per clause (a)–(g) — pairwise distinct and fixed at first implementation as permanent test invariants — mirroring the *Stale sub-kinds* "two `<symptom>` tokens MUST be distinct" obligation so both family-(5) partitions carry parallel pins. Resolve the case of a marker that fails several clauses at once, either by pinning a precedence order over (a)–(g) or by permitting multiple distinct-`<symptom>` records on the same line.

## Solution constraints

- If the added per-clause obligation creates or strengthens a defining obligation site with no co-located REQ-ID anchor, satisfy GOV-22 by coining the next `PIC-N` anchor under the page's registered prefix in the same commit.

## Relationships

None
# T045 - Audit-cluster testability/assumptions: four independent gaps bundled in one finding

**Original heading:** Audit-cluster testability/assumptions: probe-seam contract undefined; infra-aborted-run carve-out over-broad; PIC-8 (d) body-succeeded path; complete()/IdSource/tab-free presuppositions
**Original section:** docs/spec_topics/pi-integration-contract/ (inventory/audit cluster, registry, binder-inference, capability probe)
**Kind:** testability (shard-11), assumptions (shard-11)
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The audit/registry cluster carries four independent testability and presupposition gaps that the original finding bundled into one entry. They share no edit surface and resolve independently; they are presented here as separate obligations.

1. **Probe-seam contract is undefined.** `active-invocation-registry.md` (Registry contract → "registry name is internal" bullet) instructs tests to assert on observable side effects "(entry counts via probe seams, ordered `loomAbort.abort()` calls, `disposeBarrier` settlement)" but no "probe seam" is defined anywhere in the cluster — neither as a DI seam in `host-interfaces-services.md` (which enumerates `Clock`, `FileSystem`, `FileWatcher`, `TokenEstimator`, `IdSource`, …) nor as an inspection method on the registry itself. Without a defined contract, "entry counts via probe seams" is unimplementable.

2. **Infra-aborted-run carve-out is keyed in a way that admits silent canary loss.** `audit-wire-and-canary.md` *Infra-aborted-run carve-out* identifies an "infra-aborted run" by **"the presence of one or more infrastructure-failure records"** in the stdout stream, and tells CI parsers to drop the once-per-invocation canary obligation for such runs. The keying is order-blind: a run that emitted its canary record *and then* hit an infrastructure failure produces exactly the same stdout shape (one canary + ≥1 infra record) as a run that failed before reaching the canary computation. CI parsers therefore stop asserting the canary contract on every post-canary infra failure — masking the very class of misconfiguration the canary exists to catch.

3. **PIC-8 (d) is vacuous on the body-succeeded path.** `tool-registration-lifetime.md` PIC-8 step (d) says, on double restore failure, to "propagate the original exception (or terminal `Err`) that the `finally` was protecting." When the protected body succeeded, there is no original exception to propagate. PIC-8 currently has no Then-clause for the (body-succeeded ∧ initial-restore-fails ∧ retry-restore-fails) path: steps (b) and (c) emit a diagnostic and a system note, but the query's nominal success/value disposition under this path is unstated.

4. **`audit-wire-and-canary.md`'s tab-free claim for the `path` field rests on an un-pinned premise.** The *Wire serialisation* paragraph states "the four field values … MUST NOT contain the ASCII tab character … bare identifiers, package-qualified imported names, the literal `<n/a>` sentinel, integer `line` values, and file paths are tab-free by their pinned shapes." File paths are **not** tab-free by any pinned shape in this corpus — POSIX permits ASCII tab in filenames, and no spec page restricts the audit's audited-path shape to exclude it. The tab-free claim therefore rests on an implicit and false premise about the host filesystem.

(The original framing also flagged `complete()` retry/cancellation and `IdSource` synchrony as "unpinned presuppositions." Those are in fact pinned — `complete()` retry/cancellation at `conversation-drive.md` §`complete-retry-and-cancellation-presupposition` and routed to bump-checklist items (aa)/(ab); `IdSource` at `host-interfaces-services.md` PIC-20. Those two sub-claims are not carried forward here.)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/active-invocation-registry.md` — "Registry contract" bullet list (edited, sub-issue 1)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — DI-seam section (option-dependent, sub-issue 1)
- `docs/spec_topics/pi-integration-contract/audit-wire-and-canary.md` — *Infra-aborted-run carve-out* (edited, sub-issue 2)
- `docs/spec_topics/pi-integration-contract/audit-wire-and-canary.md` — *Wire serialisation* / *Per-family record-shape table* (edited, sub-issue 4)
- `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md` — PIC-8 (read-only structurally; edited body for new Then-clause, sub-issue 3)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project has no leaves authored under `plan_topics/` yet — `plan.md` lists Horizontal / MVP / Vertical-slice sections, all empty.)

## Consequence

**Severity:** correctness

Sub-issues 1, 2, and 3 each admit two reasonable implementers diverging: (1) tests for registry teardown have no defined inspection surface to bind to; (2) CI parsers built per spec will silently miss post-canary infra failures, defeating the canary's purpose on exactly the runs where the audit reached real work before crashing; (3) implementers will guess differently on whether to mark the query successful, throw a synthetic error, or rethrow the restore error on the body-succeeded double-failure path. Sub-issue 4 is advisory in isolation (the rule still bans tabs in the field) but undermines the spec's stated justification chain.

## Solution Space

**Shape:** multiple
**State:** shaped

Each sub-issue is an independent obligation; per the bimodal-obligation rule each gets its own option. The recommendation block specifies the order in which a fixer should resolve them.

### Option A — Define the probe-seam contract on the registry

**Approach.** In `active-invocation-registry.md`, replace the "entry counts via probe seams" phrase with a concretely-defined inspection surface. Two viable forms:

- **A1.** A DI seam `RegistryInspector` (added to `host-interfaces-services.md`) whose method `snapshot(): readonly { invocationId: string; loom: string; shutdownReason: string | undefined }[]` returns the current entries in insertion order. Production wires it to the runtime's registry instance; tests construct a fake or pass the real instance directly.
- **A2.** An observable side effect on the existing teardown surface: every insertion and removal emits a debug-only event (or increments a counter exposed via an existing seam), and the testability requirement reads "entry counts inferred from insertion/removal event tallies."

**Spec edits.** Replace the parenthetical phrase. If A1, add a PIC entry in `host-interfaces-services.md` mirroring the `IdSource` shape (interface + production adapter + fake + per-runtime construction rule).

**Pros.** A1 is consistent with the rest of the DI-seam family; A2 avoids introducing a new seam.

**Cons.** A1 widens the seam surface (one more interface for the audit to recognise); A2 forces every insertion/removal site to be event-instrumented even outside test runs.

**Risks.** A1's `RegistryInspector` member becomes a Pi-side surface candidate the inventory audit must classify; ensure it is registry-internal and not Pi-derived.

### Option B — Re-key the infra-aborted-run carve-out on pre-canary termination

**Approach.** Rewrite the *Infra-aborted-run carve-out* so the carve-out applies only when the run terminated **before** the canary's two-counter computation completed. The carve-out predicate should be a positive shape on the stdout stream — "no canary record present" — rather than the current "any infra record present."

**Spec edits.** In `audit-wire-and-canary.md`, change the carve-out predicate from "identifiable by the presence of one or more infrastructure-failure records" to "identifiable by the absence of a canary record on the run's stdout." Add a complementary sentence: a run that emitted a canary record before terminating with an infra failure MUST satisfy the once-per-invocation canary obligation; the CI parser asserts canary presence/uniqueness on every run that emitted at least one canary record, regardless of whether infra records also appear.

**Pros.** Eliminates the silent-loss path; CI parsers retain the canary assertion on every post-canary infra failure. Keying on canary-record presence is monotone in audit progress (the canary record is emitted exactly once, near the end, before any infra-failure summary).

**Cons.** Requires the implementation to ensure the canary record is flushed to stdout before any subsequent infra-failure record on a partial-evaluation run; the *Partial-evaluation semantics* clause already permits both classes in the same run but does not pin ordering.

**Risks.** A run that terminates partway through canary-record construction (e.g. the audit had computed both counters but crashed inside the line formatter) is in a grey zone; the *Pre-emission termination carve-out* already covers "before any record can be emitted" and remains the correct landing for that case.

### Option C — Add a Then-clause to PIC-8 (d) for the body-succeeded path

**Approach.** In `tool-registration-lifetime.md` PIC-8, replace step (d) with a two-armed disposition that splits on whether the protected body produced an exception or a terminal `Err`:

- *Body threw / produced terminal `Err`.* Propagate it unchanged (current behaviour).
- *Body succeeded.* The query is treated as having failed: the runtime synthesises a terminal error whose surface mirrors the active-set-restore-failed diagnostic (cause: `internal_error`, message references the double restore failure, propagates as the query's outcome).

The synthesised-error arm exists so the caller is never silently told the body succeeded while the runtime is in a known-corrupted active-set state.

**Spec edits.** Replace step (d) with the two-armed disposition. Add a cross-reference from the per-invocation `finally`'s disposition page (if any) to PIC-8.

**Pros.** Closes a real ambiguity; aligns with the "restore failure does not mask the inner error" intent — there *is* no inner error to mask, so the runtime contributes one rather than reporting nominal success.

**Cons.** Synthesises an outcome the body did not produce; downstream code must accept that a successful body can surface as a failure due to restore failure.

**Risks.** Implementers must wire the synthesised error through the same surface as the protected body's own errors (terminal `Err` vs thrown exception) — pick one shape (terminal `Err` per the existing arm) for both arms of the new disposition.

### Option D — Drop the path-tab-free justification clause

**Approach.** In `audit-wire-and-canary.md` *Wire serialisation*, the prohibition on tabs in field values remains MUST. Remove the unsupported justification — strike the clause "and file paths are tab-free by their pinned shapes" — and add a positive obligation: when an audited path contains an ASCII tab (legal on POSIX), the audit MUST escape or substitute it before emission (implementation chooses; the round-trippability requirement on the CI parser side requires the substitution to be reversible if a downstream tool needs the original path, e.g. percent-encode the tab as `%09`).

**Spec edits.** Strike the false justification fragment; add the escape/substitution obligation. If escape is mandated, pin the encoding (e.g. percent-encoding limited to tab and other prohibited bytes) so two implementations don't diverge.

**Pros.** Removes a false premise; the wire contract still holds; the audit no longer relies on a host-filesystem property it cannot enforce.

**Cons.** Slightly expands the wire-format spec with an escape rule.

**Risks.** Two-way recovery of the original path now requires the parser to know about the escape; the spec MUST pin the escape so CI parsers can decode it.

### Recommendation

Resolve in the following order — each lands on a stable baseline of its predecessor:

1. **Option D first** (tab-free justification). Pure local edit; no cross-page surface change.
2. **Option B** (infra-aborted-run carve-out re-key). Local to `audit-wire-and-canary.md`; independent of (A) and (C).
3. **Option C** (PIC-8 body-succeeded Then-clause). Local to `tool-registration-lifetime.md`; independent of the above.
4. **Option A** (probe-seam definition) last. This is the largest surface change (potentially a new DI seam); doing it after the smaller fixes means the seam edit lands on a stable cluster baseline. Prefer **A1** over A2 — it is consistent with the existing DI-seam family.

Edge cases the implementer must watch:

- (B) The implementation must order canary emission before any subsequent infra-failure record on partial-evaluation runs so the parser's "canary present ⇒ assert obligation" rule has a single well-defined input.
- (C) The synthesised error on body-succeeded double restore failure MUST use the same surface shape (terminal `Err` per the existing PIC-8 frame) as the body-threw arm — do not introduce a third surface.
- (A1) A `RegistryInspector` seam is registry-internal, not a Pi surface; ensure the inventory audit's category partition keeps it out of category (1)/(2)/(3).

## Relationships

None

---

# T046 - `RuntimeEvent` justifies a field it does not carry

**Original heading:** RuntimeEvent shape omits `provider` though transport emission is said to require it
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`conversation-drive.md` mandates that `TransportError.provider` be populated from the loom's resolved `model:` "regardless of which surface … detected the failure, since the `errorMessage` string carries no structured provider field and the **Runtime event channel** always-log emission for `kind: \"transport\"` requires the field." The cited justification is wrong on its face: the normative `RuntimeEvent` type in `runtime-event-channel.md` enumerates `kind, code?, loom, invocation_id, query_site?, discard_site?, message, attempts?, tokens_used?, masked?, occurred_at` — and is declared additive-only — so the runtime event channel does **not** require `provider` for a `kind: "transport"` emission. It cannot, because it has no slot for one.

The field that actually requires `provider` is the `TransportError` schema in `errors-and-results/queryerror-variants.md` (`provider: string` is mandatory and non-nullable). The two PIC sections therefore disagree about who owns the requirement: `conversation-drive.md` attributes it to the event channel; `runtime-event-channel.md` does not carry it; `queryerror-variants.md` is the silent actual source. An implementer reading only the conversation-drive paragraph and the RuntimeEvent shape sees a contradiction and has no signal which side to honour.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — *Error detection* paragraph (Conversation drive — prompt mode) and *Provider compatibility for typed queries* paragraph (both repeat the same justification) (edited)
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — `RuntimeEvent` payload-shape code block and *Runtime event channel* paragraph (option-dependent)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — `TransportError` schema (read-only; canonical owner of the `provider: string` requirement)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

## Consequence

**Severity:** correctness

Two implementers reading the same paragraphs will diverge: one will widen `RuntimeEvent` with a `provider` field (taking the conversation-drive justification at face value); the other will leave `RuntimeEvent` as written and treat the justification as stale prose. The two implementations produce different on-the-wire payloads for the same operator-visible transport failure, and the dedup key `(kind, query_site, message, occurred_at)` is unaffected by the divergence so neither implementation looks malformed to the channel's own consumers.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Re-ground the justification on the `TransportError` schema

- **Approach:** Leave `RuntimeEvent` unchanged. In both `conversation-drive.md` paragraphs that synthesise a `TransportError` (the synchronous-throw mapping under *Error detection* and the unsupported-provider guard under *Provider compatibility for typed queries*), replace the clause "the **Runtime event channel** always-log emission for `kind: \"transport\"` requires the field" with a citation to `errors-and-results/queryerror-variants.md`'s `TransportError` schema, which is the real source of the `provider: string` requirement.
- **Spec edits:** Two surgical sentence rewrites in `conversation-drive.md`. No change to `runtime-event-channel.md`. No change to `queryerror-variants.md`.
- **Pros:** Minimal surface; preserves the existing "RuntimeEvent is a deliberately narrow operator-facing projection of the QueryError" stance; consistent with the channel's stated additive-only and intentionally-write-only posture.
- **Cons:** Operators reading a `kind: "transport"` event off the channel still see no `provider` and must cross-reference the originating `query_site` against the loom's `model:` to recover that information.
- **Risks:** Negligible. The rewrite is local and cites a schema that already carries the field.

### Option B — Widen `RuntimeEvent` with `provider?: string`

- **Approach:** Add `provider?: string` to the `RuntimeEvent` type in `runtime-event-channel.md`, pin its population rule to "present iff `kind === "transport"`, carrying the same `Model<Api>.api`-shaped value as `TransportError.provider`", and keep the conversation-drive justification as written (it now matches reality).
- **Spec edits:** Add one field to the `RuntimeEvent` code block; add a one-sentence population rule under *Group A*; extend the verbatim-copy obligation under *Deduplication and lifetime rules* to cover `provider` on cascade-twin re-emission; explicitly state that `provider` is **not** part of the dedup key `(kind, query_site, message, occurred_at)` (parallels the `masked` non-inclusion rule). No change to `conversation-drive.md` apart from removing the now-redundant "since the `errorMessage` string carries no structured provider field" half-clause if desired.
- **Pros:** Operators see `provider` directly on transport events without cross-referencing; the conversation-drive justification becomes literally true; establishes a precedent that supports later extension of the channel to surface other `TransportError` fields (e.g. `http_status`, `retryable`) if operator demand emerges.
- **Cons:** Widens the wire shape additively in loom 1.0 rather than deferring; sets up implicit pressure to enumerate the other `TransportError` fields on the channel; requires touching the dedup-key carve-out and the cascade-twin verbatim-copy rule for one field.
- **Risks:** The "additive-only" pledge means a future maintainer who reads "`provider?: string` on transport events" may expect symmetric exposure of `http_status?` and `retryable?`, expanding the channel beyond its stated write-only minimum.

### Recommendation

Take Option A. The contradiction is at the justification site, not the schema, and the existing `TransportError` schema already carries the field — restating "this field is required because schema X says so" is the smaller, more localised edit and preserves the channel's deliberately narrow operator-facing projection. Edge case the implementer must watch: both occurrences of the offending clause in `conversation-drive.md` (the synchronous-throw mapping under *Error detection* and the unsupported-provider guard under *Provider compatibility for typed queries*) must be rewritten in the same edit — they share the same wording and missing one leaves the contradiction half-alive.

## Relationships

- T116 "Binder-failure RuntimeEvents have no pinned source for the required `invocation_id` / `loom` fields" - same-cluster (both concern which fields the `RuntimeEvent` shape carries and where they are sourced; resolved independently)
- T114 "pi-ai provider-error surface (status, body, network-failure delivery) is undefined" - decision-overlap (only under Option B: extending RuntimeEvent with `provider` re-opens the question of which other transport-classifier outputs the channel should carry; under Option A there is no interaction)

---

# T047 - `waitForIdle()` "never rejects" and "resolves only after `agent_end`" are unrouted Pi-behaviour presuppositions

**Kind:** assumptions (shard-12)
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`conversation-drive.md`'s *Resolution.* sentence asserts that `ctx.waitForIdle()` never rejects and resolves only once Pi emits the terminal `agent_end` for the user session and every awaited `agent_end` listener settles; the mirrored *Error detection.* paragraph routes the entire prompt-mode transport-failure surface through the post-`waitForIdle()` `stopReason`/`errorMessage` probe on the strength of "never rejects". Neither property is encoded by the `Promise<void>` type or any other typed contract on `ExtensionCommandContext.waitForIdle`. The editorial-review checklist in `version-bump-step2.md` covers eventual terminal-`agent_end` delivery (item (j)) and commit-vs-resolution ordering (item (ac)) but neither the no-rejection guarantee nor the resolves-only-after-`agent_end` semantics. A Pi minor that began rejecting `waitForIdle()` on transport teardown, or resolving it before `agent_end` settles, therefore has no SDK-surface signal and no editorial-review routing.

## Solution approach

Add anchor `id="waitforidle-settlement-presupposition"` to `conversation-drive.md`'s *Resolution.* sentence and rewrite it as a loom-side consumption posture stating both properties explicitly — `waitForIdle()` never rejects, and it resolves only once Pi has emitted the terminal `agent_end` and every awaited listener has settled — in the shape the adjacent `#driven-turn-commit-ordering-presupposition` posture uses. Rewrite the `waitForIdle()` inline comment on the `ExtensionCommandContext` shape in `host-interfaces-core.md` to forward-link the new anchor instead of restating the property. Add a new checklist item `(ae)` to the *Editorial-review checklist for unpinned host presuppositions* in `version-bump-step2.md`, citing the new anchor in the SHOULD-level audit shape of the adjacent items, and extend the preamble's "(f) through (ad)" cardinality reference to `(ae)`.

## Solution constraints

- Keep checklist items (j) and (ac) intact — they cover eventual terminal-`agent_end` delivery and commit-vs-resolution ordering; the new item covers only the settlement contract.
- The MUST-NOT-`try`/`catch` directive at the `await ctx.waitForIdle()` call site stays normative.

## Relationships

- T067 "Pi behavioural presuppositions lack authoritative behavioural pointers" - same-cluster (this finding adds one more entry to the unanchored-presupposition family that the related finding identifies as a structural gap).
# T048 - Always-log event construction and `ctx.ui.notify` fallback are unpinned at the runtime-event-channel fallback site

**Original heading:** Always-log event construction (`Clock.wallNow()`) and `ctx.ui.notify` signature unbounded/unpinned at the fallback site
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** error-model, implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`runtime-event-channel.md`'s best-effort fallback paragraph says the chain "covers synchronous throws only" of `pi.sendMessage`. The `RuntimeEvent` construction that runs immediately before that call is outside the guard. `RuntimeEvent.occurred_at` is stamped via `Clock.wallNow()` (per the inline `// stamped at the originating emission site via Clock.wallNow()` comment on the payload type), and `PIC-12` in `host-interfaces-services.md` pins `wallNow(): number` with no "MUST NOT throw" obligation — a custom `Clock` adapter (or even a `WallClock` whose `Date.now()` was monkeypatched out of the engine-assumption set) could throw synchronously. A throw at that point silently violates the "exactly once per occurrence" always-log contract: the event is neither emitted nor accounted for in the dedup map, and no diagnostic is produced. The existing *Engine-assumption carve-out* covers `Map`/`Set`/`JSON.stringify`/IEEE-754 corruption, not a `Clock` adapter throw.

Separately, the same fallback paragraph calls `ctx.ui.notify(content, "error")` without anchoring the receiver. `ctx.ui.notify` is declared one file over in `host-interfaces-core.md` (within the `ExtensionContext` shape: `ui.notify(message: string, type?: "info" | "warning" | "error"): void` (synchronous, may throw)). The fallback paragraph reads in isolation: implementers cannot tell from the call site that `"error"` is one of three accepted severities, that the call is synchronous, or that "may throw" is the documented reason for the wrap-in-try/catch instruction the very next sentence gives.

These are two independent obligations — one closes a silent-drop gap in the always-log contract, the other adds a missing cross-link — and they should be resolved in that order so the second edit lands on a stable always-log baseline.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — best-effort fallback paragraph; `RuntimeEvent` type block (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-12 `Clock`/`FakeClock` interface (option-dependent: edited under Option A1, read-only under Option A2)
- `docs/spec_topics/runtime-value-model.md` — JavaScript engine assumptions (option-dependent: edited under Option A2, read-only under Option A1)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — `ctx.ui.notify` declaration on the `ExtensionContext` shape (read-only; cross-link target for Obligation B)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The plan exists but currently contains no leaves; no acceptance criteria are affected and no leaf is blocked.)

## Consequence

**Severity:** correctness

A `Clock.wallNow()` throw during always-log event construction silently drops the event and skips the diagnostic fallback that the same paragraph guarantees for `pi.sendMessage` throws, producing two implementer-reasonable behaviours (some implementers will fold the construction into the guard, others will not). The `ctx.ui.notify` half is advisory in isolation, but combined the finding is correctness-level because it sits on the always-log contract.

## Solution Space

**Shape:** multiple
**State:** shaped

This finding bundles two independent obligations. Both must be addressed; resolve Obligation A first so Obligation B's small edit lands on a stable baseline.

### Option A1 — Fold `RuntimeEvent` construction into the best-effort guard

**Approach.** Restate the fallback paragraph so the best-effort guard wraps the entire originating-site emission sequence (construct the `RuntimeEvent`, stamp `occurred_at` via `Clock.wallNow()`, insert into the dedup map, call `pi.sendMessage`). A throw from any step routes through the existing fallback chain.

**Spec edits.**
- In `runtime-event-channel.md`, replace "The best-effort fallback below covers synchronous throws only" with wording that names the guarded scope explicitly: "covers synchronous throws from `Clock.wallNow()` (during `occurred_at` stamping), the dedup-map insertion, and the `pi.sendMessage` call." State that on a `Clock.wallNow()` throw the fallback's step-2 `system-note-delivery-failed` diagnostic is emitted with `occurred_at` omitted or sourced from a stated sentinel, and step 1's `ctx.ui.notify` is unaffected.
- Leave PIC-12 and the engine-assumptions section untouched.

**Pros.** Closes the silent-drop hole without expanding the engine-assumption set. Symmetric with the `ctx.ui.notify` try/catch already prescribed in the same paragraph for the same reason ("can throw"). Diagnostic is preserved.

**Cons.** Slightly more wire-format work: the `system-note-delivery-failed` diagnostic emitted when `wallNow()` itself threw cannot carry an `occurred_at` from the failed source, so the wording must pick a story (omit, or stamp from a second `wallNow()` retry inside the catch, or sentinel).

**Risks.** A second `wallNow()` call inside the catch could itself throw; if the wording chooses the retry path, it must terminate the recursion explicitly.

### Option A2 — Add `Clock.wallNow()` to the engine-assumption set

**Approach.** Extend the *Engine-assumption carve-out* in `runtime-event-channel.md` (and the source-of-truth list in `runtime-value-model.md` §JavaScript engine assumptions) so a `Clock.wallNow()` throw is an explicit non-checked invariant. The fallback paragraph stays scoped to `pi.sendMessage`.

**Spec edits.**
- In `runtime-event-channel.md`'s *Engine-assumption carve-out* paragraph, add "and `Clock.wallNow()` returning a finite epoch-ms `number` without throwing" to the assumed-engine list.
- In `runtime-value-model.md` §JavaScript engine assumptions, add the same property to the non-checked invariant list, citing PIC-12.
- In PIC-12, add a non-normative sentence saying `WallClock`'s delegation to `Date.now()` satisfies the invariant by inspection.

**Pros.** Smallest wire-format impact: zero new branches in the fallback. Aligns `wallNow()` posture with `Map`/`Set`/`JSON.stringify`, which are also assumed-not-to-throw.

**Cons.** Widens the silent-failure surface acknowledged by the carve-out (operators now have a fourth ambiguous-missing-event cause). A custom `Clock` adapter is no longer an in-scope failure mode, even though the seam is explicitly injection-shaped.

**Risks.** If a future leaf wires a non-`WallClock` adapter (e.g. a network-time `Clock`), it would silently fall outside the contract.

### Option B — Cross-link `ctx.ui.notify`'s signature and severity set at the fallback site

**Approach.** Independent of A1/A2. At the first mention of `ctx.ui.notify(content, "error")` in the fallback paragraph, link to the `ui.notify` member declaration on the `ExtensionContext` shape in `host-interfaces-core.md`.

**Spec edits.**
- Add or repurpose an anchor on the `ui.notify(message: string, type?: "info" | "warning" | "error"): void` line in `host-interfaces-core.md` (e.g. `<a id="ui-notify"></a>`).
- In `runtime-event-channel.md` step 1 of the fallback, change `` `ctx.ui.notify(content, "error")` `` to a Markdown link to that anchor. Optionally add a parenthetical "(`type` is one of `"info" | "warning" | "error"`; `"error"` selected here for cascade visibility)" inline.

**Pros.** Pure cross-link; no behavioural change. The "may throw" property the next sentence ("`ctx.ui.notify` itself can throw") already-relies-on is now traceable to a declaration site.

**Cons.** None material.

**Risks.** None.

### Recommendation

Take **Option A1 + Option B**, in that order.

A1 over A2: the seam is explicitly DI-shaped (PIC-12 admits a `FakeClock` and any conforming `Clock`), so a "wallNow() never throws" engine-assumption stretches the carve-out beyond its IEEE-754/native-collections framing and exports a silent-drop surface across every adapter. Folding the construction into the existing guard is the same pattern the paragraph already applies to `ctx.ui.notify` and keeps the always-log contract observable. The edge case the implementer must watch is the `occurred_at` field on the `system-note-delivery-failed` diagnostic emitted when `Clock.wallNow()` itself was the thrower: pick one wording (omit / second-call / sentinel) and state it.

B is independent and trivial; do it second so the A1 edit doesn't have to be re-flowed around a new anchor link.

## Relationships

- T101 "Renderer-throw during Pi's render invocation has no defined failure mode" - same-cluster (a third gap in the same "best-effort fallback covers …" scope sentence; resolve consistently)
- T049 "`diagnostic-emission-isolation.md` opening scope omits the per-invocation surfaces the paragraph actually governs" - same-cluster (same `sendSystemNote` fallback chain, scope side)

---

# T049 - `diagnostic-emission-isolation.md` opening scope omits the per-invocation surfaces the paragraph actually governs

**Original heading:** diagnostic-emission-isolation.md stated scope (five teardown codes) silently extended to the sendSystemNote fallback and `cancelled-by-session-shutdown` count
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** scope
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The single paragraph that constitutes `diagnostic-emission-isolation.md` opens with a scope statement bounding its rules to "Each `console.error` call inside the `session_shutdown` handler — the five teardown-handler emissions enumerated in the bullet immediately above", and then enumerates those five codes by name (`loom/runtime/reload-teardown-timeout`, `loom/host/session-shutdown-reason-unknown`, `loom/host/session-shutdown-pinned-constant-unreadable`, `loom/host/session-shutdown-teardown-step-failed`, `loom/host/session-shutdown-runtime-degraded`).

Subsequent normative clauses in the same paragraph silently widen that scope along two independent axes:

1. **A sixth diagnostic code emitted from a different site.** The *Two-token fallback for nested-shape codes*, *Hoist obligation*, *Construction-site wrap*, *Construction-site catch-arm self-wrap*, and *Count semantics — invocation-site framing* clauses all bind `loom/runtime/cancelled-by-session-shutdown` — a per-invocation diagnostic emitted from the per-invocation `finally`, **not** from the `session_shutdown` handler the opening sentence names. The per-invocation note inherits the wire-format pin, the two-token / three-token catch-arm forms, the construction-site wrap, and the at-most-once count bound from rules whose stated scope excludes it.
2. **An additional emission site for the same envelope.** The *Wire format* clause's "The same wire-format pin applies to the terminal `console.error` of the `sendSystemNote` fallback chain", the *Count semantics* clause's parenthetical "(and the terminal `console.error` of the per-invocation `sendSystemNote` fallback chain referenced at the end of this paragraph)", and the *Pi-side stdio visibility* clause's closing "The same isolation MUST be applied to the terminal `console.error` of the `sendSystemNote` fallback chain when that chain is reached from the per-invocation `finally`…" extend the wrap-and-swallow obligation to a sink that lives outside the `session_shutdown` handler and is not one of the five enumerated codes.

A reader scanning the opening sentence to decide whether this page governs a given emission site will conclude (incorrectly) that the per-invocation `finally`'s `cancelled-by-session-shutdown` emission and the per-invocation `sendSystemNote` terminal `console.error` are out of scope — yet the paragraph's mid-body and tail bind both. The stated and actual scope diverge.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/diagnostic-emission-isolation.md` — opening sentence + five-code enumeration (edited)
- `docs/spec_topics/pi-integration-contract/active-invocation-registry.md` — Per-invocation operator visibility (clean-cancel path) bullet, `sendSystemNote` fallback chain definition, per-invocation `finally` (read-only; sources the extended-scope sites)
- `docs/spec_topics/diagnostics.md` — row definitions for the five teardown codes plus `loom/runtime/cancelled-by-session-shutdown` (read-only; confirms `cancelled-by-session-shutdown` is the sixth code)
- `docs/spec_topics/diagnostics/diagnostic-shape.md` — `session-shutdown-details-conventions` anchor cited by the in-scope nested-shape rules (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The plan currently has no leaves; coverage-matrix is empty. No leaf is modified or blocked.)

## Consequence

**Severity:** advisory

A careful implementer who reads the whole paragraph will pick up the extended-scope rules and produce a correct emission envelope at both the per-invocation `finally` and the `sendSystemNote` terminal sink. The scope mismatch's risk is navigational: a reader who consults `diagnostic-emission-isolation.md` to answer "what wrap must guard the `cancelled-by-session-shutdown` clean-cancel emission?" or "does the `sendSystemNote` terminal `console.error` need the same try/catch?" can reasonably conclude the page does not govern those sites and fail to apply the wrap, the count framing, or the two/three-token catch-arm forms there. The downstream effect is then concrete (per-invocation note loses its dedup discriminator on serialiser throw, or the `sendSystemNote` terminal throws out of the per-invocation `finally`).

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Restate scope in the opening sentence

**Approach:** Edit the opening sentence to declare the paragraph's actual coverage: the five `session_shutdown` teardown-handler emissions **plus** the per-invocation `finally`'s `loom/runtime/cancelled-by-session-shutdown` emission and the terminal `console.error` of the per-invocation `sendSystemNote` fallback chain. Leave the body unchanged.

**Spec edits:**
- Replace the opening clause "Each `console.error` call inside the `session_shutdown` handler — the five teardown-handler emissions enumerated in the bullet immediately above (…)" with one that enumerates the five teardown codes **and** explicitly adds the per-invocation `cancelled-by-session-shutdown` emission and the `sendSystemNote` terminal `console.error`, citing the per-invocation `finally` and `active-invocation-registry.md`'s *Per-invocation operator visibility (clean-cancel path)* bullet as the source sites.
- Add one sentence after the enumeration noting that subsequent clauses apply uniformly to all in-scope sites except where a clause explicitly narrows (e.g. *Construction-site wrap* limits itself to the two nested-shape codes; *Pi-side stdio visibility*'s `sendSystemNote` clause limits itself to one site).

**Pros:**
- Minimal diff — touches only the opening sentence.
- Leaves the rest of the paragraph (and every anchor and cross-reference into it) unchanged.
- Preserves the single-paragraph structure other PIC pages cross-reference.

**Cons:**
- The paragraph remains very long and dense; the opening sentence grows to carry a heterogeneous scope list.
- Reader still has to thread per-clause scope narrowings (construction-site wrap is two codes only; `sendSystemNote` isolation is one site only) mentally.

**Risks:**
- Anchors and cross-references from `active-invocation-registry.md` and `diagnostic-shape.md` already point into this paragraph by section; an opening-sentence rewrite cannot break those.

### Option B — Split per-invocation clauses into a sibling paragraph

**Approach:** Keep the existing paragraph scoped exactly to the five `session_shutdown` teardown-handler emissions as its opening sentence says. Lift the `cancelled-by-session-shutdown` and `sendSystemNote`-terminal clauses out into a new second paragraph titled around the per-invocation `finally` emission surface, and cross-reference between them where wire-format and count-semantics rules are shared.

**Spec edits:**
- Remove from the existing paragraph the *Two-token fallback*'s `cancelled-by-session-shutdown` branch, the *Hoist obligation*'s `cancelled-by-session-shutdown` portion, the *Construction-site wrap* / *Construction-site catch-arm self-wrap* coverage of `cancelled-by-session-shutdown`, the *Count semantics* parenthetical naming the `sendSystemNote` terminal and the per-invocation note, the *Wire format*'s `sendSystemNote` extension sentence, and the *Pi-side stdio visibility*'s `sendSystemNote` sentence.
- Add a new paragraph (sibling, same `## ` level under the existing H1) covering: the wire format and `details.event.*` nesting for `loom/runtime/cancelled-by-session-shutdown`; the two-token / three-token catch-arm fallbacks (serialiser throw and construction-site throw) for that code; the construction-site wrap and catch-arm self-wrap obligations; the `sendSystemNote` fallback chain terminal `console.error` wrap-and-swallow obligation; and the count-semantics framing for both surfaces. Cross-reference back to the teardown-handler paragraph for rules that are textually identical (wire format primitives, handler-isolation swallow shape).

**Pros:**
- Each paragraph's opening sentence is now truthful about its own scope.
- Per-invocation surface gets a discoverable anchor a reader looking up "what governs the clean-cancel emission's wrap?" can land on directly.
- Construction-site wrap's scope ("only the two nested-shape codes") survives the split intact, because one of those two codes lives in each paragraph and the rule reads naturally in both.

**Cons:**
- Materially larger diff; risks breaking existing anchors / cross-references from `active-invocation-registry.md`, `diagnostic-shape.md`, and `session-shutdown-semantics.md` that target sub-clauses by paragraph position.
- Some rules (wire format primitives, swallow-on-inner-throw, count framing) genuinely apply uniformly across all in-scope sites; splitting forces either duplication or a cross-reference web.

**Risks:**
- The *Count semantics* clause and the *Construction-site wrap* clause both currently rely on being in a single paragraph alongside both halves of the surface; splitting requires careful re-anchoring so the cross-references resolve to stable IDs (e.g. `pic-emission-swallow`, `pic-emission-visibility`) rather than relative phrasing like "above" / "below".

### Recommendation

Take **Option A**. The paragraph's rules are already structured around a small number of behavioural axes (wire format, serialiser-throw fallback, construction-site fallback, count framing, stdio-visibility caveat) and a few per-clause scope narrowings; correcting the opening sentence aligns reader expectation with the body and avoids the anchor-breakage and rule-duplication that a split incurs. Watch for two implementer-relevant edges when authoring the new opening: (1) the *Construction-site wrap* and *Construction-site catch-arm self-wrap* clauses already narrow themselves to the two nested-shape codes — the new opening must not contradict that narrowing; (2) the *Pi-side stdio visibility* clause's `sendSystemNote` sentence narrows to one site (the per-invocation `finally` route into the fallback chain) — the new opening must leave room for that narrowing rather than asserting blanket coverage of every `sendSystemNote` invocation.

## Relationships

None

---

# T050 - Audit / drain-state / runtime-event / provider-error cluster — naming and clarity drift

**Original heading:** audit-resolution naming/clarity: family vs category ordinals; "arm" overloaded; drainStateTag vs tag; init vs mark setter prefixes; Group A capitalisation; numeric-run grammar; tie-break comparison basis
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** naming, clarity, assumptions, implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Four pages in the PIC subtree carry naming/clarity defects that survive a single read but accumulate into mis-implementations on the second:

- **audit-resolution.md.** The audit's *failure families* `(1)..(5)` and its *target surface categories* `(1)..(3)` are both labelled with bare parenthesised ordinals, and (1)/(2)/(3) refer to **the same surfaces in both numberings** (family (1) ↔ category (1) = `pi.<member>`, family (2) ↔ category (2) = peer-package named imports, family (3) ↔ category (3) = canonical-`ctx` member access). The page never states the identity, never reserves one numbering as canonical, and switches between "family (N)" and "category (N)" within adjacent paragraphs; a reader treating them as independent enumerations is consistent with the text.
- **audit-resolution.md.** The `readDrainState` snapshot's tie-break for legal multi-segment matches reports "the entry with the lexicographically-smallest `path`" without pinning the comparison basis (Unicode codepoint order vs locale-aware collation vs UTF-16 code-unit order). Two conforming implementations can disagree on the `proposed-resolution` field for entries whose `path` fields differ only above the ASCII range.
- **drain-state-contract.md.** The word "arm" denotes at least four distinct concepts on the page: (i) a member of the closed `drainStateTag` value set (`"shutting-down"` / `"degraded-needs-reload"` "arms"), (ii) a `readDrainState` dispatch branch (a/b/c), (iii) a `try`/`catch` "catch arm", and (iv) a "predicate arm" in the predicate-split clause. The terms are spatially adjacent and an implementer chasing "arm (c)" through cross-references repeatedly has to disambiguate by surrounding context rather than by name.
- **drain-state-contract.md.** The same field is named `drainStateTag` (internal write/read) and `tag` (snapshot key). The page explains the rename ("snapshot keys kept short for dispatch-site concision") but the burden is paid at every cross-reference — and the explanation references the longer name in three sibling sites (`initDrainStateTag`, `readDrainState`, the `loomRegistry.initDrainStateTag` `details.call` label) that would all have to move under any future unification.
- **drain-state-contract.md.** Two setters for the same field use mismatched prefixes: `initDrainStateTag` (idempotent write iff undefined → `"shutting-down"`) and `markRuntimeDegraded` (unconditional → `"degraded-needs-reload"`). The behavioural asymmetry is real, but the prefix choice ("init" vs "mark") encodes neither side of it consistently — an `initRuntimeDegraded` / `markDrainStateTag` swap would convey the opposite semantics with equal text. The names do not signal "first-write-wins vs last-write-wins" to a reader.
- **runtime-event-channel.md.** The always-log routing partition is introduced as "**group A**" / "**group B**" (lowercased, line 40) and then referenced as "Group A —" / "Group B —" section labels (lines 46, 55) and "group A only … group B" in the dedup-key sentence (line 57). Three capitalisations of two named partitions on one page.
- **provider-error-mapping.md.** The *numeric run* definition for overflow-token extraction reads "a maximal substring of decimal digits that may contain `,` or `_` digit-group separators (the separators are stripped before the run is parsed as a base-10 integer)". The grammar is under-specified at three edges: (a) whether a separator may lead or trail a run (`,123` / `123,`), (b) whether adjacent separators are admitted within a run (`1,,234`), and (c) whether two runs joined by a non-separator non-digit character (e.g. `1,000-2,000`) count as one or two. The rule is normative (it determines whether `tokens_used`/`tokens_limit` populate or fall back to `null`) and the "two conforming implementations produce identical values" guarantee in the same paragraph fails if any of the three edges diverges.

Each defect is small in isolation; together they constitute the naming/clarity surface every reader of this PIC cluster pays on entry.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/audit-resolution.md` — *Target surface categories* cross-reference, *Category-(1)/(3) inventory join key* tie-break (edited)
- `docs/spec_topics/pi-integration-contract/drain-state-contract.md` — *Handler control-flow ordering*, *`LoomRegistry` drain-state contract* Fields/Methods, *Read-failure fallback* (edited)
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — **Runtime event channel** partition intro, Group A / Group B section labels (edited)
- `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — *Overflow token-count extraction* (edited)
- `docs/spec_topics/pi-integration-contract/audit-failures.md` — Family ordinals consume `audit-resolution.md`'s family numbering; any renumbering sweeps here too (read-only unless option A renumbers)
- `docs/spec_topics/pi-integration-contract/audit-recognised-shapes.md` / `audit-target-categories.md` — Category numbering origin (read-only)
- `docs/spec_topics/pi-integration-contract/patch-skew-degradation.md` — *Per-step isolation* references `drainStateTag` / `tag` and uses "arm" (option-dependent under options B/C)
- `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md` — *Predicate split* references the same predicate "arms" and the `drainStateTag` field name (option-dependent under options B/C)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`docs/plan.md` carries no leaves yet — all three phase sections read "No leaves yet." Naming changes here will surface as plan-side citations once leaves are authored against these PIC pages; they do not currently block or modify any leaf.)

## Consequence

**Severity:** correctness

The numeric-run grammar (sub-issue F) and the lexicographic tie-break basis (sub-issue G) both control conformance-observable outputs: `tokens_used`/`tokens_limit` population and the `proposed-resolution` field respectively. Two conforming implementations diverge silently at the under-specified edges, despite the same paragraphs claiming determinism. The remaining sub-issues (A–E) are advisory in isolation — readers pay an extra disambiguation step at every cross-reference — but compound the implementer-error rate against the rest of the PIC cluster where these terms are load-bearing.

## Solution Space

**Shape:** multiple
**State:** shaped

The seven sub-issues partition cleanly by file and are independent of one another. Each is its own option below; the recommendation block at the end orders them and explains why.

### Option A — Reconcile family vs category ordinals (audit-resolution.md)

**Approach.** State the identity at the head of the *Target surface categories* and *Failure-surface contract* sections, then pick one numbering as canonical and reserve it. Two viable shapes:

- **A.1 (preferred).** Keep both numberings (the family/category split is real — families add (4)/(5) for shape-violation and stale-marker) but pin the identity at first use: "family (N) for N ∈ {1, 2, 3} names the violation discriminator for category (N) above; families (4) and (5) have no category analogue (out-of-shape / stale-marker)." Cross-reference at every subsequent use of either label by anchor.
- **A.2.** Renumber families to letters (`F-a`..`F-e`) and reserve digits for categories. Higher sweep cost — `audit-failures.md`, step 2(b) branch numbering in `version-bump-step2b.md`, and every "family (N)" cite — but eliminates the collision at the lexical level.

**Spec edits.** `audit-resolution.md` *Target surface categories* preamble (add identity statement); `audit-resolution.md` *Exemption mechanism* and *Stale-marker discriminator* (replace bare "family (N)" with anchor references). Under A.2: sweep `audit-failures.md`, `version-bump-step2b.md`, and `audit-recognised-shapes.md`.

**Pros (A.1).** Surgical; one new sentence and a handful of anchor links; preserves all existing cross-references.
**Pros (A.2).** Eliminates the ordinal collision rather than annotating it; a future reader cannot conflate.
**Cons (A.1).** The cognitive overhead survives — a reader still has to remember the identity.
**Cons (A.2).** Multi-file sweep; touches `step2b` branch numbering which has its own ordering-correspondence finding upstream.
**Risks.** A.2 collides with the "step-2b branch (4)/(5) route to each other's inverse family" finding elsewhere in this review; coordinate the rename with that fix.

### Option B — Reserve "arm" for one referent (drain-state-contract.md)

**Approach.** Reserve "arm" exclusively for `readDrainState` dispatch branches (a)/(b)/(c) — the most-cited usage and the only one with a closed enumeration the spec already names by letter. Rename the other three:

- "two-arm tag set" → "two-value tag set" (or "closed tag value set"); individual values are "the `\"shutting-down\"` value" / "the `\"degraded-needs-reload\"` value".
- "catch arm" → "catch branch" (or simply "the catch").
- "predicate arm" → "predicate case" (or name the case directly: "the cancelled-reason case").

**Spec edits.** `drain-state-contract.md` — *Handler control-flow ordering*, *Read-failure fallback*, *`LoomRegistry` drain-state contract* Fields and Methods bullets. Cross-page sweep at `patch-skew-degradation.md` *Per-step isolation* and *unset tag fallback*, and at `session-only-degraded-state.md` *Predicate split*.

**Pros.** "Arm (a)/(b)/(c)" is the densest and most semantically committed usage; reserving it there preserves the most cross-references.
**Cons.** Multi-page sweep — the term has spread.
**Risks.** Edits to the closed-set discussion may bleed into the *unset tag fallback* clause where "two-arm" carries weight as "the closed set sub-step 1 pins"; preserve that meaning under the new terminology.

### Option C — Unify drainStateTag and tag (drain-state-contract.md)

**Approach.** Either:

- **C.1 (preferred).** Keep the names distinct (the spec already rationalises them) but move the explanatory paragraph from inline-in-the-Methods-section to a one-line footnote near first use, and add a glossary cross-reference. The current paragraph is ~150 words inside the normative Methods enumeration; relocating it removes the cognitive interrupt.
- **C.2.** Rename the field to `tag` (short form wins). Sweep `initDrainStateTag` → `initTag`, `readDrainState` (already short) and the `loomRegistry.initDrainStateTag` `details.call` label.

**Spec edits.** Under C.1: `drain-state-contract.md` Methods preamble (extract the editorial paragraph into a footnote/aside near first mention of `tag`). Under C.2: same page Methods + Fields, plus the `details.call` registry entry, plus `patch-skew-degradation.md` *Per-step isolation* call-site labels, plus `session-only-degraded-state.md`'s edge-case bullet.

**Pros (C.1).** Minimal; preserves the explicit rename rationale without burying it.
**Cons (C.1).** The two-name surface remains.
**Pros (C.2).** Single name everywhere.
**Cons (C.2).** Sweeps every cross-reference; conflicts with the spec's stated reason for the rename (snapshot-key concision at dispatch sites).
**Risks.** C.2 marginally lengthens slash-handler dispatch-site code (`snapshot.tag` → `snapshot.drainStateTag`) which the spec explicitly cites as the reason for the split.

### Option D — Align setter prefixes (drain-state-contract.md)

**Approach.** Pick one of two consistent prefix conventions and apply to both setters:

- **D.1.** State-noun prefixes that encode write semantics: `initDrainStateTag` (first-write only) + `setDrainStateTagDegraded` (or `forceDrainStateTagDegraded`) for the unconditional overwrite.
- **D.2.** Verb-by-effect: keep `markRuntimeDegraded` (action-verb framing) and rename `initDrainStateTag` → `markRuntimeShuttingDown`.

D.2 is the lighter-touch option: it keeps the four-method surface readable as four imperative actions on the registry, and the two methods then symmetrically describe the runtime state they transition to.

**Spec edits.** `drain-state-contract.md` Methods bullets (rename); *Per-step isolation* `details.call` labels in `patch-skew-degradation.md`; *Handler control-flow ordering* references at steps (III)/(V)/(VI); the "all-three-throw corner case" enumeration in the *idempotent* clause.

**Pros.** Symmetric naming makes the first-write vs unconditional-overwrite asymmetry land in prose around the call rather than relying on the prefix.
**Cons.** Touches every cross-reference to either method name.
**Risks.** A `markRuntimeShuttingDown` rename collides with the existing "shutting down" system-note text in `readDrainState`'s arm-(b) note; verify the renamed setter does not visually conflict with the rendered note string at review time.

### Option E — Standardise Group capitalisation (runtime-event-channel.md)

**Approach.** Pick one capitalisation. Section labels at lines 46 and 55 already title-case ("Group A —", "Group B —"); standardise the prose at line 40 ("members in **Group A**" / "**Group B**") and the dedup-key sentence at line 57 ("apply to Group A only" / "no analogue for Group B").

**Spec edits.** Three substitutions in `runtime-event-channel.md`.

**Pros.** Pure substitution; no semantic risk.
**Cons.** None.
**Risks.** None.

### Option F — Pin the numeric-run grammar (provider-error-mapping.md)

**Approach.** Replace the prose definition with a regex plus an explicit boundary statement. A regex of the form `[0-9]+(?:[,_][0-9]+)*` (one-or-more digits, optionally followed by separator-bounded digit groups) closes all three edges:

- A leading or trailing separator (`,123`, `123,`) is excluded — the regex matches `123` only.
- Doubled separators (`1,,2`) are excluded — the regex breaks at the first non-conforming separator and yields two runs (`1`, `2`).
- Two runs joined by any non-`[0-9,_]` character (`1,000-2,000`) are two runs.

State the boundary explicitly: "Two adjacent matches of the regex above are distinct numeric runs; the scan yields all non-overlapping leftmost-longest matches in source order." Add one or two worked examples to the page (e.g. `"prompt is too long: 12,345 tokens (max 8,192)"` → two runs `12345` / `8192`; `"got 1,,234"` → two runs `1` / `234`).

**Spec edits.** `provider-error-mapping.md` *Overflow token-count extraction* paragraph (replace the parenthetical with the regex + boundary statement + worked example).

**Pros.** Mechanically decidable; eliminates the cross-implementation divergence the same paragraph promises against.
**Cons.** None material.
**Risks.** The provider-message corpus must be checked against the chosen regex — if any production message uses non-`,_` thousands separators (e.g. NBSP, period) the grammar will need to admit them or the affected response moves to the `null` fallback.

### Option G — Pin the lexicographic tie-break basis (audit-resolution.md)

**Approach.** State the comparison basis explicitly: "lexicographically-smallest by Unicode codepoint order (equivalently: `<` on the JavaScript string primitive, which compares UTF-16 code units; for inventory `path` fields restricted to the BMP this is identical to codepoint order)." Inventory `path` fields are already constrained to ASCII identifier syntax in practice, so the choice is observable only on hypothetical future extensions, but pinning it now closes the determinism gap the same sentence promises.

**Spec edits.** One clause appended to the *Category-(2) inventory join key* tie-break sentence in `audit-resolution.md`.

**Pros.** Mechanically decidable; one-clause edit.
**Cons.** None.
**Risks.** None.

### Recommendation

Resolve in this order, smallest scope-bounding first so larger renames land on a stable baseline:

1. **Option E** (Group capitalisation) — three substitutions, no semantic risk; clears the easiest defect.
2. **Option G** (tie-break basis) — one clause; closes a correctness gap.
3. **Option F** (numeric-run grammar) — single-paragraph rewrite + examples; closes the other correctness gap.
4. **Option C.1** (move the drainStateTag/tag rationale to a footnote) — same page, no rename sweep.
5. **Option D.2** (align setter prefixes: `markRuntimeShuttingDown` + `markRuntimeDegraded`) — multi-site sweep but contained to the drain-state cluster.
6. **Option B** (reserve "arm" for dispatch branches) — multi-site sweep; lands cleanly after D.2 has settled the method-name surface it cites.
7. **Option A.1** (state family↔category identity in prose, keep both numberings) — minimal-touch resolution. Defer A.2 (renumber families to letters) unless the upstream "step-2b branch (4)/(5) route to each other's inverse family" finding adopts a compatible renumbering, in which case fold the two renames into one sweep.

Edge cases the implementer must watch:

- Under Option B, the *unset tag fallback* clause in `patch-skew-degradation.md` uses "two-arm" to mean both "the closed value set sub-step 1 pins" and "the dispatch-branch enumeration". Preserve the first meaning under a new term (e.g. "two-value tag set") even as the second migrates to keep "arm".
- Under Option D.2, the rendered system-note string `"loom /<name>: extension shutting down"` (arm-(b)) is operator-visible and unchanged by the method rename; verify no review reader assumes the rename propagates to the note text.
- Under Option F, the regex must be applied with leftmost-longest, non-overlapping matching to make "exactly two numeric runs" deterministic; spell this out alongside the regex itself.

## Relationships

- T044 "Family-(5) malformed-marker per-clause `<symptom>` token requirement is asserted derivatively but never normatively pinned" - same-cluster (both touch family-(5) discriminator semantics; resolve independently)
- T058 "Step-2(b) family→branch correspondence inverts at the family-distinctive arms" - decision-overlap (any family-numbering change here cascades into the branch numbering in step-2b; resolve the family numbering first)
- T117 "Runtime-event channel: undefined "occurrence" vs "origin"; PIC-1 pure-read MUST has no observable projection; per-site mask-domain table split from CIO" - same-cluster (sibling `runtime-event-channel.md` clarity issue; resolve independently)

---

# T051 - Shard-12 hidden assumptions: non-UTF-8 source decode step; process-global `pi.on` events with no origin marker

**Original heading:** Shard-12 hidden assumptions: non-UTF-8 source "fails as a parse failure" without a detection step; process-global `pi.on` events with no origin marker
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Two load-bearing hidden assumptions are asserted without naming the mechanism that establishes them.

**(1) Non-UTF-8 source → parse failure.** `audit-resolution.md` §*Source-file encoding* states that files in any non-UTF-8 encoding (UTF-16 LE/BE, UTF-32, legacy non-Unicode) "fail the audit … as a parse failure, on the same footing as a syntax error raised by the audit's own walker." The chain from "wrong encoding" to "parse failure" is unstated. A strict UTF-8 decoder rejects invalid byte sequences as a *decode* error (raised before any parse step runs); a tolerant decoder may substitute replacement characters and hand a syntactically-plausible mojibake string to the walker, which on BOM-less UTF-16 source (with its NUL-byte-interleaved Latin-1 leaf characters) can plausibly produce no syntax error at all. The spec leaves an implementer free to pick either decode posture, with different observable audit outcomes on the same input file. Adjacent prose calls out that `diagnostics.md`'s `invalid-encoding` diagnostic requires a byte offset from a decode step — a second consumer of the decode step that is also unspecified.

**(2) `pi.on` process-global / no-origin-marker presupposition.** `conversation-drive.md` PIC-18 states that `pi.on` events are "process-global and carry no per-session origin marker," and identifies that property as load-bearing in two places: it justifies the global-listener / no-detach design (cross-fire from an unrelated session is harmless because the captured `ctx.signal` is non-aborted), and it bars `pi.on("agent_end", …)` as a query-completion signal in §*Error detection*. This is a behavioural property of Pi that no `ExtensionAPI` type encodes. `version-bump-step2.md`'s editorial-review checklist routes other comparably-unpinned `pi.on` properties to per-bump review (item (v) for event delivery and per-handler `ctx.signal` freshness, item (j) for turn liveness), but no item routes the process-global / no-origin-marker property itself. A future Pi minor that added a per-session origin field to event payloads — or that scoped event delivery to the session whose handler is mid-turn — would silently invalidate the bar against `pi.on("agent_end", …)` as a completion signal and the cross-fire-harmless argument, with no build-time or load-time signal.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/audit-resolution.md` — §*Source-file encoding* (edited — add decode-validation step)
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — PIC-18 + §*Error detection* (read-only — the presupposition statement is already correct; only its routing is missing)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — *Editorial-review checklist for unpinned host presuppositions* (edited — add a new item)
- `docs/spec_topics/diagnostics/diagnostic-shape.md` (or wherever `invalid-encoding` is defined) — read-only (the decode step in (1) must surface the byte offset this diagnostic consumes)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(No `plan.md` or `plan_topics/` exists in this project.)

## Consequence

**Severity:** correctness

For (1): two reasonable implementers will produce divergent audit outcomes on the same non-UTF-8 input — one fails as expected, the other silently walks mojibake. For (2): a Pi minor that introduces a per-session origin marker on `pi.on` payloads, or scopes event delivery per-session, silently invalidates the global-listener and `agent_end`-as-non-completion-signal arguments with no detection at bump time.

## Solution Space

**Shape:** multiple
**State:** shaped

Resolve in the order below. Option A is scope-bounded to a single page and lands cleanly without touching the checklist; doing it first leaves Option B with a stable baseline.

### Option A — Pin the strict-UTF-8 decode step in `audit-resolution.md`

**Approach.** Add a sentence to the §*Source-file encoding* paragraph naming the decode step explicitly: each in-scope file is decoded as strict UTF-8 (BOM stripped if present) before parsing, and a decode error on an invalid byte sequence is what produces the "parse failure" outcome the paragraph already routes to *Infrastructure-failure handling* (i).

**Spec edits.**
- `docs/spec_topics/pi-integration-contract/audit-resolution.md` §*Source-file encoding* — insert one sentence after "UTF-8 with BOM is permitted (the BOM is stripped before parsing)" stating that the implementation MUST decode each in-scope file with a strict UTF-8 decoder that raises on any invalid byte sequence (lone surrogates, overlong forms, truncated multi-byte sequences, or any sequence not in the UTF-8 grammar) before invoking the parser; the decode error is the mechanism that surfaces the "parse failure" outcome the paragraph already specifies, and the decoder MUST report the zero-based byte offset of the first invalid sequence (the value consumed by `diagnostics.md`'s `invalid-encoding` diagnostic, per the cross-reference below).
- Add a forward cross-reference to wherever `invalid-encoding` is defined, so the byte-offset obligation is jointly stated.

**Pros.**
- One-page edit; no checklist disturbance.
- Closes the open implementer choice that drives the divergence.
- Simultaneously closes the byte-offset half of the related `invalid-encoding` diagnostic hidden assumption.

**Cons.**
- Pins a decoder posture (strict-UTF-8) that the implementation has not yet committed to in code — though it is the only posture consistent with the existing "fail as a parse failure" outcome.

**Risks.**
- If `diagnostics.md` ends up specifying a different invalid-encoding shape (e.g. line/column instead of byte offset), the two edits must reconcile.

### Option B — Add a process-global / no-origin-marker presupposition item to the editorial-review checklist

**Approach.** Extend `version-bump-step2.md`'s checklist with a new SHOULD-level item (a new letter following (ad)) routing the `pi.on` process-global / no-origin-marker property to per-bump editorial review, on the same shape as items (v), (j), (ac), etc. The item names the two consumers (the global-listener / no-detach design and the bar against `pi.on("agent_end", …)` as a completion signal) so a contributor can recognise what breaks if the property is falsified.

**Spec edits.**
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — insert a new item (e.g. (ae)) of the standard checklist shape: cite PIC-18 in `conversation-drive.md`; require the contributor to confirm against the candidate Pi minor that `pi.on` events remain delivered to every subscribed extension regardless of which session is active and carry no per-session origin field on the payload; flag that a regression would falsify both the global-listener / no-detach design and the `agent_end`-as-non-completion-signal bar; route remediation to amending PIC-18 in the same edit; tag SHOULD-level with the standard escalation clause for when Pi exposes a typed contract that step 2(a)'s surface-inventory probe can mechanically verify.
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` PIC-18 — add a back-link to the new checklist item, matching the cross-reference style other PIC presuppositions use (e.g. the `complete()` presupposition's link to item (u)).

**Pros.**
- Brings the no-origin-marker property under the same per-bump audit discipline every comparable unpinned `pi.on` property already enjoys.
- Single-item insertion in an established list; minimal blast radius.
- Closes the asymmetric-routing gap the finding identifies (other PIC-18-adjacent properties are routed; this one is not).

**Cons.**
- Grows the checklist by one item; the contributor obligation surface widens by one entry.

**Risks.**
- The new item's wording must distinguish *process-global delivery* (the load-bearing property) from *event-firing in general* (already covered by (v)); if the two get conflated, (v) absorbs the new item and the no-origin-marker property again drops out.

### Recommendation

Do A first, then B. A is scope-bounded to a single paragraph on a single page and has no interaction with B; landing it first gives B a clean baseline (no audit-resolution.md churn pending) and lets the two halves loop independently. The natural order is:

1. **A** — Pin the strict-UTF-8 decode step in `audit-resolution.md` §*Source-file encoding* with the byte-offset clause for the `invalid-encoding` diagnostic.
2. **B** — Add the new checklist item in `version-bump-step2.md` and the reciprocal back-link from PIC-18.

Edge cases the implementer must watch:
- For A: BOM stripping must precede the strict-UTF-8 validation, not follow it (a UTF-8 BOM is a valid 3-byte sequence under strict UTF-8 but is conventionally stripped); UTF-16 / UTF-32 BOMs are themselves invalid UTF-8 prefixes and so are caught by the strict decode without a special carve-out.
- For B: the new item's audit predicate is "events still delivered process-globally AND payload carries no per-session origin field." Falsification of either half independently invalidates a distinct PIC-18 argument; the item must state both, not just one.

## Relationships

- T030 "Three unsourced Pi-SDK behavioural assertions in the diagnostics cluster" - co-resolve (Option A's byte-offset clause closes the third sub-clause of this finding)

---

# T052 - Item (e)/(r) `dist/*.js` baseline source unspecified — diff is unperformable after the candidate install

**Original heading:** loom-1.0-pinned `dist/*.js` baseline ("from" side of item (e)/(r) diffs) not shown to be obtainable alongside the candidate tree
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`version-bump-step2.md` items (e) and (r) instruct the contributor to diff specific `dist/*.js` files (`dist/core/agent-session.js`, `dist/core/messages.js`, plus the `dist/modes/*/*.js` glob) between the loom-1.0 Pi-SDK pin and the candidate minor. Item (e) names the "from" side explicitly as "[the loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin)'s `dist/*.js` snapshot on `@earendil-works/pi-coding-agent`" and adds the disclaimer "regardless of what the contributor happens to have installed locally" — i.e. the local `node_modules` is deliberately *not* declared to be the baseline source.

No step on this page or on `version-bump-intro.md` / `host-prerequisites.md` says where that pinned baseline snapshot is obtained or retained. The single operation the procedure does describe — `version-bump-intro.md` step 1's "Install the candidate `@earendil-works/pi-coding-agent` minor (and its lock-step siblings)" — overwrites the only on-disk copy the contributor has (`node_modules/@earendil-works/pi-coding-agent/`). Once step 1 runs, the only `dist/*.js` tree on the contributor's machine is the candidate's; the "from" side of every (e)/(r) diff has been destroyed. No retained snapshot directory, package cache, `npm pack` / tarball recipe, install-both procedure, or VCS-tracked baseline copy is named anywhere in the bump procedure, and the loom repo does not commit a `dist/*.js` baseline either.

The audit is therefore literally unperformable as written: a contributor following the steps in order has no "from" tree to diff against by the time items (e)/(r) execute. The conservative-posture rule in item (e) compounds the consequence — without a baseline, the auditor cannot positively demonstrate the non-overlap property holds, so every bump records `fail` and triggers the defensive runtime mutex remediation regardless of whether the candidate minor actually broke the cooperative-`await` chain.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — items (e) and (r) (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-intro.md` — step 1 install step (option-dependent — only edited if baseline acquisition is ordered against the install)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — Pi SDK pin paragraph (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(No `plan.md` is present in the repository.)

## Consequence

**Severity:** correctness

Two contributors performing the bump audit reach divergent results: one who happens to have the pinned tree retained in a side directory from a prior install can perform the diff; one following the documented procedure in order cannot, defaults to the conservative-posture `fail`, and ships an unnecessary recovery mutex on every bump. The supposed mechanical gate (a `dist/*.js` text diff) silently degrades to "always fails," and the (e)/(r) audits lose their discriminatory power — every candidate looks broken regardless of whether it actually is.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — On-demand registry fetch via `npm pack`

**Approach:** Add a one-line baseline-acquisition step before items (e)/(r) execute that materialises the pinned tree into a scratch directory using the published tarball.

**Spec edits:** In `version-bump-step2.md`, just above item (e)'s opening sentence, insert a short *Baseline acquisition* paragraph: "Before running items (e) and (r), the contributor MUST materialise the [loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin)'s `dist/*.js` tree into a scratch directory by running `npm pack @earendil-works/pi-coding-agent@<pinned-version>` and extracting the resulting tarball; the extracted `package/dist/` tree is the canonical 'from' side every `dist/*.js` diff on this page reads against, and the locally-installed `node_modules` tree (which holds the candidate minor after step 1) is the 'to' side. The acquisition is per-bump and ephemeral; no in-repo snapshot is retained." Update items (e) and (r)'s "snapshot" wording to cite this paragraph by anchor rather than restating where the baseline comes from.

**Pros:** No repo-size cost; no maintenance of a checked-in baseline; works for any pinned version the npm registry still serves; trivially scriptable.

**Cons:** Requires network access at bump time (the candidate install already requires this, so no new precondition); depends on the pinned version remaining published on the registry (a deliberate unpublish would break re-auditing of a prior bump).

**Risks:** A future Pi-side switch to a private registry, or a deliberate yanked-version policy, makes the baseline unreachable; the recipe should also note that the pinned tarball MUST be fetched *before* the candidate install overwrites the lockfile / changes the resolved registry, in case the registry source is per-version-resolved.

### Option B — Retained in-repo baseline snapshot

**Approach:** Commit the load-bearing subset of the pinned `dist/*.js` files (or the full pinned `dist/` tree) to the loom repo under a sidecar path (e.g. `test/fixtures/pi-sdk-pin-dist/`), and rotate the snapshot in the same edit that lands every Pi minor bump.

**Spec edits:** In `version-bump-step2.md`, add a *Baseline snapshot* paragraph pointing at the in-repo path; in `version-bump-triggers.md` step 5, add a grouping (v) (or extend grouping (i)) for the snapshot directory, with its own per-bump-edit obligation co-edited under [step 2(b) branch (2)](./version-bump-step2b.md#bump-step-2b-promote)'s catch-all. Add an inventory-audit exclusion for the snapshot path so it does not trip the inventory-closure audit.

**Pros:** Bump is fully offline-reproducible; an old bump can always be re-audited against its own baseline; no registry dependency; the baseline is reviewable on the bump commit diff.

**Cons:** Repo-size cost (the full `dist/` tree is non-trivial); inventory-closure audit needs a new exclusion; introduces a sixth source-of-truth site that step 5 must keep in lock-step with the pin; risks staleness if the rotation is missed (a stale snapshot makes every diff look broken).

**Risks:** Snapshot becomes the de-facto Pi-SDK pin reference instead of `package.json`; a contributor who edits the snapshot without bumping the pin literal (or vice versa) creates silent skew that no current gate catches.

### Option C — Install-both via per-version `--prefix`

**Approach:** Add a baseline-acquisition step that installs the pinned version into a scratch directory using `npm install --prefix <tmpdir> @earendil-works/pi-coding-agent@<pinned-version>` (or equivalent), keeping the candidate install in the loom repo's own `node_modules`.

**Spec edits:** Same shape as Option A but with `npm install --prefix` instead of `npm pack` + extract; the diff target becomes `<tmpdir>/node_modules/@earendil-works/pi-coding-agent/dist/`.

**Pros:** Mirrors the install path the candidate already uses; npm handles tarball fetch and extraction; the scratch tree is structurally identical to the candidate tree, simplifying tooling.

**Cons:** Heavier than `npm pack` (also resolves and installs the lock-step siblings and their transitive deps); requires a throwaway `node_modules/` for the baseline; same registry-availability dependency as Option A.

**Risks:** Same registry-availability risk as Option A; additional risk that `--prefix` install may pull a different transitive-dep set than the original bump did, but this does not affect the `dist/*.js` files of `@earendil-works/pi-coding-agent` itself.

### Recommendation

Adopt **Option A** (on-demand `npm pack` baseline). It carries no repo-size cost and no rotating-snapshot maintenance burden, requires no new entries in `version-bump-triggers.md` step 5's grouping table, and reuses the registry channel the candidate install already depends on — so no new precondition is introduced. The implementer should pin the recipe to the `npm pack` form rather than `npm install --prefix` (Option C) to avoid pulling the lock-step siblings' transitive dep tree pointlessly. The recipe must additionally state: (1) the scratch directory and any extracted tarball are ephemeral and MUST NOT be committed; (2) the baseline acquisition MUST run *before* the candidate install in `version-bump-intro.md` step 1, or — if ordered after — MUST use an explicit `@<pinned-version>` specifier in `npm pack` rather than relying on registry resolution from the loom `package.json` (which step 1 will have moved by the time items (e)/(r) run); (3) the `<pinned-version>` token is sourced from the pre-bump value at the [loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin) anchor, captured before the bump's step 4 rewrites it.

## Relationships

- T057 "Item (e) fail predicate: operator-precedence ambiguity, single-sentence packing, and sub-outcomes buried mid-prose" - same-cluster (both touch item (e); independent resolutions)

---

# T053 - Item (e.ii) call-graph reachability audit names no analysis technique and leaves "per-mode entry point" undefined

**Kind:** implementability, assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

Item (e.ii) at `#bump-checklist-slash-dispatch-serialisation-ii` in `version-bump-step2.md` directs the auditor to enumerate every `session.prompt(...)` call site reachable from the "per-mode entry point" under the `dist/modes/*/*.js` glob, but states the procedure only as a prohibition (do not rely on literal substring grep). It never defines what a `dist/modes/<mode>/*.js` file's per-mode entry point is, and never names an acceptable positive reachability-analysis technique. Because candidate-minor bundles may be minified or re-bundled, two auditors can pick different starting symbols and traversal disciplines and so arrive at different reachable call-site sets. That flips the (e.ii) `pass`/`fail` verdict, which determines whether the defensive per-extension-instance recovery mutex must ship in the same edit as the bump.

## Solution approach

Clarify item (e.ii) at `#bump-checklist-slash-dispatch-serialisation-ii` in `version-bump-step2.md` to define the per-mode entry point of a `dist/modes/<mode>/*.js` file — the mode-runner symbol Pi invokes to start the mode, together with the module-top-level statements evaluated on import, so that a setup-time callback registration such as `Editor.onSubmit` is in scope. Add a positive reachability technique rooted at that entry point and state how the recorded trace survives bundler renaming, replacing the current prohibition-only framing.

## Solution constraints

- Out of scope: recovery-mutex acquisition and teardown semantics, owned by T118.

## Relationships

- T118 "Recovery-mutex acquisition semantics and teardown-budget interaction undefined" - same-cluster (independent gap in the same item (e), no shared edit)
- T057 "Item (e) fail predicate: operator-precedence ambiguity, single-sentence packing, and sub-outcomes buried mid-prose" - co-resolve (promoting (e.ii) to a surface-level checklist entry is a natural site for the per-mode-entry/analysis-technique pin)

---
# T054 - `peerDependencies` literal-read test assertion shape and `CAPABILITY_OBLIGATIONS` member-anchor list are unstated at the sites that introduce them

**Original heading:** Step 4 `peerDependencies` literal-read test assertion shape and `CAPABILITY_OBLIGATIONS` member anchors unstated
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Two distinct unstated-contract gaps in the bump procedure for the Pi-SDK pin, each in a different file:

1. **`peerDependencies` literal-read assertion shape.** `version-bump-step2b.md` step 4 names the test only as "the `peerDependencies` literal-read test [that] enforces the joint move" — it does not state the test's operands or its equality kind. The actual contract is implied by `host-prerequisites.md`'s *Manifest lock-step* sub-paragraph ("the four `@earendil-works/*` entries … MUST literally equal the canonical `~0.75.5` range") but step 4 itself does not cite it. A reasonable implementer reading step 4 in isolation could write a four-way mutual-equality assertion (all four entries equal to each other, common minor unconstrained) instead of a four-way equality against the spec literal at `#pi-sdk-pin`; both interpretations satisfy "joint move" but only the second is the lock-step gate `host-prerequisites.md` describes.

2. **`CAPABILITY_OBLIGATIONS` member-anchor list.** `version-bump-step2.md` step 2(a) requires the constant to be "a closed array of the seven anchor IDs [`sdk-cap-slash-command-registration`] … [`sdk-cap-binder-llm-model`]" — only the first and last anchor IDs are stated; the middle five (items 2–6) are elided behind the ellipsis. The full ordered set is the `<a id>`-anchor sequence on items 1–7 of `capability-inventory-items.md`, but step 2(a) does not cite that file as the source of truth for the constant's contents and ordering. An implementer cannot construct `CAPABILITY_OBLIGATIONS` from step 2(a) alone, and there is no stated coupling rule that would catch drift between the constant's member order and the capability-inventory items if a future edit renumbered the items.

The two halves are independent (different files, different sentences, different remedies) and are decomposed below into two options that should be resolved sequentially.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2b.md` — step 4 ("Update the version pin in `peerDependencies` …") (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — step 2(a) (positive direction — literal-read) (edited)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — `#pi-sdk-pin`, `#pi-sdk-pin-manifest-lock-step` (read-only; cited target)
- `docs/spec_topics/pi-integration-contract/capability-inventory-items.md` — items 1–7 anchor sequence `sdk-cap-slash-command-registration` … `sdk-cap-binder-llm-model` (read-only; cited target)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project's `plan.md` and `plan_topics/` carry no leaves yet — only the template, conventions, and an empty coverage matrix.)

## Consequence

**Severity:** correctness

Two implementers reading step 4 of `version-bump-step2b.md` can write different `peerDependencies` literal-read tests (four-way mutual equality vs four-way equality against the spec literal); only the second is the lock-step gate the spec elsewhere relies on, so a wrong choice ships a green test that does not catch divergence between the manifest and the pin anchor. Two implementers populating `CAPABILITY_OBLIGATIONS` from step 2(a) alone cannot reconstruct items 2–6 from the elided range and may order the constant inconsistently with `capability-inventory-items.md`, breaking the implicit anchor-list coupling the seven-cardinality assertion presupposes.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding decomposes into two independent obligations in two different files. Resolve the smaller, scope-bounding obligation (Option A — anchor-list citation, single sentence in one file) first, then the assertion-shape obligation (Option B — multi-clause edit in another file). Each is separately reviewable.

### Option A — State `CAPABILITY_OBLIGATIONS`'s member anchors by sourcing them from `capability-inventory-items.md` items 1–7

**Approach:** Edit `version-bump-step2.md` step 2(a) where it currently describes `CAPABILITY_OBLIGATIONS` as "a closed array of the seven anchor IDs [`sdk-cap-slash-command-registration`] … [`sdk-cap-binder-llm-model`]". Replace the ellipsis with an explicit normative source-of-truth pointer: the ordered seven anchor IDs are the `<a id>` values on items 1–7 of `capability-inventory-items.md`, in that exact order (`sdk-cap-slash-command-registration`, `sdk-cap-prompt-conversation-drive`, `sdk-cap-subagent-isolated-session`, `sdk-cap-tool-registration-gating`, `sdk-cap-cancellation-propagation`, `sdk-cap-custom-message-renderer`, `sdk-cap-binder-llm-model`). Add a one-clause coupling rule: a re-ordering or renaming of items 1–7 in `capability-inventory-items.md` MUST be co-edited with `CAPABILITY_OBLIGATIONS` in the same commit (this rides on the existing step 2(b) branch (2) catch-all co-edit obligation, which already covers add/remove cases but does not mention re-ordering).

**Spec edits:** `version-bump-step2.md` step 2(a) — one sentence rewritten plus the seven anchor IDs listed inline (or a one-line citation if the inline list is judged too noisy); no edit to `capability-inventory-items.md`.

**Pros:**
- Removes the ellipsis and makes the constant constructible from step 2(a) alone.
- Single source of truth (the inventory items) — anchors are not duplicated, only cited.
- Catches a drift mode (item re-ordering without constant re-ordering) the current co-edit obligation does not name.

**Cons:**
- Adds seven anchor strings to a paragraph already dense with cross-references.

**Risks:**
- If future contributors elaborate `capability-inventory-items.md` (e.g. split an item, insert a new one), the coupling rule must trigger a `CAPABILITY_OBLIGATIONS` re-ordering edit — already covered by step 2(b) branch (2)'s catch-all, just made explicit here.

### Option B — State the `peerDependencies` literal-read assertion's operands and equality kind at step 4

**Approach:** Edit `version-bump-step2b.md` step 4 to state the test contract explicitly rather than gesturing at it. The assertion compares each of the four `@earendil-works/*` entries in `package.json#peerDependencies` (`pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`) against the canonical Pi-SDK-pin literal at `host-prerequisites.md#pi-sdk-pin`, using string-equal (byte-equal) comparison; the test passes iff all four entries are byte-equal to that single source-of-truth literal. The `typebox` entry is excluded from this iteration (it is pinned to `"*"` and asserted separately per the `typebox` sub-paragraph). The "joint move" property follows from this shape — if any one entry diverges from the pin literal the test fails red — but is not the assertion itself. Add a one-clause cite back to `host-prerequisites.md#pi-sdk-pin-manifest-lock-step` so step 4 carries the contract sentence rather than its only the procedural verb.

**Spec edits:** `version-bump-step2b.md` step 4 — replace the parenthetical "(the `peerDependencies` literal-read test enforces the joint move)" with a two-sentence contract statement plus the back-cite; no edit to `host-prerequisites.md`.

**Pros:**
- An implementer reading step 4 in isolation can write the correct test.
- Eliminates the four-way-mutual-equality vs four-way-against-literal ambiguity.
- The `typebox` exclusion clause forecloses an implementer extending the iteration to all five Pi-bundled packages.

**Cons:**
- Restates a contract `host-prerequisites.md` already pins; the cite-and-restate is mild duplication that the manifest-lock-step paragraph's single-source-of-truth posture intentionally avoids elsewhere.

**Risks:**
- If `host-prerequisites.md#pi-sdk-pin-manifest-lock-step` is later revised (e.g. the four-package set widens or the equality kind is loosened), the step-4 restatement must be co-edited — but the manifest-lock-step paragraph is itself the lock-step source, so this is the same maintenance discipline already in place for every other restatement-by-cite site.

### Recommendation

Apply both options, in the order A → B. Option A is a single-file, single-paragraph edit with no cross-file coordination; landing it first stabilises the `CAPABILITY_OBLIGATIONS` source-of-truth pointer that step 4's surrounding co-edit obligations already lean on. Option B is the larger edit and is best applied against a baseline where step 2(a) already states its constant's contents explicitly. Edge cases an implementer must watch: under Option A, ensure the inline anchor list (if chosen over a bare cite) stays in the same order as `capability-inventory-items.md` items 1–7 — list reversal would silently break the constant; under Option B, the typebox-exclusion clause is normative and MUST be retained even if a future Pi minor changes the bundled-package convention (the deliberate-deviation rationale in `host-prerequisites.md` is what makes the four-package iteration the correct scope).

## Relationships

- T056 "Branch (2) "promote" co-edit obligation is explicitly non-exhaustive across multiple files (unbounded manual sweep)" - decision-overlap (Option A's coupling rule rides on step 2(b) branch (2)'s catch-all co-edit obligation; if that obligation is replaced by a closed enumeration per that finding's suggested fix, Option A's re-ordering clause must be added to the closed enumeration in the same edit)
- T060 "Version-bump procedure: four MUST/SHOULD obligations have no verifiable acceptance criterion" - same-cluster (both findings concern testability of the bump procedure's mechanical gates; resolve independently)

---

# T055 - Item (i) leaves the loom-side overflow-signature regex update unspecified, and the SHOULD-item fail disposition is asymmetric across items (f)–(ad)

**Original heading:** Provider overflow-signature fixture red has no defined loom-side signature-update resolution; falsification disposition inconsistent across SHOULD items
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The step-2 editorial-review checklist in `version-bump-step2.md` carries two distinct defects in its SHOULD-level items (f) through (ad).

**(A) Item (i) — provider-overflow signature.** Item (i) requires the contributor to re-run the provider-error fixtures and, separately, to keep the test corpus current by "re-capturing each provider's error-body text when it publishes an error-format or API-version change." It is silent on the third edit a real provider rewording demands: updating the *loom-side overflow signature regex* in the Provider-error-mapping table on `provider-error-mapping.md` (the four regexes such as `/(prompt is too long|exceeds .* context window|maximum context length)/i`). When the corpus is refreshed to the new wording but the loom-side regex is left untouched, the fixture stays red — or worse, ships green against a stale corpus and production silently downgrades real `ContextOverflowError`s to `TransportError` with `tokens_used`/`tokens_limit` null, exactly the failure mode `provider-overflow-wording-presupposition` warns about. The cited presupposition paragraph names the symptom but routes resolution to item (i), which then does not author it.

**(B) Items (f)–(ad) — fail-disposition asymmetry.** Five of the twenty-five SHOULD items (g, j, q, v, ad) carry an explicit fail-disposition sentence of the form *"If falsified, surface the divergence on the bump commit so [the cited paragraph] can be amended in the same edit; PIC does not author the loom-side recovery here."* The other twenty items (f, h, i, k, l, m, n, o, p, r, s, t, u, w, x, y, z, aa, ab, ac) describe only the silent-failure consequence (*"would surface as a runtime `TypeError` at the subagent spawn site…"*, *"would silently invert the predicates…"*) and then jump straight to the SHOULD-to-build-time-pin escalation boilerplate, leaving unspecified what the auditor records on a fail, whether a same-edit spec amendment is required, and whether loom-side recovery is in scope for the bump. Two conforming contributors auditing the same SDK regression on, say, item (n) will reasonably disagree on whether to record `fail`, on whether to amend `agentsession-interface` in the same commit, and on whether they owe a runtime workaround.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — Editorial-review checklist, items (f)–(ad) and the introductory preamble (edited)
- `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — *Provider error mapping* table and the *Provider-owned-wording presupposition* paragraph (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project plan exists at `docs/plan.md` but its Horizontal, MVP, and Vertical sections all read *"No leaves yet — author per the template"*; there are no leaf pages under `docs/plan_topics/` other than the template and conventions files. Nothing to update.)

## Consequence

**Severity:** correctness

For (A), a contributor who follows item (i) literally — re-runs the fixtures, re-captures the corpus — and stops there will ship a bump in which the loom-side regex no longer matches the provider's reworded overflow body, silently misclassifying real `ContextOverflowError`s as `TransportError` with null token fields. For (B), the asymmetry causes per-item-divergent auditor behaviour on twenty of twenty-five SHOULD items: the recorded outcome shape, the same-edit spec-amendment obligation, and the scope of loom-side recovery are all reader-inferred rather than pinned.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles two independent obligations. Resolve them sequentially: the item-(i) edit is bounded (one bullet, one cross-reference), the disposition consolidation is a sweep across the entire checklist. Land (A) first so (B)'s preamble edit lands on a checklist whose items already speak a consistent post-fail vocabulary.

### Option A — Add the signature-update obligation to item (i)

**Approach.** Extend item (i)'s body with a sentence pinning the fixture-red resolution: a mismatch between the captured provider error body and the loom-side overflow signature in the Provider-error-mapping table is resolved by updating that table's regex in the same edit as the corpus re-capture.

**Spec edits.**
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` item (i): after the "responsibility of the contributor performing the bump" sentence, append: *"A fixture red whose root cause is that the re-captured provider body no longer matches the loom-side overflow signature in the Provider-error-mapping table on `provider-error-mapping.md` is resolved by updating that row's overflow-signature regex in the same edit as the corpus re-capture; the regex MUST end the bump matching the re-captured body."*
- Optionally cross-link from the *Provider-owned-wording presupposition* paragraph in `provider-error-mapping.md` to the new sentence (anchor on item (i)'s existing `bump-checklist-provider-overflow-wording` id).

**Pros.** Closes the production-silent-misclassification gap with one bullet. No structural change to the checklist.

**Cons.** Adds yet more prose to item (i), which is already a long bullet. Does nothing for the (B) asymmetry.

**Risks.** None — the edit is local and the new sentence is a refinement of the existing re-capture obligation, not a new audit step.

### Option B — Hoist one fail-disposition into the preamble

**Approach.** Add a single fail-disposition clause to the checklist's introductory paragraph (the one that already pins the per-item outcome shape `pass / fail / N/A with one-line rationale`) covering all items (f)–(ad), and delete the per-item fail-disposition sentences from (g), (j), (q), (v), (ad) so the only remaining per-item fail prose is the genuinely item-specific recovery in item (e).

**Spec edits.**
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` step-2 preamble: after the existing "MUST record the per-item audit outcome … in the bump commit message" sentence, add: *"On a `fail` outcome for any of items (f) through (ad), the contributor MUST (1) record the divergence in the bump commit message under the failing item, (2) amend the cited presupposition paragraph in the same edit so the spec no longer asserts the falsified property, and (3) treat loom-side recovery as out of scope for this bump unless the failing item's body says otherwise — PIC does not author the loom-side recovery here. Item (e) is the sole exception: its fail outcome is resolved per the item-(e) recovery mutex prescribed in its body."*
- Delete the *"If falsified, surface the divergence on the bump commit so [X] can be amended in the same edit; PIC does not author the loom-side recovery here"* sentence from items (g), (j), (q), (v), and (ad).
- Leave item (i)'s prose untouched (Option A already covers item (i)'s item-specific recovery).

**Pros.** Replaces twenty-five reader-inferences with one normative sentence. Removes ~250 words of per-item duplication. Brings the silent-twenty items under the same disposition vocabulary as the explicit-five.

**Cons.** Editorial sweep touches the head of every (f)–(ad) item indirectly (they all now route through the preamble). Item (e)'s exception must be called out explicitly because its body authors a real loom-side recovery (the per-extension-instance serialisation mutex).

**Risks.** The preamble must be careful to exclude items whose body genuinely authors a loom-side recovery — at loom 1.0 that is item (e) alone, and post-Option-A, item (i)'s signature-update edit is an in-bump action distinct from "loom-side recovery" so does not need carving out. A future SHOULD item that does author loom-side recovery would need to call that out in its body and override the preamble; the preamble sentence above already permits this with *"unless the failing item's body says otherwise"*.

### Recommendation

Land both options, in order **A then B**. Option A is the smaller, scope-bounding edit and closes the production correctness gap on its own; landing it first means Option B's preamble can speak about disposition uniformly without needing a special case for item (i). Option B then collapses the asymmetric prose across twenty-five items into one preamble clause.

Implementer edge cases to watch:
- For Option A, the regex update lives in `provider-error-mapping.md` but the obligation lives in `version-bump-step2.md` — the same-edit constraint is what makes the pair safe, so do not split the regex update into a follow-up commit.
- For Option B, the deletion sweep must touch exactly items (g), (j), (q), (v), (ad) and no others; item (e)'s much longer fail-recovery prose stays, and items (i)/(u)/(aa)/(ab) have re-run-fixture prose that is not a fail-disposition and must not be touched.

## Relationships

- T114 "pi-ai provider-error surface (status, body, network-failure delivery) is undefined" - same-cluster (same `provider-error-mapping.md` page, independent defect)

---

# T056 - Branch (2) "promote" co-edit obligation is explicitly non-exhaustive across multiple files (unbounded manual sweep)

**Original heading:** Branch (2) "promote" co-edit obligation is explicitly non-exhaustive across multiple files (unbounded manual sweep)
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** scope, testability, cruft
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`version-bump-step2b.md` branch (2) ("Promote the surface to an inventory entry") imposes a co-edit obligation that requires the bump contributor to update **every** natural-language `"seven"` / `"seven-capability"` / `"seven capability obligations"` / `"seven obligations"` cardinality reference appearing in two named sections (the SDK capability inventory and the Inventory-closure audit) plus a third site in `spec.md`. The text then closes with: *"The site enumeration above is illustrative of the loom 1.0 pin and explicitly non-exhaustive: the obligation is on every natural-language 'seven'-cardinality reference in the two sections above, regardless of whether it appears on the loom 1.0-pin enumeration."*

Two coupled defects follow. First, completeness is unverifiable: neither a contributor nor a reviewer can mechanically confirm that "every" such reference has been updated, because the obligation deliberately refuses to commit to a closed list. The only mechanical gate the spec names — step 2(a)'s `CAPABILITY_OBLIGATIONS.length === 7` assertion — guards the integer literal `7`, not natural-language prose; the spec itself flags this gap ("contributor convention rather than … the assertion's inspection"). Second, the quoted "loom 1.0 pin" exemplars (preamble sentence, *seven-capability cardinality claim* paragraph, *Re-validation on `peerDependencies` widening* paragraph, *Target surface categories* paragraph, the `spec.md` Orientation Prerequisites bullet) bake current prose verbatim into a procedure page; they will drift silently as the cited sections are reworded, leaving the page asserting that quoted strings exist at sites where they no longer do.

The combined effect: a bump from 7 → 6 (or 7 → 8) capabilities ships with a procedure that cannot be discharged to completion and an enumeration of phrases that already does not match the current corpus the next time someone edits either section.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2b.md` — branch (2) prose and the "non-exhaustive" qualifier (edited)
- `docs/spec_topics/pi-integration-contract/inventory-audit-intro.md` — PIC-15 "seven named SDK capabilities" preamble; "seven-capability cardinality claim" paragraph; *Target surface categories* "seven capability obligations enumerated below" mention (read-only; cited by branch (2))
- `docs/spec_topics/pi-integration-contract/capability-inventory-items.md` — *Re-validation on `peerDependencies` widening* "seven obligations above" (read-only; cited by branch (2))
- `docs/spec/overview-and-orientation.md` — Prerequisites bullet 3 "The seven SDK capabilities the runtime depends on …" (read-only; cited by branch (2))
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — `CAPABILITY_OBLIGATIONS.length === 7` mechanical gate (read-only; reference for the existing mechanical anchor)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project has a `plan.md` and `plan_topics/` directory, but no leaves are authored yet; no `Spec.` cross-references exist that can be impacted.)

## Consequence

**Severity:** correctness

Two reviewers cannot agree on whether a 7→N capability-count bump commit is complete: one accepts updates to the named exemplars, the other demands a wider sweep on the basis of the "every … regardless of whether it appears on the loom 1.0-pin enumeration" clause. The result is either a merged bump that leaves stale `"seven"` prose live against `main` (silent drift between integer literal and prose) or repeated rework cycles per bump. The quoted exemplars will themselves go stale the next time either cited section is reworded, compounding the drift the obligation exists to prevent.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Closed location enumeration plus an enumeration-drift gate

**Approach.** Replace the "every … non-exhaustive" obligation with a closed list of `<file>#<anchor>` locations whose prose must be re-pinned. Drop the verbatim quoted exemplars (anchors are the durable referent; the quoted strings are not). Add a new build-time assertion that fails when a `"seven"` / `"seven-capability"` / `"seven capability"` / `"seven obligations"` token appears in any in-corpus file at a location not on the closed list — i.e. the enumeration *is* the allow-list, and adding new prose at a new site fails the build until the contributor either rewords or extends the enumeration in the same commit.

**Spec edits.**
- `version-bump-step2b.md` branch (2): replace the parenthetical site enumeration with a typed list of `<file>#<anchor>` references and a forward-pointer to the new assertion's name. Delete the quoted exemplars and the "explicitly non-exhaustive" clause. Keep the symmetric removal-case paragraph (7→6) but key it to the same closed list.
- `version-bump-step2.md` (or a sibling step-2 page): add the new `"seven"`-token allow-list assertion alongside `CAPABILITY_OBLIGATIONS.length === N` with the same fail-red posture.

**Pros.**
- Completeness becomes mechanically decidable on every CI run, not just at bump time.
- The closed enumeration is self-maintaining: any drift fails the build with a precise location.
- Removes the stale-exemplar drift vector entirely.

**Cons.**
- Adds a new assertion to spec and to the build; minor expansion of the audit surface.
- A reviewer adding a new `"seven"`-cardinality sentence must remember to extend the allow-list (mitigated: the assertion fires immediately, surfaces the location, and points at the allow-list).

**Risks.**
- The tokeniser must match the canonical phrasings without over-matching ordinary uses of the word "seven" outside cardinality contexts. The allow-list of recognised phrasings must be closed (e.g. `"seven"` followed by `capabilit*` / `obligation*` / `SDK` within a small window, or the exact four phrases), and stated in the assertion's spec.

### Option B — Single source of truth; delete the multi-site prose

**Approach.** Replace every natural-language `"seven"`-cardinality restatement in the two cited sections (and the `spec.md` Orientation bullet) with a cross-reference to a single owning sentence (e.g. "the `N` named SDK capabilities enumerated under [SDK capability inventory]"), where `N` is rendered from the `CAPABILITY_OBLIGATIONS.length` constant by build-time substitution or by a single inline literal that all other sites cite by anchor. Branch (2)'s co-edit obligation collapses to "update the single owning sentence" — the same lock-step pattern host-prerequisites already uses for the Pi-SDK pin literal.

**Spec edits.**
- `inventory-audit-intro.md`: keep one canonical sentence carrying the cardinal; reword the other restatements to cite the canonical sentence by anchor.
- `capability-inventory-items.md`: reword *Re-validation on `peerDependencies` widening* to "the obligations enumerated above" (no count).
- `overview-and-orientation.md`: replace "The seven SDK capabilities" with an anchor-cited paraphrase that does not restate the count.
- `version-bump-step2b.md` branch (2): collapse the co-edit obligation to (i) `CAPABILITY_OBLIGATIONS`, (ii) the integer literal in step 2(a)'s assertion, (iii) the single canonical-cardinality sentence. Delete the multi-site enumeration and the exemplars.

**Pros.**
- Maximum reduction in surface area; eliminates the obligation rather than mechanising it.
- Matches the [Manifest lock-step](https://github.com/.../host-prerequisites.md#pi-sdk-pin-manifest-lock-step) pattern the spec already uses for the SDK pin literal.

**Cons.**
- Loses some local readability: implementers reading `capability-inventory-items.md` no longer see the cardinal inline and must follow an anchor to learn how many obligations there are.
- Requires reworking three pages, not one.

**Risks.**
- The `spec.md` Orientation bullet currently uses the cardinal as a navigational hook ("The seven SDK capabilities …"); the reworded form must remain readable as orientation prose.

### Recommendation

Take **Option A**. The cardinal genuinely is useful inline at several sites (orientation Prerequisites, the PIC-15 preamble, the *Re-validation* paragraph) for readers who do not chase anchors, and Option B's rewording sacrifices that for a problem Option A solves more directly. The new assertion is small (a single grep-based test in the existing `*.assert.ts` family), discharges the completeness obligation mechanically, and lets branch (2) reduce to a typed list of locations.

Edge cases the implementer must watch:
- The recognised-phrase allow-list must be specified in the spec (not left to the test code) so the obligation is auditable from the corpus.
- The assertion must run over the canonical corpus `docs/spec.md` + `docs/spec_topics/**/*.md` + `docs/spec/**/*.md` (per the GOV-17 corpus-glob finding, which is a prerequisite — see Related Findings).
- The capability-removal (7 → 6) case must still work: the allow-list is keyed to phrase shapes (e.g. `"six obligations"` after a bump), not the literal token `seven`. The simplest form is "the cardinal word matching `CAPABILITY_OBLIGATIONS.length` appears at exactly these locations and nowhere else."

## Relationships

- T054 "`peerDependencies` literal-read test assertion shape and `CAPABILITY_OBLIGATIONS` member-anchor list are unstated at the sites that introduce them" - same-cluster (same step-2(a)/step-4 assertion family; the unstated member-anchor list is the same omission this finding addresses for prose sites)
- T060 "Version-bump procedure: four MUST/SHOULD obligations have no verifiable acceptance criterion" - same-cluster (same testability vector across version-bump procedure; Option A's new assertion is the same shape this finding asks for elsewhere on the page)
- T006 "Orientation pages live outside GOV-17's corpus and are cited under two incompatible paths" - decision-overlap (Option A's new assertion must run over the orientation subtree where one of the cited `"seven"` sites lives; GOV-17's corpus glob must include `docs/spec/**/*.md` for the gate to fire there)

---

# T057 - Item (e) fail predicate: operator-precedence ambiguity, single-sentence packing, and sub-outcomes buried mid-prose

**Kind:** clarity, placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

Item (e) in `version-bump-step2.md` packs the entire per-session slash-dispatch-serialisation audit — fail predicate, conservative-posture rule, recovery prescription, `N/A` definition, and both sub-outcomes — into a single sentence. The fail predicate is a chain of four `or`-joined disjuncts terminating in a bolded `AND` whose scope is ambiguous: it is intended to bind only the final textual-locatability disjunct, but nothing structural forces that reading, and the looser reading exempts any of the four triggers whenever an equivalent awaiting site is found, flipping audit verdicts on real candidate-minor shapes (fire-and-forget dispatch, `Promise.all` batches, microtask-deferred handlers). The two anchored sub-outcomes (`bump-checklist-slash-dispatch-serialisation-i` / `-ii`) sit deep inside that sentence rather than as visible sub-bullets, so a contributor scanning (e) for required verdicts sees one slot and collapses the two atomic sub-checks the spec requires to be filed independently.

## Solution approach

Restructure item (e)'s body so the fail predicate, conservative-posture rule, `N/A` definition, and recovery prescription are no longer one sentence, and render the textual-locatability disjunct together with its `and`-joined equivalent-site exemption as a single self-contained unit so the conjunction cannot bind the other three disjuncts. Promote the two sub-outcomes to sub-items directly under (e), each carrying its own scope statement and pass / fail / `N/A` verdict slot, and move the anchors `bump-checklist-slash-dispatch-serialisation-i` and `bump-checklist-slash-dispatch-serialisation-ii` onto them so inbound cross-references continue to resolve.

## Solution constraints

- Out of scope: the recovery-mutex acquisition semantics and teardown-budget interaction in item (e)'s recovery paragraph, owned by T118.
- Editorial restructure only — preserve unchanged the keying-granularity revisitation obligation, the `N/A — superseded by <named Pi mechanism>` rationale-slot format, and the rule that an `N/A` verdict propagates identically to both sub-outcomes.

## Relationships

- T118 "Recovery-mutex acquisition semantics and teardown-budget interaction undefined" - same-cluster (touches item (e)'s recovery paragraph, but resolves a separate semantic gap independent of the structural restructure)
# T058 - Step-2(b) family→branch correspondence inverts at the family-distinctive arms

**Original heading:** Step-2b branch (4)/(5) route to each other's inverse family; family/branch monotone correspondence broken
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`audit-failures.md`'s normative *family→step-2(b) routing table* uses
the same `1..5` ordinal label-space for both the five failure
**families** and the five resolution **branches** in
`version-bump-step2b.md`. Families (1)–(3) (unauthorised `pi.<member>`
access, unauthorised peer-package / typebox surface, unauthorised
`ctx.<member>` access) all map to the shared subset of branches (1)
[delete] / (2) [promote] / (3) [exempt], so on those three rows the
ordinal happens to coincide with a permitted branch and the reader
forms the heuristic "family (N) → branch (N)". The heuristic then
breaks at the two rows where the family carries a *distinctive*
recovery arm:

- Family (4) (out-of-scope import/access shape) routes to branches (1)
  / (2) / **(5)** [rewrite-shape]. Branch (3) is structurally
  prohibited here per *Exemption mechanism*, so branch (5) is the
  family-(4)-distinctive arm.
- Family (5) (stale or malformed exemption marker) routes to branch
  **(4)** [stale-or-malformed-rewrite] as its sole primary arm.

A contributor or reviewer who has internalised the (1)→(1), (2)→(2),
(3)→(3) pattern from the first three rows and then encounters a
family-(4) red on a `bump-commit` diff naturally routes it to branch
(4) (the stale/malformed-marker remediation), and a family-(5) red
naturally to branch (5) (the source-line rewrite). Both are wrong
under PIC; both will be caught by the prose tables but only after the
reader re-reads. The inversion is stated once in `version-bump-step2b.md`'s
preamble (the parenthetical "family (4) — non-exemptible per
*Exemption mechanism*; routed through branch (5) [rewrite-shape]
rather than branch (3) [exempt]") and is not repeated at the branch
(4) or branch (5) anchor definitions themselves, so a reader landing
on those anchors via the per-row links in the routing table sees no
local reminder that the ordinal does not match.

The structural cause is the shared `1..5` ordinal label-space; any fix
must either remove the ordinal collision (by relabelling one side) or
restore monotone correspondence (by swapping branches (4) and (5)).

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2b.md` —
  branch enumeration (anchors `bump-step-2b-delete`, `-promote`,
  `-exempt`, `-stale-rewrite`, `-rewrite-shape`) and preamble (edited)
- `docs/spec_topics/pi-integration-contract/audit-failures.md` —
  *Failure-surface contract* family→step-2(b) routing table, *Note on
  family (5) routing*, *Per-family record-shape table*, *Stale
  sub-kinds* sub-case references (edited)
- `docs/spec_topics/pi-integration-contract/audit-resolution.md` —
  *Exemption mechanism* prose referencing `step 2(b) branch (4)` and
  `step 2(b) branch (5)` (edited)
- `docs/spec_topics/pi-integration-contract/inventory-audit-intro.md`
  — *Inventory-closure audit* paragraph referencing "step 2(b)'s five
  branches" (read-only; references are by count rather than by
  numbered branch)
- `docs/spec_topics/pi-integration-contract/audit-target-categories.md`
  — references to `step 2(b) branch (2)` (read-only under either
  option; only the (4)/(5) labels change)
- `docs/spec_topics/pi-integration-contract/audit-recognised-shapes.md`
  — references to `step 2(b) branch (2)` (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(`docs/plan.md` exists but currently contains no leaves; the
horizontal/MVP/vertical phase sections are all placeholders, so no
acceptance criteria are affected and nothing is blocked or unblocked
by the resolution.)

## Consequence

**Severity:** advisory

Contributor or reviewer routes a family-(4) or family-(5) red to the
wrong remediation arm on a `bump-commit` diff, producing either an
audit-still-red commit (e.g., attempting to "fix" a family-(4)
out-of-scope shape by deleting the marker per branch (4) when no
marker exists), or a wrong-shape repair that lands a second-order red
the next audit run catches. The routing table itself is correct and
mechanically authoritative, so the mistake surfaces at the next
`npm test` rather than at runtime; the cost is wasted contributor
cycles and reviewer churn, not a wrong-behaviour ship.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Swap branches (4) and (5) to restore monotone correspondence

**Approach.** Renumber the two distinctive branches so that the
family-distinctive arm equals the family ordinal: family (4) →
branch (4) [rewrite-shape]; family (5) → branch (5)
[stale-or-malformed-rewrite]. Branches (1)–(3) keep their numbers and
their shared-subset role for families (1)–(3).

**Spec edits.**

- In `version-bump-step2b.md`, swap the ordinals of the two existing
  enumerated items so the *rewrite-shape* branch becomes item 4 and
  the *stale-or-malformed-rewrite* branch becomes item 5. Swap the
  anchor IDs the items carry to keep the anchor-name semantics aligned
  (`bump-step-2b-rewrite-shape` on the new item 4;
  `bump-step-2b-stale-rewrite` on the new item 5), or leave the
  anchor IDs in place and update only the displayed ordinals — either
  choice is internally consistent provided every inbound link is
  updated to whichever convention is chosen.
- Update the preamble parenthetical to read "routed through branch (4)
  [rewrite-shape] rather than branch (3) [exempt]".
- In `audit-failures.md`, update the family-(4) and family-(5) rows of
  the routing table (`branch (5) [rewrite-shape]` → `branch (4)
  [rewrite-shape]`; `branch (4) [stale-or-malformed-rewrite]` →
  `branch (5) [stale-or-malformed-rewrite]`). Update the *Note on
  family (5) routing* paragraph, the *Stale sub-kinds* paragraph's
  "sub-case 1"/"sub-case 2" references, and the *Per-family
  record-shape table*'s family-(4) and family-(5) `proposed-resolution`
  cells correspondingly.
- In `audit-resolution.md`, update every `step 2(b) branch (4)` and
  `step 2(b) branch (5)` reference to track the swap.
- `inventory-audit-intro.md` references "step 2(b)'s five branches"
  by count rather than by numbered branch and needs no edit.
- `audit-target-categories.md` and `audit-recognised-shapes.md`
  reference only `branch (2)` and are unaffected.

**Pros.**

- Reinforces the (N)→(N) reading the first three rows already
  establish; no new label-space to learn.
- Smallest reader-side change: a contributor reading the routing
  table for the first time reads correctly without having to notice
  an exception.

**Cons.**

- The `bump-step-2b-stale-rewrite` and `bump-step-2b-rewrite-shape`
  anchor names — already chosen to be self-describing — must either
  move (anchor-ID churn for inbound links across at least three sibling
  pages) or stay in place while the displayed ordinals swap (creating
  an anchor-name / ordinal mismatch a reader following the anchor link
  must reconcile mentally).
- Does not address the broader ordinal-collision concern raised by
  the related "Audit-cluster naming" and "Registry … family/branch
  ordinal collision" findings — families still use ordinals 1–5 and
  branches still use ordinals 1–5, so the *shared label-space* itself
  remains.

**Risks.**

- Inbound-link churn proportional to the number of citations of
  `branch (4)` / `branch (5)` / `bump-step-2b-stale-rewrite` /
  `bump-step-2b-rewrite-shape` across the corpus; missing one citation
  leaves a wrong-target link that the build's link-check (if any)
  surfaces, otherwise a silent reader misroute.

### Option B — Relabel branches into a disjoint label-space (e.g. (a)–(e) or arm-A…E)

**Approach.** Keep families on ordinals (1)–(5) and relabel the five
step-2(b) branches into a label-space disjoint from the family
ordinals — for example lowercase letters `(a)`–`(e)`, alphabetic arm
identifiers `arm-A`…`arm-E`, or Roman numerals `(i)`–`(v)` (the
related "Audit-cluster naming" finding suggests `arm-A…E` or `i–v`).
The routing table then becomes "family (4) → arms (a), (b), (e)" /
"family (5) → arm (d)" with no possibility of the reader applying a
(N)→(N) heuristic at all.

**Spec edits.**

- In `version-bump-step2b.md`, replace the `1.`–`5.` enumeration with
  the chosen label-space at the five branch headings and in the
  preamble's tie-break clauses (e.g. "if arms (b) and (c) both
  plausibly apply, pick arm (b) (promote)"). Update the anchor IDs
  optionally to track (e.g. `bump-step-2b-arm-d-stale-rewrite`) or
  leave the existing self-describing anchors in place — the latter
  removes anchor churn but the displayed labels still change.
- In `audit-failures.md`, rewrite both the family→step-2(b) routing
  table and the *Per-family record-shape table*'s
  `proposed-resolution` cells in the new label-space. Rewrite the
  *Note on family (5) routing* paragraph and the *Stale sub-kinds*
  sub-case references. The *Malformed-marker dual-emission co-commit
  obligation* prose currently refers to "branch (2) above" and
  similar; update all such references.
- In `audit-resolution.md`, rewrite every `step 2(b) branch (N)`
  reference into the new label-space.
- `inventory-audit-intro.md`, `audit-target-categories.md`,
  `audit-recognised-shapes.md` — update any `step 2(b) branch (N)`
  references that appear in prose (a handful of `branch (2)`
  citations).

**Pros.**

- Eliminates the structural cause: families and branches occupy
  disjoint label-spaces, so no future row can reintroduce a
  misleading ordinal coincidence (e.g. a sixth family-and-branch
  added later cannot revive the bug).
- Co-resolves the related "Audit-cluster naming" and "Registry …
  family/branch ordinal collision" findings in the same edit.
- Anchors can stay self-describing (`bump-step-2b-rewrite-shape`,
  `bump-step-2b-stale-rewrite`) regardless of the displayed label,
  which is already true of the existing anchor scheme.

**Cons.**

- Wider edit surface than Option A — every `branch (N)` citation in
  the corpus is touched, not only the (4) and (5) sites.
- Contributors who have memorised the existing "branch (1) delete /
  (2) promote / (3) exempt" shorthand from prior reviews must
  re-learn the labels.

**Risks.**

- Higher chance of stale `branch (N)` citations slipping through
  review than under Option A, since every occurrence is in scope of
  the relabel. Mitigated by a corpus-wide grep for `branch (1)`,
  `branch (2)`, ..., `branch (5)` as part of the edit.

### Recommendation

Take **Option B** (relabel branches into a disjoint label-space —
lowercase letters `(a)`–`(e)` are the most readable of the
three candidate spaces and align with the existing convention of
labelling step 2(a) / 2(b) themselves with letters). It co-resolves
the two related findings naming the same shared-label-space defect, is
structurally robust against re-introduction, and the per-page edit
cost is bounded by the small number of `branch (N)` citations across
the audit cluster (verifiable by `grep -rn 'branch ([1-5])'
docs/spec_topics/pi-integration-contract/`). An implementer taking
Option B must additionally watch:

- The displayed labels on the **branch headings** must match the
  labels used in **every routing-table cell** and in **every prose
  citation** that currently reads `branch (N)` or `step 2(b) branch
  (N)` — a single missed site leaves the reader holding two
  incompatible label-spaces side by side and is strictly worse than
  the status quo.
- The anchor IDs (`bump-step-2b-delete`, `-promote`, `-exempt`,
  `-stale-rewrite`, `-rewrite-shape`) are self-describing and need
  not change; leave them in place to avoid inbound-link churn and to
  keep the anchor URL a stable identifier the displayed label can
  evolve against.
- `audit-failures.md`'s *Note on family (5) routing* paragraph
  describes branch (4)'s sub-case (v) and the *Malformed-marker
  dual-emission co-commit obligation* — both citations move to the
  new label for the stale-or-malformed-rewrite branch, and the
  prose's references to "branches (1), (2), or (3)" become e.g.
  "arms (a), (b), or (c)".

If wider relabel scope is judged unacceptable (e.g. the cluster is
about to be cited by a freshly-authored plan leaf whose `Spec` field
would need updating), fall back to **Option A** as the smaller-surface
remediation; the inversion is fixed locally and the residual
shared-label-space concern is left to the related findings to
resolve.

## Relationships

None

---

# T059 - Item (e) recovery over-prescribes "mutex"; N/A definition and outcome-recording conventions buried mid-paragraph

**Original heading:** Item (e) recovery prescribes a "mutex" where serialisation is the property; N/A definition and outcome-recording conventions buried in item (e)
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** prescription, placement
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Item (e) of the version-bump checklist (`version-bump-step2.md`) carries two independent defects that happen to share the same physical paragraph.

**Defect A — recovery is prescribed as a "mutex" though the property is serialisation.** Item (e)'s pass-side prose enumerates several mechanism-preserving variants that satisfy precondition (b)'s snapshot/restore non-overlap property: "an explicit per-session lock wrapping the handler-body await chain, a single-consumer channel that dequeues each handler with `await` before pulling the next, and a microtask-deferred handler chain whose bodies still serialise." The cooperative-`await` chain it diffs from is itself not a mutex. But on a fail outcome the same item mandates one specific construct — "a defensive per-extension-instance runtime **mutex** (wrapping the snapshot → swap → body → restore sequence and keyed on the factory-captured `pi: ExtensionAPI` reference…)". A contributor reaching this branch is told to build a mutex even when an `async`-aware lock, a single-consumer awaited queue, or a channel would equally establish the non-overlap property the precondition actually asks for — and indeed those are the constructs more idiomatic to the JS/TS host where there is no kernel mutex primitive. The keying granularity (per-extension-instance, keyed on the `pi` reference) and the wrapped window (snapshot → swap → body → restore) are the load-bearing parts of the recovery; the choice of synchronisation construct is not.

**Defect B — N/A definition and outcome-recording conventions are buried in ~2,000 words of fail-predicate prose.** Two organisational rules govern how item (e)'s audit outcomes get recorded:

1. The formal definition of an `N/A` verdict for item (e) — "the candidate Pi minor has surfaced an explicit per-session dispatch-lock mechanism … recorded as `N/A — superseded by <named Pi mechanism>`."
2. The two-sub-outcome recording convention — that the item's rationale slot MUST carry two atomic verdicts, one for (e.i) and one for (e.ii), each with its own pass/fail/N/A and one-line rationale.

Both rules live mid- and tail-paragraph inside an item whose body is dominated by the fail predicate, the conservative-posture rule, and the recovery prescription. A contributor consulting item (e) to record an outcome cannot find either rule by scanning section headings — they exist only as unannounced sentences embedded in the same wall of prose that defines the fail trigger. The recording conventions are also not specific to item (e)'s subject (slash-dispatch serialisation); they would equally apply if a future item carried sub-outcomes.

The two defects are independent: fixing the mutex prescription does not improve discoverability of the N/A/recording conventions, and extracting those conventions does not loosen the recovery prescription. They are bundled here only because the source-review author noticed both while reading the same paragraph.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — item (e), recovery clause (edited under Defect A)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — item (e), N/A clause and trailing sub-outcome recording paragraph (edited under Defect B)
- `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md` — snapshot/restore Pi behavioural preconditions, precondition (b) (read-only; defines the non-overlap property that anchors the rewording)
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — mid-loom user-session replacement seam (read-only; per-`pi`-per-extension-instance lifetime cited by the keying granularity)
- `docs/spec_topics/future-considerations/model-changes-and-non-goals.md` — single-active-user-session presupposition (read-only; the other keying-granularity invariant)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project's `docs/plan.md` declares no leaves yet; only the template, conventions, and coverage-matrix stubs exist under `docs/plan_topics/`.)

## Consequence

**Severity:** correctness

Under Defect A, a contributor reaching the fail-recovery branch builds a kernel-style mutex where the spec elsewhere already concedes that an awaited per-session lock, single-consumer channel, or microtask-serialised handler chain would establish the same non-overlap property — i.e. the spec mandates one specific construct while admitting in adjacent prose that several are equivalent. Two reasonable implementers reading item (e) will diverge: one builds the mandated mutex, another builds an idiomatic awaited lock and is technically non-conformant with the recovery clause despite satisfying its load-bearing invariant. Under Defect B, contributors recording bump outcomes can miss the N/A definition or the two-sub-outcome convention and record a single combined verdict, causing rationale-slot drift and losing audit signal for partial-outcome cases (one sub-check passes, the other fails).

## Solution Space

**Shape:** multiple
**State:** shaped

This finding is bimodal: it asks the spec to do two independent things (rewrite a recovery prescription, and extract two organisational rules into a discoverable subsection). The bimodal-obligation rule requires resolving them as separate edits in a defined order.

### Option A — Rewrite the recovery clause to specify the serialisation property instead of the "mutex" mechanism

**Approach.** Replace the noun "mutex" in the recovery clause with a behavioural property: "a per-extension-instance serialisation of the snapshot → swap → body → restore window." Retain the keying-granularity prose verbatim (the `pi`-reference keying, the dual invariant on one-`pi`-per-extension-instance + one-active-user-session-per-extension-instance, and the revisitation obligation when either invariant weakens), since those are property-load-bearing. Add one sentence stating that any synchronisation construct that establishes the non-overlap property — `async`-aware lock, single-consumer awaited queue, channel, or equivalent — satisfies the recovery, mirroring the pass-side enumeration already in the same item.

**Spec edits.** Single-clause edit inside item (e), in the sentence beginning "requires adding a defensive per-extension-instance runtime **mutex** (wrapping the snapshot → swap → body → restore sequence and keyed on the factory-captured `pi: ExtensionAPI` reference…)". No anchor IDs change; no cross-references break.

**Pros.** Aligns recovery vocabulary with the property-vs-mechanism framing the rest of item (e) already uses on the pass side. Removes a real divergence between the pass-side equivalence list and the fail-side single-construct mandate. Implementers gain idiomatic flexibility without losing any non-overlap guarantee.

**Cons.** Slightly looser literal prescription; reviewers checking "did the contributor add a mutex?" must instead check "did the contributor add a construct that serialises the snapshot/restore window?" — a property check rather than a name check.

**Risks.** A contributor could read the loosened clause as admitting non-serialising constructs (e.g., a queue that dispatches before the prior handler resolves). Mitigation: the rewrite must keep the explicit "establishes the non-overlap property" gate and reference the pass-side fail-predicate examples already enumerated above.

### Option B — Extract the N/A definition and outcome-recording conventions into a dedicated "Outcome recording conventions" subsection

**Approach.** Add a new subsection (sibling to item (e), or under a step-2 preamble heading) titled "Outcome recording conventions" that hoists both rules:

1. The pass/fail/N/A recording shape (one-line rationale per item; already partly stated in the step-2 preamble).
2. Item (e)'s specific N/A definition and `N/A — superseded by <named Pi mechanism>` recording shape.
3. The two-sub-outcome convention for items that carry sub-checks, with item (e)'s (e.i)/(e.ii) as the worked example.

Item (e)'s body retains a one-sentence pointer to the subsection rather than inlining the rules.

**Spec edits.** New subsection (~150 words) above or below item (e); two deletions inside item (e) (the embedded N/A-definition paragraph and the trailing two-sub-outcome paragraph); one inserted forward-reference inside item (e).

**Pros.** Outcome-recording rules become findable from the section heading. Future items that carry sub-outcomes can reference the convention rather than restating it. Item (e)'s prose contracts measurably and its remaining content is uniformly about slash-dispatch serialisation.

**Cons.** Adds a new normative anchor/subsection; one more navigation hop for readers who only need item (e). The new subsection's owner is ambiguous if step 2 itself does not already have a preamble-rules home (the file currently uses the step preamble for some such rules and inline-mid-item for others).

**Risks.** If the extracted N/A definition drifts from item (e)'s specific superseded-by mechanism, a reader cross-checking against the recovery clause may not notice. Mitigation: the subsection text uses item (e) as the worked example so the linkage is explicit.

### Recommendation

Apply **Option A first**, then **Option B** as a separate edit.

Option A is the smaller, scope-bounded change — a one-clause rewrite confined to the recovery prescription — and it lands on the current paragraph structure unchanged. Doing it first means the rewording is reviewed against the existing surrounding prose, and the change itself does not perturb anchor IDs, sub-outcome anchors, or any cross-reference into item (e).

Option B then lands on the post-Option-A baseline. Because Option A only narrows one sentence inside the fail clause, Option B's extractions (the N/A definition and the two-sub-outcome paragraph) are unaffected by the order. Bundling them into a single commit would conflate a prescription change with an organisational change, doubling the diff surface the next review pass critiques.

Edge cases the implementer must watch:
- **Option A** must keep the keying-granularity prose intact (per-`pi`-per-extension-instance, the dual-invariant gate, the revisitation obligation). Those are not mechanism-specific; only the construct name changes.
- **Option A** must keep the explicit non-overlap-property gate so the looser wording cannot be misread as admitting non-serialising constructs.
- **Option B**'s new subsection should not weaken item (e)'s `N/A — superseded by <named Pi mechanism>` literal recording shape (it is a load-bearing convention for downstream commit-message parsers, if any).
- **Option B** must update the existing step-2 preamble sentence ("MUST record the per-item audit outcome … item (e) requires two sub-outcomes — see (e.i) and (e.ii) below") so the convention is stated in exactly one place.

## Relationships

- T057 "Item (e) fail predicate: operator-precedence ambiguity, single-sentence packing, and sub-outcomes buried mid-prose" - same-cluster (also restructures item (e)'s prose; Option B's extraction is compatible with that finding's promotion of (e.i)/(e.ii) to surface-level sub-bullets, and the two should be sequenced so Option B lands first)
- T060 "Version-bump procedure: four MUST/SHOULD obligations have no verifiable acceptance criterion" - decision-overlap (Option A renames the remediation; that finding's "post-mutex re-audit `pass` criterion" must be re-keyed to the property-language wording rather than to "mutex")

---

# T060 - Version-bump procedure: four MUST/SHOULD obligations have no verifiable acceptance criterion

**Original heading:** Version-bump testability: "cannot positively demonstrate" pass threshold undefined; mutex remediation has no post-add acceptance criterion; "re-justified"/grep MUSTs unverifiable
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The Pi-version-bump procedure carries four normative obligations whose acceptance criteria are stated only on the negative side, leaving no mechanically- or editorially-checkable predicate for *satisfaction*:

1. **`version-bump-step2.md` item (e) — *conservative-posture rule*.** The rule states that "if the auditor cannot positively demonstrate the non-overlap property holds against the candidate minor … the audit outcome MUST be recorded as `fail`, never `N/A`." No corresponding evidential standard defines what *does* constitute a positive demonstration of `pass`. The surrounding prose enumerates fail-trigger patterns and an `N/A` carve-out (a named Pi-side dispatch-lock surface), but the `pass` arm is left to contributor judgement. Two contributors reading the same diff can reasonably record different verdicts.

2. **`version-bump-step2.md` item (e) — fail-recovery mutex.** A fail outcome on (e.i) or (e.ii) "requires adding a defensive per-extension-instance runtime mutex … in the same edit as the bump." No post-add acceptance predicate is specified that confirms the added mutex actually re-establishes the snapshot/restore non-overlap property and therefore restores the audit to `pass`. A contributor who lands any mutex satisfies the textual obligation; whether the mutex is correctly placed, keyed, or scoped to the snapshot→swap→body→restore window is not separately gated.

3. **`version-bump-step2b.md` step 4 — *Deliberate deviation* re-justification.** The step states the deviation paragraph "MUST be re-justified at this step if the candidate Pi minor changes the lock-step expectation `packages.md` prescribes" and lists two triggering changes (packages.md drops the `"*"`-range pinning of the four `@earendil-works/*` packages, or `pi-mono` stops guaranteeing single-minor lock-step). The trigger is concrete; the content criterion for a satisfying re-justification is not. A cosmetic word-swap, or a re-justification that fails to name which of the two triggering changes fired, would textually satisfy the MUST.

4. **`version-bump-triggers.md` step 5 — inbound-reference grep.** The text says "the contributor MUST run a grep across the layout-invariant superset `src/`, `test/`, and `docs/` …" and "a positive result-delta against the documented enumeration that is not reconciled in the same edit is non-conformant." The grep itself is a process step with no artefact: there is no bump-commit evidence (a recorded grep output, a build-time audit that re-runs the grep and fails red, a checked-in expected-hits manifest) that a reviewer or CI can use to confirm the grep was run. The same paragraph notes the implementation MAY additionally implement a build-time audit; without it, "MUST run a grep" reduces to contributor discipline indistinguishable from omission.

In each case the obligation describes the action a contributor takes, not an observable the bump commit MUST carry. The downstream consumers — audit `pass/fail` recording, the snapshot/restore non-overlap invariant, the deviation rationale, the closed inbound-reference enumeration — all degrade silently when an obligation is performed but the result is wrong, or skipped entirely.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — item (e) *Per-session slash-command dispatch serialisation* (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-step2b.md` — step 4 *Update the version pin in `peerDependencies`* (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — step 5 *Update the capability-probe pinned constants*, inbound-reference sweep paragraph (edited)
- `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md` — snapshot/restore Pi behavioural preconditions (read-only; defines the property the mutex must re-establish)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — *Deliberate deviation from Pi's bundled-package convention* sub-paragraph (option-dependent; rewritten under Option C if (C2) is chosen)
- `docs/spec_topics/pi-integration-contract/patch-skew-degradation.md` — patch-skew degradation contract (read-only; mentions build-time gate the grep could attach to)

## Plan Impact

**Phases:** N/A

**Leaves:** N/A

(`plan.md` contains no authored leaves under any phase; the version-bump procedure has no closing leaf yet.)

## Consequence

**Severity:** correctness

The four sites jointly govern whether a Pi-version bump records the correct audit verdict, whether a fail-triggered runtime mutex actually restores the snapshot/restore invariant the precondition depends on, whether the deliberate-deviation rationale stays load-bearing, and whether the inbound-reference enumeration stays closed. With each obligation's satisfaction predicate undefined, two reasonable contributors performing the same bump diverge on what they record and what they ship, and a silently-skipped grep or a textually-satisfying-but-substantively-empty re-justification produces a green bump commit that hides real drift.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles four independent obligations at three different sites. Each is fixed by a separate localised edit, and the four edits do not share machinery. Per the bimodal-obligation rule, the four options below are the four obligations the source finding combined; the recommendation orders them so each lands on a stable baseline.

### Option A — Define the *positive demonstration* predicate for item (e)'s `pass` verdict

**Approach.** Add a closed `pass`-criterion paragraph to item (e) stating what evidence the auditor's rationale slot MUST cite to record `pass` on (e.i) and (e.ii). The criterion is the dual of the existing fail-trigger list: pass requires the rationale to name (1) the specific `dist/core/agent-session.js` lines establishing the `prompt` → `_tryExecuteExtensionCommand` → `await command.handler(args, ctx)` cooperative-`await` chain in the candidate minor (or the equivalent reachable site under the textual-locatability carve-out), and (2) for (e.ii), the call-graph path from each enumerated `dist/modes/*/*.js` entry point to its reachable `session.prompt(...)` site.

**Spec edits.** In `version-bump-step2.md` item (e), after the existing "conservative-posture rule" sentence, add a `**pass-evidence rule:**` clause: a `pass` outcome MUST cite a `<file>:<line>` (or call-graph path) reference for each of (e.i) and (e.ii); a `pass` rationale that names no specific code site is invalid and the auditor MUST re-record as `fail` per the conservative-posture rule.

**Pros.** Symmetric with the fail-trigger framing already in the paragraph. Reviewer-checkable on the bump commit message without new machinery.

**Cons.** Adds prose to an item that is already the longest in the checklist.

**Risks.** A `<file>:<line>` citation is a weak proxy for "the cited site establishes the property"; reviewers can still rubber-stamp. Mitigated by the existing fail-trigger list catching the obviously-wrong sites.

### Option B — Add a post-mutex re-audit `pass` criterion for the fail-recovery path

**Approach.** State that after the defensive per-extension-instance mutex is added in the same edit as the bump, the auditor MUST re-run item (e)'s audit against the loom-side source with the mutex in place and record a second-pass outcome under (e.i) and (e.ii); the bump MAY merge only when the second-pass outcome is `pass`. The re-audit's `pass` criterion reuses Option A's pass-evidence rule against the loom-side mutex source rather than the Pi-side `prompt` body.

**Spec edits.** In `version-bump-step2.md` item (e), after the existing mutex-recovery sentence, add: "After adding the mutex, the contributor MUST re-run (e.i)/(e.ii) against the loom-side source (the mutex implementation and the snapshot/restore call site it wraps) and record a second-pass outcome alongside the original `fail`; the bump MAY merge only when the second-pass outcome is `pass` under the pass-evidence rule above." The mutex's correct placement, keying (factory-captured `pi: ExtensionAPI` reference, per the existing keying-granularity prose), and scope (snapshot → swap → body → restore window) become the second-pass evidence.

**Pros.** Closes the silent-no-op failure mode in which any mutex satisfies the obligation. Reuses Option A's evidence shape.

**Cons.** Depends on Option A being landed first; ordering matters.

**Risks.** The re-audit re-uses the same prose-level evidence standard, so it is not a stronger gate than Option A.

### Option C — Specify the content criterion for the *Deliberate deviation* re-justification

**Approach.** Replace step 4's open "MUST be re-justified" with a closed content predicate: the re-justified paragraph MUST identify (a) which of the two triggering changes fired (packages.md `"*"`-range removal, or pi-mono release-model change), citing the candidate-minor `packages.md` site or release-notes citation, and (b) state explicitly whether the deviation rationale still holds against the changed lock-step expectation or is now invalidated.

**Spec edits.** In `version-bump-step2b.md` step 4, replace "MUST be re-justified at this step if the candidate Pi minor changes …" with "MUST be re-written at this step to (a) name which of the two triggering changes (packages.md `"*"`-range removal of the four `@earendil-works/*` packages, or `pi-mono` single-minor lock-step weakening) fired and cite the candidate-minor source for that change, and (b) state whether the deviation rationale stands as written or is invalidated and replaced." Keep the existing no-edit-if-unchanged clause.

**Pros.** Reviewable on the bump-commit diff without new machinery.

**Cons.** None material.

**Risks.** Both triggering changes are stated in the same paragraph; if a third triggering change emerges later, the closed (a)/(b) list must be extended on the same footing as the existing checklist's catch-all obligations.

### Option D — Demote the inbound-reference grep MUST to a verifiable outcome

Two sub-approaches with materially different cost/strength trade-offs:

#### Option D1 — Require a grep-output artefact on the bump commit

**Approach.** Keep the grep as a contributor action but require its output (the literal stdout of the documented two-stage `rg` recipe, or any equivalent surfacing the same line-level co-occurrence set) to be attached to the bump-commit message or committed under a known path; reviewers verify the attached output against the documented enumeration on the diff.

**Spec edits.** In `version-bump-triggers.md` step 5, after the existing "Concretely … MUST run a grep …" sentence, add: "The grep's literal output (the line-level co-occurrence set the second-stage filter surfaces, in stable sort order) MUST be attached to the bump-commit message under a named heading `inbound-reference-sweep:` so reviewers can compare it byte-for-byte against the documented enumeration; a bump commit lacking the attachment is non-conformant on the same footing as a result-delta that is not reconciled."

**Pros.** Cheap to add; no new build-time machinery; produces a reviewer-checkable artefact.

**Cons.** Still relies on contributor honesty (a contributor could attach stale output); the attachment is not a CI gate.

**Risks.** Attachment format drift across grep tools; mitigated by the existing "any equivalent two-stage grep that surfaces the same line-level co-occurrence set" carve-out.

#### Option D2 — Make the build-time audit MAY a MUST

**Approach.** Convert the existing "MAY additionally implement a build-time audit pass over the same three grep targets" sentence to a MUST, so the audit fires `npm test` red on any unreconciled result-delta and the grep obligation is discharged mechanically rather than by contributor discipline.

**Spec edits.** In `version-bump-triggers.md` step 5, replace "The implementation MAY additionally implement a build-time audit pass …" with "The implementation MUST implement a build-time audit pass over the same three grep targets (`src/`, `test/`, `docs/`) that fails `npm test` red on any result-delta against the documented enumeration; the contributor-side grep is then a debugging aid for the failing audit rather than the primary obligation." Update the surrounding text so the contributor MUST is on *reconciling the audit's red*, not on running the grep manually.

**Pros.** Strongest gate; mechanically fails the build rather than relying on contributor recall or attachment-honesty.

**Cons.** Commits the implementation to a new build-time audit pass; the audit must own its own failure-discriminator and message wording on the same footing as the other implementation-owned literal strings under step 5's groupings (i)–(iii); larger implementation surface.

**Risks.** False positives on `docs/` paragraphs the existing carve-out classifies as transiently-stale (handled by the existing exclusion arm); the audit must implement the same documented-enumeration exclusion list as the contributor-side grep recipe.

### Recommendation

Land all four edits, in this order, as four separately-loopable fixes:

1. **Option A** first. It defines the pass-evidence vocabulary that Option B reuses; landing A before B avoids B having to invent its own evidence shape.
2. **Option B** second, building on Option A's vocabulary.
3. **Option C** third (independent of A/B; ordered third only because step2b.md is a different file and the order keeps the step-2 file edits together).
4. **Option D2** fourth. Prefer D2 over D1: the build-time audit is the strongest gate and the procedure already pairs every other contributor obligation in step 5 with a build-time discriminator. If the implementation cost of D2 is judged out of scope at the time of fix, fall back to D1; do not leave the grep as an un-gated MUST.

The four edits do not interact at the file level (item (e) prose, step 4 prose, and step 5 prose are independent surfaces), so they can be fixed in any order at the cost of B briefly carrying a self-contained pass-evidence sentence A then collapses into a shared definition.

## Relationships

- T059 "Item (e) recovery over-prescribes "mutex"; N/A definition and outcome-recording conventions buried mid-paragraph" - same-cluster (Option B's mutex acceptance criterion lands on the same paragraph the prescription/placement finding rewrites; co-resolve in the same item-(e) edit pass)
- T057 "Item (e) fail predicate: operator-precedence ambiguity, single-sentence packing, and sub-outcomes buried mid-prose" - same-cluster (Option A and Option B both add prose to the same item-(e) checklist; an enumerated-list restructure makes both edits cleaner)
- T056 "Branch (2) "promote" co-edit obligation is explicitly non-exhaustive across multiple files (unbounded manual sweep)" - same-cluster (a parallel testability gap in step2b.md branch (2): the catch-all "every natural-language 'seven'-cardinality reference" obligation has the same un-verifiable shape Option D addresses for step 5's grep; both are candidates for a build-time grep-with-allow-list mechanical gate)
- T061 "Version-bump procedure carries six independent clarity / scope gaps across step 2 preamble, step 2(b) tie-breaks, and step 4" - same-cluster (Option C's content criterion for the *Deliberate deviation* re-justification overlaps with that finding's "or its candidate-minor equivalent" demand for an observable-behaviour definition; co-resolve the equivalence-test edit on the same step-4 paragraph)

---

# T061 - Version-bump procedure carries six independent clarity / scope gaps across step 2 preamble, step 2(b) tie-breaks, and step 4

**Original heading:** Version-bump clarity/scope: "as required" edit set; un-performed SHOULD-item recording; (1)∧(2) tie-break omitted; "or its candidate-minor equivalent"; PIC unexpanded; no Non-goals section
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** clarity, scope
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The Pi version bump procedure (split across `version-bump-intro.md`, `version-bump-step2.md`, `version-bump-step2b.md`, and `version-bump-triggers.md`) is densely normative and is read by contributors performing rare, high-stakes edits under time pressure. Six independent ambiguity / scope gaps in the current prose each let a careful contributor read past a real obligation without noticing — and each has a contained, mechanical fix.

The six are:

1. **Step 4 conditional-edit set is ambiguous.** `version-bump-step2b.md` step 4 says, on a `packages.md` / `pi-mono` change at the candidate minor, the contributor MUST "update the *Deliberate deviation* sub-paragraph (and the `peerDependencies` literal-read test, the [Step 0 (d) Peer-dep version] probe, and the literal-anchor list above **as required**) in the same commit." The trailing "as required" attaches to the three parenthesised artefacts collectively, leaving open whether all three are mandatory whenever the trigger fires or whether each is conditional on its own per-artefact predicate.

2. **Step 2 preamble does not say what to record for an un-performed SHOULD item.** The preamble obliges the contributor to MUST-record the audit outcome for items (a)–(e) and adds that items (f)–(ad) outcomes "are recorded under the same shape **when the SHOULD-level audit was performed**." The disposition for an un-performed SHOULD audit (omit the row, record `not-performed`, record `skipped` with rationale, …) is unstated, so two contributors will produce two different bump-commit records.

3. **Step 2(b) tie-break omits the (1)∧(2) overlap.** The introductory paragraph claims its tie-breaks "resolve every plausible-overlap case" among branches (1) delete / (2) promote / (3) exempt, but only enumerates (2)∧(3) → (2) and (1)∧(3) → (1). The (1)∧(2) case (a reference that is plausibly both an inadvertent addition the runtime does not depend on **and** a legitimate persistent surface dependency) is not addressed, so the "every plausible-overlap case" claim is either inaccurate or rests on an unwritten exclusion argument.

4. **Item (q) "or its candidate-minor equivalent" is undefined.** Item (q) of the editorial-review checklist requires the auditor to confirm that `Runner.bindCore()` "(or its candidate-minor equivalent)" overwrites the pre-bind throw closures at bind time. Equivalence is not tied to an observable behavioural predicate (e.g., "a Pi-side symbol whose effect at bind time is that every session-state action method ceases to throw"), so a Pi minor that renames or restructures the symbol leaves the auditor without a mechanical test for what counts as equivalent.

5. **PIC is unexpanded at first use on each page.** The token `PIC` appears as a load-bearing actor in normative prose throughout these files (e.g., `version-bump-step2.md` "PIC pins them as (a) and (b)"; `version-bump-triggers.md` "PIC owns the routing semantics"; `version-bump-step2b.md` step 3 sub-clauses). The glossary defines the abbreviation, but no first-use expansion appears on either the Pi Integration Contract index page or these version-bump pages, forcing a new contributor to glossary-jump before the first paragraph parses.

6. **No Non-goals / Out-of-scope section anchors the procedure.** Neither the procedure intro nor any of its four sub-files names what the procedure deliberately does **not** cover (e.g., loom-side recovery is repeatedly disclaimed inline with "PIC does not author the loom-side recovery here," but there is no single scannable section a reviewer can consult to confirm a candidate concern is genuinely out of scope rather than missed). The loom-1.0 non-goals live in `future-considerations/model-changes-and-non-goals.md`, but those are project-wide; the version-bump procedure has its own out-of-scope perimeter that is currently only deducible by reading every inline disclaimer.

Sub-findings (1)–(3) are correctness-grade: each one admits two reasonable contributor readings that produce different bump-commit artefacts. Sub-findings (4)–(5) are advisory. Sub-finding (6) is closer to cosmetic in isolation but compounds the editorial-surface cost of the other five.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2b.md` — step 4 "as required" clause (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-step2b.md` — step-2(b) preamble tie-break paragraph (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — step-2 preamble outcome-recording sentence (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — item (q) of the editorial-review checklist (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-intro.md` — procedure intro (edited; PIC first-use expansion and possible Non-goals/Out-of-scope section host)
- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — uses of `PIC` (read-only or edited, option-dependent)
- `docs/spec_topics/pi-integration-contract.md` — PIC index page (option-dependent; candidate site for a single first-use expansion if expanded at the contract level rather than per file)
- `docs/spec_topics/pi-integration-contract/registration-steps.md` — `pre-bind-throw-closure-evidence` anchor cited by item (q) (read-only)
- `docs/spec_topics/glossary.md` — existing PIC entry (read-only)
- `docs/spec_topics/future-considerations/model-changes-and-non-goals.md` — existing loom-1.0 non-goals (read-only; cited if the new procedure Non-goals section disambiguates scope)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project's `plan.md` currently contains no leaves; `plan_topics/` holds only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md`. There is no plan leaf to update.)

## Consequence

**Severity:** correctness

Sub-findings (1)–(3) each let two careful contributors produce divergent bump-commit artefacts (different commit-message audit rows, different classification of an ambiguous reference, different files edited under the same trigger). Sub-findings (4)–(6) raise the editorial-surface cost of the procedure without affecting correctness in isolation. The procedure is a low-frequency, high-stakes ritual; ambiguities here are not caught by a CI gate and surface only when a real bump goes red against a wrong artefact set.

## Solution Space

**Shape:** multiple
**State:** shaped

The six sub-issues are independent edits to distinct paragraphs and resolve as six separately-loopable fixes. The list below is ordered so the smaller scope-bounding edits land first and the wider editorial sweeps land on a stable baseline.

### Option A — Disambiguate step 4's "as required" edit set

**Approach.** Replace the trailing "as required" with an explicit per-artefact condition (or with an unconditional MUST if all three are in fact mandatory whenever the trigger fires).

**Spec edits.** In `version-bump-step2b.md` step 4, rewrite the parenthesised clause to one of:
- *Mandatory reading*: "… update the *Deliberate deviation* sub-paragraph, the `peerDependencies` literal-read test, the [Step 0 (d) Peer-dep version] probe, and the literal-anchor list above in the same commit."
- *Conditional reading*: name, per artefact, the predicate that triggers its update (e.g., "update the literal-read test only if the candidate-minor packages list changes the four-package set; update the Step 0 (d) probe only if the probed peer-dep range moves; …").

**Pros.** Removes a real two-readings ambiguity at the site where it occurs; minimal-surface edit.

**Cons.** Requires deciding which reading was intended; the answer is not derivable from the surrounding prose alone.

**Risks.** Picking the wrong reading silently changes the bump-commit obligation set; the author of the original sentence should confirm intent before the edit lands.

### Option B — Define the un-performed-SHOULD recording disposition

**Approach.** In the step-2 preamble, state explicitly what an un-performed (f)–(ad) audit records.

**Spec edits.** In `version-bump-step2.md`, extend the preamble sentence to specify the un-performed disposition. Recommended: "for items (f)–(ad), the contributor MUST record one of `pass` / `fail` / `N/A` (when the audit was performed) or `not-performed` with a one-line rationale (when the SHOULD-level audit was skipped); omitting the row is non-conformant."

**Pros.** Eliminates two-contributors-two-records drift on the bump commit; SHOULD-level scope is preserved (the audit is still optional; the recording is mandatory either way).

**Cons.** Adds a small recording obligation contributors must remember; some bump commits will carry an explicit `not-performed` row that a reviewer could read as a SHOULD-violation cue.

**Risks.** None significant; the disposition is purely about commit-message bookkeeping.

### Option C — Add the (1)∧(2) tie-break or narrow the "every plausible-overlap" claim

**Approach.** Either add a third tie-break covering the (1)∧(2) overlap, or narrow the surrounding claim to the two enumerated overlaps.

**Spec edits.** In `version-bump-step2b.md`, in the introductory paragraph immediately before sub-bullets 1–5, do one of:
- *Add the tie-break*: "if branches (1) and (2) both plausibly apply, pick branch (2) (promote)" — branch (1) (delete) is the default for unauthorised additions, branch (2) is selected when the reference is the runtime depending on a real surface the inventory had not enumerated; in the overlap, conservative posture is to promote and let a reviewer push back on the bump-commit diff if the surface is in fact not a real dependency.
- *Narrow the claim*: rephrase "every plausible-overlap case" to "every plausible (1)∧(3) and (2)∧(3) overlap case" and add a sentence stating that a (1)∧(2) overlap is treated as a reviewer-discretion call on the bump-commit diff.

**Pros.** Makes the "every plausible-overlap case" claim true as written; closes a real classification gap for a reference that could plausibly route either way.

**Cons.** The add-the-tie-break option needs author intent confirmed (promote vs delete is the substantive policy question, not just an editorial choice).

**Risks.** Same as Option A — picking the wrong tie-break alters the commit-time classification a contributor would otherwise make.

### Option D — Re-express item (q)'s "candidate-minor equivalent" as an observable behavioural predicate

**Approach.** Define equivalence by the observable behaviour the audit actually checks rather than by the named symbol.

**Spec edits.** In `version-bump-step2.md` item (q), replace `with Runner.bindCore() (or its candidate-minor equivalent) overwriting the slots at bind time` with prose keyed on the observable: "such that, at bind time, every session-state action method ceases to throw and routes to its bound implementation, regardless of which Pi-internal symbol performs the overwrite." Leave the `Runner.bindCore()` cite as illustrative non-normative evidence of where the loom 1.0 pin locates the behaviour.

**Pros.** Aligns item (q) with the prescription pattern other PIC sites use ("the observable behaviours by an equivalent reachable site rather than recording `pass` on textual locatability alone" — already present in (q)'s closing sentences); makes the audit's pass/fail decision independent of Pi-internal symbol naming.

**Cons.** Slightly longer prose; loses the specificity of the loom 1.0-pinned symbol as the auditor's first lookup site.

**Risks.** None — this is a tightening of an existing weakening that the page already accommodates elsewhere.

### Option E — Expand PIC on first use

**Approach.** Pick a single canonical expansion site and expand the abbreviation there; downstream pages cite the expanded form via the existing glossary entry.

**Spec edits.** Two viable expansion sites; pick one:
- *Per-file*: add a parenthetical "(PIC — Pi Integration Contract)" on the first occurrence of `PIC` in each of `version-bump-intro.md`, `version-bump-step2.md`, `version-bump-step2b.md`, and `version-bump-triggers.md`. Robust against readers entering at any page.
- *Index-only*: add the parenthetical once on `pi-integration-contract.md`'s opening paragraph; rely on reading-order discipline elsewhere. Smaller edit; weaker for readers entering at a child page.

**Pros.** Removes the glossary-jump on first read.

**Cons.** Per-file option duplicates the expansion four times; index-only option doesn't help readers entering mid-page (which is the common case for the bump procedure).

**Risks.** None.

### Option F — Add a Non-goals / Out-of-scope section to the procedure

**Approach.** Aggregate the inline "PIC does not author the loom-side recovery here" / "the implementation owns ..." disclaimers into a single scannable section at the procedure intro.

**Spec edits.** In `version-bump-intro.md`, add a `## Non-goals` (or `## Out of scope`) section immediately after the existing introductory paragraph that enumerates: (a) loom-side recovery prescriptions for falsified presuppositions (handled by amending the consumption-posture paragraphs, not by this procedure); (b) literal-string failure-discriminator naming and message wording (implementation-owned); (c) negative-test fixture inventory beyond the routability obligation; (d) the project-wide loom 1.0 non-goals, cross-linked to `future-considerations/model-changes-and-non-goals.md`.

**Pros.** Makes "is X in scope for this procedure?" mechanically answerable; reduces the cost of every subsequent editorial sweep over these pages.

**Cons.** Adds prose where prose already runs long; risks duplicating disclaimers that also need to remain at their inline sites for local context.

**Risks.** Low. The duplication risk is mitigated by stating the section is informative and the inline disclaimers remain the source of truth.

### Recommendation

Address the six sub-options independently and in order **A → C → B → D → E → F**:

- **A and C first** because they are the two correctness-grade ambiguities and each is a single-paragraph edit with no cross-page sweep; landing them first stabilises the step 2(b) classification rules other edits would otherwise read against a shifting baseline.
- **B next** because it is correctness-grade but limited to a single sentence in the step-2 preamble.
- **D** as the smallest advisory tightening (item (q) only).
- **E** as a small editorial sweep across four files (or one, if the index-only variant is chosen) — recommend the per-file expansion variant since the bump pages are commonly entered mid-procedure.
- **F** last, on the stable baseline the previous five edits produce.

Implementer edge cases to watch:

- Options A and C both require confirming author intent before the edit lands; do not infer policy from surrounding prose.
- Option E's per-file variant must touch every page that uses `PIC` as a load-bearing actor (currently the four version-bump files plus `pi-integration-contract.md`); a future page that introduces a new PIC use is expected to carry the expansion under the same convention.
- Option F's Non-goals section must explicitly state that the inline `PIC does not author ...` disclaimers remain authoritative; the section is an index, not a re-statement.

## Relationships

- T054 "`peerDependencies` literal-read test assertion shape and `CAPABILITY_OBLIGATIONS` member-anchor list are unstated at the sites that introduce them" - same-cluster (touches the same step-4 paragraph as Option A; Option A's edit and that finding's edit can be co-resolved if convenient, but they fix different ambiguities and need not be bundled)

---

# T062 - Patch-skew teardown fixtures and `literals-shape-invalid` sub-cases lack per-observable / per-sub-case fixture enumeration

**Original heading:** patch-skew teardown fixture obligations and unknown-reason sub-cases lack per-sub-step / per-sub-case observable enumeration
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The patch-skew contract in `patch-skew-degradation.md` pins three fixture categories — (P-a) unknown-reason runtime, (P-b) snapshot-only widening, (P-c) narrowing no-regression — and each of (P-a), (P-b-1), and (P-c-1) is required to prove that "the full five-sub-step teardown still runs." That phrase is the entire sufficiency boundary the spec gives the implementer: two reasonable implementations can satisfy it by asserting one observable each (e.g., that `LoomRegistry.drain()` was called) and silently differ on whether sub-step 2's per-entry `loomAbort.abort()` loop, sub-step 3's bounded `Promise.allSettled` await, sub-step 4's three watcher/timer calls, or sub-step 5's three listener-detach calls actually ran. The **Per-step isolation** paragraph in the same file already pins a closed normative set of `(code, details.step, details.call)` labels — `"loomRegistry.drain"`, `"loomRegistry.initDrainStateTag"`, `"discoveryWatcher.close"`, `"settingsWatcher.close"`, `"Clock.clearTimeout(debounce)"`, `"ctx.signal.removeEventListener"`, `"toolSignal.removeEventListener"`, `"parentInvokeSignal.removeEventListener"` — that already constitute a wire-contract enumeration of per-sub-step call sites, but the (P-a)/(P-b-1)/(P-c-1) prose does not cross-reference it as the minimum observable set each fixture must demonstrate ran.

The `literals-shape-invalid` discriminator in `unknown-reason-rule.md` collapses four structurally distinct snapshot-shape failures into a single discriminator string: (1) `literals` is not an array; (2) `literals` is an array but at least one element is not a string; (3) `literals` is the empty array; (4) `literals` is an array of strings but at least one element is `""`. The rule fully specifies the discriminator and the routing-table contract — but does not pin that a conformance test suite must exercise each of the four sub-cases. An implementation whose handler short-circuits on the first sub-case it happens to detect (e.g., `Array.isArray(literals) && literals.length > 0 && literals.every(s => typeof s === "string")` would never reach a per-element empty-string check) can pass a single-fixture suite while leaving sub-case (4) routed somewhere outside the closed `details.failure` discriminator set, violating the conformance claim the rule's closed template-literal union makes.

Both gaps are the same shape: a closed enumeration is pinned in normative prose, but the fixture obligation does not require coverage of every member, so the conformance suite cannot witness the closure.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/patch-skew-degradation.md` — (P-a), (P-b-1), (P-c-1) fixture clauses, and the *Fixture-obligation categories* paragraph (edited)
- `docs/spec_topics/pi-integration-contract/patch-skew-degradation.md` — **Per-step isolation** paragraph and its closed `details.call` label set (read-only — the source of truth that the new enumeration cross-references)
- `docs/spec_topics/pi-integration-contract/unknown-reason-rule.md` — *Lookup-failure-to-discriminator routing* and `literals-shape-invalid` four-sub-case enumeration (edited)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(No leaves have been authored under `plan.md` or `plan_topics/` yet; the plan is currently a scaffold with no entries.)

## Consequence

**Severity:** correctness

Two conformant implementations can produce divergent test suites that nominally satisfy the patch-skew fixture obligations while exercising different subsets of the teardown sub-steps and different subsets of the `literals-shape-invalid` sub-cases. A sub-step or sub-case that no fixture exercises is one that the contract pins but cannot witness, so a regression that silently breaks (for example) sub-step 5's listener detachment or sub-case (4)'s empty-string detection ships green on a fully-passing suite.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding decomposes into two independent edits in two different files. Resolve them in the order given — the unknown-reason edit is the smaller, file-local one and lands on a stable baseline before the patch-skew edit, which touches three adjacent fixture clauses plus a cross-reference into the **Per-step isolation** closed label set.

### Option A — `literals-shape-invalid` per-sub-case fixture obligation (resolve first)

**Approach.** Append a one-sentence fixture obligation to the *Lookup-failure-to-discriminator routing* paragraph (or to the four-sub-case enumeration immediately below it) requiring one fixture per sub-case (1)–(4), each constructing a synthetic snapshot whose `literals` field exhibits exactly that sub-case's structural defect, dispatching a `session_shutdown` event, and asserting the handler emits exactly one `loom/host/session-shutdown-pinned-constant-unreadable` with `details.failure === "literals-shape-invalid"` (and that no `loom/host/session-shutdown-reason-unknown` fires).

**Spec edits.**
- `unknown-reason-rule.md`: add the four-fixture obligation sentence anchored to the existing sub-case enumeration; reuse the same test-only static-import-preserving substitution mechanic (P-b)/(P-c-1) already establish so the four new fixtures cite an existing mechanism.
- Optionally cross-reference the new obligation from the *Fixture-obligation categories* paragraph in `patch-skew-degradation.md` so the headline "four categories" count remains in sync if the editor chooses to elevate these to a fifth category.

**Pros.** Local, file-scoped; reuses an already-pinned substitution mechanic; closes the conformance gap on the `details.failure` closed union.

**Cons.** Adds four sub-fixtures whose distinction from each other is structural, not behavioural — implementers may grumble about a 4× fixture multiplier for a single discriminator value.

**Risks.** None material; sub-case (4) (per-element empty-string detection) is the one most likely to reveal an existing implementation gap, which is precisely why the obligation is worth pinning.

### Option B — Per-sub-step observable enumeration for (P-a)/(P-b-1)/(P-c-1) (resolve second)

**Approach.** Extend each of the three fixture clauses to require the fixture assert one observable per sub-step — by cross-referencing the closed `details.call` label set the **Per-step isolation** paragraph already pins. The minimal cross-reference is: "the fixture MUST assert that each of the eight call sites enumerated in the **Per-step isolation** closed-set paragraph below was invoked on this teardown (or, for sub-steps 2 and 3, that the per-entry registry iteration and the bounded `Promise.allSettled` await each ran), via spies on the injected `LoomRegistry`, `chokidar`-watcher, `Clock`, and signal-listener seams." Either route through the closed `details.call` label set (the wire-contract approach — assert one diagnostic-channel observation per call site by injecting a stub that throws to force the label to surface, then assert the surfaced label set equals the closed set minus the sub-steps the fixture intentionally exercises happy-path) or through seam-spy observations (the behavioural approach — assert each seam method was invoked).

**Spec edits.**
- `patch-skew-degradation.md`: add the cross-referencing sentence to each of (P-a), (P-b-1), and (P-c-1); add one sentence to (P-c-1) clarifying that sub-step 3's `Promise.allSettled` await is also an observable obligation (the existing prose mentions "the full five-sub-step teardown runs" but does not call out that sub-step 3 has no `details.call` label and therefore needs an injected `disposeBarrier` spy or `Clock.setTimeout` spy to witness it).
- Optionally lift the cross-reference once into the *Fixture-obligation categories* paragraph and have (P-a)/(P-b-1)/(P-c-1) inherit it, to keep the three fixture clauses themselves terse.

**Pros.** Reuses an existing closed enumeration as the conformance witness, so the obligation gains no new normative surface. Forces fixtures to exercise the seams the **Per-step isolation** rule pins, closing the gap between the wire contract and the test that proves it holds.

**Cons.** Sub-step 3 has no `details.call` label and needs its own observable mechanism; the cross-reference must either be widened (sub-steps 1, 4, 5 via the label set; sub-step 2 via a per-entry registry-iteration spy; sub-step 3 via a `Promise.allSettled` / `Clock.setTimeout` spy) or accept that sub-step 3 stays witnessed only by the absence of a hang.

**Risks.** Implementers may need to add seam-level spies they were not otherwise wiring; the cost is one-time scaffold work in the fixture harness, not in production code.

### Recommendation

Adopt **both** options; they are independent and additive. Resolve Option A first (single file, local edit, no cross-reference work) so Option B's larger cross-reference into the **Per-step isolation** label set lands on a baseline where the unknown-reason discriminator-fixture obligation is already a settled pattern Option B can echo. Option B's edit should route sub-steps 1, 4, and 5 through the closed `details.call` label-set cross-reference (the cheapest witness, since the labels are already wire contract) and call out sub-steps 2 and 3 by name as needing per-entry-spy and barrier/timer-spy witnesses respectively, so no sub-step is left without a named observable. Edge cases the implementer must watch: (P-b-1)'s "no `loom/host/session-shutdown-reason-unknown` is emitted" assertion already exists and must not be relaxed by the new enumeration; (P-c-1)'s `"fork"`-narrowing case must still witness that sub-step 1's `LoomRegistry.drain` ran even though the registry was already drained by an earlier shutdown in a longer-running harness — fixtures must use a fresh registry per case.

## Relationships

None

---

# T063 - Shard-13 clarity / cruft cluster on the provider-error and session-shutdown pages

**Original heading:** Shard-13 clarity/cruft: numeric-run boundary grammar; "is expected to run"; "(W, runtime)" and "foreseeable" qualifiers; provider-error decision-log comments and deferral restatements
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** clarity, cruft
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Five independent editorial defects sit on the provider-error-mapping and session-shutdown pages. They share no underlying problem; they have only been grouped because they were noticed in the same review pass. Each is independently resolvable and each has a distinct fix surface, but one of them — the numeric-run grammar — is materially more than cosmetic, since the page explicitly promises cross-implementation determinism on token-count extraction and the grammar's boundary cases are silently underdetermined.

The five defects are:

1. **Numeric-run grammar boundary cases.** `provider-error-mapping.md` defines a *numeric run* as "a maximal substring of decimal digits that may contain `,` or `_` digit-group separators (the separators are stripped before the run is parsed as a base-10 integer)" and then guarantees that "two conforming implementations produce identical values on the same payload." The maximal-substring rule does not pin behaviour on three boundary classes: (i) a separator that abuts a non-digit boundary, e.g. `"1,234,"` or `",234"` — does the run include the trailing/leading separator before the strip? (ii) adjacent separators, e.g. `"1,,234"` — one run or two? (iii) a separator-only group between digits, e.g. `"1_,234"` or `"1,_234"` — does mixed `,`/`_` within a single run remain one run? On contrived but plausible provider rewordings ("limit 1,234, requested 5,678") two implementations of the same prose could legitimately count two runs vs four and surface different `tokens_used` / `tokens_limit` pairs, violating the determinism guarantee.

2. **"is expected to run" modal drift.** The *Re-validation gate (loom 1.0.0)* paragraph on the same page reads "a contributor performing the bump is expected to run them, but [Pi version bump procedure] does not yet enumerate the step." "Is expected to" is neither MUST nor SHOULD; later in the same paragraph cluster the spec uses "Reviews SHOULD NOT re-raise" for a sibling obligation. An implementer cannot tell whether running the fixtures is a required step in the manual bump procedure or merely an aspiration.

3. **Unintroduced `(W, runtime)` severity/phase tags.** Four diagnostic-code mentions across `patch-skew-degradation.md`, `session-only-degraded-state.md`, `unknown-reason-rule.md`, and the SM-2 / SM-6 rules in `docs/spec/session-model-and-appendix.md` carry a parenthetical `(W, runtime)` tag immediately after the code string. The two-letter / phase-name shorthand is introduced only in `docs/spec_topics/diagnostics/code-registry-parse.md`'s column legend (Severity is `error (E)` or `warning (W)`; Phase is `lex / parse / type / load / runtime`). A reader following a forward-link into any of these PIC paragraphs sees the tag with no in-page or near-by gloss.

4. **"foreseeable" weasel qualifier.** `diagnostic-emission-isolation.md` says "a circular `cause`, a `BigInt` field, a host-shimmed `JSON.stringify` getter, or any other foreseeable serialiser failure" and, in a sibling clause, "a frozen target object, a throwing setter on a host-shimmed `Object` prototype, an out-of-memory failure during property assignment, or any other foreseeable construction-site failure". The exemplar lists are already non-exhaustive; "foreseeable" adds nothing testable and invites disputes over which unforeseen failures are still in scope for the catch.

5. **Decision-log HTML comments and deferral restatements.** Several pages embed editorial-history `<!-- ... -->` comments aimed at future spec editors rather than at implementers — `provider-error-mapping.md` line 40 ("`Conversation drive — subagent mode` ... was relocated to its owning page"), `binder-inference.md` line 21, `host-interfaces-core.md` line 117, `runtime-event-channel.md` line 129, the bracketed comment mid-paragraph inside `conversation-drive.md`'s `pi.sendUserMessage` block, and the `conversation-drive.md` line 28 ValidationIssue relocation. On `provider-error-mapping.md` specifically the *Re-validation gate* and the *Provider-owned-wording presupposition* paragraphs each separately restate "Wiring this … into the bump procedure as a mechanical [CI] gate … remains the post-loom 1.0.0 maintenance follow-up", with the second paragraph explicitly noting it duplicates the first ("already noted under the *Re-validation gate* above"). The same paragraph also embeds a reviewer-meta directive ("Reviews SHOULD NOT re-raise the absence of this acceptance criterion as a loom 1.0.0 correctness finding") in normative body.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — *Overflow token-count extraction* paragraph; *Re-validation gate (loom 1.0.0)* paragraph; *Provider-owned-wording presupposition* paragraph; trailing relocation HTML comment (edited)
- `docs/spec_topics/pi-integration-contract/patch-skew-degradation.md` — *Per-step isolation* paragraph, `(W, runtime)` tag site (edited)
- `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md` — runtime-degraded emission paragraph, `(W, runtime)` tag site (edited)
- `docs/spec_topics/pi-integration-contract/unknown-reason-rule.md` — `reason-unknown` and `pinned-constant-unreadable` emission paragraphs, `(W, runtime)` tag sites (edited)
- `docs/spec_topics/pi-integration-contract/diagnostic-emission-isolation.md` — serialiser-failure and construction-site-failure clauses ("foreseeable" qualifier) (edited)
- `docs/spec_topics/pi-integration-contract/binder-inference.md` — line 21 decision-log comment (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — line 117 decision-log comment (edited)
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — line 129 decision-log comment (edited)
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — mid-paragraph relocation comment in `pi.sendUserMessage` block; line 28 ValidationIssue relocation comment (edited)
- `docs/spec/session-model-and-appendix.md` — SM-2 and SM-6 `(W, runtime)` tag sites (edited)
- `docs/spec_topics/diagnostics/code-registry-parse.md` — column legend that introduces `E`/`W` and the phase taxonomy (read-only — anchor target for the severity/phase fix)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`docs/plan.md` and `docs/plan_topics/` exist but currently contain no leaves under the horizontal or MVP sections; nothing to grep against.)

## Consequence

**Severity:** correctness

The numeric-run grammar gap alone defeats the page's own cross-implementation determinism guarantee on adversarial-but-plausible provider rewordings; the remaining four sub-issues are advisory-to-cosmetic individually but compound a perception that PIC's normative prose is loose. The "is expected to" modal gap concretely lets a contributor skip the fixture re-run during a Pi minor bump without violating any pinned obligation.

## Solution Space

**Shape:** multiple
**State:** shaped

The five sub-issues are independent obligations. Per the bimodal-obligation rule, each gets its own option block so the per-finding fix loop resolves them sequentially rather than producing one wide-surface edit that the next pass's lenses would re-critique as five new findings.

### Option A — Pin the numeric-run grammar

**Approach.** In `provider-error-mapping.md`'s *Overflow token-count extraction* paragraph, replace the prose definition with a regex-anchored grammar plus the three boundary clarifications.

**Spec edits.** Replace "where a numeric run is a maximal substring …" with the grammar:

> A *numeric run* is a maximal match of the regular expression `[0-9]([0-9,_]*[0-9])?` against the message string. Equivalently: a numeric run begins and ends with a decimal digit and may contain `,` or `_` separators between digits; a separator that is not flanked by digits on both sides (a leading separator, a trailing separator, or an adjacent-separator pair) does not extend the run and is not consumed by it. After extraction, every `,` and `_` in the run is stripped and the remainder is parsed as a base-10 integer.

Add a one-sentence worked example covering `"requested 1,234,567 tokens, limit 200,000"` → two runs (`1234567`, `200000`) and `"1,,234"` → two runs (`1`, `234`).

**Pros.** Restores the cross-implementation determinism guarantee the surrounding prose already makes. Cheap one-paragraph edit.
**Cons.** Anchors a regex into normative prose where the page otherwise prefers behavioural wording.
**Risks.** A provider rewording that intentionally splits a count across abutting separators silently moves to the `null` fallback — but that risk already exists and is already routed to editorial review by the *Provider-owned-wording presupposition*.

### Option B — Replace "is expected to run" with a definite modal

**Approach.** In the *Re-validation gate (loom 1.0.0)* paragraph of `provider-error-mapping.md`, replace "is expected to run them" with a SHOULD obligation tied to the bump procedure step the rest of the paragraph defers.

**Spec edits.** Replace "a contributor performing the bump is expected to run them, but [Pi version bump procedure] below does not yet enumerate the step" with "a contributor performing the bump SHOULD run `npm test`'s provider-error fixtures against the candidate `@earendil-works/pi-ai` minor before completing step 4 of [Pi version bump procedure] below; loom 1.0.0 does not yet enumerate the run as a mechanical step of that procedure."

**Pros.** Resolves the modal ambiguity without introducing a new MUST that the rest of the paragraph admits the procedure cannot yet enforce.
**Cons.** None.
**Risks.** None.

### Option C — Introduce the `(W, runtime)` shorthand at its first PIC use, or replace it with prose

**Approach.** The shorthand's legend lives in a different topic file. Either (C1) gloss the notation once at its first appearance inside the PIC section the reader is most likely to enter cold, or (C2) replace `(W, runtime)` with the spelled-out form `(severity warning, runtime-phase)` at each site and drop the parenthetical at the SM-2 / SM-6 mirror sites.

**Spec edits (C1 preferred).** At the first `(W, runtime)` occurrence inside PIC (the **Per-step isolation** paragraph in `patch-skew-degradation.md`), expand inline once: "emit exactly one `loom/host/session-shutdown-teardown-step-failed` (severity `warning`, phase `runtime` — abbreviated `(W, runtime)` throughout this section per the column legend in [Diagnostics — code registry](../diagnostics/code-registry-parse.md)) diagnostic". Subsequent `(W, runtime)` uses on the same page and on `session-only-degraded-state.md` / `unknown-reason-rule.md` / `session-model-and-appendix.md` then carry an unobtrusive forward link the first time per page.

**Pros.** Reader entering any PIC paragraph cold can resolve the shorthand without leaving the section. Preserves the compact `(W, runtime)` notation that the high-density PIC prose benefits from.
**Cons.** Adds a parenthetical to one paragraph in each affected file (≤6 sites).
**Risks.** A future severity addition (`info`) or phase addition (`bind`) would require the gloss to follow; that risk is already inherent in the existing shorthand.

### Option D — Drop the "foreseeable" qualifier

**Approach.** In `diagnostic-emission-isolation.md`, delete the word "foreseeable" from both occurrences. The exemplar lists are already explicitly non-exhaustive ("or any other … failure"), and the `try`/`catch` wrap is unconditional regardless of which failure mode trips it.

**Spec edits.** "any other foreseeable serialiser failure" → "any other serialiser failure"; "any other foreseeable construction-site failure" → "any other construction-site failure".

**Pros.** Two-word deletion. No behavioural change.
**Cons.** None.
**Risks.** None.

### Option E — Delete decision-log HTML comments and the duplicated deferral; relocate the reviewer-meta directive

**Approach.** Remove every editorial-history HTML comment that informs only future spec editors. Consolidate the two near-duplicate "Wiring this … remains the post-loom 1.0.0 maintenance follow-up" sentences in `provider-error-mapping.md` into a single statement at the first occurrence and have the second paragraph forward-link to it. Move the "Reviews SHOULD NOT re-raise the absence of this acceptance criterion as a loom 1.0.0 correctness finding" directive out of normative body — either into `docs/spec_topics/future-considerations/` as a recognised loom 1.0 non-goal, or into a "Review carve-outs" note co-located with whichever page already collects such directives.

**Spec edits.** Delete the HTML comments at: `provider-error-mapping.md` line 40, `binder-inference.md` line 21, `host-interfaces-core.md` line 117, `runtime-event-channel.md` line 129, `conversation-drive.md` line 28, and the mid-paragraph relocation comment inside `conversation-drive.md`'s `pi.sendUserMessage` block. In `provider-error-mapping.md`, replace the second "Wiring this fixture re-run … already noted under the *Re-validation gate* above" with "See *Re-validation gate (loom 1.0.0)* above for the corresponding post-loom 1.0.0 maintenance follow-up." Move the reviewer-meta sentence to `docs/spec_topics/future-considerations/`.

**Pros.** Trims the visible body on five files. Removes a piece of normative prose (the reviewer-meta directive) that asks reviewers to suppress a category of finding — a governance instruction that does not belong inside a runtime-behaviour rule.
**Cons.** None.
**Risks.** Loses the editorial breadcrumb that an HTML comment provided to the next editor; the relocations are documented in version control and in the future-considerations page that absorbs the deferral.

### Recommendation

Resolve in order **B → D → E → C → A**:

1. **B** and **D** are pure modal/word-level edits with zero scope debate; land them first to shrink the diff surface the later options work against.
2. **E** is a deletion pass with one small relocation; landing it before C and A means C's gloss-paragraph rewrite and A's grammar replacement land on already-cleaned bodies.
3. **C** is a localised gloss insertion that benefits from the cleaner body E leaves.
4. **A** is the only sub-issue with a normative semantic shift (the numeric-run grammar) and the only one where reviewers may want to debate the regex; landing it last keeps that debate from blocking the four cheaper fixes.

Edge cases the implementer must watch in Option A: confirm the regex `[0-9]([0-9,_]*[0-9])?` does not greedy-match across whitespace (it cannot — `,` and `_` are the only intra-run characters); confirm the existing "when the two runs are equal, both fields take that value" clause survives the rewrite verbatim; and confirm no other PIC paragraph imports the old prose definition by reference (a grep against the corpus before commit is sufficient).

## Relationships

None

---

# T064 - Ceiling #1 and ceiling #2 positive enforcement obligations carry no REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The hard-ceiling aggregator at `overview-and-orientation.md#hard-runtime-ceilings` forward-links each ceiling's *bound owner* / *surface owner* labels to the owning topic-page paragraph. Ceilings #3 and #4 carry governed identifiers (HC3-a..HC3-e inline labels, CIO-1..CIO-6 REQ-IDs), but the enforcement obligations for ceilings #1 and #2 carry none: the `**Invocation depth bound.**` paragraph on `invocation.md` (ceiling #1 bound + surface), the `tool_loop` field rule on `frontmatter/frontmatter-fields-b-and-templates.md` (ceiling #2 bound), and the `ToolLoopExhaustedError` schema on `errors-and-results/queryerror-variants.md` (ceiling #2 surface) have no co-located REQ-ID anchor. The aggregator therefore forward-links into paragraphs that cannot be cited as IDs, leaving the two most operationally significant ceilings without coverage-matrix closure entries and forcing cross-links onto GOV-25-prohibited heading-slug auto-IDs.

## Solution approach

Add a GOV-1 dual-form REQ-ID anchor at each unanchored enforcement site: the `**Invocation depth bound.**` paragraph on `invocation.md` under the `INV` prefix (one ID covering both bound and surface, since that paragraph normatively states both), the `tool_loop` field rule on `frontmatter/frontmatter-fields-b-and-templates.md` under the `FRNT` prefix, and the prose line preceding the `ToolLoopExhaustedError` schema block on `errors-and-results/queryerror-variants.md` under the `ERR` prefix, allocating each numeric tail per GOV-3. Then update the ceiling #1 / #2 aggregator entries on `overview-and-orientation.md`, the first-enforcement-point listing on `hard-ceilings.md`, and the ceiling-set-invariants citation on `hard-ceilings/ceilings-3-and-4.md#ceiling-set-invariants` to cite the new IDs, per the GOV-30 lock-step co-edit.

## Solution constraints

- ERR-N allocation MUST NOT reuse the retired ERR-16 tail (GOV-3 non-collapsing numbering; confirm against the page's `## Retired REQ-IDs` section).

## Relationships

- T065 "`HC3-a` / `HC3-c` cross-links target the orientation aggregator anchor instead of the inline-label anchor site, violating GOV-16 *Cross-link form*" - decision-overlap (once ceilings #1 / #2 carry governed IDs per this finding, any cross-link that currently targets a `#hard-ceiling-1` / `#hard-ceiling-2` auto-anchor must be repointed to the new INV / FRNT / ERR IDs; the same GOV-25-prohibited auto-anchor pattern recurs at every ceiling whose obligation lacks a governed ID)

---
# T065 - `HC3-a` / `HC3-c` cross-links target the orientation aggregator anchor instead of the inline-label anchor site, violating GOV-16 *Cross-link form*

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

Three cross-references in `binder/determinism-cancellation-failure.md` carry visible link text `HC3-a`, `HC3-b`, and `HC3-c` but resolve to `overview-and-orientation.md#hard-ceiling-3` — the orientation aggregator anchor that introduces ceiling #3 as a whole, not the bullet defining each label. GOV-16's *Cross-link form* clause (`governance/stable-inline-labels.md`) requires every cross-page reference to an inline label to resolve as a `#prefix-tail` fragment at the label's own anchor site. The `**HC3-a.**`–`**HC3-e.**` bullets in `hard-ceilings/ceilings-3-and-4.md` currently carry only the inline marker form with no co-located `<a id="hc3-a"></a>` anchor, so a naive repoint would dangle until the dual-form HTML anchors are added under GOV-16's *GOV-1 dual-form layout applies* clause.

## Solution approach

Add dual-form HTML anchors (`<a id="hc3-a"></a>` through `hc3-e`) to the `**HC3-a.**`–`**HC3-e.**` bullets in `hard-ceilings/ceilings-3-and-4.md`, satisfying GOV-16's *GOV-1 dual-form layout applies* clause. Repoint the three `HC3-a` / `HC3-b` / `HC3-c` cross-links in `binder/determinism-cancellation-failure.md` (the *Transport-class*, *Malformed-envelope class*, and *AJV-on-`args` class* bullets) from `overview-and-orientation.md#hard-ceiling-3` to the corresponding `ceilings-3-and-4.md#hc3-a` / `#hc3-b` / `#hc3-c` label anchor sites. Sweep the corpus for any other `HC3-<letter>` link still targeting the aggregator anchor and repoint it the same way.

## Solution constraints

- Out of scope: do not remove or repoint the `<a id="hard-ceiling-3"></a>` aggregator anchor on `overview-and-orientation.md`; it remains the legitimate target for orientation-level inbound links to the whole ceiling.

## Relationships

- T023 ""CIO-N rules above" and the five-site co-edit "(in this page)" point to anchors on the sibling page" - same-cluster (same misdirection pattern — text implies an in-page target but the actual governed site is on a sibling page).
# T066 - README links to a non-existent `docs/spec-sweeps.md`

**Original heading:** README references a non-existent `docs/spec-sweeps.md` tracking artifact
**Original section:** docs/spec_topics/pi-integration-contract/ (diagnostic-emission, patch-skew, provider-error, unknown-reason, subagent, version-bump-intro/triggers/step2/step2b)
**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`README.md:35` (inside the `## Status` section) points readers at `docs/spec-sweeps.md` as the tracking artifact for a deferred *load-bearing* qualifier rewrite sweep. No such file exists anywhere under `docs/` — a recursive search of the working tree finds the path only in `.git/logs/` and in transient files under `.pi/tmp/` (which document an earlier state in which the file *did* exist and was subsequently deleted). The `load-bearing qualifier rewrite` phrase the README invokes is likewise not present in any current docs file.

The companion `docs/spec-review.md` and `docs/spec-review-parked.md` both currently report `0` open / parked findings, and `docs/plan.md` has no leaves authored. The "deferred sweep" the README is parking therefore has no live tracking surface anywhere in the repository: a contributor who clicks the README link to understand pending corpus-wide sweeps lands on a 404 and cannot recover the workflow the paragraph describes.

## Spec Documents

- `README.md` — `## Status` section, paragraph at lines 33–36 (edited)
- `docs/spec-review.md` — read to confirm no open sweep entry (read-only)
- `docs/spec-review-parked.md` — read to confirm no parked sweep entry (read-only)
- `docs/spec-sweeps.md` — target file; create only under Option A (option-dependent)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(`docs/plan.md` exists but contains no authored leaves; nothing references the sweep or the README Status paragraph.)

## Consequence

**Severity:** advisory

A broken README link in the section that documents the project's spec-maintenance workflow. Implementation is not blocked, but the documented "follow the link to see pending sweeps" recovery path is non-functional, and a contributor reading the README cannot tell whether the *load-bearing* qualifier rewrite is parked-and-tracked, parked-and-untracked, or already resolved.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Create `docs/spec-sweeps.md` and keep the link live

- **Approach.** Author a minimal `docs/spec-sweeps.md` with a single entry for the *load-bearing* qualifier rewrite: a one-paragraph problem statement (why the sweep is too wide for the per-finding fix-loop), the affected surface (which spec pages overuse the *load-bearing* qualifier), the scope-decision blocker, and a status field (`Deferred — awaiting scope decision`).
- **Spec edits.** New file `docs/spec-sweeps.md`. No edit to `README.md` (the existing link starts resolving).
- **Pros.** Preserves the README's documented workflow verbatim; gives future contributors a place to add new deferred sweeps without needing to re-amend the README; matches the shape that previously existed (per the git log and `.pi/tmp/` history).
- **Cons.** Reconstitutes a tracking artifact whose prior incarnation was deliberately deleted; requires recovering or re-authoring the *load-bearing* sweep's scope description, which is no longer present in any current doc.
- **Risks.** If the original deletion was intentional (e.g. the sweep was retired), this re-introduces dead workflow surface.

### Option B — Remove the dangling reference from README

- **Approach.** Rewrite the `## Status` paragraph at `README.md:33–36` to drop the `docs/spec-sweeps.md` link and the *load-bearing* qualifier-rewrite mention. If there are currently no deferred sweeps, simplify to a single sentence: spec-review work lives in `docs/spec-review.md` (per-finding fixes processed bottom-up by `/fix-spec-shape-single-findings`).
- **Spec edits.** `README.md` lines 33–36 — rewrite as above; no new file.
- **Pros.** Matches the present reality (no current tracking file, no live sweep entry); smallest possible change; no resurrected workflow surface.
- **Cons.** Loses the documented escape hatch for parking future too-wide sweeps; a future sweep that needs parking has to re-introduce both the file and the README pointer.
- **Risks.** None material.

### Option C — Inline the sweep description in the README

- **Approach.** Replace the link with an inline 2–3 sentence description of the *load-bearing* qualifier sweep inside the README `## Status` paragraph itself.
- **Spec edits.** `README.md` lines 33–36 only.
- **Pros.** No new file; the parked sweep stays visible.
- **Cons.** Bloats the README with workflow detail it normally delegates; doesn't generalise — a second deferred sweep forces creating `docs/spec-sweeps.md` anyway.
- **Risks.** Re-creates the same drift problem one sweep later.

### Recommendation

Option B. The sibling tracking files (`docs/spec-review.md`, `docs/spec-review-parked.md`) both currently report zero findings, the *load-bearing* qualifier rewrite has no description in any live doc, and the spec corpus is otherwise in a clean state — there is nothing left for `docs/spec-sweeps.md` to track. Rewriting the README paragraph to drop the link is the minimal change that makes the README truthful today; if a deferred sweep needs parking later, the workflow re-introduces both the file and the pointer at that point. Implementer must watch: do not delete the entire `## Status` paragraph — the `docs/spec-review.md` reference and the `/fix-spec-shape-single-findings` mention remain accurate and should be preserved.

## Relationships

None

---

# T067 - Pi behavioural presuppositions lack authoritative behavioural pointers

**Kind:** external-entities
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The `pi-integration-contract/` behavioural-presupposition paragraphs split into two regimes. One regime pins an authoritative in-tree evidence source at the loom 1.0 Pi-SDK pin — e.g. the snapshot/restore preconditions in `tool-registration-lifetime.md` and `#custom-message-context-entry-presupposition` in `runtime-event-channel.md` (citing `convertToLlm` in `dist/core/messages.js`). The other regime cites only the type-surface site the property is *not* encoded in and defers to the version-bump editorial checklist with no pointer to where the property authoritatively holds — including `#messages-chronological-order-presupposition`, `#getcommands-completeness-presupposition`, `#register-tool-post-startup-presupposition`, `#provider-overflow-wording-presupposition`, and the model-registry, settings-write-back, `cwd == project root`, `dispose()`-mid-`abort()`, and `complete()` presuppositions. An auditor reading the corresponding item of the *Editorial-review checklist for unpinned host presuppositions* in `version-bump-step2.md` is told what property to verify but not where in the candidate Pi minor (or provider error format) the answer lives, so the diff-target must be re-discovered on every bump and a presupposition can silently weaken across a minor.

## Solution approach

Add an *Authoritative source* pointer to each behavioural-presupposition paragraph that lacks one, alongside its existing surface-inventory citation, following the precedent set by `tool-registration-lifetime.md`'s snapshot/restore precondition and `runtime-event-channel.md`'s `#custom-message-context-entry-presupposition`. For Pi-/`@earendil-works/*`-owned behaviour cite the source path at the loom 1.0 Pi-SDK pin; for provider-owned behaviour (`#provider-overflow-wording-presupposition`) cite the per-provider error-format reference that defines the canonical wording; where Pi publishes no documentation for the property, state that and pin the observed implementation file. Mirror the pointer on the corresponding item of the *Editorial-review checklist for unpinned host presuppositions* in `version-bump-step2.md` so each checklist entry is self-contained, and add a head-of-checklist rule requiring every newly-added presupposition to carry a behavioural pointer at landing.

## Solution constraints

- Out of scope: the snapshot/restore precondition in `tool-registration-lifetime.md` and `#custom-message-context-entry-presupposition` in `runtime-event-channel.md` are already compliant — do not modify or re-pin their evidence trails.
- Pointers to bundler-output (`dist/**`) paths must carry the existing "known-fragile evidence" flag so textual-diffability failure routes to the established version-bump recovery path.

## Relationships

None
# T068 - Operator-always-present invariant asserted without a Pi-side guarantee

**Kind:** assumptions, scope, placement
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The `operator-v1-invariant` — every loom invocation runs inside an active Pi TUI session, so an operator is always present — is asserted only inside the `operator` glossary entry (anchor `#operator-v1-invariant`), a page whose header disclaims authority over canonical content ("if a glossary entry and its canonical page disagree, the canonical page wins"). No PIC page or Pi-host citation pins the precondition that Pi dispatches a registered slash-command handler only inside an interactive TUI session: `host-prerequisites.md` enumerates four Pi-side prerequisites and four host-behaviour presuppositions, none of which covers it, and `capability-probe.md` does not probe for an attached TUI. The invariant is load-bearing for the Runtime observability NFR in `overview-and-orientation.md`, the `display: true` error rendering in `slash-invocation.md` SLSH-3, and the `/reload`-only degraded-state recovery branch, so an implementer cannot tell whether to trust it unconditionally, capability-probe for TUI presence, or fail-load when no surface exists. A future Pi minor adding a headless or batch dispatch mode would silently violate it with no editorial-review gate to catch it.

## Solution approach

Promote the operator-always-present invariant to a normative host-behaviour presupposition on `host-prerequisites.md`, co-located with the existing presuppositions block (`#degraded-state-host-prerequisites`), carrying a new stable anchor and stating that Pi dispatches a registered slash-command handler only inside an interactive TUI session for the pinned Pi-SDK range and that the operator-facing channel's behaviour outside such a session is undefined. Add a forward-link from the new anchor to the deferred non-interactive surfaces in `future-considerations/surface-extensions.md` (`loom test`, the non-loom programmatic harness) as the out-of-scope paths it excludes. Add a re-audit checklist item to the Pi version bump procedure (`version-bump-intro.md#pi-version-bump-procedure`) so each Pi minor re-checks the dispatch-mode contract by editorial review. Rewrite the inline invariant prose in the `operator` glossary entry as a descriptive forward-link to the new anchor, and add a forward-link from the Runtime observability NFR bullet in `overview-and-orientation.md` to the new anchor as the source of the always-present-operator precondition.

## Solution constraints

- The new presupposition states a host-behaviour assumption loom presupposes, not a binding obligation on Pi; phrase it as presupposed Pi behaviour like sibling presuppositions (a)–(d), not as a `Pi MUST` directive.

## Relationships

- T005 "Orientation NFR refers to `loom-system-note` as a pre-existing Pi channel without flagging the registration step" — same-cluster (PIC-channel claims in orientation prose that need a clean pointer at the normative PIC owner).
# T069 - Object indexed-access static semantics are undefined

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`expressions.md`'s *Supported forms* indexed-access bullet admits `a["b"]` / `a[0]` / `a[i]` against an object-value receiver but never pins the static-typing rules for that case. Three questions are unanswered: the required type of the index expression for an object receiver (must it be `string`; is `integer` rejected), whether the index must be a string literal or whether arbitrary dynamic string expressions are admitted, and the static result type of `obj[k]` (the field's declared type TS-style, or the union of all declared field types `values()`-style). Two reasonable implementers diverge on what `let v = obj["b"]` types as, whether `obj[0]` parses, and whether the parser must distinguish literal-key from dynamic-key bracket access — silently mistyping downstream `let`-bindings and `match` scrutinees and making conformance tests on `obj[k]` unwritable.

## Solution approach

Clarify the indexed-access bullet in `expressions.md`'s *Supported forms* to pin the static semantics of `obj[k]` on an object-typed receiver: the index expression must be of type `string`, with non-string indices rejected at parse time (registering the corresponding parse-time diagnostic in `code-registry-parse.md`), and the result type is the union of the receiver's declared field types — the same element type `values()` produces — applied uniformly with no literal-key/dynamic-key distinction, so authors wanting the per-field declared type use member access (`obj.fieldName`). State that the index expression names a loom-side name per `runtime-value-model.md`, not a wire name. Add a forward-link from the bullet to `loom/runtime/missing-object-key` so the read order is parse-time key-type check then runtime missing-key panic.

## Solution constraints

- Out of scope: TYPE-8's field-wise object-type compatibility scope, owned by T074 — do not redefine structural object-type compatibility here.

## Relationships

- T008 "Indexed-access runtime disposition not cross-referenced from `expressions.md`" - co-resolve (the runtime side is in fact already specified in `error-model.md` / `code-registry-runtime.md`; once this finding's edit cross-references those, the sibling finding largely closes)
- T074 "TYPE-8 field-wise compatibility scope (named schema vs inline object type) is ambiguous" - same-cluster (both touch how object types behave under static rules; resolve independently)
- T073 "Cross-type `==` / `!=` disposition is unspecified" - same-cluster (same pattern: an operator silent on a corner of its type domain)
# T070 - Schema-slug collision posture is pinned only for the `pi.registerTool` cache, leaving the `$defs` hoist and the validator cache silent

**Kind:** completeness, error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The schema slug (16-hex SHA-256 truncation, a 64-bit value with non-zero collision probability) is reused as a content-addressed key at three sites: the `__inline_<slug>` `$defs` dedup in `schema-subset.md`'s *Lowering Algorithm* step 2, the prompt-mode `pi.registerTool` registration cache in `pi-integration-contract/tool-registration-lifetime.md`, and the AJV compiled-validator cache. Only the registration cache has a defined collision posture — a byte-equality check on a slug hit, with a `loom/runtime/registration-cache-collision` diagnostic and counter-suffixed disambiguation. The `$defs` hoist states one-entry deduplication as a property rather than a check and is silent on non-byte-identical fragments that collide, while the validator-cache rule exists only as a non-normative *Implementation hint*, so the normative `SchemaValidator` contract (PIC-11) owns no collision rule. A conformant runtime can therefore silently merge two distinct inline schemas into one `$defs` entry or serve a wrong compiled validator with no surfacing diagnostic.

## Solution approach

Add a normative invariant to `schema-subset.md`'s *Canonical schema hash* section after the `synthesised-names` step requiring any slug-keyed cache or dedup table to byte-verify the new entry's canonical-form bytes against the cached bytes on a slug match before treating them as the same fragment, and to surface a diagnostic rather than silently dedup or reuse on mismatch. Rewrite the *Lowering Algorithm* step 2 byte-identical-fragment sentence so the one-`$defs`-entry property follows from that byte-equality check, with a collision at lowering time raising a load-time error. Promote the validator-cache collision rule out of `implementation-notes.md`'s non-normative *Implementation hint* into the normative `SchemaValidator` contract at PIC-11 in `pi-integration-contract/host-interfaces-services.md`. Keep the load-time `$defs`-hoist diagnostic distinct from the runtime validator-cache and registration-cache diagnostics.

## Solution constraints

- Out of scope: the *Canonical form* bullet's numeric-keyword serialisation list in `schema-subset.md`'s *Canonical schema hash* section — owned by T071.
- The existing prompt-mode byte-equality and counter-suffixed-disambiguation rule in `tool-registration-lifetime.md` must remain intact as the runtime-event application of the general rule; do not weaken or relocate it.

## Relationships

None
# T071 - Canonical hash recipe cites keywords the lowered subset never emits (`default`, `minLength`, `maxItems`)

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The *Canonical schema hash* step 2 ("Canonical form") in `schema-subset.md` names JSON Schema keywords that the lowered subset never emits. The numeric-literal serialisation sub-bullet lists `default` alongside `const` and `enum` as positions where numeric literals appear, but `default` is a runtime-filled surface-syntax feature that the binder never lowers into the schema. The trailing sentence names `minLength`/`maxItems` as the subset's integer-valued structural keywords, yet the top-of-file enumeration rejects all such keywords at parse time, so the lowered fragment contains none. An implementer wiring the canonical-hash recipe is left to guess whether the subset secretly emits these keywords and must render them, and divergent guesses change the SHA-256 digest and therefore every synthesised name and validator-cache key.

## Solution approach

Rewrite the numeric-literal serialisation sub-bullet of step 2's "Canonical form" in `docs/spec_topics/schema-subset.md` so the numeric-literal positions read `const` and `enum`, dropping `default` — these are the only lowered-subset sites where numeric literals can appear. Delete the trailing sentence naming `minLength`/`maxItems` as the subset's integer-valued structural keywords, since the lowered subset has no such keywords.

## Solution constraints

- Preserve the cross-reference into the binder's `integer`/`number` rendering algorithm (BNDR-4 / BNDR-5 / BNDR-6) and the echo-formatter borrow carve-out (its `(default)` mention names the binder echo-side tag, not a JSON Schema `default` keyword).
- Out of scope: the schema-slug collision posture and the `$defs`-hoist / validator-cache content owned by T070.

## Relationships

- T070 "Schema-slug collision posture is pinned only for the `pi.registerTool` cache, leaving the `$defs` hoist and the validator cache silent" - same-cluster (immediately adjacent paragraphs in the same *Canonical schema hash* section; resolve independently)
# T072 - `RestOfLine` terminal in `DocComment` production is undefined

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `DocComment ::= ("///" RestOfLine "\n")+` production in `grammar.md`'s `///` placement section references a `RestOfLine` terminal that is defined nowhere in the spec corpus. The production's other tokens are unambiguous (`///` is a literal sigil; `\n` is the normalised newline from `lexical.md`), but as normative grammar it cannot be implemented or conformance-tested against an undefined terminal. Two implementers will each invent a denotation, with edge-case divergence over whether `RestOfLine` admits an embedded `\r`, `\0`, characters outside the admitted Unicode set, or an empty body.

## Solution approach

Add a definition of the `RestOfLine` terminal to `lexical.md` adjacent to the **Newline normalisation** bullet it depends on, denoting a possibly-empty maximal run of source characters containing no normalised `\n` (and therefore no `\r`), with no escape processing applied. Add a cross-reference to that definition beneath the `DocComment` production in `grammar.md`'s `///` placement section, matching the existing "(joined per [Descriptions])" link style used two lines below the grammar block.

## Solution constraints

- The definition MUST admit an empty `RestOfLine` (a bare `///` line), because `descriptions.md` §Multi-line requires empty `///` lines to become blank lines.

## Relationships

None
# T073 - Cross-type `==` / `!=` disposition is unspecified

**Original heading:** `==` cross-type comparison disposition is unspecified (parse error vs always-false vs undefined)
**Original section:** docs/spec_topics/ language core (lexical, grammar, type-system, expressions, runtime-value-model, descriptions, schemas, schema-subset)
**Kind:** testability, error-model, implementability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`expressions.md` Equality says, in one sentence, that "`==` is structural: deep value equality for objects and arrays, value equality for primitives. There is no `===`." It states no parse-time admissibility rule on the operand pair. Ordering has the explicit `loom/parse/non-orderable-operands` diagnostic for any cross-type pair, with the spec actively directing implementers to "use `==` / `!=` for other types" — strongly implying `==` admits pairs that ordering rejects — but it never says what such an `==` evaluates to, and the parse registry has no `loom/parse/equality-type-mismatch` companion code.

`runtime-value-model.md` Equality recurses through arrays, objects, enums, and `Result`, but its bullets all presuppose comparable structure on both sides. The page mentions exactly two cross-shape outcomes in passing — cross-enum `Severity.High == OtherEnum.High` is `false`, and anonymous-union fallback `Severity.Low == "low"` is `false` — but never generalises to arbitrary cross-type pairs (`42 == true`, `Severity.High == 3`, `[1] == 1`, `null == "x"`, `Author { ... } == 7`, etc.).

The result is three live readings that two reasonable implementers will diverge on: (a) cross-type `==` is `loom/parse/equality-type-mismatch` at parse time, (b) cross-type `==` admits any pair and evaluates to `false` (extrapolating from the two cross-enum / anonymous-union asides), or (c) cross-type `==` is a runtime panic. No conformance test for `42 == true` can be written today.

## Spec Documents

- `docs/spec_topics/expressions.md` — `Equality` section (edited)
- `docs/spec_topics/runtime-value-model.md` — `Equality (==)` block (option-dependent; edited only under the always-`false` option to lift the two cross-shape asides into a general rule, or to add a back-reference under the parse-error option)
- `docs/spec_topics/diagnostics/code-registry-parse.md` — parse-diagnostic table (option-dependent; edited only under the parse-error option to add `loom/parse/equality-type-mismatch`)
- `docs/spec_topics/type-system.md` — `Type compatibility` (read-only; the parse-error option's admissibility predicate is naturally phrased in terms of the `⊑` relation defined here)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(Plan currently has no authored leaves.)

## Consequence

**Severity:** correctness

A loom author writing `if (x == "high")` where `x` is a `Severity` enum, or `if (n == null)` where `n: integer`, has no way to know whether the source loads, loads and always evaluates `false`, or loads and panics at runtime. Two conformant implementations of "loom 1.0" can disagree on whether such programs load at all, and the diagnostic-registry surface — which downstream tooling treats as closed — silently lacks a code one of the candidate readings requires.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Admit any pair, evaluate to `false`

- **Approach:** Lift the two cross-shape asides already in `runtime-value-model.md` (`Severity.High == OtherEnum.High` is `false`; `Severity.Low == "low"` is `false`) into a normative general rule: `==` / `!=` accept any two operand types and, when the static types share no common ground under structural equality, evaluate to `false` and `true` respectively. `expressions.md` Equality gains one sentence saying so and back-references the runtime-value-model rule.
- **Spec edits:** Add one paragraph to `runtime-value-model.md` Equality stating the general cross-type rule before the per-shape bullets. Add a single sentence in `expressions.md` Equality (and remove the "use `==` / `!=` for other types" suggestion under `non-orderable-operands` from being load-bearing on parse-rejection semantics — the suggestion is still correct under this option, since the comparison loads and produces a well-defined `false`).
- **Pros:** No new diagnostic code, no registry surface to enumerate, no closed-set maintenance under future type additions. Consistent with the existing asides. Lets generic code over `T | U` unions compare members without per-arm guards. Matches the JS/TS-flavoured surface loom inherits from.
- **Cons:** Silently swallows mistakes like `severity == 3` where the author meant `severity == Severity.High` — the program loads and the branch is dead. No early authoring feedback.
- **Risks:** Authors relying on linters to catch the dead-branch shape will get no help from the spec; tooling outside the diagnostic registry has to grow its own check.

### Option B — Parse-time `loom/parse/equality-type-mismatch`

- **Approach:** Mirror ordering: define a parse-time admissibility predicate on `==` / `!=` operand pairs and reject cross-type pairs at parse time with a new `loom/parse/equality-type-mismatch` code. The admissibility predicate is the symmetric closure of `⊑` — `L == R` is admissible iff `L ⊑ R` or `R ⊑ L` (so `integer == number` admits via TYPE-2, `Cat == Animal` admits via TYPE-8, and union members compare against any compatible peer).
- **Spec edits:** Add a paragraph to `expressions.md` Equality stating the admissibility predicate and naming the diagnostic. Add `loom/parse/equality-type-mismatch` to `docs/spec_topics/diagnostics/code-registry-parse.md` next to `non-orderable-operands`, with message template `'<op>' requires compatible operand types; got <left> and <right>` and hint `use a discriminated match or convert explicitly`. Remove the "use `==` / `!=` for other types" suggestion from the `non-orderable-operands` row, which becomes wrong under this option. The two cross-shape asides in `runtime-value-model.md` (`Severity.High == OtherEnum.High`, `Severity.Low == "low"`) are reframed as comparisons across positions the predicate still admits (anonymous-union strings share `⊑` with each other but not with a named enum; cross-enum admits only when one enum `⊑` the other, which loom 1.0 does not provide, so the example becomes a parse error rather than a `false` outcome).
- **Pros:** Early authoring feedback. Parallels `non-orderable-operands` so the operator surface is uniform. Closed diagnostic surface stays self-consistent.
- **Cons:** Rewrites the two cross-shape asides in `runtime-value-model.md` — `Severity.High == OtherEnum.High` is no longer expressible at all, and the spec must explicitly own that loss. More invasive than Option A.
- **Risks:** Generic code over a discriminated union may need explicit `match` arms where Option A allowed a single `==` guard.

### Recommendation

**Option A.** The two cross-shape asides already in `runtime-value-model.md` are precedent that the spec's intended direction is admit-and-`false`, and removing them under Option B requires the spec to retract behaviour it currently asserts. Option A also keeps the diagnostic-registry surface unchanged, which matters because that surface is closed and versioned under GOV-7/GOV-8 — adding a parse code is a heavier change than adding a single sentence on each of two pages.

Edge cases the implementer must watch:

- `NaN == NaN` (`true`) and `+0 == -0` (`true`) are same-type comparisons and continue to be governed by the existing primitive-equality bullet; the new cross-type rule does not touch them.
- The cross-enum example (`Severity.High == OtherEnum.High` is `false`) and the anonymous-union fallback (`Severity.Low == "low"` is `false`) become two instances of the general rule rather than standalone asides; the asides should be retained as worked examples but tagged as such.
- `==` between two values that share static type but whose runtime tags differ (enum variant vs anonymous-union string with the same wire value) is *not* a cross-type comparison in Option A's sense — it falls under the existing enum-row rule. The general cross-type rule applies only when the static types differ.

## Relationships

- T010 "`==` semantics are authoritative on `runtime-value-model.md` but `expressions.md` Equality neither restates nor links them" - co-resolve ((Option A's edit naturally adds the back-reference; the consolidation fix and the cross-type-disposition fix land in the same paragraph on `expressions.md`).)

---

# T074 - TYPE-8 field-wise compatibility scope (named schema vs inline object type) is ambiguous

**Original heading:** TYPE-8 field-wise compatibility scope (named schema vs inline object type) is ambiguous
**Original section:** docs/spec_topics/ language core (lexical, grammar, type-system, expressions, runtime-value-model, descriptions, schemas, schema-subset)
**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`type-system.md` TYPE-8 says "an object type with declared fields `{ f₁: T₁, ... }` is `⊑` another object type with the same declared field set `{ f₁: U₁, ... }` iff `Tᵢ ⊑ Uᵢ` for every `i`," but the spec never pins which `Type` surface forms count as an "object type" for this rule. Two production-level candidates fit the phrase: the `ObjectType` non-terminal in `grammar.md` (inline anonymous `{ field: T, ... }` only), and `NamedType` whose resolved declaration is `schema X { ... }` (a named object schema). The Notes column reasons about `additionalProperties: false` in a way that applies to both, the Operational Definition routes through AJV (which sees both as the same lowered shape after `$ref` deref), and TYPE-1 already covers the identical-named-schema and identical-inline-object cases — leaving the cross-form case (one side a named schema, the other an inline-object type with the same field shape) and the cross-named-schema case (two distinct named schemas with identical field shapes) governed by no parser-visible structural rule.

A conformance tester cannot derive a deterministic verdict for any of these mixed cases:

- `let x: { name: string, age: integer } = author_value` where `author_value: Author` and `schema Author { name: string, age: integer }`.
- `let y: Author = inline_value` where `inline_value: { name: string, age: integer }`.
- `let z: Author = other_value` where `other_value: Author2` and `Author` and `Author2` declare the same fields.

Under TYPE-8 read structurally each is admissible; read nominally each is `loom/parse/let-rhs-type-mismatch`; under "fall through to AJV" each is admitted but at runtime rather than parse time. The Operational Definition's AJV reading would admit all three (the lowered fragments are byte-identical or `$ref`-equivalent after dereferencing), but the explicit list of "structural cases the parser must recognise" is declared closed, so the parser cannot lean on AJV here — TYPE-8 must decide on its own surface, and its wording does not.

## Spec Documents

- `docs/spec_topics/type-system.md` — TYPE-8 row and surrounding "Structural cases the parser must recognise" prose (edited)
- `docs/spec_topics/grammar.md` — `ObjectType` / `NamedType` productions (read-only)
- `docs/spec_topics/schemas.md` — object-schema declaration form (read-only)
- `docs/spec_topics/schema-subset.md` — lowering algorithm, `__inline_<slug>` hoisting, named-schema `$defs` entries (read-only; informs the AJV equivalence behind the structural question)
- `docs/spec_topics/diagnostics/code-registry-parse.md` — `loom/parse/let-rhs-type-mismatch`, `loom/parse/invoke-arg-type-mismatch`, `loom/parse/fn-arg-type-mismatch` rows (option-dependent: the registered messages may need a one-line scope note if the verdict is nominal)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project's `plan.md` has no leaves yet — the Horizontal, MVP, and Vertical sections are placeholder.)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on parse-time admissibility for any mixed named-schema / inline-object assignment. A nominal implementer rejects code a structural implementer accepts; a "fall through to AJV" implementer admits all three cases at parse time but defers the failure to a runtime validation surface at an unrelated call site. The divergence is observable to authors as inconsistent diagnostic positioning (parse error vs runtime AJV failure vs no failure at all), and propagates into the `loom/parse/*-type-mismatch` test corpus.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Structural across both surface forms (named schemas and inline object types)

- **Approach:** TYPE-8 explicitly admits both `ObjectType` and `NamedType` whose resolution is an object schema. Field-wise compatibility ignores how each side is spelled.
- **Spec edits:** Rewrite the TYPE-8 row to say "an object type — either an inline `ObjectType` or a `NamedType` whose declaration is `schema X { ... }`, after named-type resolution — with declared fields …". Add one sentence stating that two named schemas with identical declared field sets are mutually compatible, and that the cross-form case (named ↔ inline) is admitted. Glossary entry for "object type" covering both forms.
- **Pros:** Matches the Operational Definition's AJV reading (no parse/runtime divergence). Matches TypeScript surface intuition the influences page already cites. No churn at call sites that hand an inline-typed payload to a named-schema slot.
- **Cons:** Eliminates the nominal protection authors get from declaring named schemas — `schema UserId = { id: integer }` and `schema OrderId = { id: integer }` become interchangeable in every direction.
- **Risks:** Once admitted, narrowing to nominal later is a breaking change. Future generic-parameter extensions inherit structural semantics by default.

### Option B — Structural for inline objects only; named schemas are nominal under TYPE-1

- **Approach:** TYPE-8 scope is `ObjectType` only. A `NamedType` resolving to an object schema participates in `⊑` exclusively through TYPE-1 (identical named schema), TYPE-4 (variant-to-union), and TYPE-5 / TYPE-6 (union membership). A named schema on one side and an inline object on the other are incompatible regardless of field shape.
- **Spec edits:** Rewrite TYPE-8 row to scope it to inline `ObjectType`. Add a sentence: "A `NamedType` whose declaration is `schema X { ... }` is compatible only with another `NamedType` reference to the same schema (TYPE-1), with a union membership (TYPE-4/5/6), or with itself. A named-schema value is *not* `⊑` an inline object type with the same field shape, and vice versa — assign through an explicit construction or a typed `let` that names the target schema." Possibly add `loom/parse/named-schema-inline-object-mismatch` or fold under the existing `let-rhs-type-mismatch` family.
- **Pros:** Preserves the protection authors get from naming a schema — `UserId` and `OrderId` stay distinct even with identical field shapes. Parse-time decision is local: identifier equality (named) vs field-wise (inline). No deref required at the type-compatibility check.
- **Cons:** Diverges from the AJV-based Operational Definition — TYPE-8 becomes parser-stricter than its own safety net, so the "AJV safety net" framing in the section's lead paragraph needs to be qualified ("the safety net admits more pairs than the parser, but the parser's rejection is authoritative"). Authors must explicitly construct a named-schema value from an inline-typed source.
- **Risks:** Inline-object-type literature is sparse in loom corpus — authors may not expect a structural-vs-nominal split inside a single relation. Need a clear migration note for any examples that currently rely on cross-form admission.

### Option C — Structural across both forms, but only when the parser can statically dereference the named side

- **Approach:** TYPE-8 admits cross-form and cross-named-schema compatibility when the parser has the resolved declaration in hand at the check site; if the named side is across an unresolved boundary (e.g. an import that failed `loom/load/callee-has-errors`), the check skips to the runtime AJV safety net per the existing "Unresolvable operands" paragraph.
- **Spec edits:** Rewrite TYPE-8 to cover both forms (as Option A). Add a half-sentence noting that an unresolvable named operand defers to AJV, citing the "Unresolvable operands" paragraph already in the page.
- **Pros:** Aligns with AJV. Matches the spec's existing "skip to AJV when unresolvable" pattern. Avoids the deref-failure edge case forcing a parse error.
- **Cons:** Same nominal-protection loss as Option A. Adds one more "either parse-time or runtime" surface for testers to enumerate.
- **Risks:** The "static dereference" requirement is implicit in TYPE-7's element-wise check too; admitting it here without restating it for TYPE-7 invites a future drift question.

### Recommendation

Adopt **Option B** (named schemas are nominal under TYPE-1; TYPE-8 scopes to inline `ObjectType` only). Rationale: (i) the spec already treats named schemas as identity-bearing entities elsewhere — `loom/parse/wire-name-collision` is per-named-schema, `$defs` is keyed by name, error messages cite the schema name, and `descriptions.md` motivates named schemas as "preferred for reuse and for getting a name in error messages"; (ii) Option A silently eliminates the only protection an author gets from naming a schema; (iii) the AJV-divergence cost (qualifying the "safety net" framing) is one sentence, while the cross-form admission cost (designing the "named schema with identical fields" subtyping graph) is open-ended.

Edge cases the implementer must watch:

- A value of an inline object type passed where a named schema is expected: parse error, not runtime AJV failure.
- A named-schema value passed where an inline object type is expected: parse error, even when the fields line up.
- Two distinct named schemas with byte-identical lowered fragments: incompatible. The canonical-hash slug coincidence (see the related slug-collision finding) is irrelevant — name identity, not lowered identity, drives `⊑`.
- The Operational Definition paragraph at the top of *Type compatibility* must be qualified so readers do not infer from "AJV-validates against the lowering of T₂" that any pair admitted by AJV is admitted by `⊑`.

## Relationships

- T070 "Schema-slug collision posture is pinned only for the `pi.registerTool` cache, leaving the `$defs` hoist and the validator cache silent" - same-cluster (both findings touch the named-vs-structural identity question, but resolve independently — slug-collision is about runtime fragment identity, TYPE-8 is about parse-time type identity)

---

# T075 - Bare-source backslash: no diagnostic code is named

**Original heading:** `type-alias-cycle`/backslash-outside-string diagnostics: missing or unspecified codes
**Original section:** docs/spec_topics/ language core (lexical, grammar, type-system, expressions, runtime-value-model, descriptions, schemas, schema-subset)
**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`grammar.md` Newline continuation states "no `\` at end of line; backslash inside source is a parse error per [Lexical Structure]." `lexical.md` enumerates four backslash-adjacent codes — `loom/parse/illegal-escape` (a backslash inside a string literal followed by an unrecognised character), `loom/parse/invalid-unicode-escape`, `loom/parse/invalid-path-separator` (backslash inside a path literal), and the query-template analogues `loom/parse/illegal-template-escape` / `loom/parse/unterminated-template` — but names no code for a backslash that appears in source outside any string, path, or template-body context (e.g. a stray `\` between statements, or a `\` used as a line-continuation marker). `code-registry-parse.md` has no matching row either.

The corpus-wide convention (per `plan_topics/conventions.md` "Diagnostic message anchors") is that every parse error a test can assert is anchored by a code in the registry. The grammar.md sentence promises a parse error but no anchor exists, so a conformance test for "stray backslash in source" cannot be written against the registry and an implementer is free to surface the failure under any code (or as an opaque lexer error).

(The heading's `type-alias-cycle` half is stale: `loom/parse/type-alias-cycle` is already registered with full trigger semantics in `code-registry-parse.md` and cross-referenced from `schemas.md`. The real gap is the bare-source backslash.)

## Spec Documents

- `docs/spec_topics/lexical.md` — String literals / Path literals paragraphs (option-dependent)
- `docs/spec_topics/diagnostics/code-registry-parse.md` — lex/parse table (edited)
- `docs/spec_topics/grammar.md` — Newline continuation note that forward-references Lexical (read-only; cross-link target gains a stable anchor under option B)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(`plan.md` and `plan_topics/coverage-matrix.md` carry no leaves yet; no existing leaf is modified or blocked.)

## Consequence

**Severity:** correctness

Two conforming implementations may surface the same stray-backslash source under different codes (or under no code at all), and the registry-anchored conformance regime defined by `plan_topics/conventions.md` cannot assert the resulting message. The defect is narrow but real: it leaves one lexer-level failure mode outside the per-code test surface that every other parse error sits on.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Extend `loom/parse/illegal-escape` to cover bare-source backslash

- **Approach:** Broaden `illegal-escape`'s trigger from "backslash inside a regular string literal followed by an unrecognised character" to "backslash that does not introduce a recognised escape in its surrounding lexical context (string literal, query-template body — where the template form has its own code — or path literal)." Restate `lexical.md` Source files to say a bare backslash outside any string / path / template body surfaces as `loom/parse/illegal-escape` with `<char>` rendered as the following byte (or `<EOF>`).
- **Spec edits:** `lexical.md` String literals paragraph: add a sentence "A backslash that appears in source outside any string literal, path literal, or query-template body is also `loom/parse/illegal-escape`." `code-registry-parse.md` row 11: widen the *Trigger* cell to drop "inside a regular string literal." `grammar.md` line 180: replace "a parse error per [Lexical Structure]" with "`loom/parse/illegal-escape` per [Lexical Structure]."
- **Pros:** No new code; the registry stays smaller; the existing message template `illegal escape sequence: \\<char>` reads correctly for a stray backslash followed by any byte.
- **Cons:** The code's name advertises "escape," which is mildly misleading for a stray backslash with no surrounding string. Any test parameterised on context ("escape error in string" vs "stray backslash in source") must re-derive context from span info.
- **Risks:** A future migration that wants per-context separation must split the code back out, breaking message-anchored tests written against the widened form.

### Option B — Coin a new code `loom/parse/stray-backslash`

- **Approach:** Register a new lex-phase code for "backslash byte at a source position that is not inside a string literal, path literal, or query-template body." Leave `illegal-escape` semantics unchanged.
- **Spec edits:** `code-registry-parse.md`: add a row `loom/parse/stray-backslash | E | lex | Backslash byte in source outside any string literal, path literal, or query-template body. | [Lexical Structure](../lexical.md) | — | "stray backslash in source"`. `lexical.md` Source files: add a one-line bullet "A backslash byte outside any string literal, path literal, or query-template body is `loom/parse/stray-backslash`." `grammar.md` line 180: replace "a parse error per [Lexical Structure]" with "`loom/parse/stray-backslash` per [Lexical Structure]." If `lexical.md` does not already carry one, add a stable anchor `<a id="stray-backslash"></a>` adjacent to the new bullet for the grammar.md cross-link.
- **Pros:** The code's name matches what an author sees in the failure (no surrounding escape context). Each lexer-level failure mode keeps a 1:1 code mapping, matching the pattern already used for `invalid-path-separator` vs `illegal-escape` vs `illegal-template-escape`.
- **Cons:** Adds one more row to the parse-code registry for a rare authoring mistake.
- **Risks:** Per `plan_topics/conventions.md` REQ-ID discipline, new diagnostic sites land their REQ-IDs in the same edit; the row must respect the append-only/word-boundary-disjoint rules for the `loom/parse/…` prefix.

### Recommendation

Option B. The corpus already separates `invalid-path-separator`, `illegal-escape`, and `illegal-template-escape` by surrounding lexical context, so the per-context split is the established pattern; conflating bare-source backslash into `illegal-escape` cuts against that. Edge case to watch: a backslash immediately preceding a literal newline at top level should still trigger `stray-backslash` and not be silently re-interpreted as a line-continuation marker — Loom has no line-continuation marker (grammar.md is explicit on this), so the lexer must emit the code rather than join lines.

## Relationships

- T072 "`RestOfLine` terminal in `DocComment` production is undefined" - same-cluster (another grammar.md → lexical.md forward-reference where the referent is not actually defined; resolves independently)
- T009 "Integer-overflow arithmetic has no normative reference vector" - same-cluster (sibling testability gap on the same shard; independent fix)

---

# T076 - Language-core hidden assumptions: enum-tag sidecar, AJV-config silence, Markdown-by-providers claim

**Original heading:** Language-core hidden assumptions: enum-tag reattachment sidecar; AJV no-coercion config; bare-object carve-out resolution stage; "treated as Markdown by providers"
**Original section:** docs/spec_topics/ language core (lexical, grammar, type-system, expressions, runtime-value-model, descriptions, schemas, schema-subset)
**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

Three independent hidden assumptions sit in the language-core pages, each in a different file and each requiring a separately-scoped edit:

1. **Enum-tag reattachment has no machine-readable input.** `runtime-value-model.md`'s Wire-name translation rule says the inbound pass walks the validated JSON and, "at every position the schema annotates as a named enum, reattaches the declaring-enum tag for that position so the resulting value compares equal to a locally constructed variant of the same enum." But the Lowering Algorithm in `schema-subset.md` step 3 emits the same byte-identical fragment — `{ "type": "string", "enum": [...wire values...] }` — for both a named `enum` declaration and an anonymous string-literal union (`"a" | "b" | "c"`). Step 5 captures a wire-name translation sidecar but says nothing about named-enum positions. The runtime therefore has no way to tell, at an inbound validation site, which `enum`-typed positions need a tag reattached and which (anonymous unions) must remain bare strings. Equality semantics (`Severity.High == OtherEnum.High` is `false`; anonymous union arms compare as strings) depend on this distinction.

2. **`⊑` operational definition silently relies on AJV configuration.** `type-system.md` defines `T₁ ⊑ T₂` as "every value statically typed as `T₁` AJV-validates against the lowering of `T₂`." The reading is only well-defined under a specific AJV configuration — no `coerceTypes`, no `useDefaults`, validation against the Draft 2020-12 vocabulary — none of which is stated at this site. `implementation-notes.md` mentions the flags but is non-normative and labelled "Implementation hint"; `pi-integration-contract/host-interfaces-services.md` PIC-11 carries the no-conversion / no-defaults clauses on the `SchemaValidator` seam, but `⊑`'s definition is bound to the literal AJV reading rather than to that seam contract, so the dependency is invisible at the site that needs it.

3. **`descriptions.md` asserts external-provider behaviour as fact.** "Description text is treated as Markdown by providers; no transformation is performed." This is a normative-tone claim about how OpenAI, Anthropic, and other downstream consumers render schema description text. Loom controls only the bytes it ships; how a provider then renders them is outside the spec's authority. The sentence sits in a normative rule list alongside Placement, Multi-line, and Static-text rules that *are* loom's to fix.

(The original finding additionally raised a fourth concern — that the bare-object/`is-literal` carve-out assumes the callee kind is resolvable at parse time. That carve-out is decidable from the `tools:` entry's syntactic shape (bare Pi-tool name vs `./*.loom` path), which is in frontmatter and therefore parsed before any body's `is-literal` check runs; the concern does not stand and is dropped here.)

## Spec Documents

- `docs/spec_topics/schema-subset.md` — Lowering Algorithm (steps 3 and 5), Canonical schema hash (step 5, Synthesised names) (edited)
- `docs/spec_topics/runtime-value-model.md` — Wire-name translation paragraph (read-only; the rule it relies on is the one being added) (read-only)
- `docs/spec_topics/type-system.md` — Operational definition of `T₁ ⊑ T₂` (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-11 `SchemaValidator` contract (read-only; cited from the revised `⊑` definition) (read-only)
- `docs/spec_topics/descriptions.md` — "Markdown" bullet in the `///` description rule list (edited)
- `docs/spec_topics/implementation-notes.md` — Implementation hint paragraph naming the AJV flags (read-only; basis for what to move into the normative seam contract if option B route is preferred) (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`docs/plan.md` declares horizontal / MVP / vertical sections all as "_(No leaves yet — author per the template.)_"; there are no leaves to anchor against.)

## Consequence

**Severity:** correctness

Two reasonable implementers would diverge on enum-tag handling: one would store an out-of-band per-position named-enum map alongside the lowered schema; another would tag every `enum`-positioned validated string the same way and break anonymous-union equality. The `⊑` AJV-config gap is milder (the reference implementation happens to set the right flags) but leaves a conforming alternate-validator implementation free to enable coercion and silently widen the relation. The Markdown claim is advisory in isolation but normalises out-of-scope provider claims in a normative position.

## Solution Space

**Shape:** multiple
**State:** shaped

Three obligations, each in its own file and resolvable by a separate edit. The intended sequencing — smallest scope-bounding edits first, structural edits last — is given in the Recommendation block.

### Option A — Demote the Markdown-by-providers claim to a non-normative note

**Approach.** Replace the `descriptions.md` bullet "**Markdown.** Description text is treated as Markdown by providers; no transformation is performed." with two sentences split by what loom controls vs what it doesn't.

**Spec edits.**
- `descriptions.md`, the `///` rule list: change the bullet to "**No transformation.** Loom emits description text byte-for-byte into the lowered schema; no escaping, dedenting, or wrapping is performed beyond the multi-line join and common-leading-whitespace strip defined above." Append a non-normative sentence: "*(Non-normative.)* OpenAI and Anthropic schema consumers at loom 1.0 authoring time render description text as Markdown; authors writing Markdown can rely on that empirically, but the rendering is the provider's contract, not loom's."

**Pros.** One-line scope. Cleanly separates loom's contract from a downstream observation. Matches the pattern the spec already uses elsewhere for provenance / version-pinned external claims (e.g. `schema-subset.md` `*(Non-normative provenance.)*` paragraphs).

**Cons.** Adds a non-normative paragraph to a normative bullet list; readers who skim normative-only may miss the advisory.

**Risks.** None — the change is strictly de-scoping.

### Option B — State the `⊑` operational definition against the `SchemaValidator` seam contract

**Approach.** Reframe `T₁ ⊑ T₂` in terms of the PIC-11 seam, whose behavioural list already pins no-conversion / no-defaults / format-acceptance / determinism. Name the JSON Schema draft explicitly at the lowering site so the seam contract has a well-defined target.

**Spec edits.**
- `type-system.md`, **Operational definition** paragraph: replace "every value statically typed as `T₁` AJV-validates against the lowering of `T₂`" with "every value statically typed as `T₁` is accepted by the `SchemaValidator` seam ([PIC-11](./pi-integration-contract/host-interfaces-services.md#schemavalidator-interface)) against the lowering of `T₂`. The seam's no-conversion clause is load-bearing here: any validator that performs type coercion before checking would widen the relation."
- `schema-subset.md`, Subset preamble (where Draft 2020-12 is listed as a bullet): add a sentence anchoring the validation target — "All occurrences of 'validates' / 'is accepted by the validator' in normative prose are against JSON Schema 2020-12 semantics; conforming validators MUST evaluate lowered schemas under that draft."

**Pros.** Removes the AJV name from a normative semantic relation (aligned with the cluster-related finding *"AJV named in normative prose across the corpus..."*). The no-coercion assumption stops being hidden — it becomes a contract bullet the relation explicitly cites. Adds zero new mechanism: PIC-11 already states the constraint; the edit just routes the dependency through it.

**Cons.** Requires a reader to follow a one-hop cross-reference (`type-system.md` → PIC-11) to see why `⊑` is well-defined under, e.g., a hypothetical Ajv `coerceTypes: true` deployment.

**Risks.** Must land coherently with the related corpus-wide AJV→seam rewrite (see Related Findings) — landing it here while leaving `invocation.md`, `binder-bypass-and-envelope.md`, etc. still saying "AJV check" produces an inconsistent vocabulary mid-corpus.

### Option C — Add a per-position named-enum sidecar to the Lowering Algorithm

**Approach.** Extend step 5 of the Lowering Algorithm so the wire-name sidecar also carries, per JSON Pointer position, whether that position is a named-enum slot and which `enum` declaration it names. Rewrite the runtime-value-model inbound paragraph to read this map.

**Spec edits.**
- `schema-subset.md`, Lowering Algorithm step 5: change "**Wire-name translation** is captured in a sidecar map per schema (`{ loom: "first_name", wire: "FirstName" }`)" to "**Per-schema sidecar.** The lowering pass captures, alongside each `$defs` entry, a sidecar with two maps:
  1. *Wire-name translation* — `{ loom: "first_name", wire: "FirstName" }` per renamed field, used by both the validation pass (post-decode) and the construction pass (pre-encode); the lowered JSON Schema only ever sees wire names.
  2. *Named-enum positions* — a map keyed by JSON Pointer into the lowered schema fragment, valued by the *loom-side* name of the declaring `enum`. A position is included iff its source type was a named `enum` declaration; anonymous string-literal-union positions (`"a" | "b"`) are deliberately absent. The inbound translation pass in [Runtime Value Model — Wire-name translation](./runtime-value-model.md) reads this map to decide which validated string positions get the declaring-enum tag reattached."
- `runtime-value-model.md`, Wire-name translation inbound bullet: replace "at every position the schema annotates as a named enum, reattaches the declaring-enum tag for that position" with "at every position the lowering pass's *Named-enum positions* sidecar ([Schema Subset — Lowering Algorithm](./schema-subset.md#lowering-algorithm) step 5) maps to a declaring-enum name, reattaches that enum's tag to the validated string. Anonymous string-literal-union positions are absent from the sidecar and receive no tag — equality follows the string-primitive rule."

**Pros.** Closes the only observable correctness gap (cross-enum equality after model output). Keeps the lowered-schema bytes byte-identical (so the canonical hash is unaffected — the sidecar is by construction outside the hash input, which `schema-subset.md` already defines as "the lowered JSON Schema fragment"). Makes a property the spec already implies (named-vs-anonymous distinction surviving the validation boundary) into something an implementer can mechanically produce.

**Cons.** Touches both the lowering page and the value-model page in lockstep; an editor landing one without the other reintroduces the same gap with new prose.

**Risks.** The sidecar key (JSON Pointer into the lowered fragment) needs to be stable across discriminator-detection (step 6) and the lazy per-query document construction (step 4). The edit must say the pointers are computed against the per-`$defs` fragment, not against the lazy per-query document, so the same sidecar serves every query that includes the schema.

### Recommendation

Land all three options. They are independent in surface (`descriptions.md`; `type-system.md` + `schema-subset.md` preamble; `schema-subset.md` step 5 + `runtime-value-model.md`) and can be reviewed separately.

Order of landing — smallest scope-bounding edit first, structural edit last:

1. **Option A first** — single-bullet rewrite in `descriptions.md`, no cross-page touch, no related findings to coordinate with.
2. **Option B second** — needs to land coherently with the related corpus-wide AJV-naming finding, so doing it before C keeps the AJV cluster contained while C's mechanical work is in flight. If the corpus-wide AJV→seam rewrite is queued separately, defer the `type-system.md` half of option B and ship only the `schema-subset.md` Draft-2020-12 anchor sentence — the anchor is independently useful.
3. **Option C last** — touches two pages in lockstep and is the only obligation that introduces a new spec mechanism. Land after A and B to keep the diff surface small.

Edge cases the implementer must watch on Option C:
- Sidecar JSON Pointers are against each `$defs/<Name>` body, **not** the per-query document built lazily in step 4. The per-query construction copies pointers along with their referenced fragments; restating pointers as document-rooted would break the dedup property in step 2.
- Discriminator-detection (step 6) operates on the lowered `anyOf` form and must not mutate the sidecar — discriminator fields are `const`-typed strings, not `enum` positions, and stay absent from the *Named-enum positions* map.
- Loom-side `JSON.stringify` of an enum value yielding the bare wire string (per `runtime-value-model.md`) is unchanged by this edit: the sidecar drives inbound tag reattachment only; outbound construction already strips the tag via the existing non-enumerable-property scheme.

## Relationships

None

---

# T077 - Top-level loom return-type inference does not reconcile early-`return` operand types with the tail-expression type

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`functions.md` defines a `.loom` file's inferred return type as the type of its tail expression (wrapped in `Result<T, QueryError>` if any `?` appears in the body), and the same rule governs a `fn` body with no explicit return annotation ([Loom return type](./spec_topics/functions.md#loom-return-type)). `return.md` says `return expr` is type-checked against the enclosing scope's declared return type, but a top-level loom and an annotation-less `fn` have no declared return type, and the inference rule only mentions the tail expression. The language is therefore under-specified whenever such a body mixes a tail expression with one or more early `return expr` whose operand types differ: implementations diverge (tail-type-only, least-upper-bound, first-return-wins), and because the inferred type drives the `invoke<Schema>` static check and the runtime AJV net, the divergence is observable at cross-loom call sites. The `?`-implies-`Result<T, QueryError>` rule is likewise silent on what `T` is when early `return Ok(...)` operands disagree with the tail expression.

## Solution approach

Clarify the inferred-return-type rule at functions.md `#loom-return-type` so it reconciles the tail-expression type with every reachable early-`return expr` operand type, applying the same common-upper-bound discipline (`⊑`, type-system.md `#type-compatibility`) the spec already uses for `match` arms, ternary branches, and array literals; apply the same rule to `fn` bodies that omit a return annotation. Specify how the implicit `Result<T, QueryError>` wrapping interacts — what triggers it and over which payload types `T` is reconciled — when early `return` operands are themselves `Result`-typed rather than only when `?` appears. Update return.md's `return expr` type-checking bullet to forward to that inferred-return-type rule for the no-declared-return-type case. If the reconciliation can fail with no common upper bound, add a sibling parse diagnostic to diagnostics/code-registry-parse.md alongside `loom/parse/array-no-common-type`.

## Solution constraints

- Do not modify the existing common-upper-bound (`⊑`) rules for `match` arms, ternary branches, or array literals (type-system.md `#type-compatibility`, expressions.md, errors-and-results); this finding extends that precedent to loom / annotation-less-`fn` return inference, it does not redefine it.

## Relationships

- T016 "Snippets reference undeclared `ReviewScore`/unbound `code`; foot-gun mentions a linter the spec never scopes" - same-cluster (same file, illustrative-snippet concern, independent)
# T078 - SLSH-5 `<parent_path>:<line>` is defined only for `invoke(...)` call sites, not for `.loom`-callable bare-identifier calls

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

SLSH-5 (`docs/spec_topics/slash-invocation.md`, anchor `id="slsh-5"`) defines the chain-suffix `<parent_path>:<line>` as the source line of the textual `invoke(` token in the parent. But a `.loom` callable registered in `tools:` and called by the bare-identifier form `my_summariser(args)` is operationally equivalent to `invoke(...)` per tool-calls.md "Relationship with `invoke`" — it surfaces failure through the same `invoke_callee` `QueryError`, so SLSH-5's chain-suffix obligation fires on a parent line that carries no `invoke(` token. SLSH-4 makes the rendered string conformance-testable, so two conforming renderers diverge observably (line of the bare-identifier call, `:0`, or hop dropped).

## Solution approach

Rewrite SLSH-5's `<parent_path>:<line>` definition so the line is sourced from the parent's call-site span for whichever syntactic form produced the `invoke_callee` hop — the `invoke(` token of a literal `invoke(...)` expression, or the callee-name identifier of a `.loom`-callable bare-identifier call. Add a worked example beside the existing Single-hop and Multi-hop bullets covering a `.loom`-callable bare-identifier parent frame. Add a forward-link to the Resolution snapshot (`id="resolution-snapshot"` in `frontmatter/frontmatter-fields-b-and-templates.md`), the load-time table that already records `.loom`-callable call-site identity.

## Solution constraints

- Out of scope: the model-driven tool-call surface — a `.loom` callable invoked by the model during a `@`-query loop feeds failure back as a tool-error result, not an `invoke_callee` cascade, so SLSH-5 emits no chain suffix for it.

## Relationships

- T079 "SLSH-4 template cells and SLSH-5 worked examples disagree on whether inline backticks are emitted" - same-cluster (touches the same SLSH-4/SLSH-5 conformance surface; resolve independently — the backticks question is about Markdown rendering, this one is about `<line>` sourcing)
- T014 "SLSH-3 slash-boundary scoping is asserted only through an indirect parenthetical" - same-cluster (both findings argue SLSH-5's surface is wider than its current framing admits; the scope-move fix would not by itself fix the `<line>` definition, and vice versa)
# T079 - SLSH-4 template cells and SLSH-5 worked examples disagree on whether inline backticks are emitted

**Original heading:** SLSH-4 normative templates contradict SLSH-5 worked examples on literal backticks
**Original section:** docs/spec_topics/ functions, control-flow, return, bindings, imports, invocation, slash-invocation, implementation-notes
**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

SLSH-4 declares the per-`kind` table rows "normative templates" and requires renderers to "emit the surrounding template text verbatim; only the `<…>` placeholders are interpolated." The `System note shape` cells, however, are written in Markdown and carry inline backticks around tokens such as `` `/<name>` ``, `` `Err` ``, `` `transport` ``, `` `<message>` ``, `` `<tool_name>` ``, etc. A literal reading of "emit … verbatim" yields a system note that contains the U+0060 backtick characters; a Markdown-formatting reading drops them. The SLSH-5 worked examples (`loom /entry returned Err: transport — connection reset …`) render with no backticks, silently endorsing the formatting reading — but they never say so. Two conforming implementations can therefore produce different bytes for the same `QueryError`, and the conformance-test invitation in SLSH-4 ("MAY assert on the exact rendered string") has no single answer to assert against.

## Spec Documents

- `docs/spec_topics/slash-invocation.md` — SLSH-4 table and SLSH-5 worked examples (edited)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(No plan leaves yet cite SLSH-4/SLSH-5; the plan currently has no authored leaves.)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on every system note: one emits literal backticks (e.g. `` loom `/entry` returned `Err`: `transport` — connection reset ``), the other emits clean prose. Either output passes the SLSH-4 MUST under one reading and fails it under the other, and any conformance test asserting on the rendered string locks in one side arbitrarily.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Declare backticks Markdown-only and re-render the cells

**Approach.** Add a single sentence to the SLSH-4 paragraph stating that inline backticks in the `System note shape` cells are Markdown code-span formatting and are not part of the emitted string; only the literal text between/around the placeholders is normative. Optionally re-render the table cells without inline backticks (using a fenced/raw representation) so the verbatim claim no longer needs an exception.

**Spec edits.**
- `slash-invocation.md` SLSH-4 prose: append a clarifier — "Inline backticks in the `System note shape` cells below are Markdown code-span formatting for readability and are not emitted; renderers emit the cell text with backticks removed."
- (Optional) rewrite each row's third column as a code block or plain-text cell with no inline backticks, so the literal target string is read directly.

**Pros.**
- Matches what the SLSH-5 worked examples already render.
- System notes stay human-readable in the Pi TUI (no stray backticks in user-visible output).
- One-line spec edit if the cells are left as-is.

**Cons.**
- Keeps a small reader-side rule ("strip the backticks") between the table and the conformance assertion.

**Risks.**
- A future row author may add a row intending a backtick to be literal; the clarifier should explicitly forbid that by saying all inline backticks in this table are formatting, with no exceptions.

### Option B — Make the rendered output literally include the backticks

**Approach.** Treat the cells as truly verbatim. Rewrite the SLSH-5 worked examples to include the backticks, and accept that user-facing system notes contain U+0060 characters around tokens.

**Spec edits.**
- `slash-invocation.md` SLSH-5 worked examples: regenerate each example with the backticks the SLSH-4 cell would produce (e.g. `` loom `/entry` returned `Err`: `transport` — connection reset from `/abs/.../child.loom` invoked at `/abs/.../parent.loom:42` ``).

**Pros.**
- "Emit verbatim" stays true without any side rule.

**Cons.**
- User-visible system notes contain stray backticks, which Pi's TUI will not render as code spans (system notes are plain text per PIC). The output is uglier and harder to read.
- Inconsistent with how every other plain-text diagnostic in the spec renders identifiers.

**Risks.**
- Forces Pi-side rendering to either special-case `loom-system-note` text as Markdown or accept the visible backticks; both are downstream costs.

### Recommendation

Option A. The SLSH-5 worked examples already encode the intended output, and Pi system notes are plain text — backticks in the rendered string would degrade UX with no offsetting benefit. The clarifier sentence in SLSH-4 must be unambiguous that all inline backticks in the `System note shape` column are formatting, so the rule remains total against future rows. Edge case the implementer must watch: literal backticks **inside** an interpolated placeholder (e.g. a `<message>` containing backticks) are part of the model-sourced free-form content and pass through unchanged — the strip-backticks rule applies only to the surrounding template, not to placeholder substitutions.

## Relationships

- T078 "SLSH-5 `<parent_path>:<line>` is defined only for `invoke(...)` call sites, not for `.loom`-callable bare-identifier calls" - same-cluster (both pin down the conformance-testable rendered string; resolve independently)
- T014 "SLSH-3 slash-boundary scoping is asserted only through an indirect parenthetical" - same-cluster (scoping question, orthogonal to the literal-text question here)

---

# T080 - Discovery-root containment predicate is undefined at the `invoke-path-escape` site

**Kind:** implementability, assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`invocation.md` *Resolution* gates every `invoke(...)` literal and every `tools:` `.loom` entry by requiring the `realpath`-resolved callee to "lie within the union of discovery roots" active for the session, and INV-1 raises the identical containment semantics to a MUST on both the load-time check and the runtime-open re-check. Neither *Resolution* nor the cross-linked *Discovery roots* section defines what "within" means as a predicate over two paths. A naive prefix test admits sibling-prefix escape — resolved `/proj/foo-bar/evil.loom` passes `startsWith("/proj/foo")` while sitting outside root `/proj/foo` — so two conformant implementations can disagree on this security-load-bearing check and one silently reintroduces the escape the realpath step exists to defeat.

## Solution approach

Clarify the *Resolution* paragraph of `invocation.md` to define containment as segment-boundary containment over the canonical absolute paths `realpath` returns: a resolved path is within a discovery root when, after normalisation strips any trailing separator from the root, it either equals the root byte-for-byte or begins with the root followed by a single host path separator. Narrow INV-1's MUST language to name this segment-boundary predicate so the load-time and runtime-open call sites visibly share the same tightened check.

## Solution constraints

- Out of scope: the case-sensitivity / case-folding of the comparison is owned by T081 — state the predicate in byte-equality terms only.

## Relationships

- T081 "Filesystem case-sensitivity is unspecified for `.warp` import basenames and for the `invoke` / `tools:` discovery-root containment check" - decision-overlap (defines whether the byte-equality predicate folds case before comparison; resolve after this one so the case-folding rule lands on a stable containment definition)
# T081 - Filesystem case-sensitivity is unspecified for `.warp` import basenames and for the `invoke` / `tools:` discovery-root containment check

**Original heading:** Filesystem case-sensitivity unspecified for `.warp` import resolution and `invoke`/`tools:` path containment
**Original section:** docs/spec_topics/ functions, control-flow, return, bindings, imports, invocation, slash-invocation, implementation-notes
**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

Two adjacent spec surfaces define byte-exact lowercase matching for *extensions* but leave the *basename* (and the containment-comparison normalisation) governed by whatever the host filesystem happens to do, producing platform-divergent behaviour for byte-identical source.

1. **`.warp` import resolution.** `imports.md` IMP-1 says a spec is unresolvable "when relative resolution points at a `.warp` path that does not exist or is not readable." "Exists" is delegated to the OS. `lexical.md` *Extension matching* fixes the trailing `.warp` byte-exact lowercase, but nothing pins the basename. So `import { Author } from "./Personas.warp"` (file on disk: `personas.warp`) succeeds silently on Windows / macOS-default and emits `loom/load/unresolvable-warp-path` on case-sensitive Linux / typical CI — the same `.loom` source loads on one host and fails to register on another. The discovery-side `loom/load/case-collision` warning catches two `*.loom` files that collide on case-insensitive hosts, but it does not cover the import-string-vs-on-disk-basename mismatch, which is the dual problem on a single file.

2. **`invoke` / `tools:` discovery-root containment.** `invocation.md` Resolution mandates `realpath` and then "must lie within … discovery roots," but never specifies whether the containment comparison is byte-exact or case-folded. On a case-insensitive host, `realpath` typically returns the on-disk casing of the resolved tail, which may differ from the casing of the discovery root captured at load time (or vice-versa for symlinks crossing case-variant directory entries). A byte-exact `startsWith` then rejects a callee that is, by the filesystem's own equivalence relation, inside the root. A case-folded comparison fixes that but, on a case-sensitive host, would conflate genuinely distinct paths and admit a callee that is *not* inside the declared root — a security regression at a security-load-bearing site (this is the check that exists to prevent `loom/load/invoke-path-escape`). The PIC-13 `realpath` contract is silent on this — it only specifies the canonical-absolute-path shape and the error codes.

The two obligations sit on different rules in different files and resolve by different mechanisms (a new parse / load diagnostic for the import side; a containment-predicate clause for the invoke side). They should be addressed sequentially rather than bundled.

## Spec Documents

- `docs/spec_topics/imports.md` — *Path resolution* / IMP-1 (edited under Option A)
- `docs/spec_topics/invocation.md` — *Resolution* / INV-1 (edited under Option B)
- `docs/spec_topics/lexical.md` — *Extension matching* (read-only — establishes the byte-exact precedent the import-side fix extends to basenames)
- `docs/spec_topics/discovery/discovery-sources.md` — DISC-3 *Case-insensitive filesystem collisions*, *Non-canonical extension case* (read-only — adjacent rules whose framing the new diagnostics must remain consistent with)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/unresolvable-warp-path`, `loom/load/invoke-path-escape` rows (edited — registry entries reflect the tightened semantics under each option)
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — `<path>` / category-5 path placeholder rule (read-only — any new diagnostic message inherits this)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-13 `FileSystem.realpath` (read-only — establishes the canonical-path contract Option B builds on)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`plan.md` and `plan_topics/` carry no authored leaves yet — only template / conventions / coverage-matrix scaffolding.)

## Consequence

**Severity:** correctness

A `.loom` corpus that passes load on a developer's Windows / macOS workstation can fail load (or, on the containment side, can be rejected from invocation) on a case-sensitive CI runner or production Linux host, with no spec rule to attribute the divergence to. The invoke / `tools:` containment surface is additionally security-load-bearing — the spec's only stated purpose for the containment check is to prevent `loom/load/invoke-path-escape`, and an unspecified case-normalisation policy lets two conformant implementations disagree on whether a given path escapes, defeating the rule.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles two independent obligations on different rules in different files. They are emitted as one option apiece so the fix loop can resolve them sequentially.

### Option A — Pin `.warp` import basename to byte-exact host-filesystem match

**Approach.** Extend `lexical.md` *Extension matching*'s byte-exactness from the extension to the entire path literal, and amend `imports.md` IMP-1 to make the basename comparison observable rather than OS-delegated.

**Spec edits.**

- In `imports.md` IMP-1, replace "does not exist or is not readable" with: a `.warp` path is unresolvable when, after relative resolution against the importing file's directory, no directory entry exists whose name matches the path literal's final segment **byte-for-byte** (UTF-8, case-sensitive); and when an entry that matches byte-for-byte does exist, it must be readable — `EACCES` / `EPERM` / a broken symlink on the matching entry still surface as `loom/load/unresolvable-warp-path`. State that the byte-for-byte rule applies on every host regardless of the host filesystem's case-equivalence model, mirroring the discovery-glob rule in `discovery/discovery-sources.md` *Non-canonical extension case*.
- Cross-reference `lexical.md` *Extension matching* and state explicitly that the basename rule composes with it: the byte-exact extension check is one component of the byte-exact basename check, not a separate stage.
- No new diagnostic code; the existing `loom/load/unresolvable-warp-path` (per `diagnostics/code-registry-load.md`) covers both the "no entry exists" and "case-variant entry exists but is not byte-exact" cases. The diagnostic message remains the path literal as written, per the existing `<path>` rendering rule (`diagnostics/placeholder-rendering-b.md` §5).
- *Non-normative implementation note.* The production `Resolver` cannot rely on a single `fs.exists` / `fs.readText` call on a case-insensitive host (it would silently succeed on `Personas.warp` when the literal said `personas.warp`). Conformant implementations enumerate the resolved parent directory once via `FileSystem.readdir` and compare the literal's final segment against entries byte-for-byte; the cost is one extra `readdir` per import miss, paid only on the failure path.

**Pros.**

- Behaviour is byte-identical across operating systems for the same `.loom` corpus; matches the existing posture for the discovery glob and the extension match.
- No new diagnostic code, no new schema, no new failure mode visible to authors who already use lowercase basenames.
- Symmetric with the discovery side: `discovery/discovery-sources.md` *Non-canonical extension case* already pins discovery to byte-exact, so import resolution lining up removes the last platform-dependent file-resolution surface.

**Cons.**

- Tightens load on case-insensitive hosts: a `.loom` shipped today with `import "./Personas.warp"` against an on-disk `personas.warp` will start emitting `loom/load/unresolvable-warp-path` on Windows / macOS where it currently loads. This is the intended correction, not regression — but it is breakage on a host class that previously appeared to work.

**Risks.**

- The "byte-for-byte against `readdir` entries" implementation path is correct on POSIX but on Windows the underlying NTFS layer can normalise certain Unicode forms (NFC vs NFD on the actual entry name) — the byte-exactness rule must be on the bytes `readdir` returns, not on the path literal post-normalisation. Cross-reference `lexical.md` *Encoding* to make this explicit.

### Option B — Pin discovery-root containment to canonical-form comparison

**Approach.** Amend `invocation.md` *Resolution* and INV-1 to specify the containment predicate's case-sensitivity in terms of `FileSystem.realpath`'s output, rather than leaving it to the implementer's `startsWith` choice.

**Spec edits.**

- In `invocation.md` *Resolution*, after the `realpath` step and before the containment claim, insert: containment is decided on the byte-exact output of `FileSystem.realpath` applied to *both* the resolved callee path and each active discovery root. The comparison is byte-for-byte after forward-slash normalisation (per `lexical.md` *Path literals*) and **does not** apply any independent case-folding — the canonical form is whatever `realpath` returns on the host. This composes with (does not replace) the segment-boundary containment predicate addressed by the sibling finding "Discovery-root containment predicate undefined where the path-escape check is specified."
- State explicitly that the rule applies identically at the load-time check and the runtime re-check (INV-1 already pins identical semantics across both call sites; this is the case-sensitivity instantiation of that pin).
- *Non-normative implementation note.* On case-insensitive hosts (Windows, macOS default) Node's `fs.promises.realpath` returns the on-disk casing of the resolved tail, so two paths the filesystem treats as equivalent canonicalise to the same byte sequence and the byte-exact containment comparison gives the right answer; on case-sensitive hosts (Linux) byte-exactness already matches filesystem equivalence. The rule therefore yields one observable behaviour across hosts by deferring to `realpath`'s own per-host canonicalisation, rather than imposing a synthetic case-fold that would diverge from filesystem semantics.
- `diagnostics/code-registry-load.md` `loom/load/invoke-path-escape` row: no change to the diagnostic itself, but cross-reference the tightened containment predicate.

**Pros.**

- Resolves the security-load-bearing ambiguity at the site that already names it security-load-bearing.
- Builds on PIC-13's existing `realpath` contract; no new seam surface and no new diagnostic.
- Composable with the segment-boundary fix from the related "Discovery-root containment predicate undefined" finding — both are clauses on the same predicate.

**Cons.**

- Relies on each host's `realpath` implementation actually canonicalising case in the way Node's `fs.promises.realpath` does today. The fallback `FakeFileSystem` used in tests must mimic this — tests for case-insensitive hosts need a fake `realpath` that returns the on-disk casing, not the input casing, to exercise the rule.

**Risks.**

- A future port to a host whose `realpath` does *not* preserve on-disk casing (some non-Node runtimes) would silently change containment outcomes; the rule should therefore be stated as "byte-exact on `realpath` output" rather than implying any specific platform's behaviour, which the wording above does.

### Recommendation

Adopt **both** options, in this order:

1. **First, Option A** (`.warp` import basename byte-exactness). This is the smaller, scope-bounding edit — it touches one rule in one file, introduces no new diagnostic, and aligns import resolution with the byte-exact extension and discovery rules already in force. Settling it first lowers the surface area the next pass's lenses see.
2. **Then, Option B** (containment-predicate case clause). This edit lands on `invocation.md` Resolution / INV-1 and should be sequenced with the related "Discovery-root containment predicate undefined" finding — the segment-boundary clause and the case-normalisation clause are two MUSTs on the same predicate. Order them so the case clause lands after the segment-boundary clause, since the latter is the structural skeleton the case rule attaches to.

Edge cases the implementer must watch:

- A `.warp` import whose path literal is itself non-canonical Unicode (NFC vs NFD) — Option A's byte-exactness is against `readdir` output, not against any Unicode-normalised form. State this once and cite `lexical.md` *Encoding*.
- A symlink-farm callee whose `realpath` crosses a case-variant directory entry on macOS — Option B's comparison is on `realpath`'s output for *both* sides, so the comparison stays well-defined; no additional clause needed, but the test matrix should cover this case.

## Relationships

- T080 "Discovery-root containment predicate is undefined at the `invoke-path-escape` site" - decision-overlap ((Option B's case clause sits on the same predicate; sequence Option B after that finding lands so the case clause attaches to a defined skeleton).)
- T006 "Orientation pages live outside GOV-17's corpus and are cited under two incompatible paths" - same-cluster ((another platform-filesystem assumption surfaced separately; resolves independently).)

---

# T082 - `params:` type-side: grammar reference and named-type resolution rule absent from the owning page

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`frontmatter/frontmatter-fields-a.md` is the canonical owning page for `params:`, and its examples use loom type expressions on the right-hand side (`array<string>`, `Author`, `Severity`), but the page never states which grammar parses the type side nor how a bare named type resolves. The grammar is defined in `type-system.md` and `grammar.md` — both already list `params:` among the type-annotation positions — yet neither cross-reference is reciprocated from the owning page. Named-type resolution is unspecified everywhere: no page states that a `params:` named reference resolves against the file's body-level `schema`/`enum` declarations, whether a forward reference across the frontmatter/body boundary is admitted, or what an unresolved name produces. Because frontmatter is parsed before the body, two conforming implementers diverge — one rejects every `params:` named reference, the other admits them via a body-first two-pass resolver — and the spec's own `code-review.loom` example fails under the strict reading.

## Solution approach

In `frontmatter-fields-a.md`'s `params` prose bullet, add forward-cross-references to `type-system.md` and `grammar.md#type-grammar` establishing that the `params:` right-hand side is parsed by the loom type grammar. Clarify the named-type resolution rule: a `NamedType` in `params:` resolves against the file's body-level `schema`/`enum` declarations and imported `.warp` names, with whole-file hoisting so a forward reference from frontmatter to a later declaration resolves. State that an unresolved name is a parse-time diagnostic, registering `loom/parse/unresolved-named-type` in `diagnostics/code-registry-parse.md` if no existing code covers it.

## Solution constraints

- Out of scope: editing `type-system.md` or `grammar.md` — both already enumerate `params:` as a type-annotation position; this finding adds only the reciprocal pointer from `frontmatter-fields-a.md`.

## Relationships

- T074 "TYPE-8 field-wise compatibility scope (named schema vs inline object type) is ambiguous" - same-cluster (both concern under-specification of named-type semantics on the type-system surface; resolve independently).
- T075 "Bare-source backslash: no diagnostic code is named" - same-cluster (touches the same `code-registry-parse.md` section if a new `loom/parse/unresolved-named-type` row is registered).
- T069 "Object indexed-access static semantics are undefined" - same-cluster (another type-system-surface under-specification; independent fix).
# T083 - Stop-reason → `QueryError` variant mapping is undefined

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Typed queries are tool-loop-shaped" section of `query/query-tool-loop.md` states that provider stop reasons other than `end_turn` / `stop` / `tool_use` (e.g. `length`, content filter) "surface as `transport` or `context_overflow` per the existing classification rules." The cross-referenced rules in `pi-integration-contract/provider-error-mapping.md` and `query/query-failure-and-repair.md` § "Detection of `ContextOverflowError`" classify HTTP error payloads (status code, body envelope, message regex), not stop reasons on a successful HTTP-200 response. A `length` or content-filter terminator rides a normal 200 with no error body and matches none of those signatures, so its `QueryError` variant is observer-visible but unspecified — one conforming implementation can return `TransportError` and another `ContextOverflowError` for the same terminator, and `match`-shaped handlers, repair logic, and conformance fixtures diverge accordingly.

## Solution approach

Define the stop-reason → variant mapping authoritatively in `provider-error-mapping.md` (the existing owner of provider-payload → variant mapping), covering `length` (output-boundary) → `ContextOverflowError`, content-filter terminators → `TransportError`, and any other unrecognised non-terminal stop reason → `TransportError`. Replace the ambiguous clause in `query-tool-loop.md`'s "Typed queries are tool-loop-shaped" section with a forward-reference to that mapping. Add a clarifying sentence in `query-failure-and-repair.md` § "Detection of `ContextOverflowError`" co-locating the clean-`length` terminator with the existing mid-stream output-boundary rule.

## Solution constraints

- Out of scope: the network-level / non-overflow 4xx-5xx `TransportError` catch-all rewrite in `query-failure-and-repair.md` and `provider-error-mapping.md`, owned by T084.

## Relationships

- T084 "`TransportError` catch-all in `query-failure-and-repair.md` is narrower than the PIC contract" - same-cluster (both findings extend the variant-classification surface in `query-failure-and-repair.md` / `provider-error-mapping.md`; co-resolving in one edit pass to that mapping table is natural but the substantive rules are independent)
# T084 - `TransportError` catch-all in `query-failure-and-repair.md` is narrower than the PIC contract

**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`query-failure-and-repair.md` § "Detection of `ContextOverflowError`" classifies the non-overflow catch-all as "All other 4xx and 5xx responses map to `TransportError`." That phrasing is keyed off an HTTP status, so it is silent about failures that produce no HTTP response — connection-refused, DNS failure, TLS handshake error, read/SDK timeout, mid-stream drop — and about the HTTP-200 non-overflow body-envelope case. The authoritative rule at `pi-integration-contract/provider-error-mapping.md` already maps all three arms (non-overflow 4xx/5xx, HTTP-200 body-envelope, and every network-level failure) to `TransportError`; the query-shard restatement is a partial paraphrase that drops the network-level and HTTP-200 arms. The omission is sharpened by the section's own "mid-stream errors are still classified at end-of-stream" sentence, which presupposes a classification rule for a mid-stream drop that the catch-all does not supply.

## Solution approach

Rewrite the catch-all sentence in `query-failure-and-repair.md` § "Detection of `ContextOverflowError`" so it delegates to the PIC owner instead of restating part of the rule, forward-linking to `pi-integration-contract/provider-error-mapping.md#provider-error-mapping` as the authority for the non-overflow 4xx/5xx, HTTP-200 body-envelope, and network-level arms all mapping to `TransportError`.

## Solution constraints

- Preserve the query-shard-owned commitments co-located in this section — the "mid-stream errors are still classified at end-of-stream" sentence, the output-side `context_overflow` truncation carve-out, the `tokens_used` / `tokens_limit` `null` paragraph, and the loom 1.0 seam blockquote — none of which are owned by PIC; do not relocate or delete them.

## Relationships

- T083 "Stop-reason → `QueryError` variant mapping is undefined" - same-cluster (also a `transport` vs `context_overflow` classification gap in the same `query-tool-loop.md` / `query-failure-and-repair.md` cluster; resolves independently, but a coherent editorial pass should land both at once).
- T046 "`RuntimeEvent` justifies a field it does not carry" - same-cluster (also touches the `transport` emission contract, but at the RuntimeEvent shape layer rather than the `QueryError` classification layer; resolves independently).
# T085 - Mid-loom Pi-extension hot-reload: held closure invocation has no contracted outcome

**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The Resolution-snapshot hot-reload bullet in `frontmatter-fields-b-and-templates.md` (last consequence bullet) acknowledges a 1.0-reachable failure path — a Pi tool resolved into a loom's frozen `tools:` table whose source extension is hot-reloaded via `ctx.reload()` leaves the captured `execute` closure referencing disposed module state — then declares the case "out of loom 1.0 scope" without stating what the runtime is contracted to produce when that held closure is next dispatched. The runtime has no mechanism to detect an orphaned `execute` reference, so it dispatches through it like any other captured callable, yet the spec names no observable surface for the result. The other four bullets in the same enumeration each pin an observable consequence; this one substitutes "out of scope" for a contract on a case that is in scope. Two implementers diverge: one treats the case as fully undefined, the other routes the held-closure throw through the standard tool-call failure surfaces.

## Solution approach

Rewrite the hot-reload bullet in `frontmatter-fields-b-and-templates.md`'s Resolution-snapshot to replace the "out of loom 1.0 scope" dismissal with a positive contract: the held `execute` reference is dispatched like any other captured Pi-tool callable and any failure routes through the standard `execute()` surfaces. Point to `tool-calls.md`'s Failures and Outcome enumeration for catchable throws (`CodeToolError { cause: "execution" }`) and non-conforming return shapes (`loom/runtime/internal-error`), and to `error-model.md`'s `runtime-panics` surface for the uncatchable host-fatal case. Retain the "use full `/reload`" sentence as non-normative author guidance alongside the contract.

## Solution constraints

- Do not introduce a new diagnostic code, `loom-system-note` shape, or timeout contract for hot-reload-induced failures; the fix reuses the existing tool-call failure and cancellation surfaces only.

## Relationships

- T107 "Hot-reload recovery note over-promises `/reload` success without a failed-re-reload contract" - same-cluster (also hot-reload contract precision; independent fix)
- T095 "ERR-7 lacks a defining anchor on the discovery pages, and the payload field carrying shadow/collision paths is unstated" - same-cluster (watcher-time reload failures on a different surface)
# T086 - `bind_echo` no-params diagnostic: trigger condition unpinned and overlaps the single-string-bypass code

**Kind:** testability, clarity
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The load warning `loom/load/bind-echo-without-params` (`diagnostics/code-registry-load.md`) and its three prose mirrors describe the trigger as "`bind_echo: true` on a no-params loom," but `bind_echo` defaults to `true` (the `bind_echo` row of `frontmatter/frontmatter-fields-a.md`), so the text does not distinguish an explicitly-set `bind_echo: true` from a defaulted one — one reading fires on every no-params loom, the other only on explicit true, and both are defensible. Separately, `loom/parse/bind-echo-on-bypass` (`diagnostics/code-registry-parse.md`) is scoped to a "binder-bypass-eligible loom," but per `glossary.md` and `binder/binder-bypass-and-envelope.md` "binder bypass" comprises both the no-params bypass and the single-string bypass, so an explicit `bind_echo: true` on a no-params loom matches both codes across two phases with nothing in the spec breaking the tie. Conformance tests cannot be written against either ambiguity, and the two halves must be pinned together because narrowing one code alone leaves the other admitting the same case.

## Solution approach

Narrow `loom/load/bind-echo-without-params` in `diagnostics/code-registry-load.md` so its condition keys on an explicitly-present `bind_echo: true` together with absent-or-`{}` `params:`, excluding the defaulted value, and propagate the explicit-true qualifier to the three prose mirrors (the `params` row in `frontmatter/frontmatter-fields-a.md`, the no-params-bypass entry in `glossary.md`, and the No-params bypass paragraph in `binder/binder-bypass-and-envelope.md`). Narrow `loom/parse/bind-echo-on-bypass` in `diagnostics/code-registry-parse.md` and its restatement in `binder/defaulting-system-note-echo.md` to the single-string bypass only, so "bypass-eligible" is no longer load-bearing for that code. Add a sentence to the no-params / single-string entry in `glossary.md` stating that the no-params case is owned by `loom/load/bind-echo-without-params` and the single-string case by `loom/parse/bind-echo-on-bypass`, and that the two codes partition bypass-eligibility.

## Solution constraints

- Out of scope: the echo-policy sentence in `slash-invocation.md`, which already correctly scopes the parse warning to the single-string-param bypass — do not edit it.

## Relationships

None
# T087 - `respond_repair: { methodology: none, attempts: N>0 }` combination behaviour and `ValidationError.attempts` under `methodology: none` are unspecified

**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `methodology: none` bullet in `frontmatter-fields-b-and-templates.md` says only "Equivalent to `attempts: 0`. No template applies", and does not say what a well-formed `{ methodology: none, attempts: N>0 }` loom does: `loom/load/unknown-methodology-value` fires only on values outside the recognised set, so the combination loads silently, and the spec does not distinguish "warn at load" from "silently treat as `attempts: 0`". On the return side, `ValidationError.attempts` (`queryerror-variants.md` schema, "respond-repair follow-ups made before giving up") is pinned to `0` under `methodology: none` only for the ERR-17 forced-respond branch; for the ordinary AJV-failure path an implementer must infer the value two pages away. Two conforming runtimes can therefore disagree on both the load-time diagnostic and the integer surfaced in `ValidationError.attempts`, and both differences are observable from loom `match` arms and diagnostics consumers.

## Solution approach

Clarify the `none` bullet in `frontmatter-fields-b-and-templates.md` so the contract is self-contained: a declared non-zero `respond_repair.attempts` is silently ignored under `methodology: none` (no new diagnostic), the runtime behaves as `attempts: 0`, and `ValidationError.attempts` is `0` on every path that surfaces `ValidationError` under `methodology: none` — AJV failure, depth-walk failure, and the ERR-17 forced-respond branch.

## Solution constraints

- Preserve the `#err-17` anchor and its sentence in place (GOV-28 anchor stability); generalise the rule in the `none` bullet rather than relocating the ERR-17 statement.

## Relationships

- T088 "Follow-up template terminal-newline and dedent trailing-whitespace-line rendering are unpinned" - same-cluster (sibling testability gap on the same respond-repair template machinery; resolved independently)
# T088 - Follow-up template terminal-newline and dedent trailing-whitespace-line rendering are unpinned

**Original heading:** Follow-up turn templates and dedent trailing-whitespace: terminal-newline / rendered-string ambiguity for byte-exact conformance
**Original section:** docs/spec_topics/ frontmatter + query
**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

Two byte-exact-conformance gaps sit in adjacent query subtopics; both prevent a conformance suite from asserting on the rendered string.

1. **Respond-repair follow-up template terminal newline.** `query-failure-and-repair.md` §"Follow-up turn templates (normative)" declares that "wording changes — including whitespace inside the template body — are spec-versioned breaking changes," and explicitly accounts for the single U+000A between the instruction sentence and `<schema-json>` and for the literal backticks around `__loom_respond_<slug>`. It is silent on whether the rendered text ends after `<schema-json>` (i.e. the body ends with the closing `>`) or whether the U+000A that the fenced example shows between `<schema-json>` and the closing `~~~` is part of the emitted text. The fence convention "the opening and closing fence lines themselves are not emitted" does not by itself decide whether the newline that *terminates* the `<schema-json>` line counts as part of the body or as part of the (non-emitted) closing-fence line. With a breaking-change clause covering whitespace, the difference between `…<schema-json>` and `…<schema-json>\n` is normative.

2. **Dedent trailing-whitespace-only-line vector.** `query-forms.md` §"Dedent and newline-trim — normative behaviour" describes a trailing whitespace-only line (example `\n    only\n  `) as "rendered as an empty line" in prose, but the seven-row vector table has no row for this case. A reader cannot determine whether the rendered string is `"only\n"`, `"only\n\n"`, or `"only\n"` followed by anything else, and whether the empty line includes a terminating newline.

Both gaps live in the same conformance posture: query-layer rendering is contractually byte-exact, but the rendered byte string at end-of-text is not pinned.

## Spec Documents

- `docs/spec_topics/query/query-failure-and-repair.md` — Follow-up turn templates (normative) (edited)
- `docs/spec_topics/query/query-forms.md` — Dedent and newline-trim — normative behaviour (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

## Consequence

**Severity:** correctness

A respond-repair conformance test that asserts on the emitted user-turn string will diverge across implementations depending on whether the implementer reads the closing fence as inclusive of its preceding newline. A dedent conformance suite cannot mechanically cover the trailing-whitespace-only-line case the prose calls out, leaving that path verified only by hand-reading. Both are reachable in 1.0 without provider involvement.

## Solution Space

**Shape:** multiple
**State:** shaped

Two independent obligations; address sequentially. Each is a small, self-contained edit; bundling them inflates the next pass's critique surface unnecessarily.

### Option A — Pin terminal-newline of respond-repair follow-up templates

**Approach.** In `query-failure-and-repair.md` §"Follow-up turn templates (normative)", state explicitly whether the emitted body ends with `\n` after the `<schema-json>` interpolation. Pick the inclusive convention — the body ends with `<schema-json>\n` — because (i) it matches the obvious reading of the fenced example, (ii) it leaves the trailing newline available for any subsequent provider-side concatenation without a re-emission step, and (iii) it makes the placeholder substitution byte-equivalent regardless of whether the renderer treats fences character-wise or line-wise.

**Spec edits.** Add one sentence to the existing *Templates.* paragraph stating that the body terminates with a U+000A immediately after the `<schema-json>` interpolation (equivalently: the closing-fence line is not emitted, but the newline that ends the last body line is part of the emitted text). Optionally restate both templates' rendered forms as quoted byte strings to remove all ambiguity.

**Pros.** Unblocks byte-exact conformance fixtures for both `validator_error` and `schema_repeat`. Local edit; no cross-page ripple.

**Cons.** Locks the trailing newline as a versioned-breaking decision; future template revisions cannot drop it without a spec version bump.

**Risks.** None material; this is the kind of point the spec-versioning clause already exists to govern.

### Option B — Add a normative trailing-whitespace-only-line dedent vector

**Approach.** In `query-forms.md` §"Dedent and newline-trim — normative behaviour", extend the seven-row vector table with a row whose template input matches the trailing-whitespace-only-line case the existing prose calls out (`@`...`\n    only\n  `...``), and pin its rendered string explicitly.

**Spec edits.** Append vector row 8 (using whatever numbering convention the table uses) with `Template: @`​`\n    only\n  `​`` → `Rendered text: "only\n"` (or `"only"` followed by an empty line, depending on which the prose intends — choose the form the dedent algorithm actually produces and state it as a literal string). Add a one-line commentary entry following the existing per-vector commentary block, stating that the trailing whitespace-only line is normalised to an empty line per rule 1 and does not contribute to the common prefix.

**Pros.** Makes the case directly testable; converts an inline prose claim into a fixture row.

**Cons.** Marginally widens the table.

**Risks.** None.

### Recommendation

Apply **Option A first**, then **Option B**. Option A is the smaller-scope edit (one sentence in one file) and pins the more consequential gap (respond-repair emits the bytes the model sees); landing it first gives Option B a stable baseline to layer onto. Both options must land before 1.0; neither is optional.

Edge cases the implementer must watch:
- For Option A, confirm that the rendered-form quoted byte strings (if used) escape the literal backticks around `__loom_respond_<slug>` correctly within Markdown — use a fenced or HTML-escaped form to avoid accidentally re-introducing ambiguity in the spec itself.
- For Option B, ensure the new row's input column uses the same `\n` / `\t` literal-byte convention the existing table establishes ("they are not escape sequences interpreted by the loom parser").

## Relationships

- T090 "Frontmatter / query hidden assumptions: unbacked AJV NaN/±Infinity rejection and unbacked universal `strictCapable` absence" - decision-overlap (the LF/CRLF line-ending contract for source decides which byte sequence the dedent vectors operate on; Option B's vector row must be consistent with whatever that finding resolves)
- T089 "Opening free-phase turn body unstated for `max_rounds > 0`; `discard_site` value undefined for void-tail discards" - same-cluster (sibling byte-exact / testability gap in the same query subtopic; resolves independently)

---

# T089 - Opening free-phase turn body unstated for `max_rounds > 0`; `discard_site` value undefined for void-tail discards

**Original heading:** query-tool-loop max_rounds>0 opening free-phase turn content is implicit; void-tail `discard_site` value undefined
**Original section:** docs/spec_topics/ frontmatter + query
**Kind:** implementability, testability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

Two adjacent gaps in `query/query-tool-loop.md` and `query/query-escapes-stringification.md` each leave a field value undefined where the spec otherwise nails the boundary case.

First, `query-tool-loop.md` carefully pins the opening-turn content for the `max_rounds: 0` boundary of a typed query — "carrying the user-supplied prompt text of the `@<T>`...`` expression as the leading content of its user-message body, separated from the forced respond turn's instruction wording … by a single U+000A line feed". It never makes the analogous statement for the much commoner `max_rounds > 0` path. The Free-phase bullet only describes the *model's* turns ("Each turn, the model may call any frontmatter tool … or emit a plain text turn"); it does not say that the *opening* user turn issued by the runtime to start the free phase carries the rendered query template body. A reader implementing the loop has to infer this from the `max_rounds: 0` description, the `Ok` extraction reference in [PIC — untyped-query `Ok(string)` extraction](../pi-integration-contract/conversation-drive.md#untyped-query-ok-extraction), and the absence of any other plausible content. Two implementers could reasonably arrive at different turn bodies (rendered template alone; rendered template plus the forced-respond instruction; rendered template plus a system preamble) and no conformance test could distinguish them from spec.

Second, `query-escapes-stringification.md` "Observability of discarded results" defines `RuntimeEvent.discard_site` as "the source location of the discarding `let _ =`". The immediately preceding paragraph in the same file extends the discard form: "A `void`-returning function whose **tail expression** is `@`...`` is also a discard with the same observability contract as the expression-statement form". A void-tail discard has no `let _ =` token to point at, so the field's population rule is undefined for that case. The natural answer — the source location of the tail `@`...`` expression itself — is never written down, leaving the event's `discard_site` value indeterminate on the void-tail path.

The two halves are unrelated in mechanism (one is conversation-drive content, the other is a runtime-event field) and edit cleanly as independent one-line fixes.

## Spec Documents

- `docs/spec_topics/query/query-tool-loop.md` — "Typed queries are tool-loop-shaped" §1 *Free phase* (edited)
- `docs/spec_topics/query/query-escapes-stringification.md` — "Observability of discarded results" (edited)
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — `RuntimeEvent` shape / `discard_site` field (read-only; option-dependent — edited if Option B from the related `discard_site` placement finding is taken first)
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — `untyped-query-ok-extraction` (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(No plan files in the repository.)

## Consequence

**Severity:** correctness

Two reasonable implementations would diverge on what bytes the opening free-phase user turn carries (rendered template vs. rendered template + preamble vs. empty), and would diverge on the `discard_site` value of a void-tail discard event (null, the function declaration site, or the tail-expression site). Both are observable on the provider transcript / `RuntimeEvent` channel respectively, so the divergence shows up directly in conformance tests and operator logs.

## Solution Space

**Shape:** multiple
**State:** shaped

This finding bundles two independent obligations on two different files. Per the per-finding fix protocol they are resolved sequentially as separate edits.

### Option A — Pin the opening free-phase turn body in `query-tool-loop.md`

**Approach.** Add a sentence to the *Free phase* bullet (or a new paragraph immediately after the two-phase enumeration) that, for `max_rounds > 0`, the runtime issues an opening user turn whose body is the rendered query template (post-interpolation, post-newline-trim, post-dedent, per `query-forms.md` and `query-escapes-stringification.md`). Make explicit that this is symmetric with the `max_rounds: 0` boundary: the same rendered text is the leading content, the only difference being that at `max_rounds: 0` it is followed by the U+000A separator and the forced-respond template, while at `max_rounds > 0` it is the entire turn body.

**Spec edits.**
- `query-tool-loop.md` *Free phase* bullet: append a sentence: *"The runtime issues the opening free-phase user turn with the rendered query template body (post-interpolation, post-newline-trim, post-dedent — see [query-forms.md](./query-forms.md) and [query-escapes-stringification.md](./query-escapes-stringification.md)) as its sole content. The `max_rounds: 0` boundary case (step 2 below) is the same dispatch with the forced-respond template concatenated after a single U+000A separator."*
- No edits to other files.

**Pros.** Single-paragraph edit; collocated with the existing `max_rounds: 0` pin so the symmetry is visible; no cross-file movement.
**Cons.** Slightly enlarges the Free-phase bullet, which the existing prose has kept terse.
**Risks.** None material.

### Option B — Pin `discard_site` for void-tail in `query-escapes-stringification.md` (and optionally PIC)

**Approach.** State that for a void-tail-function discard, `discard_site` carries the source location of the tail `@`...`` expression; for an explicit `let _ = @`...`` discard, it carries the location of the `let _ =` binding (status quo). The choice of *location of the tail expression* rather than the function declaration matches the existing rule's intent (point at the discard mechanism) and stays observable to the operator who is reading the event to find the offending site.

If the related finding *"`discard_site` field and `display:false` policy defined in query-escapes-stringification.md, not the PIC runtime-event-channel"* has been resolved first by moving the field definition to `runtime-event-channel.md`, make the void-tail population rule a clause of that PIC definition instead, and keep `query-escapes-stringification.md` to a forward reference.

**Spec edits.**
- `query-escapes-stringification.md` "Observability of discarded results": replace *"the source location of the discarding `let _ =` carried in the `RuntimeEvent` `discard_site` field"* with *"the source location carried in the `RuntimeEvent` `discard_site` field — the location of the discarding `let _ =` binding for the expression-statement form, and the location of the tail `@`...`` expression for the void-tail-function form"*.
- (Option-dependent) If the field-placement finding lands first: make the corresponding change in `runtime-event-channel.md` instead and reduce the escapes-file mention to a forward reference.

**Pros.** Names both surfaces explicitly; the rule reads parallel to the two discard forms defined one paragraph above it.
**Cons.** None material.
**Risks.** Touches text that another finding wants moved; sequence with the placement finding to avoid editing prose that will be relocated.

### Recommendation

Both options are required. Resolve them sequentially in this order:

1. **Option A first.** Strictly local to the *Free phase* bullet; no overlap with any other finding's edit surface. Lands cleanly on the current baseline.
2. **Option B second.** Sequence after the related placement finding *"`discard_site` field and `display:false` policy defined in query-escapes-stringification.md, not the PIC runtime-event-channel"* if that one is scheduled, so the void-tail clause is written at whichever file owns the field at the time of the edit. If the placement finding is not scheduled, write the void-tail clause in `query-escapes-stringification.md` directly.

Edge cases the implementer must watch: (a) the `max_rounds: 0` case must continue to be the *same* dispatch mechanism — Option A must not introduce a second code path; (b) a void-tail discard whose tail `@`...`` expression spans multiple source lines points at the start of the expression, matching the convention used for other multi-line spans in this corpus; (c) when both halves land, re-verify the *Free phase* bullet still reads as one paragraph and is not split by an unrelated insertion.

## Relationships

None

---

# T090 - Frontmatter / query hidden assumptions: unbacked AJV NaN/±Infinity rejection and unbacked universal `strictCapable` absence

**Original heading:** Frontmatter/query hidden assumptions: AJV rejects NaN/±Infinity at param validation; source line-ending normalisation; universal absence of strict-capability indicator
**Original section:** docs/spec_topics/ frontmatter + query
**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

Two normative claims in the frontmatter / query subtree rest on external
behaviour that the spec asserts but does not back, and that an
implementer cannot verify from spec text alone.

1. **AJV NaN / ±Infinity rejection.**
   `frontmatter-fields-b-and-templates.md` (stringification paragraph)
   asserts that, for the `system:` rendering of a `params:` value
   resolved via path, *"`NaN` / `±Infinity` cannot occur because AJV
   rejects them at param validation, so the `number` row's edge cases
   are unreachable from this slot."* This is the only basis on which
   the `number` row of the canonical interpolation-stringification
   table is allowed to omit a `NaN` / `±Infinity` clause. The premise
   is unverified and, on its face, wrong: AJV's `type: "number"`
   keyword admits IEEE-754 `NaN` and `±Infinity` by default (the JSON
   Schema `number` type is JavaScript-`number`-shaped at that
   keyword's level, and AJV ships no built-in finiteness check). The
   slash-command path enters via JSON, which has no `NaN` /
   `±Infinity` literal — that arm is safe — but `invoke(...)` and
   `.loom`-callable arguments arrive *as Loom values* and are then run
   through the same AJV check (per
   `frontmatter-fields-a.md`'s `params:` paragraph and per
   `invocation.md`'s **Argument binding**), so a Loom-side `NaN` or
   `±Infinity` produced by arithmetic and threaded through an
   `invoke` argument reaches the `params` slot, passes AJV's
   `number`-type check, and lands in `system:` rendering with no
   defined output. Two reasonable implementers will pick different
   strings (`"NaN"` / `"Infinity"` / `"null"` / a thrown panic).

2. **Universal absence of `strictCapable` under the loom 1.0 Pi-SDK pin.**
   Three sites — `frontmatter-fields-a.md`'s `bind_model` row,
   `binder/binder-model-and-context.md`'s strict-capability paragraph,
   and `diagnostics/code-registry-load.md`'s
   `loom/load/binder-model-strict-capability-unknown` row — all assert
   that the `Model<Api>.strictCapable` field is *absent* across the
   entire `~0.75.5` tilde range (i.e. that production behaviour is
   the universal-W branch). None of the three cites where this
   absence is verified: there is no anchor to the SDK
   surface-inventory entry that pins the field's absence, no
   reference to a literal-read assertion that fails the build if the
   field appears, and no `pi-coding-agent` declaration site that the
   reader can consult. The `version-bump-triggers.md` step does
   describe an assertion that fires *if* the indicator is exposed
   under a *different name*, but that is the rename-detection arm;
   the present-tense "field is absent" claim across the tilde range
   has no counterpart. A `0.75.6` ships, the field appears under the
   probed name, the spec's prose still says it is absent — there is
   no mechanical gate keyed to that prose.

The original finding also bundled a third sub-claim about source
line-ending normalisation for `@`...`` newline-trim / dedent. That
sub-claim is unfounded: `lexical.md` (**Newline normalisation**)
already pins `\r\n` → `\n` and bare `\r` → `\n` *before* lexing and
explicitly enumerates "`@`...`` query newline-trim and dedent" among
the rules that operate on the normalised stream, with the observable
guarantee that a CRLF-checked-in `.loom` tokenises and dedents
byte-identically to the LF form. It is dropped here.

## Spec Documents

- `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md` — Stringification paragraph (edited)
- `docs/spec_topics/frontmatter/frontmatter-fields-a.md` — `bind_model` row (edited under Option B)
- `docs/spec_topics/binder/binder-model-and-context.md` — Strict-capability requirement (edited under Option B)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/binder-model-strict-capability-unknown` row (edited under Option B)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — Pi SDK pin anchor (read-only; referenced from the new citation)
- `docs/spec_topics/pi-integration-contract/audit-recognised-shapes.md` — `SDK_SURFACE_INVENTORY` entry-kind taxonomy (read-only; referenced from the new citation)
- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — Step 7 (strict-capability probe rename) (read-only; the new citation contrasts the absence-arm with this rename-arm)
- `docs/spec_topics/invocation.md` — **Argument binding** (read-only; cited to show the invoke-path AJV check)
- `docs/spec_topics/lexical.md` — **Newline normalisation** (read-only; confirms the dropped CRLF sub-claim is already covered)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan currently contains no leaves under any of the three phase categories.)

## Consequence

**Severity:** correctness

Without (1) fixed, an `invoke`-supplied `NaN` or `±Infinity` reaches
the `system:` rendering with no specified output — two implementers
will pick different strings and conformance tests cannot adjudicate.
Without (2) fixed, the spec carries a present-tense claim about the
Pi-SDK surface with no mechanical gate keyed to it, so a Pi minor
that quietly adds `strictCapable` under the probed name leaves the
spec text wrong with no build-time signal and the universal-W branch
silently dead.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles two independent obligations on disjoint surfaces.
Resolve them sequentially: Option A first (single-file edit, no
cross-references), then Option B (multi-site citation requiring a
landing point on the PIC side).

### Option A — Pin the `NaN` / `±Infinity` disposition for the `system:` `number` row

**Approach.** Stop relying on AJV to make the case unreachable.
Either (a) replace the unreachability claim with a normative
rendering, or (b) add the finiteness check to AJV's contract.

**Spec edits.**

- `frontmatter-fields-b-and-templates.md`, Stringification paragraph:
  delete the sentence asserting AJV rejects `NaN` / `±Infinity`.
  Replace with a direct extension of the `number` row of the
  canonical table, e.g. *"A `number`-typed param whose resolved
  value is `NaN`, `+Infinity`, or `-Infinity` renders as the literal
  text `NaN`, `Infinity`, or `-Infinity` respectively — the
  shortest-round-tripping rule above is defined only over finite
  IEEE-754 doubles."* Apply the same row extension to the canonical
  table in `query/query-escapes-stringification.md` so the
  `system:` and `@`...`` surfaces stay aligned per the
  same-table-everywhere rule.
- Optionally cross-reference `lexical.md`'s
  `loom/parse/number-literal-not-finite` rule to note that
  parse-time literals cannot introduce these values; the runtime
  surface is the only entry point.

**Pros.** One-file edit (plus the parallel row extension). No
dependency on AJV behaviour. Conformance-testable: the seven-vector
table grows by three rows.

**Cons.** Pins a rendering that the spec previously avoided
committing to. Two implementers' `Number.prototype.toString` output
for `NaN` / `±Infinity` matches the proposed literals, so the
risk is minimal.

**Risks.** None material — the rendering matches V8 and every other
ECMAScript implementation's `String(NaN)` / `String(Infinity)` /
`String(-Infinity)`.

### Option A′ — Require the `SchemaValidator` seam to reject non-finite `number` values

**Approach.** Move the finiteness check into the validator contract
(per `implementation-notes.md`'s `SchemaValidator` abstraction), so
the unreachability premise becomes true by spec rather than by
accident of AJV configuration.

**Spec edits.**

- `implementation-notes.md`'s `SchemaValidator` paragraph: add a
  bullet *"a `number`-typed value that is not a finite IEEE-754
  double (`NaN`, `+Infinity`, `-Infinity`) MUST be rejected; AJV's
  default `type` keyword does not enforce this and the reference
  implementation MUST layer the check on top (e.g. a custom
  keyword)."*
- Pin the resulting failure to an existing variant: the
  `params`-binding path surfaces as `loom/load/binder-output-…` or
  the appropriate `ValidationError` arm for the invoke path. State
  which.
- Leave the stringification paragraph as-is; the unreachability
  claim is now grounded.

**Pros.** Keeps the `number` row's table small. Aligns with the
existing parse-time `loom/parse/number-literal-not-finite` posture.

**Cons.** Adds a new normative obligation on every
`SchemaValidator` implementation. Touches more files (the
diagnostic registry needs the new failure code wired in).

**Risks.** Implementer who reads only the stringification paragraph
will not know about the validator obligation; the cross-reference
must be explicit on both pages.

### Option B — Cite where universal `strictCapable` absence is verified, or narrow the claim

**Approach.** The "field is absent across the tilde range" claim
needs either a single anchored citation point (preferred) or
narrowing to "expected under the pin" with the
literal-read-assertion as the gate.

**Spec edits.**

- Add a new `SDK_SURFACE_INVENTORY` entry kind in
  `pi-integration-contract/audit-recognised-shapes.md` (or extend
  the existing `strict-capability-probe` kind, whichever is the
  natural home) that pins, as part of the build-time literal-read
  assertion, *"under the loom 1.0 Pi-SDK pin
  (`@earendil-works/pi-coding-agent ~0.75.5`),
  `Model<Api>.strictCapable` is absent on every Pi-supplied
  `Model<Api>` instance, and the build-time literal-read assertion
  fails if any reachable `Model<Api>` declaration exposes it under
  the probed name."* Cite the actual declaration file in
  `pi-coding-agent` that the contributor verifies against (the
  `.d.ts` site for `Model<Api>` in the SDK pin).
- At the three claim sites
  (`frontmatter-fields-a.md`'s `bind_model` row,
  `binder/binder-model-and-context.md`'s strict-capability
  paragraph, `diagnostics/code-registry-load.md`'s W-row), replace
  the bare *"universal under the loom 1.0 Pi-SDK pin"* phrasing with
  a one-anchor cross-reference to the new
  `audit-recognised-shapes.md` entry. Per the **Pi SDK pin**
  single-source-of-truth rule on `host-prerequisites.md`, the
  citation site becomes the single point that needs editing on
  every Pi-minor bump where the field's presence changes.
- The complementary rename-detection arm in
  `version-bump-triggers.md` step 7 stays as-is; the new entry is
  the *absence under the probed name* gate, which is the missing
  half.

**Pros.** Aligns with the spec's existing single-source-of-truth
discipline on the Pi-SDK pin. The literal-read assertion is the
mechanical gate the claim has always needed. Fixes all three sites
with one citation.

**Cons.** Requires landing the new entry kind in the audit's branch
table (`literal-read/<symptom>` discriminator strings are
implementation-owned per
`audit-recognised-shapes.md`) before the spec's claim is
mechanically backed. The spec edit pins the contract; the
implementation closes the loop.

**Risks.** If the new audit entry is filed under
`strict-capability-probe` rather than coining a sibling kind, the
existing positive-direction-only literal-read entries
(`node-floor`, `peer-dep-range`, `api-coverage`,
`strict-capability-probe`) are exempt from the `path` field per the
same page's minimum-shape paragraph; the new entry's join-key shape
needs to be settled with the audit owner before the spec edit
lands.

### Recommendation

Land Option A first, then Option B; the two obligations touch
disjoint surfaces and can be reviewed independently.

Option A is preferred over Option A′ for the `NaN` / `±Infinity`
disposition: it is a one-file edit, requires no new diagnostic code,
and the canonical-table extension is conformance-testable on the
same footing as the existing seven vectors. Option A′ is the right
answer only if the spec wants to keep the stringification table
finite-domain-only; pick it explicitly if that is the editorial
preference. Edge case to watch: the `query-escapes-stringification.md`
canonical table is the single source the `system:` row references;
extend that table once and the `system:` row inherits the rows
automatically.

For Option B, prefer adding the new audit entry kind over narrowing
the prose to "expected under the pin" — the spec already commits to
the universal-W branch in three places, so the citation-and-gate
solution preserves the existing posture rather than weakening it.
Edge case to watch: the citation anchor must live on
`audit-recognised-shapes.md`'s inventory, not on
`host-prerequisites.md` (whose Pi-SDK pin paragraph is the
*version-range* single source of truth, not the
*field-shape* one); cite the inventory entry, which in turn cites
the SDK declaration site.

## Relationships

- T030 "Three unsourced Pi-SDK behavioural assertions in the diagnostics cluster" - co-resolve (the second sub-claim of that finding is the same universal-`strictCapable`-absence claim covered by Option B above; the single audit-entry citation fixes both findings' strict-capability arms simultaneously)

---

# T091 - DISC-4 "de-registers a previously-registered loom" has no Pi-side mechanism

**Kind:** implementability, assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

DISC-4's final paragraph (`docs/spec_topics/discovery/discovery-sources.md`, anchor `#disc-4`) and registration step 3 (`docs/spec_topics/pi-integration-contract/registration-steps.md`) both say the `session_start` collision pass "de-registers" a previously-registered loom whose name now collides with a Pi-owned prompt, skill, or sibling-extension command. The same PIC subtree records the opposite premise: registration step 13's *Structural changes* paragraph states Pi exposes no symmetric `pi.unregisterCommand`, and `pi.registerCommand` in `capability-inventory-items.md` item 1 has no unregister counterpart — so the "de-registers" verb names an operation the spec elsewhere says is unavailable. Neither site specifies the user-facing slash-dispatch behaviour after the diagnostic fires, so one implementer leaves `/<name>` routing to a registry-orphaned handler while another lets the collision persist until `/reload`.

## Solution approach

Rewrite DISC-4's final paragraph and registration step 3 to redefine "de-registers" as a `LoomRegistry`-side drop that leaves the Pi-side `pi.registerCommand` registration in place, cross-linking step 13's absent-`pi.unregisterCommand` acknowledgement. Restate DISC-4's asymmetric-loss rule ("the loom never preempts a non-loom registration") at the registry level rather than the Pi command-router level. Specify the slash-dispatch behaviour for a superseded loom — a `/<name>` whose registry entry was dropped — routing it to a fixed superseded-note system message modelled on the existing `readDrainState` arm (c) note `"loom /<name>: extension degraded; /reload to recover"` in `drain-state-contract.md`. Emit the existing `loom/load/cross-format-collision` diagnostic unchanged at the same site.

## Solution constraints

- The three-arm `LoomRegistry.readDrainState()` tuple space is closed per `drain-state-contract.md` (the slash handler MUST NOT introduce a fourth arm); the superseded-dispatch surface must not add a fourth drain-state arm.
- Out of scope: registration step 13's file-watcher `.loom` add/remove path (the `loom watcher: <N> file(s) added or removed; run /reload to refresh` note), which is unrelated to the `session_start` late-collision branch.

## Relationships

- T018 "DISC-4 does not cross-reference the `pi.getCommands()` enumeration API or its `session_start` ordering presupposition" - same-cluster (both touch DISC-4 / step 3 cross-format collision; that finding asks for the read API, this finding asks for the write API; both resolve independently against `registration-steps.md` step 3)
- T037 "Loom-side `/reload` rules buried inside Pi-host presuppositions" - decision-overlap (the new "superseded" slash-handler dispatch this finding adds should be defined on `drain-state-contract.md` alongside the existing dispatch arms; that placement decision should be reconciled with T037 before either lands)
# T092 - Glob `!`/`+`/`-` precedence and matcher engine unspecified for `pi.looms` / `loomPaths`

**Original heading:** Glob `!`/`+`/`-` precedence deferred wholesale to "Pi's behaviour" with no resolution order or named engine
**Original section:** docs/spec_topics/ errors-and-results + discovery
**Kind:** implementability, assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

DISC-5 (`pi.looms`, in `docs/spec_topics/discovery/package-and-settings.md` line 20) and the `loomPaths` entry schema (same file, line 86) both state that glob patterns and the `!` / `+` / `-` prefixes "mirror Pi's `extensions`/`skills`/`prompts`/`themes` arrays exactly," citing `@earendil-works/pi-coding-agent/docs/packages.md` and `settings.md`. Those Pi docs only enumerate the four prefix kinds — they describe none of the resolution behaviour the loom extension must reproduce. The omitted behaviour is observable and material:

- **Glob engine and dialect.** Pi's implementation (`dist/core/package-manager.js` lines 24, 26, 463–472) uses the `minimatch` npm package with specific match attempts (relative path, basename, POSIX-normalised absolute path). The brace-expansion, `**`, dotfile, and `nocase` defaults of `minimatch` differ materially from `picomatch`, `micromatch`, Node's built-in `glob`, or shell `fnmatch`; "mirror Pi" cannot be implemented without picking one.
- **Override ordering.** Pi (`package-manager.js` `applyPatterns`, lines 527–571) defines a four-step pipeline whose order is observable when patterns overlap: (1) plain includes (or everything when none); (2) `!` excludes filter the include set; (3) `+` exact-paths re-admit anything dropped by step 2; (4) `-` exact-paths remove anything from the working set, **overriding `+` force-includes from step 3**. The spec gives no ordering at all, and the order is not deducible from the Pi-side prose. An implementer who guesses any of the other 23 orderings (e.g. `-` then `+`, or `!`/`+`/`-` applied as a single union) will produce a different file-set on inputs as simple as `["**/*.loom", "!drafts/**", "+drafts/keep.loom", "-keep-no-more.loom"]`.

Because the spec explicitly assigns the discovery walk end-to-end to the loom extension ("the extension walks installed package roots itself; it does not delegate to Pi"), the matching algorithm must be locally specifiable; the current "see Pi" pointer is a citation to behaviour that itself is unspecified at the cited target. The same gap applies to `loomPaths` since its prose carries the identical "not a special snowflake" disclaimer.

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — DISC-5 (line 20) and the `loomPaths` entry schema "Glob patterns and exclusions" bullet (line 86) (edited)
- `docs/spec_topics/discovery.md` — failure-modes table cross-references for `pi.looms` and `loomPaths` entries (read-only)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — declared seams; the file `FileSystem`, `Clock`, etc. seams are defined here and a glob-matching seam, if introduced, would land alongside them (option-dependent)
- `@earendil-works/pi-coding-agent/docs/packages.md` and `docs/settings.md` — cited Pi docs that themselves do not pin engine or ordering (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

## Consequence

**Severity:** correctness

Two reasonable implementers will produce different discovery file-sets on overlapping `pi.looms` / `loomPaths` entries: one may apply `-` before `+`, one may use `minimatch` with `nocase` off and another with `nocase` on, one may treat `+` as a glob and another as an exact path. The divergence is silent — there is no diagnostic that fires when an author's intended exclusion is honoured by one implementation and ignored by another — and it surfaces only as "this loom registered for me but not for them," which is exactly the class of bug the discovery rules are written to prevent.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Pin the matcher engine and the four-step ordering inline

**Approach.** Add a short normative paragraph to DISC-5 (and a cross-reference from the `loomPaths` schema) that names `minimatch` (with the same options Pi uses: relative-path / basename / absolute-path match attempts, `nocase` off, default dotfile and brace-expansion behaviour) as the matcher, and specifies the four-step `apply(includes) → exclude(!) → force-include(+) → force-exclude(-)` ordering with `-` taking final precedence over `+`. State that `+` and `-` operands are exact paths post-tilde-expansion, not glob patterns, matching Pi's `matchesAnyExactPattern`.

**Spec edits.** One paragraph in `package-and-settings.md` immediately after DISC-5; one back-reference from the `loomPaths` entry schema's "Glob patterns and exclusions" bullet replacing the current "not a special snowflake" sentence. No edits elsewhere.

**Pros.** Mirrors the corpus's existing pattern of pinning concrete behaviour rather than seam-injecting it (cf. `looms/` non-recursion rule, `*.loom` byte-exact case rule, `realpath` dedup); diagnostically self-contained — an implementer reading DISC-5 sees the full algorithm without traversing to a seam definition; matches the corpus's existing direct dependency on npm packages (`chokidar`, `AJV`, `minimatch`) that are pinned through the SDK pin range.

**Cons.** Names a specific npm package in normative prose, joining `AJV` and `chokidar` in a category some sibling findings flag (cf. "AJV named in normative prose across the corpus instead of the abstracted `SchemaValidator` seam / behaviour" and "chokidar/AJV named where 'file watcher'/'JSON-schema validator' suffices"). If those findings are resolved by seam-extraction, this one re-opens.

**Risks.** A future Pi minor that changes the matcher engine or the override ordering becomes a spec-edit, not a transparent re-pin. Mitigated by the SDK-pin bump procedure already requiring an editorial review of pinned behaviour.

### Option B — Introduce a `GlobMatcher` seam in PIC

**Approach.** Add a `GlobMatcher` seam to `host-interfaces-services.md` alongside `FileSystem` and `Clock`. The seam's behavioural contract specifies the four-step ordering and the "glob" / "exact path" classification of operands; the production adapter is implemented over `minimatch`; the fake (`FakeGlobMatcher`) is wired in tests. DISC-5 and the `loomPaths` schema cite the seam instead of the engine.

**Spec edits.** New seam definition section in `host-interfaces-services.md`; a one-line cross-reference replacing the "mirror Pi's …" sentence in both DISC-5 and the `loomPaths` schema; a corresponding row in the PIC seam inventory; an entry in the `FakeFileSystem`-style fakes catalogue.

**Pros.** Matches the corpus's seam pattern for other host-touching capabilities (filesystem, clock, schema validator); keeps the engine name out of normative discovery prose; cleaner forward-compatibility — a Pi minor that changes matcher semantics becomes an adapter edit, not a spec edit; consistent with the open direction of the sibling AJV/chokidar findings.

**Cons.** Wider edit surface (seam contract, fake, inventory, audit row); adds a new injected dependency that every test touching discovery must wire; the seam's contract still has to spell out the four-step ordering somewhere — so the same prose lands, just at the seam definition rather than at DISC-5.

**Risks.** Test fixtures asserting on discovery file-sets now go through the seam; the fake's implementation becomes load-bearing for conformance and must itself be specified byte-exactly, otherwise the test corpus diverges from production.

### Recommendation

Option A. The matching algorithm is small (four bullet points), local to the discovery surface, and already adjacent to other concrete behavioural pins in `package-and-settings.md` (the `realpath` dedup rule, the `*.loom` byte-exact case rule, the `looms/` non-recursion rule). Seam extraction is the right answer when it can ride a sibling seam refactor — if and when the corpus-wide AJV/chokidar-naming findings are resolved by introducing matching seams, this one folds in. Until then, an inline pin closes the gap with the smallest possible diff.

Edge cases the implementer must address explicitly in the inline paragraph: (a) the exact-path classification of `+` / `-` operands and the post-tilde-expansion comparison rule (Pi compares against the relative path, the basename, and the POSIX-normalised absolute path — all three must match-or-not for the entry to be re-admitted/removed); (b) the case-sensitivity rule (Pi runs `minimatch` with `nocase` off — this must be stated explicitly to align with the existing "byte-exact lowercase" rule for the `*.loom` discovery glob); (c) the empty-include case (no plain pattern present ⇒ start from "everything under root," not "nothing"); (d) ordering stability when the same path is matched by multiple patterns of the same class (insertion order, matching Pi's `Array.prototype.filter` semantics).

## Relationships

- T018 "DISC-4 does not cross-reference the `pi.getCommands()` enumeration API or its `session_start` ordering presupposition" - same-cluster (Pi-side capability dependency in discovery, resolved separately)
- T091 "DISC-4 "de-registers a previously-registered loom" has no Pi-side mechanism" - same-cluster (Pi-side capability dependency in discovery, resolved separately)
- T093 "Top-level `loomPaths` and `looms` shape failures have no surfacing rule" - same-cluster (adjacent edits to the same `loomPaths` schema section; independent fix)

---

# T093 - Top-level `loomPaths` and `looms` shape failures have no surfacing rule

**Original heading:** `loomPaths` non-array type and non-object `looms` namespace have no surfacing rule
**Original section:** docs/spec_topics/ errors-and-results + discovery
**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`docs/spec_topics/discovery/package-and-settings.md` enumerates two
shape-failure rules for the loom-owned settings keys:

- A `loomPaths` **entry** that is not a string is rejected per-entry with
  `loom/load/settings-invalid-entry` (the *Type* bullet of the `loomPaths`
  entry schema).
- A recognised `looms.*` **scalar key** whose JSON value fails its declared
  type or range is treated as absent and logged once via
  `loom/load/settings-value-out-of-range` (the *Scalar-key validation*
  paragraph).

Neither rule fires when the **top-level shape** itself is wrong. If
`.pi/settings.json` (or the global file) parses successfully but contains
`"loomPaths": "single-path.loom"`, `"loomPaths": null`, `"loomPaths": { … }`,
`"looms": "fast"`, `"looms": null`, or `"looms": [ … ]`, the spec is silent:
the entry-level rule presupposes an iterable, and the scalar-key rule
presupposes a parent object. The parallel `pi.looms` key is fully covered —
`loom/load/manifest-invalid` is defined for "a string, object, `null`, or an
array containing non-string entries" — so `loomPaths` is the asymmetric
gap, and `looms` has no equivalent at all.

Two reasonable implementers will diverge: one will throw (or crash the
extension), one will iterate the JSON value as if it were the expected
shape (a string-typed `loomPaths` iterates as characters, an array-typed
`looms` accesses `looms.binderModel` as `undefined` and silently falls
through), one will treat it as absent silently with no diagnostic. The
author of a malformed settings file receives no signal that the key was
discarded.

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — *Settings file reads* → *Keys read* / *Scalar-key validation* / `loomPaths` entry schema (edited)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `settings-value-out-of-range` row (option-dependent: extended scope under Option A, untouched under Option B which adds a sibling row)

## Plan Impact

**Phases:** N/A

**Leaves:** N/A

(no `plan.md` or `plan_topics/` directory present)

## Consequence

**Severity:** correctness

Two implementers writing to the spec as it stands will produce visibly
different behaviour for a malformed top-level `loomPaths` or `looms` value:
silent drop, partial-iteration garbage, or a hard crash are all consistent
with the current text. The author of the malformed settings file gets no
diagnostic explaining why their configuration was ignored, undermining the
loud-failure posture already established for the parallel `pi.looms` key
and for nested `looms.*` scalars.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Extend `settings-value-out-of-range` to cover the two top-level shapes

- **Approach.** Broaden the *Scalar-key validation* rule (and its diagnostic) to
  treat `loomPaths` and `looms` themselves as recognised settings entries with
  declared top-level types (`string[]` and `object` respectively). Type-failure
  on either is treated as **absent** (the key contributes nothing; nested
  `looms.*` keys also evaluate as absent) and emits one
  `loom/load/settings-value-out-of-range` per offending key per file.
- **Spec edits.**
  - In `package-and-settings.md` *Keys read* paragraph or *Scalar-key validation*
    paragraph, add: "The top-level `loomPaths` key MUST be a JSON array and the
    top-level `looms` key MUST be a JSON object; a value of any other JSON type
    (including `null`) is treated as absent — the key contributes nothing and,
    for `looms`, every nested `looms.*` key also evaluates as absent — and the
    extension logs one `loom/load/settings-value-out-of-range` diagnostic per
    offending key per file, naming the source file."
  - In `code-registry-load.md`, extend the `settings-value-out-of-range` row's
    description to enumerate `loomPaths` (must be array) and `looms` (must be
    object) alongside the existing `looms.*` scalars; extend the example
    message to cover the new shapes.
- **Pros.** Single diagnostic code for the entire "wrong top-level shape" family.
  Reuses the existing absent-on-failure mechanism, which is already specified as
  non-fatal. No new code-registry row, so DIAG-4 byte-exactness surface is
  smaller.
- **Cons.** Overloads `settings-value-out-of-range`, whose name implies
  scalar/range failures rather than structural shape failures.
- **Risks.** Interacts with the sibling finding "*`settings-value-out-of-range`
  `<key>` form (dotted `looms.` vs bare) is unspecified*" — the `<key>`
  serialisation rule must cover bare `loomPaths` and bare `looms` in addition
  to the dotted nested keys. Resolve that finding's `<key>` form decision in
  the same pass.

### Option B — Introduce `loom/load/settings-invalid-shape` mirroring `manifest-invalid`

- **Approach.** Add a new diagnostic code `loom/load/settings-invalid-shape`
  (severity `error`, non-fatal) that fires on a top-level `loomPaths` whose
  JSON type is not an array or a top-level `looms` whose JSON type is not an
  object. The offending key is treated as absent; other keys in the same file
  still process; the other settings file's value is unaffected.
- **Spec edits.**
  - Add a paragraph to `package-and-settings.md` *Settings file reads* (before
    or alongside *Scalar-key validation*) introducing the new code with the
    same absent-on-failure semantics.
  - Add a new row to `code-registry-load.md` for
    `loom/load/settings-invalid-shape` whose description and example message
    parallel `manifest-invalid`'s.
- **Pros.** Diagnostically symmetric with `pi.looms` (which has its own
  dedicated `manifest-invalid` code). The code name describes the failure
  precisely; the value-out-of-range code stays focused on scalar value
  failures.
- **Cons.** Adds a code-registry row and a DIAG-4 byte-exact surface for a
  rare failure mode. Two codes (`settings-value-out-of-range`,
  `settings-invalid-shape`) where one could suffice.
- **Risks.** Implementers must decide which code fires when both `loomPaths`
  and `looms` are malformed in the same file (presumably one per offending
  key, parallel to the per-key rule for scalars; state this explicitly).

### Recommendation

Option A. The existing `settings-value-out-of-range` code already carries
the "treated as absent, logged once per key per file, non-fatal" contract
that this fix needs; extending its scope to top-level shape failures is a
one-paragraph spec edit and one row-description edit. The naming
mismatch (value-out-of-range vs structural shape) is mild and is the
cost of avoiding a new code-registry row. Coordinate the edit with the
companion finding on `<key>` serialisation so the message form is pinned
for both bare-top-level and dotted-nested keys in the same pass.

Edge cases the implementer must watch:

- When `looms` itself is malformed, every nested `looms.*` key also
  evaluates as absent (the four scalar defaults apply, and
  `binderModel`'s "no built-in default" disposition fires its own
  `binder-model-unresolved` at loom-load time if any non-bypass loom is
  in scope). Do not double-log a `settings-value-out-of-range` per
  nested key — exactly one diagnostic per malformed top-level key per
  file.
- The diagnostic is per file: a malformed `loomPaths` in the project
  file does not suppress a valid `loomPaths` in the global file. Per
  the *Merge semantics* rule, an absent project `loomPaths` means the
  global array contributes as-is (no replacement).
- `null` is malformed for both keys (consistent with the `null` rule
  for the nested scalars).

## Relationships

- T027 "`<key>` rendering for `loom/load/settings-value-out-of-range` is undetermined" - decision-overlap (under Option A, the `<key>` serialisation rule must cover bare `loomPaths` and bare `looms` in addition to the existing nested-dotted form)

---

# T094 - DISC-4 invokes a `--loom` "hyphen-normalise to the same wire name" transform that contradicts the Filename-validity "taken verbatim" rule and is nowhere defined

**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`discovery-sources.md` **Filename validity** defines a slash name as the loom file's stem taken verbatim — no character substitution — and the accepted regex `^[a-z0-9][a-z0-9_-]*$` admits `-` and `_` as distinct stem characters, so `code-review` and `code_review` are two valid, lexically distinct slash names. DISC-4 on the same page contradicts that rule twice: its collision example names "`--loom` components that resolve to files whose stems hyphen-normalise to the same wire name," and the paragraph below says detection runs on the final derived name "after `pi.looms` mapping, `as` rename, and basename hyphen-normalisation." Neither the hyphen-normalisation transform nor its direction is defined anywhere in the discovery subtree, and "wire name" is a chartered schema-field term (`schemas.md`, `glossary.md`) with no slash-discovery meaning. `pi-integration-contract/active-invocation-registry.md` propagates the same undefined transform into the `ActiveInvocationRegistry.loom` canonical-key definition, so the operator-visibility key inherits the ambiguity and the same-format `loom/load/cross-format-collision` conformance tests have no single expected outcome.

## Solution approach

Delete the undefined hyphen-normalisation transform from the discovery prose. In `discovery-sources.md` DISC-4, rewrite the `--loom` collision example so it describes components resolving to files with the same stem, dropping the "wire name" phrasing; and change the final-derived-name derivation list so it names only `pi.looms` mapping and the `as` rename. In `active-invocation-registry.md`, rewrite the `ActiveInvocationRegistry.loom` field's canonical-key derivation to take the stem verbatim per **Filename validity**, striking the `basename-hyphen-normalised` clauses. Leave `frontmatter/frontmatter-fields-a.md` and `tool-calls.md` unchanged — the hyphen→underscore rewrite legitimately produces the `tools:` callable identifier there and has no role in slash-name derivation.

## Solution constraints

- Out of scope: the ERR-7 definition and the `cross-source-shadow` / `cross-format-collision` payload-field statements on the discovery pages owned by T095.

## Relationships

- T095 "ERR-7 lacks a defining anchor on the discovery pages, and the payload field carrying shadow/collision paths is unstated" - same-cluster (other DISC-4-adjacent gap on the same page)
# T095 - ERR-7 lacks a defining anchor on the discovery pages, and the payload field carrying shadow/collision paths is unstated

**Original heading:** ERR-7 has no defining section/anchor on the discovery pages; cross-source-shadow/collision payload field unspecified
**Original section:** docs/spec_topics/ errors-and-results + discovery
**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`error-model.md` line 66 lists ERR-7 — *"watcher-time reload failures (per [Discovery](../discovery.md))"* — alongside ERR-1..ERR-6 and ERR-16 as a pre-evaluation failure surface, inheriting the bullet-list contract (`loom-system-note` channel, `triggerTurn: false`, no final value, not subject to cancellation). The cross-reference points at `discovery.md`, but neither that aggregator nor either of its two sub-pages (`discovery/discovery-sources.md`, `discovery/package-and-settings.md`) carries an `#err-7` anchor, names ERR-7, or enumerates which watcher-reload outcomes elevate to it. A grep across `docs/` returns the single error-model.md mention. The reader is therefore left to infer ERR-7's trigger set from prose scattered across `registration-steps.md` step 5 (the chokidar discovery watcher and atomic registry swap), `package-and-settings.md` "Caching and reload" (the 250 ms-debounced settings watcher), and `diagnostic-shape.md` "Re-scan deduplication" — and to guess which `loom/load/*` and `loom/runtime/*` codes route through ERR-7's pre-evaluation surface versus the ordinary load/runtime channels. The emission-timing question is also open: does ERR-7 fire at watcher-event time (during the re-parse / swap), or at the *next invocation* of the rebuilt entry (the pattern `frontmatter-fields-b-and-templates.md:25` already uses for `unknown_tool`)?

Separately, the discovery prose for the two related diagnostics under-specifies which Diagnostic field carries the path list. `discovery-sources.md:39` says `loom/load/cross-source-shadow` is "emitted naming both paths" and DISC-4 says `loom/load/cross-format-collision` is emitted "naming **every** colliding path", but neither sentence states whether those paths live in `message`, in a structured `details` field, or in `related[]`. The information is recoverable — `code-registry-load.md:35-36` shows the paths interpolated into the *Message template* via `<higher>` / `<lower>` placeholders, and `placeholder-rendering-b.md:70` renders the byte-exact example — but `diagnostic-shape.md` declares `details?` is per-row pinned by *Trigger* prose, and the cross-source-shadow / cross-format-collision rows neither declare a `details` payload nor explicitly state that one is absent. A consumer building structured log-pipeline tooling against the discovery diagnostics cannot tell from the discovery pages alone whether to parse `message` or read a structured field.

## Spec Documents

- `docs/spec_topics/errors-and-results/error-model.md` — ERR-7 pre-evaluation list entry (read-only; anchor stays here, definition is added on the discovery page it points at)
- `docs/spec_topics/discovery/package-and-settings.md` — "Caching and reload" section (edited; natural home for ERR-7's trigger / code / timing definition since both watchers are specified or co-specified here)
- `docs/spec_topics/discovery/discovery-sources.md` — "Source priority" paragraph and DISC-4 (edited; add the payload-field statement for `cross-source-shadow` and `cross-format-collision`)
- `docs/spec_topics/pi-integration-contract/registration-steps.md` — step 5 watcher / hot-reload registration (read-only; canonical source for watcher mechanics and the structural-change `loom-system-note`)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `cross-source-shadow` / `cross-format-collision` rows (read-only; message templates already encode the paths; the discovery-page edit must stay in lock-step with these rows)
- `docs/spec_topics/diagnostics/diagnostic-shape.md` — `Diagnostic` shape, `details` conventions, "Re-scan deduplication" paragraph (read-only)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — `unknown_tool` cause comment at line 166 (read-only; precedent for "lost across a file-watcher reload")

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project has `plan.md` and `plan_topics/`, but `plan_topics/` currently contains only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md` — no executable leaves authored yet. Grep for `ERR-7`, `watcher`, `reload`, `cross-source-shadow`, `discovery` across `plan_topics/` and `plan.md` returns no hits.)

## Consequence

**Severity:** correctness

Two conformant implementers will disagree on (a) the closed set of `loom/load/*` and `loom/runtime/*` codes that route through ERR-7's pre-evaluation contract (`triggerTurn: false`, no final value, on `loom-system-note`) versus the ordinary persistent-diagnostic channels, and (b) whether ERR-7 fires synchronously at watcher-event time or at next-invocation of the rebuilt entry. Conformance tests citing the ERR-7 anchor have nothing to assert against. Independently, log-pipeline / operator-tooling consumers cannot tell from the discovery prose whether the shadowed-path list is structured (`details`) or freeform (`message`); the byte-exact `Message` example pins one answer for testing, but the spec never closes the door on a structured `details` field appearing alongside.

## Solution Space

**Shape:** multiple
**State:** shaped

This finding bundles two independent obligations: defining ERR-7 on the discovery pages, and stating the payload field for the two collision diagnostics. They touch overlapping but disjoint prose (the ERR-7 definition lives at "Caching and reload" / a new sibling section in `package-and-settings.md`; the path-field statement lives at the `cross-source-shadow` sentence in `discovery-sources.md` and DISC-4). Resolve sequentially — the smaller payload-field clarification first (one sentence each at two pinned sites, no normative branching), then the ERR-7 definition (which enumerates a closed code set and pins emission timing, a larger surface).

### Option A — Payload-field clarification for `cross-source-shadow` and `cross-format-collision`

- **Approach.** Extend the "emitted naming both paths" sentence on `discovery-sources.md:39` and the "naming **every** colliding path" sentence in DISC-4 to state explicitly that the paths are carried in the diagnostic's `message` field per the *Message template* registered in [`code-registry-load.md`](../diagnostics/code-registry-load.md) for `loom/load/cross-source-shadow` and `loom/load/cross-format-collision`, and that neither row declares a `details` payload — consumers parse the rendered message (whose template is byte-exact per [`placeholder-rendering-b.md`](../diagnostics/placeholder-rendering-b.md)).
- **Spec edits.**
  - `discovery-sources.md:39` — append a clause: *"… naming both paths in the diagnostic's `message` field per the [`loom/load/cross-source-shadow`](../diagnostics/code-registry-load.md) row; no structured `details` payload is emitted for this code."*
  - DISC-4 (same file) — append the parallel clause for `loom/load/cross-format-collision`, noting that the message lists every colliding path via the same template-driven rendering.
- **Pros.** Pure clarification; no normative branching; locks in the current implementation contract. Closes the "is there a `details` field?" ambiguity in the direction the message-template rendering example at `placeholder-rendering-b.md:70` already pins.
- **Cons.** Forecloses on a future `details` addition for these two codes (mitigated by GOV-30 lock-step — any future addition would sweep both sites).
- **Risks.** None — the message template already encodes the path list.

### Option B — ERR-7 definition section on `package-and-settings.md`

- **Approach.** Add a `<a id="err-7"></a>` anchor at the end of the "Caching and reload" section of `package-and-settings.md` (the natural home, since the settings-file watcher is specified inline there and the discovery watcher is cross-referenced from PIC `registration-steps.md` step 5). Under the anchor, enumerate the closed set of watcher-reload outcomes that elevate to ERR-7's pre-evaluation contract (`triggerTurn: false`, no final value, on `loom-system-note`, not subject to cancellation, per `error-model.md`), pin emission timing, and cross-reference the underlying codes from `code-registry-load.md` and `code-registry-runtime.md`.
- **Spec edits.**
  - `package-and-settings.md` — new paragraph after "Caching and reload":
    > <a id="err-7"></a> **ERR-7.** **Watcher-time reload failures.** The watcher / hot-reload registry swap (per [Pi Integration Contract — watcher / hot-reload registration](../pi-integration-contract/registration-steps.md#watcher-hot-reload-registration) for the discovery watcher and the "Caching and reload" paragraph above for the settings watcher) elevates the following codes to ERR-7's pre-evaluation contract per [Errors and Results — ERR-7](../errors-and-results/error-model.md#err-7): every `loom/load/*` and `loom/parse/*` code re-emitted on the watcher's re-parse path (per the **Re-scan deduplication** rule in [Diagnostics — Diagnostic shape](../diagnostics/diagnostic-shape.md)); the structural-change `loom-system-note` from [Pi Integration Contract — Structural changes](../pi-integration-contract/registration-steps.md); and `loom/runtime/reload-teardown-timeout` per [`code-registry-runtime.md`](../diagnostics/code-registry-runtime.md). Emission timing is **watcher-event time** for re-parse codes (the swap publishes after the debounced re-parse completes; failed-to-parse files re-emit their persistent diagnostic at that instant) and **next-invocation time** for the `unknown_tool` cause specifically described at [Frontmatter — `tools:`](../frontmatter/frontmatter-fields-b-and-templates.md), which routes through `CodeToolError` rather than ERR-7.
  - `error-model.md` line 66 — change the parenthetical to `(per [Discovery — ERR-7](../discovery/package-and-settings.md#err-7))` so the cross-reference resolves to the new anchor (the `discovery.md` aggregator stays a pure index).
- **Pros.** Closes the conformance-test gap; pins both the trigger set and the timing question; co-locates the definition with the settings-watcher mechanics it already specifies. Honours the GOV-30 / GOV-1 anchor-per-obligation convention `error-model.md` already invokes for ERR-1..ERR-6 / ERR-16.
- **Cons.** Requires deciding the precise closed code set — implementer must walk `code-registry-load.md` / `code-registry-runtime.md` and confirm none belong to a separate pre-evaluation surface.
- **Risks.** If the structural-change `loom-system-note` is *not* ERR-7 in the author's intent (it has `display: true` and is a single-line operator prompt, not a pre-evaluation failure surface in the strict sense), the closed set above needs trimming. The implementer should confirm against PIC `registration-steps.md` step 5 before pinning. Treating the `loom/load/settings-*` codes emitted during a settings-reload re-merge as ERR-7-routed is similarly worth confirming.

### Recommendation

Adopt **Option A first**, then **Option B**. Land Option A as a one-commit, two-sentence change with no risk of cascading critiques on the next review pass. Then land Option B on the resulting stable baseline, scoping its review surface to the ERR-7 enumeration only. The two changes are independent — Option A does not depend on Option B's anchor existing, and Option B does not touch the cross-source-shadow / cross-format-collision sentences Option A edits — so sequencing them avoids the bundled-diff blow-up the `spec-diff-fix-loop` would otherwise produce. Edge cases the implementer must watch for Option B: confirm with PIC `registration-steps.md` step 5 whether the structural-change system note is part of ERR-7's surface (it carries `display: true` and may belong to a separate operator-prompt channel), and confirm whether settings-reload re-merge diagnostics route through ERR-7 or stay on the ordinary persistent-diagnostic channel.

## Relationships

None

---

# T096 - `loom-direct:` `toolCallId` shape, uniqueness, and minting source are unspecified

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`host-interfaces-core.md`'s **Tool execution from loom code** bullet and `tool-calls.md`'s *loom 1.0 seam — per-call timeout* paragraph both describe the `toolCallId` passed to a Pi tool's `execute(...)` for code-side `<name>(args)` calls as "a synthesised UUID prefixed `loom-direct:`", but neither pins the separator and post-prefix form (literal `loom-direct:` plus which UUID form), the uniqueness guarantee and its scope, or the minting source. PIC-20 makes the `IdSource` seam the sole sanctioned UUID minter and forbids the runtime from calling `crypto.randomUUID()` outside the production adapter, yet `toolCallId` has no enumerated minting path — a literal reading leaves an implementer unable to mint one admissibly. Concurrent re-entrant `.loom`-callable adapter calls (parallel tool-call mode entering the same adapter) make the uniqueness question observable. Conformance fixtures asserting on the rendered id cannot be written, and two implementers diverge on the id surface and on whether `crypto.randomUUID()` is in scope at this site.

## Solution approach

Pin the full `toolCallId` contract at `host-interfaces-core.md`'s **Tool execution from loom code** bullet (the one introducing `toolCallId`) and reduce the `tool-calls.md` *loom 1.0 seam — per-call timeout* reference to a forward-link. State that the value is the string `loom-direct:` concatenated with a canonical lowercase 8-4-4-4-12 hex UUID, citing the §7 `<invocation-id>` placeholder convention in `placeholder-rendering-b.md` as the source of the UUID-form contract. State that a fresh id is minted per code-side `<name>(args)` call — including each re-entrant entry in a parallel `.loom`-callable batch — and name the uniqueness scope. Route the UUID minting through the PIC-20 `IdSource` seam (`#pic-20` in `host-interfaces-services.md`) so the ambient-UUID prohibition is satisfied.

## Solution constraints

- Do not weaken PIC-20's ambient-UUID prohibition: the runtime MUST NOT call `crypto.randomUUID()` (or any other ambient UUID source) outside the production adapter, and the minting path stays routed through the `IdSource` seam.
- The canonical 8-4-4-4-12 hex UUID form is owned by §7 of `placeholder-rendering-b.md`; reference it rather than authoring an independent form definition.

## Relationships

- T097 "`loom-direct:` toolCallId has no PIC-20-compliant minting path" - co-resolve (the two findings cite the same underlying gap from the form-side and the minting-side respectively).
# T097 - `loom-direct:` toolCallId has no PIC-20-compliant minting path

**Original heading:** `loom-direct:` toolCallId minting path collides with the PIC-20 ambient-UUID ban
**Original section:** docs/spec_topics/ tool-calls, cancellation, hard-ceilings
**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

PIC-20 (`docs/spec_topics/pi-integration-contract/host-interfaces-services.md:152`) makes the `IdSource` seam the sole sanctioned source of UUID-shaped identifiers minted at runtime: the runtime "MUST mint each `invocationId` through this seam and MUST NOT call `crypto.randomUUID()` (or any other ambient UUID source) outside the production adapter." The seam's normative member surface — pinned to `newInvocationId(): string` — exposes exactly one minter, named for the `invocationId` use case.

`docs/spec_topics/pi-integration-contract/host-interfaces-core.md:82` and the open-struct seam at `docs/spec_topics/tool-calls.md:40` then mandate a second runtime-minted identifier: the `toolCallId` passed to `tool.execute(toolCallId, params, signal, onUpdate, ctx)` for every code-side `<name>(args)` call, "a synthesised UUID prefixed `loom-direct:`." A `toolCallId` is not an `invocationId` (different lifetime, different cardinality — one per tool call vs one per loom invocation), and the PIC-20 seam offers no member that returns one. An implementer reading the spec literally has three contradictory options: reuse `newInvocationId()` (semantically wrong — the `invocationId` is already in the `ActiveInvocationRegistry` entry, and tests fakes seeding the id sequence will collide with the registry's expected values), call `crypto.randomUUID()` directly (forbidden by PIC-20's MUST NOT), or invent an undocumented seam member. None of these is admissible without a spec edit.

The same gap leaves `FakeIdSource` (used to drive deterministic conformance tests for the `loom/runtime/reload-teardown-timeout` `<list>` and the `RuntimeEvent.invocation_id` wire field) unable to produce deterministic `toolCallId`s, breaking the test-injectability rationale PIC-20 explicitly invokes.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-20 `IdSource` seam (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — "Tool execution from loom code" (edited)
- `docs/spec_topics/tool-calls.md` — Concurrency seam blockquote (option-dependent)
- `docs/spec_topics/implementation-notes.md` — `crypto.randomUUID()` carve-out wording (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project's `plan.md` has no leaves authored yet — Horizontal, MVP, and Vertical sections are all empty placeholders.)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one reuses `newInvocationId()` and silently corrupts the deterministic `invocationId` sequence the registry's `<list>` rendering and `RuntimeEvent.invocation_id` fixtures depend on; another calls `crypto.randomUUID()` and violates PIC-20's normative MUST NOT (also defeating test injectability). Either path produces a tool that ships but fails conformance against a test suite that probes either surface.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Add `newToolCallId(): string` to the `IdSource` seam

- **Approach.** Widen the `IdSource` interface in PIC-20 to a second member, `newToolCallId(): string`, returning the canonical lowercase 8-4-4-4-12 hex UUID (the same shape `newInvocationId` returns; the `loom-direct:` prefix is applied by the caller in `host-interfaces-core.md`, not by the seam).
- **Spec edits.**
  - `host-interfaces-services.md` PIC-20 — add the member to the inline `interface IdSource` block; extend the `CryptoIdSource` and `FakeIdSource` adapter paragraphs to describe its production (`crypto.randomUUID()`) and test (next-from-configured-sequence) wirings; extend the normative "MUST mint each `invocationId` through this seam and MUST NOT call `crypto.randomUUID()` ..." sentence to "MUST mint each `invocationId` and each `toolCallId`'s UUID portion through this seam."
  - `host-interfaces-core.md` "Tool execution from loom code" — replace the bare "synthesised UUID prefixed `loom-direct:`" with "synthesised as the string `loom-direct:` concatenated with `IdSource.newToolCallId()`'s return value (canonical lowercase 8-4-4-4-12 hex UUID)."
- **Pros.** Preserves PIC-20's no-ambient-UUID stance unchanged; preserves test injectability symmetrically for both identifiers; the seam already exists, so the change is one interface member and two adapter sentences.
- **Cons.** Widens the loom 1.0 seam surface (a GOV-18 arm (a) carve-out applies — the member is internal DI, not a published contract — but the surface still grows by one member); requires `FakeIdSource` fixtures to seed two sequences instead of one.
- **Risks.** None material; the interface widening is additive and does not perturb existing call sites.

### Option B — Reuse `newInvocationId()` for the UUID portion

- **Approach.** Pin in `host-interfaces-core.md` that the `loom-direct:` `toolCallId` is constructed by concatenating `loom-direct:` with a fresh `IdSource.newInvocationId()` call. State explicitly that the value is not registered as an `invocationId` and is consumed only as the tool-call identifier.
- **Spec edits.**
  - `host-interfaces-core.md` "Tool execution from loom code" — rewrite the `toolCallId` bullet as above.
  - `host-interfaces-services.md` PIC-20 — add a sentence noting `newInvocationId()` is also called to mint the UUID portion of `loom-direct:` `toolCallId`s, and that the resulting values are not constrained to be globally unique across both populations (only within their own).
  - `FakeIdSource` paragraph — note that the configured id sequence is drawn from for both purposes in call order.
- **Pros.** Zero seam-surface growth; the seam's "canonical lowercase 8-4-4-4-12 hex UUID" contract already provides the right shape.
- **Cons.** Semantically misnames the call (an id minted by `newInvocationId()` that is not an invocation id); test fixtures that previously seeded `FakeIdSource` to assert against the registry's `<list>` rendering now have to interleave tool-call-id minting positions, making conformance tests for `loom/runtime/reload-teardown-timeout` ordering brittle to changes in tool-call counts; couples two independent identifier populations through a single deterministic sequence.
- **Risks.** Future divergence — e.g. a UUID-vs-opaque-string change for one population — requires unwinding the reuse.

### Option C — Carve `toolCallId` out of the PIC-20 ban

- **Approach.** Amend PIC-20's MUST NOT to read "MUST NOT call `crypto.randomUUID()` (or any other ambient UUID source) outside the production adapter, except inside the `loom-direct:` `toolCallId` synthesis path defined in [Tool execution from loom code]." Pin that the tool-call site calls `crypto.randomUUID()` directly with no DI seam.
- **Spec edits.**
  - `host-interfaces-services.md` PIC-20 — add the carve-out clause.
  - `host-interfaces-core.md` "Tool execution from loom code" — rewrite the `toolCallId` bullet to specify the direct `crypto.randomUUID()` call and the lowercase canonical form.
  - `implementation-notes.md:30` (the parallel carve-out reference) — mirror the carve-out.
- **Pros.** Smallest interface change (no new seam member).
- **Cons.** Sacrifices test injectability for `toolCallId`s — conformance tests cannot assert on a known `toolCallId` value, only on the `loom-direct:` prefix and shape; contradicts PIC-20's own rationale ("deterministically controllable by a test fake rather than drawn from a runtime-global UUID source"); introduces a precedent for further carve-outs that erodes the no-ambient-UUID stance.
- **Risks.** Subsequent identifier-minting sites (any future runtime-minted UUID) face the same pressure to carve out, gradually nullifying PIC-20.

### Recommendation

**Option A.** Adding `newToolCallId()` to the `IdSource` seam is the only path that preserves PIC-20's two stated goals — single chokepoint for UUID minting and deterministic test injectability — for both identifier populations. The seam-surface growth is one method on an internal DI interface already covered by GOV-18 arm (a)'s non-normative-signature carve-out; the cost is negligible. Edge cases the implementer must watch: (i) the `loom-direct:` prefix is applied at the call site, not inside `newToolCallId()`, so the seam member's contract remains "returns a canonical lowercase 8-4-4-4-12 hex UUID" identical in shape to `newInvocationId()`; (ii) `FakeIdSource` must seed two independent sequences (or one sequence consulted by call order, documented explicitly) so a test asserting on `RuntimeEvent.invocation_id` is not perturbed by interleaved tool-call-id minting; (iii) the `crypto.randomUUID()` carve-out wording in `implementation-notes.md:30` continues to refer to "the production adapter" and needs no change.

## Relationships

- T096 "`loom-direct:` `toolCallId` shape, uniqueness, and minting source are unspecified" - co-resolve ((the same `host-interfaces-core.md` "Tool execution from loom code" bullet edit naming the seam member also pins suffix shape, uniqueness, and canonical UUID form).)

---

# T098 - Three testability gaps in tool-calls / cancellation: pre-eval-throw `<name>` token, missing non-resolvable `.loom` arg-mismatch surface, and unspecified cancelled `message`

**Original heading:** Tool-calls/cancellation testability: pre-eval throw `<name>` token undefined; non-statically-resolvable `.loom` arg-mismatch variant unstated; cancelled `message` is `"..."`
**Original section:** docs/spec_topics/ tool-calls, cancellation, hard-ceilings
**Kind:** testability (shard-07)
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`tool-calls.md` and `cancellation.md` carry three independent testability gaps that block byte-exact / variant-exact conformance fixtures:

1. **`<name>` token in the pre-evaluation setup-throw template is unbound.** `tool-calls.md` Failures pins the `.loom`-callable adapter's pre-evaluation setup-throw translation as `{ isError: true, content: [{ type: "text", text: "loom <name> aborted with internal error: <error.message>" }] }`, but `<name>` is never defined for this site. The spec offers three plausible referents — the post-`as` callable-set identifier (the entry name the caller wrote, after rename and the default hyphen→underscore loom-basename rewrite), the bare `.loom` file basename, or the resolved path — and the surrounding user-facing framings in `errors-and-results/error-model.md` and `pi-integration-contract/runtime-event-channel.md` use `/<name>` (slash-prefixed slash-command name), which is yet a fourth form. A byte-exact fixture for parallel-tool-mode `.loom`-adapter setup-throw cannot be authored without pinning this.

2. **Non-statically-resolvable `.loom`-callable input type-mismatch has no surfacing variant.** `tool-calls.md` Argument shape says "for a `.loom` callable, an argument that does not type-check against the callee's `params:` surfaces as `loom/parse/tool-arg-type-mismatch` when the callee is statically resolvable; otherwise the runtime AJV check is the safety net," but the Failures paragraph names no `QueryError` variant for that runtime safety-net case. Pi-tool input mismatches are explicitly routed to `Err(CodeToolError { cause: "validation", ... })`; `.loom`-callable input mismatches are not routed anywhere. The Failures paragraph's only `.loom`-callable arms are callee-returned `Err` (`InvokeCalleeError`), infra failures around the callee (`InvokeInfraError` with `cause` in `{load_failure, parse_failure, validation, return_validation, panic, internal_error, subagent_model_unresolved}`), and the `unknown_tool` safety net — none of which the prose ties to the non-resolvable arg-mismatch path. Two implementers will pick different variants.

3. **Cancelled query `message` is the literal string `"..."`.** `cancellation.md`'s Surfacing block lists `Err(QueryError { kind: "cancelled", message: "..." })` for the in-flight-query arm, while the sibling tool-call and invoke arms on the same list use the bare `... ` field-elision convention (`{ kind: "code_tool", cause: "cancelled", ... }`). The query arm therefore reads as either (a) a literal three-dot string the runtime must emit, or (b) the same field-elision convention as the siblings with the surrounding quotes incidental — the two are indistinguishable in the source. The `CancelledError` schema in `errors-and-results/queryerror-variants.md` declares `message: string` without further constraint, and no oracle anywhere in the corpus pins the byte content. The same `"..."` form recurs for the swallowing-handler paragraph's `OOMError`-style `.message` reference, which compounds the ambiguity.

## Spec Documents

- `docs/spec_topics/tool-calls.md` — Failures, *Pre-evaluation setup throw* bullet (edited)
- `docs/spec_topics/tool-calls.md` — Argument shape paragraph; Failures paragraph (edited)
- `docs/spec_topics/cancellation.md` — Surfacing block (edited)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — `CancelledError`, `CodeToolError`, `InvokeInfraError` schemas (read-only; option-dependent for obligation 2 if the chosen variant requires an enum extension)
- `docs/spec_topics/diagnostics/code-registry-parse.md` — `loom/parse/tool-arg-type-mismatch` row (read-only; cross-reference target)
- `docs/spec_topics/invocation.md` — Argument binding paragraph (read-only; precedent for the parse-time-vs-runtime split)
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — user-facing framing rows (read-only; precedent for the `/<name>` form)
- `docs/spec_topics/errors-and-results/error-model.md` — Runtime panics user-facing framing (read-only; precedent for the `/<name>` form)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — `plan.md` has no leaves authored yet (Horizontal, MVP, and Vertical sections all marked _"(No leaves yet — author per the template.)"_), so no leaf is modified or blocked. The three obligations will surface in whichever future leaves close `CodeToolError` / `InvokeInfraError` surfacing, `.loom`-callable adapter wiring, and cancellation-surfacing fixtures; they do not exist today.

## Consequence

**Severity:** correctness

Each of the three gaps independently lets two reasonable implementers produce divergent observable behaviour: differing user-facing setup-throw strings (e.g. `loom summarise aborted ...` vs `loom /summarise aborted ...` vs `loom ./summarise.loom aborted ...`), differing `QueryError` variants for the same non-resolvable `.loom` arg-mismatch input (an author who `match`es `CodeToolError { cause: "validation", ... }` will miss the failure on one implementation and catch it on the other), and differing cancelled-`message` bytes that defeat any byte-exact conformance fixture on the cancellation surface.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles three independent obligations on the same two pages. Each has its own narrow fix; they share no edit surface and their fixes do not interact. Decompose so each can land separately.

### Option A — Pin `<name>` in the pre-evaluation setup-throw template

**Approach.** Define `<name>` at the bullet site as the post-`as` callable-set identifier (the entry name in the caller's `tools:` after rename and the default hyphen→underscore loom-basename rewrite — the same form `tool-calls.md`'s opening sentence already names "an entry in the loom's *callable set*"). Inline the definition in the bullet rather than relying on the reader to infer it from context.

**Spec edits.** In `tool-calls.md` Failures, *Pre-evaluation setup throw* bullet, replace `"loom <name> aborted with internal error: <error.message>"` with a form that names the substitution explicitly — either (i) inline definition: `"loom <callable-set-name> aborted with internal error: <error.message>"` and a one-clause gloss `(<callable-set-name> is the caller's post-`as`, post-hyphen-rewrite entry in tools:)`, or (ii) keep `<name>` and add the same gloss in a parenthetical immediately after the template.

**Pros.** Single-bullet edit. Internally consistent — the opening sentence of `tool-calls.md` already defines "callable set" in exactly these terms. The post-`as` form is what the caller wrote, which is the form a user-facing string should echo.

**Cons.** Introduces a different `<name>` referent from the `/<name>` framings in `error-model.md` and `runtime-event-channel.md`; the divergence is real (slash-command framing is owned by the slash surface; this adapter is invoked from a model's parallel-tool batch and has no slash context) but worth a one-sentence justification at the bullet so the next reviewer does not "fix" it back to `/<name>`.

**Risks.** Low. The bullet is already self-contained; the edit does not cascade.

### Option B — Route non-resolvable `.loom` arg-mismatch through `Err(InvokeInfraError { cause: "validation", ... })`

**Approach.** Treat the runtime safety-net surface for a `.loom`-callable input mismatch as semantically `invoke`-shaped (consistent with `tool-calls.md`'s own Relationship-with-`invoke` paragraph: "a `.loom` callable call ... is, semantically, an `invoke`"). The existing `InvokeInfraError.cause: "validation"` member already exists for exactly this purpose — its definition reads "args/params failed input-schema validation (input side, like CodeToolError.cause 'validation')" — and was added with the cross-page comparison `.loom` callable calls already invite.

**Spec edits.** In `tool-calls.md` Argument shape, after the sentence "otherwise the runtime AJV check is the safety net," append: "and surfaces as `Err(InvokeInfraError { cause: \"validation\", ... })` per [Invocation — Failures](./invocation.md)." In the Failures paragraph, add a sentence to the existing `.loom`-callable arm (`InvokeCalleeError` / `InvokeInfraError`) that pins the input-validation routing explicitly: "input-side validation failure on a `.loom`-callable call (when the callee is not statically resolvable) surfaces as `InvokeInfraError { cause: \"validation\", ... }`, matching the `invoke(...)` arm on the same surface."

**Pros.** Reuses an existing enum member with prose specifically engineered for this case. Consistent with the operational-equivalence claim in the Relationship-with-`invoke` paragraph. No schema change in `queryerror-variants.md`.

**Cons.** Authors writing a single `match` arm to catch all `<name>(args)` input failures must now match `CodeToolError { cause: "validation" }` (Pi-tool arm) and `InvokeInfraError { cause: "validation" }` (`.loom`-callable arm). The Failures paragraph should note this explicitly to avoid surprising the author.

**Risks.** Low — the schema already supports this and `invoke(...)` already uses it. The only downside is the dual-match-arm requirement, which is editorial to document.

### Option C — Replace the literal `"..."` in the cancelled-query Surfacing line with the field-elision form used by its siblings

**Approach.** Either delete the `message: "..."` clause entirely (matching the sibling tool-call and invoke arms which use only `...` for omitted fields) or, if the author intends to signal "message is implementation-defined free text," say so in prose rather than embedding a placeholder string. Do not pin the byte content of the message — no other `QueryError` variant's `message` field is pinned, and adding a byte-exact constraint here would be a one-off.

**Spec edits.** In `cancellation.md` Surfacing block, change `Err(QueryError { kind: "cancelled", message: "..." })` to `Err(QueryError { kind: "cancelled", ... })`. Audit the same block's swallowing-handler paragraph for a parallel `"..."`-as-`.message` token and apply the same elision if it reads as a literal.

**Pros.** Trivial diff. Aligns the four Surfacing bullets on a single elision convention. Avoids adding a byte-exact constraint where the schema-level "freeform `string`" contract is what loom 1.0 actually wants.

**Cons.** Loses the (probably-unintentional) hint that the runtime emits *something* in `message`. If that hint is wanted, replace it with one sentence below the bullet list: "The `message` field is implementation-defined human-readable text; no byte-exact constraint applies."

**Risks.** None — the schema in `queryerror-variants.md` already declares `message: string` without further constraint, so this edit is harmonising, not narrowing.

### Recommendation

Adopt Options A, B, and C in that order. Resolve them as three separate fixes, not one bundled edit:

1. **Option C first.** Trivial single-line elision on `cancellation.md`; it touches a different page from A/B and lands without affecting their baseline.
2. **Option A second.** Single-bullet edit on `tool-calls.md` Failures; isolates the `<name>`-token clarification before the same paragraph is touched again for B.
3. **Option B last.** The largest of the three (two paragraphs in `tool-calls.md`); lands on a baseline already cleaned up by A so the diff is minimal and the next review pass has the smallest critique surface.

Edge cases the implementer must watch:

- For Option A, do not silently propagate `<name>` as `/<name>` from the slash-command framings — the adapter site has no slash context. If a reviewer pushes back, the justification is the model's parallel-tool batch entry point, not the slash entry point.
- For Option B, ensure the Failures paragraph's new sentence is unambiguous about *input-side* validation; the existing `return_validation` / `validation` distinction on `InvokeInfraError.cause` must not be conflated.
- For Option C, the swallowing-handler paragraph's `OOMError`-style `.message` reference uses `"..."` in the same suspect way — check whether it is the same placeholder convention and harmonise if so.

## Relationships

- T025 "Shard-07 hidden-host assumptions and stale residue" - same-cluster (hidden-assumptions concern on the same pages)

---

# T099 - `loom/load/callee-has-errors` promises codes via `related` that the `related` shape and renderer cannot carry

**Original heading:** `callee-has-errors` "carries codes via `related`" contradicts the `related` shape and its rendering
**Original section:** docs/spec_topics/diagnostics/
**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

Two normative surfaces collide. `docs/spec_topics/diagnostics/code-registry-load.md`'s `loom/load/callee-has-errors` row states "The diagnostic carries the callee's own diagnostic codes via `related`," and `docs/spec_topics/invocation.md` (Static resolution paragraph) repeats the claim verbatim — "naming the callee and listing the underlying diagnostic codes via `related`." But the `Diagnostic.related` element shape in `docs/spec_topics/diagnostics/diagnostic-shape.md` is closed at `{ file, range, message }` with no `code` member, and the *Serialised content format* paragraph on the same page is emphatic: each related line is rendered as `"  <file>:<line>:<col>: <message>"`, "**no** `<code>` prefix, because related entries carry no code."

A conforming implementation cannot satisfy both promises. Either the structured payload must carry the callee's codes (which the shape forbids and the renderer cannot surface), or the row's prose is overselling what `related` actually delivers. Because DIAG-4 makes the *Message* column byte-exact and the rendering rule is normative, this is not a wording nit — it is a genuine disagreement about what the load-time consumer of `callee-has-errors` is entitled to read out of the diagnostic.

A test author writing against this row today will either (a) assert that `related[i].code` exists and fail because the shape has no such field, or (b) parse the rendered `related` lines for codes and find none. A consumer that needs the callee codes for routing or aggregation has no place to read them.

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/callee-has-errors` row (edited)
- `docs/spec_topics/invocation.md` — Static resolution paragraph (edited)
- `docs/spec_topics/diagnostics/diagnostic-shape.md` — `Diagnostic.related` shape and *Serialised content format* paragraph (option-dependent)
- `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md` — references the code (read-only)
- `docs/spec_topics/type-system.md` — references the code in the unresolvable-callee posture (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan currently lists no horizontal, MVP, or vertical leaves.)

## Consequence

**Severity:** correctness

DIAG-4 makes both the rendered message and (per the row's *Trigger* pinning convention) the structured payload normative. Two implementers reading this row will diverge: one will follow the row prose and invent a code-bearing channel (extending `related` with a `code` field, embedding `[<code>]` in the message, or adding a `details.calleeCodes` array), breaking the rendering rule or the closed shape; the other will follow the shape and silently drop the codes the row promises. Both arms make tests written against `callee-has-errors` and `invocation.md` non-portable across implementations.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Walk back the row to "error sites, no codes"

**Approach.** Reword the `loom/load/callee-has-errors` row and the matching sentence in `invocation.md` so neither promises codes via `related`. The diagnostic enumerates the callee's *sites* (file/range/message), not its codes. If consumers need the codes, they can re-parse the callee themselves or open the callee's own pre-emitted diagnostics from the per-load-pass parse cache.

**Spec edits.**
- `code-registry-load.md` row: replace "The diagnostic carries the callee's own diagnostic codes via `related`" with something like "The diagnostic's `related` array carries one entry per underlying error site in the callee, with `{ file, range, message }` per `diagnostic-shape.md`; the callee's own diagnostics are emitted separately through the normal channel."
- `invocation.md` Static resolution paragraph: replace "listing the underlying diagnostic codes via `related`" with "listing the underlying error sites via `related`."
- No change to `diagnostic-shape.md`.

**Pros.** Smallest diff. Preserves the closed `{ file, range, message }` shape that `type-alias-cycle`, name-collision rows, and every other `related` consumer already rely on. Keeps the rendering rule's "no `<code>` prefix on related lines" intact.

**Cons.** A consumer that wanted the callee codes (e.g. an LSP aggregator that wants to surface "callee has 3 errors of code X") has to read the callee's own separately-emitted diagnostics and correlate by file path — a second pass.

**Risks.** Low. The only audit risk is making sure every reference to "codes via `related`" in the corpus is swept in the same edit — currently `code-registry-load.md` row plus `invocation.md` line 22.

### Option B — Extend `related` with an optional `code` and update the renderer

**Approach.** Add `code?: string` to the `Diagnostic.related` element shape, restrict its meaning to the `callee-has-errors` row (and any future row that opts in), and extend the *Serialised content format* paragraph to render related lines with a `<code>: ` prefix when the field is populated.

**Spec edits.**
- `diagnostic-shape.md` envelope block: change `related?: array<{ file, range, message }>` to `related?: array<{ file, range, message, code? }>`.
- `diagnostic-shape.md` *Serialised content format* paragraph: state that when `related[i].code` is populated, the line renders as `"  <file>:<line>:<col>: <code>: <message>"`; when absent, the existing `"  <file>:<line>:<col>: <message>"` shape applies. Decide and pin a single rendering — do not leave it implementation-defined.
- `code-registry-load.md` row: keep the "carries codes via `related`" wording but tighten it to "populates `related[i].code` with the callee's own diagnostic code."
- `invocation.md`: leave the wording in place but link to the now-extended shape.
- Audit every other row that emits `related` (name-collision, cycle-detection, etc.) and decide whether `code` is `undefined` there (the safe default) or whether they also want to surface it.

**Pros.** The information the row promises actually reaches the consumer in structured form, addressable from `details.diagnostics[i].related[j].code` without re-parsing the callee.

**Cons.** Touches the central diagnostic envelope — a wider-blast-radius change. Existing tests that assert `Object.keys(related[i])` is exactly `["file", "range", "message"]` break. Renderers in third-party LSP/CI integrations that already format `related` lines per the current rule need updating. The optional-`code` rendering branch adds a second format the *Message*-column byte-exactness pin (DIAG-4) now has to cover.

**Risks.** Medium. The change must be uniform: failing to update the rendering rule alongside the shape would re-introduce the original contradiction in mirror form.

### Recommendation

**Option A.** The `callee-has-errors` row is the only registry row currently asserting "codes via `related`," and the cheaper edit aligns with the existing closed shape that every other consumer (name-collision, cycle, declaration-here) already relies on. If a future LSP integration shows a real need for structured callee-code surfacing, Option B can be revisited as a separate spec change with its own audit of every `related`-emitting row. Edge case to watch when applying Option A: the row's *Message* column (`callee '<path>' has errors; see related diagnostics`) is fine as-is, but the surrounding prose in `invocation.md` line 22 must be swept in the same commit, or the contradiction simply relocates.

## Relationships

- T026 "`loom/parse/type-alias-cycle` cycle-chain rendering is unspecified" - same-cluster (sibling diagnostics-rendering ambiguity; both expose under-specification in the related-line / message-template rendering surface)
- T100 "`Diagnostic` envelope contract is unsatisfiable for location-less codes" - same-cluster (same envelope, different field; resolving both touches `diagnostic-shape.md`)

---

# T100 - `Diagnostic` envelope contract is unsatisfiable for location-less codes

**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The internal `Diagnostic` shape in `diagnostic-shape.md` pins `file: string` and `range: { start, end }` as required fields, and the **Serialised content format** rule mandates the line template `"<file>:<line>:<col>: <code>: <message>"` for every persistent diagnostic. Eight registered codes have no source location at emission time and their registry rows describe no file or range: `loom/load/host-incompatible`, `loom/load/extension-bootstrap-failed`, `loom/load/discovery-slow`, `loom/load/package-read-timeout`, and the four `loom/host/session-shutdown-*` teardown codes. The wire shape and the serialised `content` string are undefined for these codes, so one implementer fabricates a sentinel `file`/zero `range` while another omits the fields and ships a `Diagnostic` that fails strict envelope validation. Consumers entitled by DIAG-4 (`#diag-4`) to assert on the rendered message cannot derive an expected string for any of the eight.

## Solution approach

In `diagnostic-shape.md`, mark `file` and `range` optional on the `Diagnostic` shape block and pin the omitted-fields wire form as the contract for diagnostics whose emission site carries no source location. Enumerate the closed set of eight location-less codes (`loom/load/host-incompatible`, `loom/load/extension-bootstrap-failed`, `loom/load/discovery-slow`, `loom/load/package-read-timeout`, and the four `loom/host/session-shutdown-*` codes), mirroring the `details.event.*` future-addition obligation already on the page. Add a carve-out to the **Serialised content format** paragraph dropping the `<file>:<line>:<col>:` prefix when `file`/`range` are omitted, and state that renderers MUST NOT synthesise a sentinel `file` or zero-valued `range`.

## Solution constraints

- The `related?` element shape stays `{ file, range, message }` — do not propagate `file`/`range` optionality into `related` entries, which always describe located sites.
- Out of scope: the DIAG-4 *Message* rows for the eight codes in `code-registry-load.md` and `code-registry-host.md`.

## Relationships

- T026 "`loom/parse/type-alias-cycle` cycle-chain rendering is unspecified" - same-cluster (rendering gap in the same diagnostics surface)
- T027 "`<key>` rendering for `loom/load/settings-value-out-of-range` is undetermined" - same-cluster (rendering gap in the same diagnostics surface)
# T101 - Renderer-throw during Pi's render invocation has no defined failure mode

**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

PIC's *System notes* fallback chain in `runtime-event-channel.md` is scoped to synchronous throws from the `pi.sendMessage` call site only. The symmetric failure — Pi later invokes the loom-registered `MessageRenderer` to format a queued `loom-system-note` and the renderer body throws during render — has no defined behaviour: neither the *Renderer registration (`pi.registerMessageRenderer`)* block in `extension-bootstrap-and-per-loom.md` nor the *System notes* prose addresses it. Pi exposes no callback by which the loom runtime can observe a render-time renderer throw, so no `loom/runtime/*` diagnostic can surface it. A defensive renderer (wrapping its body in `try`/`catch`) and a naive renderer (letting exceptions propagate) both conform yet diverge on whether a buggy render path corrupts the transcript and whether subsequent `loom-system-note` deliveries survive.

## Solution approach

Add an *Exception safety* clause to the *Renderer registration* block (`id="renderer-registration"`) in `extension-bootstrap-and-per-loom.md`, after the `Component`-return paragraph, pinning the renderer body as exception-safe by construction: it MUST NOT throw out of the `MessageRenderer` invocation and on internal failure MUST return a minimal `Component` rendering the raw `message.content` when `display === true`, or `undefined` when `display === false`. Add a sentence to the *System notes* best-effort paragraph in `runtime-event-channel.md` scoping that fallback chain to `pi.sendMessage` throws only and forward-linking renderer-body throws to the new clause.

## Solution constraints

- The renderer-throw contract is loom-internal: do not introduce a new `loom/runtime/*` diagnostic code, operator signal, or telemetry for a caught render-time failure (Pi exposes no observation callback for it).

## Relationships

- T036 "`registerMessageRenderer` is unordered in the registration sequence; `registerFlag` options parameter is unpinned" - same-cluster (both touch the *Renderer registration* block in `extension-bootstrap-and-per-loom.md` but resolve independently).
# T102 - `bind_context` project-wide-inheritance parenthetical references a settings carrier that does not exist

**Original heading:** Project-wide `bind_context` inheritance is presupposed but no settings key is enumerated
**Original section:** docs/spec_topics/binder/ + future-considerations/ + pi-integration index
**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`docs/spec_topics/binder/binder-bypass-and-envelope.md` §"Binder bypass" item 1 (no-params bypass) says of a no-params loom: "`bind_context` and `bind_model` are silently ignored (they may be inherited from project-wide settings)." The parenthetical asserts a project-wide-inheritance escape hatch for both fields jointly.

Only `bind_model` actually has one. `docs/spec_topics/discovery/package-and-settings.md` §"Settings file reads" enumerates the complete recognised `looms.*` scalar set as exactly four keys — `binderModel`, `scanPackages`, `scanPackagesMaxFiles`, `scanPackagesTimeoutMs` — and explicitly states "No other `looms.*` keys are recognised in loom 1.0; unknown keys under the `looms` namespace are ignored without diagnostic." There is no `looms.bindContext` key, no read path, no validation row, no `settings-value-out-of-range` enumeration entry, and no `binder-context-unresolved` diagnostic mirroring the `binder-model-unresolved` chain. The `bind_context` row in `frontmatter/frontmatter-fields-a.md` confirms this independently: its "Default if omitted" cell is the literal value `none`, not a settings fallback.

The parenthetical therefore mis-states the resolution chain for `bind_context`. A reader of the bypass page may look for the missing settings key, or — worse — an implementer may invent `looms.bindContext` to satisfy the parenthetical, manufacturing a settings surface the rest of the spec rejects.

## Spec Documents

- `docs/spec_topics/binder/binder-bypass-and-envelope.md` — Binder bypass item 1 (edited)
- `docs/spec_topics/discovery/package-and-settings.md` — Settings file reads / Keys read / Scalar-key validation (option-dependent)
- `docs/spec_topics/frontmatter/frontmatter-fields-a.md` — `bind_context` default row, Binder-model root-word convention (option-dependent)
- `docs/spec_topics/binder/binder-model-and-context.md` — Binder context (read-only)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/binder-model-unresolved`, `settings-value-out-of-range` (option-dependent)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan contains no leaves yet — `plan.md` lists "_(No leaves yet — author per the template.)_" under every phase, and `plan_topics/` contains only `conventions.md`, `coverage-matrix.md`, `leaf-template.md`.)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one implements `bind_context` as frontmatter-only with default `none` (consistent with `frontmatter-fields-a.md` and the closed `looms.*` enumeration); the other reads `binder-bypass-and-envelope.md` literally and adds a `looms.bindContext` settings key, a validation row, and an inheritance chain — manufacturing a settings surface the closed-enumeration rule forbids. The wrong implementation also corrupts the `Scalar-key validation` table and the unknown-`looms.*`-keys-ignored guarantee.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Narrow the parenthetical to `bind_model` only

**Approach.** Treat the parenthetical as a documentation defect: `bind_context` has no project-wide-settings carrier in loom 1.0 (its default is the literal `none`, applied at frontmatter parse time), so the parenthetical should mention only `bind_model`.

**Spec edits.**
- `binder-bypass-and-envelope.md` §"Binder bypass" item 1: change "`bind_context` and `bind_model` are silently ignored (they may be inherited from project-wide settings)" to "`bind_context` and `bind_model` are silently ignored (`bind_model` may be inherited from the project-wide `looms.binderModel` setting; `bind_context` has no project-wide carrier and defaults to `none`)."
- Optionally cross-link the `bind_model` clause to `discovery/package-and-settings.md#settings-file-reads` and the `bind_context` clause to the `bind_context` row in `frontmatter/frontmatter-fields-a.md`.

**Pros.** One-paragraph edit. Consistent with the existing closed `looms.*` enumeration, the `bind_context` default row, and the `unknown looms.* keys are ignored` rule. No new diagnostic code, no new validation row, no widening of the settings surface. Zero downstream impact on the diagnostics registry, hot-reload note, or `settings-value-out-of-range` enumeration.

**Cons.** Authors who *wanted* operator-level `bind_context` control get nothing; the asymmetry with `bind_model` remains (justifiable on grounds that `bind_context` is a behaviour-shape choice belonging to the loom author, not a deployment knob).

**Risks.** None material.

### Option B — Add a `looms.bindContext` settings key

**Approach.** Make the parenthetical accurate by introducing a fifth `looms.*` key carrying the project-wide `bind_context` default.

**Spec edits.**
- `discovery/package-and-settings.md`: add `looms.bindContext` to the "Keys read" list (allowed values `none` | `session`, default `none`), add a row to "Scalar-key validation" (must be the JSON string literal `none` or `session`), and add it to the `settings-value-out-of-range` parenthetical key set.
- `frontmatter/frontmatter-fields-a.md`: rewrite the `bind_context` "Default if omitted" cell from `none` to "`looms.bindContext` setting, defaulting to `none` when the setting is absent" (mirroring the `bind_model` → `looms.binderModel` row).
- `binder/binder-model-and-context.md` §"Binder context": pin the two-step resolution chain (`bind_context:` frontmatter, then `looms.bindContext`, then literal `none`), mirroring the §"Binder model" prose.
- `diagnostics/code-registry-load.md`: extend the `settings-value-out-of-range` row's key-list to include `bindContext` with its allowed-value rule.
- `pi-integration-contract/host-prerequisites.md` "Settings write-back key preservation" already covers loom-owned keys generically; verify it does not need to enumerate the new key.
- The `bind-context-session-on-subagent` parse-warning rule already references the frontmatter slot; verify it still fires correctly when the value arrives from settings rather than frontmatter (and, if not, define how settings-sourced `session` interacts with subagent-mode looms).

**Pros.** Makes the parenthetical accurate without retreating from operator-level control. Symmetrical with `bind_model`/`looms.binderModel`.

**Cons.** Wide-surface edit touching five files; introduces a settings key whose author demand is unestablished; the `bind-context-session-on-subagent` parse-warning rule may need a runtime-time companion to handle the settings-sourced case (raising the spec surface further).

**Risks.** Forward-compatibility with the `future-considerations/surface-extensions.md` pattern (e.g. `looms.toolLoopMaxRounds`) suggests operator-level overrides are a deferred surface; adopting one ad-hoc here pre-empts that pattern without a design review.

### Recommendation

**Option A.** The parenthetical is the only place in the corpus claiming `bind_context` inherits from settings; every other surface (the closed `looms.*` enumeration, the `bind_context` frontmatter default, the diagnostics registry, the hot-reload recovery note) is consistent with frontmatter-only resolution. Option A aligns the outlier with the rest of the spec at the cost of one sentence; Option B widens the settings surface to satisfy a single parenthetical with no author demand on record. Edge case the implementer must watch: the rewritten parenthetical should explicitly state "no project-wide carrier" for `bind_context` (not just omit it) so a future reader does not re-introduce the same gap by re-adding `bind_context` to a generic "inherited from settings" clause.

## Relationships

- T032 "Single-string-bypass disposition of `bind_model:` and `bind_context:` is unspecified" - same-cluster ((both findings touch the bypass-page treatment of `bind_context` / `bind_model` but resolve independently; this finding fixes the no-params parenthetical, the other fixes the single-string-bypass silence).)
- T027 "`<key>` rendering for `loom/load/settings-value-out-of-range` is undetermined" - decision-overlap (under Option B only (adding `looms.bindContext` enlarges the key-form question's scope); independent under Option A.)

---

# T103 - Turn-grouping undefined when `SessionContext.messages` begins with non-`user` messages

**Original heading:** Turn-grouping undefined for messages preceding the first `user` message
**Original section:** docs/spec_topics/binder/ + future-considerations/ + pi-integration index
**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

The compact-transcript walk in `binder-model-and-context.md` defines a turn intensionally: *"a turn is a user message plus all subsequent assistant / toolResult / custom messages up to (but not including) the next user message."* Both the truncation walk and BNDR-7's rendering operate on those turns. The walk's only stated presupposition on the input array — pinned at `host-interfaces-core.md` under the chronological-ordering paragraph — is that `buildSessionContext(...).messages` is ordered oldest-to-newest. Nothing pins that the first element is a `user` message.

If the array ever begins with a run of non-`user` messages (an `assistant` or `toolResult` left over from a prior interrupted turn, a `custom:loom-system-note` emitted before the first user input, or any other arrangement Pi's `SessionManager` may produce), the turn-grouping rule does not cover them: they belong to no turn under the intensional definition. Three plausible behaviours diverge — silently drop the leading non-`user` messages, render them as a partial leading "turn" with no `[user]` head line, or treat the situation as a runtime error — and the spec selects none of them. BNDR-7 pins transcript bytes as MUST-reproduce-exactly, so two conforming implementations cannot both be right.

## Spec Documents

- `docs/spec_topics/binder/binder-model-and-context.md` — *Session-context truncation (`bind_context: session`)* and *Compact-transcript format (normative)* (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — *`SessionContext` and the `.messages` element shape* / chronological-ordering presupposition (option-dependent)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The plan file exists but currently carries no leaves; there is nothing to flag as modified or blocked.)

## Consequence

**Severity:** correctness

The compact transcript is MUST-reproduce-exactly per BNDR-7, and the input-reproducibility contract feeds determinism on the binder call. Independent conformant implementations will disagree on the leading-non-`user`-prefix case — one drops the prefix, another renders it under an invented role tag, a third throws — producing divergent binder prompts and divergent sampled outputs even at `temperature: 0`. The fixture suite cannot be authored until the disposition is fixed.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Pin a Pi-side guarantee that `messages` always begins with a `user` message

**Approach.** Extend the chronological-ordering paragraph at `host-interfaces-core.md#messages-chronological-order-presupposition` to add a second presupposition: at both delivering surfaces (`SessionContext.messages` and `agent_end.messages`), the array is non-empty iff the first element is a `UserMessage`. Add a matching item to the *Editorial-review checklist for unpinned host presuppositions* under `version-bump-step2.md` so each Pi minor bump re-audits the guarantee. Add a sentence to the compact-transcript walk that names the precondition by reference, so the binder spec stays self-contained.

**Spec edits.**
- `host-interfaces-core.md`: add the new presupposition clause and a sub-anchor for inbound citation.
- `version-bump-step2.md`: add a checklist item parallel to (h).
- `binder-model-and-context.md` (*Session-context truncation* and *Compact-transcript format*): one-sentence forward reference to the new presupposition.

**Pros.** Keeps the turn-grouping rule simple — no special case in the walk or the renderer. Aligns with how chronological ordering is already pinned (behavioural presupposition, re-audited per bump).

**Cons.** Loads a stronger behavioural commitment onto Pi than the SDK type encodes; any Pi minor that ever emits a `custom`-led or `assistant`-led history (e.g. a future "session resumed from snapshot" feature that prepends a `loom-system-note`) breaks the presupposition and requires loom to react before that minor lands.

**Risks.** The presupposition cannot be detected from the `AgentMessage[]` type surface, so a regression is only caught by the editorial-review checklist or in production.

### Option B — Define rendering for leading non-`user` messages explicitly

**Approach.** Treat any leading run of non-`user` messages as a synthetic "pre-turn" block: render each message under its role tag using the existing per-variant body rules (item 4 of *Compact-transcript format*), separate the block from the first true turn with the same single blank line that separates turns, and feed the block to the truncation walk as if it were a single turn (its token estimate is the sum of its messages; it is included/excluded whole under the same ≤ 8000 / ≤ 20 bound). Add a BNDR-7e reference rendering covering the case (e.g. a leading `[custom:loom-system-note]` followed by the first `[user]` turn).

**Spec edits.**
- `binder-model-and-context.md` *Session-context truncation*: add one sentence pinning that a leading non-`user` prefix is treated as a single synthetic turn for the budget walk.
- `binder-model-and-context.md` *Compact-transcript format* item 2: extend the turn-delimiter rule to cover the synthetic leading block (or coin a new item 2′ for it).
- `binder-model-and-context.md` BNDR-7 block: append `bndr-7e` (Leading non-`user` prefix edge case) per the page-local sub-letter scheme; do not renumber existing letters.

**Pros.** Loom owns the disposition; no new Pi-side presupposition. Robust against any future Pi behaviour that prepends non-`user` history.

**Cons.** Larger spec edit (rule plus new reference rendering plus turn-definition wording). Introduces a "turn" that does not match the intensional definition, requiring a small special case in the truncation walk.

**Risks.** The synthetic-prefix turn could swallow large amounts of token budget — pin whether it gets the same eviction treatment as a normal turn (it does, under this option, but the rule must be stated to forestall divergence).

### Recommendation

Adopt **Option A**. The chronological-ordering presupposition already establishes the precedent of pinning behavioural preconditions to Pi and routing re-audit through the bump-procedure checklist; a "non-empty `messages` begins with `UserMessage`" guarantee is a small additive clause on the same paragraph and on the same checklist item. The walk and the renderer stay unchanged, and the existing BNDR-7a–BNDR-7d renderings remain authoritative without renumbering. The edge case Option B targets is precisely what the editorial-review checklist exists to catch — promote it to Option B only if a Pi minor surfaces the case.

Edge case to watch: empty `messages` (zero-length array). The presupposition above is stated as biconditional ("non-empty iff … first element is `UserMessage`"), so the empty case is admitted; spec the empty array as producing no `Recent session context` block (no transcript bytes, no leading blank line), consistent with the *Single oversized turn at the front* worked example's "binder runs with no session-context block" disposition.

## Relationships

- T106 "Compact-transcript assistant interleaving and `<args-json>` key order not pinned for byte-exact reproduction" - same-cluster (both attack BNDR-7 byte-exactness gaps; resolve independently)
- T034 "Compact-transcript: BNDR-7 reference set omits oracles for several normative Rule-4 cases" - same-cluster (both extend BNDR-7's reference-rendering coverage; if Option B above is adopted, the BNDR-7e rendering it adds should be authored alongside the renderings this finding requests)
- T104 "BNDR-7's "next blank line of the surrounding system prompt" presupposes framing the eight system-prompt blocks neither pin" - same-cluster (both expose unpinned structural preconditions on which BNDR-7's byte-exactness rests; resolve independently)

---

# T104 - BNDR-7's "next blank line of the surrounding system prompt" presupposes framing the eight system-prompt blocks neither pin

**Original heading:** Eight system-prompt block order not pinned, yet BNDR-7's transcript-end boundary depends on a trailing blank line
**Original section:** docs/spec_topics/binder/ + future-considerations/ + pi-integration index
**Kind:** implementability, clarity
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`binder-bypass-and-envelope.md`'s *System-prompt structure (normative)* enumerates eight obligations (Loom identity, Description, Argument hint, Parameters block, User arguments, Session-context block, Envelope-kinds enumeration, No-invent-defaults instruction) but says nothing about the order in which they appear, the inter-block separators, or whether the Session-context block is followed by any further content. Item 6 itself only requires "a delimited block whose opening line begins with the literal token `Recent session context`" — the delimiter is never named.

`binder-model-and-context.md`'s BNDR-7 umbrella (the four reference renderings) then defines the body each rendering reproduces as "the bytes that follow the `Recent session context …:` opening line of the *Session-context block* up to (but not including) the next blank line of the surrounding system prompt." That boundary is the only definition of where each BNDR-7 rendering ends. It assumes (a) the body is single-blank-line-terminated, and (b) at least one further block follows in the surrounding prompt so that "the next blank line" exists. Neither assumption is established by item 6 or by an item-ordering rule: a conforming renderer that places the Session-context block last in the prompt — or that uses a non-blank-line delimiter for it — leaves the BNDR-7 reference renderings without an end-of-body boundary and the byte-exact reproducibility contract underdetermined.

Two reasonable implementers will therefore diverge on the exact trailing bytes of the Session-context block (one `\n`? two? same as turn delimiter? prompt-end? a separator the implementer chose for item 6?), each citing the spec for their answer.

## Spec Documents

- `docs/spec_topics/binder/binder-bypass-and-envelope.md` — *System-prompt structure (normative)*, item 6 (edited)
- `docs/spec_topics/binder/binder-model-and-context.md` — BNDR-7 umbrella sentence preceding BNDR-7a..d (option-dependent)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`plan.md` and `plan_topics/` carry no authored leaves yet; the coverage matrix is empty.)

## Consequence

**Severity:** correctness

The Session-context block participates in a byte-exact reproduction contract (BNDR-7 reference renderings are MUST-reproduce-exactly, and the binder prompt feeds a deterministic-seed pipeline). Without a pinned block order or a self-contained boundary for BNDR-7, two conforming implementations can render the same session into different trailing bytes — breaking input reproducibility for any prompt where the Session-context block is last, and silently divergent for prompts where it is not.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Pin block framing in item 6

**Approach.** Strengthen item 6 to specify the Session-context block's exact byte framing: the opening line `Recent session context …:` followed by a single `\n`, then the BNDR-7-defined body, then a terminating `\n` followed by a blank line (`\n`). State that this framing holds regardless of the block's position in the surrounding prompt (i.e. the terminating blank line is part of the block, not borrowed from a sibling). Keep BNDR-7's umbrella sentence as-is — the framing now exists by construction.

**Spec edits.**
- `binder-bypass-and-envelope.md` item 6: replace "a delimited block whose opening line begins with the literal token `Recent session context`" with an explicit byte specification — opening line, body, trailing `\n\n` framing — and call out that the framing is mandatory whether or not another block follows.
- `binder-model-and-context.md` BNDR-7 umbrella: optionally tighten "the next blank line of the surrounding system prompt" to "the blank line that terminates the *Session-context block* per *System-prompt structure (normative)* item 6" so the cross-page dependence is named.

**Pros.**
- Resolves the underlying ambiguity at its source (item 6 was the place the delimiter was elided).
- Makes the Session-context block self-contained regardless of position, so the eight blocks remain order-free.
- BNDR-7 keeps its current wording.

**Cons.**
- Item 6 grows from one sentence to several lines of byte-level specification.

**Risks.**
- Must be careful not to import the Compact-transcript turn-delimiter discipline (rule 2: one blank line between turns) and re-emit it as framing — they are different bytes serving different purposes.

### Option B — Restate BNDR-7's boundary self-containedly

**Approach.** Rewrite BNDR-7's umbrella sentence so its body boundary is intrinsic to the rendering — e.g. "the bytes from the byte immediately following the `\n` of the opening line up to and including the trailing `\n` of the last turn block (per *Compact-transcript format* rule 2, the rendering ends at the trailing `\n` of the final turn; no extra blank line is part of BNDR-7's body)." The "surrounding system prompt" reference disappears; item 6 stays minimal.

**Spec edits.**
- `binder-model-and-context.md` BNDR-7 umbrella: replace the "up to (but not including) the next blank line of the surrounding system prompt" clause with a self-contained terminator anchored on Compact-transcript rule 2.
- `binder-bypass-and-envelope.md` item 6: no change (or one cross-reference to the new BNDR-7 wording).

**Pros.**
- Smallest edit; touches the umbrella sentence only.
- Removes a cross-page coupling (the body boundary no longer depends on what surrounds the block in the prompt).

**Cons.**
- The "delimited block" phrase in item 6 stays without a named delimiter — a renderer is still free to wrap the block in any framing it likes, so two implementations may produce identical BNDR-7 bodies but different surrounding bytes. The current finding is closed, but the sibling clarity finding on "delimited block" remains live.
- Implementers who hit the prompt-tail case must derive end-of-body from a Compact-transcript rule rather than from the prompt structure they are physically assembling.

**Risks.**
- The new boundary must precisely capture Compact-transcript rule 2's "exactly one blank line between turn blocks" without accidentally including or excluding the final turn's trailing `\n`.

### Recommendation

**Option A.** The underlying defect is that item 6 promised a "delimited block" without naming the delimiter; pinning the framing there fixes both the BNDR-7 boundary problem and the sibling "delimited block delimiter undefined" clarity finding in one edit. Option B leaves item 6's delimiter elision unresolved.

Edge cases the implementer must watch:
- The framing's trailing `\n\n` is the block's own bytes, not a separator shared with the next block — applies equally when the Session-context block is first, middle, or last in the prompt.
- The opening-line `:` followed by ` ` (or `\n`) wording in BNDR-7 ("`Recent session context …:` opening line") must agree with whatever opening-line shape item 6 pins.
- The framing is distinct from the inter-turn blank line inside the body (Compact-transcript rule 2); the spec edit must not conflate them.

## Relationships

- T034 "Compact-transcript: BNDR-7 reference set omits oracles for several normative Rule-4 cases" - same-cluster ((also concerns BNDR-7 byte-exact conformance; resolves independently of block-order/boundary).)
- T106 "Compact-transcript assistant interleaving and `<args-json>` key order not pinned for byte-exact reproduction" - same-cluster ((another BNDR-7 byte-exactness gap inside the body; orthogonal to the body's end-boundary).)

---

# T105 - BNDR-5 mandates shortest-round-tripping fixed-point digits without a derivation recipe

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

BNDR-5 (`#bndr-5` in `defaulting-system-note-echo.md`) requires a `number` to render as the shortest round-tripping decimal that reparses to the same IEEE-754 double, while forbidding scientific notation at every magnitude — closing both ends of the JS `String(n)` switch (±1e21 and `|value| < 1e-7`). The two off-the-shelf host primitives each satisfy only one half of that composite obligation: `String(n)` produces the shortest digit string but emits exponential form at exactly the magnitudes BNDR-5 outlaws, and `toFixed` produces fixed-point but not shortest. No spec text names an algorithm, primitive, or step-wise recipe yielding both properties at once, so the BNDR-6r / BNDR-6s reference renderings (`#bndr-6r`, `#bndr-6s`) are the only oracle. Two conforming implementers can diverge — one shipping `1e+21`, another a non-shortest `toFixed` form — until each independently rediscovers the same expand-the-exponent derivation.

## Solution approach

Add a non-normative derivation note — either appended to BNDR-5 in `defaulting-system-note-echo.md` or in a new `Number rendering` subsection of `implementation-notes.md` cross-linked from `#bndr-5` — describing how to obtain a shortest fixed-point string: start from `String(n)`'s shortest round-tripping digits, detect any exponential form, and re-expand the mantissa around the decimal point by the signed exponent into pure fixed-point, then apply the BNDR-5 fractional-digit and `-0 → 0` rules. Keep the note non-normative so the observable byte output remains the contract, and reference BNDR-6r and BNDR-6s as the worked oracle cases.

## Solution constraints

- None.

## Relationships

- T104 "BNDR-7's "next blank line of the surrounding system prompt" presupposes framing the eight system-prompt blocks neither pin" - same-cluster (separate BNDR rule, independent fix)
- T034 "Compact-transcript: BNDR-7 reference set omits oracles for several normative Rule-4 cases" - same-cluster (parallel testability gap in the BNDR rendering surface)
# T106 - Compact-transcript assistant interleaving and `<args-json>` key order not pinned for byte-exact reproduction

**Original heading:** Compact-transcript assistant interleaving and `<args-json>` key ordering not pinned for byte-exact reproduction
**Original section:** docs/spec_topics/binder/ + future-considerations/ + pi-integration index
**Kind:** implementability, prescription
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`binder-model-and-context.md` *Compact-transcript format (normative)* rule 4 pins the BNDR-7 reference renderings as MUST-reproduce-exactly because the binder's input-reproducibility contract depends on byte-stable transcript bytes. Two independent byte-determining aspects of rule 4's `assistant` body are nevertheless left unstated, so two conforming implementations can produce different bytes for the same input.

**Aspect 1 — assistant body interleaving.** Rule 4's `assistant` clause says the merged text is "the concatenation of every `TextContent.text` in `AssistantMessage.content` array order" and that each `ToolCall` renders as a sibling line "in `content` array order," but never states whether the merged `[assistant]: …` text line is emitted *before* the tool-call sibling lines or interleaved at each block's position in the array. The companion sentence for the all-tool-call case ("…still emit the `[assistant]: ` prefix line … followed by the `[tool-call …]` lines") and BNDR-7b's example (which has only one `TextContent` followed by one `ToolCall`) imply text-first, tool-calls-after, but neither is a normative pin for the mixed case where tool-call blocks appear at non-final positions in `content`.

**Aspect 2 — `<args-json>` key ordering.** Rule 4 defines `<args-json>` as `JSON.stringify(arguments)`. `JSON.stringify` walks own enumerable string-keyed properties in property-insertion order, so for any `ToolCall.arguments` with more than one key the emitted bytes depend on the SDK's property-insertion order in the value it hands back — an implementation detail with no contract. Two SDK versions, two transports, or two re-buildings of an `arguments` object via spread/`Object.assign` can yield different key orders for identical logical inputs, and the transcript bytes change accordingly. BNDR-7b dodges this by using a single-key example (`{"city":"Paris"}`), so the reference renderings do not pin a multi-key ordering either.

Both aspects are observable through the MUST-reproduce-exactly contract, and either left as-is yields divergent bytes between conforming implementations on inputs that the BNDR-7 reference renderings happen not to cover.

## Spec Documents

- `docs/spec_topics/binder/binder-model-and-context.md` — *Compact-transcript format (normative)* rule 4 (`assistant` body) (edited)
- `docs/spec_topics/binder/binder-model-and-context.md` — BNDR-7 reference renderings (edited; a new BNDR-7e covering multi-key `args-json` and mixed text/tool-call interleaving is the natural oracle site)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — `SessionContext` `AssistantMessage.content` / `ToolCall` shape (read-only; consulted to confirm `content` can interleave `TextContent`/`ToolCall`/`ThinkingContent` in any order and that `arguments` is typed as a plain JSON object with no key-order contract)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan is scaffolded but carries no leaves yet — `docs/plan.md` lists "_(No leaves yet — author per the template.)_" for every phase section, and no plan-topic page references binder or BNDR-7.)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on the rendered bytes for any assistant message that mixes text and tool-calls at non-trivial array positions, and for any tool-call whose `arguments` object has more than one key. Because the surrounding section explicitly grounds binder input-reproducibility (and any prompt-cache keyed on it) on byte-stable transcript output, divergence here breaks the contract the section was written to enforce and silently shifts the bytes the upstream model sees.

## Solution Space

**Shape:** multiple
**State:** shaped

The two obligations are independent edits to the same rule-4 clause. Per the bimodal-obligation discipline they are split into separate options so they can be resolved sequentially; either can land first, but the `<args-json>` pin (Option A) is the smaller scope-bounding edit and should land first so Option B's added BNDR-7e rendering can use the now-pinned multi-key ordering in its example bytes.

### Option A — Pin `<args-json>` key ordering

- **Approach.** State that `<args-json>` is the JSON serialisation of `ToolCall.arguments` with object keys emitted in lexicographic (Unicode code-point) order at every nesting level, no whitespace, with the standard `JSON.stringify` escape rules for string values. Name the canonicalisation requirement explicitly so it does not read as a property of `JSON.stringify`.
- **Spec edits.** Replace "`<args-json>` is `JSON.stringify(arguments)` (the SDK field is `arguments`, not `args`) with no whitespace" with a sentence pinning lexicographic key order at every object nesting level (e.g. "`<args-json>` is the JSON serialisation of `ToolCall.arguments` produced with no whitespace and with object keys emitted in ascending Unicode code-point order at every nesting level; array order is preserved verbatim. `JSON.stringify` is not key-order-stable across SDK property-insertion orders, so a key-sorting canonicalisation step is required."). Cross-link to the cruft-pass precondition that `ToolCall.arguments` is JSON-domain.
- **Pros.** Removes a silent SDK-property-insertion-order dependency; the lexicographic pin is the standard canonical-JSON answer and has well-known reference implementations; small edit; trivially testable.
- **Cons.** Implementers cannot reach for the bare `JSON.stringify` one-liner — they must sort keys recursively. Lexicographic order differs from author-declared order, which may be surprising in debug output.
- **Risks.** None substantial; canonical-JSON key sorting is a well-trodden path.

### Option B — Pin assistant text-then-tool-calls interleaving

- **Approach.** State that the merged `[assistant]: <text>` line is emitted first (with the rule-4 text-concatenation rule unchanged), followed by every `[tool-call …]` sibling line in `content` array order, regardless of where `TextContent` and `ToolCall` blocks appear relative to each other in `content`. This aligns the mixed case with the already-pinned tool-call-only case and with BNDR-7b's implicit ordering.
- **Spec edits.** In rule 4's `assistant` clause, add an explicit ordering sentence: "The merged `[assistant]: <text>` line MUST be emitted first, followed by `[tool-call …]` sibling lines in `content` array order; the position of `ToolCall` blocks relative to `TextContent` blocks within `content` does not affect line order." Add a new BNDR-7e reference rendering covering an assistant message with `content` `[ToolCall A, TextContent t, ToolCall B]` so the text-first, tool-calls-in-array-order pin is exercised on a non-trivial layout; if Option A has landed, give the tool-calls multi-key arguments so the rendering also exercises the lexicographic-key pin.
- **Pros.** Removes the only remaining body-ordering ambiguity in rule 4; reuses the same ordering already mandated for the all-tool-call case; small edit; the new BNDR-7e doubles as the oracle for Option A.
- **Cons.** Loses positional information from the underlying `content` array (an assistant message that semantically meant "tool-call, then narrate, then tool-call" flattens to text-first). This is consistent with the existing concatenation rule for text, which already discards interleaving across `TextContent` blocks.
- **Risks.** None substantial; the alternative (true positional interleaving) would force a position-aware role-tag scheme and contradict the existing text-concatenation rule.

### Recommendation

Adopt both. Land Option A first (smaller, scope-bounding, with no dependency on the rendering pin), then Option B (which can cite the now-pinned multi-key ordering in its new BNDR-7e example bytes). Edge cases an implementer must watch:

- Option A's canonicalisation is recursive — nested objects inside `arguments` must also be sorted, and arrays preserve order.
- Option A presupposes `ToolCall.arguments` is JSON-domain (no `BigInt`, no circular references); this is the same precondition the cruft-pass finding "Binder hidden assumptions / cruft: transcript `JSON.stringify(arguments)` totality" flags, and the canonicalisation step inherits its throw behaviour.
- Option B's "text-first" rule applies only to the assistant variant; the `custom` array variant in rule 4 retains its own array-order concatenation contract.
- BNDR-7e (when added) becomes a new page-local sub-letter anchor per the GOV-23 sub-obligation scheme already used for BNDR-7a–BNDR-7d; do not renumber the existing sub-letters.

## Relationships

- T103 "Turn-grouping undefined when `SessionContext.messages` begins with non-`user` messages" - same-cluster (another byte-exact gap in the same compact-transcript walk, resolved independently)
- T104 "BNDR-7's "next blank line of the surrounding system prompt" presupposes framing the eight system-prompt blocks neither pin" - same-cluster (another BNDR-7 reproducibility precondition, resolved independently on a different page)
- T034 "Compact-transcript: BNDR-7 reference set omits oracles for several normative Rule-4 cases" - co-resolve (the new BNDR-7e proposed in Option B is one of the missing renderings this finding requests; landing Option B narrows that finding's scope)

---

# T107 - Hot-reload recovery note over-promises `/reload` success without a failed-re-reload contract

**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The `binder-model-hot-reload` paragraph in `binder/binder-model-and-context.md` emits a `loom-system-note` whose `content` template tells the operator that `<N>` previously-failed loom(s) "can now load," but `recovery.looms` membership is defined only as "the looms whose re-resolution under the changed setting would now succeed" — i.e. by re-running binder-model resolution alone. A loom whose original failure was `loom/load/binder-model-unresolved` can still fail its next `/reload` for an independent reason (a stale `.loom` parse error, a broken `.warp` import, a schema-lowering failure, or any other `loom/load/*` surface), and the spec pins neither the precise membership predicate nor a disposition for the "listed but still fails" path. Two implementers diverge: one computes membership from a cheap binder-model probe, another re-runs the full per-loom load pass to keep the promise honest, and the operator sees a different `<names>` list under each.

## Solution approach

Clarify the `recovery.looms` membership predicate on the `binder-model-hot-reload` paragraph to key membership on the prior `loom/load/binder-model-unresolved` failure plus binder-model re-resolution alone, with no other load-pass step re-run to compute it. Rewrite the user-facing `<names>` framing so its literal text matches the narrower binder-model-resolution predicate rather than promising full load success ("can now load"). State the disposition for a listed loom whose `/reload` still fails: it surfaces through its own `loom/load/*` diagnostic on the normal Diagnostics channel, and the recovery note carries no further obligation.

## Solution constraints

- The reworded `<names>` framing MUST preserve the template's fixed-substitution rule — only `<N>` and `<names>` substitute; every other character ships verbatim.

## Relationships

None
# T108 - Non-Error throws yield `undefined` (or a TypeError) when the runtime extracts `.message`

**Kind:** assumptions, error-model, prescription
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Several spec surfaces extract a thrown value's `.message` without specifying behaviour when the throw is not Error-shaped. JavaScript permits `throw <any value>`, and only `Error`-derived values carry a string-valued `.message`. The affected producer sites are: the four `loom/load/extension-bootstrap-failed` bullets in `extension-bootstrap-and-per-loom.md` (`error: <error.message>`); the `CodeToolError.message` source on the `execute()`-throw branch in `host-interfaces-core.md` (§**Tool execution from loom code** and the *Outcome routing summary*); the diagnostics-registry rows in `code-registry-load.md`, `code-registry-runtime.md`, and `code-registry-host.md` that carry an underlying error message; and the §6 / §8 placeholder bindings in `placeholder-rendering-b.md`. For a non-Error throw, naive `.message` access yields `undefined`, a non-string value that defeats the first-line-truncation rule, or a synchronous `TypeError` on a `null`/`undefined` throw that escapes the bootstrap catch and violates the page's "factory MUST NOT throw out of `default function (pi: ExtensionAPI)`" rule — so two conforming implementations produce divergent payloads and divergent control flow.

## Solution approach

Define a single normative error-coercion rule in `placeholder-rendering-b.md` §6 (Underlying-error placeholders), the existing home of the underlying-error rendering rule: a `null`/`undefined` value yields the fixed string `"<no message>"`; an object whose `.message` is a string yields that `.message`; otherwise the value yields `String(value)`. The §6 first-line-truncation rule and the existing empty-string `<no message>` fallback then operate on the guaranteed string. Rewrite each producer site named in Problem to consume the coercion output rather than a raw `.message` access.

## Solution constraints

- Out of scope: the `CodeToolError` schema in `errors-and-results/queryerror-variants.md` and the `tool-calls.md` failures section — the fix is producer-side and requires no schema or consumer change.

## Relationships

- T109 "`session_start` collision pass has no failure contract when `pi.getCommands()` throws" - same-cluster (another bootstrap-path throw whose payload construction needs the same coercion once a contract is defined)
# T109 - `session_start` collision pass has no failure contract when `pi.getCommands()` throws

**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`registration-steps.md` step 3 subscribes a `session_start` handler whose first action is a `pi.getCommands()` read for the cross-format collision pass, before the per-loom `pi.registerCommand` loop runs. The *Extension-bootstrap SDK failures* enumeration in `extension-bootstrap-and-per-loom.md` covers only write calls (`pi.registerMessageRenderer`, `pi.registerCommand`, `pi.registerFlag`, `pi.on`); the read `pi.getCommands()` has no entry. The factory's `MUST NOT throw out of default function (pi: ExtensionAPI)` rule scopes to the factory body, not to event handlers Pi invokes at `session_start`, so a `pi.getCommands()` throw escapes into Pi's `session_start` dispatch with no `loom/load/extension-bootstrap-failed` diagnostic and no pinned disposition for the pending-registration list. Implementers diverge: one lets the throw propagate (every pending loom silently lost), another swallows it and registers every loom without the collision filter — and neither path emits the operator-facing diagnostic the rest of the page promises.

## Solution approach

Add a fifth bullet to the *Extension-bootstrap SDK failures* enumeration in `extension-bootstrap-and-per-loom.md` covering a `session_start`-time `pi.getCommands()` read throw, and forward-link it from `registration-steps.md` step 3's collision pass. Pin the disposition: the pending-registration list is dropped for this `session_start` (no `pi.registerCommand` calls issue), the runtime emits one `loom/load/extension-bootstrap-failed` (E, load) through the **System notes** fallback chain naming the `pi.getCommands` capability in `details`, and the handler swallows the throw rather than propagating it into Pi's `session_start` dispatch — mirroring the per-call `try`/`catch` pattern the four sibling write-side bullets use. The `details.error` field uses the same coercion the sibling bullets adopt.

## Solution constraints

- The failure is scoped to the failing `session_start` pass, not the extension lifetime — the fix MUST NOT set drain state (drain state is owned by `drain-state-contract.md`'s `LoomRegistry` contract).

## Relationships

- T108 "Non-Error throws yield `undefined` (or a TypeError) when the runtime extracts `.message`" - co-resolve (the new bullet's `error: <error.message>` field needs the same `String(value)` coercion the sibling bullets adopt; both fixes should land in one editorial pass)
- T035 "`pi.getFlag` is touched pre-bind but is absent from both the safe-before-bind list and the `notInitialized`-throwing list" - same-cluster (a sibling Pi-read whose failure mode is also unspecified at its call site; resolves independently in step 1 rather than step 3)
- T067 "Pi behavioural presuppositions lack authoritative behavioural pointers" - same-cluster (cites the `getCommands-completeness` presupposition as one of its examples; concerns completeness of the snapshot, not the throw path)
# T110 - `CodeToolError` ≡ `QueryError{kind:"code_tool"}` equivalence and `loom-direct:` toolCallId UUID form are both under-specified at `host-interfaces-core.md`

**Original heading:** `CodeToolError` ≡ `QueryError{kind:"code_tool"}` equivalence not stated inline; `loom-direct:` UUID form unspecified
**Original section:** docs/spec_topics/pi-integration-contract/ (host-prerequisites, host-interfaces-core, host-interfaces-services, extension-bootstrap-and-per-loom, registration-steps)
**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`host-interfaces-core.md` couples two independent under-specifications at the **Tool execution from loom code** boundary, both of which leave an implementer guessing.

First, the lowering prose returns `Err(QueryError { kind: "code_tool", cause: "execution", message: <m>, tool_name, ... })` (the `isError: true` paragraph in §**Tool execution from loom code**), but the immediately-following *Outcome routing summary* rewrites every routing arm as `Err(CodeToolError { cause: ..., ... })` with no inline statement that these are the same value. The equivalence is resolvable only by following the cross-reference into `errors-and-results/queryerror-variants.md`, whose `schema CodeToolError { kind: "code_tool", ... }` block establishes that `CodeToolError` is the name of the `QueryError` variant whose `kind` discriminator is `"code_tool"`. A reader who treats the routing summary as authoritative may reasonably wonder whether two distinct error shapes are in play.

Second, the same paragraph asserts ``toolCallId` is a synthesised UUID prefixed `loom-direct:`'' and never says anything else about the form. The canonical `8-4-4-4-12` lowercase-hex shape is pinned for `invocationId` values minted through PIC-20's `IdSource.newInvocationId()` (`host-interfaces-services.md:152`, with the §7 placeholder convention as the cited authority), but no equivalent pin attaches to the toolCallId: the suffix grammar, the prefix separator character (literal `:` vs something else), and the lowercase-vs-uppercase hex casing are all left implicit. The same gap also drops the uniqueness contract under the re-entrant concurrent `execute()` calls the tool-call seam permits.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — §**Tool execution from loom code** (edited)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — `### Code-side tool-call variant` (read-only; canonical declaration of `CodeToolError`)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-20 / `IdSource` (read-only; canonical UUID-form precedent)
- `docs/spec_topics/tool-calls.md` — open-struct seam paragraph mentioning the `loom-direct:` toolCallId (option-dependent; may need a back-pointer to wherever the form is pinned)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan has no authored leaves yet; `plan.md` MVP / Vertical sections are placeholders.)

## Consequence

**Severity:** correctness

Without an inline equivalence statement two implementers reading the *Outcome routing summary* in isolation may model `CodeToolError` as a distinct error type from `QueryError`, producing divergent destructuring and `match`-arm structures at every loom-side call site. Without a pinned `loom-direct:` form, conformance test fixtures asserting on toolCallId values become guesses, and concurrent re-entrant tool-call paths have no uniqueness contract to satisfy.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles two independent obligations; resolve them in order — the equivalence clarification first (a one-clause edit that does not touch any other page), then the UUID-form specification (a wider question with cross-page implications and overlap with two sibling findings).

### Option A — State the `CodeToolError` ≡ `QueryError{kind:"code_tool"}` equivalence inline

**Approach.** At the first occurrence of the `Err(QueryError { kind: "code_tool", ... })` shape inside §**Tool execution from loom code** (the `isError: true` paragraph), add a parenthetical equivalence: *"(this value is also referred to as `CodeToolError`; the two names denote the same `QueryError` variant — see [Errors and Results — `CodeToolError`](../errors-and-results/queryerror-variants.md#code-side-tool-call-variant))"*. The *Outcome routing summary* can then continue to use the `CodeToolError` short name unchanged.

**Spec edits.**
- `host-interfaces-core.md`, §**Tool execution from loom code**, lowering paragraph: add the equivalence parenthetical at the first `QueryError { kind: "code_tool", ... }` mention.

**Pros.** One-clause edit. No semantic change. Removes the cross-reference round-trip without rewriting either shape. Leaves `queryerror-variants.md` as the single canonical declaration.

**Cons.** Adds a (small) maintenance obligation: any future rename of either side must update this clause.

**Risks.** None material.

### Option B — Specify the `loom-direct:` toolCallId UUID form and minting path

**Approach.** Pin the toolCallId form inline at `host-interfaces-core.md`'s bullet ``toolCallId` is a synthesised UUID prefixed `loom-direct:`'' as: *"toolCallId is the literal string `loom-direct:` immediately followed by a UUID in the canonical lowercase 8-4-4-4-12 hex form defined under [§7 placeholder convention](../diagnostics/placeholder-rendering-b.md#7-identifier--descriptor--and-closed-enum-placeholders); the runtime MUST mint each toolCallId UUID through the `IdSource` seam (see PIC-20), and the toolCallId values MUST be unique across the lifetime of one runtime instance (including concurrent re-entrant `execute()` calls)."*. Resolve the minting question by either adding `newToolCallId(): string` to the `IdSource` interface or by reusing `newInvocationId()` for both purposes — see related findings #672 and #677 for the full minting-path question.

**Spec edits.**
- `host-interfaces-core.md`, §**Tool execution from loom code**, `toolCallId` bullet: replace with the pinned form above.
- `host-interfaces-services.md`, PIC-20 `IdSource` interface: either extend with `newToolCallId()` or document the dual use of `newInvocationId()`.
- `tool-calls.md`, open-struct-seam paragraph mentioning the `loom-direct:` toolCallId: cross-reference the pinned form rather than re-stating it.

**Pros.** Closes the test-fixture and concurrency-contract gap. Co-resolves findings #672 ("Synthesised `loom-direct:` toolCallId format is undefined") and #677 ("`loom-direct:` toolCallId minting path collides with the PIC-20 ambient-UUID ban") with a single coordinated edit.

**Cons.** Touches `host-interfaces-services.md` (PIC-20 interface surface), so it is a wider edit than Option A. The seam-extension vs. reuse-`newInvocationId()` sub-choice is itself an open question the related findings need to settle.

**Risks.** If implemented before #677 is resolved, the chosen minting path may need to be revised when #677 is settled. Order #677 ahead of this option, or batch them.

### Recommendation

Resolve Option A first as a standalone, scope-bounded clause — it is a one-line edit with no dependencies on any other open finding. Then resolve Option B in coordination with the two superseding findings (#672 defines the toolCallId form; #677 settles the minting-path collision with PIC-20). Once #672 lands its pinned form, the bullet at `host-interfaces-core.md` need only cross-reference it rather than restate it; once #677 lands the seam decision, the minting clause can cite the chosen `IdSource` member by name.

## Relationships

- T097 "`loom-direct:` toolCallId has no PIC-20-compliant minting path" - decision-overlap (the minting-path sub-choice inside Option B — extend `IdSource` vs. reuse `newInvocationId()` — is owned by that finding)
- T108 "Non-Error throws yield `undefined` (or a TypeError) when the runtime extracts `.message`" - same-cluster (touches the same `CodeToolError.message` field on the same page; resolves independently)

---

# T111 - Binder `complete()` call execution phase contradicts its own cancellation/argument wiring

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`binder-inference.md`'s *Binder inference call* second paragraph states the binder `complete(model, context, options)` call "runs at loom-load time before any conversation exists." Three wires in the same section, plus one in `binder.md`, contradict that phasing: `options.signal = loomAbort.signal` is tagged "always defined," but `loomAbort` is created only at the dispatch-site setup wrap in `active-invocation-registry.md`; the user-supplied slash argument string and the `context.systemPrompt` session-context block do not exist at load time; and the per-invocation retry budget in `determinism-cancellation-failure.md` caps the runtime per slash invocation, a budget a load-time call cannot draw against. What actually runs at loom-load time is binder-*model* resolution (`binder-model-and-context.md#binder-model`); the `complete()` call itself runs per slash dispatch, where all three wires are live.

## Solution approach

Rewrite the "runs at loom-load time before any conversation exists" clause in `binder-inference.md`'s *Binder inference call* second paragraph to distinguish the two events: binder-model resolution runs at loom-load time (`binder-model-and-context.md#binder-model`), while each `complete(...)` call is issued per slash dispatch at the dispatch-site setup wrap that creates `loomAbort` (`active-invocation-registry.md`) and that consumes the user argument string and the per-invocation retry budget (`determinism-cancellation-failure.md#per-invocation-retry-budget`).

## Solution constraints

- Out of scope: the `complete(...)` options-population bullet list — its `maxRetries` / `maxRetryDelayMs` disposition is owned by T112.
- Preserve the surrounding correct claims in the same paragraph: the call uses neither the user nor a spawned `AgentSession`, attaches no turns, and resolves directly from the returned `Promise<AssistantMessage>`.

## Relationships

- T112 "Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates" - same-cluster (also targets the binder-inference options-population list; co-edit window)
- T043 "Binder extraction narrative covers only the missing-ToolCall malformed-envelope sub-case" - same-cluster (same section, downstream of the call)
- T116 "Binder-failure RuntimeEvents have no pinned source for the required `invocation_id` / `loom` fields" - decision-overlap (resolving this finding by pinning the call to dispatch-site phasing also fixes the registry-entry-existence question for binder-failure events: the entry is inserted before the binder call by the dispatch-site setup wrap)
- T038 "`loomAbort` construction, forwarding, and teardown rules duplicated in `host-interfaces-core.md`'s "Cancellation source" paragraph" - same-cluster (touches the same `loomAbort` wiring this finding's fix cross-references)
# T112 - Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates

**Original heading:** Binder `complete()` within-attempt retry/backoff delegated to `StreamOptions` fields the options list never sets
**Original section:** docs/spec_topics/pi-integration-contract/ (inventory/audit cluster, registry, binder-inference, capability probe)
**Kind:** error-model, assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`binder-inference.md` enumerates exactly what the runtime puts on each binder `complete(model, context, options)` call: `model`, `context.systemPrompt`, `context.messages`, `context.tools`, `options.temperature = 0`, `options.signal = loomAbort.signal`, and — for providers whose `Api` carries a seed field — the seed under that field name. `options.maxRetries` and `options.maxRetryDelayMs` are not in that list, so loom never assigns them.

`determinism-cancellation-failure.md` (`#per-invocation-retry-budget`) and `conversation-drive.md` (`#complete-retry-and-cancellation-presupposition`, checklist item (aa) in `version-bump-step2.md`) nevertheless build the binder's whole within-call retry / backoff / `Retry-After` story on those two fields: "Client-side retry of a *single* underlying attempt — including any backoff and any server-requested wait such as an HTTP `Retry-After` — is owned by `@earendil-works/pi-ai`'s `StreamOptions.maxRetries` and `StreamOptions.maxRetryDelayMs` … loom redefines neither field." Two implementers reading the population list and the presupposition together will diverge on what actually reaches the provider: one will pass nothing and inherit whatever pi-ai's defaults are at the pinned version; another will read "loom redefines neither field" as "explicitly forward pi-ai's documented defaults under their own names"; a third will set `maxRetries: 0` to silence within-call retries entirely so the loom-level per-invocation budget is the sole retry surface. Each is a defensible reading and each yields a different observable inter-attempt latency and a different ceiling on total provider calls per slash invocation.

Whichever disposition is correct, the spec must state it: either pin the values loom places on `options`, or state that loom deliberately omits these fields and name the pi-ai defaults the runtime is inheriting at the pinned version (so the version-bump procedure has a concrete value to diff against).

## Spec Documents

- `docs/spec_topics/pi-integration-contract/binder-inference.md` — `complete(...)` options-population list (edited)
- `docs/spec_topics/binder/determinism-cancellation-failure.md` — Per-invocation retry budget paragraph, `StreamOptions` delegation sentence (option-dependent)
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — `complete-retry-and-cancellation-presupposition` (option-dependent)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — checklist item (aa) (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan currently contains no authored leaves; coverage matrix is empty.)

## Consequence

**Severity:** correctness

Two good-faith implementations diverge on observable behaviour: the number of provider calls per loom-level binder attempt, the per-attempt backoff, and `Retry-After` adherence all depend on values the spec leaves unspecified. The loom-level 3-call ceiling stays intact, but the *real* per-invocation upper bound on provider hits and the inter-attempt latency floor differ across implementations, and the version-bump checklist item (aa) has no concrete value to re-verify against.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Pin explicit loom-side values on the population list

**Approach.** Extend the `binder-inference.md` options-population list with two bullets: `options.maxRetries = <N>` and `options.maxRetryDelayMs = <M>`, with `<N>` and `<M>` chosen by loom (likely matching the current pi-ai defaults so behaviour is unchanged, but stated as loom-owned values).

**Spec edits.**
- Add the two bullets to the enumerated list under "The runtime populates one `complete(model, context, options)` call per binder attempt as follows" in `binder-inference.md`.
- Re-word the `StreamOptions` sentence in `determinism-cancellation-failure.md#per-invocation-retry-budget` from "loom redefines neither field" to "loom pins both fields per the binder-inference call's options-population list".
- Re-word `conversation-drive.md#complete-retry-and-cancellation-presupposition` property (1) so the presupposition is about pi-ai *honouring* `options.maxRetries` / `options.maxRetryDelayMs` rather than about loom inheriting their unstated defaults.
- Leave version-bump item (aa) intact — it already re-runs fixtures against the documented values.

**Pros.** Eliminates dependence on pi-ai's default for an observable behaviour. The version-bump fixtures have explicit numbers to assert against. A pi-ai minor that changes the default is a no-op for loom.

**Cons.** Loom now owns concrete numeric constants whose "right" value depends on per-provider transport reality the spec does not characterise. Requires picking values.

**Risks.** A poorly-chosen `maxRetries` (e.g. too high) inflates per-loom-attempt provider cost and can interact unfortunately with the loom-level transport-class retry, doubling effective retry depth on the wire.

### Option B — Explicitly omit the fields and pin the inherited defaults

**Approach.** Keep the population list as is, but add a normative sentence stating that loom deliberately omits `maxRetries` / `maxRetryDelayMs` from `options` and that the per-attempt retry budget and backoff are whatever pi-ai's defaults at the [Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin) produce. Name those defaults inline (read from pi-ai's `dist/types.d.ts` at the pinned version) and add a version-bump checklist item that re-pins the named values on each Pi bump alongside (aa).

**Spec edits.**
- Insert a sentence after the enumerated population list in `binder-inference.md` stating the deliberate omission and the inherited defaults, e.g. "loom omits `options.maxRetries` and `options.maxRetryDelayMs`; the binder call inherits pi-ai's defaults at the pinned version (`maxRetries = <N>`, `maxRetryDelayMs = <M>` at `dist/types.d.ts`)."
- Re-word the `StreamOptions` delegation sentence in `determinism-cancellation-failure.md#per-invocation-retry-budget` to point at the named inherited defaults rather than at the unnamed library behaviour.
- Add a version-bump checklist item (or extend (aa)) requiring the contributor to re-read those two default values from pi-ai's `dist/types.d.ts` at each Pi minor bump and update the named values in the same edit if they changed.

**Pros.** Matches the existing posture ("loom redefines neither field") and avoids loom owning numeric retry policy. The version-bump procedure now has concrete values to diff.

**Cons.** Reading defaults from a `.d.ts` declaration is brittle if the defaults are documented only at the implementation site rather than the type site. Couples loom's observable retry behaviour to a pi-ai field whose default pi-ai may treat as an implementation detail.

**Risks.** A silent pi-ai default change between minor bumps would shift loom's binder retry depth and backoff with no SDK surface-inventory signal until the editorial-review item is run.

### Option C — Set `maxRetries = 0` and own all retry depth at the loom level

**Approach.** Add `options.maxRetries = 0` to the population list (omit `maxRetryDelayMs` or set it to `0`) so pi-ai issues exactly one provider call per loom-level binder attempt. The loom-level [per-invocation retry budget](../binder/determinism-cancellation-failure.md#per-invocation-retry-budget) then accounts for every provider hit one-to-one.

**Spec edits.**
- Add `options.maxRetries = 0` (and the chosen `maxRetryDelayMs` disposition) to the population list in `binder-inference.md`.
- Re-word `determinism-cancellation-failure.md#per-invocation-retry-budget` to drop the "delegating per-attempt backoff to `complete()`" sentence; the loom-level "immediate re-issue" rule now covers the full retry contract.
- Re-scope `conversation-drive.md#complete-retry-and-cancellation-presupposition` property (1) to assert only that pi-ai honours `maxRetries = 0` (i.e. no implicit retry); the `Retry-After` honouring becomes a non-presupposition for the binder path.
- Trim version-bump item (aa) to the `maxRetries = 0` honouring fixture; `maxRetryDelayMs` falls out.

**Pros.** Loom owns the full retry surface; provider-call cardinality per slash invocation is exactly the loom-level ceiling (3). Eliminates `Retry-After` semantics from the loom-side mental model. Removes the inter-attempt-latency presupposition.

**Cons.** Loses pi-ai's `Retry-After` handling — a 429 with a server-requested wait collapses straight into the loom-level transport-class budget with no wait. May be hostile to providers that aggressively rate-limit. Diverges from any other loom call routed through `complete()` (e.g. the typed-query forced respond turn) unless those are aligned too.

**Risks.** A provider that returns 429 with `Retry-After: 30` would now consume the loom-level transport budget immediately rather than waiting; the second attempt likely 429s again, surfacing a transport-failure system note where Option A/B would have succeeded. Behavioural change vs Option A/B is observable.

### Recommendation

**Option B** — pin the omission explicitly and name the inherited pi-ai defaults at the pinned version. This matches the existing "loom redefines neither field" posture and the conversation-drive presupposition (which already takes the position that pi-ai owns inter-attempt timing including `Retry-After`), and it avoids loom inventing concrete retry numerics outside its expertise. The single new obligation is re-reading two values from pi-ai's type declaration on each Pi bump, which slots naturally into the existing editorial-review checklist alongside item (aa). Edge cases the implementer must watch: if pi-ai's `.d.ts` documents the defaults only via prose comments rather than as `?:` defaults inferable from the type, the spec must instead name the implementation-site default and accept that drift detection is editorial; and the typed-query forced respond turn — the other loom call routed through `complete()` — should inherit the same disposition for consistency.

## Relationships

- T111 "Binder `complete()` call execution phase contradicts its own cancellation/argument wiring" - same-cluster (also targets the binder-inference options-population list; co-edit window)
- T045 "Audit-cluster testability/assumptions: four independent gaps bundled in one finding" - co-resolve (its "unpinned `complete()` retry/cancellation behaviour" item is the same gap viewed from the audit cluster's perspective; pinning the options here discharges that sub-item)

---

# T113 - `ActiveInvocationRegistry` entry shape omits the `disposeBarrier` resolver, and several intra-page "below" references now resolve to other files

**Original heading:** `disposeBarrier` resolver storage not reconcilable with the pinned five-field entry shape; "below" references to relocated contracts
**Original section:** docs/spec_topics/pi-integration-contract/ (inventory/audit cluster, registry, binder-inference, capability probe)
**Kind:** implementability (shard-11)
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`active-invocation-registry.md` pins the registry entry as the five-field
`Set<{ loomAbort: AbortController; disposeBarrier: Promise<void>; shutdownReason: string | undefined; loom: string; invocationId: string }>`,
yet the same page repeatedly states that the per-invocation `finally`
*"settles `disposeBarrier`"* and that "the same per-invocation `finally`
removes the entry and settles `disposeBarrier`." A `Promise<void>` cannot
be externally settled without a resolver handle, and no field of the
pinned entry shape holds one. The spec does not state where the resolver
lives (insertion-site closure, separate map, sibling field, …), so two
implementers will diverge on whether the entry must grow a sixth field,
whether the closure that performs the `Set.add` must capture the resolver,
or whether the runtime synthesises an outer `Promise.withResolvers()`
seam — each carrying different test-visibility and lifetime obligations.

Compounding the local incoherence, the page resolves several load-bearing
cross-references with the word *"below"* even though the cited sections
now live in other files of the `pi-integration-contract/` directory:

- *"`RuntimeEvent.invocation_id` wire field defined under **Runtime event channel** below"* — owned by `runtime-event-channel.md`.
- *"`sendSystemNote` fallback chain (the best-effort chain defined under **System notes** below)"* — owned by `runtime-event-channel.md` (the *System notes* H2).
- *"the per-invocation `finally`'s `loom/runtime/cancelled-by-session-shutdown` emission per the **Per-invocation operator visibility (clean-cancel path)** rule below"* — owned by `session-shutdown-semantics.md`.
- *"…disposes any subagent session (per **Subagent session lifecycle** below)"* — owned by `subagent.md` (PIC-9).
- *"Pi's per-session slash-handler serialisation pinned under **Tool-registration lifetime and visibility** below"* — owned by `tool-registration-lifetime.md`.

The "below" form misleads a reader who lands on the registry page in
isolation; the anchors exist but are not on this page.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/active-invocation-registry.md` — *`ActiveInvocationRegistry`* intro paragraph and *Registry contract* bullets (edited)
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — *Runtime event channel* / *System notes* targets (read-only)
- `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md` — *Per-invocation operator visibility (clean-cancel path)* target (read-only)
- `docs/spec_topics/pi-integration-contract/subagent.md` — *Subagent session lifecycle* (PIC-9) target (read-only)
- `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md` — *Tool-registration lifetime and visibility* target (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

## Consequence

**Severity:** correctness

Two good-faith implementers diverge on `disposeBarrier`: one grows the
entry to a sixth resolver field (changing the pinned shape and any test
that asserts on entry membership), another captures the resolver in the
insertion-site closure (no entry-shape change but a separate teardown
ordering rule). Both interpretations satisfy the current prose. The
"below" anchors that miss their target degrade navigability and let a
reader infer that the registry page itself defines `RuntimeEvent`, the
`sendSystemNote` fallback chain, or the clean-cancel emission — none of
which it does.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Repoint the stale "below" references to their owning pages

**Approach.** Sweep `active-invocation-registry.md` and rewrite each
"below" reference whose target now lives in another file so it cites the
owning page explicitly. Five sites are in scope:

- *"`RuntimeEvent.invocation_id` … under **Runtime event channel** below"* → cite `runtime-event-channel.md` (use the existing **Runtime event channel** H2 anchor).
- *"the best-effort chain defined under **System notes** below"* → cite `runtime-event-channel.md#system-notes` (or whatever the current `<a id>` is on that page).
- *"per the **Per-invocation operator visibility (clean-cancel path)** rule below"* (three occurrences in the intro and the *Edge cases* bullet) → cite `session-shutdown-semantics.md#session-shutdown-semantics`.
- *"per **Subagent session lifecycle** below"* → cite `subagent.md#pic-9`.
- *"pinned under **Tool-registration lifetime and visibility** below"* → cite `tool-registration-lifetime.md#tool-registration-lifetime-and-visibility`.

**Spec edits.** `active-invocation-registry.md` only; no anchor changes on
the target pages (verify each anchor exists before linking; they do at
the verification time of this finding).

**Pros.** Bounded surface (one file), purely link-repointing, no
normative content moves, leaves the rest of the page's contract intact.

**Cons.** Does not address the `disposeBarrier`-resolver gap.

**Risks.** Low. The only risk is anchor drift on the target pages; that
is mitigated by linking to existing `<a id>` anchors rather than
title-derived auto-anchors.

### Option B — State where the `disposeBarrier` resolver is held

**Approach.** Add one normative sentence to the *Registry contract*
section stating that the `disposeBarrier` resolver is **held at the
dispatch-site insertion-site closure** (alongside `loomAbort`), captured
when the entry is constructed via `Promise.withResolvers()` (or
equivalent), and used by the per-invocation `finally` to call
`resolve()` after `AgentSession.dispose()` returns (subagent mode) or
immediately (prompt mode). State explicitly that the pinned five-field
entry shape is **unchanged** — the resolver is closure-scoped, not a
registry-entry field — so observers of the entry shape (tests, audit
fixtures) see exactly the five members the entry literal pins. The
existing entry-shape literal therefore does not grow.

**Spec edits.** `active-invocation-registry.md` *Registry contract*
block, one new sentence (or short bullet) immediately after the
*Dispatch-site setup wrap* bullet that already enumerates the setup
sequence (`new AbortController()`, `Set.add`, listener attach,
`createAgentSession`); fold the resolver-construction step into the
enumerated setup sequence so the order is unambiguous.

**Pros.** Resolves the correctness-class gap without disturbing any
other contract: the entry-shape pin, the iteration-order rule, the
"never mutated thereafter" invariant on `loom`/`invocationId`, and the
`session_shutdown` sub-step 3 `Promise.allSettled(disposeBarrier)`
iteration all stand.

**Cons.** Touches a section that already carries dense load-bearing
prose; the new sentence must be self-contained enough not to invite a
second sweep.

**Risks.** Low. The recommended phrasing is descriptive
("held at the insertion-site closure"), not mechanism-prescriptive, so
it does not collide with the broader "registry over-prescription"
finding ("Registry `Set<{...}>` literal, …") that argues against pinning
internal mechanism.

### Recommendation

Apply **Option A first**, then **Option B**. Option A is the
scope-bounding citation fix — purely link-repointing, no normative
content shifts — and lands cleanly on the current page. Option B then
adds substantive normative content (resolver storage) on top of a stable
baseline of correctly-targeted cross-references, so the per-finding fix
loop's next lens pass sees a smaller and better-isolated diff than a
single combined edit would produce.

Edge cases the Option B implementer must watch:

- The resolver-storage statement must say the entry-shape literal is
  **unchanged** (the resolver is closure-scoped), or downstream
  consumers — audit fixtures, tests asserting on entry membership — will
  split.
- The *Dispatch-site setup wrap* `try`/`catch` arm's "throw before
  `Set.add` insertion completes" case must remain coherent: if
  `Promise.withResolvers()` is part of the setup sequence, state
  whether it runs before or after `Set.add`. The natural ordering is
  *before*, so the resolver is captured in scope when the entry is
  constructed.
- The `session_shutdown` sub-step 3 `Promise.allSettled` iteration
  reads `entry.disposeBarrier` (the `Promise<void>`), not the resolver,
  and continues to do so unchanged — only the per-invocation `finally`
  calls the closure-held resolver.

## Relationships

None

---

# T114 - pi-ai provider-error surface (status, body, network-failure delivery) is undefined

**Original heading:** pi-ai provider-error surface (status / body / network-failure delivery) is undefined
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`provider-error-mapping.md` specifies its entire classifier — overflow-signature matching against `error.message` / `error.type` / `error.code` / `ValidationException` body, an HTTP-200-with-body-envelope-error case, "every other 4xx/5xx response," and "every network-level failure (no HTTP response — TCP/TLS errors, provider-SDK timeouts, end-of-stream truncation)" — in terms of HTTP status, a parsed JSON error body, and a separate no-response class. It never says how loom obtains any of those from `@earendil-works/pi-ai`, and the actual pi-ai surface does not deliver them in the shape the rules assume.

`complete<TApi>(model, context, options?): Promise<AssistantMessage>` (declared at `@earendil-works/pi-ai`'s `dist/stream.d.ts`, already cited in `binder-inference.md`) does **not** reject on provider HTTP errors. Its implementation is `stream(...).result()`, and the `AssistantMessageEventStream.result()` promise resolves with the `AssistantMessage` carried on either the terminal `done` event or the terminal `error` event of the stream. The only failure-shaped fields on `AssistantMessage` (declared at `dist/types.d.ts`) are `stopReason: "stop" | "length" | "toolUse" | "error" | "aborted"` and `errorMessage?: string`; there is **no `httpStatus` field, no parsed body, no structured `error.code` / `error.type`**. Per-provider stream implementations populate `errorMessage` by passing the caught provider exception through a per-provider formatter (e.g. `formatAzureOpenAIError` produces `"Azure OpenAI API error (429): <provider message>"`), so the only HTTP-status signal that ever reaches loom from this surface is whatever digits the formatter happens to interpolate into a free-form string.

The one place pi-ai does expose typed HTTP metadata is `StreamOptions.onResponse?: (response: ProviderResponse, model) => void | Promise<void>` where `ProviderResponse = { status: number; headers: Record<string, string> }` (`dist/types.d.ts`). It fires "after an HTTP response is received and before its body stream is consumed," carries no body, and is not wired in the binder-inference call options enumerated in `binder-inference.md`. There is no pi-ai surface that delivers the raw provider error body to loom; the network-failure-vs-HTTP-response distinction is likewise not encoded in `AssistantMessage` — both collapse to `stopReason: "error"` with whatever `errorMessage` the per-provider formatter produced. Two reasonable implementers will diverge on whether to regex the wrapped `errorMessage`, to wire `onResponse` + a payload sniffer, or to assume some other pi-ai surface that does not exist.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — *Provider error mapping*, *Provider-owned-wording presupposition*, *`TransportError.retryable` population*, overflow-signature table (edited)
- `docs/spec_topics/pi-integration-contract/binder-inference.md` — *Binder inference call* options list, classification cross-reference paragraph (option-dependent)
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — *prompt-mode error detection* (`stopReason` / `errorMessage` probe), typed-query forced-respond classification cross-reference (option-dependent)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — `AssistantMessage` member surface, `ProviderResponse` if cited (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — bump-checklist items `(i)`, `(m)`, `(u)`, `(aa)`, `(ab)` and possibly a new item gating the chosen surface (edited)
- `docs/spec_topics/binder/determinism-cancellation-failure.md` — *Transport-class* classifier cross-reference (read-only)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — `TransportError.http_status` / `TransportError.message` derivation (read-only)
- `docs/spec_topics/query/query-failure-and-repair.md` — catch-all "all other 4xx and 5xx → `TransportError`" wording that presupposes status visibility (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`docs/plan.md` exists but `plan_topics/` contains only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md`; no leaves have been authored yet.)

## Consequence

**Severity:** correctness

Without pinning the pi-ai surface that delivers status, body, and the no-response case, the classifier table is not mechanizable: two conforming implementers will diverge on what `error.code: "context_length_exceeded"` even *means* (a substring inside the wrapped `errorMessage` string vs. a JSON field that pi-ai does not surface), on whether HTTP 400 vs HTTP 200 can be distinguished at all from `AssistantMessage` alone, and on what observable distinguishes "no HTTP response" from "HTTP 4xx with empty/unknown body" — all three currently collapse to the same `stopReason: "error"` + opaque `errorMessage` on the typed surface. `TransportError.retryable` and `ContextOverflowError` classification thus become implementation-defined exactly where the spec claims they are pinned.

## Solution Space

**Shape:** multiple
**State:** shaped

The decision is *which pi-ai surface(s)* the classifier reads from. The current paragraph silently assumes a structured surface that pi-ai does not provide; the resolution must commit to one.

### Option A — Classify from `AssistantMessage.stopReason` + `errorMessage` only

**Approach.** Treat `complete()`'s resolved `AssistantMessage` as the sole classifier input. `stopReason: "stop"` is success; `stopReason: "aborted"` is `CancelledError`; `stopReason: "error"` is a provider/transport failure whose sub-classification (overflow vs. transport, status, retryable) is derived from regex matches against the free-form `errorMessage` string. The "HTTP 400" / "HTTP 200" / "no HTTP response" distinctions in the existing table are dropped; what remains is overflow-signature regexes (already provider-owned per the existing *Provider-owned-wording presupposition*) plus a status-extraction regex that scans `errorMessage` for an interpolated `(\d{3})` to populate `TransportError.http_status`, with `null` when the formatter omitted it.

**Spec edits.** Pin the source as `AssistantMessage.stopReason` + `errorMessage` declared at `@earendil-works/pi-ai`'s `dist/types.d.ts` (cite the declaration site exactly as `binder-inference.md` does for `complete()`). Reword the table so each row's match key is a regex over `errorMessage` rather than a structured field. Add an `errorMessage`-extraction rule for `TransportError.http_status` (or change the field to `null`-by-default and pin that). Strip the "HTTP 400 with `error.code: …`" wording and the HTTP-200-body-envelope clause; replace with "`stopReason: "error"` with `errorMessage` matching `<regex>`." Re-classify `TransportError.retryable: true`/`false` by signature (not by status class), since status is no longer reliably available. Extend the existing *Provider-owned-wording presupposition* to cover the full `errorMessage` formatter output (pi-ai's per-provider `format…Error` functions), and add a corresponding `version-bump-step2.md` checklist item routing formatter-wording drift to editorial review.

**Pros.** Single surface; no wiring through extra pi-ai options; honest about what pi-ai actually delivers; the overflow-signature presupposition the spec already accepts naturally widens to cover everything else.

**Cons.** `TransportError.http_status` becomes best-effort (often `null`); the HTTP-200 carved-out path collapses into the general transport class, which loses the spec's existing distinction that 200-body errors are non-retryable; per-provider formatter wording becomes a much wider drift surface than the overflow signatures alone.

**Risks.** A pi-ai formatter change can silently re-route a real overflow into transport (already routed to editorial review for overflow; the same risk now applies to status extraction). The `retryable` classifier becomes signature-derived and may disagree across implementations until the regex set is exhaustive.

### Option B — Wire `StreamOptions.onResponse` and a payload/body hook; classify off the captured raw response

**Approach.** Register `onResponse` (and, where needed, a body-capturing wrapper around the response) in every `complete()` call the runtime issues, so the classifier sees a typed `ProviderResponse { status, headers }` plus the raw body bytes. Then keep the existing table essentially as written: match `status` exactly, parse the body as JSON, key on `error.code` / `error.type` / `ValidationException`. The `AssistantMessage`'s `stopReason` / `errorMessage` becomes a secondary fallback when the on-response capture is absent (e.g. true network failure before any HTTP response).

**Spec edits.** Pin `StreamOptions.onResponse` (declared at `@earendil-works/pi-ai`'s `dist/types.d.ts`) and `ProviderResponse` as the typed HTTP-metadata source. Specify that the runtime registers an `onResponse` callback on every `complete()` call (including the binder call in `binder-inference.md`), records `{ status, headers }` keyed to that call's invocation, and joins it with the resolved `AssistantMessage` to drive the classifier. Pin a body-capture mechanism — there is no pi-ai-typed body delivery, so the spec must either (i) declare the body unavailable and reduce body-keyed rules to a transport-class catch-all, or (ii) pin a body-capture seam outside pi-ai (e.g. an HTTP-interception adapter loom owns). State the no-HTTP-response case as "`onResponse` did not fire before `complete()` resolved with `stopReason: "error"`" and pin that as the `TransportError` retryable-true branch. Add a `version-bump-step2.md` checklist item for `onResponse` / `ProviderResponse` signature drift.

**Pros.** Preserves the existing table's status- and body-keyed rules; gives a clean structural answer to "no HTTP response"; `TransportError.http_status` is exact, not regex-derived.

**Cons.** Requires loom to wire an extra callback on every `complete()` call and join its result with the message — non-trivial across the binder, prompt-mode forced-respond, and any future call sites. The body envelope is *still* not delivered by pi-ai; without a body-capture seam the body-keyed rules remain unimplementable, and with one loom takes on responsibility for HTTP parsing that pi-ai already abstracts away. Adds a build-time obligation that `ProviderResponse` and `onResponse` remain stable across pi-ai minors.

**Risks.** A pi-ai version that stops invoking `onResponse` for some provider (e.g. SDK-only providers like Bedrock that bypass HTTP) silently breaks the status capture; the body-capture seam, if added, is loom-owned and version-coupled to every provider SDK independently of pi-ai.

### Option C — Hybrid: `onResponse` for status, `AssistantMessage.errorMessage` for body-envelope signature matches, no-`onResponse` ⇒ network-level

**Approach.** Combine: `ProviderResponse.status` (from `onResponse`) is the authoritative HTTP-class input; `AssistantMessage.errorMessage` (regex) supplies the overflow-signature / body-envelope-error wording; absence of an `onResponse` invocation before a `stopReason: "error"` resolution is the no-HTTP-response (network-level) case. The existing table's "HTTP 400 with `error.code: …`" rows reinterpret to "captured `status === 400` AND `errorMessage` matches `<regex>`."

**Spec edits.** Pin both `onResponse` / `ProviderResponse` and `AssistantMessage.stopReason` / `errorMessage` as the classifier inputs; restate each table row as a `(status, errorMessage-regex)` pair; pin the no-`onResponse` ⇒ network-level rule and route it through `TransportError { retryable: true, http_status: null }`. Update `binder-inference.md`'s options enumeration to require `onResponse`. Add bump-checklist items for both surfaces.

**Pros.** Recovers the existing table's status-class structure without requiring loom to parse HTTP bodies; honest about pi-ai's body opacity; the no-HTTP-response case has a structural definition rather than a string heuristic.

**Cons.** Two-input classifier with a join obligation; the rules' "`error.code: …`" wording still has to be reinterpreted as `errorMessage` regex, so the *Provider-owned-wording presupposition* still widens. `onResponse` join semantics across SDK-only providers must be pinned.

**Risks.** SDK-only providers (e.g. Bedrock, which uses an AWS SDK rather than raw HTTP) may not invoke `onResponse` even when an HTTP response did occur — collapsing real HTTP errors into the "network-level" branch and over-flagging `retryable: true`. The bump-checklist surface grows.

### Recommendation

**Option C (hybrid).** It preserves the table's existing status-class structure (so the `TransportError.retryable` rule and the HTTP-200-body-envelope carve-out keep their current shape) while honestly admitting that pi-ai delivers body wording only through `AssistantMessage.errorMessage`. Loom already accepts the *Provider-owned-wording presupposition* for overflow signatures; this option extends that acceptance the minimum amount needed to make the rest of the table mechanizable. The edge case to watch is SDK-only providers (`amazon-bedrock` in particular) where `onResponse` may not fire for HTTP responses delivered through the AWS SDK — the spec must pin, per row, whether `onResponse` is expected to fire and how absence is interpreted; the existing per-provider rows give a natural site for that pin alongside the row-selection-key fix called for in the adjacent finding.

## Relationships

- T115 "Provider-error-mapping table: row-selection key, Bedrock `ValidationException` discriminator, and HTTP-200 envelope discriminator unpinned" - decision-overlap (the chosen pi-ai surface determines what a "Bedrock `ValidationException`" or an "HTTP-200 body-envelope error" even looks like at the classifier input; both findings should be resolved in a single edit pass on `provider-error-mapping.md`)
- T084 "`TransportError` catch-all in `query-failure-and-repair.md` is narrower than the PIC contract" - co-resolve (the no-HTTP-response branch is exactly what the surface decision must define; Option C's "no `onResponse` before `stopReason: "error"`" rule resolves both)
- T083 "Stop-reason → `QueryError` variant mapping is undefined" - same-cluster (touches the same provider-classification table from the `stopReason` side; resolution interacts but can be specified independently)
- T112 "Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates" - same-cluster (also about the `StreamOptions` surface and the binder's `complete()` options enumeration; Option B/C would extend that enumeration with `onResponse`)
- T046 "`RuntimeEvent` justifies a field it does not carry" - same-cluster (separate field, but both touch the transport-error emission path)

---

# T115 - Provider-error-mapping table: row-selection key, Bedrock `ValidationException` discriminator, and HTTP-200 envelope discriminator unpinned

**Original heading:** Error-table row-selection key, Bedrock `ValidationException` discriminator, and HTTP-200 error-envelope discriminator unpinned
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** implementability (shard-13)
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

The **Provider error mapping** table in `provider-error-mapping.md` is the runtime's classifier for turning provider responses into `ContextOverflowError` / `TransportError`. Three pieces of the classifier's matching machinery are missing, each independently sufficient to produce divergence between two conforming implementations.

1. **Row-selection key is absent.** The table has four rows (`anthropic-messages`, `openai-completions`, `mistral`, `amazon-bedrock`) but never says how the runtime chooses which row applies to a given response. The sibling **Provider seed-field mapping** in the same file (line 31) is explicit — it is "keyed on the resolved binder model's `api` field as reported by `@earendil-works/pi-ai`'s model registry." The error-mapping table inherits no such pin. An implementer could (a) gate matching by the resolved model's `api` field — the model-registry-driven approach the seed table uses — or (b) try every row's signature against every response and accept the first match. The two strategies diverge whenever a non-openai 4xx body happens to contain `context_length_exceeded`, when an anthropic-shaped error body arrives from a non-anthropic gateway, etc.

2. **Bedrock `ValidationException` discriminator is unpinned.** Every other row pins an HTTP status (`HTTP 400`) and either a typed field (`error.type`, `error.code`) or a body regex. The bedrock row says only "`ValidationException` with body matching …". `ValidationException` is an AWS exception *class name*, not a JSON body field; the row pins neither an HTTP status nor the field/mechanism by which loom recognises it (thrown SDK class? AWS `__type` JSON field? an `errorCode` header? something pi-ai surfaces?). Two implementers cannot agree on what to match.

3. **HTTP-200 body-envelope error discriminator is openai-only.** Both the catch-all paragraph (line 5) and `TransportError.retryable` (line 11) classify "an HTTP-200 response carrying a non-overflow body-envelope error" as `TransportError`. But the only definition of what makes a 200 body an "error envelope" is the openai-completions row's `error.code: "context_length_exceeded"`. For mistral / anthropic / bedrock 200 responses there is no rule for deciding that a 200 body is an error at all — so the catch-all has no domain on those providers, and the seemingly-symmetric rule reduces in practice to "openai only."

Detection of (1) and (3) is silent: a non-openai HTTP-200 body-envelope error falls through to "ok response" and is mis-classified as a successful provider turn; a Bedrock context-overflow misread under (2) falls through to `TransportError` with `tokens_used`/`tokens_limit` null, exactly the failure mode the *Provider-owned-wording presupposition* is meant to surface to editorial review.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — **Provider error mapping** table, catch-all paragraph, *Provider-owned-wording presupposition*, **`TransportError.retryable` population** (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — `#model-registry-pin` (read-only; supplies the `Model<Api>.api` anchor reused by the row-selection key)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — `provider` derivation paragraph that already pins `Model<Api>.api` as the `Api`-shaped key the error-mapping table is "keyed on" (read-only; the prose currently asserts a key the table does not name)
- `docs/spec_topics/binder/determinism-cancellation-failure.md` — *Failure-class taxonomy* (read-only; restates the catch-all and inherits any new HTTP-200 discriminator wording)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — checklist item (i), *Provider overflow-signature wording* (option-dependent; the fixture-set composition shifts if the HTTP-200 discriminator is scoped down rather than pinned across providers)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(Project has a plan scaffold but no leaves authored.)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on at least one of three axes — which row applies to a given response, whether a bedrock context-overflow is recognised at all, and whether a non-openai 200-body error is classified as `TransportError` or silently treated as success. Each divergence produces a different `QueryError` variant for the same provider response, which in turn changes whether the binder consumes a transport-class retry budget, whether `tokens_used`/`tokens_limit` are populated, and whether the failure even surfaces to the operator.

## Solution Space

**Shape:** multiple
**State:** shaped

The three obligations are independent in fix-surface and observability and MUST be resolved as three separate edits (per the bimodal-decomposition rule). They share a file but not a paragraph; bundling them produces a wide diff whose subsequent review pass critiques the whole edit surface rather than each obligation in isolation.

### Option A — Pin the row-selection key

**Approach.** Add a single sentence to the **Provider error mapping** paragraph (line 5) stating that the table is keyed on the resolved model's `api` field as reported by `@earendil-works/pi-ai`'s model registry, exactly as the **Provider seed-field mapping** paragraph already states for itself (line 31), with the same `Model<Api>.api` cross-link to `host-interfaces-core.md#model-registry-pin`. A response from a provider whose `api` value does not match any row in the table maps to `TransportError` via the catch-all unconditionally (no cross-provider signature matching).

**Spec edits.** One sentence in `provider-error-mapping.md` line 5 paragraph; a cross-link to `host-interfaces-core.md#model-registry-pin`; an inline `Api`-shaped key note matching the wording already used at `queryerror-variants.md` line 108 for `provider` derivation.

**Pros.** Mirrors the seed-table convention in the same file; reuses an already-pinned anchor; eliminates the cross-provider matching ambiguity in one stroke; aligns with `queryerror-variants.md`'s already-asserted "keyed on" prose.

**Cons.** None of note — the seed-table precedent makes this the editorial default.

**Risks.** None.

### Option B — Pin the Bedrock `ValidationException` discriminator

**Approach.** Replace the bedrock row's "ValidationException with body matching …" phrasing with a fully-specified discriminator. The cleanest pin is to name the AWS-side JSON field (`__type` containing `"ValidationException"`, or whichever field pi-ai's bedrock adapter surfaces) plus an HTTP status (AWS Bedrock returns `400` for `ValidationException`), exactly parallel to the anthropic/openai/mistral rows. If pi-ai presents bedrock errors as a typed exception class rather than a body field, the row MUST cite the pi-ai-side declaration site (path + member) for that class, in the same convention the sibling finding "pi-ai provider-error surface … is undefined" prescribes for the whole cluster.

**Spec edits.** Bedrock row of the **Provider error mapping** table at line 18 — replace `ValidationException` shorthand with `HTTP 400 with <field>: "ValidationException"` (or the pi-ai-typed-class equivalent), keeping the body regex unchanged.

**Pros.** Restores symmetry with the other three rows; gives the fixture suite a concrete shape to assert against; closes the silent-downgrade path where a real bedrock context-overflow falls through to `TransportError` with null token counts.

**Cons.** Requires confirming the exact AWS / pi-ai surface bedrock errors take (the spec text does not currently state this — see the related finding "pi-ai provider-error surface …").

**Risks.** If resolved before the sibling pi-ai-surface finding, this row's pin may need a one-line re-anchor once that finding lands; the underlying body discriminator does not change.

### Option C — Pin the HTTP-200 envelope discriminator (or scope the rule)

**Approach.** Two viable sub-shapes:

- **C1 (per-provider pin).** Extend each row's signature to specify whether and how that provider can deliver an HTTP-200 body-envelope error, and which field carries the error code. Today only the openai-completions row covers this case ("HTTP 200 with the same code in the body envelope"); anthropic / mistral / bedrock either do not emit such responses or do so under a different shape that needs pinning.
- **C2 (scope the rule).** Restate the catch-all to apply *only* where a per-row signature pins an HTTP-200 envelope shape. The HTTP-200 catch-all then has a defined domain (currently just openai); any other provider's HTTP-200 response is treated as a successful turn, with mis-classification of true 200-body errors reaching editorial review under the *Provider-owned-wording presupposition*.

**Spec edits.** Either (C1) extend each non-openai row in the table at lines 15–18 with an HTTP-200 sub-clause and an explicit "n/a" where the provider never returns 200-on-error, or (C2) reword the catch-all paragraph at line 5 and the parallel sentence in `TransportError.retryable` at line 11 to bound the HTTP-200 arm to "providers whose row pins an HTTP-200 envelope shape." `binder/determinism-cancellation-failure.md` lines 31 and 33 inherit either rewording without further edits.

**Pros (C1).** Symmetric, removes any silent-failure path.
**Pros (C2).** Smaller diff; honest about which providers loom has actually observed using HTTP-200-on-error; routes the residual risk through the existing presupposition machinery.

**Cons (C1).** Requires real per-provider knowledge that the spec does not currently cite.
**Cons (C2).** Leaves a real-but-unhandled mis-classification path on non-openai providers; surfaces only through editorial review, not the runtime.

**Risks.** Under C2, a provider quietly switching from 4xx-on-overflow to 200-on-overflow downgrades to `TransportError`/null until the fixture sweep catches it.

### Recommendation

Resolve in order **A → B → C**, as three separate edits and ideally separate fix-loop iterations:

1. **Option A first.** The row-selection key is the foundational scoping rule — it determines the domain over which (B) and (C) operate. Landing it first prevents (B) and (C) from being re-litigated against a still-ambiguous matching model.
2. **Option B second.** Smallest diff; touches one table row; depends only on the row-selection convention established by (A); resolves the most observably-broken case (silent overflow-downgrade on bedrock).
3. **Option C third, with sub-shape C2.** C2 keeps the diff small and matches what loom can actually substantiate without inventing per-provider behaviour; C1 is admissible only if first-hand evidence (provider docs or pi-ai surface) is brought in for each non-openai row. Either sub-shape lands cleanly on top of A and B.

Edge cases the implementer must watch:
- A provider response whose model's `api` value is unknown to the runtime (e.g. a future pi-ai `Api` literal not yet listed) must map to `TransportError` via the catch-all and MUST NOT silently fall through to "ok"; cross-reference the `Api`-coverage build-time assertion in the seed-table paragraph if the same assertion gates the error table.
- Under (B), an AWS gateway response that returns `ValidationException` for a non-overflow reason (e.g. malformed request) must still classify as `TransportError`-not-overflow because the body regex fails; restate this explicitly if the new discriminator wording could be read as "any `ValidationException` is overflow."
- Under (C2), the *Provider-owned-wording presupposition* paragraph already routes silent-drift detection to editorial review; confirm the rewording does not orphan that routing for the now-scoped HTTP-200 arm.

## Relationships

- T114 "pi-ai provider-error surface (status, body, network-failure delivery) is undefined" - decision-overlap (Option B's discriminator wording depends on the pi-ai surface that finding pins)
- T083 "Stop-reason → `QueryError` variant mapping is undefined" - same-cluster (separate classifier arm, same `QueryError`-population machinery)
- T084 "`TransportError` catch-all in `query-failure-and-repair.md` is narrower than the PIC contract" - same-cluster (sibling catch-all-completeness gap; Option C's rewording must not collide with that finding's restatement)
- T055 "Item (i) leaves the loom-side overflow-signature regex update unspecified, and the SHOULD-item fail disposition is asymmetric across items (f)–(ad)" - co-resolve (fixture-suite shape under `version-bump-step2.md` item (i) must be re-pointed at any new discriminator wording introduced by Options B and C)

---

# T116 - Binder-failure RuntimeEvents have no pinned source for the required `invocation_id` / `loom` fields

**Kind:** error-model, implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`runtime-event-channel.md` declares `invocation_id` and `loom` as required (non-optional) fields on every `RuntimeEvent`, and Group A lists binder failures (every row of [Binder — Failure modes]) in the always-log set, but the page never pins where those two fields come from for binder-failure events specifically. The field comment sources `invocation_id` from the `ActiveInvocationRegistry` entry, yet the page's own `query_site` carve-out says the binder "runs before any loom code," and `binder-inference.md` places the binder `complete()` call at loom-load time — before any registry entry exists. `active-invocation-registry.md` instead pins insertion at slash-command handler entry, before any awaitable work, which guarantees the entry exists when the binder runs. The two readings disagree on whether a registry entry exists at binder-failure emission, so one implementer synthesises the entry and another emits empty or placeholder `invocation_id` / `loom`, silently breaking the wire contract.

## Solution approach

Clarify in `runtime-event-channel.md`'s `RuntimeEvent` field-comment block (which already carries the `query_site` "absent for binder failures" carve-out) that for binder failures `invocation_id` and `loom` are read from the slash-command's `ActiveInvocationRegistry` entry — the `invocationId` and `loom` fields per `active-invocation-registry.md`'s `#active-invocation-registry` Registry contract. Ground the rule in the *Insertion* rule's "before any awaitable work" guarantee: the binder call is the slash dispatch's first awaitable, so the entry exists synchronously before any binder-failure event fires. State that the rule applies to every row of Group A's [Binder — Failure modes] enumeration.

## Solution constraints

- Out of scope: `binder-inference.md`'s binder-execution-phase wording (owned by T111).

## Relationships

- T111 "Binder `complete()` call execution phase contradicts its own cancellation/argument wiring" - decision-overlap (resolving when the binder `complete()` call is issued determines whether the registry-entry-exists-at-binder-phase premise of this fix holds; this finding's approach relies on the slash-dispatch reading, which is also what the cancellation and argument wiring already require)
- T113 "`ActiveInvocationRegistry` entry shape omits the `disposeBarrier` resolver, and several intra-page "below" references now resolve to other files" - same-cluster (both edits touch the registry-entry / RuntimeEvent sourcing surface; resolved independently)
# T117 - Runtime-event channel: undefined "occurrence" vs "origin"; PIC-1 pure-read MUST has no observable projection; per-site mask-domain table split from CIO

**Original heading:** "exactly once per occurrence" vs "at most twice per origin"; PIC-1 pure-read MUST unobservable; per-site mask domain split from CIO
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** clarity, testability, placement
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

`runtime-event-channel.md` opens with a normative "exactly once per occurrence" emission guarantee for the always-log set, then later — in the *Deduplication and lifetime rules* — adds that "the runtime emits the same `RuntimeEvent` payload at most twice per origin: once at the originating site (always), and once again at the boundary as the `details: { event }` payload of the user-facing top-level note when a cascade applies." Neither "occurrence" nor "origin" is defined on the page or in the glossary. A reader trying to reconcile the two statements must infer from context that an *occurrence* is the originating failure event (single always-log emission) and that a cascade-twin re-emission is *not* a second occurrence because it is byte-identical (same `occurred_at`) and collapsed by the `(kind, query_site, message, occurred_at)` dedup tuple. That reconciliation is left to the reader; two implementers can easily disagree on whether the boundary re-emission counts toward "exactly once per occurrence" or whether it is a separate emission that happens to share a key.

PIC-1's *pure-read MUST* (clause (e)) is written entirely in internal-state vocabulary: detection at the surfaced site "MUST NOT advance the `tool_loop` counter, mutate round bookkeeping, re-invoke ceiling #4's depth-walk, or trip a second emission." Three of the four prohibitions are unobservable from outside the runtime — they constrain *how* the implementation evaluates the V1 reachable predicate (clause (d)), not *what* a conformance test can witness. Only "no second emission" projects onto the observable channel. The MUST is therefore unfalsifiable as written: two implementations that produce the same `RuntimeEvent` stream (including identical `masked` values) cannot be distinguished even if one of them re-runs ceiling-#4's depth-walk on every predicate evaluation, in direct violation of clause (e).

The PIC-1 *per-site reachable mask domain* table (clause (c), five rows keyed by surfacing site) sits in `runtime-event-channel.md` and references CIO-1, CIO-2, CIO-3, CIO-4, and CIO-5 by anchor; the CIO interaction order itself lives in `ceilings-3-and-4.md`. The split is intentional and cross-referenced — CIO-6 explicitly delegates ownership of the mask domain and the pure-read MUST to PIC-1, and PIC-1 conversely delegates the four-ceiling list and CIO ordering to ceilings-3-and-4 — but every row of the table is reasoned in CIO terms, so a reader of either page must keep the other open to follow the argument. The table is the only place in PIC-1 where the routing logic is reasoned site-by-site against the CIO sequence; the rest of PIC-1 is shape/wire/copy-policy material that does not depend on the CIO ordering.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — *Runtime event channel* opening paragraph (occurrence terminology) (edited)
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — *Deduplication and lifetime rules*, first bullet (origin / cascade-twin) (edited)
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — PIC-1 clause (c) per-site reachable mask domain table (option-dependent)
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — PIC-1 clause (e) pure-read MUST (edited)
- `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` — *Interaction between ceilings* (CIO-1…CIO-6) and CIO-6 ownership-delegation sentence (option-dependent)
- `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` — *Per-boundary destination/surface table (ceiling #4)* (read-only)
- `docs/spec_topics/query/query-tool-loop.md` — *Worked example: depth-6 forced respond at `max_rounds`* (read-only; cited by PIC-1)
- `docs/spec_topics/glossary.md` — candidate home for `occurrence` / `origin` definitions if the editorial fix lands there (option-dependent)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project has a plan skeleton but no leaves yet — `docs/plan.md` carries empty horizontal/MVP/vertical sections.)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on at least two of the three sub-issues. (1) The "occurrence vs origin" terminology gap lets one team count cascade-twin re-emissions toward the always-log emission budget and another not, producing different log volumes on the same failure. (2) The pure-read MUST as written cannot be falsified by any conformance fixture, so a non-compliant implementation that re-runs ceiling-#4's depth-walk on every PIC-1 predicate read will pass the suite — wasting work and (worse) potentially producing a `loom/runtime/invoke-depth-exceeded` panic re-emission that the originating site already surfaced. (3) The mask-domain placement is least severe — it works but slows comprehension and raises the risk that a future edit to the CIO sequence drifts away from the table.

## Solution Space

**Shape:** multiple
**State:** shaped

The finding bundles three independent obligations that resolve at different sites and with different mechanics. Address them in the order below so the smaller scoping fixes (Option A, Option B) land before the placement decision in Option C, which can then assume the terminology is settled.

### Option A — Define "occurrence" and "origin"; pin the always-log/cascade-twin counting relationship

**Approach.** Add an explicit two-sentence definition pair to the opening *Runtime event channel* paragraph (or to the glossary, cross-referenced from there): an **occurrence** is a single failure event in the always-log set, identified by the dedup tuple `(kind, query_site, message, occurred_at)`; an **origin** is the originating emission site of an occurrence (the site where the `RuntimeEvent` instance is first constructed and `occurred_at` is stamped). Then rewrite the *Deduplication and lifetime rules* first bullet to state the counting rule once: an occurrence produces exactly one always-log emission at its origin; when a top-level cascade applies in prompt mode, the same `RuntimeEvent` instance is re-emitted verbatim once more at the boundary as the `details: { event }` payload of the user-facing top-level note, sharing `occurred_at` and collapsing under the dedup tuple. The "at most twice per origin" wording becomes a derived consequence ("origin emission + at most one boundary re-emission"), not an independent rule.

**Spec edits.** Two paragraphs in `runtime-event-channel.md` and a one-line addition to `glossary.md` (under either a new `occurrence (runtime event)` entry or a parenthetical on the `RuntimeEvent` entry if one exists).

**Pros.** Eliminates the apparent contradiction by giving the two phrasings a shared denotation. Makes the cascade-twin pattern derivable rather than restated. Cheap to verify by reviewer reading.

**Cons.** Adds two terms to the glossary surface that have meaning only on one page.

**Risks.** None substantive; the surrounding text already implies these definitions, so the risk is purely editorial drift if a future edit changes one site and not the other.

### Option B — Demote the unobservable PIC-1 (e) clauses; keep only the observable projection as a MUST

**Approach.** Rewrite PIC-1 clause (e) so the MUST states only the observable property: evaluating the V1 reachable predicate MUST NOT cause a second emission on the `loom-system-note` channel and MUST NOT alter any subsequent `RuntimeEvent` payload (`masked` value, `occurred_at`, dedup-tuple membership) relative to the same failure under an implementation that does not evaluate the predicate. The internal-state prohibitions (no counter advance, no bookkeeping mutation, no depth-walk re-invocation) move to a sibling *Implementation note (non-normative)* paragraph as a recommended mechanism that satisfies the MUST cheaply. The "MAY cache the two scalars" sentence stays where it is, since it is already advisory.

**Spec edits.** A single paragraph in `runtime-event-channel.md` PIC-1 (e), plus a short non-normative follow-up paragraph. No cross-page edits.

**Pros.** Makes the MUST falsifiable: a fixture that drives the same failure under two implementations and compares the emitted `RuntimeEvent` stream (including count, payload, and `masked`) is sufficient. Preserves the implementation guidance for authors who want it, without binding conformance to it.

**Cons.** A non-compliant implementation that wastes work on internal re-derivation but produces a correct event stream becomes formally conforming. (This is the standard trade for observable-only normativity and is consistent with how the rest of the spec treats implementation mechanism.)

**Risks.** A re-invoked depth-walk could in principle surface a *new* `loom/runtime/invoke-depth-exceeded` panic if the cached scalars and the re-derived ones disagree under an engine-assumption violation. The "no second emission" clause already covers this case observably; no extra wording needed.

### Option C — Leave the per-site mask-domain table in PIC-1; tighten the cross-references at both ends

**Approach.** Keep clause (c)'s five-row table in `runtime-event-channel.md` (PIC-1 is the normative owner per CIO-6, and the table is what makes that ownership concrete). At each row's CIO reference, replace bare `CIO-N` mentions with anchor links (`[CIO-3](../hard-ceilings/ceilings-3-and-4.md#cio-3)` etc.) where they are not already linked. In `ceilings-3-and-4.md`, immediately under the *Interaction between ceilings* heading, add a single-sentence forward pointer naming the PIC-1 mask-domain table by section anchor, so a reader who arrives via CIO finds the table in one hop. Do not duplicate the table; do not move it.

**Spec edits.** Anchor-link audit on the five table rows in `runtime-event-channel.md`; one forward-pointer sentence in `ceilings-3-and-4.md`.

**Pros.** Preserves the existing ownership split (already a deliberate normative-owner decision recorded in CIO-6 and the PIC-1 preamble). Minimal churn. No duplication, no risk of the table drifting out of sync with the CIO sequence — there is still one copy.

**Cons.** Does not eliminate the two-page read; only shortens the navigation. A reader still needs the CIO sequence in mind to follow the table's row-by-row reasoning.

**Risks.** None. The two pages already cross-reference each other normatively; this option just tightens the existing seams.

### Recommendation

Take all three options, in the order **A → B → C**. They are independent edits that touch overlapping paragraphs; sequencing keeps each diff small. Edge cases for the implementer:

- After Option A, the *Engine-assumption carve-out* paragraph that immediately follows the opening "exactly once per occurrence" sentence should be re-read; its phrasing already says "the exactly-once emission guarantee assumes …" and remains correct under the new definition, but verify it does not need a parallel mention of "at most twice per origin."
- Option B's observable-only MUST must still survive the *Verbatim-copy obligation* in clause (f): the boundary re-emission already MUSTs verbatim-copy `masked` and `occurred_at`, so the predicate is in fact never re-evaluated at the boundary. The Option-B rewrite should reference clause (f) so a reader sees why the observable property holds.
- Option C should not be taken as a license to inline CIO-1…CIO-6 into `runtime-event-channel.md` — that would duplicate normative material the ceilings page owns.

## Relationships

- T023 ""CIO-N rules above" and the five-site co-edit "(in this page)" point to anchors on the sibling page" - same-cluster (both reflect the cross-page entanglement of the CIO sequence; Option C's anchor-link tightening should be coordinated with that finding's fix)

---

# T118 - Recovery-mutex acquisition semantics and teardown-budget interaction undefined

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The defensive per-extension-instance recovery mutex described in `tool-registration-lifetime.md`'s `#snapshot-restore-pi-behavioural-preconditions` paragraph — and forward-referenced from `version-bump-step2.md` item (e) (`#bump-checklist-slash-dispatch-serialisation`) — specifies what it protects and how it is keyed but not its runtime semantics. Three gaps remain load-bearing: the contention disposition when a second slash dispatch arrives while the mutex is held; whether the mutex imposes an acquisition timeout (the cooperative-`await` baseline it emulates has none); and whether a queued waiter is cancelled/released during `session_shutdown` teardown so it does not extend the `SHUTDOWN_AWAIT_CAP_MS` budget that `patch-skew-degradation.md` sub-step 3 places on `disposeBarrier` settlement. Two conformant implementations diverge on observable caller order, drop-vs-await behaviour, and whether the 2000 ms teardown budget can be exhausted by a queued waiter. The defect is latent at loom 1.0 (the mutex ships only on a Pi-minor fail outcome) but engages on the first such regression.

## Solution approach

Clarify the mutex's runtime contract in the `#snapshot-restore-pi-behavioural-preconditions` paragraph: acquisition is a strictly serialising FIFO await, with no acquisition timeout on the steady-state path. State that the teardown interaction is observed rather than newly bounded — sub-step 2's `loomAbort.abort()` cancels the holder, whose `finally` runs the step-4 restore and releases the mutex, and a queued waiter then acquires, observes the already-aborted `loomAbort.signal` at its first checkpoint, and falls through its own `finally`; sub-step 3's `SHUTDOWN_AWAIT_CAP_MS` await already bounds total teardown wall-time across all waiters, so the mutex adds no second budget. Have `version-bump-step2.md` item (e) forward-reference this contract rather than restate it.

## Solution constraints

- Out of scope: item (e)'s fail-predicate prose in `version-bump-step2.md` (owned by T057); this finding edits item (e) only to add the forward-reference to the mutex contract.

## Relationships

- T057 "Item (e) fail predicate: operator-precedence ambiguity, single-sentence packing, and sub-outcomes buried mid-prose" — same-cluster (touches the same item (e) prose but resolves independently).
# T119 - Teardown-side throw on the Ok path: does it promote success to failure?

**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

PIC-9 *Subagent session lifecycle* in `pi-integration-contract/subagent.md` (anchor `pic-9`) pins the disposition of two teardown-side throws — `AgentSession.dispose()` throwing inside the per-invocation `finally`, and the cancellation listener's synchronous `session.abort()` throwing — only by reference to the "original error that triggered teardown" not being masked. But normal return (the loom's tail expression resolving to `Ok`) is the first listed disposal trigger, and on that path there is no original `Err` or panic for the no-mask clause to protect. The spec therefore never states what the parent observes when a teardown throw lands on top of an `Ok`, leaving two conformant readings — log-only (preserve the `Ok`) versus promote-to-failure (`Err` replaces the value) — that diverge observably at the slash-command, `tools:`, and `invoke(...)` surfaces. The `loom/runtime/subagent-dispose-failure` and `loom/runtime/internal-error` rows in `diagnostics/code-registry-runtime.md` repeat the same Ok-silent framing.

## Solution approach

Make PIC-9's no-mask rule bidirectional: on every disposal trigger including normal return, a throw from `AgentSession.dispose()` or from the listener's synchronous `session.abort()` is log-only and does not alter the invocation result. Rewrite PIC-9's `dispose()`-throws and `abort()`-throws sentences to state the Ok-path outcome explicitly — the parent still observes the loom's `Ok` final value and the diagnostic is advisory. Rewrite the `loom/runtime/subagent-dispose-failure` and `loom/runtime/internal-error` rows in `diagnostics/code-registry-runtime.md` to the same "does not alter the invocation result" framing so the registry and PIC-9 read in lock-step.

## Solution constraints

- Out of scope: late rejection of the discarded `abort()` Promise — it remains governed by Cancellation's swallowing-handler rule, not by this clause.
- Out of scope: `loom/runtime/registry-swap-failed`, `cancelled-by-session-shutdown`, and other teardown-adjacent codes; this rule covers only the two PIC-9 teardown sites named above.

## Relationships

- T041 "Shard-10 hidden assumptions and editorial cruft on the host-prerequisites / host-interfaces-core / host-interfaces-services / registration-steps page set" - same-cluster (pins the upstream Pi-side `abort()`/`dispose()` behaviour this rule depends on; resolved independently in `host-interfaces-core.md`).
# T120 - Trust-boundary "no per-extension privilege facet" claim cites a drift-detector that cannot detect the drift

**Original heading:** Security-posture claim "Pi exposes no per-extension privilege facet" rests on a drift-detector that does not enumerate Pi's full surface
**Original section:** docs/spec/overview-and-orientation.md, docs/spec/language-and-architecture.md, docs/spec/session-model-and-appendix.md, docs/spec_topics/overview.md, glossary.md (orientation / aggregators)
**Kind:** assumptions
**Importance:** blocker
**Score:** 200
**Must-fix:** true

## Finding

The Trust-boundary NFR bullet in `overview-and-orientation.md` makes two coupled claims: (1) Pi's `ExtensionAPI` / `ExtensionContext` surfaces "expose no per-extension privilege facet" and "Pi exposes no per-extension privilege scoping the runtime can rely on as a security boundary"; (2) "A future Pi minor that adds such a facet would surface at the build-time SDK surface-inventory assertion run by [Pi version bump procedure] before the spec contract drifts." The second claim names the loom 1.0 mechanical safety-net for the first.

The cited safety-net does not exist. The build-time SDK surface inventory has two arms and neither catches a new privilege facet:

- The *positive-direction* literal-read assertion (`inventory-audit-intro.md`, `version-bump-step2.md` step 2(a)) checks the constant `CAPABILITY_OBLIGATIONS.length === 7` and the presence of the seven named capabilities. It does not enumerate `ExtensionAPI`'s typed member surface, so a Pi minor adding a new `pi.setExtensionPrivileges(...)`-shaped member leaves the count unchanged and the assertion green.
- The *negative-direction* inventory-closure audit (`inventory-audit-intro.md`, `audit-target-categories.md`, `audit-resolution.md`) is a closure check over the *audited source tree*: it walks `src/**/*.ts`, detects category-(1) `pi.<member>` accesses, category-(2) named imports, and category-(3) `ctx.<member>` accesses that the runtime makes, and asserts each resolves to an inventory entry or an `// allow-pi-surface:` exemption. By construction it cannot fire on a Pi-side member the runtime does not reference. `inventory-audit-intro.md` itself acknowledges the closure direction: "every Pi-side surface reference in the *audited source tree* … resolves to an `SDK_SURFACE_INVENTORY` entry."

The parallel "No concurrent user sessions in the same host process" non-goal in `model-changes-and-non-goals.md` line 30 already states the honest shape of this kind of claim: "this is a presupposition rather than a claim that the runtime has audited Pi's full extension API surface and confirmed the absence of any concurrent-sessions facet, and concurrent-session detection is not part of the Step 0 capability probe," and routes detection to the editorial-review checklist in `version-bump-step2.md`. The Trust-boundary bullet is the structural twin of that paragraph but presents itself as audit-backed rather than presupposition-based, and the loom 1.0 security posture rests on the difference.

## Spec Documents

- `docs/spec/overview-and-orientation.md` — Non-functional requirements → Trust boundary bullet (edited)
- `docs/spec_topics/future-considerations/model-changes-and-non-goals.md` — "No per-loom sandbox or capability model" bullet (edited; the recorded-at sibling needs the same reframe as the orientation bullet so the two stay in lock-step)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — Editorial-review checklist items (a)–(ad) (option-dependent: edited under option A to add a new privilege-facet item; untouched under option B)
- `docs/spec_topics/pi-integration-contract/inventory-audit-intro.md` — Inventory-closure audit / positive-direction literal-read assertion (read-only under option A; option-dependent edited under option B to add an ExtensionAPI member-set assertion)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — Step 2(a) positive-direction surface-inventory assertion section (option-dependent: edited under option B to add the new typed-member-set check)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

## Consequence

**Severity:** correctness

A reader of the Trust-boundary bullet — including an implementer choosing not to add a sandbox layer because Pi's surface is asserted clean and a future drift is asserted caught — concludes the loom 1.0 security posture has a mechanical safety-net it does not have. A Pi minor introducing a privilege-scoping member would land green through the version-bump procedure as currently written, the spec contract would silently drift, and the loom runtime would continue operating at full host-process privilege under the (now-false) premise that Pi has not exposed a finer-grained boundary the runtime could honour.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Honest-presupposition reframe (parallel to the concurrent-sessions non-goal)

- **Approach.** Rewrite the Trust-boundary bullet's "expose no per-extension privilege facet" / "would surface at the build-time SDK surface-inventory assertion" sentences as a presupposition, matching the prose shape of `model-changes-and-non-goals.md` line 30. State explicitly that the runtime has *not* audited Pi's full `ExtensionAPI` surface, that the absence of per-extension privilege scoping is a presupposition on the pinned Pi minor, and that detection of a future privilege facet is routed to the per-bump editorial-review checklist rather than to any mechanical gate.
- **Spec edits.**
  1. `overview-and-orientation.md` Trust-boundary bullet: replace the "Pi … expose no per-extension privilege facet, and … exposes no per-extension privilege scoping the runtime can rely on as a security boundary. A future Pi minor that adds such a facet would surface at the build-time SDK surface-inventory assertion" prose with a presupposition-shaped sentence and a forward link to the new checklist item.
  2. `model-changes-and-non-goals.md` "No per-loom sandbox or capability model" bullet: extend its `Recorded at:` block to point at the same checklist item, mirroring the concurrent-sessions bullet's recorded-at structure.
  3. `version-bump-step2.md`: add a new SHOULD-level checklist item — call it (ae) or the next available letter — *Per-extension privilege-scoping facet*. Body parallels item (f) and item (n): re-read the candidate `@earendil-works/pi-coding-agent` minor's `ExtensionAPI` and `ExtensionContext` declarations against the loom 1.0 pin and confirm no new privilege-scoping member has appeared. Same SHOULD-level escalation clause as the sibling items.
- **Pros.** Zero new mechanical surface; no implementation-side work; consistent with the existing presupposition pattern; one-line bump-procedure addition.
- **Cons.** Detection remains contributor-discipline, on the same fragility footing as items (f)–(ad). A bump that skips the editorial audit ships drift silently.
- **Risks.** Low. The contributor-side risk is the same risk the existing 26 SHOULD-level items already accept.

### Option B — Add a typed ExtensionAPI member-set assertion

- **Approach.** Promote the claim from contributor-discipline to a mechanical build-time gate by extending the positive-direction surface-inventory assertion to enumerate the *full* set of `ExtensionAPI` members against a pinned-constants block. A new member appearing on `ExtensionAPI` between the pinned set and the installed Pi minor fails the assertion.
- **Spec edits.**
  1. `inventory-audit-intro.md`: add a new assertion alongside `CAPABILITY_OBLIGATIONS.length === 7` that pins the full `ExtensionAPI` (and `ExtensionContext`) member-name set as a constant the assertion compares against. State that the assertion's purpose is to detect any new member, not only privilege-scoping members, so the contract is principled rather than ad-hoc.
  2. `version-bump-step2.md` step 2(a): document the new assertion's failure mode and the contributor recovery (either widen the pinned set after editorial review confirms the new member is non-privilege-bearing, or rewrite the runtime to honour the new privilege boundary if it is).
  3. `overview-and-orientation.md` Trust-boundary bullet: keep the existing "would surface at the build-time SDK surface-inventory assertion" wording (now true) but adjust the citation anchor to the new assertion rather than to the existing seven-capability check.
- **Pros.** Mechanical detection of any new `ExtensionAPI` member at bump time, not only privilege-bearing ones; the Trust-boundary claim becomes audit-backed.
- **Cons.** Two new pinned-constants blocks the bump procedure must update on every Pi minor that touches `ExtensionAPI` for any reason (not just privilege-scoping); contributor friction proportional to Pi's surface-evolution rate; the assertion catches false positives (any benign new member) the contributor must clear.
- **Risks.** The pinned member-set goes stale on every minor that adds an unrelated member, making it bump-procedure churn. The implementation choice between snapshotting type-declarations vs. a runtime `Reflect.ownKeys` walk has its own subtleties (`ExtensionAPI` is a typed interface; a runtime walk against the loaded host object may diverge from the typed surface).

### Recommendation

Option A. The Trust-boundary claim is structurally a presupposition about Pi's current API; the spec already has a worked pattern for exactly this shape of claim (the concurrent-sessions non-goal and its routed editorial-review item) and 26 SHOULD-level checklist items that consume the same contributor-discipline detection mechanism. The marginal value of Option B's mechanical detection is low against the marginal cost of pinning and re-pinning the full `ExtensionAPI` member-set on every Pi minor that touches it for unrelated reasons. Edge cases for the implementer: (1) the recorded-at block in `model-changes-and-non-goals.md` MUST be updated in the same edit so the cross-link to the new checklist item is bidirectional; (2) the new checklist item's SHOULD→MUST escalation clause should match item (f)'s wording verbatim, since both are gated on Pi exposing a typed contract that step 2(a)'s probe can mechanically verify; (3) the Trust-boundary bullet's "Pi exposes no per-extension privilege scoping the runtime can rely on as a security boundary" sentence carries through unchanged — only the *detection* claim is being reframed, not the *substantive* claim.

## Relationships

- T068 "Operator-always-present invariant asserted without a Pi-side guarantee" - same-cluster (sibling NFR/orientation claim that asserts a Pi-side guarantee without a verified Pi-side citation; resolves independently but with the same prose pattern)
