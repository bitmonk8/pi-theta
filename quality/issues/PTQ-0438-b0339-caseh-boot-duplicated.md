---
id: PTQ-0438
title: b0339's Case-H `boot()` redeclares the same createThetaExtension/fireSessionStart/waitFor session-arming sequence as b0312's and b0378's own `boot()`
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0339-package-source-watch-arming.test.ts:314-333
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0339's Case-H `boot()` redeclares the same createThetaExtension/fireSessionStart/waitFor session-arming sequence as b0312's and b0378's own `boot()`

## Observation
tests/b0339-package-source-watch-arming.test.ts's second `describe` block ("end-to-end: the first .theta …") declares its own local `boot()`: construct a fresh watcher fake and `FakeClock`, build `makeHarness(workspace)`, wire a `ThetaExtensionDeps.composeInstance` callback through `composeExtensionInstance`, call `createThetaExtension(deps)(harness.pi)`, fire `session_start`, then `waitFor(() => fakeWatcher.watchCalls.length > 0, …)`. tests/b0312-out-of-root-thetalib-watch-closure.test.ts and tests/b0378-watch-root-case-variant-double-arming.test.ts each declare a `boot()` of the identical shape and identical five-statement tail (`createThetaExtension(deps)(harness.pi); await harness.fireSessionStart(); await waitFor(() => fakeWatcher.watchCalls.length > 0, "session_start to arm the watcher");`), differing from b0339's copy only in which watcher class is instantiated and whether `ownRegisteredNames` is threaded through the `composeInstance` callback. `tests/helpers/watch-arming-harness.ts`'s own `bootWatchArming` (added under PTQ-0363/PTQ-0236) already extracts this exact sequence, but only for the `RootsRecordingFileWatcher` case (b0339's FIRST describe block uses it); it hardcodes that one watcher class, so none of the three `RecursiveRootFileWatcher`/`CaseVariantFanoutFileWatcher`-driven `boot()` bodies can call it, and each file re-derives the wrapper by hand instead.

## Evidence

tests/b0339-package-source-watch-arming.test.ts:314-333 (re-read immediately before filing):
```ts
  /** Boot the shipped composition over the recursive-root watcher + fake clock. */
  async function boot(): Promise<void> {
    fakeWatcher = new RecursiveRootFileWatcher();
    fakeClock = new FakeClock();
    wiring = undefined;
    const harness = makeHarness(workspace);
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      composeInstance: async (pi, ctx) => {
        wiring = await composeExtensionInstance(pi, ctx, {
          fileWatcher: fakeWatcher,
          clock: fakeClock,
        });
        return wiring;
      },
    };
    createThetaExtension(deps)(harness.pi);
    await harness.fireSessionStart();
    await waitFor(() => fakeWatcher.watchCalls.length > 0, "session_start to arm the watcher");
  }
```

