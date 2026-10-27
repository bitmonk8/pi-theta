import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { containsWithheldBinderType } from "../src/parser/compat-type-traversal";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import type { MemberExpr } from "../src/parser/theta-document";
import { collectBodyTypes } from "../src/parser/theta-document";
import { collectTypeEnv } from "../src/parser/type-layer-checks";
import { checkIterand } from "../src/parser/type-layer-iterand";
import {
  checkCompatible, enumVariantType, withheldBinderType,
  type CompatType, type TypeEnv,
} from "../src/parser/type-compat";
import { parseDoc } from "./helpers/e2e-s1";
import { span } from "./helpers/invoke-seam-scaffold";

// Focused seam isolation, not an E2E replacement. The real parser/host witnesses
// remain in b0518-imported-schema-member-iterand-e2e and H9a. With no declaration
// available in this pass's inputs, a field cannot truthfully be materialised:
// the minimal honest answer is the existing factory's withheld provenance.
// This pins the parse-only fallback; it does not prohibit a later load-phase
// field-materialisation pass, or authorize changing any existing baseline.
function pass(enumNames: readonly string[] = []) {
  return new StaticTypeInferencePass({ checkCompatible, enumNames: new Set(enumNames), fnCallReturnTypes: new Map() });
}
function member(field: string, target = "r"): MemberExpr {
  return { kind: "member", target: { kind: "ident", name: target, range: span() }, field, range: span() };
}
function check(type: CompatType, env: TypeEnv = {}) {
  const diagnostics: Diagnostic[] = [];
  checkIterand(type, { file: "b0518-unit.theta", range: span() }, env, diagnostics);
  return diagnostics.map(d => ({ code: d.code, severity: d.severity, message: d.message }));
}
function expectWithheld(type: CompatType) {
  expect(type, "B0518 unavailable member declaration must carry withheld provenance").toEqual(withheldBinderType("unavailable-member"));
  expect(type).toEqual({ kind: "named", name: "unknown", withheld: true });
  expect(containsWithheldBinderType(type)).toBe(true);
}
function rBindings(type: CompatType = { kind: "named", name: "R6" }) {
  return new Map<string, CompatType>([["r", type]]);
}
const localEnv: TypeEnv = { R6: { kind: "object-schema", fields: {
  xs: { kind: "array", element: { kind: "prim", name: "string" } },
  note: { kind: "prim", name: "string" },
  ran: { kind: "prim", name: "boolean" },
} } };

function nonArray(type: string) {
  return [{ code: "theta/parse/non-array-iterand", severity: "error", message: `'for' expects array<T> after 'in'; got ${type}` }];
}

