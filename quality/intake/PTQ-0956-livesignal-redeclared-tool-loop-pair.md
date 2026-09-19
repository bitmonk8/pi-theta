---
id: PTQ-0956
title: query-tool-loop.test.ts and query-tool-loop-noncompliance.test.ts each redeclare liveSignal() despite two existing exported equivalents under tests/helpers/
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake
verdict: questionable
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
fix_skips: 2
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
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919203448: skipped — [PTQ-0966-assertrowsurfacelive-precondition-pair-duplicated.md] PTQ-0966: Already resolved in current code; both tests use shared invokeArgPreconditions. / PTQ-1031: Imported shared runProductionLoad and LoadOutcome; removed local duplicates and unused imports. All tests and assertions preserved; required gate passed. / PTQ-1035: Reused shared theta and fixture types across all four triaged files. Fixtures, tests and assertions unchanged; required gate passed. / PTQ-1037: Imported shared makeShippedHarness; removed duplicate harness declarations and unused imports. All tests and assertions preserved. Required TypeScript/full-test gate passed: 689 files, 11,586 tests. || [PTQ-1045-pkg-roots-buildpackages-not-migrated-glob-universe.md] PTQ-1045: Reused canonical buildPackages and its root map at all three triaged sites; no tests or assertions removed or changed. / PTQ-1052: Shared packageInput through tests/helpers/fake-file-system.ts across all five identical copies; no tests or assertions removed or changed. / PTQ-1088: Replaced inline teardown with disposeWorkspace; no tests removed. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. / PTQ-0963: No longer reproduces; every triaged duplicate already uses shared helpers. No edits made. | review unconfirmed: PTQ-0963-tools-load-witness-harness-duplicated.md — shed by the fixer: neither tests/tools-derived-name-shape.test.ts nor tests/tools-entry-closed-grammar.test.ts appears in the working-tree diff; all five duplicated pieces (expectedMessage at :129-140/:112-123, PlantedTheta/theta at :211-218/:181-188, the outcome/workspaceDir/beforeAll/afterAll/observed block at :284-305/:272-293, withCode at :428-430/:469-471) remain in both files, and the triage-noted third copy in tests/uppercase-pi-tool-name-refusal.test.ts is likewise untouched. || [PTQ-0992-b0379-caseinsensitive-guard-cannot-fail.md] PTQ-0992: Removed three tautological assertions and corrected the associated comment; retained every test and all registration/diagnostic assertions. / PTQ-1019: Already resolved in current code: one file-scope constant serves both readers; the unused third copy is absent. / PTQ-1030: Already resolved in current code: the header, H1 title, and asserted constant all say 50. / PTQ-1055: Shared Exp/render/renderAll through tests/helpers/registry-oracle.ts and removed orphaned local wrappers; no tests deleted. Required verification passed: TypeScript and all 11,586 tests across 689 files. | review unconfirmed: PTQ-1019-arity-array-two-literal-triplicated.md — untouched/shed: tests/nested-inline-enum-generic-argument-refusal.test.ts has no working-tree change; all three `line(ARITY, [["<ctor>","array"],["<expected>","1"],["<actual>","2"]])` copies remain at :781-785, :967-971 (rebuilt per loop iteration), and :1163-1167 (the dead never-read third copy). PTQ-1030-h1-title-stale-cell-count.md — untouched/shed: tests/inline-object-wire-name-rename-refusal.test.ts has no working-tree change; the "CONTROL H1" title still says 49 at :1452 while the body asserts NEW_ROW_LIST_CELLS = 50 (:744), and the top-of-file ANTI-VACUITY comment at :170-171 still says 47. ||
- qw20260919212831: skipped — [PTQ-0956-livesignal-redeclared-tool-loop-pair.md] PTQ-0956: No longer reproduces in working files or HEAD; both tests already import shared liveSignal. / PTQ-1019: No longer reproduces in working files or HEAD; one file-scope constant serves both readers, and the dead third copy is absent. / PTQ-1030: No longer reproduces in working files or HEAD; header, H1 title, and asserted count all say 50. / PTQ-1046: Delegated registered to shared registryMessageOf; preserved interpolation guards and every test/assertion. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. | review unconfirmed: PTQ-0956-livesignal-redeclared-tool-loop-pair.md — no working-tree change attributable; already resolved at HEAD (commit a9656b58): both tests/query-tool-loop.test.ts and tests/query-tool-loop-noncompliance.test.ts import liveSignal from ./helpers/typed-query-harness and carry no local declaration — close as resolved, nothing remains. PTQ-1019-arity-array-two-literal-triplicated.md — no working-tree change attributable; already resolved at HEAD: tests/nested-inline-enum-generic-argument-refusal.test.ts has a single file-scope ARITY_ARRAY_TWO (:189) read at :802 and :974, grep "line(ARITY" returns exactly one declaration, and the dead third copy is deleted — close as resolved. PTQ-1030-h1-title-stale-cell-count.md — no working-tree change attributable; already resolved at HEAD: the CONTROL H1 title (:1428) and the ANTI-VACUITY header comment (:170) both say 50, agreeing with NEW_ROW_LIST_CELLS = 50 (:720) — close as resolved. || [PTQ-1080-b0272-expectcaptured-reimplements-expectdeclared.md] PTQ-1080: Delegated declaration checks to expectDeclared, preserving the statement-count assertion and custom failure message. Required verification command passed: TypeScript clean; 689 test files and 11,586 tests passed. / PTQ-1089: Replaced all three registry-reader pairs with registryLineOf calls, preserving ordered fills and placeholder checks; no tests deleted. / PTQ-1058: Shared all four builders through tests/helpers/registry-oracle.ts and replaced the cited copies; no test cases or assertions deleted. / PTQ-1073: Already uses createParsedPromptHarness with the specified fixture identity; duplication no longer reproduces. Left unchanged. || [PTQ-1076-triagemap-fixture-duplicated-in-file.md] PTQ-1076: Re-verified both copies; consolidated triageMap() in existing tests/helpers/triage-fixture.ts, preserving fresh-map behavior and all tests. Required TypeScript and full test gate passed. / PTQ-1087: Re-verified both tautologies; started parity loops at index 1, preserving all three meaningful comparisons per row and all tests. Required gate passed: TypeScript and 11,586 tests across 689 files. ||
