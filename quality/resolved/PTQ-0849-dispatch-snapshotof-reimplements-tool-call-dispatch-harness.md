---
id: PTQ-0849
title: session-control-dispatch.test.ts's snapshotOf() is a byte-for-byte reimplementation of tests/helpers/tool-call-dispatch-harness.ts's exported snapshot(), which the file's own header credits
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/session-control-dispatch.test.ts:79-81
  - tests/helpers/tool-call-dispatch-harness.ts:139-144
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# session-control-dispatch.test.ts's snapshotOf() is a byte-for-byte reimplementation of tests/helpers/tool-call-dispatch-harness.ts's exported snapshot(), which the file's own header credits

## Observation
`tests/helpers/tool-call-dispatch-harness.ts` exports `snapshot(entries)`,
which freezes a `{ entries: new Map(entries) }` object into a
`CallableSetSnapshot` from a list of `[string, ResolvedCallable]` pairs.
`tests/session-control-dispatch.test.ts` declares its own `snapshotOf`
function with the identical parameter type and an identical one-line body,
without importing `snapshot`. The file's own header comment names this exact
harness file by path as the source of "the same posture" it is deliberately
following for hand-injecting `ResolvedCallable` entries via a type cast, so
the harness file was known to the author at the time `snapshotOf` was
written.

## Evidence

`tests/helpers/tool-call-dispatch-harness.ts:139-144`:
```ts
/** A frozen callable-set snapshot from `{ callableName -> entry }` pairs. */
export function snapshot(
  entries: readonly (readonly [string, ResolvedCallable])[],
): CallableSetSnapshot {
  return Object.freeze({ entries: new Map(entries) });
}
```

`tests/session-control-dispatch.test.ts:79-81` (re-read immediately before
filing):
```ts
function snapshotOf(entries: readonly (readonly [string, ResolvedCallable])[]): CallableSetSnapshot {
  return Object.freeze({ entries: new Map(entries) });
}
```

The file's own header (lines 10-14) states:
```
// `CallableSetSnapshot` entry of kind `"runtime-tool"` (the seam sheet §3.1
// union member; `src/parser/callable-set.ts` has not yet been widened to
// construct one, so the entry is injected via a type cast — the same
// posture `tests/helpers/tool-call-dispatch-harness.ts` already uses for
// hand-built `ResolvedCallable` entries).
```

`tests/session-control-dispatch.test.ts`'s import list (lines 34-55) does not
import anything from `./helpers/tool-call-dispatch-harness`.

Exact search: `grep -n "^export function snapshot(" tests/helpers/tool-call-dispatch-harness.ts` and `grep -n "^function snapshotOf(" tests/session-control-dispatch.test.ts` each return exactly one hit, at the lines cited above; `grep -n "tool-call-dispatch-harness" tests/session-control-dispatch.test.ts` returns only the one header-comment mention, no import statement.

## Why this is a problem
The two functions build the identical `CallableSetSnapshot` value from the
identical input shape, and the newer file's own header names the exact
module the pattern is credited to, yet the file declares a second,
independent copy under a different name (`snapshotOf` vs `snapshot`) instead
of importing the existing export. A change to how a `CallableSetSnapshot` is
constructed (e.g. adding a second required field alongside `entries`) would
need to be hand-applied at this second site as well as at the harness's own
call sites.

## Suggested direction (non-binding, optional)
`tests/helpers/tool-call-dispatch-harness.ts`'s exported `snapshot()` already
matches `snapshotOf`'s signature and body; the file's own header comment
already names that module as the credited source of the surrounding pattern.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; no pinned count or inventory is touched.
- Recording-double check: `snapshot`/`snapshotOf` build a plain frozen `CallableSetSnapshot` value with no call-count tracking and back no "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -rln "snapshotOf\|CallableSetSnapshot" docs/bugs/*.md` returns hits only on the production type name in unrelated fixed-bug narratives (e.g. 0072, 0107, 0270), none naming `snapshotOf` or stating a rationale for a second, independent copy in this file.
- coverage-matrix/bug-doc citation search: `grep -n "session-control-dispatch\.test" docs/reference/coverage-matrix.md` returns no hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that the duplicated one-line builder could be imported.
- Coverage check: this finding is about a repeated helper-function DEFINITION that exists in the test file today; every call site of `snapshotOf` is already exercised by this file's own D11-D15 tests.
- Prior-filing overlap check: `grep -rl "snapshotOf\|tool-call-dispatch-harness" quality/intake quality/issues quality/resolved` before filing finds no existing finding citing `snapshotOf` in `session-control-dispatch.test.ts` or this pairing with `tool-call-dispatch-harness.ts`'s `snapshot`.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/helpers/tool-call-dispatch-harness.ts:139-144 (`export function snapshot`) and tests/session-control-dispatch.test.ts:79-81 (`function snapshotOf`), and a whitespace/name/trailing-comma-normalised diff of the two is empty (identical parameter type and body); the local copy is live (5 `snapshotOf(` call sites at :208/:260/:292/:329/:361) and the file imports nothing from `./helpers/tool-call-dispatch-harness` despite naming it in comments at :14 and :58 (the filing's "one mention" is two, both comments — immaterial), while three sibling tests already import the harness export; both locations under tests/, D7 boilerplate-duplication class, no carve-out applies (not a gate file, plain frozen value builder not a recording double, `snapshotOf` absent from docs/bugs/, 0 coverage-matrix hits for the file, no it()/describe() change proposed); not a duplicate — PTQ-0694 (resolved) covered this file's parseDeps copy, PTQ-0492 its RecordingCheckpoint, PTQ-0682's `snapshotOf` is the unrelated InvocationNodeSnapshot builder and explicitly excludes this site, PTQ-0696 tracks the shadowed-callable-call/tool-arg-shape-enforcement `snapshot` pair on disjoint files, PTQ-0472 tracks host-loop-dispatch's span/objArg/callExpr/body copies from the same harness — a mechanical import dedupe (triage: claude-fable-5-1)
