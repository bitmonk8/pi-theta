---
id: PTQ-0036
title: checkTypeLayer's paramsFields defaults to [] "so an existing two-argument caller keeps compiling" but its only caller passes three arguments
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/type-layer-checks.ts:331-337
  - src/parser/theta-document.ts:1343-1347
sites: 1
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# checkTypeLayer's paramsFields defaults to [] "so an existing two-argument caller keeps compiling" but its only caller passes three arguments

## Observation
`checkTypeLayer` declares its third parameter with a default,
`paramsFields: readonly ParamsFieldSource[] = []`, and its doc comment closes
with "Defaults to `[]` so an existing two-argument caller keeps compiling."
The function has exactly one call site in the repository, and that call passes
all three arguments. No test or tool calls the function. The default value is
therefore exercised by no caller, and the sentence describes a caller shape
with zero occurrences.

## Evidence
src/parser/type-layer-checks.ts:331-337:
```ts
 * Defaults to `[]` so an existing two-argument caller keeps compiling.
 */
export function checkTypeLayer(
  body: ThetaBody,
  file: string,
  paramsFields: readonly ParamsFieldSource[] = [],
): Diagnostic[] {
```

The sole call site, src/parser/theta-document.ts:1343-1347:
```ts
  const typeLayerDiags = checkTypeLayer(
    { statements, tail: resolvedTail },
    file,
    (frontmatter?.params?.fields ?? []).map((f) => ({ name: f.wireName, typeSource: f.type })),
  );
```

Search: `grep -rn "checkTypeLayer(" src extensions tools tests` → 2 hits: the
definition (type-layer-checks.ts:333) and the call above. All other mentions of
`checkTypeLayer` in src and tests are comments (e.g.
tests/let-arm-withhold-binding-scoped.test.ts:94, comment text only).

## Why this is a problem
Vestigial default: the compatibility shim protected the pre-bug-0192
two-argument call while the third argument was being threaded; that caller was
migrated (the call above passes the projected `params:` fields), leaving the
default unreachable at every call and the justifying sentence describing a
state that no longer exists anywhere in the repository.

## Suggested direction (non-binding, optional)
The default and its sentence can follow the caller migration — the parameter's
one caller always supplies the value.

## False-positive check
- Call-site search: `checkTypeLayer(` across src/, extensions/, tools/,
  tests/ — definition plus one call, which passes three arguments.
- Dynamic access: searched tests for namespace/string-keyed access to the
  module (`import * as typeLayerChecks` exists in
  tests/annotation-nontype-text-refusal.test.ts and
  tests/let-annotation-inline-object-compat.test.ts); the bracketed lookups
  there name `letAnnotationToCompatType` and other exports, never
  `checkTypeLayer` (`grep -rn '"checkTypeLayer"' tests src` → 0 hits).
- Re-exports: no `export *` in src; no module re-exports checkTypeLayer.
- Test-only-caller rule: not applicable — the claim is about the default
  value, not about the function's liveness; the function is production-live.
- Git history intent: the doc paragraph above the sentence records bug 0192
  threading the third argument from theta-document.ts, which is exactly the
  migration that retired the two-argument shape.

## Triage
verdict: confirmed — re-ran the hunt: one call site (theta-document.ts:1343) passing three args, no re-export/string-keyed/namespace access, and blame shows bug 0050's commit 3efdb4ac added the `= []` default while migrating that same sole caller, so the "two-argument caller" the sentence protects has never existed (triage: claude-opus-5)
