# Bug 0075 — A discovery root or explicit `.theta` entry that is a symlink or a Windows directory junction is classified `wrong-type` and contributes nothing: `classifyPath` probes the candidate with `lstat`, where DISC-2's implementation note pins `readdir` or `stat` for the candidate and reserves `lstat` for the ancestor probe

- **Status:** open.
- **Kind:** defect. The DISC-2 clean-leaf-`ENOENT` note states which probe applies
  to the candidate path and which to its ancestors; the implementation uses the
  ancestor probe for both, so every link-typed candidate falls into the
  wrong-type arm that the failure-modes table reserves for "Path is wrong type
  (file vs dir)".
- **Related:**
  - [0013](../../../docs/bugs/0013-load-warnings-dropped-by-both-production-sinks.md)
    — fixed (0.24.0); it is the reason the warning this bug emits is now
    operator-visible at all. Disjoint root cause: 0013 was the sink, this is the
    classification.
  - Candidate 02 of this hunt (`02-existing-root-enumeration-failure-silent.md`)
    — adjacent, same `classifyPath`/`enumerateDirectory` pair, different input
    class (the root classifies as a directory and the *enumeration* fails).
- **Affected** (verified at HEAD `d06daae3`, 0.52.0):
  - `src/discovery/discovery-walk.ts:273–291` — `classifyPath`. `:274` probes the
    candidate with `lstatOutcome(fs, path)` (`:234–239`, `fs.lstat`). `:283–288`
    take the `dir` / `file` arms from `stat.isDirectory()` / `stat.isFile()`,
    which `lstat` reports `false` for any symlink; `:289–290` returns
    `{ kind: "wrong-type" }` with the comment "A symlink or other non-regular,
    non-directory entry".
  - `src/discovery/discovery-walk.ts:377–414` — `resolveEntry`, which turns that
    class into `theta/load/wrong-type-source` via `emitSourceFailure`
    (`:410–412`, `:432–450`) and returns zero candidates. The `dir` arm
    (`:387–388`) — the only path to `enumerateDirectory` — is never reached.
  - `src/discovery/discovery-walk.ts:747–806` — every source routes through it:
    CLI (`:752–765`), Project `.pi/theta` (`:776–784`), Global
    `~/.pi/agent/theta` (`:788–797`), and each settings literal entry through
    `addLiteral` (`:671–691`, `classifyPath` at `:672`).
  - `src/discovery/discovery-walk.ts:535–555` — `listTree`, the settings-glob
    universe walk, applies the same rule per entry (`:545–550`): a symlinked
    subdirectory is pushed with `isDir === false` and never descended.
  - `src/seams/pi-file-system.ts:85–88` — `lstat` is `fsp.lstat`, documented as
    "does NOT follow symlinks"; `:91–92` — `realpath` is `realpath.native`. The
    seam exposes no `stat`, so no caller *can* take the spec's candidate probe.
  - `docs/spec_topics/discovery/discovery-sources.md:66` — "Use `lstat` (not
    `stat`) as the ancestor probe … **The candidate path itself is checked with
    `readdir` or `stat` first**; only failure triggers the ancestor walk, and
    successful enumeration short-circuits."
  - `docs/spec_topics/discovery/discovery-sources.md:49` / `:57–64` and
    `docs/reference/discovery-cli.md:45–52` — the failure-modes table, whose
    third column is titled "Path is wrong type (file vs dir)".
  - `docs/spec_topics/discovery/discovery-sources.md:60` — DISC-2 rule 1 names
    a "broken symlink" as a `theta/load/unreadable` *warning* on a discoverable
    `.theta` file, which presupposes that an unbroken one is discoverable.
  - `tests/e2e-s5-disc-cli-settings.test.ts:253–263` — "REQ-DISC-14" pins the
    current behaviour using a **dangling** symlink (`/cli/link` →
    `/somewhere/else`, absent from the fixture) as its wrong-type example.
    `REQ-DISC-14` appears nowhere under `docs/` (`rg -n "REQ-DISC-14" docs/`
    returns nothing).
- **Observed at:** `0.52.0` (`d06daae3`). Offline, deterministic — scratch vitest
  driving the real `discoverThetas` over `tests/helpers/fake-file-system.ts`
  (written, run, deleted). Host-behaviour half witnessed on the real Windows
  filesystem with `node:fs`.

## Summary

`classifyPath` probes the candidate path with `lstat`. `lstat` does not follow
links, so a symlink — and, on Windows, a directory junction, which Node reports
as a symlink — answers `isDirectory() === false` and `isFile() === false`. The
candidate therefore takes the third arm and is reported as
`theta/load/wrong-type-source`: a warning for the two conventional roots, an
error for a settings entry or a `--theta` component. The root contributes zero
thetas; the files inside it are never enumerated.

