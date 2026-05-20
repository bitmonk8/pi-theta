# Meta-analysis — spec fix-loop forensic state

```
PROJECT: pi-loom
SCOPE: current state of the spec fix-loop pipeline after the
       most recent /fix-spec-shape-single-findings runs against
       the post-reshape, post-rec-L/P/Z/AA pi-config; what works
       now, what doesn't, what to do next.
INPUT: 7 forensic reports across the two most recent dispatch
       runs under .pi/tmp/spec-fix-failure-forensics/:
         - 2026-05-19T10-47-33_8360aa/ (5 reports: T03e, T13b,
           T15a, T16b, T18c)
         - 2026-05-19T17-23-50_9cbe86/ (2 reports: T05, T06)
       + docs/spec-review.md and docs/spec-review-parked.md at HEAD
       + pi-config at HEAD (cloned to
         ~/.pi/agent/git/github.com/bitmonk8/pi-config/)
       + pi-loom commits spanning 2026-05-19 → 2026-05-20

HEADLINE: The shipped pipeline cures well-shaped single-finding
          cases reliably; recent successes include T11a, T11b,
          T11c, T18d, T09, T03c, T03f, V6k. The shipped audit-
          and fixer-side recs (L, P, Z, AA) each closed the
          shape they were authored against (see §1).

          The bottleneck has migrated. The dominant umbrella
          pattern is **the inner spec-diff-fix-loop runs
          unground**: the top-level fixer removes the finding's
          H1 from `spec-review.md` as part of authoring its
          initial edit; the inner classifier and inner fixer
          both run against the resulting diff with no access to
          the originating Problem, Solution approach, Solution
          constraints, or Relationships block.

          On the classifier side this surfaces as the
          heading-absent metadata default: `Importance: medium
          / S=25 / mustFix=false`, regardless of what the
          finding actually authored. Rec O's k×S=75 gate fires
          on residue the originating score (typically high /
          S=100) would have absorbed. Six of the seven recent
          parks hit this exact path.

          On the fixer side it surfaces as **drift** — the
          inner fixer treats the raised lens findings as the
          goal and gradually navigates away from solving the
          originating Problem. T05 pass-2 invents a new
          normative running-prose spelling rule that
          contradicts ~10 pre-existing corpus sites. T16b
          pass-4 narrowing reverts pass-1's high-severity
          consistency fix because the loop cannot tell that
          the fix was load-bearing for the originating
          Problem. T18c pass-2 introduces a cross-page
          contract contradiction satisfying a clarity lens
          complaint. In every case the originating finding's
          Solution approach would have constrained the
          decision — but the fixer could not see it.

          The prior analysis deferred a pipeline-side fix on
          the assumption that manual metadata restoration
          would suffice; the evidence shows manual
          restoration only survives the first dispatch and
          addresses only the classifier-side facet.

          Three new failure shapes also dominate the park set:

          1. **Dispatch-ordering violation (3 of 7 parks).**
             The orchestrator picked T13b before T13a, T16b
             before T16e, T18c before T18a — in every case the
             picked finding's own `## Relationships` block
             declares a `must-follow` edge on a sibling that is
             still live in `spec-review.md`. Splitting findings
             into prerequisite-bearing pairs (the prior round's
             §4.5 reshape strategy for T13/T16b) is correct in
             shape but unsafe without dispatch-side enforcement.

          2. **Scope-guard vs raised-severity collision (4 of
             7 parks; new dominant exit sub-rationale).** The
             top-level fixer forwards class-1 and class-2 scope
             guards to the inner loop; pass-1 lenses raise a
             finding whose only viable remediation violates one
             of the guards; the loop exits
             `must-fix-blocked-by-scope-guard`. This is the
             expected behaviour for malformed findings, but two
             contributing factors make the exit fire on findings
             that are not malformed: the score is defaulted to
             S=25 (cause 1 above) so trust-override cannot
             absorb the raised finding, and the auditor's lens
             predictions did not enumerate the obligations the
             fixer would actually have to author.

          3. **In-loop approach-narrowing reverts good pass-1
             fixes (T16b).** When a stage-3 lens proposes an
             edit that the inner fixer's mode (d) refuses, the
             loop's approach-narrowing on the affected chunk
             reverts the chunk to `baseline-post-top-level` —
             undoing high-severity pass-1 fixes that were
             unrelated to the stage-3 prose defect. The next
             pass then re-discovers the high-severity defect as
             fresh residue.

          Two further shapes contribute: an audit-vs-actual
          obligation-count gap (the auditor predicts PASS on
          every spec-content lens while the inner loop generates
          ≥5 lens obligations per pass), and a pass-2 over-
          correction pattern where the fixer responds to a
          consistency complaint by inventing a new normative
          rule that itself contradicts the pre-existing corpus.

PRIMARY WORK (priority order):
  1. Rec BB — orchestrator persists an origin grounding
     artefact under `.pi/tmp/spec-fix-loop/<RUN_ID>/_origin/`
     before the top-level fixer strips the H1; the classifier
     consults it for origin metadata. (pi-config)
  2. Rec HH — inner fixer reads the same artefact every pass
     and grounds all fix decisions in the originating Problem
     (direction-of-travel, origin-mandate, constraint-respect
     checks; new refusal mode `(i) drift-from-origin`).
     Ships together with rec BB. (pi-config)
  3. Rec CC — orchestrator dispatch must enforce must-precede
     edges. (pi-config)
  4. Rec DD — auditor obligation-count vs score-budget
     pre-check. (pi-config)
  5. Rec EE — auditor distinguish "uses" from "defines" in
     assumptions-lens predictions. (pi-config)
  6. Rec FF — fixer mode (h) no-new-normative-claim guard,
     now grounded in the rec HH origin-mandate check rather
     than lexical pattern-matching. (pi-config)
  7. Rec GG — in-loop approach-narrowing preserves edits
     annotated `OriginAlignment: forward` (per rec HH),
     regardless of lens severity. (pi-config)
  8. Per-finding reshapes for the current park set, applied
     *after* recs BB + HH + CC land (most parks will not need
     reshape once the pipeline patches are in). (pi-loom)

GENERATED: 2026-05-20T08:00:00Z
           Document rewritten from a current-state perspective.
           Prior revisions are recoverable via git log of this
           file; the W1/W2/W3 chronology and the per-commit
           implementation ledger from the previous revision
           have been dropped as no longer load-bearing.

IMPLEMENTATION STATUS (as of 2026-05-20, post-implementation):
  All seven pi-config recommendations (BB, HH, CC, DD, EE, FF,
  GG) have shipped to pi-config main. The pi-loom side dedup of
  stale T18c × 2 / T18a × 2 parked H2 entries (§2.1) has shipped
  to pi-loom main. The §5.8 per-finding reshapes (T03e / T05 /
  T06 / T13b / T16b / T18c / T15a) are conditional on validation
  showing the pipeline patches do not close the case; none have
  been performed pre-validation per §5.8's own disposition.

  VALIDATION: The §2.1 park set (17 findings: 7 direct + 10
  cascade) has been unparked into `docs/spec-review.md` per the
  §5.9 validation queue's first bullet ("Re-dispatch the §2.1
  park set"). `docs/spec-review-parked.md` is now empty (preamble
  only); `docs/spec-review.md` carries the prior 5 active findings
  + the 17 unparked findings = 22 H1s. The next
  `/fix-spec-shape-single-findings` run validates BB+HH+CC end-
  to-end: rec CC's must-precede gate sequences the cascade
  prerequisites (T13a/T16e/T18a/T18b) before their downstreams
  (T13b/T16b/T18c); rec BB's artefact surfaces the true scores at
  the classifier; rec HH+GG keeps the fixer grounded so the T05 /
  T16b drift shapes do not recur.

  Per-rec status markers appear at each §5.x heading below.
  Pi-config commit SHAs for each rec are listed in the Appendix.
