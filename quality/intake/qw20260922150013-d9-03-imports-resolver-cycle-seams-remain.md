---
id: pending
title: src/parser/imports.ts still bundles the parse-phase import checks with the resolver cluster and the cycle detector (754 LOC, zone) after the PTQ-1184 fix landed only Seam A
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/imports.ts:1-754
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/imports.ts
d9_band: zone
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# src/parser/imports.ts still bundles the parse-phase import checks with the resolver cluster and the cycle detector (754 LOC, zone) after the PTQ-1184 fix landed only Seam A

## Observation
The file is 754 LOC (zone band). Its header (lines 1-13) claims the whole
`.thetalib` import path: top-level forms, relative resolution "through the named
`Resolver` seam", and the related diagnostics, re-exporting visibility helpers from
thetalib-exports. PTQ-1184 (confirmed, ratified 2026-09-21) proposed three seams at
834 LOC; the fix (commit de539319) landed only Seam A (the V15i visibility section
-> thetalib-exports.ts). Seam B (the resolver cluster) and Seam C (the cycle
detector) remain co-resident with the ~380-LOC parse-phase check family.

## Evidence
Fresh distinct-concern inventory (line ranges and LOC from this wave's structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| `.thetalib` path resolution | UNRESOLVABLE_THETALIB_PATH_CODE, UNRESOLVABLE_THETALIB_PATH_HINT, unresolvableThetaLibPathMessage, UnresolvableThetaLibPathError, Resolver, ThetaLibDirectoryProbe, RelativeThetaLibResolver, ThetaLibImportLoad, loadThetaLibImport | 142-294 | 114 |
| import-cycle detection | IMPORT_CYCLE_CODE, importCycleMessage, ThetaLibImportGraph, detectImportCycle | 671-752 | 56 |
| parse-phase import-statement checks + their codes/messages/hints | checkThetaLibTopLevelForm, checkImportExtension, checkImportReservedSynthesisedName, checkImportMissingFromClause, checkImportMalformedSpecifierList, checkImportDanglingAlias, checkImportSeparatorDegenerateSpecifierList, checkImportUnknownSymbols, checkImportNameCollisions, checkImportedSymbols, ImportSite, ImportSpecifier, ImportCheckInput, and their 20 code/message/hint constants | 20-138, 298-667 | ~380 |

The resolver cluster is the file's sole consumer of node:path (line 15
`import { posix } from "node:path"`, used only inside RelativeThetaLibResolver.resolve,
205-247) and carries its own error class and probe seam, src/parser/imports.ts:168-171:

```ts
export interface Resolver {
  /** Resolve `spec` against `fromFile`'s directory; throw to signal unresolvable (IMP-1). */
  resolve(spec: string, fromFile: string): string;
}
```

The cycle detector operates on opaque node ids and shares no state with either other
row, src/parser/imports.ts:691-693:

```ts
export interface ThetaLibImportGraph {
  readonly edges: ReadonlyMap<string, readonly string[]>;
}
```

Importer counts from the map: Resolver 3/1, loadThetaLibImport 3/1,
RelativeThetaLibResolver 1/1, detectImportCycle 1/1, ThetaLibImportGraph 1/1 —
consumers independent of the parse-phase check family's (checkImportedSymbols 0/2,
checkImportUnknownSymbols 2/0, etc.).

