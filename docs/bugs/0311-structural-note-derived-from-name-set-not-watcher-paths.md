# Bug 0311 — The structural-change note is derived from the registered-NAME set diff, not from watcher-observed file add/remove paths: a parse-breaking content edit draws a false `theta watcher: 1 file(s) added or removed` note, a same-window unlink+add of one path draws none where PIC-38 mandates `N = 2`, and `details.structural` carries slash names where the wire contract pins absolute file paths

- **Status:** fixed (0.314.0).
- **Sev/Diff estimate:** S2/D2 — S2 on the "diagnostics that lie" letter: the
  note's fixed template asserts a file was "added or removed" over a window in
  which no file was added or removed (a content edit that broke the parse),
  and directs the author to `/reload` when the actual remedy is fixing the
  parse error the co-emitted rows describe; the inverse direction silently
  suppresses the note PIC-38 mandates for a same-window remove+add of one
  path. No value is miscomputed and registration outcomes are unaffected —
  the wrongness is confined to the informational note's emission condition
  and payload. D2 because the honest fix moves the note's data source from
  the post-rebuild name diff to the debounce-window event batch (paths must
  be accumulated across `onWatcherEvent`, which today takes no arguments —
  `reload-debounce.ts:110`), a seam-shape change touching three files, and
  the emission must then reconcile with the fact that the implementation
  also auto-registers on reload (the note's `/reload` prompt is partially
  redundant there).
- **Kind:** defect — implementation violates three pinned rules of one
  paragraph.
  - `registration-steps.md:36` (*Structural changes*): "per-`.theta`-file
    content edits are not [structural changes]"; a window that "does not net
    any added or removed `.theta` / `.thetalib` files" produces no note
    (restated as PIC-37 at `:38`).
  - `registration-steps.md:40` (PIC-38): "A rename observed within one
    debounce window as `removed` of path P followed by `added` of path P has
    `added.length + removed.length === 2` … and the note MUST be emitted."
  - `runtime-event-channel.md:24`: "`added` and `removed` carry **absolute
    file paths** from the debounce-window batch."
- **Related:**
  - 0255/0264 (fixed) — note-channel delivery-count rules on the load path;
    different rule (per-file batching), different mechanism.
  - Sibling report 01 (this hunt) — the watch-roots basis; independent
    mechanism, same file. A `thetaPaths` edit that adds an EMPTY directory
    nets no name change AND no file change, so both bases agree there; the
    divergences below are where they disagree.
- **Affected** (at bc52da38, v0.287.0):
  - `src/extension/hot-reload.ts:134` — `currentNames`, the baseline: "The
    set of currently-registered slash names".
  - `src/extension/hot-reload.ts:262–276` — `nextNames` from the
    freshly-composed thetas' `slashName`s; `added`/`removed` as name-set
    diffs; `structuralChangeNote(added, removed)`; baseline update.
  - `src/extension/reload-wiring.ts:463–483` — `structuralChangeNote` counts
    and embeds whatever arrays it is handed (`details.structural.added/
    removed`); handed names, it ships names.
  - `src/extension/reload-debounce.ts:110–116` — `onWatcherEvent()` takes no
    event; the path batch the spec's counting rule is defined over is
    discarded at the debouncer boundary (`hot-reload.ts:291` wires
    `onChange: () => debouncer.onWatcherEvent()`).
- **Observed at:** v0.287.0 (bc52da38), offline — deterministic vitest probes
  over the shipped `composeExtensionInstance` with fake `FileWatcher` +
  `FakeClock` seams (probes since deleted; recipes below).

## Summary

The reload pass computes the structural-change decision AFTER the rebuild, as
a set difference between the previously registered slash names and the
freshly composed ones (`hot-reload.ts:262–276`). The spec defines the note
over the debounce window's observed add/unlink PATHS
(`registration-steps.md:36`, counting rule over `details.structural`, whose
arrays the wire contract pins as absolute paths). The two bases disagree in
both directions:

- Over-emission: any content edit that changes whether a file composes —
  breaking a theta's parse (name leaves the set), fixing it back (name
  re-enters) — emits the note with a false "file(s) added or removed" claim.
- Under-emission: a same-window `unlink`+`add` of the same path (the
  editor save-via-rename burst PIC-38 names as its subject) nets a zero name
  diff and emits nothing, where PIC-38 mandates the note with `N = 2`.
- Payload: `details.structural.removed` carries `["greet"]` (a slash name)
  where `runtime-event-channel.md:24` pins absolute file paths.

