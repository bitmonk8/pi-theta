---
id: pending
title: theta-document.ts remains 2045 LOC (strong band) after the PTQ-1264 splits, bundling eleven distinct concern families
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:1-2045
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/theta-document.ts
d9_band: strong
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# theta-document.ts remains 2045 LOC (strong band) after the PTQ-1264 splits, bundling eleven distinct concern families

## Observation
src/parser/theta-document.ts is 2045 LOC, band strong per the authoritative
map (FILE_BANDS strong = 2000). Its header names it "the whole-`.theta`/
`.thetalib` program-parser seam" that "delegates body parsing, structural
checks, doc-comment recovery, identifier resolution and the lexical call-site
walk to sibling modules". PTQ-1156 and PTQ-1264 (both resolved) drove the file
from ~10,481 to 2045 LOC via ratified extractions (theta-ast.ts,
body-parser.ts, structural-checks.ts, doc-comment-recovery.ts,
ident-resolution.ts, lexical-call-sites.ts — all imported at lines 96-110).
The residual still sits above the strong threshold and holds eleven concern
families beyond the orchestration the header claims.

## Evidence
Distinct-concern inventory (members and ranges from the authoritative map,
each range re-read this session):

| concern | members | line ranges | LOC |
|---|---|---|---|
| document parse orchestration | callWithClauseValues, parseThetaDocument, runWholeDocumentChecks, identifierRootSeeds | 141-474 | ~303 |
| subagent session-config resolution (RFC 0001 FN-7/FN-9) | attachSubagentSessionConfigs, resolveSubagentSessionConfigAt, toolLoopValue, respondRepairValue, objectFieldNumber, stringExprValue, toolNameList | 482-622 | ~106 |
| `.thetalib` file rules | thetalibFormOf, checkThetaLibTopLevel, checkThetaLibCallWithClauses, collectClauseBearingCalls | 631-758 | ~85 |
| call-site node walk utility | CallSiteNode, CallSiteWalkOptions, walkCallSiteNodes, walkCallSiteNodesInBlock/InStmt/InExpr | 770-919 | ~119 |
| statement-placement check (bugs 0446/0447) | checkStatementPlacement, walkBlock/walkStatement/walkExprForStatementPlacement | 959-1157 | ~196 |
| snippet lex/parse helpers | lexSnippetSource, parseExpressionSource, parseInterpolationSource, encodeSource | 1173-1230, 1320-1322 | ~32 |
| body named-type collection | collectBodyTypes, classifyEnumValueToken, positionToOffset, nullExpr | 1237-1370 | ~108 |
| diagnostic/name builders | toolCallableName, piToolCallableName, toolArgShapeDiagnostic, bareObjectLiteralDiagnostic, blockExprMissingTailDiagnostic, capitalisedPatternHeadDiagnostic, schemaTypeNotExpressionDiagnostic | 1400-1572 | ~78 |
| query-template interpolation checks | checkQueryTemplateInterpolations, firstForbiddenInterpolationToken, firstForbiddenInterpolationForm | 1606-1697 | ~77 |
| typed-query detection walk | detectTypedQueryExpression, typedQueryInBlock/InStmt/InExpr | 1720-1838 | ~116 |
| session typed-query collection walk | collectSessionTypedQueries, collectSessionTypedQueriesInBlock/InStmt/InExpr | 1869-2045 | ~172 |

Representative excerpt — the statement-placement family is a self-contained
recursive walk (src/parser/theta-document.ts:961-968):

```ts
function checkStatementPlacement(block: Block, file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const isThetaLib = file.endsWith(".thetalib");
  walkBlockForStatementPlacement(block, true, file, isThetaLib, diagnostics);
  return diagnostics;
}
```

The typed-query walks (1720-2045, ~290 LOC combined) share no locals with any
other family; their exported entries `detectTypedQueryExpression` (map
importers 1/2) and `collectSessionTypedQueries` (1/2) are consumed outside
this file. `checkStatementPlacement`, the thetalib rules, and the session-
config readers are file-private, each called from exactly one site in
runWholeDocumentChecks / parseThetaDocument.

## Why this is a problem
Strong band: presumption of breakdown; a strong concrete reason is required.
Reasons considered and defeated: (1) data-only — the only type declarations
are CallSiteNode/CallSiteWalkOptions (~10 LOC) plus the theta-ast re-export
scaffold (lines 112-141, ~30 LOC), far under 80%; (2) single algorithm with
shared local state — the eleven families communicate only through
parseThetaDocument's / runWholeDocumentChecks' argument lists; the file holds
no module-level mutable state (sole module consts are import bindings); (3)
closed-enumeration dispatch — function-level, inapplicable to a file; (4)
generated code — hand-authored (bug 0410/0411/0446/0447 rationale inline);
strong classes: no D9 key for this path in quality/exemptions.json, no
measured cost cited in-file, and the prior splits (PTQ-1156, PTQ-1264 seams
A/B/C) landed and were not reverted — the ratified direction was continued
breakdown, and the file is still over the strong threshold.

## Suggested direction (non-binding, optional)
All hypotheses unproven; the human ratifies one. Seam A: statement-placement
walk (959-1157) -> src/parser/statement-placement.ts (hypothesis) — ~196 LOC,
0 exported symbols moved (checkStatementPlacement is file-private), one call
back from runWholeDocumentChecks. Seam B: typed-query walks (1720-2045) ->
src/parser/typed-query-detection.ts (hypothesis) — ~290 LOC, exported symbols
moved: detectTypedQueryExpression (1/2), collectSessionTypedQueries (1/2),
CallSiteNode type; cross-references back: parseExpressionSource for
interpolation re-parse. Seam C: subagent session-config resolution (482-652)
-> src/parser/subagent-session-config.ts (hypothesis) — ~140 LOC, exported
symbol moved: resolveSubagentSessionConfigAt (1/3), 0 cross-references back.
Any one seam drops the file under 2000.

