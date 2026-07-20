import { describe, expect, it } from "vitest";
import {
  executeBody,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
import {
  buildEnvironment,
  LexicalEnvironment,
} from "../src/runtime/lexical-environment";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type {
  Checkpoint,
  CheckpointKind,
  CheckpointSite,
} from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import { valuesEqual, type ThetaValue } from "../src/runtime/value";
import type { QueryError } from "../src/runtime/query-error";
import type {
  Block,
  CallExpr,
  Expr,
  ExprStmt,
  ForStmt,
  IfStmt,
  ThetaBody,
  ReturnStmt,
  Stmt,
  ToolCallStmt,
  WhileStmt,
} from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// V19c-T — failing tests for the paired `V19c` tree-walking statement executor.
//
// Spec: implementation-notes.md §Runtime (the strictly-sequential
// statement-execution driver — `coverage-matrix.md` code-keyed-area token
// `cka-50`, the only NEW row the paired impl leaf closes), cancellation.md
// §Granularity / §"Statement boundaries are not checkpoints" / CNCL-5,
// control-flow.md CTRL-1, functions.md FN-4/FN-5, return.md RET-1/RET-2/RET-3,
// errors-and-results/error-model.md §Terminal outcomes ERR-8 … ERR-12.
//
// The control-flow (CTRL-1), final-value (FN-4/FN-5, RET-*), five-site
// checkpoint (`cka-47`), and terminal-outcome (ERR-8 … ERR-12) bullets are
// integration witnesses — asserted through the executor against the REAL
// collaborators (`V19b`'s `LexicalEnvironment`, `V3c`'s `evaluateForLoop`,
// `V17a`'s `runCancellableSequence` + `Checkpoint` seam, `V4c`'s
// `handlePartialTerminalOutcome`) — not new closures. Only the driver /
// top-to-bottom-sequencing bullet (`cka-50`) is a new closure.
//
// These tests red because the `V19c` executor is absent: `executeBody` drives
// nothing and returns the inert `{ outcome: "fail", result: { present: false } }`
// sentinel. Each test reds on its own primary assertion — an un-driven
// statement effect, an un-evaluated loop iterand, an un-preempted mid-body
// checkpoint, an absent tail/`return` final value, or a wrong terminal outcome
// — not on a compile error, a missing fixture, or a harness throw.

// --- AST construction helpers ----------------------------------------------

/** A throwaway 1:1–1:2 span for hand-built AST nodes. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function numberExpr(text: string): Expr {
  return { kind: "number", text, numericType: "integer", range: span() };
}

function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function boolExpr(value: boolean): Expr {
  return { kind: "bool", value, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}

function arrayExpr(elements: readonly Expr[]): Expr {
  return { kind: "array", elements, range: span() };
}

function eqExpr(left: Expr, right: Expr): Expr {
  return { kind: "binary", op: "==", left, right, range: span() };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

/** A code-tool call in statement position — a checkpointed effect statement. */
function toolCallStmt(callee: string, args: readonly Expr[] = []): ToolCallStmt {
  return { kind: "tool-call", call: callExpr(callee, args), range: span() };
}

/** A pure expression statement (its value discarded). */
function exprStmt(expr: Expr): ExprStmt {
  return { kind: "expr", expr, range: span() };
}

function returnStmt(operand: Expr | null): ReturnStmt {
  return { kind: "return", operand, range: span() };
}

function ifStmt(condition: Expr, then: Block, otherwise: Block | IfStmt | null = null): IfStmt {
  return { kind: "if", condition, then, otherwise, range: span() };
}

function forStmt(variable: string, iterand: Expr, body: Block): ForStmt {
  return { kind: "for", variable, iterand, body, range: span() };
}

function whileStmt(condition: Expr, body: Block): WhileStmt {
  return { kind: "while", condition, body, range: span() };
}

function block(statements: readonly Stmt[], tail: Expr | null = null): Block {
  return { statements, tail };
}

function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}

// --- Real environment ------------------------------------------------------

/** A real `V19b` root environment over an empty body. */
function realEnv(): LexicalEnvironment {
  return buildEnvironment({ body: { statements: [], tail: null } });
}

// --- Checkpoint substrate (PIC-10) -----------------------------------------

const SITE: CheckpointSite = { file: "theta.theta", line: 1, column: 1 };

/**
 * A `Checkpoint` whose `before(...)` invokes an injected callback on each await
 * — the deterministic-test substrate (PIC-10) that lands an abort at a chosen
 * checkpoint boundary without depending on JS microtask scheduling.
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

/** A no-op `Checkpoint` (production wiring — an already-resolved promise). */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

// --- Recording partial-append mutator (V4c) --------------------------------

/**
 * A `CommittedConversationMutator` that records every mutating call. The
 * ERR-8/ERR-9 non-mutation contract forbids the runtime from calling any of
 * these on the cancellation / `?`-propagation paths, so a compliant executor
 * leaves `calls` empty.
 */
