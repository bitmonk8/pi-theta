---
id: PTQ-1214
title: checkSchemaDeclarationGraph bundles graph collection, object by-clause, alias-RHS checks, discriminated-union validation, and cycle detection in one 178-LOC pass
lens: D9
status: open
verdict: confirmed
locations:
  - src/parser/theta-document.ts:8738-8915
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/theta-document.ts#checkSchemaDeclarationGraph
d9_band: justify
wave: qw20260921001431
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-21
---

# checkSchemaDeclarationGraph bundles graph collection, object by-clause, alias-RHS checks, discriminated-union validation, and cycle detection in one 178-LOC pass

## Observation
`checkSchemaDeclarationGraph` (src/parser/theta-document.ts:8738-8915, 178 LOC
per the wave's structural map, justify band FN 100-199) is the whole-file
schema-declaration checker invoked once from `checkStructural`
(theta-document.ts:8718). It runs two full loops over `statements` plus a
final graph pass: first collecting graph nodes and field lists, then applying
per-declaration rules (object-form `by` illegality, per-arm alias type checks,
alias name resolution with two withhold guards, union-form `by` validation,
discriminated-union construction), then running alias-cycle detection once
over the collected graph.

## Evidence
Distinct-concern inventory (all ranges re-read this wave):

| concern | members | line ranges | LOC |
|---|---|---|---|
| graph-node & field-list collection | `objectFields`, `graphNodes`, `nodeSites`, `firstAliasStmt` build loop | 8749-8774 | 26 |
| object-form by-clause rule | `checkByClause({ form: "object" })` | 8780-8789 | 10 |
| alias-RHS per-arm type checks, name resolution, unspellable refusal | per-arm checkInlineEnumForm + parseTypeExpression (8809-8813), collectUnresolvedNamedTypes over rejoined arms (8841-8853), reserved-keyword/unresolved emission, guard-1/guard-2 withholds (`declDiagStart`, `s.aliasRhsRefused`, 8858-8872) | 8790-8872 (excluding 8814-8833) | ~63 |
| union-form by-clause + discriminated-union validation | `byForm` computation (8829-8833), armWalkHadError withhold + checkByClause (8873-8885), buildUnionVariantSchemas + checkDiscriminatedUnion (8887-8895) | 8814-8833, 8873-8895 | ~33 |
| alias-cycle detection anchor | detectTypeAliasCycles over `graphNodes` with per-cycle `nodeSites` anchoring | 8898-8914 | 17 |

Excerpt of the phase boundary between per-decl rules and cycle detection
(theta-document.ts:8887-8907, elided):

```ts
    const variants = buildUnionVariantSchemas(s.arms, objectFields);
    if (variants !== undefined) {
      out.push(
        ...checkDiscriminatedUnion(
          { name: s.name, ...(s.by !== undefined ? { by: s.by } : {}), variants },
          site,
        ),
      );
    }
  }

  if (firstAliasStmt !== undefined) {
    ...
    out.push(
      ...detectTypeAliasCycles(
```

Importer counts (structural map): the function is module-private (0 src / 0
tests); its rule primitives (`checkByClause`, `checkDiscriminatedUnion`,
`detectTypeAliasCycles`, `SchemaGraphNode`) already live in
`./schema-declarations` (schema-declarations.ts:825, 845).

## Why this is a problem
Justify band: presumption of breakdown; not filed only on a concrete recorded
reason. Reasons considered and defeated:
- Closed-enumeration dispatch: no switch over a spec-named closed set — it is
  a sequential rule application over one statement kind. Defeated.
- Single algorithm with shared local state: the locals crossing phase
  boundaries are `out`, `objectFields`, `graphNodes`, `nodeSites`,
  `firstAliasStmt` — 5, under the 6-local threshold; the per-decl loop reads
  only `objectFields` from phase 1, and the cycle phase reads only
  `graphNodes`/`nodeSites`/`firstAliasStmt`. Defeated.
- One grammar production family: the reason names a parser routine performing
  one production's sequential recognition; this is a checker pass, and its
  rule primitives are already externalized to schema-declarations.ts — the
  host is the orchestration plus one inlined rule family (the alias-RHS
  checks). Defeated.
- Data-only / generated: hand-written, comment-dense (bug 0033/0046/0061
  citations). Defeated.
No entry in quality/exemptions.json for this host.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the alias-RHS per-arm checks + name resolution
+ unspellable refusal (8790-8872) -> a `checkAliasRhs` helper (in-file or
beside checkByClause in schema-declarations.ts) — ~63 LOC, no exported symbols
move, 0 external importers, cross-references back into the host: `objectFields`,
`typeNames`, `pushDiag`. Seam B (hypothesis, unproven): graph-node collection
+ cycle anchoring (8749-8774, 8898-8914) -> a `detectSchemaCycles` wrapper
next to detectTypeAliasCycles in schema-declarations.ts — ~43 LOC, nothing
exported, cross-reference: `identifierShapedReferences` (theta-document.ts:8930).

## False-positive check
Band: map-quoted 178 LOC, justify (FN_BANDS.justify = 100); not recounted by
hand. Reasons-considered list above with the defeating count or citation per
reason. Exemptions check: quality/exemptions.json has no entry for this host or
file. Generated-code check: hand-maintained (bug-numbered comments, no
generator header). Spec-mirror check: cited grammar.md §"schema X by <field>"
rules are enforced through already-extracted primitives (checkByClause,
checkDiscriminatedUnion, detectTypeAliasCycles in schema-declarations.ts); the
over-threshold LOC is the host's own inlined alias-RHS family plus phase
orchestration, not a spec table mirror. Duplicate check: not covered by the
file-level finding (qw20260920202922-d9-01-theta-document-file-twelve-concerns,
a different host key) nor by any function-level filing from prior waves (none
names this function); PTQ-1131 (annotation validation) touches walkStatement,
not this pass.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces 8738-8915 / 178 LOC / justify (0/0 importers), no exemption for the host, excerpt byte-exact at 8887-8907, call site at 8719 (1-line drift), primitives at schema-declarations.ts:403/798/825/845, no reverted split in git (bb21dacc only moved diagnostic helpers out); the five inventory rows are real distinct rule families, though the filing's shared-local count of 5 undercounts — `declDiagStart` is written at 8809 (row 3) and read at 8882 (row 4's armWalkHadError) and per-iteration `site` (8779) is read by rows 2-4, giving 6-7 locals crossing rows — yet the ≥6-locals reason still does not apply because no helper signature would thread ≥6 (the collect+cycle vs per-decl cut shares only `out`/`objectFields`; a row-3 helper needs s/site/typeNames/file and returns diagnostics), and rows 2 and 4 both being checkByClause forms leaves a ≥4-row inventory even if merged (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
