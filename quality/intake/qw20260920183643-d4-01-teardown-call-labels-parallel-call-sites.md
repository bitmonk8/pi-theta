---
id: pending
title: Teardown call-label roster is mirrored at call sites and the signal-source type
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/session-shutdown.ts:61-75
  - src/extension/session-shutdown.ts:95-101
  - src/extension/session-shutdown.ts:498-500
  - src/extension/session-shutdown.ts:501-503
  - src/extension/session-shutdown.ts:638-640
  - src/extension/session-shutdown.ts:661-663
  - src/extension/session-shutdown.ts:701-703
  - src/extension/session-shutdown.ts:531-533
  - src/extension/session-shutdown.ts:534-536
  - src/extension/session-shutdown.ts:537-539
  - src/extension/session-shutdown.ts:564-567
  - src/extension/session-shutdown.ts:572-574
sites: 12
fix_scope: localized
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Teardown call-label roster is mirrored at call sites and the signal-source type

## Observation
`src/extension/session-shutdown.ts` declares `TEARDOWN_STEP_CALL_LABELS` as the
normative `details.call` label roster for the `session_shutdown` teardown. The
same labels are also spelled as string literals at every `runIsolatedCall` and
`teardownStepFailedDiagnostic` call site, and as the literal-union type of
`ForwardingSignalSource.label`. No compile-time or runtime mechanism ties the
roster to those call-site strings or to the interface type; today they match
only by manual inspection.

## Evidence
The roster (`X`):

```typescript
// src/extension/session-shutdown.ts:61-75
export const TEARDOWN_STEP_CALL_LABELS = {
  1: ["thetaRegistry.drain", "thetaRegistry.initDrainStateTag"],
  3: ["Clock.now()", "Clock.setTimeout(awaitCap)", "Clock.clearTimeout(awaitCap)"],
  4: [
    "discoveryWatcher.close",
    "settingsWatcher.close",
    "Clock.clearTimeout(debounce)",
    "debouncer.whenIdle(awaitCap)",
  ],
  5: [
    "ctx.signal.removeEventListener",
    "toolSignal.removeEventListener",
    "parentInvokeSignal.removeEventListener",
  ],
} as const satisfies Record<TeardownStep, readonly string[]>;
```

Step-5 labels also live in the `ForwardingSignalSource` interface (`Y`):

```typescript
// src/extension/session-shutdown.ts:95-101
export interface ForwardingSignalSource {
  readonly label:
    | "ctx.signal.removeEventListener"
    | "toolSignal.removeEventListener"
    | "parentInvokeSignal.removeEventListener";
  removeEventListener(): void;
}
```

The call-site strings (`Z`) are:

```typescript
// src/extension/session-shutdown.ts:498-500
runIsolatedCall(1, "thetaRegistry.drain", deps.sink, () => {
  deps.registry.drain();
});

// src/extension/session-shutdown.ts:501-503
runIsolatedCall(1, "thetaRegistry.initDrainStateTag", deps.sink, () => {
  deps.registry.initDrainStateTag();
});

// src/extension/session-shutdown.ts:638-640
emitTeardownDiagnostic(sink, teardownStepFailedDiagnostic(3, "Clock.now()", nowError));
armed = false;

// src/extension/session-shutdown.ts:661-663
emitTeardownDiagnostic(
  sink,
  teardownStepFailedDiagnostic(3, "Clock.setTimeout(awaitCap)", setError),
);

// src/extension/session-shutdown.ts:701-703
runIsolatedCall(3, "Clock.clearTimeout(awaitCap)", sink, () => {
  if (timerHandle !== undefined) {
    clock.clearTimeout(timerHandle);
  }
});

// src/extension/session-shutdown.ts:531-533
runIsolatedCall(4, "discoveryWatcher.close", deps.sink, () => {
  deps.discoveryWatcher.close();
});

// src/extension/session-shutdown.ts:534-536
runIsolatedCall(4, "settingsWatcher.close", deps.sink, () => {
  deps.settingsWatcher.close();
});

// src/extension/session-shutdown.ts:537-539
runIsolatedCall(4, "Clock.clearTimeout(debounce)", deps.sink, () => {
  if (deps.debounceHandle !== undefined) {
    deps.clock.clearTimeout(deps.debounceHandle);
  }
});

// src/extension/session-shutdown.ts:564-567
emitTeardownDiagnostic(
  deps.sink,
  teardownStepFailedDiagnostic(4, TEARDOWN_STEP_CALL_LABELS[4][3], quiesceError),
);

// src/extension/session-shutdown.ts:572-574
for (const signal of deps.forwardingSignals) {
  runIsolatedCall(5, signal.label, deps.sink, () => {
    signal.removeEventListener();
  });
}
```

Diff verdict: the strings are byte-identical today; this is a parallel (mirrored
label set), not a clone or drift.

## Why this is a problem
`session-shutdown-semantics.md` makes `details.call` part of the wire contract
and the constant's own comment states that operator dedup on
`(code, details.step, details.call)` is meaningful across runs. If a call-site
string diverges from `TEARDOWN_STEP_CALL_LABELS`, the same logical teardown call
will be bucketed under a different `details.call`, breaking that dedup and
contradicting the spec. For step 5, adding a new forwarded signal requires
updating both the `ForwardingSignalSource.label` type and the roster. This is
load-bearing parallel truth, not incidental similarity.

## Suggested direction
Centralize the labels so the call sites cannot drift from the roster. One
hypothesis: drive `runIsolatedCall` from `TEARDOWN_STEP_CALL_LABELS` (for
example, by passing the roster index rather than a free string), and derive the
`ForwardingSignalSource.label` type from the same source. The natural shared
home is the existing `TEARDOWN_STEP_CALL_LABELS` constant in
`src/extension/session-shutdown.ts`.

## False-positive check
- Re-read the roster at lines 61-75 and every cited call site; all strings match
  exactly, so this is parallel, not drift.
- The constant is exported and imported by tests, but the mirrored literal
  strings are in production code, so this is not a test-only finding.
- The spec clause is cited once in the constant comment; the production-side
  mirrors do not independently cite the same clause, so the normative-vector
  carve-out does not apply.
- No dead copies; no generated code; no host-size claim.

## Triage
verdict: questionable — accounting verified: all 12 excerpts reproduce at the cited lines; `runIsolatedCall` (594-596) and `teardownStepFailedDiagnostic` (176-178) both take `call: string` so nothing ties call-site labels to `TEARDOWN_STEP_CALL_LABELS`; the emitter site roster is complete (grep: exactly 10 sites); roster X = 12 labels, interface Y mirrors the 3 step-5 labels, call sites spell 8 as free literals + 1 via the constant (566, the bug-0376 fix) + 1 via `signal.label`; the only test-side ties (session-shutdown.test.ts:359 `toContain`, b0376 test:127-134 membership) cover 2 of 12 labels, so the filing's "no mechanism" claim is slightly overstated but the parallel stands for 9 literal sites + the interface union; anchor is mechanical (bug 0376 is a prior instance of exactly this drift, and its fix closed 1 of 10 sites); spec-vector carve-out does not apply (call-site literals cite no clause); no existing/resolved PTQ tracks this (the D9 intake on the same file is a breakdown filing) — the shared source of truth (roster-index vs derived literal-union type) is a design decision for a human ruling (triage: claude-fable-5-1)
