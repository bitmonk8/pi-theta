---
id: PTQ-1304
title: arithmetic operator switches cloned between compound and binary expressions
lens: D4
status: open
verdict: confirmed
locations:
  - src/runtime/statement-executor.ts:746-759
  - src/runtime/statement-executor.ts:1227-1240
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# arithmetic operator switches cloned between compound and binary expressions

## Observation
`src/runtime/statement-executor.ts` performs arithmetic for both compound assignments (`-=`, `*=`, `/=`, `%=`) in `applyCompound` and binary expressions (`-`, `*`, `/`, `%`) in `evalBinary`. In each case the code first rejects non-numeric operands, then switches on the operator and returns the corresponding JavaScript arithmetic result. The two switch blocks are renamed-only copies of each other, differing only in whether the operator string carries a trailing `=` and whether the operands are named `current`/`delta` or `left`/`right`.

## Evidence

**`src/runtime/statement-executor.ts:746-759` (`applyCompound`):**
```typescript
  if (typeof current !== "number" || typeof delta !== "number") {
    throw new CompoundNonNumericError(op, current, delta);
  }
  switch (op) {
    case "-=":
      return current - delta;
    case "*=":
      return current * delta;
    case "/=":
      return current / delta;
    case "%=":
      return current % delta;
  }
```

**`src/runtime/statement-executor.ts:1227-1240` (`evalBinary`):**
```typescript
      if (typeof left !== "number" || typeof right !== "number") {
        throw new BinaryNonNumericError(op, left, right);
      }
      switch (op) {
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "%":
          return left % right;
      }
```

**Diff verdict:** renamed-only (operator suffix and variable names); the non-numeric guard, the four arithmetic operations, and the JavaScript coercion-free semantics are identical. Clone-map group **G048**.

## Why this is a problem
Theta compound assignment is specified as equivalent to the corresponding binary operation; the two sites must agree on numeric admission, `NaN`/`Infinity` handling, and error disposition. If one site is hardened (for example, to reject `NaN` operands or to change div/mod semantics) and the other is missed, `x = x - y` and `x -= y` will diverge. Both sites already carry matching bug-0368 belt comments that justify the non-numeric rejection, confirming they are intended to be the same rule.

## Suggested direction (non-binding, optional)
A shared helper in `src/runtime/` that performs the four basic arithmetic operations given two numbers and an operator token. Both `applyCompound` and `evalBinary` would delegate to it after their own operand preparation, so a single change to arithmetic semantics applies to both expression forms.

## False-positive check
- Both excerpts re-read verbatim at the cited lines; text matches clone-map group **G048**'s boundaries.
- Both copies live: `applyCompound` is called from the assignment-statement path; `evalBinary` is called from `evalExpr`.
- Not `tests/` or generated code.
- Not a spec-repeated normative vector; expressions.md states the arithmetic rule once and these are two implementations of it.
- Duplicate check: searched `quality/intake`, `quality/issues`, and `quality/resolved` for `applyCompound` + `evalBinary` arithmetic and for `G048`; no existing finding covers this pair.

## Triage
verdict: confirmed — excerpts match verbatim at 746-759/1227-1240 and `clone-scan map` reproduces `G048 — 64 tokens — renamed-only (17)` on exactly those ranges; both copies live (evalBinary ← evalExpr at :949, applyCompound ← reassign arm at :1627); anchor holds — bindings.md#compound-assignment-desugar defines `x <op>= e` as `x = x <op> e`, so these are two implementations of one rule, not a spec vector table; two corrections for the fixer: (1) the guard lines are NOT renamed-only — `CompoundNonNumericError` (bug 0314, ops `-=|*=|/=|%=`) and `BinaryNonNumericError` (bug 0332, ops `-|*|/|%`) are deliberately distinct belts with distinct messages per executor-defects.ts:25-53, so the dedupe target is only the 4-arm numeric switch (with a `-=`→`-` op mapping at the compound site) and each guard stays per-site; (2) the filing undercounts — a third identical switch sits at src/runtime/pure-expression-evaluator.ts:599-605 (the pure host is a ruled deliberate lockstep twin, REVIEW_LOG.md:582), which a shared helper could also serve (triage: claude-fable-5-1)
