---
id: PTQ-0541
title: "T-BUS B19's test name claims unsettled lanes are left unsettled but the body never reads lane state"
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/execution-status-bus.test.ts:429-441
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# T-BUS B19's test name claims unsettled lanes are left unsettled but the body never reads lane state

## Observation
B19's `it` title asserts two things: that `invocationEnded` "never throws"
mid-fan-out, and that "the node ends without settling the remainder"
(i.e. the two unclaimed/unsettled lanes are not force-settled by the cancel).
The body drives `claim(0)`, `claim(1)`, calls `bus.invocationEnded("inv-1")`,
advances the clock past the done-linger window, and asserts only
`not.toThrow()` twice (on `invocationEnded` and on `snapshot()`). It never
reads `bus.snapshot()`'s `lanes` field (as the neighbouring B14-B17 tests in
the same file do) to check the running/done/err counts for lanes 2 and 3.

## Evidence
tests/execution-status-bus.test.ts:429-441
```ts
  it("B19: a whole-theta cancel mid-fan-out (invocationEnded with unsettled lanes) never throws and the node ends without settling the remainder", () => {
    const clock = new FakeClock();
    const bus = makeBus([recordingSink()], clock);

    bus.invocationStarted("inv-1", "quality-loop");
    const handle = bus.openLaneSet("inv-1", 4, 4);
    handle.claim(0);
    handle.claim(1);
    // Cancel mid-fan-out: lanes 2 and 3 are never claimed nor settled.
    expect(() => bus.invocationEnded("inv-1")).not.toThrow();
    clock.advance(STATUS_TICK_MS + DONE_LINGER_MS);
    expect(() => bus.snapshot()).not.toThrow();
  });
```

Compare the sibling lane tests in the same file that DO read `lanes` off the
snapshot after driving state, e.g. B16 (`tests/execution-status-bus.test.ts:400-411`):
```ts
    const lanes = bus.snapshot().nodes.find((n) => n.invocationId === "inv-1")?.lanes;
    expect(lanes?.done).toBe(1);
    expect(lanes?.err).toBe(1);
    expect(lanes?.running).toHaveLength(0);
```
B19's own final `expect(() => bus.snapshot()).not.toThrow())` discards the
return value entirely — the snapshot's `lanes` are never inspected.

## Why this is a problem
A reader following the title "...the node ends without settling the
remainder" would conclude the test pins that lanes 2 and 3 stay unsettled (not
silently force-marked `done`/`err`) after a mid-fan-out cancel. Mechanically,
the only two assertions in the body are `not.toThrow()` calls; neither reads
`bus.snapshot().nodes[...].lanes`, so nothing in the test would fail if the
implementation force-settled the remaining lanes, left the node with a
`total` mismatch, or dropped the `lanes` field altogether after
`invocationEnded` — every one of those would still satisfy "does not throw".

## Suggested direction (non-binding, optional)
The test could read `bus.snapshot().nodes.find(...)?.lanes` after
`invocationEnded` (and again after the node evicts, mirroring B5's linger
check) and assert lanes 2 and 3 are absent from `running`/`done`/`err`, the
same pattern already used by the adjacent B15-B17 tests in this file.

## False-positive check
- Gate-pin carve-out: filename is `execution-status-bus.test.ts`, does not match `*gate*.test.ts` or any listed gate kin — not applicable.
- Recording-double carve-out: `recordingSink()` here is used only to satisfy the bus constructor's `sinks` parameter; it plays no role in the missing lane-state assertion, so this is not a negative-witness case.
- docs/bugs/ signature search: `grep -rn "B19" docs/bugs/` found no report naming this test's failure signature as a documented correct-reason red; the suite runs green at HEAD.
- coverage-matrix/bug-doc citation search: `grep -rn "execution-status-bus.test.ts" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits — this test is not pinned by name in either location.
- Coverage drift check: this finding does not argue lane-settlement-on-cancel is untested in general; it is scoped to this one test's own name-vs-body mismatch.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: excerpt matches tests/execution-status-bus.test.ts:429-441 verbatim; the body's only assertions are two `not.toThrow()` wrappers (and bus.ts:210-232 wraps invocationEnded entirely in an EXST-9 broad catch, so that clause cannot fail by construction), while the title's second clause "the node ends without settling the remainder" has no corresponding read of `snapshot().nodes`/`.lanes` or eviction check (contrast B5:276-293 and B14-B17:367-427, which do read node/lane state); the implementation comment at bus.ts:225 ("Unsettled lanes are dropped with it") confirms this is a real behaviour the title asserts but the body leaves unpinned — D7 misleading-name class, in tests/ only, no gate/recording-double/bug-doc carve-out applies (re-ran `grep -rn B19 docs/bugs/` and the coverage-matrix/bug-doc citation grep: zero hits; suite green 25/25), not tracked by any existing PTQ (PTQ-0406 is D2 on the LaneState type; sibling intake d7-01 is B60) (triage: claude-fable-5-1)
