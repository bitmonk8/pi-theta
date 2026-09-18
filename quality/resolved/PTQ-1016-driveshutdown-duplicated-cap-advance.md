---
id: PTQ-1016
title: driveShutdown's cap-advance-then-await sequence is redeclared identically in session-shutdown.test.ts and session-swap-tripwire.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/session-shutdown.test.ts:165-172
  - tests/session-swap-tripwire.test.ts:122-129
sites: 2
fix_scope: module
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# driveShutdown's cap-advance-then-await sequence is redeclared identically in session-shutdown.test.ts and session-swap-tripwire.test.ts

## Observation
Both `tests/session-shutdown.test.ts` and `tests/session-swap-tripwire.test.ts` declare a local `async function driveShutdown(event, harness)` that calls `runSessionShutdown(event, harness.deps)`, advances the harness's `FakeClock` past the sub-step-3 await cap, and awaits the result. Both functions exist to drive the same production entry point (`runSessionShutdown`) past the same bounded-await cap over the same `SessionShutdownDeps.clock` field, differing only in whether the cap value is read off the exported `SHUTDOWN_AWAIT_CAP_MS` constant or restated as the literal `2000`.

## Evidence

`tests/session-shutdown.test.ts:165-172` (re-read immediately before filing):
```ts
/** Drive a teardown that must complete even when sub-step 3 never settles. */
async function driveShutdown(
  event: SessionShutdownEventLike,
  harness: Harness,
): Promise<void> {
  const done = runSessionShutdown(event, harness.deps);
  // Fire the bounded-await cap so a never-settling sub-step 3 does not hang.
  harness.clock.advance(SHUTDOWN_AWAIT_CAP_MS + 3);
  await done;
}
```

`tests/session-swap-tripwire.test.ts:122-129` (re-read immediately before filing):
```ts
/** Drive a teardown to completion even when sub-step 3 never settles. */
async function driveShutdown(
  event: SessionShutdownEventLike,
  harness: ShutdownHarness,
): Promise<void> {
  const done = runSessionShutdown(event, harness.deps);
  harness.clock.advance(2000 + 3);
  await done;
}
```

Both bodies are identical statement-for-statement: call `runSessionShutdown`
with `(event, harness.deps)`, capture the pending promise, advance the
harness's clock by "the cap plus 3", then `await` the captured promise. Both
doc comments describe the identical purpose ("a never-settling sub-step 3"
completing anyway). The only textual difference is `SHUTDOWN_AWAIT_CAP_MS`
(imported by `session-shutdown.test.ts` from `../src/extension/session-shutdown`)
versus the bare literal `2000` (`session-swap-tripwire.test.ts` does not
import `SHUTDOWN_AWAIT_CAP_MS` at all).

Exact search: `grep -n "async function driveShutdown" tests/session-shutdown.test.ts tests/session-swap-tripwire.test.ts` → exactly these two declarations; no third file in the review scope declares this function.

## Why this is a problem
`tests/helpers/session-shutdown-harness.ts` already houses this fixture family's shared pieces (`makeEntry`, `watcherSpy`, `signalSpy`, `sinkSpy`, `healthyInventory`, `shutdownDeps`, `eventWith`) and both files already import several of them, but the cap-advance-then-await sequence that both files' own tests depend on to reach sub-step 4/5 assertions is retyped in each file rather than added to that same module. `session-swap-tripwire.test.ts`'s copy restates the cap as the bare literal `2000` instead of importing `SHUTDOWN_AWAIT_CAP_MS`, so a future change to the exported cap constant would silently desynchronise this copy from the constant it is standing in for.

## Suggested direction (non-binding, optional)
A single `driveShutdown(event, harness)` exported from `tests/helpers/session-shutdown-harness.ts`, parameterised over the `{ deps, clock }` shape both `Harness`/`ShutdownHarness` already share and reading the cap off the exported `SHUTDOWN_AWAIT_CAP_MS`, is the shape both files' otherwise-identical local copies already point toward.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin; the cited lines are a test-driving helper function, not a pinned count or inventory assertion.
- Recording-double check: `driveShutdown` drives the real production `runSessionShutdown` over a `FakeClock`; it is not a recording double backing a "never called" MUST-NOT witness. The carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "driveShutdown" docs/bugs/` → 0 hits; no documented correct-reason red cites this function.
- coverage-matrix/bug-doc citation search: `grep -n "session-shutdown.test.ts\|session-swap-tripwire.test.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block — only that the shared driving sequence could live in the already-partially-shared helper module both files import from.
- Coverage-drift check: the claim is about a repeated helper-function DEFINITION across two existing, passing test files; it makes no claim that any behaviour or path is untested.
- Sibling-finding check: resolved `PTQ-0699` (`SessionShutdownDeps`-building harness across seven files) and resolved `PTQ-0856` (`makeEntry` local redeclaration in `session-swap-tripwire.test.ts`) both target different functions in this fixture family (`makeHarness`/`shutdownDeps` object construction, and a single-purpose `makeEntry`); neither cites `driveShutdown` or these line ranges.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — both excerpts reproduce verbatim at tests/session-shutdown.test.ts:165-172 and tests/session-swap-tripwire.test.ts:122-129; `grep -rn "function driveShutdown" tests/ src/ extensions/ tools/` → exactly these two declarations (the hot-reload-stale-ctx hit is the differently-named `driveShutdownDuringParkedCompose`), so `sites: 2` is accurate for the helper-declaration claim; both copies are live (22 / 2 call sites) and both files are green (49/49); the bodies are the same three statements differing only in `SHUTDOWN_AWAIT_CAP_MS` vs the bare `2000` — the constant is `2000` at src/extension/capability-probe.ts:106 (re-exported via session-shutdown.ts:33), the tripwire file already imports values from `../src/extension/session-shutdown` yet never imports the constant, and nothing (no typecheck, no spec-cited vector) catches the literal desyncing if the cap grows, so the drift surface is real and unlike the type-enforced `config()` rejection; tests/helpers/session-shutdown-harness.ts already imports the `SessionShutdownDeps`/`SessionShutdownEventLike` types from the same module and both `Harness`/`ShutdownHarness` structurally satisfy `{ deps, clock }`, so the fold is a mechanical dedupe; docs/bugs (0), coverage-matrix (0) reproduce; disjoint from resolved PTQ-0509/0576/0699 (deps builders), PTQ-0856 (`makeEntry`) and intake d7-08 (`sinkSpy`); note for the fixer: the identical inline sequence at tests/reload-teardown-quiesce.test.ts:398-401 is an uncited third adoption site for the shared helper (triage: claude-fable-5-1)
