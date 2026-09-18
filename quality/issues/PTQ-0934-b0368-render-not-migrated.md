---
id: PTQ-0934
title: b0368 redeclares render() byte-identically to the export of the same runtime-belt-probe-harness module it already imports three other names from
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0368-plus-ordering-laundered-belt.test.ts:155-157
  - tests/helpers/runtime-belt-probe-harness.ts:100-102
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0368 redeclares render() byte-identically to the export of the same runtime-belt-probe-harness module it already imports three other names from

## Observation
`tests/b0368-plus-ordering-laundered-belt.test.ts:102` imports `assertInternalError`, `assertValue`, and `makeBeltProbes` from `./helpers/runtime-belt-probe-harness`, which also exports a `render(value)` helper. The file does not import `render` from that module; instead it declares its own module-scope `render` function at line 155, byte-identical to the module's export.

## Evidence

`tests/helpers/runtime-belt-probe-harness.ts:100-102` (the canonical export, re-read immediately before filing):
```ts
export function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
```

`tests/b0368-plus-ordering-laundered-belt.test.ts:155-157` (re-read immediately before filing):
```ts
function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
```

`diff` of the two three-line bodies → zero output: byte-identical. `tests/b0368-plus-ordering-laundered-belt.test.ts:102` (re-read immediately before filing):
```ts
import { assertInternalError, assertValue, makeBeltProbes } from "./helpers/runtime-belt-probe-harness";
```
`render` is conspicuously absent from that import list despite the module already exporting it and the file already drawing three other names from the same module.

## Why this is a problem
The file already has a live import binding to `./helpers/runtime-belt-probe-harness` and already draws three of that module's five exports from it. The fifth export, `render`, is instead re-typed locally with an identical body, rather than added to the same import statement already in the file. This is the narrower case of the shape resolved PTQ-0397 addressed (seven functions shared between b0368 and b0369 before the harness module existed): here the shared harness module already exists and is already partially imported into this exact file, yet one more of its exports is duplicated rather than imported.

## Suggested direction (non-binding, optional)
The local `render` declaration is a candidate to be dropped in favour of adding `render` to the existing `import { assertInternalError, assertValue, makeBeltProbes } from "./helpers/runtime-belt-probe-harness"` line already present in the file.

## False-positive check
- Gate-pin check: tests/b0368-plus-ordering-laundered-belt.test.ts does not match `*gate*.test.ts` or the named kin; `render()` is a value-formatting helper, not a pinned count or inventory assertion.
- Recording-double check: `render` is a pure formatting function over a value already produced by the system under test, not a recording double asserted against for a MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0368-plus-and-ordering-laundered-operands-silent-js-coercion.md is `Status: fixed (0.348.0)`; `npx vitest run tests/b0368-plus-ordering-laundered-belt.test.ts` passes in full at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0368-plus-ordering-laundered-belt" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that one more already-exported helper could be imported instead of re-typed — so no citation is affected.
- Duplicate-of-resolved check: quality/resolved/PTQ-0397's own `locations` list seven named functions (`rootDouble`, `producer`, `probeSource`, `assertValue`, `InstantSettleSession`, `driveInterp`, `driveInvoke`) and explicitly excludes `render` and `assertFramesToInternalError`/`assertLoudThrow` from its Evidence "to keep the two findings' root causes non-overlapping"; that fix subsequently created `tests/helpers/runtime-belt-probe-harness.ts` and migrated b0368 to import `assertInternalError`/`assertValue`/`makeBeltProbes` from it, but left this file's own `render` declaration untouched — a residue neither PTQ-0397 nor any other located finding names.
- Coverage-drift check: the claim is about a repeated already-passing formatting helper's definition, not a missing test path; the file's own tests are unaffected by the claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/b0368-plus-ordering-laundered-belt.test.ts:155-157 and tests/helpers/runtime-belt-probe-harness.ts:100-102, mktemp `diff` of the bodies (export keyword stripped) is empty, the local copy is live (4 call sites :186/:252/:278/:294) and shadows an export the file's own :102 import statement already draws three names from, 12 other tests/ files import `render` from that harness, coverage-matrix grep → 0, docs/bugs/0368 is fixed (0.348.0) and the file is 19/19 green, no gate/recording-double/red-test carve-out applies; not a duplicate — `render` was not among PTQ-0397's seven migrated pieces and only became a harness export later (cc0a8fe7), and no open issue or same-wave sibling (d7-01 assertFramesToInternalError, d7-02 parseDeps) names it; two notes for the fixer: the FP-check overstates PTQ-0397's exclusion wording (its "non-overlapping" sentence names assertLoudThrow/assertFramesToInternalError, not render — render is simply absent), and tests/b0369-control-flow-kind-belts.test.ts:171 carries the byte-identical local `render` (3 call sites) while likewise importing from the same harness at :128 — an uncounted sibling site to fold into the same mechanical fix (triage: claude-fable-5-1)
