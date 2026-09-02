// Bug 0371 — the session-swap fail-fast tripwire's TRIP half is unwired.
//
// `guardSessionSwapTripwire` / `runGuardedSlashHandler`
// (src/extension/session-swap-tripwire.ts:137,159) have NO production caller:
// the registered slash handler `drainGatedHandler` (src/extension/factory.ts:631)
// goes straight to the drain-state read, and the `session_start` handler
// (src/extension/factory.ts:536) goes straight to the ctx-latch + compose pass.
// Neither reads `sessionSwapTornDown`. So a dispatch (or a rebind `session_start`)
// against an ARMED instance returns the ordinary behaviour instead of emitting
// exactly one `theta/host/session-swap-instance-survived` (E, runtime) via
// `console.error` and fail-fast-terminating.
//
// Spec (the behaviour these cells encode — the CURRENT tree violates it):
//   pi-integration-contract/session-only-degraded-state.md:14 (§Session-swap
//     fail-fast tripwire, **Trip.**): "Every theta-registered slash `handler`
//     (at entry, before any dispatch or `readDrainState` branch) and the
//     `session_start` handler MUST read `sessionSwapTornDown`. If it is set …
//     the runtime emits exactly one `theta/host/session-swap-instance-survived`
//     (E, runtime) diagnostic via `console.error` … and then terminates the
//     process on the theta fail-fast path … MUST NOT attempt any degraded-mode
//     dispatch, recovery, or continued operation past the trip."
//   session-only-degraded-state.md:18 criterion (2): "A slash `handler` (or
//     `session_start`) invoked against an armed tripwire emits exactly one
//     `theta/host/session-swap-instance-survived` row and fail-fast-terminates";
//     criterion (3): under the normal rebind the guard is dormant.
//
// §Fix acceptance pins "criterion (2) driven through a REGISTERED handler, not
// the guard directly" — so cells 1/2 drive the trip through the REAL
// `createThetaExtension` registration path (the `drainGatedHandler` slash
// handler and the `session_start` rebind), never `guardSessionSwapTripwire`
// directly (that guard-level path is already covered by
// tests/session-swap-tripwire.test.ts).
//
// Harness: the fake-pi harness (makeHarness/boot/invoke/thetaNotes) is copied
// from tests/drain-gated-dispatch-integration.test.ts (whose helpers are not
// exported), extended so `boot` threads a fail-fast `terminator` into
// `ThetaExtensionDeps` — the minimal Phase-1 seam. `composeInstance` is a
// deterministic stub returning a fully-controlled `ThetaRegistry` + a no-op
// `installHotReload`, so there is NO filesystem, NO watcher, and NO live model;
// the REAL registration/dispatch path is exercised end-to-end.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import type { ExtensionInstanceWiring } from "../src/extension/production-composition";
import { ThetaRegistry, type ParsedTheta } from "../src/extension/reload-wiring";
import {
  SESSION_SWAP_INSTANCE_SURVIVED_CODE,
  type FailFastTerminator,
} from "../src/extension/session-swap-tripwire";
import { FakeClock } from "./helpers/fake-clock";
import { ActiveInvocationRegistry } from "../src/runtime/active-invocation-registry";

/** A recorded `pi.sendMessage` call. */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: unknown;
  readonly triggerTurn: unknown;
}

/** The registered pi command options shape this test invokes against. */
interface RegisteredCommand {
  readonly handler: (args: string, ctx: ExtensionCommandContext) => unknown;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  readonly subscriptions: Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >;
  fireSessionStart(): Promise<void>;
}

/**
 * The minimal fake-pi harness, replicated the same way the drain-gated-dispatch
 * integration test replicated it from the watcher-hot-reload integration test
 * (its helpers are not exported): capture `registerCommand` options (so the
 * registered handler can be invoked), `sendMessage` notes, and the `pi.on`
 * subscription table.
 */
