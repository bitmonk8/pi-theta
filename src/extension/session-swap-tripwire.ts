// V9r / V9r-T — the session-swap fail-fast tripwire that replaces the retired
// session-only degraded-state branch.
//
// Under the recorded `governed-by-rebind` determination the session-only
// reasons (`"new"`/`"resume"`/`"fork"`) run the same full teardown as
// `"quit"`/`"reload"` (no `markRuntimeDegraded`, no `"degraded-needs-reload"`
// tag, no `session-shutdown-runtime-degraded` emission, no degraded slash note),
// and the teardown handler additionally ARMS a private per-extension-instance
// tripwire on the closed-over `LoomRegistry`. Every loom-registered slash
// `handler` (at entry) and the `session_start` handler read that tripwire and,
// if it is ever observed armed — the exact behaviour `governed-by-rebind` proves
// does not occur — emit one `loom/host/session-swap-instance-survived` (E,
// runtime) diagnostic via `console.error` and fail-fast-terminate the process
// (the NFR-2.1 "let crash" path). The tripwire is dormant on every conformant Pi
// minor (a disposed instance never dispatches; a fresh instance carries an
// unarmed registry).
//
// Spec: pi-integration-contract/session-only-degraded-state.md (§Session-swap
// fail-fast tripwire — governed-by-rebind resolution), host-prerequisites.md
// (clause (a) `governed-by-rebind`, clauses (b)/(d)), drain-state-contract.md,
// diagnostics/code-registry-host.md (the `loom/host/session-swap-instance-
// survived` row), diagnostics/diagnostic-emission-isolation.md.
//
// V9r-T (tests-task) declares these seams and stubs the behaviour-bearing
// functions DELIBERATELY NON-COMPLIANTLY so the failing tests compile and red on
// their own primary assertions:
//   - `sessionSwapInstanceSurvivedDiagnostic` returns a SENTINEL diagnostic (not
//     the registry *Message* row / severity / `details.event.reason`);
//   - `armSessionSwapTripwireForReason` is a NO-OP (never arms the registry);
//   - `guardSessionSwapTripwire` is INVERTED (fires on the UNARMED registry and
//     stays dormant on the ARMED one), so both the "fires when armed" and the
//     "dormant when unset" assertions red;
//   - `runGuardedSlashHandler` dispatches WITHOUT guarding (the guard-before-
//     dispatch wiring is absent).
// The paired V9r implementation fills these in. No test reds on a compile error,
// a missing fixture, or a harness throw.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { LoomRegistry, SessionOnlyReason } from "./reload-wiring";
import { type EmissionSink, emitTeardownDiagnostic } from "./session-shutdown";

/**
 * The diagnostics-registry code the tripwire trip emits (E, runtime), sourced
 * verbatim from diagnostics/code-registry-host.md.
 */
export const SESSION_SWAP_INSTANCE_SURVIVED_CODE =
  "loom/host/session-swap-instance-survived";

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

/** Collaborators for the trip-site guard. */
export interface TripwireGuardDeps {
  /** The closed-over `LoomRegistry` the tripwire flag lives on (V9m). */
  readonly registry: LoomRegistry;
  /** The teardown-time `console.error` sink (reused from the V9g emission seam). */
  readonly sink: EmissionSink;
  /** The NFR-2.1 fail-fast terminator invoked immediately after the emission. */
  readonly terminator: FailFastTerminator;
}

/**
 * Build the `loom/host/session-swap-instance-survived` (E, runtime) diagnostic
 * carrying `details: { event: { reason } }` with the armed session-only reason
 * (diagnostics/code-registry-host.md; the message is the registry *Message*
 * column with `<reason>` interpolated).
 *
 * V9r-T stub: returns a SENTINEL diagnostic (wrong severity/code/message/details)
 * so the message-anchor + `details.event.reason` shape assertions red on their
 * primary check. The paired V9r sources the registry *Message* row.
 */
export function sessionSwapInstanceSurvivedDiagnostic(
  reason: SessionOnlyReason,
): Diagnostic {
  void reason;
  return {
    severity: "warning",
    code: "loom/host/session-swap-tripwire-stub",
    message: "session-swap tripwire stub — not yet implemented",
    details: {},
  };
}

/**
 * The arming decision the `session_shutdown` teardown handler runs after
 * completing teardown: on a session-only `capturedEventReason` arm the private
 * `sessionSwapTornDown` tripwire on the closed-over `LoomRegistry` (idempotently,
 * host-prerequisites clause (b)); on any other reason do nothing. This does NOT
 * write a drain-state degraded tag, perform a `markRuntimeDegraded` transition,
 * or emit `loom/host/session-shutdown-runtime-degraded` — the session-only
 * degraded-state branch is retired (governed-by-rebind).
 *
 * V9r-T stub: a NO-OP — never arms the registry, so the "arms on session-only
 * reason" assertions red on their primary check.
 */
export function armSessionSwapTripwireForReason(
  registry: LoomRegistry,
  capturedEventReason: string,
): void {
  void registry;
  void capturedEventReason;
}

/**
 * The trip-site guard every loom-registered slash `handler` (at entry, before
 * any dispatch or `readDrainState` branch) and the `session_start` handler run:
 * read `sessionSwapTornDown`; if armed, emit exactly one
 * `loom/host/session-swap-instance-survived` diagnostic via `console.error` and
 * then fail-fast-terminate the process. A no-op (dormant) when the tripwire is
 * unset (the proven governed-by-rebind steady state).
 *
 * V9r-T stub: DELIBERATELY INVERTED — fires on the UNARMED registry and stays
 * dormant on the ARMED one, so both the "fires when armed" and the "dormant when
 * unset" tests red on their primary assertions. The paired V9r reads the armed
 * flag, emits on the armed path, and terminates.
 */
export function guardSessionSwapTripwire(deps: TripwireGuardDeps): void {
  const state = deps.registry.readSessionSwapTornDown();
  // INVERTED stub: `!state.armed` where the real guard fires on `state.armed`.
  if (!state.armed) {
    emitTeardownDiagnostic(
      deps.sink,
      sessionSwapInstanceSurvivedDiagnostic(state.reason ?? "new"),
    );
    deps.terminator.terminate();
  }
}

/**
 * Wrap a loom-registered slash `handler` / `session_start` body so the trip-site
 * guard runs AT ENTRY, before any dispatch: the guard fail-fast-terminates on an
 * armed tripwire (so `dispatch` never runs past the trip) and is a no-op
 * otherwise, then `dispatch` runs. The Pi-owned `/reload` command is not a
 * loom-registered handler and is never wrapped by this function, so it is not
 * guarded (host-prerequisites clause (c-i)).
 *
 * V9r-T stub: dispatches WITHOUT guarding (the guard-before-dispatch wiring is
 * absent), so the "guards before dispatch / terminates before dispatch"
 * assertions red on their primary check.
 */
export function runGuardedSlashHandler<T>(
  deps: TripwireGuardDeps,
  dispatch: () => T,
): T {
  void deps;
  return dispatch();
}
