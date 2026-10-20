import { afterEach, describe, expect, it, vi } from "vitest";
import * as returns from "../src/parser/functions";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import { checkCompatible, type CompatType } from "../src/parser/type-compat";
import { checkTypeLayer, inferCalleeReturnPayload } from "../src/parser/type-layer-checks";
import { TypeLayerWalk } from "../src/parser/type-layer-walk";
import type { Block, Expr, FnDecl, Stmt } from "../src/parser/theta-document";

// Unit isolation: real TypeLayerWalk + StaticTypeInferencePass + return resolver,
// with hand-built ASTs to remove the parser's line-start promotion state.
// These are not host/runtime/subagent-launch tests. FN-3 / FN-4 and
// grammar.md's StmtBlock discard rule are the expected contract.
const range = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
const number: Expr = { kind: "number", text: "1.5", numericType: "number", range };
const string: Expr = { kind: "string", value: "discarded", range };
const condition: Expr = { kind: "bool", value: false, range };
const numberType: CompatType = { kind: "prim", name: "number" };
const nullType: CompatType = { kind: "literal", typesAs: "null" };
const block = (statements: readonly Stmt[] = [], tail: Expr | null = null): Block => ({ statements, tail });
const ret = (operand: Expr): Stmt => ({ kind: "return", operand, range });
const fn = (body: Block, returnType: string | null = null, subagent = false): FnDecl => ({
  kind: "fn", name: "f", params: [], body, returnType, subagent, range,
});
const branch = (then: Block, otherwise: Block | null = null): Stmt => ({
  kind: "if", condition, then, otherwise, range,
});
const shapes: readonly (readonly [string, (body: Block) => Stmt])[] = [
  ["if", (body) => branch(body)],
  ["else", (body) => branch(block(), body)],
  ["else-if", (body) => ({ kind: "if", condition, then: block(), otherwise: {
    kind: "if", condition, then: body, otherwise: null, range,
  }, range })],
  ["while", (body) => ({ kind: "while", condition, body, range })],
  ["for", (body) => ({ kind: "for", variable: "i", iterand: {
    kind: "array", elements: [number], range,
  }, body, range })],
  ["deep if/while", (body) => branch(block([{
    kind: "while", condition, body, range,
  }]))],
];

function checker(): TypeLayerWalk {
  return new TypeLayerWalk(
    new StaticTypeInferencePass({ checkCompatible, enumNames: new Set() }),
    {}, "b0512-unit.theta", new Map(), new Map(), new Set(), new Set(),
  );
}

function payload(body: Block): CompatType | undefined {
  return checker().inferFinalValuePayload(body, new Map());
}

afterEach(() => vi.restoreAllMocks());

describe.each(shapes)("bug 0512 collector unit — %s", (_label, nest) => {
  it("discards a nested success tail beside the body's own number tail", () => {
    expect(payload(block([nest(block([], string))], number)),
      "FN-3 unit: only the owning body's tail supplies an implicit return payload",
    ).toEqual(numberType);
  });

  it("retains FN-4 null when only nested StmtBlocks have tails", () => {
    expect(payload(block([nest(block([], string))])),
      "FN-4 unit: a discarded nested tail must not replace empty-tail null",
    ).toEqual(nullType);
  });

  it("collects a nested explicit return but not its following discarded tail", () => {
    expect(payload(block([nest(block([ret(number)], string))], number)),
      "FN-3 unit: nested return operands contribute, nested success tails do not",
    ).toEqual(numberType);
  });

  it("healthy control: a conflicting explicit nested return still has no common type", () => {
    expect(payload(block([nest(block([ret(string)]))], number))).toBeUndefined();
  });

  it("healthy control: an agreeing explicit nested return still contributes with no own tail", () => {
    expect(payload(block([nest(block([ret(number)]))]))).toEqual(numberType);
  });
});

describe("bug 0512 collector boundaries", () => {
  it("healthy control: an empty body has the literal null payload", () => {
    expect(payload(block())).toEqual(nullType);
  });

  it("healthy control: a nested fn owns its returns and tail", () => {
    // Such declarations have a separate placement refusal. This unit only
    // checks collector ownership, not whether the source is admitted.
    expect(payload(block([fn(block([ret(string)], string))], number))).toEqual(numberType);
  });

  it("healthy control: a nested ? statement still wraps an empty-tail body", () => {
    const resolve = vi.spyOn(returns, "resolveReturnType");
    const question: Expr = { kind: "try", operand: {
      kind: "query", schema: "string", template: "task", range,
    }, range };
    expect(payload(block([branch(block([{
      kind: "expr", expr: question, range,
    }]))]))).toEqual(nullType);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0]![0]).toMatchObject({ contributions: [], hasQuestion: true });
    expect(resolve.mock.results[0]?.value).toEqual({
      kind: "inferred", inferred: { payload: nullType, wrapped: true },
    });
  });

  it("preserves nested ? wrapping without taking its success type as a contribution", () => {
    // Observe the real resolver, without substituting an implementation or
    // fabricating its result. This public payload seam otherwise hides wrapped.
    const resolve = vi.spyOn(returns, "resolveReturnType");
    const question: Expr = { kind: "try", operand: {
      kind: "query", schema: "string", template: "task", range,
    }, range };
    const body = block([branch(block([], question))], number);
    const actual = payload(body);
    expect(resolve).toHaveBeenCalledTimes(1);
    const input = resolve.mock.calls[0]![0];
    expect(input.hasQuestion, "? in a discarded StmtBlock still forces Result wrapping").toBe(true);
    expect(input.contributions,
      "FN-3 unit: nested ? forces wrapping, not a success-payload contribution",
    ).toEqual([{ kind: "plain", type: { kind: "literal", typesAs: "number" } }]);
    expect(resolve.mock.results[0]?.value).toEqual({
      kind: "inferred", inferred: { payload: numberType, wrapped: true },
    });
    expect(actual).toEqual(numberType);
  });

  it("cross-file payload adapter retains FN-4 null instead of the nested string", () => {
    const body = block([branch(block([], string))]);
    expect(inferCalleeReturnPayload(body, "callee.theta", []),
      "FN-4 unit: cross-file callee payload is null, not a discarded StmtBlock value",
    ).toEqual(nullType);
  });

  it("annotated subagent checker must not bypass an incompatible own tail", () => {
    const body = block([branch(block([], string))], number);
    const diagnostics = checkTypeLayer(block([fn(body, "boolean", true)]), "unit.theta", []);
    expect(diagnostics.map((d) => d.code),
      "FN-6 unit: discarded nested tail must not suppress the boundary mismatch",
    ).toEqual(["theta/parse/invoke-return-type-mismatch"]);
  });

  it("annotated subagent checker must use empty-tail null, not a nested string", () => {
    const diagnostics = checkTypeLayer(block([
      fn(block([branch(block([], string))]), "string", true),
    ]), "unit.theta", []);
    expect(diagnostics.map((d) => d.code),
      "FN-6 unit: empty-tail null must be checked against the subagent payload annotation",
    ).toEqual(["theta/parse/invoke-return-type-mismatch"]);
  });

  it("healthy control: annotated subagent own payload is checked normally", () => {
    expect(checkTypeLayer(block([fn(block([], number), "number", true)]), "unit.theta", [])).toEqual([]);
    expect(checkTypeLayer(block([fn(block([], number), "boolean", true)]), "unit.theta", [])
      .map((d) => d.code)).toEqual(["theta/parse/invoke-return-type-mismatch"]);
  });
});
