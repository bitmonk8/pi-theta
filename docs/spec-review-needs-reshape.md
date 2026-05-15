# Findings parked for reshape — pi-loom spec.md

_Produced: 2026-05-11_
_Last modified: 2026-05-13 (T22a-family Path-A reshape: T22a2 ratified back into T22a1 after a live SDK lookup against `@mariozechner/pi-coding-agent ~0.72.1` `docs/extensions.md` confirmed the citation text the human-gate was originally protecting against; see retirement note below)._
_Source file: `docs/spec-review.md` (generated 2026-05-08T09:00:00Z; last modified 2026-05-12)_
_Divergence reference: `C:/Users/thomasa/.pi/tmp/monitor-running-agents/2026-05-11T18-08-06Z/divergence-analysis.md`_

## Purpose

This file collects findings extracted from `docs/spec-review.md` because their Recommendation blocks exhibit one or more content shapes that reliably cause the `spec-diff-fix-loop` to diverge — as documented in the divergence-analysis.md report from sessions pi-loom (T22a) and ap-project_service (T60a–d).

Each parked finding has been **excised** from `spec-review.md`; the source file's tally and reshape-pass notes have been updated accordingly. Findings here must be manually reshaped (split or reworded) before re-queuing in `spec-review.md`.

## Reshape criteria applied (any one triggers extraction)

1. **Bimodal obligation** — two structurally independent obligations each generating their own lens fan-out.
2. **Authority-paragraph with inline enumeration** — broad authoritative paragraph containing an inline enumeration of surfaces / behaviours / files / DBs / API entries (dominant divergence loop via spec-lens-traceability, spec-lens-completeness, spec-lens-placement, spec-lens-naming).
3. **Composite spec edits across 3+ files** without an explicit must-precede / co-resolve dependency graph in the finding.
4. **Verbatim-source-citation pattern** — new citation introduced alongside an existing paraphrase the spec already contains (clarity / consistency / contradiction triple-trigger, per divergence-analysis.md §T22a).
5. **Transient `Note` block** referencing other in-flight findings, or forward-references to material that in-queue findings will produce.

Findings NOT flagged: already-split children (Tnna/b/c form), MERGED stubs, genuinely single-targeted-edit findings, findings covered by the preamble's existing reshape-pass records (T01/T04→spec-sweeps, T03→T03a-f, T08→T08a-c, T11→T11a-c, T15→T15a-c, T16→T16a-d, T18→T18a-d, T19→T19a-e).

---

## Retired finding (formerly parked)

**T22a2 retired 2026-05-13 under the T22a-family Path-A reshape.** A live SDK lookup against the V1 pin (`@mariozechner/pi-coding-agent ~0.72.1`, `docs/extensions.md`) confirmed three facts that together resolve the criterion-4 ambiguity T22a2 was carved out to handle:

1. **The named sections exist and are stable in the V1 pin.** `extensions.md` carries a *Lifecycle Overview* section (lines 273–340 of the V1-pin file) and a *Session Events* section (line 388 of the V1-pin file) that together pin the sequential `session_shutdown` → `session_start` flow on `/new`, `/resume`, and `/fork`. The original concern about source-pointer stability was over-conservative — the section headings are well-named and not at risk of paraphrase drift across patch versions.
2. **The SDK supports the paraphrase as a guarantee, not a hedge.** The Lifecycle Overview's per-event arrows show no concurrent-session branch, the Session Events section reads "pi emits `session_shutdown` for the old extension instance, reloads and rebinds extensions for the new session, then emits `session_start`" (singular old/new), and the closed `SessionShutdownEvent['reason']` set `"quit" | "reload" | "new" | "resume" | "fork"` enumerates no concurrent-session signal. The original "if SDK says 'typically' rather than guaranteeing" edge case (which would have downgraded T22a1's paraphrase) is not triggered — no fallback-condition clause is needed.
3. **The fallback-condition clause T22a2 originally proposed is unnecessary.** Because outcome (1) and (2) both land cleanly, the type-side fallback ("if the SDK doc page is unavailable at audit time, the type-side anchor stands as the corroborating source") would be writing prose against a hypothetical that the live lookup ruled out. Including it would create the criterion-4 divergence trigger (paraphrase-vs-citation gap risk) the original parking was meant to avoid.

The citation block now lives **inline in T22a1's Recommendation** (in `spec-review.md`) with the wording grounded in the live SDK lookup. T22a2 is retired without loss — its substantive content (the citation text) is preserved in T22a1; its reason-for-parking (the human gate) is dissolved by the lookup.

The retired finding's body is preserved below as a historical record. **It is not parked and not awaiting a human gate.**

---

## Historical record (formerly parked finding 1 of 1)

