---
id: pending
title: The pure and effectful expression/statement evaluators are parallel AST-kind passes
lens: D4
status: intake
verdict: pending
locations:
  - src/runtime/statement-executor.ts:419-580
  - src/runtime/statement-executor.ts:700-799
  - src/runtime/pure-expression-evaluator.ts:89-282
  - src/runtime/pure-expression-evaluator.ts:399-430
sites: 4
fix_scope: module
d4_class: parallel
wave: qw20260923185337
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# The pure and effectful expression/statement evaluators are parallel AST-kind passes

## Observation
`src/runtime/statement-executor.ts` and `src/runtime/pure-expression-evaluator.ts` implement two evaluation paths over the same `Expr` and `Stmt` discriminant sets. `evalExpr` / `executeStatement` drive the full async statement executor (V19c); `evaluatePureExpression` / `evaluatePureStatement` drive the synchronous pure evaluator used for query interpolands, invoke arguments, callable lowering, and the production theta producer's pure host. The two paths are independent: neither calls the other, and neither delegates to a shared AST traversal utility. Code comments repeatedly describe them as lockstep twins (bug 0027, bug 0116, bug 0303, bug 0369, bug 0476) and call out the safety-net hazard when the pure evaluator's `default: return null` misses a form the executor handles.

## Evidence

`src/runtime/statement-executor.ts:419-580` — `evalExpr` dispatches on `expr.kind` through a chain of `if` guards:

```ts
export async function evalExpr(
  expr: Expr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  atTerminal: boolean = false,
): Promise<EvalResult> {
  if (expr.kind === "try") { return evalTry(expr, env, deps); }
  if (expr.kind === "match") { return evalMatch(expr, env, deps, atTerminal); }
  if (expr.kind === "par-for") { return evalParFor(expr, env, deps); }
  if (expr.kind === "block") { return executeBlock(expr.body, env.child(), deps, atTerminal); }
  if (expr.kind === "call") { /* user-fn / effect path */ }
  if (expr.kind === "array") { /* element list */ }
  if (expr.kind === "object") { /* field object + schema brand */ }
  if (expr.kind === "index") { /* target + index + evaluateIndexAccess */ }
  if (expr.kind === "member") { return resolveEnumMemberRead(expr, env, deps); }
  if (expr.kind === "ternary") { /* condition + taken branch */ }
  if (expr.kind === "binary") { return evalBinary(expr, env, deps); }
  if (expr.kind === "method-call") { /* receiver + args + applyStdlibMethod */ }
  if (expr.kind === "result-ctor") { /* Ok / Err */ }
  return evalCheckpointedEffect(expr, env, deps, atTerminal);
}
```

`src/runtime/pure-expression-evaluator.ts:89-282` — `evaluatePureExpression` dispatches on `expr.kind` through a `switch`:

```ts
function evaluatePureExpression(
  expr: Expr,
  env: LexicalEnvironment,
  chain?: InvokeChain,
): ThetaValue {
  switch (expr.kind) {
    case "number": return Number(expr.text);
    case "string":
    case "bool": return expr.value;
    case "null": return null;
    case "ident": { const r = env.resolve(expr.name); return r.arm === "local" ? r.value ?? null : null; }
    case "array": return expr.elements.map((e) => evaluatePureExpression(e, env, chain));
    case "object": { /* defineRecordField + buildObjectSchemaValue */ }
    case "member": { /* enum variant or evaluateMemberAccess */ }
    case "index": { /* evaluatePureExpression operands + evaluateIndexAccess */ }
    case "call": { /* user fn -> evaluatePureFnCall, else null */ }
    case "result-ctor": return expr.ctor === "Ok" ? makeOk(...) : makeErr(...);
    case "method-call": return applyStdlibMethod(receiver, expr.method, args);
    case "try": { /* evaluateQuestion + raiseInterpolatedResult */ }
    case "binary": return evaluateBinaryExpression(...);
    case "ternary": { /* taken branch only */ }
    case "block": { /* evaluatePureBlock in child scope */ }
    default: return null;
  }
}
```

