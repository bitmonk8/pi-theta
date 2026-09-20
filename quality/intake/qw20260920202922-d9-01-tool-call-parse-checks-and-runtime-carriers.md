---
id: pending
title: src/runtime/tool-call.ts (815 LOC, zone) bundles parse-time argument checking with five runtime error-carrier clusters that share no code with it
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/tool-call.ts:1-815
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/runtime/tool-call.ts
d9_band: zone
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# src/runtime/tool-call.ts (815 LOC, zone) bundles parse-time argument checking with five runtime error-carrier clusters that share no code with it

## Observation
src/runtime/tool-call.ts is 815 LOC (zone band). Its header names it "the code-side `<name>(args)` tool-call dispatch/lowering seam" (V14a). The file's first half (lines 77-414) is parse-time diagnostic emission — `checkToolCallArguments` and the RFC 0002 static-type × schema-subset disjointness computation — consumed by parser/ and extension/ static-check modules. The second half (lines 421-815) is runtime material: defect-error classes, `CodeToolError`/`ModelToolError` constants, accepted-path lowering, ceiling-#4 depth enforcement, `Err` carriers, and `Invoke*Error` surfacing. No code reference crosses between the two halves.

## Evidence
Distinct-concern inventory (declaration LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| parse-time argument checks & schema-subset disjointness | ToolCallCalleeKind, ToolCallStaticResolution, ToolArgSchemaConflictFacts, ToolCallArgCheckInput, checkToolCallArguments, resolveSchemaConflict, SubsetKindSet, SUBSET_PRIMITIVE_KINDS, subsetKinds, kindsDisjoint, computeToolArgSchemaConflict | 77-414 | 236 |
| gate-gap defect-error classes (bugs 0003/0016) | PiToolArgShapeDefectError, ShadowedCalleeDispatchDefectError | 438-475 | 16 |
| QueryError kind/cause constants & accepted-path lowering | codeToolErrorCauses, codeToolErrorKind, modelToolErrorKind, lowerAcceptedPiToolReturn, lowerAcceptedThetaCallableReturn | 487-531 | 15 |
| ceiling-#4 depth enforcement (code- and model-driven) | CodeToolArgDepthBreach, enforceCodeToolArgDepth, ModelToolArgDepthBreach, enforceModelToolArgDepth | 563-614, 730-770 | 57 |
| runtime Err carriers (validation / unknown_tool) | CodeToolArgSchemaViolation, buildCodeToolArgSchemaViolation, buildCodeToolUnknownTool | 632-689 | 25 |
| .theta-callable failure surfaces (Invoke*Error) | surfaceThetaCallableInputValidationFailure, surfaceThetaCallableCalleeFailure | 784-815 | 23 |

Affinity of the parse-time cluster, counted both ways: it touches 2 members of parser/ hosts (`isBareObjectLiteral` from ../parser/literal-sublanguage, `splitTopLevelUnion` from ../parser/type-layer-checks) plus the Diagnostic type, and 0 members of the file's own runtime clusters (no use of `makeErr`/`makeOk`/`ThetaValue` from ./value, no ./query-error type, no depth walk). Its importers (grep, `checkToolCallArguments|computeToolArgSchemaConflict`): parser/theta-document.ts:115, extension/invoke-static-checks.ts:130, extension/invoke-expr-call-surface.ts:19 — map importer count 3/2 (src/tests). The runtime clusters conversely use `makeErr`/`makeOk` (value.ts), `CodeToolError`/`InvokeInfraError`/`InvokeCalleeError` (query-error), `wireFormDepthWalk`, and `depthWalk`; their importers are extension/production-theta-producer.ts and extension/prompt-tool-loop-governor.ts (map: enforceCodeToolArgDepth 1/3, enforceModelToolArgDepth 2/2).

src/runtime/tool-call.ts:177 (parse cluster entry):
```ts
export function checkToolCallArguments(
  input: ToolCallArgCheckInput,
): Diagnostic[] {
```
src/runtime/tool-call.ts:402-405 (parse cluster tail; last runtime-free declaration before the runtime half begins at 438):
```ts
export function computeToolArgSchemaConflict(
  field: string,
  exprType: string,
  schemaType: string,
): ToolArgSchemaConflictFacts {
```

## Why this is a problem
Zone-band file (815 LOC ≥ 600): a breakdown finding needs a 2-or-more-concern inventory; six are inventoried above, and the largest (parse-time checks, 236 declaration LOC) shares zero code with the other five. Reasons considered and defeated: closed-enumeration dispatch — the file is not one enumeration (six unrelated clusters, each with its own spec anchor: tool-calls.md argument checks vs. ceilings-3-and-4.md depth table vs. queryerror-variants.md); data-only module — declaration-table type/const LOC is well under 80% (the two largest declarations are functions of 106 and 27 LOC); single algorithm with shared local state — defeated by the zero cross-references between the parse-time half and any runtime cluster; generated code — none (hand-written, bug-doc-annotated); spec-mirror — the header's "one seam" claim (V14a) spans clusters whose only link is topic, not code. quality/exemptions.json holds no ruling for this host.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): parse-time checks (lines 77-414) -> tool-call-static-checks.ts (or a parser/-side module, matching its two parser imports) - ~340 LOC including commentary, exported symbols moved: checkToolCallArguments (importers 3/2), computeToolArgSchemaConflict (0/1) plus the four input types, cross-references back into the host: none. Seam B (hypothesis, unproven): ceiling-#4 depth enforcement (563-614, 730-770) -> tool-arg-depth.ts - ~110 LOC, symbols moved: enforceCodeToolArgDepth (1/3), enforceModelToolArgDepth (2/2), cross-references back into the host: none (both depend only on value.ts and the depth walks). The human ratifies any split.

## False-positive check
Band check: 815 LOC is zone (600-999) per the quoted FILE_BANDS. Reasons-considered list recorded above with the evidence defeating each. Exemptions check: grep of quality/exemptions.json for tool-call found no entry. Generated-code check: file carries no generator banner; it is hand-annotated with bug/RFC citations. Spec-mirror check: the header cites tool-calls.md and host-interfaces-core.md as the module's shared topic, but no spec table enumerates these six clusters as one closed set. Duplicate check: no already-filed issue or pending candidate names tool-call.ts as a breakdown host (qw20260920202922-d9-01-run-tool-call-effect-three-routes targets runToolCallEffect in a different file).

## Triage
verdict: questionable — accounting verified: size-scan reproduces 815 LOC / zone with no exemption; the parse-time cluster (77-414) and the runtime half (438-815) share zero code references (only a prose mention of CodeToolError in a doc comment), importer/affinity counts and reasons-considered hold (runtime importer roster additionally omits statement-executor.ts:64 and effectful-statement-host.ts:72, not refuting); target split shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan reproduces 815 LOC / zone with no exemption; grep of 77-414 for every runtime-cluster symbol and of 415-815 for every parse-cluster symbol finds zero code references (one doc-comment prose mention at :84); importer roster holds (parse: 3 cited src importers exactly; runtime: the 2 cited plus statement-executor.ts:64 and effectful-statement-host.ts:72, no importer spans both halves); type/const share 84/372 ≈ 23 %, no reverted split (the four tool-call-*.ts siblings were added, never deleted), no spec clause pins the module as one unit; caution for the ruling: buildCodeToolArgSchemaViolation:649-660 documents deliberate co-location with enforceCodeToolArgDepth as the two cause:"validation" producers, bearing on seam B not the parse/runtime split — the split shape needs a human ruling (triage: claude-fable-5-1)
