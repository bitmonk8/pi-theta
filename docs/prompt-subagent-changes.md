# Prompt and subagent changes — implementation plan

```
SCOPE:      spec, plan, implementation review-fix pipelines
MOTIVATION: docs/spec-review-forensic-meta-analysis.md
STATUS:     implementation plan — ready to execute
```

## Overview and motivation

This document specifies the agent, prompt, and document changes
needed to address the failure modes documented in
`docs/spec-review-forensic-meta-analysis.md`. The meta-analysis
covers three diverging forensic reports (T22a1, T20, T19b), 15
wasted inner-loop passes, and 21 false-negative audit lens
dimensions. Its forensic evidence is the source of every change
here.

Scope: three review-fix pipelines.

- **spec pipeline** — most-developed. Forensic evidence applies
  directly.
- **plan pipeline** — forked from spec, missing several layers
  (classifier, parker, forensics, audit chain).
- **implementation pipeline** — forked separately, with its own
  naming inconsistencies plus structural gaps (no inner-loop
  agent, no per-finding fix orchestrator for the review-fix flow).

Five changes plus a unified naming scheme make all three
pipelines structurally symmetric and address the forensic
failure modes:

- **A** — severity-weighted triage at the per-pass classifier.
- **B** — drop class-3 (shape-mandate) solution constraints.
- **C1** — staged lens introduction (correctness → structural →
  prose-quality).
- **D** — scoring system for findings (1–100 numeric, combined-
  score budget rule, must-fix flag).
- **C2** — backtracking on surface expansion (snapshot via
  `git stash create` + anchor refs).

Implementation order: **A → B → C1 → D → C2**. Per-pipeline
sequencing in §Implementation plan at the end.

## Target pipeline structure

The three pipelines must reach a symmetric structure:

```
<authoring prompt>           → populates <findings doc>
<orchestrator slash command> → picks one finding, dispatches:
  <top-level fixer agent>    → applies the finding's edits
  <inner diff-fix loop agent> → review/triage/classify/fix loop on the resulting diff
    <lens corpus>            → per-pass parallel fan-out
    <triage-assessor>        → shared
    <classifier agent>       → trajectory-blind fix/defer decisions
    <diff-fixer agent>       → applies one fix per call
  on failure:
    <forensics agent>        → writes per-finding forensic report
    <parker agent>           → moves finding + dependents into <parked doc>
```

Current gap matrix against this target shape:

| Component | spec | plan | impl |
|---|---|---|---|
| authoring prompt (review existing) | `/spec-review` | `/plan-review` | `/audit-project` / `/audit` |
| authoring prompt (build new) | n/a | n/a | `/implement` (intentionally retained — see §Accepted asymmetries) |
| findings doc | `docs/spec-review.md` | `docs/plan-review.md` | partial: `docs/AUDIT.md` is a run plan; `docs/ISSUES.md` is a flat list; no structured per-finding doc exists |
| parked doc | `docs/spec-review-parked.md` | **missing** | **missing** |
| per-finding fix orchestrator | `/fix-spec-shape-single-findings` | `/fix-plan-shape-single-findings` | **missing** for the review-fix flow (`/audit` Phase 6 is inline-interactive) |
| top-level fixer | `spec-review-fixer` | `plan-review-fixer` | `fixer` (does double duty; split required) |
| inner loop | `spec-diff-fix-loop` | `plan-diff-fix-loop` | inline in `/implement` step 2 (and `/review-fix-loop`) |
| lens corpus | 14 narrow + 3 broad | 6 narrow | 9 narrow + 6 broad |
| triage-assessor | shared | shared | shared |
| consolidator | folded into enricher/reducer chain | folded into triager | `consolidator` (wired only to `/audit`) |
| classifier | `spec-diff-fix-classifier` | **missing** | **missing** |
| diff-fixer | `spec-diff-fixer` | `plan-diff-fixer` | `fixer` (split required) |
| forensics | `spec-fix-failure-forensics` | **missing** | **missing** |
| parker | `spec-review-parker` | **missing** | **missing** |
| audit chain (auditor + applier + reshaper) | three agents | **missing** | **missing** |
| triager / reducer / picker / enricher | full set | partial set | partial set (`consolidator` + `triage-assessor` only) |

Three structural facts about the implementation pipeline that
affect multiple changes:

1. **Two front-ends.** `/implement` is the build-new-thing path
   (takes one `specPath`, runs `implementer`, then a post-
   implementer review/fix loop). `/audit-project` / `/audit` is
   the review-existing-code path (purpose-analogue of
   `/spec-review` / `/plan-review`). `/implement` does **not**
   invoke `/audit`. Both share downstream agents (`review-lens-*`,
   `triage-assessor`, `fixer`).
2. **Ephemeral lens findings.** Lens output lives in
   `<reviewDir>/_*.md` for one session. No persistent structured
   findings doc exists for impl yet (closing this gap is a
   workstream in §Implementation plan).
3. **Inner loop is inlined.** `/implement` step 2 and
   `/review-fix-loop` steps 1–4 each carry the same loop
   scaffolding as duplicated inline prose. Extracting a shared
   `impl-diff-fix-loop` agent is part of change C1.

## Unified naming scheme

The pipelines accumulated naming asymmetries over time
(implementation alone has `implementer`, `fixer`, `consolidator`,
a `review-lens-*` corpus instead of `impl-lens-*`, and
entry-point prompts `/audit-project` / `/audit` instead of
`/impl-review-project` / `/impl-review`). New agents, prompts,
and docs follow the scheme below; existing inconsistent items
are renamed per the migration table.

### Pipeline prefixes

- `spec` — spec review-fix pipeline.
- `plan` — plan review-fix pipeline.
- `impl` — implementation review-fix pipeline. The prefix is
  `impl`, not `audit` (the name of an existing prompt) or
  `review` (collides with generic lens / review-fix terminology).

### Prompts

| Convention | Spec | Plan | Impl |
|---|---|---|---|
| `/<pipeline>-review` | `/spec-review` | `/plan-review` | `/impl-review` |
| `/<pipeline>-review-<scope>` | (n/a) | (n/a) | `/impl-review-project` |
| `/<pipeline>-review-audit` | `/spec-review-audit` | (missing) | (missing) |
| `/reshape-<pipeline>-review` | `/reshape-spec-review` | (missing) | (missing) |
| `/reduce-<pipeline>-review` | `/reduce-spec-review` | (missing) | (missing) |
| `/fix-<pipeline>-shape-single-findings` | `/fix-spec-shape-single-findings` | `/fix-plan-shape-single-findings` | `/fix-impl-shape-single-findings` |

### Agents — review chain

