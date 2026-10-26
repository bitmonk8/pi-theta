// Bug 0516, approved option (a): final par-for values are retained, represented
// as structural tails, and visible to return inference. Full source bytes ->
// production lexer/parser/type walk and public diagnostics, plus shipped
// producer -> executeBody for value controls. No AST or inference mocks.
// RuntimeRoot/ExtensionAPI are inert host doubles (makeBeltProbes); this file
// does NOT prove real-host discovery, provider turns or child transport. The
// live companion separately proves shipped discovery/registration behavior.
import { describe, expect, it } from "vitest";
import {
  parseThetaDocument,
  type Block,
  type FnDecl,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import { checkCompatible, type CompatType } from "../src/parser/type-compat";
import { TypeLayerWalk } from "../src/parser/type-layer-walk";
import { makeOk, type ThetaValue } from "../src/runtime/value";
import { parseDeps } from "./helpers/e2e-s1";
import { assertValue, makeBeltProbes } from "./helpers/runtime-belt-probe-harness";

const FILE = "b0516.theta";
const NO_COMMON = "theta/parse/return-no-common-type";
const MESSAGE = "return operands have no common type; annotate the function return type or reconcile the operands";
const PAR = "par for m in [1] max 2 { 42 }";
const ARRAY_TYPE = { kind: "array", element: { kind: "named", name: "Result<integer, QueryError>" } };

function parse(source: string): ThetaDocument {
  const doc = parseThetaDocument({
    path: FILE,
    bytes: new TextEncoder().encode(`---\nmode: prompt\n---\n${source}\n`),
  }, parseDeps());
  expect(doc.frontmatter, "fixture frontmatter must parse").not.toBeNull();
  expect(doc.diagnostics.filter((d) => d.severity === "error" && d.code !== NO_COMMON),
    "fixture must have no unrelated errors").toEqual([]);
  return doc;
}

function clean(source: string): ThetaDocument {
  const doc = parse(source);
  expect(doc.diagnostics, "healthy fixture must parse without diagnostics").toEqual([]);
  return doc;
}

function fnOf(doc: ThetaDocument): FnDecl {
  const fn = doc.body.statements.find((s): s is FnDecl => s.kind === "fn" && s.name === "wrap");
  if (fn === undefined) throw new Error("fixture must declare wrap");
  return fn;
}

function shape(block: Block): string {
  return `tail=${block.tail?.kind ?? "null"} statements=[${block.statements.map((s) => s.kind).join(",")}]`;
}

// Observe the real internal inference, BEFORE the cross-file adapter withholds
// nominal Result types for namespace safety (type-layer-checks.ts:409-440).
// Resolve source-declared lets through the real walk rather than fabricate scope.
function payload(block: Block): CompatType | undefined {
  const checker = new TypeLayerWalk(
    new StaticTypeInferencePass({ checkCompatible, enumNames: new Set(), fnCallReturnTypes: new Map() }),
    {}, FILE, new Map(), new Map(), new Set(), new Set(),
  );
  const bindings = new Map<string, CompatType>();
  checker.walkBlock(block, bindings, { returnScope: { kind: "inferred" } });
  return checker.inferFinalValuePayload(block, bindings);
}

const probes = makeBeltProbes(clean, "b0516");
const positions: { name: string; source: string; block: (doc: ThetaDocument) => Block; statements: string; value: ThetaValue }[] = [
  { name: "FnBody single", source: `fn wrap() { ${PAR} }\nwrap()`, block: (d) => fnOf(d).body, statements: "", value: [makeOk(42)] },
  { name: "FnBody multi", source: `fn wrap() { let z = 1\n ${PAR} }\nwrap()`, block: (d) => fnOf(d).body, statements: "let", value: [makeOk(42)] },
  { name: "ThetaBody single", source: PAR, block: (d) => d.body, statements: "", value: [makeOk(42)] },
  { name: "ThetaBody multi", source: `let z = 1\n${PAR}`, block: (d) => d.body, statements: "let", value: [makeOk(42)] },
  { name: "ThetaBody packed final form (0517)", source: `42 ${PAR}`, block: (d) => d.body, statements: "expr", value: [makeOk(42)] },
  { name: "ParForBody nested final par-for", source: `par for k in [1] max 2 { let z = 1\n ${PAR} }`, block: (d) => {
    const outer = d.body.tail ?? (d.body.statements[0]?.kind === "expr" ? d.body.statements[0].expr : null);
    if (outer?.kind !== "par-for") throw new Error("fixture must contain outer par-for");
    return outer.body;
  }, statements: "let", value: [makeOk([makeOk(42)])] },
];

describe("bug 0516 source-to-production execution and structural-tail contract", () => {
  it.each(positions)("$name retains its runtime value and becomes a structural tail", async ({ source, block, statements, value }) => {
    // Establish successful production execution BEFORE the red parse-shape assertion.
    assertValue(await probes.probeSource(source), value, "0516 approved value preservation");
    expect(shape(block(clean(source))),
      "0516 approved ruling: final par-for must be a structural tail, not a trailing expr statement",
    ).toBe(`tail=par-for statements=[${statements}]`);
  });

  it("ThetaBody return inference agrees with its actual array value", async () => {
    assertValue(await probes.probeSource(PAR), [makeOk(42)], "0516 actual array value");
    const doc = clean(PAR);
    expect(payload(doc.body),
      "0516 FN-3: final par-for payload must infer array<Result<integer, QueryError>>, not null",
    ).toEqual(ARRAY_TYPE);
  });

  it("FnBody return inference agrees with its actual array value", async () => {
    const source = `fn wrap() { let z = 1\n ${PAR} }\nwrap()`;
    assertValue(await probes.probeSource(source), [makeOk(42)], "0516 actual fn array value");
    expect(payload(fnOf(clean(source)).body),
      "0516 FN-3: final par-for payload must infer array<Result<integer, QueryError>>, not null",
    ).toEqual(ARRAY_TYPE);
  });
});

function expectIncompatible(doc: ThetaDocument): void {
  const fn = fnOf(doc);
  expect(doc.diagnostics,
    "0516 FN-3: number return versus final par-for array must emit return-no-common-type",
  ).toEqual([{ severity: "error", code: NO_COMMON, file: FILE, range: fn.range, message: MESSAGE }]);
}

describe("bug 0516 source-to-public diagnostic", () => {
  it("rejects incompatible early number return and final par-for array", () => {
    expectIncompatible(parse(`fn wrap(n: number) { if n < 0 { return 1 }\n ${PAR} }\nwrap(1)`));
  });

  it("healthy control and red direction: explicit number/array return conflict is already rejected", () => {
    expectIncompatible(parse(`fn wrap(n: number) { if n < 0 { return 1 }\n return ${PAR} }\nwrap(1)`));
    const healthy = clean(`fn wrap(n: number) { if n < 0 { return 1 }\n ${PAR}\n 1 }\nwrap(1)`);
    expect(() => expectIncompatible(healthy)).toThrowError(
      "0516 FN-3: number return versus final par-for array must emit return-no-common-type",
    );
  });
});

describe("bug 0516 healthy value/discard controls", () => {
  it.each([
    { name: "void fn keeps discard", source: `fn wrap(): void { let z = 1\n ${PAR} }\nwrap()`, value: null },
    { name: "non-final par-for is discarded", source: `fn wrap() { ${PAR}\n let z = 1 }\nwrap()`, value: null },
    { name: "StmtBlock remains discarded", source: `fn wrap() { if true { let z = 1\n ${PAR} } }\nwrap()`, value: null },
    { name: "StmtBlock adds no return contribution", source: `fn wrap(n: number) { if n > 0 { ${PAR} }\n n }\nwrap(1)`, value: 1 },
    { name: "BlockExpr already keeps its required tail", source: `let v = { let z = 1\n ${PAR} }\nv`, value: [makeOk(42)] },
    { name: "explicit let-bound tail already infers array", source: `let v = ${PAR}\nv`, value: [makeOk(42)] },
  ])("$name", async ({ source, value }) => {
    const doc = clean(source);
    assertValue(await probes.probeSource(source), value, "0516 healthy control");
    if (source.startsWith("let v =")) {
      expect(payload(doc.body)).toEqual(ARRAY_TYPE);
    }
  });
});
