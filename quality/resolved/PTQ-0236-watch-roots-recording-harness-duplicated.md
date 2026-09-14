---
id: PTQ-0236
title: b0310 and b0339 redefine an identical roots-recording FileWatcher harness (RootsRecordingFileWatcher/norm/waitFor/armedRoots) rather than sharing it
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0310-watch-roots-root-union.test.ts:46-145
  - tests/b0339-package-source-watch-arming.test.ts:80-245
sites: 2
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0310 and b0339 redefine an identical roots-recording FileWatcher harness rather than sharing it

## Observation
tests/b0310-watch-roots-root-union.test.ts declares a `RootsRecordingFileWatcher`
class (a `FileWatcher` seam double whose only job is to record each `watch()`
call's `roots` argument), plus `norm`, `waitFor`, and `armedRoots` helper
functions that normalise a path, poll a bounded condition, and read back the
single recorded `watch()` root list (failing loudly on zero or more than one
arming). tests/b0339-package-source-watch-arming.test.ts's own header comment
states it "mirror[s] the harness of `tests/b0310-watch-roots-root-union.test.ts`
EXACTLY (its `RootsRecordingFileWatcher`, `makeHarness`, `boot`, `norm`,
`waitFor`, `armedRoots`)" — and the four cited pieces are, respectively,
byte-identical or near-byte-identical between the two files. Neither file
imports these pieces from a shared module; `tests/helpers/fake-file-watcher.ts`
already exports a canonical `FakeFileWatcher` conforming the same `FileWatcher`
seam, but its `watch()` deliberately discards the `roots` argument (parameter
name `_roots`) because its job is event delivery, not roots-recording, so it
does not already provide the specific observable these two files each
independently re-derive.

## Evidence
tests/b0310-watch-roots-root-union.test.ts:46-58 (comment + class):
```ts
/** FileWatcher seam fake whose only job is to record each `watch()` root list. */
class RootsRecordingFileWatcher implements FileWatcher {
  readonly watchCalls: readonly string[][] = [];

  watch(
    roots: readonly string[],
    _handler: (event: FileWatchEvent) => void,
    _onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    (this.watchCalls as string[][]).push([...roots]);
    return () => {};
  }
}
```

tests/b0339-package-source-watch-arming.test.ts:80-92 — the same class, byte-identical (confirmed via `diff`, zero output):
```ts
/** FileWatcher seam fake whose only job is to record each `watch()` root list. */
class RootsRecordingFileWatcher implements FileWatcher {
  readonly watchCalls: readonly string[][] = [];

  watch(
    roots: readonly string[],
    _handler: (event: FileWatchEvent) => void,
    _onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    (this.watchCalls as string[][]).push([...roots]);
    return () => {};
  }
}
```

tests/b0310-watch-roots-root-union.test.ts:112-115 (`norm`) and :126-145
(`armedRoots`), both byte-identical (confirmed via `diff`, zero output) to
tests/b0339-package-source-watch-arming.test.ts:199-202 and :226-245
respectively:
```ts
function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}
```
```ts
function armedRoots(watcher: RootsRecordingFileWatcher): readonly string[] {
  if (watcher.watchCalls.length === 0) {
    throw new Error(
      "precondition unmet: session_start armed no watcher (watch() was never called)",
    );
  }
  if (watcher.watchCalls.length > 1) {
    throw new Error(
      `precondition unmet: expected exactly one watch() arming, saw ${watcher.watchCalls.length}`,
    );
  }
```
(both files continue identically for the remaining 5 lines — the
`noUncheckedIndexedAccess` guard and its `return only;` — reproduced by the
`diff` run below.)

tests/b0310-watch-roots-root-union.test.ts:117-124 (`waitFor`) vs
tests/b0339-package-source-watch-arming.test.ts:204-212 — the function BODY is
byte-identical; only the doc comment differs, and b0339's comment names b0310
by number:
```ts
/** Poll a real-timer-bounded condition; throw loudly on timeout naming the unmet
 *  precondition (b0310's idiom — never an early return or skip). */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}
```

Exact diffs run during this review: `diff <(sed -n '47,58p'
tests/b0310-watch-roots-root-union.test.ts) <(sed -n '81,92p'
tests/b0339-package-source-watch-arming.test.ts)` → empty;
`diff <(sed -n '113,115p' ...b0310...) <(sed -n '200,202p' ...b0339...)` →
empty; `diff <(sed -n '118,124p' ...b0310...) <(sed -n '207,212p' ...b0339...)`
→ empty (function bodies only); `diff <(sed -n '127,145p' ...b0310...)
<(sed -n '227,245p' ...b0339...)` → empty. `makeHarness`/`boot` differ only by
b0310's extra `flags` parameter (needed for its `--theta`-flag case, absent
from b0339's package-only scenarios); every other line — the `commands`/
`subscriptions` maps, the fake `pi` object's members, the `ctx` object, the
`fire` helper — is identical between the two.

Pattern-wide search: `grep -rl "class RootsRecordingFileWatcher" tests
--include="*.test.ts"` → exactly these 2 files; `grep -rl "function
armedRoots" tests --include="*.test.ts"` → the same 2 files; `grep -rl
"^function norm(path: string): string {" tests --include="*.test.ts"` → 4
files (adds tests/b0312-out-of-root-thetalib-watch-closure.test.ts:83-85 and
tests/b0378-watch-root-case-variant-double-arming.test.ts:82-84, both
byte-identical to the excerpt above, neither cited as a primary location here
since they do not also carry the roots-recording class or `armedRoots`).

## Why this is a problem
This is the "Boilerplate duplication" class: a multi-piece harness — a
recording `FileWatcher` double plus three helper functions that normalise,
poll, and read back its recorded state — recurs as one unit across two files
rather than being imported once. The reviewed file (tests/b0310) is the
origin; tests/b0339's own comment names it as the source of an "EXACT" mirror
of the same four pieces, which the line-for-line `diff`s above confirm for
three of the four (`RootsRecordingFileWatcher`, `norm`, `armedRoots`
byte-identical; `waitFor`'s executable body byte-identical, its comment
differing only to add the attribution). `tests/helpers/fake-file-watcher.ts`
is this suite's established home for a `FileWatcher` seam double, but its
existing `FakeFileWatcher` answers a different question (event delivery) than
the one both reviewed files independently re-derive (which roots were passed
to `watch()`), so neither file's silence on a shared module reflects an
oversight of an already-adequate helper — it reflects that no helper module
yet hosts this second, distinct `FileWatcher`-double shape either file could
draw from.

## Suggested direction (non-binding, optional)
tests/helpers/fake-file-watcher.ts already establishes the convention of one
shared module per `FileWatcher`-seam double shape; a second export alongside
`FakeFileWatcher` for the roots-recording shape is the home the two files
already point at in their own comments.

## False-positive check
- Gate-pin check: neither tests/b0310-watch-roots-root-union.test.ts nor
  tests/b0339-package-source-watch-arming.test.ts matches `*gate*.test.ts` or
  the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); this finding
  does not touch a pinned count or inventory in either file.