## Reproduction

Offline, deterministic. Harness: `tests/watcher-hot-reload-integration.test.ts`
pattern (fake pi capturing `sendMessage` notes, `FakeFileWatcher`, `FakeClock`;
`composeInstance` forwarding the factory's `ownRegisteredNames` ledger).

**(A) False note on a parse-breaking content edit.** Workspace
`.pi/theta/{greet,second}.theta`, both valid; `session_start`; then overwrite
`greet.theta` with `let = = =` (same path, no add/remove), emit one `change`
event for it, advance the clock 250 ms. Observed once the rebuild settles:

```
content: "theta watcher: 1 file(s) added or removed; run /reload to refresh the slash command list"
details.structural: {"added":[],"removed":["greet"]}
```

No file was added or removed; `removed` carries a name, not a path. (Control
in the same probe: `second` survives the pass — sibling isolation intact.)
Restoring the original bytes and firing again emits the mirror note with
`added: ["greet"]`.

**(B) Suppressed note on a same-window remove+add of one path.** From the
same boot, deliver `{kind:"unlink", path:<greet>}` then
`{kind:"add", path:<greet>}` in one window (file present on disk), advance
250 ms, wait for the rebuild's re-register. Observed: zero
`theta watcher:` notes. PIC-38 mandates
`theta watcher: 2 file(s) added or removed; …`.

## Expected behaviour

- `registration-steps.md:36`: the note fires "When the watcher observes such
  an event" — a file add/remove — and `<N>` "equals
  `details.structural.added.length + details.structural.removed.length` (a
  path that appears in both arrays — e.g., a rename observed as
  removal-then-addition within the same debounce window — counts twice…)";
  suppression is pinned to windows that "do not net any added or removed
  `.theta` / `.thetalib` files"; "per-`.theta`-file content edits are not"
  structural changes.
- `registration-steps.md:38/:40` (PIC-37/PIC-38): the closed emission /
  suppression contracts over that path basis.
- `runtime-event-channel.md:24`: `details.structural.added/removed` carry
  absolute file paths from the debounce-window batch.

## Actual behaviour / root cause

The event batch is discarded before the decision point: the watcher's
`onChange` drops the `FileWatchEvent` (`hot-reload.ts:291`), and
`ReloadDebouncer.onWatcherEvent()` has no path parameter
(`reload-debounce.ts:110`). With no window batch available, `runReload`
reconstructs "structural change" post hoc from the composed name set
(`hot-reload.ts:262–276`), which conflates registration-outcome changes
(parse broke/fixed, collision drops) with file add/remove, and cannot see a
same-path remove+add at all. `structuralChangeNote`
(`reload-wiring.ts:463–483`) then embeds the name arrays as
`details.structural`, violating the wire pin.

The implementation comment at `hot-reload.ts:262–265` documents the
substitute basis ("emit only when the registered theta SET changed …
comparing against the last successfully-registered set") — a deliberate
approximation, but one that both the emission contract and the payload
contract are defined against and diverge from.

## Why it matters

- The false note actively misdirects: an author who typos a theta gets the
  parse rows AND a note claiming a file-level add/remove and prescribing
  `/reload` — which does nothing for a parse error. Operators keying on the
  fixed template (it is byte-pinned precisely so tooling can key on it)
  will misclassify content regressions as file churn.
- The suppressed PIC-38 case hides real churn: editors that save via
  unlink+recreate produce exactly this burst; the spec chose to surface it.
- The names-for-paths payload breaks any `details.structural` consumer that
  resolves entries as paths (the wire contract invites exactly that).

## Non-goals

- Whether the reload pass should auto-register on reload at all (it does,
  making the `/reload` prompt partially redundant; that design question is
  older than this report and not challenged here).
- The watch-roots basis
  ([0310](./0310-watch-roots-derived-from-discovered-files-not-root-union.md)).
- PIC-37's positive obligations (validator-cache/settings-cache invalidation
  on suppressed windows) — not probed here.

## Fix

Route settled within the four binding constraints below (they remain the
operator's decision; the shipped route is recorded under **Fix (0.314.0)**).
Constraints:

1. The debounce boundary must carry the window's event batch (kind + path)
   to the rebuild — `onWatcherEvent(event)` accumulating into a
   window-scoped batch that `runReload` consumes and clears; PIC-49 deferral
   must merge batches, not drop them.
2. The note decision keys on netted `add`/`unlink` paths for
   `.theta`/`.thetalib` files per `registration-steps.md:36`, with the
   PIC-38 both-arrays rule (no dedup across roles).
3. `details.structural` carries absolute paths (`runtime-event-channel.md:24`).
4. The existing (b)+(c) cell in
   `tests/watcher-hot-reload-integration.test.ts:218–240` pins the current
   name-diff behaviour for a REAL unlink (which the path basis also emits
   for, `N = 1`) — it survives; new cells pin (A) suppression and (B)
   emission above.

## Fix (0.314.0)
- What shipped:
  - `src/extension/reload-debounce.ts` — §Fix (1): `onWatcherEvent(event?)`
    accumulates the window's events into a scoped `#batch`; the `rebuild` dep
    takes `(batch)`; `#startRebuild` drains `#batch` synchronously before the
    await, and `#onWindowClosed`'s deferred arm does NOT drain, so a window
    closing mid-flight MERGES into the deferred rebuild's batch (PIC-49). The
    `event` param is optional so the pre-existing timing/serialization tests
    keep exercising coalescing with no batch payload.
  - `src/extension/hot-reload.ts` — §Fix (2)+(3): `runReload(batch)`; `onChange`
    forwards the event; the structural note's `added`/`removed` are the
    within-role-deduped ABSOLUTE paths of `add`/`unlink` `.theta`/`.thetalib`
    events in the batch (no cross-role dedup — PIC-38 both-arrays). The dead
    `currentNames` name-diff is removed; `structuralChangeNote`
    (`reload-wiring.ts`) was already path-agnostic and is UNCHANGED.
  - `tests/watcher-hot-reload-integration.test.ts` — §Fix (4): the (b)+(c) cell
    re-anchored `change`→`unlink` (neutral at HEAD; `N = 1` under the path
    basis). Assertions unchanged.
- Gates: witness `tests/b0311-structural-note-derived-from-paths.test.ts`
  RED-before / GREEN-after (revert-witness red-then-green with byte-exact
  restore); full offline suite `npx vitest run` → 490 files / 9644 tests green;
  `npm run typecheck` clean; `npm run lint` clean.
- Review: 2 rounds. R1 (deep): findings, no blockers — F1 (constraint-(1) PIC-49
  merge unwitnessed), R1/R2 (stale/under-enumerated comments); all addressed.
  R2 (fast): clean. One comment-only polish round (post-polish gate-diff skip).
- Verification: SOLID. Witnesses catch the bug (byte-exact revert red→green on
  both src files); default suite green; live obligation discharged by
  `b0324live` acceptance GREEN under the lock (composed extension loads/
  registers/drives via real `pi -p`); typecheck + lint clean.
- Residuals:
  1. [BLOCKING — parent ratification] `tests/live/double-session-start-live.test.ts`
     (bugs 0048/0021) reds under the path basis: its bug-0048 warm-up delivery
     witness relied on the old name-basis firing the note for a content `change`
     to a new-to-registry file; the correct path basis fires only for a real
     `add`/`unlink`. Observed red ("Notes seen since boot: []"). Out of 0311's
     scope (another concern's executable live test — not modified). Recommended
     remedy: force a real structural event in that warm-up (unlink+recreate per
     retry → deterministic `unlink`+`add`, or a distinct filename per retry).
     Live-only (excluded from `npm test`/CI).
  2. Settings-array edits no longer surface the structural note under the path
     basis (constraint (2) scopes it to `.theta`/`.thetalib` add/unlink); the
     `runtime-event-channel.md:24` settings→resolved-path clause needs 0312's
     watch-set re-arm. No existing test covers it. Flag for 0312.
  3. `InstallHotReloadDeps.initialNames` retained unused (removal would ripple
     into `production-composition.ts` + red three test object literals); WHY-
     commented per §Fix dead-code guidance.
- Discharge notes appended: none (residual 1 is filed here for parent action).
- Pinned dispositions / non-goals: `structuralChangeNote` template unchanged;
  `watcher-recovery.ts` / `pi-file-watcher.ts` untouched (0313); roots derivation
  in `production-composition.ts` untouched (0310/0339); the batch accumulator is
  per-window and watcher-instance-agnostic so 0312's watch-set re-arm is not
  foreclosed.

## Provenance

Bug-hunt area `reload-lifecycle`, seed hypotheses 2/5 (rename in one window;
one-theta-breaks reload pass). Probed offline at bc52da38; probes deleted
after confirmation.
