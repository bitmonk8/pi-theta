# Triaged Plan Review — plan

_Generated: 2026-06-11T03:55:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T44) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 2 medium retained; 39 low discarded; 0 low findings merged into 0 medium findings; 16 NIT dropped; 0 false dropped._

---

# T01 — "Release gate" is a fourth top-level section outside the three-category phase taxonomy

**Original heading:** §"Release gate" section heading
**Original section:** Consolidated Plan Review — plan
**Kind:** naming
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`conventions.md` opens by declaring exactly three kinds of phase — Horizontal, MVP, and Vertical slices — and `plan.md`'s own "How to use this plan" step 1 restates that "three phase categories (horizontal / MVP / vertical)" taxonomy. `plan.md` then lays out four top-level phase sections: `## Horizontal phases`, `## MVP phase`, `## Vertical slices`, and `## Release gate`. The fourth, `## Release gate`, is not one of the three declared categories.

Both leaves under `## Release gate` — `H5b` and `H6a` — carry the `H<n><letter>` ID form that `conventions.md` reserves for horizontal leaves, and both cite a **Convention.** field rather than a **Spec.** field, the defining marker of a horizontal leaf. They are therefore horizontal leaves housed under a heading that the phase taxonomy does not name, while the sibling horizontal leaves `H1a`–`H5a`/`H7a` sit under `## Horizontal phases`.

"How to use this plan" step 2 instructs a contributor authoring a new leaf to "link the new leaf into the appropriate section below." A contributor adding a terminal/release-time horizontal leaf has no rule telling them whether it belongs under `## Horizontal phases` or `## Release gate`, because the document never states that `## Release gate` is an editorial sub-grouping of horizontal leaves rather than a distinct fourth category.

## Plan Documents

- `docs/plan.md` — `## Release gate` / `## Horizontal phases` headings (edited)
- `docs/plan_topics/conventions.md` — "Three kinds of phase" intro (edited)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal phases

**Leaves (implementation order):**

- `H5b` — Warn-only live-corpus canary (pre-activation pre-flight) — (resequenced)
- `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate) — (resequenced)

## Consequence

**Severity:** advisory

A contributor adding a release-time horizontal leaf cannot mechanically decide whether to file it under `## Horizontal phases` or `## Release gate` (How-to-use step 2), so the plan's section structure drifts as different authors guess differently. Implementers can still produce a working leaf; the gap is navigational, not blocking.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 5353dd7 — pi-loom plan: resolve "Release-gate activation has no owning leaf" (2026-06-10, Thomas Andersen)
**History:** `conventions.md`'s three-category phase taxonomy predates the defect. Commit 5353dd7 created the new `## Release gate` top-level heading in `plan.md` (initially housing only `H6a`) while resolving the earlier "Release-gate activation has no owning leaf" finding; that fix introduced a fourth top-level section outside the declared taxonomy rather than placing the new horizontal leaf under `## Horizontal phases`. A later commit (ea6b1da, 2026-06-11) added `H5b` under the same heading, compounding but not introducing the mismatch.

## Solution Space

**Shape:** single

### Recommendation

Keep `## Release gate` where it is and mark it explicitly as an editorial sub-grouping of horizontal leaves so it reads as a presentation choice, not a fourth category. In `docs/plan.md`, change the heading to `## Release gate (horizontal)` (or add a one-line lead sentence under it stating that the release-gate leaves are horizontal leaves and this is an editorial sub-grouping of the Horizontal phases above). In `docs/plan_topics/conventions.md`, add a one-line note to the "Three kinds of phase" intro acknowledging that horizontal leaves may be presented under editorial sub-headings (such as a release-gate grouping) without forming a new category.

The `conventions.md` note must state that the sub-grouping does not create a new leaf-ID prefix or a new `Convention.`/`Spec.` rule — release-gate leaves remain horizontal leaves in every other respect. This preserves the `## Release gate` anchor that other findings' relocation fixes target.

## Relationships

None

---

# T28 — Real-host divergence detectable only by a manual, post-merge smoke — undetected-by-CI window is unbounded

**Original heading:** Real-host divergence detected only manually, post-merge
**Original section:** Consolidated Plan Review — plan
**Kind:** risk
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The Pi-SDK pin is the single shared dependency every runtime leaf binds against, and `V18c` owns the version-bump procedure that moves it. `V18c`'s runtime-evidence acceptance gate runs `H4a`'s end-to-end harness against the bumped pin, but that harness drives the in-process session double — `V18c` itself states "a green double-backed run is not real-host coverage." The only mechanism that can witness a double-vs-real-host divergence is `H4a`'s **manual real-host smoke run**, which `H4a` explicitly frames as the "post-merge detection mechanism."

