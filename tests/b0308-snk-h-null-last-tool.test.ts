// Bug 0308 — RED witness: the SNK-h note renderer fabricates a `respond`
// tool name for a REACHABLE `last_tool_name: null`.
//
// The bug: `renderLeafKindNote`'s SNK-h arm (`src/runtime/err-note-render.ts`)
// implemented `const lastTool = e.last_tool_name ?? "respond"` under a comment claiming
// "no theta 1.0-reachable null case". That premise is false — any untyped
// query under `tool_loop.max_rounds: 0` exhausts at initialisation
// (`slotCount === config.maxRounds`, `0 === 0`) BEFORE the first free-phase
// turn, so `runUntypedQueryLoop` surfaces `ToolLoopExhaustedError` with
// `last_tool_name: null` (`src/runtime/query-tool-loop.ts:370,383-390`). The
// renderer then swaps that null for the literal `respond`, naming a tool the
// untyped query never registered and never called.
//
// Parent adjudication (binding): drop `?? "respond"` at BOTH sites; a null
// `last_tool_name` renders via `summariseErrorField`'s existing null rule
// (`src/runtime/err-field-summary.ts` — `String(null) === "null"`). A cap >= 1
// / real-tool-name note stays BYTE-IDENTICAL.
//
// Cells:
//   (A) RED-NOW  — cap-0 null `last_tool_name` must render `(last tool: null)`,
//       NOT `(last tool: respond)`. Reds today (tree renders `respond`).
//   (B) GREEN    — a real tool name renders as today (control; green before
//       AND after the fix).
//   (C) GREEN    — reachability-mechanism lock: `runUntypedQueryLoop` under
//       `max_rounds: 0` yields `last_tool_name: null` at `rounds: 0` (pins the
//       doc's "null is reachable" mechanism).
//   (D) GREEN    — behaviour-neutrality lock for the second `?? "respond"` at
//       `production-theta-producer.ts:4807` (`#exhaustionTurn`): the governor
//       sets `exhausted === true` only while recording a concrete (non-null)
//       `lastToolName`, so that `?? "respond"` is DEAD — dropping it is
//       byte-neutral on the reachable shape.
//
// Spec: docs/bugs/0308-*.md; slash-invocation.md (SNK-h); errors-and-results/
// queryerror-variants.md (ERR-19). Sibling patterns copied from
// tests/query-tool-loop.test.ts and tests/prompt-tool-loop-governor.test.ts.

import { describe, it, expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionHandler,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { renderLeafKindNote } from "../src/runtime/err-note-render";
import type {
  QueryError,
  ToolLoopExhaustedError,
} from "../src/runtime/query-error";
import {
  runUntypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
  type ToolCallRequest,
} from "../src/runtime/query-tool-loop";
import type {
  Checkpoint,
  CheckpointKind,
  CheckpointSite,
} from "../src/seams/checkpoint";
import type { CommittedSideEffect } from "../src/runtime/no-rollback";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";

/**
 * Build a leaf `ToolLoopExhaustedError` with the given `rounds` /
 * `last_tool_name`. `raw_response` is null on the cap-0 path (no free-phase
 * turn emitted any text), matching the live-observed shape in the bug doc.
 */
function exhaustedLeaf(
  rounds: number,
  lastToolName: string | null,
): ToolLoopExhaustedError {
  return {
    kind: "tool_loop_exhausted",
    message: `Tool-call loop exhausted after ${rounds} round(s) without a terminating response`,
    rounds,
    last_tool_name: lastToolName,
    raw_response: null,
  };
}

// ===========================================================================
// (A) RED-NOW — a REACHABLE cap-0 null `last_tool_name` must render `null`,
// never the fabricated `respond`.
// ===========================================================================

describe("bug 0308 (A) — SNK-h renders a null last_tool_name as `null`, not `respond`", () => {
  it("cap-0 tool_loop_exhausted with last_tool_name: null renders `(last tool: null)`", () => {
    const note = renderLeafKindNote("tzero", exhaustedLeaf(0, null) as QueryError);

    // The untyped query registered no `respond` tool and called nothing; the
    // note must not name one (the fabricated-name symptom of bug 0308).
    expect(note).not.toContain("respond");
    // The faithful rendering routes the null field through summariseErrorField
    // (String(null) === "null"), per the parent adjudication.
    expect(note).toBe(
      "theta /tzero returned Err: tool-call loop exhausted after 0 rounds (last tool: null)",
    );
  });
});

// ===========================================================================
// (B) GREEN control — a real tool name renders exactly as it does today
// (byte-identical before AND after the fix; the swept `??` never fires here).
// ===========================================================================

describe("bug 0308 (B) — a real last_tool_name renders byte-identically (control)", () => {
  it("cap>=1 tool_loop_exhausted with last_tool_name: 'read' renders the name verbatim", () => {
    const note = renderLeafKindNote("demo", exhaustedLeaf(1, "read") as QueryError);
    expect(note).toBe(
      "theta /demo returned Err: tool-call loop exhausted after 1 rounds (last tool: read)",
    );
  });
});

// ===========================================================================
// (C) GREEN — reachability-mechanism lock. A scripted `runUntypedQueryLoop`
// under `max_rounds: 0` exhausts at initialisation with `last_tool_name: null`,
// pinning the doc's mechanism that the "unreachable null" premise is false.
// Driver/config/checkpoint shapes mirror tests/query-tool-loop.test.ts.
// ===========================================================================

const QUERY_SITE: CheckpointSite = { file: "tzero.theta", line: 3, column: 1 };

function config(maxRounds: number): QueryToolLoopConfig {
  return {
    maxRounds,
    querySite: QUERY_SITE,
    thetaSlashName: "/tzero",
    invocationId: "00000000-0000-4000-8000-000000000000",
    occurredAt: 1_700_000_000_000,
  };
}

/** A never-aborted signal (the non-cancellation arms). */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/** A no-op `Checkpoint` — cell (C) does not assert on the checkpoint stream. */
class InertCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * A scripted `QueryModelDriver` whose free phase throws loudly if ever read:
 * under `max_rounds: 0` the loop exhausts BEFORE the first `nextFreePhaseTurn`,
 * so reaching the driver is itself the failure the cell guards against (no
 * silent skip / no vacuous pass).
 */
class NoTurnModel implements QueryModelDriver {
  freePhaseCalls = 0;

  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    this.freePhaseCalls += 1;
    throw new Error(
      `max_rounds:0 must exhaust before any free-phase turn, but round ${round} was read`,
    );
  }

  runToolBatch(
    _batch: readonly ToolCallRequest[],
    _round: number,
  ): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }

  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    throw new Error("untyped loop never dispatches a forced-respond turn");
  }
}

