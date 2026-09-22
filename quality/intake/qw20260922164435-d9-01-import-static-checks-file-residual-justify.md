---
id: pending
title: import-static-checks.ts remains at 1899 LOC (justify band) after PTQ-1147's Seam A landed alone, still hosting the resolution-kit and per-specifier-facts concern groups PTQ-1147's Seams B and C named
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/import-static-checks.ts:1-1899
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/import-static-checks.ts
d9_band: justify
wave: qw20260922164435
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# import-static-checks.ts remains at 1899 LOC (justify band) after PTQ-1147's Seam A landed alone, still hosting the resolution-kit and per-specifier-facts concern groups PTQ-1147's Seams B and C named

## Observation
`src/extension/import-static-checks.ts` is 1899 LOC (file band justify per the authoritative map). Its header states the module's role: "Load-time (compose-pass) orchestration for the `.thetalib` import subsystem, with re-export closure resolution in import-reexport-closure.ts" (lines 1-2). PTQ-1147 (confirmed, fixed) filed the file at 2134 LOC / strong band with three seam hypotheses; the fix landed Seam A only (`resolveReExportClosure` → `./import-reexport-closure`, now line 4 of this file's import list per the map), dropping the file 2134 → 1899 — one band down, still over the justify threshold (1000). Seam B (resolution kit) and Seam C (specifier-facts group) named in PTQ-1147 were not applied; both member groups remain in this file, now grown by two further in-file extractions (`recordImportedSpecifierFacts` from PTQ-1159's fix, `createMaterializer` from PTQ-1208's fix) that again stayed in the file.

## Evidence
Distinct-concern inventory (declaration ranges and LOC from the authoritative map; ranges re-read this session):

| concern | members | line ranges | LOC |
|---|---|---|---|
| thetalib probe + parse surface | `thetalibStem`, `CachingThetaLibProbe` (exported, 2/0), `ParsedThetaLib` (exported, 2/0) | 226-229, 588-668 | 83 |
| `.thetalib` form/name extraction | `collectImports`, `enumsOf`, `ThetaLibDeclarationStmt`, `isThetaLibDeclarationStmt`, `collectTopLevelNames`, `referencedNamedTypes`, `extractThetaLibForms` (exported, 1/0) | 232-304, 460-498 | 78 |
| imported type-decl closure (bug 0465/0466) | `importedTypeNameCollisionDiagnostic`, `DECL_SHAPE_POSITION_KEYS`, `isDifferentImportedTypeDecl`, `collectImportedTypeDecls` | 160-217, 337-450 | 145 |
| symbol materialization | `MATERIALIZE_SYMBOL_DECLARATION_KINDS`, `materializeSymbol`, `createMaterializer` | 507-571, 1201-1338 | 189 |
| per-specifier fact collection (PTQ-1147 Seam C) | `IMPORTED_SPECIFIER_DECLARATION_KINDS`, `ImportedSpecifierFacts`, `ImportedSpecifierFactDeps`, `recordImportedSpecifierFacts`, `collectImportedSpecifierFacts` | 742-1198 | 430 |
| resolution/graph kit (PTQ-1147 Seam B) | `createImportResolutionKit` | 1345-1473 | 129 |
| transitive lib-level checks | `checkTransitiveLibDeclarations`, `checkReachedLibSubagentFns`, `checkImportCycles` | 1480-1649 | 149 |
| diagnostic constructor + registration predicate | `unreadableThetaLibDiagnostic` (exported, 1/0), `isRegistrationError` | 139-148, 574-580 | 17 |
| orchestration + public surface | `ThetaImportCheck` (exported, 1/1), `checkThetaImports` (exported, 1/22) | 671-732, 1661-1899 | 301 |

