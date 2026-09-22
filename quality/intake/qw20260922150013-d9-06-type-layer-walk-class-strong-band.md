---
id: pending
title: type-layer-walk.ts is 2693 LOC around the single module-private 2605-LOC TypeLayerWalk class bundling eight method families
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-layer-walk.ts:1-2693
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/type-layer-walk.ts
d9_band: strong
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# type-layer-walk.ts is 2693 LOC around the single module-private 2605-LOC TypeLayerWalk class bundling eight method families

## Observation
src/parser/type-layer-walk.ts is 2693 LOC (strong band, ≥ 2000). Its header states the role: "Per-parse type-layer diagnostics walk. Unprovable reads defer to runtime; withholding can suppress a diagnostic, never manufacture one." The file holds one declaration: the module-private class `TypeLayerWalk` (87-2691, 2605 LOC per the map, 0 src/0 test importers — constructed only via `buildTypeLayerWalk`/`checkTypeLayer` in type-layer-checks.ts). The file was minted by the PTQ-1158 fix (commit bd8e73b7, Seam C: "move the class whole out of type-layer-checks.ts"); that finding's inventory counted the class as one 2499-LOC row and did not rule on its interior.

## Evidence
Distinct-concern inventory of the class's 58 members (lines and LOC from the wave structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| statement/block walking & binding recording | walkBlock, walkStmt, walkLetStmt, walkReassignStmt, walkOtherwise, bindLoopElement, recordWithheldBinders, matchArmScope | 161-713 | ~418 |
| fn-declaration walking & return-type resolution | walkFn, checkSubagentReturnAnnotation, collectReturnContributions, contributionOf, bodyHasQuestion, inferFinalValuePayload | 715-974 | ~222 |
| expression walking & literal checks | checkBoolean, checkArrayLiteral, markNestedArrayLiterals, sinkedArrayOf, checkObjectFields, declaredFieldsOf, checkPatternFieldTypes, checkObjectField, walkExpr, checkParFor | 977-1271, 1794-2008 | ~416 |
| call-site arity & argument compatibility | checkFnCallArgs, checkFnCallArity, checkFnCallArgLoop | 1294-1427 | ~130 |
| provability inference (bug-0050/0079 channels) | provableArgType, provableBinaryType, provableIdentType, provableMemberType, isProvenReduction | 1454-1792 | ~315 |
| interpolation/query-result checks | checkQuestion, questionOperandKind, checkQueryInterpolationResults, checkQueryInterpolationOperands, checkInterpolationOperands, interpolationIsResult, isCertainResultNode, isResultGenericType | 2067-2348 | ~173 |
| receiver/member/stdlib call checks | checkIndex, checkMethodCall, checkJoinElement, checkStdlibSignature, checkMemberAccess, pushUnknownMethod | 2351-2543 | ~172 |
| operand-category checks (plus/ordering/arithmetic/unary) | checkBinaryOperands, checkPlusOperands, pushMixedPlusIfNeeded, checkOrderingOperands, checkArithmeticOperands, checkUnaryArithmeticOperand | 2011-2064, 2551-2690 | ~156 |

Header excerpt (87-91):
```
/**
 * A per-parse walk feeding the wired `type`-phase checkers. Holds only per-parse
 * state (the injected pass, the type env, the file, the callee-resolution
 * tables, the accumulated diagnostics) — no module-level mutable state.
 */
```
Shared state is already an explicit injected context: seven constructor-injected readonly fields (pass, env, file, fnReturns, fnDecls, importedSymbols, shadowedNames, lines 141-149) plus three per-parse accumulators (diagnostics 88, resultBindings 102, unprovableBindings 133). The provability cluster reads resultBindings/unprovableBindings that the walking clusters write; the check clusters (rows 4, 6, 7, 8) read only typeOf/env/diagnostics.

## Why this is a problem
Strong band: presumption of breakdown absent a strong concrete reason. Concrete reasons considered and defeated: closed-enumeration dispatch — applies to individual methods (walkStmt's Stmt switch), not to an eight-family class; single algorithm with shared local state — the shared state is already one injected constructor context plus three named accumulators, so a split into collaborating units passes the existing context rather than inventing one; data-only — no, 2605 LOC of method bodies; one grammar production — no, the class spans statements, expressions, calls, interpolation and operators; generated — no, hand-written with per-bug rationale. Strong addenda checked and absent: no spec-cited single critical section (the header cites a per-node walk, not an ordered step sequence); no measured cost; no reverted split — git log --follow shows the file was CREATED by the PTQ-1158 split (bd8e73b7), never split further; no quality/exemptions.json key for this host. The PTQ-1142 human keep-whole ruling is distinguished: it forbids folding this walk with the binder-collection walk behind a shared traversal module, and says nothing about partitioning this class's own method families.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: operand-category checks (rows 8, ~156 LOC) plus receiver/member/stdlib checks (row 7, ~172 LOC) -> parser/type-layer-operand-checks.ts helpers taking (typeOf, env, diagnostics) (hypothesis) — 0 exported symbols move (all private), 0 external importers, cross-references back: typeOf/env/diagnostics only. Seam B: interpolation/query-result checks (row 6, ~173 LOC) -> parser/type-layer-interpolation.ts (hypothesis) — cross-references: typeOf, resultBindings reads via isCertainResultNode. Seam C: provability inference (row 5, ~315 LOC) -> parser/type-layer-provable.ts (hypothesis) — cross-references: resultBindings/unprovableBindings (read), typeOf; the walking rows stay as the host.

## False-positive check
Band check: 2693 LOC ≥ 2000 (strong) per the authoritative map; not re-counted by hand (grep -c confirms 2693 lines raw). Reasons-considered list: five concrete classes plus four strong addenda checked and defeated above. Exemptions check: quality/exemptions.json read — no key for src/parser/type-layer-walk.ts or any of its members. Generated-code check: hand-authored with bug/spec citations, no generator. Spec-mirror check: the header cites the withholding invariant, not a single spec enumeration; walkStmt's Stmt dispatch is method-scoped. Duplicate check: no intake or PTQ file targets this host at file level (PTQ-1158 targeted type-layer-checks.ts and is fixed; PTQ-1170/1178/1187/1211 target individual methods and are honoured as already-filed, not re-filed here; PTQ-1142's keep-whole ruling covers the cross-walk fold only). Read targeted ranges only (1-170, 170-267, 715-781, 1590-1651); never read the ≥2000-LOC file end to end.

