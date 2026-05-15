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
