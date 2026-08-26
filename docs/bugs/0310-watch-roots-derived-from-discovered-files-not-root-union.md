# Bug 0310 — The armed watch set is the dirnames of the thetas discovery FOUND, not the discovery-root union: a present-but-empty active root (`.pi/theta/` with no thetas yet) is never watched, so the first `.theta` created there produces no watcher event, no structural-change note, and no registration until an unrelated edit or `/reload`

- **Status:** open.
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

## Provenance

Bug-hunt area `reload-lifecycle`, seed hypothesis 1/2 (watcher scope vs load
closure). Probed offline at bc52da38 with a roots-recording `FileWatcher`
fake through the shipped factory + composition; probe deleted after
confirmation.