The spec assigns the two probes to two different positions: `lstat` for the
ancestor chain (so a broken link at an ancestor classifies *unreadable* rather
than being traversed), `readdir` or `stat` for the candidate itself. `stat`
follows links, so a link to a real directory classifies as a directory and a
link to a real `.theta` file classifies as a file. The wrong-type column of the
failure-modes table is scoped by its own title to the file-vs-directory
mismatch.

Junctions are creatable on Windows without elevation, so this is the
default-privilege way to point `~/.pi/agent/theta` at a checked-out thetas
directory.

## Reproduction

**Host half (real filesystem, Windows, no elevation).** `node:fs` reports a
junction the way `classifyPath` reads it:

```js
fs.symlinkSync(path.join(base, "real"), path.join(base, "link"), "junction");
fs.lstatSync(link);   // isDir=false  isFile=false  isSymlink=true
fs.statSync(link);    // isDir=true
fs.readdirSync(link); // [ 'greet.theta' ]
```

Observed output:

```
junction lstat: isDir=false isFile=false isSymlink=true
junction stat : isDir=true
readdir: [ 'greet.theta' ]
realpath: C:\Users\thomasa\AppData\Local\Temp\jtest2\real
```

**Walk half (offline, `FakeFileSystem`).** Global root
`/home/theta/.pi/agent/theta` is a symlink to `/home/theta/real-thetas`, which
holds `greet.theta`:

```ts
const fs = new FakeFileSystem({
  homedir: "/home/theta", cwd: "/project",
  dirs: { ...BASE, "/home/theta/real-thetas": ["greet.theta"] },
  files: { "/home/theta/real-thetas/greet.theta": "1\n" },
  symlinks: { "/home/theta/.pi/agent/theta": "/home/theta/real-thetas" },
});
await discoverThetas({ fs, settings: {} });
```

Observed:

```
thetas: []
diags:  [{"severity":"warning","code":"theta/load/wrong-type-source",
          "file":"/home/theta/.pi/agent/theta",
          "message":"discovery source global thetas directory is neither a .theta file nor a directory of them"}]
```

A `--theta` component pointing at a symlinked directory, and one pointing at a
symlinked `.theta` file, both take the same arm at error severity:

```
--theta /links/dirlink  -> thetas: []  diags: [{"severity":"error","code":"theta/load/wrong-type-source", …}]
--theta /links/b.theta  -> thetas: []  diags: [{"severity":"error","code":"theta/load/wrong-type-source", …}]
```

(`/links/dirlink` → `/opt/thetas` holding `a.theta`; `/links/b.theta` →
`/opt/thetas/a.theta`.)

## Expected behaviour

`docs/spec_topics/discovery/discovery-sources.md:66`: "The candidate path itself
is checked with `readdir` or `stat` first; only failure triggers the ancestor
walk, and successful enumeration short-circuits." Under `readdir`, the junction
enumerates `greet.theta` and short-circuits; under `stat`, it classifies as a
directory. Either probe reaches the `dir` arm, so `/greet` registers from the
Global source and no diagnostic is emitted.

The symlinked file entry is a regular file through `stat`, so
`--theta /links/b.theta` classifies `file` and registers `/b`. DISC-2 rule 1
(`:60`) confirms the direction: a *broken* symlink to a `.theta` is a
`theta/load/unreadable` warning on the file, which only has meaning if an
unbroken one is a discoverable candidate.

The wrong-type arm the implementation takes is titled "Path is wrong type (file
vs dir)" (`:49`, mirrored `docs/reference/discovery-cli.md:45`) — a category the
resolved target does not fall into.

## Actual behaviour / root cause

`classifyPath` (`discovery-walk.ts:273–291`) has one probe, `lstat`
(`:274` → `lstatOutcome`, `:234–239`), and derives all three positive arms from
it. `FileStat.isDirectory()` / `isFile()` on an `lstat` result are both `false`
for a link, so control falls to `:289–290`. `resolveEntry` (`:410–412`) converts
that to `wrong-type` and returns `[]`.

The seam has no `stat` member (`src/seams/file-system.ts:16–34`), so the spec's
candidate probe is not reachable from any caller; the fix has to add it or use
`readdir`.

`listTree` (`:535–555`) repeats the rule inside the settings-glob universe walk:
a symlinked subdirectory is recorded with `isDir === false` and not descended,
so a glob entry cannot reach through a link either.

## Why it matters

