---
id: pending
title: createImportResolutionKit still bundles the pass parser and the import-graph walk (two independently consumed facilities with disjoint state) in one 129-LOC factory after the PTQ-1208 materializer extraction
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/import-resolution-kit.ts:383-511
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/import-resolution-kit.ts#createImportResolutionKit
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# createImportResolutionKit still bundles the pass parser and the import-graph walk (two independently consumed facilities with disjoint state) in one 129-LOC factory after the PTQ-1208 materializer extraction

## Observation
`createImportResolutionKit` (src/extension/import-resolution-kit.ts:383-511) is 129 LOC — justify band (FN_BANDS justify >= 100) per the authoritative map. The PTQ-1208 fix (commits a9428009/61321b91) moved the four-facility factory out of import-static-checks.ts into this file and extracted the module-scope/materialization pair into `createMaterializer` (239-376). The residual body still bundles the two remaining facilities — the bug-0428 pass-scoped `.thetalib` parser and the imports.md §Cycles graph walk — plus the materializer delegation, returned as one 8-field record. Map importers: 1 src / 0 tests.

## Evidence
Distinct-concern inventory (ranges re-read this session):

| concern | members | line ranges | LOC |
|---|---|---|---|
| pass parser: path-keyed parse cache + bug-0428 unreadable ledger | `parseCache` (389), `unreadablePaths` (398), `parseThetaLib` closure | 389-427 | ~39 |
| graph walk: imports.md §Cycles transitive edge walk + IMP-1 diagnostics | `graphEdges` (437), `walked` (438), `walkThetaLib` closure | 429-497 | ~69 |
| materializer delegation + 8-field return record | `createMaterializer(...)` call, return | 499-511 | 13 |

Each facility's state is written by exactly one closure: `parseCache`/`unreadablePaths` only by `parseThetaLib`; `graphEdges`/`walked` only by `walkThetaLib`. The cross-facility channel is two bindings — `walkThetaLib` calls `parseThetaLib` (line 445) and reads `unreadablePaths.has(...)` (line 483) — plus the factory parameters `probe`/`resolver`/`diagnostics`: five named crossings, under the six-local bar. The sole caller consumes the handles independently (checkThetaImports destructures the record and threads `walkThetaLib`, `materializeChain`, `parseThetaLib`, `unreadablePaths`, `walked`, `graphEdges` into separate downstream helpers — the same independent-consumption accounting PTQ-1208's triage recorded).

Excerpt (499-511, the bundle boundary):
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

