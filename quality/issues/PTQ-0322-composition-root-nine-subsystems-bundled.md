---
id: PTQ-0322
title: production-composition.ts bundles nine independent load-time subsystems in one 4376-line file
lens: D9
status: open
verdict: confirmed
locations:
  - src/extension/production-composition.ts:1-4376
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/production-composition.ts
d9_band: strong
wave: qw20260914060226
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# production-composition.ts bundles nine independent load-time subsystems in one 4376-line file

## Observation
`src/extension/production-composition.ts` is 4376 LOC — strong band, more than twice the 2000-LOC strong threshold. Its header (lines 1-19) states its role: "the production composition root for the shipped extension… All composition lives here in `src/**`; `extensions/index.ts` stays a thin delegating shim." Despite that one-line charter, the file's ~60 top-level declarations resolve into nine independently-headed subsystems (discovery/compose orchestration, child-callable hash divergence, extension-instance/hot-reload wiring, settings/typed-query gating, `tools:` callee resolution and structural verification, discovered-theta parsing, the capability-probe host and peer-version ladder, the two-tier bootstrap-diagnostic sink, and the schema-slug recipe), several of which are independently documented against their own, different specs (discovery-sources.md, invocation.md, imports.md, binder-model-and-context.md, RFC-0001/0005/0006/0009/0010, capability-probe.md).

## Evidence
Distinct-concern inventory (concern | members | line ranges | LOC):

| concern | members | line ranges | LOC |
|---|---|---|---|
| Discovery + compose-pass orchestration | `ComposeSeamOverrides`, `makeLoadEmit`, `mirrorDiagnosticToStderr`, `makeDeliveryFailedEmit`, `LoadDiagnosticSink`, `sinkOverPerDiagnosticEmit`, `preEvalCauseOf`, `buildRuntimeRoot`, `ComposePassResult`, `discoverAndComposeFixtures`, `canonicalWatchRootIdentity`, `dedupeWatchRootsByIdentity`, `runComposePass` | 197-1434 | 1093 |
| Child-callable divergence verification (RFC-0005) | `deriveCallableName`, `refuseDivergedChildCallables` | 1443-1606 | 154 |
| Extension-instance + hot-reload wiring | `ExtensionInstanceWiring`, `composeExtensionInstance` | 1616-1972 | 347 |
| Settings-path / typed-query load gate | `settingsFilePaths`, `checkThetaTypedQueryProviderSupport` | 1988-2040 | 34 |
| `tools:` callee resolution & structural verification | `resolveCalleeArity`, `TOOLS_DIAGNOSTIC_RANGE`, `CalleeParse`, `ThetaToolsResolution`, `EMPTY_CALLABLE_SET`, `resolveThetaToolsAtLoad`, `captureRootClosureHash`, `collectExtensionToolNames`, `attachLoadTimeClosureHashes`, `toolsEntrySpec`, `isBareToolName`, `parseCalleeForTools`, `onDiskCalleeName`, `calleeFailsOwnStructuralChecksBody`, `calleeFailsOwnStructuralChecksWithTaint`, `calleeFailsOwnStructuralChecks`, `checkNestedToolsContainment`, `collectReservedNames`, `HostToolExecute`, `builtinToolDefinition`, `GetAllToolsSnapshot`, `PiToolLoadEntry`, `resolveRegistryExtensionTool`, `resolvePiTool`, `parseCalleeTheta`, `resolveCallableClosureHash`, `collectCallableClosureSources` | 2049-3791 | 1240 |
| Discovered-theta parse + pi-owned/system-note plumbing | `hasLoadParseError`, `thetaBasename`, `ParsedDiscoveredTheta`, `parseDiscoveredTheta`, `readThetaFlagPaths`, `readPiOwnedCommands`, `buildSystemNoteDeps` | 3799-4030 | 183 |
| Capability-probe host + peer-version ladder (bug 0023 Step 0(d)) | `createProductionProbeHost`, `AUTHORED_PEER_SCOPE`, `PEER_SCOPE_ALIASES`, `readPeerVersion`, `peerPackageJsonCandidates`, `readCandidatePackageJson` | 4044-4216 | 92 |
| Bootstrap diagnostic sink (two-tier) | `BootstrapDiagnosticSink`, `createBootstrapDiagnosticSink`, `emitBootstrapTier1`, `emitBootstrapTier2`, `emitBootstrapTerminal` | 4230-4335 | 85 |
| Production schema-slug recipe | `productionSchemaSlugOf` | 4347-4376 | 30 |

