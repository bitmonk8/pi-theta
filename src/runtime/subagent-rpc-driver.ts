// RFC-0005 — subagent RPC JSONL wire driver.
//
// This module owns the RPC-wire half of the RFC-0005 subagent drive
// (pi-integration-contract/subagent.md #subagent-drive-mapping): serialising
// the `prompt` / `abort` stdin commands, parsing the strict-JSONL, LF-only
// stdout event framing, selecting the terminal `agent_end` event (PIC-42), and
// mapping the two new transport failure classes — child crash / nonzero exit
// mid-query (`theta/runtime/subagent-child-crashed`) and unparseable wire output
// (`theta/runtime/subagent-wire-parse-failed`). The teardown-timeout event
// (`theta/runtime/subagent-teardown-timeout`) code is owned here too because it
// is the per-child kill-fallback of the same wire lifecycle.
//
// Spec: pi-integration-contract/subagent.md (#subagent-drive-mapping, PIC-42,
// PIC-43, #subagent-error-fidelity, PIC-9), provider-error-mapping.md
// (#subagent-queryerror-audit), docs/rpc.md (JSONL framing, prompt/abort,
// get_state / get_available_models, agent_end).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { Clock, TimerHandle } from "../seams/clock";
import { WallClock } from "../seams/wall-clock";
import type { SubagentChildProcess } from "./subagent-launcher";
import {
  extractSubagentQueryResult,
  SUBAGENT_TEARDOWN_TIMEOUT_CODE,
  type AgentEndEvent,
  type SubagentQueryResult,
} from "./subagent-isolation";

// ---------------------------------------------------------------------------
// Diagnostic codes.
// ---------------------------------------------------------------------------

/** `theta/runtime/subagent-child-crashed` — child crash / nonzero exit mid-query. */
export const SUBAGENT_CHILD_CRASHED_CODE = "theta/runtime/subagent-child-crashed";

/**
 * The bounded wait (milliseconds) the model pre-flight `get_state` query awaits a
 * child reply before failing the invocation. A child that never answers cannot
 * confirm the resolved model, so the pre-flight fails rather than proceed blind.
 */
export const STATE_QUERY_TIMEOUT_MS = 2000;

/** `theta/runtime/subagent-wire-parse-failed` — a stdout line violated strict-JSONL framing. */
export const SUBAGENT_WIRE_PARSE_FAILED_CODE = "theta/runtime/subagent-wire-parse-failed";

/**
 * `theta/runtime/subagent-teardown-timeout` — child did not exit within the
 * budget; killed. Re-exported from `subagent-isolation.ts` (the teardown owner)
 * so wire-lifecycle consumers can read it alongside the crash/parse codes.
 */
export { SUBAGENT_TEARDOWN_TIMEOUT_CODE };

// ---------------------------------------------------------------------------
// Command serialisation (stdin → child).
// ---------------------------------------------------------------------------

/**
 * Serialise the RPC `prompt` command as one strict-JSONL frame:
 * `{"type":"prompt","message":<text>}\n`. The trailing LF is the framing
 * delimiter (`docs/rpc.md`).
 */
export function serializePromptCommand(message: string): string {
  return `${JSON.stringify({ type: "prompt", message })}\n`;
}

/** Serialise the RPC `abort` command: `{"type":"abort"}\n`. */
export function serializeAbortCommand(): string {
  return `${JSON.stringify({ type: "abort" })}\n`;
}

/** Serialise the RPC `get_state` command (model pre-flight): `{"type":"get_state"}\n`. */
export function serializeStateQuery(): string {
  return `${JSON.stringify({ type: "get_state" })}\n`;
}

// ---------------------------------------------------------------------------
// PIC-41 — abort-command send (synchronous send-throw → internal-error).
// ---------------------------------------------------------------------------

/** `theta/runtime/internal-error` — the surface a thrown abort-command send routes through. */
export const SUBAGENT_ABORT_SEND_INTERNAL_ERROR_CODE = "theta/runtime/internal-error";

