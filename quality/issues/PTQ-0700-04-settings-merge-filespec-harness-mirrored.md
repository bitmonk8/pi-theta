---
id: PTQ-0700
title: settings-merge.test.ts's HOME/CWD/PROJECT_PATH/GLOBAL_PATH/FileSpec/build/byCode harness is mirrored (per its own sibling's comment) rather than shared
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/settings-merge.test.ts:23-53
  - tests/execution-status-settings-progress.test.ts:18-38
  - tests/subagent-placement-settings.test.ts:18-38
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# settings-merge.test.ts's HOME/CWD/PROJECT_PATH/GLOBAL_PATH/FileSpec/build/byCode harness is mirrored (per its own sibling's comment) rather than shared

## Observation
`tests/settings-merge.test.ts` declares the `HOME`/`CWD`/`PROJECT_PATH`/
`GLOBAL_PATH` resolved-path constants, a `FileSpec` interface, an `EMPTY`
fixture, a `build(project, global): FileSystem` function placing settings
files at those two resolved paths on a `FakeFileSystem`, and a
`byCode(diagnostics, code)` filter. `tests/execution-status-settings-progress.test.ts`
declares the identical four constants, an identical (narrower) `FileSpec`,
the identical `EMPTY`, an identical `build`, and a byte-identical `byCode` —
and its own header comment says so directly: "Mirrors
`tests/settings-merge.test.ts`'s `FileSpec`/`build`/`byCode` harness exactly
(same FakeFileSystem-backed `loadSettings` entry point)."
`tests/subagent-placement-settings.test.ts` declares the same four constants
and a byte-identical `byCode`, with a `build` that takes raw JSON values
instead of a `FileSpec`. No `tests/helpers/` module exports this family; all
three files redeclare it independently.

## Evidence
tests/settings-merge.test.ts:23-53 (re-read immediately before filing):
```ts
const HOME = "/home/theta";
const CWD = "/project";
const PROJECT_PATH = "/project/.pi/settings.json";
const GLOBAL_PATH = "/home/theta/.pi/agent/settings.json";

/** One settings file's on-disk state: present-with-content, unreadable, or (omitted) missing. */
interface FileSpec {
  readonly content?: string;
  readonly error?: string;
}

/** A valid, empty settings file — contributes no keys and no diagnostics. */
const EMPTY: FileSpec = { content: "{}" };

/** Build a FileSystem fake placing the two settings files at their resolved paths. */
function build(project: FileSpec, global: FileSpec): FileSystem {
  const files: Record<string, string> = {};
  const errors: Record<string, string> = {};
  if (project.content !== undefined) files[PROJECT_PATH] = project.content;
  if (project.error !== undefined) errors[PROJECT_PATH] = project.error;
  if (global.content !== undefined) files[GLOBAL_PATH] = global.content;
  if (global.error !== undefined) errors[GLOBAL_PATH] = global.error;
  return new FakeFileSystem({ homedir: HOME, cwd: CWD, files, errors });
}

/** Diagnostics matching a registry code. */
function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}
```

tests/execution-status-settings-progress.test.ts:6-9,19-38 (the file's own
attribution comment, immediately followed by the mirrored constants/harness):
```ts
// RFC 0010 (execution-status.md EXST-10) — `tests/execution-status-settings-progress.test.ts`
// (T-CMD settings half). Behaviour-matrix rows B56-B58. Mirrors
// `tests/settings-merge.test.ts`'s `FileSpec`/`build`/`byCode` harness
// exactly (same FakeFileSystem-backed `loadSettings` entry point).
```
```ts
const HOME = "/home/theta";
const CWD = "/project";
const PROJECT_PATH = "/project/.pi/settings.json";
const GLOBAL_PATH = "/home/theta/.pi/agent/settings.json";

interface FileSpec {
  readonly content?: string;
}

const EMPTY: FileSpec = { content: "{}" };

function build(project: FileSpec, global: FileSpec): FileSystem {
  const files: Record<string, string> = {};
  if (project.content !== undefined) files[PROJECT_PATH] = project.content;
  if (global.content !== undefined) files[GLOBAL_PATH] = global.content;
  return new FakeFileSystem({ homedir: HOME, cwd: CWD, files, errors: {} });
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}
```

