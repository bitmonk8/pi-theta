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

import { RecordingBus } from "./helpers/subagent-fn-child-regime";
import { resolvingHost } from "./helpers/fake-json-child";
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
import { HostFatal } from "../src/runtime/runtime-panics";
import type { HostToolResult } from "../src/runtime/host-loop-dispatch";
import {
  SUBAGENT_CHILD_OUTCOME_CHANNEL,
  type SubagentChildOutcomePayload,
} from "../src/runtime/subagent-placement-registry";
import {
  createPipePlacementBackend,
  type PlacedChild,
  type SubagentLaunchEntry,
  type SubagentPlacementBackend,
  type SubagentPlacementRequest,
} from "../src/runtime/subagent-placement";
import type { OpenedSubagentWire, SpawnFn, SubagentChildProcess } from "../src/runtime/subagent-launcher";
import type { PlacementLease } from "../src/runtime/subagent-placement-selection";
import type { ExecutionStatusBus } from "../src/extension/execution-status/types";

class NoopCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

/** M7: a checkpoint whose `before()` rejects with a fixed value — a `for` loop's `loop-iter` checkpoint site is the injection point. */
class ThrowingCheckpoint implements Checkpoint {
  constructor(private readonly thrown: unknown) {}
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.reject(this.thrown);
  }
}

