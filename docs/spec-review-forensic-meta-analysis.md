# Meta-analysis — spec fix-loop forensic state

```
PROJECT: pi-loom
SCOPE: current state of the spec fix-loop pipeline after the most
       recent /fix-spec-shape-single-findings run (2026-05-18 →
       2026-05-19); what works, what doesn't, what to do next.
INPUT: 10 forensic reports across the two most recent dispatch
       runs under .pi/tmp/spec-fix-failure-forensics/:
         - 2026-05-18T15-13-27_a2e488/  (3 reports — canary
           validation of the most-recently-shipped pipeline recs)
         - 2026-05-18T20-36-39_b9045e/  (7 reports — newly-
           dispatched T02-T11a batch)
       + docs/spec-review.md and docs/spec-review-parked.md at HEAD
       + pi-config at HEAD (cloned to
         ~/.pi/agent/git/github.com/bitmonk8/pi-config/)
       + pi-loom commits spanning 2026-05-18 → 2026-05-19

HEADLINE: The shipped pipeline (recs J, F, K, V, T, O, M, W) cures
          every well-shaped single-finding case it sees and signals
          its refusals cleanly. The most recent run produced 7
          spec-edit commits and 11 parks (10 finding parks + 7
          cascade closures, with the T19 cluster counting as 4
          parked H1s for 1 dispatch unit).

          Three failure shapes dominate the current park set:

          1. **Rec K metadata-recovery gap (4 of 11 direct parks).**
             When the originating finding's heading is absent from
             `spec-review.md` at classifier time — either because
             the top-level fixer's Pattern I auto-reshape stripped
             it pre-dispatch, or because a prior baseline-snapshot
             stripped it — the classifier defaults to S=25 and rec O's
             k×S=75 gate fires on residue the finding's true score
             (typically S=100) would have absorbed. Affects T19
             cluster (1 unit, 4 H1s), T03a, T10, T11a.

          2. **Audit-side misses are first-order.** Two W3 parks
             (T03a, T07) had pre-dispatch audit verdicts of LOW risk
             / PASS on all 14 spec-content lenses; the inner loop
             then raised defects on 5 of those 14. The fixer
             pipeline is saturated against in-loop signal; the
             bottleneck has moved to the audit layer.

          3. **CATEGORY mis-tagging on surface-expansion-irrecoverable
             (2 of 11 parks).** The exit code tags Category 2
             unconditionally; T05 and T09 root causes are Category 1
             finding-shape defects (two-site authoring, bimodal
             approach). The tagging misroutes human readers.

          Plus one fixer-capability gap: rec T's mode (e) covers
          stage-1→2/3 structural-scaffolding additions but not
          stage-3 prose-token re-cycles. T09 burned 7 passes on
          `naming` / `clarity` term cycles before exit.

PRIMARY WORK (in priority order):
  Tier 1 — closes the dominant failure mode:
    - rec X (pi-config) — classifier git-history metadata recovery
    - Restore T19 cluster headings to docs/spec-review.md (pi-loom)
  Tier 2 — closes the audit-layer gap:
    - rec L (pi-config) — audit-side binding-surface ratification
    - rec P (pi-config) — Problem-metadata decision-axes
  Tier 3 — signal hygiene + remaining fixer-capability gap:
    - rec Z (pi-config) — split surface-expansion-irrecoverable CATEGORY
    - rec AA (pi-config) — stage-3 prose-quality oscillation detector
  Tier 4 — pi-loom finding-authoring:
    - 11 per-finding reshapes + 1 new spec-review entry

GENERATED: 2026-05-19T19:00:00Z
           Document rewritten from a current-state perspective.
           Prior revisions (including W1/W2 chronology) are
           recoverable via git log of this file.
```

---

## 1. Current state

### 1.1 Parked findings (26 H1s / 14 dispatch units)

The complete park set as of HEAD, per the explicit `**Reason:**`
lines in `docs/spec-review-parked.md`:

| Category | H1s | Dispatch units | Findings |
|---|---:|---:|---|
| **Category 1** (malformed finding) | 13 | 10 | T18a, T13, T15a, T15b, **T19a/b/d/e** (1 cluster, 4 H1s), T11a, T10, T07, T06, T03a |
| **Category 2** (fixer too-hard) | 3 | 3 | T16b (genuine — diverged at pass 9); T05, T09 (**mis-tagged** — root causes are Category 1 per §3.3) |
| **Cascade** (upstream-bound) | 10 | 10 | T18b/c/d (← T18a); T11b/c (← T11a); T03b/c/d/e/f (← T03a) |
| **Total** | **26** | **23** | |

After rec Z (§4.3) ships, the tagging settles at: Category 1 =
15 (12 dispatch units), Category 2 = 1, Cascade = 10.

The triaged-but-active `docs/spec-review.md` is empty — the file
contains only its title H1. Every authored finding has either
resolved or parked. New audit cycles will refill it.