class RecordingMutator implements CommittedConversationMutator {
  readonly calls: string[] = [];
  truncate(surfaceId: string): void {
    this.calls.push(`truncate:${surfaceId}`);
  }
  rewrite(surfaceId: string): void {
    this.calls.push(`rewrite:${surfaceId}`);
  }
  replace(surfaceId: string): void {
    this.calls.push(`replace:${surfaceId}`);
  }
  remove(surfaceId: string): void {
    this.calls.push(`remove:${surfaceId}`);
  }
  injectCompensatingTurn(surface: CommittedSurface): void {
    this.calls.push(`inject:${surface.id}`);
  }
}

// --- Recording effect host (the V19d boundary) -----------------------------

/** A checkpointed `Ok` result carrying the effect's value. */
function ok(value: ThetaValue): OperationResult {
  return { ok: true, value };
}

/** A checkpointed `Err` result (a non-cancel failure). */
function err(): OperationResult {
  const error: QueryError = { kind: "panic", message: "boom" };
  return { ok: false, error };
}

/**
 * A recording `StatementEvalHost` double standing in for `V19d`'s real
 * effectful hosts. It evaluates the bounded AST-expression forms the witnesses
 * need (against the REAL `V19b` environment so per-iteration bindings resolve),
 * treats `call` / `query` / `invoke` expressions as checkpointed effects, and
 * records each committed effect's ordered label.
 */
class RecordingHost implements StatementEvalHost {
  /** Ordered record of committed effects and their start/end fences. */
  readonly log: string[] = [];
  /** Ordered record of pure-expression evaluations (by a caller-set label). */
  readonly pureLog: string[] = [];
  /** How many times each callee's effect committed. */
  readonly effects: string[] = [];
  /** Per-effect override of the returned `OperationResult` (by callee name). */
  readonly results = new Map<string, OperationResult>();

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: SITE };
    }
    return null;
  }

  async runEffect(expr: Expr, env: LexicalEnvironment): Promise<OperationResult> {
    const label = this.#effectLabel(expr, env);
    // A start/end fence around a real microtask yield so a caller can witness
    // strict sequencing: an interleaved driver would show `start:1` before
    // `end:0`, a strictly-sequential one never does.
    this.log.push(`start:${label}`);
    await Promise.resolve();
    this.log.push(`end:${label}`);
    this.effects.push(label);
    return this.results.get(label) ?? ok(null);
  }

  /** Compute an effect's label: `<callee>(<first-arg-value?>)`. */
  #effectLabel(expr: Expr, env: LexicalEnvironment): string {
    if (expr.kind === "call") {
      const arg = expr.args[0];
      if (arg === undefined) {
        return expr.callee;
      }
      return `${expr.callee}:${String(this.#eval(arg, env))}`;
    }
    return expr.kind;
  }

  /** A bounded AST-expression evaluator for the witnessed forms. */
  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "number":
        return Number(expr.text);
      case "string":
        return expr.value;
      case "bool":
        return expr.value;
      case "null":
        return null;
      case "ident": {
        this.pureLog.push(`ident:${expr.name}`);
        return env.resolve(expr.name).value ?? null;
      }
      case "array":
        return expr.elements.map((e) => this.#eval(e, env));
      case "binary":
        if (expr.op === "==") {
          return valuesEqual(this.#eval(expr.left, env), this.#eval(expr.right, env));
        }
        return null;
      default:
        return null;
    }
  }
}

/** Assemble `ExecuteBodyDeps` from a host + checkpoint/signal + mutator/mode. */
function deps(opts: {
  host: StatementEvalHost;
  checkpoint?: Checkpoint;
  signal?: AbortSignal;
  mutator?: CommittedConversationMutator;
  mode?: DrivenConversationMode;
  env?: LexicalEnvironment;
  file?: string;
}): ExecuteBodyDeps {
  return {
    env: opts.env ?? realEnv(),
    host: opts.host,
    checkpoint: opts.checkpoint ?? NOOP_CHECKPOINT,
    signal: opts.signal ?? new AbortController().signal,
    mutator: opts.mutator ?? new RecordingMutator(),
    mode: opts.mode ?? "prompt",
    file: opts.file ?? "test.theta",
  };
}

// ===========================================================================
// Statement-execution driver — strictly-sequential top-to-bottom walk (cka-50).
// ===========================================================================

