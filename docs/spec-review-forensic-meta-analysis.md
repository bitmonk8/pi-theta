# Meta-analysis — W2 spec fix-loop re-attempt (rec J + rec F)

```
PROJECT: pi-loom
SCOPE: did the W2 pi-config changes (dd974d9 rec J + f10e3c1 rec F,
       2026-05-17) deliver the convergence the prior meta-analysis
       predicted (J → 5/6 of the W1 failures + F → the remaining 1)?
INPUT: 8 forensic reports under
       .pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/
       (one MULTI cluster report + 7 single-finding reports)
       + the empty forensic directory at .pi/tmp/spec-fix-failure-forensics/
         2026-05-17T16-38-15_cb7511/ (the run-1 dispatch produced no
         failure reports; convergence-only or aborted)
       + pi-loom commits 037f8a3 (unpark T19 cluster), fb771f3 (unpark
         T21 + T22a1 + cascade), and the 8 resolve / 8 park commits
         spanning 2026-05-17 to 2026-05-18
       + pi-config commits dd974d9 (rec J) and f10e3c1 (rec F)
       + docs/spec-review.md and docs/spec-review-parked.md at HEAD
       + the prior meta-analysis (this document's predecessor) at
         52eae47

HEADLINE: Rec J converted 2 of the 6 W1 failures (T21, T22a1 +
          cascade T22b/T22c/T15c) into clean fixes. The 4-member
          T19a/b/d/e cluster was dispatched through rec F (MULTI
          mode) and parked on a cluster-importance-aggregation
          bug (Σ=60 vs S=25, defaulted-medium budget because the
          synthesised MULTI heading is absent from `spec-review.md`
          by construction). The fix — rec K — has shipped
          (pi-config 344da26) and the cluster is unparked
          (pi-loom e12ccf9) awaiting re-dispatch.

          Re-dispatch of the newly-active spec-review batch
          (T12–T18a, dispatched alongside the unparked W1 set)
          produced 7 single-finding parks. Reading them through
          the architectural cut "fixer = mechanism, not author;
          rejection is either (1) malformed finding or (2) fixer
          too-hard": 6 of the 7 parks are CATEGORY 1 (T13, T14,
          T15a, T16a, T16b, T18a — the fixer correctly refused a
          malformed finding); 1 is CATEGORY 2 (T12 — the fixer
          lacks stage-transition structural-growth awareness).
          This re-frames the work load: pi-config gets ONE
          fixer-capability extension (rec T); the remaining six
          parks resolve through finding-authoring reshapes in
          pi-loom plus three audit-side / signal-hygiene
          recommendations (L, M, W).

PRIMARY WORK: ship rec T (pi-config; one fixer-capability gap);
              ship rec L + rec M + rec W (pi-config; route
              category-1 malformations to reshape earlier and
              with clearer signal); author 6 reshapes + 1 new
              spec-review finding in pi-loom (finding-authoring
              layer). Rec K has already shipped and rec K's
              re-dispatch of the T19 cluster is queued.

GENERATED: 2026-05-18T09:00:00Z
           revised 2026-05-18T13:00:00Z (architectural cut:
             fixer-is-mechanism-not-author; reject-category
             taxonomy; recommendations restructured under
             Tier A / B / C / D)
           revised 2026-05-18T15:00:00Z (binding-surface
             tightening: Solution approach formally excluded
             from category-1 attribution per rec J's
             advisory/directional reading; §5.4 T16a / T16b /
             T18a re-attributed to constraints /
             missing-prerequisite / score; rec L re-scoped
             from approach-surface to binding-surface
             ratification; rec P reframed as Problem-metadata
             + score-vs-residue audit; Tier E reshape entries
             for T16a / T16b re-led with binding-surface
             remediation)
           revised 2026-05-18T17:00:00Z (rec V — Solution
             constraints demoted to advisory, mirroring rec J
             on the constraints surface; new Tier S header in
             §6; rec V slotted first in priority order per user
             direction to ship fixer-pipeline changes ahead of
             rec L; supersedes the withdrawn rec U with an
             added authoring-guard refusal mode that absorbs
             rec L's T14-shape coverage in the interim;
             §5.4 T15a / T16a rows annotated with rec V
             self-resolution; §7 rec U withdrawal entry
             updated to note supersession)
           revised 2026-05-18T19:00:00Z (constraint load-bearing
             sweep across pre-W2 forensics found rec V's original
             single-predicate authoring guard insufficient;
             replaced with three discriminating refusal modes per
             docs/spec-review-constraint-sweep.md —
             (f-stop-1) unanticipated authoring;
             (f-stop-2) co-resolve / must-precede siblings'
             territory;
             (f-stop-3) would-weaken existing rule;
             validation canary set expanded from T14-only to
             T14 + T19 cluster + T22a1; T19 cluster is the
             heaviest canary because the W2 T19b forensic
             explicitly describes the boundary violation that
             would occur without (f-stop-2); SP rule text
             revised to enumerate the three guard predicates;
             §6.7 summary table and §6.8 priority Tier 4
             updated)
           revised 2026-05-18T21:00:00Z (rec V shipped to
             pi-config as commit 8f0ccfe; SP-2 *Solution
             constraints are advisory, not binding* added to
             docs/spec-principles.md; refusal mode (f) with
             three-mode authoring guard ((f-stop-1) /
             (f-stop-2) / (f-stop-3)) added to
             spec-diff-fixer; new STATUS code
             must-fix-blocked-constraint-narrowing-refused
             added to spec-diff-fix-loop; classifier gains
             defer-to-debt — constraint-narrowed rationale;
             1240 insertions / 130 deletions across 7 files
             (rec J reference: 702/71). Validation canary set
             unparked in pi-loom as commit 90968cf (T14 +
             T15b + T15a + T16a back in spec-review.md;
             dispatch order T15b → T15a → T16a → T14 → T19
             cluster under bottom-up). Validation pending:
             requires running /fix-spec-shape-single-findings
             to observe the four canary outcomes and confirm
             rec V cures / refuses as predicted. §6.7 summary
             table Rec V row updated; §6.8 priority Tier 1
             step 1 and Tier 4 step 10 annotated with shipped
             /unparked status.)
```

## Sources

- **Prior meta-analysis** at `52eae47:docs/spec-review-forensic-meta-analysis.md`
  — predicted rec J would convert 5 of 6 W1 failures (T19a, T19b,
  T19e, T21, T22a1) and rec F would convert the remaining 1 (T19d,
  the producer/consumer case). The prediction names J as a fixer-
  prompt change with a single new refusal mode plus an SP-2 wording
  correction; F as a multi-finding cluster dispatch mode.
- **pi-config W2 commits**, both 2026-05-17:
  - `dd974d9` rec J — Solution approach is directional, not binding.
    Modifies `docs/spec-principles.md` SP-2 + the five agents named
    in the prior meta-analysis (`spec-review-fixer.md`,
    `spec-diff-fixer.md`, `spec-diff-fix-loop.md`,
    `spec-diff-fix-classifier.md`, `prompts/fix-spec-shape-single-findings.md`).
    702 insertions, 71 deletions across 6 files.
  - `f10e3c1` rec F — `Shape: multiple` cluster resolution mode.
    Modifies `spec-review-shape-single-picker.md`,
    `spec-review-fixer.md`, `spec-diff-fix-loop.md`,
    `spec-fix-failure-forensics.md`, `spec-review-parker.md`,
    `prompts/fix-spec-shape-single-findings.md`,
    `prompts/spec-review.md`. 774 insertions, 148 deletions
    across 7 files. New cluster-marker syntax
    `**Shape:** multiple` + `**State:** reduced` walked via
    `co-resolve` edges.
- **pi-loom unpark commits**, 2026-05-17:
  - `037f8a3` unpark `T19a/T19b/T19d/T19e` as a rec-F cluster
    (annotated `**Shape:** multiple`, `**State:** reduced`,
    `co-resolve` edges between all four members).
  - `fb771f3` unpark `T21 + T22a1` with cascade `T22b/T22c/T15c`
    as single-finding rec-J candidates.
- **W2 re-attempt forensic reports**,
  `forensicsRunId 2026-05-17T16-41-31_b4324e/`:
  8 reports totalling 2 376 lines, comprising one MULTI cluster
  report (T19a/b/d/e, 483 lines) and 7 single-finding reports
  (T12 / T13 / T14 / T15a / T16a / T16b / T18a). Average 297
  lines/report. The earlier `2026-05-17T16-38-15_cb7511/`
  directory is empty (no failures recorded; the dispatch either
  converged on its targets or was aborted before any forensic
  writer fired).
- **pi-loom commits in the W2 timeline**, in chronological order:
  - Resolves (8): `bb4f8d4` T15c, `262cce2` T22a1, `068cb27`
    T22b, `8c930fe` T22c, `e89e42e` T21, `c72a2a1` T16d,
    `8d2078f` T16c, `4538b7c` T20.
  - Parks (8): `6a3e78d` T19 cluster (4 members), `8ca1f06` T18a
    (+3 cascade T18b/c/d), `9c0f97c` T16b, `02965b2` T16a,
    `87ca647` T15a (+1 cascade T15b), `b357201` T14, `cf3fb0f`
    T13, `d0723ec` T12.
- **Live state**, HEAD:
  - `docs/spec-review.md`: 19 H1s (T02–T11 family, T03a–f,
    T08a–c, T11a–c).
  - `docs/spec-review-parked.md`: 16 H1s — the 4-member T19
    cluster, T18a+T18b/c/d, T16a/b, T15a/b, T14, T13, T12.
- **Working notes** for this meta-analysis are inline in this
  document; no `.pi/tmp/meta-analysis-work/` extracts were
  generated for this iteration (the evidence base is small enough
  to fit in the document).

---

## 1. The question

The prior meta-analysis predicted that rec J alone would convert
5 of the 6 W1 failures (T19a, T19b, T19e, T21, T22a1) into
converging fixes, and rec F would close the remaining 1 (T19d).
Both recommendations shipped to pi-config on 2026-05-17, in
sequence (J then F). pi-loom unparked the 6-finding set
(T19a/b/d/e as a rec-F cluster of 4; T21 and T22a1 as
single-finding rec-J targets, with cascade T22b/c/T15c) and
re-ran `/fix-spec-shape-single-findings`.

The user observed mixed outcomes — some convergence, some
re-parking — and asked for a forensic meta-analysis of the
new failure reports under the same framing the prior
meta-analysis used. This document is that analysis.

## 2. Fix rate vs. failure detection — the metric, applied

The prior meta-analysis introduced two metrics:

