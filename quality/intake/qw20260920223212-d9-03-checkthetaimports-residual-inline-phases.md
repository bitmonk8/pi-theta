---
id: pending
title: checkThetaImports remains 287 LOC after the four ratified seams, with the per-lib subagent-fn checks and the IMP-5 cycle walk still inline in the orchestrator
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/import-static-checks.ts:1832-2118
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/import-static-checks.ts#checkThetaImports
d9_band: strong
wave: qw20260920223212
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# checkThetaImports remains 287 LOC after the four ratified seams, with the per-lib subagent-fn checks and the IMP-5 cycle walk still inline in the orchestrator

## Observation
`checkThetaImports` (src/extension/import-static-checks.ts:1832-2118) is 287
LOC, function band strong per the authoritative map. The ratified seam lane on
this host (PTQ-0304 → PTQ-0334 → PTQ-0368 → PTQ-0418, all status: fixed,
verified this session) extracted the direct-decl loop, the re-export closure,
the resolution kit, and the transitive lib checks; the residual body is the
sequential orchestrator plus two check phases that never left it: the RFC 0001
FN-6/FN-7/FN-9 per-lib `subagent fn` loop and the IMP-5 import-cycle walk.
This filing is the lane's next residual, the same shape as PTQ-0368 (filed
against the residual left by PTQ-0334's fix).

## Evidence
Step inventory (all ranges re-read this session; the shared values each phase
reads/writes are the seam cost):

| phase | line ranges | LOC | reads / writes |
|---|---|---|---|
| doc + signature + `claimDelivery` contract | 1832-1857 | 26 | — |
| empty-import early return | 1858-1867 | 10 | reads `importDecls`, `input.sourcePath` |
| probe/resolver/kit construction + destructure | 1869-1880 | 12 | writes `probe`, `resolver`, 7 kit handles |
| specifier-facts call + 10-field destructure (PTQ-0368 Seam C) | 1882-1910 | 29 | writes 10 fact bindings; passes `diagnostics`, `imports` |
| system-template patch (bugs 0422/0423/0450) | 1912-1919 | 8 | reads `importedSchemaShapes`, `importedEnums`; writes `patchedParts` |
| shared shadow-set / call-site walks (PTQ-0319/0330) | 1921-1938 | 18 | writes `paramsFieldNames`, `shadowedNames`, `callSites` |
| four imported-symbol usage pushes (bugs 0138/0429/0430/0448) | 1940-1990 | 51 | reads the 4 fact maps + `shadowedNames`/`callSites`; writes `diagnostics` |
| re-export closure push (PTQ-0334 seam) | 1992-2007 | 16 | reads `walked`, kit handles; writes `diagnostics` |
| transitive lib declarations (PTQ-0418 Seam D2) | 2009-2020 | 12 | reads `parseCache`, `registrationFilteredPaths`, `allSpecifiers` |
| INLINE: per-lib subagent-fn static resolution + model overrides (RFC 0001 FN-6/FN-7/FN-9) | 2022-2058 | 37 | reads `parseCache`, `deps.parseDeps.modelMatcher`; writes `diagnostics` |
| INLINE: IMP-5 cycle detection over the walked graph | 2060-2081 | 22 | reads `entryResolvedPaths`, `graphEdges`, `input.body`; writes `diagnostics` |
| undelivered claim (bugs 0264/0267) + return-record assembly | 2083-2118 | 36 | reads `diagnostics`, `walked`, `patchedParts`, type-decl maps |

Excerpt of the first inline phase's head (2032-2039):

```typescript
  for (const [resolvedPath, parsed] of parseCache) {
    if (parsed === undefined) {
      continue;
    }
    diagnostics.push(
      ...checkSubagentFnStaticResolution({
        body: parsed.document.body,
        file: resolvedPath,
```

Importer counts from the map: `checkThetaImports` 1 src / 22 tests (exported;
the compose-pass caller).

