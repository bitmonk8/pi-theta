# Triaged Plan Review — plan

_Generated: 2026-06-11T18:05:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T56) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 1 medium retained (1 finding)._

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
