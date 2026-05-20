# Meta-analysis — spec fix-loop forensic state

```
PROJECT: pi-loom
SCOPE: current state of the spec fix-loop pipeline after the
       2026-05-20 /fix-spec-shape-single-findings validation run
       against the post-BB+HH+CC+DD+EE+FF+GG pi-config; what
       works now, what does not, and the next recommendation set.
INPUT: 4 forensic reports from dispatch run
       2026-05-20T06-38-04_bf2b2b under
       .pi/tmp/spec-fix-failure-forensics/:
         - t05-bind-frontmatter-vs-binder-...  (surface-expansion-irrecoverable-bimodal; CATEGORY 1)
         - t15a-reduce-session-model-...      (top-level-refused; CATEGORY 1)
         - t16e-pic-step-2-internal-...       (diverging; CATEGORY 2)
         - t18b-add-per-mode-operator-...     (dispatch-ordering-blocked; CATEGORY 1; parker refused)
       + docs/spec-review.md (15 active H1s) at HEAD
       + docs/spec-review-parked.md (4 distinct findings) at HEAD
       + pi-config at HEAD with all recs J..GG shipped
       + pi-loom commits 2026-05-20 (3 cures: T06, T13a, T13b;
         3 parks: T05, T16e+T16b cascade, T15a; 1 stuck: T18b)

HEADLINE: Recs BB+HH+CC ship and validate cleanly on the shapes
          they were authored against. The prior revision's
          umbrella pattern (the inner spec-diff-fix-loop runs
          unground) is closed: T06 cleared after two prior
          parks, with multiple inner-fixer mode-(i)
          drift-from-origin refusals visible in the loop NOTES
          confirming Rec HH grounding is wired through every
          pass. T13a → T13b sequenced correctly under Rec CC.
          These are unambiguous wins.

          The bottleneck has migrated again. Four new failure
          shapes dominate the current park set:

          1. **Parker contract gap on `dispatch-ordering-
             blocked` (HALTS THE OUTER LOOP).** Rec CC's
             pre-dispatch ordering check routes
             unresolved-must-follow cases with FailureMode
             `dispatch-ordering-blocked`. The
             `spec-review-parker` agent's contract does not
             enumerate this mode; the parker returns
             `STATUS: bad-input` and refuses to park. The
             orchestrator logs and continues per the bad-input
             documentation; the picker re-selects the same
             heading on the next iteration; the same-heading-
             twice-in-a-row guardrail fires; the outer loop
             terminates. In this run T18b triggered the gap
             and ten Shape: single findings above it
             (T11a, T03a, T10, T07, T15b, T03e, T03b, T03d,
             T18c, T18a — plus the four cluster findings
             T19a/b/d/e) never received a dispatch attempt.

          2. **Rec M trigger-phrase miss on content-level
             conditional ordering.** T15a's Solution constraint
             #3 — "If the Concurrency model subsection (owned
             by T15b) is absent from `## Extension
             Architecture` in `docs/spec.md` at edit time,
             defer" — encodes a structural-ordering
             prerequisite as a content-level conditional.
             None of Rec M's literal trigger phrases
             (`MUST have already landed`, `bottom-up ordering
             guarantees`, `lands first / last`, `after <ID>
             resolves`) match. The orchestrator's pre-dispatch
             check did not fire; the top-level fixer correctly
             deferred at dispatch time. Result: a clean
             top-level-refused park where a cheaper Rec M
             stale-precondition pre-park would have done the
             same work without invoking the fixer.

          3. **T05 bimodal surface-expansion despite Rec HH.**
             The originating Solution approach pinned a
             single-canonical-home design: extend the *Naming
             convention* paragraph in `frontmatter.md`; the
             glossary `**binder model**` entry is a
             back-reference and nothing more. The target
             paragraph already bundled four independently-
             testable obligations. A pass-1 traceability lens
             raised anchor-atomicity on the new fifth
             obligation; trust-override promoted the critique
             to fix-class; the inner fixer extracted the rule
             into a new sub-paragraph
             (`<a id="binder-model-root-word-delta">`),
             converting the design into no-canonical-home.
             Rec HH's drift-from-origin check did not fire
             because the extraction was a forward-direction
             change relative to the originating approach (it
             still implemented the per-surface mapping; it
             just relocated the owning anchor). Two
             consecutive surface-expansion poisonings then
             failed to converge.

          4. **T16e anchor-quality tail divergence (Category
             2).** The originating PIC step-2 contradiction
             was resolved on pass 1 (chose branch (b)
             snapshot-replaced, aligning four peer surfaces).
             The pass-2 reapplication minted a new precise
             cross-reference into `frontmatter.md` — a chunk
             never in the NarrowedChunks set. Pass-3 added
             `<a id="tools-ambient-not-inherited">`; pass-4
             added a sibling anchor `tools-empty-equivalence`;
             pass-5 raised two fresh traceability critiques
             on the just-added anchors. The traceability lens
             has a structural critique recursion on inline
             `<a id>` anchors in continuous-prose paragraphs
             (scope-bundling + terminus-ambiguity) and the
             fixer's "add one more anchor" repair pattern
             strictly grows the critique surface. Divergence
             detector tripped at pass 5. Rec T did not fire
             because the entire tail ran in stage 1.

PRIMARY WORK (priority order):
  1. Rec II — extend spec-review-parker contract to handle
     `dispatch-ordering-blocked` with a forensic-only branch
     (record the deferral in spec-review-forensic-analysis.md
     but do not physically move the finding out of
     spec-review.md). Critical: this is the only fix that
     unblocks the outer loop end-to-end. (pi-config)
  2. Rec JJ — picker becomes Rec-CC-aware so the loop does
     not need to round-trip through park-on-defer. When the
     bottom-up walk surfaces a candidate whose must-follow
     referent is unresolved, fall through to the
     next-eligible candidate in the same picker invocation.
     Pairs with Rec II — Rec II makes the failure safe; Rec
     JJ makes the success path one iteration instead of two
     per blocked finding. (pi-config)
  3. Rec KK — extend Rec M's pre-dispatch staleness check to
     match content-level conditional ordering patterns in
     `## Solution constraints` (e.g. `If the <X> subsection
     (owned by <FINDING-ID>) is absent ... defer`). (pi-config)
  4. Rec LL — pre-dispatch lint for single-canonical-home
     Solution approaches against multi-obligation target
     paragraphs (T05-class structural ambiguity); routes to
     HUMAN_REVIEW with the recommendation to pre-author the
     sibling-anchor extraction at top-level rather than
     forbid it. (pi-config; auditor)
  5. Rec MM — transitive narrowing of chunks reached by
     fix-minted cross-references; pairs with a per-pass
     hold-down on tier-1 traceability critiques of inline
     `<a id>` anchors added in the immediately-prior pass
     (T16e-class). (pi-config; inner loop + classifier)
  6. Per-finding reshapes for T05 (reshape the Solution
     approach to pre-author the sub-anchor structure
     top-level so the traceability critique has nothing to
     extract). (pi-loom)

GENERATED: 2026-05-20T14:00:00Z
           Document rewritten from the post-BB+HH+CC validation
           perspective. The pre-validation chronology and the
           per-rec L/P/Z/AA implementation ledger from prior
           revisions have been collapsed into §1 and §2.2 —
           those recs are working as designed and their
           per-rec ledger is recoverable via this file's git
           log.

IMPLEMENTATION STATUS (as of 2026-05-20T16:00, post-implementation):
  All pi-config recommendations from the prior revision
  (BB, HH, CC, DD, EE, FF, GG) shipped. Validation outcome:
  unambiguous wins on T06 (BB+HH), T13a → T13b (CC); four
  new failure shapes surfaced in the same run. No prior
  rec is observed to regress.

  The new rec set (II, JJ, KK, LL, MM) is the response to
  the validation evidence. **All five shipped to pi-config
  main on 2026-05-20** (commit `dae833a` — single commit
  bundling all five for atomic integration; per-rec SHAs
  are not split because II + JJ must ship together for
  the parker / picker / orchestrator contracts to align,
  and the auditor / classifier additions are independent
  but small). None of the new recs revert any prior rec;
  they layer on top.

  The most critical new rec was II (parker contract gap).
  Without it the outer loop halted on the first
  Rec-CC-routed finding and the visible blast radius of
  the gap was large — in the validation run, ten Shape:
  single findings above T18b were unreachable.

  VALIDATION (next): the four findings parked in the
  2026-05-20 validation run (T05, T16e, T16b cascade, T15a)
  have been unparked into `docs/spec-review.md` so the next
  `/fix-spec-shape-single-findings` run validates the new
  rec set end-to-end. Expected behaviour:
  - Rec II + JJ: T18b dispatches cleanly once T18a lands
    (the picker's Rec-CC-aware walk skips T18b and surfaces
    T18a first; the orchestrator does not halt).
  - Rec KK: T15a is pre-parked as stale-precondition before
    the top-level fixer dispatches, saving one fixer call.
  - Rec LL: T05 is flagged Pattern S at audit time;
    pre-dispatch reshape is recommended. Pending a re-audit
    pass, T05 may still surface-expand on dispatch — the
    test is whether Pattern S routes to HUMAN_REVIEW before
    the dispatch attempt.
  - Rec MM: T16e's PIC step-2 fix should converge without
    the anchor-quality tail divergence (Part 1 auto-narrows
    `frontmatter.md`'s tools chunk on pass 2 when the
    pass-1 fix mints the cross-reference; Part 2 defers
    the pass-3 / pass-4 anchor critiques as cooldown).
```

