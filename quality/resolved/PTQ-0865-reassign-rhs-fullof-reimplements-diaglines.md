---
id: PTQ-0865
title: reassign-rhs-type-compat.test.ts's fullOf(doc) reimplements e2e-s1's exported diagLines(doc) under a different name
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/reassign-rhs-type-compat.test.ts:282-284
  - tests/helpers/e2e-s1.ts:100-102
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# reassign-rhs-type-compat.test.ts's fullOf(doc) reimplements e2e-s1's exported diagLines(doc) under a different name

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
whose body renders every diagnostic as `` `${severity} ${code}: ${message}` ``.
`tests/reassign-rhs-type-compat.test.ts` imports `parseDoc` from that same
module (`./helpers/e2e-s1`, line 7) but not `diagLines`, and instead declares
its own module-private `fullOf(doc)` whose body is the byte-identical
one-line map expression under a different name, then uses `fullOf` as the
sole whole-list-equality oracle across every emitting test cell in the file
(groups a, b, d, e, f, g, h and the closing template-rendering check).

## Evidence

`tests/helpers/e2e-s1.ts:100-102` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/reassign-rhs-type-compat.test.ts:282-284` (re-read immediately before filing):
```ts
/** `severity code: message` for every diagnostic, in emission order. */
function fullOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}
```

The two bodies produce the same string for the same input (the only textual
difference is the inline `Diagnostic` type annotation on the map callback's
parameter, immaterial at runtime). The file's import line, `tests/reassign-rhs-type-compat.test.ts:7`:
```ts
import { parseDoc } from "./helpers/e2e-s1";
```
names only `parseDoc`. Exact search: `grep -n "^function fullOf\|import.*helpers/e2e-s1" tests/reassign-rhs-type-compat.test.ts` → exactly one local `fullOf` declaration and one `e2e-s1` import that omits `diagLines`. `grep -rn "^function fullOf" tests/*.test.ts` → this is the only file in the suite declaring a function of this name, and it is a rename-only restatement of the already-exported `diagLines`, not a novel rendering.

## Why this is a problem
`fullOf`'s body is not a rendering this file needed independently — it is the
identical one-line `severity/code/message` projection `tests/helpers/e2e-s1.ts`
already exports as `diagLines`, restated under a different local name rather
than imported. The same class of duplication (a file locally redeclaring
`diagLines` under its own or the canonical name instead of importing the
already-exported helper) has already been confirmed and fixed at four other
sites (PTQ-0205, PTQ-0663, PTQ-0674); this file reproduces the identical
function BODY while additionally renaming it, which is why the prior filings'
`grep -rn "^function diagLines"`-style searches did not previously surface
this site.

## Suggested direction (non-binding, optional)
Adding `diagLines` to the file's existing `import { parseDoc } from
"./helpers/e2e-s1"` line and replacing the 30+ internal `fullOf(...)` call
sites with `diagLines(...)` would leave one body of this projection to keep
in sync with the helper's.

## False-positive check
- Gate-pin check: `tests/reassign-rhs-type-compat.test.ts` does not match `*gate*.test.ts` or any named gate kin; the cited lines are a rendering helper, not a pinned count or inventory.
- Recording-double check: `fullOf` maps an already-produced, already-returned diagnostics array for a positive whole-list comparison; it records no call and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "reassign-rhs-type-compat" docs/bugs/*.md` → the file is cited only in docs/bugs/0115's witness text at the level of the file/cells, never at this rendering-helper's definition line, and no citation states a rationale for a locally-renamed copy instead of the shared import.
- coverage-matrix/bug-doc citation search: `grep -n "reassign-rhs-type-compat" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no change to any `it()`/`describe()` name, count, or assertion — only to where the rendering function is defined — so no citation is affected.
- Prior-filing overlap check: `grep -rl "fullOf" quality/intake quality/issues quality/resolved` → 0 hits before this filing. The resolved PTQ-0205/PTQ-0663/PTQ-0674 each name a `diagLines`-named local redeclaration in other files (`params-inline-enum-position-refusal.test.ts`, `params-inline-object-lowering.test.ts`, `query-annotation-nontype-text-refusal.test.ts`); none cites `tests/reassign-rhs-type-compat.test.ts` or a function named `fullOf`. The resolved PTQ-0678 (same file) covers a disjoint root cause — the local `RegistryRow`/`REGISTRY` four-page read, already migrated to import from `tests/helpers/registry-oracle.ts` (confirmed present at this file's line 1 today) — and does not mention `fullOf`, `codesOf`, or `render`.
- Coverage check: the claim is about a repeated function DEFINITION, not a missing test path; the local copy is exercised by every one of the file's own currently-running assertions that call it.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: tests/reassign-rhs-type-compat.test.ts:282-284 declares module-private `fullOf(doc)` whose body, after a name-only substitution plus the inline `(d: Diagnostic)` annotation, diffs to zero against the exported `diagLines` in tests/helpers/e2e-s1.ts (now at :124-126 — the filing's :100-102 is 24 lines of drift, content matches verbatim); the file's sole e2e-s1 import (:7) names only `parseDoc`, `fullOf` is live with 12 call sites (the filing's "30+" is an overcount, immaterial), `grep -rln "^function fullOf" tests/` → this file only, docs/bugs cite the file only as a bug-0115/0205/0314/0341 witness at cell level (never this helper), coverage-matrix → 0 hits, `fullOf` → 0 prior hits across quality/; both locations under tests/, D7 boilerplate-duplication class, not a gate file, not a recording double, no merge/rename/delete proposed; not a duplicate — open PTQ-0770/0732/0733/0591 and resolved PTQ-0205/0663/0674 each track disjoint files restating `diagLines`, resolved PTQ-0678 (same file) covers the REGISTRY re-read only, and per the residual-site convention (PTQ-0732/0733/0770 precedents) each unmigrated file is its own site since the helper is already exported and the fix is a per-file import (triage: claude-fable-5-1)
