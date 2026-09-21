---
id: pending
title: production-theta-producer.ts bundles fourteen separable concern clusters in one 8796-LOC module
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:1-8796
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# production-theta-producer.ts bundles fourteen separable concern clusters in one 8796-LOC module

## Observation
src/extension/production-theta-producer.ts is 8796 LOC (strong band; threshold 2000). Its header names it "the production `ThetaProducerDeps` for the shipped composition root" with three mode-routing members (`runBinder`, `bindPromptConversation`, `spawnSubagentConversation`). Beyond those three routes the module also hosts the 4523-LOC `ProductionThetaProducer` class, a second 923-LOC class (`LivePromptQueryModel`), the off-session forced-respond dispatcher, a binder-echo type renderer, the query-interpolation renderer, and a complete synchronous pure-expression evaluator family — 96 top-level declarations in all (structural map).

## Evidence
Distinct-concern inventory (declaration names and line ranges from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| producer input surface / deps factory | SubagentPlacementResolver, PiToolDispatch, ProductionProducerInput, createProductionProducerDeps, isEnoent, calleePathIsAbsent, noopSwallowChannels, signalGuard, noopSink, NoopConversationMutator | 417-953 | ~460 |
| frontmatter binder run | runBinder, #classifyBinderAttempt, #completeBinderReply, #emitBinderEchoNote, #buildBinderSessionContext, #mergeDeclaredDefaults, #recoverDeclaredDefaults, binderPromptParamField, BinderForcedToolDispatch | 879-1847 | ~830 |
| system-note emission | emitTopLevelErrNote, emitPanicNote, #systemNoteChannel, #buildGroupAEventOrFallback, #emitCleanCancelNote, #trackForwardingSources | 1866-2087 | ~200 |
| prompt-mode conversation binding | beginInvocation, #openInvocationTicket, bindPromptConversation | 2098-2412 | ~300 |
| subagent spawn & child-side regime | spawnSubagentConversation, #placementResolver, #paramsMarshalDeps, #intakeSubagentRootParams, isSubagentRootFor, driveSubagentRootRegime, #driveSubagentFnEntry, #driveSubagentFnChild, #resolveSubagentFnChild + 6 more #subagentFn helpers | 2424-3826 | ~1300 |
| typed-query resolution & respond tool | #resolvePromptQuery, #resolveThetaModel, #buildRespondTurnContext, #registerRespondTool, #buildRespondToolDefinition, #executeRespondTool, #buildTypedValidation | 3835-4292 | ~430 |
| tool-call resolution & dispatch ladder | #classifyCall, #resolveRuntimeToolCall, #resolveToolCall (with nested `dispatch`), #checkPiToolArgSchema, #dispatchExtensionToolViaLadder, #resolvePiToolForTheta | 4304-4753 | ~430 |
| invoke machinery | #resolveInvoke, #resolveCallAsInvoke, #buildInvokeChild, #driveCallee, #recheckCalleeContainment, #resolveReturnSite, #validateInvokeReturn | 4760-5476 | ~700 |
| callable-set lowering helpers | surfaceCalleeFinalValue, subagentFnCallableSet, callableSetPiToolNames, callableSetThetaEntries, lowerThetaCallableModelResult, thetaCalleePath, lowerToolCallParams, presentedCallableNames, buildBoundEnvironment | 5496-5806 | ~310 |
| live prompt-query turn driver | RESPOND_* constants, ActiveRespondCapture, RespondTurnContext, LivePromptQueryModel, POLL/TURN bounds, macrotask, isSettledTurnEnding, turnSliceSince, thisTurnSettled, leafPathEntries, trailingCompactionUnanswered, mapForcedTurnToRepairOutcome | 5809-7100 | ~1290 |
| off-session forced respond dispatch | OffSessionRequestAuth, resolveRegistryAuth, ModelDrivenThetaCall, lowerModelDrivenThetaCall, OffSessionCompletion, OFF_SESSION_NORMAL_STOP_REASONS, classifyOffSessionReply, respondToolEntry, dispatchForcedRespondTurn | 7103-7659 | ~450 |
| binder-echo type rendering | echoTypeFromValue, ECHO_REF_CHASE_LIMIT, derefLoweredProperty, loweredObjectPropertiesFor, firstAdmittingArmProperties, declarationOrderedEchoFields, loweredSchemaKindIsInteger | 7680-7928 | ~250 |
| query text render & interpolation | renderTypedAwareQueryText, schemaDeclsOf, enumDeclsOf, mergedSchemaDeclsOf, mergedEnumDeclsOf, assistantText, renderQueryText, stringifyInterpolation, raiseInterpolatedResult, NestedResultReach, translateInterpolationOutbound, identifierTypeSource, arrayElementTypeSource, interpolationTypeOf | 7243-8179 | ~330 |
| pure expression evaluator | evaluateCallSiteCwd, evaluatePureExpression, evaluatePureFnCall, PureBlockOutcome, evaluatePureBlock, evaluatePureStatement, evaluatePureIf, evaluateStdlibMethod, evaluateBinaryExpression | 8198-8796 | ~600 |

Importer counts from the map: `createProductionProducerDeps` 1 src / 80 tests; `ProductionProducerInput` 0/4; `PiToolDispatch` 0/14 — the module is the shipped composition root's single production entry, but its test surface (80 importing test files) already treats these clusters as independent.

## Why this is a problem
Strong band (8796 LOC ≥ 2000): presumption of breakdown; a strong concrete reason is required to keep whole. Reasons considered and defeated: (a) data-only module — defeated: 96 declarations are almost entirely executable functions/classes, not tables; (b) closed-enumeration dispatch — defeated: only sub-regions (the evaluator switches) mirror a spec enumeration, not the module; (c) single algorithm with shared local state — defeated: the fourteen clusters share no locals; module-level families (evaluator, echo renderer, off-session dispatch) touch `ProductionThetaProducer` state not at all; (d) generated code — no generator; (e) spec-cited single critical section — defeated: the header cites five separate spec topics (extension-bootstrap, conversation-drive, slash-invocation, binder-model-and-context, subagent), not one invariant; (f) exemptions check — quality/exemptions.json holds no entry for this file (only D8:...#firstAdmittingArmProperties, a member-level reimplementation ruling).

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: pure evaluator family (8198-8796) -> `runtime/pure-expression-evaluator` — ~600 LOC, 0 exported symbols today (all module-private), 0 external importers, cross-references back into the host: `raiseInterpolatedResult`/`INTERPOLATED_RESULT_MESSAGE` used by `stringifyInterpolation` (see the companion misplacement finding). Seam B: LivePromptQueryModel + turn-settle helpers + dispatchForcedRespondTurn + classifyOffSessionReply (5809-7659) -> `extension/live-prompt-query-driver` (hypothesis) — ~1750 LOC, exports needed by the host: LivePromptQueryModel, RespondTurnContext, TURN_END_SETTLE_BOUND_MS (0/1 importers today); cross-refs back: #buildRespondTurnContext construction. Seam C: binder-echo type rendering (7680-7928) -> `extension/binder-echo-type` (hypothesis) — ~250 LOC, 0 external importers, cross-ref: #emitBinderEchoNote.

## False-positive check
Band check: 8796 LOC, strong (map-quoted). Reasons-considered list recorded above with defeating evidence per reason. Exemptions check: `grep production-theta-producer quality/exemptions.json` — one D8 member-level entry, no D9 file/host entry. Generated-code check: hand-authored (narrative header, bug-numbered comments; no generator banner). Spec-mirror check: the module spans five spec topics, no single spec-named closed set. Duplicate check: no prior intake/issue file targets this host for breakdown (grep over quality/intake and quality/issues for "production-theta-producer" — only D2/D4 findings on specific members).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 8796 LOC / band strong for src/extension/production-theta-producer.ts (93 top-level declarations, not 96 — immaterial drift); every inventory row's members and line ranges match the map, and the module-level families (evaluator 8198-8796, echo renderer 7680-7928, off-session dispatch 7103-7659, LivePromptQueryModel 5935-6857) reference `ProductionThetaProducer` nowhere outside the factory at 738 and one doc comment at 6047, so the clusters share no state; no overlooked reason (type/interface/const LOC 430 ≈ 5 %, header cites five spec topics not one invariant, git log shows no reverted prior split, quality/exemptions.json holds only the D8 #firstAdmittingArmProperties row, no D9 host entry); not a duplicate — same-wave siblings d9-02..08 are member-level hosts and d9-09 is a misplacement filing; target shape (which seams, what homes) is a design decision needing a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map gives 8795 LOC / band strong (one-line drift from 8796), 93 top-level declarations whose names and line ranges match all fourteen inventory rows within ±1 line; module-level families (5495-5805, 5808-7099, 7102-7658, 7679-7927, 7942-8178, 8197-8795) contain zero `this.#` accesses and name `ProductionThetaProducer` only in a doc comment at 6046, so the clusters share no fields/locals; no overlooked reason (header lines 20-22 cite five spec topics not one invariant, ~430 type/interface/const LOC ≈ 5 % not ≥ 80 %, no generator banner, quality/exemptions.json carries only `D8:...#firstAdmittingArmProperties`, git log shows no reverted split); not a duplicate — the nine same-host D9 filings (d9-02..08, 223212-d9-01..03) are member-level hosts and PTQ-0322 targets production-composition.ts; the seam/home shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified: size-scan map now gives 8759 LOC / band strong (37-line drift from the filed 8796, tail ranges shifted e.g. evaluator 8161-8759 vs 8198-8796; immaterial to band), 93 top-level declarations whose names match all fourteen inventory rows; the module-level families (5495-5933, 6857-8759) contain zero executable `this.#` accesses (sole hit 5902 is a doc comment) and `ProductionThetaProducer` is named only at the factory 736, its own declaration 952, and doc comments 978/6046, while the class reaches LivePromptQueryModel only via one constructor call at 3916 — so the clusters share no fields or locals; no overlooked reason (header lines 20-22 cite five spec topics not one invariant; type/interface/const LOC 429 ≈ 5 % not ≥ 80 %; no generator banner; quality/exemptions.json carries only `D8:...#firstAdmittingArmProperties`; 131-commit git log shows no reverted split); not a duplicate — no PTQ in quality/issues or quality/resolved has this file as d9_host (PTQ-0322 is production-composition.ts), same-wave d9-02..08 and 223212-d9-01..03 are member-level hosts, and d9-09 is a misplacement filing on 8228-8796 only; which seams and homes to cut is a design decision requiring a human ruling (triage: claude-fable-5-1)
