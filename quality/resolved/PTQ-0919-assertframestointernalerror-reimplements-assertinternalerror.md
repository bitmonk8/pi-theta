---
id: PTQ-0919
title: b0366 and b0367 each locally redeclare assertFramesToInternalError, duplicating the canonical assertInternalError they already import in the same file
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0366-join-element-laundered-belt.test.ts:281-297
  - tests/b0367-null-left-binary-minus.test.ts:341-357
  - tests/helpers/runtime-belt-probe-harness.ts:125-149
sites: 2
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0366 and b0367 each locally redeclare assertFramesToInternalError, duplicating the canonical assertInternalError they already import in the same file

## Observation
Both tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts import `assertInternalError` from `tests/helpers/runtime-belt-probe-harness.ts` and use it inside their own `assertLoudThrow` helper (b0366:163-171, b0367:185-193). Each file also declares a second, separately-named module-scope function, `assertFramesToInternalError(thrown, what)`, used only by that same file's `PI`/`PInvoke` (or `RP`) pure-host rows, whose body re-derives the identical four-`expect` sequence the imported `assertInternalError` already performs, instead of calling it.

## Evidence

`tests/helpers/runtime-belt-probe-harness.ts:125-149` — the canonical, already-imported helper:
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
```

`tests/b0366-join-element-laundered-belt.test.ts:281-297` (re-read immediately before filing; note the file's own line 85 already imports `assertInternalError` from the module above, and line 171 already calls it):
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

`tests/b0367-null-left-binary-minus.test.ts:341-357` — the same function, same body (note the file's own line 70 already imports `assertInternalError` and line 193 already calls it):
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

`diff` of b0366:282-296 against b0367:342-356 (the function bodies, excluding the signature line) → zero output: byte-identical apart from the two files' own indentation, which is also identical. Both `isThetaPanic`, `surfaceUnexpectedThrow`, and `INTERNAL_ERROR_CODE` are imported directly from `../src/runtime/runtime-panics` in each file (b0366 lines omitted for brevity, b0367:73-77) specifically to support this re-derivation, alongside the already-imported `assertInternalError` from the shared harness that performs the identical check.

Sibling-file exact-search: `grep -rn "function assertFramesToInternalError" tests/*.test.ts` → 7 hits (b0338, b0345, b0366, b0367, b0368, b0369, b0392); the b0368 copy (`tests/b0368-plus-ordering-laundered-belt.test.ts:304-310`) is a one-line delegating wrapper (`assertInternalError(thrown, SITE, what, ...)`), the shape the b0366/b0367 copies in this review's scope do not follow.

## Why this is a problem
`assertInternalError` exists in `tests/helpers/runtime-belt-probe-harness.ts` precisely to hold this four-assertion sequence once, and both b0366 and b0367 already import it and call it from `assertLoudThrow` in the same file. Each file's separate `assertFramesToInternalError` performs the exact same four checks over the exact same inputs (`thrown`, `SITE`, `what`) but reaches them by re-typing the sequence rather than calling the function already in scope — the same duplication the resolved PTQ-0584 (which touched only each file's `assertLoudThrow`) and PTQ-0585 (which fixed the identical pair inside b0368 by making one delegate to the other) already addressed for these files' neighbours, but left this second, differently-named function untouched in both b0366 and b0367.

## Suggested direction (non-binding, optional)
Both files' `assertFramesToInternalError(thrown, what)` bodies are candidates to become a one-line call to the already-imported `assertInternalError(thrown, SITE, what)`, the same delegation b0368's own copy of this function already performs.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin; the cited functions are assertion plumbing, not a pinned count or inventory.
- Recording-double check: neither function asserts a recording double was never called; both assert directly on a caught throw and a `Diagnostic` returned by a real production call (`surfaceUnexpectedThrow`), so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0366-join-element-precondition-no-runtime-belt.md and docs/bugs/0367-null-left-binary-minus-parses-as-unary-negation.md are both `Status: fixed`; `npx vitest run tests/b0366-join-element-laundered-belt.test.ts tests/b0367-null-left-binary-minus.test.ts` passes in full at HEAD, so neither file is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0366-join-element-laundered-belt\|b0367-null-left-binary-minus" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that one already-duplicated local helper per file could call the already-imported canonical helper — so no citation is affected.
- Prior-finding overlap check: quality/resolved/PTQ-0584 cites only each file's `assertLoudThrow` (which the fix already made delegate to `assertInternalError`, confirmed by the current file content at b0366:163-171 and b0367:185-193); quality/resolved/PTQ-0585 fixed the identical `assertFramesToInternalError`-vs-`assertLoudThrow` duplication inside tests/b0368-plus-ordering-laundered-belt.test.ts only, and its own Evidence and locations name b0368 exclusively — neither prior finding's `locations` cite the `assertFramesToInternalError` declarations in b0366 or b0367, so this is a new, unfixed instance of the same root cause in two files those fixes did not reach.
- Coverage-drift check: this finding is about a duplicated already-passing helper function, not a missing test path; both files' full test suites are unaffected by the claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/b0366-join-element-laundered-belt.test.ts:281-297, tests/b0367-null-left-binary-minus.test.ts:341-357 and tests/helpers/runtime-belt-probe-harness.ts:125-149; mktemp `diff` of the two local bodies (b0366:282-296 vs b0367:342-356) is empty, and both perform the same four expects (isThetaPanic→false, surfaceUnexpectedThrow(x, SITE)→defined, .code→INTERNAL_ERROR_CODE, .message→/^internal error: /) over the same inputs as the exported `assertInternalError` each file already imports (b0366:85, b0367:70) and calls from `assertLoudThrow` (b0366:171, b0367:193); both local copies are live (b0366:320,348; b0367:372); the `function assertFramesToInternalError` search reproduces at 7 test files with b0368:304-310 already the one-line delegating shape (the harness's 4th `nonPanicMessage` param preserves the local wording, so the dedupe is mechanical); bugs 0366/0367 `Status: fixed`, 26/26 pass, coverage-matrix → 0 hits, no gate/recording-double/red-test carve-out, no merge/rename/delete proposed; not a duplicate — resolved PTQ-0584's b0366:269-295 / b0367:285-311 locations were the pre-fix `assertLoudThrow` bodies (its own excerpt shows the `probe.kind === "value"` guard) and its fix commit b2555372 touched neither `assertFramesToInternalError` declaration (`git show b2555372 -- b0366 | grep assertFramesToInternalError` → empty), PTQ-0585/PTQ-0376 are scoped to b0368/b0369 only, and no quality/issues row names these two functions — real, in-scope D7 boilerplate duplication confined to tests/ (triage: claude-fable-5-1)
