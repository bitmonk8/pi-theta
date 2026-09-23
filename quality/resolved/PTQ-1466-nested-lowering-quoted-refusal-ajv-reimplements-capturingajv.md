---
id: PTQ-1466
title: inline-object-nested-lowering.test.ts and inline-object-quoted-field-name-refusal.test.ts each declare a local ajv() that reimplements the canonical capturingAjv() export byte-for-byte
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-object-nested-lowering.test.ts:536-546
  - tests/inline-object-quoted-field-name-refusal.test.ts:321-331
  - tests/helpers/scripted-live-session-harness.ts:219-226
  - tests/helpers/proto-named-harness.ts:8-11
sites: 2
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# inline-object-nested-lowering.test.ts and inline-object-quoted-field-name-refusal.test.ts each declare a local ajv() that reimplements the canonical capturingAjv() export byte-for-byte

## Observation
`tests/helpers/scripted-live-session-harness.ts` exports `capturingAjv()`, a
zero-argument helper that constructs a real `AjvSchemaValidator` whose
`slugOf` is the shared `jsonSlug` content-addressing function
(`tests/helpers/proto-named-harness.ts`) and whose `emit` callback pushes
every emitted diagnostic into a returned array, alongside the validator
itself. Both files in this review's scope declare their own module-private
`ajv()` with the identical return shape and the identical `slugOf` body
inlined (`JSON.stringify` into both `slug` and `canonicalBytes`), rather than
importing `capturingAjv`. The two in-scope copies are byte-identical to each
other, including the doc comment above the function.

## Evidence
`tests/helpers/scripted-live-session-harness.ts:219-226` (the canonical
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

`tests/helpers/proto-named-harness.ts:8-11` (the `jsonSlug` the export closes over):
```ts
/** A content-addressing function deriving a distinct slug per distinct schema. */
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

`tests/inline-object-nested-lowering.test.ts:536-546` (re-read immediately before filing):
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

`tests/inline-object-quoted-field-name-refusal.test.ts:321-331` (re-read
immediately before filing — byte-identical to the excerpt above, including
the doc comment):
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

Exact search: `grep -rln "slugOf = (schema: LoweredSchema)" tests/helpers/*.ts tests/*.ts` returns 15 files repository-wide, of which the two in this review's scope are among them; both in-scope copies are word-for-word identical to each other and functionally identical (same `slug`/`canonicalBytes` derivation, same `emit` accumulation shape) to `capturingAjv`.

## Why this is a problem
`capturingAjv` already exists as an exported, importable helper naming exactly this construction, and other in-tree files import it under the alias `ajv` (`import { capturingAjv as ajv } from "./helpers/scripted-live-session-harness"`), so the shape these two files hand-roll has a name and a home already. A change to how `LoweredSchema` is content-addressed, or to `AjvSchemaValidator`'s constructor shape, would need to be applied at each of these two local copies by hand in addition to the canonical export and its other importers.

## Suggested direction (non-binding, optional)
Both local `ajv()` declarations could be replaced with an import of `capturingAjv` (aliased to `ajv` to keep call sites unchanged), following the pattern other in-tree files already use.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin, so the pinned-count carve-out does not apply. Recording-double check: this `ajv()` builds a real `AjvSchemaValidator` against real compiled schemas, not a recording/negative-witness double, so the recording-double carve-out does not apply. docs/bugs/ signature search: `grep -rn "ajv" docs/bugs/*.md` was not needed since this finding is a duplication claim, not a red-test claim — no test here is disabled or red by design. coverage-matrix/bug-doc citation search: `grep -rn "inline-object-nested-lowering\|inline-object-quoted-field-name-refusal" docs/reference/coverage-matrix.md` and a search of `docs/bugs/*.md` witness lists were run against the intake list of prior findings citing these two files (quality/issues/PTQ-1402, PTQ-1403 and quality/resolved/* hits) — none of those existing filings cite this `ajv()`/`capturingAjv` duplication for these two files; the closest existing filing (PTQ-0425, resolved/fixed) and this wave's own `qw20260923145222-d7-18-02` filing cite a different, disjoint pair of files (`tests/inline-object-wire-name-rename-refusal.test.ts` / `tests/inline-slug-name-reservation.test.ts`, and `tests/inline-object-duplicate-field-name.test.ts`, respectively), so this is not a re-file of either. This claim does not propose any coverage change — it observes two existing, passing test files.

## Triage
verdict: confirmed — both local `ajv()` bodies reproduce byte-identically at inline-object-nested-lowering.test.ts:536-546 and inline-object-quoted-field-name-refusal.test.ts:321-331, are functionally identical to the exported `capturingAjv()` (scripted-live-session-harness.ts:219-226, `slugOf: jsonSlug` = proto-named-harness.ts:8-11), three in-tree files already import `capturingAjv as ajv`, neither file is a gate/recording-double carve-out, and no existing filing covers this pair (PTQ-0425/0824/1079/1346 cite disjoint files and are fixed; PTQ-1402/1403 on these files concern loadCleanly) — a mechanical import swap (triage: claude-fable-5-1)
