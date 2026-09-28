// Bug 0493 D1 (b) — the composition root arms the parent-liveness watchdog.
//
// The watchdog module (`src/runtime/subagent-parent-watchdog.ts`, unit cells in
// `tests/subagent-parent-watchdog.test.ts`) is inert until the production
// composition arms it. These cells pin that wiring:
//
//   - armed iff the subagent-root regime is active AND the unified control-plane
//     view (`controlPlane.env[PI_THETA_SUBAGENT_PARENT_PID]` — env carriage or
//     launch file alike) carries a valid parent pid;
//   - never armed on the parent / harness path (no regime), whatever pid the
//     environment carries;
//   - armed ONCE per process: a repeat `session_start` compose reuses the armed
//     handle the factory hands back — the same pattern as the child's result
//     channel (`subagentResultChannel`);
//   - cleared at `session_shutdown`.
//
// THE SEAMS THESE CELLS BIND:
//
//   ComposeSeamOverrides.subagentParentWatchdogSeams?: SubagentParentWatchdogSeams
//     — the watchdog's process seams (own pid, liveness probe, interval
//       scheduler, stderr writer, endProcess); production default
//       `createProductionParentWatchdogSeams()`.
//   ComposeSeamOverrides.subagentParentWatchdog?: SubagentParentWatchdogHandle
//     — an ALREADY-ARMED handle a repeat compose reuses instead of arming again.
//   ExtensionInstanceWiring.parentWatchdog?: SubagentParentWatchdogHandle
//     — exposed so the factory latches it, hands it back into a repeat
//       compose, and disposes it at `session_shutdown`.
//   ThetaExtensionDeps.composeInstance(…, runCardView, parentWatchdog?)
//     — the factory's latched handle, as a new trailing positional parameter
//       beside `resultChannel`.
//
// Arming is observed through the injected scheduler: one `setInterval` at the
// poll cadence means armed; none means not armed. The shipped default-export
// cell injects nothing: it observes the production seams' real `setInterval`
// through a spy, because the shipped `composeInstance` closure is the one
// forwarding the factory's latched handle and no test double may stand in
// for it.
//
// TIER: in-process composition root — the real factory and the real
// `composeExtensionInstance` over a planted workspace, a fake scheduler (the
// shipped-closure cell: a spied real one), zero processes, no provider.
//
// Spec: docs/bugs/0493-visible-children-no-parent-tether-silent-print-parent.md
// §Fix "D1 (b)" and §"Witnesses" 2; subagent.md #subagent-orphan-prevention.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fakeExecutableHost } from "./helpers/fake-json-child";
import { makeIdleModelHost, makeInertSdkMembers } from "./helpers/compose-workspace-harness";
import { disposeWorkspace, plantThetaWorkspace, theta } from "./helpers/production-load-harness";
import { FakeClock } from "./helpers/fake-clock";
import {
  createEnvSandbox,
  restoreAmbientControlPlane,
  scrubAmbientControlPlane,
  type AmbientControlPlaneSnapshot,
} from "./helpers/ambient-control-plane-scrub";
import thetaExtension, { createThetaExtension, type ThetaExtensionDeps } from "../src/extension/factory";
import {
  composeExtensionInstance,
  type ComposeSeamOverrides,
  type ExtensionInstanceWiring,
} from "../src/extension/production-composition";
import { SUBAGENT_PARENT_PID_ENV } from "../src/runtime/subagent-launcher";
import type { SubagentChildControlPlane } from "../src/runtime/subagent-launch-file";
import type { ResultChannelClient } from "../src/runtime/subagent-result-channel";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import {
  SUBAGENT_PARENT_LIVENESS_POLL_MS as POLL_MS,
  type SubagentParentWatchdogHandle as WatchdogHandle,
  type SubagentParentWatchdogSeams as WatchdogSeams,
  type WatchdogTimer,
} from "../src/runtime/subagent-parent-watchdog";

const OWN_PID = 1000;
const PARENT_PID = 4242;

type WatchdogOverrides = ComposeSeamOverrides;
type WatchdogWiring = ExtensionInstanceWiring;

