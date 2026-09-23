---
id: PTQ-1511
title: params-default-unresolvable-enum-variant.test.ts declares a local registryMessageOf that reimplements the canonical registryMessageOrThrow
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-default-unresolvable-enum-variant.test.ts:309-317
  - tests/helpers/load-row-harness.ts:104-118
sites: 1
fix_scope: localized
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# params-default-unresolvable-enum-variant.test.ts declares a local registryMessageOf that reimplements the canonical registryMessageOrThrow

## Observation
`tests/params-default-unresolvable-enum-variant.test.ts` declares a local
`registryMessageOf(code)` function that reads `registryMessage(REGISTRY,
code)` and throws a loud error naming the missing DIAG-4 Message row when the
template is `undefined`. `tests/helpers/load-row-harness.ts` already exports
`registryMessageOrThrow(registry, code, missingRowContext)`, which performs
the identical read of `registryMessage(registry, code)` and the identical
throw-when-undefined shape, parameterising only a caller-supplied context
string that is appended to the error message. The in-scope file imports
`registryMessage` directly from `../tools/code-registry/index.js` and
`REGISTRY` from `./helpers/registry-oracle`, but does not import
`registryMessageOrThrow` from `./helpers/load-row-harness`, even though the
file already imports two other names (`rootDouble`, `scriptEnvelope`,
`ajvArgsNote`) from a sibling helpers module in the same directory.

## Evidence
tests/params-default-unresolvable-enum-variant.test.ts:309-317 (re-read before filing):
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}
```

tests/helpers/load-row-harness.ts:104-118 (the canonical, already-exported equivalent):
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

The two functions perform the same lookup (`registryMessage(registry, code)`
as `string | undefined`), apply the same guard (`=== undefined`), and throw
the same class of loud, code-naming `Error` before returning the template —
the only functional difference is that the canonical version threads a
caller-supplied `missingRowContext` string into the message while the local
copy hard-codes its own context prose.

## Why this is a problem
`tests/helpers/load-row-harness.ts` was created specifically to centralise
this "read a registry Message row, throw loudly by name on absence" shape
(its own header cites PTQ-0206/PTQ-0207 for the same motivation), and exports
`registryMessageOrThrow` for exactly this call shape. The in-scope file
reimplements the same three-line lookup-and-throw body under a different but
overlapping name (`registryMessageOf`) instead of calling the exported
helper with its own context string, which is the shape this repository has
already resolved once for a sibling file under the identical pattern name
(`PTQ-1342`, `tests/query-annotation-nontype-text-refusal.test.ts`).

## Suggested direction (non-binding, optional)
Calling the already-exported `registryMessageOrThrow(REGISTRY, code, "...")`
in place of the local `registryMessageOf` would let this file share the one
throw-shape the helpers module already centralises; that is an observation
about the existing helper's location, not a design.

## False-positive check
- Gate-pin check: the file is not a `*gate*.test.ts` file and this function
  is not a pinned-count/inventory assertion, so the census/pin carve-out does
  not apply.
- Recording-double check: `registryMessageOf` is a plain lookup-and-throw
  helper, not a recording double, and witnesses no "never called" assertion.
- docs/bugs/ signature search: `grep -ril "registryMessageOf" docs/bugs`
  returned no hits, so no documented correct-reason red cites this local
  function by name.
- coverage-matrix/bug-doc citation search: `grep -rl
  "params-default-unresolvable-enum-variant" docs/reference/coverage-matrix.md
  docs/bugs` returned no hits naming this test file by name; no merge,
  rename or deletion of a cited test is proposed here.
- Coverage drift check: this finding claims no untested path; it is scoped
  to the duplicated helper body quoted above.
- Already-filed check: `grep -ril "unresolvable-enum-variant"
  quality/resolved quality/intake` found no prior finding for this file, and
  the closest precedent (`PTQ-1342`, resolved/fixed) is filed against a
  different file (`tests/query-annotation-nontype-text-refusal.test.ts`), so
  this is a distinct, not-yet-filed occurrence of the same reimplementation
  pattern rather than a duplicate of PTQ-1342.

## Triage
verdict: confirmed — checked myself: the local `registryMessageOf` matches the excerpt word for word at tests/params-default-unresolvable-enum-variant.test.ts:309-317. The canonical `registryMessageOrThrow` has the same body, but it now sits at load-row-harness.ts:150-164, not the cited 104-118. That is line drift only. Both do the same `registryMessage(registry, code) as string|undefined` read and throw if it is undefined. The only difference is the context sentence, and the helper's third parameter exists to carry it. The file imports nothing from load-row-harness. It already imports REGISTRY from registry-oracle, so switching to the helper is mechanical. The local helper is live: 3 wrappers (:324/:331/:346) feed its callers, and those calls sit inside test bodies (:971 onward). The file is under tests/ and is not a gate file or a recording double. docs/bugs has no hit naming the helper. This is D7 boilerplate duplication. It is not a duplicate: resolved PTQ-0499 moved only this file's RegistryRow/REGISTRY read, and PTQ-1342 fixed the same pattern in a different file (query-annotation-nontype-text-refusal). The registry-oracle header's "readers whose wording varies stay local" note did not stop PTQ-1342 from being fixed, so it does not block this one. Minor slip: the Observation says 'two other names' but lists three (triage: claude-opus-5-5)
