---
id: PTQ-1245
title: schema-declarations.ts re-exports discriminated-union-checks symbols nothing imports through it
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/schema-declarations.ts:33-38
sites: 1
fix_scope: localized
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# schema-declarations.ts re-exports discriminated-union-checks symbols nothing imports through it

## Observation
`schema-declarations.ts` re-exports `checkDiscriminatedUnion`,
`DiscriminatorCandidateField`, `DiscriminatedUnionDecl`, and `UnionVariantSchema`
from `./discriminated-union-checks`. The module header even narrates this as
one of the module's jobs ("re-exports discriminated-union checks from
discriminated-union-checks.ts"). Every production and test consumer of these
four names imports them directly from `./discriminated-union-checks` (or
`../src/parser/discriminated-union-checks` from tests), never from
`./schema-declarations`.

## Evidence
`src/parser/schema-declarations.ts:3-4,33-38`:
```ts
// This module checks object schemas, enum declarations, variant access, `by`
// clauses, and alias cycles, and re-exports discriminated-union checks from
// discriminated-union-checks.ts (schemas.md and type-system.md):
...
export {
  checkDiscriminatedUnion,
  type DiscriminatorCandidateField,
  type DiscriminatedUnionDecl,
  type UnionVariantSchema,
} from "./discriminated-union-checks";
```

The one production consumer, `structural-checks.ts:23`, imports straight from
the source module instead of through this re-export:
```ts
import { checkDiscriminatedUnion, type DiscriminatorCandidateField, type UnionVariantSchema } from "./discriminated-union-checks";
```

Every test file that uses these names does the same — `tests/b0046-by-clause-undecided-inputs.test.ts:3`,
`tests/disc-unions-recursion.test.ts:6`,
`tests/discriminator-field-classifier-brace-group.test.ts:6-10`, and
`tests/non-literal-by-field-refusal.test.ts:5-8` all import from
`"../src/parser/discriminated-union-checks"`, not from
`"../src/parser/schema-declarations"`.

Search: `grep -rn "checkDiscriminatedUnion\|DiscriminatorCandidateField\|DiscriminatedUnionDecl\|UnionVariantSchema" --include=*.ts .` across `src/`, `tests/`, `extensions/`, `tools/` (excluding `dist/` build output and the `.pi/tmp` prototype scratch file) returns every import site pointed at `discriminated-union-checks.ts` directly; none imports these four identifiers from `schema-declarations.ts`.

## Why this is a problem
The re-export statement is reachable code (the module loads and the names are
exported), but the export path itself has zero importers — every caller that
needs these four names already goes straight to `discriminated-union-checks.ts`.
The module header's claim that the module "re-exports discriminated-union
checks" describes a facility no current caller uses; the re-export is pure
surface with no live import path exercising it.

## Suggested direction (non-binding, optional)
Dropping the re-export block (and adjusting the header sentence that narrates it) would leave every existing import unaffected, since all of them already go straight to `discriminated-union-checks.ts`.

## False-positive check
Ran `grep -rn "checkDiscriminatedUnion\|DiscriminatorCandidateField\|DiscriminatedUnionDecl\|UnionVariantSchema"` over `src/`, `tests/`, `extensions/`, `tools/` (excluding `dist/` and the `.pi/tmp` scratch prototype) and inspected every import statement returned: all resolve to `./discriminated-union-checks` (or its test-relative path), none to `./schema-declarations`. No dynamic/string-keyed access pattern applies (these are TS type/value imports, not registry lookups). Not test-only reachable — the finding is about the re-export path being unused, not about the underlying symbols being dead (they are alive via the direct import).

## Triage
verdict: confirmed — excerpt at schema-declarations.ts:3-5/33-38 byte-exact; independent grep of the four identifiers across src/, tests/, extensions/, tools/ finds every import (structural-checks.ts:23, b0046-by-clause-undecided-inputs:3, disc-unions-recursion:6, discriminator-field-classifier-brace-group:6-10, non-literal-by-field-refusal:5-8) pointed at `discriminated-union-checks` directly and no `* as`/`export *` of `schema-declarations` anywhere, so the re-export path has zero importers; git show 97a7ee96 (the PTQ-1186 D9 fix) added the re-export block and in the same commit repointed theta-document.ts and all four tests to the new module, so it was never a compat facade with a live consumer and the header sentence narrating it is the only trace; PTQ-1186 is resolved and did not track this leftover, no other intake/issue names it (triage: claude-fable-5-1)
