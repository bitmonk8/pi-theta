// Decision 6 / Increment B1 — the shared `ActiveInvocationRegistry` wiring.
//
// Proves B1 (registry only; NOT forwarding listeners, that is B2): the shipped
// composition constructs ONE `ActiveInvocationRegistry` beside the runtime root
// and threads it (a) into every composed loom's producer, so the two bind choke
// points (`bindPromptConversation` / `spawnSubagentConversation`) register one
// `ActiveInvocationEntry` per invocation, and (b) into the factory's
// `session_shutdown` teardown, so sub-step 2 (cancel in-flight) and sub-step 3
// (await dispose) operate on the SAME entries — no longer a fresh empty
// registry (the Increment-A live-but-empty placeholder).
//
// Coverage:
//   1. producer add/remove-on-settle — a prompt bind registers exactly one
//      entry (reusing the per-invocation `loomAbort`, PIC-20-minted
//      `invocationId`, canonical `loom` name) and removes it on the way out.
//   2. factory cancel-in-flight — an entry in the shared registry is aborted
//      with the synthesised CNCL-4 reason and its `shutdownReason` is stamped
//      BEFORE the abort.
//   3. producer no-leak — a bind body that throws before its surface teardown
//      leaves the registry empty (the `finally` guard).
//   4. factory bounded-await — a never-settling `disposeBarrier` is bounded by
//      `SHUTDOWN_AWAIT_CAP_MS`, emits exactly one `reload-teardown-timeout`
//      naming `/<loom>:<invocationId>`, and still proceeds (drain tag set).
//
// Cancellation is not live-reproducible (no injected Esc / Checkpoint seam), so
// tests 2 + 4 feed REAL `ActiveInvocationEntry` values directly to the shared
// registry the factory reads — the same substrate `session-shutdown.test.ts`
// pins at the handler level, here wired through the production factory.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ModelRegistry,
  SessionShutdownEvent,
} from "@earendil-works/pi-coding-agent";

// SPAN staging: replace the module-level `executeBody` the DRIVE seam
// (`composeLoomFixture.run`) calls with a test-controlled implementation, so a
// REAL producer bind (the entry really added to the shared registry) is driven
// through the REAL drive seam (the real `finally` → `finishInvocation`) while
// the body is parked on a deferred. Everything else in the executor module is
// preserved. This proves the entry SPANS the in-flight window — it is NOT faked
// at the bind level (the bug being fixed).
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

import {
  createProductionProducerDeps,
} from "../src/extension/production-loom-producer";
import {
  composeLoomFixture,
} from "../src/extension/loom-composition-producer";
import type {
  ConversationBindInput,
  LoomCompositionInput,
} from "../src/extension/loom-composition-producer";
import type { BodyExecution } from "../src/runtime/statement-executor";
import {
  createLoomExtension,
  type LoomExtensionDeps,
} from "../src/extension/factory";
import type { ExtensionInstanceWiring } from "../src/extension/production-composition";
import { LoomRegistry, type ParsedLoom } from "../src/extension/reload-wiring";
import {
  ActiveInvocationRegistry,
  type ActiveInvocationEntry,
} from "../src/runtime/active-invocation-registry";
import {
  RELOAD_TEARDOWN_TIMEOUT_CODE,
  SESSION_SHUTDOWN_ABORT_MESSAGE,
} from "../src/extension/session-shutdown";
import { SHUTDOWN_AWAIT_CAP_MS } from "../src/extension/capability-probe";
import { FakeClock } from "./helpers/fake-clock";
import type { Clock } from "../src/seams/clock";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { LoomBody } from "../src/parser/loom-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";

// --- producer-level scaffolding (mirrors production-cancellation-wiring) -----

class RecordingCheckpoint implements Checkpoint {
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

function emptyBody(): LoomBody {
  return { statements: [], tail: null } as unknown as LoomBody;
}

function promptLoom(): LoomCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" } as ParsedFrontmatter;
  return {
    slashName: "demo",
    sourcePath: "/looms/demo.loom",
    frontmatter,
    body: emptyBody(),
  };
}

/** A prompt dispatch ctx the DRIVE seam threads: the `fail`-outcome surface
 *  never touches `sessionManager`, and `signal: undefined` is the documented
 *  idle-entry the cancel-forwarding tolerates. */
