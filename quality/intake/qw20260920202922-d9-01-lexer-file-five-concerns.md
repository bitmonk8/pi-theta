---
id: pending
title: src/lexer/lexer.ts bundles encoding validation, tokenisation, continuation joining, and contextual identifier checks in one 1180-LOC module
lens: D9
status: intake
verdict: pending
locations:
  - src/lexer/lexer.ts:1-1180
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/lexer/lexer.ts
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# src/lexer/lexer.ts bundles encoding validation, tokenisation, continuation joining, and contextual identifier checks in one 1180-LOC module

## Observation
The structural map places src/lexer/lexer.ts at 1180 LOC, justify band (presumption of breakdown). The header (lines 1-13) names the module "the lexer core seam" owning "load-time encoding validation, newline normalisation, and tokenisation ... plus the closed continuation-trigger statement-joining rule". The public surface is small — `lexTheta` (importers 1 src/4 tests), `reservedKeywords` (3/3), `firstInvalidUtf8Offset` (1/0), and the Token/ThetaSource/LexResult types — while ~950 LOC are private helpers that communicate only through token arrays returned to the `lexTheta` pipeline (lines 89-131: validate → decode/normalise → `scanTokens` → `collapseContinuations` → `contextualDiagnostics`).

## Evidence
Distinct-concern inventory (line ranges and LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| public lex API & token model | TokenKind, Token, ThetaSource, LexResult, lexTheta | 27-131 | ~92 |
| UTF-8 encoding validation & decode | firstInvalidUtf8Offset, decodeUtf8, normaliseNewlines | 230-301 | 68 |
| tokenisation (scanner + keyword/operator tables) | reservedKeywords, twoCharOperators, isDigit, isHexDigit, isIdentStart, isIdentPart, RawToken, scanTokens | 141-215, 310-806 | ~540 |
| newline-continuation joining | trailingTriggers, leadingTriggers, collapseContinuations | 182-199, 817-872 | 68 |
| contextual identifier/keyword checks | BraceRegion, classifyBrace, startsStatement, startsDeclaration, isNameSlot, contextualDiagnostics | 884-1180 | 198 |

The phases pass complete arrays between each other, not shared locals — lexer.ts:120-123:

```typescript
  const scanned = scanTokens(text, file);
  const tokens = collapseContinuations(scanned.tokens);
  const contextual = contextualDiagnostics(tokens, file);
  const diagnostics: Diagnostic[] = [...scanned.diagnostics, ...contextual];
```

The contextual-check family even documents parser-adjacent duties distinct from tokenisation (contextualDiagnostics doc, lines 1046-1060: "full identifier-position coverage ... is a parser-leaf obligation; the lexer core enforces the positions its closed Tests obligations name").

## Why this is a problem
Justify band: presumption of breakdown unless a concrete keep-whole reason is found. Reasons considered and defeated: (a) single algorithm with shared local state — fails at file scope; the five concerns exchange only `RawToken[]`/`Token[]` values through `lexTheta` (lines 120-123 above), no locals cross function boundaries; (b) data-only module — fails: type declarations and tables total ~130 of 1180 LOC (~11%, far below 80%); (c) one grammar production family — fails: the file spans lexical.md §Encoding (230-285), the token classes (310-806), grammar.md §Newline continuation (817-872), and parser-leaf-adjacent name-slot discrimination (884-1180) — several spec areas, not one production; (d) generated code — no generator; hand-maintained with per-bug comments; (e) exemptions.json — no entry for this host.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: contextual checks (BraceRegion, classifyBrace, startsStatement, startsDeclaration, isNameSlot, contextualDiagnostics) -> src/lexer/contextual-checks.ts (hypothesis) - 198 LOC, 0 exported symbols moved (all private today; one call site in lexTheta), cross-reference back into the host for the Token type. Seam B: encoding (firstInvalidUtf8Offset, decodeUtf8, normaliseNewlines) -> src/lexer/encoding.ts (hypothesis) - 68 LOC, 1 exported symbol moved (firstInvalidUtf8Offset, importers 1 src/0 tests), no cross-reference back. Seam C: continuation pass (trailingTriggers, leadingTriggers, collapseContinuations) -> src/lexer/continuation.ts (hypothesis) - 68 LOC, 0 exported symbols moved, cross-references back for Token/RawToken.

## False-positive check
Band: 1180 LOC, justify (thresholds quoted in the wave brief: 1000-1999). Reasons-considered list recorded above with the evidence defeating each. Exemptions check: quality/exemptions.json read — no D9 entry for src/lexer/lexer.ts. Generated-code check: header attributes the file to hand-written leaves V1a/V1a-T; git log shows incremental hand fixes (bug 0044-0412), no generator. Spec-mirror check: the file cites lexical.md and grammar.md but spans multiple spec topics rather than mirroring one closed enumeration. Prior-split-revert check: `git log --oneline --follow -- src/lexer/lexer.ts` shows no split-and-revert history.

## Triage
verdict: questionable — accounting verified: size-scan reproduces 1180 LOC / justify band; the five inventory rows are real member clusters that cross-reference only within themselves and meet solely through lexTheta (lines 120-123, excerpt verbatim); no exemptions.json entry, no split/revert history, no overlooked keep-whole reason; the breakdown shape needs a human ruling (triage: claude-fable-5-1)
