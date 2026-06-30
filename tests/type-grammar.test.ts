import { describe, expect, it } from "vitest";
import {
  type ArraySinkContext,
  checkArrayCommonType,
  parseTypeExpression,
  type TypePosition,
} from "../src/parser/type-grammar";
import {
  checkLiteralSublanguage,
  checkObjectLiteralFields,
  type LiteralPosition,
} from "../src/parser/literal-sublanguage";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";

// V2a-T — failing tests for the paired `V2a` "type grammar and loom literal
// sublanguage" implementation.
//
// Spec: grammar.md §"Type grammar" (the closed `GenericType` arity set —
// `array` arity 1, `Result` arity 2 — the return-only `void` annotation, and
// the `Result`-in-lowered-schema-position rule), grammar.md §"Loom literal
// sublanguage" (the is-literal check and the full-field requirement),
// grammar.md §"array<T> literal type-sink rule" (the exhaustive sink set, with
// the `for` iterand explicitly excluded), and type-system.md.
//
// The type-grammar and array-sink rules need the surrounding annotation context
// the tokeniser does not carry, so they are asserted against the standalone
// `parseTypeExpression` / `checkArrayCommonType` seams (src/parser/type-grammar.ts).
// The literal-sublanguage rules are asserted against the
// `checkLiteralSublanguage` / `checkObjectLiteralFields` seams
// (src/parser/literal-sublanguage.ts).
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md) per the *Diagnostic message anchors*
// rule.
//
// These tests red because the V2a type-expression parser, is-literal check, and
// array-sink resolution are absent: every seam is an inert stub returning no
// diagnostics. Each test reds on its own primary assertion (an absent expected
// diagnostic), not on a compile error, missing fixture, or harness throw.

/** A throwaway 1:1–1:2 span for the parse-context seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A located site at the throwaway span. */
function site(): { file: string; range: SourceRange } {
  return { file: "test.loom", range: span() };
}

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

// --- grammar.md §"Type grammar" — generic-application arity ---------------

describe("V2a-T — generic-type arity (loom/parse/generic-arity-mismatch)", () => {
  it("loom/parse/generic-arity-mismatch: `array<T, U>` (arity 1 applied with 2) fires", () => {
    const value: TypePosition = "value";
    const diags = parseTypeExpression("array<string, number>", value, site());
    const d = withCode(diags, "loom/parse/generic-arity-mismatch");
    expect(d, "loom/parse/generic-arity-mismatch for array<T, U>").toBeDefined();
    // Message template `generic type '<ctor>' expects <expected> type
    // argument(s); got <actual>` from code-registry-parse.md.
    expect(d?.message).toBe(
      "generic type 'array' expects 1 type argument(s); got 2",
    );
  });

  it("loom/parse/generic-arity-mismatch: `Result<T>` (arity 2 applied with 1) fires", () => {
    const value: TypePosition = "value";
    const diags = parseTypeExpression("Result<string>", value, site());
    const d = withCode(diags, "loom/parse/generic-arity-mismatch");
    expect(d, "loom/parse/generic-arity-mismatch for Result<T>").toBeDefined();
    expect(d?.message).toBe(
      "generic type 'Result' expects 2 type argument(s); got 1",
    );
  });
});

// --- grammar.md §"Type grammar" — `void` is return-only -------------------

describe("V2a-T — void in non-return position (loom/parse/void-in-non-return-position)", () => {
  it("loom/parse/void-in-non-return-position: `void` in a value position fires; in return position it does not", () => {
    const value: TypePosition = "value";
    const diags = parseTypeExpression("void", value, site());
    const d = withCode(diags, "loom/parse/void-in-non-return-position");
    expect(d, "loom/parse/void-in-non-return-position in value position").toBeDefined();
    expect(d?.message).toBe(
      "'void' is only permitted as a function or loom return type",
    );

    // `void` is admitted in the function/loom return position.
    const ret: TypePosition = "return";
    const okDiags = parseTypeExpression("void", ret, site());
    expect(
      withCode(okDiags, "loom/parse/void-in-non-return-position"),
      "void is admitted in return position",
    ).toBeUndefined();
  });
});

// --- grammar.md §"Type grammar" — `Result` not in a schema position -------

