---
id: pending
title: src/parser/body-parser.ts residual after the PTQ-1280 Seam A extraction still bundles eight method groups in one 4076-LOC strong-band file
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/body-parser.ts:1-4076
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/body-parser.ts
d9_band: strong
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# src/parser/body-parser.ts residual after the PTQ-1280 Seam A extraction still bundles eight method groups in one 4076-LOC strong-band file

## Observation
src/parser/body-parser.ts is 4076 LOC (strong band, FILE_BANDS strong=2000) per the wave map. Its header says "Recursive-descent body parsing and token lookahead for the theta document seam." PTQ-1280 (confirmed, now fixed) filed this file at 4346 LOC with a nine-concern inventory; the ratified fix (commit cfd246b6, extending par-for-body-checks.ts at 19516518) extracted only Seam A — the CTRL-4 restriction scan — into src/parser/par-for-body-checks.ts, which body-parser.ts now imports (line 27) and calls once from parseParFor (line 3780). The remaining eight concern groups from that inventory are all still in the file, and the file removed ~270 LOC (6%), leaving it more than twice the strong threshold.

## Evidence
Import and sole call of the extracted seam (src/parser/body-parser.ts:27 and 3780-3785):

```ts
import { emitParForBodyDiagnostics } from "./par-for-body-checks";
...
    emitParForBodyDiagnostics(
      { diagnostics: this.diagnostics, file: this.file },
      body,
      outerMutables,
      variable,
    );
```

Distinct-concern inventory of the residual (member groups and LOC from the wave structural map, per-member LOC summed):

| concern | members | line ranges | LOC |
|---|---|---|---|
| token tables & lookahead predicates | COMPOUND_OPS, WITH_CLAUSE_KEYS, EXPRESSION_KEYWORDS, EXPRESSION_LEAD_PUNCT, STATEMENT_ONLY_KEYWORDS, ALIAS_ARM_STOP_KEYWORDS/PUNCT, isAliasResidueHead, canStartExpression, typeSourceEndsAtom, promoteTrailingExprToTail, Form, spanRange | 63-349, 4071-4073 | ~115 |
| cursor infrastructure | pos, suppressBrace, bindings, diagnostics, constructor, peek, eofToken, advance, atEnd, isPunct, isKeyword, unmatchedCloseParens, unmatchedCloseBraces, prevRange | 357-493, 4064-4067 | ~91 |
| statement/form recognition | parseBody, parseBlock, parseForms, parseForm, wrap, exprToStmt, simpleKeyword, parseLet, tryParseReassign, buildReassign, withImmutableBindings, parseHeaderExpression, parseIf, parseWhile, parseFor, parseFn, parseFnParamList, parseWithClause, parseCallWithClause, parseReturn | 497-1411 | ~849 |
| schema & enum declaration recognition | parseSchema, finishObjectSchema, finishAliasSchema, emitMalformedAliasRhs, parseByField, emitEmptySchemaBody, parseSchemaObjectBody, skipBraceRemainder, recoverMalformedSchemaField, parseEnum, parseEnumVariants, skipDeclarationShape, skipBraces | 1450-2108 | ~461 |
| import/export recognition | parseImportExport, parseImportSpecifierList | 2110-2366 | ~255 |
| type-annotation capture | parseType, consumeInlineObjectType | 2422-2626 | ~173 |
| expression sublanguage (precedence tiers) | tiers, nonAssociativeTiers, parseExpression, parseExpressionAtBlockSite, looksLikeBlockAtBlockSite, parseBlockExprNode, parseSingleExpression(WithResidue), isTernaryHead, parseTernary, parseBinary, incrementDecrementOp, parseUnary, parsePostfix, parseBracketedExpression, parsePrimary, parseObjectLiteral | 371-384, 2624-3246 | ~516 |
| match & pattern recognition | parseMatch, tryConsumeArmBodyStatement, tryConsumeRestPattern, consumeTrailingAssignment, objectPatternCursor, parsePattern, patternHeadTypeNames(+Memo) | 3253-3701 | ~381 |
| par-for / invoke / array / template / query recognition | parseParFor, parseInvoke, exprListCursor, parseArgs, parseArray, parseBareTemplate, parseQuery | 3715-4062 | ~331 |

Importer counts (map): the file has 16 imports and BodyParser is unexported (0/0 importers of any declaration in this file per the map — it is instantiated via the theta-document seam).

