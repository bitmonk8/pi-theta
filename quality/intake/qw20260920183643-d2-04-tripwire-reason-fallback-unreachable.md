---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: guardSessionSwapTripwire's `state.reason ?? "new"` fallback can never observe undefined
lens: D2                     # D2 | D4 | D7 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/session-swap-tripwire.ts:132-140
  - src/extension/reload-wiring.ts:263-266
  - src/extension/reload-wiring.ts:273-275
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# guardSessionSwapTripwire's `state.reason ?? "new"` fallback can never observe undefined

## Observation
`guardSessionSwapTripwire` reads the tripwire snapshot and, when armed, builds
the trip diagnostic from `state.reason ?? "new"` — a fallback for the case
where `reason` is `undefined`. The only writer of the underlying state,
`ThetaRegistry.armSessionSwapTornDown`, always sets the `#sessionSwapTornDown`
flag and the `#sessionSwapReason` field together in the same call, so whenever
`readSessionSwapTornDown().armed` is `true`, `.reason` is guaranteed to be the
`SessionOnlyReason` that was passed to `armSessionSwapTornDown`, never
`undefined`.

## Evidence
`src/extension/session-swap-tripwire.ts:132-140`:
```ts
export function guardSessionSwapTripwire(deps: TripwireGuardDeps): void {
  const state = deps.registry.readSessionSwapTornDown();
  if (state.armed) {
    emitTeardownDiagnostic(
      deps.sink,
      sessionSwapInstanceSurvivedDiagnostic(state.reason ?? "new"),
    );
    deps.terminator.terminate();
  }
}
```

`src/extension/reload-wiring.ts:263-266` (the single writer, sets both fields
together):
```ts
  armSessionSwapTornDown(reason: SessionOnlyReason): void {
    this.#sessionSwapTornDown = true;
    this.#sessionSwapReason = reason;
  }
```

`src/extension/reload-wiring.ts:273-275` (the single reader, a plain snapshot
of the two fields — no other write path exists for either):
```ts
  readSessionSwapTornDown(): SessionSwapTripwireState {
    return { armed: this.#sessionSwapTornDown, reason: this.#sessionSwapReason };
  }
```

Search: `grep -n "sessionSwapReason\|armSessionSwapTornDown\|readSessionSwapTornDown" src/**/*.ts tests/**/*.ts` — the only assignment to `#sessionSwapReason` is inside `armSessionSwapTornDown` (reload-wiring.ts:265), which always pairs it with `#sessionSwapTornDown = true` in the same call; there is no code path that sets `#sessionSwapTornDown = true` without also setting `#sessionSwapReason`.

## Why this is a problem
Because `state.armed === true` and `state.reason !== undefined` always hold
together by construction, the `?? "new"` fallback value is dead: the branch of
the nullish-coalescing operator that supplies `"new"` cannot execute given the
invariant the sole writer enforces. Nothing in the surrounding code documents
this as a deliberate defensive substitution for an externally-observable
failure mode (unlike, e.g., the documented "Defensive (unreachable)" comment in
`theta-composition-producer.ts`) — the fallback reads as reachable but is not.

## Suggested direction (non-binding, optional)
A direction only: narrow `SessionSwapTripwireState.reason` to
`SessionOnlyReason | undefined` only where genuinely needed, or thread the
armed reason as a non-optional field once armed (a discriminated union on
`armed`), so the type system reflects the invariant the code already
maintains and the fallback value is no longer needed.

## False-positive check
- Searched `sessionSwapReason|armSessionSwapTornDown|readSessionSwapTornDown`
  across `src/` and `tests/`: the only writer is
  `ThetaRegistry.armSessionSwapTornDown` (reload-wiring.ts:263-266), which sets
  both fields atomically in the same call body; no other method assigns either
  private field.
- Confirmed via `tests/session-swap-tripwire.test.ts` (e.g. the `cka-27` arming
  tests) that every test path that arms the tripwire also asserts `state.reason`
  equals the passed-in reason — no test ever observes `armed: true` with
  `reason: undefined`.
- Not a spec-mandated enumeration mirror: `SessionOnlyReason` has no `"new"`-as-
  default clause in host-prerequisites.md; `"new"` here is an arbitrary pick
  among the three possible reasons, not a documented default.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
