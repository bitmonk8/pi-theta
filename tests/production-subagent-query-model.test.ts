// H8a (bug-fix) — the production subagent-mode `QueryModelDriver` regression lock.
//
// The shipped composition root's `spawnSubagentConversation` previously wired an
// H9a acceptance-only DEMONSTRATION driver (`LiveSubagentQueryModel`) that fired
// an UNCONDITIONAL mid-stream `loomAbort.abort(...)` on every subagent `@`-query,
// so no subagent-mode loom could ever reach a success terminal outcome — every
// subagent query surfaced `Err(QueryError { kind: "cancelled" })`. The fix wires
// `V9i`'s compliant `awaitTerminalAgentEnd` + `extractSubagentQueryResult`
// through a `createSubagentQueryModel(...)` driver.
//
// These tests drive that driver through the REAL query loop
// (`runUntypedQueryLoop` / `runTypedQueryLoop`) against the loom's `loomAbort`
// signal — exactly as the production host does — so they green-lock:
//   - an untyped subagent query drives to a SUCCESS terminal (regression: no
//     forced self-cancel);
//   - a typed subagent query VALIDATES its structured payload against the
//     declared schema across the subagent boundary (FN-5 + QRY-22): a conforming
//     payload binds the typed value; a non-conforming payload surfaces
//     `Err(validation, schema_validation)` (Defect B — it no longer binds the
//     raw payload unvalidated);
//   - a GENUINE mid-stream `loomAbort` fire surfaces `Err(cancelled)` — the real
//     cancellation path is preserved.
//
// Spec: pi-integration-contract/subagent.md (PIC-42/PIC-43, FN-5), cancellation.md,
// query/query-failure-and-repair.md (QRY-22).

import { describe, expect, it } from "vitest";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
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
import type { AgentEndEvent } from "../src/runtime/subagent-isolation";
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

/** An assistant message carrying `text` with a normal (`stop`) stop reason. */
function assistantMessage(text: string): AssistantMessage {
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
    stopReason: "stop",
    timestamp: 0,
  };
}

/** A terminal (`willRetry: false`) `agent_end` event over `messages`. */
function agentEnd(messages: readonly Message[]): AgentEndEvent {
  return { type: "agent_end", messages, willRetry: false };
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

describe("H8a — production subagent QueryModelDriver (regression lock)", () => {
  it("untyped subagent query drives to a SUCCESS terminal outcome (no forced self-cancel)", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      driveTurn: () => Promise.resolve(agentEnd([assistantMessage("SUBAGENT-OK")])),
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, loomAbort.signal, model, config(25));

    // Regression: the old wiring cancelled every subagent query; the fixed
    // driver reaches the success terminal with the extracted trailing-turn text.
    expect(outcome.kind).toBe("text");
    if (outcome.kind === "text") {
      expect(outcome.text).toBe("SUBAGENT-OK");
    }
  });

  it("typed subagent query VALIDATES its structured payload and binds a conforming value (FN-5 + QRY-22)", async () => {
    const loomAbort = new AbortController();
    const model = createSubagentQueryModel({
      driveTurn: () =>
        Promise.resolve(agentEnd([assistantMessage('{"ok":true,"label":"blue"}')])),
      loomAbort,
      provider: "anthropic",
    });

    // The fixed producer supplies the schema-validation collaborator; the
    // conforming payload validates against the declared schema and binds.
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
      // Missing the required `label`, and carrying an undeclared property.
      driveTurn: () =>
        Promise.resolve(agentEnd([assistantMessage('{"ok":true,"extra":1}')])),
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
      // The scripted cancel point: `loomAbort` fires while the turn is in flight
      // (a real cancellation, not a production driver self-cancel), so by the
      // time the terminal event resolves the loop's signal is aborted.
      driveTurn: () => {
        loomAbort.abort(new Error("loom subagent query cancelled mid-stream"));
        return Promise.resolve(agentEnd([assistantMessage("ignored")]));
      },
      loomAbort,
      provider: "anthropic",
    });

    const outcome = await runUntypedQueryLoop(NOOP_CHECKPOINT, loomAbort.signal, model, config(25));

    expect(outcome.kind).toBe("cancelled");
  });
});
