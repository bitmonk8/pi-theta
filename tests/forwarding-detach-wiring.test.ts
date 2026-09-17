// Decision 6 / Increment B2 — the shared forwarding-listener list wiring.
//
// Proves B2 (forwarding listeners only): the shipped composition constructs ONE
// `forwardingSignals` sink beside the runtime root and threads it (a) into every
// composed theta's producer, so the two bind choke points push one invocation-
// scoped `ForwardingSignalSource` per invocation (the bind-time `ctx.signal`
// forward; the derived-child parent-invoke listener) and splice+detach them in
// `finishInvocation`, and (b) into the factory's `session_shutdown` teardown, so
// sub-step 5 detaches the listeners still attached for an invocation in-flight
// at shutdown.
//
// Coverage:
//   1. factory sub-step 5 — fake `ForwardingSignalSource`s pushed onto the shared
//      list the factory reads are each detached exactly once, in list order,
//      with per-source isolation (a throwing detach still runs the others and
//      emits exactly one `teardown-step-failed` tagged with its label).
//   2. producer normal settle — a REAL bind driven to completion through the
//      DRIVE seam leaves the shared list EMPTY (finishInvocation spliced it), so
//      a later shutdown detaches nothing stale.
//   3. detach handle is real — after `forwardSlashCommandCancel`'s returned
//      detach runs, aborting the source no longer aborts `thetaAbort` (proving
//      Step-1's detach works and the forwarding is intact before detach).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
  ModelRegistry,
  SessionShutdownEvent,
} from "@earendil-works/pi-coding-agent";

// SPAN staging: replace the module-level `executeBody` the DRIVE seam calls with
// a test-controlled implementation so a REAL producer bind is driven through the
// REAL drive seam (the real `finally` → `finishInvocation`) while the body is
// parked on a deferred.
const executorHook = vi.hoisted(() => ({
  impl: undefined as
    | ((...args: readonly unknown[]) => Promise<unknown>)
    | undefined,
}));
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/runtime/statement-executor")>();
  return {
    ...actual,
    executeBody: (...args: readonly unknown[]): Promise<unknown> => {
      if (executorHook.impl === undefined) {
        throw new Error("executorHook.impl not set by the test");
      }
      return executorHook.impl(...args);
    },
  };
});

import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import { composeThetaFixture } from "../src/extension/theta-composition-producer";
import type { BodyExecution } from "../src/runtime/statement-executor";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import type { ExtensionInstanceWiring } from "../src/extension/production-composition";
import { ThetaRegistry, type ParsedTheta } from "../src/extension/reload-wiring";
import { ActiveInvocationRegistry } from "../src/runtime/active-invocation-registry";
import {
  TEARDOWN_STEP_FAILED_CODE,
  type ForwardingSignalSource,
} from "../src/extension/session-shutdown";
import {
  createThetaAbort,
  forwardSlashCommandCancel,
} from "../src/runtime/cancellation-core";
import { FakeClock } from "./helpers/fake-clock";
import type { Clock } from "../src/seams/clock";
import {
  PassthroughCheckpoint,
  rootWith,
  noopPi,
  promptTheta,
  driveCtx,
  tick,
} from "./helpers/fixture-dispatch-harness";

afterEach(() => {
  executorHook.impl = undefined;
});

// --- factory-level scaffolding (mirrors active-invocation-wiring) ------------

interface FactoryHarness {
  readonly pi: ExtensionAPI;
  fireSessionStart(): Promise<void>;
  fireSessionShutdown(reason: SessionShutdownEvent["reason"]): Promise<void>;
}

function makeFactoryHarness(): FactoryHarness {
  const commands = new Map<string, unknown>();
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd: "/does/not/matter",
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string, payload: unknown): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler(payload, ctx);
    }
  };
  return {
    pi,
    fireSessionStart: () => fire("session_start", { type: "session_start" }),
    fireSessionShutdown: (reason) =>
      fire("session_shutdown", { type: "session_shutdown", reason }),
  };
}

function makeTheta(slashName: string): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run: async (): Promise<void> => {},
  };
}

interface FactoryBoot {
  readonly harness: FactoryHarness;
  readonly forwardingSignals: ForwardingSignalSource[];
}

/** Boot through the REAL factory with a `composeInstance` exposing the given
 *  shared `forwardingSignals` sink (the array sub-step 5 reads). */
async function bootFactory(
  forwardingSignals: ForwardingSignalSource[],
  clock: Clock,
): Promise<FactoryBoot> {
  const harness = makeFactoryHarness();
  const registry = new ThetaRegistry([["foo", makeTheta("foo")]]);
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: async (): Promise<ExtensionInstanceWiring> => ({
      thetas: [makeTheta("foo")],
      registry,
      activeInvocations: new ActiveInvocationRegistry(),
      forwardingSignals,
      clock,
      installHotReload: () => ({ detach: (): void => {} }),
    }),
  };
  createThetaExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  return { harness, forwardingSignals };
}

