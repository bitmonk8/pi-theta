---
id: PTQ-0791
title: execution-status-command.test.ts's B60 test claims "renders nothing" but never observes a render call
lens: D7
status: open
verdict: confirmed
locations:
  - tests/execution-status-command.test.ts:111-121
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# execution-status-command.test.ts's B60 test claims "renders nothing" but never observes a render call

## Observation
The `describe` block and its one `it` are titled around a rendering claim
("still renders nothing" / "no widening"), but the test body constructs the
bus with an empty `sinks: []` array, drives the `/theta-status` handler once,
and then asserts only two state getters — `bus.viewShape()` and
`bus.verbosity()`. No sink is registered to record whether `render` or
`clear` is ever invoked, and no assertion in the body inspects any render
call, a render count, or sink output.

## Evidence
tests/execution-status-command.test.ts:105-121:
```ts
// ---------------------------------------------------------------------------
// B60 — verbosity off ceiling: the command never widens it (asserted at the
// bus level once the command actually drives setViewShape — currently it
// never does, so this reds on the missing state change rather than any
// ceiling violation).
// ---------------------------------------------------------------------------

describe("T-CMD — B60: /theta-status tree under verbosity off still renders nothing", () => {
  it("view shape reaches 'tree' but verbosity stays 'off' (no widening)", async () => {
    const bus: ExecutionStatusBus = createExecutionStatusBus({ clock: new FakeClock(), sinks: [] });
    bus.setVerbosity("off");
    const deps: RegisterThetaStatusCommandDeps = { current: () => bus };
    const { pi, getHandler } = fakePi();
    registerThetaStatusCommand(pi, deps);
    const { ctx } = recordingNotify();
    await getHandler()("tree", ctx);
    expect(bus.viewShape()).toBe("tree");
    expect(bus.verbosity()).toBe("off");
  });
});
```
The full body is shown; there is no third assertion and no sink is passed
that could record a `render`/`clear` call. A reader who followed only the
`describe`/`it` names ("still renders nothing") would expect the test to
attach a recording sink and assert it was never invoked while `verbosity` is
`off`; instead the body checks two unrelated state getters that this file's
own command implementation (`registerThetaStatusCommand`,
src/extension/execution-status/status-command.ts) sets unconditionally,
regardless of verbosity.

## Why this is a problem
The test name and the body verify different things: the name promises a
rendering-suppression observation ("renders nothing"), and the body verifies
only that `setViewShape` was called and that `setVerbosity("off")`'s value
was not further mutated by the command — neither of which touches rendering.
A reader debugging a regression in the EXST-10 "no sink renders under
`verbosity: off`" contract would look at this test, see it green, and
wrongly conclude that contract is covered here, when nothing in the body can
distinguish a bus that renders under `off` from one that does not (both
`sinks: []` states are indistinguishable, and no render-call observable is
asserted either way).

## Suggested direction (non-binding, optional)
None proposed — the fix stage owns whether the name is narrowed to match the
existing state-getter assertions or the body is extended with a recording
sink to match the existing name.

## False-positive check
- Gate-pin carve-out: `execution-status-command.test.ts` does not match
  `*gate*.test.ts` or the named gate/pin-file patterns; no pinned
  count/inventory is at issue.
- Recording-double carve-out: no fake/double records calls here at all — the
  `sinks` array is empty, so there is no negative witness this finding could
  be mistaking for a vacuous assertion; the observation is the absence of any
  render-related recording, not a "never called" claim.
- docs/bugs/ signature search: `grep -rl "renders nothing\|B60" docs/bugs/`
  — no hits; no open bug document pins this test's shape or excuses the
  name/body mismatch as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "execution-status-command" docs/reference/coverage-matrix.md` — no hits;
  this finding proposes no merge, rename, or deletion of the test, only
  observes the current name/body mismatch.
- Verified live: `npx vitest run tests/execution-status-command.test.ts`
  passes all 9 tests, including this one, confirming the mismatch is not
  masking a currently-red assertion.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: excerpt reproduces verbatim at tests/execution-status-command.test.ts:105-121; the `describe` title asserts a render observation ("still renders nothing") but the body constructs the bus with `sinks: []` (:113) and its only expects are `viewShape()`/`verbosity()` state getters (:120-121), so no `StatusSink.render`/`clear` call (types.ts:169-177) can be witnessed even though the bus gates on `#verbosity === "off"` (bus.ts:441/554) and a recording sink would make the claim checkable — D7 misleading-name; both locations under tests/, not a gate file, coverage-matrix cite → 0 hits (reproduced), suite green (9 passed); the filing's docs/bugs "no hits" is slightly wrong (bug 0023 matches "renders nothing" in unrelated transcript prose) but immaterial; NOT a duplicate of resolved PTQ-0453, which covered the `it` title's "verbosity stays 'off'" clause and was fixed by adding the :121 assertion — the `describe` title's render clause was untouched by that fix and remains unverified (triage: claude-fable-5-1)
