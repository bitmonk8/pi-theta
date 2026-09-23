---
id: PTQ-1413
title: enumDeclsOf docstring claims "both" lowerQueryResponseSchema call sites when four exist
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/query-text-render.ts:68-79
  - src/extension/production-theta-producer.ts:3436
  - src/extension/production-theta-producer.ts:3977-3980
  - src/extension/production-theta-producer.ts:5529-5532
  - src/extension/query-text-render.ts:169
sites: 1
fix_scope: localized
wave: qw20260923023517
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# enumDeclsOf docstring claims "both" lowerQueryResponseSchema call sites when four exist

## Observation
The docstring on `enumDeclsOf` in `query-text-render.ts` asserts that "Both
`lowerQueryResponseSchema` call sites pass `mergedEnumDeclsOf` /
`mergedSchemaDeclsOf`". A repo-wide search for non-definition invocations of
`lowerQueryResponseSchema` finds four call sites in production source, not
two, and all four pass the `mergedSchemaDeclsOf(...)` / `mergedEnumDeclsOf(...)`
outputs as the second/third arguments.

## Evidence
`src/extension/query-text-render.ts:68-76`:
```
/**
 * The theta body's SAME-FILE `enum` declarations (bug 0028 §Fix:
 * `schemaDeclsOf`'s enum sibling). Both `lowerQueryResponseSchema` call sites
 * pass `mergedEnumDeclsOf` / `mergedSchemaDeclsOf` (bug 0465), which merge
 * these same-file decls with the theta's imported ones; `enumDeclsOf` /
 * `schemaDeclsOf` supply the same-file half so a declared `enum` annotation
 * (`@<Severity>`) resolves at the typed-query / `invoke<T>` lowering exactly
 * as it does on the `params:` path.
 */
```

Exact search: `grep -rn "lowerQueryResponseSchema(" src/ | grep -v "export function lowerQueryResponseSchema"` — 4 hits:

`src/extension/production-theta-producer.ts:3433-3436`:
```
    const schemaDecls = mergedSchemaDeclsOf(declSite);
    const enumDecls = mergedEnumDeclsOf(declSite);
    const loweredParams = fn.params.map((param) =>
      param.type.length > 0 ? lowerQueryResponseSchema(param.type, schemaDecls, enumDecls) : undefined,
```

`src/extension/production-theta-producer.ts:3977-3980`:
```
        ? lowerQueryResponseSchema(
            expr.schema,
            mergedSchemaDeclsOf(deps.theta),
            mergedEnumDeclsOf(deps.theta),
```

`src/extension/production-theta-producer.ts:5529-5532`:
```
    const lowered = lowerQueryResponseSchema(
      returnSchema,
      mergedSchemaDeclsOf(mergedSite),
      mergedEnumDeclsOf(mergedSite),
    );
```

`src/extension/query-text-render.ts:165-169` (inside `collectLaunchRespondNames`, the same file as the comment):
```
  const schemaDecls = mergedSchemaDeclsOf(theta);
  const enumDecls = mergedEnumDeclsOf(theta);
  const names = new Set<string>();
  for (const body of bodies) {
    for (const q of collectSessionTypedQueries(body)) {
      if (q.schema === null) {
        continue;
      }
      const lowered = lowerQueryResponseSchema(q.schema, schemaDecls, enumDecls);
```

## Why this is a problem
The comment's factual claim about the shape of the codebase ("Both … call
sites") is falsified by the current call graph: there are four call sites of
`lowerQueryResponseSchema` in production source, one of which is in the very
file the comment lives in. This is stale/miscounted header prose describing
collaborators, which the brief marks as in-scope even when the surrounding
mechanism (merged-decls-first lowering) is deliberate and correct.

## Suggested direction (non-binding, optional)
Update the count/wording to reflect the current number of call sites, or drop
the specific count and state the invariant ("every call site passes …")
without a number that can drift again.

## False-positive check
Ran `grep -rn "lowerQueryResponseSchema(" src/` and excluded the `export
function lowerQueryResponseSchema` definition line; the remaining four call
sites (production-theta-producer.ts:3436, :3977, :5529, and
query-text-render.ts:169) each pass `mergedSchemaDeclsOf(...)` /
`mergedEnumDeclsOf(...)` as arguments, confirming the substantive claim (all
call sites use the merged variants) is true but the "Both … call sites" count
is wrong. Checked `git log --follow -p` on query-text-render.ts for this
sentence; it appears once in history (introduced at the PTQ-1285 split),
with no evidence it was ever updated as call sites were added.

## Triage
verdict: confirmed — excerpt reproduces byte-for-byte at query-text-render.ts:68-76; `grep -rn "lowerQueryResponseSchema(" src/` minus the definition yields exactly 4 call sites (production-theta-producer.ts:3436, :3977, :5529; query-text-render.ts:169), each passing mergedSchemaDeclsOf/mergedEnumDeclsOf; `git log -S` shows the "Both" sentence landed in d03f7398 (bug-0465) when the producer had exactly 2 sites (then :3194/:4544) and was never updated as the params-lowering site and bug-0488 collectLaunchRespondNames were added — stale collaborator-count header prose per D2 precedents PTQ-0296/0297/0309/1108; no open/resolved issue tracks it (PTQ-1391 is an unrelated D7 test dupe, PTQ-1285 is D9 placement) (triage: claude-fable-5-1)
