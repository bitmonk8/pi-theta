---
id: PTQ-1151
title: runComposePass spans 1090 LOC across fourteen sequential construction and adjudication phases
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/production-composition.ts:678-1767
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#runComposePass
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# runComposePass spans 1090 LOC across fourteen sequential construction and adjudication phases

## Observation
`runComposePass` (src/extension/production-composition.ts:678-1767) is 1090 LOC — strong band, more than five times the 200-LOC strong function threshold. Its doc comment (lines 648-654) states its role: "One discovery + compose pass against an already-constructed runtime root. Factored out of `discoverAndComposeFixtures` so `composeExtensionInstance` can re-run it on every hot-reload." The body is a straight-line sequence of construction phases (seams, discovery, parse deps, placement stack, dispatch ladder, producer deps) followed by two per-theta loops and a child-verification tail. This finding is distinct from PTQ-0322 (the file-level nine-concern breakdown, ratified and partially executed as Seam 0): PTQ-0322's ratified and pre-announced seams (Seam 0 landed in commit 7281a593; A+C and B' pre-announced) move *other* declarations out of the file and leave this function's own 1090 LOC untouched.

## Evidence
Step inventory (phase | line range | LOC | locals read/written — the seam cost):

| phase | lines | LOC | locals read / written |
|---|---|---|---|
| Seam defaulting + recording tee sink | 738-789 | 52 | w: fileSystem, clock, subagentExecutableHost, controlPlane, controlPlaneEnv, recordedErrorDiagnostics, recordingComplete, sink |
| Settings + verbosity + placement selector + regime/marked-root | 791-830 | 40 | r: fileSystem, statusBus, passPlacementRegistration, controlPlaneEnv; w: settings, placementSelector, subagentRootRegime, markedRoot |
| Discovery walk (CLI, pi-owned, package, five-source) | 832-877 | 46 | r: pi, fileSystem, settings, markedRoot, sink; w: cliPaths, piOwnedNames, packageWalk, walk, discovered |
| Model matcher + strict-capability probes | 879-926 | 48 | r: ctx; w: modelMatcher, settingsBinderModel, hostExposesStrictCapability, probeStrictCapable |
| Pass-scoped parse deps + registry snapshot + tool names | 928-991 | 64 | r: pi, ctx, rendererGate, entryChannel, inProcessTools; w: systemNote, parseDeps, registrySnapshot, inProcessToolNames |
| Active-root + watch-root derivation | 993-1046 | 54 | r: discovered, walk, packageWalk, fileSystem; w: activeRoots, discoveryWatchRoots |
| Envelope writer + placement backends + policy + wire | 1048-1126 | 79 | r: passEnvelopeWriter, passResultChannel, settings, controlPlaneEnv, clock, systemNote, ctx; w: emitResultEnvelope, pipePlacement, execPlacement, selectPlacementNow, placementAtLoad, placementPolicy, subagentOpenWire |
| Dispatch-ladder probe + host-loop dispatch + outcome bus | 1128-1174 | 47 | r: pi, ctx, clock; w: hostLoopSurfacesPresent, dispatchLadderProbe, hostLoopDispatch, subagentOutcomeEvents |
| producerDeps assembly | 1176-1305 | 130 | r: ~20 prior locals; w: producerDeps |
| Per-file parse loop | 1308-1330 | 23 | r: discovered, parseDeps, sink; w: parsedInputs |
| Invoke graph + executable probe | 1334-1345 | 12 | w: invokeGraph, subagentExecutableProbe |
| Per-theta nine-gate registration loop | 1347-1706 | 360 | r: sink, parseDeps, registrySnapshot, activeRoots, inProcessToolNames, invokeGraph, subagentExecutableProbe, placementAtLoad, dispatchLadderProbe, modelMatcher, settingsBinderModel, probeStrictCapable, subagentRootRegime, controlPlane, producerDeps; w: thetas, importClosureDirs |
| Child callable-hash verification + marked-root refusal | 1709-1745 | 37 | r: thetas, parseDeps, subagentRootRegime, controlPlaneEnv, recordedErrorDiagnostics, discovered; w: survivors, registrationRefusal |
| Watch-root union + latch + envelope + return | 1747-1766 | 20 | r: importClosureDirs, discoveryWatchRoots, emitResultEnvelope; w: watchRoots, recordingComplete |

Representative excerpt — a construction phase whose only outputs downstream are four named values (lines 1067-1080):
```ts
  const pipePlacement = createPipePlacementBackend(createProductionSpawnFn());
  // RFC-0012 §4: the `exec` backend over the operator's global template (the
  // settings reader already dropped a project-scope value). Its `when` gate
  // reads the same env view the selector does.
  const execTemplate = settings.theta?.subagentPlacementExec;
  const execPlacement =
    execTemplate !== undefined
      ? createExecPlacementBackend(execTemplate, {
          runner: createProductionExecCommandRunner(),
          env: controlPlaneEnv,
          clock,
        })
      : undefined;
  const selectPlacementNow = (): PlacementSelection =>
```