`src/runtime/statement-executor.ts:700-799` — `executeStatement` dispatches on `stmt.kind`:

```ts
async function executeStatement(stmt: Stmt, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<EvalResult> {
  if (deps.trace !== undefined) { deps.trace(..., "stmt"); }
  switch (stmt.kind) {
    case "expr": return evalExpr(stmt.expr, env, deps, true);
    case "tool-call": return evalExpr(stmt.call, env, deps, true);
    case "query": return evalExpr(stmt.query, env, deps, true);
    case "invoke": return evalExpr(stmt.invoke, env, deps, true);
    case "let": { /* evaluate init + defineLocal */ }
    case "reassign": { /* eval RHS + writeBinding */ }
    case "if": return executeIf(stmt, env, deps);
    case "while": return executeWhile(stmt, env, deps);
    case "for": return executeFor(stmt, env, deps);
    case "break": return { flow: "break" };
    case "continue": return { flow: "continue" };
    case "return": { /* eval operand + return flow */ }
    case "fn":
    case "schema":
    case "enum":
    case "import":
    case "export":
    case "doc-comment": return { flow: "value", value: null };
  }
}
```

`src/runtime/pure-expression-evaluator.ts:399-430` — `evaluatePureStatement` dispatches on `stmt.kind`:

```ts
function evaluatePureStatement(
  stmt: Stmt,
  env: LexicalEnvironment,
  chain?: InvokeChain,
): PureBlockOutcome {
  switch (stmt.kind) {
    case "let": {
      const value = stmt.init !== null ? evaluatePureExpression(stmt.init, env, chain) : null;
      env.defineLocal(stmt.name, value, stmt.mutable);
      return { kind: "value", value: null };
    }
    case "return": return { kind: "return", value: stmt.operand !== null ? evaluatePureExpression(...) : null };
    case "if": return evaluatePureIf(stmt, env, chain);
    case "expr": return { kind: "value", value: evaluatePureExpression(stmt.expr, env, chain) };
    default: return { kind: "value", value: null };
  }
}
```

Diff verdict: not a text clone (one is async with `EvalResult` flows, the other is synchronous with `ThetaValue`), but both traverse the same `Expr` / `Stmt` unions case by case. The clone map shows no groups for these files; the parallel structure is below its token-window floor.

## Why this is a problem
Two evaluation passes over the same AST must agree on which node kinds exist and how to reach their children. `src/parser/theta-ast.ts` declares 20 `Expr` kinds and 18 `Stmt` kinds. Today the two paths partition them as follows:

- `Expr` evaluators: both explicitly handle the same 11 composite/operator kinds (`array`, `object`, `member`, `index`, `call`, `result-ctor`, `method-call`, `try`, `binary`, `ternary`, `block`). `evalExpr` additionally handles `match` and `par-for` (executor-only control forms) and leaves the 5 leaf kinds (`ident`, `number`, `string`, `bool`, `null`) plus the 2 effect kinds (`invoke`, `query`) to fall through to `evalCheckpointedEffect` / `host.evaluatePure`. `evaluatePureExpression` handles the 5 leaf kinds explicitly and returns `null` for the 4 effect/control kinds (`invoke`, `query`, `match`, `par-for`).
- `Stmt` evaluators: both explicitly handle the same 4 pure-body statement kinds (`let`, `return`, `if`, `expr`) and default the same 6 declaration-only kinds (`fn`, `schema`, `enum`, `import`, `export`, `doc-comment`). `executeStatement` additionally handles 8 effect/control/loop kinds (`tool-call`, `query`, `invoke`, `reassign`, `while`, `for`, `break`, `continue`).