### 1.2 Shipped pipeline mechanisms

These recs are in production and shape what the next dispatch
will do. Background context for §3 and §4 — not the document's
recommendations.

| Rec | Where | What it does |
|---|---|---|
| J | pi-config `dd974d9` | Solution approach is directional, not binding. Fixer can narrow / redirect / ignore approach to fit the binding surfaces. Top-level fixer emits `## Narrowed chunks`; inner fixer carries refusal mode `(d) approach-narrowing`; classifier defers via `defer-to-debt — approach-narrowed`. |
| F | pi-config `f10e3c1` | `**Shape:** multiple` + `**State:** reduced` cluster dispatch mode. Picker walks `co-resolve` edges; fixer unions Problems/constraints; one stable post-edit state; one forensic report per cluster. |
| K | pi-config `344da26` | Cluster-importance aggregation: cluster's S = max(member S). Heading-absent fallback defaults to medium / S=25. **The heading-absent fallback has an integration gap** — see §3.1 + rec X. |
| V | pi-config `8f0ccfe` | Solution constraints are advisory, not binding. Fixer's fifth narrowing check (over-fencing detection); inner-fixer refusal mode `(f) constraint-as-advisory` with three discriminating authoring-guard sub-modes `(f-stop-1)` unanticipated-content / `(f-stop-2)` co-resolve-siblings-territory / `(f-stop-3)` would-weaken-existing-rule. New STATUS `must-fix-blocked-constraint-narrowing-refused`. |
| T | pi-config `b20536d` | Stage-transition structural-growth refusal. Inner-fixer mode `(e)` fires on stage-2/3 fixes adding `<a id`, `> **`, `^### `, or `**Label.**` markers to chunks that were tier-1-clean in stage 1. New STATUS `must-fix-blocked-by-stage-transition`. |
| O | pi-config `b20536d` | Pass-level shadow-budget gate (rule a-bis), k=3. Catches trust-override-masked monotone-rising score sums. New sub-rationale `score-budget-exhausted-trust-override-suppressed`. |
| M | pi-config `b20536d` | Pre-dispatch precondition staleness check (step 2d of `prompts/fix-spec-shape-single-findings.md`). Detects `MUST have already landed` / `bottom-up ordering guarantees` lexical patterns in constraints; parks pre-dispatch with `FailureMode: stale-precondition`. |
| W | pi-config `b20536d` | CATEGORY field threaded across loop output, classifier `_blocked.md`, forensics TL;DR, parker reasons. Every park leads with `Category 1 (malformed finding — reshape ...)` or `Category 2 (fixer too-hard — file pi-config issue)`. **Tagging has a precision gap** — see §3.3 + rec Z. |

### 1.3 What the most recent run did

Two dispatches, 17 findings total. **7 resolved + 10 parked +
7 cascade.**

- **Cures** (7 spec-edit commits): T12, T14, T16a (the named
  canary cures) + T02, T08a, T08b, T08c (newly-dispatched
  batch).
- **Parks** (10 direct + 7 cascade): T15a (rec M pre-dispatch),
  T15b, T19 cluster, T03a + 5 cascade, T05, T06, T07, T09, T10,
  T11a + 2 cascade.

Cure paths confirmed on the shipped pipeline:

- **Rec V over-fencing detection** — T16a cured. Fixer
  narrowed the constraint fencing the orphan-premise
  re-sourcing site.
- **Rec V approach-narrowing via citation** — T14 cured. Fixer
  authored a fourth `subagent → prompt` closure clause citing
  existing `invocation.md — Cross-mode semantics` material.
- **Rec T mode (e)** — T12 cured. Deferred the stage-2 anchor-
  split that had caused divergence on a prior dispatch.
- **Rec M pre-dispatch staleness** — T15a parked correctly
  with `FailureMode: stale-precondition` before any subagent
  ran.
- **Rec W CATEGORY field** — present on every park forensic
  (with the tagging precision gap noted in §3.3).

**Untested on this run:** the three rec V authoring-guard
sub-modes `(f-stop-1)` / `(f-stop-2)` / `(f-stop-3)`. T14 was
cured rather than guard-refused (the cited fourth premise was
anticipated by the Problem). The T19 cluster — designed as the
`(f-stop-2)` heaviest canary — never reached the fixer because
rec O preempted at pre-pass classifier exit (§3.1). No T20-shape
findings were dispatched, so `(f-stop-3)` had nothing to fire
on. Re-validation is queued for after rec X (§4.3) lands.

## 2. The fixer/finding architectural cut

The pipeline operates on a hard boundary: **fixer = mechanism;
finding-authoring layer = author**. The fixer reads a finding,
applies an edit that solves the Problem within the constraints,
or rejects. The fixer is not licensed to decide what the work
is — that's the finding-authoring layer's job (composed of
human review, the reducer, the auditor, and any auto-reshape
paths).

Under this cut, every rejection is exactly one of two
categories:

