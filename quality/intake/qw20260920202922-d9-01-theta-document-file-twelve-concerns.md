---
id: pending
title: src/parser/theta-document.ts bundles twelve separable concerns in one 10750-LOC module
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:1-10750
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/theta-document.ts
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# src/parser/theta-document.ts bundles twelve separable concerns in one 10750-LOC module

## Observation
src/parser/theta-document.ts is 10750 LOC (strong band, threshold 2000). Its header (lines 1-21) states its role: "the whole-`.theta`/`.thetalib` program-parser seam ... `parseThetaDocument(source, deps)` parses the entire file into an executable body statement-list AST ... alongside the parsed frontmatter, and aggregates the whole-file multi-error diagnostic set." The file holds the entire AST node-type family, a 4019-LOC recursive-descent parser class, and eight independent whole-document check walks each with its own context type.

## Evidence
Distinct-concern inventory (line ranges and LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| AST node-type family (cross-leaf contract per header) | NodeBase..ParseThetaDocumentDeps — 57 exported type/interface decls incl. Expr, Stmt, ThetaBody, ThetaDocument | 143-1031 | ~889 |
| whole-document parse pipeline | parseThetaDocument, attachSubagentSessionConfigs, resolveSubagentSessionConfigAt, toolLoopValue..toolNameList | 1040-1628 | ~589 |
| .thetalib top-level rules | thetalibFormOf, checkThetaLibTopLevel, checkThetaLibCallWithClauses, collectClauseBearingCalls | 1637-1764 | ~128 |
| exported call-site node walker | CallSiteNode, CallSiteWalkOptions, walkCallSiteNodes + InBlock/InStmt/InExpr | 1776-1925 | ~150 |
| statement-placement check walk | checkStatementPlacement + 3 walkers | 1965-2163 | ~199 |
| source split + doc-comment recovery | decodeSource, encodeSource, splitFrontmatter, classifyDocAnchor, scanDocComments, attachDocDescriptions, mergeByLine | 2318-2637 | ~320 |
| recursive-descent body parser | token tables COMPOUND_OPS..Form, class BodyParser (83 members), spanRange | 2644-6960 | ~4326 |
| identifier-resolution walk | collectIdentRoots, collectPatternBindings, IdentWalkContext, checkUnknownIdentifiers, emitUnknownIdentifier, emitReassignTargetUnknown, walkIdentBlock/Stmt/Expr | 7092-7544 | ~453 |
| diagnostic builders | toolCallableName, piToolCallableName, toolArgShapeDiagnostic..blockExprMissingTailDiagnostic, unresolvedNamedTypeDiagnostic..queryErrorModelAnnotation, LocalBinder, binderPhrase, shadowedCallableCallDiagnostic | 6969-8080 (interleaved) | ~350 |
| lexical call-site checks | buildRuntimeToolSuccessTypes, CallSiteWalkContext, checkLexicalCallSites, walkCallSiteBlock/Stmt/Expr | 8090-8578 | ~489 |
| structural AST checks + schema graph | StructuralRefs..walkExpr: checkStructural, checkSchemaDeclarationGraph, walkStatement, walkExpr, checkObjectExpr, checkPatternObjectFields, checkParamsDefaultNames et al. | 8589-10442 | ~1854 |
| query-interpolation + typed-query detection | checkQueryTemplateInterpolations..typedQueryInExpr (detectTypedQueryExpression exported, 1/1 importers) | 10474-10750 | ~277 |

Importer counts (map): ThetaDocument 2/172, ThetaBody 15/44, Expr 9/52, Stmt 9/27, parseThetaDocument 2/74 — the type family is the file's widest export surface while BodyParser (4019 LOC) is not exported at all (0/0).

## Why this is a problem
Strong band: presumption of breakdown; a strong concrete reason is required to keep whole. Reasons considered and defeated: (1) data-only module — type declarations are ~889 of 10750 LOC (8%), far under the 80% bar; (2) single algorithm with shared local state — the twelve concerns each carry their own context type (WalkCtx, StructuralRefs, IdentWalkContext, CallSiteWalkContext, CallSiteWalkOptions) and communicate only through parseThetaDocument's call sequence, not shared locals; (3) closed-enumeration dispatch — a function-level reason, inapplicable to a 10750-LOC file; (4) generated code — hand-written (header cites bug-fix history throughout); (5) strong reasons — no entry in quality/exemptions.json for this path, no measured cost cited anywhere in the file, no reverted-split commit found. The header's own framing (the AST node types are "that cross-leaf contract" consumed by V19c/V19e) argues the type family is a contract module other layers import, separable from the parser that populates it.

## Suggested direction (non-binding, optional)
All hypotheses unproven; the human ratifies one. Seam A: AST node-type family (143-1031) -> src/parser/theta-ast.ts (hypothesis) — ~889 LOC, ~57 exported symbols moved, external importers per map up to 15/44 (ThetaBody) and 2/172 (ThetaDocument), re-exportable from the host; cross-references back into the host: none (types are leaf declarations). Seam B: class BodyParser + its token tables (2644-6960) -> src/parser/body-parser.ts (hypothesis) — ~4326 LOC, 0 exported symbols moved (BodyParser is file-private, 0/0 importers), cross-references back: parseThetaDocument constructs it; parseExpressionSource/parseInterpolationSource wrap it. Seam C: structural checks (8589-10442) -> src/parser/structural-checks.ts (hypothesis) — ~1854 LOC, 0 exported symbols moved, cross-reference back: one call from parseThetaDocument (checkStructural at 1298).

## False-positive check
Band check: 10750 LOC >= 2000, strong. Reasons-considered list recorded above with the counts that defeated each. Exemptions check: quality/exemptions.json read — no D9 key for src/parser/theta-document.ts. Generated-code check: header and inline comments are hand-authored bug-fix rationale; no generator cited. Spec-mirror check: grammar.md productions are mirrored by individual BodyParser methods, not by the file as a whole — a spec-mirror claim would attach to functions, not to the twelve-concern bundle. Not a husk (payload dominates) and no misplacement filed: the four cross-layer imports (../runtime/query-discard, ../runtime/tool-call, ../render/query-render, ../extension/system-note-channel) each carry an in-file sanctioned-pattern comment (lines 100-137) and are single-symbol pure-function reuses, not affinity majorities.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives 10750 LOC / band strong (FILE_BANDS strong=2000), all 12 inventory rows match the map's declaration line ranges (BodyParser 2937-6955, 4019 LOC, 83 members, unexported 0/0; types 143-1031 ≈ 889 LOC ≈ 8% < 80% data bar), no module-level mutable state and each check walk carries its own context type (IdentWalkContext 7171, CallSiteWalkContext 8115, StructuralRefs 8589, WalkCtx 8654) wired only through parseThetaDocument's call sequence, no D9 exemption for the path (`exemptions --lens D9`), hand-authored header, no prior split commit for the hypothesised targets; sibling intake d9-02..08 and PTQ-0135/0174 are function-level or D2 — distinct root causes; target shape (seams A/B/C) is a design decision needing a human ruling (triage: claude-fable-5-1)
