// RFC-0006 (PIC-61 rung 2) — production host-loop dispatch collaborators.
//
// Drives `createProductionHostLoopDispatch` over a FAKE host that simulates the
// child's host agent loop (the real loop is live-only): a `sendUserMessage`
// schedules a fabricated turn that invokes the theta-controlled provider's
// two-state `streamSimple`, executes the authored `tool_use` against a fake tool
// executor, appends the toolResult to the session transcript, then fires
// `agent_settled`. The assertions pin the blueprint contract:
//   - the `agent_settled` barrier is ARMED before `sendUserMessage` (the
//     dispatch does not resolve until settled fires — `waitForIdle` alone is
//     insufficient, prototype CONSTRAINT 1);
//   - the code-supplied arguments are authored VERBATIM (zero model tokens);
//   - the appended toolResult (incl. `isError`) is read back to code;
//   - the session model + active set are snapshot/restored on success AND on
//     throw / abort (the bridge model is never left installed);
//   - the provider is unregistered and its stream fn deactivated afterwards.
//
// Spec: pi-integration-contract/subagent.md (PIC-61), .prototype-hld blueprint.

import { describe, expect, it } from "vitest";
import type { Api, Context, Model } from "@earendil-works/pi-ai";
import {
  createProductionHostLoopDispatch,
  probeHostLoopSurfaces,
  type HostLoopCtx,
  type HostLoopDispatchHost,
  type HostLoopPi,
} from "../src/extension/production-host-loop-dispatch";
import type { Clock } from "../src/seams/clock";
import type { EncodedToolRequest, HostToolResult } from "../src/runtime/host-loop-dispatch";

/** A minimal `Model<Api>` double (only the fields the bridge stream reads). */
function fakeModel(id: string, provider: string): Model<Api> {
  return {
    id,
    name: id,
    provider,
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 4096,
  } as unknown as Model<Api>;
}

/** A test `Clock` whose `setTimeout` fires on the microtask queue (deterministic). */
function testClock(): Clock {
  let t = 1000;
  return {
    now: () => (t += 1),
    wallNow: () => (t += 1),
    setTimeout: (fn: () => void): unknown => {
      void Promise.resolve().then(fn);
      return 0;
    },
    clearTimeout: (): void => {},
  };
}

interface FakeToolResult {
  readonly content: { type: string; text?: string }[];
  readonly isError: boolean;
}

/**
 * A fake child host that simulates the host agent loop. `sendUserMessage`
 * schedules (on the microtask queue, fire-and-forget like the real host) a
 * fabricated turn: it invokes the current bridge provider's `streamSimple` with
 * the user message, and — if a `tool_use` is authored — executes the tool via
 * `toolExecutor`, appends the toolResult entry, re-invokes `streamSimple` with
 * the toolResult present (which ends the turn), then fires `agent_settled`.
 */
class FakeChildHost {
  readonly op: string[] = [];
  readonly sends: { content: string; modelAtSend: string; activeAtSend: string[] }[] = [];
  readonly unregistered: string[] = [];
  readonly entries: { type: string; message?: Record<string, unknown> }[] = [];
  #providers = new Map<string, { streamSimple: (m: Model<Api>, c: Context) => AsyncIterable<unknown> }>();
  #model: Model<Api>;
  #activeTools: string[] = ["ambient-a", "ambient-b"];
  #idle = true;
  #settledHandlers: (() => void)[] = [];
  #authoredArgs: unknown;
  #fireSettled: boolean;
  #resultToolName: string | undefined;

  constructor(
    private readonly toolExecutor: (name: string, args: unknown) => FakeToolResult,
    options?: {
      readonly startModel?: Model<Api>;
      readonly fireSettled?: boolean;
      // Override the toolName the fabricated turn appends its toolResult under
      // (simulates the host loop running a DIFFERENT tool than the dispatched
      // one), so read-back finds no match → no-result.
      readonly resultToolName?: string;
    },
  ) {
    this.#model = options?.startModel ?? fakeModel("real-model", "real-provider");
    this.#fireSettled = options?.fireSettled ?? true;
    this.#resultToolName = options?.resultToolName;
  }

  /** The verbatim arguments the bridge authored into the `tool_use` (verbatim-propagation pin). */
  get authoredArgs(): unknown {
    return this.#authoredArgs;
  }

