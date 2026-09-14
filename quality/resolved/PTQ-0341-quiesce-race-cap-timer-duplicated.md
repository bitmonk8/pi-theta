---
id: PTQ-0341
title: factory.ts's quiesceOutgoingRebuild copies session-shutdown.ts's quiesceDebouncer race-against-cap-timer body instead of sharing it
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/factory.ts:280-297
  - src/extension/session-shutdown.ts:718-734
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260914130212
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-14
---

# factory.ts's quiesceOutgoingRebuild copies session-shutdown.ts's quiesceDebouncer race-against-cap-timer body instead of sharing it

## Observation
`factory.ts`'s `quiesceOutgoingRebuild` (lines 280-297) and `session-shutdown.ts`'s `quiesceDebouncer` (lines 718-734) each build a `resolveCap`/`capRace`/`capHandle` triple, race it against a `whenIdle()`-shaped call via `Promise.race`, and clear the cap timer in a `finally` — the PIC-57 bounded quiesce of an in-flight hot-reload rebuild. `factory.ts`'s own doc comment on `quiesceOutgoingRebuild` (lines 262-279) states the relationship outright: "mirroring `quiesceDebouncer` (session-shutdown.ts)." `quiesceDebouncer` is not exported from `session-shutdown.ts` (module-private); `quiesceOutgoingRebuild` is a second, independently-declared function of the same shape. The two functions' cap MAGNITUDE is already shared through one named constant — `capability-probe.ts:120` declares `SUPERSESSION_QUIESCE_CAP_MS = SHUTDOWN_AWAIT_CAP_MS`, with a comment explaining "What the two share is that declared magnitude, not a budget" — but the surrounding race-against-cap-timer MECHANISM itself is written out twice.

