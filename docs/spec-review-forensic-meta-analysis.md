# Meta-analysis — W1 spec fix-loop re-attempt

```
PROJECT: pi-loom
SCOPE: did the W1 pi-config changes (a3136af → 2613f98, 2026-05-16) deliver
       the improvements predicted by the prior meta-analysis (3a15079,
       2026-05-16T08:00Z; deleted in a56ab5e)?
INPUT: 6 forensic reports under
       .pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/
       + docs/spec-review-forensic-analysis.md (6 entries)
       + docs/spec-review-parked.md (9 currently-parked findings)
       + git log 2026-05-15..2026-05-17 on docs/spec-review*.md
       + pi-config commits a3136af, 0d7d9b6, e9d2307, a50f02f, 2613f98, f92cd3c
       + agent-prompt review of spec-review-fixer, spec-diff-fixer,
         spec-diff-fix-loop against docs/spec-principles.md SP-2

HEADLINE: W1 ships every loop-side architectural change the prior
          meta-analysis recommended. Fix rate did not improve because
          a separate root cause was not addressed: the pipeline treats
          a finding's `## Solution approach` as a binding contract,
          while the SP-2 principle calls it "directional". The inner
          fixer can reword within the upstream edit's shape but cannot
          abandon, narrow, or replace it. 4 of 6 W1 failures have a
          wrong-shaped Solution approach the inner loop cannot recover
          from; 1 has a missing constraint the fixer authored a trap
          into; 1 is a producer/consumer sequencing problem. Problem
          statements are correct in all 6.

PRIMARY FIX: rec J (this document) — close the gap between SP-2
             "directional" and the agent prompts' "is what you
             implement". Teach the top-level + inner fixers to deviate
             from a wrong-shaped Solution approach when lens findings
             indicate it isn't working. One pi-config change converts
             5/6 current failures to fixes (T19d still needs cluster
             ordering via rec F).

GENERATED: 2026-05-17T08:30:00Z
           revised 2026-05-17T11:00:00Z (separate fix-rate from
             failure-detection metrics)
           revised 2026-05-17T13:00:00Z (root cause rewrite: bound-
             contract vs. directional reading of Solution approach)
