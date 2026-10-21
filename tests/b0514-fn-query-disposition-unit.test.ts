// B0514 focused runtime isolation. Real parser/environment/evalExpr/executeBody;
// ScriptedHost (bounded pure evaluation + query OperationResult), checkpoint,
// and conversation mutator are doubles.
// These are UNIT tests, not a replacement for the frozen production/live witnesses.
import { describe, expect, it } from "vitest";
import { parseThetaDocument, type Expr } from "../src/parser/theta-document";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import { evalExpr, executeBody } from "../src/runtime/statement-executor";
import { makeErr, makeOk, type ThetaValue } from "../src/runtime/value";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type { QueryError } from "../src/runtime/query-error";
import { parseDeps } from "./helpers/e2e-s1";
import { deps, RecordingCheckpoint, RecordingMutator, ScriptedHost } from "./helpers/invoke-seam-scaffold";

const ERROR: QueryError = {
  kind: "tool_loop_exhausted", message: "scripted exhaustion", rounds: 1,
  last_tool_name: "read", raw_response: null,
};
const outcomes: readonly [string, OperationResult, ThetaValue][] = [
  ["success", { ok: true, value: "PAYLOAD" }, makeOk("PAYLOAD")],
  ["failure", { ok: false, error: ERROR }, makeErr(ERROR as unknown as ThetaValue)],
];
const forms = [
  ["single tail", 'fn f() { @`q` }'],
  ["multi tail", 'fn f() { let z = 1\n @`q` }'],
  ["annotated tail", 'fn f(): Result<string, QueryError> { @`q` }'],
  ["explicit return", 'fn f() { return @`q` }'],
  ["nested return", 'fn f() { if true { return @`q` }\n @`unreached` }'],
  ["transitive tail", 'fn inner() { @`q` }\nfn f() { inner() }'],
] as const;

function fixture(source: string, result: OperationResult) {
  const doc = parseThetaDocument({
    path: "b0514-unit.theta", bytes: new TextEncoder().encode("---\nmode: prompt\n---\n" + source),
  }, parseDeps());
  expect(doc.diagnostics.filter(d => d.severity === "error"), "unit fixture parses cleanly").toEqual([]);
  const host = new ScriptedHost();
  host.results.set("query", result);
  const env = buildEnvironment({ body: doc.body });
  const checkpoint = new RecordingCheckpoint();
  const mutator = new RecordingMutator();
  return { doc, env, checkpoint, mutator, runtime: { ...deps(host), env, checkpoint, mutator } };
}

async function expression(source: string, result: OperationResult, terminal = false, transform: (expr: Expr) => Expr = expr => expr) {
  const f = fixture(source, result);
  const last = f.doc.body.statements.at(-1);
  const expr = f.doc.body.tail ?? (last?.kind === "let" ? last.init : null);
  if (expr === null) throw new Error("unit fixture requires a tail or final let initializer");
  const flow = await evalExpr(transform(expr), f.env, f.runtime, terminal);
  // One query, exactly once, no conversation compensation on any disposition.
  expect(f.checkpoint.kinds).toEqual(["tool-call"]); // ScriptedHost's query checkpoint kind.
  expect(f.mutator.calls).toEqual([]);
  return flow;
}