describe("Increment B2 — factory session_shutdown sub-step 5 detaches the shared forwarding listeners", () => {
  let errors: unknown[] = [];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errors = [];
    errorSpy = vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      errors.push(line);
    });
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("(detaches in-flight listeners) each source's removeEventListener runs exactly once in list order, with per-source isolation on a throwing detach", async () => {
    const order: string[] = [];
    const counts = new Map<string, number>();
    const bump = (label: string): void => {
      order.push(label);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    };
    // Three in-flight sources; the MIDDLE detach throws AFTER recording, so the
    // per-source isolation must still run the third and emit exactly one
    // teardown-step-failed tagged with the throwing source's label.
    const forwardingSignals: ForwardingSignalSource[] = [
      {
        label: "ctx.signal.removeEventListener",
        removeEventListener: () => bump("ctx.signal.removeEventListener"),
      },
      {
        label: "toolSignal.removeEventListener",
        removeEventListener: () => {
          bump("toolSignal.removeEventListener");
          throw new Error("detach boom");
        },
      },
      {
        label: "parentInvokeSignal.removeEventListener",
        removeEventListener: () => bump("parentInvokeSignal.removeEventListener"),
      },
    ];

    const { harness } = await bootFactory(forwardingSignals, new FakeClock());
    await harness.fireSessionShutdown("quit");

    // All three detached, exactly once each, in list order.
    expect(order).toEqual([
      "ctx.signal.removeEventListener",
      "toolSignal.removeEventListener",
      "parentInvokeSignal.removeEventListener",
    ]);
    expect(counts.get("ctx.signal.removeEventListener")).toBe(1);
    expect(counts.get("toolSignal.removeEventListener")).toBe(1);
    expect(counts.get("parentInvokeSignal.removeEventListener")).toBe(1);

    // Exactly one teardown-step-failed, tagged with the throwing source's label
    // at step 5.
    const failLines = errors
      .map((line) => String(line))
      .filter((line) => line.includes(TEARDOWN_STEP_FAILED_CODE));
    expect(failLines).toHaveLength(1);
    expect(failLines[0]).toContain("toolSignal.removeEventListener");
    expect(failLines[0]).toContain('"step":5');
  });
});

describe("Increment B2 — a normal settle removes the sources (no accumulation)", () => {
  it("(no accumulation) a REAL bind driven to completion leaves the shared forwardingSignals list empty", async () => {
    const forwardingSignals: ForwardingSignalSource[] = [];
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootWith(new PassthroughCheckpoint()),
      modelRegistry: {} as unknown as ModelRegistry,
      activeInvocations: new ActiveInvocationRegistry(),
      forwardingSignals,
    });

    // Park the body: while pending, the bind's invocation-scoped source is on
    // the shared list; when it settles, finishInvocation splices it off.
    let releaseBody!: () => void;
    const bodyParked = new Promise<void>((resolve) => {
      releaseBody = resolve;
    });
    executorHook.impl = async (): Promise<unknown> => {
      await bodyParked;
      return { outcome: "fail", error: null } as unknown as BodyExecution;
    };

    const fixture = composeThetaFixture(promptTheta(), deps);
    const runPromise = fixture.run("", driveCtx());

    // Mid-flight: the prompt bind pushed exactly the invocation-scoped
    // `ctx.signal` source (the drive-seam forward is not double-counted).
    await tick();
    expect(forwardingSignals).toHaveLength(1);
    expect(forwardingSignals[0]?.label).toBe("ctx.signal.removeEventListener");

    // Normal settle: the DRIVE `finally` → finishInvocation splices it off.
    releaseBody();
    await runPromise;
    expect(forwardingSignals).toHaveLength(0);
  });
});

describe("Increment B2 — the Step-1 detach handle is real", () => {
  it("(detach removes the listener) after forwardSlashCommandCancel's detach runs, aborting the source no longer aborts thetaAbort", () => {
    // Control: WITHOUT detach the forwarding is intact — aborting the source
    // aborts thetaAbort (CNCL-4), proving the listener was really attached.
    const intactAbort = createThetaAbort();
    const intactSource = new AbortController();
    forwardSlashCommandCancel(intactAbort, intactSource.signal);
    intactSource.abort(new Error("esc-intact"));
    expect(intactAbort.signal.aborted).toBe(true);

    // With detach: after running the returned detach, aborting the source is a
    // no-op on thetaAbort — the listener was removed.
    const thetaAbort = createThetaAbort();
    const source = new AbortController();
    const detach = forwardSlashCommandCancel(thetaAbort, source.signal);
    detach();
    source.abort(new Error("esc-detached"));
    expect(thetaAbort.signal.aborted).toBe(false);
  });
});
