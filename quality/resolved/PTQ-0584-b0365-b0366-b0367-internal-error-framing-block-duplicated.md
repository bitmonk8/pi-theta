---
id: PTQ-0584
title: The five-assertion "loud throw frames to internal-error" block is duplicated four times across b0365 (inline twice) and as byte-identical assertLoudThrow functions in b0366/b0367
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0365-index-kind-belt.test.ts:508-516
  - tests/b0365-index-kind-belt.test.ts:693-701
  - tests/b0366-join-element-laundered-belt.test.ts:269-295
  - tests/b0367-null-left-binary-minus.test.ts:285-311
sites: 4
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# The five-assertion "loud throw frames to internal-error" block is duplicated four times across b0365 (inline twice) and as byte-identical assertLoudThrow functions in b0366/b0367

## Observation
The same five-step assertion sequence — assert the caught throw is NOT a `ThetaPanic` (`isThetaPanic(...).toBe(false)`), call `surfaceUnexpectedThrow(thrown, SITE)`, assert the returned `Diagnostic` `.toBeDefined()`, assert `diag.code` equals `INTERNAL_ERROR_CODE`, and assert `diag.message` matches `/^internal error: /` — appears four times across the three files: twice inline inside tests/b0365-index-kind-belt.test.ts (its `H3` and `PH3` test bodies), and once each as a standalone `assertLoudThrow` function in tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts. The two `assertLoudThrow` functions are byte-identical apart from one bug-specific string literal. None of the three files factors this block into a shared helper, and no existing file under tests/helpers/ exports it.

## Evidence

tests/b0365-index-kind-belt.test.ts:508-516 (`H3`, re-read immediately before filing):
```ts
    expect(
      isThetaPanic(probe.thrown),
      `H3: post-fix the deferred non-string object index throws a PLAIN Error belt, NOT a ThetaPanic (HEAD throws MissingObjectKeyPanic on the String()-coerced "true" key); thrown: ${String(probe.thrown)}`,
    ).toBe(false);
    const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
    expect(diagnostic, "H3: surfaceUnexpectedThrow returns a Diagnostic for the belt throw").toBeDefined();
    const diag = diagnostic as Diagnostic;
    expect(diag.code, "H3: the belt routes to the permitted internal-error surface").toBe(INTERNAL_ERROR_CODE);
    expect(diag.message, "H3: the internal-error template prefix").toMatch(/^internal error: /);
```

tests/b0365-index-kind-belt.test.ts:693-701 (`PH3`, the same five steps, tag swapped `H3`→`PH3`):
```ts
    expect(
      isThetaPanic(probe.thrown),
      `PH3: post-fix the deferred boolean object index throws a PLAIN Error belt, NOT a ThetaPanic (HEAD throws MissingObjectKeyPanic on the String()-coerced "true" key); thrown: ${String(probe.thrown)}`,
    ).toBe(false);
    const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
    expect(diagnostic, "PH3: surfaceUnexpectedThrow returns a Diagnostic for the belt throw").toBeDefined();
    const diag = diagnostic as Diagnostic;
    expect(diag.code, "PH3: the belt routes to the permitted internal-error surface").toBe(INTERNAL_ERROR_CODE);
    expect(diag.message, "PH3: the internal-error template prefix").toMatch(/^internal error: /);
```

tests/b0366-join-element-laundered-belt.test.ts:269-295 (`assertLoudThrow`, the same five steps extracted as a function):
```ts
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a laundered non-string-element \`join\` receiver must throw LOUDLY (${leakDescription})`,
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

tests/b0367-null-left-binary-minus.test.ts:285-311 — `diff` against the b0366 excerpt above shows exactly one line differs (the leak-description literal: "a laundered non-string-element `join` receiver" vs "an authored binary `-` over a `null` left operand"); all 26 remaining lines, including every assertion, message template and the closing `INTERNAL_ERROR_CODE`/`/^internal error: /` pair, are byte-identical.

## Why this is a problem
The same internal-error-framing assertion sequence is written out four separate times in the three files under review — twice inline in b0365 and once each as a near-verbatim `assertLoudThrow` function in b0366 and b0367 — with no shared helper backing any of the four. `tests/helpers/runtime-belt-probe-harness.ts` (created to end this exact class of duplication for the sibling b0368/b0369 files, PTQ-0397) exports an analogous `assertValue` for the success-value half of these probes but does not cover this internal-error-framing half, so the pattern recurs unchecked in these three files even after that helper's creation.

## Suggested direction (non-binding, optional)
The five-step "assert non-panic, frame through surfaceUnexpectedThrow, assert code/message" sequence is a candidate for a shared assertion (parameterised by the `what` tag and, for b0365's H3/PH3, inlined only because they also assert `probe.sent`) alongside `assertValue` in the same `tests/helpers/` module that already centralises this family's other pieces.

## False-positive check
- Gate-pin: none of the three files matches `*gate*.test.ts` or the named kin; the cited blocks are assertion plumbing, not a pinned count or inventory.
- Recording-double: none of the four sites asserts a recording double was never called; `isThetaPanic(...).toBe(false)` and the `diag.code`/`diag.message` checks are direct observable assertions on the caught throw and the returned `Diagnostic`, not negative-witness recording assertions — the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0365-array-index-nonintegral-silent-undefined.md, docs/bugs/0366-join-element-precondition-no-runtime-belt.md and docs/bugs/0367-null-left-binary-minus-parses-as-unary-negation.md are all `Status: fixed`; `npx vitest run tests/b0365-index-kind-belt.test.ts tests/b0366-join-element-laundered-belt.test.ts tests/b0367-null-left-binary-minus.test.ts` → 49 passed (49) at HEAD, so none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0365-index-kind-belt\|b0366-join-element-laundered-belt\|b0367-null-left-binary-minus" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of any file or `it()`/`describe()` — only that the duplicated assertion block could be shared — so no citation is affected.
- Coverage check: the claim is about a repeated assertion-block DEFINITION, not a missing test path; every one of the four sites is exercised by its own file's passing tests (49/49, confirmed above).

## Triage
verdict: confirmed — all four excerpts reproduce verbatim at the cited lines; diff of b0366:269-295 vs b0367:285-311 yields exactly one differing line (the leak-description literal) and b0365's H3/PH3 blocks differ only by tag; tests/helpers/runtime-belt-probe-harness.ts exports only Probe/InterpProbe/InvokeProbe/assertValue/makeBeltProbes with zero INTERNAL_ERROR_CODE/surfaceUnexpectedThrow hits anywhere under tests/helpers/, so no shared framing helper exists; bugs 0365/0366/0367 fixed, 49/49 green, 0 coverage-matrix hits, no merge/rename/delete proposed; resolved PTQ-0376 (intra-b0369 delegation only) and PTQ-0397 (b0368/b0369 harness, explicitly excluding assertLoudThrow) and same-wave siblings d7-01/d7-02 (harness bundle, parseDeps) do not cite these sites — real, in-scope D7 boilerplate duplication (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
