# Bug 0339 — The package discovery source (the fifth active-root source) is not armed for watching when a contributing directory is present but empty: an installed package's empty `theta/` (or empty `pi.theta`-globbed) directory contributes no found file, so it enters neither the file-derived `activeRoots` nor the walk's four-source `roots` union, and the first `.theta` created there produces no watcher event, no structural-change note, and no registration until an unrelated edit or `/reload`

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2 on the same impact class bug 0310 fixed:
  author intent is dropped with zero diagnostics on a first-contact path.
  A present-but-empty package contributing directory is a member of the
  active-root union (`discovery-sources.md:31`, "when present", no condition
  on currently holding a `.theta`), yet the first `.theta` created there
  mid-session fires no watcher event, no `theta watcher: N file(s) added or
  removed` note, and no registration — the spec's designed observable for
  exactly this input never fires because the directory was never armed. Not
  S1: no wrong value is computed; the failure is a silent no-op recoverable
  by `/reload`. The trigger is narrower than 0310's project-root case (it
  requires an installed package that ships an empty `theta/` or empty
  `pi.theta`-globbed directory and a `.theta` added into it at runtime), so
  the blast radius is smaller than 0310's. D2 because the settled route is
  confined to the discovery subsystem: `package-discovery.ts` exposes its
  present contributing directories, the composition folds them into the same
  additive `watchRoots` union 0310 built.