- **Category 1 — malformed finding.** The finding is wrong on
  at least one of its **binding surfaces** (the parts the
  fixer is obligated to honour):
  - **Problem** — embeds a false claim about the corpus, omits
    engagement with corpus state the remediation depends on,
    propagates an undefined term, or assumes a prerequisite
    that does not exist.
  - **Score** — the budget cannot absorb the residue the
    Problem's work generates regardless of approach.
  - **Ordering edges** — stale, missing, or contradicted by a
    sibling that already resolved.
  - **Missing prerequisite finding** — the corpus state the
    Problem assumes can only be established by a finding that
    does not yet exist in `spec-review.md`.

  Solution approach (under rec J) and Solution constraints
  (under rec V) are *advisory*, not binding. An approach- or
  constraint-level defect alone is never a Category 1
  malformation; the fixer is licensed to narrow.

  The finding-authoring layer's response to a Category 1
  reject is to delete, split, merge, reorder, reformulate the
  Problem, raise the score, repair the ordering edges, or
  author the missing prerequisite. The fixer must not paper
  over malformations by inventing new findings or widening
  edit surface.

- **Category 2 — fixer too-hard.** The finding is well-formed
  on every binding surface but the fixer's current capability
  cannot execute the edit. The pi-config side responds by
  extending the fixer.

The auditor and reducer belong to the finding-authoring layer.
Their job is to catch Category 1 malformations *before*
dispatch. Audit improvements are not pipeline empowerments;
they route Category 1 rejects to reshape earlier in the cycle.

## 3. Failure patterns in the current park set

Each pattern is named, scoped to the parks it explains, and
linked to the rec that closes it.

### 3.1 Rec K metadata-recovery gap (dominant pattern, 4 of 11 direct parks)

Rec K aggregates cluster member importances correctly when the
member headings are present in `docs/spec-review.md` at
classifier time. Two upstream workflows silently violate that
precondition:

- **Pattern I auto-reshape.** When the top-level fixer's
  pre-dispatch pass removes the H1 from `spec-review.md` as
  part of authoring the spec edit, the inner classifier sees
  an absent heading and falls back to medium / S=25.
- **Human-driven baseline-snapshot strip.** When the loom
  baseline commit (the snapshot the loop reads as its
  starting state) has the heading absent — because a prior
  human or tool removed it and committed — the classifier
  defaults to medium even on a freshly-unparked finding.

**Effect.** Every Pattern I auto-reshape and every cluster
dispatch into a stripped-baseline state defaults to S=25.
Rec O's k×S=75 gate then fires on residue ≥75, which is
essentially every normative-prose authoring task's pass-2
residue.

**Parks explained:**

| Finding | True score (recoverable from git) | Defaulted score | Σ_shadow | Σ/true-S | Would fire at true S? |
|---|---:|---:|---:|---:|---|
| T19 cluster | S=100 (members all `Importance: high`) | 25 | 150 | 1.5× | No (under k=3) |
| T03a | likely S=100 (heading stripped, history accessible) | 25 | 132 | 1.32× | No |
| T10 | unrecoverable in environment | 25 | 81 | n/a | indeterminate |
| T11a | S=100 (cluster siblings T11b/c both `Importance: high`) | 25 | 211 | 2.11× | No |

**The T11a forensic's `_blocked.md` self-flagged this as a
"likely category-1 reshape false-positive".** The classifier
has the diagnostic; it lacks the recovery tool.

**Closes:** rec X (§4.3).

### 3.2 Audit-side misses (first-order, 2 of 11 direct parks)

With the in-loop fixer signal saturated by rec V / T / M, the
bottleneck has moved upstream. The pre-dispatch audit returned
favourable verdicts on findings the inner loop subsequently
parked on Category 1 grounds.

| Finding | Audit verdict | Inner-loop outcome |
|---|---|---|
| T03a | LOW risk; AUTO_RESHAPE (cruft-removal only); PASS on all 14 spec-content lenses | 11 distinct findings raised across 2 passes on 5 of those 14 lenses |
| T07 | PASS on `consistency`, `assumptions`, `completeness`, `traceability` | Inner loop raised fix-class defects on every one of those four dimensions; pass-3 blocker was a `consistency` contradiction against pre-existing pins the audit did not grep for |

The T07 forensic states the mechanism: *"the audit's lenses do
not grep the corpus for counterexamples when the Solution
approach licenses closure-shaped prose."* T03a is the same
shape applied to multi-axis directional approaches: the audit
checks the imagined post-fix paragraph for lens compliance but
does not enumerate what the fixer would have to author to
satisfy the Problem.

**Closes:** rec L + rec P (§4.2).

### 3.3 CATEGORY mis-tagging on surface-expansion-irrecoverable (2 of 11 parks)

Rec W's exit-code-to-CATEGORY mapping tags
`surface-expansion-irrecoverable` as Category 2
unconditionally. Two W3 parks exit via this code with Category 1
root causes:

