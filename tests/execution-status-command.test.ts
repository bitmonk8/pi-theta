import { describe, expect, it, vi } from "vitest";
import {
  RESERVED_COMMAND_NAMES,
  parseThetaStatusArg,
  registerThetaStatusCommand,
  type RegisterThetaStatusCommandDeps,
  type StatusCommandCtx,
  type StatusCommandPi,
} from "../src/extension/execution-status/status-command";
import { createExecutionStatusBus } from "../src/extension/execution-status/bus";
import { STATUS_TICK_MS, type ExecutionStatusBus, type StatusSink } from "../src/extension/execution-status/types";
import { FakeClock } from "./helpers/fake-clock";

// RFC 0010 (execution-status.md EXST-11) — `tests/execution-status-command.test.ts`
// (T-CMD command half). Behaviour-matrix rows B59-B63, B66 (B64/B65 require
// `discovery-walk.ts` collision wiring and `factory.ts`'s
// `bootstrapFailedDiagnostic` call site respectively — neither touched by
// this builder pass, so not asserted here; punted, see builder report).
//
// `registerThetaStatusCommand`'s handler reads `args`, calls `deps.current()`,
// and calls `ctx.ui.notify` — every session-scoped-effect / notify assertion
// below asserts the resulting effect. `parseThetaStatusArg` itself is a real,
// pure implementation (trivial grammar, no dependency to fake).

/** A recording fake `pi` exposing `registerCommand` (mirrors the
 *  `tests/extension-factory-harness.test.ts` recording-double style). */
function fakePi(): { pi: StatusCommandPi; getHandler: () => (args: string, ctx: StatusCommandCtx) => Promise<void> } {
  let handler: ((args: string, ctx: StatusCommandCtx) => Promise<void>) | undefined;
  const pi: StatusCommandPi = {
    registerCommand: (_name, options): void => {
      handler = options.handler;
    },
  };
  return {
    pi,
    getHandler: () => {
      if (handler === undefined) {
        throw new Error("registerCommand was never called");
      }
      return handler;
    },
  };
}

function recordingNotify(): { ctx: StatusCommandCtx; calls: { message: string; type?: string }[] } {
  const calls: { message: string; type?: string }[] = [];
  return {
    ctx: {
      ui: {
        notify: (message: string, type?: string): void => {
          calls.push(type === undefined ? { message } : { message, type });
        },
      },
    },
    calls,
  };
}

// ---------------------------------------------------------------------------
// parseThetaStatusArg — real, pure grammar.
// ---------------------------------------------------------------------------

