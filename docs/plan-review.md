# Triaged Plan Review — plan

_Generated: 2026-06-10T20:55:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T37) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 1 medium retained; 34 low discarded; 4 low/duplicate findings merged into 4 cluster findings; 16 NIT dropped; 0 false dropped._

---

# T01 — Doc-updates convention is unenforced and several Tests bullets are mislabeled against it

**Original headings:**
- *Doc updates* — no gate verifies per-leaf doc updates; mislabeled bullets
- `` `M-T` Tests bullet mislabeled `Convention: (*Doc updates*)` ``

**Original section:** docs/plan_topics/conventions.md
**Kind:** validation, cruft
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The *Doc updates* cross-cutting rule (`conventions.md` §"Cross-cutting rules (every leaf)") mandates that after each leaf the implementer update `README.md`'s status table, append a dated `CHANGELOG.md` line, and log non-plan discoveries to `notes.md`. Unlike the sibling cross-cutting rules (*Specific exception types only*, *Sequential by default*, *REQ-ID discipline*, *Diagnostic message anchors*), this rule is backed by no verification surface: there is no closing-gate check, lint rule, architectural test, or named manual checklist item that confirms the per-leaf doc artifacts were actually written. The closing-gate automation in `H5a` reconciles REQ-IDs, diagnostic codes, and un-anchored MUSTs, but never inspects `README.md`/`CHANGELOG.md`. The obligation can therefore be skipped on any leaf with no signal — it is the only cross-cutting rule with zero enforcement.

Compounding this, three Tests bullets are tagged `Convention: (*Doc updates*)` but assert something unrelated to the doc-update obligation: `H1a` line 8 (`npm run build`/`npm test` run green on an empty `src/**` tree), `H1a` line 9 (the manifest pins the four Pi SDK peers on one tilde line), and `M-T` line 9 (running the fixture loom produces exactly one appended turn and no diagnostic). Each asserts build or behaviour, not a documentation update. The `M-T` line-9 bullet in particular — "running the fixture loom through the harness produces exactly one appended turn and no diagnostic" — is a pure end-to-end happy-path check of the SLSH-2 round-trip that the leaf's first bullet already names; citing *Doc updates* points an implementer at the wrong obligation and lends a false impression that the doc-updates rule is being mechanically asserted.

The two facets are independent: relabeling the bullets does not add enforcement, and adding enforcement does not correct the mislabels. Both must be addressed.

## Plan Documents

- `docs/plan_topics/conventions.md` — *Doc updates* cross-cutting rule (option-dependent)
- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Tests bullets (lines 8–9) (edited)
- `docs/plan_topics/M-T-minimal-slash-command.md` — Tests bullet (line 9) (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — closing-gate scope (option-dependent)

## Spec Documents

None — the *Doc updates* obligation derives from `CLAUDE.md` Document Updates, not spec text; the fix is internal to plan files.

## Affected Leaves

**Phases:** Horizontal, MVP

**Leaves (implementation order):**

- `H1a` — Project scaffold and toolchain — (modified)
- `M-T` — Minimal end-to-end `.loom` slash command (tests) — (modified)
- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified)

## Consequence

**Severity:** advisory

The *Doc updates* rule is the only cross-cutting convention with no verification surface, so per-leaf README/CHANGELOG/notes updates can be silently dropped on any leaf. The mislabeled bullets deepen the gap: a reviewer sees a green `Convention: (*Doc updates*)` Tests bullet and believes the rule is being asserted, when the test checks unrelated build/behaviour — masking the absence of any real doc-update check, and (for `M-T` line 9) misdirecting the test author about which obligation the test closes.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** 288f191 — Add implementation plan with horizontal/MVP/vertical-slice phases (initial *Doc updates* rule, no gate); c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, mislabeled `Convention: (*Doc updates*)` bullets in H1a/M-T)
**History:** The *Doc updates* cross-cutting rule has existed since the plan's first commit (288f191) and was never paired with a closing-gate or checklist check, so the enforcement gap is present from inception; `git log -S 'Doc updates' -- docs/plan_topics/H5a-closing-gate-automation.md` finds no commit that ever wired doc updates into the gate. The mislabeled `Convention: (*Doc updates*)` Tests bullets in `H1a` and `M-T` entered together when those leaves were authored in their current form at c6a664e (2026-06-10), confirmed via `git log -S 'Convention:\` (*Doc updates*)'` on both files.

## Solution Space

**Shape:** single

This finding carries two independent, both-required obligations: relabel the mislabeled Tests bullets, and make the *Doc updates* rule's enforcement posture explicit. Relabeling does not add enforcement and the enforcement edit does not correct the mislabels, so both are applied.

### Recommendation

Do the relabeling first (it is the smaller, scope-bounded edit that lands the posture edit on a stable baseline), then declare the rule's enforcement posture.

**Relabel the mislabeled Tests bullets.** Re-cite each of the three bullets to the obligation it actually verifies, leaving the assertion text unchanged:

- `H1a` line 8 (`npm run build`/`npm test` green on empty `src/**`) and line 9 (manifest tilde-pin assertion): replace `Convention: (*Doc updates*)` with the convention these actually operationalise — the horizontal phase-categories / scaffold-toolchain obligation (the `typebox` pin bullet on line 10 already cites `host-prerequisites.md §pi-sdk-pin` for comparison).
- `M-T` line 9 (fixture loom produces one appended turn, no diagnostic): replace `Convention: (*Doc updates*)` with the `SLSH-2` REQ-ID it asserts — the same REQ-ID the first bullet cites. `M` is the MVP phase, not a horizontal leaf, so a `Convention.`-style citation is not the right home.

**Declare the *Doc updates* rule's enforcement posture.** Annotate the *Doc updates* cross-cutting rule in `conventions.md` that it is contributor-discipline / review-only with no mechanical gate, and add it to a named release/PR checklist item, mirroring how the architectural-scan blind spots are recorded as documented manual gates elsewhere in the plan. This makes the rule's verification posture explicit so no reader expects enforcement that does not exist. (A mechanical closing-gate `CHANGELOG.md`/`README.md` check in `H5a` is the heavier alternative; adopt it only if such a check is independently wanted.)

**Spec edits:** None.

## Relationships

None

