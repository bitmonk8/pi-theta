---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: probeHostLoopSurfaces's hand-listed pi/ctx member checklist and createProductionHostLoopDispatch's actual host.pi/host.ctx call sites are two independently maintained copies of the same required surface
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-host-loop-dispatch.ts:183-226
  - src/extension/production-host-loop-dispatch.ts:377-618
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel           # D4 only: clone | drift | parallel
wave: qw20260916144930
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-16
---

# probeHostLoopSurfaces's hand-listed pi/ctx member checklist and createProductionHostLoopDispatch's actual host.pi/host.ctx call sites are two independently maintained copies of the same required surface

## Observation
`probeHostLoopSurfaces` (production-host-loop-dispatch.ts:183-226) is a runtime `typeof` capability probe: it hand-lists 7 `host.pi` method names in a local `piFns` array plus 3 `host.ctx` paths (`isIdle`, `modelRegistry.find`, `sessionManager.getEntries`), and returns `false` the moment one is missing. `createProductionHostLoopDispatch` (377-605) and its helper `confirmIdle` (611-618) are the code this probe exists to gate: their bodies invoke `host.pi`/`host.ctx` members directly, as ordinary property-access statements, with no reference to `piFns` or to the probe itself. The probe's parameter type is `{ readonly pi: unknown; readonly ctx: unknown }`, so the `HostLoopPi`/`HostLoopCtx` structural interfaces the dispatch code is typed against give the probe's string list no compiler help — the two enumerations of "which host surface host-loop dispatch needs" are maintained by hand, in the same file, with nothing tying them together.

## Evidence
The probe's checklist (production-host-loop-dispatch.ts:192-224):
```ts
  const piFns = [
    "registerProvider",
    "unregisterProvider",
    "setActiveTools",
    "getActiveTools",
    "setModel",
    "sendUserMessage",
    "on",
  ];
  for (const name of piFns) {
    if (typeof pi[name] !== "function") {
      return false;
    }
  }
```
followed by three more `typeof`-checks not shown here for length: `ctx["isIdle"]`, `ctx["modelRegistry"]["find"]`, `ctx["sessionManager"]["getEntries"]` (lines 206, 213, 221).

Every one of those 10 members is independently, literally invoked inside `createProductionHostLoopDispatch`/`confirmIdle` — `grep -n 'host\.(pi|ctx)\.[a-zA-Z]+' production-host-loop-dispatch.ts` returns 14 call sites covering exactly these 10 distinct members, no more, no fewer:

```
396:  host.pi.on("agent_settled", () => {
418:    const originalModel = host.ctx.model;              // data property, not `typeof`-probed — see False-positive check
467:        host.pi.registerProvider(providerName, {
493:          host.pi.unregisterProvider(providerName);
498:        const bridge = host.ctx.modelRegistry.find(providerName, BRIDGE_MODEL_ID);
505:        ambientTools = host.pi.getActiveTools();
506:        host.pi.setActiveTools([request.toolName]);
507:        await host.pi.setModel(bridge);
511:        const entriesBefore = host.ctx.sessionManager.getEntries().length;
519:          host.pi.sendUserMessage(
525:        const entries = host.ctx.sessionManager.getEntries();
550:          host.pi.setActiveTools(ambientTools);
553:          await host.pi.setModel(originalModel);
613:  for (let i = 0; i... !host.ctx.isIdle() ...) {
```

No clone-map group id: the map returned no groups for this file; the two sides (a string array plus a generic `typeof` loop, versus ordinary property-access statements scattered across 230 lines) are not textually clone-shaped, which is exactly why a mechanical scanner cannot pair them.

## Why this is a problem
This is load-bearing, not incidental: `probeHostLoopSurfaces` is the sole gate for `dispatchLadderProbe.hostLoopAvailable` (production-composition.ts:1113,1120), which decides both (a) at LOAD time whether a theta whose code calls an extension tool registers at all (`checkExtensionToolReachability`'s rung-3 fail-closed refusal) and (b) at RUNTIME whether `createProductionHostLoopDispatch` is even constructed (production-composition.ts:1127-1129). The probe's own doc comment states the contract: "Returns `false` on the first missing surface (fail-closed)." Counted: today the checklist covers 10 of the 10 members the dispatch code actually invokes — full, correct coverage, entirely by hand, with no shared list enforcing it. If a future change adds a call to a new `host.pi`/`host.ctx` member inside `createProductionHostLoopDispatch` or `confirmIdle` without adding it to `piFns`/the ctx checks, the probe keeps answering `true` for a host that lacks it: the rung is recorded available, registration proceeds, and the first dispatch throws on the missing member — silently inverting the documented fail-closed guarantee. The opposite slip (checking a member the dispatch code no longer calls) would instead needlessly refuse hosts that could dispatch. Either direction is a real, production-observable regression of a pair that is in sync today only because both sides were edited together by hand.

## Suggested direction (non-binding, optional)
Shared source of truth (hypothesis): one ordered list of the required `pi`/`ctx` member paths, consulted by `probeHostLoopSurfaces`'s `typeof` loop, so the probe's checklist cannot silently fall behind the dispatch code's own calls. No claim is made about how the list should be authored or whether the `HostLoopPi`/`HostLoopCtx` types should generate it.

## False-positive check
Re-ran `grep -n 'host\.(pi|ctx)\.[a-zA-Z]+' src/extension/production-host-loop-dispatch.ts` immediately before filing: 14 hits, 10 distinct members, every one present in `piFns`/the ctx checks, and no checked member left unused. `host.ctx.model` (line 418) is the sole non-matching hit — a data property (`Model<Api> | undefined`), never `typeof`-probed, and its absence is already handled by the `if (originalModel !== undefined)` guard in the restore arm (line 552), so it is correctly outside this probe's contract, not a missed 11th case. Confirmed both sides are live: the probe's sole call site is `production-composition.ts:1113`; `createProductionHostLoopDispatch`'s sole call site is `production-composition.ts:1128`. Checked `tests/production-host-loop-dispatch.test.ts`: it drops each of the 7 `pi` members and the `ctx` sub-paths one at a time from its OWN `fullPi()`/`fullCtx()` fixtures and asserts the probe returns `false` — that pins "the probe fails closed when its own test fixture is missing a member," not "the probe's list matches what the dispatch code actually calls," so it would not catch the drift described here. Searched the already-filed/rejected lists for "host-loop", "probeHostLoopSurfaces", "dispatch ladder", "HostLoopPi": no match. Not tests/, not generated, not a spec-repeated normative vector (PIC-64 states the rung's availability condition once; the duplication is between two CODE enumerations of it, not two spec citations).

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: questionable — accounting verified: re-ran `grep -nE 'host\.(pi|ctx)\.[a-zA-Z]+'` myself (14 hits, matches candidate's table) and confirmed the 10 distinct members actually used reduce, after correctly excluding the unprobed data property `host.ctx.model` (:418, guarded at :552), to exactly the probe's 7 `piFns` + 3 ctx checks; both sides are sole-call-site live (production-composition.ts:1113/1128) and `clone-scan.mjs map` returns zero groups for the file, so the pairing is real parallel duplication with no mechanical detector; per d4_class:parallel this is never confirmed — a shared source of truth is a design decision for a human ruling (triage: claude-opus-5)
