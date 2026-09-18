---
id: PTQ-0486
title: parseErrorCodes is redeclared byte-identically in eight tests/live/acceptance bug-witness files with no tests/helpers/ home
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/b0314live-compound-assign.test.ts:123-129
  - tests/live/acceptance/b0315live-stdlib-arg-refusal.test.ts:122-128
  - tests/live/acceptance/b0324live-max-non-integer-load-refusal.test.ts:134-140
  - tests/live/acceptance/b0332live-spelled-arithmetic.test.ts:121-127
  - tests/live/acceptance/b0341live-inferred-binding-accumulator-registers.test.ts:138-144
  - tests/live/acceptance/b0344live-commontype-literal-candidate-admittee.test.ts:164-170
  - tests/live/acceptance/b0345-interpolation-operand-refusal.test.ts:122-128
  - tests/live/acceptance/b0346live-match-arm-lub-admittee.test.ts:168-174
sites: 8
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# parseErrorCodes is redeclared byte-identically in eight tests/live/acceptance bug-witness files with no tests/helpers/ home

## Observation
Each of the eight in-scope `tests/live/acceptance/b03*`/`b0345` live bug-witness files declares its own module-scope `parseErrorCodes(thetaText, thetaPath)` function, used by that file's "ATTRIBUTION GUARD" block to derive the sorted list of error-severity diagnostic codes from an offline `parseDoc` call before the live host is required. The function body — a one-line doc comment plus a four-line `parseDoc(...).diagnostics.filter(...).map(...).sort()` chain — is byte-for-byte identical across all eight files. No `tests/helpers/` module exports this function; each file imports only `parseDoc` from `tests/helpers/e2e-s1.ts` and re-wraps it locally.

## Evidence
tests/live/acceptance/b0314live-compound-assign.test.ts:123-129:
```ts
/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}
```

`diff` of the same 7-line span (doc comment through closing brace) confirms byte-identical bodies at every other cited site:
- tests/live/acceptance/b0315live-stdlib-arg-refusal.test.ts:122-128 — identical
- tests/live/acceptance/b0324live-max-non-integer-load-refusal.test.ts:134-140 — identical
- tests/live/acceptance/b0332live-spelled-arithmetic.test.ts:121-127 — identical
- tests/live/acceptance/b0341live-inferred-binding-accumulator-registers.test.ts:138-144 — identical
- tests/live/acceptance/b0344live-commontype-literal-candidate-admittee.test.ts:164-170 — identical
- tests/live/acceptance/b0345-interpolation-operand-refusal.test.ts:122-128 — identical
- tests/live/acceptance/b0346live-match-arm-lub-admittee.test.ts:168-174 — identical

Exact search and hit count: `grep -n "^function parseErrorCodes" tests/live/acceptance/*.test.ts` returns 11 hits total in the directory (the 8 cited in-scope files plus b0307, b0351 and b0357, which are outside this brief's reviewed file list and are named here only to show the pattern is not confined to the 8 in-scope sites, not as part of this finding's count).

Each of the 8 sites imports the same underlying primitive:
```ts
import { parseDoc } from "../../helpers/e2e-s1";
```
(present verbatim in all 8 files, e.g. tests/live/acceptance/b0314live-compound-assign.test.ts:73)

## Why this is a problem
An identical 4-statement transformation of `parseDoc`'s output — filter to error severity, map to code, sort — is retyped whole into eight sibling bug-witness files that already share the same `./harness` and `../../helpers/e2e-s1` imports for every other piece of their offline "ATTRIBUTION GUARD" plumbing. A change to how these attribution guards should read diagnostics (e.g. widening from `error` severity to `error`+`warning`, or changing the sort key) landing in one file's copy would leave the other seven checking a different diagnostic-code contract with nothing in any file surfacing the drift, since no shared definition exists for any of the eight to import.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts`, which every one of the eight files already imports `parseDoc` from, is the natural existing home for this thin wrapper — an observation about where the eight files' own import already points, not a design for the change.

## False-positive check
- Gate-pin check: none of the 8 files matches `*gate*.test.ts` or its named kin; `parseErrorCodes` is harness plumbing, not a pinned count or inventory.
- Recording-double check: `parseErrorCodes` performs no recording and backs no "never called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -m1 -i status docs/bugs/{0314,0315,0324,0332,0341,0344,0345,0346}-*.md` — all eight report "fixed" (0.293.0 through 0.324.0); none is a documented correct-reason red, and this finding does not touch any file's assertions or dispositions.
- coverage-matrix/bug-doc citation search: `grep -n "b0314live\|b0315live\|b0324live\|b0332live\|b0341live\|b0344live\|b0345-interpolation\|b0346live" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()` cell — only that the eight local `parseErrorCodes` copies could import a shared definition — so no citation is affected.
- Coverage-drift check: this finding is about a repeated harness-support function definition that exists and runs identically in all eight files; it makes no claim that any path or behaviour is untested.
- Live-suite posture check: this is not about the live-host `failLoudly`/skip posture (each file's own precondition handling is separate and correctly fail-loud) — the finding is scoped to the offline `parseErrorCodes` helper alone, which runs before any live host is required.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `grep -n "^function parseErrorCodes" tests/live/acceptance/*.test.ts` reproduces exactly 11 hits (the 8 cited + b0307/b0351/b0357 as the filing states), the 7-line doc-comment-through-brace span extracted from each of the 8 cited files is byte-identical to b0314's under `cmp` at the cited lines (drift of one line: declarations sit at 124/123/135/122/139/165/123/169), all 8 import `parseDoc` from tests/helpers/e2e-s1.ts (which exports `errors()`/`codes()` but no error-code-list-from-source wrapper; grep of `parseErrorCodes` across tests/helpers/ is empty), none is a *gate* test, docs/bugs/{0314..0346} all report fixed, coverage-matrix.md has 0 hits for the 8 stems, and the nearest prior track PTQ-0256 (resolved, fixed) covered a differently-named `errorCodes` helper in tests/b04*.test.ts whose name-based fix structurally could not reach these tests/live/acceptance copies (same non-duplicate ruling as PTQ-0274 vs PTQ-0205) — genuine D7 boilerplate duplication confined to tests/ with a mechanical dedupe (triage: claude-fable-5-1)
