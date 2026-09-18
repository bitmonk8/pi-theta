---
id: PTQ-0675
title: The QUALITY_STORE_ROOT child-process spawn wrapper and mkdir-then-write file helper are declared independently in three quality-tool test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/quality-clone-scan.test.ts:26-45
  - tests/quality-size-scan.test.ts:19-35
  - tests/quality-store.test.ts:22-24
  - tests/quality-store.test.ts:48-52
sites: 3
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The QUALITY_STORE_ROOT child-process spawn wrapper and mkdir-then-write file helper are declared independently in three quality-tool test files

## Observation
`tests/quality-clone-scan.test.ts`, `tests/quality-size-scan.test.ts`, and
`tests/quality-store.test.ts` each declare their own module-private
`writeFile(root, relPath, content)` helper (mkdir the parent then write the
file), byte-identical across all three. The first two files also each
declare their own `runScan`/`runStore`-named child-process spawn wrapper
whose body — `spawnSync(process.execPath, [<script>, ...args], { encoding:
"utf8", env: { ...process.env, QUALITY_STORE_ROOT: root } })` — is
byte-identical apart from the constant naming the spawned script; the third
file's `runStore` follows the same shape one parameter list down. The first
two files additionally each declare an identical `writeManifest` helper on
top of `writeFile`.

## Evidence
`tests/quality-clone-scan.test.ts:26-45`:
```ts
function runScan(root: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCAN, ...args], {
    encoding: "utf8",
    env: { ...process.env, QUALITY_STORE_ROOT: root },
  });
}

function writeFile(root: string, relPath: string, content: string): void {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function writeManifest(root: string, relPath: string, files: string[]): string {
  writeFile(root, relPath, files.join("\n") + "\n");
  return relPath;
}
```

`tests/quality-size-scan.test.ts:19-35` (byte-identical to the excerpt
above, `SCAN` bound to a different script path):
```ts
function runScan(root: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCAN, ...args], {
    encoding: "utf8",
    env: { ...process.env, QUALITY_STORE_ROOT: root },
  });
}

function writeFile(root: string, relPath: string, content: string): void {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function writeManifest(root: string, relPath: string, files: string[]): string {
  writeFile(root, relPath, files.join("\n") + "\n");
  return relPath;
}
```

`tests/quality-store.test.ts:22-24` (the spawn wrapper, same shape under
the name `runStore`, spawning `store.mjs` instead of `clone-scan.mjs` /
`size-scan.mjs`):
```ts
function runStore(root: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [STORE, ...args], {
    encoding: "utf8",
    env: { ...process.env, QUALITY_STORE_ROOT: root },
  });
}
```

`tests/quality-store.test.ts:48-52` (the `writeFile` helper, byte-identical
to the other two files'):
```ts
function writeFile(root: string, relPath: string, content: string): void {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}
```

Search: `grep -n "function runScan\|function runStore\|function writeFile\|function writeManifest"
tests/quality-clone-scan.test.ts tests/quality-size-scan.test.ts
tests/quality-store.test.ts` hits exactly these declarations — one
`writeFile` per file (three total, byte-identical bodies), one spawn
wrapper per file (three total, identical bodies apart from the spawned
script constant), and `writeManifest` in the two clone-scan/size-scan files
only (byte-identical bodies). Each file's own opening comment states the
mirroring directly: `tests/quality-clone-scan.test.ts:2-3` reads "Mirrors
tests/quality-size-scan.test.ts's harness shape"; `tests/quality-size-scan.test.ts:2-3`
reads "Mirrors tests/quality-store.test.ts's harness shape".

## Why this is a problem
The three files' own header comments name the mirroring as deliberate, but
the mirrored shape is declared three separate times rather than shared once:
a change to how a scratch fixture file is written (e.g. an encoding fix, a
different mkdir mode) or to how the CLI-under-test is spawned (e.g. an
added env var every quality-tool invocation needs) has to be applied by hand
in three places rather than at one shared declaration each file would import.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting the `writeFile`/`writeManifest` pair and
a spawn-wrapper factory parameterised on the target script path would let
each of the three files import rather than retype this harness; that is an
observation about the natural shared home these three files' own comments
already point toward, not a design.

## False-positive check
- Gate-pin carve-out: none of the three files match `*gate*.test.ts` or the
  named gate kin; not applicable.
- Recording-double carve-out: `writeFile`/`writeManifest`/`runScan`/`runStore`
  are plain filesystem-writing and process-spawning helpers; none records
  calls for a "never called" witness. Not applicable.
- docs/bugs/ signature search: `grep -rln "writeFile\|writeManifest\|QUALITY_STORE_ROOT"
  docs/bugs/` → no hits; none of the three files is a documented
  correct-reason red (all are first-unit-test-of-the-tool files per their
  own headers, exercising the shipped `tools/quality/*.mjs` scripts).
- coverage-matrix/bug-doc citation search: `grep -n
  "quality-clone-scan.test.ts\|quality-size-scan.test.ts\|quality-store.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any test, only that the shared harness code
  be imported rather than retyped in each of the three files.
- Overlap check: `grep -rl "quality-clone-scan.test.ts\|quality-size-scan.test.ts\|quality-store.test.ts"
  quality/intake quality/issues quality/resolved` → no hits; no prior
  candidate or resolved finding names any of these three files.
- Coverage check: the claim is about repeated harness-function DEFINITIONS,
  not a missing test path; every copy is exercised by its own file's tests.

## Triage
verdict: confirmed — independently re-verified: `writeFile` bodies at quality-clone-scan.test.ts:33-37 / quality-size-scan.test.ts:26-30 / quality-store.test.ts:48-52 are byte-identical (diffed), `writeManifest` at clone-scan:39-42 / size-scan:32-35 byte-identical, and the spawn wrappers at clone-scan:26-31 / size-scan:19-24 / store:22-27 differ only in the SCAN/STORE constant; grep confirms these are the only three QUALITY_STORE_ROOT tests and the only three mkdir-then-write copies in tests/, tests/helpers/ already hosts 40 shared harness modules as the established home, the two scan files' headers self-describe the mirroring, no docs/bugs or coverage-matrix row cites any of the three files (the candidate's docs/bugs "no hits" is a minor misstatement — 3 unrelated `writeFileSync` substring hits, none naming these tests), and no existing PTQ names them — D7 boilerplate-duplication class, fix is a mechanical import (triage: claude-fable-5-1)
