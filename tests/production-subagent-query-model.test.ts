// RFC-0005 re-base — the production subagent-mode `QueryModelDriver` over the
// child-process drive.
//
// Under RFC-0005 (docs/rfcs/0005-child-process-subagent-sessions.md;
// pi-integration-contract/subagent.md PIC-42/43) the CHILD `pi` process owns its
// agentic tool loop. The subagent driver's `nextFreePhaseTurn` issues ONE RPC
// `prompt` command onto the child's stdin and resolves the query from the
// child's terminal (`willRetry:false`) `agent_end` event — a single parent-loop
// round. The typed-query `forcedRespondTurn` continues to run OFF-SESSION in the
// PARENT via pi-ai `complete()` (`runCompletion`), exactly as before.
//
// These tests drive the real driver through the real loop against a fake child
// (`tests/helpers/fake-rpc-child.ts`), so they lock:
//   - an untyped subagent query resolves the child's terminal `agent_end` text
//     (PIC-43, FN-5);
//   - the child's transport failures (trailing `stopReason:"error"`; child crash
//     mid-query) surface `Err(transport)`, never `Ok(text)` (PIC-43 /
//     #subagent-error-fidelity);
//   - a typed subagent query VALIDATES its structured payload across the
//     boundary via the parent-side forced-respond terminator (FN-5 + QRY-22);
//   - a GENUINE mid-stream `thetaAbort` fire surfaces `Err(cancelled)` and wins
//     over a concurrent transport failure (PIC-41/43, cancellation.md).
//
// Spec: pi-integration-contract/subagent.md PIC-42/43 / #subagent-error-fidelity,
// errors-and-results.md, cancellation.md, query/query-failure-and-repair.md
// (QRY-22). The `tool_loop.max_rounds` ceiling-#2 exhaustion is now the CHILD's
// concern (its internal loop), not the parent driver's, so the former STL-2
// parent-side exhaustion witnesses are retired here (PIC-42: the child owns the
// loop; the parent resolves in a single round).

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
} from "../src/extension/production-theta-producer";
import { FakeRpcChild } from "./helpers/fake-rpc-child";
import type { SubagentChildProcess } from "../src/runtime/subagent-launcher";
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
    querySite: { file: "sub.theta", line: 1, column: 1 },
    thetaSlashName: "sub",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}

/** A microtask+macrotask flush so the loop reaches its `readTerminalAgentEnd` await. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Build the production subagent query model over a fake child (+ optional parent forced-respond). */
function makeModel(opts: {
  readonly child: SubagentChildProcess;
  readonly thetaAbort: AbortController;
  readonly queryText?: string;
  readonly runCompletion?: () => Promise<AssistantMessage>;
}): ReturnType<typeof createSubagentQueryModel> {
  return createSubagentQueryModel({
    queryText: opts.queryText ?? "q",
    child: opts.child,
    // The forced-respond terminator only; untyped free-phase drives the child.
    runCompletion: opts.runCompletion ?? (() => Promise.reject(new Error("runCompletion not expected"))),
    thetaAbort: opts.thetaAbort,
    provider: "anthropic",
    emitDiagnostic: () => {},
  });
}

