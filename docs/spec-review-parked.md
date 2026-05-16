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

## T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link

> **PARKED** — 2026-05-15T20:44:34Z
> **Reason:** The inner spec-diff-fix-loop diverged: the most recent pass produced more fix-class findings than the previous one. FIXCOUNTS: 6,8,4,4,7. Loop notes: Loop diverged at pass 5 (fix-class count rose from 4 to 7 between pass 3 and pass 4). Pass 4's 7 fixes were not applied (discarded per termination-check ordering). Earlier passes 0–3 applied 22 fixer dispatches across spec.md and pi-integration-contract.md producing the new `Session-binding cardinality presupposition` + `Session-binding mechanism presupposition` paragraph pair (anchored at `#session-binding-cardinality-presupposition` / `#session-binding-mechanism-presupposition`) and a thin pointer in spec.md's session-model paragraph. Pass 4 surfaced a fresh wave of cross-cutting findings. The diverging finding shape is bimodal — a single sub-section change is licensing unbounded prose-rewrite critique because each lens fix opens a new prose-quality surface for sibling lenses to re-attack (mechanism vs cardinality framing parity, anchor/heading vocabulary, presupposition-vs-prerequisite naming, exhaustiveness carve-outs). Recommend reshaping by splitting the cardinality vs mechanism halves into separate findings each with its own scope guards, or demoting the prose-quality lenses for this finding's inner loop.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t22a1-session-binding-contract-sub-section-in-pic-anchor-paraphrase-pi-source-ci.md`

# T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link

**Kind:** placement
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The `*Session model.*` paragraph in `docs/spec.md` (anchor `id="session-model"`) opens with the bare assertion "A Pi extension instance is bound to exactly one active user session at a time" without grounding the claim in `pi-integration-contract.md`. PIC's `**Host prerequisites.**` section currently exposes no anchor that sibling findings T22b (Future Considerations contingency cross-link) and T22c (Pi version-bump checklist item) can target for their forward-references. As a result, the single-active-session premise has no canonical home under which session-binding obligations are gathered, and the T22b / T22c cross-links would dangle.

## Solution approach

Add a new sub-section to `docs/spec_topics/pi-integration-contract.md`'s `**Host prerequisites.**` section, carrying the stable HTML anchor `id="session-binding-contract"`, that paraphrases the existing single-active-session premise and grounds it via forward-cross-references to `#pi-version-bump-procedure` step 5's build-time `SessionShutdownEvent['reason']` type-equality assertion and to `#degraded-state-host-prerequisites` presupposition (a). Then rewrite the opening sentence of the `id="session-model"` paragraph in `docs/spec.md` as a forward-link to the new anchor.

## Solution constraints

- The new PIC sub-section MUST NOT contain `"session_shutdown"` or `"workspace_shutdown"` (T36 / the bump-procedure step 5 type-equality assertion own the closed `SessionShutdownEvent['reason']` set).
- Do not pre-install the Future-Considerations contingency cross-link (T22b) or the Pi version-bump checklist item (T22c).
- The only `docs/spec.md` edit permitted is the opening-sentence forward-link rewrite of the `id="session-model"` paragraph; do not modify the closing sentence about concurrent user sessions (extraction work on it is owned by T15c).
- Do not edit `docs/spec_topics/future-considerations.md` from this finding; FC's `per the Session model paragraph cited below` clause cleanup is owned by T22b's resolution.

## Relationships