function driveCtx(): ExtensionCommandContext {
  return {
    signal: undefined,
    cwd: "/tmp",
  } as unknown as ExtensionCommandContext;
}

/** Flush pending microtasks/macrotasks so the async run() reaches the parked
 *  `executeBody` await before the assertion samples the registry size. */
const tick = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  executorHook.impl = undefined;
});

describe("Increment B1 — the registry entry SPANS the in-flight body via the DRIVE seam", () => {
  it("(spans the body) a REAL producer bind driven through composeLoomFixture.run keeps size()===1 WHILE the parked body runs, then 0 after it settles", async () => {
    const registry = new ActiveInvocationRegistry();
    // Capture the registered entry to assert it reuses the per-invocation
    // controller / canonical name / PIC-20 id — the fields the teardown reads.
    let captured: ActiveInvocationEntry | undefined;
    const realAdd = registry.add.bind(registry);
    vi.spyOn(registry, "add").mockImplementation((entry: ActiveInvocationEntry) => {
      captured = entry;
      realAdd(entry);
    });

    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootWith(new RecordingCheckpoint()),
      modelRegistry: {} as unknown as ModelRegistry,
      activeInvocations: registry,
    });

    // Park the body on a test-controlled deferred: while it is pending the
    // invocation is genuinely in-flight and its entry MUST be in the registry.
    let releaseBody!: () => void;
    const bodyParked = new Promise<void>((resolve) => {
      releaseBody = resolve;
    });
    // Capture the executor deps the DRIVE seam passes so we can prove the entry
    // reuses the SAME per-invocation `loomAbort` the executor gates on.
    let bodySignal: AbortSignal | undefined;
    executorHook.impl = async (...args: readonly unknown[]): Promise<unknown> => {
      bodySignal = (args[1] as { signal: AbortSignal }).signal;
      await bodyParked;
      // A `fail` outcome routes the prompt surface down the branch that does not
      // read `sessionManager` (STL-6), keeping the harness minimal.
      return { outcome: "fail", error: null } as unknown as BodyExecution;
    };

    const fixture = composeLoomFixture(promptLoom(), deps);
    const runPromise = fixture.run("", driveCtx());

    // The bind added the entry; the DRIVE seam is now awaiting the parked body.
    await tick();
    expect(registry.size()).toBe(1);
    expect(captured).toBeDefined();
    const entry = captured as ActiveInvocationEntry;
    expect(entry.loom).toBe("demo");
    expect(entry.invocationId).toBe("inv-1");
    expect(entry.shutdownReason).toBeUndefined();
    // The entry reuses the dispatch-owned controller, never a fresh one: the
    // signal the executor body gates on is the entry's `loomAbort.signal`.
    expect(bodySignal).toBeDefined();
    expect(entry.loomAbort.signal).toBe(bodySignal);

    // Release the body; the DRIVE `finally` calls `finishInvocation`, which
    // settles the barrier and removes the entry.
    releaseBody();
    await runPromise;
    expect(registry.size()).toBe(0);
    // The barrier the teardown awaits is settled after finish.
    await expect(entry.disposeBarrier).resolves.toBeUndefined();
  });

  it("(no leak on body throw) a body that REJECTS is drained by the DRIVE finally — size()===0", async () => {
    const registry = new ActiveInvocationRegistry();
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootWith(new RecordingCheckpoint()),
      modelRegistry: {} as unknown as ModelRegistry,
      activeInvocations: registry,
    });

    // The parked body rejects: the entry was added by the bind, and only the
    // DRIVE seam's `finally` (finishInvocation) can remove it.
    executorHook.impl = (): Promise<unknown> =>
      Promise.reject(new Error("body boom"));

    const fixture = composeLoomFixture(promptLoom(), deps);

    await expect(fixture.run("", driveCtx())).rejects.toThrow("body boom");

    // The DRIVE `finally` removed the entry despite the mid-body throw.
    expect(registry.size()).toBe(0);
  });
});

// --- factory-level scaffolding (mirrors session-shutdown-wiring) -------------

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