| Convention | Spec | Plan | Impl |
|---|---|---|---|
| `<pipeline>-review-finding-enricher` | `spec-review-finding-enricher` | `plan-review-finding-enricher` | (missing) |
| `<pipeline>-review-finding-consolidator` | (folded into enricher/reducer) | (folded into triager) | `impl-review-finding-consolidator` |
| `<pipeline>-review-finding-reducer` | `spec-review-finding-reducer` | (missing) | (missing) |
| `<pipeline>-review-reduction-runner` | `spec-review-reduction-runner` | (missing) | (missing) |
| `<pipeline>-review-triager` | `spec-review-triager` | `plan-review-triager` | (missing) |
| `<pipeline>-review-shape-single-picker` | `spec-review-shape-single-picker` | `plan-review-shape-single-picker` | (missing) |
| `<pipeline>-review-fixer` | `spec-review-fixer` | `plan-review-fixer` | `impl-review-fixer` |
| `<pipeline>-review-parker` | `spec-review-parker` | `plan-review-parker` | `impl-review-parker` |
| `<pipeline>-review-finding-lens-auditor` | `spec-review-finding-lens-auditor` | (missing) | (missing) |
| `<pipeline>-review-audit-applier` | `spec-review-audit-applier` | (missing) | (missing) |
| `<pipeline>-review-auto-reshaper` | `spec-review-auto-reshaper` | (missing) | (missing) |

### Agents — inner-loop chain

| Convention | Spec | Plan | Impl |
|---|---|---|---|
| `<pipeline>-diff-fix-loop` | `spec-diff-fix-loop` | `plan-diff-fix-loop` | `impl-diff-fix-loop` |
| `<pipeline>-diff-fix-classifier` | `spec-diff-fix-classifier` | `plan-diff-fix-classifier` | `impl-diff-fix-classifier` |
| `<pipeline>-diff-fixer` | `spec-diff-fixer` | `plan-diff-fixer` | `impl-diff-fixer` |

### Agents — forensics

| Convention | Spec | Plan | Impl |
|---|---|---|---|
| `<pipeline>-fix-failure-forensics` | `spec-fix-failure-forensics` | `plan-fix-failure-forensics` | `impl-fix-failure-forensics` |

### Agents — lens corpora

| Convention | Spec | Plan | Impl |
|---|---|---|---|
| `<pipeline>-lens-<name>` | 14 `spec-lens-*` | 6 `plan-lens-*` | 9 `impl-lens-*` |
| `<pipeline>-lens-<name>-broad` | 3 `spec-lens-*-broad` | (none) | 6 `impl-lens-*-broad` |

### Docs

| Convention | Spec | Plan | Impl |
|---|---|---|---|
| `docs/<pipeline>-review.md` | `docs/spec-review.md` | `docs/plan-review.md` | `docs/impl-review.md` |
| `docs/<pipeline>-review-parked.md` | `docs/spec-review-parked.md` | `docs/plan-review-parked.md` | `docs/impl-review-parked.md` |
| `docs/<pipeline>-review-forensic-analysis.md` | `docs/spec-review-forensic-analysis.md` | (missing) | (missing) |
| `docs/<pipeline>-review-needs-reshape.md` | `docs/spec-review-needs-reshape.md` | (missing) | (missing) |
| `docs/<pipeline>-sweeps.md` | `docs/spec-sweeps.md` | (missing) | (missing) |

### Top-level / inner-loop fixer split

The existing `fixer` agent does double duty — top-level
per-finding fixing (`/audit` Phase 6, future
`/fix-impl-shape-single-findings`) and inner-loop per-pass
fixing (`/implement` step 2 inline loop, future
`impl-diff-fix-loop`). Spec and plan pipelines have separate
agents for these roles; impl gets the same split:

