import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import thetaExtension, {
  createThetaExtension,
  type ThetaFixture,
} from "../src/extension/factory";
import { loadExtension, SessionDouble } from "./harness/index";
import { createSystemNoteRenderer } from "../src/extension/system-note-renderer";
import type { ThetaExtensionDeps } from "../src/extension/factory";
import type { ExtensionInstanceWiring } from "../src/extension/production-composition";
import { ThetaRegistry } from "../src/extension/reload-wiring";
import { ActiveInvocationRegistry } from "../src/runtime/active-invocation-registry";
import { createExecutionStatusBus } from "../src/extension/execution-status/bus";
import {
  DONE_LINGER_MS,
  STATUS_TICK_MS,
  type ExecutionStatusBus,
  type StatusSink,
} from "../src/extension/execution-status/types";
import { FakeClock } from "./helpers/fake-clock";

// H4a — extension factory shell and end-to-end harness. This is a horizontal
// (Convention.) leaf: the assertions below ARE the inline test surface its
// "Ships when" gate names — `npm test` loads the extension through the harness,
// dispatches a no-op command end-to-end, and runs the session-double
// fidelity-contract self-check. Each block cites the conventions.md phase
// category it operationalises and the spec behaviour model the double is
// asserted against.

// A recording `ExtensionAPI` double in which a chosen set of host-binding
// calls is "absent" (throws on call), used to witness the never-throw factory
// boundary. Each registration call and `pi.on` subscription is recorded so the
// test can assert the factory completed the remaining registrations after a
// throwing call.
function makeAbsentSeamPi(absent: ReadonlySet<string>): {
  pi: ExtensionAPI;
  calls: string[];
  subscriptions: Set<string>;
} {
  const calls: string[] = [];
  const subscriptions = new Set<string>();
  const guard = (name: string): void => {
    calls.push(name);
    if (absent.has(name)) {
      throw new Error(`${name} host seam absent`);
    }
  };
  const pi = {
    registerFlag: (): void => guard("registerFlag"),
    registerMessageRenderer: (): void => guard("registerMessageRenderer"),
    registerCommand: (): void => guard("registerCommand"),
    on: (event: string): void => {
      const key = `on:${event}`;
      calls.push(key);
      if (absent.has(key)) {
        throw new Error(`${key} host seam absent`);
      }
      subscriptions.add(event);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): unknown[] => [],
    sendUserMessage: (): void => {},
  };
  return { pi: pi as unknown as ExtensionAPI, calls, subscriptions };
}

// --- Convention: phase categories — never-throw synchronous factory boundary ---

describe("H4a — factory shell (Convention: Pi-extension shell)", () => {
  it("completes its side-effect registrations on the injected pi handle", () => {
    const double = new SessionDouble();
    createThetaExtension({ fixtures: [] })(double.pi);

    // Factory-body synchronous-arm registrations all took effect.
    expect(double.flags.has("theta")).toBe(true);
    expect(double.renderers.has("theta-system-note")).toBe(true);
    expect([...double.subscriptions.keys()].sort()).toEqual([
      "resources_discover",
      "session_shutdown",
      "session_start",
    ]);
    // `pi.registerCommand` is NOT a factory-body call — no command is
    // registered until `session_start` fires.
    expect(double.commands.size).toBe(0);
  });

  it("never throws even when a host seam is absent (renderer registration throws)", () => {
    // The renderer call throws (host seam absent); the factory must not
    // propagate it and must still complete the remaining registrations.
    const { pi, calls, subscriptions } = makeAbsentSeamPi(
      new Set(["registerMessageRenderer"]),
    );
    expect(() => createThetaExtension({ fixtures: [] })(pi)).not.toThrow();

    expect(calls).toContain("registerFlag");
    expect(calls).toContain("registerMessageRenderer");
    // The three factory-time subscriptions still installed after the throw.
    expect([...subscriptions].sort()).toEqual([
      "resources_discover",
      "session_shutdown",
      "session_start",
    ]);
  });

  it("never throws when every host-binding call is absent", () => {
    const { pi } = makeAbsentSeamPi(
      new Set([
        "registerFlag",
        "registerMessageRenderer",
        "on:resources_discover",
        "on:session_start",
        "on:session_shutdown",
      ]),
    );
    expect(() => createThetaExtension({ fixtures: [] })(pi)).not.toThrow();
  });

  it("returns synchronously — the return value is undefined, not a thenable (synchronous-arm pin)", () => {
    const double = new SessionDouble();
    const ret: void = createThetaExtension({ fixtures: [] })(double.pi);
    expect(ret).toBeUndefined();
    // Not a Promise: no thenable returned-value arm exists to reject.
    expect((ret as unknown as { then?: unknown } | undefined)?.then).toBeUndefined();

    // The production default export is the same synchronous-arm factory.
    const prod: void = thetaExtension(new SessionDouble().pi);
    expect(prod).toBeUndefined();
  });
});

