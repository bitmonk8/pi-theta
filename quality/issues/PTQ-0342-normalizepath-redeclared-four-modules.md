---
id: PTQ-0342
title: normalizePath's Lexical-anchored backslash-to-forward-slash rule is independently redeclared in three modules outside its exported home
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-path-classify.ts:26-28
  - src/extension/import-static-checks.ts:116-119
  - src/extension/invoke-static-checks.ts:147-150
  - src/runtime/invocation.ts:121-124
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260914130212
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-14
---

# normalizePath's Lexical-anchored backslash-to-forward-slash rule is independently redeclared in three modules outside its exported home

## Observation
`discovery-path-classify.ts` exports `normalizePath` — the canonical copy that PTQ-0286's ratified fix (2026-09-12) already made `package-discovery.ts` and `settings.ts` import instead of keeping their own, specifically because the normalised form is, per that finding, "per Lexical §'Path literals', a single rule all files must honour identically." Outside `src/discovery/`, the identical one-line body (`return path.replace(/\\/g, "/");`) is separately redeclared under the same function name `normalizePath`, as a local (non-exported) helper, in `src/extension/import-static-checks.ts`, `src/extension/invoke-static-checks.ts`, and `src/runtime/invocation.ts`. Two of the four copies cite the identical spec ground in their own doc comments: `discovery-path-classify.ts`'s module header names "the normalised comparison form per Lexical §'Path literals'"; `runtime/invocation.ts`'s doc comment on its own copy says, verbatim, "(per the Lexical 'Path literals' rule)."

## Evidence
Not in the clone map (the map reports "no clone groups" for this shard's `discovery-path-classify.ts` and `import-static-checks.ts`; a direct `clone-scan.mjs map --files` re-run naming all four hosts still returns no group for this function — a two-statement function body sits below the tool's token-window floor; found by reading).

**Location 1 — `src/discovery/discovery-path-classify.ts:26-28`:**
```ts
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

**Location 2 — `src/extension/import-static-checks.ts:116-119`:**
```ts
/** Forward-slash-normalise a host path so the posix-based resolver joins cleanly. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

**Location 3 — `src/extension/invoke-static-checks.ts:147-150`:**
```ts
/** Forward-slash-normalise a host path for byte-stable node identity. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

**Location 4 — `src/runtime/invocation.ts:121-124`:**
```ts
/** Forward-slash-normalise a host path (per the Lexical "Path literals" rule). */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

Diff verdict: **identical** — same name, same body, byte-for-byte, in all four; only the doc comment above each declaration differs (each states what the function is FOR, not why it is a separate copy). Liveness (grep count of `normalizePath(` call sites, declaration line excluded): `discovery-path-classify.ts` 8 (lines 37, 64, 77, 115, 131, 134, 202, 217); `import-static-checks.ts` 4 (lines 148, 640, 725, 726); `invoke-static-checks.ts` 2 (lines 403, 447); `runtime/invocation.ts` 1 (line 139, inside `canonicalizePath`, itself described as "the single canonical `realpath`-then-forward-slash path form").