```

## Sources

- **Prior meta-analysis** (deleted in `a56ab5e`, recovered from `3a15079`):
  diagnosed 3 diverging cases (T22a1, T20, T19b) from
  `forensicsRunId 2026-05-15T18-46-12_c1e9c1`; surfaced 8 ranked pipeline
  recommendations + 4 architectural redesign proposals (A / B / C1 / C2,
  plus an audit-gate cluster).
- **pi-config W1 commits**, all 2026-05-16, in implementation order:
  `a3136af` Change A (severity-weighted triage); `0d7d9b6` Change B
  (drop class-3 authoring); `f92cd3c` W5 lens rubrics (5-tier
  importance per lens); `e9d2307` Change C1 (staged lens introduction);
  `a50f02f` Change D (combined-score budget); `2613f98` Change C2
  (backtracking on surface expansion).
- **W1 unpark commits**, `cc91b23` + `44f2c5e` (2026-05-16 19:48Z):
  unparked 11 findings (T22a1, T22b, T22c, T15c, T21, T20, T15b,
  T19a, T19b, T19c, T19d) from `spec-review-parked.md` back into
  `spec-review.md` for re-attempt under the W1 pipeline.
- **W1 re-attempt forensic reports**, `forensicsRunId 2026-05-16T17-52-36_347871`:
  6 reports (T19a / T19b / T19d / T19e / T21 / T22a1) totalling 2 824
  lines. T19c converged (commit `14c8a8c`); T20 / T15b have not yet
  been dispatched.
- **Agent prompts in pi-config**: `agents/spec-review-fixer.md`,
  `agents/spec-diff-fixer.md`, `agents/spec-diff-fix-loop.md`,
  `agents/spec-diff-fix-classifier.md`, `docs/spec-principles.md`.
- **Working notes** for this meta-analysis under
  `.pi/tmp/meta-analysis-work/` (gitignored, retained for forensics):
  `01-forensic-summaries.md` (596 lines), `02-pi-config-changes.md`
  (648 lines), `03-current-pipeline-catalogue.md` (1 444 lines),
  `04-history-and-prior-meta.md` (891 lines).

---

## 1. The question

The user expected the W1 changes (A / B / C1 / D / C2 as shipped to
pi-config) to improve the convergence rate of
`/fix-spec-shape-single-findings`. The prior meta-analysis predicted
that A + B alone would handle "all 7 forensic-report failures at pass
1 or 2"; A + B + C1 + C2 would be a strict super-set of that.

The user re-ran the pipeline on 11 previously-parked findings. The
observed convergence rate did not improve. **This document explains
why, then proposes the smallest change that would convert 5 of 6 W1
failures into fixes.**

## 2. Fix rate vs. failure detection — the metric

Two distinct metrics live inside "did the pipeline get better":

- **Fix rate** = (# findings that converge and land a spec edit) /
  (# findings dispatched). The goal.
- **Failure-detection rate** = (# findings rejected/parked early with
  good diagnostics) / (# findings dispatched). A proxy.

A pipeline can improve failure-detection without improving fix rate:
exit faster with a clearer error code, every time, but still never
converge. That is precisely what W1 did. **Recommendations that
improve only failure-detection are valuable for human throughput and
ops cost, but they are not progress toward the fix-rate goal.** The
distinction is observed throughout this document.

## 3. Did W1 ship what the prior meta-analysis recommended?

**Yes for the loop-side, no for the audit-side.** The prior
meta-analysis's recommendations fall into two clusters:

### 3.1 Loop-side architectural redesigns — all shipped

| Prior rec | Status | W1 commit | Mechanism shipped |
|---|---|---|---|
| §A Severity-weighted triage at `spec-diff-fix-classifier` | shipped | `a3136af` | Three-clause rule: `severity(raised) > severity(origin)` → fix-MUST; `fix_risk == very-low` → fix-SHOULD; else → defer-to-debt. Escape: every viable remediation violates a class-1/class-2 guard → `STATUS: must-fix-blocked`. |
| §B Drop class-3 solution constraints | shipped (commit-pair) | `dbc73e2` (sweep in pi-loom), `0d7d9b6` (agent-side enforcement in pi-config) | Three-class taxonomy: class 1 cross-reference ownership pins KEEP, class 2 project-policy pins KEEP, class 3 shape mandates DROP. Reducer no longer authors class 3; fixer extracts class-1/2 only; loop filters defence-in-depth. |
| §C1 Staged lens introduction | shipped | `e9d2307` | Three tiers (correctness / structural / prose-quality). Per-stage convergence advances to next stage. Stage-boundary passes excluded from divergence + surface-expansion detectors. |
| §C2 Backtracking on surface expansion | shipped | `2613f98` | Per-pass `refs/loom/snapshots/<runId>/pass-N` snapshots; D-mode detector `scoreSum[N] > 1.5 × scoreSum[N-1]`; poison highest-file-overlap fix, restore, rewind. Two-strikes exit → `STATUS: surface-expansion-irrecoverable`. |
| §D (new in W1, not in prior rec) Combined-score budget | shipped | `a50f02f` + `f92cd3c` rubrics | Per-pass `Σ = sum(score(raised)) ≤ S = score(origin)` → defer; `Σ > S` → `STATUS: must-fix-blocked / score-budget-exhausted`. Anchor table: `blocker→95`, `high→100`, `medium→25`, `low→5`, `nit→1`. |

### 3.2 Audit-side recommendations — none shipped

Prior recs 1–3 (rated 3/3 forensic coverage each) — grep
`spec-review-parked.md` for Relationships edges, cross-document
set-equivalence checks, dispatcher pre-flight refusal — were not
shipped. None of these are fix-rate-positive on their own (see §6
below); they were over-ranked in the prior meta-analysis on the
unstated assumption that fix rate = 1 − (early-exit failure rate).

## 4. W1 outcomes

### 4.1 Per-finding before/after

| Finding | Pre-W1 outcome | W1 outcome | Fix rate change |
|---|---|---|---|
| T22a1 | `diverging` (+3 cascade) at `31eb888` | `surface-expansion-irrecoverable` (+3 cascade) at `cfcbe38` | unchanged (parked → parked) |
| T20 | `diverging` (+1 cascade) at `ed51f5a` | not yet dispatched in this re-run | n/a |
| T19b | `diverging` at `49c40f9` | `diverging` at `531c22d` | unchanged |
| T19a | `limit-cycle` at `ac18d94` | `limit-cycle` at `00332d1` | unchanged |
| T19c | top-level-refused at `65c7ccd` | **resolved** at `14c8a8c` | **+1 (the one W1 win)** |
| T19d | top-level-refused at `42a63d5` | `must-fix-blocked-by-scope-guard` at `e8be9bf` | unchanged (different exit code) |
| T21 | `limit-cycle` at `2cb02e4` | `must-fix-blocked / score-budget-exhausted` at `dd79e22` | unchanged |
| T19e | (live, not parked pre-W1) | `diverging` at `c8a362f` | **−1 regression** (was live, now parked) |
| T22b / T22c / T15c | cascade-parked from T22a1 | cascade-parked from T22a1 | unchanged |
| T15b | parked at `cf3ecb0` (audit human-review queue) | not yet dispatched in this re-run | n/a |

**Net fix-rate change: +1 (T19c) −1 (T19e) = 0.** Pipeline failure
mode taxonomy is more granular and exits are faster; convergence rate
is identical.

### 4.2 Aggregate

- **Findings re-dispatched and terminated: 6** (T19a, T19b, T19d,
  T19e, T21, T22a1). Plus 3 cascade-parked. Plus 1 resolved (T19c).
  T20 + T15b queued.
- **Pass-burn lower under W1.** Pre-W1 diverging cases burned 5 passes
  each; W1 burns 0 (T19d, T21 — early exits under A and D), 3
  (T22a1), 5 (T19a), 6 (T19b, T19e). Real ops-cost improvement.
- **Forensic reports ~5× richer.** 470 lines average vs ~50–100 line
  pre-W1 reports. TL;DR fenced blocks, ranked root cause, audit-vs-
  actual, snapshot-pair diffs.

W1 is exactly what its mix of mechanics predicts: loop-side hygiene
got better; the root cause of failure was somewhere the loop-side
mechanics don't touch.

## 5. Root cause — the binding/directional gap

Earlier revisions of this document treated the failures as a list of
small, heterogenous problems (paragraph-spending, producer/consumer,
bimodal, slot-keyed poisoning, class-3 regression) and proposed a
targeted mitigation for each. Those patterns are real, but they are
symptoms of one upstream cause. The rest of this section walks the
evidence for that cause; the recommendation set in §7 falls out
directly from it.

### 5.1 Problem statements are correct in all 6 failures

Walking the parked findings:

| Finding | Problem statement | Real defect? |
|---|---|---|
| T19a | "Registry entry shape needs to carry the invocation ID" | Yes — without it the consumers can't read what they document. |
| T19b | "invocation_id should appear on the wire payload" | Yes — the wire field is the operator-visible surface; missing it breaks observability. |
| T19d | "Cleanly-cancelled `finally` populates `.reason` and `.loom` but not `.invocation_id`" | Yes — sibling cancellations collapse onto the same operator row. |
| T19e | "Sibling emission timing is unspecified" | Yes — implementations can batch / re-order without warning. |
| T21 | "Pi-side slash-handler promise lifecycle is taken as given" | Yes — the loom-side spec ships with an unstated host obligation. |
| T22a1 | "PIC has no session-binding contract; single-active-session is an unstated presupposition" | Yes — Pi version bumps could violate it without warning. |

**Problem statements: 0/6 defective.** Every finding describes a real
spec defect that genuinely needs fixing. The user's spec-review
authoring (and the reducer's reduction of it) correctly identified
what is wrong.

### 5.2 The defects are in Solution approach (4/6) or Solution constraints (1/6 + 1/6)

| Finding | Solution approach | Solution constraints | What's wrong |
|---|---|---|---|
| **T19a** | **Bimodal, heavy 2nd branch** | **Over-restrictive** | Conjoins (i) syntactic field-add (light) with (ii) spec-coined runtime-validation MUSTs on the generator's return value (heavy). Constraints (class-2 prohibition on new diagnostic surfaces / `details.kind` / aggregation / storm-detection) then fence off the only channel that could satisfy (ii). **Approach and constraints are mutually unsatisfiable on the heavy branch.** |
| **T19b** | **Edit surface too narrow** | OK | Pins the edit to one TypeScript field comment inside `RuntimeEvent`. The work the lenses raise (cascade-twin rules, dedup-tuple non-membership) genuinely belongs in T19c's "Deduplication and lifetime rules" section. ScopeGuard 4 correctly fences that as out-of-scope. **The chosen edit location cannot carry the obligations it implies.** |
| **T19d** | OK | OK | Reads `entry.invocationId`, a field T19a hasn't landed yet. Problem / approach / constraints internally consistent. **Sequencing problem, not authoring.** |
| **T19e** | **Over-promises "one paragraph"** | **Insufficient bounding** | "Append one paragraph" pinning two contracts. The contracts have ≥ 7 cross-cutting concerns. Constraints don't bound prose (no word count, no explicit deferral list). **Approach over-promises bounded scope; constraints don't backstop it.** |
| **T21** | **Bimodal, Path B exceeds S=25** | OK | Path A (single citation slot) vs Path B (new paragraph + new checklist item + new vocabulary + remediation arm). Path B's derivative defect surface (5 raised findings, Σ=35) structurally exceeds the medium S=25 budget regardless of fixer choices. **Approach's heavier branch doesn't fit the importance tier.** |
| **T22a1** | OK | **Missing trap-guard** | Clean paraphrase + cross-references. Pass-2 fixer authored a normative routing clause not in the original approach ("editorial review on the same footing as …") under pressure from a pass-1 under-attribution lens finding. That clause tripped PIC line 804's catch-all MUST four sections away. Approach didn't ask for the trap; constraints didn't forbid it. **Constraint set incomplete for a known fixer-behaviour pattern.** |

**Solution approaches: 4/6 defective**, in three distinct shapes:
- **Bimodal with a heavy branch** (T19a, T21) — light + heavy work conjoined.
- **Edit surface too narrow** (T19b) — chosen location cannot carry the obligations.
- **Over-promised bounded scope** (T19e) — "one paragraph" wrapper around an unbounded contract.

**Solution constraints: 2/6 defective**:
- **Over-restrictive** (T19a) — fences the only channel that could satisfy the approach.
- **Missing trap-guard** (T22a1) — doesn't forbid the specific fixer move that trips a same-page catch-all.

**Sequencing problem: 1/6** (T19d) — finding is correctly authored;
it needs its producer (T19a) to land first.

### 5.3 The pipeline treats Solution approach as a binding contract

**`docs/spec-principles.md` SP-2 (the principle):** "`## Solution
approach` — 2–4 sentences, action-discipline vocabulary, **directional**
(action verb + named landmark; no composition pinning, no gratuitous
parentheticals, no negative-space prescription)."

**`agents/spec-review-fixer.md` line 145 (the agent prompt):** "The
`## Solution approach` **is what you implement**; `## Problem` and
`## Relationships` supply the why and cross-finding context."