| Role | Agent | Caller |
|---|---|---|
| Top-level (apply one full finding's intended edits) | `impl-review-fixer` | `/audit` Phase 6; `/fix-impl-shape-single-findings` |
| Inner-loop (apply one fix-class triage finding per pass) | `impl-diff-fixer` | `/implement` step 2's inline loop; `impl-diff-fix-loop` |

The two agents may share most of their prompt body initially —
divergence comes as their behavioural roles diverge. The split
is performed once during the bulk-rename workstream
(§Implementation plan).

### Naming exceptions (intentional)

Four names do **not** follow the pipeline scheme. The asymmetry
is intentional and preserved (see also §Accepted asymmetries):

- `triage-assessor` — shared across all three pipelines.
- `implementer` — build-new-thing agent; no spec/plan analogue.
- `/implement` — build-new-thing prompt; same reason.
- `/review-fix-loop` — general-purpose review tool, not part of
  any pipeline.

### Migration table

Items whose current name does not follow the scheme. All renames
are impl-pipeline-only — spec and plan already follow the scheme.

| Current name | Renamed to | Type |
|---|---|---|
| `/audit-project` | `/impl-review-project` | prompt |
| `/audit` | `/impl-review` | prompt |
| `consolidator` | `impl-review-finding-consolidator` | agent |
| `fixer` | **split** into `impl-review-fixer` + `impl-diff-fixer` | agents (see fixer split above) |
| `review-lens-<name>` (×9) | `impl-lens-<name>` (×9) | agents |
| `review-lens-<name>-broad` (×6) | `impl-lens-<name>-broad` (×6) | agents |

Renames are lexical; updates are scriptable per call site. The
bulk-rename + fixer-split workstream is in §Implementation plan.

## Change A — severity-weighted triage at the per-pass classifier

Motivation: `docs/spec-review-forensic-meta-analysis.md` §A. The
classifier currently treats every fix-class lens finding as
equally promotable: a low-importance prose-quality finding can
block a higher-importance correctness fix indefinitely.

Rule (A as foundational; change D refines clause 1):

1. `severity(raised) > severity(origin)` → **fix (MUST)**. If
   only remediations all violate a scope constraint, exit
   `must-fix-blocked`.
2. `fix_risk(raised) == very-low` → **fix (SHOULD)**.
3. Else → **defer to debt** with rationale
   `lower-importance-than-originating-finding`.

When D ships, clause 1 upgrades to the combined-score budget
rule (`Σ raised ≤ S`). Clauses 2 and 3 are preserved under D
unchanged.

### Spec pipeline

| Agent / command | Change |
|---|---|
| `spec-lens-*` (14 narrow) | Attach `importance` tier to every finding raised. One-line addition per lens. |
| `spec-diff-fix-classifier` | New severity-comparison logic. New route `must-fix-blocked-by-scope-guard`. New defer rationale `lower-importance-than-originating-finding`. |
| `spec-diff-fix-loop` | New STATUS code `must-fix-blocked`. Per-pass severity stats in NOTES. |
| `/fix-spec-shape-single-findings` | Route `must-fix-blocked` → forensics → parker. |
| `spec-fix-failure-forensics` | Handle new failure mode in `Status:` taxonomy. |
| `spec-review-parker` | Handle new failure mode in `FailureMode:` parameter. |
| `docs/spec-review.md` findings | Existing `high`/`medium`/`low` triage tag reused as `severity(origin)`. No content migration. |

### Plan pipeline

Plan has no classifier agent; triage logic lives inline in
`plan-diff-fix-loop`. Extract a `plan-diff-fix-classifier`
agent first, then port A.

| Agent / command | Change |
|---|---|
| `plan-lens-*` (6) | Attach `importance` tier. |
| **new** `plan-diff-fix-classifier` | Extract policy from `plan-diff-fix-loop`. Same context-isolation discipline as `spec-diff-fix-classifier`. Add severity-comparison logic. New route `must-fix-blocked-by-scope-rule`. New defer rationale `lower-importance-than-originating-finding`. |
| `plan-diff-fix-loop` | Replace inline policy with call to classifier. New STATUS code `must-fix-blocked`. Per-pass severity stats in NOTES. |
| `/fix-plan-shape-single-findings` | Route `must-fix-blocked` → `plan-fix-failure-forensics` → `plan-review-parker`. |
| `plan-review-triager` | Confirm `importance` tag is attached per finding. |

### Implementation pipeline

The `severity(origin)` signal has two composable sources:

- **Originating task document's severity.** Spec / plan
  finding carries `high`/`medium`/`low` from its triager.
  Bug report carries a severity field. Informal TODO defaults
  to `medium`.
- **Policy string floor.** `/implement` policy is hardcoded;
  `/review-fix-loop` policy is user-supplied via `$@`. Policy
  acts as a floor on what gets fixed.

Effective `severity(origin) = max(severity(originating-doc), severity-floor(policy))`.

| Agent / command | Change |
|---|---|
| `impl-lens-*` (rename of `review-lens-*`; 9 narrow) | Attach `importance` tier. |
| **new** `impl-diff-fix-classifier` | Reads `_triage.md` + `specPath` + the `/implement` policy. Same context-isolation as `spec-diff-fix-classifier`. New route `must-fix-blocked`. New defer rationale `lower-importance-than-originating-task`. |
| `/implement` step 2 (Review/Fix Loop) | Replace inline policy with call to `impl-diff-fix-classifier`. Pass `specPath` as originating-doc reference. On `must-fix-blocked`: surface to user with pointer to `specPath`. |
| `triage-assessor` | No change. |

The four hardcoded policy clauses in `/implement` step 2
collapse into a single classifier invocation:

| Original clause | Replaced by |
|---|---|
| Trust issues always fixed | `must-fix: true` flag on trust findings (handled by D's blocker clause) |
| High risk/complexity + low impact: ignore | Cheap-fix branch inverted — not-cheap + low-score → defer to debt |
| High risk/complexity + marginal impact: ignore | Same as above |
| Everything else: fix | Score-budget rule + cheap-fix branch decide per-finding |

## Change B — drop class-3 (shape-mandate) solution constraints

Motivation: `docs/spec-review-forensic-meta-analysis.md` §B.
Three classes of "Solution constraints" exist in finding text:

- **Class 1 — cross-reference ownership pins** (negative space:
  "don't touch T22b's territory"). **Keep.**
- **Class 2 — project-policy pins** (negative space:
  "no-invented-ids", "no Pi MUST in loom-side voice"). **Keep.**
- **Class 3 — shape mandates** (positive space: "must enumerate
  three resource classes", "must use positive ownership-boundary
  statement"). Every diverging and cycled spec case failed
  inside a class-3 constraint. **Drop.**

Migration choices: aggressive sweep (strip class-3 from every
finding in one pass) or lazy strip-on-touch (strip on each
finding's next picker / audit / reshape pass).

### Spec pipeline

| Agent / command | Change |
|---|---|
| `/spec-review` (initial finding authoring) | Stop authoring class-3 constraints in `## Solution constraints`. Class 1 and 2 remain. |
| `spec-review-shape-single-reducer` / `spec-review-finding-reducer` | Same. |
| `spec-review-reshape` (the `/reshape-spec-review` prompt) | Same. |
| `spec-review-finding-lens-auditor` | Stop checking class-3. RISK predictions widen to span alternative shapes the loop might adopt. |
| `spec-review-fixer` (top-level) | Stop emitting class-3 in `## Scope guards (for inner loop)` section. |
| `spec-diff-fixer` (inner) | No longer refuse fixes based on class-3 ScopeGuards. Class 1+2 still binding. |
| `spec-diff-fix-loop` | ScopeGuards forwarded to inner fixer reduced to class 1+2 only. |
| `docs/spec-review.md` + `docs/spec-review-parked.md` | Aggressive sweep (cheaper and more consistent). |

### Plan pipeline

Plan-review findings plausibly carry the same class-3 problem;
verify by inspecting `docs/plan-review.md` before bulk sweep.
Default to lazy strip-on-touch.

| Agent / command | Change |
|---|---|
| `/plan-review` | Stop authoring class-3 constraints. Class 1+2 remain. |
| `plan-review-finding-enricher` | Same. |
| `plan-review-triager` | Same. |
| `plan-review-fixer` | Stop emitting class-3 in scope-guard outputs. |
| `plan-diff-fixer` | No longer refuse fixes based on class-3 scope guards. |
| `plan-diff-fix-loop` | Scope guards forwarded to inner fixer reduced to class 1+2 only. |
| `docs/plan-review.md` | Lazy strip-on-touch. |

### Implementation pipeline

Impl has no persistent findings document and no lens-output
ScopeGuards. The originating task document (`specPath`) can
carry class-3 shape mandates — most often when it is a spec /
plan finding (covered upstream by B-spec / B-plan), occasionally
when it is a hand-written task description that over-specifies
shape ("the fix must use a singleton", "the endpoint must be
implemented as a single file").

For informal `specPath` documents, treat class-3 shape mandates
as **hints**, not constraints. If a hint conflicts with a
higher-severity lens finding raised during step 2, the
implementer adopts an alternative shape and surfaces
`shape-hint-not-satisfied: <hint> — alternative adopted because
<lens X with severity Y>` in the run summary.

| Agent / command | Change |
|---|---|
| `implementer` | Add the hint-vs-constraint rule: class-1 + class-2 in `specPath` remain binding; class-3 are hints. Surface `shape-hint-not-satisfied` events in summary. |
| `/implement` step 3 (Summary) | Surface `shape-hint-not-satisfied` events alongside fixed/ignored summary. |
| `impl-diff-fixer` (split from `fixer`) | Same hint-vs-constraint rule when invoked from `/implement` step 2's inline loop (today) or `impl-diff-fix-loop` (post-extraction) to discharge a high-severity lens finding that conflicts with an informal-doc shape mandate. |
| `impl-review-fixer` (split from `fixer`) | Hint-vs-constraint rule **not** needed — findings in `docs/impl-review.md` should already be free of class-3 mandates (impl-side application of B's authoring discipline). |

## Change C1 — staged lens introduction

Motivation: `docs/spec-review-forensic-meta-analysis.md` §C1.
Run the lens corpus in tiers so prose-quality lenses cannot
expand the surface against unstable structural content.

| Tier | Purpose | Convergence target |
|---|---|---|
| 1 | Correctness | zero fix-class findings |
| 2 | Structural | zero fix-class findings |
| 3 | Prose-quality | converge under combined-score budget (D); per-stage budget cap as backstop |

The loop runs tier 1 to convergence, then introduces tier 2
(with tier 1 still asserted on every subsequent pass), then
introduces tier 3.

### Spec pipeline

Tiering of the 14 narrow spec lenses (from the meta-analysis):

| Tier | Lenses |
|---|---|
| 1 — correctness | `spec-lens-assumptions`, `spec-lens-consistency`, `spec-lens-error-model`, `spec-lens-completeness`, `spec-lens-traceability`, `spec-lens-implementability`, `spec-lens-prescription` |
| 2 — structural | `spec-lens-placement`, `spec-lens-scope`, `spec-lens-external-entities` |
| 3 — prose-quality | `spec-lens-clarity`, `spec-lens-cruft`, `spec-lens-naming`, `spec-lens-testability` |

| Agent / command | Change |
|---|---|
| `spec-lens-*` (each) | Declare a tier in metadata. One-line addition. |
| `spec-diff-fix-loop` | Invoke lenses in stages. Per-stage convergence check. New status fields `STAGE:` + `STAGE_PASSES:` in output block. |
| `spec-diff-fix-classifier` | Stage-aware: knows which tier is active. Severity comparison still applies within stage (compatible with A). |
| `/fix-spec-shape-single-findings` | NOTES surfaces stage-level details on failure. |

### Plan pipeline

Tiering of the 6 narrow plan lenses (verify against actual lens
prompts before adopting):

| Tier | Lenses |
|---|---|
| 1 — correctness | `plan-lens-spec-fidelity`, `plan-lens-spec-coverage`, `plan-lens-validation`, `plan-lens-risk` |
| 2 — structural | `plan-lens-ordering`, `plan-lens-step-atomicity` |
| 3 — prose-quality | (none — plan-lens corpus has no prose-quality lenses) |

Tier 3 being empty is a simplification, not a gap. Tier 1 must
converge before tier 2 runs, removing the chance that a
structural lens fires against unstable correctness content.

| Agent / command | Change |
|---|---|
| `plan-lens-*` (each) | Declare a tier. |
| `plan-diff-fix-loop` | Invoke lenses in stages. Per-stage convergence check. New status fields `STAGE:` + `STAGE_PASSES:`. |
| `plan-diff-fix-classifier` (new, per A) | Stage-aware. |
| `/fix-plan-shape-single-findings` | NOTES surfaces stage-level details on failure. |

### Implementation pipeline

Tiering of the 9 narrow impl lenses:

| Tier | Lenses |
|---|---|
| 1 — correctness | `impl-lens-correctness`, `impl-lens-error-handling`, `impl-lens-testing` |
| 2 — structural | `impl-lens-placement`, `impl-lens-separation`, `impl-lens-doc-mismatch` |
| 3 — prose-quality | `impl-lens-naming`, `impl-lens-cruft`, `impl-lens-simplification` |

The `impl-lens-*-broad` variants tier identically.

C1 requires extracting an `impl-diff-fix-loop` agent (impl has
no inner-loop agent today — step 2 of `/implement` is inlined,
and the same scaffolding is duplicated in `/review-fix-loop`).
Extraction also eliminates the duplication.

| Agent / command | Change |
|---|---|
| `impl-lens-*` (rename of `review-lens-*`) | Declare a tier. One-line addition. Includes the `-broad` variants. |
| **new** `impl-diff-fix-loop` | Extract loop scaffolding from `/implement` step 2 and `/review-fix-loop` steps 1–4. Mirror `spec-diff-fix-loop`'s structure: tiered lens dispatch, per-tier convergence, `STATUS:` / `PASSES:` / `FIXCOUNTS:` / `STAGE:` output block. Accepts a policy reference (caller-supplied) and a lens-corpus selector (narrow-only vs narrow+broad). |
| `impl-diff-fix-classifier` (new, per A) | Stage-aware. |
| `/implement` step 2 | Replace inline loop with call to `impl-diff-fix-loop`, passing the hardcoded `/implement` policy + narrow-only corpus. |
| `/review-fix-loop` steps 1–4 | Replace inline loop with call to `impl-diff-fix-loop`, passing the user's `$@` policy + narrow+broad corpus. |

## Change D — scoring system for findings

Motivation: `docs/spec-review-forensic-meta-analysis.md` §A's
closing note ("Later refinement could attach explicit per-finding
importance at lens output or at audit time") plus the T22a1
soft-squeeze pathology (many small prose-quality findings against
a small placement edit collectively block convergence).

D replaces A's per-finding clause 1 with a stricter combined-
score budget rule. The two rules differ in convergence
philosophy:

- A's clause 1: "if raised > origin, MUST-fix the raised."
  The loop attempts to converge by fixing the higher-severity
  finding.
- D's budget rule: "if `Σ raised > S`, exit." The loop bails
  out and the originating finding parks.

D's behaviour is stricter and more meta-analysis-aligned (early
exit on divergent trajectories rather than try-harder
convergence). D also subsumes recs 5, 6, 7 from the meta-
analysis and replaces C2's k-multiplier with a score-based
threshold.

### Score scale

Each finding carries a numeric `score` in `1..100` plus an
orthogonal boolean `must-fix` flag. Canonical anchor mapping:

| Tier | Anchor score | Meaning |
|---|---|---|
| NIT | 1–2 | Trivial; cosmetic only. |
| low | 5 | Minor; localised. |
| medium | 25 | Substantive; affects clarity / structure of one section. |
| high | 100 | Material; affects correctness / contract / external interface. |
| blocker | (any score) + `must-fix: true` | Cannot be deferred regardless of budget. Typically high score + flag; the flag makes it non-defer-able. |

Scale is quasi-exponential: `high` is ~20× worse than `low`,
~50× worse than NIT. Non-linearity matches observation — a
single error-model defect can outweigh ten clarity nits.

Within-tier tuning (`medium-low` = 15, `medium-high` = 35) is
permitted when the triager has cause; tier labels are anchors,
not buckets.

### Score = impact only; fix-cost stays separate

The score measures **severity of leaving the finding unfixed**
(pure impact). Fix cost is tracked separately on the existing
`triage-assessor` axes (`Fix Complexity`, `Fix Risk`).

The two-clause structure (score-budget + cheap-fix) is the
formal expression of a cost-benefit decision:

- **Benefit side — score-budget clause.** Don't let accumulated
  un-fixed defect weight exceed the value of the fix being
  attempted.
- **Cost side — cheap-fix clause.** When the cost to fix is
  approximately zero (low complexity, low risk), even small
  benefits justify the fix. Cheap fixes don't consume the
  benefit budget because their cost-to-fix-now is dominated by
  their cost-to-defer-and-revisit.

The current `/implement` "all cruft is must-fix" rule follows
directly from the cheap-fix clause — cruft is typically low
score AND low fix-cost; the cheap-fix branch handles it without
a special carve-out. D therefore replaces multiple hardcoded
categorical rules with one principled cost-benefit comparison.

### Combined-score rule

For each fix attempt on an origin finding with score `S`:

1. **Blocker check.** Any raised finding with `must-fix: true`
   must be addressed in this pass. If the only viable
   remediations all violate a class-1 / class-2 scope
   constraint, exit `must-fix-blocked` immediately. Blockers
   cannot be deferred.
2. **Cheap-fix branch.** All raised findings with
   `fix_risk == very-low` AND low complexity are fixed eagerly
   in this pass, regardless of score. They do not consume
   budget.
3. **Budget check.** Sum the scores of remaining raised findings
   (non-blocker, non-cheap). The sum must be at most `S`:

   `Σ score(raised, non-blocker, non-cheap) ≤ S`

   - If yes: defer those findings to debt with rationale
     `score-budget-defer`. Proceed.
   - If no: exit `must-fix-blocked` with rationale
     `score-budget-exhausted`.

**Boundary case and the `must-fix` flag.** A raised finding
scored at exactly the origin's score is defer-able under `≤`.
For findings that must never be deferred regardless of origin
(trust issues per `/implement`'s policy, security blockers,
contract-violation findings), set `must-fix: true`. The blocker
clause fires before the budget check. Score alone is not
sufficient for sharp non-deferrability — the flag is what makes
a finding never-defer.

Worked examples (S = 100, a high-severity origin):

- 19 lows raised (Σ = 95): defer all, proceed.
- 4 mediums raised (Σ = 100): defer all, proceed (boundary
  admitted under `≤`).
- 5 mediums raised (Σ = 125): fails budget. Exit
  `must-fix-blocked`.
- 3 mediums + 4 lows raised (Σ = 95): defer all, proceed.
- 1 blocker raised with no scope-clean remediation: exit
  `must-fix-blocked` immediately (blocker clause).
- 1 medium + 1 NIT raised, both `fix_risk == very-low`: fix
  both eagerly, no budget consumption.

### Lenses emit tier; triage assigns numeric score

Lens authors emit one of NIT / low / medium / high / blocker
citing the lens's own scoring rubric. The triager
(`spec-review-triager`, `plan-review-triager`, future impl-side
triager) converts tier → canonical anchor score. For per-pass
lens output (not review-doc findings), `triage-assessor`
performs the same conversion.

Two-stage assignment matters because LLM numeric output is
noisy (two runs of the same lens on the same finding may emit
22 and 31). Stable tier vocabulary + deterministic numeric
mapping eliminates that noise. Within-tier tuning by the triager
is permitted when justified.

### Per-lens scoring rubrics

Each lens prompt gains a `## Scoring rubric` section listing
what counts as each tier within that lens's domain. ~5–10 lines
per lens. Rubrics are domain-specific.

Sample rubric (illustrative; actual rubrics are written
per-lens):

```markdown
## Scoring rubric

Emit one of: NIT, low, medium, high, blocker.

- **NIT** — word-level: a single inconsistent capitalization,
  a typo, an awkward inline phrasing.
- **low** — sentence-level: a pronoun referent is briefly
  ambiguous; one phrase could be tightened.
- **medium** — section-level: a paragraph's logical flow is
  unclear; a definition is missing for a term used downstream.
- **high** — cross-section: contradictory phrasing across two
  sections leaves the spec's normative intent uncertain.
- **blocker** — ambiguity in a normative MUST clause that would
  produce divergent compliant implementations.
```

Authoring rubrics for all 38 lenses across the three pipelines
is a bounded one-time task. Execution model is in
§Implementation plan.

### Manually entered findings

Hand-entered findings (human review feedback dropped into
`docs/spec-review.md`, a bug report dropped into
`docs/impl-review.md`, etc.) need a tier on entry. Default if
unspecified is `medium` (25); the next picker / audit / triage
pass converts to canonical score and may revise.

### Spec pipeline

| Agent / command | Change |
|---|---|
| `spec-lens-*` (14 narrow + 3 broad) | Add `## Scoring rubric` section. Emit tier (not number). |
| `spec-review-triager` | Convert tier → score for every finding. Replace `high`/`medium`/`low` tags with numeric anchor + within-tier tuning. |
| `spec-diff-fix-classifier` | Apply combined-score rule (replaces A's per-finding rule). Track per-pass running sum. Emit `score-budget-defer` and `score-budget-exhausted` rationales. |
| `spec-diff-fix-loop` | Forward origin score `S` and per-pass score sum into NOTES. New STATUS sub-rationale `score-budget-exhausted` under `must-fix-blocked`. |
| `docs/spec-review.md` | Existing tier tags map to canonical anchors at next triage pass. Lazy migration. |

### Plan pipeline

| Agent / command | Change |
|---|---|
| `plan-lens-*` (6) | Add `## Scoring rubric` section. Emit tier. |
| `plan-review-triager` | Convert tier → score. |
| `plan-diff-fix-classifier` (new, per A) | Apply combined-score rule. |
| `plan-diff-fix-loop` | Same NOTES + STATUS sub-rationale as spec. |
| `docs/plan-review.md` | Same lazy migration as spec. |

### Implementation pipeline

| Agent / command | Change |
|---|---|
| `impl-lens-*` (9 narrow + 6 broad) | Add `## Scoring rubric` section. Emit tier. |
| `triage-assessor` | Convert tier → score for every raised lens finding. No change to other metadata outputs. |
| `impl-diff-fix-classifier` (new, per A) | Apply combined-score rule. Origin score `S` from `specPath`'s severity tag (spec finding triage tag, bug report severity field, or default `medium` = 25). |
| `impl-diff-fix-loop` (new, per C1) | Same NOTES + STATUS sub-rationale. |
| Future `docs/impl-review.md` | Triager assigns score at write time. |

### Backward compatibility

No content rewrite required. Existing tier tags in
`docs/spec-review.md` and `docs/plan-review.md` are interpreted
as canonical anchors at the next triage pass. The classifier
rule change is per-lens: until each lens emits a tier, the
classifier falls back to A's per-finding rule for that lens's
findings.

## Change C2 — backtracking on surface expansion

Motivation: `docs/spec-review-forensic-meta-analysis.md` §C2.
Snapshot the working tree at each pass / stage boundary. If
pass N's raised-finding score sum > k × pass N−1's sum
(suggested k = 1.5 or 2), revert to the pass N−1 snapshot,
mark the pass-N fix that triggered the expansion as poisoned,
and re-run pass N excluding the poisoned fix. Repeat poisoning
across two consecutive passes → exit
`surface-expansion-irrecoverable`.

When D is live, the threshold is score-sum-based as above.
Pre-D, the fallback is raw fix-class count (sum-pass-N > k ×
count-pass-N−1).

### Implementation: snapshot mechanism

The snapshot mechanism is identical across all three pipelines
and is specified once here.

**Decision: `git stash create` + anchor refs, NOT commits.**

Reasons against commits:

- **History pollution.** Even with eventual reset, the branch
  tip moves; reflog keeps partial states; CI / hooks / IDEs
  react to each move.
- **Hooks fire.** Pre-commit and post-commit hooks run on every
  snapshot. On projects with slow hooks (linters, formatters,
  type-check), this multiplies pass cost by N.
- **Squash-before-push complexity.** On success you would have
  to fold N intermediate commits into one logical commit.
- **Conceptual integrity.** Snapshots assert "this is a
  recovery point", not "this state is intentional and branch-
  reachable".

The stash stack (`git stash push` / `pop`) is also rejected:
pollutes the user's stash list, LIFO doesn't compose with
pass-indexed snapshots, pop is destructive on success.

**The mechanism.** `git stash create` is the plumbing version
of stash: builds the stash commit objects (working tree, index,
untracked with `-u`) and returns the SHA, but does not push to
the stash stack and does not move any ref. Anchoring with
`git update-ref` under a custom namespace keeps the SHA alive,
indexable by pass number, and invisible to user-facing git
commands.

Namespace: `refs/loom/snapshots/<runId>/<passN>`.

**Snapshot commands** (run by the inner-loop agent at each pass
entry):

```bash
RUN_ID=$(date -u +%Y-%m-%dT%H-%M-%S)_$(openssl rand -hex 3)
SNAPSHOT_NS="refs/loom/snapshots/${RUN_ID}"

# Baseline snapshot — working tree as it was when the loop entered.
BASELINE=$(git stash create -u -m "loom baseline ${RUN_ID}")
git update-ref "${SNAPSHOT_NS}/baseline" "$BASELINE"

# Each pass N, before applying fixes:
PASS_SNAP=$(git stash create -u -m "loom pass-${N} ${RUN_ID}")
git update-ref "${SNAPSHOT_NS}/pass-${N}" "$PASS_SNAP"
```

**Restore command** (run on backtrack — to baseline or pass
N−1):

```bash
git reset --hard HEAD               # discard tracked changes since HEAD
git clean -fd                       # discard untracked since HEAD
git stash apply --index "$TARGET"   # restore tracked + index + untracked
```

`$TARGET` is the SHA from `git rev-parse refs/loom/snapshots/${RUN_ID}/baseline`
(or `.../pass-${N-1}` for incremental backtrack).

**Snapshot frequency: every pass.** Each pass gets its own
snapshot before fixes apply. Cost is one tree-write + one
ref-update per pass — negligible regardless of project size.

**Cleanup-on-startup.** The inner-loop agent reaps stale
snapshot refs older than 24h at startup:

```bash
for ref in $(git for-each-ref --format='%(refname)' refs/loom/snapshots/); do
  ref_run=$(echo "$ref" | cut -d/ -f4)
  ref_age_hours=$(( ($(date -u +%s) - $(date -u -d "${ref_run%_*}" +%s 2>/dev/null || echo 0)) / 3600 ))
  if [ "$ref_age_hours" -gt 24 ]; then
    git update-ref -d "$ref"
  fi
done
```

The 24-hour threshold is a default; project config can override.
Reaping at startup keeps cleanup co-located with the agent that
creates the refs.

**Keep-on-failure for forensics.** On any failure exit
(`surface-expansion-irrecoverable`, `failed-cap`,
`must-fix-blocked`, `limit-cycle`, `diverging`), snapshot refs
are **not** deleted. The forensics agent needs them to diff
pass-N against pass-N−1. Snapshots are deleted only on
successful exit (`STATUS: ok`) or by the 24h reaper.

Forensics agents read refs by name (`refs/loom/snapshots/<runId>/*`)
and diff via standard `git diff <ref1> <ref2>` syntax.

**Edge cases:**

| Edge case | Handling |
|---|---|
| User has staged changes when loop starts | Captured by baseline; restoration preserves them. |
| Untracked files created during loop | Captured by `-u`; restored by `stash apply --index`. |
| `.gitignore`d build artifacts | Excluded automatically by stash semantics — desirable. |
| File mode / symlink changes | Tracked by git natively; no special handling. |
| Concurrent loop runs in different worktrees | Each has its own `RUN_ID` namespace; no collision. |
| Submodules with live edits | Stash captures submodule HEAD pointers, not contents. Flag in project README if a project edits submodule contents during fix loops. |
| Restoration when HEAD moved during loop | The loop never commits. If something external moves HEAD mid-loop, abort the loop. |
| Session crash mid-loop | Orphan refs reaped at next inner-loop agent startup. |

### Spec pipeline

| Agent / command | Change |
|---|---|
| `spec-diff-fix-loop` | Per-pass snapshot per the mechanism above. Surface-expansion detector with k threshold (score sum post-D; raw count pre-D as fallback). Backtrack-and-exclude protocol. New STATUS code `surface-expansion-irrecoverable`. Snapshots retained on failure for forensics. |
| `spec-diff-fix-classifier` | Read poisoned-fix list and exclude marked fixes from the active queue. |
| `/fix-spec-shape-single-findings` | Route `surface-expansion-irrecoverable` → forensics → parker. |
| `spec-fix-failure-forensics` + `spec-review-parker` | Handle the new failure mode in `Status:` / `FailureMode:` taxonomies. |

### Plan pipeline

| Agent / command | Change |
|---|---|
| `plan-diff-fix-loop` | Same snapshot mechanism + detector + backtrack-and-exclude as spec-side. New STATUS code `surface-expansion-irrecoverable`. Snapshots retained on failure for forensics. |
| `plan-diff-fix-classifier` (new, per A) | Read poisoned-fix list. |
| `/fix-plan-shape-single-findings` | Route `surface-expansion-irrecoverable` → `plan-fix-failure-forensics` → `plan-review-parker`. |

### Implementation pipeline

Impl snapshotting takes the baseline at step-2 entry (after the
implementer finished, before any review/fix-loop pass applied),
NOT at HEAD. Reverting to HEAD would discard the implementer's
work.

On `surface-expansion-irrecoverable`, the surfacing message
references `specPath` so the user sees where reshape work should
land. This is the impl analogue of `spec-review-parker` writing
a parked-finding entry; impl has no parked sibling yet (closing
that gap is in §Implementation plan), so the surfacing is the
output.

| Agent / command | Change |
|---|---|
| `impl-diff-fix-loop` (new, per C1) | Per-pass snapshot per the mechanism above. Baseline taken at step-2 entry. Surface-expansion detector with k threshold. Backtrack-and-exclude protocol. On `surface-expansion-irrecoverable`: revert to baseline (NOT HEAD), surface to user with (a) offending poisoned fix(es), (b) `specPath` flagged as likely needing reshape, (c) per-pass fix-count / score trajectory. Snapshots retained on failure for forensics. |
| `impl-diff-fix-classifier` (new, per A) | Read poisoned-fix list. |
| `triage-assessor` | No change. |

## Cross-pipeline rollup

### New agents

| Agent | Pipeline | Source change | Purpose |
|---|---|---|---|
| `plan-diff-fix-classifier` | plan | A | Extract trajectory-blind classifier from `plan-diff-fix-loop`; host severity-weighted triage. |
| `plan-fix-failure-forensics` | plan | A + C2 routing | Plan-side analogue of `spec-fix-failure-forensics`. |
| `plan-review-parker` | plan | A + C2 routing | Plan-side analogue of `spec-review-parker`. Requires new `docs/plan-review-parked.md`. |
| `impl-diff-fix-classifier` | impl | A | New agent for `/implement` step 2 + future `/fix-impl-shape-single-findings`. Replaces inline classification policy. |
| `impl-diff-fix-loop` | impl | C1 + C2 | Extracts loop scaffolding from `/implement` step 2 and `/review-fix-loop` steps 1–4. |
| `impl-review-fixer` | impl | Fixer split | Top-level fixer split from `fixer`. |
| `impl-diff-fixer` | impl | Fixer split | Inner-loop fixer split from `fixer`. |
| `impl-fix-failure-forensics` | impl | Symmetry backlog | Impl-side analogue of `spec-fix-failure-forensics`. |
| `impl-review-parker` | impl | Symmetry backlog | Impl-side analogue of `spec-review-parker`. Requires `docs/impl-review-parked.md`. |

### New STATUS codes per loop agent

| Loop agent | New STATUS / rationale | Source change |
|---|---|---|
| `spec-diff-fix-loop` | `must-fix-blocked` (sub-rationales `must-fix-blocked-by-scope-guard`, `score-budget-exhausted`) | A + D |
| `spec-diff-fix-loop` | `surface-expansion-irrecoverable` | C2 |
| `plan-diff-fix-loop` | `must-fix-blocked` (same sub-rationales) | A + D |
| `plan-diff-fix-loop` | `surface-expansion-irrecoverable` | C2 |
| `impl-diff-fix-loop` | `must-fix-blocked` (surfaced to user with pointer to `specPath`) | A + D |
| `impl-diff-fix-loop` | `surface-expansion-irrecoverable` (surfaced to user with `specPath` reshape flag) | C2 |

### New stage fields per loop agent

| Loop agent | New fields | Source change |
|---|---|---|
| `spec-diff-fix-loop` | `STAGE:` + `STAGE_PASSES:` | C1 |
| `plan-diff-fix-loop` | `STAGE:` + `STAGE_PASSES:` | C1 |
| `impl-diff-fix-loop` | `STAGE:` + `STAGE_PASSES:` | C1 |

### Tactical recommendations from the meta-analysis

All 8 tactical recommendations from
`docs/spec-review-forensic-meta-analysis.md` §Ranked
recommendations are subsumed by A + B + C1 + D + C2. The
mapping:

| Rec | Subsumed by |
|---|---|
| 1 — audit grep `*-review-parked.md` for Relationships edges | apply to `<pipeline>-review-finding-lens-auditor` once the audit chain exists per pipeline |
| 2 — audit cross-document set-equivalence check | apply to `<pipeline>-review-finding-lens-auditor` once the audit chain exists |
| 3 — dispatcher pre-flight for parked-sibling + unsatisfiable-ScopeGuard | B (drops class-3) + A (must-fix-blocked exits) |
| 4 — structural-recommendation gate in classifier | C2 backtracking |
| 5 — prose-budget cap | D (combined-score budget) |
| 6 — ScopeGuard-blocked → loop-termination | D's `score-budget-exhausted` exit under A's `must-fix-blocked` STATUS |
| 7 — cumulative-drift-from-finding-text termination | D (cumulative-score across passes) |
| 8 — re-audit surviving cluster members after parking | orchestrator-level addition once recs 1+2 are live per pipeline |

Recs 1, 2, and 8 require an audit chain (currently spec-only).
Per-pipeline applicability follows from where the audit chain
exists. The audit chain for plan and impl is in §Implementation
plan as part of those pipelines' completion work.

## Implementation plan

Implementation is split into workstreams that can ship
independently per pipeline. Within a pipeline, ordering is
**A → B → C1 → D → C2**.

### Workstream 1 — spec pipeline

The spec pipeline has all supporting agents and the forensic
evidence. Ship in change order.

1. **A** — add `importance` tier to 14 `spec-lens-*`. Update
   `spec-diff-fix-classifier` with severity-comparison logic +
   new route `must-fix-blocked-by-scope-guard` + new defer
   rationale. Update `spec-diff-fix-loop` with `must-fix-blocked`
   STATUS. Update `/fix-spec-shape-single-findings`,
   `spec-fix-failure-forensics`, `spec-review-parker` to handle
   the new failure mode.
2. **B** — stop authoring class-3 constraints in `/spec-review`,
   `spec-review-shape-single-reducer`,
   `spec-review-finding-reducer`, `/reshape-spec-review`,
   `spec-review-finding-lens-auditor`, `spec-review-fixer`.
   Drop class-3 enforcement in `spec-diff-fixer` and
   `spec-diff-fix-loop`. Aggressive sweep of `docs/spec-review.md`
   + `docs/spec-review-parked.md`.
3. **C1** — declare tier in each `spec-lens-*`. Update
   `spec-diff-fix-loop` for staged dispatch + `STAGE:` /
   `STAGE_PASSES:` output. Make `spec-diff-fix-classifier`
   stage-aware.
4. **D** — author `## Scoring rubric` in each `spec-lens-*`
   (14 narrow + 3 broad = 17 agents). Update `spec-review-triager`
   to convert tier → score. Upgrade `spec-diff-fix-classifier`
   to combined-score budget rule + `score-budget-defer` /
   `score-budget-exhausted` rationales.
5. **C2** — implement snapshot mechanism in `spec-diff-fix-loop`.
   Add surface-expansion detector with k threshold (score-based
   per D). Backtrack-and-exclude protocol. Route
   `surface-expansion-irrecoverable` from
   `/fix-spec-shape-single-findings`.

### Workstream 2 — plan pipeline

Plan requires new infrastructure before A can land.

1. **Pre-A infrastructure** — three new agents:
   - `plan-diff-fix-classifier` (extracted from inline policy
     in `plan-diff-fix-loop`).
   - `plan-fix-failure-forensics` (analogue of
     `spec-fix-failure-forensics`).
   - `plan-review-parker` + `docs/plan-review-parked.md` (new
     parked-doc sibling).
2. **A** — same shape as workstream 1 step 1.
3. **B** — inspect `docs/plan-review.md` first to determine
   class-3 prevalence. Lazy strip-on-touch by default; bulk
   sweep if prevalence is high. Update `/plan-review`,
   `plan-review-finding-enricher`, `plan-review-triager`,
   `plan-review-fixer`, `plan-diff-fixer`, `plan-diff-fix-loop`.
4. **C1** — declare tier in each `plan-lens-*`. Update
   `plan-diff-fix-loop` for staged dispatch. Note: tier 3 is
   empty for plan; the staging discipline still applies.
5. **D** — author `## Scoring rubric` in each `plan-lens-*` (6
   agents). Update `plan-review-triager` for tier → score.
   Upgrade `plan-diff-fix-classifier` to combined-score budget
   rule.
6. **C2** — same shape as workstream 1 step 5.
7. **Audit chain for plan** (closes meta-analysis recs 1, 2, 8
   for plan): `plan-review-finding-lens-auditor`,
   `plan-review-audit-applier`, `plan-review-auto-reshaper`,
   plus `/plan-review-audit` orchestrator.

### Workstream 3 — implementation pipeline

Impl requires the most pre-work: extracting the missing inner
loop, splitting the fixer, building the structured findings
doc, and adding the per-finding orchestrator.

1. **Pre-A infrastructure** — extract two agents:
   - `impl-diff-fix-loop` (extracted from inline scaffolding in
     `/implement` step 2 and `/review-fix-loop` steps 1–4).
     Accepts policy reference + lens-corpus selector.
   - `impl-diff-fix-classifier` (replaces inline policy).
2. **A** — same shape as workstream 1 step 1, applied to
   `/implement` step 2's classifier invocation. Collapse the
   four hardcoded policy clauses per the table in §Change A.
3. **B (informal-`specPath` cases only)** — add hint-vs-
   constraint rule to `implementer` and `impl-diff-fixer`
   (split from `fixer`). Surface `shape-hint-not-satisfied`
   events in `/implement` step 3 summary. Spec / plan finding
   `specPath` inputs are covered upstream by workstreams 1
   and 2.
4. **C1** — declare tier in each `impl-lens-*` (rename target;
   pre-rename = `review-lens-*`). Update `impl-diff-fix-loop`
   for staged dispatch.
5. **D** — author `## Scoring rubric` in each `impl-lens-*`
   (9 narrow + 6 broad = 15 agents). Update `triage-assessor`
   for tier → score conversion. Upgrade
   `impl-diff-fix-classifier` to combined-score budget rule.
6. **C2** — same shape as workstream 1 step 5, with the
   baseline-at-step-2-entry rule (not HEAD).
7. **Structured findings doc + per-finding orchestrator**
   (impl-side completion): extend `/impl-review` (rename of
   `/audit`) to write `docs/impl-review.md` after
   `impl-review-finding-consolidator` (rename of `consolidator`)
   runs, using the per-finding shape used by spec / plan. Add
   `/fix-impl-shape-single-findings` that picks one finding at
   a time, dispatches `impl-review-fixer` (top-level split from
   `fixer`), runs `impl-diff-fix-loop` (which dispatches
   `impl-diff-fixer`, inner-loop split from `fixer`).
8. **Parker + forensics for impl**: `impl-fix-failure-forensics`,
   `impl-review-parker` + `docs/impl-review-parked.md`. Routed
   from `/fix-impl-shape-single-findings`.
9. **Audit chain for impl** (closes meta-analysis recs 1, 2, 8
   for impl): `impl-review-finding-lens-auditor`,
   `impl-review-audit-applier`, `impl-review-auto-reshaper`,
   plus `/impl-review-audit` orchestrator on `docs/impl-review.md`.
10. **Wire `impl-review-finding-consolidator` into
    `impl-diff-fix-loop`** — small cleanup. Removes the
    inconsistency where `/audit` consolidates but `/implement`
    and `/review-fix-loop` do not.

### Workstream 4 — bulk lexical renames + fixer split

Separable from functional work. Run after the functional
workstreams stabilise so new agents land under canonical names
from day one.

- **Pure renames** (scriptable, lexical only):
  - `consolidator` → `impl-review-finding-consolidator`
  - `review-lens-*` → `impl-lens-*` (9 narrow + 6 broad)
  - `/audit` → `/impl-review`
  - `/audit-project` → `/impl-review-project`
- **Fixer split**: clone `fixer` prompt into `impl-review-fixer`
  + `impl-diff-fixer`. Update callers per role:
  - `/audit` Phase 6 → `impl-review-fixer`
  - `/implement` step 2 inline loop → `impl-diff-fixer`
  - `/review-fix-loop` step 3 → `impl-diff-fixer`

The two new fixer prompts may share most of their body
initially; divergence comes as their roles diverge.

### Workstream 5 — per-lens scoring rubrics

Required for change D's combined-score rule. 38 lens prompts
across the three pipelines:

- 14 `spec-lens-*` narrow
- 3 `spec-lens-*-broad`
- 6 `plan-lens-*`
- 9 `impl-lens-*` narrow (renamed from `review-lens-*`)
- 6 `impl-lens-*-broad` (renamed from `review-lens-*-broad`)

Execution model: dispatch one rubric-author agent per lens in
parallel (38 concurrent tasks, batched per harness limits).
Each agent reads the lens prompt, drafts the `## Scoring rubric`
section, writes it back. Initial rubrics are approximate;
fine-tuning per lens lands later as scoring distributions
stabilise in real fix-loop runs. Drift-detection and rubric
re-tuning are future work.

Per-lens fallback: until each rubric lands, the corresponding
lens continues to emit its current severity signal and the
classifier falls back to A's per-finding rule for that lens's
findings. D is per-lens incrementally adoptable, not big-bang.

Runs in parallel with workstream 4 — rubric authoring and bulk
rename are orthogonal.

### Dependencies

```
W1 (spec) ──┐
W2 (plan) ──┼── all three pipeline workstreams independent of each other
W3 (impl) ──┘

Within each pipeline:
  pre-A infra ── A ── B ── C1 ── D ── C2 ── (pipeline-specific completion steps)

W4 (renames + fixer split) ── runs after W3 stabilises
W5 (rubric authoring)       ── runs in parallel with W4; required for D
```

W5 is a dependency of step "D" in each of W1, W2, W3, but only
for the specific lens corpus that pipeline uses. So W5-spec must
land before W1-step-4; W5-plan before W2-step-5; W5-impl before
W3-step-5. These per-corpus blocks of W5 can ship independently.

## Accepted asymmetries

Three deviations from full pipeline symmetry are intentional
and preserved:

- **`/implement` build-new-thing front-end.** Takes one
  `specPath`, runs `implementer`, applies a post-implementer
  review/fix loop. No spec / plan analogue exists because those
  pipelines review existing artefacts and do not author new
  code from a task. `/implement` is not being reshaped into
  per-finding orchestration shape because its role (write new
  code from one task description) is fundamentally different
  from the review-fix role spec / plan / `/impl-review` share.
- **`docs/ISSUES.md` separate from `docs/impl-review.md`.**
  `docs/ISSUES.md` is an issue tracker backend (configurable
  per `docs/ISSUES_CONFIG.md` to flat file or GitHub Issues),
  used by `/audit` and `/review-fix-loop` for `document`-
  classified findings. Some projects route issues to GitHub
  Issues; having spec or plan findings mixed in with
  implementation issues in that backend would be incongruous.
  The implementation pipeline's documented issues stay in their
  own backend, separate from the structured findings doc
  (`docs/impl-review.md`).
- **Unprefixed shared / general-purpose agents and prompts.**
  `triage-assessor` (shared across all three pipelines),
  `implementer` (build-new-thing), `/implement` (build-new-thing
  prompt), `/review-fix-loop` (general-purpose review tool).
  Pipeline-prefixing any of these would falsely imply ownership
  by one pipeline.

End of implementation plan.
