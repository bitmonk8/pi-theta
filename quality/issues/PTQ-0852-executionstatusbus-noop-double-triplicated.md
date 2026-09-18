---
id: PTQ-0852
title: a 14-method no-op ExecutionStatusBus double is redeclared, method-for-method, in three test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-fn-child-launch.test.ts:118-137
  - tests/subagent-visible-regime.test.ts:456-476
  - tests/execution-status-progress-wire.test.ts:192-207
sites: 3
fix_scope: cross-module
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# a 14-method no-op ExecutionStatusBus double is redeclared, method-for-method, in three test files

## Observation
`tests/subagent-fn-child-launch.test.ts` declares a module-scope
`recordingBus()` function that builds an `ExecutionStatusBus` object literal
with fourteen methods — thirteen no-ops (`invocationStarted`,
`invocationEnded`, `invocationPlaced`, `checkpointBefore`, `openLaneSet`,
`childEvent`, `authorMessage`, `setVerbosity`, `verbosity`, `setViewShape`,
`viewShape`, `snapshot`, `dispose`) and one method that appends to a
returned array (`invocationBound`). `tests/subagent-visible-regime.test.ts`
declares a same-named `recordingBus()` with the identical thirteen no-op
methods, character for character, differing only in which single method
records (`invocationPlaced` instead of `invocationBound`).
`tests/execution-status-progress-wire.test.ts` inlines the same fourteen-
method object literal directly inside an `it()` body, with all fourteen
methods left as pure no-ops (no method records anything there).

## Evidence

`tests/subagent-fn-child-launch.test.ts:118-137`:
```ts
function recordingBus(): { bus: ExecutionStatusBus; bound: { id: string; mode: string }[] } {
  const bound: { id: string; mode: string }[] = [];
  const bus = {
    invocationStarted: (): void => {},
    invocationBound: (id: string, info: { mode: string }): void => {
      bound.push({ id, mode: info.mode });
    },
    invocationEnded: (): void => {},
    invocationPlaced: (): void => {},
    checkpointBefore: (): void => {},
    openLaneSet: () => ({ claim: (): void => {}, settle: (): void => {}, close: (): void => {} }),
    childEvent: (): void => {},
    authorMessage: (): void => {},
    setVerbosity: (): void => {},
    verbosity: () => "names" as const,
    setViewShape: (): void => {},
    viewShape: () => "tree" as const,
    snapshot: () => ({ nodes: [], untracked: 0 }),
    dispose: (): void => {},
  } as unknown as ExecutionStatusBus;
  return { bus, bound };
}
```

`tests/subagent-visible-regime.test.ts:456-476` (same thirteen no-op methods,
one method — `invocationPlaced` — recording instead):
```ts
function recordingBus(): { bus: ExecutionStatusBus; placed: { id: string; backend: string; handle: string }[] } {
  const placed: { id: string; backend: string; handle: string }[] = [];
  const bus = {
    invocationStarted: (): void => {},
    invocationBound: (): void => {},
    invocationEnded: (): void => {},
    invocationPlaced: (id: string, placement: { backend: string; handle: string }): void => {
      placed.push({ id, ...placement });
    },
    checkpointBefore: (): void => {},
    openLaneSet: () => ({ claim: (): void => {}, settle: (): void => {}, close: (): void => {} }),
    childEvent: (): void => {},
    authorMessage: (): void => {},
    setVerbosity: (): void => {},
    verbosity: () => "names" as const,
    setViewShape: (): void => {},
    viewShape: () => "tree" as const,
    snapshot: () => ({ nodes: [], untracked: 0 }),
    dispose: (): void => {},
  } as unknown as ExecutionStatusBus;
  return { bus, placed };
}
```

`tests/execution-status-progress-wire.test.ts:192-207` (same fourteen
methods, all no-ops, inlined in the `it()` body rather than a named
function):
```ts
const bus = {
  invocationStarted: (): void => {},
  invocationBound: (): void => {},
  invocationEnded: (): void => {},
  invocationPlaced: (): void => {},
  checkpointBefore: (): void => {},
  openLaneSet: () => ({ claim: (): void => {}, settle: (): void => {}, close: (): void => {} }),
  childEvent: (): void => {},
  authorMessage: (): void => {},
  setVerbosity: (v: "off" | "counts" | "names"): void => { verbosity = v; },
  verbosity: () => verbosity,
  setViewShape: (): void => {},
  viewShape: () => "tree" as const,
  snapshot: () => ({ nodes: [], untracked: 0 }),
  dispose: (): void => {},
};
```