Nine rows; every member except the six exported names above is module-private with 0/0 importers per the map. The cross-module shape the fix already demonstrated once more: `resolveReExportClosure` now lives in `./import-reexport-closure.ts` and is imported back (the map's import list), joining the earlier extractions `./import-system-template-patch`, `./invoke-imported-checks`, `./thetalib-load-parse`.

## Why this is a problem
Justify band (1899 ≥ 1000): presumption of breakdown unless a concrete reason to keep whole is found. Reasons considered and defeated: (a) single algorithm with shared local state — no module-level `let`/`var`; the nine groups communicate through explicit parameters (`probe`/`resolver`/`parseThetaLib`/`diagnostics` threaded as arguments, as PTQ-1147's triage verified and which still holds — re-checked this session, `grep -n "^let \|^var " src/extension/import-static-checks.ts` yields 0 hits); (b) closed-enumeration dispatch — the header wires IMP-1..IMP-7 as reused checkers, the LOC sits in 97-239-LOC helpers, not enumeration arms; (c) data-only — three constant tables of 1-5 lines each, far under 80%; (d) grammar production — not a parser routine; (e) generated — hand-written (bug-numbered comments throughout). Exemptions check: no `import-static-checks` key in quality/exemptions.json (4 entries, read this session). PTQ-1147's human ratification accepted the file-level breakdown; the applied fix stopped after Seam A, so the accepted residual remains unfiled under the current band.

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies one — these are PTQ-1147's own Seams B and C restated against current line numbers. Seam B: `createImportResolutionKit` + `createMaterializer` + `CachingThetaLibProbe` + `ParsedThetaLib` + `unreadableThetaLibDiagnostic` (139-148, 588-668, 1201-1473) -> `./import-resolution-kit.ts` (hypothesis) — ~356 LOC, 3 exported symbols moved (`CachingThetaLibProbe`, `ParsedThetaLib` 2/0 each; `unreadableThetaLibDiagnostic` 1/0), cross-references back into the host: `enumsOf`, `extractThetaLibForms`, `materializeSymbol`. Seam C: the per-specifier facts group + the bug-0465/0466 type-decl closure (160-217, 337-450, 742-1198) -> `./import-specifier-facts.ts` (hypothesis) — ~575 LOC, 0 exported symbols moved, 0 external importers, cross-references back: `extractThetaLibForms`, `unreadableThetaLibDiagnostic`, `isRegistrationError`, `thetalib-load-parse` seams.

## False-positive check
Band: justify (1899) from the authoritative map, not recounted. Reasons-considered list above with defeating evidence per reason. Exemptions check: quality/exemptions.json holds 4 keys (binder/discovery/producer), none for this host. Generated-code check: hand-written (bug-annotated prose comments; no generator marker). Spec-mirror check: IMP-1..IMP-7 are wired via reused checkers, no closed switch carries the file's length. Duplicate check: PTQ-1147 is resolved (fix landed Seam A only — verified by the current import list containing `./import-reexport-closure` and the file's own header line 2); every other filing on this file is a `#function` host (PTQ-0304/0334/0368/0418/1159/1208 resolved, PTQ-1209/PTQ-1175 pending are `#checkThetaImports` and the invoke-static-checks sibling file respectively); no pending intake candidate carries the file-level host key (grep of quality/intake this session: only a D2 filing mentions the file as precedent).

## Triage
verdict: questionable — accounting verified: size-scan map on a one-line manifest gives 1899 LOC / band justify (threshold 1000) for the file host; all 30 declarations in the nine inventory rows sit exactly at the cited ranges, `grep -nE "^(let|var) "` yields 0 module-level state, and the big helpers are each called once from checkThetaImports (:1708/:1726/:1835/:1838/:1850/:1853) with deps/probe/resolver/parseThetaLib/diagnostics/unreadablePaths threaded as explicit parameters, so the rows are genuine distinct member groups; reasons-considered hold (header wires IMP-1/3/4/5 as reused checkers, no closed switch carries the LOC; 3 constant tables of 1-5 lines; hand-written; no reverted split — commit 60bd4037 moved resolveReExportClosure OUT to import-reexport-closure.ts and it is live in the import list; TRIAGE_LOG:64/68 are sequencing defers, not refusals); zero `import-static-checks` keys among the 4 quality/exemptions.json entries; not a duplicate — PTQ-1147 (the only prior file-level host filing) is status fixed with Seam A landed and its Seams B/C member groups still resident, every other filing on this file is a `#function` host (PTQ-1159/1208/1209 all now resolved; the candidate's "PTQ-1209/1175 pending" is stale but immaterial), and this is the only intake file carrying `d9_host: src/extension/import-static-checks.ts`; D9 breakdown never confirms — which of Seams B/C and which home is the human's ratification (triage: claude-fable-5-1)
