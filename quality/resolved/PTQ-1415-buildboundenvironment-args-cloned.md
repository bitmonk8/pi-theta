---
id: PTQ-1415
title: buildBoundEnvironment argument list duplicated in default recovery and subagent-fn decl lookup
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:1817-1823
  - src/extension/production-theta-producer.ts:3618-3624
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923023517
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# buildBoundEnvironment argument list duplicated in default recovery and subagent-fn decl lookup

## Observation
`src/extension/production-theta-producer.ts` builds a `LexicalEnvironment` from a theta's body, imports, presented callable names, and source path in at least two independent private methods. The two call sites pass the exact same five arguments in the same order to `buildBoundEnvironment`; the surrounding contexts differ (one recovers defaulted parameter values, the other resolves a `subagent fn` declaration), but the environment-construction expression is a byte-identical copy.

## Evidence

Location 1 — `#recoverDeclaredDefaults`, lines 1817-1823:

```typescript
    const env = buildBoundEnvironment(
      theta.body,
      undefined,
      theta.imports,
      presentedCallableNames(theta),
      theta.sourcePath,
    );
```

Location 2 — `#resolveSubagentFnDecl`, lines 3618-3624:

```typescript
    const lookupEnv = buildBoundEnvironment(
      theta.body,
      undefined,
      theta.imports,
      presentedCallableNames(theta),
      theta.sourcePath,
    );
```

Diff verdict: identical. The two `buildBoundEnvironment(...)` calls are byte-identical except for the local variable name (`env` vs `lookupEnv`). No clone-map group id applies (`clone-scan map` reports no groups for this file).

## Why this is a problem
This is load-bearing duplication. Both sites need the SAME evaluation environment shape for the same theta: the body AST, no explicit base object, the theta's imports, the presented callable names, and the optional source path. If one site is changed (for example, to pass a different callable-name set, to omit `theta.sourcePath`, or to pass a scoped base object) and the other is not, default-value evaluation and `subagent fn` name resolution will see divergent namespaces for the same theta. Because the expression is copied inline, there is no single place to update when the `buildBoundEnvironment` contract for a theta-bound environment changes.

## Suggested direction (non-binding, optional)
The natural shared home is a private helper on `ProductionThetaProducer` (or a small module-level function in this file) named something like `#thetaLookupEnv(theta)` that returns `buildBoundEnvironment(theta.body, undefined, theta.imports, presentedCallableNames(theta), theta.sourcePath)`. Both `#recoverDeclaredDefaults` and `#resolveSubagentFnDecl` would call it. This is a hypothesis; the fix stage owns the design.

## False-positive check
- Clone map re-verified: `src/extension/production-theta-producer.ts` has `(no clone groups)` in the provided clone-scan map.
- Both copies live: `#recoverDeclaredDefaults` is called from `#runBudgetedBinderCall`; `#resolveSubagentFnDecl` is called from `#driveSubagentFnEntry` and related subagent-fn machinery.
- Dead-code check: both callers are on active binder/subagent-fn paths.
- Spec-normative vector check: this is not a repeated spec enumeration; it is an imperative environment-construction call whose arguments encode how a theta's namespace is assembled.
- Not tests/: both locations are production code under `src/extension`.
- Not generated: hand-authored TypeScript.
- Already-filed check: no existing D4 issue cites these two `buildBoundEnvironment` call sites; the file-level D9 breakdown (PTQ-1285) does not address this specific expression duplication.

## Triage
verdict: confirmed — both excerpts reproduce byte-identically at production-theta-producer.ts:1816-1822 (`#recoverDeclaredDefaults`) and :3617-3623 (`#resolveSubagentFnDecl`), one-line drift only; hand-diff confirms identity (only `env`/`lookupEnv` differs) and clone-scan map re-run reports `(no clone groups)` for the file as stated; both copies are live (`#recoverDeclaredDefaults` called at :1780 and :5318, `#resolveSubagentFnDecl` at :3413 and :3647); not a spec vector table; no existing D4 issue tracks it (quality grep for `buildBoundEnvironment` hits only D9 inventories PTQ-1150/1285 and resolved PTQ-0171/0303, none of which files this dedupe) — note for the fixer: the filing undercounts, a third byte-identical copy of the same `undefined`-paramBindings form lives at src/extension/query-text-render.ts:132-138 (`collectLaunchRespondNames`), while :2433 is the distinct `bindInput.paramBindings` variant and is NOT a copy (triage: claude-fable-5-1)
