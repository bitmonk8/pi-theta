// V9r-T — failing tests for the session-swap fail-fast tripwire (paired V9r
// implementation leaf).
//
// Spec:
//   pi-integration-contract/session-only-degraded-state.md
//     — §Session-swap fail-fast tripwire (governed-by-rebind resolution): the
//       session-only reasons run the SAME full five-sub-step teardown as
//       {"quit","reload"} with NO `markRuntimeDegraded`, NO
//       `"degraded-needs-reload"` tag, NO `session-shutdown-runtime-degraded`
//       emission and NO degraded slash note; the teardown arms the private
//       per-extension-instance `sessionSwapTornDown` tripwire; every loom-
//       registered slash handler (at entry) and `session_start` reads it and,
//       when armed, emits one `session-swap-instance-survived` row and fail-
//       fast-terminates; dormant (no-op) when unset; arming idempotent under
//       multi-`session_shutdown` delivery; the Pi-owned `/reload` is not
//       guarded;
//   pi-integration-contract/host-prerequisites.md clause (a) (governed-by-
//     rebind), (b) (multi-delivery / idempotent re-arm), (c-i) (/reload not
//     guarded), (d) (session-only reason partition);
//   diagnostics/code-registry-host.md — the `loom/host/session-swap-instance-
//     survived` (E, runtime) row: emitted via `console.error` exactly once at
//     the trip site, `details: { event: { reason } }`, immediately followed by
//     process termination.
//
// Each test cites its `cka-27` code-keyed-area token / registry code inline per
// the conventions.md REQ-ID-discipline and Diagnostic-message-anchor rules.
// Every assertion is on an observable side effect (the tripwire snapshot, a spy
// on an injected `console.error` sink, the fail-fast terminator, or an emitted
// diagnostic's fields) and reds on its own primary assertion while V9r is
// absent: the V9r-T seam stubs are deliberately non-compliant (the diagnostic
// builder is a sentinel; the arming decision is a no-op; the guard is inverted;
// the guarded-handler wrapper does not guard).

import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "./helpers/fake-clock";
import {
  ActiveInvocationRegistry,
  type ActiveInvocationEntry,
} from "../src/runtime/active-invocation-registry";
import { LoomRegistry } from "../src/extension/reload-wiring";
import { SESSION_SHUTDOWN_REASON_SNAPSHOT } from "../src/extension/version-bump-gates";
import {
  runSessionShutdown,
  RUNTIME_DEGRADED_CODE,
  type EmissionSink,
  type SessionShutdownDeps,
  type SessionShutdownEventLike,
} from "../src/extension/session-shutdown";
import {
  armSessionSwapTripwireForReason,
  guardSessionSwapTripwire,
  isSessionOnlyReason,
  runGuardedSlashHandler,
  sessionSwapInstanceSurvivedDiagnostic,
  SESSION_ONLY_REASONS,
  SESSION_SWAP_INSTANCE_SURVIVED_CODE,
  type FailFastTerminator,
  type TripwireGuardDeps,
} from "../src/extension/session-swap-tripwire";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// --- registry *Message* column template (with `<reason>` filled) ------------

const survivedMessage = (reason: string): string =>
  `extension instance survived a session-only session_shutdown (reason: ${reason}); Pi lifecycle contract violated \u2014 terminating`;

// --- shared harness helpers -------------------------------------------------

/** An injected `console.error` sink spy (serialise-then-emit, per V9g). */
function sinkSpy(): EmissionSink & {
  emit: ReturnType<typeof vi.fn>;
  serialise: ReturnType<typeof vi.fn>;
} {
  return {
    emit: vi.fn((line: unknown) => {
      void line;
    }),
    serialise: vi.fn((diagnostic: Diagnostic) => JSON.stringify(diagnostic)),
  };
}

/**
 * A fail-fast terminator fake: records the call and throws a sentinel so control
 * does not flow past the trip (modelling the NFR-2.1 `Environment.FailFast`
 * "let crash" — the real terminator never returns).
 */