// --- Convention: phase categories — the theta-system-note renderer shape ---

describe("H4a — theta-system-note renderer (Convention: Pi-extension shell)", () => {
  const renderer = createSystemNoteRenderer();
  const opts = { expanded: false } as never;
  const theme = {} as never;

  it("returns a pi-tui Component (not a bare string) rendering the message content", () => {
    const component = renderer(
      { customType: "theta-system-note", content: "line one\nline two", display: true } as never,
      opts,
      theme,
    );
    expect(component).toBeDefined();
    expect(typeof component).toBe("object");
    expect(component?.render(80)).toEqual(["line one", "line two"]);
    expect(typeof component?.invalidate).toBe("function");
  });

  it("returns undefined when display === false (Pi skips rendering)", () => {
    const component = renderer(
      { customType: "theta-system-note", content: "hidden", display: false } as never,
      opts,
      theme,
    );
    expect(component).toBeUndefined();
  });
});

// --- Convention: end-to-end harness — load + dispatch a command end-to-end ---

describe("H4a — end-to-end harness (Convention: end-to-end harness)", () => {
  it("loads the extension and dispatches a registered no-op command end-to-end", async () => {
    let ran = false;
    const noop: ThetaFixture = {
      slashName: "noop",
      run: async (_args, _ctx) => {
        ran = true;
      },
    };
    const loaded = loadExtension({ fixtures: [noop] });

    // `session_start` (fired by the harness) registered the per-theta command.
    expect(loaded.double.commands.has("noop")).toBe(true);

    await loaded.dispatch("noop", "");
    expect(ran).toBe(true);
  });

  it("passes the theta's `description` to pi.registerCommand (autocomplete entry; frontmatter-fields-a.md)", () => {
    const described: ThetaFixture = {
      slashName: "review",
      description: "Programmatic, parameterised code review",
      run: async () => {},
    };
    const undescribed: ThetaFixture = { slashName: "bare", run: async () => {} };
    const loaded = loadExtension({ fixtures: [described, undescribed] });
    // The described theta's autocomplete text reaches the registration seam...
    expect(loaded.double.commands.get("review")?.description).toBe(
      "Programmatic, parameterised code review",
    );
    // ...and a theta with no description registers untexted (no fabricated text).
    expect(loaded.double.commands.get("bare")?.description).toBeUndefined();
  });

  it("supplies fixtures in memory with no real filesystem read (in-memory fixture-supply)", () => {
    const loaded = loadExtension({
      fixtures: [{ slashName: "a", run: async () => {} }],
    });
    // The slash name is the in-memory fixture's, proving the discovery source
    // is the harness-provided fixture rather than any on-disk `.theta`. RFC
    // 0010 (EXST-11): `/theta-status` registers once per instance ahead of the
    // per-theta loop, so it leads the set.
    expect([...loaded.double.commands.keys()]).toEqual(["theta-status", "a"]);
  });
});

// --- Convention: end-to-end harness — session-double fidelity-contract self-check ---

