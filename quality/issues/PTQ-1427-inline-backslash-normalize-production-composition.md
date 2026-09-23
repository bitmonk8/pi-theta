---
id: PTQ-1427
title: production-composition.ts hand-writes the backslash-to-forward-slash rewrite at eight sites instead of the shared normalizePath / canonicalizePath helpers it already imports
lens: D8
status: open
verdict: confirmed
locations:
  - src/extension/production-composition.ts:592
  - src/extension/production-composition.ts:1039
  - src/extension/production-composition.ts:1041
  - src/extension/production-composition.ts:1457
  - src/extension/production-composition.ts:1943
  - src/extension/production-composition.ts:1971-1972
  - src/extension/production-composition.ts:4345
  - src/normalize-path.ts:19-27
  - src/runtime/invocation.ts:131-136
sites: 8
fix_scope: module
d8_class: reimplemented
d8_host: src/extension/production-composition.ts
wave: qw20260922211400
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-23
---

# production-composition.ts hand-writes the backslash-to-forward-slash rewrite at eight sites instead of the shared normalizePath / canonicalizePath helpers it already imports

## Observation
`src/normalize-path.ts` exports `normalizePath`, documented as the single
shared implementation of the backslash-to-forward-slash rewrite (minted by the
PTQ-0342 consolidation "so a correction … reaches every call site instead of
diverging silently"). `src/runtime/invocation.ts` exports `canonicalizePath`,
which is exactly `normalizePath(await fs.realpath(path))`.
`production-composition.ts` imports `canonicalizePath` (line 175) and uses it
at line 592 — yet in the same file (and even in the same expression at 592)
the identical rewrite is hand-written `\.replace(/\\/g, "/")` eight times,
including two sites (1943, 1971) that hand-rebuild `canonicalizePath` itself
(`(await fs.realpath(x)).replace(/\\/g, "/")`). The file never imports
`normalizePath` (search: `normalizePath|normalize-path` in the file — the only
hit is a comment at line 1019).

## Evidence
The facility, src/normalize-path.ts:19-27 (verbatim):
```ts
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
The realpath-composed facility, src/runtime/invocation.ts:131-136:
```ts
export async function canonicalizePath(
  fs: Pick<FileSystem, "realpath">,
  path: string,
): Promise<string> {
  return normalizePath(await fs.realpath(path));
}
```
The eight hand-rolled sites (search `replace(/\\\\/g` in the file, 8 code hits;
line 597 is a comment):
- 592 (`canonicalWatchRootIdentity` — same expression already calls the helper for the other arm):
```ts
  return (await fs.exists(root)) ? canonicalizePath(fs, root) : root.replace(/\\/g, "/");
```
- 1039 and 1041 (`runComposePass` watch-root assembly):
```ts
    ...activeRoots.map((r) => r.replace(/\\/g, "/")),
    ...walk.roots,
    ...packageWalk.roots.map((r) => r.replace(/\\/g, "/")),
```
- 1457 (`runComposePass` import-closure dirs):
```ts
      importClosureDirs.add(dirname(libPath).replace(/\\/g, "/"));
```
- 1943 (`refuseDivergedChildCallables` — hand-rebuilt `canonicalizePath`):
```ts
      const canonical = (await fs.realpath(theta.sourcePath)).replace(/\\/g, "/");
```
- 1971-1972 (`refuseDivergedChildCallables` — both arms):
```ts
      const calleeCanonical = (await fs.exists(calleeAbs))
        ? (await fs.realpath(calleeAbs)).replace(/\\/g, "/")
        : calleeAbs.replace(/\\/g, "/");
```
- 4345 (`collectCallableClosureSources` — the RFC-0005 digest-input path key):
```ts
    sources.push({ path: absPath.replace(/\\/g, "/"), content: decoder.decode(bytes) });
```

## Why this is a problem
The helper's own header states the single-implementation intent: a correction
(a doubled leading slash, a UNC `\\server\share` prefix) must reach every call
site. Eight inline copies in this one module sit outside that reach, and
several are agreement-critical: the 4345 copy keys the RFC-0005 closure digest
inputs, and PTQ-1127 (fixed) already documented that this module's closure
cache keys break if the normalisation drifts; the 1943/1971 copies feed the
byte-compare in `refuseDivergedChildCallables`. PTQ-1291 (confirmed, open)
established this exact class for the same rewrite inlined in
`production-theta-producer.ts`; this filing is the remaining-copies accounting
for `production-composition.ts`.

## Suggested direction (non-binding, optional)
Unproven hypothesis: import `normalizePath` and substitute it at the six
plain-rewrite sites, and substitute `canonicalizePath(fs, …)` at 1943/1971
(the module already imports it). No behaviour change is implied — the bodies
are byte-identical to the helper's.

## False-positive check
- Facility citation verified: `normalizePath` at src/normalize-path.ts:25 and
  `canonicalizePath` at src/runtime/invocation.ts:131-136 re-read before filing.
- Import check: `grep -n "normalizePath|normalize-path" production-composition.ts`
  → one comment hit (1019), no import; `canonicalizePath` imported at 175.
- Duplicate check: PTQ-1116 / PTQ-1127 are resolved and covered other
  hosts/claims; PTQ-1291 covers `production-theta-producer.ts` only; no intake
  candidate covers this file.
- Exemption check: no D8 exemption keyed to this host (the two D8 exemptions
  are discovery-walk and production-theta-producer functions, distinct claims).
- Spec check: the Lexical "Path literals" rule requires the rewrite; delegating
  to the helper that implements that rule drops no clause-required behaviour.
- D2 precedent check: no threaded seam or stated rationale exists at any of the
  eight sites for hand-rolling over the helper (site comments explain WHY the
  rewrite happens, not why the helper is avoided).

## Triage
verdict: questionable — accounting verified: `grep -n 'replace(/\\\\/g' src/extension/production-composition.ts` → 9 hits, 8 code sites at 592/1039/1041/1457/1943/1971/1972/4345 (597 is a doc comment) all byte-identical to `normalizePath` (src/normalize-path.ts:25-27) or, at 1943/1971, to `canonicalizePath` (src/runtime/invocation.ts:131-136, `Pick<FileSystem,"realpath">` — both sites' `fs` already call `realpath` directly, so the facility covers every cited need); `canonicalizePath` is imported at 175 and used in the other arm of 592, `normalizePath` never imported (sole hit is the 1019 comment); no D8 exemption keyed to this host (exemptions.json has only discovery-walk#enumerateDirectory and production-theta-producer#firstAdmittingArmProperties); not a duplicate — PTQ-1127 (fixed) covered the former 4349/4390 cache-key pair, PTQ-1291 and sibling qw20260922211400-d8-03 cover production-theta-producer.ts only; site comments state why the rewrite happens, none states a reason to avoid the helper; the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — re-verified: `grep -n 'replace(/\\\\/g' src/extension/production-composition.ts` → 9 hits, 8 code sites (592/1039/1041/1457/1943/1971/1972/4345; 597 is a comment), each byte-identical to `normalizePath` (src/normalize-path.ts:25-27) or at 1943/1971 to `canonicalizePath` (src/runtime/invocation.ts:131-136, whose `Pick<FileSystem,"realpath">` need both sites already meet by calling `fs.realpath`); `canonicalizePath` imported at 175 and used in 592's other arm, `normalizePath` absent (only the 1019 comment); quality/exemptions.json D8 rows key only discovery-walk#enumerateDirectory and production-theta-producer#firstAdmittingArmProperties; not a duplicate — PTQ-1291 (open) is scoped to production-theta-producer.ts and its triage note explicitly leaves the production-composition.ts copies "outside the shard", PTQ-1127 (fixed, D4) covered the former 4349/4390 cache-key pair only; spec check: the helper implements the Lexical "Path literals" rewrite so delegating drops nothing; the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified against current code: `grep -n 'replace(/\\\\/g' src/extension/production-composition.ts` → 9 hits, 8 code sites now at 593/1040/1042/1458/1934/1962/1963/4469 (line drift only; 598 is a doc comment), each byte-identical to `normalizePath` (src/normalize-path.ts:25-27) or, at 1934/1962, to `canonicalizePath` (src/runtime/invocation.ts:131-136) whose `Pick<FileSystem,"realpath">` need `refuseDivergedChildCallables` meets with its `fs: FileSystem` param (line 1910); `canonicalizePath` imported at 176 and used in 593's other arm, `normalizePath` never imported (sole hit is the 1020 comment); quality/exemptions.json D8 rows key only discovery-walk#enumerateDirectory and production-theta-producer#firstAdmittingArmProperties; not a duplicate — PTQ-1291 (open) locates only production-theta-producer.ts:2597-2598 and its body explicitly leaves the production-composition.ts copies "outside this shard's manifest", PTQ-1127 (fixed) was a D4 pair-dedupe of the former 4349/4390 resolve+normalize blocks, not a delegate-to-helper claim; helper implements the Lexical "Path literals" rewrite so delegating drops no spec behaviour; per D8 rules the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
