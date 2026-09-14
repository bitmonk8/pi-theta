---
id: pending
title: runComposePass runs discovery, producer-deps assembly, and ten sequential per-theta registration gates in one 885-line function
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:550-1434
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#runComposePass
d9_band: strong
wave: qw20260914060226
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# runComposePass runs discovery, producer-deps assembly, and ten sequential per-theta registration gates in one 885-line function

## Observation
`runComposePass` (`src/extension/production-composition.ts:550-1434`) is 885 LOC — strong band, 4.4x the 200-LOC strong-function threshold, and the single largest declaration in the file. Its own doc comment describes it as "one discovery + compose pass against an already-constructed runtime root," but the body is a 13-phase orchestration: recording-tee setup, settings/regime/discovery-input gathering, the five-source discovery walk, model-matcher/strict-capability-probe construction, system-note/parse-deps assembly, active/watch-root computation, dispatch-ladder probing, a ~108-line `producerDeps` object literal, a parse-pass loop, invoke-graph construction, and — the largest sub-block — a per-theta registration loop that runs ten independently-specified admission gates in sequence before a theta may register.

## Evidence
Step inventory (phase | lines | LOC | locals read/written):

| phase | lines | LOC | locals |
|---|---|---|---|
| Recording-tee + host setup | 598-647 | 50 | `fileSystem`, `clock`, `subagentExecutableHost`, `recordedErrorDiagnostics`, `recordingComplete`, `sink` |
| Settings + regime + discovery inputs | 649-703 | 55 | `settingsResult`, `settings`, `subagentRootRegime`, `markedRoot`, `cliPaths`, `piOwnedNames`, `packageWalk` |
| Discovery walk | 705-721 | 17 | `walk`, `discovered` |
| Model matcher + strict-capability probe | 723-771 | 49 | `modelMatcher`, `settingsBinderModel`, `hostExposesStrictCapability`, `probeStrictCapable` |
| System-note + parse-deps + registry snapshot | 772-808 | 37 | `systemNote`, `parseDeps`, `registrySnapshot` |
| Active/watch roots (discovery-derived) | 810-867 | 58 | `activeRoots`, `discoveryWatchRoots` |
| Dispatch-ladder probe + host-loop wiring | 869-913 | 45 | `emitResultEnvelope`, `hostLoopSurfacesPresent`, `dispatchLadderProbe`, `hostLoopDispatch` |
| `producerDeps` construction | 915-1022 | 108 | `producerDeps` (36+ fields) |
| Parse-pass loop | 1023-1048 | 26 | `parsedInputs` |
| Invoke graph + executable probe | 1049-1061 | 13 | `invokeGraph`, `subagentExecutableProbe` |
| **Registration loop (10 gates, detailed below)** | **1062-1376** | **315** | `thetas`, `importClosureDirs`, plus each gate's own result |
| Child-hash verification | 1377-1392 | 16 | `survivors` |
| Refusal + watch-root finalize + envelope + return | 1393-1434 | 42 | `registrationRefusal`, `canonicalClosureDirs`, `outOfRootClosureDirs`, `watchRoots` |

The registration-loop phase alone (1062-1376) runs ten sequential, independently-named gates per discovered theta, each a `continue`-on-error early exit:

```
1079  if (input.frontmatter.mode === "subagent" && !subagentExecutableProbe.ok) {   // subagent-executable gate
1089  const toolResult = await resolveThetaToolsAtLoad(                            // tools: resolution
1129  const reachabilityDiagnostics = checkExtensionToolReachability({             // extension-tool reachability (PIC-64 rung 3)
1146  const invokeDiagnostics = await checkInvokeStaticResolution(input, {         // invoke static resolution (INV-1/3/4)
1174  const subagentFnDiagnostics = checkSubagentFnStaticResolution({              // subagent fn static resolution (RFC-0001 FN-6)
1189  const subagentFnModelDiagnostics = checkSubagentFnModelOverrides(            // subagent fn model overrides (RFC-0001 FN-7)
1205  const importCheck = await checkThetaImports(input, {                        // .thetalib imports (IMP-1/3/4/5)
1239  const bypassEligible =                                                      // binder-model resolution setup
1264  const binderModelResolution: BinderModelResolution = isMarkedRootTheta      // binder-model resolution
1299  const typedQueryProviderWarning = checkThetaTypedQueryProviderSupport({      // typed-query provider gate (bug 0010 increment C)
1359  const fixture = composeThetaFixture(composedInput, producerDeps);           // fixture compose + push
```
(line numbers from `grep -n` against the current file — each is a distinct, separately-testable admission rule citing its own bug/spec clause in the surrounding comments.)

