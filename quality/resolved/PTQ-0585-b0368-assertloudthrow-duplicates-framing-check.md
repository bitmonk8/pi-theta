---
id: PTQ-0585
title: b0368's assertLoudThrow re-derives assertFramesToInternalError's four-assertion throw-framing check instead of calling it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0368-plus-ordering-laundered-belt.test.ts:189-215
  - tests/b0368-plus-ordering-laundered-belt.test.ts:327-343
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0368's assertLoudThrow re-derives assertFramesToInternalError's four-assertion throw-framing check instead of calling it

## Observation
tests/b0368-plus-ordering-laundered-belt.test.ts declares two module-scope assertion helpers. `assertLoudThrow` (lines 189-215), used by the D1-D7/CP/D8 EXECUTOR-lane rows, branches on whether the probed body threw; when it did, its "thrown" arm runs four `expect` calls verifying the thrown value is not a `ThetaPanic`, `surfaceUnexpectedThrow` returns a defined `Diagnostic`, the diagnostic's `code` equals `INTERNAL_ERROR_CODE`, and the diagnostic's `message` matches `/^internal error: /`. `assertFramesToInternalError` (lines 327-343), used by the PI/PInvoke PURE-HOST-lane rows, runs the identical four `expect` calls over a bare `thrown: unknown` parameter instead of a `Probe`. This is the same pair, in the same relative order, over the same `SITE`/`INTERNAL_ERROR_CODE` constants that quality/resolved/PTQ-0376 found and fixed in the sibling file tests/b0369-control-flow-kind-belts.test.ts — that finding's own Evidence section cited this file's copy as "corroborating context... outside this review's six-file scope," not as a location, because b0368 was out of scope at the time it was filed.

## Evidence
tests/b0368-plus-ordering-laundered-belt.test.ts:189-215 (re-read immediately before filing; `assertLoudThrow`):
```ts
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a laundered non-(two-string/two-number) pair reaching \`+\`/ordering must throw LOUDLY (${leakDescription})`,
    ).toBe("runtime loud throw");
    return;
  }
  expect(
    isThetaPanic(probe.thrown),
    `${what}: the loud throw is a plain Error, NOT a ThetaPanic (the six-source panic list is closed). Thrown: ${String(probe.thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
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

tests/b0368-plus-ordering-laundered-belt.test.ts:327-343 (re-read immediately before filing; `assertFramesToInternalError` — the identical four checks over the same two production entry points, same order):
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

Both call `isThetaPanic` then `surfaceUnexpectedThrow(x, SITE)` in the same order, assert the same four outcomes (`false`, defined, `INTERNAL_ERROR_CODE`, `/^internal error: /`), and both take a `what: string` label used identically in every message. `assertLoudThrow`'s "thrown" arm is reached only after the `if (probe.kind === "value") { ...; return; }` guard (lines 190-195) has exited, so at line 197 `probe.thrown` is exactly the `thrown: unknown` value `assertFramesToInternalError` takes directly, and `assertFramesToInternalError` (defined at line 327, after `assertLoudThrow` at line 189) is still callable from inside `assertLoudThrow` because function declarations are hoisted — this file's own sibling, tests/b0369-control-flow-kind-belts.test.ts:199-209, already delegates in exactly this direction with the identical hoisting argument stated in its own comment ("function declarations are hoisted, so this forward reference is valid").

## Why this is a problem
The same setup/assertion sequence — call `isThetaPanic`, call `surfaceUnexpectedThrow(x, SITE)`, assert `.code`, assert `.message` — is written out twice in this one file rather than shared once. quality/resolved/PTQ-0376 fixed the identical pair in tests/b0369-control-flow-kind-belts.test.ts by having `assertLoudThrow`'s "thrown" arm call `assertFramesToInternalError(probe.thrown, what)` instead of re-deriving the four checks; that fix's own Evidence section already named this file's copy as byte-for-byte the same duplication, just out of that review's scope. b0368 is now in scope and the duplication it identified there is still present, unfixed, in this file.

## Suggested direction (non-binding, optional)
`assertLoudThrow`'s "thrown" arm (lines 197-214) and `assertFramesToInternalError` (lines 327-341) check the identical contract over the identical inputs; the latter, already defined in this same file, is the sequence the former's "thrown" arm could delegate to — the same delegation tests/b0369-control-flow-kind-belts.test.ts already performs.

## False-positive check
- Gate-pin check: tests/b0368-plus-ordering-laundered-belt.test.ts does not match `*gate*.test.ts` or the named kin; neither cited function touches a pinned count or inventory.
- Recording-double check: neither `assertLoudThrow` nor `assertFramesToInternalError` is a recording double backing a "never called" witness; both assert directly on a thrown value and a `Diagnostic` returned by a real production call, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0368-plus-and-ordering-laundered-operands-silent-js-coercion.md — Status "fixed (0.348.0)". `npx vitest run tests/b0368-plus-ordering-laundered-belt.test.ts` → 19 passed (19) at HEAD (confirmed as part of the full six-file run, 100/100), so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0368-plus-ordering-laundered-belt" docs/reference/coverage-matrix.md` → 0 hits; `grep -n "tests/b0368-plus-ordering-laundered-belt.test.ts" docs/bugs/0368-plus-and-ordering-laundered-operands-silent-js-coercion.md` cites the whole file, not any individual `it()` name or count this finding would change — this finding proposes only that one helper's body could call a second, already-existing helper in the same file.
- Prior-finding overlap check: quality/resolved/PTQ-0376 (verdict: confirmed, fixed) is the same root cause applied to tests/b0369-control-flow-kind-belts.test.ts; its own Evidence section explicitly cites this file's identical copy as "outside this review's six-file scope... cited here only as corroborating context, not as a location of this finding" — confirming this file's copy was known but never filed as its own location. Re-reading tests/b0369-control-flow-kind-belts.test.ts:199-209 in full confirms the fix landed there (delegation, not re-derivation); tests/b0368-plus-ordering-laundered-belt.test.ts:189-215 confirms the fix did not propagate here.
- Coverage-drift check: this finding is about two already-written, already-passing helper functions' bodies duplicating each other; it does not claim any behaviour or path is untested, and proposes no change to any `it()`/`describe()` name or count.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/b0368-plus-ordering-laundered-belt.test.ts:189-215 and 327-343 with the same four expect calls (isThetaPanic→false, surfaceUnexpectedThrow(x, SITE)→defined, .code→INTERNAL_ERROR_CODE, .message→/^internal error: /) in the same order; Probe (175-177) narrows probe.thrown to exactly the `thrown: unknown` parameter after the kind==="value" guard, so hoisted delegation is mechanical (b0369:199-209 already does it); file passes 19/19, bug 0368 is fixed (0.348.0), 0 coverage-matrix hits, bug doc cites the whole file only; not a duplicate — resolved PTQ-0376 lists b0369 locations only and explicitly excluded this file, its fix commit c373a961 touched 0 b0368 lines, and sibling intake d7-03-b0365-b0366-b0367 cites b0365/b0366/b0367 only — real D7 boilerplate duplication confined to tests/ (triage: claude-fable-5-1)
