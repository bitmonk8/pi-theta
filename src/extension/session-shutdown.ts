// V9g / V9g-T — the `session_shutdown` teardown handler.
//
// This module owns the five-sub-step fixed teardown sequence with per-step
// isolation and the session-swap semantics for in-flight invocations (sub-step 2
// abort-with-synthesised-reason, sub-step 3 bounded `Promise.allSettled` over
// every entry's `disposeBarrier`).
//
// Spec: pi-integration-contract/session-shutdown-semantics.md (§`session_shutdown`
// five-sub-step sequence, **Per-step isolation**, sub-step 3 `cka-31` settle-all
// bounded by `SHUTDOWN_AWAIT_CAP_MS`), pi-integration-contract/
// diagnostic-emission-isolation.md (PIC-24/25/26/27/28), cancellation.md (CNCL-4
// session-shutdown synthesised-reason facet), host-prerequisites.md (PIC-7).

import type { Clock, TimerHandle } from "../seams/clock";
import type { ActiveInvocationEntry, ActiveInvocationRegistry } from "../runtime/active-invocation-registry";
import type { ThetaRegistry } from "./reload-wiring";
import { SHUTDOWN_AWAIT_CAP_MS } from "./capability-probe";
import { armSessionSwapTripwireForReason } from "./session-swap-tripwire";
import { classifyShutdownReason, type PinnedConstantSnapshotSource } from "./unknown-reason-rule";
import { raceAgainstCapTimer } from "./cap-race";
import {
  type EmissionSink,
  emitTeardownDiagnostic,
  reloadTeardownTimeoutDiagnostic,
  teardownStepFailedDiagnostic,
} from "./teardown-emission";

// The bounded-await cap for sub-step 3 (session-shutdown-semantics.md sub-step 3
// / `cka-31`) is owned by the single `SHUTDOWN_AWAIT_CAP_MS` declaration site
// (`V9a`/`capability-probe.ts`) and re-exported here for the teardown handler's
// consumers rather than redeclared (single source of truth).
export { SHUTDOWN_AWAIT_CAP_MS };

/**
 * The byte-exact synthesised abort-reason message the `session_shutdown` handler
 * stamps onto each in-flight `thetaAbort.abort(reason)` (cancellation.md CNCL-4 /
 * `session-shutdown-semantics.md` sub-step 2). Sourced verbatim from CNCL-4.
 */
export const SESSION_SHUTDOWN_ABORT_MESSAGE = "theta cancelled by session shutdown";

/** The four teardown sub-steps that emit `teardown-step-failed` (placeholder-rendering-b.md). */
export type TeardownStep = 1 | 3 | 4 | 5;

/**
 * The closed normative `details.call` label set per `details.step`
 * (session-shutdown-semantics.md **Per-step isolation** — the source of truth).
 * The labels are wire contract, not implementation-chosen, so operator dedup on
 * `(code, details.step, details.call)` is meaningful across runs and
 * implementations.
 */
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

/**
 * The Pi `session_shutdown` event the teardown handler reads. `reason` is read
 * exactly once through the unknown-reason rule (V9h); the closed set is pinned
 * to `SessionShutdownEvent['reason']` (PIC-7).
 */
export interface SessionShutdownEventLike {
  readonly reason: unknown;
}

/** A watcher the teardown closes in sub-step 4 (`discoveryWatcher`, `settingsWatcher`). */
export interface ClosableWatcher {
  close(): void;
}

/**
 * One inbound Pi-side forwarding-signal source the teardown detaches in
 * sub-step 5, tagged with its closed `details.call` label.
 */
export interface ForwardingSignalSource {
  readonly label: (typeof TEARDOWN_STEP_CALL_LABELS)[5][number];
  removeEventListener(): void;
}

/**
 * The teardown-aware hot-reload debouncer sub-step 4 quiesces (PIC-57). The
 * handler marks it torn-down so no *new* watcher-driven rebuild starts, then
 * awaits `whenIdle()` so an already-in-flight rebuild completes (or no-ops)
 * against the still-live `ctx` before the handler returns and Pi invalidates the
 * runtime. The handler owns the bound: it races the await against the shared
 * deadline rather than passing a budget in, so the signature takes none. The
 * closed-set `details.call` quiesce label at `TEARDOWN_STEP_CALL_LABELS[4]`
 * spells the call with an `awaitCap` argument regardless — it is wire text for
 * a diagnostic field, not a claim about this signature.
 */
export interface TeardownAwareDebouncer {
  markTornDown(): void;
  whenIdle(): Promise<void>;
}

