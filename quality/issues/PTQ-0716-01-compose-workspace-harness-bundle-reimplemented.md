---
id: PTQ-0716
title: thetalib-reparse-walk-single-delivery.test.ts redeclares the whole tests/helpers/compose-workspace-harness.ts bundle instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/thetalib-reparse-walk-single-delivery.test.ts:183-246
  - tests/thetalib-reparse-walk-single-delivery.test.ts:248-277
  - tests/thetalib-reparse-walk-single-delivery.test.ts:279-320
  - tests/thetalib-reparse-walk-single-delivery.test.ts:321-323
  - tests/thetalib-reparse-walk-single-delivery.test.ts:325-343
  - tests/thetalib-reparse-walk-single-delivery.test.ts:396-400
  - tests/thetalib-reparse-walk-single-delivery.test.ts:450-456
  - tests/helpers/compose-workspace-harness.ts:41-140
sites: 7
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# thetalib-reparse-walk-single-delivery.test.ts redeclares the whole tests/helpers/compose-workspace-harness.ts bundle instead of importing it

## Observation
tests/thetalib-reparse-walk-single-delivery.test.ts declares its own
`PiHandler`, `RecordedNote`, `HostDouble`, `makeHost`, `ComposeWorkspace`,
`normalisePath`, `LoadPass`, `runLoadPass`, `noteDiagnostics`,
`allDiagnostics`, `describeNotes`, and `requireDriven` module-scope, each
functionally and near byte-for-byte identical to the corresponding exported
member of tests/helpers/compose-workspace-harness.ts. That helper module's own
header states it exists precisely because "several test files independently
redeclared" this exact bundle (PTQ-0213 / PTQ-0230), yet this file's local copy
is not one of the ones it names and still redeclares the whole set. The file's
own comment at line ~183 ("Host doubles — modelled on
tests/lex-drop-single-delivery.test.ts") documents that this is a deliberate
re-derivation rather than an import.

## Evidence
tests/thetalib-reparse-walk-single-delivery.test.ts:183-201 (`PiHandler` /
`RecordedNote` / `HostDouble` / the start of `makeHost`):
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
  /** `pi.sendMessage` envelopes the host accepted. */
  readonly notes: RecordedNote[];
  /** `ctx.ui.notify` deliveries the host accepted. */
  readonly notified: Array<readonly [string, string]>;
}

