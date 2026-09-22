---
id: PTQ-1264
title: src/parser/theta-document.ts still bundles thirteen separable concerns at 3862 LOC after the PTQ-1156 seam A/B/C extractions
lens: D9
status: open
verdict: confirmed
locations:
  - src/parser/theta-document.ts:1-3862
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/theta-document.ts
d9_band: strong
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# src/parser/theta-document.ts still bundles thirteen separable concerns at 3862 LOC after the PTQ-1156 seam A/B/C extractions

## Observation
src/parser/theta-document.ts is 3862 LOC (strong band, threshold 2000). PTQ-1156 (fixed) extracted the AST type family (theta-ast.ts), the BodyParser class (body-parser.ts), and the structural-check block (structural-checks.ts); its header (lines 1-11) now states the residual role: "This module orchestrates the parser seam, delegates body parsing and structural checks to sibling modules, and re-exports their seams and the theta-ast contract". The residual still holds four independent whole-document check walks, doc-comment recovery, the query-annotation checker, and diagnostic-builder clusters beside the orchestration it names.

## Evidence
Distinct-concern inventory (line ranges and LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| parse pipeline orchestration | callWithClauseValues, parseThetaDocument, runWholeDocumentChecks, attachSubagentSessionConfigs, resolveSubagentSessionConfigAt, toolLoopValue..toolNameList | 151-683 | ~530 |
| .thetalib top-level rules | thetalibFormOf, checkThetaLibTopLevel, checkThetaLibCallWithClauses, collectClauseBearingCalls | 692-819 | ~128 |
| exported call-site node walker | CallSiteNode, CallSiteWalkOptions, walkCallSiteNodes + InBlock/InStmt/InExpr | 831-980 | ~150 |
| statement-placement walk | checkStatementPlacement + 3 walkers | 1020-1218 | ~199 |
| snippet lex/parse helpers | lexSnippetSource, parseExpressionSource, parseInterpolationSource, encodeSource | 1234-1290, 1381-1383 | ~65 |
| body-type collection | collectBodyTypes | 1298-1374 | 77 |
| frontmatter split + doc-comment recovery | splitFrontmatter, classifyDocAnchor, templateProseLineSpans, scanDocComments, DocDescriptionAttachment, attachDocDescriptions, mergeByLine | 1394-1778 | ~385 |
| identifier-resolution walk | collectIdentRoots, IdentWalkContext, IdentSite, checkUnknownIdentifiers, emitUnknownIdentifier, emitReassignTargetUnknown, walkIdentBlock/Stmt/Expr | 1887-2314 | ~430 |
| diagnostic builders + misc helpers | toolCallableName, piToolCallableName, toolArgShapeDiagnostic, bareObjectLiteralDiagnostic, blockExprMissingTailDiagnostic, capitalisedPatternHeadDiagnostic, schemaTypeNotExpressionDiagnostic, classifyEnumValueToken, positionToOffset, nullExpr | 1787-1865, 2348-2475 | ~200 |
| query-annotation check | RESULT_APPLICATION, queryResponseAnnotation, queryErrorModelAnnotation, queryAnnotationTypeNotExpressionDiagnostic, checkQueryAnnotation | 2500-2786 | ~285 |
| lexical call-site walk | LocalBinder, binderPhrase, shadowedCallableCallDiagnostic, checkCallSiteCall, buildRuntimeToolSuccessTypes, CallSiteWalkContext, checkLexicalCallSites, walkCallSiteBlock/Stmt/Expr | 2800-3354 | ~550 |
| query-interpolation check | checkQueryTemplateInterpolations, firstForbiddenInterpolationToken, firstForbiddenInterpolationForm, expressionChildExprs | 3386-3514 | ~130 |
| typed-query detection walks | detectTypedQueryExpression + 3 walkers, collectSessionTypedQueries + 3 walkers | 3537-3862 | ~326 |

Each check walk carries its own context (IdentWalkContext 1941-1968, CallSiteWalkContext 2975-3012, CallSiteWalkOptions 839-847) and is invoked only from parseThetaDocument/runWholeDocumentChecks' call sequence. Importer counts (map): parseThetaDocument 2/75, walkCallSiteNodes 3/2, parseExpressionSource 3/10, collectBodyTypes 2/2, detectTypedQueryExpression 1/2, collectSessionTypedQueries 1/2 — every walk is separately consumed or file-private.

## Why this is a problem
Strong band: presumption of breakdown; a strong concrete reason is required. Reasons considered and defeated: (1) data-only — type declarations are ~50 of 3862 LOC (~1%), under the 80% bar; (2) single algorithm with shared local state — the thirteen concerns communicate only through parseThetaDocument's/runWholeDocumentChecks' argument lists, each walk owning its own context type, no module-level mutable state; (3) closed-enumeration dispatch — function-level, inapplicable to the file; (4) generated code — hand-authored (bug-citation comments throughout); (5) strong reasons — no D9 key for this path in quality/exemptions.json, no measured cost cited in-file, PTQ-1156's split was ratified and landed (not reverted). PTQ-1156 is status: fixed and its fix review already flagged the residual as strong band; no open filing covers the post-fix file.

## Suggested direction (non-binding, optional)
All hypotheses unproven; the human ratifies one. Seam A: identifier-resolution walk (1887-2314) -> src/parser/ident-resolution.ts (hypothesis) — ~430 LOC, 0 exported symbols moved (all file-private), cross-reference back: one call site in runWholeDocumentChecks. Seam B: lexical call-site walk (2800-3354) -> src/parser/lexical-call-sites.ts (hypothesis) — ~550 LOC, 0 exported symbols moved, cross-references back: runWholeDocumentChecks call plus toolCallableName/piToolCallableName helpers. Seam C: doc-comment recovery (1394-1778) -> src/parser/doc-comment-recovery.ts (hypothesis) — ~385 LOC, 0 exported symbols moved, cross-reference back: four calls from parseThetaDocument.

## False-positive check
Band check: 3862 >= 2000, strong (map authoritative). Reasons-considered list above with defeating counts. Exemptions check: quality/exemptions.json read — no D9 key for src/parser/theta-document.ts. Generated-code check: hand-authored header and bug-fix rationale, no generator cited. Spec-mirror check: grammar productions are mirrored by BodyParser methods now in body-parser.ts, not by this file. Prior-filing check: PTQ-1156 is status: fixed in quality/resolved/ (its inventory predates the seam A/B/C moves; this is a fresh post-fix inventory), PTQ-1166 fixed parseThetaDocument itself; no open theta-document file finding in quality/issues/ or quality/intake/ (grep run). Not a husk: payload dominates the re-export scaffold (~30 LOC of re-exports at 124-142 vs ~3700 payload).

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives 3862 LOC / band strong (strong=2000) and every inventory row resolves to the map's declaration ranges (orchestration 151-683, thetalib rules 692-819, walkCallSiteNodes 831-980, statement-placement 1020-1218, snippet helpers 1234-1290/1381-1383, collectBodyTypes 1298-1374, frontmatter/doc-comment 1394-1778, ident walk 1887-2314, query-annotation 2500-2786, lexical call-site walk 2800-3354, query-interpolation 3386-3514, typed-query walks 3537-3862); no module-level `let`/`var` (sole top-level const is the RESULT_APPLICATION regex), each walk owns its context type (CallSiteWalkOptions 839, IdentWalkContext 1941, CallSiteWalkContext 2975) and is wired through parseThetaDocument/runWholeDocumentChecks argument lists, so no ≥ 6-shared-locals single algorithm; quality/exemptions.json has no theta-document key; header hand-authored with no measured-cost or spec-cited keep-whole invariant; re-export scaffold ~20 LOC at 124-142 vs ~3700 payload (not a husk); PTQ-1156 is status: fixed with a pre-extraction inventory, sibling intake d9-02 is function-level (#runWholeDocumentChecks) and d9-03 is a misplacement filing on the query-check pair — distinct root causes; two non-refuting inaccuracies noted: the 'diagnostic builders + misc helpers' row is a cross-cutting helper cluster rather than one concern (PTQ-1156 triage said the same) and checkQueryAnnotation/checkQueryTemplateInterpolations are exported and called from structural-checks.ts/type-layer-walk.ts, not only from runWholeDocumentChecks — ≥ 11 distinct concerns remain; seam shape (A/B/C) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map (one-line manifest) gives 3862 LOC / band strong (strong=2000), every inventory row's members resolve at the map's declaration ranges (151-683, 692-819, 831-980, 1020-1218, 1234-1290/1381-1383, 1298-1374, 1394-1778, 1887-2314, 1787-1865/2348-2475, 2500-2786, 2800-3354, 3386-3514, 3537-3862) and the walks carry separate context types (CallSiteWalkOptions 839, IdentWalkContext 1941, CallSiteWalkContext 2975) with the sole top-level const being the RESULT_APPLICATION regex at 2515, so no ≥ 6-shared-locals single algorithm; quality/exemptions.json D9 keys are only binder-system-prompt.ts#normaliseParamLineBreaks and package-discovery.ts; header (1-11) hand-authored with no measured-cost/spec-cited keep-whole reason; re-export scaffold 124-142 vs ~3700 payload (not a husk/barrel); PTQ-1156 is status: fixed in quality/resolved with a pre-extraction 10k-LOC inventory and no open quality/issues or intake filing keys this host post-fix — not a duplicate; two non-refuting inaccuracies: the 'diagnostic builders + misc helpers' row is a cross-cutting helper cluster exported at 129-141 to sibling modules rather than one concern, and checkQueryAnnotation/checkQueryTemplateInterpolations are exported (135-136) and called from structural-checks.ts:1557-1558, not only from runWholeDocumentChecks — ≥ 11 distinct concerns still stand; seam shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified a third time against current code: size-scan map (one-line manifest) reports 3862 LOC / band strong (strong=2000) for src/parser/theta-document.ts and its declaration table matches every inventory row's line ranges (151-683, 692-819, 831-980, 1020-1218, 1234-1290/1381-1383, 1298-1374, 1394-1778, 1787-1865/2348-2475, 1887-2314, 2500-2786, 2800-3354, 3386-3514, 3537-3862); sole top-level const is RESULT_APPLICATION at 2515 and each walk owns its own context type (CallSiteWalkOptions 839-847, IdentWalkContext 1941-1968, CallSiteWalkContext 2975-3012), wired only through parseThetaDocument/runWholeDocumentChecks parameters, so no ≥ 6-shared-locals single algorithm, no ≥ 80 % type LOC, no generated marker; quality/exemptions.json has no theta-document key; header 1-11 hand-authored with no measured-cost/spec-cited keep-whole reason; re-exports 124-142 vs ~3700 payload (not a barrel); PTQ-1156 is status: fixed (pre-extraction inventory) and no open quality/issues file carries d9_host src/parser/theta-document.ts — sibling intakes d9-02 (#runWholeDocumentChecks, function-level) and d9-03 (query-check pair misplacement) are distinct root causes, not duplicates; same two non-refuting inaccuracies as prior notes (diagnostic-builder row is a cross-cutting exported helper cluster; checkQueryAnnotation/checkQueryTemplateInterpolations are also called from structural-checks.ts:1557-1558), leaving ≥ 11 distinct concerns; seam A/B/C shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
