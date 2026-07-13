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
import {
  createSubagentQueryModel,
  lowerModelDrivenToolCall,
  type PiToolDispatch,
} from "../src/extension/production-loom-producer";
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

/**
 * An assistant message carrying `stopReason: "error"` (a provider transport
 * failure), with an optional `errorMessage` — the subagent transport probe maps
 * this to `Err(TransportError)`, never `Ok(text)`.
 */
function errorReply(errorMessage?: string): AssistantMessage {
  return {
    role: "assistant",
    content: errorMessage !== undefined ? [{ type: "text", text: "partial" }] : [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: USAGE,
    stopReason: "error",
    ...(errorMessage !== undefined ? { errorMessage } : {}),
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

// ===========================================================================
// PIC-50/51 (mirrors tests/query-tool-loop.test.ts's prompt-mode transport
// tests) — the production subagent driver maps a failed provider turn to the
// shared `transport` outcome, never `Ok(text)` / a parsed value. Covers the
// `stopReason: "error"` probe (free-phase + forced-respond) and the
// `complete()` sync-throw / reject mapping.
// ===========================================================================

describe("PIC-50/51 — production subagent transport-error surfacing", () => {
  it("untyped: a free-phase completion with stopReason:'error' surfaces Err(transport), never Ok(text)", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      queryText: "hello",
      runCompletion: () => Promise.resolve(errorReply("provider 529")),
      executeTool: () => Promise.reject(new Error("no tool call expected")),
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, loomAbort.signal, model, config(25));

    expect(outcome.kind).toBe("transport");
    if (outcome.kind === "transport") {
      expect(outcome.error.kind).toBe("transport");
      expect(outcome.error.message).toBe("provider 529");
      expect(outcome.error.provider).toBe("anthropic");
      expect(outcome.error.retryable).toBe(false);
    }
  });

  it("untyped: an errored turn with no errorMessage falls back to 'provider transport failure'", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      queryText: "hello",
      runCompletion: () => Promise.resolve(errorReply()),
      executeTool: () => Promise.reject(new Error("no tool call expected")),
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, loomAbort.signal, model, config(25));

    expect(outcome.kind).toBe("transport");
    if (outcome.kind === "transport") {
      expect(outcome.error.message).toBe("provider transport failure");
    }
  });

  it("untyped: a non-cancel complete() reject surfaces Err(transport), never loom/runtime/internal-error", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      queryText: "hello",
      runCompletion: () => Promise.reject(new Error("socket hang up")),
      executeTool: () => Promise.reject(new Error("no tool call expected")),
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, loomAbort.signal, model, config(25));

    expect(outcome.kind).toBe("transport");
    if (outcome.kind === "transport") {
      expect(outcome.error.kind).toBe("transport");
      expect(outcome.error.message).toBe("socket hang up");
      expect(outcome.error.provider).toBe("anthropic");
    }
  });

  it("typed: a forced-respond turn with stopReason:'error' surfaces Err(transport), never parsed as a value", async () => {
    const loomAbort = new AbortController();
    let forcedCalls = 0;
    const model = createSubagentQueryModel({
      queryText: "answer",
      // `max_rounds: 0` routes straight to the forced-respond terminator.
      runCompletion: () => {
        forcedCalls += 1;
        return Promise.resolve(errorReply("forced-respond error"));
      },
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

    expect(outcome.kind, "a transport forced-respond is not validated/bound").toBe("transport");
    if (outcome.kind === "transport") {
      expect(outcome.error.message).toBe("forced-respond error");
      expect(outcome.forcedRespond.dispatched).toBe(true);
    }
    expect(forcedCalls).toBe(1);
  });

  it("typed: a non-cancel forced-respond reject surfaces Err(transport)", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      queryText: "answer",
      runCompletion: () => Promise.reject(new Error("connection reset")),
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

    expect(outcome.kind).toBe("transport");
    if (outcome.kind === "transport") {
      expect(outcome.error.message).toBe("connection reset");
    }
  });

});

// ===========================================================================
// Ceiling #4 (ceilings-3-and-4.md#ceiling-4-table, MODEL-DRIVEN row;
// schema-subset.md §Depth Enforcement point #2; CIO-3 depth-walk-before-AJV) —
// the loom-owned model-driven `tool_use` dispatch seam.
//
// `lowerModelDrivenToolCall` is the extracted STAGE-A seam the subagent driver
// runs for each model-produced tool call over the loom's callable set. A
// depth-6 model-produced argument is fed back to the model as an `isError`
// tool-result carrying the canonical depth message and the tool NEVER executes;
// a within-cap (depth-5) argument dispatches normally. This proves the
// model-driven ceiling-#4 obligation is enforced at the loom-owned seam — AJV
// against the presented tool schema cannot catch it (JSON Schema 2020-12 has no
// `maxDepth` keyword, so the presented schema carries no depth bound).
// ===========================================================================