function makeHost(cwd: string): HostDouble {
```

tests/helpers/compose-workspace-harness.ts:41-63 — the exported original
(`PiHandler`/`RecordedNote`/`HostDouble`/`makeHost` signature, byte-for-byte
the same shape, same field names, same handler stub bodies):
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
```

tests/thetalib-reparse-walk-single-delivery.test.ts:248-277 (`ComposeWorkspace`
+ its own fixture-planting `plantWorkspace`, ending with the same
`{cwd, path, dispose}` shape the helper's `finishWorkspace` returns):
```ts
interface ComposeWorkspace {
  /** The discovery-root `ctx.cwd` points at. */
  readonly cwd: string;
  /** Absolute, separator-normalised path of a planted fixture file. */
  path: (name: string) => string;
  readonly dispose: () => void;
}
...
function plantWorkspace(files: Readonly<Record<string, string>>): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0264-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, ".pi", "theta", name), body, "utf8");
  }
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string =>
      normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}
```

tests/helpers/compose-workspace-harness.ts:96-140 (`ComposeWorkspace`,
`normalisePath`, `finishWorkspace` — the same shape the local `plantWorkspace`
above builds around its own file-writing loop, exactly as the helper's own
header predicts callers doing):
```ts
export interface ComposeWorkspace {
  readonly cwd: string;
  path: (name: string) => string;
  readonly dispose: () => void;
}

export function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function finishWorkspace(cwd: string): ComposeWorkspace {
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}
```

tests/thetalib-reparse-walk-single-delivery.test.ts:279-320 (`LoadPass` +
`runLoadPass`) vs tests/helpers/compose-workspace-harness.ts:143-166
(`LoadPass` + `runLoadPass`) — both build a `RendererGate`-undegraded
`composeExtensionInstance(host.pi, host.ctx, undefined, new RendererGate())`
call and return the identical `{notes, offChannel, notified, registered}`
reshape (the local copy additionally omits the helper's `thetas` field).

tests/thetalib-reparse-walk-single-delivery.test.ts:325-343, 396-400, 450-456
(`noteDiagnostics`, `allDiagnostics`, `describeNotes`, `requireDriven`) are
each functionally identical to tests/helpers/compose-workspace-harness.ts's
exported `noteDiagnostics`, `allDiagnostics`, `describeNotes`, and
`requireDriven` (the local `requireDriven` differs only by omitting the
helper's `bugId`-in-message parameter and hard-coding "bug-0264" instead).

## Why this is a problem
tests/helpers/compose-workspace-harness.ts's own header explains it was
created to centralise exactly this bundle because "several test files
independently redeclared" it (citing PTQ-0213/PTQ-0230/PTQ-0300 as the prior
occurrences it consolidated). This file is a further, uncited occurrence of
the same near-verbatim redeclaration: twelve names (`PiHandler`,
`RecordedNote`, `HostDouble`, `makeHost`, `ComposeWorkspace`, `normalisePath`,
`LoadPass`, `runLoadPass`, `noteDiagnostics`, `allDiagnostics`,
`describeNotes`, `requireDriven`) are declared locally rather than imported,
each matching the helper's own exported member closely enough that a reader
comparing the two would call them the same code typed twice.

## Suggested direction (non-binding, optional)
tests/helpers/compose-workspace-harness.ts is the natural home already
observed by its own header comment; the file's `plantWorkspace` fixture-write
loop is the one genuinely local piece (it takes a name→body record rather than
the helper's `PlantedThetaFile[]` shape), matching the "each file's own
fixture-planting loop stays local" pattern the helper module already
documents for its other callers.

## False-positive check
Gate-pin carve-out: the file is named
`thetalib-reparse-walk-single-delivery.test.ts`, not `*gate*.test.ts` or one
of the named gate kin — does not apply. Recording-double carve-out: `notes` /
`notified` on `HostDouble` are MUST-NOT-style recording arrays used for
positive presence assertions (`expectDeliveredExactlyOnce`), not
never-called witnesses — the finding is about the double's *declaration*
being duplicated, not about the recording pattern itself, so the carve-out
does not shield the redeclaration. docs/bugs/ search: grepped for
"thetalib-reparse-walk-single-delivery" and "compose-workspace-harness" under
docs/bugs/ — no hits, so no documented correct-reason red covers this
duplication. coverage-matrix/bug-doc citation search: grepped
docs/reference/coverage-matrix.md and docs/bugs/*.md for this file's name —
no hits, so no citation pins it against consolidation. This finding does not
claim any test should exist or that a path is untested — it is limited to
code that exists being declared twice.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified: every excerpt reproduces at the cited lines and the file never imports tests/helpers/compose-workspace-harness.ts (7 siblings do); function-level diff -w shows makeHost/noteDiagnostics/allDiagnostics/describeNotes/normalisePath and the PiHandler/RecordedNote/HostDouble/ComposeWorkspace declarations byte-identical modulo line-wrap and doc comments, runLoadPass/LoadPass identical except the helper's extra `thetas` field (superset, import-compatible), and plantWorkspace's tail = finishWorkspace — the D7 boilerplate-duplication class with a canonical tests/helpers/ home already built for it (PTQ-0213/0230); two candidate inaccuracies do not disturb the core claim: the local requireDriven is a diverged variant (guard `notes.length === 0` vs the helper's `notes.length === 0 && registered.length === 0`, not merely a hard-coded bugId — the fixer should keep or consciously widen it, noting soleRow still fails loudly), and the "no docs/bugs hits" check is wrong (bugs 0264/0267/0268 cite this file as a witness) but no merge/rename/delete is proposed so the witness-list carve-out is not engaged, and bug 0268 documents normalisePath's retention for the fixture literal only, which an import preserves; not a duplicate — resolved PTQ-0213/0220/0221 name this file only in their pattern-wide rosters and their fixes migrated b0275/b0320/b0329 (PTQ-0220's triage ruled roster mention ≠ coverage), and same-wave d7-01 covers lex-drop-single-delivery.test.ts, a different file (triage: claude-fable-5-1)
