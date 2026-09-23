---
id: PTQ-1288
title: spawnSubagentConversation remains 282 LOC across seven launch phases after the PTQ-1168 extraction
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:2449-2730
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.spawnSubagentConversation
d9_band: strong
wave: qw20260922164435
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# spawnSubagentConversation remains 282 LOC across seven launch phases after the PTQ-1168 extraction

## Observation
`ProductionThetaProducer.spawnSubagentConversation` (src/extension/production-theta-producer.ts:2449-2730) is 282 LOC — still strong band (threshold 200) after PTQ-1168's fix extracted `#deriveInvocationAbort`, `#renderChildSystemPrompt`, `#marshalChildCallables`, and `buildSubagentDriveBinding`. The residual body still assembles the whole child-process launch in-line: model guard, ticket/bus/label bookkeeping, params + control-plane env marshalling, placement + spawn + failure routing, and tap/cancellation attachment.

## Evidence
Fresh step inventory (anchors re-read at filing time):

| phase | lines | LOC | locals written (read later by) |
|---|---|---|---|
| chain seed + PIC-62 pre-spawn model guard | 2452-2488 | 37 | chain (launch depth), model (guard, placement, launch argv) |
| extracted-helper delegation (abort, system prompt, callables) | 2490-2503 | 14 | thetaAbort, forwardingSources, systemPrompt, piToolNames, noHostTools, projectTrust, callableHashes, emitDiagnostic |
| ticket / status bus / entry / respond names / label / finishInvocation | 2505-2550 | 46 | ticket, statusBus, entry, respondToolNames, label, finished, finishInvocation |
| params marshal + control-plane env assembly | 2552-2604 | 53 | paramValues, marshalled, paramsCleanup, parentEnv, controlPlaneEnv |
| placement resolve + child launch argv + spawn-failure route | 2606-2690 | 85 | executableHost, placementResolver, placementLease, placement, presentation, launch |
| placed-notice + child-activity tap + cancellation attach | 2691-2724 | 34 | child, detachChildTap, cancellation |
| drive-binding delegation | 2726-2730 | 5 | — (returns buildSubagentDriveBinding(...)) |

Excerpt (2726-2730, the residual tail already delegating):
```ts
    return buildSubagentDriveBinding({
      child, thetaAbort, theta, emitDiagnostic, detachChildTap, placementLease,
      paramsCleanup, cancellation, ticket, root, finishInvocation,
    });
```

## Why this is a problem
Strong band (282 LOC ≥ 200): presumption of breakdown; a strong concrete reason is required. Reasons considered and defeated: (a) single algorithm with shared local state — ~20 locals do cross phases (chain, model, thetaAbort, ticket, label, paramsCleanup, controlPlaneEnv, placementLease, launch, child, ...), but PTQ-1168's own triage record already ruled this "a concrete not strong reason" for this exact host; (b) spec-cited critical section — PIC-22 (spawn initiated at bind) and EXST-4 (synchronous prologue ordering) are ordering constraints; the two heaviest remaining phases (params/env assembly 2552-2604 and launch argv assembly 2606-2690) are pure builders that a seam would not interleave — the same adjudication PTQ-1168's confirmed triage recorded; (c) measured cost — none cited anywhere in the body; (d) prior split reverted — the opposite: the PTQ-1168 extraction landed (497 → 282 LOC) and stuck; (e) exemptions — no D9 row for this host in quality/exemptions.json.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: params marshal + control-plane env (2552-2604) -> `#buildControlPlaneEnv` helper (hypothesis) — ~53 LOC, 0 exported symbols, 0 external importers, cross-refs back: reads callableHashes, theta.sourcePath, `#paramsMarshalDeps`. Seam B: placement resolve + launch argv (2606-2690) -> `#launchSubagentChild` helper (hypothesis) — ~85 LOC, 0 exported symbols, cross-refs back: reads model, systemPrompt, piToolNames, respondToolNames, label, entry, controlPlaneEnv, chain.depth. None identified yet for the ticket/bus phase (EXST-4 pins it to the synchronous prologue).

## False-positive check
Band check: 282 LOC strong (map-quoted). Reasons-considered list above, each with defeating evidence; the strong-reason candidates (PIC-22, EXST-4) were already adjudicated non-blocking in PTQ-1168's confirmed triage. Exemptions check: quality/exemptions.json has no row for this host key. Generated-code check: hand-authored. Spec-mirror check: the body cites PIC-58/60/62/65/66 and RFC 0012 — a launch contract spanning several clauses, not one closed enumeration. Duplicate check: PTQ-1168 (same host key) is resolved/fixed — this is the post-fix residual with a fresh seven-phase inventory; no pending intake filing names this host.

## Triage
verdict: questionable — accounting verified: size-scan map re-run reproduces spawnSubagentConversation 2449-2730 = 282 LOC band strong (FN threshold 200); the tail excerpt is verbatim at 2726-2730; all seven inventory rows re-read at the cited ranges as distinct concerns (model guard / three extracted-helper calls / ticket+bus+label+finishInvocation / marshalParams+controlPlaneEnv / placementLease+placeSubagentChild+failure route / placed-notice+tap+cancellation / drive-binding return), with a clean one-way hand-off between the two heavy rows (controlPlaneEnv written once at 2593, read once at 2659); no overlooked reason — quality/exemptions.json has only the D8 #firstAdmittingArmProperties row for this file, git log -S on buildControlPlaneEnv is empty and the launchSubagentChild hits are subagent-launcher.ts's own launcher not a reverted extraction, PIC-22/EXST-4 are ordering constraints already adjudicated non-blocking in PTQ-1168's triage, and the ~20 crossing locals are concrete-only; not a duplicate — PTQ-1168 (same host key) is resolved/fixed with a batch-ratified accept carrying no keep-whole note for the residual, and sibling d9-01 is the file-level key — the residual seam shape is a design decision needing a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run reproduces spawnSubagentConversation at 2447-2728 = 282 LOC band strong (2-line drift from cited 2449-2730, FN threshold 200); the tail excerpt is verbatim at 2724-2728; all seven inventory rows re-read at the cited ranges as distinct launch phases with a linear one-way hand-off (model guard → three extracted-helper calls → ticket/statusBus/entry/respondToolNames/label/finishInvocation → paramValues/marshalled/paramsCleanup/controlPlaneEnv → placementLease/placeSubagentChild + two failure routes → placed-notice/tap/cancellation → buildSubagentDriveBinding return), no try/finally critical section wrapping them (unlike the rejected #driveUserVisibleTurn d9-04); the ≥6 crossing locals are acknowledged in reason (a) and are a concrete not strong reason — insufficient at strong band — and PTQ-1168's human-ratified accept on this exact host stands as the precedent; no overlooked strong reason: quality/exemptions.json holds only D8:#firstAdmittingArmProperties for this file, git log -S buildControlPlaneEnv is empty and the launchSubagentChild hits (c7a47d17, fda23a4b) are feature landings not a reverted split, PIC-22/EXST-4 are ordering constraints, no measured cost, the 2026-09-16 REVIEW_LOG KEEP is D8; not a duplicate — PTQ-1168 is resolved/fixed (497→282), d9-01 is the file-level key, qw20260922173443-d8-01 is a D8 normalizePath claim on one line of this body (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
