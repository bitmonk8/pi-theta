// STAGE A (STL-2 / ceiling #2) — the production subagent-mode `QueryModelDriver`
// regression + conformance lock.
//
// The subagent query driver now OWNS the agentic tool loop: it holds the
// subagent's private conversation and advances it one `complete()` turn per
// free-phase round, so the enclosing query-tool-loop (`runUntypedQueryLoop` /
// `runTypedQueryLoop`) enforces `tool_loop.max_rounds` and can reach ceiling #2
// (`tool_loop_exhausted`). Before STAGE A the driver ran the spawned
// `AgentSession`'s whole internal loop inside a single loom-level round, so the
// cap was a no-op for any `max_rounds >= 1` (STL-2).
//
// These tests drive the real driver through the real loop against the loom's
// `loomAbort` signal — exactly as the production host does — so they green-lock:
//   - an untyped subagent query that finishes early (a plain-text turn) returns
//     its text (FN-5, no forced self-cancel);
//   - an untyped subagent query that keeps emitting tool rounds past its cap
//     terminates with `Err(tool_loop_exhausted)` — the STL-2 conformance target
//     (rounds == max_rounds, last_tool_name is the last round's tool);
//   - a multi-round tool loop that finishes within the cap returns its text;
//   - a typed subagent query VALIDATES its structured payload across the
//     subagent boundary (FN-5 + QRY-22): a conforming payload binds the typed
//     value; a non-conforming payload surfaces `Err(validation)`;
//   - a GENUINE mid-stream `loomAbort` fire surfaces `Err(cancelled)`.
//
// Spec: frontmatter.md §`tool_loop` (FRNT-1), hard-ceilings.md ceiling #2 /
// CIO-4, errors-and-results.md ERR-19, pi-integration-contract/subagent.md
// (FN-5), cancellation.md, query/query-failure-and-repair.md (QRY-22).

import { describe, expect, it } from "vitest";
import type {
  AssistantMessage,
  ToolCall,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
import { createSubagentQueryModel } from "../src/extension/production-loom-producer";
import {
  runTypedQueryLoop,
  runUntypedQueryLoop,
  type QueryToolLoopConfig,
  type TypedQuerySchemaValidation,
} from "../src/runtime/query-tool-loop";
import { buildTypedQueryValidation } from "../src/runtime/typed-query-validation";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { Checkpoint } from "../src/seams/checkpoint";

/**
 * Build the production typed-query validation collaborator over an inline
 * `{ ok: boolean, label: string }` schema, exactly as the fixed subagent
 * producer composes it (real `AjvSchemaValidator`, no re-driven follow-up).
 */
function subagentValidation(): TypedQuerySchemaValidation {
  const lowered = lowerQueryResponseSchema("{ ok: boolean, label: string }", []);
  if (lowered === undefined) {
    throw new Error("inline schema failed to lower");
  }
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "sub",
    canonicalBytes: JSON.stringify(schema),
  });
  return buildTypedQueryValidation({
    lowered,
    resolveShape: () => lowered,
    schemaValidator: new AjvSchemaValidator({ emit: () => {}, slugOf }),
    attempts: 0,
    maxRounds: 0,
    driveFollowUp: () => Promise.resolve("{}"),
  });
}

/** A no-op `Checkpoint` (an already-resolved gate). */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** An assistant message carrying `text` with a normal (`stop`) stop reason. */
function textReply(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: USAGE,
    stopReason: "stop",
    timestamp: 0,
  };
}

/** An assistant message that calls one tool (a `tool_use` turn). */
function toolCallReply(name: string, id: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: {} }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: USAGE,
    stopReason: "toolUse",
    timestamp: 0,
  };
}

/** A tool-result turn as `executeTool` would lower one. */
function toolResult(call: ToolCall, text: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: call.id,
    toolName: call.name,
    content: [{ type: "text", text }],
    isError: false,
    timestamp: 0,
  };
}

