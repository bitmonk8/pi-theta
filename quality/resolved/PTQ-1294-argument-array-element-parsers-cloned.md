---
id: PTQ-1294
title: argument-list and array-literal element parsers cloned in body-parser
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/parser/body-parser.ts:4132-4148
  - src/parser/body-parser.ts:4155-4171
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# argument-list and array-literal element parsers cloned in body-parser

## Observation
`BodyParser.parseArgs` and `BodyParser.parseArray` both parse a comma-separated list of expressions inside matching bracket punctuation. After the opening bracket is consumed, the two functions run the same loop: save and clear `suppressBrace`, iterate until the closing punctuator or EOF, parse an element with `parseExpression`, skip past null results, push the result, consume optional commas, restore `suppressBrace`, consume the closing bracket, and return the collected values. The two functions sit adjacent in the same file.

## Evidence
Clone-map group G007, renamed-only (93 tokens).

`src/parser/body-parser.ts:4132-4148` (`parseArgs`):
```typescript
    this.advance(); // `(`
    const saveArgs = this.suppressBrace;
    this.suppressBrace = false;
    while (!this.isPunct(")") && !this.atEnd()) {
      const arg = this.parseExpression();
      if (arg === null) {
        this.advance();
        continue;
      }
      args.push(arg);
      if (this.isPunct(",")) {
        this.advance();
      }
    }
    this.suppressBrace = saveArgs;
    if (this.isPunct(")")) {
      this.advance();
    }
    return args;
```

`src/parser/body-parser.ts:4155-4171` (`parseArray`):
```typescript
    const open = this.advance(); // `[`
    const saveArr = this.suppressBrace;
    this.suppressBrace = false;
    const elements: Expr[] = [];
    while (!this.isPunct("]") && !this.atEnd()) {
      const el = this.parseExpression();
      if (el === null) {
        this.advance();
        continue;
      }
      elements.push(el);
      if (this.isPunct(",")) {
        this.advance();
      }
    }
    this.suppressBrace = saveArr;
    if (this.isPunct("]")) {
      this.advance();
    }
```

Diff verdict: renamed-only. The punctuation tokens differ (`(`/`)` vs `[`/`]`), local names differ (`args`/`saveArgs`/`arg` vs `elements`/`saveArr`/`el`), and `parseArray` keeps the opening token to build a range while `parseArgs` returns the array directly. The control-flow and recovery logic are identical.

## Why this is a problem
The duplication is load-bearing: it defines how two different bracketed expression-list constructs are parsed. If the two copies drift, call arguments and array elements would be parsed with different recovery, brace-suppression, or trailing-comma behaviour, creating an inconsistent surface for otherwise symmetric grammar productions.

## Suggested direction (non-binding, optional)
A single shared helper in `src/parser/` that parses a delimited list of expressions given open/close punctuators and a result collector would remove the duplication while preserving the small differences in range construction and early-return behaviour.

## False-positive check
- Re-read both spans in current code; both functions are live production parsers.
- No spec clause is cited as the reason for keeping the two copies separate.
- `git log -L` of the two functions shows they have been maintained independently; no rationale comment links them as intentional mirrors.
- Not tests/ or generated code.

## Triage
verdict: confirmed — excerpts match verbatim at body-parser.ts:4132-4148 (`parseArgs`) and 4155-4171 (`parseArray`); clone-scan map re-run reproduces `G007 — 93 tokens — renamed-only` on exactly those spans; both copies are live production code (parseArgs called at 3049/3136/3149/4084, parseArray at 3175); the only differences are the bracket punctuators, local names and parseArray's range construction, the loop body (suppressBrace save/clear/restore, null-result skip-advance recovery, optional comma, optional close) is identical; no spec clause or rationale comment pins the copies apart and neither is a normative vector table; not tracked elsewhere (PTQ-1280 is a D9 breakdown of the whole file, a different root cause) — a mechanical delimited-expression-list dedupe (triage: claude-fable-5-1)
