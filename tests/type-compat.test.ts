import { describe, expect, it } from "vitest";
import {
  checkCommonType,
  checkCompatible,
  checkFnArgCompat,
  checkLetRhsCompat,
  type CompatType,
  type NamedDecl,
  type TypeEnv,
} from "../src/parser/type-compat";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";

// V2b-T — failing tests for the paired `V2b` "type-compatibility engine (`⊑`)".
//
// Spec: type-system.md §"Type compatibility" (TYPE-1…TYPE-11) and
// schema-subset.md (the lowering/`additionalProperties:false` exact-field-set
// property TYPE-8 relies on). The relation `T₁ ⊑ T₂` is the single normative
// compatibility relation; the structural cases the parser must recognise
// without falling back to AJV are closed for loom 1.0.
//
// The engine is asserted against the standalone `checkCompatible` relation seam
// and the three per-site diagnostic seams (`checkLetRhsCompat`,
// `checkFnArgCompat`, `checkCommonType`) of src/parser/type-compat.ts.
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md) per the *Diagnostic message anchors*
// rule, each test citing its diagnostic code inline.
//
// These tests red because the V2b compatibility engine is absent: the relation
// seam returns the inert `"unknown"` sentinel (which equals none of the
// expected `"compatible"` / `"incompatible"` / `"integer-narrowing"` outcomes,
// so every relation test reds on its own primary assertion) and every per-site
// diagnostic seam returns no diagnostics (so each mismatch test reds on its
// own absent-diagnostic assertion). No test reds on a compile error, a missing
// fixture, or a harness throw.

// --- CompatType builders (test-local) -------------------------------------

function prim(name: "string" | "number" | "integer" | "boolean" | "null"): CompatType {
  return { kind: "prim", name };
}
function lit(typesAs: "string" | "number" | "integer" | "boolean" | "null"): CompatType {
  return { kind: "literal", typesAs };
}
function named(name: string): CompatType {
  return { kind: "named", name };
}
function arr(element: CompatType): CompatType {
  return { kind: "array", element };
}
function union(...arms: CompatType[]): CompatType {
  return { kind: "union", arms };
}
function obj(...fields: { name: string; type: CompatType }[]): CompatType {
  return { kind: "object", fields };
}
function field(name: string, type: CompatType): { name: string; type: CompatType } {
  return { name, type };
}

const EMPTY_ENV: TypeEnv = {};

