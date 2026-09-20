---
id: pending
title: Quote-aware top-level delimiter scanners cloned across params, frontmatter, and type-layer-checks
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/params.ts:1278-1290
  - src/parser/params.ts:1866-1878
  - src/parser/params.ts:2146-2160
  - src/parser/frontmatter.ts:1451-1464
  - src/parser/type-layer-checks.ts:1278-1292
sites: 5
fix_scope: cross-module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Quote-aware top-level delimiter scanners cloned across params, frontmatter, and type-layer-checks

## Observation
Five production functions contain the same quote-aware character-scanning loop: they iterate a string, skip `\\`-escaped characters inside `"`/`'` quoted regions, and track nested bracket/angle/brace depth before deciding where a top-level delimiter lies. The copies are in `src/parser/params.ts` (`findCutBracketGroupText`, `hasUnterminatedStringLiteral`, `topLevelColon`), `src/parser/frontmatter.ts` (`splitParamValue`), and `src/parser/type-layer-checks.ts` (`braceGroupCarriesUnmatchedCloseToken`). Clone-map groups G010, G021, G025, and G046 all flag overlapping occurrences of this loop.

## Evidence
`src/parser/params.ts:1278-1290` (clone-map group G025):
```ts
  for (let i = 0; i < interior.length; i += 1) {
    const c = interior[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < interior.length) {
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "<") {
      angle += 1;
```

`src/parser/params.ts:1866-1878` (clone-map groups G021, G025):
```ts
function hasUnterminatedStringLiteral(text: string): boolean {
  let quote: string | undefined;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < text.length) {
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
    }
  }
  return quote !== undefined;
}
```

`src/parser/params.ts:2146-2160` (clone-map groups G010, G021, G025):
```ts
export function topLevelColon(entry: string): number {
  const open: string[] = [];
  let quote: string | undefined;
  for (let i = 0; i < entry.length; i += 1) {
    const c = entry[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < entry.length) {
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "<" || c === "{" || c === "(") {
      open.push(c);
```

`src/parser/frontmatter.ts:1451-1464` (clone-map group G046):
```ts
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < raw.length) {
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "<" || c === "{" || c === "[") {
      depth += 1;
      continue;
    }
    if (c === ">" || c === "}" || c === "]") {
      depth -= 1;
      continue;
    }
```

`src/parser/type-layer-checks.ts:1278-1292` (clone-map groups G010, G021, G025, G046):
```ts
function braceGroupCarriesUnmatchedCloseToken(text: string): boolean {
  const stack: string[] = [];
  let quote: string | undefined;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < text.length) {
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "<" || c === "{") {
      stack.push(c);
```

Diff verdict: renamed-only at the token level (the clone map labels all four groups renamed-only). The copies differ in which delimiter families they track (`(` / `[` / `{` / `<` vs. only `{` / `<`) and in whether they also search for a specific top-level character, but the quote-handling core is repeated verbatim.

## Why this is a problem
All five sites must agree on what a quoted region is and on how nested brackets affect delimiter visibility. If one copy fixes a bug in escape handling (for example, treating `\\"` correctly or changing how bare `\n` inside a string is counted) while another is missed, the same source text will be split differently by `params:`, frontmatter, and type-layer checks. The `braceGroupCarriesUnmatchedCloseToken` comment explicitly says it mirrors `isSingleEnclosingBraceGroup` in `params.ts` so the two agree "by construction rather than by coincidence," which is an admission that the agreement is load-bearing.

## Suggested direction (non-binding, optional)
The natural shared home is an existing parser helper module (`src/parser/`), because all consumers already live in the parser/frontmatter layer. A single quote-aware top-level scanner could return delimiter positions; each caller would then decide what to do with them.

## False-positive check
- Re-verified all five spans at HEAD; every copy is live and called from production paths.
- Confirmed clone-map groups G010, G021, G025, and G046 match these exact line ranges.
- Searched `quality/intake/` for `topLevelColon`, `braceGroupCarriesUnmatchedCloseToken`, `splitParamValue`, `hasUnterminatedStringLiteral`, and `findCutBracketGroupText`: no existing D4 filing covers this cluster.
- Not a spec-normative vector table; not generated code; not in `tests/`.

## Triage
verdict: questionable — all 5 excerpts reproduce at the cited lines, every copy has live src callers, clone-scan reproduces G010/G021/G025 (params manifest) and G046 (frontmatter manifest), and the code's own "reproduces byte for byte" / "agree by construction" comments prove the quote-core agreement is load-bearing (not incidental); but the roster is incomplete — the identical quote/escape core occurs at 9 src/parser sites (grep `if (c === "\\" && i + 1 <` → 9 hits), omitting params.ts:1157 classifyGenericArgumentSegments, :1598 isSingleEnclosingBraceGroup (the very anchor the "why" quotes), :1660 isBraceBalanced, :2245 splitTopLevelSegments — and the shared part is a ~10-line prefix inside loops with divergent bodies (typed stack vs depth counter, accumulating vs not, early-return vs scan-to-end), so the dedupe is a scanner abstraction to design rather than a mechanical lift; human should rule with the corrected 9-site count (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: all 5 excerpts byte-exact at cited lines, all 5 functions live from src callers (params.ts:1371/269/445/1395, body-type-lowering.ts:214, frontmatter.ts:1029/1086/1543, type-layer-checks.ts:1414), clone-scan reproduces the clusters at the same ranges under renumbered ids (G010 stable; G021/G025→G019/G022/G023; G046→G042), and the quoted-region rule is genuinely load-bearing (type-layer-checks.ts:1273-1277 "agree … by construction"); but the roster undercounts — grep `if (c === "\\" && i + 1 <` in src/ → 9 hits, all src/parser, omitting classifyGenericArgumentSegments (params.ts:1157), isSingleEnclosingBraceGroup (:1598, the very mirror anchor the "why" quotes), isBraceBalanced (:1660), splitTopLevelSegments (:2245) — and the "why" overclaims that all sites must agree on bracket nesting when the bracket handling diverges by documented design (bug 0238 §Fix: typed opener stack in topLevelColon/braceGroupCarriesUnmatchedCloseToken vs bare depth in splitParamValue/isBraceBalanced vs angle-only floor in findCutBracketGroupText), so only the ~10-line quote/escape prefix is shareable and two sites (1157, 2245) additionally accumulate the escaped bytes into `current`; the dedupe is a skip-quoted-region helper or scanner abstraction to design, not a mechanical lift — human should rule on the corrected 9-site roster and on quote-core-only scope; not a dup of sibling d4-15 (non-quote-aware type-layer-checks splitters) (triage: claude-fable-5-1)
