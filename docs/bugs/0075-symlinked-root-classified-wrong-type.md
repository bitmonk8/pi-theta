# Bug 0075 — A discovery root or explicit `.theta` entry that is a symlink or a Windows directory junction is classified `wrong-type` and contributes nothing: `classifyPath` probes the candidate with `lstat`, where DISC-2's implementation note pins `readdir` or `stat` for the candidate and reserves `lstat` for the ancestor probe

- **Status:** open — the headline `classifyPath` subject is untouched. The
  `listTree` per-entry `lstat` swallow named in §Affected (`discovery-walk.ts`
  `listTree`, and its `package-discovery.ts` twin) is fixed; see
  §Fix (0.175.0).
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

## Fix (0.175.0) — the `listTree` per-entry `lstat` swallow only

**Scope.** This pass fixes one of the two defect classes this report names: the
per-entry `lstat` swallow inside both `listTree` copies (§Affected,
`discovery-walk.ts` `listTree`; the same rule in `package-discovery.ts`), which
bug 0113's fix record carries as its residual 1 and its §Non-goals name by
symbol. The headline subject — `classifyPath` probing the candidate with `lstat`
so a symlink or Windows junction classifies `wrong-type` — is **not** fixed and
this report stays open for it, together with the §Fix Option A / Option B
choice and the `tests/e2e-s5-disc-cli-settings.test.ts:253–263` re-pinning that
choice requires. Bug 0078's subject (the CLI entry schema's route through
`collectFromEntries`) was not touched either; it shares these two files and
remains open.

**Adjudication.** Bug 0113's Reading-A holding governs unchanged: a traversal
failure inside a root that exists is not zero-match silence
(`discovery-sources.md:69`). An entry whose own `lstat` rejects is that class —
the parent's `readdir` has already named the entry, so the path exists and
cannot be read. The emission shape is 0113's, reused rather than re-derived:
the same `theta/load/unreadable-source` row at the source's *Unreadable path*
severity (warning for both reachable rows), the same descriptors
(`settings entry index N`, lowest-index owner of a shared cached universe; and
`` package `<name>` (pi.theta) ``), and the same carry-the-failure-out plumbing,
so **no new code, no registry row, no *Message* reword** (DIAG-4). The row's
*Trigger* ("a discovery source's path exists but cannot be read") admits the
class as written on the 0076 and 0113 precedents, so **no DIAG-2 widening** is
owed. `ENOENT` from that `lstat` stays silent: the entry vanished between the
enumeration and the probe, a clean leaf under a parent already proven enterable,
which leaves the pattern resolving to no path (`package-and-settings.md:29`).

**Mirror decision, re-checked at this tree.** `docs/reference/discovery-cli.md`
is again **deliberately not edited**. The mirror check found no contradiction —
no new code, no severity change, no *Message* change, no *Trigger* widening — and
the ground 0113 stated still holds: live `docs/reference/discovery-cli.md:NNN`
citations sit in four still-**open** bug documents (0088:267, 0111:212/937,
0146:254/484/784, 0147:238/496/888), which an edit shifting that file's line
numbering would stale.

- What shipped:
  - `src/discovery/discovery-walk.ts` — `listTree`'s per-entry probe classifies
    the `lstat` rejection by named code instead of dropping it: non-`ENOENT`
    pushes the entry path onto `TreeWalk.unreadable`, so the `treeFor` /
    `universeFailures` / `emitUniverseFailures` chain 0113 landed attributes it
    to the lowest-index `settings entry index N` and reports it once, skipping
    any path a per-match enumeration already reported. `ENOENT` stays silent.
    The `TreeWalk.unreadable` field comment and the `listTree` header comment
    now state both failure arms.
  - `src/discovery/package-discovery.ts` — the same classification in the
    `pi.theta` universe walk, through the `nodeErrorCode` helper its `readdir`
    arm already uses; the existing loop in `resolvePiThetas` emits the
    `` package `<name>` (pi.theta) `` warning with its double-report guard.
  - `docs/spec_topics/discovery/discovery-sources.md` — the glob-universe
    sentence group named only a `readdir` failure at or below the prefix root;
    one in-line clause extends it to a failure to `lstat` an entry that same
    walk enumerated. Appended in-line and the file's line count is unchanged
    (106), so no citation into this file moved.