/** A model-emitted `tool_use` call carrying `args` as its arguments. */
function modelToolCall(name: string, id: string, args: unknown): ToolCall {
  return { type: "toolCall", id, name, arguments: args as Record<string, unknown> };
}

/**
 * A scripted `PiToolDispatch` that records whether `execute()` was called, so a
 * test can witness the depth-6 short-circuit never reaches the tool body.
 */
function recordingDispatch(toolName: string): {
  readonly dispatch: PiToolDispatch;
  executed(): boolean;
} {
  let executed = false;
  return {
    dispatch: {
      toolName,
      execute: () => {
        executed = true;
        return Promise.resolve({ content: [{ type: "text", text: "TOOL-RAN" }] });
      },
    },
    executed: () => executed,
  };
}

// A depth-6 model argument: {a:{b:{c:{d:{e:1}}}}} — one level over the cap
// (schema-subset.md §Depth worked example).
const DEPTH_6_MODEL_ARG = { a: { b: { c: { d: { e: 1 } } } } };
// A depth-5 model argument: {a:{b:{c:{d:1}}}} — at the cap (within ceiling #4).
const DEPTH_5_MODEL_ARG = { a: { b: { c: { d: 1 } } } };

describe("ceiling #4 (model-driven row) — loom-owned `tool_use` dispatch seam", () => {
  it("a depth-6 model arg is fed back to the model as an isError tool-result and the tool NEVER executes (ceiling-4-table model-driven row / CIO-3)", async () => {
    const rec = recordingDispatch("read");
    const call = modelToolCall("read", "call-deep", DEPTH_6_MODEL_ARG);

    const result = await lowerModelDrivenToolCall(call, rec.dispatch, new AbortController().signal);

    // Primary: the depth-6 breach is fed back as an `isError` tool-result — the
    // model-driven row surfaces to the model, never as a loom `Err`.
    expect(result.isError, "a depth-6 model arg surfaces as an isError tool-result").toBe(true);
    // CIO-3 (depth-walk before the tool body): the host tool `execute()` is
    // NEVER called on the depth-6 path.
    expect(rec.executed(), "the tool body must NOT run on a depth-6 model arg").toBe(false);
    // The tool-result text carries the canonical depth message the model reads.
    const text = result.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    expect(text).toContain("JSON document depth exceeds 5");
    // The result is correlated to the model's tool-use id / name.
    expect(result.toolCallId).toBe("call-deep");
    expect(result.toolName).toBe("read");
  });

  it("a within-cap (depth-5) model arg dispatches normally to the tool body (no false-trip)", async () => {
    const rec = recordingDispatch("read");
    const call = modelToolCall("read", "call-ok", DEPTH_5_MODEL_ARG);

    const result = await lowerModelDrivenToolCall(call, rec.dispatch, new AbortController().signal);

    // The depth-5 argument is within the cap: the tool body runs and the clean
    // result is fed back (not an error).
    expect(rec.executed(), "the tool body must run for a within-cap model arg").toBe(true);
    expect(result.isError).toBe(false);
    const text = result.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    expect(text).toBe("TOOL-RAN");
  });

  it("a name outside the callable set is an unavailable-tool isError result (ambient tools never inherited)", async () => {
    const call = modelToolCall("forbidden", "call-x", { ok: true });

    const result = await lowerModelDrivenToolCall(call, undefined, new AbortController().signal);

    expect(result.isError).toBe(true);
    const text = result.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    expect(text).toContain("not available in this loom's callable set");
  });
});

describe("STAGE A — production subagent QueryModelDriver (mid-stream cancel)", () => {
  it("a mid-stream cancel is NOT reclassified as transport (cancel wins over the reject map)", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      queryText: "answer",
      // Abort fires, then the completion rejects (the abort-driven reject): the
      // cancel bounce must win, not the transport map.
      runCompletion: () => {
        loomAbort.abort(new Error("cancelled"));
        return Promise.reject(new Error("aborted"));
      },
      executeTool: () => Promise.reject(new Error("no tool call expected")),
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, loomAbort.signal, model, config(25));

    expect(outcome.kind).toBe("cancelled");
  });
});
