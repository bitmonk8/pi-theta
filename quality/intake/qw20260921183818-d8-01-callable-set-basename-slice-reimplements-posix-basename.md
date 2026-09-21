---
id: pending
title: entryBasename and thetaDefaultName in callable-set.ts hand-roll the final-segment strip node:path's posix.basename already provides and the sibling imports.ts already uses
lens: D8
status: intake
verdict: pending
locations:
  - src/parser/callable-set.ts:549-551
  - src/parser/callable-set.ts:563-567
sites: 2
fix_scope: module
d8_class: reimplemented
d8_host: src/parser/callable-set.ts
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# entryBasename and thetaDefaultName in callable-set.ts hand-roll the final-segment strip node:path's posix.basename already provides and the sibling imports.ts already uses

## Observation
`callable-set.ts` derives a `tools:` entry's path-literal basename twice with the hand-rolled idiom `thetaPath.slice(thetaPath.lastIndexOf("/") + 1)`: once in `entryBasename` (the bug-0379 byte-match against the resolved callee's on-disk basename) and once inside `thetaDefaultName` (the default-name derivation, which then strips `.theta` and remaps hyphens). The module imports nothing from `node:*`. The sibling in-scope module `imports.ts` performs the same final-segment extraction for the same kind of author-written forward-slash path literal via `posix.basename` from `node:path`.

## Evidence
src/parser/callable-set.ts:549-551 (re-read before filing):
```ts
function entryBasename(thetaPath: string): string {
  return thetaPath.slice(thetaPath.lastIndexOf("/") + 1);
}
```
src/parser/callable-set.ts:563-567 (re-read before filing):
```ts
export function thetaDefaultName(thetaPath: string): string {
  const basename = thetaPath.slice(thetaPath.lastIndexOf("/") + 1);
  const stem = basename.endsWith(".theta") ? basename.slice(0, -".theta".length) : basename;
  return stem.replace(/-/g, "_");
}
```
Facility, its own location: `node:path` `posix.basename` — already imported and used in the same directory, src/parser/imports.ts:15 (`import { posix } from "node:path";`) and imports.ts:226-228:
```ts
    const resolved = posix.join(posix.dirname(fromFile), spec);
    const parent = posix.dirname(resolved);
    const finalSegment = posix.basename(resolved);
```
Feature-for-feature against the two call sites' real needs: both callers receive a `tools:` entry path literal that has already passed the byte-exact `.theta` extension gate (`resolveEntry` runs `checkInvokeExtension` before either helper, callable-set.ts:483-491), so the input always ends in `.theta` — the trailing-slash edge where `posix.basename` and the slice differ (`"a/"` → `"a"` vs `""`) is unreachable. For every reachable input the two are byte-identical: `posix.basename` splits only on `/`, exactly like the slice (neither splits on `\`), and a slash-free input returns whole under both. `posix.basename(p, ".theta")` additionally subsumes `thetaDefaultName`'s `endsWith`/`slice` extension strip in the same call, leaving only the hyphen remap as genuinely local logic. Search for other copies of the idiom in scope: `grep -n 'lastIndexOf("/")' src/parser/*.ts` → 3 hits, the two cited plus src/parser/theta-document.ts:1874 (outside this shard's manifest; noted, not counted in `sites`).

## Why this is a problem
This is a hand-rolled reimplementation of a facility a package already depended on provides — `node:path` is imported one file over in the same subsystem for the identical operation on the identical input class (author-written forward-slash `.theta`/`.thetalib` path literals). The doc comments justify why `entryBasename` and `thetaDefaultName` are separate from each other (raw on-disk byte-match vs derived callable name) but state no reason for re-spelling the segment strip itself; each re-spelling is a fresh opportunity to diverge from the resolver-side notion of "basename" that imports.ts pins to `posix.basename` (the bug-0379 byte-match is meaningful only if both sides compute the same final segment).

## Suggested direction (non-binding, optional)
Unproven hypothesis: import `posix` from `node:path` and express both helpers through `posix.basename` (`entryBasename` = `posix.basename(thetaPath)`; `thetaDefaultName` = `posix.basename(thetaPath, ".theta").replace(/-/g, "_")`), keeping both named functions and their doc rationale intact. The fix stage owns whether the trailing-slash edge needs an explicit guard.

## False-positive check
- Reachability of the divergent edge: verified both helpers run only after `checkInvokeExtension` accepted the byte-exact `.theta` suffix (callable-set.ts:483-491), and `thetaDefaultName`'s other production caller (production-theta-producer.ts, per its own doc comment) feeds `tools:`-entry specs from the same grammar — no trailing-slash or extension-less input reaches either helper.
- D2 precedents: neither helper is dead (`thetaDefaultName` exported with 1 src importer per the structural map; `entryBasename` called at callable-set.ts:~530); no test-only reachability is proposed — both stay production-live under the hypothesis.
- Spec check: frontmatter-fields-a.md §default name pins the derivation ("basename without `.theta`, hyphens to underscores"), which `posix.basename(p, ".theta")` implements identically; no spec clause requires the hand spelling. No `challenges_spec` needed.
- Exemption check: D8's durable exemptions cover src/discovery/discovery-walk.ts#enumerateDirectory and src/extension/production-theta-producer.ts#firstAdmittingArmProperties — neither is this host.
- Duplicate check: this wave's qw20260921183818-d8-01-basefilename-reimplements-path-basename.md files the same class against a different host (src/extension/execution-status/footer-sink.ts, `win32.basename`, separator-agnostic display stem); distinct host, distinct facility variant, cross-referenced here. theta-document.ts:1874's copy is outside this shard's manifest and is noted for the fix stage, not claimed.

## Triage
verdict: questionable — accounting verified: both excerpts byte-exact at callable-set.ts:549-551/563-567; `grep lastIndexOf("/") src/parser/*.ts` reproduces 3 hits (two cited + theta-document.ts:1874); callable-set.ts imports nothing from `node:*` while imports.ts:15/226-228 uses `posix.basename` for the same forward-slash literal class; spec frontmatter-fields-a.md:85 pins only "basename without `.theta`, hyphens to underscores", which `posix.basename(p, ".theta")` satisfies; host not in exemptions.json (D8 rows cover discovery-walk#enumerateDirectory and production-theta-producer#firstAdmittingArmProperties only); no open issue tracks this host (sibling wave filings target production-discovered-theta.ts / footer-sink.ts / launchfile — distinct hosts). One overstatement noted for the fixer: the "no extension-less input reaches either helper" claim holds for `resolveEntry` (checkInvokeExtension gates first) but not for `thetaDefaultName`'s producer fallback caller (production-theta-producer.ts:5884 feeds any non-bare `parseToolsEntry` spec, harness-only arm), so the trailing-slash divergence (`posix.basename("a/")`→"a" vs slice→"") is reachable on a degenerate fixture entry — the filing already delegates that guard; the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
