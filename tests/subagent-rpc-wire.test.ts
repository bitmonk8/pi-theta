// RFC-0005 new coverage — RPC JSONL wire protocol.
//
// Covers the wire half the RFC demands (pi-integration-contract/subagent.md
// #subagent-drive-mapping, PIC-41, PIC-42, PIC-43, #subagent-error-fidelity;
// provider-error-mapping.md #subagent-queryerror-audit):
//   - prompt / abort command serialisation (strict JSONL, LF-terminated);
//   - PIC-41 abort → RPC abort command (steady-state + spawn-then-immediate
//     -cancel ordering);
//   - PIC-42 terminal-event selection over the RPC stream (willRetry:true
//     ignored; resolve from the terminal willRetry:false event);
//   - child crash / nonzero exit mid-query → Err(QueryError kind "transport")
//     + theta/runtime/subagent-child-crashed;
//   - wire-protocol parse failure → Err(transport) + theta/runtime/subagent-
//     wire-parse-failed;
//   - model pre-flight state query (get_state / get_available_models).
//
// RED EXPECTATION (RFC-0005 not yet implemented): assertions against the wire
// stubs red on their primary assertions; the paired implementation leaf greens
// them.

import { describe, expect, it } from "vitest";
import type { AssistantMessage, Message, UserMessage } from "@earendil-works/pi-ai";
import {
  parseRpcEventLine,
  queryChildResolvedModel,
  readTerminalAgentEnd,
  sendAbortCommand,
  serializeAbortCommand,
  serializePromptCommand,
  SUBAGENT_ABORT_SEND_INTERNAL_ERROR_CODE,
  SUBAGENT_CHILD_CRASHED_CODE,
  SUBAGENT_WIRE_PARSE_FAILED_CODE,
} from "../src/runtime/subagent-rpc-driver";
import {
  attachSubagentAbortForwarding,
  preFlightModelCheck,
  type AbortableSubagentSession,
} from "../src/runtime/subagent-isolation";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { TransportError } from "../src/runtime/query-error";
import { FakeRpcChild } from "./helpers/fake-rpc-child";

function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: 0 };
}

function assistantMessage(text: string, stopReason: AssistantMessage["stopReason"]): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
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
    stopReason,
    timestamp: 0,
  };
}

function turn(text: string, stopReason: AssistantMessage["stopReason"]): Message[] {
  return [userMessage("q"), assistantMessage(text, stopReason)];
}

// ---------------------------------------------------------------------------
// Command serialisation + round-trip through the child.
// ---------------------------------------------------------------------------

describe("RFC-0005 — RPC command serialisation", () => {
  it("serializePromptCommand frames {\"type\":\"prompt\",\"message\":…} as one LF-terminated JSONL line", () => {
    const frame = serializePromptCommand("do the thing");
    expect(frame.endsWith("\n")).toBe(true);
    expect(JSON.parse(frame.trimEnd())).toEqual({ type: "prompt", message: "do the thing" });
  });

  it("serializeAbortCommand frames {\"type\":\"abort\"} as one LF-terminated JSONL line", () => {
    const frame = serializeAbortCommand();
    expect(frame.endsWith("\n")).toBe(true);
    expect(JSON.parse(frame.trimEnd())).toEqual({ type: "abort" });
  });

  it("a serialized prompt command round-trips through the child's stdin parser", () => {
    const child = new FakeRpcChild();
    child.writeStdin(serializePromptCommand("hi"));
    expect(child.commands).toHaveLength(1);
    expect(child.commands[0]).toEqual({ type: "prompt", message: "hi" });
  });
});

// ---------------------------------------------------------------------------
// PIC-41 — abort → RPC abort command.
// ---------------------------------------------------------------------------

describe("RFC-0005 — PIC-41 abort forwards as the RPC abort command", () => {
  /** An abort adapter that sends the RPC abort command onto the child's stdin. */
  function abortAdapter(child: FakeRpcChild): { session: AbortableSubagentSession; abortCalls: number } {
    let abortCalls = 0;
    const session: AbortableSubagentSession = {
      abort: async (): Promise<void> => {
        abortCalls += 1;
        child.writeStdin(serializeAbortCommand());
      },
    };
    return {
      session,
      get abortCalls() {
        return abortCalls;
      },
    };
  }

  it("PIC-41: a thetaAbort abort forwards the RPC abort command to the child via the one-shot listener", () => {
    const child = new FakeRpcChild();
    const rec = abortAdapter(child);
    const thetaAbort = new AbortController();

    attachSubagentAbortForwarding(thetaAbort, rec.session);
    expect(rec.abortCalls).toBe(0);

    thetaAbort.abort(new Error("cancelled"));

    // The listener fired the adapter, and the adapter put an `abort` command on
    // the wire.
    expect(rec.abortCalls).toBe(1);
    expect(child.commands.some((c) => c.type === "abort")).toBe(true);
  });

  it("PIC-41: spawn-then-immediate-cancel — an already-aborted thetaAbort sends the abort command synchronously", () => {
    const child = new FakeRpcChild();
    const rec = abortAdapter(child);
    const thetaAbort = new AbortController();
    thetaAbort.abort(new Error("pre-aborted"));

    attachSubagentAbortForwarding(thetaAbort, rec.session);

    expect(rec.abortCalls).toBe(1);
    expect(child.commands.some((c) => c.type === "abort")).toBe(true);
  });

  it("PIC-41: a synchronous abort-command send throw routes theta/runtime/internal-error and does NOT propagate", () => {
    // A child whose stdin pipe is already closed throws synchronously on the
    // abort-command send. PIC-41 traps that throw and routes it through the
    // runtime-defect surface without altering the invocation result.
    const child = new FakeRpcChild();
    child.closeStdin();
    const emitted: Diagnostic[] = [];

    // The send-throw must NOT escape the boundary (it would mask the in-flight
    // cancelled/Ok result the invocation is already resolving to).
    expect(() =>
      sendAbortCommand(child, {
        emitDiagnostic: (d): void => {
          emitted.push(d);
        },
      }),
    ).not.toThrow();

    // The trapped throw surfaces as an advisory theta/runtime/internal-error.
    expect(emitted.map((d) => d.code)).toContain(SUBAGENT_ABORT_SEND_INTERNAL_ERROR_CODE);
  });
});