function rootDouble(checkpoint?: Checkpoint): RuntimeRoot {
  return {
    checkpoint: checkpoint ?? new NoopCheckpoint(),
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

/**
 * A `RuntimeRoot` double whose `idSource.newInvocationId` returns fixed,
 * hex-prefixed UUID-shaped strings from `ids` (one per call, the last value
 * repeats past the end) — F4 (0.477.0): the label suffix is the first eight
 * hex characters of the invocation id, so the id fixture must itself be hex
 * there to make the regex-shape assertions meaningful.
 */
function hexInvocationRoot(ids: readonly string[]): RuntimeRoot {
  let i = 0;
  return {
    checkpoint: new NoopCheckpoint(),
    idSource: {
      newInvocationId: (): string => ids[Math.min(i++, ids.length - 1)]!,
      newToolCallId: (): string => "tc-1",
    },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
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
  /** RFC 0012 §7 (0.478.0): a fake bus; present ⇒ the child regime mirrors its terminal envelope arm onto it. */
  readonly outcomeEvents?: { emit(channel: string, data: unknown): void };
  /** A shared order recorder across the envelope write, the outcome emit, and the shutdown request (M1/M12). */
  readonly order?: string[];
  /** M6/M7: an injected host-loop-dispatch rung, so a body's code-side extension-tool call can be scripted to throw. */
  readonly hostLoopDispatch?: (request: unknown) => Promise<HostToolResult>;
  /** M8: pre-abort the drive's own `thetaAbort` before running the body (CTRL-5 whole-theta cancellation at loop entry). */
  readonly preAbort?: boolean;
  /** M7: a value the injected checkpoint's `before()` rejects with, reaching `executeBody` UNCAUGHT by the code-tool lowering (which only wraps `execute()`/`dispatch()` throws). */
  readonly checkpointThrows?: unknown;
}): Promise<string[]> {
  const lines: string[] = [];
  input.observeLines?.(lines);
  const wrappedOutcomeEvents =
    input.outcomeEvents !== undefined
      ? {
          emit: (channel: string, data: unknown): void => {
            input.order?.push("emit");
            input.outcomeEvents!.emit(channel, data);
          },
        }
      : undefined;
  const wrappedShutdown =
    input.shutdown !== undefined
      ? (): void => {
          input.order?.push("shutdown");
          input.shutdown!();
        }
      : undefined;
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: rootDouble(input.checkpointThrows !== undefined ? new ThrowingCheckpoint(input.checkpointThrows) : undefined),
    modelRegistry: {
      getAvailable: () => [{ id: "claude-test", provider: "anthropic" }],
    } as unknown as ModelRegistry,
    subagentParentEnv: {},
    subagentRootRegime: { active: true, slug: "worker" },
    ...(input.controlPlane !== undefined ? { subagentControlPlane: input.controlPlane } : {}),
    ...(wrappedOutcomeEvents !== undefined ? { subagentOutcomeEvents: wrappedOutcomeEvents } : {}),
    ...(input.hostLoopDispatch !== undefined ? { hostLoopDispatch: input.hostLoopDispatch } : {}),
    emitResultEnvelope: (line: string) => {
      input.order?.push("envelope");
      lines.push(line);
    },
  });
  const thetaAbort = new AbortController();
  if (input.preAbort === true) {
    thetaAbort.abort();
  }
  await deps.driveSubagentRootRegime!({
    theta: subagentTheta(input.tail),
    args: "",
    ctx: childCtx(wrappedShutdown),
    thetaAbort,
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
// RFC 0012 §7 (0.478.0) — the subagent-child outcome event (child side).
// ---------------------------------------------------------------------------

describe("RFC-0012 §7 (0.478.0) — the subagent-child outcome event", () => {
  it('M1: visible + Ok + bus — one emit "ok", ordered: envelope THEN emit THEN ctx.shutdown()', async () => {
    const bus = new RecordingBus();
    const order: string[] = [];
    const lines = await driveChild({
      tail: '"DONE"',
      controlPlane: controlPlane("visible"),
      outcomeEvents: bus,
      order,
      shutdown: (): void => {},
    });
    expect(lines).toHaveLength(1);
    expect(order).toEqual(["envelope", "emit", "shutdown"]);
    expect(bus.emitted).toHaveLength(1);
    expect(bus.emitted[0]!.channel).toBe(SUBAGENT_CHILD_OUTCOME_CHANNEL);
    expect(bus.emitted[0]!.data).toEqual({
      apiVersion: 1,
      outcome: "ok",
      slug: "worker",
    } satisfies SubagentChildOutcomePayload);
  });

  it('M2: visible + Err + bus — one emit "err" after the err envelope; ctx.shutdown() still NOT called', async () => {
    const bus = new RecordingBus();
    let shutdowns = 0;
    const lines = await driveChild({
      tail: 'Err("nope")',
      controlPlane: controlPlane("visible"),
      outcomeEvents: bus,
      shutdown: (): void => {
        shutdowns += 1;
      },
    });
    expect(lines).toHaveLength(1);
    expect(shutdowns).toBe(0);
    expect(bus.emitted).toHaveLength(1);
    expect(bus.emitted[0]!.data).toEqual({ apiVersion: 1, outcome: "err", slug: "worker" });
  });

  it('M6: a body throw (panic → internal-error envelope) emits one "err"', async () => {
    const bus = new RecordingBus();
    const lines = await driveChild({
      tail: 'extTool({ op: "write" })?',
      controlPlane: controlPlane("visible"),
      outcomeEvents: bus,
      shutdown: (): void => {},
      hostLoopDispatch: (): Promise<HostToolResult> => Promise.reject(new Error("boom")),
    });
    expect(lines).toHaveLength(1);
    expect(parseEnvelopeLine(lines[0]!.trimEnd()).kind).toBe("err");
    expect(bus.emitted).toHaveLength(1);
    expect(bus.emitted[0]!.data).toEqual({ apiVersion: 1, outcome: "err", slug: "worker" });
  });

  it("M7: a HostFatal throw rethrows — NO envelope, NO emit (red-direction proof for the exactly-once latch)", async () => {
    const bus = new RecordingBus();
    const fatal = new HostFatal("heap OOM");
    let observedLines: string[] = [];
    // `runCodeSideToolCall` (tool-call-execute.ts) awaits
    // `checkpoint.before("tool-call", site)` OUTSIDE its own try/catch — only
    // the `dispatch()` call itself is wrapped by the code-tool throw lowering
    // — so a checkpoint that rejects with a HostFatal reaches
    // `driveSubagentRootRegime`'s own catch directly, unrelated to the
    // hostLoopDispatch seam.
    await expect(
      driveChild({
        tail: 'extTool({ op: "write" })?',
        controlPlane: controlPlane("visible"),
        outcomeEvents: bus,
        shutdown: (): void => {},
        checkpointThrows: fatal,
        observeLines: (l): void => {
          observedLines = l;
        },
      }),
    ).rejects.toBe(fatal);
    expect(observedLines).toHaveLength(0);
    expect(bus.emitted).toHaveLength(0);
  });

  it('M8: cancellation (whole-theta cancel, CTRL-5) emits one "err" — no third outcome value', async () => {
    const bus = new RecordingBus();
    const lines = await driveChild({
      tail: "par for x in [1] { x }",
      controlPlane: controlPlane("visible"),
      outcomeEvents: bus,
      preAbort: true,
      shutdown: (): void => {},
    });
    expect(lines).toHaveLength(1);
    expect(parseEnvelopeLine(lines[0]!.trimEnd()).kind).toBe("err");
    expect(bus.emitted).toHaveLength(1);
    expect(bus.emitted[0]!.data).toEqual({ apiVersion: 1, outcome: "err", slug: "worker" });
  });

  it("M11: no bus wired ⇒ zero emissions and nothing throws; envelope + shutdown behaviour unchanged", async () => {
    let shutdowns = 0;
    const lines = await driveChild({
      tail: '"DONE"',
      controlPlane: controlPlane("visible"),
      shutdown: (): void => {
        shutdowns += 1;
      },
    });
    expect(lines).toHaveLength(1);
    expect(shutdowns).toBe(1);
  });

  it("M12: bus.emit THROWS on the Ok arm — the throw is contained: envelope already written, ctx.shutdown() STILL requested, drive resolves", async () => {
    const throwingBus = {
      emit: (): void => {
        throw new Error("subscriber exploded");
      },
    };
    let shutdowns = 0;
    const lines = await driveChild({
      tail: '"DONE"',
      controlPlane: controlPlane("visible"),
      outcomeEvents: throwingBus,
      shutdown: (): void => {
        shutdowns += 1;
      },
    });
    expect(lines).toHaveLength(1);
    expect(shutdowns).toBe(1);
  });

  it('M13: headless + Ok + bus — one emit "ok"; ctx.shutdown() NOT called (presentation gate unchanged; decision 7)', async () => {
    const bus = new RecordingBus();
    let shutdowns = 0;
    await driveChild({
      tail: '"DONE"',
      controlPlane: controlPlane("headless"),
      outcomeEvents: bus,
      shutdown: (): void => {
        shutdowns += 1;
      },
    });
    expect(shutdowns).toBe(0);
    expect(bus.emitted).toHaveLength(1);
    expect(bus.emitted[0]!.data).toEqual({ apiVersion: 1, outcome: "ok", slug: "worker" });
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

async function launchThrough(
  backend: SubagentPlacementBackend,
  opts?: {
    readonly entry?: SubagentLaunchEntry;
    readonly label?: string;
    readonly root?: RuntimeRoot;
    /** M14: a fake bus wired into the PARENT-side producer deps — the parent process never emits on it. */
    readonly outcomeEvents?: { emit(channel: string, data: unknown): void };
  },
): Promise<{
  requests: SubagentPlacementRequest[];
  placed: { id: string; backend: string; handle: string }[];
}> {
  const requests: SubagentPlacementRequest[] = [];
  const bound = backend.name === "pipe" ? pipeLikeBackend(requests) : { ...backend, place: (r: SubagentPlacementRequest): PlacedChild | Promise<PlacedChild> => (requests.push(r), backend.place(r)) };
  const lease: PlacementLease = { backend: bound, release: (): void => {} };
  const { bus, placed } = recordingBus();
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: opts?.root ?? rootDouble(),
    modelRegistry: { getAvailable: () => [{ id: "claude-test", provider: "anthropic" }] } as unknown as ModelRegistry,
    subagentParentEnv: {},
    subagentParentPid: 1,
    subagentExecutableHost: resolvingHost(),
    subagentPlacement: (): PlacementLease => lease,
    subagentOpenWire: openWire,
    statusBus: bus,
    ...(opts?.outcomeEvents !== undefined ? { subagentOutcomeEvents: opts.outcomeEvents } : {}),
  });
  const binding = await deps.spawnSubagentConversation({
    theta: subagentTheta('"x"'),
    args: "",
    ctx: childCtx(undefined),
    thetaAbort: new AbortController(),
    ...(opts?.entry !== undefined ? { entry: opts.entry } : {}),
    ...(opts?.label !== undefined ? { label: opts.label } : {}),
  });
  await binding.teardown?.();
  binding.finishInvocation?.();
  return { requests, placed };
}

/**
 * L3: two `spawnSubagentConversation` calls through ONE producer instance —
 * the `par for` fan-out surrogate — sharing one `PlacementRegistry`-free
 * lease and one recorded-requests array, so both launches' labels can be
 * compared for a shared base and distinct 8-hex suffixes.
 */
async function launchTwiceThrough(
  backend: SubagentPlacementBackend,
  root: RuntimeRoot,
): Promise<{ requests: SubagentPlacementRequest[] }> {
  const requests: SubagentPlacementRequest[] = [];
  const bound = { ...backend, place: (r: SubagentPlacementRequest): PlacedChild | Promise<PlacedChild> => (requests.push(r), backend.place(r)) };
  const lease: PlacementLease = { backend: bound, release: (): void => {} };
  const { bus } = recordingBus();
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root,
    modelRegistry: { getAvailable: () => [{ id: "claude-test", provider: "anthropic" }] } as unknown as ModelRegistry,
    subagentParentEnv: {},
    subagentParentPid: 1,
    subagentExecutableHost: resolvingHost(),
    subagentPlacement: (): PlacementLease => lease,
    subagentOpenWire: openWire,
    statusBus: bus,
  });
  for (let i = 0; i < 2; i += 1) {
    const binding = await deps.spawnSubagentConversation({
      theta: subagentTheta('"x"'),
      args: "",
      ctx: childCtx(undefined),
      thetaAbort: new AbortController(),
    });
    await binding.teardown?.();
    binding.finishInvocation?.();
  }
  return { requests };
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

  it("M14: the parent process never emits on the outcome channel, even with a bus wired through a full launch + teardown", async () => {
    const bus = new RecordingBus();
    await launchThrough(visibleBackend([], { visible: true, inheritsEnv: true }), { outcomeEvents: bus });
    expect(bus.emitted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F4 (0.477.0) — the per-invocation label suffix (RFC 0012 §1/§7).
// ---------------------------------------------------------------------------

describe("F4 (0.477.0) — the launch label carries the invocation id's first eight hex chars", () => {
  it("L1: the recorded placement request's label is <slug>#<id8>, <id8> read off the execution-status placed node", async () => {
    const root = hexInvocationRoot(["3f9c2a1b-0000-4000-8000-000000000000"]);
    const { requests, placed } = await launchThrough(visibleBackend([], { visible: true, inheritsEnv: true }), { root });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.label).toMatch(/^worker#[0-9a-f]{8}$/);
    expect(placed).toHaveLength(1);
    // Equality against the invocation id the execution-status bus recorded
    // (`invocationPlaced(ticket.invocationId, ...)`), beyond the regex shape.
    expect(requests[0]!.label).toBe(`worker#${placed[0]!.id.slice(0, 8)}`);
  });

  it("L2: the visible argv's --name element equals request.label byte-for-byte; the trailing positional stays /worker", async () => {
    const root = hexInvocationRoot(["7ae04d22-0000-4000-8000-000000000000"]);
    const { requests } = await launchThrough(visibleBackend([], { visible: true, inheritsEnv: true }), { root });
    const args = requests[0]!.args;
    const nameIndex = args.indexOf("--name");
    expect(nameIndex).toBeGreaterThanOrEqual(0);
    expect(args[nameIndex + 1]).toBe(requests[0]!.label);
    expect(args[args.length - 1]).toBe("/worker");
  });

  it("L3: two launches through ONE producer (a `par for` fan-out surrogate) share the base and differ in the 8-hex suffix", async () => {
    const root = hexInvocationRoot([
      "3f9c2a1b-0000-4000-8000-000000000000",
      "7ae04d22-0000-4000-8000-000000000000",
    ]);
    const { requests } = await launchTwiceThrough(visibleBackend([], { visible: true, inheritsEnv: true }), root);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.label).toMatch(/^worker#[0-9a-f]{8}$/);
    }
    const [first, second] = requests.map((r) => r.label);
    expect(first).toBe(`worker#${"3f9c2a1b"}`);
    expect(second).toBe(`worker#${"7ae04d22"}`);
    expect(first).not.toBe(second);
  });

  it("L4: a fn-entry launch's label is <slug>#<fn>#<id8> — the fn base label with the id appended at the shared choke point", async () => {
    const root = hexInvocationRoot(["c0ffee12-0000-4000-8000-000000000000"]);
    // The fn-launch call site (production-theta-producer.ts, P-E) supplies
    // `bindInput.label` as `<slug>#<fn>` before this generic bind's choke
    // point appends `#<id8>`; driven directly here per
    // `ConversationBindInput.entry`/`.label`'s own doc-comments.
    const { requests, placed } = await launchThrough(visibleBackend([], { visible: true, inheritsEnv: true }), {
      root,
      entry: { kind: "fn", name: "step" },
      label: "worker#step",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.label).toMatch(/^worker#step#[0-9a-f]{8}$/);
    expect(placed).toHaveLength(1);
    expect(requests[0]!.label).toBe(`worker#step#${placed[0]!.id.slice(0, 8)}`);
  });

  it("L5: a `pipe` launch's argv has no --name; the request still carries the suffixed label", async () => {
    const root = hexInvocationRoot(["decade11-0000-4000-8000-000000000000"]);
    const { requests, placed } = await launchThrough(pipeLikeBackend([]), { root });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.args).not.toContain("--name");
    expect(requests[0]!.label).toMatch(/^worker#[0-9a-f]{8}$/);
    // Unchanged (EXST-5 guard): a `pipe` launch still publishes no placement.
    expect(placed).toEqual([]);
  });

  it("L6: createPipePlacementBackend's PlacedChild.handle stands in for the (already-suffixed) label", () => {
    const spawn: SpawnFn = (): SubagentChildProcess => fakeChild();
    const pipe = createPipePlacementBackend(spawn);
    const request: SubagentPlacementRequest = {
      execPath: "/usr/bin/node",
      args: ["--mode", "json"],
      cwd: "/tmp",
      env: {},
      label: "worker#3f9c2a1b",
      presentation: "headless",
      launchFile: undefined,
      context: { invokeDepth: 0, parallel: false },
    };
    const placed = pipe.place(request) as PlacedChild;
    expect(placed.handle).toBe("worker#3f9c2a1b");
  });
});
