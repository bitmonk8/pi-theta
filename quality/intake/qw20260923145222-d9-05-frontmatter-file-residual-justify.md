---
id: pending
title: frontmatter.ts remains at 1119 LOC after the PTQ-1146 split, still bundling field collection, the cross-field rule battery, system-template build, and pipeline assembly
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/frontmatter.ts:1-1119
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/frontmatter.ts
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# frontmatter.ts remains at 1119 LOC after the PTQ-1146 split, still bundling field collection, the cross-field rule battery, system-template build, and pipeline assembly

## Observation
src/parser/frontmatter.ts is 1119 LOC (structural map, justify band). Its header names it "the frontmatter field-contract parser seam". PTQ-1146 (confirmed, resolved) filed the file at 2385 LOC with seven concerns; the ratified fix extracted frontmatter-yaml.ts (YAML node mechanics, 532 LOC), frontmatter-contract.ts (result/option types), and frontmatter-params.ts (params extraction). The residual still hosts two full pipeline phases in-file — recognised-field collection and the cross-field diagnostic battery — plus the system-template build and the orchestrating pipeline, and stays in the justify band.

## Evidence
Distinct-concern inventory (line ranges and LOC from the structural map; ranges re-read at HEAD):

| concern | members | line ranges | LOC |
|---|---|---|---|
| recognised-field collection (state record + 11 per-field collectors + dispatch loop) | DEFERRED_FRONTMATTER_FIELDS, RecognisedFields, MutableRecognisedFields, collectModeField, collectModelField, collectBindModelField, collectDescriptionField, collectArgumentHintField, collectBindEchoField, collectParamsField, collectBindContextField, collectToolsField, collectSystemField, reportUnrecognisedKey, collectRecognisedFields | 90-515 | 321 |
| cross-field rule battery | pushUnknownValueDiagnostic, resolveModelReference, resolveFrontmatterBlocks, checkRecognisedFields | 527-822 | 280 |
| system-template validation/build | buildSystemTemplate | 825-884 | 60 |
| keys-only early read for BodyParser seeding | readParamFieldNames | 900-916 | 17 |
| pipeline orchestration + ParsedFrontmatter assembly | parseFrontmatter | 942-1119 | 178 |

Every member except readParamFieldNames (importers 1/0) and parseFrontmatter (importers 1/3) is private with importers 0/0 (structural map). src/parser/frontmatter.ts:389-396 (collection concern entry):

```ts
function collectRecognisedFields(
  map: YAMLMap<unknown, Node | null> | undefined,
  lineCounter: LineCounter,
  lineOffset: number,
  file: string,
  diagnostics: Diagnostic[],
  block: FrontmatterBlock | undefined,
): RecognisedFields {
```

src/parser/frontmatter.ts:638-646 (battery concern entry):

```ts
function checkRecognisedFields(
  fields: RecognisedFields,
  yamlErrored: boolean,
  file: string,
  modelMatcher: ModelReferenceMatcher,
  lineCounter: LineCounter,
  lineOffset: number,
  diagnostics: Diagnostic[],
): {
```

The two phases communicate only through the RecognisedFields record and the diagnostics sink — the same value-record seam the ratified frontmatter-yaml.ts/frontmatter-params.ts extractions already used.

## Why this is a problem
Justify band (1119 LOC): presumption of breakdown unless a concrete keep-whole reason is found. Reasons considered: one-grammar-production family — defeated: the file already delegates its sub-productions (YAML node mechanics to frontmatter-yaml.ts, params extraction to frontmatter-params.ts, system interpolation to system-interpolation.ts, contract types to frontmatter-contract.ts), yet two whole phases (321-LOC collection, 280-LOC battery) remain in-file rather than called out; data-only — defeated: only the 35-LOC RecognisedFields interface is declarations, the rest is executable code; single algorithm with shared local state — a function-level reason; the phases here share only the RecognisedFields record and the diagnostics array; generated code — hand-written. quality/exemptions.json has no row for this host.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: recognised-field collection (RecognisedFields, MutableRecognisedFields, the 11 collectors, reportUnrecognisedKey, collectRecognisedFields) -> frontmatter-collect.ts (hypothesis) - ~321 LOC, 0 exported symbols today (collectRecognisedFields and RecognisedFields would become the module boundary), external importers 0/0, cross-references back into the host: none (it reads only frontmatter-yaml.ts helpers and the diagnostics sink). Seam B: the cross-field battery (pushUnknownValueDiagnostic, resolveModelReference, resolveFrontmatterBlocks, checkRecognisedFields) -> frontmatter-checks.ts (hypothesis) - ~280 LOC, 0 exported symbols today, external importers 0/0, cross-references back: RecognisedFields (moves with Seam A or stays as the shared record). Either seam alone drops the host below 1000 (zone); both together land it near 500 (exempt).

## False-positive check
Band: justify (1119 >= 1000, map-quoted). Reasons considered and defeated: listed above. Exemptions check: quality/exemptions.json carries no D9 row for src/parser/frontmatter.ts. Generated-code check: hand-written source with prose bug citations, no generator banner. Spec-mirror check: the field vocabulary is a spec-named closed set (frontmatter-fields-a.md §Field contract), which covers collectRecognisedFields' dispatch (kept whole separately) but not the file's phase bundling. Prior-filing check: PTQ-1146 (file at 2385), PTQ-1283, PTQ-1286, PTQ-1164 all resolved; this is the residual accounting after those fixes, not a re-file of a pending finding — the file remains one band over threshold at HEAD.

## Triage
verdict: questionable — accounting verified: independent size-scan map --files re-run gives src/parser/frontmatter.ts 1119 LOC / band justify with no frontmatter key in quality/exemptions.json (4 rows, none on this file); all 21 declarations sit at the cited ranges and every inventory row sums exactly from the map (collection 4+35+3+11+9+10+7+10+18+10+11+18+24+24+127 = 321 at 90-515; battery 26+26+43+185 = 280 at 527-822; buildSystemTemplate 60; readParamFieldNames 17; parseFrontmatter 178), both excerpts byte-exact at 389-396 and 638-646, importer counts (readParamFieldNames 1/0, parseFrontmatter 1/3, all else 0/0) match; the rows are distinct concerns — zero module-level let/var, grep of the 90-515 block finds no reference to any battery/template/pipeline name and the 527-822 block references no collector/reportUnrecognisedKey/DEFERRED_FRONTMATTER_FIELDS, so the two phases meet only at parseFrontmatter's call sites (:987 collectRecognisedFields → :1001 checkRecognisedFields → :1072 buildSystemTemplate) through the RecognisedFields value and the diagnostics sink as claimed; no overlooked reason — the field-vocabulary spec mirror covers only collectRecognisedFields (already ruled on PTQ-1283), types are 35/1119 ≈ 3 % (< 80 %), docs/spec_topics/frontmatter* has no single-pass/single-module clause, and --follow history shows only additive extractions (4d18f5cf frontmatter-yaml/params, 9edcc278 frontmatter-contract) with no revert — 5de65c65 "split" is the tools: comma short-form; not a duplicate — PTQ-1146 (2385, strong) and PTQ-1267 (1215, justify; the filing's prior-filing check omitted it) are both status fixed in quality/resolved and no open quality/issues row cites this path, so this is the post-PTQ-1267 residual with a fresh ≥ 2-concern inventory (PTQ-0351 precedent); D9 never confirms — whether to extract Seam A/Seam B or keep the pipeline whole is a design decision for a human ruling (triage: claude-fable-5-1)
