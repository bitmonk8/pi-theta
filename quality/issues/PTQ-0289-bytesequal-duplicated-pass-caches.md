---
id: PTQ-0289
title: bytesEqual and its path-normalisation helper are duplicated verbatim between the parse cache and the verdict memo
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/pass-parse-cache.ts:52-78
  - src/extension/pass-verdict-memo.ts:96-128
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260913131304
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-13
---

# bytesEqual and its path-normalisation helper are duplicated verbatim between the parse cache and the verdict memo

## Observation
`pass-parse-cache.ts`'s `createPassParseCache` and `pass-verdict-memo.ts`'s `createPassVerdictMemo` are two pass-scoped caches, constructed one call apart at `production-composition.ts:781`/`:788`, that each guard a cache/memo read against serving stale data for changed bytes mid-pass. Each file defines its own private path-normalisation one-liner (`normaliseCacheKey`/`normaliseVerdictKey`) and its own private `bytesEqual` comparator. The clone map (G012, 117 tokens, renamed-only(3)) marks the two spans as the same code.

## Evidence
`src/extension/pass-parse-cache.ts:54-73`:
```ts
/** Separator-normalise an absolute path so a Win32 and a POSIX spelling key together. */
function normaliseCacheKey(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Byte-for-byte comparison — a cache HIT never serves a document for changed bytes. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
```

`src/extension/pass-verdict-memo.ts:98-117`:
```ts
/** Separator-normalise an absolute path so a Win32 and a POSIX spelling key together. */
function normaliseVerdictKey(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Byte-for-byte comparison — a memo HIT never serves a verdict for changed bytes. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
```

Diff verdict: `bytesEqual` is identical — same name, same signature, same body, in both files. `normaliseCacheKey`/`normaliseVerdictKey` are renamed-only — the function name differs, the one-line body (`return path.replace(/\\/g, "/");`) does not. Group id: G012.

## Why this is a problem
Both helpers exist for the same stated reason: `pass-verdict-memo.ts`'s own module doc-comment describes its key design as carrying "a byte-identity guard on read — mirroring `pass-parse-cache.ts`'s cache, and for the same reason: never serve a verdict for changed bytes mid-pass." `pass-verdict-memo.ts` already imports a type from `pass-parse-cache.ts` (`import type { PassParseDeps } from "./pass-parse-cache";`), so the two files already have a dependency edge. As written, a change to the byte-comparison logic (a correctness fix, or a swap to a different comparison strategy) applied to one copy leaves the other copy's `bytesEqual` unchanged, with nothing but a prose comment connecting the two implementations.

## Suggested direction (non-binding, optional)
Export `bytesEqual` (and the identical path-normalisation one-liner) from one of the two modules, or a small shared helper, for the other to import, instead of reproducing pure, dependency-free comparison logic twice; sizing and placement are for the fix stage.

## False-positive check
Group re-verified at the cited lines (quoted above, byte-for-byte). Searched `bytesEqual` across `src/`: exactly two hits, both cited here, each called from its own file's factory (`pass-parse-cache.ts:113`, `pass-verdict-memo.ts:220`) — both copies are live, neither is dead code. `createPassParseCache`/`createPassVerdictMemo` both confirmed called together from `production-composition.ts:781`/`:788`. Neither location is under `tests/`. Neither is generated. Not a spec-repeated reference-vector table — this is a pure utility with no spec clause governing it.

## Triage
<!-- appended by triage -->
verdict: confirmed — excerpts reproduce verbatim at both cited spans, `node tools/quality/clone-scan.mjs map --files <pass-parse-cache.ts manifest>` independently reproduces group G012 (117 tokens, renamed-only(3)) at exactly pass-parse-cache.ts:52-78 / pass-verdict-memo.ts:96-128, `grep -rn bytesEqual src/` finds only the two defs plus their own-file call sites (:113, :220) so both copies are live, and the two factories are confirmed called one apart at production-composition.ts:781/788 — an accurate clone with a purely mechanical dedupe fix, no prior PTQ or rejection covers it (triage: claude-opus-5)
