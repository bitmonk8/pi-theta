---
id: PTQ-0383
title: b0369's F6 test name claims "the first `if c` throws," a claim its shared throw-framing helpers cannot verify
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0369-control-flow-kind-belts.test.ts:382-391
  - tests/b0369-control-flow-kind-belts.test.ts:291-303
  - tests/b0369-control-flow-kind-belts.test.ts:576-589
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916144930
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# b0369's F6 test name claims "the first `if c` throws," a claim its shared throw-framing helpers cannot verify

## Observation
tests/b0369-control-flow-kind-belts.test.ts's "F6" test is titled `` RED (F6):
`if c` then `if !c` over f("x") — at HEAD value "" (BOTH c and !c behaved
false); post-fix the first `if c` throws `` and is immediately preceded by a
comment stating "Post-fix the FIRST condition `if c` throws loudly." The test
drives a two-statement body — `if c { r = "a" }` followed by
`if !c { r = "b" }`, both over the same laundered value `c = "x"` — through
the shared `assertLoudThrow` helper, which on its "threw" branch delegates to
`assertFramesToInternalError`. Neither helper inspects the thrown value's
message, a call counter, or any other proxy capable of distinguishing "the
first statement (`if c`) threw" from "the first statement silently passed and
the second statement (`if !c`) threw instead." Both helpers establish only
that some throw occurred and that it was a non-panic `Error` framed to
`theta/runtime/internal-error`.

## Evidence
tests/b0369-control-flow-kind-belts.test.ts:382-391 (the claim, re-read
immediately before filing):
```ts
  // F6: for c = "x", the `if c` fallback AND the `if !c` fallback BOTH read
  // false, so neither branch runs and r stays "" — the two fallbacks contradict
  // each other observably. Post-fix the FIRST condition `if c` throws loudly.
  it('RED (F6): `if c` then `if !c` over f("x") — at HEAD value "" (BOTH c and !c behaved false); post-fix the first `if c` throws', async () => {
    assertLoudThrow(
      await probeSource('fn f(c) { let mut r = ""\nif c { r = "a" }\nif !c { r = "b" }\nr }\nf("x")'),
      'at HEAD value "" — both `if c` and `if !c` fabricated false, so neither branch ran',
      "F6",
    );
  });
```

tests/b0369-control-flow-kind-belts.test.ts:291-303 (the entirety of
`assertLoudThrow`'s logic — the "threw" branch is a bare delegate, nothing
more):
```ts
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a value the spec refuses in this control-flow position must throw LOUDLY (${leakDescription})`,
    ).toBe("runtime loud throw");
    return;
  }
  // Same four-assertion throw-framing check `assertFramesToInternalError` runs
  // for the PURE-HOST-lane rows below (function declarations are hoisted, so
  // this forward reference is valid) — delegate instead of re-deriving it.
  assertFramesToInternalError(probe.thrown, what);
}
```

tests/b0369-control-flow-kind-belts.test.ts:576-589 (`assertFramesToInternalError`'s
body — every assertion is about the throw's own shape/framing; none inspects
which statement produced it):
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
```

Pattern search: the `Probe` union (used by `probeSource`/`assertLoudThrow`)
carries only `{kind:"value", execution}` or `{kind:"threw", thrown}` — no
field records which statement, expression, or loop iteration produced a
throw. `grep -n "parseCalleeCalls\|probe\.sent" tests/b0369-control-flow-kind-belts.test.ts`
finds those two fields used by this same file's OTHER "before X"-titled
cells: PT/PNot/PIf/POr each check `probe.sent` (`.toEqual([])`) and PAnd
checks `probe.parseCalleeCalls` (`.toBe(0)`) to back their own "before
send"/"pre-load" ordering claims — confirming this file's own established
convention of pairing an ordering claim with a recorded proxy. F6's title
carries the same shape of claim ("the first … throws") with no such proxy
anywhere in its call chain.