/** Collaborators the abort-command send drives. */
export interface AbortCommandSendDeps {
  /** Runtime-defect sink for a thrown synchronous send. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/**
 * PIC-41. Send the RPC `abort` command onto the child's stdin. If the
 * **synchronous** send throws (e.g. the stdin pipe is already closed), the
 * runtime traps the error and routes it through `theta/runtime/internal-error`
 * but does **not** alter the invocation result — mirroring the teardown-throws
 * rule: on an `Err`/panic teardown the original error is not masked, and on a
 * normal-return teardown the parent still observes the theta's `Ok` value. A
 * *late* failure of the discarded send (arriving after the synchronous send
 * returned) is NOT routed here — it is one of the abandonable Promises the
 * Cancellation swallowing-handler rule silently absorbs.
 */
export function sendAbortCommand(child: SubagentChildProcess, deps: AbortCommandSendDeps): void {
  try {
    child.writeStdin(serializeAbortCommand());
  } catch (sendError: unknown) { // allow-broad-catch: PIC-41 theta/runtime/internal-error — pi-integration-contract/subagent.md
    // A synchronous send-throw (e.g. stdin pipe already closed) is trapped and
    // routed through the runtime-defect surface; it does NOT alter the
    // invocation result. A *late* failure of the discarded send is absorbed by
    // the Cancellation swallowing-handler rule, not routed here.
    const message = sendError instanceof Error ? sendError.message : String(sendError);
    const stack =
      sendError instanceof Error && typeof sendError.stack === "string" && sendError.stack.length > 0
        ? sendError.stack
        : "<no stack available>";
    deps.emitDiagnostic({
      severity: "error",
      code: SUBAGENT_ABORT_SEND_INTERNAL_ERROR_CODE,
      message: `internal error: ${message}`,
      hint: stack,
    });
  }
}

// ---------------------------------------------------------------------------
// Event framing (child stdout → runtime).
// ---------------------------------------------------------------------------

/** The parse verdict for one stdout line under strict-JSONL, LF-only framing. */
export type ParsedRpcLine =
  | { readonly ok: true; readonly event: { readonly type: string } & Record<string, unknown> }
  | { readonly ok: false; readonly line: string };

/**
 * Parse one LF-split stdout line as a JSON RPC event. A line that does not parse
 * as a JSON object carrying a string `type` is a wire-protocol parse failure
 * (`{ ok: false }`), which the reader maps to a transport error plus
 * `theta/runtime/subagent-wire-parse-failed`.
 */
export function parseRpcEventLine(line: string): ParsedRpcLine {
  // Strict-JSONL, LF-only framing: accept an optional trailing CR (docs/rpc.md),
  // then require a JSON object carrying a string `type` discriminator.
  const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (parseError: unknown) { // allow-broad-catch: wire-protocol parse failure — pi-integration-contract/subagent.md
    void parseError;
    return { ok: false, line };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, line };
  }
  const type = (parsed as Record<string, unknown>).type;
  if (typeof type !== "string") {
    return { ok: false, line };
  }
  return { ok: true, event: parsed as { type: string } & Record<string, unknown> };
}

/** Truncated rendering of an offending wire line for the parse-failure diagnostic. */
function summarizeLine(line: string): string {
  const MAX = 120;
  return line.length > MAX ? `${line.slice(0, MAX)}\u2026` : line;
}

/** Render the exit detail for a child-crash transport error / diagnostic. */
function renderExitDetail(code: number | null, signal: string | null): string {
  if (signal !== null) {
    return `exited on signal ${signal}`;
  }
  return `exited code ${code ?? "unknown"}`;
}

