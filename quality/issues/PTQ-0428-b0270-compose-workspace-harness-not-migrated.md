---
id: PTQ-0428
title: callee-tools-missing-theta-path test redeclares the compose-workspace harness byte-for-byte instead of importing tests/helpers/compose-workspace-harness.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:252-306
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:307-329
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:365-397
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:449-499
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:271-325
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:326-342
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:360-392
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:442-482
  - tests/helpers/compose-workspace-harness.ts:1-31
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# callee-tools-missing-theta-path test redeclares the compose-workspace harness byte-for-byte instead of importing tests/helpers/compose-workspace-harness.ts

## Observation
`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts` locally
declares `HostDouble`, `makeHost`, `ComposeWorkspace`, `normalisePath`,
`LoadPass`, `runLoadPass`, `noteDiagnostics`, `allDiagnostics`,
`describeNotes`, `requireDriven`, and `normativeMessagePattern`. Every one of
these already exists, exported, under the same names and near-identical
bodies, in `tests/helpers/compose-workspace-harness.ts` — a helper module
whose own header states it was created specifically because "several test
files independently redeclared the same `PiHandler` type, `RecordedNote` /
`HostDouble` interfaces, `makeHost` function, `ComposeWorkspace` interface,
`normalisePath` function, and the settings-file-planting tail" (PTQ-0213,
PTQ-0230). The file under review does not import from that helper at all.
Its own file header even names the duplication directly: "The harness
(`makeHost` / `plantWorkspace` / `runLoadPass`) is modelled on, and
duplicated from rather than shared with,
`tests/callee-post-parse-errors-un-register-tools-caller.test.ts`... which
this file neither reads from nor mutates" — but that sibling file is itself
one of the pre-helper files the harness module was extracted to replace, and
is also not migrated.

