---
id: PTQ-0749
title: subagent-fn-child-regime.ts retypes scripted-live-session-harness.ts's exported ajv() JSON.stringify-slug AjvSchemaValidator builder inline
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/scripted-live-session-harness.ts:112-119
  - tests/helpers/subagent-fn-child-regime.ts:32-47
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-fn-child-regime.ts retypes scripted-live-session-harness.ts's exported ajv() JSON.stringify-slug AjvSchemaValidator builder inline

## Observation
`tests/helpers/scripted-live-session-harness.ts` exports `ajv(): AjvSchemaValidator`, a real `AjvSchemaValidator` constructed with a `slugOf` that content-addresses a `LoweredSchema` by `JSON.stringify`-ing it into both the `slug` and `canonicalBytes` fields. `tests/helpers/subagent-fn-child-regime.ts`'s `childRegimeRootDouble()` builds the identical `slugOf` closure and the identical `AjvSchemaValidator` construction inline, rather than importing `ajv()` from the sibling module.

## Evidence
`tests/helpers/scripted-live-session-harness.ts:112-119`:
```ts
/** The production AJV validator (matches the sibling live-seam harnesses). */
export function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

`tests/helpers/subagent-fn-child-regime.ts:32-47`:
```ts
export function childRegimeRootDouble(): RuntimeRoot {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: new AjvSchemaValidator({ emit: (): void => {}, slugOf }),
  } as unknown as RuntimeRoot;
}
```

Exact search: `grep -n "slugOf = (schema: LoweredSchema)" tests/helpers/*.ts` returns exactly three files repository-wide (`scripted-live-session-harness.ts`, `subagent-fn-child-regime.ts`, and `tool-call-dispatch-harness.ts`, the last outside this review's fifteen-file scope); within scope the pattern occurs at exactly these two sites, both constructing the field-for-field identical `{ slug: JSON.stringify(schema), canonicalBytes: JSON.stringify(schema) }` closure and passing it to `new AjvSchemaValidator({ emit: ..., slugOf })`.

## Why this is a problem
The `slugOf`/`AjvSchemaValidator` construction is not incidental boilerplate invented independently twice — `scripted-live-session-harness.ts` already names and exports it as `ajv()` specifically so a caller can import it ("matches the sibling live-seam harnesses"), and `subagent-fn-child-regime.ts` is exactly such a sibling live-seam harness (both drive real AJV-backed subagent/live-session paths), yet its `childRegimeRootDouble()` retypes the same closure and constructor call in place. A change to how `LoweredSchema` is content-addressed (or to `AjvSchemaValidator`'s constructor shape) would need to be applied at both sites by hand.

## Suggested direction (non-binding, optional)
`childRegimeRootDouble()` importing `ajv()` from `scripted-live-session-harness.ts` (or both importing a shared `ajv()` from a schema-validator-specific helper) is the fix point the existing export already names; the fix stage owns which module becomes the one import target.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or a named gate kin; not applicable.
- Recording-double carve-out: `ajv()`/`childRegimeRootDouble()`'s `AjvSchemaValidator` is a real validator instance, not a call-recording "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -rln "childRegimeRootDouble\|slugOf" docs/bugs/` returned no hits — no documented correct-reason red names either fixture.
- coverage-matrix/bug-doc citation search: `grep -n "scripted-live-session-harness\|subagent-fn-child-regime" docs/reference/coverage-matrix.md` returned no hits; this finding proposes no merge, rename, or deletion of either file or its exports, only that the duplicated closure be imported rather than retyped.
- Prior-filing search: `grep -rl "childRegimeRootDouble" quality/intake quality/resolved` returns no hits other than this file itself (plus the sibling checkpoint/idSource finding filed alongside it in this same wave, which cites `childRegimeRootDouble()` for a disjoint fragment — the checkpoint/idSource pair, not the `slugOf`/AJV construction cited here); no existing filing covers this specific `slugOf`/`AjvSchemaValidator` duplication.
- Coverage-drift check: this finding is about fixture-construction code that exists identically in both files and does not assert any behaviour path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at the cited lines (scripted-live-session-harness.ts:112-119 exports `ajv()`; subagent-fn-child-regime.ts:32-47 `childRegimeRootDouble()` inlines the field-identical `slugOf` + `new AjvSchemaValidator({ emit, slugOf })`), both modules are live (3 and 4 importers), and git chronology supports "retypes rather than imports" — the `ajv()` export landed 2026-09-14 (feefe7ca, PTQ-0328's fix) and subagent-fn-child-regime.ts was created 2026-09-15 (89faa7c5); the stated `tests/helpers/*.ts` grep reproduces at exactly 3 files (the third, tool-call-dispatch-harness.ts:94 `rootDouble()`, is named in the filing), though the "repository-wide" gloss is wrong and should be corrected at ticketing — repo-wide the same closure is a 46-site suite idiom (87 files construct AjvSchemaValidator), which does not defeat the helpers-scoped root cause since tests/helpers/ is the canonical home; carve-outs re-run and clear (no gate file, real validator not a recording double, 0 hits for childRegimeRootDouble/slugOf-fixture in docs/bugs/ beyond unrelated slug bugs, 0 coverage-matrix hits, no merge/rename/delete proposed); not a duplicate — resolved PTQ-0209 is the AJV-less NOOP_CHECKPOINT/rootDouble/producer trio in test files, PTQ-0328/PTQ-0238 are the filings that minted these two helpers, and same-wave intake d7-63 cites the same function for the disjoint checkpoint/idSource pair — D7 copy-paste fixture, mechanical import fix (triage: claude-fable-5-1)
