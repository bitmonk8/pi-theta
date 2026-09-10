import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  registerThetaProgressTool,
  THETA_PROGRESS_PARAMETERS,
  type ProgressToolDeps,
  type ThetaProgressParams,
} from "../src/extension/execution-status/progress-tool";
import { THETA_PROGRESS_TOOL_NAME } from "../src/extension/execution-status/types";
import type { ExecutionStatusBus, ProgressAuthorMessage } from "../src/extension/execution-status/types";
import type { EntryChannelHandle } from "../src/extension/execution-status/entry-channel";
import { ActiveInvocationRegistry, type ActiveInvocationEntry } from "../src/runtime/active-invocation-registry";
import { FakeClock } from "./helpers/fake-clock";
import { renderFooterLine } from "../src/extension/execution-status/footer-sink";
import { createProgressEntryRenderer } from "../src/extension/execution-status/entry-channel";
import {
  createThetaExtension,
  EXTENSION_BOOTSTRAP_FAILED_CODE,
} from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { SessionDouble } from "./harness/index";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// RFC 0010 Layer L3 (execution-status.md EXST-13/EXST-14; runtime-event-
// channel.md PIC-71) — T-PRG, `tests/execution-status-progress-tool.test.ts`.
// Behaviour-matrix rows L3-B1 .. L3-B17 (registration + schema; parent
// regime).
//
// `progress-tool.ts`'s `execute` SHIPS the full L3-B1..L3-B17 contract:
// registration (EXST-13), the parent-regime bus publication + durable
// `theta-progress-entry` milestone (EXST-14), the message/scope clamp and
// strip, the 200ms acceptance interval with its counted-but-dropped carry,
// the `off`-gate, best-effort attribution, and the footer/entry render
// segments (EXST-14; PIC-71). Every row below asserts the real shipped
// effect (a `bus.authorMessage` call, an `appendMilestone` call, a clamp, a
// drop count, a rendered string) — none of them are vacuous.

function fakeHostApi(): {
  hostApi: { registerTool: (t: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>) => void };
  calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[];
} {
  const calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[] = [];
  return {
    hostApi: {
      registerTool: (t): void => {
        calls.push(t);
      },
    },
    calls,
  };
}

function noopLaneHandle() {
  return { claim: (): void => {}, settle: (): void => {}, close: (): void => {} };
}

/** A minimal fake `ExecutionStatusBus`: every producer a no-op spy, `verbosity`
 *  returns a controllable value, `authorMessage` records its calls. */
function fakeBus(initialVerbosity: "off" | "counts" | "names" = "names"): {
  bus: ExecutionStatusBus;
  authorMessageCalls: { invocationId: string | undefined; payload: ProgressAuthorMessage }[];
} {
  const authorMessageCalls: { invocationId: string | undefined; payload: ProgressAuthorMessage }[] = [];
  let verbosity = initialVerbosity;
  const bus: ExecutionStatusBus = {
    invocationStarted: (): void => {},
    invocationBound: (): void => {},
    invocationEnded: (): void => {},
    checkpointBefore: (): void => {},
    openLaneSet: () => noopLaneHandle(),
    childEvent: (): void => {},
    authorMessage: (invocationId, payload): void => {
      authorMessageCalls.push({ invocationId, payload });
    },
    setVerbosity: (v): void => {
      verbosity = v;
    },
    verbosity: () => verbosity,
    setViewShape: (): void => {},
    viewShape: () => "tree",
    snapshot: () => ({ nodes: [], untracked: 0 }),
    dispose: (): void => {},
  };
  return { bus, authorMessageCalls };
}

function fakeEntry(): ActiveInvocationEntry {
  return {
    thetaAbort: new AbortController(),
    disposeBarrier: Promise.resolve(),
    shutdownReason: undefined,
    theta: "quality-loop",
    invocationId: "inv-1",
  };
}

function fakeEntryChannel(): { entryChannel: EntryChannelHandle; milestoneCalls: unknown[] } {
  const milestoneCalls: unknown[] = [];
  const entryChannel: EntryChannelHandle = {
    live: () => true,
    append: () => true,
    appendMilestone: (m): boolean => {
      milestoneCalls.push(m);
      return true;
    },
  };
  return { entryChannel, milestoneCalls };
}

