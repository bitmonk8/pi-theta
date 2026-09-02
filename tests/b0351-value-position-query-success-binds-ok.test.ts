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

// Bug 0351 — a value-position query SUCCESS (`let r = @`…``, no `?`) must BIND
// `Ok(payload)` so the author's documented consumption runs: `match r { Ok(v)
// …, Err(e) … }` takes the `Ok` arm and `let v = r?` unwraps to the payload.
// Today the success branch of `evalExpr`'s checkpointed-effect arm binds the
// RAW payload, so the `match` panics `MatchError` (the raw payload matches no
// ctor pattern) and `?` aborts through bug 0019's brand guard. This is the
// success-half follow-on to bug 0307 (which fixed the FAILURE half of the same
// arm) — the two branches disagreed about whether the effect outcome is a
// `Result`.
//
// Spec / adjudication:
//   - query-forms.md QRY-1/QRY-2: a query's return type is
//     `Result<string, QueryError>` / `Result<Schema, QueryError>`; a `let`
//     binding binds the expression's value — the `Result`.
//   - query-failure-and-repair.md QRY-8: "A query never throws. Both forms
//     return a `Result`."
//   - bug 0307's parent adjudication (verbatim): "a query effect in ANY value
//     position evaluates to a Result VALUE and never aborts at the effect
//     site." 0307 bound `makeErr(error)` on the failure branch and left the
//     success branch raw; this fix makes the success branch symmetric.
//
// Mechanism (statement-executor.ts): the success branch now wraps the clean
// outcome with `asResultValue` gated on `!atTerminal`, exactly mirroring both
// 0307's `makeErr`/`fail` split in the same arm and `evalAsResult`'s direct
// `?`/`match`-scrutinee wrap. `asResultValue` is IDEMPOTENT
// (`isResultValue(v) ? v : makeOk(v)`), so an effect whose value is already a
// `Result` (a production tool-call / invoke / `.theta`-callable) passes through
// UNWRAPPED — only a query's raw payload/string is wrapped. A terminal /
// returning / par-for position stays RAW so the single downstream `makeOk`
// re-wrap yields `Ok(payload)`, never `Ok(Ok(payload))` (STL-6).
//
// These reds are the SUCCESS behaviour, not a compile error, a missing fixture,
// or a harness throw: the scripted host returns a real `{ ok:true, value }`
// query success and the executor is driven to the raw-binding defect. The fix
// version placeholder used below is 0.351.0 (the parent substitutes at merge).

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
// W1 — the core bug (fixture 1): a `let`-bound SUCCEEDING query is consumed by
// `match r { Ok(v)=>v, Err(_)=>… }`, so it must bind `Ok(payload)` and take the
// `Ok` arm. Before the fix the raw payload matches no ctor → MatchError panic.
// ===========================================================================

describe("bug 0351 W1 — a let-bound query success binds Ok(payload) so a downstream match takes the Ok arm", () => {
  it("`let r = @`q`` (success) then `match r { Ok(v)=>v, Err(_)=>… }` binds Ok and returns the payload", async () => {
    // WHY: QRY-8 + query-forms.md — the query returns a `Result` value; the
    // `match` one statement later consumes it. After the fix (0.351.0) `r` binds
    // `Ok("PAYLOAD")` and the `Ok(v)` arm yields the payload. Before the fix `r`
    // binds the raw "PAYLOAD", which matches neither ctor → MatchError panic.
    const host = new ScriptedHost();
    host.results.set("query", { ok: true, value: "PAYLOAD" });
    const program = body([letStmt("r", queryExpr("q"))], okErrMatch(identExpr("r")));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "W1: a let-bound-then-matched query success is handled — the body succeeds").toBe(
      "success",
    );
    expect(
      r.result.value,
      "W1: the match took its Ok(v) arm and yielded the unwrapped payload",
    ).toBe("PAYLOAD");
  });
});

// ===========================================================================
// W2 — the core bug (fixture 2): a `let`-bound SUCCEEDING query is consumed by
// `let v = r?`, so `r` must bind `Ok(payload)` and `?` must unwrap it to the
// payload. Before the fix `r` binds the raw payload → `?` fails the bug-0019
// brand guard → internal-error abort.
// ===========================================================================

describe("bug 0351 W2 — a let-bound query success unwraps through `?` (the 0019 brand guard) to the payload", () => {
  it("`let r = @`q`` (success) then `let v = r?` binds and `v` returns the payload", async () => {
    // WHY: `?` propagation (ERR-18) unwraps `Ok(v)` to `v`. After the fix `r`
    // binds `Ok("PAYLOAD")`, `r?` unwraps to "PAYLOAD", `v` returns it. Before
    // the fix `r` binds the raw "PAYLOAD"; `?` sees a non-`Result` and the 0019
    // gate-gap belt throws `QuestionOperandDefectError` → internal-error abort.
    const host = new ScriptedHost();
    host.results.set("query", { ok: true, value: "PAYLOAD" });
    const program = body(
      [letStmt("r", queryExpr("q")), letStmt("v", tryExpr(identExpr("r")))],
      identExpr("v"),
    );

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "W2: `r?` unwraps the bound Ok — the body succeeds").toBe("success");
    expect(r.result.value, "W2: `?` unwrapped the Ok to its payload").toBe("PAYLOAD");
  });
});

