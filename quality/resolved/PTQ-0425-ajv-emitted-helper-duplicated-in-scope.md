---
id: PTQ-0425
title: Both files redeclare a byte-identical emitted-capturing AjvSchemaValidator builder instead of importing a shared one
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-object-wire-name-rename-refusal.test.ts:407-417
  - tests/inline-slug-name-reservation.test.ts:316-326
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both files redeclare a byte-identical emitted-capturing AjvSchemaValidator builder instead of importing a shared one

## Observation
Both files in scope declare a local `ajv()` helper that constructs a real
`AjvSchemaValidator` whose `slugOf` content-addresses a `LoweredSchema` by
`JSON.stringify`-ing it into both the `slug` and `canonicalBytes` fields, and
whose `emit` callback pushes every emitted diagnostic into a local array that
the helper returns alongside the validator. The eleven-line function body is
byte-identical between the two files, including whitespace and the doc
comment above it. Neither file imports the other's copy, and no
`tests/helpers/` module exports this exact `{ validator, emitted }`-returning
shape.

## Evidence
`tests/inline-object-wire-name-rename-refusal.test.ts:407-417`:
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

`tests/inline-slug-name-reservation.test.ts:316-326` (byte-identical body,
reverified with `diff` against the block above — zero output):
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

Pattern-wide search: `grep -rl "function ajv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic\[\] }" tests --include="*.test.ts"` returns exactly 12 files repository-wide (the two in scope plus `annotation-root-brace-union-lowering.test.ts`, `inline-object-duplicate-field-name.test.ts`, `inline-object-field-name-comparison-key.test.ts`, `inline-object-nested-lowering.test.ts`, `inline-object-quoted-field-name-refusal.test.ts`, `params-brace-union-rhs-lowering.test.ts`, `params-inline-object-lowering.test.ts`, `reserved-keyword-type-position.test.ts`, `schema-alias-union-decl.test.ts`, `union-generic-arm-lowering.test.ts`, all outside this review's two-file scope); within scope the two files under review each carry one occurrence, both diff-identical.

## Why this is a problem
The `ajv()` builder is harness plumbing — how a test obtains a real, call-recording `AjvSchemaValidator` for direct-construction assertions — not domain logic specific to either bug 0160 or bug 0040. `tests/helpers/scripted-live-session-harness.ts` already exports an `ajv(): AjvSchemaValidator` built from the identical `slugOf` closure (named there specifically so sibling harnesses can import it), but that export discards emitted diagnostics (`emit: () => {}`) rather than capturing them, so neither file in scope can use it as-is; instead each independently retypes the capturing variant rather than either importing that export and layering a capture wrapper over it, or adding a capturing sibling beside it.

## Suggested direction (non-binding, optional)
A shared, capture-returning `ajv()` variant beside `tests/helpers/scripted-live-session-harness.ts`'s existing `ajv()` export (or a `tests/helpers/registry-oracle.ts`-style schema-validator helper module) is the natural home the identical closures in both files point at; the fix stage owns which module becomes the shared source.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns; not applicable.
- Recording-double check: the `emit`/`emitted` pair here does record calls, but it backs value-comparison assertions (`emitted.map((d) => d.code)` compared against expected code lists) rather than a "never called" MUST-NOT witness, so the negative-witness carve-out does not change the duplication claim — the finding is about the CONSTRUCTION helper being reimplemented, not about any assertion being illegitimate.
- docs/bugs/ signature search: `grep -rln "function ajv()" docs/bugs/0160* docs/bugs/0040*` returns no hits; neither bug document states a rationale for keeping this builder local to each file.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-wire-name-rename-refusal\|inline-slug-name-reservation" docs/reference/coverage-matrix.md` returns no hits; this finding proposes no change to any `it()`/`describe()` name, count, or assertion, only to where the `ajv()` builder is defined.
- Coverage check: the claim is entirely about a repeated harness-function DEFINITION; every copy is exercised by the tests in its own file, and no behaviour path is claimed untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (407-417 / 316-326) and `diff` of the two extracted 12-line blocks is empty; the stated pattern search returns exactly the same 12 tests/*.test.ts files; both copies are live (wire-name file calls ajv() at 1202/1230/1260 and reads `emitted`, slug file calls it at 330); tests/helpers/scripted-live-session-harness.ts:113-119 exports only the non-capturing `emit: () => {}` variant so no shared capturing builder exists; no gate/coverage-matrix/bug-doc carve-out applies (grep of docs/reference/coverage-matrix.md and docs/bugs/0040*,0160* for the two files / `function ajv()` returns nothing); no tracked or resolved PTQ covers this shape (PTQ-0328 deduped the non-capturing `ajv(): AjvSchemaValidator` trio in b0288/b0319/b0414; PTQ-0410 covers the canonical-slug oracle functions, not this builder) — note same-wave intake siblings d7-118-03 and d7-02-schema-alias-union-decl file the same 12-file root cause from other shards and should be merged at acceptance (triage: claude-fable-5-1)
