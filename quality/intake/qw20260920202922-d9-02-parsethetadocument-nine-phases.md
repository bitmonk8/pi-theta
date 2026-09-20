---
id: pending
title: parseThetaDocument runs nine sequential phases plus an inline 89-LOC template-span scanner in one 441-LOC body
lens: D9
status: intake
verdict: pending
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
