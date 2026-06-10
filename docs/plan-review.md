# Triaged Plan Review — plan

_Generated: 2026-06-10T20:55:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T37) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 6 medium retained; 34 low discarded; 4 low/duplicate findings merged into 4 cluster findings; 16 NIT dropped; 0 false dropped._

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