- **Kind:** defect — implementation diverges from the stated watch scope for
  one of the five active-root sources. `registration-steps.md:22` (step 5):
  "Registers a chokidar file watcher over the discovered roots", where the
  active-root union is defined at `docs/spec_topics/discovery/
  discovery-sources.md:27–35` over five sources, including
  (`discovery-sources.md:31`): "Each scanned package's contributing directory
  (the package's `theta/` directory, or each directory reached through a
  `pi.theta` glob)." Membership is conditioned on presence
  (`discovery-sources.md:35`: "Roots are computed once per discovery pass"),
  not on the directory currently containing a `.theta`. Bug 0310 armed the
  watcher over the walk's four-source present-directory union
  (`DiscoveryResult.roots`, `discovery-walk.ts:70`) unioned with the
  file-derived `activeRoots`; the package source is neither in the walk's
  four-source `roots` (the walk defers it — `discovery-walk.ts:995`, "Walk the
  (currently four — package source is V10b's) discovery sources") nor
  contributes to `activeRoots` when it holds no `.theta` at scan time. So a
  present-but-empty package contributing directory falls through both bases.
- **Related:**
  - [0310](./0310-watch-roots-derived-from-discovered-files-not-root-union.md)
    (fixed, 0.301.0) — armed the watcher over the four-source root union
    unioned with the file-derived `activeRoots`, deliberately excluding the
    package source per its §Summary's four-source enumeration. This report is
    0310's §Fix Residual 1: the fifth source. File-bearing package directories
    stay covered via `activeRoots` (their `dirname(theta.path)` is an armed
    root); only present-but-empty package contributing dirs are unarmed.
  - [0311](./0311-structural-note-derived-from-name-set-not-watcher-paths.md)
    (open) — the structural-change note's data source. Independent mechanism,
    same subsystem: 0311 concerns what the note reports; this concerns whether
    the directory is armed at all.
  - [0312](./0312-out-of-root-thetalib-edits-invisible-stale-imports.md) (open)
    — `.thetalib` imports resolving outside every active root are unwatched.
    Disjoint input class: 0312 is import-closure files outside all roots; this
    is a package source root that IS in the union but is dropped when empty.
    Any fix here must leave the `watchRoots` construction site a clean additive
    `Set` union so 0312's import-closure watch-list extension is not
    foreclosed.
  - [0313](./0313-every-chokidar-error-classified-terminal.md) (open) —
    chokidar error classification. Unrelated mechanism.
- **Affected** (at 337e8d08, v0.301.0):
  - `src/discovery/package-discovery.ts:61–63` — `PackageDiscoveryResult`
    exposes `thetas` and `diagnostics` only; there is no field carrying the
    present contributing directories the walk visited, so the composition
    cannot union them into the watch set.
  - `src/discovery/package-discovery.ts:226` (`packageRoots`),
    `:260` (`enumerateRoot`), `:529` (`thetasInDirectory`, the conventional
    `theta/` fallback and `pi.theta`-named-directory scan) — the sites that
    visit a package's contributing directories; a present-but-empty such
    directory yields no theta and is not surfaced.
  - `src/discovery/package-discovery.ts:649` (`discoverPackageThetas`) — returns
    `{ thetas, diagnostics }`; the entry point that would carry the exposed
    directories out.
  - `src/extension/production-composition.ts:571–584` — the composition-root
    package-source merge: `discoverPackageThetas` is called and its `thetas`
    folded into `discovered`; its contributing directories are not captured.
  - `src/extension/production-composition.ts:644–646` (`activeRoots`) — the
    file-derived set `Array.from(new Set(discovered.map((theta) =>
    dirname(theta.path))))`; covers a package directory only when it holds a
    discovered `.theta`.
  - `src/extension/production-composition.ts:670–672` (`watchRoots`) — the
    bug-0310 union `activeRoots` (forward-slashed) ∪ `walk.roots`; `walk.roots`
    is the four-source walk union and carries no package directory.
  - `src/extension/production-composition.ts:1542` — the watch-list build
    consumes `initial.watchRoots`; the single arming input.
- **Observed at:** v0.301.0 (337e8d08), offline — deterministic vitest probe
  over the shipped `composeExtensionInstance` via `createThetaExtension`, with
  a roots-recording `FileWatcher` seam fake (the bug-0310 §Reproduction
  harness; probe since deleted, recipe in §Reproduction).

## Summary

The composition root discovers package thetas through `discoverPackageThetas`
(`production-composition.ts:571`) and folds them into `discovered`. The armed
watch set (`watchRoots`, `production-composition.ts:670`) is the file-derived
`activeRoots` unioned with the discovery walk's four-source root union
(`walk.roots`, from `DiscoveryResult.roots`). A package contributing directory
enters `activeRoots` only through `dirname(theta.path)` of a `.theta` the walk
found in it, and it is never in `walk.roots` (the walk covers only
cli/settings/project/global). A package that ships a present-but-empty `theta/`
directory — or a `pi.theta` glob resolving to a present-but-empty directory —
contributes no found file, so the directory enters neither basis and is not
watched. A `.theta` later created in it produces no `FileWatchEvent`: no
debounce window opens, no rediscover runs, no structural-change note is
emitted, and the new theta does not register until an unrelated edit inside a
watched root triggers a full re-walk, or on `/reload`.

File-bearing package directories are unaffected: a package directory holding at
least one discovered `.theta` at scan time is in `activeRoots` via that theta's
`dirname` and is armed.

## Reproduction

Offline, deterministic (the probe asserts the arming input, not chokidar
timing). Harness: the bug-0310 fake-pi pattern with a `FileWatcher` fake that
records the `roots` argument to `watch()`, booted through
`createThetaExtension` → `composeExtensionInstance` with seam overrides.
`PiFileSystem(ctx.cwd)` pins `fs.cwd()` to the workspace, so the project
package roots (`<ws>/node_modules`, `<ws>/.pi/npm`, `<ws>/.pi/git`) live inside
the tmp workspace.

1. Workspace: `<ws>/.pi/theta/` created, EMPTY (a non-package active root — the
   post-0310 control). A package at `<ws>/node_modules/pkg-x/` with a valid
   `package.json` (no `pi.theta`) and a present-but-EMPTY conventional
   `<ws>/node_modules/pkg-x/theta/` directory.
2. Fire `session_start`. Observed armed roots:

   ```
   [ '<ws>/.pi/theta',
     '<ws>/.pi/settings.json',
     '~/.pi/agent/settings.json' ]
   ```

   `<ws>/.pi/theta` (the empty non-package root) is present — armed by 0310.
   `<ws>/node_modules/pkg-x/theta` — present, an active root per
   `discovery-sources.md:31` — is absent from the armed set.
3. Control: give the package directory a `theta/pkgtheta.theta`. Observed armed
   roots then contain `<ws>/node_modules/pkg-x/theta` (via `activeRoots`), and
   `/pkgtheta` registers. The gap is confined to the present-but-empty case.

Consequence chain (mechanical, from the arming input): a later
`writeFileSync(<ws>/node_modules/pkg-x/theta/new.theta)` produces no
`FileWatchEvent` (chokidar was never pointed at the directory), so no debounce
window, no rediscover, no `theta watcher: 1 file(s) added or removed; run
/reload …` note, and no registration until an unrelated edit inside a watched
root triggers a re-walk, or on `/reload`.

## Expected behaviour

- `registration-steps.md:22` (step 5): "Registers a chokidar file watcher over
  the discovered roots".
- `discovery-sources.md:27–35`: the active-root union is source-directory
  membership over five sources — global root "when present", project root "when
  present", "Each scanned package's contributing directory (the package's
  `theta/` directory, or each directory reached through a `pi.theta` glob)",
  settings `thetaPaths` entries, `--theta` components — with no condition on the
  directory currently containing a `.theta`.
- The principle bug 0310's fix states: arm every directory that can gain a
  `.theta` — a present-but-empty active root is armed so the first file created
  there fires a watcher event and the structural-change note
  (`registration-steps.md:36`). This applies to the package source's present
  contributing directories on the same terms as the other four sources.

## Actual behaviour / root cause

- `production-composition.ts:644–646` derives `activeRoots` from found files:
  `discovered.map((theta) => dirname(theta.path))`. For a package directory
  holding a discovered `.theta` this coincides with the directory; for a
  present-but-empty one it vanishes.
- `production-composition.ts:670–672` unions `activeRoots` with `walk.roots`.
  `walk.roots` (`DiscoveryResult.roots`, `discovery-walk.ts:70`) is the walk's
  four-source union only — the walk defers the package source
  (`discovery-walk.ts:995`) — so no package contributing directory is in it.
- `PackageDiscoveryResult` (`package-discovery.ts:61–63`) carries `thetas` and
  `diagnostics` only. The sites that visit a package's contributing directories
  (`packageRoots`, `enumerateRoot`, `thetasInDirectory`) surface nothing when
  the directory is present but yields no theta, so the composition has no source
  from which to arm it.

## Why it matters

- First-theta experience for package authors: install a package that ships an
  empty `theta/` scaffold, start pi, add the first theta into it — nothing
  happens, silently. The spec's designed observable (the structural-change
  `/reload` prompt) is unreachable.
