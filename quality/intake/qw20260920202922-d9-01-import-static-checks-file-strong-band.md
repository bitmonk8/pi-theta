---
id: pending
title: import-static-checks.ts hosts ten separable import-subsystem concerns in one 2134-LOC module after four in-file function seams landed without moving any code out
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/import-static-checks.ts:1-2134
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/import-static-checks.ts
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# import-static-checks.ts hosts ten separable import-subsystem concerns in one 2134-LOC module after four in-file function seams landed without moving any code out

## Observation
`src/extension/import-static-checks.ts` is 2134 LOC (file band strong per the authoritative map). Its header states the module's role: "Load-time (compose-pass) wiring for the `.thetalib` import subsystem … Each check reuses an existing, unit-tested checker/resolver rather than reimplementing it (mirrors the invoke static-check compose pass in invoke-static-checks.ts)" (lines 1-5). The ratified `checkThetaImports` seam lane (PTQ-0304 → PTQ-0334 → PTQ-0368 → PTQ-0418, all resolved/fixed) extracted `resolveReExportClosure`, `collectImportedSpecifierFacts`, `createImportResolutionKit`, and `checkTransitiveLibDeclarations` as module-private top-level functions — but every extraction stayed in this file, so the FILE never left its band (2057 LOC at PTQ-0304, 1935 at PTQ-0418, 2134 today after the bug-0466 and bug-0473-era commits). No file-level breakdown finding has ever been filed against this host (every prior `d9_host` on it is `#checkThetaImports`).

## Evidence
Distinct-concern inventory (declaration ranges and LOC from the map; every range re-read this session):

| concern | members | line ranges | LOC |
|---|---|---|---|
| thetalib probe + pass-parse cache surface | `CachingThetaLibProbe` (exported, 1 src/0 tests), `ParsedThetaLib` (exported, 1/0), `thetalibStem` | 227-230, 589-669 | 83 |
| `.thetalib` form/name extraction | `collectImports`, `enumsOf`, `ThetaLibDeclarationStmt`, `isThetaLibDeclarationStmt`, `collectTopLevelNames`, `referencedNamedTypes`, `extractThetaLibForms` | 233-305, 461-499 | 81 |
| imported type-decl closure (bug 0465/0466) | `importedTypeNameCollisionDiagnostic`, `DECL_SHAPE_POSITION_KEYS`, `isDifferentImportedTypeDecl`, `collectImportedTypeDecls` | 161-218, 338-451 | 146 |
| symbol materialization | `MATERIALIZE_SYMBOL_DECLARATION_KINDS`, `materializeSymbol` | 508-572 | 51 |
| re-export closure resolution (imports.md §Re-exports) | `resolveReExportClosure` | 754-1033 | 280 |
| per-specifier fact collection (PTQ-0368 Seam C) | `IMPORTED_SPECIFIER_DECLARATION_KINDS`, `collectImportedSpecifierFacts` | 1043-1453 | 390 |
| resolution/graph/scope kit (PTQ-0418 Seam D1) | `createImportResolutionKit` | 1460-1725 | 266 |
| transitive lib-level checks (PTQ-0418 Seam D2) | `checkTransitiveLibDeclarations` | 1732-1836 | 105 |
| diagnostic constructor + registration predicate | `unreadableThetaLibDiagnostic`, `isRegistrationError` | 140-149, 575-581 | 17 |
| orchestration + public surface | `ThetaImportCheck` (1 src/1 test), `checkThetaImports` (1 src/22 tests) | 667-733, 1848-2134 | 352 |

Ten rows; every member except `CachingThetaLibProbe`/`ParsedThetaLib`/`ThetaImportCheck`/`checkThetaImports` is module-private with 0 src / 0 test importers per the map. The file's own history already demonstrates the cross-module shape three times: `patchSystemTemplateForImports` lives in `./import-system-template-patch.ts`, the four imported-symbol usage checks live in `./invoke-imported-checks.ts` (PTQ-0370's ratified move), and `resolveAndParseThetaLibReference` lives in `./thetalib-load-parse.ts` — each imported back at lines 106, 122-128, 130 of this file.

