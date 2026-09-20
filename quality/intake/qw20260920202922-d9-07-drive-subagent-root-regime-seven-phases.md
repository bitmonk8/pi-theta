---
id: pending
title: ProductionThetaProducer.driveSubagentRootRegime combines seven child-side regime phases in one 226-LOC method
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:3043-3268
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.driveSubagentRootRegime
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# ProductionThetaProducer.driveSubagentRootRegime combines seven child-side regime phases in one 226-LOC method

## Observation
`ProductionThetaProducer.driveSubagentRootRegime` (src/extension/production-theta-producer.ts:3043-3268) is 226 LOC — strong band (threshold 200). It is the child-process root trampoline: envelope/outcome emitter construction, PIC-62 child-side model confirmation, fn-entry dispatch, marshalled-params intake and inbound bind, the body drive, the Ok-arm envelope guard chain (depth, non-representable, enum-tag carriage, shutdown request), and the panic catch/teardown epilogue.

## Evidence
Step inventory:

| phase | lines | LOC | locals written (read later by) |
|---|---|---|---|
| envelope + latched outcome emitters (RFC 0012 §7) | 3046-3077 | 32 | emitEnvelope, outcomeEmitted, emitOutcome, emitErr (all later arms) |
| child-side model confirmation (PIC-62 obligation 2) | 3079-3140 | 62 | entry, model, qualified, resolvedRef, pinRef, expectedRef, confirmation |
| fn-entry dispatch | 3142-3145 | 4 | — (delegates to #driveSubagentFnEntry) |
| marshalled params intake + inbound bind (PIC-60) | 3147-3184 | 38 | intake, paramBindings, rootBindInput |
| bind + executeBody (PIC-58) | 3186-3195 | 10 | binding, execution, terminal |
| Ok-arm envelope guards: depth, non-representable, enum-tag carriage, shutdown (PIC-59) | 3196-3243 | 48 | tooDeep, nonRepresentable |
| Err arm + panic catch + finally teardown | 3244-3268 | 25 | — |

Excerpt (3059-3064, the latch that every later arm depends on):
```ts
    const emitOutcome = (outcome: SubagentChildOutcome): void => {
      if (outcomeEmitted || outcomeEvents === undefined) {
        return;
      }
      outcomeEmitted = true;
      const payload: SubagentChildOutcomePayload = {
```

## Why this is a problem
Strong band (226 LOC ≥ 200): presumption of breakdown; a strong concrete reason is required. Reasons considered and defeated: (a) spec-cited invariant as one critical section — PIC-59's single-envelope rule is real, but it is enforced by the `outcomeEmitted` latch and the emitter closures, not by body contiguity; passing `emitErr`/`emitOutcome` to a helper preserves the latch exactly (the method already does this: `#driveSubagentFnEntry` receives all three emitters at 3143); (b) single algorithm with shared local state — concrete but the emitters are the only cross-phase state after 3145, and they are already reified closures designed to be handed onward; (c) closed enumeration — no; (d) generated / data-only — no; (e) measured cost / prior revert / human ruling — none found; no exemptions.json entry.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: PIC-62 model confirmation (3079-3140) -> `#confirmChildModelOrRefuse(theta, entry, ctx, emitErr)` returning boolean — ~62 LOC, no exports. Seam B: the Ok-arm envelope guard chain (3196-3243) -> `#emitOkEnvelopeGuarded(terminal, calleePath, emitEnvelope, emitErr, emitOutcome, ctx)` — ~48 LOC, mirrors the emitter-passing shape `#driveSubagentFnEntry` already uses. Seam C: params intake + inbound bind (3147-3184) -> `#bindMarshalledRootParams(theta)` — ~38 LOC.

## False-positive check
Band check: 226 LOC strong (map-quoted). Reasons-considered list above; the emitter-passing precedent at 3143 (`#driveSubagentFnEntry(bindInput, entry.name, calleePath, emitEnvelope, emitErr, emitOutcome)`) shows the single-envelope latch already survives a helper seam. Exemptions check: no entry. Generated-code check: hand-authored. Spec-mirror check: not an enumeration host. Cited ranges re-read this session (offset 3043, 226 lines).

## Triage
verdict: questionable — accounting verified: size-scan map reports driveSubagentRootRegime 3043-3268 at 226 LOC band strong, excerpt matches at 3059-3064, all seven inventory rows are distinct contiguous phases whose locals die within their range (only entry/rootBindInput/binding and the three emitter closures cross phases), the emitter-passing precedent at 3143 is real so the PIC-59 strong reason is correctly defeated, no D9 exemption for this host, and the same-wave d9-01 filing keys the file not this method; target shape needs a human ruling (triage: claude-fable-5-1)