## Why this is a problem
Strong-band presumption of breakdown; reasons considered and defeated:
- Prior split reverted: the opposite holds — the file was created BY a split (702a1f2e, PTQ-1156) and further reduced by a ratified split (cfd246b6, PTQ-1280 Seam A); nothing was reverted.
- Single algorithm with shared local state: the instance already IS the shared state object (pos, suppressBrace, bindings, diagnostics); the token tables read nothing, and PTQ-1280's Seam A proved a group could leave over a narrow (diagnostics, file) interface.
- One grammar production family: holds per method (each justify-band function is recorded keep-whole under it in this wave's notes) but not for the file — the eight rows span disjoint grammar chapters (grammar.md let/fn/schema/import/type/expression chapters, expressions.md match patterns, query-forms.md QRY-3/6).
- Closed-enumeration dispatch: parseForm dispatches over statement keywords but its arms are 60-170-LOC recognizers; the file's length is not the enumeration's.
- Data-only: tables ≈ 115 LOC ≈ 2.8% of 4076, far under the 80% bar.
- Generated code: hand-authored (bug-numbered prose comments throughout).
Strong reasons absent: no spec clause names one critical section spanning these productions; no measured cost; quality/exemptions.json has no key for this path (checked this wave: only binder-system-prompt#normaliseParamLineBreaks and package-discovery D9 keys).

## Suggested direction (non-binding, optional)
Hypotheses, unproven — PTQ-1280's unratified Seams B and C remain the obvious candidates. Seam B: the schema & enum declaration group (~461 LOC, 1450-2108) -> src/parser/schema-body-parser.ts over a narrow parser-core interface (cursor methods + parseType) — 0 exported symbols moved, 0 external importers, cross-references back into the host limited to the cursor and diagnostics. Seam C: the expression-tier machinery (~516 LOC, 371-384 + 2624-3246) -> an expression sub-parser module, same interface shape. Seam D: import/export recognition (~255 LOC, 2110-2366) -> beside its check helpers in ./imports (which the group already imports five functions from). The human ratifies one.

## False-positive check
Band: 4076 LOC ≥ 2000 (strong), from the wave map — not recounted by hand; file navigated by map ranges only (never read end to end). Reasons-considered list above with defeating evidence per reason. Exemptions check: quality/exemptions.json read this wave — no D9 key for src/parser/body-parser.ts. Generated-code check: hand-authored header and bug citations. Spec-mirror check: the rows mirror many spec chapters, not one closed enumeration. Prior-filing/dedupe check: PTQ-1280 is in quality/resolved/ (status fixed); its ratified fix landed only Seam A (par-for-body-checks.ts import verified at line 27, call at 3780); residual-after-fix filings are the established pattern (PTQ-1278, PTQ-1284, PTQ-1438); no open PTQ or qw20260923145222 intake item is keyed d9_host: src/parser/body-parser.ts (grep run, zero hits).

## Triage
verdict: questionable — accounting verified: size-scan map re-run on a one-line manifest gives 4076 LOC / band strong (FILE_BANDS strong=2000) with every inventoried member at its cited range and all eight row LOC sums re-added exactly (115/91/849/461/255/173/516/381/331); the par-for-body-checks import is verbatim at line 27 and the sole emitParForBodyDiagnostics call at 3780-3785; git --follow shows 702a1f2e (PTQ-1156 move) → cfd246b6 (4346→4101, only Seam A moved to par-for-body-checks.ts) → 19516518 (→4076), so no reverted split; a `this.` field census per cited range shows the schema (1450-2108), import (2110-2366) and type (2422-2626) groups read only cursor methods + diagnostics/file (+parseType/bodyText), i.e. disjoint grammar-chapter member groups over the narrow cursor interface, not one concern split by adjectives; the shared-instance-state reason was already weighed and ratified away by the human on PTQ-1280 for this same class; quality/exemptions.json holds only the binder-system-prompt and package-discovery D9 keys; dedupe: PTQ-1280 is resolved/fixed and no quality/issues or other intake item carries d9_host src/parser/body-parser.ts (REVIEW_LOG:893 records this wave's justify-band members kept whole per one-production), so this is the established residual-after-fix pattern (PTQ-1278/1284/1438) — the remaining seam shape (B/C/D) is a design decision for a human ruling (triage: claude-fable-5-1)