/** Construction dependencies for the `session_shutdown` teardown handler. */
export interface SessionShutdownDeps {
  readonly registry: ThetaRegistry;
  readonly activeInvocations: ActiveInvocationRegistry;
  readonly clock: Clock;
  readonly discoveryWatcher: ClosableWatcher;
  readonly settingsWatcher: ClosableWatcher;
  /** The pending debounce timer handle sub-step 4 clears, if any. */
  readonly debounceHandle: TimerHandle | undefined;
  /**
   * The hot-reload debouncer sub-step 4 quiesces (PIC-57). Optional: absent on
   * the compose-never-ran path and on harnesses that do not exercise the
   * watcher-rebuild quiesce, where sub-step 4's quiesce is a no-op.
   */
  readonly debouncer?: TeardownAwareDebouncer | undefined;
  /** The sub-step 5 forwarding-signal sources, in detach order. */
  readonly forwardingSignals: readonly ForwardingSignalSource[];
  /**
   * The injected `SDK_SURFACE_INVENTORY` the unknown-reason rule reads (V9h):
   * `classifyShutdownReason` performs the snapshot lookup-and-`literals` read
   * against this array before `event.reason` is read. `undefined` routes the
   * classifier's circular-init / live-binding-gap arm to
   * `"missing-entry"` rather than reading anything.
   */
  readonly inventory: readonly PinnedConstantSnapshotSource[] | undefined;
  readonly sink: EmissionSink;
}

// --- Behaviour-bearing seams ---

/**
 * Synthesise the CNCL-4 abort reason: a JavaScript `Error` whose `message` is
 * byte-exact `"theta cancelled by session shutdown"`, propagated so that
 * `thetaAbort.signal.reason === source.reason` is observable downstream.
 */
export function synthesiseSessionShutdownReason(): Error {
  return new Error(SESSION_SHUTDOWN_ABORT_MESSAGE);
}

/**
 * Run the five-sub-step fixed teardown sequence with per-step isolation
 * (session-shutdown-semantics.md). Each of sub-steps 1, 3, 4, 5 runs inside its
 * own `try`/`catch`; a per-call throw is caught, emits exactly one
 * `teardown-step-failed` via the wrapped `console.error`, and does not prevent
 * the remaining sub-steps from running. Sub-step 2 aborts each in-flight
 * `thetaAbort` with the synthesised CNCL-4 reason; sub-step 3 awaits every
 * entry's `disposeBarrier` via `Promise.allSettled`, bounded by
 * `SHUTDOWN_AWAIT_CAP_MS`, emitting `reload-teardown-timeout` at the cap.
 */
