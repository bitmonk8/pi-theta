---
id: pending
title: Imported-fn and same-file fn parameter-annotation guards have diverged
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/invoke-imported-checks.ts:226-241
  - src/parser/type-layer-checks.ts:2789-2807
sites: 2
fix_scope: cross-module
d4_class: drift
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Imported-fn and same-file fn parameter-annotation guards have diverged

## Observation
`checkImportedFnCallArgs` in `src/extension/invoke-imported-checks.ts` judges imported `.thetalib` `fn` call arguments at compose time. Its per-slot loop begins with the same two guards that `checkFnCallArgs` in `src/parser/type-layer-checks.ts` uses for same-file `fn` calls: skip a parameter whose `type` source is not a valid `Type` expression, and skip a parameter whose type does not reduce to a `CompatType`. The two copies are visibly related — the imported route's comment says it mirrors `checkFnCallArgs`'s "identical guard on the same-file route" — but the text has diverged in variable names, comments, and the surrounding loop body.

## Evidence
Clone-map group G059 (65 tokens, renamed-only) cites both spans; re-diff shows the copies have drifted.

`src/extension/invoke-imported-checks.ts:226-241`:

```typescript
      const param = callee.fn.params[i] as FnParam;
      if (param.type.length > 0 && annotationSourceIsNotTypeExpression(param.type)) {
        // The library's own parameter annotation derives from none of
        // `Type`'s six alternatives — treated as absent rather than as an
        // opaque nominal reading of the junk text, mirroring
        // `checkFnCallArgs`'s identical guard on the same-file route.
        continue;
      }
      const paramType = annotationToCompatType(param.type);
      if (paramType === undefined) {
        // An unannotated library parameter has no declared type to judge
        // against (type-system.md §"Absent operands").
        continue;
      }
      const argExpr = call.args[i] as Expr;
      const argTypes = collectProvableArgTypes(argExpr, importerEnv, importerPass);
```

`src/parser/type-layer-checks.ts:2789-2807`:

```typescript
      const p = fn.params[i] as FnParam;
      if (p.type.length > 0 && annotationSourceIsNotTypeExpression(p.type)) {
        // The callee's own parameter annotation derives from none of `Type`'s
        // six alternatives, so it supports no verdict — treated as absent
        // rather than as an opaque nominal reading of the junk text. This
        // reads the callee's `FnParam` list out of `fnDecls`, which carries
        // the declaration verbatim rather than a projected type, so the
        // absence invariant (`annotationSourceIsNotTypeExpression`) is
        // established here; a reader of `fnScope` inherits it instead.
        continue;
      }
      const paramType = annotationToCompatType(p.type);
      if (paramType === undefined) {
        // An unannotated parameter (`p.type` is the empty string) has no
        // declared type to be an element sink either.
        continue;
      }
      const arg = e.args[i] as Expr;
      const argType = this.provableArgType(arg, bindings);
```

Diff verdict: diverged. The guard expressions are structurally identical (`param.type.length > 0 && annotationSourceIsNotTypeExpression(...)`, then `annotationToCompatType(...) === undefined`), but the variable names differ (`param`/`argExpr`/`argTypes`/`collectProvableArgTypes` vs `p`/`arg`/`argType`/`this.provableArgType`), the comments describe different provenance models, and the continuation after the guards uses a different type-collection strategy.

## Why this is a problem
The imported route is explicitly intended to behave like the same-file route for parameter annotation validity. `imports.md` §Visibility and `invocation.md` §Argument arity require an imported `fn` call to be judged by the same rules as a same-file `fn` call. If the guards drift — for example, one copy changes the `param.type.length > 0` precondition or starts treating a non-`Type` expression differently — the two routes would produce different verdicts for the same malformed parameter annotation, violating the symmetry the imported route's own comment claims to preserve. The divergence in comments also means the rationale for the guard is now described differently in two places, so a future edit is likely to update only one copy.

## Suggested direction (non-binding, optional)
The natural shared home for the guard pair is the parser/type-layer module that already owns same-file `fn` argument checking, with an exported helper consumed by the compose-pass imported route.

## False-positive check
- Re-verified both cited spans in the current files; both copies are live.
- Confirmed the clone-map group G059 matches these exact line ranges.
- Searched `quality/intake/` for `checkImportedFnCallArgs` and `checkFnCallArgs`: the only existing intake issue is a D2 doc-roster mismatch (`qw20260920183643-d2-08-enumnames-roster-names-wrong-file-for-checkimportedfncallargs.md`), not a duplication/drift finding.
- The similarity is not a spec-normative vector table; it is duplicated application logic.
- No test files are involved.

## Triage
