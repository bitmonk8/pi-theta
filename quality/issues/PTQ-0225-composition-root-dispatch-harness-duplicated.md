---
id: PTQ-0225
title: The discoverAndComposeFixtures dispatch/theta-system-note-channel harness (hostPi/loadCtx/dispatchCtx/noteContents/errNote) is redefined near-verbatim in three test files
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0293-invoke-callee-cause-partition.test.ts:92-221
  - tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts:137-270
  - tests/slsh5-invoke-cascade-chain-suffix.test.ts:140-272
sites: 3
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# The discoverAndComposeFixtures dispatch/theta-system-note-channel harness (hostPi/loadCtx/dispatchCtx/noteContents/errNote) is redefined near-verbatim in three test files

## Observation
`tests/b0293-invoke-callee-cause-partition.test.ts` and
`tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts` each privately
redefine the same five-function harness — `hostPi()`, `loadCtx(cwd)`,
`dispatchCtx(cwd)`, `noteContents()`, `errNote(slashName)` — plus the same
`interface RecordedMessage`, the same `workspaceDir`/`thetaDir`/`notes`
module state, and the same `beforeAll`/`afterAll` sequence
(`realpathSync(mkdtempSync(...))`, plant `.pi/theta/` fixture files, write a
minimal `settings.json`, call `discoverAndComposeFixtures(hostPi(),
loadCtx(workspaceDir))`, look up and run each top-level fixture by slash
name with a loud throw if one is missing, `rmSync` the workspace on
teardown) that composes and dispatches theta fixtures through the shipped
composition root and reads the resulting `theta-system-note` channel. The
same five function signatures and the same surrounding sequence recur a
third time in `tests/slsh5-invoke-cascade-chain-suffix.test.ts` (outside
this wave's review scope; cited here only as duplication evidence). No file
under `tests/helpers/` exports this harness. None of the three files'
comments acknowledge copying it from a named sibling.

## Evidence
Interface/module-state block, byte-identical between the two in-scope
files. `tests/b0293-invoke-callee-cause-partition.test.ts:92-102`:
```ts
interface RecordedMessage {
  readonly customType?: string;
  readonly content?: string;
}

let workspaceDir: string;
let thetaDir: string;
/** Every note the load pass and the dispatches emitted, in emission order. The
 *  fixtures share one host `pi`, so each row names its own theta
 *  (`theta /<name> …`), which keeps a read attributable to its dispatch. */
const notes: RecordedMessage[] = [];
```
`tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts:137-147`
(byte-identical):
```ts
interface RecordedMessage {
  readonly customType?: string;
  readonly content?: string;
}

let workspaceDir: string;
let thetaDir: string;
/** Every note the load pass and the dispatches emitted, in emission order. The
 *  fixtures share one host `pi`, so each row names its own theta
 *  (`theta /<name> …`), which keeps a read attributable to its dispatch. */
const notes: RecordedMessage[] = [];
```

`hostPi()`, near-identical (one clause reworded).
`tests/b0293-invoke-callee-cause-partition.test.ts:107-120`:
```ts
function hostPi(): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    registerMessageRenderer: (): void => {},
    sendUserMessage: (): void => {
      throw new Error(
        "a provider turn was issued: neither callee runs an `@`-query, so this witness must " +
          "stay fully offline",
      );
    },
```
`tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts:152-165` (the
only difference is the wording inside the thrown message):
```ts
function hostPi(): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    registerMessageRenderer: (): void => {},
    sendUserMessage: (): void => {
      throw new Error(
        "a provider turn was issued: no callee runs an `@`-query, so this witness must stay " +
          "fully offline",
      );
    },
```

`dispatchCtx(cwd)`, byte-identical (`diff` against the same range in the
sibling file exits 0). `tests/b0293-invoke-callee-cause-partition.test.ts:135-149`:
```ts
function dispatchCtx(cwd: string): ExtensionCommandContext {
  return {
    cwd,
    signal: undefined,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
    waitForIdle: (): Promise<void> => Promise.resolve(),
    isIdle: (): boolean => true,
    abort: (): void => {},
  } as unknown as ExtensionCommandContext;
}
```
(byte-identical at `tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts:180-194`;
`loadCtx(cwd)` is likewise byte-identical at `:127-133` / `:172-178`, and
`noteContents()` at `:152-156` / `:197-201`.)

`errNote(slashName)`, one word differs in the doc comment.
`tests/b0293-invoke-callee-cause-partition.test.ts:158-172`:
```ts
/** The single top-level `Err` note one dispatch produced. Zero — or more than
 *  one — fails loudly naming the whole channel, so a compile/fixture/harness
 *  fault can never masquerade as the wrong cause. */
function errNote(slashName: string): string {
  const rows = noteContents().filter((content) =>
    content.startsWith(`theta /${slashName} returned Err:`),
  );
  if (rows.length !== 1) {
    throw new Error(
      `harness precondition unmet: /${slashName} produced ${String(rows.length)} top-level ` +
        `Err notes, expected exactly 1 — channel: ${JSON.stringify(noteContents())}`,
    );
  }
  return rows[0] as string;
}
```
`tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts:203-217` (only
"the wrong cause" becomes "a missing suffix"):
```ts
/** The single top-level `Err` note one dispatch produced. Zero — or more than
 *  one — fails loudly naming the whole channel, so a compile/fixture/harness
 *  fault can never masquerade as a missing suffix. */
function errNote(slashName: string): string {
  const rows = noteContents().filter((content) =>
    content.startsWith(`theta /${slashName} returned Err:`),
  );
  if (rows.length !== 1) {
    throw new Error(
      `harness precondition unmet: /${slashName} produced ${String(rows.length)} top-level ` +
        `Err notes, expected exactly 1 — channel: ${JSON.stringify(noteContents())}`,
    );
  }
  return rows[0] as string;
}
```

The dispatch loop and teardown, byte-identical.
`tests/b0293-invoke-callee-cause-partition.test.ts:205-215`:
```ts
  for (const stem of TOP_LEVEL_STEMS) {
    const fixture = fixtures.find((f) => f.slashName === stem);
    if (fixture === undefined) {
      throw new Error(
        `harness precondition unmet: /${stem} did not register through the production ` +
          `composition root — registered: ${JSON.stringify(fixtures.map((f) => f.slashName))}`,
      );
    }
    await fixture.run("", dispatchCtx(workspaceDir));
  }
}, 60_000);
```
identical at `tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts:254-264`;
the `afterAll` that follows is byte-identical too —
`tests/b0293-invoke-callee-cause-partition.test.ts:217-221`:
```ts
afterAll(() => {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});
```
identical at `tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts:266-270`.

The third site (out of this wave's scope, cited only as duplication
evidence). `tests/slsh5-invoke-cascade-chain-suffix.test.ts:161-174` reuses
the same five function names and the same field set, reworded:
```ts
function hostPi(): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    registerMessageRenderer: (): void => {},
    sendUserMessage: (): void => {
      throw new Error(
        "a provider turn was issued: the leaf `@`-query must short-circuit on its empty " +
          "rendered template, which is what keeps this witness offline",
      );
    },
```
and its `beforeAll` opens with the identical
`realpathSync(mkdtempSync(join(tmpdir(), "theta-bug<N>-")))` /
`join(workspaceDir, ".pi", "theta")` / `mkdirSync(thetaDir, { recursive:
true })` sequence as the two in-scope files (`:241-243`, vs
`tests/b0293-invoke-callee-cause-partition.test.ts:186-188` and
`tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts:230-232`), only
the temp-dir prefix and surrounding comment wording differing.

Pattern search, exact hit counts across all of `tests/*.test.ts`:
`function hostPi\(\): ExtensionAPI` → 3 (the three files above);
`function loadCtx\(cwd: string\): ExtensionContext` → 3 (same three);
`function dispatchCtx\(cwd: string\): ExtensionCommandContext` → 3 (same
three); `function noteContents\(\): readonly string\[\]` → 3 (same three);
`function errNote\(slashName: string\): string` → 3 (same three). No other
file in `tests/` defines any of these five signatures.

## Why this is a problem
This is the "Boilerplate duplication" class: the same multi-function
harness — composing a temp `.pi/theta/` workspace through the real
`discoverAndComposeFixtures`, dispatching each planted top-level fixture,
and reading its `theta-system-note` channel through a fail-loud `errNote`
— is authored from scratch in two of this review's files and a third
sibling, rather than drawn from one shared place. `tests/helpers/` already
holds a precedent for centralising this exact class of setup for the
composition root's OTHER entry point: `tests/helpers/compose-workspace-harness.ts`
(built for the `composeExtensionInstance`-driving file family, per its own
header) exports a `makeHost`/`finishWorkspace` pair so those files stopped
redefining their host double and workspace planter individually. No
analogous module exists yet for the `discoverAndComposeFixtures` +
slash-dispatch + `theta-system-note`-channel-reading family, so each of the
three files above reimplements it in full, and two of the five functions
(`loadCtx`, `dispatchCtx`) plus the dispatch-loop/teardown tail are
byte-identical between the two in-scope files while the other three differ
only in incidental wording.

## Suggested direction (non-binding, optional)
`tests/helpers/` is where this repository already centralises exactly this
class of harness for the sibling `composeExtensionInstance` family
(`compose-workspace-harness.ts`); a comparable module for the
`discoverAndComposeFixtures` + slash-dispatch + `theta-system-note`-reading
sequence is the home the three independent copies already point at. That
existing sibling module's host double no-ops `sendUserMessage` rather than
throwing on it, so it is not itself a drop-in for these three files — only
an observation that the repository has already solved this class of
duplication once, for the neighbouring entry point.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or its
  named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate). The
  substring "gate" appears inside "propagated" in
  `b0294-callee-propagated-invoke-infra-wrapped.test.ts`'s filename by
  coincidence only; the file asserts per-callee SLSH-5 wrap behaviour over
  planted fixtures, not a pinned corpus census or inventory count, so the
  carve-out does not apply.