9 rows; the tabulated concerns alone total 3258 of the file's 4376 LOC (74%). The `tools:` callee-verification concern (1240 LOC, 27 members) is by itself larger than this repo's 2000-LOC "strong" *file* threshold's half-way mark, and the discovery/compose-pass concern (1093 LOC) is comparable in size to an entire justify-band file.

Representative excerpt, the file's own charter (lines 1-14):
```ts
// H8a — the production composition root for the shipped extension.
//
// This module is the object graph the per-leaf gates verified only in isolation:
// at `session_start` it constructs the `H3a` runtime root over the real host
// seams (`V8b` `PiFileSystem`, `V8c` `AjvSchemaValidator`, `V8d`
// `WallClock`/`CryptoIdSource`, `V8e` `PiFileWatcher`/`PiTokenEstimator`), runs
// the five-source discovery walk (`V10a` union + `V10b` package source over the
// `V10c` merged settings), parses each discovered `.theta` (`V19a`), and maps it
// to a runnable `H4a` `ThetaFixture` via the `V19e` composition producer. The
// `factory.ts` `session_start` handler registers each returned fixture through
// `pi.registerCommand`, so the shipped extension discovers, registers, and runs
// `.theta` slash commands.
```
The charter names one job (build the runtime root, discover, parse, compose). It does not mention peer-version resolution, a two-tier bootstrap sink, or the ~1240-LOC `tools:` structural-verification cluster, each of which is independently spec-cited (capability-probe.md Step 0(d) for the peer-version ladder at lines 4131-4172; RFC-0005 `#subagent-theta-callable-hash` for the divergence check at lines 1456-1606) against a different document than the charter's own three (extension-bootstrap-and-per-theta.md, registration-steps.md, discovery.md).

## Why this is a problem
Strong band (4376 LOC): filed unless a strong concrete reason is on record. Reasons considered and defeated:
- Closed-enumeration dispatch — no. There is no single switch/if-chain over one spec-named closed set spanning the file; the nine concerns cite at least seven different spec documents (discovery-sources.md, invocation.md, imports.md, binder-model-and-context.md, capability-probe.md, RFC-0005, RFC-0006), each governing its own concern, not one enumeration.
- Single algorithm with shared local state — no. The nine concerns do not share locals with each other: the peer-version ladder's `moduleDir`/`hostSdkVersion` never reach the discovery walk; the bootstrap-sink's `latched` closure never reaches `runComposePass`. Local-state sharing exists only *within* single functions (already separately dispositioned at the function level, e.g. `runComposePass`, `composeExtensionInstance`).
- Data-only module or type family — no. Of the ~60 declarations, the vast majority are functions containing imperative logic (parsing, diagnostics, hashing, spawning helpers), not type declarations or literal tables; interfaces are a small minority of the tabulated LOC.
- One grammar production family — no. This is composition/admission/bootstrap logic, not a parser production.
- Generated or mechanically derived code — no. `grep -n "@generated|DO NOT EDIT|autogenerated"` across all three shard files returns no hits; every function carries hand-authored, bug-numbered rationale.
- Strong-only: spec-cited single critical section / ordered step sequence spanning the whole file — no. The file cites *multiple, independent* spec documents for *different* concerns (see above); there is no single ordered sequence that spans, say, the peer-version ladder and the discovery walk — they do not call each other.
- Strong-only: measured cost a seam would reintroduce — none cited for keeping the file whole.
- Strong-only: prior split reverted — none found; `git log --oneline --follow` on this path shows only feature/bugfix additions and D2 dead-code passes, no split-then-revert.
- Strong-only: human ruling on record — `quality/exemptions.json` carries no `D9:src/extension/production-composition.ts` key.

