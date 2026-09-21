---
id: PTQ-1159
title: collectImportedSpecifierFacts runs seven sequential per-decl/per-specifier phases at 385 LOC while its own return record already names the state object a split would need
lens: D9
status: open
verdict: confirmed
locations:
  - src/extension/import-static-checks.ts:1069-1453
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/import-static-checks.ts#collectImportedSpecifierFacts
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# collectImportedSpecifierFacts runs seven sequential per-decl/per-specifier phases at 385 LOC while its own return record already names the state object a split would need

## Observation
`collectImportedSpecifierFacts` (src/extension/import-static-checks.ts:1069-1453) is 385 LOC, function band strong per the map, inside the same file's strong band. It was created by PTQ-0368's ratified Seam C (its doc comment: "PTQ-0334's own deferred Seam C, PTQ-0368 … Takes as explicit parameters exactly what this loop read from `checkThetaImports`'s scope before this split"); that ratification ruled on extracting the loop FROM `checkThetaImports`, not on the loop's internal wholeness, and no filing has ever carried this function as its host. The body is one `for (const decl of importDecls)` loop (1178) whose inner `for (const specifier of specifiers)` loop (1272) interleaves five independent fact-recording routes (bugs 0138/0429/0430/0448/0465/0466 and 0422) into ten sink collections that the function then returns as one record.

## Evidence
Step inventory (all ranges re-read this session; locals each phase reads/writes stated):

| phase | line ranges | LOC | locals read/written |
|---|---|---|---|
| sink declarations + per-sink rationale comments | 1101-1177 | 77 | writes (declares) `entryResolvedPaths`, `allSpecifiers`, `importedFns`, `importedSchemas`, `importedEnums`, `importedNonCtorNames`, `importedTypeSchemas`, `importedTypeEnums`, `mintedTypeNameCollisions`, `importedSchemaShapes`, `registrationFilteredPaths` |
| per-decl IMP-1 resolution | 1178-1198 | 21 | reads `probe`, `resolver`; writes `diagnostics`, `entryResolvedPaths` |
| IMP-4 parse + bug-0428 unreadable arm + registration filter | 1199-1238 | 40 | reads `parseThetaLib`, `unreadablePaths`; writes `diagnostics`, `registrationFilteredPaths`; calls `walkThetaLib` |
| IMP-3 export set + unknown-symbol check | 1239-1270 | 32 | writes `allSpecifiers`, `diagnostics`; reads `forms`, `resolvedExports` |
| per-specifier ctor/callee fact recording (bugs 0138/0429/0430/0448) | 1272-1364 | 93 | reads `parsed`, `hasCtorSchema`; writes `importedSchemas`, `importedNonCtorNames`, `importedFns`, `importedEnums` |
| bug 0465/0466 type-decl closure + collision minting | 1365-1403 | 39 | reads `collectImportedTypeDecls` result; writes `importedTypeSchemas`, `importedTypeEnums`, `mintedTypeNameCollisions`, `diagnostics` |
| materialization + bug-0422 schema shell + graph seed + return | 1405-1453 | 49 | calls `materializeChain`, `walkThetaLib`; writes `imports`, `importedSchemaShapes`, `libBodyTypesByPath`; returns the 10-field record |

The function's own return type (1089-1100) is already the state object: a record of exactly the ten fact sinks. Excerpt (1441-1448):

```typescript
  return {
    entryResolvedPaths,
    allSpecifiers,
    importedFns,
    importedSchemas,
    importedEnums,
    importedNonCtorNames,
    importedTypeSchemas,
    importedTypeEnums,
```

Importer counts from the map: `collectImportedSpecifierFacts` 0 src / 0 tests (module-private; sole caller `checkThetaImports` at 1913).

## Why this is a problem
Strong band (385 ≥ 200): presumption of breakdown requiring a strong concrete reason. Reasons considered: (a) single algorithm with shared local state — defeated: the ≥6-locals threading cost assumes a state object "would have to be invented", but the object already exists as the function's own declared return record (1089-1100); a per-specifier helper taking `(specifier, parsed, resolvedPath, facts, …)` threads that one record where the inner loop today reads eleven closure variables. (b) closed-enumeration dispatch — the three per-specifier lookups mirror `IMPORTED_SPECIFIER_DECLARATION_KINDS` (1043-1047), but the length is in the per-route recording blocks (93 + 39 LOC), not in three short arms. (c) data-only — no. (d) grammar production — no. (e) generated — hand-written. Strong reasons: the bug-0138 emission-order pin (the `registrationFilteredPaths` comment, 1163-1176: the filter "must land BEFORE that decl's unknown-symbol check … in emission order") defeats only a deferred/post-pass reorganization, not an extraction called at the same point in the same order; no measured cost; no reverted split; no `quality/exemptions.json` entry; PTQ-0368's ratification (on record) ruled on the Seam-C extraction itself, not on keeping this body unsplit.

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies one. Seam A: the per-specifier body (1272-1436, ~165 LOC) -> module-private `recordImportedSpecifierFacts(specifier, parsed, resolvedPath, facts, deps)` (hypothesis), where `facts` is the existing return-record type given a name — 0 exported symbols moved, 0 external importers, cross-references back into the host: `collectImportedTypeDecls`, `isDifferentImportedTypeDecl`, `importedTypeNameCollisionDiagnostic`, `materializeChain` (already a parameter). Seam B: the IMP-4 parse/unreadable/registration-filter block (1199-1238) -> module-private `admitDirectImportLib` (hypothesis) — 0 exports moved, reads `parseThetaLib`/`unreadablePaths`/`walkThetaLib` as parameters, preserving the pinned in-loop emission position. None identified yet beyond these two.

