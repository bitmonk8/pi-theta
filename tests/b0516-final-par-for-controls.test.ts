// Bug 0516: expression eligibility must not widen StmtBlock return ownership.
// Raw lexer/parser layouts pin the unchanged line-start policy; production
// execution separately proves taken statement bodies discard their arrays.
// The production belt harness uses inert surrounding host doubles, not a
// provider or child process; frozen live registration remains separate.
import { describe, expect, it } from "vitest";
import { lexTheta } from "../src/lexer/lexer";
import { BodyParser } from "../src/parser/body-parser";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import { checkCompatible } from "../src/parser/type-compat";
import { TypeLayerWalk } from "../src/parser/type-layer-walk";
import type { Block, FnDecl, Stmt } from "../src/parser/theta-ast";
import { parseDeps } from "./helpers/e2e-s1";
import { assertValue, makeBeltProbes } from "./helpers/runtime-belt-probe-harness";

const FILE = "b0516-controls.theta";
const PAR = "par for m in [1] max 2 { 42 }";

type Position = {
  name: string;
  kind: "if" | "while" | "for";
  statement: (body: string) => string;
  select: (stmt: Stmt) => Block;
};
const positions: Position[] = [
  { name: "if-then", kind: "if", statement: (b) => `if true { ${b} }`, select: (s) => {
    if (s.kind !== "if") throw new Error("expected if statement");
    return s.then;
  } },
  { name: "else", kind: "if", statement: (b) => `if false {} else { ${b} }`, select: (s) => {
    if (s.kind !== "if" || s.otherwise === null || "kind" in s.otherwise) throw new Error("expected else block");
    return s.otherwise;
  } },
  { name: "while(false)", kind: "while", statement: (b) => `while false { ${b} }`, select: (s) => {
    if (s.kind !== "while") throw new Error("expected while statement");
    return s.body;
  } },
  { name: "for([1])", kind: "for", statement: (b) => `for k in [1] { ${b} }`, select: (s) => {
    if (s.kind !== "for") throw new Error("expected for statement");
    return s.body;
  } },
];
const layouts = [
  { name: "single", body: PAR, shape: "tail=par-for statements=[]" },
  { name: "multi", body: `let z = 1\n ${PAR}`, shape: "tail=null statements=[let,expr]" },
];
const cases = positions.flatMap((position) => layouts.map((layout) => ({
  name: `${position.name} ${layout.name}`,
  position,
  expected: layout.shape,
  source: `fn wrap() { ${position.statement(layout.body)} }\nwrap()`,
})));

function shape(block: Block): string {
  return `tail=${block.tail?.kind ?? "null"} statements=[${block.statements.map((s) => s.kind).join(",")}]`;
}
function wrapBody(body: Block): Block {
  const fn = body.statements.find((s): s is FnDecl => s.kind === "fn" && s.name === "wrap");
  if (!fn) throw new Error("fixture must declare wrap");
  return fn.body;
}
function raw(source: string): Block {
  const lexed = lexTheta({ path: FILE, bytes: new TextEncoder().encode(source) }, parseDeps().systemNote);
  expect(lexed.diagnostics, "StmtBlock control must lex cleanly").toEqual([]);
  const parser = new BodyParser(lexed.tokens, FILE, source);
  const body = parser.parseBody();
  expect(parser.diagnostics, "StmtBlock control must parse without recovery").toEqual([]);
  return body;
}
function clean(source: string): ThetaDocument {
  const doc = parseThetaDocument({
    path: FILE,
    bytes: new TextEncoder().encode(`---\nmode: prompt\n---\n${source}\n`),
  }, parseDeps());
  expect(doc.frontmatter, "runtime control frontmatter must parse").not.toBeNull();
  expect(doc.diagnostics, "runtime StmtBlock control must parse cleanly").toEqual([]);
  return doc;
}
const probes = makeBeltProbes(clean, "b0516-controls");

describe("bug 0516 StmtBlock raw layout and return ownership", () => {
  it.each(cases)("$name keeps its layout without becoming the fn return", ({ source, position, expected }) => {
    const owner = wrapBody(raw(source));
    expect(shape(owner), "the enclosing fn ends in one control-flow statement").toBe(`tail=null statements=[${position.kind}]`);
    const statement = owner.statements[0];
    if (!statement) throw new Error("fixture must contain a control-flow statement");
    expect(shape(position.select(statement)), "nested layout retains the StmtBlock promotion policy").toBe(expected);
    const inference = new StaticTypeInferencePass({ checkCompatible, enumNames: new Set(), fnCallReturnTypes: new Map() });
    const walk = new TypeLayerWalk(inference, {}, FILE, new Map(), new Map(), new Set(), new Set());
    expect(walk.inferFinalValuePayload(owner, new Map()), "a nested par-for is not the owning fn's implicit return").toEqual({
      kind: "literal", typesAs: "null",
    });
  });
});

describe("bug 0516 taken StmtBlock production discard", () => {
  // while(false) is structural/non-sink coverage only, never an endless loop.
  it.each(cases.filter((c) => c.position.kind !== "while"))("$name discards its array", async ({ source }) => {
    clean(source);
    assertValue(await probes.probeSource(source), null, "StmtBlock array must not escape as the fn value");
  });
});
