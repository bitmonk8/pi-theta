// Bug 0511 Resolution A: isolate the two production walks from lexing and
// promotion. Hand-built, well-typed ASTs exercise both legal Block encodings;
// no parser/checker mocks, host doubles, or production behavior replacement.
// These units do not prove discovery/registration; the frozen e2e witnesses do.
import { describe, expect, it } from "vitest";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type { Block, Expr, FnDecl, QueryExpr, Stmt } from "../src/parser/theta-ast";
import { checkStructural } from "../src/parser/structural-checks";
import { resolveQuerySchemas } from "../src/parser/query-schema-resolve";
import { checkDiscardedQueryResult } from "../src/parser/query-discard-checks";
import { collectByKind } from "./helpers/e2e-s1";

const FILE = "b0511-unit.theta";
const range: SourceRange = { start: { line: 1, column: 1 }, end: { line: 8, column: 2 } };
const queryRange: SourceRange = { start: { line: 4, column: 3 }, end: { line: 4, column: 7 } };
const query = (schema: string | null = null): QueryExpr => ({
  kind: "query", template: "q", schema, range: queryRange,
  ascriptionWritten: schema !== null,
});
const bool: Expr = { kind: "bool", value: true, range };
const empty = (): Block => ({ statements: [], tail: null });
const root = (stmt: Stmt): Block => ({ statements: [stmt], tail: null });
const fn = (body: Block, returnType: string | null = "string"): FnDecl => ({
  kind: "fn", name: "f", params: [], returnType, body, range,
});
const tryQuery = (): Expr => ({ kind: "try", operand: query(), range: queryRange });
const queryStatements = (): Block => ({
  statements: [{ kind: "query", query: query(), range: queryRange }], tail: null,
});
const queryTail = (tail: Expr = query()): Block => ({ statements: [], tail });

const wrappers: { name: string; wrap: (body: Block) => Stmt }[] = [
  { name: "if", wrap: (then) => ({ kind: "if", condition: bool, then, otherwise: null, range }) },
  { name: "else", wrap: (otherwise) => ({ kind: "if", condition: bool, then: empty(), otherwise, range }) },
  { name: "else-if", wrap: (then) => ({
    kind: "if", condition: bool, then: empty(), range,
    otherwise: { kind: "if", condition: bool, then, otherwise: null, range },
  }) },
  { name: "while", wrap: (body) => ({ kind: "while", condition: bool, body, range }) },
  { name: "for", wrap: (body) => ({
    kind: "for", variable: "x", iterand: { kind: "array", elements: [bool], range }, body, range,
  }) },
];

function structural(body: Block) {
  return checkStructural(body, {
    schemas: new Map(), enums: new Set(), imports: new Set(), aliasArms: new Map(), lowered: new Map(),
  }, FILE, [], []);
}

const expectedDiscard = {
  severity: "error", code: "theta/parse/discarded-query-result", file: FILE, range: queryRange,
  message: "query result discarded; use ? to propagate failure or 'let _ = ...' to discard explicitly",
  hint: "Use `?` to propagate failure or `let _ = @`...`` to discard explicitly.",
};

function querySchemas(body: Block) {
  return (collectByKind(body, "query").filter((node) => "schema" in node) as unknown as QueryExpr[])
    .map((q) => q.schema);
}

// The leaf predicate is already correct. Failure is in the context supplied by
// the structural AST traversal, not in diagnostic generation or message text.
describe("bug 0511 QRY-19 predicate controls", () => {
  it("bare query emits the exact diagnostic", () => {
    expect(checkDiscardedQueryResult({ isQuery: true, disposition: "bare-expr-statement", file: FILE, range: queryRange }))
      .toEqual(expectedDiscard);
  });
  it.each(["propagate", "discard-let-underscore", "bind"] as const)("%s acknowledges the Result", (disposition) => {
    expect(checkDiscardedQueryResult({ isQuery: true, disposition, file: FILE, range: queryRange })).toBeUndefined();
  });
  it("ordinary non-query expressions are not must-use queries", () => {
    expect(checkDiscardedQueryResult({ isQuery: false, disposition: "bare-expr-statement", file: FILE, range: queryRange }))
      .toBeUndefined();
  });
});