  get pi(): HostLoopPi {
    return {
      registerProvider: (name, config): void => {
        this.op.push(`register:${name}`);
        this.#providers.set(name, {
          streamSimple: config.streamSimple as never,
        });
      },
      unregisterProvider: (name): void => {
        this.op.push(`unregister:${name}`);
        this.unregistered.push(name);
        this.#providers.delete(name);
      },
      setActiveTools: (names): void => {
        this.op.push(`setActiveTools:[${names.join(",")}]`);
        this.#activeTools = [...names];
      },
      getActiveTools: (): string[] => [...this.#activeTools],
      setModel: (model): Promise<boolean> => {
        this.op.push(`setModel:${model.id}`);
        this.#model = model;
        return Promise.resolve(true);
      },
      sendUserMessage: (content): void => {
        this.op.push("send");
        this.sends.push({
          content,
          modelAtSend: this.#model.id,
          activeAtSend: [...this.#activeTools],
        });
        this.#idle = false;
        // Fire-and-forget: the turn runs asynchronously, exactly as the real
        // host schedules a fresh agent run after `sendUserMessage` returns.
        void this.#runFabricatedTurn(content);
      },
      on: (event, handler): void => {
        if (event === "agent_settled") {
          this.#settledHandlers.push(handler);
        }
      },
    };
  }

  get ctx(): HostLoopCtx {
    return {
      model: this.#model,
      modelRegistry: {
        find: (provider, id): Model<Api> | undefined =>
          this.#providers.has(provider) ? fakeModel(id, provider) : undefined,
      },
      sessionManager: {
        getEntries: (): readonly { type: string; message?: Record<string, unknown> }[] =>
          [...this.entries],
      },
      isIdle: (): boolean => this.#idle,
    };
  }

  get clock(): Clock {
    return testClock();
  }

  host(): HostLoopDispatchHost {
    return { pi: this.pi, ctx: this.ctx, clock: this.clock };
  }

  /** Whether any bridge provider remains registered (unregister/deactivation pin). */
  hasRegisteredProvider(): boolean {
    return this.#providers.size > 0;
  }

  async #drainForToolCall(
    stream: AsyncIterable<unknown>,
  ): Promise<{ name: string; arguments: unknown } | undefined> {
    let authored: { name: string; arguments: unknown } | undefined;
    for await (const event of stream) {
      const e = event as { type: string; toolCall?: { name: string; arguments: unknown } };
      if (e.type === "toolcall_end" && e.toolCall !== undefined) {
        authored = { name: e.toolCall.name, arguments: e.toolCall.arguments };
      }
    }
    return authored;
  }

  async #runFabricatedTurn(userContent: string): Promise<void> {
    const provider = this.#providers.get(this.#model.provider);
    if (provider === undefined) {
      this.#idle = true;
      this.#emitSettled();
      return;
    }
    const bridge = this.#model;
    // State A: the encoded request is the freshest user turn.
    const ctxA: Context = {
      messages: [{ role: "user", content: userContent, timestamp: 0 }],
    };
    const authored = await this.#drainForToolCall(provider.streamSimple(bridge, ctxA));
    if (authored !== undefined) {
      this.#authoredArgs = authored.arguments;
      const result = this.toolExecutor(authored.name, authored.arguments);
      const appendedName = this.#resultToolName ?? authored.name;
      this.entries.push({
        type: "message",
        message: {
          role: "toolResult",
          toolName: appendedName,
          content: result.content,
          isError: result.isError,
        },
      });
      // State B: the toolResult is now the freshest message → the turn ends.
      const ctxB: Context = {
        messages: [
          { role: "user", content: userContent, timestamp: 0 },
          { role: "assistant", content: [], timestamp: 0 } as never,
          {
            role: "toolResult",
            toolCallId: "x",
            toolName: authored.name,
            content: result.content,
            isError: result.isError,
            timestamp: 0,
          } as never,
        ],
      };
      await this.#drainForToolCall(provider.streamSimple(bridge, ctxB));
    }
    this.#idle = true;
    this.#emitSettled();
  }

  #emitSettled(): void {
    if (!this.#fireSettled) {
      return;
    }
    this.op.push("settled");
    for (const handler of [...this.#settledHandlers]) {
      handler();
    }
  }
}

const OK_EXECUTOR = (name: string, args: unknown): FakeToolResult => ({
  content: [{ type: "text", text: `RAN:${name}:${JSON.stringify(args)}` }],
  isError: false,
});

