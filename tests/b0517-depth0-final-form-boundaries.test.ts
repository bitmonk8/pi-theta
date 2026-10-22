// Supplemental 0517 coverage; frozen red witnesses remain unchanged.
// Real frontend/environment/executor, deterministic effect/checkpoint doubles.
// This does not replace the real-child/provider witnesses or fix 0513/0515/0516.
import { describe, expect, it } from "vitest";
import { parseThetaDocument, type Expr } from "../src/parser/theta-document";
import { inferCalleeReturnPayload } from "../src/parser/type-layer-checks";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import { executeBody } from "../src/runtime/statement-executor";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type { QueryError } from "../src/runtime/query-error";
import { IndexOutOfBoundsPanic } from "../src/runtime/runtime-panics";
import { parseDeps } from "./helpers/e2e-s1";
import { deps, ScriptedHost, RecordingCheckpoint, RecordingMutator } from "./helpers/invoke-seam-scaffold";

const FILE = "b0517-boundaries.theta";
function parse(source: string, expectedCodes: readonly string[] = []) {
  const doc = parseThetaDocument({ path: FILE, bytes: new TextEncoder().encode(
    "---\nmode: prompt\n---\n" + source,
  ) }, parseDeps());
  expect(doc.frontmatter).not.toBeNull();
  expect(doc.diagnostics.map(d => d.code), "boundary fixture must have exactly the expected diagnostics").toEqual(expectedCodes);
  return doc;
}

class Host extends ScriptedHost {
  readonly effects: string[] = [];
  override runEffect(expr: Expr): Promise<OperationResult> {
    if (expr.kind !== "query") throw new Error("boundary fixture must dispatch only queries");
    this.effects.push(expr.template);
    return super.runEffect(expr);
  }
}
function fixture(source: string, result: OperationResult = { ok: true, value: "PAYLOAD" }, expectedCodes: readonly string[] = []) {
  const doc = parse(source, expectedCodes);
  const host = new Host();
  host.results.set("query", result);
  const checkpoint = new RecordingCheckpoint();
  const mutator = new RecordingMutator();
  const runtime = { ...deps(host), file: FILE, env: buildEnvironment({ body: doc.body }), checkpoint, mutator };
  return { doc, host, checkpoint, mutator, run: () => executeBody(doc.body, runtime) };
}

const layouts = [
  { name: "own-line", before: "42\n" },
  { name: "alias-joined", before: "schema X = array<integer>\n" },
  { name: "packed", before: "42 " },
] as const;

// The literal payload proves static readers see the actual structural tail,
// not the executor's generic expr-statement fallback. Call-name inference is
// separately owned by 0513 and is deliberately not used as this oracle.
describe("0517 final-form static payload", () => {
  it.each([
    ["42\n43", "43"], ["42 43", "43"],
    ["schema X = array<integer>\n7", "7"], ["42\n7", "7"],
  ])("%s infers the final literal rather than empty-tail null", (source, text) => {
    const doc = parse(source);
    expect(doc.body.tail).toMatchObject({ kind: "number", text, numericType: "integer" });
    expect(inferCalleeReturnPayload(doc.body, FILE, [])).toEqual({ kind: "prim", name: "integer" });
  });
});

describe("0517 sequencing and terminal boundaries", () => {
  for (const { name, before } of layouts) {
    it(`${name}: a non-final call runs once before the actual tail`, async () => {
      const f = fixture('fn first() { @`first` }\nfn last() { @`last` }\nfirst()\n' + before + "last()");
      expect(f.doc.body.tail).toMatchObject({ kind: "call", callee: "last" });
      expect(await f.run()).toEqual({ outcome: "success", result: { present: true, value: "PAYLOAD" } });
      expect(f.host.effects).toEqual(["first", "last"]);
      expect(f.checkpoint.kinds).toEqual(["tool-call", "tool-call"]);
      expect(f.mutator.calls).toEqual([]);
    });

    it(`${name}: void call discards its successful final payload`, async () => {
      const f = fixture('fn final(): void { @`void` }\n' + before + "final()");
      expect(f.doc.body.tail).toMatchObject({ kind: "call", callee: "final" });
      expect(await f.run()).toEqual({ outcome: "success", result: { present: true, value: null } });
      expect(f.host.effects).toEqual(["void"]);
      expect(f.mutator.calls).toEqual([]);
    });

    const failure: QueryError = { kind: "tool_loop_exhausted", message: "scripted exhaustion", rounds: 1,
      last_tool_name: "read", raw_response: null };
    const cancelled: QueryError = { kind: "cancelled", message: "scripted cancel" };
    for (const [label, error, outcome] of [
      ["failure", failure, "fail"], ["cancellation", cancelled, "cancel"],
    ] as const) {
      it(`${name}: final call ${label} has no success value`, async () => {
        const f = fixture('fn final() { @`terminal` }\n' + before + "final()", { ok: false, error });
        const execution = await f.run();
        expect(execution.outcome).toBe(outcome);
        expect(execution.result).toEqual({ present: false });
        if (outcome === "fail") expect(execution).toMatchObject({ error });
        expect(f.host.effects).toEqual(["terminal"]);
        expect(f.checkpoint.kinds).toEqual(["tool-call"]);
        expect(f.mutator.calls).toEqual([]);
      });
    }

    it(`${name}: final call panic bypasses success after a completed effect`, async () => {
      const f = fixture('fn final() { let r = @`before panic`\n [1][9] }\n' + before + "final()");
      await expect(f.run()).rejects.toBeInstanceOf(IndexOutOfBoundsPanic);
      expect(f.host.effects).toEqual(["before panic"]);
      expect(f.mutator.calls).toEqual([]);
    });
  }

  it("explicit return dominates a packed later call", async () => {
    // 0515 owns missing unreachable-tail warnings; this asserts execution only.
    const f = fixture('fn final() { @`unreached` }\nreturn 9\n42 final()', undefined, ["theta/parse/unreachable-code"]);
    expect(f.doc.diagnostics[0]).toMatchObject({
      severity: "warning", code: "theta/parse/unreachable-code", file: FILE,
      message: "unreachable code after return",
      range: { start: { line: 6, column: 1 }, end: { line: 6, column: 3 } },
    });
    expect(f.doc.body.tail).toMatchObject({ kind: "call", callee: "final" });
    expect(await f.run()).toEqual({ outcome: "success", result: { present: true, value: 9 } });
    expect(f.host.effects).toEqual([]);
    expect(f.checkpoint.kinds).toEqual([]);
    expect(f.mutator.calls).toEqual([]);
  });

  it.each(["", "42 let x = 1", "let x = 1"])("statement-final or empty body %j stays null", async source => {
    const f = fixture(source);
    expect(f.doc.body.tail).toBeNull();
    expect(inferCalleeReturnPayload(f.doc.body, FILE, [])).toEqual({ kind: "literal", typesAs: "null" });
    expect(await f.run()).toEqual({ outcome: "success", result: { present: true, value: null } });
    expect(f.host.effects).toEqual([]);
  });

  it("a failed non-final call short-circuits the newly structural final call", async () => {
    const error: QueryError = { kind: "cancelled", message: "scripted cancel" };
    const f = fixture('fn first() { @`first` }\nfn last() { @`unreached` }\nfirst()\n42 last()', { ok: false, error });
    expect(await f.run()).toMatchObject({ outcome: "cancel", result: { present: false } });
    expect(f.host.effects).toEqual(["first"]);
    expect(f.mutator.calls).toEqual([]);
  });
});
