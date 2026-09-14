---
id: PTQ-0245
title: b0369's E6 test name and comment claim the belt fires "before worker scheduling," a placement guarantee its sole assertion cannot observe
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0369-control-flow-kind-belts.test.ts:345-356
  - tests/b0369-control-flow-kind-belts.test.ts:291-305
  - tests/b0369-control-flow-kind-belts.test.ts:693-707
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0369's E6 test name and comment claim the belt fires "before worker scheduling," a placement guarantee its sole assertion cannot observe

## Observation
tests/b0369-control-flow-kind-belts.test.ts's "E6" test is titled `` RED (E6): `par for i in x` over f("abc") throws before worker scheduling `` and its immediately preceding comment states the fix "fires BEFORE worker scheduling (a placement guarantee — CTRL-5 must never observe a fabricated empty fan-out)". The test's body calls only the shared `assertLoudThrow(probe, leakDescription, what)` helper. That helper's entire logic only distinguishes "the drive returned a value" from "the drive threw," then — once thrown — checks that the thrown value is a non-panic `Error` correctly framed by `surfaceUnexpectedThrow` to `INTERNAL_ERROR_CODE`. Nothing in `assertLoudThrow`, `probeSource`, `rootDouble()`, or `producer()` records whether any loop iteration began before the throw, so nothing in this test can distinguish "threw before scheduling any iteration" from "threw after scheduling one or more iterations." All 34 tests in the file, including E6, currently pass (`npx vitest run tests/b0369-control-flow-kind-belts.test.ts` → 34 passed).

