---
id: pending
title: Local-binder collection walk parallels the type-layer Stmt/Expr walk
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:739-798
  - src/parser/type-layer-checks.ts:800-875
  - src/parser/type-layer-checks.ts:1625-1958
  - src/parser/type-layer-checks.ts:3186-3444
sites: 4
fix_scope: localized
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Local-binder collection walk parallels the type-layer Stmt/Expr walk

## Observation
`src/parser/type-layer-checks.ts` contains two tree-walk passes over the same AST. `walkStmtForLocalBinders` / `walkExprForLocalBinders` collect the local names introduced by statements and expressions, while `walkStmt` / `walkExpr` perform type checking over the same statements and expressions. Both passes must recognize the same `Stmt` and `Expr` constructors and must agree on which constructs introduce binders, which contain nested expressions, and which are leaves.

## Evidence
`src/parser/type-layer-checks.ts:739-753` (`walkStmtForLocalBinders`, first cases):
```ts
function walkStmtForLocalBinders(stmt: Stmt, names: Set<string>): void {
  switch (stmt.kind) {
    case "let":
      names.add(stmt.name);
      if (stmt.init !== null) {
        walkExprForLocalBinders(stmt.init, names);
      }
      return;
    case "reassign":
      walkExprForLocalBinders(stmt.value, names);
      return;
    case "if":
      walkExprForLocalBinders(stmt.condition, names);
      walkBlockForLocalBinders(stmt.then, names);
      if (stmt.otherwise !== null) {
```

`src/parser/type-layer-checks.ts:1625-1638` (`walkStmt`, first cases):
```ts
  private walkStmt(stmt: Stmt, bindings: Map<string, CompatType>, flow: WalkCtx): void {
    switch (stmt.kind) {
      case "let": {
        if (stmt.init !== null) {
          const rhsType = this.typeOf(stmt.init, bindings);
          // A source that derives from none of `Type`'s six alternatives
          // (bug 0124 §Fix) supports no verdict at this position: the RHS
          // narrowing check below and the array-element sink are bypassed
          // for it exactly as for an unannotated `let`, but the binding is
          // recorded WITHHELD rather than adopting the initialiser's
          // inferred type — the withhold is what keeps a LATER read of this
          // binding (a method call, a condition, a further annotated `let`)
          // from being judged against text that names no type, rather than
```

`src/parser/type-layer-checks.ts:800-814` (`walkExprForLocalBinders`, first cases):
```ts
function walkExprForLocalBinders(expr: Expr, names: Set<string>): void {
  switch (expr.kind) {
    case "ternary":
      walkExprForLocalBinders(expr.condition, names);
      walkExprForLocalBinders(expr.consequent, names);
      walkExprForLocalBinders(expr.alternate, names);
      return;
    case "binary":
      walkExprForLocalBinders(expr.left, names);
      walkExprForLocalBinders(expr.right, names);
      return;
    case "try":
      walkExprForLocalBinders(expr.operand, names);
      return;
```

`src/parser/type-layer-checks.ts:3186-3200` (`walkExpr`, first cases):
```ts
  private walkExpr(
    e: Expr,
    bindings: ReadonlyMap<string, CompatType>,
    flow: WalkCtx,
    sunkArrays: ReadonlySet<Expr> = NO_SUNK_ARRAYS,
  ): void {
    switch (e.kind) {
      case "ternary":
        this.diagnostics.push(
          ...checkBooleanPosition({
            operandType: this.typeOf(e.condition, bindings),
            site: { file: this.file, range: e.condition.range },
          }),
        );
        this.walkExpr(e.condition, bindings, flow);
```

Parallel coverage count: `Stmt` has 18 members (`LetStmt`, `ReassignStmt`, `IfStmt`, `WhileStmt`, `ForStmt`, `BreakStmt`, `ContinueStmt`, `FnDecl`, `ReturnStmt`, `QueryStmt`, `ToolCallStmt`, `InvokeStmt`, `ExprStmt`, `SchemaDecl`, `EnumDecl`, `ImportDecl`, `ExportDecl`, `DocComment`). Both `walkStmtForLocalBinders` and `walkStmt` handle the 11 statement kinds that bind names or contain expressions and default-cover the remaining 7, so coverage is 18 of 18. `Expr` has 20 members; both `walkExprForLocalBinders` and `walkExpr` explicitly handle the composite expression kinds and default-cover the literal/identifier leaves, so coverage is 20 of 20.

## Why this is a problem
This is the parallel class the brief calls out explicitly: two passes over the AST that each switch over the same `Stmt` and `Expr` unions. If a new statement or expression constructor is added, both the binder-collection pass and the type-checking pass must recognize it. A constructor handled by `walkStmt`/`walkExpr` but missed by the binder walk could introduce a binding that the type layer thinks is in scope, or vice versa. The two passes also must agree on scoping: for example, both treat `for`/`par-for` as introducing a variable, both walk arm bodies in their own scope for `match`, and both copy `bindings`/`names` when entering blocks.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis) would be a single set of traversal rules for the `Stmt`/`Expr` unions, used by both the binder collector and the type checker, rather than two independent switch statements.

## False-positive check
- Re-verified all four function spans at HEAD; all are live.
- Searched `quality/intake/` for `walkStmtForLocalBinders`, `walkExprForLocalBinders`, and the type-layer `walkStmt`/`walkExpr` parallel: no existing D4 filing covers this.
- Not a spec-normative vector table; not generated code; not in `tests/`.

## Triage
verdict: questionable — accounting verified: Stmt 18/18 (11 explicit + 7 default arms in both walkStmtForLocalBinders:739-798 and walkStmt:1625-1957) and Expr 20/20 (binder walk 14 explicit + 6 default incl. `query`, which carries no nested Expr; type-layer walkExpr 15 explicit + 5 default), all four spans live via collectLocalBinderNames (import-static-checks.ts:1953, type-layer-checks.ts:358); note the "both copy names when entering blocks" claim is wrong for the binder walk (flat accumulating Set, by design) but does not affect the count; no tracked duplicate (PTQ-0330 is D8 repeated-call, PTQ-0288 is the call-site walker, d4-17/d4-20 are intra-walk clones); the shared traversal source of truth is a design decision for a human ruling (triage: claude-fable-5-1)
