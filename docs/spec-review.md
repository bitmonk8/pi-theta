# Triaged Spec Review - spec

_Generated: 2026-05-30T08:30:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T07) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 2 high, 5 medium retained; 7 low discarded; 0 low findings merged into 0 medium findings; 17 nit dropped; 0 false dropped._

---

# T01 - `#terminal-outcomes-aggregator` — unowned "governed separately" deferral

**Kind:** clarity
**Importance:** medium
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The partial-append parenthetical inside `#terminal-outcomes-aggregator` in
`docs/spec.md` ends with the clause *"mid-stream user-visible streaming
fragments are governed separately"*, which carries no link or named owner —
unlike the adjacent partial-append clause in the same sentence, which uses the
spec's standard `owned by [<page> — <section>](url#anchor)` shape. A reader
cannot tell which topic page specifies streaming-fragment behaviour. The
intended owner — the `**User-visible streaming.**` paragraph in
`docs/spec_topics/slash-invocation.md` — has no `<a id="…">` anchor, so it is
reachable only by section-search, not by a stable link target.

## Solution approach

Add a stable anchor `id="user-visible-streaming"` to the
`**User-visible streaming.**` paragraph in
`docs/spec_topics/slash-invocation.md`. Rewrite the trailing
"governed separately" clause of the partial-append parenthetical in
`#terminal-outcomes-aggregator` to the standard owned-by shape, linking to
that anchor. Update the two existing informal Slash-Command Invocation ›
User-visible streaming links in `docs/spec_topics/errors-and-results.md` to
target the new anchor so all call-sites resolve to one anchored destination.

## Solution constraints

- Do not edit the partial-append owned-by link in the same parenthetical; only the trailing clause is malformed.

## Relationships

None
# T02 - Pi SDK and capabilities — orientation paragraph inlines the `typebox` `"*"` literal and its resolution mechanism

**Kind:** assumptions, prescription
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The Prerequisites › "Pi SDK and capabilities" paragraph in `docs/spec.md` defers the four `@mariozechner/*` peer-dep range literals to PIC by location, and states it "carries no MUSTs of its own", yet for `typebox` it inlines the implementation literal `"typebox": "*"` and appends the resolution claim "so the host's bundled version wins". Both insertions sit at the wrong layer: the literal, the packaging rule, and the host-shape gate are already owned by PIC's `#pi-sdk-pin` `typebox` sub-paragraph and Step 0(e) (`#entry-capability-probe`). The orientation restatement contradicts the paragraph's informative-only posture and creates a second restatement site the PIC manifest-lock-step design was built to avoid. The "host's bundled version wins" phrasing additionally asserts a packaging-resolution outcome as settled fact, though PIC's only mechanical probe (Step 0(e)) verifies the runtime shape `typeof Type.Unsafe === "function"`, not the resolution outcome.

## Solution approach

Rewrite the `typebox` clause in spec.md's "Pi SDK and capabilities" Prerequisites paragraph to defer the literal and packaging rule by location, mirroring how the four `@mariozechner/*` peers are already handled, and drop both the inline `"typebox": "*"` literal and the "host's bundled version wins" resolution claim. Keep the orientation-level facts the paragraph needs: that `typebox` is the fifth Pi-bundled package, that the runtime uses only `Type.Unsafe`, and that the packaging rule and host-shape gate are owned by `#pi-sdk-pin` and Step 0(e) (`#entry-capability-probe`). Retain the `details.kind = "typebox-shape"` routing mention so the orientation paragraph's discriminator-routing enumeration stays symmetric with its other Step 0 checks.

## Solution constraints

- Out of scope: PIC's `typebox` sub-paragraph (`#pi-sdk-pin`) and Step 0(e) (`#entry-capability-probe`), including PIC's own "host's bundled version wins" phrasing — those are the owners and any reframing there is a separate PIC-owned edit.

## Relationships

- T08 "Wrong npm scope — spec and manifest pin `@mariozechner/` instead of the published `@earendil-works/`" - must-follow (the scope rename must land first so the rewritten `typebox` sentence inherits the corrected `@earendil-works/` scope in any PIC anchor labels it cites).
# T03 - SM-7c states a sequential-execution guarantee without an observable test predicate

**Kind:** testability
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

SM-7c (`#sm-7c-prompt-mode-sequential-execution`) asserts that prompt-mode bodies execute strictly sequentially within a single user session — at most one prompt-mode body holds an open `pi.setActiveTools` snapshot/restore window at a time — but substantiates the claim only through four delegated mechanism pointers (i)–(iv). None of the pointers states what a conformance test would observe to decide whether the runtime upholds the guarantee. A test author starting from SM-7c cannot formulate a pass/fail predicate without cross-correlating four downstream pages and then inferring the observable. As framed, the obligation describes the implementation's structure rather than stating a contract on its behaviour.

