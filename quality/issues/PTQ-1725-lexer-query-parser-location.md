---
id: PTQ-1725
title: scanTemplateProse still names theta-document.ts as the location of parseQuery.
lens: D2
status: open
verdict: confirmed
locations:
  - src/lexer/lexer.ts:501-510
  - src/parser/body-parser.ts:3116-3119
  - src/parser/body-parser.ts:3192-3203
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# scanTemplateProse still names theta-document.ts as the location of parseQuery.

## Observation
The `scanTemplateProse` header identifies `theta-document.ts parseQuery` as the collaborator that recovers a template by slicing between backtick tokens. `parseQuery` now lives in `body-parser.ts`, where the cited raw-template slice is implemented. The lexer comment retains the previous implementation location.

## Evidence
The collaborator citation, `src/lexer/lexer.ts:501-510`:

```ts
/**
 * Consume one character (or delimiter / escape pair / `${` entry) of a
 * template PROSE region, consuming verbatim. The parser recovers the template
 * by slicing the raw body between the backtick TOKENS (theta-document.ts
 * parseQuery) and re-lexes `${...}` from that slice (query-render.ts
 * lexQueryTemplate), so prose needs no interior tokens — only the backtick
 * delimiters and interpolation `${` must still tokenise. Advancing keeps
 * line/column correct for those delimiter spans.
 */
function scanTemplateProse(
```

The present method declaration, `src/parser/body-parser.ts:3116-3119`:

```ts
  private parseQuery(): Expr {
    const at = this.advance(); // `@`
    let schema: string | null = null;
    // An optional `@<Schema>` annotation precedes the backtick template
```

The described slice, `src/parser/body-parser.ts:3192-3203`:

```ts
    // Recover the verbatim template between the backticks from the raw body
    // source (the tokens are a lossy, space-joined view — they collapse the
    // author's spacing and drop interpolation braces). Fall back to the
    // space-joined tokens only when the raw slice is unavailable (no closing
    // backtick, or no body source threaded through).
    const rawTemplate =
      openTick !== null && closeTick !== null && this.bodyText.length > 0
        ? this.bodyText.slice(
            positionToOffset(this.bodyText, openTick.range.end),
            positionToOffset(this.bodyText, closeTick.range.start),
          )
        : parts.join(" ");
```

Exact search: `grep -n 'private parseQuery' src/parser/theta-document.ts src/parser/body-parser.ts` returns one hit, in `body-parser.ts` at line 3116, and none in the cited `theta-document.ts`.

## Why this is a problem
This is a stale implementation-location citation in the scanner's explanatory header. The description of the raw-slice collaboration still corresponds to current code, but the named file no longer contains that implementation. The finding does not challenge the lexer/parser split or template handling.

## False-positive check
Ran the exact method-location search recorded above and inspected the raw-template slice at the cited destination. `git log --oneline -S 'class BodyParser' -- src/parser/body-parser.ts src/parser/theta-document.ts` identifies the extraction commit `702a1f2e`; `git show 702a1f2e -- src/parser/body-parser.ts` includes the moved `private parseQuery()` method. `git log --oneline -S 'parseQuery) and re-lexes' -- src/lexer/lexer.ts` traces the citation to `48b9417f`. `git log --oneline -S 'scanTemplateProse' -- src/lexer/lexer.ts` identifies the later helper extraction in `128db09c`. Existing PTQ-1280 covers body-parser concern placement, not this lexer-header citation. No deadness or behavior-change claim is made.

## Triage
verdict: confirmed — lexer.ts:504-505 still cites theta-document.ts for parseQuery, but the sole declaration and raw-template slice are in body-parser.ts:3116 and :3192-3203; all stated searches and extraction history reproduce, and no same-root-cause filing was found. (triage: claude-opus-5-5)
