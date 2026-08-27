# Bug 0310 — The armed watch set is the dirnames of the thetas discovery FOUND, not the discovery-root union: a present-but-empty active root (`.pi/theta/` with no thetas yet) is never watched, so the first `.theta` created there produces no watcher event, no structural-change note, and no registration until an unrelated edit or `/reload`

- **Status:** fixed (0.301.0).
- **Sev/Diff estimate:** S2/D2 — S2 because author intent is dropped with zero
  diagnostics on a first-contact path: a user who creates their first
  `.pi/theta/hello.theta` mid-session (the empty scaffold directory already
  existing) gets no note, no registration, and no error — the spec's designed
  observable for exactly this input (`theta watcher: 1 file(s) added or
  removed; run /reload …`) never fires because the root was never armed. Not
  S1: no wrong value is computed; the failure is a silent no-op, recoverable
  by `/reload` once the user thinks of it. D2 because the fix is one
  expression (`activeRoots` from the discovery walk's root union instead of
  `dirname` over found files) plus the walk exposing its resolved root union,
  but the same variable feeds the INV-1 containment checks, so the fix must
  either split the two consumers or argue containment widening is intended.
- **Kind:** defect — implementation diverges from the stated watch scope.
  `registration-steps.md:22` (step 5): "Registers a chokidar file watcher over
  the **discovered roots**", where *discovery root* is defined at
  `docs/spec_topics/discovery/discovery-sources.md:27–35` as the union of the
  five sources — "The global root `~/.pi/agent/theta/` (**when present**). The
  project root `.pi/theta/` (**when present**). …" — membership conditioned on
  presence, not on currently containing any `.theta` file. The implementation
  substitutes `dirname(theta.path)` over the *files the walk found*
  (`src/extension/production-composition.ts:634–636`), a strict subset that
  drops every root that is present but currently empty. The composition's own
  comment claims the spec set: "The watched set: the active discovery-root
  union plus the two settings-file paths"
  (`production-composition.ts:1411–1415`).
- **Related:**
  - 0048 (fixed, 0.229.0) — watcher coverage vacuity in a live witness
    (`ignoreInitial` initial-scan race). Different mechanism: that is a
    timing gap on an armed root; this is a root never armed at all.
  - 0021/0029/0034 (fixed) — watcher arming/teardown lifecycle. Adjacent
    file, unrelated mechanism (generation handling, not root computation).
- **Affected** (at bc52da38, v0.287.0):
  - `src/extension/production-composition.ts:634–636` — `activeRoots =
    Array.from(new Set(discovered.map((theta) => dirname(theta.path))))`; the
    only root source the watch set has.
  - `src/extension/production-composition.ts:1134` — `runComposePass` returns
    this set as `activeRoots`.
  - `src/extension/production-composition.ts:1416–1419` — `roots = [
    ...initial.activeRoots, ...settingsFilePaths(ctx, root.fileSystem) ]`,
    computed once, at `session_start`.
  - `src/extension/hot-reload.ts:288–295` — `armWatcherWithTerminalRecovery`
    arms once over that frozen list; no reload pass ever re-arms or widens it.
- **Observed at:** v0.287.0 (bc52da38), offline — deterministic vitest probe
  over the shipped `composeExtensionInstance` via `createThetaExtension`, with
  a roots-recording `FileWatcher` seam fake (probe since deleted; recipe in
  §Reproduction).

## Summary

`runComposePass` computes `activeRoots` as the set of parent directories of
the `.theta` files the discovery walk actually found, and
`composeExtensionInstance` arms the single hot-reload watcher over exactly
that set plus the two settings files. Any active discovery root that holds no
registrable `.theta` at scan time — a scaffolded-but-empty `.pi/theta/`, an
empty global `~/.pi/agent/theta/`, an empty `--theta` / `thetaPaths`
directory — contributes nothing, so it is not watched. File creations in such
a root are invisible: no debounce window opens, no rediscover runs, no
structural-change note is emitted, and the new theta does not register. The
session in a project with zero thetas watches only the two settings files.

