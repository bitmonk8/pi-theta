// Shared typed message fixtures for transcript-reader and closed-set walk tests.
import type { AssistantMessage, TextContent, UserMessage } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

const USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
} as const;

/** A text-only user turn at the fixed fixture timestamp. */
export function user(text: string): UserMessage {
  return { role: "user", content: text, timestamp: 0 };
}

/** A text-only assistant reply with the fixed model and zero usage. */
export function assistant(text: string): AssistantMessage {
  const content: TextContent[] = [{ type: "text", text }];
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: USAGE,
    stopReason: "stop",
    timestamp: 0,
  };
}

/** A pinned host augmentation, typed so a host removing the arm fails the typecheck. */
export function compactionSummary(summary: string): AgentMessage {
  return { role: "compactionSummary", summary, tokensBefore: 1234, timestamp: 0 };
}

/**
 * An assistant message carrying the given `text` and a chosen `stopReason` /
 * optional `errorMessage`. Used to build the driven turn's trailing `assistant`
 * message the post-`waitForIdle()` probe reads.
 */
export function assistantMessage(opts: {
  text?: string;
  stopReason: AssistantMessage["stopReason"];
  errorMessage?: string;
}): AssistantMessage {
  const base: AssistantMessage = {
    role: "assistant",
    content: opts.text === undefined ? [] : [{ type: "text", text: opts.text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: opts.stopReason,
    timestamp: 0,
  };
  return opts.errorMessage === undefined
    ? base
    : { ...base, errorMessage: opts.errorMessage };
}
