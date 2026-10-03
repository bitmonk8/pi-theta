// Bug 0510 — a trailing bare call / `invoke(...)` / `@`-query in a
// MULTI-statement brace-nested block (`FnBody`, `ParForBody`, `BlockExpr`)
// loses the block's final value
// (docs/bugs/0510-block-trailing-call-value-discarded.md).
//
// Spec:
//   - grammar.md §Blocks: `FnBody ::= "{" Stmt* Expr? "}"`,
//     `ParForBody ::= "{" Stmt* Expr? "}"`, `BlockExpr ::= "{" Stmt* Expr "}"`.
//     A trailing bare call is an `Expr`; no production excludes a call, an
//     `invoke(...)` or a query from the trailing-`Expr` position.
//   - functions.md FN-5: a fn body's final value is its tail expression's value.
//   - functions.md FN-4: only a `void`-typed expression statement as the last
//     form makes an empty-tail body; a call to a value-returning fn does not.
//   - control-flow.md CTRL-3: a `par for` element carries the body tail's value.
//   - return.md RET-3: code after a `return` in the same block is unreachable
//     (`theta/parse/unreachable-code`, a warning).
//
// The defect (bug 0510 §Root cause). `collapseContinuations`
// (`src/lexer/continuation.ts`) swallows every newline at bracket depth > 0,
// so no in-brace form after the first begins a logical line. With tail
// promotion gated on `lineStart` in every block, a multi-statement nested
// block kept its trailing expression as a statement, which `exprToStmt`
// encodes as a `tool-call` / `invoke` / `query` ACTION statement for a call /
// invoke / query. `executeBlock` keeps a trailing statement's value only for
// kind `expr`, so the block yielded `null`, which `parForOutcomeOf` wrapped as
// `Ok(null)`. The `BlockExpr` sibling (`promoteTrailingExprToTail`) admits only
// `expr` statements, so the same shape there drew
// `theta/parse/block-expr-missing-tail`, and a trailing bare query drew
// `theta/parse/discarded-query-result`.
//
// Fix contract these cells encode: the FINAL expression form of a `FnBody`,
// `ParForBody` or `BlockExpr` is `Block.tail` regardless of `lineStart`, so the
// parse cells pin the structural shape (tail is the call/invoke/query node;
// the statements exclude it) and the runtime cells pin the value the grammar
// assigns. The depth-0 `ThetaBody` and the `StmtBlock` bodies of `if` / `else`
// / `while` / `for` keep the `lineStart`-gated promotion; the StmtBlock
// controls below pin the static verdicts that depend on it. A `void`-annotated
// fn's call yields `null` whatever its body's last form produced (FN-4), and
// RET-3 judges a block's tail expression after a `return` as unreachable code.
//
// CONTROLS stay green before and after the fix: single-form promotion, ident /
// `match` trailing expressions, `?`- and `}`-preceded trailing calls (the
// `forcedLineStart` restore), the depth-0 `ThetaBody`, a `StmtBlock` whose
// trailing call is discarded (grammar.md §Blocks: a `StmtBlock` tail is
// evaluated and discarded), a statement-position `par for` last form, which
// the parser keeps un-promoted (`tailExpr = null` in `parseForm`), the
// StmtBlock static verdicts (no `return-no-common-type` from an if-body's
// trailing query or `match`, no `type-as-value` from an if-body's trailing
// schema name, `discarded-query-result` on an if/for/while body's trailing
// query), and a multi-statement `void` fn ending in a call.
//
// Harnesses: parse via the production `parseThetaDocument`; pure runtime cells
// via the shared production-producer drive (`makeBeltProbes`); the
// query runtime cell via its instant-settle session drive (`driveInterp`); the
// invoke runtime cells via `executeBody` over a `ScriptedHost` whose `invoke`
// effect returns a scripted payload — the offline seam the b0387 witness uses.
// Every cell asserts; a fixture that stops parsing as intended fails loudly.

