---
id: PTQ-1149
title: params.ts bundles the params contract, type lowering, shared text predicates, prompt projection, and top-level splitters in one 2300-LOC module
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/parser/params.ts:1-2300
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/params.ts
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# params.ts bundles the params contract, type lowering, shared text predicates, prompt projection, and top-level splitters in one 2300-LOC module

## Observation
src/parser/params.ts is 2300 LOC (strong band). Its header (lines 1-28) states the module owns "the `params:` field contract of frontmatter/frontmatter-fields-a.md §params and §Defaults" and its five behaviour-bearing checks. The file also hosts the general type-expression lowering machinery (`LowerCtx`, `lowerTypeExpr`, `hoistInlineObjectType`, …) consumed by other parser modules, text-refusal predicates and top-level text splitters consumed by four other src modules, and a rendered-type projection consumed only by the extension layer.

## Evidence
Structural-map declaration clusters (concern | members | line ranges | LOC):

| concern | members | line ranges | LOC |
|---|---|---|---|
| `params:` contract parse | ParamFieldInput, BodyTypeDeclaration, ParamsParseSite, ParamsParseResult, parseParams, hoistNestedDefs | 78-558 | ~400 |
| type-expression lowering machinery | LowerCtx, PRIMITIVE_TYPES, IDENTIFIER, RESERVED_KEYWORDS, lowerTypeExpr, classifyLoweredUnionArm, isMixedLiteralArmSet, lowerLiteralUnionArm, lowerGenericArgument, ClassifiedArgumentSegment, classifyGenericArgumentSegments, withoutUnspellableSink, findCutBracketGroupText, pushCutBracketGroupAsLastResort, InlineObjectEntry, classifyInlineObjectEntry, hoistInlineObjectType, lowerBraceGroupUnionArms, parseLiteralArm, lowerLiteralSublanguage, lowerParamsFieldType | 561-1541, 1732-1794, 1919-2008 | ~1200 |
| shared text-refusal predicates | isSingleEnclosingBraceGroup (3 src importers), isBraceBalanced, isUnspellableTextRefusable (2 src importers), hasUnterminatedStringLiteral | 1589-1681, 1838-1882 | ~110 |
| binder-prompt type projection | projectBraceGroup, projectRenderedParamType (1 src importer: src/extension/production-theta-producer.ts:100) | 2031-2126 | ~60 |
| top-level text splitters | topLevelColon (3 src importers), TypeSplitNesting, splitTopLevelSegments (1 src importer), splitTopLevel (4 src importers) | 2146-2300 | ~95 |

Importer counts quoted from the structural map: `splitTopLevel` 4/4 (src/tests), `topLevelColon` 3/2, `isSingleEnclosingBraceGroup` 3/1, `isUnspellableTextRefusable` 2/1, `LowerCtx` 1/11, `lowerTypeExpr` 1/4, `projectRenderedParamType` 1/1. External consumers of the splitters/predicates are other parser modules, e.g.:

```
src/parser/type-grammar.ts:105:import { splitTopLevel, topLevelColon } from "./params";
src/parser/type-layer-checks.ts:92:import { isSingleEnclosingBraceGroup, isUnspellableTextRefusable } from "./params";
src/extension/production-theta-producer.ts:100:import { projectRenderedParamType } from "../parser/params";
```

## Why this is a problem
Strong band (2300 LOC ≥ 2000): presumption of breakdown, not filed only on a strong concrete reason. Reasons considered and defeated: (a) single algorithm with shared local state — the splitter/predicate/projection clusters share no locals with `parseParams`; the lowering shares only the `LowerCtx` object, which is already the invented state seam; (b) data-only module — only ~40 LOC are literal tables (PRIMITIVE_TYPES, RESERVED_KEYWORDS), far under 80%; (c) one grammar production family — the file spans the `params:` contract, the Type lowering, and generic text utilities, not one production; (d) generated code — hand-written; (e) strong reasons — no exemption in quality/exemptions.json for this host, no measured cost, no reverted split found. The one placement constraint on record (src/parser/body-type-lowering.ts:26-29: the one-way import bug 0039/0097 set forces the brace predicate and per-arm union dispatch to live "in params.ts rather than here") constrains the import direction relative to body-type-lowering only; a new module imported by both preserves that direction.