function makeHarness(): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
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
    sendMessage: (
      message: { customType: string; content: string; display: boolean; details: unknown },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details,
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd: "/does/not/matter",
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };

  return {
    pi,
    ctx,
    commands,
    notes,
    subscriptions,
    fireSessionStart: () => fire("session_start"),
  };
}

/**
 * A minimal `ParsedTheta`. The registration path and the drain-gated wrapper read
 * only `slashName` + `run`; `frontmatter` / `body` are never touched at dispatch
 * time, so they carry inert placeholders.
 */
function makeTheta(
  slashName: string,
  run: (args: string, ctx: ExtensionCommandContext) => Promise<void>,
): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run,
  };
}

/**
 * A fail-fast terminator fake: the NFR-2.1 `Environment.FailFast` "let crash"
 * path modelled as a throwing sentinel so control does not flow past the trip
 * and the test process is NOT ended (mirrors the `FailFastSignal` pattern in
 * tests/session-swap-tripwire.test.ts).
 */
class FailFastSignal extends Error {}

function terminatorSpy(): FailFastTerminator & { terminate: ReturnType<typeof vi.fn> } {
  return {
    terminate: vi.fn((): never => {
      throw new FailFastSignal("fail-fast terminate");
    }),
  };
}

/**
 * Boot the extension through the REAL factory with a deterministic
 * `composeInstance` returning `registry` + `thetas` and a no-op
 * `installHotReload`, threading the Phase-1 `terminator` seam into deps, then
 * fire `session_start` so `drainGatedHandler` is the registered handler for each
 * theta. The `registry` object handed to `composeInstance` is the SAME object
 * the factory assigns to its factory-scoped `liveRegistry` (factory.ts:893), so
 * arming it directly models a survived-instance armed tripwire for both the
 * slash-dispatch and the rebind-`session_start` trip sites.
 */
async function boot(
  registry: ThetaRegistry,
  thetas: readonly ParsedTheta[],
  terminator: FailFastTerminator,
): Promise<Harness> {
  const harness = makeHarness();
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    terminator,
    composeInstance: async (): Promise<ExtensionInstanceWiring> => ({
      thetas,
      registry,
      activeInvocations: new ActiveInvocationRegistry(),
      forwardingSignals: [],
      clock: new FakeClock(),
      installHotReload: () => ({ detach: (): void => {} }),
    }),
  };
  createThetaExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  return harness;
}

/** Invoke the captured pi handler for `name` (the drain-gated wrapper). */
async function invoke(harness: Harness, name: string, args = ""): Promise<void> {
  const options = harness.commands.get(name) as RegisteredCommand | undefined;
  if (options === undefined) {
    throw new Error(`no command registered for /${name}`);
  }
  await options.handler(args, {} as unknown as ExtensionCommandContext);
}

/** The `theta-system-note` entries recorded so far. */
function thetaNotes(harness: Harness): readonly RecordedNote[] {
  return harness.notes.filter((n) => n.customType === "theta-system-note");
}

// The production trip emits the survived row through
// `createProductionEmissionSink()` = `console.error(JSON.stringify(diagnostic))`,
// so the observable is a `console.error` call whose first arg names the code.
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

/** `console.error` calls that carry the `session-swap-instance-survived` code. */
function survivedRows(): unknown[][] {
  return errorSpy.mock.calls.filter((call) =>
    String(call[0]).includes(SESSION_SWAP_INSTANCE_SURVIVED_CODE),
  );
}

