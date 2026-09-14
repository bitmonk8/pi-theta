---
id: PTQ-0306
title: createThetaExtension's session_shutdown teardown stays a 159-line anonymous callback while its session_start sibling was named and extracted
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/factory.ts:445-1335
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/factory.ts#createThetaExtension # D9 breakdown only: the exemption key, <path> or <path>#<function>
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260913183958
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-13
---

# createThetaExtension's session_shutdown teardown stays a 159-line anonymous callback while its session_start sibling was named and extracted

## Observation
`factory.ts`'s header states its role: "H4a — the theta extension factory … The factory establishes the extension by side-effect registration calls on the injected `pi: ExtensionAPI` handle." `createThetaExtension` (445-1335, 891 LOC, function band strong) declares roughly seventeen per-instance mutable locals (`hotReloadHandle`, `liveRegistry`, `liveClock`, `liveLocalNoteChannel`, `factoryNoteHealth`, `failFastTerminator`, `liveActiveInvocations`, `liveForwardingSignals`, `shutdownEventsObserved`, `composeStartsObserved`, `shutdownsAtLastComposeStart`, `supersededGenerations`, `ownRegisteredNames`, `liveStatusBus`, `statusCommandRegistered`, plus the `resolveNoteChannel`/`tripwireGuardDeps` closures) and then installs three `pi.on` subscriptions. Two of the three substantial handler bodies are already named nested functions the structural map itself lists as separate rows: `registerFixtures` (746-809, 64 LOC) and `runComposeInstanceRegistration` (864-1154, 291 LOC), both invoked from the `session_start` handler. The third, `session_shutdown` (1174-1332, ~159 LOC), is an anonymous arrow function passed directly to `pi.on("session_shutdown", …)` — it has no name, so it does not appear as its own row in the structural map at all; its LOC folds silently into `createThetaExtension`'s own total.

## Evidence
Distinct-concern inventory for `createThetaExtension`'s own body (excluding the two already-named, separately-dispositioned nested functions):

| concern | members | line range | LOC |
|---|---|---|---|
| instance state & host-capability bootstrap | ~17 `let`/`const` state locals, `pi.registerFlag`/`registerMessageRenderer`/`registerTool`, `resources_discover` subscription | 448-673 | 226 |
| `session_start` dispatch routing | trip-wire guard call, ctx latch, local note-channel construction, delegate to `runComposeInstanceRegistration`/`registerFixtures` | 675-733 | 59 |
| `session_shutdown` merge-and-teardown (unnamed) | inline five-sub-step teardown: merge superseded generations, build `SessionShutdownDeps`, clear live slots, call `runSessionShutdown` | 1174-1332 | 159 |

