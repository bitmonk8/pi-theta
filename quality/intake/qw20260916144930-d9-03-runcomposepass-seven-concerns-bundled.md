---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: runComposePass bundles seven independently-spec-cited load-pass concerns in one 1045-line function
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:662-1706
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/production-composition.ts#runComposePass
d9_band: strong
wave: qw20260916144930
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-16
---

# runComposePass bundles seven independently-spec-cited load-pass concerns in one 1045-line function

## Observation
`runComposePass` (`src/extension/production-composition.ts:662-1706`) is 1045 LOC — strong band (>= 200 LOC), more than five times the threshold. It is file-private (0 importers; called only by `composeExtensionInstance` and `discoverAndComposeFixtures` in the same file). The file's own header states the composition root's job as "constructs the runtime root... runs the five-source discovery walk... parses each discovered `.theta`... and maps it to a runnable `ThetaFixture`" — but within this one function body that charter expands into settings loading, RFC-0012 subagent-placement backend selection, the discovery walk, per-pass parse-collaborator construction, a ~120-LOC producer dependency-injection assembly, a 394-line twelve-gate per-theta registration pipeline, and RFC-0005 child-callable-hash divergence handling, each independently spec-cited.

## Evidence
Distinct-concern inventory (concern | members/phase | line ranges | LOC):