## False-positive check
Band: strong (385 ≥ 200) from the authoritative map, not recounted. Reasons-considered list above with the defeating evidence per reason (the return-record-as-existing-state-object defeat for reason (a); the order-pin scope limit for the strong-invariant claim). Exemptions check: no key for this host or file in `quality/exemptions.json` (read this session). Generated-code check: hand-written (bug-numbered rationale comments throughout). Spec-mirror check: `IMPORTED_SPECIFIER_DECLARATION_KINDS` is a 3-key completeness ledger, not an enumeration whose arm count explains 385 LOC. Duplicate check: grep over quality/ shows no prior filing with this `d9_host`; PTQ-0304/0334/0368/0418 are resolved function-host filings on `#checkThetaImports`; PTQ-0331 (per-specifier `collectBodyTypes` recompute) is resolved and its fix (`libBodyTypesByPath`, 1271) is present, a different root cause.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives collectImportedSpecifierFacts :1069-1453 / 385 LOC / strong band, 0/0 importers, sole caller checkThetaImports :1913, no import-static-checks key in exemptions.json; all seven row ranges, the return-record/return-type excerpts, the :1163-1176 emission-order pin and :1043-1047 ledger match the current code; rows are distinct spec-numbered per-decl phases and distinct-sink per-specifier routes (rows 6-7 do reuse row 5's schemaDecl/enumDecl finds and the inner loop touches ~16 closure vars of which the record names 10 — mintedTypeNameCollisions/libBodyTypesByPath/diagnostics/imports sit outside it — so the reason-(a) rebuttal is thinner than stated but not overlooked); PTQ-0368's ratification ordered the loop out verbatim and ruled nothing on its interior, PTQ-0418 covered Seam D, sibling d9-01 is the file host — not a duplicate; D9 breakdown caps at questionable, the Seam A/B shape is a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently at HEAD: size-scan map gives collectImportedSpecifierFacts 1069-1453 / 385 LOC / band strong (FN strong ≥ 200), not exported, 0/0 importers, sole caller checkThetaImports (now :1897, filing's :1913 is drift from e7c3be9b), no import-static-checks key among the 4 rows of quality/exemptions.json; all seven inventory ranges, the ten-field return type (1089-1100) and return record (1441-1452), the bug-0304/0138 emission-order pin (1163-1176) and the 3-key IMPORTED_SPECIFIER_DECLARATION_KINDS ledger (1043-1047) match the source verbatim; rows are real distinct concerns — IMP-1/IMP-4/IMP-3 are spec-numbered per-decl steps with disjoint sinks, and the per-specifier routes (0138/0429/0430/0448 → importedSchemas/importedNonCtorNames/importedFns/importedEnums; 0465/0466 → importedTypeSchemas/importedTypeEnums/mintedTypeNameCollisions; 0422 → importedSchemaShapes) each write different sinks read by different downstream consumers; reason (a) was engaged not overlooked, though its rebuttal is overstated: the inner loop threads ~16 names (parsed/resolvedPath/sourcePath/frontmatter as inputs; mintedTypeNameCollisions, libBodyTypesByPath, diagnostics, imports sit OUTSIDE the return record), so a `facts` record covers 10 of the sinks, not all — whether that residual threading cost is acceptable is exactly the design ruling; the emission-order pin is a bug-test pin, not a spec clause, and constrains a deferred pass, not a same-position extraction; not a duplicate — PTQ-0368's ratification ("Bodies verbatim with comments") ordered the loop out of checkThetaImports and explicitly ruled only on that seam and Seam D, PTQ-0418 fixed Seam D, intake d9-01 (file host) and qw20260920223212-d9-03 (#checkThetaImports residual) carry different host keys; D9 breakdown caps at questionable — human ratifies or refuses Seam A/B (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time at HEAD: size-scan map (manifest = the one file) gives collectImportedSpecifierFacts 1069-1453 / 385 LOC / band strong, not exported, 0/0 importers, sole caller checkThetaImports :1897 (filing's :1913 is line drift only); quality/exemptions.json has 4 keys, none under import-static-checks; all seven inventory row ranges, the 10-field return type (1089-1100) and return record (1441-1452), the IMPORTED_SPECIFIER_DECLARATION_KINDS ledger (1043-1047) and the bug-0304/0138 order-pin comment (1163-1176) match the source verbatim; rows are distinct concerns — IMP-1/IMP-4/IMP-3 write disjoint sinks, and the per-specifier routes write different sinks for different downstream consumers; reason (a) was engaged, not overlooked, though the filing undercounts (the inner loop touches ~15 names, not eleven; mintedTypeNameCollisions/diagnostics/imports/libBodyTypesByPath sit outside the return record, so a `facts` record does not absorb all the threading) — but the true cross-phase intermediate state is only schemaDecl/enumDecl/hasCtorSchema/libBodyTypesByPath (4, under the ≥ 6 bar), so this is a debatable rebuttal not a miscounted dismissal, i.e. the human's call; the order pin is a bug-test pin preserved by a same-position extraction; git -S shows only the PTQ-0331/0368 landings (32b4ce8e, 82efa599), no reverted split; not a duplicate — PTQ-0368's ratification ("Bodies verbatim with comments") ruled on lifting the loop out and explicitly withheld only Seam D (closed by PTQ-0418, host #checkThetaImports), and sibling intakes carry different host keys (file host d9-01, whose own triage note points here; #checkThetaImports d9-03; #createImportResolutionKit d9-02); D9 breakdown caps at questionable — Seam A/B shape is a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