interface SchedulerRig {
  readonly seams: WatchdogSeams;
  readonly intervals: { readonly callback: () => void; readonly ms: number; readonly timer: WatchdogTimer }[];
  readonly unrefs: WatchdogTimer[];
  readonly cleared: WatchdogTimer[];
  readonly stderr: string[];
  readonly ended: number[];
  liveness: "alive" | "gone";
  tick(): void;
}

function makeSchedulerRig(): SchedulerRig {
  const rig: SchedulerRig = {
    intervals: [],
    unrefs: [],
    cleared: [],
    stderr: [],
    ended: [],
    liveness: "alive",
    tick: (): void => {
      for (const interval of rig.intervals) {
        if (!rig.cleared.includes(interval.timer)) {
          interval.callback();
        }
      }
    },
    seams: {
      ownPid: OWN_PID,
      probe: (): "alive" | "gone" => rig.liveness,
      scheduler: {
        setInterval: (callback: () => void, ms: number): WatchdogTimer => {
          const timer: WatchdogTimer = {
            unref: (): WatchdogTimer => {
              rig.unrefs.push(timer);
              return timer;
            },
          };
          rig.intervals.push({ callback, ms, timer });
          return timer;
        },
        clearInterval: (timer: WatchdogTimer): void => {
          rig.cleared.push(timer);
        },
      },
      writeStderr: (text: string): void => {
        rig.stderr.push(text);
      },
      endProcess: (code: number): void => {
        rig.ended.push(code);
      },
    },
  };
  return rig;
}

function inertResultChannel(): ResultChannelClient {
  return { writeLine: (): void => {}, stderr: (): void => {}, close: (): void => {} };
}

/** A regime-active control plane over the env carriage (`pipe`). */
function pipeChildPlane(parentPid: string | undefined, rootSlug = "clean"): SubagentChildControlPlane {
  return {
    env: {
      [SUBAGENT_ROOT_ENV_MARKER]: rootSlug,
      ...(parentPid !== undefined ? { [SUBAGENT_PARENT_PID_ENV]: parentPid } : {}),
    },
    entry: { kind: "theta" },
  };
}

/** A regime-active control plane projected from a visible launch file. */
function visibleChildPlane(parentPid: string): SubagentChildControlPlane {
  return {
    env: { [SUBAGENT_ROOT_ENV_MARKER]: "clean", [SUBAGENT_PARENT_PID_ENV]: parentPid },
    entry: { kind: "theta" },
    launch: { nonce: "n-b0493", presentation: "visible", channel: { port: 45093, token: "t-b0493" } },
  };
}

let workspace: string;
let ambient: AmbientControlPlaneSnapshot | undefined;

beforeAll(() => {
  // The harness-path cell reads the RUNNING process's control plane; a run from
  // inside a subagent child must not leak its own marker into it.
  ambient = scrubAmbientControlPlane();
  workspace = plantThetaWorkspace("theta-b0493-watchdog-compose-", [
    { stem: "clean", text: theta("---", "mode: subagent", "---", '"ok"') },
  ]);
});

afterAll(() => {
  disposeWorkspace(workspace);
  if (ambient !== undefined) {
    restoreAmbientControlPlane(ambient);
    ambient = undefined;
  }
});

async function compose(
  rig: SchedulerRig,
  extra: Omit<WatchdogOverrides, "subagentParentWatchdogSeams">,
): Promise<WatchdogWiring> {
  const { pi, ctx } = makeIdleModelHost(workspace, false);
  const overrides: WatchdogOverrides = {
    clock: new FakeClock(),
    subagentExecutableHost: fakeExecutableHost(),
    emitResultEnvelope: (): void => {},
    subagentParentWatchdogSeams: rig.seams,
    ...extra,
  };
  return (await composeExtensionInstance(pi, ctx, overrides)) as WatchdogWiring;
}

