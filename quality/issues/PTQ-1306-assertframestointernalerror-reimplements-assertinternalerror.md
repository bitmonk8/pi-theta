---
id: PTQ-1306
title: b0369 and b0370 each redeclare the internal-error framing check tests/helpers/runtime-belt-probe-harness.ts already exports as assertInternalError
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0369-control-flow-kind-belts.test.ts:340-356
  - tests/b0370-reassign-target-scope.test.ts:203-225
  - tests/helpers/runtime-belt-probe-harness.ts:141-165
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0369 and b0370 each redeclare the internal-error framing check tests/helpers/runtime-belt-probe-harness.ts already exports as assertInternalError

## Observation
tests/helpers/runtime-belt-probe-harness.ts exports `assertInternalError(thrown, site, what, nonPanicMessage?)`, a four-`expect` sequence (not-a-panic, `surfaceUnexpectedThrow` returns a `Diagnostic`, `.code === INTERNAL_ERROR_CODE`, `.message` matches `/^internal error: /`). Both tests/b0369-control-flow-kind-belts.test.ts and tests/b0370-reassign-target-scope.test.ts already import other pieces from this exact module (`assertValue`/`makeBeltProbes`/`render` in b0369; `Probe`/`render`/`producer` in b0370), but each also declares its own module-scope function performing the identical four-`expect` sequence over the same inputs, instead of importing and calling `assertInternalError`.

