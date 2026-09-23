---
id: pending
title: TypeLayerWalk and StaticTypeInferencePass AST classification walks are parallel passes
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/type-layer-walk.ts:170-265
  - src/parser/type-layer-walk.ts:1418-1577
  - src/parser/static-type-inference.ts:180-232
  - src/parser/static-type-inference.ts:341-467
sites: 4
fix_scope: module
d4_class: parallel
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# TypeLayerWalk and StaticTypeInferencePass AST classification walks are parallel passes

## Observation
`src/parser/type-layer-walk.ts` (`TypeLayerWalk.walkStmt` / `walkExpr`) and `src/parser/static-type-inference.ts` (`StaticTypeInferencePass.#walkStmt` / `#typeValue`) are two independent passes over the same `Stmt` and `Expr` discriminant sets. `TypeLayerWalk` consumes the inference pass (`this.pass.typeOf`) while walking the tree to emit diagnostics, and `StaticTypeInferencePass` records statement-level expressions (`infer`) and answers per-node types. Neither pass delegates its traversal/classification to the other, and the two switch statements must agree on which AST kinds exist and which children to reach.

## Evidence

`src/parser/type-layer-walk.ts:170-265` — `walkStmt` switches over `stmt.kind`:

```ts
private walkStmt(stmt: Stmt, bindings: Map<string, CompatType>, flow: WalkCtx): void {
  switch (stmt.kind) {
    case "let":
      this.walkLetStmt(stmt, bindings, flow);
      return;
    case "reassign":
      this.walkReassignStmt(stmt, bindings, flow);
      return;
    case "if":
      this.checkBoolean(stmt.condition, bindings);
      this.walkExpr(stmt.condition, bindings, flow);
      this.walkBlock(stmt.then, new Map(bindings), flow);
      this.walkOtherwise(stmt.otherwise, bindings, flow);
      return;
    case "while":
      this.checkBoolean(stmt.condition, bindings);
      this.walkExpr(stmt.condition, bindings, flow);
      this.walkBlock(stmt.body, new Map(bindings), flow);
      return;
    case "for": {
      // ... iterand typing, loop-element binding, body walk ...
      return;
    }
    case "fn":
      this.walkFn(stmt, bindings);
      return;
    case "return":
      if (stmt.operand !== null) {
        this.walkExpr(stmt.operand, bindings, flow);
      }
      return;
    case "query":
      this.walkExpr(stmt.query, bindings, flow);
      return;
    case "tool-call":
      this.walkExpr(stmt.call, bindings, flow);
      return;
    case "invoke":
      this.walkExpr(stmt.invoke, bindings, flow);
      return;
    case "expr":
      this.walkExpr(stmt.expr, bindings, flow);
      return;
    case "break":
    case "continue":
    case "schema":
    case "enum":
    case "import":
    case "export":
    case "doc-comment":
      return;
    default: {
      const _exhaustive: never = stmt;
      return void _exhaustive;
    }
  }
}
```

`src/parser/static-type-inference.ts:180-232` — `#walkStmt` switches over `stmt.kind`:

```ts
#walkStmt(stmt: Stmt, record: (expr: Expr) => void): void {
  switch (stmt.kind) {
    case "expr":
      record(stmt.expr);
      return;
    case "let":
      if (stmt.init !== null) {
        record(stmt.init);
      }
      return;
    case "reassign":
      record(stmt.value);
      return;
    case "if":
      record(stmt.condition);
      this.#walkBlock(stmt.then, record);
      if (stmt.otherwise !== null) {
        if ("statements" in stmt.otherwise) {
          this.#walkBlock(stmt.otherwise, record);
        } else {
          this.#walkStmt(stmt.otherwise as IfStmt, record);
        }
      }
      return;
    case "while":
      record(stmt.condition);
      this.#walkBlock(stmt.body, record);
      return;
    case "for":
      record(stmt.iterand);
      this.#walkBlock(stmt.body, record);
      return;
    case "return":
      if (stmt.operand !== null) {
        record(stmt.operand);
      }
      return;
    case "fn":
      this.#walkBlock(stmt.body, record);
      return;
    case "tool-call":
      record(stmt.call);
      return;
    case "invoke":
      record(stmt.invoke);
      return;
    case "query":
      record(stmt.query);
      return;
    default:
      return;
  }
}
```

`src/parser/type-layer-walk.ts:1418-1577` — `walkExpr` switches over `e.kind`, handling `ternary`, `binary`, `try`, `array`, `index`, `match`, `method-call`, `member`, `call`, `invoke`, `object`, `result-ctor`, `par-for`, `query`, `block`, and the leaf group `ident`/`number`/`string`/`bool`/`null`, with a `never` exhaustiveness default.

`src/parser/static-type-inference.ts:341-467` — `#typeValue` switches over `node.kind`, handling `number`, `string`, `bool`, `null`, `ident`, `array`, `binary`, `ternary`, `try`, `match`, `member`, `index`, `call`, `invoke`, `query`, `object`, `result-ctor`, `method-call`, `par-for`, `block`, with no `default`.

## Why this is a problem
`theta-ast.ts` defines an 18-member `Stmt` union and a 20-member `Expr` union. Both passes must classify the same members or they will drift:

