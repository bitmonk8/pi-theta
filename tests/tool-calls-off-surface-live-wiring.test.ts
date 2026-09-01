// V14c live-seam wiring — the V14c off-surface routings INVOKED at the live
// code-side tool-call execution surface (`runCodeSideToolCall`,
// `runToolCallEffect`, and the `invoke` boundary), not merely unit-tested in
// isolation on `tool-call-off-surface.ts`.
//
// These tests witness that:
//   (a) a non-conforming `execute()` return envelope reaching the LIVE lowering
//       seam routes to `theta/runtime/internal-error{tool-return-shape}` off the
//       `CodeToolError` surface (NOT a bound `Ok(garbage)` and NOT a bound
//       `Err(code_tool)`), through `routeToolReturnShape`;
//   (b) a non-settling `execute()` Promise blocks at the seam's `await` until the
//       abort signal fires and then surfaces the cancelled outcome (NOCEIL-1: no
//       internal timeout), through `awaitToolSettlementOrAbort`;
//   (c) the post-cancel late settlement of the abandoned dispatch is discarded
//       (CNCL-1/2/3) with no second outcome — already covered by the wired
//       `awaitToolSettlementOrAbort` settled-guard + `guardToolExecutePromise`
//       swallowing handler, pinned here rather than duplicated.
//
// Spec: pi-integration-contract/host-interfaces-core.md §"Tool execution from
// theta code" §"Outcome routing summary"; tool-calls.md §"Outcome enumeration";
// diagnostics/code-registry-runtime.md (`theta/runtime/internal-error` Trigger);
// cancellation.md §"Race semantics" (CNCL-1/2/3); errors-and-results/
// error-model.md §"Runtime panics".

import { describe, expect, it } from "vitest";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { RuntimeEvent } from "../src/runtime/runtime-event-channel";
import type { CommittedSideEffect } from "../src/runtime/no-rollback";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import {
  runCodeSideToolCall,
  type AgentToolResultEnvelope,
  type CodeSideToolCall,
  type ToolLoweringSink,
} from "../src/runtime/tool-call-execute";
import { ToolReturnShapeDefectError } from "../src/runtime/tool-call-off-surface";
import { runInvokeChild, type InvokeChild, type DrivenInvokeResult } from "../src/runtime/invoke-cancellation";
import { executeBody, type ExecuteBodyDeps } from "../src/runtime/statement-executor";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
} from "../src/runtime/effectful-statement-host";
import { buildEnvironment, type LexicalEnvironment } from "../src/runtime/lexical-environment";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import type { InvokeInfraError } from "../src/runtime/query-error";
import type { CallExpr, ThetaBody } from "../src/parser/theta-document";
import type { ThetaValue, ResultValue } from "../src/runtime/value";

const TOOL_SITE: CheckpointSite = { file: "call.theta", line: 3, column: 5 };

/** A never-aborted signal for the settled / value arms. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/** A no-op `Checkpoint` whose `before(...)` resolves on the microtask queue. */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A `ToolLoweringSink` recording every normative side-channel emission. */
class RecordingSink implements ToolLoweringSink {
  readonly runtimeEvents: RuntimeEvent[] = [];
  readonly diagnostics: Diagnostic[] = [];
  readonly systemNotes: string[] = [];
  runtimeEvent(event: RuntimeEvent): void {
    this.runtimeEvents.push(event);
  }
  diagnostic(diag: Diagnostic): void {
    this.diagnostics.push(diag);
  }
  systemNote(message: string): void {
    this.systemNotes.push(message);
  }
}

/** A `CodeSideToolCall` whose `dispatch()` resolves a (possibly malformed) value. */
function callResolving(toolName: string, resolved: unknown): CodeSideToolCall {
  return {
    toolName,
    committed: [],
    dispatch: (): Promise<AgentToolResultEnvelope> =>
      Promise.resolve(resolved as AgentToolResultEnvelope),
  };
}

// ===========================================================================
// (a) Non-conforming return shape at the LIVE lowering seam → routes to
// internal-error{tool-return-shape}, off the CodeToolError surface, binding no
// value (host-interfaces-core.md §"Tool execution from theta code").
// ===========================================================================

