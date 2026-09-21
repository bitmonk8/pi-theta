---
id: PTQ-1162
title: createThetaExtension's returned closure is 967 LOC, bundling instance-state declaration, five registration steps, and three handler bodies in one function
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/factory.ts:456-1422
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/factory.ts#createThetaExtension
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# createThetaExtension's returned closure is 967 LOC, bundling instance-state declaration, five registration steps, and three handler bodies in one function

## Observation
`createThetaExtension` (src/extension/factory.ts:456-1422, 967 LOC) is in the
strong function band (FN_BANDS strong >= 200). It returns one closure
(`thetaExtension(pi)`) whose body declares the whole extension instance's
mutable state, runs the factory-body registration steps (flags, renderer,
entry channel, progress tool, three `pi.on` subscriptions), and defines four
nested functions in the same lexical scope: `registerFixtures` (805-868, 64
LOC), `drainGatedHandler` (882-908), `runComposeInstanceRegistration`
(923-1222, 300 LOC — itself strong band), and `handleSessionShutdown`
(1243-1411, 169 LOC — itself justify band). The file header (:1-28) states
the module's role: the H4a theta extension factory the `extensions/index.ts`
entry shim re-exports.

## Evidence
Step inventory (line ranges verified by direct read; the locals each phase
reads/writes are the seam cost):

| phase | line ranges | LOC | closure locals read / written |
|---|---|---|---|
| extension-instance state block + `tripwireGuardDeps` + placement wiring | 460-612 | ~153 | declares all bindings below |
| step-1 flag registrations (fatal arm) | 613-641 | ~29 | — |
| renderer registration (degrade arm) | 643-660 | ~18 | — |
| entry channel + `theta_progress` tool registration | 661-717 | ~57 | writes `inProcessTools`; reads `liveStatusBus`/`liveActiveInvocations`/`liveClock`/`liveResultChannel` lazily |
| `resources_discover` subscription | 718-727 | ~10 | — |
| `session_start` subscription + inline handler | 728-792 | ~65 | reads `liveRegistry`; writes `liveLocalNoteChannel` |
| `registerFixtures` | 805-868 | 64 | reads/writes `statusCommandRegistered`, `ownRegisteredNames`; reads `liveStatusBus` |
| `drainGatedHandler` | 882-908 | ~27 | reads `liveRegistry`, `resolveNoteChannel` |
| `runComposeInstanceRegistration` | 923-1222 | 300 | reads/writes `shutdownEventsObserved`, `composeStartsObserved`, `shutdownsAtLastComposeStart`, `liveStatusBus`, `liveRegistry`, `liveClock`, `liveResultChannel`, `liveActiveInvocations`, `liveForwardingSignals`, `supersededGenerations`, `hotReloadHandle` |
| `handleSessionShutdown` | 1243-1411 | 169 | reads/writes `shutdownEventsObserved`, `liveRegistry`, `liveClock`, `hotReloadHandle`, `liveActiveInvocations`, `liveForwardingSignals`, `liveStatusBus`, `supersededGenerations`, `liveResultChannel`, `placementBinding`, `placementRegistry` |
| `session_shutdown` subscription | 1413-1421 | 9 | — |

The shared closure state: 13 mutable `let` bindings (`hotReloadHandle`,
`liveRegistry`, `liveClock`, `liveLocalNoteChannel`, `liveActiveInvocations`,
`liveForwardingSignals`, `shutdownEventsObserved`, `composeStartsObserved`,
`shutdownsAtLastComposeStart`, `liveStatusBus`, `liveResultChannel`,
`statusCommandRegistered`, `inProcessTools`) plus 6 `const` containers
(`factoryNoteHealth`, `failFastTerminator`, `supersededGenerations`,
`ownRegisteredNames`, `placementRegistry`/`placementBinding`, `entryChannel`).
Excerpt (:456-467):
```ts
export function createThetaExtension(
  deps: ThetaExtensionDeps,
): (pi: ExtensionAPI) => void {
  return function thetaExtension(pi: ExtensionAPI): void {
    // The step-5 hot-reload teardown handle, armed by the `session_start`
    // compose-instance path and detached by `session_shutdown` — or, on a
    // shutdown-less repeat `session_start`, by that pass's
    // supersede-before-publish step (bug 0021, PIC-68). The slot is
    // single-occupancy, so the extension instance holds at most ONE armed
    // watcher (registration-steps.md#watcher-hot-reload-registration). Closed
    // over by both handlers (one extension instance, no module-level state).
    let hotReloadHandle: HotReloadHandle | undefined;
```

