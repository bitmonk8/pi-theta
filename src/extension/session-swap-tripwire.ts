// V9r / V9r-T — the session-swap fail-fast tripwire that replaces the retired
// session-only degraded-state branch.
//
// Under the recorded `governed-by-rebind` determination the session-only
// reasons (`"new"`/`"resume"`/`"fork"`) run the same full teardown as
// `"quit"`/`"reload"` (no `markRuntimeDegraded`, no `"degraded-needs-reload"`
// tag, no `session-shutdown-runtime-degraded` emission, no degraded slash note),
// and the teardown handler additionally ARMS a private per-extension-instance
// tripwire on the closed-over `ThetaRegistry`. Every theta-registered slash
// `handler` (at entry) and the `session_start` handler read that tripwire and,
// if it is ever observed armed — the exact behaviour `governed-by-rebind` proves
// does not occur — emit one `theta/host/session-swap-instance-survived` (E,
// runtime) diagnostic via `console.error` and fail-fast-terminate the process
// (the NFR-2.1 "let crash" path). The tripwire is dormant on every conformant Pi
// minor (a disposed instance never dispatches; a fresh instance carries an
// unarmed registry).
//
// Spec: pi-integration-contract/session-only-degraded-state.md (§Session-swap
// fail-fast tripwire — governed-by-rebind resolution), host-prerequisites.md
// (clause (a) `governed-by-rebind`, clauses (b)/(d)), drain-state-contract.md,
// diagnostics/code-registry-host.md (the `theta/host/session-swap-instance-
// survived` row), diagnostics/diagnostic-emission-isolation.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { ThetaRegistry, SessionOnlyReason } from "./reload-wiring";
import { type EmissionSink, emitTeardownDiagnostic } from "./session-shutdown";

/**
 * The diagnostics-registry code the tripwire trip emits (E, runtime), sourced
 * verbatim from diagnostics/code-registry-host.md.
 */
export const SESSION_SWAP_INSTANCE_SURVIVED_CODE =
  "theta/host/session-swap-instance-survived";

/**
 * The closed session-only `event.reason` half of the `session_shutdown`
 * partition (host-prerequisites clause (d)) — the reasons that arm the tripwire.
 */
export const SESSION_ONLY_REASONS = ["new", "resume", "fork"] as const;

/**
 * Whether `reason` is a session-only reason (`"new"`/`"resume"`/`"fork"`) — the
 * arming half of the teardown-vs-session-swap partition. A pure predicate the
 * arming decision keys on; implemented (not behaviour under test).
 */
export function isSessionOnlyReason(reason: string): reason is SessionOnlyReason {
  return (SESSION_ONLY_REASONS as readonly string[]).includes(reason);
}

/**
 * The fail-fast terminator seam: the NFR-2.1 `Environment.FailFast`-equivalent
 * "let crash" path. Injected so the tripwire tests can observe termination
 * without ending the test process; `terminate()` does not return (control never
 * flows past the trip), modelled in tests by a throwing fake.
 */
export interface FailFastTerminator {
  terminate(): never;
}

/**
 * The production `FailFastTerminator`: `process.exit(1)`, the NFR-2.1
 * `Environment.FailFast`-equivalent "let crash" path (mirrors
 * `createProductionEmissionSink` in session-shutdown.ts). The trip has proven
 * the host violated the teardown-and-rebind lifecycle the
 * `governed-by-rebind` resolution rests on, so the only correct posture is to
 * crash rather than run any further logic past a proven-false premise —
 * `process.exit`'s `never` return type already forces callers to treat this
 * as non-returning, so the body needs no explicit `return`.
 */
export function createProductionFailFastTerminator(): FailFastTerminator {
  return {
    terminate: (): never => {
      process.exit(1);
    },
  };
}

/** Collaborators for the trip-site guard. */
export interface TripwireGuardDeps {
  /** The closed-over `ThetaRegistry` the tripwire flag lives on (V9m). */
  readonly registry: ThetaRegistry;
  /** The teardown-time `console.error` sink (reused from the V9g emission seam). */
  readonly sink: EmissionSink;
  /** The NFR-2.1 fail-fast terminator invoked immediately after the emission. */
  readonly terminator: FailFastTerminator;
}

/**
 * Build the `theta/host/session-swap-instance-survived` (E, runtime) diagnostic
 * carrying `details: { event: { reason } }` with the armed session-only reason
 * (diagnostics/code-registry-host.md; the message is the registry *Message*
 * column with `<reason>` interpolated).
 *
 * The message is the registry *Message* column with `<reason>` interpolated
 * (diagnostics/code-registry-host.md; sourced verbatim).
 */
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

/**
 * The arming decision the `session_shutdown` teardown handler runs after
 * completing teardown: on a session-only `capturedEventReason` arm the private
 * `sessionSwapTornDown` tripwire on the closed-over `ThetaRegistry` (idempotently,
 * host-prerequisites clause (b)); on any other reason do nothing. This does NOT
 * write a drain-state degraded tag, perform a `markRuntimeDegraded` transition,
 * or emit `theta/host/session-shutdown-runtime-degraded` — the session-only
 * degraded-state branch is retired (governed-by-rebind).
 *
 * On any non-session-only reason (`"quit"`/`"reload"`, or an unknown coerced
 * reason string) the tripwire stays unarmed.
 */
export function armSessionSwapTripwireForReason(
  registry: ThetaRegistry,
  capturedEventReason: string,
): void {
  if (isSessionOnlyReason(capturedEventReason)) {
    registry.armSessionSwapTornDown(capturedEventReason);
  }
}

/**
 * The trip-site guard every theta-registered slash `handler` (at entry, before
 * any dispatch or `readDrainState` branch) and the `session_start` handler run:
 * read `sessionSwapTornDown`; if armed, emit exactly one
 * `theta/host/session-swap-instance-survived` diagnostic via `console.error` and
 * then fail-fast-terminate the process. A no-op (dormant) when the tripwire is
 * unset (the proven governed-by-rebind steady state).
 *
 * Fires only on the ARMED tripwire (the proven governed-by-rebind steady state
 * leaves it dormant): emit exactly one survived diagnostic, then fail-fast-
 * terminate (control does not return past the trip). A no-op when unarmed.
 */
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

/**
 * Wrap a theta-registered slash `handler` / `session_start` body so the trip-site
 * guard runs AT ENTRY, before any dispatch: the guard fail-fast-terminates on an
 * armed tripwire (so `dispatch` never runs past the trip) and is a no-op
 * otherwise, then `dispatch` runs. The Pi-owned `/reload` command is not a
 * theta-registered handler and is never wrapped by this function, so it is not
 * guarded (host-prerequisites clause (c-i)).
 *
 * The guard runs at entry: on an armed tripwire it fail-fast-terminates before
 * `dispatch` is ever called; otherwise it is a no-op and `dispatch` runs.
 */
export function runGuardedSlashHandler<T>(
  deps: TripwireGuardDeps,
  dispatch: () => T,
): T {
  guardSessionSwapTripwire(deps);
  return dispatch();
}