import { describe, expect, it } from "vitest";
import type { ThetaSource } from "../src/lexer/lexer";
import {
  parseThetaDocument,
  type Block,
  type Expr,
  type FnDecl,
  type LetStmt,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { LexicalEnvironment } from "../src/runtime/lexical-environment";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import type { SubagentFnChildOutcome } from "../src/runtime/statement-executor-types";
import { makeErr, makeOk, type ThetaValue } from "../src/runtime/value";
import { parseDeps, trailingExpr } from "./helpers/e2e-s1";
import { evalBoundedPure } from "./helpers/par-for-harness";
import { ScriptedHost, deps } from "./helpers/invoke-seam-scaffold";
import { assertValue, makeBeltProbes, render } from "./helpers/runtime-belt-probe-harness";

const FM = "---\nmode: prompt\n---\n";
const PATH = "b0510.theta";
const MISSING_TAIL_CODE = "theta/parse/block-expr-missing-tail";
const DISCARDED_QUERY_CODE = "theta/parse/discarded-query-result";
const NO_COMMON_TYPE_CODE = "theta/parse/return-no-common-type";
const TYPE_AS_VALUE_CODE = "theta/parse/type-as-value";
const UNREACHABLE_CODE = "theta/parse/unreachable-code";
const INVOKE_RETURN_MISMATCH_CODE = "theta/parse/invoke-return-type-mismatch";

/** Parse a prompt-mode body through the production parser, diagnostics kept. */
function parseOnly(src: string): ThetaDocument {
  const source: ThetaSource = { path: PATH, bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/** Parse and fail loudly on any error-severity diagnostic. */
function parseClean(src: string): ThetaDocument {
  const doc = parseOnly(src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture failed to parse clean: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

const strict = makeBeltProbes(parseClean, "b0510");
// The query fixture's trailing `@`-query draws `discarded-query-result` while
// the defect stands; the runtime cell reads the executor's value regardless so
// it witnesses the lost value independently of the parse cell that pins the
// refusal.
const lenient = makeBeltProbes(parseOnly, "b0510", { includeValue: true });

/** The body `Block` of the fn named `name`; fails loudly when absent. */
function fnBody(doc: ThetaDocument, name: string): Block {
  const fn = doc.body.statements.find(
    (s): s is FnDecl => s.kind === "fn" && (s as FnDecl).name === name,
  );
  if (fn === undefined) {
    throw new Error(`fixture declares no fn '${name}'`);
  }
  return fn.body;
}

/** The `par for` body bound by the top-level `let <name> = par for …`. */
function parForBodyOf(doc: ThetaDocument, name: string): Block {
  const letStmt = doc.body.statements.find(
    (s): s is LetStmt => s.kind === "let" && (s as LetStmt).name === name,
  );
  if (letStmt === undefined || letStmt.init === null || letStmt.init.kind !== "par-for") {
    throw new Error(`fixture binds no 'let ${name} = par for …'`);
  }
  return letStmt.init.body;
}

/** One-line structural rendering, so a red shows the whole block shape. */
function shapeOf(block: Block): string {
  const tail = block.tail === null ? "null" : block.tail.kind;
  return `tail=${tail} statements=[${block.statements.map((s) => s.kind).join(",")}]`;
}

/** The value of a strict production drive, failing loudly on a throw. */
async function valueOf(src: string, what: string): Promise<BodyExecution> {
  const probe = await strict.probeSource(src);
  if (probe.kind === "threw") {
    throw new Error(`${what}: the drive threw ${String(probe.thrown)}`);
  }
  return probe.execution;
}

/**
 * `ScriptedHost` with the bounded pure forms a `par for` iterand needs (array
 * literals); `invoke` effects return the scripted payload keyed on `"invoke"`.
 */
class InvokeHost extends ScriptedHost {
  override evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    const bounded = evalBoundedPure(expr, env, (e, en) => this.evaluatePure(e, en));
    return bounded === undefined ? super.evaluatePure(expr, env) : bounded;
  }
}

const INVOKE_PAYLOAD = "IPAYLOAD";

/** Parse clean, then execute over the scripted invoke host. */
async function runScriptedInvoke(src: string): Promise<BodyExecution> {
  const doc = parseClean(src);
  const host = new InvokeHost();
  host.results.set("invoke", { ok: true, value: INVOKE_PAYLOAD });
  return executeBody(doc.body, { ...deps(host), env: buildEnvironment({ body: doc.body }) });
}

const PURE = 'fn pure(s: string): string { "v:" + s }\n';

// ===========================================================================
// PARSE — RED. The final expression form of a multi-statement nested block is
// the structural `Block.tail`.
// ===========================================================================

describe("bug 0510 parse — a multi-statement nested block's trailing call/invoke/query is Block.tail", () => {
  it("FnBody `{ let z = 1 ⏎ pure(z) }`: tail is the call, statements exclude it", () => {
    const body = fnBody(parseClean(`${PURE}fn wrap(): string { let z = "a"\n pure(z) }\nwrap()`), "wrap");
    expect(
      shapeOf(body),
      "grammar.md §Blocks FnBody `Stmt* Expr?`: the trailing bare call is the tail Expr, not a `tool-call` action statement",
    ).toBe("tail=call statements=[let]");
  });

  it("FnBody ending in a bare `invoke(...)`: tail is the invoke", () => {
    const body = fnBody(parseClean('fn f(n: number) { let z = 1\n invoke("./c.theta", n) }\nf(1)'), "f");
    expect(
      shapeOf(body),
      "grammar.md §Blocks FnBody: a trailing bare invoke is the tail Expr, not an `invoke` action statement",
    ).toBe("tail=invoke statements=[let]");
  });

  it("FnBody ending in a bare `@`-query: tail is the query and no discarded-query-result fires", () => {
    const doc = parseOnly("fn f(n: number) { let z = 1\n @`q ${n}` }\nf(1)");
    const codes = doc.diagnostics.map((d) => d.code);
    expect(
      codes,
      `QRY-19 judges a discarded query STATEMENT; a trailing query is the body tail, whose value is the fn's final value (FN-5). Codes: ${JSON.stringify(codes)}`,
    ).not.toContain(DISCARDED_QUERY_CODE);
    expect(
      shapeOf(fnBody(doc, "f")),
      "grammar.md §Blocks FnBody: a trailing bare query is the tail Expr, not a `query` action statement",
    ).toBe("tail=query statements=[let]");
  });

  it("ParForBody `{ let z = m ⏎ pure(z) }`: tail is the call", () => {
    const doc = parseClean(`${PURE}let rs = par for m in ["a"] max 2 {\n let z = m\n pure(z)\n}\nrs`);
    expect(
      shapeOf(parForBodyOf(doc, "rs")),
      "grammar.md §Blocks ParForBody `Stmt* Expr?`: the trailing bare call is the tail whose type is the element type (CTRL-3)",
    ).toBe("tail=call statements=[let]");
  });

  it("match-arm BlockExpr `{ let z = 1 ⏎ pure(z) }` draws no block-expr-missing-tail", () => {
    const doc = parseOnly(`${PURE}let r = match 1 {\n 1 => {\n let z = "a"\n pure(z)\n },\n _ => "none",\n}\nr`);
    const codes = doc.diagnostics.map((d) => d.code);
    expect(
      codes,
      `grammar.md §Blocks BlockExpr \`Stmt* Expr\`: the block ends in an expression, so the tail-required rule is met. Codes: ${JSON.stringify(codes)}`,
    ).not.toContain(MISSING_TAIL_CODE);
  });
});

// ===========================================================================
// RUNTIME — RED. The trailing call's value is the block's value.
// ===========================================================================

describe("bug 0510 runtime — a multi-statement block's trailing call yields its value, not null", () => {
  it("fn body `{ let z = 1 ⏎ pure(z) }` returns pure's value (FN-5)", async () => {
    const execution = await valueOf(
      "fn pure(n: number): number { n + 41 }\nfn wrap(): number { let z = 1\n pure(z) }\nwrap()",
      "fn-body trailing call",
    );
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "FN-5: `wrap()`'s final value is its tail `pure(z)`; a `null` here is the discarded action-statement value",
    ).toBe(42);
  });

  it("par for body `{ let z = m ⏎ pure(z) }` binds Ok(value) per element (CTRL-3)", async () => {
    const execution = await valueOf(
      `${PURE}par for m in ["a", "b"] max 2 {\n let z = m\n pure(z)\n}`,
      "par-for trailing call",
    );
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "CTRL-3: each element is Ok(<body tail value>); Ok(null) is the discarded trailing call",
    ).toEqual([makeOk("v:a"), makeOk("v:b")]);
  });

  it("the bug's minimal repro renders `multi=OK:… single=OK:…`", async () => {
    // The §Repro (minimal, inline) body with the same-file pure fn the bug
    // document measures as also losing the value; its `x.notes` read is the
    // production callers' downstream member read.
    const src = [
      "schema POut { notes: string }",
      'fn lib_pure(m: string): POut { POut { notes: "pure " + m } }',
      'let rs = par for m in ["m1"] max 2 {',
      "  let z = 1",
      "  lib_pure(m)",
      "}",
      'let v1 = match rs[0] { Ok(x) => (x == null ? "OKNULL" : "OK:" + x.notes), Err(e) => "ERR:" + e.kind }',
      'let ctl = par for m in ["m2"] max 2 { lib_pure(m) }',
      'let v2 = match ctl[0] { Ok(x) => (x == null ? "OKNULL" : "OK:" + x.notes), Err(e) => "ERR:" + e.kind }',
      '"multi=" + v1 + " single=" + v2',
    ].join("\n");
    assertValue(await strict.probeSource(src), "multi=OK:pure m1 single=OK:pure m2", "minimal repro");
  });

  it("E5: a sequential call of a fn whose multi-statement body ends in a bare call yields the value", async () => {
    // `s.notes` is the downstream member read that aborts the production caller
    // when the value is `null`.
    const src = [
      "schema POut { notes: string }",
      'fn lib_pure(m: string): POut { POut { notes: "pure " + m } }',
      'fn wrap_multi(): POut { let z = 1\n lib_pure("m") }',
      "let s = wrap_multi()",
      "s.notes",
    ].join("\n");
    assertValue(await strict.probeSource(src), "pure m", "E5 sequential multi-statement call");
  });

  it("match-arm BlockExpr `{ let z = 1 ⏎ pure(z) }` yields the call's value", async () => {
    const src = `${PURE}let r = match 1 {\n 1 => {\n let z = "a"\n pure(z)\n },\n _ => "none",\n}\nr`;
    assertValue(await strict.probeSource(src), "v:a", "match-arm BlockExpr trailing call");
  });

  it("fn body ending in a bare `@`-query yields the same value as the single-form `{ @`q` }` control", async () => {
    const probe = await lenient.driveInterp("fn f(n: number) { let z = 1\n @`q ${n}` }\nlet r = f(1)\nr");
    const control = await lenient.driveInterp("fn f(n: number) { @`q ${n}` }\nlet r = f(1)\nr");
    if (probe.kind === "threw") {
      throw new Error(`query drive threw ${String(probe.thrown)}`);
    }
    if (control.kind === "threw") {
      throw new Error(`single-form control drive threw ${String(control.thrown)}`);
    }
    expect(probe.sent, "the query ran: its rendered prompt reached the session").toEqual(["q 1"]);
    expect(control.value, "the single-form control yields a value, so parity is not null-equals-null").not.toBeNull();
    expect(
      probe.value,
      "the multi-statement body's tail query yields what the single-form tail query yields on the same harness",
    ).toEqual(control.value);
  });

  it("fn body ending in a bare `invoke(...)` returns the invoke's value", async () => {
    const execution = await runScriptedInvoke(
      'fn f(n: number) { let z = 1\n invoke("./c.theta", n) }\nlet r = f(1)\nr',
    );
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "FN-5: `f(1)`'s final value is the tail invoke's value — the same value the single-form control yields",
    ).toBe(INVOKE_PAYLOAD);
  });

  it("par for body ending in a bare `invoke(...)` binds Ok(value)", async () => {
    const execution = await runScriptedInvoke(
      'let rs = par for m in [1] max 2 {\n let z = m\n invoke("./c.theta", z)\n}\nrs',
    );
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(execution.result.value, "CTRL-3: the element carries the tail invoke's value").toEqual([
      makeOk(INVOKE_PAYLOAD),
    ]);
  });

  it("E2: par for body tail-calling a same-file fn wrapping invoke binds Ok(value)", async () => {
    const execution = await runScriptedInvoke(
      [
        'fn w(n: number): string { match invoke<string>("./c.theta", n) { Ok(s) => s, Err(e) => "ERR" } }',
        "let rs = par for m in [1] max 2 {",
        "  let z = m",
        "  w(z)",
        "}",
        "rs",
      ].join("\n"),
    );
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "CTRL-3: the element carries `w(z)`'s value; the invoke ran either way, only the value is at stake",
    ).toEqual([makeOk(INVOKE_PAYLOAD)]);
  });
});

