# Bug 0471 — the watcher→debouncer wiring forwards *every* `add`/`change`/`unlink` under a discovery root to the reload debouncer with no `.theta`/`.thetalib`/settings filter, so writing an unrelated file (a `.md` scratch note, an editor swap file) triggers a full corpus re-parse and load-diagnostic re-emission — contradicting the debouncer's own documented contract

- **Status:** fixed (0.465.0).
- **Sev/Diff estimate:** S3/D1 — S3: wasted work and, through
  [0470](./0470-load-diagnostics-re-emit-without-dedup.md) and
  [0469](./0469-watcher-note-mid-tool-execution-breaks-tool-adjacency.md),
  the trigger for both a noise storm and a session-corrupting race; no
  incorrect theta behaviour on its own. D1: a predicate at one call site plus
  unit tests; the predicate already exists in the same file.
- **Kind:** defect — the implementation contradicts BOTH the spec and its own
  documented contract. [`registration-steps.md`](../spec_topics/pi-integration-contract/registration-steps.md)
  §"Hot-reload subsystem" pins the trigger normatively: *"On a chokidar event
  for an **existing** theta or `.thetalib` file the watcher debounces…"* — a
  reload fires on a theta/`.thetalib` source (and, per §"Structural changes" and
  package-and-settings.md §"Caching and reload", a settings-file edit), not on an
  arbitrary file under a watched directory. `ReloadDebouncer.onWatcherEvent`'s
  doc-comment
  (`src/extension/reload-debounce.ts:109-111`) opens with "A watcher event for
  an existing theta / `.thetalib` / settings file", i.e. the debouncer is
  specified over a *filtered* event stream. Nothing filters it. The predicate
  that would do the filtering is defined a few hundred lines away in the file
  that does the wiring (`isThetaSourcePath`, `src/extension/hot-reload.ts:153-155`)
  and is applied only to compute the structural-change note's added/removed
  lists (`:342`, `:346`), never to gate the rebuild.
- **Related:**
  - [0469](./0469-watcher-note-mid-tool-execution-breaks-tool-adjacency.md)
    (open) — each spurious rescan is a chance to corrupt the session.
  - [0470](./0470-load-diagnostics-re-emit-without-dedup.md) (open) — each
    spurious rescan re-emits the whole warning set.
  - [0312](./0312-out-of-root-thetalib-edits-invisible-stale-imports.md) — the opposite
    failure: `.thetalib` edits that were *not* seen. The fix here must not
    narrow that recovery: bug 0312's out-of-root `.thetalib` closure
    directories are part of the watch set and their `.thetalib` files must keep
    triggering rebuilds.
  - [0313](./0313-every-chokidar-error-classified-terminal.md) — the
    per-`watch()` active-guard in the same seam; unaffected by this fix.
- **Affected** (at 359d27ef, v0.464.0):
  - `src/extension/hot-reload.ts:386` and `:421` —
    `onChange: (event) => debouncer.onWatcherEvent(event)` at both arming
    sites (initial arming and the bug-0312 re-arm), each forwarding the raw
    event.
  - `src/extension/reload-debounce.ts:123-131` — `onWatcherEvent` accepts any
    `FileWatchEvent` and schedules a rebuild; its contract sentence at
    `:109-111` says otherwise.
  - `src/seams/pi-file-watcher.ts:131-141` — the seam forwards chokidar's
    `add`/`change`/`unlink` for any path under the roots. This is correct at
    the seam level (a transport should not embed policy); the filter belongs at
    the wiring.
  - Discovery roots in the seeding project include `.localpi/` — a directory
    whose declared purpose is local scratch state — which is what made this
    observable.

## Symptom

Observed directly during the investigation that produced this report: writing
eleven `.md` files into `.localpi/tmp/` (a discovery root, holding no `.theta`
sources at all) produced a rescan per write, each re-emitting the project's
three load warnings into the live session transcript. The user saw the same
three-warning block appear after nearly every file write.