class FailFastSignal extends Error {}

function terminatorSpy(): FailFastTerminator & { terminate: ReturnType<typeof vi.fn> } {
  return {
    terminate: vi.fn((): never => {
      throw new FailFastSignal("fail-fast terminate");
    }),
  };
}

function guardDeps(registry: LoomRegistry): TripwireGuardDeps & {
  sink: ReturnType<typeof sinkSpy>;
  terminator: ReturnType<typeof terminatorSpy>;
} {
  const sink = sinkSpy();
  const terminator = terminatorSpy();
  return { registry, sink, terminator };
}

/** Count `console.error` emissions naming the survived code. */
function survivedEmits(sink: ReturnType<typeof sinkSpy>): unknown[][] {
  return sink.emit.mock.calls.filter((call) =>
    String(call[0]).includes(SESSION_SWAP_INSTANCE_SURVIVED_CODE),
  );
}

// --- session_shutdown teardown harness (for the arming integration test) ----

function makeEntry(loom: string, invocationId: string): ActiveInvocationEntry {
  return {
    loomAbort: new AbortController(),
    // A never-settling barrier so sub-step 3's bounded await is exercised.
    disposeBarrier: new Promise<void>(() => {}),
    shutdownReason: undefined,
    loom,
    invocationId,
  };
}

interface ShutdownHarness {
  readonly deps: SessionShutdownDeps;
  readonly registry: LoomRegistry;
  readonly clock: FakeClock;
  readonly sink: ReturnType<typeof sinkSpy>;
}

function makeShutdownHarness(): ShutdownHarness {
  const registry = new LoomRegistry();
  const activeInvocations = new ActiveInvocationRegistry();
  const clock = new FakeClock();
  const sink = sinkSpy();
  const deps: SessionShutdownDeps = {
    registry,
    activeInvocations,
    clock,
    discoveryWatcher: { close: vi.fn() },
    settingsWatcher: { close: vi.fn() },
    debounceHandle: clock.setTimeout(() => {}, 250),
    forwardingSignals: [],
    inventory: [
      {
        kind: "type-union-snapshot",
        path: "SessionShutdownEvent.reason",
        literals: [...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals],
      },
    ],
    sink,
  };
  return { deps, registry, clock, sink };
}

const eventWith = (reason: unknown): SessionShutdownEventLike => ({ reason });

/** Drive a teardown to completion even when sub-step 3 never settles. */
async function driveShutdown(
  event: SessionShutdownEventLike,
  harness: ShutdownHarness,
): Promise<void> {
  const done = runSessionShutdown(event, harness.deps);
  harness.clock.advance(2000 + 3);
  await done;
}

// ============================================================================
// cka-27 — arming: session-only teardown arms the tripwire (no degraded branch)
// ============================================================================

