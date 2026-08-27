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
import type { Checkpoint, CheckpointSite } from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import type { ResultValue, ThetaValue } from "../src/runtime/value";
import type { QueryError } from "../src/runtime/query-error";
import type {
  Expr,
  MatchArmNode,
  MatchExpr,
  ThetaBody,
  Stmt,
} from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// Bug 0307 — a value-position query-effect failure (`let r = @`…``, no `?`)
// must BIND `Err(QueryError)` so the author's downstream `match r` handler can
// run; it currently ABORTS the whole body at the bind site instead.
//
// Spec / adjudication (docs/bugs/0307-…md §Expected; .pi/tmp/fixes/0307-design.md
// "Parent adjudication"):
//   - QRY-8 (docs/spec_topics/query/query-failure-and-repair.md:9): "A query
//     never throws. Both forms return a `Result` … carrying a `QueryError` on
//     failure." Handledness is judged AT CONSUMPTION — a query effect in ANY
//     value position evaluates to a Result VALUE and never aborts at the effect
//     site.
//   - error-model.md (docs/spec_topics/errors-and-results/error-model.md:10):
//     an `Err`-class breach reaches the *fail* arm "only when the resulting
//     `Err` is unhandled — propagated via `?` or returned, not consumed by a
//     caller `match` and not discarded via `let _ = …`". A `let`-bound query
//     Err consumed by the next statement's `match` is NOT unhandled.
//
// Mechanism (statement-executor.ts): `evalExpr`'s checkpointed-effect arm lowers
// a non-cancel query failure to `{ flow: "fail", error }`, which `terminalFlow`
// turns into the body's terminal `Err`. That arm serves every value position
// (let-init, array element, ctor arg, …) as well as the true terminal positions.
// `evalAsResult` (the `?`-operand / `match`-scrutinee route) already binds the
// same failure as `Err(...)`. The fix makes value positions bind and reserves
// `fail` for terminal positions; these witnesses lock that behaviour.
//
// These reds are the FAILURE behaviour, not a compile error, a missing fixture,
// or a harness throw: the scripted host returns a real `{ ok:false, error }`
// query failure and the executor is driven to the value-position abort. The fix
// version placeholder used below is 0.298.0 (no version invented here).

// --- AST construction helpers ----------------------------------------------

/** A throwaway 1:1–1:2 span for hand-built AST nodes. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}

function arrayExpr(elements: readonly Expr[]): Expr {
  return { kind: "array", elements, range: span() };
}

/** An untyped `@`-query expression. */
function queryExpr(template: string): Expr {
  return { kind: "query", schema: null, template, range: span() };
}

/** A `match` expression node. */
function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

/** A `let <name> = <init>` statement (immutable, unannotated). */
function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

/** A `return <operand>` statement. */
function returnStmt(operand: Expr | null): Stmt {
  return { kind: "return", operand, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}

/** The two-arm result `match` the bug's recovery shape uses. */
function okErrMatch(scrutinee: Expr): MatchExpr {
  const arms: MatchArmNode[] = [
    { pattern: { kind: "constructor", ctor: "Ok", inner: { kind: "wildcard" } }, body: stringExpr("OKGOT") },
    { pattern: { kind: "constructor", ctor: "Err", inner: { kind: "wildcard" } }, body: stringExpr("HANDLED") },
  ];
  return matchExpr(scrutinee, arms);
}

// --- Real environment ------------------------------------------------------

/** A real root environment over an empty body. */
function realEnv(): LexicalEnvironment {
  return buildEnvironment({ body: { statements: [], tail: null } });
}

const SITE: CheckpointSite = { file: "theta.theta", line: 1, column: 1 };

/** A no-op `Checkpoint` (an already-resolved promise). */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A recording `CommittedConversationMutator` (unused by these witnesses). */
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
 * A `StatementEvalHost` double whose `runEffect` returns a scripted
 * `OperationResult` keyed by the effect expression's `kind` (a `query` keys on
 * `"query"`) / a call's callee, and whose `evaluatePure` evaluates the bounded
 * literal / ident forms the witnesses need against the real environment. The
 * failing query is modelled as `{ ok:false, error: <tool_loop_exhausted> }` —
 * exactly what `runQueryEffect` feeds `evalExpr`'s effect arm for that variant.
 */
class ScriptedHost implements StatementEvalHost {
  readonly results = new Map<string, OperationResult>();

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
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: SITE };
    }
    return null;
  }

  runEffect(expr: Expr): Promise<OperationResult> {
    const key = expr.kind === "call" ? expr.callee : expr.kind;
    return Promise.resolve(this.results.get(key) ?? { ok: true, value: null });
  }
}

/** Assemble `ExecuteBodyDeps` from a host. */
function deps(host: StatementEvalHost): ExecuteBodyDeps {
  return {
    env: realEnv(),
    host,
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new RecordingMutator(),
    mode: "prompt" as DrivenConversationMode,
    file: "test.theta",
  };
}

/** The ceiling-#2 `tool_loop_exhausted` breach the bug's live probe fires. */
function exhaustedError(): QueryError {
  return {
    kind: "tool_loop_exhausted",
    rounds: 0,
    last_tool_name: null,
    message: "tool-call loop exhausted after 0 rounds",
  } as unknown as QueryError;
}