function baseDeps(overrides: Partial<ProgressToolDeps> = {}): ProgressToolDeps {
  const registry = new ActiveInvocationRegistry();
  registry.add(fakeEntry());
  const clock = new FakeClock();
  const { bus } = fakeBus();
  const { entryChannel } = fakeEntryChannel();
  return {
    isChildRegime: false,
    bus: () => bus,
    invocations: () => registry,
    clock: () => clock,
    entryChannel,
    ...overrides,
  };
}

const ARGS: ThetaProgressParams = { message: "built 3 of 12", scope: "fix", done: 3, total: 12 };

// ---------------------------------------------------------------------------
// A. Registration + schema (EXST-13)
// ---------------------------------------------------------------------------

describe("T-PRG — L3-B1: exactly one registerTool call, correct name/label/schema", () => {
  it("registers theta_progress with the fixed label and the exact { message, scope?, done?, total? } schema, additionalProperties false", () => {
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe(THETA_PROGRESS_TOOL_NAME);
    expect(calls[0]?.label).toBe("Theta progress");
    const schema = calls[0]?.parameters as unknown as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties).sort()).toEqual(["done", "message", "scope", "total"]);
    expect(schema.required).toEqual(["message"]);
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("T-PRG — L3-B7: every exit returns the fixed ok result", () => {
  it("an accepted-shaped call returns { content: [{ type: 'text', text: 'ok' }], isError: false }", async () => {
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps());
    const result = await calls[0]!.execute("call-1", ARGS, undefined, undefined, {} as never);
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }], details: undefined, isError: false });
  });

  it("a dropped-shaped call (two calls back to back) ALSO returns the fixed ok result — the rate clamp only changes bus/entry/wire side effects, never the tool's own return value (EXST-13)", async () => {
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps());
    const r1 = await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);
    const r2 = await calls[0]!.execute("c2", ARGS, undefined, undefined, {} as never);
    expect(r1).toEqual(r2);
  });
});

describe("T-PRG — L3-B8: no live invocation is a no-op that still returns ok", () => {
  it("an empty registry still returns ok and never touches the bus", async () => {
    const { authorMessageCalls, bus } = fakeBus();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(
      hostApi,
      baseDeps({ invocations: () => new ActiveInvocationRegistry(), bus: () => bus }),
    );
    const result = await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }], details: undefined, isError: false });
    expect(authorMessageCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B. Parent regime (EXST-14)
// ---------------------------------------------------------------------------

describe("T-PRG — L3-B9: one bus.authorMessage AND one appendMilestone per accepted call", () => {
  it("a single call publishes exactly one bus.authorMessage and one milestone with the sole live entry's attribution", async () => {
    const registry = new ActiveInvocationRegistry();
    const entry = fakeEntry();
    registry.add(entry);
    const { bus, authorMessageCalls } = fakeBus();
    const { entryChannel, milestoneCalls } = fakeEntryChannel();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(
      hostApi,
      baseDeps({ invocations: () => registry, bus: () => bus, entryChannel, isChildRegime: false }),
    );
    await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);

    expect(authorMessageCalls).toHaveLength(1);
    expect(milestoneCalls).toHaveLength(1);
    expect(milestoneCalls[0]).toMatchObject({
      message: "built 3 of 12",
      scope: "fix",
      done: 3,
      total: 12,
      theta: entry.theta,
      invocation_id: entry.invocationId,
    });
  });
});

describe("T-PRG — L3-B10: message/scope clamp + strip", () => {
  it("a 201-char message with ANSI/tab/control and a 65-char scope clamp to 200/64, stripped", async () => {
    const longMessage = `${"m".repeat(190)}\u001B[31m\tred\u0007${"x".repeat(20)}`; // > 200 chars, control-bearing
    const longScope = "s".repeat(65);
    const { bus, authorMessageCalls } = fakeBus();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps({ bus: () => bus }));
    await calls[0]!.execute("c1", { message: longMessage, scope: longScope }, undefined, undefined, {} as never);

    expect(authorMessageCalls).toHaveLength(1);
    const payload = authorMessageCalls[0]!.payload;
    expect(payload.message.length).toBeLessThanOrEqual(200);
    expect(payload.message).not.toMatch(/\u001B|\u0007/);
    expect(payload.message).not.toContain("\t");
    expect(payload.scope?.length).toBeLessThanOrEqual(64);
  });
});

