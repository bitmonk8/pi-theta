---
id: pending
title: ThetaFnArityError, a runtime defect error thrown by all three fn-call evaluation engines, is declared in statement-executor.ts while its ten sibling executor defect classes live in executor-defects.ts
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/statement-executor.ts:240-244
sites: 1
fix_scope: cross-module
d9_class: misplacement
wave: qw20260923203928
reported_by: lens-d9-placement (anthropic/claude-opus-5-5)
date: 2026-09-23
---

# ThetaFnArityError, a runtime defect error thrown by all three fn-call evaluation engines, is declared in statement-executor.ts while its ten sibling executor defect classes live in executor-defects.ts

## Observation
`ThetaFnArityError` (src/runtime/statement-executor.ts:240-244, 5 LOC per the structural map, with an 8-line doc comment at 232-239) is the only `extends Error` class left in statement-executor.ts. Its doc comment calls an arity mismatch at runtime "a defect" that "surfaces as a thrown error (routed to the extension's command-execution error surface, `theta/runtime/internal-error`)". The PTQ-1154 Seam B fix (commit d1461328) created src/runtime/executor-defects.ts, whose header reads "Runtime defect errors for the statement executor and its evaluation engines". That fix moved the other executor defect classes there and left this one in statement-executor.ts. It is thrown by three evaluation engines: the in-process user-fn path, the subagent-fn path, and the pure evaluator.

## Evidence
The declaration (src/runtime/statement-executor.ts:232-244):
```ts
/**
 * A `<name>(args)` call whose arg count does not match the resolved `fn`'s
 * declared parameter count. Arity is a type-phase concern the theta grammar
 * expects to be well-formed by execution time, so a mismatch reaching the
 * runtime is a defect: it surfaces as a thrown error (routed to the extension's
 * command-execution error surface, `theta/runtime/internal-error`) rather than
 * silently binding `null` for a missing arg or crashing the host.
 */
export class ThetaFnArityError extends Error {
  public constructor(name: string, expected: number, actual: number) {
    super(`function '${name}' expects ${expected} argument(s) but received ${actual}`);
  }
}
```

The sibling home's stated role (src/runtime/executor-defects.ts:1):
```ts
// Runtime defect errors for the statement executor and its evaluation engines.
```

Sibling-pattern citation: `grep -c "extends Error"` gives executor-defects.ts 10 (CompoundNonNumericError :25, BinaryNonNumericError :46, UnaryNonNumericError :70, BinaryMixedOperandError :92, ForIterandKindDefectError :114, BooleanPositionKindDefectError :141, ParForUnwrittenSlotError :165, IndexKindDefectError :187, RejectedWriteDefectError :208, UnknownVariantDefectError :250). The same count gives statement-executor.ts 1 (this class) and subagent-fn-call.ts, par-for-executor.ts and executor-result-flow.ts 0 each.

Affinity, counted both ways. The class is a leaf and references no module members, so affinity is counted by its throw sites (`grep -rn "new ThetaFnArityError" src`):
- 1 throw site in its own host: `evalUserFnCall` (statement-executor.ts:293).
- 2 throw sites in foreign modules: `evalSubagentFnCall`'s argument binder (subagent-fn-call.ts:95) and `evaluatePureFnCall` (pure-expression-evaluator.ts:305).

The pure evaluator's import already mixes this class with three executor-defects.ts classes, all reached through the host's `export * from "./executor-defects"` (statement-executor.ts:42), (src/runtime/pure-expression-evaluator.ts:4):
```ts
import { BooleanPositionKindDefectError, IndexKindDefectError, ThetaFnArityError, UnaryNonNumericError } from "./statement-executor";
```

Importer count (structural map, quoted): ThetaFnArityError 2/0 (src: subagent-fn-call.ts, pure-expression-evaluator.ts; tests: 0).

## Why this is a problem
Counted affinity: 1 of the class's 3 throw sites is in its host and 2 are in other evaluation engines. It sits apart from the 10 classes in the module whose header claims exactly its role ("runtime defect errors for the statement executor and its evaluation engines"). As a result, subagent-fn-call.ts and pure-expression-evaluator.ts depend on statement-executor.ts for this class, and pure-expression-evaluator.ts:4 gets four defect errors from one import where three of them are declared in a different module.

## Suggested direction (non-binding, optional)
Home hypothesis, unproven: move `ThetaFnArityError` (13 lines with its doc) to src/runtime/executor-defects.ts. Exported symbols moved: 1 (external importers 2 src / 0 tests). Those importers keep working through statement-executor.ts:42's existing `export * from "./executor-defects"` or can import directly. There are no cross-references back into the host because the class references no module members.

## False-positive check
- Affinity counts both ways: 1 own throw site (statement-executor.ts:293) and 2 foreign (subagent-fn-call.ts:95, pure-expression-evaluator.ts:305), from `grep -rn "new ThetaFnArityError" src`. There are no string-keyed or dynamic uses; the remaining `grep -rn ThetaFnArityError src` hits are imports and comments.
- Sibling-pattern citation: 10 of the 10 other executor-engine defect classes are in executor-defects.ts (line numbers above). The tool-call-boundary defects `ShadowedCalleeDispatchDefectError`/`PiToolArgShapeDefectError` live in tool-call.ts, which is that boundary's own module, and are not engine siblings.
- History: `git log -S "class ThetaFnArityError" -- src` returns only 2bc69157 (the Loom→Theta rename). Commit d1461328 (the PTQ-1154 Seam B fix) moved the ten classes and left this one. PTQ-1154's inventory put it in the "call dispatch" row, which was a row assignment, not a ruling on its home. No bug doc or ruling pins it to statement-executor.ts.
- Not a layer crossing: both modules are in src/runtime/.
- Dedupe: no filing names ThetaFnArityError's placement (`grep -rl ThetaFnArityError quality/intake quality/issues quality/resolved` hits PTQ-1154/PTQ-1433 inventories, PTQ-0048, PTQ-1196 and PTQ-1409 (D2 re-export deadness), none of which is about its home). This wave's d9-01 breakdown candidate leaves it out of its seams.
- Range re-read at HEAD before filing: statement-executor.ts:232-244, executor-defects.ts:1, pure-expression-evaluator.ts:4 and :302-306, subagent-fn-call.ts:93-96.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling. The class and doc match statement-executor.ts:232-244. The executor-defects.ts:1 header matches, and that file has 10 `extends Error` classes at the cited lines. The `export *` is at :42. There are 3 throw sites: 1 in the host (:293) and 2 foreign (subagent-fn-call.ts:95, pure-expression-evaluator.ts:305). There are 2 src importers and no test importers. `git log -S` returns only 2bc69157, and no ruling pins the class to its host. d9-01 lists it in an inventory row, but its Seam A (246-375) leaves it out, so this is not a duplicate. One caveat: subagent-fn-call.ts:9 also imports evalExpr, executeBlock and panicSiteFile from statement-executor, so moving the class would not remove that module's dependency on the host (triage: claude-opus-5-5)
