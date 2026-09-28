---
id: PTQ-1672
title: NestedShapeEmission.code still names the retired session-shutdown-runtime-degraded code while the tripwire's session-swap-instance-survived diagnostic — the spec's second nested-shape code — is emitted through the flat emitTeardownDiagnostic path
lens: D1
status: open
verdict: confirmed
locations:
  - src/extension/teardown-emission.ts:19
  - src/extension/teardown-emission.ts:126-151
  - src/extension/teardown-emission.ts:162-176
  - src/extension/teardown-emission.ts:179-190
  - src/extension/teardown-emission.ts:228-244
  - src/extension/teardown-emission.ts:293-298
  - src/extension/session-swap-tripwire.ts:94-103
  - src/extension/session-swap-tripwire.ts:135-145
sites: 4
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# NestedShapeEmission.code still names the retired session-shutdown-runtime-degraded code while the tripwire's session-swap-instance-survived diagnostic — the spec's second nested-shape code — is emitted through the flat emitTeardownDiagnostic path

## Observation
`teardown-emission.ts` owns two emission mechanisms for teardown-time `console.error` diagnostics: `emitTeardownDiagnostic` (flat-`details` codes; serialiser-throw fallback is the bare `diagnostic.code`) and `emitNestedShapeDiagnostic` (codes whose `details.event.reason` is nested; serialiser-throw fallback is the two-token `${code} ${detailsEventReason}`, plus a construction-site wrap and `emitConstructionSiteFallback`). The nested path's contract, `NestedShapeEmission.code`, is the union `typeof RUNTIME_DEGRADED_CODE | typeof CANCELLED_BY_SESSION_SHUTDOWN_CODE`. The runtime-degraded code was retired by the `governed-by-rebind` resolution (V9r, 5590aeba, 2026-07-02) and has no row in `code-registry-host.md`; its replacement, `theta/host/session-swap-instance-survived`, builds the same `details: { event: { reason } }` nested shape (`session-swap-tripwire.ts:97-102`) but is emitted through `emitTeardownDiagnostic` (`session-swap-tripwire.ts:139`), not the nested path. In production, `emitNestedShapeDiagnostic` has exactly one caller and it always passes `CANCELLED_BY_SESSION_SHUTDOWN_CODE`; the `RUNTIME_DEGRADED_CODE` arm, the optional `entry` member and `emitConstructionSiteFallback`'s entry-absent two-token branch are reached only from tests.

## Evidence

Way A — the nested-shape mechanism, whose contract names the retired code. `src/extension/teardown-emission.ts:19`:
```ts
export const RUNTIME_DEGRADED_CODE = "theta/host/session-shutdown-runtime-degraded";
```
`src/extension/teardown-emission.ts:179-190`:
```ts
export interface NestedShapeEmission {
  readonly code:
    | typeof RUNTIME_DEGRADED_CODE
    | typeof CANCELLED_BY_SESSION_SHUTDOWN_CODE;
  readonly diagnostic: Diagnostic;
  /** The already-hoisted `details.event.reason` local (PIC-25 hoist obligation). */
  readonly detailsEventReason: string;
  /** The held registry entry (per-invocation note only) for the `entry.theta` catch-arm read. */
  readonly entry?: ActiveInvocationEntry;
  /** Test seam: force the payload-construction site to throw (PIC-26). */
  readonly forceConstructionThrow?: boolean;
}
```
`src/extension/teardown-emission.ts:162-176` (the entry-absent branch is the only code path shaped for a "no entry" nested code):
```ts
function emitConstructionSiteFallback(
  sink: EmissionSink,
  code: NestedShapeEmission["code"],
  entry: ActiveInvocationEntry | undefined,
): void {
  const fallback =
    entry !== undefined
      ? `${code} ${entry.theta} <unreadable>`
      : `${code} <unreadable>`;
```
`src/extension/teardown-emission.ts:236-238` (the serialiser-throw fallback this path provides):
```ts
    if (!serialiseOk) {
      try {
        sink.emit(`${code} ${detailsEventReason}`);
```
Sole production producer, `src/extension/teardown-emission.ts:293-298`:
```ts
  emitNestedShapeDiagnostic(deps.sink, {
    code: CANCELLED_BY_SESSION_SHUTDOWN_CODE,
    diagnostic,
    detailsEventReason,
    entry,
  });
```