describe("cka-27 — arming the session-swap tripwire", () => {
  it("cka-27: arms sessionSwapTornDown for each session-only reason and records the reason", () => {
    // The arming half of the partition (host-prerequisites clause (d)): the
    // three session-only reasons arm the private tripwire and record the reason.
    for (const reason of SESSION_ONLY_REASONS) {
      const registry = new LoomRegistry();
      armSessionSwapTripwireForReason(registry, reason);
      const state = registry.readSessionSwapTornDown();
      expect(state.armed).toBe(true);
      expect(state.reason).toBe(reason);
    }
  });

  it("cka-27: does NOT arm the tripwire for the always-tear-down reasons quit / reload", () => {
    for (const reason of ["quit", "reload"]) {
      const registry = new LoomRegistry();
      armSessionSwapTripwireForReason(registry, reason);
      expect(registry.readSessionSwapTornDown().armed).toBe(false);
    }
  });

  it("cka-27: isSessionOnlyReason classifies the partition halves", () => {
    // The arming predicate keys on the two-way partition, not merely the closed
    // set of five reasons (host-prerequisites clause (d)).
    expect(isSessionOnlyReason("new")).toBe(true);
    expect(isSessionOnlyReason("resume")).toBe(true);
    expect(isSessionOnlyReason("fork")).toBe(true);
    expect(isSessionOnlyReason("quit")).toBe(false);
    expect(isSessionOnlyReason("reload")).toBe(false);
  });

  it("cka-27: on a session-only session_shutdown the handler runs full teardown, arms the tripwire, and writes NO degraded branch", async () => {
    const harness = makeShutdownHarness();
    const drainSpy = vi.spyOn(harness.registry, "drain");
    const degradeSpy = vi.spyOn(harness.registry, "markRuntimeDegraded");
    harness.deps.activeInvocations.add(makeEntry("plan", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));

    await driveShutdown(eventWith("new"), harness);

    // Primary assertion: the full teardown arms the tripwire on the closed-over
    // registry (this reds while the arming wiring is absent).
    const state = harness.registry.readSessionSwapTornDown();
    expect(state.armed).toBe(true);
    expect(state.reason).toBe("new");
    // The SAME full five-sub-step teardown runs as {"quit","reload"}: drain ran,
    // and sub-step 4 closed the watchers.
    expect(drainSpy).toHaveBeenCalledTimes(1);
    expect(harness.deps.discoveryWatcher.close).toHaveBeenCalledTimes(1);
    // NO degraded branch: no `markRuntimeDegraded` transition, no
    // `"degraded-needs-reload"` tag, and no `session-shutdown-runtime-degraded`
    // emission.
    expect(degradeSpy).not.toHaveBeenCalled();
    expect(harness.registry.readDrainState().tag).not.toBe("degraded-needs-reload");
    const degradedEmits = harness.sink.emit.mock.calls.filter((call) =>
      String(call[0]).includes(RUNTIME_DEGRADED_CODE),
    );
    expect(degradedEmits.length).toBe(0);
  });
});

// ============================================================================
// cka-27 — the tripwire fires: an armed guard emits once and fail-fast-terminates
// ============================================================================

describe("cka-27 — the tripwire fires on an armed instance", () => {
  it("cka-27 (fires): a guard against an armed tripwire emits exactly one survived row then terminates", () => {
    const registry = new LoomRegistry();
    registry.armSessionSwapTornDown("resume");
    const deps = guardDeps(registry);

    // The armed guard fail-fast-terminates (control does not return): the fake
    // terminator throws the sentinel.
    expect(() => guardSessionSwapTripwire(deps)).toThrow(FailFastSignal);
    // Exactly one `session-swap-instance-survived` emission at the trip site.
    expect(survivedEmits(deps.sink).length).toBe(1);
    // The termination follows the emission (fail-fast path).
    expect(deps.terminator.terminate).toHaveBeenCalledTimes(1);
  });

  it("cka-27 (fires): the survived emission precedes the fail-fast termination", () => {
    const registry = new LoomRegistry();
    registry.armSessionSwapTornDown("fork");
    const order: string[] = [];
    const sink = sinkSpy();
    sink.emit.mockImplementation((line: unknown) => {
      if (String(line).includes(SESSION_SWAP_INSTANCE_SURVIVED_CODE)) {
        order.push("emit");
      }
    });
    const terminator: FailFastTerminator = {
      terminate: ((): never => {
        order.push("terminate");
        throw new FailFastSignal("fail-fast");
      }) as () => never,
    };
    expect(() => guardSessionSwapTripwire({ registry, sink, terminator })).toThrow(
      FailFastSignal,
    );
    expect(order).toStrictEqual(["emit", "terminate"]);
  });
});

// ============================================================================
// cka-27 — no false positive: dormant when unset, idempotent, /reload unguarded
// ============================================================================