- Recording-double check: `notes`/`RecordedMessage` is a recording array
  `errNote`/`noteContents` read from, but this finding is that the
  harness's DEFINITION (the five functions plus the surrounding
  setup/dispatch/teardown) is copied across files, not that any
  MUST-NOT-called witness built on it is unsound — the negative-witness
  carve-out does not cover that distinct claim.
- docs/bugs/ signature search: `grep -rl "<the three file names>"
  docs/bugs/` finds each file's own originating bug
  (`0293-invoke-callee-load-parse-causes-shifted.md`,
  `0088-slsh5-chain-suffix-never-emitted.md` — ordinary self-reference to
  their own witness, no harness-sharing rationale stated) plus
  `0391-slsh5-chain-suffix-native-backslash-paths.md`, whose own §Tests
  section (lines 254-257) names both
  `tests/slsh5-invoke-cascade-chain-suffix.test.ts` and
  `tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts` as
  "PARENT-RATIFIED" compensating witnesses for that fix. This finding does
  not propose merging, renaming, or deleting either file — only that the
  harness sequence each independently defines could be centralised — so
  that citation is not disturbed. No docs/bugs entry offers a rationale for
  keeping the three copies unshared, and none of the three files' own
  comments claim the duplication is deliberate (searched
  "mirrors|copied|copies unchanged|modelled on|duplicated from" against all
  three; no hits).
- coverage-matrix/bug-doc citation search: `grep -n "<the three file
  names>" docs/reference/coverage-matrix.md` → 0 hits for all three files.
- Coverage-drift check: the claim is about a repeated harness DEFINITION
  (setup/dispatch/teardown plumbing), not a missing test path; every cited
  function is exercised by its own file's existing, currently-passing
  cells, and no cell's assertions are disputed by this finding.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified byte-for-byte: dispatchCtx/loadCtx/the dispatch-loop+afterAll tail are diff-identical and hostPi/errNote differ only in thrown/comment wording at the cited lines in both in-scope files, the 5-signature pattern search reproduces exactly 3/3/3/3/3 hits repo-wide, and tests/helpers/ has no matching export (compose-workspace-harness.ts targets composeExtensionInstance with a no-op sendUserMessage; production-load-harness.ts wraps discoverAndComposeFixtures but never dispatches fixtures or records theta-system-note messages) — a distinct, unacknowledged root cause from any tracked PTQ, structurally matching this repo's own already-confirmed-and-fixed sibling harness-duplication findings (triage: claude-opus-5)