**Reshape rationale:** T22a2 matches **Criterion 4 — Verbatim-source-citation pattern**. T22a2 is the second child of the 2026-05-12 manual sub-split of the originally-parked T22a; the first child (T22a1) carries only the anchor `<a id="session-binding-contract"></a>`, the existing-paraphrase sentence, and the `spec.md` opening-sentence forward-link, all of which are auto-resolvable and were re-queued in `spec-review.md`. T22a2 carries the **citation block** that was the actual criterion-4 divergence trigger: a Pi-source reference (`@mariozechner/pi-coding-agent ~0.72.1`, `docs/sdk.md` extension-lifecycle section, plus the `SessionShutdownEvent['reason']` type-side anchor as a corroborating fallback) that introduces a verbatim Pi-prose pin alongside the spec's existing paraphrase. The independently-flaggable components remain those identified in the original T22a parking rationale:

- **Source reference stability** — `docs/sdk.md (extension lifecycle section)` is a prose pointer with no line anchor; spec-lens-traceability will flag "is this pointer stable across SDK minor bumps?" and spec-lens-prescription will flag "over-specifying the audit path in normative prose."
- **Fallback condition** — "If the SDK doc page is unavailable at audit time, the type-side anchor stands as the corroborating source" is a conditional that spec-lens-clarity will flag ("what exactly does 'session-scoped, not process-scoped' mean for `SessionShutdownEvent['reason']`?") and spec-lens-consistency will flag ("does the type-side anchor actually establish session-scoped lifecycle, or only shut-down-reason vocabulary?").
- **Paraphrase-vs-citation gap risk** — the Edge cases note ("if the SDK doc page turns out to say 'typically bound to one session' rather than guaranteeing it, downgrade the spec assertion accordingly") acknowledges the contradiction risk the specifier cannot resolve without inspecting the live SDK. The fixer seeing this conditional is likely to attempt to phrase-match the citation to the paraphrase or add a detection note — both of which expand the diff surface.

**Human gate:** T22a2 cannot be auto-resolved. Before re-queueing it in `spec-review.md`, a human must (a) open `@mariozechner/pi-coding-agent ~0.72.1`'s `docs/sdk.md` and confirm what the extension-lifecycle section actually says about session-binding (guarantee vs observation vs not-discussed), (b) confirm whether the `SessionShutdownEvent['reason']` type-side anchor is in fact session-scoped per its declaration, and (c) decide whether the paraphrase in T22a1's installed sub-section ("A Pi extension instance is bound to exactly one active user session at a time.") needs downgrading to "typically" or rewording before the citation is appended. After (a)–(c), T22a2 should be re-shaped into a single targeted-edit finding (PIC sub-section append only) that reflects the resolved citation text.

**Suggested re-queue form (after human gate):** A single PIC-only finding that appends a `Source of truth:` paragraph immediately under T22a1's installed paraphrase sentence in the `Session-binding contract` sub-section. Edit budget ≤2 sentences. The `spec.md` half of the original T22a is already addressed by T22a1; T22a2 has no `spec.md` edit. The `future-considerations.md` and version-bump-procedure halves remain owned by T22b and T22c.

---

# T22a2 — Session-binding contract Pi-source citation upgrade in PIC

**Original heading:** Concurrent user sessions: Pi guarantee uncited; fallback if Pi adds support undefined (split from T22, part 1 of 3; further sub-split 2026-05-12, citation upgrade only)
**Original section:** docs/spec_topics/pi-integration-contract.md — Host prerequisites > Session-binding contract (sub-section installed by T22a1)
**Kind:** assumptions
**Importance:** medium
**Split from:** T22a (further sub-split 2026-05-12 — anchor + paraphrase + spec.md forward-link routed to T22a1; this sub-finding carries the citation upgrade only).

## Finding

The `Session-binding contract` sub-section installed by T22a1 in `pi-integration-contract.md` carries the existing-paraphrase sentence ("A Pi extension instance is bound to exactly one active user session at a time.") with a stable HTML anchor `#session-binding-contract`, but no Pi-source citation: the load-bearing premise still has no anchor in the Pi corpus that a reader can verify it against. The entire concurrency model (mode-qualified isolation, prompt-mode sequentiality, registry scoping, the cancellation-fan-in argument) presupposes the single-user-session-per-extension-instance contract; the V1 spec-side deferral installed by T22a1 leaves that premise unfalsifiable in the spec corpus until a Pi-side citation lands here.

This sub-finding installs the **Pi-source citation block** that augments T22a1's paraphrase sub-section. It is parked because the citation block introduces three independently lens-flaggable components (source-pointer stability, fallback condition, paraphrase-vs-citation gap) that the divergence analysis identified as the root cause of T22a's original divergence loop, and because the implementer cannot resolve the paraphrase-vs-citation gap without first inspecting the live SDK doc.

## Spec Documents

- `docs/spec_topics/pi-integration-contract.md` — Host prerequisites > Session-binding contract sub-section installed by T22a1 (edited; one new `Source of truth:` paragraph appended inside the existing sub-section)
- `docs/spec.md` — read-only (the opening-sentence forward-link is owned by T22a1; do not re-edit)
- `docs/spec_topics/pi-integration.md` — read-only (cross-check whether session-lifecycle vocabulary lives here; do not duplicate)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the fix is a documentation/citation change. The H1 SDK surface-inventory test (`test/extension/pinned-surface.test.ts`) does not need to grow a new probe entry; the citation lives in prose, not in the surface inventory.

