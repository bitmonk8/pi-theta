---
id: PTQ-0753
title: registers() in inline-object-malformed-entry-resync.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-malformed-entry-resync.test.ts:312-332
  - tests/helpers/e2e-s1.ts:87-97
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# registers() in inline-object-malformed-entry-resync.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError

## Observation
tests/inline-object-malformed-entry-resync.test.ts declares a local
`registers(doc: ThetaDocument): boolean` whose body is
`!doc.diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")))`.
tests/helpers/e2e-s1.ts — the module this same file already imports `parseDoc`
from — exports `isLoadParseError(d: Diagnostic): boolean`, the identical
single-diagnostic predicate (`d.severity === "error" && (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))`).
`registers(doc)` is exactly `!doc.diagnostics.some(isLoadParseError)`.

## Evidence

tests/inline-object-malformed-entry-resync.test.ts:312-332 (re-read immediately before filing):
```ts
/**
 * `hasLoadParseError`'s predicate (src/extension/production-composition.ts),
 * restated over a parsed document: a theta registers unless some diagnostic is
 * an error-severity `theta/load/*` or `theta/parse/*`. Group (D)'s d1 is the
 * one row of this report where that predicate is TRUE at HEAD.
 *
 * This departs, deliberately, from the bug doc's §Observed-at reading of
 * "registers" as `frontmatter !== null`: post-fix, d1's frontmatter is
 * non-null with one body diagnostic, so the doc's reading would still call
 * d1 registered while this predicate does not. The production predicate is
 * the one that matters here — it is what decides whether the theta is kept
 * or dropped at load, which is what §Fix (f)'s "lose their loads-cleanly
 * status" is about.
 */
function registers(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some(
    (d: Diagnostic) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}
```

tests/helpers/e2e-s1.ts:87-97 (re-read immediately before filing), the
exported single-diagnostic form of the same predicate:
```ts
/**
 * True iff `d` is the error-severity `theta/load/*` or `theta/parse/*` refusal
 * that blocks registration (mirrors `hasLoadParseError`,
 * src/extension/production-composition.ts).
 */
export function isLoadParseError(d: Diagnostic): boolean {
  return (
    d.severity === "error" &&
    (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))
  );
}
```

The file's import block (tests/inline-object-malformed-entry-resync.test.ts:1-9)
already reads `import { parseDoc } from "./helpers/e2e-s1";` — the same module
`isLoadParseError` is exported from — but does not import `isLoadParseError`.

Exact search: `grep -n "^function registers" tests/*.test.ts --include="*.test.ts"`
finds this same predicate body (identical clause set, differing only in the
frontmatter-vs-hasLoadParseError reading each file picks) independently
declared as `registers`/`registersCleanly` in nine further files
(tests/b0341-inferred-literal-binding-refuses-primitive-rhs.test.ts,
tests/fn-param-sink-array-literal.test.ts,
tests/inline-object-field-name-case.test.ts,
tests/inline-object-field-name-comparison-key.test.ts,
tests/inline-object-quoted-field-name-refusal.test.ts,
tests/inline-object-wire-name-rename-refusal.test.ts,
tests/nested-array-element-sink-descent.test.ts,
tests/schema-field-name-case.test.ts,
tests/type-name-as-value-refusal.test.ts); this finding is confined to the one
site inside this review's assigned scope
(tests/inline-object-malformed-entry-resync.test.ts).

## Why this is a problem
`isLoadParseError` is not a narrower or differently-scoped predicate than the
one `registers` computes: both test `d.severity === "error"` and
`(d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))` with
no additional or missing clause. The reviewed file's own doc comment justifies
choosing the `hasLoadParseError` reading of "registers" over the bug doc's
`frontmatter !== null` reading — a real, stated design choice — but that
choice does not require re-deriving the predicate's boolean logic locally: the
already-imported helper module carries the exact single-diagnostic test this
function needs, and the file could have written `!doc.diagnostics.some(isLoadParseError)`
using the already-live import instead of restating the two `startsWith`
clauses inline.

## Suggested direction (non-binding, optional)
`!doc.diagnostics.some(isLoadParseError)`, using the already-imported
`isLoadParseError` from `tests/helpers/e2e-s1.ts`, expresses the same
predicate `registers` computes today.

## False-positive check
- Gate-pin check: tests/inline-object-malformed-entry-resync.test.ts does not
  match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate).
- Recording-double check: `registers` reads an already-produced diagnostics
  array; it records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "registers" docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md`
  → hits at lines 179, 236, 316, 383, 439, 456, 762, all defining or using
  "registers" as `frontmatter !== null` or narrating a fixture's disposition —
  none states a rationale for re-deriving `isLoadParseError`'s boolean logic
  locally rather than importing it; the file's own comment explains only why
  it picked the `hasLoadParseError` READING over the doc's `frontmatter !== null`
  reading, not why the predicate itself is restated inline.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-malformed-entry-resync"
  docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md
  cites this file by name as its §Fix (e) witness and by group/cell id (A, B,
  C, D, F, J, L; d1/d3 etc.), never by `registers`'s internal implementation;
  this finding proposes no change to any `it()`/`describe()` name, count, or
  assertion — only to where the boolean predicate `registers` computes is
  derived — so no cited witness cell is disturbed.
- Prior-filing overlap check: `grep -rl "isLoadParseError" quality/intake/*.md
  quality/resolved/*.md` finds two pending candidates
  (qw20260917154546-d7-02-blocksregistration-reimplements-isloadparseerror-in-index-element-alias.md,
  qw20260917154546-d7-04-blocksregistration-reimplements-isloadparseerror.md)
  and resolved PTQ-0268; all three name a different local function
  (`blocksRegistration` / `expectBlocksRegistration`) in different files, none
  of which is tests/inline-object-malformed-entry-resync.test.ts or its
  `registers` function, so this is a new site of the recurring class rather
  than a re-filing of any of them.
- Coverage check: the claim is about a repeated predicate DEFINITION, not a
  missing test path; `registers` is exercised by group (D)'s d1 cell in the
  file today.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/inline-object-malformed-entry-resync.test.ts:312-332 and tests/helpers/e2e-s1.ts:87-97; the file imports only `parseDoc` from ./helpers/e2e-s1 (line 9) while `isLoadParseError` (added there in f0333c15, PTQ-0268's fix, after this test's 2026-08-22 authorship) is the clause-identical single-diagnostic predicate, so `registers` is exactly `!doc.diagnostics.some(isLoadParseError)`; `grep "^function registers" tests/*.test.ts` reproduces the stated 10 files; one live call site (line 725, cell d1); not a gate file, 0 coverage-matrix hits, bug doc 0231 cites cells not the predicate; PTQ-0268 and same-wave siblings d7-02/d7-157-02 each name a different file's function, so this is a new site of the class, not a duplicate (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