```

---

## 1. Outcome of the prior recommendations

The prior revision shipped four pi-config recs (L, P, Z, AA) on
top of the previously-landed pipeline (J, F, K, V, T, O, M, W)
and 11 per-finding reshapes in pi-loom plus one newly-authored
prerequisite finding (T16e). Each recommendation closed the
shape it was authored against. The current park set is
dominated by a different family of failure shapes.

### 1.1 Pi-config recommendations

| Rec | Worked against | Status |
|---|---|---|
| **L** — audit-side binding-surface ratification | T07 (cited rule + pinning-surface presupposition) | **Worked.** T07 unparked, resolved, still live in `spec-review.md` with the reshape constraint enumerating the three known `.message` pins. No regression. |
| **P** — decision-axes Problem-metadata + score-vs-residue audit | T15b, T06, T18a (multi-axis residue) | **Partially worked.** T15b unparked at S=100 and is currently active without re-park. T18a was unparked with `**Decision axes:** 3` and re-parked as a cascade of T18c (root cause is now the must-precede/heading-absent stack, not axes). T06 unparked at S=100 and re-parked because the heading-absent default re-asserted S=25 at the classifier — see §4.1 for the structural reason this happens regardless of `spec-review.md` metadata. |
| **Z** — split `surface-expansion-irrecoverable` CATEGORY by finding shape | T05, T09 mis-tagged Category 2 | **Worked.** Every park in the current set tags Category 1 correctly; CATEGORY routing is precise. |
| **AA** — stage-3 prose-quality oscillation detector | T09 (and T05's cycle component) | **Worked for T09.** T09 unparked with the forward-link branch + link-display-text constraint, resolved on dispatch, still live. T05 unparked and re-parked but the new park's sub-rationale is `score-budget-exhausted-trust-override-suppressed` from the heading-absent default, not a stage-3 cycle — rec AA's scope was correct; a different mechanism took over. |

### 1.2 Pi-loom finding work

11 reshapes + 1 new prerequisite finding (T16e) + the T19
cluster metadata restoration + the priority-4 reshape batch
(T13 split, T16b prereq, T15a constraint rewrite, T18a
axes pin).

Resolutions banked after the reshape work (now in spec history,
not in the park set): T02, T03c, T03f, T08a, T08b, T08c, T09,
T11a, T11b, T11c, T12, T14, T16a, T18d, V6k.

Re-parks (most of the remaining backlog): T03a's cluster
siblings T03b/T03d/T03e re-parked as a T03e-rooted chain; the
T19 cluster re-parked as cascades of T18c; T18a/T18b/T18c
re-parked together; T13b re-parked taking T13a with it as a
cascade; T16b re-parked taking T16e with it as a cascade;
T15a re-parked top-level-refused; T05 and T06 re-parked on the
heading-absent default.

**Lesson.** The reshape strategy was correct on shape (split
multi-axis findings, author missing prerequisites, restore
true metadata) but underestimated the heading-absent default's
recurrence rate. Manual metadata restoration only survives
the first dispatch — the top-level fixer strips the heading
again as part of its own resolution edit, and the next time
the inner loop runs against a related finding the default
re-asserts. The "address the gap by hand" stance from the
prior revision is disproven by the evidence; the pipeline-side
fix (rec BB below) is the right move now.

---

## 2. Current state

### 2.1 Parked findings (17 distinct findings / 12 dispatch units)

The complete park set as of HEAD, per the `**Reason:**` lines
in `docs/spec-review-parked.md`. (The file currently contains
two stale duplicate H2 entries — T18c and T18a each appear
twice from the same dispatch run; counts below de-duplicate.)

| Category | Distinct findings | Dispatch units | Findings |
|---|---:|---:|---|
| **Category 1** (malformed finding) | 7 | 6 | T03e, T18c, T15a, T16b, T13b, T05, T06 |
| **Category 2** (fixer too-hard) | 0 | 0 | — |
| **Cascade** (upstream-bound) | 10 | 6 | T03b, T03d (← T03e); T18a, T18b, T19a, T19b, T19d, T19e (← T18c); T16e (← T16b); T13a (← T13b) |
| **Total** | **17** | **12** | |

The active `docs/spec-review.md` holds 5 H1s: T11a, T03a, T10,
T07, T15b. Re-dispatching that set is the next outer-loop
batch. Of those five, three (T03a, T15b, T11a) are reshaped
descendants of prior parks now expected to survive (T11a
already cleared, but its sibling cluster T11b/T11c also cleared,
so this entry is the head-of-cluster artefact retained for
ordering); T07 cleared once already and is queued for a second
pass; T10 is the priority-1 reshape from the prior revision
not yet validated.

Cascade unparking will follow each upstream resolution
automatically; rec CC (§5.3) will prevent the must-precede
violations that drove three of the six direct parks.

### 2.2 Shipped pipeline mechanisms

These recs are in production and shape what every dispatch
will do. They are the substrate the §4 failure patterns and
the §5 recommendations layer on top of.

| Rec | What it does |
|---|---|
| **J** | Solution approach is directional, not binding. Fixer can narrow / redirect / ignore approach to fit the binding surfaces. Inner-fixer carries refusal mode `(d) approach-narrowing`. |
| **F** | `**Shape:** multiple` + `**State:** reduced` cluster dispatch mode. Picker walks `co-resolve` edges; fixer unions Problems/constraints; one forensic report per cluster. |
| **K** | Cluster-importance aggregation: cluster's S = max(member S). Heading-absent fallback defaults to medium / S=25. (This default is the root pathology described in §4.1; rec BB closes it.) |
| **V** | Solution constraints are advisory, not binding. Fifth narrowing check (over-fencing detection); inner-fixer refusal mode `(f)` with three authoring-guard sub-modes `(f-stop-1)` / `(f-stop-2)` / `(f-stop-3)`. |
| **T** | Stage-transition structural-growth refusal. Inner-fixer mode `(e)` fires on stage-2/3 fixes adding `<a id`, `> **`, `^### `, or `**Label.**` markers to chunks that were tier-1-clean in stage 1. |
| **O** | Pass-level shadow-budget gate (rule a-bis), k=3. Catches trust-override-masked monotone-rising score sums. Sub-rationale `score-budget-exhausted-trust-override-suppressed`. **This gate fires on six of the seven current parks; its strictness is what surfaces the §4.1 heading-absent pathology.** |
| **M** | Pre-dispatch precondition staleness check. Detects `MUST have already landed` / `bottom-up ordering guarantees` lexical patterns in constraints; parks pre-dispatch with `FailureMode: stale-precondition`. |
| **W** | CATEGORY field threaded across loop output, classifier `_blocked.md`, forensics TL;DR, parker reasons. After rec Z, tagging is precise. |
| **L** | Audit-side binding-surface ratification. Four rationales (problem-asserts-rule-absent-from-owner-page, problem-propagates-undefined-token, constraints-fence-all-remediation-sites, cited-owner-contradictory-no-prerequisite-finding) route to HUMAN_REVIEW or AUTO_RESHAPE. |
| **P** | Decision-axes Problem-metadata + score-vs-residue audit. `**Decision axes:** <count>` field; axis-count × typical-follow-up-importance vs score-budget headroom. |
| **Z** | `surface-expansion-irrecoverable` CATEGORY split into `-bimodal` (Category 1) and `-cycle` (Category 2) by LoopNotes discriminator strings. |
| **AA** | Stage-3 prose-quality oscillation detector. Inner-fixer mode `(g) stage3-naming-cycle` fires on prose-token replacement that re-introduces a variant seen in the last 3 passes for the same chunk on lenses `naming` / `clarity` / `cruft` / `testability`. |

### 2.3 Outer-dispatch outcomes (last two runs)

