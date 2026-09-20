---
id: pending
title: openLaneSet's "deepest === undefined" ternary arm is unreachable given the MAX_LANE_SET_DEPTH guard
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/execution-status/bus.ts:258-266
sites: 1
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# openLaneSet's "deepest === undefined" ternary arm is unreachable given the MAX_LANE_SET_DEPTH guard

## Observation
`openLaneSet` guards the beyond-tracked-depth branch with
`if (node.laneSets.length >= MAX_LANE_SET_DEPTH)`, then reads
`node.laneSets[node.laneSets.length - 1]` and branches on whether that read is
`undefined`. `MAX_LANE_SET_DEPTH` is a fixed module constant (`4`), so the
guard's truth already guarantees `node.laneSets.length >= 4 > 0`, which makes
the trailing array read always land on a real element pushed earlier via
`node.laneSets.push(set)` (no holes are ever introduced into this array).

## Evidence
`src/extension/execution-status/bus.ts:258-266`:
```ts
      if (node.laneSets.length >= MAX_LANE_SET_DEPTH) {
        // EXST-7 / F6: beyond the tracked nesting depth the set counter-collapses
        // into the deepest tracked set — its claims/settles still move counters,
        // but it never becomes its own visible set.
        const deepest = node.laneSets[node.laneSets.length - 1];
        return deepest === undefined
          ? NOOP_LANE_SET_HANDLE
          : this.#laneHandle(node, deepest, false);
      }
```

`src/extension/execution-status/types.ts:27`:
```ts
export const MAX_LANE_SET_DEPTH = 4;
```

`node.laneSets` is declared `readonly laneSets: LaneSetState[]` (bus.ts:64) and
is only ever mutated by `node.laneSets.push(set)` (bus.ts:270, inside the same
method) and `node.laneSets.splice(at, 1)` (the `close` handle, bus.ts:~330,
which only removes a matched element) — no code path ever assigns a hole into
this array.

## Why this is a problem
Given `MAX_LANE_SET_DEPTH = 4` and the enclosing guard `length >= 4`, the array
index `length - 1` is provably within bounds and provably not a hole, so
`deepest === undefined` can never evaluate true at runtime. The `NOOP_LANE_SET_HANDLE`
arm of the ternary is therefore dead code reachable only if a future edit
either changes `MAX_LANE_SET_DEPTH` to `0` or introduces a way to leave a hole
in `laneSets` — neither of which the current code does.

## Suggested direction (non-binding, optional)
The ternary could be replaced with a direct, unconditional call to
`this.#laneHandle(node, deepest, false)`, relying on the enclosing guard to
establish non-emptiness (with a narrowing assertion or equivalent), since the
`undefined` arm's `NOOP_LANE_SET_HANDLE` return is unreachable under the
current constant.

## False-positive check
- Confirmed `MAX_LANE_SET_DEPTH` is a fixed literal (`4`) in
  `src/extension/execution-status/types.ts:27`, not settings-derived or
  overridable at runtime (`grep -n "MAX_LANE_SET_DEPTH" src -r` shows only the
  declaration and this one read site).
- Confirmed `node.laneSets` (typed `LaneSetState[]`) is only ever mutated by
  `push` (adds one element, no holes) and `splice(at, 1)` when `at >= 0` (removes
  an existing element, keeps the array dense) within this same file — no other
  file imports or mutates `NodeState.laneSets`.
- Because the guard requires `length >= MAX_LANE_SET_DEPTH (4)`, `length` is
  always `> 0` inside the branch, so `laneSets[length - 1]` is always a defined
  element of a dense array.

## Triage
