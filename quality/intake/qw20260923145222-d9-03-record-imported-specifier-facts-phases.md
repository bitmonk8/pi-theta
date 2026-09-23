---
id: pending
title: recordImportedSpecifierFacts carries four sequential phases with disjoint sinks at 179 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/import-specifier-facts.ts:322-500
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/import-specifier-facts.ts#recordImportedSpecifierFacts
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# recordImportedSpecifierFacts carries four sequential phases with disjoint sinks at 179 LOC

## Observation
`recordImportedSpecifierFacts` (src/extension/import-specifier-facts.ts:322-500)
is 179 LOC — justify band. Its own one-line doc (:321) states the bundling:
"Record one specifier's direct-declaration facts, type closure and materialized
binding in order." It was minted as PTQ-1159's Seam A (fixed) inside
import-static-checks.ts and moved here by the PTQ-1147 Seam C fix; the new host
key has no filing.

## Evidence
Step inventory (all ranges re-read at HEAD):

| phase | lines | LOC | reads / writes |
|---|---|---|---|
| facts/deps destructure | 330-341 | 12 | writes 14 local aliases |
| per-kind direct-decl lookups + fact tables (0138/0429/0430/0448) | 342-421 | 80 | writes schemaDecl, fnDecl, enumDecl, hasCtorSchema; sinks importedSchemas, importedFns, importedEnums, importedNonCtorNames |
| bug-0465/0466 type closure + collision aggregation | 422-469 | 48 | reads schemaDecl, enumDecl; sinks importedTypeSchemas, importedTypeEnums, mintedTypeNameCollisions, diagnostics |
| IMP-6/7 materialization | 470-482 | 13 | sink imports |
| bug-0422 system-template schema shell | 483-500 | 18 | reads schemaDecl; sinks libBodyTypesByPath, importedSchemaShapes |

Each phase writes a disjoint sink set consumed by a different downstream check
(the four `checkImported*` routes, the query/invoke lowering seam, the runtime
environment, the `system:` template patch respectively). Cross-phase locals are
exactly `schemaDecl`, `enumDecl`, `hasCtorSchema`, `specifierSite` (4).
Excerpt of the phase boundary (:422-435):
```ts
  // Bug 0465: feed the QUERY/INVOKE lowering seam the SAME direct-decl
  // finds (`schemaDecl` / `enumDecl`) already made above, plus their
  // transitive lib-of-lib closure, renaming only the entry to the
  // specifier's LOCAL (`as`) binding (schema-subset.md:72).
  const {
    schemas: transitiveSchemas,
    enums: transitiveEnums,
    collidedNames,
  } = collectImportedTypeDecls(
```
Map counts: function not exported, 0/0 importers; sole caller is
`collectImportedSpecifierFacts`'s inner loop (:756).

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason holds. Reasons
considered: (a) closed-enumeration dispatch — the three per-kind lookups do
mirror the code-declared closed set `IMPORTED_SPECIFIER_DECLARATION_KINDS`
(:283-287, `satisfies Record<ThetaLibDeclarationStmt["kind"], true>`), but that
enumeration accounts for only the 80-LOC lookup phase, not the 79 LOC of
closure/materialization/shape phases that follow it — the length is not the
enumeration's; (b) single algorithm with shared local state — defeated: 4
cross-phase locals (< 6), and the sinks are already bundled in the `facts` /
`deps` records the function receives; (c) data-only — no; (d) generated — no;
(e) spec one-critical-section — the IMP-4-then-IMP-3 order pin lives in the
caller's loop, not inside this function. No quality/exemptions.json entry for
this file or member.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: the bug-0465/0466 closure + collision block
(:422-469, 48 LOC) -> `aggregateImportedTypeClosure(schemaDecl, enumDecl,
specifier, parsed, facts, deps)` module-private helper — 0 exported symbols
move, 0 external importers, threads 4 values + the two records already in
scope. Seam B: the bug-0422 shape-shell block (:483-500, 18 LOC) ->
`recordImportedSchemaShape` helper, same shape. None identified beyond these;
the human ratifies.