describe("RFC-0005 — production subagent QueryModelDriver (child owns the tool loop)", () => {
  it("an untyped subagent query resolves the child's terminal agent_end text (PIC-43, FN-5)", async () => {
    const thetaAbort = new AbortController();
    const child = new FakeRpcChild();
    // The child ran its own agentic loop and produced a terminal plain-text turn.
    child.scriptAgentEnd([textReply("SUBAGENT-OK")]);
    const model = makeModel({ child, thetaAbort });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, thetaAbort.signal, model, config(25));

    expect(outcome.kind).toBe("text");
    if (outcome.kind === "text") {
      expect(outcome.text).toBe("SUBAGENT-OK");
    }
  });

  it("typed subagent query VALIDATES its structured payload and binds a conforming value (FN-5 + QRY-22)", async () => {
    const thetaAbort = new AbortController();
    // max_rounds:0 routes straight to the parent-side forced-respond terminator;
    // the child is spawned but never prompted for the query.
    const model = makeModel({
      child: new FakeRpcChild(),
      thetaAbort,
      runCompletion: () => Promise.resolve(textReply('{"ok":true,"label":"blue"}')),
    });

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      thetaAbort.signal,
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
    const thetaAbort = new AbortController();
    const model = makeModel({
      child: new FakeRpcChild(),
      thetaAbort,
      // Missing the required `label`, and carrying an undeclared property.
      runCompletion: () => Promise.resolve(textReply('{"ok":true,"extra":1}')),
    });

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      thetaAbort.signal,
      model,
      config(0),
      subagentValidation(),
    );

    expect(outcome.kind, "a non-conforming payload is not bound as the value").toBe("validation");
    if (outcome.kind === "validation") {
      expect(outcome.error.cause).toBe("schema_validation");
    }
  });

  it("a GENUINE mid-stream thetaAbort fire surfaces Err(cancelled), not a success value", async () => {
    const thetaAbort = new AbortController();
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const model = makeModel({ child, thetaAbort });

    const pending = runUntypedQueryLoop(NOOP_CHECKPOINT, thetaAbort.signal, model, config(25));
    // Mid-stream cancel: the abort fires while the driver awaits the child's
    // terminal event; the child then responds AFTER the cancel. The driver's
    // post-read abort re-check bounces to the loop's cancelled surface (PIC-43).
    await tick();
    thetaAbort.abort(new Error("theta subagent query cancelled mid-stream"));
    child.emitAgentEnd([textReply("ignored")]);
    const outcome = await pending;

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

describe("PIC-50/51 / PIC-43 — production subagent transport-error surfacing", () => {
  it("untyped: a child terminal turn with stopReason:'error' surfaces Err(transport), never Ok(text)", async () => {
    const thetaAbort = new AbortController();
    const child = new FakeRpcChild();
    // The child's terminal `agent_end` carries a trailing assistant
    // `stopReason:"error"` — PIC-43's transport short-circuit maps it to transport.
    child.scriptAgentEnd([errorReply("provider 529")]);
    const model = makeModel({ child, thetaAbort });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, thetaAbort.signal, model, config(25));

    expect(outcome.kind).toBe("transport");
    if (outcome.kind === "transport") {
      expect(outcome.error.kind).toBe("transport");
      expect(outcome.error.message).toBe("provider 529");
      expect(outcome.error.provider).toBe("anthropic");
      expect(outcome.error.retryable).toBe(false);
    }
  });

  it("untyped: an errored terminal turn with no errorMessage falls back to 'provider transport failure'", async () => {
    const thetaAbort = new AbortController();
    const child = new FakeRpcChild();
    child.scriptAgentEnd([errorReply()]);
    const model = makeModel({ child, thetaAbort });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, thetaAbort.signal, model, config(25));

    expect(outcome.kind).toBe("transport");
    if (outcome.kind === "transport") {
      expect(outcome.error.message).toBe("provider transport failure");
    }
  });

  it("untyped: a child crash mid-query surfaces Err(transport), never theta/runtime/internal-error (subagent-child-crashed)", async () => {
    const thetaAbort = new AbortController();
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const model = makeModel({ child, thetaAbort });

    const pending = runUntypedQueryLoop(NOOP_CHECKPOINT, thetaAbort.signal, model, config(25));
    // The child crashes / nonzero-exits mid-query before any terminal event.
    await tick();
    child.crashWith(1, null, "socket hang up");
    const outcome = await pending;

    expect(outcome.kind).toBe("transport");
    if (outcome.kind === "transport") {
      expect(outcome.error.kind).toBe("transport");
      expect(outcome.error.provider).toBe("anthropic");
      expect(outcome.error.retryable).toBe(false);
    }
  });

  it("typed: a forced-respond turn with stopReason:'error' surfaces Err(transport), never parsed as a value", async () => {
    const thetaAbort = new AbortController();
    let forcedCalls = 0;
    const model = makeModel({
      child: new FakeRpcChild(),
      thetaAbort,
      // `max_rounds: 0` routes straight to the parent-side forced-respond terminator.
      runCompletion: () => {
        forcedCalls += 1;
        return Promise.resolve(errorReply("forced-respond error"));
      },
    });

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      thetaAbort.signal,
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
    const thetaAbort = new AbortController();
    const model = makeModel({
      child: new FakeRpcChild(),
      thetaAbort,
      runCompletion: () => Promise.reject(new Error("connection reset")),
    });

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      thetaAbort.signal,
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
// the theta-owned model-driven `tool_use` dispatch seam.
//
// `lowerModelDrivenToolCall` is the extracted STAGE-A seam the subagent driver
// runs for each model-produced tool call over the theta's callable set. A
// depth-6 model-produced argument is fed back to the model as an `isError`
// tool-result carrying the canonical depth message and the tool NEVER executes;
// a within-cap (depth-5) argument dispatches normally. This proves the
// model-driven ceiling-#4 obligation is enforced at the theta-owned seam — AJV
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

describe("ceiling #4 (model-driven row) — theta-owned `tool_use` dispatch seam", () => {
  it("a depth-6 model arg is fed back to the model as an isError tool-result and the tool NEVER executes (ceiling-4-table model-driven row / CIO-3)", async () => {
    const rec = recordingDispatch("read");
    const call = modelToolCall("read", "call-deep", DEPTH_6_MODEL_ARG);

    const result = await lowerModelDrivenToolCall(call, rec.dispatch, new AbortController().signal);

    // Primary: the depth-6 breach is fed back as an `isError` tool-result — the
    // model-driven row surfaces to the model, never as a theta `Err`.
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
    expect(text).toContain("not available in this theta's callable set");
  });
});

describe("RFC-0005 — production subagent QueryModelDriver (mid-stream cancel)", () => {
  it("a mid-stream cancel is NOT reclassified as transport (cancel wins over a concurrent child crash)", async () => {
    const thetaAbort = new AbortController();
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const model = makeModel({ child, thetaAbort });

    const pending = runUntypedQueryLoop(NOOP_CHECKPOINT, thetaAbort.signal, model, config(25));
    // The abort fires, then the child crashes (the abort-driven exit): the cancel
    // bounce must win over the child-crash transport map (PIC-43 short-circuit
    // order — cancellation before transport).
    await tick();
    thetaAbort.abort(new Error("cancelled"));
    child.crashWith(1);
    const outcome = await pending;

    expect(outcome.kind).toBe("cancelled");
  });
});
