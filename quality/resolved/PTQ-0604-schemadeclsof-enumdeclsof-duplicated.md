---
id: PTQ-0604
title: schemaDeclsOf()/enumDeclsOf() are redeclared byte-for-byte in two inbound-boundary test files with no shared home
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inbound-rebuild-declaration-order.test.ts:104-110
  - tests/inbound-translation-plan.test.ts:55-61
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# schemaDeclsOf()/enumDeclsOf() are redeclared byte-for-byte in two inbound-boundary test files with no shared home

## Observation
tests/inbound-rebuild-declaration-order.test.ts and
tests/inbound-translation-plan.test.ts each declare a module-scope pair
`schemaDeclsOf(doc)` / `enumDeclsOf(doc)` that filters a parsed
`ThetaDocument`'s `body.statements` down to `SchemaDecl`/`EnumDecl` members by
a `kind` type guard. The two pairs are byte-identical apart from surrounding
whitespace. Neither tests/helpers/e2e-s1.ts nor any other file under
tests/helpers/ exports an equivalent filter (e2e-s1.ts exports
`findLetStmt`/`findFnDecl`, which the same two files would need to extend by
the same two-line shape rather than import).

## Evidence

tests/inbound-rebuild-declaration-order.test.ts:104-110 (re-read immediately before filing):
```ts
function schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
}
```

tests/inbound-translation-plan.test.ts:55-61 — byte-identical:
```ts
function schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
}
```

## Why this is a problem
Two files under review declare the identical "pull out this document's schema
declarations / enum declarations" pair rather than sharing one definition.
Both files already declare and import their `SchemaDecl`/`EnumDecl` types
from the same `../src/parser/theta-document` module and already import other
substrate from `tests/helpers/e2e-s1.ts`-shaped locations in the same review
scope (per the sibling makeDeps/parseDeps finding filed in this same wave), so
the two-function pair sits beside other duplicated substrate rather than
being an isolated one-off.

## Suggested direction (non-binding, optional)
A shared tests/helpers/ export for "schema/enum declarations of a parsed
ThetaDocument" is the natural home the two identical declarations point
toward, alongside the sibling `parseDeps`/`ajv` extractions already proposed
for these same files.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or a listed gate kin; the
  cited lines are a statement-filtering helper pair, not a pinned count or
  inventory.
- Recording-double: `schemaDeclsOf`/`enumDeclsOf` are pure filters over a
  parsed document, not a recording double backing a MUST-NOT-called witness;
  the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "schemaDeclsOf\|enumDeclsOf"
  docs/bugs/` → no hits; no documented correct-reason red discusses this
  duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "inbound-rebuild-declaration-order\|inbound-translation-plan"
  docs/reference/coverage-matrix.md` → 0 hits for both. This finding proposes
  no merge, rename or deletion of any file or `it()`/`describe()` — only that
  the shared filter pair could be imported rather than redeclared — so no
  citation is affected.
- Overlap check: `grep -rl "schemaDeclsOf\|enumDeclsOf" quality/intake/*.md
  quality/resolved/*.md` (excluding this file) → no hits naming this specific
  pair; the pair is distinct from the already-filed `makeDeps`/`realAjv`
  findings for the same two files (different functions, filed separately per
  "one root cause per finding").
- Coverage-drift check: the claim is about a repeated filter-pair DEFINITION,
  not about a missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts match verbatim at inbound-rebuild-declaration-order.test.ts:104-110 and inbound-translation-plan.test.ts:55-61 and are byte-identical; `grep -rn "schemaDeclsOf\|enumDeclsOf" tests/helpers/` → 0 hits (e2e-s1.ts exports findLetStmt/findFnDecl only), so no shared home exists; the candidate's own searches were misreported but non-refuting — docs/bugs/ has 4 hits (0028/0174/0180/0465) all describing the PRODUCTION module-private pair at src/extension/production-theta-producer.ts:7181-7196, and the 4 other same-wave intake files naming schemaDeclsOf cover the `(src: string)`/`(body: string)` harness variants in disjoint files (d7-02's triage note explicitly delimits d7-03 as the `(doc: ThetaDocument)` variant); the candidate UNDERCOUNTS — the identical `(doc: ThetaDocument)` pair also sits at tests/inbound-union-arm-dispatch.test.ts:211-217, tests/wire-translation-inbound-retag.test.ts:64-70 and tests/b0465-imported-annotation-vacuous-validation.test.ts:176-183 (5 byte-identical copies, not 2; fixer should sweep all five); both locations in tests/, neither a gate or tests/live file, pure filters not recording doubles, coverage-matrix 0 hits, no merge/rename/delete proposed; D7 boilerplate-duplication class, no PTQ row tracks this pair (PTQ-0257 is letStmtOf, PTQ-0214/0405 are parseDeps/parseDoc) (triage: claude-fable-5-1)
