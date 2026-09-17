---
id: PTQ-0727
title: registers() in type-name-as-value-refusal.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/type-name-as-value-refusal.test.ts:375-390
  - tests/helpers/e2e-s1.ts:87-97
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# registers() in type-name-as-value-refusal.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError

## Observation
tests/type-name-as-value-refusal.test.ts declares a local
`registers(doc: ThetaDocument): boolean` whose body is
`!doc.diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")))`.
tests/helpers/e2e-s1.ts — the module this same file already imports `parseDoc`
and `committedThetaSources`-adjacent helpers from (line 30:
`import { parseDoc } from "./helpers/e2e-s1";`) — exports
`isLoadParseError(d: Diagnostic): boolean`, the identical single-diagnostic
predicate. `registers(doc)` is exactly `!doc.diagnostics.some(isLoadParseError)`.

## Evidence

tests/type-name-as-value-refusal.test.ts:375-390 (re-read immediately before filing):
```ts
/**
 * `hasLoadParseError`'s predicate (src/extension/production-composition.ts —
 * module-private, so restated rather than imported), evaluated over the
 * diagnostics a fixture actually emitted: a theta registers unless some
 * diagnostic is an error-severity `theta/load/*` or `theta/parse/*`. This is the
 * reachability link between the refusal and a theta that does not run — the
 * whole reason the bug is a load hazard and not a diagnostic-correctness
 * question. Warnings never block registration.
 */
function registers(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some(
    (d: Diagnostic) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}
```

tests/helpers/e2e-s1.ts:87-97 (re-read immediately before filing), the exported single-diagnostic form of the same predicate:
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

The file's own comment justifies restating `hasLoadParseError` (a
module-private production function) rather than importing it — but
`isLoadParseError` is not that production function; it is an already-exported
test helper carrying the exact same boolean clauses, imported from the same
module this file already draws `parseDoc` from. The two predicates test
identical conditions with no additional or missing clause: both check
`d.severity === "error"` and `(d.code.startsWith("theta/load/") ||
d.code.startsWith("theta/parse/"))`.

Pattern-wide search: `grep -n "^function registers" tests/*.test.ts` finds
this same predicate body independently declared as `registers`/
`registersCleanly` in nine further files outside this review's scope
(tests/b0341-inferred-literal-binding-refuses-primitive-rhs.test.ts,
tests/fn-param-sink-array-literal.test.ts,
tests/inline-object-field-name-case.test.ts,
tests/inline-object-field-name-comparison-key.test.ts,
tests/inline-object-quoted-field-name-refusal.test.ts,
tests/inline-object-wire-name-rename-refusal.test.ts,
tests/nested-array-element-sink-descent.test.ts,
tests/schema-field-name-case.test.ts,
tests/inline-object-malformed-entry-resync.test.ts, the last already filed
this wave as qw20260917154546-d7-67-malformed-entry-resync-registers-reimplements-isloadparseerror.md);
this finding is confined to the one site inside this review's assigned scope
(tests/type-name-as-value-refusal.test.ts).

## Why this is a problem
`isLoadParseError` is not a narrower or differently-scoped predicate than the
one `registers` computes: both test the identical two clauses. The file's own
comment gives a reason to avoid importing the module-private production
function `hasLoadParseError` directly — a real, stated design choice — but
that reason does not extend to the already-exported test helper of the same
name-adjacent shape, which the file could reach through an import it already
has open.

## Suggested direction (non-binding, optional)
`!doc.diagnostics.some(isLoadParseError)`, using `isLoadParseError` imported
from `tests/helpers/e2e-s1.ts` (already imported in this file for `parseDoc`),
expresses the same predicate `registers` computes today.

## False-positive check
- Gate-pin check: tests/type-name-as-value-refusal.test.ts does not match
  `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate).
- Recording-double check: `registers` reads an already-produced diagnostics
  array; it records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "registers" docs/bugs/0140-bare-schema-reference-value-position-silent.md`
  shows the doc's own §Observed-at prose using "registers"/"registration" as a
  narrative concept (the theta loading or not), never naming or requiring a
  restated boolean predicate rather than an imported one; no correct-reason-red
  signature matches this claim.
- coverage-matrix/bug-doc citation search: `grep -n
  "type-name-as-value-refusal" docs/reference/coverage-matrix.md docs/bugs/*.md`
  finds no coverage-matrix hit and no docs/bugs citation of this file by name
  (the file is bug 0140's own new witness, not a witness cited from another
  bug doc); this finding proposes no change to any `it()`/`describe()` name,
  count, or assertion — only to where the boolean predicate `registers`
  computes is derived — so no cited witness cell is disturbed.
- Prior-filing overlap check: `grep -rl "isLoadParseError" quality/intake/*.md
  quality/resolved/*.md` finds three prior candidates on different local
  function names in different files
  (qw20260917154546-d7-01-blocksregistration-reimplements-isloadparseerror-in-remaining-positions.md,
  qw20260917154546-d7-02-blocksregistration-reimplements-isloadparseerror-in-index-element-alias.md,
  qw20260917154546-d7-67-malformed-entry-resync-registers-reimplements-isloadparseerror.md,
  qw20260917154546-d7-130-01-blocksregistration-deniesregistration-reimplement-isloadparseerror.md)
  and one resolved (PTQ-0268); the qw20260917154546-d7-67 filing explicitly
  lists tests/type-name-as-value-refusal.test.ts among nine further sites of
  the same class but explicitly confines itself to its own file's site, so
  this filing is the first to address the site inside
  tests/type-name-as-value-refusal.test.ts specifically.
- Coverage check: the claim is about a repeated predicate DEFINITION, not a
  missing test path; `registers` is exercised throughout groups (a)/(d)/(e) in
  the file today.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (registers at tests/type-name-as-value-refusal.test.ts:375-390; exported isLoadParseError at tests/helpers/e2e-s1.ts:87-97, same Diagnostic type) and the inline predicate is clause-for-clause `!doc.diagnostics.some(isLoadParseError)`; the file already imports from ./helpers/e2e-s1 (line 30) yet never references isLoadParseError (0 hits); `registers` is live at 4 call sites (:777/:1138/:1202/:1401); chronology holds (file authored 40315587 2026-08-20, helper landed f0333c15 2026-09-12 as PTQ-0268's fix, so this is an unmigrated copy); the local comment's "module-private" premise is itself stale (hasLoadParseError exported at src/extension/production-discovered-theta.ts:33); `grep '^function registers' tests/*.test.ts` reproduces the 10-file pattern; not a gate file, no recording double, no it()/describe() touched — the candidate's "no docs/bugs citation of this file" claim is wrong (10 bug docs cite it, e.g. 0140:962, 0224:77 cell g9) but they pin it() cells, never the `registers` helper body, so the witness carve-out does not apply; D7 boilerplate-duplication in tests/ only; not a duplicate — resolved PTQ-0268 covers annotation-/schema-body-nontype-text-refusal and same-wave siblings d7-01/d7-02/d7-04/d7-130-01/d7-67 each cite a distinct file (per-file convention, four already confirmed) (triage: claude-fable-5-1)