| Finding | Tagged | Root cause | Should be |
|---|---|---|---|
| T05 | 2 | "Two-site authoring (frontmatter Naming-convention paragraph + glossary entry) with no scope-bounding constraint" — fixer's surface-expansion is a *symptom* of the bimodal Solution approach | 1 |
| T09 | 2 | "T09's bimodal 'either restate or forward-link' Solution approach licenses unbounded re-naming of an artifact that already has four pre-existing names two screens down" | 1 |

The mis-tagging routes human readers to "file a pi-config
issue" when the correct response is "reshape the finding".

**Closes:** rec Z (§4.3).

### 3.4 Stage-3 prose-quality oscillation (1 of 11 parks, plus a contributor to another)

T09 burned 7 passes diverging on `naming` / `clarity` term
cycles (`walk algorithm` ↔ `truncation walk`, `effect` ↔
`runtime behaviour`, `bounded recent slice` ↔ `turn- and
token-bounded recent suffix` ↔ `included context`, full vs
abbreviated link display text). T05 burned 4 + 1-backtrack
passes with a related two-site naming cycle as a contributor
to its surface-expansion exit.

Rec T mode (e) catches *structural* additions (`<a id`,
`> **`, `^###`, bold-label-period) at the stage 1→2 / 2→3
transitions. It does not catch *naming* re-cycles within
stage 3 — re-using a prose-token combination that triggered a
fix in a previous pass on the same chunk.

**Closes:** rec AA (§4.1).

### 3.5 Score genuinely insufficient for Problem residue (3 of 11 parks)

These are clean Category 1 score-budget cases. The authored
medium score (S=25) is correct; the Problem genuinely requires
work whose residue overflows the budget. Rec O fires
correctly; the rec K gap is not involved.

| Finding | Σ_shadow | S | Pattern |
|---|---:|---:|---|
| T15b | 260 | 25 (correct medium) | Solution approach mandates a ~600-word verbatim duplication bundling 8+ obligations behind one anchor |
| T06 | 106 | 25 (correct medium) | Solution approach mints a V1 carve-out at one site (glossary) whose surface reaches 5 files |
| T07 | 110 | 25 (correct medium) | Solution approach licenses closure-shaped predicates over a pinning surface whose presupposition is empirically false (3 pre-existing cross-file pins exist) |

These three require per-finding reshape (raise score, split
into per-axis atoms, or narrow the Solution approach). No
pipeline change addresses them. **Closes via:** Tier E
reshapes (§4.4). Rec P helps the audit catch the
multi-axis shape pre-dispatch.

### 3.6 Genuine fixer-cannot-converge (1 of 11 parks)

T16b alone — diverged at pass 9 on a well-shaped single-site
finding. The Solution approach is bimodal (mechanism-vs-effect
framing) and the W2 forensic's root cause (carried over
without revision) names the PIC step 2 L213 internal
contradiction as the missing prerequisite. **Closes via:**
Tier E reshape (§4.4) + author the missing prerequisite
finding.

## 4. Recommendations

Five active recommendations on pi-config, plus pi-loom
finding-authoring work. No Tier S (architectural / finding-
shape principle) work is outstanding — SP-2's *Solution
approach is directional* (rec J) and SP-2's *Solution
constraints are advisory* (rec V) are both in production and
the current evidence does not call for further binding-surface
revisions.

### 4.1 Tier A — fixer-capability extensions

**Rec AA — Stage-3 prose-quality oscillation detector.**

Closes §3.4 (T09 directly + T05 cycle component).

**Mechanism:**

- New refusal mode in `agents/spec-diff-fixer.md`: `(g)
  stage3-naming-cycle`. Fires when:
  - the current pass is in stage 3; AND
  - the proposed fix's diff hunk replaces a prose token (any
    word-shape match excluding code-fenced identifiers, anchor
    IDs, and link targets) with a variant that appeared in
    the working-tree state at any of the last 3 passes for
    the same chunk; AND
  - the fix's lens of origin is `naming`, `clarity`, `cruft`,
    or `testability`.
- Refusal NOTES line: `RefusalMode: (g) stage3-naming-cycle;
  chunk=<chunk-id>; token=<original>; proposed=<variant>;
  prev-seen-at=<pass-N-K>`.
- New classifier defer rationale `defer-to-debt — stage3-
  naming-cycle`. Originating lens finding routes to debt; loop
  continues.
- New STATUS in `agents/spec-diff-fix-loop.md`:
  `must-fix-blocked-by-stage3-naming-cycle`. CATEGORY by
  rec Z's discriminator check.

**Files changed (pi-config):** `agents/spec-diff-fixer.md`,
`agents/spec-diff-fix-classifier.md`,
`agents/spec-diff-fix-loop.md`. ~40 lines total. The per-pass
per-chunk working-tree state already exists in `_diff.txt`
artefacts; the new work is the token-match check + NOTES
surface + STATUS code.