export async function runSessionShutdown(
  event: SessionShutdownEventLike,
  deps: SessionShutdownDeps,
): Promise<void> {
  // Unknown-reason rule (V9h, PIC-45/46/47): the classifier owns the fixed
  // snapshot-then-`event.reason` read order and the handler-entry `try`/`catch`
  // discipline, so `event.reason` is read only inside it — a throwing getter
  // routes to `session-shutdown-reason-unknown`, not to a caller-side catch.
  // Its single pre-sub-step-1 diagnostic (if any) is emitted through the same
  // sink sub-steps 1/3/4/5 use, before sub-step 1 runs (both *Trigger* columns
  // pin this ordering).
  const classification = classifyShutdownReason(event, deps.inventory);
  if (classification.diagnostic !== undefined) {
    emitTeardownDiagnostic(deps.sink, classification.diagnostic);
  }
  const capturedReason = classification.capturedEventReason;

  // ── Sub-step 1: stop accepting new work (drain, then init drain-state tag) ──
  // Fixed order — `drain()` then `initDrainStateTag()` — each in its own
  // per-call `try`/`catch` so a throw from either routes to a distinct
  // `(code, details.step, details.call)` bucket and does not stop the other.
  runIsolatedCall(1, TEARDOWN_STEP_CALL_LABELS[1][0], deps.sink, () => {
    deps.registry.drain();
  });
  runIsolatedCall(1, TEARDOWN_STEP_CALL_LABELS[1][1], deps.sink, () => {
    deps.registry.initDrainStateTag();
  });

  // ── Sub-step 2: cancel in-flight invocations (stamp reason, then abort) ──
  // Per-entry isolation: stamp `shutdownReason` *before* aborting so the
  // per-invocation `finally` observes a populated field; a stamp/abort throw is
  // caught per entry, emits no `teardown-step-failed`, and does not escape the
  // loop. Each entry is aborted with the synthesised CNCL-4 reason so
  // `thetaAbort.signal.reason === source.reason` downstream.
  const entries = deps.activeInvocations.snapshot();
  const abortReason = synthesiseSessionShutdownReason();
  for (const entry of entries) {
    try {
      entry.shutdownReason = capturedReason;
      entry.thetaAbort.abort(abortReason);
    } catch (abortError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
      void abortError;
    }
  }

  // ── Sub-step 3: bounded await over every entry's disposeBarrier ──
  // The result carries the single absolute `deadline = Clock.now() +
  // SHUTDOWN_AWAIT_CAP_MS` captured at handler entry (sub-steps 1/2 perform no
  // Clock reads, so sub-step 3's capture is the handler-entry capture) and
  // whether the bounded await consumed that deadline, both read by sub-step 4's
  // PIC-57 quiesce.
  const disposeAwait = await runBoundedDisposeAwait(entries, deps);

  // ── Sub-step 4: close watchers, cancel the pending debounce timer ──
  runIsolatedCall(4, TEARDOWN_STEP_CALL_LABELS[4][0], deps.sink, () => {
    deps.discoveryWatcher.close();
  });
  runIsolatedCall(4, TEARDOWN_STEP_CALL_LABELS[4][1], deps.sink, () => {
    deps.settingsWatcher.close();
  });
  runIsolatedCall(4, TEARDOWN_STEP_CALL_LABELS[4][2], deps.sink, () => {
    if (deps.debounceHandle !== undefined) {
      deps.clock.clearTimeout(deps.debounceHandle);
    }
  });

  // ── Sub-step 4 (PIC-57): quiesce the hot-reload debouncer ──
  // (a) mark it torn-down (a cheap synchronous act that runs even when the
  //     quiesce await is skipped) so no *new* rebuild starts and any PIC-49
  //     deferred re-arm is cleared; (b) `await debouncer.whenIdle(...)` bounded
  //     by the SAME shared `deadline` sub-step 3 captured — NOT a fresh
  //     SHUTDOWN_AWAIT_CAP_MS budget — so an already-in-flight watcher rebuild
  //     completes (or no-ops) against the still-live ctx before the handler
  //     returns. DEGRADE-TO-SKIP the quiesce await when sub-step 3's bounded
  //     await already consumed the shared deadline (or the deadline could not be
  //     captured), symmetric to sub-step 3's skipped-await degradation. A throw
  //     from the quiesce-await emits exactly one teardown-step-failed under the
  //     closed-set label and MUST NOT prevent sub-step 5.
  const debouncer = deps.debouncer;
  if (debouncer !== undefined) {
    try {
      debouncer.markTornDown();
      if (!disposeAwait.timedOut && disposeAwait.deadline !== undefined) {
        await quiesceDebouncer(debouncer, disposeAwait.deadline, deps.clock);
      }
    } catch (quiesceError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
      // Sourced from the constant (not a duplicate literal) so the emitted label cannot drift from the declared closed set (bug 0376).
      emitTeardownDiagnostic(
        deps.sink,
        teardownStepFailedDiagnostic(4, TEARDOWN_STEP_CALL_LABELS[4][3], quiesceError),
      );
    }
  }

  // ── Sub-step 5: detach forwarding listeners ──
  for (const signal of deps.forwardingSignals) {
    runIsolatedCall(5, signal.label, deps.sink, () => {
      signal.removeEventListener();
    });
  }

  // Arm the session-swap fail-fast tripwire (V9r): after the full teardown, on a
  // session-only reason (`"new"`/`"resume"`/`"fork"`) set the private per-
  // extension-instance flag on the closed-over registry. Idempotent under a
  // permitted multi-`session_shutdown` delivery (host-prerequisites clause (b));
  // a no-op on the always-tear-down reasons. This writes NO degraded-state tag,
  // performs NO `markRuntimeDegraded` transition, and emits NO
  // `session-shutdown-runtime-degraded` row (governed-by-rebind).
  armSessionSwapTripwireForReason(deps.registry, capturedReason);
}

/**
 * Run one teardown call site inside its own `try`/`catch` (**Per-step
 * isolation**): a throw is caught, emits exactly one `teardown-step-failed` via
 * the wrapped `console.error`, and does not prevent later call sites or
 * sub-steps from running.
 */
function runIsolatedCall(
  step: TeardownStep,
  call: string,
  sink: EmissionSink,
  act: () => void,
): void {
  try {
    act();
  } catch (stepError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
    emitTeardownDiagnostic(sink, teardownStepFailedDiagnostic(step, call, stepError));
  }
}

/**
 * Sub-step 3: await every in-flight entry's `disposeBarrier` to settle via
 * `Promise.allSettled`, bounded by `SHUTDOWN_AWAIT_CAP_MS` measured against the
 * injected `Clock`. The deadline-capture `Clock.now()` and cap-arming
 * `Clock.setTimeout` each run in their own isolation `try`/`catch`; when the cap
 * cannot be armed the handler skips the await (proceeds to sub-step 4) rather
 * than awaiting unbounded. On timeout it emits one `reload-teardown-timeout`
 * naming the still-in-flight entries; on the success path it clears the timer.
 */