// ===========================================================================
// CONTROLS — GREEN before and after the fix.
// ===========================================================================

describe("bug 0510 controls — shapes whose trailing value already flows, and positions that discard", () => {
  it("single-form FnBody `{ pure(n) }` promotes the call and returns its value", async () => {
    const src = `${PURE}fn wrap(n: string): string { pure(n) }\nwrap("a")`;
    expect(shapeOf(fnBody(parseClean(src), "wrap")), "single-form promotion").toBe("tail=call statements=[]");
    assertValue(await strict.probeSource(src), "v:a", "single-form fn body");
  });

  it("single-form ParForBody `{ pure(m) }` binds Ok(value)", async () => {
    const execution = await valueOf(`${PURE}par for m in ["a"] max 2 { pure(m) }`, "single-form par for");
    expect(execution.result.value, "single-form par-for element").toEqual([makeOk("v:a")]);
  });

  it("single-form fn tail `@`-query and `invoke(...)` yield their values (the RED cells' reference values)", async () => {
    const q = await lenient.driveInterp("fn f(n: number) { @`q ${n}` }\nlet r = f(1)\nr");
    if (q.kind === "threw") {
      throw new Error(`query drive threw ${String(q.thrown)}`);
    }
    expect(q.value, "single-form query tail").toBe("settled-reply");
    const i = await runScriptedInvoke('fn f(n: number) { invoke("./c.theta", n) }\nlet r = f(1)\nr');
    expect(i.result.value, "single-form invoke tail").toBe(INVOKE_PAYLOAD);
  });

  it("A2: a trailing identifier `let v = pure(…) ⏎ v` returns the value", async () => {
    assertValue(
      await strict.probeSource(`${PURE}fn wrap(): string { let v = pure("a")\n v }\nwrap()`),
      "v:a",
      "ident tail",
    );
  });

  it("a trailing `match` expression returns the value", async () => {
    assertValue(
      await strict.probeSource(`${PURE}fn wrap(): string { let z = "a"\n match z { _ => pure(z) } }\nwrap()`),
      "v:a",
      "match tail",
    );
  });

  it("a trailing call after a postfix-`?` statement is promoted and returns its value", async () => {
    const src = [
      "fn pure(n: number): number { n + 41 }",
      "fn r(): Result<number, string> { Ok(1) }",
      "fn wrap(): Result<number, string> { let a = r()?\n pure(a) }",
      "wrap()",
    ].join("\n");
    expect(shapeOf(fnBody(parseClean(src), "wrap")), "`?` restores lineStart").toBe("tail=call statements=[let]");
    assertValue(await strict.probeSource(src), 42, "`?`-preceded trailing call");
  });

  it("a trailing call after a `}`-terminated statement is promoted and returns its value", async () => {
    const src = `${PURE}fn wrap(): string { if true { let q = 1 }\n pure("a") }\nwrap()`;
    expect(shapeOf(fnBody(parseClean(src), "wrap")), "`}` restores lineStart").toBe("tail=call statements=[if]");
    assertValue(await strict.probeSource(src), "v:a", "`}`-preceded trailing call");
  });

  it("the depth-0 ThetaBody promotes its trailing bare call (stmt-seps survive at depth 0)", async () => {
    const src = `${PURE}let z = "a"\npure(z)`;
    expect(shapeOf(parseClean(src).body), "top-level promotion").toBe("tail=call statements=[fn,let]");
    assertValue(await strict.probeSource(src), "v:a", "top-level trailing call");
  });

  it("a StmtBlock's trailing call is discarded: the enclosing fn's value is null, not the call's", async () => {
    // grammar.md §Blocks: a `StmtBlock` tail is evaluated and discarded; the
    // `if` is the fn body's last form, so the fn has no tail.
    const src = `${PURE}fn wrap() { if true { let z = "a"\n pure(z) }\n }\nwrap()`;
    expect(shapeOf(fnBody(parseClean(src), "wrap")), "the fn body ends in a statement").toBe(
      "tail=null statements=[if]",
    );
    const execution = await valueOf(src, "StmtBlock trailing call");
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(execution.result.value, "the if-body call's value does not escape the StmtBlock").toBeNull();
  });

  it("a statement-position `par for` last form stays un-promoted", async () => {
    // `parseForm` records a statement-position `par for` with `tailExpr = null`,
    // so promotion never makes it the body tail. `executeBlock`'s
    // trailing-`expr` statement rule returns its value as the fn's result,
    // which this cell pins as measured so a change that moves it is visible.
    const src = 'fn pure(n: number): number { n + 41 }\nfn wrap() { let z = 1\n par for m in [1] max 2 { pure(m) } }\nwrap()';
    const body = fnBody(parseClean(src), "wrap");
    const last = body.statements[body.statements.length - 1];
    expect(shapeOf(body), "the par for is a statement, not the tail").toBe("tail=null statements=[let,expr]");
    expect(
      last?.kind === "expr" ? last.expr.kind : `non-expr ${String(last?.kind)}`,
      "the trailing expression statement wraps the par for",
    ).toBe("par-for");
    const execution = await valueOf(src, "statement-position par for");
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(execution.result.value, `measured disposition: ${render(execution.result.value)}`).toEqual([makeOk(42)]);
  });
});

