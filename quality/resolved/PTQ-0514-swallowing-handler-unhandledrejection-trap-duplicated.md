---
id: PTQ-0514
title: The unhandledRejection-trap-plus-settleAndObserve harness is redeclared byte-for-byte in five swallowing-handler/cancellation test files, including the in-scope invoke-swallowing-handler.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/invoke-swallowing-handler.test.ts:67-95
  - tests/cancellation-core.test.ts:332-359
  - tests/production-cancellation-wiring.test.ts:279-299
  - tests/query-swallowing-handler.test.ts:71-99
  - tests/tool-calls-swallowing-handler.test.ts:71-99
  - tests/session-control-adapters.test.ts:192-202
sites: 6
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# The unhandledRejection-trap-plus-settleAndObserve harness is redeclared byte-for-byte in five swallowing-handler/cancellation test files, including the in-scope invoke-swallowing-handler.test.ts

## Observation
tests/invoke-swallowing-handler.test.ts declares module-scope `const unhandled:
unknown[]`, `function onUnhandled(reason)`, a `beforeEach`/`afterEach` pair that
installs and removes a Node `process.on("unhandledRejection", onUnhandled)`
listener, and an `async function settleAndObserve()` that drains eight
microtask turns, takes one macrotask turn via `setTimeout`, then drains eight
more microtask turns. The identical five-piece sequence (same variable name,
same function name, same doc comments, same loop bounds, same
`setTimeout(resolve, 0)` macrotask turn) is independently redeclared in four
other test files, and a four-piece subset (everything but
`settleAndObserve`) is redeclared in a fifth. No `tests/helpers/` module
exports any of this.

## Evidence

tests/invoke-swallowing-handler.test.ts:67-95 (re-read immediately before filing):
```ts
/** Records every Node `unhandledRejection` process event for the active test. */
const unhandled: unknown[] = [];
function onUnhandled(reason: unknown): void {
  unhandled.push(reason);
}

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

/**
 * Drain microtasks and take a macrotask turn so a would-be `unhandledRejection`
 * (raised by Node on the next macrotask after the microtask queue empties for a
 * rejected, handler-less Promise) is observed if it fires.
 */
async function settleAndObserve(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}
```

tests/cancellation-core.test.ts:332-359 — the same five pieces verbatim (comments omitted at the trap, present at the drain):
```ts
const unhandled: unknown[] = [];
function onUnhandled(reason: unknown): void {
  unhandled.push(reason);
}

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

/**
 * Drain microtasks and take a macrotask turn so a would-be `unhandledRejection`
 * (raised by Node on the next macrotask after the microtask queue empties for a
 * rejected, handler-less Promise) is observed if it fires.
 */
async function settleAndObserve(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}
```

tests/production-cancellation-wiring.test.ts:279-299 — same five pieces, comments dropped:
```ts
const unhandled: unknown[] = [];
function onUnhandled(reason: unknown): void {
  unhandled.push(reason);
}
beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
});
afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

async function settleAndObserve(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}
```

tests/query-swallowing-handler.test.ts:71-99 — byte-identical to the
invoke-swallowing-handler.test.ts excerpt above, including both doc comments:
```ts
/** Records every Node `unhandledRejection` process event for the active test. */
const unhandled: unknown[] = [];
function onUnhandled(reason: unknown): void {
  unhandled.push(reason);
}

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

/**
 * Drain microtasks and take a macrotask turn so a would-be `unhandledRejection`
 * (raised by Node on the next macrotask after the microtask queue empties for a
 * rejected, handler-less Promise) is observed if it fires.
 */
async function settleAndObserve(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}
```

tests/tool-calls-swallowing-handler.test.ts:71-99 — byte-identical to the same
excerpt again.

