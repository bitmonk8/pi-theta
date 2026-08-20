// Bug 0074 §Fix constraint 6 — the binder-window regression cell.
//
// `active-invocation-registry.md` §"Registry contract" fixes insertion at
// slash-command handler entry "before any awaitable work", so an invocation
// parked inside the awaited binder step MUST hold an entry and MUST therefore be
// reached by `session_shutdown` sub-step 2 (`session-shutdown-semantics.md`:
// "for every entry … call `thetaAbort.abort(reason)`") and by sub-step 3's
// bounded await, before Pi calls `ExtensionRuntime.invalidate(...)`.
//
// The committed control cell (`tests/active-invocation-wiring.test.ts`) parks the
// theta BODY, so it only observes the window that starts once
// `bindPromptConversation` has run. This file parks the BINDER instead — the
// window between `createThetaAbort()` in `composeThetaFixture.run` and the bind
// that performs the registry `add` — and asserts the three spec-mandated
// observables there: the entry spans the binder call, a completed teardown has
// aborted that invocation's own `thetaAbort`, and the theta body never runs
// against the torn-down instance.
//
// Everything on the dispatch path is real: `createProductionProducerDeps`, the
// real `composeThetaFixture.run` drive seam, and the real `runSessionShutdown`
// over the SAME `ActiveInvocationRegistry` the producer was constructed with.
// Only `runBinder` is replaced — through a `Proxy`, because the producer is a
// class instance whose remaining methods must keep their original `this`.

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";

// The DRIVE seam's body call is the "did the theta run?" observable; parking it
// is not needed here (the binder is the parked step), but it must be observable
// and must not require a live session.
const executorHook = vi.hoisted(() => ({
  calls: 0,
}));
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/runtime/statement-executor")>();
  return {
    ...actual,
    executeBody: (): Promise<unknown> => {
      executorHook.calls += 1;
      // A `fail` outcome routes the prompt surface down the branch that never
      // reads `sessionManager`, keeping the harness session-free.
      return Promise.resolve({ outcome: "fail", error: null });
    },
  };
});

import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import { composeThetaFixture } from "../src/extension/theta-composition-producer";
import type {
  BinderRunInput,
  BinderRunResult,
  ThetaCompositionInput,
  ThetaProducerDeps,
} from "../src/extension/theta-composition-producer";
import { ActiveInvocationRegistry } from "../src/runtime/active-invocation-registry";
import {
  runSessionShutdown,
  SHUTDOWN_AWAIT_CAP_MS,
  type EmissionSink,
  type SessionShutdownDeps,
} from "../src/extension/session-shutdown";
import { ThetaRegistry } from "../src/extension/reload-wiring";
import { SESSION_SHUTDOWN_REASON_SNAPSHOT } from "../src/extension/version-bump-gates";
import { FakeClock } from "./helpers/fake-clock";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { ThetaBody } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";

// --- dispatch-side scaffolding (mirrors active-invocation-wiring) ------------

class PassthroughCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootWith(checkpoint: Checkpoint): RuntimeRoot {
  return {
    checkpoint,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {} } as unknown as ExtensionAPI;
}

function promptTheta(): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" } as ParsedFrontmatter;
  return {
    slashName: "demo",
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: { statements: [], tail: null } as unknown as ThetaBody,
  };
}

/** The dispatch ctx the drive seam threads: `signal: undefined` is the
 *  documented idle-entry the cancel-forwarding tolerates, and the `fail`-outcome
 *  surface never touches `sessionManager`. */
function driveCtx(): ExtensionCommandContext {
  return { signal: undefined, cwd: "/tmp" } as unknown as ExtensionCommandContext;
}

/** Flush pending microtasks/macrotasks so `run` reaches the parked binder await
 *  before the registry is sampled. */
const tick = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

interface ParkedDispatch {
  readonly registry: ActiveInvocationRegistry;
  readonly run: Promise<void>;
  /** The controller the dispatch entry minted and handed to the binder — the one
   *  sub-step 2 must reach through the registry. */
  thetaAbortSeen(): AbortController | undefined;
  releaseBinder(): void;
  bodyCalls(): number;
}

/**
 * Dispatch `/demo` through the real drive seam and leave it inside the awaited
 * binder step. The parked binder mirrors the production binder's in-flight-abort
 * arm — an abort observed during the call yields a non-binding envelope
 * (`ProductionThetaProducer.runBinder` returns `{ bound: false }` on the
 * `cancelled` phase), so the body runs only when the abort never arrived.
 */
