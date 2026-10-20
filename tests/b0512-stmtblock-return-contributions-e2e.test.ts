import { describe, expect, it } from "vitest";
import {
  parseThetaDocument,
  type FnDecl,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0512: full source bytes -> production lexer/body parser/query-schema
// resolution/identifier + type checks -> public document diagnostics.
// FN-3 (functions.md:26-30) counts only the fn's own tail and explicit return
// operands. grammar.md:298-301 discards nested StmtBlock success values.
// No AST, type inference, contribution collector or diagnostic is mocked.
// parseDeps supplies inert note delivery and a model matcher; these fixtures
// declare no model and run no turns. This is frontend E2E, not a real pi host,
// registration, runtime query, child-process or provider acceptance test.
const CODE = "theta/parse/return-no-common-type";
const MESSAGE =
  "return operands have no common type; annotate the function return type or reconcile the operands";
const FILE = "b0512.theta";
const FM = "---\nmode: prompt\n---\n";
const ITEM = "schema Item { a: string }\n";

function parse(body: string): ThetaDocument {
  const doc = parseThetaDocument(
    { path: FILE, bytes: new TextEncoder().encode(FM + body) },
    parseDeps(),
  );
  expect(doc.frontmatter, "fixture frontmatter must be valid").not.toBeNull();
  // Do not misrepresent an unrelated parse/type error as a bug witness.
  expect(
    doc.diagnostics.filter((d) => d.severity === "error" && d.code !== CODE),
    "fixture must have no unrelated error diagnostics",
  ).toEqual([]);
  return doc;
}

function fnOf(doc: ThetaDocument): FnDecl {
  const fn = doc.body.statements.find((s): s is FnDecl => s.kind === "fn" && s.name === "f");
  if (fn === undefined) throw new Error("fixture must declare fn f");
  expect(fn.returnType, "fixture must exercise annotation-less inference").toBeNull();
  expect(fn.body.tail, "fn's own tail must remain the number-typed parameter n").toMatchObject({
    kind: "ident",
    name: "n",
  });
  return fn;
}

function expectAccepted(doc: ThetaDocument): void {
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(
    errors.length === 0 ? "accepted" : errors.join(","),
    "FN-3: discarded StmtBlock success values must not reject a legal fn",
  ).toBe("accepted");
}

const LEGAL: readonly (readonly [string, string])[] = [
  ["reported single-query if body", `${ITEM}fn f(n: number) { if n > 0 { @<Item>\`d\`? }\n n }\nf(1)`],
  ["single-string if body", 'fn f(n: number) { if n > 0 { "s" }\n n }\nf(1)'],
  ["single-match if body", 'fn f(n: number) { if n > 0 { match n { _ => "s" } }\n n }\nf(1)'],
  ["else body", 'fn f(n: number) { if n > 0 { let p = 1 } else { "s" }\n n }\nf(1)'],
  ["else-if body", 'fn f(n: number) { if n > 0 { let p = 1 } else if n < 0 { "s" }\n n }\nf(1)'],
  ["while body", 'fn f(n: number) { while n < 0 { "s" }\n n }\nf(1)'],
  ["for body", 'fn f(n: number) { for i in [1] { "s" }\n n }\nf(1)'],
];

describe("bug 0512 frontend E2E — discarded StmtBlock tails are not return contributions", () => {
  it.each(LEGAL)("admits %s", (_label, source) => {
    const doc = parse(source);
    fnOf(doc);
    expectAccepted(doc);
  });

  it("healthy control: the reported query with a preceding let loads clean", () => {
    const doc = parse(
      `${ITEM}fn f(n: number) { if n > 0 { let p = "x"\n @<Item>\`d ${"${p}"}\`? }\n n }\nf(1)`,
    );
    const fn = fnOf(doc);
    const statement = fn.body.statements.find((s) => s.kind === "if");
    expect(statement?.kind).toBe("if");
    if (statement?.kind !== "if") throw new Error("fixture must contain the if");
    expect(statement.then.tail, "multi-form StmtBlock is currently not promoted").toBeNull();
    expectAccepted(doc);
    expect(doc.diagnostics).toEqual([]);
  });

  it("healthy control: an agreeing nested return and own tail load clean", () => {
    const doc = parse("fn f(n: number) { if n > 0 { return n }\n n }\nf(1)");
    fnOf(doc);
    expectAccepted(doc);
    expect(doc.diagnostics).toEqual([]);
  });

  it("healthy control: a number-valued StmtBlock tail loads clean", () => {
    const doc = parse("fn f(n: number) { if n > 0 { n }\n n }\nf(1)");
    const fn = fnOf(doc);
    const statement = fn.body.statements.find((s) => s.kind === "if");
    if (statement?.kind !== "if") throw new Error("fixture must contain the if");
    expect(statement.then.tail).toMatchObject({ kind: "ident", name: "n" });
    expectAccepted(doc);
    expect(doc.diagnostics).toEqual([]);
  });

  it("red-direction control: an explicit nested return still rejects, and the admission assertion catches it", () => {
    const doc = parse('fn f(n: number) { if n > 0 { return "s" }\n n }\nf(1)');
    const fn = fnOf(doc);
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      severity: "error",
      code: CODE,
      file: FILE,
      range: fn.range,
      message: MESSAGE,
    });
    // Verify the same admission oracle is not vacuously green when the
    // production diagnostic is present. No production mutation or mock.
    expect(() => expectAccepted(doc)).toThrowError(
      "FN-3: discarded StmtBlock success values must not reject a legal fn",
    );
  });
});
