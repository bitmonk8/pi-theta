---
id: PTQ-1047
title: requireAuthoredTheta's return type proves thetaPath is never undefined, so nine expect(thetaPath).toBeDefined() checks cannot fail
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/noninteractive-acceptance.test.ts:89-99
  - tests/live/acceptance/noninteractive-acceptance.test.ts:140
  - tests/live/acceptance/noninteractive-acceptance.test.ts:165
  - tests/live/acceptance/noninteractive-acceptance.test.ts:208
  - tests/live/acceptance/noninteractive-acceptance.test.ts:262
  - tests/live/acceptance/noninteractive-acceptance.test.ts:340
  - tests/live/acceptance/noninteractive-acceptance.test.ts:384
  - tests/live/acceptance/noninteractive-acceptance.test.ts:409
  - tests/live/acceptance/noninteractive-acceptance.test.ts:436
  - tests/live/acceptance/noninteractive-acceptance.test.ts:463
sites: 9
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# requireAuthoredTheta's return type proves thetaPath is never undefined, so nine expect(thetaPath).toBeDefined() checks cannot fail

## Observation
`requireAuthoredTheta` is declared with return type `string` (not `string |
undefined`). Its body resolves `path` (which IS `string | undefined`), and
if `path === undefined` it calls `failLoudly(...)`, whose own declared
return type is `never` (`export function failLoudly(message: string):
never`, `harness.ts:124-128`, and it always throws — `assert.fail(message);
throw new Error(message);`). Past that `if` block TypeScript narrows `path`
to `string`, so `return path;` type-checks against the declared `string`
return type. Every one of the nine H9a-T area tests in
`noninteractive-acceptance.test.ts` then calls `const thetaPath =
requireAuthoredTheta(spec);` and immediately asserts `expect(thetaPath).toBeDefined();`
— a check against a value the function's own signature and body have
already made structurally incapable of being undefined at that point.

## Evidence

`tests/live/acceptance/noninteractive-acceptance.test.ts:89-99` (the
function whose return type and control flow rule out `undefined`):
```ts
function requireAuthoredTheta(spec: FeatureThetaSpec): string {
  const path = resolveFeatureThetaPath(spec);
  if (path === undefined) {
    failLoudly(
      `feature theta ${spec.label} (${spec.area}) is not authored: expected ` +
        `${spec.fixtureFile} under ${FEATURE_THETA_DIR}, alongside the other ` +
        `eight committed feature-theta fixtures.`,
    );
  }
  return path;
}
```

`tests/live/acceptance/harness.ts:124-128` (`failLoudly`'s contract — a
`never`-typed function that always throws, which is what makes the
post-`if` narrowing above sound):
```ts
export function failLoudly(message: string): never {
  assert.fail(message);
  // `assert.fail` throws; the explicit throw guarantees the `never` return.
  throw new Error(message);
}
```

`tests/live/acceptance/noninteractive-acceptance.test.ts:139-141` (area
(a), representative of all nine call sites):
```ts
    const spec = featureTheta("prompt-sentinel");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();
```

Exact search: `grep -n "requireAuthoredTheta(spec)" tests/live/acceptance/noninteractive-acceptance.test.ts`
followed immediately by `expect(thetaPath).toBeDefined();` on the very next
statement returns exactly 9 hits, at lines 140, 165, 208, 262, 340, 384, 409,
436, 463 — one per H9a-T area (a) through (i).

## Why this is a problem
Mechanically, `thetaPath`'s static type at each of the nine call sites is
`string`, never `string | undefined`: the only branch that could have
produced `undefined` calls a function typed `never` and which always throws.
`expect(thetaPath).toBeDefined()` therefore tests a proposition the language
itself, and `requireAuthoredTheta`'s own control flow, have already
established — the real "missing fixture" precondition is enforced (loudly)
one line earlier, inside `requireAuthoredTheta`, not by this `expect`. The
`toBeDefined()` call can never observe a failure that the preceding
`failLoudly` call did not already throw past.

