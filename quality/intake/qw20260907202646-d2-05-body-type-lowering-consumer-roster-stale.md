---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: body-type-lowering.ts's header says it is "Used by two whole-file NamedType resolvers" and lists two, while four production modules import from it
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/body-type-lowering.ts:1-13
  - src/parser/theta-document.ts:105-110
  - src/runtime/query-schema-lowering.ts:135-141
  - src/extension/import-static-checks.ts:91
  - src/parser/type-layer-checks.ts:86
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# body-type-lowering.ts's header says it is "Used by two whole-file NamedType resolvers" and lists two, while four production modules import from it

## Observation
The module header of `src/parser/body-type-lowering.ts` opens with a closed
two-item consumer enumeration: "Used by two whole-file `NamedType` resolvers",
followed by a bullet for `query-schema-lowering.ts` and a bullet for
`theta-document.ts`. Four production modules import from the file today:
`src/parser/theta-document.ts`, `src/runtime/query-schema-lowering.ts`,
`src/extension/import-static-checks.ts`, and `src/parser/type-layer-checks.ts`.
The last two — both importing `collectUnresolvedNamedTypes` — appear nowhere in
the enumeration.

## Evidence
src/parser/body-type-lowering.ts:1-13 — the header's closed enumeration:

```ts
// Shared body-type lowering — the single canonical place that lowers a theta
// body's `schema` / `enum` declarations to their JSON-Schema fragments. Used by
// two whole-file `NamedType` resolvers:
//
//   - the `params:` / typed-query response-schema lowering (via
//     `query-schema-lowering.ts`, which resolves a `@<Schema>` annotation to the
//     named decl's object body), and
//   - the frontmatter `params:` named-type resolution (via `collectBodyTypes`
//     in `theta-document.ts`, which supplies each body type's lowered fragment so
//     a `params:` field of a `NamedType` produces a present `loweredSchema`).
//
// Keeping the lowering here (rather than duplicated per caller) means an enum or
// named schema lowers identically wherever it is referenced.
```

The importer census is exhaustive: the search
`grep -rn 'from "../parser/body-type-lowering"|from "./body-type-lowering"'
src/ extensions/ tools/ tests/` returns 4 hits, all in `src/`.

src/parser/theta-document.ts:105-110 — listed consumer 2:

```ts
import {
  buildBodyTypeSchemas,
  collectUnresolvedNamedTypes,
  isSingleEnclosingBraceGroup,
  type SchemaSlugCollision,
} from "./body-type-lowering";
```

src/runtime/query-schema-lowering.ts:135-141 — listed consumer 1:

```ts
import {
  buildBodyTypeSchemas,
  isSingleEnclosingBraceGroup,
  lowerInlineObject,
  lowerTypeSource,
  type InlineHoistSinks,
} from "../parser/body-type-lowering";
```

src/extension/import-static-checks.ts:91 — unlisted consumer 3:

```ts
import { collectUnresolvedNamedTypes } from "../parser/body-type-lowering";
```

src/parser/type-layer-checks.ts:86 — unlisted consumer 4:

```ts
import { collectUnresolvedNamedTypes } from "./body-type-lowering";
```

## Why this is a problem
Historical narration with a stated count: "Used by two whole-file `NamedType`
resolvers" is a closed enumeration, and the import graph contradicts it — four
modules depend on this file, two of them on the same exported walk
(`collectUnresolvedNamedTypes`). The header is the module's only statement of
who depends on it, so a reader deciding whether an exported signature here is
safe to change is handed a roster that omits half its dependants. The gap is
countable, not a matter of taste: 2 named vs 4 importing.

## Suggested direction (non-binding, optional)
Either drop the numeral and the per-consumer bullets in favour of a statement
of what the module owns, or extend the enumeration to the positions that
actually import it.

## False-positive check
- Importer census: `grep -rn 'from "../parser/body-type-lowering"' src/
  extensions/ tools/ tests/` and `grep -rn 'from "./body-type-lowering"' src/
  extensions/ tools/ tests/` → 4 hits total, listed above. No test file imports
  the module through a different path, and none of the four is a test.
- Symbol-level check: `grep -rn "collectUnresolvedNamedTypes" src/ extensions/
  tools/ tests/` shows the two unlisted importers calling it —
  import-static-checks.ts:233 (`return collectUnresolvedNamedTypes(typeSource,
  new Set());`) and type-layer-checks.ts (imported at :86) — so both are live
  consumers, not stale imports.
- Re-export check: `grep -rn "export .*body-type-lowering" src/` → no barrel or
  re-export file forwards this module, so the four static imports are the whole
  dependant set.
- The one re-export the module itself performs (`export {
  isSingleEnclosingBraceGroup };`, body-type-lowering.ts:35) is consumed —
  theta-document.ts:108 and query-schema-lowering.ts:137 both import it through
  this path — so that line is not part of this finding.
- Not test-only: all four importers are production modules under `src/`.
- git history intent: searching the header phrase (git log -S over
  src/parser/body-type-lowering.ts for the words "two whole-file") returns one
  commit, 369facac (2026-07-11) — the enumeration has not been revised since
  it was written. The same search style for collectUnresolvedNamedTypes over
  src/parser/type-layer-checks.ts bottoms out at 9eb1290d (2026-08-20, bug
  0124), and over src/extension/import-static-checks.ts at d03f7398
  (2026-09-07, bug 0465): both unlisted consumers were added after the header
  text and neither commit updated it.

## Triage
