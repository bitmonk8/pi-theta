---
id: PTQ-1088
title: e2e-s5-package-discovery-composition-root.test.ts reimplements disposeWorkspace despite importing a sibling export from the same helper module
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/e2e-s5-package-discovery-composition-root.test.ts:81-85
  - tests/helpers/production-load-harness.ts:185-189
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# e2e-s5-package-discovery-composition-root.test.ts reimplements disposeWorkspace despite importing a sibling export from the same helper module

## Observation
`tests/helpers/production-load-harness.ts` exports `disposeWorkspace(workspaceDir)`, whose body recursively removes the workspace directory when it is defined, documented as the paired teardown for `plantThetaWorkspace`. `tests/e2e-s5-package-discovery-composition-root.test.ts` already imports `runProductionLoad` from that exact module (used in its own `beforeAll`), but its `afterAll` teardown retypes the identical "if defined, `rmSync` recursively/force" body inline instead of importing and calling `disposeWorkspace(workspaceDir)`.

## Evidence

`tests/e2e-s5-package-discovery-composition-root.test.ts:81-85` (re-read immediately before filing):
```ts
afterAll(() => {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});
```

`tests/helpers/production-load-harness.ts:185-189` — the canonical export the same module already lends the file its sibling `runProductionLoad`, byte-identical body:
```ts
export function disposeWorkspace(workspaceDir: string | undefined): void {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
```

`tests/e2e-s5-package-discovery-composition-root.test.ts:27` — the file's own import line reaching into the exact module `disposeWorkspace` lives in:
```ts
import { runProductionLoad, type LoadOutcome } from "./helpers/production-load-harness";
```

Exact search: `grep -n "^export function disposeWorkspace" tests/helpers/*.ts` → 1 hit (`production-load-harness.ts:185`); `grep -n "disposeWorkspace" tests/e2e-s5-package-discovery-composition-root.test.ts` → 0 hits, confirming the file never references the exported name even though its own teardown reproduces the export's body verbatim and its import statement already reaches the module that defines it.

## Why this is a problem
The `if (workspaceDir !== undefined) { rmSync(workspaceDir, { recursive: true, force: true }); }` sequence in this file's `afterAll` is not a fresh requirement — it is the exact body `disposeWorkspace` already centralises, in the same helper module whose `runProductionLoad` this file already imports one line above the `plant` declaration. A change to the teardown's semantics (e.g. logging on removal failure, or switching to a different removal primitive) applied to the canonical helper would not reach this file's inline copy.

## Suggested direction (non-binding, optional)
Adding `disposeWorkspace` to the existing `import { runProductionLoad, type LoadOutcome } from "./helpers/production-load-harness"` line and calling `disposeWorkspace(workspaceDir)` in the `afterAll` would drop the inline body without changing the file's `rmSync`/`mkdirSync`/`writeFileSync` import, which the local `plant(path, text)` function still needs for its own more general per-path planting that `plantThetaWorkspace`'s fixed `.pi/theta/<stem>.<ext>` shape does not cover (this file also plants under `node_modules/*` and a project `.pi/theta/` root, which the canonical `plantThetaWorkspace` does not — no claim is made that the plant half should change).

## False-positive check
- Gate-pin check: `tests/e2e-s5-package-discovery-composition-root.test.ts` does not match `*gate*.test.ts` or a named gate kin; not applicable.
- Recording-double check: `rmSync`/`disposeWorkspace` performs real filesystem teardown, not a fake/double backing a MUST-NOT witness; the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "disposeWorkspace" docs/bugs/` → 0 hits; no documented correct-reason red names this teardown or sanctions a local copy.
- coverage-matrix/bug-doc citation search: `grep -n "e2e-s5-package-discovery-composition-root" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()`; the three REQ-DISC cells are unaffected by which teardown implementation runs after them.
- Coverage check: the claim is about a repeated teardown-body DEFINITION, not a missing test path; the file's own `afterAll` already runs the local copy today.
- Prior-filing search: `grep -rl "e2e-s5-package-discovery-composition-root" quality/issues quality/resolved quality/intake` returns resolved `PTQ-0593` (the file's own local `runProductionLoad` redeclaration, already fixed — the current file's `import { runProductionLoad, ... }` line confirms that fix landed) and resolved `PTQ-1036` (an unrelated assertion-strength finding about REQ-DISC-6); neither mentions `disposeWorkspace`, `rmSync`, or the `afterAll` teardown (checked both files directly), so this is a distinct, unfiled root cause in the same file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/e2e-s5-package-discovery-composition-root.test.ts:81-85 and tests/helpers/production-load-harness.ts:185-189 (bodies byte-identical), the file's :27 import already reaches production-load-harness for `runProductionLoad`, `grep disposeWorkspace` in the file → 0 and `^export function disposeWorkspace tests/helpers/*.ts` → exactly 1 (PTQ-0890's fix collapsed the second); git blame dates the `afterAll` to d23c22be (2026-07-13), before `disposeWorkspace` landed (4c0cd0dc, 2026-09-14), and the PTQ-0593 fix commit cec9ee56 migrated `runProductionLoad` without touching the teardown — a post-hoc residual, not a design choice; location under tests/, D7 boilerplate-duplication class; no carve-out binds (not a gate file, real fs teardown not a recording double, docs/bugs `disposeWorkspace` → 0, coverage-matrix cite → 0, no it()/describe() merge/rename/delete proposed); NOT a duplicate — quality/{issues,resolved,intake} greps for this file hit only resolved PTQ-0593 (runProductionLoad redeclaration) and PTQ-1036 (REQ-DISC-6 assertion strength), neither naming the teardown, and PTQ-0890/0904/0915/0312 cite other files or the helper pair; same-wave sibling d7-01 is the acceptance mkdtemp/spawn pattern, unrelated. Fixer note: six other production-load-harness importers (b0331-root-winner-preempt, division-result-type-number-invoke, invoke-arg-array-literal-provable, invoke-arg-type-mismatch-wired, load-phase-pre-eval-routing, load-warning-delivery) still inline `rmSync` without `disposeWorkspace`, but the candidate cites only this site (sites: 1 is accurate) and several of those are carried by open production-load-harness rows (triage: claude-fable-5-1)