## Suggested direction (non-binding, optional)
Hypotheses, unproven. Seam A: top-level splitters + text predicates -> `type-text-split.ts` (hypothesis) — ~205 LOC, exported symbols moved: splitTopLevel, splitTopLevelSegments, topLevelColon, isSingleEnclosingBraceGroup, isUnspellableTextRefusable; external importers 4/4, 1/2, 3/2, 3/1, 2/1 (src/tests); zero cross-references back into the host. Seam B: type-expression lowering (LowerCtx through lowerParamsFieldType) -> `params-lowering.ts` (hypothesis) — ~1200 LOC, exported symbols moved: LowerCtx, lowerTypeExpr, hoistInlineObjectType, lowerBraceGroupUnionArms, lowerLiteralSublanguage, lowerParamsFieldType, parseLiteralArm; external importers per map (1/11, 1/4, 1/3, 1/0, 1/0, 0/8); host would import lowerParamsFieldType back. Seam C: projectBraceGroup/projectRenderedParamType -> a render-side helper (hypothesis) — ~60 LOC, 1 src importer (extension layer), no back-references.

## False-positive check
Band: strong per the authoritative map (2300 LOC). Reasons-considered list recorded above with defeating evidence. Exemptions check: quality/exemptions.json holds no D9 key for src/parser/params.ts. Generated-code check: hand-written with bug-numbered rationale comments, no generator banner. Spec-mirror check: the header cites frontmatter-fields-a.md §params for the contract only; the splitter/predicate/projection clusters answer no clause of that section. Duplicate check: no prior filing against this host in quality/intake/ or the PTQ index (the D4 filing qw20260920183643-d4-15-top-level-splitters-cloned is a clone claim, not this breakdown).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 2300 LOC / strong band and all 37 declaration rows; the five clusters are distinct (splitters and predicates have zero code references into parseParams/lowering; projection reaches lowering only via one lowerLiteralSublanguage call, so Seam C's "no back-references" is slightly off but the inventory stands); importer roster and quoted import lines match; no exemption for the host; the bug 0039/0097 one-way import rule constrains direction only, not residence in params.ts; sibling intakes -02/-03 are function-level hosts, not duplicates — target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run reproduces 2300 LOC / strong band and all 37 declaration rows at the cited ranges; the five rows are distinct concerns (no module-level shared state; splitter/predicate clusters reference parseParams/lowering only in comments; projection reaches lowering via a single lowerLiteralSublanguage call plus splitTopLevel/isSingleEnclosingBraceGroup, so "no back-references" is slightly overstated but the row stands); the three quoted import lines match (producer import is at :99, tolerable drift) and src importers are body-type-lowering/frontmatter/theta-document/type-grammar/type-layer-checks/production-theta-producer; no D9 key for src/parser/params.ts in quality/exemptions.json, no generator banner; bug 0097 §Fix "Where the code lives" (docs/bugs/0097:640-649) pins only the one-way import direction relative to body-type-lowering, not residence in params.ts, so no overlooked strong reason; d4-15 is a clone claim and siblings -02/-03 key on #parseParams/#lowerTypeExpr, so no duplicate — target shape (which of Seams A/B/C, and whether the 0097 predicate pair moves together) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified with post-filing drift: size-scan map now reports 2252 LOC (was 2300; commit 71af3b5b moved hoistNestedDefs to schema-defs.ts, so row 1 is 5 members and the map has 36 rows, all at cited ranges −48), still strong band; the five rows are distinct concerns — the only module-level state (PRIMITIVE_TYPES/IDENTIFIER/RESERVED_KEYWORDS) sits wholly in the lowering row, splitters/predicates make zero code references outside themselves, projection reaches lowering via one lowerLiteralSublanguage call plus splitTopLevel/isSingleEnclosingBraceGroup/isBraceBalanced (Seam C's "no back-references" overstated, row stands); quoted imports match at type-grammar:115 and producer:99, and the type-layer-checks:92 line was byte-exact at 71af3b5b^ but bb21dacc extracted that consumer to annotation-validation.ts:5 (roster now body-type-lowering/frontmatter/theta-document/type-grammar/annotation-validation/production-theta-producer); no params.ts key in quality/exemptions.json, no generator banner, no reverted split in git history, and bug 0097 §Fix "Where the code lives" (0097:640-648) pins only the one-way import direction relative to body-type-lowering; siblings -02/-03 key on #parseParams/#lowerTypeExpr and d4-15 is a D4 clone claim, so no duplicate — which seams (A/B/C) to cut is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