## Why this is a problem
Strong band (287 ≥ 200): presumption of breakdown, filed unless a strong
concrete reason is on record. Reasons considered and why each fails: (a)
single algorithm with shared local state — the phases already communicate
through named destructured records (the kit's 7 handles, the facts record's 10
fields, `shadowedNames`/`callSites`), and the two inline phases each read ≤3
values (`parseCache` + `modelMatcher`; `entryResolvedPaths` + `graphEdges` +
a fallback range) — far under the 6-local bar, the same extraction shape the
four landed seams used. (b) closed-enumeration dispatch — the four usage-check
pushes mirror the four `checkImported*` routes, but each arm is a ~13-LOC call
to an already-extracted function; the enumeration does not explain the two
37/22-LOC inline loops or the 36-LOC tail. (c) data-only — no. (d) grammar —
no. (e) generated — hand-written. Strong supplements: the bug-0264 order pin
(2083-2091: `claimUndelivered` runs "after every diagnostic … has been
pushed") is positional and survives extraction of any earlier phase called at
the same point — exactly how PTQ-0334/0368/0418's fixes preserved it; no
measured cost; no reverted split (four extractions landed and stuck); no
`quality/exemptions.json` entry for this file or host (read this session).

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies one. Seam A: the per-lib subagent-fn loop
(2022-2058) -> module-private `checkReachedLibSubagentFns(parseCache,
modelMatcher)` returning `Diagnostic[]` (hypothesis) — ~37 LOC, 0 exported
symbols moved, 0 external importers, cross-references back into the host: none
(both callees are module imports). Seam B: the IMP-5 walk (2060-2081) ->
module-private `checkImportCycles(entryResolvedPaths, graphEdges, site)`
(hypothesis) — ~22 LOC, cross-references back: `thetalibStem`. Seam C: the
shared-walk prologue plus the four usage pushes (1921-1990) -> module-private
`checkImportedSymbolUsage(input, facts)` (hypothesis) — ~69 LOC,
cross-references back: none (all four checks live in
`./invoke-imported-checks.ts` already).

## False-positive check
Band: strong (287 ≥ 200) from the authoritative map, not recounted.
Reasons-considered list above with the defeating evidence per reason (the
≤3-values coupling of each inline phase for reason (a); the positional
order-pin scope limit for the strong-invariant claim). Exemptions check:
`quality/exemptions.json` read this session — four keys, none for this file or
host. Generated-code check: hand-written. Spec-mirror check: the phases wire
IMP-1..IMP-7 and RFC 0001 FN-6/7/9, spec-NUMBERED steps whose order the driver
pins — the spec pins order, not one function body, and four prior extractions
preserved it. Duplicate check: PTQ-0304/0334/0368/0418 all status: fixed
(verified this session), each a ratified extraction whose residual invited the
next filing (PTQ-0368 is itself titled "seam-c-STILL-bundled"); this filing
targets only the post-PTQ-0418 residual (the two inline loops and the wiring),
none of which any fixed filing's seam covered; the pending file-level filing
(qw20260920202922-d9-01) and function filing (…-d9-02,
`#collectImportedSpecifierFacts`) carry different host keys and different
code.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives checkThetaImports 1832-2118 / 287 LOC / band strong (FN strong ≥ 200), exported, 1 src / 22 test importers, no import-static-checks key among the 4 quality/exemptions.json entries; all twelve step-inventory rows reproduce at or within 2 lines of the cited ranges (facts call :1897, patch :1914, shadow set :1928, first push :1944, re-export :2006, transitive :2009, subagent-fn loop :2034 not 2032, IMP-5 :2059-2079, bug-0264 pin :2081) and the excerpt content matches at 2034-2041; the two inline phases are real distinct concerns — the FN-6/7/9 loop reads only parseCache + deps.parseDeps.modelMatcher and its three callees are module imports (:118-120), the IMP-5 walk reads entryResolvedPaths + graphEdges + input.sourcePath/body-range with detectImportCycle imported (:75) and thetalibStem module-private (:227), so each seam threads ≤ 4 values, under the ≥ 6-local bar, the same shape PTQ-0418's ratified D1/D2 took; reasons-considered hold (the four checkImported* pushes are ~13-LOC calls to already-extracted functions, not enumeration arms carrying the LOC; hand-written; no reverted split — four in-file extractions stuck; imports.md:143 §Cycles and functions.md FN-6…FN-9 pin detection semantics and codes, not one body; the bug-0264 claimUndelivered pin is positional and unaffected by same-point extraction); not a duplicate — PTQ-0304/0334/0368/0418 are all fixed in resolved/ and each ratification explicitly deferred the next seam, while the pending siblings carry different host keys (file host qw20260920202922-d9-01; #collectImportedSpecifierFacts d9-02; #resolveReExportClosure / #createImportResolutionKit in this wave), though the human must sequence them (one seam per host file per wave); D9 breakdown caps at questionable — which of Seams A/B/C is a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map re-run gives checkThetaImports 1832-2118 / 287 LOC / band strong (file 2118 LOC strong), exported, 1 src / 22 test importers, and quality/exemptions.json's four keys carry no import-static-checks entry; all twelve step-inventory rows reproduce within 2 lines (excerpt at 2034-2041 not 2032-2039; IMP-5 walk 2059-2079; bug-0264 claimUndelivered pin at 2081); the two inline phases are real distinct concerns — the FN-6/7/9 loop reads parseCache + deps.parseDeps.modelMatcher and pushes to diagnostics with all three callees module imports (:118-120), the IMP-5 walk reads entryResolvedPaths + graphEdges + input.sourcePath/body with detectImportCycle imported (:75) and thetalibStem module-private (:227), so each threads ≤ 5 values, under the ≥ 6-shared-local bar; no overlooked keep-whole reason (the four checkImported* pushes are ~13-LOC calls to already-extracted functions, hand-written, four in-file extractions landed and stuck, imports.md:143 §Cycles and functions.md FN-6/FN-7/FN-9 pin codes and semantics not one body, the bug-0264 pin is positional and survives same-point extraction); not a duplicate — PTQ-0304/0334/0368/0418 are all status: fixed in quality/resolved/ with host key #checkThetaImports and each ratification deferred the next seam, while the pending siblings' d9_host keys differ (file host …-d9-01; #collectImportedSpecifierFacts …-d9-02; #resolveReExportClosure / #createImportResolutionKit this wave) so the human must sequence one seam per host file per wave; D9 breakdown caps at questionable — Seam A/B/C is a human ruling (triage: claude-fable-5-1)
