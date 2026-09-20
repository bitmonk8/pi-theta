---
id: pending
title: subagent-launcher.ts bundles seven launch-pipeline concerns at 1105 LOC (justify band)
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/subagent-launcher.ts:1-1105
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/runtime/subagent-launcher.ts
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# subagent-launcher.ts bundles seven launch-pipeline concerns at 1105 LOC (justify band)

## Observation
`src/runtime/subagent-launcher.ts` is 1105 LOC (justify band). Its header names its role as "the child-process launch half of the RFC-0006 subagent drive": "the executable-resolution ladder …, argv assembly …, the env marshalling …, and the spawn seam" (lines 1-20). The file in fact also hosts the host-CLI dialect table, the placement-backend integration path, and the spawn-failure dual routing — concerns the header does not list. `subagent-placement.ts` imports three type declarations back out of this file (`ChildExitInfo`, `SpawnFn`, `SubagentChildProcess`, its line 20) while this file imports nine symbols from `subagent-placement.ts` (lines 31-40) — a module cycle.

## Evidence
Distinct-concern inventory (line ranges and per-declaration LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| diagnostic-code and env-key constants | SUBAGENT_EXECUTABLE_UNRESOLVED_CODE/_MESSAGE, SUBAGENT_SPAWN_FAILED_CODE, SUBAGENT_PARENT_PID_ENV, SUBAGENT_EXTENSION_PIN_ENV, SUBAGENT_INVOKE_DEPTH_ENV, SUBAGENT_LAUNCH_ENTRY_ENV, SUBAGENT_LAUNCH_FLAG | 53-129 | 9 |
| executable resolution and trust inference | ExecutableHost, ExecutableResolution, resolveSubagentExecutable, inferChildTrust | 136-233 | 51 |
| host CLI dialect table | HostCliDialect, PI_CLI_DIALECT, OMP_CLI_DIALECT, OMP_CONFIG_DIR_NAME, resolveHostCliDialect | 277-350 | 31 |
| argv assembly | SubagentArgvInput, assembleSubagentArgv, assembleVisibleTail | 353-564 | 178 |
| child env assembly | SUBAGENT_CONTROL_PLANE_ENV_KEYS, SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS, buildSubagentChildEnv | 594-676 | 50 |
| child-process contract and spawn seam | ChildExitInfo, SubagentChildProcess, SpawnFn, SubagentLaunchRequest, SubagentLaunchDeps, SubagentLaunchResult, PreparedSubagentLaunch, prepareSubagentLaunch, spawnFailedDiagnostic, launchSubagentChild | 683-945 | 204 |
| placement integration and spawn-failure routing | toPlacementRequest, OpenedSubagentWire, SubagentPlacementDeps, placeSubagentChild, SpawnFailureRoutingDeps, routeSubagentSpawnFailure | 948-1105 | 114 |

The concerns do not share state: `resolveSubagentExecutable` (188-197) reads only its `ExecutableHost` argument; `assembleSubagentArgv` (453-549) reads only `SubagentArgvInput` + `HostCliDialect`; `buildSubagentChildEnv` (643-676) reads only env/pid/depth arguments; `placeSubagentChild` (1005-1051) composes the others through `prepareSubagentLaunch`. Cycle excerpt (subagent-placement.ts:20):

```ts
import type { ChildExitInfo, SpawnFn, SubagentChildProcess } from "./subagent-launcher";
```

and subagent-launcher.ts:31-40 imports `createPipePlacementBackend, PIPE_PLACEMENT_NAME, THETA_LAUNCH_ENTRY, PlacedChild, SubagentLaunchEntry, SubagentPlacementBackend, SubagentPlacementPresentation, SubagentPlacementRequest` from `./subagent-placement`.

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole is found. Reasons considered and defeated: (1) closed-enumeration dispatch — no; the file is seven independent declaration clusters, not one switch mirroring a spec set. (2) Single algorithm with shared local state — no; the clusters exchange data only through the exported `PreparedSubagentLaunch`/`SubagentLaunchRequest` types, no shared locals. (3) Data-only module — no; function/interface bodies dominate (assembleSubagentArgv alone is 97 LOC, prepareSubagentLaunch 48, placeSubagentChild 47). (4) One grammar production — not a parser. (5) Generated code — hand-written. The header's own concern roster (resolution / argv / env / spawn) already names four concerns, and the placement-integration and dialect clusters are additions beyond that roster; the launcher↔placement import cycle is a mechanical symptom of the child-process contract types living in the wrong cluster.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: argv assembly + CLI dialect (277-564) -> `subagent-argv.ts` (hypothesis) - ~209 declaration LOC, exports moved: HostCliDialect (0/1), PI_CLI_DIALECT (0/5), OMP_CLI_DIALECT (0/1), resolveHostCliDialect (0/1), SubagentArgvInput (0/1), assembleSubagentArgv (0/5); cross-references back into host: SUBAGENT_LAUNCH_FLAG. Seam B: child-process contract types (ChildExitInfo, SubagentChildProcess, SpawnFn, 683-733) -> `subagent-child-process.ts` (hypothesis) - ~43 LOC, exports moved: ChildExitInfo (4/10), SubagentChildProcess (6/10), SpawnFn (2/6); no cross-references back — this dissolves the launcher↔placement cycle. Seam C: placement integration + spawn-failure routing (948-1105) -> `subagent-place.ts` (hypothesis) - ~114 LOC, exports moved: placeSubagentChild (1/2), routeSubagentSpawnFailure (1/1), OpenedSubagentWire (2/1); cross-references back: prepareSubagentLaunch, spawnFailedDiagnostic, launchSubagentChild.

## False-positive check
Band: 1105 LOC, justify per the structural map — presumption applies. Reasons-considered list: all five concrete reason classes checked and defeated above. Exemptions check: `grep -n "subagent" quality/exemptions.json` — no hit; no human ruling on this host. Generated-code check: hand-authored (RFC/bug commentary throughout; no generator banner). Spec-mirror check: the argv sequence mirrors RFC-0006 #subagent-launch-contract, but that covers only the assembleSubagentArgv function, not the file's seven clusters. Duplicate check: no existing PTQ or wave filing targets this file's breakdown (PTQ-0512/0583 are test-side; qw20260920202922-d9-07 targets driveSubagentRootRegime in production-theta-producer).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 1105 LOC / justify band; all seven inventory rows exist at the cited ranges and exchange data only via exported types (no module-level state, no shared locals); header roster (resolution/argv/env/spawn, lines 3-9) omits the dialect table (277-350) and placement/routing clusters (948-1105); launcher↔placement cycle real (placement.ts:20 type import vs launcher.ts:31-40, eight symbols not nine — immaterial); type/data LOC ≈ 280 of ~800 declaration LOC, well under 80 %; no exemption (grep quality/exemptions.json exit 1), no reverted prior split in git history, no prior PTQ/intake on this host — target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map reproduces src/runtime/subagent-launcher.ts at 1104 LOC / band justify (filing says 1105, one-line drift); all seven inventory rows are real top-level declaration clusters at the cited ranges (constants 53-129, resolution 136-233, dialect 277-350, argv 353-564, env 594-676, child-process contract + spawn 683-945, placement/routing 948-1104) with no module-level mutable state and no shared locals — data flows only via exported types; header roster at lines 3-9 names resolution/argv/env/spawn and omits the dialect table and placement/routing clusters; launcher↔placement cycle reproduces (placement.ts:20 imports 3 types; launcher.ts:31-40 imports 8 symbols, not 9 — immaterial); type/data ≈ 282 of ≈ 636 declaration LOC (~44 %, under 80 %); no exemption (grep quality/exemptions.json exit 1), no reverted prior split in git history, no spec clause pinning the module whole, no prior D9 filing on this host (all prior PTQs on the file are D2/D7) — breakdown shape is a design decision for a human ruling (triage: claude-fable-5-1)
