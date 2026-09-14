---
id: PTQ-0012
title: theta-document.ts imports the types ByClauseDecl and DiscriminatedUnionDecl from schema-declarations and never references either
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/theta-document.ts:90-91
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# theta-document.ts imports the types ByClauseDecl and DiscriminatedUnionDecl from schema-declarations and never references either

## Observation
The import block for `./schema-declarations` in `src/parser/theta-document.ts`
pulls in two type-only names, `ByClauseDecl` and `DiscriminatedUnionDecl`, that
appear nowhere else in the file. The functions that would use those shapes
(`checkByClause`, `checkDiscriminatedUnion`) are called with inline object
literals whose types are inferred at the call sites, so the named types are
never written out. Neither name is re-exported from this module. The repo's
tsconfig sets no `noUnusedLocals` and the ESLint config wires only three
bespoke `theta-local` rules, so no tool flags the unused imports.

## Evidence
src/parser/theta-document.ts:80-96 (the import; lines 90-91 are the two dead
names):

```ts
import {
  checkObjectSchema,
  checkEnumDeclaration,
  checkInlineEnumForm,
  checkVariantAccess,
  checkByClause,
  checkDiscriminatedUnion,
  detectTypeAliasCycles,
  type EnumValueKind,
  type EnumVariantDecl,
  type ByClauseDecl,
  type DiscriminatedUnionDecl,
  type DiscriminatorCandidateField,
  type SchemaDeclSite,
  type SchemaGraphNode,
  type UnionVariantSchema,
} from "./schema-declarations";
```

Occurrence counts inside the file: `grep -c "\bByClauseDecl\b"
src/parser/theta-document.ts` → 1; `grep -c "\bDiscriminatedUnionDecl\b"` → 1.
The single hit for each is the import line itself. Every sibling type imported
in the same statement has 2+ occurrences (`SchemaDeclSite`: 2,
`EnumVariantDecl`: 3, `SchemaGraphNode`: 3, `DiscriminatorCandidateField`: 4,
`UnionVariantSchema`: 4).

Git history: both names were added by commit f959f8de ("fix(bug-0033): schema
alias/union declarations parse, check, and lower"), and in that commit's
version of the file each name also occurs exactly once (the import line) —
they were unused from the moment of introduction.

Tooling gap (why nothing flags it): tsconfig.json's compilerOptions carry no
`noUnusedLocals`/`noUnusedParameters`, and eslint.config.js enables only
`theta-local/no-broad-catch`, `no-unguarded-promise-combinator`, and
`no-blocking-sync` — no unused-import rule.

## Why this is a problem
Dead code, proven dead: two imported identifiers with zero references in the
importing file, zero re-exports, and zero external consumers routed through
this module. They have been dead since the commit that introduced them. An
import statement is a declaration of dependency; these two entries state a
dependency the code does not have, which misleads a reader auditing what
theta-document.ts actually consumes from schema-declarations.

## Suggested direction (non-binding, optional)
Drop the two names from the import list. Optionally, enabling an
unused-import check (TS `noUnusedLocals` or an ESLint rule) would prevent the
class from recurring, but that is a separate, wider decision.

## False-positive check
- Whole-file reference search: `grep -n "ByClauseDecl\|DiscriminatedUnionDecl"
  src/parser/theta-document.ts` → only lines 90-91 (the import itself).
- Re-export search: no `export {` statement exists in theta-document.ts (the
  two grep hits for that pattern are prose comments at :1652 and :4463), and
  no `export type ByClauseDecl`/`DiscriminatedUnionDecl` declaration exists.
- Cross-tree search: `grep -rn "ByClauseDecl\|DiscriminatedUnionDecl" src
  extensions tools tests` → only src/parser/schema-declarations.ts (definition
  and internal use — the types are alive in their home module) and the dead
  import in theta-document.ts. No test imports them from theta-document.
- String-keyed/dynamic access: types are erased at compile time; no runtime
  dynamic access is possible for a type-only import.
- Git intent check: `git log -S ByClauseDecl -- src/parser/theta-document.ts`
  → single commit f959f8de; `git show f959f8de:src/parser/theta-document.ts |
  grep -c ByClauseDecl` → 1 (import only), so no earlier in-file use was ever
  removed — the import never had a user.

## Triage
verdict: confirmed — tsc --noUnusedLocals independently flags exactly lines 90 and 91 (TS6133) and a repo-wide grep finds ByClauseDecl/DiscriminatedUnionDecl only at their schema-declarations.ts definitions and this import, with no re-export or dynamic path. (triage: claude-opus-5)
