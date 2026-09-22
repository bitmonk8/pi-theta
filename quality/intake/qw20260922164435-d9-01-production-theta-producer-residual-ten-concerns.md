---
id: pending
title: production-theta-producer.ts still bundles ten separable concern clusters at 6474 LOC after the PTQ-1150 split
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:1-6474
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts
d9_band: strong
wave: qw20260922164435
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# production-theta-producer.ts still bundles ten separable concern clusters at 6474 LOC after the PTQ-1150 split

## Observation
src/extension/production-theta-producer.ts is 6474 LOC (structural map; strong band, threshold 2000). PTQ-1150 (confirmed, now fixed) cut its three ratified seams — the pure-expression evaluator to `runtime/pure-expression-evaluator`, the live prompt-query driver to `extension/live-prompt-query-driver`, and the binder-echo renderer to `extension/binder-echo-type` (all three now imported and re-exported at lines 23-24 and the facade block). The residual module still hosts the 4599-LOC `ProductionThetaProducer` class plus ~30 module-level declarations spanning ten of the original fourteen concern clusters.

## Evidence
Fresh distinct-concern inventory (names and ranges from the current structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| producer deps surface & noop scaffolding | SubagentPlacementResolver, PiToolDispatch, CalleeParseOutcome, ProductionProducerInput, createProductionProducerDeps, SubagentSpawnFailedError, isEnoent, calleePathIsAbsent, noopSwallowChannels, signalGuard, noopSink, NoopConversationMutator, UnknownHostToolError | 381-838 | ~440 |
| frontmatter binder run | MergedDeclaredDefaults, BinderForcedToolDispatch, binderPromptParamField, runBinder, #runBudgetedBinderCall, #emitBinderEchoNote, #classifyBinderAttempt, #completeBinderReply, #buildBinderSessionContext, #emitCustomTypeUnsafeNote, #emitBinderFailureNote, #mergeDeclaredDefaults, #recoverDeclaredDefaults, #emitNoParamsOverflowNote | 847-1848 | ~900 |
| system-note emission | emitTopLevelErrNote, emitPanicNote, #trackForwardingSources, #systemNoteChannel, #buildGroupAEventOrFallback, #emitCleanCancelNote | 1867-2088 | ~200 |
| prompt-mode conversation binding | beginInvocation, #openInvocationTicket, #deriveInvocationAbort, #buildPromptHostDeps, bindPromptConversation | 2099-2437 | ~330 |
| subagent spawn & child-side regime | spawnSubagentConversation, #renderChildSystemPrompt, #marshalChildCallables, #placementResolver, #paramsMarshalDeps, #intakeSubagentRootParams, isSubagentRootFor, driveSubagentRootRegime, #confirmChildModelOrRefuse, #driveSubagentFnEntry, #subagentFnParamsValidator, #requestVisibleChildShutdown, #resolveSubagentFnDecl, #subagentRootIntendedModelRef, #applySubagentFnConfig, #resolveSubagentFnChild, #driveSubagentFnChild, #resolveSubagentFnReturnSite, #subagentFnDeclaringPath | 2449-3807 | ~1300 |
| typed-query resolution & respond tool | #resolvePromptQuery, #buildLiveModelOptions, #resolveThetaModel, #buildRespondTurnContext, #registerRespondTool, #buildRespondToolDefinition, #executeRespondTool, #buildTypedValidation | 3816-4294 | ~440 |
| tool-call resolution & dispatch ladder | #classifyCall, #resolveRuntimeToolCall, #resolveToolCall (nested `dispatch`), #checkPiToolArgSchema, #dispatchExtensionToolViaLadder, #resolvePiToolForTheta | 4306-4756 | ~430 |
| invoke machinery | #resolveInvoke, #resolveCallAsInvoke, #buildInvokeChild, #driveCallee, #guardInvokeBoundary, #bindCalleeParams, #projectValidatedReturn, #recheckCalleeContainment, #resolveReturnSite, #validateInvokeReturn | 4763-5534 | ~730 |
| callable-set lowering & drive-binding helpers | promptModeSurface, buildSubagentDriveBinding, surfaceCalleeFinalValue, subagentFnCallableSet, callableSetPiToolNames, LoweredThetaCallableResult, callableSetThetaEntries, lowerThetaCallableModelResult, thetaCalleePath, lowerToolCallParams, presentedCallableNames, buildBoundEnvironment, ModelDrivenThetaCall, lowerModelDrivenThetaCall | 5538-6081 | ~500 |
| query text render & interpolation | renderTypedAwareQueryText, schemaDeclsOf, enumDeclsOf, collectLaunchRespondNames, mergedSchemaDeclsOf, mergedEnumDeclsOf, renderQueryText, stringifyInterpolation, NestedResultReach, translateInterpolationOutbound, identifierTypeSource, arrayElementTypeSource | 6099-6474 | ~330 |

Importer counts (map-quoted): `createProductionProducerDeps` 1 src / 80 tests; `ProductionProducerInput` 0/4; `PiToolDispatch` 0/14; `CalleeParseOutcome` 1/9 — the clusters are already consumed independently by the test surface.

## Why this is a problem
Strong band (6474 LOC ≥ 2000): presumption of breakdown; a strong concrete reason is required to keep whole. Reasons considered and defeated: (a) data-only module — type/interface LOC is ~330 of 6474 (≈5%), far below 80%; (b) closed-enumeration dispatch — only sub-regions (e.g. `#classifyBinderAttempt`'s binder-inference.md rule set) mirror a spec enumeration, not the module; (c) single algorithm with shared local state — the module-level helper families (5538-6474) contain no `this.#` accesses and the ten clusters share no locals; (d) generated code — hand-authored (bug-numbered narrative comments, no generator banner); (e) spec-cited single critical section — the concerns cite separate topics (binder-model-and-context.md, subagent.md, conversation-drive.md, tool-calls.md, invocation.md, runtime-value-model.md), not one invariant; (f) prior split reverted — the opposite: the PTQ-1150 split landed and stuck; (g) exemptions — quality/exemptions.json holds only `D8:...#firstAdmittingArmProperties` for this file, no D9 host row.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: query text render & interpolation (6099-6474) -> `render/query-render` or a sibling module — ~330 LOC, 0 exported symbols today, 0 external importers, cross-refs back: `renderQueryText` at 2239 and `renderTypedAwareQueryText` from `#resolvePromptQuery`. Seam B: callable-set lowering & drive-binding helpers (5538-6081) -> `runtime/subagent-*` sibling or `extension/callable-lowering` (hypothesis) — ~500 LOC, exports moved: `LoweredThetaCallableResult`, `ModelDrivenThetaCall`, `lowerModelDrivenThetaCall` (0/2 importers), cross-refs back: `spawnSubagentConversation` → `buildSubagentDriveBinding`. Seam C: frontmatter binder run (847-1848) -> `extension/binder-run` (hypothesis) — ~900 LOC, 0 exported symbols moved, cross-refs back: `theta-composition-producer`'s `runBinder` entry and `this.#input` deps.

## False-positive check
Band check: 6474 LOC strong (map-quoted; never recounted by hand, targeted ranges only were read). Reasons-considered list recorded above with defeating evidence. Exemptions check: quality/exemptions.json — no D9 row for this file. Generated-code check: hand-authored. Spec-mirror check: multiple spec topics, no single closed set. Duplicate check: PTQ-1150 (same host key) is status fixed/resolved — this is the post-fix residual with a fresh inventory, the pattern the walkStatement-residual triage note requires; the pending intake filings on this file (guard-invoke-boundary, resolve-runtime-tool-call) are member-level hosts, not the file key.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 6474 LOC / strong band (threshold 2000); all ten inventory rows reproduce member-for-member against current declarations (module-level 381-838 & 5538-6474, class members 1024-5534 at the cited lines); tail helpers 5538-6474 contain 0 `this.#` accesses; type/interface LOC ≈380 (~6%), no generator banner, quality/exemptions.json carries only the D8 #firstAdmittingArmProperties row for this file; PTQ-1150 (same host) is resolved/fixed so this is the post-fix residual with a fresh ≥2-concern inventory, and the sibling qw20260922164435-d9-03 intake is a single-cluster misplacement filing, not a duplicate — the breakdown shape (which of seams A/B/C, target homes) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map gives 6472 LOC / band strong (2-line drift from the filed 6474, threshold 2000); all ten inventory rows reproduce name-for-name against the current declaration table (module-level 379-836 and 5536-6472, class members 1022-5532, within ±2 lines); the tail helpers 5534-6472 contain zero `this.#` accesses so the module-level families share no class state; no overlooked reason — type/interface LOC 368 ≈ 6 % not ≥ 80 %, no generator banner, header cites separate spec topics not one invariant, quality/exemptions.json holds only `D8:...#firstAdmittingArmProperties` for this file, and PTQ-1150's three seams landed (imports at lines 23/35-37, commits d0e81338/04750f86) rather than reverted; not a duplicate — PTQ-1150 (same host key) is status fixed in quality/resolved so this is the post-fix residual with a fresh ≥2-concern inventory, and the same-host intakes (164435-d9-02 spawnSubagentConversation, d9-04 runBinder, 150013-d9-03 #guardInvokeBoundary, d9-04 #resolveRuntimeToolCall) are member-level hosts while 164435-d9-03 is a misplacement filing on the 6097-6472 cluster only; which seams (A/B/C) and what homes is a design decision for a human ruling (triage: claude-fable-5-1)