- T22b "Multi-session contingency response is unspecified in Future Considerations" — must-precede (this finding installs the `#session-binding-contract` anchor T22b's cross-link consumes; T22b's resolution also rewrites FC's `per the Session model paragraph cited below` clause to point at the new PIC anchor).
- T22c "Pi version-bump procedure has no step for the session-binding contract" — must-precede (this finding installs the `#session-binding-contract` anchor T22c's checklist item consumes).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — must-precede (T15c's extraction of the 'concurrent user sessions … out of scope' sentence interacts with the forward-link this finding installs on the opening sentence).
- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — co-resolve (same Session-model paragraph; T23's citation, when it lands, should target the same PIC sub-section).
- T34 "Trust-boundary 'no privilege facet' claim is asserted but not gated by any audit the spec cites" — same-cluster (uncited-Pi-internals pattern).
- T21 "Pi-side slash-handler promise lifecycle taken as given" — same-cluster.
- T36 "`SessionShutdownEvent.reason` closed set has no build-time pin against the SDK type" — same-cluster (diff-audit-on-pin-bump remedy).

---

## T22b — Multi-session contingency response is unspecified in Future Considerations

> **PARKED** — 2026-05-15T20:44:34Z
> **Reason:** Cascaded from parking of T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t22a1-session-binding-contract-sub-section-in-pic-anchor-paraphrase-pi-source-ci.md`

# T22b — Multi-session contingency response is unspecified in Future Considerations

**Kind:** completeness
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The "No concurrent user sessions in the same host process" entry under `<a id="v1-non-goals"></a>` in `docs/spec_topics/future-considerations.md` records the V1 scope decision but does not state the runtime's response if Pi quietly relaxes the single-active-session binding within the `~0.72.1` tilde range or a subsequent pin. The closing sentence of the `id="session-model"` paragraph in `docs/spec.md` likewise reads as a flat scope decision rather than a documented disposition. A future maintainer reading the entry after Pi relaxes the binding has no guidance on whether the V1 runtime should refuse to load, bind to the first session, key the registry by session, or emit a host-incompatibility diagnostic.

## Solution approach

In `docs/spec_topics/future-considerations.md`, augment the existing "No concurrent user sessions in the same host process" entry with one disposition sentence stating that every single-session-scoped site stays so scoped and any second session reaching the extension is out of V1 scope, and add `pi-integration-contract.md#session-binding-contract` to that entry's `*Recorded at:*` list. In `docs/spec.md`, rewrite the closing sentence of the `id="session-model"` paragraph as a forward-link into the V1 non-goals entry.

## Solution constraints

- Augment the existing "No concurrent user sessions in the same host process" entry in place; do not add a duplicate or sibling V1 non-goals entry.
- The appended disposition is documentation-only — no MUST verbs, no plan-leaf obligations, no test fixtures.
- The only `docs/spec.md` edit permitted is the closing sentence of the `id="session-model"` paragraph; the opening-sentence forward-link is owned by T22a1.
- Do not edit `docs/spec_topics/pi-integration-contract.md`; the `#session-binding-contract` anchor is owned by T22a1 and must already exist (consumed via must-precede).
- Do not pre-install the Pi version-bump checklist item over `#session-binding-contract`; that is owned by T22c.

## Relationships

- T22a "Single-active-session premise lacks a Pi-source citation in PIC" — must-precede (the anchor `#session-binding-contract` and the spec.md opening-sentence forward-link both come from T22a; resolving T22b first would leave dangling links).
- T22c "Pi version-bump procedure has no step for the session-binding contract" — independent (no shared edit surface; either order works after T22a).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — co-resolve (T15c extracts the closing scope sentence into the Non-goals (V1) section; the forward-link this finding installs is the natural target for that extraction).

---

## T22c — Pi version-bump procedure has no step for the session-binding contract

> **PARKED** — 2026-05-15T20:44:34Z
> **Reason:** Cascaded from parking of T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t22a1-session-binding-contract-sub-section-in-pic-anchor-paraphrase-pi-source-ci.md`

# T22c — Pi version-bump procedure has no step for the session-binding contract

**Kind:** completeness
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The "Editorial-review checklist for unpinned host presuppositions" sub-block under step 1 of the `#pi-version-bump-procedure` section in `docs/spec_topics/pi-integration-contract.md` enumerates audit items (a)–(e) for unpinned host presuppositions on each Pi minor bump but contains no item that re-confirms the single-active-session binding contract pinned at `#session-binding-contract` (installed by T22a1). A Pi minor that quietly broadened the binding — for example, by changing `ExtensionAPI` lifetime from per-session to per-process while keeping every named member intact — would pass step 2(a)'s literal-read inventory, step 2(b)'s closure audit, and the (a)–(e) editorial-review items, leaving the runtime's single-active-session assumptions (factory-captured `pi`, `ActiveInvocationRegistry`, prompt-mode `pi.setActiveTools` snapshot/restore) exposed to silent breakage. The detection mechanism for the binding contract is therefore missing from the bump procedure that gates every other host-presupposition re-validation.

## Solution approach

In `docs/spec_topics/pi-integration-contract.md`, append one new lettered item (f) to the editorial-review checklist immediately after item (e) under step 1 of `#pi-version-bump-procedure`, instructing the contributor on each Pi minor bump to re-read the Pi-source paragraph cited under `#session-binding-contract` against the candidate minor's lifecycle documentation and confirm the single-active-session guarantee still holds. The new item is SHOULD-level and carries an inline escalation clause stating that the obligation upgrades to MUST plus a build-time pin once Pi exposes a typed session-lifetime contract that the surface-inventory probe can mechanically verify. Update the checklist preamble's lettered range from "(a)–(e)" to "(a)–(f)".

## Solution constraints

- Item (f) is SHOULD-level only; do not introduce a MUST verb, a plan-leaf coverage obligation, or a test-fixture obligation in V1.
- The only forward-looking clause permitted in (f) is the escalation trigger naming a typed Pi session-lifetime contract verifiable by the surface-inventory probe; do not enumerate other hypothetical Pi changes.
- The `#session-binding-contract` anchor is installed by T22a1; do not introduce, restate, or relocate the anchor here.
- Forward-links from `docs/spec.md` into the anchor are owned by T22a1; cross-references from `docs/spec_topics/future-considerations.md` by T22b — do not pre-install either.

## Relationships

- T22a "Single-active-session premise lacks a Pi-source citation in PIC" — must-precede (T22a installs the `#session-binding-contract` anchor this step audits against; resolving T22c first leaves the anchor dangling).
- T22b "Multi-session contingency response is unspecified in Future Considerations" — independent (no shared edit surface; either order works after T22a).
- T21 "Pi-side slash-handler promise lifecycle taken as given" — same-cluster (sibling Pi-side guarantee under PIC).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — independent (T15a restructures `spec.md`'s Orientation block; this finding edits PIC only).

---

## T15c — Lift Session-model scope deferrals into Non-goals (V1) section

> **PARKED** — 2026-05-15T20:44:34Z
> **Reason:** Cascaded from parking of T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t22a1-session-binding-contract-sub-section-in-pic-anchor-paraphrase-pi-source-ci.md`

# T15c — Lift Session-model scope deferrals into Non-goals (V1) section

**Kind:** scope
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

Two V1 scope deferrals are buried inside the `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites — the parallel-`invoke` deferral mid-clause and the concurrent-user-sessions deferral as the terminal sentence — rather than being legible from the consolidated V1 non-goals surfaces. A reader scanning Orientation for V1 boundaries cannot reliably find them. T15a removes both from the Session-model paragraph in the same edit pass; this finding ensures both deferrals are present at the V1 non-goals surfaces (the aggregator at anchor `id="v1-non-goals"` in `docs/spec.md` and the normative bullet list at anchor `id="v1-non-goals"` in `docs/spec_topics/future-considerations.md`) before T15a's removal lands.

## Solution approach

Verify that both deferrals appear in the V1 non-goals aggregator at anchor `id="v1-non-goals"` in `docs/spec.md` and as normative bullets in the bullet list at anchor `id="v1-non-goals"` in `docs/spec_topics/future-considerations.md`; add either entry only where missing. Both surfaces presently carry both items, so the implementer's edit may be a no-op verification once T15a's reduction is staged.

## Solution constraints

- This finding presupposes the V1 non-goals aggregator (owned by T38) and its source bullet list in `docs/spec_topics/future-considerations.md` already exist; if either surface is absent at edit time, gate on T38 — do not invent a Non-goals home unilaterally.
- The aggregator entry in `docs/spec.md` must forward-link `id="v1-non-goals"` in `docs/spec_topics/future-considerations.md` rather than restate the bullet content (the normative content remains owned by the bullet list).
- The `<a id="session-model"></a>` paragraph removal is owned by T15a — do not edit it under this finding.
- Co-resolve with T15a in one commit; landing this finding in isolation while the Orientation paragraph still carries the deferrals leaves the corpus inconsistent.

## Relationships

- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — co-resolve (the reduction removes the deferrals from the paragraph in the same edit pass).
- T15b "Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection" — co-resolve (sibling restructure of the same paragraph).
- T38 "Non-goals are not consolidated into a single section" — must-follow (the lift target only exists once T38 lands).
- T22b "Multi-session contingency response is unspecified in Future Considerations" — co-resolve (T22b proposes a forward-link from the closing scope sentence to `future-considerations.md#v1-non-goals`; the lift performed here is the natural target for that forward-link).

---

## T21 — Pi-side slash-handler promise lifecycle taken as given

> **PARKED** — 2026-05-15T23:22:56Z
> **Reason:** The inner spec-diff-fix-loop limit-cycled: non-monotone non-zero fix-class counts across the last four passes. FIXCOUNTS: 11,6,13,13,12. Loop notes: Limit-cycle detector fired at pass 5 on counts [6,13,13,12]. Trajectory oscillated; same lens family kept re-surfacing fixes that direct opposite resolutions for the same prose plus repeated requests for per-presupposition anchors that crossed the no-invented-ids scope guard four passes in a row. Recommended reshaping: split T21 into a smaller additive paragraph that does not authorise (1)/(2)/(3) as load-bearing, OR grant explicit anchor-allocation permission so the per-item citation defect stops re-firing each pass.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t21-pi-side-slash-handler-promise-lifecycle-taken-as-given.md`

# T21 — Pi-side slash-handler promise lifecycle taken as given

**Kind:** assumptions
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The runtime side of the slash-command cancellation chain is fully pinned: the **Cancellation source** section (`id="cancellation-source"`) of `docs/spec_topics/pi-integration-contract.md` and the orientation Session model paragraph (`id="session-model"`) of `docs/spec.md` together specify that `ctx.signal` triggers `loomAbort.abort(reason)`, that the symmetric direction unblocks `await ctx.waitForIdle()`, and that the `session_shutdown` handler awaits `Promise.allSettled(activeInvocations.map(inv => inv.disposeBarrier))`. The Pi side of the same chain is not pinned anywhere: nothing states whether Pi awaits the slash-handler promise for the full invocation, whether Pi imposes an internal deadline, or whether `ctx.signal` is Pi's only out-of-band interaction with the in-flight handler. SDK capability inventory item 5 (`id="sdk-cap-cancellation-propagation"`) only requires that Pi *supplies* the `AbortSignal` at the two entry points. A reader cross-checking the cancellation chain has nothing to verify against, and a future Pi change in this area would not be caught by any spec gate.

## Solution approach

In `docs/spec_topics/pi-integration-contract.md`, add one new loom-side consumption-posture paragraph inside the **Cancellation source** section under `id="cancellation-source"`, immediately following the existing `ctx.signal` JSDoc quote, naming the three loom-side presuppositions about Pi's slash-handler scheduling (Pi awaits the handler's returned `Promise` for the full invocation including any time after `ctx.signal` aborts; Pi imposes no internal deadline; `ctx.signal` is Pi's only out-of-band interaction with the in-flight handler). Resolve the paragraph's citation slot via **exactly one** of two paths under the boundary-discipline-at-external-entities principle (SP-1; see `docs/spec-principles.md`): **Path A** — a Pi-side source citation against the `@mariozechner/pi-coding-agent` SDK pin; or **Path B** — a best-effort disclaimer naming the SDK pin version plus a corresponding audit-step item appended to the editorial-review checklist under `id="pi-version-bump-procedure"`. Frame the paragraph strictly in loom-consumption voice; do not author Pi-side guarantees.

## Solution constraints

- The new paragraph uses loom-side voice (SP-1.1): no `Pi MUST`, `Pi SHALL`, or `Pi REQUIRED`, and no paraphrase of Pi behaviour in spec voice.
- Resolve the citation slot by exactly one of Path A or Path B (SP-1.2 / SP-1.4) — no middle path. Path A: a Pi-side citation against the `@mariozechner/pi-coding-agent` SDK pin (file path plus symbol or named section, no line numbers, byte offsets, or commit hashes). Path B: a best-effort disclaimer naming the SDK pin version, paired with a corresponding lettered audit-step item appended to the editorial-review checklist under `id="pi-version-bump-procedure"` linking to the new paragraph's anchor. If a fix-loop pass cannot decide between A and B, prefer B over speculative paraphrase.
- Item (f) of the `id="pi-version-bump-procedure"` editorial-review checklist is owned by T22c — do not pre-install or relocate it here.
- Do not widen SDK capability inventory item 5 (`id="sdk-cap-cancellation-propagation"`) — or any other capability-inventory item — to add a clause about handler-promise settle time, internal deadline, force-resolve, abandon, or detach. Capability-inventory items enumerate behavioural surfaces the loom probes at entry, not Pi-side guarantees authored by this spec.
- The `tool.execute(...)` adapter promise lifecycle and any extension of the cancellation chain into `docs/spec_topics/cancellation.md` are out of scope here.

## Relationships

- T22a "Single-active-session premise lacks a Pi-source citation in PIC" — same-cluster (parallel SP-1.2 citation pattern; T22a's resolution may produce the citation-search recipe Path A reuses).
- T22b "Multi-session contingency response is unspecified in Future Considerations" — same-cluster.
- T22c "Pi version-bump procedure has no step for the session-binding contract" — same-cluster (Path B's bump-procedure audit step joins the (a)–(f) checklist T22c is also extending).
- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — same-cluster (sibling SP-1.2 citation gap on Pi-side scheduling).


---

## T20 — Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes

> **PARKED** — 2026-05-16T01:11:09Z
> **Reason:** The inner spec-diff-fix-loop diverged: the most recent pass produced more fix-class findings than the previous one. FIXCOUNTS: 4,4,4,6,7. Loop notes: T20 fix-loop diverged at pass 5. Whack-a-mole pattern around the OS-level FD/socket/child-process-handle resource class: oscillation between "routing is missing/unrouted" (expansion) and "routing is duplicated outside its canonical home" (compression). Recommend reshaping by splitting the bimodal ownership-statement + routing-enumeration obligation into two smaller findings, or narrowing the routing-enumeration scope explicitly to a closed list of per-call surfaces.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t20-resource-exhaustion-under-concurrent-subagent-invocations-is-undisclaimed.md`

# T20 — Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes

**Kind:** error-model
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The paragraph anchored at `id="no-invocation-cap"` in `docs/spec_topics/implementation-notes.md` carries a parenthetical disclaimer stating that the no-admission-cap rule does not promise resource unboundedness, but the parenthetical only addresses one resource class — runtime-value heap — split into the catchable `RangeError` family (routed through `loom/runtime/internal-error`) and uncatchable V8 heap-OOM (host-process termination). Two other classes that scale with concurrent-subagent fan-out are not addressed: OS-level descriptor / port / child-process-slot exhaustion, and provider rate-limit / quota responses. Each class already has an existing surface in the loom contract for what the loom does observe (catchable host throws fall through `loom/runtime/internal-error` per `docs/spec_topics/errors-and-results.md`; per-query 429s surface as `TransportError` on the same page), but the spec doesn't state where the **ownership boundary** sits — i.e. that the limits themselves and any cross-sibling aggregation, throttling, or storm-detection over them are owned by the host OS, the JavaScript runtime, and the LLM provider respectively, not by the loom spec. Without that boundary statement an implementer or operator is left to infer whether the loom is committing to add such surfaces in a future revision or whether they are out of the loom's scope by design.

## Solution approach

Rewrite the resource-unboundedness parenthetical inside the `id="no-invocation-cap"` paragraph in `docs/spec_topics/implementation-notes.md` as a positive ownership-boundary statement: the loom imposes no admission cap, no scheduler, no per-class threshold, and no cross-sibling aggregation, throttling, or storm-detection on the resources concurrent loom invocations consume. Those resources — runtime-value heap (V8), OS-level file descriptors / sockets / child-process slots, and provider-side rate-limit / quota — are owned by the host JavaScript runtime, the host OS, and the LLM provider respectively, and their limits and any aggregation over those limits live in those layers, not in the loom contract. The loom observes only the per-call surfacing of those limits through the existing routing it already pins: catchable host throws (e.g. the V8 `RangeError` family per `NOCEIL-3` in `docs/spec_topics/hard-ceilings.md`, plus catchable OS-level descriptor / port / child-process-slot exhaustion surfaced as throws by the host JavaScript runtime) route through `loom/runtime/internal-error` per `docs/spec_topics/errors-and-results.md`; per-query provider throttles (HTTP 429 and equivalents) surface as `TransportError` on the same page; uncatchable host fatals (V8 heap-OOM, OS process-kill) terminate the host process without any loom-level diagnostic, on the same footing as any other engine fatal. The Session-model paragraph in `docs/spec.md` is not edited; its existing forward-link to the disclaimer carries the rewritten wording.

## Solution constraints

- Do NOT use "non-normative" or "the spec is silent" carve-out phrasings — the positive framing carries the same operative meaning (loom commits to no aggregation surface; a future surface is not anticipated by V1) without coining a non-normativity marker.
- Do not introduce a new diagnostic-code identifier, a new `details.kind` discriminator on `loom/runtime/internal-error`, a new threshold seam, or any cross-sibling aggregation / storm-detection surface — these belong to the rejected option B and are explicitly outside the ownership boundary the rewrite states.
- Do not weaken, relocate, or restate the `MUST NOT introduce an admission cap` clause that precedes the parenthetical, and do not introduce any new MUST or SHOULD against the runtime — the edit rewrites an existing disclaimer, not a normative obligation.
- Use stable landmarks for cross-references: cite `NOCEIL-3` by identifier; link `loom/runtime/internal-error` and `TransportError` to their existing targets in `docs/spec_topics/errors-and-results.md`; do not introduce, rename, or relocate any anchor.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (same Session-model paragraph; addresses sibling-diagnostic correlation; co-resolve siblings T19b/c/d/e also relevant).
- T15b "Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection" — same-cluster (the relocated concurrency-model home is the natural surface for the resource-exhaustion disclaimer).

---

## T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection

> **PARKED** — 2026-05-16T01:11:09Z
> **Reason:** Cascaded from parking of T20 — Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes: this finding's ## Relationships block declares an ordering edge (must-precede or must-follow) on the parked finding, so its preconditions are no longer satisfied in spec-review.md.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t20-resource-exhaustion-under-concurrent-subagent-invocations-is-undisclaimed.md`

# T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection

**Kind:** placement
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The architectural half of the `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites — the mode-qualified isolation summary, prompt-mode strict sequentiality with its three supporting premises (i)/(ii)/(iii), the genuine-concurrency-only-between-subagent-invocations conclusion, the cancellation-propagates-downward-only restatement, and per-invocation budget scoping — sits inside an Orientation bullet labelled informative rather than in a normative-architectural home. T15a's reduction of that paragraph removes those clauses from Orientation; with no destination in `## Extension Architecture` or `## Implementation Notes` they are dropped on the floor and the architectural reader has no aggregator to land on. The spec presently has no `Concurrency model` subsection under either home.

## Solution approach

Add a new `Concurrency model` subsection in `docs/spec.md` under `## Extension Architecture` as a sibling entry to Pi Extension Integration. **Copy** the listed architectural clauses into the new subsection as an aggregator analogous to the Hard-ceilings bullet, preserving each clause's existing forward-links to `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/implementation-notes.md`, `docs/spec_topics/cancellation.md`, `docs/spec_topics/invocation.md`, and `docs/spec_topics/frontmatter.md` verbatim. The corresponding **removal** from the `<a id="session-model"></a>` paragraph is owned by T15a and is out of scope here — the addition (this finding) and the removal (T15a) land as two consecutive single-finding commits under bottom-up ordering, with a transient content duplication in HEAD between them by design.

## Solution constraints

- Do not place it under `## Implementation Notes`.
- Do not restate owner-page text beyond what the forward-links require.
- Preserve every forward-link from the listed clauses verbatim — same targets, same count — across the copy. This is a copy, not a rewrite.
- Preserve the three sequentiality premises (i)/(ii)/(iii) verbatim from the source paragraph; the fourth premise is owned by T14 and added in T14's edit pass, not here.
- Do NOT edit the `<a id="session-model"></a>` paragraph under this finding — removal of the now-duplicated clauses from the source paragraph is owned by T15a and lands in the immediately-following commit under bottom-up ordering. A transient content duplication between the new `Concurrency model` subsection and the still-untouched `<a id="session-model"></a>` paragraph is the **expected intermediate state** between this commit and T15a's commit.
- **Inner-loop guidance for the spec-diff fix loop on this commit:** the diff for this finding intentionally introduces content that duplicates the unchanged `<a id="session-model"></a>` paragraph in `docs/spec.md`. Findings of the form *"the new Concurrency model subsection duplicates the session-model paragraph"*, *"the same forward-link appears in two places"*, or *"premises (i)/(ii)/(iii) are stated twice"* are out of scope for the inner loop on this commit and MUST NOT be acted on by `spec-diff-fixer` — fixing them would either re-add removed content (defeating the finding's purpose) or remove content from the still-canonical session-model paragraph (crossing the scope guard above and pre-empting T15a's commit). Treat any such finding as `ignore — out-of-scope`.

## Relationships

- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — co-resolve (the reduction at Orientation must land alongside this relocation).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — co-resolve (sibling restructure of the same paragraph).
- T14 "Prompt-mode sequentiality argument has an unstated fourth premise" — must-follow (the three premises being relocated are the ones T14 needs to extend with the fourth premise; the relocation is the natural moment to add it).
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — must-follow (the admission-cap disposition being relocated is the surface T20 needs the resource-exhaustion answer on).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (lives in the same architectural area being created here; co-resolve siblings T19b/c/d/e also relevant).

---

## T19a — Extend ActiveInvocationRegistry entry shape with invocationId

> **PARKED** — 2026-05-16T03:29:07Z
> **Reason:** The inner spec-diff-fix-loop limit-cycled: non-monotone non-zero fix-class counts across the last four passes. FIXCOUNTS: 8,13,18,12,10. Loop notes: Loop oscillated; lenses kept critiquing the supporting normative prose around the registry-entry extension. Recommended reshaping: relax [default] scope guard to admit diagnostics.md + errors-and-results.md co-edits, or split the finding into smaller obligations.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t19a-extend-activeinvocationregistry-entry-shape-with-invocationid.md`

# T19a — Extend ActiveInvocationRegistry entry shape with invocationId

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `ActiveInvocationRegistry` entry shape declared under `id="active-invocation-registry"` in `docs/spec_topics/pi-integration-contract.md` carries no per-invocation correlation key — its current `Set<{ loomAbort: AbortController; disposeBarrier: Promise<void>; shutdownReason: string | undefined; loom: string }>` shape lets two concurrent sibling invocations of the same loom be indistinguishable on every downstream operator surface that reads from the registry. Sibling T19b adds an `invocation_id` wire field to `RuntimeEvent`, T19c widens the always-log dedup tuple to include it, and T19d populates `details.event.invocation_id` on the per-invocation `cancelled-by-session-shutdown` emission — all three rely on a canonical registry-side source for the id that does not yet exist. Without a per-entry id minted at registry-insertion time, none of the sibling consumers can populate or dedup on a stable per-invocation discriminator, and same-tick sibling fan-out collapses on every operator surface regardless of how the wire shape evolves.

## Solution approach

Extend the `ActiveInvocationRegistry` entry-shape `Set<...>` declaration under `id="active-invocation-registry"` in `docs/spec_topics/pi-integration-contract.md` with a required `invocationId: string` member, and pin in the section's contract paragraph that each entry's `invocationId` is sourced via `crypto.randomUUID()` at the registry-insertion site (slash-command handler entry, `tool.execute(...)` adapter entry, and `invoke` spawn-site entry) inside the existing **Dispatch-site setup wrap** `try`/`catch` before any awaitable work, and is set on entry creation and never mutated thereafter. The exact identifier name, type, derivation primitive, and insertion-site placement are the substance of the change and are pinned as part of the registry-shape extension.

## Solution constraints

- Preserve the existing entry-shape members (`loomAbort: AbortController`, `disposeBarrier: Promise<void>`, `shutdownReason: string | undefined`, `loom: string`) verbatim — same name, type, optionality marker, and order.
- Do not introduce a parallel id channel and do not re-derive an id at any downstream emission site; T19c's dedup-key widening and T19d's `details.event.invocation_id` population both depend on a single registry-sourced value.
- The `RuntimeEvent` `invocation_id` wire field, the always-log dedup-tuple widening, the `cancelled-by-session-shutdown` details addition, and the real-time sibling emission-timing paragraph are owned by T19b, T19c, T19d, and T19e respectively.
- Do not introduce a new diagnostic code, `details.kind` discriminator, aggregation surface, or storm-detection layer.

## Relationships

- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede (any decision to add operator-visibility for successful sibling outcomes will reuse the `invocation_id` field this child installs).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

## T19b — Add invocation_id field to RuntimeEvent payload declaration

> **PARKED** — 2026-05-16T05:31:39Z
> **Reason:** The inner spec-diff-fix-loop diverged: the most recent pass produced more fix-class findings than the previous one. FIXCOUNTS: 5,1,7,7,9. Loop notes: T19b's literal field addition keeps generating fresh lens findings because the field's semantics are owned by the parked T19a/T19c/T19d/T19e siblings. Pass-3 placement move expanded the surface; pass 4 surfaced 9 fresh findings against it. Recommend parking T19b alongside T19a, or reshaping the finding to land after T19a/T19c install the registry source and dedup-tuple widening.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t19b-add-invocation-id-field-to-runtimeevent-payload-declaration.md`

# T19b — Add invocation_id field to RuntimeEvent payload declaration

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `type RuntimeEvent = { ... }` declaration in the **Runtime event channel** section of `docs/spec_topics/pi-integration-contract.md`, introduced by the sentence pinning the shape as "normative and additive-only", carries no per-invocation correlation field. Sibling T19a sources an `invocationId` from the `ActiveInvocationRegistry` entry, but the wire payload has no destination for that value, so operator-side consumers of the always-log channel cannot distinguish concurrent-sibling emissions from the same loom. T19c's dedup-key widening and T19d's cancelled-by-session-shutdown details population both read this field and require it to be present on the wire shape.

## Solution approach

Add a required `invocation_id: string` field to the `type RuntimeEvent = { ... }` declaration in the **Runtime event channel** section of `docs/spec_topics/pi-integration-contract.md`. Rely on the existing "normative and additive-only" sentence above the declaration to characterise the addition; do not re-author that contract note here. Do not edit the surrounding prose, the dedup-tuple statements, or any sibling-owned surface.

## Solution constraints

- Preserve every existing `RuntimeEvent` field (`kind`, `code`, `loom`, `query_site`, `message`, `attempts`, `tokens_used`, `masked`, `occurred_at`) verbatim — same name, type, optionality marker, inline comment, and order.
- The `ActiveInvocationRegistry` entry-shape change, the dedup-tuple widening, the cancelled-by-session-shutdown details addition, and the sibling timing paragraph are owned by T19a, T19c, T19d, and T19e respectively.
- Do not introduce a new diagnostic code, `details.kind` discriminator, aggregation surface, or storm-detection layer.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve (this child consumes the field T19a sources).
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

## T19c — Widen always-log dedup key to include invocation_id

> **PARKED** — 2026-05-16T05:40:24Z
> **Reason:** The top-level spec-review-fixer refused to apply the recommended resolution. Refusal reason: Refusal reason: parked-prerequisite mismatch. T19c's Solution approach widens the dedup tuple to reference invocation_id, but the prerequisite siblings T19a (registry invocationId field) and T19b (RuntimeEvent.invocation_id wire field) have both been parked after diverging fix-loops. Applying T19c standalone would write a normative dedup tuple referencing an undefined field.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t19c-widen-always-log-dedup-key-to-include-invocation-id.md`

# T19c — Widen always-log dedup key to include invocation_id

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Deduplication and lifetime rules** sub-block of the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` pins the cascade-twin dedup tuple as `(kind, query_site, message, occurred_at)`, and rule PIC-1 (g) under `id="pic-1"` in the same file restates the same four-field tuple. The tuple has no per-invocation discriminator, so two same-loom sibling invocations whose always-log emissions stamp the same `kind`, `query_site`, `message`, and `occurred_at` collapse into a single dedup-equivalent occurrence even though they originated in distinct invocations. Sibling T19b adds an `invocation_id` field to the `RuntimeEvent` payload that this dedup rule could discriminate on, but the dedup tuple itself does not yet read that field.

## Solution approach

Widen the dedup tuple stated in the **Deduplication and lifetime rules** sub-block of the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` from `(kind, query_site, message, occurred_at)` to `(invocation_id, kind, query_site, message, occurred_at)`, and pin that the always-log channel is session-flat at the wire level while the dedup key is per-invocation. Mirror the same widening in rule PIC-1 (g) under `id="pic-1"` so the two enumerations of the dedup tuple in the same file remain identical. The widening reads the wire field that sibling T19b installs; do not re-author that field here.

## Solution constraints

- Both occurrences of the dedup tuple in the file (the consumer-deduplication clause inside **Deduplication and lifetime rules**, and the restatement in rule PIC-1 (g) under `id="pic-1"`) must be updated together — leaving them divergent is forbidden.
- Preserve the existing four field names (`kind`, `query_site`, `message`, `occurred_at`) verbatim and in their existing order; do not rename, drop, or reorder them.
- Preserve the cascade-twin clause (two emissions sharing the tuple collapse to one occurrence; re-emissions copy the originating instance verbatim including `occurred_at`) and the panic-emission `display: false`-not-applicable clause unchanged apart from the tuple replacement itself.
- The `ActiveInvocationRegistry` shape change, the `RuntimeEvent` wire-field addition, the cancelled-by-session-shutdown details change, and the real-time timing paragraph are owned by T19a, T19b, T19d, and T19e respectively.
- Do not introduce a new diagnostic code, `details.kind` discriminator, aggregation surface, or storm-detection layer.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve.
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve (this child reads the field T19b adds).
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.


---

## T19d — Populate cancelled-by-session-shutdown details with invocation_id

> **PARKED** — 2026-05-16T06:30:00Z
> **Reason:** The top-level spec-review-fixer refused to apply the recommended resolution. Refusal reason: Parked-prerequisite mismatch. T19d's Solution constraints require sourcing details.event.invocation_id from the ActiveInvocationRegistry's invocationId field, which is owned by parked T19a. The constraints forbid both alternative phrasings (re-derive at emission site; parallel id channel). No recommendation-compliant path exists while T19a remains parked.
> **Forensic report:** `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t19d-populate-cancelled-by-session-shutdown-details-with-invocation-id.md`

# T19d — Populate cancelled-by-session-shutdown details with invocation_id

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `Per-invocation operator visibility (clean-cancel path)` rule under `id="session-shutdown-semantics"` in `docs/spec_topics/pi-integration-contract.md` pins the per-invocation `finally`'s `loom/runtime/cancelled-by-session-shutdown` emission as the teardown-time operator-visibility surface, currently populating `details.event.reason` (read from the registry entry's `shutdownReason`) and `details.event.loom` (read from the registry entry's `loom`). Sibling T19a extends `ActiveInvocationRegistry` entries with an `invocationId` field and sibling T19b adds `invocation_id` to `RuntimeEvent`, but the cleanly-cancelled per-invocation note has no spec rule pinning that `details.event.invocation_id` is populated. Without it, cleanly-cancelled concurrent siblings of the same loom collapse onto the same operator-stream row at teardown even after the registry source and wire field exist. The `loom/runtime/cancelled-by-session-shutdown` row in `docs/spec_topics/diagnostics.md` and the nesting convention under `id="session-shutdown-details-conventions"` in the same file inherit the same gap on the diagnostics-side surface.

## Solution approach

Extend the `Per-invocation operator visibility (clean-cancel path)` rule under `id="session-shutdown-semantics"` in `docs/spec_topics/pi-integration-contract.md` to pin that the per-invocation `finally`'s `cancelled-by-session-shutdown` emission populates `details.event.invocation_id` by reading the registry entry's `invocationId` field (the same channel by which `details.event.loom` is read), not by re-deriving an id at the emission site. Mirror the addition in the `loom/runtime/cancelled-by-session-shutdown` row of `docs/spec_topics/diagnostics.md` and in the nesting-convention paragraph under `id="session-shutdown-details-conventions"` in the same file if and only if those locations enumerate the `details.event` field set; otherwise carry no diagnostics-side enumeration drift.

## Solution constraints

- Source `details.event.invocation_id` from the `ActiveInvocationRegistry` entry's `invocationId` field on the per-invocation `finally` (the same channel by which `details.event.loom` is read); do not re-derive an id at the emission site and do not introduce a parallel id channel.
- Preserve the existing `details.event.reason` clauses (the `"quit" | "reload" | "new" | "resume" | "fork" | string` type pin, the four captured-value cases under the **Unknown-reason rule**, the `"<unreadable>"` sentinel rules including the post-deadline residual-gap arm) and the `details.event.loom` clause textually unchanged.
- The `ActiveInvocationRegistry` entry-shape change, the `RuntimeEvent` wire-field addition, the dedup-key widening, and the real-time timing paragraph are owned by T19a, T19b, T19c, and T19e respectively.
- Do not introduce a new diagnostic code or `details.kind` discriminator.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve (this child reads the registry entry T19a defines).
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.