The same mechanism at higher rate in the seeding session — ~20 completed
rescans per minute sustained over four minutes — with no `.theta` file changing
at any point:

```
2026-09-07T21:48   60 load-warning notes   (= 20 rescans × 3 warnings)
2026-09-07T21:49   60
2026-09-07T21:50   59
```

## Expected

Reload is defined over theta sources and settings. The structural-change
semantics in
[`registration-steps.md`](../spec_topics/pi-integration-contract/registration-steps.md)
are stated over `.theta`/`.thetalib` add/unlink paths; the settings re-merge is
its own arm (`src/extension/reload-wiring.ts:11`). A file that is none of those
— a Markdown note, an editor temp file, `Thumbs.db` — changes nothing the load
pass reads, so it should schedule no rebuild and produce no emission.

## Actual

Every filesystem event under any watched root schedules a debounced full
rebuild: re-parse the corpus, re-run the load pass, re-emit every load
diagnostic (0470), with the completion landing at an arbitrary point in the
session's turn structure (0469).

## Fix (shipped 0.465.0)

`installHotReload` now gates the watcher stream: an `onChange` closure admits an
event only when `isThetaSourcePath(event.path)` (`.theta`/`.thetalib`, by
separator-independent `endsWith`) or the separator-normalised path is one of the
exact settings-file paths, threaded in as the new optional
`InstallHotReloadDeps.reloadTriggerPaths` (the project + global `settings.json`
resolved by `settingsFilePaths(ctx, fs)` in the composition). Every other event
is dropped before the debouncer schedules anything. Both arming sites (initial
arm + the bug-0312 re-arm) share the one closure. The settings match is
separator-normalised through `toPosixFileSpelling` (bug-0467 class). Witnessed by
`tests/watcher-hot-reload-integration.test.ts` cases (f) (a `.md` write under a
discovery root triggers no reload and emits no note) and (g) (a `settings.json`
change still triggers one). (`src/extension/hot-reload.ts`,
`src/extension/production-composition.ts`.)

The structural-note filtering at `hot-reload.ts` `:342`/`:346` is unchanged —
this added a gate upstream of the debounce, it did not move the existing one;
bug-0312's out-of-root `.thetalib` closure still passes (the filter is by
extension, not by root).

### The design fix (unchanged from the original recommendation)

Apply the existing predicate at the wiring, in both arming sites, before
`debouncer.onWatcherEvent(event)`:

- pass `.theta` and `.thetalib` paths (`isThetaSourcePath`, already present);
- pass the settings file(s) the settings-re-merge arm consumes — resolve the
  exact filename set from the settings arm rather than hardcoding, so the two
  cannot drift;
- drop everything else without scheduling a rebuild.

Care points for the implementer:

- The structural-change note's own `isThetaSourcePath` filtering at `:342`/`:346`
  stays as-is; this adds a gate upstream of the debounce, it does not move the
  existing one.
- Bug 0312's out-of-root `.thetalib` closure directories must keep working:
  the filter is by *extension*, not by root, so a `.thetalib` under such a
  directory still passes.
- Directory-level events are already excluded at the seam by construction
  (`addDir`/`unlinkDir` are never wired) and need no handling here.
- The debouncer's contract sentence becomes true rather than aspirational; no
  change needed there beyond possibly a cross-reference.

## Test obligations

- Offline: a `.md`/`.txt`/extensionless path under a root schedules **no**
  rebuild (assert the injected clock received no `setTimeout`).
- Offline: `.theta`, `.thetalib`, and the settings file each schedule exactly
  one rebuild, and a burst of them still coalesces into one (existing coalescing
  tests must stay green).
- Offline: a `.thetalib` under a simulated out-of-root closure directory still
  schedules a rebuild (0312 guard).
- Offline: add/unlink of a `.theta` still reaches the structural-change note
  path with the same added/removed lists as before.
