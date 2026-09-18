---
id: PTQ-1039
title: b0378 redeclares makeHarness/Harness/structuralNotesSince already exported by tests/helpers/watch-arming-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0378-watch-root-case-variant-double-arming.test.ts:187-254
  - tests/helpers/watch-arming-harness.ts:68-132
  - tests/helpers/watch-arming-harness.ts:260-266
  - tests/helpers/watch-arming-harness.ts:308-316
sites: 3                     # count of occurrences cited in Evidence (Harness/makeHarness, RecordedNote, structuralNotesSince)
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0378 redeclares makeHarness/Harness/structuralNotesSince already exported by tests/helpers/watch-arming-harness.ts

## Observation
tests/b0378-watch-root-case-variant-double-arming.test.ts declares its own
module-scope `Harness` interface, `makeHarness(cwd, flags)` fake-`pi`/`ctx`
factory, and `structuralNotesSince(harness, from)` filter (lines 187-254).
tests/helpers/watch-arming-harness.ts already exports a `makeHarness(cwd,
flags, options)` with an equivalent `pi`/`ctx`/`fire` body (including a
`getFlag(flags)` lookup and an `options.sendMessage` hook that reproduces
exactly the note-recording behaviour b0378 hardcodes), plus a
`RecordedNote`/`WatchNoteDetails`-typed `structuralNotesSince` doing the
identical `notes.slice(from).filter(note.content.startsWith("theta
watcher:"))` filter. tests/b0312-out-of-root-thetalib-watch-closure.test.ts —
reviewed in this same scope — imports `makeRecordingHarness`,
`structuralNotesSince`, and `WatchNoteDetails` from this exact helper module
instead of redeclaring them (its own line 26-30 import block). The helper's
`makeHarness`/`structuralNotesSince` exports were the fix for PTQ-0530 ("b0311
and b0312 each re-declare an identical …harness"; status: fixed), whose
locations list cited only b0311/b0312 and did not include b0378.

## Evidence

tests/b0378-watch-root-case-variant-double-arming.test.ts:187-254 (re-read
immediately before filing):
```ts
interface Harness {
  readonly pi: ExtensionAPI;
  readonly notes: RecordedNote[];
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string, flags: Readonly<Record<string, string>>): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (name: string): string | undefined => flags[name],
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: { customType: string; content: string; display: boolean; details: unknown },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({ ... });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;
  ...
  return { pi, notes, fireSessionStart: () => fire("session_start") };
}

/** The structural-change notes recorded since `from` (content-keyed). */
function structuralNotesSince(harness: Harness, from: number): RecordedNote[] {
  return harness.notes
    .slice(from)
    .filter((note) => note.content.startsWith("theta watcher:"));
}
```

tests/helpers/watch-arming-harness.ts:68-118 (the exported `makeHarness`,
already parameterised for exactly this use — a `flags` argument feeding
`getFlag`, plus an `options.sendMessage` hook a caller wires to push into its
own `notes` array):
```ts
export function makeHarness(
  cwd = "/does/not/matter",
  flags: Readonly<Record<string, string>> = {},
  options: {
    onRegisterCommand?: (name: string, options: unknown) => void;
    ...
    sendMessage?: (
      message: { customType: string; content: string; display: boolean; details: unknown },
      options: { triggerTurn: unknown },
    ) => void;
    sendUserMessage?: boolean | ((...args: unknown[]) => void);
  } = {},
): Harness {
  ...
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, commandOptions: unknown): void => {
      options.onRegisterCommand?.(name, commandOptions);
      commands.set(name, commandOptions);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (name: string): string | undefined => flags[name],
    ...
    sendMessage: options.sendMessage ?? ((): void => {}),
    ...
  } as unknown as ExtensionAPI;
```

tests/helpers/watch-arming-harness.ts:308-316 (the exported
`structuralNotesSince`, identical filter):
```ts
export function structuralNotesSince(
  harness: RecordingHarness<WatchNoteDetails>,
  from: number,
): RecordedNote<WatchNoteDetails>[] {
  return harness.notes
    .slice(from)
    .filter((note) => note.content.startsWith("theta watcher:"));
}
```

tests/b0312-out-of-root-thetalib-watch-closure.test.ts:26-30 (the sibling
file in this same scope, importing rather than redeclaring):
```ts
import { FakeClock } from "./helpers/fake-clock";
import { norm, settle, waitFor } from "./helpers/fake-file-watcher";
import {
  makeRecordingHarness,
  structuralNotesSince,
  type RecordingHarness,
  type WatchNoteDetails,
} from "./helpers/watch-arming-harness";
```

Search run: `grep -n "^function makeHarness\|^interface Harness\|^function structuralNotesSince" tests/b0378-watch-root-case-variant-double-arming.test.ts` → 3 hits (187, 196, 250), none imported from tests/helpers.

## Why this is a problem
This is the "copy-paste fixtures/doubles" class: the fake `pi`/`ExtensionContext`
harness and its note-filtering helper already live in
`tests/helpers/watch-arming-harness.ts` — the same module a sibling file in
this exact review batch imports from for this exact purpose — yet b0378
retypes the whole block locally. b0378's own header comment (lines 65-68 of
the file) states the harness "mirrors … b0310's flags plumbing … with
b0311/b0312's `sendMessage` note recorder", i.e. the author read two other
files' shapes and reproduced them by hand rather than importing the already-
exported combination, so a future change to the fake `pi`/`ctx` contract
(e.g. a new field `sendMessage`'s callers must thread, or a change to how
`getCommands()` merges foreign entries) landing in the helper would leave
b0378 checking a stale double with no drift signal in either file.

