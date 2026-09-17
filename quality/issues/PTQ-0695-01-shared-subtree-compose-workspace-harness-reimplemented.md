---
id: PTQ-0695
title: tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts re-declares tests/helpers/compose-workspace-harness.ts's makeHost/ComposeWorkspace/runLoadPass/noteDiagnostics family instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts:384-624
  - tests/helpers/compose-workspace-harness.ts:47-241
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts re-declares tests/helpers/compose-workspace-harness.ts's makeHost/ComposeWorkspace/runLoadPass/noteDiagnostics family instead of importing it

## Observation
`tests/helpers/compose-workspace-harness.ts` exists specifically to
centralise the "recording host double + temp compose workspace" shape for
files that drive `composeExtensionInstance` (its own header cites PTQ-0213 /
PTQ-0230 as the reason it was created, and `tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts`
imports its `runLoadPass` as `runLoadPassCore`). `tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts`
does not import this module at all: it re-declares the `PiHandler` type, the
`RecordedNote`/`HostDouble`/`ComposeWorkspace`/`LoadPass` interfaces, and the
`makeHost`, `normalisePath`, `noteDiagnostics`, `allDiagnostics`,
`describeNotes`, `errorFilesOf`, `requireDriven` and `normativeMessagePattern`
functions locally, each matching the helper's own shape line-for-line apart
from the extensions this file needs (a `snapshotReads` counter on the host
double, and `elapsedMs`/`judgements` fields threaded through `LoadPass`).
The file's own header even names the file it modelled the harness on
("modelled on, and duplicated from rather than shared with,
`tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts`") without
mentioning that that file itself imports the canonical helper this one
reimplements instead.

## Evidence
tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts:384-452
(re-read immediately before filing):
```ts
type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notes: RecordedNote[];
  readonly notified: Array<readonly [string, string]>;
  /** How many times the composition root read the registry snapshot. */
  readonly snapshotReads: { count: number };
}

function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const snapshotReads = { count: 0 };
```

tests/helpers/compose-workspace-harness.ts:47-70 (the canonical shape this
mirrors, apart from the `snapshotReads` field):
```ts
export type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

export interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

export interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notes: RecordedNote[];
  readonly notified: Array<readonly [string, string]>;
}

/** A recording `ExtensionAPI` / `ExtensionContext` pair for `composeExtensionInstance`. */
export function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();
```

tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts:454-471
(`ComposeWorkspace` + `normalisePath`, identical in shape and body to the
helper's exports at compose-workspace-harness.ts:105-122):
```ts
interface ComposeWorkspace {
  readonly cwd: string;
  /** Absolute, separator-normalised path of a file planted on the project source. */
  path: (name: string) => string;
  readonly dispose: () => void;
}

/** Separator-normalise a path so Win32 `\` and POSIX `/` spellings compare. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts:528-576
(`noteDiagnostics`/`allDiagnostics`/`describeNotes`/`errorFilesOf`, identical
in body to compose-workspace-harness.ts:164-204):
```ts
function noteDiagnostics(note: RecordedNote): readonly Diagnostic[] {
  const details = note.details as { diagnostics?: unknown } | undefined;
  const diagnostics = details?.diagnostics;
  if (!Array.isArray(diagnostics)) {
    expect.fail(
      `system note carries no details.diagnostics array: ${JSON.stringify(note.details)}`,
    );
  }
  return diagnostics as readonly Diagnostic[];
}

function allDiagnostics(notes: readonly RecordedNote[]): readonly Diagnostic[] {
  return notes.flatMap((note) => [...noteDiagnostics(note)]);
}

function describeNotes(notes: readonly RecordedNote[]): string {
  return notes.length === 0
    ? "[] (NO NOTE ON THE CHANNEL)"
    : notes.map((n, i) => `[${i}] ${n.content}`).join("\n");
}
```

tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts:369-383
(`normativeMessagePattern`, same escaping/placeholder logic as
compose-workspace-harness.ts:221-241, differing only in reading its own
in-file `REGISTRY` constant rather than taking one as a parameter):
```ts
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      "harness: the docs/spec_topics/diagnostics/ registry pages carry no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}
```

## Why this is a problem
`tests/helpers/compose-workspace-harness.ts` was written, by its own header
comment, to stop composition-root load-pass test files from independently
redeclaring this exact `PiHandler`/`RecordedNote`/`HostDouble`/
`ComposeWorkspace`/`normalisePath`/`LoadPass`/`runLoadPass`/`noteDiagnostics`/
`allDiagnostics`/`describeNotes`/`errorFilesOf`/`requireDriven`/
`normativeMessagePattern` family, and a sibling file
(`tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts`) already
imports it. `tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts`
instead re-derives the whole family from scratch, so a change to the
`RecordedNote`/`HostDouble` shape the shipped `composeExtensionInstance`
consumes, or to the `describeNotes`/`errorFilesOf` reading logic, must be
hand-applied here in addition to the helper module.

## Suggested direction (non-binding, optional)
The file's own extensions (the `snapshotReads` judgement counter and the
`elapsedMs`/`judgements` fields on `LoadPass`) are the only parts that differ
from `tests/helpers/compose-workspace-harness.ts`; the rest of the family
already has a home in that module.

## False-positive check
- Gate-pin check: the file name does not match `*gate*.test.ts` or the named
  gate kin; not applicable.
- Recording-double check: `notes`/`notified`/`snapshotReads` back genuine
  positive and negative assertions in this file's own tests (judgement
  counts, registered-file sets, absence of diagnostics); this finding targets
  the redeclared harness definition, not the validity of any assertion built
  on it.
- docs/bugs/ signature search: `docs/bugs/0276-depth-walk-revisits-shared-subtrees-exponentially.md`
  is Status fixed (0.271.0) and names this file as its witness; this is not a
  documented correct-reason red, and this finding proposes no merge, rename
  or deletion of the file or any `it()`/`describe()` inside it — only that
  the harness pieces already covered by `tests/helpers/compose-workspace-harness.ts`
  could be imported rather than redeclared.
- coverage-matrix/bug-doc citation search: `grep -n "shared-subtree-judged-once-per-pass"
  docs/reference/coverage-matrix.md` → 0 hits.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every member of this file's double is exercised by its
  own tests.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: zero imports of compose-workspace-harness in the file (grep exit 1) while 7 siblings incl. grandchild-callee-drop (runLoadPass as runLoadPassCore, lines 14-17) import it; export-stripped diff shows PiHandler/RecordedNote/HostDouble/makeHost identical apart from the snapshotReads/frozen-snapshot getAllTools counter, ComposeWorkspace/normalisePath and noteDiagnostics/allDiagnostics/describeNotes byte-identical, LoadPass/runLoadPass identical apart from elapsedMs/judgements, requireDriven differing only by the hardcoded "0276" the helper already parametrises as bugId, and normativeMessagePattern differing only by the REGISTRY argument the helper already takes; one correction — errorFilesOf is NOT identical (this file's copy de-duplicates via new Set with a stated multiplicity rationale at 547-562, so it stays a local variant), which trims the family but not the finding; coverage-matrix 0 hits and bug 0276 Status fixed reproduce; not a duplicate — PTQ-0213/0220/0221 name this file only inside their pattern-search enumerations, never as a cited location, and PTQ-0220's triage ruled such residuals distinct per-occurrence filings; sibling intake d7-108-02 is the disjoint registry-oracle REGISTRY read (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
