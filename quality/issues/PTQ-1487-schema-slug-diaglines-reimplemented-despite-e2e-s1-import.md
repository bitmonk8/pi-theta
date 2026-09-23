---
id: PTQ-1487
title: schema-slug-canonical-form-mints.test.ts reimplements e2e-s1's exported diagLines while already importing from e2e-s1
lens: D7
status: open
verdict: confirmed
locations:
  - tests/schema-slug-canonical-form-mints.test.ts:1-15
  - tests/schema-slug-canonical-form-mints.test.ts:206-210
  - tests/helpers/e2e-s1.ts:440-443
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# schema-slug-canonical-form-mints.test.ts reimplements e2e-s1's exported diagLines while already importing from e2e-s1

## Observation
`tests/schema-slug-canonical-form-mints.test.ts` imports `parseAndLowerAnnotation` and `parseDoc` from `./helpers/e2e-s1` (line 22), but declares its own local `diagLines(doc)` function rather than importing the module's already-exported `diagLines`. Both functions render each diagnostic identically: `` `${d.severity} ${d.code}: ${d.message}` ``, mapped in emission order.

## Evidence
tests/schema-slug-canonical-form-mints.test.ts:22
```ts
import { parseAndLowerAnnotation, parseDoc } from "./helpers/e2e-s1";
```

tests/schema-slug-canonical-form-mints.test.ts:206-210
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

tests/helpers/e2e-s1.ts:440-443
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(source: ThetaDocument | readonly Diagnostic[]): string[] {
  const diags = "diagnostics" in source ? source.diagnostics : source;
  return diags.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

The doc comment above both functions is even the same sentence verbatim ("Every diagnostic rendered `<severity> <code>: <message>`, in emission order."), and the render logic is identical for the `ThetaDocument` case the local copy handles.

## Why this is a problem
The file already has an import line reaching into `tests/helpers/e2e-s1.ts` for two other functions, so the exported `diagLines` in the same module was available at the same import site; the local copy is a second implementation of the identical rendering rule that a change to the diagnostic-line format (e.g. adding a range segment) would have to be applied to in two places to keep them in sync, with no test tying them together.

## Suggested direction (non-binding, optional)
The natural home for this rendering rule is the already-exported `diagLines` in `tests/helpers/e2e-s1.ts`, which this file already imports other helpers from.

## False-positive check
- Coverage-matrix / docs citation search: `tests/schema-slug-canonical-form-mints.test.ts` is cited by name in `docs/bugs/0099-schema-slug-hashes-stringify-not-canonical-form.md:845` and `docs/bugs/0292-validation-errors-array-not-canonically-ordered.md:211`; neither citation names the local `diagLines` helper, and this finding does not propose merging, renaming, or deleting the test file.
- Gate-pin check: file name does not match `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `diagLines` is a pure formatter, not a recording double; not applicable.
- docs/bugs/ signature search: `grep -rn "diagLines" docs/bugs` found no red-test-signature citation of this specific helper; not a documented correct-reason red.
- Confirmed by direct comparison of both functions' bodies and doc comments, re-read immediately before filing (excerpts above), that the two are the identical rule reimplemented rather than a semantic divergence.

## Triage
<!-- triage appends here -->
verdict: confirmed — excerpts reproduce (local `diagLines` at tests/schema-slug-canonical-form-mints.test.ts:207-209, canonical export at tests/helpers/e2e-s1.ts:440-443, same doc-comment sentence and identical render rule; the e2e-s1 import is at line 16, not 22 — line drift only); all five local call sites (225, 375, 378, 384, 391) pass a `ThetaDocument`, which the exported helper accepts, so the swap is a mechanical import change; not a gate test, not cited by coverage-matrix, `grep -ln schema-slug-canonical-form-mints quality/issues/*.md` finds no tracking issue and no prior diagLines filing (PTQ-0770/0973/1071/etc.) cites this file (triage: claude-fable-5-1)