## Suggested direction (non-binding, optional)
None — the real precondition enforcement already lives in
`requireAuthoredTheta`/`failLoudly`; the nine `expect(thetaPath).toBeDefined()`
lines assert nothing beyond what the type system and the preceding call
already guarantee.

## False-positive check
- Gate-pin check: `noninteractive-acceptance.test.ts` is not a `*gate*.test.ts`
  file and matches none of the named gate-kin patterns; the manifest
  self-check `describe` block at the end of the file is a separate,
  unaffected concern this finding does not touch.
- Recording-double check: not applicable — `thetaPath` is a plain string
  return value, not a recording double backing a MUST-NOT-call witness.
- docs/bugs/ signature search: `grep -rl "requireAuthoredTheta"
  docs/bugs/*.md` → 0 hits; no documented correct-reason-red names this
  function or assertion.
- coverage-matrix/bug-doc citation search: `grep -n
  "noninteractive-acceptance" docs/reference/coverage-matrix.md` → 0 hits.
  This finding proposes no merge, rename, or deletion of any `it()`/
  `describe()` — only that nine identical post-condition checks cannot fail
  given the preceding call's own type and control flow.
- Live-suite posture check: `failLoudly` on a missing fixture is the correct
  fail-loudly posture (AGENTS.md "No silent skipping"); this finding does
  not claim that precondition handling itself is a smell — only that the
  redundant `expect(...).toBeDefined()` immediately after it cannot fail.
- Coverage drift: this finding does not claim any behaviour is untested; the
  nine area tests' real observables (`assertNoErrorExit`,
  `assertCodesSubsetOfPermitted`, `assertStderrClean`, and the per-area
  schema/envelope/discovery checks) are unaffected and unaddressed by this
  finding.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — independently re-verified: `requireAuthoredTheta(spec: FeatureThetaSpec): string` (noninteractive-acceptance.test.ts:89-99) wraps `resolveFeatureThetaPath(): string | undefined` (harness.ts:325-330) and routes the `undefined` arm through `failLoudly(): never` (harness.ts:124-128, `assert.fail` + explicit throw), so `path` is narrowed to `string` before `return path` — confirmed by a mktemp tsc probe (`const t: string = path` after the never-call compiles clean under --strict); `grep -n -A1 "requireAuthoredTheta(spec)"` returns exactly the 9 cited pairs (:139/140, 164/165, 207/208, 261/262, 339/340, 383/384, 408/409, 435/436, 462/463), each `expect(thetaPath).toBeDefined()` asserting a proposition the preceding throw-or-narrow already establishes — a D7 assertion-that-cannot-fail in tests/; carve-outs checked: not a *gate* file, no recording double, coverage-matrix 0 hits, and the candidate's "docs/bugs 0 hits" claim is wrong (docs/bugs/0030 names `requireAuthoredTheta` 4×) but immaterial — bug 0030 is fixed (0.35.0) and cites the function only for doc-block placement, never `thetaPath`/`toBeDefined`; not a duplicate — PTQ-0764 (same file) is the unawaited `requireLiveHost` root cause, and PTQ-0242/0818/0903/0261 are toBeDefined findings in other files (triage: claude-fable-5-1)

## Fix attempts
- qw20260918202006: skipped — [PTQ-1024-clean-stem-vacuity-guard-quadruplicated.md] PTQ-1024: Shared the clean fixture and registration guard across all five files, including b0267. Assertions preserved; required gate and affected live tests passed. / PTQ-1048: Shared chain-source builders and driven-turn assertions across three files. Fixture bytes and test names preserved; required gate and affected live tests passed. / PTQ-1034: Replaced local helpers in b0351, b0357, and triage-added b0307 with canonical errorCodes imports. Assertions unchanged; required gate and affected live tests passed. / PTQ-1040: Replaced both local helpers with canonical errorCodes imports and removed orphaned Diagnostic imports. Assertions unchanged; required gate and affected live tests passed. Overall verification: TypeScript, 687 offline files (11,569 tests), and all 10 affected live files passed. No tests deleted. ||