describe("V19c-T — statement-execution driver (cka-50, the new closure)", () => {
  it("cka-50: walks a multi-statement body top-to-bottom, each effect committing before the next is entered", async () => {
    const host = new RecordingHost();
    // Three effect statements `s0()`, `s1()`, `s2()`.
    const program = body([
      toolCallStmt("s0"),
      toolCallStmt("s1"),
      toolCallStmt("s2"),
    ]);

    await executeBody(program, deps({ host }));

    expect(
      host.effects,
      "cka-50: the body is walked top-to-bottom in source order",
    ).toEqual(["s0", "s1", "s2"]);
    expect(
      host.log,
      "cka-50: strictly sequential — each effect commits (start→end) before the next is entered, no statement runs ahead of a prior one",
    ).toEqual([
      "start:s0",
      "end:s0",
      "start:s1",
      "end:s1",
      "start:s2",
      "end:s2",
    ]);
  });

  it("cka-50: a straight-line run of pure statements evaluates every statement in order", async () => {
    const host = new RecordingHost();
    const program = body([
      exprStmt(identExpr("a")),
      exprStmt(identExpr("b")),
      exprStmt(identExpr("c")),
    ]);

    await executeBody(program, deps({ host }));

    expect(
      host.pureLog,
      "cka-50: each pure statement is evaluated once, top-to-bottom",
    ).toEqual(["ident:a", "ident:b", "ident:c"]);
  });
});

// ===========================================================================
// Control-flow statements against the real ForLoopHost / evaluateForLoop (CTRL-1).
// ===========================================================================

describe("V19c-T — control-flow through the executor at real hosts (CTRL-1 witness)", () => {
  it("CTRL-1: a `for` loop evaluates its iterand exactly once at loop entry and runs the body per element", async () => {
    const host = new RecordingHost();
    // `for x in ["a","b","c"] { record(x) }`
    const loop = forStmt(
      "x",
      arrayExpr([stringExpr("a"), stringExpr("b"), stringExpr("c")]),
      block([toolCallStmt("record", [identExpr("x")])]),
    );

    await executeBody(body([loop]), deps({ host }));

    expect(
      host.effects,
      "CTRL-1: the body runs once per snapshot element, in order, with the per-iteration `x` binding",
    ).toEqual(["record:a", "record:b", "record:c"]);
  });

  it("CTRL-1: `break` steers the real loop — iteration stops at the break", async () => {
    const host = new RecordingHost();
    // `for x in ["a","b","c"] { if x == "b" { break } record(x) }`
    const loop = forStmt(
      "x",
      arrayExpr([stringExpr("a"), stringExpr("b"), stringExpr("c")]),
      block([
        ifStmt(eqExpr(identExpr("x"), stringExpr("b")), block([{ kind: "break", range: span() }])),
        toolCallStmt("record", [identExpr("x")]),
      ]),
    );

    await executeBody(body([loop]), deps({ host }));

    expect(
      host.effects,
      "CTRL-1: `break` stops the loop, so only elements before the break are recorded",
    ).toEqual(["record:a"]);
  });

  it("CTRL-1: `continue` steers the real loop — the rest of the body is skipped for that iteration", async () => {
    const host = new RecordingHost();
    // `for x in ["a","b","c"] { if x == "b" { continue } record(x) }`
    const loop = forStmt(
      "x",
      arrayExpr([stringExpr("a"), stringExpr("b"), stringExpr("c")]),
      block([
        ifStmt(eqExpr(identExpr("x"), stringExpr("b")), block([{ kind: "continue", range: span() }])),
        toolCallStmt("record", [identExpr("x")]),
      ]),
    );

    await executeBody(body([loop]), deps({ host }));

    expect(
      host.effects,
      "CTRL-1: `continue` skips the rest of the body for the matching element only",
    ).toEqual(["record:a", "record:c"]);
  });
});

// ===========================================================================
// Tail-expression / empty-body final value (FN-4/FN-5, RET-1/RET-2/RET-3).
// ===========================================================================

describe("V19c-T — final value at the executor's FunctionResult seam (FN-5 witness)", () => {
  it("FN-5: a body ending in a tail expression yields that expression's value", async () => {
    const host = new RecordingHost();
    const program = body([], numberExpr("42"));

    const r = await executeBody(program, deps({ host }));

    expect(r.outcome, "FN-5: a body that completes on the success path").toBe("success");
    expect(r.result.present, "FN-5: a final value is present on the success path").toBe(true);
    expect(r.result.value, "FN-5: the final value is the tail expression's value").toBe(42);
  });

  it("FN-5: a statement-terminated (no-tail) body yields the literal `null`", async () => {
    const host = new RecordingHost();
    // A body whose last form is a statement, not a tail expression.
    const program = body([toolCallStmt("s0")], null);

    const r = await executeBody(program, deps({ host }));

    expect(r.outcome, "FN-5: the body completes on the success path").toBe("success");
    expect(r.result.present, "FN-5: a final value is present on the success path").toBe(true);
    expect(r.result.value, "FN-5: a statement-terminated body yields the literal null").toBeNull();
  });

  it("FN-5: an empty body yields the literal `null`", async () => {
    const host = new RecordingHost();
    const program = body([], null);

    const r = await executeBody(program, deps({ host }));

    expect(r.outcome, "FN-5: an empty body completes on the success path").toBe("success");
    expect(r.result.present, "FN-5: a final value is present for an empty body").toBe(true);
    expect(r.result.value, "FN-5: an empty body yields the literal null").toBeNull();
  });

  it("RET-1: an explicit `return expr` short-circuits to its operand", async () => {
    const host = new RecordingHost();
    // `return 7` followed by an effect statement that must NOT run.
    const program = body([returnStmt(numberExpr("7")), toolCallStmt("after")], numberExpr("99"));

    const r = await executeBody(program, deps({ host }));

    expect(r.outcome, "RET-1: a `return` completes on the success path").toBe("success");
    expect(r.result.value, "RET-1: the final value is the `return` operand, not the tail").toBe(7);
    expect(
      host.effects,
      "RET-1: `return` short-circuits — statements after it do not run",
    ).toEqual([]);
  });
});

