---
id: PTQ-1182
title: BodyParser.parseImportExport recognises both ImportDecl and ExportDecl in one 244-LOC body with a 150-LOC specifier-list state machine
lens: D9
status: fixed
verdict: confirmed
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
verdict: questionable — accounting re-verified independently: size-scan map reproduces `4688-4931 | 244 | private | parseImportExport` at band strong (FN_BANDS strong=200), quality/exemptions.json has no theta-document entry; the four rows are real sequential concerns (S1 4688-4846 brace-loop state machine, S2 4847-4870 from-clause/path literal, S3 4871-4923 three statement verdicts, S4 4924-4931 node build; 159+24+53+8=244) and sawSpecifier/separatorSeen are loop-internal (no reads after 4846); the values crossing the brace-loop seam are 5 single-write outputs (specifiers, symbols, hasBraces, hasSeparatorDegeneracy, anyDanglingAlias — plus `kw`, a pre-loop token the filing omitted from S1's output list, read only at 4871 for the range) handed forward pipeline-style, not the mutually-mutated shared state of the d9-03 try/finally precedent, so the ≥6-shared-locals reason is not overlooked; two productions confirmed at imports.md:79-80, the one-diagnostic-per-statement partition is real but at code-registry-parse.md:145 (the inline `:127` citations have drifted — a D2 matter, not this filing's), and all three partitioned verdicts stay adjacent in S3; sibling list-body helpers parseEnumVariants (4529-4630) and parseSchemaObjectBody (4275-4434) already exist in the same class; no duplicate in quality/issues or intake; target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time against current HEAD: size-scan map now places the host at 4692-4935 (a +4 line drift, still 244 LOC, band strong under FN strong=200) with the excerpt byte-exact at 4917-4925 and the body otherwise unchanged; quality/exemptions.json has no theta-document/parseImportExport key and `exemptions --lens D9` lists none; the four inventory rows are real sequential concerns — S1 keyword+brace loop (4692-4850) writes 7 locals of which sawSpecifier/separatorSeen have zero reads past the loop's closing brace, S2 from-clause/path literal (4851-4874) writes hasFromKeyword/path/hasPathLiteral, S3 (4875-4927) only reads hasBraces/specifiers.length/hasSeparatorDegeneracy/anyDanglingAlias/hasFromKeyword/hasPathLiteral plus kw.range, S4 (4928-4935) builds the node — so the S1→S3 hand-off is 5 write-once values (+kw), under the ≥6 mutually-shared-locals bar; two productions confirmed at docs/spec_topics/imports.md:79-80; the one-diagnostic-per-statement partition is real at code-registry-parse.md:145 ("the three statement/specifier arms partition and at most one statement-ranged diagnostic of this code fires per statement") but all three arms stay adjacent in S3, so no strong reason is overlooked; only callers are parseForm 3235/3237; `git log -S parseImportSpecifierList` finds no reverted prior split; no matching row in quality/issues; a D9 breakdown's shape is a design decision — needs a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