---

## 1. Outcome of the prior recommendations

The prior revision shipped seven pi-config recs (BB, HH, CC,
DD, EE, FF, GG) on top of the earlier pipeline (J, F, K, V,
T, O, M, W, L, P, Z, AA). The 2026-05-20T06-38-04_bf2b2b run
was the first end-to-end validation dispatch with the full
new stack in place.

### 1.1 Pi-config recommendations — validation outcomes

| Rec | Worked against | Status |
|---|---|---|
| **BB** — origin grounding artefact persisted at dispatch | T06 (was parked under heading-absent S=25 default in two prior runs) | **Worked.** T06 cleared on dispatch with `ORIGIN_SCORE: 100` threaded through every pass of the inner loop. The classifier reported the artefact-resolved score consistently across 6 passes; the prior heading-absent default never triggered. |
| **HH** — fixer grounded in origin artefact each pass | T06, T13a, T13b | **Worked.** T06's loop NOTES record 24 deferred findings against the `glossary#operator` chunk across passes 3+4+5+6, all auto-deferred via Rec HH drift-from-origin. T13a's loop records 1 mode-(i) refusal correctly rejecting an L77 edit (T13b territory). T13b's loop records a clean mode-(f-stop-3) authorisation of the diagnostics.md L394 noun synchronisation under SP-2 mode-(f) sub-case 3. The grounding context is being read and acted on every pass. |
| **CC** — orchestrator enforces must-precede at dispatch | T13a → T13b | **Worked for the success path.** Picker selected T13a after the orchestrator pre-check skipped T13b on its first surface (T13b's must-follow on T13a was unresolved). After T13a resolved, T13b became dispatchable; on the next picker call it was selected and processed cleanly. Pair sequenced correctly in one outer-loop session. **The failure-path integration is broken** — see §4.1 below. |
| **DD** — auditor obligation-count Pattern R | (no auditor stage in this dispatch run) | Not exercised. The dispatch path bypasses the auditor; rec DD will validate on the next `/spec-review-audit` invocation. |
| **EE** — uses-vs-defines on assumptions-lens | T13a's defining-clause approach | **Worked indirectly.** T13a's pass-1 raised 1 high + 3 medium + 1 low spec-content findings, all of which were fixed except one which Rec HH mode-(i) refused as T13b territory. No false-positive PASS on a "uses but does not define" finding was observed. |
| **FF** — mode (h) no-new-normative-claim guard | (no pass-2 over-correction in this run) | Not exercised. The T05 / T18c shapes that would have tested it did not arise — T05 failed via surface-expansion (§4.3) before any pass-2 normative invention reached the guard; T18c never dispatched (parker gap halted the loop). |
| **GG** — narrowing preserves OriginAlignment: forward fixes | T16e (pass-2 narrowing on PIC chunk) | **Worked for the narrowing-revert facet.** T16e's loop NOTES record pass-2's rec-GG forward-preservation re-applying the pass-1 branch-(b) edit on top of the mode-(d) revert. The failure was downstream of where GG operates (§4.4 below). |

The grounding-substrate cluster (BB + HH) is the workhorse of
the new stack. Every cured finding in this run carries
grounding evidence in its loop NOTES. The prior revision's
umbrella pattern — the inner loop runs unground — is closed.

### 1.2 Pi-loom finding work — validation outcomes

The §2.1 unparking batch (17 findings: 7 direct + 10
cascade) was the validation set for BB+HH+CC. Dispatch
results:

- **Cleared (3):** T06, T13a, T13b.
- **Re-parked under a new mode (1):** T05 →
  `surface-expansion-irrecoverable-bimodal` (was
  `must-fix-blocked` before). Different shape, same
  finding; see §4.3.
- **Re-parked under the same mode (1):** T15a →
  `top-level-refused` (same mode as before, but now the
  orchestrator's Rec M pre-check should have caught it; see
  §4.2).
- **Newly direct-parked (1):** T16e → `diverging` (Category
  2). Was cascade-parked previously; now a direct park with
  a different root cause (§4.4).
- **Newly cascade-parked (1):** T16b cascaded behind T16e
  (its must-precede prerequisite).
- **Unaddressed (10):** T11a, T03a, T10, T07, T15b, T03e,
  T03b, T03d, T18c, T18a — plus T19a/b/d/e — never received
  a dispatch attempt this session because the outer loop
  halted on the parker contract gap (§4.1).

Cures banked since the prior meta-analysis revision (across
2026-05-20 commits, both reshaped pre-existing parks and
fresh dispatch successes): **T06, T13a, T13b**, plus
**T09, T18d, T11b, V6k, T03c, T03f** from earlier 2026-05-20
commits. The cumulative cure count since the prior revision
is ~9 findings, against ~4 re-parks and ~10 unaddressed-this-
session.

**Lesson.** The reshape strategy from the prior revision was
correct: split multi-axis findings, author missing
prerequisites, restore true metadata. Recs BB+HH+CC vindicate
that strategy by surviving past the first dispatch (Rec BB
preserves metadata across H1-strip; Rec HH grounds the fixer
every pass; Rec CC orders prerequisite-bearing pairs). The
remaining park set is now smaller, and the new failure shapes
are sharper to characterise than the old umbrella pattern was.

---

## 2. Current state

### 2.1 Parked findings (4 distinct findings / 4 dispatch units)

The complete park set as of HEAD, per `docs/spec-review-parked.md`:

| Category | Distinct findings | Dispatch units | Findings |
|---|---:|---:|---|
| **Category 1** (malformed finding) | 2 | 2 | T05 (single-canonical-home), T15a (deferred-precondition) |
| **Category 2** (fixer too-hard) | 1 | 1 | T16e (anchor-quality tail divergence in unnarrowed chunk) |
| **Cascade** (upstream-bound) | 1 | 1 | T16b (← T16e must-precede) |
| **Total** | **4** | **4** | |

Down from the prior revision's 17 distinct findings / 12
dispatch units. Net change: **-13 distinct parks** after the
BB+HH+CC validation pass (with the caveat that 10 findings
unparked into spec-review.md never got a dispatch attempt
this session; the true net will be visible on the next run).

The active `docs/spec-review.md` holds **15 H1s**: T11a,
T03a, T10, T07, T15b, T03e, T03b, T03d, T18c, T18a, T19a,
T19b, T19d, T19e, T18b. Of those, T18b is the head of the
stuck-pipeline gap (§4.1) — the bottom-up picker keeps
selecting it; Rec CC keeps blocking; the parker keeps
refusing to park; the same-heading-twice guardrail keeps
breaking the loop before any of the 14 findings above T18b
can be addressed.

### 2.2 Shipped pipeline mechanisms

These recs are in production. They are the substrate the §4
failure patterns and the §5 recommendations layer on top of.

| Rec | What it does | Validation status |
|---|---|---|
| **J** | Solution approach is directional, not binding. Inner-fixer mode `(d) approach-narrowing`. | Working |
| **F** | `Shape: multiple, State: reduced` cluster dispatch. | Not exercised this run |
| **K** | Cluster-importance aggregation: cluster S = max(member S). Heading-absent fallback defaulted to medium / S=25 before rec BB. | Default path now superseded by rec BB |
| **V** | Solution constraints advisory; fifth narrowing check; inner-fixer mode `(f)` with sub-modes `(f-stop-1/2/3)`. | Working (T13b mode-(f-stop-3) clearance) |
| **T** | Stage-transition structural-growth refusal. Mode `(e)` fires on stage-2/3 fixes adding `<a id`, `> **`, `^### `, or `**Label.**` markers to tier-1-clean chunks. | Working but did not fire on T16e (whole tail was stage-1) |
| **O** | Pass-level shadow-budget gate (rule a-bis), k=3. Sub-rationale `score-budget-exhausted-trust-override-suppressed`. | Working but no longer the dominant exit (BB closed the heading-absent default that surfaced O's strictness as a problem) |
| **M** | Pre-dispatch precondition staleness check. Lexical match against trigger phrases. | Working but misses content-level conditional patterns (§4.2) |
| **W** | CATEGORY field threaded across loop output, classifier `_blocked.md`, forensics TL;DR, parker reasons. | Working |
| **L** | Audit-side binding-surface ratification (four rationales → HUMAN_REVIEW / AUTO_RESHAPE). | Working |
| **P** | Decision-axes Problem-metadata + score-vs-residue audit. | Working |
| **Z** | `surface-expansion-irrecoverable` CATEGORY split into `-bimodal` (Category 1) and `-cycle` (Category 2). | Working (T05 correctly tagged `-bimodal` / Category 1 this run) |
| **AA** | Stage-3 prose-quality oscillation detector; inner-fixer mode `(g) stage3-naming-cycle`. | Not exercised this run |
| **BB** | Origin grounding artefact persisted at dispatch (`.pi/tmp/spec-fix-loop/<RUN_ID>/_origin/`); classifier reads it first. | **Validated** (T06 cure) |
| **HH** | Fixer grounded in origin artefact every pass; new refusal mode `(i) drift-from-origin`; OriginAlignment annotations on applied fixes. | **Validated** (T06, T13a, T13b cures with multiple mode-(i) refusals) |
| **CC** | Orchestrator enforces must-precede at dispatch; new `orderingBlocked` list; `dispatch-ordering-blocked` FailureMode. | **Success path validated** (T13a → T13b); **failure path broken** by parker contract gap (§4.1) |
| **DD** | Auditor obligation-count vs score-budget pre-check, shipped as Pattern R. | Not exercised this run |
| **EE** | Auditor uses-vs-defines discriminator for assumptions-lens predictions. | Working indirectly |
| **FF** | Fixer mode `(h) over-correction-new-normative-claim`, origin-mandate-grounded via rec HH. | Not exercised this run |
| **GG** | In-loop approach-narrowing preserves `OriginAlignment: forward` fixes across mode-(d) reverts. | Working (T16e pass-2 forward-preservation) |

### 2.3 Outer-dispatch outcome (current run)

| Run | Cures (spec-edit commits) | Direct parks | Cascade parks | Stuck (orderingBlocked, no park) |
|---|---|---|---|---|
| `2026-05-20T06-38-04_bf2b2b` | 3 (T06, T13a, T13b) | 3 (T05, T16e, T15a) | 1 (T16b ← T16e) | 1 (T18b) |

The 3-cure / 3-park / 1-stuck ratio is much healthier than
the prior revision's 0-cure / 5-direct-park / 9-cascade
ratio. The grounding substrate (BB+HH) is doing the work it
was designed to do. The new failures concentrate in narrower
surfaces than the umbrella the prior revision named, which is
the expected outcome of a substrate fix: the underlying
mechanism that masked many distinct defects under one
attribution (the heading-absent default) is gone, and the
distinct defects are now individually visible.

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
categories (unchanged from the prior revision):

- **Category 1 — malformed finding.** Wrong on at least one
  binding surface: Problem, Score, Ordering edges, or
  Missing-prerequisite. Solution approach (rec J) and Solution
  constraints (rec V) are *advisory*. The finding-authoring
  layer's response is to delete, split, merge, reorder,
  reformulate the Problem, raise the score, repair the
  ordering edges, or author the missing prerequisite.

- **Category 2 — fixer too-hard.** The finding is well-formed
  on every binding surface but the fixer's current capability
  cannot execute the edit. The pi-config side responds by
  extending the fixer.

The four new failure shapes split cleanly on this cut:

- **T05 single-canonical-home over multi-obligation target
  (§4.3) — Category 1.** The Solution approach pins a shape
  the corpus structurally cannot host without producing the
  exact lens-finding the originating approach was designed
  to avoid. The Approach is advisory under rec J, but the
  constraint that forbade the alternative (a sibling-anchor
  extraction) is binding under rec V, leaving the fixer no
  navigable shape. This is a finding-authoring defect: the
  approach should have *pre-authored* the sibling-anchor at
  top-level rather than forbid extracting one, OR raised the
  score to budget the multi-obligation attention.

- **T15a deferred-precondition (§4.2) — Category 1.** The
  finding's binding surface is the Relationships-block /
  Solution-constraint cluster encoding ordering. The fixer's
  refusal is the correct response. The defect is at the
  *dispatcher* — picker selected a finding with an
  unresolved prerequisite, and the orchestrator's Rec M
  pre-check did not catch the prerequisite because the
  encoding fell outside its trigger-phrase grammar. The fix
  is on the dispatcher (Rec KK in §5.3).

- **T16e anchor-quality tail divergence (§4.4) — Category
  2.** The originating finding is well-shaped and was
  resolved correctly on pass 1. The downstream loop diverged
  on a structural recursion the fixer has no capability to
  exit (the only available repair pattern strictly grows the
  critique surface). The fixer needs a new capability
  (`(g) anchor-topology-restructure` per the T16e forensic,
  embedded in Rec MM at §5.5).

- **T18b parker contract gap (§4.1) — neither Category 1
  nor Category 2 at the *finding* level.** T18b is
  well-shaped; T18a is well-shaped; the must-follow edge is
  authored correctly; Rec CC fired correctly. The failure is
  a pipeline integration gap between two agents whose
  contracts were updated independently. This is the
  pi-config-side equivalent of a missing schema migration.

The three structural extensions to the cut from the prior
revision remain valid: dispatcher is part of the
finding-authoring layer; the inner spec-diff-fix-loop's
grounding is the substrate for every fixer decision (now
provided by rec BB+HH); the classifier's heading-absent
default is no longer the dominant failure mode (rec BB closed
it).

A fourth extension surfaces from the current run:

- **Inter-agent contracts inside the pipeline are part of the
  finding-authoring layer.** Rec CC's `dispatch-ordering-
  blocked` FailureMode is a token the orchestrator emits and
  the parker is supposed to consume. When the token's set is
  extended on one side without the other, the integration
  silently breaks — visible at outer-loop level as the
  parker returning `STATUS: bad-input` and the
  same-heading-twice guardrail firing. The fix (Rec II) is
  a contract extension, not a fixer-capability change.

## 4. Failure patterns in the current park set

Each pattern is named, scoped to the parks it explains, and
linked to the rec that closes it.

### 4.1 Parker contract gap on `dispatch-ordering-blocked` (1 finding stuck; halts the outer loop)

Rec CC's pre-dispatch ordering check (pi-config `8a07d70`)
introduced a new FailureMode `dispatch-ordering-blocked` for
the case where the picked finding's `## Relationships` block
declares a `must-follow` edge on a sibling that is still
live in `docs/spec-review.md`. The orchestrator's intended
sequence (per the `commands/fix-spec-shape-single-findings.md`
prompt) is:

1. Skip the top-level fixer.
2. Dispatch `spec-fix-failure-forensics` with `Status:
   dispatch-ordering-blocked`.
3. Dispatch `spec-review-parker` with `FailureMode:
   dispatch-ordering-blocked`.
4. Commit the parking edits per step 3e.

Steps 1 and 2 work as designed. Step 3 fails: the
`spec-review-parker` agent's contract enumerates eleven
FailureMode values and `dispatch-ordering-blocked` is not
among them. The parker returns `STATUS: bad-input` with a
NOTES paragraph explaining that physically removing the
healthy finding from `spec-review.md` would be actively
harmful (T18b becomes dispatchable once T18a lands) and
recommending the orchestrator skip-and-re-pick.

The orchestrator's bad-input branch (step 3d) is documented
to: log a NOTES line, skip step 3e (no commit), continue,
and rely on the same-heading-twice guardrail to break the
loop if the picker re-selects the same finding. In practice
this is exactly what happens:

- Iteration N: picker selects T18b → Rec CC blocks → parker
  refuses → continue.
- Iteration N+1: picker selects T18b again (it is still the
  bottom-most heading; nothing changed) → same-heading-twice
  fires → outer loop terminates with T18b appended to
  `failed`.

Consequence in this run: ten Shape: single findings above
T18b in `spec-review.md` (T11a, T03a, T10, T07, T15b, T03e,
T03b, T03d, T18c, T18a — plus the four T19 cluster findings)
were never dispatched. The throughput cost is large.

**Closes:** Rec II (§5.1) extends the parker contract with
a forensic-only branch (record the deferral in
`docs/spec-review-forensic-analysis.md` without moving the
finding). Rec JJ (§5.2) is the picker-side companion that
converts the two-iteration round-trip into a single
iteration by falling through to the next eligible candidate
in the same picker invocation.

### 4.2 Rec M trigger-phrase miss on content-level conditional ordering (T15a)

T15a parked top-level-refused for the second consecutive
run. The top-level fixer's deferral is correct — Solution
constraint #3 explicitly directs deferral when the
`Concurrency model` subsection (owned by T15b) is absent
from `## Extension Architecture` in `docs/spec.md`, and at
dispatch time both the subsection is absent and T15b is
unresolved.

The defect is upstream of the fixer, in the orchestrator's
Rec M pre-dispatch staleness check. Rec M's trigger-phrase
grammar matches lexical forms (`MUST have already landed`,
`bottom-up ordering guarantees`, `lands first / last`,
`after <ID> resolves`, etc.) but does not match content-level
conditional encodings of the same prerequisite. T15a's
constraint #3 phrases the ordering as a *content* check —
"if the named subsection is absent, defer" — rather than as
a *structural* claim about heading positions or resolution
order.

Three independent encodings cover the same prerequisite
shape, and Rec M only catches one:

| Encoding | Example | Rec M catches |
|---|---|---|
| Relationships block edge | `- T15b "..." — must-follow` | Yes (via Rec CC, not Rec M) |
| Constraint structural prediction | `MUST have already landed`; `after T15b resolves` | Yes |
| Constraint content conditional | `If the <subsection> (owned by T15b) is absent, defer` | **No** |

The miss is not severe — the top-level fixer's deferral is
the correct outcome and produces an actionable
top-level-refused park — but the cost is one extra fixer
dispatch per such finding and the user-facing surface treats
"orchestrator pre-park" and "top-level-refused park"
differently in the summary.

**Closes:** Rec KK (§5.3) extends Rec M's trigger set with a
content-conditional pattern matcher targeting the
"If `<subsection or file region>` ... defer" shape, with
the named finding's resolution status as the predicate.

### 4.3 Single-canonical-home Solution approach over multi-obligation target paragraph (T05)

T05's Solution approach pinned a single-canonical-home
design: extend the *Naming convention* paragraph in
`frontmatter.md` with one sentence pinning the `bind_` ↔
`binder` root-word delta; add a `**binder model**` glossary
entry whose body is a back-reference and nothing more.

The target *Naming convention* paragraph already bundled
four independently-testable obligations:

1. `argument-hint` hyphen rule.
2. `argument_hint:` unknown-field rule.
3. No-`name` rule.
4. Deferred-field warning rule.

Adding a fifth obligation under the same `<a id="naming-
convention">` anchor immediately attracted a pass-1
traceability lens finding (fix-06-traceability,
trust-overridden) on anchor atomicity. The inner fixer
answered by extracting the new sentence into its own
`<a id="binder-model-root-word-delta">` sub-paragraph,
satisfying the atomicity finding. The originating Solution
constraint forbade restating the convention in the glossary
entry, but the constraint did NOT forbid extracting the
convention into a *sibling anchor*. Pass-1's extraction was
a forward-direction change relative to the originating
approach (it still implemented the per-surface mapping; it
just relocated the owning anchor), so Rec HH's
drift-from-origin check did not fire.

The extraction converted the design from
single-canonical-home into two viable owners of the
per-surface mapping (the original paragraph and the new
sub-paragraph). Pass-2's consistency lens forced a choice
(re-point the glossary at the new sub-paragraph;
fix-01-consistency) and pass-3's lenses began critiquing
the new sub-paragraph directly (surface-category count
mismatches, "illustrative not exhaustive" hedge ambiguity,
casing-rule gaps). Surface-expansion trigger 1 fired at
pass 4 (scoreSum 26 > 1.5 × 11). The loop poisoned
spec-lens-completeness:02 and rewound. On the rerun,
trust-override on tier-1 lenses kept three of the
structurally-equivalent findings as fix-class regardless of
the poisoned-fix exclusion — the structural ambiguity, not
the reframe, was the load-bearing defect. Surface-expansion
trigger 2 fired and the loop exited
`surface-expansion-irrecoverable-bimodal`.

Two characteristics make this pattern visible from
authoring-time signals:

1. The Solution approach contains an "extend the *X*
   paragraph" or "the *X* paragraph is the single canonical
   home" phrasing.
2. The target paragraph already bundles ≥4 independently-
   testable normative obligations (heuristic: distinct
   `MUST` / `SHALL` / `→ <diagnostic>` clauses, or distinct
   bold-labelled sub-claims, or distinct numbered list items
   under the same anchor).

When both conditions hold, the traceability lens
predictably raises anchor-atomicity on the new obligation,
the fixer predictably extracts (because extraction is
forward-aligned with the approach), and the design
predictably enters no-canonical-home.

**Closes:** Rec LL (§5.4) adds a pre-dispatch lint on this
exact shape, routing to HUMAN_REVIEW with the recommendation
to pre-author the sibling-anchor at top-level rather than
forbid it. Rec HH's drift-check cannot close it because the
extraction is forward-aligned by Rec HH's definition; the
gap is at the auditor / picker layer.

### 4.4 Anchor-quality tail divergence in unnarrowed chunk (T16e; Category 2)

T16e's originating contradiction (PIC step 2 literal call vs
natural-language gloss) was resolved correctly on pass 1
(branch (b), snapshot-replaced). Pass-1 outcome is what the
spec ships today; verified post-failure.

The loop diverged in a downstream tail unrelated to the
originating contradiction. Pass-2's branch-(b) re-application
under Rec GG forward-preservation minted a new precise
cross-reference into `frontmatter.md` — `"ambient tools are
not inherited" invariant cites [frontmatter.md#tools]`. The
`#tools` fragment resolved to nothing (no `<a id="tools">`,
no `## tools` heading). Pass-3 added
`<a id="tools-ambient-not-inherited">` so the citation could
resolve. The `frontmatter.md` `tools:` bullet is a
continuous-prose paragraph packing four independently-
testable obligations:

1. Pi's ambient tools are deliberately not inherited.
2. To opt in, list each callable explicitly.
3. `tools: []` and an absent `tools:` field are equivalent.
4. The runtime mechanism is specified in PIC.

The traceability lens then raised pass-4 Finding C (anchor
over-covers two obligations). The fixer responded by adding
a sibling anchor (`<a id="tools-empty-equivalence">`).
Pass-5 raised two fresh anchor critiques on the just-added
anchors (over-coverage again with a third anchor proposed;
"no structural terminus" critique applied to the new
anchor). Divergence detector tripped (fixCount 1→2 across
pass-4 → pass-5).

Two mechanisms compose to produce the divergence:

1. **`frontmatter.md` was never in NarrowedChunks.** The
   originating finding's narrowed chunk was
   `pi-integration-contract.md#tool-registration-lifetime-
   and-visibility`. The cross-reference into `frontmatter.md`
   was an emergent side-effect of the pass-1 fix's
   no-inheritance alignment; the loop's narrowing mechanism
   has no rule that auto-narrows chunks transitively reached
   by fix-minted cross-references. Pass-3's anchor edit and
   every downstream critique landed on an unnarrowed chunk
   under trust-override rules, which the b-bis backstop
   could not deflect.

2. **Traceability-lens anchor-critique recursion.** The
   lens's structural critique on inline `<a id>` anchors in
   continuous-prose paragraphs (scope-bundling +
   terminus-ambiguity) is a closed cycle when the fixer's
   only repair pattern is "add one more anchor": every new
   anchor adds two new surfaces for the same lens to
   critique.

Rec T (stage-transition structural-growth refusal) did not
fire because the entire tail ran in stage 1 — Rec T scopes
to stage-2 / stage-3 transitions onto tier-1-clean chunks,
not to stage-1 emergent fan-out into untracked chunks.

**Category 2.** The originating finding is well-shaped and
its core resolution is stable; the loop lacks a capability
(transitive narrowing of fix-reached chunks; anchor-add
cooldown; restructure-vs-add-more repair selection) to
converge the downstream tail.

**Closes:** Rec MM (§5.5) pairs transitive narrowing with a
per-pass hold-down on tier-1 traceability critiques of
just-added anchors, with an optional `(g) anchor-topology-
restructure` fixer mode that converts continuous-prose
paragraphs into bold-label sentences when the
anchor-critique recursion has fired twice within three
passes. The T16e forensic enumerates these as RP-1 / RP-2 /
RP-3.

### 4.5 Patterns now closed by shipped recs (preserved for context)

The following patterns from the prior revision are closed by
the BB+HH+CC stack and no longer appear as root causes in
the current park set:

- **§4.1 (prior) Inner loop runs unground** — closed by BB+HH.
- **§4.2 (prior) Heading-absent metadata default** — closed
  by BB.
- **§4.3 (prior) Dispatch-ordering violation** — closed by
  CC's success path (the failure path needs Rec II + JJ; see
  §4.1 above for the new manifestation).