## Suggested direction (non-binding, optional)
Replacing the local `Harness`/`makeHarness`/`structuralNotesSince` block with
`makeHarness(workspace, flags, { sendMessage: (message, options) => notes.push(...) })`
and the imported `structuralNotesSince`/`WatchNoteDetails` from
`tests/helpers/watch-arming-harness.ts` is the path the module's own exported
API and the sibling b0312 import already establish; this names where the
duplicate already points, not a design for the change.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or a named kin; no pinned
  count or inventory is touched.
- Recording-double check: `makeHarness`'s `sendMessage` does record every call
  into `notes`, but the duplication claim here is about the harness CODE being
  written twice, not about a "never called" negative witness; cells 1/3
  positively assert on `armedMatchCount`/`currentRoots`, and cells 2/4 assert
  presence/content of a note within a filtered window — the ordinary
  recording-fake usage pattern this repository already follows, not the
  MUST-NOT-witness carve-out.
- docs/bugs/ signature search: docs/bugs/0378-watch-root-union-case-variant-double-arming.md
  backs this file's RED-at-fork cells by design; that governs the assertions'
  correct-reason-red posture, not the harness-setup code (which compiles and
  runs identically regardless of whether it is imported or retyped).
- coverage-matrix/bug-doc citation search: `grep -n
  "b0378-watch-root-case-variant-double-arming" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file or
  any `it()`/`describe()` block, only that the local harness block could be
  imported instead of retyped.
- Prior-finding overlap: `grep -rl "b0378" quality/issues/*.md
  quality/resolved/*.md` → PTQ-0236 (fixed, scoped to b0310/b0339, cites
  b0378's `norm` function only as pattern context, not as a location), PTQ-0438
  (fixed, covers only the `boot()` sequence, explicitly scoped away from b0378
  as "outside this wave's assigned scope"), PTQ-0897 (fixed, covers b0312's
  `norm`/`settle`, naming b0378's `norm` copy as "a separate out-of-wave
  residual to fold in at fix time" — a different function from the
  `makeHarness`/`structuralNotesSince` pair filed here), PTQ-0964 (fixed,
  covers `waitFor`, not `makeHarness`/`structuralNotesSince`), PTQ-0530 (fixed,
  cites only b0311/b0312's harness redeclaration, not b0378's). None of these
  covers the `Harness`/`makeHarness`/`structuralNotesSince` trio at b0378;
  distinct site, not a duplicate.
- Coverage-drift check: this finding is about test-support code duplicated
  across files that both exist and run; it makes no claim that any path or
  behaviour is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: b0378 declares `interface Harness` (:187), `makeHarness(cwd, flags)` (:196-248), `structuralNotesSince` (:250-254) and `RecordedNote` (:94) module-scope and imports nothing from tests/helpers/watch-arming-harness.ts (its only helper imports are FakeClock and waitFor), while the helper exports `makeHarness(cwd, flags, { sendMessage, … })` (:68-132) whose `pi`/`ctx`/`fire` body is a strict parameterised superset of b0378's (same `registerFlag`/`on`/`getFlag: flags[name]`/`ctx` shape; b0378's `sendMessage` recorder is byte-for-byte the `notes.push({customType, content, display, details, triggerTurn})` block `makeRecordingHarness` :286-306 wires through that hook), plus `RecordedNote`/`WatchNoteDetails` (:260-275) and `structuralNotesSince` (:309-316) whose filter body is identical modulo the generic signature; b0312 (same batch) already imports `makeRecordingHarness`/`structuralNotesSince`/`WatchNoteDetails` from that module (:28-33); the helper is imported by 25 tests/*.test.ts files, docs/reference/coverage-matrix.md cites b0378 0 times, docs/bugs/0378 governs the RED cells' assertions not the harness setup, and PTQ-0530/PTQ-0363/PTQ-0438/PTQ-0897/PTQ-0964 and the triage log never cite b0378's harness trio — a distinct unmigrated copy-paste double, not a duplicate; one fix-stage note: `makeRecordingHarness` (:286-289) takes no `flags`, so the fixer threads `flags` there or builds a `RecordingHarness` over `makeHarness(cwd, flags, { sendMessage })` (triage: claude-fable-5-1)