describe("b0371 — the tripwire trip sites are wired into the registered handlers", () => {
  it("(1) TRIP via the registered slash handler: an armed instance emits one survived row and fail-fast-terminates before dispatch", async () => {
    // session-only-degraded-state.md:14 (**Trip.**) + :18 criterion (2): a
    // theta-registered slash handler invoked against an armed tripwire emits
    // exactly one `theta/host/session-swap-instance-survived` row via
    // `console.error` and fail-fast-terminates — driven through the REGISTERED
    // handler (factory.ts:631 `drainGatedHandler`), not the guard directly.
    let ran = false;
    const demo = makeTheta("demo", async () => {
      ran = true;
    });
    const registry = new ThetaRegistry([["demo", demo]]);
    const terminator = terminatorSpy();
    const harness = await boot(registry, [demo], terminator);

    // Arm the survived-instance tripwire directly (the arming half is proven by
    // tests/session-swap-tripwire.test.ts cka-27 — this cell isolates the TRIP
    // half). The armed registry IS the factory's `liveRegistry` (factory.ts:893).
    registry.armSessionSwapTornDown("new");

    // PRIMARY red: the guard is unwired, so the handler dispatches normally and
    // resolves instead of rejecting with the fail-fast sentinel.
    await expect(invoke(harness, "demo")).rejects.toThrow(FailFastSignal);
    // PRIMARY red: no survived row is emitted at the trip site (currently zero).
    expect(survivedRows()).toHaveLength(1);
    // The trip terminates before dispatch, so the theta body never runs and the
    // ordinary drained/superseded note masquerade never appears
    // (session-only-degraded-state.md:14 "MUST NOT … continued operation").
    expect(terminator.terminate).toHaveBeenCalledTimes(1);
    expect(ran).toBe(false);
    expect(
      thetaNotes(harness).some((n) => n.content === "theta /demo: extension shutting down"),
    ).toBe(false);
  });

  it("(2) TRIP via a rebind session_start: a second session_start against an armed instance emits one survived row and terminates before the supersession pass", async () => {
    // session-only-degraded-state.md:14 (**Trip.**) + :18 criterion (2): the
    // `session_start` handler (factory.ts:536) MUST read `sessionSwapTornDown`
    // at entry and, when armed, trip before running the normal repeat-start
    // supersession pass.
    const demo = makeTheta("demo", async () => {});
    const registry = new ThetaRegistry([["demo", demo]]);
    const terminator = terminatorSpy();
    const harness = await boot(registry, [demo], terminator);

    // Arm the factory-scoped live registry (the SAME object handed to
    // composeInstance, assigned to `liveRegistry` at factory.ts:893).
    registry.armSessionSwapTornDown("new");

    // PRIMARY red: the rebind session_start proceeds through the compose pass
    // and resolves instead of tripping.
    await expect(harness.fireSessionStart()).rejects.toThrow(FailFastSignal);
    // PRIMARY red: no survived row (currently zero).
    expect(survivedRows()).toHaveLength(1);
    expect(terminator.terminate).toHaveBeenCalledTimes(1);
    // PRIMARY red: the trip precedes (and thus suppresses) the normal
    // repeat-start supersession note that the current unwired path emits.
    expect(
      thetaNotes(harness).some((n) =>
        n.content ===
        "theta: repeat session_start without session_shutdown; superseding prior hot-reload generation",
      ),
    ).toBe(false);
  });

  it("(3) DORMANT control: an UNARMED instance dispatches normally — zero survived rows, no termination, no throw", async () => {
    // session-only-degraded-state.md:18 criterion (3): under the normal rebind
    // (fresh unarmed registry) the guard is dormant — the registered handler
    // dispatches as usual and the process is not terminated. This is the
    // byte-identical-neighbour control: GREEN before AND after the fix, proving
    // dormancy does not disturb normal dispatch.
    let ran = false;
    const demo = makeTheta("demo", async () => {
      ran = true;
    });
    const registry = new ThetaRegistry([["demo", demo]]);
    const terminator = terminatorSpy();
    const harness = await boot(registry, [demo], terminator);

    // Do NOT arm.
    await invoke(harness, "demo");

    expect(ran).toBe(true);
    expect(survivedRows()).toHaveLength(0);
    expect(terminator.terminate).not.toHaveBeenCalled();
    expect(thetaNotes(harness)).toEqual([]);
  });
});