- **§4.4 (prior) Scope-guard vs raised-severity collision**
  — closed by BB (the heading-absent S=25 was the
  contributing factor that surfaced the collision on
  not-intrinsically-malformed findings).
- **§4.5 (prior) In-loop approach-narrowing reverts pass-1
  fixes** — closed by GG (validated in T16e pass-2).
- **§4.7 (prior) Defer-on-permanently-unresolvable sibling
  (T15a)** — partially closed by CC; the residual is the
  encoding gap in §4.2 above (Rec M trigger phrases miss
  T15a's content-conditional form), addressed by Rec KK.
- **§4.8 (prior) Pass-2 over-correction** — was modelled as
  closed by HH+FF; not exercised this run (T05 failed via
  surface-expansion before pass-2 over-correction could
  fire; T18c never dispatched). The closure prediction is
  not yet validated; revisit after Rec II ships.

The audit-vs-actual gap (prior §4.6) is closed in principle
by DD+EE but not exercised on dispatch paths; revisit on the
next `/spec-review-audit` invocation.

## 5. Recommendations

Five pi-config recommendations + per-finding reshape for T05.
No architectural / finding-shape principle changes are
outstanding — the §3 cut still holds.

Rec letters (II, JJ, KK, LL, MM) are the next stable
identifiers after HH in the pi-config sequence.

### 5.1 Rec II — Parker contract handles `dispatch-ordering-blocked` (pi-config)

**Status: IMPLEMENTED** (pi-config `dae833a`, 2026-05-20).

Closes §4.1 (T18b stuck; outer-loop halt on every
Rec-CC-routed finding). This is the highest-priority new rec
because the gap halts the outer loop end-to-end on the first
finding it touches.

The parker's principled refusal to physically move a healthy
finding is correct (the T18b forensic and the parker's own
NOTES both make this argument). The right fix is a
contract extension that gives the parker a no-op-but-record
branch for this specific FailureMode.

**Mechanism:**

- Extend `agents/spec-review-parker.md`'s FailureMode
  enumeration to include `dispatch-ordering-blocked` (and
  `dispatch-ordering-blocked-cycle`, the deadlock variant
  rec CC emits when must-follow forms a cycle).
- For these two modes, the parker does NOT remove the
  finding from `docs/spec-review.md`. It DOES write a
  short TL;DR entry to `docs/spec-review-forensic-
  analysis.md` recording: the picked heading, the blocking
  must-follow referent, the absolute path of the gitignored
  forensic report, and a recurrence prediction (the
  blocked finding becomes dispatchable on the iteration
  after its prerequisite resolves).
- Parker output:
  - `CLUSTER_MODE: no` (no cluster involvement)
  - `DIRECT_COUNT: 0` (no findings moved)
  - `PARKED: none`
  - `PARKED_COUNT: 0`
  - `STATUS: ok`
  - `NOTES: deferral-only park; T18b retained in
    spec-review.md per <must-follow-edge>; recurrence
    expected on next iteration unless prerequisite lands.`
- The orchestrator (`commands/fix-spec-shape-single-
  findings.md`) extends step 3e's commit logic to handle
  the `PARKED_COUNT: 0` case: commit only
  `docs/spec-review-forensic-analysis.md` (not
  `docs/spec-review-parked.md`, which was not touched).
  Commit message form:
  `<commitPrefix> spec-review: defer "<short slug>"
  (dispatch-ordering-blocked, awaiting <prereq-heading>)`.

**Files changed (pi-config):**
`agents/spec-review-parker.md` (FailureMode enum
extension; new deferral-only branch in the parker's edit
logic; output contract update for `PARKED_COUNT: 0`),
`commands/fix-spec-shape-single-findings.md` (commit
message form for the deferral-only case). ~25 lines total.

**Pairs with Rec JJ** to reduce the per-blocked-finding
iteration cost from 2 → 1 outer loops.

### 5.2 Rec JJ — Picker is Rec-CC-aware (pi-config)

**Status: IMPLEMENTED** (pi-config `dae833a`, 2026-05-20).

Closes the two-iteration round-trip cost of §4.1 (T18b
deferral). Optional but high-value once Rec II ships.

Today the bottom-up picker has no view of
`## Relationships`; it walks the doc and surfaces the
bottom-most eligible heading. Rec CC runs in the
orchestrator AFTER the pick. The result is that every
Rec-CC-routed finding consumes one outer-loop iteration
for the parker-deferral round-trip before the next
iteration's picker call can surface the prerequisite.

**Mechanism:**

- Extend `agents/spec-review-shape-single-picker.md` (or its
  equivalent selector in `commands/fix-spec-shape-single-
  findings.md`) to parse each candidate's `## Relationships`
  block while walking bottom-up. When the bottom-most
  candidate's `must-follow` referents are all unresolved in
  the live `docs/spec-review.md`, the picker falls through
  to the next-eligible candidate in the same invocation.
- The picker's output gains an optional explanatory tail:
  `SKIPPED: <heading> (must-follow <prereq-heading>
  unresolved)` for each skip, before the final selection.
  Forensic visibility is preserved; the orchestrator can
  surface the skip list in the summary if it chooses.
- When ALL candidates have unresolved must-follow targets
  (deadlock or document fully blocked), the picker emits
  `BLOCKED: <enumerate skipped headings>` and the
  orchestrator routes to the deadlock handler in Rec CC.

**Files changed (pi-config):**
`agents/spec-review-shape-single-picker.md` (~30 lines for
the Relationships-aware walk).

The T18b forensic explicitly flags this as a design
trade-off (forensic visibility vs throughput) and
recommends against it absent throughput evidence. The
evidence is now in: this run halted on the first Rec-CC
blockage with 10 unprocessed findings above it. Rec JJ is
warranted.

### 5.3 Rec KK — Rec M matches content-level conditional ordering (pi-config)

**Status: IMPLEMENTED** (pi-config `dae833a`, 2026-05-20).

Closes §4.2 (T15a top-level-refused round-trips through the
fixer when Rec M should have pre-parked at the orchestrator).

**Mechanism:**

- Extend Rec M's trigger-phrase grammar in
  `commands/fix-spec-shape-single-findings.md` to include a
  content-conditional pattern matcher. The shape to detect:
  `If the <noun-phrase> (owned by <FINDING-ID>) is absent
  ... defer` or `If <FINDING-ID> has not landed ... defer`,
  with `<FINDING-ID>` matching `[A-Z][0-9]+[a-z]*[0-9]*`.
- When matched, verify the predicate against current
  `<specReviewPath>` state: grep for the named finding's H1.
  If present (unresolved), treat as stale-precondition
  (route to parking pre-dispatch per Rec M's existing
  routing). If absent (resolved), the condition is
  satisfied — fall through to dispatch.
- Document the new pattern alongside Rec M's existing
  trigger list with worked examples (T15a's constraint #3
  is the canonical example).

**Files changed (pi-config):**
`commands/fix-spec-shape-single-findings.md` (~15 lines for
the new pattern + documentation).

The cost saving per such finding is one top-level fixer
dispatch (~minutes of LLM time); the user-facing benefit is
that the summary's `staleConstraints` list correctly
captures the case rather than burying it in `failed`.

### 5.4 Rec LL — Single-canonical-home over multi-obligation target lint (pi-config + auditor)

**Status: IMPLEMENTED** (pi-config `dae833a`, 2026-05-20).

Closes §4.3 (T05 bimodal surface-expansion). The pattern is
detectable at authoring/audit time; the fixer side cannot
close it because the extraction is forward-aligned with the
approach (Rec HH's drift-check by construction does not
fire on forward-direction edits).

**Mechanism:**

- Extend `agents/spec-review-auditor.md` with a new
  finding-shape pattern (call it Pattern S, following Rec
  DD's Pattern R). Trigger:
  - Solution approach contains the phrase shape "extend the
    *X* paragraph (at `path:line`)" OR "the *X* paragraph
    is the single canonical home" OR equivalent
    pinning-phrasing for a named existing paragraph.
  - AND that paragraph at `path:line` already bundles ≥4
    independently-testable normative obligations
    (heuristic: count distinct `MUST` / `SHALL` /
    `→ <diagnostic>` clauses; distinct bold-labelled
    sub-claims; distinct numbered list items under the
    same anchor — sum ≥4).
- Audit routing: `Overall risk: HIGH`,
  `Recommended action: HUMAN_REVIEW`, rationale
  `home-paragraph-saturation`. Recommendation text:
  pre-author the sibling-anchor extraction at top-level in
  the Solution approach (so the fixer authors the new
  anchor as a direct implementation step rather than
  reacting to a traceability critique), OR raise the score
  to budget the multi-obligation attention, OR split the
  finding into per-obligation atoms.
- The lint runs alongside the per-lens predictions, not
  instead of them, and is precondition-cheap: one grep per
  finding's named target paragraph.

**Files changed (pi-config):**
`agents/spec-review-auditor.md` (~30 lines for Pattern S
detection + the worked example).

Rec LL does NOT change the fixer side. The corresponding
fixer-side change would be Rec HH's drift-check learning to
treat "extraction into a forbidden-sibling-anchor" as a
drift signal even when forward-aligned — but encoding that
requires the auditor to surface the constraint that "no
sibling extraction" was *implicit* in the approach's
single-canonical-home framing, which is too subtle for the
fixer to derive from the artefact text alone. The audit
layer is the right place to catch it.

### 5.5 Rec MM — Transitive narrowing + anchor-add cooldown (pi-config)

**Status: IMPLEMENTED** (pi-config `dae833a`, 2026-05-20). Parts 1
+ 2 shipped; Part 3 (the optional `(g) anchor-topology-restructure`
fixer mode) NOT shipped — the meta-analysis recommended validating
Parts 1 + 2 first.

Closes §4.4 (T16e anchor-quality tail divergence). The T16e
forensic enumerates this as RP-1 + RP-2 (+ RP-3 as an
optional fixer-mode extension).

**Mechanism — Part 1 (transitive narrowing, RP-1):**

- When pass-N's applied fix adds a new cross-reference of
  the form `[...](./<file>.md#<anchor>)` or
  `[...](<file>.md#<anchor>)`, the inner loop auto-extends
  `NarrowedChunks` to include the chunk containing
  `<file>.md#<anchor>`. The classifier's existing b-bis
  check (lens findings against narrowed chunks default to
  defer-class) then applies to subsequent findings against
  that chunk.
- Operational rule: parse each pass's `_diff.txt` for
  markdown link tokens matching the regex
  `\]\([^)]*\.md#[A-Za-z0-9-_]+\)`. For each new link
  (not present in baseline-post-top-level), add the
  enclosing chunk to `NarrowedChunks` with provenance
  `auto-narrow:cross-reference-mint-pass-<N>`.

**Mechanism — Part 2 (anchor-add cooldown, RP-2):**

- When pass-(N+1) raises a finding whose `Issue` text
  references an `<a id="<token>">` that appears in pass-N's
  `_diff.txt` as a fresh insertion (not present in pass-
  (N-1)'s diff), the classifier auto-defers the finding to
  the debt register with sub-rationale
  `traceability-anchor-cooldown`.
- The cooldown is per-anchor-per-pass: once an anchor
  ages out of the just-previous pass's diff, the cooldown
  expires; the lens regains full standing on the
  *subsequent* re-edit.

**Mechanism — Part 3 (optional fixer mode, RP-3):**

- Add a fixer mode `(g) anchor-topology-restructure` to
  `agents/spec-diff-fixer.md`. When a traceability
  scope/terminus critique fires twice within three passes
  on the same paragraph, the fixer's repair option set
  includes "restructure paragraph into bold-label
  sentences" (the pattern already used in
  `pi-integration-contract.md`). The fixer selects
  restructure when its OriginAlignment annotation would
  remain `forward` after the restructure.

**Files changed (pi-config):**
`agents/spec-diff-fix-loop.md` (Part 1: cross-reference
detection and NarrowedChunks extension; ~20 lines),
`agents/spec-diff-fix-classifier.md` (Part 2: cooldown
rule; ~15 lines), `agents/spec-diff-fixer.md` (Part 3:
new mode; ~25 lines). Parts 1+2 are sufficient to close
the recursion; Part 3 is an additional capability that
becomes useful if recursions persist after Parts 1+2 ship.

### 5.6 Per-finding reshapes (pi-loom)

**Status: PARTIALLY IMPLEMENTED.**

Most of the current park set is downstream of pipeline gaps
(§4.1 / §4.2 / §4.4) and will not require reshape once
recs II, JJ, KK, MM land. The residual reshape list:

| Finding | Conditional reshape |
|---|---|
| **T05** | Per the T05 forensic RI-1 and §4.3 above: reshape the Solution approach to *pre-author* the sibling-anchor extraction at top-level (replace the single-canonical-home framing with an explicit "extend the *Naming convention* paragraph with a one-sentence pointer to a new `<a id="binder-model-root-word-delta">` sub-paragraph; the sub-paragraph hosts the per-surface mapping; the glossary entry back-references the sub-paragraph"). This converts the forbidden-extraction implicit constraint into an authored explicit step the fixer can implement directly. Rec LL would surface this at audit time; pre-Rec LL, do this reshape manually. |
| **T15a** | No reshape needed; re-dispatches automatically after T15b lands. Rec KK pre-empts the redundant fixer dispatch but does not change the outcome. |
| **T16e** | No reshape needed; cleared once Rec MM ships and the loop converges the anchor-quality tail. The originating PIC step-2 reconciliation is already correct and stable in the spec (the failure was downstream of the cure). |
| **T16b** | No reshape needed; cascades clear when T16e clears under Rec MM. |
| All 14 unaddressed findings (T11a, T03a, T10, T07, T15b, T03e, T03b, T03d, T18c, T18a, T19a/b/d/e, T18b) | No reshape needed; re-dispatch under Rec II + JJ. T03e remains a real score-budget case per the prior revision (genuine S=25 insufficiency) and may need split-into-atoms reshape independently of the pipeline state. |

### 5.7 Priority order

1. **Rec II** (pi-config) — unblocks the outer loop. Without
   it the whole pipeline halts on the first Rec-CC-routed
   finding and the throughput cost dwarfs everything else.
2. **Rec JJ** (pi-config) — ships with II. Reduces the
   per-blocked-finding iteration cost from 2 → 1 outer
   loops. Optional but high-value.
3. **Rec KK** (pi-config) — cheap (~15 lines); converts one
   class of clean top-level-refused parks into cheaper
   stale-precondition pre-parks.
4. **Rec MM** (pi-config) — closes the anchor-tail
   divergence class; T16e + T16b cascade clear on
   re-dispatch.
5. **Rec LL** (pi-config) — moves T05-class detection from
   inner-loop dispatch back to audit time. T05 should be
   hand-reshaped per §5.6 in the interim.
6. **Per-finding reshapes** (pi-loom) — reshape T05 ahead
   of Rec LL; everything else awaits the pipeline-side fix.

Validation queue (after each rec ships):

- Re-dispatch the 14 unaddressed findings above T18b in
  `spec-review.md`. Confirm Rec II lets the outer loop
  proceed past Rec-CC-routed findings without halting; the
  expected outcome is the loop processes all 14 findings in
  one session (subject to context-window limits).
- Re-dispatch T16e + T16b after Rec MM ships. Confirm the
  anchor-quality tail converges (NarrowedChunks captures
  `frontmatter.md`'s tools chunk on pass 2; pass-4 +
  pass-5 critiques auto-defer under the cooldown).
- Re-dispatch T15a after Rec KK ships. Confirm Rec M
  pre-parks it as `stale-precondition` (and that it later
  re-enters the queue after T15b resolves).
- Hand-reshape T05 per §5.6 and re-dispatch. Confirm the
  pre-authored sibling-anchor closes the
  single-canonical-home cycle and the loop converges.

## 6. What NOT to recommend

- **The fixer must not author findings.** (Unchanged.)
- **The fixer must not widen edit surface beyond what the
  finding names.** (Unchanged. Rec MM's auto-narrowing
  EXPANDS the narrowing set rather than the editing
  surface; it makes the existing surface-discipline
  rules apply to more chunks, not fewer.)
- **Grounding the fixer must not become re-authoring the
  finding.** (Unchanged. Rec HH validated cleanly on T06 /
  T13a / T13b; no T16e-class divergence was attributable
  to over-grounding.)
- **The audit layer must not become a substitute for the
  finding-authoring layer.** (Unchanged. Rec LL routes to
  HUMAN_REVIEW, not to auto-reshape.)
- **Loosening any lens.** Every raised finding in the
  current park set is a real defect against the
  imagined or actual post-fix text. T05's anchor-atomicity
  critique was correct (the new fifth obligation under
  `#naming-convention` IS at the anchor-saturation limit);
  T16e's anchor-scope critiques were correct (the
  `frontmatter.md` tools paragraph DOES bundle four
  obligations under one anchor). The lenses are doing
  correct work.
- **Reverting any shipped rec.** All shipped recs
  (J, F, K, V, T, O, M, W, L, P, Z, AA, BB, HH, CC, DD,
  EE, FF, GG) are working or working with a known
  integration gap that the new recs address. No revert
  is warranted.
- **Removing Rec CC.** Tempting because the parker gap
  makes Rec-CC-routed findings halt the loop. The fix is
  Rec II (extend the parker contract), not removing the
  ordering enforcement. Without Rec CC, T13a / T13b's
  successful sequencing this run would not have happened
  and the inner loop would have hit the same prerequisite
  problems the prior revision documented.
- **Raising the rec O `k` multiplier from 3.** Unchanged
  reasoning; the gate's strictness is what makes
  trust-override-suppression work on genuinely-undersized
  origins.
- **Auto-raising the heading-absent default from S=25.**
  Unchanged. Rec BB closed the heading-absent path so the
  default rarely fires in practice; raising it to mask
  legacy-path failures would re-introduce the prior
  revision's umbrella attribution noise.
- **Raising the 17-pass cap.** No current park exhausts it
  (T16e exited at pass 5, T05 at pass 3, T18b never ran).
  Cap is not the binding constraint.
- **Re-dispatching T05 as-authored before §5.6 reshape.**
  The single-canonical-home approach over a 4-obligation
  target paragraph deterministically enters no-canonical-
  home; re-dispatching without reshape will reproduce the
  bimodal expansion. Either hand-reshape per §5.6 or wait
  for Rec LL to surface it at audit time.
- **Re-dispatching T18b before Rec II ships.** The
  parker gap will halt the loop on the same heading; no
  forward progress is possible. Either ship Rec II first
  or land T18a manually (which would render T18b
  immediately dispatchable on the next picker call).
- **Treating the §4.1 parker gap as a finding-shape
  defect.** The T18b forensic explicitly argues that T18b
  is well-shaped, its must-follow edge is correctly
  authored, and the dispatcher behaved as designed. The
  gap is at the inter-agent contract level; fix the
  contract.
- **Shipping Rec JJ without Rec II.** Rec JJ alone makes
  the picker skip Rec-CC-blocked candidates, but the
  Rec-CC-blocked case must still be safe to encounter
  (e.g. when the only remaining candidate is blocked, or
  in deadlock). Rec II is the safety net; Rec JJ is the
  fast-path. Ship II first; ship JJ at the same time or
  later.
- **Shipping Rec MM Part 3 (the `(g) anchor-topology-
  restructure` fixer mode) before Parts 1+2 validate.**
  Parts 1+2 are conservative (extend narrowing; auto-defer
  cooldown); Part 3 is an authoring capability that may
  produce its own divergence shapes. Validate Parts 1+2
  on T16e re-dispatch first; ship Part 3 only if anchor-
  tail recursions persist.

## Appendix — file and artifact references

Most recent dispatch forensic reports (gitignored):

- `.pi/tmp/spec-fix-failure-forensics/2026-05-20T06-38-04_bf2b2b/`
  (4 reports — first end-to-end BB+HH+CC validation
  dispatch):
  - `t05-bind-frontmatter-vs-binder-binder-settings-diagnostics-prose-root-word-incon.md`
    (~500 lines; surface-expansion-irrecoverable-bimodal /
    CATEGORY 1; root cause: single-canonical-home Solution
    approach over a 4-obligation target paragraph; ranked
    recommendations RI-1..RI-4 (immediate) and RP-1..RP-4
    (pipeline)).
  - `t15a-reduce-session-model-orientation-paragraph.md`
    (top-level-refused / CATEGORY 1; root cause: picker
    dispatched T15a while T15b was unresolved and Rec M's
    trigger-phrase grammar missed constraint #3's
    content-conditional form).
  - `t16e-pic-step-2-internal-contradiction.md`
    (diverging / CATEGORY 2; root cause: pass-3 anchor mint
    in `frontmatter.md` opened a traceability-lens
    recursion that the loop's narrowing never closed
    because `frontmatter.md` was never in NarrowedChunks).
  - `t18b-add-per-mode-operator-side-null-sentences-to-slash-invocation-md.md`
    (dispatch-ordering-blocked / CATEGORY 1; root cause:
    Rec CC dispatcher correctly deferred T18b because its
    must-follow prerequisite T18a is still live; parker
    contract gap halted the outer loop on the deferral
    round-trip).

Pi-config commits in production (git-pinned via global
settings under `git:github.com/bitmonk8/pi-config`, cloned to
`~/.pi/agent/git/github.com/bitmonk8/pi-config/`):

- `dd974d9` — rec J (Solution approach directional).
- `f10e3c1` — rec F (`Shape: multiple` cluster dispatch).
- `344da26` — rec K (cluster-importance aggregation).
- `8f0ccfe` — rec V (SP-2 Solution constraints advisory +
  three-mode authoring guard).
- `b20536d` — recs T + O + M + W (stage-transition refusal,
  shadow-budget gate, pre-dispatch staleness, CATEGORY
  tagging).
- `1c17d6d` — rec L (audit-side binding-surface
  ratification).
- `6e2c259` — rec P (decision-axes audit).
- `8e12608` — rec Z (CATEGORY split).
- `7005303` — rec AA (stage-3 oscillation detector).
- `122d896` — rec BB (origin grounding artefact persisted
  at dispatch; classifier reads it first).
- `c714cda` — rec HH (fixer grounded in origin artefact
  every pass; refusal mode (i) drift-from-origin;
  OriginAlignment annotations).
- `8a07d70` — rec CC (orchestrator enforces must-precede
  at dispatch; orderingBlocked list;
  `dispatch-ordering-blocked` FailureMode). **Integration
  gap with `spec-review-parker` contract; Rec II
  pending.**
- `83e4e65` — rec DD (auditor obligation-count vs
  score-budget pre-check, shipped as Pattern R).
- `b86b9f2` — rec EE (auditor uses-vs-defines
  discriminator for assumptions-lens predictions).
- `d2b32c3` — rec FF (fixer mode (h)
  no-new-normative-claim guard, origin-mandate-grounded
  via rec HH artefact).
- `0cf1338` — rec GG (in-loop approach-narrowing preserves
  `OriginAlignment: forward` fixes across mode (d)
  reverts).

Pi-config recommendations from this revision — all
shipped on 2026-05-20 in commit `dae833a` as one
atomic integration commit:

- **Rec II** — `agents/spec-review-parker.md` +
  `prompts/fix-spec-shape-single-findings.md`: parker
  handles `dispatch-ordering-blocked` (and `-cycle`
  variant) with a forensic-only branch; orchestrator's
  step 3e gains a `PARKED_COUNT==0` commit branch.
- **Rec JJ** — `agents/spec-review-shape-single-picker.md`
  + `prompts/fix-spec-shape-single-findings.md`: picker
  bottom-up walk becomes Rec-CC-aware, falls through to
  next-eligible candidate; emits SKIPPED prefix lines and
  BLOCKED terminal; orchestrator gains step 2a deadlock
  routing.
- **Rec KK** — `prompts/fix-spec-shape-single-findings.md`:
  Rec M trigger grammar extended with content-conditional
  pattern matcher (T15a-class `"If <subsection> is
  absent ... defer"` shape).
- **Rec LL** — `agents/spec-review-finding-lens-auditor.md`:
  new Pattern S (single-canonical-home Solution approach
  over a multi-obligation target paragraph). HUMAN_REVIEW
  routing; three candidate reshape branches. Multi-pattern
  routing order updated.
- **Rec MM** — `agents/spec-diff-fix-loop.md` +
  `agents/spec-diff-fix-classifier.md`: Parts 1 (transitive
  narrowing via fix-minted cross-references; new loop
  sub-steps `4-trans` + `4-anchor`) + 2 (anchor-add
  cooldown; classifier rule `b-octies` with rationale
  `defer-to-debt — traceability-anchor-cooldown`). Part 3
  (the optional `(g) anchor-topology-restructure` fixer
  mode) NOT shipped — conservative: validate Parts 1 + 2
  on T16e re-dispatch first.

Pi-loom — current state references:

- `docs/spec-review.md` — 15 finding H1s (T11a, T03a, T10,
  T07, T15b, T03e, T03b, T03d, T18c, T18a, T19a, T19b,
  T19d, T19e, T18b).
- `docs/spec-review-parked.md` — 4 distinct findings (T05,
  T16e, T16b, T15a). 16 H2 entries total (one per finding
  plus the Problem / Solution approach / Solution
  constraints / Relationships sub-sections per finding).
- `docs/spec-review-forensic-analysis.md` — TL;DR table of
  every park, with per-row links to the gitignored
  detailed reports.
- Cures banked since the prior meta-analysis revision
  (2026-05-20 commits): T06, T13a, T13b, T09, T18d, T11b,
  V6k, T03c, T03f.

Prior forensic sets (gitignored, retained for archaeological
context only):

- `.pi/tmp/spec-fix-failure-forensics/2026-05-19T17-23-50_9cbe86/`
  (T05, T06 — prior to BB+HH+CC validation; T06 here
  shows the heading-absent default that BB closed).
- `.pi/tmp/spec-fix-failure-forensics/2026-05-19T10-47-33_8360aa/`
  (T03e, T13b, T15a, T16b, T18c — pre-Rec CC; the
  dispatch-ordering violations are visible here).
- Earlier 2026-05-15 → 2026-05-18 sets.

This document's history (recoverable via
`git log docs/spec-review-forensic-meta-analysis.md`). Prior
revision contained the W1/W2/W3 chronology, a per-commit
implementation ledger for recs L / P / Z / AA, and a §2.1
park-set table at 17 findings; all have been collapsed into
§1 and §2.2 since the BB+HH+CC validation closed the
underlying mechanisms those tables described.

End of meta-analysis.