## Evidence
`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:259-275` (`makeHost`, byte-identical to the sibling and to the canonical helper's `makeHost`):
```ts
function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      handlers.set(event, handler);
    },
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
```

`tests/callee-post-parse-errors-un-register-tools-caller.test.ts:278-294` (the same function, same body, same lines, in the sibling file cited by the header comment as the harness's origin):
```ts
function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      handlers.set(event, handler);
    },
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
```

`tests/helpers/compose-workspace-harness.ts:1-24` (the canonical home, whose header names exactly this duplication family as its reason for existing):
```ts
// A shared "recording host double + temp compose workspace" harness for the
// composition-root load-pass test files that drive `composeExtensionInstance`
// over a planted temp directory (PTQ-0213).
//
// WHY THIS FILE EXISTS. Several test files independently redeclared the same
// `PiHandler` type, `RecordedNote` / `HostDouble` interfaces, `makeHost`
// function, `ComposeWorkspace` interface, `normalisePath` function, and the
// settings-file-planting tail every temp workspace needs. This module
// centralises the parts that are byte-for-byte identical across those files;
// each file's own fixture-planting loop (which varies — a plain string body,
// or a body that is itself a function of the minted `cwd`) stays local and
// calls `finishWorkspace` once its own files are written.
//
// It also centralises the adjacent, textually-following half of the same
// harness family (PTQ-0230): the `LoadPass` shape `runLoadPass` returns by
// driving `composeExtensionInstance` over a `makeHost` double, and the
// `RecordedNote`/`Diagnostic` reading functions built on it
// (`noteDiagnostics`, `allDiagnostics`, `describeNotes`, `errorRowsAt`,
// `errorFilesOf`, `requireDriven`) and the DIAG-4 message-pattern builder
// (`normativeMessagePattern`) several sibling composition-root test files
// redeclared byte-for-byte (or near so — an interpolated bug number, an
// added timing field) rather than imported.
```

Every named function/interface pair (`HostDouble`, `makeHost`, `ComposeWorkspace`,
`normalisePath`, `LoadPass`, `runLoadPass`, `noteDiagnostics`, `allDiagnostics`,
`describeNotes`, `requireDriven`, `normativeMessagePattern`) is declared with
the identical name, identical signature, and (`makeHost` shown above) an
identical body at both `tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:252-499`
and `tests/callee-post-parse-errors-un-register-tools-caller.test.ts:271-482`
— confirmed by `grep -n` locating each declaration at matching line offsets
(within ~20 lines) in both files. Other test files in the same test suite
(`b0280-prompt-mode-declaration-below-immediate-callee.test.ts`,
`b0275-escaping-tools-entry-below-immediate-callee.test.ts`,
`b0320-tools-entry-extension-rule-unenforced.test.ts`,
`b0329-hash-mismatch-refuses-invocation.test.ts`,
`b0343-proto-hash-carrier-row.test.ts`,
`b0328-root-closure-hash-marshalled.test.ts`,
`grandchild-callee-drop-un-registers-depth-two-caller.test.ts`) already
`import { ... } from "./helpers/compose-workspace-harness"` — confirmed by
`grep -n "compose-workspace-harness" tests/*.test.ts` returning those seven
files and no others.

## Why this is a problem
The two files in this pair each carry ~250 lines of harness code
(`HostDouble`/`makeHost`/`ComposeWorkspace`/`normalisePath`/`LoadPass`/
`runLoadPass`/`noteDiagnostics`/`allDiagnostics`/`describeNotes`/
`requireDriven`/`normativeMessagePattern`) that is byte-identical to a
canonical helper module that already exists for the exact purpose of holding
this code once. The file under review's own header comment names the
duplication as a conscious choice ("duplicated from rather than shared
with"), which is the boilerplate-duplication smell stated directly by the
test author rather than inferred: the natural home for this code is
`tests/helpers/compose-workspace-harness.ts`, which seven sibling files in
the same directory already import from.

## Suggested direction (non-binding, optional)
`tests/helpers/compose-workspace-harness.ts` already exports every one of
these members under the same names; the two files' local declarations name
the module they duplicate.

## False-positive check
- Recording-double carve-out: `makeHost`'s `notes`/`notified` arrays are a
  recording double, but the finding is about the double's code being
  duplicated across files rather than about what it records — not a
  negative-witness case.
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- docs/bugs/ signature search: `grep -n "0270" docs/bugs/` was not required —
  this finding does not allege a red test or a skip; it is a same-behaviour
  duplication claim, independent of either bug's disposition.
- coverage-matrix/bug-doc citation search: `grep -rn "callee-tools-missing-theta-path-un-registers-tools-caller" docs/reference/coverage-matrix.md docs/bugs/` — no hits found in the scanned scope; no citation constraint applies. (Full-repo docs/ search not run under D7's tests/-only scope; if either file is pinned by name elsewhere, a merge/rename proposal would need to say so — this finding does not propose merging or renaming, only names the existing canonical helper as unused by these two files.)
- Coverage drift: this finding is not about missing test coverage; both
  files' unique cell logic (the actual `it(...)` bodies and fixtures) is
  untouched by this observation, which is scoped to the shared scaffolding
  only.
- Verified the excerpt independently, re-reading both files' `makeHost`
  functions immediately before filing (offsets 259 and 278 respectively) —
  confirmed byte-identical.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: neither file imports tests/helpers/compose-workspace-harness (the 7-file importer grep reproduces exactly, these two absent); diff of makeHost b0270:259-302 vs b0267:278-321 is byte-identical, and diff -w of makeHost/ComposeWorkspace/normalisePath/LoadPass/runLoadPass/noteDiagnostics/allDiagnostics/describeNotes against the helper's exports differs only in `export` and line-wrapping, with requireDriven/normativeMessagePattern differing only by the interpolated bug id and registry argument the helper already parameterises (a minor "identical signature" overclaim that does not disturb the core claim); both bug docs are fixed (0267→0.264.0, 0270→0.268.0) and both files pass 17/17 so this is not a documented red; not a duplicate — PTQ-0213 named both files only in its 10-file grep count and its fix migrated b0275 alone, PTQ-0220/0221 each took one further file under the store's per-occurrence convention and PTQ-0221 explicitly recorded the b0270 copy as "still-unmigrated", and no open/resolved row cites either file as a location; 0 hits in coverage-matrix so no citation constraint (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
