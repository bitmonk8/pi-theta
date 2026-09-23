---
id: PTQ-1303
title: brace-scanning loop cloned between two predicates in type-text-split
lens: D4
status: open
verdict: confirmed
locations:
  - src/parser/type-text-split.ts:55-75
  - src/parser/type-text-split.ts:117-137
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# brace-scanning loop cloned between two predicates in type-text-split

## Observation
`src/parser/type-text-split.ts` exports `isSingleEnclosingBraceGroup` and the module-local `isBraceBalanced`. Both predicates scan a string while skipping `"`/`'` quoted regions and tracking brace depth. The quote-aware scanning body is byte-identical between the two functions, including the backslash-escape handling. The same file already extracts the quote/escape skip into `skipQuotedRegion` (lines 279-290), which `hasUnterminatedStringLiteral` and `topLevelColon` reuse; only these two brace predicates keep an inline copy.

## Evidence
**`src/parser/type-text-split.ts:55-75`** (`isSingleEnclosingBraceGroup`):
```ts
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < s.length) {
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
    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
```

**`src/parser/type-text-split.ts:117-137`** (`isBraceBalanced`):
```ts
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < s.length) {
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
    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth < 0) {
```

**Diff verdict:** identical except for the surrounding function context and the immediately following branch (`return i === s.length - 1;` vs `return false;`). Clone-map group **G002** (128 tokens, identical).

## Why this is a problem
The two predicates answer different but coupled questions about the same source text: whether a whole string is one enclosing brace group, and whether every segment of a union split is brace-balanced. If the quote/escape rule drifts between them — for example, one learns to handle a new escape form or rejects unmatched quotes differently — the other will misclassify the same input. The file's own comments cite bugs 0039, 0053, 0096 and 0097, where disagreements between root-level and arm-level brace classification produce silently wrong type lowerings. The presence of `skipQuotedRegion` in the same module shows the codebase already treats this scanning rule as a single source of truth; these two inline loops are the uncovered copies.

## Suggested direction (non-binding, optional)
Both predicates could delegate quoted-region skipping to the existing `skipQuotedRegion` helper, leaving each function to manage only its own depth/termination rule. The natural shared home is `src/parser/type-text-split.ts` itself, where `skipQuotedRegion` already lives.

## False-positive check
- Re-verified the clone-map group G002 at the cited line ranges; both copies are live and in `src/` production code.
- Read the surrounding comments; they are deliberate design commentary, not a stated rationale for keeping the loop inline.
- Confirmed `skipQuotedRegion` exists in the same file and is already used by `hasUnterminatedStringLiteral` and `topLevelColon`.
- This is not a spec-normative vector table; it is a parser utility predicate.

## Triage
verdict: confirmed — both excerpts byte-exact at type-text-split.ts:55-75 and :117-137; clone-scan map on the file reproduces `G002 — 128 tokens — identical` at exactly those ranges; both copies live from src (isSingleEnclosingBraceGroup ← params.ts:1592/1600/1725/1827/1835/1839, body-type-lowering.ts:349/658, annotation-validation.ts:519; isBraceBalanced ← params.ts:1591/1834, exported at :457 — the filing's "module-local" is a minor misstatement, not load-bearing); skipQuotedRegion (:279-290) exists and its own header names the five PTQ-1140 sites it unified, confirming these two loops are the residual the fixed PTQ-1140 roster omitted (its triage notes flagged exactly them as uncounted), so not a duplicate of an open row; the shared quote/escape rule is load-bearing by the module's own "agree by construction" rationale, not incidental similarity; fix is a mechanical delegation to the existing helper (triage: claude-fable-5-1)