## Why this is a problem
Zone band: no presumption — the finding rests on the ≥2-distinct-concern inventory
above. The three rows share no locals, fields, or module state: the resolver cluster
is the only node:path user and throws its own UnresolvableThetaLibPathError; the DFS
cycle detector keys on caller-supplied opaque ids (its own doc, 683-690); the
parse-phase checks are pure ImportSite/token-run -> Diagnostic functions. PTQ-1184's
triage confirmed exactly this disjointness three times ("resolver ... opaque-id DFS
cycle detector ... share no locals/fields"). Other keep-whole reasons checked: no
closed-enumeration dispatch spans the rows; data/type LOC well below 80%;
hand-written; no reverted split (git log shows accretion then the de539319 Seam-A
extraction); no quality/exemptions.json key.

## Suggested direction (non-binding, optional)
Hypotheses, unproven — PTQ-1184's unlanded seams. Seam B: the resolution row
(142-294) -> `thetalib-resolver.ts` (hypothesis) — ~114 LOC; exported symbols moved:
Resolver (3/1), ThetaLibDirectoryProbe (1/1), RelativeThetaLibResolver (1/1),
loadThetaLibImport (3/1), UnresolvableThetaLibPathError (0/1),
unresolvableThetaLibPathMessage (1/2); no cross-references back into the host.
Seam C: the cycle row (671-752) -> `import-cycle.ts` (hypothesis) — ~56 LOC;
exported symbols moved: detectImportCycle (1/1), ThetaLibImportGraph (1/1),
importCycleMessage (0/1), IMPORT_CYCLE_CODE (0/1); cross-reference back: ImportSite.

## False-positive check
Band check: 754 LOC in [600, 1000) — zone; the required ≥2-concern inventory is
supplied and its disjointness is evidenced (sole node:path user; opaque-id DFS;
pure check functions). Exemptions check: no src/parser/imports.ts key in
quality/exemptions.json. Generated-code check: hand-authored (V15c header).
Spec-mirror check: the permitted-top-level-forms set (49-55) mirrors imports.md but
covers 7 LOC, not the file. Prior-filing check: PTQ-1184 is status fixed (commit
de539319 extracted only thetalib-exports.ts, -80 LOC); this filing supplies the
fresh inventory of the post-fix residual (precedent: PTQ-0351 seams-remain filing).
PTQ-1108 (header roster, D2) and PTQ-0336 (naming) are different classes, not
duplicates. Barrel check: the `export … from "./thetalib-exports"` line is a
deliberate facade left by the fix — cited as such, not counted as a concern.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 754 LOC / zone with no exemptions.json key; header (1-13), Resolver (168-171), ThetaLibImportGraph (691-693) and the opaque-id DFS doc (683-690) byte-match HEAD; `posix` is confined to RelativeThetaLibResolver.resolve (226-228); resolver row sums to exactly 114 declaration LOC (142-294) and cycle row to 56 (671-752), both with their own error class/graph type and no shared locals, fields or module state with the parse-phase ImportSite→Diagnostic check family, so ≥ 2 distinct concerns holds; every quoted importer count (Resolver 3/1, loadThetaLibImport 3/1, RelativeThetaLibResolver 1/1, detectImportCycle 1/1, ThetaLibImportGraph 1/1, checkImportedSymbols 0/2, checkImportUnknownSymbols 2/0) matches the map; no closed-enumeration dispatch across rows, data/type LOC ≈ 30 % (< 80 %), hand-written, `git log` shows accretion then the de539319 Seam-A-only extraction (no reverted split); PTQ-1184 is resolved/fixed with Seam A alone and carries no human note declining B/C, so this is the PTQ-0351-precedent residual re-file, not a duplicate — two immaterial slips noted: row 3's "~380 LOC" is ~278 declaration LOC (489-line span) and Seam B's "no cross-references back into the host" overlooks loadThetaLibImport's `site: ImportSite` parameter (268), neither of which touches the inventory; which seam(s) to cut is a human design ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map reproduces 754 LOC / zone with no quality/exemptions.json key; header (1-13), Resolver (168-171), opaque-id DFS doc + ThetaLibImportGraph (683-693) byte-match HEAD; `posix` used only at 226-228 inside RelativeThetaLibResolver.resolve; resolver row sums to 114 declaration LOC (142-294) and cycle row to 56 (671-752) per the declaration table, each with its own error class / graph type and no shared locals, fields or module state with the ImportSite→Diagnostic check family, so the ≥ 2-concern inventory holds; all quoted importer counts match the map; no closed-enumeration dispatch across rows, data/type LOC well under 80 %, hand-written, `git log` shows accretion then de539319 touching only thetalib-exports.ts (Seam A) with no reverted split; PTQ-1184 is resolved/fixed with Seam A alone and no human note declines B/C, and no other intake/issue file cites this host, so this is a PTQ-0351-precedent residual re-file, not a duplicate; two immaterial slips (row 3 is ~278 declaration LOC not ~380; loadThetaLibImport takes `site: ImportSite` at 268 so Seam B does cross-reference the host) do not touch the inventory — which seam(s) to cut is a human design ruling (triage: claude-fable-5-1)
