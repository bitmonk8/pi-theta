---
id: PTQ-0231
title: b0319's driveLiveTheta asserts `execution` is defined immediately after code that already guarantees it, so the check cannot fail
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:476-514
sites: 1
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0319's driveLiveTheta asserts `execution` is defined immediately after code that already guarantees it, so the check cannot fail

## Observation
`driveLiveTheta`, the shared harness function all seven `it()` cells in
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts call to drive the
production prompt-mode binding, races a `.then(onFulfilled, onRejected)` pair
against a manual virtual-clock pump loop, then — once the promise has
settled — throws immediately if a rejection was recorded, and otherwise calls
`expect(execution, "executeBody must resolve a BodyExecution").toBeDefined()`
before returning `execution!`. Given the shape of the two `.then` callbacks
and `executeBody`'s declared return type, `execution` cannot be `undefined`
at the point this assertion runs.

## Evidence
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:476-488 (the race
that can only leave `execution` or `rejection` set, never neither):
```ts
  let settled = false;
  let execution: BodyExecution | undefined;
  let rejection: unknown;
  const done = executeBody(theta.body, binding.executeDeps).then(
    (value) => {
      execution = value;
      settled = true;
    },
    (error) => {
      rejection = error;
      settled = true;
    },
  );
```

tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:504-514 (the
rejection re-throw, immediately followed by the assertion under review):
```ts
  await done;
  // executeBody must not REJECT — a fail-closed prompt drive surfaces failures
  // as `BodyExecution` values, never throws (cell (E) leans on this). A
  // rejection here is itself the observable and must surface loudly.
  if (rejection !== undefined) {
    throw rejection instanceof Error
      ? rejection
      : new Error(`executeBody rejected with a non-Error: ${JSON.stringify(rejection)}`);
  }
  expect(execution, "executeBody must resolve a BodyExecution").toBeDefined();
  return { execution: execution!, settleQuantum: clock.quanta, session };
```

src/runtime/statement-executor.ts:2415 (the callee's signature — a
non-optional resolution):
```ts
export async function executeBody(body: ThetaBody, deps: ExecuteBodyDeps): Promise<BodyExecution> {
```

## Why this is a problem
The `.then(onFulfilled, onRejected)` pair sets exactly one of `execution` /
`rejection` before setting `settled = true` — JS promise semantics guarantee
the two callbacks are mutually exclusive, and the `while (!settled)` pump
loop above this excerpt cannot exit until one of them has run.
`executeBody` returns `Promise<BodyExecution>` (statement-executor.ts:2415),
a non-optional type, so the fulfilled branch's `execution = value` can never
assign `undefined`. By the time control reaches `expect(execution,
...).toBeDefined()`, the preceding `if (rejection !== undefined) throw ...`
has already returned early on the only other path. So there is no reachable
state in which this `expect` observes `execution === undefined` and fails —
it restates a guarantee the surrounding control flow and `executeBody`'s own
return type already enforce. The very next line's non-null assertion
(`execution!`) shows the author still needed to satisfy the type checker,
but the runtime check on the line before it has no failing input: it is not
a probe of a real observable (AGENTS.md "Assert on real observables"), it is
a restatement of a fact already true whenever it runs.

## Suggested direction (non-binding, optional)
None offered beyond the observation above — the surrounding control flow
already discharges what this line checks.

## False-positive check
- Gate-pin: tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts does
  not match `*gate*.test.ts` or the named kin; not applicable.
- Recording-double: not applicable — `execution`/`rejection` are local
  narrowing variables inside the harness's own promise race, not a fake or a
  MUST-NOT witness the negative-witness carve-out covers.
- docs/bugs/ signature search: docs/bugs/0319-prompt-mode-bidirectional-ctx-abort-unwired.md
  — Status "fixed (0.339.0)"; `npx vitest run
  tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts` passes (7/7) at
  HEAD, so this is not a documented correct-reason red, and the bug document
  does not mention this line (its "What shipped" note names only the file as
  its witness).
- coverage-matrix/bug-doc citation search: `grep -n
  "b0319-prompt-bidirectional-ctx-abort-witness" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file or
  any `it()`/`describe()` — it is scoped to one internal assertion inside a
  shared harness function all seven cells call — so no citation is affected.
- Coverage check: this is not a claim that a path is untested; every cell
  that calls `driveLiveTheta` already asserts on `execution.outcome` (and, in
  cell (D), on `settleQuantum`) after this function returns — those are the
  real observables this finding leaves untouched.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified: excerpts/lines match (476-514, 2415); `.then(onFulfilled,onRejected)` settles exactly one of execution/rejection; executeBody's switch (statement-executor.ts:2415-2441) exhaustively returns BodyExecution for every `flow.kind` arm with no implicit-undefined fallthrough, and no throw/reject-with-bare-`undefined` exists anywhere in src/ to slip past the preceding `rejection !== undefined` guard, so `execution` is always set by this line; docs/bugs/0319 is fixed and doesn't cite this line, coverage-matrix has 0 hits, all 7 cells assert `execution.outcome` downstream — no carve-out applies, not a duplicate of PTQ-0217 (different file/class) (triage: claude-opus-5)
