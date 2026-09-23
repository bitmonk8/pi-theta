---
id: PTQ-1494
title: union-generic-arm-lowering.test.ts declares a local ajv() that reimplements the canonical capturingAjv() helper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/union-generic-arm-lowering.test.ts:320-331
  - tests/helpers/scripted-live-session-harness.ts:220-225
  - tests/helpers/proto-named-harness.ts:9-12
sites: 1
fix_scope: localized
d7_class: copy-paste-fixture
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# union-generic-arm-lowering.test.ts declares a local ajv() that reimplements the canonical capturingAjv() helper

## Observation
`tests/union-generic-arm-lowering.test.ts` declares a module-private
`function ajv()` returning `{ readonly validator: AjvSchemaValidator;
readonly emitted: Diagnostic[] }`, built from a real `AjvSchemaValidator`
whose `emit` callback pushes onto a local `emitted` array and whose `slugOf`
is a local closure that does `{ slug: JSON.stringify(schema), canonicalBytes:
JSON.stringify(schema) }`. `tests/helpers/scripted-live-session-harness.ts`
already exports `capturingAjv()` with the identical return-type shape,
built the identical way, whose `slugOf` is `jsonSlug`
(`tests/helpers/proto-named-harness.ts:9-12`), which does the exact same
`{ slug: JSON.stringify(schema), canonicalBytes: JSON.stringify(schema) }`
computation. The file does not import `capturingAjv` or `jsonSlug` from
either helper module.

## Evidence
`tests/union-generic-arm-lowering.test.ts:320-331` (re-read immediately
before filing):
```ts
/** A real `AjvSchemaValidator` (the shipped V8c seam) plus the diagnostics it emits. */
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

`tests/helpers/scripted-live-session-harness.ts:220-225`:
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

`tests/helpers/proto-named-harness.ts:9-12`:
```ts
/** A content-addressing function deriving a distinct slug per distinct schema. */
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

The return-type annotation `{ readonly validator: AjvSchemaValidator;
readonly emitted: Diagnostic[] }` is byte-identical between the local
function and `capturingAjv`'s declared return type; the `emit`/`slugOf`
wiring passed to `new AjvSchemaValidator(...)` is byte-identical modulo the
inlined `slugOf` closure versus the imported `jsonSlug` constant, and that
closure computes the same two fields the same way.

## Why this is a problem
`capturingAjv()` is the canonical helper this exact shape already has a home
under `tests/helpers/`. The file under review reimplements it locally rather
than importing it (and, transitively, `jsonSlug`), duplicating the
validator-plus-diagnostics-array construction and the JSON-identity slug
function it composes from.

## Suggested direction (non-binding, optional)
Importing `capturingAjv` from `tests/helpers/scripted-live-session-harness.ts`
would give this file the same `{validator, emitted}` value without the local
reimplementation; naming it here is an observation of the existing home, not
a design.

## False-positive check
- Gate-pin carve-out: `union-generic-arm-lowering.test.ts` does not match
  `*gate*.test.ts` or any named census/pin family; N/A.
- Recording-double carve-out: `emitted` here records diagnostics for
  positive assertions the file makes about them (group (d9)'s pre-existing
  diagnostic checks), not a MUST-NOT witness; this filing is about the
  duplicated construction, not about invalidating a legitimate recording
  double.
- docs/bugs/ signature search: `grep -rn "capturingAjv\|function ajv()"
  docs/bugs/` returns no hits; this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "union-generic-arm-lowering" docs/reference/coverage-matrix.md` found no
  hit; no merge/rename/delete of a cited test is proposed.
- Checked already-filed candidates: `grep -rl "capturingAjv"
  quality/intake/*.md quality/issues/*.md quality/resolved/*.md` lists
  filings against other files (nested-lowering-quoted-refusal,
  params-inline-object, schema-alias-union-decl, plus this wave's
  d7-18-02); none names `tests/union-generic-arm-lowering.test.ts`.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines (union-generic-arm-lowering.test.ts:320-331 `ajv()`, scripted-live-session-harness.ts:220-225 `capturingAjv`, proto-named-harness.ts:9-12 `jsonSlug`); the local `slugOf` closure has the exact `SchemaSlugFn` signature (`(schema: LoweredSchema) => SchemaSlug`, ajv-schema-validator.ts:312) and computes the same `{slug, canonicalBytes}` from `JSON.stringify(schema)`, so `capturingAjv()` is a drop-in for every one of the four live call sites (:617, :651 destructure `emitted`; :696, :1079 take `validator`); the file imports neither `capturingAjv` nor `jsonSlug` (grep → only the local declaration); stated searches reproduce (docs/bugs `capturingAjv|function ajv()` 0 hits, coverage-matrix 0 hits, quality/issues 0 files naming this test); bug docs 0043/0044/0045 cite the file as a witness but no merge/rename/delete is proposed so no carve-out applies; not a gate file, `emitted` feeds positive assertions not a MUST-NOT recording double; not a duplicate — resolved PTQ-0425 fixed two other files of the same 12-file pattern (its triage note lists this file as out of that scope), PTQ-0874/PTQ-1087 concern this file's slug formula and a self-compare, and same-wave siblings d7-01 (nested-lowering/quoted-refusal) and d7-18-02 (duplicate-field-name) cite disjoint files; 8 of the original 12 copies still remain, so this is a residual reimplements-existing-helper filing per the PTQ-0665/0874 precedent, D7 copy-paste-fixture class, both locations under tests/, fix is a mechanical import swap (triage: claude-fable-5-1)
