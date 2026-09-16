---
id: PTQ-0376
title: b0369's assertLoudThrow re-derives assertFramesToInternalError's four-assertion throw-framing check instead of calling it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0369-control-flow-kind-belts.test.ts:291-317
  - tests/b0369-control-flow-kind-belts.test.ts:590-606
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916045442
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# b0369's assertLoudThrow re-derives assertFramesToInternalError's four-assertion throw-framing check instead of calling it

## Observation
tests/b0369-control-flow-kind-belts.test.ts declares two module-scope assertion helpers. `assertLoudThrow` (lines 291-317), used by the EXECUTOR-lane FLIP rows (E1-E4, E6, F1-F6), branches on whether the probed body threw; when it did, its "thrown" arm runs four `expect` calls verifying: the thrown value is not a `ThetaPanic`, `surfaceUnexpectedThrow` returns a defined `Diagnostic`, the diagnostic's `code` equals `INTERNAL_ERROR_CODE`, and the diagnostic's `message` matches `/^internal error: /`. `assertFramesToInternalError` (lines 590-606), used by the PURE-HOST-lane rows (PT, PNot, PAnd, PIf, POr), runs the identical four `expect` calls over a bare `thrown: unknown` parameter instead of a `Probe`. The two bodies differ only in the wording of the failure-message strings ("the loud throw is..." vs "the belt is...") and in how the thrown value reaches the checks (`probe.thrown` after a branch vs. a direct parameter).

## Evidence
tests/b0369-control-flow-kind-belts.test.ts:299-307 — the duplicated sequence's first half, inside `assertLoudThrow`'s "thrown" arm:
```ts
  expect(
    isThetaPanic(probe.thrown),
    `${what}: the loud throw is a plain Error, NOT a ThetaPanic (the six-source panic list is closed). Thrown: ${String(probe.thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
  expect(
    diagnostic,
    `${what}: surfaceUnexpectedThrow returns a Diagnostic for a non-panic throw`,
  ).toBeDefined();
```

tests/b0369-control-flow-kind-belts.test.ts:309-316 — the duplicated sequence's second half, same function:
```ts
  expect(
    diag.code,
    `${what}: the loud throw routes to the existing permitted internal-error surface`,
  ).toBe(INTERNAL_ERROR_CODE);
  expect(
    diag.message,
    `${what}: the internal-error template prefix (tail wording is the implementer's)`,
  ).toMatch(/^internal error: /);
```

tests/b0369-control-flow-kind-belts.test.ts:591-605 — `assertFramesToInternalError`'s entire body, running the same four checks in the same order over the same `SITE`/`INTERNAL_ERROR_CODE` constants:
```ts
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
```
Both sequences call the same two production entry points in the same order (`isThetaPanic` then `surfaceUnexpectedThrow(x, SITE)`), assert the same four outcomes (`false`, defined, `INTERNAL_ERROR_CODE`, `/^internal error: /`), and both take a `what: string` label used identically in every message. `assertLoudThrow`'s "thrown" arm is reachable only after the `if (probe.kind === "value") { ...; return; }` guard (lines 292-297) has already exited, so at line 299 `probe.kind` is narrowed to `"threw"` and `probe.thrown` is exactly the `thrown: unknown` value `assertFramesToInternalError` takes directly — nothing in the surrounding logic requires the two checks to be re-typed independently.

## Why this is a problem
This is the "Boilerplate duplication" class applied within a single file: the same setup/assertion sequence — call `isThetaPanic`, call `surfaceUnexpectedThrow(x, SITE)`, assert `.code`, assert `.message` — is written out twice rather than shared once. Because function declarations are hoisted in TypeScript/JavaScript, `assertLoudThrow` (defined first, at line 291) could call `assertFramesToInternalError` (defined later, at line 590) with no reordering; the duplication is not forced by definition order. A change to the framing contract (a new required check, a renamed constant, an added `ThetaPanic` source) applied to one copy and not the other would silently leave half of this file's FLIP rows checking a stale contract while the other half checks the updated one, with nothing in the file surfacing the drift. The identical pair recurs, byte-for-byte apart from the same two cosmetic wording differences, in the sibling file tests/b0368-plus-ordering-laundered-belt.test.ts (`assertLoudThrow` at its lines 269-295, `assertFramesToInternalError` at its lines 554-570) — consistent with this file's own header note that its harness is "the b0368 shape, verbatim" — which confirms the duplication was carried over as a unit rather than introduced once in this file alone; that sibling file is outside this review's six-file scope and is cited here only as corroborating context, not as a location of this finding.

## Suggested direction (non-binding, optional)
`assertLoudThrow`'s "thrown" arm (lines 299-316) and `assertFramesToInternalError` (lines 591-605) check the identical contract over the identical inputs; the latter, already defined in this same file, is the sequence the former's "thrown" arm could delegate to instead of re-deriving it.

## False-positive check
- Gate-pin check: tests/b0369-control-flow-kind-belts.test.ts does not match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); neither cited function touches a pinned count or inventory.
- Recording-double check: neither `assertLoudThrow` nor `assertFramesToInternalError` is a recording double backing a "never called" witness; both assert directly on a thrown value and a `Diagnostic` returned by a real production call, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md — Status "fixed (0.350.0)". `npx vitest run tests/b0369-control-flow-kind-belts.test.ts` → 34 passed (34) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0369" docs/reference/coverage-matrix.md` → 0 hits. `grep -n "tests/b0369-control-flow-kind-belts.test.ts" docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md` → two hits, both citing the whole file ("NEW witness, 34 cells" and the `npx vitest run` witness command) — no cited `it()` name or count is affected by this finding, which proposes only that one helper function's body could call a second, already-existing helper function in the same file; the file's 34 cells and their names are untouched.
- Prior-finding overlap check: `grep -rl "assertLoudThrow\|assertFramesToInternalError" quality/issues quality/resolved quality/intake` → only quality/resolved/PTQ-0245-b0369-e6-worker-scheduling-name-mismatch.md, which is about `assertLoudThrow`'s E6 caller's title overclaiming a scheduling-order guarantee unrelated to this finding (the duplication between `assertLoudThrow`'s own body and `assertFramesToInternalError`); PTQ-0245 is already reflected as fixed in the current file (E6's title no longer claims "before worker scheduling"). This finding's root cause (duplicated assertion bodies) is disjoint from PTQ-0245's (an unverifiable ordering claim in one test's title) and from the given "already-filed" list's PTQ-0209 (`rootDouble`/`producer`), PTQ-0239 (`parse`/`parseDoc`), PTQ-0310 (`fakeThetaLibFs`), and PTQ-0315/PTQ-0347 (`bindImportedBody`-style driver sequences) — none of those tickets' cited functions or topics overlap `isThetaPanic`/`surfaceUnexpectedThrow` framing assertions.
- Coverage-drift check: this finding is about two already-written, already-passing helper functions' bodies duplicating each other; it does not claim any behaviour or path is untested, and proposes no change to any `it()`/`describe()` name or count.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both cited functions (291-317, 590-606) reproduced verbatim including the four identical expect calls in identical order; Probe's discriminated union confirms probe.thrown narrows to exactly assertFramesToInternalError's `thrown: unknown` parameter after the guard, function hoisting permits the delegation with no reordering, the file passes 34/34, docs/bugs/0369 is fixed with 0 coverage-matrix hits, and grepping quality/{issues,resolved,intake} finds no other ticket naming this pair — real, mechanically-evidenced D7 boilerplate duplication confined to tests/ (triage: claude-opus-5)
