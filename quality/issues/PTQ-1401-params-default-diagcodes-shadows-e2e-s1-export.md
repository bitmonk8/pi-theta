---
id: PTQ-1401
title: params-default-string-literal-raw-newline and params-default-unresolvable-enum-variant redeclare diagCodes (and the first also diagLines) though both already import from the module exporting them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-default-string-literal-raw-newline.test.ts:8
  - tests/params-default-string-literal-raw-newline.test.ts:311-319
  - tests/params-default-unresolvable-enum-variant.test.ts:6
  - tests/params-default-unresolvable-enum-variant.test.ts:609-612
  - tests/helpers/e2e-s1.ts:436-439
  - tests/helpers/e2e-s1.ts:537-539
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# params-default-string-literal-raw-newline and params-default-unresolvable-enum-variant redeclare diagCodes (and the first also diagLines) though both already import from the module exporting them

## Observation
`tests/helpers/e2e-s1.ts` exports `diagCodes(doc)` (renders every diagnostic as
`"<severity> <code>"`) and `diagLines(doc)` (renders every diagnostic as
`"<severity> <code>: <message>"`). Both in-scope files already import other
names from `./helpers/e2e-s1` at their top import line, yet both declare their
own local `diagCodes` a few hundred lines later with a body byte-identical to
the exported one; `params-default-string-literal-raw-newline.test.ts` also
declares its own local `diagLines` whose body produces the same rendering as
the exported `diagLines` for a `ThetaDocument` input. Neither file imports
`diagCodes` (or, for the first file, `diagLines`) from `./helpers/e2e-s1`.

## Evidence

`tests/helpers/e2e-s1.ts:436-439` (exported):
```ts
export function diagLines(source: ThetaDocument | readonly Diagnostic[]): string[] {
  const diags = "diagnostics" in source ? source.diagnostics : source;
  return diags.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/helpers/e2e-s1.ts:537-539` (exported):
```ts
export function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

`tests/params-default-string-literal-raw-newline.test.ts:8` (the file's only
import from this module):
```ts
import { parseDoc, fieldOf } from "./helpers/e2e-s1";
```

`tests/params-default-string-literal-raw-newline.test.ts:311-319` (local
redeclaration, ~300 lines after the import above):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

`tests/params-default-unresolvable-enum-variant.test.ts:6` (the file's import
from this module):
```ts
import { parseDeps } from "./helpers/e2e-s1";
```

`tests/params-default-unresolvable-enum-variant.test.ts:609-612` (local
redeclaration, ~600 lines after the import above):
```ts
/** Every diagnostic rendered `<severity> <code>`, in emission order. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

Exact search: `grep -n "^function diagCodes\|^function diagLines" tests/params-default-string-literal-raw-newline.test.ts tests/params-default-unresolvable-enum-variant.test.ts` → 3 hits (2 in the first file, 1 in the second), all local declarations rather than imports of the module-level export already in scope in the same file.

## Why this is a problem
Each in-scope file already draws other helpers from `./helpers/e2e-s1` in its
own top import line, so the module is on its module graph; each file then
re-derives, rather than imports, a rendering helper that module already
exports under the identical name and an identical (for `diagCodes`) or
equivalent-for-the-narrowed-input-type (for `diagLines`) body. A change to how
a diagnostic renders for these assertions — e.g. widening the format string —
would need the same edit applied independently in the shared module and in
each of these two local copies to stay consistent, inside this file pair
alone.

## Suggested direction (non-binding, optional)
Both files could add `diagCodes` (and the first, `diagLines`) to their
existing `./helpers/e2e-s1` import and drop the local declarations, as sibling
in-scope-adjacent files already do.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin
  (census/pin gates); not applicable.
- Recording-double check: `diagCodes`/`diagLines` project a real diagnostics
  array into comparison strings; neither is a recording double asserting a
  MUST-NOT-call; not applicable.
- docs/bugs/ signature search: `grep -rn "params-default-string-literal-raw-newline\|params-default-unresolvable-enum-variant" docs/bugs/` hits docs/bugs/0102 and docs/bugs/0185 and docs/bugs/0197, none of which cites the `diagCodes`/`diagLines` helper declarations or their line ranges — the citations are to the bug's reproduction rows, not to this helper duplication.
- coverage-matrix / bug-doc citation search: `grep -n "params-default-string-literal-raw-newline\|params-default-unresolvable-enum-variant" docs/reference/coverage-matrix.md` → no hits; this finding proposes no merge, rename or deletion of any cited test, cell or file — only that the two local helper declarations be replaced by an import already available in the same file.
- Not a coverage claim: the finding is about helper code that exists and duplicates an already-exported helper, not about anything untested.
- Distinct from prior filings: PTQ-0658 and PTQ-0499 (both `status: fixed`) covered these same two files' `RegistryRow`/`REGISTRY` redeclaration, which both files now resolve by importing `./helpers/registry-oracle` (confirmed present at HEAD); PTQ-0660/0674/0664/0798/0205/0274 cover the same `diagCodes`/`diagLines` shadow-of-e2e-s1-export pattern in other, disjoint test files (`params-default-trailing-residue-refusal.test.ts`, `params-default-type-compat.test.ts`, `params-default-unary-minus-non-numeric-refusal.test.ts`, `query-annotation-nontype-text-refusal.test.ts`, and others) — none of those filings cites `params-default-string-literal-raw-newline.test.ts` or `params-default-unresolvable-enum-variant.test.ts`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three local declarations reproduce at the cited lines (raw-newline:312/317, unresolvable-enum-variant:610) with bodies identical to the exported `diagCodes` (e2e-s1.ts:537-539) and rendering-equivalent to `diagLines` (e2e-s1.ts:436-439); both files already import from `./helpers/e2e-s1` (lines 8 and 6) without pulling these names; both copies are live (19/21 call sites); no prior diagLines/diagCodes filing (PTQ-0663/0664/0674/0770/0798/0799/0877/1071/0973) cites either file and PTQ-0658/0499 covered only the REGISTRY redeclaration (now fixed); bug doc 0102 cites a `diagCodes` assertion, not the helper declaration, so the import-instead-of-redeclare fix touches no coverage-matrix/witness list — D7 boilerplate duplication under tests/ (triage: claude-fable-5-1)