- Gates: witness `tests/discovery-tree-walk-lstat-failure.test.ts` 11/11 (cells
  1, 2, 3, 5, 7 RED before the fix, `Observed diagnostics=[]`); full default
  suite `367 files / 7501 tests passed` (fork baseline 366/7490 at v0.173.0 —
  the delta is exactly this witness); `npx tsc -p . --noEmit` clean;
  `npm run lint` clean; live H8a `CELL-D` 1/1 real run under the live lock,
  red-proven by neutralising the settings-side arm.
- Review: 3 rounds. Round 1 (deep) found no correctness, fidelity or spec
  defect: three items, all test/prose — the witness cited pre-fix line numbers,
  quoted deleted code shapes and narrated the defect as present fact (a
  historical reference); `TreeWalk.unreadable`'s comment and both `listTree`
  header comments described only the `readdir` failure class; the new spec
  clause carried a banned word. One `bug-fix-fixer-light` round applied all
  three, touching no executable line in `src/`. Round 2 (fast) CLEAN with one
  citation-drift residual (`emitUniverseFailures` had moved +2 lines), corrected
  as a recorded, bounded, citation-only self-authorization — every
  `path:line` in the witness re-derived by symbol, no assertion touched. Round 3
  (fast) judged the new live cell: CLEAN, adjudicating the fault-injection
  provocation acceptable and reporting two lane-token placement residuals,
  both then made strip-safe (`(CELL-D)` parenthesized form).
- Verification: SOLID. (A) The witness reds on revert, proven three ways with
  byte-exact restoration (`git hash-object` re-verified after each): restoring
  the settings-side swallow reds cells 1, 2, 3, 7; restoring the package-side
  swallow reds cell 5; dropping the `ENOENT` filter so the report is
  unconditional reds exactly the two silence controls (cells 4, 6), so the
  silent arm can genuinely fail. (B) `npm test` 367/7501. (C) `npx tsc -p .
  --noEmit` and `npm run lint` clean. (D) Live: one additive standalone H8a
  cell, `tests/live/discovery-entry-lstat-failure-cell-d.test.ts`, boots the
  real shipped extension and asserts the warning arrives on the
  `theta-system-note` channel off the settled `SessionManager`, with the message
  half read from the registry row (DIAG-4) and the descriptor
  `settings entry index 0`; bracketed by a registration precondition control and
  a guard that the theta under the denied entry stays absent. Green, and
  red-proven by neutralising the settings-side arm. Registration-only, zero
  tokens, no subagent child spawn, so no child pins are owed. No H9a run and no
  `permitted-codes.json` decision: no new code and no severity change.
  No stochastic class was observed. Both `listTree` copies' at-rest blob hashes
  match their pre-neutralisation values.
- Residuals:
  1. **The headline `classifyPath` defect is untouched** — a symlinked or
     junctioned root, `--theta` component or settings entry still classifies
     `wrong-type` and contributes nothing. Evidence: `classifyPath` is
     byte-unchanged in this pass and §Fix's Option A / Option B choice is
     unmade. This report stays open for it.
  2. **The live cell injects its fault at `node:fs`, not at the real
     filesystem.** `fs.promises.lstat` — the primitive `PiFileSystem.lstat`
     delegates to — is patched for exactly one absolute path and restored in a
     `finally` around the boot call; every layer above it is the real
     composition root. Evidence recorded in the cell's header: the ACL-free
     provocation bug 0113's cell 62 uses has no entry-level equivalent (the
     failing call is an `lstat` on `<parent>/<name>` whose parent's own
     `readdir` already proved it a directory, so no non-final component is left
     to be the wrong type), a Windows `icacls` deny does not make `lstat` fail
     (measured on the host), and a TOCTOU race is non-deterministic with no
     injectable seam in the composition root.
  3. **A denied entry is reported but not recovered.** The path stays absent
     from the universe; the fix converts a silent loss into a reported one.
     Evidence: the witness's per-cell guards assert the theta below the denied
     entry does not register.
  4. **Cross-source duplication for one denied path remains by design**
     (0113 residual 3, unchanged and untested).
- Discharge notes appended: none. This fix discharges bug 0113's fix-record
  residual 1, but 0113 is closed and its record is left untouched.
- Pinned dispositions / non-goals: `classifyPath`'s link-typed candidates
  (residual 1, this report's headline subject); bug 0078's CLI-entry schema
  route through `collectFromEntries`; `globMatches`' selection (0077, landed);
  `enumerateRoot`'s DISC-6 root swallow; the DISC-6 bounds; the
  `node_modules/` symlink filter and the `realpath` dedup in
  `isCanonicalDuplicate` (section Non-goals). None was touched.
