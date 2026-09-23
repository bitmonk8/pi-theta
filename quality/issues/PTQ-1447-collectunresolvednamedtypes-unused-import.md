---
id: PTQ-1447
title: structural-checks.ts imports collectUnresolvedNamedTypes but never calls it
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/structural-checks.ts:20
  - src/parser/structural-checks.ts:79
  - src/parser/structural-checks.ts:428
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# structural-checks.ts imports collectUnresolvedNamedTypes but never calls it

## Observation
`structural-checks.ts` imports `collectUnresolvedNamedTypes` from
`./body-type-lowering` at the top of the file. The only other appearances of
the identifier in this file are inside doc comments describing what
`typeNames` feeds and what a `let` annotation check "reaches … through the
same `collectUnresolvedNamedTypes` walk" — there is no call expression
`collectUnresolvedNamedTypes(...)` anywhere in the file. `tsc --noUnusedLocals`
flags the import as unread.

## Evidence
`src/parser/structural-checks.ts:20`
```ts
import { collectUnresolvedNamedTypes } from "./body-type-lowering";
```

`src/parser/structural-checks.ts:79` (comment only)
```ts
   * `collectUnresolvedNamedTypes` at the six type-expression positions this
```

`src/parser/structural-checks.ts:428` (comment only)
```ts
        // through the same `collectUnresolvedNamedTypes` walk the five already-
```

Compiler check:
```
$ npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p .
src/parser/structural-checks.ts(20,1): error TS6133: 'collectUnresolvedNamedTypes' is declared but its value is never read.
```

The real calls the comments describe live in sibling modules that
`structural-checks.ts` already delegates to for that work:
`src/parser/annotation-validation.ts:63,527`, `src/parser/schema-graph-checks.ts:69,157`,
and `src/parser/query-annotation-check.ts:232,256` — all reached from
`structural-checks.ts` via `validateTypeAnnotation`, `checkSchemaDeclarationGraph`
/ `checkSchemaFieldTypes`, and `checkQueryAnnotation`, which this file does
import and call.

## Why this is a problem
The binding is dead: nothing in `structural-checks.ts` reads it, and a
compiler run with unused-locals checking on names it explicitly. The
surrounding prose still narrates the walk as if this file drove it directly,
which no longer matches — the direct callers are the sibling modules cited
above.

## Suggested direction (non-binding, optional)
Drop the unused import; the descriptive comments can stay since the walk they
describe is still real, just performed by the sibling modules this file
delegates to.

## False-positive check
- `grep -n "collectUnresolvedNamedTypes" src/parser/structural-checks.ts` — 3
  hits: the import line and two comment mentions, zero call expressions.
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p .` — flags exactly
  this binding as TS6133 (declared but never read).
- Full-repo search `grep -rn "collectUnresolvedNamedTypes" src extensions tools tests`
  confirms the function itself is alive and heavily called elsewhere
  (`annotation-validation.ts`, `schema-graph-checks.ts`,
  `query-annotation-check.ts`, `body-type-lowering.ts`, `import-specifier-facts.ts`,
  `type-text-split.ts`, and dozens of test references) — only this one import
  binding in `structural-checks.ts` is unread.
- `git log --oneline -- src/parser/structural-checks.ts` shows the file was
  recently reshaped by a D9 fix commit (`218fcd2e … fix d9/src__parser__structural-checks.ts`),
  consistent with an import stranded by that split rather than a deliberate
  re-export (it is not re-exported; `export { checkStructural, hoistEnumVariants, pushDiag, rangeKey }`
  at line 969 does not list it).

## Triage
verdict: confirmed — reproduced: `grep -n collectUnresolvedNamedTypes src/parser/structural-checks.ts` yields exactly the import at :20 and two backtick comment mentions at :79/:428 with no call expression; `npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p .` emits `structural-checks.ts(20,1): TS6133 'collectUnresolvedNamedTypes' is declared but its value is never read`; the file's export lists at :969-971 do not re-export it, while the function itself stays live in annotation-validation.ts:63,527, schema-graph-checks.ts:69,157, query-annotation-check.ts:232,256 and import-specifier-facts.ts:128 (so only this binding is dead); no quality/issues/ row cites this binding (PTQ-1293/PTQ-1247 are different files) (triage: claude-fable-5-1)
