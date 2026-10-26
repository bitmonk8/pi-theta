// Bug 0515: RET-3 covers a ThetaBody tail after a top-level return, just as
// it covers the tail in a nested body block. Exercise the whole production
// document parser, not the structural checker in isolation. Only the unused
// model resolver and system-note sink come from the offline parse deps.
// Contract: return.md RET-3; grammar.md §Block expressions (ThetaBody);
// diagnostics/code-registry-parse.md theta/parse/unreachable-code.
// This suite checks parser output, not runtime execution or host delivery.
import { describe, expect, it } from "vitest";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

const PATH = "b0515.theta";
const FM = "---\nmode: prompt\n---\n";
const PN = "fn pn(n: number): number { n }\n";

function parse(body: string): ThetaDocument {
  const doc = parseThetaDocument(
    { path: PATH, bytes: new TextEncoder().encode(FM + body) },
    parseDeps(),
  );
  expect(doc.frontmatter, "fixture must reach the body parser").not.toBeNull();
  expect(doc.diagnostics.filter((d) => d.severity === "error"), "fixture must have no parse errors").toEqual([]);
  return doc;
}

function expectWarning(doc: ThetaDocument, range: SourceRange, label: string): void {
  // Compare the entire diagnostic batch: one warning at the exact node range,
  // with the registered message/severity/file, and no unrelated diagnostics.
  expect(doc.diagnostics, label).toEqual([
    {
      code: "theta/parse/unreachable-code",
      severity: "warning",
      file: PATH,
      range,
      message: "unreachable code after return",
    },
  ]);
}

describe("bug 0515 RET-3 depth-0 tail", () => {
  it.each([
    { cell: "D1 number", body: "return 1\n2", statements: ["return"], kind: "number", line: 5 },
    { cell: "D2 call", body: `${PN}return 1\npn(1)`, statements: ["fn", "return"], kind: "call", line: 6 },
    {
      cell: "D5 propagated return",
      body: "fn r(): Result<number, string> { Ok(1) }\nreturn r()?\n2",
      statements: ["fn", "return"],
      kind: "number",
      line: 6,
    },
  ])("$cell warns on the top-level tail", ({ body, statements, kind, line }) => {
    const doc = parse(body);
    expect(doc.body.statements.map((s) => s.kind), "fixture statement slots").toEqual(statements);
    const tail = doc.body.tail;
    if (tail === null) throw new Error("fixture must retain a top-level tail");
    expect(tail.kind, "fixture tail slot").toBe(kind);
    expect(tail.range.start, "warning target is the first token of the tail").toEqual({ line, column: 1 });
    expectWarning(doc, tail.range, `RET-3 depth-0 tail at ${line}:1`);
  });
});

describe("bug 0515 healthy controls", () => {
  it("C1: a reachable top-level tail call has no diagnostics", () => {
    const doc = parse(`${PN}let a = 1\npn(a)`);
    expect(doc.body.statements.map((s) => s.kind)).toEqual(["fn", "let"]);
    expect(doc.body.tail?.kind).toBe("call");
    expect(doc.diagnostics).toEqual([]);
  });

  it("a top-level return with no following code has no diagnostics", () => {
    const doc = parse("return 1");
    expect(doc.body.statements.map((s) => s.kind)).toEqual(["return"]);
    expect(doc.body.tail).toBeNull();
    expect(doc.diagnostics).toEqual([]);
  });

  it("D4: only the first statement after return warns, not the later tail", () => {
    const doc = parse("return 1\nlet x = 2\nx");
    expect(doc.body.statements.map((s) => s.kind)).toEqual(["return", "let"]);
    expect(doc.body.tail?.kind).toBe("ident");
    const statement = doc.body.statements[1];
    if (statement === undefined) throw new Error("fixture must retain the let statement");
    expect(statement.range.start).toEqual({ line: 5, column: 1 });
    expectWarning(doc, statement.range, "RET-3 depth-0 statement control at 5:1");
  });

  it("N1: a nested fn tail after return already warns", () => {
    const doc = parse(`${PN}fn f(): number { return 1\n pn(1) }\nf()`);
    const fn = doc.body.statements.find((s) => s.kind === "fn" && s.name === "f");
    if (fn?.kind !== "fn" || fn.body.tail === null) throw new Error("fixture must retain f's tail");
    expect(fn.body.statements.map((s) => s.kind)).toEqual(["return"]);
    expect(fn.body.tail.kind).toBe("call");
    expect(fn.body.tail.range.start).toEqual({ line: 6, column: 2 });
    expectWarning(doc, fn.body.tail.range, "RET-3 nested fn tail control at 6:2");
  });

  it("N2: a BlockExpr tail after return already warns", () => {
    const doc = parse("let r = { return 2\n 3 }\nr");
    const statement = doc.body.statements[0];
    if (statement?.kind !== "let" || statement.init?.kind !== "block" || statement.init.body.tail === null) {
      throw new Error("fixture must retain the BlockExpr tail");
    }
    const block = statement.init.body;
    const tail = block.tail;
    if (tail === null) throw new Error("fixture must retain the BlockExpr tail");
    expect(block.statements.map((s) => s.kind)).toEqual(["return"]);
    expect(tail.kind).toBe("number");
    expect(tail.range.start).toEqual({ line: 5, column: 2 });
    expectWarning(doc, tail.range, "RET-3 BlockExpr tail control at 5:2");
  });
});
