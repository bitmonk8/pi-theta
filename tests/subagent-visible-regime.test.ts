// RFC-0012 §7 — the visible regime, child side and parent side.
//
// Child side (`driveSubagentRootRegime` under a `"visible"` launch-file
// presentation): an `Ok` envelope is followed by exactly one `ctx.shutdown()`
// request (the pane closes once the session is idle); an `Err` envelope is
// NOT (the pane lingers for a human); a headless child never calls it; an
// absent `shutdown` member is tolerated (presence-probed). Parent side
// (`spawnSubagentConversation`): the argv omits `--no-session` only when the
// selected backend declares `persistSession`; a non-`pipe` launch publishes
// the execution-status `placement` reference from the backend's handle; a
// `pipe` launch publishes none.
//
// Spec: pi-integration-contract/subagent.md #subagent-launch-contract (RFC
// 0012 §7), execution-status.md EXST-5.

import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseExpressionSource } from "../src/parser/theta-document";
import { parseEnvelopeLine } from "../src/runtime/subagent-envelope";
import type { SubagentChildControlPlane } from "../src/runtime/subagent-launch-file";
import type { PlacedChild, SubagentPlacementBackend, SubagentPlacementRequest } from "../src/runtime/subagent-placement";
import type { ExecutableHost, OpenedSubagentWire, SubagentChildProcess } from "../src/runtime/subagent-launcher";
import type { PlacementLease } from "../src/runtime/subagent-placement-selection";
import type { ExecutionStatusBus } from "../src/extension/execution-status/types";

class NoopCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: new NoopCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}

function subagentTheta(tail: string): ThetaCompositionInput {
  return {
    slashName: "worker",
    sourcePath: "/theta/worker.theta",
    frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
    body: { statements: [], tail: parseExpressionSource(tail) },
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
}

function childCtx(shutdown: (() => void) | undefined): ExtensionCommandContext {
  return {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
    sessionManager: { getEntries: () => [], getLeafId: () => undefined },
    ...(shutdown !== undefined ? { shutdown } : {}),
  } as unknown as ExtensionCommandContext;
}

function controlPlane(presentation: "visible" | "headless"): SubagentChildControlPlane {
  return {
    env: {},
    entry: { kind: "theta" },
    launch: { nonce: "n", presentation, channel: { port: 1, token: "t" } },
  };
}

async function driveChild(input: {
  readonly tail: string;
  readonly controlPlane: SubagentChildControlPlane | undefined;
  readonly shutdown: (() => void) | undefined;
  /** Receives the envelope-line list so a `shutdown` fake can read its length at call time. */
  readonly observeLines?: (lines: string[]) => void;
}): Promise<string[]> {
  const lines: string[] = [];
  input.observeLines?.(lines);
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: rootDouble(),
    modelRegistry: {
      getAvailable: () => [{ id: "claude-test", provider: "anthropic" }],
    } as unknown as ModelRegistry,
    subagentParentEnv: {},
    subagentRootRegime: { active: true, slug: "worker" },
    ...(input.controlPlane !== undefined ? { subagentControlPlane: input.controlPlane } : {}),
    emitResultEnvelope: (line: string) => lines.push(line),
  });
  await deps.driveSubagentRootRegime!({
    theta: subagentTheta(input.tail),
    args: "",
    ctx: childCtx(input.shutdown),
    thetaAbort: new AbortController(),
  });
  return lines;
}