- **Stmt traversal**: `TypeLayerWalk.walkStmt` and `StaticTypeInferencePass.#walkStmt` each cover all 18 statement kinds, but they do so independently. `walkStmt` groups the declaration-only kinds (`break`/`continue`/`schema`/`enum`/`import`/`export`/`doc-comment`) explicitly and uses a `never` exhaustiveness default; `#walkStmt` handles the same 11 expression-carrying kinds explicitly and silently swallows the remaining 7 in its `default`. A future `Stmt` kind that carries an expression but is added only to `walkStmt` would be type-checked by `TypeLayerWalk` while `StaticTypeInferencePass.infer()` would silently omit it from the recorded expression map.
- **Expr classification**: `TypeLayerWalk.walkExpr` traverses every `Expr` kind so that diagnostics run; `StaticTypeInferencePass.#typeValue` is the single switch behind `pass.typeOf`, which `TypeLayerWalk` calls for type queries. Both cover all 20 `Expr` kinds. A new `Expr` kind added to only one switch would either skip diagnostics (`walkExpr`) or break type queries (`#typeValue`).

No shared traversal utility or shared discriminant table enforces this agreement today.

## Suggested direction (non-binding, optional)
A shared source of truth for the "which statement/expression kinds have children and where" contract would remove the co-edit risk. A generic visitor over `Stmt`/`Expr` in `src/parser/theta-ast.ts` (or a shared walker module) could be parameterized by each pass's per-kind action, similar to how `local-binders.ts` already provides a precedent walker that `type-layer-walk.ts` cites.

## False-positive check
- Re-read the cited ranges at HEAD; all four spans are live and reached from `type-layer-checks.ts`, which constructs both passes together (`buildTypeLayerWalk` at `type-layer-checks.ts:360-394`).
- `TypeLayerWalk.typeOf` delegates to `this.pass.typeOf`, which routes to `#typeValue` (`static-type-inference.ts:326-337`), confirming the consumer/producer coupling.
- No test files are cited; the concern is production-code co-edit risk.
- No generated code or spec-normative tables are involved.
- Searched `quality/intake/` and `quality/issues/` for `type-layer-walk` combined with `static-type-inference`, and for `StaticTypeInferencePass`/`#typeValue` parallel filings; no matching prior D4 filing found. `PTQ-1138` tracks a different parallel (`collectProvableArgTypes` vs `#typeExpr`), and `PTQ-1142` (where present) tracks the `local-binders`/`type-layer-walk` parallel rather than the `static-type-inference`/`type-layer-walk` pair.

## Triage
verdict: questionable — accounting verified: all four excerpts reproduce at the cited lines; theta-ast.ts `Stmt` has 18 members (829-847) and `Expr` 20 (339-359); `walkStmt` (type-layer-walk.ts:170-265) names all 18 with a `never` backstop, `#walkStmt` (static-type-inference.ts:180-232) names the 11 expression-carrying kinds and swallows the other 7 via `default`, `walkExpr` (1418-1577) and `#typeValue` (341-467) each name all 20 `Expr` kinds; both passes are live (type-layer-checks.ts builds both). The shared-traversal fold is a design decision for a human ruling — and note the human has twice ruled this exact class (two different-purpose AST walks) human-keep-whole: PTQ-1142 (local-binders vs type-layer-walk) and qw20260922211400-d4-01 (structural-checks vs ident-resolution), so this pair most likely falls under the same ruling; the only asymmetry not covered by those rulings is `#walkStmt`'s silent `default` lacking the `never` backstop `walkStmt` carries (triage: claude-fable-5-1)
verdict: questionable — accounting verified: theta-ast.ts declares 18 `Stmt` kinds (829-847) and 20 `Expr` kinds (339-359); `TypeLayerWalk.walkStmt` (type-layer-walk.ts:170-265) names all 18 behind a `never` backstop, while `#walkStmt` (static-type-inference.ts:180-232) names the 11 expression-carrying kinds and sends the other 7 to a silent `default`; `walkExpr` (1418-1577) and `#typeValue` (341-467) each name all 20 `Expr` kinds (`#typeValue` has no `default` but returns a value, so tsc still catches a missing arm); both passes are live (type-layer-checks.ts:67,360-394 imports and builds the pass). Whether to share one traversal is a design call for a human, and the human has already kept sibling different-purpose walk pairs as they are (PTQ-1142 keep-whole precedent, cited in REVIEW_LOG); the only asymmetry those rulings do not cover is the missing `never` backstop in `#walkStmt`; not a duplicate of same-wave d4-01, which is about a different pair of files (lexical-call-sites/par-for-body-checks) (triage: claude-opus-5-5)
verdict: questionable — accounting verified: I re-ran the case census. theta-ast.ts declares 18 `Stmt` kinds (829-847) and 20 `Expr` kinds (339-359). `walkStmt` (type-layer-walk.ts:170-265) names all 18 behind a `never` default. `#walkStmt` (static-type-inference.ts:180-232) names 11 kinds and sends the other 7 to a silent `default`. `walkExpr` (1418-1577) and `#typeValue` (341-467) each name all 20 `Expr` kinds. Both passes are live: type-layer-checks.ts:366/379 builds both. Whether they should share one traversal is a design call for a human, and the human has already kept a similar pair of walks separate (PTQ-1142 keep-whole precedent). Not a duplicate: d4-01 in the same wave covers lexical-call-sites/par-for-body-checks (triage: claude-opus-5-5)
