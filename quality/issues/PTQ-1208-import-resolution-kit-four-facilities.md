---
id: PTQ-1208
title: createImportResolutionKit bundles four distinct closure facilities (pass parser, graph walk, module scopes, materialization chain) in one 258-LOC factory whose return record already names the state object
lens: D9
status: open
verdict: confirmed
locations:
  - src/extension/import-static-checks.ts:1460-1717
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/import-static-checks.ts#createImportResolutionKit
d9_band: strong
wave: qw20260920223212
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# createImportResolutionKit bundles four distinct closure facilities (pass parser, graph walk, module scopes, materialization chain) in one 258-LOC factory whose return record already names the state object

## Observation
`createImportResolutionKit` (src/extension/import-static-checks.ts:1460-1717)
is 258 LOC, function band strong per the authoritative map. It was created by
the ratified PTQ-0418 seam (Seam D1); that ratification ruled on extracting
the closures from `checkThetaImports`'s scope, not on this factory's internal
wholeness, and no filing has ever carried this function as its host. The body
builds four separately-documented facilities — a pass-scoped `.thetalib`
parser with a bug-0428 unreadable-paths ledger, the imports.md §Cycles graph
walk, the bug-0303 module-scope builder, and the imports.md §Re-exports
materialization chain — and returns them plus four state collections as one
8-field record.

## Evidence
Step inventory (all ranges re-read this session; locals each facility
reads/writes stated — the seam cost):

| phase | line ranges | LOC | locals read/written |
|---|---|---|---|
| pass parser: `parseCache`, `unreadablePaths` (bug 0428), `parseThetaLib` | 1466-1505 | 40 | reads `deps.fs`, `deps.parseDeps`; writes `parseCache`, `unreadablePaths` |
| graph walk: `graphEdges`, `walked`, `walkThetaLib` (imports.md §Cycles, bugs 0302/0304/0333/0428) | 1506-1578 | 73 | reads `parseThetaLib`, `probe`, `resolver`, `unreadablePaths`; writes `walked`, `graphEdges`, `diagnostics` |
| module scopes: `moduleScopeCache`, `moduleScopeInProgress`, `buildModuleScope` (bug 0303) | 1579-1638 | 60 | reads `probe`, `resolver`, `parseThetaLib`; writes both caches; calls `materializeChain` |
| materialization: `materializeChain` (imports.md §Re-exports resolution) | 1639-1704 | 66 | reads `probe`, `resolver`, `parseThetaLib`; calls `materializeSymbol`, `buildModuleScope` (mutual recursion) |
| kit record return | 1706-1716 | 11 | packages the 4 closures + `parseCache`, `walked`, `graphEdges`, `unreadablePaths` |

Excerpt of the return record (1706-1716):

```typescript
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
}
```

Cross-facility coupling is exactly two channels: every facility calls
`parseThetaLib` (its cache pair is the shared substrate), and
`buildModuleScope`/`materializeChain` are mutually recursive (1616/1699 call
each other). `walkThetaLib` reads `unreadablePaths` (1568); nothing else
crosses. Importer counts from the map: `createImportResolutionKit` 0 src / 0
tests (module-private; sole caller `checkThetaImports` at 1879).

## Why this is a problem
Strong band (258 ≥ 200): presumption of breakdown, filed unless a strong
concrete reason is on record. Reasons considered and why each fails: (a)
single algorithm with shared local state — defeated twice: the state object a
split "would have to be invented" already exists as the function's own return
record (1706-1716), and the facilities are not one algorithm — the graph walk
never touches the module-scope caches, the scope/materialization pair never
touches `graphEdges`/`walked`; the only shared mutables are the parse-cache
pair, which the first facility owns and exposes as `parseThetaLib`. The one
genuine co-move constraint is the `buildModuleScope` <-> `materializeChain`
mutual recursion, which any seam keeps together. (b) closed-enumeration
dispatch — none. (c) data-only — none. (d) grammar production — no. (e)
generated — hand-written. Strong supplements: no spec-cited single critical
section spans the facilities (each closure is invoked independently by the
caller and by each other through named handles); no measured cost; no reverted
split — the file's lane shows seven extractions landed and stuck; no
`quality/exemptions.json` entry for this file or host (read this session).

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies one. Seam A: the mutually-recursive pair
`buildModuleScope` + `materializeChain` (1579-1704, ~126 LOC) -> module-private
`createMaterializer(parseThetaLib, probe, resolver)` (hypothesis) — 0 exported
symbols moved, 0 external importers, cross-references back into the host:
`materializeSymbol`, `extractThetaLibForms`, `enumsOf`,
`resolveThetaLibImports`, `resolveAndParseThetaLibReference`. Seam B: the
graph walk (1506-1578, ~73 LOC) -> module-private
`createImportGraphWalk(parseThetaLib, unreadablePaths, probe, resolver,
diagnostics)` (hypothesis) — 0 exports moved, cross-references back:
`loadThetaLibImport`, `unreadableThetaLibDiagnostic`, `normalizePath`. Seam C:
the pass parser (1466-1505, ~40 LOC) -> module-private
`createPassScopedLibParser(deps)` returning `{ parseThetaLib, parseCache,
unreadablePaths }` (hypothesis) — 0 exports moved, cross-references back:
`parseViaPassCache` (already a module import).

