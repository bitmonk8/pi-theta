---
id: PTQ-1027
title: annotation-root-brace-union-lowering.test.ts redeclares e2e-s1's exported diagLines instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-root-brace-union-lowering.test.ts:16-17
  - tests/annotation-root-brace-union-lowering.test.ts:418-421
  - tests/helpers/e2e-s1.ts:289-292
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# annotation-root-brace-union-lowering.test.ts redeclares e2e-s1's exported diagLines instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc)` — "Every diagnostic
rendered `<severity> <code>: <message>`, in emission order." —
byte-identical to a private `diagLines` function
`tests/annotation-root-brace-union-lowering.test.ts` declares itself. The
file already imports three other named exports from `./helpers/e2e-s1`
(`loadSchemaDecls`, `loadCleanly as loadCleanlyShared`, `parseDoc`) on the
same import line, so the module is already a dependency of this file; only
`diagLines` was left out and retyped locally instead.

## Evidence

tests/annotation-root-brace-union-lowering.test.ts:16-17 — the file's actual
import from `./helpers/e2e-s1`, `diagLines` absent from the named list:
```ts
import { loadSchemaDecls, loadCleanly as loadCleanlyShared, parseDoc, type LoadedParams } from "./helpers/e2e-s1";
import { assertKeysSorted, inlineDefName, slugOfCanonicalForm, refNames } from "./helpers/canonical-slug-oracle";
```

tests/annotation-root-brace-union-lowering.test.ts:418-421 — the local
redeclaration:
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

tests/helpers/e2e-s1.ts:289-292 — the exported original, same doc comment,
same body:
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

The local copy is live: `grep -n "diagLines(" tests/annotation-root-brace-union-lowering.test.ts`
returns 9 hits — the declaration at :419 plus 8 call sites, including :721,
:722, :976, :977, :1002, :1003, :1013, :1014.

## Why this is a problem
The function name, doc comment, and body are identical between the two
sites, and the file's own import statement already reaches into the same
module for three siblings, so nothing about the module boundary or the
function's shape motivated a local copy. A change to how a diagnostic line is
rendered (e.g. an added field) needs the same hand-edit applied in both this
file and `e2e-s1.ts`, and this file's copy carries no marker that would
surface a drift between the two if only one were changed.

## Suggested direction (non-binding, optional)
Adding `diagLines` to the existing `import { loadSchemaDecls, loadCleanly as
loadCleanlyShared, parseDoc, ... } from "./helpers/e2e-s1"` line and deleting
the local declaration is the substitution the file's own import list already
points toward.

## False-positive check
- Gate-pin check: `annotation-root-brace-union-lowering.test.ts` does not
  match `*gate*.test.ts` or the named gate kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited lines are a diagnostic-line
  formatter, not a pinned count or inventory.
- Recording-double check: `diagLines` renders a static mapping over
  `doc.diagnostics`; it records no call and backs no "never called"
  assertion, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "diagLines" docs/bugs/*.md` → 0
  hits; no documented correct-reason red names this helper's shape.
- coverage-matrix/bug-doc citation search: `grep -n
  "annotation-root-brace-union-lowering" docs/reference/coverage-matrix.md` →
  0 hits. `grep -rl "annotation-root-brace-union-lowering"
  docs/bugs/*.md` returns docs/bugs/0053 (the file's own bug) and nine other
  bug docs that cite the file only for a same-commit line-citation
  re-derivation of unrelated production code — none pins the `diagLines`
  declaration itself or requires it to stay local. This finding proposes no
  merge, rename, or deletion of the file or any `it()`/`describe()` block —
  only that the local formatter import the existing export.
- Prior-filing overlap check: `grep -rl "function diagLines"
  quality/issues/*.md quality/resolved/*.md quality/intake/*.md` returns many
  entries for OTHER test files (e.g. PTQ-0770, PTQ-0877, PTQ-0981, PTQ-0996,
  PTQ-0663, PTQ-0664, PTQ-0674, PTQ-0802); none of those cites
  `tests/annotation-root-brace-union-lowering.test.ts` as a location. The
  sibling finding PTQ-0691 (open) tracks this same file's `loweredAnnotation`
  helper but does not mention `diagLines`. This file's copy is therefore an
  untracked instance of the wider `diagLines`-reimplemented pattern, cited
  here on its own facts rather than as a repo-wide count.
- Coverage-drift check: the claim is about a repeated formatter-function
  DECLARATION, not a missing test path; the local copy is exercised by 8 call
  sites across the file's already-passing tests.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the local `diagLines` at tests/annotation-root-brace-union-lowering.test.ts:418-421 is byte-identical (doc comment + body) to the export at tests/helpers/e2e-s1.ts:289-292, the file's sole e2e-s1 import (:16) names `loadSchemaDecls`/`loadCleanly as loadCleanlyShared`/`parseDoc`/`LoadedParams` but not `diagLines`, in-file grep returns exactly one declaration (:419) plus 8 live call sites (:721/:722/:976/:977/:1002/:1003/:1013/:1014), 33/33 green; stated searches reproduce (docs/bugs `diagLines` → 0, coverage-matrix file cite → 0), not a gate file, no recording double, no merge/rename/delete proposed; dedupe clean — PTQ-0205 (fixed) named this file only in its "at least" roster (at prior-tree :455) and its fix commit 2594cd44 touched this file solely for the PTQ-0212 `loadCleanly` migration (import line + `loadCleanly` body), leaving `diagLines` local with no stays-local marker in either file, so it is an untracked residual under the accepted per-file convention (PTQ-0981/0996/0877/0802 confirmed on identical reasoning); the six other quality files citing this file (PTQ-0691/0750/0793/0794/0879, intake d7-01-expectrefsclosed) track disjoint `loweredAnnotation`/registry/slug/`loadCleanly`/`expectRefsClosed` helpers and no same-wave sibling cites this file's `diagLines` — D7 boilerplate-duplication class with a mechanical import-swap fix (triage: claude-fable-5-1)
