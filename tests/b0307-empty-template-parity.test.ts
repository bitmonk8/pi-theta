import { describe, expect, it } from "vitest";
import { executeBody, type ExecuteBodyDeps } from "../src/runtime/statement-executor";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import { buildEnvironment, type LexicalEnvironment } from "../src/runtime/lexical-environment";
import type { Checkpoint, CheckpointSite } from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import type { ThetaValue } from "../src/runtime/value";
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
import { makeOk, type ResultValue } from "../src/runtime/value";
import type {
  Expr,
  MatchArmNode,
  MatchExpr,
  QueryExpr,
  ThetaBody,
  Stmt,
} from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// Bug 0307 PART 2 — empty_template parity: the empty-rendered-template query
// failure must ride the SAME consumption-time disposition as every other
// QueryError variant, so its disposition depends on POSITION, not on the
// variant.
//
// Spec / adjudication (.pi/tmp/fixes/0307-design.md "PART 2"; docs/bugs/0307-…md
// §Mechanism): today `runQueryEffect`'s empty_template arm returns
// `{ ok:true, value: makeErr(emptyTemplate) }` — so an empty bare-tail `@""`
// binds and succeeds, while a bare-tail `tool_loop_exhausted` fails. The fix
// makes empty_template ride `{ ok:false, error }` like the others, so a bare
// tail (terminal position) fails uniformly and a value position binds — no
// per-variant special case (QRY-8 / error-model.md consumption-time rule).
//
// The parity reds are the FAILURE behaviour, not a compile / fixture / harness
// error: the real `createEffectfulStatementHost` is driven with a `resolveQuery`
// whose `renderedText` is empty, triggering the real empty_template
// short-circuit. Fix version placeholder: 0.298.0 (no version invented here).

// --- AST construction helpers ----------------------------------------------

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}

function queryExpr(template: string): QueryExpr {
  return { kind: "query", schema: null, template, range: span() };
}

function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}

/** The two-arm result `match` the recovery shape uses (Err arm first). */
function errFirstMatch(scrutinee: Expr): MatchExpr {
  const arms: MatchArmNode[] = [
    { pattern: { kind: "constructor", ctor: "Err", inner: { kind: "wildcard" } }, body: stringExpr("HANDLED") },
    { pattern: { kind: "constructor", ctor: "Ok", inner: { kind: "wildcard" } }, body: stringExpr("OKGOT") },
  ];
  return matchExpr(scrutinee, arms);
}

/** A real root environment over an empty body. */
function realEnv(): LexicalEnvironment {
  return buildEnvironment({ body: { statements: [], tail: null } });
}

const SITE: CheckpointSite = { file: "theta.theta", line: 1, column: 1 };

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

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

/**
 * A scripted `QueryModelDriver`. The empty_template short-circuit resolves
 * BEFORE any provider turn, so no method here is reached — it exists only to
 * satisfy the `QueryHostDispatch` shape the real host consumes.
 */
class UnreachedQueryModel implements QueryModelDriver {
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    return Promise.resolve({ kind: "text", text: "" });
  }
  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: null });
  }
}

class NoopToolCall implements CodeSideToolCall {
  readonly toolName = "noop";
  readonly committed: readonly CommittedSideEffect[] = [];
  dispatch(): Promise<AgentToolResultEnvelope> {
    return Promise.resolve({ content: [{ type: "text", text: "" }] });
  }
}

class NoopInvokeChild implements InvokeChild {
  readonly calleePath = "./noop.theta";
  readonly committed: readonly CommittedSideEffect[] = [];
  drive(): Promise<ResultValue> {
    return Promise.resolve(makeOk(null));
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
    thetaSlashName: "demo",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}

/**
 * Assemble the real host + real executor deps. `resolveQuery` returns a
 * `renderedText` of `""`, driving the real empty-rendered-template short-circuit
 * (`renderEmptyShortCircuit`) inside `runQueryEffect`, so both witnesses
 * exercise the empty_template arm exactly as production does.
 */
function harness(): ExecuteBodyDeps {
  const model = new UnreachedQueryModel();
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    sink: NOOP_SINK,
    file: "theta.theta",
    evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
      switch (expr.kind) {
        case "string":
        case "bool":
          return expr.value;
        case "number":
          return Number(expr.text);
        case "null":
          return null;
        case "ident":
          return env.resolve(expr.name).value ?? null;
        default:
          return null;
      }
    },
    resolveQuery(): QueryHostDispatch {
      return { renderedText: "", typed: false, model, config: queryConfig() };
    },
    resolveToolCall(): CodeSideToolCall {
      return new NoopToolCall();
    },
    resolveInvoke(): InvokeChild {
      return new NoopInvokeChild();
    },
  };
  return {
    env: realEnv(),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new RecordingMutator(),
    mode: "prompt" as DrivenConversationMode,
    file: "test.theta",
  };
}

// ===========================================================================
// W4 — empty_template parity across the two positions.
// ===========================================================================

describe("bug 0307 W4 — empty_template rides the uniform consumption-time disposition", () => {
  it("a bare tail `@\"\"` (empty template) drives to fail, uniform with a bare-tail tool_loop_exhausted", async () => {
    // WHY: the design's PART 2 makes empty_template ride `{ ok:false, error }`
    // like every other QueryError variant, so a bare tail (terminal position)
    // fails uniformly. Today it rides `{ ok:true, value: makeErr }` and a bare
    // tail SUCCEEDS — the position-independent asymmetry the bug reports. RED
    // now (success); GREEN after the fix (0.298.0).
    const program = body([], queryExpr(""));

    const r = await executeBody(program, harness());

    expect(
      r.outcome,
      "W4: a bare-tail empty-template query is unhandled at a terminal position — fail",
    ).toBe("fail");
  });

  it("a value-position `let r = @\"\"` then `match r { Err(_)=>… }` binds and recovers", async () => {
    // WHY: the companion direction — a value position binds the empty_template
    // Err so the downstream `match` recovers. This holds today (empty_template
    // already rides `ok:true`, binding at the let) and MUST keep holding after
    // the fix (value positions bind via the `!atTerminal` branch → makeErr).
    // It locks the bind direction so the PART 2 change cannot regress it.
    const program = body([letStmt("r", queryExpr(""))], errFirstMatch(identExpr("r")));

    const r = await executeBody(program, harness());

    expect(
      r.outcome,
      "W4: a let-bound-then-matched empty-template query Err is handled — success",
    ).toBe("success");
    expect(
      r.result.value,
      "W4: the match took its Err arm, recovering the empty-template failure",
    ).toBe("HANDLED");
  });
});