## Why this is a problem
Strong band (1090 LOC — the map's top over-threshold row for this file): presumption of breakdown, not filed only on a strong concrete reason. Reasons considered and defeated:
- Closed-enumeration dispatch — no. There is no switch/if-chain mirroring one spec-named closed set; the gate loop's nine `continue` gates each cite a *different* spec (Step 0(f), RFC-0012 §6, V20a, RFC 0011 §3.3, PIC-64 rung 3, INV-3/4, FN-6/FN-7, IMP-1..7, binder-model-and-context.md).
- Single algorithm with shared local state — holds only for the gate loop (15 locals read), not for the function. The construction phases are producer-consumer stages: the placement stack (1048-1126) consumes settings/controlPlaneEnv/clock/systemNote and yields 4 named values; the ladder phase (1128-1174) consumes pi/ctx/clock and yields 3. Extracting a construction phase threads its 3-4 inputs, not the pass state — under the 6-local bar.
- Data-only module / type family — no; every phase is imperative.
- One grammar production family — no; this is composition/admission, not a parser production.
- Generated code — no generation markers (`grep "@generated\|DO NOT EDIT"` over the file: 0 hits).
- Strong-only, spec-cited single critical section — no. The bug-0110-cited gate ORDER ("strictly before `checkInvokeStaticResolution` runs below", line ~1401) lives entirely inside the one loop phase and survives any construction-phase extraction; no ordered observable sequence spans, say, the model-matcher construction and the placement stack — they do not read each other.
- Strong-only, measured cost — none cited for keeping the construction phases inline.
- Strong-only, prior split reverted — none: `git log --follow` shows the file's only split (Seam 0, commit 7281a593) landed and stuck.
- Strong-only, human ruling — `quality/exemptions.json` has no `D9:...#runComposePass` key; PTQ-0322's ruling covers the file host key only and its pre-announced seams do not touch this function.

## Suggested direction (non-binding, optional)
Seam hypotheses, unproven, ordered by confidence: Seam A: the placement/wire construction (lines 1048-1126) -> in-file helper `buildPassPlacement` (hypothesis) — 79 LOC, 0 exported symbols moved (all module-private), 0 external importers, cross-references back into the host limited to settings/controlPlaneEnv/clock/systemNote/pass* seam params. Seam B: the dispatch-ladder probe + host-loop wiring (1128-1174) -> `buildDispatchLadder({ pi, ctx, clock })` (hypothesis) — 47 LOC, 0 exported symbols moved, returns the probe/dispatch/outcome-bus triple. Seam C: the per-theta gate chain body (1360-1706) -> `composeOneTheta(input, passCtx)` (hypothesis) — ~345 LOC, 0 exported symbols moved, requires inventing the explicit pass-context object the current shape avoids (the 15 named locals above).

## False-positive check
Band: strong (1090 LOC, quoted from the structural map). Reasons-considered list above, each defeated with a count or citation. Exemptions check: `quality/exemptions.json` read in full — four keys, none matching this function or file. Generated-code check: no generation markers in the file. Spec-mirror check: the gate loop cites at least eight distinct spec/RFC documents across its gates, not one closed enumeration. Duplicate check: PTQ-0322 (resolved) is the file-level finding; its ratified Seam 0 and pre-announced Seams A+C/B' move sibling declarations, not this function's body — no pending or resolved finding carries the `#runComposePass` host key (grep over quality/: 0 hits for `d9_host:.*runComposePass`).

## Triage
verdict: questionable — accounting verified: `size-scan.mjs map` reproduces runComposePass at 678-1767, 1090 LOC, band strong (FN strong threshold 200), unexported 0/0 importers; all fourteen inventory rows re-read against HEAD and are real, distinct, imperative construction/adjudication phases whose stated locals-read/written match the code (e.g. the placement stack 1048-1126 consumes settings/controlPlaneEnv/clock/systemNote and yields emitResultEnvelope/pipe+exec placement/placementAtLoad/placementPolicy/subagentOpenWire; the ladder phase 1128-1174 consumes pi/ctx/clock and yields the probe/dispatch/outcome-bus triple; neither reads the other), the 1067-1080 excerpt matches verbatim, the ≥6-shared-locals reason genuinely holds only for the 1347-1706 per-theta gate loop (15 locals) and not for the producer-consumer construction phases, and the gate loop's nine `continue` gates cite distinct specs (Step 0(f), RFC-0012 §6, V20a, RFC 0011 §3.3, PIC-64 rung 3, INV-1/3/4, FN-6/7, IMP-1..7, Erratum B, binder-model) so no closed-enumeration spec mirror applies; re-ran the checks: `quality/exemptions.json` has four keys, none for this file or `#runComposePass`; 0 `@generated|DO NOT EDIT` hits; `git log` shows 0 reverts on the file and Seam 0 (7281a593, production-discovered-theta.ts) landed and stuck; the pre-announced PTQ-0322 targets (theta-callee-tools-verification.ts, production-bootstrap.ts) do not exist and PTQ-0322 (fixed, file host key only) never touched this body. NOT a duplicate: no open/resolved issue carries `d9_host: …#runComposePass` (grep → 0); the two prior filings were (a) qw20260914060226-d9-03 human-deferred 2026-09-14 with an explicit "re-file with fresh line numbers once the file changes (runComposePass 885 LOC remains a breakdown candidate)" — the file has since changed (885→1090 LOC, >25% growth) — and (b) qw20260916144930-d9-03, twice triaged questionable then purged UNRULED in the 2026-09-17 bug-0479 reset (53f815de), so this is the invited re-file, not a re-litigation of a ruling. Human notes: sibling same-wave intake d9-02 (#composeExtensionInstance) and d9-03 (#resolveThetaToolsAtLoad) share this host, so the store's one-seam-per-host-per-wave rule applies again; the candidate's Seam A/B (79+47 LOC construction extractions, 3-4 params each) are cheap, Seam C (gate loop → composeOneTheta) requires inventing a 15-member pass-context object. Per the D9 protocol an accurate breakdown accounting rests at questionable — the seam shape is a design decision for human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently at HEAD (post-0fb4497e): size-scan map reproduces runComposePass at 675-1764, 1090 LOC, band strong (FN threshold 200), unexported 0/0 importers, a uniform −3 drift from the cited 678-1767 with every one of the fourteen phase ranges and the 1067-1080 excerpt (now 1064-1077) matching verbatim; the rows are real distinct imperative phases and the cross-phase fan-in of each construction phase stays under the 6-local bar (placement stack reads settings/controlPlaneEnv/clock/placementSelector/systemNote; ladder phase reads only clock plus pi/ctx params) so the single-algorithm reason holds only for the gate loop, exactly as filed; one undercount — the loop has eleven `continue` gates (Step 0(f), RFC-0012 §6, V20a, RFC 0011 §3.3, PIC-64 rung 3, INV, FN-6, FN-7, IMP, Erratum B, binder-model), not nine, which only strengthens the no-closed-enumeration point; exemptions.json has four keys, none for this file or function; 0 `@generated|DO NOT EDIT` hits; 0 reverts in git log; not a duplicate — PTQ-0322 is the file-level key (Seam 0 moved production-discovered-theta.ts, its pre-announced A+C/B' modules do not exist), the 2026-09-14 function-level filing was human-deferred with an explicit re-file invitation (885→1090 LOC since), the 2026-09-16 re-file was purged unruled in 53f815de, and no other `d9_host: …#runComposePass` row exists; per the D9 protocol the seam shape (A/B cheap construction extractions vs C's 15-member pass-context object, and sequencing against same-wave siblings d9-02/d9-03 on this host) is a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified a third time at HEAD: `size-scan.mjs map` gives runComposePass 675-1764, 1090 LOC, band strong (FN strong ≥ 200, bands from `size-scan bands`), unexported 0/0 importers; the cited ranges sit at a uniform −3 drift and every phase re-reads as filed — seam defaulting + recording tee (735-786), settings/selector/regime/marked-root (788-827), discovery walk, model matcher, parse deps, active/watch roots, the placement stack (1045-1123) reading settings/controlPlaneEnv/clock/placementSelector/systemNote and yielding emitResultEnvelope/pipe+exec/placementAtLoad/placementPolicy/subagentOpenWire, the ladder phase (1125-1171) reading pi/ctx/clock and yielding probe/hostLoopDispatch/outcome-bus with no cross-read between them, producerDeps, parse loop, invokeGraph+probe, the per-theta gate loop (1344-1703), refuseDivergedChildCallables tail, and the watch-root union/latch/envelope return — and the 1067-1080 excerpt is byte-exact at 1064-1077; the loop has ten `continue` gates (filing: nine, prior note: eleven — immaterial) minting nine distinct `theta/load/*` codes and citing Step 0(f), RFC-0012 §6, V20a, RFC 0011 §3.3, PIC-64 rung 3, INV-1/3/4, FN-6/7/8, IMP-1..7, Erratum B, binder-model-and-context.md, so no closed-enumeration spec mirror applies and the ≥6-shared-locals reason holds only for that one loop, not the producer-consumer construction phases; exemptions.json holds four keys (two D8, D9 for normaliseParamLineBreaks and package-discovery.ts), none for this file or function; 0 `@generated|DO NOT EDIT` hits; 0 reverts in `git log --follow`; PTQ-0322's pre-announced modules (theta-callee-tools-verification.ts, production-bootstrap.ts) do not exist and only Seam 0 (production-discovered-theta.ts) landed; not a duplicate — the only `d9_host: …#runComposePass` row in quality/ is this file, the 2026-09-14 filing was human-deferred with an explicit re-file invitation (TRIAGE_LOG.md:60, 885→1090 LOC since), and no open or resolved PTQ carries this host key; same-wave siblings d9-02/d9-03 share the file host so the one-seam-per-host-per-wave rule again applies — the seam shape is a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