describe("V14c live wiring (a) — runCodeSideToolCall routes a non-conforming return shape to internal-error{tool-return-shape}", () => {
  const cases: ReadonlyArray<{ label: string; resolved: unknown; token: string }> = [
    { label: "a non-object return", resolved: 42, token: "resolved-not-object" },
    { label: "a non-iterable content", resolved: { content: 7 }, token: "content-not-iterable" },
    {
      label: "a content entry missing `type`",
      resolved: { content: [{ text: "no type here" }] },
      token: "entry-missing-type",
    },
    {
      label: "a `type:'text'` entry missing `text`",
      resolved: { content: [{ type: "text" }] },
      token: "entry-missing-text",
    },
  ];

  for (const { label, resolved, token } of cases) {
    it(`${label} → return-shape-defect arm, shape_check='${token}', no bound value`, async () => {
      const sink = new RecordingSink();
      const outcome = await runCodeSideToolCall(
        NOOP_CHECKPOINT,
        liveSignal(),
        TOOL_SITE,
        callResolving("read", resolved),
        sink,
      );

      // The live seam does NOT bind a value for a non-conforming envelope.
      expect(outcome.kind, "non-conforming envelope is a return-shape-defect").toBe(
        "return-shape-defect",
      );
      // The only surface is the internal-error diagnostic (details.kind/tool_name/shape_check).
      if (outcome.kind === "return-shape-defect") {
        expect(outcome.diagnostic.code).toBe("theta/runtime/internal-error");
        expect(outcome.diagnostic.details?.kind).toBe("tool-return-shape");
        expect(outcome.diagnostic.details?.tool_name).toBe("read");
        expect(outcome.diagnostic.details?.shape_check).toBe(token);
        // The diagnostic is carried off the CodeToolError surface — no code_tool tag.
        expect((outcome.diagnostic as { kind?: string }).kind).not.toBe("code_tool");
      }
      // Emitted on the designated lowering-sink diagnostic channel, exactly once.
      expect(sink.diagnostics).toHaveLength(1);
      expect(sink.diagnostics[0]?.code).toBe("theta/runtime/internal-error");
    });
  }

  it("the seam stamps the diagnostic range from the call site's line/column", async () => {
    const sink = new RecordingSink();
    const outcome = await runCodeSideToolCall(
      NOOP_CHECKPOINT,
      liveSignal(),
      TOOL_SITE,
      callResolving("read", 42),
      sink,
    );
    if (outcome.kind !== "return-shape-defect") throw new Error("expected return-shape-defect");
    const range: SourceRange | undefined = outcome.diagnostic.range;
    expect(range?.start.line).toBe(TOOL_SITE.line);
    expect(range?.start.column).toBe(TOOL_SITE.column);
    expect(outcome.diagnostic.file).toBe(TOOL_SITE.file);
  });

  it("a conforming { content } envelope still lowers to Ok(<joined text>) with no defect (regression pin)", async () => {
    const sink = new RecordingSink();
    const outcome = await runCodeSideToolCall(
      NOOP_CHECKPOINT,
      liveSignal(),
      TOOL_SITE,
      callResolving("read", { content: [{ type: "text", text: "one" }, { type: "text", text: "two" }] }),
      sink,
    );
    expect(outcome.kind).toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.result.ok).toBe(true);
      if (outcome.result.ok) {
        expect(outcome.result.value).toBe("one\ntwo");
      }
    }
    expect(sink.diagnostics).toEqual([]);
  });
});

// ===========================================================================
// (a) end-to-end — a malformed tool return driven through the REAL executor +
// REAL effectful host surfaces the internal-error routing (the
// ToolReturnShapeDefectError carrier), NOT a bound Ok/Err value.
// ===========================================================================

class RecordingMutator implements CommittedConversationMutator {
  readonly calls: string[] = [];
  truncate(id: string): void {
    this.calls.push(`truncate:${id}`);
  }
  rewrite(id: string): void {
    this.calls.push(`rewrite:${id}`);
  }
  replace(id: string): void {
    this.calls.push(`replace:${id}`);
  }
  remove(id: string): void {
    this.calls.push(`remove:${id}`);
  }
  injectCompensatingTurn(surface: CommittedSurface): void {
    this.calls.push(`inject:${surface.id}`);
  }
}

const NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

function realEnv(): LexicalEnvironment {
  return buildEnvironment({ body: { statements: [], tail: null } });
}

function callExpr(callee: string): CallExpr {
  return {
    kind: "call",
    callee,
    args: [],
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
  };
}