async function runBoundedDisposeAwait(
  entries: readonly ActiveInvocationEntry[],
  deps: SessionShutdownDeps,
): Promise<{ readonly timedOut: boolean; readonly deadline: number | undefined }> {
  const { clock, sink } = deps;

  // Track still-in-flight entries synchronously — one microtask hop after a
  // `disposeBarrier` settles, ahead of `Promise.allSettled`'s extra internal
  // hops — so the cap timer decides accurately whether to emit the timeout.
  const inFlight = new Set<ActiveInvocationEntry>(entries);
  for (const entry of entries) {
    const drop = (): void => {
      inFlight.delete(entry);
    };
    void entry.disposeBarrier.then(drop, drop);
  }

  let start = 0;
  let armed = true;
  try {
    // Absolute deadline capture; a slow sub-step-2 abort does not extend it.
    start = clock.now();
  } catch (nowError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
    emitTeardownDiagnostic(sink, teardownStepFailedDiagnostic(3, TEARDOWN_STEP_CALL_LABELS[3][0], nowError));
    armed = false;
  }
  // The shared absolute deadline sub-step 4's PIC-57 quiesce reuses for its
  // bound; `undefined` when the deadline could not be captured (degrade-to-skip).
  const deadline = armed ? start + SHUTDOWN_AWAIT_CAP_MS : undefined;

  let timerHandle: TimerHandle | undefined;
  let timerFired = false;
  const { promise: race, resolve: resolveRace } = Promise.withResolvers<void>();

  if (armed) {
    try {
      timerHandle = clock.setTimeout(() => {
        timerFired = true;
        resolveRace();
      }, SHUTDOWN_AWAIT_CAP_MS);
    } catch (setError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
      emitTeardownDiagnostic(
        sink,
        teardownStepFailedDiagnostic(3, TEARDOWN_STEP_CALL_LABELS[3][1], setError),
      );
      armed = false;
    }
  }

  // When the cap cannot be armed, degrade to a skipped await rather than an
  // unbounded one: proceed directly to sub-step 4. A failed deadline capture
  // also degrades sub-step 4's quiesce to a skip (deadline `undefined`).
  if (!armed) {
    return { timedOut: false, deadline: undefined };
  }

  // The settle-all barrier the cka-31 obligation mandates: resolve the race on
  // the earlier of `Promise.allSettled` settling or the cap firing.
  void Promise.allSettled(entries.map((entry) => entry.disposeBarrier)).then( // allow: cka-31 — session-shutdown-semantics.md
    () => {
      resolveRace();
    },
  );

  await race;

  if (timerFired && inFlight.size > 0) {
    // Cap fired with entries still in flight: emit one `reload-teardown-timeout`
    // naming them in insertion order, then proceed to sub-step 4.
    const stillInFlight = entries.filter((entry) => inFlight.has(entry));
    const elapsed = clock.now() - start;
    emitTeardownDiagnostic(
      sink,
      reloadTeardownTimeoutDiagnostic(stillInFlight, elapsed),
    );
    // The bounded await ran the shared deadline out with work still in flight:
    // sub-step 4's PIC-57 quiesce degrades to a skip (deadline already elapsed).
    return { timedOut: true, deadline };
  }

  // Success path: clear the pending cap timer so a completed reload does not
  // leak a timer onto the about-to-be-invalidated runtime.
  runIsolatedCall(3, TEARDOWN_STEP_CALL_LABELS[3][2], sink, () => {
    if (timerHandle !== undefined) {
      clock.clearTimeout(timerHandle);
    }
  });
  return { timedOut: false, deadline };
}

/**
 * Sub-step 4's PIC-57 quiesce await: resolve on the earlier of
 * `debouncer.whenIdle()` settling or the SHARED absolute `deadline` (the same
 * `Clock.now() + SHUTDOWN_AWAIT_CAP_MS` sub-step 3 captured at handler entry) —
 * NOT a fresh budget. A rebuild still in flight at the shared deadline is
 * abandoned safely under the torn-down flag with NO new diagnostic code; only a
 * *throw* out of this await surfaces (caught by the caller as one
 * teardown-step-failed). The race/cap-timer mechanism itself is the shared
 * `raceAgainstCapTimer` helper (`cap-race.ts`), also used by
 * `quiesceOutgoingRebuild` (factory.ts).
 */
async function quiesceDebouncer(
  debouncer: TeardownAwareDebouncer,
  deadline: number,
  clock: Clock,
): Promise<void> {
  const remaining = deadline - clock.now();
  await raceAgainstCapTimer(() => debouncer.whenIdle(), Math.max(0, remaining), clock);
}