## Solution approach

Clarify `#sm-7c-prompt-mode-sequential-execution` by adding an observable acceptance criterion that names what a conformance test observes to decide compliance. Pin the observable to the `pi.setActiveTools` snapshot/restore window rather than whole-body execution, since nested prompt → prompt `invoke(...)` is suspend-on-call and a body-level non-overlap reading would falsify the nested case. The criterion must account for nested prompt → prompt windows and for the cancellation / restore path bounded by PIC's `**Restore-failure protocol.**`.

## Solution constraints

- None.

## Relationships

- T06 "SM-1…SM-8 block sits under Orientation despite owning normative contracts cited by downstream topic pages" - must-follow (resolve after the SM block is relocated so this edit lands on the new home).
- T04 "SM-8 lacks observable acceptance criteria for non-sharing of per-invocation budgets across siblings" - same-cluster (same testability pattern in the SM block; resolve independently, read together).
- T05 "SM-2 — `best-effort` qualifier carries no observable meaning at the spec.md layer" - same-cluster (same SM block; resolve independently).
# T04 - SM-8 lacks observable acceptance criteria for non-sharing of per-invocation budgets across siblings

**Kind:** testability
**Importance:** medium
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

SM-8 (`#sm-8-per-invocation-budget-non-sharing`) makes a normative claim with
three independent predicates — not shared, not pooled, not replenished — over
three budgets (the binder retry budget, `tool_loop.max_rounds`, and the
`invoke`-chain depth budget), but gives no observable acceptance criterion for
any predicate. A conformance-test author cannot derive a pass/fail predicate
against SM-8 from spec.md alone, and a reader who treats SM-8 as a single
sentence may collapse the three failure modes to one "the counters are
separate" check, missing the non-replenishment axis — the requirement that a
fresh sibling starts at the full ceiling regardless of a prior sibling's
exhaustion. SM-8 is the only spec.md-native obligation about cross-sibling
budget independence; the downstream owning pages state each budget's mechanism
but never the cross-sibling differential a test would check.

## Solution approach

