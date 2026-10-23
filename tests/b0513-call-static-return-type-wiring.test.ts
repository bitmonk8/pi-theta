// Focused map/pass tests. Source parsing supplies real declarations/binders;
// these tests do not claim disk loading, provider or runtime projection proof.
import { describe, expect, it } from "vitest";
import { collectFnCallReturnTypes } from "../src/parser/fn-call-return-types";
import { collectLocalBinderNames } from "../src/parser/local-binders";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import { checkCompatible } from "../src/parser/type-compat";
import type { CallExpr } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

const P = "---\nmode: prompt\n---\n";
function table(source: string, params: readonly string[] = []) {
  const doc = parseDoc(P + source);
  expect(doc.diagnostics, "valid source reaches map collection without unrelated errors").toEqual([]);
  return collectFnCallReturnTypes(doc.body.statements, collectLocalBinderNames(doc.body, params));
}
const range = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
const call: CallExpr = { kind: "call", callee: "g", args: [], range };

describe("B0513 written-return map and proof boundary", () => {
  for (const [name, binder] of [
    ["typed let", "let g: integer = 1"],
    ["untyped let", "let g = 1"],
    ["fn parameter", "fn h(g) { 1 }"],
    ["for variable", "for g in [1] { let ignored = 1 }"],
    ["par-for variable", "let xs = par for g in [1] { 1 }"],
    ["match binder", "let x = match Ok(1) { Ok(g) => 1, Err(e) => 0 }"],
  ]) {
    it(`withholds a whole-file ${name} shadow without inventing lexical precision`, () => {
      expect([...table(`fn g(): string { "a" }\n${binder}\n1\n`)]).toEqual([]);
    });
  }
  it("withholds a frontmatter-name seed", () => {
    expect([...table('fn g(): string { "a" }\n1\n', ["g"])]).toEqual([]);
  });
  it("collects hoisted ordinary returns, not absent/subagent/imported returns", () => {
    const types = table('let x = g()\nfn g(): string { "a" }\nfn unknown() { 1 }\nsubagent fn sf(): string { "a" }\n1\n');
    expect([...types]).toEqual([["g", { kind: "prim", name: "string" }]]);
  });
  it("keeps the shared converter's schema/Result/inline-object opacity", () => {
    const types = table('schema Item { a: string }\nfn g(): Item { Item { a: "a" } }\nfn r(): Result<string, QueryError> { Ok("a") }\nfn o(): { a: string } { Item { a: "a" } }\n1\n');
    expect([...types]).toEqual([
      ["g", { kind: "named", name: "Item" }],
      ["r", { kind: "named", name: "Result<string,QueryError>" }],
      ["o", { kind: "named", name: "{ a: string }" }],
    ]);
  });
  it("invalid written annotation ASTs are withheld; trimmed ordinary void is literal null", () => {
    const doc = parseDoc(P + 'fn g(): string { "a" }\n1\n');
    const declaration = doc.body.statements.find(s => s.kind === "fn");
    if (declaration?.kind !== "fn") throw new Error("missing declaration");
    expect([...collectFnCallReturnTypes([{ ...declaration, returnType: "string--" }], new Set())]).toEqual([]);
    expect([...collectFnCallReturnTypes([{ ...declaration, returnType: " void " }], new Set())])
      .toEqual([["g", { kind: "literal", typesAs: "null" }]]);
  });
  it("ordinary reduced types improve but proof members remain withheld; runtime tools retain priority", () => {
    const types = table('fn g(): string { "a" }\n1\n');
    const pass = new StaticTypeInferencePass({ checkCompatible, enumNames: new Set(), fnCallReturnTypes: types });
    expect(pass.typeOf(call, {})).toEqual({ kind: "prim", name: "string" });
    expect(pass.collectProvableArgTypes(call, {})).toBeUndefined();
    const runtime = new StaticTypeInferencePass({ checkCompatible, enumNames: new Set(), fnCallReturnTypes: types,
      runtimeToolSuccessTypes: new Map([["g", { kind: "prim", name: "integer" }]]) });
    expect(runtime.typeOf(call, {})).toEqual({ kind: "named", name: "Result<integer, QueryError>" });
    expect(runtime.collectProvableArgTypes(call, {})).toBeUndefined();
  });
});
