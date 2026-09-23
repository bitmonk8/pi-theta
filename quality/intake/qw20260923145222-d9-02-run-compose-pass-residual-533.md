---
id: pending
title: runComposePass remains 533 LOC (strong band) after the PTQ-1438 extractions, with separable construction phases left inline
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:682-1214
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#runComposePass
d9_band: strong
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# runComposePass remains 533 LOC (strong band) after the PTQ-1438 extractions, with separable construction phases left inline

## Observation
The map places `runComposePass` at 682-1214, 533 LOC, band strong (function
threshold >= 200), unexported, 0/0 importers. PTQ-1151 and PTQ-1438 (both
resolved/fixed) already extracted buildPassPlacement, buildDispatchLadder,
resolvePassInputs, buildProducerDeps and composeOneTheta from this body
(1090 -> 533 LOC). The residual body is still one function two and a half
times over the strong bar, composed of sequential construction and
adjudication phases.

## Evidence
Step inventory (line anchors re-read at HEAD; locals each phase reads ->
writes):

| phase | lines | LOC | reads -> writes |
|---|---|---|---|
| signature + seam defaulting | 682-757 | 76 | params -> fileSystem, clock, subagentExecutableHost, controlPlane, controlPlaneEnv |
| recording tee + latch | 759-793 | 35 | outerSink -> recordedErrorDiagnostics, recordingComplete, sink |
| pass-input resolution (call) | 795-812 | 18 | pi, fileSystem, clock, sink -> settings, placementSelector, subagentRootRegime, walk, packageWalk, discovered |
| model matcher + strict-capability probes | 814-861 | 48 | ctx, settings -> modelMatcher, settingsBinderModel, hostExposesStrictCapability, probeStrictCapable |
| systemNote + pass caches (parseDeps) | 863-904 | 42 | pi, ctx, rendererGate, entryChannel, modelMatcher -> systemNote, parseDeps, registrySnapshot |
| in-process tool names | 918-926 | 9 | inProcessTools -> inProcessToolNames |
| active roots + watch-root union | 928-976 | 49 | discovered, walk, packageWalk, fileSystem -> activeRoots, discoveryWatchRoots |
| placement + ladder (calls) | 978-1000 | 23 | settings, controlPlaneEnv, clock, systemNote -> emitResultEnvelope, placementAtLoad, placementPolicy, subagentOpenWire, dispatchLadderProbe, hostLoopDispatch, subagentOutcomeEvents |
| run-card publisher + trace seam | 1003-1036 | 34 | ctx, entryChannel, statusBus, clock, settings -> runCard, statusTrace |
| producer deps (call) | 1038-1066 | 29 | 24 locals/params -> producerDeps |
| discovery parse loop | 1068-1092 | 25 | discovered, fileSystem, parseDeps, sink -> parsedInputs |
| invoke graph + executable probe | 1094-1112 | 19 | parsedInputs, fileSystem, subagentExecutableHost -> invokeGraph, subagentExecutableProbe |
| composeDeps + per-theta loop | 1114-1153 | 40 | 19 locals -> composeDeps, thetas, importClosureDirs |
| hash refusal + refusal envelope + watch-root fold + return | 1156-1214 | 59 | thetas, recordedErrorDiagnostics, importClosureDirs, discoveryWatchRoots, subagentRootRegime, emitResultEnvelope -> survivors, registrationRefusal, watchRoots |

Excerpt (1203-1213):
```ts
  const watchRoots = Array.from(new Set([...discoveryWatchRoots, ...outOfRootClosureDirs]));
  recordingComplete = true;
  if (registrationRefusal !== undefined) {
    // The one PIC-59 envelope line this pass ever owes: the child fell
    // through to the host's ordinary prompt handling with no theta runtime
    // ever entered, so the load pass is the only remaining writer for it.
    // Bug 0347 §Fix: this refusal is a boundary MINT (the load pass itself
    // fabricates it; the marked root's own body never ran) — stamp "mint".
    emitResultEnvelope(serializeErrEnvelope(registrationRefusal, "mint"));
  }
  return { thetas: survivors, activeRoots, watchRoots };
```

## Why this is a problem
Strong band: presumption of breakdown, strong concrete reason required.
Reasons considered: (1) single algorithm with >= 6 shared locals — holds for
the parse loop -> composeDeps -> refusal tail chain, but the construction
phases (model/probe cluster 814-861, watch-root union 928-976, run-card/trace
1003-1036) each read <= 5 already-named values and write independent products;
the prior PTQ-1438 triage verified the same for the phases since extracted.
(2) spec-cited critical section — the tee's latch (recordingComplete) spans
the whole body, but the latch is a boolean over a pass-local array; a helper
receiving the sink does not interleave any observable step (diagnostics
delivery order is call order, preserved by sequential helpers — same
verification as PTQ-1151 triage). (3) measured cost / reverted split — none;
the PTQ-1151/1438 extractions landed and stuck. (4) exemptions.json — no key
for this host. (5) generated — no markers.