### 4.2 Tier B — finding-authoring-layer empowerments

**Rec L — Audit-side binding-surface ratification.**

Closes §3.2 (T03a + T07). Auditor walks each finding's binding
surfaces (per §2) and flags malformations the fixer would
otherwise hit only at fix time. Four ratification checks
keyed to specific binding surfaces:

- **Problem — cited rule absent from owner page** (T14-shape).
  For each Problem asserting that an owner page contains a
  specific rule, grep the owner page for the asserted rule
  verbatim or by close paraphrase. Absence → `RISK_HIGH` with
  rationale `problem-asserts-rule-absent-from-owner-page`.
  *Generalisation from W3 evidence:* check the entire corpus
  for the rule (the cited rule may exist at a different owner
  page than the Problem names; rec V's approach-narrowing
  licenses the fixer to redirect the citation, so absence at
  the Problem's named owner is not malformation if the rule
  exists elsewhere).
- **Problem — propagated undefined token** (T13-shape). For
  each Problem whose remediation introduces or re-uses a
  qualifier-grade token, grep `docs/` for a defining
  occurrence. Absent → rationale
  `problem-propagates-undefined-token`; suggested reshape is
  a `must-precede` defining-finding split.
- **Constraints — all remediation sites fenced** (T16a-shape).
  For each Problem describing a structural change whose
  surviving prose carries orphan premises, enumerate the
  prose surfaces those premises could honestly land on; if
  Solution constraints fence every such surface → rationale
  `constraints-fence-all-remediation-sites`.
- **Missing prerequisite finding — cited owner internally
  contradictory** (T16b-shape). For each Problem citing an
  owner section as authoritative, scan for internal
  contradictions; if found and no `must-precede` edge → rationale
  `cited-owner-contradictory-no-prerequisite-finding`.

All four rationales route to `HUMAN_REVIEW` or `AUTO_RESHAPE`
depending on the auditor's confidence. None rewrite findings
themselves — they route to the finding-authoring layer.

**Files changed (pi-config):** the auditor prompt
(whichever file in `agents/` or `prompts/` owns per-finding
lens dispatch). ~40–60 lines for the four rationales + worked
examples.

**Rec P — Decision-axes Problem-metadata + score-vs-residue audit.**

Closes §3.2 (T03a multi-axis component) + §3.5 (T15b, T06,
T07 multi-axis residue). When the Problem implicitly requires
committing on ≥2 orthogonal axes (lexical signal: modal verbs
like "name", "address", "describe" applied to multiple
dimensions of the same artefact), the reducer adds a
`**Decision axes:** <count>` Problem-metadata field. The auditor
runs a score-vs-residue check: axis-count × typical-follow-up-
importance exceeds score-budget headroom → `RISK_HIGH` with
rationale `score-insufficient-for-axis-residue`.

**Files changed (pi-config):**
`agents/spec-review-finding-reducer.md`, the auditor.
~30 lines.

### 4.3 Tier C — pipeline integration + signal hygiene

**Rec X — Classifier git-history metadata recovery. (HIGHEST PRIORITY.)**

Closes §3.1 (T19 cluster + T03a + T10 + T11a — 4 of 11 direct
parks). When the originating finding's heading is absent from
both `docs/spec-review.md` and `docs/spec-review-parked.md` at
classification time, the classifier currently defaults
`severity=medium`, `S=25`, `mustFix=false`. The recovery is
mechanical:

- New classifier sub-routine `recoverMetadataFromGitHistory`
  in `agents/spec-diff-fix-classifier.md`. Inputs: heading
  text (or cluster member heading list), the two spec-review
  file paths. Output: `{severity, S, mustFix}` recovered from
  the most recent commit whose diff contains `^# <heading>$`
  on either file's `+` or `-` lines.
- Implementation: `git log -p -50 -- docs/spec-review.md
  docs/spec-review-parked.md`. Parse the patch hunks for
  `^# <heading>$` matches. From the matched hunk, extract the
  `**Importance:**` field value (typically within 20 lines of
  the heading; readable verbatim from context). Map
  importance → score using existing policy (high → 100,
  medium → 25, low → 5).
- For clusters: search runs against each member heading; rec K's
  max-aggregation runs on the recovered set.
- Recovery falls through to the existing medium default only
  on zero matches. The default's semantics are preserved for
  the genuinely-unrecoverable case.

**Coverage on the current park set:** T19 cluster
(S 25 → 100, gate ratio 6.0× → 1.5×, gate does not fire);
T03a (S 25 → ≥100, gate ratio 5.28× → ≤1.32×); T11a
(S 25 → 100, gate ratio 8.44× → 2.11×). T10's heading is
beyond the searchable history range; the default falls
through with its current semantics — acceptable.

**Files changed (pi-config):**
`agents/spec-diff-fix-classifier.md`. ~80 lines (sub-routine
+ shell-out + parser + cluster-loop integration).