**`docs/spec-principles.md` SP-2's "implicit success criteria":** "the
solution **follows** the Solution approach and respects the
constraints".

**`agents/spec-diff-fixer.md`:** zero mentions of "Solution approach",
"directional", "alternative shape", "abandon", or "revert upstream
edit". The agent's only refusal modes are (a) scope-guard cross,
(b) optional-action discipline, (c) SP-1 boundary discipline. None of
these include "the upstream edit is wrong-shaped; revert it."

The principle says "directional"; the prompts say "is what you
implement". **In practice the pipeline treats the approach as a
binding execution contract.** This means:

1. The top-level fixer reads Solution approach and produces an
   initial spec edit faithful to it.
2. The inner loop operates on the diff that edit produced; lens
   findings are raised against the post-edit spec.
3. The inner-loop fixer satisfies each lens finding by **rewording
   within the edit shape** the top-level fixer chose. It does not
   have license to revert, narrow, or replace the top-level edit's
   shape.
4. When the top-level edit's shape is wrong (4/6 cases above), every
   reword is a different bad shape and the loop cannot converge.

### 5.4 What a non-binding fixer would do for each failure

For each parked finding, here is the alternative shape that solves
the Problem, respects the constraints, and would converge under a
pipeline that treated Solution approach as advisory:

