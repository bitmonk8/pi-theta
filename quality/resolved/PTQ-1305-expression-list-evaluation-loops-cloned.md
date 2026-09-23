---
id: PTQ-1305
title: expression-list evaluation loops cloned for array literals and method calls
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/runtime/statement-executor.ts:863-871
  - src/runtime/statement-executor.ts:956-964
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# expression-list evaluation loops cloned for array literals and method calls

## Observation
`src/runtime/statement-executor.ts` evaluates two kinds of expression lists: the elements of an array literal (`expr.kind === "array"`) and the arguments of a method call (`expr.kind === "method-call"`). In both cases the code builds a mutable array, iterates over the sub-expressions, calls `evalExpr` on each, short-circuits and returns verbatim if the result is not a `value` flow, and otherwise pushes the resolved value. The two loops are renamed-only copies, differing only in loop variable names (`element`/`values` versus `arg`/`args`) and the source AST field.

## Evidence

**`src/runtime/statement-executor.ts:863-871` (array literal element loop):**
```typescript
  if (expr.kind === "array") {
    const values: ThetaValue[] = [];
    for (const element of expr.elements) {
      const evaluated = await evalExpr(element, env, deps);
      if (evaluated.flow !== "value") {
        return evaluated;
      }
      values.push(evaluated.value);
    }
    return { flow: "value", value: values };
  }
```

**`src/runtime/statement-executor.ts:956-964` (method-call argument loop):**
```typescript
    const args: ThetaValue[] = [];
    for (const arg of expr.args) {
      const evaluated = await evalExpr(arg, env, deps);
      if (evaluated.flow !== "value") {
        return evaluated;
      }
      args.push(evaluated.value);
    }
    return { flow: "value", value: applyStdlibMethod(receiver.value, expr.method, args) };
```

**Diff verdict:** renamed-only (variable names and AST field); the loop shape, the `evalExpr` call, the non-`value` short-circuit, and the value accumulation are identical. Clone-map group **G045**.

## Why this is a problem
Both sites implement the same rule for evaluating a list of sub-expressions inside an outer expression: left-to-right evaluation with short-circuit on terminal flow. If this rule changes (for example, to support spread, to change cancel propagation, or to attach panic sites) in one site but not the other, array literals and method-call argument lists will behave inconsistently. The duplication is in the core expression evaluator, so the inconsistency would surface directly to user code.

## Suggested direction (non-binding, optional)
A small helper in `src/runtime/` that takes an array of `Expr` and an evaluation context and returns either an array of resolved values or the first non-`value` flow. Both the array arm and the method-call arm of `evalExpr` would delegate to it, keeping the expression-list evaluation rule in one place.

## False-positive check
- Both excerpts re-read verbatim at the cited lines; text matches clone-map group **G045**'s boundaries.
- Both copies live: the array arm at 862-871 inside `evalExpr`; the method-call argument loop at 956-964 inside `evalExpr`.
- Not `tests/` or generated code.
- Not a spec-repeated normative vector; this is two code implementations of the same expression-list evaluation rule.
- Duplicate check: searched `quality/intake`, `quality/issues`, and `quality/resolved` for this array/method-call loop pair and for `G045`. The same wave already has findings about argument-list parsers in `body-parser.ts` (qw20260922211400-d4-01-argument-array-element-parsers-cloned.md) and imported-fn arg loops (qw20260922211400-d4-01-imported-fn-arg-loop-cloned.md), but neither covers these two `statement-executor.ts` evaluation loops.

## Triage
verdict: confirmed — excerpts byte-exact at statement-executor.ts:862-871 (array arm) and 951-964 (method-call arm) inside the live `evalExpr`; clone-scan map on statement-executor.ts reproduces `G045 — 65 tokens — renamed-only (6)` at exactly 863-871 / 956-964 and my own read confirms the bodies differ only in accumulator/loop-variable names and the AST field (`expr.elements` vs `expr.args`); both copies encode the same load-bearing rule the file's own comment states (left-to-right evaluation, any non-`value` flow short-circuits and is carried verbatim), so the stated breakage (drift in short-circuit/cancel handling between array literals and method-call args) is real rather than incidental; not a spec-normative vector; no PTQ row or same-wave sibling tracks this pair (PTQ-1163 is the D9 size filing on evalExpr, d4-01/d4-09 cover the applyStdlibMethod dispatcher at 1293-1306, not these loops); fix is a mechanical dedupe into one expression-list helper (triage: claude-fable-5-1)