**Rec Y — Loom baseline-snapshot pre-flight delta check. (OPTIONAL.)**

Closes the human-driven baseline-snapshot strip side of §3.1
(the T19 cluster baseline that pre-removed 137 lines from
`spec-review.md`). Warns when the loom baseline differs from
main HEAD by >100 lines on `spec-review.md` or
`spec-review-parked.md`: "the working tree has stripped large
blocks from the review docs; if the strip removed the heading
you are about to dispatch, the classifier's metadata-recovery
may fall through to heading-absent default; consider unparking
the heading or applying the parked content before proceeding".

**Ship only if rec X has a measurable false-negative rate** on
strip-then-add-back-in-different-commit patterns. Otherwise
redundant.

**Files changed (pi-config):**
`prompts/fix-spec-shape-single-findings.md` pre-flight section.
~20 lines.

**Rec Z — Split `surface-expansion-irrecoverable` CATEGORY by finding shape.**

Closes §3.3 (T05, T09 tagging). The current rec W mapping tags
every `surface-expansion-irrecoverable` exit as Category 2;
W3 evidence shows the exit is sometimes Category 1 (bimodal /
two-site / multi-axis finding shape).

**Mechanism:**

- Split `surface-expansion-irrecoverable` into:
  - `surface-expansion-irrecoverable-bimodal` (Category 1) —
    fires when `LoopNotes` for the run contains any of:
    "two-site authoring", "bimodal approach", "either…or…
    approach", "no canonical-home rule", "multi-axis",
    "multi-site". The loop already records these strings when
    present.
  - `surface-expansion-irrecoverable-cycle` (Category 2) —
    fires when no Category-1 discriminator string is present.
    Pure fixer-cannot-converge on a well-shaped single-site
    finding.
- The new `must-fix-blocked-by-stage3-naming-cycle` STATUS
  (from rec AA) takes its CATEGORY by the same discriminator
  check.

**Files changed (pi-config):** `agents/spec-diff-fix-loop.md`,
`agents/spec-fix-failure-forensics.md`,
`agents/spec-review-parker.md`. ~20 lines.

### 4.4 Tier E — finding-authoring work (pi-loom)

Eleven per-finding reshapes + one new spec-review entry + one
heading-restoration patch. Each W3 forensic at
`.pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/`
and `.pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/`
includes a `### Immediate (this finding)` subsection with the
specific reshape recommendation.

| Finding | Reshape action |
|---|---|
| **T19 cluster heading restoration** | `git show e12ccf9 -- docs/spec-review.md` and patch the four cluster member headings back into `docs/spec-review.md`. Highest-leverage single edit; under rec X this becomes automatic, but until then it unblocks the cluster dispatch immediately. |
| **T03a** | Split into three per-axis atoms (literal pins / H1-test wiring / swap-procedure); OR raise score to high (S=100); OR narrow the Solution approach to forbid embedding implementation literals in a behavioural host-contract document. |
| **T05** | Declare a canonical home (recommend frontmatter Naming-convention paragraph) and demote the glossary entry to back-reference; OR drop the "every other surface" universal claim and enumerate diagnostic-code-family scopes per-family; OR split into per-site atoms with explicit non-duplication constraints. |
| **T06** | Raise score to high (S=100) on the strength that the V1 carve-out's downstream contract surface is genuinely multi-file; OR split into 3–4 per-axis atoms (glossary anchor + V1-invariant sentence; spec.md forward-link; cross-page consumer enumeration sync; FC anchor coverage); OR narrow approach to drop the cross-page consumer-enumeration work. |
| **T07** | List the three known cross-file `.message` pins (`query.md:98`, `pi-integration-contract.md:262`, `implementation-notes.md:23`) in T07's Solution constraints so the fixer enumerates them; OR explicitly forbid closure-shaped predicates; OR narrow T07 to the audience claim only and defer the pinning-surface question. |
| **T09** | Resolve the bimodal "either restate or forward-link" — pick one branch in the Solution approach; OR raise score to high; OR narrow the constraint to forbid renaming the link display text (the dominant cycle source). |
| **T10** | Recover T10's real importance/score from outside the heading (unavailable in environment per the forensic — may need authoring decision); OR split T10 along the three axes pass-1 expansion revealed (binder-side bypass clarification, slash-invocation trim-semantics pin, PIC restatement sync). |
| **T11a** | **Procedural reshape:** restore T11a's heading + `**Importance:** high` / `**Score:** 100` to `docs/spec-review.md` (the heading was stripped pre-dispatch). Once rec X ships this is automatic. Until then: restore by hand. Secondary content reshape: enumerate the wrong-tool diagnostic surface explicitly in the Solution approach. |
| **T15b** | Raise score to high (S=100); OR split into per-axis atoms (the ~600-word duplication bundles 8+ obligations behind one anchor); OR drop the verbatim-duplication requirement in favour of a forward-link from the new `<a id="concurrency-model">` site to the existing `<a id="session-model">` paragraph. |
| **T13** | Split into a defining-finding (own `cross-file` in the *countable-frame* paragraph or `glossary.md`) + the propagation finding, with `must-precede` ordering. |
| **T16b** | Author the prerequisite finding (PIC step 2 L213 internal contradiction: literal `pi.setActiveTools([...snapshot, ...names])` call shape vs natural-language "exactly the loom's declared callable set"). Add `must-precede` edge from T16b. |
| **T18a** | Pin the 3 axes (caller-observation-surface taxonomy; quantifier domain; pre-evaluation behaviour) OR split into per-axis atoms OR raise score. |
| **New spec-review entry** | Author "PIC step 2 internal contradiction: literal `pi.setActiveTools([...snapshot, ...names])` call shape vs natural-language 'exactly the loom's declared callable set'." Add `must-precede` edge from T16b. |

