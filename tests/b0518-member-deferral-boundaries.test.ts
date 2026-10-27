import { describe, expect, it } from "vitest";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import { checkCompatible, withheldBinderType, type CompatType, type TypeEnv } from "../src/parser/type-compat";
import { type MemberExpr } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";
import { span } from "./helpers/invoke-seam-scaffold";
import { PARSE_REGISTRY_PATH, registryMessageOf } from "./helpers/load-row-harness";
import { readRegistry } from "./helpers/registry-oracle";

const SCHEMA = "schema R6 { xs: array<string>, note: string }";
const IMPORT = 'import { R6 } from "./p6lib.thetalib"';
const VALUE = 'let r = R6 { xs: ["a", "b"], note: "init" }';
const registry = readRegistry(["parse"]);
function message(code: string, slots: readonly (readonly [string, string])[]) {
  return registryMessageOf(registry, PARSE_REGISTRY_PATH, code, slots);
}
function parse(body: string) {
  const doc = parseDoc("---\nmode: prompt\n---\n" + body + "\n", "b0518-boundaries.theta");
  expect(doc.frontmatter).not.toBeNull();
  expect(JSON.stringify(doc.diagnostics)).not.toContain("<withheld>");
  return doc.diagnostics.map(d => ({ code: d.code, severity: d.severity, message: d.message }));
}
function nonArray(type: string) {
  const code = "theta/parse/non-array-iterand";
  return [{ code, severity: "error", message: message(code, [["<type>", type]]) }];
}

// These are distinct exact oracles, not old/new alternatives: imported fields
// are withheld; known local fields are judged. The original red witnesses stay
// untouched in their own files.
describe("B0518 unavailable-member source boundaries", () => {
  it("Q1 defers the imported string-to-integer let; Q2 judges the local field", () => {
    expect(parse(`${IMPORT}\n${VALUE}\nlet n: integer = r.note`)).toEqual([]);
    const code = "theta/parse/let-rhs-type-mismatch";
    expect(parse(`${SCHEMA}\n${VALUE}\nlet n: integer = r.note`)).toEqual([{
      code, severity: "error", message: message(code, [["<name>", "n"], ["<expected>", "integer"], ["<actual>", "string"]]),
    }]);
  });
  for (const loop of ["for", "par for"]) {
    it(`${loop}: imported string defers; local string remains a static refusal`, () => {
      const tail = `${loop} x in r.note { let seen = x }\n1`;
      expect(parse(`${IMPORT}\n${VALUE}\n${tail}`)).toEqual([]);
      expect(parse(`${SCHEMA}\n${VALUE}\n${tail}`)).toEqual(nonArray("string"));
    });
    it(`${loop}: imported enum defers; recognised local enum remains non-array`, () => {
      const tail = `${loop} x in Sev.Low { let seen = x }\n1`;
      expect(parse(`import { Sev } from "./p6lib.thetalib"\n${tail}`)).toEqual([]);
      expect(parse(`enum Sev { Low }\n${tail}`)).toEqual(nonArray("Sev"));
    });
  }
  it("renamed import, local alias and member-through-binding preserve unavailable provenance", () => {
    expect(parse('import { R6 as Renamed } from "./p6lib.thetalib"\nschema Alias = Renamed\nlet r: Alias = Renamed { xs: ["a"], note: "n" }\nlet xs = r.xs\nfor x in xs { let seen = x }\n1')).toEqual([]);
  });
  it("nested unavailable member does not adopt a colliding field-name declaration", () => {
    expect(parse(`${IMPORT}\nschema Xs = integer\n${VALUE}\nfor x in r.child.Xs { let seen = x }\n1`)).toEqual([]);
  });
  it("an undeclared receiver still has its independent exact name error", () => {
    const code = "theta/parse/unknown-identifier";
    expect(parse("for x in missing.xs { let seen = x }\n1")).toEqual([{
      code, severity: "error", message: message(code, [["<name>", "missing"]]),
    }]);
  });
  it("a wrongly written nominal annotation remains an unresolved type error", () => {
    expect(parse("let r: Missing = 1\nfor x in r.xs { let seen = x }\n1").map(d => d.code)).toEqual(["theta/parse/unresolved-named-type"]);
  });
});

describe("B0518 nested inference boundaries", () => {
  const inference = () => new StaticTypeInferencePass({ checkCompatible, enumNames: new Set(), fnCallReturnTypes: new Map() });
  const inner: MemberExpr = { kind: "member", target: { kind: "ident", name: "r", range: span() }, field: "child", range: span() };
  const node: MemberExpr = { kind: "member", target: inner, field: "xs", range: span() };
  it("propagates the factory marker through nested reads, aliases and bindings", () => {
    const env: TypeEnv = {
      Alias: { kind: "alias", rhs: { kind: "named", name: "Imported" } },
      xs: { kind: "alias", rhs: { kind: "prim", name: "integer" } },
    };
    const bindings = new Map<string, CompatType>([["r", { kind: "named", name: "Alias" }]]);
    const pass = inference();
    expect(pass.typeOf(inner, env, bindings)).toEqual(withheldBinderType("unavailable-member"));
    expect(pass.typeOf(node, env, bindings)).toEqual(withheldBinderType("unavailable-member"));
    expect(pass.declaredFieldType(node, env, bindings)).toBeUndefined();
  });
  it("keeps local nested fields and aliases precise", () => {
    const env: TypeEnv = {
      Root: { kind: "object-schema", fields: { child: { kind: "named", name: "ChildAlias" } } },
      ChildAlias: { kind: "alias", rhs: { kind: "named", name: "Child" } },
      Child: { kind: "object-schema", fields: { xs: { kind: "array", element: { kind: "prim", name: "string" } } } },
    };
    const bindings = new Map<string, CompatType>([["r", { kind: "named", name: "Root" }]]);
    const expected = { kind: "array", element: { kind: "prim", name: "string" } };
    expect(inference().typeOf(node, env, bindings)).toEqual(expected);
    expect(inference().declaredFieldType(node, env, bindings)).toEqual(expected);
  });
});
