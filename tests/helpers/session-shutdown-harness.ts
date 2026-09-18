// Shared session_shutdown entries, spy seams, and dependency construction.

import { vi } from "vitest";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type { ActiveInvocationEntry, ActiveInvocationRegistry } from "../../src/runtime/active-invocation-registry";
import { ThetaRegistry } from "../../src/extension/reload-wiring";
import { SESSION_SHUTDOWN_REASON_SNAPSHOT } from "../../src/extension/version-bump-gates";
import type {
  ClosableWatcher,
  EmissionSink,
  ForwardingSignalSource,
  SessionShutdownDeps,
  SessionShutdownEventLike,
  TeardownAwareDebouncer,
} from "../../src/extension/session-shutdown";
import type { Clock } from "../../src/seams/clock";

/** A registry entry whose `disposeBarrier` is externally settleable. */
export interface ControllableEntry {
  readonly entry: ActiveInvocationEntry;
  settle(): void;
}

export function makeEntry(
  theta: string,
  invocationId: string,
  options: { settleable?: boolean } = {},
): ControllableEntry {
  let settle: () => void = (): void => {};
  const disposeBarrier =
    options.settleable === true
      ? new Promise<void>((resolve) => {
          settle = resolve;
        })
      : // A never-settling barrier so sub-step 3's bounded await is exercised.
        new Promise<void>(() => {});
  const entry: ActiveInvocationEntry = {
    thetaAbort: new AbortController(),
    disposeBarrier,
    shutdownReason: undefined,
    theta,
    invocationId,
  };
  return { entry, settle };
}

export function watcherSpy(): ClosableWatcher & { close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn() };
}

export function signalSpy(
  label: ForwardingSignalSource["label"],
): ForwardingSignalSource & { removeEventListener: ReturnType<typeof vi.fn> } {
  return { label, removeEventListener: vi.fn() };
}

/** A debouncer double with caller-supplied quiesce behaviour. */
export function fakeDebouncerDep(
  whenIdleImpl: () => Promise<void>,
): TeardownAwareDebouncer & {
  markTornDown: ReturnType<typeof vi.fn>;
  whenIdle: ReturnType<typeof vi.fn>;
} {
  return {
    markTornDown: vi.fn(),
    whenIdle: vi.fn(whenIdleImpl),
  };
}

// The sink serialises via JSON.stringify, so each `emit` call carries the single
// serialised diagnostic line — parseable back to its `details` shape.
export function sinkSpy(): EmissionSink & {
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

/** The healthy pinned-constant inventory the handler reads the reason union from. */
export function healthyInventory(): SessionShutdownDeps["inventory"] {
  return [
    {
      kind: "type-union-snapshot",
      path: "SessionShutdownEvent.reason",
      literals: [...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals],
    },
  ];
}

/** Real `runSessionShutdown` deps over the SAME registry the producer holds.
 * Explicit `inventory: undefined` preserves the missing-snapshot test arm. */
export function shutdownDeps(
  activeInvocations: ActiveInvocationRegistry,
  clock: Clock,
  overrides: Partial<Omit<SessionShutdownDeps, "activeInvocations" | "clock">> = {},
): SessionShutdownDeps {
  return {
    registry: new ThetaRegistry(),
    activeInvocations,
    clock,
    discoveryWatcher: { close: (): void => {} },
    settingsWatcher: { close: (): void => {} },
    debounceHandle: undefined,
    forwardingSignals: [],
    inventory: healthyInventory(),
    sink: {
      emit: (): void => {},
      serialise: (diagnostic): string => JSON.stringify(diagnostic),
    },
    ...overrides,
  };
}

export const eventWith = (reason: unknown): SessionShutdownEventLike => ({ reason });