| Run | Cures (spec-edit commits) | Direct parks | Cascade parks |
|---|---|---|---|
| `2026-05-19T10-47-33_8360aa` (5 dispatches) | 0 | 5 (T03e, T13b, T15a, T16b, T18c) | 9 (T03b, T03d, T18a, T18b, T19a, T19b, T19d, T19e, T16e) |
| `2026-05-19T17-23-50_9cbe86` (2 dispatches) | 0 | 2 (T05, T06) | 0 |

Separately, individual outer-loop and inner-loop dispatches
through 2026-05-19 → 2026-05-20 produced 7+ cures (T02, T03c,
T03f, T09, T11b, T11c, T18d, V6k). Cure paths are healthy when
the originating finding is well-shaped and its score survives
to classifier time; failure paths cluster on the patterns in §4.

---

## 3. The fixer/finding architectural cut

The pipeline operates on a hard boundary: **fixer = mechanism;
finding-authoring layer = author**. The fixer reads a finding,
applies an edit that solves the Problem within the constraints,
or rejects. The fixer is not licensed to decide what the work
is — that is the finding-authoring layer's job (composed of
human review, the reducer, the auditor, and any auto-reshape
paths).

Under this cut, every rejection is exactly one of two
categories:

- **Category 1 — malformed finding.** The finding is wrong on
  at least one of its **binding surfaces**:
  - **Problem** — embeds a false claim about the corpus, omits
    engagement with corpus state the remediation depends on,
    propagates an undefined term, or assumes a prerequisite
    that does not exist.
  - **Score** — the budget cannot absorb the residue the
    Problem's work generates regardless of approach.
  - **Ordering edges** — stale, missing, or contradicted by a
    sibling that already resolved, OR a `must-follow` referent
    that has not resolved (the dispatcher-side mirror image, see
    §4.2).
  - **Missing prerequisite finding** — the corpus state the
    Problem assumes can only be established by a finding that
    does not yet exist in `spec-review.md`.

  Solution approach (rec J) and Solution constraints (rec V)
  are *advisory*. An approach- or constraint-level defect alone
  is never a Category 1 malformation; the fixer is licensed to
  narrow.

  The finding-authoring layer's response to a Category 1 reject
  is to delete, split, merge, reorder, reformulate the Problem,
  raise the score, repair the ordering edges, or author the
  missing prerequisite.

- **Category 2 — fixer too-hard.** The finding is well-formed
  on every binding surface but the fixer's current capability
  cannot execute the edit. The pi-config side responds by
  extending the fixer.

The auditor and reducer belong to the finding-authoring layer.
Their job is to catch Category 1 malformations *before*
dispatch. Audit improvements are not pipeline empowerments;
they route Category 1 rejects to reshape earlier in the cycle.

Three structural extensions to this cut surface from the
current park evidence:

- The **dispatcher** is part of the finding-authoring layer (it
  consumes `## Relationships` blocks). A dispatcher that picks
  a finding whose `must-follow` referent is unresolved
  *manufactures* a Category 1 malformation at dispatch time
  even when the picked finding is otherwise well-shaped. Rec CC
  (§5.3) closes this.
- **The inner spec-diff-fix-loop runs unground** — neither its
  classifier nor its fixer can see the originating finding
  after the top-level fixer strips the H1. Both components
  navigate purely against the lens-raised findings on the
  current diff, with no anchor in the originating Problem.
  Over enough passes the loop's working state drifts away from
  resolving the originating finding and toward minimising
  whatever lens defects the latest pass surfaced. Rec BB
  (§5.1) gives the classifier the missing grounding; rec HH
  (§5.2) gives the fixer the same grounding and the
  behavioural changes that grounding enables.
- **The classifier's heading-absent default** silently replaces
  authored metadata with a tier-default. Under rec O's gate,
  this is observationally identical to a score-budget Category
  1 malformation — but its true cause is metadata loss, not
  finding shape. This is the classifier-side facet of the
  un-grounded-loop pattern above; rec BB closes both.

## 4. Failure patterns in the current park set

Each pattern is named, scoped to the parks it explains, and
linked to the rec that closes it. §4.1 is the umbrella; the
classifier-side (§4.2) and fixer-side (§4.5, §4.8) sub-patterns
are facets of it that surface differently in forensics.

### 4.1 Inner spec-diff-fix-loop runs unground (umbrella; affects 6 of 7 direct parks)

The outer-loop flow is:

1. Orchestrator picks a finding from `docs/spec-review.md`.
2. Top-level fixer reads the finding, applies its initial edit
   to the spec corpus, **and removes the H1 from
   `spec-review.md`** as part of the same commit (a resolved
   finding should not remain in the queue).
3. Inner spec-diff-fix-loop runs against the working tree:
   - Lenses scan the git-diff and raise findings.
   - Classifier classifies each raised finding (must-fix vs
     fix vs defer-to-debt vs trust-override).
   - Fixer authors edits to address the must-fix and fix-class
     findings.
   - Iterate until classifier exits clean, gives up, or hits
     the 17-pass cap.

At steps 3a, 3b, and 3c the inner loop has no access to the
originating finding's Problem, Solution approach, Solution
constraints, or Relationships block. The H1 was stripped in
step 2; the live `docs/spec-review.md` no longer carries it.
Both the classifier and the fixer navigate purely against the
lens-raised findings on the current diff.

This produces three observable failure shapes:

- **Classifier defaults the originating score** (§4.2 below).
  The heading-absent fallback rule replaces authored
  importance/score/mustFix with tier defaults, breaking rec O's
  budget arithmetic.
- **Fixer answers lens complaints with content the originating
  finding never mandated** (§4.8 below). The fixer treats the
  raised lens finding as the goal and authors whatever prose
  satisfies it, including new normative claims that contradict
  the pre-existing corpus.
- **Drift compounds across passes.** Each pass moves the diff
  further from the originating Problem and toward lens-defect
  minimisation. T16b's 5-pass trajectory illustrates the
  endpoint: pass 1 banked correct fixes for the originating
  Problem, pass 4's narrowing reverted those fixes when stage-3
  lens complaints could not be satisfied (§4.5 below), pass 5
  rediscovered the originating defect as fresh residue, and the
  loop exited claiming a score-budget exhaustion. The actual
  failure was navigational: the loop did not know what it was
  trying to solve, so it could not tell when it had wandered.

The grounding gap explains why the prior round's pi-loom
reshape work (raise scores, split into atoms, author
prerequisite findings) was necessary but not sufficient. A
well-shaped finding with rich metadata still arrives at the
inner loop as a bare diff; the inner loop still has no idea
what the diff is supposed to accomplish.

**Closes:** rec BB (§5.1) provides the artefact substrate;
rec HH (§5.2) gives the fixer the grounding behaviours.
Rec FF (§5.6) and rec GG (§5.7) become principled rather than
lexical once HH lands.

### 4.2 Heading-absent metadata default (classifier-side facet of §4.1; 6 of 7 direct parks)

The classifier looks up the originating finding's metadata by
grepping the live `docs/spec-review.md` for the heading, finds
it absent (per step 2 of the flow in §4.1), and applies the
heading-absent fallback rule: `severity(origin) = medium`,
`S = 25`, `mustFix(origin) = false`. This default fires
regardless of what the originating finding actually authored.

Six of the seven current direct parks hit this exact pattern:

| Finding | Live metadata at dispatch (recoverable) | Classifier saw | Σ_shadow | k×S at default | k×S at true S |
|---|---|---|---:|---:|---:|
| T03e | live `Importance: medium` → S=25 (cluster-sibling default) | S=25 (default match) | 101 | 75 | 75 (still fires) |
| T18c | live `Importance: medium` → S=25 | S=25 (default match) | 76 | 75 | 75 (still fires by 1) |
| T16b | live `Importance: medium → S=25`; recoverable cluster signal `high` | S=25 (default match) | 115 | 75 | 300 (would absorb) |
| T13b | recoverable `Importance: high` → S=100 | S=25 (default mismatch — under by 4×) | n/a (scope-guard exit) | 75 | 300 |
| T05 | live `Importance: medium` (post-reshape) → S=25 | S=25 (default match) | 81 | 75 | 75 (still fires) |
| T06 | live `Importance: high`, `Score: 100` (post-reshape) | S=25 (default mismatch — under by 4×) | 107 | 75 | 300 (would absorb) |

