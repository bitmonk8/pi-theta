---
id: PTQ-1457
title: Checkpointed effect dispatch is duplicated between evalAsResult and evalCheckpointedEffect
lens: D4
status: open
verdict: confirmed
locations:
  - src/runtime/executor-result-flow.ts:126-157
  - src/runtime/statement-executor.ts:638-681
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# Checkpointed effect dispatch is duplicated between evalAsResult and evalCheckpointedEffect

## Observation
`src/runtime/executor-result-flow.ts` `evalAsResult` dispatches a checkpointed effect when an expression is evaluated as a theta `Result` (the operand of `?` or the scrutinee of `match`). `src/runtime/statement-executor.ts` `evalCheckpointedEffect` dispatches the same checkpointed effect when an expression appears in statement/effect position. The two functions contain the same sequence: call `deps.host.checkpointFor`, handle the null-checkpoint pure path, await `preEvaluateToolArgs`, build a single `CancellableStatement`, call `runCancellableSequence`, settle the trace in a `finally`, and normalize the outcome. They differ only in the parameter name (`operand` vs `expr`) and in whether a clean value is always wrapped as a `Result` (`evalAsResult`) or conditionally wrapped depending on `atTerminal` (`evalCheckpointedEffect`).

## Evidence

Clone-map group **G002** — 192 tokens, renamed-only (4).

**Copy 1 — `evalAsResult` checkpointed tail**
`src/runtime/executor-result-flow.ts:126-157`
```typescript
  const checkpoint = deps.host.checkpointFor(operand);
  if (checkpoint === null) {
    return { flow: "value", value: deps.host.evaluatePure(operand, env, deps.invokeChain) };
  }

  const preArgs = await preEvaluateToolArgs(operand, env, deps);
  if (!preArgs.ok) {
    return preArgs.flow;
  }
  const statement: CancellableStatement = {
    binding: "_effect",
    kind: checkpoint.kind,
    site: checkpoint.site,
    run: () => deps.host.runEffect(operand, env, preArgs.args, deps.invokeChain),
  };
  const settleTrace = traceEffectDispatch(env, deps, checkpoint.kind, checkpoint.site);
```

**Copy 2 — `evalCheckpointedEffect` statement/effect dispatch**
`src/runtime/statement-executor.ts:638-681`
```typescript
  const checkpoint = deps.host.checkpointFor(expr);
  if (checkpoint === null) {
    return { flow: "value", value: deps.host.evaluatePure(expr, env, deps.invokeChain) };
  }

  const preArgs = await preEvaluateToolArgs(expr, env, deps);
  if (!preArgs.ok) {
    return preArgs.flow;
  }
  const statement: CancellableStatement = {
    binding: "_effect",
    kind: checkpoint.kind,
    site: checkpoint.site,
    run: () => deps.host.runEffect(expr, env, preArgs.args, deps.invokeChain),
  };
  const settleTrace = traceEffectDispatch(env, deps, checkpoint.kind, checkpoint.site);
```

**Diff verdict:** renamed-only with one behavioral divergence: `evalAsResult` always returns `asResultValue(result.value)`, while `evalCheckpointedEffect` returns `asResultValue(result.value)` only when `!atTerminal` and returns the raw value at terminal positions. The cancellation branch and the `makeErr` failure branch are otherwise identical.

## Why this is a problem
Both functions implement the same checkpointed-effect protocol: pre-evaluate tool arguments, build a single-statement cancellable sequence, settle the trace on every path, and normalize the outcome. The duplication is load-bearing because a change to the protocol in one place (for example, settling semantics, pre-evaluation ordering, or how a cancelled effect is reported) will leave `?`/`match`-wrapped effects and bare statement-position effects with divergent behavior. The only intentional difference is the terminal-position result wrapping, which can be parameterized rather than copied.

## Suggested direction (non-binding, optional)
Consider folding the common checkpointed-effect dispatch into a single helper that takes an `atTerminal` or `wrapResult` flag, so both `evalAsResult` and `evalCheckpointedEffect` delegate to it. The natural home is one of the two existing modules in `src/runtime/`, likely `executor-result-flow.ts` since it already owns `Result`-normalization concerns.

## False-positive check
- Re-read both cited spans at HEAD; both functions are live and are the only callers of this exact dispatch shape in their respective modules.
- Verified that `evalAsResult` is called from `evalTry` and `evalMatch` in `executor-result-flow.ts`, and `evalCheckpointedEffect` is called from `evalExpr` in `statement-executor.ts`.
- Checked `quality/issues/` for existing filings mentioning `evalAsResult`, `evalCheckpointedEffect`, or the pair; none found. (A prior triage note in the wave log explicitly routed this pair to D4 as a near-verbatim clone.)
- The copies are not spec-normative vector tables; they are operational code.

## Triage
verdict: confirmed — clone-scan map on a one-line manifest of executor-result-flow.ts lists G002 (192 tokens, renamed-only 4) at exactly the cited ranges src/runtime/executor-result-flow.ts:126-157 / src/runtime/statement-executor.ts:638-681, both excerpts byte-match, and both copies are live (evalAsResult called from evalTry :182 and evalMatch :220; evalCheckpointedEffect from evalExpr :587); hand-diff confirms the tails are the same checkpointFor→null-pure→preEvaluateToolArgs→single CancellableStatement→runCancellableSequence with settle-in-finally→ok/cancelled/Err disposition, and evalAsResult's disposition is exactly evalCheckpointedEffect's `atTerminal === false` arm (ok→asResultValue, cancelled→handlePartialTerminalOutcome+cancel, else→makeErr — the filing slightly understates the divergence: the failure branch also has an atTerminal→`fail` arm, but the same flag parameterises it), so the fix is a mechanical delegate; operational code, not a spec vector table; no D4 filing exists — grep of quality/issues+resolved for the pair hits only D9 files PTQ-1154/1163/1433 whose triage notes explicitly routed this near-clone to D4, and the prior rejection log did the same (triage: claude-fable-5-1)
