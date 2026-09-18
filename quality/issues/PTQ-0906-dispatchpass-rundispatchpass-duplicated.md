---
id: PTQ-0906
title: callee-post-parse-errors and callee-tools-missing-theta-path each redeclare an identical DispatchPass interface and runDispatchPass function
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:257-301
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:264-310
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# callee-post-parse-errors and callee-tools-missing-theta-path each redeclare an identical DispatchPass interface and runDispatchPass function

## Observation
Both `tests/callee-post-parse-errors-un-register-tools-caller.test.ts` and
`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`
declare a private `DispatchPass` interface and a private, async
`runDispatchPass(workspace: ComposeWorkspace): Promise<DispatchPass>`
function that composes `discoverAndComposeFixtures` over a `makeHost`
double, builds an inline `ExtensionCommandContext`, and returns a
`{ registered, drive }` shape whose `drive` looks up a fixture by
`slashName`, throws naming the stem if it is unregistered, runs it, and
returns the `theta-system-note`-channel notes emitted after that run. The
two declarations are identical line-for-line except for one added sentence
in `runDispatchPass`'s doc comment in the second file. Neither file imports
this shape from `tests/helpers/`; no helper module under `tests/helpers/`
exports a `DispatchPass` type or a function of this shape (the sibling
`tests/helpers/fixture-dispatch-harness.ts` module exports a different,
already-parameterised `hostPi`/`loadCtx`/`dispatchCtx`/`dispatchTopLevelFixtures`
family that answers a related but distinct need — driving a fixed list of
top-level stems through one dispatch pass, not returning a re-driveable
`drive(stem)` closure over discovered fixtures).

## Evidence

tests/callee-post-parse-errors-un-register-tools-caller.test.ts:257-301:
```ts
interface DispatchPass {
  readonly registered: readonly string[];
  /** Run a registered fixture and return the notes ITS drive put on the channel. */
  readonly drive: (stem: string) => Promise<readonly string[]>;
}

/**
 * Compose the shipped discovery + composition path into RUNNABLE fixtures, so a
 * registered caller can actually be dispatched. `composeExtensionInstance`
 * returns `ParsedTheta`s, which carry no `run`, hence the second entry point.
 */
async function runDispatchPass(workspace: ComposeWorkspace): Promise<DispatchPass> {
  const host = makeHost(workspace.cwd);
  const fixtures = await discoverAndComposeFixtures(host.pi, host.ctx);
  const runContext = {
    signal: undefined,
    cwd: workspace.cwd,
    isIdle: (): boolean => true,
    waitForIdle: (): Promise<void> => Promise.resolve(),
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionCommandContext;
  return {
    registered: fixtures.map((f) => f.slashName),
    drive: async (stem: string): Promise<readonly string[]> => {
      const fixture = fixtures.find((f) => f.slashName === stem);
      if (fixture === undefined) {
        throw new Error(
          `harness: no registered fixture named ${stem}, so its drive has no subject — ` +
            `registered: ${JSON.stringify(fixtures.map((f) => f.slashName))}`,
        );
      }
      const before = host.notes.length;
      await fixture.run("", runContext);
      return host.notes
        .slice(before)
        .filter((n) => n.customType === SYSTEM_NOTE_CHANNEL)
        .map((n) => n.content);
    },
  };
}
```

tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:264-310
— identical apart from two added doc-comment lines ("The notes are read off
the settled in-memory session the host double records, after the drive's
promise has resolved — never off a racy event."):
```ts
interface DispatchPass {
  readonly registered: readonly string[];
  /** Run a registered fixture and return the notes ITS drive put on the channel. */
  readonly drive: (stem: string) => Promise<readonly string[]>;
}

/**
 * Compose the shipped discovery + composition path into RUNNABLE fixtures, so a
 * registered caller can actually be dispatched. `composeExtensionInstance`
 * returns `ParsedTheta`s, which carry no `run`, hence the second entry point.
 * The notes are read off the settled in-memory session the host double records,
 * after the drive's promise has resolved — never off a racy event.
 */
async function runDispatchPass(workspace: ComposeWorkspace): Promise<DispatchPass> {
  const host = makeHost(workspace.cwd);
  const fixtures = await discoverAndComposeFixtures(host.pi, host.ctx);
  const runContext = {
    signal: undefined,
    cwd: workspace.cwd,
    isIdle: (): boolean => true,
    waitForIdle: (): Promise<void> => Promise.resolve(),
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionCommandContext;
  return {
    registered: fixtures.map((f) => f.slashName),
    drive: async (stem: string): Promise<readonly string[]> => {
      const fixture = fixtures.find((f) => f.slashName === stem);
      if (fixture === undefined) {
        throw new Error(
          `harness: no registered fixture named ${stem}, so its drive has no subject — ` +
            `registered: ${JSON.stringify(fixtures.map((f) => f.slashName))}`,
        );
      }
      const before = host.notes.length;
      await fixture.run("", runContext);
      return host.notes
        .slice(before)
        .filter((n) => n.customType === SYSTEM_NOTE_CHANNEL)
        .map((n) => n.content);
    },
  };
}
```

Exact search executed: `grep -rln "DispatchPass" tests/*.test.ts` → exactly
2 files, the two above; `grep -rn "DispatchPass\|discoverAndComposeFixtures"
tests/helpers/*.ts` shows no `tests/helpers/*.ts` module exports a
`DispatchPass` type or a `runDispatchPass`-shaped function (only
`fixture-dispatch-harness.ts` and `production-load-harness.ts` reference
`discoverAndComposeFixtures` under different, already-exported shapes).

## Why this is a problem
Both files independently declare the same 45-line dispatch-pass scaffold
(interface, inline `ExtensionCommandContext`, fixture lookup, drive-and-read
closure) rather than sharing it, even though both files already import their
`makeHost`/`ComposeWorkspace` primitives from
`tests/helpers/compose-workspace-harness.ts` and could equally import a
dispatch-pass builder from a shared module. A change to how a discovered
fixture is dispatched (e.g. a new required field on
`ExtensionCommandContext`, or a change to which channel a drive's notes are
read from) would need to be applied to both copies independently, since
neither imports from the other or from any shared helper.

## Suggested direction (non-binding, optional)
The `DispatchPass` interface and `runDispatchPass` function take only a
`ComposeWorkspace` as varying input and return a self-contained
`{ registered, drive }` pair; a `tests/helpers/` module already holds the
sibling `makeHost`/`ComposeWorkspace` primitives this function is built on,
which is the natural place the two files' own identical bodies point at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable — the cited block is a harness function, not a pinned
  count or inventory.
- Recording-double check: `runDispatchPass`'s `host` is a recording double
  (`makeHost`) this finding does not touch the contents of; the claim is
  that the SCAFFOLDING FUNCTION wrapping it is duplicated, not that any
  assertion built on its recording is a MUST-NOT witness.
- docs/bugs/ signature search: `grep -rln "DispatchPass\|runDispatchPass"
  docs/bugs/` → 0 hits; this finding does not allege a red or disabled test.
- coverage-matrix/bug-doc citation search: `grep -n
  "callee-post-parse-errors-un-register-tools-caller\|callee-tools-missing-theta-path-un-registers-tools-caller"
  docs/reference/coverage-matrix.md` → 0 hits. No merge, rename or deletion
  of any file, `it()` or `describe()` is proposed — only that the two
  identical local declarations could be shared.
- Overlap check: `find quality -iname "*dispatchpass*"` and a scan of the
  provided already-filed/resolved title list for "dispatch" turned up
  entries about a different, already-covered "tool-call-dispatch-harness"
  and "host-loop-dispatch" family (e.g. the resolved
  `PTQ-0472-host-loop-dispatch-reimplements-tool-call-dispatch-harness-b.md`)
  and the resolved `PTQ-0428-b0270-compose-workspace-harness-not-migrated.md`
  covering this same file pair's `makeHost`/`runLoadPass`/etc. family — none
  names `DispatchPass` or `runDispatchPass`, confirming this is a distinct,
  unfiled root cause on the same two files.
- Coverage drift: not claimed; both files' own cell logic (fixtures 7-9's
  planting and their individual assertions) is untouched by this
  observation, which is scoped to the shared dispatch scaffold only.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: both excerpts reproduce at the exact cited lines (b0267 :257-301, b0270 :264-310) and `diff` of the sed-extracted blocks is empty save the two added doc-comment lines at b0270 :274-275, so the interface + 45-line `runDispatchPass` body is byte-identical; both copies are live (`runDispatchPass` called at b0267 :603/:629/:656 and b0270 :479 with `pass.drive(...)`/`pass.registered` read as positive values); the stated searches reproduce — `DispatchPass|runDispatchPass` hits exactly these two files across src/, extensions/, tools/, tests/ and nothing in tests/helpers/, docs/bugs/ → 0, coverage-matrix → 0, and no helper exports a re-driveable `drive(stem)` closure (`compose-workspace-harness` exports only `makeHost`/`runLoadPass`, `production-load-harness.LoadOutcome` has `registered` but no `drive`, `fixture-dispatch-harness.dispatchTopLevelFixtures` returns void; the `const before = host.notes.length` notes-slice read is unique to these two files); both locations under tests/, D7 copy-paste-harness class, no gate/recording-double/red-test/merge-rename carve-out applies; not a duplicate — resolved PTQ-0428 migrated this pair's `makeHost`/`runLoadPass` family and never named `runDispatchPass` (which landed with 7a23ce0e/db3e1a88, pre-dating that fix, and was left behind), the same-wave d7-01 sibling is the distinct `expectCallerRefused` residual. One accuracy nuance for the fixer, not a refutation: the inline `runContext` is `fixture-dispatch-harness.dispatchCtx(cwd)` minus its `abort` member, so the shared builder should call `dispatchCtx` rather than mint a third `ExtensionCommandContext` double (triage: claude-fable-5-1)