Cascade-parked findings (T03b/c/d/e/f, T11b/c, T18b/c/d) re-
dispatch when their upstream lands; no per-cascade reshape.

After rec L + rec P + rec X ship, re-evaluate this list. Audit-
side detection on Tier B will catch some of these pre-dispatch;
the reshape recommendations stay the same but the routing layer
changes.

### 4.5 Summary table

| Rec | Tier | Title | Closes |
|---|:-:|---|---|
| **X** | C | Classifier git-history metadata recovery | §3.1 (4 of 11 parks) |
| **L** | B | Audit-side binding-surface ratification | §3.2 (T03a, T07) |
| **P** | B | Decision-axes Problem-metadata | §3.2 + §3.5 multi-axis components |
| **Z** | C | Split surface-expansion-irrecoverable CATEGORY | §3.3 (T05, T09 tagging) |
| **AA** | A | Stage-3 prose-quality oscillation detector | §3.4 (T09 + T05 cycle component) |
| Y | C | Loom baseline-snapshot pre-flight delta check | redundant after rec X; optional |
| Tier E | E | 11 reshapes + 1 new finding + heading restoration | the remaining parks |

### 4.6 Priority order

1. **Rec X** (pi-config) — closes 4 of 11 direct parks. Highest
   leverage single pi-config change.
2. **T19 cluster heading restoration** (pi-loom) — one-line
   `git show` patch. Unblocks the cluster under rec X.
3. **Rec L + Rec P** (pi-config) — close the audit-layer gap
   that turns LOW-risk audit verdicts into pass-1+ inner-loop
   parks.
4. **Rec Z + Rec AA** (pi-config) — signal hygiene + remaining
   fixer-capability gap.
5. **Tier E reshapes** (pi-loom) — re-evaluate the list after
   recs L + P + X ship; some will be cured pre-dispatch by
   audit-side detection.
6. **Rec Y** (pi-config) — only ship if rec X has measurable
   false-negative rate.

Validation work after Tier 1–3 ships:

- Re-dispatch T14 / T16a / T12 with rec X + rec L + rec P to
  confirm no regressions.
- Re-dispatch the T19 cluster after rec X + heading restoration.
  Doubles as rec V's `(f-stop-2)` heaviest-canary validation.
- Re-dispatch T22a1 if reshape surfaces a re-author opportunity.
  Additional `(f-stop-2)` evidence for cross-finding cases.

## 5. What NOT to recommend

- **The fixer must not author findings.** Letting the fixer
  emit new spec-review entries or unguardedly narrow binding
  constraints converts it from a mechanism into an author.
  Category 1 rejects route via the audit layer (rec L);
  Category 2 capability gaps route via targeted fixer
  extensions (rec T, rec AA). Both routes preserve the
  fixer-is-not-author boundary.
- **The fixer must not widen edit surface beyond what the
  finding names.** When lens evidence indicates the right
  resolution requires editing outside the finding's named
  scope, the fixer's correct response is to reject (Category 1
  if the constraint/Problem is malformed; Category 2 if the
  fixer genuinely cannot execute). Silent surface-widening
  makes pipeline behaviour non-reproducible.
- **The audit layer must not become a substitute for the
  finding-authoring layer.** Rec L / M / P route Category 1
  detection earlier. They do not author the reshape themselves
  — a human (or a constrained auto-reshaper) does that.
- **Loosening any lens.** Every W3 raised finding is a real
  defect against the imagined or actual post-fix text. T05's
  recurring critique surface, T09's stage-3 naming cycles,
  T07's pinning-surface presupposition violations are all
  genuine. The audit lenses are doing correct work.
- **Reverting any shipped rec (J, F, K, V, T, O, M, W).**
  Every shipped rec is either fully working as designed
  (J, F, V, T, M, W) or working with a known integration gap
  that rec X closes (K, O). No revert is warranted.
