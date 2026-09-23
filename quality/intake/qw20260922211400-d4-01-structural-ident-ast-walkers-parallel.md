---
id: pending
title: structural and identifier AST walkers are parallel
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/structural-checks.ts:1024-1214
  - src/parser/structural-checks.ts:1399-1583
  - src/parser/theta-document.ts:2105-2199
  - src/parser/theta-document.ts:2201-2312
sites: 4
fix_scope: module
d4_class: parallel
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# structural and identifier AST walkers are parallel

## Observation

`src/parser/structural-checks.ts` and `src/parser/theta-document.ts` each own a recursive AST traversal over the same `Stmt` and `Expr` unions. `walkStatement` / `walkExpr` run structural shape checks (function placement, bare returns, object construction, variant access, query annotations), while `walkIdentStmt` / `walkIdentExpr` run identifier-resolution checks (`theta/parse/unknown-identifier`, enum-variant licensing). The four functions were written as independent switches, but their traversal skeletons — which child expressions to recurse into, where to introduce new scopes, and which node kinds are leaves — are byte-for-byte identical except for function and context-parameter names. The clone map reports six renamed-only spans that pair the two walks.

## Evidence

The clone groups from the map are all renamed-only; the excerpt pairs below show the same traversal calls with `walkExpr` / `walkIdentExpr` substituted and `scope, refs, file, out` replaced by `scope, walkCtx, file, out`.

### Statement-level dispatch pairs (clone groups G023 / G044 / G064)

`src/parser/structural-checks.ts:1180-1189`

```ts
    case "query":
      walkExpr(s.query, scope, refs, file, out);
      return;
    case "tool-call":
      walkExpr(s.call, scope, refs, file, out);
      return;
    case "invoke":
      walkExpr(s.invoke, scope, refs, file, out);
      return;
    case "expr":
      walkExpr(s.expr, scope, refs, file, out);
      return;
```

`src/parser/theta-document.ts:2179-2192`

```ts
    case "query":
      walkIdentExpr(s.query, scope, walkCtx, file, out);
      return;
    case "tool-call":
      walkIdentExpr(s.call, scope, walkCtx, file, out);
      return;
    case "invoke":
      walkIdentExpr(s.invoke, scope, walkCtx, file, out);
      return;
    case "expr":
      walkIdentExpr(s.expr, scope, walkCtx, file, out, "discarded");
      return;
```

### Expression-level traversal pairs (clone groups G003 / G017 / G055)

`src/parser/structural-checks.ts:1416-1448`

```ts
    case "binary":
      walkExpr(e.left, scope, refs, file, out);
      walkExpr(e.right, scope, refs, file, out);
      return;
    case "ternary":
      walkExpr(e.condition, scope, refs, file, out);
      walkExpr(e.consequent, scope, refs, file, out);
      walkExpr(e.alternate, scope, refs, file, out);
      return;
    case "try":
      walkExpr(e.operand, scope, refs, file, out);
      return;
    case "call":
      for (const arg of e.args) {
        const directBareObject = arg.kind === "object" && arg.typeName === null;
        walkExpr(arg, scope, refs, file, out, directBareObject);
      }
      return;
```

`src/parser/theta-document.ts:2222-2239`

```ts
    case "call":
      emitUnknownIdentifier(e.callee, e.range, scope, walkCtx, file, out, "call");
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkIdentExpr(arg, scope, walkCtx, file, out);
      }
      return;
    case "binary":
      walkIdentExpr(e.left, scope, walkCtx, file, out);
      walkIdentExpr(e.right, scope, walkCtx, file, out);
      return;
    case "ternary":
      walkIdentExpr(e.condition, scope, walkCtx, file, out);
      walkIdentExpr(e.consequent, scope, walkCtx, file, out);
      walkIdentExpr(e.alternate, scope, walkCtx, file, out);
      return;
    case "try":
      walkIdentExpr(e.operand, scope, walkCtx, file, out);
      return;
```

`src/parser/structural-checks.ts:1535-1549`

```ts
    case "method-call":
      walkExpr(e.target, scope, refs, file, out);
      for (const arg of e.args) {
        walkExpr(arg, scope, refs, file, out);
      }
      return;
    case "array":
      for (const el of e.elements) {
        walkExpr(el, scope, refs, file, out);
      }
      return;
```

`src/parser/theta-document.ts:2273-2281`

```ts
    case "method-call":
      walkIdentExpr(e.target, scope, walkCtx, file, out);
      for (const arg of e.args) {
        walkIdentExpr(arg, scope, walkCtx, file, out);
      }
      return;
    case "array":
      for (const el of e.elements) {
        walkIdentExpr(el, scope, walkCtx, file, out);
      }
      return;
```

