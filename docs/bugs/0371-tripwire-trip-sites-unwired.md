# Bug 0371 — The session-swap fail-fast tripwire's trip half is unwired: `guardSessionSwapTripwire` / `runGuardedSlashHandler` have no production caller, so an armed tripwire never emits `theta/host/session-swap-instance-survived` and never fail-fast-terminates — dispatch against a survived instance returns the ordinary shutting-down note and `session_start` proceeds into a normal supersession pass

- **Status:** fixed (0.352.0).
- **Sev/Diff estimate:** S2/D1 — S2 because the guarded condition is dormant on
  every conformant Pi minor (the tripwire exists precisely to fail loudly if a
  future Pi minor violates the teardown-and-rebind lifecycle the
  `governed-by-rebind` resolution rests on), so no user sees a wrong value
  today; but when the premise breaks, the spec-mandated loud crash silently
  degrades to exactly the "continued operation past the trip" the spec
  forbids, and the violation is unobservable (the drained-registry note
  masquerades as normal drain-state behaviour). D1 because both trip sites and
  the compliant wrapper already exist — the fix is wiring
  `guardSessionSwapTripwire` into `drainGatedHandler` and the `session_start`
  handler entry plus a `FailFastTerminator` production adapter.
- **Kind:** defect — a normative MUST (two mandated read sites) implemented in
  a module with zero production callers; the same class as bug 0216
  (`classifyShutdownReason` unwired) and bug 0073
  (`cancelledBySessionShutdownDiagnostic` uncalled).
- **Related:**
  - 0216 (fixed 0.153.0) — the `session_shutdown` reason-classification seam
    had no production caller; identical "module exists, wiring absent" shape,
    sibling handler.
  - 0073 (fixed 0.130.0) — per-invocation clean-cancel note constructed by a
    function with no production caller.
  - 0023 (fixed 0.34.0) — the production composition omitted its bootstrap
    seams; this report is the tripwire-side sibling of that pattern.
  - [bug 0375](./0375-excised-degraded-arm-persists.md) (this campaign) — complementary half of
    the same V9r rework: there the retired degraded-state machinery still
    ships; here the machinery that replaced it is never wired. Both fixes
    touch the `drainGatedHandler` dispatch head — sequence the two, do not
    merge the reports.
- **Affected** (verified at 9474dfa8, v0.347.0):
  - `src/extension/session-swap-tripwire.ts:137` (`guardSessionSwapTripwire`)
    and `:159` (`runGuardedSlashHandler`) — the trip half. `rg` over `src/`
    and `extensions/` finds no caller of either outside the module itself;
    the only importer of the guard is `tests/session-swap-tripwire.test.ts`.
  - `src/extension/session-swap-tripwire.ts:116`
    (`armSessionSwapTripwireForReason`) — the arming half, wired at
    `src/extension/session-shutdown.ts:628`. Arming works; nothing ever reads
    the armed flag: `ThetaRegistry.readSessionSwapTornDown`
    (`src/extension/reload-wiring.ts:281`) has no production caller either.
  - `src/extension/factory.ts:631-655` (`drainGatedHandler`) — the actual
    registered slash handler: its first action is
    `resolveSlashDispatchWithReadFailover` (the `readDrainState` branch); no
    tripwire read precedes it.
  - `src/extension/factory.ts:536-556` — the `session_start` handler: latches
    ctx, then registers/composes; no tripwire read at entry.

## Summary