## Evidence
tests/b0369-control-flow-kind-belts.test.ts:345-356 (the title's ordering claim and its sole assertion call):
```ts
  // E6: `par for` over a laundered string fabricates the empty fan-out `[]`
  // (JSON "[]") as the loop value, outcome success. Post-fix the belt fires
  // BEFORE worker scheduling (a placement guarantee — CTRL-5 must never observe
  // a fabricated empty fan-out); the observable here is that loud throw
  // replacing the value=[] success.
  it('RED (E6): `par for i in x` over f("abc") throws before worker scheduling (at HEAD value [] — the fabricated empty fan-out)', async () => {
    assertLoudThrow(
      await probeSource('fn f(x) { par for i in x { 1 } }\nf("abc")'),
      "at HEAD value [] (JSON \"[]\") — the empty fan-out fabricated before any worker ran",
      "E6",
    );
  });
```

tests/b0369-control-flow-kind-belts.test.ts:291-305 (`assertLoudThrow`'s full branch set on the "value" side, and the start of its "threw" side — neither line inspects scheduling/iteration count; the omitted tail, lines 306-317, only checks `diag.code` and `diag.message`):
```ts
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a value the spec refuses in this control-flow position must throw LOUDLY (${leakDescription})`,
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
```

tests/b0369-control-flow-kind-belts.test.ts:693-707 — this same file's own established pattern for a comparable ordering claim, contrasted: PAnd's title also claims a "before/pre-load" disposition ("post-fix aborts pre-load"), and unlike E6 it verifies that claim with an explicit recorded proxy, `probe.parseCalleeCalls`:
```ts
    if (probe.kind === "value") {
      // RED-for-right-reason: `1 && true` fabricated false, bound it, and the
      // invoke advanced to callee load (parseCallee reached), on its way to the
      // child boundary.
      expect(
        `value; parseCalleeCalls=${probe.parseCalleeCalls}`,
        "PAnd: the invoking theta must abort loudly at arg binding, before any callee load or child spawn",
      ).toBe("loud framed abort; parseCalleeCalls=0");
      return;
    }
    assertFramesToInternalError(probe.thrown, "PAnd");
    expect(
      probe.parseCalleeCalls,
      "PAnd: the belt throws at arg binding, so the callee is never loaded and no child is spawned",
    ).toBe(0);
```

Pattern search across the reviewed scope: `grep -n 'it(.*before' tests/b0369-control-flow-kind-belts.test.ts` → 6 hits (E6 at :350, PT at :615, PNot at :631, PIf at :722, POr at :765, plus the describe-level PAnd title at :691 carrying "pre-load"). The interpolation rows (PT/PNot/PIf/POr) each verify their "before send" title claim via `expect(probe.sent, ...).toEqual([])`; PAnd verifies its "pre-load" claim via `probe.parseCalleeCalls === 0` (shown above). E6 is the only one of the six whose title makes an ordering claim with no matching proxy anywhere in its call chain.

## Why this is a problem
The title and comment assert a specific placement/ordering property: the belt check must run *before* the loop's width-resolution/scheduling step, so that CTRL-5 "must never observe a fabricated empty fan-out." `assertLoudThrow` only ever asks "did it throw, and if so was the throw a correctly-framed non-panic Error" — a property that is exactly as true whether zero, one, or several iterations had already begun before the throw. A reader who trusts the name would conclude that a regression moving the belt check to fire *after* scheduling had begun (while the call still eventually threw the same class of error) would be caught by this suite; it would not be — E6 would still read "threw" with the same framing and pass unchanged. This is not a hypothetical: this exact file demonstrates, four rows over (PT/PNot/PIf/POr) and immediately below (PAnd), that when this file's author wants an ordering claim in a title to be load-bearing, the assertion pairs it with a concrete recorded proxy (`probe.sent`, `probe.parseCalleeCalls`). E6 carries the same kind of claim in its own title and comment with no such proxy, so the reader's natural inference — "this specific placement guarantee is pinned here" — does not hold for this test's actual assertion.

## Suggested direction (non-binding, optional)
This same file's PAnd row (a recorded call-count the probe already threads through, `parseCalleeCalls`) is the pattern already used elsewhere in this file for pinning a "before X" title claim with a matching observable; it names where an equivalent scheduling-proxy would sit if E6's title is meant to be load-bearing, without prescribing how one would be added to `par for`'s harness.

## False-positive check
- Gate-pin: tests/b0369-control-flow-kind-belts.test.ts does not match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); this finding does not touch a pinned count or inventory.
- Recording-double: `assertLoudThrow`/`probeSource` are not a MUST-NOT recording double the negative-witness carve-out covers — nothing in this finding is an assertion that something was never called; the finding is the opposite shape (a claim with no counter behind it at all).
- docs/bugs/ signature search: docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md — Status "fixed (0.350.0)". Its §Reproduction table's "Observed" column for E6 states only `value=[]` (JSON), outcome success; the "before worker scheduling"/CTRL-5 phrasing appears only in the doc's "Expected behaviour" and "Fix" (What shipped) prose, describing the shipped code's structure (confirmed at src/runtime/statement-executor.ts:1922-1927, where the `ForIterandKindDefectError` throw precedes the "CTRL-2 width resolution" block) — the doc does not claim this specific test proves the placement. `npx vitest run tests/b0369-control-flow-kind-belts.test.ts` passes 34/34 at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0369" docs/reference/coverage-matrix.md` → 0 hits. This finding does not propose merging, renaming, or deleting the E6 test or any other test in the file — it is confined to the gap between this one test's own name/comment and what its own existing assertion verifies — so the citation carve-out does not bind.
- Coverage-drift check: this finding does not claim any path or behaviour is untested, nor that a new test should be written; it is scoped entirely to an existing test's existing name overclaiming relative to its existing assertion. It is not a bug report either — `assertLoudThrow`'s check is correct for what it verifies, and the underlying implementation currently does place the belt before scheduling (statement-executor.ts:1922-1927); nothing here alleges wrong runtime behaviour.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — assertLoudThrow (tests/b0369-control-flow-kind-belts.test.ts:291-317) records only throw-vs-value and error-framing, no scheduling/iteration proxy, while this same file's sibling "before X" claims are proxy-backed (PT/PNot/PIf/POr's `probe.sent`, PAnd's `parseCalleeCalls`), so E6's title/comment "fires before worker scheduling" claim is unverifiable by its own assertion; belt placement itself is independently confirmed correct at statement-executor.ts:1922-1927, so this is a naming/comment overclaim, not a bug (triage: claude-opus-5)
