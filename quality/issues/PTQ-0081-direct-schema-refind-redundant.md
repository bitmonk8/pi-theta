---
id: PTQ-0081
title: checkThetaImports' specifier loop re-derives directSchema with a byte-identical .find of the schemaDecl already bound earlier in the same iteration
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:1390-1392
  - src/extension/import-static-checks.ts:1486-1497
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# checkThetaImports' specifier loop re-derives directSchema with a byte-identical .find of the schemaDecl already bound earlier in the same iteration

## Observation
Inside `checkThetaImports`' per-specifier loop, `schemaDecl` is bound at the
top of the iteration by a `.find` over `parsed.document.body.statements`.
Roughly one hundred lines later, still in the same iteration over the same
unchanged `parsed` binding, the bug-0422 block binds `directSchema` with a
byte-identical predicate over the same statement list. The two bindings are
necessarily the same object (or both `undefined`); the intervening code only
populates module-local Maps/Sets and builds copies via object spread, never
mutating the statement list.

## Evidence
src/extension/import-static-checks.ts:1390-1392 — the first lookup:
```ts
      const schemaDecl = parsed.document.body.statements.find(
        (stmt): stmt is SchemaDecl => stmt.kind === "schema" && stmt.name === specifier.source,
      );
```

src/extension/import-static-checks.ts:1486-1497 — the second, byte-identical
lookup in the same loop iteration; its own comment concedes it re-reads "the
same body this specifier's own decl loop already parsed":
```ts
      // Bug 0422 route (a): a direct schema match (the same body this
      // specifier's own decl loop already parsed, `parsed.document.body`)
      // builds the real object shell for the load-phase template
      // revalidation below. ...
      const directSchema = parsed.document.body.statements.find(
        (stmt): stmt is SchemaDecl => stmt.kind === "schema" && stmt.name === specifier.source,
      );
      if (directSchema !== undefined) {
```

The sibling bug-0465 block between the two already reuses the first binding and
documents that as the intended pattern — src/extension/import-static-checks.ts:1455-1458:
```ts
      // Bug 0465: feed the QUERY/INVOKE lowering seam the SAME direct-decl
      // finds (`schemaDecl` / `enumDecl`) already made above, plus their
      // transitive lib-of-lib closure, renaming only the entry to the
      // specifier's LOCAL (`as`) binding (schema-subset.md:72).
```

Reference search: `directSchema` across src/, tests/, tools/, extensions/ —
2 hits (:1494 definition, :1497 guard); it is read nowhere else.

## Why this is a problem
Redundant leftover from sequential bug-fix layering, with the history to show
it: `schemaDecl` landed first (fae6d6a4, bugs 0428/0429/0430, v0.421.0);
`directSchema` was added later (401a425b, bugs 0422/0423/0427, v0.435.0 —
`git merge-base --is-ancestor fae6d6a4 401a425b` confirms the order) as a
fresh identical lookup beside the existing binding instead of a read of it.
The later bug-0465 commit (d03f7398) then explicitly adopted the reuse-the-
existing-find pattern for its own block, leaving `directSchema` as the one
re-derivation of a value already in scope — two names for one fact in one
scope, which a reader must diff to learn they cannot disagree.

## Suggested direction (non-binding, optional)
The bug-0422 block can read the existing `schemaDecl` binding; no second
lookup is needed. (No behaviour question is in play — the two expressions are
textually identical over an unmutated list.)

## False-positive check
- Identity of the two lookups: predicates compared byte-for-byte (same
  receiver `parsed.document.body.statements`, same filter
  `stmt.kind === "schema" && stmt.name === specifier.source`, same type
  predicate `stmt is SchemaDecl`).
- Mutation check between :1392 and :1494: the intervening code sets entries in
  `importedSchemas` / `importedNonCtorKinds` / `importedFns` / `importedEnums`
  / `importedTypeSchemas` / `importedTypeEnums` (module-local Maps), calls
  `collectImportedTypeDecls` (reads `libStatements`, copies decls via
  `{ ...decl, name: asName }`), and calls `materializeChain` (reads bodies;
  `materializeSymbol` copies via `{ ...stmt, ... }`; `probe.precache` and
  `parseThetaLib` mutate only the probe caches / `parseCache` /
  `unreadablePaths`). No statement mutates `parsed.document.body.statements`.
- Same-binding check: both lookups sit inside the same
  `for (const specifier of specifiers)` iteration under the same `parsed`
  const; no reassignment occurs between them.
- Reference search: `directSchema` across src/, tests/, tools/, extensions/,
  docs/ — definition and its `!== undefined` guard only; no test pins the
  duplicate lookup as such.
- Git history intent: `git log -S "const directSchema"` → 401a425b;
  `git log -S "const schemaDecl = parsed.document.body.statements.find"` →
  fae6d6a4; ancestry check shows `schemaDecl` predates `directSchema`, so the
  duplication is accretion, not a deliberate ordering constraint.

## Triage
verdict: confirmed — re-verified: :1494's .find is byte-identical to :1390's (diff modulo name) at brace-balance-0 same block scope, over a `readonly Stmt[]` with zero mutations repo-wide, so the two cannot disagree; `directSchema` has exactly 2 hits and is never dereferenced (pure existence guard); cited commit order reproduces (triage: claude-opus-5)