// ===========================================================================
// FN-4 — a `void`-annotated fn's call yields `null` whatever its body's last
// form produced. V1/V2 are CONTROLS (green before and after the fix); the
// single-form cell is RED before it (the single-form tail promoted, and the
// call returned the tail value).
// ===========================================================================

describe("bug 0510 FN-4 — a call to a `void`-annotated fn yields null", () => {
  it('V1: `fn v(): void { let z = 1 ⏎ pure("a") }; let x = v()` binds null', async () => {
    const execution = await valueOf(`${PURE}fn v(): void { let z = 1\n pure("a") }\nlet x = v()\nx`, "V1");
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(execution.result.value, "FN-4: a `void` fn discards its tail value").toBeNull();
  });

  it("V2: a fn whose last form is a call to a `void` fn returns null", async () => {
    const execution = await valueOf(
      `${PURE}fn v(): void { let z = 1\n pure("a") }\nfn outer() { let q = 1\n v() }\nouter()`,
      "V2",
    );
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "FN-4: `outer`'s last form is a `void`-typed expression statement, so `outer` has an empty tail",
    ).toBeNull();
  });

  it('single-form `fn v(): void { pure("a") }; let x = v()` binds null', async () => {
    const execution = await valueOf(`${PURE}fn v(): void { pure("a") }\nlet x = v()\nx`, "single-form void fn");
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(execution.result.value, "FN-4: a `void` fn discards its tail value").toBeNull();
  });
});

