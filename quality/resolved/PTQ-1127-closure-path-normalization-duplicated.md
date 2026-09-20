---
id: PTQ-1127
title: Callable closure path normalization duplicated in hash and source collection
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/production-composition.ts:4349-4357
  - src/extension/production-composition.ts:4390-4398
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Callable closure path normalization duplicated in hash and source collection

## Observation
`resolveCallableClosureHash` and `collectCallableClosureSources` in `src/extension/production-composition.ts` both resolve a callee path against an optional caller directory, choose between an absolute path and a relative resolution, and compute a forward-slash-normalized cache key from the resulting root path. The three-line sequence is identical in both functions, including the same variable names and the same `replace(/\\/g, "/")` normalization.

## Evidence

`src/extension/production-composition.ts:4349-4357` (`resolveCallableClosureHash`):
```typescript
): Promise<string | undefined> {
  const baseDir = callerPath !== undefined ? dirname(callerPath) : ctx.cwd;
  const rootAbs = isAbsolute(calleePath) ? calleePath : resolvePath(baseDir, calleePath);
  const cacheKey = rootAbs.replace(/\\/g, "/");
  const cachedHash = deps.closureHashCache?.get(cacheKey);
  if (cachedHash !== undefined) {
    return cachedHash;
  }
  const sources = await collectCallableClosureSources(fs, ctx, deps, callerPath, calleePath);
```

`src/extension/production-composition.ts:4390-4398` (`collectCallableClosureSources`):
```typescript
): Promise<readonly ClosureSource[]> {
  const baseDir = callerPath !== undefined ? dirname(callerPath) : ctx.cwd;
  const rootAbs = isAbsolute(calleePath) ? calleePath : resolvePath(baseDir, calleePath);
  const cacheKey = rootAbs.replace(/\\/g, "/");
  const cached = deps.closureSourcesCache?.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const sources: ClosureSource[] = [];
```

Diff verdict: identical (same variable names `baseDir`, `rootAbs`, `cacheKey`; same `replace(/\\/g, "/")` normalization). Clone-map group id: G036, 76 tokens.

## Why this is a problem
The hash cache (`closureHashCache`) and the sources cache (`closureSourcesCache`) are keyed by the same normalized root path. If the normalization logic drifts — for example, one copy stops replacing backslashes, changes the base-directory resolution, or alters the absolute-vs-relative test — the two caches would use different keys for the same physical file. That would break the RFC-0005 content-hash verification, because the parent would store a hash under one key and the child would look it up (or store its own sources) under another. The duplication is load-bearing: the two functions must agree on the cache key for the closure-consistency check to work.

## Suggested direction (non-binding, optional)
The natural shared home is a small helper in `src/extension/production-composition.ts` that resolves a callee path to its absolute, normalized root and returns both `rootAbs` and `cacheKey`; both `resolveCallableClosureHash` and `collectCallableClosureSources` would call it.

## False-positive check
- Re-verified both spans at the cited line numbers; both functions are live and reached from the closure-resolution path.
- Confirmed clone-map group G036 matches these exact line ranges.
- Searched `src/extension/production-composition.ts` for the normalization pattern `replace(/\\\\/g, "/")`: exactly these two occurrences.
- Not a spec-normative vector table; this is cache-key computation for closure hashing.
- No test files are involved; both copies are production sources under `src/`.

## Triage
verdict: confirmed — both excerpts reproduce verbatim at 4349-4357/4390-4398; clone-scan map lists G036 (76 tokens) at exactly those ranges; both functions live (resolveCallableClosureHash called at 2959/3014, collectCallableClosureSources at 1856/1888/4357); the shared-key requirement is mechanical, not taste — both doc comments (4335-4341, 4376-4383) state each cache is keyed by the same forward-slash-normalised root path and the hash path relies on the sources cache hitting on it; not a spec vector table; not a duplicate of resolved PTQ-0348 (that filing introduced the caches, this is the resulting key-derivation clone). Two accuracy notes that do not refute: the FP-check's "exactly these two occurrences" of `replace(/\\/g, "/")` is wrong (10 hits in the file), and the two-line baseDir/isAbsolute prefix also appears at 4191-4192 in parseCalleeTheta without the cacheKey line — the filed 3-line clone is exactly 2 sites, so the fixer may optionally fold the third prefix site into the same helper (triage: claude-fable-5-1)
