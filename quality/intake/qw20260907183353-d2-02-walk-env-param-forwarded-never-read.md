---
id: pending
title: StaticTypeInferencePass's #walkBlock/#walkStmt thread an `env` parameter that is only ever forwarded, never read
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/static-type-inference.ts:129
  - src/parser/static-type-inference.ts:137-139
  - src/parser/static-type-inference.ts:151
  - src/parser/static-type-inference.ts:166-189
sites: 10
fix_scope: localized
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# StaticTypeInferencePass's #walkBlock/#walkStmt thread an `env` parameter that is only ever forwarded, never read

## Observation
`infer` builds a `record` closure that captures `env` lexically and then walks the body via the private methods `#walkBlock` and `#walkStmt`. Both methods declare an `env: TypeEnv` parameter, but neither performs any operation on it: every occurrence of `env` inside the two methods is a forwarding argument to the other method. The only real read of `env` in the walk is inside the `record` closure, which uses `infer`'s own parameter, not the threaded one.

## Evidence
src/parser/static-type-inference.ts:122-129 — `record` captures `env` from `infer`'s scope; the walk call forwards it separately:
```
    const record = (expr: Expr): void => {
      if (types.has(expr)) {
        return;
      }
      types.set(expr, this.#typeExpr(expr, env, noBindings));
      nodes.push(expr);
    };
    this.#walkBlock(body, record, env);
```
src/parser/static-type-inference.ts:137-139 — `#walkBlock` only forwards:
```
  #walkBlock(block: Block, record: (expr: Expr) => void, env: TypeEnv): void {
    for (const stmt of block.statements) {
      this.#walkStmt(stmt, record, env);
```
src/parser/static-type-inference.ts:151 and the six forwarding sites inside `#walkStmt` (:166, :169, :171, :177, :181, :189) — every use of the parameter is another forward:
```
  #walkStmt(stmt: Stmt, record: (expr: Expr) => void, env: TypeEnv): void {
...
        this.#walkBlock(stmt.then, record, env);
...
            this.#walkBlock(stmt.otherwise, record, env);
          } else {
            this.#walkStmt(stmt.otherwise as IfStmt, record, env);
...
        this.#walkBlock(stmt.body, record, env);
```
Exhaustive occurrence list of `env` within the two methods (`grep -n "record, env)" src/parser/static-type-inference.ts`): lines 129, 139, 166, 169, 171, 177, 181, 189 — eight forwards plus the two parameter declarations (:137, :151). No other reference exists in either method body; the `record(...)` calls (:142, :154, :158, :162, :165, :176, :180, :185, :192, :195, :198) take only the expression.

## Why this is a problem
Vestigial parameter: the value is never read. The threading suggests the walk consults the `TypeEnv` per statement, but typing happens exclusively inside `record` (via `#typeExpr(expr, env, noBindings)` over `infer`'s captured parameter), so dropping the parameter from both private methods and the eight forwards changes no behavior. It is dead weight a reader must trace through ten sites to discover is inert.

## Suggested direction (non-binding, optional)
Drop the `env` parameter from `#walkBlock` and `#walkStmt` and the eight forwarding arguments; the `record` closure already carries the one real `env`.

## False-positive check
- Reference search: every occurrence of `env` inside `#walkBlock`/`#walkStmt` enumerated above is a forward; no member access, no call with `env` in any other position, no capture into a nested closure.
- External-caller search: both methods are `#`-private (hard-private class fields), so no code in src/, extensions/, tools/, or tests/ can call them with a different argument; the sole entry is `infer` (:129). `grep -rn "walkBlock\|walkStmt"` outside this file matches only unrelated same-named functions in other modules (e.g. type-layer-checks.ts's own walker), which do not touch this class.
- Dynamic access: `#`-private members are not reachable by string-keyed access.
- Not test-only-reachable code: the claim is about a parameter's value never being read, not about deadness of the methods (the methods are alive in production via `checkTypeLayer` → `pass.infer`, src/parser/type-layer-checks.ts:352).

## Triage
