---
id: PTQ-1116
title: pass-parse-cache reimplements normalizePath despite canonical helper
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/normalize-path.ts:25
  - src/extension/pass-parse-cache.ts:55-57
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# pass-parse-cache reimplements normalizePath despite canonical helper

## Observation
`src/extension/pass-parse-cache.ts` exports `normaliseCacheKey`, a one-line function that replaces every backslash with a forward slash. `src/normalize-path.ts` already provides the identical operation as `normalizePath`, explicitly documented as the single shared implementation for all path-normalisation call sites (PTQ-0342). `pass-verdict-memo.ts` imports the reimplemented function from `pass-parse-cache.ts` as `normaliseVerdictKey`, so the duplicate is currently live in two production files.

## Evidence
`src/normalize-path.ts:25` — canonical helper:

```typescript
/**
 * Forward-slash-normalise a host path: replace every backslash with a
 * forward slash, per the Lexical "Path literals" rule (paths compare in
 * normalised forward-slash form; the `FileSystem` seam reports forward-slash
 * paths).
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

`src/extension/pass-parse-cache.ts:55-57` — reimplementation:

```typescript
/** Separator-normalise an absolute path so a Win32 and a POSIX spelling key together. */
export function normaliseCacheKey(path: string): string {
  return path.replace(/\\/g, "/");
}
```

Diff verdict: identical implementation; only the identifier and comment differ.

`src/extension/pass-verdict-memo.ts:94-95` consumes the duplicate:

```typescript
  bytesEqual,
  normaliseCacheKey as normaliseVerdictKey,
```

and uses it at `src/extension/pass-verdict-memo.ts:203` (`normaliseVerdictKey(absolutePath)`).

## Why this is a problem
The canonical helper's doc-comment states its purpose is to prevent silent divergence: a future correction for edge cases such as a doubled leading slash or a UNC `\\server\share` prefix must reach every call site. `pass-parse-cache.ts` and `pass-verdict-memo.ts` are outside that shared implementation, so a fix to `normalizePath` would leave the parse-cache and verdict-memo keys using the older, narrower rule. Because these keys decide cache hits and verdict reuse, diverging normalisation behaviour can cause stale-cache hits or spurious misses.

## Suggested direction (non-binding, optional)
Replace `normaliseCacheKey` in `src/extension/pass-parse-cache.ts` with an import of `normalizePath` from `src/normalize-path.ts`, then update `src/extension/pass-verdict-memo.ts` to import `normalizePath` directly (or re-export it from the parse-cache module under a cache-specific alias if the existing API must remain stable).

## False-positive check
- Re-verified both cited spans immediately before filing; both implementations are live production code.
- `normaliseCacheKey` is exported and consumed by `pass-verdict-memo.ts`, so the symbol is not dead.
- The duplicate is not a spec-normative vector table; it is a utility reimplementation.
- No generated-file marker or test-only usage was found.
- Git log shows `src/normalize-path.ts` was introduced/modified in commit `88821b0e quality: qw20260916144930 fix src/discovery`, after `pass-parse-cache.ts`'s most recent change (`4b3286b5`), consistent with the canonical helper being added without updating the parse-cache module.

## Triage
verdict: confirmed — both copies re-verified live and byte-identical in body (`path.replace(/\\/g, "/")`) at src/normalize-path.ts:24-26 and src/extension/pass-parse-cache.ts:55-57, consumed at pass-parse-cache.ts:105 and pass-verdict-memo.ts:95/202/210; clone-scan lists no group (one-liner below scanner granularity) so copies diffed directly; canonical header names the single-implementation intent; not tracked by PTQ-0342 (resolved, four other modules) or PTQ-1084 (tests/ D7); mechanical dedupe (triage: claude-fable-5-1)
