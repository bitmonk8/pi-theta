---
id: pending
title: the QRY-18 interpolation render/outbound-translation cluster lives in production-theta-producer.ts while its whole substrate lives in render/query-render and runtime modules
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:6285-6313
  - src/extension/production-theta-producer.ts:6333-6370
  - src/extension/production-theta-producer.ts:6388-6390
  - src/extension/production-theta-producer.ts:6411-6462
  - src/extension/production-theta-producer.ts:6465-6468
  - src/extension/production-theta-producer.ts:6471-6474
sites: 6
fix_scope: cross-module
d9_class: misplacement
wave: qw20260922164435
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# the QRY-18 interpolation render/outbound-translation cluster lives in production-theta-producer.ts while its whole substrate lives in render/query-render and runtime modules

## Observation
Six module-private declarations at the tail of src/extension/production-theta-producer.ts implement the QRY-18 query-interpolation render and its outbound wire-name translation: `renderQueryText` (6285-6313, 29 LOC), `stringifyInterpolation` (6333-6370, 38 LOC), `NestedResultReach` (6388-6390), `translateInterpolationOutbound` (6411-6462, 52 LOC), `identifierTypeSource` (6465-6468), `arrayElementTypeSource` (6471-6474) — ~130 LOC total. The module's header role is the production `ThetaProducerDeps` composition entry (mode routing: binder, prompt bind, subagent spawn); this cluster is a pure value→text lowering with no producer state.

## Evidence
Affinity counted both ways. The cluster touches 5 members of src/render/query-render (`interpolationTypeOf`, `lexQueryTemplate`, `renderEmptyShortCircuit` via the sole in-class caller, `renderTemplateText`, `stringifyInterpolatedValue` — imported at lines 299-304) plus 8 members of runtime modules (`evaluatePureExpression`, `raiseInterpolatedResult` from runtime/pure-expression-evaluator; `isThetaPanic`, `retargetInterpolationPanic` from runtime/runtime-panics; `isEnumValue`, `isResultValue`, `schemaTagOf`, `defineRecordField` from runtime/value; plus `LexicalEnvironment.resolveSchema`/`.currentResidence`), and 0 members of its own host: none of the six declarations reads `this.#` or any `ProductionThetaProducer` member. Host-side use is two call sites: `renderQueryText` at 2239 (`#buildPromptHostDeps`) and `renderTypedAwareQueryText` (6099-6114). Sibling pattern: the substrate modules already document this cluster as their sibling by name — render/query-render.ts:376 ("`stringifyInterpolation` can raise QRY-18's runtime fallback"), runtime/pure-expression-evaluator.ts:136 and 462 ("the interpolation route (`renderQueryText` → `stringifyInterpolation`)"), runtime/runtime-panics.ts:233/245/258, runtime/value.ts:349 ("the QRY-18 walk (`translateInterpolationOutbound`, ...)"). Excerpt (6285-6291):
```ts
function renderQueryText(expr: QueryExpr, env: LexicalEnvironment, chain?: InvokeChain): string {
  const lexed = lexQueryTemplate(expr.template);
  let text = "";
  for (const part of lexed.parts) {
    if (part.kind === "text") {
      text += part.value;
      continue;
```
The inbound half of the same spec pass (runtime-value-model.md §Wire-name translation) lives in runtime/ (`decodeInboundValue`, runtime/inbound-boundary, imported at line 267); only the outbound half lives in the extension composition module.

## Why this is a problem
Counted affinity: 13 foreign-module member touches (5 render/query-render + 8 runtime) against 0 own-host member touches; the pure-evaluator family this cluster drives was already re-homed to runtime/ under PTQ-1150's ratified seam A, and four substrate modules cross-reference these functions by name as if co-located. The declarations sit in extension/ purely because their two callers do, forcing every reader of the composition module through a value-lowering algorithm that shares nothing with composition, and leaving the spec's outbound translation in a different layer from its inbound counterpart.

## Suggested direction (non-binding, optional)
Hypothesis (unproven): re-home the six declarations to src/render/query-render (where `stringifyInterpolatedValue`/`interpolationTypeOf` already live), exporting `renderQueryText`; the host keeps its two call sites as imports. If render/ must not depend on runtime/pure-expression-evaluator, a runtime/ sibling of inbound-boundary is the alternative home. The human ratifies the layer.

## False-positive check
Affinity counted both ways with member names listed (13 foreign vs 0 own). Sibling-pattern citations: render/query-render.ts:376, runtime/pure-expression-evaluator.ts:136,462, runtime/runtime-panics.ts:233,245,258, runtime/value.ts:349 — all name these functions. Export check: all six are module-private (map: exported no, 0/0 importers), so no facade concern. Duplicate check: PTQ-1150's concern row named this cluster inside a file-level breakdown but no misplacement filing targets it (the ratified d9-09 misplacement covered only the evaluator family, since moved); PTQ-1218 targets render/ content, PTQ-1124 a clone in the typeof discriminator — different roots. Every cited range re-read immediately before filing.

## Triage
verdict: questionable — accounting verified with two corrections: all six declarations sit byte-exact at 6285-6313 / 6333-6370 / 6388-6390 / 6411-6462 / 6465-6468 / 6471-6474, contain zero `this.`/`ProductionThetaProducer` touches, and lean on 4 render/query-render members (interpolationTypeOf, lexQueryTemplate, renderTemplateText, stringifyInterpolatedValue — `renderEmptyShortCircuit` at 2239 is the host's call, not the cluster's, so the filed 5 is padded by one) + 8 runtime/ members (evaluatePureExpression, raiseInterpolatedResult, isThetaPanic, retargetInterpolationPanic, isEnumValue, isResultValue, schemaTagOf, defineRecordField, plus env.resolveSchema/currentResidence) + 1 parser/ member the filing omitted (parseExpressionSource, theta-document import at 264), i.e. ≥ 13 foreign vs 0 own; host callers are three not two (2239, 3864 in the prompt-query resolve path, 6105), all in-file, 0 external importers (test hits are string literals); sibling citations at query-render.ts:376, pure-expression-evaluator.ts:136/462, runtime-panics.ts:233/245/258, value.ts:349 all name these functions; exemptions.json holds only the D8 #firstAdmittingArmProperties row; not a duplicate — PTQ-1150 (fixed breakdown) and same-wave d9-01 (residual breakdown) list this cluster as an inventory row/seam hypothesis, but per the PTQ-1150/PTQ-1196 precedent a misplacement filing is a distinct root cause from the host breakdown, and PTQ-1196/1218/1124 target other declarations; the target home (render/ vs a runtime/ sibling of inbound-boundary, given render/ would then depend on pure-expression-evaluator) is a design decision for a human ruling (triage: claude-fable-5-1)
