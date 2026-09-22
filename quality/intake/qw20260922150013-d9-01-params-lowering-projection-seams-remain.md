---
id: pending
title: src/parser/params.ts still bundles the params parse, the type-expression lowering family, and the render-side projection (1853 LOC, justify) after the PTQ-1149 fix landed only Seam A
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/params.ts:1-1853
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/params.ts
d9_band: justify
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# src/parser/params.ts still bundles the params parse, the type-expression lowering family, and the render-side projection (1853 LOC, justify) after the PTQ-1149 fix landed only Seam A

## Observation
The file is 1853 LOC (justify band, presumption of breakdown). Its header (lines 1-9)
declares one role: "This module owns the `params:` field contract ... with shared text
predicates and splitters delegated to type-text-split.ts." PTQ-1149 (confirmed,
ratified 2026-09-21) inventoried five concerns at 2300 LOC; the fix (commits 71af3b5b,
09722760) landed only Seam A (splitters/predicates -> type-text-split.ts, since
re-exported at the file tail). Seam B (the type-expression lowering family, ~679
declaration LOC) and Seam C (the render-side projection pair) remain in-file, so the
file still holds three declaration families and stays in the justify band.

## Evidence
Fresh distinct-concern inventory (line ranges and LOC from this wave's structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| `params:` parse & default checks | ParamFieldInput, BodyTypeDeclaration, ParamsParseSite, ParamsParseResult, parseParams, checkTrailingDefaults, checkParamsDefaults | 98-547 | 384 |
| type-expression lowering family | LowerCtx, PRIMITIVE_TYPES, IDENTIFIER, RESERVED_KEYWORDS, lowerTypeExpr, lowerGenericApplication, classifyLoweredUnionArm, isMixedLiteralArmSet, lowerLiteralUnionArm, lowerGenericArgument, ClassifiedArgumentSegment, classifyGenericArgumentSegments, withoutUnspellableSink, findCutBracketGroupText, pushCutBracketGroupAsLastResort, InlineObjectEntry, classifyInlineObjectEntry, hoistInlineObjectType, lowerBraceGroupUnionArms, lowerLiteralSublanguage, lowerParamsFieldType | 550-1735 | 679 |
| render-side projection | projectBraceGroup, projectRenderedParamType | 1758-1853 | 60 |

The lowering family carries the module's only shared mutable-ish state, confined to
its own row — src/parser/params.ts:550-554:

```ts
export interface LowerCtx {
  readonly bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>;
  /** Resolved named types, collected as `$defs` entries (shared across fields). */
  readonly defs: Record<string, Record<string, unknown>>;
```

The projection row is render-facing (its doc cites bug 0251's rendering-vs-contract
reconciliation), src/parser/params.ts:1758-1760:

```ts
function projectBraceGroup(group: string): string {
  const interior = group.slice(1, -1);
  const entries = splitTopLevel(interior, ",", "angle-and-brace");
```

Importer counts from the map: LowerCtx 1/11 (src/tests), lowerTypeExpr 1/4,
hoistInlineObjectType 1/3, lowerParamsFieldType 0/8, projectRenderedParamType 1/1,
parseParams 1/3 — the lowering family's external consumers are independent of
parseParams's own.

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole is
found. Reasons considered and defeated:
- Closed-enumeration dispatch: only lowerTypeExpr's arm dispatch mirrors the
  grammar.md Type alternatives; that covers 119 of 1853 LOC, not the file.
- Single algorithm with shared local state: LowerCtx is confined to the lowering row;
  the parse row communicates with lowering only through lowerParamsFieldType's return,
  and the projection row reaches lowering via a single lowerLiteralSublanguage call
  (verified by PTQ-1149 triage three times) — no cross-row locals.
- Data-only module: type/const declarations are ~120 of 1853 LOC, far below 80%.
- One grammar production family: three families (field contract, type lowering,
  render projection), not one.
- Generated code: hand-written (bug-numbered commentary throughout).
- Exemptions: quality/exemptions.json has no key for src/parser/params.ts.
PTQ-1149 is resolved, but its fix landed only Seam A; the ratified inventory's
remaining rows are still co-resident and the file remains over the justify threshold.

## Suggested direction (non-binding, optional)
Hypotheses, unproven — PTQ-1149's unlanded seams. Seam B: the lowering family
(LowerCtx through lowerParamsFieldType) -> `params-lowering.ts` (hypothesis) — ~679
declaration LOC; exported symbols moved: LowerCtx (1/11), lowerTypeExpr (1/4),
hoistInlineObjectType (1/3), lowerBraceGroupUnionArms (1/0), lowerLiteralSublanguage
(1/0), lowerParamsFieldType (0/8), classifyGenericArgumentSegments (0/2),
findCutBracketGroupText (0/1); cross-reference back: host imports lowerParamsFieldType.
Seam C: projectBraceGroup + projectRenderedParamType -> a render-side helper
(hypothesis) — ~60 LOC, projectRenderedParamType (1/1) moves, back-references
classifyInlineObjectEntry/lowerLiteralSublanguage/splitTopLevel.

## False-positive check
Band check: 1853 LOC in [1000, 2000) — justify. Reasons-considered list above with
defeating evidence per reason. Exemptions check: no src/parser/params.ts key in
quality/exemptions.json. Generated-code check: hand-authored. Spec-mirror check: the
grammar.md Type-alternative mirror covers only lowerTypeExpr's dispatch; bug 0097
§Fix pins only the one-way import direction vs body-type-lowering, not residence
(per PTQ-1149 triage). Prior-filing check: PTQ-1149 is status fixed (commits
71af3b5b/09722760 extracted only type-text-split.ts); this filing supplies the fresh
≥2-concern inventory of the post-fix residual (precedent: PTQ-0351 seams-remain
filing). Not a duplicate of PTQ-1165/PTQ-1176 (function-level hosts, both fixed).

## Triage
verdict: questionable — accounting verified: size-scan map re-run reproduces 1853 LOC / justify band and all 30 declaration rows at the cited ranges; the three rows are distinct concerns (code-level cross-row references: parse→lowering only by constructing LowerCtx at :220 and calling lowerParamsFieldType at :244; projection→lowering via lowerLiteralSublanguage :1826 and classifyInlineObjectEntry :1764 — two calls, not the stated one, row still stands; lowering→parse/projection only in comments); data/type LOC is 130 of 1853 (~7%), no src/parser/params.ts key in quality/exemptions.json, hand-authored, bug 0097 pins import direction only; PTQ-1149 is status fixed and the Seam A extraction is commit ac4e7697 (the filing's 71af3b5b/09722760 attribution is off — 71af3b5b moved hoistNestedDefs, 09722760 touched 12 lines) and the type-text-split re-export sits at :69-78 not the file tail, neither of which affects the inventory; PTQ-1165/PTQ-1176 are function-level and fixed, the two sibling qw20260922150013 d2 intakes are different root causes, so not a duplicate (precedent PTQ-0351 seams-remain refile) — target shape (whether projection, which documents itself as mirroring lowerParamsFieldType's dispatch order, moves with Seam B or separately) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified on re-run: size-scan map reports 1851 LOC (filing's 1853, 2-line drift) / justify band with all 30 declaration rows at the cited ranges; the three rows are distinct concerns — code-level cross-row references are parse→lowering only via the LowerCtx literal (~:218) and one lowerParamsFieldType call (~:242), projection→lowering via classifyInlineObjectEntry (~:1762) and lowerLiteralSublanguage (~:1824) (two calls, the filing says one; row stands), and lowering names the parse/projection rows only in comments; data/type LOC is 130/1851 (~7%); no src/parser/params.ts key in quality/exemptions.json, hand-authored header, no reverted prior split in git history (only revert-matching commit a43855de is bug 0099's slug fix), bug 0097 pins import direction only; PTQ-1149 sits in quality/resolved as status fixed and its Seam A landed in ac4e7697 (params.ts −698/type-text-split.ts +444), not the filing's 71af3b5b/09722760, and the re-export is at :69-76 not the tail — neither error touches the inventory; no open issue or sibling intake names the params.ts host, so not a duplicate (PTQ-0351 seams-remain precedent) — whether Seam B and Seam C cut together or apart is a design decision needing a human ruling (triage: claude-fable-5-1)
