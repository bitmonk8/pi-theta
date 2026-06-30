import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import loomExtension, {
  createLoomExtension,
  type LoomFixture,
} from "../src/extension/factory";
import { loadExtension, SessionDouble } from "./harness/index";
import { createSystemNoteRenderer } from "../src/extension/system-note-renderer";

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
    createLoomExtension({ fixtures: [] })(double.pi);

    // Factory-body synchronous-arm registrations all took effect.
    expect(double.flags.has("loom")).toBe(true);
    expect(double.renderers.has("loom-system-note")).toBe(true);
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
    expect(() => createLoomExtension({ fixtures: [] })(pi)).not.toThrow();

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
    expect(() => createLoomExtension({ fixtures: [] })(pi)).not.toThrow();
  });

  it("returns synchronously — the return value is undefined, not a thenable (synchronous-arm pin)", () => {
    const double = new SessionDouble();
    const ret: void = createLoomExtension({ fixtures: [] })(double.pi);
    expect(ret).toBeUndefined();
    // Not a Promise: no thenable returned-value arm exists to reject.
    expect((ret as unknown as { then?: unknown } | undefined)?.then).toBeUndefined();

    // The production default export is the same synchronous-arm factory.
    const prod: void = loomExtension(new SessionDouble().pi);
    expect(prod).toBeUndefined();
  });
});

// --- Convention: phase categories — the loom-system-note renderer shape ---

describe("H4a — loom-system-note renderer (Convention: Pi-extension shell)", () => {
  const renderer = createSystemNoteRenderer();
  const opts = { expanded: false } as never;
  const theme = {} as never;

  it("returns a pi-tui Component (not a bare string) rendering the message content", () => {
    const component = renderer(
      { customType: "loom-system-note", content: "line one\nline two", display: true } as never,
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
      { customType: "loom-system-note", content: "hidden", display: false } as never,
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
    const noop: LoomFixture = {
      slashName: "noop",
      run: async (_args, _ctx) => {
        ran = true;
      },
    };
    const loaded = loadExtension({ fixtures: [noop] });

    // `session_start` (fired by the harness) registered the per-loom command.
    expect(loaded.double.commands.has("noop")).toBe(true);

    await loaded.dispatch("noop", "");
    expect(ran).toBe(true);
  });

  it("supplies fixtures in memory with no real filesystem read (in-memory fixture-supply)", () => {
    const loaded = loadExtension({
      fixtures: [{ slashName: "a", run: async () => {} }],
    });
    // The slash name is the in-memory fixture's, proving the discovery source
    // is the harness-provided fixture rather than any on-disk `.loom`.
    expect([...loaded.double.commands.keys()]).toEqual(["a"]);
  });
});

// --- Convention: end-to-end harness — session-double fidelity-contract self-check ---

describe("H4a — session-double fidelity contract self-check (Convention: end-to-end harness)", () => {
  it("(i) streamed assistant tokens are observable in the transcript before ctx.waitForIdle() resolves", async () => {
    // Axis (i): conversation-drive.md §"User-visible streaming ordering"
    // (SLSH-2) — tokens stream into the transcript before the terminal
    // `agent_end` that settles `waitForIdle()`.
    const double = new SessionDouble();
    createLoomExtension({ fixtures: [] })(double.pi);
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
    createLoomExtension({ fixtures: [] })(double.pi);
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
    // into loomAbort" — a `pi.on` turn-lifecycle handler forwards the aborted
    // `ctx.signal` into `loomAbort`. Axis (iv): cancellation.md CNCL-4 —
    // `loomAbort.signal.reason === source.reason` after forwarding.
    const double = new SessionDouble();
    createLoomExtension({ fixtures: [] })(double.pi);

    const loomAbort = new AbortController();
    let observedAbortedSignal = false;
    double.pi.on("agent_end", (_event: unknown, ctx: ExtensionContext) => {
      const sig = ctx.signal;
      if (sig?.aborted === true) {
        observedAbortedSignal = true;
        loomAbort.abort(sig.reason);
      }
    });

    const reason = new Error("loom cancelled by agent_end");
    double.programResponse(["x", "y", "z"]);
    double.pi.sendUserMessage("hi");
    // Pi/user-initiated cancel (the CNCL-4 source) while the turn is in flight.
    double.cancelTurn(reason);
    await double.ctx.waitForIdle();

    // (iii) the cancel-forward subscription fired with an aborted ctx.signal.
    expect(observedAbortedSignal).toBe(true);
    // (iv) the abort propagated into loomAbort, mirroring the source reason.
    expect(loomAbort.signal.aborted).toBe(true);
    expect(loomAbort.signal.reason).toBe(reason);
  });

  it("(iii) ctx.signal is undefined once the turn has settled (idle, non-turn context)", async () => {
    const double = new SessionDouble();
    createLoomExtension({ fixtures: [] })(double.pi);
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
