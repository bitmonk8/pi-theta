---
id: pending
title: type-compat.ts bundles the compatibility engine, six per-site TYPE-9 checkers, the common-type join, and sentinel mints in one 1117-LOC module
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-compat.ts:1-1117
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/type-compat.ts
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# type-compat.ts bundles the compatibility engine, six per-site TYPE-9 checkers, the common-type join, and sentinel mints in one 1117-LOC module

## Observation
src/parser/type-compat.ts is 1117 LOC (justify band). Its header states it owns
two duties: "the single normative compatibility relation `T₁ ⊑ T₂` of
type-system.md §Type compatibility (TYPE-1…TYPE-11)" AND "the per-site
parse-time diagnostics that report a static mismatch (TYPE-9)"
(src/parser/type-compat.ts:3-5). The relation engine, six diagnostic-emitting
per-site checkers, an index-receiver classifier, the common-type join, and two
engine-minted sentinel constructors all live in the one file.

## Evidence
Distinct-concern inventory (declaration LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| CompatType model & env resolution | PrimitiveName, CompatType, NamedDecl, TypeEnv, resolveNamed, resolveNamedRef, PRIMITIVE_TYPE_NAMES | 37-183, 869-875 | 43 |
| ⊑ decision engine (TYPE-1…TYPE-11) | Compatibility, checkCompatible, unfoldAlias, decide, decidePrimitive, widenLiteralTypes, displayType | 203-482 | 222 |
| per-site TYPE-9 checkers | CompatSite, IndexReceiverKind, classifyIndexReceiver, checkLetRhsCompat, checkFnArgCompat, checkObjectFieldCompat, paramsDeclaredCompatType, checkParamsDefaultCompat, checkReassignRhsCompat | 485-684, 893-1032 | 253 |
| common-type join | checkCommonType, CompatRelation, commonType, isObjectBranch | 699-864 | 92 |
| engine-minted sentinel types | WITHHELD_BINDER_TYPE_NAME, withheldBinderType, enumVariantType | 1076-1117 | 7 |

The per-site checkers are diagnostic factories, not relation logic — each takes
an options object, calls `checkCompatible`, and builds a registry-worded
Diagnostic (src/parser/type-compat.ts:550-589):

```ts
export function checkLetRhsCompat(opts: {
  readonly name: string;
  readonly annotation: CompatType;
  readonly rhs: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic[] {
  const { name, annotation, rhs, env, site } = opts;
  const r = checkCompatible(rhs, annotation, env);
```

Same shape at checkFnArgCompat (597-625), checkObjectFieldCompat (645-684),
checkCommonType (699-750), checkParamsDefaultCompat (939-976),
checkReassignRhsCompat (995-1032). Importer counts (structural map, src/tests):
checkCompatible 11/11, CompatType 18/16, TypeEnv 16/14 (engine surface) vs
checkLetRhsCompat 1/2, checkFnArgCompat 2/1, checkObjectFieldCompat 1/0,
checkCommonType 1/1, checkParamsDefaultCompat 1/0, checkReassignRhsCompat 1/0,
classifyIndexReceiver 2/1, CompatSite 6/3 (site-checker surface).

## Why this is a problem
Justify band: the presumption is breakdown unless a concrete reason to keep
whole is found. Reasons considered and defeated:
- Closed-enumeration dispatch: applies to `decide` alone (257-396, 140 LOC —
  its arms mirror TYPE-1…TYPE-10); the other ~975 LOC are not that enumeration.
- Data-only module / type family: type declarations total ~30 LOC of 1117 — far
  below 80%.
- Single algorithm with shared local state: the per-site checkers share no
  locals; each communicates with the engine only through the already-exported
  `checkCompatible` / `displayType` / `TypeEnv` — zero threading cost at the
  seam.
- One grammar production family: not a parser production; N/A.
- Generated code: hand-written (git history is per-bug fixes).

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the per-site TYPE-9 checkers + CompatSite +
classifyIndexReceiver -> type-compat-sites.ts — ~253 declaration LOC (plus doc
comments), exported symbols moved: CompatSite (6/3), classifyIndexReceiver
(2/1), checkLetRhsCompat (1/2), checkFnArgCompat (2/1), checkObjectFieldCompat
(1/0), checkParamsDefaultCompat (1/0), checkReassignRhsCompat (1/0),
paramsDeclaredCompatType (1/0); cross-references back into the host:
checkCompatible, displayType, unfoldAlias, TypeEnv, CompatType — all already
exported. Seam B (hypothesis, unproven): checkCommonType + commonType +
CompatRelation + isObjectBranch (~92 LOC, importers 1/1 and 1/1) join Seam A's
module or their own. The human ratifies one.

## False-positive check
Band: justify (1117 LOC per the authoritative map; not recounted). Reasons
considered: all five concrete classes, each defeated above with counts.
Exemptions check: quality/exemptions.json has no key for
src/parser/type-compat.ts (grep run, zero hits). Generated-code check: no
generator marker in the header; git log --follow shows hand-authored per-bug
commits. Spec-mirror check: TYPE-1…TYPE-11 mirror is `decide` alone; the
per-site checkers implement TYPE-9 reporting, a duty the header itself names
separately ("V2b / V2b-T"). Placement: all members are parser-layer, imports
only ../diagnostics/diagnostic — no misplacement. Not a husk (30 declarations,
live importers throughout).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 1117 LOC / justify band, no exemption or prior split, all five inventory rows are real member groups sharing no locals (row 3 sums to 250 not 253 from the map — immaterial), no concrete/strong keep-whole reason overlooked (closed enumeration is `decide` alone, type LOC ≈ 42, sentinel "Home:" rationale binds only members the direction leaves in place); target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map reproduces 1117 LOC / band justify with every cited declaration range; header (lines 1-32) names both duties as claimed; the five rows are distinct member groups with no shared module state (the only module const, PRIMITIVE_TYPE_NAMES:869, is read solely by paramsDeclaredCompatType:921 — it belongs in row 3 not row 1, and row 3 sums to 250 not 253, both immaterial); no exemption key, no reverted prior split in git history, type LOC 34/1117, closed-enumeration mirror is `decide` (257-396) alone, the sentinel "Home:" layering rationale (1068-1072) covers only members the direction keeps in place — no overlooked keep-whole reason; the seam is a design decision for a human ruling (triage: claude-fable-5-1)