## Consequence

**Severity:** advisory

A reader who tries to verify the `Session-binding contract` sub-section against the pinned Pi SDK has nowhere to land — T22a1 installed the paraphrase but not the source. Implementation can still proceed because the V1 design is internally consistent under the premise; the gap is a maintenance hazard. The contingency in T22b becomes load-bearing today (rather than hypothetical) if the SDK turns out to weaken the binding to "typically" rather than guarantee it; T22a2's resolution is therefore the gate that confirms whether T22b's contingency text needs strengthening.

## Solution Space

**Shape:** single

### Recommendation

**Hard edit budget:** one new paragraph in the existing `Session-binding contract` sub-section of `pi-integration-contract.md`, ≤2 sentences plus the citation. No new MUSTs. No new test fixtures. No edits to `spec.md` (owned by T22a1), to `future-considerations.md` (owned by T22b), or to the version-bump procedure (owned by T22c).

1. **In `docs/spec_topics/pi-integration-contract.md` — Session-binding contract sub-section** (installed by T22a1), append immediately after the paraphrase sentence the following `Source of truth:` paragraph:

   > Source of truth: `@mariozechner/pi-coding-agent ~0.72.1`, `docs/sdk.md` (extension lifecycle section), supplemented by the closed `SessionShutdownEvent['reason']` set already pinned in this document. If the SDK doc page is unavailable at audit time, the type-side anchor (`SessionShutdownEvent['reason']` being session-scoped, not process-scoped) stands as the corroborating source.

   Do not add any further prose, behavioural claim, or normative MUST under this sub-section beyond the appended paragraph above.

Edge cases the implementer must watch:

- The citation chain must terminate at a Pi-side artefact (named SDK doc page or pinned type symbol), not loop back into the loom spec corpus.
- If the SDK doc page on inspection turns out to say "typically bound to one session" rather than guaranteeing it, downgrade the paraphrase sentence T22a1 installed accordingly under this finding rather than over-claiming. T22b's contingency becomes load-bearing today, not hypothetical, in that case — note it in this finding's fix Notes so T22b's later run knows.
- Do not pre-install hooks for T22b or T22c. Those are deliberately out of scope to keep this finding's edit surface bounded.

## Relationships

- T22a1 "Session-binding contract anchor and forward-link missing in PIC and spec.md" — must-follow (T22a1 installs the sub-section this finding augments; resolving T22a2 first would have nowhere to append).
- T22b "Multi-session contingency response is unspecified in Future Considerations" — co-resolve (T22a2's citation may surface a paraphrase-downgrade obligation that T22b's contingency text needs to absorb; the two should be reviewed together when T22a2 is re-queued).
- T22c "Pi version-bump procedure has no step for the session-binding contract" — independent (T22c references the anchor only, not the citation; either order works after T22a1).
- T15c, T23, T34, T21, T36 — same-cluster (uncited-Pi-internals pattern; preserved from original T22a).

---

## Tally — parked findings by criterion

| Criterion | Count | Finding IDs |
|-----------|-------|-------------|
| 1 — Bimodal obligation | 0 | — |
| 2 — Authority-paragraph with inline enumeration | 0 | — |
| 3 — Composite spec edits across 3+ files without dependency graph | 0 | — |
| 4 — Verbatim-source-citation pattern | 0 | — |
| 5 — Transient Note / forward-reference to in-flight findings | 0 | — |
| **Total parked** | **0** | **—** |

**Note on T22 family (post-2026-05-13 Path-A reshape):** After T22a2's retirement above, T22a1 carries the full Recommendation (anchor + paraphrase + Pi-source citation block + spec.md forward-link) with citation text grounded in the live SDK lookup. T22b and T22c remain in `spec-review.md` in their original forms with their `must-precede T22a` Relationships still pointing at T22a's successor (now T22a1, since T22a was originally split and the 2026-05-12 sub-split has been collapsed back). The auto fix-loop addressing order under bottom-up convention is T22a1 → T22b → T22c.

**Borderline calls reviewed and kept in spec-review.md:**

- **T21** (Pi-side slash-handler promise lifecycle) — adds a new paragraph to PIC Cancellation source that includes behavioral MAY clauses referencing `pi.sendMessage` and `ExtensionCommandContext`. Reviewed against criterion 2 (authority-paragraph with inline enumeration): the paragraph does not enumerate discrete surfaces or files in the T60 sense; it makes sequential behavioral guarantees about one lifecycle scenario. Lens expansion risk is judged bounded (each potential finding reduces or clarifies existing text rather than adding new enumeration). Kept.
- **T20** (Resource exhaustion disclaimer) — replaces an existing parenthetical with a 3-category enumeration in `implementation-notes.md`. The categories are resource-exhaustion classes (heap, descriptors, rate-limit), not named spec surfaces. Single-file edit. Kept.
- **T22b** (multi-session contingency) and **T22c** (version-bump procedure step) — simple targeted edits, both consume the `#session-binding-contract` anchor T22a1 installs; auto-resolvable in T22a1 → T22b → T22c order under bottom-up addressing.
