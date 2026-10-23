import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveReturnType } from "../src/parser/functions";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import { checkCompatible, type CompatType } from "../src/parser/type-compat";
import { checkTypeLayer, inferCalleeReturnPayload } from "../src/parser/type-layer-checks";
import type { Block, CallExpr, Expr, FnDecl, Stmt } from "../src/parser/theta-document";

// Unit boundary: hand-built AST -> real type-layer composition / inference /
// compatibility engine. Removes lexer and structural-tail promotion from the
// witness. Spies below call through; no type, callee table or verdict is mocked.
// A standalone pass cannot receive written fn returns through its current API,
// so observe the pass actually constructed by the production composition seam.
// This is NOT cross-file loading, a runtime call or a subagent launch test.
const range = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
const FILE = "b0513-unit.theta";
const string: Expr = { kind: "string", value: "a", range };
const integer: Expr = { kind: "number", text: "1", numericType: "integer", range };
const boolean: Expr = { kind: "bool", value: true, range };
const stringType: CompatType = { kind: "prim", name: "string" };
const integerType: CompatType = { kind: "prim", name: "integer" };
const nullType: CompatType = { kind: "literal", typesAs: "null" };
const block = (statements: readonly Stmt[] = [], tail: Expr | null = null): Block => ({ statements, tail });
const call = (callee = "g"): CallExpr => ({ kind: "call", callee, args: [], range });
const fn = (name: string, returnType: string | null, body: Block, subagent = false): FnDecl => ({
  kind: "fn", name, returnType, body, subagent, params: [], range,
});
const decl = (returnType: string | null = "string"): FnDecl => fn("g", returnType, block([], string));
const letStmt = (name: string, init: Expr, annotation: string | null = null): Stmt => ({
  kind: "let", name, init, annotation, mutable: false, range,
});
const ret = (operand: Expr): Stmt => ({ kind: "return", operand, range });
const branch = (body: Block, condition: Expr = boolean): Stmt => ({
  kind: "if", condition, then: body, otherwise: null, range,
});
const codes = (body: Block): string[] => checkTypeLayer(body, FILE, []).map((d) => d.code);

/** Read a real call result at the typeOf seam used by the production walk. */
function observedCallType(body: Block, site: CallExpr, params: readonly { name: string; typeSource: string }[] = []): CompatType {
  const read = vi.spyOn(StaticTypeInferencePass.prototype, "typeOf");
  expect(checkTypeLayer(body, FILE, params), "observation fixture has no unrelated diagnostic").toEqual([]);
  const index = read.mock.calls.findIndex(([node]) => node === site);
  expect(index, "the production walk must actually type this call node").toBeGreaterThanOrEqual(0);
  const result = read.mock.results[index];
  expect(result?.type).toBe("return");
  return result!.value as CompatType;
}

afterEach(() => vi.restoreAllMocks());

describe("bug 0513 unit: written same-file return types reach the pass", () => {
  const annotations: readonly (readonly [string, CompatType])[] = [
    ["string", stringType],
    ["integer", integerType],
    ["number", { kind: "prim", name: "number" }],
    ["boolean", { kind: "prim", name: "boolean" }],
    ["null", { kind: "prim", name: "null" }],
    ["array<string>", { kind: "array", element: stringType }],
    ["integer | string", { kind: "union", arms: [integerType, stringType] }],
    ["Item", { kind: "named", name: "Item" }],
    ["Result<string, QueryError>", { kind: "named", name: "Result<string, QueryError>" }],
    ["void", nullType],
  ];
  for (const [annotation, expected] of annotations) {
    it(`uses the declared ${annotation} return, not the callee name`, () => {
      const site = call();
      // Unit ASTs exercise annotation conversion, not validity of a fn's body
      // against that annotation (a different check). Named references remain
      // nominal, Result remains opaque, and void produces null, never void.
      const actual = observedCallType(block([decl(annotation), letStmt("x", site)]), site);
      expect(actual, "B0513 unit: written return annotation must type the call value").toEqual(expected);
    });
  }

  it("hoists an annotated declaration for a preceding call", () => {
    const site = call();
    expect(observedCallType(block([letStmt("x", site), decl()]), site),
      "B0513 unit: forward annotated call must type as string",
    ).toEqual(stringType);
  });
});

