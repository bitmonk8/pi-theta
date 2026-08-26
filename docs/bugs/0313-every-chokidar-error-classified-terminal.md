# Bug 0313 — `PiFileWatcher` conveys EVERY chokidar `error` as the PIC-55 terminal signal, so the continues-delivering arm (transient toast, hot-reload survives) is unreachable: one per-path error tears down the whole still-delivering watcher and emits the persistent `watcher-terminated` note, and nothing latches that note against an error burst

- **Status:** open.
- **Kind:** defect — the implementation collapses PIC-55's two-case posture
  into its terminal case. `registration-steps.md:28` (PIC-55): "The
  operational criterion distinguishing the two cases is whether the chokidar
  adapter's underlying watcher keeps emitting filesystem events … after the
  error"; "**(Continues-delivering.)** When the watcher keeps delivering
  events on the watched roots after the error, hot-reload survives; the error
  is surfaced as a transient informational `ctx.ui.notify` toast … and no
  further recovery action is taken." The shipped adapter never evaluates the
  criterion and ships no toast arm: `watcher.on("error", () =>
  onTerminate?.({ roots }))` (`src/seams/pi-file-watcher.ts:41`) maps every
  error to the terminal-signal channel, and the recovery unconditionally
  tears the (single, union) watcher down and emits the persistent
  `theta/runtime/watcher-terminated` note
  (`src/extension/watcher-recovery.ts:112–131`).
- **Sev/Diff estimate:** S2/D3 — S2 because a transient, per-path error
  converts a healthy subsystem into a permanently halted one and the note
  then truthfully reports a halt the recovery itself inflicted: hot reload is
  dead until `/reload` for an input class the spec pins as
  survive-with-toast. On the burst axis the note's "single persistent note"
  MUST (`registration-steps.md:28`) has no guard of its own: chokidar
  invokes the error listener synchronously once per failing path
  (`_handleError` → `this.emit(EV.ERROR, …)`,
  `node_modules/chokidar/esm/index.js:528–536`), `armWatcherWithTerminalRecovery`
  carries no latch around the note (`watcher-recovery.ts:115–131`), and
  `PiFileWatcher`'s unsubscribe sets `active = false` and fire-and-forgets
  the async `watcher.close()` (`pi-file-watcher.ts:44–50`). Which byte-level
  violation a same-tick second error produces is underived here: a second
  persistent note if the `error` listener survives the first callback's
  close window, or an unhandled `'error'` throw out of the emitter if
  `close()`'s synchronous listener removal lands first — either violates
  the single-note contract, and the missing latch is the defect. D3 because the honest fix needs a
  continues-delivering discriminator at the adapter (chokidar exposes no
  per-root liveness signal; the practical split is error-code triage — e.g.
  EPERM/EACCES per-path errors vs. watcher-fatal ones — or a probe-after-error
  design) plus a latch, and PIC-55 leaves the terminal-signal member shape to
  the implementer, so the seam contract (`src/seams/file-watcher.ts:31–39`)
  moves too.
- **Related:**
  - 0018 (fixed, 0.28.0) — PIC-67 stale-ctx handling ON the terminal-note
    delivery path (`watcher-recovery.ts:132–150`); orthogonal: that guards
    the note's delivery against a dead runtime, not its classification or
    count.
  - 0030 (fixed, 0.35.0) — cites `tests/watcher-terminated-recovery.test.ts`;
    that suite drives the terminal arm through the seam FAKE
    (`tests/helpers/fake-file-watcher.ts:33–39`), whose unsubscribe clears
    the handlers synchronously — stronger than the production adapter — so
    the burst double-note is invisible to it.
- **Affected** (at bc52da38, v0.287.0):
  - `src/seams/pi-file-watcher.ts:41` — the unconditional `error` →
    `onTerminate` mapping; `:29–31` — chokidar armed with
    `{ ignoreInitial: true }` only, so `ignorePermissionErrors` defaults off
    and EPERM/EACCES per-path errors DO emit (`chokidar/esm/index.js:533`).
  - `src/seams/pi-file-watcher.ts:44–50` — unsubscribe: `active` guards only
    re-entry; `void watcher.close()` is async and the `error` listener stays
    attached for the synchronous remainder of the burst.
  - `src/extension/watcher-recovery.ts:112–131` — terminal recovery: `unsub()`
    (whole union watcher, all roots) + `sendSystemNote(watcher-terminated)`;
    no once-latch (the `staleLog` latch at `:139–150` covers only the
    stale-ctx stderr line).
  - No `src/` call site implements the continues-delivering toast: the only
    watcher-path `ctx.ui.notify` uses are the load-diagnostic router
    (`production-composition.ts` `makeLoadEmit`) and the note channel's
    fallback — none reachable from a chokidar `error`.
- **Observed at:** v0.287.0 (bc52da38), offline code-path analysis plus
  chokidar 4.0.3 source. **Live-untested:** no deterministic offline trigger
  for a real chokidar `error` was found (a probe deleting a watched root on
  this Windows host produced no error and the sibling root kept delivering —
  which itself demonstrates errors are not the only continuation concern);
  the EPERM/locked-file trigger needs a genuinely locked file. The
  classification and latch claims are structural (every error takes the
  terminal path; nothing emits the toast; nothing latches the note), not
  timing claims.

## Summary