// ===========================================================================
// Five-site checkpoint gating on the real runCancellableSequence (cka-47 witness).
// ===========================================================================

describe("V19c-T — five-site checkpoint gating on the real runCancellableSequence (cka-47 witness)", () => {
  it("cka-47: a signal flipped mid-body preempts at the next checkpointed sub-expression", async () => {
    const host = new RecordingHost();
    const controller = new AbortController();
    // Abort at the SECOND checkpoint `before(...)` — after `s0` committed but
    // before `s1` is dispatched.
    const checkpoint = new ScriptedCheckpoint((call) => {
      if (call === 2) {
        controller.abort();
      }
    });
    const program = body([toolCallStmt("s0"), toolCallStmt("s1")]);

    const r = await executeBody(
      program,
      deps({ host, checkpoint, signal: controller.signal }),
    );

    expect(
      host.effects,
      "cka-47: `s0` committed; `s1` is preempted at its pre-dispatch checkpoint and never runs",
    ).toEqual(["s0"]);
    expect(r.outcome, "cka-47: a mid-body abort surfaces as the cancel terminal outcome").toBe(
      "cancel",
    );
  });

  it("cka-47: a straight-line statement boundary is not a checkpoint — a pre-aborted pure run completes", async () => {
    const host = new RecordingHost();
    const controller = new AbortController();
    controller.abort();
    // A straight-line run of pure statements with the signal already aborted:
    // no checkpointed sub-expression, so the run completes regardless of abort.
    const program = body([
      exprStmt(identExpr("a")),
      exprStmt(identExpr("b")),
    ]);

    const r = await executeBody(program, deps({ host, signal: controller.signal }));

    expect(
      host.pureLog,
      "cka-47: statement boundaries are not checkpoints — a straight-line pure run completes despite the abort",
    ).toEqual(["ident:a", "ident:b"]);
    expect(r.outcome, "cka-47: a straight-line run that never reaches a checkpoint completes success").toBe(
      "success",
    );
  });
});

// ===========================================================================
// Terminal-outcome production and mid-stream non-mutation (ERR-8 … ERR-12 witness).
// ===========================================================================

describe("V19c-T — terminal-outcome production at real hosts (ERR-8 … ERR-12 witness)", () => {
  it("ERR terminal outcome: a body whose effects all succeed drives to the success outcome", async () => {
    const host = new RecordingHost();
    const program = body([toolCallStmt("s0")], numberExpr("1"));

    const r = await executeBody(program, deps({ host }));

    expect(host.effects, "success: the body's effect committed").toEqual(["s0"]);
    expect(r.outcome, "success: an all-`Ok` body drives to the success terminal outcome").toBe(
      "success",
    );
    expect(r.result.present, "success: a final value is present on the success path").toBe(true);
  });

  it("ERR terminal outcome: an `Err`-returning effect drives to the fail outcome with no final value", async () => {
    const host = new RecordingHost();
    host.results.set("s0", err());
    const program = body([toolCallStmt("s0")], numberExpr("1"));

    const r = await executeBody(program, deps({ host }));

    expect(host.effects, "fail: the failing effect was reached and committed").toEqual(["s0"]);
    expect(r.outcome, "fail: an `Err`-returning effect drives to the fail terminal outcome").toBe(
      "fail",
    );
    expect(r.result.present, "fail: no final value flows on the failure path (FN-5)").toBe(false);
  });

  it("ERR-8/ERR-9/ERR-10: a mid-stream cancellation mutates no committed surface and injects no compensating turn", async () => {
    const host = new RecordingHost();
    const mutator = new RecordingMutator();
    const controller = new AbortController();
    const checkpoint = new ScriptedCheckpoint((call) => {
      if (call === 2) {
        controller.abort();
      }
    });
    const program = body([toolCallStmt("s0"), toolCallStmt("s1")]);

    const r = await executeBody(
      program,
      deps({ host, checkpoint, signal: controller.signal, mutator }),
    );

    expect(host.effects, "ERR-10: the body was driven to the mid-stream cancellation").toEqual([
      "s0",
    ]);
    expect(r.outcome, "ERR-10: a mid-stream cancellation drives to the cancel terminal outcome").toBe(
      "cancel",
    );
    expect(
      mutator.calls,
      "ERR-8/ERR-9: no committed surface is truncated/rewritten/replaced/removed and no compensating turn is injected",
    ).toEqual([]);
  });

  it("ERR-12: the non-mutation obligation holds identically inside a subagent-mode body", async () => {
    const host = new RecordingHost();
    const mutator = new RecordingMutator();
    const controller = new AbortController();
    const checkpoint = new ScriptedCheckpoint((call) => {
      if (call === 2) {
        controller.abort();
      }
    });
    const program = body([toolCallStmt("s0"), toolCallStmt("s1")]);

    const r = await executeBody(
      program,
      deps({ host, checkpoint, signal: controller.signal, mutator, mode: "subagent" }),
    );

    expect(host.effects, "ERR-12: the subagent-mode body was driven to the cancellation").toEqual([
      "s0",
    ]);
    expect(r.outcome, "ERR-12: a subagent-mode mid-stream cancellation drives to cancel").toBe(
      "cancel",
    );
    expect(
      mutator.calls,
      "ERR-12: the non-mutation obligation holds inside a subagent theta too",
    ).toEqual([]);
  });
});