The default *matches* the live metadata in some cases (T03e,
T18c, T05) and *under-estimates* it in others (T13b, T06,
T16b). When it matches, the exit's root cause is real
score-budget insufficiency and reshape is required. When it
under-estimates, the exit's root cause is the metadata-loss
mechanism alone; the originating finding is well-shaped, the
fixer would have succeeded under the true score, and no reshape
on the pi-loom side can close the gap because the next
dispatch re-strips the heading.

The orchestrator already has the finding's full text in scope
at dispatch time — before it invokes the top-level fixer.
Nothing currently captures that text in a form the inner
classifier can read after the H1 is stripped from
`docs/spec-review.md`. Rec BB persists the metadata to a
dispatch-scoped artefact that survives the strip without
depending on git history or working-tree commit state.

**Closes:** rec BB (§5.1).

### 4.3 Dispatch-ordering violation (3 of 7 direct parks)

The orchestrator picked T13b before T13a, T16b before T16e,
T18c before T18a. In every case the picked finding's own
`## Relationships` block declares a `must-follow` edge on a
sibling that is still live in `docs/spec-review.md`. The
Relationships text is parseable in fixed form
(`- T<NN><x> "..." — must-{precede,follow}`).

The downstream effects are predictable:

- **T13b** — `cross-file` qualifier propagated to two new
  normative sites with zero defining occurrences anywhere in
  the spec corpus; assumptions lens raised the gap on pass 1.
- **T16b** — top-level fixer had no coherent prompt-mode
  visibility rule to forward-link to, so it invented one; the
  invented prose inherited the PIC §2 contradiction T16e was
  authored to resolve.
- **T18c** — forward-link targets the finding required do not
  yet exist; pass-2 fixer over-corrected into a cross-page
  contract contradiction (the prompt-mode `Ok(v)` "audience"
  parenthetical at `docs/spec.md:52` inverts
  `slash-invocation.md:19`'s normative contract that the `Ok`
  return value is NOT surfaced to the user).

Splitting findings into prerequisite-bearing pairs (the prior
revision's reshape strategy for T13 → T13a/T13b and the T16b
prereq T16e) is correct in shape and would have worked under a
correctly-ordering dispatcher. Without one, the split made the
problem worse: pre-split T13 was a single dispatch unit; post-
split T13a and T13b are two units and the dispatcher picked the
wrong one first.

**Closes:** rec CC (§5.3).

### 4.4 Scope-guard vs raised-severity collision (4 of 7 parks; new dominant exit sub-rationale)

A new classifier exit sub-rationale,
`must-fix-blocked-by-scope-guard`, dominates the current park
set. The shape: the top-level fixer forwards class-1 and class-2
scope guards to the inner loop; pass-1 lenses raise a finding
whose importance exceeds the (defaulted) origin importance; the
only viable remediation for the raised finding violates one of
the forwarded guards; the loop exits.

This exit is the expected behaviour for malformed findings, but
two contributing factors make it fire on findings that are not
intrinsically malformed:

1. **Score is defaulted to S=25** (§4.1), so the raised
   finding's per-finding trust override is suppressed at the
   pass-level gate.
2. **The guards are correct.** The raised lens finding is a
   real defect, and the guard's refusal to author outside the
   originating finding's named surface is the correct
   fixer-vs-author boundary (§3).

Five of the seven current parks exit on this sub-rationale
(T03e, T18c, T16b, T13b, T05/T06 via the related
score-budget sub-rationale). Three of them (T16b, T13b, T18c)
are downstream of §4.2's dispatch-ordering violation; once
rec CC ships and the dispatcher respects must-precede, those
findings will not face the collision because the prerequisite
will already have landed. The remaining two (T03e, T05) are
real score-budget cases where the originating Solution
approach mandates more obligations than the score admits;
those need per-finding reshape regardless of pipeline state.

**Closes:** rec CC (§5.3) for the ordering-induced subset;
per-finding reshape (§5.8) for the residual.

### 4.5 In-loop approach-narrowing reverts higher-severity pass-1 fixes (T16b; fixer-side facet of §4.1)

When the inner fixer's mode (d) refuses a stage-3 lens-driven
fix, the loop's in-loop approach-narrowing reverts the affected
chunk to `baseline-post-top-level`. T16b illustrates the
collateral cost: pass 1 banked a high-severity consistency fix
and a low-severity naming fix on `docs/spec.md:48`. Pass 4's
stage-3 fan-out raised five prose-quality findings; the inner
fixer refused fix-05 (mode d); the narrowing reverted the entire
chunk; pass 5's lens fleet rediscovered the high-severity defect
as fresh residue (Σ_shadow=115) and the rec O gate fired.

The narrowing mechanism is necessary (it is the loop's exit
ramp from an over-fenced approach), but its current
all-or-nothing revert is a direct consequence of the un-grounded
fixer: with no access to the originating Solution approach, the
loop cannot distinguish edits that resolve the originating
Problem from edits that respond to lens findings. It treats the
entire chunk as equally rewritable and discards pass-1 work
that was load-bearing for the originating Problem.

**Closes:** rec HH (§5.2) provides grounding so the fixer
knows which edits derive from the originating Solution
approach; rec GG (§5.7) consumes that grounding to preserve
those edits across narrowing reverts. Affects T16b directly;
will likely affect other stage-3-reaching findings as
throughput rises.

### 4.6 Audit miss on obligation-count vs score-budget (recurring; visible on T05 + most of §4.2)

The pre-dispatch auditor's most recent reports (under
`.pi/tmp/spec-review-audit/full-iter3-2026-05-15T12-45-01/reports/`)
return Overall risk: LOW and Recommended action: AUTO_RESHAPE
(Pattern I — vestigial metadata) or NO_ACTION on findings the
inner loop subsequently parks. The auditor's per-lens
predictions are mostly PASS; the inner loop then raises ≥5
fix-class findings per pass.

The gap is in the auditor's risk-synthesis machinery: it has no
model for "how many independently testable obligations does the
Solution approach generate?" vs "how does that compare to S?".
Rec P added decision-axes counting on the Problem; rec DD
extends that to a count of distinct authoring acts (file edits,
new anchors, new glossary entries, new cross-references, new
normative claims) and surfaces a `RISK_BUDGET` flag when
N × 25 > S.

T05's report enumerates the false-negatives explicitly:
7 fix-class findings across 4 lens dimensions
(completeness ×1, consistency ×3, traceability ×3,
assumptions ×2) were all predicted PASS.

**Closes:** rec DD (§5.4). Secondary closure: rec EE (§5.5)
for the specific case where the auditor's assumptions-lens
prediction confuses "uses" with "defines" (T13b's pre-split
audit said `cross-file` was "already pinned by the normative
paragraph below"; the paragraph uses the token, no sentence in
the corpus defines it).

### 4.7 Defer-on-permanently-unresolvable sibling (T15a)

T15a parked top-level-refused with sub-rationale
`must-fix-blocked-by-deferred-precondition`: Solution
constraint #3 explicitly directs deferral when the Concurrency
model subsection (owned by T15b) is absent from
`## Extension Architecture` in `docs/spec.md`. T15b is unresolved
(currently active in `spec-review.md`) and the subsection does
not yet exist. The defer-trigger fired as designed.

This is a clean ordering case — T15a depends on T15b's
resolution and the dispatcher correctly does not narrow around
the dependency. Unlike §4.3, the relationship is encoded in a
Solution constraint rather than the Relationships block.

