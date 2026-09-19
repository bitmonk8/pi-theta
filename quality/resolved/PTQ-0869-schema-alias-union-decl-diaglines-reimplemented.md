---
id: PTQ-0869
title: schema-alias-union-decl.test.ts redeclares diagLines() byte-identically to the exported tests/helpers/e2e-s1.ts helper it does not import
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/schema-alias-union-decl.test.ts:448-451
  - tests/helpers/e2e-s1.ts:123-126
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# schema-alias-union-decl.test.ts redeclares diagLines() byte-identically to the exported tests/helpers/e2e-s1.ts helper it does not import

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc)`, which renders every diagnostic on a `ThetaDocument` as `<severity> <code>: <message>` in emission order. `tests/schema-alias-union-decl.test.ts` already imports `codes` and `parseDoc` from this same module (`./helpers/e2e-s1`), but declares its own local `diagLines` function with the identical doc-comment wording and identical one-line body rather than importing the export.

## Evidence
`tests/helpers/e2e-s1.ts:123-126` (the canonical export, re-read immediately before filing):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/schema-alias-union-decl.test.ts:448-451` (re-read immediately before filing — the doc comment and the body are byte-identical to the export above, only the `export` keyword is absent):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/schema-alias-union-decl.test.ts:1` and `:12` (the file's existing import from the same module, showing the export is already one `import` away):
```ts
import { REGISTRY } from "./helpers/registry-oracle";
...
import { codes, parseDoc } from "./helpers/e2e-s1";
```

## Why this is a problem
The file already imports two other exports from `./helpers/e2e-s1` in the same import statement that carries `diagLines`, so no new module dependency is required to use it. The local declaration is not a variant tailored to this file's needs — the doc comment and the function body are byte-for-byte identical to the exported version — so it is a second copy of the same rendering logic rather than a difference in behaviour. Every one of this file's ~100 assertions against `diagLines(doc)` output depends on this rendering staying in lockstep with the shared one; a change to the shared renderer's format would not automatically reach this file's copy.

## Suggested direction (non-binding, optional)
Adding `diagLines` to the existing `import { codes, parseDoc } from "./helpers/e2e-s1"` line and deleting the local declaration would remove this copy without touching any assertion.

## False-positive check
- Gate-pin check: `tests/schema-alias-union-decl.test.ts` does not match `*gate*.test.ts` or the named gate-kin patterns; the cited lines are a diagnostic-rendering utility, not a pinned count or inventory.
- Recording-double check: not applicable — `diagLines` maps an already-produced diagnostics array to strings; it records no calls and witnesses nothing.
- docs/bugs/ signature search: `grep -n "diagLines" docs/bugs/0033-body-level-schema-alias-unsupported.md` → 0 hits; the bug doc states no rationale for a locally re-typed renderer.
- coverage-matrix/bug-doc citation search: `grep -n "schema-alias-union-decl" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no change to any `it()`/`describe()` name, count, or assertion, only to where the `diagLines` function body is sourced from.
- Overlap check: `grep -rl "schema-alias-union-decl" quality/intake/*diaglines* quality/issues/*diaglines* quality/resolved/*diaglines*` → 0 hits; the many existing `diagLines`-reimplemented filings (this wave and prior, e.g. PTQ-0591, PTQ-0732, PTQ-0733, PTQ-0770, qw20260918050411-d7-01/-02/-03/-08) each name a different file or file pair, none of them this one, so this is a distinct, previously untracked site of the same recognised root cause.
- Coverage check: the claim is about a repeated function DEFINITION; the local `diagLines` is exercised by nearly every assertion in the file, and no behaviour path is claimed untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:123-126 exports diagLines(doc) and tests/schema-alias-union-decl.test.ts:448-451 carries a local declaration that diffs byte-identical after stripping `export` (sed-extract + diff → 0 lines), live at 81 call sites, while the file's only e2e-s1 import (:12) names codes and parseDoc alone; both locations under tests/, D7 boilerplate-duplication class, not a *gate* file, not a recording double, stated searches reproduce (docs/bugs/0033 diagLines → 0; coverage-matrix file cite → 0), no merge/rename/delete proposed; not a duplicate — resolved PTQ-0205's fix commit 2594cd44 touched 0 lines of this file (created 2026-08-01, f959f8de), no diagLines PTQ (0205/0591/0663/0664/0674/0732/0733/0770) names it, and same-wave siblings d7-01/d7-03/d7-57-03 on this file cite msg()/loadParams() root causes with diagLines appearing only inside their excerpts — an untracked per-file residual ruled distinct per the PTQ-0663/0664/0732/0733 convention; mechanical dedupe (triage: claude-fable-5-1)
