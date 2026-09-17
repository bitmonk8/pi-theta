---
id: PTQ-0543
title: blocksRegistration in index-element-alias-runtime-disposition.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/index-element-alias-runtime-disposition.test.ts:176-192
  - tests/helpers/e2e-s1.ts:88-97
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# blocksRegistration in index-element-alias-runtime-disposition.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError

## Observation
tests/index-element-alias-runtime-disposition.test.ts declares a local
`blocksRegistration(diagnostics)` function whose body is
`diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/")
|| d.code.startsWith("theta/parse/")))`, with a doc comment stating it
mirrors the module-private production `hasLoadParseError` because that
function cannot be imported. tests/helpers/e2e-s1.ts exports
`isLoadParseError(d: Diagnostic): boolean`, the identical single-diagnostic
predicate (`d.severity === "error" && (d.code.startsWith("theta/load/") ||
d.code.startsWith("theta/parse/"))`). `blocksRegistration(diagnostics)` is
exactly `diagnostics.some(isLoadParseError)`. This file does not import
anything from `./helpers/e2e-s1` — its import block names only
`@earendil-works/pi-coding-agent`, `vitest`, and `../src/...` modules.

## Evidence
tests/index-element-alias-runtime-disposition.test.ts:176-192:
```ts
/**
 * Whether `diagnostics` blocks registration. This replicates `hasLoadParseError`
 * (src/extension/production-composition.ts:2045–2052) by construction: that
 * function is module-private — `rg -n 'export.*hasLoadParseError' src/` matches
 * nothing — so it cannot be imported, and the predicate is mirrored here
 * instead. Its three clauses are the whole of the original: error severity, and
 * a code in the `theta/load/` or `theta/parse/` namespace.
 * `parseDiscoveredTheta` applies it at `:2092` and drops the theta.
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

tests/helpers/e2e-s1.ts:88-97 — the exported single-diagnostic form of the same predicate:
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

## Why this is a problem
The doc comment's stated justification — that the production predicate
`hasLoadParseError` is module-private and so "the predicate is mirrored here
instead" — is accurate about the PRODUCTION function but does not address
the TEST-SIDE export: tests/helpers/e2e-s1.ts already carries an exported
`isLoadParseError` performing the identical per-diagnostic test.
`blocksRegistration` is not a new predicate; it is `Array.prototype.some`
applied to `isLoadParseError`, re-derived locally instead of composed from
the already-available helper module. This is the same duplication shape
PTQ-0268 (resolved) found and fixed for a sibling `expectBlocksRegistration`
assertion-wrapper pair, and the same shape a separate pending candidate in
this wave (qw20260917154546-d7-04-blocksregistration-reimplements-isloadparseerror.md)
finds in tests/fn-param-name-reserved-keyword.test.ts — that candidate's own
evidence quotes a doc comment inside its reviewed file naming
`tests/index-element-alias-runtime-disposition.test.ts:185` as the earlier
site the same mirroring choice was modelled on, but does not cite this file's
own line range as a location; this finding closes that gap for the file
actually under this wave's assigned scope.

## Suggested direction (non-binding, optional)
`diagnostics.some(isLoadParseError)`, importing `isLoadParseError` from
`tests/helpers/e2e-s1.ts`, expresses the same predicate the local
`blocksRegistration` computes.

## False-positive check
- Gate-pin: tests/index-element-alias-runtime-disposition.test.ts does not
  match `*gate*.test.ts` or the named kin.
- Recording-double: `blocksRegistration` reads an already-produced
  diagnostics array; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "blocksRegistration\|isLoadParseError"
  docs/bugs/*.md` → 0 files; no open bug names this duplication or gives a
  documented-correct-reason for keeping a second copy of the predicate.
- coverage-matrix/bug-doc citation search: `grep -n
  "index-element-alias-runtime-disposition" docs/reference/coverage-matrix.md`
  → 0 hits. docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md cites
  this file by filename and by e1/e3/e5/x1/x2 cell ids, never by
  `blocksRegistration`'s name; this finding proposes no change to any
  `it()`/`describe()` name, count, or assertion — only to where the boolean
  predicate the `blocksRegistration(row.diagnostics)` calls read is computed.
- Existing-helper verification: `isLoadParseError` was read directly from
  tests/helpers/e2e-s1.ts:88-97 above and its body compared clause-by-clause
  against `blocksRegistration`'s inline predicate; both test `severity ===
  "error"` and `code.startsWith("theta/load/") || code.startsWith("theta/parse/")`
  with no additional or missing clause.
- Prior-filing overlap check: `grep -rl "blocksRegistration"
  quality/intake/*.md quality/resolved/*.md` finds
  qw20260917154546-d7-04-blocksregistration-reimplements-isloadparseerror.md
  (a different reviewed file, tests/fn-param-name-reserved-keyword.test.ts,
  not in this wave's scope) and the resolved PTQ-0268 (a different pair of
  files, a different function name `expectBlocksRegistration`); neither
  filing cites tests/index-element-alias-runtime-disposition.test.ts as a
  `locations` entry, so this is a new site of the recurring class rather than
  a re-filing of either.
- Coverage check: the claim is about a repeated predicate DEFINITION, not a
  missing test path; `blocksRegistration` is exercised by every `(e)` and
  `(x)` cell in the file today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/index-element-alias-runtime-disposition.test.ts:176-192 and tests/helpers/e2e-s1.ts:88-97, the inline predicate is clause-for-clause `isLoadParseError` (severity === "error" && code.startsWith theta/load/ || theta/parse/), the file imports nothing from ./helpers/e2e-s1 (grep: 0 hits) while `blocksRegistration` is live at 5 call sites (:279/:298/:315/:339/:365); git shows the helper landed 2026-09-12 (f0333c15, PTQ-0268's fix) after the file (e7f73ccf, 2026-08-05), so this is an unmigrated copy of the same shape PTQ-0268 homed there; the stated searches reproduce (docs/bugs 0 files, coverage-matrix 0 hits), bug 0125 is fixed and the suite is 5/5 green, not a gate file, no recording double, no it()/describe() touched — D7 boilerplate-duplication in tests/ only; not a duplicate: PTQ-0268 cites annotation-/schema-body-nontype-text-refusal and same-wave siblings d7-04/d7-130-01/d7-67 cite fn-param-name-reserved-keyword, reserved-keyword-misfire-faces + object-pattern-head-refusal, and inline-object-malformed-entry-resync respectively (per-file convention). Fixer note: the doc comment's "module-private, cannot be imported" premise is also stale — `hasLoadParseError` has been exported from src/extension/production-discovered-theta.ts:33 since 7281a593 (2026-09-14), so either the e2e-s1 helper or the production export is a drop-in (triage: claude-fable-5-1)