describe("PIC-61 rung 2 — production host-loop dispatch collaborators", () => {
  it("registers the provider, snapshots/switches the model, sends AFTER arming settled, reads the toolResult back, then unregisters + restores", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    const request: EncodedToolRequest = { toolName: "finding_store", args: { op: "write", id: 7 } };

    const result = await dispatch(request, new AbortController().signal);

    // Read-back carries the tool's return value verbatim.
    const text = result.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    expect(text).toBe(`RAN:finding_store:${JSON.stringify({ op: "write", id: 7 })}`);
    expect(result.isError).toBe(false);

    // The code-supplied args were authored VERBATIM into the `tool_use`.
    expect(host.authoredArgs).toEqual({ op: "write", id: 7 });

    // Ordering (the blueprint): snapshot active set → install [tool] → switch to
    // the bridge → SEND (settled armed before this) → settled → restore active
    // set → restore model. `send` MUST come after `setModel:host-loop-bridge`.
    const op = host.op;
    const iSetActive = op.indexOf("setActiveTools:[finding_store]");
    const iSetBridge = op.indexOf("setModel:host-loop-bridge");
    const iSend = op.indexOf("send");
    const iSettled = op.indexOf("settled");
    const iRestoreModel = op.lastIndexOf("setModel:real-model");
    expect(iSetActive).toBeGreaterThanOrEqual(0);
    expect(iSetActive).toBeLessThan(iSetBridge);
    expect(iSetBridge).toBeLessThan(iSend);
    expect(iSend).toBeLessThan(iSettled);
    expect(iSettled).toBeLessThan(iRestoreModel);

    // The bridge model is NOT left installed, and the ambient active set is
    // restored to its exact pre-dispatch snapshot.
    expect(op[op.length - 1]).toBe("setModel:real-model");
    expect(host.pi.getActiveTools()).toEqual(["ambient-a", "ambient-b"]);
  });

  it("the send happens while the bridge model + the [toolName] active set are installed (the authored call can execute)", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    await dispatch({ toolName: "my_tool", args: { q: 1 } }, new AbortController().signal);
    expect(host.sends).toHaveLength(1);
    expect(host.sends[0]!.modelAtSend).toBe("host-loop-bridge");
    expect(host.sends[0]!.activeAtSend).toEqual(["my_tool"]);
  });

  it("does NOT resolve until agent_settled fires (waitForIdle alone is insufficient — prototype CONSTRAINT 1)", async () => {
    // A host that NEVER fires agent_settled: the dispatch must stay pending.
    const host = new FakeChildHost(OK_EXECUTOR, { fireSettled: false });
    const dispatch = createProductionHostLoopDispatch(host.host());
    let settled = false;
    const p = dispatch({ toolName: "t", args: {} }, new AbortController().signal).then((r) => {
      settled = true;
      return r;
    });
    // Give the fabricated turn ample microtasks to run; without agent_settled the
    // dispatch cannot resolve.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    // The turn ran (the tool executed + appended a result) — it is ONLY the
    // settle barrier that gates resolution.
    expect(host.entries.some((e) => e.message?.["role"] === "toolResult")).toBe(true);
    void p; // leave pending; the test asserts non-resolution
  });

  it("returns an isError host tool result to code (not fabricated away)", async () => {
    const host = new FakeChildHost(() => ({
      content: [{ type: "text", text: "boom" }],
      isError: true,
    }));
    const dispatch = createProductionHostLoopDispatch(host.host());
    const result = await dispatch({ toolName: "t", args: {} }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.content.map((b) => b.text).join("")).toBe("boom");
  });

  it("entries-scoping: a pre-existing toolResult entry is not read back as the new result", async () => {
    // The executor appends a result for the dispatched tool. A stale toolResult
    // for another tool is pre-seeded to prove read-back scopes to entries
    // appended by THIS turn + matching name (never the stale OTHER one).
    const host = new FakeChildHost(OK_EXECUTOR);
    host.entries.push({
      type: "message",
      message: { role: "toolResult", toolName: "OTHER", content: [{ type: "text", text: "stale" }], isError: false },
    });
    const dispatch = createProductionHostLoopDispatch(host.host());
    const result = await dispatch({ toolName: "finding_store", args: { op: "read" } }, new AbortController().signal);
    // The turn DID run finding_store (executor is name-agnostic), so this
    // resolves ok — assert the RIGHT result, not the stale OTHER one.
    expect(result.content.map((b) => b.text).join("")).toContain("RAN:finding_store");
  });

  it("fail-closed: an isError no-result when the fabricated turn appends a toolResult for a DIFFERENT tool name only", async () => {
    // The host loop ran (and appended a toolResult for) a DIFFERENT tool than the
    // dispatched one — read-back finds no match for the dispatched name → an
    // isError no-result carrying the exact "produced no tool result" message,
    // never a fabricated ok.
    const host = new FakeChildHost(OK_EXECUTOR, { resultToolName: "some_other_tool" });
    const dispatch = createProductionHostLoopDispatch(host.host());
    const result = await dispatch({ toolName: "finding_store", args: { op: "read" } }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.content.map((b) => b.text).join("")).toBe(
      "host-loop dispatch produced no tool result for 'finding_store'",
    );
  });

  it("restores the model even when the fabricated turn is aborted mid-flight (bridge never left installed)", async () => {
    const controller = new AbortController();
    // A host that never fires settled; we abort instead — restore must still run.
    const host = new FakeChildHost(OK_EXECUTOR, { fireSettled: false });
    const dispatch = createProductionHostLoopDispatch(host.host());
    const p = dispatch({ toolName: "t", args: {} }, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await p;
    // Model restored to the original; provider unregistered.
    expect(host.op[host.op.length - 1]).toBe("setModel:real-model");
    expect(host.unregistered).toHaveLength(1);
    expect(host.hasRegisteredProvider()).toBe(false);
  });

  it("unregisters the provider and deactivates its stream fn after the dispatch", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    await dispatch({ toolName: "t", args: {} }, new AbortController().signal);
    expect(host.unregistered).toHaveLength(1);
    expect(host.hasRegisteredProvider()).toBe(false);
  });

  it("serialises concurrent dispatches (the session model switch is a shared resource)", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    const [a, b] = await Promise.all([
      dispatch({ toolName: "tool_a", args: { n: 1 } }, new AbortController().signal),
      dispatch({ toolName: "tool_b", args: { n: 2 } }, new AbortController().signal),
    ]);
    expect(a.content.map((x) => x.text).join("")).toContain("RAN:tool_a");
    expect(b.content.map((x) => x.text).join("")).toContain("RAN:tool_b");
    // Two register/unregister cycles, never interleaved: each register is
    // immediately followed by its own send/settled/unregister before the next
    // register (serialised).
    const registers = host.op.filter((o) => o.startsWith("register:"));
    expect(registers).toHaveLength(2);
    const firstUnregister = host.op.findIndex((o) => o.startsWith("unregister:"));
    const secondRegister = host.op.indexOf(registers[1]!);
    expect(firstUnregister).toBeLessThan(secondRegister);
  });
});