## Why this is a problem
Strong band (885 LOC): filed unless a strong concrete reason is on record. Reasons considered and defeated:
- Single algorithm with shared local state — the concrete reason's own bar ("splitting would thread 6+ locals through every helper signature") is technically met by locals-count, but the sharing does not cohere into *one* algorithm: `modelMatcher`/`probeStrictCapable` are read only by the binder-model and typed-query gates, not by the child-hash-verification phase; `invokeGraph` is read only by the invoke-static-resolution gate. Each of the ten registration-loop gates already delegates to an independently-named, independently-testable helper (`resolveThetaToolsAtLoad`, `checkExtensionToolReachability`, `checkInvokeStaticResolution`, `checkSubagentFnStaticResolution`, `checkSubagentFnModelOverrides`, `checkThetaImports`, `resolveBinderModel`, `checkThetaTypedQueryProviderSupport`, `composeThetaFixture`) — `runComposePass` itself is the sequential *caller*, not the algorithm; the outer per-theta loop body is a mechanical Extract-Function candidate (a `runRegistrationGatesForTheta(input, gateDeps)` helper), not an irreducible single computation.
- Closed-enumeration dispatch — no. The ten gates are an unconditional *sequence* (each runs, then the next), not alternative arms of a switch over one spec-named closed set.
- Data-only / grammar-production-family / generated-code — not applicable (imperative orchestration, hand-authored).
- Strong-only, spec-cited ordered critical section where a seam would interleave observable steps — partially present (e.g. escape-before-parse ordering inside individual gates) but not for the *outer* sequence: each gate is already an independent named-function call, so calling the same ten functions in the same order from a slightly shorter orchestrator (or one that delegates the per-theta body to a single helper) preserves the order exactly as today; nothing here requires the ten calls to remain textually inside `runComposePass` itself.
- Strong-only: measured cost, prior reverted split, human ruling — none cited; `quality/exemptions.json` carries no `production-composition.ts#runComposePass` key.

## Suggested direction (non-binding, optional)
Seam hypotheses, unproven:
- Seam A: extract the per-theta registration-loop body (1062-1376, the ten-gate sequence) into a single named helper, e.g. `runRegistrationGatesForTheta` (hypothesis), taking the already-computed pass-scoped context (`parseDeps`, `producerDeps`, `activeRoots`, `registrySnapshot`, `modelMatcher`, `subagentRootRegime`, `subagentExecutableProbe`, `dispatchLadderProbe`) as one parameter object; `runComposePass` would then call it once per discovered theta exactly as it does today.
- Seam B: extract `producerDeps` construction (915-1022, 108 LOC) into its own named builder, e.g. `buildProductionProducerDeps(...)` (hypothesis), since it is already a single object-literal call to `createProductionProducerDeps` with no branching.
- Seam C: extract the discovery-input-gathering phases (649-867, ~196 LOC: settings/regime/discovery-walk/model-matcher/watch-roots) into a `gatherDiscoveryInputs(...)` helper (hypothesis) returning the handful of values (`settings`, `discovered`, `modelMatcher`, `parseDeps`, `activeRoots`, `discoveryWatchRoots`) the later phases read.

## False-positive check
Band: strong (885 LOC, function line in the structural map). Reasons-considered list above, each defeated with a line-cited count. Exemptions check: `quality/exemptions.json` has no `production-composition.ts#runComposePass` entry. Generated-code check: no `@generated`/`DO NOT EDIT` markers in the file. Spec-mirror check: the ten registration-loop gates cite at least eight *different* spec/RFC sources (PIC-64, INV-1/3/4, RFC-0001 FN-6/FN-7, IMP-1/3/4/5, binder-model-and-context.md, bug 0010 increment C) rather than one closed enumeration from a single table — confirming ten independent admission rules chained in sequence, not one spec's enumerated arms.

## Triage
verdict: questionable — size-scan confirms 885 LOC/strong band and no exemptions.json entry; every cited phase range and the ten in-loop gate call sites (1079-1359) verified against the file; the reasons-considered (closed-enumeration, single-algorithm/shared-locals, spec-ordering) hold up on re-check; per D9 breakdown policy accurate accounting is never "confirmed" — the split shape is a human ruling (triage: claude-opus-5)
