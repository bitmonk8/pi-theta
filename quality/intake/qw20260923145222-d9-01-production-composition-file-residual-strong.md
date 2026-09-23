---
id: pending
title: production-composition.ts is 5157 LOC (strong band) and PTQ-0322's pre-announced Seams A+C and B' never landed
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:1-5157
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/production-composition.ts
d9_band: strong
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# production-composition.ts is 5157 LOC (strong band) and PTQ-0322's pre-announced Seams A+C and B' never landed

## Observation
The structural map places src/extension/production-composition.ts at 5157 LOC,
band strong (file threshold >= 2000), with 76 declarations. Its header names it
"the production composition root for the shipped extension" — the object graph
constructed at `session_start`. PTQ-0322 (resolved) ratified only Seam 0
(production-discovered-theta.ts, landed) and PRE-ANNOUNCED "next wave Seams A+C
together -> theta-callee-tools-verification.ts ... then B' (probe host + peer
ladder + bootstrap sink, WITHOUT productionSchemaSlugOf) ->
production-bootstrap.ts with factory.ts re-pointed". Neither module exists at
HEAD (`ls src/extension | grep -c "theta-callee-tools-verification\|production-bootstrap"` = 0),
and the file has since grown 4376 -> 5157 LOC.

## Evidence
Distinct-concern inventory (LOC from the map's per-declaration column; members
abbreviated to the anchors):

| concern | members | line ranges | LOC |
|---|---|---|---|
| load-diagnostic emit/sink plumbing | makeLoadEmit, mirrorDiagnosticToStderr, makeDeliveryFailedEmit, LoadDiagnosticSink, sinkOverPerDiagnosticEmit, PreEvalFailureCause, preEvalCauseOf, makeLoadNoteSink | 324-482, 2662-2729 | 167 |
| compose-pass orchestration | buildRuntimeRoot, ComposePassResult, discoverAndComposeFixtures, dedupeWatchRootsByIdentity (+identity helper), PassClosureDeps, runComposePass, buildPassPlacement, buildDispatchLadder, resolvePassInputs, buildProducerDeps | 491-1713 | 1113 |
| per-theta load gates | ComposeOneThetaDeps, composeOneTheta | 1722-2121 | 387 |
| child callable-hash refusal | deriveCallableName, MarshalledCallableAlignment, alignMarshalledCallables, applyHashRefusals, refuseDivergedChildCallables | 2130-2337 | 167 |
| extension-instance wiring / hot reload | ExtensionInstanceWiring, composeExtensionInstance (incl. installHotReload closure), wireRunCardSink, dialParentResultChannel, settingsFilePaths | 2347-2830 | 363 |
| callee `tools:` verification family | resolveCalleeArity/ReturnType, CalleeParse, ThetaToolsResolution, checkSessionToolAvailability, checkThetaTypedQueryProviderSupport, resolveThetaToolsAtLoad, drainCalleeDiagnostics, captureRootClosureHash, collectExtensionToolNames, attachLoadTimeClosureHashes, parseCalleeForTools, onDiskCalleeName, CalleeToolsEntryJudgement, judgeCalleeToolsEntries, resolveCalleeOwnCallableVerdict, calleeFailsOwnStructuralChecks{Body,WithTaint,}, probeNestedToolsContainment, checkNestedToolsContainment, collectReservedNames, parseCalleeTheta, resolveCallableClosureHash, collectCallableClosureSources | 2850-4771 | 1383 |
| system-note channel deps | buildSystemNoteDeps | 4780-4811 | 32 |
| probe host + peer version ladder | createProductionProbeHost, AUTHORED_PEER_SCOPE, PEER_SCOPE_ALIASES, readPeerVersion, peerPackageJsonCandidates, readCandidatePackageJson | 4825-4997 | 92 |
| bootstrap diagnostic sink | BootstrapDiagnosticSink, createBootstrapDiagnosticSink, emitBootstrapTier1/2/Terminal | 5011-5116 | 85 |
| production schema slug | productionSchemaSlugOf | 5128-5157 | 30 |

PTQ-0322's ratification note (quality/resolved/PTQ-0322-...md ## Triage,
re-read before filing): "PRE-ANNOUNCED, not ratified: next wave Seams A+C
together -> theta-callee-tools-verification.ts (cycle-free after this seam),
then B' (probe host + peer ladder + bootstrap sink, WITHOUT
productionSchemaSlugOf) -> production-bootstrap.ts with factory.ts
re-pointed." Neither file exists in src/extension/ at HEAD.