## Evidence
Not in the clone map (the map reports "no clone groups" for `src/extension/factory.ts`; a direct `clone-scan.mjs map --files` re-run naming exactly these two files, and again against a wider manifest including both plus `capability-probe.ts`/`production-composition.ts`/`invoke-static-checks.ts`/`runtime/invocation.ts`, still returns no group for this pair — found by reading, per the brief's own acknowledgement that the scanner cannot see every mirrored mechanism).

**Location 1 — `src/extension/factory.ts:280-297`** (`quiesceOutgoingRebuild`, full body):
```ts
async function quiesceOutgoingRebuild(
  outgoingHandle: HotReloadHandle,
  outgoingClock: Clock,
): Promise<void> {
  let resolveCap: () => void = (): void => {};
  const capRace = new Promise<void>((resolve) => {
    resolveCap = resolve;
  });
  const capHandle = outgoingClock.setTimeout(
    () => resolveCap(),
    SUPERSESSION_QUIESCE_CAP_MS,
  );
  try {
    await Promise.race([outgoingHandle.whenIdle?.() ?? Promise.resolve(), capRace]); // allow: PIC-57 — pi-integration-contract/session-shutdown-semantics.md
  } finally {
    outgoingClock.clearTimeout(capHandle);
  }
}
```

**Location 2 — `src/extension/session-shutdown.ts:718-734`** (`quiesceDebouncer`, full body):
```ts
async function quiesceDebouncer(
  debouncer: TeardownAwareDebouncer,
  deadline: number,
  clock: Clock,
): Promise<void> {
  const remaining = deadline - clock.now();
  let resolveCap: () => void = (): void => {};
  const capRace = new Promise<void>((resolve) => {
    resolveCap = resolve;
  });
  const capHandle = clock.setTimeout(() => resolveCap(), Math.max(0, remaining));
  try {
    await Promise.race([debouncer.whenIdle(), capRace]); // allow: PIC-57 — pi-integration-contract/session-shutdown-semantics.md
  } finally {
    clock.clearTimeout(capHandle);
  }
}
```

Diff verdict: renamed-and-reshaped, not a pure rename. Verbatim in both: `let resolveCap: () => void = (): void => {};`; the three-line `capRace = new Promise<void>((resolve) => { resolveCap = resolve; });` construction; `try {` / `} finally {` / the closing braces; and, strikingly, the identical trailing inline comment `// allow: PIC-57 — pi-integration-contract/session-shutdown-semantics.md` citing the same spec clause on the `Promise.race` line in both. Diverges on: (a) the deadline source — a call-site constant (`SUPERSESSION_QUIESCE_CAP_MS`) vs. a pre-computed `remaining = deadline - clock.now()` floored via `Math.max(0, remaining)`; factory.ts's own comment states this difference is deliberate ("this path owns its OWN deadline… captured at this call rather than at `session_shutdown` handler entry — no such deadline exists on this path"); (b) the raced promise — `outgoingHandle.whenIdle?.() ?? Promise.resolve()` (optional on `HotReloadHandle`, `hot-reload.ts:145`) vs. `debouncer.whenIdle()` (required on `TeardownAwareDebouncer`, `session-shutdown.ts:127`); (c) the clock/handle variable names (`outgoingClock`/`outgoingHandle` vs `clock`/`debouncer`).

## Why this is a problem
This is a copy-paste block living in two files under `src/extension/`, evidenced by the identical variable-naming triple (`resolveCap`/`capRace`/`capHandle`, a search of which across `src/` turns up only these two functions) and the identical inline spec-citation comment on the raced line. The stated rationale in factory.ts's doc comment addresses only WHY the deadline VALUE differs between the two call sites (a genuine, sound reason); it gives no reason the surrounding mechanism — the `resolveCap`/`capRace`/`capHandle` construction and the `try`/`finally` cap-clear — must itself be a second, independent implementation rather than one shared helper parameterised by an already-computed delay and an already-adapted `whenIdle`-shaped callback (both call sites already have to produce exactly those two values before racing them). If the PIC-57 quiesce contract changes — for example, to also swallow and log a rejection from the raced promise, or to guard against `capHandle` never being armed — a fix applied to one copy (most likely `quiesceDebouncer`, which has the older PIC-57 lineage and the associated `session_shutdown` teardown test coverage) has no structural reason to reach the other (`quiesceOutgoingRebuild`, added later by bug 0034 for the supersession pass), leaving the twin silently unpatched — the classic drift risk D4 exists to catch, latent rather than yet triggered.

## Suggested direction (non-binding, optional)
A shared helper taking an already-adapted `whenIdle`-shaped callback (`() => Promise<void>`) and an already-computed delay in milliseconds would let both call sites keep their own deadline-sourcing logic (the constant vs. the shared-deadline arithmetic) while sharing the `resolveCap`/`capRace`/`capHandle`/`try`-`finally` mechanism; both `factory.ts` and `session-shutdown.ts` already live under `src/extension/`, so no new cross-directory import edge would be needed. Named as a hypothesis only.

## False-positive check
Re-read both cited spans immediately before filing (quoted verbatim above). Ran `clone-scan.mjs map --files` against a manifest naming this shard's six files plus `session-shutdown.ts`, `capability-probe.ts`, `production-composition.ts`, `invoke-static-checks.ts`, and `runtime/invocation.ts`: no clone group registers for this pair even with both hosts present in the scan, confirming the absence is not an artefact of the shard boundary. Confirmed both copies live: `quiesceOutgoingRebuild` has its one call site inside `runComposeInstanceRegistration`'s supersession-pass guard (`factory.ts`, the same scope that captures `outgoingHandle`/`outgoingClock`); `quiesceDebouncer` has its one call site inside `runSessionShutdown`'s sub-step 4 (`session-shutdown.ts:559`). Neither is a dead copy (D2's territory). Confirmed the one genuine behavioural asymmetry beyond the stated deadline difference: `TeardownAwareDebouncer.whenIdle` is required (`session-shutdown.ts:127`) while `HotReloadHandle.whenIdle` is optional (`hot-reload.ts:145`). Checked the deliberate-mirror carve-out: factory.ts's own comment names the mirror and explains the deadline difference but states no reason the boilerplate itself must be duplicated, so the stated rationale is treated as answering a different question than the one this filing raises, not as covering it. Checked `capability-probe.ts:108-120`'s `SUPERSESSION_QUIESCE_CAP_MS = SHUTDOWN_AWAIT_CAP_MS` declaration and comment: confirms the codebase already recognises and intentionally couples the two quiesces' magnitude while explicitly declining to couple their runtime deadline — supporting evidence that the deadline-sourcing divergence is deliberate and orthogonal to the mechanism duplication cited here. Searched `quality/resolved/` and `quality/intake/` for `quiesceDebouncer`/`quiesceOutgoingRebuild`: no hit (PTQ-0014 is an unrelated `whenIdle`/`awaitCapMs` vestigial-parameter finding on a different function).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce verbatim at the exact cited lines (factory.ts:280-297, session-shutdown.ts:718-734), the resolveCap/capRace/capHandle triple + identical PIC-57 inline comment is confirmed unique to these two functions repo-wide (grep across src/), a re-run `clone-scan.mjs map --files` on both hosts independently reproduces "(no clone groups)" exactly as claimed (PIC-57's spec clause is behavioral, not a code-shape vector table, so the vector-table carve-out doesn't apply), both calls are confirmed live and singular in the claimed scopes, and factory.ts's own "mirroring quiesceDebouncer" doc comment justifies only the deadline-value divergence, not the duplicated surrounding mechanism, leaving a real stated drift risk and a genuinely mechanical dedupe path (pre-computed delay + adapted whenIdle thunk); not a duplicate of PTQ-0014 (fixed vestigial awaitCapMs param) or PTQ-0306 (D9 unnamed-callback finding, same host, different root cause). (triage: claude-opus-5)
