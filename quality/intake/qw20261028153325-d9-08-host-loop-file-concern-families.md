---
id: pending
title: production-host-loop-dispatch.ts contains capability probes, bridge message codecs, and dispatch lifecycle wiring
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-host-loop-dispatch.ts:1-656
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/production-host-loop-dispatch.ts
d9_band: zone
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# production-host-loop-dispatch.ts contains capability probes, bridge message codecs, and dispatch lifecycle wiring

## Observation
The authoritative map gives this file 656 LOC, zone band (file threshold 600, no presumption). Its header says it wires the three PIC-64 host-loop dispatch collaborators against the real Pi surface. The mapped declarations include capability checks, message decoding/result conversion, structural SDK types, and dispatch orchestration. Importer counts quoted from the map are createProductionHostLoopDispatch 1/1, probeHostLoopSurfaces 1/1, probeGetToolDefinitionSurface 1/1, HostLoopPi 0/2, HostLoopCtx 0/2, and HostLoopDispatchHost 0/1 (src/tests).

## Evidence
Distinct-concern inventory; LOC are sums of the authoritative per-declaration LOC, not a recount of the file. The inventory accounts for selected declaration families; header comments and inter-declaration material are not assigned to rows.

| concern | members | line ranges | LOC |
|---|---|---|---:|
| Pi capability surfaces | probeHostLoopSurfaces, probeGetToolDefinitionSurface | 195-238; 254-260 | 51 |
| bridge request and assistant messages | DecodedRequest, messageText, findEncodedRequest, newAssistantOutput | 263-266; 269-285; 288-308; 311-329 | 61 |
| tool-result conversion | mapResultBlocks, noResult | 332-351; 359-369 | 31 |
| dispatch lifecycle | createProductionHostLoopDispatch, confirmIdle | 389-643; 650-656 | 262 |
| structural host and provider contracts | BridgeModelConfig, BridgeProviderConfig, HostLoopPi, HostLoopSessionEntry, HostLoopCtx, HostLoopDispatchHost | 102-112; 115-122; 130-148; 151-159; 168-177; 180-185 | 63 |
| bridge constants and stream contract | BRIDGE_PROVIDER_STEM, BRIDGE_MODEL_ID, BRIDGE_API, REQUEST_MARKER, IDLE_POLL_INTERVAL_MS, IDLE_POLL_BOUND, EventStream, BridgeStreamFn | 63; 66; 75; 78; 81; 84; 87; 90-94 | 12 |


`src/extension/production-host-loop-dispatch.ts:195-207`:
```ts
export function probeHostLoopSurfaces(host: {
  readonly pi: unknown;
  readonly ctx: unknown;
}): boolean {
  const pi = host.pi as Record<string, unknown> | null | undefined;
  const ctx = host.ctx as Record<string, unknown> | null | undefined;
  if (pi === null || pi === undefined || ctx === null || ctx === undefined) {
    return false;
  }
  const piFns = [
    "registerProvider",
    "unregisterProvider",
    "setActiveTools",
```

`src/extension/production-host-loop-dispatch.ts:288-297`:
```ts
function findEncodedRequest(context: Context, marker: string): DecodedRequest | undefined {
  for (let i = context.messages.length - 1; i >= 0; i--) {
    const message = context.messages[i];
    if (message === undefined || message.role !== "user") {
      continue;
    }
    const text = messageText(message.content);
    const idx = text.indexOf(marker);
    if (idx >= 0) {
      // A malformed payload is treated as "no request" (the turn ends `stop`);
```

## Why this is a problem
The zone band does not presume breakdown; the evidence is the separate capability, codec, conversion, and lifecycle families above. The capability probes consume unknown host surfaces and report availability, while the codec functions consume messages/markers and produce protocol values; neither requires the dispatcher's pendingSettle/tail/nonceCounter state. Shared-state algorithm therefore does not account for the whole module. PIC-64 in docs/spec_topics/pi-integration-contract/subagent.md:202 names the host-loop wiring (a)-(f), but the availability probes and codecs are not switch arms over that list. The functions perform runtime checks and stream orchestration, so a data-only/type-family or grammar-production reason does not account for the module. No generator, measured seam cost, reverted split, or human exemption is evidenced.

## Suggested direction (non-binding, optional)
All hypotheses are unproven. Seam A: bridge message and result helpers (DecodedRequest, messageText, findEncodedRequest, newAssistantOutput, mapResultBlocks, noResult) -> production-host-loop-messages.ts (hypothesis) - 92 mapped declaration LOC, 0 exported symbols moved, external importers 0/0 for these currently private declarations, cross-references back into host: none; callers remain in the provider stream and result-readback closures. Seam B: probeHostLoopSurfaces and probeGetToolDefinitionSurface -> production-host-loop-probes.ts (hypothesis) - 51 mapped LOC, 2 exported symbols moved, external importers 1/1 and 1/1 respectively, cross-references back into host: none (both take unknown structural carriers). Human ratification is required.

## False-positive check
Band check: zone, 656 LOC, with more than two concerns inventoried. Reasons-considered: shared state, closed enumeration, data/type family, grammar, and strong-reason candidates are addressed above. Spec-mirror check: PIC-64:202 governs ordering and lifecycle, not a short-arm closed dispatch spanning the module. Placement and husk checks: the header's real-Pi adapter role agrees with extension/ placement; this is an implementation module, not a post-move re-export shell or deliberate facade. No counted foreign-host affinity or payload-loss evidence warrants a misplacement/husk filing. Exemptions check: quality/exemptions.json has no entry for this host. Generated-code check: `rg -n '@generated|DO NOT EDIT' src/extension/production-{composition,host-loop-dispatch}.ts` returned no matches; the file header describes the shipped production adapter. History check: `git log --format='%h %s' -- src/extension/production-composition.ts src/extension/production-host-loop-dispatch.ts | grep -i revert` returned no matches. Duplicate check: no prior d9_host entry names this host in quality/issues, quality/resolved or quality/intake at review time. The human-deferred D1 snapshot/restore-versus-runtime-windows topic is not re-filed: this report alleges no failure-path defect and proposes no change to snapshot/restore semantics. Every cited range was re-read immediately before filing.

## Triage
verdict: questionable — Accounting verified: size-scan reproduces 656 LOC, zone band, declaration ranges, inventory totals and importer counts; capability probes and message/result helpers do not share the dispatch closure's mutable state. PIC-64 pins lifecycle behavior, not co-location of those helpers; no host exemption or same-root-cause finding was found. Whether these families warrant separate modules needs a human ruling. (triage: claude-opus-5-5)