`src/extension/factory.ts:445-448` (the closure's opening, "one extension instance, no module-level state"):
```ts
export function createThetaExtension(
  deps: ThetaExtensionDeps,
): (pi: ExtensionAPI) => void {
  return function thetaExtension(pi: ExtensionAPI): void {
```

`src/extension/factory.ts:746-749` (the `session_start` sibling handler's substantial body IS named):
```ts
    function registerFixtures(
      fixtures: readonly ThetaFixture[],
      registry?: ThetaRegistry,
    ): void {
```

`src/extension/factory.ts:1174-1181` (the `session_shutdown` handler's comparable-sized body is NOT named — an inline arrow passed straight to `pi.on`):
```ts
      pi.on("session_shutdown", (event) => {
        // Bug 0018 (PIC-67), arming check subsumed by bug 0022's
        // compose-settle gate: record the delivery before anything can throw
        // or short-circuit, so an in-flight `session_start` compose observes
        // it at its compose-settle boundary even when the lazy reads below
        // no-op this teardown.
        shutdownEventsObserved += 1;
        try {
```

## Why this is a problem
Function band strong (891 LOC, threshold 200) — presumption of breakdown requires a strong concrete reason. Reasons considered and why each fails:
- Single algorithm with shared local state: concrete (the ~17 locals named above satisfy "6 or more"), which is JUSTIFY-sufficient on its own but not STRONG-sufficient. The extra the strong band requires — a spec-cited invariant enforcing one ordered step sequence a seam would interleave — is defeated by the file's own precedent: `registerFixtures` and `runComposeInstanceRegistration` already read/write this exact closure state from NAMED nested-function scope (746-809, 864-1154), proving a name boundary neither loses access to the shared state nor introduces an ordering hazard. `session_start` and `session_shutdown` additionally fire on mutually exclusive Pi lifecycle events — never re-entrant with each other — so naming the `session_shutdown` body cannot interleave anything the two handlers do not already keep apart.
- Spec-cited ordered critical section: real and cited (PIC-67/PIC-68/PIC-57, "one-await-one-recheck discipline") for `runComposeInstanceRegistration` specifically, which is why that nested function is not part of this finding. No comparable citation ties the bootstrap block, the `session_start` preamble, and the `session_shutdown` body together as one ordered sequence spanning `createThetaExtension` as a whole.
- Closed-enumeration dispatch: the three `pi.on` subscriptions are a closed set (registration-steps.md steps 1/3/4), but the "arms each short" clause fails — the arms are 7 (`resources_discover`), 59 (`session_start` preamble), and 159 (`session_shutdown`) LOC, the last already past the zone threshold on its own.
- Data-only module/type family, one grammar production family, generated code: none apply.
- No measured-cost citation; `git log --oneline --follow -- src/extension/factory.ts | grep -i "revert\|split\|extract"` returns no hits (35 commits total, none matching) — no prior split was reverted. `quality/exemptions.json` carries no entry for this host.

## Suggested direction (non-binding, optional)
Seam A: name the `session_shutdown` handler body (1174-1332, ~159 LOC) as its own nested function beside its siblings -> hypothesis `function handleSessionShutdown(event): Promise<void> | undefined` in the same closure scope - 0 exported symbols moved, 0 external importers (src/tests), cross-references back into host: reads/writes the same instance-state locals `registerFixtures`/`runComposeInstanceRegistration` already close over from named scope.
Seam B: once named, thread the instance-state locals as one parameter object and hoist the handler to a sibling module (mirroring the already-separate `session-shutdown.ts` it calls into) -> hypothesis `factory-session-shutdown-handler.ts` - cross-references: the same locals, now passed explicitly instead of closed over.
Both are unproven; a human ratifies the actual split.

## False-positive check
Band: strong (function LOC 891, threshold 200). Reasons-considered: listed above with the evidence that defeated each (the file's own registerFixtures/runComposeInstanceRegistration precedent, the mutually-exclusive-event argument, the unequal arm-length check, no generated-code marker, no measured-cost or prior-split-revert commit). Exemptions check: `quality/exemptions.json` grepped for `factory.ts` — no entry. Generated-code check: grepped the file for `@generated`/`DO NOT EDIT`/`autogenerated` — no hits. Spec-mirror check: registration-steps.md's three factory-time `pi.on` steps (1/3/4) are a closed enumeration, but the arm-length requirement of that reason class fails for the 159-LOC `session_shutdown` arm, which is why the closed-enumeration reason is listed as considered-and-failed rather than accepted.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: size-scan map confirms createThetaExtension at 891 LOC/strong with registerFixtures (64 LOC/zone) and runComposeInstanceRegistration (291 LOC/strong) already named exactly as claimed; the ~17 shared locals, the three pi.on arm sizes (7/59/159 LOC), and all three verbatim excerpts (445-448, 746-749, 1174-1181) reproduce at the cited lines; PIC-67/PIC-68/PIC-57 verifiably anchor runComposeInstanceRegistration's own one-await-one-recheck discipline specifically (corroborated by this same wave's shard notes, which keep that function whole for exactly that reason while filing this one), not the whole closure; exemptions.json has no entry for this host, the file carries no generated-code marker, and git log (35 commits, none matching revert|split|extract) shows no reverted split — but per the D9 rule the target shape is a human ratification, never a triage confirm (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-13): Seam A only - a FUNCTION seam inside factory.ts. Name the session_shutdown handler body (factory.ts:1174-1332, ~159 LOC) as a nested function handleSessionShutdown beside its named siblings registerFixtures and runComposeInstanceRegistration, in the same closure scope, and pass it to pi.on("session_shutdown", ...) exactly where the anonymous callback sits today; closure semantics unchanged (it keeps reading and writing the same instance-state locals); body moved verbatim, doc comment above the new function stating its role; no other edits. Seam B (hoisting to a sibling module with the instance state threaded as a parameter object) is NOT ratified: the handler mutates closed-over state, so that is a refactor, not a move.
