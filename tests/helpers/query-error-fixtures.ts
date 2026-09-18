// Shared QueryError leaf and cascade fixtures for error-note rendering tests.

import type {
  CodeToolError,
  InvokeCalleeError,
  ModelToolError,
  QueryError,
  TransportError,
} from "../../src/runtime/query-error";
import { renderTopLevelErrNote, type ChainHop } from "../../src/runtime/err-note-render";
import type { InvocationRecord } from "../../src/runtime/invoke-provenance";

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

/** The `invoke_callee` cascade wrapper (the REQ-SLSH-22 surface). */
export function calleeWrap(callee_path: string, inner: QueryError): InvokeCalleeError {
  return { kind: "invoke_callee", message: "callee returned Err", callee_path, inner };
}

export function record(parentPath: string, callSiteLine: number): InvocationRecord {
  return { parentPath, callSiteLine };
}

export function hop(calleePath: string, parentPath: string, callSiteLine: number): ChainHop {
  return { calleePath, record: record(parentPath, callSiteLine) };
}

/** Render a leaf error at the boundary with no chain (the SLSH-3 non-cascade path). */
export function boundaryNoChain(name: string, error: QueryError): string {
  return renderTopLevelErrNote({ thetaName: name, error, chain: [] });
}