async function dispatchParkedInBinder(): Promise<ParkedDispatch> {
  const registry = new ActiveInvocationRegistry();
  const base = createProductionProducerDeps({
    pi: noopPi(),
    root: rootWith(new PassthroughCheckpoint()),
    modelRegistry: {} as unknown as ModelRegistry,
    activeInvocations: registry,
  });

  let thetaAbortSeen: AbortController | undefined;
  let releaseBinder!: () => void;
  const binderParked = new Promise<void>((resolve) => {
    releaseBinder = resolve;
  });
  const parkedBinder = async (input: BinderRunInput): Promise<BinderRunResult> => {
    thetaAbortSeen = input.thetaAbort;
    await binderParked;
    const signal = input.thetaAbort?.signal;
    return signal?.aborted === true ? { bound: false } : { bound: true, args: {} };
  };

  const deps = new Proxy(base, {
    get: (target, property): unknown => {
      if (property === "runBinder") {
        return parkedBinder;
      }
      // The producer is a class instance whose accessors and methods read private
      // fields, so the receiver must stay the real instance — not the proxy.
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ThetaProducerDeps;

  const run = composeThetaFixture(promptTheta(), deps).run("", driveCtx());
  await tick();

  // Fail loudly if the dispatch never reached the binder: every assertion below
  // is about the binder window, and a harness that missed it would assert
  // nothing.
  expect(
    thetaAbortSeen,
    "harness precondition unmet: the dispatch never reached the parked binder",
  ).toBeDefined();
  expect(
    executorHook.calls,
    "harness precondition unmet: the theta body ran before the binder resolved",
  ).toBe(0);

  return {
    registry,
    run,
    thetaAbortSeen: () => thetaAbortSeen,
    releaseBinder,
    bodyCalls: () => executorHook.calls,
  };
}

// --- teardown-side scaffolding (mirrors session-shutdown) --------------------

function sink(): EmissionSink {
  return {
    emit: (): void => {},
    serialise: (diagnostic): string => JSON.stringify(diagnostic),
  };
}

/** Real `runSessionShutdown` deps over the SAME registry the producer holds. */
function shutdownDeps(
  activeInvocations: ActiveInvocationRegistry,
  clock: FakeClock,
): SessionShutdownDeps {
  return {
    registry: new ThetaRegistry(),
    activeInvocations,
    clock,
    discoveryWatcher: { close: (): void => {} },
    settingsWatcher: { close: (): void => {} },
    debounceHandle: undefined,
    forwardingSignals: [],
    inventory: [
      {
        kind: "type-union-snapshot",
        path: "SessionShutdownEvent.reason",
        literals: [...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals],
      },
    ],
    sink: sink(),
  };
}

/** Drive a full `/reload` teardown to completion. The cap is fired because a
 *  conforming sub-step 3 parks on the still-in-flight invocation's
 *  `disposeBarrier`, which cannot settle while the binder is parked. */
async function drivePeakShutdown(registry: ActiveInvocationRegistry): Promise<void> {
  const clock = new FakeClock();
  const done = runSessionShutdown({ reason: "reload" }, shutdownDeps(registry, clock));
  clock.advance(SHUTDOWN_AWAIT_CAP_MS + 3);
  await done;
}

afterEach(() => {
  executorHook.calls = 0;
});

describe("bug 0074 — session_shutdown inside the awaited binder window", () => {
  it("(a) the registry entry spans the binder call: size()===1 while the invocation is parked in the binder", async () => {
    const dispatch = await dispatchParkedInBinder();

    expect(
      dispatch.registry.size(),
      "an invocation parked inside the awaited binder step holds no registry entry, so session_shutdown sub-step 2 iterates an empty snapshot",
    ).toBe(1);
    expect(dispatch.registry.snapshot()).toHaveLength(1);
    expect(dispatch.registry.snapshot()[0]?.thetaAbort).toBe(dispatch.thetaAbortSeen());

    dispatch.releaseBinder();
    await dispatch.run;
  });

  it("(b) a completed teardown has aborted the parked invocation's own thetaAbort", async () => {
    const dispatch = await dispatchParkedInBinder();

    await drivePeakShutdown(dispatch.registry);

    expect(
      dispatch.thetaAbortSeen()?.signal.aborted,
      "session_shutdown returned without aborting the invocation parked in its binder window",
    ).toBe(true);

    dispatch.releaseBinder();
    await dispatch.run;
  });

  it("(c) the theta body does not run after the five sub-steps have returned", async () => {
    const dispatch = await dispatchParkedInBinder();

    await drivePeakShutdown(dispatch.registry);
    // Release the binder only after the whole teardown returned: whatever runs
    // now runs against an instance Pi is entitled to have invalidated.
    dispatch.releaseBinder();
    await dispatch.run;

    expect(
      dispatch.bodyCalls(),
      "the theta body executed after the completed session_shutdown teardown (post-teardown continuation)",
    ).toBe(0);
    expect(dispatch.registry.size()).toBe(0);
  });
});
