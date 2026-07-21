// V9g / V9g-T — the `session_shutdown` teardown handler and its emission
// isolation.
//
// This module owns the five-sub-step fixed teardown sequence with per-step
// isolation, the session-swap semantics for in-flight invocations (sub-step 2
// abort-with-synthesised-reason, sub-step 3 bounded `Promise.allSettled` over
// every entry's `disposeBarrier`), and the teardown-time `console.error`
// emission isolation (the wrapped serialisation-and-emission sequence with the
// bare-`code` / two-token / three-token fallback forms and the construction-site
// self-wrap).
//
// V9g-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// functions inertly so the failing tests compile and red on their own primary
// assertions (the sub-step orchestration, the emission isolation, the reason
// synthesis, and the per-invocation / timeout diagnostics are absent). The
// paired V9g implementation leaf fills these in.
//
// Spec: pi-integration-contract/session-shutdown-semantics.md (§`session_shutdown`
// five-sub-step sequence, **Per-step isolation**, sub-step 3 `cka-31` settle-all
// bounded by `SHUTDOWN_AWAIT_CAP_MS`), pi-integration-contract/
// diagnostic-emission-isolation.md (PIC-24/25/26/27/28), cancellation.md (CNCL-4
// session-shutdown synthesised-reason facet), host-prerequisites.md (PIC-7).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { Clock, TimerHandle } from "../seams/clock";
import type { ActiveInvocationEntry, ActiveInvocationRegistry } from "../runtime/active-invocation-registry";
import type { ThetaRegistry } from "./reload-wiring";
import { SHUTDOWN_AWAIT_CAP_MS } from "./capability-probe";
import { armSessionSwapTripwireForReason } from "./session-swap-tripwire";

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

// --- Diagnostic codes (diagnostics/code-registry-host.md, -runtime.md) ---

export const TEARDOWN_STEP_FAILED_CODE =
  "theta/host/session-shutdown-teardown-step-failed";
export const RELOAD_TEARDOWN_TIMEOUT_CODE = "theta/runtime/reload-teardown-timeout";
export const CANCELLED_BY_SESSION_SHUTDOWN_CODE =
  "theta/runtime/cancelled-by-session-shutdown";
export const RUNTIME_DEGRADED_CODE = "theta/host/session-shutdown-runtime-degraded";

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
  4: ["discoveryWatcher.close", "settingsWatcher.close", "Clock.clearTimeout(debounce)"],
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
  readonly label:
    | "ctx.signal.removeEventListener"
    | "toolSignal.removeEventListener"
    | "parentInvokeSignal.removeEventListener";
  removeEventListener(): void;
}

/**
 * The teardown-time `console.error` sink and its serialisation primitive, both
 * injected so the emission-isolation tests can drive a throwing sink / throwing
 * serialiser (PIC-24/25/27).
 */
export interface EmissionSink {
  /** The teardown-time `console.error` seam (single serialised argument). */
  emit(line: unknown): void;
  /** The leaf-owned serialisation primitive (e.g. `JSON.stringify`). */
  serialise(diagnostic: Diagnostic): string;
}

/**
 * The teardown-aware hot-reload debouncer sub-step 4 quiesces (PIC-57). The
 * handler marks it torn-down so no *new* watcher-driven rebuild starts, then
 * awaits `whenIdle()` so an already-in-flight rebuild completes (or no-ops)
 * against the still-live `ctx` before the handler returns and Pi invalidates the
 * runtime. `whenIdle` takes an optional cap purely for label symmetry with the
 * closed-set `details.call: "debouncer.whenIdle(awaitCap)"`; the handler bounds
 * the await itself against the shared deadline rather than passing a budget in.
 */
export interface TeardownAwareDebouncer {
  markTornDown(): void;
  whenIdle(awaitCapMs?: number): Promise<void>;
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
  /** The injected `SDK_SURFACE_INVENTORY` the unknown-reason rule reads (V9h). */
  readonly inventory: readonly { readonly kind: string; readonly path?: string; readonly literals?: unknown }[] | undefined;
  readonly sink: EmissionSink;
}

// --- Behaviour-bearing seams (V9g-T stubs; V9g fills in) ---

