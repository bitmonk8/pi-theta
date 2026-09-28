---
id: PTQ-1539
title: The bug-0268 backslash-to-forward-slash spelling has two exported single-source homes — normalize-path.ts#normalizePath and diagnostic.ts#toPosixFileSpelling — each header claiming to be the shared implementation, plus two inline copies minted after both existed
lens: D1
status: open
verdict: confirmed
locations:
  - src/normalize-path.ts:14-26
  - src/diagnostics/diagnostic.ts:52-65
  - src/extension/callable-closure-path.ts:7-16
  - src/runtime/subagent-callable-hash.ts:70
  - src/discovery/discovery-source-enumerate.ts:288
  - src/extension/system-note-channel.ts:49-51
sites: 6
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260927231131
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
---

# The bug-0268 backslash-to-forward-slash spelling has two exported single-source homes — normalize-path.ts#normalizePath and diagnostic.ts#toPosixFileSpelling — each header claiming to be the shared implementation, plus two inline copies minted after both existed

## Observation
One obligation — spell a host path with forward slashes (bug 0268 / Lexical "Path literals") — is realised by two exported helpers that each declare themselves the shared home for it. `src/normalize-path.ts#normalizePath` (PTQ-0342, 2026-09-16) is imported by 8 src files and re-exported by discovery-path-classify.ts to the discovery module; its header says "One shared implementation means a correction … reaches every call site instead of diverging silently between them". `src/diagnostics/diagnostic.ts#toPosixFileSpelling` (bug 0268, 2026-08-24) is imported by 3 further src files; its header says it exists "so both presentational seams … can share it". The two are applied to the same strings: discovery mints `Diagnostic.file` through `normalizePath`, and `renderDiagnosticLine`/`normaliseDiagnosticSpelling` re-spell that same field through `toPosixFileSpelling`. Two further src sites (`callable-closure-path.ts:14`, created 2026-09-21 by the PTQ-1127 fix; `subagent-callable-hash.ts:70`) inline the rewrite and import neither helper. Neither header names the other helper.

## Evidence

**Way 1 — normalize-path.ts.** src/normalize-path.ts:14-16 and :24-26 (re-read before filing):
```ts
// `src/runtime/invocation.ts`). One shared implementation means a correction
// (a doubled leading slash, a UNC `\\server\share` prefix) reaches every call
// site instead of diverging silently between them (PTQ-0342).
...
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

**Way 2 — diagnostic.ts.** src/diagnostics/diagnostic.ts:53-65:
```ts
/**
 * Spell a diagnostic `file` / `related[].file` field with the pinned
 * separator convention (diagnostics/diagnostic-shape.md "Internal diagnostic
 * shape", the `file?:` line): POSIX forward slash on every host platform, so
 * one path literal matches every emitting site of a load pass regardless of
 * which walk minted the path (bug 0268). Pure and argument-only — no globals,
 * no host access — so both presentational seams (`renderDiagnosticLine` here
 * and `sendSystemNote` in system-note-channel.ts) can share it without a
 * shared mutable dependency.
 */
export function toPosixFileSpelling(file: string): string {
  return file.split("\\").join("/");
}
```

**The same string passes through both.** Mint side, src/discovery/discovery-source-enumerate.ts:288:
```ts
  diagnostics.push({ severity, code, file: normalizePath(path), message });