- **Fix rate** = (# findings that converge and land a spec edit) /
  (# findings dispatched). The goal.
- **Failure-detection rate** = (# findings rejected/parked early
  with good diagnostics) / (# findings dispatched). A proxy.

W2's outcomes are clearer along both axes than W1's: of the 16
findings dispatched in this iteration (8 unparked W1 set + 8 newly
live), **8 converged and landed spec edits** and **8 parked with
forensic reports** (the T19 cluster as one rec-F unit accounting
for 4 of the original 6 W1 failures; T18a's parking cascaded to
its 3 dependents). Fix-rate-on-the-W1-set rose materially (5/6 of
the original W1 failures resolved); fix-rate-on-the-new-batch is
0/7 of the newly-dispatched non-cascade findings (T12, T13, T14,
T15a, T16a, T16b, T18a). Failure-detection improved further
(every park ships a forensic report; the rec-F cluster failure
produces a single report for the cluster rather than four reports
for its members, matching the unit of work).

## 3. What rec J and rec F shipped

### 3.1 Rec J — Solution approach as advisory

The shipped change matches the prior meta-analysis's prescription
closely:

- `docs/spec-principles.md` SP-2 gains a "Solution approach is
  directional, not binding" subsection and the implicit success
  criteria are reworded as predicted.
- `agents/spec-review-fixer.md` reads Solution approach as a
  starting hint; step 5 walks four narrowing checks (bimodal →
  light, edit surface delegated, over-promised scope, constraint
  collision) and emits a new `## Narrowed chunks (for inner loop)`
  output section.
- `agents/spec-diff-fixer.md` adds refusal mode `(d)
  approach-narrowing` with two sub-cases (chunk already in
  `NarrowedChunks` set → NOTES-only refusal; mid-pass
  repeat-inflation → revert to baseline-post-top-level + defer
  the lens finding).
- `agents/spec-diff-fix-loop.md` takes a
  `baseline-post-top-level` snapshot in step 2 and threads
  `NarrowedChunks` through to the classifier (step 3e-bis) and
  inner fixer (step 3g.2); extends the set from inner-fixer NOTES
  via step 3g.4.
- `agents/spec-diff-fix-classifier.md` recognises
  `defer-to-debt — approach-narrowed` as a defer rationale; rule
  b-bis between same-issue restatement and out-of-scope auto-defers
  fix-class findings whose chunk-id is in `NarrowedChunks`.
- `prompts/fix-spec-shape-single-findings.md` plumbs
  `narrowedChunks` through the orchestrator and on to forensics.

This is a strict extension — no existing exit code, classification,
or output block changes shape. Legacy single-finding invocations
still work; the new fields are absent-or-default-handled at every
seam.

### 3.2 Rec F — `Shape: multiple` cluster mode

Also matches the prior prescription:

- Cluster marker `**Shape:** multiple` + `**State:** reduced` on
  each member; `co-resolve` edges in `## Relationships`. The
  pre-rec-F meaning of `Shape: multiple, State: shaped` (needs
  reshape) is preserved.
- `spec-review-shape-single-picker.md` detects the markers, walks
  `co-resolve` edges from the bottom-most marker, emits
  `MULTI: <H1>; <H2>; …; <Hn>` (semicolons because heading text
  contains commas).
- `spec-review-fixer.md` accepts multi-line task body, unions
  Problems, synthesises a combined Solution approach (SP-2
  narrowing applies), unions Solution constraints, removes all
  members in one edit, emits combined output sections.
- `spec-diff-fix-loop.md` plumbs the `Heading:` field through;
  inner loop sees one stable post-edit state.
- `spec-fix-failure-forensics.md` produces one cluster report
  with `CLUSTER_MEMBERS` field and per-member root cause analysis.
- `spec-review-parker.md` parks every member directly + runs
  ordering-cascade closure; new `CLUSTER_MODE` and `DIRECT_COUNT`
  status lines.
- `prompts/fix-spec-shape-single-findings.md` verifies fixer's
  `## Cluster members` matches dispatch; commit messages take
  the form `resolve cluster … (+N-1 members)` or the parking
  equivalent.

This is also a strict extension keyed on the opt-in marker.

## 4. W2 outcomes

### 4.1 The original 6 W1 failures

| W1 finding | Pre-W2 outcome | W2 outcome | Fix-rate change |
|---|---|---|---|
| T21 | `must-fix-blocked / score-budget-exhausted` at `dd79e22` | **resolved at `e89e42e`** | +1 |
| T22a1 | `surface-expansion-irrecoverable` (+3 cascade) at `cfcbe38` | **resolved at `262cce2`** (cascade T22b at `068cb27`, T22c at `8c930fe`, T15c at `bb4f8d4`) | +1 (+3 cascade) |
| T19a | `limit-cycle` at `00332d1` | **cluster-parked** as 1 of 4 members at `6a3e78d` (`must-fix-blocked / score-budget-exhausted`) | unchanged status; mode changed (single → cluster) |
| T19b | `diverging` at `531c22d` | cluster-parked (same exit) | unchanged status |
| T19d | `must-fix-blocked-by-scope-guard` at `e8be9bf` | cluster-parked (same exit) | unchanged status |
| T19e | `diverging` at `c8a362f` | cluster-parked (same exit) | unchanged status |

**Net W1 fix-rate change: +5 of 6** (T21, T22a1, T22b, T22c,
T15c resolved; T19a/b/d/e cluster still parked but now under a
single rec-F unit). Counted as findings on the original W1
forensic set, rec J converted **2 of the 6 W1-named failures**
(T21, T22a1); the cascade `+3` (T22b/c/T15c) is the natural
consequence of T22a1's resolution under the pre-W1 ordering
graph. The T19 cluster failed at the rec-F integration boundary,
not at rec F's design or rec J's mechanism.

### 4.2 The T19a/b/d/e cluster — the one rec-F dispatch

The cluster's MULTI-mode report
(`multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md`,
483 lines) carries an unusually crisp diagnosis: the classifier
**exited on its first triage→classify cycle** with `Σ=60` against
`S=25`, breach margin 35. Pass 0's `_blocked.md` records the
origin importance as `medium (default — MULTI: T19a/T19b/T19d/T19e
heading absent from docs/spec-review.md, defaulted to medium per
policy)`. Every cluster member carries `**Importance:** high` on
its own H1 (verified at `037f8a3:docs/spec-review.md` lines
944, 967, 987, 1017). The classifier did not aggregate member
importances; it looked up the synthesised cluster heading in
`spec-review.md`, found nothing (by construction — the heading
is synthesised in pipeline, never authored in the doc), and
fell back to default-medium.

Under any reasonable aggregation rule the cluster's S should be
≥100 (max-of-members) and could be as high as 400 (sum-of-
members at high=100 each). Σ=60 is below all such values; the
cluster would have admitted every assessed finding (AF1 blocker
score=100 trust-override; AF4 score=25; AF6 score=35; AF7
score=5) and proceeded to apply them. The four findings that
the run did raise — AF1 (`RuntimeEvent.invocation_id` required
with no policy for binder-failure / setup-wrap-pre-`Set.add`
arms), AF4 (V18q citation drift — no such tests exist), AF6
(new paragraph lacks `<a id>` anchor + bundles two
independently-failable obligations), AF2 (construction-site
fallback contradicts the new "same footing as `loom`" framing,
SP-2 auto-deferred via narrowing) — are real, targeted, low-LOC
edits the user can hand-apply alongside the existing
top-level-fixer edit.

**Rec J's narrowing mechanism was active and worked correctly**
in this cluster: 3 of the 7 assessed findings hit the forwarded
`NarrowedChunks` set and auto-deferred to debt-register
(`defer-to-debt — approach-narrowed`). The remaining 4 fit
within the rec-J framing. The failure is upstream of rec J: the
budget the classifier was running against was wrong by a factor
of 4–16.

This is the lone newly-introduced bug in W2. Call it the
**cluster-importance aggregation gap**; rec K below closes it.

### 4.3 The newly-dispatched batch (T12–T18a)

7 single-finding parks. Each one is a clean instance of a
named-but-not-fully-scoped failure pattern. Compressed table:

| Finding | Exit | Primary root cause (per forensic report) | Pattern |
|---|---|---|---|
| T12 (dual-cap simultaneous breach) | diverging at pass 7 | Stage-2 anchor-split fix grew prose footprint (anchor + bold label + blockquote); stage-1 lenses re-armed on the new structure in stage 2 → fresh assumptions / consistency / scope findings. | **Structural-growth divergence.** Tier-2 fix that splits/anchors prose tends to grow it; the loop's `fixCounts` detector measures count but not "did the previous fix add structural scaffolding". |
| T13 (cross-file qualifier) | `must-fix-blocked-by-scope-guard` at stage 3 | Pre-existing undefined term (`cross-file`) was propagated into two further normative surfaces by T13's narrow naming sweep; stage-3 clarity lens flagged it; every remediation collided with the forwarded scope guard. | **Citation-form drift / latent-term amplification.** Narrow naming sweep makes a latent ambiguity load-bearing; scope guard blocks every fix path because the natural definition site is fenced. |
| T14 (4th premise) | `must-fix-blocked-by-scope-guard` at pass 3 | The "fourth premise" rule the finding's Problem asserts does **not exist** on the cited owner page (`invocation.md` Cross-mode semantics enumerates and permits the `subagent → prompt` cell; no closure rule to cite). Every fix path either contradicts the owner page or rewrites premises (i)/(ii)/(iii) (ScopeGuard 2). | **Finding malformed at root.** Problem statement misreads the owner page; the case is already discharged structurally; no honest authoring exists. |
| T15a (Session-model reduction) | top-level-refused | T15a's Solution constraint #3 pinned resolution order via initial line positions ("T15c at the highest line, T15b second, T15a last") that became false the moment T15c resolved and was removed from `spec-review.md`. Bottom-up dispatch now picks T15a first. Fixer's pre-flight precondition check caught it. | **Stale precondition encoding.** Ordering claim encoded as a structural prediction rather than a content-level check; vulnerable the moment a co-resolve sibling lands. |
| T16a (drop `~0.72.1` literal) | diverging at pass 5 | Solution approach pins a forward-link to **Host prerequisites — Pi SDK pin** that does not own the privilege-absence claim the reduction leaves behind. Every rewrite displaces the defect into a new sentence of the same bullet. | **Citation-form drift onto wrong target.** Forward-link names a section that documents an adjacent but distinct fact. Trust-override suppressed score-budget signal (Σ=125 at pass 1 vs S=25). |
| T16b (drop inline Pi-API names) | diverging at pass 9 | Solution approach mandates **effect** prose ("invocations see …") that picks one side of a live cross-section contradiction in PIC step 2 (literal `pi.setActiveTools([...snapshot, ...names, ...])` vs natural-language "**exactly** the loom's declared callable set"). SP-2 narrowing forced the must-fix-true consistency finding into debt-register; loop diverged on other prose. | **Mechanism→effect framing flip with no audit gate.** SP-1 reshape elevates a Pi-conditional outcome to a normative orientation claim that the linked owner section does not own (and that contradicts a sibling sentence on the same owner section). |
| T18a (success-side null-policy) | `must-fix-blocked / score-budget-exhausted` at rewound pass-1 (after surface-expansion backtrack) | Originating Recommendation under-specifies 3 axes the paragraph must commit on (caller-observation-surface taxonomy; quantifier domain of "regardless of terminal outcome"; pre-evaluation no-terminal-outcome behaviour). Medium-tier S=25 admits one medium follow-up at most; residue is Σ=30. | **Resolver-must-decide axes left to the fixer.** Each axis position raises lens findings; medium budget cannot absorb the residue. |

These are 7 distinct shapes; they share the underlying property
that **the audit pass routed all 7 to NO_ACTION or LOW** and the
inner loop discovered the defect only at fix time. The pattern
echoes the prior meta-analysis's audit-side observations but is
sharper: in each case there is a specific grep / cross-reference
walk / staleness check the auditor could perform that would catch
the defect at audit time.

### 4.4 Aggregate

- **Findings dispatched in W2:** 16 (8 unparked W1-set + 8
  newly-live: T20 + T12 + T13 + T14 + T15a + T16a–d + T18a).
- **Resolved:** 8 (T20, T16c, T16d, T21, T22a1, T22b, T22c, T15c).
- **Parked:** 8 single-finding entries (T12, T13, T14, T15a,
  T16a, T16b, T18a, T19a-cluster), with cascade closure adding
  T15b, T18b/c/d, and the 3 remaining T19 members for a total
  parked-headings count of 16 visible in
  `spec-review-parked.md`.
- **Pass-burn distribution:** 0 passes (T19 cluster — exit
  pre-pass-1), 2 (T13 — stages 1 + 2 clean, blocked at stage 3
  classifier), 3 (T14 — 2 fix + 1 blocking classifier), 2 (T18a —
  including the rewound run), 5 (T16a), 7 (T12), 9 (T16b). Pre-W2
  bounds (≤6 in W1) are exceeded by T16a and T16b, both diverging
  on legitimate stage-3 prose-quality findings.
- **Forensic reports** average 297 lines/report (down from W1's
  ~470) because rec F collapses the T19 cluster's four members
  into one report. Per-member single-finding reports remain in
  the same shape as W1.

W2 is what its mix of mechanics predicts: rec J converged the
findings whose Solution approach was the binding/directional gap
the prior analysis named (T21's bimodal Path-B heavy branch,
T22a1's missing trap-guard); rec F shipped a real cluster-
dispatch mechanism that fails on a separate engineering gap; and
the newly-dispatched batch surfaces 7 failure shapes that the W1
forensic set hinted at but did not exhibit in pure form.

## 5. Root cause analysis

The previous meta-analysis identified one architectural gap (the
binding/directional reading of Solution approach) and predicted
that closing it would resolve 5/6 W1 failures. That prediction
was directionally right on the failures rec J could reach — T21
and T22a1 both resolved on first dispatch under the new fixer —
but it overcounted by treating the T19 cluster as four single-
finding rec-J targets when the actual dispatch treats it as one
rec-F cluster, and it under-named a deeper architectural cut
that the W2 newly-dispatched batch makes unavoidable. This
section works through the W1-set evidence first (where the prior
prediction held), then states the architectural cut (§5.3), then
re-reads the parked set through it (§5.4).

### 5.1 Where rec J worked, it worked cleanly

T21 resolved at `e89e42e`. The W1 forensic report on T21
identified the failure as a "bimodal, Path-B exceeds S=25"
Solution approach (Path A = single citation, Path B = new
paragraph + new checklist item + new vocabulary + remediation
arm; Path B's derivative defect surface had Σ=35 > S=25). Under
rec J the top-level fixer is now licensed to narrow the approach
to Path A and defer Path B's lens findings to debt. The W2
commit message and the absence of a re-park confirm this is
what happened.

T22a1 resolved at `262cce2`. The W1 forensic report identified
the failure as a "missing trap-guard" Solution-constraints
defect that let a pass-2 fixer author a routing clause not in
the original approach (under pressure from a pass-1
under-attribution lens finding) which then tripped PIC line 804's
catch-all MUST. Under rec J the inner fixer recognises the
re-inflation of a prior-touched chunk, reverts it to baseline,
and defers the under-attribution finding. The T22a1 cascade
T22b/T22c/T15c resolved naturally on the next dispatch passes.

No new pi-loom edits to the T21 or T22a1 finding bodies were
required between the W1 forensic reports and the W2 resolves.
The mechanism shipped in rec J is doing the work the prior
meta-analysis predicted, on the cases that fit its frame.

### 5.2 Where rec F failed, it failed at the integration boundary

The T19 cluster MULTI dispatch is the clearest single failure in
W2. The `_blocked.md` header reads:

```
**Origin importance:** medium  (default — `MULTI: T19a/T19b/T19d/T19e`
heading absent from `docs/spec-review.md`, defaulted to medium
per policy; siblings T15a/T15b/T18a etc. in the same cluster are
all tagged `**Importance:** medium`)
```

The parenthetical is misleading (the actual cluster members are
all `high`; the "siblings" comparison reaches for adjacent
clusters rather than in-cluster members) but the operative claim
is true: the classifier's heading-lookup did not find the
synthesised heading, so it defaulted to medium. By construction
the synthesised MULTI heading is **never** present in
`spec-review.md` — the picker invents it from the marker walk —
so the heading-absent path is the only path a MULTI dispatch
ever takes. Every rec-F cluster will hit this code path; only
the random alignment between cluster member importance and
default-medium budget hides it on some clusters.

This is not a design flaw in rec F. The shipped commit f10e3c1
makes the cluster the unit of dispatch; the inner loop sees one
stable post-edit state (verified by the cluster's clean first
triage cycle); rec J's narrowing mechanism integrates correctly
(3 of 7 assessed findings auto-deferred via `NarrowedChunks`).
The bug is one missing aggregation step in
`spec-diff-fix-classifier.md`'s origin-score lookup.

### 5.3 The fixer/finding architectural boundary

The prior meta-analysis (and earlier revisions of this one)
treated the parked set as a heterogeneous list of "the loop
couldn't fix this" failures and proposed pipeline mechanisms
(narrowing license, followup emission, constraint loosening) to
grow the loop's reach. That framing conflates two architecturally
distinct roles:

- **Fixer = mechanism.** Reads a finding, applies an edit that
  solves the Problem within the constraints, or rejects. The
  fixer is **not** an author. It does not decide what the work
  is; it executes the work the finding describes.
- **Finding-authoring layer = author.** Decides what the work
  is. Composed of human review, the reducer, the auditor, and
  any auto-reshape paths. Owns delete / split / merge / reorder /
  reformulate decisions.

Under this cut, rejection has exactly two valid categories:

- **Category (1) — malformed finding.** The finding is wrong on
  at least one of its **binding surfaces** — the parts of the
  finding the fixer is obligated to honour. The binding surfaces
  are:
  - **Problem** — the defect the finding asserts. Malformed when
    it embeds a false claim about the corpus, omits engagement
    with corpus state the remediation depends on, propagates an
    undefined term, or assumes a prerequisite that does not
    exist.
  - **Solution constraints** — what the fixer is forbidden to
    do. Malformed when they over-fence every reasonably valid
    remediation site (no honest solution exists within the
    constraints), or under-specify what's binding so the fixer
    cannot tell which sites it may touch.
  - **Score** — the budget the fixer's edit must fit within.
    Malformed when it is too low to admit the residue the
    Problem's work generates, regardless of which approach the
    fixer narrows to.
  - **Ordering edges** — `must-precede` / `co-resolve` /
    `must-follow` relationships in `## Relationships`. Malformed
    when stale (predicting a sibling resolution order that no
    longer holds), missing (the Problem depends on another
    finding landing first but no edge says so), or contradicted
    by a sibling that already resolved.
  - **Missing prerequisite finding** — the corpus state the
    Problem assumes can only be established by another finding
    that does not yet exist in `spec-review.md`. The malformation
    is on the finding-authoring layer's set rather than on this
    finding's body, but it parks this finding at the fixer.

  Forward reference: **rec V** (§6.1) would demote Solution
  constraints out of this list, mirroring rec J's treatment of
  Solution approach. Under post-rec-V state the binding surfaces
  reduce to Problem / score / ordering edges /
  missing-prerequisite-finding. §5.4 attributions that name
  constraints as the binding surface (T15a, T16a) self-resolve
  under rec V; the remaining category-1 attributions are
  unchanged. This section describes the pre-rec-V state.

  Solution approach is **not** a binding surface (rec J makes it
  advisory/directional). An approach-level defect alone is never
  a category-1 malformation; the fixer is licensed to narrow,
  redirect, or ignore the approach in favour of one that fits
  the binding surfaces. Every category-1 attribution in §5.4
  must name the binding surface where the malformation lives;
  approach-level observations may appear as symptoms but never
  as the attribution.

  The finding-authoring layer's response to a category-1 reject
  is to delete, split, merge, reorder, reformulate the Problem,
  loosen the constraints, raise the score, repair the ordering
  edges, or author the missing prerequisite finding. The fixer
  must not paper over malformations by inventing new findings,
  widening the edit surface beyond what the finding names, or
  narrowing constraints the finding pins.
- **Category (2) — fixer too-hard.** The finding is well-formed
  on every binding surface but the fixer's current capability
  cannot execute the edit. The pi-config side responds by
  extending the fixer.

Rejection paths that look like "the fixer needs to be smarter
about authoring" are category errors. Either the finding is
asking the fixer to do something it shouldn't be doing (the
finding is malformed), or the fixer needs a discrete capability
extension (and the extension should be specified in terms of
recognising and applying a particular edit shape, not in terms
of rewriting findings).

This cut also tells us where the audit-side recommendations
belong. The auditor is part of the finding-authoring layer —
its job is to catch malformed findings before dispatch. Audit
improvements are not pipeline empowerments; they are
finding-authoring-layer empowerments that route category-1
rejects to the right place (reshape) earlier in the cycle.

### 5.4 Re-reading the W2 parks under the reject taxonomy

Walking each park by category. Each category-1 row names the
**binding surface** where the malformation lives (per §5.3:
Problem / constraints / score / ordering / missing-prerequisite
-finding). Approach-level observations are descriptive of what
the fixer faced, not normative about which surface is malformed
— under rec J the fixer is licensed to narrow approach, so an
approach defect alone never warrants reshape.

| Finding | Category | Specific malformation / capability gap |
|---|---|---|
| **T12** | (2) too-hard | Fixer doesn't recognise that adding `<a id>` / `> **Note**` blockquote / bold-label scaffolding in stage 2 to a chunk that converged stage 1 clean re-arms tier-1 lenses on the next pass. Problem and constraints are sound; Solution approach is acceptable. The fixer needs a discrete capability: refuse a mid-loop fix candidate whose proposed text adds structural scaffolding to an otherwise tier-1-clean chunk. |
| **T13** | (1) malformed | Problem statement is incomplete — it asserts "the qualifier is omitted" without engaging with the corpus-state prerequisite that `cross-file` is undefined anywhere in `docs/`. The constraints then fence off the only definition site. Reshape: split into a defining-finding (own the term in the *countable-frame* paragraph or `glossary.md`) + the propagation finding, with `must-precede` ordering. |
| **T14** | (1) malformed | Problem statement embeds a false factual claim ("the closing rule lives in `invocation.md` Cross-mode semantics"). The owner page enumerates and *permits* the cell rather than closing it. Reshape: retire (the case is already discharged structurally by *Transcript and tool-table isolation* + the supports list's "within a single user session" scoping), or reframe as a no-window observation citing the existing isolation clause. |
| **T15a** | (1) malformed | Solution constraint #3 encodes an ordering prediction ("bottom-up ordering guarantees T15c first, T15b second, T15a last") that became false after T15c resolved. Reshape: rewrite constraint as a content-level check ("if `Concurrency model` subsection is absent in `spec.md`, defer"). Already caught by the fixer's pre-flight precondition check, which is the correct category-1 reject behaviour. **Under rec V (§6.1):** self-resolves — the fixer detects the stale structural-ordering prediction and ignores the constraint, dispatching normally. The reshape is then optional clarity work, not blocking. |
| **T16a** | (1) malformed | **Binding surface: constraints.** The Problem's reduction (delete the `~0.72.1` literal) leaves orphan premises on the surviving Trust-boundary prose; Solution constraints fence that prose, so the fixer has no remediation site for the orphans. A reasonably valid solution (re-source the orphan premises onto the surviving prose) is forbidden by the constraints; every site the constraints do permit contradicts the Problem. The approach's forward-link choice was a symptom of the fixer searching for a site the constraints allow; rec J licenses narrowing the approach, but the constraint fence is binding. Reshape: loosen the constraint that fences the surviving prose, OR split into delete-literal + source-the-premises atoms whose individual constraints each admit the atom's remediation, OR raise score to admit the residue. **Under rec V (§6.1):** self-resolves — the fixer detects the over-fencing (every honest remediation site for orphan premises is fenced), narrows the fence to admit the most-natural site, and dispatches. The reshape is then optional clarity work, not blocking. |
| **T16b** | (1) malformed | **Binding surface: missing prerequisite finding.** The Problem treats the cited owner (PIC step 2 at L213) as authoritative on callable-set semantics, but the owner is internally self-contradictory (literal `pi.setActiveTools([...snapshot, ...names])` call shape vs natural-language "exactly the loom's declared callable set"). No reasonably valid solution exists for T16b until that contradiction is resolved by a prerequisite finding that does not yet exist in `spec-review.md`. Any approach the fixer narrows to — mechanism, effect, hybrid — collides with one side of the owner contradiction; this is not approach-rescuable. Reshape: author the missing prerequisite finding (PIC step 2 internal contradiction) and add a `must-precede` edge from it into T16b; T16b's Problem then lands cleanly against a non-contradictory owner. |
| **T18a** | (1) malformed | **Binding surface: score** (with a related Problem-metadata gap). The Problem implicitly requires the paragraph to commit on 3 orthogonal axes (caller-observation-surface taxonomy; quantifier domain of "regardless of terminal outcome"; pre-evaluation / no-terminal-outcome behaviour); each axis generates ≥1 medium-importance lens follow-up. Medium-tier S=25 admits at most one such residue, so any reasonably valid solution exceeds the budget regardless of which axis positions the fixer narrows to. The Problem also omits the axis count as authoring metadata, so the auditor's budget check cannot fire pre-dispatch. Reshape: raise the score so the residue fits, OR split into per-axis atoms whose individual scores each admit one residue, OR pin the axis count in the Problem so a score-vs-axes audit can downgrade before dispatch. |
| T15b, T18b–d | cascade | Re-dispatch when upstream lands; no per-finding reshape. |

**Tally under the reject taxonomy:**

- **Category (1) malformed:** 6 (T13, T14, T15a, T16a, T16b, T18a)
- **Category (2) too-hard:** 1 (T12)
- **Cascade (upstream-bound):** 4 (T15b, T18b, T18c, T18d)

Six of seven non-cascade parks are finding-malformed. The
pipeline's per-finding refusal was correct in every case; the
work to unpark them belongs to the finding-authoring layer, not
to pi-config. Only T12 sits in category 2 — the fixer's
stage-transition awareness is the single discrete capability
gap visible in W2 forensic evidence.

### 5.5 Implications for where work belongs

The taxonomy redirects effort:

- **pi-config (fixer-capability):** one rec (rec T, stage-
  transition structural-growth refusal). Targeted, small, and
  the only category-2 work visible in W2.
- **pi-config (finding-authoring-layer empowerments):** three
  recs (rec L for cited-target ratification, rec M for
  precondition staleness, rec P for decision-axes surfacing in
  the reducer). All three move category-1 detection earlier in
  the cycle so the fixer stops burning passes on malformations
  the audit could catch first.
- **pi-config (signal hygiene):** one rec (rec W — distinguish
  category-1 and category-2 exit codes so park commits / forensic
  reports tell the reader immediately whether to reshape or to
  file a pi-config issue).
- **pi-loom (finding-authoring):** six per-finding reshapes
  (T13, T14, T15a, T16a, T16b, T18a) + one new spec-review entry
  for the PIC L213 contradiction that T16b depends on. The
  per-finding forensic reports already include reshape
  recommendations under each report's `### Immediate (this
  finding)` subsection.

The re-balance is the substantive observation: **most of the W2
work load is in pi-loom, not pi-config.** Earlier revisions of
this document had it reversed.


## 6. Recommendation set

Structured under the §5.3 architectural cut:

- **Tier S — finding-shape principle changes** (pi-config).
  SP-level / architectural: change which surfaces of a finding
  are binding on the fixer. Architecturally upstream of every
  other tier because it changes the set of surfaces the rest of
  the tiers operate on.
- **Tier A — fixer-capability extensions** (pi-config). Category 2
  work: discrete capabilities the fixer needs to handle well-formed
  findings the current fixer cannot execute on.
- **Tier B — finding-authoring-layer empowerments** (pi-config).
  Category 1 work: move malformation detection earlier in the
  cycle so the fixer stops burning passes discovering it.
- **Tier C — pipeline rejection-signal hygiene** (pi-config).
  Cross-cutting: tag pipeline exits with their reject category so
  human readers know which layer responds.
- **Tier D — known pipeline bugs** (pi-config). Orthogonal to the
  taxonomy: correctness fixes for shipped mechanisms.
- **Tier E — finding-authoring work** (pi-loom). The reshapes the
  finding-authoring layer owes the parked set.

Rec K (shipped, commit 344da26) sits under Tier D and is no
longer the headline. The headline work is now **rec V** (Tier S
— demote Solution constraints to advisory; ships first per user
direction to validate the fixer pipeline before audit-layer work)
plus rec T (the one category-2 capability gap in W2) plus
follow-up rec M + rec W (signal hygiene and pre-dispatch
staleness) plus the per-finding reshapes in pi-loom. Rec L
is postponed until rec V validation completes; the
authoring-guard refusal mode inside rec V absorbs rec L's
T14-shape coverage in the interim.

### 6.1 Tier S — finding-shape principle changes (architectural)

**Rec V — Solution constraints are advisory, not binding.**

*See also:* `docs/spec-review-constraint-sweep.md` — the
constraint load-bearing sweep across 15 pre-W2 forensic reports
that informed the three-mode authoring guard below.

Architectural mirror of rec J on the **constraints** surface.
Solution constraints become directional guidance the fixer is
licensed to narrow, ignore, or relax — analogous to how rec J
made Solution approach advisory. Removes constraints from the
§5.3 binding-surfaces list, eliminating two W2 category-1
malformation modes (stale precondition encoding; over-fencing of
remediation sites). Supersedes the withdrawn rec U with a
three-mode authoring guard that prevents the boundary violations
rec U's prior framing rightly worried about — specifically the
cross-finding scope-guard pattern (rec U's predecessor framing
had no answer for it).

**Motivation (from §5.4 W2 evidence + constraint-sweep pre-W2
evidence):**

- T15a parked on a stale structural-ordering prediction encoded
  in constraint #3. Under rec V the fixer detects the stale
  prediction and ignores the constraint; T15a dispatches.
- T16a parked on constraints fencing every honest remediation
  site for orphan premises the reduction left behind. Under
  rec V the fixer narrows the fence to admit the most-natural
  site; T16a dispatches.
- T13 partly parked on constraints fencing the natural
  definition site for `cross-file`. Under rec V the fixer can
  narrow the fence — but the underlying Problem-surface defect
  (Problem doesn't engage with the undefined-token corpus state)
  remains; T13 still parks on the Problem surface (or as
  missing-prerequisite). Coverage: partial.
- T14 parked under `must-fix-blocked-by-scope-guard` on
  constraints that correctly guarded against fixer-as-author
  (rewriting premises (i)/(ii)/(iii) to manufacture a missing
  "fourth premise"). Authoring guard mode `(f-stop-1)` refuses
  the narrowing; T14 parks safely without boundary violation.
- **T19 cluster (T19a/b/d/e)** — the constraint sweep's
  load-bearing test. Each member's constraints encode a
  cross-finding scope guard naming the other cluster members'
  territory (Pattern G carve-out). The W2 T19b forensic
  explicitly records: *"fixer would push T19c-territory MUSTs
  into the field comment under D-mode clause 1 must-fix-blocker
  pressure"* — i.e., when the constraint is binding the fixer
  overflows into a field-comment surface to avoid the violation;
  when advisory without the guard, the fixer authors T19c's
  territory directly. Authoring guard mode `(f-stop-2)` refuses
  the narrowing via the `co-resolve` edges already present in
  `## Relationships`; cluster parks safely.
- **T22a1** — four cross-finding scope guards (T36 / bump-
  procedure step 5; T22b / T22c pre-installation; T15c
  closing-sentence ownership; T22b `future-considerations.md`
  ownership). Mode `(f-stop-2)` covers the cross-finding
  cases; const #1's externally-owned-literal protection is
  rec L territory and remains exposed under the rec-V-only
  milestone (acceptable per user direction).
- **T20 ScopeGuard 4** — "MUST-NOT-weaken existing rule,
  stable-landmark" pin. Authoring guard mode `(f-stop-3)`
  refuses narrowings that would strip or relax an existing
  MUST / MUST-NOT / SHOULD.

**Mechanism (sketch):**

- **SP rule change** (`docs/spec-principles.md`): new subsection
  "Solution constraints are advisory, not binding" — parallels
  rec J's SP-2 treatment of Solution approach. Constraints are
  directional guidance; the fixer is licensed to narrow, ignore,
  or relax constraints that over-fence the only valid
  remediation site for the Problem's residue, or that encode
  stale structural predictions. The fixer must not narrow
  constraints in ways that would (a) author content the Problem
  does not name, (b) author content within a `co-resolve` or
  `must-precede` peer's named territory, or (c) weaken an
  existing MUST / MUST-NOT / SHOULD on the owner page — see
  authoring guard for the three discriminating refusal modes.
- **Fixer narrowing check** (`agents/spec-review-fixer.md`
  step 5): add a fifth narrowing check — constraint over-fencing
  detection. When every reasonably valid remediation site for
  the Problem's residue is fenced by a constraint, narrow the
  constraint to admit the most-natural site, and record the
  narrowing in a new `## Narrowed constraints (for inner loop)`
  output section.
- **Inner-fixer refusal mode** (`agents/spec-diff-fixer.md`,
  new mode `(f) constraint-as-advisory`): if a fix candidate
  is rejected purely because of a constraint that fits the
  over-fencing or stale-prediction pattern, defer the rejection
  and try the narrowing path. Sub-case for staleness: detect
  constraint text asserting structural-ordering predictions
  ("MUST have already landed", "lands first / last", "bottom-up
  ordering guarantees X") and verify the prediction against
  current `spec-review.md` state; ignore if stale.
- **Authoring guard** (`agents/spec-diff-fixer.md`, three new
  refusal modes). The constraint sweep
  (`docs/spec-review-constraint-sweep.md`) walked 19 load-bearing
  cases across 15 pre-W2 forensic reports. An earlier sketch of
  this guard used a single predicate ("narrowing would require
  asserting content not on the owner page"); the sweep found
  that predicate over-fires on every legitimate addition and
  under-fires on the cross-finding pattern (the dominant
  load-bearing shape, 9 of 19 cases). The guard is decomposed
  into three discriminating modes:

  - **`(f-stop-1) constraint-narrowing-would-author-unanticipated`**:
    refuse if the proposed content's subject NP, object NP, and
    verb-class are not all referenced explicitly in the Problem
    or Solution approach text. Catches T14 (the "fourth
    premise" content is unreferenced by the Problem's premises
    (i)–(iii)) and any cross-finding case where the
    unanticipated content is a sibling's territory and the
    Problem doesn't name it.
  - **`(f-stop-2) constraint-narrowing-would-author-co-resolve-siblings-territory`**:
    refuse if the proposed content falls within a `co-resolve`
    or `must-precede` peer's named edit surface (recovered from
    that peer's Problem text or Solution approach). **Most
    novel and most load-bearing refinement** — the sweep found
    9 of 19 cases fit this α-pattern. Catches the entire T19
    cluster, T22a1's pre-install of T22c chunk, T19d's source-
    from-T19a's-field case, and all sibling-territory patterns
    in the corpus.
  - **`(f-stop-3) constraint-narrowing-would-weaken-existing-rule`**:
    refuse if the proposed change would remove or relax an
    existing MUST / MUST-NOT / SHOULD on the owner page
    (detected by diffing the pre/post text of the affected
    paragraph and matching modal-verb stripping, scope
    reduction, or quantifier weakening). Catches T20-ScopeGuard-4
    -shape cases.

  When all three guards pass, the narrowing proceeds; constraint
  is treated as advisory; the fix lands. **Critical for
  postponing rec L** — the three guards together absorb rec L's
  T14-shape coverage *and* the cross-finding scope-guard
  coverage at the fixer layer until the audit layer ships. The
  externally-owned-literal protection (T22a1 const #1, T20
  ScopeGuard 1) is not covered by any of the three guards and
  is the explicit deferred-to-rec-L gap (see §6.1 “Known gaps”
  below).
- **Classifier defer rationale**
  (`agents/spec-diff-fix-classifier.md`): recognise
  `defer-to-debt — constraint-narrowed` as a defer rationale,
  mirroring `defer-to-debt — approach-narrowed`.
- **Loop plumbing** (`agents/spec-diff-fix-loop.md`): thread
  `NarrowedConstraints` through the inner loop analogous to
  `NarrowedChunks`. Extend the set from inner-fixer NOTES.
- **Orchestrator plumbing**
  (`prompts/fix-spec-shape-single-findings.md`): plumb
  `narrowedConstraints` through to forensics.
- **Exit-code retirement** (`agents/spec-diff-fix-loop.md`,
  `agents/spec-review-parker.md`): `must-fix-blocked-by-scope-guard`
  becomes a category-2 exit
  (`must-fix-blocked-constraint-narrowing-refused`) when the
  authoring guard fires; otherwise the constraint is narrowed
  and the loop continues. Update rec W's exit-code table
  accordingly when rec W ships.

**Coverage:** 

- **Cures (rec V dispatches cleanly):** T15a (stale-prediction
  detection), T16a (over-fencing narrowing).
- **Guard refuses safely (rec V parks without boundary
  violation):** T14 via `(f-stop-1)`; T19 cluster T19a/b/d/e
  via `(f-stop-2)`; T22a1 cross-finding cases via `(f-stop-2)`;
  T20-ScopeGuard-4-shape cases via `(f-stop-3)`. Same exit
  shape as today (`must-fix-blocked-constraint-narrowing-refused`)
  but with a discriminating reason code.
- **Partial (binding-surface defect remains):** T13 (Problem-
  surface defect remains after constraint narrowing).
- **Out of scope for rec V:** T16b (missing-prerequisite
  surface), T18a (score surface), T12 (category-2). These need
  their named recs (P, rec T, etc.).
- **Known gaps (rec L territory, exposed under rec-V-only
  milestone):** T22a1 const #1 (externally-owned literal:
  `SessionShutdownEvent['reason']` closed set owned by T36 /
  bump-procedure step 5); T20 ScopeGuard 1 (mandated-cruft
  ownership-attribution sentence). These defects produce real
  lens findings post-fix; acceptable under user direction to
  postpone rec L until rec V validation completes.

**Risk — canary set expanded beyond T14.** The original sketch
named T14 as the sole canary. The constraint sweep broadened
this: T14 exercises mode `(f-stop-1)`, the T19 cluster exercises
mode `(f-stop-2)`, and any T20-shape case (none in the W2 park
set; surfaces on next dispatch) exercises mode `(f-stop-3)`.
**The T19 cluster is the heaviest canary** because the W2 T19b
forensic literally describes the boundary violation that would
occur if the constraint were demoted without `(f-stop-2)`:
*"fixer would push T19c-territory MUSTs into the field comment
under D-mode clause 1 must-fix-blocker pressure"* — i.e., when
binding, the fixer overflows into a field-comment surface to
avoid the violation; when advisory without the guard, the fixer
authors T19c's territory directly. `(f-stop-2)` is the most
novel of the three modes and the one most likely to be
incomplete.

**Validation plan (staged re-dispatch in order):**

1. **T15a** — cures cleanly. Confirms basic rec V dispatches a
   constraint-fenced finding correctly.
2. **T16a** — cures cleanly. Confirms over-fencing narrowing.
3. **T14** — verify mode `(f-stop-1)` refuses with
   `constraint-narrowing-would-author-unanticipated` rather
   than manufacturing the missing fourth premise. Canary for
   Problem-anticipation predicate.
4. **T19 cluster (T19a/b/d/e)** — verify mode `(f-stop-2)`
   refuses with
   `constraint-narrowing-would-author-co-resolve-siblings-territory`
   for each member. T19b is the load-bearing test — the W2
   forensic names the exact boundary violation the guard must
   prevent. **Heaviest canary.**
5. **T22a1** (if re-dispatched; already resolved in W2 under
   rec J for the const-#2/#3/#4 cases but the const-#1
   externally-owned-literal case remains exposed) — verify
   mode `(f-stop-2)` refuses pre-install of T22c chunk if
   re-attempted; the const-#1 surface is expected to produce a
   downstream lens finding (acceptable, rec L territory).

**Failure response.** If any of steps 3–5 produces an
authoring violation (the corresponding guard fails to refuse),
harden that mode (or ship rec L earlier than planned) before
rec V's reach extends to additional findings. The validation
is staged precisely so a failure at step 3 does not contaminate
the step-4 / step-5 evidence.

**Files changed (pi-config):** `docs/spec-principles.md`,
`agents/spec-review-fixer.md`, `agents/spec-diff-fixer.md`,
`agents/spec-diff-fix-classifier.md`,
`agents/spec-diff-fix-loop.md`, `agents/spec-review-parker.md`,
`prompts/fix-spec-shape-single-findings.md`. Footprint analogous
to rec J's (≈700 insertions / ≈70 deletions across 7 files).

**Note on supersession.** Rec V supersedes the withdrawn rec U
(constraint-narrowing license). Rec U was withdrawn under the
prior architectural framing on the grounds that constraints were
binding (§7). Rec V changes that framing at the SP level and
revives the narrowing mechanic with the authoring guard added.

**Sequence note.** Per user direction, rec V ships first; the
W2 parked set is the re-dispatch validation target. Rec L is
postponed until rec V validation completes (or until the fixer
looks improvement-saturated). The intermediate state — rec V
shipped, rec L not yet shipped — relies on the authoring guard;
T14 re-dispatch is the canary for whether the guard is
sufficient.

### 6.2 Tier A — fixer-capability extensions

**Rec T — Stage-transition structural-growth refusal in the fixer.**

The only category-2 capability gap visible in W2. T12's failure
was not finding malformation; it was the fixer's lack of
awareness that adding structural scaffolding in stage 2 to a
chunk that converged stage 1 clean re-arms tier-1 lenses on the
next pass.

**Mechanism (sketch):**

- New refusal mode in `agents/spec-diff-fixer.md`: `(e)
  stage-transition-structural-growth`. Fires when:
  - the proposed fix's diff hunk adds any of `<a id=`, `> **`,
    `^### `, `**…\\.**$` (bold-label markers ending in period)
    to a chunk; AND
  - the chunk was tier-1-clean in the most recent stage-1 pass
    on this finding (the loop already tracks per-chunk tier-1
    cleanliness via `_summary.md` artefacts); AND
  - the current pass is in stage 2 or stage 3.
- The fixer refuses with NOTES line
  `RefusalMode: (e) stage-transition-structural-growth;
  chunk=<chunk-id>; markers=<list>`.
- New defer rationale in `agents/spec-diff-fix-classifier.md`:
  `defer-to-debt — stage-transition-structural-growth`. Used when
  the underlying lens finding is fix-class but the fixer's
  refusal blocks remediation. The classifier routes accordingly.
- New STATUS in `agents/spec-diff-fix-loop.md`:
  `must-fix-blocked-by-stage-transition` (category 2). Fires when
  the refusal blocks a `must-fix:true` finding and the classifier
  has no other viable remediation. The exit code tells the human
  that the finding's Solution approach needs widening to
  explicitly permit the scaffolding (or to pre-author it at
  top-level), which is finding-authoring work but with a
  category-2 reject reason rather than a category-1 one.

**Coverage:** T12 directly. Generalises to any finding whose
Solution approach asks for an inline normative obligation in a
multi-obligation prose bullet (the spec has ~12 such bullets;
`discovery.md` package-walk-bounds bullet is the type specimen).

**Files changed (pi-config):** `agents/spec-diff-fixer.md`,
`agents/spec-diff-fix-classifier.md`,
`agents/spec-diff-fix-loop.md`. ~40 lines total.

**Implementation scope:** small. The per-chunk tier-1 cleanliness
signal already exists in the loop's per-pass artefacts; the new
work is the regex check + a NOTES surface + a STATUS code.

### 6.3 Tier B — finding-authoring-layer empowerments

These move category-1 detection earlier in the cycle. They do
not extend the fixer; they extend the audit (rec L, rec M) or
the reducer (rec P) so malformations route to reshape before the
fixer dispatches.

**Rec L — Audit-side binding-surface ratification.**

The auditor walks each finding's binding surfaces (per §5.3)
and flags malformations the fixer would otherwise hit only at
fix time. Four ratification checks, each scoped to a specific
binding surface; the audit triggers on the **Problem** /
**constraints** / **relationships**, not on Solution approach:

- **Problem — cited rule absent from owner page** (T14-shape).
  For each Problem asserting that an owner page contains a
  specific rule or clause ("the closing rule lives in…", "the
  fourth premise of…"), the auditor opens the owner page and
  greps for the asserted rule verbatim or by close paraphrase.
  Absence downgrades to `RISK_HIGH` with rationale
  `problem-asserts-rule-absent-from-owner-page`; suggested
  reshape is drop the cited-rule clause OR retire the finding
  if the structural case is already discharged.
- **Problem — propagated undefined token** (T13-shape). For
  each Problem whose remediation introduces or re-uses a
  qualifier-grade token (`cross-file`, `task-mode-internal`,
  etc.), the auditor greps `docs/` for a defining occurrence.
  Absent definition downgrades with rationale
  `problem-propagates-undefined-token`; suggested reshape is a
  `must-precede` defining-finding split (one finding owns the
  definition, this one consumes it).
- **Constraints — all remediation sites fenced** (T16a-shape).
  For each Problem describing a structural change (reduction,
  split, anchor-introduction, literal-drop) whose surviving
  prose carries orphan premises or unresolved obligations, the
  auditor enumerates the prose surfaces those premises could
  honestly land on; if Solution constraints fence every such
  surface, downgrade with rationale
  `constraints-fence-all-remediation-sites`; suggested reshape
  is loosen-the-fencing-constraint OR atomise-the-reduction OR
  raise-the-score so the residue fits.
- **Missing prerequisite finding — cited owner internally
  contradictory** (T16b-shape). For each Problem citing an
  owner section as authoritative on a dimension, the auditor
  scans the cited section for internal contradictions on that
  dimension; if found and no `must-precede` edge points to a
  finding that resolves the contradiction, downgrade with
  rationale `cited-owner-contradictory-no-prerequisite-finding`;
  suggested reshape is author-the-prerequisite-finding plus
  add the `must-precede` edge.

All four rationales route to `HUMAN_REVIEW` or `AUTO_RESHAPE`
depending on whether the auditor's confidence permits a
deterministic reshape (e.g. for `problem-asserts-rule-absent`,
drop the cited-rule clause from the Problem; for
`problem-propagates-undefined-token`, suggest the `must-precede`
split). None of the checks rewrite the finding themselves; they
route it to the finding-authoring layer.

**Coverage:** T13, T14, T16a, T16b at audit time (4 of 6
category-1 parks). The reshape that resolves each finding is
authored by the human/auto-reshaper, not by the audit; the
audit's role is to route the finding there before it dispatches.

**Note on framing change:** earlier revisions of this rec scoped
the ratification around the **Solution approach's** forward-link
target. Under the tightened §5.3 taxonomy approach is not a
binding surface, so the checks are re-scoped to walk the actual
binding surfaces (Problem / constraints / missing-prerequisite).
The detection mechanics are largely the same — open cited files,
grep for asserted content, walk relationships — but the trigger
surface and the rationale labels change.

**Files changed (pi-config):** the auditor prompt (whichever
file in `agents/` or `prompts/` owns per-finding lens dispatch).
~40–60 lines for the four rationales + worked examples; one to
two extra reads per audited finding (cheap; the auditor already
opens the spec for context).

**Rec M — Pre-dispatch precondition staleness check.**

For each finding whose Solution constraints contain an ordering
prediction (lexical signals: \"MUST have already landed\",
\"bottom-up ordering guarantees\", \"lands first / last\", explicit
heading references), the orchestrator re-walks the
`spec-review.md` ordering at dispatch time and flags any mismatch
with the constraint's textual prediction. Flag emits a
`STALE_PRECONDITION` verdict that downgrades to `HUMAN_REVIEW`.

**Coverage:** T15a. The current fixer pre-flight already catches
this at the next layer (`top-level-refused` exit); rec M moves
the catch to dispatch time so the orchestrator can skip the
dispatch entirely.

**Files changed (pi-config):**
`prompts/fix-spec-shape-single-findings.md` pre-dispatch step.
~20 lines.

**Rec P — Reducer surfaces decision axes as Problem metadata for
score-vs-residue audit.**

T18a's category-1 malformation is on the **score** binding
surface: the Problem implicitly requires committing on 3
orthogonal axes, each generating ≥1 medium-importance lens
follow-up, and the medium-tier S=25 cannot absorb the residue.
The defect is detectable at the reducer layer
(`agents/spec-review-finding-reducer.md`) because the axes are
visible in the **Problem** text via lexical signals (the Problem
enumerates what the paragraph must commit on without pre-deciding
the positions; modal verbs like \"name\", \"address\",
\"describe\" applied to ≥2 orthogonal dimensions of the same
artefact).

The reducer detects axis-enumeration on ≥2 axes and adds a
`**Decision axes:** <count>` Problem-metadata field. The auditor
then runs a score-vs-residue check: each axis predicts ≥1
expected lens follow-up of importance ≥medium; if axis-count
times typical-follow-up-importance exceeds score-budget headroom,
downgrade to `RISK_HIGH` with rationale
`score-insufficient-for-axis-residue`. Reshape suggestions: raise
the score, split into per-axis atoms whose individual scores each
admit one residue, OR pin the axes in the Problem (which reduces
the lens-arming surface in the first place).

**Coverage:** T18a directly. Partial on any future finding whose
Problem under-specifies positions across multiple axes.

**Note on framing change:** earlier revisions of this rec located
the axes-metadata on the Solution approach. Under the tightened
§5.3 taxonomy approach is not a binding surface, so the metadata
attaches to the Problem (binding) and feeds a score-surface audit.
The detection mechanics are the same; the field's home moves from
approach to Problem.

**Files changed (pi-config):**
`agents/spec-review-finding-reducer.md`, the auditor.
~30 lines.

### 6.4 Tier C — pipeline rejection-signal hygiene

**Rec W — Distinguish reject categories in pipeline status codes.**

Today the pipeline emits a flat set of exit codes
(`top-level-refused`, `must-fix-blocked-by-scope-guard`,
`must-fix-blocked / score-budget-exhausted`, `diverging`,
`limit-cycle`, `surface-expansion-irrecoverable`) that conflate
the two reject categories. A reader of a park commit or forensic
report cannot immediately tell whether the response is \"reshape
the finding\" (category 1) or \"file a pi-config issue to extend
the fixer\" (category 2).

Re-tag every exit code with its category:

| Exit code | Category | Reason |
|---|---|---|
| `top-level-refused` | (1) or (2) | Currently fires for both fixer-pre-flight (category 1: stale precondition, missing destination subsection) and \"the work is too big to start\" (category 2). Split into `top-level-refused-malformed` and `top-level-refused-capacity`. |
| `must-fix-blocked-by-scope-guard` | (1) | The constraint forbids the only remediation the lens admits; the constraint is the malformation. |
| `must-fix-blocked / score-budget-exhausted` | (1) | Solution approach scope exceeds origin score; reshape or raise score; the score is the malformation. |
| `diverging` | (2) | The fixer's iteration cannot converge on a well-formed finding. Category 2. |
| `limit-cycle` | (2) | Same; the loop oscillates between two states the fixer cannot resolve. |
| `surface-expansion-irrecoverable` | (2) | The fixer's per-pass edits keep expanding the defect surface; capacity gap in the fixer's narrowing mechanism. |
| `must-fix-blocked-by-stage-transition` (new from rec T) | (2) | Fixer correctly refused mid-loop scaffolding; the Solution approach needs widening to permit it. Category 2 because the fixer is signalling its capability boundary. |

Park commit messages and forensic-report TL;DR blocks gain a
`Category:` field. Category 1 messages carry the reshape
recommendation; category 2 messages carry a pi-config-issue
template. The pi-loom maintainer reading a park commit reaches
for `spec-review.md` (reshape) for category 1 and for pi-config's
issue tracker for category 2.

**Coverage:** all parks. Improves human throughput; doesn't
change which findings park or resolve.

**Files changed (pi-config):** `agents/spec-diff-fix-loop.md`,
`agents/spec-diff-fix-classifier.md`,
`agents/spec-fix-failure-forensics.md`,
`agents/spec-review-parker.md`,
`prompts/fix-spec-shape-single-findings.md`. ~50 lines spread
across the exit-code emission sites.

**Rec O — Trust-override should not suppress score-budget exit when breach is large.**

T16a's pass 1 raised Σ=125 against S=25 (5× breach). The
trust-override pre-empted the score-budget exit on every fix
selection, and the loop ran 4 more passes before divergence
detection fired. The score-budget mechanism is the canonical
category-1 exit for \"the originating finding does not have score
room to absorb the defects its remediation introduces\"; the
divergence exit is the category-2 fallback for \"the fixer cannot
converge.\" Letting trust-override suppress the score-budget exit
mis-routes a category-1 reject as a category-2 reject.

Modify the precedence rule: if Σ > k×S for some k (recommended
k=3), the score-budget exit fires regardless of trust-override
status. The trust-override remains active for individual finding
classifications (it still keeps trust-significant fixes from
being deferred); only the pass-level exit decision changes.

**Coverage:** improves reject signal on T16a-shaped findings.
Reduces wasted passes (T16a burned 5 where a 1-pass score-budget
exit was the right diagnosis).

**Files changed (pi-config):**
`agents/spec-diff-fix-classifier.md` precedence rule. ~10 lines.

### 6.5 Tier D — known pipeline bugs (orthogonal to the taxonomy)

**Rec K — Cluster-importance aggregation (SHIPPED).**

Pi-config commit 344da26 (2026-05-17). Closes the rec-F
integration bug surfaced in the W2 T19 cluster dispatch.
Cluster's effective S rises to `max(member S)`; the Σ=60 breach
that parked the cluster no longer fires. T19 cluster unparked
in pi-loom (commit e12ccf9) and queued for re-dispatch.

### 6.6 Tier E — finding-authoring work (pi-loom)

Six per-finding reshapes plus one new spec-review entry. Each
forensic report at
`.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/`
includes a `### Immediate (this finding)` subsection with the
specific reshape recommendation; the table below summarises:

| Finding | Reshape action | Per-forensic-report reference |
|---|---|---|
| T13 | Split into a defining-finding (own `cross-file` in the *countable-frame* paragraph or `glossary.md`) + the propagation finding, with `must-precede` ordering. | RI-1 of T13 forensic |
| T14 | Retire (case already discharged structurally by *Transcript and tool-table isolation* + supports-list scoping) OR reframe as no-window observation. | RI-1 / RI-2 of T14 forensic |
| T15a | Rewrite constraint #3 as a content-level check: \"if `Concurrency model` subsection is absent in `spec.md`, defer.\" Drop the structural ordering prediction. | RI-2 of T15a forensic |
| T16a | Loosen the constraint that fences the surviving Trust-boundary prose so orphan premises can re-source there, OR raise score to admit the residue, OR split into delete-literal + source-the-premises atoms whose individual constraints each admit the atom's remediation. | RI-1 / RI-2 of T16a forensic |
| T16b | Author the prerequisite finding (PIC step 2 internal contradiction at L213: literal `pi.setActiveTools([...snapshot, ...names])` vs "exactly the loom's declared callable set") and add `must-precede` edge into T16b; T16b's Problem then lands cleanly against a non-contradictory owner. Mechanism-only delegation (no inline effect prose) is the natural Problem shape once the owner is consistent. | RI-1 of T16b forensic |
| T18a | Pin the 3 axes (caller-observation-surface taxonomy; quantifier domain; pre-evaluation behaviour) OR split into per-axis atoms OR raise score to admit the residue. | RI-1 of T18a forensic |
| **New** | Author a new spec-review entry: \"PIC step 2 internal contradiction: literal `pi.setActiveTools([...snapshot, ...names])` call shape vs natural-language 'exactly the loom's declared callable set'.\" Add `must-precede` edge from T16b. | RI-2 of T16b forensic |

Cascade-parked findings (T15b, T18b/c/d) re-dispatch when their
upstream lands; no per-cascade reshape.

### 6.7 Summary table

| Rec | Tier | Title | Coverage | pi-loom | pi-config |
|---|---|---|:-:|:-:|:-:|
| **V** | **S** | **Solution constraints as advisory (mirror of rec J on constraints surface; three-mode authoring guard per constraint sweep)** | **T15a + T16a (cures); T14 + T19 cluster + T22a1 cross-finding cases (three-mode guard refuses safely, no boundary violation); T13 partial; T22a1 const #1 + T20 SG1 deferred to rec L** | | **✓ (SHIPPED — pi-config 8f0ccfe; pending validation, pi-loom 90968cf unparked canary set)** |
| **T** | **A** | **Stage-transition structural-growth refusal** | **T12 (1/7 parks)** | | **✓** |
| **L** | **B** | **Audit-side binding-surface ratification (Problem / constraints / missing-prerequisite)** | **T13/T14/T16a/T16b (4/7 parks)** | | **✓** |
| M | B | Pre-dispatch precondition staleness | T15a (1/7 parks) | | ✓ |
| P | B | Decision-axes Problem-metadata + score-vs-residue audit | T18a (1/7 parks) | | ✓ |
| W | C | Reject-category exit-code tagging | all parks (signal) | | ✓ |
| O | C | Trust-override / score-budget precedence | T16a-shape (signal) | | ✓ |
| K | D | Cluster-importance aggregation | T19 cluster | | ✓ (SHIPPED) |
| Tier E | E | Six per-finding reshapes + one new PIC-L213 finding | 6 parks + 1 prerequisite | ✓ | |

### 6.8 Priority order

Ranked per user direction (fixer-pipeline changes first; audit-
layer work postponed until rec V validation):

**Tier 1 — ship now (architectural + fixer-pipeline):**

1. **Rec V** (pi-config) — Solution constraints as advisory.
   **SHIPPED 2026-05-18 as pi-config commit 8f0ccfe (1240
   insertions / 130 deletions across 7 files). Pending
   validation:** pi-loom commit 90968cf unparked the canary
   set (T14 + T15b + T15a + T16a; T19 cluster already
   unparked at e12ccf9). Next: run
   `/fix-spec-shape-single-findings` from the pi-loom repo
   and observe the staged canary outcomes per step 10 below.
   The dispatch order under bottom-up is T15b → T15a → T16a
   → T14 → T19 cluster; T15a is the staleness-bypass test,
   T16a is the over-fencing-narrowing test, T14 is the
   `(f-stop-1)` canary, the T19 cluster is the `(f-stop-2)`
   heaviest canary.
2. **Rec T** (pi-config) — stage-transition refusal. Closes the
   one category-2 capability gap (T12). Can ship alongside or
   shortly after rec V.
3. **Tier E reshapes** (pi-loom) — the per-finding reshapes
   for the parks rec V does **not** cure (T13, T14, T16b,
   T18a, plus T15a and T16a as optional clarity work).
   Re-evaluate the list after rec V re-dispatch resolves
   which findings still need authoring work.

**Tier 2 — ship to clean up routing and signal:**

4. **Rec W** (pi-config) — reject-category exit-code tagging.
   Makes every future park commit readable in one line.
   Update the exit-code table for rec V's retirement of
   `must-fix-blocked-by-scope-guard`.
5. **Rec M** (pi-config) — pre-dispatch precondition staleness.
   May be subsumed by rec V's stale-prediction detection in the
   fixer; re-evaluate after rec V ships.
6. **Rec O** (pi-config) — trust-override / score-budget
   precedence. Improves reject signal on T16a-shape findings.

**Tier 3 — postponed (audit layer):**

7. **Rec L** (pi-config) — audit-side binding-surface
   ratification. Postponed per user direction until rec V
   validation completes (or until the fixer pipeline looks
   improvement-saturated). Until then, rec V's authoring guard
   absorbs rec L's T14-shape coverage at the fixer layer.
8. **Rec P** (pi-config) — reducer surfaces decision axes.
   Postponed alongside rec L (same audit/reducer layer).

**Tier 4 — process:**

9. **Re-dispatch T19 cluster after rec K** (pi-loom) — already
   queued (unpark commit e12ccf9 sits ahead of the next
   dispatch). Under rec V this re-dispatch doubles as the
   step-4 validation canary for the cluster's `(f-stop-2)`
   coverage — see step 10.
10. **Validate rec V — staged re-dispatch** (pi-loom).
    **Canary set unparked 2026-05-18 as pi-loom commit
    90968cf** (T14 + T15b + T15a + T16a re-introduced to
    `spec-review.md`; T19 cluster already unparked at
    `e12ccf9`). The unpark file ordering produces the
    dispatch order below under bottom-up walk. Per the
    revised validation plan in §6.1, observe outcomes in
    this order so a failure at any step does not contaminate
    the later steps' evidence:
    - **Step 1:** T15a (cures baseline). Dispatched second
      after T15b lands the Concurrency model subsection;
      rec V's staleness pre-check finds constraint #3's
      structural-ordering prediction satisfied and the
      fixer proceeds.
    - **Step 2:** T16a (cures baseline). Dispatched third;
      rec V's over-fencing detection narrows the constraint
      fencing the orphan-premise re-sourcing site.
    - **Step 3:** T14 — `(f-stop-1)` canary (Problem-
      anticipation). Dispatched fourth; expected to
      guard-refuse safely and re-park under the new
      `must-fix-blocked-constraint-narrowing-refused`
      STATUS code.
    - **Step 4:** T19 cluster T19a/b/d/e — `(f-stop-2)`
      canary (co-resolve recognition). **Heaviest canary;**
      T19b is the load-bearing single test (W2 forensic
      names the exact boundary violation the guard must
      prevent).
    - **Step 5:** T22a1 if re-dispatched — additional
      `(f-stop-2)` evidence + expected const-#1 lens-finding
      surface (rec L territory).
    Failure at any canary triggers either hardening that mode
    or shipping rec L earlier than planned, before rec V's
    reach extends to additional findings.

    **Note on T15b dispatch (preceding step 1).** T15b is not
    a rec V canary — it's an independent placement edit that
    was cascade-parked from T14. It dispatches first under
    bottom-up because T15a's Solution approach forward-links
    the Concurrency model subsection T15b creates. T15b
    landing first is what makes T15a's staleness bypass valid
    (the constraint's prediction "T15b at second-highest
    line, addressed second" is satisfied once T15b lands).
    A failure on T15b is unexpected and would not invalidate
    rec V validation — it would be a separate finding-shape
    issue.

**Withdrawn (architectural-cut casualties):**

- **Rec S** (fixer-emitted followup findings) — violates the
  fixer-is-mechanism-not-author boundary. A fixer that emits new
  findings is authoring; that's the finding-authoring layer's
  job. Routing category-1 rejects via audit (rec L) and
  category-2 rejects via clearer exit codes (rec W) achieves the
  same outcome without crossing the boundary.
- **Rec U** (constraint-narrowing license) — **superseded by
  rec V** (§6.1). Under rec V's SP-level change, constraints
  become advisory, so the original boundary objection ("the
  fixer must not rewrite binding constraints") no longer
  applies — there is nothing binding to rewrite. Rec V revives
  the narrowing mechanic and adds the authoring-guard refusal
  mode (`constraint-narrowing-would-author`) that the original
  rec U lacked; the guard is what prevents the narrowing path
  from collapsing into fixer-as-author for cases like T14.
  Withdrawal entry retained here for traceability.
- **Rec N** (classifier-side stage-transition guard) — subsumed
  by rec T, which is the same idea correctly located in the
  fixer (where capability extensions belong) rather than the
  classifier.
- **Rec Q** (SP-2 deferred-must-fix surfacing in NOTES) —
  subsumed by rec W's category-2 exit-code tagging.

**Single-line summary:** ship **rec V** (constraints as advisory)
as the headline pi-config change, validate against the W2 parked
set (T14 is the canary), pair with **rec T** for the one
category-2 capability gap, and trim the pi-loom Tier E reshape
list to whatever rec V does not cure. Audit-layer work (rec L,
rec P) is postponed until rec V validation completes. Rec K has
already shipped.

## 7. What NOT to recommend

- **The fixer must not author findings.** Rec S ("fixer-emitted
  followup findings") and rec U ("constraint-narrowing license")
  were considered and withdrawn. Both would let the fixer cross
  the boundary into finding-authoring: rec S by emitting new
  spec-review entries when lens evidence points at corpus-state
  defects; rec U by treating Solution constraints as advisory
  the way rec J treats Solution approach. Either move converts
  the fixer from a mechanism into an author. The right routing
  for category-1 rejects is the audit layer (rec L); the right
  routing for category-2 capability gaps is targeted fixer
  extensions (rec T). Both routes preserve the
  fixer-is-not-author boundary; rec S and rec U do not.
- **The fixer must not widen edit surface beyond what the
  finding names.** When lens evidence indicates the right
  resolution requires editing outside the finding's named
  scope, the fixer's correct response is to reject (category 1
  if the constraint is malformed; category 2 if the fixer
  genuinely cannot execute). Letting the fixer expand scope
  silently makes pipeline behaviour non-reproducible and gives
  the fixer authoring authority through the back door.
- **The audit layer must not become a substitute for the
  finding-authoring layer.** Rec L, M, P move category-1
  detection earlier in the cycle. They do not author the
  reshape themselves — a human (or a constrained
  auto-reshaper) does that. An audit pass that silently
  rewrites findings has the same boundary-crossing problem as
  rec S.
- **Loosening any lens.** Across all 8 W2 parks (the cluster
  report plus the 7 single-finding reports), the lens findings
  are real defects against the imagined or actual post-fix text.
  The MULTI cluster's AF1/AF4/AF6 / SP-2-deferred AF2 are all
  genuine; T12's pass-7 atomicity / two-anchor / inline Non-goals
  findings are all genuine; T16b's 11 false-negative pass-9
  findings were all cross-verified against the actual file
  contents. Loosening would admit real defects on unrelated
  future findings.
- **Reverting rec J or rec F.** Rec J's mechanism is doing the
  work the prior meta-analysis predicted on the cases that fit
  its frame (T21, T22a1 + cascade). Rec F's mechanism is
  structurally correct (one cluster → one stable post-edit state;
  one forensic report sized to the unit of work; clean MULTI
  dispatch + parking semantics). The lone rec-F integration
  bug has shipped a fix as rec K.
- **Raising the score-budget threshold or the `k` multiplier
  globally.** Each budget-counted finding is a real defect; the
  W2 budget exits are correctly fingering Solution approaches
  whose scope exceeds the originating finding's score. The
  category-1 response is reshape (raise score, split, narrow
  approach), not raise the global threshold.
- **Raising the 17-pass cap.** T16b burned 9 of 17 passes on
  structurally-irreconcilable cross-section contradictions; T12
  burned 7 of 17 on stage-2 structural growth; neither is
  pass-count-bound. The remaining capacity would have made the
  failures more expensive without changing the outcome.
- **Re-dispatching parked findings as-authored.** The 7
  newly-dispatched parks each carry an explicit per-finding
  reshape recommendation in `### Immediate (this finding)`.
  Re-dispatching without the reshape reproduces the same
  failure.
- **Reverting the unparks (`037f8a3`, `fb771f3`).** The W2
  outcomes are net-positive on the W1 set (5 of 6 resolved or
  under unit-of-work rec-F treatment; rec K has now shipped to
  unblock the cluster). The unparks were the right move.

## 8. What this analysis adds over the prior meta-analysis

The prior meta-analysis (`52eae47`) made three load-bearing
predictions and ranked recommendations under their assumed
coverage. W2 evidence revises two of the three and confirms one.
A fourth revision (the architectural cut in §5.3) reframes the
recommendation set entirely.

- **Confirmed.** Rec J's mechanism converges the failures whose
  Solution approach was the binding/directional gap (T21,
  T22a1 + cascade). The prior priority order with J at #1 was
  correct on the W1 cases that fit the frame.
- **Revised — coverage overcount.** The prior analysis credited
  rec J with 5/6 W1 failures (T19a, T19b, T19e, T21, T22a1).
  Under rec F's MULTI dispatch the 4-member T19 cluster is now
  one unit of work, not four; rec J's narrowing fires correctly
  inside it but the rec-F integration introduced a budget bug
  (now fixed by rec K) that ate the cluster's first dispatch.
  Realised W1 coverage under W2: 2 of 6 named (T21, T22a1) +
  3 cascade (T22b/T22c/T15c); the remaining 4 land on the next
  T19-cluster dispatch under rec K.
- **Revised — audit-side framing.** The prior analysis ranked
  audit-side recommendations as "diagnostic-only" on the
  argument that they "do not change the finding's text or the
  pipeline's ability to satisfy it." That framing held for the
  W1 set (inside-loop failures); it does not hold for the W2
  newly-dispatched batch. Audit improvements **do** change which
  findings dispatch and which route to reshape; they are
  category-1-routing empowerments at the finding-authoring layer.
  Not "diagnostic-only"; not "fix-rate-positive on the loop"
  either; **category-1 routing.**
- **New — the fixer/finding architectural cut (§5.3).** The W2
  newly-dispatched batch made this cut unavoidable. Earlier
  framings (including the first revision of this document)
  conflated "the pipeline couldn't fix this" with "the fixer
  needs more power." Under the cut, the fixer is a mechanism
  with two valid reject categories (malformed finding;
  fixer too-hard). Six of seven W2 parks are category-1
  (malformed) and one is category-2 (too-hard). Rec S and
  rec U — both seriously considered in earlier revisions —
  violate the cut and are withdrawn.

Failure shapes now visible in pure form that the W1 forensic
set hinted at but did not exhibit:

- **Problem asserts rule absent from owner page** (T14).
  Category-1 malformation on the **Problem** surface. Routed
  by rec L.
- **Problem propagates undefined token** (T13). Category-1
  malformation on the **Problem** surface (alternatively framed
  as a missing prerequisite defining-finding). Routed by rec L.
- **Constraints fence all remediation sites** (T16a).
  Category-1 malformation on the **constraints** surface: the
  Problem's reduction leaves orphan premises that have no
  honest landing site within the constraints. Routed by rec L.
- **Cited owner internally contradictory, no prerequisite
  finding** (T16b). Category-1 malformation on the **missing
  prerequisite finding** surface. Routed by rec L.
- **Stale precondition encoding in constraint** (T15a).
  Category-1 malformation on the **constraints** surface
  (constraint encodes a structural ordering prediction). Routed
  by rec M.
- **Score insufficient for Problem's residue** (T18a).
  Category-1 malformation on the **score** surface (the Problem
  implicitly requires committing on ≥2 axes whose combined
  residue exceeds the budget). Routed by rec P, which adds the
  Problem-metadata field that lets the audit's score-vs-residue
  check fire pre-dispatch.
- **Stage-transition structural-growth divergence** (T12).
  Category-2 capability gap. The only one. Addressed by rec T.
- **Trust-override suppresses score-budget signals** (T16a).
  Reject-signal hygiene; mis-routes a category-1 reject as a
  category-2 reject. Addressed by rec O.

The prior meta-analysis's `## What NOT to recommend` section
remains correct line-by-line on the W2 evidence and is
re-affirmed in §7 above, with two new prohibitions added: the
fixer-is-not-author boundary (rec S / rec U class) and the
edit-surface-widening prohibition. Both are direct consequences
of the §5.3 architectural cut.

## Appendix — file and artifact references

W2 forensic reports (gitignored):

- `.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/`
  - `multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md`
    (483 lines, MULTI cluster, must-fix-blocked / score-budget-
    exhausted at pre-pass exit)
  - `t12-dual-cap-simultaneous-breach-cap-value-in-loom-load-discovery-slow-diagnosti.md`
    (134 lines, diverging at pass 7)
  - `t13-invocation-depth-bound-introductory-sentence-omits-the-cross-file-qualifier-.md`
    (451 lines, must-fix-blocked-by-scope-guard at stage 3)
  - `t14-prompt-mode-sequentiality-argument-has-an-unstated-fourth-premise.md`
    (133 lines, must-fix-blocked-by-scope-guard at pass 3)
  - `t15a-reduce-session-model-orientation-paragraph-to-a-four-sentence-forward-linki.md`
    (286 lines, top-level-refused)
  - `t16a-reduce-trust-boundary-sdk-surface-clause-drop-the-0-72-1-literal.md`
    (342 lines, diverging at pass 5)
  - `t16b-rewrite-callable-set-paragraph-drop-inline-customtools-createagentsession-p.md`
    (136 lines, diverging at pass 9 — short report because the
    long forensic detail is in the per-pass artefacts)
  - `t18a-append-success-side-null-policy-paragraph-to-pic-runtime-event-channel.md`
    (411 lines, must-fix-blocked / score-budget-exhausted at
    rewound pass-1)
- `.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-38-15_cb7511/`
  (empty directory; the run-1 dispatch produced no failure
  reports — either converged on what it processed or was
  aborted before any forensic writer fired)

pi-config commits (git-pinned via global settings under
`git:github.com/bitmonk8/pi-config`, cloned to
`~/.pi/agent/git/github.com/bitmonk8/pi-config/`):

- `dd974d9` SP-2 rec J — Solution approach is directional, not
  binding. 702 insertions / 71 deletions across 6 files.
- `f10e3c1` rec F — `Shape: multiple` cluster resolution mode.
  774 insertions / 148 deletions across 7 files.

pi-loom commits in the W2 timeline (chronological):

- `037f8a3` (2026-05-17) — unpark T19a/b/d/e as rec-F cluster.
- `fb771f3` (2026-05-17) — unpark T21 + T22a1 (with cascade
  T22b/T22c/T15c).
- `7a62ed3` + `b900624` (2026-05-17) — strip stale spec-review
  preamble lines (triage tally / decision tally / reshape pass /
  split annotations).
- `bb4f8d4` → `8c930fe` → `068cb27` → `262cce2` → `e89e42e`
  (2026-05-17) — resolve T15c, T22c, T22b, T22a1, T21
  (rec J success path).
- `c72a2a1` → `8d2078f` (2026-05-17) — resolve T16d, T16c
  (newly-dispatched batch wins).
- `4538b7c` (2026-05-17) — resolve T20 (newly-dispatched).
- `6a3e78d` (2026-05-17) — park T19 cluster (4 members).
- `8ca1f06` (2026-05-17) — park T18a (+3 cascade T18b/c/d).
- `9c0f97c` → `02965b2` (2026-05-17) — park T16b, T16a.
- `87ca647` (2026-05-17) — park T15a (+1 cascade T15b).
- `b357201` (2026-05-17) — park T14.
- `cf3fb0f` (2026-05-17) — park T13.
- `d0723ec` (2026-05-18) — park T12.

Live state references (HEAD):

- `docs/spec-review.md` — 19 H1s remaining (T02, T03a–f, T05–T11
  family, T08a–c, T09–T10, T11a–c).
- `docs/spec-review-parked.md` — 16 H1s parked (4-member T19
  cluster + T18a/T18b/c/d + T16a/b + T15a/b + T14 + T13 + T12).

Pre-W2 forensic reports (gitignored, retained for context):

- `.pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/`
  (W1 re-attempt, 6 reports — the input set for the prior
  meta-analysis).
- `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/`
  and `.pi/tmp/spec-fix-failure-forensics/2026-05-15T15-04-05_7wkalj/`
  (pre-W1 reports).

Prior meta-analysis: `52eae47:docs/spec-review-forensic-meta-analysis.md`
(the predecessor of this document; recoverable via `git show
52eae47:docs/spec-review-forensic-meta-analysis.md`).

End of meta-analysis.
