---
id: PTQ-1716
title: PatternNode.numericType locates BodyParser.parsePrimary in the AST contract file.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/theta-ast.ts:230-238
  - src/parser/body-parser.ts:2259-2274
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# PatternNode.numericType locates BodyParser.parsePrimary in the AST contract file.

## Observation
The literal-pattern numeric-type field's docstring says `BodyParser.parsePrimary`'s number branch is in “this file.” The docstring is in `theta-ast.ts`, while the method and numeric-expression construction are in `body-parser.ts`. The numeric provenance explanation still refers to a live implementation, but its location-relative pointer names the former combined host.

## Evidence
The current-file pointer, `src/parser/theta-ast.ts:230-238`:

```ts
      /**
       * The lexed numeric spelling (`Token.numericType`, lexer.ts), carried
       * exactly as `BodyParser.parsePrimary`'s number branch (this file)
       * carries it onto `NumberExpr`. Present ONLY for a "number" spelling
       * (`1.0`, `1e10`) because that is the one case unrecoverable from
       * `value` alone (a `number`-spelled integral literal parses to an
       * integral JS value, so `Number.isInteger` cannot tell `1.0` from `1`);
       * an absent field means the "integer" default, mirroring the
       * expression path's own `t.numericType ?? "integer"` read.
```

The actual method starts at `src/parser/body-parser.ts:2259-2265`:

```ts
  private parsePrimary(): Expr | null {
    const t = this.peek();
    // `par for` — `par` is a contextual keyword recognised only immediately
    // before `for` (grammar.md §"Contextual keywords"); everywhere else `par`
    // is a normal identifier and falls through to the ident path below.
    if (t.kind === "ident" && t.text === "par" && this.isKeyword("for", 1)) {
      return this.parseParFor();
```

Its number branch, `src/parser/body-parser.ts:2267-2274`:

```ts
    if (t.kind === "number") {
      this.advance();
      return {
        kind: "number",
        text: t.text,
        numericType: t.numericType ?? "integer",
        range: t.range,
      };
```

Exact search: `grep -n 'parsePrimary' src/parser/theta-ast.ts` returns one hit, the quoted comment at line 232, not a method definition.

## Why this is a problem
The AST contract retains a location-relative comment from the combined parser module. Following its “this file” pointer does not lead to the expression-side implementation offered as the field's provenance comparison. This finding concerns the stale locator, not the field or its deliberate optionality.

## False-positive check
Read `theta-ast.ts` and inspected the cited method and number branch in `body-parser.ts`. The search above confirms that the AST file's only `parsePrimary` occurrence is the comment. `git log --oneline -S 'number branch (this file)' -- src/parser/theta-ast.ts` identifies `7a0d5e0e`; `git show 7a0d5e0e -- src/parser/theta-ast.ts` shows the newly extracted contract file carrying this docstring. No deadness claim is made about the field, method, or AST types.

## Triage
verdict: confirmed — theta-ast.ts:232 retains “number branch (this file)”, but its sole parsePrimary hit is that comment; the method and numericType default are in body-parser.ts:2259-2274, and commit 7a0d5e0e verifies the locator survived AST extraction; no existing finding tracks this stale pointer. (triage: claude-opus-5-5)
