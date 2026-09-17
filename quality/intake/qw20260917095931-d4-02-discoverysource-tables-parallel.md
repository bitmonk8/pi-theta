---
id: pending
title: DiscoverySource is mapped in four parallel tables across discovery modules
lens: D4
status: intake
verdict: pending
locations:
  - src/discovery/discovery-model.ts:139-145
  - src/discovery/discovery-model.ts:179-184
  - src/discovery/discovery-collision-resolve.ts:75-93
  - src/discovery/discovery-path-classify.ts:426-438
sites: 4
fix_scope: module
d4_class: parallel
wave: qw20260917095931
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-17
---

# DiscoverySource is mapped in four parallel tables across discovery modules

## Observation
The closed `DiscoverySource` union (`"cli" | "settings" | "project" | "package" | "global"`) is mapped in four independent lookup tables and switches spread across three sibling files in `src/discovery/`: `PRIORITY` (numeric rank), `MODES_BY_SOURCE` (failure-mode table), `sourceLabelOf` (prose label), and `descriptorKindOf` (normative descriptor-kind spelling).

## Evidence
`src/discovery/discovery-model.ts:139-145` — priority table:

```typescript
export const PRIORITY: Record<DiscoverySource, number> = {
  cli: 1,
  settings: 2,
  project: 3,
  package: 4,
  global: 5,
} as const;
```

`src/discovery/discovery-model.ts:179-184` — failure-mode table:

```typescript
export const MODES_BY_SOURCE: Record<Exclude<DiscoverySource, "package">, FailureModes> = {
  cli: CLI_MODES,
  settings: SETTINGS_MODES,
  project: CONVENTIONAL_MODES,
  global: CONVENTIONAL_MODES,
} as const;
```

`src/discovery/discovery-collision-resolve.ts:75-93` — prose label switch:

```typescript
export function sourceLabelOf(source: DiscoverySource): string {
  switch (source) {
    case "cli":
      return "--theta flag";
    case "settings":
      return "settings thetaPaths";
    case "project":
      return "project .pi/theta/";
    case "package":
      return "package theta/ directory";
    case "global":
      return "global thetas directory";
  }
}
```

`src/discovery/discovery-path-classify.ts:426-438` — descriptor-kind switch:

```typescript
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

Verdict: parallel (four switches/tables over the same discriminant set, not a token-level clone).

## Why this is a problem
Load-bearing parallel truth. A new discovery source, a renamed source, or a change in which sources participate in failure-mode reporting would have to be applied in all four places. Today `PRIORITY`, `sourceLabelOf`, and `descriptorKindOf` each cover all five sources; `MODES_BY_SOURCE` intentionally excludes `"package"` because package candidates bypass the failure-mode lookup. If these mappings drift — for example a source added to `PRIORITY` but not to `descriptorKindOf` — diagnostics and collision adjudication would disagree on that source's identity or rank.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis): a single per-source metadata table in `discovery-model.ts` that binds each `DiscoverySource` to its priority, modes, label, and descriptor kind; the other modules would derive their lookups from that one table.

## False-positive check
The `DiscoverySource` type gives the closed set, but TypeScript exhaustiveness checking does not pin the *values* of these mappings. The spec defines source priority in `discovery/discovery-sources.md` and descriptor-kind spelling in `diagnostics/placeholder-rendering-b.md` §5, yet no single module owns all four parallel tables. Verified all four sites are live production code and are imported by the discovery walk. No tests/ are involved.

## Triage
verdict: false-positive — coverage counts (5/4/5/5 over the 5-member union) verified, but the stated breakage cannot occur: under tsconfig `"strict": true`, `Record<DiscoverySource,…>` rejects an added/missing key and the `string`-returning switches fail TS2366 when non-exhaustive, so membership drift across the four is compile-blocked; what remains are four distinct spec-normative vectors each cited to its own clause (priority rank; DISC-2 severity table; DISC-2 rule-2 prose category labels; discovery-sources.md#descriptor-kinds closed set, which the spec explicitly says is *distinct* from the prose labels) — the D4 spec-table carve-out, and the same double-switch was already dispositioned incidental by D4 shards qw20260914060226 and qw20260914130212 (triage: claude-fable-5-1)
