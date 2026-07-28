# Bug 0022 — The late-completing `session_start` compose tail performs registration work against the invalidated runtime; the PIC-67 zero-touch suppression covers only the watcher arming

- **Status:** open
- **Kind:** defect — the implementation violates a spec sentence. PIC-67
  (`session-shutdown-semantics.md#pic-67`, added by the bug-0018 fix) pins:
  "Zero guarded touches remain the requirement wherever the runtime can know
  of the teardown without touching", naming the arm-after-teardown race —
  a `session_shutdown` consumed while an asynchronous `session_start` compose
  is in flight — as the covered site. The factory CAN know (it consults
  `shutdownEventsObserved` in exactly this continuation) but consults it only
  immediately before arming the step-5 watcher — AFTER `registerFixtures` has
  already touched the invalidated `pi.getCommands` surface and AFTER the
  dead generation's `live*` resources were published. The stale throw's
  designed evidence (`theta/load/extension-bootstrap-failed` "through the
  System notes fallback chain", extension-bootstrap-and-per-theta.md
  `#getcommands-read-failure`) cannot deliver on an invalidated runtime
  (PIC-67 clause (c): no delivery attempt through an invalidated runtime) and
  in the shipped default export is not even wired — so the whole late tail
  fails silently, on the same "dies quietly" footing bug 0018 was filed for.
- **Affected** (at HEAD `28ce714d`, 0.28.0):
  - `runComposeInstanceRegistration` (`src/extension/factory.ts:491–546`) —
    the whole post-compose continuation: the `live*` publishes (`:507–516`),
    the `registerFixtures` call (`:517`), and the catch-arm fallback
    `registerFixtures(deps.fixtures)` (`:503`) all run BEFORE the PIC-67
    generation check (`:533`), which guards only `installHotReload` (`:537`).
  - `registerFixtures` (`src/extension/factory.ts:385`) — the collision-pass
    `pi.getCommands()` read, the tail's first guarded touch.
  - When the invalidation lands mid-compose rather than mid-continuation, the
    compose pass's own guarded reads are the touch surface:
    `buildRuntimeRoot`'s `ctx.cwd` read
    (`src/extension/production-composition.ts:299`), the settings-diagnostic
    emit (`:402` → `pi.sendMessage` via the note channel),
    `readThetaFlagPaths` → `pi.getFlag` (`:407`/`:1947`),
    `readPiOwnedCommands` → `pi.getCommands` (`:408`/`:1977`), and the lazy
    `ctx.modelRegistry` closures.
  - The production default export (`src/extension/factory.ts` `thetaExtension`)
    supplies no `emitDiagnostic`, so every `bootstrapFailedDiagnostic` the tail
    constructs is dropped by the `deps.emitDiagnostic?.()` optional chain.
- **Observed at:** `0.28.0`, mechanical — offline, deterministic; no live
  model. Witnessed by a widened copy of the bug-0018 Case C harness
  (`tests/hot-reload-stale-ctx-replacement.test.ts`) with the pre-suppression
  baseline removed.

## Summary

The bug-0018 fix closed the arm-after-teardown race for the **watcher**: when
a `session_shutdown` is consumed while the async `session_start` compose is in
flight, the factory suppresses the step-5 watcher arming zero-touch (the
PIC-67 generation check, `factory.ts:533`). The rest of the late-completing
continuation was deliberately left outside the fix and outside the regression
lock: Case C baselines `staleTouches` out AFTER the late arm with the comment
"the late `registerFixtures` stale reads are session_start work, a separate
arm of the same defect" (`tests/hot-reload-stale-ctx-replacement.test.ts:625–628`).

That residual arm is real. After the compose settles, the continuation —
running against a runtime the factory can already know is torn down —

1. publishes `liveRegistry` / `liveClock` / `liveActiveInvocations` /
   `liveForwardingSignals` for a generation whose teardown already ran and
   will never run again (the shutdown handler's lazy read saw `undefined` and
   no-oped), leaving a populated dead-generation registry with drain state
   never set;
2. calls `registerFixtures`, whose first action touches the invalidated
   `pi.getCommands` — the guarded stale throw is caught, converted to a
   `theta/load/extension-bootstrap-failed` diagnostic, and dropped (production
   wires no `emitDiagnostic`; a wired one could not deliver either — the
   System-notes chain rides the same invalidated runtime and PIC-67(c)
   forbids the attempt);
3. only then reaches the PIC-67 check and suppresses the arming.

