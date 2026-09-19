---
id: PTQ-0870
title: Two in-scope inbound-boundary test files inline the SchemaDecl/EnumDecl filters their own sibling files import as schemaDeclsOf/enumDeclsOf
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inbound-boundary-binder-args.test.ts:136-141
  - tests/inbound-boundary-typed-query.test.ts:131-136
  - tests/inbound-rebuild-declaration-order.test.ts:100-101
  - tests/inbound-translation-plan.test.ts:58-59
  - tests/helpers/e2e-s1.ts:220-227
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Two in-scope inbound-boundary test files inline the SchemaDecl/EnumDecl filters their own sibling files import as schemaDeclsOf/enumDeclsOf

## Observation
tests/helpers/e2e-s1.ts exports `schemaDeclsOf(doc)` and `enumDeclsOf(doc)`,
each a one-line `doc.body.statements.filter` narrowing to `SchemaDecl` /
`EnumDecl`. Within this same review's five-file set, two files
(`tests/inbound-rebuild-declaration-order.test.ts`,
`tests/inbound-translation-plan.test.ts`) import and call these two exports
directly, while the other two boundary files
(`tests/inbound-boundary-binder-args.test.ts`,
`tests/inbound-boundary-typed-query.test.ts`) restate the identical filter
bodies inline as local `const SCHEMAS` / `const ENUMS` declarations instead
of importing the helper.

## Evidence
tests/helpers/e2e-s1.ts:220-227 — the canonical, already-exported pair:
```ts
/** Top-level declarations of this kind, preserving source order. */
export function schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** Top-level declarations of this kind, preserving source order. */
export function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
}
```

tests/inbound-boundary-binder-args.test.ts:136-141 (inline restatement; the
file's own import line 2 pulls only `parseDeps as makeParseDeps` from
`./helpers/e2e-s1`, not `schemaDeclsOf`/`enumDeclsOf`):
```ts
const SCHEMAS: readonly SchemaDecl[] = DOC.body.statements.filter(
  (s): s is SchemaDecl => s.kind === "schema",
);
const ENUMS: readonly EnumDecl[] = DOC.body.statements.filter(
  (s): s is EnumDecl => s.kind === "enum",
);
```

tests/inbound-boundary-typed-query.test.ts:131-136 (same inline restatement;
the file imports `parseDoc` from `./helpers/e2e-s1` but not
`schemaDeclsOf`/`enumDeclsOf`):
```ts
const SCHEMAS: readonly SchemaDecl[] = DOC.body.statements.filter(
  (s): s is SchemaDecl => s.kind === "schema",
);
const ENUMS: readonly EnumDecl[] = DOC.body.statements.filter(
  (s): s is EnumDecl => s.kind === "enum",
);
```

The sibling files in the same review set that call the exported helper
instead, tests/inbound-rebuild-declaration-order.test.ts:2,100-101:
```ts
import { parseDeps as makeDeps, schemaDeclsOf, enumDeclsOf } from "./helpers/e2e-s1";
...
const SCHEMAS = schemaDeclsOf(DOC);
const ENUMS = enumDeclsOf(DOC);
```
and tests/inbound-translation-plan.test.ts:1,58-59:
```ts
import { parseDeps as makeDeps, schemaDeclsOf, enumDeclsOf } from "./helpers/e2e-s1";
...
  const schemas = schemaDeclsOf(doc);
  const enums = enumDeclsOf(doc);
```

## Why this is a problem
The predicate bodies at both flagged sites are character-for-character
identical to `schemaDeclsOf`/`enumDeclsOf`'s own filter bodies, and two other
files reviewed in this same wave — testing the same bug-0172 boundary family,
against the same `Sev`/`Box` declaration shapes — already call the exported
helper for the identical extraction. The duplication is not a cross-repo
inference; it is visible inside the five-file set this review covers, where
the canonical and the restated forms sit side by side.

## Suggested direction (non-binding, optional)
Importing `schemaDeclsOf`/`enumDeclsOf` from `./helpers/e2e-s1` alongside the
imports these two files already draw from that module removes the inline
restatement, matching the two sibling files in the same set.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin;
  the cited lines are a declaration-filter pair, not a pinned count or
  inventory.
- Recording-double check: `SCHEMAS`/`ENUMS` are structural AST filters, not
  recording doubles backing a MUST-NOT-called witness; the carve-out does not
  apply.
- docs/bugs/ signature search: `grep -n "schemaDeclsOf\|enumDeclsOf"
  docs/bugs/0172-inbound-translation-pass-unperformed-at-three-boundaries.md`
  → 0 hits; the bug document does not discuss the local filter as a
  deliberate divergence from the shared helper.
- coverage-matrix/bug-doc citation search: `grep -rl
  "inbound-boundary-binder-args\|inbound-boundary-typed-query"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename or deletion of any `it()`/`describe()` block, only replacing
  an inline filter with an existing import.
- Duplicate-topic check: `grep -rli
  "schemaDeclsOf\|enumDeclsOf" quality/intake/*.md quality/issues/*.md`
  (excluding this file) → no hit naming this pair of files' own inline
  restatement; distinct from the parseTheta-reimplementation finding filed
  separately in this same wave (a different helper, different root cause).
- Coverage check: the claim is about a repeated filter-expression definition
  already covered by an existing exported helper, not about a missing test
  path.

## Triage
verdict: confirmed — independently re-verified: both inline excerpts reproduce verbatim at tests/inbound-boundary-binder-args.test.ts:136-141 and tests/inbound-boundary-typed-query.test.ts:131-136 with filter predicates byte-identical to the exported `schemaDeclsOf`/`enumDeclsOf` at tests/helpers/e2e-s1.ts:220-227; the two files import from `./helpers/e2e-s1` (:7 `parseDeps as makeParseDeps`; :101 `parseDoc`) but not the pair, while inbound-rebuild-declaration-order.test.ts:2,100-101 and inbound-translation-plan.test.ts:1,58-59 call the export; stated docs/bugs-0172 (0) and coverage-matrix (0) searches reproduce; both locations under tests/, not gate/tests/live files, pure AST filters not recording doubles, no merge/rename/delete proposed — D7 boilerplate-duplication class; the filing's dedupe claim is misreported (grep hits resolved PTQ-0604 and open PTQ-0574) but non-refuting: PTQ-0604 (status fixed) is the filing whose fix commit cc0a8fe7 (2026-09-18) MINTED the export and migrated only its two named files, and both boundary files predate it (added c2d22aad 2026-08-16), so these are sites that fix did not sweep — the repo tracks post-fix unmigrated sites as fresh rows (cf. PTQ-0748, PTQ-0729); PTQ-0574 covers the distinct `(body: string)` loads-cleanly-then-filter harness, not this pair; same-wave d7-01 covers the parseTheta wrapper at :119-134/:129-130, disjoint from these lines; the fixer should also sweep the three unswept local-function copies PTQ-0604's triage already named and which still exist (inbound-union-arm-dispatch.test.ts:193-199, wire-translation-inbound-retag.test.ts:43-49, b0465-imported-annotation-vacuous-validation.test.ts:176-183) (triage: claude-fable-5-1)
