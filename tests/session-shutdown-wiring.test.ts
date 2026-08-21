import { assert, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionShutdownEvent,
} from "@earendil-works/pi-coding-agent";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import type { ExtensionInstanceWiring } from "../src/extension/production-composition";
import {
  ThetaRegistry,
  type ParsedTheta,
} from "../src/extension/reload-wiring";
import { FakeClock } from "./helpers/fake-clock";
import { ActiveInvocationRegistry } from "../src/runtime/active-invocation-registry";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// Increment A/B1 — the factory-level `session_shutdown` wiring integration.
//
// Proves the wiring in `factory.ts`: the `session_shutdown` handler reads the
// live `ThetaRegistry` + `Clock` + `ActiveInvocationRegistry` lazily (threaded
// from the `composeInstance` path), runs the handler-entry short-circuit under
// the PIC-31 read-failover, and delegates to `runSessionShutdown`. Sub-step 1
// (drain + init-tag) and sub-step 4 (watcher-close via the
// `HotReloadHandle.detach()` adapter) are REAL. Increment B1 makes sub-steps 2
// (cancel in-flight) + 3 (await dispose) REAL too: the factory now reads the
// SHARED `ActiveInvocationRegistry` the composition threads through the producer
// (`liveActiveInvocations`) rather than a fresh empty one, so entries in that
// registry are aborted + awaited at teardown. Sub-step 5 (forwarding listeners)
// stays empty (Increment B2).
//
// The harness mirrors the fake-pi harness in
// `tests/drain-gated-dispatch-integration.test.ts` /
// `tests/watcher-hot-reload-integration.test.ts`: a fake `pi` capturing the
// `pi.on` subscription table, a `composeInstance` stub returning a
// caller-controlled `ThetaRegistry` + `FakeClock` + a spyable
// `installHotReload().detach`, and a `fireSessionShutdown(reason)` that invokes
// the registered handler and awaits its returned promise. NO filesystem, NO
// real watcher, NO live model.

interface Harness {
  readonly pi: ExtensionAPI;
  readonly subscriptions: Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >;
  fireSessionStart(): Promise<void>;
  fireSessionShutdown(reason: SessionShutdownEvent["reason"]): Promise<void>;
}

function makeHarness(): Harness {
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
    on: (
      event: string,
      handler: (e: unknown, c: ExtensionContext) => unknown,
    ): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
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
    subscriptions,
    fireSessionStart: () => fire("session_start", { type: "session_start" }),
    fireSessionShutdown: (reason) =>
      fire("session_shutdown", { type: "session_shutdown", reason }),
  };
}

/** A minimal `ParsedTheta` (only `slashName` + `run` are ever read here). */
function makeTheta(slashName: string): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run: async (): Promise<void> => {},
  };
}

interface Booted {
  readonly harness: Harness;
  readonly registry: ThetaRegistry;
  readonly detach: ReturnType<typeof vi.fn>;
  readonly activeInvocations: ActiveInvocationRegistry;
}

/**
 * Boot the extension through the REAL factory with a deterministic
 * `composeInstance` returning the given registry + a `FakeClock` + a spyable
 * `installHotReload().detach`, then fire `session_start` so the live resources
 * are threaded onto the factory-scoped mutables the shutdown handler reads.
 */
async function boot(
  registry: ThetaRegistry,
  activeInvocations: ActiveInvocationRegistry = new ActiveInvocationRegistry(),
): Promise<Booted> {
  const harness = makeHarness();
  const detach = vi.fn();
  const thetas = [makeTheta("foo")];
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: async (): Promise<ExtensionInstanceWiring> => ({
      thetas,
      registry,
      activeInvocations,
      forwardingSignals: [],
      clock: new FakeClock(),
      installHotReload: () => ({ detach }),
    }),
  };
  createThetaExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  return { harness, registry, detach, activeInvocations };
}

