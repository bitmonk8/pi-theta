# Triaged Spec Review — spec.md

_Generated: 2026-05-07T17:37:47Z_
_Spec: spec.md_
_Process: bottom-up — the last finding (T28) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 high, 3 medium retained; 10 low discarded; 0 low findings merged into 0 medium findings; 19 nit dropped; 0 false dropped._

---

# T01 — Pre-Orientation prose: missing section heading, missing anchors, broken self-reference, and forward-link drift

**Original heading:** No section heading, no anchors, inline normative definitions, pre-evaluation list unfulfilled
**Original section:** spec.md — Pre-Orientation / Opening paragraphs
**Kind:** traceability, placement, error-model, completeness, consistency
**Importance:** medium
## Finding

The three paragraphs between the H1 (`# pi-loom — Extension Specification`) and the first second-level heading (`## Orientation`) carry the spec's executive framing: mode selection, the success / fail / cancelled trichotomy, the partial-append contract, the pre-evaluation-vs-evaluation boundary rule, the per-ceiling routing claim, the cancellation-signal source, and the `.loom` / `.warp` file-extension grammar. None of this prose lives under a named section, and no paragraph (or bold-italic label such as *Session model.*) carries an `<a id="…">` anchor. Other spec pages and downstream tests have no stable target to cite when they need to refer to material that is, in practice, the spec's introduction.