Search: `grep -rl "openLaneSet: () => ({ claim: (): void => {}, settle: ():
void => {}, close: (): void => {} })" tests/*.test.ts` returns exactly these
three files. `grep -rln "ExecutionStatusBus" tests/helpers/*.ts` returns 0
hits — no `tests/helpers/` module exports a shared `ExecutionStatusBus`
no-op/recording double.

## Why this is a problem
The identical thirteen-method no-op skeleton of an `ExecutionStatusBus`
double is authored three separate times rather than once, each site
differing only in which single method (if any) is wired to record into a
returned array. No `tests/helpers/` module holds this shape, so each of the
three files independently reconstructs the full interface surface an
`ExecutionStatusBus`-consuming production seam requires a caller to
implement.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` factory exporting the thirteen-method no-op
`ExecutionStatusBus` skeleton, parameterised by the one method a caller
needs to observe (or returning a recording array alongside the bus), would
let these three files import a single declaration instead of three
independently authored ones; this is an observation about the existing
duplication, not a design for the shared factory's exact shape.

## False-positive check
- Gate-pin carve-out: none of the three files matches `*gate*.test.ts` or
  the named gate kin; none of the cited blocks is a pinned count/inventory
  assertion.
- Recording-double carve-out: `invocationBound`/`invocationPlaced`
  recording into an array in two of the three sites IS a legitimate
  recording double for a positive-witness assertion (the tests read the
  recorded array), not a MUST-NOT-called negative witness — the carve-out
  for negative witnesses does not apply here since this finding is about the
  duplicated SKELETON shared across all three sites (including the fully
  inert third site), not about any single recording assertion's ability to
  fail.
- docs/bugs/ signature search: `grep -rl "subagent-fn-child-launch\|
  subagent-visible-regime\|execution-status-progress-wire" docs/bugs/*.md` —
  one hit (docs/bugs/0479-frontmatter-model-ignored-session-model-drives-
  every-turn.md), which names `tests/subagent-fn-child-launch.test.ts` only
  as a witness-test citation for the FN-7 model-collision bug, unrelated to
  and not excusing this `recordingBus`/`bus` skeleton.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-fn-child-launch\|subagent-visible-regime\|
  execution-status-progress-wire" docs/reference/coverage-matrix.md` — 0
  hits. This finding proposes no merge, rename, or deletion of any file,
  `it()`, or `describe()` — only that the shared no-op skeleton could live
  in one helper instead of three independently authored copies.
- Coverage-drift check: the claim is about a repeated fixture DEFINITION,
  not a missing test path; each file's own tests that consume `bus`/
  `recordingBus()` are unaffected by this claim.
- Overlap check: `tests/helpers/subagent-fn-child-regime.ts` exports an
  unrelated `RecordingBus` class (an `emit(channel, data)` recorder for
  `outcomeEvents`, re-read at that file's lines 131-137) — a different
  interface for a different collaborator, not the `ExecutionStatusBus`
  double cited here; no existing filed or resolved PTQ names `recordingBus`
  or this `ExecutionStatusBus` skeleton.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/subagent-fn-child-launch.test.ts:118-137, tests/subagent-visible-regime.test.ts:456-476 and tests/execution-status-progress-wire.test.ts:192-207; the two `recordingBus()` copies sed-extracted and diffed differ only in which one method records (invocationBound vs invocationPlaced), the remaining no-op lines are byte-identical; the literal `openLaneSet: () => ({ claim…close })` grep returns exactly these 3 files and `ExecutionStatusBus` greps to 0 files under tests/helpers/ (the interface at src/extension/execution-status/types.ts:185 has exactly the 14 members, so every consumer must restate all of them); all copies are live (bound/placed read at :194, :495; bus consumed via childDeps at :208), all under tests/, D7 copy-paste-double class, no gate/negative-witness/red-test carve-out, docs/bugs (0479 only, witness cite) and coverage-matrix (0) claims reproduce, and no merge/rename/delete proposed; not a duplicate — PTQ-0667 covers fakeHostApi/fakeEntry/ARGS and expressly excludes the bus doubles, PTQ-0688 is the unrelated emit(channel,data) RecordingBus. Two accounting nits for acceptance, neither refuting: (a) the third site's setVerbosity/verbosity are wired to a local variable (visible in the filing's own excerpt), so the shared inert skeleton is 12 methods, not 13/14; (b) the filing undercounts — the same 14-member skeleton is restated twice more in tests/execution-status-progress-tool.test.ts:72-91 (`fakeBus`) and :322-341 (inline), differing only by `openLaneSet: () => noopLaneHandle()`; fold those two sites into the location list (sites: 5) (triage: claude-fable-5-1)
