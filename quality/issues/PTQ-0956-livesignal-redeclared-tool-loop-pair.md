---
id: PTQ-0956
title: query-tool-loop.test.ts and query-tool-loop-noncompliance.test.ts each redeclare liveSignal() despite two existing exported equivalents under tests/helpers/
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/query-tool-loop.test.ts:50-52
  - tests/query-tool-loop-noncompliance.test.ts:67-70
  - tests/helpers/typed-query-harness.ts:25-27
  - tests/helpers/scripted-typed-query-harness.ts:42-44
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# query-tool-loop.test.ts and query-tool-loop-noncompliance.test.ts each redeclare liveSignal() despite two existing exported equivalents under tests/helpers/

## Observation
Both tests/query-tool-loop.test.ts and tests/query-tool-loop-noncompliance.test.ts
— sibling files in this review's scope, testing the same production surface
(`src/runtime/query-tool-loop.ts`) — declare a local, byte-identical
`liveSignal(): AbortSignal` function returning `new AbortController().signal`,
each preceded by a one-line doc comment. Two modules under tests/helpers/
already export a function of the same name and identical one-line body:
tests/helpers/typed-query-harness.ts and tests/helpers/scripted-typed-query-harness.ts.
Neither in-scope file imports either helper module.

## Evidence
tests/query-tool-loop.test.ts:50-52:
```ts
/** A never-aborted signal for the non-cancellation arms. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```

tests/query-tool-loop-noncompliance.test.ts:67-70:
```ts
/** A never-aborted signal (the non-cancellation arms). */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```

tests/helpers/typed-query-harness.ts:25-27 (already exported):
```ts
export function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```

tests/helpers/scripted-typed-query-harness.ts:42-44 (already exported,
byte-identical body):
```ts
export function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```

Exact search: `grep -n "function liveSignal" tests/query-tool-loop.test.ts
tests/query-tool-loop-noncompliance.test.ts tests/helpers/typed-query-harness.ts
tests/helpers/scripted-typed-query-harness.ts` → the four declarations cited
above, one per file, every body identical modulo the local doc comment
wording.

## Why this is a problem
The one-line `liveSignal()` body — `new AbortController().signal` returned to
stand in for a signal that never fires — is already exported from two
separate tests/helpers/ modules, and both in-scope files re-type the same
function under the same name and the same one-statement body rather than
importing either existing export. Neither in-scope file's local copy adds
any file-specific behaviour beyond the doc comment.

## Suggested direction (non-binding, optional)
Importing `liveSignal` from tests/helpers/typed-query-harness.ts (the module
already exporting `QueryToolLoopConfig`-adjacent helpers this family uses) is
the natural fit for both sites.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or a named gate
  kin; not applicable — no pinned count or inventory is involved.
- Recording-double carve-out: `liveSignal()` is a plain value constructor,
  not a recording double backing a MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `grep -rl "liveSignal" docs/bugs/` → 0 hits;
  no documented correct-reason-red names this function.
- coverage-matrix/bug-doc citation search: `grep -n
  "query-tool-loop.test.ts\|query-tool-loop-noncompliance.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` block, only that the
  two local functions could import an already-exported equivalent.
- Prior-filing search: `grep -rl "query-tool-loop.test.ts\|query-tool-loop-noncompliance.test.ts"
  quality/issues quality/intake quality/resolved` → hits only PTQ-0124
  (resolved, an unrelated discarded-shape finding), PTQ-0492 and PTQ-0511
  (both resolved/fixed — the `RecordingCheckpoint`/`SpyCompensator` doubles
  these same two files used to hand-roll; both files now import those from
  tests/helpers/invoke-seam-scaffold, confirming the fix landed and leaving
  `liveSignal` as the one remaining un-migrated duplicate). The sibling
  finding PTQ-0855 covers the identical root cause for a different file
  pair (tests/tool-calls-execute-lowering.test.ts,
  tests/tool-calls-off-surface-live-wiring.test.ts) and explicitly notes
  "the wider repository carries at least 13 further file-local liveSignal()
  re-declarations outside this review's scope" — these two in-scope files
  are two of that uncounted remainder, not previously filed.
- Coverage-drift check: this finding is about scaffolding already present in
  two passing test files; it makes no claim that any behaviour or path is
  untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines (tests/query-tool-loop.test.ts:50-52, tests/query-tool-loop-noncompliance.test.ts:67-70, tests/helpers/typed-query-harness.ts:25-27, tests/helpers/scripted-typed-query-harness.ts:42-44) and a mktemp sed-extract diff of the four bodies after stripping `export` is empty; both local copies are live (10 and 3 `liveSignal()` call sites) and neither file imports either helper (only ./helpers/invoke-seam-scaffold), while the typed-query-harness export is already consumed by 4 other test files so it is a real canonical; stated searches reproduce (`function liveSignal` → 15 files repo-wide, none under src/; docs/bugs/ `liveSignal` → 0; coverage-matrix cite of either file → 0; quality/ grep → PTQ-0124/0492/0511 only, all resolved and about other helpers); both locations under tests/, D7 copy-paste-fixture class, neither file is a gate/kin and no recording-double or red-test carve-out applies; not a duplicate — PTQ-0855 (open) covers the same helper at a different file pair and explicitly left the remaining 13 file-local copies unfiled ("routing note only"), PTQ-0871 covers the helper-to-helper mirror, and sibling intake d7-02 covers the `config(maxRounds)` builder — fix is a mechanical import swap in two files (triage: claude-fable-5-1)
