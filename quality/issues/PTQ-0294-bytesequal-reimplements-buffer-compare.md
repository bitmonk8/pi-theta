---
id: PTQ-0294
title: pass-parse-cache.ts's bytesEqual hand-rolls a byte-by-byte Uint8Array loop that Buffer.compare already performs
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/pass-parse-cache.ts:60-73
  - src/extension/pass-parse-cache.ts:113
  - src/extension/pass-verdict-memo.ts:203
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: reimplemented      # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/pass-parse-cache.ts#bytesEqual # D8 only: the exemption key, <path> or <path>#<function>
wave: qw20260913174959
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-13
---

# pass-parse-cache.ts's bytesEqual hand-rolls a byte-by-byte Uint8Array loop that Buffer.compare already performs

## Observation
`bytesEqual` (pass-parse-cache.ts:60-73) hand-rolls a `Uint8Array` byte-identity test: an identity short-circuit, a length check, then an indexed `for` loop comparing each byte. Node's global `Buffer` (available in every Node process with no import) exposes a static `Buffer.compare(a, b)` that performs the identical byte-by-byte comparison over two `Uint8Array` values, returning `0` exactly when the two are byte-identical. `bytesEqual` is exported and is the one shared byte-identity guard two pass-scoped caches use to decide whether a cache/memo entry may be served for the CURRENT file bytes: `pass-parse-cache.ts`'s own `parse()` (line 113) and `pass-verdict-memo.ts`'s `read()` (line 203, which imports this same function rather than declaring its own copy).

## Evidence
Facility — `Buffer.compare(buf1: Uint8Array, buf2: Uint8Array): number`, a Node global present without any import, verified behaviourally equivalent on the three cases `bytesEqual` distinguishes (identical, same-length-differing, differing-length):
```
$ node -e 'const a=new Uint8Array([1,2,3]),b=new Uint8Array([1,2,3]),c=new Uint8Array([1,2,4]),d=new Uint8Array([1,2]);
console.log(Buffer.compare(a,b), Buffer.compare(a,c), Buffer.compare(a,d));'
0 -1 1
```
(`0` for byte-identical; non-zero for differing content or differing length.)

Hand-rolled reimplementation — `src/extension/pass-parse-cache.ts:60-73`:
```ts
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
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

Call sites (the sites' real need is a plain byte-identity boolean, nothing more) — `src/extension/pass-parse-cache.ts:113`:
```ts
      if (cached !== undefined && bytesEqual(cached.bytes, input.bytes)) {
```
`src/extension/pass-verdict-memo.ts:203` (imports `bytesEqual` from `pass-parse-cache.ts`):
```ts
      if (entry === undefined || !bytesEqual(entry.bytes, bytes)) {
```
Both sites only ever consume the boolean result; `Buffer.compare(a, b) === 0` supplies the identical boolean for the identical two inputs.

## Why this is a problem
Neither call site needs anything beyond a byte-identity boolean over two `Uint8Array` values — the exact job `Buffer.compare` already does as a built-in, already-available facility (no import needed; `Buffer` is a Node global). The hand-rolled loop reimplements that comparison in-repo, one function below the two pass-scoped caches (`createPassParseCache`, `createPassVerdictMemo`) that both need a "never serve a stale entry for changed bytes" guard, with no comment recording a reason the built-in was not used.

## Suggested direction (non-binding, optional)
`bytesEqual(a, b)` could read `return Buffer.compare(a, b) === 0;`; named as a hypothesis only.

## False-positive check
Re-read pass-parse-cache.ts:60-73 and pass-verdict-memo.ts:203, and re-ran the `Buffer.compare` behaviour check immediately before filing (output quoted above). Confirmed both call sites consume only the returned boolean (no ordering/comparison use that would need `Buffer.compare`'s signed return distinct from a plain equality). Checked `quality/resolved/PTQ-0289-bytesequal-duplicated-pass-caches.md`: that finding (lens D4, status fixed) was that `bytesEqual` was independently re-declared verbatim in both `pass-parse-cache.ts` and `pass-verdict-memo.ts`; the current code confirms `pass-verdict-memo.ts` now imports the one definition from `pass-parse-cache.ts` (`import { bytesEqual, normaliseCacheKey as normaliseVerdictKey, type PassParseDeps } from "./pass-parse-cache";`) rather than re-declaring it, so that cross-file duplication is already resolved and this filing is a distinct claim against the single remaining implementation (a stdlib-facility substitution, not a cross-file copy). `bytesEqual` is exported and live (both cited call sites use it; the map records 1/0 src/test importers by name, consistent with its one direct caller inside this file plus `pass-verdict-memo.ts`'s import), so the D2 dead-code precedents do not apply. No D8 exemption is on record for this host (`store.mjs exemptions --lens D8` returned no output for this wave).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — excerpts verified verbatim (bytesEqual at pass-parse-cache.ts:60-73, call sites at :113 and pass-verdict-memo.ts:203; size-scan map confirms 14 LOC and 1/0 src/test importers), Buffer.compare(a,b)===0 independently reproduced (0/-1/1) as behaviourally equivalent including subarray/byteOffset views, both call sites consume only the boolean, and no D8 exemption is on record for this host — accounting is accurate but per the D8 rule the simpler shape is a design decision for a human ruling, never confirmed (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-13): bytesEqual in src/extension/pass-parse-cache.ts keeps its name, export and (a: Uint8Array, b: Uint8Array): boolean signature; its body becomes return Buffer.compare(a, b) === 0; (Node global, no import) and its doc comment states that the comparison is Node's native byte compare over the full content of both views (length difference is non-zero). Both call sites (pass-parse-cache.ts parse() and pass-verdict-memo.ts read()) are unchanged. Behaviour identical; no test change required beyond what the gate demands.