/** Assemble the real executor deps driving a single code-tool call to `resolved`. */
function toolHarness(toolName: string, resolved: unknown): ExecuteBodyDeps {
  const signal = liveSignal();
  const call = callResolving(toolName, resolved);
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint: NOOP_CHECKPOINT,
    signal,
    sink: NOOP_SINK,
    file: "theta.theta",
    evaluatePure(): ThetaValue {
      return null;
    },
    resolveQuery() {
      throw new Error("no query in this harness");
    },
    resolveToolCall(): CodeSideToolCall {
      return call;
    },
    resolveInvoke() {
      throw new Error("no invoke in this harness");
    },
  };
  return {
    env: realEnv(),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: NOOP_CHECKPOINT,
    signal,
    mutator: new RecordingMutator(),
    mode: "prompt" as DrivenConversationMode,
    file: "theta.theta",
  };
}

describe("V14c live wiring (a) — end-to-end: a malformed tool return surfaces the internal-error routing, never a bound value", () => {
  it("a body `<name>(args)` whose execute() returns a non-object surfaces the ToolReturnShapeDefectError carrier (off the CodeToolError surface)", async () => {
    const program: ThetaBody = { statements: [], tail: callExpr("read") };
    // Routed off the CodeToolError surface as the internal-error class: the
    // executor never binds an Ok(garbage) / Err(code_tool) — the seam raises the
    // runtime-defect carrier, which the executor lets unwind (per Runtime panics).
    await expect(executeBody(program, toolHarness("read", 42))).rejects.toBeInstanceOf(
      ToolReturnShapeDefectError,
    );
  });

  it("the raised carrier carries the tool-return-shape diagnostic (details.kind, tool_name, shape_check)", async () => {
    const program: ThetaBody = { statements: [], tail: callExpr("read") };
    try {
      await executeBody(program, toolHarness("read", { content: [{ type: "text" }] }));
      throw new Error("expected a ToolReturnShapeDefectError to unwind the body");
    } catch (thrown: unknown) {
      expect(thrown).toBeInstanceOf(ToolReturnShapeDefectError);
      const diag = (thrown as ToolReturnShapeDefectError).diagnostic;
      expect(diag.code).toBe("theta/runtime/internal-error");
      expect(diag.details?.kind).toBe("tool-return-shape");
      expect(diag.details?.tool_name).toBe("read");
      expect(diag.details?.shape_check).toBe("entry-missing-text");
    }
  });

  it("a conforming tool return drives to a success Ok(<text>) (regression pin)", async () => {
    const program: ThetaBody = {
      statements: [],
      tail: callExpr("read"),
    };
    const r = await executeBody(
      program,
      toolHarness("read", { content: [{ type: "text", text: "ok-body" }] }),
    );
    expect(r.outcome).toBe("success");
    expect((r.result.value as ResultValue).ok).toBe(true);
  });
});

// ===========================================================================
// (a) invoke-parent observation — a tool-return-shape defect inside an invoke
// callee subtree surfaces to the parent as Err(InvokeInfraError{cause:
// "internal_error"}), per host-interfaces-core.md §"Outcome routing summary"
// ("an invoke parent observes Err(InvokeInfraError{ cause: internal_error })").
// ===========================================================================

describe("V14c live wiring (a) — invoke parent observes Err(InvokeInfraError{cause:'internal_error'}) for a tool-return-shape defect in the callee", () => {
  it("a callee whose subtree raises the shape-defect carrier surfaces to the parent as invoke_infra / internal_error (NOT code_tool)", async () => {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "theta/runtime/internal-error",
      file: "child.theta",
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
      message: "internal error: tool read returned a non-conforming result envelope",
      details: { kind: "tool-return-shape", tool_name: "read", shape_check: "resolved-not-object" },
    };
    const committed: readonly CommittedSideEffect[] = [];
    const child: InvokeChild = {
      calleePath: "./child.theta",
      committed,
      drive: (): Promise<DrivenInvokeResult> => {
        // The callee subtree's tool-return-shape defect unwinds as the carrier —
        // exactly what `runToolCallEffect` raises on the live path.
        throw new ToolReturnShapeDefectError(diagnostic);
      },
    };

    const outcome = await runInvokeChild(NOOP_CHECKPOINT, liveSignal(), TOOL_SITE, child);
    expect(outcome.kind).toBe("value");
    if (outcome.kind !== "value") return;
    expect(outcome.result.ok).toBe(false);
    if (outcome.result.ok) return;
    const err = outcome.result.error as unknown as InvokeInfraError;
    // Spec-mandated invoke-parent observation: invoke_infra / internal_error,
    // NEVER the callee's own code_tool surface.
    expect(err.kind).toBe("invoke_infra");
    expect(err.cause).toBe("internal_error");
    expect(err.callee_path).toBe("./child.theta");
  });
});

