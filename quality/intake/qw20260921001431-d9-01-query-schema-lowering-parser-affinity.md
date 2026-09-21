---
id: pending
title: query-schema-lowering.ts is a SUBS-1 lowering stage in src/runtime/ that touches 10 parser members and 0 runtime members, while its lowering sibling family lives in src/parser/
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/query-schema-lowering.ts:1-371
sites: 1
fix_scope: cross-module
d9_class: misplacement
wave: qw20260921001431
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-21
---

# query-schema-lowering.ts is a SUBS-1 lowering stage in src/runtime/ that touches 10 parser members and 0 runtime members, while its lowering sibling family lives in src/parser/

## Observation
`src/runtime/query-schema-lowering.ts` (371 LOC) is the V13e seam that lowers a
typed `@<Schema>` query annotation to an AJV-validatable JSON Schema (its header:
"lower a typed `@<Schema>` query's declared response schema to the validating
JSON Schema (QRY-22 / SUBS-1), reusing the `params:` type-lowering machinery").
It is a pure text+decls → schema transformation with no runtime state, and it is
built entirely from `src/parser/` lowering machinery. No `src/runtime/` module
imports it; its single src importer is `src/extension/production-theta-producer.ts`.

## Evidence
Import block — every value import is a parser member; the module imports nothing
from its own `src/runtime/` directory (src/runtime/query-schema-lowering.ts:133-146):

```ts
import type { LoweredSchema } from "../seams/schema-validator";
import { hoistNestedDefs } from "../parser/schema-defs";
import type { EnumDecl, SchemaDecl } from "../parser/theta-document";
import {
  buildBodyTypeSchemas,
  isSingleEnclosingBraceGroup,
  lowerInlineObject,
  lowerTypeSource,
  type InlineHoistSinks,
} from "../parser/body-type-lowering";
import {
  prunePerQueryDefs,
  type QueryDefsDocument,
} from "../parser/query-schema-inference";
```

Affinity counted both ways:
- The module's three functions touch 10 named members of 4 `src/parser/`
  modules (`hoistNestedDefs`; `EnumDecl`, `SchemaDecl`; `buildBodyTypeSchemas`,
  `isSingleEnclosingBraceGroup`, `lowerInlineObject`, `lowerTypeSource`,
  `InlineHoistSinks`; `prunePerQueryDefs`, `QueryDefsDocument`) and 0 members of
  any `src/runtime/` module (the only other import is the `LoweredSchema` type
  from `../seams/schema-validator`).
- Inbound: `lowerQueryResponseSchema` has 1 src importer / 52 test importers
  (structural map). The 1 src importer is
  `src/extension/production-theta-producer.ts:283` — no runtime module consumes
  this module (search `query-schema-lowering` across src/: the only import hit
  is that extension line; the runtime hits are comments in `value.ts:451` and
  `typed-query-validation.ts:6`).

Sibling pattern — the SUBS-1 "Lowering Algorithm" family lives in `src/parser/`,
per instance:
- `src/parser/schema-lowering.ts:1-4` — "the schema-lowering and canonical-hash
  seam ... owns the parts of schema-subset.md's Lowering Algorithm" (steps 2, 3, 5).
- `src/parser/body-type-lowering.ts:1-7` — "Shared body-type lowering — the
  single canonical place that lowers a theta body's `schema` / `enum`
  declarations", whose header names `query-schema-lowering.ts` as one of its two
  callers.
- `src/parser/query-schema-inference.ts` — the V13b typed-query schema-inference
  seam, home of `prunePerQueryDefs`, which this module's `pruneDocumentDefs`
  (src/runtime/query-schema-lowering.ts:281-339) wraps; `pruneDocumentDefs`'s own
  doc comment identifies it as "schema-subset.md §'Lowering Algorithm' step 4" —
  a step of the algorithm whose other steps live in `parser/schema-lowering.ts`.
- `src/parser/schema-defs.ts` — home of `hoistNestedDefs`, the hoist half of
  this module's hoist-and-close step.

## Why this is a problem
Counted affinity places every dependency and every same-kind sibling of this
module in `src/parser/`: 10 parser members touched vs 0 runtime members, one
step (step 4) of a spec algorithm whose steps 2/3/5 live in
`parser/schema-lowering.ts`, and zero runtime consumers (the sole src caller is
in `src/extension/`). A reader navigating the SUBS-1 lowering pipeline finds
four of its five stages under `src/parser/` and the fifth under `src/runtime/`,
where nothing else in the directory uses it.

## Suggested direction (non-binding, optional)
Hypothesis (unproven; the human ratifies): re-home the module beside its
siblings, e.g. `src/parser/query-schema-lowering.ts`, updating the one src
import in `production-theta-producer.ts` and the 52 test imports. No code
change beyond the move. "Runtime mint" comments inside (the annotation-position
hoist runs after load) describe when it runs, not where its machinery lives.

## False-positive check
- Affinity counts both ways: 10 parser members touched / 0 runtime members
  touched; 0 runtime importers / 1 extension importer (grep for
  `query-schema-lowering` across src/ — hits quoted above; importer counts from
  the structural map, 1/52).
- Sibling-pattern citation per instance: parser/schema-lowering.ts (steps 2/3/5),
  parser/body-type-lowering.ts (shared lowering, names this module as caller),
  parser/query-schema-inference.ts (`prunePerQueryDefs`), parser/schema-defs.ts
  (`hoistNestedDefs`).
- Not a husk/barrel: the module carries 3 substantive functions (54+59+26 LOC);
  no re-export lines.
- git log --follow: created and evolved through bug fixes (0184, 0164, 0203,
  0465) — no prior move ruling found; no exemption in quality/exemptions.json
  for this path.
- Band: file is exempt-band for breakdown (371 LOC); this is a placement
  finding, which is size-independent.

## Triage
verdict: questionable — accounting verified: import block byte-matches at :133-146 and the 10 parser members (schema-defs 1, theta-document 2, body-type-lowering 5, query-schema-inference 2) vs 0 src/runtime members reproduce, the only non-parser import being the `LoweredSchema` type from ../seams/schema-validator; size-scan map confirms 371 LOC / exempt band (placement review applies) and `lowerQueryResponseSchema` 1/52 importers, my grep across src/, extensions/, tools/ finding the single src importer at production-theta-producer.ts:283 (3 call sites) with every runtime hit a comment (value.ts:451, typed-query-validation.ts:6); sibling headers quote accurately (schema-lowering.ts:1-8 owns Lowering Algorithm steps, body-type-lowering.ts:1-7 names this module as a caller, schema-defs.ts:16-17 names pruneDocumentDefs, whose own doc at :219 claims step 4); no exemptions.json row, no prior rename in git --follow, and the only tracked issue on this module (PTQ-1118 $defs-hoist clone) is a different root cause — the target home (src/parser/) is a design decision needing a human ruling (triage: claude-fable-5-1)