**Closes:** no pipeline change required; T15a re-dispatches
after T15b lands. Rec CC (§5.3)'s dispatcher should pick T15b
first; if T15b survives, T15a follows. If T15b re-parks,
T15a is permanently parked until T15b is reshaped, which is the
correct behaviour.

### 4.8 Pass-2 over-correction — fixer authors new normative claims (T05, T18c; fixer-side facet of §4.1)

When a pass-1 consistency lens raises a complaint about
under-specification (e.g. T05's "wildcard pair over-generalises
a per-field rule"), the fixer's natural response is to ADD
specificity by promoting prose to an enumerated rule set. T05
pass-2 produced a 4-item enumeration whose rule (4) was a new
normative running-prose spelling rule the originating finding
never asked for. The pre-existing corpus violated rule (4) on
~10 sites and pass-3 caught the self-contradiction.

T18c is the same shape on cross-page contract obligations: the
pass-2 prompt-mode `Ok(v)` "audience" parenthetical inverts a
pre-existing normative contract in `slash-invocation.md:19`.

The root cause is the §4.1 grounding gap: the fixer has no
view of the originating Solution approach, so it cannot tell
that the lens's complaint can be answered without inventing a
new rule. The fixer's three existing authoring-guard sub-modes
`(f-stop-1)` / `(f-stop-2)` / `(f-stop-3)` govern *whether* to
narrow a Solution constraint; they do not govern *what* the
fixer is allowed to add to satisfy a pass-N raised finding.
Rec FF (§5.6) adds mode `(h)` to refuse fixes that introduce
normative items beyond those the originating Solution approach
enumerates — a check that becomes principled once rec HH
(§5.2) puts the originating Solution approach in the fixer's
hands.

**Closes:** rec HH (§5.2) + rec FF (§5.6).

## 5. Recommendations

Seven pi-config recommendations + pi-loom finding-authoring
work. No architectural / finding-shape principle changes are
outstanding — the §3 cut still holds and the binding-surface
distinction from SP-2 is sound.

The rec letters (BB, HH, CC, DD, EE, FF, GG) are the next
stable identifiers after AA in the existing pi-config sequence.
Recs BB and HH are listed first because they are foundational:
rec BB persists the grounding substrate, rec HH puts that
substrate in the fixer's hands. Recs CC – GG layer on top.

### 5.1 Rec BB — Origin grounding artefact persisted at dispatch (pi-config)

**Status: IMPLEMENTED** (pi-config `122d896`, 2026-05-20)

Closes the classifier-side facet of §4.1 and §4.2 (6 of 7
direct parks). The metadata loss is upstream of the classifier:
the orchestrator already has the finding's full text in scope
before it invokes the top-level fixer, and nothing currently
captures that text in a form the inner loop can read after the
H1 is stripped. Persist it as a dispatch-scoped artefact rather
than reaching back into git history.

Rec BB is the substrate. The classifier consumes it directly
(this rec). The fixer consumes the same artefact for the
grounding behaviours in rec HH (§5.2).

**Mechanism — capture:**

- At dispatch setup time — after the orchestrator has selected
  the finding (or cluster) and resolved its text from
  `docs/spec-review.md`, but BEFORE invoking the top-level
  fixer — write the verbatim finding body to
  `.pi/tmp/spec-fix-loop/<RUN_ID>/_origin/origin-finding.md`.
  The artefact includes the H1, the full metadata header
  (`Kind`, `Importance`, `Score`, `Atomicity`, `Shape`,
  `State`, `Decision axes`, any rec-P / rec-Z fields), the
  Problem, Solution approach, Solution constraints, and the
  Relationships block.
- For cluster dispatch (rec F, `Shape: multiple`), write one
  file per cluster member —
  `_origin/<finding-id>-<slug>.md` — plus a manifest
  `_origin/_cluster.json` enumerating the members and their
  per-member scores so rec K's max-aggregation still operates
  on real metadata.
- The artefact also doubles as forensic evidence: post-mortem
  reports no longer need to recover the originating finding via
  `git show <commit>:docs/spec-review.md`; they read the
  artefact directly. Several recent forensics (T05, T13b,
  T16b) had to reconstruct the originating body from git, with
  caveats about which commit was the right ancestor.

**Mechanism — classifier consume (this rec):**

- The classifier's heading-lookup prelude (currently: grep the
  live `docs/spec-review.md` for the H1 by exact title; if
  absent, default `severity=medium / S=25 / mustFix=false`)
  gains a single prior step: read the origin artefact at
  `.pi/tmp/spec-fix-loop/<RUN_ID>/_origin/` first. The live
  `spec-review.md` grep becomes a fallback for cases where the
  artefact is missing (older runs, manual dispatch).
- If the artefact is missing AND the live tree lookup fails,
  the existing heading-absent default applies. Forensic reports
  already record the heading-absent provenance signal in the
  `Origin importance` parenthetical; rec BB extends the
  parenthetical to record the recovery source
  (`artefact` / `live-tree` / `default`).

**Files changed (pi-config):**
`commands/fix-spec-shape-single-findings.md` (the artefact
write at dispatch setup) and
`agents/spec-diff-fix-classifier.md` (the artefact read in the
heading-lookup prelude). ~25 lines total: ~15 in the
orchestrator command for the per-dispatch / per-cluster write
plus the manifest, ~10 in the classifier prelude for the
artefact-first lookup and the provenance-signal extension.

This is the foundational rec in the set. It closes the dominant
classifier-side failure shape on its own and unlocks rec HH's
fixer-side grounding behaviours.

### 5.2 Rec HH — Fixer grounded in origin artefact at every pass (pi-config)

**Status: IMPLEMENTED** (pi-config `c714cda`, 2026-05-20)

Closes the fixer-side facets of §4.1 (drift), §4.5
(narrowing reverts good fixes), and §4.8 (pass-2 over-
correction). Rec BB makes the origin artefact available; rec
HH makes the fixer use it.

Without grounding the fixer treats each pass's raised lens
findings as the goal. With grounding the fixer treats the
originating finding's Problem as the goal and the raised lens
findings as constraints to satisfy on the way there. The shift
recasts every fixer decision — what to author, what to refuse,
what to preserve when narrowing — against the originating
intent.

**Mechanism:**

- Every invocation of `agents/spec-diff-fixer.md` (every pass,
  every fix attempt) reads
  `.pi/tmp/spec-fix-loop/<RUN_ID>/_origin/origin-finding.md`
  as part of its prompt context. For cluster dispatch the
  fixer reads every per-member file in `_origin/`.
- The fixer prompt grows a new mandatory section, **Originating
  Problem (do not lose sight of):**, populated verbatim from
  the artefact's `## Problem`, `## Solution approach`, and
  `## Solution constraints`. The section appears above the
  pass's raised-lens-findings list so the fixer reasons about
  raised findings *in terms of* the originating Problem rather
  than independently.
- The fixer's authoring rubric is extended with three
  grounding checks the prompt enumerates explicitly:
  1. **Direction-of-travel check.** Before authoring a fix,
     compare the proposed edit's effect against the originating
     Solution approach. If the edit moves the working tree
     *toward* the Solution approach's intended end state, the
     edit is a candidate fix. If it moves *away* (e.g. reverts
     an edit that implemented the Solution approach; replaces
     a Solution-approach-mandated structure with a different
     one; deletes a Solution-approach-mandated cross-link),
     the fix is refused with mode `(i) drift-from-origin`.
  2. **Origin-mandate check.** For each new normative claim
     the fix would introduce, check whether the originating
     Solution approach (or Solution constraints) enumerates,
     describes, or anticipates that claim. If not, route to
     rec FF's mode `(h) over-correction-new-normative-claim`
     (§5.6) — now a principled check rather than the lexical
     check the prior draft proposed.
  3. **Constraint-respect check.** For each Solution constraint
     the fix would touch, confirm the fix is consistent with
     the constraint (read directly from the artefact). The
     fixer's existing rec V mode `(f)` already governs whether
     constraints can be narrowed; rec HH ensures the constraint
     text is in the fixer's prompt every pass rather than
     re-derived from the diff.
