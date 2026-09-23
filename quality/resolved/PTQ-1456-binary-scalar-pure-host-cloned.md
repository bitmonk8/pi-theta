---
id: PTQ-1456
title: Binary scalar operator switch is duplicated between executor-operators and pure-expression-evaluator
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/runtime/executor-operators.ts:98-190
  - src/runtime/pure-expression-evaluator.ts:526-592
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# Binary scalar operator switch is duplicated between executor-operators and pure-expression-evaluator

## Observation
`src/runtime/executor-operators.ts` exports `applyBinaryScalar`, which dispatches resolved binary operands for the effectful executor. `src/runtime/pure-expression-evaluator.ts` evaluates binary expressions in the pure host via `evaluateBinaryExpression`. After the pure host evaluates its left and right sub-expressions, its `switch (op)` arm for `==`, `!=`, `+`, `-`, `*`, `/`, `%`, `<`, `<=`, `>`, `>=` is byte-identical to the body of `applyBinaryScalar`, including the same per-bug guard shapes and `applyNumericArithmetic` delegation. `pure-expression-evaluator.ts` already imports `applyNumericArithmetic` and `applyStdlibMethod` from `executor-operators.ts`, but it does not import `applyBinaryScalar`; instead it inlines the same switch.

## Evidence

Clone-map group **G001** — 287 tokens, identical.

**Copy 1 — `applyBinaryScalar` in the effectful executor**
`src/runtime/executor-operators.ts:98-190`
```typescript
export function applyBinaryScalar(op: string, left: ThetaValue, right: ThetaValue): ThetaValue {
  switch (op) {
    case "==":
      return valuesEqual(left, right);
    case "!=":
      return !valuesEqual(left, right);
    case "+": {
      if (typeof left === "string" && typeof right === "string") {
        return left + right;
      }
      if (typeof left === "number" && typeof right === "number") {
        return left + right;
      }
      throw new BinaryMixedOperandError("+", left, right);
    }
```

**Copy 2 — inlined inside `evaluateBinaryExpression` in the pure host**
`src/runtime/pure-expression-evaluator.ts:526-592`
```typescript
  const right = evaluatePureExpression(rightExpr, env, chain);
  switch (op) {
    case "==":
      return valuesEqual(left, right);
    case "!=":
      return !valuesEqual(left, right);
    case "+": {
      if (typeof left === "string" && typeof right === "string") {
        return left + right;
      }
      if (typeof left === "number" && typeof right === "number") {
        return left + right;
      }
      throw new BinaryMixedOperandError("+", left, right);
    }
```

**Diff verdict:** identical executable structure; comments differ only in which side they name as the source of truth. The default arm, ordering arms, and `applyNumericArithmetic` delegation are the same.

## Why this is a problem
The effectful executor and the pure host must agree on binary-operator semantics for every theta program. The duplication is load-bearing: a future change to the `+` mixed-operand guard, the arithmetic non-number check, or the ordering admissibility rules in one copy will silently leave the other host applying the old rules. Because the pure host already imports shared helpers from `executor-operators.ts` (`applyNumericArithmetic`, `applyStdlibMethod`), the natural home for the shared operator disposition exists; the inline copy is incidental duplication, not a required seam.

## Suggested direction (non-binding, optional)
Consider whether `evaluateBinaryExpression` can delegate the already-evaluated left/right operands to the existing `applyBinaryScalar` helper in `executor-operators.ts`, or extract a shared binary-disposition function both call. The shared home is `src/runtime/executor-operators.ts`, which already hosts the related `applyNumericArithmetic` and `applyStdlibMethod` primitives.

## False-positive check
- Re-read both cited spans at HEAD; both copies are live and reachable.
- Verified `pure-expression-evaluator.ts:7` imports `applyNumericArithmetic` and `applyStdlibMethod` from `./executor-operators`, so the module boundary is already crossed for related helpers.
- Checked `quality/issues/` for existing filings mentioning `applyBinaryScalar` or `evaluateBinaryExpression`; none found.
- The comments frame the duplication as intentional mirroring, but the rationale explains behavior, not why a shared helper cannot be used; no circular-import barrier is stated.

## Triage
verdict: confirmed — excerpts byte-match at executor-operators.ts:98-190 and pure-expression-evaluator.ts:526-592 (the whole post-`&&`/`||` `switch (op)` of `evaluateBinaryExpression`, 462-593, is executable-identical to `applyBinaryScalar`; only comments differ); `clone-scan map` on executor-operators.ts reproduces `G001 — 287 tokens — identical` on exactly those ranges; both copies live (applyBinaryScalar ← statement-executor.ts:787 via the :46 import; evaluateBinaryExpression ← evaluatePureExpression's binary arm at :252, with 10 src importers of the pure host); not a spec vector table — one rule (expressions.md §Equality/§Ordering/§"Other arithmetic") implemented twice, and the pure host's own comments call each arm a "mirror" of applyBinaryScalar; no import barrier — pure-expression-evaluator.ts:7 already imports applyNumericArithmetic/applyStdlibMethod from executor-operators, which imports nothing back; the D8 shard-13 "deliberate lockstep twin" KEEP (REVIEW_LOG.md:582) is a reviewer note, not a human ruling, and it explicitly deferred to D4 clone tracking — precedent PTQ-1119/PTQ-1301 (applyStdlibMethod) deduped the same host pair into this exact shared module, and PTQ-1304's triage already flagged the pure host as the uncounted third arithmetic copy; not a duplicate — PTQ-1304 (resolved) covered only the 4-arm numeric switch (now applyNumericArithmetic), and no open filing cites applyBinaryScalar/evaluateBinaryExpression; fix is a mechanical delegate-to-existing-helper (triage: claude-fable-5-1)
