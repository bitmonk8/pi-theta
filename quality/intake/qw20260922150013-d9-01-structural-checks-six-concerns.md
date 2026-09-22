---
id: pending
title: structural-checks.ts bundles six declaration clusters (walk, schema graph, params-default names, fn annotations, propagation index, orchestration) at 1586 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/structural-checks.ts:1-1586
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/structural-checks.ts
d9_band: justify
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# structural-checks.ts bundles six declaration clusters (walk, schema graph, params-default names, fn annotations, propagation index, orchestration) at 1586 LOC

## Observation

`src/parser/structural-checks.ts` is 1586 LOC (justify band, ≥ 1000). Its header
comment names three subjects itself: "Whole-document structural AST checks,
schema graphs, and params-default name checks." The file was minted by commit
702a1f2e (`quality: qw20260921130057 fix d9/src__parser__theta-document.ts`,
the PTQ-1156/1213/1214 extraction from theta-document.ts) and its sole
importer is `theta-document.ts:122-127`, which consumes and re-exports the
whole export set (`checkParamsDefaultNames`, `checkStructural`,
`hoistEnumVariants`, `rangeKey`, `StructuralRefs`).

## Evidence

Distinct-concern inventory (ranges and LOC from the authoritative size-scan
map; each range re-read before filing):

| concern | members | line ranges | LOC |
|---|---|---|---|
| statement/expression AST walk | walkStatements, walkBlock, walkStatement, checkObjectExpr, resolvePatternDeclaredFieldSet, checkPatternObjectFields, walkExpr | 980-1583 | 549 |
| schema declaration graph + discriminated-union prep | checkSchemaFieldTypes, checkAliasRhs, checkSchemaDeclarationGraph, identifierShapedReferences, isObjectSchemaArm, buildUnionVariantSchemas, discriminatorCandidateFields, classifyDiscriminatorFieldType | 541-978 | 346 |
| params-default name checks | checkParamsDefaultNames, walkParamsDefaultNames | 216-240, 255-324 | 95 |
| fn annotation validation | fnHeaderWindow, validateFnAnnotations | 392-451 | 58 |
| query-propagation index / absorption windows | PropagationIndex, propagationKey, indexQueryPropagations, propagatedToQuery, captureAbsorptionWindow | 332-384 | 28 |
| orchestration & shared refs | StructuralRefs, WalkCtx, hoistEnumVariants, rangeKey, checkStructural, pushDiag | 66-162, 463-538 | 159 |

