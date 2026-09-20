---
id: pending
title: ExprParser and TypeParser token cursor skeletons are cloned
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/literal-sublanguage.ts:264-277
  - src/parser/type-grammar.ts:599-612
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# ExprParser and TypeParser token cursor skeletons are cloned

## Observation
`src/parser/literal-sublanguage.ts` defines `ExprParser`, a small recursive-descent parser for literal expressions. `src/parser/type-grammar.ts` defines `TypeParser`, a recursive-descent parser for the `Type` grammar. Both classes open with the same cursor state (`private pos = 0`), a constructor that stores the token array plus a small amount of context, and byte-identical `peek` and `next` accessor methods. The surrounding class names, token types, and extra constructor parameters differ, but the cursor mechanics are the same.

## Evidence

`src/parser/literal-sublanguage.ts:264-277`:
```typescript
    private readonly source: string,
  ) {}

  private peek(): ExprToken | undefined {
    return this.tokens[this.pos];
  }

  private next(): ExprToken | undefined {
    const t = this.tokens[this.pos];
    this.pos += 1;
    return t;
  }

  private spanFrom(start: number): number {
    const prev = this.tokens[this.pos - 1];
    return prev !== undefined ? prev.end : start;
  }
```

`src/parser/type-grammar.ts:599-612`:
```typescript
    // Bug 0244 (operator adjudication): the enclosing declaration's site and
    // the caller's diagnostics array, both explicit constructor dependencies
    // so `parseObject`'s discard arms can raise the keyless-entry refusal
    // where it happens rather than threading it back out through `parse()`'s
    // return value.
    private readonly site: TypeCheckSite,
    private readonly diagnostics: Diagnostic[],
  ) {}

  private peek(): TypeToken | undefined {
    return this.tokens[this.pos];
  }

  private next(): TypeToken | undefined {
    const t = this.tokens[this.pos];
    this.pos += 1;
    return t;
  }

  private eatPunct(text: string): boolean {
```

Diff verdict: renamed-only per clone-map group G085. The `peek` and `next` bodies are identical except for the token type names (`ExprToken` vs `TypeToken`). The constructors differ only in the extra context parameters (`source` vs `site`/`diagnostics`).

## Why this is a problem
The duplication is load-bearing. Both parsers rely on the same cursor discipline: `pos` indexes into a token array, `peek` reads without advancing, and `next` reads and advances. If one copy changes — for example, to add bounds checking, return a sentinel instead of `undefined`, or track line/column information — the other could silently drift. Because the two parsers operate on different grammars, such a drift would be hard to detect until a specific literal or type expression parses incorrectly.

## Suggested direction (non-binding, optional)
The natural shared home is a small token-cursor helper or base class in `src/parser`, consumed by both `ExprParser` and `TypeParser`. The helper would own `pos`, `peek`, and `next`; each parser would keep its grammar-specific methods and constructor context.

## False-positive check
- Re-read both cited spans immediately before filing; both classes are live production code.
- Confirmed clone-map group G085 matches the exact line ranges.
- The similarity is not a spec-normative vector table; it is duplicated parser infrastructure.
- No test files are involved.

## Triage
