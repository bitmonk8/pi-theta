---
id: pending
title: src/parser/body-parser.ts bundles nine method groups — statement, schema/enum, import, type, expression, pattern, par-for-scan, invoke/query recognition plus cursor infrastructure — in one 4346-LOC file
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/body-parser.ts:1-4346
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/body-parser.ts
d9_band: strong
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# src/parser/body-parser.ts bundles nine method groups — statement, schema/enum, import, type, expression, pattern, par-for-scan, invoke/query recognition plus cursor infrastructure — in one 4346-LOC file

## Observation
src/parser/body-parser.ts is 4346 LOC (strong band, FILE_BANDS strong=2000). Its header says "Recursive-descent body parsing and token lookahead for the theta document seam." One unexported class, `BodyParser` (354-4338, 3985 LOC, 84 members per the structural map), carries essentially all of it; the rest is module-level token tables and predicates (61-347) plus `spanRange` (4341-4343). The file was created whole at commit 702a1f2e (the ratified PTQ-1156 Seam B fix, which moved BodyParser verbatim out of theta-document.ts); no further breakdown of the class has occurred and quality/exemptions.json has no D9 key for this path.

## Evidence
Distinct-concern inventory (member groups from the structural map; LOC are the map's per-member values, summed):

| concern | members | line ranges | LOC |
|---|---|---|---|
| token tables & lookahead predicates | COMPOUND_OPS, WITH_CLAUSE_KEYS, EXPRESSION_KEYWORDS, EXPRESSION_LEAD_PUNCT, STATEMENT_ONLY_KEYWORDS, ALIAS_ARM_STOP_KEYWORDS/PUNCT, isAliasResidueHead, canStartExpression, typeSourceEndsAtom, promoteTrailingExprToTail, Form, spanRange | 61-347, 4341-4343 | ~115 |
| cursor infrastructure | pos, suppressBrace, peek, eofToken, advance, atEnd, isPunct, isKeyword, unmatchedCloseParens, unmatchedCloseBraces, prevRange, constructor | 355-491, 4334-4337 | ~89 |
| statement/form recognition | parseBody, parseBlock, parseForms, parseForm, wrap, exprToStmt, simpleKeyword, parseLet, tryParseReassign, buildReassign, withImmutableBindings, parseHeaderExpression, parseIf, parseWhile, parseFor, parseFn, parseFnParamList, parseWithClause, parseCallWithClause, parseReturn | 495-1411 | ~851 |
| schema & enum declaration recognition | parseSchema, finishObjectSchema, finishAliasSchema, emitMalformedAliasRhs, parseByField, emitEmptySchemaBody, parseSchemaObjectBody, skipBraceRemainder, recoverMalformedSchemaField, parseEnum, parseEnumVariants, skipDeclarationShape, skipBraces | 1450-2110 | ~463 |
| import/export recognition | parseImportExport, parseImportSpecifierList | 2112-2368 | ~255 |
| type-annotation capture | parseType, consumeInlineObjectType | 2424-2628 | ~173 |
| expression sublanguage (precedence tiers) | tiers, nonAssociativeTiers, parseExpression, parseExpressionAtBlockSite, looksLikeBlockAtBlockSite, parseBlockExprNode, parseSingleExpression(WithResidue), isTernaryHead, parseTernary, parseBinary, incrementDecrementOp, parseUnary, parsePostfix, parseBracketedExpression, parsePrimary, parseObjectLiteral | 369-382, 2626-3248 | ~516 |
| match & pattern recognition | parseMatch, tryConsumeArmBodyStatement, tryConsumeRestPattern, consumeTrailingAssignment, objectPatternCursor, parsePattern, patternHeadTypeNames(+Memo) | 3255-3703 | ~381 |
| par-for recognition & CTRL-4 restriction scan | parseParFor, emitParForBodyDiagnostics, scanParForBlock, scanParForStmt, scanParForExpr | 3717-4041 | ~311 |
| invoke / array / template / query recognition | parseInvoke, parseArgs, parseArray, parseBareTemplate, parseQuery | 4043-4332 | ~276 |

The CTRL-4 scan group is not recognition at all: it is a post-parse restriction walk over already-built AST that touches only `this.diagnostics` and `this.file` of the host (verified 3803-4041; e.g. 3835-3841 signature threads its own `outerMutables/bodyLocals/loopDepth`), with no cursor reads:

```ts
  private scanParForStmt(
    s: Stmt,
    outerMutables: ReadonlySet<string>,
    bodyLocals: Set<string>,
    loopDepth: number,
  ): void {
    switch (s.kind) {
```

## Why this is a problem
Strong-band presumption of breakdown; reasons considered and defeated:
- Single algorithm with shared local state: the class shares six instance fields (pos, suppressBrace, bindings, diagnostics, file, bodyText) — but that state object already exists (the instance), and whole groups do not read the cursor at all (the CTRL-4 scan reads only diagnostics/file; the module-level tables read nothing). A seam does not have to invent a state object.
- One grammar production family: holds per method (recorded as keep-whole for the ten justify-band functions) but not for the file — the concerns span disjoint grammar chapters (grammar.md §`let` form, §`fn` declarations, §`schema X by <field>`, §Imports and re-exports, §Type grammar, §Expression sublanguage, §`match` arm body; query-forms.md QRY-3/6; control-flow CTRL-4).
- Closed-enumeration dispatch: parseForm dispatches over statement keywords, but its arms are 60-170-LOC recognizers, so the file's length is not the enumeration's.
- Data-only: tables ≈ 115 LOC ≈ 2.6% of 4346, far under the 80% bar.
- Generated code: hand-authored (bug-numbered prose comments throughout).
Strong reasons absent: no spec clause names one critical section spanning productions; no measured cost; no reverted split (git shows the file was CREATED by a split, 702a1f2e); no exemptions.json entry for this path.

## Suggested direction (non-binding, optional)
Hypotheses, unproven, ordered by confidence. Seam A: the CTRL-4 restriction scan (emitParForBodyDiagnostics, scanParForBlock, scanParForStmt, scanParForExpr, ~236 LOC, 3803-4041) -> new src/parser/par-for-body-checks.ts — 0 exported symbols moved today, 0 external importers, cross-references back into the host limited to a (diagnostics[], file) pair; the sibling check modules (bindings.ts, schema-declarations.ts, discriminated-union-checks.ts, expression-position-checks.ts) are the pattern. Seam B: the schema & enum declaration group (~463 LOC, 1450-2110) -> src/parser/schema-body-parser.ts over a narrow parser-core interface (cursor methods + parseType). Seam C: the expression-tier machinery (~516 LOC) -> a sub-parser module. The human ratifies one.

## False-positive check
Band: 4346 LOC ≥ 2000 (strong), from the wave map — not recounted by hand. Reasons-considered list above with defeating evidence per reason. Exemptions check: quality/exemptions.json has only D9:src/binder/binder-system-prompt.ts#normaliseParamLineBreaks and D9:src/discovery/package-discovery.ts — no key for this path. Generated-code check: hand-authored header and bug-citation comments. Spec-mirror check: the concerns mirror many spec chapters, not one closed enumeration. Prior-filing check: PTQ-1156 (resolved) was keyed on src/parser/theta-document.ts and its ratified fix created this file; PTQ-1172/PTQ-1182 (resolved) were function-level (parseFn/parseImportExport, both since reduced below 100 LOC); no open PTQ or intake item is keyed on src/parser/body-parser.ts.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 4346 LOC / band strong with the exact 84-member roster and per-row LOC sums (statement group 851, par-for group 311 re-added by hand); the scanParForStmt excerpt is verbatim at 3835-3841 and the CTRL-4 scan block 3803-4041 has 0 cursor/field reads other than this.diagnostics (5) and this.file (5) plus self-recursion, so the inventory rows are real distinct member groups, not one concern split by adjectives; quality/exemptions.json carries only the binder-system-prompt and package-discovery D9 keys; git --follow shows the file was created by 702a1f2e (the PTQ-1156 ratified move), so no reverted-split reason applies, and no concrete reason (closed-enum dispatch, ≥80% data, generated, one production) covers a 4346-LOC file spanning nine grammar chapters; no open PTQ or intake item is keyed on src/parser/body-parser.ts (PTQ-1156/1172/1182 resolved, keyed elsewhere or function-level) — the class-split shape (seam A/B/C) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run gives 4346 LOC / band strong (FILE_BANDS strong=2000), the inventory's member groups sit at the cited ranges (parseSchema 1450, parseImportExport 2112, parseType 2424, parseMatch 3255, parseParFor 3717, scanParFor* 3821-4041, parseInvoke 4043, parseQuery 4222-4332), the scanParForStmt excerpt is verbatim at 3835-3841 and the 3803-4041 CTRL-4 block reads only this.diagnostics (5) / this.file (5) plus self-recursion so it is a distinct concern not sharing cursor state; exemptions.json holds only the binder-system-prompt and package-discovery D9 keys, git --follow shows creation at 702a1f2e (PTQ-1156 move, no reverted split), no closed-enum/data/generated/one-production reason covers nine grammar chapters, and no PTQ or other intake item is keyed on this host — the seam shape needs a human ruling (triage: claude-fable-5-1)
