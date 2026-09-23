---
id: pending
title: system-param-types.ts bundles the SystemParamType classification ladder with the outbound wire-name sidecar construction cluster its own header names as a second subject
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/system-param-types.ts:1-637
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/system-param-types.ts
d9_band: zone
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# system-param-types.ts bundles the SystemParamType classification ladder with the outbound wire-name sidecar construction cluster its own header names as a second subject

## Observation
`src/parser/system-param-types.ts` is 637 LOC (zone band, file >= 600 per the
authoritative map). Its header comment (line 1) names two subjects joined by
"and": `// System-interpolation parameter classification and outbound wire-name
sidecars.` The first subject is the `typeSource` → `SystemParamType`
classification ladder (`toSystemParamType`, the map's sole exported function,
importers quoted from the map: 1 src / 0 tests — `frontmatter.ts`, which also
re-exports it). The second is the bug-0407/0424/0441/0442-family construction
of `SchemaSidecar` maps for the `system:` outbound render.

## Evidence
Distinct-concern inventory (line ranges and LOC from the wave's structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| outbound wire-name sidecar construction | namedSchemaOf, buildOutboundSidecars, refTargetInto, buildInlineSidecars | 27-58, 96-149, 164-190, 205-244 | 153 |
| SystemParamType classification | inlineObjectType, stringLiteralOf, buildSystemUnionArms, toSystemParamType, namedTypeSystemParam | 264-315, 328-340, 372-421, 460-547, 550-637 | 291 |

The header (src/parser/system-param-types.ts:1):

```ts
// System-interpolation parameter classification and outbound wire-name sidecars.
```

The dependency between the two concerns is one-directional. The classification
ladder calls into the sidecar cluster at 5 counted sites — `inlineObjectType`
line 290 (`refTargetInto`), `buildSystemUnionArms` line 404
(`buildOutboundSidecars`), `toSystemParamType` lines 521-525 (`namedSchemaOf`,
`buildOutboundSidecars`, `buildInlineSidecars`), `namedTypeSystemParam` line 611
(`buildOutboundSidecars`). The sidecar cluster calls only itself (mutual
recursion among the four) plus `buildSidecar` / `encodePointerSegment` imported
from `./schema-lowering` (lines 6-12); it references no classification member.
Example call boundary (src/parser/system-param-types.ts:520-526):

```ts
        const named = namedSchemaOf(element, bodyTypes);
        if (named !== undefined) {
          const sc = buildOutboundSidecars(named, bodyTypes);
          return { kind: "array", sidecars: sc.sidecars, rootDef: sc.rootDef };
        } else if (isSingleEnclosingBraceGroup(element)) {
          const inline = buildInlineSidecars(element, bodyTypes, new Set(), new Set());
          return { kind: "array", sidecars: inline.sidecars, rootDef: inline.rootDef };
```

## Why this is a problem
Zone band files only on a 2-or-more-concern inventory; the table above is that
inventory, and the file's own header states the two subjects. Reasons
considered and defeated: single-algorithm-with-shared-state — the sidecar
cluster shares only 3 explicit parameters (`bodyTypes`, `reserved`, `building`)
with the classification side, below the 6-local bar, and the coupling is
one-directional (a clean seam); closed-enumeration dispatch — true of
`toSystemParamType`'s ladder alone, but the enumeration reason cannot cover the
153-LOC sidecar BFS/merge machinery, which is not an enumeration; data-only,
generated, grammar-production — inapplicable (imperative construction code).
quality/exemptions.json lists no entry for this host.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the sidecar cluster (namedSchemaOf,
buildOutboundSidecars, refTargetInto, buildInlineSidecars) -> new
src/parser/system-outbound-sidecars.ts — 153 LOC, 0 currently-exported symbols
move (all four are module-private today; the new module would export them to
this host), external importers of those symbols 0 src / 0 tests, 0
cross-references back into the host (the cluster calls no classification
member). No other seam identified.

## False-positive check
Band check: 637 LOC, zone per the map (quoted; not recounted). Reasons
considered: single-algorithm (defeated — 3 shared parameters, one-directional
calls), closed-enumeration (defeated — covers only the classification half),
data-only / generated / grammar-production (inapplicable). Exemptions check:
quality/exemptions.json has no entry for src/parser/system-param-types.ts.
Generated-code check: hand-written (bug-numbered doc comments throughout).
Spec-mirror check: the classification order mirrors `lowerTypeExpr`
(params-lowering.ts) per the comment at 476-481, but the sidecar cluster is
bug-fix machinery, not a spec-named enumeration. Prior-filing check: PTQ-1180
(resolved) covered only `toSystemParamType`'s inline namedType arm and was
fixed by extracting `namedTypeSystemParam`; no filing covers the file host or
the sidecar/classification split.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 637 LOC / band zone and every declaration row (namedSchemaOf 27-58/32, buildOutboundSidecars 96-149/54, refTargetInto 164-190/27, buildInlineSidecars 205-244/40 = 153; inlineObjectType 264-315/52, stringLiteralOf 328-340/13, buildSystemUnionArms 372-421/50, toSystemParamType 460-547/88, namedTypeSystemParam 550-637/88 = 291); header line 1 quoted verbatim; the coupling is one-directional as claimed (grep of lines 27-244 finds no reference to any classification member; classification→sidecar calls at 289, 404, 520/522/525, 611 all present, line drift ≤1) and the cluster takes none of the classification locals (`resolving`, `aliasChain`), so single-algorithm-≥6-shared-locals does not apply; closed-enumeration covers only toSystemParamType's ladder, not the BFS/mint machinery; exemptions.json has no entry; sole importer frontmatter.ts:43/72/861 as stated; PTQ-1180 (resolved) covers only the function-level namedType arm and no open filing names this host — the only nuance is that inlineObjectType (302-313) also mints a root `__inline` sidecar itself via buildSidecar/encodePointerSegment, so the seam is slightly less clean than "cluster-only" but the ≥ 2-concern inventory stands; whether to split (the prior wave qw20260922150013 kept the file whole as one lowering algorithm, REVIEW_LOG.md:623) is a design ruling for a human (triage: claude-fable-5-1)
