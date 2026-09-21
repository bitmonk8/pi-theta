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
verdict: questionable — accounting re-verified independently: size-scan map (manifest via mktemp) reproduces 907 LOC / band zone (FILE_BANDS zone=600) with the declaration table matching the 5-row inventory (object 33-158, enum 161-332, union 371-761, by 780-817, cycle 825-907); header excerpt at lines 3-5 byte-exact; no `schema-declarations` key in quality/exemptions.json and `exemptions --lens D9` lists none; git log shows V5a→V5b accretion, never a reverted split, and no sibling module exists; in-file identifier grep shows the only cross-cluster reuse is the 4-line `SchemaDeclSite` anchor type (parameter type at every check) and the 1-line `EnumValueKind` alias (374/479/736) — no shared locals, no cross-cluster helper calls, `detectTypeAliasCycles` and `checkByClause` call nothing else in the file; importers verified (theta-document.ts:69-83 pulls all seven checks independently, params.ts:56, type-grammar.ts:106, invoke-imported-checks.ts:45); the only quibble is that the by-clause row could be folded into the discriminated-union row (both cite schemas.md §Discriminated unions), which still leaves ≥ 4 concerns; no concrete/strong keep-whole reason applies (no closed-enumeration dispatch, no ≥ 6-shared-local algorithm, types are a minority of LOC, multiple spec sections); no existing PTQ tracks a D9 breakdown of this host (PTQ-0573 is D4 test-side); seam/home is a design decision for the human (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time from scratch: size-scan map (mktemp manifest) gives 907 LOC / band zone (zone=600) and its declaration table reproduces every inventory row boundary (33-158 / 161-332 / 371-761 / 780-817 / 825-907; union cluster 323 LOC); header excerpt at lines 3-5 byte-exact; a whole-file identifier grep shows the only symbols crossing cluster boundaries are the 4-line `SchemaDeclSite` parameter anchor (every check) and the 1-line `EnumValueKind` alias (161→374/479/736) — zero cross-cluster helper calls, `checkByClause`/`detectTypeAliasCycles` call nothing in-file — so the five rows are real distinct concerns (the by-clause row folding into the union row still leaves 4); the V5b banner at 334-359 self-declares the union/by/cycle families as a separate seam citing §Discriminated unions/§Recursion, refuting any one-spec-section keep-whole; no D9 key for this host in quality/exemptions.json (only binder-system-prompt#normaliseParamLineBreaks and package-discovery.ts), type LOC ≈ 60 (≪ 80 %), no dispatch table, no ≥ 6-shared-local algorithm, git history V5a-T→V5a→V5b-T→V5b accretion with no reverted split and no sibling module; importers reproduce (theta-document.ts:70-84 seven independent checks, params.ts:56, type-grammar.ts:116, invoke-imported-checks.ts:45); the ten resolved PTQs touching this file are all D2, none a D9 breakdown — the seam/home is a design decision needing a human ruling (triage: claude-fable-5-1)
