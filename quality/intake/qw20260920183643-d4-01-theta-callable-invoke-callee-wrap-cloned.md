---
id: pending
title: theta-callable and invoke callee-failure wrapping cloned in effectful-statement-host
lens: D4
status: intake
verdict: pending
locations:
  - src/runtime/effectful-statement-host.ts:377-406
  - src/runtime/effectful-statement-host.ts:554-601
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# theta-callable and invoke callee-failure wrapping cloned in effectful-statement-host

## Observation

`src/runtime/effectful-statement-host.ts` implements two production effect paths that both route a child-invocation `Result` through the same XMODE-1 callee-error wrapping rules:

- The `.theta`-callable branch inside `runToolCallEffect` (around line 349) resolves the callee as an `InvokeChild`, runs it through `runInvokeChild`, and wraps a callee-returned `Err` as an `InvokeCalleeError`.
- `runInvokeEffect` (around line 525) does the same for a literal `invoke(...)` expression.

Within the cited spans the two blocks are byte-identical except for identifier names and the literal values passed to `surfaceThetaCallableCalleeFailure` and `deps.recordInvokeHop`. The inline comment in the `.theta`-callable branch explicitly states the intent: "a `.theta`-callable call is semantically an `invoke` and shares its single error model, so a callee-returned `Err` cascades through `InvokeCalleeError` exactly as `runInvokeEffect`'s value arm wraps it."

## Evidence

Clone map group **G012** (renamed-only, 102 tokens) cites the two spans.

`src/runtime/effectful-statement-host.ts:377-406` — the `.theta`-callable branch's callee-failure wrap:

```ts
const innerKind = (result.error as { readonly kind?: unknown } | null)?.kind;
if (
  invokeOutcome.source === "boundary-minted" ||
  (innerKind === "cancelled" && deps.signal.aborted)
) {
  return { ok: true, value: result };
}
const wrapped = surfaceThetaCallableCalleeFailure(
  child.calleePath,
  result.error as unknown as QueryError,
  `.theta-callable call of ${child.calleePath} callee returned Err(${summariseErrorField(innerKind)})`,
);
await deps.recordInvokeHop?.(wrapped as InvokeCalleeError, child.calleePath, {
  style: "theta_callable_bare", calleeNameToken: expr.range.start,
});
return { ok: true, value: makeErr(wrapped as unknown as ThetaValue) };
```

`src/runtime/effectful-statement-host.ts:554-601` — `runInvokeEffect`'s callee-failure wrap:

```ts
const innerKind = (result.error as { readonly kind?: unknown } | null)?.kind;
if (outcome.source === "boundary-minted" || (innerKind === "cancelled" && deps.signal.aborted)) {
  return { ok: true, value: result };
}
const wrapped = surfaceThetaCallableCalleeFailure(
  child.calleePath,
  result.error as unknown as QueryError,
  `invoke of ${child.calleePath} callee returned Err(${summariseErrorField(innerKind)})`,
);
await deps.recordInvokeHop?.(wrapped as InvokeCalleeError, child.calleePath, {
  style: "literal_invoke",
  invokeToken: expr.range.start,
});
return { ok: true, value: makeErr(wrapped as unknown as ThetaValue) };
```

Diff verdict: **renamed-only**. The two spans differ only by:
- the outcome variable name (`invokeOutcome` vs `outcome`);
- the message string (`.theta-callable call of ...` vs `invoke of ...`);
- the provenance style (`theta_callable_bare` vs `literal_invoke`);
- the call-site token key (`calleeNameToken` vs `invokeToken`);
- whitespace in the `if` condition.

The core logic — `innerKind` extraction, the `boundary-minted` / parent-own-cancel bare condition, the `surfaceThetaCallableCalleeFailure` call, the optional `recordInvokeHop`, and the `makeErr` return — is identical.

## Why this is a problem

This is load-bearing duplication, not incidental similarity. Both arms implement the same XMODE-1 rule from `errors-and-results.md` and `invocation.md`: a child invoke's own `Err` must be wrapped as `InvokeCalleeError { kind: "invoke_callee", callee_path, inner, message }`, with the same wrap/bare split decided by provenance and by the parent's own abort signal.

Because the rule is copy-pasted, a fix to one arm risks missing the other. For example, if a future bug changes which `innerKind` values stay bare for parent-own cancellations, or adjusts how the `recordInvokeHop` provenance is stamped, the `.theta`-callable and literal-`invoke` surfaces could diverge. The code itself admits this is one rule applied in two places by saying the `.theta`-callable branch wraps "exactly as `runInvokeEffect`'s value arm wraps it."

## Suggested direction (non-binding, optional)

The natural shared home is a private helper inside `src/runtime/effectful-statement-host.ts`, since both call sites are already in the same file. The helper would take the outcome, the child, the message string, the provenance style, and the call-site token descriptor, and perform the single shared wrapping/ledger-stamping sequence.

## False-positive check

- Re-verified both cited spans in the current working tree before filing.
- Both copies are live production paths: the `.theta`-callable branch is reached when `classifyCall` returns `"theta-callable"`, and `runInvokeEffect` is reached for literal `invoke(...)` expressions.
- Searched `quality/intake/` for `effectful-statement-host`, `runThetaCallableEffect`, `runInvokeEffect`, `surfaceThetaCallableCalleeFailure`, `theta_callable_bare`, and `literal_invoke`; no prior D4 finding on this duplication.
- This is not a spec-normative vector table, not tests/, and not generated code.
- The clone map group id G012 is the authoritative source for the spans and the renamed-only verdict.

## Triage
