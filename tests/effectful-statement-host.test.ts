import { describe, expect, it } from "vitest";
import { executeBody, type ExecuteBodyDeps } from "../src/runtime/statement-executor";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import { buildEnvironment, type LexicalEnvironment } from "../src/runtime/lexical-environment";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import { makeOk, type LoomValue, type ResultValue } from "../src/runtime/value";
import type {
  FreePhaseTurn,
  ForcedRespondTurn,
  QueryModelDriver,
  QueryToolLoopConfig,
} from "../src/runtime/query-tool-loop";
import type {
  AgentToolResultEnvelope,
  CodeSideToolCall,
  ToolLoweringSink,
} from "../src/runtime/tool-call-execute";
import type { InvokeChild } from "../src/runtime/invoke-cancellation";
import type { CommittedSideEffect } from "../src/runtime/no-rollback";
import type {
  CallExpr,
  Expr,
  InvokeExpr,
  InvokeStmt,
  LoomBody,
  QueryExpr,
  QueryStmt,
  Stmt,
  ToolCallStmt,
} from "../src/parser/loom-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// V19d-T — failing tests for the paired `V19d` effectful statement wiring.
//
// `V19d` assembles the REAL effectful hosts into the `V19c` executor's
// `StatementEvalHost` seam (`createEffectfulStatementHost`): a body `@`-query
// executes through the real query-model driver's two-phase loop
// (`runUntypedQueryLoop` / `runTypedQueryLoop`), a `<name>(args)` code-tool call
// dispatches through the real code-side tool-call path (`runCodeSideToolCall`),
// and an `invoke(...)` executes through the real invoke trampoline
// (`runInvokeChild`) against a freshly spawned isolated session. Each bullet is
// an integration-realisation witness — the query / tool-call / invoke REQ-IDs
// (QRY-13…16, `cka-13`/`cka-46`, INV-1…4, `cka-47` `V15m` facet) are owned on
// their `V13*` / `V14*` / `V15*` leaves and are NOT re-closed here; this leaf
// closes no new coverage-matrix row.
//
// These tests wire the REAL executor (`executeBody`) and the REAL host-assembly
// factory (`createEffectfulStatementHost`) to the query / tool-call / invoke
// hosts' legitimate boundary doubles (a scripted `QueryModelDriver`, a recording
// `CodeSideToolCall`, a recording `InvokeChild`) — the same shapes the real loop
// / path / trampoline consume — and assert each effect drives its real host.
//
// They red because the `V19d` assembly is absent: the `V19d-T` factory stub's
// `runEffect` dispatches NO effect through the real hosts and returns an inert
// `Ok(null)`. Each test reds on its own primary assertion — a query loop that
// never serviced its tool round, a tool call never dispatched, an invoke child
// never driven, an empty in-order effect log, or an invoke-checkpoint
// cancellation that never interrupted dispatch — not on a compile error, a
// missing fixture, or a harness throw.

// --- AST construction helpers ----------------------------------------------

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function numberExpr(text: string): Expr {
  return { kind: "number", text, numericType: "integer", range: span() };
}

function queryExpr(template: string): QueryExpr {
  return { kind: "query", schema: null, template, range: span() };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

function invokeExpr(path: string, args: readonly Expr[] = []): InvokeExpr {
  return { kind: "invoke", path, returnSchema: null, args, range: span() };
}

function queryStmt(template: string): QueryStmt {
  return { kind: "query", query: queryExpr(template), range: span() };
}

function toolCallStmt(callee: string, args: readonly Expr[] = []): ToolCallStmt {
  return { kind: "tool-call", call: callExpr(callee, args), range: span() };
}

function invokeStmt(path: string, args: readonly Expr[] = []): InvokeStmt {
  return { kind: "invoke", invoke: invokeExpr(path, args), range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null = null): LoomBody {
  return { statements, tail };
}

/** A real `V19b` root environment over an empty body. */
function realEnv(): LexicalEnvironment {
  return buildEnvironment({ body: { statements: [], tail: null } });
}

const SITE: CheckpointSite = { file: "loom.loom", line: 1, column: 1 };

// --- Checkpoint substrate (PIC-10) -----------------------------------------

/** A no-op `Checkpoint` (an already-resolved promise). */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/**
 * A `Checkpoint` whose `before(...)` invokes an injected callback on each await,
 * carrying the 1-based call index and the checkpoint kind — the deterministic
 * substrate (PIC-10) that lands an abort at a chosen checkpoint boundary without
 * depending on JS microtask scheduling.
 */
class ScriptedCheckpoint implements Checkpoint {
  #calls = 0;
  readonly #onBefore: (call: number, kind: CheckpointKind) => void;
  constructor(onBefore: (call: number, kind: CheckpointKind) => void) {
    this.#onBefore = onBefore;
  }
  before(kind: CheckpointKind): Promise<void> {
    this.#calls += 1;
    this.#onBefore(this.#calls, kind);
    return Promise.resolve();
  }
}

// --- Recording partial-append mutator (V4c) --------------------------------

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

// --- Boundary doubles the real hosts consume -------------------------------

/**
 * A scripted `QueryModelDriver` — the legitimate boundary the real query loop
 * (`runUntypedQueryLoop` / `runTypedQueryLoop`) drives. `turns` scripts the
 * free-phase transcript per 0-based round. Every driven method records its
 * activity into `log` so a caller can witness that the real loop drove it.
 */
class RecordingQueryModel implements QueryModelDriver {
  readonly log: string[] = [];
  serviced = false;
  readonly #turns: readonly FreePhaseTurn[];
  constructor(turns: readonly FreePhaseTurn[]) {
    this.#turns = turns;
  }
  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    this.log.push("query:turn");
    const turn = this.#turns[round] ?? { kind: "text", text: "" };
    return Promise.resolve(turn);
  }
  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    this.serviced = true;
    this.log.push("query:tool-round");
    return Promise.resolve([]);
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: null });
  }
}

