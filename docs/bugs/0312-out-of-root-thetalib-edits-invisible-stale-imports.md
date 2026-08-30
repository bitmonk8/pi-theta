# Bug 0312 — A `.thetalib` imported via a parent-relative path (`../lib/x.thetalib`) resolves outside every discovery root and is therefore outside the armed watch set: editing it fires no reload, and the importing theta keeps dispatching the stale materialised imports — silently in prompt mode, and as a drive-time `subagent-callable-hash-mismatch` refusal for a subagent callable hashed over the old bytes

- **Status:** fixed (0.315.0).
- **Kind:** spec gap **plus** implementation consequence — a reachable input
  class with no prescribed disposition, observably hazardous.
  - *Reachable input:* `imports.md:19` legalises parent-relative import paths
    by example — "theta 1.0 supports relative paths only:
    `"./shared/personas.thetalib"`, `"../lib/schemas.thetalib"`" — and IMP-1
    (`imports.md:23`) imposes no containment rule (unlike `tools:` `.theta`
    entries and `invoke` paths, which INV-1 confines to active roots). A
    `.theta` directly in a root importing `../lib/x.thetalib` resolves one
    level above the root: legal, registers clean. Confirmed by probe.
  - *No prescribed disposition:* the hot-reload subsystem
    (`registration-steps.md:26`) prescribes re-parse "On a chokidar event for
    an **existing** theta or `.thetalib` file … plus every transitive
    `.thetalib` importer reached through the import graph", and step 5
    (`registration-steps.md:22`) scopes the watcher to "the discovered
    roots". A `.thetalib` outside every root can never produce such an event
    under that watcher, and no spec sentence prescribes watching the import
    closure, refusing out-of-root imports, or noting the staleness. Spec and
    implementation together fail to deliver the documented behaviour ("a
    chokidar event for an existing … `.thetalib` file" re-parses importers)
    for this input class.
- **Sev/Diff estimate:** S2/D3 — S2 because the importer silently runs OLD
  code: the author edits the shared library, sees no error, invokes the
  theta, and gets results computed from bytes that no longer exist on disk,
  with zero diagnostics (impact class: silent stale dispatch). The subagent
  half is loud but misleading: the load-time closure hash
  (`#subagent-theta-callable-hash`, bugs 0267/0270/0271 context) is captured
  over the old lib bytes and marshalled to the child, which re-reads the
  fresh bytes and refuses fail-closed with
  `theta/runtime/subagent-callable-hash-mismatch`
  (`src/runtime/subagent-child-hash-verify.ts:11–13`) — a
  tamper-shaped refusal for an ordinary edit. D3 because the clean fixes all
  have costs: watching the import closure means re-arming the watcher when
  the graph changes across reloads; containing imports to roots is a
  language-level restriction imports.md deliberately does not state; a
  spec-side adjudication is needed before code.
- **Related:**
  - Sibling report 01 (this hunt) — watch-roots basis. Disjoint: even the
    spec-conformant root union does not cover an out-of-root lib; this
    report's input class needs its own disposition.
  - 0267/0270/0271 (fixed) — load-time closure-hash / callee-judgment
    machinery; supplies the hash-mismatch observable cited here, mechanism
    untouched.
  - 0110/0111 (fixed) — load-time containment for `tools:` `.theta` entries;
    the contrast case: imports have no such rule.
- **Affected** (at bc52da38, v0.287.0):
  - `src/extension/production-composition.ts:634–636` / `:1416–1419` — watch
    set = dirnames of discovered thetas + settings files; no import-closure
    contribution.
  - `src/parser/imports.ts` `RelativeThetaLibResolver` (by symbol; resolves
    `spec` against the importing file's directory with no root check).
  - `ParsedTheta.imports` (`src/extension/reload-wiring.ts:66–72`) —
    "resolved + materialised at load time"; served until the next publish.
  - `src/runtime/subagent-child-hash-verify.ts:11–18` — the child-side
    fail-closed refusal that converts the staleness into a tamper-shaped
    error in subagent mode.
- **Observed at:** v0.287.0 (bc52da38), offline — deterministic vitest probe
  (deleted after confirmation; recipe below). The chokidar non-delivery for
  an unwatched directory is asserted at the arming input (the `roots`
  argument), not by real-timer observation.

## Summary

Discovery walks roots; imports resolve relative to the importing file with
`../` traversal expressly legal. The armed watcher covers the roots (in the
shipped code, the dirnames of found thetas) plus the two settings files. A
`.thetalib` living outside that set is load-bearing state (its exports are
materialised into the registered theta; its bytes are folded into the
subagent closure hash) with no change-detection channel. Every reload pass
DOES re-read it (`rediscover` re-runs the full compose), so the staleness
window is unbounded but arbitrary: the fresh bytes take effect whenever any
watched file happens to change, or at `/reload` — behaviour dependent on
unrelated edits.

## Reproduction

Offline, deterministic (harness as in bugs 0310/0311). Workspace:

```
<ws>/.pi/theta/uses.theta      ---\nmode: prompt\n---\nimport { shout } from "../lib/helpers.thetalib"\n@`hi ${shout("x")}`
<ws>/.pi/lib/helpers.thetalib  fn shout(s: string): string { s }
```

1. `session_start`: `/uses` registers (the `../` import is legal and
   resolves). Armed roots observed:
   `['<ws>/.pi/theta', '<ws>/.pi/settings.json', '<global>/settings.json']` —
   `<ws>/.pi/lib` absent.
2. Overwrite `helpers.thetalib` (body now returns `"CHANGED"`). No event is
   deliverable for it (not under any armed root). The registry entry for
   `uses` is the identical object — the old materialised import serves.
3. Control: emit one `change` event for the WATCHED `uses.theta` path,
   advance the fake clock 250 ms — the rebuild publishes a fresh entry (the
   full re-compose re-read the lib). Freshness flows only through
   watched-root events.

Subagent variant (not probed live, mechanically implied): the same layout
with `mode: subagent` and the file used as a `.theta` callable stores the
load-time closure hash over the OLD lib bytes on the frozen callable-set
entry; the spawned child re-hashes the FRESH bytes and refuses with
`theta/runtime/subagent-callable-hash-mismatch`
(`subagent-child-hash-verify.ts:11–13`) until some watched file changes.

## Expected behaviour

`registration-steps.md:26`: a `.thetalib` edit is a first-class hot-reload
input — "On a chokidar event for an existing theta or `.thetalib` file the
watcher debounces …, re-parses just the changed file plus every transitive
`.thetalib` importer reached through the import graph". Step 5
(`registration-steps.md:22`) maintains "a `.thetalib` import graph" for that
purpose. Nothing scopes this rule to libs that happen to sit inside a
discovery root, and `imports.md:19` explicitly blesses paths that do not.
Either the watcher must cover the import closure, or the spec must prescribe
a disposition for out-of-root libs (refuse at load, warn at load, or accept
and document the staleness); today it prescribes none.

## Actual behaviour / root cause

The watch set (`production-composition.ts:1416–1419`) is roots + settings
files only. The import graph the compose builds is not consulted for watch
scope anywhere. Libs under a watched root are covered incidentally (chokidar
watches directories recursively), which is why the gap surfaces only for
`../`-escaping imports — the exact form `imports.md:19` uses as its second
example.

## Why it matters

- Shared-library layouts are the reason `../` imports exist: one `lib/`
  beside several theta roots. Editing the shared lib is the highest-frequency
  edit in that layout, and it is precisely the edit hot reload misses.
- Prompt mode serves stale logic silently — the author's edit is dropped
  with zero diagnostics until an unrelated edit lands.
- Subagent mode converts the same edit into a hash-mismatch refusal whose
  registered meaning is closure divergence (a tamper/skew signal), burning
  author trust in a diagnostic that is doing its job against the wrong
  baseline.

## Non-goals

- The dirnames-vs-union watch-roots defect
  ([0310](./0310-watch-roots-derived-from-discovered-files-not-root-union.md)) — fixing it
  does not cover this input class.
- Import containment semantics (whether `../` SHOULD be legal) — imports.md
  is unambiguous that it is; this report takes it as given.
- The closure-hash mechanism itself (0267/0270/0271 lineage) — correct
  against its design; cited only as the subagent-mode observable.

## Fix

Not yet decided — needs a spec adjudication first. Options:

1. **Watch the import closure.** Add the resolved lib paths (or their parent
   directories) from the pass's import graph to the watch set; re-arm (or
   arm a supplementary watcher) when a reload pass changes the closure.
   Matches the hot-reload subsystem's existing language; cost: watcher
   re-arming machinery the single-armed-watcher invariant
   (`registration-steps.md:22`) must be reconciled with.
2. **Load-time warning for out-of-root imports.** A `theta/load/*` warning
   naming the lib as outside hot-reload coverage; cheap, honest, leaves the
   staleness.
3. **Spec-side acceptance.** A sentence in `registration-steps.md` scoping
   hot reload to in-root libs and documenting the `/reload` recovery;
   zero code, documents the trap.
   Any fix must keep the in-root lib path (covered today via recursive
   directory watching) regression-locked.

## Fix (0.315.0)

Parent adjudication (the §Fix options above left the disposition undecided):
**Option 1 — watch the resolved import closure.** The union watcher's arming
set gains the resolved `.thetalib` closure's parent directories from the pass's
import graph; the single union watcher is re-armed (teardown + fresh arm inside
the pass) when a reload pass changes that closure, so the single-armed-watcher
invariant (registration-steps.md step 5) is preserved by re-arm, not by a
supplementary watcher. Rationale on the record: options 2/3 leave the
highest-frequency edit in the exact `../` layout imports exist for silently
dropped, contradicting registration-steps.md:26's unscoped re-parse promise;
the in-root incidental coverage stays regression-locked.

- What shipped:
  - `src/extension/import-static-checks.ts` — `ThetaImportCheck.resolvedLibs`
    surfaces the transitive `.thetalib` walk's already-computed `walked`
    resolved-path set (a read, not a second walk), so the compose pass can see
    the closure.
  - `src/extension/production-composition.ts` — `runComposePass` unions the
    dirname of every `resolvedLibs` entry across the pass into `watchRoots`,
    EXCLUDING a closure dir already nested under the discovery-root base
    (`discoveryWatchRoots`) since chokidar watches recursively (no in-root
    re-arm churn); `composeExtensionInstance` wires the additive optional
    `currentWatchRoots` channel from each reload pass's `watchRoots`. Derived
    FROM the pass and unioned with whatever roots basis exists, so a future
    roots addition (bug 0339) composes additively.
  - `src/extension/hot-reload.ts` — after a published reload whose closure set
    differs from the armed set, re-arms the one watcher (teardown old
    subscription, arm fresh via the reused `armWatcherWithTerminalRecovery`,
    sharing the one `ReloadDebouncer` so bug 0311's in-flight batch is not
    lost). The re-arm is gated `!tornDown` (no re-arm after a teardown races
    the reload — PIC-57) and `!terminated` (a `terminalLatchWatcher` decorator
    latches the PIC-55 stopped-delivering signal, so a terminated watcher stays
    torn-down-until-`/reload`, never resurrected).
  - `docs/spec_topics/pi-integration-contract/registration-steps.md` — step 5
    (`#watch-scope-import-closure`): a same-commit sentence widens the watched
    set to the resolved `.thetalib` import closure's parent directories
    (including out-of-root ones) and states the single watcher is re-armed on a
    closure change, subject to the PIC-55 terminal posture.
- Gates: witness `tests/b0312-out-of-root-thetalib-watch-closure.test.ts` 8/8
  green (4 witness reds + 2 blocker cells flip green; 2 regression-lock cells
  green throughout); full default suite `npx vitest run` 491 files / 9652 tests
  green; `npm run typecheck` clean; `npm run lint` clean; live witness
  `tests/live/double-session-start-live.test.ts` 1/1 green under the shared
  live-lock (real step-5 arming/supersession path, PIC-57/68/69).
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`) — two blockers: F1 (re-arm
  ran with no `!tornDown` re-check after the rediscover await → stranded
  watcher) and F2 (re-arm could resurrect a PIC-55-terminated watcher); plus F3
  (comment over-claim), F5 (banned word). Round 2 (`bug-fix-reviewer`, deep —
  routed there because round 1 raised correctness/spec) — CLEAN, both blockers
  genuinely closed, no regression.
- Verification (`bug-fix-verifier`): SOLID. Witness reds on a temporary
  neutralisation (closure-widening + re-arm guard disabled) and greens on
  byte-exact restore (hash-object confirmed); full suite green; live path
  exercised; lint + typecheck clean.
- Residuals:
  1. Teardown-then-arm has a bounded event-loss gap (an edit racing between the
     old `unsub()` and the fresh watcher's readiness on a closure-changing
     publish) — inherent to the adjudicated single-armed-watcher design;
     arm-then-unsub would close it but momentarily holds two watchers, which
     the adjudication forbids. Recovery is `/reload` or a subsequent edit.
  2. An unresolvable out-of-root import (`../lib/missing.thetalib` absent at
     load) is not in the closure, so CREATING that file fires no reload
     (in-root creation stays covered incidentally). Consistent with "watch the
     RESOLVED closure"; recovery is `/reload`.
  3. During chokidar's async `close()` overlap after a re-arm, the prior
     arming's still-attached `error` listener could emit a spurious
     `watcher-terminated` note — sub-millisecond window on 0313's (untouched)
     surface; not addressable without touching that surface.
- Discharge notes appended: none (no sibling bug docs edited).
- Pinned dispositions / non-goals: `src/extension/watcher-recovery.ts` and
  `src/seams/pi-file-watcher.ts` (lane 0313's surface) were NOT touched — the
  re-arm threaded through the existing `armWatcherWithTerminalRecovery` entry
  point; the closure union composes additively with a future roots source
  (lane 0339). Cell 2's removal disposition is SHRINK (the re-arm drops a lib
  dir no longer in any theta's closure). Import containment semantics and the
  closure-hash mechanism (0267/0270/0271) are out of scope per §Non-goals.

## Provenance

Bug-hunt area `reload-lifecycle`, seed hypothesis 1 (watcher scope vs load
closure, lib arm). Probed offline at bc52da38; probe deleted after
confirmation.