describe("T-PRG — L3-B11: 200ms acceptance interval, counted-but-dropped carry", () => {
  it("t=0 accepted, +100ms dropped (counted), +250ms accepted with dropped:1", async () => {
    const clock = new FakeClock();
    const { bus, authorMessageCalls } = fakeBus();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps({ bus: () => bus, clock: () => clock }));

    await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);
    clock.advance(100);
    await calls[0]!.execute("c2", ARGS, undefined, undefined, {} as never);
    clock.advance(150); // total +250 from t0
    await calls[0]!.execute("c3", ARGS, undefined, undefined, {} as never);

    expect(authorMessageCalls).toHaveLength(2); // t0 and t+250 accepted; t+100 dropped
    expect(authorMessageCalls[1]!.payload.dropped).toBe(1);
  });
});

describe("T-PRG — L3-B12: verbosity off — nothing published/appended, not counted", () => {
  it("a call under 'off' publishes nothing and does not consume the rate window for a later 'names' call", async () => {
    const registry = new ActiveInvocationRegistry();
    registry.add(fakeEntry());
    let verbosity: "off" | "counts" | "names" = "off";
    const authorMessageCalls: unknown[] = [];
    const bus: ExecutionStatusBus = {
      invocationStarted: (): void => {},
      invocationBound: (): void => {},
      invocationEnded: (): void => {},
      checkpointBefore: (): void => {},
      openLaneSet: () => noopLaneHandle(),
      childEvent: (): void => {},
      authorMessage: (_id, payload): void => {
        authorMessageCalls.push(payload);
      },
      setVerbosity: (v): void => {
        verbosity = v;
      },
      verbosity: () => verbosity,
      setViewShape: (): void => {},
      viewShape: () => "tree",
      snapshot: () => ({ nodes: [], untracked: 0 }),
      dispose: (): void => {},
    };
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps({ invocations: () => registry, bus: () => bus }));

    await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);
    expect(authorMessageCalls).toHaveLength(0);

    verbosity = "names";
    await calls[0]!.execute("c2", ARGS, undefined, undefined, {} as never);
    expect(authorMessageCalls).toHaveLength(1); // the off call must NOT have been counted-but-dropped
  });
});

describe("T-PRG — L3-B13: dead entry channel — bus still publishes, no milestone, NEVER a sendMessage fallback", () => {
  it("appendMilestone is never attempted/never fallback-delivered when the channel is dead", async () => {
    const { bus, authorMessageCalls } = fakeBus();
    const entryChannel: EntryChannelHandle = {
      live: () => false,
      append: (): boolean => {
        throw new Error("append (message-channel fallback) MUST NOT be called for milestones — EXST-14");
      },
      appendMilestone: (): boolean => false,
    };
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps({ bus: () => bus, entryChannel }));
    await expect(
      calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never),
    ).resolves.toBeDefined();
    expect(authorMessageCalls).toHaveLength(1);
  });
});

describe("T-PRG — L3-B14: attribution = newest (last-insertion-order) live entry", () => {
  it("with three live invocations A, B, C the milestone attributes to C", async () => {
    const registry = new ActiveInvocationRegistry();
    const a: ActiveInvocationEntry = { ...fakeEntry(), theta: "a", invocationId: "a-id" };
    const b: ActiveInvocationEntry = { ...fakeEntry(), theta: "b", invocationId: "b-id" };
    const c: ActiveInvocationEntry = { ...fakeEntry(), theta: "c", invocationId: "c-id" };
    registry.add(a);
    registry.add(b);
    registry.add(c);
    const { entryChannel, milestoneCalls } = fakeEntryChannel();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps({ invocations: () => registry, entryChannel }));
    await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);

    expect(milestoneCalls).toHaveLength(1);
    expect(milestoneCalls[0]).toMatchObject({ theta: "c", invocation_id: "c-id" });
  });
});