// ===========================================================================
// (b) Non-settling Promise at the LIVE seam → blocks until the signal fires,
// then surfaces the cancelled outcome (NOCEIL-1). Bounded: the test aborts, so
// a never-settling dispatch cannot hang the run.
// ===========================================================================

describe("V14c live wiring (b) — runCodeSideToolCall races a non-settling execute() against the abort signal", () => {
  it("a never-settling execute() blocks at the seam's await, then surfaces cancelled when the signal fires (no hang)", async () => {
    const sink = new RecordingSink();
    const controller = new AbortController();
    let dispatched = false;
    const call: CodeSideToolCall = {
      toolName: "read",
      committed: [],
      dispatch: (): Promise<AgentToolResultEnvelope> => {
        dispatched = true;
        // deliberately never settles — theta 1.0 makes no internal timeout attempt
        return new Promise<AgentToolResultEnvelope>(() => {});
      },
    };

    const pending = runCodeSideToolCall(
      NOOP_CHECKPOINT,
      controller.signal,
      TOOL_SITE,
      call,
      sink,
    );
    // Let the seam pass its pre-dispatch checkpoint + `signal.aborted` read
    // (signal not yet aborted) and enter the dispatch race, so the abort below
    // fires DURING the blocked `await` (exercising the race, not the
    // pre-dispatch short-circuit). A macrotask tick drains the microtask queue.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    // Fire the abort so the blocked await observes it.
    controller.abort();
    const outcome = await pending;

    expect(dispatched, "the non-settling dispatch was entered").toBe(true);
    expect(outcome.kind, "a non-settling Promise surfaces via the cancelled path").toBe(
      "cancelled",
    );
    // No internal-error is emitted on the cancelled path (NOCEIL-1).
    expect(
      sink.diagnostics.filter((d) => d.code === "theta/runtime/internal-error"),
    ).toEqual([]);
  });

  it("a settling execute() with no abort surfaces the lowered value (the race resolves settled-first)", async () => {
    const sink = new RecordingSink();
    const outcome = await runCodeSideToolCall(
      NOOP_CHECKPOINT,
      liveSignal(),
      TOOL_SITE,
      callResolving("read", { content: [{ type: "text", text: "done" }] }),
      sink,
    );
    expect(outcome.kind).toBe("value");
    if (outcome.kind === "value" && outcome.result.ok) {
      expect(outcome.result.value).toBe("done");
    }
  });
});

// ===========================================================================
// (c) Post-cancel late settlement — ALREADY covered by the wired
// `awaitToolSettlementOrAbort` settled-guard (+ the `guardToolExecutePromise`
// swallowing handler in production). Pinned here (not duplicated): a dispatch
// that resolves LATE, after the abort already surfaced cancelled at the seam,
// produces exactly ONE outcome (the cancelled one) and never rebinds a value.
// ===========================================================================

describe("V14c live wiring (c) — post-cancel late settlement of the abandoned dispatch is discarded (CNCL-1/2/3), no second outcome", () => {
  it("a late-resolving dispatch after cancellation surfaced yields exactly one (cancelled) outcome, no rebind", async () => {
    const sink = new RecordingSink();
    const controller = new AbortController();
    let resolveLate: (envelope: AgentToolResultEnvelope) => void = () => {};
    const call: CodeSideToolCall = {
      toolName: "read",
      committed: [],
      dispatch: (): Promise<AgentToolResultEnvelope> =>
        new Promise<AgentToolResultEnvelope>((resolve) => {
          resolveLate = resolve;
        }),
    };

    const pending = runCodeSideToolCall(NOOP_CHECKPOINT, controller.signal, TOOL_SITE, call, sink);
    // Enter the dispatch race before aborting (see the (b) rationale) so a
    // genuine abandoned-dispatch exists to settle late.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    controller.abort();
    const outcome = await pending;
    expect(outcome.kind).toBe("cancelled");

    // The abandoned dispatch settles LATE — after the seam already surfaced
    // cancelled. It must be discarded: no second outcome, no diagnostic, no
    // Node unhandledRejection (the swallowing handler / settled-guard absorb it).
    resolveLate({ content: [{ type: "text", text: "too late" }] });
    // Flush microtasks so any late-settlement handler would have run.
    await Promise.resolve();
    await Promise.resolve();
    expect(sink.diagnostics).toEqual([]);
    expect(sink.runtimeEvents).toEqual([]);
    // `outcome` remains the single cancelled disposition (no rebind to "too late").
    expect(outcome.kind).toBe("cancelled");
  });
});
