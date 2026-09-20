---
id: pending
title: Imported schema-constructor and non-constructor type-name checks share an identical object-site prologue
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/invoke-imported-checks.ts:325-341
  - src/extension/invoke-imported-checks.ts:515-531
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Imported schema-constructor and non-constructor type-name checks share an identical object-site prologue

## Observation
`checkImportedSchemaCtorFields` and `checkImportedNonCtorTypeNames` in `src/extension/invoke-imported-checks.ts` are two sibling imported-symbol checks added for bugs 0429 and 0448. Both walk the same `CollectedCallSites.objectExprs` collection and apply the same two filters before judging a named constructor site: skip bare `{ … }` literals (`typeName === null`) and skip names shadowed by local bindings (`isShadowedImportName`). The opening 17-line block of each function is byte-identical except for the imported-data parameter name and the single lookup that follows the shared filters.

## Evidence
Clone-map group G032 (79 tokens, renamed-only) cites both spans.

`src/extension/invoke-imported-checks.ts:325-341` (`checkImportedSchemaCtorFields`):

```typescript
  importedSchemas: ReadonlyMap<string, readonly SchemaFieldSource[]>,
): Diagnostic[] {
  if (importedSchemas.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const { objectExprs } = callSites;
  for (const ctor of objectExprs) {
    if (ctor.typeName === null) {
      // A bare `{ … }` object literal names no schema at all; this route
      // judges named constructor sites only.
      continue;
    }
    const typeName = ctor.typeName;
    if (isShadowedImportName(typeName, shadowedNames)) {
      continue;
    }
    const declaredFields = importedSchemas.get(typeName);
```

`src/extension/invoke-imported-checks.ts:515-531` (`checkImportedNonCtorTypeNames`):

```typescript
  importedNonCtorNames: ReadonlySet<string>,
): Diagnostic[] {
  if (importedNonCtorNames.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const { objectExprs } = callSites;
  for (const ctor of objectExprs) {
    if (ctor.typeName === null) {
      // A bare `{ … }` object literal names no schema at all; this route
      // judges named constructor sites only.
      continue;
    }
    const typeName = ctor.typeName;
    if (isShadowedImportName(typeName, shadowedNames)) {
      continue;
    }
    if (!importedNonCtorNames.has(typeName)) {
```

Diff verdict: renamed-only. The only differences are the parameter name (`importedSchemas` vs `importedNonCtorNames`), the guard expression using that parameter, and the lookup that follows the shared prologue.

## Why this is a problem
The two filters are not incidental: both functions implement the same identifier-resolution rule from `expressions.md` §"Identifier resolution" (arm (1) outranks arm (3)) for imported constructor sites. The file's own doc comments describe the three later imported-symbol checks as "mirroring" each other. If the prologues drift — for example, one drops the `typeName === null` skip or changes the shadowed-name test — the two routes would disagree about which constructor sites are in scope, producing inconsistent diagnostics for schema-field checks versus non-constructible-head checks on the same source construct.

## Suggested direction (non-binding, optional)
A single helper that yields the filtered sequence of named, non-shadowed imported constructor sites from `CollectedCallSites.objectExprs` would own the shared prologue in one place inside `src/extension/invoke-imported-checks.ts`.

## False-positive check
- Re-verified both cited spans in the current file; both copies are live and reached from `checkThetaImports` in `src/extension/import-static-checks.ts`.
- Confirmed the clone-map group G032 matches these exact line ranges.
- The similarity is not a spec-normative vector table; it is application logic that repeats the same precondition twice.
- No test files are involved.

## Triage