// ===========================================================================
// FN-4 at the `subagent fn` call boundary — a call to a `void`-annotated
// `subagent fn` yields `null` on success in both regimes: the in-process
// session drive (`ScriptedHost`, no `runSubagentFnChild`) and the production
// child launch (the `runSubagentFnChild` host seam, stubbed with the child's
// envelope outcome so no process spawns). The `void` cells are RED before the
// fix: the tail's value crossed the boundary unchanged in both regimes. The
// non-`void` and failure / cancellation cells are CONTROLS.
// ===========================================================================

const G = "fn g(): number { 7 }\n";
const SF_MULTI = `${G}subagent fn sf(): void { let z = 1\n g() }\nlet x = sf()\nx`;
const SF_SINGLE = `${G}subagent fn sf(): void { g() }\nlet x = sf()\nx`;
const SN_MULTI = `${G}subagent fn sn(): number { let z = 1\n g() }\nlet x = sn()\nx`;

/** Parse clean, then execute in-process over the scripted host. */
async function runInProcess(src: string): Promise<BodyExecution> {
  const doc = parseClean(src);
  const host = new InvokeHost();
  return executeBody(doc.body, { ...deps(host), env: buildEnvironment({ body: doc.body }) });
}

/** `ScriptedHost` whose `subagent fn` calls take the child-launch seam. */
class ChildLaunchHost extends InvokeHost {
  readonly launched: string[] = [];
  readonly #outcome: SubagentFnChildOutcome;