describe("Increment A — session_shutdown wired through the real factory", () => {
  it("(sub-step 1 real) drains and inits the drain-state tag exactly once", async () => {
    const registry = new ThetaRegistry([["foo", makeTheta("foo")]]);
    const drainSpy = vi.spyOn(registry, "drain");
    const { harness } = await boot(registry);

    // Steady-state before teardown: the short-circuit must NOT fire.
    expect(registry.readDrainState()).toEqual({ drained: false, tag: undefined });

    await harness.fireSessionShutdown("quit");

    // Sub-step 1 ran: `drain()` then `initDrainStateTag()`.
    expect(registry.readDrainState()).toEqual({
      drained: true,
      tag: "shutting-down",
    });
    expect(drainSpy).toHaveBeenCalledTimes(1);
  });

  it("(sub-step 4) detaches the watcher via the HotReloadHandle.detach adapter exactly once", async () => {
    const registry = new ThetaRegistry([["foo", makeTheta("foo")]]);
    const { harness, detach } = await boot(registry);

    await harness.fireSessionShutdown("reload");

    // The ClosableWatcher adapter delegated sub-step 4's watcher-close +
    // debounce-cancel to `hotReloadHandle.detach()`.
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("(idempotent re-entry) a second session_shutdown short-circuits — drain stays once, no throw", async () => {
    const registry = new ThetaRegistry([["foo", makeTheta("foo")]]);
    const drainSpy = vi.spyOn(registry, "drain");
    const { harness, detach } = await boot(registry);

    await harness.fireSessionShutdown("quit");
    // Second delivery: the tag is now set, so the handler-entry short-circuit
    // fires (host-prerequisites clause (b)) and no sub-step runs again.
    await expect(harness.fireSessionShutdown("quit")).resolves.toBeUndefined();

    expect(drainSpy).toHaveBeenCalledTimes(1);
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("(read-failover proceeds) a readDrainState throw at handler entry fails OPEN into the full teardown", async () => {
    const registry = new ThetaRegistry([["foo", makeTheta("foo")]]);
    const drainSpy = vi.spyOn(registry, "drain");

    // Make the FIRST handler-entry `readDrainState` throw, then restore the real
    // reader (so the post-teardown assertion reads the real drain tuple). The
    // fail-open path (returns `false`) must drive the full five-sub-step
    // teardown rather than stranding resources.
    const realReadDrainState = registry.readDrainState.bind(registry);
    let threw = false;
    registry.readDrainState = (): ReturnType<typeof realReadDrainState> => {
      if (!threw) {
        threw = true;
        throw new Error("readDrainState boom (handler-entry)");
      }
      return realReadDrainState();
    };

    const { harness, detach } = await boot(registry);
    await expect(harness.fireSessionShutdown("quit")).resolves.toBeUndefined();

    // Full teardown ran despite the entry read throwing.
    expect(threw).toBe(true);
    expect(drainSpy).toHaveBeenCalledTimes(1);
    expect(detach).toHaveBeenCalledTimes(1);
    expect(realReadDrainState()).toEqual({
      drained: true,
      tag: "shutting-down",
    });
  });

  it("(compose-never-ran safety) firing session_shutdown with no composeInstance does not throw", async () => {
    // No `composeInstance` → `liveRegistry`/`liveClock` stay undefined; the
    // handler must no-op safely (nothing wired to tear down).
    const harness = makeHarness();
    createThetaExtension({ fixtures: [] })(harness.pi);
    await harness.fireSessionStart();

    await expect(harness.fireSessionShutdown("quit")).resolves.toBeUndefined();
  });
});

// ============================================================================
// Bug 0216 — the factory-level half of the unknown-reason wiring
//
// `factory.ts` owns two of the wiring's obligations, and neither is observable
// from a direct `runSessionShutdown` drive:
//   (a) the `SessionShutdownDeps.inventory` it injects must be the real
//       `SDK_SURFACE_INVENTORY` (PIC-46 single-site constant source), not
//       `undefined` — an `undefined` inventory routes every teardown to
//       `pinned-constant-unreadable` / `"missing-entry"`;
//   (b) the `event.reason` read must happen INSIDE the classifier, so a
//       throwing property-access getter routes to
//       `theta/host/session-shutdown-reason-unknown` with
//       `details.observed === "<unreadable>"` rather than to the subscription's
//       own `catch`, which reports `theta/load/extension-bootstrap-failed`.
//
// Spec: pi-integration-contract/unknown-reason-rule.md:6 (PIC-46, PIC-47);
// diagnostics/code-registry-host.md:11, :12.
// ============================================================================

const REASON_UNKNOWN_CODE = "theta/host/session-shutdown-reason-unknown";
const PINNED_CONSTANT_UNREADABLE_CODE =
  "theta/host/session-shutdown-pinned-constant-unreadable";
const BOOTSTRAP_FAILED_CODE = "theta/load/extension-bootstrap-failed";

interface BootedWithDiagnostics {
  readonly harness: Harness;
  /** Everything the factory pushed through `deps.emitDiagnostic`. */
  readonly bootstrapDiagnostics: readonly Diagnostic[];
}

/**
 * Boot through the REAL factory with the bootstrap diagnostic sink connected, so
 * a mis-routed getter throw is observable as a `theta/load/*` row rather than
 * being silently swallowed by the optional-call.
 */
async function bootWithDiagnosticSink(): Promise<BootedWithDiagnostics> {
  const harness = makeHarness();
  const bootstrapDiagnostics: Diagnostic[] = [];
  const registry = new ThetaRegistry([["foo", makeTheta("foo")]]);
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      bootstrapDiagnostics.push(diagnostic);
    },
    composeInstance: async (): Promise<ExtensionInstanceWiring> => ({
      thetas: [makeTheta("foo")],
      registry,
      activeInvocations: new ActiveInvocationRegistry(),
      forwardingSignals: [],
      clock: new FakeClock(),
      installHotReload: () => ({ detach: vi.fn() }),
    }),
  };
  createThetaExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  return { harness, bootstrapDiagnostics };
}

/**
 * Deliver an arbitrary `session_shutdown` payload to the registered handler and
 * return the diagnostics the teardown sink wrote to `console.error`. The payload
 * is passed unmodified (the harness's own `fireSessionShutdown` builds it from a
 * plain reason string, which cannot carry a throwing getter).
 */
async function driveRawShutdown(
  harness: Harness,
  event: unknown,
): Promise<readonly Diagnostic[]> {
  const handlers = harness.subscriptions.get("session_shutdown") ?? [];
  assert(
    handlers.length === 1,
    `expected exactly one session_shutdown subscription, observed ${handlers.length}`,
  );
  const lines: unknown[] = [];
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args[0]);
  });
  try {
    for (const handler of handlers) {
      // The subscription reads only its event argument; the ctx is unused.
      await handler(event, undefined as unknown as ExtensionContext);
    }
  } finally {
    errorSpy.mockRestore();
  }
  return lines
    // The PIC-25 bare-`code` fallback line is not JSON; only serialised
    // diagnostics are parsed.
    .filter((line): line is string => typeof line === "string" && line.startsWith("{"))
    .map((line) => JSON.parse(line) as Diagnostic);
}