```
Render side, src/extension/system-note-channel.ts:49-51:
```ts
function normaliseDiagnosticSpelling(diagnostic: Diagnostic): Diagnostic {
  const file =
    diagnostic.file === undefined ? undefined : toPosixFileSpelling(diagnostic.file);
```
(and src/diagnostics/diagnostic.ts:78 `const file = rawFile === undefined ? undefined : toPosixFileSpelling(rawFile);`).

**Way 3 — inline copies importing neither helper.** src/extension/callable-closure-path.ts:12-15:
```ts
  const baseDir = callerPath !== undefined ? dirname(callerPath) : ctx.cwd;
  const rootAbs = isAbsolute(calleePath) ? calleePath : resolvePath(baseDir, calleePath);
  const cacheKey = rootAbs.replace(/\\/g, "/");
  return { rootAbs, cacheKey };
```
src/runtime/subagent-callable-hash.ts:66-70:
```ts
  // normalizes `\` to `/` (bug 0268 forward-slash convention) so the two
  // production capture routes' differing separator spellings of one file
  // (node `resolve` vs discovery joins) still land in the same order and
  // digest identically.
  const sortKey = (source: ClosureSource): string => source.path.replace(/\\/g, "/");
```

**Counts, both ways (all commands run in this session):**
- `grep -rn 'replace(/\\\\/g, "/")' src --include=*.ts` → 3 hits: normalize-path.ts:25 (the helper), callable-closure-path.ts:14, subagent-callable-hash.ts:70.
- `grep -rn 'split("\\\\")' src --include=*.ts` → 1 hit: diagnostic.ts:64 (the second helper).
- `grep -rn "toPosixFileSpelling" src --include=*.ts` → 13 hits across 4 files: diagnostic.ts (:63 decl, :78, :99), hot-reload.ts (:53, :421, :424), system-note-channel.ts (:28, :51, :54), runtime-panics.ts (:37, :200 comment, :217, :219).
- `grep -rln 'from "../normalize-path"\|from "./normalize-path"\|from "../../normalize-path"' src --include=*.ts` → 8 files: discovery-path-classify.ts (which re-exports it to discovery-walk/-collision-resolve/-source-enumerate/package-discovery), import-resolution-kit.ts, import-static-checks.ts, invoke-static-checks.ts, pass-parse-cache.ts, production-composition.ts, subagent-spawn-regime.ts, runtime/invocation.ts.
- `grep -n "normalize-path\|normalizePath" src/diagnostics/diagnostic.ts src/extension/system-note-channel.ts src/extension/hot-reload.ts src/runtime/runtime-panics.ts` → 0 hits: no `toPosixFileSpelling` consumer touches Way 1.
- `grep -rn "normalizePath\|toPosixFileSpelling\|normalize-path" src/extension/callable-closure-path.ts src/runtime/subagent-callable-hash.ts` → 0 hits: neither inline site touches either helper.

**Drift that already happened.** `git log --diff-filter=A --format='%h %ad %s' --date=short -- src/normalize-path.ts` → `88821b0e 2026-09-16 quality: qw20260916144930 fix src/discovery` (PTQ-0342 minted Way 1 as the shared home). `git log --diff-filter=A … -- src/extension/callable-closure-path.ts` → `0fb4497e 2026-09-21 quality: qw20260920202922 fix src/extension__p1` — the PTQ-1127 fix created a NEW module five days after Way 1's header claimed universal reach, and wrote the rewrite inline. PTQ-1427 (resolved) then had to chase 8 more inline copies in production-composition.ts; its triage recorded `normalizePath` "never imported" there. `git log -S'toPosixFileSpelling' … -- src/diagnostics/diagnostic.ts | tail -1` → `978670e0 2026-08-24 fix(bug-0268)`: Way 2 predates Way 1 and was not absorbed by it.

**Self-inconsistency statement.** No written rule names a home for the forward-slash rewrite (diagnostic-shape.md pins the spelling, not the helper); the anchor is self-inconsistency — two exported helpers each documented as the single shared implementation of one rule, and new code choosing neither — plus the cost cited above.

## Why this is a problem
Design consistency: a maintainer applying the correction Way 1's header itself anticipates ("a UNC `\\server\share` prefix") edits normalize-path.ts believing it "reaches every call site". It does not reach the render side of the very `Diagnostic.file` strings discovery mints (system-note-channel.ts:51, diagnostic.ts:78/:99 re-spell them through Way 2), nor the two closure-hash cache/sort keys — so the promise in the header is a concrete misread of the current code. The reverse edit (diagnostic.ts) reaches none of Way 1's 8 importers. Two "canonical" homes also explain the observed pattern of new inline copies: the fix that minted callable-closure-path.ts had two equally-documented helpers to pick from and picked neither, which is the cost of not having one.

## Suggested direction (non-binding, optional)
Unproven hypothesis: `toPosixFileSpelling` is `normalizePath` under a diagnostics-flavoured name (both bodies are total functions replacing every `\` with `/`), so one could delegate to or alias the other, and the two inline sites could import the survivor; whether diagnostic.ts may depend on a root-level helper is a layering question this lens does not adjudicate.

## False-positive check
- Clone-map check: no group covers this (the shard's map lists no groups for diagnostic.ts or callable-closure-path.ts; the two helper bodies are different token sequences — `split/join` vs `replace` — so a token scanner does not pair them). The filing is mechanism-shaped: two declared single-source homes, not a token copy.
- D9-affinity check: not a wrong-home claim. This lens does not argue which module the rewrite belongs in; it argues there are two homes each claiming to be the only one.
- D2-deadness check: both helpers live (13 and 8-file importer counts above); both inline sites live (`resolveCallableClosurePath` called at production-composition.ts:4691/:4730 — `grep -rn "resolveCallableClosurePath" src --include=*.ts` → 4 hits: the declaration, the production-composition.ts import (:159) and the two calls; `hashCallableClosure` is the RFC-0005 digest).
- Export-style exemption: not applicable (divergent-solutions).
- Prior-filing check: PTQ-0342 (resolved) consolidated three redeclared `normalizePath` copies into normalize-path.ts — its locations are discovery-path-classify/import-static-checks/invoke-static-checks/invocation only (`grep -n -i "toPosix\|diagnostic.ts" quality/resolved/PTQ-0342-*` → 0 hits); it did not consider Way 2. PTQ-1127 (resolved, D4) paired two in-file copies in production-composition.ts and its fix produced callable-closure-path.ts. PTQ-1427 (resolved, D8) covered production-composition.ts's inline copies only (its triage: PTQ-1291 "scoped to production-theta-producer.ts", PTQ-1127 "the former 4349/4390 cache-key pair only"). REVIEW_LOG 2026-09-13 D8 shard-01 routed "toPosixFileSpelling vs normalizePath identical duplication" to D4; `grep -rln "toPosixFileSpelling" quality/issues quality/resolved quality/intake` → 1 hit, PTQ-1272 (a system-note contract re-homing record that lists it as an import), so no filing exists for the pair.
- Behaviour check: the two helpers are byte-equivalent today (`"a\\b".split("\\").join("/") === "a\\b".replace(/\\/g, "/")`); no behaviour change is claimed — the cost is the maintenance misread and the third-copy pattern.
- Self-inconsistency: no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. I re-ran every stated search and each one reproduces: `replace(/\\/g, "/")` gives 3 hits (normalize-path.ts:25, callable-closure-path.ts:14, subagent-callable-hash.ts:70); `split("\\")` gives 1 (diagnostic.ts:64); toPosixFileSpelling gives 13 hits in 4 files; 8 files import normalize-path; the consumer and inline-site greps give 0. The only extra hit in the quality/ grep is this candidate itself. Both helper excerpts and headers match (normalize-path.ts:14-16/24-26, diagnostic.ts:53-65). The same `Diagnostic.file` goes through both helpers: discovery-source-enumerate.ts:288 mints it with normalizePath, then system-note-channel.ts:51 and diagnostic.ts:78/99 re-spell it with toPosixFileSpelling. The cost is real: 88821b0e (2026-09-16) added normalize-path.ts, and 0fb4497e (2026-09-21) later created callable-closure-path.ts with the rewrite written inline. The normalizePath header's claim that a fix reaches every call site does not hold for the render side or the two closure keys. clone-scan map lists no groups for normalize-path.ts, diagnostic.ts or callable-closure-path.ts, so this is not D4. All sites are live (resolveCallableClosurePath is called at production-composition.ts:4691/4730). Not a duplicate: quality/issues is empty; PTQ-0342/1116/1127/1291/1427 (all resolved) cover other copies; and PTQ-1291 explicitly left callable-closure-path.ts and subagent-callable-hash.ts outside its shard (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: one canonical backslash-to-forward-slash helper — src/normalize-path.ts normalizePath is the survivor (8 importing files vs 3). In src/diagnostics/diagnostic.ts, toPosixFileSpelling keeps its name, its export, and its bug-0268 doc, but its body delegates to normalizePath (import from ../normalize-path; diagnostic.ts already imports ../code-point-order, so the directory edge exists) — its three importer files (hot-reload.ts, system-note-channel.ts, runtime-panics.ts) and all in-file uses stay untouched. Replace the two inline rewrites with normalizePath calls via an import: the cacheKey line at src/extension/callable-closure-path.ts:14 and the sortKey line at src/runtime/subagent-callable-hash.ts:70 (both directories already import ../normalize-path elsewhere; keep both sites' existing comments). Behaviour identical everywhere: both helper bodies are total backslash-to-slash rewrites and byte-equivalent on every input. Fix the sole-ownership claims in both headers: normalize-path.ts names toPosixFileSpelling as the diagnostics-facing delegating alias (making its reaches-every-call-site promise true), and the toPosixFileSpelling doc says it delegates to the shared normalizePath while keeping the bug-0268 rationale. No test changes.