// ===========================================================================
// W3 — ANY value position, not only a `let` init: a SUCCEEDING query effect
// nested in a composite value must bind as `Ok(payload)`.
// ===========================================================================

describe("bug 0351 W3 — a succeeding query effect in a composite value position binds Ok(payload)", () => {
  it("`let r = [@`q`]` (success) then tail `r` binds an array whose element is Ok(payload)", async () => {
    // WHY: the effect arm serves array elements too; a succeeding array-element
    // query must bind `Ok(payload)` as the element value. Before the fix the
    // element is the raw payload (no `Result` brand).
    const host = new ScriptedHost();
    host.results.set("query", { ok: true, value: "PAYLOAD" });
    const program = body([letStmt("r", arrayExpr([queryExpr("q")]))], identExpr("r"));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "W3: a value-position (array element) query success binds — success").toBe(
      "success",
    );
    const arr = r.result.value as readonly ThetaValue[];
    const element = arr[0] as ResultValue;
    expect(element.ok, "W3: the array element is a Result carrying the query success").toBe(true);
    expect(
      (element as { readonly value: ThetaValue }).value,
      "W3: the bound Ok carries the effect's own payload",
    ).toBe("PAYLOAD");
  });

  it("`let r = { f: @`q` }` (success) then tail `r` binds an object whose field is Ok(payload)", async () => {
    // WHY: the effect arm serves object fields too; a succeeding object-field
    // query must bind `Ok(payload)` as the field value.
    const host = new ScriptedHost();
    host.results.set("query", { ok: true, value: "PAYLOAD" });
    const program = body(
      [letStmt("r", objectExpr([{ name: "f", value: queryExpr("q") }]))],
      identExpr("r"),
    );

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "W3: a value-position (object field) query success binds — success").toBe(
      "success",
    );
    const obj = r.result.value as Record<string, ThetaValue>;
    const field = obj.f as ResultValue;
    expect(field.ok, "W3: the object field is a Result carrying the query success").toBe(true);
    expect(
      (field as { readonly value: ThetaValue }).value,
      "W3: the bound Ok carries the effect's own payload",
    ).toBe("PAYLOAD");
  });
});

// ===========================================================================
// W4 — DOUBLE-WRAP CONTROLS (bug 0351 ratification condition 2). At this seam
// `asResultValue` must pass an ALREADY-`Result` effect value through UNWRAPPED:
// a value-position effect whose success value is already `Ok(v)` must bind
// `Ok(v)` (never `Ok(Ok(v))`), and one already `Err(e)` must stay `Err(e)`
// (never `Ok(Err(e))`). This is exactly the production tool-call / invoke /
// `.theta`-callable shape (their success VALUE is already a `Result`). GREEN
// before AND after the fix; reds only if the fix double-wraps.
// ===========================================================================

describe("bug 0351 W4 — asResultValue passes an already-Result effect value through UNWRAPPED (no double-wrap)", () => {
  it("control (i): a value-position effect whose success value is already Ok(v) binds Ok(v), never Ok(Ok(v))", async () => {
    // WHY: a production Pi-tool value is already a `Result`
    // (tool-call-execute.ts `makeOk(...)`). `asResultValue(makeOk("v"))` is the
    // same `Ok("v")`, so `r` binds a single-wrapped `Ok` whose PAYLOAD is the
    // plain string "v" — not a nested `Result`.
    const host = new ScriptedHost();
    host.results.set("store", { ok: true, value: makeOk("v") });
    const program = body([letStmt("r", callExpr("store", []))], identExpr("r"));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "control (i): the effect binds and the body succeeds").toBe("success");
    const rv = r.result.value as ResultValue;
    expect(rv.ok, "control (i): the bound value is Ok").toBe(true);
    const inner = (rv as { readonly value: ThetaValue }).value;
    expect(
      isResultValue(inner),
      "control (i): the Ok payload is NOT itself a Result — no Ok(Ok(v)) double-wrap",
    ).toBe(false);
    expect(inner, "control (i): the single Ok carries the plain payload").toBe("v");
  });

  it("control (ii): a value-position effect whose success value is already Err(e) stays Err(e), never Ok(Err(e))", async () => {
    // WHY: an effect value that is already `Err(e)` (a Pi-tool that returned an
    // `Err` `Result` as its value) must pass through unwrapped —
    // `asResultValue(makeErr(e))` is the same `Err(e)`, not `Ok(Err(e))`.
    const host = new ScriptedHost();
    const innerErr = "TOOLFAIL";
    host.results.set("store", { ok: true, value: makeErr(innerErr) });
    const program = body([letStmt("r", callExpr("store", []))], identExpr("r"));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "control (ii): the effect binds and the body succeeds").toBe("success");
    const rv = r.result.value as ResultValue;
    expect(rv.ok, "control (ii): the bound value stays Err — not re-wrapped as Ok").toBe(false);
    expect(
      (rv as { readonly error: ThetaValue }).error,
      "control (ii): the passed-through Err carries the effect's own error payload",
    ).toBe(innerErr);
  });
});

