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
import {
  isResultValue,
  makeErr,
  makeOk,
  type ResultValue,
  type ThetaValue,
} from "../src/runtime/value";
import type { QueryError } from "../src/runtime/query-error";
import type {
  Expr,
  MatchArmNode,
  MatchExpr,
  ThetaBody,
  Stmt,
} from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// Bug 0387 — a query at a BLOCK-EXPRESSION tail (`let r = { @`q` }`, or a
// `match`-arm block body) binds the RAW payload on success and FAILS the theta
// on Err, because `executeBlock` (statement-executor.ts:2048) hard-codes every
// block tail as a terminal position: `evalExpr(block.tail, env, deps, true)`
// (statement-executor.ts:2073). For a VALUE-position BlockExpr the tail's
// `atTerminal` must be FALSE, so a query success binds `Ok(payload)` and a
// query failure binds `makeErr` — the exact consumption disposition bug 0351
// landed one spelling over (`let r = @`q``, no braces). `evalExpr`'s `"block"`
// arm (statement-executor.ts:942) has the caller's `atTerminal` in scope and
// drops it; `evalMatch` (statement-executor.ts:1530) threads `atTerminal` into
// arm bodies but a block-expr arm body re-enters `executeBlock` and the flag is
// dropped there (cell B4).
//
// Spec / adjudication:
//   - QRY-8 (query-failure-and-repair.md): "A query never throws. Both forms
//     return a `Result`." — the block's value is that `Result`.
//   - grammar.md §"Block expressions" (grammar.md:118): `BlockExpr ::= "{"
//     Stmt* Expr "}"` — "expression-position; tail Expr required, value is the
//     tail expression". So `{ @`q` }`'s value IS the query's `Result` value,
//     the same value the byte-identical brace-less `@`q`` binds.
//   - error-model.md:10: an `Err`-class outcome reaches the *fail* arm "only
//     when the resulting `Err` is unhandled — propagated via `?` or returned,
//     not consumed by a caller `match`". In B2/B4 the value is bound and
//     consumed by a downstream `match`, so the theta must NOT fail.
//   - Bugs 0307 (0.298.0) / 0351 (0.351.0) pinned dispositions: a query effect
//     in ANY value position evaluates to a `Result` VALUE (0307), and a
//     value-position success binds `Ok(payload)` (0351). 0351 §Fix Residual 1
//     named THIS block-expr-tail spelling unprospected — this is the follow-up.
//
// The B1/B2/B4 reds are the SPECIFIED behaviour, not a compile error, a missing
// fixture, or a harness throw: the scripted host returns a real query outcome
// and the executor is driven to the hard-coded-terminal defect. B1/B4 red as a
// `MatchError` panic (raw payload matches no ctor); B2 reds as `outcome: "fail"`
// (the Err aborts at the effect site). The C-* controls stay GREEN before AND
// after the fix — proof the fix neither over-reaches (the brace-less 0351 path
// and the genuine body tail keep their landed dispositions) nor double-wraps.
// The fix version placeholder used below is the LITERAL 0.383.0 (the parent
// substitutes the real version at merge).

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

/** An `{ <name>: <value>, … }` object literal (no schema ctor). */
function objectExpr(fields: readonly { name: string; value: Expr }[]): Expr {
  return { kind: "object", typeName: null, fields, range: span() };
}

/** A code-tool call expression `<callee>(args)`. */
function callExpr(callee: string, args: readonly Expr[]): Expr {
  return { kind: "call", callee, args, range: span() };
}

/** An untyped `@`-query expression. */
function queryExpr(template: string): Expr {
  return { kind: "query", schema: null, template, range: span() };
}