describe("bug 0216 — factory-level unknown-reason wiring", () => {
  it("injects the real SDK_SURFACE_INVENTORY — an out-of-set reason emits reason-unknown, never pinned-constant-unreadable (PIC-46)", async () => {
    const { harness } = await bootWithDiagnosticSink();

    const emitted = await driveRawShutdown(harness, {
      type: "session_shutdown",
      reason: "hibernate",
    });

    // `inventory: undefined` at the injection site would surface
    // `"missing-entry"` here instead of the drift row.
    expect(emitted.filter((d) => d.code === PINNED_CONSTANT_UNREADABLE_CODE)).toHaveLength(0);
    const unknownRows = emitted.filter((d) => d.code === REASON_UNKNOWN_CODE);
    expect(unknownRows).toHaveLength(1);
    expect(unknownRows[0]?.details).toStrictEqual({ observed: "hibernate" });
  });

  it("routes a THROWING event.reason getter to session-shutdown-reason-unknown with details.observed `<unreadable>`, not to extension-bootstrap-failed (PIC-47)", async () => {
    const { harness, bootstrapDiagnostics } = await bootWithDiagnosticSink();

    const emitted = await driveRawShutdown(harness, {
      type: "session_shutdown",
      get reason(): unknown {
        throw new Error("reason getter boom");
      },
    });

    // The read must happen inside the classifier's own `try`, so the
    // subscription's bootstrap-failed `catch` is never reached.
    expect(bootstrapDiagnostics.filter((d) => d.code === BOOTSTRAP_FAILED_CODE)).toHaveLength(0);
    const unknownRows = emitted.filter((d) => d.code === REASON_UNKNOWN_CODE);
    expect(unknownRows).toHaveLength(1);
    expect(unknownRows[0]?.details).toStrictEqual({ observed: "<unreadable>" });
  });
});
