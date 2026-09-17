---
id: PTQ-0684
title: blocksRegistration/deniesRegistration in both reserved-keyword refusal test files re-derive the already-exported tests/helpers/e2e-s1.ts isLoadParseError
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/reserved-keyword-misfire-faces.test.ts:285-301
  - tests/reserved-keyword-object-pattern-head-refusal.test.ts:218-234
  - tests/helpers/e2e-s1.ts:87-97
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# blocksRegistration/deniesRegistration in both reserved-keyword refusal test files re-derive the already-exported tests/helpers/e2e-s1.ts isLoadParseError

## Observation
Both files in this review's scope declare a local module-scope predicate —
`blocksRegistration` in `tests/reserved-keyword-misfire-faces.test.ts` and
`deniesRegistration` in `tests/reserved-keyword-object-pattern-head-refusal.test.ts`
— whose body is `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")))`.
Each carries a doc comment stating it "mirrors" the module-private production
`hasLoadParseError` because that function cannot be imported.
`tests/helpers/e2e-s1.ts` — the module both files already import `parseDoc`
from — exports `isLoadParseError(d: Diagnostic): boolean`, the identical
single-diagnostic predicate. Both local functions are exactly
`diagnostics.some(isLoadParseError)`.

## Evidence
`tests/reserved-keyword-misfire-faces.test.ts:285-301`:
```ts
/**
 * Whether `diagnostics` blocks registration. This replicates, by construction,
 * `hasLoadParseError` (src/extension/production-composition.ts) as applied
 * inside `parseDiscoveredTheta` in that file: it is module-private — `rg -n
 * 'export.*hasLoadParseError' src/` matches nothing — so it cannot be imported,
 * and the predicate is mirrored here the same way and for the same reason
 * tests/reserved-keyword-remaining-identifier-positions.test.ts and
 * tests/fn-param-name-reserved-keyword.test.ts mirror it.
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

`tests/reserved-keyword-object-pattern-head-refusal.test.ts:218-234`:
```ts
/**
 * Whether `diagnostics` denies registration. `hasLoadParseError`
 * (src/extension/production-composition.ts) is module-private — `rg -n
 * 'export.*hasLoadParseError' src/` matches nothing — so the predicate is
 * mirrored here clause for clause: error severity, and a code in the
 * `theta/load/` or `theta/parse/` namespace. It is the mechanism that turns
 * this fix's diagnostic into the refusal, so the runtime group asserts it
 * directly (the same mirror, for the same reason, as
 * tests/capitalised-bare-match-pattern-refusal.test.ts:271).
 */
function deniesRegistration(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (d) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}
```

`tests/helpers/e2e-s1.ts:87-97` — the exported single-diagnostic form of the
same predicate, already available to both files:
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

Both reviewed files already import from this module: `tests/reserved-keyword-misfire-faces.test.ts:10`
— `import { parseDoc } from "./helpers/e2e-s1";` — and
`tests/reserved-keyword-object-pattern-head-refusal.test.ts:11` — the same
import line.

## Why this is a problem
Each file's own doc comment justifies the local copy by naming the
module-private PRODUCTION function `hasLoadParseError` as unimportable — a
true claim — but neither comment addresses the TEST-SIDE export:
`tests/helpers/e2e-s1.ts` already carries `isLoadParseError`, performing the
identical per-diagnostic test, and both reviewed files already have a live
import statement from that same module. `blocksRegistration` and
`deniesRegistration` are not new predicates; each is
`Array.prototype.some` applied to `isLoadParseError`, re-derived locally in
two separate files rather than composed from the module they each already
import from. Each file's own comment additionally names OTHER local test
files (`tests/reserved-keyword-remaining-identifier-positions.test.ts`,
`tests/fn-param-name-reserved-keyword.test.ts`,
`tests/capitalised-bare-match-pattern-refusal.test.ts`) as the precedent it
mirrors, rather than the exported helper — so the mirroring lineage runs
test-file to test-file, with the already-exported canonical form standing
unused at both ends.

## Suggested direction (non-binding, optional)
`diagnostics.some(isLoadParseError)`, using the already-imported
`isLoadParseError` from `tests/helpers/e2e-s1.ts`, expresses the same
predicate both local functions compute.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds; not applicable.
- Recording-double check: `blocksRegistration`/`deniesRegistration` read an
  already-produced diagnostics array; neither records calls nor backs a
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "blocksRegistration\|deniesRegistration\|isLoadParseError" docs/bugs/`
  → 0 files; no open bug names this duplication or gives a documented
  correct-reason for keeping a second copy of the predicate.
- coverage-matrix/bug-doc citation search: `grep -n "reserved-keyword-misfire-faces.test.ts\|reserved-keyword-object-pattern-head-refusal.test.ts" docs/reference/coverage-matrix.md`
  → 0 hits. Both files are cited by name inside docs/bugs/0242 and
  docs/bugs/0219 respectively for their pinned cell ids, which read
  `blocksRegistration`'s/`deniesRegistration`'s boolean RESULT directly; this
  finding proposes no change to any `it()`/`describe()` name, count, or
  assertion, only to how the boolean each cell consumes is computed.
- Existing-helper verification: `isLoadParseError`'s body was read directly
  from `tests/helpers/e2e-s1.ts:92-97` and compared clause-by-clause against
  both local predicates' inline bodies; all three test `severity === "error"`
  and `code.startsWith("theta/load/") || code.startsWith("theta/parse/")`
  with no additional or missing clause.
- Prior-filing search: `grep -rl "isLoadParseError" quality/intake/*.md` shows
  one existing filing (`qw20260917154546-d7-04-blocksregistration-reimplements-isloadparseerror.md`)
  covering the same predicate reimplemented in a DIFFERENT file
  (`tests/fn-param-name-reserved-keyword.test.ts`, outside this review's
  scope); that filing does not cite either of this review's two files, so
  this is a separate instance of the same underlying class, not a duplicate.
  A second existing filing
  (`qw20260917154546-d7-110-02-diagshape-diagnostic-assertion-harness-duplicated.md`)
  cites `tests/reserved-keyword-object-pattern-head-refusal.test.ts:228` for
  its `deniesRegistration` declaration, but as one member of a
  cross-file-duplication root cause (the shared `DiagShape`/`shapes`/`render`
  scaffold repeated across six sibling files, for which no canonical helper
  yet exists); this finding's root cause is different — a canonical helper
  (`isLoadParseError`) already exists and is already imported into both
  files, and the local predicate is a re-derivation of it, not a
  not-yet-extracted scaffold.
- Coverage check: the claim is about a repeated predicate DEFINITION, not a
  missing test path; both local predicates are exercised by every consuming
  assertion in their respective files today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines, both local predicates are byte-equivalent to `diagnostics.some(isLoadParseError)` with 8 and 3 live callers, both files already import from `./helpers/e2e-s1` (lines 10/11) yet neither references `isLoadParseError` (0 hits each); `isLoadParseError` was exported in f0333c15 (2026-09-12, PTQ-0268's fix) after both files were authored (2026-08-21/22), and the local comments' "`export.*hasLoadParseError` matches nothing" justification is itself now stale (src/extension/production-discovered-theta.ts:33 exports it); docs/bugs/ and coverage-matrix.md searches reproduce at 0 hits; not a duplicate — resolved PTQ-0268 covers two different files, the five sibling intake filings each cite a distinct file, and d7-110-02 cites this range only as part of a DiagShape/shapes/render scaffold root cause (triage: claude-fable-5-1)
