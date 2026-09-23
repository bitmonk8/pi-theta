---
id: PTQ-1323
title: inline-slug-name-reservation redefines diagLines/diagCodes locally despite the canonical e2e-s1 exports its own review sibling already imports
lens: D7
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-slug-name-reservation.test.ts:214-222
  - tests/helpers/e2e-s1.ts:436-439
  - tests/helpers/e2e-s1.ts:537-539
  - tests/inline-object-wire-name-rename-refusal.test.ts:14
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# inline-slug-name-reservation redefines diagLines/diagCodes locally despite the canonical e2e-s1 exports its own review sibling already imports

## Observation
tests/inline-slug-name-reservation.test.ts declares two module-private helper
functions, `diagLines` and `diagCodes`, whose bodies are one-line projections
of `doc.diagnostics` into comparison strings. tests/helpers/e2e-s1.ts exports
functions of the same names doing the same projection over the same shape.
tests/inline-object-wire-name-rename-refusal.test.ts — the other file in this
same review scope — imports `diagLines` directly from `./helpers/e2e-s1` and
carries no local redefinition, showing the canonical export is reachable and
already in use immediately alongside the file that reimplements it.

## Evidence
tests/inline-slug-name-reservation.test.ts:214-222
```ts
// ===========================================================================
// Reading a parsed document. Loud on every unexpected disposition.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

tests/helpers/e2e-s1.ts:436-439 (the canonical export, functionally identical
over a `ThetaDocument` argument):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(source: ThetaDocument | readonly Diagnostic[]): string[] {
  const diags = "diagnostics" in source ? source.diagnostics : source;
  return diags.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

tests/helpers/e2e-s1.ts:537-539 (the canonical `diagCodes`, byte-identical
body):
```ts
/** Every diagnostic rendered `<severity> <code>`, in emission order. */
export function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

tests/inline-object-wire-name-rename-refusal.test.ts:14 — the sibling file in
this same review scope, importing the canonical export directly and carrying
no local redefinition:
```ts
import { expectGroup as expectGroupShared, type DiagnosticCell, parseDoc, diagLines } from "./helpers/e2e-s1";
```

## Why this is a problem
Both functions in tests/inline-slug-name-reservation.test.ts are harness
plumbing — how a `ThetaDocument`'s diagnostics are rendered for string
comparison in `expect().toEqual()` — not domain logic specific to bug 0040.
tests/helpers/e2e-s1.ts already hosts `diagLines` and `diagCodes` under the
exact same names, and this review's own second file
(tests/inline-object-wire-name-rename-refusal.test.ts) already imports
`diagLines` from that module rather than defining it locally, which is direct
evidence the export was reachable at the time this file was written. The
local pair is therefore a copy-paste fixture re-implemented where the
canonical helper already exists, not a piece of bug-0040-specific logic.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts is the natural home for this projection, as observed by
the sibling file in this same review already drawing `diagLines` from it.

## False-positive check
- Gate-pin: tests/inline-slug-name-reservation.test.ts does not match
  `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); no pinned-count carve-out applies to a
  helper-function definition site.
- Recording-double: `diagLines`/`diagCodes` map an already-produced array and
  record no calls; the negative-witness carve-out for recording doubles that
  assert something was never called does not apply.
- docs/bugs/ signature search: `grep -rn "diagLines\|diagCodes"
  docs/bugs/0040-inline-slug-def-namespace-not-reserved.md` → 0 hits; the open
  bug document this file witnesses gives no rationale for a local
  redefinition of either helper.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-slug-name-reservation" docs/reference/coverage-matrix.md` → 0 hits.
  docs/bugs/0040's own text cites this file by name as its test witness
  (matching the fixture table and probed signatures in the file's header
  comment), but that citation pins the file's `it()`/`describe()` names and
  behaviour, not the definition site of an internal rendering helper; this
  finding proposes no change to any assertion, `it()` name, or count.
- Coverage check: the claim concerns a repeated function DEFINITION already
  covered by every diagnostic assertion in the file that calls it, not a
  missing test path.
- Prior finding overlap: `grep -rl "inline-slug-name-reservation"
  quality/resolved/` shows the file listed only in the "beyond the three
  quoted above" grep-hit enumeration of the already-fixed PTQ-0205
  ("diagLines/diagCodes redefine, verbatim, a diagnostics-rendering helper
  duplicated across dozens of test files"), with no individual line citation
  or excerpt for this file; re-reading the file at HEAD shows the
  duplication is still present at :214-222, so PTQ-0205's fix did not reach
  this site and this filing supplies the site-specific evidence that finding
  lacked.

## Triage
verdict: confirmed — independently re-verified: tests/inline-slug-name-reservation.test.ts:214-222 declares `diagLines`/`diagCodes` whose bodies match tests/helpers/e2e-s1.ts:436-439/537-539 (diagCodes byte-identical incl. doc comment; diagLines identical modulo e2e-s1's wider `ThetaDocument | readonly Diagnostic[]` param), the file already imports `parseDoc` from `./helpers/e2e-s1` (:10) but not either helper, in-file grep gives exactly 2 declarations with ~15 live call sites (:245-1008), 45/45 green; sibling tests/inline-object-wire-name-rename-refusal.test.ts:14 imports `diagLines` from e2e-s1 as claimed; stated searches reproduce (docs/bugs/0040 diagLines|diagCodes → 0, coverage-matrix file cite → 0), not a gate file, no recording double, no it()/describe() change proposed; dedupe clean — resolved PTQ-0205 named this file only in its "at least" roster (prior-tree :251, not `locations`) and its fix commit 2594cd44 touched zero lines of this file, no open row cites this file, and same-wave diagLines siblings (d7-01-stranded-entry, d7-02-tools-field, d7-04-b0263live, d7-06-params-default) cite different files, so this is an untracked residual under the accepted per-file convention (PTQ-0981/1027/1028/1071 confirmed on identical reasoning) — D7 boilerplate-duplication class with a mechanical import-swap fix (triage: claude-fable-5-1)
