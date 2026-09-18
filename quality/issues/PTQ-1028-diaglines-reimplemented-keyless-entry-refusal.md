---
id: PTQ-1028
title: tests/inline-object-keyless-entry-refusal.test.ts redeclares diagLines() instead of importing the export tests/helpers/e2e-s1.ts already carries
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-keyless-entry-refusal.test.ts:325-328
  - tests/helpers/e2e-s1.ts:289-292
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# tests/inline-object-keyless-entry-refusal.test.ts redeclares diagLines() instead of importing the export tests/helpers/e2e-s1.ts already carries

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
rendering every diagnostic as `` `${severity} ${code}: ${message}` `` in
emission order. `tests/inline-object-keyless-entry-refusal.test.ts` already
imports `parseDoc` from that same module (line 9) but does not import
`diagLines`; instead it declares a private, module-top-level `diagLines`
function carrying the identical doc comment and the identical one-line body
except for one added explicit parameter type on the map callback.

## Evidence

`tests/helpers/e2e-s1.ts:289-292` (re-read immediately before filing):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/inline-object-keyless-entry-refusal.test.ts:325-328` (re-read
immediately before filing):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}
```

The file's import line, `tests/inline-object-keyless-entry-refusal.test.ts:9`:
```ts
import { expectGroup as expectGroupShared, type DiagnosticCell, parseDoc, subagentTheta as theta, subagentParamsSrc } from "./helpers/e2e-s1";
```
already reads from `./helpers/e2e-s1` — `diagLines` is not among the named
imports — and the file separately imports the `Diagnostic` type
(`tests/inline-object-keyless-entry-refusal.test.ts:6`,
`import type { Diagnostic } from "../src/diagnostics/diagnostic";`) solely to
spell that one parameter annotation on the local copy.

## Why this is a problem
The two bodies compute the same projection from the same `ThetaDocument` type
over the same `Diagnostic` shape; the only difference is a redundant explicit
parameter type that changes nothing about the emitted strings. The sibling
file in this review's scope, `tests/inline-object-malformed-entry-resync.test.ts`,
imports `diagLines` from `./helpers/e2e-s1` directly (its own import line lists
`diagLines` among the named imports) and carries no local redeclaration,
showing the import is already the established route for a file at this same
review's fixture depth. A prior finding (PTQ-0802, now `status: fixed`) named
this exact root cause — a local `diagLines` redeclaration beside an unused
import of the canonical export — at
`tests/inline-object-malformed-entry-resync.test.ts:303-306` and at
`tests/inline-object-nested-lowering.test.ts:499-502`; neither of those
locations lists this file, and this file's own copy still stands unmigrated.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` is the natural home this file already imports six
other symbols from, observed rather than designed.

## False-positive check
Gate-pin: filename matches no `*gate*.test.ts` pattern. Recording-double:
`diagLines` is a pure projection, not a call-recording double, so the
negative-witness carve-out does not apply. docs/bugs/ signature search: this
file's own header cites bug 0244 and related reports for the DIAGNOSTIC
CONTENT under test, not for this rendering helper; no docs/bugs/ report
pins `diagLines` as a documented correct-reason red. coverage-matrix/bug-doc
citation search: `grep -rn "inline-object-keyless-entry-refusal" docs/reference/coverage-matrix.md docs/bugs/*.md` returns no hit naming this test by name in a witness list tied to the `diagLines` symbol, so no citation blocks a routine dedup. This finding is about test code that
exists (a redundant local declaration), not about a missing test, so it does
not drift into coverage.

## Triage
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:289-292 exports `diagLines(doc)` verbatim as excerpted and tests/inline-object-keyless-entry-refusal.test.ts:325-328 carries the local copy differing only by the `(d: Diagnostic)` annotation (that `Diagnostic` type import at :6 has no other use in the file — grep → :6 and :327 only), the copy is live (`lines()` at :331 calls it; 19/19 green) while the file's e2e-s1 import at :9 names five symbols but not `diagLines`; sibling malformed-entry-resync.test.ts:8 does import `diagLines` from e2e-s1 as claimed; no gate/recording-double/docs-bugs/coverage-matrix carve-out applies (0 hits for the file in coverage-matrix or docs/bugs tied to `diagLines`); not a duplicate — resolved PTQ-0205 named this file only in its "at least" roster (not `locations`) and its fix commit 2594cd44 touched zero lines of this file, so this is an unmigrated residual per the PTQ-0770/PTQ-0802 precedent, and the four open rows that cite this file (PTQ-0878/0951/0984/0989) cover fragment-builder/registryMessageOf/loweredParams/REGISTRY, mentioning `diagLines` only incidentally; note the same residual recurs in ~40 more tests/*.test.ts files (`grep -rl "^function diagLines" tests/` → 41), so the fixer may sweep siblings in one pass (triage: claude-fable-5-1)