// ===========================================================================
// Core-execution deficiency fix — `?` (try) / `match` dispatch-through and the
// `?`-propagation flow (ERR-18 / expressions.md §`?` operator / §`match`).
// ===========================================================================

import { makeErr, makeOk } from "../src/runtime/value";
import type {
  MatchArmNode,
  MatchExpr,
  PatternNode,
  TryExpr,
} from "../src/parser/theta-document";

/** A `?`-wrapped operand expression. */
function tryExpr(operand: Expr): TryExpr {
  return { kind: "try", operand, range: span() };
}

/** An untyped `@`-query expression. */
function queryExpr(template: string): Expr {
  return { kind: "query", schema: null, template, range: span() };
}

/** A `match` expression node. */
function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

function objectExpr(fields: readonly { name: string; value: Expr }[]): Expr {
  return { kind: "object", typeName: null, fields, range: span() };
}

/**
 * A `StatementEvalHost` double whose `runEffect` returns a scripted
 * `OperationResult` per callee, and whose `evaluatePure` evaluates the bounded
 * literal / ident / member / object forms the try/match witnesses need against
 * the real `V19b` environment.
 */
class CoreExecHost implements StatementEvalHost {
  readonly results = new Map<string, OperationResult>();

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "number":
        return Number(expr.text);
      case "string":
      case "bool":
        return expr.value;
      case "null":
        return null;
      case "ident":
        return env.resolve(expr.name).value ?? null;
      case "member": {
        const target = this.evaluatePure(expr.target, env);
        return target === null
          ? null
          : (target as { readonly [k: string]: ThetaValue })[expr.field] ?? null;
      }
      case "object": {
        const obj: Record<string, ThetaValue> = {};
        for (const f of expr.fields) {
          obj[f.name] = this.evaluatePure(f.value, env);
        }
        return obj;
      }
      default:
        return null;
    }
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: { file: "theta.theta", line: 1, column: 1 } };
    }
    return null;
  }

  runEffect(expr: Expr): Promise<OperationResult> {
    const key = expr.kind === "call" ? expr.callee : expr.kind;
    return Promise.resolve(this.results.get(key) ?? { ok: true, value: null });
  }
}