function config(maxRounds: number): QueryToolLoopConfig {
  return {
    maxRounds,
    querySite: { file: "sub.loom", line: 1, column: 1 },
    loomSlashName: "sub",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}

describe("STAGE A — production subagent QueryModelDriver (loom-owned tool loop)", () => {
  it("an untyped subagent query that finishes early returns its text (FN-5, no self-cancel)", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      queryText: "hello",
      runCompletion: () => Promise.resolve(textReply("SUBAGENT-OK")),
      executeTool: () => Promise.reject(new Error("no tool call expected")),
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, loomAbort.signal, model, config(25));

    expect(outcome.kind).toBe("text");
    if (outcome.kind === "text") {
      expect(outcome.text).toBe("SUBAGENT-OK");
    }
  });

  it("an untyped subagent query that keeps emitting tool rounds past its cap exhausts ceiling #2 (STL-2)", async () => {
    const loomAbort = new AbortController();
    let toolCalls = 0;
    let completions = 0;
    const model = createSubagentQueryModel({
      queryText: "chase the chain",
      // The model always requests another `read` — a tool loop that never
      // terminates on its own, so the loom's `max_rounds` cap must bound it.
      runCompletion: () => {
        completions += 1;
        return Promise.resolve(toolCallReply("read", `call-${completions}`));
      },
      executeTool: (call) => {
        toolCalls += 1;
        return Promise.resolve(toolResult(call, "next"));
      },
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, loomAbort.signal, model, config(2));

    expect(outcome.kind, "the cap must fire — ceiling #2 is reachable").toBe("tool_loop_exhausted");
    if (outcome.kind === "tool_loop_exhausted") {
      // ERR-19: rounds == max_rounds; last_tool_name is the last round's tool.
      expect(outcome.error.rounds).toBe(2);
      expect(outcome.error.last_tool_name).toBe("read");
    }
    // Exactly `max_rounds` free-phase rounds ran (each executed its tool batch);
    // the cap fired at the round boundary before a third free-phase turn.
    expect(toolCalls).toBe(2);
    expect(completions).toBe(2);
  });

  it("a multi-round tool loop that finishes within the cap returns its text", async () => {
    const loomAbort = new AbortController();
    let completions = 0;
    let toolCalls = 0;
    const model = createSubagentQueryModel({
      queryText: "read the chain then answer",
      // Two tool rounds, then a terminating plain-text turn.
      runCompletion: () => {
        completions += 1;
        if (completions <= 2) {
          return Promise.resolve(toolCallReply("read", `call-${completions}`));
        }
        return Promise.resolve(textReply("CHAINDONE"));
      },
      executeTool: (call) => {
        toolCalls += 1;
        return Promise.resolve(toolResult(call, "next"));
      },
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, loomAbort.signal, model, config(25));

    expect(outcome.kind).toBe("text");
    if (outcome.kind === "text") {
      expect(outcome.text).toBe("CHAINDONE");
    }
    expect(toolCalls).toBe(2);
  });

  it("typed subagent query VALIDATES its structured payload and binds a conforming value (FN-5 + QRY-22)", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      queryText: "answer",
      runCompletion: () => Promise.resolve(textReply('{"ok":true,"label":"blue"}')),
      executeTool: () => Promise.reject(new Error("no tool call expected")),
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      loomAbort.signal,
      model,
      config(0),
      subagentValidation(),
    );

    expect(outcome.kind).toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value).toEqual({ ok: true, label: "blue" });
    }
  });

  it("typed subagent query with a non-conforming payload surfaces Err(validation) — no unvalidated bind (Defect B)", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      queryText: "answer",
      // Missing the required `label`, and carrying an undeclared property.
      runCompletion: () => Promise.resolve(textReply('{"ok":true,"extra":1}')),
      executeTool: () => Promise.reject(new Error("no tool call expected")),
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      loomAbort.signal,
      model,
      config(0),
      subagentValidation(),
    );

    expect(outcome.kind, "a non-conforming payload is not bound as the value").toBe("validation");
    if (outcome.kind === "validation") {
      expect(outcome.error.cause).toBe("schema_validation");
    }
  });

  it("a GENUINE mid-stream loomAbort fire surfaces Err(cancelled), not a success value", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      queryText: "answer",
      // The scripted cancel point: `loomAbort` fires while the completion is in
      // flight (a real cancellation, not a driver self-cancel), so by the time
      // the completion resolves the loop's signal is aborted.
      runCompletion: () => {
        loomAbort.abort(new Error("loom subagent query cancelled mid-stream"));
        return Promise.resolve(textReply("ignored"));
      },
      executeTool: () => Promise.reject(new Error("no tool call expected")),
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, loomAbort.signal, model, config(25));

    expect(outcome.kind).toBe("cancelled");
  });
});