The watch set is additionally frozen at arming time: a reload pass re-runs
the full discovery walk (so it can *register* thetas from a root that entered
the union via a `thetaPaths` edit) but never re-arms the watcher, so those
newly registered thetas' subsequent edits are also invisible.

## Reproduction

Offline, deterministic (the probe asserts the arming input, not chokidar
timing). Harness: the `tests/watcher-hot-reload-integration.test.ts` fake-pi
pattern with a `FileWatcher` fake that records the `roots` argument to
`watch()`, booted through `createThetaExtension` →
`composeExtensionInstance` with seam overrides.

1. Workspace: `<ws>/.pi/theta/` created, EMPTY. One theta at
   `<ws>/more/hello.theta`, contributed via the `--theta` flag
   (`pi.getFlag('theta')` → `<ws>/more`).
2. Fire `session_start`. Observed armed roots:

   ```
   [ '<ws>\\more',
     '<ws>\\.pi\\settings.json',
     'C:\\Users\\<user>\\.pi\\agent\\settings.json' ]
   ```

   `<ws>/.pi/theta` — present, an active root per
   `discovery-sources.md:29–31` — is absent. `/hello` registers; the project
   root is unwatched.
3. Variant: no thetas anywhere, `.pi/theta/` present and empty. Observed
   armed roots: the two settings files only.

Consequence chain (mechanical, from the arming input): a later
`writeFileSync(<ws>/.pi/theta/new.theta)` can produce no `FileWatchEvent`
(chokidar was never pointed at the directory), so no debounce window, no
rediscover, no `theta watcher: 1 file(s) added or removed; run /reload …`
note, and no registration. The file is picked up only when an unrelated edit
inside a *watched* root triggers a rediscover (the reload pass re-walks all
five sources), or on `/reload`.

## Expected behaviour

- `registration-steps.md:22`: step 5 "Registers a chokidar file watcher over
  the discovered roots".
- `discovery-sources.md:27–35`: the active-root union is source-directory
  membership — global root "when present", project root "when present",
  package contributing directories, settings entries (directory → own path,
  file → parent), `--theta` components — with no condition on the root
  currently containing `.theta` files. `:36`: "Roots are computed once per
  discovery pass and cached for the lifetime of the resolved registry;
  hot-reload … re-runs the computation."
- `registration-steps.md:36` (*Structural changes*): "Adding a brand-new
  `.theta` file … When the watcher observes such an event, it emits a single
  `theta-system-note` … `theta watcher: <N> file(s) added or removed; run
  /reload to refresh the slash command list`". With the root armed, the first
  file added to an empty active root is exactly this input and owes the note.

## Actual behaviour / root cause

- `production-composition.ts:634–636` derives `activeRoots` from found files:
  `discovered.map((theta) => dirname(theta.path))`. For a root with direct
  `.theta` children this coincides with the root (discovery is
  non-recursive); for a root with none it vanishes.
- `production-composition.ts:1416–1419` builds the watch list from that
  subset once; `hot-reload.ts:288–295` arms once. No re-arm exists on any
  reload pass, so even after a rediscover registers thetas from a root that
  newly entered the union (a `thetaPaths` edit — the settings files ARE
  watched), that root's own future edits deliver no events.

The comment at `production-composition.ts:629–633` documents the intended
consumer of the file-derived set — the INV-1 invoke-containment check, where
a found-file basis is equivalent (every registrable theta and every
in-root callee sits beside a discovered theta). The watch set reuses the same
variable, where the equivalence does not hold.

## Why it matters

- First-theta experience: scaffold `.pi/theta/`, start pi, write the first
  theta — nothing happens, silently. The spec's designed observable for this
  exact input (the structural-change `/reload` prompt) is unreachable.
- Eventual-consistency trap: the file DOES register later if some other
  watched file changes (full re-walk), so behaviour depends on unrelated
  edits — stale-state dispatch that is hard to attribute.
