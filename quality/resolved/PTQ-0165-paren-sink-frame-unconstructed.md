---
id: PTQ-0165
title: SchemaSinkFrame declares a `paren` variant and resolveQuerySchemaSink keeps a switch arm for it, but nothing in the repository constructs a `paren` frame
lens: D2
status: fixed
verdict: confirmed
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
verdict: questionable — every mechanical claim reproduced (`"paren"` = exactly 2 src hits, decl :93 and fall-through consumer :190; zero producers among the 7 kinds the sole frame builder constructs; no computed/`as`/string-keyed `kind`; `Expr` has 20 kinds and no paren node, the primary parser folding `(…)` to `inner` at theta-document.ts:5360-5367), and it is not the confirmed `stop.label` filing's root cause — but the harm anchor is taste: the candidate itself concedes the transparent arm is behaviourally identical reached or not, and it omits that this union is a named 1:1 mirror of query-forms.md:41's normative crossed list whose FIRST item is "parenthesisation `(...)`", the arm being born with the union in 6d6f8a41 rather than stranded by a removed producer, so deleting it trades two inert lines against code-to-spec enumeration parity (and paren transparency is satisfied structurally, as static-type-inference.ts:696 also records) — a human should rule delete-vs-annotate (triage: claude-opus-5)
verdict: confirmed — re-verified independently: `"paren"` occurs at exactly 2 ts sites across src/extensions/tools/tests (query-schema-inference.ts:93 declaration, :190 fall-through case); the sole production frame builder query-schema-resolve.ts constructs 7 kinds (propagate 1, ternary 2, array-literal 1, let 5, call-arg 7, fn-return 4, stop 19) and never `paren`, tests/query-schema-inference.test.ts constructs 6 kinds and never `paren` (so not test-only-reachable), no computed/cast/string-keyed `kind`, no `default`/never exhaustiveness over `frame.kind`; `Expr` (theta-document.ts:474-494) has 20 node kinds with no parenthesis node and the primary parser folds `(…)` to `inner` (:5658-5665 — content verbatim, line drift only); `git log -S` shows the arm born in V13b-T red commit 6d6f8a41 with impl 72272a20 never producing it and no src commit ever constructing one — the same shape as confirmed PTQ-0017/PTQ-0037/PTQ-0138. The prior "questionable" grounds do not hold: "behaviourally identical reached or not" is the definition of deadness, not a downgrade; the arm is a transparent fall-through, not a spec-mandated fail-closed branch; query-forms.md:41 states language semantics the parser satisfies structurally and no doc maps `paren` as a code identifier; delete-vs-annotate is the fix stage's call. Not PTQ-0052 (`stop.label` write-only) (triage: claude-opus-5)