tests/session-control-adapters.test.ts:192-202 — the four-piece subset (trap
only, indented one level inside a `describe`, no `settleAndObserve`):
```ts
  const unhandled: unknown[] = [];
  function onUnhandled(reason: unknown): void {
    unhandled.push(reason);
  }
  beforeEach(() => {
    unhandled.length = 0;
    process.on("unhandledRejection", onUnhandled);
  });
  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
  });
```

Search performed: `grep -rln "process.on(\"unhandledRejection\"" tests/` → exactly these 6 files; `grep -rl "settleAndObserve" tests/` → the same 5 files minus session-control-adapters.test.ts.

## Why this is a problem
The same "trap Node's unhandledRejection, expose an array to assert on, drain
the microtask/macrotask queue to give it a chance to fire" harness is typed a
sixth-of-a-dozen-lines-at-a-time in six independent files rather than declared
once. `tests/helpers/` holds no module exporting any of these five pieces
(`ls tests/helpers/` lists 37 files, none named for unhandled-rejection
trapping or promise-settlement draining), so every one of the six files is an
independent hand-copy rather than an import from an existing canonical home.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting the trap (`installUnhandledRejectionTrap()`
returning the `unhandled` array plus a teardown, wired through
`beforeEach`/`afterEach` at the call site) and `settleAndObserve()` is the
natural home six independent copies already point toward.

## False-positive check
- Gate-pin check: none of the six files matches `*gate*.test.ts` or the named
  gate kin; the cited lines are setup/teardown scaffolding, not a pinned count
  or inventory.
- Recording-double check: the `unhandled` array IS a legitimate recording
  double backing a "no Node `unhandledRejection` fired" MUST-NOT witness (the
  carve-out named in this brief) — that is not being challenged here. This
  finding is about the SETUP/TEARDOWN SEQUENCE that builds and wires the
  double being independently retyped six times, not about the validity of the
  `expect(unhandled).toEqual([])` assertion itself.
- docs/bugs/ signature search: `grep -rln "invoke-swallowing-handler\|cancellation-core.test\|production-cancellation-wiring\|query-swallowing-handler\|tool-calls-swallowing-handler\|session-control-adapters" docs/bugs/*.md` → docs/bugs/0012 and docs/bugs/0319 name two of these files as witnesses; neither documents the harness DUPLICATION as a correct-reason red, and this finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()`.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-swallowing-handler\|cancellation-core.test\|production-cancellation-wiring\|query-swallowing-handler\|tool-calls-swallowing-handler\|session-control-adapters" docs/reference/coverage-matrix.md` → 0 hits.
- Overlap check: `grep -rli "swallowing.handler\|settleAndObserve\|unhandledRejection" quality/intake/*.md quality/resolved/*.md` (excluding this file) → only two resolved PTQ files about stale narration, unrelated to this harness; no prior finding names this duplication.
- Coverage-drift check: this claim is about a harness declaration repeated across files that already exist and already pass; it makes no claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all six excerpts reproduce at the cited lines (invoke-swallowing-handler:67-95, query-swallowing-handler:71-99 and tool-calls-swallowing-handler:71-99 byte-identical incl. both doc comments; cancellation-core:332-359 and production-cancellation-wiring:279-299 identical modulo comments; session-control-adapters:192-202 the trap-only four-piece subset), `grep -rln 'process.on("unhandledRejection"' tests/` → exactly these 6 files and `grep -rl settleAndObserve tests/` → the 5 minus session-control-adapters, no tests/helpers/ module exports either piece (nearest is fixture-dispatch-harness.ts:181 `tick`, a single setTimeout(0) with different shape); D7 boilerplate-duplication class, all locations under tests/, no gate file, the recording double itself is not challenged, bug docs 0012/0319 name two files as witness suites but no merge/rename/delete is proposed, coverage-matrix 0 hits; not tracked elsewhere (PTQ-0388 is the b0312/b0339 `settle(cond)` poll loop; the four sibling intake candidates in this wave cite different harnesses) — fix is a mechanical hoist to a tests/helpers module (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
