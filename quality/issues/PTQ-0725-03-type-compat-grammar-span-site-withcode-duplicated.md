---
id: PTQ-0725
title: type-compat.test.ts and type-grammar.test.ts each declare byte-identical span/site/withCode diagnostic-helper trios
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/type-compat.test.ts:64-72
  - tests/type-grammar.test.ts:30-43
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# type-compat.test.ts and type-grammar.test.ts each declare byte-identical span/site/withCode diagnostic-helper trios

## Observation
Both files declare the same three private helper functions with the same
bodies: `span()` returning a throwaway `1:1`–`1:2` `SourceRange`, `site()`
returning `{ file: "test.theta", range: span() }`, and `withCode(diags, code)`
returning `diags.find((d) => d.code === code)`. Only the doc-comments differ
between the two copies; the executable bodies are identical.

## Evidence
`tests/type-compat.test.ts:64-72`:
```ts
/** A throwaway 1:1–1:2 span for the per-site seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
function site(): { file: string; range: SourceRange } {
  return { file: "test.theta", range: span() };
}
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}
```

`tests/type-grammar.test.ts:30-43`:
```ts
/** A throwaway 1:1–1:2 span for the parse-context seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A located site at the throwaway span. */
function site(): { file: string; range: SourceRange } {
  return { file: "test.theta", range: span() };
}

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}
```

`grep -n "^function span\|^function site\|^function withCode" tests/type-compat.test.ts tests/type-grammar.test.ts` returns exactly these two declaration sites for each of the three names (six lines total), confirming no third in-scope copy and no partial helper import between the two files.

## Why this is a problem
The three-function trio that builds a throwaway diagnostic site and finds a
diagnostic by code is authored twice, with identical executable bodies, in
the two files this review scope covers. Both files import `checkCompatible`
/ `checkLetRhsCompat` / `checkFnArgCompat` / `checkCommonType` (type-compat)
and `parseTypeExpression` / `checkLiteralSublanguage` /
`checkObjectLiteralFields` (type-grammar) from `src/parser`, each passing the
same `site()`-shaped located-site argument these seams share — so the
duplication tracks a real shared argument shape across the two files, not an
incidental coincidence of naming.

## Suggested direction (non-binding, optional)
The `span`/`site`/`withCode` trio names a small shared home under
`tests/helpers/` for the two files' common "throwaway located site plus
find-diagnostic-by-code" need, alongside the existing per-concern helper
modules already there (e.g. `tests/helpers/registry-oracle.ts`).

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or named gate kin; not
  applicable.
- Recording-double check: not applicable — `withCode` is a plain array
  `.find`, not a call-recording double.
- docs/bugs/ signature search: `grep -rln "RED (" tests/type-compat.test.ts
  tests/type-grammar.test.ts` shows both files use the repo-wide "RED (…):"
  test-name convention for not-yet-landed spec rules (V2b/V2a); neither file's
  header claims a documented correct-reason red for the helper trio itself,
  and this finding does not concern the RED/GREEN labelling, only the
  duplicated helper bodies.
- coverage-matrix/bug-doc citation search: `grep -rn "type-compat.test.ts\|
  type-grammar.test.ts" docs/reference/coverage-matrix.md docs/bugs/` hits
  many bug docs that cite specific line ranges of both files (e.g. bug 0050
  cites `tests/type-compat.test.ts:267-283`; bug 0130 cites `:54-56`,
  `:212-235`, `:331`; bugs 0165/0166/0175 cite `tests/type-grammar.test.ts:132`,
  `:150`; bugs 0235/0236 cite the `V2a-T` arity group at `:48-83`/`:58-83`).
  None of those cited ranges overlap the `span`/`site`/`withCode` declarations
  this finding cites (`type-compat.test.ts:64-72`, `type-grammar.test.ts:30-43`),
  and this finding does not propose to move, rename or delete any cited cell —
  only that the helper trio's declaration site changes to an import.
- This is a claim about duplicated helper code in two existing files, not a
  claim that either file is missing a test.

## Triage
verdict: confirmed — independently re-verified: both excerpts match verbatim at the cited lines (type-compat.test.ts:64-72, type-grammar.test.ts:30-43) and the three executable bodies are byte-identical (only doc-comments differ); the stated two-file grep reproduces (6 declaration lines); the filing understates the family — `function site()` with the identical `{ file: "test.theta", range: span() }` body recurs in 13 test files, span() is already exported identically by tests/helpers/invoke-seam-scaffold.ts:54 and tool-call-dispatch-harness.ts:51, and tests/helpers/e2e-s1.ts:70 `findCode` is a body-identical withCode — but that only reinforces the D7 boilerplate-duplication class, and no tests/helpers/ module exports site(); no gate/recording-double/coverage-matrix carve-out applies (bug docs cite type-compat :5/:45/:54/:212/:249/:267 and type-grammar :3/:4/:27/:132/:185-200, none inside the cited helper ranges, and no it() merge/rename/delete is proposed); not tracked in open/resolved — PTQ-0278 is a different file's span-vs-R() reimplementation, and same-wave sibling qw20260917154546-d7-02 (confirmed) covers the same trio in four other files under this wave's accepted per-cluster filing convention (triage: claude-fable-5-1)
