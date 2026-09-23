---
id: PTQ-1400
title: tests/live/double-session-start-live.test.ts redeclares the canonical `sleep` helper already exported by tests/helpers/fake-clock.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/double-session-start-live.test.ts:170-172
  - tests/helpers/fake-clock.ts:107-110
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# tests/live/double-session-start-live.test.ts redeclares the canonical `sleep` helper already exported by tests/helpers/fake-clock.ts

## Observation
`tests/live/double-session-start-live.test.ts` declares a private module-scope `function sleep(ms: number): Promise<void>` whose body is byte-for-byte identical to the exported `sleep` in `tests/helpers/fake-clock.ts`. The file already imports six named helpers from `./harness` in the same import block, so it is already reaching into a helper module for harness pieces, but re-derives this one-line real-time wait itself instead of importing the exported `sleep`. Two other tests already import the canonical export by name (`tests/supersession-detach-throw-containment.test.ts:164`, `tests/supersession-inflight-rebuild-quiesce.test.ts:288`), so the helper is the established way this suite waits on a real timer.

## Evidence
`tests/live/double-session-start-live.test.ts:170-172` (re-read immediately before filing):
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

Two other in-tree tests already import this exact export rather than redeclaring it:
```
tests/supersession-detach-throw-containment.test.ts:164:import { RecordingFakeClock, sleep } from "./helpers/fake-clock";
tests/supersession-inflight-rebuild-quiesce.test.ts:288:import { RecordingFakeClock, sleep } from "./helpers/fake-clock";
```

## Why this is a problem
The in-scope file re-derives a one-line function whose exported, identically-named, identically-bodied counterpart already lives under `tests/helpers/` and is already imported by name from two other test files in the same suite. This is the copy-paste-fixture shape: a helper reimplemented locally where a canonical helper under `tests/helpers/` already exists (`tests/helpers/fake-clock.ts`'s `sleep`).

## Suggested direction (non-binding, optional)
`tests/helpers/fake-clock.ts` is the natural shared home this test already has a path to (it imports other named exports from a sibling `tests/helpers/*` module); this is an observation of where the duplicate's counterpart already lives, not a design.

## False-positive check
- Gate-pin check: filename does not match `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `sleep` is a plain timer wrapper, not a recording double witnessing a MUST-NOT call; not applicable.
- docs/bugs/ signature search: this finding is about a helper redeclaration, not about a red/skipped test; no docs/bugs/ correct-reason-red citation applies.
- coverage-matrix/bug-doc citation search: `grep -rn "double-session-start-live" docs/reference/coverage-matrix.md docs/bugs/` returned no hit naming this test by name as a pinned witness whose body this finding would alter; this finding does not propose merging, renaming or deleting the test, only names the duplicated helper.
- Coverage drift check: this finding does not claim a missing test or an untested path; it cites an existing, provably byte-identical duplicate of an existing exported helper.

## Triage
verdict: confirmed — excerpts reproduce byte-for-byte (tests/live/double-session-start-live.test.ts:170-172 local `sleep`, live at :246/:410/:431; tests/helpers/fake-clock.ts:107-110 exported `sleep`, identical body), the six-name `./harness` import block is real at :77-84 so the helpers tree is already reachable, the canonical export is live (imported by supersession-detach-throw-containment.test.ts:164 and supersession-inflight-rebuild-quiesce.test.ts:288), `grep -rn "double-session-start-live" docs/reference/coverage-matrix.md docs/bugs/` hits bugs 0021/0023/0024/0028 only as a witness this filing does not merge/rename/delete (a one-line import swap leaves the witness body intact), no gate/recording-double/failLoudly carve-out applies, and no tracked PTQ covers this file's `sleep` (PTQ-0388/0582/0964 are poll helpers, PTQ-0715 covers the supersession pair; same-wave siblings d7-02/d7-03 cite disjoint files) — D7 boilerplate-duplication, mechanical fix (triage: claude-fable-5-1)
