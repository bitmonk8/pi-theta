// Additional B0514 scope/isolation controls. Real parser, import materializer,
// environment and executor; effects/checkpoints/session hooks are deterministic
// doubles. Not real child/provider coverage (the frozen H9a witness supplies it).
import { describe, expect, it } from "vitest";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { parseThetaDocument, type Expr } from "../src/parser/theta-document";
import { buildEnvironment, type LexicalEnvironment } from "../src/runtime/lexical-environment";
import { evalExpr, executeBody, type ExecuteBodyDeps } from "../src/runtime/statement-executor";
import { newInvokeChain } from "../src/runtime/invoke-depth-cycle";
import { IndexOutOfBoundsPanic } from "../src/runtime/runtime-panics";
import { makeErr, makeOk, type ThetaValue } from "../src/runtime/value";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type { QueryError } from "../src/runtime/query-error";
import { parseDeps } from "./helpers/e2e-s1";
import { bindImportedBody } from "./helpers/thetalib-load-harness";
import { deps, RecordingCheckpoint, RecordingMutator, ScriptedHost } from "./helpers/invoke-seam-scaffold";

const ERROR: QueryError = {
  kind: "tool_loop_exhausted", message: "scripted exhaustion", rounds: 1,
  last_tool_name: "read", raw_response: null,
};
const ERROR_VALUE = ERROR as unknown as ThetaValue;
const cases: readonly [string, OperationResult, ThetaValue][] = [
  ["success", { ok: true, value: "PAYLOAD" }, makeOk("PAYLOAD")],
  ["failure", { ok: false, error: ERROR }, makeErr(ERROR_VALUE)],
];
class Host extends ScriptedHost {
  readonly effects: string[] = [];
  readonly sessions: string[] = [];
  override evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    // par-for resolves its pure iterand through the host, not evalExpr's
    // composite decomposition. Extend the bounded double for this fixture.
    if (expr.kind === "array") return expr.elements.map(e => this.evaluatePure(e, env));
    return super.evaluatePure(expr, env);
  }
  override runEffect(expr: Expr): Promise<OperationResult> {
    this.effects.push(expr.kind);
    return super.runEffect(expr);
  }
  spawnSubagentSession(): void { this.sessions.push("enter"); }
  exitSubagentSession(): void { this.sessions.push("exit"); }
}
function fixture(source: string, result: OperationResult = { ok: true, value: "PAYLOAD" }) {
  const doc = parseThetaDocument({ path: "b0514-controls.theta", bytes: new TextEncoder().encode(
    "---\nmode: prompt\n---\n" + source,
  ) }, parseDeps());
  expect(doc.diagnostics.filter(d => d.severity === "error"), "control fixture parses cleanly").toEqual([]);
  const host = new Host();
  host.results.set("query", result);
  host.results.set("invoke", result);
  const env = buildEnvironment({ body: doc.body });
  const checkpoint = new RecordingCheckpoint();
  const mutator = new RecordingMutator();
  const runtime: ExecuteBodyDeps = { ...deps(host), env, checkpoint, mutator };
  return { doc, host, checkpoint, mutator, runtime };
}
async function expression(f: ReturnType<typeof fixture>, terminal = false) {
  if (f.doc.body.tail === null) throw new Error("control requires expression tail");
  return evalExpr(f.doc.body.tail, f.runtime.env, f.runtime, terminal);
}
function unchangedConversation(f: ReturnType<typeof fixture>, kinds: readonly string[] = ["tool-call"]) {
  expect(f.checkpoint.kinds).toEqual(kinds);
  expect(f.host.effects).toEqual(["query"]);
  expect(f.mutator.calls).toEqual([]);
}