describe("cka-27 — no false positive (dormant governed-by-rebind steady state)", () => {
  it("cka-27 (dormant): a guard against a fresh, unarmed registry emits nothing and never terminates", () => {
    // The proven rebind carries a fresh instance with an unarmed registry, so
    // the guard is a no-op: no emission, no termination, no throw.
    const registry = new LoomRegistry();
    const deps = guardDeps(registry);
    expect(() => guardSessionSwapTripwire(deps)).not.toThrow();
    expect(survivedEmits(deps.sink).length).toBe(0);
    expect(deps.terminator.terminate).not.toHaveBeenCalled();
  });

  it("cka-27 (idempotent): a multi-session_shutdown re-arm fires exactly one row on a single guard", () => {
    // Arming is idempotent under a permitted multi-`session_shutdown` delivery
    // to one instance (host-prerequisites clause (b)): re-arming does not make
    // the guard fire more than once.
    const registry = new LoomRegistry();
    registry.armSessionSwapTornDown("new");
    registry.armSessionSwapTornDown("new");
    const state = registry.readSessionSwapTornDown();
    expect(state.armed).toBe(true);
    expect(state.reason).toBe("new");
    const deps = guardDeps(registry);
    expect(() => guardSessionSwapTripwire(deps)).toThrow(FailFastSignal);
    expect(survivedEmits(deps.sink).length).toBe(1);
  });

  it("cka-27 (slash entry): the guard runs at handler entry, BEFORE any dispatch, and terminates before it on an armed tripwire", () => {
    const registry = new LoomRegistry();
    registry.armSessionSwapTornDown("new");
    const deps = guardDeps(registry);
    const dispatch = vi.fn(() => "dispatched");
    // The armed guard fail-fast-terminates at entry, so `dispatch` never runs.
    expect(() => runGuardedSlashHandler(deps, dispatch)).toThrow(FailFastSignal);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("cka-27 (session_start): the session_start guard also terminates before its body on an armed tripwire", () => {
    // The `session_start` handler runs the same trip-site guard as a loom slash
    // handler; both call `runGuardedSlashHandler` at entry.
    const registry = new LoomRegistry();
    registry.armSessionSwapTornDown("resume");
    const deps = guardDeps(registry);
    const sessionStartBody = vi.fn(() => undefined);
    expect(() => runGuardedSlashHandler(deps, sessionStartBody)).toThrow(FailFastSignal);
    expect(sessionStartBody).not.toHaveBeenCalled();
  });

  it("cka-27 (slash entry): on an unarmed registry the guarded handler dispatches normally (dormant)", () => {
    const registry = new LoomRegistry();
    const deps = guardDeps(registry);
    const dispatch = vi.fn(() => "dispatched");
    // Dormant guard: the wrapped handler dispatches and returns its result, and
    // the Pi-owned `/reload` — never wrapped by this function — is thus never
    // guarded (host-prerequisites clause (c-i)).
    expect(runGuardedSlashHandler(deps, dispatch)).toBe("dispatched");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(deps.terminator.terminate).not.toHaveBeenCalled();
  });
});

// ============================================================================
// loom/host/session-swap-instance-survived — registry-row shape + message anchor
// ============================================================================

describe("loom/host/session-swap-instance-survived — diagnostic shape", () => {
  it("builds the (E, runtime) diagnostic with details.event.reason and the registry Message string", () => {
    const diagnostic = sessionSwapInstanceSurvivedDiagnostic("new");
    expect(diagnostic.code).toBe(SESSION_SWAP_INSTANCE_SURVIVED_CODE);
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.message).toBe(survivedMessage("new"));
    // `details.event.reason` carries the armed session-only reason.
    const event = diagnostic.details?.event as Record<string, unknown> | undefined;
    expect(event?.reason).toBe("new");
  });

  it("interpolates the armed reason into details.event.reason for each session-only reason", () => {
    for (const reason of SESSION_ONLY_REASONS) {
      const diagnostic = sessionSwapInstanceSurvivedDiagnostic(reason);
      const event = diagnostic.details?.event as Record<string, unknown> | undefined;
      expect(event?.reason).toBe(reason);
      expect(diagnostic.message).toBe(survivedMessage(reason));
    }
  });
});
