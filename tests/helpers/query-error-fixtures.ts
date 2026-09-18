// Shared QueryError leaf fixtures for error-note rendering tests.

import type {
  CodeToolError,
  ModelToolError,
  TransportError,
} from "../../src/runtime/query-error";

export function transport(message: string): TransportError {
  return {
    kind: "transport",
    message,
    http_status: null,
    provider: "anthropic-messages",
    retryable: true,
  };
}

/**
 * A `ModelToolError` (`kind: "model_tool"`): the non-recoverable adapter-layer
 * failure that can surface a `QueryError` out of the model-driven `@`-query
 * tool-call loop. It is a LEAF — it carries no `inner` and no invocation chain.
 */
export function modelTool(tool_name: string, message: string): ModelToolError {
  return {
    kind: "model_tool",
    message,
    tool_name,
    tool_call_id: "toolu_1",
    raw_response: null,
  };
}

export function codeTool(
  tool_name: string,
  cause: CodeToolError["cause"],
  message: string,
): CodeToolError {
  return { kind: "code_tool", message, tool_name, cause };
}