An entire discovery root goes dark. On Windows the trigger is the ordinary
way to place a shared thetas directory under `~/.pi/agent/theta` without
elevation (`mklink /J`, `fs.symlinkSync(..., "junction")`); on POSIX it is
`ln -s` from a dotfiles checkout. For the two conventional roots the operator
gets one warning naming a cause that is not the case ("neither a .theta file nor
a directory of them" for a path that `readdir` enumerates); for a `--theta`
component or a settings entry it is a hard per-entry error.

Nothing else in the pass compensates: `enumerateDirectory` is only reachable
through the `dir` arm, so no file under the link is ever seen, and no
`theta/load/unreadable` is emitted either.

## Non-goals

Not in scope: whether the walk should *follow* links when descending (it does
not descend at all — discovery is non-recursive), the pnpm `node_modules/`
symlink filter, which `docs/spec_topics/discovery/package-and-settings.md:123`
pins deliberately on `lstat` for a different reason, and the `realpath`-based
dedup in `isCanonicalDuplicate` (`discovery-walk.ts:353–373`), which is correct.

## Fix

**Option A — add `stat` to the seam and use it for the candidate probe.** Add
`stat(path)` to `FileSystem` (`src/seams/file-system.ts`), `PiFileSystem`
(`fsp.stat`) and `FakeFileSystem` (follow `#symlinks` transitively, reject
`ELOOP` on a cycle, `ENOENT` on a dangling target), and have `classifyPath` call
it for the candidate while `ancestorsClean` keeps `lstat`. This is the spec's
own wording and keeps the dangling-link case classifying as `missing` /
`unreadable` through the existing `ENOENT` branch. Cost: a seam member, so an
`SDK_SURFACE_INVENTORY`-adjacent change and a `FakeFileSystem` conformance test.

**Option B — probe with `readdir` first.** The spec offers `readdir` as an
alternative and it needs no new seam member: attempt `fs.readdir(path)`; success
means `dir` (and the entry list is already in hand, satisfying "successful
enumeration short-circuits"). Only on rejection fall back to `lstat` to separate
`file` from the failure classes. A symlinked *file* entry still needs one more
step, since `readdir` on it rejects `ENOTDIR` and `lstat` still says symlink —
`realpath` then `lstat` on the resolved path closes it, using the seam member
that already exists.

Recommendation: Option B, with the `realpath` step for the file case — it is
spec-sanctioned, adds no seam surface, and removes a redundant `lstat` on the
hot path. Either option must keep: a dangling link classifying through the
`ENOENT`/ancestor path rather than as `wrong-type`; `ancestorsClean` on `lstat`
(`:243–251`); and the `wrong-type` arm still firing for a genuine non-regular,
non-directory entry (fifo, socket, device).

`tests/e2e-s5-disc-cli-settings.test.ts:253–263` must be re-pinned: its fixture
is a dangling link, whose spec-conformant class is `missing-source` (error, CLI)
rather than `wrong-type-source`. A replacement wrong-type fixture needs a
non-regular, non-directory target. `REQ-DISC-14` has no anchor under `docs/`, so
whichever code it names must be re-derived from the failure-modes table, not
from the test.

## Provenance

- Origin: `discovery-ext` bug hunt at HEAD `d06daae3`, seed hypothesis (1)
  (Windows junctions/symlinks in the discovery walk).
- Implementation evidence: `src/discovery/discovery-walk.ts:234–239`, `:243–251`,
  `:273–291`, `:377–414`, `:535–555`, `:747–806`;
  `src/seams/pi-file-system.ts:85–92`; `src/seams/file-system.ts:16–34` — all
  read at `d06daae3`.
- Host evidence: `node:fs` `lstatSync` / `statSync` / `readdirSync` /
  `realpathSync.native` on a Windows directory junction created by
  `fs.symlinkSync(target, link, "junction")`, run on the hunt host
  (Node v24.16.0).
- Walk evidence: scratch vitest over the real `discoverThetas` +
  `tests/helpers/fake-file-system.ts` (`symlinks` option), deleted after the run.
- Spec: `docs/spec_topics/discovery/discovery-sources.md:49`, `:57–64`, `:60`,
  `:66`, `:67`; `docs/reference/discovery-cli.md:40–59`.
> **Coordination note (at bug 0113's fix, 0.126.0):** both `listTree` copies moved — the return type now carries the readdir failures, `treeFor` takes a second `descriptor` argument, and `resolveSettingsSource` ends with an `emitUniverseFailures` call. This report's subject (per-entry `lstat`/link classification) is untouched; the per-entry `lstat` swallow stays a 0113 §Non-goal. Line citations into `src/discovery/discovery-walk.ts` / `src/discovery/package-discovery.ts` below `listTree` drifted — re-anchor by symbol at pick.
