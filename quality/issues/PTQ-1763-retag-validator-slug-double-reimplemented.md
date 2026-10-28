---
id: PTQ-1763
title: wire-translation-inbound-retag.test.ts reimplements the shared jsonSlug validator double
lens: D7
status: open
verdict: confirmed
locations:
  - tests/wire-translation-inbound-retag.test.ts:319-323
  - tests/wire-translation-inbound-retag.test.ts:549-550
  - tests/helpers/proto-named-harness.ts:8-12
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# wire-translation-inbound-retag.test.ts reimplements the shared jsonSlug validator double

## Observation
`wire-translation-inbound-retag.test.ts` defines `productionSlugOf` and supplies it to the AJV validator used by its closed-fragment control. The function stringifies the schema once and returns those bytes as both `slug` and `canonicalBytes`. `tests/helpers/proto-named-harness.ts` already exports that same content-addressing double as `jsonSlug`; the local version differs in the function declaration and local variable names, not in its computation or returned fields. This finding counts one local reimplementation, with the existing helper as the comparison site.

## Evidence

`tests/wire-translation-inbound-retag.test.ts:319-323`:
```ts
/** The production content-addressing of `src/extension/production-composition.ts:3789`. */
function productionSlugOf(schema: LoweredSchema): SchemaSlug {
  const canonicalBytes = JSON.stringify(schema);
  return { slug: canonicalBytes, canonicalBytes };
}
```

`tests/helpers/proto-named-harness.ts:8-12`:
```ts
/** A content-addressing function deriving a distinct slug per distinct schema. */
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

`tests/wire-translation-inbound-retag.test.ts:549-550`:
```ts
    const validator = new AjvSchemaValidator({ emit: (): void => {}, slugOf: productionSlugOf });
    const compiled = validator.compile(lowered);
```

The comparison is renamed-only at the computation level: both evaluate `JSON.stringify(schema)` once and place the result in the same two output fields. The exact search `rg -n '\bproductionSlugOf\b' src extensions tools tests` returns two hits, the declaration at line 320 and the callback reference at line 549; both are cited above. No repository-wide clone count is claimed.

## Why this is a problem
This is the D7 **copy-paste fixtures/doubles** class: the test maintains its own implementation of a validator dependency for which a canonical test helper already exists. The two cited implementations encode the same schema-to-slug fixture policy separately, without any different behavior in the local implementation. `tests/helpers/proto-named-harness.ts` is the existing shared home for this exact double; this observation does not concern production slug behavior or the number of boundary tests.

## False-positive check
- **Gate-pin:** the reviewed file is not a gate/pin-inventory test. The reported code constructs a validator callback; it does not assert a corpus count.
- **Recording-double:** this callback returns a slug object and records no calls. It is not a negative witness asserting that a dependency was never called.
- **docs/bugs/ signature search:** `rg -n 'AJV control: a closed lowered fragment|productionSlugOf|closed fragment admitted a payload spelling __proto__' docs/bugs docs/reference/coverage-matrix.md` returns no hits. This is not a report about a red or disabled test. The missing-lowering and unexpected-validation branches in the test throw rather than quietly returning.
- **Coverage-matrix/bug-doc citation search:** `rg -n 'wire-translation-inbound-retag' docs/reference/coverage-matrix.md` returns no hits. Searching the filename in `docs/bugs/` does find witness citations, including `docs/bugs/0173-inbound-rebuild-record-not-null-prototyped.md:774-786`. No test merge, rename, or deletion is proposed; those witnesses and their assertions are not challenged.
- **Intent/history:** `git log -S 'function productionSlugOf' -- tests/wire-translation-inbound-retag.test.ts` identifies its introduction in `21988875`; that version already has the same stringify-and-return body. `git log -S 'export const jsonSlug' -- tests/helpers/proto-named-harness.ts` identifies the later shared-helper introduction in `71039544`. The local comment identifies the content-addressing recipe, not an independent-oracle requirement; the shared helper implements that same recipe.
- **Existing findings:** searches for `productionSlugOf` and the test filename in `quality/issues/`, `quality/intake/`, and `quality/resolved/` found no finding on this callback. PTQ-0931 and PTQ-1325 concern other files' copies of `jsonSlug`; PTQ-1380 concerns the already-shared Person sidecar fixture, not this callback.
- **Boundary:** this claim is only about an existing test double reimplementing a shared helper. It requests no additional test, makes no coverage claim, and reports no runtime-risk or behavior defect.

## Triage
verdict: confirmed — All three excerpts and stated searches reproduce: productionSlugOf is a live, renamed-only copy of the shared jsonSlug double, performing one JSON.stringify and returning identical slug/canonicalBytes fields; this is D7 copy-paste-double duplication under tests/, with no applicable carve-out, prior filing on this callback, or resolved ruling prescribing its local implementation. (triage: claude-opus-5-5)