## Why this is a problem
Strong band (2134 ≥ 2000): presumption of breakdown requiring a strong concrete reason to keep the file whole. Reasons considered and defeated: (a) single algorithm with shared local state — the ten concerns communicate through explicit parameters already (the four landed seams pass `probe`/`resolver`/`parseThetaLib`/`diagnostics` as arguments, not shared scope), so no new state object is needed; (b) closed-enumeration dispatch — the module wires spec items IMP-1..IMP-7 but the LOC lives in four 105-390-LOC helpers, not in enumeration arms; (c) data-only — 3 small constant tables (`DECL_SHAPE_POSITION_KEYS`, two `_KINDS` records), far under 80%; (d) grammar production — not a parser routine; (e) generated — hand-written (bug-numbered comments; git log shows incremental bug-fix commits). Strong reasons: no spec-cited single critical section spans the helpers (each is called once, in sequence, from `checkThetaImports`); no measured cost; no reverted split — the opposite, seven extractions (four in-file, three cross-module) landed and stuck; no `quality/exemptions.json` entry for this host (read this session — only binder/discovery keys exist).

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies one. Seam A: `resolveReExportClosure` (754-1033) -> `./import-reexport-closure.ts` (hypothesis) — 280 LOC, 0 exported symbols moved (one new export minted), 0 external importers, cross-references back into the host: `extractThetaLibForms`, `unreadableThetaLibDiagnostic`, `CachingThetaLibProbe`, `ParsedThetaLib` (would need exporting or co-moving). Seam B: `createImportResolutionKit` + `CachingThetaLibProbe` + `ParsedThetaLib` + `unreadableThetaLibDiagnostic` (140-149, 589-669, 1460-1725) -> `./import-resolution-kit.ts` (hypothesis) — ~360 LOC, 2 exported symbols moved (`CachingThetaLibProbe`, `ParsedThetaLib`; external importer: `./thetalib-load-parse.ts`, 1 src/0 tests each), cross-references back: `enumsOf`, `extractThetaLibForms`, `materializeSymbol`. Seam C: `collectImportedSpecifierFacts` + the bug-0465/0466 type-decl closure group (161-218, 338-451, 1043-1453) -> `./import-specifier-facts.ts` (hypothesis) — ~540 LOC, 0 exported symbols moved, 0 external importers, cross-references back: `extractThetaLibForms`, `unreadableThetaLibDiagnostic`, `isRegistrationError`.

## False-positive check
Band: strong (2134 ≥ 2000) from the authoritative map, not recounted. Reasons-considered list above with the defeating evidence per reason. Exemptions check: no `import-static-checks` key in `quality/exemptions.json` (read this session). Generated-code check: hand-written (no generator marker; git log `9250a343`/`192e4709` are hand-edited bug/quality commits). Spec-mirror check: the header enumerates IMP-1/IMP-3/IMP-4/IMP-5 as wired checks, not as a closed switch whose arm count this file's length mirrors. Duplicate check: PTQ-0304/0334/0368/0418 all carry `d9_host: …#checkThetaImports` (function host) and all are resolved/fixed; grep over quality/ shows no filing with the file-level `d9_host: src/extension/import-static-checks.ts`; no pending intake candidate touches this host.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives 2134 LOC / band strong for the file host; no `import-static-checks` key in quality/exemptions.json; the ten inventory rows re-read at 140-2134 are distinct member groups communicating through explicit parameters (helpers take `probe`/`resolver`/`parseThetaLib`/`diagnostics` as arguments; no module-level shared mutable state), with ~3 small constant tables far under the 80 % data bar, hand-written (commits 9250a343/192e4709 exist as bug/quality edits), no closed-enumeration switch carrying the LOC, and no reverted split (three cross-module extractions — import-system-template-patch.ts, invoke-imported-checks.ts, thetalib-load-parse.ts — landed and stuck); not a duplicate: PTQ-0304/0334/0368/0418 are all `#checkThetaImports` function-host filings and sibling intake d9-02 targets `#collectImportedSpecifierFacts`, so the file-level host key is unfiled; the target shape (which seam, which home) is a design decision for a human ruling (triage: claude-fable-5-1)
