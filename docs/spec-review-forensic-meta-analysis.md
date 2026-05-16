# Meta-analysis — diverging-finding forensic reports

```
PROJECT: pi-loom
SCOPE: 3 diverging forensic reports (T22a1, T20, T19b) from forensicsRunId 2026-05-15T18-46-12_c1e9c1
TOTAL_PASSES_BURNED: 15 (5 per finding)
TOTAL_AUDIT_MISS_LENSES: 21 false-negative fix-class lens dimensions across the three findings
GENERATED: 2026-05-16T08:00:00Z
```

## Sources

- `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t22a1-session-binding-contract-sub-section-in-pic-anchor-paraphrase-pi-source-ci.md`
  — FIXCOUNTS 6,8,4,4,7; pre-flight audit verdict `NONE / NO_ACTION`.
- `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t20-resource-exhaustion-under-concurrent-subagent-invocations-is-undisclaimed.md`
  — FIXCOUNTS 4,4,4,6,7; pre-flight audit verdict `LOW / NO_ACTION`.
- `.pi/tmp/spec-fix-failure-forensics/2026-05-15T18-46-12_c1e9c1/t19b-add-invocation-id-field-to-runtimeevent-payload-declaration.md`
  — FIXCOUNTS 5,1,7,7,9; pre-flight audit verdict `NONE / NO_ACTION`.

The two limit-cycle reports (T21, T19a) and the two top-level-refused
reports (T19c, T19d) are out of scope for this meta-analysis; the user
asked specifically about the diverging set.

## Common failure shape

All three diverging fix-loops share an identical structural signature:

1. **The audit returned PASS on every lens.** All three findings were
   classified `NONE` or `LOW` overall risk with `NO_ACTION` recommended.
   The audit's reasoning in each case was anchor-shaped, name-shaped, or
   structure-shaped (the edit lands on a real anchor, cited names exist,
   Solution constraints are well-formed). The audit never simulated the
   prose the fixer would author into the section, never grepped sibling
   files for cross-document set-equivalence, never checked the parked
   state of named cross-references.

2. **The pass-N fixer's edit changed the spec shape against which the
   pass-(N+1) lenses evaluated.** Each loop reached a midway pass at
   which the fixer made a structural move — splitting an anchor (T22a1
   pass 3), shifting a routing enumeration's closure-quantifier (T20
   passes 3–5), extracting an inline comment into a new narrative
   paragraph (T19b pass 5) — that expanded the surface area the
   prose-quality lenses could attack. The expanded surface drew a fresh
   wave of fix-class findings on dimensions the original finding had
   never touched. The divergence detector then fired on the trajectory
   uptick produced by that wave.

