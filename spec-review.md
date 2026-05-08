# Triaged Spec Review — spec.md

_Generated: 2026-05-07T17:37:47Z_
_Spec: spec.md_
_Process: bottom-up — the last finding (T28) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 high, 8 medium retained; 10 low discarded; 0 low findings merged into 0 medium findings; 19 nit dropped; 0 false dropped._

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

---

# T04 — Session-model paragraph: uncited Pi event shape and ambiguous "may close watchers" wording

**Original heading:** `session_shutdown` event: shape and property-access contract uncited; ambiguous teardown wording
**Original section:** spec.md — Orientation > Prerequisites > Session model
**Kind:** assumptions, clarity
**Importance:** medium
## Finding

The Session-model paragraph in `spec.md` (Orientation > Prerequisites) asserts four things about Pi as plain fact with no citation: the event name `session_shutdown`, the payload path `event.reason`, the closed reason set `"quit" | "reload" | "new" | "resume" | "fork"`, and the unknown-reason routing that exists specifically because property access on `event.reason` may throw. Each of these is a load-bearing input to the runtime's teardown contract; with no anchor into a Pi type or doc, a future SDK pin bump cannot be diff-audited against the spec, and a reader cannot tell which claims are observed from Pi versus designed by loom.

The same paragraph contains the sentence "the V1 acceptance that it **may** close watchers on a reason that did not in fact tear down the extension." `may` reads three ways: (a) "is permitted to" (a normative permission), (b) "could happen that" (a descriptive observation about an inevitable side-effect), or (c) "is allowed but not required" (an implementation discretion). The intended reading — confirmed by the corresponding paragraph in `pi-integration-contract.md` ("the handler treats every reason identically, since a no-teardown reason makes the sequence a fast-path no-op") — is that the handler always closes watchers regardless of reason, and the V1 position is that the resulting wasted close on a non-teardown reason is acceptable. The current wording does not convey that.

## Spec Documents

- `spec.md` — Orientation > Prerequisites > Session model paragraph (edited)
- `spec_topics/pi-integration-contract.md` — Extension entry point, step 4, including the "Unknown-reason rule", the fixed five-sub-step sequence, and the "Edge cases the handler must observe" bullet that contains the parallel "V1 acceptance" sentence (edited)
- Pi SDK type declaration shipped with `@mariozechner/pi-coding-agent` (`dist/core/extensions/types.d.ts`, `SessionShutdownEvent` interface) — read-only

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the fix is a citation insertion plus a wording rewrite in spec prose. No leaf's **Tests** or **Ships when** condition changes; no leaf is blocked or unblocked. The absence of a teardown-handler leaf is a separate finding (`Plan corpus has no leaf for session_shutdown handler / ActiveInvocationRegistry teardown`) and is not resolved here.

## Consequence

**Severity:** advisory

A future Pi SDK release that adds, renames, or removes a reason member silently desynchronises the spec; without a citation, the spec audit cannot be mechanised against `dist/core/extensions/types.d.ts`. The ambiguous "may" sentence is unlikely to mislead an implementer who reads PIC step 4 alongside it (PIC pins the unconditional sequence), but a spec-only reader can plausibly conclude that closing watchers is optional on `"new" | "resume" | "fork"`, which contradicts the normative fixed-order sequence.

## Solution Space

**Shape:** single

### Recommendation

Edit the Session-model paragraph in `spec.md` to do two things:

1. **Cite the SDK type for the event shape.** Add a parenthetical citation to `SessionShutdownEvent` in `dist/core/extensions/types.d.ts` (line 418 in the V1-pinned `@mariozechner/pi-coding-agent` build, verified to declare `reason: "quit" | "reload" | "new" | "resume" | "fork"` on a `type: "session_shutdown"` interface). Phrase the citation so it survives a line-number drift — name the interface, not the line — e.g. "Pi fires `session_shutdown` (`SessionShutdownEvent` in `@mariozechner/pi-coding-agent`'s `dist/core/extensions/types.d.ts`) with `event.reason: "quit" | "reload" | "new" | "resume" | "fork"`." The same citation covers the closed set and the payload path; the property-access-throws accommodation is owned by PIC's "Unknown-reason rule" and only needs a forward-link from `spec.md`, not a separate SDK citation (it is a loom-side defence, not a Pi guarantee).