describe("core-exec — `?` (try) dispatch-through and unwrap/propagate", () => {
  it("`let s = call()?` dispatches the real effect and unwraps Ok(v) to v", async () => {
    const host = new CoreExecHost();
    // The theta-callable call effect yields the callee's top-level Result Ok(v).
    host.results.set("sentiment", { ok: true, value: makeOk({ label: "pos" }) });
    const program = body(
      [{ kind: "let", name: "s", mutable: false, annotation: null, init: tryExpr(callExpr("sentiment")), range: span() }],
      identExpr("s"),
    );

    const r = await executeBody(program, deps({ host }));

    expect(r.outcome, "the body succeeds — `?` unwrapped Ok").toBe("success");
    expect(r.result.value, "`?` bound the unwrapped Ok payload, not null").toEqual({ label: "pos" });
  });

  it("`call()?` over an Err propagates — the body fails carrying the Err payload (ERR-18)", async () => {
    const host = new CoreExecHost();
    host.results.set("sentiment", { ok: true, value: makeErr({ kind: "panic", message: "boom" }) });
    const program = body(
      [{ kind: "let", name: "s", mutable: false, annotation: null, init: tryExpr(callExpr("sentiment")), range: span() }],
      identExpr("s"),
    );

    const r = await executeBody(program, deps({ host }));

    expect(r.outcome, "`?` over Err propagates → fail terminal outcome").toBe("fail");
    expect(r.result.present, "no FN-5 final value flows on the propagation path").toBe(false);
    expect(r.error, "the propagated Err payload is carried for the caller's Err envelope").toEqual({
      kind: "panic",
      message: "boom",
    });
  });

  it("a query's plain terminating value is normalised to Ok before `?` unwraps it", async () => {
    const host = new CoreExecHost();
    // An (untyped) query effect yields a plain string value; `?` must see Ok(text).
    host.results.set("query", { ok: true, value: "answer" });
    const program = body(
      [{ kind: "let", name: "a", mutable: false, annotation: null, init: tryExpr(queryExpr("q")), range: span() }],
      identExpr("a"),
    );

    const r = await executeBody(program, deps({ host }));

    expect(r.outcome).toBe("success");
    expect(r.result.value, "`?` over a normalised Ok(text) unwraps to the text").toBe("answer");
  });

  it("a non-cancel effect Err under `match` is surfaced as Err(e) for the arms to catch", async () => {
    const host = new CoreExecHost();
    // The query effect FAILS (validation) — the executor surfaces Err(queryError)
    // as the match scrutinee.
    host.results.set("query", {
      ok: false,
      error: { kind: "validation", cause: "schema_validation" } as unknown as QueryError,
    });
    const arms: MatchArmNode[] = [
      { pattern: { kind: "constructor", ctor: "Ok", inner: { kind: "identifier", name: "t" } }, body: identExpr("t") },
      {
        pattern: {
          kind: "constructor",
          ctor: "Err",
          inner: {
            kind: "object",
            typeName: "QueryError",
            fields: [{ name: "cause", pattern: { kind: "literal", value: "schema_validation" } }],
          },
        },
        body: objectExpr([{ name: "recovered", value: boolExpr(true) }]),
      },
      { pattern: { kind: "constructor", ctor: "Err", inner: { kind: "wildcard" } }, body: nullLit() },
    ];
    const program = body(
      [{ kind: "let", name: "o", mutable: false, annotation: null, init: matchExpr(queryExpr("q"), arms), range: span() }],
      identExpr("o"),
    );

    const r = await executeBody(program, deps({ host }));

    expect(r.outcome, "match caught the Err arm — body succeeds").toBe("success");
    expect(r.result.value, "the matched Err arm's object-literal body value").toEqual({ recovered: true });
  });

  it("`match call() { Ok(t) => t.field }` dispatches the effect, binds the pattern var, and evaluates the arm body", async () => {
    const host = new CoreExecHost();
    host.results.set("classify", { ok: true, value: makeOk({ category: "bug" }) });
    const arms: MatchArmNode[] = [
      {
        pattern: { kind: "constructor", ctor: "Ok", inner: { kind: "identifier", name: "t" } },
        body: { kind: "member", target: identExpr("t"), field: "category", range: span() },
      },
      { pattern: { kind: "wildcard" }, body: nullLit() },
    ];
    const program = body([], matchExpr(callExpr("classify"), arms));

    const r = await executeBody(program, deps({ host }));

    expect(r.outcome).toBe("success");
    expect(r.result.value, "the Ok(t) arm bound t and read t.category").toBe("bug");
  });
});

/** A `null` literal expression. */
function nullLit(): Expr {
  return { kind: "null", range: span() };
}

// ===========================================================================
// STL-6 — an unhandled non-cancel effect `Err` in tail/statement position
// surfaces as that error on the fail outcome, NEVER a fabricated `cancelled`.
// (errors-and-results.md §Terminal outcomes / ERR-19; subagent-toolloop.md STL-6)
// ===========================================================================

describe("STL-6 — unhandled-tail effect Err carries its own error on the fail outcome", () => {
  it("a bare tail effect Err (no `?`, no `match`) drives to fail carrying the effect's own error", async () => {
    const host = new RecordingHost();
    // A ceiling-#2 `tool_loop_exhausted` breach returned by the effect host as a
    // non-cancel `Err` (the untyped-query exhaustion arm of runQueryEffect).
    const exhausted = {
      kind: "tool_loop_exhausted",
      rounds: 0,
      last_tool_name: null,
      message: "tool-call loop exhausted after 0 rounds",
    } as unknown as QueryError;
    host.results.set("q", { ok: false, error: exhausted });
    // A bare tail effect statement: unhandled, not `?`-propagated, not caught.
    const program = body([toolCallStmt("q")]);

    const r = await executeBody(program, deps({ host }));

    expect(r.outcome, "an unhandled non-cancel effect Err drives to the fail terminal outcome").toBe(
      "fail",
    );
    expect(
      r.error,
      "STL-6: the effect's own tool_loop_exhausted error is carried through fail — NOT a fabricated cancelled",
    ).toEqual(exhausted);
    expect(
      r.result.present,
      "no FN-5 final value flows on the fail path",
    ).toBe(false);
  });

  it("holds identically in subagent mode (the mode a real subagent invoke drives)", async () => {
    const host = new RecordingHost();
    const exhausted = {
      kind: "tool_loop_exhausted",
      rounds: 0,
      last_tool_name: null,
    } as unknown as QueryError;
    host.results.set("q", { ok: false, error: exhausted });
    const program = body([toolCallStmt("q")]);

    const r = await executeBody(program, deps({ host, mode: "subagent" }));

    expect(r.outcome).toBe("fail");
    expect(
      r.error,
      "STL-6: the subagent-mode fail carries the real error, not a fabricated cancelled",
    ).toEqual(exhausted);
  });
});

