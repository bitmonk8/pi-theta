---
id: PTQ-0423
title: Drain-state arm mapping is expressed twice in one file
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/drain-state.ts:46-51
  - src/extension/drain-state.ts:62-63
sites: 2
fix_scope: localized
d4_class: parallel
wave: qw20260917095931
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-17
---

# Drain-state arm mapping is expressed twice in one file

## Observation
`src/extension/drain-state.ts` contains two exported functions that classify the same `(drained, tag)` snapshot state space. `routeDrainStateArm` returns the closed two-arm enum `"dispatch" | "shutting-down"`, and `shouldShortCircuitShutdown` returns the boolean predicate used at `session_shutdown` handler entry. Both encode the same rule: the steady-state tuple `(false, undefined)` is the only one that keeps the extension running.

## Evidence
`src/extension/drain-state.ts:46-51` — arm mapping:

```typescript
export function routeDrainStateArm(snapshot: DrainStateSnapshot): DispatchArm {
  if (snapshot.tag === "shutting-down" || snapshot.drained) {
    return "shutting-down";
  }
  return "dispatch";
}
```

`src/extension/drain-state.ts:62-63` — short-circuit predicate:

```typescript
export function shouldShortCircuitShutdown(snapshot: DrainStateSnapshot): boolean {
  return snapshot.drained === true || snapshot.tag !== undefined;
}
```

Verdict: parallel (two expressions of the same discriminant-to-outcome mapping, not a token clone).

## Why this is a problem
Load-bearing parallel truth. Dispatch routing and shutdown short-circuiting must agree on which snapshots represent the steady-state runnable arm versus the shutting-down arm. If one function is changed — for example by introducing a new tag that routes to `"dispatch"` but still short-circuits shutdown, or by relaxing `snapshot.drained` to a truthy check while the other uses `=== true` — a snapshot could be dispatched while shutdown is skipped, or a runnable snapshot could be refused. Today both cover the same state space.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis): a single normalizer from `DrainStateSnapshot` to the internal two-arm enum, with `shouldShortCircuitShutdown` deriving its boolean from that enum.

## False-positive check
Verified both functions are live: `routeDrainStateArm` is called from `resolveSlashDispatch`; `shouldShortCircuitShutdown` is called from `evalShutdownShortCircuitWithReadFailover`. The spec defines the two arms once in `pi-integration-contract/drain-state-contract.md` (PIC-29/30). No tests/ are involved.

## Triage
verdict: questionable — accounting verified: excerpts match verbatim at drain-state.ts:46-51/:62-63, both live (:108, :87), and with DrainStateTag = "shutting-down" (reload-wiring.ts:146) and drained: boolean both functions partition the same 4-tuple space identically; the shared source of truth is a design decision for a human ruling, noting PIC-29 (drain-state-contract.md:15) states both phrasings separately and :9 pins tuple consumption "rather than via any derived single-value collapse" (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified: both excerpts verbatim at drain-state.ts:46-51/:62-63, both live (:108 via resolveSlashDispatch, :87 via evalShutdownShortCircuitWithReadFailover), DrainStateTag is the single literal "shutting-down" (reload-wiring.ts:146) so both predicates partition the 4-tuple space identically ((false,undefined) vs the other three); not a dup of PTQ-0105/PTQ-0204 (doc-comment duplicates); the shared normalizer is a design decision for a human ruling, and drain-state-contract.md's Fields para pins tuple consumption "rather than via any derived single-value collapse" while PIC-29 states both phrasings separately, so the fixer must not pick a shape (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-17): derive shouldShortCircuitShutdown from routeDrainStateArm (body becomes routeDrainStateArm(...) !== "dispatch" or equivalent) so the (drained, tag) state rule is encoded once. Keep both exports and their doc comments.