describe("bug 0513 unit: downstream readers, independent of parsing", () => {
  it("FN-3 refuses incompatible explicit-return and call-tail contributions", () => {
    const body = block([decl(), fn("f", null, block([branch(block([ret(integer)]))], call()))]);
    expect(codes(body), "B0513 unit: known call payload must make FN-3 incompatible").toEqual([
      "theta/parse/return-no-common-type",
    ]);
  });

  it("FN-6 validates the known plain-fn call payload against a subagent annotation", () => {
    const body = block([decl(), fn("sf", "integer", block([], call()), true)]);
    expect(codes(body), "B0513 unit: known plain-call payload must reach subagent boundary checking").toEqual([
      "theta/parse/invoke-return-type-mismatch",
    ]);
  });

  it("typed let receives the declared call type", () => {
    expect(codes(block([decl(), letStmt("x", call(), "integer")])),
      "B0513 unit: typed let must reject the known string-valued call",
    ).toEqual(["theta/parse/let-rhs-type-mismatch"]);
  });

  it("boolean position receives the declared call type", () => {
    expect(codes(block([decl(), branch(block(), call())])),
      "B0513 unit: boolean position must reject the known string-valued call",
    ).toEqual(["theta/parse/non-boolean-condition"]);
  });

  it("the cross-file payload adapter preserves a known primitive call return", () => {
    expect(inferCalleeReturnPayload(block([decl()], call()), FILE, []),
      "B0513 unit: cross-file adapter must retain a known string call payload",
    ).toEqual(stringType);
  });

  it("a BlockExpr call tail keeps the call's declared type", () => {
    const tail: Expr = { kind: "block", body: block([], call()), range };
    expect(inferCalleeReturnPayload(block([decl()], tail), FILE, []),
      "B0513 unit: block tail must propagate a known string call payload",
    ).toEqual(stringType);
  });

  it("a void call's whole-body payload summary widens to primitive null", () => {
    expect(inferCalleeReturnPayload(block([decl("void")], call()), FILE, []),
      "B0513 unit: void call payload must be null",
    ).toEqual({ kind: "prim", name: "null" });
  });

  it("par-for renders the body call's declared payload inside Result", () => {
    const tail: Expr = {
      kind: "par-for", variable: "i", iterand: { kind: "array", elements: [integer], range },
      max: null, body: block([], call()), range,
    };
    const read = vi.spyOn(StaticTypeInferencePass.prototype, "typeOf");
    expect(codes(block([decl(), letStmt("xs", tail)]))).toEqual([]);
    const index = read.mock.calls.findIndex(([node]) => node === tail);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(read.mock.results[index]?.value,
      "B0513 unit: par-for Result payload must name the declared return, not g",
    ).toEqual({ kind: "array", element: { kind: "named", name: "Result<string, QueryError>" } });
  });
});