| Finding | Current bound shape (locked in by approach) | Alternative shape (legal under Problem + constraints; forbidden by treating approach as binding) |
|---|---|---|
| **T19a** | Field-add AND spec-coined runtime-validation MUSTs | **Ship the field-add alone.** Let T19c + `diagnostics.md` §7 pin wire-form contract from the consumer side. The Problem ("registry carries the id") is solved by the field-add. The MUSTs are an elaboration the lenses correctly identify as un-pinnable inside the constraints. |
| **T19b** | Add invocation_id with semantics inline in the field comment | **Add the field with a 30-word comment pointing at T19c's section for semantics.** ScopeGuard 4 is satisfied (edit stays in `RuntimeEvent` block); cascade-twin and dedup-tuple obligations are not authored at all — they're delegated by reference. |
| **T19d** | Read `entry.invocationId` from a registry that doesn't carry it yet | **No standalone alternative.** Needs producer (T19a) to land first or cluster fusion (see rec F). Genuine sequencing, not authoring. |
| **T19e** | One paragraph pinning two contracts with 7 cross-cutting concerns | **Ship a stub paragraph asserting the helper-internal leg only, plus debt-register entries for the 6 cross-cutting concerns.** The Problem (timing is unspecified) is addressed for the helper-internal leg; the other 6 concerns are explicitly deferred rather than implicitly under-specified. |
| **T21** | Path A and Path B both attempted; Path B exceeds budget | **Pick Path A only — the single Pi-source citation.** The Problem (lifecycle taken as given) is addressed by the citation. Path B's checklist+vocab+remediation is a separate optional elaboration. |
| **T22a1** | Strict paraphrase + cross-references; pass-2 fixer added a routing clause | **Strict paraphrase only.** Revert the pass-2 routing clause. The pass-1 under-attribution lens finding is deferred to debt instead of being satisfied via authoring the trap clause. |

**Coverage: 5/6 of the current failures.** T19d is the one that
still fails because no in-finding rewrite can solve a missing producer
— that's the cluster problem and only rec F addresses it.

### 5.5 Why "treat approach as binding" is the root cause, not the symptoms

Each of the symptoms I named earlier (paragraph-spending, bimodal
heavy branch, edit-surface mismatch, missing trap-guard) is a
specific way Solution approach can be wrong-shaped. The principle
that closes them all is the same: **a fixer with license to narrow,
substitute, or partially abandon the approach when lens findings
indicate it isn't working would converge in every case.**

Putting it the other way: under the current "approach is binding"
reading, every wrong-shaped approach is a permanent failure regardless
of what the loop-side machinery does. C2 backtracking can revert one
bad pass-N fix but cannot revert the top-level fixer's edit. C1
staging can sequence lens dispatch but cannot change the underlying
spec text the lenses dispatch against. D-mode score budget can exit
faster but cannot fix the approach. **All five W1 mechanisms operate
downstream of the binding interpretation; none of them touch it.**

The class-3 sweep (§B) is the closest W1 came to addressing this: it
correctly identified positive-space shape mandates inside `##
Solution constraints` as the cause of inflexibility and stripped
them. But it stopped at the constraints field. The same "positive-
space shape prescription as binding contract" pattern lives inside
the Solution approach itself, and the class-3 sweep didn't reach
there. **Rec J in §7 below is the natural completion of §B: extend
the "directional, not binding" treatment from constraints to
approach.**

## 6. Why audit-side recommendations don't move the fix rate

For explicitness, since this was the dominant misframing in the
first revision of this document:

- An audit-time grep against `spec-review-parked.md` flips four lens
  dimensions to `RISK_HIGH` and emits an `AUTO_RESHAPE` or
  `HUMAN_REVIEW` verdict. The finding does not enter the inner loop.
  The finding is then either reshaped (still by a human or by the
  auto-reshaper, with no new convergence signal) or routed to
  HUMAN_REVIEW (where it sits until the human acts). **The
  convergence outcome is unchanged** — the finding still cannot be
  auto-fixed by the loop as authored.
- A field-existence grep that downgrades T19d's verdict to
  `RISK_HIGH` does not give the fixer a way to read a field that
  does not exist. It tells the human "this won't work"; the human
  still has to land T19a (or fuse the cluster) before T19d
  converges.
- A D-mode budget projection that warns T21's heavy branch will
  exceed S=25 tells the human "this won't fit"; the human still has
  to split T21 or raise its score.

The audit gate is the cheapest place to **prevent wasted loop
time**; it is not the cheapest place to **convert a failure into a
fix** because it does not change the finding's text or the
pipeline's ability to satisfy it. **Audit-side recs are
diagnostic-only and should be ranked accordingly.**