describe("T-PRG — L3-B15: bus latch undefined but registry live — milestone still appended, no throw", () => {
  it("a raced bus latch does not stop the milestone append", async () => {
    const { entryChannel, milestoneCalls } = fakeEntryChannel();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps({ bus: () => undefined, entryChannel }));
    await expect(
      calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never),
    ).resolves.toBeDefined();
    expect(milestoneCalls).toHaveLength(1);
  });
});

describe("T-PRG — L3-B16: footer render carries the ✎ class-2 segment (EXST-14 grammar)", () => {
  it("a node snapshot carrying an authorMessage renders '✎ built 3 of 12' on the footer line", () => {
    const snapshot = {
      nodes: [
        {
          invocationId: "inv-1",
          theta: "quality-loop",
          startedAtMs: 0,
          counters: { checkpoints: 0, loopIters: 0 },
          authorMessage: { message: "built 3 of 12", scope: "fix", done: 3, total: 12 },
        },
      ],
      untracked: 0,
    };
    const line = renderFooterLine(snapshot, "names", 0);
    // EXST-14 grammar (footer-sink.ts): the class-2 segment renders after the
    // node's kids and before the trailing elision tail.
    expect(line).toContain("✎ built 3 of 12");
  });
});

describe("T-PRG — L3-B17: entry renderer's exact milestone template (PIC-71)", () => {
  it("a { milestone } entry renders 'progress /quality-loop fix: built 3 of 12 (3/12) (+2 dropped)'", () => {
    const renderer = createProgressEntryRenderer();
    const entry = {
      type: "theta-progress-entry",
      data: {
        milestone: {
          theta: "quality-loop",
          scope: "fix",
          message: "built 3 of 12",
          done: 3,
          total: 12,
          dropped: 2,
        },
      },
    } as never;
    const component = renderer(entry, { expanded: false } as never, {} as never);
    const rendered = component === undefined ? "" : JSON.stringify(component);
    // The renderer's `milestone`-key discriminated arm (PIC-71) draws the
    // exact template below.
    expect(rendered).toContain("progress /quality-loop fix: built 3 of 12 (3/12) (+2 dropped)");
  });

  it("a malformed { milestone } payload does not throw (PIC-21 analogue)", () => {
    const renderer = createProgressEntryRenderer();
    const entry = { type: "theta-progress-entry", data: { milestone: 42 } } as never;
    expect(() => renderer(entry, { expanded: false } as never, {} as never)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// F. Factory-path cells (EXST-13, factory.ts:636-651) — the REAL
// `createThetaExtension` factory body, not the unit-level `registerThetaProgressTool`
// call the sections above drive directly. Mirrors
// `tests/extension-factory-harness.test.ts`'s `makeAbsentSeamPi`/ordering idiom.
// ---------------------------------------------------------------------------

/** A recording `pi` double: every call pushed to `calls` in order, so ordering
 *  claims (registerTool BEFORE any `pi.on` subscription) are checked on the
 *  observed sequence rather than inferred from source layout. */
function makeOrderRecordingPi(): {
  pi: ExtensionAPI;
  calls: string[];
  registeredTools: ToolDefinition<never>[];
} {
  const calls: string[] = [];
  const registeredTools: ToolDefinition<never>[] = [];
  const pi = {
    registerFlag: (): void => {
      calls.push("registerFlag");
    },
    registerMessageRenderer: (): void => {
      calls.push("registerMessageRenderer");
    },
    registerTool: (t: ToolDefinition<never>): void => {
      calls.push("registerTool");
      registeredTools.push(t);
    },
    registerCommand: (): void => {
      calls.push("registerCommand");
    },
    on: (event: string): void => {
      calls.push(`on:${event}`);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): unknown[] => [],
    sendUserMessage: (): void => {},
  };
  return { pi: pi as unknown as ExtensionAPI, calls, registeredTools };
}

describe("T-PRG — factory-path (a): registerTool fires in the factory's synchronous body, BEFORE any pi.on subscription", () => {
  it("the recorded call order places registerTool ahead of every pi.on(...) subscription (including session_start)", () => {
    const { pi, calls, registeredTools } = makeOrderRecordingPi();
    createThetaExtension({ fixtures: [] })(pi);

    const registerToolIndex = calls.indexOf("registerTool");
    expect(registerToolIndex).toBeGreaterThanOrEqual(0);
    const firstOnIndex = calls.findIndex((c) => c.startsWith("on:"));
    expect(firstOnIndex).toBeGreaterThanOrEqual(0);
    expect(registerToolIndex).toBeLessThan(firstOnIndex);
    // No `session_start` subscription (hence no compose pass) can have fired
    // yet at this point in the synchronous factory body — the subscription
    // itself is not even installed until AFTER registerTool ran.
    expect(calls.indexOf("on:session_start")).toBeGreaterThan(registerToolIndex);

    expect(registeredTools).toHaveLength(1);
    expect(registeredTools[0]?.name).toBe(THETA_PROGRESS_TOOL_NAME);
  });
});

describe("T-PRG — factory-path (b): a throwing pi.registerTool draws bootstrapFailedDiagnostic('pi.registerTool') and the factory still succeeds", () => {
  it("emits the standard bootstrap diagnostic naming theta_progress and completes the remaining registrations", () => {
    const calls: string[] = [];
    const diagnostics: Diagnostic[] = [];
    const pi = {
      registerFlag: (): void => {
        calls.push("registerFlag");
      },
      registerMessageRenderer: (): void => {
        calls.push("registerMessageRenderer");
      },
      registerTool: (): void => {
        calls.push("registerTool");
        throw new Error("registerTool host seam absent");
      },
      registerCommand: (): void => {
        calls.push("registerCommand");
      },
      on: (event: string): void => {
        calls.push(`on:${event}`);
      },
      getFlag: (): undefined => undefined,
      getCommands: (): unknown[] => [],
      sendUserMessage: (): void => {},
    } as unknown as ExtensionAPI;

    expect(() =>
      createThetaExtension({ fixtures: [], emitDiagnostic: (d) => diagnostics.push(d) })(pi),
    ).not.toThrow();

    expect(calls).toContain("registerTool");
    const bootstrapDiagnostics = diagnostics.filter((d) => d.code === EXTENSION_BOOTSTRAP_FAILED_CODE);
    const progressDiagnostic = bootstrapDiagnostics.find((d) =>
      d.message.includes("pi.registerTool"),
    );
    expect(
      progressDiagnostic,
      `expected a pi.registerTool bootstrap diagnostic; got ${JSON.stringify(diagnostics)}`,
    ).toBeDefined();
    expect((progressDiagnostic?.details as { theta?: string } | undefined)?.theta).toBe(
      THETA_PROGRESS_TOOL_NAME,
    );
    // EXST-13 "best-effort": the factory does not abort — the three factory-time
    // `pi.on` subscriptions still install after the throwing registerTool call.
    expect([...calls].filter((c) => c.startsWith("on:")).sort()).toEqual([
      "on:resources_discover",
      "on:session_shutdown",
      "on:session_start",
    ]);
  });
});

describe("T-PRG — factory-path (c): a hostApi with no registerTool member is skipped silently — no throw, no diagnostic", () => {
  it("a pi double that never models registerTool (the SessionDouble shape) completes factory registration untouched", () => {
    const double = new SessionDouble();
    const diagnostics: Diagnostic[] = [];
    expect(() =>
      createThetaExtension({ fixtures: [], emitDiagnostic: (d) => diagnostics.push(d) })(double.pi),
    ).not.toThrow();

    // The `typeof pi.registerTool === "function"` presence gate (EXST-13
    // "typeof-only" probe) means an ABSENT member draws no diagnostic at all —
    // distinct from a PRESENT member that throws (cell (b) above).
    const progressDiagnostics = diagnostics.filter(
      (d) =>
        d.code === EXTENSION_BOOTSTRAP_FAILED_CODE &&
        (d.details as { theta?: string } | undefined)?.theta === THETA_PROGRESS_TOOL_NAME,
    );
    expect(progressDiagnostics).toEqual([]);
    // The rest of the factory body still ran (the existing H4a self-check's own
    // assertions cover this in full; a narrow smoke check here: the flag/renderer
    // registered and the three subscriptions installed).
    expect(double.flags.has("theta")).toBe(true);
    expect([...double.subscriptions.keys()].sort()).toEqual([
      "resources_discover",
      "session_shutdown",
      "session_start",
    ]);
  });
});

// ---------------------------------------------------------------------------
// F(d). `tools: theta_progress` load-resolves through the REAL production load
// path (`discoverAndComposeFixtures`) once `theta_progress` has actually been
// registered against the SAME `pi.getAllTools()` snapshot the resolver reads —
// vs. a bogus tool name, which refuses. Mirrors
// `tests/production-tools-load-resolution.test.ts`'s planted-workspace /
// `runProductionLoad` idiom (same production entry point).
// ---------------------------------------------------------------------------

describe("T-PRG — factory-path (d): tools: theta_progress load-resolves; an unknown tool name still refuses", () => {
  let workspaceDir: string;
  let registered: readonly string[];
  let notifications: readonly string[];

  beforeAll(async () => {
    workspaceDir = mkdtempSync(join(tmpdir(), "theta-l3-progress-load-"));
    const projectThetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(projectThetaDir, { recursive: true });
    writeFileSync(
      join(projectThetaDir, "progresscaller.theta"),
      ["---", "mode: prompt", "tools: theta_progress", "---", "@`hi`", ""].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(projectThetaDir, "bogustoolcaller.theta"),
      ["---", "mode: prompt", "tools: totally_bogus_xyz", "---", "@`hi`", ""].join("\n"),
      "utf8",
    );
    writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");

    // Register theta_progress for REAL, through the same `registerThetaProgressTool`
    // the factory body calls — against a fake hostApi whose `getAllTools()` echoes
    // back whatever names were registered, so the production `tools:` resolver
    // (which reads `pi.getAllTools()`, mode-independently) sees the SAME registry
    // state the shipped factory would publish before any compose pass runs.
    const registeredToolNames: string[] = [];
    const notified: string[] = [];
    const pi = {
      registerTool: (t: { name: string }): void => {
        registeredToolNames.push(t.name);
      },
      getAllTools: (): readonly string[] => registeredToolNames,
      getFlag: (): undefined => undefined,
      getCommands: (): readonly unknown[] => [],
      sendMessage: (): void => {},
      sendUserMessage: (): void => {},
      getActiveTools: (): readonly string[] => [],
      setActiveTools: (): void => {},
    } as unknown as ExtensionAPI;
    registerThetaProgressTool(pi, {
      isChildRegime: false,
      bus: () => undefined,
      invocations: () => undefined,
      clock: () => undefined,
      entryChannel: undefined,
    });
    expect(registeredToolNames).toContain(THETA_PROGRESS_TOOL_NAME);

    const ctx = {
      cwd: workspaceDir,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: {
        notify: (message: string, _type: "error"): void => {
          notified.push(message);
        },
      },
    } as unknown as ExtensionContext;

    const fixtures = await discoverAndComposeFixtures(pi, ctx);
    registered = fixtures.map((f) => f.slashName);
    notifications = notified;
  });

  afterAll(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("a theta listing `tools: theta_progress` registers — no theta/load/unknown-tool", () => {
    expect(
      registered,
      "the theta_progress-calling theta was not registered. Registered: " +
        JSON.stringify(registered) + " Notified: " + JSON.stringify(notifications),
    ).toContain("progresscaller");
    expect(
      notifications.some((n) => n.includes("unknown Pi tool 'theta_progress'")),
      "theta_progress must resolve against the pi.getAllTools() snapshot, not draw its own unknown-tool rejection: " +
        JSON.stringify(notifications),
    ).toBe(false);
  });

  it("a theta naming a bogus tool refuses with theta/load/unknown-tool", () => {
    expect(
      registered,
      "the bogus-tool theta was registered anyway. Registered: " + JSON.stringify(registered),
    ).not.toContain("bogustoolcaller");
    expect(
      notifications,
      "no unknown-tool rejection surfaced for the bogus tool name. Notified: " +
        JSON.stringify(notifications),
    ).toContain("unknown Pi tool 'totally_bogus_xyz'");
  });
});
