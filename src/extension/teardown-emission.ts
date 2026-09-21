// V9g / V9g-T — diagnostic construction and teardown-time console emission
// isolation, shared by the teardown handler and independent emission callers.
// Spec: pi-integration-contract/diagnostic-emission-isolation.md
// (PIC-24/25/26/27/28).

import type { Diagnostic } from "../diagnostics/diagnostic";
import { coerceUnderlyingString } from "../diagnostics/placeholder";
import type { ActiveInvocationEntry } from "../runtime/active-invocation-registry";
import type { TeardownStep } from "./session-shutdown";
import { sendSystemNote, type SystemNoteChannelDeps } from "./system-note-channel";

// --- Diagnostic codes (diagnostics/code-registry-host.md, -runtime.md) ---

export const TEARDOWN_STEP_FAILED_CODE =
  "theta/host/session-shutdown-teardown-step-failed";
export const RELOAD_TEARDOWN_TIMEOUT_CODE = "theta/runtime/reload-teardown-timeout";
export const CANCELLED_BY_SESSION_SHUTDOWN_CODE =
  "theta/runtime/cancelled-by-session-shutdown";
export const RUNTIME_DEGRADED_CODE = "theta/host/session-shutdown-runtime-degraded";

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
 * Build the `theta/host/session-shutdown-teardown-step-failed` (W, runtime)
 * diagnostic for a caught per-step throw, carrying
 * `details: { step, call, error }` (session-shutdown-semantics.md
 * **Per-step isolation**; diagnostics/code-registry-host.md).
 */
export function teardownStepFailedDiagnostic(
  step: TeardownStep,
  call: string,
  error: unknown,
): Diagnostic {
  const errorString = coerceUnderlyingString(error);
  return {
    severity: "warning",
    code: TEARDOWN_STEP_FAILED_CODE,
    message: `session_shutdown teardown step ${step} failed at ${call}: ${errorString}`,
    details: { step, call, error: errorString },
  };
}

/**
 * The per-invocation `finally`'s `entry.shutdownReason` substitution (PIC-25
 * *Hoist obligation* single source of truth): an unset field falls back to the
 * `"<unreadable>"` sentinel per the residual-gap paragraph. Hoisted so
 * `cancelledBySessionShutdownDiagnostic` and the emission wrap below share the
 * one byte-identical read instead of each re-deriving it.
 */
function cancelledBySessionShutdownReason(
  entry: ActiveInvocationEntry,
): string {
  return entry.shutdownReason ?? "<unreadable>";
}

/**
 * Build the per-invocation `theta/runtime/cancelled-by-session-shutdown` (E,
 * runtime) note with `display: false` and the nested
 * `details.event: { reason, theta, invocation_id }` shape
 * (diagnostics/diagnostic-shape.md session-shutdown-details-conventions).
 */
