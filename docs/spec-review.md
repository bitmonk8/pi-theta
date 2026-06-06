# Triaged Spec Review - spec.md

_Generated: 2026-06-05T11:52:38Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T83) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 blocker, 15 high, 51 medium retained; ~139 low discarded; ~0 low merged into medium; ~122 nit dropped; 0 false dropped. Source: 344 deduplicated findings across 9 shards + global lenses; 65 retained after triage. Foundational governance/traceability findings (T75–T83) and the standalone blocker (T74) sit at the bottom for first addressing._

---

# T01 - README advertises an authored implementation plan that does not exist

**Kind:** doc-alignment
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The README `## Status` section calls the implementation plan "complete" and directs progress-tracking against `docs/plan.md`, which contains no authored leaves in any phase ("No leaves yet" under each of Horizontal phases, MVP phase, and Vertical slices). The companion `docs/plan_topics/coverage-matrix.md` is likewise empty. A reader is told to track progress against authored content that does not exist.

## Solution approach

Rewrite the README `## Status` wording so it distinguishes plan infrastructure being in place from leaves being authored incrementally, and does not imply authored plan content already exists.

## Solution constraints

- None.

## Relationships

- T02 "commitAddPaths omits root files the plan conventions mandate updating" — same-cluster (both are README/project-config alignment defects).
# T02 - commitAddPaths omits root files the plan conventions mandate updating

**Kind:** doc-alignment
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`conventions.md` mandates updating root-level `README.md`/`CHANGELOG.md`/`notes.md` per leaf, but `.pi/project-config.md` `commitAddPaths` covers only `docs/`, so those files are not auto-staged.

## Solution approach

Reconcile the two: either extend `commitAddPaths` in `.pi/project-config.md` to cover the root files, or amend `conventions.md` to state they are staged manually.

## Solution constraints

- None.

## Relationships

- T01 "README advertises an authored implementation plan that does not exist" — same-cluster.

