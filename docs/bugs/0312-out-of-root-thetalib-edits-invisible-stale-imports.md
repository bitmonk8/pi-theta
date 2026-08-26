# Bug 0312 — A `.thetalib` imported via a parent-relative path (`../lib/x.thetalib`) resolves outside every discovery root and is therefore outside the armed watch set: editing it fires no reload, and the importing theta keeps dispatching the stale materialised imports — silently in prompt mode, and as a drive-time `subagent-callable-hash-mismatch` refusal for a subagent callable hashed over the old bytes

- **Status:** open.
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

## Provenance

Bug-hunt area `reload-lifecycle`, seed hypothesis 1 (watcher scope vs load
closure, lib arm). Probed offline at bc52da38; probe deleted after
confirmation.
