---
id: PTQ-1071
title: generic-argument-literal-lowering.test.ts redeclares diagLines(doc) byte-for-byte though it already imports parseDoc from the module exporting it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/generic-argument-literal-lowering.test.ts:14
  - tests/generic-argument-literal-lowering.test.ts:173-175
  - tests/helpers/e2e-s1.ts:289-292
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# generic-argument-literal-lowering.test.ts redeclares diagLines(doc) byte-for-byte though it already imports parseDoc from the module exporting it

## Observation
`tests/generic-argument-literal-lowering.test.ts` imports `parseDoc` from
`./helpers/e2e-s1` at its top import line, but rather than also importing
`diagLines` from the same module it declares its own module-scope
`function diagLines(doc: ThetaDocument): string[]` a few lines later. The
locally declared body is byte-for-byte identical to the one
`tests/helpers/e2e-s1.ts` already exports under the same name and the same
signature.

## Evidence
`tests/generic-argument-literal-lowering.test.ts:14`:
```ts
import { parseDoc } from "./helpers/e2e-s1";
```

`tests/generic-argument-literal-lowering.test.ts:173-175`:
```ts
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/helpers/e2e-s1.ts:289-292` (the export already available on the
import line this file uses):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

The two function bodies are character-for-character identical
(`doc.diagnostics.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`),
differing only in the `export` keyword and the doc comment.

## Why this is a problem
The file already reaches into `tests/helpers/e2e-s1.ts` for `parseDoc` on
its very first import line, so the module is already on its dependency
graph; adding `diagLines` to that same import would cost nothing. Instead
the identical rendering function is hand-retyped locally. A change to how a
diagnostic line is rendered for a failure message (for example altering the
`severity code: message` template) would need to be applied at both the
shared export and this file's private copy to keep the two in agreement.

## Suggested direction (non-binding, optional)
Adding `diagLines` to the existing `import { parseDoc } from "./helpers/e2e-s1"`
line and deleting the local declaration is the natural consolidation this
file's own import list already points toward.

## False-positive check
- Gate-pin check: the file name does not match `*gate*.test.ts` or any named
  gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: `diagLines` is a pure rendering function over a
  parsed document's diagnostics, not a recording double backing a
  MUST-NOT-called witness; not applicable.
- docs/bugs/ signature search: `grep -rl "diagLines" docs/bugs/*.md` → 0
  hits; no documented correct-reason red discusses this duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "generic-argument-literal-lowering" docs/reference/coverage-matrix.md` → 0
  hits. `docs/bugs/0164-generic-argument-literal-lowers-permissive.md` cites
  this file only by cell name (`d10`), never by the `diagLines` helper; this
  finding proposes no merge, rename, or deletion of any `it()`/`describe()`
  block or cell, only that the identical rendering helper be imported rather
  than redeclared.
- Overlap check: `grep -rli "diagLines" quality/issues/*.md
  quality/resolved/*.md` finds many prior "diagLines reimplemented instead of
  imported" filings (e.g. PTQ-0663, PTQ-0664, PTQ-0674, PTQ-0770, PTQ-0802,
  PTQ-0981, PTQ-0991 is unrelated, PTQ-0996, PTQ-1027, PTQ-1028), but none of
  their `locations` cites `tests/generic-argument-literal-lowering.test.ts`;
  this file's own copy is untracked by any of them.
- Coverage-drift check: this claim is about a repeated function DEFINITION
  already covered by an existing shared export the file already imports
  from, not about a missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: mktemp sed-range diff of tests/generic-argument-literal-lowering.test.ts:173-175 vs tests/helpers/e2e-s1.ts:290-292 (export keyword stripped) is byte-identical; the file's sole e2e-s1 import (:14) is `parseDoc` while the private `diagLines` is called at 10 sites (:210-1389); D7 boilerplate-duplication class with a mechanical anchor (identical copy of an export from a module already on the import line); no carve-out binds (not a *gate* file, not a recording double, docs/bugs diagLines grep → 0, coverage-matrix grep → 0, docs/bugs/0164:1163 cites the file by cell `d10` only and no it()/describe() is touched); not a duplicate — no open/resolved diagLines row lists this file in locations (PTQ-0691's three `diagLines` mentions are call sites inside its `loweredAnnotation` excerpt at :1390-1404, a different root cause), PTQ-0666/0793 cover other helpers in this file, and same-wave sibling d7-03 cites tests/params-block-mapping-rhs-refusal.test.ts, a different file; fix is the mechanical import-and-delete the candidate names (triage: claude-fable-5-1)
