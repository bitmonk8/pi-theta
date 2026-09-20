---
id: pending
title: ProductionThetaProducer.bindPromptConversation assembles eight binding phases in one 257-LOC method
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:2156-2412
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.bindPromptConversation
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# ProductionThetaProducer.bindPromptConversation assembles eight binding phases in one 257-LOC method

## Observation
`ProductionThetaProducer.bindPromptConversation` (src/extension/production-theta-producer.ts:2156-2412) is 257 LOC — strong band (threshold 200). It builds the prompt-mode conversation binding: abort-controller derivation and forwarding capture, session read surfaces, invocation ticket/bus/checkpoint wiring, a nine-closure `EffectfulStatementHostDeps` literal, the `ExecuteBodyDeps` literal, forwarding-sink publication, and the returned binding with its surface projection.

## Evidence
Step inventory:

| phase | lines | LOC | locals written (read later by) |
|---|---|---|---|
| chain seed (INV-4) | 2163-2165 | 3 | chain (hostDeps closures, executeDeps) |
| thetaAbort derivation + ctx.signal forward capture (CANCEL-2/5) | 2167-2207 | 41 | forwardingSources, thetaAbort, signal |
| session read surfaces (readMessages / readContextPath) | 2209-2229 | 21 | readMessages, readContextPath (resolveQuery, surface) |
| ticket + status bus + checkpoint decorator + lane hooks (EXST-3/4) | 2231-2262 | 32 | ticket, statusBus, checkpoint, statusLanes |
| hostDeps literal: evaluatePure / resolveQuery / resolveToolCall / resolveInvoke / recordInvokeHop / classifyCall / resolveRuntimeToolCall / resolveCallAsInvoke / resolveSubagentFnChild closures | 2263-2337 | 75 | hostDeps |
| executeDeps literal (env build, host, mutator, invokeChain) | 2339-2371 | 33 | executeDeps |
| forwarding-sink publish + finishInvocation | 2373-2387 | 15 | detachForwarding, finished, finishInvocation |
| returned binding with PIC-53 surface projection | 2389-2412 | 24 | — |

Excerpt (2263-2268, the hostDeps assembly boundary):
```ts
    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint,
      signal,
      sink: noopSink(),
      file: theta.slashName,
      evaluatePure: (expr, env, overrideChain) => evaluatePureExpression(expr, env, overrideChain ?? chain),
```
`spawnSubagentConversation` (2424-2481) repeats phase 2 (thetaAbort derivation + forwardingSources) near-verbatim.

## Why this is a problem
Strong band (257 LOC ≥ 200): presumption of breakdown; a strong concrete reason is required. Reasons considered and defeated: (a) single algorithm with shared local state — concrete: chain, thetaAbort, signal, ticket, checkpoint, readMessages cross phases (6 locals) — but the two biggest phases (hostDeps and executeDeps literals, 108 LOC combined) consume them read-only, so a parameter object already exists in shape (`EffectfulStatementHostDeps` itself); (b) spec-cited critical section — the comments cite CANCEL-2/5 and EXST-4 per phase, not one clause over the whole body; the method is stated "synchronous and cannot throw between here and the return" (2373-2375) only for the last two phases, a 15-LOC window, not the whole; (c) closed enumeration / data-only / generated — no; (d) prior revert / measured cost / human ruling — none found; no exemptions.json entry.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: thetaAbort derivation + forwarding capture (2167-2207) -> `#deriveInvocationAbort(bindInput)` returning { thetaAbort, signal, forwardingSources } — ~41 LOC, also deduplicates the same block in spawnSubagentConversation (2465-2481). Seam B: hostDeps closure assembly (2263-2337) -> `#buildPromptHostDeps(theta, ctx, chain, ticket, ...)` — ~75 LOC, no exports. Seam C: the surface projection (2389-2412) -> a named module-level `promptModeSurface(readMessages)` beside `surfaceCalleeFinalValue` — ~24 LOC.

## False-positive check
Band check: 257 LOC strong (map-quoted). Reasons-considered list above. Exemptions check: no entry. Generated-code check: hand-authored. Spec-mirror check: not an enumeration host. Cited ranges re-read this session (offset 2156, 257 lines).

## Triage
verdict: questionable — accounting verified (size-scan: 257 LOC strong band, no D9 exemption; eight cited phases real and sequential; parentSignal-derivation block re-verified in spawnSubagentConversation ~2465-2477); cross-phase shared-local count is ~12 not 6, which strengthens reason (a) but a concrete reason alone does not rescue a strong-band host — target shape needs a human ruling (triage: claude-fable-5-1)
