---
id: PTQ-1296
title: expression child accessor duplicated between theta-document and type-layer-checks
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/parser/theta-document.ts:3486-3514
  - src/parser/type-layer-checks.ts:706-736
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# expression child accessor duplicated between theta-document and type-layer-checks

## Observation

`src/parser/theta-document.ts` and `src/parser/type-layer-checks.ts` each define a private helper that returns the direct child expressions of an `Expr` node. `expressionChildExprs` (theta-document.ts) supports the interpolation-form scan and the call-site node walk; `childExprs` (type-layer-checks.ts) supports the `?` operand scan and is re-exported to `type-layer-walk.ts`. The two functions differ only in arm order and local name; their switch coverage over the `Expr` union is identical.

## Evidence

`src/parser/theta-document.ts:3486-3514`

```ts
function expressionChildExprs(e: Expr): readonly Expr[] {
  switch (e.kind) {
    case "binary":
      return [e.left, e.right];
    case "ternary":
      return [e.condition, e.consequent, e.alternate];
    case "try":
      return [e.operand];
    case "call":
    case "invoke":
      return [...e.args, ...callWithClauseValues(e)];
    case "member":
      return [e.target];
    case "index":
      return [e.target, e.index];
    case "object":
      return e.fields.map((f) => f.value);
    case "match":
      return [e.scrutinee, ...e.arms.map((arm) => arm.body)];
    case "result-ctor":
      return [e.arg];
    case "method-call":
      return [e.target, ...e.args];
    case "array":
      return e.elements;
    default:
      return [];
  }
}
```

`src/parser/type-layer-checks.ts:706-736`

```ts
function childExprs(e: Expr): readonly Expr[] {
  switch (e.kind) {
    case "binary":
      return [e.left, e.right];
    case "ternary":
      return [e.condition, e.consequent, e.alternate];
    case "try":
      return [e.operand];
    case "index":
      return [e.target, e.index];
    case "member":
      return [e.target];
    case "array":
      return e.elements;
    case "call":
    case "invoke":
      // RFC 0009: a `?` inside a call-site `with` clause value is scanned as one
      // inside an argument is.
      return [...e.args, ...callWithClauseValues(e)];
    case "object":
      return e.fields.map((f) => f.value);
    case "match":
      return [e.scrutinee, ...e.arms.map((arm) => arm.body)];
    case "result-ctor":
      return [e.arg];
    case "method-call":
      return [e.target, ...e.args];
    default:
      return [];
  }
}
```

Diff verdict: identical modulo arm order and the extra RFC 0009 comment in `childExprs`. Clone-map groups G026 (identical, `theta-document.ts:3500-3508` / `type-layer-checks.ts:724-732`) and G037 (renamed-only, `theta-document.ts:3476-3494` / `type-layer-checks.ts:702-714`) both fall inside the same duplicated function pair.

## Why this is a problem

The two helpers encode the same AST-shape truth: which sub-expressions exist for every `Expr` kind. They are load-bearing because consumers in three different walks rely on each accessor to reach nested expressions:

- `expressionChildExprs` is used by `walkCallSiteNodesInExpr` (`theta-document.ts:975`) to find reachable call sites, and by `firstForbiddenInterpolationForm` (`theta-document.ts:3470`) to descend into `${…}` interpolation sub-expressions.
- `childExprs` is used by `type-layer-walk.ts:929` and `:2257` for the `?` operand scan.

If a new `Expr` kind is added and only one helper is updated, the corresponding walk will silently skip the new node's children. The duplication is not incidental: both functions exist because each module wanted a local accessor rather than importing the canonical one.

## Suggested direction (non-binding, optional)

The exported `childExprs` in `type-layer-checks.ts` is already the canonical helper consumed by `type-layer-walk.ts`. The natural shared home is `src/parser/type-layer-checks.ts` (or a shared AST-traversal helper module under `src/parser/`), with `theta-document.ts` importing it and dropping `expressionChildExprs`.

## False-positive check

- Verified both functions are live: `expressionChildExprs` has call sites at `theta-document.ts:975` and `:3470`; `childExprs` is exported at `type-layer-checks.ts:794` and used at `type-layer-walk.ts:929`, `:2203`, `:2225`, and `:2257`.
- Searched `quality/intake/` for `childExprs` / `expressionChildExprs`: no existing filing.
- Both helpers cover the same `Expr` union and are not spec-normative vector tables.
- Not in `tests/`; not generated code.

## Triage
verdict: confirmed — both excerpts byte-accurate at theta-document.ts:3486-3514 and type-layer-checks.ts:706-736 and identical modulo arm order (same 11 arms + default, same callWithClauseValues call); clone-scan map on theta-document.ts reproduces G026 (identical, 3500-3508/724-732) and G037 (renamed-only, 3476-3494/702-714) inside the pair; both copies live (expressionChildExprs called at theta-document.ts:975,3470; childExprs exported at type-layer-checks.ts:794 and consumed at type-layer-walk.ts:929,2257); not a spec vector table; no existing D4 filing on this pair (PTQ-0288 resolved a different walker and only names expressionChildExprs as its landing spot, PTQ-1264/1277 are D9 placement) — mechanical dedupe (triage: claude-fable-5-1)
