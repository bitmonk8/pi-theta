---
id: PTQ-0253
title: checkpoint-seam.test.ts's "independent instances, each functional" test only calls the one CheckpointKind that never reads the shared clock
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/checkpoint-seam.test.ts:196-206
  - src/seams/production-checkpoint.ts:27-39
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# checkpoint-seam.test.ts's "independent instances, each functional" test only calls the one CheckpointKind that never reads the shared clock

## Observation
tests/checkpoint-seam.test.ts:197 names its test "PIC-10: two checkpoints from
the same factory clock are independent instances, each functional", inside a
describe block titled "ProductionCheckpoint is per-invocation (PIC-10)". Both
`parent` and `child` are built from the identical `clock` value. The only
method either instance calls is `before("query", SITE)`. In the production
`before` implementation (src/seams/production-checkpoint.ts:27-39), the
`"query"` kind (like `"tool-call"`, `"invoke"`, `"binder-call"`) returns
`Promise.resolve()` unconditionally and never reads `this.#clock`; only the
`"loop-iter"` kind schedules through `this.#clock.setTimeout`. So the test
never invokes the one branch through which a shared clock could actually
connect two `ProductionCheckpoint` instances.

## Evidence
tests/checkpoint-seam.test.ts:196-206 (the full test):
```ts
describe("V8a-T — ProductionCheckpoint is per-invocation (PIC-10)", () => {
  it("PIC-10: two checkpoints from the same factory clock are independent instances, each functional", async () => {
    const clock = new FakeClock();
    const parent = new ProductionCheckpoint(clock);
    const child = new ProductionCheckpoint(clock);
    expect(parent).not.toBe(child);

    // A child's microtask checkpoint resolves without disturbing the parent.
    await child.before("query", SITE);
    await parent.before("query", SITE);
  });
});
```

src/seams/production-checkpoint.ts:27-39 (`before`, the only method the test
calls; `"query"` is the branch actually exercised and it is the one that never
touches `#clock`):
```ts
  before(kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    if (kind === "loop-iter") {
      // One macrotask turn, scheduled through the injected Clock seam's
      // setTimeout(fn, 0) (PIC-12 timer surface) — never a bare global timer —
      // so a Pi-dispatched abort can land before the next signal-check.
      return new Promise<void>((resolve) => {
        this.#clock.setTimeout(resolve, 0);
      });
    }
    // query / tool-call / invoke / binder-call: resolve on the microtask queue;
    // these checkpoints precede real async I/O that already yields the loop.
    return Promise.resolve();
  }
```

## Why this is a problem
The test's title deliberately foregrounds the shared resource ("from the same
factory clock") and its inline comment states the check proves a child
checkpoint "resolves without disturbing the parent." A reader following that
name and comment would conclude the test demonstrates that two
`ProductionCheckpoint` instances built over one shared `Clock` do not
interfere with each other's clock-scheduled state. But the only kind either
instance is given, `"query"`, takes the branch (lines 36-38 above) that never
reads or schedules anything on `#clock` — it is indistinguishable, at the
clock level, from calling a function that ignores its constructor argument
entirely. The one branch that does consult the shared clock, `"loop-iter"`
(lines 28-34), is never invoked by either `parent` or `child` in this test. A
change that entangled two instances' `loop-iter` scheduling when they share a
clock — for example, one instance's pending timer settling the other's
`before("loop-iter", …)` — would read this test as passing unchanged, because
this test never calls `before("loop-iter", …)` on either instance. The
remaining assertion, `expect(parent).not.toBe(child)`, holds for any two
separately-constructed objects and adds nothing that depends on the shared
`clock` argument either.

## Suggested direction (non-binding, optional)
Noting only what is already in this same file as an established idiom: lines
54-82 and 111-120 build a `RecordingClock` that wraps a `FakeClock` and records
every `setTimeout` call, which is how this file elsewhere observes what a
`"loop-iter"` `before()` call actually does to a clock.

## False-positive check
- Gate-pin check: tests/checkpoint-seam.test.ts does not match `*gate*.test.ts`
  or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate) — this is a `V8a-T` unit-test file for
  `ProductionCheckpoint`, not a census/pin gate, so the pinned-count carve-out
  does not apply.
- Recording-double check: the cited test uses no recording double and asserts
  no "never called" witness; `expect(parent).not.toBe(child)` is a bare
  reference-identity check on two constructor results, not a MUST-NOT witness
  over a fake that records calls, so the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rl "ProductionCheckpoint" docs/bugs/` and
  `grep -rl "checkpoint-seam" docs/bugs/` both return no hits. `npx vitest run
  tests/checkpoint-seam.test.ts` passes 13/13 at HEAD, so this is not a
  documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "checkpoint-seam"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -rn
  "checkpoint-seam.test.ts" docs/` → one hit, docs/rfcs/0010-live-execution-visibility.md:592,
  which names this file (together with tests/checkpoint-granularity.test.ts)
  as one of the "pinned yield-semantics suites" a proposed decorator change
  must leave "green unmodified." This finding does not propose to merge,
  rename, or delete this test or file — it is confined to the gap between this
  one test's own name/comment and what its own existing assertions exercise —
  so that citation is not crossed.
- Coverage-drift check: the claim is not that clock-sharing interaction is
  untested in general, nor that a new test should be added; the test exists,
  runs, and passes today, and the claim is confined to this one existing
  test's own name/comment overstating what its own existing assertions check.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim (test:196-206 vs. production-checkpoint.ts:27-39): the test's only exercised kind, "query", is proven to never read `#clock` (only "loop-iter" does), yet the title/comment and its parent/child naming echo PIC-10's shared-clock "a parent's before(...) is not observed by the child" guarantee (host-interfaces-services.md), which this test's assertions structurally cannot exercise or catch a regression in; docs/bugs (0 hits), coverage-matrix (0 hits) and gate/negative-witness carve-outs all reproduce as claimed, 13/13 passes reproduced, no duplicate exists (triage: claude-opus-5)