## Why this is a problem
Strong band (967 LOC >= 200): presumption of breakdown, not filed only on a
strong concrete reason. Reasons considered and why each fails:
- Single algorithm with shared local state: concrete and real — splitting
  would thread the 13 mutable bindings named above through every helper, i.e.
  a per-instance state object would have to be invented. Sufficient at
  justify; the strong band requires a strong supplement on top, and none is
  on record.
- Spec-cited invariant as one critical section: the PIC-67/PIC-68 pins
  (bugs 0018/0021/0022) bind the handlers' synchronous counter increments and
  `runComposeInstanceRegistration`'s one-await-one-recheck supersession
  discipline (its own decision-site comment, :941-1014) — both live inside
  the nested handler bodies, which any seam moves WHOLE; the comments' "no
  module-level state" pin forbids module-level statics, not per-instance
  state carried in an object. No clause pins the closure boundary itself.
- Measured cost: none cited anywhere in the body.
- Prior split reverted: `git log` for factory.ts shows no reverted extraction.
- Human ruling: quality/exemptions.json has no entry for this host (4 entries,
  none in extension/).
- Closed-enumeration dispatch / data-only / grammar production / generated:
  the body is sequential registrations plus handler definitions, not a
  dispatch table; types are ~4 LOC; no grammar; no generator marker.

## Suggested direction (non-binding, optional)
All hypotheses unproven; the human ratifies one. Seam A: `handleSessionShutdown`
(:1243-1411) -> `extension-instance-shutdown.ts` helper taking a per-instance
state object (hypothesis `ExtensionInstanceState` carrying the 13 mutable
bindings) - 169 LOC, 0 exported symbols moved today, 0 external importers,
cross-references back into the host: the state object plus
`bootstrapFailedDiagnostic`. Seam B: `runComposeInstanceRegistration`
(:923-1222, moved whole to preserve its one-await-one-recheck discipline) ->
`compose-instance-registration.ts` - 300 LOC, same state-object coupling plus
`registerFixtures`. Seam C: `registerFixtures` + `drainGatedHandler`
(:805-908) -> a fixture-registration helper - ~95 LOC, coupled to
`ownRegisteredNames`/`statusCommandRegistered`/`liveRegistry`.

## False-positive check
- Band: strong (967 LOC; FN_BANDS strong=200) — from the structural map, not
  recounted.
- Reasons-considered list: each of the five concrete-reason classes and the
  four strong supplements checked above, with the evidence that defeated each.
- Exemptions check: quality/exemptions.json read in full — no entry keys this
  host or file.
- Generated-code check: no `@generated`/`DO NOT EDIT` marker in :1-28 or the
  body.
- Spec-mirror check: registration-steps.md / session-shutdown-semantics.md
  specify the step ORDER the body implements; neither mandates one function —
  the ordered sequences live in the nested handlers, which move whole under
  every seam above.
- Prior-finding check: PTQ-0306 (fixed) named the then-anonymous shutdown
  callback (now `handleSessionShutdown`); no prior D9 breakdown was ever
  filed against this host or file (grep of quality/{intake,issues,resolved}
  for `d9_host: src/extension/factory.ts` — one hit, PTQ-0306, a naming
  finding).