Diff verdict: **renamed-only**. The recursion structure and child-selection are identical; the bodies differ only in helper name, context-parameter names, and pass-specific tags (`directBareObject`, `"discarded"`).

### Coverage count

- `Expr` union has 20 members (`IdentExpr`, `NumberExpr`, `StringExpr`, `BoolExpr`, `NullExpr`, `ArrayExpr`, `BinaryExpr`, `TernaryExpr`, `TryExpr`, `CallExpr`, `InvokeExpr`, `QueryExpr`, `MemberExpr`, `IndexExpr`, `ObjectExpr`, `MatchExpr`, `ResultCtorExpr`, `MethodCallExpr`, `ParForExpr`, `BlockExpr`).
  - `walkExpr` covers 16 explicit cases and groups `number` / `string` / `bool` / `null` under `default`.
  - `walkIdentExpr` covers 15 explicit cases and groups `number` / `string` / `bool` / `null` / `query` under `default`.
  - Both cover all 20 members today.
- `Stmt` union has 18 members (`LetStmt`, `ReassignStmt`, `IfStmt`, `WhileStmt`, `ForStmt`, `BreakStmt`, `ContinueStmt`, `FnDecl`, `ReturnStmt`, `QueryStmt`, `ToolCallStmt`, `InvokeStmt`, `ExprStmt`, `SchemaDecl`, `EnumDecl`, `ImportDecl`, `ExportDecl`, `DocComment`).
  - `walkStatement` covers 15 explicit cases and groups `import` / `export` / `doc-comment` under `default`.
  - `walkIdentStmt` covers 11 explicit cases and groups `break` / `continue` / `schema` / `enum` / `import` / `export` / `doc-comment` under `default`.
  - Both cover all 18 members today.

The `walkExpr` `"query"` arm is the only deliberate asymmetry: it re-lexes query interpolations and checks the query annotation, work the identifier walk intentionally does not duplicate.

## Why this is a problem

This is load-bearing parallel truth, not incidental similarity. Both passes must descend the same set of `Stmt` / `Expr` kinds and the same child positions, or one checker will silently skip nodes the other visits. The structural walk is the only place that emits `theta/parse/bare-object-literal`, `theta/parse/extra-object-field`, `theta/parse/unknown-variant`, and query-interpolation errors; the identifier walk is the only place that emits `theta/parse/unknown-identifier`. Because `walkExpr` and `walkIdentExpr` both use a `default` arm that sweeps several node kinds together, a future `Expr` kind that is not a leaf would fall through the default in whichever walk lacks an explicit case, silently missing that pass's checks. The per-node actions differ, so a single merged function is not the only fix, but the traversal skeleton is the shared source of truth that must not drift.

## Suggested direction (non-binding, optional)

Shared source of truth (hypothesis): a single visitor helper that knows the child-expression structure of each `Stmt` / `Expr` kind and accepts per-node callbacks for structural checks and identifier checks. That would make adding a new AST node kind a compile-time requirement for both passes at once.

## False-positive check

- Verified both walks are live production code: `walkStatements` / `walkExpr` are called from `checkStructural` (`structural-checks.ts:508-516`); `walkIdentStmt` / `walkIdentExpr` are called from `checkUnknownIdentifiers` (`theta-document.ts:2098-2101`).
- Verified the cited spans fall inside the four function bodies.
- Re-read the `Expr` / `Stmt` union definitions in `src/parser/theta-ast.ts` and counted the members.
- Confirmed the groups are renamed-only; no diverging lines that change behavior were found.
- Not a spec-normative vector table; not generated code; not in `tests/`.

## Triage
verdict: questionable — accounting verified: Expr union 20 / Stmt union 18 members (theta-ast.ts:339, 829) and the explicit-arm counts reproduce in current code (walkExpr 16, walkIdentExpr 15, walkStatement 15, walkIdentStmt 11, each pair closing the union via `default`); clone-scan map re-run on structural-checks.ts lists G003/G017/G023/G044/G055/G064 as renamed-only at the cited ranges (1416-1448↔2222-2239, 1539-1549↔2256-2268, 1180-1189↔2179-2192, 1535-1543↔2273-2281), both walks live (checkStructural ← theta-document.ts:350, checkUnknownIdentifiers ← theta-document.ts:395); not a duplicate — resolved PTQ-0288 unified the call-site walker family (walkCallSiteExpr), not this structural/identifier pair, and PTQ-1263/1264 are D9 host breakdowns; the shared traversal source of truth is a design decision for a human ruling (triage: claude-fable-5-1)