Way B — the tripwire builds the same nested `details.event.reason` shape and emits it through the flat mechanism. `src/extension/session-swap-tripwire.ts:94-103`:
```ts
export function sessionSwapInstanceSurvivedDiagnostic(
  reason: SessionOnlyReason,
): Diagnostic {
  return {
    severity: "error",
    code: SESSION_SWAP_INSTANCE_SURVIVED_CODE,
    message: `extension instance survived a session-only session_shutdown (reason: ${reason}); Pi lifecycle contract violated — terminating`,
    details: { event: { reason } },
  };
}
```
`src/extension/session-swap-tripwire.ts:135-145`:
```ts
export function guardSessionSwapTripwire(deps: TripwireGuardDeps): void {
  const state = deps.registry.readSessionSwapTornDown();
  if (state.armed) {
    // ThetaRegistry.armSessionSwapTornDown records the reason whenever it arms.
    emitTeardownDiagnostic(
      deps.sink,
      sessionSwapInstanceSurvivedDiagnostic(state.reason!),
    );
    deps.terminator.terminate();
  }
}
```
The flat mechanism's fallback, `src/extension/teardown-emission.ts:143-145`:
```ts
    if (!serialiseOk) {
      try {
        sink.emit(diagnostic.code);
```

Counts, both ways.

Producers of the `RUNTIME_DEGRADED_CODE` arm — `grep -rn "RUNTIME_DEGRADED_CODE" src/ extensions/ tools/` → 2 hits, both in the declaring file (declaration + union arm; no producer):
```
src/extension/teardown-emission.ts:19:export const RUNTIME_DEGRADED_CODE = "theta/host/session-shutdown-runtime-degraded";
src/extension/teardown-emission.ts:181:    | typeof RUNTIME_DEGRADED_CODE
```
Test-only producers — `grep -rn "RUNTIME_DEGRADED_CODE" tests/ | cut -d: -f1 | sort | uniq -c` → 2 files:
```
      9 tests/session-shutdown.test.ts
      2 tests/session-swap-tripwire.test.ts
```
(`tests/session-swap-tripwire.test.ts:172-175` asserts the code is NOT emitted; `tests/session-shutdown.test.ts:446,477,505` construct `NestedShapeEmission` values with it.)

Callers of the nested path — `grep -rn "emitNestedShapeDiagnostic(" src/ extensions/ tools/` → 2 hits (declaration + the one caller at :293):
```
src/extension/teardown-emission.ts:201:export function emitNestedShapeDiagnostic(
src/extension/teardown-emission.ts:293:  emitNestedShapeDiagnostic(deps.sink, {
```
Callers of the flat path — `grep -rn "emitTeardownDiagnostic(" src/ extensions/ tools/` → 8 hits:
```
src/extension/session-shutdown.ts:193:    emitTeardownDiagnostic(deps.sink, classification.diagnostic);
src/extension/session-shutdown.ts:267:      emitTeardownDiagnostic(
src/extension/session-shutdown.ts:306:    emitTeardownDiagnostic(sink, teardownStepFailedDiagnostic(step, call, stepError));
src/extension/session-shutdown.ts:342:    emitTeardownDiagnostic(sink, teardownStepFailedDiagnostic(3, TEARDOWN_STEP_CALL_LABELS[3][0], nowError));
src/extension/session-shutdown.ts:360:      emitTeardownDiagnostic(
src/extension/session-shutdown.ts:390:    emitTeardownDiagnostic(
src/extension/session-swap-tripwire.ts:139:    emitTeardownDiagnostic(
src/extension/teardown-emission.ts:126:export function emitTeardownDiagnostic(
```
Registry row for the union's first arm — `grep -rn "session-shutdown-runtime-degraded" docs/spec_topics/diagnostics/code-registry-host.md` → 0 hits (no row).

