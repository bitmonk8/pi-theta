---
id: PTQ-0491
title: rebind-self-collision-reownership.test.ts redeclares double-session-start-supersession.test.ts's whole compose harness (CountingFakeFileWatcher/makeHarness/makeBoot/watcherAt/wiringAt/waitFor/dispatchRegistered) instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/rebind-self-collision-reownership.test.ts:154-170
  - tests/rebind-self-collision-reownership.test.ts:335-390
  - tests/double-session-start-supersession.test.ts:119-135
  - tests/double-session-start-supersession.test.ts:310-360
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# rebind-self-collision-reownership.test.ts redeclares double-session-start-supersession.test.ts's whole compose harness (CountingFakeFileWatcher/makeHarness/makeBoot/watcherAt/wiringAt/waitFor/dispatchRegistered) instead of importing it

## Observation
tests/rebind-self-collision-reownership.test.ts's own header comment states
"Harness: mirrors tests/double-session-start-supersession.test.ts (the real
`createThetaExtension` + `composeExtensionInstance` over a mkdtemp temp-dir
workspace, hand-rolled pi/ctx fakes, ONE shared `FakeClock`, one COUNTING
`FakeFileWatcher` per compose, `fireSessionStart`/`fireSessionShutdown`,
`dispatchRegistered`, `waitFor`) with ONE bug-0024 delta". The class
`CountingFakeFileWatcher` and the functions `watcherAt`, `wiringAt`, `waitFor`
and `dispatchRegistered` are byte-identical (module-scope declaration through
closing brace) between the two files; `makeHarness` and `makeBoot` diverge
only in the fields each harness's bug needs to observe (`extraCommands` in
the newer file; a `gateComposes`/`releaseCompose` overlap-ordering seam in the
older one), not in the shared skeleton both build on top of.

## Evidence

tests/rebind-self-collision-reownership.test.ts:154-170 (`CountingFakeFileWatcher`):
```ts
class CountingFakeFileWatcher extends FakeFileWatcher {
  watchCalls = 0;
  attached = false;

  override watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.watchCalls += 1;
    this.attached = true;
    const unsubscribe = super.watch(roots, handler, onTerminate);
    return () => {
      this.attached = false;
      unsubscribe();
    };
  }
}
```

tests/double-session-start-supersession.test.ts:119-137 (the same class, one
extra comment line inside `unsubscribe`'s closure):
```ts
class CountingFakeFileWatcher extends FakeFileWatcher {
  watchCalls = 0;
  attached = false;

  override watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.watchCalls += 1;
    this.attached = true;
    const unsubscribe = super.watch(roots, handler, onTerminate);
    return () => {
      // Idempotent detach observation (FakeFileWatcher's own unsubscribe
      // already tolerates repeats).
      this.attached = false;
      unsubscribe();
    };
  }
}
```

tests/rebind-self-collision-reownership.test.ts:335-358 (`watcherAt`,
`wiringAt`, `waitFor`):
```ts
function watcherAt(b: Boot, index: number): CountingFakeFileWatcher {
  const watcher = b.watchers[index];
  if (watcher === undefined) {
    throw new Error(`compose #${index + 1} never created its watcher`);
  }
  return watcher;
}

function wiringAt(b: Boot, index: number): ExtensionInstanceWiring {
  const wiring = b.wirings[index];
  if (wiring === undefined) {
    throw new Error(`compose #${index + 1} never resolved its wiring`);
  }
  return wiring;
}

/** Poll a real-timer-bounded condition (the compose path does real fs I/O). */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}
```

tests/double-session-start-supersession.test.ts:310-333 (the same three
functions, byte-identical):
```ts
function watcherAt(b: Boot, index: number): CountingFakeFileWatcher {
  const watcher = b.watchers[index];
  if (watcher === undefined) {
    throw new Error(`compose #${index + 1} never created its watcher`);
  }
  return watcher;
}

function wiringAt(b: Boot, index: number): ExtensionInstanceWiring {
  const wiring = b.wirings[index];
  if (wiring === undefined) {
    throw new Error(`compose #${index + 1} never resolved its wiring`);
  }
  return wiring;
}