tests/b0312-out-of-root-thetalib-watch-closure.test.ts:391-417 (pattern context, outside this wave's scope; re-read immediately before filing — the same watcher-construct/harness-build/compose-wire/fire/wait tail, byte-identical apart from the extra `ownRegisteredNames` thread its own PIC-69 scenario needs):
```ts
  /** Boot the shipped composition over the recursive-root watcher + fake clock. */
  async function boot(): Promise<void> {
    fakeWatcher = new RecursiveRootFileWatcher();
    fakeClock = new FakeClock();
    harness = makeHarness(workspace);
    wiring = undefined;
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      composeInstance: async (pi, ctx, ownRegisteredNames) => {
        wiring = await composeExtensionInstance(
          pi,
          ctx,
          { fileWatcher: fakeWatcher, clock: fakeClock },
          undefined,
          ownRegisteredNames,
        );
        return wiring;
      },
    };
    createThetaExtension(deps)(harness.pi);
    await harness.fireSessionStart();
    await waitFor(() => fakeWatcher.watchCalls.length > 0, "session_start to arm the watcher");
  }
```

tests/b0378-watch-root-case-variant-double-arming.test.ts:279-303 (pattern context, outside this wave's scope; re-read immediately before filing — the same shape again, watcher class swapped for `CaseVariantFanoutFileWatcher` and a `flags` parameter added):
```ts
  async function boot(flags: Readonly<Record<string, string>>): Promise<void> {
    fakeWatcher = new CaseVariantFanoutFileWatcher();
    fakeClock = new FakeClock();
    harness = makeHarness(workspace, flags);
    wiring = undefined;
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      composeInstance: async (pi, ctx, ownRegisteredNames) => {
        wiring = await composeExtensionInstance(
          pi,
          ctx,
          { fileWatcher: fakeWatcher, clock: fakeClock },
          undefined,
          ownRegisteredNames,
        );
        return wiring;
      },
    };
    createThetaExtension(deps)(harness.pi);
    await harness.fireSessionStart();
    await waitFor(
      () => fakeWatcher.watchCalls.length > 0,
      "session_start to arm the watcher",
    );
  }
```

Search: `grep -n "createThetaExtension(deps)(harness.pi);" tests/*.test.ts` → the three files above are the only test files whose `boot()` ends with this exact `createThetaExtension`→`fireSessionStart`→`waitFor(watchCalls.length > 0, …)` triplet (confirmed by reading each of the three functions in full). `tests/helpers/watch-arming-harness.ts`'s exported `bootWatchArming` reproduces the identical triplet but constructs only `new RootsRecordingFileWatcher()` internally (read in full above), so it cannot serve any of these three call sites.

## Why this is a problem
The same five-statement `createThetaExtension(deps)(harness.pi); await harness.fireSessionStart(); await waitFor(() => fakeWatcher.watchCalls.length > 0, "session_start to arm the watcher");` tail, wrapped in the same watcher-construct/harness-build/`composeInstance`-callback preamble, is written out independently in three files. `tests/helpers/watch-arming-harness.ts` already demonstrates, for the `RootsRecordingFileWatcher` case, that this exact sequence is a natural shared unit (`bootWatchArming`) — the file's own header comment traces two rounds of extraction (PTQ-0236, then PTQ-0363) narrowing at this same file pair — but that extraction hardcoded one watcher class rather than accepting one as a parameter, so the sibling watcher-class variants of the identical wrapper were left to be hand-written three times over.

## Suggested direction (non-binding, optional)
`tests/helpers/watch-arming-harness.ts` is the observed existing home for this wrapper shape; a version parameterised on the watcher instance (rather than always constructing `RootsRecordingFileWatcher`) is the generalisation its own two prior extraction rounds were already narrowing toward.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the named kin; the cited lines are a boot-harness function body, not a pinned count or inventory assertion.
- Recording-double check: `fakeWatcher.watchCalls` backs an ordinary "has the watcher armed yet" poll, not a MUST-NOT-called witness; this finding claims the wrapper FUNCTION is duplicated, not that any assertion built over it cannot fail.
- docs/bugs/ signature search: docs/bugs/0339-package-source-present-but-empty-contributing-dir-not-watched.md Status "fixed (0.321.0)"; docs/bugs/0312-out-of-root-thetalib-edits-invisible-stale-imports.md and the 0378 bug doc are cited only as pattern context. `npx vitest run tests/b0339-package-source-watch-arming.test.ts` → 8/8 passing at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0339-package-source-watch-arming" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` — only that the `boot()` wrapper could be shared — so no citation is affected.
- Overlap check against already-filed/resolved topics: re-read quality/resolved/PTQ-0346 (RecursiveRootFileWatcher CLASS definition, now fixed via import) and quality/resolved/PTQ-0363 (the FIRST describe block's `Harness`/`makeHarness`/`boot` trio, now fixed via `bootWatchArming`) in full. Both are confined, by their own cited Evidence, to the `RootsRecordingFileWatcher`-based first describe block; neither cites or discusses the second describe block's `RecursiveRootFileWatcher`-based `boot()` (lines 314-333) that this finding targets, and `tests/helpers/watch-arming-harness.ts` (read in full) exports no wrapper for any watcher besides `RootsRecordingFileWatcher`, confirming the gap is still open.
- Scope note: tests/b0312-out-of-root-thetalib-watch-closure.test.ts and tests/b0378-watch-root-case-variant-double-arming.test.ts are outside this wave's assigned scope; both are cited only as pattern context (confirming the byte-identity of the duplicated tail), not claimed as additional `locations`.
- Coverage-drift check: the claim is about a repeated harness-wrapper DEFINITION, not a missing test path; every line of b0339's copy is exercised by its own passing Case H test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three `boot()` excerpts reproduce at the cited lines and an independent diff of b0339:315-333 against b0312:392-417 shows only the module-`let`-vs-local-`const` `harness` and the `ownRegisteredNames` thread differ (b0378 adds only `flags` and the watcher class); `grep -rn "watchCalls.length > 0" tests/` → exactly those three test files plus tests/helpers/watch-arming-harness.ts:129, whose `bootWatchArming` hardcodes `new RootsRecordingFileWatcher()` and is imported only by b0310 and b0339's first block; fix commit c373a961 for PTQ-0363 (Evidence confined to the first block's RootsRecording boot, then :153-171) added the `makeHarness` import but left this Case-H body untouched with no recorded ruling, PTQ-0346 covered only the watcher CLASS and PTQ-0236 the watcher/norm/waitFor/armedRoots quartet, so this residual is untracked; 8/8 green at HEAD, no gate/recording-double/coverage-matrix carve-out applies (triage: claude-fable-5-1)