If `theta-ast.ts` gains a new `Expr` or `Stmt` kind, or if an existing kind gains a new child field, both evaluators must be updated. A new pure-evaluable form added only to `evalExpr` would silently become `null` when it appears in a query interpoland or invoke argument (the `@` interpolation route and invoke machinery both call `evaluatePureExpression`). Conversely, a new form added only to the pure evaluator would behave differently in effectful positions. The comments already treat this as a maintained invariant; the invariant is not mechanically enforced.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis) would be a generic `Expr`/`Stmt` traversal helper in `src/runtime/` that each evaluator parameterises with its per-kind action, or a single table-driven dispatch shared by the pure and effectful paths. The natural home is near the AST definitions or in an existing runtime utility module.

## False-positive check
- Re-read the cited ranges immediately before filing; all four functions are live at HEAD.
- `evalExpr` is imported by `executor-result-flow.ts`, `subagent-fn-call.ts`, and `par-for-executor.ts`; `executeStatement` is called only from `executeBlock` in the same file; `evaluatePureExpression` is imported by `extension/callable-lowering.ts`, `extension/binder-run.ts`, `extension/invoke-machinery.ts`, `extension/production-theta-producer.ts`, `extension/tool-call-ladder.ts`, `runtime/query-interpolation.ts`; `evaluatePureStatement` is called only from `evaluatePureBlock` in the same file.
- No test files are cited (D7 territory).
- No dead copies are present (all cited sites are called from production code).
- No generated code or spec-normative vector tables are involved.
- Searched the already-filed list for `evalExpr`, `evaluatePureExpression`, `executeStatement`, and `evaluatePureStatement`; no matching prior D4 parallel filing found in `quality/intake/` or `quality/issues/`.

## Triage
verdict: questionable — accounting verified; the shared source of truth is a design decision for a human ruling: `Expr` (theta-ast.ts:339-359) has 20 members and `Stmt` (:829-847) has 18; `evalExpr` (statement-executor.ts:419-586) has 13 explicit arms (the 11 shared composites plus match/par-for) and routes the other 7 to `evalCheckpointedEffect`; `evaluatePureExpression` (pure-expression-evaluator.ts:87-282) has 16 arms (5 leaves plus the same 11) with `default: return null` for invoke/query/match/par-for; `executeStatement` (:711-795) covers all 18 `Stmt` kinds and `evaluatePureStatement` (:404-427) covers let/return/if/expr and defaults the rest, so every count reproduces; both sides are live and there is no clone-scan group, as expected for a parallel. One correction: "neither calls the other" overstates it, because evalExpr's leaf fallthrough reaches `evaluatePureExpression` through `deps.host.evaluatePure` (executor-result-flow.ts:151 → production-theta-producer.ts:712). The 11-composite parallel still stands. Not a duplicate: PTQ-1456/1305/1457/1296 each deduped a narrower clone, and PTQ-1196/1207 are D9 filings (triage: claude-opus-5-5)
verdict: questionable — accounting verified; the shared source of truth is a design decision for a human ruling: re-checked, theta-ast.ts:339-359 has 20 Expr kinds and :829-847 has 18 Stmt kinds; evalExpr (statement-executor.ts:414-584) has 13 explicit arms (the 11 shared composites plus match/par-for) and sends the remaining 7 to evalCheckpointedEffect; evaluatePureExpression (pure-expression-evaluator.ts:87-279) has 16 arms (5 leaves plus the same 11) and `default: return null`; executeStatement (:700-795) covers all 18 Stmt kinds, and evaluatePureStatement (:404-427) covers let/return/if/expr and defaults the rest. One correction: "neither calls the other" is wrong, because evalExpr's fallthrough reaches evaluatePureExpression via deps.host.evaluatePure (executor-result-flow.ts:151 → production-theta-producer.ts:712). Not a duplicate: resolved PTQ-1296/1305/1456/1457 are narrower clones, PTQ-1254 is about the Flow/EvalResult unions, and the qw20260923145222-d4-01 walker parallel covers different files (triage: claude-opus-5-5)
