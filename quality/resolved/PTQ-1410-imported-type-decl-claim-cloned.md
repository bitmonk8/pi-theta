---
id: PTQ-1410
title: collectImportedTypeDecls claims imported schema and enum names with duplicated helper logic
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/import-specifier-facts.ts:182-189
  - src/extension/import-specifier-facts.ts:191-198
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923010657
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# collectImportedTypeDecls claims imported schema and enum names with duplicated helper logic

## Observation
In src/extension/import-specifier-facts.ts, the `collectImportedTypeDecls` closure detects bug-0466 imported-type-name collisions by tracking which declaration originally claimed each name. It keeps separate maps and helper functions for schemas (`originalSchemaOf` / `schemas` / `claimSchema`) and enums (`originalEnumOf` / `enums` / `claimEnum`). The two `claim*` helpers are byte-identical apart from the TypeScript types and the map identifiers they touch.

## Evidence
**Copy 1 — schema claim helper**
```src/extension/import-specifier-facts.ts:182-189
const claimSchema = (name: string, decl: SchemaDecl, storedValue: SchemaDecl): void => {
  const claimant = originalSchemaOf.get(name);
  if (claimant === undefined) {
    originalSchemaOf.set(name, decl);
    schemas.set(name, storedValue);
  } else if (claimant !== decl) {
    collidedNames.add(name);
  }
};
```

**Copy 2 — enum claim helper**
```src/extension/import-specifier-facts.ts:191-198
const claimEnum = (name: string, decl: EnumDecl, storedValue: EnumDecl): void => {
  const claimant = originalEnumOf.get(name);
  if (claimant === undefined) {
    originalEnumOf.set(name, decl);
    enums.set(name, storedValue);
  } else if (claimant !== decl) {
    collidedNames.add(name);
  }
};
```

**Diff verdict:** renamed-only (type-2). The control flow, the `undefined` / `!== decl` / `collidedNames.add` semantics, and the order of operations are identical; only the type parameters and map names differ. No clone-map group exists for this pair; the pair was hand-diffed.

## Why this is a problem
The two helpers encode the same first-wins / collision-detection rule for the two declarable kinds handled by `collectImportedTypeDecls`. If a future change adjusts the rule for one kind — for example, switching from reference equality to structural comparison, exempting alias re-claims, or adding a side effect when a collision is recorded — the other must move in lockstep or schema and enum imports will be diagnosed inconsistently. Because the logic is duplicated rather than shared, there is nothing that forces them to stay in step.

## Suggested direction (non-binding, optional)
Introduce a single generic claim helper inside `collectImportedTypeDecls` parameterized by the map and value type, or extract the rule into a small module-private function. The natural shared home is within src/extension/import-specifier-facts.ts, since both callers are internal to this file.

## False-positive check
- Re-read both excerpts at the cited lines immediately before filing; both are live code.
- Searched src/ for `claimSchema` and `claimEnum` identifiers: only these two occurrences exist.
- Searched quality/intake and quality/issues for prior filings referencing `claimSchema`, `claimEnum`, or `collectImportedTypeDecls` claim logic: none found.
- The duplicated block is hand-written business logic, not a spec-normative vector table, generated code, or test code.
- The clone-scan map for this shard reported no groups, so this finding is hand-diffed rather than map-derived.

## Triage
verdict: confirmed — both excerpts byte-match at src/extension/import-specifier-facts.ts:182-189 and 191-198 and hand-diff confirms type-2 (only `SchemaDecl`/`EnumDecl` and the `originalSchemaOf`+`schemas` / `originalEnumOf`+`enums` map identifiers differ; control flow, `=== undefined` first-wins store, `!== decl` → `collidedNames.add` identical); both copies live (claimSchema called at :220/:222, claimEnum at :247/:249 inside visitSchema/visitEnum); `node tools/quality/clone-scan.mjs map` on the file reports no groups, matching the filing's hand-diffed claim; grep of quality/ for claimSchema/claimEnum finds no prior filing and sibling d4-02 covers the distinct aggregation-loop pair in recordImportedSpecifierFacts, not this one; a mechanical dedupe (one generic claim helper over the two map pairs) is the fix (triage: claude-fable-5-1)