describe("B0514 query disposition unit isolation", () => {
  for (const [name, result, wrapped] of outcomes) {
    for (const [shape, declaration] of forms) {
      it(`value-position ${shape} ${name} carries exact Result`, async () => {
        const flow = await expression(declaration + "\nf()", result);
        expect(flow, "B0514 value-position fn must carry query Result, not raw payload or fail").toEqual({
          flow: "value", value: wrapped,
        });
      });

      it(`healthy terminal ${shape} ${name} keeps existing disposition`, async () => {
        expect(await expression(declaration + "\nf()", result, true)).toEqual(
          result.ok ? { flow: "value", value: result.value } : { flow: "fail", error: ERROR },
        );
      });
    }

    for (const source of ['@`q`', 'let probe = { @`q` }']) {
      it(`healthy direct/block ${source} ${name} carries Result in value position`, async () => {
        expect(await expression(source, result)).toEqual({ flow: "value", value: wrapped });
      });
      it(`healthy direct/block ${source} ${name} stays terminal`, async () => {
        expect(await expression(source, result, true)).toEqual(
          result.ok ? { flow: "value", value: result.value } : { flow: "fail", error: ERROR },
        );
      });
    }

    it(`healthy already-bound Result tail ${name} does not double wrap`, async () => {
      expect(await expression('fn f() { let s = @`q`\n s }\nf()', result)).toEqual({
        flow: "value", value: wrapped,
      });
    });

    for (const [position, caller, value] of [
      ["array", "[f()]", [wrapped]],
      ["object", "f()", { reply: wrapped }],
      ["argument", "identity(f())", wrapped],
    ] as const) {
      it(`value-position ${position} ${name} carries Result`, async () => {
        // Bare object syntax is restricted to externally typed positions. For
        // this UNIT cell construct the runtime object AST around the parsed call,
        // as the 0351/0387 seam tests do; no parser/schema conformance is claimed.
        const flow = await expression('fn identity(x) { x }\nfn f() { @`q` }\n' + caller, result, false,
          expr => position === "object"
            ? { kind: "object", typeName: null, fields: [{ name: "reply", value: expr }], range: expr.range }
            : expr);
        expect(flow, "B0514 composite/argument must carry Result without fail").toEqual({ flow: "value", value });
      });
    }

    it(`direct call match ${name} consumes Result`, async () => {
      const flow = await expression('fn f() { @`q` }\nmatch f() { Ok(v) => v, Err(e) => "HANDLED" }', result);
      expect(flow, "B0514 direct match must consume fn error, not fail").toEqual({
        flow: "value", value: result.ok ? "PAYLOAD" : "HANDLED",
      });
    });
    it(`direct call question ${name} unwraps or propagates`, async () => {
      const flow = await expression('fn f() { @`q` }\nf()?', result);
      expect(flow, "B0514 question must propagate fn Err through propagate flow, not fail").toEqual(
        result.ok ? { flow: "value", value: "PAYLOAD" } : { flow: "propagate", err: ERROR },
      );
    });

    it(`healthy top-level return query ${name} stays terminal`, async () => {
      const f = fixture('return @`q`', result);
      const exec = await executeBody(f.doc.body, f.runtime);
      expect(exec).toEqual(result.ok
        ? { outcome: "success", result: { present: true, value: "PAYLOAD" } }
        : { outcome: "fail", result: { present: false }, error: ERROR });
    });
  }

  it("structured query payload remains an exact Result at the fn boundary", async () => {
    const payload = { score: 7 };
    const flow = await expression('schema Reply { score: number }\nfn f() { @<Reply>`q` }\nf()', { ok: true, value: payload });
    expect(flow, "B0514 typed payload must be wrapped once at value-position fn").toEqual({
      flow: "value", value: makeOk(payload),
    });
  });

  for (const [shape, declaration] of forms) {
    for (const terminal of [false, true]) {
      it(`healthy cancellation ${shape}, terminal=${terminal}, is never a Result`, async () => {
        expect(await expression(declaration + "\nf()", {
          ok: false, error: { kind: "cancelled", message: "scripted cancellation" },
        }, terminal)).toEqual({ flow: "cancel" });
      });
    }
  }

  it("healthy explicit question in fn still returns Err from that activation", async () => {
    expect(await expression('fn f() { @`q`?\n "unreached" }\nf()', { ok: false, error: ERROR })).toEqual({
      flow: "value", value: makeErr(ERROR as unknown as ThetaValue),
    }); // Explicit ? returns Err from this activation; do not reclassify it as a query tail.
  });
});
