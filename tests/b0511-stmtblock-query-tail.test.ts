// Bug 0511 — whole-document production front-end regression, not isolated
// mocked walkers. Contract: docs/bugs/0511 §Approved ruling (Resolution A),
// grammar.md §Blocks, QRY-19 and QRY-2. The ruling resolves the old prose
// ambiguity; this test does not rebaseline bug 0220's existing v10 witness.
//
// Boundary: parseThetaDocument exercises real lexing, continuation collapse,
// body parsing, structural diagnostics and schema resolution. parseDeps only
// supplies inert reporting/model lookup (no model: appears in these sources).
// This does NOT prove host registration or provider dispatch; the live companion
// covers the shipped extension's real filesystem discovery and registration.
import { describe, expect, it } from "vitest";
import type { QueryExpr } from "../src/parser/theta-document";
import { collectByKind, parsePromptBody } from "./helpers/e2e-s1";
import { B0511_DISCARDED, b0511Healthy, b0511ParQuery, b0511Rejected } from "./helpers/b0511-fixtures";

const PATH = "b0511.theta";

function parse(body: string) {
  const doc = parsePromptBody(body, PATH);
  expect(doc.frontmatter, "fixture must reach body parsing").not.toBeNull();
  // QueryStmt also has kind "query"; only QueryExpr owns a schema slot.
  const queries = collectByKind(doc.body, "query").filter((node) => "schema" in node) as unknown as QueryExpr[];
  expect(queries.length, "fixture must retain its real query AST").toBeGreaterThan(0);
  return { doc, queries };
}

function diagnosticList(body: string) {
  const { doc } = parse(body);
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

describe("bug 0511 — StmtBlock discarded query tails", () => {
  it.each(b0511Rejected)("QRY-19 rejects $name", ({ body }) => {
    const { doc, queries } = parse(body);
    expect(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}`),
      "b0511 QRY-19 mismatch: a discarded StmtBlock query must emit exactly one error",
    ).toEqual([`error ${B0511_DISCARDED}`]);
    // No unrelated diagnostic can masquerade as the witness. The sole error
    // must be located at the last query, not a preceding `prepare` query.
    expect(doc.diagnostics[0]?.file).toBe(PATH);
    expect(doc.diagnostics[0]?.range).toEqual(queries.at(-1)!.range);
    expect(doc.diagnostics[0]?.message).toBe(
      "query result discarded; use ? to propagate failure or 'let _ = ...' to discard explicitly",
    );
  });

  it.each(b0511Healthy)("healthy $name remains accepted", ({ body }) => {
    expect(diagnosticList(body), "acknowledged Results and value-producing tails stay legal").toEqual([]);
  });

  for (const prefix of ["", "let z = 1\n "]) {
    it(`branch tails do not inherit the Item return sink (${prefix === "" ? "single" : "multi"})`, () => {
      const { queries } = parse(
        `schema Item { a: string }\nfn f(): Item { if true { ${prefix}@\`q\` } else { ${prefix}@\`r\` } }`,
      );
      expect(queries.length).toBe(2);
      expect(
        queries.map((q) => q.schema),
        "b0511 QRY-2 mismatch: discarded StmtBlock tails are not fn-return sinks",
      ).toEqual([null, null]);
    });
  }

  it("healthy true fn tail and explicit nested return retain the Item sink", () => {
    for (const body of [
      "fn f(): Item { @`q` }",
      "fn f(): Item { if true { return @`q` } }",
    ]) {
      const { doc, queries } = parse(`schema Item { a: string }\n${body}`);
      expect(doc.diagnostics).toEqual([]);
      expect(queries.map((q) => q.schema)).toEqual(["Item"]);
    }
  });

  it("ParForBody query tail keeps exactly the independent CTRL-4 refusal", () => {
    const { doc } = parse(b0511ParQuery);
    expect(doc.diagnostics.map((d) => `${d.severity} ${d.code}`)).toEqual([
      "error theta/parse/par-query-in-body",
    ]);
    const par = collectByKind(doc.body, "par-for")[0];
    const block = par?.body as { tail: { kind: string } | null; statements: { kind: string }[] };
    expect(block.tail?.kind).toBe("query");
    expect(block.statements.map((s) => s.kind)).toEqual(["let"]);
  });

  it("healthy void branch acknowledged discards remain legal", () => {
    expect(diagnosticList("fn f(): void { if true { let _ = @`hi` } else { let _ = @`ho` } }")).toEqual([]);
  });

  it("void does not exempt bare StmtBlock branch queries", () => {
    expect(
      diagnosticList("fn f(): void { if true { @`hi` } else { @`ho` } }"),
      "b0511 QRY-19 mismatch: void function is not a branch-tail discard exemption",
    ).toEqual([`error ${B0511_DISCARDED}`, `error ${B0511_DISCARDED}`]);
  });
});
