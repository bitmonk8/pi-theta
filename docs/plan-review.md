# Triaged Plan Review — plan

_Generated: 2026-06-10T20:55:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T37) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 30 medium retained; 34 low discarded; 4 low/duplicate findings merged into 4 cluster findings; 16 NIT dropped; 0 false dropped._

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

---

# T02 — H6a transitive-completeness governance rule is parked in H6a's Deps, not the authoring conventions

**Original heading:** `H6a` Deps-completeness governance rule placed in `H6a`, not conventions
**Original section:** docs/plan_topics/conventions.md
**Kind:** placement
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H6a`'s `Deps.` field carries an explanatory parenthetical that ends with a cross-cutting plan-maintenance obligation: *"The set MUST stay transitively complete — any future leaf that can introduce an executable REQ-ID, a numbered-REQ-ID citing test, or an un-anchored MUST is a new dependency of this leaf, otherwise the gate can activate against incomplete coverage."* This is not a fact about `H6a`'s current dependency list; it is a standing rule directed at whoever later adds a new coverage-producing leaf to the plan.

A plan author adding a leaf follows the authoring path the plan advertises: `plan.md` "How to use this plan" (copy `leaf-template.md`, link the leaf into a section, maintain `coverage-matrix.md`) and the cross-cutting rules in `conventions.md`. None of those entry points mentions the transitive-completeness obligation, and there is no reason for a leaf author to read the dependency parenthetical of a terminal release-gate leaf they are not editing. The obligation is correct and well-stated; it is simply located where the person who must act on it will not encounter it.

## Plan Documents

- `docs/plan_topics/H6a-live-corpus-activation.md` — `Deps.` parenthetical (edited)
- `docs/plan_topics/conventions.md` — `## Cross-cutting rules (every leaf)`, *REQ-ID discipline* (edited)
- `docs/plan.md` — "How to use this plan" (read-only; the authoring entry point a plan author actually consults, used to confirm the rule is absent from the advertised path)

## Spec Documents

None

## Affected Leaves

**Phases:** Release gate

**Leaves (implementation order):**

- `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate) — (modified)

(`conventions.md` is a cross-cutting plan file, not a leaf. The rule concerns hypothetical future leaves generically; the fix relocates prose and adds no new leaf and changes no existing leaf's `Tests.`/`Ships when`.)

## Consequence

**Severity:** advisory

A plan author adding a future coverage-producing leaf consults `plan.md`'s authoring steps and `conventions.md`, not `H6a`'s dependency parenthetical, so the transitive-completeness obligation can go unseen. The new leaf is then omitted from `H6a`'s `Deps.`, letting the release gate be sequenced (and activated) before that leaf lands — reconciling the closing gate against incomplete coverage. The rule itself is present and correct, so this is a discoverability gap, not a defect in the rule.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** 5353dd7 ("pi-loom plan: resolve \"Release-gate activation has no owning leaf\"", 2026-06-10)
**History:** The `H6a-live-corpus-activation.md` leaf was created by commit 5353dd7 (`git log --follow` shows it as the leaf's oldest commit; the commit's diffstat adds the file with +15 lines and no deletions). The `Deps.` parenthetical containing "The set MUST stay transitively complete … is a new dependency of this leaf" was part of that initial authoring — `git log -S "stay transitively complete" -- docs/plan_topics/H6a-live-corpus-activation.md` returns only 5353dd7, confirming the phrase entered at the leaf's inception and has not been edited since (the one later commit touching the file, 953e3fa, did not alter it). The placement defect therefore dates from the moment the leaf was authored rather than being introduced by a subsequent edit.

## Solution Space

**Shape:** single

### Recommendation

Relocate the standing plan-maintenance obligation from `H6a`'s `Deps.` parenthetical into the *REQ-ID discipline* cross-cutting rule in `docs/plan_topics/conventions.md`, where leaf authors look for authoring rules.

In `docs/plan_topics/conventions.md`, *REQ-ID discipline*, append a plan-maintenance sentence stating that whenever a new leaf is added that can introduce an executable REQ-ID, a numbered-REQ-ID citing test, or an un-anchored normative MUST, that leaf MUST be added to `H6a`'s `Deps.` so the release gate stays sequenced after every coverage-producing leaf — citing `H6a` by ID and linking `H6a-live-corpus-activation.md`.

In `docs/plan_topics/H6a-live-corpus-activation.md`, strike the sentence beginning "The set MUST stay transitively complete —" from the `Deps.` parenthetical. The parenthetical's preceding sentences (which explain that the current set is the complete coverage-producing set) stay; optionally replace the struck sentence with a back-pointer such as "see *REQ-ID discipline* in `conventions.md` for the obligation to keep this set complete as leaves are added." The relocated text must preserve the consequence clause ("otherwise the gate can activate against incomplete coverage") so the maintenance rule still states why it matters at its new home.

## Relationships

- T03 "Live-corpus gate activation has no documented rollback and relies on prose-only Deps completeness" — same-cluster (both touch `H6a`'s `Deps.` transitive-completeness prose; that finding addresses the lack of a mechanical guard / rollback, this one addresses where the authoring rule lives — resolve independently)

---

# T03 — Live-corpus gate activation has no documented rollback and relies on prose-only Deps completeness

**Original heading:** Live-corpus gate flip has no stated rollback; discipline-only Deps completeness
**Original section:** docs/plan_topics/H6a-live-corpus-activation.md
**Kind:** risk
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H6a` is the terminal release-gate leaf that flips `H5a`'s closing gate from its seeded-fixture footing to its live-corpus footing. From the moment this leaf lands, an unmapped executable REQ-ID, a coverage-matrix-mapped numbered REQ-ID with no citing test, or an un-enumerated un-anchored MUST reddens `npm test` for every contributor against `main` — a blast radius spanning all contributors' CI.

Two risk-management gaps sit on that flip. First, the leaf states no rollback posture: nothing in `H6a` records that reverting the activation commit returns the gate to the `H5a` seeded-fixture footing and stops `main` reddening on coverage that later work is still landing. Recovery exists by construction (revert the commit) but is undocumented, so an operator facing a red `main` has no stated recovery step. Second, the completeness of `H6a`'s `Deps.` set — the property that guarantees the gate only activates once every coverage-producing leaf has landed — is enforced only by the prose "The set MUST stay transitively complete … any future leaf … is a new dependency of this leaf." There is no mechanical guard: a future leaf that introduces an executable REQ-ID but is not added to `H6a`'s `Deps.` lets the gate activate against incomplete coverage, reddening `main` without warning.

## Plan Documents

