---
id: PTQ-0304
title: checkThetaImports bundles nine sequential import-subsystem phases into one 1402-line function
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:656-2057
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/import-static-checks.ts#checkThetaImports # D9 breakdown only: the exemption key, <path> or <path>#<function>
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260913183958
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-13
---

# checkThetaImports bundles nine sequential import-subsystem phases into one 1402-line function

## Observation
`import-static-checks.ts` is 2057 LOC (band strong). Its own header states the module's role: "Load-time (compose-pass) wiring for the `.thetalib` import subsystem … Each check reuses an existing, unit-tested checker/resolver rather than reimplementing it (mirrors the invoke static-check compose pass in `invoke-static-checks.ts`)". `checkThetaImports` (lines 656-2057, 1402 LOC, function band strong) is 68% of the file by itself. Its header comment (lines 583-644, the `ThetaImportCheck` doc) and the module header each separately number the spec items it wires together: IMP-1, IMP-3, IMP-4, IMP-5, three re-export "phases", bug 0422/0423/0450 (`system:` template revalidation), bug 0138/0429/0430/0448 (imported-symbol call/constructor/variant-access checks), and RFC-0001 FN-6/FN-9 (subagent-fn cross-file checks). All of this runs inside one function body; none of it is lifted to a top-level helper the way the sibling module the header cites (`invoke-static-checks.ts`) organizes its own compose pass.

