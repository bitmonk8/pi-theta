---
id: PTQ-1287
title: collectImportedSpecifierFacts remains at 219 LOC (strong band) after PTQ-1159's Seam A landed, with the IMP-4 admit block PTQ-1159's Seam B named still inline
lens: D9
status: open
verdict: confirmed
locations:
  - src/extension/import-static-checks.ts:980-1198
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/import-static-checks.ts#collectImportedSpecifierFacts
d9_band: strong
wave: qw20260922164435
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# collectImportedSpecifierFacts remains at 219 LOC (strong band) after PTQ-1159's Seam A landed, with the IMP-4 admit block PTQ-1159's Seam B named still inline

## Observation
`collectImportedSpecifierFacts` (src/extension/import-static-checks.ts:980-1198) is 219 LOC, function band strong per the authoritative map. PTQ-1159 (resolved, fixed) filed it at ~385 LOC with two seam hypotheses; the fix landed Seam A (`recordImportedSpecifierFacts(specifier, parsed, resolvedPath, facts, deps)`, now its own 178-LOC function at 781-958, with the `ImportedSpecifierFacts`/`ImportedSpecifierFactDeps` records PTQ-1159 hypothesised at 749-778). Seam B — the IMP-4 parse/unreadable/registration-filter block extracted as a module-private `admitDirectImportLib` preserving the pinned in-loop emission position — did not land: that block is still inline at 1112-1151, and the function stayed over the strong threshold (219 ≥ 200).

## Evidence
Step inventory (line ranges re-read this session; locals each phase reads/writes — the seam cost):

| phase | lines | LOC | reads / writes |
|---|---|---|---|
| fact-table construction (11 locals + `facts` record) | 1001-1089 | 89 (mostly comment prose; ~25 statements) | writes `entryResolvedPaths`, `allSpecifiers`, `importedFns/Schemas/Enums/NonCtorNames/TypeSchemas/TypeEnums/SchemaShapes`, `mintedTypeNameCollisions`, `registrationFilteredPaths`, `facts` |
| per-decl IMP-1 resolve + precache | 1091-1110 | 20 | reads `importDecls`, `fromFile`, `probe`, `resolver`; writes `diagnostics`, `entryResolvedPaths` |
| IMP-4 parse + bug-0428/0312 unreadable arm + inline registration filter (PTQ-1159 Seam B, unlanded) | 1112-1151 | 40 | reads `parseThetaLib`, `unreadablePaths`, `walkThetaLib`, `site`, `spec`; writes `diagnostics`, `registrationFilteredPaths` |
| IMP-3 export set + unknown-symbol check + specifier union | 1152-1168 | 17 | reads `parsed`, `sourcePath`, `spec`; writes `allSpecifiers`, `diagnostics` |
| IMP-6/IMP-7 per-specifier delegation (`libBodyTypesByPath` cache + `specifierDeps` record + `recordImportedSpecifierFacts` loop) | 1170-1191 | 22 | reads `specifiers`, `parsed`, `resolvedPath`, `facts`; writes via `specifierDeps` sinks |
| cycle-graph seed | 1193-1194 | 2 | reads `walkThetaLib`, `resolvedPath` |

Excerpt at the unlanded Seam B boundary (1112-1119):
```ts
    // IMP-4: parse the resolved `.thetalib`; its `.thetalib`-keyed top-level check
    // (and any nested import extension error) surfaces here so an illegal form
    // un-registers the importing theta. Filtered inline (not deferred to the
    // post-walk pass below) so the emission order stays IMP-4-then-IMP-3 for a
    // direct decl, as callers of this batch already depend on; recorded in
    // `registrationFilteredPaths` so the post-walk pass does not re-push it.
    const parsed = await parseThetaLib(resolvedPath);
    if (parsed === undefined) {
```

## Why this is a problem
Strong band (219 ≥ 200): presumption of breakdown requiring a strong concrete reason. Reasons considered and defeated: (a) single algorithm with shared local state — the fix already invented the state objects (`ImportedSpecifierFacts`, 10 fields; `ImportedSpecifierFactDeps`, 7 fields) that carry the shared locals across the Seam A boundary, so the same vehicles carry them across Seam B; (b) closed-enumeration dispatch — the phases are sequential pipeline steps (IMP-1 → IMP-4 → IMP-3 → IMP-6/7 → graph seed), not a spec-table switch; (c) spec-cited critical section — the pinned IMP-4-then-IMP-3 emission order (bug-0138 test, quoted above) constrains phase ORDER inside the loop, not co-residence in one function body: PTQ-1159's Seam B hypothesis explicitly preserves the in-loop position, so the invariant survives the extraction; (d) measured cost / reverted split — none; the opposite, Seam A landed and stuck; (e) exemptions — no key for this host in quality/exemptions.json (4 entries, read this session). Data-only and grammar-production reasons do not apply; hand-written.

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies one — Seam B is PTQ-1159's own second hypothesis restated at current lines. Seam B: the IMP-4 parse/unreadable/registration-filter block (1112-1151) -> module-private `admitDirectImportLib(spec, site, resolvedPath, parseThetaLib, unreadablePaths, walkThetaLib, registrationFilteredPaths, diagnostics)` (hypothesis) — 40 LOC, 0 exported symbols moved, 0 external importers, cross-references back into the host: `unreadableThetaLibDiagnostic`, `isRegistrationError`; called from the same loop position, preserving the pinned emission order. None identified yet beyond it.