## Triage
verdict: questionable — accounting verified but the prior-ruling claim is wrong: size-scan map reproduces createThetaExtension 456-1422 / 967 LOC / band strong (FN_BANDS strong=200) with nested registerFixtures 805-868 (64), runComposeInstanceRegistration 923-1222 (300, strong), handleSessionShutdown 1243-1411 (169, justify) exactly as rowed; every other inventory range (613-641 flags, 643-660 renderer, 661-717 entry-channel+progress tool, 718-727 resources_discover, 728-792 session_start, 882-908 drainGatedHandler, 1413-1421 shutdown subscription) and the 13 `let` bindings re-read true; exemptions.json has no factory.ts row, no @generated marker, 45 commits with no revert/extract, and registration-steps.md / session-shutdown-semantics.md pin "no module-level state", the factory-ordering pin and PIC-67/68's one-await-one-recheck inside the nested bodies — none pins the closure boundary; the rows are honest sequential phases but ALL share the 13 mutated locals (the filing's own concrete reason), and the filing's prior-finding check misstates PTQ-0306 as "a naming finding" — it is a D9 breakdown filing on this SAME host key (d9_class breakdown, d9_host factory.ts#createThetaExtension, band strong, same reasons-considered list) whose human ruling (2026-09-13) ratified Seam A only and explicitly declined Seam B "hoisting to a sibling module with the instance state threaded as a parameter object … the handler mutates closed-over state, so that is a refactor, not a move" — the exact ExtensionInstanceState threading all three seams here presuppose; not a duplicate (PTQ-0306's root cause is resolved, no keep-whole exemption was recorded, README allows re-filing the next seam) and sibling intake d9-03 targets the file-level host key, a distinct root cause; target shape needs a human ruling, likely human-keep-whole or human-defer given the prior ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map (manifest run) now gives createThetaExtension 457-1416 / 960 LOC / band strong (FN_BANDS strong=200; filing's 456-1422/967 is a uniform −1/−6 drift from same-wave commit 0fb4497e, which trimmed 7 lines inside the session_start handler) with nested registerFixtures 799-862 (64), runComposeInstanceRegistration 917-1216 (300, strong), handleSessionShutdown 1237-1405 (169, justify); all ten inventory rows and all 13 `let` bindings re-read by name at the drifted lines, and the shared-locals table reproduces (compose touches 11 of the mutable locals, shutdown ~9 plus supersededGenerations/placement*), so the ≥ 6-shared-locals concrete reason is real but per README only suffices below strong band; exemptions.json has no factory.ts key, no @generated marker, 46 commits with no revert/extract, and registration-steps.md / session-shutdown-semantics.md pin ordering, "factory-scoped"/extension-instance state and closure-captured handles but no single-function boundary; the filing's prior-finding check misstates PTQ-0306 as "a naming finding" — it is a resolved D9 breakdown on this same host key whose human ruling ratified Seam A only and explicitly declined the state-object threading ("a refactor, not a move") that all three seams here presuppose; not a duplicate (fixed, no keep-whole exemption recorded, README permits filing the next seam; siblings d9-01/d9-03 are distinct host keys); target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified a third time from scratch: size-scan map (manifest under $TEMP) gives createThetaExtension 457-1416 / 960 LOC / band strong (FN_BANDS strong=200; filing's 456-1422/967 is the +1/−6 drift from same-wave commit 0fb4497e: one import line added at :52, seven lines net removed inside the session_start handler at :753) with nested registerFixtures 799-862 (64, zone), runComposeInstanceRegistration 917-1216 (300, strong), handleSessionShutdown 1237-1405 (169, justify); all 13 `let` bindings re-read by name at :468-686 and a per-range identifier count shows compose touching 12 and shutdown 11 of the listed instance locals, so the inventory rows are honest sequential phases that nevertheless share one state cluster — the ≥ 6-shared-locals concrete reason is real and the filing itself concedes it, which per README:167-168 suffices only below strong band; exemptions.json has no factory.ts key (4 rows, 2 D8 / 2 D9, none in extension/), no @generated/DO NOT EDIT marker, 46 commits with no revert/extract/split/hoist, and registration-steps.md / session-shutdown-semantics.md pin step ORDER, the factory-ordering pin and PIC-68's per-instance resource ownership, none a single-function boundary; the filing's prior-finding check is wrong — PTQ-0306 is a resolved D9 breakdown (d9_class breakdown, same d9_host key, band strong) whose human ruling ratified Seam A only and explicitly refused the parameter-object hoist as "a refactor, not a move", which is the ExtensionInstanceState threading all three seams here presuppose; still not a duplicate (PTQ-0306 fixed, no keep-whole exemption recorded, README:198-200 permits filing the next seam; sibling d9-03 is the file-level host key, a distinct root cause); target shape needs a human ruling, and the prior ruling makes human-keep-whole or human-defer the likely outcome (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
