---
id: pending
title: Literal-sublanguage primary expression dispatch clones theta-document primary expression dispatch
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/literal-sublanguage.ts:424-432
  - src/parser/theta-document.ts:5724-5732
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Literal-sublanguage primary expression dispatch clones theta-document primary expression dispatch

## Observation
`src/parser/literal-sublanguage.ts` contains a tolerant recursive-descent parser (`ExprParser`) used only to check whether a `params:` default RHS is in the literal sublanguage. `src/parser/theta-document.ts` is the canonical full theta expression parser. Despite their different AST shapes, the two parsers contain the same primary-expression dispatch: when the current token is an identifier, look ahead for `{` to decide it is a named-object literal; otherwise return an identifier node; when the current token is `(`, consume it, parse a nested expression, consume `)`, and return the inner node.

## Evidence

`src/parser/literal-sublanguage.ts:424-432`:
```typescript
      if (this.peek()?.text === "{") {
        const obj = this.parseObjectBody(t.start);
        return obj;
      }
      return { kind: "ident", start: t.start, end: t.end };
    }
    if (t.kind === "punct") {
      if (t.text === "(") {
        this.next();
        const inner = this.parseTernary();
        if (this.peek()?.text === ")") {
          this.next();
        }
        return inner;
```

`src/parser/theta-document.ts:5724-5732`:
```typescript
      // Named object literal / schema constructor `Ident { field: expr, … }`
      // (grammar.md `NamedObjectLit`), unless brace-suppression is active (a
      // control-flow header, where the `{` opens the block).
      if (this.isPunct("{") && !this.suppressBrace) {
        return this.parseObjectLiteral(t.text, t.range);
      }
      return { kind: "ident", name: t.text, range: t.range };
    }
    if (t.kind === "punct") {
      if (t.text === "(") {
        this.advance();
        const inner = this.parseBracketedExpression();
        if (this.isPunct(")")) {
          this.advance();
        }
        return inner;
```

Diff verdict: renamed-only per clone-map group G079. The token-level differences are identifier renames (`peek`/`isPunct`, `parseTernary`/`parseBracketedExpression`, `next`/`advance`, `parseObjectBody`/`parseObjectLiteral`) and the node-field names (`start`/`end` vs `name`/`range`). The theta-document copy also carries a context-specific `!this.suppressBrace` guard for control-flow headers, which is absent in the literal parser because it never parses headers.

## Why this is a problem
The duplication is load-bearing. The literal sublanguage is defined as a strict subset of the theta expression grammar, so the two parsers must agree on which primary forms are admitted. If a new primary form is added to the canonical parser — or if the named-object-literal lookahead changes — the literal parser must be updated in the same way. Otherwise a `params:` default RHS and a body-code expression could parse the same source text into different shapes, or one surface could accept a form the other refuses.

## Suggested direction (non-binding, optional)
The natural shared home is a common primary-expression parser seam in `src/parser`, parameterized by the node builder and the object-literal parser, so the full parser and the literal checker can share the dispatch logic while keeping their distinct AST types.

## False-positive check
- Re-read both cited spans immediately before filing; both functions are live production code.
- Confirmed clone-map group G079 matches the exact line ranges.
- The divergence (`suppressBrace`) is explained by the literal parser's narrower context and does not contradict the clone relationship.
- Not a spec-normative vector table; it is duplicated parser logic.
- No test files are involved.

## Triage