## False-positive check
Band: justify (179 LOC), quoted from the map. Reasons-considered list above
with the defeating counts (enumeration covers 80/179 LOC; 4 < 6 cross-phase
locals). Exemptions check: quality/exemptions.json has no
import-specifier-facts key. Generated-code check: hand-written (PTQ-1159 Seam A
fix lineage, commits a9428009/61321b91 era). Spec-mirror check: bugs
0138/0429/0430/0448/0465/0422 each name a route already delimited as one phase
row above — no clause pins them to one body. Dedupe: PTQ-1159 and PTQ-1287
(both resolved/fixed) keyed
import-static-checks.ts#collectImportedSpecifierFacts — a different function
and a different file at HEAD; no filing carries this host key.

## Triage
verdict: questionable — accounting verified at HEAD: size-scan map (one-line manifest) gives `#recordImportedSpecifierFacts — 322-500 — 179 LOC — band justify` (FN justify ≥ 100, not exempt-band), not exported, 0/0 importers, sole caller collectImportedSpecifierFacts :767 (filing's :756 is line drift only); quality/exemptions.json has no import-specifier-facts key; the five inventory rows tile the body exactly (8 signature + 12+80+48+13+18 = 179) and the :422-435 excerpt is verbatim; rows are real distinct concerns — each writes a disjoint sink read by a different consumer in import-static-checks.ts (importedFns :595, importedSchemas :608, importedEnums :621, importedNonCtorNames :635 → the four checkImported* routes; importedTypeSchemas/Enums :712-713 → lowering seam; imports → materialized bindings; importedSchemaShapes :562 → system-template shell); reason (b) engaged and its count is if anything generous — true cross-phase intermediates are only schemaDecl (phase 2→3,5) and enumDecl (2→3), since hasCtorSchema (:370-419) and specifierSite (:436-464) are intra-phase, so 2 < 6 with the sinks already in the facts(10)/deps(7) records; reason (a) correctly limited to the 80-LOC lookup phase; the two prior REVIEW_LOG keep-whole dispositions (:635, :789 — "records already invented + shared finds") are reviewer judgments, not human rulings (no TRIAGE_LOG entry on this host), and are exactly the design question the human rules; not a duplicate — PTQ-1159/1287 key import-static-checks.ts#collectImportedSpecifierFacts (resolved, Seam A minted this function), PTQ-1284/1147 key the old file host, and no filing carries import-specifier-facts.ts#recordImportedSpecifierFacts; D9 breakdown caps at questionable — Seam A/B shape is a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run gives #recordImportedSpecifierFacts 322-500, 179 LOC, band justify (FN justify ≥ 100), not exported, 0/0 importers, sole caller :767 (filing's :756 is drift); no import-specifier-facts key in quality/exemptions.json; the phase rows are real and write disjoint sinks (direct-decl lookups → importedSchemas/Fns/Enums/NonCtorNames; bug-0465/0466 closure → importedTypeSchemas/Enums + collision diagnostics; materializeChain → imports; bug-0422 → libBodyTypesByPath/importedSchemaShapes), and the :422-435 excerpt is verbatim; the only locals that cross phases are schemaDecl and enumDecl (hasCtorSchema and specifierSite stay inside one phase), well under 6; closed-enumeration reason (a) covers only the lookup phase; no reason was overlooked; no filing carries this host key (PTQ-1159/1287 key import-static-checks.ts#collectImportedSpecifierFacts) (triage: claude-opus-5-5)
verdict: questionable — accounting verified; target shape needs a human ruling: I re-ran size-scan map and got 322-500, 179 LOC, band justify (FN justify ≥ 100), not exported, 0/0 importers, sole caller :767; no import-specifier-facts key in quality/exemptions.json; the inventory rows tile the body and write disjoint sinks (importedSchemas/Fns/Enums/NonCtorNames; importedTypeSchemas/Enums + collision diagnostics; imports; libBodyTypesByPath/importedSchemaShapes); the :422-435 excerpt is verbatim; only schemaDecl and enumDecl cross phases (< 6); closed-enumeration reason (a) covers just the 80-LOC lookup phase; no reverted split in the git history of the file (3 commits: a9428009, 61321b91, 87620215); no filing is keyed to this host (triage: claude-opus-5-5)