describe("bug 0493 D1 (b) — composition arms the watchdog iff regime ∧ valid parent-pid carriage", () => {
  it("regime active + valid env-carried pid ⇒ ONE unref'd interval at the poll cadence, exposed on the wiring", async () => {
    const rig = makeSchedulerRig();
    const wiring = await compose(rig, { subagentControlPlane: pipeChildPlane(String(PARENT_PID)) });
    expect(
      rig.intervals.map((interval) => interval.ms),
      "a subagent child whose control plane names a live parent pid must poll that parent",
    ).toEqual([POLL_MS]);
    expect(rig.unrefs).toEqual([rig.intervals[0]?.timer]);
    expect(wiring.parentWatchdog?.parentPid).toBe(PARENT_PID);
  });

  it("the armed watchdog is the real one: a poll that finds the parent gone writes the line and ends the process with 1", async () => {
    const rig = makeSchedulerRig();
    await compose(rig, { subagentControlPlane: pipeChildPlane(String(PARENT_PID)) });
    expect(rig.intervals).toHaveLength(1);
    rig.liveness = "gone";
    rig.tick();
    expect(rig.stderr).toEqual([`pi-theta: subagent child exiting \u2014 parent process ${PARENT_PID} gone\n`]);
    expect(rig.ended).toEqual([1]);
  });

  it("regime active + a pid carried by a VISIBLE launch file ⇒ armed (the unified control-plane view, not raw process.env)", async () => {
    const rig = makeSchedulerRig();
    const wiring = await compose(rig, {
      subagentControlPlane: visibleChildPlane(String(PARENT_PID)),
      subagentResultChannel: inertResultChannel(),
    });
    expect(rig.intervals.map((interval) => interval.ms)).toEqual([POLL_MS]);
    expect(wiring.parentWatchdog?.parentPid).toBe(PARENT_PID);
  });

  it("regime active + a REFUSED marked root still arms (the refusal child is exactly the orphan shape)", async () => {
    const rig = makeSchedulerRig();
    await compose(rig, { subagentControlPlane: pipeChildPlane(String(PARENT_PID), "no-such-root") });
    expect(rig.intervals.map((interval) => interval.ms)).toEqual([POLL_MS]);
  });

  it.each([
    ["absent", undefined],
    ["garbage", "not-a-pid"],
    ["zero", "0"],
    ["negative", "-7"],
    ["own pid", String(OWN_PID)],
  ])("CONTROL — regime active + %s pid carriage ⇒ never armed", async (_label, raw) => {
    const rig = makeSchedulerRig();
    const wiring = await compose(rig, { subagentControlPlane: pipeChildPlane(raw) });
    expect(rig.intervals).toEqual([]);
    expect(wiring.parentWatchdog).toBeUndefined();
  });

  it("CONTROL — the parent path (no regime marker) is never armed, even with a valid pid in its control plane", async () => {
    const rig = makeSchedulerRig();
    const wiring = await compose(rig, {
      subagentControlPlane: { env: { [SUBAGENT_PARENT_PID_ENV]: String(PARENT_PID) }, entry: { kind: "theta" } },
    });
    expect(rig.intervals).toEqual([]);
    expect(wiring.parentWatchdog).toBeUndefined();
  });

  it("CONTROL — the harness path (no control plane handed in; the scrubbed process env has no regime) is never armed", async () => {
    const rig = makeSchedulerRig();
    const wiring = await compose(rig, {});
    expect(rig.intervals).toEqual([]);
    expect(wiring.parentWatchdog).toBeUndefined();
  });
});

describe("bug 0493 D1 (b) — once per process: a repeat compose reuses the armed handle", () => {
  it("a second compose handed the first wiring's handle arms nothing new and exposes the same handle", async () => {
    const rig = makeSchedulerRig();
    const plane = pipeChildPlane(String(PARENT_PID));
    const first = await compose(rig, { subagentControlPlane: plane });
    expect(rig.intervals, "precondition: the first compose armed the watchdog").toHaveLength(1);
    const second = await compose(rig, {
      subagentControlPlane: plane,
      ...(first.parentWatchdog !== undefined ? { subagentParentWatchdog: first.parentWatchdog } : {}),
    });
    expect(rig.intervals).toHaveLength(1);
    expect(second.parentWatchdog).toBe(first.parentWatchdog);
  });
});

