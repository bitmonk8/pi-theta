// RED witness for bug 0376 — `TEARDOWN_STEP_CALL_LABELS[4]` under-enumerates
// the `details.call` label the same module emits at sub-step 4's quiesce arm.
//
// Bug doc: docs/bugs/0376-teardown-call-label-set-underenumerates.md.
//
// The spec's closed set for sub-step 4 has FOUR members
// (session-shutdown-semantics.md **Per-step isolation** — "discoveryWatcher.close",
// "settingsWatcher.close", "Clock.clearTimeout(debounce)",
// "debouncer.whenIdle(awaitCap)"), but the exported constant that documents
// itself as the closed normative source of truth
// (src/extension/session-shutdown.ts TEARDOWN_STEP_CALL_LABELS) lists only the
// first three, while the quiesce catch emits the fourth INLINE via
// `teardownStepFailedDiagnostic(4, "debouncer.whenIdle(awaitCap)", quiesceError)`.
// Both assertions below are RED against the current tree for that one reason —
// the constant lags its own emitter by one label. The §Fix adds the missing
// member and routes the emission through the constant, which flips both green.
//
// Default-suite: offline, deterministic, provider-free. Timing runs through the
// injected `FakeClock` seam. The teardown harness mirrors the proven pattern in
// tests/reload-teardown-quiesce.test.ts (its throwing-`whenIdle` drive at the
// PIC-57 sub-step-4 case), so the drive that produces the emitted diagnostic is
// the same one the existing suite already exercises green.

import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "./helpers/fake-clock";
import {
  runSessionShutdown,
  SHUTDOWN_AWAIT_CAP_MS,
  TEARDOWN_STEP_CALL_LABELS,
  TEARDOWN_STEP_FAILED_CODE,
  type ClosableWatcher,
  type EmissionSink,
  type ForwardingSignalSource,
  type SessionShutdownDeps,
  type SessionShutdownEventLike,
  type TeardownAwareDebouncer,
} from "../src/extension/session-shutdown";
import { ActiveInvocationRegistry } from "../src/runtime/active-invocation-registry";
import { ThetaRegistry } from "../src/extension/reload-wiring";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// The spec literal under test: PIC-57's quiesce-await label, which the spec's
// closed set carries and the emitter emits, but the constant omits.
const QUIESCE_LABEL = "debouncer.whenIdle(awaitCap)";

// --- teardown harness (mirrors tests/reload-teardown-quiesce.test.ts) --------

/** Flush the microtask queue so the handler's in-flight promises settle. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

function watcherSpy(): ClosableWatcher & { close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn() };
}

function signalSpy(
  label: ForwardingSignalSource["label"],
): ForwardingSignalSource & { removeEventListener: ReturnType<typeof vi.fn> } {
  return { label, removeEventListener: vi.fn() };
}

// The sink serialises via JSON.stringify, so each `emit` call carries the single
// serialised diagnostic line — parseable back to its `details` shape below.
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

interface Harness {
  readonly deps: SessionShutdownDeps;
  readonly clock: FakeClock;
  readonly sink: ReturnType<typeof sinkSpy>;
}

function makeHarness(): Harness {
  const clock = new FakeClock();
  const sink = sinkSpy();
  const deps: SessionShutdownDeps = {
    registry: new ThetaRegistry(),
    activeInvocations: new ActiveInvocationRegistry(),
    clock,
    discoveryWatcher: watcherSpy(),
    settingsWatcher: watcherSpy(),
    debounceHandle: clock.setTimeout(() => {}, 250),
    forwardingSignals: [
      signalSpy("ctx.signal.removeEventListener"),
      signalSpy("toolSignal.removeEventListener"),
      signalSpy("parentInvokeSignal.removeEventListener"),
    ],
    inventory: undefined,
    sink,
  };
  return { deps, clock, sink };
}

const eventWith = (reason: unknown): SessionShutdownEventLike => ({ reason });

// A debouncer whose `whenIdle` rejects, so sub-step 4's quiesce catch emits the
// `details.call: "debouncer.whenIdle(awaitCap)"` diagnostic under test.
function fakeDebouncerDep(
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

/** The flat `details` shape the teardown-step-failed diagnostic carries. */
interface TeardownStepFailedDetails {
  readonly details: { readonly step: number; readonly call: string };
}

describe("bug 0376 — TEARDOWN_STEP_CALL_LABELS[4] omits debouncer.whenIdle(awaitCap)", () => {
  it("carries the quiesce-await label the emitter uses (direct constant check)", () => {
    // The constant declares itself the closed normative `details.call` set, so
    // its sub-step-4 row must carry every label the emitter can emit there. RED
    // now: the row lists only the three watcher/timer labels.
    const row: readonly string[] = TEARDOWN_STEP_CALL_LABELS[4];
    expect(
      row.includes(QUIESCE_LABEL),
      `TEARDOWN_STEP_CALL_LABELS[4] must include "${QUIESCE_LABEL}"; row is [${row.join(", ")}]`,
    ).toBe(true);
  });

  it("emits a details.call that is a member of its own constant's row (structural drift-closer)", async () => {
    // The doc's own prescription: every emitted `details.call` must be a member
    // of TEARDOWN_STEP_CALL_LABELS[details.step]. Drive a real teardown whose
    // injected `whenIdle` rejects, then read `details.step`/`details.call` off
    // the emitted diagnostic and assert set membership against the constant.
    // RED now: the emitter emits step 4 / "debouncer.whenIdle(awaitCap)", which
    // is NOT a member of the constant's three-label row 4.
    const debouncer = fakeDebouncerDep(async () => {
      throw new Error("whenIdle boom");
    });
    const harness = makeHarness();
    const deps: SessionShutdownDeps = { ...harness.deps, debouncer };

    const done = runSessionShutdown(eventWith("reload"), deps);
    // Advance the shared shutdown deadline as the proven quiesce drive does, so
    // the handler settles deterministically after the rejected quiesce await.
    harness.clock.advance(SHUTDOWN_AWAIT_CAP_MS + 3);
    await flush();
    await done;

    const failedEmits = harness.sink.emit.mock.calls.filter((call) =>
      String(call[0]).includes(TEARDOWN_STEP_FAILED_CODE),
    );
    expect(
      failedEmits.length,
      "exactly one teardown-step-failed diagnostic for the rejected quiesce await",
    ).toBe(1);

    // Parse the single serialised line back to its `details` — set membership,
    // not substring matching, so this structurally closes the drift channel.
    const emitted = JSON.parse(
      String(failedEmits[0]?.[0]),
    ) as TeardownStepFailedDetails;
    const { step, call } = emitted.details;

    const labelSet = TEARDOWN_STEP_CALL_LABELS as Record<
      number,
      readonly string[]
    >;
    const rowForStep: readonly string[] = labelSet[step] ?? [];
    expect(
      rowForStep.includes(call),
      `emitted details.call "${call}" (step ${step}) must be a member of TEARDOWN_STEP_CALL_LABELS[${step}] = [${rowForStep.join(", ")}]`,
    ).toBe(true);
  });
});
