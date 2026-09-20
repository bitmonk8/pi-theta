---
id: pending
title: DiscoverySource kind labels and descriptor kinds switch separately
lens: D4
status: intake
verdict: pending
locations:
  - src/discovery/discovery-collision-resolve.ts:86-103
  - src/discovery/discovery-path-classify.ts:426-439
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# DiscoverySource kind labels and descriptor kinds switch separately

## Observation
`DiscoverySource` is a closed union of five sources (`"cli"`, `"settings"`, `"project"`, `"package"`, `"global"`). Two independent switch statements over that same union each map every case to a string: `sourceLabelOf` produces human-readable prose category labels for diagnostics, and `descriptorKindOf` produces the normative `<kind>` token used in `<kind>:"<value>"` descriptors. The two switches live in different files and are maintained separately.

## Evidence
`src/discovery/discovery-collision-resolve.ts:86-103`:
```ts
export function sourceLabelOf(source: DiscoverySource): string {
  switch (source) {
    case "cli":
      return "--theta flag";
    case "settings":
      return "settings thetaPaths";
    case "project":
      // The host config-dir name is unavailable at this pure-label seam, so the
      // Pi spelling stands in for the source CATEGORY here. This label is what
      // the case-collision message above (`case-insensitive filename collision
      // in ${sourceLabel}`) names — the path-bearing project diagnostics render
      // the normative `<kind>:"<value>"` descriptor form instead, so this
      // prose spelling never has to stand in for a real directory there.
      return "project .pi/theta/";
    case "package":
      return "package theta/ directory";
    case "global":
      return "global thetas directory";
  }
}
```

`src/discovery/discovery-path-classify.ts:426-439`:
```ts
function descriptorKindOf(source: DiscoverySource): string {
  switch (source) {
    case "cli":
      return "cli-flag";
    case "settings":
      return "settings";
    case "project":
      return "project";
    case "package":
      return "package";
    case "global":
      return "global";
  }
}
```

Diff verdict: parallel truth, not copy-paste. Both switches enumerate the identical five-case discriminant set, but the returned strings differ by design (prose label vs normative kind token).

## Why this is a problem
The two mappings are load-bearing parallel truth about the same closed `DiscoverySource` union. If a sixth discovery source is added, both switches must gain a new case or the build will fail only at the call sites that exercise the new source: `sourceLabelOf` is called from `discoverThetas` for settings/package labels, and `descriptorKindOf` (via `renderSourceDescriptor`) is used to render the `<kind>` half of source descriptors in cross-source-shadow diagnostics. A source added to one switch but not the other would emit a descriptor whose `<kind>` token and human-readable label disagree, or would fall through and produce `undefined` at runtime.

## Suggested direction (non-binding, optional)
A single shared source of truth for the per-source metadata (prose label + normative kind token) in `src/discovery/discovery-model.ts` or a new small helper module would let both renderers derive their strings from one table.

## False-positive check
- Re-verified the clone map for this shard: no clone groups in either file.
- Searched `src/` for other exhaustive `switch` statements over `DiscoverySource`: only `sourceLabelOf` and `descriptorKindOf` exist (`grep` for `case "cli"`/`case "settings"`/... returned exactly these two sites).
- Searched `quality/intake/` for prior D4 filings about `sourceLabelOf`, `descriptorKindOf`, or `DiscoverySource`: none found.
- Both functions are live callers (`sourceLabelOf` is imported by `discovery-walk.ts`; `descriptorKindOf` is used by `renderSourceDescriptor`, which is exported from `discovery-path-classify.ts`).

## Triage
