// RFC-0012 §3 — the factory's handling of a child's result channel: latched
// from the compose wiring, handed back into a repeat `session_start` compose
// (one process, one connection — the parent drops a second dialer), and closed
// AFTER the `session_shutdown` teardown so the envelope frame is on the wire
// before the socket ends. In-process over the real factory + real
// `composeExtensionInstance`; the channel client is a fake; zero processes.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createThetaExtension, type ThetaExtensionDeps } from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import type { ResultChannelClient } from "../src/runtime/subagent-result-channel";
import type { ExecutableHost } from "../src/runtime/subagent-launcher";
import { SUBAGENT_PARENT_PID_ENV } from "../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import { FakeClock } from "./helpers/fake-clock";

const AVAILABLE_MODEL = { id: "claude-test", provider: "anthropic", api: "anthropic-messages" };

function resolvingHost(): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  fire(event: string, payload: Record<string, unknown>): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const subscriptions = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();
  const commands = new Map<string, unknown>();
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
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
    registerProvider: (): void => {},
    unregisterProvider: (): void => {},
    setModel: (): Promise<boolean> => Promise.resolve(true),
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: false,
    model: AVAILABLE_MODEL,
    isIdle: (): boolean => true,
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [AVAILABLE_MODEL],
      find: (): undefined => undefined,
    },
    sessionManager: { getEntries: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
  return {
    pi,
    ctx,
    fire: async (event, payload): Promise<void> => {
      for (const handler of subscriptions.get(event) ?? []) {
        await handler(payload, ctx);
      }
    },
  };
}

function fakeClient(): ResultChannelClient & { closed: number } {
  const client = {
    closed: 0,
    writeLine: (): void => {},
    stderr: (): void => {},
    close: (): void => {
      client.closed += 1;
    },
  };
  return client;
}

describe("RFC-0012 §3 — the factory latches, reuses and closes the child's result channel", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-rfc0012-channel-factory-"));
    const dir = join(workspace, ".pi", "theta");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "clean.theta"), ["---", "mode: subagent", "---", '"ok"', ""].join("\n"), "utf8");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("first compose dials (here: the injected client); a repeat session_start hands the LIVE client back in; session_shutdown closes it exactly once, after the teardown", async () => {
    const harness = makeHarness(workspace);
    const client = fakeClient();
    const handedIn: (ResultChannelClient | undefined)[] = [];
    let teardownSawOpenChannel: boolean | undefined;
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      isSubagentChild: true,
      composeInstance: async (pi, ctx, ownRegisteredNames, entryChannel, latchStatusBus, inProcessTools, resultChannel) => {
        handedIn.push(resultChannel);
        return composeExtensionInstance(
          pi,
          ctx,
          {
            clock: new FakeClock(),
            subagentExecutableHost: resolvingHost(),
            subagentControlPlane: {
              env: { [SUBAGENT_ROOT_ENV_MARKER]: "clean", [SUBAGENT_PARENT_PID_ENV]: "1" },
              entry: { kind: "theta" },
              launch: { nonce: "n", presentation: "visible", channel: { port: 45000, token: "t" } },
            },
            // The first pass has no live client and would dial; the fake stands
            // in for the socket. A repeat pass MUST receive it back.
            subagentResultChannel: resultChannel ?? client,
          },
          undefined,
          ownRegisteredNames,
          entryChannel,
          latchStatusBus,
          inProcessTools,
        );
      },
    };
    createThetaExtension(deps)(harness.pi);

    await harness.fire("session_start", { type: "session_start" });
    expect(handedIn).toEqual([undefined]);
    expect(client.closed).toBe(0);

    await harness.fire("session_start", { type: "session_start" });
    expect(handedIn).toEqual([undefined, client]);
    expect(client.closed).toBe(0);

    // Observe ordering: the channel is still open while the teardown runs.
    const originalClose = client.close;
    client.close = (): void => {
      teardownSawOpenChannel = teardownSawOpenChannel ?? true;
      originalClose();
    };
    await harness.fire("session_shutdown", { type: "session_shutdown", reason: "quit" });
    expect(client.closed).toBe(1);
    expect(teardownSawOpenChannel).toBe(true);

    // A re-delivered shutdown finds nothing to close.
    await harness.fire("session_shutdown", { type: "session_shutdown", reason: "quit" });
    expect(client.closed).toBe(1);
  });

  it("a pipe child (no channel) hands nothing in and closes nothing", async () => {
    const harness = makeHarness(workspace);
    const handedIn: (ResultChannelClient | undefined)[] = [];
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      isSubagentChild: true,
      composeInstance: async (pi, ctx, ownRegisteredNames, entryChannel, latchStatusBus, inProcessTools, resultChannel) => {
        handedIn.push(resultChannel);
        return composeExtensionInstance(
          pi,
          ctx,
          {
            clock: new FakeClock(),
            subagentExecutableHost: resolvingHost(),
            subagentControlPlane: {
              env: { [SUBAGENT_ROOT_ENV_MARKER]: "clean", [SUBAGENT_PARENT_PID_ENV]: "1" },
              entry: { kind: "theta" },
            },
          },
          undefined,
          ownRegisteredNames,
          entryChannel,
          latchStatusBus,
          inProcessTools,
        );
      },
    };
    createThetaExtension(deps)(harness.pi);
    await harness.fire("session_start", { type: "session_start" });
    await harness.fire("session_start", { type: "session_start" });
    await harness.fire("session_shutdown", { type: "session_shutdown", reason: "quit" });
    expect(handedIn).toEqual([undefined, undefined]);
  });
});