describe("V2a-T — Result in schema position (loom/parse/result-in-schema-position)", () => {
  it("loom/parse/result-in-schema-position: `Result<T, E>` in a schema-feeding position fires; in a value position it does not", () => {
    const schemaFeeding: TypePosition = "schema-feeding";
    const diags = parseTypeExpression("Result<string, string>", schemaFeeding, site());
    const d = withCode(diags, "loom/parse/result-in-schema-position");
    expect(d, "loom/parse/result-in-schema-position in schema-feeding position").toBeDefined();
    expect(d?.message).toBe(
      "'Result' has no lowered-schema form and is not permitted in a schema-feeding position",
    );

    // `Result` remains admitted in fn/let/invoke (value) positions.
    const value: TypePosition = "value";
    const okDiags = parseTypeExpression("Result<string, string>", value, site());
    expect(
      withCode(okDiags, "loom/parse/result-in-schema-position"),
      "Result is admitted in a value position",
    ).toBeUndefined();
  });
});

// --- grammar.md §"Loom literal sublanguage" — is-literal check -------------

describe("V2a-T — literal-sublanguage violations", () => {
  it("loom/parse/default-not-literal: a non-literal `params:` default RHS (an operator form) fires", () => {
    const position: LiteralPosition = "default";
    // `a + b` is a binary-operator form — outside the unary-`-` numeric carve-out.
    const diags = checkLiteralSublanguage("a + b", position, site());
    const d = withCode(diags, "loom/parse/default-not-literal");
    expect(d, "loom/parse/default-not-literal").toBeDefined();
    // Message template prefix `params default RHS must be a literal-sublanguage
    // form; offending sub-expression: <expr>` from code-registry-parse.md.
    expect(d?.message).toMatch(
      /^params default RHS must be a literal-sublanguage form; offending sub-expression: /,
    );
  });

  it("loom/parse/tool-arg-not-literal: a non-literal Pi-tool argument (a function call) fires", () => {
    const position: LiteralPosition = "tool-arg";
    // `f(x)` is a function call — forbidden inside a literal.
    const diags = checkLiteralSublanguage("{ k: f(x) }", position, site());
    const d = withCode(diags, "loom/parse/tool-arg-not-literal");
    expect(d, "loom/parse/tool-arg-not-literal").toBeDefined();
    expect(d?.message).toMatch(
      /^Pi-tool argument must be a literal-sublanguage form; offending sub-expression: /,
    );
  });

  it("loom/parse/missing-object-field: a constructor literal omitting a declared field fires", () => {
    // `Cat` declares `name` and `age`; the literal `Cat { name: "x" }` omits `age`.
    const diags = checkObjectLiteralFields(
      { name: "Cat", fields: ["name", "age"] },
      ["name"],
      site(),
    );
    const d = withCode(diags, "loom/parse/missing-object-field");
    expect(d, "loom/parse/missing-object-field").toBeDefined();
    // Message template `missing field '<field>' on schema '<schema>'`.
    expect(d?.message).toBe("missing field 'age' on schema 'Cat'");

    // A literal supplying every declared field raises nothing.
    const okDiags = checkObjectLiteralFields(
      { name: "Cat", fields: ["name", "age"] },
      ["name", "age"],
      site(),
    );
    expect(
      withCode(okDiags, "loom/parse/missing-object-field"),
      "a full-field literal raises no missing-field diagnostic",
    ).toBeUndefined();
  });
});

// --- grammar.md §"array<T> literal type-sink rule" ------------------------

describe("V2a-T — array literal type sink (loom/parse/array-no-common-type)", () => {
  it("loom/parse/array-no-common-type: an `[]` in a `for` iterand (not a sink) fires; a binding-annotation sink resolves it", () => {
    // `for x in []` — the iterand is explicitly NOT a sink, so `[]` has no
    // resolving sink and fires (grammar.md §"array<T> literal type-sink rule").
    const forIterand: ArraySinkContext = "for-iterand";
    const d = checkArrayCommonType(forIterand, [], site());
    expect(d, "loom/parse/array-no-common-type for a for-iterand `[]`").toBeDefined();
    expect(d?.code).toBe("loom/parse/array-no-common-type");
    // Message from code-registry-parse.md.
    expect(d?.message).toBe(
      "array elements have no common type; annotate the binding with array<A | B> or use a single schema",
    );

    // A binding annotation IS a sink: `let xs: array<T> = []` resolves.
    const bindingAnnotation: ArraySinkContext = "binding-annotation";
    const ok = checkArrayCommonType(bindingAnnotation, [], site());
    expect(ok, "a binding-annotation sink resolves `[]`").toBeUndefined();
  });
});