When the invalidation instead lands mid-compose, the compose pass dies on its
next guarded read (`ctx.cwd`, `pi.getFlag`, `pi.getCommands`,
`pi.sendMessage`, or `ctx.modelRegistry`, depending on timing), the throw
funnels into `runComposeInstanceRegistration`'s catch arm — labelled with the
wrong capability, `pi.registerCommand` — and the fallback
`registerFixtures(deps.fixtures)` then performs one more guarded touch for a
fixture list that is empty in production. All of it silent.

## Reproduction

Offline, deterministic. Take the bug-0018 Case C harness
(`tests/hot-reload-stale-ctx-replacement.test.ts` — real
`createThetaExtension` + `composeExtensionInstance`, host-faithful stale
switch recording every guarded touch) and remove the post-arm baseline
(`b.harness.staleTouches.length = 0` at `:629`), observing from the
`releaseCompose()` point instead. Two interleavings:

**Variant 1 — Case C exact interleaving** (compose resolved before the gate;
`session_shutdown` → `invalidate()` → release):

- `staleTouches` for the whole late tail: `["pi.getCommands"]` — the
  `registerFixtures` collision-pass read at `factory.ts:385`.
- One `theta/load/extension-bootstrap-failed` diagnostic constructed
  (`details.capability: "pi.getCommands"`, `details.error` = the byte-exact
  host stale-ctx message) and dropped — `deps.emitDiagnostic` is undefined in
  the production default export.
- stderr: empty. Notes delivered post-invalidate: zero. Commands registered:
  zero (the throw precedes every `pi.registerCommand`).
- End state: `wiring.registry` still holds the composed theta (`greet`) with
  `readDrainState() === { drained: false }` — a populated dead-generation
  registry whose teardown already no-oped; `liveRegistry` et al. point at it.
- The watcher phase stays zero-touch (the 0018-fixed arm holds): a subsequent
  watcher event + debounce boundary adds nothing.

**Variant 2 — invalidation before the compose's guarded reads** (gate moved
ahead of `composeExtensionInstance`; models the shutdown landing at the
compose's first await):

- `staleTouches`: `["ctx.cwd", "pi.getCommands"]` — the compose dies on
  `buildRuntimeRoot`'s `ctx.cwd` read; the catch-arm fallback
  `registerFixtures(deps.fixtures)` adds the second touch.
- Two `extension-bootstrap-failed` diagnostics constructed and dropped; the
  first carries `details.capability: "pi.registerCommand"` although nothing
  reached `pi.registerCommand` — the compose-supplier catch labels every
  compose throw with that capability.
- stderr: empty. Notes: zero. Commands: zero. Wiring: never published.

No `system-note delivery failed:` cascade appears in either variant — the
0018 hardening (stale-dead channel, factory catch) holds. The defect is the
touches themselves, the silence, and the dead-generation state.

## Expected behaviour

- PIC-67 (`session-shutdown-semantics.md#pic-67`): "Zero guarded touches
  remain the requirement wherever the runtime can know of the teardown
  without touching: a `session_shutdown` consumed while an asynchronous
  `session_start` compose is still in flight … MUST suppress the arming of
  the step-5 watcher when the compose completes, without any probe touch and
  without a stderr line". The normative MUST names only the arming; the
  requirement sentence covers the whole continuation — the factory holds the
  same `shutdownEventsObserved` evidence before `registerFixtures` that it
  consults before `installHotReload`.
- PIC-57 (`#pic-57`) pins the watcher side only: "No watcher-driven registry
  rebuild may run against an invalidated extension runtime". No clause pins
  the `session_start` registration pass itself against an invalidated
  runtime.
- Registration-steps step 3 (`registration-steps.md#slash-handler-registration`)
  and the `pi.getCommands()` read-failure rule
  (`extension-bootstrap-and-per-theta.md#getcommands-read-failure`) prescribe
  the collision pass and its failure handling — swallow, drop the pass, emit
  one `extension-bootstrap-failed` "through the **System notes** fallback
  chain", "`/reload` is the recovery path" — presupposing a live runtime: on
  an invalidated one the chain is dead and PIC-67(c) forbids the delivery
  attempt, and no recovery path exists.
- **Gap:** apart from PIC-67's requirement sentence, no spec text prescribes
  what the `session_start` tail does when its runtime was invalidated
  mid-flight. The spec-consistent posture is the one PIC-67 already pins for
  the arming: knowing of the teardown, do nothing — zero guarded touches, no
  publish, no registration, no diagnostic attempt.

## Actual behaviour / root cause