## Why this is a problem
The title and comment assert WHICH of two sequential, identically-shaped
statements produces the throw ("the FIRST condition `if c`"), not merely that
a throw occurs. `if c { r = "a" }` and `if !c { r = "b" }` each independently
reach a boolean-position belt over the SAME laundered value (this file's own
header attributes the `if` condition check and the unary `!` operand check to
two distinct consumption sites of the shared helper: "The `!` arm
(statement-executor.ts:1108)… consumed by `executeIf`
(statement-executor.ts:1967)"). A reader who trusts the title would conclude
that a regression dropping the belt from `executeIf`'s own condition check
alone — while leaving the `!` operand's belt intact — would be caught by this
test, since the title specifically names `if c`, not `if !c`, as the
throwing statement. It would not be caught: under that hypothetical, `if c`
would silently pass exactly as it does at HEAD pre-fix, execution would reach
`if !c`, and its still-present belt would throw there instead;
`assertLoudThrow`/`assertFramesToInternalError` would observe the identical
"threw, framed to internal-error" shape and this test would stay green,
contradicting the title's specific claim about which statement fired.

## Suggested direction (non-binding, optional)
This same file's PAnd row already backs a comparable "before X" placement
claim with a concrete recorded proxy (`probe.parseCalleeCalls`) rather than
the bare throw/framing check F6 uses — that is the pattern already present in
this file for making an ordering claim load-bearing, named here as
observation rather than as a design for threading an equivalent per-statement
proxy through `probeSource`.

## False-positive check
- Gate-pin check: tests/b0369-control-flow-kind-belts.test.ts does not match
  `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); this finding touches no pinned count or
  inventory.
- Recording-double check: `assertLoudThrow`/`assertFramesToInternalError`
  assert on a caught throw's own shape, not on a fake's call log; there is no
  MUST-NOT witness here for the negative-witness carve-out to protect.
- docs/bugs/ signature search: docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md:3
  Status "fixed (0.350.0)"; its Reproduction table's F6 row (line 110) states
  only the AT-HEAD observed value (`value=""`); its §Fix / "Fix (0.350.0)"
  text (lines ~160-215) states the uniform loud-defect disposition across all
  listed constructs but never orders `if c` ahead of `if !c` specifically —
  `grep -n "first" docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md`
  returns zero hits, so the doc itself makes no claim this test's title
  extends beyond it. `npx vitest run tests/b0369-control-flow-kind-belts.test.ts`
  → 34/34 passed at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0369" docs/reference/coverage-matrix.md`
  → 0 hits. docs/bugs/0369-…md:227 cites the whole file ("NEW witness, 34
  cells") as its witness, not the F6 cell individually by name. This finding
  proposes no merge, rename, or deletion of the F6 test or any other cell in
  the file — it is confined to the gap between this one test's own
  name/comment and what its own existing assertion verifies.
- Coverage check: this does not claim any path or behaviour is untested, nor
  that a new test should exist; F6 exists, passes, and the claim is scoped
  entirely to what its own existing assertion mechanically proves relative to
  its own name. It is not a bug report either: the underlying implementation's
  belt placement (per this file's own statement-executor.ts:1967/1108
  citations) is not disputed here; only the test's own proof of "which one"
  is at issue.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim: Probe (225-227) carries only value/thrown, assertLoudThrow (291-303) delegates to assertFramesToInternalError (576-591) which checks only panic-ness/diagnostic-code/message-prefix; executeIf's requireBoolean call and evalBinary's `!`-arm requireBoolean call are separate call sites (src/runtime/statement-executor.ts:869-873 vs 1517), so disabling only the former would still throw from `if !c` with identical framing and leave F6 green, contradicting the title/comment's "first `if c`" claim; docs/bugs/0369 makes no such ordering claim (0 hits for "first") and the file passes 34/34 at HEAD; not a duplicate of resolved PTQ-0245 (that ticket's claim was E6's "before worker scheduling", a different cell and different claim in the same file) (triage: claude-opus-5)