describe("bug 0493 D1 (b) — the factory latches, reuses and clears the watchdog", () => {
  interface FactoryHarness {
    readonly pi: ExtensionAPI;
    fire(event: string, payload: Record<string, unknown>): Promise<void>;
  }

  function makeFactoryHarness(): FactoryHarness {
    const subscriptions = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();
    const commands = new Map<string, unknown>();
    const { pi: basePi, ctx } = makeIdleModelHost(workspace, false);
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
      fire: async (event, payload): Promise<void> => {
        for (const handler of subscriptions.get(event) ?? []) {
          await handler(payload, ctx);
        }
      },
    };
  }

  it("two session_start composes arm ONE interval (the handle is handed back), and session_shutdown clears it exactly once", async () => {
    const rig = makeSchedulerRig();
    const handedIn: (WatchdogHandle | undefined)[] = [];
    const harness = makeFactoryHarness();
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      isSubagentChild: true,
      composeInstance: async (
        pi,
        ctx,
        ownRegisteredNames,
        entryChannel,
        latchStatusBus,
        inProcessTools,
        resultChannel,
        placementRegistration,
        runCardView,
        parentWatchdog?: WatchdogHandle,
      ) => {
        void placementRegistration;
        void runCardView;
        handedIn.push(parentWatchdog);
        const overrides: WatchdogOverrides = {
          clock: new FakeClock(),
          subagentExecutableHost: fakeExecutableHost(),
          emitResultEnvelope: (): void => {},
          subagentControlPlane: pipeChildPlane(String(PARENT_PID)),
          subagentParentWatchdogSeams: rig.seams,
          ...(resultChannel !== undefined ? { subagentResultChannel: resultChannel } : {}),
          ...(parentWatchdog !== undefined ? { subagentParentWatchdog: parentWatchdog } : {}),
        };
        return composeExtensionInstance(
          pi,
          ctx,
          overrides,
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
    expect(rig.intervals, "the first session_start compose must arm the watchdog").toHaveLength(1);
    const armed = rig.intervals[0]!.timer;

    await harness.fire("session_start", { type: "session_start" });
    expect(rig.intervals, "a repeat session_start must reuse the armed watchdog, not arm a second").toHaveLength(1);
    expect(handedIn[0]).toBeUndefined();
    expect(handedIn[1]).toBeDefined();
    expect(rig.cleared).toEqual([]);

    await harness.fire("session_shutdown", { type: "session_shutdown", reason: "quit" });
    expect(rig.cleared).toEqual([armed]);

    // A re-delivered shutdown finds nothing left to clear.
    await harness.fire("session_shutdown", { type: "session_shutdown", reason: "quit" });
    expect(rig.cleared).toEqual([armed]);
  });
});

describe("bug 0493 D1 (b) — the SHIPPED default export forwards the latched handle into a repeat compose", () => {
  it("two session_start composes through the shipped composeInstance closure arm ONE real poll interval, cleared at session_shutdown", async () => {
    // The shipped closure reads the authenticated process control plane, so
    // plant the marker beside a parent-pid carriage naming this worker's real
    // (live) parent: the production probe reads it alive, so nothing fires.
    const { setEnv, restoreEnv } = createEnvSandbox();
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "clean");
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const pollTimers = (): unknown[] =>
      setIntervalSpy.mock.calls.flatMap((call, index) =>
        call[1] === POLL_MS ? [setIntervalSpy.mock.results[index]?.value] : [],
      );
    try {
      const subscriptions = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();
      const commands = new Map<string, unknown>();
      const { pi: basePi, ctx } = makeIdleModelHost(workspace, false);
      const pi = {
        ...makeInertSdkMembers(),
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
      const fire = async (event: string, payload: Record<string, unknown>): Promise<void> => {
        for (const handler of subscriptions.get(event) ?? []) {
          await handler(payload, ctx);
        }
      };

      thetaExtension(pi);
      await fire("session_start", { type: "session_start" });
      expect(
        pollTimers(),
        "precondition: the first session_start compose in a regime-active process must arm the watchdog " +
          `(registered: ${[...commands.keys()].join(", ")})`,
      ).toHaveLength(1);
      const armed = pollTimers()[0];

      await fire("session_start", { type: "session_start" });
      expect(
        pollTimers(),
        "the shipped composeInstance closure must forward the latched handle — a second interval " +
          "leaks the first handle, which session_shutdown can then never clear",
      ).toHaveLength(1);

      await fire("session_shutdown", { type: "session_shutdown", reason: "quit" });
      expect(clearIntervalSpy.mock.calls.filter(([timer]) => timer === armed)).toHaveLength(1);
    } finally {
      for (const timer of pollTimers()) {
        clearInterval(timer as ReturnType<typeof setInterval>);
      }
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
      restoreEnv();
    }
  });
});