  constructor(outcome: SubagentFnChildOutcome) {
    super();
    this.#outcome = outcome;
  }

  runSubagentFnChild(request: { readonly fn: { readonly name: string } }): Promise<SubagentFnChildOutcome> {
    this.launched.push(request.fn.name);
    return Promise.resolve(this.#outcome);
  }
}

/** Parse clean, then execute with every `subagent fn` call answered by `outcome`. */
async function runViaChild(src: string, outcome: SubagentFnChildOutcome): Promise<BodyExecution> {
  const doc = parseClean(src);
  const host = new ChildLaunchHost(outcome);
  const execution = await executeBody(doc.body, { ...deps(host), env: buildEnvironment({ body: doc.body }) });
  expect(host.launched, "the call took the child-launch seam, not the in-process drive").toHaveLength(1);
  return execution;
}

const CHILD_OK_7: SubagentFnChildOutcome = { kind: "value", result: makeOk(7), source: "callee-returned" };

describe("bug 0510 FN-4 — a call to a `void`-annotated `subagent fn` yields null", () => {
  it.each([
    ["multi-statement", SF_MULTI],
    ["single-form", SF_SINGLE],
  ])("in-process: %s `subagent fn sf(): void {… g() }` binds null", async (_label, src) => {
    const execution = await runInProcess(src);
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(execution.result.value, "FN-4: a `void` subagent fn discards its tail value").toBeNull();
  });

  it("in-process control: the same body under `: number` yields the tail value", async () => {
    const execution = await runInProcess(SN_MULTI);
    expect(execution.result.value, "the non-void subagent fn's tail value crosses the boundary").toBe(7);
  });

  it.each([
    ["multi-statement", SF_MULTI],
    ["single-form", SF_SINGLE],
  ])("child launch: %s `void` subagent fn whose child returned 7 binds null", async (_label, src) => {
    const execution = await runViaChild(src, CHILD_OK_7);
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(execution.result.value, "FN-4: the child's tail value does not become the call's value").toBeNull();
  });

  it("child launch: an `Ok(x)` / `Err(e)` tail marker is a tail value, discarded for a `void` fn", async () => {
    const ok = await runViaChild(SF_MULTI, { kind: "value", result: makeOk(7), source: "callee-returned", fnTail: "ok" });
    expect(ok.result.value, "`fn_tail: ok` is the in-process value flow").toBeNull();
    const err = await runViaChild(SF_MULTI, {
      kind: "value",
      result: makeErr("e"),
      source: "callee-returned",
      fnTail: "err",
    });
    expect(err.result.value, "`fn_tail: err` is the in-process value flow").toBeNull();
  });

  it("child launch control: a `: number` subagent fn yields the child's value", async () => {
    const execution = await runViaChild(SN_MULTI, CHILD_OK_7);
    expect(execution.result.value, "the stubbed child value reaches the caller when not void").toBe(7);
  });

  it("child launch control: a `void` fn's callee-returned Err still wraps as InvokeCalleeError", async () => {
    const execution = await runViaChild(SF_MULTI, {
      kind: "value",
      result: makeErr({ kind: "invoke_infra", message: "m", callee_path: "sf", cause: "panic" }),
      source: "callee-returned",
    });
    const value = execution.result.value as { readonly ok?: boolean; readonly error?: { readonly kind?: string } };
    expect(value.ok, "the failure crosses as an Err").toBe(false);
    expect(value.error?.kind, "a callee-returned Err wraps once").toBe("invoke_callee");
  });

  it("child launch control: a `void` fn's boundary-minted Err crosses bare", async () => {
    const minted = makeErr({ kind: "invoke_infra", message: "m", callee_path: "sf", cause: "internal_error" });
    const execution = await runViaChild(SF_MULTI, { kind: "value", result: minted, source: "boundary-minted" });
    expect(execution.result.value, "a boundary-minted Err is the call's value unchanged").toEqual(minted);
  });

  it("child launch control: a `void` fn's cancellation stays a cancellation", async () => {
    const execution = await runViaChild(SF_MULTI, { kind: "cancelled" });
    expect(execution.outcome, "the caller's run ends cancelled, not with a null value").toBe("cancel");
  });
});

// ===========================================================================
// RET-3 — a block's tail expression after a `return` is unreachable code. The
// `?`-tail and BlockExpr cells are RED before the fix; the promoted-call cell
// and the no-return control are green before and after.
// ===========================================================================

/** Whether `doc` carries an `unreachable-code` diagnostic starting at `node`. */
function unreachableAt(doc: ThetaDocument, node: { readonly range: Expr["range"] } | null | undefined): boolean {
  if (node === null || node === undefined) {
    throw new Error("fixture block has no final form to judge");
  }
  const at = node.range.start;
  return doc.diagnostics.some(
    (d) =>
      d.code === UNREACHABLE_CODE && d.range?.start.line === at.line && d.range.start.column === at.column,
  );
}

/** The diagnostic codes of a parse, compared by code string only. */
function codesOf(src: string): string[] {
  return parseOnly(src).diagnostics.map((d) => d.code);
}

const PN = "fn pn(n: number): number { n }\n";

describe("bug 0510 RET-3 — a tail expression after a `return` draws unreachable-code", () => {
  it("R10: `{ return r()? ⏎ 2 }` warns on the tail `2`", () => {
    const doc = parseOnly(
      "fn r(): Result<number, string> { Ok(1) }\nfn f(): Result<number, string> { return r()?\n 2 }\nf()",
    );
    const body = fnBody(doc, "f");
    expect(shapeOf(body), "the `2` after the `?` is the tail").toBe("tail=number statements=[return]");
    expect(
      unreachableAt(doc, body.tail),
      `RET-3 on the tail. Codes: ${JSON.stringify(doc.diagnostics.map((d) => d.code))}`,
    ).toBe(true);
  });

  it("R11: BlockExpr `let r = { return 2 ⏎ 3 }` warns on the tail `3`", () => {
    const doc = parseOnly("let r = { return 2\n 3 }\nr");
    const letStmt = doc.body.statements.find((st): st is LetStmt => st.kind === "let");
    if (letStmt === undefined || letStmt.init === null || letStmt.init.kind !== "block") {
      throw new Error("fixture binds no `let r = { … }` block expression");
    }
    expect(
      unreachableAt(doc, letStmt.init.body.tail),
      `RET-3 on the BlockExpr tail. Codes: ${JSON.stringify(doc.diagnostics.map((d) => d.code))}`,
    ).toBe(true);
  });

  it("fn body `{ return 1 ⏎ pn(1) }` warns on the trailing call, whichever AST slot holds it", () => {
    // The call is a statement before the fix and the promoted tail after it;
    // either slot starts at the call, so the warning's position is the same.
    const doc = parseOnly(`${PN}fn f(): number { return 1\n pn(1) }\nf()`);
    const body = fnBody(doc, "f");
    expect(
      unreachableAt(doc, body.tail ?? body.statements[body.statements.length - 1]),
      `RET-3 on the trailing call. Codes: ${JSON.stringify(doc.diagnostics.map((d) => d.code))}`,
    ).toBe(true);
  });

  it("control: a tail call with no preceding `return` draws no unreachable-code", () => {
    const codes = codesOf(`${PN}fn f(): number { let a = 1\n pn(a) }\nf()`);
    expect(codes, `no return precedes the tail. Codes: ${JSON.stringify(codes)}`).not.toContain(UNREACHABLE_CODE);
  });
});

// ===========================================================================
// StmtBlock CONTROLS — an `if` / `for` / `while` body keeps the
// `lineStart`-gated promotion, so its static verdicts are identical before and
// after the fix.
// ===========================================================================

const ITEM = "schema Item { a: string }\n";
const CAT = "schema Cat { a: string }\n";
const ITEM_QUERY = "@<Item>`d ${p}`?";

describe("bug 0510 StmtBlock controls — if/for/while body tails are not value positions", () => {
  it.each([
    ["if-body `?`-query", `${ITEM}fn f(n: number) { if n > 0 { let p = "x"\n ${ITEM_QUERY} }\n n }\nf(1)`],
    ["for-body `?`-query", `${ITEM}fn f(n: number) { for i in [1] { let p = "x"\n ${ITEM_QUERY} }\n n }\nf(1)`],
    [
      "if-body `?`-query, `return n` last",
      `${ITEM}fn f(n: number) { if n > 0 { let p = "x"\n ${ITEM_QUERY} }\n return n }\nf(1)`,
    ],
    ["if-body ending in `match`", 'fn f(n: number) { if n > 0 { let p = 1\n match p { _ => "s" } }\n n }\nf(1)'],
    ["if-body ending in a string", 'fn f(n: number) { if n > 0 { let p = "x"\n "s" }\n n }\nf(1)'],
  ])("%s draws no return-no-common-type", (_label, src) => {
    const codes = codesOf(src);
    expect(
      codes,
      `a StmtBlock tail does not contribute to the fn's inferred return type. Codes: ${JSON.stringify(codes)}`,
    ).not.toContain(NO_COMMON_TYPE_CODE);
  });

  it("`if true { let z = 1 ⏎ Cat }` draws no type-as-value", () => {
    const codes = codesOf(`${CAT}if true { let z = 1\n Cat }`);
    expect(
      codes,
      `the StmtBlock's trailing schema name is a statement. Codes: ${JSON.stringify(codes)}`,
    ).not.toContain(TYPE_AS_VALUE_CODE);
  });

  it.each([
    ["top level", "let c = true\nif c { let z = 1\n @`q` }"],
    ["fn body", "fn f(c: boolean) { if c { let z = 1\n @`q` }\n 1 }\nf(true)"],
    ["for body", "for c in [true] { if c { let z = 1\n @`q` } }"],
    ["while body", "let c = false\nwhile c { let z = 1\n @`q` }"],
  ])("`if c { let z = 1 ⏎ @`q` }` at %s draws discarded-query-result", (_label, src) => {
    const codes = codesOf(src);
    expect(
      codes,
      `QRY-19: the StmtBlock's trailing query is a discarded statement. Codes: ${JSON.stringify(codes)}`,
    ).toContain(DISCARDED_QUERY_CODE);
  });
});

// ===========================================================================
// PROMOTED FnBody TAIL — verdicts the fix moves in the direction bug 0510
// §Fix direction predicts (static inference reads `Block.tail`). RED before
// the fix.
// ===========================================================================

/**
 * The `@`-query schemas of a trailing ternary of queries, in source order.
 * Read through `trailingExpr` so the schemas are observable whether the
 * ternary is the tail or a trailing `expr` statement.
 */
function ternaryQuerySchemas(tail: Expr | null): (string | null)[] {
  if (tail === null || tail.kind !== "ternary") {
    throw new Error(`fixture trailing expression is not a ternary: ${tail === null ? "null" : tail.kind}`);
  }
  return [tail.consequent, tail.alternate].map((e) => {
    if (e.kind !== "query") {
      throw new Error(`ternary branch is not a query: ${e.kind}`);
    }
    return e.schema;
  });
}

describe("bug 0510 inference — a multi-statement FnBody's tail is read as the fn's value", () => {
  it('P9: `subagent fn sf(): Item { let z = 1 ⏎ Item { a: "x" } }` draws no invoke-return-type-mismatch', () => {
    const codes = codesOf(`${ITEM}subagent fn sf(): Item { let z = 1\n Item { a: "x" } }\nsf()`);
    expect(codes, `the tail object is the declared Item. Codes: ${JSON.stringify(codes)}`).not.toContain(
      INVOKE_RETURN_MISMATCH_CODE,
    );
  });

  it("Q8: `fn f(c: boolean): Item { let z = 1 ⏎ c ? @`a` : @`b` }` resolves both query schemas to Item", () => {
    const doc = parseClean(`${ITEM}fn f(c: boolean): Item { let z = 1\n c ? @\`a\` : @\`b\` }\nf(true)`);
    expect(
      ternaryQuerySchemas(trailingExpr(fnBody(doc, "f"))),
      "QRY-2: the declared return type is the sink for the tail's queries",
    ).toEqual(["Item", "Item"]);
  });

  it("S1: `fn f() { let z = 1 ⏎ Cat }` draws type-as-value, as single-form `fn f() { Cat }` does", () => {
    const single = codesOf(`${CAT}fn f() { Cat }\nf()`);
    expect(single, `single-form reference. Codes: ${JSON.stringify(single)}`).toContain(TYPE_AS_VALUE_CODE);
    const multi = codesOf(`${CAT}fn f() { let z = 1\n Cat }\nf()`);
    expect(multi, `the tail schema name is a value position. Codes: ${JSON.stringify(multi)}`).toContain(
      TYPE_AS_VALUE_CODE,
    );
  });
});
