import { afterEach, describe, expect, it, vi } from "vitest";
import * as returns from "../src/parser/functions";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import { collectFnCallReturnTypes } from "../src/parser/fn-call-return-types";
import { collectLocalBinderNames } from "../src/parser/local-binders";
import { checkCompatible } from "../src/parser/type-compat";
import { inferCalleeReturnPayload } from "../src/parser/type-layer-checks";
import { TypeLayerWalk } from "../src/parser/type-layer-walk";
import {
  parseThetaDocument,
  type Block,
  type Expr,
  type FnDecl,
  type Stmt,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

// Supplemental coverage for the approved 0512 plan; the two recorded red
// witness files remain untouched. Full-source cells use the real frontend;
// AST cells isolate contribution-derived wrapping from the independent ? scan.
// No host turn, filesystem callee load or child execution is exercised here.
const FILE = "b0512-boundaries.theta";
const NO_COMMON = "theta/parse/return-no-common-type";
const MISMATCH = "theta/parse/invoke-return-type-mismatch";

function parse(source: string, allowed: readonly string[] = []): ThetaDocument {
  const doc = parseThetaDocument({
    path: FILE,
    bytes: new TextEncoder().encode("---\nmode: prompt\n---\n" + source),
  }, parseDeps());
  expect(doc.frontmatter, "fixture frontmatter must be valid").not.toBeNull();
  expect(doc.diagnostics.filter((d) => !allowed.includes(d.code)),
    "fixture must have no unrelated diagnostics").toEqual([]);
  return doc;
}

function onlyFn(doc: ThetaDocument): FnDecl {
  const fns = doc.body.statements.filter((s): s is FnDecl => s.kind === "fn");
  expect(fns).toHaveLength(1);
  return fns[0]!;
}

function ifBody(body: Block): Block {
  const statement = body.statements.find((s) => s.kind === "if");
  if (statement?.kind !== "if") throw new Error("fixture must contain an if");
  return statement.then;
}

describe("bug 0512 source boundary coverage", () => {
  it("discards a multi-form StmtBlock tail promoted after a postfix ?", () => {
    const doc = parse('schema Item { a: string }\nfn f(n: number) { if n > 0 { let p = @<Item>`d`?\n "s" }\n n }', [NO_COMMON]);
    const fn = onlyFn(doc);
    expect(fn.returnType).toBeNull();
    expect(fn.body.tail).toMatchObject({ kind: "ident", name: "n" });
    const nested = ifBody(fn.body);
    expect(nested.statements).toHaveLength(1);
    expect(nested.statements[0]).toMatchObject({ kind: "let", init: { kind: "try" } });
    expect(nested.tail).toMatchObject({ kind: "string", value: "s" });
    expect(doc.diagnostics, "FN-3 source: a ?-preceded discarded success tail must not reject the fn").toEqual([]);
  });

  it("infers null through the real callee adapter from a parsed empty-tail theta", () => {
    const doc = parse('let a = 1\nif a > 0 { "s" }');
    expect(doc.body.tail).toBeNull();
    expect(doc.body.statements.map((s) => s.kind)).toEqual(["let", "if"]);
    const nested = ifBody(doc.body);
    expect(nested.statements).toEqual([]);
    expect(nested.tail).toMatchObject({ kind: "string", value: "s" });
    expect(inferCalleeReturnPayload(doc.body, FILE, []),
      "FN-4 source: discarded StmtBlock value must leave the callee payload null",
    ).toEqual({ kind: "literal", typesAs: "null" });
  });

  it.each([
    ["boolean", true],
    ["number", false],
  ] as const)("checks an own numeric payload against subagent annotation %s", (annotation, incompatible) => {
    const doc = parse(`subagent fn sf(): ${annotation} { if false { "s" }\n 1.5 }`, [MISMATCH]);
    const fn = onlyFn(doc);
    expect(fn).toMatchObject({ subagent: true, returnType: annotation });
    expect(fn.body.tail).toMatchObject({ kind: "number", numericType: "number" });
    expect(ifBody(fn.body).tail).toMatchObject({ kind: "string", value: "s" });
    expect(doc.diagnostics.map((d) => d.code),
      "FN-6 source: only the own payload is checked against the annotation",
    ).toEqual(incompatible ? [MISMATCH] : []);
    if (incompatible) {
      expect(doc.diagnostics[0]).toMatchObject({ severity: "error", file: FILE, range: fn.range });
    }
  });

  it.each([
    ["string", true],
    ["null", false],
  ] as const)("checks empty-tail null against subagent annotation %s", (annotation, incompatible) => {
    const doc = parse(`subagent fn sf(): ${annotation} { if false { "s" } }`, [MISMATCH]);
    const fn = onlyFn(doc);
    expect(fn).toMatchObject({ subagent: true, returnType: annotation });
    expect(fn.body.tail).toBeNull();
    const nested = ifBody(fn.body);
    expect(nested.statements).toEqual([]);
    expect(nested.tail).toMatchObject({ kind: "string", value: "s" });
    expect(doc.diagnostics.map((d) => d.code),
      "FN-6 source: an empty own tail supplies null, not the discarded string",
    ).toEqual(incompatible ? [MISMATCH] : []);
    if (incompatible) {
      expect(doc.diagnostics[0]).toMatchObject({ severity: "error", file: FILE, range: fn.range });
    }
  });
});

const range = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
const number: Expr = { kind: "number", text: "1.5", numericType: "number", range };
const string: Expr = { kind: "string", value: "s", range };
const ok = (arg: Expr): Expr => ({ kind: "result-ctor", ctor: "Ok", arg, range });
const block = (statements: readonly Stmt[] = [], tail: Expr | null = null): Block => ({ statements, tail });
const branch = (body: Block): Stmt => ({
  kind: "if", condition: { kind: "bool", value: false, range }, then: body, otherwise: null, range,
});

function infer(body: Block) {
  const checker = new TypeLayerWalk(
    new StaticTypeInferencePass({ checkCompatible, enumNames: new Set(), fnCallReturnTypes: collectFnCallReturnTypes(body.statements, collectLocalBinderNames(body, [])) }),
    {}, FILE, new Map(), new Map(), new Set(), new Set(),
  );
  const resolve = vi.spyOn(returns, "resolveReturnType"); // observation only; real resolver runs
  checker.inferFinalValuePayload(body, new Map());
  expect(resolve).toHaveBeenCalledTimes(1);
  return { input: resolve.mock.calls[0]![0], output: resolve.mock.results[0]?.value };
}

afterEach(() => vi.restoreAllMocks());

describe("bug 0512 Result contribution ownership", () => {
  it("does not derive Result wrapping from a discarded Ok tail without ?", () => {
    const { input, output } = infer(block([branch(block([], ok(string)))], number));
    expect(input.hasQuestion).toBe(false);
    expect(input.contributions,
      "FN-3 wrapping: a discarded Result tail is not a contribution",
    ).toEqual([{ kind: "plain", type: { kind: "literal", typesAs: "number" } }]);
    expect(output).toEqual({
      kind: "inferred", inferred: { payload: { kind: "prim", name: "number" }, wrapped: false },
    });
  });

  it.each(["own tail", "nested return"] as const)("healthy control: a genuine Result %s still wraps without ?", (position) => {
    const body = position === "own tail"
      ? block([], ok(number))
      : block([branch(block([{ kind: "return", operand: ok(number), range }]))]);
    const { input, output } = infer(body);
    expect(input.hasQuestion).toBe(false);
    // StaticTypeInferencePass currently represents a constructor by its name
    // (static-type-inference.ts's result-ctor arm), not by its argument type.
    // Pin that existing representation; this control tests wrapping only.
    expect(input.contributions).toEqual([{ kind: "result", payload: { kind: "named", name: "Ok" } }]);
    expect(output).toEqual({
      kind: "inferred", inferred: { payload: { kind: "named", name: "Ok" }, wrapped: true },
    });
  });
});