The 0018 fix inserted the generation check at the last step of the
continuation (immediately before `installHotReload`, `factory.ts:533`) rather
than at the first (immediately after the compose settles, `factory.ts:500`).
Everything between — the four `live*` publishes, the full `registerFixtures`
pass, and on the catch arm the static-fixture fallback — executes against the
invalidated runtime the factory already has evidence for. The guarded touches
throw; the broad per-call catches convert the throws to bootstrap diagnostics;
the production default export drops them (`deps.emitDiagnostic` unwired); the
dead generation's registry and shared resources stay published in factory
scope with drain state never set. The same late tail also runs when the
consumed shutdown's runtime is *not yet* invalidated (the host invalidates
after all shutdown handlers settle): the touches then succeed and the tail
registers slash commands into the outgoing session for a generation whose
teardown already ran — registration work PIC-57's posture exists to prevent,
wasted at best.

## Why it matters

- A spec sentence is violated on a pinned race (PIC-67's zero-touch
  requirement), and the violation is structurally shielded from the
  regression suite: Case C must baseline the pre-suppression phase out to
  lock the fixed arm, so no test can witness the tail without first fixing
  the tail.
- The failure is total-silence: stale throws → swallowed → diagnostics
  constructed for a channel that is both dead (PIC-67(c)) and, in production,
  unwired. Bug 0018's "the reload machinery dies quietly" concern recurs one
  layer down, minus even the stderr evidence.
- The tail publishes and half-initialises a dead generation (populated
  registry, drain state unset, shared invocation/forwarding sinks) that no
  teardown will ever visit — inert at the pin, but exactly the
  state-without-owner shape the five-sub-step teardown contract exists to
  exclude, and live registration work when the invalidation has not yet
  landed.
- Diagnostic hygiene: the compose-supplier catch labels every compose throw
  `capability: "pi.registerCommand"`, misattributing (for example) a
  `ctx.cwd` stale read.

## Fix options and recommendation

1. **Extend the PIC-67 generation check to the whole post-compose
   continuation** (recommended). Evaluate
   `shutdownEventsObserved !== shutdownsAtComposeStart` immediately after
   `deps.composeInstance` settles — on the success arm before the `live*`
   publishes and `registerFixtures`, and on the catch arm before the
   static-fixture fallback — returning zero-touch on mismatch (no publish, no
   registration, no diagnostic, no stderr; the teardown ran — doing nothing
   is the PIC-57/PIC-67-correct posture, exactly as for the arming today).
   Tradeoffs: a legitimately-slow compose on a LIVE runtime is unaffected —
   the counter advances only when a `session_shutdown` was actually consumed,
   and a later legitimate `session_start` composes under its own snapshot.
   The shutdown-LESS mid-compose invalidation (bare `AgentSession.dispose()`,
   counter unchanged) stays on the existing reactive paths: the tail's
   swallowed `pi.getCommands` throw drops the pass, and the armed watcher
   quiesces via the PIC-67 entry probe at its first boundary — the designed
   posture for that case. Widen Case C by deleting its baseline so the lock
   witnesses the whole tail zero-touch (`staleTouches` empty from the
   shutdown on), and extend the PIC-67 wording's parenthetical to name the
   registration/publish suppression alongside the arming.
2. **Stale-probe-first continuation** — mirror `runReload`'s entry probe
   (`void ctx.cwd`) at continuation entry and quiesce on the recognised
   stale error. Covers the shutdown-less mid-compose case the generation
   check cannot see, but ADDS a guarded touch on the shutdown-observed race —
   contradicting PIC-67's zero-touch requirement and Case C's pinned
   expectation — and needs a spec amendment to sanction a probe at a site
   where the runtime can know without touching. Not preferred alone; could
   complement option 1 as a belt-and-braces arm gated to the
   counters-equal path, at the cost of one designed probe touch there.
3. **Adjacent, separable:** wire `deps.emitDiagnostic` in the production
   default export to the System-notes fallback chain, as
   extension-bootstrap-and-per-theta.md already prescribes for
   `extension-bootstrap-failed` — today every factory/`session_start`
   bootstrap diagnostic in production is dropped regardless of staleness.
   Distinct defect surface (live-runtime bootstrap failures are also silent);
   worth its own report if not folded in here. Same for the mislabelled
   compose-throw capability.

## Provenance

Residual recorded by the bug-0018 fix (commit `28ce714d`): the Case C
regression lock deliberately baselines the pre-suppression phase out —
`tests/hot-reload-stale-ctx-replacement.test.ts:625–628`, "Baseline AFTER the
late arm: only the watcher-driven phase is under test here (the late
`registerFixtures` stale reads are session_start work, a separate arm of the
same defect)" — and the 0018 report's root-cause section names the
arm-after-teardown race as "same defect class". This report substantiates
that recorded arm: origin bug-0018 fix Case C baseline comment plus the
reviewer residual record from the 0018 review rounds.
