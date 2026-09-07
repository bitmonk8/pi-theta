---
id: pending
title: SchemaSinkFrame declares a `paren` variant and resolveQuerySchemaSink keeps a switch arm for it, but nothing in the repository constructs a `paren` frame
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/query-schema-inference.ts:92-100
  - src/parser/query-schema-inference.ts:188-194
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SchemaSinkFrame declares a `paren` variant and resolveQuerySchemaSink keeps a switch arm for it, but nothing in the repository constructs a `paren` frame

## Observation
`SchemaSinkFrame` is the frame union the typed-query schema-inference walk
consumes. Its first arm is `{ kind: "paren" }`, documented as
"parenthesisation `(…)`. Crossed.", and `resolveQuerySchemaSink` opens its
`switch` with a `case "paren":` fall-through into the transparent arm. The one
production module that builds `SchemaSinkFrame` values
(`src/parser/query-schema-resolve.ts`) constructs the other seven kinds and
never a `paren` one, and it has no construct to build one from: the `Expr` AST
union carries no parenthesis node — the primary parser returns the inner
expression for `( … )`. The string `"paren"` appears exactly twice in the
repository, both times inside `query-schema-inference.ts` itself.

## Evidence
src/parser/query-schema-inference.ts:92-100 — the union, `paren` first:

```ts
export type SchemaSinkFrame =
  | { readonly kind: "paren" }
  | { readonly kind: "propagate" }
  | { readonly kind: "ternary" }
  | { readonly kind: "array-literal" }
  | { readonly kind: "let"; readonly annotation: InferredSchema }
  | { readonly kind: "call-arg"; readonly paramType?: InferredSchema }
  | { readonly kind: "fn-return"; readonly returnType?: InferredSchema }
  | { readonly kind: "stop"; readonly label: string };
```

src/parser/query-schema-inference.ts:188-194 — the consuming arm:

```ts
  for (const frame of input.frames) {
    switch (frame.kind) {
      case "paren":
      case "propagate":
      case "ternary":
        // Transparent: continue the outward walk.
        break;
```

Producer search: `grep -n 'kind: "paren"' src/parser/query-schema-resolve.ts`
→ 0 hits, while `grep -n 'kind: "propagate"|kind: "ternary"|kind:
"array-literal"|kind: "call-arg"|kind: "stop"' src/parser/query-schema-resolve.ts`
→ 29 hits. A representative frame construction, src/parser/query-schema-resolve.ts:407
and :418-419:

```ts
        const operand = this.rewriteExpr(expr.operand, [{ kind: "propagate" }, ...frames]);
```
```ts
          consequent: this.rewriteExpr(expr.consequent, [{ kind: "ternary" }, ...frames]),
          alternate: this.rewriteExpr(expr.alternate, [{ kind: "ternary" }, ...frames]),
```

Why no producer can exist — src/parser/theta-document.ts:5360-5367, the
primary-expression parser folds parentheses away:

```ts
    if (t.kind === "punct") {
      if (t.text === "(") {
        this.advance();
        const inner = this.parseBracketedExpression();
        if (this.isPunct(")")) {
          this.advance();
        }
        return inner;
      }
```

`Expr` (src/parser/theta-document.ts:451-471) lists twenty node kinds and none
of them is a parenthesis node.

## Why this is a problem
Dead code, proven dead: a union arm with no constructor anywhere and a
`switch` arm that no input can reach. `grep -rn '"paren"' --include="*.ts" src
extensions tools tests` returns exactly 2 hits, and both are the declaration
and the consumer quoted above — there is no third site that could produce the
value. The variant is not a spec-mandated fail-closed branch: it is the
*transparent* arm, so reaching it and not reaching it are behaviourally
identical for the walk; its only effect today is to tell a reader that the
inference walk observes parenthesis frames that the AST cannot supply.

## Suggested direction (non-binding, optional)
Either drop the `paren` arm and its `case` label, or keep it and record beside
it that the parser folds parentheses so the arm is a placeholder for a node
kind the AST does not retain.

## False-positive check
- Reference search across the whole repository: `grep -rn '"paren"'
  --include="*.ts" src extensions tools tests` → 2 hits, both in
  src/parser/query-schema-inference.ts (:93 declaration, :190 consumer). No
  construction site.
- Case-insensitive sweep of tests for the word: `grep -rni "paren"
  --include="*.ts" tests` matches only prose words (`transparent`,
  `grandparent`, `parenthetical`); `grep -n "paren"
  tests/query-schema-inference.test.ts` → 1 hit, a comment about `?` being
  transparent. No test builds a `paren` frame, so this is not a
  test-only-reachable case.
- Producer inventory: `grep -rln "SchemaSinkFrame" --include="*.ts" src
  extensions tools tests` → query-schema-inference.ts (declaration),
  query-schema-resolve.ts (the frame builder), and
  tests/query-schema-inference.test.ts. Every frame literal in the builder was
  read; none is `paren`.
- Dynamic/string-keyed construction: searched query-schema-resolve.ts for a
  computed `kind` (`kind: k`, `kind as`, `["kind"]`) → no hits, so no frame
  kind is produced from a variable.
- AST check: read `Expr` (theta-document.ts:451-471) and the primary parser's
  `(` arm (:5360-5367); parentheses are folded to the inner node, so no
  parenthesis construct survives into the tree the frame builder walks.
- Already-filed set checked: the only query-schema-inference candidate on
  record (qw20260907130901-d2-06-schema-sink-stop-label-unread.md) is about
  the `stop` arm's `label` field, not the `paren` arm.

## Triage
