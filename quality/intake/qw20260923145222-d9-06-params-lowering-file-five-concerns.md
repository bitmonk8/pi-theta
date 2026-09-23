---
id: pending
title: params-lowering.ts (1219 LOC) bundles the type-expression lowering recursion with two pure raw-text scanners whose siblings-in-kind live in type-text-split.ts and the inline-object hoist/slug-dedup facility
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/params-lowering.ts:1-1219
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/params-lowering.ts
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# params-lowering.ts (1219 LOC) bundles the type-expression lowering recursion with two pure raw-text scanners whose siblings-in-kind live in type-text-split.ts and the inline-object hoist/slug-dedup facility

## Observation
src/parser/params-lowering.ts is 1219 LOC (structural map, justify band). Its header names it "the `params:` type-expression lowering family". The file was minted by the ratified PTQ-1149/PTQ-1259 split of params.ts (2300 LOC -> params.ts 544 + params-lowering.ts 1219 + params-render.ts 132); no finding has yet been dispositioned against the new host itself, and it sits one band over threshold at HEAD.

## Evidence
Distinct-concern inventory (LOC summed from the structural map's per-declaration rows; ranges re-read at HEAD):

| concern | members | line ranges | LOC |
|---|---|---|---|
| lowering context + keyword tables | LowerCtx, PRIMITIVE_TYPES, IDENTIFIER, RESERVED_KEYWORDS | 34-149 | 102 |
| type-expression lowering recursion | lowerTypeExpr, lowerGenericApplication, classifyLoweredUnionArm, isMixedLiteralArmSet, lowerLiteralUnionArm, lowerGenericArgument | 209-575 | 275 |
| generic-argument raw-text scanning | ClassifiedArgumentSegment, classifyGenericArgumentSegments, withoutUnspellableSink, findCutBracketGroupText, pushCutBracketGroupAsLastResort | 578-851 | 136 |
| inline-object hoist + slug dedup | InlineObjectEntry, classifyInlineObjectEntry, hoistInlineObjectType | 854-1017 | 107 |
| field-RHS entry interceptors | lowerBraceGroupUnionArms, lowerLiteralSublanguage, lowerParamsFieldType | 1068-1219 | 59 |

The scanning concern is pure text -> classification with no LowerCtx dependency in its two big members. src/parser/params-lowering.ts:614-618:

```ts
export function classifyGenericArgumentSegments(interior: string): ClassifiedArgumentSegment[] {
  const segments: ClassifiedArgumentSegment[] = [];
  let angle = 0;
  let group = 0;
  let quote: string | undefined;
```

Its own doc comments state the sibling pattern: src/parser/params-lowering.ts:719-721 ("The scan reproduces `classifyGenericArgumentSegments`' idiom byte for byte — the same angle counter, the same `{}`/`[]` depth tracking, the same quote/escape handling"), and the idiom named is `splitTopLevelSegments`' `"angle"` idiom (params-lowering.ts:658-661) — the quote-aware top-level scanners (`splitTopLevel`, `skipQuotedRegion`, `topLevelColon`, `isBraceBalanced`, `isSingleEnclosingBraceGroup`, `parseLiteralArm`) all live in type-text-split.ts, which this file already imports (params-lowering.ts:25-33). `findCutBracketGroupText` calls `skipQuotedRegion` from that module (params-lowering.ts:769). The hoist concern is likewise already injection-decoupled from the recursion: `hoistInlineObjectType` receives `lowerFieldType` as a callback parameter (params-lowering.ts:929-930) rather than calling `lowerTypeExpr` directly.

## Why this is a problem
Justify band (1219 LOC): presumption of breakdown unless a concrete keep-whole reason is recorded. Reasons considered: one-grammar-production family — defeated for the file: it covers the 275-LOC lowering recursion (the `Type` production, grammar.md:90-102, kept whole separately at function level), but the 136-LOC raw-text scanners are not lowering (they classify comma-cut segments of source text and have their siblings-in-kind in type-text-split.ts, per the citations above), and the 107-LOC hoist/slug-dedup facility is a schema-subset.md §Schema-slug collision mechanism shared with body-type-lowering.ts, already decoupled via the callback parameter; data-only — defeated: type declarations and tables are 102 of 1219 LOC (~8%); single algorithm with shared local state — a function-level reason; the concerns communicate through LowerCtx and plain strings, not a web of locals; generated code — hand-written. quality/exemptions.json has no row for this host.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: ClassifiedArgumentSegment + classifyGenericArgumentSegments + findCutBracketGroupText -> type-text-split.ts (hypothesis) - ~116 LOC, exported symbols moved: classifyGenericArgumentSegments (importers 1/0), findCutBracketGroupText (1/0), ClassifiedArgumentSegment (1/0), cross-references back into the host: none (findCutBracketGroupText already imports skipQuotedRegion from the destination; pushCutBracketGroupAsLastResort stays, reading LowerCtx). Seam B: InlineObjectEntry + classifyInlineObjectEntry + hoistInlineObjectType -> params-inline-object.ts (hypothesis) - ~107 LOC, exported symbols moved: classifyInlineObjectEntry (1/0), hoistInlineObjectType (1/0), InlineObjectEntry (0/0), cross-references back: the LowerCtx type only (the lowering callback is already a parameter). Seam C: none identified yet for the interceptors/entry concern.

## False-positive check
Band: justify (1219 >= 1000, map-quoted). Reasons considered and defeated: listed above. Exemptions check: quality/exemptions.json carries no D9 row for src/parser/params-lowering.ts. Generated-code check: hand-written, prose bug citations throughout. Spec-mirror check: the recursion's gate ladder mirrors grammar.md's closed GenericType set — that reason is recorded for the function-level hosts (lowerTypeExpr, lowerGenericApplication kept whole), not for the file. Duplication check: the scanner-idiom duplication itself is already tracked (PTQ-1140 quote-aware-scanner-cloned, PTQ-1141 top-level-splitters-cloned); this finding claims the placement/bundling accounting, not the clone. Prior-filing check: PTQ-1149, PTQ-1165, PTQ-1176, PTQ-1259 all resolved against the pre-split params.ts; no filing exists against this host.

## Triage
verdict: questionable — accounting verified: size-scan map re-run reproduces 1219 LOC / justify band and all 21 declaration rows at the cited ranges (row LOCs 102/275/136/107/59 sum from the map); excerpts match at :614-618, :658-663, :719-721, :769 and the lowerFieldType callback at :927-931; the six sibling scanners named all live in type-text-split.ts (isBraceBalanced via the :436 export) and body-type-lowering.ts:16-19 imports the hoist/arm-dispatch trio; rows 3 (two pure string->classification scanners with no LowerCtx) and 4 (callback-decoupled hoist) share no locals or module state with the recursion so the inventory holds at >= 2, though rows 1 and 5 are weaker than presented (PRIMITIVE_TYPES/IDENTIFIER/RESERVED_KEYWORDS are the recursion's own tables, and lowerLiteralSublanguage is called FROM row 2's lowerLiteralUnionArm/lowerGenericArgument, so ~3 genuinely distinct concerns); data/type LOC 102/1219 (~8%), no src/parser/params-lowering.ts key in quality/exemptions.json, hand-written, no reverted split in git log (only revert-matching commit a43855de is bug 0099), bug 0039/0097 pin import direction only; the "one grammar production" reason was considered, but hoistInlineObjectType IS ObjectType's lowering (grammar.md:101) so whether the Type-family reason holds file-wide is itself the design question; PTQ-1149/PTQ-1259 key on d9_host src/parser/params.ts (fixed) and PTQ-1176 is function-level, no issue names this host, so not a duplicate (PTQ-0351 seams-remain precedent) — which of Seams A/B cut, and whether the hoist stays with the recursion as one production family, needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run gives 1219 LOC, justify band (FILE_BANDS justify=1000), and all 21 declaration rows at the cited ranges, with row sums of 102/275/136/107/59 reproducing exactly; excerpts match at :25-33, :614-618, :658-661, :719-721, :769 and :927-931; classifyGenericArgumentSegments/findCutBracketGroupText are pure string scans with no LowerCtx and share no locals with the recursion; hoistInlineObjectType takes lowerFieldType as a callback. That is at least 3 real concerns (row 1's tables belong to the recursion; row 5's lowerLiteralSublanguage is called from row 2 at :537/:574). No exemptions.json key, ~8% data/type, hand-written, no reverted split, and the one-grammar-production reason was weighed (spec_topics/grammar.md:90-102, ObjectType at :101). Not a duplicate: resolved PTQ-1149/1259 key on src/parser/params.ts and PTQ-1176 is function-level. PTQ-1259's ratified Seam B moved this lowering family as one unit, so whether to cut Seam A/B, or keep the family whole, needs a human ruling (triage: claude-opus-5-5)
