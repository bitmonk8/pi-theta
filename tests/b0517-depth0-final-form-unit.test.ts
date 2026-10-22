// Bug 0517 isolation: a distinct final expression form is ThetaBody.tail,
// regardless of source-line packing or continuation-joined logical lines.
// Contract: docs/bugs/0517 §Approved ruling; grammar §Blocks; FN-5; QRY-19.
// These are offline unit/composition probes, NOT substitutes for the unchanged
// real-child and live witnesses. Host/session seams are doubles in belt probes.
import { describe, expect, it } from "vitest";
import { lexTheta } from "../src/lexer/lexer";
import { BodyParser } from "../src/parser/body-parser";
import { parseThetaDocument, type Block, type ThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";
import { makeBeltProbes } from "./helpers/runtime-belt-probe-harness";

const PATH = "b0517-unit.theta";
const FM = "---\nmode: prompt\n---\n";
const PURE = 'fn pure(s: string): string { "v:" + s }\n';
const QUERY_DISCARD = "theta/parse/discarded-query-result";

function lex(src: string) {
  const result = lexTheta({ path: PATH, bytes: new TextEncoder().encode(src) }, parseDeps().systemNote);
  expect(result.diagnostics, "unit fixture must lex cleanly").toEqual([]);
  return result.tokens;
}

function rawBody(src: string): Block {
  const parser = new BodyParser(lex(src), PATH, src);
  const body = parser.parseBody();
  expect(parser.diagnostics, "well-formed fixture must parse without recovery diagnostics").toEqual([]);
  return body;
}

function document(src: string): ThetaDocument {
  return parseThetaDocument({ path: PATH, bytes: new TextEncoder().encode(FM + src) }, parseDeps());
}

function cleanDocument(src: string): ThetaDocument {
  const doc = document(src);
  expect(doc.diagnostics, "runtime fixture must pass the whole-document checks").toEqual([]);
  return doc;
}

function shape(body: Block): string {
  return `tail=${body.tail?.kind ?? "null"} statements=[${body.statements.map((s) => s.kind).join(",")}]`;
}

// Owner-authorized frozen-oracle repair: see witness-repair-1.md in the
// recorded 0517 run. Unary operators use BinaryExpr plus this marker, not a
// separate unary AST kind; pin the complete !true lowering, not just its kind.
function expectUnaryNotTrueTail(body: Block): void {
  expect(body.tail, "!true tail must preserve the established unary lowering").toMatchObject({
    kind: "binary",
    unary: true,
    op: "!",
    left: { kind: "null" },
    right: { kind: "bool", value: true },
  });
}

const strict = makeBeltProbes(cleanDocument, "b0517unit");

// The lexer is behaving as specified, not corrupting a boundary. Assert the
// precise token before the final form, including source coordinates retained
// even when the logical-line separator has been swallowed.
describe("bug 0517 lexer controls", () => {
  it.each([
    { name: "own-line control", src: '42\npure("a")', before: "stmt-sep", line: 2 },
    { name: "trailing > joins lines", src: 'schema X = array<integer>\npure("a")', before: "punct", line: 2 },
    { name: "packed source line", src: '42 pure("a")', before: "number", line: 1 },
  ])("$name retains the final call as distinct tokens", ({ src, before, line }) => {
    const tokens = lex(src);
    const at = tokens.findIndex((t) => t.text === "pure");
    expect(at, "final call must survive tokenization").toBeGreaterThan(0);
    expect(tokens[at]?.range.start.line).toBe(line);
    expect(tokens[at - 1]?.kind).toBe(before);
    if (before === "punct") expect(tokens[at - 1]?.text).toBe(">");
  });
});

describe("bug 0517 raw BodyParser final-form promotion", () => {
  it("healthy own-line control promotes a call", () => {
    expect(shape(rawBody(`${PURE}42\npure("a")`))).toBe("tail=call statements=[fn,expr]");
  });

  it("healthy own-line control preserves the unary tail representation", () => {
    const body = rawBody("42\n!true");
    expect(shape(body)).toBe("tail=binary statements=[expr]");
    expectUnaryNotTrueTail(body);
  });

  it.each([
    { name: "alias-joined call", src: `${PURE}schema X = array<integer>\npure("a")`, expected: "tail=call statements=[fn,schema]" },
    { name: "packed call", src: `${PURE}42 pure("a")`, expected: "tail=call statements=[fn,expr]" },
    { name: "alias-joined invoke", src: 'schema X = array<integer>\ninvoke<string>("child.theta")', expected: "tail=invoke statements=[schema]" },
    { name: "alias-joined query", src: 'schema X = array<integer>\n@`ask something`', expected: "tail=query statements=[schema]" },
    { name: "packed scalar", src: "42 43", expected: "tail=number statements=[expr]" },
    { name: "alias-joined scalar", src: "schema X = array<integer>\n7", expected: "tail=number statements=[schema]" },
    { name: "alias-joined array", src: "schema X = array<integer>\n[1, 2]", expected: "tail=array statements=[schema]" },
    { name: "alias-joined unary", src: "schema X = array<integer>\n!true", expected: "tail=binary statements=[schema]" },
  ])("$name promotes the final expression, not its statement wrapper", ({ name, src, expected }) => {
    const body = rawBody(src);
    expect(shape(body), "bug 0517: raw final expression must occupy ThetaBody.tail").toBe(expected);
    if (name === "alias-joined unary") expectUnaryNotTrueTail(body);
  });

  it("a final let remains a statement with no tail", () => {
    expect(shape(rawBody("42 let x = 1"))).toBe("tail=null statements=[expr,let]");
  });
});

describe("bug 0517 query diagnostic consequence", () => {
  it.each(["@`ask something`", "@<X>`ask something`"])("alias-joined final %s is not a discarded statement", (query) => {
    const doc = document(`schema X = array<integer>\n${query}`);
    expect(
      doc.diagnostics.map((d) => d.code),
      "bug 0517: final query is a tail value, not a QRY-19 discard",
    ).toEqual([]);
    expect(shape(doc.body)).toBe("tail=query statements=[schema]");
  });

  it("own-line final query is already a clean tail", () => {
    const doc = cleanDocument("42\n@`ask something`");
    expect(shape(doc.body)).toBe("tail=query statements=[expr]");
  });

  it("a genuinely non-final bare query still draws QRY-19", () => {
    const doc = document("@`ask something`\n42");
    expect(doc.diagnostics.map((d) => d.code)).toEqual([QUERY_DISCARD]);
    expect(shape(doc.body)).toBe("tail=number statements=[query]");
  });
});

// Promotion must not erase declaration refusals or consume more syntax. The
// malformed cases are controls, not permission to re-pin old tests in diagnose.
describe("bug 0517 malformed declaration controls", () => {
  it("same-line alias residue retains its exact refusal and range", () => {
    const doc = document("schema Cat { name: string }\nschema X = Cat 42");
    expect(doc.diagnostics.map((d) => d.code)).toEqual(["theta/parse/malformed-alias-rhs"]);
    // splitFrontmatter blanks the three fence/YAML lines, preserving file coordinates.
    expect(doc.diagnostics[0]?.range).toEqual({ start: { line: 5, column: 16 }, end: { line: 5, column: 18 } });
    const alias = doc.body.statements.find((s) => s.kind === "schema" && s.name === "X");
    expect(alias?.kind === "schema" ? alias.aliasRhsRefused : undefined).toBe(true);
  });

  it("empty alias RHS before invoke retains empty-schema-body", () => {
    const doc = document('schema X =\ninvoke<string>("child.theta")');
    expect(doc.diagnostics.map((d) => d.code)).toEqual(["theta/parse/empty-schema-body"]);
    expect(doc.body.statements[0]?.kind).toBe("schema");
  });
});

describe("bug 0517 executor consequence", () => {
  it.each([
    { name: "alias-joined call", suffix: 'schema X = array<integer>\npure("a")' },
    { name: "packed call", suffix: '42 pure("a")' },
    { name: "healthy own-line control", suffix: '42\npure("a")' },
  ])("$name returns the final call's value", async ({ suffix }) => {
    const probe = await strict.probeSource(PURE + suffix);
    if (probe.kind === "threw") throw probe.thrown;
    expect(probe.execution.outcome).toBe("success");
    expect(probe.execution.result.value, "bug 0517: unit drive must retain final call value").toBe("v:a");
  });

  it.each([
    { encoding: "tail", expected: "v:a" },
    { encoding: "tool-call", expected: null },
    { encoding: "expr", expected: "v:a" },
  ])("encoding control: $encoding yields $expected", async ({ encoding, expected }) => {
    // A test-only AST counterfactual isolates executeBlock from the parser's
    // promotion decision. Start from a clean own-line tail and relocate the
    // SAME call into each encoding. No production parser/source is patched.
    const probes = makeBeltProbes((src) => {
      const doc = cleanDocument(src);
      const call = doc.body.tail;
      if (call?.kind !== "call") throw new Error("encoding control requires a call tail");
      if (encoding === "tail") return doc;
      const body: Block = {
        statements: [
          ...doc.body.statements,
          encoding === "tool-call"
            ? { kind: "tool-call", call, range: call.range }
            : { kind: "expr", expr: call, range: call.range },
        ],
        tail: null,
      };
      return { ...doc, body };
    }, "b0517encoding");
    const probe = await probes.probeSource(`${PURE}42\npure("a")`);
    if (probe.kind === "threw") throw probe.thrown;
    expect(probe.execution.outcome).toBe("success");
    expect(probe.execution.result.value).toBe(expected);
  });

  it("the generic expr-statement fallback masks the scalar's missing tail", async () => {
    const probe = await strict.probeSource("42 43");
    if (probe.kind === "threw") throw probe.thrown;
    expect(probe.execution.outcome).toBe("success");
    expect(probe.execution.result.value).toBe(43);
  });
});