/**
 * A recording `CodeSideToolCall` — the legitimate boundary the real code-side
 * tool-call path (`runCodeSideToolCall`) dispatches. `dispatched` witnesses that
 * the real path invoked `dispatch()`.
 */
class RecordingToolCall implements CodeSideToolCall {
  dispatched = false;
  readonly committed: readonly CommittedSideEffect[] = [];
  readonly #onDispatch: (() => void) | undefined;
  constructor(
    readonly toolName: string,
    readonly text: string,
    onDispatch?: () => void,
  ) {
    this.#onDispatch = onDispatch;
  }
  dispatch(): Promise<AgentToolResultEnvelope> {
    this.dispatched = true;
    this.#onDispatch?.();
    return Promise.resolve({ content: [{ type: "text", text: this.text }] });
  }
}

/**
 * A recording `InvokeChild` — the legitimate boundary the real invoke trampoline
 * (`runInvokeChild`) drives against a freshly spawned isolated session. `driven`
 * witnesses that the real trampoline reached the child spawn.
 */
class RecordingInvokeChild implements InvokeChild {
  driven = false;
  readonly committed: readonly CommittedSideEffect[] = [];
  readonly #onDrive: (() => void) | undefined;
  constructor(
    readonly calleePath: string,
    readonly value: LoomValue,
    onDrive?: () => void,
  ) {
    this.#onDrive = onDrive;
  }
  drive(): Promise<ResultValue> {
    this.driven = true;
    this.#onDrive?.();
    return Promise.resolve(makeOk(this.value));
  }
}

const NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

function queryConfig(): QueryToolLoopConfig {
  return {
    maxRounds: 3,
    querySite: SITE,
    loomSlashName: "demo",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}

/**
 * Assemble the real host + real executor deps from a bundle of boundary doubles.
 * The factory and the executor share the same `checkpoint` / `signal` so a real
 * invoke-checkpoint cancellation is honoured on the real trampoline.
 */
function harness(opts: {
  model?: QueryModelDriver;
  toolCall?: CodeSideToolCall;
  invoke?: InvokeChild;
  typedQuery?: boolean;
  checkpoint?: Checkpoint;
  signal?: AbortSignal;
  mutator?: CommittedConversationMutator;
}): ExecuteBodyDeps {
  const checkpoint = opts.checkpoint ?? NOOP_CHECKPOINT;
  const signal = opts.signal ?? new AbortController().signal;
  const model = opts.model ?? new RecordingQueryModel([{ kind: "text", text: "" }]);
  const toolCall = opts.toolCall ?? new RecordingToolCall("noop", "");
  const invoke = opts.invoke ?? new RecordingInvokeChild("./noop.loom", null);
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint,
    signal,
    sink: NOOP_SINK,
    file: "loom.loom",
    evaluatePure(expr: Expr): LoomValue {
      if (expr.kind === "number") {
        return Number(expr.text);
      }
      return null;
    },
    resolveQuery(): QueryHostDispatch {
      return { typed: opts.typedQuery ?? false, model, config: queryConfig() };
    },
    resolveToolCall(): CodeSideToolCall {
      return toolCall;
    },
    resolveInvoke(): InvokeChild {
      return invoke;
    },
  };
  return {
    env: realEnv(),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint,
    signal,
    mutator: opts.mutator ?? new RecordingMutator(),
    mode: "prompt" as DrivenConversationMode,
    file: "test.loom",
  };
}

// ===========================================================================
// Real-host query wiring — QRY-13…16 integration witness (owned on V13*).
// ===========================================================================

describe("V19d-T — real-host query wiring (QRY-13…16 integration witness)", () => {
  it("QRY-13/QRY-14/QRY-15/QRY-16: a body `@`-query executes through the real query loop, services the tool-call loop, and resolves to the final response", async () => {
    // Free phase: round 0 emits a `tool_use` round (serviced by the real loop),
    // round 1 emits the terminating plain-text turn that is the final response.
    const model = new RecordingQueryModel([
      { kind: "tool_use", batch: [{ toolName: "search", toolUseId: "t0" }] },
      { kind: "text", text: "final answer" },
    ]);
    const program = body([], queryExpr("what is the answer?"));

    const r = await executeBody(program, harness({ model }));

    expect(
      model.serviced,
      "QRY-13/QRY-15: the real query loop serviced the model tool-call round",
    ).toBe(true);
    expect(r.outcome, "the body drives to the success terminal outcome").toBe("success");
    expect(
      r.result.value,
      "QRY-16: the `@`-query resolves to the model's final plain-text response",
    ).toBe("final answer");
  });
});