describe("B0518 member-type provenance isolation", () => {
  it("healthy collector control: imports resolve as names but supply no parse-time field declarations", () => {
    const doc = parseDoc('---\nmode: prompt\n---\nimport { R6 } from "./p6lib.thetalib"\nlet r = R6 { xs: ["a"], note: "init", ran: false }\n1\n', "b0518-unit.theta");
    expect(doc.diagnostics).toEqual([]);
    const body = doc.body!;
    expect(body).not.toBeNull();
    expect(collectBodyTypes(body.statements, "b0518-unit.theta").bodyTypes.imports.has("R6")).toBe(true);
    expect(Object.keys(collectTypeEnv(body.statements))).toEqual([]);
  });

  for (const field of ["xs", "note", "ran"]) {
    it(`witness: unresolved R6.${field} is withheld, not confidently typed as R6`, () => {
      const inference = pass();
      const node = member(field);
      // This is NOT a known declared field, nor a provable argument type.
      expect(inference.declaredFieldType(node, {}, rBindings())).toBeUndefined();
      expect(inference.collectProvableArgTypes(node, {})).toBeUndefined();
      expectWithheld(inference.typeOf(node, {}, rBindings()));
    });
  }

  it("witness: the inferred imported member reaches the existing iterand deferral path", () => {
    const type = pass().typeOf(member("xs"), {}, rBindings());
    const diagnostics = check(type);
    expect(JSON.stringify(diagnostics), "internal sentinel must never leak into diagnostics").not.toContain("<withheld>");
    expect(diagnostics, "B0518 member-derived iterand must withhold its verdict").toEqual([]);
  });

  it("healthy control: declared local fields retain exact types and declared provenance", () => {
    const inference = pass();
    for (const field of ["xs", "note", "ran"]) {
      const node = member(field);
      const expected = localEnv.R6!.kind === "object-schema" ? localEnv.R6!.fields![field] : undefined;
      expect(inference.typeOf(node, localEnv, rBindings())).toEqual(expected);
      expect(inference.declaredFieldType(node, localEnv, rBindings())).toEqual(expected);
      expect(containsWithheldBinderType(inference.typeOf(node, localEnv, rBindings()))).toBe(false);
    }
    expect(check(inference.typeOf(member("xs"), localEnv, rBindings()), localEnv)).toEqual([]);
    expect(check(inference.typeOf(member("note"), localEnv, rBindings()), localEnv)).toEqual(nonArray("string"));
  });

  it("healthy control: local aliases unfold both receiver and declared field", () => {
    const env: TypeEnv = {
      Alias: { kind: "alias", rhs: { kind: "named", name: "R6" } },
      R6: { kind: "object-schema", fields: { xs: { kind: "named", name: "Strings" } } },
      Strings: { kind: "alias", rhs: { kind: "array", element: { kind: "prim", name: "string" } } },
    };
    const type = pass().typeOf(member("xs"), env, rBindings({ kind: "named", name: "Alias" }));
    expect(type).toEqual({ kind: "array", element: { kind: "prim", name: "string" } });
    expect(check(type, env)).toEqual([]);
  });

  it("healthy quiet-twin control: unavailable member compatibility defers for primitive and structural targets", () => {
    const type = pass().typeOf(member("note"), {}, rBindings());
    const sinks: CompatType[] = [
      { kind: "prim", name: "integer" },
      { kind: "array", element: { kind: "prim", name: "string" } },
      { kind: "object", fields: [{ name: "a", type: { kind: "prim", name: "integer" } }] },
    ];
    expect(sinks.map(sink => checkCompatible(type, sink, {}))).toEqual(["unknown", "unknown", "unknown"]);
    expect(checkCompatible(pass().typeOf(member("note"), localEnv, rBindings()), sinks[0]!, localEnv)).toBe("incompatible");
  });

  it("healthy control: declared enums keep enum provenance and reject iteration even under a schema shadow", () => {
    const env: TypeEnv = { Color: { kind: "object-schema", fields: { Red: { kind: "array", element: { kind: "prim", name: "string" } } } } };
    const node = member("Red", "Color");
    const inference = pass(["Color"]);
    for (const types of [{}, env]) {
      const type = inference.typeOf(node, types);
      expect(type).toEqual(enumVariantType("Color"));
      expect(inference.declaredFieldType(node, types)).toBeUndefined();
      expect(containsWithheldBinderType(type)).toBe(false);
      expect(check(type, types)).toEqual(nonArray("Color"));
    }
    // A bound local takes precedence over the enum name and gets its real field.
    expect(inference.typeOf(node, env, new Map([["Color", { kind: "named", name: "Color" }]]))).toEqual(env.Color!.kind === "object-schema" ? env.Color!.fields!.Red : undefined);
  });

  it("healthy residual fence: a known receiver's absent field keeps the separate closing fallback", () => {
    const env: TypeEnv = { Color: { kind: "object-schema", fields: { a: { kind: "prim", name: "string" } } }, Red: { kind: "alias", rhs: { kind: "array", element: { kind: "prim", name: "integer" } } } };
    // Bug 0191 f4: no enum, known schema, absent field; NOT the unresolved-decl arm.
    const type = pass().typeOf(member("Red", "Color"), env);
    expect(type).toEqual({ kind: "named", name: "Red" });
    expect(containsWithheldBinderType(type)).toBe(false);
    expect(pass().declaredFieldType(member("Red", "Color"), env)).toBeUndefined();
  });

  it("healthy marker control: the factory defers, a bare same-spelling nominal does not", () => {
    const minted = withheldBinderType();
    const bare: CompatType = { kind: "named", name: "<withheld>" };
    expect(containsWithheldBinderType(minted)).toBe(true);
    expect(check(minted)).toEqual([]);
    expect(containsWithheldBinderType(bare)).toBe(false);
    expect(check(bare)).toEqual(nonArray("<withheld>"));
    expect(() => expectWithheld({ kind: "named", name: "R6" })).toThrow(/B0518 unavailable member declaration must carry withheld provenance/);
  });

  it("healthy genuine-unknown control: bare identifiers still reject as non-array nominals", () => {
    const type = pass().typeOf({ kind: "ident", name: "missing", range: span() }, {});
    expect(type).toEqual({ kind: "named", name: "missing" });
    expect(check(type)).toEqual(nonArray("missing"));
  });
});
