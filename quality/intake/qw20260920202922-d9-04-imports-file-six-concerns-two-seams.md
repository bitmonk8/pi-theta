---
id: pending
title: src/parser/imports.ts carries six declaration families across two self-labelled seams (V15c and V15i) in one 834-LOC module
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/imports.ts:1-834
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/imports.ts
d9_band: zone
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# src/parser/imports.ts carries six declaration families across two self-labelled seams (V15c and V15i) in one 834-LOC module

## Observation
The file is 834 LOC (zone band). Its header (line 1) names the V15c seam
("`.thetalib` import resolution and diagnostics"), but line 754 opens a second
self-labelled seam inside the same file: "── V15i / V15i-T — export visibility and
re-exports". Between them the file hosts a filesystem-facing resolver class, pure
specifier-syntax checks, symbol-semantic checks, a DFS cycle detector, and the
export-visibility computation.

## Evidence
Distinct-concern inventory (ranges and LOC from the wave's structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| top-level-form / placement / extension checks | ImportSite, THETALIB_TOP_LEVEL_* constants, ThetaLibTopLevelForm, PERMITTED_THETALIB_TOP_LEVEL_FORMS, checkThetaLibTopLevelForm, EXPORT_IN_THETA_*, EXPORT_NOT_TOP_LEVEL_*, IMPORT_NOT_TOP_LEVEL_*, IMPORT_NON_THETALIB_EXTENSION_*, importNonThetaLibExtensionMessage, checkImportExtension | 20-138 | 76 |
| path resolution (filesystem probe seam, IMP-1) | UNRESOLVABLE_THETALIB_PATH_*, unresolvableThetaLibPathMessage, UnresolvableThetaLibPathError, Resolver, ThetaLibDirectoryProbe, RelativeThetaLibResolver, ThetaLibImportLoad, loadThetaLibImport | 142-294 | 112 |
| specifier-syntax checks | IMPORT_RESERVED_SYNTHESISED_NAME_*, importReservedSynthesisedNameMessage, checkImportReservedSynthesisedName, IMPORT_MISSING_FROM_CLAUSE_*, checkImportMissingFromClause, IMPORT_MALFORMED_SPECIFIER_LIST_*, checkImportMalformedSpecifierList, checkImportDanglingAlias, checkImportSeparatorDegenerateSpecifierList | 334-544 | 100 |
| symbol-semantic checks | IMPORT_UNKNOWN_SYMBOL_CODE, IMPORT_NAME_COLLISION_*, importUnknownSymbolMessage, importNameCollisionMessage, IMPORTED_TYPE_NAME_COLLISION_*, importedTypeNameCollisionMessage, ImportSpecifier, ImportCheckInput, checkImportUnknownSymbols, checkImportNameCollisions, checkImportedSymbols | 298-330, 547-667 | 105 |
| import-cycle detection (graph DFS) | IMPORT_CYCLE_CODE, importCycleMessage, ThetaLibImportGraph, detectImportCycle | 671-752 | 56 |
| export visibility & re-exports (V15i seam) | ThetaLibDeclarationKind, ThetaLibDeclaration, ReExportSpecifier, ThetaLibModuleForms, computeThetaLibExports, thetalibLocalBindings | 764-834 | 30 |

The second-seam banner, src/parser/imports.ts:754-756:

```ts
// ── V15i / V15i-T — export visibility and re-exports ─────────────────────────
//
// The `.thetalib` export-visibility semantics layered on V15c's resolution
```

The resolution concern is the only one that touches the filesystem-spelling
domain (`posix` from node:path, a directory probe with `entries`/`entryReadable`/
`canonicalize`, src/parser/imports.ts:180-196, 205-247); every other concern is a
pure `Diagnostic`-producing check over already-parsed forms.

## Why this is a problem
Zone band: no presumption, but a 2-or-more-concern inventory licenses a finding —
the table above has six rows, and the file itself marks two distinct seams (V15c
at line 1, V15i at line 754). The filesystem resolver (stateful class + injection
interface + error type) and the pure static checks are different kinds of
machinery with disjoint dependencies; the cycle detector is a generic graph walk
over opaque node ids (its own doc comment, lines 685-690, stresses the ids are
opaque and caller-keyed); the V15i visibility computation reads none of the
resolution or diagnostic machinery. Reasons considered: closed-enumeration
dispatch (no — the file is not one enumeration); shared local state (no — the six
families share no module state, only the `Diagnostic` type); data-only (constants
plus messages are well under 80%); grammar family (no); generated (no).

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the V15i section (lines 754-834) ->
`thetalib-exports.ts` (hypothesis) — ~30 LOC, exported symbols moved:
ThetaLibDeclarationKind, ThetaLibDeclaration (1/1 importers), ReExportSpecifier
(1/1), ThetaLibModuleForms (1/1), computeThetaLibExports (1/1),
thetalibLocalBindings (0/1); cross-references back into the host: ImportSpecifier
(2/1). Seam B: the resolution concern (lines 142-294) -> `thetalib-resolver.ts`
(hypothesis) — ~112 LOC, exported symbols moved: Resolver (2/1),
ThetaLibDirectoryProbe (1/1), RelativeThetaLibResolver (1/1), loadThetaLibImport
(2/1), UnresolvableThetaLibPathError (0/1); no cross-references back into the
host. Seam C: detectImportCycle + ThetaLibImportGraph + importCycleMessage ->
`import-cycle.ts` (hypothesis) — ~56 LOC, exported symbols moved:
detectImportCycle (1/1), ThetaLibImportGraph (1/1), importCycleMessage (0/1); no
cross-references back into the host.

## False-positive check
Band check: 834 LOC in 600-999 (zone); the required ≥2-concern inventory has six
rows. Reasons-considered list above with defeating evidence. Exemptions check: no
key for src/parser/imports.ts in quality/exemptions.json. Generated-code check:
hand-written. Spec-mirror check: the diagnostic constants mirror registry rows but
span two registries (parse and load) and two spec seams (V15c, V15i) — not one
closed table. Prior-filing check: PTQ-0336 (checkImportedSymbols header name
mismatch) is a D2 naming finding against one member, not a breakdown of this file;
qw20260920202922-d9-01-import-static-checks-file-strong-band targets
src/extension/import-static-checks.ts, a different file. Importer counts quoted
from the structural map, not estimated.

## Triage
verdict: questionable — accounting verified: size-scan reproduces 834 LOC / zone band; every cited excerpt and line range matches HEAD; inventory holds ≥ 2 disjoint concerns even after collapsing rows 1+3 (resolver with sole node:path dependency, opaque-id DFS cycle detector, and Diagnostic-free V15i visibility section appended by commit 2f4010c1 share no locals/fields); data/type LOC ≈ 15 %; no exemption key, no reverted prior split, no prior D9 filing on this host — target shape (which of seams A/B/C, if any) needs a human ruling (triage: claude-fable-5-1)