## Suggested direction (non-binding, optional)
Seam hypotheses, unproven, for the human to ratify:
- Seam A: the `tools:` callee-resolution & structural-verification concern (1240 LOC, 27 members, lines 2049-3791) -> a new module, e.g. `src/extension/theta-callee-tools-verification.ts` (hypothesis). All 27 members are currently module-private (0 external importers each per the structural map); extraction would export only the subset `runComposePass`/`composeExtensionInstance`/`parseCalleeTheta` still call across the new boundary, with call sites back into the host for the shared `parseDeps`/`ctx`/`fs` seams already threaded as parameters today.
- Seam B: the capability-probe host + peer-version ladder + bootstrap-diagnostic sink + schema-slug recipe (lines 4044-4376, 292 LOC combined) -> a `src/extension/production-bootstrap.ts` (hypothesis), grouped because all four are bug-0023/capability-probe.md bootstrap-time concerns consumed by `factory.ts` (`createBootstrapDiagnosticSink`, 1 src importer today) and `capability-probe.ts` (via the `ProbeHost` interface `readPeerVersion` populates), not by the per-pass discovery/compose loop.
- Seam C: the child-callable divergence check (`deriveCallableName` + `refuseDivergedChildCallables`, lines 1443-1606, 154 LOC) -> alongside Seam A or its own module, since it already only calls `readMarshalledCallableHashes`/`verifyChildCallableHashes` from `../runtime/subagent-child-hash-verify` and `collectCallableClosureSources` (itself part of Seam A).

## False-positive check
Band: strong (4376 LOC, file top-line in the structural map). Reasons-considered list above, each defeated with a cited count or search. Exemptions check: `quality/exemptions.json` read in full — two keys present (`binder-system-prompt.ts#normaliseParamLineBreaks`, `discovery/package-discovery.ts`), neither matches this file. Generated-code check: `grep` for generation markers across the shard's three files returned no hits. Spec-mirror check: the file's own header cites three specs for its stated charter; the nine tabulated concerns collectively cite at least seven *additional, independent* spec/RFC documents — confirming multiple distinct facilities rather than one spec's closed enumeration mirrored once. Not a re-export barrel (no re-export statements; every declaration is authored logic) and not a husk (every concern has live production callers via `factory.ts` / `capability-probe.ts` / the file's own `runComposePass`).

## Triage
verdict: questionable — accounting verified: size-scan confirms 4376 LOC/strong band and all 65 declarations partition exactly into the 9 tabulated concerns (per-row LOC sums reproduce exactly, totaling 3258/4376); each concern independently cites a distinct spec (RFC-0005, capability-probe.md Step 0(d), bug-0023, PIC-11, bug-0010) and call-graph checks show orchestrator-calls-service edges only, no cross-concern shared locals; bug-0276's D8 "measured data" KEEP note guards only intra-function memoization soundness, not a file-split cost, so no reasons-considered item was overlooked; target shape is a human design call, never confirmed for D9 breakdown (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): Seam 0 (the leaf), not the filing's A/B/C. Move concern 6 MINUS buildSystemNoteDeps - hasLoadParseError, thetaBasename, ParsedDiscoveredTheta, parseDiscoveredTheta, readThetaFlagPaths, readPiOwnedCommands (production-composition.ts :3799-4030 less the buildSystemNoteDeps declaration, ~140 LOC, all file-private today, 0 external importers) - verbatim into a new module src/extension/production-discovered-theta.ts that EXPORTS them and imports NOTHING from production-composition.ts; production-composition.ts imports them back (no barrel needed - nothing outside the file imported them). buildSystemNoteDeps stays in the host because it reads makeDeliveryFailedEmit (concern 1) - moving it would create the cycle this seam exists to avoid. Reason for the order: Seam A (tools verification, 1240 LOC) reads hasLoadParseError / thetaBasename and Seam C's deriveCallableName at runtime while the host calls eight of A's members, so A first is a host <-> module import cycle; Seam B reads makeLoadEmit and buildSystemNoteDeps while the host uses productionSchemaSlugOf - a cycle as filed. PRE-ANNOUNCED, not ratified: next wave Seams A+C together -> theta-callee-tools-verification.ts (cycle-free after this seam), then B' (probe host + peer ladder + bootstrap sink, WITHOUT productionSchemaSlugOf) -> production-bootstrap.ts with factory.ts re-pointed. Header comment on the new module; no logic edits; tsc first; report before/after LOC.