describe("H4a — session-double fidelity contract self-check (Convention: end-to-end harness)", () => {
  it("(i) streamed assistant tokens are observable in the transcript before ctx.waitForIdle() resolves", async () => {
    // Axis (i): conversation-drive.md §"User-visible streaming ordering"
    // (SLSH-2) — tokens stream into the transcript before the terminal
    // `agent_end` that settles `waitForIdle()`.
    const double = new SessionDouble();
    createThetaExtension({ fixtures: [] })(double.pi);
    double.programResponse(["Hel", "lo"]);

    double.pi.sendUserMessage("hi");
    await double.ctx.waitForIdle();

    const log = double.events;
    expect(log.filter((e) => e === "stream-token")).toHaveLength(2);
    // All streamed tokens precede the terminal `agent_end`, which precedes the
    // `waitForIdle()` resolution.
    expect(log.indexOf("agent-end")).toBeGreaterThan(
      log.lastIndexOf("stream-token"),
    );
    expect(log.indexOf("idle")).toBeGreaterThan(log.indexOf("agent-end"));
  });

  it("(ii) one streamed assistant response is appended as a single prompt-mode turn", async () => {
    // Axis (ii): conversation-drive.md §"Driven-turn session-commit ordering"
    // — the driven turn commits exactly one trailing assistant message
    // carrying the accumulated streamed text.
    const double = new SessionDouble();
    createThetaExtension({ fixtures: [] })(double.pi);
    double.programResponse(["Hel", "lo"]);

    double.pi.sendUserMessage("hi");
    await double.ctx.waitForIdle();

    expect(double.transcript).toHaveLength(2);
    expect(double.transcript[0]?.role).toBe("user");
    expect(double.transcript[1]?.role).toBe("assistant");
    expect(double.transcript[1]?.text).toBe("Hello");
    // Exactly one assistant message for the driven turn — a single committed
    // prompt-mode turn, not one message per streamed token.
    expect(
      double.transcript.filter((m) => m.role === "assistant"),
    ).toHaveLength(1);
  });

  it("(iii) the pi.on cancel-forward subscription observes an aborted ctx.signal, and (iv) cancellation propagates the source reason (CNCL-4)", async () => {
    // Axis (iii): conversation-drive.md PIC-18 + cancellation.md §"Forwarding
    // into thetaAbort" — a `pi.on` turn-lifecycle handler forwards the aborted
    // `ctx.signal` into `thetaAbort`. Axis (iv): cancellation.md CNCL-4 —
    // `thetaAbort.signal.reason === source.reason` after forwarding.
    const double = new SessionDouble();
    createThetaExtension({ fixtures: [] })(double.pi);

    const thetaAbort = new AbortController();
    let observedAbortedSignal = false;
    double.pi.on("agent_end", (_event: unknown, ctx: ExtensionContext) => {
      const sig = ctx.signal;
      if (sig?.aborted === true) {
        observedAbortedSignal = true;
        thetaAbort.abort(sig.reason);
      }
    });

    const reason = new Error("theta cancelled by agent_end");
    double.programResponse(["x", "y", "z"]);
    double.pi.sendUserMessage("hi");
    // Pi/user-initiated cancel (the CNCL-4 source) while the turn is in flight.
    double.cancelTurn(reason);
    await double.ctx.waitForIdle();

    // (iii) the cancel-forward subscription fired with an aborted ctx.signal.
    expect(observedAbortedSignal).toBe(true);
    // (iv) the abort propagated into thetaAbort, mirroring the source reason.
    expect(thetaAbort.signal.aborted).toBe(true);
    expect(thetaAbort.signal.reason).toBe(reason);
  });

  it("(iii) ctx.signal is undefined once the turn has settled (idle, non-turn context)", async () => {
    const double = new SessionDouble();
    createThetaExtension({ fixtures: [] })(double.pi);
    // Before any turn, the agent is idle: ctx.signal is undefined.
    const idleCtx: ExtensionCommandContext = double.ctx;
    expect(idleCtx.signal).toBeUndefined();

    double.programResponse(["a"]);
    double.pi.sendUserMessage("hi");
    await double.ctx.waitForIdle();
    // After the turn settles, ctx.signal is undefined again.
    expect(double.ctx.signal).toBeUndefined();
  });
});