/**
 * Synthesise the CNCL-4 abort reason: a JavaScript `Error` whose `message` is
 * byte-exact `"theta cancelled by session shutdown"`, propagated so that
 * `thetaAbort.signal.reason === source.reason` is observable downstream.
 *
 * V9g-T stub: returns a placeholder `Error` so the CNCL-4 message-and-identity
 * assertions red on their primary check (the paired V9g synthesises the pinned
 * reason).
 */
export function synthesiseSessionShutdownReason(): Error {
  return new Error(SESSION_SHUTDOWN_ABORT_MESSAGE);
}

/**
 * Coerce a caught throw to its underlying string per the diagnostics
 * underlying-error coercion (placeholder-rendering-b.md #underlying-error-
 * coercion): an object with a string `.message` yields that message; otherwise
 * `String(error)`, falling back to the literal `"<unreadable>"` when either the
 * `.message` access or the `String(...)` coercion itself throws (the same
 * `"<unreadable>"` convention `session-shutdown-reason-unknown`'s
 * `details.observed` applies, per the **Per-step isolation** paragraph).
 */
function coerceUnderlyingError(error: unknown): string {
  try {
    if (typeof error === "object" && error !== null) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string") {
        return message;
      }
    }
  } catch (messageError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
    void messageError;
  }
  try {
    return String(error);
  } catch (coerceError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
    void coerceError;
    return "<unreadable>";
  }
}

/**
 * Coerce the handler-captured `event.reason` to the stamped string. A closed-set
 * member reads as itself; a non-string reason is `String(...)`-coerced, falling
 * back to `"<unreadable>"` if that coercion throws. The full four-arm
 * Unknown-reason routing (set-membership, snapshot read, the two diagnostics) is
 * owned by `V9h`; this handler only needs the stamped-string channel sub-step 2
 * writes onto each entry's `shutdownReason`.
 */
function coerceReasonString(reason: unknown): string {
  if (typeof reason === "string") {
    return reason;
  }
  try {
    return String(reason);
  } catch (coerceError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
    void coerceError;
    return "<unreadable>";
  }
}

/**
 * Build the `theta/host/session-shutdown-teardown-step-failed` (W, runtime)
 * diagnostic for a caught per-step throw, carrying
 * `details: { step, call, error }` (session-shutdown-semantics.md
 * **Per-step isolation**; diagnostics/code-registry-host.md).
 *
 * V9g-T stub: returns a placeholder diagnostic so the DIAG-1 host-row shape
 * assertions red on their primary check.
 */
export function teardownStepFailedDiagnostic(
  step: TeardownStep,
  call: string,
  error: unknown,
): Diagnostic {
  const errorString = coerceUnderlyingError(error);
  return {
    severity: "warning",
    code: TEARDOWN_STEP_FAILED_CODE,
    message: `session_shutdown teardown step ${step} failed at ${call}: ${errorString}`,
    details: { step, call, error: errorString },
  };
}

/**
 * Build the per-invocation `theta/runtime/cancelled-by-session-shutdown` (E,
 * runtime) note with `display: false` and the nested
 * `details.event: { reason, theta, invocation_id }` shape
 * (diagnostics/diagnostic-shape.md session-shutdown-details-conventions).
 *
 * V9g-T stub: returns a placeholder diagnostic so the shape assertions red.
 */
export function cancelledBySessionShutdownDiagnostic(
  entry: ActiveInvocationEntry,
): Diagnostic {
  // The per-invocation `finally` reads `entry.shutdownReason` (stamped by
  // sub-step 2) rather than re-reading the handler-scoped `event.reason`; an
  // unset field falls back to the `"<unreadable>"` sentinel per the residual-gap
  // paragraph. `details.event` is the runtime-constructed nested shape.
  const reason = entry.shutdownReason ?? "<unreadable>";
  return {
    severity: "error",
    code: CANCELLED_BY_SESSION_SHUTDOWN_CODE,
    message: `theta /${entry.theta} cancelled by session shutdown (${reason})`,
    details: {
      event: {
        reason,
        theta: entry.theta,
        invocation_id: entry.invocationId,
      },
    },
  };
}