## Suggested direction (non-binding, optional)
Seam A: model matcher + strict-capability probes -> buildModelProbes(ctx,
settings) (hypothesis) — 48 LOC, 0 exported symbols, 0 external importers,
returns {modelMatcher, settingsBinderModel, probeStrictCapable}. Seam B:
active-root + watch-root union -> buildWatchRootUnion(fileSystem, discovered,
walk, packageWalk) (hypothesis) — 49 LOC, 0 exports, pure over its inputs.
Seam C: run-card + trace wiring -> buildStatusSeams(ctx, clock, settings,
entryChannel, statusBus) (hypothesis) — 34 LOC. All unproven; the human
ratifies.

## False-positive check
Band: strong (533 >= 200, map-quoted). Reasons-considered list above with
defeating evidence. Exemptions check: no `#runComposePass` key in
quality/exemptions.json. Generated-code check: 0 markers. Spec-mirror check:
the per-theta gate enumeration moved to composeOneTheta; no closed spec table
remains here. Duplicate check: PTQ-1151 and PTQ-1438 are both resolved
(fixed); no open issue carries this d9_host — residual-after-fix filing per
the PTQ-1438 precedent (itself a residual of PTQ-1151).

## Triage
verdict: questionable — accounting verified: `size-scan.mjs map` reproduces runComposePass at 682-1214, 533 LOC, band strong (FN strong ≥ 200 per `size-scan bands`), unexported 0/0 importers, with the PTQ-1151/1438 fix products present (buildPassPlacement 1217-1317, buildDispatchLadder 1320-1385, resolvePassInputs 1395-1517, buildProducerDeps 1525-1713, composeOneTheta 1758-2121; commits 501d782b and b258e293 landed, 0 reverts in the file's log); the 1203-1213 excerpt is byte-exact; all fourteen inventory rows open at the cited boundaries as distinct sequential phases (seam defaulting 741-745, tee 759-793, resolvePassInputs call 795-812, matcher/probe cluster 814-861 reading only ctx+settings, systemNote/parseDeps 863-904, inProcessToolNames 918-926, activeRoots/discoveryWatchRoots 928-976 reading discovered/walk/packageWalk/fileSystem, placement+ladder calls 978-1000, runCard/statusTrace 1003-1036 reading ctx/entryChannel/statusBus/clock/settings, buildProducerDeps call 1038-1066, parse loop 1068-1092, invokeGraph/probe 1094-1112, composeDeps+loop 1114-1153, refusal tail 1156-1214); 278 of 533 lines are comments (~255 code lines, still over 200); exemptions.json has four keys (D8 ×2, D9 normaliseParamLineBreaks, D9 package-discovery.ts), none for this file or `#runComposePass`; 0 `@generated|DO NOT EDIT` hits in the range; no overlooked reason — the ≥6-shared-locals algorithm reason covers only the parse-loop→composeDeps→refusal tail, the recordingComplete latch is a pass-local boolean not a spec-cited critical section, no spec table remains after composeOneTheta took the gate ladder; not a duplicate — PTQ-1151 and PTQ-1438 are both status fixed in quality/resolved, no quality/issues row carries this d9_host, and the same-wave siblings target `production-composition.ts` (file), `#composeOneTheta` and `#composeExtensionInstance`; per the D9 protocol the residual seam shape (A/B/C hypotheses) is a design decision for human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting verified: `size-scan.mjs map` reproduces runComposePass 682-1214, 533 LOC, band strong (FN strong ≥ 200), unexported 0/0; ~240 non-comment code lines (still > 200); 1203-1213 excerpt byte-exact; inventory rows re-read as distinct sequential phases (matcher/strict-capability probes 814-861 read only ctx+settings; activeRoots/discoveryWatchRoots 928-976 read discovered/walk/packageWalk/fileSystem; runCard/statusTrace 1003-1036 read ctx/entryChannel/statusBus/clock/settings); no exemptions.json key for this file or `#runComposePass`; no overlooked reason (≥6-shared-locals holds only for parse→compose→refusal tail, no spec table, no revert); not a duplicate — PTQ-1151/PTQ-1438 are status fixed in quality/resolved, no quality/issues row names runComposePass, same-wave siblings key the file and #composeOneTheta; seam shape is a design decision for a human ruling (triage: claude-opus-5-5)
verdict: questionable — accounting verified; target shape needs a human ruling: I re-ran size-scan map on a one-line manifest and got runComposePass at 682-1214, 533 LOC, band strong (FN strong ≥ 200), unexported, 0/0 importers, with the PTQ-1151/1438 extractions present (buildPassPlacement, buildDispatchLadder, resolvePassInputs, buildProducerDeps, composeOneTheta); the 1203-1213 excerpt matches byte for byte; the three proposed seam rows are separate phases with their own inputs: matcher/strict-capability probes (814-861) read only ctx and settings, activeRoots/discoveryWatchRoots (928-976) read discovered, walk, packageWalk and fileSystem, and runCard/statusTrace (1003-1036) read ctx, entryChannel, statusBus, clock and settings; exemptions.json has no key for this file or #runComposePass; no overlooked reason; not a duplicate, since PTQ-1151 and PTQ-1438 are resolved and the same-wave siblings are keyed to the file, #composeOneTheta and #composeExtensionInstance (triage: claude-opus-5-5)
