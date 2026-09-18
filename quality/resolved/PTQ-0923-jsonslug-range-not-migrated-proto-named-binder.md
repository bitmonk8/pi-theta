---
id: PTQ-0923
title: proto-named-binder-write-sites.test.ts retypes jsonSlug/range locally despite already importing the sibling helpers from tests/helpers/proto-named-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/proto-named-binder-write-sites.test.ts:18
  - tests/proto-named-binder-write-sites.test.ts:103-106
  - tests/proto-named-binder-write-sites.test.ts:114-116
  - tests/helpers/proto-named-harness.ts:7-10
  - tests/helpers/proto-named-harness.ts:31-33
  - tests/proto-named-record-write-sites.test.ts:27
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# proto-named-binder-write-sites.test.ts retypes jsonSlug/range locally despite already importing the sibling helpers from tests/helpers/proto-named-harness.ts

## Observation
`tests/proto-named-binder-write-sites.test.ts` imports `hasOwn` and
`prototypeReport` from `./helpers/proto-named-harness` at its top, but
locally redeclares two more functions the SAME helper module exports —
`jsonSlug` (a `SchemaSlugFn` reducing a schema to its own JSON bytes) and
`range` (a throwaway `SourceRange` builder) — instead of importing them too.
The sibling file in this review's own scope,
`tests/proto-named-record-write-sites.test.ts`, imports all four names
(`jsonSlug, hasOwn, prototypeReport, range`) from the exact same helper
module in one line.

## Evidence

`tests/proto-named-binder-write-sites.test.ts:18` — the file already imports
two of the four names from the shared helper:
```ts
import { hasOwn, prototypeReport } from "./helpers/proto-named-harness";
```

`tests/proto-named-binder-write-sites.test.ts:103-106` — `jsonSlug` retyped
locally rather than imported:
```ts
const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

`tests/proto-named-binder-write-sites.test.ts:114-116` — `range` retyped
locally rather than imported:
```ts
function range(line: number): SourceRange {
  return { start: { line, column: 1 }, end: { line, column: 2 } };
}
```

`tests/helpers/proto-named-harness.ts:7-10` — the canonical `jsonSlug`,
byte-identical in body to the local copy above:
```ts
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

`tests/helpers/proto-named-harness.ts:31-33` — the canonical `range`,
identical in shape and semantics (only the `end.column` sentinel value
differs, 10 vs. the local copy's 2 — a difference with no effect on any cell,
since every caller in both files reads only `range(...).start.line`):
```ts
export function range(line: number): SourceRange {
  return { start: { line, column: 1 }, end: { line, column: 10 } };
}
```

`tests/proto-named-record-write-sites.test.ts:27` — the sibling file in this
review's scope imports all four names, including the two the reviewed file
retypes:
```ts
import { jsonSlug, hasOwn, prototypeReport, range } from "./helpers/proto-named-harness";
```

Search: `grep -n "^const jsonSlug\|^function range(" tests/proto-named-binder-write-sites.test.ts` → exactly the two declarations cited above; `grep -n "jsonSlug\|hasOwn\|prototypeReport\|range" tests/proto-named-binder-write-sites.test.ts | head -1` confirms the file's only import from the helper module is the one line quoted (line 18).

## Why this is a problem
`tests/helpers/proto-named-harness.ts` exports exactly four names —
`jsonSlug`, `hasOwn`, `prototypeReport`, `range` — created (per
`git log -- tests/helpers/proto-named-harness.ts`, commit `71039544`) as the
fix for two earlier confirmed findings in this same lineage
(`PTQ-0730`, the `hasOwn`/`prototypeReport` duplication, and `PTQ-0671`, the
`jsonSlug`/`hasOwn`/`range` duplication). That same commit edited
`tests/proto-named-binder-write-sites.test.ts` (removing 23 lines) to add the
`hasOwn`/`prototypeReport` import shown above, but left the file's own
`jsonSlug` and `range` declarations in place rather than migrating them onto
the same import line — an incomplete migration of the exact functions the
helper module exists to centralise, still standing beside the two functions
that WERE migrated in the same file.

## Suggested direction (non-binding, optional)
Extending line 18's import to `import { jsonSlug, hasOwn, prototypeReport, range } from "./helpers/proto-named-harness";` and deleting the two local declarations is the same move the sibling file already made.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or a named gate kin; the cited lines are harness-primitive declarations, not a pinned count or inventory.
- Recording-double check: neither `jsonSlug` nor `range` is a recording double backing a "never called" MUST-NOT witness; `jsonSlug` is a pure content-addressing function and `range` a pure builder. The carve-out does not apply.
- docs/bugs/ signature search: `grep -n "jsonSlug\|function range" docs/bugs/0214-defaulting-and-inference-drop-the-proto-named-key.md` → 0 hits; the bug doc discusses the `__proto__`-drop defect these cells witness, not this helper-migration shape.
- coverage-matrix/bug-doc citation search: `grep -n "proto-named-binder-write-sites" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block, and touches none of the file's RED/CONTROL pin cells — only where two harness-primitive declarations live.
- Prior-filing search: `grep -rl "proto-named-binder-write-sites" quality/intake quality/issues quality/resolved` hits only the resolved `PTQ-0730` (the `hasOwn`/`prototypeReport` triplication, now fixed by the same commit that created the helper module) — no open or resolved filing names the `jsonSlug`/`range` residue left behind by that same fix.
- Coverage check: the claim is about two duplicated helper-primitive DEFINITIONS left over from an already-landed migration; every cell in the file that calls either function passes (or reds for its documented bug-0214 reason) using its own local copy.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both local declarations sit at the cited lines (`const jsonSlug` :103-106, `function range` :114-116), the file's sole helper import is :18 `{ hasOwn, prototypeReport }`, the canonical exports reproduce at tests/helpers/proto-named-harness.ts:7-10 (jsonSlug byte-identical) and :34-36 (range; the only difference is the `end.column` sentinel 2 vs 10, and `grep column` in the binder file hits only the declaration line, so no cell reads it — the sole call is `range(index + 1)` at :137 feeding `parseParams` inside a fail-loudly `loweredParams`), both copies are live (jsonSlug → `validator()` :110), both siblings already import the names (record-write-sites:27 all four, schema-validator-enforcement:11 `jsonSlug, hasOwn, range`), `git show 71039544 -- tests/proto-named-binder-write-sites.test.ts` confirms that fix added only the hasOwn/prototypeReport import and never touched jsonSlug/range, stated docs/bugs 0214 and coverage-matrix greps → 0, all locations under tests/, D7 boilerplate-duplication class with no gate/recording-double/red-test carve-out, and no open/resolved PTQ tracks it (PTQ-0671/PTQ-0730 are both fixed and cover the other files' copies) — note the same-wave intake sibling qw20260918092852-d7-10-proto-named-binder-jsonslug-range-not-migrated.md files this identical root cause (untriaged), so mint one PTQ and fold the two at acceptance rather than two (triage: claude-fable-5-1)