The clusters share only `StructuralRefs`/`pushDiag`. The params-default
cluster is not even reached from `checkStructural` — it is a separate export
called later in the same `parseThetaDocument` pass (the file's own comment,
`structural-checks.ts:476-479`: "shared with the `params:` default check
(`checkParamsDefaultNames`, run later in the same `parseThetaDocument`
pass)"). The schema-graph cluster keeps its own field-source map instead of
`StructuralRefs.schemas` (`structural-checks.ts:723-727`):

```
  // The object-form field lists, by name — the resolved-declaration input
  // `checkDiscriminatedUnion`'s variants are built from. Kept local (rather
  // than reusing `StructuralRefs.schemas`, which carries field NAMES only) so
  // the full `SchemaFieldSource` — typeSource AND wireName — survives to
  // `discriminatorCandidateFields`.
```

Importer count from the map: 30 declarations, 26 of them private (0/0
importers); the 4 exported names have 0 direct src importers — everything is
consumed through `theta-document.ts`'s re-export.

## Why this is a problem

Justify band: presumption of breakdown unless a concrete reason is found.
Reasons considered and defeated: closed-enumeration dispatch — applies to
`walkStatement`/`walkExpr` individually (kept whole separately), not to the
file's six clusters, four of which are not dispatches at all; single algorithm
with shared local state — the walk threads `StructuralRefs`, but the
params-default cluster runs on a different input (`ParamFieldInput[]`, its own
enum map) and the schema-graph cluster shares only `typeNames` plus its
deliberately-local `objectFields`; data-only module — types/consts are ~80 of
1586 LOC (≪ 80%); one grammar production family — the clusters cite different
spec areas (schemas.md declaration checks, functions.md FN-1/FN-4, grammar.md
literal sublanguage, query-escapes-stringification.md QRY-19); generated code —
hand-written (bug citations 0028/0033/0061/0262/0279 throughout). No
`structural-checks` key in quality/exemptions.json. The PTQ-1156 fix that
minted this file was one extraction from a 10k-LOC host, not a human ruling
that this residual grouping is final.

## Suggested direction (non-binding, optional)

All hypotheses unproven. Seam A: schema-graph cluster (541-978, ~346 LOC) ->
`schema-graph-checks.ts` (hypothesis) — 0 exported symbols move (all private;
`checkSchemaDeclarationGraph` called once from `checkStructural`),
cross-references back: `pushDiag`, `StructuralRefs`. Seam B: params-default
cluster (216-324, ~95 LOC) -> `params-default-names.ts` (hypothesis) — 1
exported symbol moves (`checkParamsDefaultNames`, 0 direct src importers,
consumed via theta-document re-export), cross-reference back:
`hoistEnumVariants`/`rangeKey`. Seam C: fn-annotation + propagation clusters
(332-451, ~86 LOC) -> stay with the walk or join `annotation-validation.ts`
(hypothesis) — 0 exported symbols, cross-references back into `StructuralRefs`.

## False-positive check

Band: 1586 LOC ≥ 1000 (justify) per the authoritative map, never recounted by
hand. Reasons-considered list recorded above with defeating evidence per
reason. Exemptions check: no D9 key for this host in quality/exemptions.json.
Generated-code check: hand-authored (bug-doc citations in-body; created by
commit 702a1f2e as a manual extraction). Spec-mirror check: the file spans
multiple spec areas, so no single closed enumeration covers it. Duplicate
check: PTQ-1156/1213/1214 (resolved) keyed `theta-document.ts` and
`theta-document.ts#walkStatement`/`#checkSchemaDeclarationGraph` — different
hosts; no open or intake filing keys `src/parser/structural-checks.ts`
(same-wave d9 intake files verified by slug and grep).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 1586 LOC / band justify with the 30 declarations at the cited ranges (all file-private; export block at 1585-1586 re-exported by theta-document.ts:126-127, the sole importer); header comment, the 476-479 and 723-727 excerpts reproduce; the three load-bearing inventory rows are genuinely distinct — params-default cluster (216-324) takes `ParamFieldInput[]`/its own enum map and is invoked from theta-document.ts:412 outside `checkStructural`, the schema-graph cluster (541-978) is a single call from checkStructural:529 receiving only `typeNames` and keeping its own `objectFields` map, the walk (980-1583) threads `StructuralRefs` — while the propagation/fn-annotation rows (332-451) are helpers reached only from the walk (1065/1139/1487) and the filing itself parks them with the walk (seam C), so the inventory holds at ≥ 3 distinct concerns not 6; no `structural-checks` key in quality/exemptions.json, hand-authored (minted by 702a1f2e), not a barrel/facade, no overlooked keep-whole reason for the FILE (shard-09's closed-enumeration rulings cover walkStatement/walkExpr individually), and no other filing keys this host (sibling d9-03 is a misplacement filing on the query-check cluster, a different root cause); the seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run reproduces 1586 LOC / band justify and all 30 declarations at the cited ranges (all file-private, export block 1585-1586 re-exported by theta-document.ts:126-127, the only importer outside the file); header comment, 476-479 and 723-727 excerpts reproduce verbatim; ≥ 3 rows are genuinely distinct concerns — params-default (216-324) takes `ParamFieldInput[]`/enums/roots/refusedRanges and is called from theta-document.ts:412 outside checkStructural, schema-graph (541-978) is one call at 529 receiving only `(statements, typeNames, file)` and keeping its own `objectFields`, the walk (980-1583) threads `StructuralRefs` — while the propagation/fn-annotation rows (332-451) are walk-only helpers (1065/1067/1139/1487) so the true count is ≥ 3 not 6, which still clears the ≥ 2-concern bar; no `structural-checks` key in quality/exemptions.json, hand-authored, not a barrel; no overlooked keep-whole reason for the file (closed-enumeration rulings apply to walkStatement/walkExpr individually); not a duplicate — PTQ-1156/1213/1214 key theta-document.ts hosts and sibling d9-03 is a misplacement filing with a different root cause; the seam shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run reproduces 1586 LOC / band justify and all 30 declarations at the cited ranges (all file-private; export block 1585-1586 re-exported by theta-document.ts:126-127, the only importer); header comment and the 476-479 / 723-727 excerpts reproduce verbatim; the inventory holds at ≥ 3 genuinely distinct concerns (not 6) — params-default cluster (216-324) takes `ParamFieldInput[]`/enums/roots/refusedRanges, never touches `StructuralRefs`/`WalkCtx`, and is called from theta-document.ts:412 outside `checkStructural`; schema-graph cluster (541-978) is a single call at 529 receiving `(statements, typeNames, file)` and keeps its own `objectFields`; the walk (980-1583) threads `refs` — while the propagation/fn-annotation rows (332-451) are walk-only helpers (callers 420/446/1065/1067/1139/1487), which still clears the ≥ 2-concern bar; no `structural-checks` key in quality/exemptions.json, hand-authored (minted 702a1f2e), not a barrel; no overlooked keep-whole reason for the FILE (shard-09's closed-enumeration rulings, REVIEW_LOG.md:623, cover walkStatement/walkExpr individually, and the "single algorithm" reason fails because the params cluster shares no locals with the walk); not a duplicate — PTQ-1156/1213/1214 are fixed and key theta-document.ts hosts, no other filing carries d9_host structural-checks.ts; the seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
