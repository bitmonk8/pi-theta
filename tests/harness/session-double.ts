// H4a — in-process Pi session double.
//
// A reusable, in-memory double of the pinned `@earendil-works/pi-coding-agent`
// SDK surface the loom extension factory and the prompt-mode driver touch:
// the `ExtensionAPI` registration/subscription/drive surface (`pi`) and the
// `ExtensionCommandContext` a slash handler receives (`ctx`). It captures
// registrations (flags, the renderer, slash commands, `pi.on` subscriptions),
// models a driven prompt-mode turn, and provides a MINIMAL response-emission
// capability (the H4a deliverable) sufficient to drive the session-double
// fidelity-contract self-check items (i) and (ii). The full scripted-injection
// response-programming surface is split across H4b / H4c.
//
// This is test-support code (Pi never loads it), so it lives under `tests/` and
// is outside the `src/**` mechanical gates: it may use ambient timing and
// `Promise` freely. The double's modelled behaviours are pinned to the spec
// behaviour model (conversation-drive.md / cancellation.md), and the self-check
// asserts the double against THAT model — it runs no live Pi session and so
// cannot detect the double diverging from real Pi (no mechanical real-host
// fidelity gate exists in loom 1.0).

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { ResponseProgrammer, type ResponseEvent } from "./response-program";

type EventHandler = (event: unknown, ctx: ExtensionCommandContext) => unknown;

interface TranscriptMessage {
  role: "user" | "assistant";
  text: string;
  /** True while the assistant message is still accumulating streamed tokens. */
  streaming: boolean;
}

/** A custom message emitted via `pi.sendMessage` (the diagnostics channel). */
interface SentMessage {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
}

interface RegisteredCommandRecord {
  /** The autocomplete description passed to `pi.registerCommand` (optional). */
  readonly description?: string;
  readonly handler: (
    args: string,
    ctx: ExtensionCommandContext,
  ) => Promise<void>;
}

interface DrivenTurn {
  readonly controller: AbortController;
  ended: boolean;
  readonly done: Promise<void>;
}

/**
 * In-process double of the Pi session surfaces the loom extension consumes.
 *
 * Behaviour model (faithful to the cited spec axes):
 *  - `sendUserMessage` begins a single prompt-mode driven turn: one `user`
 *    message plus exactly one `assistant` message that ACCUMULATES the
 *    programmed streamed tokens (a single committed turn, not one message per
 *    token).
 *  - Tokens stream into the transcript and fire `message_update` BEFORE the
 *    terminal `agent_end` fires; `waitForIdle()` resolves only after
 *    `agent_end` — so streamed tokens are observable before resolution.
 *  - `ctx.signal` is the in-flight turn's `AbortSignal`; `cancelTurn(reason)`
 *    models a Pi/user-initiated cancel (the CNCL-4 source), aborting that
 *    signal with `reason` and firing the terminal `agent_end` so the
 *    subscribed `pi.on` handlers observe the aborted signal and `waitForIdle()`
 *    resolves. `ctx.abort()` models the loom→Pi teardown direction.
 */
export class SessionDouble {
  readonly flags = new Map<string, boolean | string>();
  readonly renderers = new Map<string, unknown>();
  readonly commands = new Map<string, RegisteredCommandRecord>();
  readonly subscriptions = new Map<string, EventHandler[]>();
  readonly transcript: TranscriptMessage[] = [];
  /** Ordered log of streaming / lifecycle events, for ordering assertions. */
  readonly events: string[] = [];
  /**
   * Custom messages sent via `pi.sendMessage` — the diagnostics channel the
   * `loom-system-note` renderer surfaces. The `M-T` happy-path assertion that
   * a dispatch produces "no diagnostic" reads this log; a `loom-system-note`
   * here is a surfaced diagnostic.
   */
  readonly systemNotes: SentMessage[] = [];

  #programmed: string[][] = [];
  #turn: DrivenTurn | undefined;

  /**
   * The H4b response-programming surface: the single input-side scripting API
   * the double exposes (categories (a)–(e)). The double drives it via
   * `driveResponses()`, which records the deterministic observable transcript
   * onto `responseTranscript`. This extends H4a's minimal `programResponse`
   * emission capability into the full scripted-injection surface.
   */
  readonly responses = new ResponseProgrammer();
  /** The observable transcript the most recent `driveResponses()` produced. */
  readonly responseTranscript: ResponseEvent[] = [];

  /**
   * Drive the scripted response-programming surface through this double,
   * recording and returning the deterministic observable transcript.
   */
  driveResponses(): ResponseEvent[] {
    const transcript = this.responses.drive();
    this.responseTranscript.length = 0;
    this.responseTranscript.push(...transcript);
    return transcript;
  }

  // --- minimal response-emission / programming surface (H4a deliverable) ---

  /** Program the streamed assistant tokens the next driven turn emits. */
  programResponse(tokens: readonly string[]): void {
    this.#programmed.push([...tokens]);
  }

  /**
   * Model a Pi/user-initiated cancel of the in-flight turn (the CNCL-4
   * source): abort the turn signal with `reason`. The streaming driver
   * observes the abort, fires the terminal `agent_end`, and resolves
   * `waitForIdle()`.
   */
  cancelTurn(reason: unknown): void {
    this.#turn?.controller.abort(reason);
  }

