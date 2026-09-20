---
id: pending
title: Provable argument-type collection mirrors static inference Expr/Binary switches
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/invoke-expr-call-surface.ts:58-216
  - src/parser/static-type-inference.ts:271-416
  - src/parser/static-type-inference.ts:588-644
sites: 2
fix_scope: cross-module
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Provable argument-type collection mirrors static inference Expr/Binary switches

## Observation
`collectProvableArgTypes` in `src/extension/invoke-expr-call-surface.ts` is a second pass over the `Expr` union whose job is to return the set of types one expression can evaluate to. Its header comment states that it "mirrors `#typeExpr` / `#typeBinary` shape for shape, so a collected member can never render differently from the type the pass itself assigns." `#typeExpr` and `#typeBinary` in `src/parser/static-type-inference.ts` are the primary pass that assigns those types. Both passes must cover the same `Expr` kinds and treat binary operators the same way, or the argument-type checks that consume `collectProvableArgTypes` will disagree with the inference pass's own reductions.

## Evidence
`src/extension/invoke-expr-call-surface.ts:58-216` (`collectProvableArgTypes`) switches over these `Expr` kinds:

```typescript
switch (expr.kind) {
  case "number":
  case "string":
  case "bool":
  case "null":
  case "ternary":
  case "match":
  case "try":
  case "block":
  case "binary":
  case "array":
  case "ident":
  case "member":
  case "call":
  case "invoke":
  case "query":
  case "object":
  case "result-ctor":
  case "method-call":
  case "index":
  case "par-for":
}
```

`src/parser/static-type-inference.ts:271-416` (`#typeExpr`) switches over these `Expr` kinds:

```typescript
switch (node.kind) {
  case "number":
  case "string":
  case "bool":
  case "null":
  case "ident":
  case "array":
  case "binary":
  case "ternary":
  case "try":
  case "match":
  case "member":
  case "index":
  case "call":
  case "invoke":
  case "query":
  case "object":
  case "result-ctor":
  case "method-call":
  case "par-for":
  case "block":
}
```

`src/parser/static-type-inference.ts:588-644` (`#typeBinary`) dispatches on the binary operator with the same special cases `collectProvableArgTypes` reproduces: unary `!` / `-` modeled as `null`-left binaries, boolean/comparison operators, `/`, `%` with a static zero-integer divisor, and the arithmetic fallback.

Parallel coverage count: both the primary inference switch and the provable-arg-type switch cover all 20 `Expr` kinds; when `Expr` gains a case, both must gain a matching arm. The binary sub-switch in `collectProvableArgTypes` must also stay aligned with `#typeBinary`'s five operator groups.

## Why this is a problem
This is the parallel class the brief calls out explicitly: two passes over the AST that each switch over the same `Expr` union. The function's own doc comment makes the load-bearing claim that the mirroring guarantees a collected member never renders differently from the inference pass's assigned type. If a new expression kind is added to the union and only one pass is updated, the argument-type checks could either fire a false positive on a value the runtime accepts, or miss a provable mismatch. The binary-operator cases are especially sensitive: the zero-integer-divisor `%` widening and the unary-operator modeling are both subtle rules that are duplicated in intent across the two passes.

## Suggested direction (non-binding, optional)
A shared source of truth for the "value-contributing positions" contract is the hypothesis; today the two files maintain parallel switch statements.

## False-positive check
- Re-verified the cited function spans in the current files; both implementations are live and reached from argument-type checking paths.
- Searched `quality/intake/` for `collectProvableArgTypes`, `provableArgType`, and related terms: no existing duplication/drift filing for this parallel switch.
- The similarity is not a spec-normative vector table; it is two application passes that must agree on the same AST discriminant set.
- No test files are involved.

## Triage
verdict: questionable — accounting verified: `Expr` (theta-document.ts:463-483) has exactly 20 members and both `collectProvableArgTypes` (:58-216) and `#typeExpr` (:271-416) enumerate all 20, the binary arm mirrors `#typeBinary`'s five operator groups (:588-644) in order, all copies live (5 non-recursive callers), clone-scan lists no group as expected for a parallel; the co-edit risk is real and asymmetric (a tsc fixture confirms a missing arm in the `| undefined`-returning switch compiles to a silent withhold while `#typeExpr`'s `CompatType` return hits TS2366), but the shared operator predicates/`pass.typeOf` are already imported and docs/bugs 0142 §Fix(b)/0152 §Fix(c) pin the mirror as a deliberate precedent, so the shared source of truth is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: `Expr` (theta-document.ts:463-483) has exactly 20 members; `collectProvableArgTypes` (invoke-expr-call-surface.ts:58-216) and `#typeExpr` (static-type-inference.ts:271-416) each enumerate all 20 with no `default`; the binary arm reproduces `#typeBinary`'s five operator groups (:588-644) in the same order; all copies live (callers invoke-static-checks.ts:376/665/1108, invoke-imported-checks.ts:262, same-file :294); clone-scan map lists no group (expected for a parallel); no existing PTQ or intake file tracks this root cause (PTQ-0296/0309 are stale-count comments, d9-03-provableargtype is type-layer-checks.ts's separate function). The header's "a kind added without an arm here is a compile error" is refuted under the repo tsconfig (no `noImplicitReturns`): a tsc fixture shows the `| undefined`-returning switch compiles to a silent withhold while `#typeExpr`'s `CompatType` return hits TS2366, so the co-edit risk is real and asymmetric — but `BOOLEAN_BINARY_OPS`/`isStaticZeroIntegerDivisor`/`pass.typeOf` are already shared and docs/bugs 0142 §Fix(c)/0152 §Fix(c) pin the MIRROR as a deliberate precedent; whether to introduce a shared source of truth is a design decision for a human ruling (triage: claude-fable-5-1)