// --- RFC 0010 (EXST-2) + bug 0021 (PIC-68) — supersession disposes the
// --- outgoing generation's execution-status bus ------------------------------

/** A `StatusSink` counting `render`/`clear` calls (the only observables needed). */
interface CountingStatusSink extends StatusSink {
  renders: number;
  clears: number;
}

function countingStatusSink(): CountingStatusSink {
  return {
    id: "footer",
    renders: 0,
    clears: 0,
    render(): void {
      this.renders += 1;
    },
    clear(): void {
      this.clears += 1;
    },
  };
}

/** One composed generation's status-bus pair, captured per `composeInstance` call. */
interface StatusGeneration {
  readonly bus: ExecutionStatusBus;
  readonly sink: CountingStatusSink;
}

interface StatusBusSupersessionBoot {
  readonly clock: FakeClock;
  /** Per-compose generations, indexed by compose order. */
  readonly generations: StatusGeneration[];
  /** When set, the NEXT compose latches its bus and then throws (one-shot). */
  readonly flags: { failNextCompose: boolean };
  fireSessionStart(): Promise<void>;
}

/**
 * Boot the REAL factory with a `composeInstance` double that mints ONE
 * execution-status bus per compose over a SHARED `FakeClock` (production's
 * `root.clock`) and hands it back through the factory's `latchStatusBus`
 * parameter — the exact publication path the supersession step must reach.
 */
function bootStatusBusSupersession(): StatusBusSupersessionBoot {
  const clock = new FakeClock();
  const generations: StatusGeneration[] = [];
  const flags = { failNextCompose: false };
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

  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: async (
      _pi,
      _ctx,
      _ownRegisteredNames,
      _entryChannel,
      latchStatusBus,
    ): Promise<ExtensionInstanceWiring> => {
      const sink = countingStatusSink();
      const bus = createExecutionStatusBus({ clock, sinks: [sink] });
      generations.push({ bus, sink });
      // Production latches from INSIDE the compose (production-composition.ts),
      // so the factory's live slot already names the incoming bus by the time
      // its supersession step runs — the reason the outgoing one must be
      // snapshotted before the compose.
      latchStatusBus?.(bus);
      if (flags.failNextCompose) {
        // The compose-failure witness: the latch already names this pass's
        // bus when the throw unwinds — exactly the state factory.ts's
        // catch-path restoration (RFC 0010 EXST-2/EXST-8) must repair.
        flags.failNextCompose = false;
        throw new Error("forced compose failure (witness)");
      }
      return {
        thetas: [],
        registry: new ThetaRegistry(),
        activeInvocations: new ActiveInvocationRegistry(),
        forwardingSignals: [],
        statusBus: bus,
        clock,
        installHotReload: () => ({ detach: (): void => {} }),
      };
    },
  };
  createThetaExtension(deps)(pi);

  return {
    clock,
    generations,
    flags,
    fireSessionStart: async (): Promise<void> => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}

/** Loud indexed access — a missing generation is a harness fault, never a skip. */
function generationAt(
  boot: StatusBusSupersessionBoot,
  index: number,
): StatusGeneration {
  const generation = boot.generations[index];
  if (generation === undefined) {
    throw new Error(`compose #${index + 1} never minted its status bus`);
  }
  return generation;
}