describe("bug 0513 unit: healthy controls and conservative boundaries", () => {
  it("literal controls reach all four diagnostic sinks", () => {
    expect(codes(block([fn("f", null, block([branch(block([ret(integer)]))], string))])))
      .toEqual(["theta/parse/return-no-common-type"]);
    expect(codes(block([fn("sf", "integer", block([], string), true)])))
      .toEqual(["theta/parse/invoke-return-type-mismatch"]);
    expect(codes(block([letStmt("x", string, "integer")])))
      .toEqual(["theta/parse/let-rhs-type-mismatch"]);
    expect(codes(block([branch(block(), string)])))
      .toEqual(["theta/parse/non-boolean-condition"]);
    expect(inferCalleeReturnPayload(block([], string), FILE, [])).toEqual(stringType);
  });

  it("the LUB engine rejects known incompatible types but correctly defers an unknown nominal", () => {
    const resolve = (other: CompatType) => resolveReturnType({
      contributions: [{ kind: "plain", type: integerType }, { kind: "plain", type: other }],
      hasQuestion: false, env: {}, site: { file: FILE, range },
    });
    expect(resolve(stringType)).toMatchObject({
      kind: "inference-no-common-type", diagnostic: { code: "theta/parse/return-no-common-type" },
    });
    const unknown: CompatType = { kind: "named", name: "external" };
    expect(checkCompatible(unknown, integerType, {})).toBe("unknown");
    expect(resolve(unknown)).toEqual({ kind: "inferred", inferred: { payload: integerType, wrapped: false } });
    expect(resolve({ kind: "prim", name: "number" })).toEqual({
      kind: "inferred", inferred: { payload: { kind: "prim", name: "number" }, wrapped: false },
    });
  });

  for (const annotation of [null, "string--"] as const) {
    it(`withholds the ${annotation === null ? "absent" : "malformed"} return annotation`, () => {
      const site = call();
      expect(observedCallType(block([decl(annotation), letStmt("x", site)]), site))
        .toEqual({ kind: "named", name: "g" });
    });
  }

  it("an unresolved/import-external callee has no same-file return claim", () => {
    const site = call("external");
    expect(observedCallType(block([letStmt("x", site)]), site))
      .toEqual({ kind: "named", name: "external" });
    expect(inferCalleeReturnPayload(block([], site), FILE, [])).toBeUndefined();
  });

  it("a local fn parameter shadows a same-file function even outside the call's block", () => {
    const site = call();
    const binder: FnDecl = { ...fn("h", null, block()), params: [{ name: "g", type: "" }] };
    expect(observedCallType(block([decl(), binder, letStmt("x", site)]), site))
      .toEqual({ kind: "named", name: "g" });
  });

  it("a frontmatter parameter shadows a same-file function", () => {
    const site = call();
    expect(observedCallType(block([decl(), letStmt("x", site)]), site, [{ name: "g", typeSource: "integer" }]))
      .toEqual({ kind: "named", name: "g" });
  });

  it("named-schema and Result call payloads do not leak into the caller's namespace", () => {
    for (const annotation of ["Item", "Result<string, QueryError>"]) {
      expect(inferCalleeReturnPayload(block([decl(annotation)], call()), FILE, [])).toBeUndefined();
    }
  });

  it("subagent calls remain deferred at a primitive sink, never mistaken for bare annotated payloads", () => {
    expect(codes(block([fn("sf", "string", block([], string), true), letStmt("x", call("sf"), "integer")])))
      .toEqual([]);
  });

  // Owner decision (run-local owner-decision.md): a subagent annotation is a
  // success-payload constraint, not evidence of a plain or Result call type.
  // Pin the existing conservative representation without choosing either
  // contradictory FN-6 promise; exact normative reconciliation belongs to PLAN.
  for (const annotation of ["string", "void", "Result<string, QueryError>", null]) {
    it(`keeps subagent ${annotation ?? "unannotated"} calls nominal and their cross-file payload unknown`, () => {
      const site = call("sf");
      const declaration = fn("sf", annotation, block([], string), true);
      expect(observedCallType(block([declaration, letStmt("x", site)]), site))
        .toEqual({ kind: "named", name: "sf" });
      expect(inferCalleeReturnPayload(block([declaration], site), FILE, []))
        .toBeUndefined();
    });
  }

  it("call arguments remain withheld by the provable-value channel", () => {
    const collect = vi.spyOn(StaticTypeInferencePass.prototype, "collectProvableArgTypes");
    const site = call();
    const consumer: FnDecl = { ...fn("h", "integer", block([], integer)), params: [{ name: "p", type: "integer" }] };
    expect(codes(block([decl(), consumer], { ...call("h"), args: [site] }))).toEqual([]);
    // The same-file fn route uses its own proof predicate; pin the pass's
    // channel independently via the production pass instance, not a fake.
    const typeRead = vi.spyOn(StaticTypeInferencePass.prototype, "typeOf");
    checkTypeLayer(block([decl(), letStmt("x", site)]), FILE, []);
    const index = typeRead.mock.calls.findIndex(([node]) => node === site);
    expect(index).toBeGreaterThanOrEqual(0);
    const instance = typeRead.mock.contexts[index] as StaticTypeInferencePass;
    expect(instance.collectProvableArgTypes(site, {})).toBeUndefined();
    expect(collect).toHaveBeenCalled();
  });

  it("0512 control: discarded StmtBlock tails do not contribute even when they call an annotated fn", () => {
    for (const tail of [call(), string]) {
      expect(codes(block([decl(), fn("f", null, block([branch(block([], tail))], integer))]))).toEqual([]);
    }
  });
});
