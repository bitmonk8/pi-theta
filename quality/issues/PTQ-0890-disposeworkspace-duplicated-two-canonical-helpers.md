---
id: PTQ-0890
title: disposeWorkspace(dir) is exported byte-identically from both fixture-dispatch-harness.ts and production-load-harness.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/fixture-dispatch-harness.ts:142-146
  - tests/helpers/production-load-harness.ts:144-152
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# disposeWorkspace(dir) is exported byte-identically from both fixture-dispatch-harness.ts and production-load-harness.ts

## Observation
`tests/helpers/fixture-dispatch-harness.ts` and `tests/helpers/production-
load-harness.ts` each independently export a function named
`disposeWorkspace` with an identical single-parameter signature and
identical body: guard on the parameter being defined, then `rmSync(...,
{ recursive: true, force: true })`. Both are documented with the same
"tolerate an unset workspace from a `beforeAll` that never assigned it"
rationale, differing only in the parameter's local name (`dir` vs
`workspaceDir`).

## Evidence
`tests/helpers/fixture-dispatch-harness.ts:142-146`:
```ts
/** Remove a planted temp workspace, tolerating an unset `dir` (a `beforeAll` throw before planting). */
export function disposeWorkspace(dir: string | undefined): void {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

`tests/helpers/production-load-harness.ts:144-152`:
```ts
/**
 * Recursively remove a workspace `plantThetaWorkspace` created; a no-op when
 * `workspaceDir` is `undefined` (a `beforeAll` that never assigned it).
 */
export function disposeWorkspace(workspaceDir: string | undefined): void {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
```

The two bodies are identical modulo the parameter's local name (`dir` vs
`workspaceDir`); both call sites use the same `node:fs` `rmSync` import with
the same options object. `grep -n "^export function disposeWorkspace"
tests/helpers/*.ts` returns exactly these two declarations.

## Why this is a problem
Both modules are canonical `tests/helpers/` files (each documents itself as
the centralised home for a shared harness — PTQ-0225/PTQ-0403 for the
former, PTQ-0210/PTQ-0312 for the latter), and both independently mint the
same-named `disposeWorkspace` teardown utility rather than one importing it
from the other. A caller that already imports one of these two modules for
its workspace-planting half (`plantThetaWorkspace` from `production-load-
harness.ts`, or the dispatch scaffolding from `fixture-dispatch-harness.ts`)
gets a second, independent copy of the same teardown function rather than a
single shared one, and the two copies could silently diverge under a future
edit to either file alone.

## Suggested direction (non-binding, optional)
One module could import `disposeWorkspace` from the other rather than
re-declaring it, so a single copy backs both workspace-planting harnesses.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: not applicable — `disposeWorkspace` is a teardown
  utility with no recorded call state and backs no "never called" witness.
- docs/bugs/ signature search: `grep -rl "disposeWorkspace" docs/bugs/` → 0 hits; no documented correct-reason red cites either declaration.
- coverage-matrix/bug-doc citation search: `grep -n "fixture-dispatch-harness.ts\|production-load-harness.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block or of either helper file — only that one call the other's already-exported function — so no pinned citation is disturbed.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION; every caller of either copy already tears down its own
  workspace correctly, and no behaviour path is claimed untested.
- Overlap check: `grep -rl "disposeWorkspace" quality/intake quality/issues quality/resolved` lists several findings about test FILES that hand-roll or fail to import a `disposeWorkspace`-shaped teardown (e.g. PTQ-0517, PTQ-0600, PTQ-0606, PTQ-0703, PTQ-0717, PTQ-0722, PTQ-0723, PTQ-0739, resolved PTQ-0361/PTQ-0440/PTQ-0548), but none of them compares `fixture-dispatch-harness.ts`'s own `disposeWorkspace` against `production-load-harness.ts`'s own `disposeWorkspace` — both are helper files, not `*.test.ts` consumers, and neither prior finding's `locations:` cites both of these two paths together. This is the first filing to cite this specific pair for this root cause.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/helpers/fixture-dispatch-harness.ts:142-146 and tests/helpers/production-load-harness.ts:144-152 (function at :148), sed-extracted bodies diff to zero after a param-name-only substitution and both import `rmSync` from `node:fs`; `grep -rn "function disposeWorkspace" tests/` yields exactly these two declarations (b0462/b0463's `let disposeWorkspace` are unrelated locals); both copies are live (2 importers via fixture-dispatch-harness, 3 via production-load-harness, no file imports both); both locations under tests/, D7 boilerplate-duplication class; stated searches reproduce (docs/bugs `disposeWorkspace` → 0, coverage-matrix cites of either helper → 0), no gate/recording-double/red-test carve-out applies; dedupe hunt across quality/{intake,issues,resolved} finds no finding whose locations cite this helper pair — PTQ-0312/0225/0403 cite consumer test files and PTQ-0258 only lists helper filenames in an inventory — so this is a distinct, mechanically-fixable root cause (one helper imports the other's export) (triage: claude-fable-5-1)