// ===========================================================================
// W5 — atTerminal-gate / STL-6 regression guards: a bare tail `@`q`` and
// `return @`q`` stay RAW at the executeBody seam (the `!atTerminal` gate does
// NOT wrap here), so the single downstream `makeOk` re-wrap yields `Ok(payload)`
// — never `Ok(Ok(payload))`. GREEN before AND after the fix.
// ===========================================================================

describe("bug 0351 W5 — a terminal query success stays raw at the seam (STL-6, single-wrap preserved)", () => {
  it("guard (a): a bare tail `@`q`` (success) stays RAW at the executeBody seam (atTerminal not wrapped)", async () => {
    // WHY: STL-6 — a bare-tail / returning position stays raw here; the body
    // boundary re-wraps once → `Ok(payload)`. An unconditional wrap here would
    // make it `Ok(Ok(payload))`. The `!atTerminal` gate keeps the terminal
    // value raw, so the seam's produced value is the plain payload.
    const host = new ScriptedHost();
    host.results.set("query", { ok: true, value: "PAYLOAD" });
    const program = body([], queryExpr("q"));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "guard (a): a bare tail query success completes the body").toBe("success");
    expect(
      isResultValue(r.result.value as ThetaValue),
      "guard (a): the terminal value is NOT double-wrapped at the seam",
    ).toBe(false);
    expect(r.result.value, "guard (a): the terminal value is the raw payload").toBe("PAYLOAD");
  });

  it("guard (b): `return @`q`` (success) stays RAW at the executeBody seam", async () => {
    // WHY: a `return` operand is a terminal/returning position; the `!atTerminal`
    // gate keeps it raw so the single downstream re-wrap yields `Ok(payload)`.
    const host = new ScriptedHost();
    host.results.set("query", { ok: true, value: "PAYLOAD" });
    const program = body([returnStmt(queryExpr("q"))]);

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "guard (b): a returned query success completes the body").toBe("success");
    expect(
      isResultValue(r.result.value as ThetaValue),
      "guard (b): the returned value is NOT double-wrapped at the seam",
    ).toBe(false);
    expect(r.result.value, "guard (b): the returned value is the raw payload").toBe("PAYLOAD");
  });
});

// ===========================================================================
// W6 — Err-side regression guards: bug 0307's landed handledness law is
// untouched. A let-bound FAILING query consumed by `match` takes the Err arm;
// a bare-tail FAILING query stays a terminal fail. GREEN before AND after.
// ===========================================================================

describe("bug 0351 W6 — the failure branch (bug 0307) is byte-identical (Err-side handledness untouched)", () => {
  it("guard (c): `let r = @`q`` (fail) then `match r { Ok(v)=>v, Err(_)=>… }` takes the Err arm", async () => {
    // WHY: the failure branch already binds `Err(...)` in value positions (bug
    // 0307). The success-side fix must not perturb it — the `match` still
    // recovers via its `Err` arm.
    const host = new ScriptedHost();
    host.results.set("query", { ok: false, error: panicError() });
    const program = body([letStmt("r", queryExpr("q"))], okErrMatch(identExpr("r")));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "guard (c): a let-bound-then-matched query Err is handled — success").toBe(
      "success",
    );
    expect(r.result.value, "guard (c): the match took its Err arm").toBe("ERRARM");
  });

  it("guard (d): a bare tail `@`q`` (fail) stays a terminal fail carrying the query's own error (STL-6)", async () => {
    // WHY: STL-6 — a bare-tail query whose Err reaches the return is unhandled =
    // fail. The success-side fix must not regress the fail branch's terminal
    // disposition.
    const host = new ScriptedHost();
    const error = panicError();
    host.results.set("query", { ok: false, error });
    const program = body([], queryExpr("q"));

    const r = await executeBody(program, deps(host));

    expect(r.outcome, "guard (d): a bare tail query Err is unhandled — fail").toBe("fail");
    expect(r.error, "guard (d): the fail carries the effect's own error (ERR-19)").toEqual(error);
  });
});
