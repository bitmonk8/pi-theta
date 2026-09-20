---
id: pending
title: schema-declarations.ts carries five check families while its header enumerates three, with the discriminated-union family alone at ~330 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/schema-declarations.ts:1-907
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/schema-declarations.ts
d9_band: zone
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# schema-declarations.ts carries five check families while its header enumerates three, with the discriminated-union family alone at ~330 LOC

## Observation
src/parser/schema-declarations.ts is 907 LOC (zone band). Its header (lines 1-29) states the module "owns the parse-time well-formedness checks for the three schema declaration shapes of schemas.md and type-system.md" and enumerates exactly three: object schema, enum declaration, variant access. The file additionally hosts the discriminated-union discriminator machinery (implicit detection plus explicit `by` validation and four diagnostic builders), the `by`-clause check, and a type-alias cycle detector — none named in the header roster.

## Evidence
Distinct-concern inventory (concern | members | line ranges | LOC):

| concern | members | line ranges | LOC |
|---|---|---|---|
| object-schema well-formedness | SchemaDeclSite, SchemaFieldDecl, ObjectSchemaDecl, emptySchemaBodyDiagnostic, checkObjectSchema | 33-158 | ~110 |
| enum declaration + variant access | EnumValueKind, EnumVariantDecl, EnumDecl, checkEnumDeclaration, checkInlineEnumForm, VariantAccess, checkVariantAccess | 161-332 | ~140 |
| discriminated-union discriminator detection | DiscriminatorCandidateField, UnionVariantSchema, DiscriminatedUnionDecl, checkDiscriminatedUnion, wireNameOf, fieldInVariant, thetaNamedFieldInVariant, orderedWireNames, renderParseLiteralValue, FieldEvaluation, evaluateField, evaluateOccurrences, detectImplicitDiscriminator, checkExplicitDiscriminator, absentFieldDiagnostic, nonLiteralDiagnostic, nonStringDiagnostic, duplicateValueDiagnostic | 371-761 | ~330 |
| by-clause check | ByClauseDecl, checkByClause | 780-817 | ~30 |
| type-alias cycle detection | SchemaGraphNode, detectTypeAliasCycles | 825-907 | ~70 |

Header roster, src/parser/schema-declarations.ts:3-5 (excerpt):

```
// This module owns the parse-time well-formedness checks for the three schema
// declaration shapes of schemas.md and type-system.md:
```

Cluster independence: the discriminated-union family shares no helper with the object/enum families (its own field-evaluation stack, `evaluateOccurrences` 503-547, `detectImplicitDiscriminator` 550-608, `checkExplicitDiscriminator` 611-700); `detectTypeAliasCycles` (845-907) is a graph walk over `SchemaGraphNode` that calls nothing else in the file. Importer counts from the map: checkDiscriminatedUnion 1/4, checkByClause 1/1, detectTypeAliasCycles 1/1, checkObjectSchema 1/1, checkEnumDeclaration 1/2 (src/tests) — each family is consumed independently.

## Why this is a problem
Zone band (907 LOC): no presumption — the finding rests on the 5-row distinct-concern inventory above. The five families answer different spec sections (schemas.md §Object schema, §Enum declarations, §Discriminated unions, the `by` clause, and alias-cycle well-formedness), share no code across cluster boundaries, and are each imported independently. Reasons considered: single cohesive feature (the package-discovery keep-whole precedent) fails here because the discriminated-union cluster alone is ~330 LOC — a full module on its own — and its extraction leaves the host at ~570 LOC, below the zone threshold, unlike a split into 30-70-LOC fragments; data-only fails (declarations are a minority of LOC); no exemption exists for this host.

## Suggested direction (non-binding, optional)
Hypotheses, unproven. Seam A: the discriminated-union family (371-761) -> `discriminated-union-checks.ts` (hypothesis) — ~330 LOC, exported symbols moved: DiscriminatorCandidateField, UnionVariantSchema, DiscriminatedUnionDecl, checkDiscriminatedUnion; external importers 1/2, 1/3, 0/0, 1/4 (src/tests); no cross-references back into the host. Seam B: detectTypeAliasCycles + SchemaGraphNode (825-907) -> `schema-alias-cycles.ts` (hypothesis) — ~70 LOC, 1/0 and 1/1 importers, no back-references. None identified yet for the by-clause check.

## False-positive check
Band: zone per the authoritative map (907 LOC); the 2-or-more-concern requirement is met by the 5-row inventory. Reasons-considered list recorded above with defeating evidence. Exemptions check: no D9 key for src/parser/schema-declarations.ts in quality/exemptions.json. Generated-code check: hand-written. Spec-mirror check: the checks cite schemas.md sections, but the file spans five section families, not one; the header itself claims only three. Header staleness (roster omits the discriminated-union, by-clause and cycle families) is routed to D2 in the shard notes, not filed here. Ranges re-read before filing (1-95, 191-280, 605-705; anchors 371/403/550/798/845 verified by grep).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 907 LOC / zone band, no D9 exemption, no reverted prior split; the 5-row inventory matches the map's declaration table (union cluster 323 LOC, enum 137, object 95, by 25, cycle 68) with no shared locals or cross-cluster helper calls (only the 1-line `EnumValueKind` type is reused by the union cluster, and the V5b banner at 334-359 does name the extra families — neither refutes the inventory); no overlooked concrete/strong keep-whole reason; target shape needs a human ruling (triage: claude-fable-5-1)