## Evidence
tests/helpers/runtime-belt-probe-harness.ts:141-165 (re-read immediately before filing; the exported, already-partially-imported helper):
```ts
export function assertInternalError(
  thrown: unknown,
  site: { readonly file: string; readonly range: SourceRange },
  what: string,
  nonPanicMessage = `${what}: the loud throw is a plain Error, NOT a ThetaPanic (the six-source panic list is closed). Thrown: ${String(thrown)}`,
): void {
  expect(
    isThetaPanic(thrown),
    nonPanicMessage,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(thrown, site);
  expect(
    diagnostic,
    `${what}: surfaceUnexpectedThrow returns a Diagnostic for a non-panic throw`,
  ).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the loud throw routes to the existing permitted internal-error surface`,
  ).toBe(INTERNAL_ERROR_CODE);
  expect(
    diag.message,
    `${what}: the internal-error template prefix (tail wording is the implementer's)`,
  ).toMatch(/^internal error: /);
}
```

tests/b0369-control-flow-kind-belts.test.ts:340-356 (re-read immediately before filing; note line 128 already imports `assertValue`/`makeBeltProbes`/`render` from the same module):
```ts
function assertFramesToInternalError(thrown: unknown, what: string): void {
  expect(
    isThetaPanic(thrown),
    `${what}: the belt is a plain Error, NOT a ThetaPanic (the six-source panic list is closed); thrown: ${String(thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(thrown, SITE);
  expect(diagnostic, `${what}: surfaceUnexpectedThrow returns a Diagnostic for the belt throw`).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the belt throw routes to the permitted internal-error surface (theta/runtime/internal-error)`,
  ).toBe(INTERNAL_ERROR_CODE);
  expect(
    diag.message,
    `${what}: the internal-error template prefix (tail wording is the implementer's)`,
  ).toMatch(/^internal error: /);
}
```

tests/b0370-reassign-target-scope.test.ts:203-225 (re-read immediately before filing; the same four-check sequence, inline in `assertLoudThrow`'s throw branch — note line 59 already imports `Probe`/`render`/`producer` from the same module):
```ts
function assertLoudThrow(probe: Probe, leak: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a write the scope layer rejects must throw LOUDLY, not be silently discarded (${leak})`,
    ).toBe("runtime loud throw");
    return;
  }
  expect(
    isThetaPanic(probe.thrown),
    `${what}: the loud throw is a plain Error, NOT a ThetaPanic. Thrown: ${String(probe.thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
  expect(diagnostic, `${what}: surfaceUnexpectedThrow returns a Diagnostic`).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(diag.code, `${what}: routes to the existing internal-error surface`).toBe(
    INTERNAL_ERROR_CODE,
  );
  expect(
    diag.message,
    `${what}: the internal-error template prefix (tail wording is the implementer's)`,
  ).toMatch(/^internal error: /);
}
```
`grep -n "assertInternalError" tests/b0369-control-flow-kind-belts.test.ts tests/b0370-reassign-target-scope.test.ts` → 0 hits in both files — neither imports the exported function whose body they each re-type. Both local copies pass the same four checks (`isThetaPanic` → false, `surfaceUnexpectedThrow(x, SITE)` → defined, `.code` → `INTERNAL_ERROR_CODE`, `.message` → `/^internal error: /`) over the same input shape (`thrown`, a local `SITE` literal, `what`) the exported function's own parameters already take.

## Why this is a problem
The harness module's own export exists to hold this four-assertion sequence once (the resolved PTQ-0919 fixed the same root cause — a locally-redeclared `assertFramesToInternalError` duplicating the imported `assertInternalError` — in tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts, and that finding's own evidence named b0369 among 7 `grep` hits for the same function name as pattern size, explicitly not filed there). tests/b0369-control-flow-kind-belts.test.ts and tests/b0370-reassign-target-scope.test.ts are two more of those 7 sites, and unlike b0366/b0367 (which had already imported `assertInternalError` and merely left a second redundant copy), b0369 and b0370 do not import it at all — despite already importing sibling exports (`assertValue`/`render`/`producer`/`makeBeltProbes`) from that exact same module in the same import statement's module path.

## Suggested direction (non-binding, optional)
Both files' local four-`expect` sequences are candidates to become a call to the already-reachable `assertInternalError(thrown, SITE, what)`, the delegation shape tests/b0368-plus-ordering-laundered-belt.test.ts's own copy of this function already uses.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin; the cited functions are assertion plumbing, not a pinned count or inventory.
- Recording-double check: neither function asserts a recording double was never called; both assert directly on a caught throw and a `Diagnostic` returned by a real production call (`surfaceUnexpectedThrow`), so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md and docs/bugs/0370-reassign-target-scope-unchecked-cross-boundary-writes.md both exist and are cited by their own files' headers; both are Status: fixed (0.369.0 / 0.370.0 minted) and `npx vitest run` over both files passes in full — not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0369-control-flow-kind-belts\|b0370-reassign-target-scope" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that each file's local framing-check function could call the already-exported harness function — so no citation is affected.
- Prior-finding overlap check: resolved PTQ-0919 cites only tests/b0366-join-element-laundered-belt.test.ts:281-297 and tests/b0367-null-left-binary-minus.test.ts:341-357 as locations, and its own evidence's 7-hit `grep` list (b0338, b0345, b0366, b0367, b0368, b0369, b0392) names b0369 only as pattern size, explicitly not as a filed location; this finding cites b0369 and adds b0370 (not in that 7-hit list at all, since b0370's copy is unnamed — inlined in `assertLoudThrow` rather than a separate `assertFramesToInternalError` function) as new, disjoint locations. Resolved PTQ-0534/PTQ-0787 (also touching b0369/b0370) cite a different root cause (`rootDouble`/`producer`/`render` and `parseDeps`, both already fixed and confirmed migrated by re-reading the current file content above) and do not mention `assertInternalError`/`assertFramesToInternalError`.
- Coverage-drift check: the claim is about a repeated already-passing assertion sequence, not a missing test path; both files' full suites pass at HEAD.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/helpers/runtime-belt-probe-harness.ts:141-165 (exported `assertInternalError`), tests/b0369-control-flow-kind-belts.test.ts:340-356 (local `assertFramesToInternalError`, live at 206/380/395/456/489/529) and tests/b0370-reassign-target-scope.test.ts:203-225 (inline throw branch of `assertLoudThrow`, live at 477/520/541); both perform the same four expects (isThetaPanic→false, surfaceUnexpectedThrow(x, SITE)→defined, .code→INTERNAL_ERROR_CODE, .message→/^internal error: /) over inputs the export's (thrown, site, what, nonPanicMessage?) parameters already take; `grep assertInternalError` → 0 hits in both files while b0369:128 and b0370:59 already import from that module, and b0368:288-289 is the one-line delegating shape; bugs 0369/0370 `Status: fixed`, 67/67 pass, coverage-matrix → 0 hits, no gate/recording-double/red-test carve-out, no merge/rename/delete proposed; not a duplicate — resolved PTQ-0376 (b0369 assertLoudThrow→assertFramesToInternalError delegation, already landed at 206), PTQ-0585 (b0368), PTQ-0584 (b0365/6/7 pre-helper), PTQ-0919 (b0366/b0367 only, b0369 named as pattern size) cite disjoint sites, and sibling intake d7-01-b0345 covers b0345 only — real, in-scope D7 boilerplate duplication confined to tests/ (triage: claude-fable-5-1)
