---
id: pending
title: The synchronous pure-expression evaluator family lives in extension/ but touches only runtime/ and parser/ members
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:8228-8796
sites: 8
fix_scope: cross-module
d9_class: misplacement
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# The synchronous pure-expression evaluator family lives in extension/ but touches only runtime/ and parser/ members

## Observation
Eight module-level declarations at the tail of src/extension/production-theta-producer.ts implement the synchronous pure-expression evaluator: `evaluatePureExpression` (8228-8433), `evaluatePureFnCall` (8446-8523), `PureBlockOutcome` (8526-8528), `evaluatePureBlock` (8535-8550), `evaluatePureStatement` (8560-8583), `evaluatePureIf` (8586-8609), `evaluateStdlibMethod` (8632-8650), `evaluateBinaryExpression` (8659-8796) — ~569 LOC total. They are theta-language interpretation (the sync twin of `runtime/statement-executor.ts`'s async evaluator), and both runtime consumers declare the seam they fill: `runtime/statement-executor.ts:136` and `runtime/effectful-statement-host.ts:153` each declare `evaluatePure(expr, env, chain)` as a host-deps member.

## Evidence
Affinity counted both ways. The family touches 26 distinct members of foreign runtime/ hosts, 1 member of its own module outside the family:
- runtime/lexical-environment: `LexicalEnvironment.resolve`, `.resolveSchema`, `.resolveEnumVariant`, `.currentResidence`, `.child` (5)
- runtime/value: `makeOk`, `makeErr`, `isResultValue`, `defineRecordField`, `valuesEqual`, `buildObjectSchemaValue` (6; import lines 255-266)
- runtime/statement-executor: `BinaryMixedOperandError`, `BinaryNonNumericError`, `BooleanPositionKindDefectError`, `IndexKindDefectError`, `ThetaFnArityError`, `UnaryNonNumericError` (6; import lines 165-176)
- runtime/runtime-panics: `evaluateIndexAccess`, `evaluateMemberAccess`, `evaluateQuestion`, `QuestionOperandDefectError`, `isThetaPanic`, `attachPanicSite`, `attachPanicRange` (7; import lines 307-319)
- runtime/stdlib-string/-array/-object: `evaluateStringMember`, `evaluateArrayMember`, `evaluateObjectMember` (3; via `evaluateStdlibMethod`, import lines 266-268)
Own-module members outside the family: `raiseInterpolatedResult` (8038-8040, 3 LOC — itself a wrapper over a runtime-imported panic constant, `INTERPOLATED_RESULT_MESSAGE`, import line 331). Members of `ProductionThetaProducer`, `LivePromptQueryModel`, or any pi host surface touched: 0.

Sibling-pattern citation: the async twin of every arm lives in runtime/statement-executor.ts and the file's own comments bind them in lockstep per instance — 8271 ("identical to the executor's `case \"object\"` arm (statement-executor.ts), the lockstep obligation bug 0027 records"), 8300-8303 ("Both hosts move in lockstep (statement-executor.ts's index arm, same belt)"), 8371-8375 ("`evaluateQuestion` is the shared synchronous V4b primitive `evalTry` (statement-executor.ts) also calls"), 8747-8750 ("mirrors the executor's `applyBinaryScalar` bug 0332 belt (statement-executor.ts)"). runtime/statement-executor.ts:1305 also names the extension-side function from the runtime layer: "into `evaluatePureExpression`'s `default: return null` safety net".

Excerpt (runtime/effectful-statement-host.ts:142-153, the seam the family fills):
```ts
 *   - `evaluatePure` evaluates a pure (non-checkpointed) sub-expression.
...
  evaluatePure(expr: Expr, env: LexicalEnvironment, chain?: InvokeChain): ThetaValue;
```

## Why this is a problem
The declarations' affinity is entirely with the runtime layer: 26 foreign runtime/ member touches vs 1 own-module touch (a 3-LOC raise wrapper), and 0 touches of any extension concern (pi API, session, spawn, composition). The seam it implements is declared twice in runtime/ (statement-executor.ts:136, effectful-statement-host.ts:153), and the sibling-in-kind for every arm (the async executor, the shared `evaluateQuestion`/defect-error primitives) lives in runtime/statement-executor.ts — the lockstep comments quoted above must today be maintained across a layer boundary. This is a layer crossing with counts: extension/ hosting interpreter code whose every dependency and every twin is runtime/.

## Suggested direction (non-binding, optional)
Hypothesis (unproven): move the eight declarations to `runtime/pure-expression-evaluator.ts` (~569 LOC). Symbols needing export after the move: `evaluatePureExpression` (host callers at lines 1807, 2266, 4357, 4779, 4825, 5706, 7999, 8212 of the producer) and possibly `evaluateStdlibMethod`; external importers today: 0 src / 0 tests (all module-private). Cross-references back into the host: `raiseInterpolatedResult`/`INTERPOLATED_RESULT_MESSAGE` (both resolvable from runtime — the message constant is already imported from a runtime module), and `evaluateCallSiteCwd` (8198-8215) which stays or moves with it.

## False-positive check
Affinity counted both ways (26 runtime members named above vs 1 own-module member; 0 extension-state touches). Sibling-pattern cited per instance (four lockstep comments quoted with line numbers; runtime/statement-executor.ts:1305 back-reference verified by grep). Not a barrel/facade and not deadness: all eight declarations have live in-file callers (grep hits at 1807, 2266, 4357, 4779, 4825, 5706, 7999, 8212, 8541-8608, 8674-8722). Duplicate check: D4 findings in the prior wave file arm-level clones (e.g. qw20260920183643-d4-11-literal-primary-expression-dispatch-cloned) — those claim duplication of specific arms; this finding claims module placement of the whole family, a distinct root cause. No exemptions.json entry covers these declarations.

## Triage
verdict: questionable — accounting verified (and understated: ~32 foreign runtime/ members incl. thetalibFnFrameKind/pushCountableFrame/pushPanicFrame/nonObjectReceiverRejection/isObjectValue/defineLocal vs 1 own-module 3-LOC wrapper over a runtime-imported panic class; seam at statement-executor.ts:136 + effectful-statement-host.ts:153, lockstep comments and runtime back-ref at 1305 all reproduce; no external importers, no D9 exemption; same-wave d9-01 is a distinct breakdown root cause); target home/shape needs a human ruling (triage: claude-fable-5-1)