| concern | phase | line ranges | LOC |
|---|---|---|---|
| Pass bootstrap & settings | fileSystem/controlPlane setup, the error-recording diagnostic tee, `loadSettings`, status-bus verbosity | 722-793 | 72 |
| Subagent placement & host-loop dispatch ladder (RFC-0012 §1/§4/§5/§6, PIC-64) | regime/marked-root detection; pipe/exec backend construction, `placementPolicy`, `subagentOpenWire`, the dispatch-ladder probe, `createProductionHostLoopDispatch` | 794-817, 1024-1130 | 131 |
| Discovery walk & watch-root computation (discovery-sources.md, bug 0312/0339/0378) | CLI/package/settings discovery sources, `discoverThetas`, active-root union, `dedupeWatchRootsByIdentity` | 818-862, 960-1023 | 109 |
| Parse-time shared collaborator construction (bug 0264/0276/0475) | `modelMatcher`, the strict-capability probe, `systemNote`, per-pass `parseDeps` caches, `registrySnapshot` | 863-959 | 97 |
| Producer dependency-injection assembly | the ~30-property `createProductionProducerDeps({...})` call | 1131-1253 | 123 |
| Per-theta registration gate pipeline (INV-1/3/4, RFC 0001 FN-6/7, IMP-1/3/4/5, binder-model-and-context.md) | parse pass, invoke-graph build, subagent-executable probe, twelve sequential load-time gates (`tools:`, session-tool availability, extension-tool reachability, invoke static resolution, `subagent fn` static/model checks, `.thetalib` imports, binder-model resolution, typed-query warning) each `continue`-ing its own theta on error, then `composeThetaFixture` | 1254-1647 | 394 |
| Child-callable-hash divergence & pass finalisation (RFC-0005 #subagent-theta-callable-hash) | `refuseDivergedChildCallables`, `markedRootRegistrationRefusal`, watch-root closure-dir union, envelope emission | 1648-1706 | 59 |

7 rows, 985 of the function's 1045 LOC (94%); the remaining 60 LOC is the parameter list and its per-parameter doc comments (662-721).

The concern boundaries are not cosmetic — settings loading ends and placement-selector resolution begins mid-block with no shared data beyond `settings` itself:

`src/extension/production-composition.ts:775-794`
```ts
  const settingsResult = await loadSettings(fileSystem);
  sink.emitGroup(settingsResult.diagnostics);
  const settings: ThetaSettings = settingsResult.settings;

  // EXST-10: the telemetry-class ceiling, read like every other settings key
  // and defaulted at the READ site...
  statusBus?.setVerbosity(settings.theta?.progress ?? "names");

  // RFC-0012 §5/§6: placement. Discover registered backends (order-
  // independent with the factory-body offer subscription), build the `exec`
  // backend when the GLOBAL settings file carries a template...
  passPlacementRegistration?.discover();
```

The per-theta registration pipeline is twelve independently-checked gates, each delegating to an already-separate, already-tested function and `continue`-ing on error — the residual logic in this function is the glue, not the check itself:

`src/extension/production-composition.ts:1362-1370`
```ts
    if (toolResult.callableSet !== undefined) {
      const sessionToolDiags = checkSessionToolAvailability(
        toolResult.callableSet, { ctx, pi }, input.sourcePath ?? input.slashName,
      );
      sink.emitGroup(sessionToolDiags);
      if (sessionToolDiags.length > 0) { continue; }
    }

    // PIC-64 rung 3 (LOAD-time): a theta whose CODE calls a callable-set
    // EXTENSION tool refuses to register when no code-side dispatch rung is
```

## Why this is a problem
Strong band (1045 LOC): filed unless a strong concrete reason is on record. Reasons considered and defeated:
- Closed-enumeration dispatch — no. The per-theta gate pipeline (concern 6, 394 LOC) is the closest candidate, but it is only 38% of the function, and each gate's own logic already lives in a separate, independently-named checker (`resolveThetaToolsAtLoad`, `checkSessionToolAvailability`, `checkExtensionToolReachability`, `checkInvokeStaticResolution`, `checkSubagentFnStaticResolution`, `checkSubagentFnModelOverrides`, `checkThetaImports`, `resolveBinderModel`) — the enumeration argument would apply to the SIZE of those callees, not to why their call sites must share a function body with the five unrelated setup concerns (1-5, 7) that never appear in that enumeration.
- Single algorithm with shared local state — no. Unlike this file's own tools-verification cluster (`resolveThetaToolsAtLoad`, `calleeFailsOwnStructuralChecksBody`, etc. — recursive algorithms whose maps are read AND written across one loop and a later stub), each concern here consumes only a small, already-cleanly-scoped subset of the prior concerns' outputs (concern 2 needs `settings`+`controlPlaneEnv`+`clock`; concern 3 needs `settings`+`markedRoot`+`pi`; concern 5 needs the outputs of 2-4). The file already proves this decomposition works: `buildRuntimeRoot`, `dedupeWatchRootsByIdentity`, and `discoverAndComposeFixtures` are pre-existing standalone helpers immediately beside this function doing exactly this kind of extraction for other fragments of the same pass.
- Data-only module or type family — no; every concern is imperative orchestration logic, not type/table declarations.
- One grammar production family — no; this is load-time composition, not a parser production.
- Generated or mechanically derived code — no; `grep -n "@generated|DO NOT EDIT|autogenerated"` over the file returns no hits, and every block carries hand-authored, bug/RFC-numbered rationale.
- Strong-only, spec-cited invariant enforced as one critical section / ordered step sequence spanning the whole function — no. The seven concerns cite at least seven independent spec/RFC documents (RFC-0012 §1/§4/§5/§6, discovery-sources.md + bugs 0312/0339/0378, binder-model-and-context.md + bug 0475, PIC-64, INV-1/3/4 + RFC 0001 FN-6/7 + IMP-1/3/4/5 + binder-model-and-context.md, RFC-0005 #subagent-theta-callable-hash) — no single cited invariant spans concern 1 through concern 7. The ordering comments inside concern 6 ("pushed FIRST, ahead of the V15f callee-has-errors loop") govern only the internal sequence of concern 6's own nine already-separate gate calls, not why concern 6 must sit in the same function body as concerns 1-5 and 7.
- Strong-only, measured cost a seam would reintroduce — none cited anywhere in the function.
- Strong-only, prior split reverted — `git log --oneline --follow -- src/extension/production-composition.ts` shows only additive RFC-step and bug-fix commits (most recently RFC 0011 steps 2/4 and RFC 0012 steps 1-7); no split-then-revert for this function.
- Strong-only, human ruling on record — `quality/exemptions.json` carries no `D9:src/extension/production-composition.ts#runComposePass` key (checked in full; its two D9 keys are `binder-system-prompt.ts#normaliseParamLineBreaks` and `discovery/package-discovery.ts`, neither matching).

This is a different, more granular claim than the already-resolved `PTQ-0322` (which catalogued nine *file-level* concerns spread across the file's ~65 top-level declarations and folded this function, plus ten small sibling helpers, into one 1093-LOC "Discovery + compose-pass orchestration" row; the human ratified only that finding's Seam 0 and pre-announced, but has not executed, Seams A/B'/C — none of which touch this function). `runComposePass`'s own internal seven-concern bundling was never separately named or dispositioned, and the RFC-0011/RFC-0012 placement material in concern 2 was added to this function after PTQ-0322 was filed (the RFC-0012 step commits post-date PTQ-0322's fix commit `898ca244` in `git log`).

## Suggested direction (non-binding, optional)
Seam hypotheses, unproven, for the human to ratify:
- Seam A: hoist the producer dependency-injection assembly (concern 5, 123 LOC, the single `createProductionProducerDeps({...})` call) into a named helper, e.g. `buildProducerDeps(...)` (hypothesis) taking the already-computed collaborators (`root`, `activeInvocations`, `forwardingSignals`, `systemNote`, `placementPolicy`, `subagentOpenWire`, `dispatchLadderProbe`, `hostLoopDispatch`, `parseDeps`, `activeRoots`, etc.) as explicit parameters and returning the deps object `runComposePass` passes to `composeThetaFixture` calls inside the loop.
- Seam B: hoist the subagent-placement & host-loop-dispatch-ladder construction (concern 2, 131 LOC) into a helper, e.g. `resolveSubagentPlacement(settings, controlPlaneEnv, clock, pi, ctx, passPlacementRegistration)` (hypothesis), returning `{ subagentRootRegime, markedRoot, placementAtLoad, placementPolicy, subagentOpenWire, dispatchLadderProbe, hostLoopDispatch }`.
- Seam C: hoist the per-theta registration gate pipeline (concern 6, 394 LOC) into its own function, e.g. `registerOneTheta(input, ...)` (hypothesis) returning either the composed `ParsedTheta` or `undefined`, called from a slimmer `for` loop in `runComposePass`.

## False-positive check
Band: strong (1045 LOC, function top-line in the structural map). Reasons-considered list above, each defeated with a cited count, comment, or `git log` check. Exemptions check: `quality/exemptions.json` read in full, no matching `D9:...#runComposePass` key. Generated-code check: `grep -n "@generated|DO NOT EDIT|autogenerated" src/extension/production-composition.ts` — no hits. Spec-mirror check: the seven concerns cite seven independent spec/RFC/bug groups (listed above); no single spec is mirrored once across the whole function. Already-filed check: searched `quality/intake`, `quality/issues`, `quality/resolved` for `runComposePass` — the only hit is this file's own future filing; `PTQ-0322` (the file-level finding covering this same LOC as part of a nine-row, file-scoped inventory) is a different `d9_host` key (the whole file, not `#runComposePass`) and its ratified/pre-announced seams (0, A, B', C) do not include this function's own internal decomposition — confirmed by `theta-callee-tools-verification.ts` and `production-bootstrap.ts` (the pre-announced seam targets) not existing anywhere in the repo. Not a re-export barrel (no re-exports here) and not a husk (the function is the pass's own live logic, not a post-move survivor).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting independently re-verified (size-scan confirms 1045 LOC/strong/0 importers; the 7-concern line-range partition sums exactly to 1045 with no gaps/overlaps; distinct from file-level PTQ-0322, whose executed/pre-announced seams never touch this function's body); target seam is a design decision reserved for human ruling, never confirmed for D9 breakdown (triage: claude-opus-5)
verdict: questionable — re-verified independently against current HEAD, trusting nothing in the file including its own pre-existing Triage line above (whose "size-scan confirms 1045 LOC" claim is stale): size-scan now reports runComposePass at 662-1721, 1060 LOC/strong, not 662-1706/1045; diffing against parent commit 82efa599 confirms the function was exactly 662-1706 (1045 LOC) when this candidate was filed, and unrelated commit 079ddb67 (RFC-0012 §7 child-outcome event, landed after filing) added 15 lines inside concerns 2/5 afterward — small drift, tolerated, and it does not change the 7-concern partition (every excerpt re-checked matches verbatim at the shifted lines), the strong-band classification, or the reasons-considered analysis. Independently re-ran every cited check: quality/exemptions.json has exactly the 2 named D9 keys (neither matches), the generated-code grep returns 0 hits, git log shows 103 commits/no reverts for this file. Dedupe confirmed distinct from file-level PTQ-0322 (its own inventory treats runComposePass as one undecomposed member of a 1093-LOC row; its ratified Seam 0 (production-discovered-theta.ts, commit 7281a593) and pre-announced Seams A/B'/C — theta-callee-tools-verification.ts and production-bootstrap.ts confirmed absent from the repo — never touch this function's own body; the RFC-0012 material in concern 2 postdates PTQ-0322's actual fix commit 7281a593, not 898ca244 as the candidate misattributes — an inaccuracy that does not affect the dedupe conclusion). Target seam remains a design decision for human ruling, never confirmed for D9 breakdown (triage: claude-opus-5)