describe("RFC 0010 (EXST-2) — supersede-before-publish disposes the outgoing status bus", () => {
  it("a shutdown-less repeat session_start silences the superseded generation's bus while the new one keeps rendering", async () => {
    const boot = bootStatusBusSupersession();

    // Generation 1 publishes and renders normally through its own sink.
    await boot.fireSessionStart();
    const a = generationAt(boot, 0);
    a.bus.invocationStarted("inv-a", "alpha");
    boot.clock.advance(STATUS_TICK_MS);
    expect(a.sink.renders).toBe(1);

    // Dirt with a PENDING tick and a lingering done-flash node: exactly the
    // state whose later linger/tick renders would write the SHARED footer key
    // against the incoming generation's bus.
    a.bus.invocationStarted("inv-a2", "alpha2");
    a.bus.invocationEnded("inv-a");
    const rendersBeforeSupersession = a.sink.renders;
    const clearsBeforeSupersession = a.sink.clears;

    // Supersession: the repeat delivery publishes generation 2 over generation 1.
    await boot.fireSessionStart();
    expect(boot.generations).toHaveLength(2);
    const b = generationAt(boot, 1);

    // (a) The outgoing bus was disposed at supersession — its sinks were
    // cleared exactly once on the way out.
    expect
      .soft(a.sink.clears, "(a) the outgoing bus is disposed at supersession")
      .toBe(clearsBeforeSupersession + 1);

    // (b) No further render EVER reaches the superseded generation's sink, not
    // from its pending coalescing tick, not from its done-flash linger sweep,
    // and not from a late publication into the orphaned bus.
    boot.clock.advance(STATUS_TICK_MS * 4 + DONE_LINGER_MS * 2);
    a.bus.invocationStarted("inv-a3", "alpha3");
    boot.clock.advance(STATUS_TICK_MS * 4 + DONE_LINGER_MS * 2);
    expect
      .soft(
        a.sink.renders,
        "(b) no superseded-generation render reaches the shared footer key",
      )
      .toBe(rendersBeforeSupersession);

    // (c) The live generation is untouched: its bus renders normally.
    b.bus.invocationStarted("inv-b", "beta");
    boot.clock.advance(STATUS_TICK_MS);
    expect(b.sink.renders).toBeGreaterThanOrEqual(1);
  });

  it("a compose pass that latched its bus and then threw is disposed and the latch restored to the surviving generation (EXST-2/EXST-8)", async () => {
    const boot = bootStatusBusSupersession();

    // Generation A composes and renders normally.
    await boot.fireSessionStart();
    const a = generationAt(boot, 0);
    a.bus.invocationStarted("inv-a", "alpha");
    boot.clock.advance(STATUS_TICK_MS);
    expect(a.sink.renders).toBe(1);

    // Generation B latches its bus, then the compose throws.
    boot.flags.failNextCompose = true;
    await boot.fireSessionStart();
    expect(boot.generations).toHaveLength(2);
    const b = generationAt(boot, 1);

    // (a) The failed pass's bus is disposed on the catch path: sinks cleared
    // once, and no render EVER reaches it — not even from late publications.
    expect
      .soft(b.sink.clears, "(a) the failed pass's bus is disposed")
      .toBe(1);
    b.bus.invocationStarted("inv-b", "beta");
    boot.clock.advance(STATUS_TICK_MS * 4 + DONE_LINGER_MS * 2);
    expect
      .soft(b.sink.renders, "(a) no render reaches the failed pass's bus")
      .toBe(0);

    // (b) The surviving generation kept its bus: it renders new dirt normally
    // (a disposal would have silenced the tick).
    const rendersBefore = a.sink.renders;
    a.bus.invocationStarted("inv-a2", "alpha2");
    boot.clock.advance(STATUS_TICK_MS);
    expect
      .soft(a.sink.renders, "(b) the surviving generation still renders")
      .toBeGreaterThan(rendersBefore);

    // (c) The latch was RESTORED to A — witnessed through the next successful
    // supersession: its outgoing-bus snapshot must dispose A (not the failed
    // B twice, and not nothing).
    const clearsBefore = a.sink.clears;
    await boot.fireSessionStart();
    expect(boot.generations).toHaveLength(3);
    expect
      .soft(
        a.sink.clears,
        "(c) the next supersession disposes A — the latch named A, not the failed B",
      )
      .toBe(clearsBefore + 1);
    expect.soft(b.sink.clears, "(c) the failed B is not disposed twice").toBe(1);
  });
});
