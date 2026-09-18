// Shared provider-request/tool-call replay double for prompt-loop governor tests.

import type {
  ExtensionAPI,
  ExtensionHandler,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";

/**
 * A minimal fake `pi` surface that records the `before_provider_request` and
 * `tool_call` handlers the governor registers, so a test can replay a scripted
 * event sequence. Only `on(...)` is exercised.
 */
export class FakePi {
  #bpr: (() => void) | undefined;
  #toolCall: ((event: ToolCallEvent) => ToolCallEventResult | undefined) | undefined;
  registrations = 0;

  readonly api: ExtensionAPI;

  constructor(
    private readonly toolCallId: (toolName: string) => string =
      (toolName) => `tc-${toolName}-${Math.random()}`,
  ) {
    // Only `on` is used; the rest is an unused stub cast to the interface.
    const on = (event: string, handler: ExtensionHandler<unknown, unknown>): void => {
      this.registrations += 1;
      if (event === "before_provider_request") {
        this.#bpr = () => {
          void handler(undefined as never, undefined as never);
        };
      } else if (event === "tool_call") {
        this.#toolCall = (e: ToolCallEvent) =>
          handler(e as never, undefined as never) as
            | ToolCallEventResult
            | undefined;
      }
    };
    this.api = { on } as unknown as ExtensionAPI;
  }

  /** Replay one provider request (a fresh model round boundary). */
  providerRequest(): void {
    this.#bpr?.();
  }

  /**
   * Replay one `tool_call` and return the governor's block decision. `input`
   * defaults to the shallow `{}` (depth-1, within the ceiling-#4 cap); a caller
   * exercising the model-driven depth row passes a deeper argument document.
   */
  toolCall(toolName: string, input: Record<string, unknown> = {}): ToolCallEventResult | undefined {
    const event = {
      type: "tool_call",
      toolCallId: this.toolCallId(toolName),
      toolName,
      input,
    } as unknown as ToolCallEvent;
    return this.#toolCall?.(event);
  }
}
