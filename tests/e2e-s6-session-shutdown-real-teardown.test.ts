import { describe, expect, it, vi } from "vitest";
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
import { ThetaRegistry, type ParsedTheta } from "../src/extension/reload-wiring";
import {
  ActiveInvocationRegistry,
  type ActiveInvocationEntry,
} from "../src/runtime/active-invocation-registry";
import type { ForwardingSignalSource } from "../src/extension/session-shutdown";
import { FakeClock } from "./helpers/fake-clock";

// S6 (PIC/SESS) — the factory `session_shutdown` teardown operates on the REAL
// shared `ActiveInvocationRegistry` and `forwardingSignals` sink threaded from
// the `composeInstance` path (`ExtensionInstanceWiring`).
//
// This closes the coverage hole in `tests/session-shutdown-wiring.test.ts`
// (which boots with an EMPTY `ActiveInvocationRegistry` + empty
// `forwardingSignals`, so it never witnesses a real entry being aborted /
// listener detached through the factory) and in `tests/session-shutdown.test.ts`
// (which drives `runSessionShutdown` directly, not through the factory wiring).
//
// It also documents the CODE-CORRECT / COMMENT-STALE drift flagged in
// docs/e2e-campaign/analysis/code-surface.md §5: the factory comment at
// src/extension/factory.ts:502-509 states sub-steps 2/3/5 are "live-but-empty
// until Increment B", but the shipped tree threads
// `liveActiveInvocations`/`liveForwardingSignals` (factory.ts:483-487,
// production-composition.ts:1500/1509) so those sub-steps operate on REAL entries.
//
// Spec: pi-integration-contract/session-shutdown-semantics.md sub-step 2
// (stamp reason then `thetaAbort.abort`), sub-step 5 (detach forwarding
// listeners); REQ-PIC-35/76/78/81, REQ-SESS-3/SESS-4. No filesystem, no live
// model, no real watcher.

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

function makeTheta(slashName: string): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run: async (): Promise<void> => {},
  };
}

/** A single in-flight entry whose `disposeBarrier` is already settled so
 * sub-step 3's bounded await completes immediately. */
function seededEntry(theta: string, invocationId: string): ActiveInvocationEntry {
  return {
    thetaAbort: new AbortController(),
    disposeBarrier: Promise.resolve(),
    shutdownReason: undefined,
    theta,
    invocationId,
  };
}

function signalSpy(
  label: ForwardingSignalSource["label"],
): ForwardingSignalSource & { removeEventListener: ReturnType<typeof vi.fn> } {
  return { label, removeEventListener: vi.fn() };
}

interface Booted {
  readonly harness: Harness;
  readonly activeInvocations: ActiveInvocationRegistry;
  readonly forwardingSignals: (ForwardingSignalSource & {
    removeEventListener: ReturnType<typeof vi.fn>;
  })[];
  readonly detach: ReturnType<typeof vi.fn>;
}

/** Boot through the REAL factory with a `composeInstance` returning a wiring
 * that carries a SEEDED shared registry + forwarding-signal sink. */
async function boot(): Promise<Booted> {
  const harness = makeHarness();
  const registry = new ThetaRegistry([["foo", makeTheta("foo")]]);
  const activeInvocations = new ActiveInvocationRegistry();
  activeInvocations.add(seededEntry("foo", "11111111-1111-4111-8111-111111111111"));
  activeInvocations.add(seededEntry("bar", "22222222-2222-4222-8222-222222222222"));
  const forwardingSignals = [
    signalSpy("ctx.signal.removeEventListener"),
    signalSpy("toolSignal.removeEventListener"),
  ];
  const detach = vi.fn();
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: async (): Promise<ExtensionInstanceWiring> => ({
      thetas: [makeTheta("foo")],
      registry,
      activeInvocations,
      forwardingSignals,
      clock: new FakeClock(),
      installHotReload: () => ({ detach }),
    }),
  };
  createThetaExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  return { harness, activeInvocations, forwardingSignals, detach };
}

describe("S6 — factory session_shutdown threads the REAL shared registry (sub-step 2)", () => {
  it("aborts every seeded in-flight entry and stamps its shutdownReason with the captured reason", async () => {
    const { harness, activeInvocations } = await boot();
    const entries = activeInvocations.snapshot();
    expect(entries).toHaveLength(2);
    // Pre-teardown: no entry is aborted or stamped.
    expect(entries.every((e) => e.thetaAbort.signal.aborted)).toBe(false);
    expect(entries.every((e) => e.shutdownReason === undefined)).toBe(true);

    await harness.fireSessionShutdown("quit");

    // Sub-step 2 ran over the REAL threaded entries (contra the stale
    // factory.ts:502-509 "live-but-empty" comment).
    for (const entry of entries) {
      expect(entry.thetaAbort.signal.aborted).toBe(true);
      expect(entry.shutdownReason).toBe("quit");
      // CNCL-4 synthesised abort reason is observable on the signal.
      const reason = entry.thetaAbort.signal.reason as Error;
      expect(reason).toBeInstanceOf(Error);
      expect(reason.message).toBe("theta cancelled by session shutdown");
    }
  });

  it("stamps the captured session-only reason (fork) onto every entry", async () => {
    const { harness, activeInvocations } = await boot();
    await harness.fireSessionShutdown("fork");
    for (const entry of activeInvocations.snapshot()) {
      expect(entry.thetaAbort.signal.aborted).toBe(true);
      expect(entry.shutdownReason).toBe("fork");
    }
  });
});

describe("S6 — factory session_shutdown threads the REAL forwarding sink (sub-step 5)", () => {
  it("detaches every seeded forwarding listener exactly once", async () => {
    const { harness, forwardingSignals } = await boot();
    await harness.fireSessionShutdown("reload");
    for (const signal of forwardingSignals) {
      expect(signal.removeEventListener).toHaveBeenCalledTimes(1);
    }
  });

  it("still detaches watcher (sub-step 4) alongside the real sub-step 2/5 work", async () => {
    const { harness, detach } = await boot();
    await harness.fireSessionShutdown("quit");
    expect(detach).toHaveBeenCalledTimes(1);
  });
});
