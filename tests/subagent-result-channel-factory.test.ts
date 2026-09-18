// RFC-0012 §3 — the factory's handling of a child's result channel: latched
// from the compose wiring, handed back into a repeat `session_start` compose
// (one process, one connection — the parent drops a second dialer), and closed
// AFTER the `session_shutdown` teardown so the envelope frame is on the wire
// before the socket ends. In-process over the real factory + real
// `composeExtensionInstance`; the channel client is a fake; zero processes.

import { resolvingHost } from "./helpers/fake-json-child";
import { makeIdleModelHost } from "./helpers/compose-workspace-harness";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plantThetaWorkspace, disposeWorkspace } from "./helpers/production-load-harness";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createThetaExtension, type ThetaExtensionDeps } from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import type { ResultChannelClient } from "../src/runtime/subagent-result-channel";

import { SUBAGENT_PARENT_PID_ENV } from "../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import { FakeClock } from "./helpers/fake-clock";

interface Harness {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  fire(event: string, payload: Record<string, unknown>): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const subscriptions = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();
  const commands = new Map<string, unknown>();
  const { pi: basePi, ctx } = makeIdleModelHost(cwd, false);
  const pi = {
    ...basePi,
    registerFlag: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
  } as unknown as ExtensionAPI;
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
    workspace = plantThetaWorkspace("theta-rfc0012-channel-factory-", [
      { stem: "clean", text: ["---", "mode: subagent", "---", '"ok"', ""].join("\n") },
    ]);
  });

  afterEach(() => {
    disposeWorkspace(workspace);
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
