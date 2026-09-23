---
id: PTQ-1379
title: b0370's NOOP_ORDER_MUTATOR redeclares the SEAM_NOOP_MUTATOR tests/helpers/invoke-seam-scaffold.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0370-reassign-target-scope.test.ts:715-721
  - tests/helpers/invoke-seam-scaffold.ts:78-84
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0370's NOOP_ORDER_MUTATOR redeclares the SEAM_NOOP_MUTATOR tests/helpers/invoke-seam-scaffold.ts already exports

## Observation
tests/helpers/invoke-seam-scaffold.ts exports `SEAM_NOOP_MUTATOR`, a `CommittedConversationMutator` whose five methods (`truncate`, `rewrite`, `replace`, `remove`, `injectCompensatingTurn`) are all no-ops. tests/b0370-reassign-target-scope.test.ts declares a module-scope `NOOP_ORDER_MUTATOR` of the same type with the same five no-op methods, used as the `mutator` field of an `ExecuteBodyDeps` object in its Layer-3 order-witness unit cell, instead of importing the existing export.

## Evidence
tests/helpers/invoke-seam-scaffold.ts:78-84 (re-read immediately before filing):
```ts
/** A `CommittedConversationMutator` whose every method is a no-op. */
export const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};
```

tests/b0370-reassign-target-scope.test.ts:715-721 (re-read immediately before filing):
```ts
const NOOP_ORDER_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(): void {},
};
```
Both declare all five `CommittedConversationMutator` methods as no-ops; the only textual difference is that the exported copy types its `injectCompensatingTurn` parameter (`_surface: CommittedSurface`) while b0370's copy omits the parameter entirely (both are behaviourally identical no-ops under the same call signature). `grep -n "invoke-seam-scaffold\|SEAM_NOOP_MUTATOR" tests/b0370-reassign-target-scope.test.ts` → 0 hits — the file does not import from `tests/helpers/invoke-seam-scaffold.ts` at all.

## Why this is a problem
`SEAM_NOOP_MUTATOR` exists in `tests/helpers/invoke-seam-scaffold.ts` precisely to hold this five-method no-op value once for callers constructing an `ExecuteBodyDeps`/similar drive that has no compensating-turn behaviour to model. tests/b0370-reassign-target-scope.test.ts's Layer-3 order-witness cell needs exactly that value (a `CommittedConversationMutator` whose methods are never meant to be exercised — the cell's own comment calls `runEffect` "must not be reached", and no assertion in the cell inspects the mutator) but redeclares it locally instead of importing the existing export.

## Suggested direction (non-binding, optional)
The `NOOP_ORDER_MUTATOR` local constant is a candidate to import `SEAM_NOOP_MUTATOR` from `tests/helpers/invoke-seam-scaffold.ts` in its place.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named kin; the cited constant is harness plumbing (a no-op double), not a pinned count or inventory.
- Recording-double check: `NOOP_ORDER_MUTATOR`/`SEAM_NOOP_MUTATOR` are inert no-op stubs, never asserted against for a MUST-NOT-called witness (the cell's assertions are on `execution.outcome` and `env.resolve("x").value`, not on the mutator) — the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0370-reassign-target-scope-unchecked-cross-boundary-writes.md exists, is cited by the file's own header, and its Status line reads fixed (0.370.0); `npx vitest run tests/b0370-reassign-target-scope.test.ts` passes in full at HEAD — not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0370-reassign-target-scope" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that one locally-redeclared no-op double could be imported from the existing helper — so no citation is affected.
- Prior-finding overlap check: resolved PTQ-0534 (this same file) cites the `rootDouble`/`producer`/`render` trio as its locations and is disjoint from `CommittedConversationMutator`; resolved PTQ-0787 (also this file) cites the local `parseDeps()` duplication and is likewise disjoint. Neither prior finding's locations or evidence mention `NOOP_ORDER_MUTATOR`, `SEAM_NOOP_MUTATOR`, or `tests/helpers/invoke-seam-scaffold.ts`. `grep -rln "SEAM_NOOP_MUTATOR" tests/*.test.ts` confirms other files already import it directly, so the export is a live, reachable canonical helper, not a design proposal.
- Coverage-drift check: the claim is about a repeated already-passing no-op double, not a missing test path; the cell's full assertions are unaffected by the claim.

## Triage
verdict: confirmed — independently re-verified: `NOOP_ORDER_MUTATOR` at tests/b0370-reassign-target-scope.test.ts:715-721 and `SEAM_NOOP_MUTATOR` at tests/helpers/invoke-seam-scaffold.ts:79-85 reproduce verbatim (five identical no-op methods, only the unused `_surface` parameter name differs); the file imports `CommittedConversationMutator`/`executeBody` but `grep -n "invoke-seam-scaffold\|SEAM_NOOP_MUTATOR"` on it → 0 hits, while `grep -rln SEAM_NOOP_MUTATOR tests` → 9 live importing test files, so the export is a reachable canonical helper; the constant is inert plumbing (assertions are on `execution.outcome` and `env.resolve("x").value`), not a gate pin or recording double; bug 0370 Status fixed and coverage-matrix cites nothing in the file; prior PTQ-0534/0787 on this file cite disjoint locations and PTQ-0650/0705/0655/0844 are the same class fixed per-file in other tests, so not a duplicate — D7 copy-paste-double class, fix is a mechanical import swap (triage: claude-fable-5-1)
