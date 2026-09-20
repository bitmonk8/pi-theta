---
id: pending
title: toSystemParamType is 168 LOC because its named-type/alias arm resolves enums, alias chains, unions-by-alias, and recursive schema shells inline
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/frontmatter.ts:1270-1437
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/frontmatter.ts#toSystemParamType
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# toSystemParamType is 168 LOC because its named-type/alias arm resolves enums, alias chains, unions-by-alias, and recursive schema shells inline

## Observation
`toSystemParamType` (src/parser/frontmatter.ts:1270-1437) is 168 LOC — justify band
(threshold 100). It classifies a `params:` type-expression source into a
`SystemParamType`. The inline-object and union arms dispatch to helpers
(`inlineObjectType`, `buildSystemUnionArms`), but the array arm and the whole
named-type resolution (enum / single-arm alias chase with `aliasChain` / multi-arm
alias union / recursive object shell via the `resolving` map / imported symbol) are
inline.

## Evidence
Step inventory:

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| inline-object arm (dispatches out) | 1282-1284 | 3 | reads s; calls inlineObjectType |
| top-level union arm (dispatches out) | 1292-1299 | 8 | reads s, bodyTypes; calls buildSystemUnionArms |
| generic/array arm (element-union pick, named-element sidecars, inline-element sidecars) | 1300-1341 | 42 | reads bodyTypes; calls splitTopLevel, buildSystemUnionArms, namedSchemaOf, buildOutboundSidecars, buildInlineSidecars |
| primitive switch | 1342-1355 | 14 | reads s only |
| named-type resolution: enum, schema shell + recursion, alias chase, alias-union | 1356-1428 | 73 | reads/writes resolving (mutable shell map), aliasChain; recurses into itself |
| imported-symbol + fallback terminals | 1429-1437 | 9 | reads bodyTypes.imports |

Excerpt of the inline recursive-shell construction (src/parser/frontmatter.ts:1411-1419):

```ts
      const map = new Map<string, SystemParamType>();
      const sc = buildOutboundSidecars(s, bodyTypes);
      const shell: SystemParamType = {
        kind: "object",
        fields: map,
        sidecars: sc.sidecars,
        rootDef: sc.rootDef,
      };
      resolving.set(s, shell);
```

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason is recorded.
Reasons considered and defeated:
- Closed-enumeration dispatch: the arms do mirror the type-expression
  alternatives (inline object | union | generic | primitive | named type), and the
  body cites the canonical structural order (`lowerTypeExpr`, params.ts;
  `classifyDiscriminatorFieldType`, theta-document.ts) — but the reason requires
  each arm short, and the named-type arm is 73 LOC (the array arm 42 LOC).
- One grammar production family: fails on the same ground — the function does NOT
  call out for every sub-production; the enum/alias/schema/import alternatives are
  resolved inline while only inline-object and union dispatch to helpers.
- Single algorithm with shared local state: only three values thread through the
  recursion (`bodyTypes`, `resolving`, `aliasChain`) — below the 6-local bar, and
  they already travel in the signature, so an extracted named-type helper adds no
  new threading.
- Data-only / generated: not applicable.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the named-type arm (lines 1356-1428) ->
`namedTypeSystemParam(s, bodyTypes, resolving, aliasChain)` in-file helper
(hypothesis) — ~73 LOC, no exported symbols move, cross-references back into the
host: toSystemParamType (mutual recursion), buildSystemUnionArms,
buildOutboundSidecars. Seam B: the array arm (lines 1300-1341) ->
`arraySystemParam(element, bodyTypes)` (hypothesis) — ~42 LOC, no exported symbols
move, cross-references: buildSystemUnionArms, namedSchemaOf, buildOutboundSidecars,
buildInlineSidecars.

## False-positive check
Band check: 168 LOC in 100-199 (justify). Reasons-considered list above with the
defeating evidence per reason (longest-arm LOC counted: 73). Exemptions check: no
`src/parser/frontmatter.ts#toSystemParamType` key in quality/exemptions.json.
Generated-code check: hand-written (bug 0406/0422/0425/0427/0442-0444 commentary).
Spec-mirror check: the arm order mirrors sibling classifiers' structural order but
the arm bodies are not a spec-table enumeration with short arms. Importer check
(from the map): toSystemParamType is exported with 1 src / 0 test importers, so an
extraction leaves its external contract untouched.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives toSystemParamType 1270-1437 = 168 LOC, band justify (FN_BANDS justify=100); no exemption key in quality/exemptions.json; excerpt matches 1411-1419 verbatim; the 42-LOC array arm and 73-LOC named-type arm are real disjoint returning branches whose consts are arm-local (only s/bodyTypes/resolving/aliasChain cross arms, all signature-borne, so the ≥6-shared-locals reason does not apply and the closed-enumeration reason fails on arm length); no reverted prior split in git history; not tracked elsewhere (sibling d9-01/d9-02 filings target the file and parseFrontmatter, different hosts) — the extraction shape (seam A/B) is a design decision needing a human ruling (triage: claude-fable-5-1)