// ===========================================================================
// CANCEL-1 — the loop-iter cancellation checkpoint is wired into the executor's
// `for` / `while` loops (cancellation.md §Granularity; cancellation.md CANCEL-1).
// ===========================================================================

describe("CANCEL-1 — the loop-iter cancellation checkpoint fires per iteration and cancels on abort", () => {
  it("fires exactly one `loop-iter` checkpoint immediately before each `for` iteration", async () => {
    const host = new RecordingHost();
    const kinds: CheckpointKind[] = [];
    const checkpoint = new ScriptedCheckpoint((_call, kind) => {
      kinds.push(kind);
    });
    const program = body([
      forStmt(
        "x",
        arrayExpr([numberExpr("1"), numberExpr("2"), numberExpr("3")]),
        block([exprStmt(identExpr("x"))]),
      ),
    ]);

    const r = await executeBody(program, deps({ host, checkpoint }));

    expect(
      kinds,
      "one loop-iter checkpoint fired per element, before that iteration's body ran",
    ).toEqual(["loop-iter", "loop-iter", "loop-iter"]);
    expect(host.pureLog, "the body ran once per element").toEqual([
      "ident:x",
      "ident:x",
      "ident:x",
    ]);
    expect(r.outcome).toBe("success");
  });

  it("an abort observed at a `for` loop-iter checkpoint cancels the loop before the next iteration", async () => {
    const host = new RecordingHost();
    const controller = new AbortController();
    // Abort at the 2nd loop-iter checkpoint — after iteration 1's body ran,
    // before iteration 2 (the body is pure, so every checkpoint is a loop-iter).
    const checkpoint = new ScriptedCheckpoint((call, kind) => {
      if (kind === "loop-iter" && call === 2) {
        controller.abort();
      }
    });
    const program = body([
      forStmt(
        "x",
        arrayExpr([numberExpr("1"), numberExpr("2"), numberExpr("3")]),
        block([exprStmt(identExpr("x"))]),
      ),
    ]);

    const r = await executeBody(program, deps({ host, checkpoint, signal: controller.signal }));

    expect(
      host.pureLog,
      "only iteration 1's body ran; iteration 2 was preempted at its loop-iter checkpoint",
    ).toEqual(["ident:x"]);
    expect(r.outcome, "a loop-iter abort drives to the cancel terminal outcome").toBe("cancel");
  });

  it("fires one `loop-iter` checkpoint per `while` condition-check and stops cleanly", async () => {
    const host = new RecordingHost();
    const kinds: CheckpointKind[] = [];
    const checkpoint = new ScriptedCheckpoint((_call, kind) => {
      kinds.push(kind);
    });
    // `let mut go = true; while go == true { go = false }` — one body run, two
    // loop-iter checkpoints (the second condition-check exits the loop).
    const program = body([
      { kind: "let", name: "go", mutable: true, annotation: null, init: boolExpr(true), range: span() },
      whileStmt(
        eqExpr(identExpr("go"), boolExpr(true)),
        block([{ kind: "reassign", target: "go", op: "=", value: boolExpr(false), range: span() }]),
      ),
    ]);

    const r = await executeBody(program, deps({ host, checkpoint }));

    expect(
      kinds,
      "one loop-iter checkpoint per while condition-check (2: run once, then exit)",
    ).toEqual(["loop-iter", "loop-iter"]);
    expect(r.outcome).toBe("success");
  });

  it("an abort observed at a `while` loop-iter checkpoint cancels the loop", async () => {
    const host = new RecordingHost();
    const controller = new AbortController();
    // `while true { x }` — an otherwise-unbounded compute loop; abort at the 2nd
    // loop-iter checkpoint is the only thing that lands (the spec's motivating
    // case: no genuine await in the body).
    const checkpoint = new ScriptedCheckpoint((call, kind) => {
      if (kind === "loop-iter" && call === 2) {
        controller.abort();
      }
    });
    const program = body([
      { kind: "let", name: "x", mutable: false, annotation: null, init: numberExpr("0"), range: span() },
      whileStmt(boolExpr(true), block([exprStmt(identExpr("x"))])),
    ]);

    const r = await executeBody(program, deps({ host, checkpoint, signal: controller.signal }));

    expect(
      host.pureLog,
      "iteration 1's body ran; the loop was cancelled at the 2nd loop-iter checkpoint",
    ).toEqual(["ident:x"]);
    expect(r.outcome, "a while loop-iter abort drives to the cancel terminal outcome").toBe("cancel");
  });
});