// ---------------------------------------------------------------------------
// Event framing.
// ---------------------------------------------------------------------------

describe("RFC-0005 — RPC event framing", () => {
  it("parses a well-formed agent_end line into an event", () => {
    const line = JSON.stringify({ type: "agent_end", messages: [], willRetry: false });
    const parsed = parseRpcEventLine(line);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.event.type).toBe("agent_end");
    }
  });

  it("flags a line that violates strict-JSONL framing as a wire parse failure", () => {
    const parsed = parseRpcEventLine("this is not json {");
    expect(parsed.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PIC-42 / PIC-43 — terminal selection over the RPC stream.
// ---------------------------------------------------------------------------

describe("RFC-0005 — PIC-42 terminal-event selection over the RPC stream", () => {
  function ctx(emitted: Diagnostic[]): {
    aborted: boolean;
    provider: string;
    emitDiagnostic: (d: Diagnostic) => void;
  } {
    return {
      aborted: false,
      provider: "anthropic",
      emitDiagnostic: (d): void => {
        emitted.push(d);
      },
    };
  }

  it("PIC-42: a willRetry:true event is ignored; the query resolves from the terminal willRetry:false event", async () => {
    const child = new FakeRpcChild();
    const emitted: Diagnostic[] = [];
    const done = readTerminalAgentEnd(child, ctx(emitted));

    child.emitAgentEnd(turn("retrying", "stop"), true);
    child.emitAgentEnd(turn("final answer", "stop"), false);

    const result = await done;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("final answer");
    }
  });

  it("a resolved query DETACHES its stdout listener — no O(queries) growth on a long-lived child", async () => {
    const child = new FakeRpcChild();
    const emitted: Diagnostic[] = [];

    // Drive several sequential queries over the SAME long-lived child; each
    // resolves and must leave no stdout listener behind.
    for (let i = 0; i < 5; i += 1) {
      const done = readTerminalAgentEnd(child, ctx(emitted));
      child.emitAgentEnd(turn(`answer ${i}`, "stop"), false);
      const result = await done;
      expect(result.ok).toBe(true);
      // The reader detached on settle: no accumulation across queries.
      expect(child.stdoutListenerCount).toBe(0);
    }
  });

  it("child crash / nonzero exit mid-query → Err(transport) + theta/runtime/subagent-child-crashed", async () => {
    const child = new FakeRpcChild();
    const emitted: Diagnostic[] = [];
    const done = readTerminalAgentEnd(child, ctx(emitted));

    child.crashWith(1, null, "provider connection reset");

    const result = await done;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("transport");
      // #subagent-queryerror-audit child-crash row: transport-kind, exit detail
      // in `message`, http_status null, retryable false, provider populated.
      const transport = result.error as TransportError;
      expect(transport.message).toContain("1");
      expect(transport.http_status).toBeNull();
      expect(transport.retryable).toBe(false);
      expect(transport.provider).toBe("anthropic");
    }
    expect(emitted.map((d) => d.code)).toContain(SUBAGENT_CHILD_CRASHED_CODE);
  });

  it("unparseable wire output → Err(transport) + theta/runtime/subagent-wire-parse-failed", async () => {
    const child = new FakeRpcChild();
    const emitted: Diagnostic[] = [];
    const done = readTerminalAgentEnd(child, ctx(emitted));

    child.emitRawLine("<<< not json >>>");

    const result = await done;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("transport");
      // #subagent-queryerror-audit wire-parse row: transport-kind, http_status
      // null, retryable false, provider populated.
      const transport = result.error as TransportError;
      expect(transport.http_status).toBeNull();
      expect(transport.retryable).toBe(false);
      expect(transport.provider).toBe("anthropic");
    }
    expect(emitted.map((d) => d.code)).toContain(SUBAGENT_WIRE_PARSE_FAILED_CODE);
  });
});

// ---------------------------------------------------------------------------
// Model pre-flight state query.
// ---------------------------------------------------------------------------

describe("RFC-0005 — model pre-flight state query", () => {
  it("queryChildResolvedModel reads the model the child resolved via get_state / get_available_models", async () => {
    const child = new FakeRpcChild({ resolvedModel: "claude-haiku" });
    const resolved = await queryChildResolvedModel(child);
    expect(resolved).toBe("claude-haiku");
  });

  it("the pre-flight fails the invocation when the child-queried model differs from the intended one", async () => {
    const child = new FakeRpcChild({ resolvedModel: "claude-haiku" });
    const resolved = await queryChildResolvedModel(child);
    const outcome = preFlightModelCheck("claude-sonnet", resolved);
    expect(outcome.proceed).toBe(false);
  });

  it("a state-query failure / missing get_state reply fails the invocation (does not silently proceed)", async () => {
    // #subagent-model-marshalling: the pre-flight confirms the resolved model via
    // the child's RPC state surface before the first query. A child that never
    // answers the state query cannot confirm the model, so the query MUST fail
    // rather than resolve a sentinel that would let the invocation proceed blind.
    const child = new FakeRpcChild({ suppressStateReply: true });
    await expect(queryChildResolvedModel(child)).rejects.toThrow();
  });
});