## False-positive check
Band: strong (258 ≥ 200) from the authoritative map, not recounted.
Reasons-considered list above with the defeating evidence per reason (the
return-record-as-existing-state-object defeat and the two-channel coupling
count for reason (a)). Exemptions check: `quality/exemptions.json` read this
session — four keys, none for this file or host. Generated-code check:
hand-written (bug-numbered rationale comments; hand-edited quality/bug
commits). Spec-mirror check: imports.md §Cycles and §Re-exports specify the
walk and resolution semantics per facility, not one function; the doc comment
(1455-1458) describes the bundle as "the per-theta parse, import-graph,
module-scope and re-export materialisation closures" — four nouns. Duplicate
check: grep of quality/ for `d9_host:` shows no filing on
`#createImportResolutionKit`; PTQ-0418 (status: fixed, verified this session)
ratified the extraction that CREATED this function; the pending file-level
filing (qw20260920202922-d9-01) proposes moving it whole with the probe class
— a different claim under a different host key.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives createImportResolutionKit 1460-1717 / 258 LOC / band strong / 0 src 0 tests importers (sole caller checkThetaImports:1879), no key for this file or host among the 4 entries in quality/exemptions.json; the return-record excerpt is byte-exact at 1706-1716, the doc comment's four-noun description sits at 1455-1458, and the cross-facility channels reproduce with small drift (unreadablePaths.has at 1563, materializeChain↔buildModuleScope mutual calls at 1612/1674/1692); the inventory holds as distinct state clusters — parseCache/unreadablePaths (row 1), graphEdges/walked (row 2), moduleScopeCache/moduleScopeInProgress (row 3) are each read/written by exactly one facility, though rows 3 and 4 are one co-move unit via mutual recursion (the filing concedes this and Seam A keeps them together), leaving ≥ 3 real concerns; reason (a) not overlooked — locals crossing those concerns are parseThetaLib, unreadablePaths, probe, resolver = 4 < 6, matching PTQ-0418's own triage count for the same four closures, and the caller consumes the handles independently (walkThetaLib/materializeChain threaded into collectImportedSpecifierFacts, buildModuleScope not even destructured), so this is a closure factory rather than one algorithm; no other concrete/strong reason applies; not a duplicate — qw20260920202922-d9-01 is the file-level host proposing to MOVE the kit whole and d9-03 is the #checkThetaImports residual; note for the ruling: PTQ-0418's human ratification (2026-09-17) explicitly chose this exact 8-field bundled shape, which the filing discloses and which the human should weigh against re-splitting it; D9 breakdown caps at questionable — Seam A/B/C is a design decision (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified at HEAD independently of the prior note: size-scan map gives createImportResolutionKit 1460-1717 / 258 LOC / band strong (FN strong ≥ 200) / 0 src 0 tests importers with the sole caller at checkThetaImports:1879; no D9 key for src/extension/import-static-checks.ts or #createImportResolutionKit among the 4 quality/exemptions.json entries; the return-record excerpt is byte-exact at 1707-1716 and the doc comment's four-noun wording sits at 1455-1458; the four inventory rows are real distinct state clusters with ±2-line boundary drift (parseCache/unreadablePaths 1466-1503 written only by parseThetaLib; graphEdges/walked 1514-1575 touched only by walkThetaLib, which is also the only closure that pushes to `diagnostics`; moduleScopeCache/moduleScopeInProgress 1585-1638 touched only by buildModuleScope; materializeChain 1649-1705 owns no state) — rows 3+4 are one co-move unit via mutual recursion at 1612/1674/1692, which the filing concedes, leaving ≥ 3 concerns; the only cross-facility channels are parseThetaLib (called by all), unreadablePaths.has at 1563 (drift from cited 1568), plus the probe/resolver parameters = 4 shared locals < 6, the same count PTQ-0418's triage recorded, so reason (a) is not overlooked and no closed-enumeration/data/grammar/generated/spec-invariant/measured-cost/reverted-split reason applies; the caller destructures 7 of the 8 fields (buildModuleScope unused externally) and threads walkThetaLib/materializeChain/parseThetaLib/unreadablePaths/walked/graphEdges into separate downstream helpers (:1897/:2006/:2061/:2111), consistent with a closure factory rather than one algorithm; not a duplicate — PTQ-0418 (fixed) is the ratification that CREATED this function under host #checkThetaImports, qw20260920202922-d9-01 is the file-level host proposing to MOVE the kit whole, and qw20260920223212-d9-03 is the #checkThetaImports residual; for the ruling: PTQ-0418's human note (2026-09-17) verbatim chose this exact 8-field bundle, so re-splitting it reverses a 3-day-old ratification — a design call the human must weigh; D9 breakdown never confirms (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
