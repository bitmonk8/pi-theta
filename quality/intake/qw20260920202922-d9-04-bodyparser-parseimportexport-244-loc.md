---
id: pending
title: BodyParser.parseImportExport recognises both ImportDecl and ExportDecl in one 244-LOC body with a 150-LOC specifier-list state machine
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:4688-4931
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/theta-document.ts#BodyParser.parseImportExport
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# BodyParser.parseImportExport recognises both ImportDecl and ExportDecl in one 244-LOC body with a 150-LOC specifier-list state machine

## Observation
BodyParser.parseImportExport (src/parser/theta-document.ts:4688-4931, 244 LOC, strong band) parses both the ImportDecl and ExportDecl productions (imports.md §"Re-exports"), selected by its `kind` parameter. The braced specifier list is a 150-LOC state machine tracking separator degeneracy, dangling aliases, and reserved names per specifier; a 25-LOC from-clause step and a 53-LOC block of three statement-level verdicts follow.

## Evidence
Step inventory (phase | lines | LOC | locals read/written):

| phase | lines | LOC | locals |
|---|---|---|---|
| S1 keyword + specifier-list state machine | 4688-4846 | 159 | writes specifiers, symbols, hasBraces, sawSpecifier, separatorSeen, hasSeparatorDegeneracy, anyDanglingAlias (7 locals) |
| S2 from-clause + path-literal validation | 4847-4870 | 24 | writes hasFromKeyword, path, hasPathLiteral |
| S3 statement-level verdicts: checkImportMissingFromClause (4879), checkImportMalformedSpecifierList (4892), checkImportSeparatorDegenerateSpecifierList (4913) | 4871-4923 | 53 | reads hasBraces, specifiers.length, hasSeparatorDegeneracy, anyDanglingAlias, hasFromKeyword, hasPathLiteral |
| S4 node build | 4924-4931 | 8 | reads kind, path, symbols, specifiers |

Excerpt (4913-4921), the last verdict reading five S1/S2 outputs:

```ts
    const separatorDegenerateSpecifierList = checkImportSeparatorDegenerateSpecifierList(
      hasSeparatorDegeneracy,
      specifiers.length,
      anyDanglingAlias,
      hasFromKeyword,
      hasPathLiteral,
      { file: this.file, range },
    );
```

## Why this is a problem
Strong band: presumption of breakdown, strong concrete reason required. Reasons considered and defeated: (1) one grammar production family — weakened here: the method recognises two productions (ImportDecl and ExportDecl), and in any case the reason is sufficient only in the justify band; (2) single algorithm with shared local state — S1's seven locals reduce to a five-field result record at the S1/S3 boundary (specifiers, symbols, hasBraces, hasSeparatorDegeneracy, anyDanglingAlias — sawSpecifier and separatorSeen are loop-internal), under the six-local bar; (3) closed-enumeration dispatch — the loop's three token classes are not a spec table of short arms (the symbol arm is ~100 LOC); (4) strong extras — bug 0211's one-diagnostic-per-statement partition (comment at 4700-4714, code-registry-parse.md:127) constrains the three S3 verdicts' gating, but all three verdicts sit together in S3 and a specifier-list seam leaves them adjacent — no interleaving of observable steps; no measured cost, no reverted split, no exemption.

## Suggested direction (non-binding, optional)
Hypothesis, unproven: Seam A: S1's brace loop -> private BodyParser.parseImportSpecifierList() returning { specifiers, symbols, hasBraces, hasSeparatorDegeneracy, anyDanglingAlias } (hypothesis) — ~130 LOC, 0 exported symbols moved, 0 external importers, one call back from parseImportExport. None identified yet for S2-S4.

## False-positive check
Band check: 244 LOC >= 200, strong. Reasons considered recorded with the two-production count and the five-field boundary record that defeats the shared-state claim. Exemptions check: no D9 entry for this host in quality/exemptions.json. Generated-code check: hand-written (bug 0100/0211/0040 rationale inline). Spec-mirror check: imports.md §"Re-exports" names one list shape, not a closed set of short dispatch arms. Range 4688-4931 re-read this session before filing.

## Triage
verdict: questionable — accounting verified: size-scan confirms 4688-4931 / 244 LOC / strong band, no exemption; S1-S4 boundaries and LOC (159+24+53+8) reproduce, sawSpecifier/separatorSeen have 0 reads after 4846 so the five-field S1/S3 boundary holds, two productions (imports.md:79-80) and the one-diagnostic-per-statement row (code-registry-parse.md:145, the :127 pointer has drifted) confirmed; not a duplicate; target shape needs a human ruling (triage: claude-fable-5-1)
