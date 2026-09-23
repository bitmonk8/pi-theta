---
id: PTQ-1411
title: recordImportedSpecifierFacts aggregates schema and enum collisions with duplicated loops
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/import-specifier-facts.ts:439-447
  - src/extension/import-specifier-facts.ts:448-456
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923010657
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# recordImportedSpecifierFacts aggregates schema and enum collisions with duplicated loops

## Observation
In src/extension/import-specifier-facts.ts, after `collectImportedTypeDecls` returns the transitive schema and enum closures for one imported specifier, `recordImportedSpecifierFacts` merges those closures into the per-theta `importedTypeSchemas` and `importedTypeEnums` maps. It emits one `theta/load/imported-type-name-collision` diagnostic when a name reached through two different specifiers resolves to structurally different declarations. The merge loop is written twice: once for schemas and once for enums.

## Evidence
**Copy 1 — schema aggregation loop**
```src/extension/import-specifier-facts.ts:439-447
for (const [name, decl] of transitiveSchemas) {
  const existing = importedTypeSchemas.get(name);
  if (existing === undefined) {
    importedTypeSchemas.set(name, decl);
  } else if (isDifferentImportedTypeDecl(existing, decl) && !mintedTypeNameCollisions.has(name)) {
    mintedTypeNameCollisions.add(name);
    diagnostics.push(importedTypeNameCollisionDiagnostic(specifierSite, name));
  }
}
```

**Copy 2 — enum aggregation loop**
```src/extension/import-specifier-facts.ts:448-456
for (const [name, decl] of transitiveEnums) {
  const existing = importedTypeEnums.get(name);
  if (existing === undefined) {
    importedTypeEnums.set(name, decl);
  } else if (isDifferentImportedTypeDecl(existing, decl) && !mintedTypeNameCollisions.has(name)) {
    mintedTypeNameCollisions.add(name);
    diagnostics.push(importedTypeNameCollisionDiagnostic(specifierSite, name));
  }
}
```

**Diff verdict:** renamed-only (type-2). The iteration, the `undefined` / structural-difference / `mintedTypeNameCollisions` guard, and the diagnostic push are identical; only the source and destination map names differ. No clone-map group exists for this pair; the pair was hand-diffed.

## Why this is a problem
Cross-specifier collision detection must apply the same rule to schemas and enums. If one loop is modified — for example, to change the deduplication key, alter the structural comparison, or skip already-minted collisions differently — the other must mirror it. Otherwise the same collision shape can be refused for one kind and silently accepted for the other. The duplicated code gives the compiler no way to enforce that symmetry.

## Suggested direction (non-binding, optional)
Fold the two loops into a single generic helper that takes a `(name, decl)` iterable, a destination map, the minted-collision set, and the diagnostic sink. The natural shared home is inside `recordImportedSpecifierFacts` or as a module-private helper in src/extension/import-specifier-facts.ts.

## False-positive check
- Re-read both loops at the cited lines immediately before filing; both are live code.
- Searched src/ for the loop body pattern `isDifferentImportedTypeDecl(existing, decl) && !mintedTypeNameCollisions.has(name)`: only these two occurrences exist, both in the same function.
- Searched quality/intake and quality/issues for prior filings referencing these aggregation loops or `transitiveSchemas` / `transitiveEnums`: none found.
- The duplicated block is hand-written business logic, not a spec-normative vector table, generated code, or test code.
- The clone-scan map for this shard reported no groups, so this finding is hand-diffed rather than map-derived.

## Triage
verdict: confirmed — both excerpts byte-match at src/extension/import-specifier-facts.ts:439-447 and :448-456 inside live `recordImportedSpecifierFacts` (sole path via `checkThetaImports`); the two loops differ only in source map (`transitiveSchemas`/`transitiveEnums`) and destination map (`importedTypeSchemas`/`importedTypeEnums`) — the `undefined` set-arm, `isDifferentImportedTypeDecl(existing, decl) && !mintedTypeNameCollisions.has(name)` guard, mint and diagnostic push are identical (renamed-only); re-run grep of that guard across src/ extensions/ tools/ tests/ hits exactly :443 and :452; `node tools/quality/clone-scan.mjs map` on the file reports no groups, so hand-diff stands; hand-written business logic, not a spec vector table; no prior D4 filing on this pair (PTQ-1159/PTQ-1287 are D9 breakdown inventories of the host that merely list the range as one concern) — mechanical dedupe into one helper (triage: claude-fable-5-1)
