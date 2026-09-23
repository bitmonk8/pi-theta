---
id: PTQ-1439
title: composeExtensionInstance remains 279 LOC (strong band) after the PTQ-1160 fix extracted only the load-note sink
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/production-composition.ts:2175-2453
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#composeExtensionInstance
d9_band: strong
wave: qw20260923023517
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# composeExtensionInstance remains 279 LOC (strong band) after the PTQ-1160 fix extracted only the load-note sink

## Observation
`composeExtensionInstance` (src/extension/production-composition.ts:2175-2453)
composes one extension instance: constructs the runtime root and
instance-scoped registries, dials the RFC-0012 §3 result channel, runs the
initial `runComposePass`, and returns the wiring with the `installHotReload`
closure. The structural map gives it 279 LOC, band strong (FN strong threshold
200), exported, 1/25 importers. PTQ-1160 (347 LOC, phase inventory) was
confirmed and fixed by commit 501d782b, which extracted `makeLoadNoteSink`
(now 2456-2523, 68 LOC); the residual is still 79 LOC over the strong bar.
142 of the 279 lines are comment lines (~137 code lines — disclosed).

## Evidence
Residual phase inventory (re-read at HEAD):

| phase | line ranges | LOC | reads / writes |
|---|---|---|---|
| toast + system-note channel + load sink handle | 2219-2240 | 22 | ctx, pi, rendererGate, entryChannel → emitToast, channel, loadSink; forward-declares `let resultChannel` |
| runtime root + instance registries (root, activeInvocations, forwardingSignals) | 2241-2260 | 20 | ctx, overrides → 3 construct-once locals |
| status sinks + run-card TUI probe | 2261-2284 | 24 | ctx, runCardView only → statusSinks (no other local read) |
| status bus + latch + emitErr7 alias | 2285-2296 | 12 | root.clock, statusSinks, latchStatusBus |
| control plane + result-channel dial | 2298-2333 | 36 | overrides, root.clock, activeInvocations → instanceControlPlane, resultChannel |
| initial runComposePass call (16 args) | 2334-2351 | 18 | 14 prior locals/params |
| watch roots + registry seeding | 2353-2381 | 29 | initial, ctx, root → settingsPaths, roots, latestWatchRoots, registry |
| return wiring incl. installHotReload closure | 2382-2453 | 72 | closure captures ≥14 locals (pi, ctx, root, emitErr7, activeInvocations, forwardingSignals, ownRegisteredNames, overrides, rendererGate, entryChannel, statusBus, inProcessTools, instanceControlPlane, resultChannel, registry, roots, latestWatchRoots) |

Excerpt (result-channel dial, 2320-2333, low fan-in — reads only overrides,
launch, root.clock, activeInvocations):
```ts
  resultChannel =
    overrides?.subagentResultChannel ??
    (launch?.channel !== undefined
      ? connectResultChannel({
          client: createProductionChannelClient(),
          clock: root.clock,
          port: launch.channel.port,
          token: launch.channel.token,
          nonce: launch.nonce,
          onDead: (): void => {
            abortInvocationsOnResultChannelDeath(activeInvocations.snapshot());
          },
        })
      : undefined);
```

## Why this is a problem
Strong band: presumption of breakdown, a strong concrete reason required.
Reasons considered and defeated: (1) single algorithm with ≥6 shared locals —
holds for the return-wiring closure (≥14 captures, kept in the host by every
prior inventory) but not for the two construction phases above whose fan-in is
2-4 locals each (run-card probe: ctx + runCardView; channel dial: overrides,
launch, root.clock, activeInvocations); (2) spec-cited critical section — the
Decision 6 B1/B2 and EXST-2 construct-once comments pin instance identity
(construct once, share the same instance), which an extracted constructor
called once from the same position preserves — the PTQ-1160 triage record
already ruled these pin identity, not intra-function placement; (3) generated
code — 0 markers; (4) exemption — no key for this file or function in
quality/exemptions.json; (5) prior split reverted — none; the PTQ-1160 fix
(501d782b) landed and stuck but extracted only the load-note sink of the
filed inventory. No open or intake finding carries this d9_host since
PTQ-1160 moved to resolved (grep quality/issues + quality/intake → 0 hits).

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: result-channel dial (2298-2333) →
`dialParentResultChannel(overrides, launch, clock, onDead)` (hypothesis) —
36 LOC, 0 exported symbols moved, 0/0 external importers, returns the client.
Seam B: run-card TUI probe (2261-2284) → `wireRunCardSink(ctx, runCardView)`
(hypothesis) — 24 LOC, 0 exported symbols, 0/0 importers, returns the sink
list. None identified yet for the wiring closure (its ≥14 captures are the
recorded keep-in-host reason).

## False-positive check
Band: strong per the authoritative map (279 LOC ≥ 200); comment density
(142/279) disclosed above. Reasons-considered list with defeating evidence per
reason. Exemptions check: quality/exemptions.json has four keys, none for this
host. Generated-code check: 0 `@generated`/`DO NOT EDIT` hits in 2175-2453.
Spec-mirror check: no switch/if-chain mirroring a spec table; the construct-once
citations pin identity, not placement. Duplicate check: PTQ-1160 is status
fixed; no `d9_host: ...#composeExtensionInstance` row remains in
quality/issues or quality/intake; residual-after-fix filings are established
practice (PTQ-1284, PTQ-1287, PTQ-1288, PTQ-1290). Every cited range re-read
at HEAD immediately before filing.

## Triage
verdict: questionable — accounting verified: `size-scan.mjs map --files` reproduces `composeExtensionInstance — 2175-2453 — 279 LOC — band strong` (FN strong ≥ 200) with `makeLoadNoteSink — 2456-2523 — 68 LOC` as the sole extraction landed by 501d782b (471+/347−, PTQ-1160 now status fixed/confirmed); quality/exemptions.json's four keys carry no production-composition or composeExtensionInstance entry; the excerpt is byte-identical at 2320-2333; 142 comment lines and 0 `@generated`/`DO NOT EDIT` markers in 2175-2453 reproduce exactly; the inventory's two low-coupling rows hold at the code — the run-card probe (2278-2284) reads only `ctx` and `runCardView` and writes `statusSinks` (`root.clock` first enters at the bus on 2285), and the result-channel dial (2298-2333) reads only `overrides`, `launch` (= `instanceControlPlane.launch`), `root.clock`, `activeInvocations` — so they share no locals with each other, while the return-wiring closure (2382-2453) captures ≥ 14 locals and is conceded keep-whole; no overlooked reason: no spec-table switch, no data-only body, no reverted split (the 501d782b extraction stuck), and the Decision 6 B1/B2 + EXST-2 construct-once comments pin identity not intra-function placement (PTQ-1160 triage ruled the same three times); not a duplicate — PTQ-1160 is resolved, quality/issues holds no `#composeExtensionInstance` d9_host (PTQ-1312 is a D7 harness-clone filing that merely calls this function), and residual-after-fix filings follow PTQ-1284/1287/1288/1290; the target shape (Seam A/B or another cut) is a design decision for the human's ruling — never confirmed for a D9 breakdown (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
