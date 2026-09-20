---
id: pending
title: Top-level fn collection helper duplicated across query-schema-resolve and type-layer-checks
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/query-schema-resolve.ts:138-150
  - src/parser/type-layer-checks.ts:657-677
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Top-level fn collection helper duplicated across query-schema-resolve and type-layer-checks

## Observation
`src/parser/query-schema-resolve.ts` defines `collectFns` and `src/parser/type-layer-checks.ts` defines `collectTopLevelFns`. Both functions build a `ReadonlyMap<string, FnDecl>` from a statement list by iterating over `statements` and collecting entries whose `kind === "fn"`. The code is byte-for-byte identical except for the helper name and the doc comment.

## Evidence
`src/parser/query-schema-resolve.ts:138-150` (clone-map group G054):
```ts
/** Collect the top-level `fn` declarations, keyed by name, for call-arg sinks. */
function collectFns(statements: readonly Stmt[]): ReadonlyMap<string, FnDecl> {
  const fns = new Map<string, FnDecl>();
  for (const stmt of statements) {
    if (stmt.kind === "fn") {
      fns.set(stmt.name, stmt);
    }
  }
  return fns;
}
```

`src/parser/type-layer-checks.ts:657-677` (clone-map group G054):
```ts
/**
 * Every top-level `fn` declaration — ordinary and `subagent fn` alike — keyed
 * by name: the callee-resolution table `TypeLayerWalk`'s `checkFnCallArgs`
 * consults, the parse-time counterpart of the runtime's `resolveUserFn`
 * (`../runtime/statement-executor.ts`) hoisted-`fn` arm. A `Map`, read with
 * `Map.get` and an explicit `!== undefined` test — a callee is
 * author-controlled source text, the 0031/0038 null-prototype hazard class,
 * never a plain object and never a truthiness test.
 */
function collectTopLevelFns(statements: readonly Stmt[]): ReadonlyMap<string, FnDecl> {
  const fns = new Map<string, FnDecl>();
  for (const stmt of statements) {
    if (stmt.kind === "fn") {
      fns.set(stmt.name, stmt);
    }
  }
  return fns;
}
```

Verdict: renamed-only (function name and comment differ; body is identical).

## Why this is a problem
Both functions build the same callee-resolution table used for checking call arguments. If the language gains a new top-level callable declaration kind, or if the lookup semantics change (for example, to handle duplicate declarations, `subagent fn` visibility, or null-prototype keys), both copies must change together. Today they are maintained independently, so a fix in one is likely to be missed in the other.

## Suggested direction (non-binding, optional)
The natural shared home is an existing AST-helper module under `src/parser/`; both files already import from shared parser internals.

## False-positive check
- Re-verified both spans at HEAD; both copies are live.
- `collectFns` is called once at `query-schema-resolve.ts:131` for typed-query schema resolution.
- `collectTopLevelFns` is called once at `type-layer-checks.ts:356` for type-layer call-arg checks.
- Not a spec vector table; not generated; not in `tests/`.

## Triage