## 7. Recommendation set

Ranked by **fix-rate impact** — number of the 6 W1 failures
(T19a, T19b, T19d, T19e, T21, T22a1) the recommendation converts
into a converging fix. Diagnostic-only recs are listed separately
and clearly labelled.

### 7.1 Headline: rec J — close the binding/directional gap

**J. (FIX 5/6 — pi-config only) "Solution approach is advisory."**
Bring the agent prompts in line with the SP-2 principle. The
inner-loop fixer (and, on pre-flight, the top-level fixer) gets
explicit license to narrow, substitute, or partially revert a
Solution approach when lens findings on the upstream edit indicate
the approach isn't converging.

**Coverage analysis:**

- **T19a** ✅ — fixer ships field-add alone, drops the spec-coined
  MUSTs.
- **T19b** ✅ — fixer ships field with cross-reference comment;
  delegates cascade-twin/dedup-tuple work to T19c via reference.
- **T19d** ❌ — needs producer to exist; J cannot help (rec F does).
- **T19e** ✅ — fixer ships stub paragraph + defers 6 cross-cutting
  concerns to debt-register.
- **T21** ✅ — fixer ships Path A (single citation) only.
- **T22a1** ✅ — fixer ships strict paraphrase; defers pass-1 under-
  attribution finding to debt instead of authoring the trap clause.

**Files changed (pi-config):**

- `agents/spec-review-fixer.md` step 3:
  - Read Solution approach as a **starting hint**, not a contract.
  - Implement the **minimum edit that solves the Problem and
    respects the constraints**. The Solution approach indicates
    direction; deviations from it are legal and must be recorded
    in `## Notes`.
  - Optional pre-flight: dispatch tier-1 lenses on the proposed
    initial edit; if predicted finding count > k × score(origin),
    narrow the edit (drop elaborative parts of the approach,
    delegate via cross-reference where another finding owns the
    territory) before entering the inner loop.
- `agents/spec-diff-fixer.md` new refusal mode `(d) approach-narrowing`:
  - When applying a lens fix would require rewording or inflating
    prose that the top-level fixer produced from the Solution
    approach, AND any prior pass of this loop has already attempted
    to reword/inflate the same prose chunk (track via the same
    content-key the loop already uses for C2 poisoning), instead
    **revert that chunk to the pre-Solution-approach baseline** and
    classify the lens finding as `defer-to-debt — approach-narrowed`.
  - Surface the narrowing in `## Notes` with format
    `Narrowed per advisory-approach: <chunk> → reverted; lens
    finding deferred.`