  // --- ExtensionAPI facade --------------------------------------------------

  get pi(): ExtensionAPI {
    return this.#pi as unknown as ExtensionAPI;
  }

  get ctx(): ExtensionCommandContext {
    return this.#ctx as unknown as ExtensionCommandContext;
  }

  /** Fire the `session_start` subscribers (drives per-loom command registration). */
  fireSessionStart(): void {
    this.#fire("session_start", { type: "session_start" });
  }

  /** Dispatch a registered slash command end-to-end against this double. */
  async dispatch(name: string, args: string): Promise<void> {
    const command = this.commands.get(name);
    if (command === undefined) {
      throw new Error(`no command registered for slash name "${name}"`);
    }
    await command.handler(args, this.ctx);
  }

  // --- internals ------------------------------------------------------------

  #fire(event: string, payload: unknown): void {
    const handlers = this.subscriptions.get(event) ?? [];
    for (const handler of handlers) {
      handler(payload, this.ctx);
    }
  }

  #beginTurn(userText: string): void {
    this.transcript.push({ role: "user", text: userText, streaming: false });
    const controller = new AbortController();
    const assistant: TranscriptMessage = {
      role: "assistant",
      text: "",
      streaming: true,
    };
    this.transcript.push(assistant);
    const tokens = this.#programmed.shift() ?? [];
    const turn: DrivenTurn = {
      controller,
      ended: false,
      done: this.#stream(controller, assistant, tokens, () => {
        turn.ended = true;
      }),
    };
    this.#turn = turn;
  }

  async #stream(
    controller: AbortController,
    assistant: TranscriptMessage,
    tokens: readonly string[],
    markEnded: () => void,
  ): Promise<void> {
    // Defer all work past the synchronous `sendUserMessage` return (and past
    // the `DrivenTurn` assignment), so streaming is genuinely asynchronous and
    // `markEnded` never runs before the turn is constructed.
    await Promise.resolve();
    for (const token of tokens) {
      // Yield a turn so streaming is observably interleaved and a pending
      // cancel can land between tokens.
      await Promise.resolve();
      if (controller.signal.aborted) break;
      assistant.text += token;
      this.events.push("stream-token");
      this.#fire("message_update", {
        type: "message_update",
        delta: token,
      });
    }
    assistant.streaming = false;
    this.events.push("agent-end");
    // Fire the terminal `agent_end` while `ctx.signal` still reflects the
    // turn's (possibly aborted) signal, so cancel-forwarding subscribers
    // observe the abort.
    this.#fire("agent_end", {
      type: "agent_end",
      cancelled: controller.signal.aborted,
    });
    markEnded();
  }

  #pi = {
    registerFlag: (
      name: string,
      options: { type: "boolean" | "string"; default?: boolean | string },
    ): void => {
      this.flags.set(name, options.default ?? "");
    },
    getFlag: (name: string): boolean | string | undefined =>
      this.flags.get(name),
    registerMessageRenderer: (customType: string, renderer: unknown): void => {
      this.renderers.set(customType, renderer);
    },
    registerCommand: (
      name: string,
      options: RegisteredCommandRecord,
    ): void => {
      this.commands.set(name, {
        ...(options.description !== undefined ? { description: options.description } : {}),
        handler: options.handler,
      });
    },
    on: (event: string, handler: EventHandler): void => {
      const list = this.subscriptions.get(event) ?? [];
      list.push(handler);
      this.subscriptions.set(event, list);
    },
    getCommands: (): { name: string; source: string }[] =>
      [...this.commands.keys()].map((name) => ({ name, source: "extension" })),
    sendUserMessage: (content: string): void => {
      this.#beginTurn(content);
    },
    sendMessage: (message: {
      customType: string;
      content: string;
      display?: boolean;
    }): void => {
      // Log a lifecycle marker so an ordering assertion can witness where a
      // `pi.sendMessage` (`loom-system-note`) emission falls relative to the
      // streamed tokens / `agent_end` of an in-flight turn — the SLSH-2
      // note-after-prefix ordering the session-double fidelity contract models.
      this.events.push("system-note");
      this.systemNotes.push({
        customType: message.customType,
        content: message.content,
        display: message.display ?? true,
      });
    },
  };

  #ctx = {
    waitForIdle: async (): Promise<void> => {
      const turn = this.#turn;
      if (turn !== undefined) {
        await turn.done;
      }
      this.events.push("idle");
    },
    isIdle: (): boolean => this.#turn === undefined || this.#turn.ended,
    abort: (): void => {
      // loom→Pi teardown direction: tears down the in-flight user run.
      this.#turn?.controller.abort(new Error("loom cancelled by ctx.abort"));
    },
  };

  constructor() {
    // `ctx.signal` must read the LIVE in-flight turn's signal each access
    // (undefined once the turn has ended / when idle), per the SDK contract.
    Object.defineProperty(this.#ctx, "signal", {
      get: (): AbortSignal | undefined =>
        this.#turn !== undefined && !this.#turn.ended
          ? this.#turn.controller.signal
          : undefined,
      enumerable: true,
      configurable: true,
    });
  }
}
