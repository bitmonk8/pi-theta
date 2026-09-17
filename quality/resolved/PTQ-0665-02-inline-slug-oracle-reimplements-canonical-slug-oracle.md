---
id: PTQ-0665
title: Both files reimplement tests/helpers/canonical-slug-oracle.ts's slugOfCanonicalForm/inlineDefName instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-literal-sublanguage-lowering.test.ts:245-255
  - tests/params-scalar-nontype-text-refusal.test.ts:896-898
  - tests/helpers/canonical-slug-oracle.ts:9-16
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both files reimplement tests/helpers/canonical-slug-oracle.ts's slugOfCanonicalForm/inlineDefName instead of importing it

## Observation
`tests/helpers/canonical-slug-oracle.ts` exports `slugOfCanonicalForm(canonical:
string): string` and `inlineDefName(canonical: string): string`, an
independent `__inline_<slug>` oracle already imported by six other test files
(`annotation-root-brace-union-lowering.test.ts`,
`inline-object-nested-lowering.test.ts`, `params-brace-union-rhs-lowering.test.ts`,
`params-inline-object-lowering.test.ts`, `schema-slug-canonical-form-mints.test.ts`,
`union-generic-arm-lowering.test.ts`). Both files in this review's scope build
the identical byte-hashing routine themselves instead of importing it.

## Evidence
`tests/helpers/canonical-slug-oracle.ts:9-16` (the canonical export):
```ts
/** SHA-256 of the canonical-form bytes, first 16 lowercase hex characters. */
export function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73). */
export function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}
```

`tests/params-literal-sublanguage-lowering.test.ts:245-255` (its own
byte-identical pair, declared locally rather than imported):
```ts
function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/**
 * The synthesised `$defs` key for a fragment given its canonical form
 * (schema-subset.md:73, and :108 for the reserved `__inline_<slug>` form).
 */
function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}
```

`tests/params-scalar-nontype-text-refusal.test.ts:896-898` (the same routine
inlined into one function rather than split in two, same net bytes):
```ts
function inlineDefName(canonical: string): string {
  return `__inline_${createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16)}`;
}
```

Both in-scope files already import `createHash` from `"node:crypto"`
themselves (`params-literal-sublanguage-lowering.test.ts:1`,
`params-scalar-nontype-text-refusal.test.ts:1`) to build this routine, rather
than importing the pre-built one from `"./helpers/canonical-slug-oracle"` the
way `schema-slug-canonical-form-mints.test.ts:25` does
(`import { assertKeysSorted, compareCodePoint, slugOfCanonicalForm } from
"./helpers/canonical-slug-oracle";`).

## Why this is a problem
The hashing routine in all three sites — the canonical export and both
in-scope files — computes the identical value from the identical input:
SHA-256 of the UTF-8 canonical-form bytes, hex-encoded, truncated to 16
characters, prefixed `__inline_`. Neither in-scope file has a reason specific
to its own subject to recompute this by hand: both already import from
`"node:crypto"` to do so, and six sibling files in the same test family reach
the identical output by importing the shared module instead.

## Suggested direction (non-binding, optional)
Both files could import `slugOfCanonicalForm`/`inlineDefName` from
`"./helpers/canonical-slug-oracle"`, the way `schema-slug-canonical-form-mints.test.ts`
already does, and drop the local hashing routine.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: not applicable — this is a pure hashing function,
  not a recording double or a MUST-NOT witness.
- docs/bugs/ signature search: `grep -rn
  "canonical-slug-oracle\|slugOfCanonicalForm\|inlineDefName"
  docs/bugs/*.md` returns no hits; no bug doc documents a reason to keep the
  hashing routine local to either file. The canonical helper's own header
  comment ("No production canonicaliser or slug helper is imported") was
  checked and refers to NOT importing the *production* `schemaSlug`
  implementation under test, not to avoiding this test-only helper module —
  confirmed by the six other files that already import
  `slugOfCanonicalForm`/`inlineDefName`/`compareCodePoint`/`assertKeysSorted`
  from it.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-literal-sublanguage-lowering\|params-scalar-nontype-text-refusal"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name or assertion, only the definition
  site of a hashing routine, so no bug-doc witness citation is affected.
- Confirmed the canonical export and both local reimplementations,
  re-reading each file immediately before filing.

## Triage
verdict: confirmed — independently re-verified: tests/helpers/canonical-slug-oracle.ts:10-16 exports slugOfCanonicalForm/inlineDefName exactly as excerpted, params-literal-sublanguage-lowering.test.ts:245-255 redeclares the pair byte-identically and params-scalar-nontype-text-refusal.test.ts:896-898 declares the same routine inlined into one function, both importing createHash from node:crypto at line 1 and neither importing the helper (importer grep = exactly the six files named); tests/-only copy-paste helper (D7 class), not a gate/recording-double test, 0 hits in docs/bugs and coverage-matrix for either file, the "schemaSlug deliberately NOT imported" comment concerns the production SUT not the test-only oracle (same ruling as PTQ-0410); not a duplicate — PTQ-0410 (fixed in c79a9039) minted the helper and migrated only its six cited files, neither in-scope file was touched, so this is a residual reimplements-existing-helper filing per the PTQ-0228/0240/0301 precedent; grep shows five further tests/ files still carry local copies, so sites: 2 is scope-honest and understated (triage: claude-fable-5-1)
