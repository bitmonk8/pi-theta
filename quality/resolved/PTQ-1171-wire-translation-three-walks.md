---
id: PTQ-1171
title: src/runtime/wire-translation.ts (737 LOC, zone) hosts three independent recursive walks — sidecar-indexed inbound rebuild, outbound lowering, and a rename-free AJV projection — sharing only 11 LOC of helpers
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/runtime/wire-translation.ts:1-737
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/runtime/wire-translation.ts
d9_band: zone
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# src/runtime/wire-translation.ts (737 LOC, zone) hosts three independent recursive walks — sidecar-indexed inbound rebuild, outbound lowering, and a rename-free AJV projection — sharing only 11 LOC of helpers

## Observation
src/runtime/wire-translation.ts is 737 LOC (zone band). Its header names it "the inbound/outbound wire-name translation boundary seam" (V2e). It contains three separately-entered recursive walks: the inbound rebuild (`translateInbound` and its `SidecarIndex`/union-arm/field-order machinery), the outbound lowering (`translateOutbound`/`lowerOutbound`), and `projectForValidation`, whose own doc-comment states it is "Not translateOutbound: it renames nothing" and "does not call lowerOutbound: … a materially different job". Each walk has exactly one src importer per the structural map.

## Evidence
Distinct-concern inventory (declaration LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| inbound rebuild walk (sidecar index, union-arm dispatch, field ordering) | InboundTranslationInput, translateInbound, InboundWalk, enumTagFor, SidecarIndex, indexOf, rebuildUnder, rebuildInbound, rebuildUnderFirstAdmittingArm, firstAdmittingArm, orderedEntries | 108-151, 186-588 | 326 |
| outbound lowering walk | OutboundTranslationInput, translateOutbound, lowerOutbound | 157-164, 598-666 | 63 |
| rename-free wire projection for AJV gates | projectForValidation | 699-737 | 39 |
| shared stateless helpers | encodePointerSegment, isPlainObject | 88-100 | 11 |

Cross-cluster sharing counted: the outbound walk uses none of `SidecarIndex`/`indexOf`/`InboundWalk`/`enumTagFor`/`orderedEntries` (it reads `sidecar.refTargets`/`sidecar.wireNames` directly, lines 615-666); `projectForValidation` reads no sidecar at all. The only members used by more than one cluster are `encodePointerSegment` (3 LOC) and `isPlainObject` (8 LOC). Importer counts from the map: translateInbound 1/6, translateOutbound 1/2, projectForValidation 1/1 — three entry points, three distinct consumers.

src/runtime/wire-translation.ts:598-600 (outbound entry — no inbound machinery in its signature or body):
```ts
export function translateOutbound(input: OutboundTranslationInput): unknown {
  return lowerOutbound(input.value, input.sidecars.get(input.rootDef), "", input.sidecars);
}
```
src/runtime/wire-translation.ts:684-689 (projection's own separability statement):
```
 * Not {@link translateOutbound}: it renames nothing. The value at the
 * `invoke<T>` return boundary is the callee's own theta-side value, and the
 * lowered document that boundary validates against already emits
 * theta-side property names …
 * … It also does not call {@link lowerOutbound}: that
 * walk always rebuilds its record and renames by sidecar — a materially
```

## Why this is a problem
Zone-band file (737 LOC ≥ 600): a breakdown finding needs a 2-or-more-concern inventory; three walks are inventoried above, with counted sharing of 11 LOC (two stateless helpers) between them. Reasons considered and defeated: single algorithm with shared local state — the walks share no state object (`InboundWalk` is inbound-only; outbound threads its own 4 parameters; the projection threads 1); closed-enumeration dispatch — each walk is its own dispatch, not arms of one enumeration; data-only module — the file is dominated by function bodies, not declarations; one grammar production family — not a parser; generated code — none. The header's "one boundary seam" framing cites runtime-value-model.md §"Wire-name translation", which names the inbound and outbound bullets as two places, and `projectForValidation` is outside that section entirely (it exists for AJV's `typeof` gap at the invoke-return and defaults-recovery gates). quality/exemptions.json holds no ruling for this host.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): outbound lowering + rename-free projection (157-164, 598-737) -> wire-form-outbound.ts - ~110 LOC, exported symbols moved: translateOutbound (1/2), OutboundTranslationInput (1/0), projectForValidation (1/1), cross-references back into the host: `encodePointerSegment` and `isPlainObject` (11 LOC, either re-exported or duplicated by ratified choice). Seam B (hypothesis, unproven): keep inbound in place as the module's sole concern. None identified yet for splitting the inbound walk itself. The human ratifies any split.

## False-positive check
Band check: 737 LOC is zone (600-999) per the quoted FILE_BANDS. Reasons-considered list recorded above with defeating evidence (cross-cluster member usage counted from the read of lines 88-737). Exemptions check: grep of quality/exemptions.json for wire-translation found no entry. Generated-code check: hand-written, bug-doc-annotated (0407, 0424, 0173). Spec-mirror check: runtime-value-model.md §"Wire-name translation" names two directions, not a closed enumeration whose length excuses the file; the third walk cites GOV-15 and invoke gates, a different spec area. Duplicate check: no already-filed issue or pending candidate names wire-translation.ts as a breakdown host (PTQ-0521 targets test doubles of the wire-form metric).

## Triage
verdict: questionable — accounting verified: size-scan reproduces 737 LOC/zone and every inventory line range; three walks share only encodePointerSegment+isPlainObject (11 LOC), each with one distinct src consumer; no exemption, no spec closed-enumeration, no prior split/revert; target shape (seam A/B) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map reproduces 737 LOC/zone and every inventory row's range; lowerOutbound (615-666) and projectForValidation (699-737) touch none of the inbound walk's InboundWalk/SidecarIndex/indexOf/enumTagFor/orderedEntries, sharing only encodePointerSegment (3 LOC) + isPlainObject (8 LOC); one src importer per entry point (inbound-boundary.ts:24, query-render.ts:37, production-theta-producer.ts:285); no exemptions.json row, type LOC ≈ 79/737, no split/revert in git log, and runtime-value-model.md:32's "exactly two places" leaves projectForValidation as a third concern regardless of how inbound/outbound are grouped; intake d4-21 is a different root cause (D4 parallel vs value.ts) — seam A/B is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time from scratch: size-scan map gives 737 LOC/zone with every inventory row's range byte-matching the declaration table; identifier grep shows the only cross-cluster members are encodePointerSegment (used at 412 inbound / 662 outbound) and isPlainObject (298/363/471 inbound, 640 outbound, 724 projection) while all eleven inbound members are referenced solely within 186-588 and no locals/state object cross the walks; both excerpts (598-600, 684-689) exact; one src importer per entry point; no exemptions.json row, type LOC 79/737, not a barrel, git shows only two small quality edits and no split/revert; runtime-value-model.md:32 "exactly two places" would at most group inbound+outbound and still leaves projectForValidation as a distinct concern; d4-21 (parallel) and qw20260921001431-d9-03 (InterpolatedResultPanic misplacement) are different root causes — the seam is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