- Eventual-consistency trap: the file DOES register later if some other watched
  file changes (full re-walk), so behaviour depends on unrelated edits — the
  same stale-state dispatch class 0310 documented, restricted to the package
  source.

## Non-goals

- The four non-package sources — covered by bug 0310 (fixed, 0.301.0).
- Watching import-graph `.thetalib` files outside every active root
  ([0312](./0312-out-of-root-thetalib-edits-invisible-stale-imports.md)) —
  different rule, different fix surface.
- The structural-change note's payload and emission condition
  ([0311](./0311-structural-note-derived-from-name-set-not-watcher-paths.md)) —
  once the directory is armed, note correctness is 0311's subject.
- Re-arming on a later union change (a package installed or a `pi.theta`
  directory created mid-session adding a directory to the union) — out of scope
  on the same terms 0310 fixed it (the structural-change note is the designed
  `/reload` recovery); the union is computed once per pass.
- The INV-1 containment semantics of `activeRoots` — file-bearing package
  directories already sit in it; this report does not widen the containment
  basis.

## Fix

Route (settled by the reproduction and 0310's §Fix Residual 1):

1. `package-discovery.ts` exposes the present contributing directories its walk
   visited. Add a field to `PackageDiscoveryResult` (e.g. `roots: readonly
   string[]`) accumulated through a threaded `Set<string>` (never module-scope,
   per 0310's `discovery-walk.ts` pattern) at each site that confirms a
   contributing directory present: the conventional `theta/` fallback directory
   when it exists (`thetasInDirectory` / `resolvePackage`'s fallback branch),
   and each directory a `pi.theta` glob resolves to that exists
   (`resolvePiThetas` per-match directory contribution). Presence, not
   `.theta`-containment, is the membership condition — a present-but-empty
   directory lands in the set.
2. `production-composition.ts` folds `packageWalk.roots` into the same additive
   `watchRoots` union at `:662`, forward-slash-canonicalised to match
   `walk.roots`' form so one physical directory is one `Set` member.
   `activeRoots` (INV-1) stays byte-unchanged.

Constraints any fix must satisfy:

1. `activeRoots` (INV-1 containment) is not widened — the package directories
   join `watchRoots` only, keeping the two consumers split as 0310 left them
   (§Non-goals).
2. The `watchRoots` construction site stays a clean additive `Set` union so
   0312's import-closure watch-list extension is not foreclosed (0310
   coordination note).
3. Re-arming on a later union change stays out of scope; the union is computed
   once per pass (the structural-change note is the designed `/reload`
   recovery).
4. Witness: a roots-recording `FileWatcher`-fake case asserting a
   present-but-empty package `theta/` directory is armed, plus the file-bearing
   control (armed via `activeRoots` today) to fence the change.

## Provenance

Bug 0310's fix report (`.pi/tmp/fixes/0310-report.md` §Residuals item 1) and
the 0310 bug doc's `## Fix (0.301.0)` Residuals item 1: the package source
(fifth) not armed when present-but-empty, deliberately out of 0310's four-source
scope, closing it named as needing `package-discovery.ts` to expose present
contributing dirs. Reproduced offline at 337e8d08 with a roots-recording
`FileWatcher` fake through the shipped factory + composition; probe deleted
after confirmation.