The paragraph that begins "Loom evaluation produces one of three terminal outcomes" contains an internal cross-reference — `(see ceiling #3 in *Hard ceilings* and the pre-evaluation failure list later in this paragraph)` — that promises a list that the paragraph never delivers. The only further sentence in that paragraph is a single forward-link to `errors-and-results.md#terminal-outcomes`. A reader who follows the self-reference looking for an enumeration will find none. The plan corpus already names this prose ("`spec.md`'s introduction (the prose between the H1 title and the `## Orientation` header)" — see H6's link-rewrite gate), confirming that the absence of a heading is felt elsewhere in the corpus, not just in the prose itself.

Per [`governance.md` GOV-12](spec_topics/governance.md), `spec.md` is informative orientation and every obligation it appears to state is owned by a forward-linked topic page. The introduction's restatements (the trichotomy, the partial-append contract, the pre-evaluation boundary rule, the per-ceiling routing claim) therefore are not normatively load-bearing — but GOV-12 also commits the spec to maintain the aggregator paragraphs in lock-step with their source pages, and the lack of anchors makes every such restatement a free-floating piece of prose that can drift from its owning page without any specific target a reviewer or tooling gate can pin down. The combined effect is navigational: an unanchored, unnamed introduction with one self-reference that resolves to nothing.

## Spec Documents

- `spec.md` — Pre-Orientation prose (paragraphs between H1 and `## Orientation`) (edited)
- `spec_topics/governance.md` — GOV-12 *(`spec.md` aggregator paragraphs are informative)* (read-only — establishes that the introduction's restatements are aggregator orientation, not duplicate normative text)
- `spec_topics/errors-and-results.md` — Terminal outcomes / pre-evaluation failures owner page (read-only — replacement target for the broken self-reference)

## Plan Impact

**Phases:** Horizontal H6

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)

H6 already rewrites every cross-link in "`spec.md`'s introduction (the prose between the H1 title and the `## Orientation` header)" to retarget non-narrative pages at their per-rule `#prefix-n` anchors, and its closing gate greps that same span. If a `## Overview` heading is inserted ahead of the introduction prose, H6's gate prose ("between the H1 title and the `## Orientation` header") must be amended to reflect the new boundary (between the H1 title and the `## Orientation` header *with* the new `## Overview` section in scope). Adding `<a id>` anchors inside the introduction does not affect H6's gate; it only adds new link-targets that other pages may use.

## Consequence

**Severity:** advisory

Other spec pages and tests cannot deep-link into the introduction; cross-page references must use prose paraphrase rather than a stable anchor. The "pre-evaluation failure list later in this paragraph" self-reference resolves to nothing, leaving a reader who follows it briefly stranded. None of this blocks implementation — by GOV-12 the prose is informative — but it degrades the navigational and traceability properties the rest of the corpus relies on.

## Solution Space

**Shape:** single

### Recommendation

Apply three edits to the pre-orientation prose:

1. **Insert a section heading.** Add `## Overview` (with `<a id="overview"></a>` immediately above it, per the GOV-1 dual-form convention used elsewhere in the corpus) directly after the H1, so the introduction prose lives under a named, anchored section. Keep the prose itself unchanged in placement.

2. **Anchor the load-bearing labels inside the introduction.** Add `<a id="…">` markers immediately before the bold-italic labels and structurally significant sentences that downstream pages or tests are likely to cite — at minimum: `<a id="terminal-outcomes-aggregator"></a>` before "Loom evaluation produces one of three terminal outcomes", `<a id="file-extension-grammar"></a>` before "A loom is stored in one of two file extensions", and `<a id="session-model"></a>` before the *Session model.* paragraph (this third anchor is also called for by the related "Session model paragraph has no stable HTML anchor" finding and should be made in the same edit). Anchor names use the same kebab-case convention as the existing `hard-runtime-ceilings` anchor.

3. **Repair the broken self-reference.** Replace the parenthetical `(see ceiling #3 in *Hard ceilings* and the pre-evaluation failure list later in this paragraph)` with `(see ceiling #3 in [Hard ceilings](#hard-runtime-ceilings) and [Errors and Results — Terminal outcomes](./spec_topics/errors-and-results.md#terminal-outcomes) for the closed pre-evaluation failure enumeration)`. Do not inline the list in `spec.md`: the aggregator-vs-source lock-step rule (GOV-12) and the H6 gate that bars introduction links from targeting non-prefix anchors on non-narrative pages both prefer a forward-link to a per-rule anchor over a duplicated enumeration. After H6 lands, retarget the `errors-and-results.md` link at the most specific `EAR-N` (or equivalent) REQ-ID anchor for the pre-evaluation enumeration rule.

Edge cases the implementer must watch:

- The H6 gate prose ("between the H1 title and the `## Orientation` header") must be amended to include the new `## Overview` section, or the gate's grep window must be widened to "between the H1 title and the `## Orientation` header (inclusive of any intervening section headings)". Pick whichever the gate's actual implementation supports.
- The new anchors must use the GOV-1 HTML form (`<a id="…"></a>`) rather than ATX-heading auto-slugs, because they sit on prose paragraphs and bold-italic labels, not on headings.
- Do not re-introduce a numbered list inside the parenthetical; that would re-create the aggregator-vs-source drift risk GOV-12 calls out.

## Relationships

- T21 "Hard ceilings block does load-bearing definitional work inside informative orientation" — same-cluster (if the Hard ceilings block is extracted into its own top-level section, the `#hard-runtime-ceilings` anchor target in recommendation step 3 must be updated to follow it)

---

# T02 — Surface-extension seam obligations are not consistently marked on the topic pages they live on

**Original heading:** 14 "surface extension" seam obligations not tracked in normative pages
**Original section:** spec_topics/future-considerations.md
**Kind:** scope
**Importance:** medium
## Finding

The "Surface extensions (V1 leaves a seam)" section of `spec_topics/future-considerations.md` enumerates 18 deferred items (not 14), and its preamble promises that "the seams themselves live on the topic pages that own each surface; this page enumerates only what V1 chose not to do, and where to read the seam contract." The promise is honoured unevenly:

- Nine items have an explicit `> **V1 seam — <name>.**` blockquote callout on the owning topic page that pins the V1 obligation with MUST language: per-call timeouts (three callouts in `query.md`, `tool-calls.md`, `invocation.md`), typed-query supported provider set (`pi-integration-contract.md`), per-query overrides (folded into the per-call-timeout callout in `query.md`), automatic context escalation (`binder.md`), binder refinement loop (`binder.md`), named-argument invocation (`invocation.md`), mid-loom user-session replacement (`pi-integration-contract.md`), Pi-owned subagents collision source set (`pi-integration-contract.md`), and symlink-resolution hardening (`invocation.md`).
- Four items rely on flowing prose at the anchored section that names the seam without the `> **V1 seam — ...**` marker: user-defined error types and `BinderError`-as-`QueryError` (both ride the "Discriminator type-openness" paragraph in `errors-and-results.md`), richer `system:` expression sublanguage (the "Parser entry point" paragraph in `frontmatter.md` mentions "the seam is what allows…"), and package/project-rooted import paths (the "Resolver interface" paragraph in `imports.md` mentions a "single named seam"). A reader scanning a topic page for the regular V1-seam blockquote marker will not match these.
- Five items have no topic-page seam contract at all. `binder_temperature` and the user-overridable binder system prompt are anchored at the generic "Unknown-key policy" in `frontmatter.md` — that policy provides forward tolerance for any unrecognised key and names no specific deferred field; the binder-system-prompt bullet in `future-considerations.md` even admits "the deferred extension also needs an injection point in the binder for an author-supplied prompt template; that injection point does not exist in V1." The `looms.toolLoopMaxRounds` operator-level override is anchored at `frontmatter.md`'s `tool_loop` field, which has no seam callout. The `argumentHint` and Pi-owned-subagents items are upstream Pi-API dependencies that only need a V1 carrier if Pi extends its surface (these overlap with the separate "Pi-owned upstream items" finding).
- Pre-flight token-count check is anchored at `query.md` "Detection of `ContextOverflowError`", which mentions `tokens_used` / `tokens_limit` nullability and forward-links Future Considerations but never establishes a `> **V1 seam — pre-flight token estimate.**` obligation; the seam consists entirely of "those two fields are nullable today."

Separately, `spec.md`'s Scope subsection enumerates four cross-cutting V1 dispositions and forward-links Future Considerations for the "Known V1 limitations" bucket, but never names the count or existence of the Surface-extensions bucket. A reader of `spec.md` alone has no signal that V1 carries a fixed inventory of forward-compatibility obligations that future-feature work depends on.

## Spec Documents

- `spec.md` — Scope subsection (edited)
- `spec_topics/future-considerations.md` — Surface extensions (V1 leaves a seam) (edited)
- `spec_topics/errors-and-results.md` — Discriminator type-openness (edited)
- `spec_topics/frontmatter.md` — Parser entry point, Unknown-key policy, `tool_loop` field, prose on `argument-hint` (edited)
- `spec_topics/imports.md` — Resolver interface (edited)
- `spec_topics/query.md` — Detection of `ContextOverflowError`, Options surface (read-only — already carries the per-call-timeout callout)
- `spec_topics/binder.md` — V1 seam callouts (read-only — already carry MUST language)
- `spec_topics/invocation.md` — V1 seam callouts (read-only — already carry MUST language)
- `spec_topics/tool-calls.md` — V1 seam callouts (read-only — already carry MUST language)
- `spec_topics/pi-integration-contract.md` — V1 seam callouts (read-only — already carry MUST language)
- `spec_topics/governance.md` — GOV-12 aggregator-vs-source convention (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The plan keys its leaves on topic-page sections (`Spec.` fields cite specific topic-page anchors), and the Surface-extensions inventory is informative-with-forward-links — none of the V20-series leaves carry an acceptance criterion that would change if a missing seam callout were added or if `spec.md` gained a count. The `coverage-matrix.md` row for Future Considerations explicitly tags it `– (out of scope)` for plan coverage. The fix is a documentation pass under GOV-12's aggregator-vs-source convention; no leaf is blocked or modified.

## Consequence

**Severity:** advisory

The nine items with explicit V1-seam blockquotes are well-protected against accidental "simplification" by an implementer who reads only the topic page. The other nine rely on prose, generic policy, or external dependency framing, which raises the risk that a topic-page-only reader (typical during V1 implementation, since `future-considerations.md` is a non-implementation page) will not recognise the seam contract — e.g. tightening `QueryError.kind` from `string` to a closed enum, omitting the `style` discriminator from invocation AST nodes that today aren't stress-tested, or open-coding the resolver as a relative-path computation. The risk is mitigated by GOV-12's lock-step convention but the convention has nothing to lock onto when the topic page carries no seam marker. The summary-count gap in `spec.md` is purely organisational.

## Solution Space

**Shape:** single

### Recommendation

Apply a one-pass alignment with three parts.

1. **Add a `> **V1 seam — <name>.**` blockquote callout** on each owning topic-page section for the four items currently carried only in prose (user-defined error types and `BinderError`-as-`QueryError` both ride a single new callout under "Discriminator type-openness" in `errors-and-results.md`; richer `system:` expression sublanguage gets one in `frontmatter.md` under "Parser entry point"; package/project-rooted import paths get one in `imports.md` under "Resolver interface") and for the pre-flight token-count item in `query.md` under "Detection of `ContextOverflowError`". Each callout follows the same shape the existing nine use: a one-sentence MUST that names the V1 invariant the future extension depends on, plus a forward link back to the corresponding bullet in `future-considerations.md`.

2. **For the five items that have no genuine V1 seam — `binder_temperature`, user-overridable binder system prompt, `looms.toolLoopMaxRounds`, `argumentHint`, Pi-owned subagents** (the last two coordinate with the separate "Pi-owned upstream items bundled as pi-loom future work" finding) — split the Surface-extensions bucket so these items move to a clearly-marked sub-bucket whose preamble states the pattern (e.g. "Items below ride the frontmatter unknown-key policy as their forward-compatibility carrier; no dedicated topic-page seam exists") or, for the upstream-Pi pair, are delegated to the external-dependency tracker per the related finding's recommendation. The Surface-extensions section after this split contains only items with a topic-page seam contract.

3. **Add one informative bullet to `spec.md`'s Scope subsection** of the form: "Forward-compatibility seams. V1 reserves N typed/structural seams in the runtime to enable a fixed set of deferred extensions; the inventory and per-seam contracts are owned by [Future Considerations — Surface extensions](./spec_topics/future-considerations.md#surface-extensions-v1-leaves-a-seam)." The N value is the post-split count (likely 13). Per GOV-12, this aggregator bullet and the source list move in lock-step.

Edge cases:

- The N count after the split must match the post-split bullet count exactly; if a future revision adds or removes a Surface-extensions item, both the topic-page callout and the `spec.md` bullet must update in the same change. GOV-12's lock-step rule already covers this once both surfaces exist.
- The pre-flight token-count seam is unusual: it is *not* a runtime-internal options-record open struct nor a discriminator-openness; it is a nullability contract on two existing fields. The callout text needs to spell out that the seam is the `tokens_used`/`tokens_limit` `null`-permitted state, not a hidden runtime hook.
- The "Discriminator type-openness" section in `errors-and-results.md` carries one paragraph that supports two future items (user-defined error types and `BinderError`-as-`QueryError`). One V1 seam callout suffices for both — duplicate callouts would over-anchor.

## Relationships

None

---

# T03 — "High-privilege callable" qualifier is undefined and conceals a universal rule

**Original heading:** "High-privilege callable" undefined; universal rule obscured
**Original section:** spec.md — Orientation > Scope > Trust boundary
**Kind:** clarity
**Importance:** medium
## Finding

The Trust boundary bullet in `spec.md` (Orientation > Scope) reads "A loom that declares a **high-privilege callable** (e.g. `bash`) exposes the full underlying capability of that callable to its model." The bolded term **high-privilege callable** appears exactly once in the entire spec corpus and is defined nowhere — there is no glossary entry, no anchor, no enumeration, and no classification rule that an implementer can use to decide whether a given callable is "high-privilege" or not.

This leaves a reader with two incompatible readings. Reading A: the rule is conditional and applies only to a privileged subset, in which case the spec owes a classifier (and presumably some enforcement around the lower-privilege complement). Reading B: the rule is universal — *every* declared callable exposes its full underlying capability, because the runtime interposes no privilege layer per [Pi Integration Contract — No additional access channels](./spec_topics/pi-integration-contract.md#no-extra-mediation), and `bash` is just a salient example. The surrounding text and the cross-referenced PIC clause make Reading B the intended meaning, but the bolded qualifier actively pushes a reader toward Reading A.

The same paragraph already states the universal premise — the runtime "interposes no additional access channels (sandbox, capability filter, mediated proxy)" and the `tools:` allowlist "is NOT a host-process sandbox" — so the conditional phrasing is not just unclear, it is internally inconsistent with the page's own thesis.

## Spec Documents

- `spec.md` — Orientation > Scope > Trust boundary (edited)
- `spec_topics/pi-integration-contract.md` — No additional access channels (read-only)
- `spec_topics/future-considerations.md` — No per-loom sandbox or capability model (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

## Consequence

**Severity:** advisory

An implementer scanning the trust boundary bullet may conclude that a privilege classifier is owed somewhere downstream and either invent one (introducing divergence) or stall waiting for it. The runtime contract itself is unaffected — the per-mode wiring rule in PIC is precise — but the spec's own statement of why callable declaration matters becomes unreliable as an authoritative reference.

## Solution Space

**Shape:** single

### Recommendation

Drop the "high-privilege" qualifier and restate the rule universally. Replace the existing sentence:

> A loom that declares a high-privilege callable (e.g. `bash`) exposes the full underlying capability of that callable to its model.

with:

> Any callable a loom declares exposes the full underlying capability of that callable to the loom's model; the runtime applies no privilege classification or filtering. `bash` and `read` are illustrative — the rule does not depend on a callable being deemed "privileged."

Edge cases for the implementer:

- Do not introduce a glossary entry for "high-privilege callable"; the term is being retired, not defined.
- The companion paragraph on `tools:` already establishes that the allowlist scopes the *model's reachable* set, not host-process privilege. The replacement sentence must remain consistent with that — it speaks to *capability exposure once a callable is declared*, not to whether a callable is reachable at all.
- If a future privilege model is ever introduced, it lands as a major-version migration per the existing future-considerations entry; this rewording does not foreclose that path because it makes no claim about V2+.

## Relationships

None
