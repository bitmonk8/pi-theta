// Bug 0515: isolate RET-3's structural traversal from lexing, tail promotion,
// query-schema resolution and whole-document diagnostic aggregation. The ASTs
// use production types and the real exported checker; no checker mocks.
// The unchanged document-parser witness proves these shapes arise from source.
import { describe, expect, it } from "vitest";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import { checkUnreachableCode } from "../src/parser/functions";
import { checkStructural } from "../src/parser/structural-checks";
import type { Block, Expr, FnDecl, Stmt } from "../src/parser/theta-ast";

const FILE = "b0515-unit.theta";
const returnRange: SourceRange = { start: { line: 4, column: 1 }, end: { line: 4, column: 9 } };
const tailRange: SourceRange = { start: { line: 5, column: 3 }, end: { line: 5, column: 8 } };
const laterRange: SourceRange = { start: { line: 6, column: 1 }, end: { line: 6, column: 2 } };
const wrapperRange: SourceRange = { start: { line: 3, column: 1 }, end: { line: 7, column: 2 } };
const number = (range: SourceRange = tailRange): Expr => ({ kind: "number", text: "2", numericType: "integer", range });
const returned = (operand: Expr = number(returnRange)): Stmt => ({ kind: "return", operand, range: returnRange });
const query = (): Expr => ({ kind: "query", schema: null, template: "question", ascriptionWritten: false, range: tailRange });
const empty = (): Block => ({ statements: [], tail: null });
const root = (statement: Stmt): Block => ({ statements: [statement], tail: null });
const fn = (body: Block): FnDecl => ({ kind: "fn", name: "f", params: [], returnType: "number", body, range: wrapperRange });

function structural(body: Block) {
  return checkStructural(body, {
    schemas: new Map(), enums: new Set(), imports: new Set(), aliasArms: new Map(), lowered: new Map(),
  }, FILE, [], []);
}

function warning(range: SourceRange = tailRange) {
  return {
    code: "theta/parse/unreachable-code", severity: "warning", file: FILE, range,
    message: "unreachable code after return",
  };
}

// This leaf already emits the registered payload. The omission is in the
// traversal's caller, not its boolean predicate or diagnostic construction.
describe("bug 0515 RET-3 leaf controls", () => {
  it("true emits the exact warning at the supplied range", () => {
    expect(checkUnreachableCode({ hasCodeAfterReturn: true }, { file: FILE, range: tailRange }))
      .toEqual(warning());
  });
  it("false emits nothing", () => {
    expect(checkUnreachableCode({ hasCodeAfterReturn: false }, { file: FILE, range: tailRange }))
      .toBeUndefined();
  });
});

describe("bug 0515 isolated depth-0 traversal", () => {
  it.each([
    { cell: "number", tail: number(), operand: number(returnRange) },
    // Callee resolution belongs to a different document pass. This unit only
    // checks that a call-shaped tail receives RET-3, independent of its name.
    { cell: "call", tail: { kind: "call", callee: "pn", args: [number()], range: tailRange } as Expr, operand: number(returnRange) },
    { cell: "propagated return", tail: number(), operand: { kind: "try", operand: { kind: "call", callee: "r", args: [], range: returnRange }, range: returnRange } as Expr },
  ])("$cell: last return makes the root tail unreachable", ({ tail, operand }) => {
    expect(structural({ statements: [returned(operand)], tail }), "b0515 structural RET-3: root tail must emit one exact warning")
      .toEqual([warning()]);
  });

  it("an unreachable root query tail is still a value, not a discarded query", () => {
    expect(structural({ statements: [returned()], tail: query() }), "b0515 structural RET-3: root query tail must emit only unreachable-code")
      .toEqual([warning()]);
  });

  it("an unreachable tail still receives its own structural checks after RET-3", () => {
    const declaration = fn(empty());
    const tail: Expr = { kind: "ident", name: "f", range: tailRange };
    expect(structural({ statements: [declaration, returned()], tail }), "b0515 structural RET-3: warning precedes the tail's own diagnostic")
      .toEqual([
        warning(),
        {
          code: "theta/parse/function-as-value", severity: "error", file: FILE, range: tailRange,
          message: "function 'f' used outside call position; functions are not first-class in theta 1.0",
        },
      ]);
  });
});

describe("bug 0515 isolated healthy traversal controls", () => {
  const wrappers: { name: string; wrap: (body: Block) => Block }[] = [
    { name: "FnBody", wrap: (body) => root(fn(body)) },
    { name: "BlockExpr", wrap: (body) => ({ statements: [], tail: { kind: "block", body, range: wrapperRange } }) },
    { name: "StmtBlock", wrap: (then) => root({ kind: "if", condition: { kind: "bool", value: true, range: wrapperRange }, then, otherwise: null, range: wrapperRange }) },
  ];
  for (const { name, wrap } of wrappers) {
    it(`${name}: the same last-return plus tail shape already warns`, () => {
      expect(structural(wrap({ statements: [returned()], tail: number() }))).toEqual([warning()]);
    });
  }

  it("an empty root has no diagnostics", () => {
    expect(structural(empty())).toEqual([]);
  });
  it("a root return without a following tail has no diagnostics", () => {
    expect(structural({ statements: [returned()], tail: null })).toEqual([]);
  });
  it("a reachable number or query root tail has no diagnostics", () => {
    for (const tail of [number(), query()]) {
      expect(structural({ statements: [], tail })).toEqual([]);
    }
  });
  it("the first post-return statement already warns at its statement range", () => {
    const expression: Stmt = { kind: "expr", expr: number(), range: tailRange };
    expect(structural({ statements: [returned(), expression], tail: null })).toEqual([warning()]);
  });
  it("an intervening let gets the sole warning; a later tail gets no duplicate", () => {
    const binding: Stmt = { kind: "let", name: "x", annotation: null, mutable: false, init: number(), range: tailRange };
    expect(structural({ statements: [returned(), binding], tail: number(laterRange) })).toEqual([warning()]);
  });
  it("a return in a separate nested block does not mark the root tail unreachable", () => {
    const declaration = fn({ statements: [returned()], tail: number() });
    expect(structural({ statements: [declaration], tail: number(laterRange) })).toEqual([warning()]);
  });
});
