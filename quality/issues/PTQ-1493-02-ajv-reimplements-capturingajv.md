---
id: PTQ-1493
title: inline-object-duplicate-field-name.test.ts declares a local ajv() that reimplements the canonical capturingAjv() export byte-for-byte instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-duplicate-field-name.test.ts:274-284
  - tests/helpers/scripted-live-session-harness.ts:220-225
  - tests/helpers/proto-named-harness.ts:8-11
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# inline-object-duplicate-field-name.test.ts declares a local ajv() that reimplements the canonical capturingAjv() export byte-for-byte instead of importing it

## Observation
`tests/helpers/scripted-live-session-harness.ts` exports `capturingAjv()`, a
zero-argument helper that constructs a real `AjvSchemaValidator` whose
`slugOf` is the shared `jsonSlug` content-addressing function
(`tests/helpers/proto-named-harness.ts`) and whose `emit` callback pushes every
emitted diagnostic into a returned array, alongside the validator itself.
`tests/inline-object-duplicate-field-name.test.ts` declares its own
module-private `ajv()` with the identical return shape and the identical
`slugOf` body inlined (`JSON.stringify` into both `slug` and
`canonicalBytes`), rather than importing `capturingAjv`. Four other files in
the tree — including both files a prior wave's finding (PTQ-0425) cited for
this exact reimplementation — already import this export as `import {
capturingAjv as ajv } from "./helpers/scripted-live-session-harness"`; this
file does not.

## Evidence
`tests/helpers/scripted-live-session-harness.ts:220-225` (the canonical
export, re-read immediately before filing):
```ts
/** A real AJV validator together with its emitted diagnostics. */
export function capturingAjv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic[] } {
  const emitted: Diagnostic[] = [];
  return {
    validator: new AjvSchemaValidator({ emit: (d) => emitted.push(d), slugOf: jsonSlug }),
    emitted,
  };
}
```

`tests/helpers/proto-named-harness.ts:8-11` (the `jsonSlug` the export closes
over, re-read immediately before filing):
```ts
/** A content-addressing function deriving a distinct slug per distinct schema. */
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

`tests/inline-object-duplicate-field-name.test.ts:274-284` (the local
reimplementation, re-read immediately before filing):
```ts
/** A real `AjvSchemaValidator` plus the diagnostics it emitted. */
function ajv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic[] } {
  const emitted: Diagnostic[] = [];
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    validator: new AjvSchemaValidator({ emit: (d) => emitted.push(d), slugOf }),
    emitted,
  };
}
```

Every field of the returned object and every byte the `slugOf` produces
(`JSON.stringify(schema)` used for both `slug` and `canonicalBytes`, exactly
`jsonSlug`'s body) match the canonical export; only the doc comment and the
inline-vs-imported `slugOf` binding differ.

Search: `grep -n "capturingAjv" tests/*.ts | grep -v inline-object-duplicate-field-name`
returns four importers of the canonical export
(`tests/inline-object-wire-name-rename-refusal.test.ts:1`,
`tests/inline-slug-name-reservation.test.ts:1`,
`tests/params-inline-object-lowering.test.ts:11`,
`tests/schema-alias-union-decl.test.ts:6`, each `import { capturingAjv as ajv }
from "./helpers/scripted-live-session-harness"`), none of which is the
in-scope file.

## Why this is a problem
The identical function is exported from `tests/helpers/` and imported under
the same local name (`ajv`) by four other files, so the in-scope file's
private copy is not a case of the shared helper being unavailable or
differently shaped: an importer that binds the export to the exact same local
identifier this file already uses for its own copy exists in the tree. The
in-scope file's copy carries its own inlined `slugOf` rather than the shared
`jsonSlug`, so a future change to the canonical content-addressing rule (e.g.
picking a different hash rather than raw `JSON.stringify`) would update the
four importers automatically and leave this file's copy silently on the old
rule.

## Suggested direction (non-binding, optional)
The natural home is the existing `capturingAjv` export; the four files that
already `import { capturingAjv as ajv }` from
`tests/helpers/scripted-live-session-harness.ts` show the drop-in shape this
file's own `ajv()` already matches field-for-field.

## False-positive check
Gate-pin check: not a `*gate*.test.ts` file; not applicable. Recording-double
check: `emitted` is a genuine MUST-witness accumulator (assert on what AJV
emitted), not a MUST-NOT witness, and the double itself — not an assertion
against it — is what is being compared here, so the recording-double
carve-out (which protects the assertion, not the double's construction) does
not shield the duplication. docs/bugs/ search: `grep -rn "capturingAjv"
docs/bugs/` returns 0. coverage-matrix/bug-doc citation search: `grep -rn
"inline-object-duplicate-field-name" docs/reference/coverage-matrix.md
docs/bugs/` returns 0; no merge/rename/delete of the test file is proposed.
This is a claim about an existing double being re-declared rather than
imported, not about a missing test, so it does not drift into coverage.
Prior-filing check: `grep -rl "inline-object-duplicate-field-name"
quality/resolved quality/issues quality/intake` before filing returned
PTQ-0205 (diagLines, fixed), PTQ-0751 (fixture harness, fixed), PTQ-1328
(msg(), fixed) — none names `ajv()`/`capturingAjv`. PTQ-0425 (fixed) covers
this exact reimplementation shape but names two different files
(`tests/inline-object-wire-name-rename-refusal.test.ts`,
`tests/inline-slug-name-reservation.test.ts`), both of which its own fix
migrated to `import { capturingAjv as ajv }`; this file was left out of that
migration and is a distinct, previously untracked instance of the same root
cause.

## Triage
verdict: confirmed — independently re-verified: the local `ajv()` reproduces at tests/inline-object-duplicate-field-name.test.ts:274-284 and is functionally identical to the exported `capturingAjv()` (scripted-live-session-harness.ts:220-225, `slugOf: jsonSlug` = proto-named-harness.ts:8-11, same `JSON.stringify` into both `slug`/`canonicalBytes`); the copy is live (called at :1020 and :1035, `emitted` read); the stated search reproduces exactly four importers of `capturingAjv as ajv` and this file is not among them; not a gate/recording-double carve-out, no docs/bugs or coverage-matrix hit for `capturingAjv`; no existing filing covers this file — PTQ-0425 lists it only in its 12-file pattern census (locations are the wire-name-rename/inline-slug pair), PTQ-0490/0749/0824/0971/1003/1079/1337/1346 and same-wave sibling d7-01 all cite disjoint files — a mechanical import swap (triage: claude-fable-5-1)