- Recording-double check: `RootsRecordingFileWatcher` IS a recording double,
  but the assertions built over it (`armedRoots(...).toContain(...)`) are
  POSITIVE membership witnesses ("this root was armed"), not a "this was never
  called" MUST-NOT witness, so the negative-witness carve-out does not shield
  the claim being made here — the claim is that the DOUBLE'S OWN CODE is
  duplicated across two files, not that its use as a recording double is
  itself illegitimate.
- docs/bugs/ signature search: docs/bugs/0310-watch-roots-derived-from-discovered-files-not-root-union.md
  Status "fixed (0.301.0)"; docs/bugs/0339-package-source-present-but-empty-contributing-dir-not-watched.md
  Status "fixed (0.321.0)". `npx vitest run
  tests/b0310-watch-roots-root-union.test.ts
  tests/b0339-package-source-watch-arming.test.ts` → both green, 10/10 tests
  passing at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0310-watch-roots-root-union\|b0339-package-source-watch-arming"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl` for the same two
  filenames across docs/bugs/*.md (excluding each bug's own doc) → 0 hits. This
  finding proposes no merge, rename, or deletion of either file or any
  `it()`/`describe()` — only that the harness quartet could be imported rather
  than re-derived — so the citation carve-out does not bind.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every cited piece is exercised by the tests in its own
  file.

## Triage
verdict: confirmed — all four evidence diffs (RootsRecordingFileWatcher class, norm, waitFor body, armedRoots) reproduce byte-identical at the cited lines, grep confirms the class/armedRoots pair occurs in exactly these 2 files (not a suite-wide convention like the 79-186-file precedents), fake-file-watcher.ts's FakeFileWatcher discards roots so no existing shared module covers this shape, both docs/bugs entries are fixed with 10/10 tests green at HEAD, coverage-matrix has 0 hits, and no existing PTQ tracks this pair (triage: claude-opus-5)