describe("bug 0511 isolated structural traversal", () => {
  for (const { name, wrap } of wrappers) {
    for (const encoding of ["tail", "statement"] as const) {
      for (const context of ["theta", "void-fn"] as const) {
        it(`${name} ${encoding} in ${context} is a discarded query`, () => {
          const body = root(wrap(encoding === "tail" ? queryTail() : queryStatements()));
          const input = context === "theta" ? body : root(fn(body, "void"));
          expect(structural(input), "b0511 structural QRY-19: discarded block query must emit one exact diagnostic")
            .toEqual([expectedDiscard]);
        });
      }
    }
    it(`${name} postfix-? tail acknowledges failure`, () => {
      expect(structural(root(wrap(queryTail(tryQuery()))))).toEqual([]);
    });
    it(`${name} explicit discard remains acknowledged`, () => {
      const body: Block = { statements: [{ kind: "let", name: "_", annotation: null, mutable: false, init: query(), range }], tail: null };
      expect(structural(root(wrap(body)))).toEqual([]);
    });
  }
  it("genuine theta, FnBody, void FnBody and BlockExpr tails remain value positions", () => {
    const blockExpr: Expr = { kind: "block", body: queryTail(), range };
    for (const body of [queryTail(), root(fn(queryTail())), root(fn(queryTail(), "void")), queryTail(blockExpr)]) {
      expect(structural(body)).toEqual([]);
    }
  });
});

describe("bug 0511 isolated QRY-2 frame construction", () => {
  for (const { name, wrap } of wrappers) {
    for (const form of ["bare", "propagate"] as const) {
      it(`${name} ${form} tail cannot borrow the fn return sink`, () => {
        const body = root(fn(root(wrap(queryTail(form === "bare" ? query() : tryQuery())))));
        const result = resolveQuerySchemas(body, FILE);
        expect(result.diagnostics).toEqual([]);
        expect(querySchemas(result.body), "b0511 frame QRY-2: discarded branch tail must remain untyped")
          .toEqual([null]);
        expect(result.propagations, "no annotation capture reaches a discarded tail").toEqual([]);
        expect(querySchemas(body), "schema resolution must not mutate its input").toEqual([null]);
      });
    }
    it(`${name} QueryStmt is already sink-less`, () => {
      const result = resolveQuerySchemas(root(fn(root(wrap(queryStatements())))), FILE);
      expect(result.diagnostics).toEqual([]);
      expect(querySchemas(result.body)).toEqual([null]);
      expect(result.propagations).toEqual([]);
    });
    it(`${name} explicit return still receives the fn sink`, () => {
      const body = root(fn(root(wrap({ statements: [{ kind: "return", operand: query(), range }], tail: null }))));
      const result = resolveQuerySchemas(body, FILE);
      expect(result.diagnostics).toEqual([]);
      expect(querySchemas(result.body)).toEqual(["string"]);
      expect(result.propagations).toEqual([{ capture: { kind: "fn-return", range } }]);
    });
    it(`${name} explicit query ascription still wins`, () => {
      const result = resolveQuerySchemas(root(fn(root(wrap(queryTail(query("integer")))))), FILE);
      expect(result.diagnostics).toEqual([]);
      expect(querySchemas(result.body)).toEqual(["integer"]);
      expect(result.propagations).toEqual([]);
    });
  }
  it("genuine FnBody tail retains the return sink and capture", () => {
    const result = resolveQuerySchemas(root(fn(queryTail())), FILE);
    expect(result.diagnostics).toEqual([]);
    expect(querySchemas(result.body)).toEqual(["string"]);
    expect(result.propagations).toEqual([{ capture: { kind: "fn-return", range } }]);
  });
  it("void FnBody has no response-schema sink", () => {
    const result = resolveQuerySchemas(root(fn(queryTail(), "void")), FILE);
    expect(result.diagnostics).toEqual([]);
    expect(querySchemas(result.body)).toEqual([null]);
    expect(result.propagations).toEqual([]);
  });
});