## False-positive check
Band: strong (219 LOC, 980-1198) from the authoritative map, not recounted. Reasons-considered list above with the evidence defeating each (the emission-order comment quoted verbatim; the two state-object records cited at 749-778). Exemptions check: no `import-static-checks` key in quality/exemptions.json. Generated-code check: hand-written bug-annotated prose. Spec-mirror check: IMP items are pipeline steps here, not a closed enumeration whose arm count this length mirrors. Duplicate check: PTQ-1159 is resolved (its Seam A verifiably landed — `recordImportedSpecifierFacts` exists at 781-958 with the exact signature the hypothesis named); no pending intake or issue carries this `#collectImportedSpecifierFacts` host key at the current size (grep of quality/ this session: only resolved PTQ-1159 and the file-level PTQ-1147 mention it).

## Triage
verdict: questionable — accounting verified at HEAD: size-scan map (manifest = the one file) gives collectImportedSpecifierFacts 980-1198 / 219 LOC / band strong (FN strong ≥ 200), not exported, 0/0 importers, recordImportedSpecifierFacts 781-958 / 178 LOC with exactly PTQ-1159's Seam A signature and the ImportedSpecifierFacts(10)/ImportedSpecifierFactDeps(7) records at 749-778; quality/exemptions.json has no import-static-checks key; all six inventory row ranges sum to the function (21 signature + 89+20+40+17+22+2) and match the source, the IMP-4 excerpt is verbatim at 1112-1119, and the rows are real distinct phases — IMP-1 (resolve/precache → entryResolvedPaths), IMP-4 (parse/0428 unreadable/0304 registration filter → registrationFilteredPaths), IMP-3 (export set/unknown-symbol → allSpecifiers), IMP-6/7 delegation, graph seed — each writing disjoint sinks; reason (a) engaged not overlooked, though thinner than stated: the Seam B block touches 8 names (the filing's own 8-parameter hypothesis), but 4 are already host parameters and 1 a facts field, so whether that threading is acceptable is the design call; the 0304/0138 order pin is a same-position extraction constraint, not a co-residence one; not a duplicate — PTQ-1159 is resolved with Seam A landed and its ratification was a batch accept that ruled nothing on Seam B, sibling intake d9-01 carries the file host key, PTQ-1209 carries #checkThetaImports; D9 breakdown caps at questionable — Seam B shape is a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting independently re-verified at HEAD: size-scan map (one-line manifest) gives `#collectImportedSpecifierFacts — 980-1198 — 219 LOC — band strong` (FN strong ≥ 200), not exported, 0/0 importers; `recordImportedSpecifierFacts` 781-958 / 178 LOC carries exactly PTQ-1159's Seam A signature `(specifier, parsed, resolvedPath, facts, deps)` with `ImportedSpecifierFacts` (10 fields) / `ImportedSpecifierFactDeps` (7 fields) at 749-778; `grep import-static-checks quality/exemptions.json` = 0 hits; all six step-inventory ranges tile the body exactly (1001-1089 sinks + facts record, 1091-1110 IMP-1, 1112-1151 IMP-4 with the 0428 unreadable arm and 0304 inline registration filter, 1152-1168 IMP-3, 1170-1191 IMP-6/7 delegation, 1193-1194 walk seed) and the 1112-1119 excerpt is verbatim; rows are spec-numbered sequential phases writing disjoint sinks (entryResolvedPaths / registrationFilteredPaths+diagnostics / allSpecifiers / facts via deps), not one concern split by adjectives; reason (a) engaged, not overlooked — the Seam B block would thread 8 names but 4 are already host parameters, 1 a facts field, 3 loop locals (spec, site, resolvedPath) plus `parsed` as its return, so the ≥ 6-shared-locals bar is arguable rather than decisive, which is the human's call; the 0304/0138 order pin (1081-1089 comment, quoted verbatim) constrains loop position, which a same-position extraction preserves; git shows Seam A landed and stuck, no reverted split; not a duplicate — PTQ-1159 is resolved/fixed with a batch ratification that ruled nothing on Seam B, sibling intake d9-01 carries the file host key, PTQ-1209 carries `#checkThetaImports`; D9 breakdown caps at questionable — whether to extract Seam B is a design ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
