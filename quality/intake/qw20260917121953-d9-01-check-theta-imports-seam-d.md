---
id: pending
title: checkThetaImports still bundles the resolution/cycle-graph plumbing (its four nested closures) with six downstream check phases at 608 LOC after Seam C landed
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/import-static-checks.ts:1328-1935
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/import-static-checks.ts#checkThetaImports
d9_band: strong
wave: qw20260917121953
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-17
---

# checkThetaImports still bundles the resolution/cycle-graph plumbing (its four nested closures) with six downstream check phases at 608 LOC after Seam C landed

## Observation
`checkThetaImports` (src/extension/import-static-checks.ts:1328-1935) is 608 LOC in the strong band (map: 1/37 importers) inside a 1935-LOC justify-band file. This is the human-sanctioned re-file pre-announced in resolved PTQ-0368's ratification: "Seam D (resolution and cycle-graph plumbing) is NOT ratified — D9 re-files after." Seam C landed (`collectImportedSpecifierFacts` now sits at :966-1316 and the function delegates to it at :1632), yet the function still hosts four nested resolution closures (`parseThetaLib`, `walkThetaLib`, `buildModuleScope`, `materializeChain`) followed by six sequential check phases.

## Evidence
Distinct-concern inventory (all ranges re-read this session):

| concern | members | line ranges | LOC |
|---|---|---|---|
| pass-scoped parse plumbing | `parseCache`, `unreadablePaths`, `parseThetaLib` | 1351-1404 | 54 |
| transitive import-graph walk | `graphEdges`, `walked`, `walkThetaLib` (IMP-1 edge diagnostics) | 1406-1475 | 70 |
| declaring-module scope building (bug 0303) | `moduleScopeCache`, `moduleScopeInProgress`, `buildModuleScope` (map: 1488-1547, 60 LOC, zone) | 1477-1547 | 71 |
| re-export chain materialisation (imports.md §Re-exports) | `materializeChain` | 1549-1614 | 66 |
| per-specifier facts + system-template patch + shared precompute | `collectImportedSpecifierFacts` call, `patchSystemTemplateForImports`, `paramsFieldNames`, `shadowedNames`, `callSites` | 1616-1673 | 58 |
| imported-symbol usage checks (bugs 0138/0429/0430/0448) | four `checkImported*` pushes | 1675-1726 | 52 |
| re-export closure + transitive lib-level checks | `resolveReExportClosure` push (:1741); `[...parseCache]` snapshot loop — registration filter, lib IMP-3 unknown symbols, lib name collisions (:1763-1823); theta-level IMP-3 (:1826-1837) | 1728-1837 | 110 |
| lib subagent-fn checks (RFC 0001 FN-6/FN-7/FN-9) | `checkSubagentFnStaticResolution` / `checkSubagentFnModelOverrides` loop | 1839-1876 | 38 |
| IMP-5 cycle walk + delivery claim + result assembly | `graph`, `detectImportCycle` loop, `undelivered`, return record | 1877-1935 | 59 |

Boundary excerpt (:1741, the closure delegation between phases):

```typescript
  diagnostics.push(
    ...(await resolveReExportClosure(walked, parseThetaLib, probe, resolver, unreadablePaths)),
  );
```

Seam-C delegation already in place (:1620-1632): "PTQ-0368 Seam C: resolve every direct `import` declaration's specifiers ... split out to `collectImportedSpecifierFacts` above". Importer counts from the map: `checkThetaImports` 1 src / 37 tests.

## Why this is a problem
Strong band (608 LOC ≥ 200): presumption of breakdown requiring a strong concrete reason to keep whole. Reasons considered: (a) single algorithm with shared local state — the four plumbing closures share `probe`, `resolver`, `parseCache`, `unreadablePaths` (4 pieces, under the ≥6-local bar; the landed Seams A/B/C already demonstrated the explicit-parameter pattern at this exact seam cost); (b) closed-enumeration dispatch — no spec-named switch, this is a phase sequence; (c) data-only — 0% tables; (d) grammar production — not a parser routine; (e) generated — hand-written. Strong reasons: no `quality/exemptions.json` entry for this host; no measured cost on record; no reverted split (git shows the opposite: three ratified extractions landed); the only human ruling on record (PTQ-0368) explicitly invites this re-file for Seam D.

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies: Seam D1: the four resolution closures + their caches (:1351-1614, ~261 LOC) -> module-private `createImportResolutionKit` (hypothesis) returning `{ parseThetaLib, walkThetaLib, materializeChain, buildModuleScope, parseCache, walked, graphEdges, unreadablePaths }` — 0 exported symbols moved, 0 external importers, cross-references back into the host: none (they call only module-level helpers that stay). Seam D2: the transitive lib-level check pass (:1763-1837, ~75 LOC) -> module-private `checkTransitiveLibDeclarations` (hypothesis) — 0 exports moved, reads `parseCache`/`registrationFilteredPaths`/`probe`/`resolver`/`parseThetaLib` as parameters. None identified yet for the remainder.

## False-positive check
Band: strong (608 ≥ 200) from the authoritative map, not recounted. Reasons-considered list above with defeating evidence per reason. Exemptions check: `quality/exemptions.json` has no `import-static-checks` key (read this session). Generated-code check: hand-written, hand-commented (git log: incremental bug-fix commits, no generator). Spec-mirror check: the phases cite imports.md §Cycles/§Re-exports and RFC 0001, but as sequential phases, not a closed enumeration's arms. Duplicate check: PTQ-0304/0334/0368 are all resolved/fixed, each closed by its own landed seam; this files the pre-announced remainder (Seam D), not their subject matter.

## Triage
verdict: questionable — accounting verified: size-scan map re-run confirms checkThetaImports :1328-1935 at 608 LOC / strong band with no exemptions.json entry; all nine inventory rows and the :1741 / :1620-1632 excerpts match the current code; the four closures share <6 locals (probe/resolver/parseThetaLib/unreadablePaths) and no concrete/strong keep-whole reason was overlooked; PTQ-0304/0334/0368 are all fixed in resolved/ and 0368's ratification verbatim invites this Seam D re-file (not a duplicate); the target shape (D1 kit / D2 lib pass) needs a human ruling (triage: claude-fable-5-1)