tests/subagent-placement-settings.test.ts:18-38 (same four constants, the
same byte-identical `byCode`, a `build` over raw JSON values instead of
`FileSpec`):
```ts
const HOME = "/home/theta";
const CWD = "/project";
const PROJECT_PATH = "/project/.pi/settings.json";
const GLOBAL_PATH = "/home/theta/.pi/agent/settings.json";
```
```ts
function build(project: unknown | undefined, global: unknown | undefined): FileSystem {
  const files: Record<string, string> = {};
  if (project !== undefined) files[PROJECT_PATH] = JSON.stringify(project);
  if (global !== undefined) files[GLOBAL_PATH] = JSON.stringify(global);
  return new FakeFileSystem({ homedir: HOME, cwd: CWD, files, errors: {} });
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}
```

Exact search: `grep -n "^function byCode(diagnostics: readonly Diagnostic\[\], code: string)" tests/*.test.ts`
→ 3 hits (settings-merge.test.ts:51, execution-status-settings-progress.test.ts:37,
subagent-placement-settings.test.ts:38); `grep -n "PROJECT_PATH = \"/project/.pi/settings.json\"" tests/*.test.ts`
→ the same 3 files.

## Why this is a problem
`tests/execution-status-settings-progress.test.ts`'s own header states it
mirrors `tests/settings-merge.test.ts`'s harness "exactly", i.e. the author
already recognised the shape as shared at the time of writing and chose to
retype it rather than import it; `tests/subagent-placement-settings.test.ts`
independently arrived at the same four path constants and the same `byCode`
body. A change to the two settings-file resolved paths, or to what counts as
a diagnostic match, is hand-applied in three places today.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently exports the resolved settings-file
paths, a `FileSpec`-over-`FakeFileSystem` builder, or `byCode`; the
self-declared "mirrors exactly" relationship between two of the three files
is the observation that a shared home for this specific `loadSettings`
harness is missing, not a design for one.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the
  named gate kin.
- Recording-double check: not applicable — `FakeFileSystem` here backs
  ordinary positive/negative value assertions on `loadSettings`'s returned
  settings/diagnostics, not a "never called" witness.
- docs/bugs/ signature search: `grep -rln "settings-merge.test.ts\|execution-status-settings-progress.test.ts\|subagent-placement-settings.test.ts" docs/bugs/*.md`
  → no hits naming any of the three as a documented correct-reason red; all
  three suites are green at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "settings-merge.test.ts\|execution-status-settings-progress.test.ts\|subagent-placement-settings.test.ts" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any file
  or `it()`/`describe()` — only that the shared constants/builder/filter
  could be imported rather than redeclared.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; each file's own tests exercise its own copy fully.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines, the "Mirrors … exactly" self-attribution is real at execution-status-settings-progress.test.ts:8-9, `PROJECT_PATH = "/project/.pi/settings.json"` greps to exactly these 3 files, no tests/helpers/ module exports the settings-path constants / a FileSpec-over-FakeFileSystem builder / a Diagnostic-typed byCode (package-merge-e2e-harness.ts's export is typed over CapturedNote), none of the three is a gate test or cited by coverage-matrix.md or docs/bugs/, and no tracked PTQ covers the loadSettings FakeFileSystem harness (0206/0219/0228/0409 are loadRow, 0310/0393 are FakeThetaLibFs, intake d7-02 is b0463's byCode vs a different helper); two corrections for the fixer: the stated byCode search actually returns 10 tests/*.test.ts files (byCode is a repo-wide generic, not harness-specific — sharing it here fixes 3 of 10), and tests/e2e-s5-disc-cli-settings.test.ts:29-34 carries a fourth copy of the same HOME/CWD/resolved-path pair under the names PROJECT_SETTINGS/GLOBAL_SETTINGS that the name-anchored grep missed (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