- New refusal mode `(i) drift-from-origin` is recorded in the
  inner-fixer NOTES line:
  `RefusalMode: (i) drift-from-origin; chunk=<chunk-id>;
  origin-approach-fragment="<verbatim>";
  proposed-effect="<verbatim>"; drift-axis=<revert|replace|delete>`.
- New classifier defer rationale
  `defer-to-debt — drift-from-origin` lets the originating
  lens finding land in debt rather than blocking the loop.
  Originating-Problem coverage takes precedence over lens-defect
  minimisation.
- The fixer's per-pass output (the `_diff.txt` annotations the
  loop already writes) gains a new line per applied fix:
  `OriginAlignment: forward | sideways | (refused as drift)`.
  Forensics can then audit how many of a pass's fixes advanced
  the originating Problem vs were lens-driven only.

**Concrete consequence on the recent parks:**

- **T05 pass-2 over-correction (rule 4).** Origin-mandate check
  fires — the originating Solution approach mandates
  enumerating surface spellings, not authoring a normative
  running-prose spelling rule. Rule (4) is refused under mode
  (h)/(i); pass-2 output retains the 3-item enumeration; pass-3
  finds no self-contradiction.
- **T16b pass-4 narrowing revert.** Direction-of-travel check
  fires — reverting pass-1's high-severity consistency fix
  moves the diff away from the originating Solution approach
  (which mandates the PIC forward-link with no inline
  visibility-set composition). The narrowing's revert target
  is reduced to the pass-2..N edits, leaving pass-1 intact.
  Combined with rec GG (§5.7) the chunk's load-bearing fixes
  survive narrowing.
- **T18c pass-2 cross-page contradiction.** Origin-mandate
  check fires — the prompt-mode `Ok(v)` "audience"
  parenthetical does not appear in or derive from the
  originating Solution approach (which is purely a forward-link
  addition for the null-policy). Refused under mode (h)/(i).

**Files changed (pi-config):**
`agents/spec-diff-fixer.md` (the grounding context section,
the three rubric checks, the new refusal mode (i)),
`agents/spec-diff-fix-classifier.md` (the new
`defer-to-debt — drift-from-origin` rationale and the
OriginAlignment field reading), `agents/spec-diff-fix-loop.md`
(per-pass OriginAlignment annotation). ~60 lines across the
three files.

Rec HH is the rec the un-grounded-loop pattern (§4.1)
deserves. Rec BB without rec HH closes only half the gap —
the classifier knows the score but the fixer still drifts.
Shipping HH together with BB closes the umbrella.

### 5.3 Rec CC — Orchestrator enforces must-precede at dispatch (pi-config)

**Status: IMPLEMENTED** (pi-config `8a07d70`, 2026-05-20)

Closes §4.3 (3 of 7 direct parks, with cascade unblock for an
additional ~6 cascade parks once the upstreams land).

**Mechanism:**

- The dispatcher (the outer-loop picker in
  `commands/fix-spec-shape-single-findings.md` and any
  per-finding selector in `agents/spec-review-fixer.md`)
  parses each candidate's `## Relationships` block for
  `must-follow` and `must-precede` edges. The text format is
  fixed: `- T<NN><x> "..." — must-{precede,follow}`.
- For each candidate, the dispatcher checks whether the
  referent of each `must-follow` edge is still present
  (unresolved) in `docs/spec-review.md`. If yes, the candidate
  is skipped this dispatch.
- Symmetric check for `must-precede`: if any other candidate
  declares `must-follow` against this candidate, the picker
  prefers the upstream candidate.
- When no candidate is dispatchable (all have unresolved
  must-follow targets), the dispatcher reports a deadlock
  signal in its output for human inspection; this is rare and
  indicates a circular dependency that needs reshape.

**Files changed (pi-config):**
`commands/fix-spec-shape-single-findings.md` (the dispatcher
pre-check); `agents/spec-review-fixer.md` if it does its own
selection. ~20 lines.

### 5.4 Rec DD — Auditor obligation-count vs score-budget pre-check (pi-config)

**Status: IMPLEMENTED** (pi-config `83e4e65`, 2026-05-20). Shipped
as finding-shape Pattern R rather than a free-standing pre-check
so it integrates with the existing rec P / rec L multi-pattern
routing machinery; routing order extended to
`I → M → N → P → R → Q → A → B → F → J → L → O → D → E → G → K → H → C`.

Closes §4.6 (audit-vs-actual gap on T05 and most §4.2 parks).
Extends rec P's decision-axes idea from "count axes the
Problem requires" to "count authoring acts the Solution
approach mandates".

**Mechanism:**

- Before computing per-lens predictions, the auditor parses
  `## Solution approach` and `## Solution constraints` for
  distinct authoring acts: file edits (distinct file paths),
  new anchors, new glossary entries, new cross-references
  between files, new normative claims. Count = N.
- If `N × 25 > S` (where S is the originating score in
  tier-default form), surface a `RISK_BUDGET` flag in the
  audit output regardless of per-lens PASS counts. The flag's
  rationale: `obligation-count-exceeds-score-budget — N=<n>,
  S=<s>, required ≥ <n*25>`.
- The flag routes to `HUMAN_REVIEW` with the recommendation to
  raise the score, split the finding into per-act atoms, or
  narrow the Solution approach to drop one or more authoring
  acts.
- The pre-check runs alongside the per-lens predictions, not
  instead of them.

**Files changed (pi-config):**
`agents/spec-review-auditor.md`. ~30 lines for the pre-check
logic + the worked example.

### 5.5 Rec EE — Auditor distinguishes "uses" from "defines" (pi-config)

**Status: IMPLEMENTED** (pi-config `b86b9f2`, 2026-05-20)

Closes the assumptions-lens prediction class T13b's pre-split
audit demonstrated. Narrow scope; cheap to implement.

**Mechanism:**

- When the auditor's assumptions-lens prediction relies on
  "term X is already pinned/defined elsewhere", the procedure
  runs `grep -nE "\bX\b" docs/spec.md docs/spec_topics/` and
  inspects each hit for a defining sentence shape
  (`X is …` / `An X is …` / `A Y is X when …`).
- PASS only when at least one hit is a defining sentence.
  Otherwise RISK_HIGH with rationale
  `assumed-defined-but-only-used`.
- The procedure is documented as a worked example in the
  auditor prompt; the grep regex and the inspection rubric
  live in a small named subsection.

**Files changed (pi-config):**
`agents/spec-review-auditor.md`. ~10 lines.

### 5.6 Rec FF — Fixer mode (h): no-new-normative-claim guard (pi-config)

**Status: IMPLEMENTED** (pi-config `d2b32c3`, 2026-05-20)

Closes §4.8 (T05 pass-2 rule (4); T18c pass-2 prompt-mode
audience parenthetical). Rec HH (§5.2) is the prerequisite —
the origin-mandate check it adds to the fixer rubric is exactly
what rec FF's mode (h) needs to fire on principled grounds
rather than lexical pattern-matching.

**Mechanism:**

- New refusal mode in `agents/spec-diff-fixer.md`:
  `(h) over-correction-new-normative-claim`. Fires when:
  - the current pass is ≥ 2; AND
  - the proposed fix adds prose containing a normative modal
    (MUST / MUST NOT / SHALL / required / forbidden / "the
    runtime always …" / "every X …" / numbered enumeration of
    rules); AND
  - the originating Solution approach (read from the rec BB
    artefact, per rec HH) does not enumerate, describe, or
    anticipate the proposed claim. The origin-mandate check is
    the load-bearing predicate; the modal pattern-match is the
    cheap pre-filter.