function makeLoom(slashName: string): ParsedLoom {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedLoom["frontmatter"],
    body: { statements: [] } as unknown as ParsedLoom["body"],
    run: async (): Promise<void> => {},
  };
}

interface FactoryBoot {
  readonly harness: FactoryHarness;
  readonly registry: LoomRegistry;
  readonly activeInvocations: ActiveInvocationRegistry;
  readonly clock: Clock;
}

/** Boot through the REAL factory with a `composeInstance` returning the given
 *  shared `ActiveInvocationRegistry` + `LoomRegistry` + clock. */
async function bootFactory(
  activeInvocations: ActiveInvocationRegistry,
  clock: Clock,
): Promise<FactoryBoot> {
  const harness = makeFactoryHarness();
  const registry = new LoomRegistry([["foo", makeLoom("foo")]]);
  const deps: LoomExtensionDeps = {
    fixtures: [],
    composeInstance: async (): Promise<ExtensionInstanceWiring> => ({
      looms: [makeLoom("foo")],
      registry,
      activeInvocations,
      clock,
      installHotReload: () => ({ detach: (): void => {} }),
    }),
  };
  createLoomExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  return { harness, registry, activeInvocations, clock };
}

describe("Increment B1 — factory session_shutdown operates on the shared registry", () => {
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

  it("(cancel in-flight) aborts an entry with the synthesised CNCL-4 reason and stamps shutdownReason BEFORE the abort", async () => {
    const activeInvocations = new ActiveInvocationRegistry();
    const loomAbort = new AbortController();
    let reasonAtAbort: string | undefined = "<not-observed>";
    const entry: ActiveInvocationEntry = {
      loomAbort,
      // Immediately-settling barrier so sub-step 3 does not park.
      disposeBarrier: Promise.resolve(),
      shutdownReason: undefined,
      loom: "foo",
      invocationId: "inv-42",
    };
    // Record `shutdownReason` at the instant of abort: sub-step 2 must stamp the
    // field BEFORE calling `loomAbort.abort(reason)`.
    loomAbort.signal.addEventListener("abort", () => {
      reasonAtAbort = entry.shutdownReason;
    });
    activeInvocations.add(entry);

    const { harness } = await bootFactory(activeInvocations, new FakeClock());
    await harness.fireSessionShutdown("quit");

    expect(loomAbort.signal.aborted).toBe(true);
    expect(loomAbort.signal.reason).toBeInstanceOf(Error);
    expect((loomAbort.signal.reason as Error).message).toBe(SESSION_SHUTDOWN_ABORT_MESSAGE);
    // Stamp-before-abort: the abort listener saw the populated field.
    expect(reasonAtAbort).toBe("quit");
    expect(entry.shutdownReason).toBe("quit");
  });

  it("(bounded await) a never-settling disposeBarrier is bounded by the cap, emits one reload-teardown-timeout naming /<loom>:<invocationId>, and still proceeds", async () => {
    const clock = new FakeClock();
    const activeInvocations = new ActiveInvocationRegistry();
    const entry: ActiveInvocationEntry = {
      loomAbort: new AbortController(),
      // Never settles — forces the sub-step 3 cap to fire.
      disposeBarrier: new Promise<void>(() => {}),
      shutdownReason: undefined,
      loom: "foo",
      invocationId: "inv-stuck",
    };
    activeInvocations.add(entry);

    const { harness, registry } = await bootFactory(activeInvocations, clock);

    // Fire the teardown; the bounded-await timer is armed synchronously before
    // the first `await`, so advancing the fake clock past the cap fires it.
    const pending = harness.fireSessionShutdown("reload");
    clock.advance(SHUTDOWN_AWAIT_CAP_MS);
    await pending;

    // Exactly one reload-teardown-timeout, naming the still-in-flight entry.
    const timeoutLines = errors
      .map((line) => String(line))
      .filter((line) => line.includes(RELOAD_TEARDOWN_TIMEOUT_CODE));
    expect(timeoutLines).toHaveLength(1);
    expect(timeoutLines[0]).toContain("/foo:inv-stuck");

    // Teardown still proceeded past the cap: sub-step 1 set the drain tag.
    expect(registry.readDrainState()).toEqual({
      drained: true,
      tag: "shutting-down",
    });
  });
});