/** A throwaway 1:1–1:2 span for the per-site seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
function site(): { file: string; range: SourceRange } {
  return { file: "test.loom", range: span() };
}
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

// --- TYPE-1 — reflexivity -------------------------------------------------

describe("V2b-T — TYPE-1 reflexivity", () => {
  it("TYPE-1: `T ⊑ T` holds for an identical primitive", () => {
    expect(checkCompatible(prim("string"), prim("string"), EMPTY_ENV)).toBe("compatible");
  });

  it("TYPE-1: `T ⊑ T` holds for an identical named (object) schema", () => {
    const env: TypeEnv = { Cat: { kind: "object-schema" } };
    expect(checkCompatible(named("Cat"), named("Cat"), env)).toBe("compatible");
  });
});

// --- TYPE-2 — integer ⊑ number, one-way -----------------------------------

describe("V2b-T — TYPE-2 integer/number widening", () => {
  it("TYPE-2: `integer ⊑ number` holds (one-way widening)", () => {
    expect(checkCompatible(prim("integer"), prim("number"), EMPTY_ENV)).toBe("compatible");
  });

  it("TYPE-2: the reverse `number ⊑ integer` is the integer-narrowing case", () => {
    expect(checkCompatible(prim("number"), prim("integer"), EMPTY_ENV)).toBe(
      "integer-narrowing",
    );
  });

  it("TYPE-2 (loom/parse/integer-narrowing): a `number` RHS under an `integer` annotation fires", () => {
    const diags = checkLetRhsCompat({
      name: "x",
      annotation: prim("integer"),
      rhs: prim("number"),
      env: EMPTY_ENV,
      site: site(),
    });
    const d = withCode(diags, "loom/parse/integer-narrowing");
    expect(d, "loom/parse/integer-narrowing for number-under-integer").toBeDefined();
    // Message from code-registry-parse.md.
    expect(d?.message).toBe("cannot narrow number to integer");
  });
});

// --- TYPE-3 — literal-to-primitive ----------------------------------------

describe("V2b-T — TYPE-3 literal-to-primitive", () => {
  it('TYPE-3: `"validation" ⊑ string` holds', () => {
    expect(checkCompatible(lit("string"), prim("string"), EMPTY_ENV)).toBe("compatible");
  });

  it("TYPE-3: `42 ⊑ integer` and `42 ⊑ number` both hold; `true ⊑ boolean`, `null ⊑ null`", () => {
    expect(checkCompatible(lit("integer"), prim("integer"), EMPTY_ENV)).toBe("compatible");
    expect(checkCompatible(lit("integer"), prim("number"), EMPTY_ENV)).toBe("compatible");
    expect(checkCompatible(lit("boolean"), prim("boolean"), EMPTY_ENV)).toBe("compatible");
    expect(checkCompatible(lit("null"), prim("null"), EMPTY_ENV)).toBe("compatible");
  });

  it("TYPE-3: a literal is not compatible with an unrelated primitive", () => {
    expect(checkCompatible(lit("string"), prim("number"), EMPTY_ENV)).toBe("incompatible");
  });
});

// --- TYPE-4 — variant-to-union --------------------------------------------

describe("V2b-T — TYPE-4 variant-to-union", () => {
  // schema U = A | B  (a discriminated union of two named object schemas).
  const env: TypeEnv = {
    A: { kind: "object-schema" },
    B: { kind: "object-schema" },
    U: { kind: "alias", rhs: union(named("A"), named("B")) },
  };

  it("TYPE-4: a declared variant satisfies `A ⊑ U` for its declaring union", () => {
    expect(checkCompatible(named("A"), named("U"), env)).toBe("compatible");
  });

  it("TYPE-4: a non-member named schema is not `⊑` the union", () => {
    const envC: TypeEnv = { ...env, C: { kind: "object-schema" } };
    expect(checkCompatible(named("C"), named("U"), envC)).toBe("incompatible");
  });
});

// --- TYPE-5 — union widening ----------------------------------------------

describe("V2b-T — TYPE-5 union widening", () => {
  it("TYPE-5: `T ⊑ T | U` holds (widening into an anonymous union)", () => {
    expect(
      checkCompatible(prim("string"), union(prim("string"), prim("number")), EMPTY_ENV),
    ).toBe("compatible");
  });

  it("TYPE-5: widening fails when the type is no arm of the union", () => {
    expect(
      checkCompatible(prim("boolean"), union(prim("string"), prim("number")), EMPTY_ENV),
    ).toBe("incompatible");
  });
});

// --- TYPE-6 — union-distributive ------------------------------------------

describe("V2b-T — TYPE-6 union-distributive", () => {
  it("TYPE-6: `T₁ | T₂ ⊑ T₃` holds iff each arm is `⊑ T₃`", () => {
    // integer | string ⊑ number | string : integer⊑number, string⊑string.
    expect(
      checkCompatible(
        union(prim("integer"), prim("string")),
        union(prim("number"), prim("string")),
        EMPTY_ENV,
      ),
    ).toBe("compatible");
  });

  it("TYPE-6: it fails when one arm is not `⊑ T₃`", () => {
    // boolean | string ⊑ number | string : boolean⊑(number|string) fails.
    expect(
      checkCompatible(
        union(prim("boolean"), prim("string")),
        union(prim("number"), prim("string")),
        EMPTY_ENV,
      ),
    ).toBe("incompatible");
  });
});

// --- TYPE-7 — element-wise on arrays --------------------------------------

describe("V2b-T — TYPE-7 array element-wise covariance", () => {
  it("TYPE-7: `array<T₁> ⊑ array<T₂>` holds iff `T₁ ⊑ T₂` (covariant)", () => {
    expect(checkCompatible(arr(prim("integer")), arr(prim("number")), EMPTY_ENV)).toBe(
      "compatible",
    );
  });

  it("TYPE-7: it fails when the element types are incompatible", () => {
    expect(checkCompatible(arr(prim("string")), arr(prim("number")), EMPTY_ENV)).toBe(
      "incompatible",
    );
  });
});

// --- TYPE-8 — field-wise on inline object types ---------------------------

describe("V2b-T — TYPE-8 inline-object field-wise compatibility", () => {
  it("TYPE-8: same field set, field-wise `⊑`, order irrelevant", () => {
    const sub = obj(field("a", prim("integer")), field("b", prim("string")));
    const sup = obj(field("b", prim("string")), field("a", prim("number")));
    expect(checkCompatible(sub, sup, EMPTY_ENV)).toBe("compatible");
  });

  it("TYPE-8: a field type mismatch breaks compatibility", () => {
    const sub = obj(field("a", prim("boolean")));
    const sup = obj(field("a", prim("number")));
    expect(checkCompatible(sub, sup, EMPTY_ENV)).toBe("incompatible");
  });

  it("TYPE-8: an extra declared field (no excess-property widening) breaks compatibility", () => {
    // additionalProperties:false ⇒ exact field set; an extra field never widens.
    const sub = obj(field("a", prim("integer")), field("b", prim("string")));
    const sup = obj(field("a", prim("number")));
    expect(checkCompatible(sub, sup, EMPTY_ENV)).toBe("incompatible");
  });
});

// --- TYPE-9 — per-site parse-time mismatch codes --------------------------

describe("V2b-T — TYPE-9 per-site mismatch codes", () => {
  it("TYPE-9 (loom/parse/let-rhs-type-mismatch): a typed `let` RHS mismatch fires", () => {
    const diags = checkLetRhsCompat({
      name: "x",
      annotation: prim("integer"),
      rhs: prim("string"),
      env: EMPTY_ENV,
      site: site(),
    });
    const d = withCode(diags, "loom/parse/let-rhs-type-mismatch");
    expect(d, "loom/parse/let-rhs-type-mismatch for string-under-integer").toBeDefined();
    // Message from code-registry-parse.md.
    expect(d?.message).toBe(
      "let binding 'x' initialiser type mismatch: expected integer, got string",
    );

    // A compatible RHS raises no mismatch.
    const ok = checkLetRhsCompat({
      name: "x",
      annotation: prim("number"),
      rhs: prim("integer"),
      env: EMPTY_ENV,
      site: site(),
    });
    expect(
      withCode(ok, "loom/parse/let-rhs-type-mismatch"),
      "a compatible RHS raises no let-rhs mismatch",
    ).toBeUndefined();
  });

  it("TYPE-9 (loom/parse/fn-arg-type-mismatch): a plain `fn` argument mismatch fires", () => {
    const diags = checkFnArgCompat({
      fnName: "f",
      index: 0,
      paramName: "n",
      paramType: prim("number"),
      argType: prim("string"),
      env: EMPTY_ENV,
      site: site(),
    });
    const d = withCode(diags, "loom/parse/fn-arg-type-mismatch");
    expect(d, "loom/parse/fn-arg-type-mismatch for string-under-number").toBeDefined();
    // Message from code-registry-parse.md.
    expect(d?.message).toBe(
      "fn 'f' argument 0 ('n') type mismatch: expected number, got string",
    );
  });

  it("TYPE-9 (loom/parse/array-element-type-mismatch): a branch fails against an in-scope sink", () => {
    // Ternary/array common-type against a sink: a `string` branch under a
    // `number` element sink fails at its index.
    const diags = checkCommonType({
      branches: [prim("number"), prim("string")],
      sink: prim("number"),
      env: EMPTY_ENV,
      site: site(),
    });
    const d = withCode(diags, "loom/parse/array-element-type-mismatch");
    expect(d, "loom/parse/array-element-type-mismatch at the failing branch").toBeDefined();
    // Message from code-registry-parse.md.
    expect(d?.message).toBe(
      "array element type mismatch at index 1: expected number, got string",
    );
  });

  it("TYPE-9 (loom/parse/array-no-common-type): no sink and no common type fires", () => {
    const diags = checkCommonType({
      branches: [prim("string"), prim("boolean")],
      sink: undefined,
      env: EMPTY_ENV,
      site: site(),
    });
    const d = withCode(diags, "loom/parse/array-no-common-type");
    expect(d, "loom/parse/array-no-common-type for two unrelated branches").toBeDefined();
    // Message from code-registry-parse.md.
    expect(d?.message).toBe(
      "array elements have no common type; annotate the binding with array<A | B> or use a single schema",
    );
  });
});

// --- TYPE-10 — object-schema named types are nominal ----------------------

describe("V2b-T — TYPE-10 nominal object schemas", () => {
  const env: TypeEnv = {
    Cat: { kind: "object-schema" },
    Dog: { kind: "object-schema" },
  };

  it("TYPE-10: two distinct named object schemas are not `⊑` (name identity, not shape)", () => {
    expect(checkCompatible(named("Cat"), named("Dog"), env)).toBe("incompatible");
  });

  it("TYPE-10: a named schema is not `⊑` an inline object of the same shape", () => {
    const inline = obj(field("name", prim("string")));
    expect(checkCompatible(named("Cat"), inline, env)).toBe("incompatible");
  });

  it("TYPE-10: an inline object is not `⊑` a named schema of the same shape", () => {
    const inline = obj(field("name", prim("string")));
    expect(checkCompatible(inline, named("Cat"), env)).toBe("incompatible");
  });
});

// --- TYPE-11 — alias-schema transparency ----------------------------------

describe("V2b-T — TYPE-11 alias-schema transparency", () => {
  it('TYPE-11: `"low" ⊑ Severity` for `schema Severity = "low" | "medium" | "high"`', () => {
    // Severity is a type-alias over a literal union; the literal unfolds against
    // the literal union via TYPE-3/TYPE-5/TYPE-6.
    const env: TypeEnv = {
      Severity: { kind: "alias", rhs: union(lit("string"), lit("string"), lit("string")) },
    };
    expect(checkCompatible(lit("string"), named("Severity"), env)).toBe("compatible");
  });

  it("TYPE-11: `StringOrNumber ⊑ string | number` for `schema StringOrNumber = string | number`", () => {
    const env: TypeEnv = {
      StringOrNumber: { kind: "alias", rhs: union(prim("string"), prim("number")) },
    };
    expect(
      checkCompatible(named("StringOrNumber"), union(prim("string"), prim("number")), env),
    ).toBe("compatible");
  });

  it("TYPE-11: aliasing an object schema unfolds to it and re-enters TYPE-10's nominal case", () => {
    // schema Y = Cat (Cat an object schema). Y unfolds to the named object
    // schema Cat, which is nominal — so Y is NOT `⊑` an inline object of the
    // same shape.
    const objSchema: NamedDecl = { kind: "object-schema" };
    const env: TypeEnv = {
      Cat: objSchema,
      Y: { kind: "alias", rhs: named("Cat") },
    };
    const inline = obj(field("name", prim("string")));
    expect(checkCompatible(named("Y"), inline, env)).toBe("incompatible");

    // …but Y reflexively against Cat holds (the unfold reaches the same name).
    expect(checkCompatible(named("Y"), named("Cat"), env)).toBe("compatible");
  });
});