- The half-live state after a `thetaPaths`-driven reload (theta registered
  and dispatchable, its edits invisible) contradicts the hot-reload
  subsystem's premise that content edits to registered thetas re-parse
  (`registration-steps.md:26`).

## Non-goals

- The initial-scan timing vacuity of `ignoreInitial` (bug 0048's subject) —
  live-axis, distinct mechanism.
- Watching import-graph `.thetalib` files outside every root (filed
  separately; different rule, different fix surface).
- The INV-1 containment semantics of `activeRoots` — the file-derived basis
  is behaviour-equivalent there and is not challenged.

## Fix

Not yet decided. Constraints any fix must satisfy:

1. The discovery walk must expose the resolved five-source root union
   (directories that exist at scan time), and the watch list at
   `production-composition.ts:1416` must consume it instead of (or unioned
   with) the file-derived `activeRoots`.
2. The INV-1 containment consumers of `activeRoots`
   (`production-composition.ts:794/:871/:912` and the runtime re-check) must
   either keep the current file-derived set or adopt the union deliberately —
   widening containment to empty roots changes a refusal surface and needs
   its own witness.
3. Re-arming on a union change (a `thetaPaths` edit adding a directory) can
   stay out of scope IF the structural-change note fires for the change (the
   `/reload` prompt is the designed recovery); today it fires only when the
   registered name set changes (see
   [0311](./0311-structural-note-derived-from-name-set-not-watcher-paths.md)).
4. Witness: the roots-recording fake asserting the empty-`.pi/theta` case,
   plus the zero-theta case.

## Fix (0.301.0)

- What shipped:
  - `src/discovery/discovery-walk.ts` — `DiscoveryResult.roots`: the resolved
    discovery-root union over the walk's four sources (cli/settings/project/
    global), accumulated through a threaded `Set<string>` (never module-scope)
    at every choke point that confirms a source directory present (`resolveEntry`
    `case "dir"`, `resolveSettingsSource`'s `addDir`, the conventional-root
    `probe.ok && probe.isDir` guard) or resolves an explicit file's parent
    (`case "file"`, `addFile` → `dirnameOf`) — so a present-but-empty active root
    lands in the set regardless of whether it currently holds a `.theta`
    (§Fix constraint 1).
  - `src/extension/production-composition.ts` — `ComposePassResult.watchRoots` =
    `activeRoots` (forward-slash-canonicalised) ∪ `walk.roots`; the watch-list
    build consumes `initial.watchRoots` instead of `initial.activeRoots`.
    `activeRoots` (file-derived) is byte-unchanged and remains the sole basis of
    the INV-1 containment consumers — the two consumers are split, not widened
    (§Fix constraint 2 / §Non-goals). Re-arming on a later union change stays out
    of scope; the union is computed once per pass (§Fix constraint 3).
  - `tests/b0310-watch-roots-root-union.test.ts` — the roots-recording
    `FileWatcher`-fake witness: the empty-`.pi/theta` case plus the zero-theta
    case (§Fix constraint 4).
