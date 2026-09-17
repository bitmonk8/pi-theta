---
id: PTQ-0595
title: the executorHook vi.mock("../src/runtime/statement-executor") hoisting block is redeclared byte-identical in four test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/cancelled-by-session-shutdown-note.test.ts:65-80
  - tests/forwarding-detach-wiring.test.ts:36-51
  - tests/post-deadline-dual-surface.test.ts:51-66
  - tests/subagent-drive-teardown.test.ts:31-46
sites: 4
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# the executorHook vi.mock("../src/runtime/statement-executor") hoisting block is redeclared byte-identical in four test files

## Observation
`tests/cancelled-by-session-shutdown-note.test.ts`,
`tests/forwarding-detach-wiring.test.ts`,
`tests/post-deadline-dual-surface.test.ts`, and
`tests/subagent-drive-teardown.test.ts` each declare an identical
`executorHook = vi.hoisted(...)` object plus an identical
`vi.mock("../src/runtime/statement-executor", ...)` call that replaces
`executeBody` with a hook-dispatching stub throwing `"executorHook.impl not
set by the test"` when no test has set it, and each pairs it with an
identical `afterEach(() => { executorHook.impl = undefined; })` teardown. The
file under review's own comment names this pattern's origin explicitly:
"SPAN staging (mirrors `tests/active-invocation-wiring.test.ts`)" — a fifth,
near-identical (`impl`-default-to-real-`executeBody`) variant, and a sixth
file, `tests/active-invocation-binder-window.test.ts`, uses the same
`vi.hoisted` + `vi.mock("../src/runtime/statement-executor", ...)` shape with
a `calls` counter instead of an `impl` slot.

## Evidence
`tests/cancelled-by-session-shutdown-note.test.ts:65-80`:
```ts
const executorHook = vi.hoisted(() => ({
  impl: undefined as
    | ((...args: readonly unknown[]) => Promise<unknown>)
    | undefined,
}));
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/runtime/statement-executor")>();
  return {
    ...actual,
    executeBody: (...args: readonly unknown[]): Promise<unknown> => {
      if (executorHook.impl === undefined) {
        throw new Error("executorHook.impl not set by the test");
      }
      return executorHook.impl(...args);
    },
```

`tests/forwarding-detach-wiring.test.ts:36-51` (identical):
```ts
const executorHook = vi.hoisted(() => ({
  impl: undefined as
    | ((...args: readonly unknown[]) => Promise<unknown>)
    | undefined,
}));
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/runtime/statement-executor")>();
  return {
    ...actual,
    executeBody: (...args: readonly unknown[]): Promise<unknown> => {
      if (executorHook.impl === undefined) {
        throw new Error("executorHook.impl not set by the test");
      }
      return executorHook.impl(...args);
    },
```

`tests/post-deadline-dual-surface.test.ts:51-66` (identical):
```ts
const executorHook = vi.hoisted(() => ({
  impl: undefined as
    | ((...args: readonly unknown[]) => Promise<unknown>)
    | undefined,
}));
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/runtime/statement-executor")>();
  return {
    ...actual,
    executeBody: (...args: readonly unknown[]): Promise<unknown> => {
      if (executorHook.impl === undefined) {
        throw new Error("executorHook.impl not set by the test");
      }
      return executorHook.impl(...args);
    },
```

`tests/subagent-drive-teardown.test.ts:31-46` (identical):
```ts
const executorHook = vi.hoisted(() => ({
  impl: undefined as
    | ((...args: readonly unknown[]) => Promise<unknown>)
    | undefined,
}));
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/runtime/statement-executor")>();
  return {
    ...actual,
    executeBody: (...args: readonly unknown[]): Promise<unknown> => {
      if (executorHook.impl === undefined) {
        throw new Error("executorHook.impl not set by the test");
      }
      return executorHook.impl(...args);
    },
```

