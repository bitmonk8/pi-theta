---
id: PTQ-1120
title: system: interpolation brace scanner cloned in query template renderer
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/parser/system-interpolation.ts:291-313
  - src/render/query-render.ts:219-242
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# system: interpolation brace scanner cloned in query template renderer

## Observation
`checkSystemInterpolation` in `src/parser/system-interpolation.ts` and the query-template lexer in `src/render/query-render.ts` both contain a `${…}` interpolation scanner that tracks `{`/`}` nesting while accumulating the body text. Within the cited spans the loop bodies differ only by variable names (`systemValue`/`source`, `body`/`exprSource`) and comment wording. The clone map labels the relationship renamed-only (group G014). After the loop the two copies diverge: the system-interpolation copy raises `theta/parse/system-interp-unterminated`, while the query-renderer copy pushes the parsed interpolation part and advances.

## Evidence
`src/parser/system-interpolation.ts:291-313`:
```typescript
    if (c === "$" && systemValue[i + 1] === "{") {
      // Scan to the matching `}` (tracking `{`/`}` nesting so a brace inside the
      // body does not close the interpolation early); EOF first ⇒ unterminated.
      flushText();
      let depth = 1;
      let j = i + 2;
      let body = "";
      while (j < systemValue.length) {
        const cj = systemValue[j];
        if (cj === "{") {
          depth += 1;
        } else if (cj === "}") {
          depth -= 1;
          if (depth === 0) {
            break;
          }
        }
        body += cj;
        j += 1;
      }
      if (depth !== 0) {
        diagnostics.push(
          located(SYSTEM_INTERP_UNTERMINATED_CODE, SYSTEM_INTERP_UNTERMINATED_MESSAGE, file, input.range),
        );
```

`src/render/query-render.ts:219-242`:
```typescript
    if (c === "$" && source[i + 1] === "{") {
      // Only the `${` / `}` pair delimits an interpolation; braces alone are
      // ordinary text. Track nesting so a `}` inside the expression (e.g. an
      // object literal) does not close the interpolation early.
      flushText();
      let depth = 1;
      let j = i + 2;
      let exprSource = "";
      while (j < source.length) {
        const cj = source[j];
        if (cj === "{") {
          depth += 1;
        } else if (cj === "}") {
          depth -= 1;
          if (depth === 0) {
            break;
          }
        }
        exprSource += cj;
        j += 1;
      }
      parts.push({ kind: "interp", exprSource });
      // Advance past the closing `}` (or to EOF when the interpolation was not
      // closed — the outer loop then ends and `unterminated` fires).
      i = j + 1;
      continue;
```

Diff verdict: **renamed-only** per clone-map group G014; the shared brace-depth accumulator loop is identical except for identifiers and comments, while the post-loop actions differ (unterminated diagnostic vs. pushing the parsed part).

## Why this is a problem
Both the `system:` frontmatter surface and the query-template surface promise the same `${…}` interpolation grammar with brace nesting. If the nested-brace scanning semantics drift, the same source text can be parsed differently in the two surfaces. The duplication is load-bearing because these are two production parsing paths for the same language feature, not incidental similarity.

## Suggested direction (non-binding, optional)
The natural shared home is `src/render/query-render.ts`, which already owns the canonical interpolation rendering surface (`stringifyInterpolatedValue`, QRY-18). Extracting the common `${…}` scanner into a shared helper there (or a parser/render shared utility) would let both surfaces consume one implementation of the brace-nesting rule.

## False-positive check
- Re-read both cited spans immediately before filing; both functions are live production code.
- Verified the clone-map group id G014 at the cited line ranges.
- Searched `src/` for other `depth = 1` brace scanners; several exist (`query-render.ts:468`, `literal-sublanguage.ts`, `theta-document.ts`) but they use a different loop shape (`while (i < n && depth > 0)`), so they are not additional copies of this specific cloned span.
- Not generated code; not in `tests/`.

## Triage
verdict: confirmed — both excerpts match verbatim at the cited lines; clone-scan map reproduces G014 (100 tokens, renamed-only) at system-interpolation.ts:291-313 / query-render.ts:219-242; both hosts are live (checkSystemInterpolation called from parser/frontmatter.ts:2325, lexQueryTemplate from theta-document.ts:10479, type-layer-checks.ts:3510/3561, production-theta-producer.ts:7944); the inner brace-depth accumulator loop is identical modulo identifiers and only the post-loop action differs, so extracting it is a mechanical dedupe; no existing PTQ tracks this pair (PTQ-0805 is a tests/ D7 filing, PTQ-0335 a D9 breakdown of a different function) (triage: claude-fable-5-1)