// ===========================================================================
// Real-host tool-call wiring — cka-13 / cka-46 integration witness (V14*).
// ===========================================================================

describe("V19d-T — real-host tool-call wiring (cka-13 / cka-46 integration witness)", () => {
  it("cka-13/cka-46: a body `<name>(args)` tool call dispatches through the real code-side tool-call path against the driven conversation", async () => {
    const toolCall = new RecordingToolCall("emit", "tool-out");
    const program = body([], callExpr("emit"));

    const r = await executeBody(program, harness({ toolCall }));

    expect(
      toolCall.dispatched,
      "cka-13/cka-46: the real code-side tool-call path dispatched the tool",
    ).toBe(true);
    expect(r.outcome, "the body drives to the success terminal outcome").toBe("success");
    expect(
      (r.result.value as ResultValue).ok,
      "cka-46: a cleanly-resolving tool call lowers to `Ok(...)`",
    ).toBe(true);
  });
});

// ===========================================================================
// Real-host invoke wiring — INV-1…4 integration witness (owned on V15*).
// ===========================================================================

describe("V19d-T — real-host invoke wiring (INV-1…4 integration witness)", () => {
  it("INV-1/INV-2/INV-3/INV-4: a body `invoke(...)` executes through the real invoke trampoline against a freshly spawned isolated session", async () => {
    const invoke = new RecordingInvokeChild("./child.loom", "child-value");
    const program = body([], invokeExpr("./child.loom"));

    const r = await executeBody(program, harness({ invoke }));

    expect(
      invoke.driven,
      "INV-1…4: the real invoke trampoline drove the freshly spawned child",
    ).toBe(true);
    expect(r.outcome, "the body drives to the success terminal outcome").toBe("success");
    expect(
      (r.result.value as ResultValue).ok,
      "INV-4: the completed callee's top-level `Result` flows back as the invoke value",
    ).toBe(true);
  });
});

// ===========================================================================
// In-order effectful execution — no coverage-matrix row.
// ===========================================================================

describe("V19d-T — in-order effectful execution through the real hosts", () => {
  it("a body interleaving an `@`-query, a `<name>(args)` tool call, and an `invoke(...)` executes each effect strictly in source order through the real hosts", async () => {
    const order: string[] = [];
    const model = new RecordingQueryModel([{ kind: "text", text: "q" }]);
    // The query records its first driven turn via the shared order log.
    const origTurn = model.nextFreePhaseTurn.bind(model);
    model.nextFreePhaseTurn = (round: number) => {
      order.push("query");
      return origTurn(round);
    };
    const toolCall = new RecordingToolCall("emit", "t", () => order.push("tool"));
    const invoke = new RecordingInvokeChild("./child.loom", null, () => order.push("invoke"));

    const program = body([queryStmt("q"), toolCallStmt("emit"), invokeStmt("./child.loom")]);

    await executeBody(program, harness({ model, toolCall, invoke }));

    expect(
      order,
      "each effect executes strictly in source order through the real hosts — the V19c executor drives real hosts, not doubles",
    ).toEqual(["query", "tool", "invoke"]);
  });
});

// ===========================================================================
// Invoke-dispatch cancellation checkpoint — cka-47 (V15m) integration witness.
// ===========================================================================

describe("V19d-T — invoke-dispatch cancellation checkpoint on the real trampoline (cka-47 V15m witness)", () => {
  it("cka-47 (V15m): a cancellation at the invoke checkpoint interrupts dispatch through the real trampoline — the child is never spawned", async () => {
    const controller = new AbortController();
    let invokeCheckpointCalls = 0;
    // Abort at the SECOND `invoke`-kind checkpoint `before(...)` — the first is
    // the executor's per-statement checkpoint (dispatch not yet interrupted),
    // the second is the real trampoline's own pre-spawn `invoke` checkpoint on
    // the host `V19d` assembled: an abort observed THERE skips the spawn.
    const checkpoint = new ScriptedCheckpoint((_call, kind) => {
      if (kind === "invoke") {
        invokeCheckpointCalls += 1;
        if (invokeCheckpointCalls === 2) {
          controller.abort();
        }
      }
    });
    const invoke = new RecordingInvokeChild("./child.loom", "child-value");
    const program = body([invokeStmt("./child.loom")]);

    const r = await executeBody(
      program,
      harness({ invoke, checkpoint, signal: controller.signal }),
    );

    expect(
      invoke.driven,
      "cka-47 (V15m): the invoke-checkpoint abort interrupted dispatch — the child was never spawned",
    ).toBe(false);
    expect(
      r.outcome,
      "cka-47 (V15m): a cancellation at the real invoke checkpoint drives to the cancel terminal outcome",
    ).toBe("cancel");
  });
});