export function cancelledBySessionShutdownDiagnostic(
  entry: ActiveInvocationEntry,
): Diagnostic {
  // The per-invocation `finally` reads `entry.shutdownReason` (stamped by
  // sub-step 2) rather than re-reading the handler-scoped `event.reason`.
  // `details.event` is the runtime-constructed nested shape.
  const reason = cancelledBySessionShutdownReason(entry);
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

/**
 * The PIC-26 construction-site-throw fallback: emit the three-token
 * `${code} ${entry.theta} <unreadable>` form when an entry is held (the
 * per-invocation note), else the two-token `${code} <unreadable>` form —
 * self-wrapped so an inner `console.error` throw is swallowed with no second
 * emission (PIC-26/27). The single implementation both `emitNestedShapeDiagnostic`
 * and `emitCancelledBySessionShutdownNote`'s own construction-throw arm call,
 * per bug 0073's Fix constraint 6.
 */
function emitConstructionSiteFallback(
  sink: EmissionSink,
  code: NestedShapeEmission["code"],
  entry: ActiveInvocationEntry | undefined,
): void {
  const fallback =
    entry !== undefined
      ? `${code} ${entry.theta} <unreadable>`
      : `${code} <unreadable>`;
  try {
    sink.emit(fallback);
  } catch (fallbackError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/diagnostic-emission-isolation.md
    void fallbackError;
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
 * the two-token `` `${code} ${detailsEventReason}` `` form, for both
 * nested-shape codes (PIC-25). A throw out of the payload-construction site is caught by a
 * dedicated self-wrap that emits the `` `${code} <unreadable>` `` /
 * `` `${code} ${entry.theta} <unreadable>` `` fallback and swallows an inner
 * `console.error` throw (PIC-26/27). Count is invocation-site framed (PIC-28).
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
  // sequence and emits a per-code fallback via the single shared fallback
  // builder (bug 0073 — one implementation of the fallback forms, not a second
  // parallel one).
  try {
    if (forceConstructionThrow === true) {
      throw new Error("session-shutdown payload construction failed");
    }
  } catch (constructionError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/diagnostic-emission-isolation.md
    void constructionError;
    emitConstructionSiteFallback(sink, code, entry);
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
 * The dependencies `emitCancelledBySessionShutdownNote` needs to deliver the
 * per-invocation note: the `sendSystemNote` channel deps (bug 0073's producer
 * caller supplies its own `pi` / `emitDiagnostic` / no-op `ui` adapter) and the
 * structured-console `EmissionSink` `emitNestedShapeDiagnostic` writes through.
 */
export interface CancelledBySessionShutdownDeps {
  readonly channel: SystemNoteChannelDeps;
  readonly sink: EmissionSink;
}

/**
 * Emit the per-invocation `theta/runtime/cancelled-by-session-shutdown` row on
 * BOTH channels the spec requires (session-shutdown-semantics.md §"Per-invocation
 * operator visibility (clean-cancel path)"): the structured console row through
 * `emitNestedShapeDiagnostic` (diagnostic-emission-isolation.md site class (b)),
 * then the `theta-system-note` through `sendSystemNote`. This is the single
 * production caller of `cancelledBySessionShutdownDiagnostic` /
 * `emitNestedShapeDiagnostic` (bug 0073).
 *
 * The construction wrap (PIC-25/26) runs first: on a throw building the
 * diagnostic or hoisting `detailsEventReason`, delegate to the SAME fallback
 * builder `emitNestedShapeDiagnostic` uses (Fix constraint 6 — one
 * implementation of the fallback forms) and return without attempting either
 * delivery.
 *
 * Order is deliberate: the console row is fully self-wrapped and cannot unwind
 * this call, while the note MAY rethrow on an invalidated runtime (PIC-67
 * clause (c) via `sendSystemNote`) — running the console row first guarantees
 * it lands even when the note's rethrow propagates out of the caller's
 * `finally`.
 */
export function emitCancelledBySessionShutdownNote(
  entry: ActiveInvocationEntry,
  deps: CancelledBySessionShutdownDeps,
): void {
  let diagnostic: Diagnostic;
  let detailsEventReason: string;
  try {
    diagnostic = cancelledBySessionShutdownDiagnostic(entry);
    detailsEventReason = cancelledBySessionShutdownReason(entry);
  } catch (constructionError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/diagnostic-emission-isolation.md
    void constructionError;
    emitConstructionSiteFallback(deps.sink, CANCELLED_BY_SESSION_SHUTDOWN_CODE, entry);
    return;
  }

  emitNestedShapeDiagnostic(deps.sink, {
    code: CANCELLED_BY_SESSION_SHUTDOWN_CODE,
    diagnostic,
    detailsEventReason,
    entry,
  });

  // The channel partition (runtime-event-channel.md) keys the clean-cancel
  // note's OUTER `CustomMessage.details` under `shutdown`: presenting `event`
  // without a `RuntimeEvent` would select the runtime-event arm and validate as
  // nothing (bug 0432). The `{ reason, theta, invocation_id }` object is read
  // off the builder's OWN diagnostic — never re-derived, never spread — so the
  // builder stays the single construction site (diagnostic-shape.md Runtime
  // construction obligation); the console-row twin keeps `details.event`.
  const shutdown = (diagnostic.details as { readonly event: Record<string, unknown> })
    .event;
  sendSystemNote(
    { content: diagnostic.message, display: false, details: { shutdown } },
    deps.channel,
  );
}

/**
 * The production teardown-time `console.error` sink factory (bug 0073): a
 * plain `EmissionSink` over `console.error` / `JSON.stringify`, so the
 * producer INJECTS this rather than inlining an equivalent literal at each of
 * its two call sites.
 */
export function createProductionEmissionSink(): EmissionSink {
  return {
    emit: (line: unknown): void => {
      console.error(line);
    },
    serialise: (diagnostic: Diagnostic): string => JSON.stringify(diagnostic),
  };
}