Because the smoke is manual and post-merge while every automated gate is double-backed, a Pi bump whose new SDK diverges from the double can pass green CI and merge with the divergence undetected. `V18c`'s revert framing compounds the gap: its `Ships when` says the prior pin "is restored before merge" on a confirmed-divergence finding, yet the only finding source is a post-merge smoke — so the restore precondition references a signal that does not exist before merge. The plan acknowledges there is no mechanical real-host gate, but it neither bounds the detection window (no named owner, schedule, or merge-gating posture for the smoke) nor annotates that the blast radius of an undetected divergence is every runtime leaf. A revert path exists, so the condition is recoverable; the gap is the unbounded, owner-less window between a divergent merge and a human running the smoke.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — Adds / Ships when (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Tests (acceptance-trigger prose) (option-dependent)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — mirrored revert-path statement (option-dependent)
- `docs/plan_topics/H6a-live-corpus-activation.md` — release-gate manual-smoke checklist item (option-dependent)
- `docs/plan.md` — §Release gate (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — version-bump trigger / revert policy (option-dependent)

## Affected Leaves

**Phases:** Horizontal; Vertical slice V18; Release gate

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)
- `V18c` — Pi version-bump procedure and gates — (modified)
- `V18c-T` — Pi version-bump procedure and gates (tests) — (modified)
- `H6a` — Live-corpus closing-gate activation — (modified)

## Consequence

**Severity:** advisory

A Pi-SDK bump whose new SDK diverges from the in-process session double can merge on green CI; the divergence is invisible to every automated gate and surfaces only when a human eventually runs the manual real-host smoke, with no named owner or scheduled trigger bounding that window. The "restored before merge" revert precondition cannot fire on a post-merge-only signal, so the recovery path is mis-timed against its own trigger.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 81ab342 — pi-loom plan: resolve "version-bump runtime-evidence acceptance gate and revert path" (2026-06-10, Thomas Andersen); 328ba4d — pi-loom plan: resolve "real-host verification gap" (2026-06-10, Thomas Andersen)
**History:** 81ab342 added `V18c`'s revert path with the "restored before merge" timing, on the footing that the runtime-evidence acceptance gate was the divergence signal. 328ba4d then layered the manual real-host smoke onto `H4a` as the "post-merge detection mechanism" and named it in `V18c`'s revert trigger, creating the post-merge-signal / pre-merge-restore tension and the undetected-by-CI window; e7f14dd (2026-06-11) later refined the smoke's acceptance-trigger set in `H4a` but left the merge-gating posture and the window unbounded.

## Solution Space

**Shape:** multiple

This finding carries two independent obligations — a localized blast-radius annotation and a substantive bounding of the detection window — that land on different surfaces and cannot be resolved by one edit.

### Option A — Annotate the divergence blast radius on V18c

**Approach:** Add a blast-radius statement to `V18c` making explicit that an undetected Pi-SDK divergence affects every runtime leaf and is invisible to the double-backed acceptance gate.

**Plan edits:** In `docs/plan_topics/V18c-version-bump-checklist.md`, add to `Adds.` (or the runtime-evidence acceptance-gate `Tests.` bullet) a clause to the effect of "blast radius: all runtime leaves, real-host only — a divergent pin is not witnessed by the double-backed acceptance gate."

**Spec edits:** None.

**Pros:** Localized, low-risk; communicates the scope of an undetected divergence at the leaf that owns the pin.

**Cons:** Documentation-only; does not by itself shorten or bound the detection window.

**Risks:** Minimal.

### Option B — Bound the detection window and reconcile the revert timing

**Approach:** Pin the merge-gating posture of the manual real-host smoke and name a concrete trigger/owner, so the window between a divergent merge and detection is bounded, and reconcile `V18c`'s "restored before merge" with whichever posture is chosen. The fixer picks one posture: (i) make the smoke a **pre-merge** gate on a Pi-version-bump change — then it is not "post-merge" and `V18c`'s "restored before merge" is consistent; or (ii) keep it **post-merge** but name a concrete trigger and owner (who runs it, on which event) and restate `V18c`'s revert as a post-merge revert commit.

**Plan edits:** `docs/plan_topics/H4a-factory-shell-and-harness.md` acceptance-trigger prose (states who runs the smoke and when, and the merge-gating posture); `docs/plan_topics/V18c-version-bump-checklist.md` `Ships when` (revert timing reconciled to the chosen posture); `docs/plan_topics/V18c-T-version-bump-checklist.md` mirrored revert-path statement; `docs/plan_topics/H6a-live-corpus-activation.md` release-gate manual-smoke item if the owner/record-keeping lands at the release gate.

**Spec edits:** `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` if the trigger/revert policy is spec-owned (option-dependent).

**Pros:** Actually bounds or eliminates the undetected window and removes the post-merge/pre-merge timing tension.

**Cons:** Requires a process decision (pre- vs post-merge gating, named owner); larger, multi-leaf diff.

**Risks:** The posture chosen here determines the resolution of the timing-contradiction finding (T27).

### Recommendation

Resolve Option A first: the blast-radius annotation is the scope-bounding, single-leaf edit and lands on a stable baseline. Then resolve Option B against that baseline. For Option B, pin a single merge-gating posture and reconcile `V18c`'s revert timing to it in the same pass that resolves the timing-contradiction finding, since the two share the same decision.

## Relationships

- T27 "V18c Ships-when conflates a pre-merge gate and a post-merge smoke..." — decision-dependency (Option B's merge-gating choice fixes that finding's timing contradiction).
- T31 "Manual real-host fidelity gate leaves no falsifiable record" — same-cluster (record-keeping/owner trace at H6a; shares the named-owner aspect of Option B).