2. **Replace the ambiguous "may close watchers" sentence** with a declarative statement that matches PIC's fixed-order sequence. Suggested wording: "Pi may fire `session_shutdown` for reasons (e.g. `"fork"`) that do not tear down the extension process; the runtime's handler runs the full fixed teardown sequence — including watcher closure — for every reason in the closed set, and the V1 position accepts that watchers may be closed on a reason that did not in fact tear the extension down (recovery is one `/reload` away)." Apply the same rewrite to PIC step 4's "Edge cases" bullet so the two paragraphs stay byte-aligned on the contract they share.

Edge cases the rewrite must preserve:

- The unknown-reason path (reason outside the closed set, or property access throwing) MUST still route through the full sequence — PIC already pins this and the spec.md sentence must not contradict it.
- The "fast-path no-op" framing in PIC ("a no-teardown reason makes the sequence a fast-path no-op (no active invocations exist at session boundaries because Pi serialises turns)") is about the abort-and-await sub-steps being trivially empty, not about watcher closure being skipped. The rewritten sentence must not be readable as license to skip sub-step 4.

## Relationships

- T16 "Pi API surfaces asserted without `.d.ts` citations: setActiveTools, createAgentSession, ExtensionCommandContext, AgentSession, tool-result envelope" — co-resolve (a single citation pass over the Pi-SDK-fact surfaces in `spec.md` resolves both)
- T24 "`details.event.reason` coercion is unspecified for non-string Pi values" — same-cluster (the property-access-throws path this finding flags as uncited; that finding closes the sentinel value)
- T25 "Session-shutdown teardown: `console.error` is the unguarded last resort, but no rule says emission MUST NOT propagate" — same-cluster (same teardown handler, separate axis: diagnostic emission contract)
- T26 "Teardown sub-steps 1, 4, and 5 lack a per-step isolation rule" — same-cluster (same handler, separate axis: per-step error containment)
- T28 "`session_shutdown` teardown contract has no plan-leaf owner" — same-cluster (touches the same handler; resolved separately by adding a plan leaf, not by editing spec prose)

---

# T05 — Mid-stream cancellation: no observable rule for loom-runtime conversation behaviour

**Original heading:** Mid-stream partial-append: no observable criterion for loom conformance
**Original section:** spec_topics/errors-and-results.md + spec_topics/slash-invocation.md
**Kind:** testability
**Importance:** medium
## Finding

`errors-and-results.md` (Partial-append contract) explicitly excludes mid-stream cancellation from the contract:

> a turn that streams to the user but whose stream is interrupted by cancellation before the query's `Ok` materialises is NOT a partial-append-contract obligation — the conversation may carry the partial fragment per Pi's session semantics, but loom's per-turn finality applies only at the granularity defined here.

`slash-invocation.md` (User-visible streaming) covers only the *visual* surface:

> Cancellation mid-stream: whatever partial text Pi has already rendered remains visible; partial output is not rolled back. The cancellation system note is appended after the partial prefix.