## False-positive check
Band check: 2045 >= 2000 per the authoritative map. Reasons-considered list
above with defeating counts. Exemptions check: quality/exemptions.json read —
no D9 key for src/parser/theta-document.ts. Generated-code check: hand-written
header with spec/bug citations, no generator marker. Spec-mirror check: the
header cites twelve spec documents, not one closed enumeration. Prior-filing
check: PTQ-1156 and PTQ-1264 are both in quality/resolved/ (their inventories
predate the ident-resolution/lexical-call-sites/doc-comment-recovery
extractions; this is a fresh post-fix inventory at 2045 LOC, a 47% shrink
since PTQ-1264's 3862); no open quality/issues or intake file keys this host
(grep of quality/intake for this wave shows no theta-document filing). Not a
husk: ~30 LOC of re-exports (112-141) vs ~1900 payload. Function-level hosts
parseThetaDocument (164) and runWholeDocumentChecks (110) are dispositioned
keep-whole separately in this shard's notes, distinct exemption keys.

## Triage
verdict: questionable — accounting verified: size-scan map (one-line manifest) gives 2045 LOC / band strong (strong=2000) for src/parser/theta-document.ts and every inventory row's members resolve at the map's declaration ranges (141-474, 482-622, 631-758, 770-919, 959-1157, 1173-1219/1320-1322, 1237-1370, 1400-1572, 1606-1697, 1720-1838, 1869-2045); excerpt reproduces at 959-964 (2-line drift); `grep -E '^(let|var|const) '` = 0 hits so no module-level shared state and the families are wired only through parseThetaDocument/runWholeDocumentChecks parameters (no ≥ 6-shared-locals single algorithm); type LOC ≈ 10 + ~30 re-export scaffold vs ~1900 payload (not data-only, not a husk/barrel); quality/exemptions.json has no parser/ key at all; header hand-authored with spec citations but no keep-whole invariant or measured cost; prior splits landed and were not reverted (git log shows qw20260923060827/072108 fix commits; ident-resolution.ts, lexical-call-sites.ts, doc-comment-recovery.ts exist); dedupe clean — PTQ-1156/PTQ-1264 are status: fixed with pre-fix inventories (10k/3862 LOC), PTQ-1166/PTQ-1270 are function-level keys, PTQ-1277 (misplacement, fixed) — fresh post-fix residual, not a duplicate; two non-refuting inaccuracies: the 'diagnostic/name builders' row is a cross-cutting helper cluster exported to siblings at 127-139 rather than one concern (same note as PTQ-1264 triage), and the typed-query walks' own-host back-reference is callWithClauseValues (2 hits in 1720-2045), not parseExpressionSource — ≥ 10 distinct concerns still stand; seam A/B/C shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting independently re-verified: size-scan map on a one-line manifest gives 2045 LOC / band strong (FILE_BANDS strong=2000) and its declaration table matches every inventory row (141-474, 482-622, 631-758, 770-919, 959-1157, 1173-1219/1320-1322, 1237-1370, 1400-1572, 1606-1697, 1720-1838, 1869-2045); excerpt reproduces at 959-964; no module-level let/var/const, and checkStatementPlacement/checkThetaLibTopLevel/checkThetaLibCallWithClauses/attachSubagentSessionConfigs each have one call site (419/407/414/311), so no ≥ 6-shared-locals single algorithm, not ≥ 80 % types, not generated; quality/exemptions.json D9 keys are only binder-system-prompt.ts#normaliseParamLineBreaks and package-discovery.ts; the 117-118 comment ('Shared helpers stay at the document seam') justifies only the exported helper cluster, not a keep-whole invariant or measured cost; PTQ-1156/PTQ-1264 are status: fixed in quality/resolved with pre-split inventories and PTQ-1166/1270/1277 are function-level/misplacement keys — not duplicates; non-refuting inaccuracies: the diagnostic/name-builder row is a cross-cutting helper cluster (used by body-parser.ts:3565, lexical-call-sites.ts:167), and the typed-query walks' back-reference is callWithClauseValues (1800, 1980), not parseExpressionSource — ≥ 10 distinct concerns stand; seam shape needs a human ruling (triage: claude-opus-5-5)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map (one-line manifest) gives 2045 LOC / band strong (FILE_BANDS strong=2000), and its declaration table matches every inventory row's members and ranges; the excerpt appears at 959-964; there is no module-level let/var/const, and the file-private families each have one call site (attachSubagentSessionConfigs 311, checkThetaLibTopLevel 407, checkStatementPlacement 419), so no ≥ 6-shared-locals single algorithm; the file is not ≥ 80 % types, not generated and not a barrel; quality/exemptions.json and quality/issues have no theta-document key; the only in-file rationale (117-118, 'Shared helpers stay at the document seam') covers the exported helper cluster, not a keep-whole invariant or measured cost; PTQ-1156/PTQ-1264 are status: fixed in quality/resolved with pre-split inventories, so this is not a duplicate; two inaccuracies that do not refute the filing: the diagnostic/name-builder row is a helper cluster shared with sibling modules, not one concern, and the typed-query walks call back to callWithClauseValues (1800, 1980), not parseExpressionSource; ≥ 10 distinct concerns still stand (triage: claude-opus-5-5)