describe("RFC-0012 §7 — child side: shutdown after Ok, linger on Err", () => {
  it("visible + Ok: the envelope is written FIRST, then exactly one ctx.shutdown()", async () => {
    const order: string[] = [];
    let observed: string[] = [];
    const lines = await driveChild({
      tail: '"DONE"',
      controlPlane: controlPlane("visible"),
      observeLines: (l): void => {
        observed = l;
      },
      shutdown: (): void => {
        order.push(`shutdown-after-${observed.length}-lines`);
      },
    });
    expect(lines).toHaveLength(1);
    expect(parseEnvelopeLine(lines[0]!.trimEnd()).kind).toBe("ok");
    expect(order).toEqual(["shutdown-after-1-lines"]);
  });

  it("visible + Err: the envelope is written and ctx.shutdown() is NOT called (the pane lingers)", async () => {
    let shutdowns = 0;
    const lines = await driveChild({
      tail: 'Err("nope")',
      controlPlane: controlPlane("visible"),
      shutdown: (): void => {
        shutdowns += 1;
      },
    });
    expect(lines).toHaveLength(1);
    expect(parseEnvelopeLine(lines[0]!.trimEnd()).kind).toBe("err");
    expect(shutdowns).toBe(0);
  });

  it("headless (a `pipe` child, or a control plane with no launch file) never calls ctx.shutdown()", async () => {
    let shutdowns = 0;
    const shutdown = (): void => {
      shutdowns += 1;
    };
    await driveChild({ tail: '"DONE"', controlPlane: controlPlane("headless"), shutdown });
    await driveChild({ tail: '"DONE"', controlPlane: { env: {}, entry: { kind: "theta" } }, shutdown });
    await driveChild({ tail: '"DONE"', controlPlane: undefined, shutdown });
    expect(shutdowns).toBe(0);
  });

  it("visible + Ok with no `shutdown` member on the host context: the envelope still lands and nothing throws", async () => {
    const lines = await driveChild({ tail: '"DONE"', controlPlane: controlPlane("visible"), shutdown: undefined });
    expect(lines).toHaveLength(1);
    expect(parseEnvelopeLine(lines[0]!.trimEnd()).kind).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// Parent side: persistSession on the argv; the placement publication.
// ---------------------------------------------------------------------------

function fakeChild(): SubagentChildProcess {
  return {
    closeStdin: (): void => {},
    onStdoutLine: (): (() => void) => (): void => {},
    onStderrLine: (): (() => void) => (): void => {},
    onExit: (listener): void => {
      listener({ code: 0, signal: null });
    },
    kill: (): void => {},
  };
}

function visibleBackend(
  requests: SubagentPlacementRequest[],
  capabilities: NonNullable<SubagentPlacementBackend["capabilities"]>,
): SubagentPlacementBackend {
  return {
    name: "herdr",
    priority: 1,
    capabilities,
    detect: (): boolean => true,
    place: (request): PlacedChild => {
      requests.push(request);
      return {
        handle: "pane-7",
        capabilities: { observesExit: false, inheritsEnv: true, visible: true },
        onExit: (): void => {},
        kill: (): void => {},
      };
    },
  };
}

function pipeLikeBackend(requests: SubagentPlacementRequest[]): SubagentPlacementBackend {
  return {
    name: "pipe",
    priority: Number.NEGATIVE_INFINITY,
    detect: (): boolean => true,
    place: (request): PlacedChild => {
      requests.push(request);
      return {
        handle: "4242",
        capabilities: { observesExit: true, inheritsEnv: true, visible: false },
        onExit: (): void => {},
        kill: (): void => {},
        process: fakeChild(),
      };
    },
  };
}

function resolvingHost(): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}

function openWire(): Promise<OpenedSubagentWire> {
  return Promise.resolve({
    launchFile: "/tmp/launch.json",
    adapt: (): SubagentChildProcess => fakeChild(),
    abandon: (): void => {},
  });
}

function recordingBus(): { bus: ExecutionStatusBus; placed: { id: string; backend: string; handle: string }[] } {
  const placed: { id: string; backend: string; handle: string }[] = [];
  const bus = {
    invocationStarted: (): void => {},
    invocationBound: (): void => {},
    invocationEnded: (): void => {},
    invocationPlaced: (id: string, placement: { backend: string; handle: string }): void => {
      placed.push({ id, ...placement });
    },
    checkpointBefore: (): void => {},
    openLaneSet: () => ({ claim: (): void => {}, settle: (): void => {}, close: (): void => {} }),
    childEvent: (): void => {},
    authorMessage: (): void => {},
    setVerbosity: (): void => {},
    verbosity: () => "names" as const,
    setViewShape: (): void => {},
    viewShape: () => "tree" as const,
    snapshot: () => ({ nodes: [], untracked: 0 }),
    dispose: (): void => {},
  } as unknown as ExecutionStatusBus;
  return { bus, placed };
}

async function launchThrough(backend: SubagentPlacementBackend): Promise<{
  requests: SubagentPlacementRequest[];
  placed: { id: string; backend: string; handle: string }[];
}> {
  const requests: SubagentPlacementRequest[] = [];
  const bound = backend.name === "pipe" ? pipeLikeBackend(requests) : { ...backend, place: (r: SubagentPlacementRequest): PlacedChild | Promise<PlacedChild> => (requests.push(r), backend.place(r)) };
  const lease: PlacementLease = { backend: bound, release: (): void => {} };
  const { bus, placed } = recordingBus();
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: rootDouble(),
    modelRegistry: { getAvailable: () => [{ id: "claude-test", provider: "anthropic" }] } as unknown as ModelRegistry,
    subagentParentEnv: {},
    subagentParentPid: 1,
    subagentExecutableHost: resolvingHost(),
    subagentPlacement: (): PlacementLease => lease,
    subagentOpenWire: openWire,
    statusBus: bus,
  });
  const binding = await deps.spawnSubagentConversation({
    theta: subagentTheta('"x"'),
    args: "",
    ctx: childCtx(undefined),
    thetaAbort: new AbortController(),
  });
  await binding.teardown?.();
  binding.finishInvocation?.();
  return { requests, placed };
}

describe("RFC-0012 §7 — parent side: `--no-session` unless persistSession; the placement publication", () => {
  it("a visible backend WITHOUT persistSession gets the interactive argv with `--no-session` and the bare trailing slug", async () => {
    const { requests, placed } = await launchThrough(visibleBackend([], { visible: true, inheritsEnv: true }));
    expect(requests).toHaveLength(1);
    const args = requests[0]!.args;
    expect(requests[0]!.presentation).toBe("visible");
    expect(args).toContain("--no-session");
    expect(args).not.toContain("--mode");
    expect(args[args.length - 1]).toBe("/worker");
    expect(placed).toEqual([{ id: "inv-1", backend: "herdr", handle: "pane-7" }]);
  });

  it("a visible backend WITH persistSession omits `--no-session` (a resumable session file for the operator)", async () => {
    const { requests } = await launchThrough(visibleBackend([], { visible: true, inheritsEnv: true, persistSession: true }));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.args).not.toContain("--no-session");
    expect(requests[0]!.args).toContain("--name");
  });

  it("a `pipe` launch keeps the headless argv and publishes NO placement", async () => {
    const { requests, placed } = await launchThrough(pipeLikeBackend([]));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.presentation).toBe("headless");
    expect(requests[0]!.args).toContain("--no-session");
    expect(requests[0]!.args).toContain("--mode");
    expect(placed).toEqual([]);
  });
});