- **Raising the rec O `k` multiplier from 3.** Tempting
  because it would let mis-aggregated cases squeeze through
  (e.g. T19 cluster at defaulted S=25 passes at k=7). But the
  gate's strictness is what surfaces the rec K metadata gap;
  weakening k weakens trust-override-suppression on
  genuinely-undersized origins. Rec X fixes the right defect.
- **Raising the 17-pass cap.** T09 burned 7 of 17 on stage-3
  oscillation; T11a burned 3 of 17 (pre-emptive gate exit).
  Cap is not the binding constraint.
- **Re-dispatching parked findings as-authored.** Every park
  carries an explicit per-finding reshape recommendation.
  Re-dispatching without reshape reproduces the failure.
- **Re-dispatching the T19 cluster without restoring the
  headings (or shipping rec X).** The rec O gate fires
  deterministically on the mis-aggregated budget; no random
  component; re-running without a change is a no-op.

## Appendix — file and artifact references

Most recent dispatch forensic reports (gitignored):

- `.pi/tmp/spec-fix-failure-forensics/2026-05-18T15-13-27_a2e488/`
  (canary set):
  - `multi-t19a-extend-activeinvocationregistry-entry-shape-with-invocationid-t19b-ad.md`
    (875 lines, MULTI cluster, must-fix-blocked /
    score-budget-exhausted-trust-override-suppressed; CATEGORY 1).
  - `t15a-reduce-session-model-orientation-paragraph-to-a-four-sentence-forward-linki.md`
    (538 lines, stale-precondition; CATEGORY 1).
  - `t15b-move-concurrency-semantics-into-extension-architecture-implementation-notes.md`
    (1 045 lines, must-fix-blocked / score-budget; CATEGORY 1).
- `.pi/tmp/spec-fix-failure-forensics/2026-05-18T20-36-39_b9045e/`
  (newly-dispatched batch):
  - `t03a-add-loom-package-implementation-dependencies-v1-sub-paragraph-in-pic-host-p.md`
    (612 lines; CATEGORY 1).
  - `t05-bind-frontmatter-vs-binder-binder-settings-diagnostics-prose-root-word-incon.md`
    (824 lines, surface-expansion-irrecoverable; CATEGORY 2
    **mis-tagged — see §3.3**).
  - `t06-operator-role-tui-binding-asserted-in-glossary-but-never-reconciled-with-non.md`
    (740 lines; CATEGORY 1).
  - `t07-queryerror-message-content-has-no-normativity-rule.md`
    (715 lines; CATEGORY 1).
  - `t09-bind-context-session-overview-bullet-uses-tilde-approximate-caps-that-contra.md`
    (752 lines, surface-expansion-irrecoverable; CATEGORY 2
    **mis-tagged — see §3.3**).
  - `t10-single-string-bypass-behaviour-on-whitespace-only-absent-slash-argument-is-u.md`
    (685 lines; CATEGORY 1).
  - `t11a-replace-consumes-one-slot-prose-with-explicit-forced-respond-exemption-rule.md`
    (531 lines; CATEGORY 1, classifier `_blocked.md` self-flagged
    "likely category-1 reshape false-positive").

pi-config commits (git-pinned via global settings under
`git:github.com/bitmonk8/pi-config`, cloned to
`~/.pi/agent/git/github.com/bitmonk8/pi-config/`):

- `dd974d9` — rec J. Solution approach directional.
- `f10e3c1` — rec F. `Shape: multiple` cluster dispatch.
- `344da26` — rec K. Cluster-importance aggregation.
- `8f0ccfe` — rec V. SP-2 Solution constraints advisory +
  three-mode authoring guard.
- `b20536d` — recs T + O + M + W. Stage-transition refusal,
  shadow-budget gate, pre-dispatch staleness, CATEGORY tagging.

pi-loom — current state references:

- `docs/spec-review.md` — 0 finding H1s.
- `docs/spec-review-parked.md` — 26 finding H2/H1 entries (13
  Category 1 / 3 Category 2 / 10 cascade per §1.1).

Prior forensic sets (gitignored, retained for context):

- `.pi/tmp/spec-fix-failure-forensics/2026-05-17T16-41-31_b4324e/`
  — prior dispatch run (8 reports).
- `.pi/tmp/spec-fix-failure-forensics/2026-05-16T17-52-36_347871/`
  and earlier 2026-05-15 sets — pre-pipeline-saturation
  reports retained for archaeological context only.

This document's history (recoverable via `git log
docs/spec-review-forensic-meta-analysis.md`):

- `e2a49db` — W3 rewrite around the May-19 dispatch (W2→W3
  delta narrative).
- `9f06d15` — W2 meta with recs T+O+M+W marked shipped.
- `f10156b` — W2 meta with rec V marked shipped.
- `49e746b` — W2 meta initial rec V draft + constraint sweep.
- `8cf798a` — W2 meta restructured around fixer/finding
  architectural cut.
- `44b83c3` — W2 meta initial draft.

End of meta-analysis.
