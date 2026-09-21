---
id: PTQ-1168
title: spawnSubagentConversation runs nine launch-assembly phases in one 497-LOC method
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:2424-2920
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.spawnSubagentConversation
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# spawnSubagentConversation runs nine launch-assembly phases in one 497-LOC method

## Observation
`ProductionThetaProducer.spawnSubagentConversation` (src/extension/production-theta-producer.ts:2424-2920) is 497 LOC — strong band (threshold 200). It binds a subagent-mode theta by assembling the whole child-process launch contract: model guard, abort derivation, system-prompt render, callable-set marshalling, params/control-plane env assembly, placement + spawn, tap/cancellation attachment, and the drive/teardown closures of the returned binding.

## Evidence
Step inventory (phases, ranges, LOC, locals each phase writes → later readers):

| phase | lines | LOC | locals written (read later by) |
|---|---|---|---|
| chain seed + pre-spawn model guard (PIC-62) | 2427-2463 | 37 | chain (launch, drive), model (placement, launch) |
| thetaAbort derivation + forwarding sources | 2465-2481 | 17 | thetaAbort, forwardingSources (cancellation, finish) |
| system-prompt render + bug-0422 refusal | 2483-2549 | 67 | systemPrompt (launch argv) |
| callable set → allowlist / trust / closure hashes | 2551-2614 | 64 | piToolNames, noHostTools, projectTrust, callableHashes (launch, env) |
| ticket / status bus / entry / label / finishInvocation | 2616-2661 | 46 | ticket, statusBus, entry, label, finishInvocation |
| params marshal + control-plane env assembly | 2663-2708 | 46 | paramValues, marshalled, paramsCleanup, controlPlaneEnv |
| placement resolve + child launch + spawn-failure route | 2710-2795 | 86 | placementLease, placement, presentation, launch, child |
| child-activity tap + cancellation attach | 2797-2830 | 34 | detachChildTap, cancellation (teardown) |
| drive/teardown closures + returned binding | 2832-2920 | 89 | forwardedEnumTagsHolder, lastDriveSource, lastFnTail, toreDown |

Excerpt (2710-2716, the phase boundary into launch):
```ts
    const executableHost = this.#input.subagentExecutableHost;
    const placementResolver = this.#placementResolver();
    if (placementResolver === undefined || executableHost === undefined) {
      paramsCleanup();
      finishInvocation();
      throw new SubagentSpawnFailedError(
```

## Why this is a problem
Strong band (497 LOC ≥ 200): presumption of breakdown; a strong concrete reason is required. Reasons considered and defeated: (a) single algorithm with shared local state — concrete (the table shows ≥10 locals crossing phase boundaries: model, thetaAbort, systemPrompt, piToolNames, callableHashes, ticket, label, paramsCleanup, controlPlaneEnv, placementLease, child) but not strong: the pre-launch phases (model guard, system render, hash marshal, env assembly) are each pure builders whose outputs are single values, so a state object is not required — each phase reads at most 3 prior locals; (b) spec-cited critical section — PIC-22 requires the spawn be *initiated at bind time*, which constrains when `placeSubagentChild` runs, not that the assembly be one body; no cited clause forbids sequential helper seams; (c) measured cost — none cited; (d) prior split reverted — none found; (e) exemptions — no entry for this host in quality/exemptions.json.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: system-prompt render + refusal (2483-2549) -> `#renderChildSystemPrompt` helper — ~67 LOC, no exported symbols, returns `string | undefined` or throws the existing InvokeInfraCauseError. Seam B: callable-set/trust/hash marshalling (2551-2614) -> `#marshalChildCallables` — ~64 LOC, returns { piToolNames, noHostTools, projectTrust, callableHashes }. Seam C: drive/teardown closure construction (2832-2920) -> a `buildSubagentDriveBinding(child, ...)` helper beside `driveSubagentChild` — ~89 LOC, cross-reference back into the host: ticket.settleDisposeBarrier, placementLease.

## False-positive check
Band check: 497 LOC strong (map-quoted; never recounted by hand). Reasons-considered list above with defeating evidence. Exemptions check: no D9 entry for this host. Generated-code check: hand-authored. Spec-mirror check: the body is a sequential assembly, not a switch over a spec-named closed set. Cited ranges re-read this session (offsets 2424-2920).

## Triage
verdict: questionable — accounting verified: size-scan map re-run confirms spawnSubagentConversation 2424-2920 = 497 LOC strong band (FN threshold 200); excerpt at 2710-2716 matches verbatim; the nine-phase inventory re-read and holds (system-prompt render 2483-2549, callable/trust/hash marshalling 2551-2614, placement+launch 2710-2795, and drive/teardown closures 2832-2920 are independent concerns; the pre-launch builders read ≤2 prior locals as claimed); no overlooked strong reason (PIC-22 and RFC 0010 EXST-4 are ordering constraints that helper seams preserve; git -S shows no reverted prior split; no measured cost; no D9 exemption row — the 2026-09-16 REVIEW_LOG KEEP is a D8 ruling); not a duplicate of sibling d9-01 (file-level host key) — the seam shape is a design decision needing a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map reproduces spawnSubagentConversation 2422-2918 = 497 LOC strong (FN threshold 200; 2-line drift from cited 2424-2920), excerpt verbatim at 2708-2714, all nine inventory rows re-read as distinct concerns (model guard / abort derivation / SUBAG-1 render / PIC-58 allowlist+trust+hash / ticket+bus / PIC-60 marshal+env / placement+launch / tap+cancellation / drive+teardown closures); no overlooked strong reason — exemptions.json has no row for this host (only D8 #firstAdmittingArmProperties), git -S on the proposed helper names shows no reverted split, the 2026-09-16 REVIEW_LOG KEEP is a D8 ruling, PIC-22 (subagent.md:277) and EXST-3/4 are initiation/ordering constraints pure-builder seams preserve, and the ≥10 crossing locals are a concrete not strong reason with no spec-pinned critical section (unlike rejected d9-03); not a duplicate of d9-01 (file-level key) or d9-05 (bindPromptConversation) — the seam shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map reproduces spawnSubagentConversation 2422-2918 = 497 LOC band strong (FN threshold 200; 2-line drift from cited 2424-2920), excerpt verbatim at 2708-2714, all nine inventory rows re-read as distinct concerns (guardResolvedModel guard / deriveChildThetaAbort / renderSystemPrompt+bug-0422 refusal / callableSetPiToolNames+inferChildTrust+callableHashes / ticket+statusBus+label+finishInvocation / marshalParams+controlPlaneEnv / placementLease+placeSubagentChild+failure route / attachChildActivityTap+attachSubagentCancellation / drive+teardown closures); no overlooked strong reason — the ~20 crossing locals are a concrete reason only, PIC-22 (subagent.md:277 spawn initiated at bind) and EXST-3 (execution-status.md:13 synchronous publish, unchanged size() transitions) are ordering constraints the pre-ticket builder seams and post-tap closure seam do not cross, quality/exemptions.json holds only D8:...#firstAdmittingArmProperties, git log -S on the three proposed helper names is empty, the 2026-09-16 REVIEW_LOG KEEP is D8; not a duplicate — no quality/issues row names this host, d9-01 is the file-level key, d9-05 is bindPromptConversation, 223212-d9-01 is #driveSubagentFnEntry — which seams to cut is a design decision needing a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