- Refusal NOTES line: `RefusalMode: (h)
  over-correction-new-normative-claim; chunk=<chunk-id>;
  added-claim=<verbatim>; not-enumerated-in=Solution-approach`.
- New classifier defer rationale
  `defer-to-debt — over-correction-new-normative-claim`.
  Originating lens finding routes to debt; loop continues with
  the un-augmented prose.
- The mode does not refuse fixes that *modify* existing
  normative prose (rec AA covers oscillation on existing
  tokens) or fixes that *narrow* an existing normative claim
  (which is a contraction, not an addition).

**Files changed (pi-config):**
`agents/spec-diff-fixer.md`,
`agents/spec-diff-fix-classifier.md`. ~30 lines total — the
origin-mandate check itself is in rec HH; rec FF is the
specific refusal-mode wiring on top.

### 5.7 Rec GG — In-loop approach-narrowing preserves origin-aligned fixes (pi-config)

**Status: IMPLEMENTED** (pi-config `0cf1338`, 2026-05-20)

Closes §4.5 (T16b's all-or-nothing chunk revert). Depends on
rec HH (§5.2): the OriginAlignment annotation rec HH adds to
each applied fix is what tells the narrowing which fixes are
load-bearing for the originating Problem.

**Mechanism:**

- When in-loop approach-narrowing fires on a chunk (inner
  fixer mode (d) refuses a fix and the loop reverts the chunk),
  the revert target becomes `baseline-post-top-level *plus*
  every pass-1..N fix annotated `OriginAlignment: forward`
  (per rec HH), regardless of the fix's lens severity.
- For pass-1..N fixes annotated `OriginAlignment: sideways`
  (lens-driven only, no direction-of-travel signal), the
  prior severity heuristic applies as a fallback: keep the
  fix if its severity strictly exceeds the highest severity
  in the current pass's raised-but-refused set; otherwise
  drop it with the rest of the narrowing revert.
- Preserved fixes are re-attributed in the loop notes as
  `narrowing-preserved-from-pass-<N>; reason=origin-forward`
  or `narrowing-preserved-from-pass-<N>; reason=severity-ranks`
  so forensics can trace which mechanism preserved them.

**Files changed (pi-config):**
`agents/spec-diff-fix-loop.md`. ~20 lines + a worked example.

### 5.8 Per-finding reshapes (pi-loom)

**Status: PARTIALLY IMPLEMENTED** (pi-loom `8ac9a8f`, 2026-05-20).
The unconditional housekeeping work — dedup of the stale T18c × 2
/ T18a × 2 H2 entries called out in §2.1 — has shipped. The
conditional per-finding reshapes in the table below are explicitly
deferred to post-validation per the "applies *after* validation
shows the pipeline patches do not close the case" rule below;
none have been performed pre-validation.

Most of the current park set is downstream of pipeline gaps
(§4.1 / §4.3) and will not require reshape once recs BB + HH
and CC land. The residual reshape list applies *after*
validation shows the pipeline patches do not close the case:

| Finding | Conditional reshape |
|---|---|
| **T03e** | If recs BB + HH + CC alone don't clear (T03e's S is genuinely medium): per the forensic's reshape menu, raise score to ≥100 OR narrow Solution approach to the revert option ("matching … floor") OR split into verifier-naming + hyperlink-style axes. |
| **T05** | Per the T05 forensic RI-1: split into T05a (frontmatter Naming convention extension, S=25), T05b (`**binder model**` glossary entry conforming to glossary-intro convention, S=5), T05c (per-surface citation link from glossary to T05a's new sub-anchor, S=1). Rec HH likely closes this without splitting by refusing the pass-2 over-correction (rule 4), but the split is still the cleanest authoring; reshape after rec HH validation. |
| **T06** | Already reshaped to `Importance: high / Score: 100`. Rec BB will surface the true score; reshape probably unnecessary post-BB. If it re-parks anyway, split into per-axis atoms (TUI binding / non-interactive carve-out / always-present implication) per `_blocked.md`. |
| **T13b, T16b, T18c** | No reshape needed; cascades clear when rec CC's dispatcher picks the prerequisite first (T13a, T16e, T18a respectively). T16b additionally benefits from rec HH + rec GG so pass-1 fixes survive any pass-4 narrowing. |
| **T15a** | No reshape needed; re-dispatches automatically after T15b lands. T15b's reshape (Score=100) is already live and should clear. |

Cascade-parked findings (T03b, T03d, T13a, T16e, T18a, T18b,
T19a, T19b, T19d, T19e) re-dispatch when their upstream lands;
no per-cascade reshape.

### 5.9 Priority order

1. **Rec BB + Rec HH together** (pi-config) — the
   grounding-artefact substrate + the fixer behaviours it
   enables. Closes the umbrella pattern (§4.1) on both
   classifier and fixer sides. Ship together; rec BB alone
   leaves the fixer still drifting.
2. **Rec CC** (pi-config) — unblocks the cascade pile (≥9
   cascades become dispatchable in correct order). Together
   with BB + HH, the current park set should reduce by ~80%
   on re-dispatch.
3. **Rec DD + Rec EE** (pi-config) — close the audit-layer
   gaps that turn LOW-risk verdicts into inner-loop parks.
   Ship after BB + HH + CC so the validation set is clean.
4. **Rec FF + Rec GG** (pi-config) — the principled-mode-(h)
   and origin-aware-narrowing extensions on top of rec HH.
   Both depend on HH's OriginAlignment annotation; ship after
   HH validates.
5. **Per-finding reshapes** (pi-loom) — re-evaluate after
   each pi-config rec ships. Most reshapes in §5.8 are
   conditional and likely unnecessary once BB + HH + CC land.

Validation queue (after each rec ships):

- Re-dispatch the §2.1 park set; expect T13b, T16b, T18c, T06
  to clear via recs BB + HH + CC; expect cascades to resolve
  in correct order. T05 likely needs split-into-atoms reshape
  even with HH because S=25 is genuinely insufficient.
- Re-dispatch T11a, T03a, T10, T07, T15b (the current active
  set) — confirms BB + HH + CC do not regress findings that
  already work. Watch the new OriginAlignment annotations on
  the cure paths; every applied fix on a cured run should be
  `forward` or `sideways` (never refused as drift on a finding
  that ultimately resolves).
- Re-run the auditor on the unparking batch with rec DD + rec
  EE; spot-check that the obligation-count flag fires on T05's
  shape and the uses-vs-defines flag fires on any new
  qualifier-propagation finding.
- If §4.2 metadata-default parks recur AFTER rec BB ships,
  the artefact write or read path has a bug; that would be the
  next forensic-investigation cycle, not a re-deferral to
  manual restoration.
- If §4.5 / §4.8 drift parks recur AFTER rec HH ships, the
  grounding context is being ignored or the rubric checks are
  too permissive; tune the (i) mode threshold on evidence from
  the OriginAlignment annotations.

## 6. What NOT to recommend

- **The fixer must not author findings.** Letting the fixer
  emit new spec-review entries or unguardedly narrow binding
  constraints converts it from a mechanism into an author.
  Category 1 rejects route via the audit layer (rec L, rec DD,
  rec EE); Category 2 capability gaps route via targeted fixer
  extensions (rec T, rec AA, rec FF, rec GG, rec HH).
- **The fixer must not widen edit surface beyond what the
  finding names.** When lens evidence indicates the right
  resolution requires editing outside the finding's named
  scope, the fixer's correct response is to reject. Silent
  surface-widening makes pipeline behaviour non-reproducible.
  Rec HH formalises this with the origin-mandate and
  direction-of-travel checks.
- **Grounding the fixer must not become re-authoring the
  finding.** Rec HH puts the originating Problem in the
  fixer's prompt as context, not as a license to re-interpret
  what the Problem means. When a raised lens finding has no
  resolution consistent with the originating Solution
  approach, the fixer's correct response is mode (i)
  drift-from-origin refusal, not creative re-reading of the
  Solution approach to license the lens-driven fix.
- **The audit layer must not become a substitute for the
  finding-authoring layer.** Rec L / DD / EE route Category 1
  detection earlier; they do not author the reshape themselves.
- **Loosening any lens.** Every raised finding in the current
  park set is a real defect against the imagined or actual
  post-fix text. The lenses are doing correct work.
- **Reverting any shipped rec.** Every shipped rec
  (J, F, K, V, T, O, M, W, L, P, Z, AA) is either fully working
  or working with a known integration gap that the new recs
  address. No revert is warranted.
- **Raising the rec O `k` multiplier from 3.** Tempting because
  it would let mis-aggregated cases squeeze through (e.g. T06
  at defaulted S=25 with Σ_shadow=107 passes at k=5). But the
  gate's strictness is what surfaces the §4.2 metadata-default
  gap; weakening k weakens trust-override-suppression on
  genuinely-undersized origins. Rec BB closes the gap at its
  source.
- **Continuing manual metadata restoration as the §4.2
  response.** The prior revision's stance — "the four affected
  parks can be unblocked by hand in less time than a classifier
  extension would take to specify and review" — is disproven
  by evidence: the next dispatch strips the heading again and
  the same default re-asserts. Rec BB is now the correct
  response.
- **Auto-raising the heading-absent default from S=25 to
  something higher.** The default is meant to be conservative;
  raising it would mask legitimate score-budget exhaustions for
  findings that genuinely carry medium-importance scope. The
  right fix is rec BB (preserve the actual metadata), not
  raising the default.
- **Raising the 17-pass cap.** No current park exhausts it
  (T16b reached pass 5, T05 pass 3, others pass 1). Cap is not
  the binding constraint.
- **Suppressing the assumptions lens for naming-class
  findings.** The lens raised real defects on T13b and T05.
  Suppressing it would let the same gap reappear on every
  future cross-file split or naming-convention change.
- **Re-dispatching parked findings as-authored before rec BB
  + rec HH ship.** Six of seven current parks are downstream of
  the heading-absent default and/or fixer drift; re-dispatching
  without the grounding substrate reproduces the failure.
- **Shipping rec BB without rec HH.** Closing only the
  classifier-side facet leaves the fixer drifting through every
  pass. The classifier will route findings correctly but the
  fixer will still produce diffs that resolve lens defects
  while wandering away from the originating Problem. Forensic
  reports will then attribute parks to score-budget exhaustion
  on residue the fixer itself manufactured. Ship the two
  recs together or the diagnosis surface gets worse, not
  better.

## Appendix — file and artifact references

Most recent dispatch forensic reports (gitignored):

- `.pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/`
  (5 reports — outer-loop batch after the prior round's
  priority-4 reshapes landed):
  - `t03e-update-spec-md-host-runtime-item-1-rephrase-to-delegate-the-engines-node-eq.md`
    (355 lines; must-fix-blocked / score-budget; CATEGORY 1;
    cluster-sibling default; root cause: heading text names
    wrong test + S=25 cluster default).
  - `t13b-invocation-depth-bound-propagate-the-cross-file-qualifier-to-the-introducto.md`
    (309 lines; must-fix-blocked / scope-guard; CATEGORY 1;
    root cause: dispatch-ordering violation — T13a unresolved).
  - `t15a-reduce-session-model-orientation-paragraph-to-a-four-sentence-forward-linki.md`
    (240 lines; top-level-refused / deferred-precondition;
    CATEGORY 1 default; root cause: T15b unresolved — clean
    ordering case).
  - `t16b-rewrite-callable-set-paragraph-drop-inline-customtools-createagentsession-p.md`
    (481 lines; must-fix-blocked / score-budget over 5 passes;
    CATEGORY 1; root causes: T16e unresolved + in-loop
    approach-narrowing reverted pass-1 high-severity fixes).
  - `t18c-widen-spec-md-runtime-observability-bullet-to-forward-link-the-null-policy.md`
    (458 lines; must-fix-blocked / score-budget over 2 passes;
    CATEGORY 1; root causes: T18a unresolved + pass-2 over-
    correction injected cross-page contract contradiction).
- `.pi/tmp/spec-fix-failure-forensics/2026-05-19T17-23-50_9cbe86/`
  (2 reports — second outer-loop batch):
  - `t05-bind-frontmatter-vs-binder-binder-settings-diagnostics-prose-root-word-incon.md`
    (499 lines; must-fix-blocked / score-budget over 3 passes;
    CATEGORY 1; root cause: structural budget insufficiency for
    two-page naming-convention surface + pass-2 over-correction
    with rule (4) self-contradicting corpus).
  - `t06-operator-role-tui-binding-asserted-in-glossary-but-never-reconciled-with-non.md`
    (434 lines; must-fix-blocked / score-budget pre-fix
    application; CATEGORY 1; root cause: heading-absent default
    masked the post-reshape S=100 → classifier saw S=25).

Pi-config commits in production (git-pinned via global settings
under `git:github.com/bitmonk8/pi-config`, cloned to
`~/.pi/agent/git/github.com/bitmonk8/pi-config/`):

- `dd974d9` — rec J (Solution approach directional).
- `f10e3c1` — rec F (`Shape: multiple` cluster dispatch).
- `344da26` — rec K (cluster-importance aggregation).
- `8f0ccfe` — rec V (SP-2 Solution constraints advisory +
  three-mode authoring guard).
- `b20536d` — recs T + O + M + W (stage-transition refusal,
  shadow-budget gate, pre-dispatch staleness, CATEGORY tagging).
- `1c17d6d` — rec L (audit-side binding-surface ratification).
- `6e2c259` — rec P (decision-axes audit).
- `8e12608` — rec Z (CATEGORY split).
- `7005303` — rec AA (stage-3 oscillation detector).
- `122d896` — rec BB (origin grounding artefact persisted at
  dispatch; classifier reads it first).
- `c714cda` — rec HH (fixer grounded in origin artefact at every
  pass; refusal mode (i) drift-from-origin; OriginAlignment
  annotations).
- `8a07d70` — rec CC (orchestrator enforces must-precede at
  dispatch; orderingBlocked list; dispatch-ordering-blocked
  FailureMode).
- `83e4e65` — rec DD (auditor obligation-count vs score-budget
  pre-check, shipped as Pattern R).
- `b86b9f2` — rec EE (auditor uses-vs-defines discriminator for
  assumptions-lens predictions).
- `d2b32c3` — rec FF (fixer mode (h) no-new-normative-claim
  guard, origin-mandate-grounded via rec HH artefact).
- `0cf1338` — rec GG (in-loop approach-narrowing preserves
  OriginAlignment: forward fixes across mode (d) reverts).

Pi-loom — current state references:

- `docs/spec-review.md` — 5 finding H1s (T11a, T03a, T10, T07,
  T15b).
- `docs/spec-review-parked.md` — 19 H2 entries / 17 distinct
  findings (7 Category 1 / 0 Category 2 / 10 cascade per §2.1).
  Two H2 entries are stale duplicates (T18c × 2, T18a × 2)
  produced by the parker running twice on the same dispatch
  state; safe to deduplicate but not load-bearing.
- Cures banked since the prior meta-analysis revision: T02,
  T03c, T03f, T08a-c, T09, T11a, T11b, T11c, T12, T14, T16a,
  T18d, V6k.

Prior forensic sets (gitignored, retained for archaeological
context only):

- `.pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/`
- `.pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/`
- earlier 2026-05-15 → 2026-05-17 sets.

This document's history (recoverable via `git log
docs/spec-review-forensic-meta-analysis.md`). Prior revision
contained the W1/W2/W3 chronology and a per-commit
implementation ledger for recs L / P / Z / AA; both have been
dropped as no longer load-bearing.

End of meta-analysis.