/**
 * Build the `theta/runtime/reload-teardown-timeout` (E, runtime) diagnostic at
 * the sub-step 3 cap: the message names each still-in-flight entry as
 * `/<slash-name>:<invocation-id>` (insertion order, `, `-joined), and `hint`
 * carries the *elapsed* wall time (diagnostics/code-registry-runtime.md).
 *
 * V9g-T stub: returns a placeholder diagnostic so the shape assertions red.
 */
export function reloadTeardownTimeoutDiagnostic(
  stillInFlight: readonly ActiveInvocationEntry[],
  elapsedMs: number,
): Diagnostic {
  // `<list>` is the `, `-joined `/<slash-name>:<invocation-id>` sequence in
  // insertion order; `<ms>` renders the elapsed wall time and `hint` carries the
  // same value as a bare decimal integer (code-registry-runtime.md).
  const list = stillInFlight
    .map((entry) => `/${entry.theta}:${entry.invocationId}`)
    .join(", ");
  const count = stillInFlight.length;
  return {
    severity: "error",
    code: RELOAD_TEARDOWN_TIMEOUT_CODE,
    message: `reload teardown timed out after ${elapsedMs}ms; ${count} invocation(s) still in flight: ${list}`,
    hint: String(elapsedMs),
  };
}

/**
 * Emit a flat-`details` teardown-handler diagnostic through the wrapped
 * serialisation-and-emission sequence: the serialiser call feeding the
 * `console.error` call, the whole wrapped in one `try`/`catch` (PIC-24); on a
 * serialiser throw the catch arm emits the bare-`code` string (PIC-25); a throw
 * out of `console.error` is swallowed (PIC-27) and the count is measured at the
 * invocation site (PIC-28).
 *
 * V9g-T stub: does nothing, so the "emits the serialised payload" / "falls back
 * to bare code" / "swallows a sink throw" assertions red on their primary
 * `sink.emit`-spy checks.
 */
export function emitTeardownDiagnostic(
  sink: EmissionSink,
  diagnostic: Diagnostic,
): void {
  // The whole serialisation-and-emission sequence is one wrapped `try`/`catch`
  // (PIC-24). On a serialiser throw the catch arm emits the bare-`code` string
  // so it stays grep-able (PIC-25); a throw out of `console.error` is swallowed
  // with no retry (PIC-27) — `serialiseOk` distinguishes the two so a failed
  // emit does not trigger a second bare-`code` emission (invocation-site count,
  // PIC-28).
  let serialiseOk = false;
  try {
    const line = sink.serialise(diagnostic);
    serialiseOk = true;
    sink.emit(line);
  } catch (emitError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/diagnostic-emission-isolation.md
    void emitError;
    if (!serialiseOk) {
      try {
        sink.emit(diagnostic.code);
      } catch (fallbackError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/diagnostic-emission-isolation.md
        void fallbackError;
      }
    }
  }
}

/** The nested-shape emission's `details.event` reason + optional `entry`. */
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

/**
 * Emit a nested-shape teardown-handler diagnostic (`runtime-degraded` /
 * `cancelled-by-session-shutdown`). On a serialiser throw the catch arm emits
 * the two-token `` `${code} ${detailsEventReason}` `` form, or the three-token
 * `` `${code} ${entry.theta} <unreadable>` `` form for the per-invocation note
 * (PIC-25). A throw out of the payload-construction site is caught by a
 * dedicated self-wrap that emits the `` `${code} <unreadable>` `` /
 * `` `${code} ${entry.theta} <unreadable>` `` fallback and swallows an inner
 * `console.error` throw (PIC-26/27). Count is invocation-site framed (PIC-28).
 *
 * V9g-T stub: does nothing, so the fallback-form assertions red on their
 * primary `sink.emit`-spy checks.
 */