The spec names the two nested-shape codes explicitly and the tripwire code is one of them — `grep -o "applies \*\*only to the two nested-shape codes\*\* ([^)]*)" docs/spec_topics/pi-integration-contract/diagnostic-emission-isolation.md` → 1 hit:
```
applies **only to the two nested-shape codes** (`theta/host/session-swap-instance-survived`, `theta/runtime/cancelled-by-session-shutdown`)
```
and `grep -c "Two-token fallback for nested-shape codes" docs/spec_topics/pi-integration-contract/diagnostic-emission-isolation.md` → 1, the clause reading "For the two codes whose `details` payload nests the `session_shutdown` event under `details.event.*` … — `theta/host/session-swap-instance-survived` and `theta/runtime/cancelled-by-session-shutdown` — the catch arm MUST instead emit the two-token form".

Drift history — `git log --format="%h %ad %s" --date=short -S"typeof RUNTIME_DEGRADED_CODE" -- src/` → 2 hits:
```
fd6596ec 2026-09-21 quality: qw20260921063002 fix d9/src__extension__session-shutdown.ts
643fe3b4 2026-07-01 V9g-T — session-shutdown teardown + emission-isolation failing tests
```
`git log --format="%h %ad %s" --date=short -- src/extension/session-swap-tripwire.ts | tail -2` → 2 hits:
```
5590aeba 2026-07-02 V9r — session-swap fail-fast tripwire
d3fe75c0 2026-07-02 V9r-T — session-swap fail-fast tripwire tests (fail red)
```
The union was introduced 2026-07-01 naming the degraded code; the tripwire replaced that code the next day and wired its emission through the flat path; the union was carried verbatim into `teardown-emission.ts` on 2026-09-21 without migration.

Self-inconsistency statement: no written architecture rule exists for which emission helper a code uses; the anchor is self-inconsistency — one nested-shape code goes through the nested mechanism, the other through the flat one, and the nested mechanism's own contract names a code that no longer exists — plus the cost below.

## Why this is a problem
The two spec-named `details.event.reason` codes solve "emit a nested-shape teardown diagnostic with fallback" two different ways, and the divergence has already produced a concrete difference a maintainer cannot see from the contract: on a serialiser throw the cancelled-by-session-shutdown row falls back to `${code} ${detailsEventReason}` (teardown-emission.ts:238) while the session-swap-instance-survived row falls back to the bare `diagnostic.code` (teardown-emission.ts:145), and the tripwire's `details.event` construction (session-swap-tripwire.ts:101) runs with no construction-site wrap at all — the wrap and its `${code} <unreadable>` entry-absent branch exist only inside the nested path, where nothing production-side ever reaches them. A maintainer reading `NestedShapeEmission.code` is told the nested-shape set is {runtime-degraded, cancelled-by-session-shutdown}; the retired arm points at a code with no registry row (search above: 0 hits), and the live second member is absent, so the doc-comment claims "for both nested-shape codes" (teardown-emission.ts:194-197) describe a pair that does not match the code's routing. Bug 0375 (`docs/bugs/0375-excised-degraded-arm-persists.md`) already excised the degraded machinery from `reload-wiring.ts` and `drain-state.ts` on the ground that "the spec text is unusually explicit that these exact members were excised"; bug 0073's fix (`docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md:271-273`) recorded the tripwire row as "separate rule, separate emission site, out of scope", so neither fix covered this site — the drift is recorded but unresolved.

## Suggested direction (non-binding, optional)
Unification hypothesis (unproven): the nested-shape contract's code set is the spec's pair — `SESSION_SWAP_INSTANCE_SURVIVED_CODE | CANCELLED_BY_SESSION_SHUTDOWN_CODE` — and the tripwire guard would route through the same nested mechanism the cancelled note uses, making the entry-absent fallback branch's only production reader the tripwire. Whether the guard's fail-fast `terminate()` ordering constrains that is unverified.