Add observable acceptance criteria (Given/When/Then form) at the SM-8 anchor
covering the non-degenerate cross-sibling properties — non-sharing and
non-replenishment-on-fresh-sibling — for each of the three budgets. Where a
property is already pinned observably on its owning page (notably the
`invoke`-chain depth case in invocation.md's *Invocation depth bound*),
cite-and-restate the owning-page form rather than re-derive it, since spec.md
is informative orientation per GOV-12. Clarify the SM-8 sentence's "not
pooled" predicate, which is not separately observable from "not shared".

## Solution constraints

- The edit lands at the SM-8 anchor in spec.md; the budget-owning pages
  (`invocation.md`, `binder.md`, `query.md`, `hard-ceilings.md`) are read-only —
  SM-8 cites their existing mechanisms rather than re-authoring them.

## Relationships

- T06 "SM-1…SM-8 block sits under Orientation despite owning normative contracts cited by downstream topic pages" - must-follow (resolve after the SM block is relocated so this edit lands on the new home).
- T03 "SM-7c states a sequential-execution guarantee without an observable test predicate" - same-cluster (same testability pattern in the SM block; resolve independently, read together).
- T05 "SM-2 — `best-effort` qualifier carries no observable meaning at the spec.md layer" - same-cluster (same SM block; resolve independently).

---
# T05 - SM-2 — `best-effort` qualifier carries no observable meaning at the spec.md layer

**Kind:** clarity
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

SM-2's parenthetical ("visibility of that sink is best-effort per PIC and a failing emission never unwinds the teardown handler") uses `best-effort` as a bare qualifier with no in-text observable, so a reader of SM-2 alone cannot tell what the surviving guarantee is — may the `loom/host/session-shutdown-reason-unknown` diagnostic be dropped, and is delivery to an operator surface promised at all. The surviving guarantee is defined only downstream, in PIC's *Pi-side stdio visibility* sub-clause inside `#diagnostic-emission-isolation`: the runtime emits and wraps each call so a swallowed write never unwinds the handler, but the spec makes no normative claim the write reaches an operator surface. SM-2's `per PIC` points at the umbrella `#diagnostic-emission-isolation` anchor, which covers wire format, fallback, count semantics, and more — it does not pin the reader to the sentence that defines `best-effort`. The "failing emission never unwinds the teardown handler" half of the parenthetical is observable on its own and needs no rescue; only `best-effort` is empty at this layer.

## Solution approach

Rewrite the SM-2 parenthetical at `#sm-2-closed-shutdown-reason-set` in `spec.md` to state the observable inline instead of deferring with bare `best-effort per PIC`: the spec makes no normative claim that the emission reaches an operator surface, while the per-PIC wrap still guarantees a failing emission never unwinds the teardown handler. The defect is the wording, so carry that observable into the edit directly rather than leaving an unanchored deferral.

## Solution constraints

- Out of scope: `docs/spec_topics/pi-integration-contract.md` — the `#diagnostic-emission-isolation` paragraph already defines the term and is not edited.

## Relationships

- T06 "SM-1…SM-8 block sits under Orientation despite owning normative contracts cited by downstream topic pages" - must-follow (resolve after the SM block is relocated so this edit lands on the new home).
- T03 "SM-7c states a sequential-execution guarantee without an observable test predicate" - same-cluster (same SM block; resolve independently).
- T04 "SM-8 lacks observable acceptance criteria for non-sharing of per-invocation budgets across siblings" - same-cluster (same SM block; resolve independently).
# T06 - SM-1…SM-8 block sits under Orientation despite owning normative contracts cited by downstream topic pages

**Kind:** placement
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The SM-1…SM-8 block sits under `## Orientation` (between `### Prerequisites` and `### Scope`), introduced only by an italic `*Session model.*` lead-in with no heading of its own, yet it owns normative session-level obligations — SM-2's fail-safe routing of unknown `event.reason` values, SM-3a's fixed teardown sequence, SM-7c's prompt-mode sequential-execution contract, SM-8's per-invocation budget non-sharing — that no topic page restates; downstream pages cite back to its `sm-N-…` anchors rather than owning the rules. This inverts the convention the rest of `spec.md` uses, where `## Orientation` aggregates and forward-links to the normative topic pages. A reader scanning `## Extension Architecture` (whose `concurrency-model` bullet defers upward to SM-7) or `## Implementation Notes` for the session-shutdown teardown sequence, prompt-mode serialisation guarantee, or budget-isolation rule will not find them where the document structure trains them to look.

## Solution approach

Promote the SM-1…SM-8 block — together with its two governance/meta paragraphs (`<a id="sm-anchor-scheme-stability">` and the SM-3 / SM-7 sub-umbrella citation-guidance) — out of `## Orientation` into a new top-level `## Session Model` section placed among the post-Orientation body sections (`## Extension Architecture`, `## Implementation Notes`). Rewrite the italic `*Session model.*` lead-in as a section intro and add a forward-link from `## Orientation` → `### Reading order` to the new section. Update the `### V1 non-goals` cross-reference to `[Session model](#session-model)` that frames it as an Orientation aggregator, and leave the `concurrency-model` bullet in `## Extension Architecture` as a forward-link to the new section.

## Solution constraints

- Every `<a id="sm-…">` anchor and the umbrella `<a id="session-model">` anchor MUST stay byte-identical across the move; the SM-anchor-scheme-stability rule forbids reuse or renumbering of a published `sm-N-…` anchor.
- Out of scope: the inbound `#session-model` / `#sm-N-…` citations on `spec_topics/pi-integration-contract.md` and `spec_topics/future-considerations.md` — do not retarget them; the move must keep them resolving as-is.

## Relationships

- T05 "SM-2 — `best-effort` qualifier carries no observable meaning at the spec.md layer" - must-precede (relocate the SM block before this SM-specific edit lands, so it applies to the new home).
- T04 "SM-8 lacks observable acceptance criteria for non-sharing of per-invocation budgets across siblings" - must-precede (relocate the SM block before this edit lands).
- T03 "SM-7c states a sequential-execution guarantee without an observable test predicate" - must-precede (relocate the SM block before this edit lands).
# T07 - V1 non-goals aggregator out of lock-step with owning page (count and membership)

**Kind:** cross-spec-consistency-broad
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`spec.md`'s V1 non-goals orientation aggregator (`id="v1-non-goals"`) says "the seven items" and inlines a `;`-separated list of seven non-goals, but the GOV-12 owning page — `spec_topics/future-considerations.md` § V1 non-goals — carries eight bullets. The missing member is the stdio-capture non-goal at `id="pi-stdio-capture-facet"` ("No reliance on a Pi extension-host stdio-capture facet"). The aggregator's own closing sentence commits it to GOV-12 lock-step with that page, yet it both miscounts the list and omits a member, so an orientation reader cannot discover the stdio-capture disposition from `spec.md` nor trust the cardinality cue.

## Solution approach

In `spec.md`'s `id="v1-non-goals"` aggregator, update the cardinality cue from "seven" to "eight" and add a `;`-delimited clause paraphrasing the owning `#pi-stdio-capture-facet` bullet, with a cross-link to `future-considerations.md#pi-stdio-capture-facet`.

## Solution constraints

- Out of scope: `future-considerations.md` is the GOV-12 single-source owner of this list; reconcile by editing `spec.md` only, not the owning page.

## Relationships

None
