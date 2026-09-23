---
id: pending
title: collectProvableArgTypes survives in extension/invoke-expr-call-surface.ts as a one-line forward to a parser method, and two of its three src importers are parser modules that import it upward
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/invoke-expr-call-surface.ts:34-40
sites: 1
fix_scope: cross-module
d9_class: misplacement
wave: qw20260923185337
reported_by: lens-d9-placement (anthropic/claude-opus-5-5)
date: 2026-09-23
---

# collectProvableArgTypes survives in extension/invoke-expr-call-surface.ts as a one-line forward to a parser method, and two of its three src importers are parser modules that import it upward

## Observation
`collectProvableArgTypes` (src/extension/invoke-expr-call-surface.ts:34-40, 7 LOC; map importers 3 src / 0 tests) is a free function. Its whole body is `return pass.collectProvableArgTypes(expr, env);`, a forward to the `StaticTypeInferencePass` method at src/parser/static-type-inference.ts:313. Commit 7c3f9eb2 (2026-09-21) reduced it to this forward. The same commit moved its paired renderer `renderCollectedTypes` to src/parser/static-type-inference.ts:973, which this module now only re-exports (:45). Two days later, commits f7c9bb41 (PTQ-1268) and 65fe42f7 (PTQ-1266) moved two of its consumers into `src/parser/`. Both now import this extension-layer forward, and the renderer re-export, upward.

## Evidence
src/extension/invoke-expr-call-surface.ts:29-45:
```
 * contract. The set is computed by the SAME `Expr` switch that assigns the
 * reduced type (`#typeValue`), so a collected member can never render
 * differently from the type the pass itself assigns; this free-function seam
 * only keeps every call-surface consumer's existing import shape.
 */
export function collectProvableArgTypes(
  expr: Expr,
  env: TypeEnv,
  pass: StaticTypeInferencePass,
): CompatType[] | undefined {
  return pass.collectProvableArgTypes(expr, env);
}

// The `<actual>`-placeholder renderer for a collected value-type set lives
// beside the collection itself (../parser/static-type-inference.ts); re-exported
// so every call-surface consumer keeps its existing import shape.
```

src/parser/static-type-inference.ts:313-315 (the delegate):
```
  collectProvableArgTypes(expr: Expr, env: TypeEnv): CompatType[] | undefined {
    return this.#typeValue(expr, env, new Map()).members;
  }
```

Affinity, counted both ways. The declaration touches 5 parser members across 3 modules: `StaticTypeInferencePass` and its `collectProvableArgTypes` method (static-type-inference.ts, imported at :12-15), `Expr` (theta-document, :5), and `TypeEnv` and `CompatType` (type-compat, :16). It touches 0 members of its own host.

Importers (`grep -rn -E "\bcollectProvableArgTypes\b" src`, imports and call sites only):
- src/parser/invoke-callee-arity.ts:4 `import { collectProvableArgTypes } from "../extension/invoke-expr-call-surface";`, called at :208.
- src/parser/with-clause-static-checks.ts:22 `import { collectProvableArgTypes, renderCollectedTypes } from "../extension/invoke-expr-call-surface";`, called at :63.
- src/extension/invoke-static-checks.ts:130 (import), called at :599. It re-exports at :133 for src/extension/invoke-imported-checks.ts:55 (called at :249).
- In the host: `checkCallableArgumentTypes` :92.

Sibling pattern: the forward's pair, `renderCollectedTypes`, is declared at src/parser/static-type-inference.ts:973 beside the collection it renders. The host only re-exports it (:45). The method the forward calls is at :313 of the same parser module.

## Why this is a problem
Counted affinity is 5 parser members against 0 host members. The declaration's only content is a call into a parser class, and 2 of its 3 src importers are parser modules. The "existing import shape" the doc comment says the seam preserves (:31-32) was the shape at 7c3f9eb2, when every consumer was in `src/extension/`. For the two parser consumers moved afterwards, that shape is an upward parser→extension edge. PTQ-1268's own filing named this function as "the only layer edge blocking the move (parser must not import extension)" (quality/resolved/PTQ-1268-invoke-callee-arity-parser-affinity.md:40). The move landed without re-pointing it. The same-wave D4 intake (qw20260923185337-d4-01, "Why this is a problem") also records that `type-layer-provable.ts` keeps a parallel switch because "the parser layer cannot import the extension-layer `collectProvableArgTypes`".

## Suggested direction (non-binding, optional)
Hypothesis, unproven: home the free function in src/parser/static-type-inference.ts beside `renderCollectedTypes` (:973). Or have the two parser consumers call `typePass.collectProvableArgTypes(...)` and import `renderCollectedTypes` from their own layer. In either case invoke-expr-call-surface.ts keeps a re-export line if the extension consumers should keep their import shape. 7 LOC; 1 exported symbol; external importers 3 src / 0 tests; cross-references back into the host: none.

## False-positive check
- Affinity counts both ways: 5 parser members vs 0 host members, from the signature :34-40 and imports :5/:12-16, re-read at HEAD.
- Sibling-pattern citation: `renderCollectedTypes` is declared at parser/static-type-inference.ts:973 and only re-exported at host :45. The delegate method is at :313.
- Facade check: the doc comment (:31-32) calls this a seam that keeps the consumers' import shape, so it is a compatibility forward by intent. It is filed as misplacement, not husk. The host is not hollow (359 LOC, two check functions of 93 and 209 LOC). The finding is about which layer the forward sits in, now that 2 of its 3 src importers are parser modules. It is not a claim that the forward should be deleted.
- Importer count is the map's (3/0), matching the grep. invoke-imported-checks.ts reaches it through the invoke-static-checks.ts:133 re-export.
- Not dead: every caller listed is live production code, so no D2 routing is needed.
- Dedupe: PTQ-1138 (resolved) is the D4 parallel whose fix produced the forward. PTQ-1266/1268 (resolved) re-homed the two consumers, which are different hosts. d9-02 of this wave is `collectCallSites` in invoke-static-checks.ts, a different declaration and host. qw20260923185337-d4-01 is a parallel-switch finding in type-layer-provable.ts. qw20260923185337-d8-01 quotes the import line only as context. No item keys this declaration's placement.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified; target shape needs a human ruling: invoke-expr-call-surface.ts:34-40 matches the quote and its whole body is `return pass.collectProvableArgTypes(expr, env);`, which forwards to static-type-inference.ts:313-315 (`this.#typeValue(expr, env, new Map()).members`); it touches only parser members (`Expr` from theta-document :5, `StaticTypeInferencePass` from static-type-inference :12-15, `TypeEnv`/`CompatType` from type-compat :16) and nothing from its own host; `renderCollectedTypes` is declared at static-type-inference.ts:973 and only re-exported at host :45; my grep reproduces the importers: parser/invoke-callee-arity.ts:4 (call :208), parser/with-clause-static-checks.ts:22 (calls :63/:75), extension/invoke-static-checks.ts:130 (call :599, re-export :133 for invoke-imported-checks.ts:55/:249), host call :92, no test callers; `git show --stat` shows f7c9bb41 and 65fe42f7 moving those two consumers extension→parser; PTQ-1268:40 does name this call as "the only layer edge blocking the move (parser must not import extension)"; not a duplicate — no issues/ or intake row keys this declaration's placement (d9-02 is collectCallSites, d8-01 cites the import only as context, PTQ-1138/1266/1268 are resolved with different hosts) (triage: claude-opus-5-5)