3. **The lens corpus raised zero filtered false positives across all
   passes of all three findings.** Every finding the inner loop raised
   was a real defect against the text the fixer authored. The
   divergence is not lens noise — the lenses were doing their job
   correctly. The loop diverged because the *combination* of
   ScopeGuards plus prose-quality lens battery plus per-pass amnesia
   (no fixer can see prior passes' finding text) admits no fixed point.

This signature appears in all three reports' root-cause analyses,
phrased differently, and in all three reports' `Why is NOT recommended:
Loosening the lenses` paragraph.

## Cross-finding pattern table

| Pattern | T22a1 | T20 | T19b | Recurrence rank |
|---|---|---|---|---|
| Audit produced PASS on every lens with no simulated-fixer-output check | ✓ (cause for 8 lens misses) | ✓ (cause for 7 lens misses) | ✓ (cause for 6 lens misses) | 3/3 |
| Mid-loop structural move (anchor split, placement move, closure-strength shift) expanded the lens-attack surface | ✓ pass-3 atomicity-split | ✓ passes-3–5 preamble re-quantification | ✓ pass-5 narrative extraction | 3/3 |
| Epistemic-strength / closure-strength / terminology drift across passes (no per-pass fixer memory of prior fix justifications) | ✓ cardinality wording cycled 5×: exactly-one → presupposition → ↔ → at-most-one → one-way | ✓ closure preamble cycled: only → primarily → through-the-following | ✓ inline-comment cycled: sourced-from-registry → optional-with-PIC-cite → presence-rule-carve-out → bundled-comment → narrative-extraction | 3/3 |
| ScopeGuards mathematically rule out every lens-acceptable fix-shape (the "squeeze") | △ (constraints fenced forbidden surfaces but did not cap permitted prose; lenses re-attacked indefinitely on the permitted side) | ✓ ScopeGuards 1+2+4 jointly unsatisfiable for the OS-class routing member | ✓ ScopeGuard 2 names parked siblings as off-limits | 3/3 (T22a1 is the soft-squeeze variant; T20 and T19b are hard-squeezes) |
| Co-resolve / adjacency dependency on text owned by a different finding | T22a1 needed text owned by line-807 bump-procedure invariant | T20 needed routing widening owned by `hard-ceilings.md` | T19b needed text owned by parked T19a/T19c/T19d/T19e | 3/3 |
| Placement-vs-locality trade-off: inline restatement of a normative rule conflicts with the placement lens that wants the rule on its canonical owner page | △ (line-807 editorial-review-checklist invariant) | ✓ (`hard-ceilings.md:102` for OS class, `errors-and-results.md` for HTTP 429) | △ (PIC-1 (g) dedup-tuple rule owns the territory T19b's inline comment trespassed on) | 3/3 |
| Working-tree spec edits left uncommitted on divergence are unsafe to land (entrench the contradiction the loop was trying to fix) | ✓ explicit "What is NOT recommended" entry | ✓ explicit "What is NOT recommended" entry | ✓ explicit "What is NOT recommended" entry | 3/3 |

## Audit-side systemic failures

The single highest-leverage finding of the meta-analysis: **the audit
gate is the cheapest place to prevent every one of these failures, and
the audit gate's current procedure is structurally blind to all three
failure-mode triggers.**

Specifically:

- **The audit's `co-resolve` / `must-precede` / `must-follow`
  Relationships check treats edge existence as a guarantee that the
  named sibling will land in the same fix batch.** In practice, the
  named sibling may have been parked between audit time and fix time
  (T19b — all four `co-resolve` siblings parked before T19b's loop
  ran). The audit had no parked-state check. The same blindness
  applies to siblings that exist but are queued behind the current
  finding in picker order, or to siblings the user may park in the
  next batch.

- **The audit's `clarity` / `consistency` / `naming` / `cruft` /
  `testability` checks evaluate the *finding's Solution approach
  prose* for those properties, not the *prose the fixer will be forced
  to write* to discharge the finding.** For paraphrase-class findings
  (T22a1) and routing-restatement-class findings (T20), the
  finding-prose passes those checks trivially while the imagined
  fixer-prose fails them just as trivially. The audit needs to either
  (a) draft a representative fixer output and evaluate *that* against
  the prose-quality lenses, or (b) declare the prose-quality lenses
  inapplicable for placement / paraphrase / restatement findings and
  raise their dimensions to RISK_LOW by default.

- **The audit's `consistency` and `completeness` checks verify that
  cited identifiers exist; they do not verify cross-document
  set-equivalence between the rule the finding pins and the rule the
  canonical owner page pins.** T20 burned five passes on a contradiction
  with `hard-ceilings.md:102` that one 30-second `grep child-process-handle
  docs/spec_topics/hard-ceilings.md` would have surfaced at audit time.

- **The audit is one-shot per finding; it does not re-audit surviving
  cluster members after a sibling parking event.** When the
  `/fix-spec-shape-single-findings` outer loop parks a finding (or when
  the user manually moves a finding), every surviving member of the
  parked finding's co-resolve cluster has its audit assumptions
  invalidated. The current pipeline carries the stale verdict forward
  and dispatches the next member into a fix-loop the audit no longer
  endorses.

These four audit gaps are the proximate cause of 21 of the 21
false-negative lens dimensions documented across the three reports.

## Loop-side systemic failures

The audit gate is the cheapest fix; the inner loop is the most
behaviourally observable fix. Three loop-side gaps recur across all
three reports:

- **No structural-recommendation gate in `spec-diff-fix-classifier`.**
  When a triage pass produces a fix-class finding whose remediation
  changes the *anchor count*, *heading count*, *section count*, or
  *placement* of a section a *prior pass in the same loop just installed*,
  the classifier should route it to `human-review` or `defer`, not `fix`.
  T22a1's pass-3 atomicity-split (Finding D) and T19b's pass-5 placement
  move are the canonical instances. Both were applied as ordinary
  in-loop fixes; both expanded the surface and tripped divergence on
  the immediately following pass.

- **No detection of mathematically-unsatisfiable ScopeGuard
  combinations.** The current divergence detector fires on FIXCOUNT
  trajectory shape only. T20's failure shape — *lens findings cluster
  around one resource/concept across passes; ScopeGuards forbid every
  plausible structural fix; per-pass fixer compromises reshape adjacent
  prose without addressing the central gap* — is detectable by pass 2
  if the loop tracks the dominant concept across passes' triages and
  notices it persists. The classifier already routes ScopeGuard-blocked
  fixes to ignore-class (the T20 debt-register entries witness this);
  promoting that signal to a loop-level termination condition would
  exit at pass 2 instead of pass 5.

- **No suppression of fix-class findings whose only viable resolution
  is ScopeGuard-blocked.** A fix-class finding whose "Fix costs / Risk"
  paragraph enumerates remedies that all violate at least one
  ScopeGuard of the originating finding is guaranteed to remain unfixed
  by the next pass's fixer. The classifier should demote such findings
  to ignore-class with rationale `ScopeGuard-blocked`. T20's pass-5
  error-model Finding T-1 is the witness: its only proposed remedies
  ("broaden CodeToolError construction site / coin a new routing") are
  forbidden by ScopeGuards 2 and 4 — and promoting it to fix-class
  guaranteed pass 5 could not satisfy it.

## Finding-shape pathologies

Two distinct finding-shape pathologies emerge across the three reports.
Both are addressable by the audit-side or dispatch-side improvements
above; neither is unique to any specific spec topic.

- **The soft squeeze (T22a1):** ScopeGuards correctly fence the
  *forbidden* surfaces (`session_shutdown` literal, T22b/T22c
  pre-installation, T15c concurrent-sessions edit) but place no cap on
  the *permitted* prose surface. The 14 prose-quality lenses are
  calibrated for normative spec content; once a paraphrase sub-section
  exists, the lenses can generate clarity / cruft / naming / scope /
  testability findings indefinitely against any subsequent prose tweak.
  The fix shape: prose-budget cap for placement-class and
  paraphrase-class findings (per-lens assessed-finding count capped at
  ⌈log₂(target word count)⌉ or similar).

- **The hard squeeze (T20, T19b):** the finding's ScopeGuards
  mandate content X (T20: three-resource ownership enumeration; T19b:
  `invocation_id` field on `RuntimeEvent`) whose discharge requires
  edits to text the same ScopeGuards forbid (T20: routing widening on
  `hard-ceilings.md`; T19b: source / generator / mint-timing on the
  parked T19a's registry-contract paragraph). The only convergent
  outcomes are *reshape* (split the finding so each half lives in one
  owner-page's scope) or *park* (defer the surviving member until the
  prerequisite siblings are landed). The fix shape: a dispatch-time
  pre-flight that detects both variants and refuses dispatch with a
  `parked-cluster-cascade` or `scope-guard-set-unsatisfiable` reason
  before the inner loop runs.

## Ranked recommendations

Ranked by *how many of the three diverging failures would have been
prevented* if the recommendation had been live at audit time. Numbers
in parentheses are the count of the three failures the recommendation
would have prevented (best case — assumes the recommendation fires
cleanly and the user acts on its signal).

### Pipeline changes (prevent recurrence)

1. **(3/3) Audit must grep `docs/spec-review-parked.md` for every
   Relationships edge and every Solution-constraint identifier
   reference before issuing a PASS verdict on `completeness`,
   `assumptions`, `scope`, or `consistency`.** When any named sibling
   is in `spec-review-parked.md`, the lens predictions on those four
   dimensions should flip to `RISK_HIGH` with an explicit
   `parked-cluster-cascade` rationale. Per-finding cost: one grep per
   edge / identifier (typically 4–10 per finding). Per-finding
   benefit: would have caught T19b at audit (parked siblings explicit)
   and would have raised T20 and T22a1's adjacency-dependency edges
   (line-807 invariant, `hard-ceilings.md:102`) to high-risk even
   without parking signal.

2. **(3/3) Audit must perform cross-document set-equivalence checks
   when the finding's Solution approach restates a normative rule that
   has a canonical owner elsewhere in the spec.** Heuristic trigger:
   the Solution approach contains both an error-class name (e.g.
   `internal-error`, `TransportError`, `CodeToolError`, `QueryError`)
   and a resource / event / concept class name. Action: grep the
   canonical owner page for the resource/event/concept name and
   compare the routing it pins against the routing the finding pins.
   Per-finding cost: one cross-page grep + comparison. Per-finding
   benefit: would have caught T20's `hard-ceilings.md:102` contradiction
   at audit; would have caught T22a1's subject-NP / cardinality /
   vocabulary mismatch with the spec.md citing sentence.

3. **(3/3) `/fix-spec-shape-single-findings` dispatcher must run a
   pre-flight that refuses any finding whose Solution constraints
   name a parked sibling as the owner of a needed surface, OR whose
   ScopeGuard set is mathematically unsatisfiable for at least one
   class member it mandates.** Exit with `top-level-refused` and
   reason `parked-cluster-cascade` or `scope-guard-set-unsatisfiable`;
   surface a "park or re-shape" recommendation in the same shape this
   meta-analysis recommends. Per-finding cost: one grep + one
   ScopeGuard parse per finding. Per-finding benefit: would have
   prevented all three loops from running — 15 passes of inner-loop
   work avoided.

4. **(2/3 — T22a1, T19b)** Add a structural-recommendation gate to
   `spec-diff-fix-classifier`. When a triage finding's remediation
   recommends changing the *anchor count*, *heading count*, *section
   count*, or *placement* of a section a prior pass in the same loop
   just installed, route the finding to `human-review` or `defer`
   instead of `fix`. Per-loop cost: at most one human touch on the
   loop's structural moves (rare). Per-loop benefit: would have
   stopped T22a1 at pass 3 and T19b at pass 5 before the surface
   expansion fired divergence detection.

5. **(2/3 — T20, T22a1)** Add a *prose-budget cap* to placement-class
   and paraphrase-class findings. For findings whose Kind is
   `placement` and whose Solution approach mentions "paraphrase" or
   "forward-link", cap per-lens assessed-finding count at
   ⌈log₂(target word count)⌉. Per-finding cost: one additional cap
   parameter in the classifier. Per-finding benefit: prevents the
   asymptotic prose-quality re-attack pattern documented for T22a1's
   prose-rewrite cycle and T20's vocabulary churn.

6. **(2/3 — T20, T19b)** Promote ScopeGuard-blocked classification
   from ignore-class to loop-termination signal. When the classifier
   has demoted ≥ N (suggested N = 3) fix-class findings to
   ignore-class with rationale `ScopeGuard-blocked` across two
   consecutive passes, exit the loop with `STATUS:
   scope-guard-blocked-divergence` instead of waiting for FIXCOUNT
   divergence to fire. Per-loop cost: count + threshold check.
   Per-loop benefit: would have shortened T20's loop from 5 passes
   to 2 and T19b's loop from 5 passes to 3.

7. **(1/3 — T22a1)** Track *cumulative-drift-from-finding-text* as a
   termination signal. If a pass's diff introduces an anchor / heading
   / sub-section the finding's Solution approach did not name, abort
   the loop with `drifted-beyond-finding-scope` even if FIXCOUNTs are
   converging. This is the diagnostic-quality improvement on
   recommendation 4 — the dispatch already exits, but with a more
   actionable error code.

8. **(1/3 — T19b)** Re-audit surviving cluster members after any
   parking event. When `/fix-spec-shape-single-findings` parks a
   finding (or when the user manually moves a finding), re-audit
   every other finding whose Relationships edges name the parked
   finding before the next fix-spec batch. Surface verdict flips.
   Per-event cost: small set of re-audits. Per-event benefit:
   prevents the same audit-vs-actual divergence from recurring on
   the next surviving cluster member (relevant once recommendations 1
   and 3 are live; redundant absent them, because (1) and (3) already
   catch the parked-sibling state at the next finding's audit/dispatch).

### Immediate (this run)

The diverging-set failures share an identical immediate remedy: revert
any uncommitted spec edits, park the finding, and either reshape
(T22a1, T20) or wait for sibling un-parking (T19b). All three were
correctly parked by the orchestrator and the spec edits were correctly
reverted; no immediate cleanup is outstanding.

The reshape work itself remains the user's:

- **T22a1 (and the T22-cluster).** Two reshape paths are viable: (a)
  add Solution constraints pinning single-anchor invariant and
  preserving spec.md cardinality wording verbatim modulo the
  forward-link clause; (b) hand-author the five-line edit directly and
  skip the inner loop (the audit's NO_ACTION verdict was correct in
  spirit; the divergence was a loop pathology, not a finding
  implementability problem). Per the T22a1 forensic report, option
  (b) is the cheaper of the two.

- **T20.** Two reshape paths: (a) split into T20a (ownership-boundary
  statement only) + T20b (routing widening on `hard-ceilings.md`);
  (b) relax ScopeGuard 1 to permit dropping the OS-level class from
  the ownership enumeration. Per the T20 forensic report, option (b)
  is the lowest-edit-cost convergence path.

- **T19b (and the T19-cluster).** The five-finding cluster has
  collapsed in its entirety; T19a/T19b/T19c/T19d/T19e are all parked.
  When the cluster is later un-parked, authoring it as a single
  combined finding (e.g. "T19 — invocation_id source, wire field,
  dedup widening, cancellation population, and emission timing") with
  all five sets of edits in one Solution approach is the only
  per-finding shape that will avoid recurring the scope-guard squeeze
  on the surviving member.

## What is NOT recommended

Each per-finding report ends with a "What is NOT recommended" section.
All three converge on the same three anti-recommendations, which this
meta-analysis lifts unchanged:

- **Loosening the lens corpus.** Zero filtered false positives across
  15 passes. Every lens claim was verifiable against the spec text.
  Loosening any lens to make any of these three loops converge would
  let real defects into the spec on unrelated future findings.

- **Cap-bumping the inner-loop pass count past 5 (or any other
  "max divergent passes before forced commit" knob).** The
  divergence is signal, not noise; forcing a commit on divergence
  would amount to silently giving up on the lens checks. The correct
  lever in every case is at the audit gate (recommendations 1–2) or
  the dispatch gate (recommendation 3), not the loop budget.

- **Landing the uncommitted pass-N spec edits.** For all three
  findings, the working-tree state at divergence was the pass-N
  fixer's compromise output, which leaves the underlying gap unclosed
  while asserting paragraph-scope coverage. Committing any of those
  diffs would entrench the contradiction the loop was trying to
  resolve.

See **Architectural redesign proposals** below for restructuring the
loop without weakening the lens corpus, capping passes blindly, or
committing compromised diffs.

## Architectural redesign proposals

> The change proposals in this section and the `Affected agents and
> commands` tables under it have been extended to also cover the plan
> and implementation pipelines in `docs/prompt-subagent-changes.md`.
> This section remains the spec-only, evidence-backed origin.

The tactical recommendations above (recs 1–8) are incremental — they
patch specific audit and loop gaps without changing the pipeline's
structure. Three deeper changes, surfaced after writing those recs,
address the same failure modes at the architectural level. Each
subsumes one or more tactical recs and the three are mutually
reinforcing.

Proposed implementation order: **A → B → C1 → C2**. A is the
highest-leverage single change. B is the cleanest follow-up (least
new code, biggest correctness improvement). C1 is the largest
implementation effort but the largest reduction in pass count. C2
is a tightening that depends on per-pass snapshot infrastructure not
currently in the loop.

### A. Severity-weighted triage at `spec-diff-fix-classifier`

The classifier currently treats every fix-class lens finding as
equally promotable: if a finding parses as fix-class shape, it goes
to the fixer. There is no comparison between the raised lens
finding's importance and the originating finding's importance, so a
low-importance prose-quality finding (clarity / cruft / naming on
rewritten prose) can block a higher-importance correctness finding
(paraphrase-installation, wire-field addition, ownership disclaimer).
All three diverging cases plus both limit-cycle cases exhibit this
pattern.

Proposed rule:

1. `severity(raised) > severity(origin)` → **fix (MUST)**. If the only
   remediations all violate a ScopeGuard, exit `top-level-refused`
   with rationale `must-fix-blocked-by-scope-guard`. Do NOT enter
   another inner-loop pass.
2. `fix_risk(raised) == very-low` → **fix (SHOULD)**. The spec stays
   clean of trivial-cost defects.
3. Else → **defer to spec debt** with rationale
   `lower-importance-than-originating-finding`. The originating
   finding lands; the spec ships with a known small defect.

**Forensic coverage:** 5 of 7 failed findings route correctly under
this rule on pass 1 or 2 instead of pass 5 (T22a1, T20, T19b
diverging; T21, T19a cycled). T19c, T19d (top-level-refused) are
unchanged — already exit at pass 0.

**Source of importance signal:** lens-category-driven ordering
(correctness > implementability > ergonomics > prose-quality) is
sufficient for a first cut and matches the forensic data. Later
refinement could attach explicit per-finding importance at lens
output or at audit time.

**Subsumes recs 3 and 6.** Rec 7 (drift-from-finding-text) becomes a
diagnostic-quality refinement rather than a primary termination
signal.

### B. Drop class-3 solution constraints

The forensic data shows three distinct things called "Solution
constraints" or "ScopeGuards":

- **Class 1 — cross-reference ownership pins.** *"T22b owns the
  Future-Considerations cross-link; T15c owns the concurrent-sessions
  sentence."* Prevent the fixer from authoring into a sibling
  finding's territory. Useful, low-risk, observable as documentation.
  **Keep.**
- **Class 2 — project-policy pins.** *"no-invented-ids"*, *"no
  Pi MUST in loom-side voice"*. Project-wide invariants any fix in
  any finding should observe. **Keep.**
- **Class 3 — shape mandates.** *"Must use positive
  ownership-boundary statement"*, *"Must enumerate three resource
  classes"*, *"Must source from registry the same channel as
  loom"*. Pre-commit to a solution shape before the loop has
  evidence about realizability. **Every diverging and cycled case
  failed inside a class-3 constraint. Drop.**

The class-3 problem: their reasonableness depends on a future
solution shape the constraint author cannot see. T22a1's *missing*
class-3 constraint (single-anchor invariant) would have prevented
divergence — but that constraint is only authorable after watching
pass 3 split the anchor. T20's ScopeGuards 1+2+4 are jointly
unsatisfiable for the OS-class — only discoverable by running the
loop. T19b's ScopeGuard 2 was correct when authored (T19a/c/d/e were
live siblings) and became fatal after they parked.

The asymmetry between the three classes:

- Class 1+2 say *"don't touch these files / IDs"*. Negative space.
- Class 3 says *"do touch these files in this specific shape"*.
  Positive space.

Class 3 is what fails. Negative-space constraints can be checked
without simulating the loop; positive-space constraints cannot.

**Migration of existing findings:** `docs/spec-review.md` and
`docs/spec-review-parked.md` carry class-3 constraints across most
active findings. Two options:

- **Aggressive sweep:** strip class-3 constraints from every finding
  in both files in one pass. Cheap and consistent. Risk: occasional
  regression on a finding that was implicitly relying on a class-3
  pin to stay in scope.
- **Lazy strip-on-touch:** strip class-3 only on each finding's next
  picker / audit / reshape pass. Spreads cost. Risk: stale class-3
  constraints continue to affect findings until they are individually
  touched.

**Fallback if dropping causes regressions:** demote class 3 from
constraint to *hint*. Fixer tries the suggested shape on pass 1; if
a higher-severity lens finding contradicts it, the fixer is licensed
to adopt an alternative shape and the loop logs `shape hint not
satisfied — alternative shape adopted because [lens X with severity
Y]`. Hints preserve the audit's reasoning as documentation; the loop
is not bound to them.

**Subsumes the audit / reducer side of every divergence cause cited
under "Hard squeeze" in §Finding-shape pathologies.** Compatible
with proposal A (A handles the lens floods; B removes the forced
unsatisfiability).

### C. Stage the lens corpus + add backtracking

Two related sub-proposals. The premise: the inner loop currently
runs all ~15 lenses in parallel on every pass and forward-fixes
monotonically. The lenses are not on the same importance axis, and
a pass that expands the surface cannot be undone. Both choices
directly produced the diverging-loop signature documented in §Common
failure shape.

#### C1. Staged lens introduction

Proposed tiering:

| Tier | Purpose | Lens categories | Convergence target |
|---|---|---|---|
| 1 | Correctness | assumptions, consistency, error-model, completeness, traceability, implementability, prescription | zero fix-class findings |
| 2 | Structural | placement, scope, external-entities | zero fix-class findings |
| 3 | Prose-quality | clarity, cruft, naming, testability | converge under severity-weighted triage (A); per-stage budget cap as backstop |

The loop runs tier 1 to convergence first. Only then introduces
tier 2 (with tier 1 still asserted on every subsequent pass). Only
then introduces tier 3. This gives the fixer a stable structural
base before prose-quality lenses start finding issues in re-written
prose.

**Forensic coverage:**

- **T22a1:** tier 1 stabilises at pass 2. Tier 2 introduces the
  pass-3 atomicity-split (placement lens). Under staging, tier 3
  runs against a stable post-pass-3 base; prose-quality re-attack on
  the doubled surface is constrained by the tier-3 budget.
- **T20:** tier 1 detects the `hard-ceilings.md` set-equivalence
  contradiction immediately (consistency / completeness). Under A,
  MUST-fix, blocked → `top-level-refused`. Loop exits at tier 1 pass
  1.
- **T19b:** tier 1 detects the parked-sibling source / dedup /
  cancellation gaps immediately. Same exit shape as T20.

#### C2. Backtracking on surface expansion

The current loop forward-fixes monotonically: each pass's fixer
applies fixes against the working tree as it stood at the start of
the pass. There is no rollback if a pass's fixes turn out to expand
the surface.

Proposed addition: snapshot the working tree at each pass boundary
(and each stage boundary under C1). If pass N produces fix-class
count > k × pass N−1's count (suggested k = 1.5 or k = 2), revert
the working tree to the pass N−1 snapshot, mark the pass-N fix that
*triggered* the expansion (the structural move) as poisoned, and
re-run pass N with the poisoned fix excluded from the classifier's
fix queue. If the same poisoning condition recurs across two
consecutive passes, exit `top-level-refused` with rationale
`surface-expansion-irrecoverable`.

This is a stronger variant of the current divergence detector
(which only exits, never reverts). It preserves convergence
opportunities the current detector silently discards.

**Forensic coverage:**

- **T22a1:** pass 3 atomicity-split (4 → 4 counts) does not trigger
  the 1.5× rule; pass 4 (4 → 7) does. Backtrack to pass-3 snapshot,
  exclude the atomicity-split fix, re-run pass 3, continue.
- **T19b:** pass 5 placement move (7 → 9) triggers the 1.5× rule.
  Backtrack, exclude the placement move, re-run pass 5.
- **T20:** pass 5 (6 → 7) does not trigger 1.5× rule; current
  divergence detector still fires. Backtracking does not help here;
  severity-weighted triage (A) is the relevant lever.

**Subsumes recs 4, 5, 7.** Rec 4 (structural-recommendation gate)
becomes unnecessary because backtracking handles structural moves
post-hoc with better signal. Rec 5 (prose-budget cap) is replaced by
the tier-3 staged convergence target plus severity-weighted defer.
Rec 7 (drift-from-finding-text) is replaced by the
surface-expansion detector.

### D. Affected agents and commands

For each proposed change, the agent or command and the kind of
change.

#### Affected by A (severity-weighted triage)

| Agent / command | Change |
|---|---|
| `spec-lens-*` (each lens agent) | Attach `importance` tier to every finding it raises, OR expose its category's inherent importance via metadata. One-line addition per lens. |
| `spec-diff-fix-classifier` | New severity-comparison logic. New route `must-fix-blocked-by-scope-guard`. New defer rationale `lower-importance-than-originating-finding`. |
| `spec-diff-fix-loop` | New STATUS code `must-fix-blocked`. Per-pass severity stats in NOTES. |
| `/fix-spec-shape-single-findings` (this prompt) | Route `must-fix-blocked` → forensics → parker, parallel to `failed-cap` / `diverging` / `limit-cycle`. |
| `spec-fix-failure-forensics` | Handle new failure mode in its `Status:` taxonomy. |
| `spec-review-parker` | Handle new failure mode in its `FailureMode:` parameter. |
| `docs/spec-review.md` findings | The `high` / `medium` / `low` triage tag already present is used as `severity(origin)`. No migration required. |

#### Affected by B (drop class-3 solution constraints)

| Agent / command | Change |
|---|---|
| `/spec-review` (initial finding authoring) | Stop authoring class-3 constraints in `## Solution constraints`. Class 1 and 2 remain. |
| `spec-review-shape-single-reducer` | Same. |
| `spec-review-reshape` | Same. |
| `spec-review-audit-finding` | Stop checking class-3. RISK predictions widen to span alternative shapes the loop might adopt. |
| `spec-review-fixer` (top-level) | Stop emitting class-3 in its `## Scope guards (for inner loop)` section. |
| `spec-diff-fixer` (inner) | No longer refuse fixes based on class-3 ScopeGuard. |
| `spec-diff-fix-loop` | ScopeGuards block forwarded to inner fixer is reduced to class 1+2 only. |
| `docs/spec-review.md` + `docs/spec-review-parked.md` | Migration: aggressive sweep (strip class-3 from every finding in one pass) OR lazy strip-on-touch. Choice deferred — aggressive is cheaper and more consistent. |

#### Affected by C1 (staged lens introduction)

| Agent / command | Change |
|---|---|
| `spec-lens-*` (each lens agent) | Declare a tier (correctness / structural / prose-quality) in metadata. One-line addition. |
| `spec-diff-fix-loop` | Invoke lenses in stages. Per-stage convergence check. New status fields `STAGE:` and `STAGE_PASSES:` in output block. |
| `spec-diff-fix-classifier` | Stage-aware: knows which tier is active. Severity comparison still applies within stage (compatible with A). |
| `/fix-spec-shape-single-findings` | NOTES surfaces stage-level details on failure; routing logic unchanged. |

#### Affected by C2 (backtracking)

| Agent / command | Change |
|---|---|
| `spec-diff-fix-loop` | Per-pass and per-stage working-tree snapshot via `git stash create` or a shadow worktree. Surface-expansion detector with k threshold. Backtrack-and-exclude protocol. New STATUS code `surface-expansion-irrecoverable`. |
| `spec-diff-fix-classifier` | Read poisoned-fix list and exclude marked fixes from the active queue. |
| `/fix-spec-shape-single-findings` | Route `surface-expansion-irrecoverable` → forensics → parker. |
| `spec-fix-failure-forensics` + `spec-review-parker` | Handle new failure mode. |

### Change interactions

A and B are independent and additive. A reduces the cost of getting
class-3 wrong (most low-importance lens findings defer); B removes
the forced unsatisfiability that A would otherwise have to
detect-and-refuse. Together they handle all 7 forensic-report
failures at pass 1 or 2.

C1 layers on top of A+B with no conflict. It provides cheaper
convergence on findings that A alone would still let run for 2–3
passes.

C2 layers on top of A+B+C1 and handles the residual cases where
surface expansion appears within a single stage (rare but observed
in T22a1's tier-2 atomicity-split equivalent).

The four changes are independently shippable. Each adds a new
STATUS code and routing branch but does not regress any existing
one, so A can ship without B / C1 / C2 and the pipeline continues
to work — just with the unsatisfiability cases that B would have
removed still surfacing as `must-fix-blocked-by-scope-guard`.

End of meta-analysis.
