---
id: PTQ-1166
title: parseThetaDocument runs nine sequential phases plus an inline 89-LOC template-span scanner in one 441-LOC body
lens: D9
status: open
verdict: confirmed
locations:
  - src/parser/theta-document.ts:1040-1480
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/theta-document.ts#parseThetaDocument
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
fix_skips: 1
---

# parseThetaDocument runs nine sequential phases plus an inline 89-LOC template-span scanner in one 441-LOC body

## Observation
parseThetaDocument (src/parser/theta-document.ts:1040-1480, 441 LOC, strong band) is the whole-file parse entry point. It sequences encoding validation, frontmatter splitting, lexing, body parse, doc-comment recovery, query-schema resolution, the authoritative frontmatter parse, an eight-checker battery, diagnostic assembly, and subagent-config attachment. One phase — the backtick/interpolation span scanner — is written inline as a raw token loop with two local closures rather than as a named helper.

## Evidence
Step inventory (phase | lines | LOC | locals read/written):

| phase | lines | LOC | locals |
|---|---|---|---|
| P1 encoding gate + decode | 1044-1071 | 28 | reads source.bytes; writes text |
| P2 frontmatter split, body lex, early params-name pass | 1072-1120 | 49 | writes split, lex, paramFieldNames |
| P3 body parse | 1121-1122 | 2 | writes parser, body |
| P4 inline template/interpolation span scan + posBefore/isTemplateLine closures | 1123-1211 | 89 | writes templateLineSpans, interpSpans, openBacktick, interpDepth, interpOpen, prevTok; reads lex.tokens only |
| P5 doc-comment scan, attach, merge | 1213-1229 | 17 | writes docScan, described, mergedStatements |
| P6 query-schema resolve + collectBodyTypes | 1231-1247 | 17 | writes resolvedQuery, statements, resolvedTail, bodyTypes |
| P7 authoritative frontmatter parse | 1249-1283 | 35 | writes frontmatter, paramFields, frontmatterRefusedRanges, frontmatterDiags |
| P8 checker battery: checkStructural, ident-root seeds + checkUnknownIdentifiers, checkParamsDefaultNames, checkLexicalCallSites, buildRuntimeToolSuccessTypes + checkTypeLayer, thetalib checks, checkStatementPlacement | 1285-1440 | 156 | reads statements/resolvedTail/frontmatter; writes eight diagnostic arrays |
| P9 assembleDiagnostics + attachSubagentSessionConfigs + return | 1441-1480 | 40 | reads all prior arrays |

Seam cost: P4 reads exactly one prior local (lex.tokens) and its outputs are consumed only by isTemplateLine, itself consumed only by the P5 call at 1213 — extraction threads one parameter in and one predicate out. Each P8 checker call reads at most four locals (statements, resolvedTail, frontmatter, file). Excerpt of the inline scanner's head (1128-1136):

```ts
  const templateLineSpans: { open: Position; close: Position }[] = [];
  const interpSpans: { open: Position; close: Position }[] = [];
  let openBacktick: Position | undefined;
  let interpDepth = 0;
  let interpOpen: Position | undefined;
  let prevTok: (typeof lex.tokens)[number] | undefined;
  for (const tok of lex.tokens) {
    if (tok.kind === "punct" && tok.text === "`" && interpDepth === 0) {