## Why this is a problem
Strong band: presumption of breakdown; a strong concrete reason is required to
keep whole. Reasons considered: (1) closed-enumeration dispatch — no; the file
is ten independent facilities, not one spec-table switch. (2) single algorithm
with shared local state — holds only inside individual functions, not across
the concern clusters: the callee-verification family (1383 LOC) shares no
local with the bootstrap sink or the peer ladder; PTQ-0322 triage already
verified "orchestrator-calls-service edges only, no cross-concern shared
locals". (3) data-only — no (functions dominate). (4) generated — 0
`@generated`/`DO NOT EDIT` hits. (5) spec-cited critical section — the cited
invariants (Decision 6 B1/B2, EXST-2, PIC-59) pin construct-once identity of
values, not co-residence of the ten clusters. (6) exemptions.json — four keys,
none for this file. (7) prior split reverted — none; Seam 0 landed and stuck
(production-discovered-theta.ts exists with this shard's map showing live
importers), which is evidence the ratified direction works, not that it is
done.

## Suggested direction (non-binding, optional)
Seam A: the callee `tools:` verification family -> theta-callee-tools-verification.ts
(hypothesis; PTQ-0322's pre-announced A+C) — 1383 LOC, exported symbols moved:
none used outside the file today (checkSessionToolAvailability 0/1 and
checkThetaTypedQueryProviderSupport 0/1 importers are tests), cross-references
back into the host: parseViaPassCache/PassClosureDeps types. Seam B: probe
host + peer ladder + bootstrap sink -> production-bootstrap.ts (hypothesis;
pre-announced B') — 177 LOC, exported symbols createProductionProbeHost (1/2),
readPeerVersion (0/3), createBootstrapDiagnosticSink (1/3); factory.ts
re-pointed. Seam C: the child callable-hash refusal cluster -> its own module
(hypothesis) — 167 LOC, 0 exported symbols moved, references back to
parseDeps/canonicalizePath. All unproven; the human ratifies.

## False-positive check
Band: strong (5157 >= 2000, map-quoted). Reasons-considered list above with
defeating evidence per item. Exemptions check: quality/exemptions.json has
four keys, none for this file. Generated-code check: grep for
`@generated|DO NOT EDIT` in the file — 0 hits. Spec-mirror check: no
closed-enumeration table spans the concern clusters. Duplicate check:
`grep -rl production-composition quality/issues quality/intake` — 0 open rows;
PTQ-0322 is resolved (fixed, Seam 0 only), so this is a residual filing per
the PTQ-1438/1439 precedent, not a re-litigation.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 5157 LOC / band strong (file threshold 2000) and every declaration/LOC in the ten-row inventory matches the map's per-declaration column (importer counts 0/1, 1/2, 0/3, 1/3 included); PTQ-0322's ## Triage pre-announcement quote is verbatim and neither theta-callee-tools-verification.ts nor production-bootstrap.ts exists in src/extension/ (only production-discovered-theta.ts landed); the rows are real distinct concerns — no module-level `let`/`var`, only four module consts each private to one cluster, and cross-cluster edges are orchestrator→service (host calls resolveThetaToolsAtLoad/refuseDivergedChildCallables/etc. at 629-2053; the tools family reaches back only for the PassClosureDeps type, the imported parseViaPassCache, and Seam C's deriveCallableName, matching PTQ-0322's A+C-together ruling); 0 @generated/DO NOT EDIT hits, exemptions.json's four keys name no production-composition host, and no open issue/intake row is file-level for this host (the three sibling intake files and PTQ-1438/1439 are function-level); the seam shape (note Seam B's bootstrap sink still reads makeLoadEmit/buildSystemNoteDeps at 5021/5045) is a design decision for the human to ratify (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces 5157 LOC / band strong (file strong ≥ 2000) and the declaration ranges and importer counts in the inventory (tools family 3014-4771, buildSystemNoteDeps 4780-4811, probe/peer 4825-4997, bootstrap sink 5011-5116, productionSchemaSlugOf 5128-5157); PTQ-0322's PRE-ANNOUNCED Seams A+C / B' quote is verbatim and neither theta-callee-tools-verification.ts nor production-bootstrap.ts exists (only production-discovered-theta.ts landed); there is no module-level let/var, so the clusters share no mutable state; 0 @generated/DO NOT EDIT hits; exemptions.json's four keys do not cover this host; no open issue carries this file-level d9_host (the sibling intake files are function-level); no overlooked strong reason; the bootstrap sink still reads makeLoadEmit/buildSystemNoteDeps (5045), so the seam order is a design decision (triage: claude-opus-5-5)