## Evidence
Distinct-concern inventory (concern names are the phases the code's own comments already label):

| concern | members | line range | LOC |
|---|---|---|---|
| Resolution & cycle-graph plumbing | `parseThetaLib`, `walkThetaLib`, `graphEdges`, `walked` | 679-822 | 144 |
| Re-export chain fixpoint & collision diagnosis ("Phase 1/2/3") | `closeOverReExports`, `fixReExportedNames`, `diagnoseReExports`, `resolveDeclaringSite`, `diagnoseReExportCollisions` | 823-1067 | 245 |
| Runtime materialization of imported symbols (IMP-6/IMP-7) | `buildModuleScope`, `materializeChain` | 1068-1208 | 141 |
| Per-specifier resolution & type-fact collection | `importedFns`/`importedSchemas`/`importedEnums`/`importedNonCtorNames`/`importedTypeSchemas`/`importedTypeEnums`/`importedSchemaShapes` + the main `for (const decl of importDecls)` loop | 1209-1503 | 295 |
| `system:` template load-phase wire-rename patch (bug 0422/0423/0450) | `patchedParts` loop | 1506-1791 | 286 |
| Imported-symbol call/constructor/variant-access site checks (bug 0138/0429/0430/0448) | `checkImportedFnCallArgs`, `checkImportedSchemaCtorFields`, `checkImportedEnumVariantAccess`, `checkImportedNonCtorTypeNames` dispatch | 1792-1847 | 56 |
| Transitive lib-level re-export/name-collision checks (bug 0333/0335) | re-export-phase invocation loop + per-lib unknown-symbol/name-collision | 1848-1946 | 99 |
| Own-specifier collision + cross-file subagent-fn checks (RFC-0001 FN-6/FN-9) | `checkImportNameCollisions`, `checkSubagentFnStaticResolution`, `checkSubagentFnModelOverrides` | 1947-1997 | 51 |
| IMP-5 cycle detection + result assembly | `detectImportCycle` loop, `undelivered`/`resolvedLibs`/`patchedSystemTemplate`/`importedTypeDecls` | 1998-2057 | 60 |

Nine rows, each independently named by the code's own comments, each reading/writing a mostly disjoint state subset. Signature + boundary excerpts:

`src/extension/import-static-checks.ts:656-663`
```ts
export async function checkThetaImports(
  input: ThetaCompositionInput,
  deps: {
    readonly fs: FileSystem;
    readonly parseDeps: PassParseDeps;
    /**
     * Bug 0267: whether this call may claim its rows against the pass-scoped
     * delivered-set (bug 0264's dedup). DEFAULT true — every existing call
```

`src/extension/import-static-checks.ts:1506-1512` (system: template patch phase, reads only `importedSchemaShapes`/`importedEnums`/`input.frontmatter`):
```ts
  // bug 0423 route (a) — LOAD-phase sidecar carry (same pass, same walk: 0423
  // needs the identical head resolution 0422 already performs to find a bare
  // param's imported-schema shape). The PARSE-phase `system:` check
  // (system-interpolation.ts) admits any `.Ident` step off an imported schema
  // opaquely, because the sync parser cannot see the `.thetalib`'s fields;
  // `importedSchemaShapes` above now holds the real field set — fields AND
  // wire-rename sidecars/rootDef (`toSystemParamType`'s schema arm already
```

`src/extension/import-static-checks.ts:1848-1852` (re-export phases invoked, then two independent transitive checks over `parseCache`):
```ts
  for (const resolvedPath of walked) {
    await closeOverReExports(resolvedPath);
  }
  diagnoseReExports(fixReExportedNames());
  diagnoseReExportCollisions();
```

Comparator: the sibling module `invoke-static-checks.ts` (cited by this file's own header as the mirrored precedent) is comparable in size (1952 LOC) but organizes its compose-pass role across 20 top-level functions (`grep -nE '^export (async )?function |^(async )?function ' src/extension/invoke-static-checks.ts` — 20 matches); its own largest function, `checkInvokeStaticResolution` (953-1545), is 593 LOC — 809 LOC smaller than `checkThetaImports`.

## Why this is a problem
Function band strong (1402 LOC, threshold 200) — presumption of breakdown requires a strong concrete reason. Reasons considered and why each fails:
- Single algorithm with shared local state: some closures do share `resolver`/`probe`/`parseCache` (3 locals), but no 6-or-more-local bundle spans all nine rows — the `system:` template patch (row 5) touches none of the re-export-fixpoint state (row 2), and the subagent-fn checks (row 8) touch neither. The code's own nine separately-commented phases are the evidence the concerns are already recognized as distinct, only not lifted out.
- Closed-enumeration dispatch: the rows are not arms of one spec-named closed set selected by a discriminant; they are sequential, unconditional phases citing different spec items (IMP-1/3/4/5, three re-export phases, bug 0422/0423/0450, bug 0138/0429/0430/0448, RFC-0001 FN-6/9) run one after another.
- Data-only module/type family: the function is executable orchestration, not tables or type declarations.
- One grammar production family: not a parser production; a compose-pass checker.
- Generated code: no `@generated`/`DO NOT EDIT` marker in the file (checked).
- Strong-band extra (required beyond the concrete reason): no PIC/BNDR/EXST-cited invariant ties all nine rows into one ordered critical section — the "Phase 1/2/3" citation binds only the three re-export-fixpoint closures (row 2) to each other, saying nothing about why the type-fact-collection loop, the `system:` patch, the invoke-static dispatch, or the subagent-fn checks must share this function's body rather than being called in sequence from a smaller composing function. No measured-cost citation exists. `git log --oneline --follow -- src/extension/import-static-checks.ts | grep -i "revert\|split\|extract"` returns no hits — no prior split was reverted. `quality/exemptions.json` carries no entry for this host.

## Suggested direction (non-binding, optional)
Seam A: extract the re-export chain fixpoint (`closeOverReExports`/`fixReExportedNames`/`diagnoseReExports`/`resolveDeclaringSite`/`diagnoseReExportCollisions`, 823-1067, 245 LOC) into a helper taking the parse/resolve collaborators as parameters and returning the settled export map + collision diagnostics -> hypothesis `resolveReExportClosure` (new module-local helper) - 0 exported symbols moved today (all nine closures are unexported), 0 external importers (src/tests), cross-references back into the host: the settled map is read by the transitive per-lib loop (1848-1946) later in the same function.
Seam B: extract the `system:` template load-phase wire-rename patch (1506-1791, 286 LOC) into a helper taking `input.frontmatter`, `importedSchemaShapes`, `importedEnums` -> hypothesis `patchSystemTemplateForImportedSchemas` - 0 exported symbols moved, 0 external importers, cross-references back into host: none (`patchedParts` only feeds the final return's spread).
Seam C: extract the per-specifier resolution loop (1209-1503, 295 LOC) into a helper returning the seven populated maps as one record -> hypothesis `collectImportedSpecifierFacts` - cross-references: the returned record feeds rows 5, 6, and 9.
All three are unproven; a human ratifies the actual split.

## False-positive check
Band: strong (function LOC 1402, threshold 200). Reasons-considered: listed above with the evidence that defeated each (disjoint state per row, no single closed enumeration, no generated-code marker, no measured-cost or prior-split-revert commit, no PIC/BNDR/EXST citation spanning all nine rows). Exemptions check: `quality/exemptions.json` grepped for `import-static-checks.ts` — no entry. Generated-code check: grepped the file for `@generated`/`DO NOT EDIT`/`autogenerated` — no hits; the file is hand-authored prose-commented spec wiring. Spec-mirror check: the module header and the `ThetaImportCheck` doc comment each enumerate the spec sections this function answers (imports.md §Path resolution, §Unknown imported symbol, §Cycles, §Re-exports, §Visibility, §Name collisions, plus RFC-0001 FN-6/9) — six-plus distinct clauses run in sequence, not one closed set a single switch/if-chain dispatches over.

## Triage
verdict: questionable — accounting reproduces: size-scan confirms import-static-checks.ts at 2057 LOC/strong and checkThetaImports at 656-2057/1402 LOC/strong exactly, the 9-row concern inventory's boundaries match the source almost line-for-line, the invoke-static-checks.ts 20-function comparator grep reproduces exactly, and every reasons-considered check (no PIC/BNDR/EXST citation, no generated marker, no reverted-split commit, no exemptions.json entry) holds; two supporting citations are inaccurate (checkInvokeStaticResolution actually ends at 953-1461/509 LOC, not 953-1545/593, and the 1848-1852 excerpt's code is really at 1859-1863) but neither changes the conclusion — D9 breakdown accounting caps at questionable, never confirmed; target shape is a human ruling (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-13): Seam B only. Move the system: template load-phase wire-rename patch - the patchedParts loop at import-static-checks.ts:1506-1791 (bug 0422/0423/0450), 286 LOC - into a new sibling module src/extension/import-system-template-patch.ts as one exported function (hypothesis name patchSystemTemplateForImports) that receives what the block closes over today (input, importedSchemaShapes, importedEnums, diagnostics) and returns what the block produces (patchedParts / patchedSystemTemplate, or pushes into the passed arrays exactly as today); the two file-private helpers it alone uses, importedRootHasWireRename (:136) and loadSystemInterpBadFieldDiagnostic (:470), move with it verbatim (they have no other caller in the file or in src/), so the new module imports nothing from import-static-checks.ts and no runtime cycle arises; checkThetaImports calls the helper at the same point in its sequence. Code moved verbatim by line range with its comments; the new module gets a header stating its role; no logic edits; tsc first, then the full gate; report before/after LOC of the file and of checkThetaImports from size-scan map. Seams A and C are NOT ratified - D9 re-files the next seam after this lands.
