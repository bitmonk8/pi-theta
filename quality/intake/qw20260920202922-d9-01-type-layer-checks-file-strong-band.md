---
id: pending
title: type-layer-checks.ts bundles seven separable declaration families around the 2499-LOC TypeLayerWalk class at 4123 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:1-4123
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/type-layer-checks.ts
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# type-layer-checks.ts bundles seven separable declaration families around the 2499-LOC TypeLayerWalk class at 4123 LOC

## Observation
src/parser/type-layer-checks.ts is 4123 LOC (strong band, more than 2x the 2000 threshold). Its header states its role: "type-layer diagnostics production wiring" — walk the parsed body, ask the V20b static-type substrate for each expression's static type, and feed the existing checkers. Around the central `TypeLayerWalk` class (1542-4040, 2499 LOC) the file holds six further module-level declaration families: operand/receiver classifiers, declaration/type-env collectors, a local-binder-name AST walk, an alias-cycle analysis, an annotation-text-to-CompatType mini-parser, and generic AST child-enumeration utilities.

## Evidence
Distinct-concern inventory (lines and LOC from the wave structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| operand/receiver classification + stdlib signature lookup | PRIMITIVE_NAMES, ORDERING_OPS, ARITHMETIC_OPS, classifyOperand, classifyReceiver, builtinMembers, stdlibSignatureFor | 115-288 | ~101 |
| type-env / declaration collection | containsNamedType, inferCalleeReturnPayload, collectTypeEnv, collectEnumNames, collectFnReturnAnnotations, collectTopLevelFns, collectImportedSymbols, collectSchemaFields | 395-697, 978-992 | ~114 |
| local-binder-name collection walk | placeholderSiteRange, containsWithheldBinderType, collectLocalBinderNames, walkBlockForLocalBinders, walkStmtForLocalBinders, walkExprForLocalBinders | 604-622, 721-871 | ~166 |
| alias-cycle analysis | aliasCycleParticipants, aliasReferences | 893-959 | 65 |
| annotation-source parsing / CompatType conversion | annotationToCompatType, letAnnotationToCompatType, convertAnnotation, inlineObjectAnnotationToCompatType, stripOneTrailingComma, recognisedFieldType, splitTopLevelObjectFields, topLevelColonIndex, braceGroupCarriesUnmatchedCloseToken, annotationSourceIsNotTypeExpression, paramsFieldBindings, splitTopLevelUnion, isResultAnnotation, isResultGenericTypeName, patternLiteralType | 1040-1535 | ~234 |
| the TypeLayerWalk diagnostics walk | class TypeLayerWalk (46 members) | 1542-4040 | 2499 |
| AST child-enumeration utilities | childExprs, stmtExprs, stmtBlocks | 4043-4123 | 77 |

The annotation-parsing family is a self-contained text recogniser (its own splitters `splitTopLevelObjectFields` 1219-1236, `topLevelColonIndex` 1239-1252, `splitTopLevelUnion` 1471-1488) whose four exported entry points already have external importers per the map: annotationToCompatType 4 src/4 tests, letAnnotationToCompatType 2/3, annotationSourceIsNotTypeExpression 3/5, splitTopLevelUnion 1/2. The local-binder walk's one export `collectLocalBinderNames` has 1 src/2 tests importers. Neither family reads TypeLayerWalk state.

## Why this is a problem
Strong band: presumption of breakdown absent a strong concrete reason. Reasons considered and defeated: data-only module — no, the 2499-LOC class dominates and the literal tables are ~10 LOC total; closed-enumeration dispatch — a function-level reason, not applicable to a seven-family file; single algorithm with shared local state — no, the annotation parser, binder-name walk, and alias-cycle analysis are module-level functions taking their own inputs and sharing no state with the walk class; generated code — no, hand-written with per-bug rationale comments; spec-mirror — the header cites five separate spec areas (expressions.md, control-flow.md, functions.md, type-system.md, runtime-value-model.md), not one enumeration; quality/exemptions.json — no entry for this host.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: annotation-source parsing family (1040-1535, ~234 LOC) -> parser/annotation-compat.ts (hypothesis) — exported symbols moved: annotationToCompatType, letAnnotationToCompatType, annotationSourceIsNotTypeExpression, splitTopLevelUnion (importers 4/4, 2/3, 3/5, 1/2); cross-references back into host: TypeLayerWalk call sites only. Seam B: local-binder-name walk (721-871) -> parser/local-binders.ts (hypothesis) — exported symbol moved: collectLocalBinderNames (1/2); cross-reference: collectPatternBinderNames already imported from ./match-result. Seam C: TypeLayerWalk class (1542-4040) -> parser/type-layer-walk.ts (hypothesis) — no exported symbols move (class is module-private); the entry pair buildTypeLayerWalk/checkTypeLayer stays and imports it.

## False-positive check
Band check: 4123 LOC ≥ 2000 (strong) per the authoritative map. Reasons-considered list: each of the five concrete/strong reason classes checked and defeated above. Exemptions check: quality/exemptions.json read — no D9 key for this file or any of its functions. Generated-code check: header names hand-authored wiring with bug/spec citations, no generator. Spec-mirror check: the header's diagnostic roster spans multiple spec areas; no single spec-named closed set covers the file. Duplicate check: no prior PTQ or intake filing targets this host (grep of quality/intake and PTQ titles for "type-layer-checks" found only D2/D4 findings against specific clones, not a D9 breakdown).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 4123 LOC / band strong; all seven inventory rows are module-level function families taking their own inputs (string/CompatType/Stmt[]/Expr) with no reference to TypeLayerWalk state (only the buildTypeLayerWalk/checkTypeLayer entry pair constructs it); no quality/exemptions.json entry, no prior split/reversion in git history, no overlooked concrete/strong reason; same-wave D9 siblings target individual methods (walkStmt/provableArgType/walkExpr), not the file — distinct root cause; target seam shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified at HEAD: `size-scan map` reproduces 4123 LOC / band strong (FILE_BANDS strong=2000) and every inventory row's members at the cited lines with own-input signatures (string/CompatType/TypeEnv/Stmt[]/ThetaBody/Expr); no module-level `let`/`var` (header: "holds no module-level mutable state"), `TypeLayerWalk` touched outside the class only by buildTypeLayerWalk/checkTypeLayer :343-387, class 1542-4040 = 2499 LOC; no `type-layer-checks` key in quality/exemptions.json; 53 commits in `git log --follow` with no split/revert/extract; no spec-cited colocation invariant; dedupe clean (same-wave d9-02/03/04 key method hosts `#TypeLayerWalk.walkStmt/.provableArgType/.walkExpr`, PTQ-0370 names this file only as an importer) — D9 breakdown seam shape is a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified at HEAD with drift: post-filing D4 dedupe commits 71af3b5b/bb21dacc (qw20260920223212) pulled containsNamedType/containsWithheldBinderType → compat-type-traversal, collectTopLevelFns → functions, annotationSourceIsNotTypeExpression/braceGroupCarriesUnmatchedCloseToken → annotation-validation (one-symbol re-export at :94, not a facade), so `size-scan map` now gives 3850 LOC (was 4123) — still band strong (≥ 2000), no exemptions.json key; the seven inventory rows survive at shifted lines (classifiers 117-281, collectors 404-609/890-904, binder walk 551-553/633-783, alias-cycle 805-871, annotation parser 952-1278, class TypeLayerWalk 1285-3767 = 2483 LOC, child-enumeration 3770-3850), every row's members are module-level functions with own-input signatures (CompatType/TypeEnv/Stmt[]/Block/Expr/string), no module-level let/var, TypeLayerWalk constructed only by buildTypeLayerWalk/checkTypeLayer :336-380, the only cross-row link is the read-only PRIMITIVE_NAMES set (row 1 → row 5 at :1011/:1121); those dedupes were helper extractions, not a reverted file split, and no other concrete/strong reason applies; dedupe clean (PTQ-1115/1128/1131/1132 were D4 clones now fixed; d9-02/03/04 key methods) — seam shape needs a human ruling (triage: claude-fable-5-1)