/** Build a subagent transport `QueryError` with the fixed subagent-path shape. */
function transportError(provider: string, message: string): SubagentQueryResult {
  return {
    ok: false,
    error: {
      kind: "transport",
      message,
      http_status: null,
      provider,
      retryable: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Terminal event selection + result extraction (PIC-42 / PIC-43).
// ---------------------------------------------------------------------------

/** The live context the terminal reader consumes. */
export interface RpcReadCtx {
  /** `thetaAbort.signal.aborted` — the cancellation short-circuit (PIC-43). */
  readonly aborted: boolean;
  /** The resolved-model provider for the transport-failure `Err`. */
  readonly provider: string;
  /** Diagnostic sink for the child-crash / wire-parse events. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/**
 * Read the child's RPC event stream and resolve the query from the terminal
 * (`willRetry: false`) `agent_end` event, applying `extractSubagentQueryResult`.
 * `willRetry: true` events are ignored. Two new transport failure classes are
 * mapped here: a stdout line that fails `parseRpcEventLine` resolves to
 * `Err(transport)` and emits `subagent-wire-parse-failed`; a child exit observed
 * before a terminal `agent_end` resolves to `Err(transport)` with the exit
 * detail and emits `subagent-child-crashed`.
 */
export function readTerminalAgentEnd(
  child: SubagentChildProcess,
  readCtx: RpcReadCtx,
): Promise<SubagentQueryResult> {
  return new Promise<SubagentQueryResult>((resolve) => {
    let settled = false;
    let lastStderr: string | undefined;
    // Capture the unsubscribe handles so this per-query reader detaches its
    // stdout/stderr/exit listeners on settle — a long-lived child driving many
    // queries must not accumulate O(queries) listeners.
    let detachStdout: () => void = () => {};
    let detachStderr: () => void = () => {};
    const settle = (result: SubagentQueryResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      detachStdout();
      detachStderr();
      resolve(result);
    };

    detachStderr = child.onStderrLine((line) => {
      lastStderr = line;
    });

    detachStdout = child.onStdoutLine((line) => {
      if (settled) {
        return;
      }
      const parsed = parseRpcEventLine(line);
      if (!parsed.ok) {
        // Unparseable wire output → transport error + subagent-wire-parse-failed.
        const summary = summarizeLine(parsed.line);
        readCtx.emitDiagnostic({
          severity: "error",
          code: SUBAGENT_WIRE_PARSE_FAILED_CODE,
          message: `subagent RPC wire parse failed: ${summary}`,
        });
        settle(transportError(readCtx.provider, `subagent RPC wire parse failed: ${summary}`));
        return;
      }
      if (parsed.event.type !== "agent_end") {
        // Non-terminal events (state replies, streaming updates) are ignored here.
        return;
      }
      const event = parsed.event as unknown as AgentEndEvent;
      // PIC-43: a `willRetry: true` event precedes an SDK retry — keep reading.
      if (event.willRetry === true) {
        return;
      }
      settle(
        extractSubagentQueryResult(event, {
          aborted: readCtx.aborted,
          provider: readCtx.provider,
        }),
      );
    });

    child.onExit((info) => {
      if (settled) {
        return;
      }
      // Child crash / nonzero exit before a terminal `agent_end` → transport
      // error with the exit detail + subagent-child-crashed diagnostic.
      const detail = renderExitDetail(info.code, info.signal);
      readCtx.emitDiagnostic({
        severity: "error",
        code: SUBAGENT_CHILD_CRASHED_CODE,
        message: `subagent child crashed mid-query: ${detail}`,
        ...(lastStderr === undefined ? {} : { hint: lastStderr }),
      });
      settle(transportError(readCtx.provider, `subagent child crashed mid-query: ${detail}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Model pre-flight state query (docs/rpc.md get_state / get_available_models).
// ---------------------------------------------------------------------------

/**
 * Query the child's RPC state surface (`get_state` / `get_available_models`) for
 * the model the marshalled `--provider`/`--model` reference actually resolved
 * to, so the PIC-40 pre-flight can compare it against the intended model.
 */
export function queryChildResolvedModel(
  child: SubagentChildProcess,
  clock: Clock = new WallClock(),
  timeoutMs: number = STATE_QUERY_TIMEOUT_MS,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timer: TimerHandle | undefined;
    // Detach the stdout listener on settle so a resolved pre-flight query leaves
    // no listener behind on a long-lived child.
    let detachStdout: () => void = () => {};
    const finish = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== undefined) {
        clock.clearTimeout(timer);
      }
      detachStdout();
      action();
    };

    detachStdout = child.onStdoutLine((line) => {
      if (settled) {
        return;
      }
      const parsed = parseRpcEventLine(line);
      if (!parsed.ok) {
        return;
      }
      const event = parsed.event;
      // The `get_state` response carries `data.model` — a full Model object or
      // null (docs/rpc.md). We read its `id` as the resolved model reference.
      if (event.type === "response" && event.command === "get_state") {
        if (event.success !== true) {
          finish(() => reject(new Error("subagent model pre-flight: get_state reply reported failure")));
          return;
        }
        const data = event.data as { model?: { id?: unknown } | null } | undefined;
        const modelId = data?.model?.id;
        if (typeof modelId === "string") {
          finish(() => resolve(modelId));
          return;
        }
        finish(() => reject(new Error("subagent model pre-flight: get_state reply carried no resolved model")));
      }
    });

    // A child that never answers the state query cannot confirm the model, so the
    // query MUST fail rather than resolve a sentinel that lets the invocation
    // proceed blind (#subagent-model-marshalling).
    timer = clock.setTimeout(() => {
      finish(() => reject(new Error("subagent model pre-flight: no get_state reply within budget")));
    }, timeoutMs);

    try {
      child.writeStdin(serializeStateQuery());
    } catch (sendError: unknown) { // allow-broad-catch: state-query send failure — pi-integration-contract/subagent.md
      finish(() => reject(sendError instanceof Error ? sendError : new Error(String(sendError))));
    }
  });
}

/** Re-export for consumers that read the terminal event shape from the wire module. */
export type { AgentEndEvent };