- `docs/plan_topics/H6a-live-corpus-activation.md` — Adds / Deps (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — Adds (option-dependent)
- `docs/plan_topics/conventions.md` — *REQ-ID discipline* (read-only)
- `docs/plan.md` — Release gate (read-only)
- `docs/plan_topics/coverage-matrix.md` — release-gate clause (read-only)

## Spec Documents

None — the fix is internal to plan files.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified under the canary option; otherwise read-only)
- `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate) — (modified)
- `<new>` — warn-only live-corpus canary run (added, option-dependent)

## Consequence

**Severity:** advisory

If `H6a` ships unfixed, a bad flip — whether from an incomplete `Deps.` set or from live coverage not yet closed — turns `main`'s `npm test` red for every contributor with no documented recovery step, and the only safeguard against premature activation is an authoring convention a future leaf author can silently violate. The leaf itself remains shippable and the gate behaves correctly; the gap is operational risk posture, not gate correctness.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** `5353dd7` (2026-06-10) — "pi-loom plan: resolve \"Release-gate activation has no owning leaf\""
**History:** The `H6a` leaf was created whole by `5353dd7`. Both gaps were present in that creating commit: the leaf carried no revert/rollback note, and the `Deps.`-completeness footnote ("The set MUST stay transitively complete …") was already prose-only with no mechanical guard. The only later edit to the leaf, `953e3fa` (2026-06-10), widened that same footnote to add the numbered-REQ-ID citing-test mode but neither introduced a rollback path nor changed the discipline-only nature of the completeness obligation. The defect is therefore present since the leaf's inception.

## Solution Space

**Shape:** single

This finding carries two independent obligations: documenting the rollback path, and adding a guard for the prose-only Deps-completeness reliance. They land on different surfaces and neither resolves the other.

### Recommendation

Document the rollback path on the existing `H6a` leaf first, then add a warn-only live-corpus canary ahead of the hard flip on that stable baseline:

- **Rollback documentation (do first).** Add a revert/recovery clause to `H6a`'s `Adds.` recording that reverting the `H6a` activation commit returns the closing gate to the `H5a` seeded-fixture footing, so `main` stops reddening on incomplete live coverage. This is the smaller, scope-bounding edit and lands entirely on the existing leaf with no new mechanism or sequencing; it documents recovery only and does not by itself lower the probability of a bad flip.
- **Warn-only live-corpus canary (do second).** Introduce a `<new>` canary leaf (or a warn-only mode on the existing gate) that reconciles the same live spec REQ-ID / `spec_topics/**` MUST / live-test sets `H6a` hard-fails on, emitting findings without failing CI, and sequence it immediately before `H6a`'s hard-fail flip. `H5a`'s gate may need a warn-only mode to support this. This surfaces coverage gaps before they can redden `main`, directly mitigating the prose-only Deps-completeness reliance.

The canary's reconciliation set MUST stay in lockstep with the sets `H6a` hard-fails on; keep the Deps-completeness obligation stated in one place so the warn-only and hard-fail footings cannot drift apart.

## Relationships

- T02 "H6a transitive-completeness governance rule is parked in H6a's Deps, not the authoring conventions" — same-cluster (both touch `H6a`'s `Deps.` transitive-completeness prose; resolve independently)

---

# T04 — Coverage-matrix `…` range notation is never defined

**Original heading:** Ellipsis range notation undefined
**Original section:** docs/plan_topics/coverage-matrix.md
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `## Numbered REQ-IDs (runtime obligations)` table in
`docs/plan_topics/coverage-matrix.md` uses an ellipsis form to compress
contiguous REQ-ID ranges — `TYPE-1 … TYPE-10`, `ERR-1 … ERR-7`,
`ERR-8 … ERR-13` — but nowhere in the matrix (or in `conventions.md`)
is `X-n … X-m` stated to mean the inclusive contiguous range. The
notation's meaning is therefore left to the reader.

The ambiguity is made concrete by adjacent rows that spell ranges out
in full: `PIC-3, PIC-4, PIC-5, PIC-6` and `BNDR-1, BNDR-2, BNDR-3`
appear in the same table as `TYPE-1 … TYPE-10`. A reader who sees both
forms can reasonably conclude that the comma-list form is the
exhaustive one and the `…` form names only its two endpoints
(`TYPE-1` and `TYPE-10`, leaving `TYPE-2 … TYPE-9` unmapped). The
matrix also uses a different glyph from the contiguous-range rule in
`conventions.md` *Leaf format* (`Deps. … V9a–V9e`, an en-dash),
removing the cross-reference a reader might otherwise lean on.

This notation is load-bearing. The `H5a` closing-gate automation
reconciles every executable spec REQ-ID against this exact table and
fails on any executable REQ-ID with no coverage-matrix row; the live
footing of that reconciliation is the loom 1.0 release gate activated
by `H6a`. The gate's enumeration of which REQ-IDs each row covers
depends entirely on how `…` expands, so the undefined notation feeds
directly into a closing-gate pass/fail decision.

## Plan Documents

- `docs/plan_topics/coverage-matrix.md` — `## Numbered REQ-IDs (runtime obligations)` table (edited)
- `docs/plan_topics/conventions.md` — *Leaf format* `Deps` contiguous-range rule (read-only)
- `docs/plan_topics/H5a-closing-gate-automation.md` — `Adds` / `Tests` (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H5a` — REQ-ID / diagnostic-code closing-gate automation — blocked
- `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate) — blocked

## Consequence

**Severity:** correctness

Two reasonable `H5a` implementers diverge on how `…` rows expand: an
inclusive-range reader maps `TYPE-2 … TYPE-9` and the gate passes;
an endpoints-only reader treats those interior REQ-IDs as unmapped and
the gate fails (or, worse, silently under-counts coverage). Because the
same gate is flipped to its binding live-corpus footing by `H6a`, an
incorrect expansion either spuriously red-lines the release gate or
lets genuinely uncovered REQ-IDs ship as "covered".

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10)
**History:** Before commit c6a664e, `docs/plan_topics/coverage-matrix.md` was an empty placeholder (`| _(none yet)_ | _(none yet)_ |`); the file itself was created earlier (fecb504, "Split spec.md and plan.md into per-topic / per-phase files") with no data rows. Commit c6a664e populated the matrix and introduced the `…` ellipsis range rows (`git log -S'TYPE-1 … TYPE-10' -- docs/plan_topics/coverage-matrix.md` resolves to c6a664e; `git show c6a664e^:docs/plan_topics/coverage-matrix.md` shows the prior empty table). No legend defining the notation was added in that commit or since. The defect has been present since the matrix was first populated.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/coverage-matrix.md`, add a one-line legend
immediately under the `## Numbered REQ-IDs (runtime obligations)`
heading (before the table) that fixes the notation, e.g.:
`` `X-n … X-m` denotes the inclusive contiguous range — every REQ-ID
from `X-n` through `X-m`, both endpoints included. `` This makes the
`H5a` gate's per-row REQ-ID enumeration deterministic without expanding
every range by hand.

Edge cases for the implementer:

- The legend's contiguous-range reading presumes the spec's per-prefix
  numbering has no holes between the endpoints. `H5a` already gates on a
  "per-prefix numbering hole"; the legend and that check must agree —
  a hole inside an `…` range should surface as a gate failure, not a
  silent skip.
- Only the `## Numbered REQ-IDs` table uses the `…` form; the
  `## Code-keyed obligation areas` section uses prose, so the legend
  need not cover it.
- The matrix's `…` glyph differs from the en-dash range form in
  `conventions.md` *Leaf format*; if the legend instead cross-references
  that rule rather than restating it, ensure the glyph it names matches
  the glyph actually used in the matrix rows.

## Relationships

None

---

# T05 — conventions.md No-globals rule mis-attributes the gates' owning leaf and overstates the architectural test's reach

**Original headings:**
- "the scaffold leaf" attribution of lint/architectural gates
- "An architectural test … enforces this" (no-globals/statics/singletons)

**Original section:** docs/plan_topics/conventions.md
**Kind:** ordering, overclaim
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The *Cross-cutting rules* → *No globals, statics, singletons* bullet in `conventions.md` is wrong on two coupled counts that share the same sentence, so a single aligned rewrite fixes both.

First, **mis-attribution.** The bullet attributes enforcement to "the scaffold leaf" — both "An architectural test **in the scaffold leaf** enforces this against `src/**`" and the sibling *Specific exception types only* bullet's "An ESLint rule (`no-broad-catch`) **wired in the scaffold leaf** enforces this." The natural referent of "the scaffold leaf" is `H1a`. But neither gate lands there: `H1a`'s `Adds`/`Tests` cover only the TypeScript skeleton, manifest, test runner, and dependency-pin assertions. The gates live in two later horizontal leaves — `H2a` (the `no-broad-catch` ESLint rule, the `no-restricted-syntax` sequential allow-list, and the `src/**` module-level-mutable-singleton architectural test) and `H3a` (the identifier-keyed ambient-access scan). A reader applying the rule literally is pointed at `H1a` for enforcement that lives in `H2a`/`H3a`.

Second, **reach overclaim.** "enforces this" reads as full mechanical enforcement of the rule's whole subject. The actual mechanism is narrower: the `H2a` architectural test fails only on **module-level** global / static / mutable-singleton bindings, and `H2a` itself states that closure-captured, lazy module-cache, and DI-container singletons "are not mechanically detected and are enforced by contributor discipline / review." `H3a`'s ambient-access scan likewise catches only **direct** references. So the umbrella convention sentence claims more reach than its implementing leaves deliver, and a leaf author trusting "enforces this" could lean on the gate instead of the contributor-discipline obligation the leaves disclose.

The leaf-level documents (`H2a`/`H3a`) carry the correct `Convention.` citations and accurate detection-reach caveats; the defect is confined to the cross-cutting prose.

## Plan Documents

- `docs/plan_topics/conventions.md` — *Cross-cutting rules* (*No globals, statics, singletons*; *Specific exception types only*) (edited)
- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — full leaf (read-only)
- `docs/plan_topics/H2a-cross-cutting-gates.md` — full leaf (read-only; already carries the detection-reach caveat)
- `docs/plan_topics/H3a-di-seam-skeleton.md` — full leaf (read-only; ambient-access scan already discloses its direct-reference-only reach)

## Spec Documents

None. The rule is a project-convention operationalisation of `CLAUDE.md`'s dependency-injection mandate; no spec text is involved and the fix is confined to plan-convention wording.

## Affected Leaves

**Phases:** None

**Leaves (implementation order):**

None. The fix is confined to the `conventions.md` cross-cutting prose; the gate-owning leaves `H2a` and `H3a` already disclose the accurate reach and carry correct attributions, so no leaf's *Adds* / *Tests* / *Ships when* changes and no leaf is blocked.

## Consequence

**Severity:** advisory

A contributor reading the cross-cutting rule in isolation is pointed at `H1a` for enforcement that lives in `H2a`/`H3a` (wasting a lookup and possibly believing the gate is missing), and may treat the architectural test as a complete guard against singletons — skipping the contributor-discipline / review obligation for the closure-captured, lazy-module-cache, and DI-container forms the test cannot see. The gates ship correctly regardless because the `H2a`/`H3a` leaf documents pin them precisely, so no implementer diverges on where to build them; the convention and its leaves merely contradict each other on the gate's location and guarantee.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 288f191 — Add implementation plan (2026-05-04); 15f69aa — finish scaffold/template re-pivot (2026-05-26); c6a664e — build/update plan for spec.md + review (2026-06-10); 07555ea — resolve "completeness overclaims over partial-coverage mechanisms" (2026-06-10)
**History:** The unqualified enforcement claim has been present since the plan's first commit (288f191, "Architectural test in H1 enforces."), reworded to "the scaffold leaf" by 15f69aa without changing its reach. `H1a`/`H2a`/`H3a` were first created at c6a664e, which decomposed the scaffold phase and landed the gates in `H2a`/`H3a` without updating the `conventions.md` singular "scaffold leaf" referent. The reach contradiction sharpened at 07555ea, which added the "closure-captured, lazy module-cache, and DI-container singletons are not mechanically detected" caveat to `H2a` but left the `conventions.md` umbrella sentence untouched. Both facets are the interaction of benign convention prose with the unaccompanied leaf split / caveat addition.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/conventions.md`, *Cross-cutting rules*, retarget both attributions from "the scaffold leaf" to the leaves that actually carry the gates **and** scope the enforcement claim to the binding forms the test mechanically detects, in one aligned rewrite of the *No globals* sentence. Suggested literal replacement:

> An architectural test in `H2a` enforces this against `src/**` for the module-level binding forms it can detect (with `H3a`'s direct ambient-access scan as a companion); closure-captured, lazy-module-cache, and DI-container singletons are not mechanically detected and are enforced by contributor discipline / review.

Apply the same leaf-retargeting to the *Specific exception types only* bullet — replace "An ESLint rule (`no-broad-catch`) wired in the scaffold leaf enforces this." with "An ESLint rule (`no-broad-catch`) wired in `H2a` enforces this." Cite leaf IDs exactly as they appear (`H1a`/`H2a`/`H3a`); "the scaffold phase (`H1a`–`H3a`)" is acceptable if a phase-level pointer is preferred. The spec/spec-topics are read-only for this fix; the edit stays inside `conventions.md`.

## Relationships

- T07 "Singleton architectural test defines its non-detection set but never its positive detection set" — same-cluster (same `H2a` architectural test; that finding defines the positive detection set in `H2a`, this one aligns the convention prose; resolve independently)
- T08 "Architectural / ambient-access scan blind spots have no named compensating review gate" — same-cluster (same disclosed blind spots; that finding tracks the manual-review obligation on a named checklist, this one corrects the convention sentence)
- T11 "Lint engine and custom-rule mechanism are consumed but never provisioned" — same-cluster (also concerns where scaffold-phase lint tooling is owned across `H1a`/`H2a`; resolves independently)

---

# T06 — Class-1/2/3 taxonomy referenced by the Adds binding rule but never defined

**Original heading:** Class-1/2/3 taxonomy used without a definition
**Original section:** docs/plan_topics/conventions.md
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `Adds.` bullet in `conventions.md` (Leaf format section) carries the rule
that decides when a mechanism named in an `Adds.` field actually binds the
implementer. Its final clause turns on a three-way taxonomy: a mechanism is
illustrative and "authorises no **Class-3** architecture mandate when it is
neither a **Class-1** observable behaviour (REQ-ID- or code-keyed) nor a
**Class-2** consumer-bound seam."

The labels `Class-1` / `Class-2` / `Class-3` appear nowhere else in the plan
corpus — they are introduced and consumed in this single sentence, each glossed
only by a parenthetical wedged inside a negation. There is no canonical
defining statement that pins each class, and the numeric labels are never tied
back to the prior sentence's `(i)` / `(ii)` / "any other" enumeration they are
meant to mirror. A reader must reconstruct the mapping from context alone.

Because this is the load-bearing rule for whether `Adds.` prose binds, the
ambiguity is consequential: two reviewers reading the negation differently can
disagree on whether a given `Adds.`-named mechanism is a binding obligation or
illustrative shape, and on what constitutes a forbidden "Class-3 architecture
mandate."

## Plan Documents

- `docs/plan_topics/conventions.md` — Leaf format → `Adds.` binding rule (edited)
- `docs/plan_topics/coverage-matrix.md` — *Code-keyed obligation areas (no numbered REQ-IDs)* (read-only — referenced by the Class-1 definition)

## Spec Documents

None

## Affected Leaves

**Phases:** None

**Leaves (implementation order):**

None — the `Class-1/2/3` labels occur only in `conventions.md`; no leaf body
references the taxonomy, so the fix is internal to the convention file and does
not propagate to any leaf.

## Consequence

**Severity:** advisory

The rule that gates whether an `Adds.`-named mechanism binds the implementer can
be read more than one way, so two reviewers can disagree on whether a mechanism
is a binding obligation or illustrative shape. Implementers can still produce a
working leaf — the inline parentheticals carry enough meaning — but the binding
boundary is contestable during review.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10); b737beb — pi-loom plan: resolve "Adds. binding clause (i) cannot bind code-keyed obligations" (2026-06-10)
**History:** The undefined-taxonomy defect entered with the plan corpus's first commit (`c6a664e`), whose `Adds.` bullet already used the `Class-3` label mid-sentence with no defining statement. A later edit (`b737beb`) broadened the implicit taxonomy by introducing the `Class-1` and `Class-2` labels into the same negation while still adding no canonical definition, deepening but not originating the gap.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/conventions.md`, in the `Adds.` bullet of the Leaf format
section, introduce a canonical definition of the three classes before the
binding clause first uses a `Class-N` label, so the labels are defined in
positive space rather than only glossed inside the negation. Define them
consistently with the clause's existing `(i)` / `(ii)` / "any other"
enumeration:

- **Class-1** — an observable behaviour traced to a normative spec obligation:
  a cited `PREFIX-N` REQ-ID, a cited `loom/...` diagnostics-registry code, or a
  named normative step on a code-keyed obligation page per
  `coverage-matrix.md` *Code-keyed obligation areas (no numbered REQ-IDs)*.
- **Class-2** — a named cross-leaf **seam** that a consumer leaf binds against
  (a leaf listing this leaf in its `Deps.` names the seam in its own `Adds.` or
  `Tests.`).
- **Class-3** — an architecture / shape mandate that is neither Class-1 nor
  Class-2; `Adds.` prose alone does not authorise one.

Alternatively, replace the bare `Class-N` labels with a link to the
authoring-discipline source that defines them. Either way the requirement is
that each label resolve to a stated definition before its first binding use, and
that the mapping to the `(i)` / `(ii)` / "any other" enumeration be explicit.

## Relationships

- T33 "'fail red for the intended reason' is the tests-task gate but is never defined" — same-cluster (parallel "term used as a gate but never defined" clarity gap in `conventions.md`; resolves independently)

---

# T07 — Singleton architectural test defines its non-detection set but never its positive detection set

**Original heading:** Singleton architectural test specifies only what it does NOT detect
**Original section:** docs/plan_topics/H2a-cross-cutting-gates.md
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H2a`'s **Adds** field describes the `src/**` architectural test as one "that fails on a module-level global / static / mutable singleton binding (closure-captured, lazy module-cache, and DI-container singletons are not mechanically detected …)." It enumerates the forms the test does **not** flag, but never states the positive detection set — which concrete module-scope binding form(s) actually constitute a "module-level mutable singleton" that the test rejects. The phrase "module-level mutable singleton" is the only positive anchor, and it is not resolved to observable constructs (e.g. a module-top-level `let`/`var`, or a `const` bound to a mutable object/array reused across calls, declared outside any class or function).

The `H2a` **Tests** bullet inherits the same gap: "a fixture introducing a module-level mutable singleton fails the architectural test" does not pin which construct the fixture instantiates, so the fixture and the detector are free to target different patterns.

The sibling `H3a` ambient-access scan demonstrates the contract this leaf is missing: it states its positive detection set explicitly ("`src/**` module *directly references* `process.env`, `process.cwd`, `crypto.randomUUID`, `Date.now`, or `setTimeout`") and only then enumerates the indirect forms it does not catch. `H2a`'s singleton test carries only the second half of that pattern.

## Plan Documents

- `docs/plan_topics/H2a-cross-cutting-gates.md` — Adds + third Tests bullet (edited)
- `docs/plan_topics/H3a-di-seam-skeleton.md` — ambient-access scan detection-set enumeration (read-only; model for the fix)
- `docs/plan_topics/conventions.md` — *No globals, statics, singletons* cross-cutting rule (read-only)

## Spec Documents

None — the gate derives from the `CLAUDE.md` / `conventions.md` *No globals, statics, singletons* rule, not from a spec REQ-ID; the fix is internal to plan files.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H2a` — Cross-cutting lint and architectural gates — (modified)

## Consequence

**Severity:** correctness

Without a defined positive detection set, two reasonable implementers pick different module-scope binding patterns to flag, so real module-level mutable singletons slip through while legitimate module-level constants may be rejected; the unpinned fixture lets the detector and its own test target divergent constructs, making the gate's green a contestable signal rather than a witness that the *No globals, statics, singletons* rule is enforced.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen); 07555ea — pi-loom plan: resolve "completeness overclaims over partial-coverage mechanisms" (2026-06-10, Thomas Andersen)
**History:** The leaf's first commit (c6a664e) already left the fixture-construct facet under-pinned. Commit 07555ea replaced the prior over-claim with the present negative-space enumeration, correcting the overclaim but introducing the asymmetry the finding flags: it added the non-detection list without ever stating the positive detection set.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H2a-cross-cutting-gates.md`, add the positive detection set to the **Adds** field so the leaf states which observable module-scope construct(s) the architectural test flags, mirroring the way `H3a`'s ambient-access scan enumerates its own direct-reference detection set before listing the forms it cannot catch. Concretely, extend the parenthetical in Adds to name the flagged forms — for example: "fails on a module-level mutable binding in `src/**` (a top-level `let`/`var`, or a top-level `const` bound to a mutable object/array shared across calls, declared outside any class or function); closure-captured, lazy module-cache, and DI-container singletons are not mechanically detected and are enforced by contributor discipline / review."

Then align the third **Tests** bullet so its fixture instantiates that named construct rather than the unqualified "module-level mutable singleton," so the fixture and the detector target the same defined pattern. The exact construct list is the implementer's to finalise against the chosen detector; the requirement is that the leaf names an observable detection set and that the fixture exercises a member of it. The spec is read-only for this fix.

## Relationships

- T05 "conventions.md No-globals rule mis-attributes the gates' owning leaf and overstates the architectural test's reach" — same-cluster (both concern the singleton architectural test's mechanical reach; that one softens the convention prose, this one defines the positive detection set; resolve independently)
- T08 "Architectural / ambient-access scan blind spots have no named compensating review gate" — same-cluster (same architectural test; that finding tracks the review-only blind spots via a named checklist, this one pins the mechanically-detected set)

---

# T08 — Architectural / ambient-access scan blind spots have no named compensating review gate

**Original headings:**
- Architectural & lint scans have documented blind spots with no compensating gate
- PIC-12 / PIC-20 indirect ambient-access ban verified by review only

**Original section:** docs/plan_topics/H2a-cross-cutting-gates.md
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The *No globals, statics, singletons* enforcement machinery is only partially mechanical. `H2a`'s `src/**` architectural test fails on a **module-level** mutable singleton but explicitly does **not** detect closure-captured, lazy module-cache, or DI-container singletons. `H3a`'s identifier-keyed ambient-access scan catches only **direct** references to `process.env`/`process.cwd`/`crypto.randomUUID`/`Date.now`/`setTimeout`, and explicitly does **not** detect aliased reads (`const env = process.env`), destructured reads, computed access (`process["env"]`), or re-export indirection. `V8b`'s `PIC-12`/`PIC-20` bullets repeat the same "enforced by review" disposition for the timing/UUID seams (an indirect `Date.now`/`setTimeout`/`crypto.randomUUID` reference through an alias, helper wrapper, or re-export defeats the per-runtime seam-isolation promise yet passes the direct scan).

No named step in the plan owns that review obligation. The per-phase TDD ritual's self-review step partially covers the singleton residue but says nothing about the indirect ambient-access forms, and it is a per-leaf self-review, not a tracked release/PR gate. So an indirect ambient reference can pass `npm test` (the direct scan does not see it) and ship without any tracked verification point having fired.

The plan already establishes the pattern this gap should follow: the parallel GOV-22 closing-gate residue is explicitly routed in `conventions.md`'s *REQ-ID discipline* rule to "the release-time editorial corpus review (`governance.md` GOV-15 reviewer-inspection step)." The architectural/ambient blind spots — both the `H2a`/`H3a` machinery and its `V8b` PIC-12/PIC-20 consumer — have no equivalent named anchor, leaving their manual portion untracked. The single named-checklist edit closes both surfaces together.

## Plan Documents

- `docs/plan_topics/conventions.md` — *No globals, statics, singletons* rule + *Per-phase TDD ritual* self-review step (edited)
- `docs/plan_topics/H2a-cross-cutting-gates.md` — Adds (module-level-singleton blind-spot disclosure) (edited)
- `docs/plan_topics/H3a-di-seam-skeleton.md` — Tests (indirect ambient-access blind-spot disclosure) (edited)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — `PIC-12`/`PIC-20` "enforced by review" references (edited)
- `docs/plan_topics/V8b-T-clock-fs-id-watch-token-seams.md` — `PIC-12`/`PIC-20` Tests bullets (edited)
- `docs/plan_topics/H6a-live-corpus-activation.md` — release-gate step (option-dependent)

## Spec Documents

None — the blind spots concern plan-originated code-quality conventions (operationalising `CLAUDE.md` *No globals, statics, singletons*), not spec obligations. The fix is internal to the plan corpus.

## Affected Leaves

**Phases:** Horizontal; Vertical V8

**Leaves (implementation order):**

- `H2a` — Cross-cutting lint and architectural gates — (modified)
- `H3a` — Dependency-injection seam skeleton — (modified)
- `V8b` — Clock/FileSystem/IdSource/FileWatcher/TokenEstimator seams — (modified)
- `H6a` — Live-corpus closing-gate activation (release gate) — (option-dependent)

## Consequence

**Severity:** advisory

The mechanical gates catch the common forms, so implementers can still produce working leaves; the gap is that the conceded manual residue (a closure-captured/DI-container singleton, or an aliased/destructured/computed/re-exported ambient access) has no tracked review step and can ship undetected. Because the disposition is stated as an enforcement guarantee ("enforced by contributor discipline / review") with nothing operationalising it, the manual portion is effectively unowned, risking a silent isolation regression rather than an implementer divergence.

## Issue introduction

**Verdict:** multi-commit-interaction (introduced-by-resolution)
**Introducing commits:** `20e5812` (2026-06-10) "resolve 'Ambient-access ban asserts soundness it cannot deliver'"; `07555ea` (2026-06-10) "resolve 'completeness overclaims over partial-coverage mechanisms'"
**History:** Before these commits, `H2a`/`H3a` asserted unqualified soundness. `20e5812` narrowed the `H3a` scan to the direct-reference form and added the indirect-form blind-spot disclosure with the "enforced by review" disposition; `07555ea` did the same for `H2a`'s architectural test and propagated the split into `V8b`/`V8b-T` PIC-12/PIC-20. Both correctly softened the overclaim but neither pinned the newly-disclosed manual residue to a named checklist step. The parallel GOV-22 recogniser resolution (`1035d0b`) *did* route its residue to a named step (GOV-15), which is why the inconsistency is visible.

## Solution Space

**Shape:** single

### Recommendation

Expand `conventions.md`'s *Per-phase TDD ritual* self-review step so its checklist line covers the indirect ambient-access forms — alias (`const env = process.env`), destructured reads, computed access (`process["env"]`), helper wrapper, and re-export indirection — alongside the existing singleton prompt. Add a one-line routing sentence to the *No globals, statics, singletons* rule that names the self-review step (and any release-time reviewer-inspection step) as the owner of the conceded manual residue, mirroring the GOV-22 → GOV-15 routing precedent. Change `H2a`/`H3a` and `V8b`'s `PIC-12`/`PIC-20` bullets from "enforced by contributor discipline / review" to a reference to that named step.

Keep the residue list in lockstep with what the scans actually concede so the manual gate and the mechanical scans partition the space with no third gap between them. Land the `H2a`/`H3a`/`V8b` edits in one pass so the single named checklist item covers the ambient-access scan, the lint scan, the singleton architectural test, and the PIC-12/PIC-20 timing/UUID seams.

## Relationships

- T07 "Singleton architectural test defines its non-detection set but never its positive detection set" — same-cluster (same `H2a` architectural-test blind spot; resolves independently by defining the positive detection set)
- T09 "Ambient-access scan exempts the seam adapter but never defines how a module is recognised as one" — same-cluster (touches the same `H3a` scan and seam-adapter boundary, but resolves independently — about how an adapter is declared, not about closing the indirect path)
- T05 "conventions.md No-globals rule mis-attributes the gates' owning leaf and overstates the architectural test's reach" — same-cluster (same disclosed blind spots; that finding corrects the convention sentence)

---

# T09 — Ambient-access scan exempts the seam adapter but never defines how a module is recognised as one

**Original heading:** Ambient-access scan exempts "its declared seam adapter" with no declaration mechanism
**Original section:** docs/plan_topics/H3a-di-seam-skeleton.md
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H3a`'s second Tests bullet specifies an architectural test that asserts no `src/**` module *directly references* `process.env`, `process.cwd`, `crypto.randomUUID`, `Date.now`, or `setTimeout` "outside its declared seam adapter." The exemption is load-bearing — the seam-adapter modules are precisely the modules that *must* touch these ambient primitives — but neither `H3a` nor `conventions.md` defines the observable rule by which a module is recognised as the declared seam adapter for a given primitive. There is no path convention, no allow-list, and no annotation mechanism stated for the scan to consult.

This is inconsistent with the two sibling cross-cutting bans, which each pin an explicit declaration mechanism: the *Specific exception types only* rule requires a same-line `// allow-broad-catch: <REQ-ID> — <spec-page>` comment plus a lint allow-list entry, and *Sequential by default* requires a same-line `// allow: <REQ-ID-or-code-keyed-area> — <spec-page>` comment plus a `no-restricted-syntax` allow-list. The ambient-access scan alone names an exempt category ("its declared seam adapter") without saying how the scan identifies it.

The downstream adapter leaf compounds the gap: `V8b` asserts "no *direct* ambient timing reference outside the `WallClock` adapter" (PIC-12) and "`IdSource.newInvocationId()` is the only *direct* `crypto.randomUUID` reference" (PIC-20), naming specific adapter modules — yet at `H3a` authoring time `V8a`/`V8b` do not exist. An `H3a` implementer must therefore invent an exemption rule before the adapters it exempts have been written, and an ad-hoc invention may not match how `V8b` is later structured.

## Plan Documents

- `docs/plan_topics/H3a-di-seam-skeleton.md` — Tests bullet 2 / Adds (edited)
- `docs/plan_topics/conventions.md` — *No globals, statics, singletons* cross-cutting rule (option-dependent)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — PIC-12 / PIC-20 (read-only)
- `docs/plan_topics/V8b-T-clock-fs-id-watch-token-seams.md` — PIC-12 / PIC-20 (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal phases; Vertical slice V8 (Pi host seams)

**Leaves (implementation order):**

- `H3a` — Dependency-injection seam skeleton — (modified)
- `V8b` — `Clock`, `FileSystem`, `IdSource`, `FileWatcher`, `TokenEstimator` seams — (both)

## Consequence

**Severity:** correctness

Two reasonable `H3a` implementers will pick incompatible exemption mechanisms (hardcoded module path, allow-list registry, or annotation comment) because none is specified, and whatever is chosen is authored before the adapter modules it exempts exist. The resulting scan can diverge from how `V8b` later structures `WallClock`/`IdSource`/`FileSystem`, so it either reddens `npm test` against a legitimate adapter or silently exempts more than the declared adapter, defeating the ban it claims to enforce.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The `H3a` leaf file was created in c6a664e, and its ambient-access Tests bullet was phrased "outside its declared seam adapter" in that first commit, with no declaration mechanism defined. A later commit (20e5812) revised the indirect-forms language of the same bullet but did not add a declaration mechanism, so the gap is present since the leaf's first commit.

## Solution Space

**Shape:** single

### Recommendation

Define, in `H3a` (Tests bullet 2 and the `Adds.` description), the observable rule the architectural test consults to recognise a module as the declared seam adapter for a given ambient primitive, mirroring the two allow-list/allow-comment mechanisms `conventions.md` already establishes.

Concretely: each site that legitimately references one of the banned primitives carries a same-line allow comment — e.g. `// allow-ambient: <primitive> — <seam>` — and is enumerated in an allow-list the scan consults; the scan flags any direct reference to a listed primitive that is **not** at an allow-listed site. State this rule once where the cross-cutting bans live (the *No globals, statics, singletons* rule in `conventions.md`) and reference it from `H3a`'s Tests bullet.

Edge cases the implementer must watch:
- At `H3a` time the seam adapters do not yet exist, so the allow-list starts empty and grows as `V8b` lands; the mechanism must tolerate later-added entries without an `H3a` edit.
- When `V8b` is authored, its adapter modules must carry the declaration the mechanism requires so PIC-12/PIC-20 reference a real, scan-recognised exemption rather than a prose-only claim.
- Keep the mechanism cross-referenced from `V8b` PIC-12/PIC-20.

## Relationships

- T10 "H3a declares seven seam interfaces but cites no source for their member shapes" — same-cluster (both are `H3a` under-specification gaps that surface when the adapters in `V8*` are authored)
- T08 "Architectural / ambient-access scan blind spots have no named compensating review gate" — same-cluster (same `H3a` scan; that finding concerns indirect-form blind spots, this one the direct-form exemption mechanism)
- T07 "Singleton architectural test defines its non-detection set but never its positive detection set" — same-cluster (parallel under-specification of an `H2a`/`H3a` architectural test's positive detection rule)

---

# T10 — H3a declares seven seam interfaces but cites no source for their member shapes

**Original heading:** Seven seam interfaces must be defined but no source for their shapes is cited
**Original section:** docs/plan_topics/H3a-di-seam-skeleton.md
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H3a` is the dependency-injection seam skeleton: its `Adds.` threads seven host
seams — `Checkpoint`, `SchemaValidator`, `Clock`, `FileSystem`, `FileWatcher`,
`TokenEstimator`, `IdSource` — as injected interfaces, "Seam *interfaces* only;
their normative behaviour is implemented by the `V8*` leaves." The only document
`H3a` cites is `conventions.md`, which says nothing about the member set of any seam.

The actual member signatures are owned downstream: `V8a` declares `Checkpoint`
and `SchemaValidator` (citing `host-interfaces-core.md`), and `V8b` declares
`Clock`/`FileSystem`/`IdSource`/`FileWatcher`/`TokenEstimator` (citing
`host-interfaces-core.md` + `host-interfaces-services.md`). Both `V8a` and `V8b`
list `H3a` in their `Deps.`, so the leaf that must *declare* the interface shapes
runs before the leaves that document those shapes, and `H3a` itself points a fresh
implementer at no source for the members it must declare.

`H3a` does not make clear whether the skeleton declares empty marker interfaces
later populated by `V8*`, or declares the full member set up front. An implementer
has no cited reference for the member signatures and may invent them or leave empty
placeholders that do not match the shapes `V8a`/`V8b` later require.

## Plan Documents

- `docs/plan_topics/H3a-di-seam-skeleton.md` — Adds (edited)
- `docs/plan_topics/V8a-checkpoint-validator-seams.md` — Spec field / seam ownership (read-only)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — Spec field / seam ownership (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — seam member contracts (read-only)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — seam member contracts (read-only)

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H3a` — Dependency-injection seam skeleton — (modified)

## Consequence

**Severity:** correctness

`H3a` can ship green (its tests assert only seam isolation and the ambient-access
scan, never any member), so the gap surfaces later: two reasonable implementers
diverge on whether `H3a` declares empty marker interfaces or full member
signatures, and any signatures invented at `H3a` may not match the spec-derived
shapes `V8a`/`V8b` require — forcing rework or producing a skeleton the later seam
leaves cannot cleanly implement against.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `H3a` was created in commit c6a664e with the `Adds.` line already threading the seven seam interfaces while citing only `conventions.md` and deferring "normative behaviour" to the `V8*` leaves; no source for the interface member set was cited at the leaf's first commit. The only later edit (20e5812) reworded the ambient-access scan and did not touch the seam-source gap.

## Solution Space

**Shape:** single

### Recommendation

Edit `H3a`'s `Adds.` so the seam-interface clause cites the seam-contract pages
that own the member set — the same pages `V8a` and `V8b` reference:
`host-interfaces-core.md` (for `Checkpoint`/`SchemaValidator` and the core forms
of `Clock`/`FileSystem`/`IdSource`/`FileWatcher`/`TokenEstimator`) and
`host-interfaces-services.md`. State that `H3a` declares each seam interface's
full member signatures sourced from those pages, and that what is deferred to the
`V8*` leaves is the seams' *behaviour*, not their shape.

Edge cases the implementer should watch: `Checkpoint`'s member contract is anchored
at `host-interfaces-services.md#checkpoint-seam` (per `V17a`'s testability-hook
cross-reference), so confirm the cited anchors cover `Checkpoint` even though `V8a`
lists it under `host-interfaces-core.md`; and keep the `H3a`-declared signatures
the single source of the interface — the `V8*` leaves implement against them rather
than redeclaring members.

## Relationships

- T09 "Ambient-access scan exempts the seam adapter but never defines how a module is recognised as one" — same-cluster (a parallel H3a seam under-specification that resolves independently)

---

# T11 — Lint engine and custom-rule mechanism are consumed but never provisioned

**Original heading:** Lint engine (ESLint + custom-rule plugin) assumed but never provisioned
**Original section:** docs/plan_topics/H1a-scaffold-and-toolchain.md
**Kind:** assumptions
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`H1a` is the plan's declared sole dependency-enumerating leaf and the initial-population owner of `package.json`. Its `Adds.` field enumerates the manifest's `peerDependencies`, its runtime `dependencies`, and `engines.node`, plus a `tsconfig.json` and an (unnamed) test runner. It names no lint engine: neither ESLint, a TypeScript-aware ESLint parser, nor any custom-rule plugin mechanism.

`H2a` (Deps: `H1a`) consumes exactly that missing toolchain. Its `Adds.` builds "the ESLint rules (`no-broad-catch`, the `no-restricted-syntax` sequential-by-default allow-list)" and wires them into `npm test`; `conventions.md` likewise mandates the bespoke `no-broad-catch` rule and the `no-restricted-syntax` allow-list "wired in the scaffold leaf." The bespoke `no-broad-catch` rule additionally requires a custom-rule authoring mechanism (a local ESLint plugin / rule module), which no leaf provisions.

The checked-in `package.json#devDependencies` is `{ "@types/semver": "^7.5.0" }` — no `eslint`, no `@typescript-eslint/parser` (or equivalent), no plugin scaffolding. An implementer who treats the manifest as authoritative reaches `H2a` with no lint engine installed and must invent the entire lint toolchain (engine version, TS parser, custom-rule packaging) with no plan guidance, and outside the leaf the plan designates as the owner of dependency provisioning.

## Plan Documents

- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — `Adds.` dependency enumeration (edited)
- `docs/plan_topics/H2a-cross-cutting-gates.md` — `Adds.` ESLint-rule construction (option-dependent)
- `docs/plan_topics/conventions.md` — *Specific exception types only* / *Sequential by default* (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H1a` — Project scaffold and toolchain — (modified)
- `H2a` — Cross-cutting lint and architectural gates — (both)

## Consequence

**Severity:** correctness

Two reasonable implementers would diverge on which ESLint engine version, TS-aware parser, and custom-rule packaging to install, because the leaf that owns dependency provisioning never names them; nothing in `H1a`'s manifest-shape tests would catch the omission. `H2a` cannot wire its `no-broad-catch` / `no-restricted-syntax` gates (and therefore its `Ships when`) without a lint engine and a custom-rule mechanism that no prior leaf installs.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** `c6a664e` (2026-06-10, "pi-loom plan: build/update plan for spec.md + review")
**History:** `git log --follow` shows `H1a-scaffold-and-toolchain.md` and `H2a-cross-cutting-gates.md` were both created in `c6a664e`; that single commit authored `H1a`'s lint-tooling-omitting dependency enumeration and `H2a`'s ESLint-rule consumption simultaneously. `git log -S "eslint"` against `package.json` and `H1a` returns nothing — the engine was never declared on either side. No later commit narrowed or introduced the gap; it is inherent to the plan's inception.

## Solution Space

**Shape:** single

### Recommendation

Provision the lint toolchain in `H1a`'s `package.json#devDependencies`, treating the lint engine like every other tool `H1a` already enumerates — `H1a` is the plan's declared sole dependency-enumerating leaf and `package.json` owner, so the engine, its parser, and the custom-rule mechanism belong in its `Adds.` manifest enumeration. In `docs/plan_topics/H1a-scaffold-and-toolchain.md` `Adds.`, extend the manifest enumeration to declare, as `devDependencies`: the ESLint engine; a TypeScript-aware ESLint parser (the parser must be TS-aware so the rules can lint `src/**` `.ts` sources); and the custom-rule plugin mechanism. The custom-rule mechanism for the bespoke `no-broad-catch` rule is a distinct provisioning concern from the engine — a local rule module or plugin package must be installable and loadable — so enumerate it explicitly rather than folding it into the engine entry. Optionally add an `H1a` Tests bullet asserting these `devDependencies` are present.

This fix only provisions the toolchain; do not, on this fix, also re-attribute the "wired in the scaffold leaf" prose in `conventions.md` (that is a separate finding).

## Relationships

- T34 "Test runner and assertion API are never named; the panic fail-loudly token is non-JS" — same-cluster (sibling `H1a` toolchain-provisioning gap; the test runner is likewise consumed plan-wide but never declared — independent tooling decisions)
- T05 "conventions.md No-globals rule mis-attributes the gates' owning leaf and overstates the architectural test's reach" — same-cluster (the same `no-broad-catch` / architectural gates whose owning leaf this finding provisions)
- T13 "Checked-in package.json omits the yaml runtime dependency H1a mandates" — same-cluster (sibling checked-in-`package.json` provisioning gap; resolves independently)
- T12 "engines.node is populated but its value is never asserted in H1a" — same-cluster (same `H1a` manifest, distinct field; resolves independently)

---

# T12 — engines.node is populated but its value is never asserted in H1a

**Original heading:** `engines.node` populated but value not asserted in-leaf
**Original section:** docs/plan_topics/H1a-scaffold-and-toolchain.md
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H1a` is the declared initial-population owner of `package.json#engines.node`: its **Adds** field states the value is the pinned Node floor owned by `capability-probe.md` §(a), and that this literal is consumed by the build-time `engines.node` literal-read test (`overview-and-orientation.md` §"Node version floor") and by `V18c`'s three-way `engines.node` equality gate.

`H1a`'s three Tests bullets, however, assert only (1) build/test-green on an empty `src/**` tree, (2) the four `@earendil-works/pi-*` peers sharing one tilde-pinned line, and (3) `typebox` declared `"*"`. No bullet reads `package.json#engines.node` and asserts it equals the spec-anchored floor. The only mechanical check of the populated value is `V18c`'s three-way equality gate, and `V18c` is a terminal-ish leaf (its **Deps** include `H4a`, `V5d`, `V11f`, `V13c`, `V14a`, `V17a`). For the entire span between `H1a` landing and `V18c` landing, the population owner can write a wrong floor — a typo, a stale value, or a value that disagrees with `capability-probe.md` §(a) — and `npm test` stays green, because no gate that runs in that window reads the field.

## Plan Documents

- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Tests (edited)
- `docs/plan_topics/V18c-version-bump-checklist.md` — Adds / Tests (`engines.node` three-way gate) (read-only)
- `docs/plan_topics/coverage-matrix.md` — REQ-ID → leaf mapping (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H1a` — Project scaffold and toolchain — (modified)

## Consequence

**Severity:** correctness

The leaf that populates `engines.node` does not verify its own output, so a floor that disagrees with `capability-probe.md` §(a) ships green through `H1a` and every later leaf until the terminal `V18c` gate finally reads it. Because the wrong value is load-bearing — it drives the `node-floor` `host-incompatible` emission and is operand (i) of the version-bump equality gate — a stale or mistyped floor degrades runtime host-compatibility behaviour with no detection at the point it is introduced.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** f9cf76f — pi-loom plan: resolve "H1a omits engines.node field" (2026-06-10, Thomas Andersen)
**History:** `H1a` had no `engines.node` field at all until commit f9cf76f, which resolved an earlier finding by adding the field, its initial-population ownership prose, and the cross-references to the overview literal-read test and `V18c`'s three-way gate. That same commit added no corresponding in-leaf Tests bullet asserting the populated value, so the populated-but-unasserted gap entered the corpus exactly with f9cf76f.

## Solution Space

**Shape:** single

### Recommendation

Add a Tests bullet to `docs/plan_topics/H1a-scaffold-and-toolchain.md` that reads `package.json#engines.node` at build time and asserts it equals the pinned Node floor owned by `capability-probe.md` §(a) — the same floor `H1a`'s Adds already cites. Cite that anchor (and/or `overview-and-orientation.md` §"Node version floor") on the bullet, mirroring how the existing `typebox` bullet cites `host-prerequisites.md`.

Scope the bullet to the population-time check `H1a` owns: a comparison of the manifest literal against the spec-anchored floor. It must not duplicate `V18c`'s three-way version-bump gate — the live read of the installed `@earendil-works/pi-coding-agent` floor (operand (iii)) and the `SDK_SURFACE_INVENTORY` operand stay owned by `V18c`. The intent is only to close the window in which `H1a` populates the field without any gate confirming the value during `H1a`'s own `npm test`.

## Relationships

- T11 "Lint engine and custom-rule mechanism are consumed but never provisioned" — same-cluster (touches `H1a`'s manifest; resolves independently)
- T34 "Test runner and assertion API are never named; the panic fail-loudly token is non-JS" — same-cluster (touches `H1a`'s manifest; resolves independently)
- T13 "Checked-in package.json omits the yaml runtime dependency H1a mandates" — same-cluster (same `H1a` manifest, distinct field; resolves independently)

---

# T13 — Checked-in package.json omits the yaml runtime dependency H1a mandates

**Original heading:** `yaml` runtime dependency absent from the checked-in `package.json`
**Original section:** docs/plan_topics/H1a-scaffold-and-toolchain.md
**Kind:** codebase-grounding-broad
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`H1a` is the initial-population owner of `package.json` and its **Adds** field enumerates loom's own runtime `dependencies` as `ajv`/`semver`/`chokidar`/`yaml`. `V6a`'s frontmatter parser consumes `yaml` directly ("parsing YAML via the `yaml` dependency declared in `H1a`'s manifest"), and `spec_topics/implementation-notes.md` §"Loom-package implementation dependencies (loom 1.0)" likewise declares `yaml` in the `dependencies` block on the same footing as `semver` and `chokidar`. The plan and spec therefore agree that `yaml` is a declared runtime dependency.

The checked-in manifest does not match. `package.json#dependencies` is `{ajv, ajv-formats, chokidar, semver}` — `yaml` is not present. The manifest is already partially authored, so it reads as complete. An implementer picking up `H1a` and treating the existing manifest as authored — rather than re-deriving it from the Adds field — will not notice the omission. `H1a`'s **Ships when** ("a fresh checkout runs `npm install && npm run build && npm test` green with zero production source files") passes without `yaml`, so the gap ships green. The failure surfaces only later, when `V6a`'s `import` of `yaml` cannot resolve — far from the leaf that owns the manifest.

The remediation lives in the codebase manifest, not in the plan or spec: `H1a`, `V6a`, and `implementation-notes.md` already state the obligation correctly.

## Plan Documents

- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Adds (manifest owner) (read-only)
- `docs/plan_topics/V6a-frontmatter-contract.md` — Adds (`yaml` consumer) (read-only)

## Spec Documents

- `docs/spec_topics/implementation-notes.md` — §"Loom-package implementation dependencies (loom 1.0)" (read-only)

## Affected Leaves

**Phases:** Horizontal, Vertical (V6)

**Leaves (implementation order):**

- `H1a` — Project scaffold and toolchain — (modified)
- `V6a` — Frontmatter field contract — (blocked)

## Consequence

**Severity:** correctness

The deliverable artefact `H1a` owns (the checked-in `package.json`) diverges from `H1a`'s own Adds field. Two reasonable implementers diverge: one re-derives the manifest from Adds and adds `yaml`; one trusts the already-authored manifest and leaves it out. In the latter case `H1a` ships green while wrong, and `V6a`'s `yaml` import fails at build/test time far from the cause.

## Issue introduction

**Verdict:** single-commit
**Introducing commit:** `1064946` — "pi-loom plan: resolve 'YAML frontmatter parsing mechanism is never declared as a dependency'" (2026-06-10).
**History:** Earlier runtime-dependency findings were resolved end-to-end across both the docs and the manifest — `semver` was added to `package.json#dependencies` in `cb6cf60`, and `ajv`/`ajv-formats`/`chokidar` in `d511337`. Commit `1064946` resolved the YAML-parsing-mechanism finding by adding `yaml` to `H1a`'s Adds, `V6a`'s Adds, and `implementation-notes.md`, but did not carry the change through to `package.json#dependencies`. `git log -S'yaml' -- package.json` returns no commits. The defect is the doc-only half of an otherwise-complete dependency resolution.

## Solution Space

**Shape:** single

### Recommendation

Add a `yaml` entry to `package.json#dependencies`, alongside `ajv`/`ajv-formats`/`chokidar`/`semver`, pinned to a `2.x` line — e.g. `"yaml": "^2.9.0"` (the version the Pi SDK already bundles). `yaml` ships its own TypeScript bindings, so no `@types/yaml` entry in `devDependencies` is required (per `implementation-notes.md`).

The fix is confined to the checked-in manifest. No plan or spec edit is required: `H1a`'s Adds, `V6a`'s Adds, and `implementation-notes.md` already declare `yaml` correctly, and those files are read-only for this fix. This completes the doc-only resolution made in commit `1064946`; do not revert that commit — the doc side was correct, only the manifest update was missed.

## Relationships

- T11 "Lint engine and custom-rule mechanism are consumed but never provisioned" — same-cluster (checked-in `package.json` missing tooling the plan assumes; resolves independently)
- T34 "Test runner and assertion API are never named; the panic fail-loudly token is non-JS" — same-cluster (same manifest-provisioning theme; resolves independently)
- T12 "engines.node is populated but its value is never asserted in H1a" — same-cluster (same `H1a` manifest, distinct field; resolves independently)

---

# T14 — Stdlib members beyond replace/concat have no named assertion

**Original heading:** stdlib members beyond `replace`/`concat` have no named assertion
**Original section:** docs/plan_topics/V3a-expression-evaluator.md
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V3a`'s **Adds** field promises "the string/array/object stdlib members," and the spec's `expressions.md` §*Built-in methods and properties* fixes a closed loom-1.0 set of those members: `string` exposes `length`, `toLowerCase()`, `toUpperCase()`, `trim()`, `startsWith(s)`, `endsWith(s)`, `includes(s)`, `split(sep)`, `replace(from, to)`; `array<T>` exposes `length`, `join(sep)`, `includes(x)`, `indexOf(x)`, `slice(start, end?)`, `concat(other)`; `object` exposes `keys()`, `values()`, `has(k)`. Several carry non-trivial normative behaviour — `split` empty-separator code-unit decomposition, `join`'s `loom/parse/non-string-array-join`, `slice` negative-index semantics, `keys()`/`values()` declaration-vs-insertion ordering, `has(k)` returning `false` for unknown keys.

The paired `V3a-T` tests task asserts only the five normative `replace` reference vectors and `concat`'s LUB element type. Every other member in the set has no per-member assertion. Coverage of the `expressions.md` (EXPR) area is closed as a code-keyed obligation area, whose gate reconciles `loom/...` diagnostic-code citations against the registry — it does not assert per-member behaviour or return type.

Consequently a member could be implemented incorrectly (wrong return type, wrong ordering, wrong edge-case behaviour) or omitted entirely and `npm test` would still pass green, with no closing gate firing.

## Plan Documents

- `docs/plan_topics/V3a-T-expression-evaluator.md` — Tests (edited)
- `docs/plan_topics/V3a-expression-evaluator.md` — Adds / Tests / Ships when (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — closing-gate scans (option-dependent)
- `docs/plan_topics/coverage-matrix.md` — Code-keyed obligation areas table (option-dependent)

## Spec Documents

- `docs/spec_topics/expressions.md` — Built-in methods and properties (read-only)

## Affected Leaves

**Phases:** Vertical (slice V3); Horizontal (`H5a`, under the coverage-check option only)

**Leaves (implementation order):**

- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified) — only under the mechanical-coverage-check option
- `V3a-T` — Expression evaluator and stdlib (tests) — (modified)
- `V3a` — Expression evaluator and stdlib — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers can diverge on the untested members (ordering of `keys()`/`values()`, `split` empty-separator behaviour, `slice` negative indices, `join`'s non-string-element diagnostic), or omit a member outright, and still ship the leaf green. The closed EXPR area passes vacuously for the non-code member behaviour, so the implemented stdlib can silently diverge from `expressions.md`.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e
**History:** `git log --follow` on both `docs/plan_topics/V3a-expression-evaluator.md` and `docs/plan_topics/V3a-T-expression-evaluator.md` returns the single plan-authoring commit `c6a664e`. Both leaves were created there with the tests task already naming only the five `replace` vectors and `concat`'s LUB; no later commit touched the stdlib-member coverage.

## Solution Space

**Shape:** single

### Recommendation

Enumerate per-member assertions in `V3a-T`. The loom-1.0 stdlib set is closed and small (18 members, 16 currently unasserted), so in `V3a-T`'s Tests (landed first per the TDD ritual) add an assertion for each loom-1.0 stdlib member not already covered, each pinned to a reference vector exercising its normative behaviour/return type against `expressions.md` §*Built-in methods and properties*. Then mirror the assertions into `V3a`'s Tests and extend its **Ships when** to name stdlib-member coverage. Edge cases the implementer must pin: `split("")` code-unit decomposition, `join` on a non-string element firing `loom/parse/non-string-array-join`, `slice` negative-index-from-end, `keys()`/`values()` ordering, and `has(k)` returning `false` on an unknown key. Do not re-add the `replace`/`concat` assertions that already exist.

## Relationships

- T16 "system: interpolation per-type stringification not witnessed through the system: surface" — same-cluster (same under-assertion pattern: Adds names a set, Tests assert it only generically; resolves independently in `V6d`)
- T17 "V11e names five system-note rules but asserts only two" — same-cluster (Adds names rules; Tests assert a subset; resolves independently)
- T15 "Forward-reference params type RHS claimed in V6b Adds but never asserted" — same-cluster (Adds names a behaviour with no companion assertion; resolves independently)

---

# T15 — Forward-reference params type RHS claimed in V6b Adds but never asserted

**Original heading:** Forward-reference param type RHS not explicitly asserted
**Original section:** docs/plan_topics/V6b-params-defaults.md
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V6b`'s **Adds** field enumerates "type-expression RHS (forward references)" as part of the `params:` contract it delivers. The spec backs this as normative behaviour: in `frontmatter-fields-a.md` (the *Type side* bullet), a `params:` field whose right-hand side is a `NamedType` "resolves against the file's body-level `schema` / `enum` declarations," and "a forward reference from frontmatter to a `schema` or `enum` declared later in the body resolves, because … name resolution runs once the file's top-level declarations are all known." The unresolved case is the parse-time diagnostic `loom/parse/unresolved-named-type`.

`V6b`'s (and `V6b-T`'s) **Tests** bullets cover only three behaviours: `loom/parse/non-trailing-default` ordering, `loom/parse/default-not-literal`, and AJV validation against the lowered schema. None of these exercises forward-reference name resolution. All three named tests pass against an implementation that resolves named types only when they are declared *before* the `params:` block (or that does no whole-file resolution at all). The whole-file forward-resolution behaviour — the load-bearing part of the Adds claim — has no positive assertion, and the closing-gate path for this leaf is code-keyed, so `loom/parse/unresolved-named-type` is not pinned to an asserting test anywhere in the corpus.

## Plan Documents

- `docs/plan_topics/V6b-T-params-defaults.md` — Tests (edited)
- `docs/plan_topics/V6b-params-defaults.md` — Tests / Adds (edited)

## Spec Documents

- `docs/spec_topics/frontmatter/frontmatter-fields-a.md` — *Type side* / `params` contract (read-only)

## Affected Leaves

**Phases:** V6 — Frontmatter

**Leaves (implementation order):**

- `V6b-T` — `params` and defaults (tests) — (modified)
- `V6b` — `params` and defaults — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge while both shipping `V6b` green: one implements whole-file forward resolution (per spec), one resolves named types only in declaration order, and the existing tests distinguish neither. A `params` entry whose type RHS forward-references a later body `schema`/`enum` could fail to resolve in production with no test catching it, and the associated `loom/parse/unresolved-named-type` diagnostic can ship unimplemented.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The `V6b` Adds claim "type-expression RHS (forward references)" and the three-bullet Tests set both entered in the plan's first commit c6a664e; the Tests never covered forward-reference resolution. The two later commits touching `V6b`/`V6b-T` (450ec77, 7678da2) addressed unrelated concerns. The gap is original.

## Solution Space

**Shape:** single

### Recommendation

Add a Tests bullet to `docs/plan_topics/V6b-T-params-defaults.md` (the paired tests-task leaf, where the failing test lands first per the per-phase TDD ritual) asserting that a `params:` entry whose type RHS forward-references a `schema`/`enum` declared *later* in the loom body resolves and validates correctly — e.g. a `params:` field typed `Author` (or `Severity`) where the declaration appears below the frontmatter. Mirror the same bullet into `docs/plan_topics/V6b-params-defaults.md`'s Tests.

Edge cases the implementer must watch: the negative path — a `params:` named type that resolves to no body declaration — is the spec diagnostic `loom/parse/unresolved-named-type`, likewise unasserted in the corpus; asserting it alongside the positive case closes the code-keyed coverage. The forward-referenced `schema`/`enum` machinery is owned by `V5a` and reaches `V6b` transitively through its existing `V5d` dep, so no `Deps` change is required.

## Relationships

- T35 "model/bind_* resolution hooks named in V6a Adds with no closing assertion" — same-cluster (sibling `V6a` frontmatter leaf with the identical Adds-claims-behaviour / no-asserting-test gap; resolves independently)
- T14 "Stdlib members beyond replace/concat have no named assertion" — same-cluster (same Adds-names-a-set / Tests-assert-a-subset pattern; resolves independently)

---

# T16 — system: interpolation per-type stringification not witnessed through the system: surface

**Original heading:** `system` stringification table asserted only generically
**Original section:** docs/plan_topics/V6d-system-interpolation.md
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V6d` reuses the canonical interpolation-stringification table for the `system:` field's bare-path `${param}` / `${param.field}` form. The leaf's coverage of this is the single Tests bullet *"a Path-only `${…}` resolves and stringifies per the table"*, which exercises exactly one resolution and does not name which static-type rows the `system:` path drives. `V6d`'s own logic — resolving a `Path` against the validated `params` object, determining the resolved value's Loom static type, and feeding it into the shared renderer — is per-type behaviour that a single generic assertion does not witness.

The table has a `system:`-specific reachability profile the spec calls out explicitly: the `Result<T, E>` row cannot fire here (`params:` types never include `Result`), while the `number` row's non-finite cases (`NaN` / `±Infinity`) *are* reachable through the non-slash argument arms (`invoke(...)` / `.loom`-callable), and `null` must render as the literal text `null` rather than the empty string. None of these `system:`-surface distinctions is asserted. A param of an untested type (object → compact JSON, enum → wire value, integer, boolean, the non-finite `number` cases) could resolve and stringify incorrectly through the `system:` entry point and still pass `npm test`.

Row-level rendering correctness is owned by `V13a`, so this is not a request to re-derive the table. It is the gap that `V6d`'s resolve-then-stringify path is not observed feeding each distinct param-resolvable type into the shared renderer.

## Plan Documents

- `docs/plan_topics/V6d-T-system-interpolation.md` — Tests (edited)
- `docs/plan_topics/V6d-system-interpolation.md` — Tests / Ships when (edited)
- `docs/plan_topics/V13a-query-render.md` — Stringification table (canonical row-correctness owner) (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice V6 (Frontmatter)

**Leaves (implementation order):**

- `V6d-T` — `system` template interpolation (tests) — (modified)
- `V6d` — `system` template interpolation — (modified)

## Consequence

**Severity:** advisory

A `params` type the `system:` resolution mishandles (object/array compact JSON, enum wire value, `null` literal, or a non-finite `number` reaching the slot through the non-slash arms) can ship green because no `system:`-surface vector exercises it; the model would silently see a corrupted system prompt. The implementation can still be written correctly by routing through the shared renderer, so this is a test-coverage gap rather than a blocker.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — "pi-loom plan: build/update plan for spec.md + review" (2026-06-10, Thomas Andersen)
**History:** The `V6d` and `V6d-T` leaf files were both created in commit c6a664e and the generic *"a Path-only `${…}` resolves and stringifies per the table"* Tests bullet has been present verbatim since. `git log --follow` on each returns only c6a664e. The gap is original.

## Solution Space

**Shape:** single

### Recommendation

Strengthen the `system:` stringification coverage in `V6d-T` (and mirror it in `V6d`'s Tests bullet) so the `system:` resolve-then-stringify path is observed for each distinct param-resolvable Loom static type, rather than a single unnamed Path resolution. Replace the bullet with assertions that drive a reference vector through the `system:` surface for: `string`, `integer`, `number` (including the non-finite `NaN` / `Infinity` / `-Infinity` cases, which reach the slot only through the non-slash `invoke(...)` / `.loom`-callable arms), `boolean`, `null` (renders the literal text `null`, not the empty string), an enum variant (renders its wire value), an `array<T>`, and a schema-typed object (compact `JSON.stringify` with wire-name translation). Also assert that the `Result<T, E>` row does not arise from this surface.

Anchor the expected renderings to the canonical table in `query/query-escapes-stringification.md` and let `V13a` retain ownership of row-level correctness. The `Deps` already include `V6a`, `V3a`, `V13a`, so no dependency change is needed. Update `V6d`'s **Ships when** to reference that the per-type `system:` vectors pass alongside the four `system-interp-*` codes and `\${` handling.

## Relationships

- T14 "Stdlib members beyond replace/concat have no named assertion" — same-cluster (same plan-lens-validation pattern: an enumerated/tabular behaviour asserted only generically; resolves independently in `V3a`)
- T17 "V11e names five system-note rules but asserts only two" — same-cluster (boundary/row asserted generically; resolves independently)
- T15 "Forward-reference params type RHS claimed in V6b Adds but never asserted" — same-cluster (V6b adds-without-asserting; resolves independently)

---

# T17 — V11e names five system-note rules but asserts only two

**Original heading:** "five note rules" only partially asserted
**Original section:** docs/plan_topics/V11e-system-note-determinism.md
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V11e`'s `Adds` enumerates the binder system-note rendering as "single-line, 120-codepoint cap at scalar boundaries with `…`, the five note rules". The spec section it cites — `binder/defaulting-system-note-echo.md` §System-note rendering — defines exactly five numbered rules: (1) single-line collapse/trim, (2) the 120-code-point length cap with trailing `…`, (3) the loom-controlled-prefix / model-or-runtime-controlled-suffix grammar demarcation, (4) empty-after-stripping model content routed to the malformed-envelope failure row, and (5) `ambiguous.candidates` not surfaced in loom 1.0.

Both `V11e` and its paired `V11e-T` carry only two Tests bullets covering this section: "the system-note renders single-line and truncates at 120 codepoints on a scalar boundary with `…`" (rules 1 and 2) plus the determinism contract. Rules 3, 4, and 5 have no named verification in the leaf and no closed-registry coverage gate. The `coverage-matrix.md` rows for `V11e` likewise list only the "single-line collapse + 120-codepoint truncation-with-`…`" MUSTs, so the closing gate reconciles only those two.

An implementer can therefore ship `V11e` green with rules 3–5 implemented incorrectly or omitted, because no asserting test exercises them and the leaf neither cross-references where they are asserted.

## Plan Documents

- `docs/plan_topics/V11e-system-note-determinism.md` — `Adds` / `Tests` (edited)
- `docs/plan_topics/V11e-T-system-note-determinism.md` — `Tests` (edited)
- `docs/plan_topics/V11c-bypass-envelope.md` — `BNDR-2` (`ambiguous.candidates` not surfaced) (read-only)
- `docs/plan_topics/coverage-matrix.md` — `V11e` System-note-rendering row (option-dependent)

## Spec Documents

- `docs/spec_topics/binder/defaulting-system-note-echo.md` — §System-note rendering (read-only)

## Affected Leaves

**Phases:** Vertical slice V11 (Binder)

**Leaves (implementation order):**

- `V11e-T` — Binder system-note rendering and determinism (tests) — (modified)
- `V11e` — Binder system-note rendering and determinism — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers can produce divergent system-note behaviour for note rules 3–5 (prefix/suffix boundary, empty-content→malformed-envelope classification, candidates suppression) and both ship `V11e` green, because no asserting test or coverage gate observes those rules. A defect in any of the three reaches release undetected.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `docs/plan_topics/V11e-system-note-determinism.md` entered the corpus in its single build commit c6a664e with the `Adds` already naming "the five note rules" while the `Tests` field (mirrored in `V11e-T`) asserted only single-line rendering, the 120-codepoint cap, and the determinism contract. The coverage gap has existed since the leaf's first and only commit.

## Solution Space

**Shape:** single

### Recommendation

In `V11e-T`'s `Tests` field (and the mirrored `Tests` field in `V11e`), account for each of the five System-note-rendering rules — for each, either add a Tests bullet that asserts it against a spec reference rendering, or cite the leaf that already asserts it:

- **Rule 1 (single-line collapse/trim).** Add a bullet asserting the spec's normative reference rendering (a `binding\tfailed   here` collapse, `a\u00A0b` U+00A0 preserved).
- **Rule 2 (120-code-point cap).** Already covered; optionally tighten with a boundary vector.
- **Rule 3 (prefix/suffix grammar demarcation).** Add a bullet asserting a failure-arm note matches `loom /<name>: <fixed-phrase> — <sanitised-suffix>` and the success echo `Running /<name>: <formatted-args>`.
- **Rule 4 (empty model content → malformed envelope).** Add a bullet asserting a `message` empty after rule-1 stripping is classified as a malformed envelope — or cite the leaf owning that failure row.
- **Rule 5 (`ambiguous.candidates` not surfaced).** Cite `V11c`'s `BNDR-2`, or add a bullet asserting the `ambiguous` row renders only the model's `message`.

If a rule is asserted by a sibling leaf, the leaf's text must name that leaf so the "five note rules" claim is traceable. Where a new asserting test closes an un-anchored MUST, update the corresponding `coverage-matrix.md` `V11e` row.

## Relationships

- T16 "system: interpolation per-type stringification not witnessed through the system: surface" — same-cluster (same partial-coverage pattern — `Adds` names a set, Tests assert generically; resolves independently in `V6d`)
- T14 "Stdlib members beyond replace/concat have no named assertion" — same-cluster (same partial-coverage pattern in `V3a`; resolves independently)

---

# T18 — V11b session-context truncation boundary (8000-token / 20-turn) has no asserting test

**Original heading:** 8000-token / 20-turn truncation boundary not explicitly asserted
**Original section:** docs/plan_topics/V11b-bind-context-transcript.md
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`V11b` / `V11b-T` own the `bind_context: session` truncation walk: the runtime walks turns newest-to-oldest and includes a candidate turn iff, after inclusion, the running token total is ≤ 8000 **and** the running turn count is ≤ 20; the first candidate that would violate either inequality is excluded entirely (whole-turn truncation), and the walk terminates. The spec pins this contract precisely, including inclusive cap-equality boundaries, and explicitly states that "Conformance tests verify the 8000-token budget, the 20-turn cap, and the whole-turn-exclusion rule by injecting a `FakeTokenEstimator`" (`binder-model-and-context.md` §Session-context truncation; PIC-16 exists for exactly this deterministic testability).

The leaf's Tests bullets, however, only assert the *rendering* of included turns: `BNDR-7` (compact-transcript renderings byte-exact), `BNDR-8` (assistant-body line order), `BNDR-9` (`custom-type-unsafe`), and the subagent diagnostic. No bullet drives the truncation walk across its caps. `BNDR-7i` is the rendering of a zero-included-turns result, not an assertion that the walk *cut* at the right boundary.

Because the walk's boundary semantics are untested, an implementation could ship an exclusive `< 8000` / `< 20` boundary (instead of the spec's inclusive `≤`), an off-by-one turn count, or a partial-turn split, and still pass `npm test`. The `TokenEstimator` seam (PIC-16) is injectable and deterministic, so the spec's own worked-example vectors are directly expressible as a stubbed-estimator test.

## Plan Documents

- `docs/plan_topics/V11b-T-bind-context-transcript.md` — Tests (edited)
- `docs/plan_topics/V11b-bind-context-transcript.md` — Tests / Ships when (edited)
- `docs/plan_topics/coverage-matrix.md` — `BNDR-7, BNDR-8, BNDR-9 → V11b` row (read-only)

## Spec Documents

- `docs/spec_topics/binder/binder-model-and-context.md` — §Session-context truncation (read-only)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-16 `TokenEstimator` seam + `FakeTokenEstimator` (read-only)

## Affected Leaves

**Phases:** Vertical slice V11 (Binder)

**Leaves (implementation order):**

- `V11b-T` — Bind context, truncation, and transcript renderer (tests) — (modified)
- `V11b` — Bind context, truncation, and transcript renderer — (modified)

## Consequence

**Severity:** correctness

The truncation walk could ship with an off-by-one or inverted boundary (exclusive instead of inclusive at 8000 tokens / 20 turns), a wrong turn count, or a partial-message split, and still pass `npm test` — nothing exercises the cut. Two reasonable implementers reading only the leaf would diverge on the boundary semantics, and the divergence is exactly the conformance behaviour the spec mandates a test for.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** Both `V11b` and `V11b-T` were created in `c6a664e`; the `8000`-token figure entered there and the `V11b-T` Tests bullets at that commit already listed only `BNDR-7`/`BNDR-8`/`BNDR-9` plus the subagent diagnostic, with no truncation-boundary assertion. The only later commit (`fe694dd`) reworded the `BNDR-9` enumeration. The omission has been present since the first commit.

## Solution Space

**Shape:** single

### Recommendation

Add a truncation-boundary test to `V11b-T`'s Tests (the tests task landing first per the TDD ritual), driven by a `FakeTokenEstimator` stub so the walk crosses each cap at a known boundary, and reflect the boundary in `V11b`'s Tests / Ships when. Cover, using the spec's own worked-example vectors:

- **Token cap, inclusive boundary + over-budget whole-turn drop.** Per-turn counts `[3000, 2500, 2500, 100, …]`: first three included (total 8000), fourth excluded entirely (`8100 > 8000`), cut is whole-turn.
- **Token cap, over-budget mid-walk.** `[1200, 900, 1500, 2000, 2800, …]`: four included (5600), fifth excluded.
- **Turn cap, inclusive boundary.** 21 turns whose token total never exceeds 8000: exactly the 20 newest included, 21st excluded.
- **Single oversized newest turn.** A newest turn alone exceeding 8000: zero included turns (distinct from the `BNDR-7i` rendering assertion).

Express the expected included-turn set / count per vector; do not couple to Pi's real estimation heuristic.

## Relationships

- T19 "V11b diagnostic-code citation is truncated and carries an undefined (W) severity suffix" — same-cluster (same `V11b`/`V11b-T` leaf; resolves independently)

---

# T19 — V11b diagnostic-code citation is truncated and carries an undefined (W) severity suffix

**Original heading:** `bind-context-session-on-subagent` diagnostic code truncated; undefined `(W)` annotation
**Original section:** docs/plan_topics/V11b-bind-context-transcript.md
**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

The canonical diagnostic code registered for declaring `bind_context: session` on a `mode: subagent` loom is `loom/parse/bind-context-session-on-subagent` (severity `W`), per the parse code registry (`docs/spec_topics/diagnostics/code-registry-parse.md`) and the owning rule in `docs/spec_topics/binder/binder-model-and-context.md`.

Both the `V11b` and `V11b-T` leaves cite this code as `bind-context-session-on-subagent` (W) in their fourth Tests bullet — dropping the `loom/parse/` prefix and appending a parenthetical `(W)` severity marker. Every other diagnostic-code citation across the plan corpus uses the full `loom/<area>/<name>` form with no severity suffix. The `(W)` notation is not defined anywhere in `conventions.md`; severity is a column of the spec registry table, not a citation annotation.

The `H5a` closing gate reconciles the diagnostics code registry against the asserting tests, scanning for `loom/...` registry-code citations. A test bullet that asserts the bare `bind-context-session-on-subagent` token is not recognisable as a citation of the registered code, so the registry code reads as having no asserting test while the asserted token reads as a code absent from the registry — both `H5a` failure conditions.

## Plan Documents

- `docs/plan_topics/V11b-bind-context-transcript.md` — Tests (fourth bullet) (edited)
- `docs/plan_topics/V11b-T-bind-context-transcript.md` — Tests (fourth bullet) (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — closing-gate registry reconciliation (read-only)
- `docs/plan_topics/conventions.md` — *Diagnostic message anchors* (read-only)

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-parse.md` — `loom/parse/bind-context-session-on-subagent` registry row (read-only)
- `docs/spec_topics/binder/binder-model-and-context.md` — the owning parse rule (read-only)

## Affected Leaves

**Phases:** Vertical (V11 — Binder)

**Leaves (implementation order):**

- `V11b-T` — Bind context, truncation, and transcript renderer (tests) — (modified)
- `V11b` — Bind context, truncation, and transcript renderer — (modified)

## Consequence

**Severity:** correctness

An implementer writing the test against the literal bullet text asserts a token that does not match any registry code, so the registry's `loom/parse/bind-context-session-on-subagent` row goes unasserted and the asserted token is unrecognised — exactly the registry↔test mismatch the `H5a` closing gate is built to fail on, surfacing as a gate failure when activated at `H6a`. The undefined `(W)` suffix additionally invites divergent reader interpretations of the citation form.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** Both `V11b-bind-context-transcript.md` and `V11b-T-bind-context-transcript.md` were created in c6a664e, and the truncated `bind-context-session-on-subagent` (W) citation was present in that authoring commit. The later fe694dd touched only the BNDR-9 bullet. The defect has been present since the leaves were first authored.

## Solution Space

**Shape:** single

### Recommendation

In the fourth Tests bullet of both `docs/plan_topics/V11b-bind-context-transcript.md` and `docs/plan_topics/V11b-T-bind-context-transcript.md`, replace the truncated citation with the full registry code and remove the `(W)` suffix:

`loom/parse/bind-context-session-on-subagent`: fires for `bind_context: session` on a `mode: subagent` loom.

Keep the two leaves' bullets identical. Severity stays in the registry's `W` column; do not reintroduce a severity annotation on the citation.

## Relationships

- T18 "V11b session-context truncation boundary (8000-token / 20-turn) has no asserting test" — same-cluster (same `V11b` Tests list; resolves independently)

---

# T20 — ERR-7 watcher-reload assertion has no in-leaf test and no declared producer→owner dependency

**Original heading:** `ERR-7` watcher-reload failure path implemented but not asserted in-leaf or cross-referenced
**Original section:** docs/plan_topics/V10c-settings-merge.md
**Kind:** validation, ordering
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V10c` Adds enumerates "the reload debounce feeding the `ERR-7` watcher-reload failure path," but `V10c` neither asserts `ERR-7` nor forward-points to the leaf that does. Its Tests bullets cover only `DISC-7` deep-merge precedence, the `loom/load/settings-invalid-json` diagnostic, and the 250 ms debounce coalescing; its Ships-when covers only deep-merge precedence and the malformed-settings diagnostic. So the leaf names the `ERR-7` surface as part of its scope while leaving it unverified and unattributed.

`ERR-7` is owned for closing purposes by `V4e`: `coverage-matrix.md` maps the `ERR-1 … ERR-7` row to `V4e`, and `V4e`'s Tests carry "`ERR-7`: watcher-reload failure routes pre-eval." But `V4e`'s Deps name neither `V10c` (the settings-watcher re-merge producer) nor `V9b` (whose registration step 5 builds the watcher + the `LoomRegistry` build-aside-publish swap, the source of the `loom/runtime/registry-swap-failed` arm). The plan never states whether `V4e`'s `ERR-7` test drives a real watcher reload through those producers or injects a synthetic failure at the channel seam.

The two readings diverge materially. If synthetic, no producer dependency is needed and `V10c`'s Adds over-claims. If a real watcher-reload failure, then `V10c` and the `V9b` swap are its producers and must precede it — but they are not declared as Deps, so the test would be scheduled before the mechanism it exercises.

## Plan Documents

- `docs/plan_topics/V10c-settings-merge.md` — Adds / Tests / Ships when (edited)
- `docs/plan_topics/V4e-pre-evaluation-failures.md` — Tests (`ERR-7`) / Deps (option-dependent)
- `docs/plan_topics/coverage-matrix.md` — `ERR-1 … ERR-7` row (read-only)
- `docs/plan_topics/V9b-registration-drain-state.md` — registration step 5 watcher + build-aside-publish swap (read-only)

## Spec Documents

None — `ERR-7`, its channel contract, and both failure arms are fully defined in `spec_topics/discovery/package-and-settings.md#watcher-time-reload-failures` and `spec_topics/errors-and-results/error-model.md#err-7`. The fix is internal to plan files.

## Affected Leaves

**Phases:** Vertical (slices V4, V9, V10)

**Leaves (implementation order):**

- `V4e` — Pre-evaluation failures — (both)
- `V9b` — Registration steps and drain-state contract — (option-dependent)
- `V10c` — Settings reads and merge — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one writes `V4e`'s `ERR-7` test with a synthetic injected failure (ships green, dep-light) while another drives a real `V10c` settings-watcher / `V9b` registry-swap reload, which is then scheduled ahead of its undeclared producers and cannot run as ordered. Meanwhile `V10c`'s Adds advertises an `ERR-7` responsibility it does not assert or hand off.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** `c6a664e` ("pi-loom plan: build/update plan for spec.md + review", 2026-06-10)
**History:** `V10c` and `V4e` were both first added in `c6a664e`; `git show c6a664e:docs/plan_topics/V10c-settings-merge.md` already carries the Adds "reload debounce feeding the `ERR-7` watcher-reload failure path" clause and a Ships-when that omits `ERR-7`, and `git show c6a664e:docs/plan_topics/V4e-pre-evaluation-failures.md` already carries the `ERR-7` test bullet with a Deps list that excludes `V10c`. The only later commit touching `V10c` (`3a02fc7`) addressed a different concern. The defect has existed unchanged since the corpus was authored.

## Solution Space

**Shape:** single

### Recommendation

`V4e`'s `ERR-7` test injects a synthetic watcher-rebuild failure at the `ERR-7` channel seam, asserting the `loom-system-note` / `triggerTurn:false` routing without standing up a live `V10c`/`V9b` watcher. The synthetic injection must drive both `ERR-7` arms — the re-parse/re-merge diagnostic arm and the `loom/runtime/registry-swap-failed` registry-swap arm. `V4e`'s Deps stay unchanged: `coverage-matrix.md` already pins `ERR-7` to `V4e`, so this keeps `V4e` aligned with the matrix and with the other pre-eval routing tests while avoiding any ordering inversion.

In `V10c` Adds, reword the trailing clause so it stops claiming closure of `ERR-7` and instead forward-points to `V4e` (e.g. "…and the reload debounce; the `ERR-7` watcher-reload failure surface this debounce feeds is asserted by `V4e`").

## Relationships

- T21 "Reload-debounce test does not bind to the injected Clock seam" — same-cluster (same `V10c` reload-debounce mechanism; resolves independently of the `ERR-7` assertion question)
- T04 "Coverage-matrix `…` range notation is never defined" — decision-dependency (the `ERR-1 … ERR-7` coverage-matrix row this finding relies on is the one whose range notation that finding flags as ambiguous)

---

# T21 — Reload-debounce test does not bind to the injected Clock seam

**Original heading:** Reload-debounce test reproducibility — no named Clock seam
**Original section:** docs/plan_topics/V10c-settings-merge.md
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V10c-T`'s third Tests bullet — "The reload debounce coalesces a burst of rapid watcher events into a single reload via the 250 ms drop-and-reschedule window" — asserts a time-window behaviour but names no deterministic time seam. The spec it cites (`package-and-settings.md#caching-and-reload`) is explicit that the debounce "is measured against the injected `Clock` seam via `Clock.setTimeout` / `Clock.clearTimeout`": each fresh watcher event clears the pending handle and reschedules, so a burst coalesces into a single reload firing 250 ms after the last event. A test that does not advance time through that seam must instead wait against a real timer, which is non-reproducible.

The sibling bounded-walk leaf `V10b` already models the correct shape: its `Adds.` field pins the per-read deadline timer to `Clock.setTimeout` precisely so the `FakeClock` seam can drive it. `V10c-T` should bind the debounce test the same way. The seam is already available — both `V10c-T` and `V10c` list `V8b` (which defines `Clock` and the `FakeClock` test seam) in their `Deps.`, so no dependency change is required; only the test bullet needs to name the seam and the observable boundary it asserts.

## Plan Documents

- `docs/plan_topics/V10c-T-settings-merge.md` — Tests (edited)
- `docs/plan_topics/V10c-settings-merge.md` — Tests (edited; mirrors the same debounce bullet)
- `docs/plan_topics/V10b-package-discovery.md` — Adds (read-only; reference shape for `Clock.setTimeout`-driven timing tests)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — Adds (read-only; defines the `Clock` / `FakeClock` seam consumed here)

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — Caching and reload (read-only; already mandates `Clock.setTimeout` / `Clock.clearTimeout`)

## Affected Leaves

**Phases:** Vertical V10 (Discovery and settings)

**Leaves (implementation order):**

- `V10c-T` — Settings reads and merge (tests) — (modified)
- `V10c` — Settings reads and merge — (modified)

## Consequence

**Severity:** correctness

Two implementers would write materially different debounce tests: one drives virtual time through `Clock`/`FakeClock` and asserts the coalescing boundary deterministically; the other waits on a real 250 ms timer and produces a flaky test that passes or fails by scheduling luck. The latter can ship green while never actually exercising the drop-and-reschedule boundary the spec requires, so a regression in the debounce (e.g. firing per-event instead of coalescing) could pass undetected.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The reload-debounce test bullet has existed in `V10c-T` since the file's first commit (`c6a664e`), originally with no time seam named. A later edit (`3a02fc7`) split the conflated bullet and added the spec anchor but still did not name the `Clock` seam. `git log -S "Clock"` over both leaf files returns no commits — neither has ever named the seam — so the defect dates to inception.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V10c-T-settings-merge.md`, revise the reload-debounce Tests bullet so it binds the test to the injected `Clock` seam and states the observable coalescing boundary. The bullet should specify that the debounce is exercised through the `FakeClock` test seam (`Clock.setTimeout` / `Clock.clearTimeout`, per `package-and-settings.md#caching-and-reload`) with virtual time advanced deterministically, asserting that a burst of N watcher events within one 250 ms window produces exactly one reload, and that a subsequent event after the window closes produces a second reload. Apply the same revision to the mirrored bullet in `docs/plan_topics/V10c-settings-merge.md`.

`V8b` is already present in both leaves' `Deps.`, so no `Deps.` edit is needed. Edge case: the assertion must distinguish coalescing (N events → 1 reload) from per-event firing (N events → N reloads), and must observe the second reload only after virtual time crosses the window boundary following the last event.

## Relationships

- T20 "ERR-7 watcher-reload assertion has no in-leaf test and no declared producer→owner dependency" — same-cluster (same `V10c`/`V10c-T` reload-debounce mechanism; that finding adds a failure-path assertion, this one makes the coalescing test deterministic)

---

# T22 — V3d-T over-asserts final-value propagation against invoke/subagent caller surfaces built in later slices

**Original heading:** `V3d-T` tests final-value propagation into an `invoke`/subagent caller no prior leaf builds
**Original section:** docs/plan_topics/V3d-functions-and-return.md / V3d-T
**Kind:** ordering
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V3d-T` and `V3d` both carry a final-value-contract Tests bullet that asserts "the final value propagates to an `invoke`/subagent caller on success and is absent on fail/cancel." The `invoke(...)` caller surface is built by `V15a` (Invocation core) and the subagent caller by `V9i` (Subagent-mode session isolation). `V3d`/`V3d-T` declare `Deps. V3a, V4a` only, so neither caller surface exists at the point `V3d-T` is picked up.

The dependency cannot be repaired by pulling the callers earlier: `V15a` already declares `Deps. … V3d`, so adding `V15a` to `V3d`'s Deps would introduce a cycle. The caller-side propagation assertion therefore cannot live in `V3d-T` as currently written.

What `V3d` legitimately owns is the function-result seam: what a function body yields as its final/produced value on success, and that this value is absent on fail/cancel. Caller-side propagation belongs to the leaves that build those callers (`V15a`, `V9i`). As written, the spec's final-value contract is asserted only against a caller surface that does not yet exist, and no later leaf asserts the caller-side half independently, so a faithful narrowing of `V3d-T` would leave that half asserted nowhere.

## Plan Documents

- `docs/plan_topics/V3d-T-functions-and-return.md` — Tests (final-value-contract bullet) (edited)
- `docs/plan_topics/V3d-functions-and-return.md` — Tests (final-value-contract bullet) + Ships when (edited)
- `docs/plan_topics/V15a-T-invocation-core.md` — Tests (option-dependent)
- `docs/plan_topics/V15a-invocation-core.md` — Tests (option-dependent)
- `docs/plan_topics/V9i-T-subagent-isolation.md` — Tests (option-dependent)
- `docs/plan_topics/V9i-subagent-isolation.md` — Tests (option-dependent)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices — V3, V9, V15 (in order)

**Leaves (implementation order):**

- `V3d-T` — Functions and return (tests) — (modified)
- `V3d` — Functions and return — (modified)
- `V9i` — Subagent-mode session isolation and lifecycle — (modified)
- `V15a` — Invocation core — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge at `V3d-T`: one blocks because the `invoke`/subagent caller does not exist, the other writes the assertion against an invented stub caller whose shape need not match how `V15a`/`V9i` are later built. Either way, the spec's final-value contract on the caller side is never asserted against the real caller surface, so a defect in caller-side propagation can ship green.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commit:** c6a664e — "pi-loom plan: build/update plan for spec.md + review" (2026-06-10)
**History:** The plan corpus under `docs/plan_topics/` entered the repository in the single plan-build commit `c6a664e`; `git log --follow` reports exactly one commit for each file. `git log -S` on the defect token ("final value propagates to an `invoke`/subagent caller") returns only `c6a664e`. The mis-scoped final-value bullet has therefore been present since the plan corpus was first authored.

## Solution Space

**Shape:** single

### Recommendation

Rescope the `V3d`/`V3d-T` final-value bullet to the function-result seam first (this bounds scope and unblocks `V3d-T`), then re-home the caller-side coverage to the leaves that build the callers.

Rescope (do first): in both `docs/plan_topics/V3d-T-functions-and-return.md` and `docs/plan_topics/V3d-functions-and-return.md`, rewrite the final-value-contract Tests bullet so it asserts only what `V3d` owns — the function body's produced/final value on success and its absence on fail/cancel, observed at the function-result seam — with no reference to an `invoke`/subagent caller. Align the `V3d` **Ships when** phrasing to the produced-value seam wording. Do **not** add `V15a` to `V3d`'s Deps — `V15a` already depends on `V3d`, so the edge would cycle.

Re-home caller-side coverage: add a caller-side final-value-propagation assertion to the leaves that own the caller surfaces, against the function-result seam `V3d` defines. In the `invoke` path (`V15a` / `V15a-T`) assert the callee's final value propagates to the `invoke` caller on success and is absent on fail/cancel; in the subagent path (`V9i` / `V9i-T`) assert the same. These leaves already declare the needed prerequisites transitively, so no new dependency edges into `V3d` are required. Ensure the `V15a`/`V9i` caller-side assertions name the same function-result seam `V3d` owns.

## Relationships

- T24 "V4c-T/V4c assert no-rollback over subagent, query, tool-call, and invoke surfaces built in later slices" — same-cluster (same pattern: a `-T` leaf asserting over `invoke`/subagent surfaces built in later slices; resolves independently via the same seam-scoping approach)
- T29 "V18c-T runtime-evidence test exercises integrated features its Deps do not satisfy" — same-cluster (same ordering pattern: a `-T` leaf's failing test references features not yet built; resolves independently)

---

# T23 — ERR-13 no-rollback / completed-callee finality is over-claimed and unasserted in V4c

**Original heading:** ERR-13 "completed tool calls/queries/invoke children are final / no rollback" over-claimed and asserted generically
**Original section:** docs/plan_topics/V4c-terminal-outcomes.md / V4c-T
**Kind:** overclaim, validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `V4c` leaf's **Ships when** ("`npm test` proves committed turns survive cancellation and `?`-propagation unmodified, with no rollback") and its `ERR-13` test bullet ("`?`/panic/cancel never unwind side effects; completed tool calls, queries, and invoke children are final") are stated as universal guarantees, but the leaf's enumerated `ERR-8`…`ERR-13` cases sample only specific constructed scenarios. The no-rollback property is architectural — it holds because the runtime contains no compensating/rollback path, not because a finite test set witnesses every side-effecting surface. "Proves … no rollback" therefore claims coverage the enumerated cases cannot deliver.

Separately, `ERR-13`'s "completed tool calls, queries, and invoke children are final" clause is not broken out into any assertion that exercises a completed callee distinct from an appended turn. The other bullets (`ERR-8`…`ERR-11`) concern committed turns / Pi-committed surfaces; nothing drives a tool call, query, or invoke child to completion and then fires a downstream `?`/panic/cancel to observe that the completed side effect persists. The finality of completed callees is asserted in prose but has no closing test in either `V4c` or `V4c-T`.

`ERR-13` names surfaces — subagent, query, tool-call, invoke — produced by later slices; the seam the new assertion must run against is the subject of the sibling ordering finding, on which this one depends.

## Plan Documents

- `docs/plan_topics/V4c-terminal-outcomes.md` — Tests (`ERR-13`) + Ships when (edited)
- `docs/plan_topics/V4c-T-terminal-outcomes.md` — Tests (`ERR-13`) + Ships when (edited)
- `docs/plan_topics/coverage-matrix.md` — `ERR-8 … ERR-13 → V4c` row (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice V4 — Errors and results

**Leaves (implementation order):**

- `V4c-T` — Terminal outcomes, partial-append, and no-rollback (tests) — (modified)
- `V4c` — Terminal outcomes, partial-append, and no-rollback — (modified)

## Consequence

**Severity:** correctness

If shipped unfixed, `V4c` passes its closing gate while the stated "completed tool calls/queries/invoke children are final" guarantee has no closing assertion — the gate passes vacuously for that claim. The over-broad "proves … no rollback" wording invites a reviewer to treat the architectural property as test-witnessed when it is not, so a regression in completed-callee finality (e.g. a future compensating path) could ship without reddening `V4c`.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The `V4c` / `V4c-T` leaf pages were created in their only commit, c6a664e. The `ERR-13` bullet and the "no rollback" Ships-when wording are present verbatim in that first commit, so the over-claim and the missing completed-callee assertion have existed since the leaf's inception.

## Solution Space

**Shape:** single

This finding is bimodal: it asks for (1) a wording de-scope of the universal-negative claim and (2) a new test assertion. Both are required.

### Recommendation

Apply both fixes, landing the wording de-scope first so the gate is accurately scoped before the new assertion is added.

De-scope the over-claim: in `V4c` **Ships when**, replace "proves committed turns survive cancellation and `?`-propagation unmodified, with no rollback" with wording scoped to the enumerated `ERR-8`…`ERR-13` cases, and state that the no-rollback guarantee rests on the runtime having no compensating/rollback path. Mirror the same scoping in the `ERR-13` bullet of both `V4c` and `V4c-T`.

Then add a completed-callee finality assertion: add a Tests bullet to `V4c-T` (with paired implementation behaviour in `V4c`) that drives a tool call / invoke child to *completion*, fires a downstream `?`/panic/cancel, and asserts the completed callee's side effect persists and that no compensating turn is injected. The assertion exercises a completed callee distinct from an appended turn, scoped against the cancellation (`V17a`) / invocation-harness seam rather than the live later-slice surfaces, per the sibling ordering finding (T24). The new assertion must drive a callee to *completion* before the terminal event, not merely an appended turn. This step depends on the seam-vs-live-surface scoping decision from T24 being settled first.

## Relationships

- T24 "V4c-T/V4c assert no-rollback over subagent, query, tool-call, and invoke surfaces built in later slices" — decision-dependency (its seam-vs-live-surface scoping decision constrains how Option B's completed-callee assertion is written; resolve T24 first)

---

# T24 — V4c-T/V4c assert no-rollback over subagent, query, tool-call, and invoke surfaces built in later slices

**Original heading:** `V4c-T` asserts no-rollback over subagent/query/tool-call/invoke surfaces built in later slices
**Original section:** docs/plan_topics/V4c-terminal-outcomes.md / V4c-T
**Kind:** ordering
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V4c-T` (and the paired `V4c`) carry two terminal-outcome test bullets that name concrete features from much later slices:

- `ERR-12`: "ERR-8 holds inside a subagent loom" — the subagent-mode session is built by `V9i`.
- `ERR-13`: "`?`/panic/cancel never unwind side effects; completed tool calls, queries, and invoke children are final" — tool calls are built by `V14a`, queries by `V13c`, and invoke children by `V15a`.

`V4c-T`'s declared `Deps` are `V4a, V17a` only. Under the dep-driven build order, this places `V4c-T`/`V4c` early in the errors-and-results work, long before any of `V9i`/`V13c`/`V14a`/`V15a` exist. The plan never states how the `ERR-12`/`ERR-13` assertions are actually exercised. Two readings are possible:

1. The vectors drive the **live** subagent/query/tool-call/invoke surfaces. Then `V4c-T` cannot run as ordered — it would need those producers as prerequisites, forcing a re-sequence of a foundational V4 leaf behind the entire query/tool/invoke/subagent stack.
2. The vectors drive the **cancellation and invocation-harness seam generically** — `V17a`'s `loomAbort`/checkpoint/late-settlement contract plus the `H4a` in-process session double standing in for a completed tool-call/query/invoke-child/subagent outcome. Then the current `Deps` are correct.

Nothing in `V4c-T`, `V4c`, or the harness contract pins which reading holds.

## Plan Documents

- `docs/plan_topics/V4c-T-terminal-outcomes.md` — Tests (edited)
- `docs/plan_topics/V4c-terminal-outcomes.md` — Tests, Adds (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — session-double fidelity contract (read-only; the seam the tests route through)
- `docs/plan_topics/V17a-cancellation-core.md` — cancellation contract / `loomAbort` (read-only; already a declared dep)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical (V4 slice)

**Leaves (implementation order):**

- `V4c-T` — Terminal outcomes, partial-append, and no-rollback (tests) — (modified)
- `V4c` — Terminal outcomes, partial-append, and no-rollback — (modified)

(`V9i`, `V13c`, `V14a`, `V15a` are named by the finding but are read-only context.)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one exercises `ERR-12`/`ERR-13` against the `V17a`/`H4a` seam and ships `V4c-T` at its declared position; the other reads the bullets as requiring the live `V9i`/`V13c`/`V14a`/`V15a` surfaces and is blocked. The no-rollback gate then either ships green at V4c without ever touching the surfaces it names, or stalls the whole V4 error model behind the invocation stack.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `git log --follow` on both `V4c-T-terminal-outcomes.md` and `V4c-terminal-outcomes.md` returns only `c6a664e`; `git blame` attributes the `ERR-12`/`ERR-13` bullets, the `Deps. V4a, V17a` line, and the Ships-when to `c6a664e`. The leaf was authored in a single commit with the later-slice references and the narrow dep set already in tension.

## Solution Space

**Shape:** single

### Recommendation

In both `docs/plan_topics/V4c-T-terminal-outcomes.md` and `docs/plan_topics/V4c-terminal-outcomes.md`, state that `ERR-12` and `ERR-13` are exercised through the `V17a` cancellation contract (`loomAbort`, checkpoint set, late-settlement discard) and the `H4a` in-process session-double harness standing in for a completed tool-call / query / invoke-child / subagent outcome — **not** the live `V9i`/`V13c`/`V14a`/`V15a` surfaces. Keep `Deps` as `V4a, V17a`.

Concretely:
- Append to the `ERR-12` bullet a clause naming the seam (e.g. "exercised via the `H4a` harness modelling a subagent-mode callee, not the live `V9i` surface").
- Append to the `ERR-13` bullet a clause (e.g. "completed tool-call / query / invoke-child outcomes are modelled through the `H4a` session double and the `V17a` side-effect seam, not the live `V14a`/`V13c`/`V15a` surfaces").
- In `V4c`'s **Adds**, add one behavioural sentence recording that the no-rollback guarantee is architectural — the runtime contains no compensating path.

This depends on the `H4a` fidelity contract exposing a way to model a completed callee distinct from an appended turn; if not yet defined, this fix is gated on the `H4a` harness-scripting finding. The implementer must ensure the seam-level assertion still witnesses a *completed* callee whose side effect survives a downstream `?`/panic/cancel.

## Relationships

- T23 "ERR-13 no-rollback / completed-callee finality is over-claimed and unasserted in V4c" — decision-dependency (same `ERR-13` bullet in the same leaf; the seam-vs-live decision here constrains how that finding's added completed-callee assertion is written — this one must precede it)
- T36 "Session double's model / tool / binder-response scripting surface is undefined" — decision-dependency (the seam-based exercise recommended here relies on the `H4a` harness defining a model/tool-call/completed-callee programming surface — this one must follow it)
- T22 "V3d-T over-asserts final-value propagation against invoke/subagent caller surfaces built in later slices" — same-cluster (same class of defect — a `-T` leaf asserting over a surface built in a later slice; resolves independently)

---

# T25 — V4d Tests bullets carry non-assertion notes (NOCEIL-2 scope, ERR-19 delegation) that belong in Adds

**Original headings:**
- ERR-15 NOCEIL-2 normative constraint lives only in a Tests bullet
- ERR-19 cross-leaf delegation note in a Tests bullet

**Original section:** docs/plan_topics/V4d-queryerror-variants.md / V4d-T
**Kind:** placement, cruft
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

Two of `V4d`'s Tests bullets carry content that is not a test expectation and belongs in the `Adds` field, and both are duplicated verbatim into the paired `V4d-T`.

First, the `ERR-15` Tests bullet carries a parenthetical stating normative scope: "(NOCEIL-2 seam: `ContextOverflowError` is the sole token-domain failure surface, with no per-query or cumulative token cap)." This is a MUST-NOT constraint on the runtime's token-domain failure surface — loom 1.0 imposes no per-query response-token cap and no cumulative token budget — and `V4d` is the closing leaf that traces NOCEIL-2. The constraint sits only in the test bullet; `V4d`'s `Adds` field (which enumerates the nine-variant `QueryError` union) does not carry it, so a reader scoping the leaf from `Adds` sees the variant union but no statement that `ContextOverflowError` is the sole token-domain failure surface.

Second, the `ERR-19` Tests bullet ends with "the at-the-cap firing path is asserted by V13c." This is coverage-division metadata — a statement about *where* a sibling concern is tested — not a test expectation the `V4d` suite asserts. The body correctly describes what `V4d` verifies (the `ToolLoopExhaustedError` shape); the trailing delegation clause belongs to the leaf's narrative. The ownership split itself is correct (`V13c` owns the at-the-cap firing path); the defect is purely that the note sits inside a Tests bullet.

## Plan Documents

- `docs/plan_topics/V4d-queryerror-variants.md` — `Adds` (target) / `Tests` (`ERR-15`, `ERR-19` bullets) (edited)
- `docs/plan_topics/V4d-T-queryerror-variants.md` — `Tests` (`ERR-15`, `ERR-19` bullets carry the identical text) (edited)
- `docs/plan_topics/V13c-query-tool-loop.md` — Tests (read-only; owns the at-the-cap firing-path assertion)

## Spec Documents

None — NOCEIL-2 is already fully defined at `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md`; this is a plan-internal placement fix.

## Affected Leaves

**Phases:** Vertical slice V4 (Errors and results)

**Leaves (implementation order):**

- `V4d-T` — `QueryError` variant schema (tests) — (modified)
- `V4d` — `QueryError` variant schema — (modified)

## Consequence

**Severity:** advisory

An implementer reading `V4d`'s `Adds` to scope the leaf's behavioural surface sees the nine-variant union but no statement of the NOCEIL-2 no-token-cap constraint, so the behavioural description understates what the leaf must hold; a reader who skips the Tests bullet could believe a per-query or cumulative token cap is in scope. The `ERR-19` delegation clause may be misread as relieving `V4d` of any cap obligation or as an extra assertion. The constraints are still present in the leaf's test bullets and in the spec, so a working leaf is still producible — the defect is an incomplete behavioural-surface field plus non-assertion notes in the assertion list.

## Issue introduction

**Verdict:** single-commit (each)
**Introducing commits:** e8c1d65 — pi-loom plan: resolve "NOCEIL-2/NOCEIL-4 closing-leaf trace annotations" (2026-06-10) [ERR-15 NOCEIL-2 parenthetical]; eaa2893 — pi-loom plan: resolve "ERR-19 firing-at-the-cap out of scope for V4d" (2026-06-10) [ERR-19 delegation clause]
**History:** `V4d` was created in c6a664e with an `ERR-15` bullet that carried no NOCEIL-2 text and no NOCEIL-2 clause in `Adds`. Commit e8c1d65 added the NOCEIL-2 trace annotation but appended it as a parenthetical to the ERR-15 Tests bullet. Separately, the `ERR-19` bullet originally asserted firing; commit eaa2893 rewrote it to assert only the error shape and appended the cross-leaf delegation clause into the Tests bullet of both `V4d` and `V4d-T`. Both notes entered parked in test bullets rather than in `Adds`.

## Solution Space

**Shape:** single

### Recommendation

Relocate both notes from the Tests bullets into `V4d`'s `Adds` field, applying the same edit to the paired `V4d-T`:

- **NOCEIL-2.** Add the scope to `V4d`'s `Adds` as a behavioural clause alongside the `QueryError` union description — e.g. "`ContextOverflowError` is the sole token-domain failure surface (NOCEIL-2): loom 1.0 imposes no per-query response-token cap and no cumulative token budget." Once `Adds` carries it, the ERR-15 Tests bullet parenthetical may remain a test annotation or be trimmed to the discriminator-type-openness assertion the bullet actually exercises.
- **ERR-19.** Strike the trailing clause `; the at-the-cap firing path is asserted by V13c` from the `ERR-19` Tests bullet, leaving it to assert only the `ToolLoopExhaustedError` shape, and relocate the ownership note to `Adds` (e.g. noting the at-the-cap firing path is owned and asserted by `V13c`).

The spec is read-only — NOCEIL-2 is already defined; reference it, do not restate. Keep `V4d` and `V4d-T` consistent. `V13c` is read-only for this fix.

## Relationships

None

---

# T26 — V17a substrate-level suppression test claims four-site coverage it cannot directly verify

**Original heading:** Substrate-level suppression test claimed to cover all four sites
**Original section:** docs/plan_topics/V17a-cancellation-core.md / V17a-T
**Kind:** overclaim
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V17a`'s *Swallowing-handler side-channel suppression* Tests bullet (and the mirrored `V17a-T` bullet) lands a single late-settlement assertion at the `Checkpoint`-seam substrate (`V8a`) and instructs: "Keep this assertion at the `Checkpoint`-seam substrate covering all four abandonable-Promise sites (code-side `execute()`, `@`-query provider, `invoke` child top-level, subagent `AgentSession.abort()`) rather than per-site." The Ships-when field repeats the claim.

One substrate-level assertion can prove the substrate suppresses the three side channels (no `unhandledRejection`, no second `RuntimeEvent`, no diagnostic). It cannot prove that each of the four named sites actually routes its abandonable Promise *through* that substrate — that is a per-site routing property. Three of the four sites are built by leaves downstream of `V17a`: `@`-query provider (`V13c`), code-side `execute()` (`V14a`), `invoke` child top-level (`V15a`), and subagent `AgentSession.abort()` (`V9i`). None of those leaves exists at `V17a`'s position, and none carries any acceptance criterion obligating its abandonable Promise to attach at the `Checkpoint` substrate. The "covering all four sites" claim therefore rests on an unstated routing assumption that no test observes.

## Plan Documents

- `docs/plan_topics/V17a-cancellation-core.md` — *Swallowing-handler side-channel suppression* Tests bullet + Ships when (edited)
- `docs/plan_topics/V17a-T-cancellation-core.md` — mirrored suppression Tests bullet (edited)
- `docs/plan_topics/V13c-query-tool-loop.md` — `@`-query provider site (option-dependent)
- `docs/plan_topics/V14a-tool-calls.md` — code-side `execute()` site (option-dependent)
- `docs/plan_topics/V15a-invocation-core.md` — `invoke` child top-level site (option-dependent)
- `docs/plan_topics/V9i-subagent-isolation.md` — subagent `AgentSession.abort()` site (option-dependent)
- `docs/plan_topics/V8a-checkpoint-validator-seams.md` — `Checkpoint` seam (substrate) (read-only)

## Spec Documents

None. The suppression rule already exists in `cancellation.md` (*Race semantics — swallowing-handler attachment on every abandonable Promise*); the fix is internal to the plan leaves.

## Affected Leaves

**Phases:** Vertical slices (V9, V13, V14, V15, V17)

**Leaves (implementation order):**

- `V9i` — Subagent-mode session isolation and lifecycle — (modified)
- `V13c` — Query tool loop and typed two-phase — (modified)
- `V14a` — Tool calls (code-side) and `CodeToolError` — (modified)
- `V15a` — Invocation core — (modified)
- `V17a` — Cancellation core — (modified)

## Consequence

**Severity:** correctness

The plan asserts that suppression is covered at all four sites, but only the substrate is exercised; the per-site routing it depends on is unverified. If a later implementer builds one of the three downstream sites so its abandonable Promise bypasses the `Checkpoint` substrate (e.g. a directly-attached `.catch`), the side channel reopens and no test in the corpus catches it — `npm test` ships green while one of the four named sites leaks `unhandledRejection`/`RuntimeEvent`/diagnostic noise on a late settlement.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** `52a6819` ("pi-loom plan: resolve \"cancellation test bullet conflates four obligations\"", 2026-06-10)
**History:** At inception (`c6a664e`) the suppression obligation was a single conflated Tests bullet with no enumeration of sites and no four-site coverage claim. Commit `52a6819` split that conflated bullet into properly-anchored Tests bullets and, in the suppression bullet, introduced the "covering all four abandonable-Promise sites … rather than per-site" framing. The single substrate-level assertion now claims coverage of four named sites, three built downstream. `git log -S "all four abandonable-Promise sites"` resolves to `52a6819` only.

## Solution Space

**Shape:** single

### Recommendation

Keep the substrate-level suppression test in `V17a`, but reword the `V17a` (and `V17a-T`) suppression Tests bullet and Ships-when so the assertion claims only what it observes: suppression is verified at the `Checkpoint`-seam substrate, and per-site coverage holds only insofar as each site routes its abandonable Promise through that substrate. Then close the routing gap by adding to each of the four owning leaves (`V9i`, `V13c`, `V14a`, `V15a`) an acceptance criterion that the site's abandonable Promise attaches its swallowing handler at the `Checkpoint` substrate, so a site that bypasses the substrate reddens its own leaf's tests. The four leaves each already declare the `Checkpoint` seam (`V8a`) as the routing target — the new criterion asserts attachment at that seam, not a fresh per-leaf handler convention.

## Relationships

None

---

# T27 — V18a Ships-when claims partition verification with no backing mechanism

**Original heading:** Cardinality assertion does not verify the probe partition
**Original section:** docs/plan_topics/V18a-capability-inventory.md
**Kind:** overclaim
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18a`'s **Ships when** reads "`npm test` asserts `CAPABILITY_OBLIGATIONS.length === 7` and the factory-probable/non-probable partition." The only mechanism the leaf names is the `CAPABILITY_OBLIGATIONS.length === 7` build-time cardinality assertion. A length check proves there are seven entries; it says nothing about *which* entries are factory-probed at Step 0 versus verified otherwise. The PIC-15 Tests bullet (identical in `V18a` and `V18a-T`) describes the intended partition — items 1/2/3/4/6 factory-probed at Step 0, items 5/7 verified otherwise — but couples it to the same cardinality assertion as its only stated mechanism.

The partition is a spec-anchored property: each item in `capability-inventory-items.md` declares whether it is reached by the Step-0 factory probe or verified by another path. An implementer who writes only the `.length === 7` assertion satisfies the **Ships when** literally while leaving the partition entirely unverified — a constant that mis-classifies which items are factory-probed would ship green.

## Plan Documents

- `docs/plan_topics/V18a-capability-inventory.md` — Ships when, Tests (PIC-15) (edited)
- `docs/plan_topics/V18a-T-capability-inventory.md` — Tests (PIC-15) (edited)
- `docs/plan_topics/V9a-capability-probe.md` — Step-0 factory probe / SDK named-member check (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** V18 — Build-time SDK gates

**Leaves (implementation order):**

- `V18a-T` — SDK capability inventory (tests) — (modified)
- `V18a` — SDK capability inventory — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one writes only the cardinality assertion (satisfying **Ships when** verbatim) and the partition goes unchecked; another adds per-item verification. A `CAPABILITY_OBLIGATIONS` constant that mis-classifies an item's probe membership passes `npm test` despite the **Ships when** claiming the partition is asserted.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10)
**History:** `docs/plan_topics/V18a-capability-inventory.md` was added in a single commit (`c6a664e`). That first and only revision already carries both the `CAPABILITY_OBLIGATIONS.length === 7` cardinality assertion and the **Ships when** "factory-probable/non-probable partition" clause. The overclaim has been present since the leaf's inception.

## Solution Space

**Shape:** single

### Recommendation

In `V18a`, add a mechanical assertion that each `CAPABILITY_OBLIGATIONS` entry's factory-probed classification matches the Step-0 probe set owned by `V9a`, so a mis-classified constant is caught at build time and the **Ships when** partition claim becomes mechanically true rather than vacuously satisfied by the `.length === 7` cardinality check alone. Derive the expected factory-probed set from `V9a`'s Step-0 SDK named-member check rather than a literal re-listed in `V18a`, so the two cannot drift. This requires carrying partition metadata on the constant and introduces a `V18a`↔`V9a` reference. Keep the existing `CAPABILITY_OBLIGATIONS.length === 7` cardinality assertion and apply the partition assertion in both `V18a` and `V18a-T` (the PIC-15 Tests bullet is identical in both leaves).

Edge case: if carrying partition metadata would require restructuring beyond the leaf's scope, instead narrow `V18a`'s **Ships when** to the cardinality assertion alone so the stated gate matches its single named mechanism, leaving the partition prose in PIC-15 as descriptive context only.

## Relationships

None

---

# T28 — V12a Ships-when gate omits the SLSH-2 failure-path assertions

**Original heading:** SLSH-2 failure-path interleaving omitted from the Ships-when gate
**Original section:** docs/plan_topics/V12a-slash-dispatch.md / V12a-T
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V12a` enumerates four Tests bullets: the `SLSH-1` overflow/trim rule, the `SLSH-2` happy-path streaming-ordering assertion, and two `SLSH-2` failure-path assertions — one for an `Err` propagated by `?` after partial assistant text (streamed prefix retained, failure `loom-system-note` appended *after* the prefix, not interleaved), and one for mid-stream cancellation (partial prefix retained, cancellation note appended after the prefix, not interleaved).

The leaf's **Ships when** reads: "`npm test` dispatches a slash command, streams output, and asserts the overflow note." This names only the happy-path streaming behaviour and the `SLSH-1` overflow note. The two failure-path prefix-retention / append-ordering assertions are not referenced by the gate. A reviewer reading **Ships when** alone would treat the leaf as shippable with those two assertions missing or broken.

The companion `V12a-T` gate does cover all four bullets, so the tests-task side is sound; the defect is confined to the implementation leaf's narrower closing condition.

## Plan Documents

- `docs/plan_topics/V12a-slash-dispatch.md` — **Ships when** field (edited)
- `docs/plan_topics/V12a-T-slash-dispatch.md` — Tests / Ships when (read-only; already covers all four bullets)

## Spec Documents

None — the fix is internal to the plan leaf's gate wording; the spec's `slash-invocation.md` SLSH-2 behaviour is unchanged.

## Affected Leaves

**Phases:** Vertical slice V12 — Slash invocation

**Leaves (implementation order):**

- `V12a` — Slash dispatch, overflow, and streaming — (modified)

## Consequence

**Severity:** correctness

The closing gate passes vacuously for the two SLSH-2 failure-path cases: an implementation that streams happy-path tokens and emits the overflow note satisfies **Ships when** even if the err-after-partial-text and mid-stream-cancellation prefix-retention / append-ordering behaviours are unimplemented or interleave incorrectly. Two reviewers reading the gate vs. the Tests list would disagree on whether those assertions block ship, and a regression in either failure-path ordering would not redden the stated gate.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (2026-06-10, "pi-loom plan: build/update plan for spec.md + review")
**History:** `docs/plan_topics/V12a-slash-dispatch.md` was added in c6a664e. `git show c6a664e:` confirms the **Ships when** line read "`npm test` dispatches a slash command, streams output, and asserts the overflow note." at file creation, while `git log -S` shows both failure-path SLSH-2 Tests bullets were introduced in the same commit. Later edits (eeb0014, 85fc906) did not touch the **Ships when** wording.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V12a-slash-dispatch.md`, extend the **Ships when** field so the gate names the two failure-path SLSH-2 assertions in addition to the happy-path streaming and overflow checks it already cites. The gate must require that `npm test` assert, for the `Err`-after-partial-text case and the mid-stream-cancellation case, that the streamed prefix is retained and the failure / cancellation `loom-system-note` is appended after the prefix (not interleaved). Keep the existing happy-path streaming and `SLSH-1` overflow-note clauses; this is an addition to the gate, not a replacement.

Edge case: the wording should make both failure paths (`?`-propagated `Err` and mid-stream cancellation) individually observable in the gate, since they exercise distinct append-ordering code paths.

## Relationships

None

---

# T29 — V18c-T runtime-evidence test exercises integrated features its Deps do not satisfy

**Original heading:** `V18c-T` omits the integrated-feature leaves its runtime-evidence test exercises
**Original section:** docs/plan_topics/V18c-version-bump-checklist.md / V18c-T
**Kind:** ordering
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18c-T`'s runtime-evidence acceptance-gate Tests bullet asserts that the `H4a` end-to-end harness "is driven against the bumped pin," and its **Ships when** commits the test to "fail red for the intended reason, including the runtime-evidence acceptance-gate test." That bullet is the failing-test partner of `V18c`'s impl bullet, which drives a "representative integrated `.loom` (typed query + tool loop + invoke + schema validation + binder + cancellation)" against the bumped pin. The features in that `.loom` are owned by `V5d`, `V11f`, `V13c`, `V14a`, `V17a`, and `V15a`.

`V18c` (impl) declares all five feature leaves plus `H4a` in its `Deps`. `V18c-T` declares only `V18a, V18b, H4a`. Because a tests-task is picked up as soon as its `Deps` are satisfied, `V18c-T` becomes buildable once `V18a`, `V18b`, and `H4a` land — well before the integrated-feature leaves exist. If the `-T` runtime-evidence test drives the integrated `.loom` the impl partner describes, that `.loom` cannot parse or run, so the test fails on a setup/missing-feature error rather than on the asserted gate behaviour — violating the tests-task's "fail red for the intended reason" exit gate.

Two readings diverge: one reads the `-T` bullet as driving the same integrated `.loom` as the impl (and is blocked / fails red for the wrong reason), the other reads it as a feature-free composition check against an `H4a` harness double.

## Plan Documents

- `docs/plan_topics/V18c-T-version-bump-checklist.md` — Deps + runtime-evidence Tests bullet / Ships when (edited)
- `docs/plan_topics/V18c-version-bump-checklist.md` — Deps + runtime-evidence Tests bullet (read-only reference)
- `docs/plan_topics/conventions.md` — TDD ritual: "fail red for the intended reason" (read-only)
- `docs/plan_topics/V5d-subset-lowering.md` / `V11f-binder-retry-taxonomy.md` / `V13c-query-tool-loop.md` / `V14a-tool-calls.md` / `V17a-cancellation-core.md` / `V15a-invocation-core.md` — integrated features (option-dependent)

## Spec Documents

None — the fix is internal to plan-file dependency wiring and test framing.

## Affected Leaves

**Phases:** Vertical slices (V5, V11, V13, V14, V15, V17, V18); Horizontal (`H4a`, already a declared dep)

**Leaves (implementation order):**

- `V5d`, `V11f`, `V13c`, `V14a`, `V15a`, `V17a` — (blocked, under Option A only)
- `V18c-T` — Pi version-bump procedure and gates (tests) — (both)

## Consequence

**Severity:** correctness

If shipped unfixed, `V18c-T` can be picked up after `V18a`/`V18b`/`H4a` yet before the integrated-feature leaves exist; an implementer who reads the runtime-evidence test as driving the integrated `.loom` produces a test that fails on missing features (a wrong-reason red), which the tests-task exit gate is meant to forbid. The two readings yield materially different `-T` test code and diverging pickup ordering.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** `81ab342` (2026-06-10) "resolve version-bump runtime-evidence acceptance gate and revert path"; `c42f13d` (2026-06-10) "resolve V18c version-bump gate under-declares feature deps"
**History:** At plan creation (`c6a664e`) `V18c-T` carried `Deps. V18a, V18b` and had no runtime-evidence bullet. `81ab342` added the runtime-evidence acceptance gate to both leaves and added `H4a` (only) to both `Deps`. `c42f13d` then resolved the impl's under-declaration by adding `V5d, V11f, V13c, V14a, V17a` to `V18c`'s `Deps`, but did not propagate the fix to the `V18c-T` partner. The asymmetry was finalized by that asymmetric second fix.

## Solution Space

**Shape:** single

### Recommendation

Restate `V18c-T`'s runtime-evidence Tests bullet as a feature-free gate-composition check: scope the `-T` runtime-evidence test to assert only that the gate is composed correctly — the `H4a` harness must be driven against the bumped pin and a green surface-inventory run alone does not satisfy acceptance — using a feature-free `H4a` harness double rather than an integrated `.loom`. Leave `V18c-T`'s `Deps` at `V18a, V18b, H4a`, which keeps the tests-task early and decoupled so it fails red precisely because the gate is unwired. The integrated `.loom` belongs to the impl-time acceptance run on `V18c`, which retains it.

Edge cases: (1) the reworded `-T` assertion must still fail red on the gate's absence, not pass vacuously; (2) confirm whether the impl's integrated `.loom` truly exercises `invoke` — if so, `V15a` is a missing dep on `V18c` (impl) and should be added there.

## Relationships

- T22 "V3d-T over-asserts final-value propagation against invoke/subagent caller surfaces built in later slices" — same-cluster (same ordering pattern: a `-T` leaf's failing test references features not yet built; resolves independently)
- T36 "Session double's model / tool / binder-response scripting surface is undefined" — decision-dependency (Option B's feature-free harness double depends on the `H4a` harness scripting surface being defined — this one must follow it)

---

# T30 — M's happy-path discovery read has no defined source under the ambient-access ban

**Original heading:** `M` single-source discovery declares no FileSystem-seam dependency
**Original section:** docs/plan_topics/M-minimal-slash-command.md / M-T-minimal-slash-command.md
**Kind:** ordering
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`M`'s `Adds.` introduces "a fixed single-source discovery" that reads a fixture `.loom` file, but the leaf never states *how* that read is performed. The project-wide *No globals, statics, singletons* rule (and the PIC-13 ambient-access ban it operationalises) forbids any `src/**` module from reading the filesystem directly: a real file read must route through the `FileSystem` seam, whose behaviour is owned by `V8b`. `M` declares `Deps. M-T, H4a` only — neither `V8b` nor any FileSystem seam is a dependency, and `V8b` is sequenced far later, so the seam does not yet exist when `M` is implemented.

The alternative source — supplying the fixture in memory through the `H4a` end-to-end harness — is also unstated: `H4a`'s session-double fidelity contract enumerates only four axes and names no FileSystem double or in-memory fixture supply. Consequently the origin of the `.loom` source `M`'s discovery reads is undefined in both candidate locations.

Two reasonable implementers therefore diverge: one supplies the fixture to the in-process harness in memory; another wires a direct filesystem read into `src/**` (which the `H3a` identifier-keyed ambient-access scan would flag, and for which no seam exists to route through at `M` time). The MVP — whose purpose is to prove the end-to-end pipeline — would be built inconsistently.

## Plan Documents

- `docs/plan_topics/M-minimal-slash-command.md` — `Adds.` / `Deps.` (edited)
- `docs/plan_topics/M-T-minimal-slash-command.md` — `Adds.` / `Tests.` (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — session-double / harness contract (option-dependent)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — `FileSystem` seam owner (read-only)
- `docs/plan_topics/V10a-discovery-walk.md` — full discovery walk that deepens `M`'s happy path (read-only)
- `docs/plan_topics/H3a-di-seam-skeleton.md` — identifier-keyed ambient-access scan (read-only)
- `docs/plan_topics/conventions.md` — *No globals, statics, singletons* / ambient-access rule (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal phases, MVP phase

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)
- `M-T` — Minimal end-to-end `.loom` slash command (tests) — (modified)
- `M` — Minimal end-to-end `.loom` slash command — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on how `M`'s single-source discovery obtains its fixture: an in-memory harness supply versus a direct `src/**` filesystem read that violates the ambient-access ban and has no `FileSystem` seam to route through (`V8b` is built much later). The MVP pipeline proof — the whole point of the `M` leaf — is built inconsistently, and the divergent variant may redden the `H3a` ambient-access scan.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** Both `M-minimal-slash-command.md` and `M-T-minimal-slash-command.md` were created in the plan's initial build commit `c6a664e` and have no later edits; the `Adds.` "fixed single-source discovery" phrasing and the `Deps. M-T, H4a` line carrying the gap have been present unchanged since that first commit. `H4a`'s four-axis fidelity contract was authored in the same `c6a664e` commit and refined by later edits that did not add an in-memory fixture-supply mechanism.

## Solution Space

**Shape:** single

### Recommendation

Supply the fixture `.loom` in memory to the in-process `H4a` harness, so `M`'s single-source discovery reads from the harness-provided source rather than the real filesystem. This requires no `FileSystem` seam dependency and no `V8b` dependency, keeps `M`'s `Deps.` intact, introduces no throwaway adapter, and sidesteps the ambient-access ban.

Add a clause to `M`'s `Adds.` stating the fixture `.loom` is supplied in-memory by the `H4a` harness. Add a matching in-memory fixture-supply statement to `H4a`'s harness description so the mechanism is defined where the harness is owned. Mirror the wording in `M-T`'s `Adds.`.

Ensure the harness-supplied source is the only source `M`'s discovery reads — no ambient filesystem fallback — so the `H3a` ambient-access scan stays clean. Note that `M`'s harness-supplied discovery path diverges from the production `V10a` filesystem-backed discovery.

## Relationships

- T36 "Session double's model / tool / binder-response scripting surface is undefined" — same-cluster (both extend `H4a`'s harness / session-double contract; the in-memory fixture supply lands in the same H4a contract — this one must follow it)

