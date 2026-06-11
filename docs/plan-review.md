# Triaged Plan Review — plan

_Generated: 2026-06-11T18:05:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T56) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 2 medium retained (2 findings)._

---
# T06 — H6a Deps-note parenthetical restates the coverage-producing set as `(H5a, M, V1a–V18d)`, omitting the coverage-producing leaf H1a

**Original heading:** H6a parenthetical restates a stale coverage-producing set excluding H1a
**Original section:** docs/plan_topics/conventions.md (H5b / H6a — Canary and live-corpus activation)
**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H6a`'s **Deps.** note states that `H5b` "owns the complete coverage-producing dependency set (`H5a`, `M`, `V1a`–`V18d`)". That parenthetical enumeration omits `H1a`. Per [`coverage-matrix.md`](../../docs/plan_topics/coverage-matrix.md) §Code-keyed obligation areas, `H1a` is the named closing leaf for the un-anchored MUST-NOT obligation in `pi-integration-contract/host-prerequisites.md` §`pi-sdk-pin` (the `typebox "*"` "MUST NOT be collapsed into the four-entry tilde-pinned `peerDependencies` group" rule), so `H1a` is a coverage-producing leaf. `conventions.md` §REQ-ID discipline (*Transitive-completeness plan-maintenance*) defines the coverage-producing set as every leaf that can introduce an executable REQ-ID, a citing test closing a mapped numbered REQ-ID, or an un-anchored normative MUST — with no carve-out exempting horizontal leaves.

The note frames the set as "every MVP and vertical implementation leaf (`V1a`–`V18d`)" plus `H5a` and `M`, a framing that structurally excludes horizontal leaves and therefore drops `H1a`. The parenthetical claims to be the *complete* set, which makes the omission a false completeness assertion rather than an abbreviation.

This is a distinct surface from the same omission in `H5b`'s own Deps note: `H6a` carries its own restatement of the set even though its prose says it "inherits that completeness transitively through `H5b` rather than restating the set". Correcting `H5b`'s Deps does not touch this parenthetical — it remains stale independently and must be corrected here as well.

## Plan Documents

- `docs/plan_topics/H6a-live-corpus-activation.md` — Deps note parenthetical (edited)
- `docs/plan_topics/H5b-warn-only-canary.md` — Deps / Deps note (read-only)
- `docs/plan_topics/coverage-matrix.md` — §Code-keyed obligation areas, `host-prerequisites.md` §`pi-sdk-pin` row naming `H1a` (read-only)
- `docs/plan_topics/conventions.md` — §REQ-ID discipline, Transitive-completeness plan-maintenance (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal (Release-gate sub-grouping)

**Leaves (implementation order):**

- H6a — Live-corpus closing-gate activation (loom 1.0 release gate) — (modified)

## Consequence

**Severity:** correctness

The note asserts a *complete* coverage-producing set that silently excludes a coverage-producing leaf (`H1a`), so a maintainer auditing the transitive-completeness obligation against this restatement would conclude the set is complete when it is not. The stale parenthetical does not by itself misroute `H6a`'s operative Deps (`H5b, H7a`), but it propagates the same incorrect set as `H5b` and erodes the in-corpus record that the warn-only and hard-fail footings cover an identical leaf set.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 5353dd7 — pi-loom plan: resolve "Release-gate activation has no owning leaf" (2026-06-10, Thomas Andersen); 83c25b9 — pi-loom plan: resolve "typebox MUST NOT be collapsed obligation in H1a" (2026-06-10, Thomas Andersen)
**History:** 5353dd7 created `H6a` with a Deps-note set listing of `(H5a, M, V1a–V18c)` framed as "every MVP and vertical implementation leaf" — correct at that moment, since no horizontal leaf was yet coverage-producing. About two hours later 83c25b9 added the `typebox "*"` un-anchored MUST-NOT row to `coverage-matrix.md` naming `H1a` as its closing leaf, making `H1a` coverage-producing without propagating it into `H6a`'s (or `H5b`'s) set restatement. The later range refresh to `V1a–V18d` (8af3204) carried the omission forward. The defect is the interaction: a coverage-producing horizontal leaf was introduced while the completeness restatements only ever enumerated MVP + vertical leaves.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H6a-live-corpus-activation.md`, the Deps note (the italic parenthetical following **Deps.**) currently reads ``H5b` owns the complete coverage-producing dependency set (`H5a`, `M`, `V1a`–`V18d`)``. Add `H1a` to that listing so it reads ``(`H1a`, `H5a`, `M`, `V1a`–`V18d`)``, matching the corrected `H5b` set. Do not alter `H6a`'s operative **Deps.** line (`H5b, H7a`) — only the prose restatement of the set is wrong; `H6a` continues to inherit completeness transitively through `H5b`.

The fix is internal to the plan corpus: the spec (`host-prerequisites.md` and the rest of `spec_topics/**`) is read-only for this change, and `coverage-matrix.md` / `conventions.md` are read-only context — no edit to them is required here. Keep the listed IDs in the existing `H<n><letter>` / `V<n><letter>` scheme; introduce no new IDs.

## Relationships

- T08 "H1a missing from H5b's Deps, and the completeness claim that scopes the coverage-producing set to MVP/vertical leaves only" — must-follow (that finding establishes `H1a` as coverage-producing and corrects `H5b`'s Deps + Deps note; this fix applies the same `H1a` inclusion to `H6a`'s separate parenthetical restatement and must agree with it)

---
# T07 — H5b's coverage-producing `Deps` completeness has no mechanical backstop

**Original heading:** §REQ-ID discipline / Release gate — completeness of H5b Deps gated only by manual maintenance
**Original section:** docs/plan_topics/conventions.md
**Kind:** risk
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

The loom 1.0 release-gate design routes the entire "is coverage complete?" sequencing guarantee through one leaf's dependency list. [`H5b`](docs/plan_topics/H5b-warn-only-canary.md)'s `Deps.` is declared to be "the complete coverage-producing set", and [`H6a`](docs/plan_topics/H6a-live-corpus-activation.md) inherits that set transitively by depending on `H5b` rather than restating it, so the warn-only canary and the hard-fail flip are both sequenced after every leaf that can introduce an executable REQ-ID, a closing citing-test, or an un-anchored normative MUST. Keeping that set complete is stated as a standing manual obligation — the *Transitive-completeness plan-maintenance* rule in [`conventions.md`](docs/plan_topics/conventions.md) *REQ-ID discipline*: whenever a coverage-producing leaf is added, the author "MUST" add it to `H5b`'s `Deps.`.

Nothing mechanically verifies that obligation was honoured. The [`H5a`](docs/plan_topics/H5a-closing-gate-automation.md) closing gate reconciles spec REQ-IDs, the coverage matrix, the diagnostics registry, citing tests, un-anchored MUSTs, the broad-catch allow-list, retired/live clashes, and per-prefix numbering holes — but it has no arm that compares the set of closing leaves named in [`coverage-matrix.md`](docs/plan_topics/coverage-matrix.md) against the transitive membership of `H5b`'s `Deps.`. An author who adds a coverage-producing leaf and forgets the `H5b` `Deps.` edit triggers no failure.

This is not hypothetical. `coverage-matrix.md`'s *Code-keyed obligation areas* table names `H1a` as the closing leaf for the `host-prerequisites.md` §`pi-sdk-pin` `typebox "*"` MUST-NOT, yet `H5b`'s `Deps.` enumerates only `H5a, M, V1a–V18d` — the horizontal closing leaf `H1a` is absent. The manual obligation has already drifted, and the gate is silent about it.

## Plan Documents

- `docs/plan_topics/H5a-closing-gate-automation.md` — Adds / Tests (edited)
- `docs/plan_topics/H5b-warn-only-canary.md` — Deps (read-only)
- `docs/plan_topics/coverage-matrix.md` — Numbered REQ-IDs + Code-keyed obligation-areas closing-leaf columns (read-only)
- `docs/plan_topics/conventions.md` — REQ-ID discipline, *Transitive-completeness plan-maintenance* (option-dependent)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified)
- `H5b` — Warn-only live-corpus canary — (modified)

## Consequence

**Severity:** advisory

A coverage-producing leaf omitted from `H5b`'s `Deps.` lets `H6a` be sequenced and activated before that leaf lands. For numbered REQ-IDs the live-corpus citing-test arm reddens `main` (visible but disruptive), but an un-anchored MUST whose closing leaf is omitted passes green — the gate only checks that the coverage matrix enumerates a closing leaf, not that the leaf has landed — so the release gate can certify "complete coverage" while a closing leaf is still outstanding. The `H1a` omission already present in the corpus shows the manual obligation drifts in practice.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** ea6b1da — pi-loom plan: resolve "Live-corpus gate activation has no documented rollback" (2026-06-11, Thomas Andersen); 37733fd — pi-loom plan: resolve "H6a transitive-completeness rule parked in Deps, not conventions" (2026-06-11, Thomas Andersen); ab8e297 — pi-loom plan: resolve "Transitive-completeness obligation invisible at leaf authoring" (2026-06-11, Thomas Andersen)
**History:** `H5b`'s first commit (ea6b1da) already defined its `Deps.` as the manually-maintained "complete coverage-producing set" with no mechanical completeness check, so the gap is present since the leaf's inception. Commit 37733fd then codified the manual obligation into `conventions.md` as the *Transitive-completeness plan-maintenance* rule (lifting it out of Deps-only prose), and ab8e297 made the obligation visible at leaf-authoring time; both restated the manual rule without ever adding a mechanical assertion to back it.

## Solution Space

**Shape:** single

### Recommendation

Add a new closing-gate arm to [`H5a`](docs/plan_topics/H5a-closing-gate-automation.md) (the leaf that owns the gate machinery) that reconciles the set of closing leaves named in [`coverage-matrix.md`](docs/plan_topics/coverage-matrix.md) against the transitive membership of [`H5b`](docs/plan_topics/H5b-warn-only-canary.md)'s `Deps.`, and fails CI when any coverage-matrix closing leaf is not transitively reachable from that `Deps.` set.

Concretely:
- In `H5a`'s `Adds.`, extend the reconciliation surface so the gate, for every closing-leaf cell in `coverage-matrix.md`'s *Numbered REQ-IDs* table and its *Code-keyed obligation areas* table, requires that leaf ID to be a member of `H5b`'s `Deps.` after expanding both sides' contiguous ranges (e.g. `V1a–V18d`) and `H5b`'s named singletons (`H5a`, `M`). A closing leaf absent from that expanded set is a CI failure.
- Add a corresponding `Convention:` Tests bullet on `H5a` exercising it against the seeded fixtures on the same seeded-fixture-then-live footing as the existing arms: a seeded coverage-matrix row naming a closing leaf absent from a seeded `H5b`-`Deps.` fixture reddens, and a fixture where every closing leaf is present passes.
- Run this arm as a standing plan-structural check (like the per-prefix numbering-hole arm) — it reads only plan files, which are always present — rather than deferring it to the `H6a` live-corpus flip, so the omission is caught before activation.
- In `conventions.md` *Transitive-completeness plan-maintenance*, note that the obligation is now mechanically backed by this `H5a` gate arm so the rule and the gate stay in lockstep.

Edge cases the implementer must handle: contiguous-range expansion on both the coverage-matrix and `H5b`-`Deps.` sides; the `<new>` placeholder rows in the code-keyed table (no real leaf yet — exclude them); and the *IMPL* row's pure back-references ("ambient-access ban → `H3a`", "runtime dependency declarations → `H1a`"), which are not closing-leaf cells and must not be read as coverage obligations.

## Relationships

- T08 "H1a missing from H5b's Deps, and the completeness claim that scopes the coverage-producing set to MVP/vertical leaves only" — must-follow (concrete instance this gate arm would catch; that fix must land for this check to pass green, so address it first)
- T03 "\"CI failure\" enforcement vocabulary presumes a CI execution surface no leaf provisions" — decision-overlap (this arm's "fail CI on omission" remedy presupposes the CI surface that finding flags as unprovisioned)

---