// ===========================================================================
// W1 — the core bug: a `let`-bound query failure is CONSUMED by the next
// statement's `match`, so it must bind and the `Err` arm must run.
// ===========================================================================

describe("bug 0307 W1 — a let-bound query Err is bound, not aborted, so a downstream match recovers", () => {
  it("`let r = @`q`` (fail) then `match r { Ok(_)=>…, Err(_)=>… }` binds the Err and takes the Err arm", async () => {
    // WHY: QRY-8 + error-model.md:10 — the query returns a `Result` value and
    // its `Err` is consumed by the `match` one statement later, so it is
    // handled: the body must succeed with the recovery arm's value. Today the
    // let-init aborts the body (outcome "fail"); after the fix (0.298.0) the let
    // binds `Err(tool_loop_exhausted)` and the `match` takes its `Err` arm.
    const host = new ScriptedHost();
    host.results.set("query", { ok: false, error: exhaustedError() });
    const program = body([letStmt("r", queryExpr("q"))], okErrMatch(identExpr("r")));

    const r = await executeBody(program, deps(host));

    expect(
      r.outcome,
      "W1: a let-bound-then-matched query Err is handled — the body succeeds",
    ).toBe("success");
    expect(
      r.result.value,
      "W1: the match took its Err arm, so the final value is the recovery arm value",
    ).toBe("HANDLED");
  });
});

// ===========================================================================
// W2 — ANY value position, not only a `let` init: a failing query effect nested
// in a composite value must bind as `Err(...)`, not abort the body.
// ===========================================================================

describe("bug 0307 W2 — a failing query effect in a composite value position binds the Err", () => {
  it("`let r = [@`q`]` (fail) then tail `r` binds an array whose element carries the Err", async () => {
    // WHY: the design's `evalExpr` effect arm serves array elements too (the
    // recursive `evalExpr` composite decomposition), so an array element query
    // failure must bind `Err(...)` as the element value rather than aborting.
    // Today the array-element effect fails and the let-init aborts (outcome
    // "fail"); after the fix the element binds `Err(tool_loop_exhausted)` and
    // the array `[Err(...)]` flows as the tail value.
    const host = new ScriptedHost();
    const error = exhaustedError();
    host.results.set("query", { ok: false, error });
    const program = body([letStmt("r", arrayExpr([queryExpr("q")]))], identExpr("r"));

    const r = await executeBody(program, deps(host));

    expect(
      r.outcome,
      "W2: a value-position (array element) query Err binds — the body succeeds",
    ).toBe("success");
    const arr = r.result.value as readonly ThetaValue[];
    expect(Array.isArray(arr), "W2: the tail value is the constructed array").toBe(true);
    const element = arr[0] as ResultValue;
    expect(element.ok, "W2: the array element is a Result carrying the query Err").toBe(false);
    expect(
      (element as { readonly error: ThetaValue }).error,
      "W2: the bound Err carries the effect's own tool_loop_exhausted error",
    ).toEqual(error);
  });
});

// ===========================================================================
// W3 — regression guards: the terminal / returning / discarding positions the
// adjudication PRESERVES as `fail`, plus the direct-scrutinee control that is
// already green. These MUST pass before AND after the fix.
// ===========================================================================

describe("bug 0307 W3 — regression guards (GREEN before and after the fix)", () => {
  it("guard (a): a bare tail `@`q`` (fail) stays a terminal fail carrying the query's own error (STL-6)", async () => {
    // WHY: STL-6 — a bare tail query whose Err reaches the return IS returned =
    // unhandled = fail. The adjudication pins ONLY this bare-`@`-tail shape as
    // fail; the fix must not regress it.
    const host = new ScriptedHost();
    const error = exhaustedError();
    host.results.set("query", { ok: false, error });
    const program = body([], queryExpr("q"));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "guard (a): a bare tail query Err is unhandled — fail").toBe("fail");
    expect(
      r.error,
      "guard (a): the fail carries the effect's own tool_loop_exhausted error (ERR-19)",
    ).toEqual(error);
  });

  it("guard (b): `return @`q`` (fail) stays a terminal fail", async () => {
    // WHY: error-model.md:10 — an `Err` "returned" is unhandled and reaches the
    // fail arm; a `return` operand is a terminal/returning position.
    const host = new ScriptedHost();
    host.results.set("query", { ok: false, error: exhaustedError() });
    const program = body([returnStmt(queryExpr("q"))]);

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "guard (b): a returned query Err is unhandled — fail").toBe("fail");
  });

  it("guard (c): a direct-scrutinee `match @`q` { … }` (fail) recovers via the Err arm", async () => {
    // WHY: the `evalAsResult` route (direct `match` scrutinee) already binds the
    // failure as `Err(...)`; this is the already-green control the bug report
    // uses. It stays green after the fix (that route is unchanged).
    const host = new ScriptedHost();
    host.results.set("query", { ok: false, error: exhaustedError() });
    const program = body([], okErrMatch(queryExpr("q")));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "guard (c): a directly-matched query Err is handled — success").toBe(
      "success",
    );
    expect(r.result.value, "guard (c): the match took its Err arm").toBe("HANDLED");
  });
});
