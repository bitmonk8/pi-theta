---
id: pending
title: src/parser/frontmatter.ts bundles seven declaration families (2385 LOC, strong band) behind a header that names only the field-contract parse
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/frontmatter.ts:1-2385
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/frontmatter.ts
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# src/parser/frontmatter.ts bundles seven declaration families (2385 LOC, strong band) behind a header that names only the field-contract parse

## Observation
The file is 2385 LOC (strong band, presumption of breakdown). Its header (lines 1-17)
declares one role: "This module owns the theta-file YAML frontmatter parse described by
frontmatter.md, frontmatter/frontmatter-fields-a.md ...". The structural map shows 50
declarations; alongside the field-contract parse the file hosts the exported
result/option type family, YAML block/range utilities, per-field renderers and
block-shape checks, an outbound wire-name sidecar constructor family (a transitive
BFS over the body-schema graph), the `system:` param-type classifier, and the
`params:` extraction/lowering.

## Evidence
Distinct-concern inventory (line ranges and LOC from the wave's structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| exported frontmatter contract types | ThetaMode, ModelMatchOutcome, ModelReferenceMatcher, ParsedToolLoop, ParsedRespondRepair, ParsedParams, ParsedFrontmatter, FrontmatterParseResult, FrontmatterSchemaField, FrontmatterBodyTypes, ParseFrontmatterOptions | 60-318 | 196 |
| YAML block/range utilities | FENCE, FrontmatterBlock, extractFrontmatterBlock, rangeOf, indentOf, yamlKeyOf, enclosingParamsField, malformedFrontmatterYamlDiagnostic | 340-476 | 94 |
| field-value renderers & block-shape checks | paramValueSource, paramValueCanCarryType, renderScalarValue, renderNonScalarModeKind, renderNonScalarBindContextKind, extractToolsList, RESERVED_KEYWORDS, isIdentifierShaped, renderObserved, TOOL_LOOP_SUBKEYS, RESPOND_REPAIR_SUBKEYS, renderNonMapBlockKind, checkBlockShape, unknownSubKeyDiagnostics, resolveNonNegIntBlock, RECOGNISED_METHODOLOGIES, checkMethodology | 494-821 | 185 |
| outbound wire-name sidecar construction (schema-graph BFS) | namedSchemaOf, buildOutboundSidecars, refTargetInto, buildInlineSidecars, inlineObjectType | 837-1125 | 205 |
| `system:` param-type classification | stringLiteralOf, buildSystemUnionArms, toSystemParamType | 1138-1437 | 231 |
| `params:` extraction/lowering | splitParamValue, typeSourceIsNullable, extractParsedParams | 1447-1681 | 206 |
| frontmatter field-contract parse | DEFERRED_FRONTMATTER_FIELDS, parseFrontmatter | 334-337, 1701-2385 | 689 |

The sidecar family builds `SchemaSidecar` values (imported from
`../binder/binder-envelope`) for the render-time wire-name translation, e.g.
src/parser/frontmatter.ts:906-912:

```ts
function buildOutboundSidecars(
  rootSchema: string,
  bodyTypes: FrontmatterBodyTypes,
  reserved: Set<string> = new Set(),
  building: Set<string> = new Set(),
): { readonly sidecars: ReadonlyMap<string, SchemaSidecar>; readonly rootDef: string } {
```

`toSystemParamType` is exported for one external consumer
(`import-static-checks.ts`; map: 1 src / 0 test importers), independent of
`parseFrontmatter`'s own callers (map: 1 src / 3 test importers).

## Why this is a problem
Strong band: the presumption of breakdown applies unless a strong concrete reason
holds. Reasons considered and defeated:
- Closed-enumeration dispatch: only `parseFrontmatter`'s field loop mirrors the
  frontmatter-fields-a.md field vocabulary; the other six concern rows (1117 LOC
  combined) are not that enumeration.
- Single algorithm with shared local state: the seven families do not share
  locals; the sidecar/classifier/extraction families communicate with
  `parseFrontmatter` only through `FrontmatterBodyTypes` and function returns.
- Data-only module: type declarations are 196 of 2385 LOC (~8%), far below 80%.
- One grammar production family: the file covers YAML block extraction, field
  contract, sidecar graph walks, and type classification — several productions.
- Generated code: hand-written (header narrates bug-by-bug evolution).
- Strong reasons: no spec-cited single critical section spans the seven families;
  no measured cost; no reverted split found (`git log --follow` shows no split
  commit); no entry in quality/exemptions.json for this path.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: sidecar construction + `system:` classification
(namedSchemaOf, buildOutboundSidecars, refTargetInto, buildInlineSidecars,
inlineObjectType, stringLiteralOf, buildSystemUnionArms, toSystemParamType) ->
`system-param-types.ts` (hypothesis) — ~436 LOC, exported symbols moved:
toSystemParamType (1 src / 0 test importers), cross-references back into the host:
`FrontmatterBodyTypes` (2 src importers). Seam B: `params:` extraction
(splitParamValue, typeSourceIsNullable, extractParsedParams) ->
`frontmatter-params.ts` (hypothesis) — ~206 LOC, no exported symbols move,
cross-reference back: paramValueSource/paramValueCanCarryType/RESERVED_KEYWORDS.
Seam C: YAML block/range + renderer/block-shape helpers -> `frontmatter-yaml.ts`
(hypothesis) — ~279 LOC, no exported symbols move.

## False-positive check
Band check: 2385 LOC ≥ 2000 (strong). Reasons-considered list above with defeating
evidence per reason. Exemptions check: quality/exemptions.json has no key for
src/parser/frontmatter.ts. Generated-code check: hand-authored (header and inline
bug annotations). Spec-mirror check: only the field loop mirrors the
frontmatter-fields-a.md field contract; the sidecar and classifier families cite
bugs (0407/0424/0425/0441-0444), not a spec enumeration. Prior-filing check: no
existing PTQ or intake finding targets this file for breakdown.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 2385 LOC / band strong for src/parser/frontmatter.ts with no quality/exemptions.json entry; all seven inventory rows exist at the cited lines with matching LOC sums, though rows 4 and 5 (sidecar builders / toSystemParamType) are mutually recursive (inlineObjectType→toSystemParamType, toSystemParamType→buildOutboundSidecars/namedSchemaOf) and are one concern cluster not two — ≥2 distinct concerns remain (contract types, YAML block utils, params extraction, sidecar+classifier, field-contract parse); minor slip: SchemaSidecar is imported from ./schema-lowering not ../binder/binder-envelope; toSystemParamType has exactly 1 direct src importer (import-static-checks.ts) as claimed; no overlooked concrete/strong reason (spec-mirroring field loop covers only parseFrontmatter, no reverted split in 42 --follow commits); sibling intake d9-02/d9-03 target function-level hosts (#parseFrontmatter, #toSystemParamType), not this file-level key — not duplicates; target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: independent re-run of size-scan map --files gives src/parser/frontmatter.ts 2385 LOC / band strong, no quality/exemptions.json key; all 50 declarations sit at the cited ranges and every inventory row's LOC sums exactly (196/94/185/205/231/206/689) with the 906-912 excerpt byte-exact; rows 4+5 collapse into one mutually-recursive cluster (inlineObjectType→toSystemParamType:1095, toSystemParamType→namedSchemaOf/buildOutboundSidecars/buildInlineSidecars:1330-1335,1411, buildSystemUnionArms→buildOutboundSidecars:1214) — the filing's own Seam A already groups them, leaving 6 distinct rows (≥2) that share no module-level state (zero top-level let/mutable consts); toSystemParamType's sole real importer is import-static-checks.ts:105 (other grep hits are comments); minor slip: SchemaSidecar comes from ./schema-lowering (line 47-52), not ../binder/binder-envelope; no overlooked reason (field-loop spec mirror covers only parseFrontmatter's 689 LOC, types ~8%, no single-module clause in docs/spec_topics/frontmatter*, 42 --follow commits contain no split/revert — 5de65c65 "split" is the tools: comma short-form); siblings d9-02/d9-03 carry function-level d9_host keys, distinct root causes; breakdown shape is a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: third independent re-run of size-scan map --files reproduces src/parser/frontmatter.ts 2385 LOC / band strong with no quality/exemptions.json key; all 50 declarations sit at the cited ranges and each row's LOC sums exactly from the map (196/94/185/205/231/206/689), header 1-17 names only the field-contract parse, excerpt 906-912 byte-exact; rows 4 and 5 are one mutually-recursive cluster (inlineObjectType:1095→toSystemParamType; toSystemParamType:1283/1330-1335/1411→inlineObjectType/namedSchemaOf/buildOutboundSidecars/buildInlineSidecars; buildSystemUnionArms:1214→buildOutboundSidecars) so the inventory is 6 distinct rows, still ≥ 2, with zero top-level `let`/mutable state shared across them; minor slip: SchemaSidecar is imported from ./schema-lowering (lines 47-52), not ../binder/binder-envelope; toSystemParamType's only real importer is import-static-checks.ts:105 (theta-document.ts/import-system-template-patch.ts hits are comments, no test imports it); no overlooked reason (field-loop spec mirror covers only parseFrontmatter's 689 LOC, types ~8 %, no single-module clause in docs/spec_topics/frontmatter*, 42 --follow commits with no split/revert — 5de65c65 is the tools: comma short-form); no PTQ under quality/issues or quality/resolved carries lens D9 for this path, and intake siblings d9-02/d9-03 use function-level d9_host keys (#parseFrontmatter, #toSystemParamType) — distinct root causes, not duplicates; the seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