`session-only-degraded-state.md` §"Session-swap fail-fast tripwire" pins two
halves: **Arm.** (the `session_shutdown` handler sets `sessionSwapTornDown`
after a session-only teardown) and **Trip.** ("Every theta-registered slash
`handler` (at entry, before any dispatch or `readDrainState` branch) and the
`session_start` handler MUST read `sessionSwapTornDown`. If it is set … the
runtime emits exactly one `theta/host/session-swap-instance-survived` (E,
runtime) diagnostic via `console.error` … and then terminates the process on
the theta fail-fast path"; `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md:14`).
The implementation ships both halves as code, wires only the arming half, and
never calls the trip half. Acceptance criterion (2) on the same page ("A slash
`handler` (or `session_start`) invoked against an armed tripwire emits exactly
one `theta/host/session-swap-instance-survived` row and fail-fast-terminates",
`:18`) is satisfied only inside `tests/session-swap-tripwire.test.ts`, which
drives the guard directly rather than through any registered handler.

## Reproduction

Scratch probe (deleted; vitest, offline) — drive `createThetaExtension` with a
`composeInstance` returning a real `ThetaRegistry` publishing one theta
`/demo`:

1. Fire `session_start` → `/demo` registers via `drainGatedHandler`.
2. Fire `session_shutdown` with `reason: "new"` → full teardown runs and the
   tripwire arms: `registry.readSessionSwapTornDown()` returns
   `{ armed: true, reason: "new" }` (arming half works).
3. Dispatch the registered `/demo` handler.

Observed: zero `console.error` lines; the handler sends the ordinary
drain-state note
`{"customType":"theta-system-note","content":"theta /demo: extension shutting down","display":true,…}`
and returns normally. No `theta/host/session-swap-instance-survived`, no
termination.

4. Fire a second `session_start` on the same (armed) instance.

Observed: zero survived diagnostics; the handler runs the normal repeat-start
supersession pass (emits the `theta: repeat session_start without
session_shutdown…` note and re-registers).

## Expected behaviour

Per the **Trip.** clause (`session-only-degraded-state.md:14`), both step 3 and
step 4 above must emit exactly one
`theta/host/session-swap-instance-survived` with
`details: { event: { reason: "new" } }` via `console.error` and then terminate
the process; "The runtime MUST NOT attempt any degraded-mode dispatch,
recovery, or continued operation past the trip."

## Actual behaviour / root cause

`drainGatedHandler` (`src/extension/factory.ts:631`) goes straight to the
drain-state read; the `session_start` handler (`factory.ts:536`) goes straight
to ctx-latch + registration. `guardSessionSwapTripwire` and
`runGuardedSlashHandler` (`session-swap-tripwire.ts:137,159`) — plus the
production `FailFastTerminator` they need — were built for exactly these two
sites and never wired in. The V9r-T header comment in the module still
describes deliberately non-compliant stubs, but the stubs were filled in and
the wiring step never landed.

Quantification (dead-enforcement-sweep pass 1, same worktree, same sha): of
the 237 diagnostic codes registered across the four code-registry pages,
`theta/host/session-swap-instance-survived` is one of only two with no
reachable production emitter — the measurable 0086/0360 dead-code class,
otherwise extinct at this HEAD. That sweep independently confirmed the
asymmetry through a second probe against the real `createThetaExtension`
factory: `session-shutdown.ts:628` is the sole production write of the armed
flag, and `readSessionSwapTornDown` is read nowhere in production.

## Why it matters

The tripwire is the runtime enforcement of the `governed-by-rebind` premise
that retired the whole degraded-state branch. With the trip half dead, a
future Pi minor that redelivers dispatch to a survived instance produces the
precise silent continuation the excision traded away: dispatch after a
session-only teardown yields the drained-registry shutting-down note (which
looks like normal behaviour), a repeat `session_start` re-owns the slash names
against a stale instance, and the lifecycle violation surfaces nowhere. The
spec designed this to be a loud crash at the contradiction point.

## Non-goals

- The arming decision (`armSessionSwapTripwireForReason`) and the
  `ThetaRegistry` flag/reader are correct as shipped; no change needed there.
- The Pi-host-owned `/reload` command is correctly unguarded (clause (c-i));
  this report does not ask for it to be wrapped.

## Fix

Wrap the dispatch body of `drainGatedHandler` and the head of the
`session_start` handler in `runGuardedSlashHandler` /
`guardSessionSwapTripwire` with `{ registry: liveRegistry-or-wiring.registry,
sink: createProductionEmissionSink(), terminator }`, where `terminator` is a
production `FailFastTerminator` (`process.exit`-style let-crash). One wrinkle:
at slash-dispatch time the factory's handler closes over `wiring.registry`
(per-generation); the armed flag lives on the registry the shutdown drained,
which for the survived-instance case IS the live one (`liveRegistry` is kept
across shutdown — assignment at `factory.ts:893`, retention pinned by the
teardown comment at `factory.ts:1069-1070`), so the guard should read the
factory-scoped `liveRegistry` rather than the per-handler registry to also
cover a rebind-pass `session_start`. Acceptance fixture: the spec page's
criterion (2) driven through a REGISTERED handler, not the guard directly.
Sequencing: [bug 0375](./0375-excised-degraded-arm-persists.md)'s arm-(c) removal also edits the
`drainGatedHandler` dispatch head — land the two fixes in sequence, not as one
merged change.

## Provenance

Found by tracing every exported member of `session-swap-tripwire.ts` to its
callers (`rg` over `src/` + `extensions/`), then witnessing the arming/trip
asymmetry with an offline factory-level probe (fake `pi`, real
`ThetaRegistry`, real `runSessionShutdown` path). Probe deleted after
confirmation.

## Fix (0.352.0)

- What shipped:
  - `src/extension/session-swap-tripwire.ts` — added the production
    `createProductionFailFastTerminator()` (`process.exit(1)`, the NFR-2.1
    `Environment.FailFast`-equivalent let-crash) the §Fix names as the
    `FailFastTerminator` adapter; removed the module header's stale
    already-filled-stub narrative (WHY-not-history house rule).
  - `src/extension/factory.ts` — wired the trip half at both mandated read
    sites: `guardSessionSwapTripwire` at the `session_start` handler head
    (before the ctx-latch, gated on `liveRegistry !== undefined`) and
    `runGuardedSlashHandler` wrapping the `drainGatedHandler` dispatch body
    (before the `readDrainState` branch), each with
    `{ registry, sink: createProductionEmissionSink(), terminator }` where
    the guard reads the factory-scoped `liveRegistry` (kept across a
    session-only teardown, so a survived instance's armed flag is visible to
    both a post-teardown slash dispatch and a rebind-pass `session_start`);
    added the injectable `terminator?: FailFastTerminator` seam on
    `ThetaExtensionDeps` (production default via
    `deps.terminator ?? createProductionFailFastTerminator()`; the default
    export supplies none, so production gets the real adapter).
- Gates:
  - Witness `tests/b0371-tripwire-trip-sites-wired.test.ts` (offline, 3 cells
    through the REAL `createThetaExtension` registered handler + rebind
    `session_start`): RED before (cells 1&2 fail
    `.rejects.toThrow(FailFastSignal)` / `survivedRows().toHaveLength(1)` — the
    §Actual-behaviour symptom), GREEN after; revert-proof (verifier neutralised
    only the two guard sites → RED → byte-exact restoration → GREEN).
  - Full default suite: 531 files / 10023 tests; every file green in isolation
    (6 discovery/tools/invoke files timed out only under ~16-lane parallel
    load — each passes isolated with `--test-timeout=60000`, none reference the
    tripwire/factory-guard surface; classified load noise per LANE machine-load
    caveat).
  - Typecheck `tsc -p tsconfig.json --noEmit` clean; lint `eslint src/**/*.ts`
    clean.
  - Live `tests/live/double-session-start-live.test.ts` GREEN (21.3 s, one real
    turn, under the shared live lock): both live `session_start` binds and the
    live `/greetlive` dispatch run the now-installed guard DORMANT (unarmed
    registry) with unchanged re-ownership / no-shutting-down-note observables.
- Review: 1 round — `bug-fix-reviewer` CLEAN (no correctness/fidelity/spec/
  house-rule/test findings; two prose residuals R1 stale header + R2 banned
  token `just`). One comment-only `bug-fix-fixer-light` round cleared both;
  post-polish confirmation via gate-diff (every hunk comment-only, gates green)
  — confirmation review round skipped per charter.
- Verification: `bug-fix-verifier` SOLID — witness revert-proof (RED→GREEN,
  identical git-diff content hashes before/after restoration); full suite green
  (parallel-load timeouts all pass isolated, off-surface); lint + typecheck
  clean; live discharged by the orchestrator (adjacent dormant-guard cell green
  + no-live-owed rationale: the armed-trip path is structurally unreachable
  under the pinned `governed-by-rebind` Pi-SDK, so no live input class changes
  registration/drive outcomes).
- Residuals: none. (The full-suite parallel timeouts are load noise, not a
  residual; each is green isolated.)
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the arming half
  (`armSessionSwapTripwireForReason`, `ThetaRegistry.armSessionSwapTornDown` /
  `readSessionSwapTornDown`) is unchanged; the Pi-owned `/reload` stays
  unguarded (clause (c-i) — only theta-registered handlers + `session_start`
  are wrapped); no new diagnostic-registry row
  (`theta/host/session-swap-instance-survived` pre-exists); no spec-doc edit.
  MERGE NOTE for the rebaser: [bug 0375] also edits the `drainGatedHandler`
  dispatch head — this fix wraps the whole body in `runGuardedSlashHandler`;
  sequence, do not merge the two hunks blindly.