- `agents/spec-diff-fix-loop.md` snapshot extension:
  - Take a `${SNAPSHOT_NS}/baseline-post-top-level` snapshot in
    step 2 (after the top-level fixer's edit, before pass 1). Lets
    the new fixer refusal mode revert *only the top-level chunk*
    while keeping pass-1..N progress on unrelated chunks.
  - Add to `## Snapshot mechanism (Change C2)` section.
- `agents/spec-diff-fix-classifier.md`:
  - Recognise `defer-to-debt — approach-narrowed` as a defer
    rationale; surface in `_summary.md` defer-breakdown.
  - On classifying a fix-class lens finding whose remediation would
    inflate prose tied to a chunk the fixer has already narrowed,
    auto-classify as the same defer rationale rather than as fix.
- `docs/spec-principles.md` SP-2:
  - Correct the implicit success criteria from "the solution
    **follows** the Solution approach" to "the solution addresses
    the Problem, respects the constraints, and uses the Solution
    approach as a directional hint that may be narrowed or
    substituted if the lens corpus does not converge on the
    proposed shape."
  - Add: "Solution approach is **directional, not binding**. The
    fixer's primary obligation is to solve the Problem within the
    constraints. The approach is a starting recommendation; if
    lens findings indicate it does not converge, the fixer narrows
    it. Recorded deviations are first-class outputs, not
    failures."

**Implementation scope:** ~5 file edits in pi-config; reuses the
existing C2 snapshot mechanism; no new STATUS codes; no per-project
config changes. This is materially smaller than rec F.

**Why this works on the empirical cases:** in each of T19a, T19b,
T19e, T21, T22a1 the inner-loop fixer was forced to *expand* prose
that was already attracting lens findings, because rewording within
the approach's shape was the only legal move. With license to revert
that prose to a narrower form and defer the lens finding to debt, the
loop converges on the narrower form which the constraints already
allow.

### 7.2 Companion to J: rec F for the cluster case

**F. (FIX 1/6 marginal after J — pi-loom + pi-config) `Shape:
multiple` resolution mode for tight clusters.** Authorise the picker
+ outer prompt + top-level fixer to operate on more than one finding
at a time when their Relationships edges form a strongly-connected
component over `co-resolve` / `same-cluster` (and, if rec C ships,
`produces:` / `consumes:`). One fixer pass lands the whole cluster's
edits; the inner loop sees one stable post-edit state.

**Coverage analysis under J:** J handles 5/6; F handles the
remaining 1 (T19d, the producer/consumer case). If only J ships,
T19d still parks until T19a's reshape lands manually; then T19d
converges naturally on the next picker pass because its `consumes`
field exists by then.

Files changed in pi-config:

- `agents/spec-review-shape-single-picker.md` — detect SCCs over
  the Relationships graph; emit `MULTI: <H1, H2, ...>` instead of a
  single heading.
- `agents/spec-review-fixer.md` — accept multi-finding input;
  consolidate Solution approaches; emit one combined `## Scope
  guards` block (class-1 + class-2 union, deduplicated).
- `agents/spec-diff-fix-loop.md` — carry the combined heading list
  through to forensics + parker.
- `agents/spec-fix-failure-forensics.md` — report on the cluster.
- `agents/spec-review-parker.md` — park the whole cluster on
  failure.
- `prompts/fix-spec-shape-single-findings.md` — commit message
  format for multi-finding resolution / parking.
- `prompts/spec-review.md` — document `Shape: multiple` in the
  reduction template.

Files changed in pi-loom:

- `docs/spec-review.md` — mark the T19a/b/d/e cluster (and any
  other strongly-connected sub-graph) with `Shape: multiple`;
  collapse per-finding Solution approaches into one combined
  approach.
- `docs/spec-review-parked.md` — un-park the cluster as one entry
  once pi-config's multi-finding support lands.

**Priority after J:** ship if T19d (and any future producer/consumer
cluster) is worth the implementation cost. If the cluster pattern is
rare in practice, the cheaper alternative is to make `consumes:`
visible (rec C) and let the human resolve cluster ordering.

### 7.3 If J doesn't ship: rec G as fallback (pi-loom only)

**G. (FIX 6/6 if J doesn't ship — pi-loom only) Reshape parked
findings per their forensic-report recommendations.** Each W1
forensic report ends with a `## Immediate (this finding)` subsection
listing one to three reshape options. Until J lands, every parked
finding requires a human reshape pass to land — the alternative
shape that J would let the fixer pick automatically, the human picks
manually.

Per-finding picks (paraphrased from the forensic reports;
substantively identical to the §5.4 alternative-shape column):

| Parked finding | Reshape |
|---|---|
| T19a | Narrow to syntactic `invocationId: string` declaration; drop generator-side MUSTs (demote to non-normative illustration). |
| T19b | Strip every non-field-name-and-type obligation off the field comment; replace with a 30-word, two-hyperlink cross-reference. |
| T19d | Land T19a first (cluster ordering). |
| T19e | Split into T19e-α (anchor scaffold) + T19e-β (helper-internal leg only) + T19e-γ (debt-register entries for 5 cross-cutting concerns). |
| T21 | Split along bimodal seam: T21a (Path-B paragraph only) + T21b (editorial-review checklist). Or raise score to high (S=100). |
| T22a1 | Add fifth Solution constraint forbidding any normative detection-routing claim in the new sub-section. |

**Relationship to J:** G is the manual workaround for the
architecture J fixes. If J ships, G is unnecessary — the same
narrowings the human would apply in G, the fixer applies
automatically under J.

Files changed (pi-loom): `docs/spec-review-parked.md`,
`docs/spec-review.md`.

### 7.4 Diagnostic-only recommendations (DIAG)

These improve failure-detection (faster exit, clearer error code,
richer forensics) but do not convert any failure into a fix. Ship
for ops-cost reasons, not for fix-rate.

**A. (DIAG 6/6 — pi-config only) Audit-side gate upgrade.** Catch
the failures J resolves, plus T19d, at audit time before any loop
passes burn. Sub-recs A.1–A.6 are listed in detail in working note
`.pi/tmp/meta-analysis-work/` — grep parked.md for Relationships
edges, cross-document set-equivalence, field-existence grep,
Pattern-N for unbounded prose, D-mode budget projection, re-audit
hook after parking. **Under J, the audit-side checks become an
optimisation: J already handles the convergence; A makes the human
see what J is about to narrow before the loop runs.**

**B. (DIAG 2/6 — pi-config only) Content-keyed C2 poisoning index.**
Replace `<lens>:<NN>` identifier with `(file_path,
normalised_section_anchor, normalised_proposed_remediation_hash)`.
Closes the slot-NN re-emission hole T19a and T22a1 hit. **Under J,
the C2 poisoning machinery fires much less often** because the
fixer narrows rather than expanding into surface expansions in the
first place. Still useful when the narrowing is too aggressive and
some lens does need attention.

**D. (DIAG 3/6 — pi-config only) Cumulative-score budget.** Promote
the per-pass D-mode Σ-vs-S budget to a cumulative `ΣΣ =
sum(scoreSum[1..pass])` budget checked against `k×S`. Catches the
cost of re-paying to detect-and-exclude the same defect cluster
across passes. **Under J, the cumulative-budget detector rarely
fires because the fixer narrows before passes accumulate.**

**E + H. (DIAG 1/6 — pi-config + pi-loom) Explicit prose-budget
field.** `agents/spec-review-finding-reducer.md` adds a
`**ProseBudget:** <int> words` field; pi-loom backfills it on T19e
specifically. **Under J, the explicit budget becomes optional
documentation** — the fixer narrows naturally without it. Keep as
authoring hygiene.

**C. (DIAG 4/6 — both repos) `produces:` / `consumes:`
Relationships taxonomy.** Add explicit producer/consumer fields so
read-channel dependencies are structural rather than parenthetical.
**Under J + F, this lets F's SCC detection see the right edges.**
Useful but not standalone.

### 7.5 Process step

**I. (n/a — pi-loom) Re-dispatch queued T20 + T15b.** Both findings
were unparked but the W1 run graceful-stopped before reaching them.
Run `/fix-spec-shape-single-findings` again. Under current pipeline
they will likely terminate similarly; under J they may converge on
first dispatch.

### 7.6 Summary table

| Rec | Title | Metric | Coverage | pi-loom | pi-config | Both |
|---|---|---|---:|:-:|:-:|:-:|
| **J** | **Solution approach as advisory** | **FIX** | **5/6** | | **✓** | |
| F | `Shape: multiple` cluster mode | FIX | 1/6 after J | | | ✓ |
| G | Manual reshape (fallback if J doesn't ship) | FIX | 6/6 if J absent | ✓ | | |
| A | Audit-side gate upgrade | DIAG | 6/6 | | ✓ | |
| D | Cumulative-score budget | DIAG | 3/6 | | ✓ | |
| C | `produces:`/`consumes:` taxonomy | DIAG | 4/6 | | | ✓ |
| B | Content-keyed C2 poisoning | DIAG | 2/6 | | ✓ | |
| E + H | ProseBudget field + T19e annotation | DIAG | 1/6 | (H) ✓ | (E) ✓ | |
| I | Re-dispatch queued T20 + T15b | process | n/a | ✓ | | |

### 7.7 Priority order

Ranked by fix-rate impact within each layer:

**Tier 1 — raise fix rate (do these first):**

1. **Rec J** (pi-config only) — Solution approach as advisory. **5
   of 6 W1 failures converge.** Single highest-leverage change.
   ~5 file edits; reuses existing C2 snapshot machinery; no new
   STATUS codes; no per-project config changes.
2. **Rec F** (both repos) — `Shape: multiple` cluster mode. Closes
   the 1 remaining case (T19d) and any future producer/consumer
   cluster. Substantially larger implementation than J.

**Tier 1-fallback — only if J is not shipped:**

3. **Rec G** (pi-loom only) — reshape each parked finding per its
   forensic recommendations. Manual workaround for J. Per-finding
   human cost; closes 6/6 of the current set; does not change the
   pipeline so future bad-shaped findings recur.

**Tier 2 — diagnostic-only (improve ops cost / human throughput):**

4. **Rec A** (pi-config only) — audit-side gate upgrade. Catches
   the same failures J handles, at audit time. Under J, this
   becomes an optimisation rather than a workaround.
5. **Rec C** (both repos) — `produces:` / `consumes:` taxonomy.
   Ship after J or alongside F.
6. **Rec B** (pi-config only) — content-keyed C2 poisoning. Less
   load-bearing under J.
7. **Rec E + H** (both repos) — explicit ProseBudget field. Less
   load-bearing under J.
8. **Rec D** (pi-config only) — cumulative-score budget. Less
   load-bearing under J.

**Tier 3 — process:**

9. **Rec I** (pi-loom only) — re-dispatch queued T20 + T15b.

**Single-line summary:** **ship rec J first.** Every other
recommendation either backs J up (F for the producer/consumer case
J misses, C for F's SCC detection), provides workaround for J
absence (G manual reshape), or improves diagnostics in cases J would
have prevented anyway (A, B, D, E, H). The fix-rate problem is one
architectural gap between SP-2 principle and the agent prompts; J
closes it.

## 8. What NOT to recommend

- **Loosening the lens corpus.** Cross-finding observation across all
  6 W1 reports: every lens finding was a real defect against the
  text the fixer authored. No filtered false positives. Loosening
  to make these loops converge would admit real defects on
  unrelated future findings.
- **Raising the score-budget threshold or `k` multiplier.** Each
  budget-counted finding flags a real defect. The boundary `Σ ≤ S`
  is correct in spirit; the failures are structural (heavy-branch
  Solution approach exceeds light-branch S).
- **Raising the 17-pass cap.** Pass-count is not the bottleneck;
  per-pass progress is. T19e burned 6 of 17 passes already in a
  re-emission cycle.
- **Landing the uncommitted pass-N spec edits.** All six W1 failures
  left a working-tree state at exit that is a fixer compromise
  authored against a wrong-shaped Solution approach; step 3e
  reverts correctly. Committing any of those diffs entrenches the
  contradiction.
- **Reverting the class-3 sweep wholesale.** The sweep is in the
  right direction (positive-space prescription as binding contract
  is the failure mode); rec J is the natural extension. Targeted
  mitigation of the T19e regression (rec H) is the right shape.
- **Reverting Change A, B, C1, C2, or D.** Every loop-side mechanism
  works as designed and shipped richer forensics as a side effect.
  The convergence-rate problem is upstream of all of them.
- **Treating "Solution approach is binding" as desirable for
  reproducibility.** The pipeline does not gain reproducibility from
  binding interpretation — it gains failure. A fixer that deviates
  with recorded rationale (in `## Notes`) is more reviewable than a
  fixer that loops on a wrong-shaped approach until it parks.

## 9. What this analysis adds over the prior meta-analysis

The prior meta-analysis (deleted in `a56ab5e`, recovered from
`3a15079`) correctly diagnosed two of the empirical patterns now
visible under W1 (paragraph-spending, bimodal heavy-branch) and
proposed the right loop-side machinery for them (Change A, B, C1,
C2). What it missed:

- It did not separate fix-rate from failure-detection. Its top three
  recommendations (audit-side greps) are diagnostic-only — they
  would have correctly predicted W1's failure set in advance, but
  they would not have converted any of those failures into fixes.
  Failure-detection improvements have value, but they do not
  improve the fix rate, and the prior meta-analysis ranked them as
  if they did.
- It did not surface the binding/directional gap. Its §B (drop
  class-3 constraints) addressed half of the gap; the other half —
  the same positive-space prescription pattern inside Solution
  approach itself — was not named. Rec J in this document is the
  natural completion of §B.
- It did not anticipate three W1 pathologies that only become
  visible after the W1 mechanics fire: slot-keyed C2 poisoning
  defeating content-equivalent re-emission, class-3 sweep regression
  on findings that had been quietly relying on class-3 prose
  budgets (T19e), and the `co-resolve` taxonomy mismatch for
  producer/consumer dependencies (T19d). The first is rec B; the
  second is rec E + H; the third is rec C + F.

The five-step priority order in §7.7 is the next iteration the
prior meta-analysis would have written if it had had the W1 forensic
reports to read against its own recommendations.

## Appendix — file and artifact references

Working notes (gitignored, under `.pi/tmp/meta-analysis-work/`):

- `01-forensic-summaries.md` — per-report extracts for each of the
  6 W1 forensic reports (detector arithmetic, root causes,
  audit-vs-actual, recommendations, crystallising quotes).
- `02-pi-config-changes.md` — diff-and-mechanism analysis of the
  6 pi-config commits that constitute W1 + W5 rubrics.
- `03-current-pipeline-catalogue.md` — current-tip catalogue of the
  7 pi-config spec-pipeline agents/prompts with inputs / outputs /
  detector arithmetic / ASCII call-flow diagram.
- `04-history-and-prior-meta.md` — recovered prior meta-analysis +
  tabulation of currently-parked findings + chronological narrative
  of unpark → W1 re-attempt → re-parking sequence.

W1 forensic reports (gitignored):

- `.pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/`
  - `t19a-extend-activeinvocationregistry-entry-shape-with-invocationid.md`
  - `t19b-add-invocation-id-field-to-runtimeevent-payload-declaration.md`
  - `t19d-populate-cancelled-by-session-shutdown-details-with-invocation-id.md`
  - `t19e-add-real-time-sibling-emission-timing-paragraph.md`
  - `t21-pi-side-slash-handler-promise-lifecycle-taken-as-given.md`
  - `t22a1-session-binding-contract-sub-section-in-pic-anchor-paraphrase-pi-source-ci.md`

Pre-W1 forensic reports (gitignored):

- `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/`
  (T19b, T19c, T19d — top-level-refused / diverging)
- `.pi/tmp/spec-fix-failure-forensics/2026-05-15T15-04-05_7wkalj/`
  (T22b — diverging)

pi-config (git-pinned via global settings under
`git:github.com/bitmonk8/pi-config`, cloned to
`~/.pi/agent/git/github.com/bitmonk8/pi-config/`):

- `prompts/fix-spec-shape-single-findings.md` (749 lines) — outer driver.
- `agents/spec-review-fixer.md` (445 lines) — top-level fixer, class-3
  stripper at extraction. **Rec J primary edit target.**
- `agents/spec-diff-fix-loop.md` (1 190 lines) — inner staged
  review→fix loop; owns all detectors + snapshot mechanism.
  **Rec J snapshot extension target.**
- `agents/spec-diff-fix-classifier.md` (715 lines) — per-pass
  classifier; D-mode / A-mode triage; must-fix-blocked exits.
- `agents/spec-diff-fixer.md` (398 lines) — per-finding inner fixer;
  scope-guard discipline. **Rec J new refusal mode target.**
- `agents/spec-fix-failure-forensics.md` (592 lines) — per-failure
  forensic report writer.
- `agents/spec-review-parker.md` (443 lines) — physically moves
  failing finding + ordering-dependents into `spec-review-parked.md`.
- `docs/spec-principles.md` (313 lines) — SP-1 and SP-2.
  **Rec J SP-2 wording correction target.**
- `docs/spec-review-followups.md` (189 lines).

W1 commits in pi-config (`git log --oneline` ordering):

- `a3136af` Change A — severity-weighted triage
- `0d7d9b6` Change B — drop class-3 authoring (constraints only)
- `f92cd3c` W5 rubrics — spec lens corpus
- `e9d2307` Change C1 — staged lens introduction
- `a50f02f` Change D — combined-score budget
- `2613f98` Change C2 — backtracking on surface expansion

pi-loom commits in the W1 re-attempt timeline:

- `dbc73e2` (2026-05-16) — class-3 sweep on pi-loom findings.
- `cc91b23` + `44f2c5e` (2026-05-16 19:48Z) — unpark 11 findings.
- `a56ab5e` (2026-05-16 19:50Z) — delete prior meta-analysis.
- `e8be9bf` (2026-05-16 20:16Z) — re-park T19d (must-fix-blocked).
- `14c8a8c` (2026-05-16) — resolve T19c.
- `531c22d` (2026-05-16 22:58Z) — re-park T19b (diverging).
- `00332d1` (2026-05-17 01:01Z) — re-park T19a (limit-cycle).
- `cfcbe38` (2026-05-17 02:20Z) — re-park T22a1 (+3 cascade).
- `dd79e22` (2026-05-17 02:48Z) — re-park T21 (must-fix-blocked /
  score-budget-exhausted).
- `c8a362f` (2026-05-17 05:20Z) — re-park T19e (diverging).

End of meta-analysis.
