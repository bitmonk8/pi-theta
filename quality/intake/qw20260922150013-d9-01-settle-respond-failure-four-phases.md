---
id: pending
title: settleRespondFailure runs 143 LOC across four settlement phases; the depth arm hand-builds the RuntimeEvent that buildValidationEvent already produces
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/query-tool-loop.ts:615-757
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/runtime/query-tool-loop.ts#settleRespondFailure
d9_band: justify
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# settleRespondFailure runs 143 LOC across four settlement phases; the depth arm hand-builds the RuntimeEvent that buildValidationEvent already produces

## Observation
`settleRespondFailure` (src/runtime/query-tool-loop.ts:615-757, 143 LOC — justify
band per the wave map) settles a typed query's forced-respond turn: ERR-17
noncompliance, the CIO-3 depth walk, QRY-22 AJV validation, then the value
return. All shared state arrives as one destructured readonly params object
(forced, config, slotCountAtDispatch, rounds, forcedRespond, committed,
schemaValidation, lowered). The depth arm's no-collaborator branch builds its
`computeMasked` call and `RuntimeEvent` literal inline (706-730) instead of
calling the file's own `buildValidationEvent` (802-833), which the
noncompliance arm's twin branch already uses (661).

## Evidence
Step inventory (anchors verified in the current file):

| phase | lines | LOC | reads | writes |
|---|---|---|---|---|
| noncompliance settle (ERR-17/QRY-9): repair route or direct terminal via buildValidationEvent | 634-666 | 33 | forced.branch/raw_response, schemaValidation, config, slotCountAtDispatch, rounds, forcedRespond, committed | error, event |
| depth-walk settle (CIO-3): repair route or direct terminal with inline masked+event build | 668-731 | 64 | forced.payload, schemaValidation, config, slotCountAtDispatch, rounds, forcedRespond, committed | walk, failure, error, masked, event |
| AJV validate + repair route (QRY-22) | 733-748 | 16 | lowered, schemaValidation, forced.payload, config, slotCountAtDispatch, rounds, forcedRespond, committed | result, failure, repair |
| value return | 750-757 | 8 | forced.payload, rounds, forcedRespond, committed | — |

Depth-arm inline event build (706-730, excerpt trimmed):

```ts
    const masked = computeMasked({
      kind: "validation",
      validationCause: walk.cause,
      atTypedQueryResponse: true,
      turnKind: "forced_respond",
      toolLoopSlotCount: slotCountAtDispatch,
      maxRounds: config.maxRounds,
    });
    const event: RuntimeEvent = {
      kind: "validation",
      ...
      message: DEPTH_VIOLATION_MESSAGE,
      attempts: 0,
```

`buildValidationEvent(config, error, slotCountAtDispatch)` (802-833) with this
arm's `error` (`attempts: 0`, `cause: walk.cause`, `message:
DEPTH_VIOLATION_MESSAGE`, built at 690-700) produces a field-for-field
identical event: `error.attempts >= 1` is false so `followUpSurfacing` is
`undefined`, giving `turnKind: "forced_respond"` and `toolLoopSlotCount:
parentSlotCountAtDispatch` — exactly the inline literal's inputs. The
noncompliance arm (661) already routes its twin no-collaborator branch through
`buildValidationEvent`.

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole
is found. Reasons considered and defeated: (1) closed-enumeration dispatch —
the phases do mirror the spec's failure taxonomy (ERR-17 / CIO-3 / QRY-22),
but the reason requires each arm short, and the depth arm is 64 LOC; (2)
single algorithm with shared local state — fails, because the shared state
already lives in one readonly params object (the state object exists; an arm
helper takes it as one parameter, no new struct invented); (3) spec-cited
ordered sequence — CIO-3 only orders depth-before-AJV, and that ordering stays
in this coordinator whichever arm bodies move; no observable steps interleave;
(4) data-only / grammar production / generated — not applicable. Additionally
the depth arm's 25-LOC inline masked+event build duplicates
`buildValidationEvent` in the same file, so a quarter of the longest phase is
already-extracted logic re-inlined.

## Suggested direction (non-binding, optional)
Seam A: depth arm's inline masked+event build (706-730) -> call
`buildValidationEvent(config, error, slotCountAtDispatch)` — ~25 LOC removed,
0 exported symbols moved, 0 external importers, no cross-references back into
the host (hypothesis; identical-output argument above must be ratified). Seam
B: noncompliance settle (634-666) -> `settleNoncompliance(params)` module-local
helper — ~33 LOC, nothing exported, 0 external importers. Seam C: depth settle
(668-731) -> `settleDepthViolation(params)` module-local helper — ~64 LOC
(~40 after Seam A), nothing exported, 0 external importers. All unproven.

## False-positive check
Band: 143 LOC / justify quoted from the wave map, not recounted. Exemptions:
quality/exemptions.json has no entry for query-tool-loop.ts or this function.
Already-filed check: PTQ-1185 targets `runTypedQueryLoop` (468-609), a
different host key; no PTQ names settleRespondFailure. Generated-code check:
hand-written module (V13c header), no generator. Spec-mirror check: the arms
mirror ERR-17/CIO-3/QRY-22, but the closed-enumeration reason fails on the
64-LOC depth arm. Every cited range re-read immediately before filing;
buildValidationEvent's `attempts >= 1` discriminator (813) confirmed so the
depth arm's attempts-0 error takes the parent-slot path identical to the
inline build.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives settleRespondFailure 615-757 / 143 LOC / band justify (file zone, no exemptions.json entry for query-tool-loop.ts or the function key); the four inventory rows are real distinct early-return arms at the cited lines (noncompliance 634-666 = 33, depth walk 668-731 = 64, AJV 733-748 = 16, value tail 750-757 = 8) with no locals threaded between arms — each reads the params object and returns, so the ≥ 6-shared-locals reason does not apply and the closed-enumeration (ERR-17/CIO-3/QRY-22) mirror is conceded by the filing but undercut by the 64-LOC arm; the Seam A identical-output claim reproduces (attempts 0 → followUpSurfacing undefined → turnKind "forced_respond", toolLoopSlotCount = slotCountAtDispatch, validationCause = walk.cause, message/attempts from error — field-for-field the inline literal at 706-730), though that piece is D4-clone territory riding along as evidence; not a duplicate — PTQ-1185 (resolved) targeted runTypedQueryLoop and this function IS that fix's extract, so a further split of the fresh justify-band host is a design decision (ping-pong risk with the just-landed extraction) for a human ruling (triage: claude-fable-5-1)
