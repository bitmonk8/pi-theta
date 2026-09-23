---
id: PTQ-1325
title: schema-validator-seam.test.ts redeclares the jsonSlug fake despite an exported canonical helper of the same name
lens: D7
status: open
verdict: confirmed
locations:
  - tests/schema-validator-seam.test.ts:24-37
  - tests/helpers/proto-named-harness.ts:8-12
  - tests/params-defaults.test.ts:61-65
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# schema-validator-seam.test.ts redeclares the jsonSlug fake despite an exported canonical helper of the same name

## Observation
`tests/schema-validator-seam.test.ts` locally declares a `SchemaSlugFn` double named `jsonSlug` that stringifies the schema and uses the bytes as both slug and canonical bytes, plus a `fixedSlug` factory for the collision-path control. `tests/helpers/proto-named-harness.ts` already exports a function of the identical name and identical body for the same purpose, and it is correctly imported (not reimplemented) by two other call sites: `tests/proto-named-schema-validator-enforcement.test.ts:6` and `tests/helpers/scripted-live-session-harness.ts:46`. A third test file, `tests/params-defaults.test.ts:62-65`, carries a byte-identical re-declaration of the same fake.

## Evidence
`tests/schema-validator-seam.test.ts:24-37`:
```ts
const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
...
function fixedSlug(slug: string): SchemaSlugFn {
  return (schema) => ({ slug, canonicalBytes: JSON.stringify(schema) });
}
```

`tests/helpers/proto-named-harness.ts:8-12` (the canonical, exported version):
```ts
/** A content-addressing function deriving a distinct slug per distinct schema. */
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

`tests/params-defaults.test.ts:61-65` (a second re-declaration, outside this review's scope but corroborating the pattern):
```ts
/** A content-addressing function deriving a distinct slug per distinct schema. */
const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

Correct-usage sites proving the helper is import-ready and already relied upon elsewhere:
```
tests/proto-named-schema-validator-enforcement.test.ts:6: import { jsonSlug, hasOwn, loweredParams } from "./helpers/proto-named-harness";
tests/helpers/scripted-live-session-harness.ts:46: import { jsonSlug } from "./proto-named-harness";
```
Search: `grep -rn "SchemaSlugFn|jsonSlug|fixedSlug" tests` — 4 declaration/import sites for `jsonSlug` across `proto-named-harness.ts` (canonical, exported), `params-defaults.test.ts`, `schema-validator-seam.test.ts`, and two correct import sites.

## Why this is a problem
`tests/helpers/proto-named-harness.ts` names the exact fixture this file needs and is already the import target for two other files in the tree, so the helper is neither hypothetical nor hard to reach — it is one relative import away from `tests/schema-validator-seam.test.ts`. Re-declaring the identical closure under the identical name in a second (and a third, at `params-defaults.test.ts`) test file is copy-paste of a double where a canonical helper exists under `tests/helpers/`, unlike the deliberately-independent oracle documented in `tests/helpers/canonical-slug-oracle.ts` ("No production canonicaliser or slug helper is imported; the hand-written canonical forms and their honesty checks remain in each test file") — no such independence rationale accompanies `jsonSlug` in either re-declaring file.

## Suggested direction (non-binding, optional)
`tests/schema-validator-seam.test.ts` could import `jsonSlug` from `tests/helpers/proto-named-harness.ts` the same way `proto-named-schema-validator-enforcement.test.ts` and `helpers/scripted-live-session-harness.ts` already do, keeping only the file-local `fixedSlug` factory that has no counterpart in the shared helper.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `jsonSlug` is a content-addressing stub, not a call-recording double used for a MUST-NOT-be-called witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: no correct-reason-red citation accompanies either declaration; both are live, passing helper functions, not documented red tests.
- coverage-matrix/bug-doc citation search: `grep -rn "jsonSlug" docs/reference/coverage-matrix.md docs/bugs/` returned no hits — neither declaration is pinned by name in a citing document.
- Confirmed the claim is about existing duplicated fixture code, not about a missing test or coverage gap.

## Triage
verdict: confirmed — independently re-verified D7 copy-paste fixture: `const jsonSlug: SchemaSlugFn` with the byte-identical `JSON.stringify` slug/canonicalBytes body sits at tests/schema-validator-seam.test.ts:24-27 and tests/params-defaults.test.ts:62-65, the canonical `export const jsonSlug` is at tests/helpers/proto-named-harness.ts:9-12 and `grep -rn jsonSlug tests` reproduces exactly the two correct import sites (proto-named-schema-validator-enforcement.test.ts:6, helpers/scripted-live-session-harness.ts:46); no gate/recording-double/bug-doc carve-out applies (docs/bugs/0239 and 0049 cite params-defaults cells, not the helper, and importing the helper merges/renames/deletes no test), `fixedSlug` is correctly left file-local; not tracked elsewhere — PTQ-0671/0923/0931/1003/1079 cover other files' jsonSlug copies (proto-named-*-write-sites, scripted-live-session ajv/capturingAjv), none cites schema-validator-seam or params-defaults; frontmatter omits sites/fix_scope but that does not block evaluation (triage: claude-fable-5-1)