describe("B0514 activation boundaries and compatibility", () => {
  for (const [name, outcome, wrapped] of cases) {
    for (const [shape, body, checkpoints] of [
      ["for", 'for n in [1] { return @`q` }\n @`unreached`', ["loop-iter", "tool-call"]],
      ["while", 'while true { return @`q` }\n @`unreached`', ["loop-iter", "tool-call"]],
      ["BlockExpr", 'let x = { return @`q`\n "unreached" }\n @`unreached`', ["tool-call"]],
    ] as const) {
      for (const terminal of [false, true]) {
        it(`${shape} return ${name}, terminal=${terminal}, uses activation not nearest block`, async () => {
          const f = fixture(`fn f() { ${body} }\nf()`, outcome);
          expect(await expression(f, terminal)).toEqual(terminal
            ? outcome.ok ? { flow: "value", value: "PAYLOAD" } : { flow: "fail", error: ERROR }
            : { flow: "value", value: wrapped });
          unchangedConversation(f, checkpoints);
        });
      }
    }

    it(`consumed outer/terminal inner ${name} overrides false and preserves earlier unhandled failure`, async () => {
      const f = fixture('fn inner() { return @`q` }\nfn outer() { inner()\n "after" }\nouter()', outcome);
      expect(await expression(f)).toEqual(outcome.ok
        ? { flow: "value", value: "after" } : { flow: "fail", error: ERROR });
      unchangedConversation(f);
    });
    it(`terminal outer/consumed inner ${name} overrides true without mutating parent`, async () => {
      const f = fixture('fn inner() { return @`q` }\nfn outer() { let r = inner()\n return r }\nouter()', outcome);
      expect(await expression(f, true)).toEqual({ flow: "value", value: wrapped });
      unchangedConversation(f);
    });
    it(`return inside argument BlockExpr ${name} still belongs to caller`, async () => {
      const f = fixture('fn identity(x) { x }\nfn outer() { identity(match 1 { _ => { return @`q`\n "unreached" } })\n @`unreached` }\nouter()', outcome);
      expect(await expression(f)).toEqual({ flow: "value", value: wrapped });
      unchangedConversation(f);
    });
    it(`already bound Result via explicit return and nested identity ${name} is not rewrapped`, async () => {
      const f = fixture('fn identity(x) { x }\nfn f() { let r = @`q`\n return identity(r) }\nf()', outcome);
      expect(await expression(f)).toEqual({ flow: "value", value: wrapped });
      unchangedConversation(f);
    });

    for (const terminal of [false, true]) {
      it(`void explicit query return ${name}, terminal=${terminal}, keeps existing behavior (not QRY-20 conformance)`, async () => {
        const f = fixture('fn f(): void { return @`q` }\nf()', outcome);
        expect(await expression(f, terminal)).toEqual(outcome.ok
          ? { flow: "value", value: null } : { flow: "fail", error: ERROR });
        unchangedConversation(f);
      });
    }
    for (const chain of [false, true]) {
      it(`isolated in-process subagent return ${name}, chain=${chain}, resets inherited consumption`, async () => {
        const f = fixture('subagent fn isolated() { return @`q` }\nfn outer() { isolated() }\nouter()', outcome);
        if (f.doc.body.tail === null) throw new Error("missing tail");
        const runtime = { ...f.runtime, ...(chain ? { invokeChain: newInvokeChain() } : {}) };
        const flow = await evalExpr(f.doc.body.tail, runtime.env, runtime);
        expect(flow).toEqual(outcome.ok ? { flow: "value", value: "PAYLOAD" } : {
          flow: "value", value: makeErr({ kind: "invoke_callee", message: "subagent fn isolated callee returned Err", inner: ERROR_VALUE, callee_path: "isolated" }),
        });
        expect(f.host.sessions).toEqual(["enter", "exit"]);
        unchangedConversation(f);
      });
    }
    it(`new theta root ${name} resets a reused consumed-return deps bundle`, async () => {
      const f = fixture('return @`q`', outcome);
      expect(await executeBody(f.doc.body, { ...f.runtime, returnAtTerminal: false })).toEqual(outcome.ok
        ? { outcome: "success", result: { present: true, value: "PAYLOAD" } }
        : { outcome: "fail", result: { present: false }, error: ERROR });
      expect(f.runtime.returnAtTerminal).toBeUndefined();
      unchangedConversation(f);
    });

    for (const explicitReturn of [false, true]) {
      for (const terminal of [false, true]) {
        it(`materialized imported sibling ${name}, return=${explicitReturn}, terminal=${terminal}`, async () => {
          const { app, check, binding } = await bindImportedBody(
            'import { f } from "./lib.thetalib"\nf()',
            { "/proj/lib.thetalib": `fn sibling() { @\`q\` }\nfn f() { ${explicitReturn ? "return " : ""}sibling() }\n` },
            {} as ModelRegistry,
          );
          expect(app.diagnostics).toEqual([]);
          expect(check.diagnostics).toEqual([]);
          expect(check.imports.map(i => `${i.kind} ${i.name}`)).toEqual(["fn f"]);
          if (app.body.tail === null) throw new Error("missing app tail");
          const host = new Host(); host.results.set("query", outcome);
          const runtime = { ...binding.executeDeps, host };
          expect(await evalExpr(app.body.tail, runtime.env, runtime, terminal)).toEqual(terminal
            ? outcome.ok ? { flow: "value", value: "PAYLOAD" } : { flow: "fail", error: ERROR }
            : { flow: "value", value: wrapped });
          expect(host.effects).toEqual(["query"]);
        });
      }
    }
  }

  for (const [source, value] of [
    ['fn inner() { 7 }\nfn f() { inner() }\nf()', 7],
    ['fn f() { }\nf()', null],
    ['fn f() { Ok(7) }\nf()', makeOk(7)],
    ['fn f() { Err("e") }\nf()', makeErr("e")],
  ] as const) {
    it(`pure/empty/constructor values remain unchanged: ${source}`, async () => {
      const f = fixture(source);
      expect(await expression(f)).toEqual({ flow: "value", value });
      expect(f.checkpoint.kinds).toEqual([]);
      expect(f.host.effects).toEqual([]);
    });
  }

  it("a sibling consumed call cannot change a later terminal explicit return", async () => {
    const f = fixture('fn consumed() { return @`q` }\nfn terminal() { return @`q` }\nlet r = consumed()\nterminal()');
    expect(await executeBody(f.doc.body, f.runtime)).toEqual({ outcome: "success", result: { present: true, value: "PAYLOAD" } });
    expect(f.host.effects).toEqual(["query", "query"]);
    expect(f.checkpoint.kinds).toEqual(["tool-call", "tool-call"]);
    expect(f.runtime.returnAtTerminal).toBeUndefined();
  });

  for (const terminal of [false, true]) {
    it(`void cancellation terminal=${terminal} bypasses Result handlers`, async () => {
      const f = fixture('fn f(): void { return @`q` }\nf()', { ok: false, error: { kind: "cancelled", message: "scripted cancel" } });
      expect(await expression(f, terminal)).toEqual({ flow: "cancel" });
      unchangedConversation(f);
    });
  }
  it("cancellation in a consumed call bypasses caller match", async () => {
    const f = fixture('fn f() { return @`q` }\nmatch f() { Ok(v) => "ok", Err(e) => "handled" }', { ok: false, error: { kind: "cancelled", message: "scripted cancel" } });
    expect(await expression(f)).toEqual({ flow: "cancel" });
    unchangedConversation(f);
  });
  it("panic in a consumed call bypasses match, preserving leaf site and fn call frame", async () => {
    const f = fixture('fn f() { let r = @`q`\n [1][9] }\nmatch f() { Ok(v) => "ok", Err(e) => "handled" }');
    const decl = f.doc.body.statements.find(s => s.kind === "fn");
    const match = f.doc.body.tail;
    if (decl?.kind !== "fn" || match?.kind !== "match") throw new Error("missing parsed sites");
    const thrown = await expression(f).then(() => { throw new Error("expected panic"); }, (e: unknown) => e);
    expect(thrown).toBeInstanceOf(IndexOutOfBoundsPanic);
    const panic = thrown as IndexOutOfBoundsPanic;
    expect(panic.site).toEqual({ file: f.runtime.file, range: decl.body.tail?.range });
    expect(panic.frames).toEqual([{ kind: "fn", name: "f", file: f.runtime.file, range: match.scrutinee.range }]);
    unchangedConversation(f); // Completed query was neither repeated nor compensated.
  });

  // Invoke is permitted in par-for. Raw operation payloads isolate the shared
  // disposition/normalizer seam; production invoke already carries Result.
  // These cells do not authorize conversation queries in concurrent lanes.
  for (const [name, outcome, wrapped] of cases) {
    for (const consumed of [false, true]) {
      it(`par-for ${name}, consumed=${consumed}, retains only the intended Result layers`, async () => {
        const f = fixture('fn f(n: number) { invoke("./c.theta", n) }\nlet rs = par for n in [1] max 1 {\n' +
          (consumed ? ' let r = f(n)\n r' : ' f(n)') + '\n}\nrs', outcome);
        expect(await executeBody(f.doc.body, f.runtime)).toEqual({ outcome: "success", result: {
          present: true, value: [consumed ? makeOk(wrapped) : outcome.ok ? makeOk("PAYLOAD") : makeErr(ERROR_VALUE)],
        } });
        expect(f.host.effects).toEqual(["invoke"]);
        expect(f.mutator.calls).toEqual([]);
      });
    }
  }
});
