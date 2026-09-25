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

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
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
  /**
   * Bug 0491: emulate the host's thinking-level control. Present ⇒ the `pi`
   * carrier exposes get/setThinkingLevel. `host` selects the model-switch rule:
   *   - "current" (pi ≥ 0.84.3, the default): the `perModel` level for the
   *     target id, else the settings default, else the current level — clamped to
   *     the target's supported levels; nothing is persisted.
   *   - "legacy" (pi < 0.84.3): the level is kept when the OUTGOING model
   *     reasons, else the settings default is taken; a non-reasoning target
   *     clamps to `off`; every changing set persists the level as the
   *     settings default (`settingsWrites`) unless it is `off` on a
   *     non-reasoning model.
   */
  readonly thinking?: {
    readonly initial: string;
    readonly perModel?: Readonly<Record<string, string>>;
    readonly host?: "current" | "legacy";
    /** The global default; `null` = unset (a ≥ 0.84.3 switch then keeps the current level). Default "medium". */
    readonly settingsDefault?: string | null;
  };
}

/** A registered bridge provider's stream function (the only member the fake invokes). */
interface RegisteredProvider {
  streamSimple: (m: Model<Api>, c: Context) => AsyncIterable<unknown>;
}

/** pi-ai `ThinkingLevel` order (the clamp walks it up, then down). */
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

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
  /** The `api` tag every registered provider config carried (bug 0477: must be a bespoke, non-reserved name). */
  readonly registeredApis: unknown[] = [];
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
  #thinking: FakeHostLoopHostOptions["thinking"];
  #thinkingLevel: string;
  #settingsDefault: string | undefined;
  /** Every setThinkingLevel call, in order. */
  readonly thinkingCalls: string[] = [];
  /** Legacy host only: every persisted `defaultThinkingLevel` write. */
  readonly settingsWrites: string[] = [];
  /** Every level change the session saw, from any cause (a `thinking_level_change`). */
  readonly levelChanges: string[] = [];
  #registeredModels = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly toolExecutor: (name: string, args: unknown) => FakeToolResult,
    options?: FakeHostLoopHostOptions,
  ) {
    this.#model = options?.startModel ?? fakeModel("real-model", "real-provider");
    this.#fireSettled = options?.fireSettled ?? true;
    this.#resultToolName = options?.resultToolName;
    this.#sendThrows = options?.sendThrows;
    this.#thinking = options?.thinking;
    this.#thinkingLevel = options?.thinking?.initial ?? "off";
    const d = options?.thinking?.settingsDefault;
    this.#settingsDefault = d === null ? undefined : (d ?? "medium");
  }

  #reasons(model: Model<Api>): boolean {
    return (model as { reasoning?: boolean }).reasoning === true;
  }

  /** pi-ai `getSupportedThinkingLevels`: a `null` map entry drops a level; xhigh/max need an entry. */
  #supported(model: Model<Api>): string[] {
    if (!this.#reasons(model)) {
      return ["off"];
    }
    const map = (model as { thinkingLevelMap?: Record<string, string | null> }).thinkingLevelMap;
    return LEVELS.filter((l) => {
      const mapped = map?.[l];
      if (mapped === null) return false;
      if (l === "xhigh" || l === "max") return mapped !== undefined;
      return true;
    });
  }

  /** pi-ai `clampThinkingLevel`: the level if supported, else the next higher, else the next lower. */
  #clamp(model: Model<Api>, level: string): string {
    const ok = this.#supported(model);
    if (ok.includes(level)) return level;
    const i = LEVELS.indexOf(level);
    for (let j = i; j < LEVELS.length; j++) if (ok.includes(LEVELS[j]!)) return LEVELS[j]!;
    for (let j = i - 1; j >= 0; j--) if (ok.includes(LEVELS[j]!)) return LEVELS[j]!;
    return ok[0] ?? "off";
  }

  /** Apply a level the way the host's internal setThinkingLevel does (clamp + legacy persistence). */
  #applyLevel(level: string): void {
    const effective = this.#clamp(this.#model, level);
    if (effective === this.#thinkingLevel) {
      return;
    }
    this.#thinkingLevel = effective;
    this.levelChanges.push(effective);
    if (this.#thinking?.host === "legacy" && (this.#reasons(this.#model) || effective !== "off")) {
      this.settingsWrites.push(effective);
      this.#settingsDefault = effective;
    }
  }

  get thinkingLevel(): string {
    return this.#thinkingLevel;
  }

  setThinkingLevel(level: string): void {
    this.op.push(`setThinkingLevel:${level}`);
    this.thinkingCalls.push(level);
    this.#applyLevel(level);
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
    if (!this.#providers.has(provider)) {
      return undefined;
    }
    // The registered model config (reasoning, thinkingLevelMap) over the fake base.
    return { ...fakeModel(id, provider), ...(this.#registeredModels.get(`${provider}/${id}`) ?? {}) } as unknown as Model<Api>;
  }

  // ── The narrow host-loop surface members both legs delegate to ────────────

  registerProvider(name: string, config: { streamSimple: unknown; api?: unknown }): void {
    this.op.push(`register:${name}`);
    this.registeredApis.push(config.api);
    this.#providers.set(name, { streamSimple: config.streamSimple as never });
    for (const m of ((config as { models?: Record<string, unknown>[] }).models ?? [])) {
      this.#registeredModels.set(`${name}/${String(m.id)}`, m);
    }
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
    if (this.#thinking?.host === "legacy") {
      // Derived from the OUTGOING model, before the switch (pi < 0.84.3).
      const derived = this.#reasons(this.#model) ? this.#thinkingLevel : (this.#settingsDefault ?? "medium");
      this.#model = model;
      this.#applyLevel(derived);
      return Promise.resolve(true);
    }
    this.#model = model;
    if (this.#thinking !== undefined) {
      // pi ≥ 0.84.3: per-model level, else the settings default, else current.
      this.#applyLevel(this.#thinking.perModel?.[model.id] ?? this.#settingsDefault ?? this.#thinkingLevel);
    }
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
      ...(this.#thinking !== undefined
        ? {
            getThinkingLevel: (): string => this.#thinkingLevel,
            setThinkingLevel: ((level: string): void => this.setThinkingLevel(level)) as never,
          }
        : {}),
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

/**
 * The fake PARENT host: serves the production compose helper's load pass (the
 * discovery/admission `pi` + `ctx` surfaces) AND simulates the user session's
 * host agent loop for the composition-built host-loop dispatch — the SAME
 * shared fabricated-turn core production-host-loop-dispatch.test.ts drives
 * (`FakeHostLoopHost`), with only the parent-leg load-pass surfaces added.
 */
export class FakeParentHost {
  /** The shared fabricated-turn simulation (providers, model, active set, transcript). */
  readonly loop: FakeHostLoopHost;
  readonly notifications: string[] = [];
  readonly notes: string[] = [];
  getAllToolsCalls = 0;

  constructor(readonly cwd: string, private readonly toolParameters: unknown) {
    this.loop = new FakeHostLoopHost((name, args) => ({
      content: [{ type: "text", text: `RAN:${name}:${JSON.stringify(args)}` }],
      isError: false,
    }));
  }

  get executorCalls(): readonly { name: string; args: unknown }[] {
    return this.loop.executorCalls;
  }

  get currentModelId(): string {
    return this.loop.currentModelId;
  }

  get activeTools(): readonly string[] {
    return this.loop.activeTools;
  }

  get pi(): ExtensionAPI {
    const loop = this.loop;
    return {
      getFlag: (): undefined => undefined,
      getCommands: (): readonly unknown[] => [],
      sendMessage: (message: { content?: unknown }): void => {
        if (typeof message.content === "string") {
          this.notes.push(message.content);
        }
      },
      registerMessageRenderer: (): void => {},
      getActiveTools: (): string[] => loop.getActiveTools(),
      setActiveTools: (names: string[]): void => loop.setActiveTools(names),
      // The extension-registered tool the mode-independent admission reads —
      // COUNTED so the load-time-only-resolution invariant is assertable.
      getAllTools: (): readonly unknown[] => {
        this.getAllToolsCalls += 1;
        return [
          {
            name: "my_tool",
            parameters: this.toolParameters,
            sourceInfo: { scope: "user" },
          },
        ];
      },
      registerProvider: (name: string, config: { streamSimple: unknown }): void =>
        loop.registerProvider(name, config),
      unregisterProvider: (name: string): void => loop.unregisterProvider(name),
      setModel: (model: Model<Api>): Promise<boolean> => loop.setModel(model),
      sendUserMessage: (content: string): void => loop.sendUserMessage(content),
      on: (event: string, handler: () => void): void => loop.on(event, handler),
    } as unknown as ExtensionAPI;
  }

  get ctx(): ExtensionContext {
    const host = this;
    const loop = this.loop;
    return {
      cwd: this.cwd,
      hasUI: true,
      get model(): Model<Api> {
        return loop.currentModel;
      },
      isIdle: (): boolean => loop.isIdle(),
      modelRegistry: {
        getAvailable: (): readonly unknown[] => [],
        find: (provider: string, id: string): Model<Api> | undefined =>
          loop.findRegisteredModel(provider, id),
      },
      sessionManager: {
        getEntries: (): readonly { type: string; message?: Record<string, unknown> }[] =>
          [...loop.entries],
        getLeafId: (): undefined => undefined,
      },
      ui: {
        notify: (message: string): void => {
          host.notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;
  }

  /** The per-dispatch `ExtensionCommandContext` a slash dispatch would carry. */
  runCtx(): ExtensionCommandContext {
    const loop = this.loop;
    return {
      signal: undefined,
      cwd: this.cwd,
      get model(): Model<Api> {
        return loop.currentModel;
      },
      isIdle: (): boolean => loop.isIdle(),
      waitForIdle: (): Promise<void> => Promise.resolve(),
      modelRegistry: {
        getAvailable: (): readonly unknown[] => [],
        find: (provider: string, id: string): Model<Api> | undefined =>
          loop.findRegisteredModel(provider, id),
      },
      sessionManager: {
        getEntries: (): readonly { type: string; message?: Record<string, unknown> }[] =>
          [...loop.entries],
        getLeafId: (): undefined => undefined,
      },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionCommandContext;
  }
}