## Why this is a problem
The Lexical spec states one normalisation rule ("Path literals": paths compare in normalised forward-slash form); the codebase implements it four times instead of once. PTQ-0286 (fixed) already named and remedied exactly this risk for the discovery trio: "a future edit to the POSIX convention… applied to one copy and missed in the other silently produces different classification/matching results for the same input on the two walks." That same risk now sits one layer deeper, outside `src/discovery/`, in code whose own copies are load-bearing for path IDENTITY rather than mere display: `import-static-checks.ts`'s copy feeds `fromFile` (line 640 — the base every relative `.thetalib` `import` spec resolves against) and the `.thetalib` cycle-graph's precache/resolve calls (lines 725-726); `invoke-static-checks.ts`'s copy feeds a value its own comment calls "byte-stable node identity" (line 403) and a cache key (line 447); `runtime/invocation.ts`'s copy feeds `canonicalizePath`, which its own following doc comment names "the single canonical `realpath`-then-forward-slash path form" — a function other modules (including this shard's `import-static-checks.ts`, via `CachingThetaLibProbe.precache`) import and rely on for identity comparisons. A divergence introduced into any one of these four copies (e.g. to also collapse a doubled leading slash, or to handle a UNC `\\server\share` prefix) would not reach the other three, and because three of the four copies feed identity/cache-key computations rather than pure display, a divergence there would not just look different — it could misclassify two spellings of the same file as different graph nodes or cache keys, or the reverse, exactly the class of defect PTQ-0286 was filed and fixed to prevent one layer up.

## Suggested direction (non-binding, optional)
`discovery-path-classify.ts` already exports this function and is already the destination `package-discovery.ts`/`settings.ts` import it from post-PTQ-0286; extending that import to `import-static-checks.ts` and `invoke-static-checks.ts` (both under `src/extension/`) and to `runtime/invocation.ts` is one direction. A human should weigh which of the two already-exported candidates — `discovery-path-classify.ts` or `runtime/invocation.ts` — is the better common ancestor: `runtime/` sitting below `discovery/` and `extension/` in the existing dependency direction (several call sites in this shard already depend on `runtime/invocation.ts`'s `canonicalizePath`) may make it the more natural shared home instead. Named as a hypothesis only.

## False-positive check
Re-read all four cited spans immediately before filing (quoted verbatim above). Ran `grep -rn "function normalizePath" src/`: exactly these four hits, no fifth. Ran `grep -rn "function normalize" src/`: the only other match, `package-discovery.ts`'s `normalizePosix`, is a distinct, more complex function (collapses `.`/`..` segments) that itself CALLS the imported — not locally redeclared — `normalizePath` from `discovery-path-classify.ts` (confirmed via `package-discovery.ts:34`'s import line and its own header comment naming PTQ-0286), so it is not a fifth copy of this clone and confirms PTQ-0286's fix is fully in effect for `package-discovery.ts`/`settings.ts`. Confirmed liveness at all four sites by grep (counts above); none is a dead copy (D2's territory). Checked the do-not-refile list: PTQ-0286 (fixed) is scoped explicitly to "the three discovery modules" (`discovery-walk.ts`, `package-discovery.ts`, `settings.ts`), and its own Evidence section cites only those three files' pre-fix copies; its fix routed two of the three through the newly-created `discovery-path-classify.ts` (this shard's own file, now the fourth location's exported original). This filing's four locations are none of PTQ-0286's three original files — it is a distinct, currently-unfixed instance of the same lesson in a different part of the tree, not a re-file. Checked for a stated non-sharing rationale (the deliberate-mirror carve-out): none of the four doc comments states a reason for keeping an independent copy or names an import-cycle constraint. Not a spec-repeated vector table: the Lexical "Path literals" clause states one rule once; the carve-out is for a spec that itself repeats a vector/enumeration, not for code that independently reimplements a single rule several times.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all four excerpts verified verbatim at their cited lines (byte-identical bodies, exported only at discovery-path-classify.ts:26); re-ran `clone-scan.mjs map --files` naming all four hosts and it reproduces "(no clone groups)" exactly as claimed (function is well under the 60-token MIN_TOKENS floor); liveness counts reproduce exactly at the cited lines (8/4/2/1); downstream identity-bearing uses (fromFile:640, precache/resolve:725-726, buildInvokeGraph node identity via resolveCalleeAbsolute:403, cache key:447, canonicalizePath reuse via CachingThetaLibProbe.precache:477) all confirmed by reading; PTQ-0286's quoted precedent is verbatim-accurate and its scope (discovery-walk.ts/package-discovery.ts/settings.ts) is correctly distinguished as non-overlapping — not a re-file; no non-sharing rationale or import-cycle constraint found in any of the four files (independently confirmed no cycle risk: extension/ already imports canonicalizePath from runtime/invocation.ts); not a spec-normative vector table; d4_class clone is correct (bodies are identical, not diverged), so per the D4 rubric this is a mechanical dedupe, not a behavior-choice needing a human ruling (triage: claude-opus-5)
