---
id: PTQ-1371
title: double-session-start-supersession.test.ts redeclares the canonical sleep helper it could import from tests/helpers/fake-clock.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/double-session-start-supersession.test.ts:81-83
  - tests/helpers/fake-clock.ts:107-110
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# double-session-start-supersession.test.ts redeclares the canonical sleep helper it could import from tests/helpers/fake-clock.ts

## Observation
`tests/double-session-start-supersession.test.ts` declares a local `function sleep(ms: number): Promise<void>` (lines 81-83) that is byte-for-byte identical to the exported `sleep` in `tests/helpers/fake-clock.ts` (lines 107-110). The file already imports `waitFor` from `./helpers/fake-file-watcher` and several symbols from `./helpers/watch-arming-harness`, so it is already reaching into the tests/helpers/ tree for harness pieces, but re-derives this one-line function itself instead of importing it from `fake-clock.ts`.

## Evidence
`tests/double-session-start-supersession.test.ts:81-83` (re-read immediately before filing):
```ts
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

`tests/helpers/fake-clock.ts:107-110` (the canonical export, identical body):
```ts
/** Wait on a real timer while asynchronous work settles around a fake clock. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Pattern-wide search: `grep -rln "^function sleep(ms" tests/*.ts` returns exactly one hit — `tests/double-session-start-supersession.test.ts` — confirming this is the sole test-file-level redeclaration of the helper's exact signature and body across the top-level `tests/` directory.

## Why this is a problem
`fake-clock.ts`'s own doc comment states the function's purpose ("Wait on a real timer while asynchronous work settles around a fake clock") in a file this test already depends on transitively (its harness, `watch-arming-harness.ts`, drives a `FakeClock`, and the test itself calls `b.clock.advance(...)`), so the helper is already in this test's dependency graph under a different import path. The local copy is a second, independently maintained definition of the same one-line utility.

## Suggested direction (non-binding, optional)
The local `sleep` declaration could be replaced by importing `sleep` from `./helpers/fake-clock`, alongside the other harness imports the file already draws from `tests/helpers/`.

## False-positive check
Gate-pin check: `double-session-start-supersession.test.ts` does not match `*gate*.test.ts` or the named gate kin — not applicable. Recording-double check: `sleep` is a plain timing utility, not a recording double or MUST-NOT witness — not applicable. docs/bugs/ signature search: `grep -rl "double-session-start-supersession" docs/bugs/` returns only `docs/bugs/0021-double-session-start-leaks-armed-watcher.md`, which documents the bug this file's RED/GREEN tests witness but says nothing about the `sleep` helper's construction — no documented correct-reason red covers this duplication. coverage-matrix/bug-doc citation search: `grep -rn "double-session-start-supersession" docs/reference/coverage-matrix.md docs/bugs/0021-double-session-start-leaks-armed-watcher.md` shows the test file is cited by name in the bug document's witness context but only as the suite that exercises the bug, not as pinning the `sleep` helper's shape; no rename/merge/delete of the cited test is proposed here. This does not drift into coverage: the claim is that a one-line utility already available as an import is redeclared locally, not that any test or assertion is missing.

## Triage
verdict: confirmed — both excerpts reproduce verbatim (tests/double-session-start-supersession.test.ts:81-83 local `sleep`, used at :219 and :279; tests/helpers/fake-clock.ts:107-110 exported `sleep`, identical body), the stated search `grep -rln "^function sleep(ms" tests/*.ts` returns exactly the one top-level hit, the canonical export is live (imported by sibling supersession tests tests/supersession-detach-throw-containment.test.ts:164 and tests/supersession-inflight-rebuild-quiesce.test.ts:288 as `{ RecordingFakeClock, sleep } from "./helpers/fake-clock"`), the file already imports from tests/helpers/ so the import path is available, no gate/recording-double/bug-doc carve-out applies, and no open PTQ tracks this helper (PTQ-0388 settle-poll and PTQ-0964 waitFor are different helpers; the tests/live/** copies are filed separately as qw20260922211400-d7-03/-05) — D7 boilerplate-duplication, mechanical fix (triage: claude-fable-5-1)