- Gates: witness `npx vitest run tests/b0310-watch-roots-root-union.test.ts`
  → 2 passed (reds with the bug's exact signature — armed roots omit the
  present-but-empty project root — when the watch-list build is neutralised back
  to `initial.activeRoots`); full suite `npm test` → 479 files / 9557 tests
  passed; `npm run typecheck` → clean; `npm run lint` → clean.
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`, deep) — F1 (fidelity: comments
  claimed a "five-source" union while covering four; package coverage gap),
  F2 (correctness: Windows path-separator mismatch put one physical directory
  into `watchRoots` under two spellings), R1/R2 (house-rule, comment-only).
  Round 2 (`bug-fix-reviewer-fast`) — CLEAN; R3 (prose: witness header still said
  "five-source") fixed as comment-only polish, no further review round required.
- Verification: SOLID. (1) the witness reds when the fix is neutralised (exact
  signature) and greens when restored byte-exact; (2) full suite 479/9557 green;
  (3) no live cell owed — settled by inspection (see Residuals/self-adjudication);
  (4) lint + typecheck clean.
- Residuals:
  1. Present-but-empty PACKAGE contributing directories (the fifth spec source)
     are not armed — out of this fix's four-source scope per §Summary's own
     enumeration (which lists only `.pi/theta/`, global `~/.pi/agent/theta/`, and
     `--theta`/`thetaPaths`). File-bearing package dirs stay covered via the
     file-derived `activeRoots`. Closing it needs `package-discovery.ts` to
     expose its present contributing dirs and union them into `watchRoots` — a
     file outside this bug's §Affected. Evidence: §Summary source enumeration;
     §Affected names `production-composition.ts` + `hot-reload.ts` only;
     `src/discovery/package-discovery.ts` byte-unchanged.
  2. Line-number citation drift: this fix grows `production-composition.ts` by
     ~20 lines, shifting line-form `production-composition.ts:N` citations in
     ~43 test files + `pass-verdict-memo.ts`. The implementer's mass
     "correction" of these was reverted (collision-prone — siblings 0311/0312/
     0313 also edit this file and will reshift the same citations). Recommend the
     parent reconcile `production-composition.ts` line-citations once, after all
     watcher-family lanes merge. Comment-only; no assertion affected.
- Discharge notes appended: none.
- Pinned dispositions / non-goals:
  - INV-1 containment semantics of `activeRoots` unchanged (§Non-goals);
    verified the producer-deps / `resolveThetaToolsAtLoad` /
    `checkInvokeStaticResolution` sites still read the local file-derived
    `activeRoots`, never `watchRoots`.
  - Self-adjudication — "unioned with" over "instead of" (§Fix constraint 1):
    chosen because a settings glob reaches `.theta` files in subdirectories
    below its static-prefix root, whose `dirname` (in `activeRoots`) is not
    reconstructed by `walk.roots`; "instead of" would regress that coverage.
    Three sources: §Fix constraint 1 permits "(or unioned with)";
    `discovery-walk.ts` `addGlob`/`staticPrefixRoot`; the pre-fix watch set is
    `dirname(theta.path)` per found file. Bound: additive union only.
  - Self-adjudication — four-source scope (F1): package deferral, per Residual 1.
    Three sources as cited there. Bound: comment-only; `package-discovery.ts`
    untouched; no coverage regression for file-bearing package dirs.
  - Self-adjudication — no live cell owed (LIVE POLICY branch b): the fix
    changes only the CONTENTS of the `roots` array handed to the unchanged
    `watch(roots, …)` seam. Three sources: `src/seams/pi-file-watcher.ts`
    byte-unchanged (no new real-chokidar code path); the watcher subsystem is
    architecturally seam-faked with zero existing live watcher coverage —
    `FakeFileWatcher` is "the conformance vehicle for the watcher delivery
    contract" (`tests/helpers/fake-file-watcher.ts:2`); session_start
    registration outcomes are byte-unchanged (only the armed-directory set
    widens). Bound: had `pi-file-watcher.ts` changed or a registration outcome
    moved, a live cell would be owed — STOP valve, not exercised.
  - Coordination — bug 0312 edits the SAME watch-list construction site to add
    import-closure `.thetalib` paths; this fix left it a clean additive `Set`
    union (`[...initial.watchRoots, ...settingsFilePaths(…)]`) 0312 can extend.
    Not contradictory. Bug 0311's structural-note files
    (`hot-reload.ts`/`reload-wiring.ts`/`reload-debounce.ts`) untouched.

## Provenance

Bug-hunt area `reload-lifecycle`, seed hypothesis 1/2 (watcher scope vs load
closure). Probed offline at bc52da38 with a roots-recording `FileWatcher`
fake through the shipped factory + composition; probe deleted after
confirmation.
