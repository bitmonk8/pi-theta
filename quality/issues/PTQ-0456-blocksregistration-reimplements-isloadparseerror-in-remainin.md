---
id: PTQ-0456
title: blocksRegistration in reserved-keyword-remaining-identifier-positions.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:311-329
  - tests/helpers/e2e-s1.ts:87-97
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# blocksRegistration in reserved-keyword-remaining-identifier-positions.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError

## Observation
tests/reserved-keyword-remaining-identifier-positions.test.ts declares a
local `blocksRegistration(diagnostics)` function whose body is
`diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/")
|| d.code.startsWith("theta/parse/")))`. Its doc comment states the predicate
"mirrors" the module-private production `hasLoadParseError` and names two
other test files (`tests/fn-param-name-reserved-keyword.test.ts`,
`tests/index-element-alias-runtime-disposition.test.ts`) as doing "the same
[thing] for the same reason". tests/helpers/e2e-s1.ts exports
`isLoadParseError(d: Diagnostic): boolean`, the identical single-diagnostic
predicate. This file's only import from that module is `parseDoc` (line 10)
— `isLoadParseError` is not imported, and `blocksRegistration(diagnostics)`
is exactly `diagnostics.some(isLoadParseError)`.

## Evidence
tests/reserved-keyword-remaining-identifier-positions.test.ts:311-329:
```ts
/**
 * Whether `diagnostics` blocks registration. This replicates `hasLoadParseError`
 * (src/extension/production-composition.ts) by construction: that function
 * is module-private — `rg -n 'export.*hasLoadParseError' src/` matches nothing —
 * so it cannot be imported, and the predicate is mirrored here instead, the same
 * way and for the same reason tests/fn-param-name-reserved-keyword.test.ts and
 * tests/index-element-alias-runtime-disposition.test.ts mirror it. Its clauses
 * are the whole of the original: error severity, and a code in the
 * `theta/load/` or `theta/parse/` namespace. `parseDiscoveredTheta` applies it
 * and drops the theta.
 */
function blocksRegistration(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.code.startsWith("theta/load/") ||
        diagnostic.code.startsWith("theta/parse/")),
  );
}
```

tests/helpers/e2e-s1.ts:87-97 — the exported single-diagnostic form of the
same predicate:
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

The reviewed file's import list (line 1-10) names only `node:fs`,
`node:url`, `vitest`, `../tools/code-registry/index.js`,
`../src/diagnostics/diagnostic`, `../src/lexer/lexer`,
`../src/parser/imports`, `../src/parser/theta-document`, and
`./helpers/e2e-s1` (for `parseDoc` alone) — `isLoadParseError` is not among
the named imports.

## Why this is a problem
The doc comment's justification addresses only the PRODUCTION function's
module-privacy; it does not address that tests/helpers/e2e-s1.ts already
exports a test-side predicate performing the identical per-diagnostic test,
and that this same file already imports a different binding
(`parseDoc`) from that exact module. `blocksRegistration` is not a new
predicate — it is `Array.prototype.some` applied to `isLoadParseError`,
re-derived locally instead of composed from the already-reachable helper.
This is the same duplication shape as the two sibling occurrences the file's
own comment names (`tests/fn-param-name-reserved-keyword.test.ts`,
`tests/index-element-alias-runtime-disposition.test.ts`), both independently
filed elsewhere in this wave against `isLoadParseError`; this is a third,
previously-uncited instance of the identical predicate inside the two-file
scope assigned to this review.

## Suggested direction (non-binding, optional)
`diagnostics.some(isLoadParseError)`, importing `isLoadParseError` from
`tests/helpers/e2e-s1.ts` alongside the already-imported `parseDoc`,
expresses the same predicate the local `blocksRegistration` computes.

## False-positive check
- Gate-pin check: tests/reserved-keyword-remaining-identifier-positions.test.ts
  does not match `*gate*.test.ts` or the named gate kin.
- Recording-double check: `blocksRegistration` reads an already-produced
  diagnostics array; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "blocksRegistration\|isLoadParseError"
  docs/bugs/*.md` → 0 files; no open bug names this duplication or gives a
  documented correct-reason for a third local copy.
- coverage-matrix/bug-doc citation search: `grep -n
  "reserved-keyword-remaining-identifier-positions" docs/reference/coverage-matrix.md`
  → 0 hits. docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md
  cites this file by name and by row id (a1-a9, c1-c7, k1-k5, s1-s7, m1-m14,
  w1-w7, x4-x10, L1-L8, d1-d12, n1/n3/n4, ck) but never by
  `blocksRegistration`'s name; this finding proposes no change to any
  `it()`/`describe()` name, count, or assertion — only to where the boolean
  predicate the d1-d12 rows consume is computed.
- Existing-helper verification: `isLoadParseError` was read directly from
  tests/helpers/e2e-s1.ts:87-97 above and its body compared clause-by-clause
  against `blocksRegistration`'s inline predicate; both test `severity ===
  "error"` and `code.startsWith("theta/load/") || code.startsWith("theta/parse/")`
  with no additional or missing clause.
- Prior-filing overlap check: `grep -rl "blocksRegistration"
  quality/intake/*.md quality/resolved/*.md` finds two prior filings in this
  wave — `qw20260917154546-d7-04-blocksregistration-reimplements-isloadparseerror.md`
  (tests/fn-param-name-reserved-keyword.test.ts) and
  `qw20260917154546-d7-02-blocksregistration-reimplements-isloadparseerror-in-index-element-alias.md`
  (tests/index-element-alias-runtime-disposition.test.ts) — and the resolved
  PTQ-0268 (a different function name, `expectBlocksRegistration`, different
  files). None of the three cites
  tests/reserved-keyword-remaining-identifier-positions.test.ts as a
  `locations` entry, so this is a new site of the recurring class, not a
  re-filing of any of them.
- Coverage check: the claim is about a repeated predicate DEFINITION, not a
  missing test path; `blocksRegistration` is exercised by every (d)-row in
  the file today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `blocksRegistration` (tests/reserved-keyword-remaining-identifier-positions.test.ts:311-329, live at 1113/1133) is clause-identical to `diagnostics.some(isLoadParseError)` with the helper exported at tests/helpers/e2e-s1.ts:87-97 and that module already imported for `parseDoc` (line 10); docs/bugs and coverage-matrix greps → 0 hits, not a gate or recording double; the local comment's "module-private, cannot be imported" rationale is itself stale (`hasLoadParseError` is exported at src/extension/production-discovered-theta.ts:33); not a duplicate — resolved PTQ-0268 fixed `expectBlocksRegistration` in annotation/schema-body-nontype-text-refusal, and sibling intakes d7-02/d7-04/d7-130-01/d7-67 each cite different test files (d7-130-01 names this file only inside quoted comment text, not as a location) (triage: claude-fable-5-1)