```

## Why this is a problem
Strong band: presumption of breakdown, strong concrete reason required. Reasons considered and defeated: (1) spec-cited ordered step sequence — the ordering constraints the comments cite (body parse before frontmatter, 1080-1086; early params pass before body parse, 1101-1108) hold between P2/P3/P7, but P4 is a pure token-fold with a single input and single consumer; extracting it (or any P8 checker grouping) interleaves no observable step, so the seam does not break the cited order; (2) single algorithm with shared local state — the six P4 locals are private to P4 and dead after 1211; the phase boundaries pass 1-4 values each, not 6+; (3) closed-enumeration dispatch — no switch; (4) measured cost / reverted split / exemption — none found (quality/exemptions.json has no key for this host).

## Suggested direction (non-binding, optional)
Hypotheses, unproven. Seam A: P4 -> templateProseLineSpans(tokens) helper or a docs/scan module beside scanDocComments (hypothesis) — 89 LOC, 0 exported symbols moved, 0 external importers, one call back from the host. Seam B: P8's eight checker invocations -> runWholeDocumentChecks(statements, tail, frontmatter, file, ...) (hypothesis) — ~156 LOC, 0 exported symbols, 0 external importers, one call back. None identified yet for P1-P3/P9, whose order the cited bugs pin.

## False-positive check
Band check: 441 LOC >= 200, strong. Reasons considered recorded above with the locals-count evidence that defeated the shared-state claim. Exemptions check: no D9 entry for src/parser/theta-document.ts#parseThetaDocument. Generated-code check: hand-written (bug 0410/0411/0420 rationale inline). Spec-mirror check: the phases mirror no spec-named closed enumeration; the checker battery grows per bug fix (statementPlacementDiags added by bugs 0446/0447 per comment at 1418-1432). Range 1040-1480 re-read this session before filing.

## Triage
verdict: questionable — accounting verified: size-scan confirms parseThetaDocument 1040-1480 / 441 LOC / band strong, no exemptions.json key, nine sequential delegated phases are real distinct concerns and P4's six locals + posBefore are dead after isTemplateLine's sole consumer at 1211 (Seam A accounting exact); excerpt content matches but internal line refs drift ~25 lines (scanner head is 1153-1160, consumer 1211), and the "each P8 call reads at most four locals" claim is understated (checkStructural reads 7: statements, resolvedTail, bodyTypes, file, resolvedQuery.propagations, lex.diagnostics, parser.diagnostics; P8 aggregate reads 10 prior locals) which a human should weigh against Seam B; not a duplicate of sibling d9-01 (file-level host key) — target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified: size-scan map reproduces parseThetaDocument 1040-1480 / 441 LOC / band strong with no exemptions.json key; the nine rows are real delegated phases and P4's six locals + posBefore/isTemplateLine have no reference after the sole scanDocComments consumer at 1211 (Seam A 1-in/1-out exact); excerpt content matches with ~25-line drift (1153-1160; P8 begins at checkStructural 1276); the "at most four locals per P8 call" claim is refuted — checkStructural reads 7 and the P8 block reads 10 prior locals, so Seam B is a ~10-parameter seam a human must weigh, though as an immutable const pipeline (no mutation back, no critical section) this corrects cost rather than invoking the shared-state reason; not a duplicate of d9-01 (file host key) or PTQ-1113/1131 (D4) — target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified at HEAD with drift: size-scan map (mktemp manifest) now gives parseThetaDocument 1051-1484 / 434 LOC / band strong (filed 1040-1480 / 441; the −7 LOC is resolved PTQ-1113's fix collapsing P1's inline UTF-8 gate into the validateUtf8Encoding call at 1067), no theta-document key in quality/exemptions.json or `exemptions --lens D9`; all nine rows are real delegated phases (validateUtf8Encoding/decodeSource → splitFrontmatter/lexTheta/early parseFrontmatter → BodyParser → inline scan → scanDocComments/attachDocDescriptions/mergeByLine → resolveQuerySchemas/collectBodyTypes → authoritative parseFrontmatter → eight checkers 1280-1449 → assembleDiagnostics/attachSubagentSessionConfigs), excerpt byte-exact at 1164-1171; Seam A deadness re-grepped — every hit of the eight P4 identifiers outside 1157-1211 is comment prose (1137/1148/1212) or the sole consumer scanDocComments(…, isTemplateLine) at 1215 (2451-2511 are that helper's own parameter), so 1-in/1-out holds; the "at most four locals per P8 call" claim is refuted (checkStructural reads 7, the P8 block reads 10: statements/resolvedTail/bodyTypes/file/resolvedQuery/lex/parser/frontmatter/paramFields/frontmatterRefusedRanges) but P8 mutates nothing and each checker writes its own const, so this corrects Seam B's parameter cost rather than invoking the ≥ 6-shared-locals reason, and Seam A stands regardless; no overlooked reason — cka-49 in the header pins assembleDiagnostics' sort order not residence, the body-before-frontmatter / early-params-before-body pins sit between P2/P3/P7 which neither seam reorders, hand-written, `git log -S` shows only the Loom→Theta rename (no split/revert); dedupe clean — quality/issues is empty, no resolved PTQ carries d9_host …#parseThetaDocument, d9-01 is the file-level key, PTQ-1113 covered only P1's gate; D9 breakdown never confirms — which of Seams A/B and the home is a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.

## Fix attempts
- qw20260921120149: skipped — [PTQ-1156-theta-document-file-twelve-concerns.md] PTQ-1156: Implemented seam A: moved 55 AST declarations and comments verbatim to theta-ast.ts, with barrel exports and unchanged importers. Size-scan map: host 10481→9660 LOC; sibling 891 LOC. Required gate passed: tsc and 698 test files / 11616 tests; no tests changed or deleted. / PTQ-1166: Extracted templateProseLineSpans in the same module; preserved interpolation handling and phase order. Size-scan map: parseThetaDocument 434→353 LOC. / PTQ-1172: Extracted parseFnParamList with parameter recognition and closing diagnostics together. Size-scan map: parseFn 245→76 LOC. / PTQ-1182: Extracted parseImportSpecifierList with the five-field result; preserved from-clause parsing and adjacent statement verdicts. Size-scan map: parseImportExport 244→89 LOC. | review unconfirmed: PTQ-1156-theta-document-file-twelve-concerns.md — partial: Seam A (the 57-decl AST type family → new src/parser/theta-ast.ts, re-exported via `export * from "./theta-ast"`) landed as a verified verbatim move, but the host is still 9660 LOC (strong band ≥2000) — Seam B (class BodyParser + its token tables, ~4300 LOC, still at src/parser/theta-document.ts ~2600-6100) and Seam C (the structural-check block checkStructural/checkSchemaDeclarationGraph/walkStatement/walkExpr, ~1850 LOC) remain in-file, along with the ident-resolution walk, lexical call-site checks, and typed-query detection. PTQ-1166-parsethetadocument-nine-phases.md — partial: Seam A (the inline 89-LOC template/interpolation span scanner → templateProseLineSpans(tokens), a verified pure move) landed and the body shrank 441→353 LOC, but 353 LOC is still strong band (≥200): the P8 ~156-LOC eight-checker battery (checkStructural, ident-root seeds + checkUnknownIdentifiers, checkParamsDefaultNames, checkLexicalCallSites, buildRuntimeToolSuccessTypes + checkTypeLayer, thetalib checks, checkStatementPlacement) is still inline in parseThetaDocument — Seam B (runWholeDocumentChecks) was not implemented. || [PTQ-1193-walkexpr-query-arm-176-loc.md] PTQ-1193: Extracted checkQueryAnnotation; interpolation checks and diagnostic order preserved. size-scan map: walkExpr 353 → 185 LOC. / PTQ-1195: Extracted checkCallSiteCall; binder lookup and argument/clause recursion remain in the walker. size-scan map: walkCallSiteExpr 191 → 107 LOC. / PTQ-1213: Extracted checkSchemaFieldTypes and validateFnAnnotations in the same module, retaining private propagation/window wiring. size-scan map: walkStatement 303 → 190 LOC. / PTQ-1214: Extracted checkAliasRhs, returning the original byForm and diagnostic-window start; graph collection and cycle detection unchanged. size-scan map: checkSchemaDeclarationGraph 178 → 99 LOC; host file 9660 → 9714 LOC. All four fixes passed tsc-first and the exact required gate: 698 test files, 11616 tests passed. No tests changed or deleted; quality/ untouched. ||
