---
id: PTQ-1709
title: import-specifier-facts.ts re-exports referencedNamedTypes without a consumer through that module.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/import-specifier-facts.ts:38-39
  - src/extension/import-type-decls.ts:13-16
  - src/extension/import-type-decls.ts:74-79
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# import-specifier-facts.ts re-exports referencedNamedTypes without a consumer through that module.

## Observation
`import-specifier-facts.ts` re-exports `referencedNamedTypes` from `import-type-decls.ts`. The function is called within its declaring module, but no production or test consumer reaches it through the re-export. The fact collector imports `recordImportedTypeDecls`, not `referencedNamedTypes`.

## Evidence
The re-export surface, `src/extension/import-specifier-facts.ts:38-39`:

```ts
import { recordImportedTypeDecls } from "./import-type-decls";
export { referencedNamedTypes } from "./import-type-decls";
```

The declaration remains in use, `src/extension/import-type-decls.ts:13-16`:

```ts
/** An empty declared set turns the existing unresolved-name walk into a reference walk. */
export function referencedNamedTypes(typeSource: string): readonly string[] {
  return collectUnresolvedNamedTypes(typeSource, new Set());
}
```

Its internal caller, `src/extension/import-type-decls.ts:74-79`:

```ts
    const sources = decl.fields !== undefined ? decl.fields.map((f) => f.typeSource) : (decl.arms ?? []);
    for (const source of sources) {
      for (const ref of referencedNamedTypes(source)) {
        visitSchema(ref, ref);
        visitEnum(ref, ref);
      }
```

`rg -n -F 'referencedNamedTypes' src extensions tools tests` returns exactly three lines: the re-export, declaration, and internal call quoted above. `rg -n 'import-specifier-facts|import-type-decls' src extensions tools tests` returns five lines: the two quoted fact-module lines, the `recordImportedTypeDecls` import in `import-resolution-kit.ts`, and the header mention and named `collectImportedSpecifierFacts` import in `import-static-checks.ts`. No namespace or dynamic consumer appears in that complete module-name search.

## Why this is a problem
This is an unused extraction-facade re-export, not an unused export keyword on a live declaration. The declaration and its internal caller remain reachable independently of this facade. The extra module-level access path has no reader, including among the deliberate witness tests.

## False-positive check
- Identifier census: `rg -l '\breferencedNamedTypes\b' src extensions tools tests` returned the two modules quoted above. The line-level search `rg -n -F 'referencedNamedTypes' src extensions tools tests` returned three hits, including any literal string-keyed spelling of the name.
- Module targets: `rg -n 'import-specifier-facts|import-type-decls' src extensions tools tests` returned five hits, described in Evidence. The sole import through the fact module names only `collectImportedSpecifierFacts`.
- Namespace/dynamic targets: `rg -n '(import\s*\*|export\s*\*|import\s*\(|require\s*\().*(import-specifier-facts|import-type-decls)' src extensions tools tests` returned zero hits.
- Re-export chains: `rg -n 'export\s*\*' src extensions tools tests` returned 16 lines, including a tool comment; none targets either module. The module-name search also includes named re-exports and finds only the reported facade.
- Generic loading check: `rg -n 'import\.meta\.glob|globSync|readdir.*extension|extensions.*readdir' src extensions tools tests` returned one test-comment hit, not a module loader.
- Test-only reachability: the identifier and module-target searches have no test hits; this is not a test-only caller being classified as unused.
- History intent: `git blame -L 34,41 -- src/extension/import-specifier-facts.ts` and `git show a21bd1b2 -- src/extension/import-specifier-facts.ts src/extension/import-type-decls.ts` show that a21bd1b2 moved the declaration into the shared module and added this facade. `rg -n 'referencedNamedTypes|re-export|compatib' docs/bugs/0506*` found no requirement for the facade; its re-export mentions concern library functions/types instead.
- Prior-topic search: searches of `quality/issues` and `quality/resolved` for `referencedNamedTypes` and re-export wording found no finding about this facade. PTQ-1252 concerns facades in `production-theta-producer.ts`, not this module.

## Triage
verdict: confirmed — All excerpts and stated searches reproduce: referencedNamedTypes has only its declaration, internal call and re-export at import-specifier-facts.ts:39; the sole fact-module importer requests only collectImportedSpecifierFacts, with no test, namespace, dynamic or re-export-chain consumer. Commit a21bd1b2 added the unused facade while preserving the live implementation in import-type-decls.ts; no documented compatibility requirement or same-root-cause finding exists (PTQ-1252 targets a different module). (triage: claude-opus-5-5)