describe("PIC-61 rung 2 — probeHostLoopSurfaces (typeof capability probe)", () => {
  function fullPi(): Record<string, unknown> {
    return {
      registerProvider: (): void => {},
      unregisterProvider: (): void => {},
      setActiveTools: (): void => {},
      getActiveTools: (): string[] => [],
      setModel: (): Promise<boolean> => Promise.resolve(true),
      sendUserMessage: (): void => {},
      on: (): void => {},
    };
  }
  function fullCtx(): Record<string, unknown> {
    return {
      isIdle: (): boolean => true,
      modelRegistry: { find: (): undefined => undefined },
      sessionManager: { getEntries: (): unknown[] => [] },
    };
  }

  it("passes when every required Pi surface is present", () => {
    expect(probeHostLoopSurfaces({ pi: fullPi(), ctx: fullCtx() })).toBe(true);
  });

  it("fails (fail-closed) when any single Pi surface is missing", () => {
    for (const drop of ["registerProvider", "unregisterProvider", "setModel", "sendUserMessage", "on"]) {
      const pi = fullPi();
      delete pi[drop];
      expect(probeHostLoopSurfaces({ pi, ctx: fullCtx() }), `dropping pi.${drop}`).toBe(false);
    }
    const ctxNoFind = { isIdle: (): boolean => true, sessionManager: { getEntries: (): unknown[] => [] } };
    expect(probeHostLoopSurfaces({ pi: fullPi(), ctx: ctxNoFind })).toBe(false);
    const ctxNoEntries = { isIdle: (): boolean => true, modelRegistry: { find: (): undefined => undefined } };
    expect(probeHostLoopSurfaces({ pi: fullPi(), ctx: ctxNoEntries })).toBe(false);
  });

  it("fails when pi or ctx is absent", () => {
    expect(probeHostLoopSurfaces({ pi: undefined, ctx: fullCtx() })).toBe(false);
    expect(probeHostLoopSurfaces({ pi: fullPi(), ctx: null })).toBe(false);
  });
});