## False-positive check
- Clone-map check: the injected clone map lists no group for `src/extension/teardown-emission.ts` or `src/extension/session-swap-tripwire.ts`; G042 (session-shutdown.ts:195-206/231-239) covers `runIsolatedCall` pairs, not these sites. No group covers this observation; the two mechanisms are not token copies of each other (different fallback strings, different wrap structure).
- D9-affinity check: not a wrong-home claim — both mechanisms live in the module that owns teardown emission (teardown-emission.ts), and the tripwire's emission site is where the spec places it; the finding is which mechanism each code uses and what the contract union names, not where the code lives.
- D2-deadness check: both sides are live — `emitTeardownDiagnostic` has 7 production call sites, `emitNestedShapeDiagnostic` has 1; the `RUNTIME_DEGRADED_CODE` arm is exercised by tests (`tests/session-shutdown.test.ts`, 9 references), so it is not D2-dead under the tests-are-callers precedent; the `qw20260922150013/D2/shard-06.notes.txt` D2 pass explicitly declined it on that ground, leaving the D1 divergence unfiled.
- Export-style exemption: not applicable (divergent-solutions); the `RUNTIME_DEGRADED_CODE` export itself is not the finding — the union arm, the routing split, and the unreached entry-absent branch are.
- Prior filings: PTQ-0139 (three-token doc claim), PTQ-0156 (dead reason hoist), PTQ-1100 (`state.reason ?? "new"` fallback), PTQ-1153 (session-shutdown two concerns — the split that produced teardown-emission.ts) each read; none names the code-union arm or the tripwire's emission routing. Bugs 0073, 0371, 0375 read; 0073 declared the tripwire emission out of scope, 0375's Affected list is reload-wiring.ts / drain-state.ts only.
- Self-inconsistency: no written rule exists; the anchor is self-inconsistency plus the cost cited above (fallback-shape divergence between the two spec-named nested-shape codes, contract union naming a retired code).
- Not a bug filing: no behaviour change is proposed; the observed fallback difference is cited as the mechanical cost of the divergence, and the fix stage owns any resolution.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Every stated search reproduces verbatim: RUNTIME_DEGRADED_CODE has 2 src hits (the :19 declaration and the :181 union arm) and appears in 9+2 test files; emitNestedShapeDiagnostic has 1 production caller (:293, always CANCELLED); emitTeardownDiagnostic has 7 callers, including session-swap-tripwire.ts:139; the registry row count is 0; the spec grep and both git logs match. Every excerpt matches at the cited lines, and clone-scan reports no clone groups for teardown-emission.ts. The cost is real and spec-anchored, not symmetry-only: PIC-25/26 in diagnostic-emission-isolation.md name session-swap-instance-survived as a nested-shape code that MUST use the two-token `${code} ${detailsEventReason}` serialiser-throw fallback and a construction-site wrap, but the tripwire's flat path emits the bare code and has no wrap. That is a spec non-conformance a human may prefer to track as a docs/bugs record. Bug 0073 explicitly left this row out of scope, and no open or intake D2/D4/D8/D9 filing or PTQ states this root cause (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: the nested-shape emission contract carries the spec's pair. In src/extension/teardown-emission.ts: NestedShapeEmission.code becomes `typeof SESSION_SWAP_INSTANCE_SURVIVED_CODE | typeof CANCELLED_BY_SESSION_SHUTDOWN_CODE`; delete RUNTIME_DEGRADED_CODE (:19) and its union arm (:181) — hoist/relocate the survived-code constant if a session-swap-tripwire.ts ↔ teardown-emission.ts import cycle threatens. In src/extension/session-swap-tripwire.ts guardSessionSwapTripwire (:135-145): emit via emitNestedShapeDiagnostic({ code: SESSION_SWAP_INSTANCE_SURVIVED_CODE, diagnostic, detailsEventReason: state.reason!, no entry }) before terminate(), replacing the flat emitTeardownDiagnostic call. Stated behaviour change, spec-mandated (diagnostic-emission-isolation.md PIC-25/26: the two-token fallback applies to BOTH nested-shape codes): the tripwire's serialiser-throw fallback becomes `<code> <reason>` (was bare code) and its payload construction gains the construction-site wrap — the entry-absent `<code> <unreadable>` branch gains its first production reader. Migrate tests/session-shutdown.test.ts's nine RUNTIME_DEGRADED_CODE constructions to the survived code; extend tests/session-swap-tripwire.test.ts to pin the nested routing.
