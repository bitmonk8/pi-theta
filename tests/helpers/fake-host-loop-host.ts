// Shared fabricated-turn host-loop simulation (bug 0001 / PIC-64).
//
// `FakeHostLoopHost` simulates the host agent loop the PIC-64 rung-2 host-loop
// dispatch drives — identically in BOTH legs, because "the (a)–(f) wiring is
// identical in both, the only difference being which session backs the
// dispatch" (pi-integration-contract/subagent.md PIC-64): `sendUserMessage`
// schedules (on the microtask queue, fire-and-forget like the real host) a
// fabricated turn that invokes the current bridge provider's two-state
// `streamSimple` with the user message, and — if a `tool_use` is authored —
// executes the tool via the injected `toolExecutor`, appends the toolResult
// transcript entry, re-invokes `streamSimple` with the toolResult present
// (which ends the turn), then fires `agent_settled`.
//
// Consumers parameterise only what genuinely differs per leg:
//   - production-host-loop-dispatch.test.ts (CHILD leg) drives the seam
//     directly over `host()` and uses the failure-path options (`fireSettled`,
//     `resultToolName`, `sendThrows`, `startModel`);
//   - prompt-mode-extension-tool-reach-e2e.test.ts (PARENT leg) wraps this core
//     with the composition root's load-pass `ExtensionAPI` / `ExtensionContext`
//     surfaces, delegating every host-loop member here.

import type { Api, Context, Model } from "@earendil-works/pi-ai";
import type {
  HostLoopCtx,
  HostLoopDispatchHost,
  HostLoopPi,
} from "../../src/extension/production-host-loop-dispatch";
import type { Clock } from "../../src/seams/clock";

/** A minimal `Model<Api>` double (only the fields the bridge stream reads). */
export function fakeModel(id: string, provider: string): Model<Api> {
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
export function testClock(): Clock {
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

export interface FakeToolResult {
  readonly content: { type: string; text?: string }[];
  readonly isError: boolean;
}

export interface FakeHostLoopHostOptions {
  readonly startModel?: Model<Api>;
  /** Whether the fabricated turn fires `agent_settled` (default true). */
  readonly fireSettled?: boolean;
  /**
   * Override the toolName the fabricated turn appends its toolResult under
   * (simulates the host loop running a DIFFERENT tool than the dispatched
   * one), so read-back finds no match → no-result.
   */
  readonly resultToolName?: string;
  /**
   * Make `sendUserMessage` throw synchronously (the THROW path of the
   * restore-in-finally pin) instead of scheduling the fabricated turn.
   */
  readonly sendThrows?: Error;
}

/** A registered bridge provider's stream function (the only member the fake invokes). */
interface RegisteredProvider {
  streamSimple: (m: Model<Api>, c: Context) => AsyncIterable<unknown>;
}

/**
 * The shared fake host simulating the host agent loop behind PIC-64 rung-2
 * host-loop dispatch (see the module header). State + the fabricated-turn
 * machinery live here; the narrow host-loop surface members are public methods
 * so each leg's `pi` / `ctx` carrier can delegate to them.
 */
export class FakeHostLoopHost {
  readonly op: string[] = [];
  readonly sends: { content: string; modelAtSend: string; activeAtSend: string[] }[] = [];
  readonly unregistered: string[] = [];
  readonly entries: { type: string; message?: Record<string, unknown> }[] = [];
  /** Every tool execution the fabricated turn ran (name + verbatim decoded args). */
  readonly executorCalls: { name: string; args: unknown }[] = [];
  #providers = new Map<string, RegisteredProvider>();
  #model: Model<Api>;
  #activeTools: string[] = ["ambient-a", "ambient-b"];
  #idle = true;
  #settledHandlers: (() => void)[] = [];
  #authoredArgs: unknown;
  #fireSettled: boolean;
  #resultToolName: string | undefined;
  #sendThrows: Error | undefined;

  constructor(
    private readonly toolExecutor: (name: string, args: unknown) => FakeToolResult,
    options?: FakeHostLoopHostOptions,
  ) {
    this.#model = options?.startModel ?? fakeModel("real-model", "real-provider");
    this.#fireSettled = options?.fireSettled ?? true;
    this.#resultToolName = options?.resultToolName;
    this.#sendThrows = options?.sendThrows;
  }

  /** The verbatim arguments the bridge authored into the `tool_use` (verbatim-propagation pin). */
  get authoredArgs(): unknown {
    return this.#authoredArgs;
  }

  /** The session's CURRENT model (live — for a parent-leg `ctx.model` getter). */
  get currentModel(): Model<Api> {
    return this.#model;
  }

  get currentModelId(): string {
    return this.#model.id;
  }

  get activeTools(): readonly string[] {
    return [...this.#activeTools];
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Whether any bridge provider remains registered (unregister/deactivation pin). */
  hasRegisteredProvider(): boolean {
    return this.#providers.size > 0;
  }

  /** `modelRegistry.find` semantics: resolves only under a registered provider name. */
  findRegisteredModel(provider: string, id: string): Model<Api> | undefined {
    return this.#providers.has(provider) ? fakeModel(id, provider) : undefined;
  }

  // ── The narrow host-loop surface members both legs delegate to ────────────

  registerProvider(name: string, config: { streamSimple: unknown }): void {
    this.op.push(`register:${name}`);
    this.#providers.set(name, { streamSimple: config.streamSimple as never });
  }

  unregisterProvider(name: string): void {
    this.op.push(`unregister:${name}`);
    this.unregistered.push(name);
    this.#providers.delete(name);
  }

  setActiveTools(names: string[]): void {
    this.op.push(`setActiveTools:[${names.join(",")}]`);
    this.#activeTools = [...names];
  }

  getActiveTools(): string[] {
    return [...this.#activeTools];
  }

  setModel(model: Model<Api>): Promise<boolean> {
    this.op.push(`setModel:${model.id}`);
    this.#model = model;
    return Promise.resolve(true);
  }

  sendUserMessage(content: string): void {
    if (this.#sendThrows !== undefined) {
      this.op.push("send-throw");
      throw this.#sendThrows;
    }
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
  }

  on(event: string, handler: () => void): void {
    if (event === "agent_settled") {
      this.#settledHandlers.push(handler);
    }
  }

  // ── Ready-made carriers for the seam-direct (child) leg ───────────────────

  get pi(): HostLoopPi {
    return {
      registerProvider: (name, config): void => this.registerProvider(name, config),
      unregisterProvider: (name): void => this.unregisterProvider(name),
      setActiveTools: (names): void => this.setActiveTools(names),
      getActiveTools: (): string[] => this.getActiveTools(),
      setModel: (model): Promise<boolean> => this.setModel(model),
      sendUserMessage: (content): void => this.sendUserMessage(content),
      on: (event, handler): void => this.on(event, handler),
    };
  }

  get ctx(): HostLoopCtx {
    return {
      model: this.#model,
      modelRegistry: {
        find: (provider, id): Model<Api> | undefined =>
          this.findRegisteredModel(provider, id),
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

  // ── The fabricated-turn simulation ─────────────────────────────────────────

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

  /**
   * The simulated host agent loop: state A authors the `tool_use` from the
   * bridge provider, the injected executor runs it, the toolResult is appended
   * to the transcript, state B ends the turn, and `agent_settled` fires.
   */
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
      this.executorCalls.push({ name: authored.name, args: authored.arguments });
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
