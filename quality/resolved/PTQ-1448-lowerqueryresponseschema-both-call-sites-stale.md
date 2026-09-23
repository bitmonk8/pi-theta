---
id: PTQ-1448
title: lowerQueryResponseSchema's doc comment claims "both call sites" pass the merged set, but four production call sites do
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/query-schema-lowering.ts:151-163
  - src/extension/invoke-machinery.ts:888-892
  - src/extension/production-theta-producer.ts:984-991
  - src/extension/query-text-render.ts:163
  - src/extension/subagent-spawn-regime.ts:1173-1176
sites: 4
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# lowerQueryResponseSchema's doc comment claims "both call sites" pass the merged set, but four production call sites do

## Observation
`lowerQueryResponseSchema`'s doc comment states "In production both call
sites pass the MERGED set" (referring to `mergedSchemaDeclsOf` /
`mergedEnumDeclsOf`). At current HEAD there are four production call sites,
not two, and all four pass the three-argument merged-set form the comment
describes.

## Evidence

`src/parser/query-schema-lowering.ts:151-163`:
```ts
/**
 * Lower a typed query's declared response-schema annotation to its
 * AJV-validatable JSON Schema (QRY-22 / SUBS-1), or `undefined` when the
 * annotation carries no lowerable shape. `annotation` is the verbatim
 * `@<Schema>` text; `schemas` and `enums` are the declarations a named
 * reference resolves against. In production both call sites pass the MERGED
 * set — this file's own `schema` / `enum` decls plus the ones its `import`s
 * pull in (`mergedSchemaDeclsOf` / `mergedEnumDeclsOf`,
 * production-theta-producer.ts, bug 0465) — so an imported name lowers to its
 * declared shape here. `enums` defaults to `[]` so the two shipped
 * seam-contract pins that call this with two arguments keep compiling (bug
 * 0028 §Fix).
 */
```

Every production (non-test) call site, found by `grep -rn
"lowerQueryResponseSchema(" src/ extensions/ tools/` excluding
`query-schema-lowering.ts` itself — 4 hits, all passing both a schema-decl
argument and an enum-decl argument:

`src/extension/invoke-machinery.ts:888-892`:
```ts
    const lowered = lowerQueryResponseSchema(
      returnSchema,
      mergedSchemaDeclsOf(mergedSite),
      mergedEnumDeclsOf(mergedSite),
    );
```

`src/extension/production-theta-producer.ts:984-991`:
```ts
    const lowered =
      expr.schema !== null
        ? lowerQueryResponseSchema(
            expr.schema,
            mergedSchemaDeclsOf(deps.theta),
            mergedEnumDeclsOf(deps.theta),
          )
        : undefined;
```

`src/extension/query-text-render.ts:163`:
```ts
      const lowered = lowerQueryResponseSchema(q.schema, schemaDecls, enumDecls);
```

`src/extension/subagent-spawn-regime.ts:1173-1176`:
```ts
    const schemaDecls = mergedSchemaDeclsOf(declSite);
    const enumDecls = mergedEnumDeclsOf(declSite);
    const loweredParams = fn.params.map((param) =>
      param.type.length > 0 ? lowerQueryResponseSchema(param.type, schemaDecls, enumDecls) : undefined,
    );
```

## Why this is a problem
The doc comment's "both call sites" count is a factual claim about the
codebase's current shape, made to justify why `enums` defaulting to `[]`
matters only to "the two shipped seam-contract pins" (test call sites) and
not to production. The count is wrong: production has grown to four call
sites since the comment was written (`query-text-render.ts` and
`subagent-spawn-regime.ts` both call it with the merged set alongside the
original `invoke-machinery.ts` / `production-theta-producer.ts` pair), so a
reader trusting the comment underestimates how many production call sites
depend on the merged-set behaviour this paragraph explains.

## Suggested direction (non-binding, optional)
Update the count (or drop the specific number and describe the merged-set
contract without enumerating call sites) so the comment does not understate
production's dependence on it.

## False-positive check
Ran `grep -rn "lowerQueryResponseSchema(" --include="*.ts" src/ extensions/
tools/` excluding `query-schema-lowering.ts`: exactly 4 hits, all in
production (extension) files, all passing 3 arguments (schema decls + enum
decls). Confirmed each call site's surrounding code to verify the argument
shape matches "the MERGED set" described in the comment. Checked git log for
`query-text-render.ts` and `subagent-spawn-regime.ts` — both have commits
after the file's referenced bug (0465), consistent with the call sites being
added after the comment was last true.

## Triage
verdict: confirmed — excerpt reproduces verbatim at query-schema-lowering.ts:151-163 ("both call sites" at :156); `grep -rn "lowerQueryResponseSchema(" src/ extensions/ tools/` minus the definition yields exactly 4 production sites (invoke-machinery.ts:888, production-theta-producer.ts:986, query-text-render.ts:163, subagent-spawn-regime.ts:1175), each passing mergedSchemaDeclsOf/mergedEnumDeclsOf; `git log -S` shows the sentence landed in d03f7398 (bug-0465) when the producer held exactly 2 sites (`git grep -c` at that commit = 2) and was never updated as the params-lowering and bug-0488 collectLaunchRespondNames sites were added — same stale collaborator-count class as resolved PTQ-1413, which fixed the sibling `enumDeclsOf` docstring (query-text-render.ts:70 now reads "Every … call site") but did not touch this comment, so it is not a duplicate; D2 header-prose precedents PTQ-0296/0297/0309/1108/1413 (triage: claude-fable-5-1)