describe("bug 0308 (C) — last_tool_name: null is reachable under max_rounds: 0", () => {
  it("runUntypedQueryLoop at max_rounds:0 exhausts with rounds:0 and last_tool_name: null", async () => {
    const model = new NoTurnModel();
    const outcome = await runUntypedQueryLoop(
      new InertCheckpoint(),
      liveSignal(),
      model,
      config(0),
    );

    expect(outcome.kind).toBe("tool_loop_exhausted");
    if (outcome.kind !== "tool_loop_exhausted") return;
    // The `max_rounds`-final branch fired at initialisation, before any turn.
    expect(model.freePhaseCalls).toBe(0);
    expect(outcome.error.rounds).toBe(0);
    // The field the renderer must render faithfully IS null (bug 0308's premise
    // defeater): no tool was ever called.
    expect(outcome.error.last_tool_name).toBeNull();
  });
});

// ===========================================================================
// (D) GREEN — behaviour-neutrality lock for the `#exhaustionTurn` site
// (production-theta-producer.ts:4807, `const toolName = this.#exhaustion
// ?.lastToolName ?? "respond"`).
//
// WHY the governor and not `#exhaustionTurn` directly: `#exhaustionTurn` is a
// private method on a producer that is not unit-constructible in isolation
// (it requires the full prompt-mode drive apparatus). Its `?? "respond"` is
// fed from the governor's `PromptToolLoopExhaustion.lastToolName`, and the
// governor IS a unit. This cell proves the invariant the deadness rests on:
// `exhausted === true` is set in the SAME `#onToolCall` event that records a
// concrete (non-null) `lastToolName` — so the producer's `?? "respond"` can
// never see a null on the reachable exhausted path, and dropping it is
// byte-neutral. FakePi mirrors tests/prompt-tool-loop-governor.test.ts.
// ===========================================================================

/** A minimal fake `pi` that captures the governor's `on(...)` handlers. */
class FakePi {
  #bpr: (() => void) | undefined;
  #toolCall:
    | ((event: ToolCallEvent) => ToolCallEventResult | undefined)
    | undefined;

  readonly api: ExtensionAPI;

  constructor() {
    const on = (
      event: string,
      handler: ExtensionHandler<unknown, unknown>,
    ): void => {
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

  providerRequest(): void {
    this.#bpr?.();
  }

  toolCall(toolName: string): ToolCallEventResult | undefined {
    const event = {
      type: "tool_call",
      toolCallId: `tc-${toolName}`,
      toolName,
      input: {},
    } as unknown as ToolCallEvent;
    return this.#toolCall?.(event);
  }
}

describe("bug 0308 (D) — exhausted === true always carries a non-null lastToolName", () => {
  it("a governor driven to exhaustion snapshots {exhausted:true, lastToolName:'grep'} — the producer's `?? \"respond\"` is dead", () => {
    const pi = new FakePi();
    const gov = new PromptToolLoopGovernor();
    gov.ensureRegistered(pi.api);
    gov.begin(1);

    // Round 1 (allowed): a real tool call under the cap of 1.
    pi.providerRequest();
    expect(pi.toolCall("read")).toBeUndefined();

    // Round 2 (beyond the cap): blocked — this is the ONLY event that sets
    // exhausted=true, and it records `event.toolName` as lastToolName in the
    // same step (prompt-tool-loop-governor.ts #onToolCall).
    pi.providerRequest();
    const blocked = pi.toolCall("grep");
    expect(blocked).toEqual({ block: true, reason: "tool_loop_exhausted" });

    const ex = gov.end();
    // The invariant that makes the producer's `?? "respond"` unreachable-with-
    // null: exhausted true <=> a concrete lastToolName was recorded.
    expect(ex.exhausted).toBe(true);
    expect(ex.lastToolName).toBe("grep");
    expect(ex.lastToolName).not.toBeNull();
  });
});