// ===========================================================================
// RFC 0002 / Finding #3 — the pre-evaluation of a Pi-tool call's computed
// field values (`preEvaluateToolArgs`) is GATED on the callee classifying as a
// Pi tool. A `.theta`-callable call routes through the invoke trampoline
// (`runToolCallEffect`), which ignores `evaluatedToolArgs` and re-lowers its
// argument itself; pre-evaluating it in the executor would dispatch effectful
// field values twice (a latent double-eval). The executor must therefore NOT
// pre-evaluate a call the host classifies as `.theta`-callable.
// ===========================================================================

/**
 * A `StatementEvalHost` double that records every dispatched effect (by callee)
 * and the `evaluatedToolArgs` each `runEffect` was handed, and classifies calls
 * by a configured callee→kind map. `runEffect` does NOT itself lower arguments
 * — exactly like the invoke trampoline's opacity to `evaluatedToolArgs` — so a
 * nested field effect is dispatched only if the EXECUTOR pre-evaluates it.
 */
class ClassifyingHost implements StatementEvalHost {
  readonly dispatched: string[] = [];
  readonly argsSeen: (Record<string, ThetaValue> | undefined)[] = [];
  readonly #kinds: ReadonlyMap<string, "pi-tool" | "theta-callable">;

  constructor(kinds: ReadonlyMap<string, "pi-tool" | "theta-callable">) {
    this.#kinds = kinds;
  }

  evaluatePure(expr: Expr): ThetaValue {
    if (expr.kind === "string") {
      return expr.value;
    }
    if (expr.kind === "number") {
      return Number(expr.text);
    }
    return null;
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: SITE };
    }
    return null;
  }

  classifyCall(expr: CallExpr): "pi-tool" | "theta-callable" {
    return this.#kinds.get(expr.callee) ?? "pi-tool";
  }

  runEffect(
    expr: Expr,
    _env: LexicalEnvironment,
    evaluatedToolArgs?: Record<string, ThetaValue>,
  ): Promise<OperationResult> {
    if (expr.kind === "call") {
      this.dispatched.push(expr.callee);
      this.argsSeen.push(evaluatedToolArgs);
    }
    return Promise.resolve(ok(null));
  }
}

describe("RFC 0002 / Finding #3 — pre-evaluation gated on the Pi-tool callee kind", () => {
  it("a `.theta`-callable call with an object-literal arg is NOT pre-evaluated (no field double-dispatch)", async () => {
    // `summarise({ x: probe({}) })` — `summarise` is a `.theta`-callable, its
    // field `x` is a nested Pi-tool call `probe`.
    const host = new ClassifyingHost(
      new Map([
        ["summarise", "theta-callable"],
        ["probe", "pi-tool"],
      ]),
    );
    const program = body([
      toolCallStmt("summarise", [objectExpr([{ name: "x", value: callExpr("probe", [objectExpr([])]) }])]),
    ]);

    await executeBody(program, deps({ host }));

    // The nested `probe` field effect must NOT be dispatched by the executor's
    // pre-evaluation — the invoke trampoline owns the `.theta`-callable's
    // argument lowering. Only the outer `.theta`-callable dispatched here.
    expect(host.dispatched, "probe was not pre-evaluated for a .theta-callable call").toEqual([
      "summarise",
    ]);
    // And the `.theta`-callable `runEffect` received no pre-evaluated args.
    expect(host.argsSeen, "a .theta-callable call carries no evaluatedToolArgs").toEqual([undefined]);
  });

  it("a Pi-tool call with the SAME object-literal arg IS pre-evaluated (field dispatched, args threaded)", async () => {
    // `store({ x: probe({}) })` — `store` is a Pi tool: its computed field value
    // `probe({})` evaluates left-to-right before dispatch, so `probe` dispatches
    // during pre-evaluation and the concrete args reach `store`'s `runEffect`.
    const host = new ClassifyingHost(
      new Map<string, "pi-tool" | "theta-callable">([
        ["store", "pi-tool"],
        ["probe", "pi-tool"],
      ]),
    );
    const program = body([
      toolCallStmt("store", [objectExpr([{ name: "x", value: callExpr("probe", [objectExpr([])]) }])]),
    ]);

    await executeBody(program, deps({ host }));

    expect(host.dispatched, "the Pi-tool field effect dispatched before the outer tool").toEqual([
      "probe",
      "store",
    ]);
    // `probe`'s own empty object-literal arg pre-evaluated to `{}`; `store`
    // received the pre-evaluated field object, `x` bound to probe's returned
    // value (`ok(null)` → the unwrapped `null`).
    expect(host.argsSeen[0], "the nested Pi-tool field effect got its own pre-evaluated args").toEqual({});
    expect(host.argsSeen[1], "the outer Pi tool receives the pre-evaluated field object").toEqual({
      x: null,
    });
  });
});