describe("T-CMD — parseThetaStatusArg (real, pure grammar)", () => {
  it("accepts exactly off | min | tree after trimming", () => {
    expect(parseThetaStatusArg(" off ")).toBe("off");
    expect(parseThetaStatusArg("min")).toBe("min");
    expect(parseThetaStatusArg("tree")).toBe("tree");
  });

  it("rejects anything else, including case variants and empty", () => {
    expect(parseThetaStatusArg("Tree")).toBeUndefined();
    expect(parseThetaStatusArg("bogus")).toBeUndefined();
    expect(parseThetaStatusArg("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RESERVED_COMMAND_NAMES — real, pure constant.
// ---------------------------------------------------------------------------

describe("T-CMD — RESERVED_COMMAND_NAMES", () => {
  it("reserves exactly 'theta-status'", () => {
    expect(RESERVED_COMMAND_NAMES).toEqual(["theta-status"]);
  });
});

// ---------------------------------------------------------------------------
// B59 — /theta-status min: session-scoped effect on sink output.
// ---------------------------------------------------------------------------

describe("T-CMD — B59: /theta-status min changes the live bus view shape", () => {
  it("dispatching 'min' calls setViewShape('min') on the latched bus", async () => {
    const bus: ExecutionStatusBus = createExecutionStatusBus({ clock: new FakeClock(), sinks: [] });
    bus.setViewShape("tree"); // starting state
    const deps: RegisterThetaStatusCommandDeps = { current: () => bus };
    const { pi, getHandler } = fakePi();
    registerThetaStatusCommand(pi, deps);
    const { ctx } = recordingNotify();
    await getHandler()("min", ctx);
    expect(bus.viewShape()).toBe("min");
  });
});

// ---------------------------------------------------------------------------
// B60 — verbosity off ceiling: changing the view does not resume sink renders.
// ---------------------------------------------------------------------------

describe("T-CMD — B60: /theta-status tree under verbosity off still renders nothing", () => {
  it("view shape reaches 'tree' but verbosity stays 'off' (no widening)", async () => {
    const clock = new FakeClock();
    const sink: StatusSink = { id: "footer", render: vi.fn(), clear: vi.fn() };
    const bus: ExecutionStatusBus = createExecutionStatusBus({ clock, sinks: [sink] });
    bus.setViewShape("min");
    bus.setVerbosity("off");
    bus.invocationStarted("inv-1", "foo");
    const deps: RegisterThetaStatusCommandDeps = { current: () => bus };
    const { pi, getHandler } = fakePi();
    registerThetaStatusCommand(pi, deps);
    const { ctx } = recordingNotify();
    await getHandler()("tree", ctx);
    expect(bus.viewShape()).toBe("tree");
    expect(bus.verbosity()).toBe("off");
    clock.advance(STATUS_TICK_MS * 2);
    expect(sink.clear).toHaveBeenCalledTimes(1);
    expect(sink.render).not.toHaveBeenCalled();

    // Control: the same sink renders the tracked invocation when the ceiling opens.
    bus.setVerbosity("names");
    clock.advance(STATUS_TICK_MS);
    expect(sink.render).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: [expect.objectContaining({ invocationId: "inv-1" })] }),
      "tree",
      "names",
      expect.any(Number),
    );
    bus.dispose();
  });
});

// ---------------------------------------------------------------------------
// B61 — invalid/empty argument: no state change, one notify(warning), no throw.
// ---------------------------------------------------------------------------

describe("T-CMD — B61: invalid/empty argument notifies a warning, no state change", () => {
  it.each(["bogus", ""])("arg %j: notify called once with severity 'warning'", async (arg) => {
    const bus: ExecutionStatusBus = createExecutionStatusBus({ clock: new FakeClock(), sinks: [] });
    bus.setViewShape("tree");
    const deps: RegisterThetaStatusCommandDeps = { current: () => bus };
    const { pi, getHandler } = fakePi();
    registerThetaStatusCommand(pi, deps);
    const { ctx, calls } = recordingNotify();
    await expect(getHandler()(arg, ctx)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.type).toBe("warning");
    expect(bus.viewShape()).toBe("tree"); // unchanged
  });
});

// ---------------------------------------------------------------------------
// B66 — no live instance latched.
// ---------------------------------------------------------------------------

describe("T-CMD — B66: no live instance -> notify 'no live theta instance', no throw", () => {
  it("notify is called once, handler does not throw", async () => {
    const deps: RegisterThetaStatusCommandDeps = { current: () => undefined };
    const { pi, getHandler } = fakePi();
    registerThetaStatusCommand(pi, deps);
    const { ctx, calls } = recordingNotify();
    await expect(getHandler()("tree", ctx)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.message).toContain("no live theta instance");
  });
});

// ---------------------------------------------------------------------------
// B63 — fresh instance after /reload resets to the default view 'tree'.
// ---------------------------------------------------------------------------

describe("T-CMD — B63: a fresh bus instance defaults to view 'tree'", () => {
  it("a newly constructed bus (post-reload shape) starts at 'tree'", () => {
    const bus = createExecutionStatusBus({ clock: new FakeClock(), sinks: [] });
    expect(bus.viewShape()).toBe("tree");
  });
});