Each file also pairs the block with an identical one-line teardown —
`tests/cancelled-by-session-shutdown-note.test.ts:385`,
`tests/forwarding-detach-wiring.test.ts:85`,
`tests/post-deadline-dual-surface.test.ts:234`,
`tests/subagent-drive-teardown.test.ts:180` — each reading
`executorHook.impl = undefined;` inside its own `afterEach(() => { ... })`.
Search: `grep -rln "const executorHook = vi.hoisted" tests/*.test.ts` returns
these four files plus `tests/active-invocation-binder-window.test.ts` (a
`calls`-counter variant) and `tests/b0476-panic-site-and-frames.test.ts` (an
`impl ?? actual.executeBody` fallback variant) — six files total sharing the
same `vi.hoisted` + `vi.mock("../src/runtime/statement-executor", ...)`
shape, of which the four listed above are exact duplicates of each other.
`tests/helpers/` carries no module wrapping this mock (`grep -rl "vi.hoisted"
tests/helpers/` returns nothing).

## Why this is a problem
The identical 16-line `vi.hoisted`/`vi.mock` pair plus its 1-line teardown is
authored four separate times rather than once. Each of the four files
independently owns the exact same "park `executeBody` behind an
externally-set hook, throw if unset" contract, including the identical throw
message — the kind of scaffolding a shared module exists to hold once.

## Suggested direction (non-binding, optional)
A shared "parked statement-executor hook" module under `tests/helpers/`
naming this `executorHook`/`vi.mock` pair once would let these four (and the
two near-variant) files import a single declaration instead of four (or six)
independently authored ones; `vi.mock`'s hoisting semantics are per
call-site, so any such module would need to document how each importing file
still issues its own top-level `vi.mock(...)` call against the shared hook
object — a mechanical detail for the fix stage, not this observation.

## False-positive check
- Recording-double carve-out: `executorHook` parks a scripted implementation
  slot rather than recording calls for a MUST-NOT witness; the negative-
  witness recording-double carve-out does not apply.
- Gate-pin carve-out: none of the four files match `*gate*.test.ts` or the
  named gate kin.
- docs/bugs/ signature search: this finding does not allege a red or skipped
  test; all four files use the mock as passing-test scaffolding, so no
  correct-reason-red check applies.
- coverage-matrix/bug-doc citation search: `grep -rn "executorHook"
  docs/reference/coverage-matrix.md docs/bugs/` — no hits; no test is cited
  by name for this block, so no merge/rename/delete proposal is implicated
  (and none is made here).
- Coverage drift check: this finding does not claim any behaviour is
  untested; it is scoped to the duplicated mock-hoisting scaffolding, not to
  the four files' distinct test bodies or fixtures.
- Only `tests/cancelled-by-session-shutdown-note.test.ts` is in this wave's
  briefed scope; the other three (and the two near-variant) sites are cited
  as instances of the same repeated shape per the evidence rule requiring
  every counted site to be cited, not as separate findings against
  out-of-scope files.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: the four executorHook vi.hoisted + vi.mock("../src/runtime/statement-executor") blocks reproduce at the cited lines and diff byte-identical pairwise (18 lines each), the four afterEach `executorHook.impl = undefined` teardowns exist at :385/:85/:234/:180, tests/helpers/ has no vi.hoisted module, and the shutdown-note file's own comment names active-invocation-wiring.test.ts as the copied origin; D7 boilerplate-duplication in tests/ only, no gate/recording-double/skip carve-out applies, and no existing row covers this block (PTQ-0403 covers the dispatch-side checkpoint/builder scaffolding in the two active-invocation files, PTQ-0244/0301/0344 the SEAM_NOOP invoke-seam scaffold). Minor inaccuracies noted, non-blocking: the hoisted grep returns 7 files not 6 (active-invocation-wiring.test.ts is nonetheless named in the Observation) and docs/bugs/0073:99 has one prose executorHook snippet hit, not a witness-list citation implicating a merge/rename/delete (triage: claude-fable-5-1)
