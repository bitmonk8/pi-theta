---
id: PTQ-1446
title: createImportResolutionKit's returned buildModuleScope field is never read by its sole caller
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/import-resolution-kit.ts:499-509
  - src/extension/import-static-checks.ts:517-525
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# createImportResolutionKit's returned buildModuleScope field is never read by its sole caller

## Observation
`createImportResolutionKit` destructures `buildModuleScope` out of
`createMaterializer`'s return object and re-exposes it as a field of its own
return object. `checkThetaImports` (`import-static-checks.ts`) is the only
call site of `createImportResolutionKit` in the repository, and its
destructuring assignment omits `buildModuleScope` — it takes `parseThetaLib`,
`walkThetaLib`, `materializeChain`, `parseCache`, `walked`, `graphEdges`, and
`unreadablePaths`, but not `buildModuleScope`. The underlying `buildModuleScope`
closure itself is alive and load-bearing: `materializeChain` (defined in the
same `createMaterializer` closure) calls it directly at
`import-resolution-kit.ts:342` without going through the returned field.

## Evidence

`src/extension/import-resolution-kit.ts:499-509` — the kit's return object
includes `buildModuleScope` as a top-level field:
```ts
  const { materializeChain, buildModuleScope } = createMaterializer(parseThetaLib, probe, resolver);

  return {
    parseThetaLib,
    walkThetaLib,
    materializeChain,
    buildModuleScope,
    parseCache,
    walked,
    graphEdges,
    unreadablePaths,
  };
```

`src/extension/import-static-checks.ts:517-525` — the sole call site's
destructuring omits `buildModuleScope`:
```ts
  const {
    parseThetaLib,
    walkThetaLib,
    materializeChain,
    parseCache,
    walked,
    graphEdges,
    unreadablePaths,
  } = createImportResolutionKit(deps, probe, resolver, diagnostics);
```

`src/extension/import-resolution-kit.ts:342` — `materializeChain` reaches
`buildModuleScope` directly from the enclosing closure, not through the
returned field:
```ts
      return {
        ...direct,
        moduleScope: await buildModuleScope(resolvedPath, body, callingFrontmatter),
      };
```

Search performed: `grep -rn "\.buildModuleScope\b" --include=*.ts src/ tests/
extensions/ tools/` — zero hits anywhere in the repository. `grep -rn
"createImportResolutionKit" --include=*.ts src/ tests/` — two hits total, the
declaration (`import-resolution-kit.ts:383`) and the one call site
(`import-static-checks.ts:525`); no test imports `createImportResolutionKit`
directly.

## Why this is a problem
The `buildModuleScope` field on `createImportResolutionKit`'s return object is
unreachable: nothing anywhere accesses `.buildModuleScope` on the value that
call returns. The function it names is real and used, but only through the
closure capture inside `materializeChain`, not through this exposed field —
the field is a re-export path with a hit count of zero at its one use site,
distinct from the "declaration alive, no external importer" precedent (which
covers unused `export` keywords on live declarations) because here the
concrete consuming destructuring statement is visible and it explicitly
excludes this named field.

## Suggested direction (non-binding, optional)
Dropping the `buildModuleScope` field from `createImportResolutionKit`'s
return object (and from the destructured tuple naming inside
`createMaterializer`'s consumption, if desired) would not change any observed
behaviour, since no consumer reads that field today.

## False-positive check
- `grep -rn "\.buildModuleScope\b"` across src/, tests/, extensions/, tools/:
  zero hits — no property access on the field anywhere.
- `grep -rn "createImportResolutionKit"` across src/, tests/: two hits, the
  declaration and its one call site; confirmed the call site's destructuring
  list by reading `import-static-checks.ts:517-525` directly.
- Confirmed `buildModuleScope` (the function, not the field) is still called
  live from `materializeChain` inside the same closure
  (`import-resolution-kit.ts:342`), so this is not a claim that the function
  itself is dead — only that the outer re-exposed field is unread.
- No test file imports `createImportResolutionKit` directly, so this is not a
  test-only-reachable case either; the field is unreachable from all callers.

## Triage
verdict: confirmed — reproduced: excerpts match at import-resolution-kit.ts:499-509 / import-static-checks.ts:517-525; `createImportResolutionKit` has one caller (import-static-checks.ts:109 import, :525 call) whose destructuring omits `buildModuleScope`; grep across src/ tests/ extensions/ tools/ finds no `.buildModuleScope`, string-keyed, or `ReturnType<typeof createImportResolutionKit>` consumer, so the returned field is a dead re-export introduced by the PTQ-1208 extraction (commit a9428009) while the closure stays live via `materializeChain` (:342); D2 dead-code in src/, mechanical drop, no open PTQ tracks it (same-wave d9-02 sibling is a breakdown filing, different class) (triage: claude-fable-5-1)
