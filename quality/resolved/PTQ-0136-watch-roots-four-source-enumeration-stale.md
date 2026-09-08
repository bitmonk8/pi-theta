---
id: PTQ-0136
title: Two comments describe watchRoots as the four-source cli/settings/project/global union although the same function folds packageWalk.roots in as a fifth source
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-composition.ts:411-418
  - src/extension/production-composition.ts:1748-1749
  - src/extension/production-composition.ts:765-771
  - src/extension/production-composition.ts:797-801
sites: 4
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Two comments describe watchRoots as the four-source cli/settings/project/global union although the same function folds packageWalk.roots in as a fifth source

## Observation
`runComposePass` computes `discoveryWatchRoots` from three inputs: the
file-derived `activeRoots`, the discovery walk's `walk.roots`, and (bug 0339)
`packageWalk.roots`. The inline comment at the computation names the package
row as "the fifth active-root source". Two other comments in the same file
describe the resulting `watchRoots` value as the union of `activeRoots` with the
walk's four-source (cli/settings/project/global) present-directory union, with
no mention of the package source: the `ComposePassResult.watchRoots` field
doc-comment, and the `composeExtensionInstance` comment on the `roots` array it
arms the watcher with.

## Evidence
src/extension/production-composition.ts:797-801 — the computation, three
inputs:

```ts
  const discoveryWatchRoots = await dedupeWatchRootsByIdentity(fileSystem, [
    ...activeRoots.map((r) => r.replace(/\\/g, "/")),
    ...walk.roots,
    ...packageWalk.roots.map((r) => r.replace(/\\/g, "/")),
  ]);
```

src/extension/production-composition.ts:765-771 — the inline comment at that
computation, naming the package row as a fifth source:

```ts
  // the first file created there fires a watcher event. Bug 0339 (the fifth
  // active-root source, discovery-sources.md's package row): a present-but-empty
  // package `theta/` fallback directory, or a present-but-empty `pi.theta`-glob-
  // matched directory, is likewise not `.theta`-bearing at scan time, so
  // `packageWalk.roots` (the present contributing dirs `discoverPackageThetas`
  // visited) is unioned in too — the first `.theta` created there fires a
  // watcher event on the same terms as the walk's four sources. File-bearing
```

src/extension/production-composition.ts:411-418 — the field doc-comment on the
value that computation produces, enumerating four sources and no package row:

```ts
  /** The watch-list root union: the file-derived `activeRoots` unioned with the
   *  discovery walk's resolved present-directory union (its four sources:
   *  cli/settings/project/global) AND (bug 0312) every `.thetalib` resolved
   *  parent directory this pass's per-theta import walks reached that is not
   *  already nested under one of those roots — the out-of-root closure
   *  (`../lib/x.thetalib`, imports.md:19's blessed form) is otherwise outside
   *  every armed watch root. The INV-1 containment checks read the
   *  file-derived `activeRoots` local, never this field. */
```

src/extension/production-composition.ts:1748-1749 — the same enumeration at the
watcher-arming site in `composeExtensionInstance`:

```ts
  // The watched set: `watchRoots` (the file-derived active-root union unioned
  // with the discovery walk's resolved four-source (cli/settings/project/global) present-directory union;
```

## Why this is a problem
Two comments state a closed enumeration ("its four sources:
cli/settings/project/global", "the discovery walk's resolved four-source
(cli/settings/project/global) present-directory union") that the code they
describe contradicts: `packageWalk.roots` is a third spread in the same array
expression, and a third comment sixty lines above the computation calls it "the
fifth active-root source". A reader auditing which directories the watcher is
armed over — the exact question the `watchRoots` field exists to answer — gets
two different closed answers from the same file. `git blame` dates the two
four-source passages to 2026-08-27 (`337e8d08e`) and 2026-08-30 (`47b6cda46`),
and the `packageWalk.roots` spread to 2026-09-03 (`2fd6a6bea`), so the
enumerations predate the fold.

## Suggested direction (non-binding, optional)
Bring the two enumerations into agreement with the array the computation
actually builds, or replace the source list with a pointer to the single
computation site.

## False-positive check
- Verified the fold is live, not conditional: `packageWalk.roots` is an
  unconditional spread in the `dedupeWatchRootsByIdentity` argument
  (line 800), inside `runComposePass`, which both production paths
  (`composeExtensionInstance` and `discoverAndComposeFixtures`) run.
- Verified `packageWalk.roots` is populated by production, not only tests:
  `discoverPackageThetas` is called at `production-composition.ts:666` with
  the real `fileSystem` / `clock` / merged `settings`.
- `grep -n "four sources\|four-source\|fifth active-root\|five-source"
  src/extension/production-composition.ts` returned 6 hits; two are the stale
  enumerations cited here, one is the "fifth active-root source" comment, one
  is the walk-adjudication comment at :662 ("as the other four sources",
  which is about `discoverThetas`'s candidate adjudication, not `watchRoots`,
  and is accurate there), and two are the module header's "five-source
  discovery walk" (accurate).
- Checked this is narration, not dead code: both cited comments sit above live
  code that runs on every pass; nothing here is unreachable.
- History intent: `git blame -L 411,415` → `337e8d08e` (2026-08-27) /
  `47b6cda46` (2026-08-30); `git blame -L 797,801` → `2fd6a6bea`
  (2026-09-03). The comments predate the change, so this is drift rather than
  a deliberate scoping statement.

## Triage
verdict: confirmed — re-verified all four excerpts verbatim; `walk.roots` is genuinely only the four-source union (package candidates enter `candidates` at discovery-walk.ts:1287, never `roots`) while `packageWalk.roots` is a live unconditional third spread (`scanPackages` defaults true) contributing present-but-empty package dirs that `activeRoots` cannot cover, so the closed enumerations at 411-418 and 1748-1749 contradict the value they define, and blame reproduces 337e8d08e/47b6cda46 predating the 2fd6a6bea fold (triage: claude-opus-5)