## Why this is a problem
Justify band (129 >= 100): presumption of breakdown, not filed only on a concrete recorded reason. Reasons considered and defeated: (a) single algorithm with shared local state — two facilities with disjoint state clusters; the crossings are five named bindings (< 6), and the caller consumes the handles separately, so this is a bundle of closures, not one algorithm; (b) closed-enumeration dispatch — no switch mirrors a spec-named set (the walk's import/export edge split at 468-472 is two arms of one loop); (c) data-only — the body is imperative closures, not tables; (d) grammar production — not a parser routine (it delegates parsing to parseViaPassCache); (e) generated — hand-written (bug-numbered rationale comments 391-397, 429-436). Note for the ruling: PTQ-0418 (2026-09-17) originally ratified the 8-field bundled shape inside import-static-checks.ts, and PTQ-1208 (confirmed, fixed) then split the materializer out — the residual two-facility bundle under this new host key has no ruling of its own.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: pass parser (`parseCache`, `unreadablePaths`, `parseThetaLib`) -> `createPassThetaLibParser(deps)` factory in this file or pass-parse-cache.ts (hypothesis) — ~39 LOC, 0 exported symbols today (the handle is returned via the kit record), 0 external importers beyond the kit's 1 src caller, cross-references back into the host: `walkThetaLib`'s two reads (`parseThetaLib`, `unreadablePaths`) become two threaded parameters. Seam B: none further — `createMaterializer` (239-376) is the ratified PTQ-1208 co-move unit (mutual recursion) and stays.

## False-positive check
Band: 129 LOC / justify quoted from the shard's authoritative map (383-511), all cited ranges re-read before filing. Reasons considered: five concrete classes enumerated with defeating evidence. Exemptions check: quality/exemptions.json has 4 entries, none for this file or host key. Generated-code check: hand-written (bug 0428/0264/0302/0304/0333 rationale comments). Spec-mirror check: imports.md §Cycles specifies the walk's semantics, not a closed enumeration this body's length mirrors. Dedupe: PTQ-1208 (resolved, fixed) was keyed to src/extension/import-static-checks.ts#createImportResolutionKit at 258 LOC/strong — its fix created this host; PTQ-1432 (resolved, misplacement) moved the stranded helpers here; PTQ-1275 targets the imports resolver cycle seams under a different host; the same-wave d2 candidate (buildmodulescope-unread-return-field) is a dead-field claim, different class. No PTQ or intake filing carries this host key. Sibling disposition: `createMaterializer` (138 LOC, justify) kept whole — recorded in this wave's notes (mutual recursion buildModuleScope↔materializeChain sharing moduleScopeCache, moduleScopeInProgress, parseThetaLib, probe, resolver plus each other's references: 6+ bindings a split would thread).

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives createImportResolutionKit 383-511 / 129 LOC / band justify (FN justify ≥ 100) / 1 src 0 tests importers, the host key is a #function so the file's exempt band does not shield it, and none of the 4 quality/exemptions.json entries covers this file or host; the 499-511 return-record excerpt is byte-exact and the inventory holds as two distinct state clusters — parseCache(389)/unreadablePaths(398) written only by parseThetaLib (401/402/420/424), graphEdges(437)/walked(438) written only by walkThetaLib (440/443/496) — with the parser→walk crossings being exactly parseThetaLib (444, cited 445) and unreadablePaths.has (486, cited 483) plus the probe/resolver/diagnostics parameters = 5 < 6, so reason (a) is not overlooked; walkThetaLib is self-recursive and calls the parser one-way (no mutual recursion, unlike the createMaterializer pair), and the sole caller checkThetaImports (import-static-checks.ts:517-525) destructures 7 of 8 fields and threads them into separate downstream helpers (parseThetaLib/unreadablePaths/walkThetaLib/materializeChain → collectImportedSpecifierFacts :550-553; walked/parseThetaLib/unreadablePaths → resolveReExportClosure :652; parseCache → checkReachedLibSubagentFns :667; graphEdges → checkImportCycles :670; walked → resolvedLibs :709), consistent with a closure factory rather than one algorithm; no closed-enumeration/data/grammar/generated/spec-invariant/measured-cost/reverted-split reason applies (the doc comment's traversal-order guarantee belongs to the walk alone and survives any parser split); not a duplicate — PTQ-1208 (resolved, fixed) was keyed to import-static-checks.ts#createImportResolutionKit at 258/strong and its fix note records only Seam A landed ("Extracted createMaterializer … kit LOC 258 → 129") with no reason given for leaving Seams B/C bundled, PTQ-1432 is a misplacement, PTQ-1284 the file residual, and the same-wave d2-01 is the dead buildModuleScope field; for the ruling: the qw20260923010657 D9 pass (REVIEW_LOG:789) kept this 129-LOC kit whole as "mutually recursive closures over shared caches, PTQ-1208 seam landed" — a lens-worker disposition, not a human ruling, and its mutual-recursion premise is true of createMaterializer but not of the parser/walk pair — and PTQ-0418 (2026-09-17) verbatim ratified the 8-field bundle, so the human must weigh a further ~39-LOC parser extraction (129 → ~90, justify → zone) against that lineage; D9 breakdown never confirms (triage: claude-fable-5-1)
verdict: questionable — accounting verified with small drift: I re-ran size-scan map and it now gives createImportResolutionKit 383-510 / 128 LOC, still justify (FN justify ≥ 100), with 1 src and 0 test importers. The file is in the exempt band, but the host key names the function, so that does not shield it, and no quality/exemptions.json entry covers it. Same-wave commit 343c417d (the PTQ-1446 dead-field fix) removed buildModuleScope, so the 499-511 excerpt and the "8-field record" are stale: the destructure is now `{ materializeChain }` and the return record has 7 fields. The inventory is still real: parseCache/unreadablePaths are written only by parseThetaLib (401-424), and graphEdges/walked only by the self-recursive walkThetaLib (437-496). The walk depends on the parser one way only (calls at 444 and 486), with no mutual recursion. Counting probe/resolver/diagnostics gives 5 crossings, under 6, so reason (a) was not overlooked. The sole caller checkThetaImports (import-static-checks.ts:517-525) passes the handles to separate helpers. No other concrete or strong reason applies. Not a duplicate: PTQ-1208 was keyed to the old host at 258 LOC/strong, and PTQ-1446 is the dead field. Whether to extract a ~39-LOC parser, weighed against the PTQ-0418 bundle ratification, needs a human ruling (triage: claude-opus-5-5)
verdict: questionable — accounting verified at HEAD ad83876a with small drift: size-scan map gives createImportResolutionKit 383-510 / 128 LOC, band justify (FN justify ≥ 100), 1 src / 0 test importers. The file is in the exempt band, but the host key names the function, and no exemptions.json entry covers it. The 499-511 excerpt and the "8-field record" are stale because PTQ-1446 removed buildModuleScope: the destructure is now `{ materializeChain }` and the return record has 7 fields. The inventory is still real: parseCache/unreadablePaths are written only by parseThetaLib (389-424), and graphEdges/walked only by the self-recursive walkThetaLib (437-496). The parser-to-walk dependency runs one way (calls at 444 and 486), with no mutual recursion. Counting probe/resolver/diagnostics gives 5 crossings, under 6, so reason (a) was not overlooked. The sole caller, import-static-checks.ts:517-525, destructures all 7 fields. No other concrete or strong reason applies, and no other quality file carries this host key. Whether to extract the ~39-LOC parser, weighed against the PTQ-0418 bundle ratification, needs a human ruling (triage: claude-opus-5-5)
