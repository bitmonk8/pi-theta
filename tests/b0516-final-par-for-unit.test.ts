// Bug 0516 isolation: real lexer -> raw BodyParser (no document/type passes),
// then independent StaticTypeInferencePass / TypeLayerWalk controls.
// Approved option (a) requires structural tails, not a new runtime discard.
// Counterfactual ASTs below isolate ownership; they are NOT E2E evidence.
import { describe, expect, it } from "vitest";
import { lexTheta } from "../src/lexer/lexer";
import { BodyParser } from "../src/parser/body-parser";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import { checkCompatible, type CompatType } from "../src/parser/type-compat";
import { TypeLayerWalk } from "../src/parser/type-layer-walk";
import type { Block, Expr, FnDecl, ParForExpr } from "../src/parser/theta-ast";
import { parseDeps } from "./helpers/e2e-s1";

const FILE = "b0516-unit.theta";
const PAR = "par for m in [1] max 2 { 42 }";
const ARRAY: CompatType = { kind: "array", element: { kind: "named", name: "Result<integer, QueryError>" } };
const NULL: CompatType = { kind: "literal", typesAs: "null" };

function raw(source: string): Block {
  const lexed = lexTheta({ path: FILE, bytes: new TextEncoder().encode(source) }, parseDeps().systemNote);
  expect(lexed.diagnostics, "unit fixture must lex cleanly").toEqual([]);
  const parser = new BodyParser(lexed.tokens, FILE, source);
  const body = parser.parseBody();
  expect(parser.diagnostics, "raw fixture must parse without recovery").toEqual([]);
  return body;
}
function shape(body: Block): string {
  return `tail=${body.tail?.kind ?? "null"} statements=[${body.statements.map((s) => s.kind).join(",")}]`;
}
function fnBody(body: Block): Block {
  const fn = body.statements.find((s): s is FnDecl => s.kind === "fn");
  if (!fn) throw new Error("unit fixture must contain fn");
  return fn.body;
}
// Accept either AST slot ONLY to locate the expression under investigation;
// all structural/type assertions below have one exact, non-permissive oracle.
function finalPar(body: Block): ParForExpr {
  const last = body.statements[body.statements.length - 1];
  const expr = body.tail ?? (last?.kind === "expr" ? last.expr : null);
  if (expr?.kind !== "par-for") throw new Error("unit fixture must contain final par-for");
  return expr;
}
function inference(): StaticTypeInferencePass {
  return new StaticTypeInferencePass({ checkCompatible, enumNames: new Set(), fnCallReturnTypes: new Map() });
}
function payload(body: Block): CompatType | undefined {
  const walk = new TypeLayerWalk(inference(), {}, FILE, new Map(), new Map(), new Set(), new Set());
  return walk.inferFinalValuePayload(body, new Map());
}

const positions: { name: string; source: string; select: (b: Block) => Block; expected: string }[] = [
  { name: "ThetaBody lone", source: PAR, select: (b) => b, expected: "tail=par-for statements=[]" },
  { name: "ThetaBody packed (0517)", source: `42 ${PAR}`, select: (b) => b, expected: "tail=par-for statements=[expr]" },
  { name: "ThetaBody alias-joined (0517)", source: `schema X = array<integer>\n${PAR}`, select: (b) => b, expected: "tail=par-for statements=[schema]" },
  { name: "FnBody multi", source: `fn wrap() { let z = 1\n ${PAR} }`, select: fnBody, expected: "tail=par-for statements=[let]" },
  { name: "ParForBody", source: `par for k in [1] max 2 { ${PAR} }`, select: (b) => finalPar(b).body, expected: "tail=par-for statements=[]" },
];

describe("bug 0516 raw parser unit", () => {
  it.each(positions)("$name exposes the final expression to structural consumers", ({ source, select, expected }) => {
    expect(shape(select(raw(source))), "0516 raw parser: final par-for must occupy Block.tail").toBe(expected);
  });

  it("healthy control: non-final par-for stays an expr statement", () => {
    expect(shape(raw(`${PAR}\nlet z = 1`))).toBe("tail=null statements=[expr,let]");
  });

  it("healthy control: BlockExpr already restores the required par-for tail", () => {
    const body = raw(`let v = { let z = 1\n ${PAR} }`);
    const stmt = body.statements[0];
    if (stmt?.kind !== "let" || stmt.init?.kind !== "block") throw new Error("expected BlockExpr initializer");
    expect(shape(stmt.init.body)).toBe("tail=par-for statements=[let]");
    expect(inference().typeOf(stmt.init, {})).toEqual(ARRAY);
  });
});

describe("bug 0516 inference unit", () => {
  it("healthy control: the par-for expression itself already has the exact array type", () => {
    expect(inference().typeOf(finalPar(raw(PAR)), {})).toEqual(ARRAY);
  });

  it("owning-body collector must receive the final par-for type, not empty-tail null", () => {
    expect(payload(raw(PAR)), "0516 collector input: final par-for must contribute its array type").toEqual(ARRAY);
  });

  it("nested par-for type must include the inner array instead of Result<null, QueryError>", () => {
    const outer = finalPar(raw(`par for k in [1] max 2 { ${PAR} }`));
    expect(inference().typeOf(outer, {}), "0516 nested inference: ParForBody tail must retain inner array type").toEqual({
      kind: "array", element: { kind: "named", name: "Result<array<Result<integer, QueryError>>, QueryError>" },
    });
  });

  it("healthy encoding control: a real structural par-for tail needs no collector special case", () => {
    const par = finalPar(raw(PAR));
    // Test-only AST counterfactual: feed the SAME parsed node directly as a
    // structural tail. No production mutation or parse bypass in witnesses.
    const body: Block = { statements: [], tail: par };
    expect(payload(body)).toEqual(ARRAY);
    const number: Expr = { kind: "number", text: "1", numericType: "integer", range: par.range };
    expect(payload({ statements: [{ kind: "return", operand: number, range: number.range }], tail: par })).toBeUndefined();
  });

  it("healthy ownership control: a StmtBlock par-for never becomes the owner's implicit return", () => {
    const par = finalPar(raw(PAR));
    const condition: Expr = { kind: "bool", value: true, range: par.range };
    // Pin BOTH nested encodings, preserving bug 0512's ownership boundary.
    for (const nested of [
      { statements: [], tail: par },
      { statements: [{ kind: "expr" as const, expr: par, range: par.range }], tail: null },
    ]) {
      expect(payload({ statements: [{ kind: "if", condition, then: nested, otherwise: null, range: par.range }], tail: null })).toEqual(NULL);
    }
  });
});
