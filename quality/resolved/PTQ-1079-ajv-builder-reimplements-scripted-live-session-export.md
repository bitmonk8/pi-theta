---
id: PTQ-1079
title: generic-argument-literal-lowering.test.ts and seven siblings retype the JSON.stringify-slug AjvSchemaValidator builder instead of importing tests/helpers/scripted-live-session-harness.ts's exported ajv()
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/generic-argument-literal-lowering.test.ts:364-374
  - tests/helpers/scripted-live-session-harness.ts:110-112
  - tests/helpers/proto-named-harness.ts:8-11
  - tests/union-arm-literal-const-lowering.test.ts:450-459
  - tests/b0372-active-set-restore-protocol.test.ts:363-369
  - tests/b0433-active-set-advisory-note-no-details.test.ts:307-313
  - tests/literal-union-string-enum-emission.test.ts:294-300
  - tests/params-literal-sublanguage-lowering.test.ts:444-450
  - tests/quality-loop-empty-tail-return-validation.test.ts:256-262
  - tests/query-schema-transitive-defs.test.ts:91-97
  - tests/unresolved-annotation-lowering.test.ts:243-249
sites: 8
fix_scope: cross-module        # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# generic-argument-literal-lowering.test.ts and seven siblings retype the JSON.stringify-slug AjvSchemaValidator builder instead of importing tests/helpers/scripted-live-session-harness.ts's exported ajv()

## Observation
`tests/helpers/scripted-live-session-harness.ts` exports `ajv(): AjvSchemaValidator`,
which constructs a real `AjvSchemaValidator` with a no-op `emit` and the
shared `jsonSlug` content-addressing function (`tests/helpers/proto-named-harness.ts`),
whose behaviour is `slug = canonicalBytes = JSON.stringify(schema)`. The
in-scope file `tests/generic-argument-literal-lowering.test.ts` instead
declares its own module-scope `function ajv()`, computing the identical
`{ slug: canonicalBytes, canonicalBytes }` pair from `JSON.stringify(schema)`
by hand, and does not import the shared export. Seven further sibling files
declare a `function ajv()` of the same name computing the same
`slug`/`canonicalBytes` pair from `JSON.stringify(schema)`, none importing
the shared export either.

## Evidence
`tests/generic-argument-literal-lowering.test.ts:364-374` (in scope,
re-read immediately before filing):
```ts
/**
 * The real AJV seam — `strict: false`, `allErrors: true`, the shipped validator,
 * content-addressed exactly as `src/extension/production-composition.ts` does.
 */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => {
    const canonicalBytes = JSON.stringify(schema);
    return { slug: canonicalBytes, canonicalBytes };
  };
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

`tests/helpers/scripted-live-session-harness.ts:110-112` — the canonical,
already-exported builder:
```ts
/** The production AJV validator (matches the sibling live-seam harnesses). */
export function ajv(): AjvSchemaValidator {
  return new AjvSchemaValidator({ emit: () => {}, slugOf: jsonSlug });
}
```

`tests/helpers/proto-named-harness.ts:8-11` — `jsonSlug`, imported by the
canonical `ajv()` above, computing the identical pair the local copies
hand-derive:
```ts
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