PIC-55 splits chokidar errors into continues-delivering (toast, survive) and
stopped-delivering (terminal note, watcher stays down). The shipped adapter
has one wire: every `error` event becomes the terminal signal, the recovery
closes the whole union watcher — including roots that were still delivering —
and emits the persistent "theta watcher terminated; hot-reload halted until
/reload" note. The spec's toast case is dead code-by-omission: no path from a
chokidar error reaches `ctx.ui.notify`, so the arm
`diagnostic-shape.md:22` reserves for "the informational chokidar-error case"
can never fire. Separately, the "single persistent `theta-system-note`" MUST
has no enforcement: chokidar emits one `error` per failing path
synchronously, `PiFileWatcher` keeps the listener attached through its async
close, and `armWatcherWithTerminalRecovery` sends one note per callback.

## Reproduction

Structural (code-path), with the reachability of the input class witnessed
from chokidar 4.0.3 source rather than a live error:

1. Classification: `pi-file-watcher.ts:41` is the only error wiring; its
   callback is the seam's terminal channel. `watcher-recovery.ts:112–131` is
   the only `onTerminate` consumer; it unsubscribes and sends the persistent
   note. `rg`ing `src/` for a `ctx.ui.notify` reachable from a watcher error
   finds none.
2. Reachability of continues-delivering errors: chokidar's `_handleError`
   (`chokidar/esm/index.js:528–536`) emits `error` and RETURNS — emission
   does not close the watcher; other paths keep delivering. Its callers are
   per-path: the per-watch `errHandler` (`chokidar/esm/handler.js:327`),
   readdirp scan streams (`:488`), and stat failures (`:623`). With
   `ignorePermissionErrors` unset (`pi-file-watcher.ts:31`), a single
   EPERM/EACCES on one locked file inside a watched root — routine on
   Windows (editor swap files, AV scanners) — emits `error` while every
   other path continues delivering.
3. Burst (underived disposition; code-shape only): two locked files in one
   scan → `_handleError` twice, synchronously. No latch guards the note
   (`watcher-recovery.ts:115–131`), so if the `error` listener survives the
   first callback's close window the second emit reaches `onTerminate` and
   `sendSystemNote(watcher-terminated)` fires twice; if `watcher.close()`'s
   synchronous listener removal lands first, the second `emit('error', …)`
   finds zero listeners and throws per Node's reserved-`error` semantics. A
   fixer must derive which; both violate the contract. The committed
   terminal-arm tests can see neither: `FakeFileWatcher`'s unsubscribe clears
   `#onTerminate` synchronously (`tests/helpers/fake-file-watcher.ts:33–39`),
   a stronger guarantee than the production adapter provides.

## Expected behaviour

- `registration-steps.md:28` (PIC-55): continues-delivering errors → "hot
  reload survives; the error is surfaced as a transient informational
  `ctx.ui.notify` toast … and no further recovery action is taken"; terminal
  case → "the runtime MUST emit a **single** persistent `theta-system-note`
  carrying the `theta/runtime/watcher-terminated` diagnostic".
- `diagnostic-shape.md:22` (Transient toasts): the chokidar-error case is the
  named occupant of the toast surface ("the transient toast above stays
  reserved for the informational chokidar-error case").

## Actual behaviour / root cause

The seam carries no liveness information (`WatchTermination` is just the root
list, `src/seams/file-watcher.ts:31–39`), so the adapter cannot express — and
the recovery cannot decide — the spec's operational criterion. The adapter
resolves the ambiguity in the always-terminal direction
(`pi-file-watcher.ts:38–41`, comment: "a chokidar `error` leaves the watched
roots no longer delivering events" — asserted, never checked; false for the
per-path error class chokidar's own emission sites serve). The recovery then
makes the assertion true by closing the watcher itself. The note has no
latch because the designed posture assumed one terminal signal per lifetime.

## Why it matters

- One locked file in `.pi/theta/` (Windows editors and AV produce these
  constantly) permanently halts hot reload for the session and posts a
  transcript-persistent error note; the spec's design absorbs the same input
  with a toast.
- The halt also takes down the settings-file watcher (one union watcher), so
  `thetaPaths`/`binderModel` edits stop applying too.
- An error burst has no single-note guard: depending on listener-removal
  timing it either spams the transcript with N identical persistent errors
  or throws an unhandled `'error'` out of the emitter (underived which;
  both violate the byte-pinned single-note contract).

## Non-goals

- The PIC-67 stale-ctx arm on the note delivery (bug 0018's fix) — correct
  and untouched.
- Whether a deleted watched ROOT should be terminal — it is
  (stopped-delivering for that root per PIC-55); only the classification of
  still-delivering errors is at issue.
- chokidar version choice.

## Fix

Not yet decided. Constraints:

1. The adapter must implement the PIC-55 criterion or a conservative proxy
   the spec's implementer latitude (GOV-18 arm (a)) admits: e.g. treat
   per-path `EPERM`/`EACCES`/stat errors as continues-delivering (toast via a
   new seam channel or an injected notifier), reserving `onTerminate` for
   errors that provably killed delivery (watcher `close`d, fs.watch handle
   errors on a root), optionally verified by a cheap post-error probe touch.
2. The terminal note gains a once-latch per extension instance (mirror the
   `StaleQuiesceLog` pattern already shared across the stale arms).
3. `PiFileWatcher`'s unsubscribe should detach listeners synchronously (or
   guard the callbacks on `active`) so post-close callbacks cannot re-enter.
4. `FakeFileWatcher` must not stay stronger than production: give it the
   production adapter's post-unsub delivery window (or weaken production to
   the fake's contract) so the burst case is testable; then pin single-note.
5. Any toast text stays off the persistent channel per
   `diagnostic-shape.md:22`.

## Provenance

Bug-hunt area `reload-lifecycle`, seed hypothesis 8 (watcher event storms)
crossed with the PIC-55 spec read. Code-path analysis at bc52da38; one
empirical probe (root deletion under real chokidar on Windows: no error
emitted, sibling root kept delivering — consistent with errors being rarer
and per-path) deleted after running.
