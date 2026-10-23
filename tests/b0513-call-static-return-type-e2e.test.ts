import { describe, expect, it } from "vitest";
import {
  parseThetaDocument,
  type FnDecl,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0513: full source bytes -> production lexer/body parser -> type-layer
// composition -> public document diagnostics. No AST, static type, LUB or
// diagnostic is mocked. parseDeps only supplies inert note delivery and a
// model matcher; none of these fixtures declares a model or runs a turn.
// This is frontend E2E, NOT host discovery/registration, runtime boundary
// validation, a provider turn or a subagent child-process acceptance test.
// FN-3/FN-5 require a same-file annotated call's returned value to participate
// in inference; FN-6 requires the resolvable subagent payload check.
const FILE = "b0513.theta";
const G = 'fn g(): string { "a" }\n';
const NO_COMMON = "theta/parse/return-no-common-type";
const INVOKE_RETURN = "theta/parse/invoke-return-type-mismatch";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const BOOLEAN = "theta/parse/non-boolean-condition";

function parse(body: string): ThetaDocument {
  const doc = parseThetaDocument(
    { path: FILE, bytes: new TextEncoder().encode("---\nmode: prompt\n---\n" + body) },
    parseDeps(),
  );
  expect(doc.frontmatter, "fixture frontmatter must be valid").not.toBeNull();
  return doc;
}

function fnOf(doc: ThetaDocument, name: string): FnDecl {
  const fn = doc.body.statements.find((s): s is FnDecl => s.kind === "fn" && s.name === name);
  if (fn === undefined) throw new Error(`fixture must declare fn ${name}`);
  return fn;
}

function expectDiagnostic(doc: ThetaDocument, code: string): void {
  // Keep unrelated syntax/type errors from masquerading as the expected red.
  expect(doc.diagnostics.filter((d) => d.code !== code), "no unrelated diagnostics").toEqual([]);
  const observed = doc.diagnostics.map((d) => d.code).join(",") || "accepted";
  expect(observed, "B0513 annotated call must receive the statically resolvable diagnostic").toBe(code);
  expect(doc.diagnostics[0]).toMatchObject({ severity: "error", file: FILE });
}

interface Cell {
  readonly name: string;
  readonly source: (tail: string) => string;
  readonly code: string;
  readonly owner?: string;
}

const CELLS: readonly Cell[] = [
  {
    name: "A1 multi-statement call tail participates in FN-3",
    source: (tail) => `${G}fn f(n: number) { if n > 0 { return 1 }\n let z = 1\n ${tail} }\nf(1)`,
    code: NO_COMMON,
    owner: "f",
  },
  {
    name: "E1 brace-preceded call tail participates in FN-3",
    source: (tail) => `${G}fn f(n: number) { if n > 0 { return 1 }\n ${tail} }\nf(1)`,
    code: NO_COMMON,
    owner: "f",
  },
  {
    name: "B1 multi-statement subagent payload is checked",
    source: (tail) => `schema Item { a: string }\n${G}subagent fn sf(): Item { let z = 1\n ${tail} }`,
    code: INVOKE_RETURN,
    owner: "sf",
  },
  {
    name: "B3 single-form subagent payload is checked",
    source: (tail) => `schema Item { a: string }\n${G}subagent fn sf(): Item { ${tail} }`,
    code: INVOKE_RETURN,
    owner: "sf",
  },
  {
    name: "C1 typed let sees the call return type",
    source: (tail) => `${G}let x: integer = ${tail}`,
    code: LET_RHS,
  },
  {
    name: "F1 boolean position sees the call return type",
    source: (tail) => `${G}if ${tail} { let q = 1 }`,
    code: BOOLEAN,
  },
];

describe("bug 0513 frontend E2E", () => {
  for (const cell of CELLS) {
    it(`witness: ${cell.name}`, () => {
      const doc = parse(cell.source("g()"));
      expect(fnOf(doc, "g").returnType, "callee has a written string return annotation").toBe("string");
      if (cell.owner !== undefined) {
        const owner = fnOf(doc, cell.owner);
        expect(owner.body.tail, "call must reach the real structural tail, not a discarded statement").toMatchObject({
          kind: "call", callee: "g",
        });
        if (cell.owner === "f") expect(owner.returnType).toBeNull();
        else expect(owner.subagent).toBe(true);
      }
      expectDiagnostic(doc, cell.code);
    });

    it(`literal control: ${cell.name}`, () => {
      // Same program and same oracle, substituting only the call's known value.
      expectDiagnostic(parse(cell.source('"a"')), cell.code);
    });
  }

  it("healthy control: agreeing annotated numeric call and explicit return load cleanly", () => {
    const doc = parse('fn g(): number { 2 }\nfn f(n: number) { if n > 0 { return 1 }\n let z = 1\n g() }\nf(1)');
    expect(doc.diagnostics).toEqual([]);
  });

  it("healthy control: an annotation-less callee remains deferred", () => {
    const doc = parse('fn g() { "a" }\nfn f(n: number) { if n > 0 { return 1 }\n let z = 1\n g() }\nf(1)');
    expect(doc.diagnostics).toEqual([]);
  });

  it("healthy control: a Result-annotated callee remains deferred", () => {
    const doc = parse('fn g(): Result<string, QueryError> { Ok("a") }\nfn f(n: number) { if n > 0 { return 1 }\n let z = 1\n g() }\nf(1)');
    expect(doc.diagnostics).toEqual([]);
  });

  it("healthy control: a subagent call is not its bare annotated payload", () => {
    const doc = parse('subagent fn sf(): string { "a" }\nlet x: integer = sf()');
    expect(doc.diagnostics).toEqual([]);
  });

  it("prerequisite 0512 control: discarded nested call and literal tails do not contribute", () => {
    for (const tail of ["g()", '"a"']) {
      const doc = parse(`${G}fn f(n: number) { if n > 0 { ${tail} }\n n }\nf(1)`);
      expect(doc.diagnostics).toEqual([]);
    }
  });

  it("red-direction control: the diagnostic oracle rejects a healthy accepted document", () => {
    const doc = parse("fn f(n: number) { if n > 0 { return 1 }\n 2 }\nf(1)");
    expect(doc.diagnostics).toEqual([]);
    expect(() => expectDiagnostic(doc, NO_COMMON)).toThrowError(
      "B0513 annotated call must receive the statically resolvable diagnostic",
    );
  });
});