`tests/union-arm-literal-const-lowering.test.ts:450-459` — the same
doc-commented variant as the in-scope file, byte-identical apart from the
doc comment's line wrap:
```ts
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => {
    const canonicalBytes = JSON.stringify(schema);
    return { slug: canonicalBytes, canonicalBytes };
  };
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

`tests/b0372-active-set-restore-protocol.test.ts:363-369`,
`tests/b0433-active-set-advisory-note-no-details.test.ts:307-313`,
`tests/literal-union-string-enum-emission.test.ts:294-300`,
`tests/params-literal-sublanguage-lowering.test.ts:444-450`,
`tests/quality-loop-empty-tail-return-validation.test.ts:256-262`,
`tests/query-schema-transitive-defs.test.ts:91-97` and
`tests/unresolved-annotation-lowering.test.ts:243-249` each declare, at the
cited lines:
```ts
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```
— the same `slug`/`canonicalBytes` computation as `jsonSlug`, spelled with
an object-literal arrow body instead of a local `canonicalBytes` variable.

Exact search: `grep -n "^function ajv(): AjvSchemaValidator" tests/*.ts` →
12 hits. Three of those twelve
(`tests/b0355-repair-terminal-masked-followup-slot.test.ts:154`,
`tests/b0399-boundary-event-attempts-tokens-masked.test.ts:369`,
`tests/b0465-imported-annotation-vacuous-validation.test.ts:157`) hardcode a
fixed string (`"probe"`, `"review-summary"`) as `slug` rather than
content-addressing it, so they compute a functionally different value and
are excluded from `sites` above; the remaining 9 (the in-scope file plus the
8 cited siblings) all compute the identical `slug = canonicalBytes =
JSON.stringify(schema)` pair `jsonSlug` already names and exports.

## Why this is a problem
Nine files independently retype the same real-`AjvSchemaValidator`
construction with the same content-addressing rule, and
`tests/helpers/scripted-live-session-harness.ts` already names, exports, and
re-exports this exact construction as `ajv()` (built on the shared
`jsonSlug` from `tests/helpers/proto-named-harness.ts`) for callers
elsewhere in the suite. None of the nine imports it. A change to how a
`LoweredSchema` is content-addressed for AJV compilation (for example
switching the digest scheme) would need to be applied at the shared helper
and at nine independent local copies to stay in agreement.

## Suggested direction (non-binding, optional)
Importing `ajv` from `tests/helpers/scripted-live-session-harness.ts` (or a
schema-validator-specific re-export of the same builder) in place of each
local declaration is the consolidation point the existing export and its
current importers already establish.

## False-positive check
- Gate-pin check: none of the nine files matches `*gate*.test.ts` or a
  named gate kin; not applicable.
- Recording-double check: `ajv()` constructs a real `AjvSchemaValidator` for
  positive schema-validation behaviour, not a call-recording "never called"
  witness; not applicable.
- docs/bugs/ signature search: `grep -rl "function ajv()" docs/bugs/*.md` →
  0 hits; no documented correct-reason red covers this construction.
- coverage-matrix/bug-doc citation search: `grep -n
  "generic-argument-literal-lowering\|union-arm-literal-const-lowering\|b0372-active-set-restore-protocol\|b0433-active-set-advisory-note-no-details\|literal-union-string-enum-emission\|params-literal-sublanguage-lowering\|quality-loop-empty-tail-return-validation\|query-schema-transitive-defs\|unresolved-annotation-lowering"
  docs/reference/coverage-matrix.md` → 0 hits for all nine files. This
  finding proposes no merge, rename, or deletion of any `it()`/`describe()`
  block, only that the identical builder function be imported rather than
  retyped.
- Overlap check: `grep -rli "function ajv()\|realAjv\b\|realAjvValidator"
  quality/issues/*.md quality/resolved/*.md` finds prior filings
  (PTQ-0490, PTQ-0749, PTQ-0824, PTQ-0871, PTQ-0905, PTQ-0971, PTQ-1022, and
  several resolved siblings) each covering a *different* named variant
  (`realAjv`, `realAjvValidator`, `childRegimeRootDouble`, or a helper-file
  reimplementation of `ajv()`) in a disjoint set of files; none of their
  `locations` cites any of the nine files named here, and none names the
  bare `function ajv()` group cited in this finding.
- Coverage-drift check: this claim is about a repeated fixture-builder
  DEFINITION already covered by an existing exported helper and its
  supporting `jsonSlug` function, not about a missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: `grep -n "^function ajv(): AjvSchemaValidator" tests/*.ts` → exactly the 12 hits named; mktemp sed-extracts of the 9 cited copies fall into two byte-identical md5 groups (generic-argument :368-374 ≡ union-arm :450-456 with the local `canonicalBytes` variable; b0372/b0433/literal-union/params-literal/quality-loop/query-schema/unresolved-annotation ≡ the object-literal arrow body), both computing `slug = canonicalBytes = JSON.stringify(schema)` exactly as `jsonSlug` (proto-named-harness.ts:8-11) consumed by the exported `ajv()` at scripted-live-session-harness.ts:110-112; the three exclusions (b0355/b0399 `"probe"`, b0465 `"review-summary"`) do hardcode the slug and are correctly excluded; none of the 9 files imports scripted-live-session-harness, proto-named-harness or `jsonSlug`, every local copy is live (2-8 call sites per file), and the shared export is live (8 files import `ajv` by name); docs/bugs `function ajv()` → 0, coverage-matrix → 0 for all nine stems, no *gate* file, real-validator builder not a recording double, no it()/describe() merge proposed; not a duplicate — PTQ-0490 (resolved, `realAjv` in the three inbound-* files), PTQ-0749 (resolved, subagent-fn-child-regime helper), PTQ-0971 (open, `realAjvValidator` in 13 disjoint files), PTQ-0824/0425/1003 and the qw20260918050411 d7-02/04/57-02 rulings (the `{validator, emitted}` capturingAjv variant) cite none of these nine files, and PTQ-0534 touched b0372 only for its rootDouble body; one accounting correction for acceptance: `sites: 8` undercounts — 9 identical local copies are cited in Evidence (the in-scope file plus 8 siblings) (triage: claude-fable-5-1)