## Triage
verdict: questionable — accounting verified: `size-scan map` reproduces 2693 LOC / band strong (FILE_BANDS strong=2000), class TypeLayerWalk 87-2691 = 2605 LOC with 0/0 importers and every inventory member at the cited map lines; header excerpt 87-91 and constructor 141-149 (7 injected readonly fields) + 3 accumulators (88/102/133) match; per-range `this.*` field counts confirm the rows are distinct concerns — rows 4/7/8 touch only typeOf/env/file/diagnostics (row 4 also reads the injected fnDecls/importedSymbols/shadowedNames tables), row 6 reads fnReturns + resultBindings once via isCertainResultNode, row 5 reads unprovableBindings, only row 1 writes both accumulators; no `type-layer-walk` key in quality/exemptions.json; `git log --follow` shows the file created by bd8e73b7 (PTQ-1158 Seam C) with two later dedupe touches and no split/revert; dedupe clean (PTQ-1158 fixed and its inventory counted the class as one row; PTQ-1170/1178/1187/1193/1211/1215 are method-level hosts; PTQ-1142 keep-whole rules on the cross-walk fold only; PTQ-1139/1232 name the file incidentally); two non-refuting inaccuracies: the class is exported (`export { TypeLayerWalk }` :2693, re-exported type-layer-checks.ts:87) not module-private, and rows 4/7 call provableArgType (cross-row method call beyond typeOf/env/diagnostics) — D9 breakdown seam shape (A/B/C) is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: `size-scan map` on the host gives 2695 LOC / band strong (FILE_BANDS strong=2000; +2 LOC drift since filing), class TypeLayerWalk 87-2693 = 2607 LOC, 0/0 importers, all 58 inventory members present at map lines within ±2 of the cited ranges; header excerpt 87-91 matches; per-range `this.*` field tallies confirm ≥ 2 distinct concerns (rows 4/7/8 touch only typeOf/env/file/diagnostics plus injected tables, row 5 reads unprovableBindings, row 6 reads fnReturns/resultBindings, only row 1 writes resultBindings/unprovableBindings); no `type-layer-walk` key in quality/exemptions.json; `git log --diff-filter=A` shows creation by bd8e73b7 (PTQ-1158 Seam C), later touches f50bb3c2/175f26df are +7/+32 line edits, no split or revert; dedupe clean (PTQ-1158 fixed, PTQ-1170/1178/1187/1193/1211/1215 are method-level hosts, PTQ-1142 keep-whole rules on the binder/type cross-walk fold only); two non-refuting inaccuracies stand: the class is exported (`export { TypeLayerWalk }` :2695, re-exported type-layer-checks.ts:87) not module-private, and rows 1/4/7 call provableArgType cross-row — D9 breakdown seam shape (A/B/C hypotheses) is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time from scratch: `size-scan map` gives 2695 LOC / band strong (FILE_BANDS strong=2000; +2 drift vs the filed 2693, `wc -l` agrees), single declaration class TypeLayerWalk 87-2693 = 2607 LOC with 0/0 importers, all 58 inventory members present at map lines within ±2 of the cited ranges, seven map-listed over-threshold members (walkLetStmt 204 strong, provableArgType 134 / walkExpr 157 justify) are the already-filed PTQ-1170/1178/1187/1193/1211/1215 method hosts; header 87-91 and constructor 141-149 (7 injected readonly fields) + accumulators diagnostics :88 / resultBindings :102 / unprovableBindings :133 match; per-row `this.*` tallies (sed range + grep) confirm ≥ 2 distinct concerns — rows 4/7/8 read only typeOf/env/file/diagnostics (+ injected fnDecls/importedSymbols/shadowedNames in row 4), row 5 reads unprovableBindings + pass, row 6 reads fnReturns + resultBindings, only row 1 writes resultBindings/unprovableBindings; no `type-layer-walk` key in quality/exemptions.json (grep rc=1); `git log --follow` shows the file created by bd8e73b7 (PTQ-1158 Seam C) with only dedupe touches after (105c0ad9, 175f26df, f50bb3c2) — no split, no revert; no spec-cited single critical section or measured cost; dedupe clean (PTQ-1158 resolved/fixed and its inventory counted the class as one row; TRIAGE_LOG:274 PTQ-1142 human-keep-whole rules on folding local-binders.ts with this walk, not on partitioning the class; qw20260922150013-d9-01 and qw20260922164435-d8-01 name the file incidentally); two non-refuting inaccuracies reconfirmed: the class IS exported (`export { TypeLayerWalk }` :2695, re-exported type-layer-checks.ts:87) though size-scan reports exported=no, and rows 1/4/7 call provableArgType across rows — the seam shape (A/B/C) is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
