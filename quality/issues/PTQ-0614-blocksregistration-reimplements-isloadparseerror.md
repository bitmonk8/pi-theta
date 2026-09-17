---
id: PTQ-0614
title: blocksRegistration in fn-param-name-reserved-keyword.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/fn-param-name-reserved-keyword.test.ts:346-364
  - tests/helpers/e2e-s1.ts:92-97
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# blocksRegistration in fn-param-name-reserved-keyword.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError

## Observation
tests/fn-param-name-reserved-keyword.test.ts declares a local
`blocksRegistration(diagnostics)` function whose body is
`diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/")
|| d.code.startsWith("theta/parse/")))`, with a doc comment explaining it
mirrors the module-private production `hasLoadParseError` because that
function cannot be imported. tests/helpers/e2e-s1.ts — the module this same
file already imports `parseDoc` from — exports `isLoadParseError(d:
Diagnostic): boolean`, the identical single-diagnostic predicate
(`d.severity === "error" && (d.code.startsWith("theta/load/") ||
d.code.startsWith("theta/parse/"))`). `blocksRegistration(diagnostics)` is
exactly `diagnostics.some(isLoadParseError)`.

## Evidence
tests/fn-param-name-reserved-keyword.test.ts:346-364:
```ts
/**
 * Whether `diagnostics` blocks registration. This replicates `hasLoadParseError`
 * (src/extension/production-composition.ts:3263–3270) by construction: that
 * function is module-private — `rg -n 'export.*hasLoadParseError' src/` matches
 * nothing — so it cannot be imported, and the predicate is mirrored here
 * instead, the same way and for the same reason
 * `tests/index-element-alias-runtime-disposition.test.ts:185` mirrors it. Its
 * clauses are the whole of the original: error severity, and a code in the
 * `theta/load/` or `theta/parse/` namespace. `parseDiscoveredTheta` applies it
 * at `:2094` and drops the theta.
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

tests/helpers/e2e-s1.ts:92-97 — the exported single-diagnostic form of the
same predicate, already available to this file:
```ts
export function isLoadParseError(d: Diagnostic): boolean {
  return (
    d.severity === "error" &&
    (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))
  );
}
```

The file already imports from this module: tests/fn-param-name-reserved-keyword.test.ts:8
— `import { parseDoc } from "./helpers/e2e-s1";`.

## Why this is a problem
The doc comment's stated justification — that the production predicate
`hasLoadParseError` is module-private and so "the predicate is mirrored here
instead" — is accurate about the PRODUCTION function but does not address
the TEST-SIDE export: tests/helpers/e2e-s1.ts already carries an exported
`isLoadParseError` performing the identical per-diagnostic test, and the
reviewed file already has a live import statement from that same module a
few hundred lines above where `blocksRegistration` is defined.
`blocksRegistration` is not a new predicate; it is `Array.prototype.some`
applied to `isLoadParseError`, re-derived locally rather than composed from
the already-imported module. This is the same duplication shape PTQ-0268
(resolved) found and fixed for a sibling `expectBlocksRegistration`
assertion-wrapper pair, except here the reimplementation is against a
canonical helper that already exists in tests/helpers/ rather than against
another test file's local copy.

## Suggested direction (non-binding, optional)
`diagnostics.some(isLoadParseError)`, using the already-imported
`isLoadParseError` from tests/helpers/e2e-s1.ts, expresses the same
predicate the local `blocksRegistration` computes.

## False-positive check
- Gate-pin: tests/fn-param-name-reserved-keyword.test.ts does not match
  `*gate*.test.ts` or the named kin.
- Recording-double: `blocksRegistration` reads an already-produced
  diagnostics array; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "blocksRegistration\|isLoadParseError"
  docs/bugs/*.md` → 0 files; no open bug names this duplication or gives a
  documented-correct-reason for keeping a second copy of the predicate.
- coverage-matrix/bug-doc citation search: `grep -n
  "fn-param-name-reserved-keyword.test.ts" docs/reference/coverage-matrix.md`
  → 0 hits. docs/bugs/0148 and related docs cite this file by filename for
  its pinned `it()` counts and cell ids (d1/d2/d3 read
  `blocksRegistration`'s return value directly); this finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only to
  where the boolean predicate the d-rows consume is computed — so the pinned
  d1/d2/d3 witnesses are unaffected (their assertions are on the boolean
  result, not on `blocksRegistration`'s internal implementation).
- Existing-helper verification: `isLoadParseError` was read directly from
  tests/helpers/e2e-s1.ts:92-97 above and its body compared clause-by-clause
  against `blocksRegistration`'s inline predicate; both test `severity ===
  "error"` and `code.startsWith("theta/load/") || code.startsWith("theta/parse/")`
  with no additional or missing clause.
- Chronology check: `git log --follow --date=short -- tests/helpers/e2e-s1.ts`
  shows `isLoadParseError` was added 2026-09-12 (commit f0333c15); the
  reviewed file was last touched 2026-09-05, before that export existed, so
  its absence at authorship is expected. The finding is about the CURRENT
  state — the export exists today and the local predicate has not been
  folded onto it since — not about an authoring-time omission.
- Coverage check: the claim is about a repeated predicate DEFINITION, not a
  missing test path; `blocksRegistration` is exercised by every d-row in the
  file today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (blocksRegistration at tests/fn-param-name-reserved-keyword.test.ts:346-364; exported isLoadParseError at tests/helpers/e2e-s1.ts:92-97, same Diagnostic type from src/diagnostics/diagnostic) and the inline predicate is clause-for-clause `diagnostics.some(isLoadParseError)`; the file already imports from ./helpers/e2e-s1 at line 8; the local helper is live (4 call sites); chronology holds (isLoadParseError added f0333c15 2026-09-12 as PTQ-0268's fix, file last touched 54e500ca 2026-09-05); docs/bugs and coverage-matrix greps → 0 hits on either name; not a gate test or recording double; distinct site from resolved PTQ-0268 (which covered annotation-/schema-body-nontype-text-refusal only) and from the same-wave sibling filings targeting other files (triage: claude-fable-5-1)
