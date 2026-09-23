---
id: PTQ-1397
title: Both rfc0010-l3-progress live cells redeclare sleep instead of importing it from tests/helpers/fake-clock.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:77-79
  - tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts:68-70
  - tests/helpers/fake-clock.ts:107-109
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Both rfc0010-l3-progress live cells redeclare sleep instead of importing it from tests/helpers/fake-clock.ts

## Observation
Both `tests/live/rfc0010-l3-progress-parent-live-cell.test.ts` and
`tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts` declare an
identical module-scope `sleep(ms)` function that returns a `Promise`
resolved by `setTimeout`. `tests/helpers/fake-clock.ts` already exports a
function of the same name with the identical body, documented as existing
precisely to "Wait on a real timer while asynchronous work settles around a
fake clock."

## Evidence
`tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:77-79`:
```ts
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

`tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts:68-70`:
```ts
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

`tests/helpers/fake-clock.ts:107-109` (the canonical, exported original):
```ts
/** Wait on a real timer while asynchronous work settles around a fake clock. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

## Why this is a problem
Both in-scope files independently restate a three-line utility that already
exists as a named export in `tests/helpers/fake-clock.ts`, each using it for
the exact documented purpose (settling asynchronous work — an
"(wrongly) still-pending status tick" — before an absence read).

## Suggested direction (non-binding, optional)
Both files already have no import from `tests/helpers/fake-clock.ts`; adding
`import { sleep } from "../helpers/fake-clock"` and dropping the local
declaration would remove both copies.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts`.
- Recording-double check: not applicable; `sleep` is a plain timer wrapper,
  not a recording double.
- docs/bugs/ signature search: neither file's subject (RFC 0010/0015 progress
  wiring) discusses this timer helper; no correct-reason-red posture applies.
- coverage-matrix/bug-doc citation search: `grep -rn
  "rfc0010-l3-progress-parent-live-cell\|rfc0010-l3-progress-wire-child-live-cell"
  docs/reference/coverage-matrix.md docs/bugs/` found no hits; no
  merge/rename/delete is proposed — the finding names only the redundant
  helper.

## Triage
verdict: confirmed — excerpts reproduce byte-for-byte at parent-live-cell:77-79 and wire-child-live-cell:68-70 (each live, called at :210 and :180/:231 with a real-timer settle before an absence read), tests/helpers/fake-clock.ts:107-109 exports the identical `sleep` already imported by supersession-detach-throw-containment.test.ts:164 and supersession-inflight-rebuild-quiesce.test.ts:288, neither cell imports it (imports are vitest, ./harness, ../helpers/execution-status-progress only); D7 boilerplate-duplication class, no gate/recording-double/bug-doc/coverage-matrix carve-out applies (grep of coverage-matrix.md and docs/bugs/ for both cell names returns nothing); no tracked PTQ covers `sleep` — same-wave intake siblings d7-02/d7-05 cite disjoint files (double-session-start-*), so not a duplicate (triage: claude-fable-5-1)