Both passages are scoped to what the *user* sees in the transcript. Neither says what *the next loom-issued query in the same prompt-mode loom* observes when it inspects conversation history (or, equivalently, what shape the next turn's request will carry to the model). The carve-out "loom's per-turn finality applies only at the granularity defined here" leaves a vacuum: a runtime that proactively truncated or rewrote the partial assistant text before issuing the next query would violate no stated rule.

The implicit intent — "the runtime defers to whatever Pi committed; it must not mutate" — is consistent with the `## No rollback` paragraph immediately below in `errors-and-results.md`, but it is never stated as a normative constraint on the loom runtime, and there is no observable assertion a conformance test can make. The cancellation surfacing leaves (V18a–V18e) all assert the abort signal's *Result-typed surface* (`Err({kind:"cancelled"})`), not the post-cancel conversation state visible to a follow-up `@`-query within the same prompt-mode loom.

## Spec Documents

- `spec_topics/errors-and-results.md` — Partial-append contract (edited)
- `spec_topics/slash-invocation.md` — User-visible streaming (edited)
- `spec_topics/cancellation.md` — Surfacing (read-only)
- `spec_topics/pi-integration-contract.md` — Conversation drive (read-only)

## Plan Impact

**Phases:** V5, V18

**Leaves (implementation order):**

- V5e — Prompt-mode conversation driver — (modified)
- V18b — `AbortSignal` before every `@` query — (modified)

## Consequence

**Severity:** advisory

Two reasonable implementers can satisfy V18b's tests (signal-fired-mid-stream surfaces `Err({kind:"cancelled"})`) while diverging on what the *next* `@`-query in the same loom sees: one leaves Pi's session state untouched, the other prunes the orphaned partial assistant turn before re-driving. Both behaviours pass the existing surface tests; only the second silently changes the prompt the next query receives. Without an observable rule, neither V5e nor V18b can include a conformance assertion that the post-cancel conversation matches Pi's committed state byte-for-byte.

## Solution Space

**Shape:** single

### Recommendation

Replace the mid-stream carve-out paragraph in `errors-and-results.md` (Partial-append contract) with a positive runtime-side rule, and cross-link it from `slash-invocation.md` (User-visible streaming) and `cancellation.md` (Surfacing). Wording sketch:

> **Mid-stream cancellation, conversation state.** When a query's stream is interrupted by cancellation before its `Ok` materialises, the loom runtime MUST NOT mutate the conversation maintained by Pi: it MUST NOT truncate, re-write, replace, or remove any assistant tokens, tool-call cards, or system notes that Pi has committed to the conversation, and it MUST NOT inject compensating turns. Whether the partial fragment appears in the conversation observed by a subsequent `@`-query in the same prompt-mode loom is determined entirely by Pi's session semantics; the loom runtime's obligation is non-mutation.

Make the rule observable at V5e and V18b by asserting, after a cancelled mid-stream query, that the conversation handle the prompt-mode driver next reads from is byte-identical to what Pi committed — the test fixture controls Pi-side commitment via the existing `PromptModeConversationDriver` seam (V5e), pins the committed transcript snapshot, fires `loomAbort.abort()` mid-stream via the V18b checkpoint hook, then drives a follow-up `@`-query and asserts its outbound conversation matches the snapshot exactly. The same fixture also asserts that no `pi.sendMessage`, `setActiveTools`, or other Pi-mutating call interleaves between the cancellation observation and the next driver send.

Edge cases the implementer must watch:

- The rule applies symmetrically to the cancellation path *and* to `?`-propagation after a partial stream (the existing `slash-invocation.md` Edge cases bullet covers visibility but not mutation).
- For typed queries with respond-repair follow-ups, the rule binds the runtime between the cancelled streaming turn and the next driver send; respond-repair's own conversation appends remain governed by `query.md`.
- Subagent mode is unaffected — no observer exists for the subagent's conversation outside the subagent itself, but the runtime obligation still holds within the subagent loom.

## Relationships

- T22 "Post-cancel late Promise settlement: discard mechanism unspecified, leaves `unhandledRejection` exposure" — same-cluster (adjacent cancellation observability gap on a different surface — late tool-call settlements rather than streaming fragments)

---

# T06 — `peerDependencies` ranges silently deviate from Pi's documented `"*"` convention

**Original heading:** peerDependencies: tilde-pinned ranges conflict with Pi's documented `"*"` convention
**Original section:** spec.md — Orientation > Prerequisites > Pi SDK and capabilities
**Kind:** doc-alignment-broad, assumptions
**Importance:** medium
## Finding

Pi's `@mariozechner/pi-coding-agent/docs/packages.md` (*Dependencies*) is unambiguous about the bundled-package convention: "If you import any of these, list them in `peerDependencies` with a `"*"` range and do not bundle them: `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `typebox`." All five bundled packages are named, and the prescribed range is `"*"` for every one.

The spec follows this convention only for the fifth entry. `pi-integration-contract.md` — *Host prerequisites — Pi SDK pin* pins the four `@mariozechner/*` packages to `~0.72.1` (matching the literal in the project's own `package.json`) and explicitly cites `packages.md` only when discussing `typebox`. The `~0.72.1` choice for the four `@mariozechner/*` packages is presented as the loom contract without any acknowledgement that it diverges from the convention `packages.md` prescribes for the same packages. The "belt-and-braces against package managers that do not auto-deduplicate transitive peer-dep ranges" parenthetical justifies declaring all four entries together; it does not name `"*"` as the alternative being rejected, does not cite `packages.md`, and does not record the trade-off.

The deviation is also load-bearing: the H1 `peerDependencies` literal-read test (per `plan_topics/h1-scaffold.md`) asserts the four entries equal `"~0.72.1"` literally and that `typebox` equals `"*"`, baking the divergence into the test corpus. A future reader auditing whether `pi-loom` follows Pi's published packaging convention will find the convention cited for one of five packages and silently broken for the other four.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — *Host prerequisites — Pi SDK pin* (edited)
- `spec_topics/pi-integration-contract.md` — *Step 0 (d) Peer-dep version* (option-dependent)
- `spec_topics/pi-integration-contract.md` — *Pi version bump procedure* (option-dependent)
- `spec.md` — *Orientation > Prerequisites > Pi SDK and capabilities* (read-only; references PIC by location)
- `package.json` (option-dependent; `peerDependencies` literals)
- `C:/Users/thomasa/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent/docs/packages.md` — *Dependencies* (read-only; convention source)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The `SDK_SURFACE_INVENTORY` `peer-dep-range` entry and the `package.json` `peerDependencies` literal-read test both encode `"~0.72.1"` for the four `@mariozechner/*` packages; both change under Option A and stay put with new doc anchors under Option B. The bump-procedure leaf list is not affected — `Pi version bump procedure` is in `pi-integration-contract.md`, not in a plan leaf.

## Consequence

**Severity:** correctness

A reviewer comparing `pi-loom`'s packaging against Pi's `packages.md` finds an undocumented divergence on four of five bundled packages. Under Option A (align with `"*"`) the divergence simply disappears; under Option B (keep `~0.72.1`) the divergence becomes intentional and citable. Left as-is, the next person to bump Pi has to re-derive the rationale from scratch and may "fix" the deviation by aligning to `"*"`, silently dropping the install-time skew gate the current design relies on.

## Solution Space

**Shape:** single

### Recommendation

Retain the `~0.72.1` ranges. Add an explicit acknowledgement to *Host prerequisites — Pi SDK pin* that this is a deliberate deviation from `packages.md`, citing the convention, naming what it gives up (Pi-prescribed alignment) and what it buys (install-time skew detection on non-deduplicating package managers).

**Spec edits.** In *Host prerequisites — Pi SDK pin*, after the existing lock-step paragraph, insert a short paragraph: cite `@mariozechner/pi-coding-agent/docs/packages.md` — *Dependencies* as prescribing `"*"` for all five bundled packages; state that `pi-loom` deliberately deviates for the four `@mariozechner/*` entries by pinning `~0.72.1`; name the deviation rationale (install-time skew detection on pnpm-isolated and yarn installs that do not auto-dedupe transitive peer-dep ranges); state that `typebox` follows the convention because the runtime depends only on `Type.Unsafe`, which is stable across the TypeBox 0.x → 1.x line. Add a sentence to *Pi version bump procedure* step 4 noting that this deviation must be re-justified if a future Pi minor changes the lock-step expectation. No `package.json` or H1 test changes.

The install-time skew gate is concrete value on the package managers most production hosts use, and the existing design (the H1 literal-read test, the Step 0 (d) probe, and the bump-procedure literal-anchor list) has been built around the four-anchor invariant. Pay the documentation cost: cite `packages.md`, name the deviation, record the rationale in `pi-integration-contract.md`. Edge case the editor must watch — keep the `typebox` paragraph distinct, since `typebox` follows the convention and the four `@mariozechner/*` entries do not; do not let a future copy-edit collapse them into a single "all five follow `packages.md`" sentence.

## Relationships

- T09 "`typebox` host-shape failure has no named diagnostic; `Type.Unsafe` stability claim is uncited" — same-cluster (touches the same `peerDependencies` block and the same `packages.md` convention, but resolves around a different sub-question — `typebox` probe and packaging-vs-behavioural-contract — and the edits do not coincide)

---

# T07 — Worked consequence "Depth-6 forced respond at `max_rounds`" contradicts CIO-4's stated ordering and invokes the wrong terminal variant

**Original heading:** CIO-4 forced-respond slot-accounting reversal in worked consequence
**Original section:** spec.md — Orientation > Scope > Hard ceilings > Ceiling #4 and CIO rules
**Kind:** consistency, implementability
**Importance:** medium
## Finding

`spec.md` ceiling-interaction rule **CIO-4** fixes the order of events at the tool-call-round boundary: ceiling #2 is evaluated *after* the round's tool calls have completed and *after* the slot count has been incremented for the just-completed round, and *before* the next model turn is requested — and on a typed query at the final round permitted by `max_rounds`, that "next turn" is the forced respond turn. The slot-increment for the last free-phase round therefore happens *before* the forced respond turn is issued, and the forced respond turn itself is the next turn that runs under that bookkeeping.

The worked consequence *Depth-6 forced respond at `max_rounds`* (`spec.md` line 86) reads:

> a typed-query forced respond turn at the final round permitted by `max_rounds` that produces depth-6 output surfaces as `cause: "schema_validation"` because CIO-3's depth-walk fires at the typed-query response AJV boundary **before CIO-4's slot-increment for the just-completed round would tip into `tool_loop_exhausted`**.

Two independent errors:

1. **Ordering is reversed.** The slot-increment for the just-completed free-phase round has already happened by the time the forced respond turn fires. Per CIO-4, slot-accounting precedes the next-turn dispatch; there is no mid-state where a turn is in flight while its predecessor's slot is still un-incremented. The depth-walk on the forced respond turn's response cannot fire "before" an increment that has already occurred upstream.
2. **Wrong terminal variant for the typed-query path.** Per CIO-4 itself and per `spec_topics/query.md` ("Tool-call loop bound", "Typed queries are tool-loop-shaped"), at the final round permitted by `max_rounds` the runtime *issues* the forced respond turn — that is the precondition's typed-query branch. A typed query at `max_rounds` whose forced respond turn produces an AJV-rejectable payload routes through the schema-validation surface (and respond-repair, where applicable), not through `tool_loop_exhausted`. `tool_loop_exhausted` fires when no terminating turn is produced within the cap; the forced respond turn *is* the typed-query terminating mechanism. Citing it as the counterfactual the depth-walk "races" makes the worked example illustrate a path that cannot occur on a typed query.

The normative content elsewhere (CIO-4's own statement, `query.md`'s tool-loop bound, leaves V6k / V6l in the plan) is correct; the wording bug is confined to this single bullet, but it is the only bullet that walks an implementer through the forced-respond-at-`max_rounds` interaction, so leaving it inverted teaches the wrong sequence.

## Spec Documents

- `spec.md` — Hard ceilings > Worked consequences > *Depth-6 forced respond at `max_rounds`* bullet (edited)
- `spec.md` — Hard ceilings > Interaction between ceilings > CIO-4 (read-only)
- `spec_topics/query.md` — Typed queries are tool-loop-shaped; Tool-call loop bound (read-only)
- `spec_topics/errors-and-results.md` — `ValidationError` `cause: "schema_validation"` (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The fix is a wording correction in `spec.md`'s informative worked-consequences list; no plan leaf's acceptance criteria change. V6k (`tool_loop` cap enforcement and `ToolLoopExhaustedError`), V6l (two-phase tool-loop driver), and V11i (depth walk) already encode the correct semantics — they cite CIO-4 and the per-boundary table, not the worked-consequence bullet — and remain untouched.

## Consequence

**Severity:** advisory

A reader who treats the worked consequence as ground truth will internalise an event ordering that contradicts CIO-4 and a terminal variant (`tool_loop_exhausted`) that cannot fire on the path being illustrated. Leaf authors and test writers who anchor on this bullet — rather than on CIO-4 + `query.md` — risk constructing test fixtures that assert against the wrong variant or the wrong slot-count state. Behaviour is not at risk because the normative rules elsewhere are correct, but the worked example fails its purpose of de-confusing a tricky cross-ceiling case.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the bullet so the sequence matches CIO-4 and the terminal variant matches the typed-query path. Suggested replacement text:

> *Depth-6 forced respond at `max_rounds`* (CIO-3, CIO-4): on a typed query at the final round permitted by `max_rounds`, CIO-4's slot-increment for the last free-phase round has already occurred and the forced respond turn has been dispatched. When that turn produces a depth-6 payload, CIO-3's depth-walk fires at the typed-query response AJV boundary inside the synthesised respond tool's `execute` and surfaces `Err(QueryError { kind: "validation", cause: "schema_validation", validation_errors: [{ schema_keyword: "maxDepth", … }], … })` per the model-driven row of the ceiling #4 per-boundary table. The `tool_loop_exhausted` variant is not reachable on this path — the forced respond turn is precisely the typed-query terminating mechanism CIO-4's `max_rounds`-final branch routes to.

Implementer-relevant edge cases the rewritten bullet (or a sibling bullet) should still cover:

- The depth-walk fires *inside* the respond tool's `execute` against the call payload, before the runtime treats the turn as completed; the forced respond turn's own slot increment is irrelevant to the surface (the response is already invalidated).
- Respond-repair (V13g–j) may then attempt a follow-up; per `query.md`, each respond-repair follow-up gets a *fresh* `tool_loop` budget, so the `max_rounds` boundary is not what gates retry — `respond_repair.attempts` is.
- An untyped query at `max_rounds` has no forced respond turn; that scenario belongs to a separate (existing) bullet about plain-text exhaustion and should not be conflated here.

## Relationships

- T18 "CIO-6 hard-ceiling co-fire: predicate, test vector, and normative ownership" — same-cluster (CIO-6 inherits CIO-3's site list and reasons about the same depth-walk + slot-accounting interaction; the rewritten bullet here would be a useful test-vector source for CIO-6's missing co-fire example)
- T19 "Ceiling #4's opening classification contradicts its own table and CIO-1" — same-cluster (different defect on the same Hard-ceilings paragraph)
- T20 "CIO-3 enumerates four AJV boundaries; ceiling #4's table has five" — same-cluster (touches the CIO-3 boundary inventory the rewritten bullet cites; resolves independently)
- T21 "Hard ceilings block does load-bearing definitional work inside informative orientation" — must-follow

---

# T08 — "No ceiling fails silently" headline contradicts the model-driven row's loom-code-silent surface

**Original heading:** "No ceiling fails silently" vs. model-driven silent-at-loom-code row
**Original section:** spec.md — Orientation > Scope > Hard ceilings (general)
**Kind:** consistency
**Importance:** medium
## Finding

The Hard ceilings opening (`spec.md` line 51, the `<a id="hard-runtime-ceilings"></a>` bullet) makes an unqualified normative-flavoured claim: "each has a distinct, observable failure surface and **no ceiling fails silently**." The per-boundary table for ceiling #4 (JSON-document depth) immediately below contains a row whose carrier shape and destination are explicitly *the model* — the model-driven tool-arg row routes the depth violation back to the model as a tool-error result, with no `QueryError` or diagnostic reaching loom code at the depth-walk site.

The post-table prose (line 72) acknowledges this directly: "The model-driven row is the only one whose surface is silent at the loom-code level — the depth violation reaches the model as a tool-result and reaches the operator only via the `loom-system-note` channel **if and when** the loop later exhausts under ceiling #2 … The 'no ceiling fails silently' claim above is honoured in the model-as-observer sense." That reconciliation — that the model itself is the observer for this row — is the load-bearing qualifier on the headline claim, but it lives roughly 20 lines and one large table away from the claim it qualifies. A reader who stops at the opening bullet (or who quotes it in a downstream document) carries away a stricter promise than the spec actually keeps.

The contradiction is editorial, not behavioural — the per-boundary table, the post-table prose, and the plan leaves (V11i, V14e, V14f) all consistently describe the model-driven row's surface. But the spec cannot simultaneously assert "no ceiling fails silently" as a headline rule and rely on a deferred "in the model-as-observer sense" rider to make that rule true.

## Spec Documents

- `spec.md` — Orientation > Scope > Hard ceilings opening bullet (edited)
- `spec.md` — Orientation > Scope > Hard ceilings, post-table reconciliation paragraph (read-only; the reconciliation moves up rather than disappearing)
- `spec_topics/schema-subset.md` — Depth Enforcement (read-only)
- `spec_topics/query.md` — Tool calls during a query (read-only; defines the model-driven tool-arg routing)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The model-driven row's behaviour (tool-error fed back to the model; round counts against `tool_loop.max_rounds`; not a `QueryError`) is already correctly encoded in V11i (depth-walk service-level), V14e (model-driven tool-arg boundary surfacing), V14f (code-driven tool-arg boundary surfacing), and V16p (slash-load `params` arm). This finding is a spec-text wording fix; no acceptance criteria change.

## Consequence

**Severity:** advisory

A careful reader concludes the spec contradicts itself in its first sentence on Hard ceilings; an inattentive reader carries the false invariant "every ceiling surfaces somewhere loom code or the operator can see immediately" into downstream design or documentation. Implementers do not diverge — the per-boundary table is the authoritative routing source and the test coverage already exists — but the headline claim is the single most quotable line in the Hard ceilings section, and shipping it as written invites mis-quotation.

## Solution Space

**Shape:** single

### Recommendation

Replace the absolute clause in the opening bullet with a clause that names the three observer roles the spec actually depends on, and move the model-as-observer reconciliation up against the claim instead of leaving it deferred. Concretely, in the Hard ceilings opening (`spec.md` line 51), replace:

> each has a distinct, observable failure surface and no ceiling fails silently.

with:

> each has a distinct, observable failure surface — addressed to at least one of *loom code*, *the model*, or *the operator* — and no ceiling is unobservable to all three. (Ceiling #4's model-driven tool-arg row is observable to the model and, if the loop later exhausts, to the operator via ceiling #2; see the per-boundary table and reconciliation paragraph below.)

Then, in the post-table reconciliation paragraph (line 72), strike the now-redundant sentence "The 'no ceiling fails silently' claim above is honoured in the model-as-observer sense" (the headline already states the three-role rule, so the rider is no longer load-bearing). Keep the rest of that paragraph — the masked-row `tool_loop` accounting and the slash-load `params` cross-ceiling carve-out — verbatim.

Edge cases the editor must preserve:

- The headline must not be weakened to "addressed to at least one observer of any kind" — that would also cover NOCEIL-3's uncatchable-fatal carve-out, which the spec deliberately treats as out-of-scope rather than as a covered ceiling. Naming the three roles (loom code, model, operator) closes that loophole.
- The rephrased headline must continue to reject any future hypothetical ceiling whose only "observability" is e.g. a host-process exit code or a debug build flag; that is what the "addressed to at least one of" enumeration is doing and why it is closed rather than open-ended.
- Do not move the per-boundary table or the worked-consequence list as part of this edit; they are scoped by other findings (`Hard ceilings block misplaced in informative orientation section` and the per-label HTML anchor finding) and conflating the edits would entangle two independent reviews.

## Relationships

- T21 "Hard ceilings block does load-bearing definitional work inside informative orientation" — must-follow

---

# T09 — `typebox` host-shape failure has no named diagnostic; `Type.Unsafe` stability claim is uncited

**Original heading:** `typebox`: bundled-package convention uncited, no probe, packaging over-prescribed
**Original section:** spec.md — Orientation > Prerequisites > Pi SDK and capabilities
**Kind:** assumptions, completeness, prescription
**Importance:** high
## Finding

The runtime imports exactly one symbol from the Pi-bundled `typebox` package — `Type.Unsafe<unknown>(...)` — and uses it at every tool-registration site (subagent `customTools`, prompt-mode `pi.registerTool`, the synthesised `__loom_respond_<slug>` tool in V6, and the loom-callee `defineTool` wrap in V14e). Two facts make a missing or renamed `Type.Unsafe` a load-bearing failure mode:

1. The Step 0 capability probe is the runtime's single load-bearing host-shape check, and it explicitly excludes `typebox` — `pi-integration-contract.md` says under Step 0 (d) that "the probe MUST NOT extend the iteration to cover it" and under **Host prerequisites — Pi SDK pin** that "the capability probe under Step 0 (d) does not check `typebox` at all and MUST NOT be extended to do so." The exclusion is asserted without a named alternative diagnostic.
2. The same page elsewhere (`AgentSession.prototype.abort`, Step 0 (c)) takes the opposite posture for an analogous one-symbol Pi import, justifying the probe with the rationale "a missing or renamed member surfaces as `loom/load/host-incompatible` rather than as a runtime-time `TypeError` at the spawn site." The asymmetry between the two single-symbol Pi imports is not explained.

Consequently, if a host violates the bundled-package convention or a future TypeBox release renames/removes `Type.Unsafe`, the runtime fails with an uncaught `TypeError` at the first tool-registration call (factory time for prompt mode, spawn time for subagent mode) instead of emitting a named `loom/load/*` diagnostic. The `details.kind` enumeration in **On failure: refusal and diagnostic** has no slot for this case.

A second, narrower gap: the supporting claim "`Type.Unsafe` is stable across the TypeBox 0.x → 1.x line; no version pin is warranted" is asserted in PIC without citation. This is the one assertion that justifies pinning to `"*"` rather than a versioned range, and it carries the entire forward-compatibility argument; nothing in PIC, the spec, or `packages.md` corroborates it.

(The original framing also implied the bundled-package convention itself is uncited and that `"typebox": "*"` is over-prescribed packaging mechanism; both of those sub-claims are weaker than they sound — `pi-integration-contract.md` cites `@mariozechner/pi-coding-agent` `docs/packages.md` *Dependencies* for the convention, and `"*"` is the literal mandated by that convention rather than a packaging choice loom invented. The remaining gaps above are the substantive ones.)

## Spec Documents

- `spec_topics/pi-integration-contract.md` — *Host prerequisites — Pi SDK pin* (`typebox` sub-paragraph) (edited)
- `spec_topics/pi-integration-contract.md` — *Step 0 (Capability probe)* and **On failure: refusal and diagnostic** `details.kind` enumeration (option-dependent)
- `spec_topics/pi-integration-contract.md` — *Tool definition shape* (read-only; consumer site)
- `spec.md` — *Orientation > Prerequisites > Pi SDK and capabilities* (`typebox` sentence) (edited)
- `spec_topics/diagnostics.md` — `loom/load/*` registry (option-dependent; new `details.kind` value)
- `C:/Users/thomasa/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent/docs/packages.md` — *Dependencies* (read-only; convention source)

## Plan Impact

**Phases:** H1 (option-dependent), V6, V14

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified) — the `SDK_SURFACE_INVENTORY` constant and the per-package literal-read tests would gain a `typebox` row under the recommended option (the constant is the single source of truth the probe also consumes, per the leaf's own contract).
- V6 — Typed queries, `Result`, `?`, schema inference — (read-only; consumer of `Type.Unsafe` at `__loom_respond_<slug>` construction; no test changes required)
- V14e — Pi tool wired into `@` queries as model-callable — (read-only; consumer of `Type.Unsafe` at `defineTool` wrap; no test changes required)

## Consequence

**Severity:** correctness

If the bundled-package convention is violated by a host packaging path (a transitive dep installs a duplicate, a future TypeBox 2.x renames `Type.Unsafe`, an exotic pnpm hoisting layout fails to dedupe), the runtime crashes with an uncaught `TypeError` at the first tool-registration call instead of refusing cleanly with `loom/load/host-incompatible`. Two reasonable implementers will diverge on whether to add a probe, whether to wrap the call site in a guard, or whether to leave the failure as a raw `TypeError`, because the spec explicitly forbids extending the probe but offers no alternative diagnostic surface.

## Solution Space

**Shape:** single

### Recommendation

Extend the capability probe with a fifth sub-step that checks `typeof Type.Unsafe === "function"` against the imported `typebox` namespace. Failure routes to `loom/load/host-incompatible` with a new `details.kind = "typebox-shape"` discriminator. Mirror the framing already used for `AgentSession.prototype.abort` in Step 0 (c).

**Spec edits.**
- `pi-integration-contract.md` — *Host prerequisites — Pi SDK pin* (`typebox` sub-paragraph): delete "the capability probe under Step 0 (d) does not check `typebox` at all and MUST NOT be extended to do so" and the corresponding exclusion paragraph after Step 0 (d); replace with a forward-link to a new Step 0 (e).
- `pi-integration-contract.md` — *Step 0 (Capability probe)*: add sub-step (e) defining the `Type.Unsafe` check, its `details.kind = "typebox-shape"` discriminator, and its position in the short-circuit order (after (d), since it depends on a peer-dep import resolving).
- `pi-integration-contract.md` — **On failure: refusal and diagnostic**: extend the `kind` enumeration from `{ "node-floor", "abortsignal-shape", "sdk-capability-missing", "peer-dep-out-of-range", "peer-dep-malformed-version", "probe-failed" }` to add `"typebox-shape"`. Update the *Self-failure* paragraph's `details.step` enumeration symmetrically.
- `pi-integration-contract.md` — *Tool definition shape*: drop the uncited "stable across the TypeBox 0.x → 1.x line; no version pin is warranted" sentence; replace with a forward-reference to Step 0 (e) as the load-bearing check.
- `spec.md` — *Pi SDK and capabilities* `typebox` sentence: keep the bundled-package framing, replace the implicit "host's bundled version wins" mechanism claim with a forward-link to PIC Step 0 (e).
- `diagnostics.md` — extend the `loom/load/host-incompatible` `details.kind` enumeration entry.

The asymmetry with `AgentSession.prototype.abort` is the strongest signal — that probe entry exists for exactly this reason and the rationale ("missing or renamed member surfaces as `loom/load/host-incompatible` rather than as a runtime-time `TypeError`") transfers verbatim. Edge cases the implementer must handle: the probe MUST NOT itself construct a TypeBox schema (no `Type.Unsafe<unknown>({})` call) — `typeof Type.Unsafe === "function"` is sufficient and keeps the probe's invariant of not exercising the member it is checking; and the `details.observed` field for a missing `Type.Unsafe` should report `typeof Type.Unsafe` (e.g. `"undefined"`) rather than the namespace contents to keep diagnostic payload small.

Independently of the option chosen, delete the uncited "stable across the TypeBox 0.x → 1.x line" sentence and replace with a citation-grounded justification (a TypeBox CHANGELOG link confirming `Type.Unsafe` is API-stable, or a deferral of the compatibility question to the runtime probe).

## Relationships

- T16 "Pi API surfaces asserted without `.d.ts` citations: setActiveTools, createAgentSession, ExtensionCommandContext, AgentSession, tool-result envelope" — same-cluster

