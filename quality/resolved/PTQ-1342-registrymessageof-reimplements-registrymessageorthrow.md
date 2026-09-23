---
id: PTQ-1342
title: query-annotation-nontype-text-refusal.test.ts redeclares a local registryMessageOf that reimplements the canonical registryMessageOrThrow
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/query-annotation-nontype-text-refusal.test.ts:129-140
  - tests/helpers/load-row-harness.ts:104-118
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# query-annotation-nontype-text-refusal.test.ts redeclares a local registryMessageOf that reimplements the canonical registryMessageOrThrow

## Observation
`tests/query-annotation-nontype-text-refusal.test.ts` declares a local
`registryMessageOf(code)` function that reads `registryMessage(REGISTRY, code)`
and throws a loud error naming the missing DIAG-4 Message row when the
template is `undefined`. `tests/helpers/load-row-harness.ts` already exports
`registryMessageOrThrow(registry, code, missingRowContext)`, doing the same
read of `registryMessage(registry, code)` and the same throw-when-undefined
shape, parameterising only the caller-supplied context string appended to the
error message. The in-scope file imports `registryMessage` directly from
`../../tools/code-registry/index.js` and `REGISTRY` from
`./helpers/registry-oracle` but does not import `registryMessageOrThrow`.

## Evidence
tests/query-annotation-nontype-text-refusal.test.ts:129-140
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md:74) makes that column this file's ` +
        `only oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. DIAG-2 (:72) makes minting the row part of bug 0203's fix, in ` +
        `the same commit as the site it is raised from ` +
        `(docs/spec_topics/diagnostics/code-registry-parse.md)`,
    );
  }
  return template;
}
```

tests/helpers/load-row-harness.ts:104-118
```ts
export function registryMessageOrThrow(
  registry: readonly RegistryRow[],
  code: string,
  missingRowContext: string,
): string {
  const template = registryMessage(registry, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. ${missingRowContext}`,
    );
  }
  return template;
}
```

## Why this is a problem
Both functions perform the identical read-then-throw sequence over the same
`registryMessage(registry, code)` call, with the same "loud failure naming the
missing row, DIAG-4 anchor" shape; only the trailing context sentence differs,
and that sentence is exactly what `registryMessageOrThrow`'s third parameter
exists to carry. The in-scope file's local copy is a second, independently
maintained implementation of the same read-or-throw contract the helper
module already centralises for this purpose.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts` already exports `registryMessageOrThrow`
for exactly this call shape (registry, code, caller-supplied context).

## False-positive check
- Gate-pin check: this file is not named `*gate*.test.ts` and carries no
  pinned-count census; not applicable.
- Recording-double check: `registryMessageOf` is a message reader, not a
  recording double witnessing a MUST-NOT call; not applicable.
- docs/bugs/ signature search: `grep -rn "query-annotation-nontype-text-refusal" docs/` shows this
  test file is cited by name in docs/bugs/0085, 0203, 0228, and 0252 as a
  witness. This finding does not propose merging, renaming, or deleting the
  test or any of its cells — only that the local `registryMessageOf` helper
  duplicates `registryMessageOrThrow`; the citing bug docs are named here for
  completeness and are not affected by the observation.
- Coverage drift check: the finding does not propose a new test or assert a
  path is untested; it is scoped to existing helper duplication.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/query-annotation-nontype-text-refusal.test.ts:129-140 and tests/helpers/load-row-harness.ts:104-118; the local `registryMessageOf` is the same `registryMessage(registry, code)`→throw-when-`undefined` sequence with the same DIAG-4 anchor sentence, differing only in the trailing bug-0203 context that `registryMessageOrThrow`'s third parameter exists to carry, and the file imports nothing from load-row-harness (grep: 0 hits) while REGISTRY from registry-oracle is a structural superset of the harness's `RegistryRow`, so the fold is mechanical; the local helper is live (5 call sites: :168, :183, :200, :825, :847); all locations under tests/, D7 boilerplate-duplication class, not a gate file, not a recording double, the four citing bug docs (0085/0203/0228/0252) name the file but never the helper identifier and coverage-matrix has 0 hits; dedupe clean — resolved PTQ-0826 migrated only this file's four-page `REGISTRY` read and left `registryMessageOf` in place, PTQ-1089 and the `*-reimplements-registrymessageof` family are ruled per file and cite other files, no open issue names `registryMessageOrThrow`, and same-wave d7-06 cites this file for a disjoint `diagCodes` shadow (triage: claude-fable-5-1)