export function emitNestedShapeDiagnostic(
  sink: EmissionSink,
  emission: NestedShapeEmission,
): void {
  const { code, diagnostic, detailsEventReason, entry, forceConstructionThrow } =
    emission;

  // Construction-site wrap (PIC-26): the `details.event` construction and the
  // `detailsEventReason` hoist run *before* the serialisation-and-emission wrap
  // and are therefore not defended by it. A throw here skips the structured
  // sequence and emits a per-code fallback — the three-token
  // `${code} ${entry.theta} <unreadable>` form for the per-invocation note, else
  // the two-token `${code} <unreadable>` form — self-wrapped so an inner
  // `console.error` throw is swallowed with no second emission (PIC-26/27).
  try {
    if (forceConstructionThrow === true) {
      throw new Error("session-shutdown payload construction failed");
    }
  } catch (constructionError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/diagnostic-emission-isolation.md
    void constructionError;
    const fallback =
      entry !== undefined
        ? `${code} ${entry.theta} <unreadable>`
        : `${code} <unreadable>`;
    try {
      sink.emit(fallback);
    } catch (fallbackError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/diagnostic-emission-isolation.md
      void fallbackError;
    }
    return;
  }

  // Wrapped serialisation-and-emission sequence (PIC-24/25/27): on a serialiser
  // throw the catch arm emits the two-token `${code} ${detailsEventReason}` form
  // — preserving the `details.event.reason` dedup discriminator — for both
  // nested-shape codes; a throw out of `console.error` is swallowed with no
  // retry.
  let serialiseOk = false;
  try {
    const line = sink.serialise(diagnostic);
    serialiseOk = true;
    sink.emit(line);
  } catch (emitError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/diagnostic-emission-isolation.md
    void emitError;
    if (!serialiseOk) {
      try {
        sink.emit(`${code} ${detailsEventReason}`);
      } catch (fallbackError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/diagnostic-emission-isolation.md
        void fallbackError;
      }
    }
  }
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
 *
 * V9g-T stub: does nothing (returns a resolved promise), so the spy-based
 * per-sub-step / isolation / cap / abort-reason assertions red on their primary
 * checks. The paired V9g implementation orchestrates the sequence.
 */
export async function runSessionShutdown(
  event: SessionShutdownEventLike,
  deps: SessionShutdownDeps,
): Promise<void> {
  const capturedReason = coerceReasonString(event.reason);

  // ── Sub-step 1: stop accepting new work (drain, then init drain-state tag) ──
  // Fixed order — `drain()` then `initDrainStateTag()` — each in its own
  // per-call `try`/`catch` so a throw from either routes to a distinct
  // `(code, details.step, details.call)` bucket and does not stop the other.
  runIsolatedCall(1, "thetaRegistry.drain", deps.sink, () => {
    deps.registry.drain();
  });
  runIsolatedCall(1, "thetaRegistry.initDrainStateTag", deps.sink, () => {
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
  runIsolatedCall(4, "discoveryWatcher.close", deps.sink, () => {
    deps.discoveryWatcher.close();
  });
  runIsolatedCall(4, "settingsWatcher.close", deps.sink, () => {
    deps.settingsWatcher.close();
  });
  runIsolatedCall(4, "Clock.clearTimeout(debounce)", deps.sink, () => {
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
      emitTeardownDiagnostic(
        deps.sink,
        teardownStepFailedDiagnostic(4, "debouncer.whenIdle(awaitCap)", quiesceError),
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
    emitTeardownDiagnostic(sink, teardownStepFailedDiagnostic(3, "Clock.now()", nowError));
    armed = false;
  }
  // The shared absolute deadline sub-step 4's PIC-57 quiesce reuses for its
  // bound; `undefined` when the deadline could not be captured (degrade-to-skip).
  const deadline = armed ? start + SHUTDOWN_AWAIT_CAP_MS : undefined;

  let timerHandle: TimerHandle | undefined;
  let timerFired = false;
  let resolveRace: () => void = (): void => {};
  const race = new Promise<void>((resolve) => {
    resolveRace = resolve;
  });

  if (armed) {
    try {
      timerHandle = clock.setTimeout(() => {
        timerFired = true;
        resolveRace();
      }, SHUTDOWN_AWAIT_CAP_MS);
    } catch (setError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
      emitTeardownDiagnostic(
        sink,
        teardownStepFailedDiagnostic(3, "Clock.setTimeout(awaitCap)", setError),
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
  runIsolatedCall(3, "Clock.clearTimeout(awaitCap)", sink, () => {
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
 * teardown-step-failed). The bounding timer is always cleared so a resolved
 * quiesce does not leak a timer onto the about-to-be-invalidated runtime.
 */
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
