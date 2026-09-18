---
id: PTQ-0770
title: Four in-scope live cells reimplement a local diagLines(text, path) though tests/helpers/e2e-s1.ts already exports diagLines(doc)
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:84-158
  - tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts:88-211
  - tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:91-170
  - tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:94-178
  - tests/helpers/e2e-s1.ts:100-102
sites: 5
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Four in-scope live cells reimplement a local diagLines(text, path) though tests/helpers/e2e-s1.ts already exports diagLines(doc)

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
which renders every diagnostic as `` `${severity} ${code}: ${message}` ``.
Four of the ten files in this review's scope each import `parseDoc` from that
same module (`tests/helpers/e2e-s1`) but do not import its `diagLines`;
instead each defines its own module-local function of the same name that
takes `(text, path)`, calls `parseDoc(text, path)` itself, and maps the
resulting `.diagnostics` through the identical rendering expression.

## Evidence
`tests/helpers/e2e-s1.ts:100-102` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:84,156-158`:
```ts
import { parseDoc } from "../helpers/e2e-s1";
...
function diagLines(text: string, path: string): string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts:88,209-211`:
```ts
import { parseDoc } from "../helpers/e2e-s1";
...
function diagLines(text: string, path: string): string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:91,168-170`
and `tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:94,176-178`
carry the identical local `diagLines(text, path)` body, re-read from each file
and matching the two excerpts above byte-for-byte in the map expression.

Search: `grep -n "^function diagLines"` across the ten in-scope files returns
exactly 4 hits, one per file listed above; each of those 4 files' own
`import ... from "../helpers/e2e-s1"` line names only `parseDoc`, never
`diagLines`.

## Why this is a problem
The four local functions do not diverge from the canonical helper in
rendering logic — `parseDoc(text, path).diagnostics.map(d => ...)` is exactly
`diagLines(parseDoc(text, path))` written out with the canonical helper's own
body substituted inline instead of called. All four sites already reach into
`tests/helpers/e2e-s1` for `parseDoc` in the same import statement the
canonical `diagLines` is exported from, so the reimplementation is not a case
of the helper being hard to find from these files.

## Suggested direction (non-binding, optional)
Each of the four sites could call the already-imported module's `diagLines`
directly (`diagLines(parseDoc(text, path))`) instead of restating the render
expression under a shadowing local declaration of the same name.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named
  gate kinds; not applicable.
- Recording-double check: not applicable — `diagLines` renders diagnostics
  for a positive assertion, not a MUST-NOT witness over recorded calls.
- docs/bugs/ signature search: `grep -rl "diagLines"` under `docs/bugs/`
  returns no hits; no documented correct-reason-red cites this local
  reimplementation.
- coverage-matrix/bug-doc citation search: the finding proposes no merge,
  rename, or deletion of any test — only that each site call the helper its
  own import statement already reaches — so the citation-pinning rule does
  not apply.
- Confirmed the canonical helper exists and is exported: `tests/helpers/e2e-s1.ts:100-102`,
  re-read immediately before filing.
- Confirmed this is not a coverage claim: every site already performs the
  equivalent diagnostic-line render; the observation is that four sites
  duplicate the canonical helper's body under a local declaration instead of
  importing it.

## Triage
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:100-102 exports diagLines(doc) verbatim as excerpted, and all four live cells carry a byte-identical `${d.severity} ${d.code}: ${d.message}` map under a local diagLines(text, path) at exactly the cited lines (b0244:156-158, b0252:209-211, b0256:168-170, b0257:176-178; each live with 2 callers) while each file's only `../helpers/e2e-s1` import names parseDoc alone; docs/bugs/ and coverage-matrix grep 0 hits for diagLines or these four files, no gate/recording-double carve-out applies; not a duplicate — resolved PTQ-0205's fix commit 2594cd44 touched zero tests/live/ files, so these pre-helper cells (2026-08-23/24) are unmigrated residuals per the PTQ-0240 precedent, and sibling d7-03 files a different live cell (triage: claude-fable-5-1)