/** Poll a real-timer-bounded condition (the compose path does real fs I/O). */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}
```

`dispatchRegistered` (rebind-self-collision-reownership.test.ts:366-390 vs.
double-session-start-supersession.test.ts:345-363) is byte-identical apart
from its doc comment:
```ts
async function dispatchRegistered(
  harness: Harness,
  name: string,
): Promise<"resolved" | "rejected" | "timed-out"> {
  const options = harness.commands.get(name) as RegisteredCommand | undefined;
  if (options === undefined) {
    // No silent skipping (AGENTS.md): a missing registration is a setup fault.
    throw new Error(`no command registered for /${name}`);
  }
  const settled = Promise.resolve(
    options.handler("", {} as unknown as ExtensionCommandContext),
  ).then(
    () => "resolved" as const,
    () => "rejected" as const,
  );
  return Promise.race([
    settled,
    new Promise<"timed-out">((resolve) =>
      setTimeout(() => resolve("timed-out"), DISPATCH_SETTLE_CAP_MS),
    ),
  ]);
}
```

## Why this is a problem
Six named pieces of harness code — one class and five functions
(`CountingFakeFileWatcher`, `watcherAt`, `wiringAt`, `waitFor`,
`dispatchRegistered`, plus the shared `RecordedNote`/`RegisteredCommand`
interfaces and the `DISPATCH_SETTLE_CAP_MS`/`REPEAT_START_NOTE_PREFIX`/
`GREET_SHUTTING_DOWN_NOTE` constants that back them) are retyped verbatim in
tests/rebind-self-collision-reownership.test.ts rather than imported, and the
file's own header names the exact source it copied them from. This is the
repository's own recognised pattern for this class of duplication: two other
pairs of files that independently redeclared a `session_start`-firing
extension harness (tests/b0310-watch-roots-root-union.test.ts and
tests/b0339-package-source-watch-arming.test.ts) were centralised into
tests/helpers/watch-arming-harness.ts and tests/helpers/fake-file-watcher.ts
(that harness file's own header cites PTQ-0363 and PTQ-0236 as the
prior extractions), so the "these two files independently declare the same
compose-and-watch harness" shape is not a novel judgement call in this
codebase — it is the exact shape those two helper files were built to hold,
and neither of the two bug-0021/bug-0024 files reaches for either.

## Suggested direction (non-binding, optional)
tests/helpers/watch-arming-harness.ts is the existing home for a
`makeHarness`/boot-and-arm compose harness in this family; noting it as
where this pair's shared `CountingFakeFileWatcher`/`watcherAt`/`wiringAt`/
`waitFor`/`dispatchRegistered` sextet already has a natural neighbour is an
observation about the existing convention, not a design proposal.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); nothing
  cited here is a pinned count or inventory assertion.
- Recording-double check: `CountingFakeFileWatcher`/`dispatchRegistered` do
  back "was armed/attached" and "resolved/rejected/timed-out" observations,
  but this finding targets the duplicated CODE that builds those doubles, not
  any single MUST-NOT-be-called witness built on top of it.
- docs/bugs/ signature search: both files are RED-then-fixed regression
  suites for docs/bugs/0021-double-session-start-leaks-armed-watcher.md and
  docs/bugs/0024-rebind-self-collision-drops-surviving-names.md; this finding
  does not contest either file's redness/greenness or behaviour, only the
  harness code both depend on regardless of either bug's resolution.
- coverage-matrix/bug-doc citation search:
  `grep -rn "rebind-self-collision-reownership\|double-session-start-supersession" docs/reference/coverage-matrix.md docs/bugs/`
  returns no hits in coverage-matrix.md; both files are their own bug docs'
  witness suites (0021, 0024) by filename convention, not by an explicit
  witness-list citation. This finding proposes no merge, rename, or deletion
  of either file.
- Coverage-drift check: the claim is about a harness DEFINITION duplicated
  across two files that both exist today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified by symbol-extract diff: watcherAt/wiringAt/waitFor/dispatchRegistered/RecordedNote/RegisteredCommand (plus repeatStartNotes/greetShuttingDownNotes, uncounted) are 0-diff-line identical between rebind:335-387 and double-session-start:310-366, CountingFakeFileWatcher (154-171 vs 119-138) differs only by one comment, makeHarness/makeBoot diverge only in the per-bug seam (extraCommands vs gateComposes/releaseCompose) as stated; the rebind header really names double-session-start as its source; both files import only FakeClock/FakeFileWatcher from tests/helpers/ while tests/helpers/fake-file-watcher.ts:108 already exports a byte-identical waitFor neither uses; both suites live (10/10 pass); not a gate/census file, targets harness code not a recording-double witness, no coverage-matrix hit; no tracked PTQ cites either file (PTQ-0236/0363/0388 are b0310/b0339/b0312 only) and same-wave siblings d7-150-01 (0029/0034 pair) and d7-01-b0401 (makeHarness fake-pi only) are different copy sites — note the same CountingFakeFileWatcher/watcherAt/dispatchRegistered names also recur in tests/supersession-detach-throw-containment.test.ts and tests/supersession-inflight-rebuild-quiesce.test.ts, so the fix should be one shared extraction for the family (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