/** An `<operand>?` (`?`-propagation) expression. */
function tryExpr(operand: Expr): Expr {
  return { kind: "try", operand, range: span() };
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

/**
 * A `{ Stmt* Expr }` block-expression node (grammar.md:118). Its `body` is a
 * `Block` = `{ statements, tail }` (theta-document.ts:925); the parser builds
 * exactly this `{ kind:"block", body, range }` shape (theta-document.ts:4464).
 * A `BlockExpr` is admitted at exactly two positions (theta-document.ts:433):
 * a `let` initialiser and a `match`-arm body — the two value positions this
 * bug covers.
 */
function blockExpr(statements: readonly Stmt[], tail: Expr): Expr {
  return { kind: "block", body: { statements, tail }, range: span() };
}

/** The two-arm result `match` the bug's recovery shape uses. */
function okErrMatch(scrutinee: Expr): MatchExpr {
  const arms: MatchArmNode[] = [
    { pattern: { kind: "constructor", ctor: "Ok", inner: { kind: "identifier", name: "v" } }, body: identExpr("v") },
    { pattern: { kind: "constructor", ctor: "Err", inner: { kind: "wildcard" } }, body: stringExpr("ERRARM") },
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
 * literal / ident forms the witnesses need against the real environment. A
 * succeeding query is modelled as `{ ok:true, value: <raw payload/string> }` —
 * exactly what `runQueryEffect` feeds `evalExpr`'s effect arm for a success.
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

/** A non-cancel query failure (the 0307 Err-side control's error). */
function panicError(): QueryError {
  return { kind: "panic", message: "boom" } as unknown as QueryError;
}

// ===========================================================================
// B1 — WITNESS (RED at fork 4d6ca0d9, GREEN after fix). A `let`-bound
// block-expr SUCCEEDING query consumed by `match r { Ok(v)=>v, Err(_)=>… }`
// must bind `Ok(payload)` and take the Ok arm — the byte-identical value of the
// brace-less `let r = @`q`` (grammar.md:118 "value is the tail expression").
// Pre-fix `executeBlock`'s hard-coded `atTerminal=true` keeps the payload RAW,
// so the raw "PAYLOAD" matches neither ctor → MatchError panic.
// ===========================================================================

describe("bug 0387 B1 — a let-bound block-expr query success binds Ok(payload) so a downstream match takes the Ok arm", () => {
  it("`let r = { @`q` }` (success) then `match r { Ok(v)=>v, Err(_)=>… }` binds Ok and returns the payload", async () => {
    // WHY: grammar.md:118 — a `BlockExpr`'s value is its tail expression; the
    // tail is a value-position query, so QRY-8's `Result` must bind and the
    // `match` one statement later consumes it. After the fix (0.383.0) `r` binds
    // `Ok("PAYLOAD")` and the `Ok(v)` arm yields the payload. Before the fix the
    // block tail is evaluated `atTerminal=true`, so `r` binds the raw "PAYLOAD"
    // → the ctor patterns match nothing → MatchError panic (bug 0351's pre-fix
    // symptom, one spelling over).
    const host = new ScriptedHost();
    host.results.set("query", { ok: true, value: "PAYLOAD" });
    const program = body([letStmt("r", blockExpr([], queryExpr("q")))], okErrMatch(identExpr("r")));

    const r = await executeBody(program, deps(host));

    expect(
      r.outcome,
      "B1: a let-bound-then-matched block-expr query success is handled — the body succeeds",
    ).toBe("success");
    expect(
      r.result.value,
      "B1: the match took its Ok(v) arm and yielded the unwrapped block-expr-tail payload",
    ).toBe("PAYLOAD");
  });
});

// ===========================================================================
// B2 — WITNESS (RED at fork 4d6ca0d9, GREEN after fix). The same program with a
// FAILING query: the Err is bound and consumed by the caller `match`, so per
// error-model.md:10 ("not consumed by a caller `match`") the theta must NOT
// fail — the Err arm recovers to "ERRARM". Pre-fix the block tail's
// `atTerminal=true` routes the failure to `flow: "fail"` and the theta aborts
// at the effect site.
// ===========================================================================

describe("bug 0387 B2 — a let-bound block-expr query failure binds Err and is consumed by the caller match (no abort)", () => {
  it("`let r = { @`q` }` (fail) then `match r { Ok(v)=>v, Err(_)=>… }` takes the Err arm", async () => {
    // WHY: error-model.md:10 — an `Err` reaches the *fail* arm only when
    // unhandled ("propagated via `?` or returned, not consumed by a caller
    // `match`"). Here the Err is bound to `r` and consumed by the downstream
    // `match`, so the theta must succeed via the Err arm. After the fix (0.383.0)
    // the value-position block tail binds `makeErr(error)`; before the fix the
    // hard-coded terminal tail routes the failure to `flow: "fail"` and the
    // whole theta fails at the effect site (bug 0307's pre-fix symptom).
    const host = new ScriptedHost();
    host.results.set("query", { ok: false, error: panicError() });
    const program = body([letStmt("r", blockExpr([], queryExpr("q")))], okErrMatch(identExpr("r")));

    const r = await executeBody(program, deps(host));

    expect(
      r.outcome,
      "B2: a let-bound-then-matched block-expr query Err is consumed by the caller match — success, not fail",
    ).toBe("success");
    expect(r.result.value, "B2: the match took its Err arm and recovered").toBe("ERRARM");
  });
});

// ===========================================================================
// B4 — WITNESS (RED at fork 4d6ca0d9, GREEN after fix). A `match`-arm BLOCK
// body: `let r = match c { _ => { @`q` } }` then `match r { Ok(v)=>v, … }`.
// `evalMatch` (statement-executor.ts:1530) threads `atTerminal` into arm
// bodies, but the arm body IS a block expression that re-enters `executeBlock`,
// where the flag is dropped for the hard-coded `true` — so the correct
// threading is nullified. Query success must still bind `Ok(payload)`. Pre-fix
// the raw payload → MatchError panic.
// ===========================================================================

describe("bug 0387 B4 — a match-arm block body query success binds Ok(payload) (evalMatch's atTerminal threading survives)", () => {
  it("`let r = match c { _ => { @`q` } }` (success) then `match r { Ok(v)=>v, … }` binds Ok and returns the payload", async () => {
    // WHY: the block-expr's second admitted position (grammar.md:150,
    // theta-document.ts:433) is a `match`-arm body. `evalMatch` carefully
    // threads its own non-terminal `atTerminal` into the arm body, but the block
    // arm re-enters `executeBlock` and the tail is evaluated `atTerminal=true`
    // regardless — so `r` binds the raw "PAYLOAD" and the outer `match` panics
    // MatchError. After the fix (0.383.0) the value-position block tail binds
    // `Ok("PAYLOAD")` and the Ok(v) arm yields the payload.
    const host = new ScriptedHost();
    host.results.set("query", { ok: true, value: "PAYLOAD" });
    const armBody = blockExpr([], queryExpr("q"));
    const program = body(
      [
        letStmt("c", stringExpr("x")),
        letStmt("r", matchExpr(identExpr("c"), [{ pattern: { kind: "wildcard" }, body: armBody }])),
      ],
      okErrMatch(identExpr("r")),
    );

    const r = await executeBody(program, deps(host));

    expect(
      r.outcome,
      "B4: a match-arm block-body query success is bound and consumed — the body succeeds",
    ).toBe("success");
    expect(
      r.result.value,
      "B4: evalMatch's atTerminal threading reached the arm-block tail — the Ok(v) arm yielded the payload",
    ).toBe("PAYLOAD");
  });
});

// ===========================================================================
// C-B3 — CONTROL (GREEN before AND after). The bug 0351 landed path: the
// byte-identical BRACE-LESS `let r = @`q`` bound-then-matched query success
// already binds `Ok(payload)`. The fix must not perturb it — B1 with the braces
// removed must stay identical, proving no over-reach onto the already-correct
// spelling.
// ===========================================================================

describe("bug 0387 C-B3 — the brace-less `let r = @`q`` success stays Ok(payload) (bug 0351 landed path, untouched)", () => {
  it("`let r = @`q`` (success, NO braces) then `match r { Ok(v)=>v, … }` binds Ok and returns the payload", async () => {
    // WHY: bug 0351 (0.351.0) landed the brace-less value-position success as
    // `Ok(payload)`. This is B1 minus the block-expr wrapper; it must be GREEN
    // both before and after the 0387 fix — the fix threads consumption only
    // through the block tail and must leave the direct value position alone.
    const host = new ScriptedHost();
    host.results.set("query", { ok: true, value: "PAYLOAD" });
    const program = body([letStmt("r", queryExpr("q"))], okErrMatch(identExpr("r")));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "C-B3: the brace-less value-position query success is handled — success").toBe(
      "success",
    );
    expect(
      r.result.value,
      "C-B3: the match took its Ok(v) arm and yielded the payload (0351 landed disposition)",
    ).toBe("PAYLOAD");
  });
});

// ===========================================================================
// C-bodytail-ok — CONTROL (GREEN before AND after). A genuine BODY bare tail
// `@`q`` is a terminal/returning position (STL-6): its success value stays RAW
// at the seam so the single downstream `makeOk` re-wrap yields `Ok(payload)`,
// never `Ok(Ok(payload))`. The fix must NOT double-wrap the body tail — it
// scopes `atTerminal=false` to VALUE-position blocks only, leaving the body
// tail's terminal disposition (statement-executor.ts:2073's `true`) intact.
// ===========================================================================

describe("bug 0387 C-bodytail-ok — a body bare-tail query success stays RAW at the seam (STL-6, no double-wrap)", () => {
  it("`@`q`` as the body tail (success) stays the RAW payload (atTerminal not wrapped)", async () => {
    // WHY: STL-6 — a body/returning position stays raw here; the body boundary
    // re-wraps once → `Ok(payload)`. If the 0387 fix wrapped ALL block tails
    // (not just value-position ones) this would become `Ok(Ok(payload))`. The
    // body-tail terminal disposition must survive: the produced value is the
    // plain payload, NOT a `Result`.
    const host = new ScriptedHost();
    host.results.set("query", { ok: true, value: "PAYLOAD" });
    const program = body([], queryExpr("q"));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "C-bodytail-ok: a bare body-tail query success completes the body").toBe(
      "success",
    );
    expect(
      isResultValue(r.result.value as ThetaValue),
      "C-bodytail-ok: the terminal body-tail value is NOT double-wrapped at the seam",
    ).toBe(false);
    expect(r.result.value, "C-bodytail-ok: the terminal body-tail value is the raw payload").toBe(
      "PAYLOAD",
    );
  });
});

// ===========================================================================
// C-bodytail-fail — CONTROL (GREEN before AND after). Bug 0307's terminal
// fail disposition for a genuine body bare tail is untouched: a FAILING body
// tail query whose Err reaches the return is unhandled = fail carrying the
// query's own error (ERR-19). The 0387 fix must not regress it.
// ===========================================================================

describe("bug 0387 C-bodytail-fail — a body bare-tail query failure stays a terminal fail (bug 0307 disposition untouched)", () => {
  it("`@`q`` as the body tail (fail) stays a terminal fail carrying the query's own error", async () => {
    // WHY: STL-6 / bug 0307 — a bare body-tail query whose Err reaches the
    // return is unhandled = fail. Unlike B2 (where the Err is bound and consumed
    // by a caller `match`), this Err genuinely reaches the return, so
    // error-model.md:10's *fail* arm applies. The 0387 value-position fix must
    // not perturb this terminal fail branch.
    const host = new ScriptedHost();
    const error = panicError();
    host.results.set("query", { ok: false, error });
    const program = body([], queryExpr("q"));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "C-bodytail-fail: a bare body-tail query Err is unhandled — fail").toBe("fail");
    expect(
      r.error,
      "C-bodytail-fail: the fail carries the effect's own error (ERR-19, 0307 disposition)",
    ).toEqual(error);
  });
});
